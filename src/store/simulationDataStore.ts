/**
 * simulationDataStore.ts — Supabase-Synced Data Layer (Zustand)
 *
 * ADDITIVE store that runs alongside the MASTER `simulationStore.ts`.
 * This store does NOT modify any existing module — it only READS from the
 * master clocks (S-Clock, P-Clock) via `useSimulationStore.getState()`.
 *
 * Responsibilities:
 *  1. Record per-tick machine state snapshots for all 7 stations
 *  2. Track tile lifecycle: creation → station traversal → grading/scrap
 *  3. Build künye (tile passport) via tile_station_snapshots
 *  4. Log parameter change events (drift, spike, scenario-driven)
 *  5. Track defect scenario activations
 *  6. Aggregate periodic OEE/quality metrics
 *  7. Queue unsynced records for batch write to Supabase
 *
 * Architecture:
 *  The store is composed from domain slices (see `./slices/`):
 *    - sessionSlice  — session lifecycle (start, pause, resume, end, reset)
 *    - tileSlice     — tile CRUD, snapshots, conveyor movement, tile queries
 *    - scenarioSlice — scenario activation/deactivation, defect probabilities
 *    - metricsSlice  — period metrics aggregation, alarm log recording
 *    - syncSlice     — write-buffer tracking, data queries
 *
 *  This file retains the orchestration actions that span multiple slices:
 *    - tick() — the main per-tick orchestrator
 *    - recordMachineState — machine state snapshot recording
 *    - recordParameterChange / updateParameter — parameter change tracking
 *    - updateDriftLimit / resetToFactoryDefaults — parameter configuration
 *
 * Data flow:
 *   Master S-Clock tick → this store's `tick()` → record states → move tiles
 *   → check scenarios → aggregate metrics → mark for sync
 *
 * All Maps use `number` keys (sim_tick) for O(1) lookups.
 * All records carry `synced: boolean` for write-buffer tracking.
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { generateUUID } from '../lib/idGenerator';
import { useSimulationStore } from './simulationStore';
import { useWorkOrderStore } from './workOrderStore';
import { eventBus } from '../lib/eventBus';
import type {
  AnyMachineStateRecord,
  ParameterChangeRecord,
  ConveyorStateRecord,
  ConveyorEventRecord,
} from './types';
import {
  STATION_ORDER,
} from './types';
import { createDefaultParams, MAX_PARAMETER_CHANGES, DRIFT_STEP_SCALE, createDefaultConveyorParams, MAX_MACHINE_STATE_RECORDS, MAX_CONVEYOR_STATE_RECORDS, MAX_CONVEYOR_EVENT_RECORDS } from '../lib/params';
import { evaluateStationDefects } from '../lib/defectEngine';
import { getRangesForStation } from '../lib/params/parameterRanges';

// ── Slice Imports ──────────────────────────────────────────────────────────
import { createSessionSlice } from './slices/sessionSlice';
import { createTileSlice } from './slices/tileSlice';
import { createScenarioSlice } from './slices/scenarioSlice';
import { createMetricsSlice } from './slices/metricsSlice';
import { createSyncSlice } from './slices/syncSlice';
import { createTickSnapshotSlice, createTickSnapshotInitialState } from './slices/tickSnapshotSlice';

// ── Shared Helpers & Types Re-exports ──────────────────────────────────────
import {
  createEmptyMachineStateTables,
  createDefaultDriftLimits,
  createInitialMachineStatus,
  getStationParamValue,
  setStationParams,
} from './slices/storeHelpers';

// Re-export the full state type so consumers don't need to reach into slices/
export type { SimulationDataState } from './slices/storeHelpers';
export type { MachineStatus, CurrentPeriodMetrics, DefectInfo } from './slices/storeHelpers';


// =============================================================================
// STORE IMPLEMENTATION — Compose slices + orchestration actions
// =============================================================================

/**
 * The main simulation data store.
 * Composed from domain slices, plus orchestration actions that span
 * multiple slices (tick, machine state recording, parameter changes).
 */
export const useSimulationDataStore = create<
  import('./slices/storeHelpers').SimulationDataState
