/**
 * useTelemetry.ts — Automatic Simulation State Change Detector
 *
 * Mounts once at the app root level (in Dashboard.tsx) and subscribes to
 * simulationStore via Zustand's `subscribe()` API. It compares previous
 * and next state on every store update and emits a focused telemetry event
 * whenever a meaningful transition occurs.
 *
 * ## What it auto-detects (sim_state events)
 *  - Simulation started (isDataFlowing: false → true)
 *  - Simulation stopped (isDataFlowing: true → false)
 *  - Phase-2 drain started (isDraining: false → true)
 *  - Conveyor jammed (conveyorStatus → 'jammed' or 'jam_scrapping')
 *  - Conveyor unjammed (conveyorStatus: 'jammed' | 'jam_scrapping' → 'running')
 *  - Conveyor stopped (conveyorStatus → 'stopped')
 *  - Conveyor speed changed (conveyorSpeed value changed)
 *  - S-Clock Period changed (sClockPeriod value changed)
 *  - Station interval changed (stationInterval value changed)
 *
 * ## What is NOT handled here (emitted directly by components)
 *  - Panel toggles (ui_action) — emitted in each panel's toggle handler
 *  - Button clicks (ui_action) — emitted at the click site
 *  - CWF message send/receive — emitted in cwfStore
 *
 * ## Important Notes
 *  - Uses `useEffect` + Zustand `subscribe()` for zero re-render overhead.
 *  - Tracks a `prevRef` to detect value changes (subscribe gives next state only).
 *  - All emits are fire-and-forget — this hook never blocks the UI.
 *  - Returns a cleanup function that unsubscribes on component unmount.
 *
 * Used by: Dashboard.tsx (mounted once at app root)
 */

import { useEffect, useRef } from 'react';
import { useSimulationStore } from '../store/simulationStore';
import { telemetry } from '../services/telemetryService';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Subset of SimulationStore state that this hook observes for changes.
 * Only the properties we care about detecting transitions in.
 */
interface ObservedSimState {
    /** Whether the S-Clock is actively ticking */
    isDataFlowing: boolean;
    /** Whether Phase-2 drain is in progress */
    isDraining: boolean;
    /** Current conveyor belt operational status */
    conveyorStatus: string;
    /** Current conveyor speed multiplier */
    conveyorSpeed: number;
    /** S-Clock period in milliseconds */
    sClockPeriod: number;
    /** Station processing interval in ticks */
    stationInterval: number;
}

// =============================================================================
// HOOK
// =============================================================================

/**
 * useTelemetry — Auto-detects simulation state transitions and emits events.
 *
 * Mount this hook ONCE at the app root (Dashboard.tsx). It sets up a Zustand
 * subscription on simulationStore and emits telemetry for every meaningful
 * state change without requiring any props or return values.
 *
 * @example
 *   // In Dashboard.tsx:
 *   import { useTelemetry } from '../hooks/useTelemetry';
 *   function Dashboard() {
 *     useTelemetry();
 *     ...
 *   }
 */
