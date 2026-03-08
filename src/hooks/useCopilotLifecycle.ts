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
 *   - src/store/copilotStore.ts (writes state changes)
 *   - src/store/simulationStore.ts (reads isDataFlowing, sessionId)
 *   - src/lib/supabaseClient.ts (Supabase client for Realtime)
 *   - src/lib/params/copilot.ts (table names, feature flag)
 */

import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useCopilotStore } from '../store/copilotStore';
import { useSimulationStore } from '../store/simulationStore';
import {
    COPILOT_FEATURE_ENABLED,
    COPILOT_CONFIG_TABLE,
    COPILOT_ACTIONS_TABLE,
} from '../lib/params/copilot';

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
 */
export function useCopilotLifecycle(): void {
    /** Track whether we've already disabled copilot for the current sim-stop event
        to prevent duplicate API calls */
    const hasDisabledForStopRef = useRef(false);

    /** Read state from stores */
    const isEnabled = useCopilotStore((s) => s.isEnabled);
    const isDataFlowing = useSimulationStore((s) => s.isDataFlowing);
    const sessionId = useSimulationStore((s) => s.sessionId);

    /** Get store actions (stable references from Zustand) */
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

            /** Disable on server (fire-and-forget) */
            fetch('/api/cwf/copilot/disable', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ simulationId: sessionId }),
            }).catch(() => {
                /** Server may already know — ignore errors */
            });

            console.log('[Copilot UI] 🔴 Auto-disengaged: simulation stopped');
        }

        if (isDataFlowing) {
            /** Simulation restarted — reset the guard */
            hasDisabledForStopRef.current = false;
        }
    }, [isDataFlowing, isEnabled, sessionId, disableCopilot]);

    // ─────────────────────────────────────────────────────────────────────────
    // EFFECT 2: Supabase Realtime subscription for copilot_config changes
    // ─────────────────────────────────────────────────────────────────────────

    useEffect(() => {
        /** Guard: feature flag + active session */
        if (!COPILOT_FEATURE_ENABLED || !sessionId || !supabase) return;

        /** Subscribe to ALL events on copilot_config for this session.
         *  We use '*' instead of 'UPDATE' because the first enable uses upsert(),
         *  which fires an INSERT event (not UPDATE) when the row doesn't exist. */
        const configChannel = supabase!
            .channel(`copilot-config-${sessionId}`)
            .on(
                'postgres_changes' as 'system',
                {
                    event: '*',
                    schema: 'public',
                    table: COPILOT_CONFIG_TABLE,
                    filter: `simulation_id=eq.${sessionId}`,
                } as never,
                (payload: { new: Record<string, unknown> }) => {
                    const newRow = payload.new;

                    /** Sync enabled state from server */
                    if (newRow.enabled === true && !isEnabled) {
                        enableCopilot();
                        console.log('[Copilot UI] 🟢 Copilot enabled via Realtime');
                    } else if (newRow.enabled === false && isEnabled) {
                        disableCopilot();
                        console.log('[Copilot UI] 🔴 Copilot disabled via Realtime');
                    }

                    /** Sync config values */
                    updateConfig({
                        pollIntervalSec: newRow.poll_interval_sec as number,
                        oeeAlarmThreshold: newRow.oee_alarm_threshold as number,
                        qualityAlarmThreshold: newRow.quality_alarm_threshold as number,
                        severityThreshold: newRow.severity_threshold as string,
                    });
                }
            )
            .subscribe();

        /** Cleanup: unsubscribe on unmount or session change */
        return () => {
            supabase!.removeChannel(configChannel);
        };
    }, [sessionId, isEnabled, enableCopilot, disableCopilot, updateConfig]);

    // ─────────────────────────────────────────────────────────────────────────
    // EFFECT 3: Supabase Realtime subscription for copilot_actions inserts
    // ─────────────────────────────────────────────────────────────────────────

    useEffect(() => {
        /** Guard: feature flag + active session + copilot enabled */
        if (!COPILOT_FEATURE_ENABLED || !sessionId || !isEnabled || !supabase) return;

        /** Subscribe to INSERT events on copilot_actions for this session */
        const actionsChannel = supabase!
            .channel(`copilot-actions-${sessionId}`)
            .on(
                'postgres_changes' as 'system',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: COPILOT_ACTIONS_TABLE,
                    filter: `simulation_id=eq.${sessionId}`,
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
    }, [sessionId, isEnabled, pushAction]);
}
