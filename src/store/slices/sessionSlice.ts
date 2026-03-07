/**
 * sessionSlice.ts — Session Lifecycle Slice
 *
 * Manages the simulation session lifecycle within the data store.
 * Extracted from simulationDataStore.ts to reduce monolith size.
 *
 * Actions:
 *  - startSession: Create a new session (persists to Supabase if available)
 *  - pauseSession: Pause the running session
 *  - resumeSession: Resume a paused session
 *  - endSession: End and finalize the session
 *  - startHeartbeat: Begin periodic Supabase timestamp refresh
 *  - stopHeartbeat: Stop the periodic refresh
 *  - resetDataStore: Reset all store state to initial values
 *
 * Dependencies:
 *  - Supabase client (optional, for cloud persistence)
 *  - generateUUID (for local UUID generation)
 *  - createDefaultParams (from params.ts)
 *  - All shared helpers from storeHelpers.ts
 *
 * Used by: simulationDataStore.ts (composed via spread in the main create() call)
 */

import { generateUUID } from '../../lib/idGenerator';
import { supabase } from '../../lib/supabaseClient';
import { createDefaultParams, createDefaultConveyorParams } from '../../lib/params';
import { REFERENCE_SCENARIO } from '../../lib/scenarios';
import { createTickSnapshotInitialState } from './tickSnapshotSlice';
import { createLogger } from '../../lib/logger';
import { SESSION_HEARTBEAT_INTERVAL_MS } from '../../lib/params/sync';
import { logConnect, logDisconnect } from '../../lib/usageTracker';
import { addSimulation } from '../../services/simulationHistoryService';
import type { SimulationSession } from '../types';
import type { SetState, GetState, SimulationDataState } from './storeHelpers';
import {
  DEFAULT_CONFIG,
  EMPTY_UNSYNCED,
  createEmptyMachineStateTables,
  createDefaultDriftLimits,
  createEmptyPeriodMetrics,
  createInitialMachineStatus,
  generateSessionCode,
} from './storeHelpers';

/** Module-level logger for session operations. */
const log = createLogger('SessionSlice');

/**
 * Factory function that creates the session lifecycle portion of the store.
 * Receives Zustand's `set` and `get` to read/write the full store state.
 *
 * @param set - Zustand state setter (partial or updater function)
 * @param get - Zustand state getter (returns full SimulationDataState)
 * @returns Partial state object containing session fields and lifecycle actions
 */
export const createSessionSlice = (
  set: SetState,
  get: GetState,
): Pick<
  SimulationDataState,
  | 'session'
  | 'sessionCode'
  | 'config'
  | 'isRunning'
  | 'heartbeatInterval'
  | 'usageLogHandle'
  | 'startSession'
  | 'pauseSession'
  | 'resumeSession'
  | 'endSession'
  | 'startHeartbeat'
  | 'stopHeartbeat'
  | 'resetDataStore'
