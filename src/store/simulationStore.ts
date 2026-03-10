/**
 * simulationStore.ts — Core Simulation State (Zustand)
 *
 * Manages the real-time state of the virtual factory simulation:
 *  - S-Clock (system clock) and P-Clock (production clock) counters
 *  - Conveyor belt speed and operational status
 *  - Station occupancy matrix (ProductionTable3D data source)
 *  - Tile tracking (imperative refs for per-frame position updates)
 *  - Fault/jam detection and alarm history
 *  - Waste & shipment counters
 *  - Simulation event logging (start/stop/drain/reset → Supabase)
 *
 * Architecture:
 *  This store is INDEPENDENT — it does NOT access kpiStore or uiStore.
 *  KPI orchestration lives in the `useKPISync` hook.
 *  Multi-store reset lives in the `useFactoryReset` hook.
 *
 * Used by: ConveyorBelt, SceneLogic, useSystemTimer, ControlPanel, Header,
 *          ProductionTable3D, TilePassport, TrashBin, SecondQualityBox, ShipmentBox
 */
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { useWorkOrderStore } from './workOrderStore';
import {
  DEFAULT_S_CLOCK_PERIOD,
  DEFAULT_STATION_INTERVAL,
  DEFAULT_CONVEYOR_SPEED,
  STATION_STAGES,
  SNAPSHOT_TOLERANCE,
  INITIAL_STATIONS,
  STATUS_MATRIX_ROWS,
  CONVEYOR_SPEED_RANGE,
  S_CLOCK_RANGE,
  STATION_INTERVAL_RANGE,
  MAX_ALARM_LOG,
  createInitialStatusMatrix,
  JAM_LOCATION_DISPLAY_NAMES,
} from '../lib/params';
import type { JamLocation } from '../lib/params';
import { eventBus } from '../lib/eventBus';
import { logSimulationEvent } from '../services/simulationEventLogger';
// Import the session ID accessor from the NEUTRAL bridge module (sessionAccessor.ts).
// This avoids a circular static import:
//   simulationStore → simulationDataStore → simulationStore (getState)
// The bridge has NO top-level store imports — it only holds a getter function
// registered by simulationDataStore after it is fully initialised.
import { getActiveSessionId } from './sessionAccessor';



// ─── Interfaces ──────────────────────────────────────────────────────────────

/**
 * All supported alarm event types.
 *
 * Conveyor:
 *  - 'jam_start'       — conveyor entered jammed state
 *  - 'jam_cleared'     — conveyor jam resolved (manual or auto-resume)
 *
 * Machine:
 *  - 'machine_error'   — station entered error status
 *  - 'machine_warning' — station entered warning status
 *  - 'machine_normal'  — station returned to normal status
 *
 * Quality:
 *  - 'quality_alert'   — FTQ dropped below threshold
 *  - 'scrap_alert'     — scrap rate exceeded threshold
 *
 * System:
 *  - 'oee_alert'       — OEE dropped below threshold
 *  - 'energy_alert'    — energy consumption exceeded threshold
 *  - 'system_info'     — general informational event (start, reset, etc.)
 */
export type AlarmType =
  | 'jam_start'
  | 'jam_cleared'
  | 'machine_error'
  | 'machine_warning'
  | 'machine_normal'
  | 'quality_alert'
  | 'scrap_alert'
  | 'oee_alert'
  | 'energy_alert'
  | 'system_info';

/** Alarm severity levels for visual prioritization */
export type AlarmSeverity = 'critical' | 'warning' | 'info';

/**
 * A single entry in the alarm history log.
 * Supports conveyor, machine, quality, and system alarm events.
 */
export interface AlarmEntry {
  /** S-Clock tick at which this alarm occurred */
  sClockTick: number;
  /** Type of alarm event */
  type: AlarmType;
  /** Severity level for badge coloring and prioritization */
  severity: AlarmSeverity;
  /** Timestamp (Date.now()) for real-world time correlation */
  timestamp: number;
  /** Optional station identifier (e.g., 'press', 'kiln') */
  stationId?: string;
  /** Optional human-readable message with details */
  message?: string;
}

