/**
 * useCopilotHeartbeat.ts — Browser Heartbeat for CWF Copilot Safety
 *
 * React hook that sends periodic heartbeat POST requests to the CWF dev server
 * while copilot mode is active. The server tracks the last heartbeat timestamp
 * in copilot_config.last_heartbeat_at and auto-disengages copilot if the
 * browser stops sending heartbeats (tab closed, network lost, etc.).
 *
 * Timing:
 *   - Sends every COPILOT_HEARTBEAT_INTERVAL_MS (5 seconds)
 *   - Server timeout: COPILOT_HEARTBEAT_TIMEOUT_MS (15 seconds = 3 missed beats)
 *   - On unmount: clearInterval (server naturally detects missing beats)
 *
 * This hook ONLY runs when copilot is enabled. When copilot is disabled,
 * the interval is cleared and no heartbeats are sent.
 *
 * Used by: App.tsx or SimulationRunner.tsx (mounted at top level)
 *
 * Dependencies:
 *   - src/store/copilotStore.ts (reads isEnabled)
 *   - src/store/simulationStore.ts (reads sessionId for the heartbeat payload)
 *   - src/lib/params/copilot.ts (COPILOT_HEARTBEAT_INTERVAL_MS)
 */

import { useEffect, useRef } from 'react';
import { useCopilotStore } from '../store/copilotStore';
import { useSimulationStore } from '../store/simulationStore';
import {
    COPILOT_HEARTBEAT_INTERVAL_MS,
    COPILOT_FEATURE_ENABLED,
} from '../lib/params/copilot';

// =============================================================================
// HOOK
// =============================================================================

/**
 * Send periodic heartbeats to the CWF dev server while copilot is active.
 *
 * Lifecycle:
 *   - When isEnabled transitions to true → start interval
 *   - When isEnabled transitions to false → clear interval
 *   - When component unmounts → clear interval (server detects timeout)
 *
 * Heartbeat endpoint: POST /api/cwf/copilot/heartbeat
 * Body: { simulationId: string }
 */
export function useCopilotHeartbeat(): void {
    /** Timer reference for cleanup */
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    /** Read copilot enabled state from the Zustand store */
    const isEnabled = useCopilotStore((s) => s.isEnabled);

    /** Read the active simulation session ID */
    const sessionId = useSimulationStore((s) => s.sessionId);

    useEffect(() => {
        /** Guard: feature flag must be on, copilot must be enabled, session must exist */
        if (!COPILOT_FEATURE_ENABLED || !isEnabled || !sessionId) {
            /** Clear any existing interval when copilot is disabled */
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
            return;
        }

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
                body: JSON.stringify({ simulationId: sessionId }),
            }).catch(() => {
                /** Silently ignore fetch errors — server handles timeout detection */
            });
        };

        /** Send first heartbeat immediately (don't wait for first interval) */
        sendHeartbeat();

        /** Start the periodic heartbeat interval */
        intervalRef.current = setInterval(sendHeartbeat, COPILOT_HEARTBEAT_INTERVAL_MS);

        /** Cleanup: clear interval on unmount or when dependencies change */
        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
        };
    }, [isEnabled, sessionId]);
}
