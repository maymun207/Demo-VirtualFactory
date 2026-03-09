/**
 * useCopilotLifecycle.ts — CWF Copilot Lifecycle Manager
 *
 * React hook that manages the copilot lifecycle in the browser:
 *
 * 1. AUTO-DISENGAGE on simulation stop:
 *    When isDataFlowing becomes false (simulation stopped), automatically
 *    disables copilot via the API and updates the local store.
 *
 * 2. REALTIME SYNC — copilot_config:
 *    Subscribes to Supabase Realtime on the copilot_config table.
 *    When the server disables copilot (heartbeat timeout, external toggle),
 *    the UI reflects the change immediately.
 *
 * 3. REALTIME SYNC — copilot_actions:
 *    Subscribes to Supabase Realtime on the copilot_actions table.
 *    When the copilot engine logs a new action, it's pushed into the
 *    copilotStore.actionHistory and appears as a chat message in the CWF panel.
 *
 * Used by: SimulationRunner.tsx (mounted at top level with simulation lifecycle)
 *
 * Dependencies:
 *   - src/store/copilotStore.ts    (writes state changes)
 *   - src/store/cwfStore.ts        (reads simulationId — the Supabase UUID)
 *   - src/store/simulationStore.ts (reads isDataFlowing)
 *   - src/lib/supabaseClient.ts    (Supabase client for Realtime)
 *   - src/lib/params/copilot.ts    (table names, feature flag)
 *
 * IMPORTANT — Simulation ID:
 *   All Supabase operations (Realtime filter, disable call) use
 *   cwfStore.simulationId which is the UUID from simulation_sessions.id.
 *   Do NOT use simulationStore.sessionId — that is the 6-digit human-readable
 *   display code (e.g., "585749") and does NOT match the UUID primary key
 *   used in copilot_config.simulation_id.
 */

import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useCopilotStore } from '../store/copilotStore';
import { useSimulationStore } from '../store/simulationStore';
import { useCWFStore } from '../store/cwfStore';
import {
    COPILOT_FEATURE_ENABLED,
    COPILOT_CONFIG_TABLE,
    COPILOT_ACTIONS_TABLE,
} from '../lib/params/copilot';
import type { CwfState } from '../lib/params/copilot';

// =============================================================================
// HOOK
// =============================================================================

/**
 * Manage copilot lifecycle: auto-disengage on sim stop + Realtime sync.
 *
 * This hook:
 *   - Watches isDataFlowing → disables copilot when simulation stops
 *   - Subscribes to copilot_config Realtime changes → syncs enable/disable
 *   - Subscribes to copilot_actions Realtime inserts → feeds action history
 *
 * All Supabase operations key on the simulation UUID (cwfStore.simulationId),
 * NOT the 6-digit session code (simulationStore.sessionId).
 */