>()(
  subscribeWithSelector((set, get) => ({

    // ── Compose Domain Slices ──────────────────────────────────────
    ...createSessionSlice(set, get),
    ...createTileSlice(set, get),
    ...createScenarioSlice(set, get),
    ...createMetricsSlice(set, get),
    ...createSyncSlice(set, get),
    ...createTickSnapshotSlice(set, get),
    ...createTickSnapshotInitialState(),

    // ── Orchestration State (not owned by any single slice) ────────

    /** Current simulation tick (incremented each tick). */
    currentSimTick: 0,
    /** Current production tick (incremented every N sim ticks). */
    currentProductionTick: 0,

    /** Per-station maps of sim_tick → machine state snapshot (for query use). */
    machineStates: createEmptyMachineStateTables(),
    /**
     * Flat ordered array of all machine state records (all 7 stations combined).
     * Used for Supabase sync — same pattern as alarmLogs / metricsHistory.
     * Ring-buffered to MAX_MACHINE_STATE_RECORDS to bound memory usage.
     */
    machineStateRecords: [] as import('./types').AnyMachineStateRecord[],
    /** Current parameter values for each station. */
    currentParams: createDefaultParams(),
    /** Per-parameter drift limits (max % change per drift event). */
    parameterDriftLimits: createDefaultDriftLimits(),
    /** Runtime status (operating/fault) for each station. */
    machineStatus: createInitialMachineStatus(),

    /** Log of all parameter change events (drift, spike, scenario). */
    parameterChanges: [],

    /**
     * Live numeric params for the conveyor (jammed_time, impacted_tiles).
     * Separate from currentParams because conveyor has no Supabase state table.
     * Updated via updateConveyorParam action from DemoSettingsPanel handleUpdate.
     */
    conveyorNumericParams: createDefaultConveyorParams(),

    /**
     * Drift limit per conveyor numeric param.
     * Initial values = 0 for SCN-000 (zero drift = zero defects on reference scenario).
     * Updated via updateConveyorDriftLimit action from DemoSettingsPanel handleUpdate.
     */
    conveyorDriftLimits: { jammed_time: 0, impacted_tiles: 0, speed_change: 0, jammed_events: 0 },

    /**
     * Flat array of per-tick conveyor state snapshots.
     * Ring-buffered to MAX_CONVEYOR_STATE_RECORDS. Synced to conveyor_states table.
     */
    conveyorStateRecords: [] as ConveyorStateRecord[],

    /**
     * Flat array of discrete conveyor events (jams, speed changes, status changes).
     * Ring-buffered to MAX_CONVEYOR_EVENT_RECORDS. Synced to conveyor_events table.
     */
    conveyorEventRecords: [] as ConveyorEventRecord[],

    // =========================================================================
    // CORE TICK — Orchestrates one simulation step
    // =========================================================================

    /**
     * Execute one simulation step.
     * Reads the master clocks from the MASTER simulation store,
     * then orchestrates all data recording, tile movement, and metrics.
     */
    tick: () => {
      const state = get();
      /** Skip if not running or no session. */
      if (!state.isRunning || !state.session) return;

      /** Read the master clocks from the MASTER simulation store. */
      const masterState = useSimulationStore.getState();
      const newSimTick = masterState.sClockCount;
      const newProductionTick = masterState.pClockCount;

      /** Skip if the master hasn't advanced. */
      if (newSimTick <= state.currentSimTick) return;

      /** 1. Record machine states for all stations. */
      const machineStateIds: Record<string, string> = {};
      for (const station of STATION_ORDER) {
        machineStateIds[station] = state.recordMachineState(
          station,
          newSimTick,
          newProductionTick
        );
      }

      /** 1b. Record conveyor state snapshot for this tick. */
      state.recordConveyorState(newSimTick, newProductionTick);

      /**
       * 2. Create data-layer tiles to match visual spawner (LOCKSTEP).
       *
       * The visual PartSpawner (ConveyorBelt.tsx) is the PRIMARY event emitter:
       * it creates visual tiles and increments workOrderStore.tilesSpawned.
       * The data store is a FOLLOWER — it reads tilesSpawned and creates
       * data-layer tiles until tileCounter matches. This guarantees both
       * layers stay perfectly in sync from a single counter source.
       *
       * The `while` loop handles catch-up: if the data store started late
       * (e.g., optimistic session delay), it creates multiple tiles in one
       * tick until it is caught up.
       */
      const { tilesSpawned } = useWorkOrderStore.getState();
      while (get().tileCounter < tilesSpawned) {
        const tile = get().createTile(newSimTick, newProductionTick);
        if (tile) {
          /** Record initial snapshot at press station WITH defect evaluation. */
          const currentState = get();
          const pressParams = currentState.currentParams['press'] as Record<string, number>;
          const pressRanges = getRangesForStation('press', currentState.activeScenario?.parameterOverrides);
          const pressEval = evaluateStationDefects('press', pressParams, pressRanges);

          /** Build defectInfo only if defects were detected. */
          const pressDefectInfo = pressEval.detected
            ? { detected: true, types: pressEval.types, severity: pressEval.severity, scrapped: false }
            : undefined;

          currentState.recordTileSnapshot(
            tile.id,
            'press',
            newSimTick,
            newProductionTick,
            machineStateIds['press'],
            pressDefectInfo as Parameters<typeof currentState.recordTileSnapshot>[5]
          );
        }
      }

      /**
       * 3. Move tiles on conveyor and emit a TickSnapshot.
       *
       * Capture tile state BEFORE the move to compute diffs after.
       * The TickSnapshot records all events that occurred during this
       * tick for the visual engine to replay in Phase 3.
       */
      const preMoveState = get();
      const preMoveTiles = preMoveState.tiles;

      state.moveTilesOnConveyor(newSimTick, newProductionTick);

      /**
       * 3b. Emit TickSnapshot — compute what changed during the move.
       */
      const postMoveState = get();
      const postMoveTiles = postMoveState.tiles;

      /** Detect newly created tiles (present post-move, absent pre-move). */
      const tilesCreated: import('./slices/tickSnapshotSlice').TickSnapshotTileCreated[] = [];

      /** Detect movements and completions by comparing tile states. */
      const movements: import('./slices/tickSnapshotSlice').TickSnapshotMovement[] = [];
      const completions: import('./slices/tickSnapshotSlice').TickSnapshotCompletion[] = [];

      for (const [tileId, postTile] of postMoveTiles) {
        const preTile = preMoveTiles.get(tileId);

        if (!preTile) {
          /** New tile — created during this tick (by the createTile loop above). */
          tilesCreated.push({
            tileId: postTile.id,
            tileNumber: postTile.tile_number,
          });
          continue;
        }

        /** Tile moved to a different station. */
        if (preTile.current_station !== postTile.current_station && postTile.current_station) {
          /** Check snapshots for defect info at the new station. */
          const snaps = postMoveState.tileSnapshots.get(tileId) || [];
          const latestSnap = snaps.length > 0 ? snaps[snaps.length - 1] : null;
          const defectDetected = latestSnap?.station === postTile.current_station
            ? (latestSnap.defect_detected ?? false)
            : false;
          const scrappedHere = latestSnap?.station === postTile.current_station
            ? (latestSnap.scrapped_here ?? false)
            : false;

          movements.push({
            tileId: postTile.id,
            tileNumber: postTile.tile_number,
            fromStation: preTile.current_station || 'press',
            toStation: postTile.current_station,
            defectDetected,
            scrappedHere,
          });
        }

        /** Tile completed during this tick (status changed to 'completed'). */
        if (preTile.status !== 'completed' && postTile.status === 'completed') {
          /** Map grade to visual destination for the 3D renderer. */
          const destination = postTile.final_grade === 'scrap' ? 'wasteBin' as const
            : postTile.final_grade === 'second_quality' ? 'secondQuality' as const
              : 'shipment' as const;

          completions.push({
            tileId: postTile.id,
            tileNumber: postTile.tile_number,
            finalGrade: postTile.final_grade,
            destination,
          });
        }
      }

      /** Calculate on-belt count (tiles with status 'in_production'). */
      let onBelt = 0;
      for (const [, tile] of postMoveTiles) {
        if (tile.status === 'in_production') onBelt++;
      }

      /** Push the TickSnapshot into the ring buffer. */
      postMoveState.pushTickSnapshot({
        tick: newSimTick,
        productionTick: newProductionTick,
        tilesCreated,
        movements,
        completions,
        counters: {
          totalProduced: postMoveState.totalTilesProduced,
          firstQuality: postMoveState.totalFirstQuality,
          secondQuality: postMoveState.totalSecondQuality,
          scrapGraded: postMoveState.totalScrapGraded,
          onBelt,
        },
      });

      /** 4. Check for random parameter changes. */
      if (Math.random() < state.config.parameterChangeChance) {
        applyRandomParameterChange(state, newSimTick, newProductionTick);
      }

      /** 5. Check and activate scenarios. */
      state.checkAndActivateScenarios(newSimTick);

      /** 6. Periodic metrics aggregation. */
      const ticksSincePeriodStart = newSimTick - state.currentPeriodMetrics.periodStartTick;
      if (ticksSincePeriodStart >= state.config.metricsPeriodTicks) {
        state.finalizePeriodMetrics(newSimTick, newProductionTick);
      }

      /** 7. Periodic tile pruning — evict old synced tiles to bound Map growth. */
      if (newSimTick % 100 === 0) {
        state.pruneCompletedTiles();
      }

      /** 8. Update local tick counters AND session tick counters for Supabase sync. */
      set((prev) => ({
        currentSimTick: newSimTick,
        currentProductionTick: newProductionTick,
        /**
         * Keep session.current_sim_tick and current_production_tick in sync
         * with the store-level counters. The session upsert in syncService
         * reads these from `session` and sends them to Supabase. Without this,
         * Supabase always shows 0 for both tick counters.
         */
        session: prev.session
          ? {
            ...prev.session,
            current_sim_tick: newSimTick,
            current_production_tick: newProductionTick,
            updated_at: new Date().toISOString(),
          }
          : null,
      }));
    },

    // =========================================================================
    // MACHINE STATE RECORDING
    // =========================================================================

    /**
     * Snapshot a station's parameters at a given tick.
     * Merges base record fields with station-specific parameters.
     *
     * @param station        - Station to snapshot
     * @param simTick        - Current simulation tick
     * @param productionTick - Current production tick
     * @returns The unique ID of the created machine state record
     */
    recordMachineState: (station, simTick, productionTick) => {
      const state = get();
      /** Generate unique ID for this record. */
      const id = generateUUID();
      const now = new Date().toISOString();
      const params = state.currentParams[station];
      const status = state.machineStatus[station];

      /** Build base record with common fields. */
      const baseRecord: Partial<AnyMachineStateRecord> = {
        id,
        simulation_id: state.session!.id,
        sim_tick: simTick,
        production_tick: productionTick,
        is_operating: status.isOperating,
        fault_code: status.faultCode,
        created_at: now,
        /** station: local-only routing field, stripped from DB payload by syncService. */
        station: station as import('./types').StationName,
        synced: false,
      };

      /** Merge base with station-specific parameters. */
      const record = { ...baseRecord, ...params } as AnyMachineStateRecord;

      /**
       * Store the record in BOTH:
       *  1. machineStates Map — for getMachineStateAtTick O(1) lookups
       *  2. machineStateRecords flat array — for Supabase sync (same pattern
       *     as alarmLogs / metricsHistory which both work correctly)
       *
       * Previously only the Map was used, with a compound { station, simTick, id }
       * queue entry that required a Map.get(simTick) in getUnsyncedData(). That
       * lookup silently returned undefined, so machine states were never synced.
       * The flat array eliminates the Map lookup indirection entirely.
       */
      set((s) => {
        /** Update the per-station tick-indexed Map for query use. */
        const newTables = { ...s.machineStates };
        const newMap = new Map(newTables[station] as Map<number, AnyMachineStateRecord>);
        newMap.set(simTick, record);
        (newTables[station] as unknown as Map<number, AnyMachineStateRecord>) = newMap as unknown as typeof newTables[typeof station];

        /** Append to flat array and apply ring-buffer cap. */
        const nextRecords = [...s.machineStateRecords, record];
        const trimmedRecords = nextRecords.length > MAX_MACHINE_STATE_RECORDS
          ? nextRecords.slice(-MAX_MACHINE_STATE_RECORDS)
          : nextRecords;

        return {
          machineStates: newTables,
          machineStateRecords: trimmedRecords,
          unsyncedRecords: {
            ...s.unsyncedRecords,
            /** Queue just the string ID — same shape as all other queues. */
            machineStates: [...s.unsyncedRecords.machineStates, id],
          },
        };
      });

      return id;
    },

    // =========================================================================
    // CONVEYOR ANALYTICS — Per-tick state snapshots & discrete event recording
    // =========================================================================

    /**
     * Record a per-tick snapshot of the conveyor belt state.
     *
     * Reads belt speed, operational status, fault count, and live tile count
     * directly from simulationStore to avoid prop-threading. One record is
     * created per S-Clock tick per session.
     *
     * @param simTick        - Current S-Clock tick value
     * @param productionTick - Current P-Clock tick value (tiles produced so far)
     */
    recordConveyorState: (simTick, productionTick) => {
      const state = get();
      /** Guard: only record when session is active. */
      if (!state.session) return;

      /** Read live conveyor values from the master simulation store. */
      const master = useSimulationStore.getState();
      const id = generateUUID();

      /** Build the immutable snapshot record. */
      const record: ConveyorStateRecord = {
        id,
        simulation_id: state.session.id,
        sim_tick: simTick,
        production_tick: productionTick,
        /** Belt speed clamped to 3 decimal places matches DB numeric(5,3). */
        conveyor_speed: Math.round(master.conveyorSpeed * 1000) / 1000,
        conveyor_status: master.conveyorStatus,
        /** Cumulative jam count at this tick is the session-total faultCount. */
        fault_count: master.faultCount,
        /** Total live tiles (includes queued, sorted, collected — from totalPartsRef). */
        active_tiles_on_belt: master.totalPartsRef.current,
        created_at: new Date().toISOString(),
        synced: false,
      };

      /** Append to flat array and apply ring-buffer cap to prevent memory growth. */
      set((s) => {
        const next = [...s.conveyorStateRecords, record];
        const trimmed = next.length > MAX_CONVEYOR_STATE_RECORDS
          ? next.slice(-MAX_CONVEYOR_STATE_RECORDS)
          : next;
        return {
          conveyorStateRecords: trimmed,
          unsyncedRecords: {
            ...s.unsyncedRecords,
            /** Queue the record ID for the next sync flush. */
            conveyorStates: [...s.unsyncedRecords.conveyorStates, id],
          },
        };
      });
    },

    /**
     * Record a discrete conveyor event (state transition or speed change).
     *
     * Events are NOT recorded every tick — only when a meaningful transition
     * occurs (jam start/clear, speed change). The event bus wires this:
     * simulationStore emits 'alarm' for jams; useConveyorBehaviour calls
     * setConveyorSpeed and we subscribe to that store field for speed deltas.
     *
     * @param simTick        - S-Clock tick when the event occurred
     * @param productionTick - P-Clock tick at event time
     * @param eventType      - 'jam_start' | 'jam_cleared' | 'speed_change' | 'status_change'
     * @param oldValue       - Previous value as string (null if not available)
     * @param newValue       - New value after the event as string
     */
    recordConveyorEvent: (simTick, productionTick, eventType, oldValue, newValue) => {
      const state = get();
      /** Guard: only record when session is active. */
      if (!state.session) return;

      const id = generateUUID();

      /** Build the event record. */
      const record: ConveyorEventRecord = {
        id,
        simulation_id: state.session.id,
        sim_tick: simTick,
        production_tick: productionTick,
        event_type: eventType,
        old_value: oldValue,
        new_value: newValue,
        created_at: new Date().toISOString(),
        synced: false,
      };

      /** Append to flat array with ring-buffer cap. Events are infrequent (~jams + speed changes). */
      set((s) => {
        const next = [...s.conveyorEventRecords, record];
        const trimmed = next.length > MAX_CONVEYOR_EVENT_RECORDS
          ? next.slice(-MAX_CONVEYOR_EVENT_RECORDS)
          : next;
        return {
          conveyorEventRecords: trimmed,
          unsyncedRecords: {
            ...s.unsyncedRecords,
            /** Queue the event ID for the next sync flush. */
            conveyorEvents: [...s.unsyncedRecords.conveyorEvents, id],
          },
        };
      });
    },

    // =========================================================================
    // PARAMETER CHANGE MANAGEMENT
    // =========================================================================

    /**
     * Record a parameter change event.
     * Creates a ParameterChangeRecord with magnitude and percentage data.
     *
     * @param station       - Station where the change occurred
     * @param parameterName - Name of the parameter that changed
     * @param oldValue      - Previous parameter value
     * @param newValue      - New parameter value
     * @param simTick       - Simulation tick of the change
     * @param productionTick - Production tick of the change
     * @param changeType    - Type of change (drift, step, etc.)
     * @param changeReason  - Optional reason (wear, scenario, etc.)
     * @param scenarioId    - Optional ID of triggering scenario
     * @returns The unique ID of the created record
     */
    recordParameterChange: (
      station, parameterName, oldValue, newValue,
      simTick, productionTick, changeType, changeReason, scenarioId
    ) => {
      const state = get();
      /** Generate unique ID for this record. */
      const id = generateUUID();

      /** Calculate change magnitude and percentage. */
      const changeMagnitude = Math.abs(newValue - oldValue);
      const changePct = oldValue !== 0
        ? ((newValue - oldValue) / oldValue) * 100
        : 0;

      /** Build the parameter change record. */
      const record: ParameterChangeRecord = {
        id,
        simulation_id: state.session!.id,
        sim_tick: simTick,
        production_tick: productionTick,
        station,
        parameter_name: parameterName,
        old_value: oldValue,
        new_value: newValue,
        change_magnitude: changeMagnitude,
        change_pct: changePct,
        change_type: changeType,
        change_reason: changeReason,
        scenario_id: scenarioId,
        synced: false,
      };

      /** Append to history and mark for sync.
       *  Ring-buffer: evict oldest entries when exceeding MAX_PARAMETER_CHANGES. */
      set((s) => {
        const nextChanges = [...s.parameterChanges, record];
        return {
          parameterChanges: nextChanges.length > MAX_PARAMETER_CHANGES
            ? nextChanges.slice(-MAX_PARAMETER_CHANGES)
            : nextChanges,
          unsyncedRecords: {
            ...s.unsyncedRecords,
            parameterChanges: [...s.unsyncedRecords.parameterChanges, id],
          },
        };
      });

      return id;
    },

    /**
     * Apply a new parameter value and record the change event.
     * No-op if the value hasn't changed or parameter not found.
     *
     * @param station       - Station to update
     * @param parameterName - Parameter name to change
     * @param newValue      - New parameter value
     * @param changeType    - Type of change
     * @param changeReason  - Optional reason for the change
     */
    updateParameter: (station, parameterName, newValue, changeType, changeReason) => {
      const state = get();
      const currentParams = state.currentParams[station];
      /** Read the current value for this parameter. */
      const oldValue = getStationParamValue(currentParams as Record<string, unknown>, parameterName);

      /** Skip if parameter not found or value unchanged. */
      if (oldValue === undefined || oldValue === newValue) return;

      /** Only record changes if a session exists. */
      if (state.session) {
        /** Read master clock for timing. */
        const masterState = useSimulationStore.getState();
        const simTick = masterState.sClockCount;
        const productionTick = masterState.pClockCount;

        /** Record the change event. */
        state.recordParameterChange(
          station, parameterName, oldValue, newValue,
          simTick, productionTick, changeType, changeReason
        );
      }

      /** Apply the new value to the station's parameters. */
      set((s) => {
        /**
         * CWF DRIFT RESET — When CWF corrects a parameter, zero its drift limit
         * to permanently prevent drift from re-degrading this parameter.
         *
         * Without this, the scenario-driven drift limits (e.g. 80%) would push
         * the corrected value back out of the safe range within seconds, making
         * CWF corrections effectively useless.
         *
         * The drift limit stays at 0 until a new scenario is loaded or the user
         * clicks "Reset to Factory Defaults" in Demo Settings.
         */
        const updatedDriftLimits =
          changeReason === 'cwf_agent'
            ? {
              ...s.parameterDriftLimits,
              [station]: {
                ...s.parameterDriftLimits[station],
                [parameterName]: 0,
              },
            }
            : s.parameterDriftLimits;

        return {
          currentParams: setStationParams(s.currentParams, station, { [parameterName]: newValue }),
          /** Only update drift limits when CWF is the source of the change. */
          ...(changeReason === 'cwf_agent' ? { parameterDriftLimits: updatedDriftLimits } : {}),
        };
      });
    },

    /**
     * Update the drift limit for a specific parameter.
     * Called from Demo Settings when user edits the Δ % column.
     *
     * @param station       - Station name
     * @param parameterName - Parameter to update drift limit for
     * @param driftLimitPct - New drift limit percentage
     */
    updateDriftLimit: (station, parameterName, driftLimitPct) => {
      set((s) => {
        const newLimits = { ...s.parameterDriftLimits };
        newLimits[station] = {
          ...s.parameterDriftLimits[station],
          [parameterName]: driftLimitPct,
        };
        return { parameterDriftLimits: newLimits };
      });
    },

    /**
     * Reset all parameters and drift limits to factory defaults.
     * Called from Demo Settings "Reference" button.
     * Also resets conveyor numeric params and drift limits.
     */
    resetToFactoryDefaults: () => {
      set({
        currentParams: createDefaultParams(),
        parameterDriftLimits: createDefaultDriftLimits(),
        /**
         * Reset all conveyor params (numeric AND boolean) to factory defaults.
         * createDefaultConveyorParams() now returns all four fields.
         */
        conveyorNumericParams: createDefaultConveyorParams(),
        /**
         * Reset ALL conveyor drift limits to 0% (SCN-000 zero-drift baseline).
         * Includes numeric params (jammed_time, impacted_tiles) AND boolean
         * params (speed_change, jammed_events).
         */
        conveyorDriftLimits: {
          jammed_time: 0,
          impacted_tiles: 0,
          speed_change: 0,
          jammed_events: 0,
        },
      });
    },

    /**
     * Update a single conveyor numeric parameter value in the store.
     * Called by DemoSettingsPanel handleUpdate() for the conveyor tab.
     *
     * @param paramName - 'jammed_time' or 'impacted_tiles'
     * @param newValue  - The new numeric value to set
     */
    updateConveyorParam: (
      paramName: keyof import('./slices/storeHelpers').ConveyorNumericParams,
      newValue: number
    ) => {
      set((prev) => ({
        /** Merge the updated param into existing conveyorNumericParams. */
        conveyorNumericParams: {
          ...prev.conveyorNumericParams,
          [paramName]: newValue,
        },
      }));
    },

    /**
     * Update a boolean conveyor parameter (speed_change or jammed_events).
     *
     * Previously these toggles were only stored in ConveyorSettingsTable's
     * local React state, which was destroyed whenever the panel unmounted.
     * Reopening the panel would re-initialise from scenario defaults, silently
     * discarding any change the user had committed via "Update".
     *
     * By persisting boolean values here in conveyorNumericParams, the panel can
     * read them back on mount and correctly show the last-committed state.
     *
     * @param paramName - 'speed_change' or 'jammed_events'
     * @param newValue  - The new boolean value to set
     */
    updateConveyorBoolParam: (
      paramName: 'speed_change' | 'jammed_events',
      newValue: boolean
    ) => {
      set((prev) => ({
        /** Merge the updated boolean into existing conveyorNumericParams. */
        conveyorNumericParams: {
          ...prev.conveyorNumericParams,
          [paramName]: newValue,
        },
      }));
    },

    /**
     * Update the drift limit for a specific conveyor numeric parameter.
     * Called by DemoSettingsPanel handleUpdate() for the conveyor tab.
     *
     * @param paramName     - 'jammed_time' or 'impacted_tiles'
     * @param driftLimitPct - New drift limit percentage (0–100)
     */
    updateConveyorDriftLimit: (
      paramName: keyof import('./slices/storeHelpers').ConveyorNumericParams,
      driftLimitPct: number
    ) => {
      set((prev) => ({
        /** Merge the updated drift limit into existing conveyorDriftLimits. */
        conveyorDriftLimits: {
          ...prev.conveyorDriftLimits,
          [paramName]: driftLimitPct,
        },
      }));
    },
  }))
);

