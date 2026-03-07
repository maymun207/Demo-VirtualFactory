/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  useConveyorBehaviour.ts — Conveyor Behaviour Engine                   ║
 * ║                                                                          ║
 * ║  A React hook that drives AUTOMATIC conveyor behaviour during            ║
 * ║  simulation, based on the active scenario's `conveyorSettings`.          ║
 * ║                                                                          ║
 * ║  Responsibilities:                                                        ║
 * ║    1. Speed fluctuation: randomly adjusts conveyor speed every            ║
 * ║       CB_SPEED_CHECK_INTERVAL_P P-clock ticks when speedChange=true.     ║
 * ║    2. Jam injection: fires setConveyorStatus('jammed') with a            ║
 * ║       stochastic probability when jammedEvents=true, auto-clears after   ║
 * ║       CB_JAM_BASE_DURATION_P + floor(jammedTime × CB_JAM_DURATION_SCALE) ║
 * ║       P-clock ticks, with a cooldown of CB_POST_JAM_COOLDOWN_P ticks    ║
 * ║       between consecutive jams.                                          ║
 * ║                                                                          ║
 * ║  Integration:                                                             ║
 * ║    - Mounted ONCE in App.tsx (alongside useKPISync, useAlarmMonitor).    ║
 * ║    - Subscribes to pClockCount via subscribeWithSelector — zero          ║
 * ║      extra re-renders.                                                   ║
 * ║    - Reads simulationStore actions: setConveyorSpeed,                    ║
 * ║      setConveyorStatus, addAlarm — no changes to the stores.             ║
 * ║    - Re-subscribes whenever activeScenario changes, resetting all        ║
 * ║      behaviour counters so the new scenario takes effect immediately.    ║
 * ║                                                                          ║
 * ║  Consumed by: nothing directly — effects flow through simulationStore    ║
 * ║  (conveyorSpeed, conveyorStatus, alarmLog) which all other modules       ║
 * ║  already subscribe to.                                                   ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */

import { useEffect, useRef } from 'react';
import { useSimulationStore } from '../store/simulationStore';
import { useSimulationDataStore } from '../store/simulationDataStore';
import {
  CONVEYOR_SPEED_RANGE,
  DEFAULT_CONVEYOR_SPEED,
  CB_SPEED_CHECK_INTERVAL_P,
  CB_SPEED_DELTA_MIN,
  CB_SPEED_DELTA_MAX,
  CB_SPEED_CHANGE_PROBABILITY,
  CB_JAM_CHECK_INTERVAL_P,
  CB_JAM_PROBABILITY_PER_CHECK,
  CB_JAM_BASE_DURATION_P,
  CB_JAM_DURATION_SCALE,
  CB_POST_JAM_COOLDOWN_P,
  selectJamLocation,
  JAM_LOCATION_DISPLAY_NAMES,
} from '../lib/params';

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * Internal mutable state for the behaviour engine.
 * Stored in a ref so it survives React renders without triggering them.
 * All fields are reset when the active scenario changes.
 */
interface BehaviourState {
  /** P-clock tick at which the last speed change occurred */
  lastSpeedChangeTick: number;
  /** P-clock tick at which the last jam was TRIGGERED */
  lastJamTick: number;
  /**
   * P-clock tick at which the current jam will auto-clear.
   * null = not currently jammed by the behaviour engine.
   */
  jamClearTick: number | null;
  /** Whether the behaviour engine is currently holding the conveyor in jam state */
  isEngineJammed: boolean;
  /**
   * Phase 2 jam duration in P-ticks, stored during Phase 1 trigger.
   * Applied to jamClearTick when Phase 1 ends and Phase 2 starts.
   */
  jamDurationP: number;
}

// ─── Helper — fresh default state ────────────────────────────────────────────

/**
 * Returns a clean BehaviourState (all counters at 0, no active jam).
 * Called on mount and on every scenario switch.
 */