/**
 * Full simulation state shape.
 * Divided into logical groups: data flow, clocks, matrix, counters,
 * fault tracking, conveyor, stations, reset, and actions.
 */
interface SimulationState {
  // ── Data Flow ──────────────────────────────────────────────────
  /** Master toggle: when false, the system timer stops ticking */
  isDataFlowing: boolean;

  /**
   * Drain mode: when true, the simulation is winding down.
   * The conveyor belt keeps moving so in-flight tiles can reach their
   * exit thresholds (sort/collect/waste) and increment visual counters,
   * but NO new tiles are spawned (P-Clock is suppressed).
   * When all tiles have exited (partsRef.size === 0), completeDrain()
   * sets isDraining=false + isDataFlowing=false + conveyorStatus='stopped'.
   */
  isDraining: boolean;

  // ── Tile Tracking (imperative, not reactive) ───────────────────
  /**
   * Mutable ref holding the normalized t-parameter (0→1) of each
   * tile currently on the conveyor. Updated imperatively inside
   * ConveyorBelt's useFrame loop for maximum performance.
   */
  partPositionsRef: { current: number[] };
  /**
   * Parallel array to partPositionsRef: the production ID of each tile.
   * partIdsRef.current[i] corresponds to partPositionsRef.current[i].
   */
  partIdsRef: { current: number[] };

  /**
   * Mutable ref holding the TOTAL count of tiles currently alive in
   * PartSpawner's partsRef (regardless of their lifecycle state).
   *
   * This counts ALL tiles, including:
   *   - Normal tiles moving along the belt
   *   - Tiles queued inside the Dryer station (isQueued=true)
   *   - Tiles in the sort-to-waste animation (isSorted=true)
   *   - Tiles in the collect-to-shipment animation (isCollected=true)
   *
   * WHY THIS EXISTS:
   *   partPositionsRef only tracks tiles with isSorted=false AND isQueued=false.
   *   When the last normal tile gets sorted, partPositionsRef empties — but
   *   the dryer queue may still hold tiles waiting to be processed.
   *   Using partPositionsRef.length===0 as the "belt empty" signal therefore
   *   causes premature simulation stop, abandoning queued tiles forever.
   *
   *   totalPartsRef is the ONLY correct signal: when it equals 0, every
   *   tile has been fully processed (shipped or scrapped) and removed from
   *   partsRef. Safe to stop the simulation at that point.
   *
   * Updated by: ConveyorBelt PartSpawner useFrame loop (every frame)
   * Read by:    useWorkOrderEnforcer Phase 2
   */
  totalPartsRef: { current: number };

  // ── Clock State ────────────────────────────────────────────────
  /** Interval in ms between S-Clock ticks (adjustable via ControlPanel slider) */
  sClockPeriod: number;
  /**
   * How many S-Clock ticks between each P-Clock tick.
   * Lower = faster production rate.
   */
  stationInterval: number;
  /** Total S-Clock ticks since simulation started (monotonically increasing) */
  sClockCount: number;
  /** Total P-Clock ticks = total tiles produced (resets on factory reset) */
  pClockCount: number;

  // ── Status Matrix (3D Production Table data) ───────────────────
  /**
   * 2D array: rows = time snapshots, columns = stations.
   * Each cell is "Tile #N" or null. Newest row is index 0.
   */
  statusMatrix: (string | null)[][];
  /** S-Clock value at which each statusMatrix row was captured */
  statusMatrixClocks: number[];

  // ── Production Counters ────────────────────────────────────────
  /** Tiles rejected and sent to the waste bin */
  wasteCount: number;
  /** Tiles classified as scrap and discarded at their station */
  scrapCount: number;
  /** Tiles routed to the second quality box */
  secondQualityCount: number;
  /** Tiles that reached the end of the conveyor and shipped (first quality) */
  shipmentCount: number;
  /**
   * Circular buffer holding the tile IDs (production IDs) of the last
   * FORKLIFT_PALLET_STACK_MAX shipped tiles. Used by Forklift.tsx to render
   * the tile ID label on each stacked layer on the pallet.
   */
  shippedTileIds: number[];