// =============================================================================
// EVENT BUS SUBSCRIPTIONS — Wire cross-store events at module load time
// =============================================================================

/**
 * Subscribe to alarm events emitted by simulationStore.
 * This replaces the previous dynamic import() pattern that was used
 * to avoid circular dependencies.
 *
 * For jam-related alarms (jam_start, jam_cleared) we ALSO fire a conveyorEvent
 * record so that the `conveyor_events` Supabase table captures these transitions.
 */
eventBus.on('alarm', (payload) => {
  const store = useSimulationDataStore.getState();
  /** Always record the alarm log entry. */
  store.recordAlarm(payload);

  /** Additionally record a conveyor event for jam transitions. */
  if (payload.type === 'jam_start' || payload.type === 'jam_cleared') {
    const master = useSimulationStore.getState();
    /** Read current clocks from the master store for accurate tick references. */
    store.recordConveyorEvent(
      master.sClockCount,
      master.pClockCount,
      payload.type,          // 'jam_start' | 'jam_cleared' — both valid ConveyorEventType values
      null,                  // previous status not tracked in alarm payload
      master.conveyorStatus, // new status after the transition
    );
  }
});

/**
 * Subscribe to conveyorSpeed changes in simulationStore to record speed_change events.
 *
 * Uses subscribeWithSelector so we only fire when speed actually changes.
 * Tracks the previous speed in a closure so we can record the delta as old_value.
 */
