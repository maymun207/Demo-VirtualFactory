/**
 * useCopilotHeartbeat.ts — Browser Heartbeat for CWF Copilot Safety
 *
 * React hook that sends periodic heartbeat POST requests to the CWF dev server
 * while copilot mode is active. The server tracks the last heartbeat timestamp
 * in copilot_config.last_heartbeat_at and auto-disengages copilot if the
 * browser stops sending heartbeats (tab closed, network lost, etc.).
 *
 * IMPORTANT — Simulation ID used for heartbeats:
 *   Heartbeats MUST use the Supabase UUID (cwfStore.simulationId), NOT the
 *   human-readable session code from simulationStore.sessionId.
 *   The copilot_config table is keyed on simulation_id = UUID.
 *   Using the session code causes the engine to never find the copilot_config
 *   row, leaving last_heartbeat_at perpetually stale and triggering a false
 *   auto-disengage on first poll after the 30-second grace window.
 *
 * Timing:
 *   - Sends every COPILOT_HEARTBEAT_INTERVAL_MS (5 seconds)
 *   - Server timeout: COPILOT_HEARTBEAT_TIMEOUT_MS (15 seconds = 3 missed beats)
 *   - On unmount: clearInterval (server naturally detects missing beats)
 *
 * This hook ONLY runs when copilot is enabled. When copilot is disabled,
 * the interval is cleared and no heartbeats are sent.
 *
 * Used by: CWFChatPanel.tsx (mounted when CWF panel is open)
 *
 * Dependencies:
 *   - src/store/copilotStore.ts  (reads isEnabled)
 *   - src/store/cwfStore.ts      (reads simulationId — the Supabase UUID)
 *   - src/lib/params/copilot.ts  (COPILOT_HEARTBEAT_INTERVAL_MS)
 */

import { useEffect, useRef } from 'react';
import { useCopilotStore } from '../store/copilotStore';
import { useCWFStore } from '../store/cwfStore';
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
 *   - When isEnabled transitions to true  → start interval, send immediately
 *   - When isEnabled transitions to false → clear interval, stop heartbeats
 *   - When component unmounts             → clear interval (server detects timeout)
 *
 * Heartbeat endpoint: POST /api/cwf/copilot/heartbeat
 * Body: { simulationId: string }  ← MUST be the Supabase UUID from cwfStore
 */
export function useCopilotHeartbeat(): void {
    /** Timer reference for cleanup on unmount or dependency change */
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    /** Read copilot enabled state from the Zustand store */
    const isEnabled = useCopilotStore((s) => s.isEnabled);

    /**
     * Read the active simulation UUID from cwfStore.
     *
     * CRITICAL: This is the Supabase UUID used as the primary key in
     * copilot_config (e.g., "29bf4242-140b-417d-9442-9904797171d7").
     *
     * DO NOT use simulationStore.sessionId — that is a short human-readable
     * numeric code (e.g., "585749") and does NOT match the
     * copilot_config.simulation_id column, causing every heartbeat to target
     * the wrong row and triggering a false auto-disengage.
     */
    const simulationId = useCWFStore((s) => s.simulationId);

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

        /** Cleanup: clear interval on unmount or when dependencies change */
        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
        };
    }, [isEnabled, simulationId]);
}