> => ({
  // ── Initial State ─────────────────────────────────────────────────
  /** No active session on first load. */
  session: null,
  /** Empty session code until a session is started. */
  sessionCode: '',
  /** Default data collection configuration. */
  config: { ...DEFAULT_CONFIG },
  /** Not running until a session is started. */
  isRunning: false,
  /** No heartbeat interval active on first load. */
  heartbeatInterval: null,
  /** No usage log handle on first load. */
  usageLogHandle: null,

  // ── Actions ─────────────────────────────────────────────────────

  /**
   * Create a new simulation session.
   *
   * OPTIMISTIC START: Sets isRunning=true and creates the session with LOCAL
   * UUIDs/codes IMMEDIATELY so tick() starts processing within milliseconds.
   * Supabase persistence is attempted in the background — if it succeeds,
   * the session ID and code are upgraded to server-generated values.
   * If Supabase fails or is unavailable, the local values remain and the
   * simulation runs fully offline.
   *
   * This design eliminates the 20-30 second blocking delay previously caused
   * by Supabase statement timeouts (PostgreSQL error 57014 / 504 upstream).
   *
   * @param name        - Human-readable session name
   * @param description - Optional description of the session
   */
  startSession: async (name, description) => {
    const now = new Date().toISOString();

    // ── Step 1: Generate LOCAL identifiers immediately ────────────
    const localId = generateUUID();
    const localCode = generateSessionCode();

    /** Build the session metadata with local identifiers. */
    const session: SimulationSession = {
      id: localId,
      session_code: localCode,
      name,
      description,
      tick_duration_ms: DEFAULT_CONFIG.tickDurationMs,
      production_tick_ratio: DEFAULT_CONFIG.productionTickRatio,
      station_gap_production_ticks: DEFAULT_CONFIG.stationGapProductionTicks,
      status: 'running',
      current_sim_tick: 0,
      current_production_tick: 0,
      started_at: now,
      created_at: now,
      updated_at: now,
    };

    const currentState = get();

    // ── Step 2: IMMEDIATELY set isRunning=true so tick() starts ───
    // This is the critical change — no await before this set() call.
    set({
      session,
      sessionCode: localCode,
      isRunning: true,
      currentSimTick: 0,
      currentProductionTick: 0,
      machineStates: createEmptyMachineStateTables(),
      machineStateRecords: [],
      currentParams: currentState.currentParams,
      parameterDriftLimits: currentState.parameterDriftLimits,
      machineStatus: createInitialMachineStatus(),
      tiles: new Map(),
      tilesByNumber: new Map(),
      tileCounter: 0,
      totalTilesProduced: 0,
      totalTilesScrapped: 0,
      totalFirstQuality: 0,
      totalSecondQuality: 0,
      totalScrapGraded: 0,
      tileSnapshots: new Map(),
      conveyorPositions: new Map(),
      parameterChanges: [],
      activeScenarios: new Map(),
      scenarioHistory: [],
      /**
       * Preserve the user's current activeScenario across session boundaries.
       *
       * Previously this was hardcoded to REFERENCE_SCENARIO, which caused a bug:
       * after clicking Start, the Demo Settings panel would reset to SCN-000
       * regardless of which scenario the user had selected and configured.
       *
       * Now we carry the current scenario forward so that when the user reopens
       * Demo Settings after starting the simulation, they still see their chosen
       * scenario (e.g., SCN-001) as active — not SCN-000.
       *
       * Note: resetDataStore() (called by the full factory reset / handleReset)
       * still explicitly sets activeScenario back to REFERENCE_SCENARIO, which
       * is the correct behaviour for a deliberate complete-reset operation.
       */
      activeScenario: currentState.activeScenario,
      activeScenarioActivationId: null,
      currentPeriodMetrics: createEmptyPeriodMetrics(),
      metricsHistory: [],
      alarmLogs: [],
      unsyncedRecords: { ...EMPTY_UNSYNCED },
      /** Preserve conveyor numeric params across session boundaries. */
      conveyorNumericParams: currentState.conveyorNumericParams,
      /** Preserve conveyor drift limits across session boundaries. */
      conveyorDriftLimits: currentState.conveyorDriftLimits,
    });

    log.info('Session started (local) — code: %s, id: %s', localCode, localId);

    // ── Step 3: Start heartbeat immediately ──
    get().startHeartbeat();

    // ── Step 4: Attempt Supabase persistence in the background ───
    // This is fire-and-forget — if it succeeds we upgrade the session
    // identifiers; if it fails we keep the local ones.
    if (supabase) {
      /** Wrap in Promise.resolve to normalize PromiseLike → Promise for .catch() */
      Promise.resolve(
        supabase
          .from('simulation_sessions')
          .insert({
            name,
            description,
            tick_duration_ms: DEFAULT_CONFIG.tickDurationMs,
            production_tick_ratio: DEFAULT_CONFIG.productionTickRatio,
            station_gap_production_ticks: DEFAULT_CONFIG.stationGapProductionTicks,
            status: 'running',
            current_sim_tick: 0,
            current_production_tick: 0,
            started_at: now,
          })
          .select('id, session_code')
          .single()
      )
        .then(({ data, error }) => {
          if (error) {
            log.warn('Supabase session insert failed (keeping local IDs):', error.message);
            return;
          }
          if (!data) return;

          /** Upgrade session to server-generated ID and code. */
          const current = get();
          if (current.session?.id === localId) {

            /**
             * Remap simulation_id in all in-memory records that were created
             * during the local-session phase (ticks 1-N before Supabase confirmed
             * the INSERT). Those records captured localId as their simulation_id.
             * Without this remap, the batch upsert to machine_press_states etc.
             * would fail with a FK violation because localId doesn't exist in
             * simulation_sessions — only the server-assigned data.id does.
             *
             * alarmLogs and metricsHistory do NOT embed simulation_id at creation
             * time — they read it from session.id at sync time — so they are
             * unaffected. machineStateRecords, tiles, tileSnapshots, and
             * parameterChanges DO embed it and must be patched here.
             */
            const remapSimId = <T extends { simulation_id: string }>(arr: T[]): T[] =>
              arr.map((r) => r.simulation_id === localId ? { ...r, simulation_id: data.id } : r);

            set({
              session: {
                ...current.session,
                id: data.id,
                session_code: data.session_code,
              },
              sessionCode: data.session_code,
              /** Patch simulation_id in all record arrays that embed it. */
              machineStateRecords: remapSimId(current.machineStateRecords),
              parameterChanges: remapSimId(current.parameterChanges),
              /**
               * Remap conveyor analytics records created before session upgrade.
               * Like machine state records, these embed simulation_id at creation
               * time and must be patched to match the Supabase-assigned session ID.
               */
              conveyorStateRecords: remapSimId(current.conveyorStateRecords),
              conveyorEventRecords: remapSimId(current.conveyorEventRecords),
            });

            /**
             * Remap tiles — they use a Map<id, TileRecord>, so we rebuild it.
             * Must re-read state because the previous set() may have changed it.
             */
            const afterUpgrade = get();
            const stateToPatch: Partial<typeof afterUpgrade> = {};

            if (afterUpgrade.tiles.size > 0) {
              const newTiles = new Map(afterUpgrade.tiles);
              for (const [id, tile] of newTiles) {
                if (tile.simulation_id === localId) {
                  newTiles.set(id, { ...tile, simulation_id: data.id });
                }
              }
              stateToPatch.tiles = newTiles;
            }

            /**
             * Remap tileSnapshots — Map<tileId, TileSnapshotRecord[]>.
             * Each snapshot also embeds simulation_id at recordTileSnapshot time.
             */
            if (afterUpgrade.tileSnapshots.size > 0) {
              const newSnapshots = new Map(afterUpgrade.tileSnapshots);
              for (const [tileId, snaps] of newSnapshots) {
                const updated = snaps.map((s) =>
                  s.simulation_id === localId ? { ...s, simulation_id: data.id } : s
                );
                newSnapshots.set(tileId, updated);
              }
              stateToPatch.tileSnapshots = newSnapshots;
            }

            if (Object.keys(stateToPatch).length > 0) {
              set(stateToPatch);
            }

            log.info(
              'Session upgraded to Supabase — code: %s → %s, id: %s',
              localCode, data.session_code, data.id,
            );

            /**
             * Persist this simulation in the browser's local history.
             * Enables CWF to access data from previous simulations by
             * storing UUID + session code + timestamp + counter.
             */
            addSimulation(data.id, data.session_code);
          }

          // ── Log usage analytics now that session_id exists in Supabase ──
          // We pass the confirmed server session ID so the FK constraint
          // on usage_log.session_id is satisfied. Calling this here (inside
          // the Supabase confirmation callback) ensures the session row exists
          // before we try to insert the usage_log row.
          logConnect(data.id).then((handle) => {
            if (handle) {
              set({ usageLogHandle: handle });
              /** Safety net: log disconnect on tab/window close. */
              const onBeforeUnload = () => {
                logDisconnect(handle.logId, handle.connectedAt);
              };
              window.addEventListener('beforeunload', onBeforeUnload, { once: true });
            }
          });
        })
        .catch((err: unknown) => {
          log.warn('Supabase session creation failed (keeping local IDs):', err);
        });
    }

    // ── Step 5: Log usage analytics AFTER Supabase session is confirmed ──
    // NOTE: We intentionally do NOT call logConnect here with localId.
    // The usage_log table has a FK constraint on session_id referencing
    // simulation_sessions.id. If we pass localId (which is a locally generated
    // UUID not yet persisted to Supabase), the INSERT will fail with a 409
    // FK violation. Instead, logConnect is called inside the Supabase
    // session creation .then() block above, once we have the real server ID.
    // See Step 4 .then() handler for the actual logConnect call.
  },

  /**
   * Pause the current session.
   * Updates local state immediately, then persists to Supabase.
   * Heartbeat continues while paused so session isn't cleaned up.
   */
  pauseSession: async () => {
    const state = get();
    if (!state.session) return;
    const now = new Date().toISOString();

    // Update local state immediately
    set({
      isRunning: false,
      session: {
        ...state.session,
        status: 'paused',
        paused_at: now,
        updated_at: now,
      },
    });

    // Update Supabase
    if (supabase) {
      const { error } = await supabase
        .from('simulation_sessions')
        .update({ status: 'paused', paused_at: now, updated_at: now })
        .eq('id', state.session.id);
      if (error) {
        log.warn('Supabase pause update failed:', error.message);
      } else {
        log.info('Session paused in Supabase');
      }
    }
  },

  /**
   * Resume a paused session.
   * Updates local state immediately, then persists to Supabase.
   */
  resumeSession: async () => {
    const state = get();
    if (!state.session) return;
    const now = new Date().toISOString();

    // Update local state immediately
    set({
      isRunning: true,
      session: {
        ...state.session,
        status: 'running',
        paused_at: undefined,
        updated_at: now,
      },
    });

    // Update Supabase
    if (supabase) {
      const { error } = await supabase
        .from('simulation_sessions')
        .update({ status: 'running', paused_at: null, updated_at: now })
        .eq('id', state.session.id);
      if (error) {
        log.warn('Supabase resume update failed:', error.message);
      } else {
        log.info('Session resumed in Supabase');
      }
    }
  },

  /**
   * End and finalize the current session.
   * Sets status to 'completed' locally and in Supabase.
   * Stops the heartbeat since completed sessions are preserved.
   */
  endSession: async () => {
    const state = get();
    if (!state.session) return;
    const now = new Date().toISOString();

    // ── Stop heartbeat — completed sessions are never cleaned up ──
    state.stopHeartbeat();

    // ── Log usage disconnect ──
    const usageHandle = state.usageLogHandle;
    if (usageHandle) {
      logDisconnect(usageHandle.logId, usageHandle.connectedAt);
      set({ usageLogHandle: null });
    }

    // Update local state immediately
    set({
      isRunning: false,
      session: {
        ...state.session,
        status: 'completed',
        completed_at: now,
        updated_at: now,
      },
    });

    // Update Supabase
    if (supabase) {
      const { error } = await supabase
        .from('simulation_sessions')
        .update({ status: 'completed', completed_at: now, updated_at: now })
        .eq('id', state.session.id);
      if (error) {
        log.warn('Supabase end update failed:', error.message);
      } else {
        log.info('Session ended in Supabase');
      }
    }
  },

  /**
   * Start periodic heartbeat that refreshes the session's `updated_at`
   * timestamp in Supabase. This keeps the session alive and prevents
   * the server-side cleanup job from deleting it.
   *
   * Interval is controlled by SESSION_HEARTBEAT_INTERVAL_MS param.
   * Safe to call multiple times — no-ops if already running.
   */
  startHeartbeat: () => {
    /** Don't start a second heartbeat if one is already active. */
    if (get().heartbeatInterval) return;

    /** Skip heartbeat entirely when Supabase is not configured. */
    if (!supabase) return;

    /** Local reference for TypeScript narrowing inside the closure. */
    const sb = supabase;

    const interval = setInterval(async () => {
      const state = get();
      /** Guard: stop heartbeat if session ended or was reset. */
      if (!state.session) {
        state.stopHeartbeat();
        return;
      }

      const now = new Date().toISOString();

      try {
        /** Touch the session's updated_at to signal liveness. */
        const { error } = await sb
          .from('simulation_sessions')
          .update({ updated_at: now })
          .eq('id', state.session.id);

        if (error) {
          log.warn('Heartbeat update failed:', error.message);
        }
      } catch (err) {
        log.warn('Heartbeat error:', err);
      }
    }, SESSION_HEARTBEAT_INTERVAL_MS);

    set({ heartbeatInterval: interval });
    log.info('Session heartbeat started (every %dms)', SESSION_HEARTBEAT_INTERVAL_MS);
  },

  /**
   * Stop the periodic heartbeat and clear the interval handle.
   * Safe to call multiple times — no-ops if not running.
   */
  stopHeartbeat: () => {
    const interval = get().heartbeatInterval;
    if (interval) {
      clearInterval(interval);
      set({ heartbeatInterval: null });
      log.info('Session heartbeat stopped');
    }
  },

  /**
   * Reset all store state to initial values.
   * Clears session, tiles, scenarios, metrics, and sync queues.
   * Resets parameters and drift limits to factory defaults.
   * Stops the heartbeat if running.
   */
  resetDataStore: () => {
    /** Stop heartbeat before clearing session. */
    get().stopHeartbeat();

    /** Log usage disconnect if handle exists. */
    const usageHandle = get().usageLogHandle;
    if (usageHandle) {
      logDisconnect(usageHandle.logId, usageHandle.connectedAt);
    }

    set({
      session: null,
      sessionCode: '',
      isRunning: false,
      heartbeatInterval: null,
      usageLogHandle: null,
      currentSimTick: 0,
      currentProductionTick: 0,
      machineStates: createEmptyMachineStateTables(),
      machineStateRecords: [],
      currentParams: createDefaultParams(),
      parameterDriftLimits: createDefaultDriftLimits(),
      machineStatus: createInitialMachineStatus(),
      tiles: new Map(),
      tilesByNumber: new Map(),
      tileCounter: 0,
      totalTilesProduced: 0,
      totalTilesScrapped: 0,
      totalFirstQuality: 0,
      totalSecondQuality: 0,
      totalScrapGraded: 0,
      tileSnapshots: new Map(),
      conveyorPositions: new Map(),
      parameterChanges: [],
      loadedScenarios: [],
      activeScenarios: new Map(),
      scenarioHistory: [],
      /**
       * After a full factory reset, SCN-000 is restored as the active scenario.
       * This ensures the Demo Settings panel reopens with SCN-000 selected,
       * the Senaryo Etkisi bar visible, and the ACTIVE label showing SCN-000.
       */
      activeScenario: REFERENCE_SCENARIO,
      activeScenarioActivationId: null,
      currentPeriodMetrics: createEmptyPeriodMetrics(),
      metricsHistory: [],
      alarmLogs: [],
      unsyncedRecords: { ...EMPTY_UNSYNCED },
      /** Reset conveyor numeric params to factory defaults. */
      conveyorNumericParams: createDefaultConveyorParams(),
      /** Reset conveyor drift limits to SCN-000 zero-drift baseline (0% each, all 4 keys). */
      conveyorDriftLimits: { jammed_time: 0, impacted_tiles: 0, speed_change: 0, jammed_events: 0 },
      /** Reset conveyor analytics arrays — cleared on every factory reset. */
      conveyorStateRecords: [],
      /** Reset conveyor event log — cleared on every factory reset. */
      conveyorEventRecords: [],
      /** Reset TickSnapshot ring buffer — cleared on every factory reset. */
      ...createTickSnapshotInitialState(),
    });
  },
});