let _prevConveyorSpeed = useSimulationStore.getState().conveyorSpeed;
useSimulationStore.subscribe(
  /** Selector: only watch conveyorSpeed changes. */
  (state) => state.conveyorSpeed,
  (newSpeed, oldSpeed) => {
    /** Only record if the change is meaningful (avoid floating-point noise). */
    if (Math.abs(newSpeed - oldSpeed) < 0.001) return;
    const dataStore = useSimulationDataStore.getState();
    const master = useSimulationStore.getState();
    /** Record the speed transition as a discrete conveyor event. */
    dataStore.recordConveyorEvent(
      master.sClockCount,
      master.pClockCount,
      'speed_change',
      _prevConveyorSpeed.toFixed(3), // old speed as string
      newSpeed.toFixed(3),           // new speed as string
    );
    /** Update cached previous speed to the new value. */
    _prevConveyorSpeed = newSpeed;
  },
);

// =============================================================================
// HELPER FUNCTIONS (Private to this module)
// =============================================================================

/**
 * Apply a random parameter change to a random station.
 * This simulates real-world drift in machine parameters.
 * Uses per-parameter drift limits from state.parameterDriftLimits.
 *
 * @param state            - Current store state
 * @param _simTick         - Current simulation tick (unused, for future use)
 * @param _productionTick  - Current production tick (unused, for future use)
 */
