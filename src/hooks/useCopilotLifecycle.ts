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
 *   - src/store/simulationDataStore.ts (reads session?.id — the Supabase UUID)
 *   - src/store/simulationStore.ts (reads isDataFlowing)
 *   - src/lib/supabaseClient.ts    (Supabase client for Realtime)
 *   - src/lib/params/copilot.ts    (table names, feature flag)
 *
 * IMPORTANT — Simulation ID:
 *   All Supabase operations (Realtime filter, disable call) use
 *   simulationDataStore.session?.id — the SINGLE SOURCE OF TRUTH for the UUID.
 *   Do NOT read from cwfStore.simulationId — that mirror has been removed.
 *   Do NOT use simulationStore.sessionId — that is the 6-digit human-readable
 *   display code and does NOT match the UUID primary key in copilot_config.
 */

import { useEffect, useRef } from 'react';
import { createLogger } from '../lib/logger';
import { supabase } from '../lib/supabaseClient';
import { useCopilotStore } from '../store/copilotStore';
import { useSimulationStore } from '../store/simulationStore';
/** SINGLE SOURCE OF TRUTH: session UUID lives in simulationDataStore */
import { useSimulationDataStore } from '../store/simulationDataStore';
import {
    COPILOT_FEATURE_ENABLED,
    COPILOT_CONFIG_TABLE,
    COPILOT_ACTIONS_TABLE,
    COPILOT_DISENGAGE_GRACE_PERIOD_MS,
} from '../lib/params/copilot';
import type { CwfState } from '../lib/params/copilot';

/** Module-level logger for copilot lifecycle events */
const log = createLogger('CopilotLifecycle');

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
 * All Supabase operations key on the simulation UUID (simulationDataStore.session?.id),
 * NOT the 6-digit session code (simulationStore.sessionId).
 */
export function useCopilotLifecycle(): void {
    /** Track whether we've already disabled copilot for the current sim-stop event
        to prevent duplicate API calls */
    const hasDisabledForStopRef = useRef(false);

    /** Timer ID for the grace-period debounce (Fix 1) */
    const graceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    /** Read state from stores */
    const isEnabled = useCopilotStore((s) => s.isEnabled);
    const isDataFlowing = useSimulationStore((s) => s.isDataFlowing);

    /**
     * SINGLE SOURCE OF TRUTH: read the simulation UUID from simulationDataStore.
     *
     * simulationDataStore.session?.id is the Supabase UUID (simulation_sessions.id)
     * used as the primary key in copilot_config and copilot_actions.
     * This replaces the removed cwfStore.simulationId mirror.
     */
    const simulationId = useSimulationDataStore((s) => s.session?.id ?? null);

    /** Get store actions (stable references from Zustand) */
    const syncStateFromCloud = useCopilotStore((s) => s.syncStateFromCloud);
    const disableCopilot = useCopilotStore((s) => s.disableCopilot);
    const pushAction = useCopilotStore((s) => s.pushAction);
    const updateConfig = useCopilotStore((s) => s.updateConfig);

    // ─────────────────────────────────────────────────────────────────────────
    // EFFECT 1: Auto-disengage copilot when simulation stops (WITH GRACE PERIOD)
    //
    // Brief Supabase Realtime disconnections or transient data gaps can cause
    // isDataFlowing to flicker to false for a few seconds. Without a grace
    // period, the copilot theme drops and monitoring stops prematurely.
    //
    // Fix: debounce the disengage by COPILOT_DISENGAGE_GRACE_PERIOD_MS (30s).
    // If isDataFlowing resumes within that window, the timer resets.
    // ─────────────────────────────────────────────────────────────────────────

    useEffect(() => {
        /** Guard: only act if copilot is enabled */
        if (!COPILOT_FEATURE_ENABLED || !isEnabled) {
            hasDisabledForStopRef.current = false;
            /** Clear any pending grace timer on disable */
            if (graceTimerRef.current) {
                clearTimeout(graceTimerRef.current);
                graceTimerRef.current = null;
            }
            return;
        }

        if (!isDataFlowing && !hasDisabledForStopRef.current) {
            /**
             * Data flow stopped while copilot was active.
             * Start the grace period countdown instead of disengaging immediately.
             * If data flow resumes within COPILOT_DISENGAGE_GRACE_PERIOD_MS,
             * the timer is cancelled and copilot continues uninterrupted.
             */
            if (!graceTimerRef.current) {
                log.info(`Data flow stopped — grace period started (${COPILOT_DISENGAGE_GRACE_PERIOD_MS / 1000}s before disengage)`);

                graceTimerRef.current = setTimeout(() => {
                    graceTimerRef.current = null;

                    /**
                     * DOUBLE-CHECK: Before disengaging, verify the simulation
                     * is TRULY stopped — not just experiencing a transient
                     * isDataFlowing flicker (Realtime disconnect, Safari timer
                     * throttling, etc.).
                     *
                     * Read the authoritative isRunning flag and session status
                     * from the data store. If the simulation is still running
                     * in the data layer, skip the disengage entirely — the
                     * evaluate endpoint will continue processing, and the
                     * heartbeat timeout (90s) serves as the ultimate safety net.
                     */
                    const dataStoreState = useSimulationDataStore.getState();
                    const sessionStatus = dataStoreState.session?.status;
                    const isStillRunning = dataStoreState.isRunning;

                    if (isStillRunning || sessionStatus === 'running') {
                        log.info(`Grace period expired but simulation still running (isRunning=${isStillRunning}, status=${sessionStatus}) — skipping disengage`);
                        return;
                    }

                    /** Simulation truly stopped — disengage now */
                    hasDisabledForStopRef.current = true;

                    /** Disable locally */
                    disableCopilot();

                    /**
                     * Disable on server (fire-and-forget).
                     * Uses simulationId (UUID) — matches copilot_config.simulation_id.
                     * Falls back gracefully if simulationId is null (session cleared).
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

                    log.info(`Auto-disengaged: simulation stopped (status=${sessionStatus}, grace period expired)`);
                }, COPILOT_DISENGAGE_GRACE_PERIOD_MS);
            }
        }

        if (isDataFlowing) {
            /** Data flow resumed — cancel grace timer and reset the guard */
            if (graceTimerRef.current) {
                log.info('Data flow resumed — grace timer cancelled');
                clearTimeout(graceTimerRef.current);
                graceTimerRef.current = null;
            }
            hasDisabledForStopRef.current = false;
        }

        /** Cleanup: clear grace timer on effect teardown */
        return () => {
            if (graceTimerRef.current) {
                clearTimeout(graceTimerRef.current);
                graceTimerRef.current = null;
            }
        };
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
                        log.debug(`State synced from cloud: ${newRow.cwf_state} (sim=${simulationId.slice(0, 8)}..., auth_attempts=${newRow.auth_attempts ?? 0})`);
                    } else {
                        /**
                         * Rows without cwf_state should not exist in production.
                         * The `enabled` boolean is DEPRECATED — cwf_state is the
                         * sole source of truth. Log a warning for observability.
                         */
                        console.warn(
                            '[Copilot UI] ⚠️ Received copilot_config Realtime event ' +
                            'without cwf_state — ignoring deprecated enabled boolean'
                        );
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
