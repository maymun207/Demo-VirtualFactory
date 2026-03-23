/**
 * useCopilotHeartbeat.ts — Browser Heartbeat + Vercel Evaluation Trigger
 *
 * React hook that sends periodic heartbeat POST requests while copilot mode
 * is active. On the Vercel deployment, this hook ALSO triggers copilot
 * evaluation cycles by calling /api/cwf/copilot/evaluate every
 * COPILOT_VERCEL_POLL_INTERVAL_MS (6 seconds).
 *
 * Architecture:
 *   LOCAL DEV (Vite port 5173):
 *     - Sends heartbeat only (POST /api/cwf/copilot/heartbeat every 5s)
 *     - The cwf-dev-server.ts runs the CopilotEngine in-process
 *
 *   VERCEL PRODUCTION:
 *     - Sends combined evaluate call (POST /api/cwf/copilot/evaluate every 6s)
 *     - The evaluate endpoint is stateless: reads state, calls Gemini, applies
 *       corrections, updates heartbeat — all in one invocation
 *     - Separate heartbeat is NOT needed (evaluate updates heartbeat internally)
 *
 * IMPORTANT — Simulation ID used for heartbeats:
 *   Heartbeats use the Supabase UUID from simulationDataStore.session?.id
 *   (the single source of truth). This is the UUID keyed on copilot_config.
 *   Do NOT use the human-readable session code from simulationStore.sessionId.
 *
 * Timing:
 *   - LOCAL:  heartbeat every COPILOT_HEARTBEAT_INTERVAL_MS (5 seconds)
 *   - VERCEL: evaluate every COPILOT_VERCEL_POLL_INTERVAL_MS (6 seconds)
 *   - Server timeout: COPILOT_HEARTBEAT_TIMEOUT_MS (45 seconds on Vercel)
 *
 * Used by: CWFChatPanel.tsx (mounted when CWF panel is open)
 *
 * Dependencies:
 *   - src/store/copilotStore.ts         (reads isEnabled)
 *   - src/store/simulationDataStore.ts  (reads session?.id — the Supabase UUID)
 *   - src/lib/params/copilot.ts         (timing constants)
 */

import { useEffect, useRef } from 'react';
import { createLogger } from '../lib/logger';
import { useCopilotStore } from '../store/copilotStore';
/** SINGLE SOURCE OF TRUTH: session UUID lives in simulationDataStore */
import { useSimulationDataStore } from '../store/simulationDataStore';
import {
    COPILOT_HEARTBEAT_INTERVAL_MS,
    COPILOT_FEATURE_ENABLED,
    COPILOT_VERCEL_POLL_INTERVAL_MS,
} from '../lib/params/copilot';

/** Module-level logger for copilot heartbeat */
const log = createLogger('CopilotHeartbeat');

// =============================================================================
// ENVIRONMENT DETECTION
// =============================================================================

/**
 * Detect whether the app is running under Vite local development server.
 * Locally, the cwf-dev-server.ts handles copilot evaluation via its in-memory
 * CopilotEngine. On Vercel (production), we must trigger evaluation from the
 * browser via /api/cwf/copilot/evaluate.
 *
 * Detection heuristic: Vite dev server runs on port 5173 by default.
 * We also check for localhost/127.0.0.1 as a secondary indicator.
 */
function isLocalDev(): boolean {
    if (typeof window === 'undefined') return false;
    const { hostname, port } = window.location;
    /** Vite dev server uses port 5173 on localhost */
    const isVitePort = port === '5173' || port === '5174';
    /** Only flag as local if on localhost or 127.0.0.1 */
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
    return isVitePort && isLocalhost;
}

// =============================================================================
// HOOK
// =============================================================================

/**
 * Send periodic heartbeats (local) or evaluation triggers (Vercel) while
 * copilot mode is active.
 *
 * Lifecycle:
 *   - When isEnabled transitions to true  → start interval, send immediately
 *   - When isEnabled transitions to false → clear interval, stop
 *   - When component unmounts             → clear interval
 */