  // ── Fault / Jam Tracking ───────────────────────────────────────
  /** Total number of jam events since simulation started */
  faultCount: number;
  /** Date.now() when current jam started, or null if not jammed */
  jamStartedAt: number | null;
  /** Ring-buffered history of jam start/clear events (max MAX_ALARM_LOG) */
  alarmLog: AlarmEntry[];

  // ── Conveyor ───────────────────────────────────────────────────
  /** Current visual speed of the conveyor belt (range: CONVEYOR_SPEED_RANGE) */
  conveyorSpeed: number;
  /**
   * Operational status of the conveyor:
   *  'running'       — tiles move, P-Clock ticks
   *  'stopped'       — tiles freeze, P-Clock paused
   *  'jam_scrapping' — belt red, still moving, tiles being scrapped at jammed station
   *  'jammed'        — belt frozen, worker clearing the jam
   */
  conveyorStatus: 'running' | 'stopped' | 'jammed' | 'jam_scrapping';

  // ── Station-Specific Jam ────────────────────────────────────────
  /** Which station (or conveyor belt) is currently jammed. null = no jam */
  jamLocation: JamLocation | null;
  /** Tiles remaining to be scrapped before Phase 1 → Phase 2 transition */
  jamScrapsRemaining: number;

  // ── Stations ───────────────────────────────────────────────────
  /** Array of station definitions (press, drying, glaze, etc.) for 3D rendering */
  stations: typeof INITIAL_STATIONS;

  // ── Reset ──────────────────────────────────────────────────────
  /**
   * Incremented on each factory reset.
   * Used as React `key` on <ConveyorBelt> to force full remount.
   */
  resetVersion: number;
  /** Random 6-digit session ID, regenerated on each reset */
  sessionId: string;

  // ── Actions ────────────────────────────────────────────────────

  /** Start/stop the simulation (toggles isDataFlowing and conveyorStatus) */
  toggleDataFlow: () => void;
  /**
   * Idempotent simulation stop. Unlike toggleDataFlow(), this ONLY stops —
   * calling it when already stopped is a safe no-op.
   * Used by useWorkOrderEnforcer to prevent accidentally restarting the
   * simulation if called at the wrong moment.
   */
  stopDataFlow: () => void;
  /**
   * Complete the drain process. Called by ConveyorBelt when partsRef.size===0
   * during drain mode. Sets isDataFlowing=false, isDraining=false,
   * conveyorStatus='stopped'.
   */
  completeDrain: () => void;
  /** Set S-Clock period in ms (clamped to S_CLOCK_RANGE) */
  setSClockPeriod: (period: number) => void;
  /** Set station interval in S-Clock ticks (clamped to STATION_INTERVAL_RANGE) */
  setStationInterval: (interval: number) => void;
  /** Set conveyor speed (clamped to CONVEYOR_SPEED_RANGE) */
  setConveyorSpeed: (speed: number) => void;
  /**
   * Transition conveyor operational status.
   * Side effects: jam → faultCount++, alarm logged; clear → alarm logged.
   */
  setConveyorStatus: (status: 'running' | 'stopped' | 'jammed' | 'jam_scrapping') => void;
  /** Set jam location and number of tiles to scrap (Phase 1 entry) */
  setJamLocation: (location: JamLocation, scrapsRemaining: number) => void;
  /** Decrement the jam scraps remaining counter (called per tile scrapped) */
  decrementJamScraps: () => void;
  /** Increment the waste bin counter by 1 */
  incrementWasteCount: () => void;
  /** Increment the scrap counter by 1 (tiles discarded at station) */
  incrementScrapCount: () => void;
  /** Increment the second quality counter by 1 */
  incrementSecondQualityCount: () => void;
  /** Increment the shipment counter by 1 */
  incrementShipmentCount: () => void;
  /**
   * Record the production ID of a newly shipped tile.
   * Keeps only the last FORKLIFT_PALLET_STACK_MAX IDs (sliding window).
   */
  addShippedTileId: (id: number) => void;
  /**
   * Advance the S-Clock by 1 tick.
   * If a P-Clock tick is due (and conveyor is running), also:
   *   - Increment pClockCount
   *   - Snapshot station occupancy into statusMatrix
   */
  advanceSClock: () => void;
  /**
   * Reset all simulation state (clocks, counters, matrix, alarms).
   * Does NOT reset KPIs or UI — use useFactoryReset hook for full reset.
   */
  resetSimulation: () => void;
  /**
   * General-purpose alarm logger.
   * Pushes one AlarmEntry into the ring-buffered alarmLog.
   */
  addAlarm: (entry: Omit<AlarmEntry, 'sClockTick' | 'timestamp'>) => void;
}