function applyRandomParameterChange(
  state: import('./slices/storeHelpers').SimulationDataState,
  _simTick: number,
  _productionTick: number
): void {
  /** Pick a random station. */
  const station = STATION_ORDER[Math.floor(Math.random() * STATION_ORDER.length)];
  const params = state.currentParams[station];

  /** Get parameter names for this station. */
  const paramNames = Object.keys(params);
  if (paramNames.length === 0) return;

  /** Pick a random parameter. */
  const paramName = paramNames[Math.floor(Math.random() * paramNames.length)];
  const currentValue = getStationParamValue(params as Record<string, unknown>, paramName);
  if (typeof currentValue !== 'number') return;

  /** Get the drift limit for this specific parameter (default to 5% if not set). */
  const driftLimit = state.parameterDriftLimits[station]?.[paramName] ?? 5;

  /**
   * Scale the effective drift magnitude by DRIFT_STEP_SCALE so that individual
   * steps remain small even when driftLimit is set to a high value (e.g. 80%).
   * Without scaling, an 80% drift limit would cause the value to jump ±80%
   * in a single tick, which looks unrealistic. With DRIFT_STEP_SCALE=0.15:
   *   effectiveDrift = 80% × 0.15 = ±12% per tick (smooth walk).
   */
  const effectiveDrift = driftLimit * DRIFT_STEP_SCALE;

  /** Apply drift within ±effectiveDrift%. */
  const driftPct = (Math.random() * effectiveDrift * 2 - effectiveDrift); // ±effectiveDrift%
  const newValue = currentValue * (1 + driftPct / 100);

  /** Apply the change via the store action. */
  state.updateParameter(station, paramName, newValue, 'drift', 'wear');
}