export function useTelemetry(): void {
    /**
     * Track the previous simulation state across renders.
     * Initialized from the current store state on first mount so we don't
     * fire spurious events for the initial state.
     */
    const prevStateRef = useRef<ObservedSimState>(
        (() => {
            const s = useSimulationStore.getState();
            return {
                isDataFlowing: s.isDataFlowing,
                isDraining: s.isDraining,
                conveyorStatus: s.conveyorStatus,
                conveyorSpeed: s.conveyorSpeed,
                sClockPeriod: s.sClockPeriod,
                stationInterval: s.stationInterval,
            };
        })()
    );

    useEffect(() => {
        /**
         * Subscribe to simulationStore. Zustand calls this callback with the
         * NEXT (new) full store state whenever any value changes.
         * We compare against prevStateRef to detect specific transitions.
         */
        const unsubscribe = useSimulationStore.subscribe((next) => {
            const prev = prevStateRef.current;

            // ── Simulation start: isDataFlowing false → true ────────────────
            if (!prev.isDataFlowing && next.isDataFlowing) {
                telemetry.emit({
                    event_type: 'simulation_started',
                    event_category: 'sim_state',
                    properties: {
                        /** S-Clock period at start time (determines sim speed) */
                        sClockPeriod: next.sClockPeriod,
                        /** Conveyor speed at start time */
                        conveyorSpeed: next.conveyorSpeed,
                    },
                });
            }

            // ── Simulation stop: isDataFlowing true → false ─────────────────
            if (prev.isDataFlowing && !next.isDataFlowing && !next.isDraining) {
                telemetry.emit({
                    event_type: 'simulation_stopped',
                    event_category: 'sim_state',
                    properties: {
                        /** Tick count at stop — useful for duration analysis */
                        sClockCount: next.sClockCount,
                        /** Whether the stop was due to drain completion or manual */
                        reason: 'manual',
                    },
                });
            }

            // ── Phase-2 drain started: isDraining false → true ─────────────
            if (!prev.isDraining && next.isDraining) {
                telemetry.emit({
                    event_type: 'simulation_draining',
                    event_category: 'sim_state',
                    properties: {
                        /** Tick count when drain started */
                        sClockCount: next.sClockCount,
                    },
                });
            }

            // ── Conveyor jammed: any status → 'jammed' or 'jam_scrapping' ───
            const wasJammed = prev.conveyorStatus === 'jammed' || prev.conveyorStatus === 'jam_scrapping';
            const isNowJammed = next.conveyorStatus === 'jammed' || next.conveyorStatus === 'jam_scrapping';
            if (!wasJammed && isNowJammed) {
                telemetry.emit({
                    event_type: 'conveyor_jammed',
                    event_category: 'sim_state',
                    properties: {
                        /** Tick when jam started — for jam duration calculation */
                        sClockCount: next.sClockCount,
                        /** Speed at time of jam — helps correlate speed vs jam frequency */
                        conveyorSpeed: next.conveyorSpeed,
                    },
                });
            }

            // ── Conveyor unjammed: 'jammed'/'jam_scrapping' → 'running' ─────
            if (wasJammed && next.conveyorStatus === 'running') {
                telemetry.emit({
                    event_type: 'conveyor_unjammed',
                    event_category: 'sim_state',
                    properties: {
                        /** Tick when jam cleared */
                        sClockCount: next.sClockCount,
                    },
                });
            }

            // ── Conveyor stopped: any status → 'stopped' ────────────────────
            if (prev.conveyorStatus !== 'stopped' && next.conveyorStatus === 'stopped') {
                telemetry.emit({
                    event_type: 'conveyor_stopped_auto',
                    event_category: 'sim_state',
                    properties: {
                        sClockCount: next.sClockCount,
                        /** Previous status before stop */
                        from: prev.conveyorStatus,
                    },
                });
            }

            // ── Conveyor speed changed (rounded to 2dp to avoid float noise) ──
            const prevSpeed = Math.round(prev.conveyorSpeed * 100) / 100;
            const nextSpeed = Math.round(next.conveyorSpeed * 100) / 100;
            if (prevSpeed !== nextSpeed) {
                telemetry.emit({
                    event_type: 'speed_event_fired',
                    event_category: 'sim_state',
                    properties: {
                        /** Old speed value */
                        from: prevSpeed,
                        /** New speed value */
                        to: nextSpeed,
                        /** Tick when speed changed — correlate with jam timeline */
                        sClockCount: next.sClockCount,
                    },
                });
            }

            // ── S-Clock period changed (simulation speed adjusted) ──────────
            if (prev.sClockPeriod !== next.sClockPeriod) {
                telemetry.emit({
                    event_type: 'sclock_period_changed',
                    event_category: 'ui_action',
                    properties: {
                        /** Previous period in ms */
                        from: prev.sClockPeriod,
                        /** New period in ms */
                        to: next.sClockPeriod,
                    },
                });
            }

            // ── Station interval changed ────────────────────────────────────
            if (prev.stationInterval !== next.stationInterval) {
                telemetry.emit({
                    event_type: 'station_interval_changed',
                    event_category: 'ui_action',
                    properties: {
                        from: prev.stationInterval,
                        to: next.stationInterval,
                    },
                });
            }

            // ── Update previous state reference for next comparison ─────────
            prevStateRef.current = {
                isDataFlowing: next.isDataFlowing,
                isDraining: next.isDraining,
                conveyorStatus: next.conveyorStatus,
                conveyorSpeed: next.conveyorSpeed,
                sClockPeriod: next.sClockPeriod,
                stationInterval: next.stationInterval,
            };
        });

        /** Cleanup: unsubscribe when Dashboard unmounts (page navigation or HMR) */
        return unsubscribe;
    }, []); // Empty deps: set up once on mount, never re-run
}