export function useCopilotHeartbeat(): void {
    /** Timer reference for cleanup on unmount or dependency change */
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    /** Track if an evaluate call is currently in-flight to prevent overlap */
    const evaluateInFlightRef = useRef<boolean>(false);

    /** Read copilot enabled state from the Zustand store */
    const isEnabled = useCopilotStore((s) => s.isEnabled);

    /**
     * SINGLE SOURCE OF TRUTH: read the simulation UUID from simulationDataStore.
     * The copilot_config table is keyed on this UUID (simulation_sessions.id).
     * Do NOT use the 6-digit display code — it does NOT match the DB primary key.
     */
    const simulationId = useSimulationDataStore((s) => s.session?.id ?? null);

    useEffect(() => {
        /** Guard: feature flag must be on, copilot must be enabled, UUID must exist */
        if (!COPILOT_FEATURE_ENABLED || !isEnabled || !simulationId) {
            /** Clear any existing interval when copilot is disabled or no session */
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
            return;
        }

        const runningLocally = isLocalDev();

        if (runningLocally) {
            // =================================================================
            // LOCAL DEV: heartbeat only — cwf-dev-server runs the engine
            // =================================================================

            /**
             * Send a single heartbeat POST to the CWF dev server.
             * Fire-and-forget — we don't await or check the response.
             * If the server is unreachable, the heartbeat simply fails silently
             * and the server will detect the stale heartbeat on its own.
             */
            const sendHeartbeat = () => {
                fetch('/api/cwf/copilot/heartbeat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    /** Use the Supabase UUID — matches copilot_config.simulation_id */
                    body: JSON.stringify({ simulationId }),
                }).catch(() => {
                    /** Silently ignore fetch errors — server handles timeout detection */
                });
            };

            /** Send first heartbeat immediately (don't wait for first interval tick) */
            sendHeartbeat();
            /** Start the periodic heartbeat interval */
            intervalRef.current = setInterval(sendHeartbeat, COPILOT_HEARTBEAT_INTERVAL_MS);
        } else {
            // =================================================================
            // VERCEL PRODUCTION: combined evaluate + heartbeat call
            // =================================================================

            /**
             * Trigger a copilot evaluation cycle on the Vercel serverless endpoint.
             * The endpoint reads state from Supabase, calls Gemini if needed,
             * applies corrections, AND updates the heartbeat timestamp.
             *
             * Uses an in-flight guard to prevent overlapping calls — if a previous
             * evaluate is still running (Gemini can take 3-8 seconds), we skip.
             */
            const triggerEvaluation = async () => {
                /** Skip if a previous evaluation is still in-flight */
                if (evaluateInFlightRef.current) {
                    log.debug('Skipping evaluate — previous call still in-flight');
                    return;
                }

                evaluateInFlightRef.current = true;

                try {
                    const response = await fetch('/api/cwf/copilot/evaluate', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ simulationId }),
                    });

                    if (response.ok) {
                        const data = await response.json();
                        /** Log evaluation result for debugging (visible in browser console) */
                        if (data.decision && data.decision !== 'skip') {
                            log.debug(`Evaluation: ${data.decision} | FOEE: ${data.foee}% | Tick: ${data.simTick} | ${data.latencyMs}ms`);
                        }

                        /**
                         * If the evaluate endpoint reports copilot was auto-disengaged
                         * (heartbeat timeout, simulation ended, or copilot disabled
                         * externally), we do NOT call disableCopilot() directly here.
                         *
                         * The evaluate endpoint already wrote cwf_state='normal' to
                         * Supabase. The Realtime subscription in useCopilotLifecycle
                         * EFFECT 2 will detect this change and call syncStateFromCloud(),
                         * ensuring a single, consistent state-sync path.
                         *
                         * Calling disableCopilot() here would bypass the 30s grace
                         * period in EFFECT 1, causing the pink theme to drop prematurely
                         * during brief data-flow interruptions.
                         */
                        if (data.decision === 'disengaged' || data.decision === 'disabled') {
                            log.debug(`Evaluate returned '${data.decision}' — Realtime will sync state`);
                        }
                    } else {
                        console.warn('[CopilotHeartbeat] ⚠️ Evaluate endpoint returned:', response.status);
                    }
                } catch (err) {
                    /** Network error — silently ignore, will retry next interval */
                    console.warn('[CopilotHeartbeat] ⚠️ Evaluate fetch failed:', err);
                } finally {
                    evaluateInFlightRef.current = false;
                }
            };

            /** Trigger first evaluation immediately */
            triggerEvaluation();
            /** Start the periodic evaluation interval */
            intervalRef.current = setInterval(triggerEvaluation, COPILOT_VERCEL_POLL_INTERVAL_MS);
        }

        /** Cleanup: clear interval on unmount or when dependencies change */
        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
        };
    }, [isEnabled, simulationId]);
}