function createFreshState(): BehaviourState {
  return {
    /** No speed change has occurred yet — start at tick 0 */
    lastSpeedChangeTick: 0,
    /** No jam has occurred yet */
    lastJamTick: 0,
    /** No jam is pending */
    jamClearTick: null,
    /** Engine is not currently holding a jam */
    isEngineJammed: false,
    /** No jam duration stored */
    jamDurationP: 0,
  };
}

// ─── Hook ────────────────────────────────────────────────────────────────────

/**
 * useConveyorBehaviour — Conveyor Behaviour Engine hook.
 *
 * Mount once at the App root. The hook subscribes to pClockCount changes
 * and drives automatic speed fluctuations and jam injection based on the
 * active scenario's `conveyorSettings` data.
 *
 * @example
 * ```tsx
 * // In App.tsx:
 * useConveyorBehaviour();
 * ```
 */
export function useConveyorBehaviour(): void {
  /** Read active scenario from the data store (can be null = reference) */
  const activeScenario = useSimulationDataStore((s) => s.activeScenario);

  /**
   * Read the LIVE boolean toggles from the store — NOT from the scenario definition.
   *
   * WHY: activeScenario.conveyorSettings only reflects the scenario definition
   * (e.g. SCN-000 has speedChange=false by default). When the user opens Demo
   * Settings, sets Speed Change = Yes and presses Update, the value is written
   * to conveyorNumericParams.speed_change in the store. If we still read from
   * activeScenario.conveyorSettings, that change is silently ignored.
   *
   * Solution: subscribe to conveyorNumericParams directly. The hook re-runs
   * (via the useEffect deps array) whenever speed_change or jammed_events changes,
   * so the new toggle state takes effect without requiring a scenario switch.
   */
  const storeSpeedChange = useSimulationDataStore(
    (s) => s.conveyorNumericParams.speed_change,
  );
  const storeJammedEvents = useSimulationDataStore(
    (s) => s.conveyorNumericParams.jammed_events,
  );
  const storeJammedTime = useSimulationDataStore(
    (s) => s.conveyorNumericParams.jammed_time,
  );

  /**
   * Mutable behaviour counters — reset on scenario change.
   * Using a ref avoids React renders; the engine is purely imperative.
   */
  const stateRef = useRef<BehaviourState>(createFreshState());

  /**
   * Whenever the active scenario changes, immediately reset all behaviour
   * counters. This ensures the new scenario's conveyorSettings take effect
   * from the very next P-clock tick, not residuals from the previous scenario.
   */
  useEffect(() => {
    /** Reset to fresh state so new scenario is applied from scratch */
    stateRef.current = createFreshState();

    /**
     * Also reset conveyor speed back to default when scenario changes,
     * so a left-over speed from the previous scenario doesn't pollute the
     * new one.
     */
    useSimulationStore.getState().setConveyorSpeed(DEFAULT_CONVEYOR_SPEED);
  }, [activeScenario]);

  /**
   * Main engine subscription.
   * Re-creates the subscriber whenever activeScenario OR any live conveyor
   * boolean/numeric setting changes so the closure captures the latest values.
   */
  useEffect(() => {
    /**
     * Build a live settings object by MERGING the scenario definition with
     * the user's committed store overrides.
     *
     * Priority (highest to lowest):
     *   1. conveyorNumericParams (store) — user edits from Demo Settings
     *   2. activeScenario.conveyorSettings — scenario definition defaults
     *   3. null — no scenario, no effects
     *
     * This means: even in SCN-000 or SCN-002 (where the scenario defines
     * speedChange=false), if the user has set speed_change=true in the store,
     * the engine will honour it.
     */
    const baseSettings = activeScenario?.conveyorSettings ?? null;
    const settings = baseSettings
      ? {
        ...baseSettings,
        /** Override boolean toggles with live store values. */
        speedChange: storeSpeedChange,
        jammedEvents: storeJammedEvents,
        /** Override jammedTime with live store value. */
        jammedTime: storeJammedTime,
      }
      : null;

    /**
     * Subscribe to P-clock ticks using Zustand's subscribeWithSelector.
     * The selector (s) => s.pClockCount triggers the listener ONLY when
     * pClockCount changes, not on any other store update. This avoids
     * unnecessary work on every S-clock tick.
     */
    const unsubscribe = useSimulationStore.subscribe(
      /** Selector: observe only the production clock counter */
      (s) => s.pClockCount,

      /**
       * Listener: called on each P-clock tick while the simulation runs.
       * @param pClock - Current P-clock count (total tiles produced)
       */
      (pClock) => {
        /** Abort if no scenario active or conveyor is not running */
        const { conveyorStatus, setConveyorSpeed, setConveyorStatus, addAlarm } =
          useSimulationStore.getState();

        /** Only act while the conveyor is in a normal running state */
        if (conveyorStatus === 'stopped') return;

        /** Get current mutable state */
        const st = stateRef.current;

        // ──────────────────────────────────────────────────────────────
        // JAM AUTO-CLEAR — check before new-jam logic to preserve order
        // ──────────────────────────────────────────────────────────────

        /**
         * JAM AUTO-CLEAR — only runs when fully jammed (Phase 2).
         * In Phase 1 (jam_scrapping), tiles are still being scrapped.
         */
        if (
          st.isEngineJammed &&
          conveyorStatus === 'jammed' &&
          st.jamClearTick !== null &&
          pClock >= st.jamClearTick
        ) {
          /**
           * The jam duration has elapsed — auto-clear the jam.
           * Set status back to 'running' and mark the cooldown start tick.
           */
          st.isEngineJammed = false;
          st.jamClearTick = null;
          st.lastJamTick = pClock; // cooldown starts from clear tick

          /** Restore conveyor to running state (Phase 3) */
          setConveyorStatus('running');

          /**
           * Log the auto-clear as a system_info alarm so the operator can
           * see that the engine cleared the jam (not a manual action).
           */
          addAlarm({
            type: 'jam_cleared',
            severity: 'info',
            message: `Conveyor auto-resumed after scenario jam (P-tick ${pClock})`,
          });

          /** Speed and status restored — skip new-jam check this tick */
          return;
        }

        /** While engine-jammed (Phase 1 or Phase 2), do nothing else until auto-clear tick */
        if (st.isEngineJammed) {
          /**
           * ARM JAM CLEAR TIMER — When ConveyorBelt transitions from
           * jam_scrapping → jammed (Phase 1 → Phase 2), jamClearTick is
           * still null. Set it here so the auto-clear check above will
           * fire after jamDurationP ticks of Phase 2.
           */
          if (
            conveyorStatus === 'jammed' &&
            st.jamClearTick === null &&
            st.jamDurationP > 0
          ) {
            st.jamClearTick = pClock + st.jamDurationP;
          }
          return;
        }

        // ──────────────────────────────────────────────────────────────
        // SPEED FLUCTUATION
        // ──────────────────────────────────────────────────────────────

        if (settings?.speedChange) {
          /**
           * Check if a speed-change evaluation is due this tick.
           * The modulo ensures exactly one check per interval window.
           */
          const isSpeedCheckTick = pClock % CB_SPEED_CHECK_INTERVAL_P === 0;

          if (isSpeedCheckTick) {
            /** Roll a probability gate — not every check produces a change */
            const shouldChange = Math.random() < CB_SPEED_CHANGE_PROBABILITY;

            if (shouldChange) {
              /** Compute a random delta between CB_SPEED_DELTA_MIN and CB_SPEED_DELTA_MAX */
              const delta = CB_SPEED_DELTA_MIN +
                Math.random() * (CB_SPEED_DELTA_MAX - CB_SPEED_DELTA_MIN);

              /** Apply delta in a random direction (±) */
              const direction = Math.random() < 0.5 ? 1 : -1;

              /** Clamp the new speed within the allowed range */
              const currentSpeed = useSimulationStore.getState().conveyorSpeed;
              const newSpeed = Math.max(
                CONVEYOR_SPEED_RANGE.min,
                Math.min(CONVEYOR_SPEED_RANGE.max, currentSpeed + direction * delta),
              );

              /** Apply the new speed to the simulation store */
              setConveyorSpeed(newSpeed);

              /** Record the tick so the interval is correctly gated */
              st.lastSpeedChangeTick = pClock;
            }
          }
        }

        // ──────────────────────────────────────────────────────────────
        // JAM INJECTION
        // ──────────────────────────────────────────────────────────────

        if (settings?.jammedEvents) {
          /** Check if a jam-eligibility evaluation is due this tick */
          const isJamCheckTick = pClock % CB_JAM_CHECK_INTERVAL_P === 0;

          if (isJamCheckTick) {
            /** Enforce post-jam cooldown — no new jams within cooldown window */
            const cooldownExpired = (pClock - st.lastJamTick) >= CB_POST_JAM_COOLDOWN_P;

            if (cooldownExpired) {
              /** Roll the jam probability gate */
              const shouldJam = Math.random() < CB_JAM_PROBABILITY_PER_CHECK;

              if (shouldJam) {
                /**
                 * Calculate jam duration in P-ticks (for Phase 2 only).
                 * The jam clear timer starts when Phase 1 ends and Phase 2 begins.
                 * We store a RELATIVE duration; the actual clear tick is set
                 * when ConveyorBelt transitions from jam_scrapping → jammed.
                 */
                const jammedTime = settings.jammedTime;
                const jamDurationP =
                  CB_JAM_BASE_DURATION_P + Math.floor(jammedTime * CB_JAM_DURATION_SCALE);

                /**
                 * === STATION-SPECIFIC JAM ===
                 * 1. Pick a random jam location (weighted: 40% Kiln, 40% Dryer)
                 * 2. Read impacted_tiles from store (with drift applied)
                 * 3. Set jam_scrapping (Phase 1) instead of jammed
                 * 4. Store jam location + scraps remaining for ConveyorBelt
                 */
                const location = selectJamLocation();
                const locationName = JAM_LOCATION_DISPLAY_NAMES[location];

                /** Read impacted tiles from the live store (includes drift) */
                const { conveyorNumericParams } =
                  useSimulationDataStore.getState();
                const impactedTiles = Math.max(
                  1,
                  Math.round(conveyorNumericParams.impacted_tiles ?? 3),
                );

                /** Store the jam duration for Phase 2 — will be applied later */
                st.jamDurationP = jamDurationP;
                /** Mark engine as holding jam state */
                st.isEngineJammed = true;
                /** Record this tick as the jam start for cooldown calculation */
                st.lastJamTick = pClock;
                /**
                 * jamClearTick is NOT set yet — it will be set when Phase 1
                 * ends and Phase 2 starts (see ConveyorBelt.tsx).
                 */
                st.jamClearTick = null;

                /**
                 * Write jam location and scraps to the store so ConveyorBelt
                 * can read them and start Phase 1 scrapping.
                 */
                const { setJamLocation, setConveyorStatus: setStatus } =
                  useSimulationStore.getState();
                setJamLocation(location, impactedTiles);

                /** Trigger Phase 1: belt red, still moving, tiles being scrapped */
                setStatus('jam_scrapping');

                /**
                 * Add a supplementary alarm message identifying this as a
                 * scenario-driven automatic jam with station info.
                 */
                addAlarm({
                  type: 'jam_start',
                  severity: 'critical',
                  message:
                    `Auto-jam at ${locationName} (${impactedTiles} tiles impacted, ` +
                    `Phase 2 duration=${jamDurationP} P-ticks)`,
                });
              }
            }
          }
        }
      },
    );

    /** Clean up subscription when component unmounts or any dep changes */
    return unsubscribe;
  }, [activeScenario, storeSpeedChange, storeJammedEvents, storeJammedTime]);
}