export function useCopilotLifecycle(): void {
    /** Track whether we've already disabled copilot for the current sim-stop event
        to prevent duplicate API calls */
    const hasDisabledForStopRef = useRef(false);

    /** Read state from stores */
    const isEnabled = useCopilotStore((s) => s.isEnabled);
    const isDataFlowing = useSimulationStore((s) => s.isDataFlowing);

    /**
     * Read the SUPABASE UUID for this simulation from cwfStore.
     *
     * CRITICAL: This is simulation_sessions.id (UUID like "29bf4242-..."),
     * set by App.tsx via simulationDataStore.session?.id.
     *
     * Do NOT use simulationStore.sessionId — that is a 6-digit display code
     * (e.g., "585749") and does NOT match copilot_config.simulation_id.
     * Using the wrong ID means Realtime subscriptions and disable calls
     * target the wrong row, breaking all copilot sync.
     */
    const simulationId = useCWFStore((s) => s.simulationId);

    /** Get store actions (stable references from Zustand) */
    const syncStateFromCloud = useCopilotStore((s) => s.syncStateFromCloud);
    const disableCopilot = useCopilotStore((s) => s.disableCopilot);
    const enableCopilot = useCopilotStore((s) => s.enableCopilot);
    const pushAction = useCopilotStore((s) => s.pushAction);
    const updateConfig = useCopilotStore((s) => s.updateConfig);

    // ─────────────────────────────────────────────────────────────────────────
    // EFFECT 1: Auto-disengage copilot when simulation stops
    // ─────────────────────────────────────────────────────────────────────────

    useEffect(() => {
        /** Guard: only act if copilot is enabled and sim just stopped */
        if (!COPILOT_FEATURE_ENABLED || !isEnabled) {
            hasDisabledForStopRef.current = false;
            return;
        }

        if (!isDataFlowing && !hasDisabledForStopRef.current) {
            /** Simulation has stopped while copilot was active — auto-disengage */
            hasDisabledForStopRef.current = true;

            /** Disable locally */
            disableCopilot();

            /**
             * Disable on server (fire-and-forget).
             * Uses simulationId (UUID) — matches copilot_config.simulation_id.
             * Falls back gracefully if simulationId is null (session already cleared).
             */
            if (simulationId) {
                fetch('/api/cwf/copilot/disable', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ simulationId }),
                }).catch(() => {
                    /** Server may already know — ignore errors */
                });
            }

            console.log('[Copilot UI] 🔴 Auto-disengaged: simulation stopped');
        }

        if (isDataFlowing) {
            /** Simulation restarted — reset the guard */
            hasDisabledForStopRef.current = false;
        }
    }, [isDataFlowing, isEnabled, simulationId, disableCopilot]);

    // ─────────────────────────────────────────────────────────────────────────
    // EFFECT 2: Supabase Realtime subscription for copilot_config changes
    // ─────────────────────────────────────────────────────────────────────────

    useEffect(() => {
        /**
         * Guard: feature flag + active simulation UUID.
         *
         * We guard on simulationId (UUID) — if it's null the simulation hasn't
         * fully connected yet and we cannot subscribe to the correct row.
         * We do NOT guard on isEnabled here — we subscribe unconditionally so
         * that the UI catches transitions TO enabled (not just while enabled).
         *
         * NOTE: isEnabled is intentionally NOT in the dependency array.
         * Including it would rebuild the subscription on every toggle,
         * creating a race window where the Realtime event that changes isEnabled
         * would arrive during the subscription teardown and be missed.
         */
        if (!COPILOT_FEATURE_ENABLED || !simulationId || !supabase) return;

        /** Subscribe to ALL events on copilot_config for this simulation UUID.
         *  We use '*' instead of 'UPDATE' because the first enable uses upsert(),
         *  which fires an INSERT event (not UPDATE) when the row doesn't exist. */
        const configChannel = supabase!
            .channel(`copilot-config-${simulationId}`)
            .on(
                'postgres_changes' as 'system',
                {
                    event: '*',
                    schema: 'public',
                    table: COPILOT_CONFIG_TABLE,
                    /** Filter on simulation UUID — matches copilot_config.simulation_id */
                    filter: `simulation_id=eq.${simulationId}`,
                } as never,
                (payload: { new: Record<string, unknown> }) => {
                    const newRow = payload.new;

                    /**
                     * PRIMARY sync: push cwf_state + auth_attempts from the DB row
                     * into the Zustand mirror. This is the ONLY authoritative update path.
                     * syncStateFromCloud also derives isEnabled and isAuthPending.
                     */
                    if (newRow.cwf_state) {
                        syncStateFromCloud(
                            newRow.cwf_state as CwfState,
                            (newRow.auth_attempts as number) ?? 0,
                        );
                        console.log(
                            `[Copilot UI] 🔄 State synced from cloud: ${newRow.cwf_state} ` +
                            `(sim=${simulationId.slice(0, 8)}..., auth_attempts=${newRow.auth_attempts ?? 0})`
                        );
                    } else {
                        /**
                         * Fallback for rows that don't yet have cwf_state
                         * (rows created before the state machine migration).
                         * Use the legacy enabled boolean to derive the state.
                         */
                        if (newRow.enabled === true && !isEnabled) {
                            enableCopilot();
                            console.log('[Copilot UI] 🟢 Copilot enabled via Realtime (legacy fallback)');
                        } else if (newRow.enabled === false && isEnabled) {
                            disableCopilot();
                            console.log('[Copilot UI] 🔴 Copilot disabled via Realtime (legacy fallback)');
                        }
                    }

                    /** Sync config thresholds (unchanged) */
                    updateConfig({
                        pollIntervalSec: newRow.poll_interval_sec as number,
                        oeeAlarmThreshold: newRow.oee_alarm_threshold as number,
                        qualityAlarmThreshold: newRow.quality_alarm_threshold as number,
                        severityThreshold: newRow.severity_threshold as string,
                    });
                }
            )
            .subscribe();

        /** Cleanup: unsubscribe on unmount or simulation change */
        return () => {
            supabase!.removeChannel(configChannel);
        };
        /**
         * Dependencies: simulationId drives subscriptions.
         * isEnabled deliberately EXCLUDED to prevent subscription rebuild on toggle.
         * enableCopilot / disableCopilot used in callback but are stable Zustand refs.
         */
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [simulationId]);

    // ─────────────────────────────────────────────────────────────────────────
    // EFFECT 3: Supabase Realtime subscription for copilot_actions inserts
    // ─────────────────────────────────────────────────────────────────────────

    useEffect(() => {
        /** Guard: feature flag + active simulation UUID + copilot enabled */
        if (!COPILOT_FEATURE_ENABLED || !simulationId || !isEnabled || !supabase) return;

        /** Subscribe to INSERT events on copilot_actions for this simulation UUID */
        const actionsChannel = supabase!
            .channel(`copilot-actions-${simulationId}`)
            .on(
                'postgres_changes' as 'system',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: COPILOT_ACTIONS_TABLE,
                    /** Filter on simulation UUID — matches copilot_actions.simulation_id */
                    filter: `simulation_id=eq.${simulationId}`,
                } as never,
                (payload: { new: Record<string, unknown> }) => {
                    const row = payload.new;

                    /** Only push actions that have a chat message (skip silent 'skipped' decisions) */
                    if (row.chat_message) {
                        pushAction({
                            id: row.id as string,
                            decision: row.decision as string,
                            chatMessage: row.chat_message as string,
                            timestamp: row.created_at as string,
                            simTick: row.sim_tick as number,
                        });
                    }
                }
            )
            .subscribe();

        /** Cleanup: unsubscribe on unmount or when copilot is disabled */
        return () => {
            supabase!.removeChannel(actionsChannel);
        };
    }, [simulationId, isEnabled, pushAction]);
}