// ─── Store Implementation ────────────────────────────────────────────────────

export const useSimulationStore = create<SimulationState>()(
  subscribeWithSelector((set) => ({
    // ── Initial State ──────────────────────────────────────────────
    isDataFlowing: false,
    /** Not draining at start — drain mode activates on user Stop */
    isDraining: false,
    partPositionsRef: { current: [] },
    partIdsRef: { current: [] },
    /** No tiles alive at start — PartSpawner hasn't created any yet */
    totalPartsRef: { current: 0 },
    sClockPeriod: DEFAULT_S_CLOCK_PERIOD,
    stationInterval: DEFAULT_STATION_INTERVAL,
    sClockCount: 0,
    pClockCount: 0,
    statusMatrix: createInitialStatusMatrix(),
    statusMatrixClocks: [],
    wasteCount: 0,
    /** No scrap tiles yet */
    scrapCount: 0,
    secondQualityCount: 0,
    shipmentCount: 0,
    /** Empty at start — no tiles have shipped yet */
    shippedTileIds: [],
    faultCount: 0,
    jamStartedAt: null,
    alarmLog: [],
    conveyorSpeed: DEFAULT_CONVEYOR_SPEED,
    /** Conveyor starts in stopped state — user must press Start to begin */
    conveyorStatus: 'stopped',
    /** No station-specific jam active at start */
    jamLocation: null,
    /** No tiles pending scrap at start */
    jamScrapsRemaining: 0,
    stations: INITIAL_STATIONS,
    resetVersion: 0,
    sessionId: generateSessionId(),

    // ── Action Implementations ─────────────────────────────────────

    /**
     * toggleDataFlow — Start or stop the entire simulation.
     *
     * DRAIN MODE LOGIC:
     *   - Running → Stop: if tiles are on the belt, enters 'draining' mode.
     *     Belt keeps moving, but P-Clock ticks are suppressed (no new tiles).
     *     Tiles already on the belt exit naturally, incrementing visual counters.
     *     When partsRef.size === 0, completeDrain() fires.
     *   - Draining → Stop (double-click): force-stop escape hatch.
     *     Immediately stops everything (tiles may be lost in-flight).
     *   - Stopped → Start: normal start, clears isDraining.
     */
    toggleDataFlow: () => {
      /** Capture pre-transition state for event logging */
      const prev = useSimulationStore.getState();
      set((s) => {
        /** Currently stopped → START the simulation */
        if (!s.isDataFlowing) {
          return {
            isDataFlowing: true,
            isDraining: false,
            conveyorStatus: 'running',
          };
        }

        /** Currently draining → FORCE STOP (escape hatch) */
        if (s.isDraining) {
          return {
            isDataFlowing: false,
            isDraining: false,
            conveyorStatus: 'stopped',
          };
        }

        /**
         * Currently running → enter DRAIN MODE if tiles are on belt.
         * totalPartsRef.current > 0 means there are visual tiles in flight.
         * If belt is already empty, skip drain and stop immediately.
         */
        if (s.totalPartsRef.current > 0) {
          return {
            isDraining: true,
            /** isDataFlowing stays true — S-Clock must keep ticking
             *  so the useFrame loop continues animating tiles. */
            conveyorStatus: 'running',
          };
        }

        /** Belt already empty — stop immediately (no drain needed) */
        return {
          isDataFlowing: false,
          isDraining: false,
          conveyorStatus: 'stopped',
        };
      });

      /** Fire-and-forget event log AFTER synchronous state update.
       *  queueMicrotask guarantees both stores are fully initialised before
       *  getActiveSessionIdSync() is called — no async/await needed. */
      queueMicrotask(() => {
        const next = useSimulationStore.getState();
        // getActiveSessionIdSync is safe here: called after module init.
        const simId = getActiveSessionId();
        if (!simId) return; /** No active session — skip logging */
        const tick = next.sClockCount;

        if (!prev.isDataFlowing && next.isDataFlowing) {
          /** Stopped → Started */
          logSimulationEvent(simId, tick, 'started', { pClockCount: next.pClockCount });
        } else if (prev.isDraining && !next.isDataFlowing) {
          /** Draining → Force Stopped */
          logSimulationEvent(simId, tick, 'force_stopped', { pClockCount: next.pClockCount });
        } else if (prev.isDataFlowing && !prev.isDraining && next.isDraining) {
          /** Running → Drain Started */
          logSimulationEvent(simId, tick, 'drain_started', { pClockCount: next.pClockCount });
        } else if (prev.isDataFlowing && !next.isDataFlowing && !prev.isDraining) {
          /** Running → Stopped (belt was empty) */
          logSimulationEvent(simId, tick, 'stopped', { pClockCount: next.pClockCount });
        }
      });
    },

    /**
     * Idempotent simulation stop.
     * Sets isDataFlowing=false, isDraining=false, and conveyorStatus='stopped'
     * ONLY if currently running. Safe to call multiple times — calling when
     * already stopped is a safe no-op.
     * The enforcer MUST use this instead of toggleDataFlow() to avoid accidentally
     * restarting the simulation if triggered at an unexpected moment.
     */
    stopDataFlow: () => {
      const wasStopped = !useSimulationStore.getState().isDataFlowing;
      set((s) => {
        /** Guard: if already stopped, do nothing */
        if (!s.isDataFlowing) return {};
        return {
          isDataFlowing: false,
          isDraining: false,
          conveyorStatus: 'stopped',
        };
      });

      /** Log 'stopped' event only if we actually transitioned.
       *  queueMicrotask ensures the store is settled before reading session ID. */
      if (!wasStopped) {
        queueMicrotask(() => {
          const { sClockCount, pClockCount } = useSimulationStore.getState();
          // Synchronous call — safe inside queueMicrotask.
          const simId = getActiveSessionId();
          if (simId) logSimulationEvent(simId, sClockCount, 'stopped', { pClockCount });
        });
      }
    },

    /**
     * completeDrain — Called by ConveyorBelt when all tiles have exited
     * the belt during drain mode (partsRef.size === 0 && isDraining).
     * Performs the final stop: isDataFlowing=false, isDraining=false,
     * conveyorStatus='stopped'.
     */
    completeDrain: () => {
      set(() => ({
        isDataFlowing: false,
        isDraining: false,
        conveyorStatus: 'stopped',
      }));

      /** Log drain completion event.
       *  queueMicrotask ensures the store is settled before reading session ID. */
      queueMicrotask(() => {
        const { sClockCount, pClockCount } = useSimulationStore.getState();
        // Synchronous call — safe inside queueMicrotask.
        const simId = getActiveSessionId();
        if (simId) logSimulationEvent(simId, sClockCount, 'drain_completed', { pClockCount });
      });
    },

    setSClockPeriod: (period) => set({
      sClockPeriod: Math.max(S_CLOCK_RANGE.min, Math.min(S_CLOCK_RANGE.max, period)),
    }),
    setStationInterval: (interval) => set({
      stationInterval: Math.max(STATION_INTERVAL_RANGE.min, Math.min(STATION_INTERVAL_RANGE.max, interval)),
    }),
    setConveyorSpeed: (speed) => set({
      conveyorSpeed: Math.max(CONVEYOR_SPEED_RANGE.min, Math.min(CONVEYOR_SPEED_RANGE.max, speed)),
    }),

    /**
     * setConveyorStatus — Transition conveyor operational status with alarm side-effects.
     *
     * Transition map (previous → next → alarm):
     *   running       → jam_scrapping  :  CRITICAL  jam_start   (auto-jam, Phase 1 entry)
     *   running       → jammed         :  CRITICAL  jam_start   (manual Jammed button / CWF)
     *   jam_scrapping → jammed         :  WARNING   jam_start   (Phase 1 done, belt fully stopped)
     *   jammed|jam_scrapping → running :  INFO      jam_cleared (jam resolved, belt restarting)
     *
     * New jams also increment faultCount and stamp jamStartedAt.
     * Clearing a jam resets jamLocation and jamScrapsRemaining.
     * All transitions emit on the eventBus for Supabase sync via simulationDataStore.
     */
    setConveyorStatus: (status) =>
      set((s) => {
        /** Whether the conveyor was already in any jam phase before this call. */
        const wasInJam = s.conveyorStatus === 'jammed' || s.conveyorStatus === 'jam_scrapping';

        /** Name four distinct transitions for readable branch conditions below. */
        const isAutoJam   = status === 'jam_scrapping' && !wasInJam;                    // auto Phase 1
        const isDirectJam = status === 'jammed'        && !wasInJam;                    // manual jam
        const isPhase2    = status === 'jammed'        && s.conveyorStatus === 'jam_scrapping'; // Phase 1→2
        const isClearing  = status === 'running'       && wasInJam;                     // jam resolved

        const now            = Date.now();
        let nextFaultCount   = s.faultCount;
        let nextJamStartedAt = s.jamStartedAt;

        /** Resolved station name — 'Conveyor' fallback when no specific location is set. */
        const stationName = s.jamLocation
          ? JAM_LOCATION_DISPLAY_NAMES[s.jamLocation]
          : 'Conveyor';

        /** Ring-buffered copy of the alarm log (caps at MAX_ALARM_LOG entries). */
        const nextAlarmLog = s.alarmLog.length >= MAX_ALARM_LOG
          ? s.alarmLog.slice(-MAX_ALARM_LOG + 1)
          : [...s.alarmLog];

        /** Partial state delta — conveyor status always changes; other fields are branch-specific. */
        const updates: Record<string, unknown> = { conveyorStatus: status };

        /**
         * emitAlarm — Push one alarm entry to the log AND fire the event bus.
         * Eliminates the repeated alarmLog.push + eventBus.emit pattern across branches.
         */
        const emitAlarm = (type: AlarmType, severity: AlarmSeverity, message: string) => {
          nextAlarmLog.push({ sClockTick: s.sClockCount, type, severity, timestamp: now, message });
          eventBus.emit('alarm', { type, severity, message });
        };

        if (isAutoJam) {
          /** Auto-jam Phase 1: belt still moving, tiles being scrapped at jammed station. */
          nextFaultCount  += 1;
          nextJamStartedAt = now;
          emitAlarm('jam_start', 'critical', `JAM detected at ${stationName}`);

        } else if (isDirectJam) {
          /** Manual jam: operator clicked Jammed button or CWF issued set_conveyor_jammed. */
          nextFaultCount  += 1;
          nextJamStartedAt = now;
          emitAlarm('jam_start', 'critical', `JAM triggered manually at ${stationName}`);

        } else if (isPhase2) {
          /** Phase 1 → Phase 2: tile scrapping done, belt now fully stopped for clearing. */
          emitAlarm('jam_start', 'warning', `Scrap complete at ${stationName}, belt stopped for clearing`);

        } else if (isClearing) {
          /** Jam resolved: belt restarting, reset jam location and scrap counter. */
          nextJamStartedAt           = null;
          updates.jamLocation        = null;
          updates.jamScrapsRemaining = 0;
          emitAlarm('jam_cleared', 'info', `JAM CLEARED at ${stationName}`);
        }

        return {
          ...updates,
          faultCount:   nextFaultCount,
          jamStartedAt: nextJamStartedAt,
          alarmLog:     nextAlarmLog,
        };
      }),

    /**
     * setJamLocation — Set which station is jammed and how many tiles to scrap.
     * Called by useConveyorBehaviour when triggering a new jam event.
     */
    setJamLocation: (location, scrapsRemaining) =>
      set(() => ({
        jamLocation: location,
        jamScrapsRemaining: scrapsRemaining,
      })),

    /**
     * decrementJamScraps — Called each time a tile is scrapped during Phase 1.
     * When counter reaches 0, ConveyorBelt transitions to Phase 2 (jammed).
     */
    decrementJamScraps: () =>
      set((s) => ({
        jamScrapsRemaining: Math.max(0, s.jamScrapsRemaining - 1),
      })),

    incrementWasteCount: () => set((s) => ({ wasteCount: s.wasteCount + 1 })),
    incrementScrapCount: () => set((s) => ({ scrapCount: s.scrapCount + 1 })),
    incrementSecondQualityCount: () =>
      set((s) => ({ secondQualityCount: s.secondQualityCount + 1 })),
    incrementShipmentCount: () =>
      set((s) => ({ shipmentCount: s.shipmentCount + 1 })),

    /**
     * Record a shipped tile's production ID in the circular buffer.
     * Keeps at most FORKLIFT_PALLET_STACK_MAX entries so the array never grows
     * unboundedly and always reflects the CURRENT pallet cycle.
     */
    addShippedTileId: (id) =>
      set((s) => ({
        shippedTileIds: [...s.shippedTileIds.slice(-(4 - 1)), id],
      })),

    /**
     * advanceSClock — Called by useSystemTimer every sClockPeriod ms.
     *
     * 1. Increment S-Clock counter
     * 2. Check if a P-Clock tick is due (every `stationInterval` S-Clock ticks)
     * 3. If P-Clock fires AND conveyor is running:
     *    - Increment production counter
     *    - Snapshot current station occupancy from tile positions
     *    - Push snapshot into statusMatrix (newest-first, capped to STATUS_MATRIX_ROWS)
     */
    advanceSClock: () =>
      set((state) => {
        const nextSClockCount = state.sClockCount + 1;
        let nextPClockCount = state.pClockCount;
        let nextStatusMatrix = state.statusMatrix;
        let nextStatusMatrixClocks = state.statusMatrixClocks;

        /**
         * P_clk fires every `stationInterval` S_clk ticks, but only when
         * running or jam_scrapping (Phase 1 — belt is still moving)
         */
        const isPressTick = nextSClockCount % state.stationInterval === 0;
        const beltIsMoving =
          state.conveyorStatus === 'running' ||
          state.conveyorStatus === 'jam_scrapping';
        /**
         * DRAIN MODE ONLY: suppress P-Clock ticks during drain.
         * The belt keeps moving (beltIsMoving=true) so tiles can exit,
         * but we do NOT advance pClockCount — no new tiles should spawn.
         *
         * NOTE: pressLimitReached is NOT included here on purpose.
         * When pressLimitReached fires, the ConveyorBelt spawn guard
         * already blocks tile creation. But pClockCount must still
         * increment so the spawn useEffect fires (and then early-returns).
         * If we froze pClockCount here, it would stop BEFORE reaching
         * the work order target (e.g. 526 instead of 530) due to
         * MAX_VISIBLE_PARTS causing tilesSpawned to outpace pClockCount.
         */
        const suppressPClock = state.isDraining;
        if (isPressTick && beltIsMoving && !suppressPClock) {
          nextPClockCount += 1;
        }

        /**
         * StatusMatrix snapshot — runs INDEPENDENTLY of P-Clock increment.
         * The production table must update whenever the belt is moving,
         * even during drain mode (tiles passing stations) or after
         * pressLimitReached (tiles still draining toward exit).
         *
         * The Press column shows null when no tile was actually pressed
         * (drain mode or press limit reached).
         */
        if (isPressTick && beltIsMoving) {
          const pressLimitReached = useWorkOrderStore.getState().pressLimitReached;
          const claimed = new Set<number>();
          const currentOccupancy = STATION_STAGES.map((stage, idx) => {
            /**
             * Press column: show the freshly pressed tile ONLY when a
             * tile was actually pressed this tick. During drain or after
             * press limit, show null (no tile pressed).
             */
            if (idx === 0) {
              if (suppressPClock || pressLimitReached) return null;
              return `Tile #${nextPClockCount}`;
            }
            /** Find the closest unclaimed tile within tolerance. */
            let bestIdx = -1;
            let bestDist = SNAPSHOT_TOLERANCE;
            state.partPositionsRef.current.forEach((t, i) => {
              if (claimed.has(i)) return;
              const d = Math.abs(t - stage);
              if (d < bestDist) {
                bestDist = d;
                bestIdx = i;
              }
            });
            if (bestIdx !== -1) claimed.add(bestIdx);
            const partId =
              bestIdx !== -1 ? state.partIdsRef.current[bestIdx] : null;
            return partId ? `Tile #${partId}` : null;
          });

          // Prepend new row, trim to max rows
          nextStatusMatrix = [
            currentOccupancy,
            ...state.statusMatrix.slice(0, STATUS_MATRIX_ROWS - 1),
          ];
          nextStatusMatrixClocks = [
            nextSClockCount,
            ...state.statusMatrixClocks.slice(0, STATUS_MATRIX_ROWS - 1),
          ];
        }

        return {
          sClockCount: nextSClockCount,
          pClockCount: nextPClockCount,
          statusMatrix: nextStatusMatrix,
          statusMatrixClocks: nextStatusMatrixClocks,
        };
      }),

    /**
     * Reset only simulation-specific state.
     * KPIs/UI are reset separately via the useFactoryReset hook.
     */
    resetSimulation: () => {
      /** Capture outgoing session for event logging before reset */
      const { sClockCount, pClockCount } = useSimulationStore.getState();

      set((s) => ({
        partPositionsRef: { current: [] },
        partIdsRef: { current: [] },
        /** Reset total part count — PartSpawner hasn't spawned anything yet after reset */
        totalPartsRef: { current: 0 },
        sClockCount: 0,
        pClockCount: 0,
        statusMatrix: createInitialStatusMatrix(),
        statusMatrixClocks: [],
        isDataFlowing: false,
        /** Clear drain mode on full factory reset */
        isDraining: false,
        conveyorSpeed: DEFAULT_CONVEYOR_SPEED,
        /** Reset clock sliders to their default values alongside conveyor speed */
        sClockPeriod: DEFAULT_S_CLOCK_PERIOD,
        stationInterval: DEFAULT_STATION_INTERVAL,
        /** Reset always returns conveyor to stopped — user must restart manually */
        conveyorStatus: 'stopped',
        /** Clear any active jam on reset */
        jamLocation: null,
        jamScrapsRemaining: 0,
        resetVersion: s.resetVersion + 1,
        wasteCount: 0,
        /** Reset scrap counter */
        scrapCount: 0,
        secondQualityCount: 0,
        shipmentCount: 0,
        /** Reset shipped tile ID history — pallet is empty after factory reset */
        shippedTileIds: [],
        faultCount: 0,
        jamStartedAt: null,
        alarmLog: [],
        stations: INITIAL_STATIONS,
        sessionId: generateSessionId(),
      }));

      /** Log reset event using pre-reset tick values.
       *  queueMicrotask ensures the store is settled before reading session ID. */
      queueMicrotask(() => {
        // Synchronous call — safe inside queueMicrotask.
        const simId = getActiveSessionId();
        if (simId) logSimulationEvent(simId, sClockCount, 'reset', { pClockCount });
      });
    },

    addAlarm: (entry) =>
      set((s) => {
        const nextAlarmLog = s.alarmLog.length >= MAX_ALARM_LOG
          ? s.alarmLog.slice(-MAX_ALARM_LOG + 1)
          : [...s.alarmLog];
        nextAlarmLog.push({
          ...entry,
          sClockTick: s.sClockCount,
          timestamp: Date.now(),
        });
        return { alarmLog: nextAlarmLog };
      }),

  })),
);

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Generate a random 6-digit numeric session ID.
 * Displayed in the Header as a visual identifier for the current simulation run.
 */
function generateSessionId(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}
