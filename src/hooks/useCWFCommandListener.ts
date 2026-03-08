/**
 * useCWFCommandListener.ts — CWF Parameter Command Realtime Listener
 *
 * React hook that subscribes to Supabase Realtime Postgres Changes on the
 * `cwf_commands` table. When the CWF AI agent inserts a new command (after
 * the human-in-the-loop approval flow), this hook:
 *
 *   1. Receives the INSERT event via WebSocket (near-instant)
 *   2. Validates the parameter value against CWF_PARAM_RANGES
 *   3. Applies the change to the Zustand simulation data store
 *   4. Updates the command status ('applied' or 'rejected') in Supabase
 *   5. Posts a system message to the CWF chat panel as visual confirmation
 *
 * FALLBACK POLLING:
 *   Supabase Realtime WebSocket connections can be unreliable on some
 *   deployments (Vercel, mobile browsers, corporate proxies). To guarantee
 *   CWF commands are always processed, a fallback polling mechanism runs
 *   every CWF_POLL_INTERVAL_MS, querying for any commands stuck in 'pending'
 *   status and processing them the same way as the Realtime handler.
 *
 * Architecture:
 *   CWF serverless fn → INSERT cwf_commands → Supabase Realtime → this hook
 *                                                                    ↓
 *                                                      updateParameter() in Zustand
 *                                             (+ fallback polling every 5s)
 *
 * Mount point: App.tsx (alongside useKPISync, useConveyorBehaviour)
 *
 * Dependencies:
 *   - src/lib/supabaseClient.ts  (Supabase client instance)
 *   - src/lib/params/cwfCommands.ts (CWF_PARAM_RANGES, validateCWFParamValue)
 *   - src/store/simulationDataStore.ts (updateParameter action)
 *   - src/store/cwfStore.ts (addSystemMessage for chat notification)
 */

import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { validateCWFParamValue } from '../lib/params/cwfCommands';
import { useSimulationDataStore } from '../store/simulationDataStore';
import { useCWFStore } from '../store/cwfStore';
import type { StationName } from '../store/types';

/**
 * Conveyor boolean parameter names that are stored as 0/1 numbers in the
 * cwf_commands table but must be converted to boolean before applying.
 * All other conveyor params are applied as numeric values directly.
 */
const CONVEYOR_BOOL_PARAMS = new Set(['speed_change', 'jammed_events']);

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * CWF_POLL_INTERVAL_MS — Fallback polling interval in milliseconds.
 * Every N ms, the hook queries Supabase for any 'pending' commands
 * that Realtime may have missed. Set to 3 seconds so that the client
 * acknowledges commands well within the server's CWF_ACK_WAIT_MS (5s)
 * window, ensuring CWF gets honest ACK feedback.
 */
const CWF_POLL_INTERVAL_MS = 3_000;

// =============================================================================
// TYPES
// =============================================================================

/**
 * Shape of a row in the cwf_commands table.
 * Matches the Supabase migration schema.
 */
interface CWFCommand {
    /** Unique command identifier */
    id: string;
    /** Target simulation session */
    session_id: string;
    /** Target station: press | dryer | glaze | printer | kiln | sorting | packaging | conveyor */
    station: string;
    /** Parameter column name (e.g. 'pressure_bar') */
    parameter: string;
    /** Value before change (read from DB by CWF) */
    old_value: number;
    /** Proposed new value */
    new_value: number;
    /** AI-generated reason for the change */
    reason: string | null;
    /** Authorization ID provided by the user */
    authorized_by: string;
    /** Command lifecycle status */
    status: string;
    /** Why the command was rejected (if applicable) */
    rejected_reason: string | null;
    /** When the command was created */
    created_at: string;
}

// =============================================================================
// HOOK
// =============================================================================

/**
 * Subscribe to CWF parameter commands via Supabase Realtime + fallback polling.
 *
 * This hook activates when a simulation session is active and Supabase
 * is configured. It listens for INSERT events on the `cwf_commands` table
 * via Realtime, AND polls for pending commands every CWF_POLL_INTERVAL_MS
 * as a reliability fallback.
 *
 * The hook is idempotent — it cleans up subscriptions and polling on unmount
 * or when the session ID changes.
 */
export function useCWFCommandListener(): void {
    /** Ref to track the current Realtime channel for cleanup */
    const channelRef = useRef<ReturnType<NonNullable<typeof supabase>['channel']> | null>(null);
    /** Ref to track the polling interval for cleanup */
    const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    /** Ref to track processed command IDs to prevent duplicate processing */
    const processedIdsRef = useRef<Set<string>>(new Set());

    /**
     * Process a single CWF command: validate, apply to store, update status.
     * Shared by both Realtime handler and fallback polling.
     *
     * @param command - The CWF command row from Supabase
     */
    const processCommand = useCallback((command: CWFCommand): void => {
        /** Skip already-processed commands (deduplication across Realtime + polling) */
        if (processedIdsRef.current.has(command.id)) return;

        /** Skip non-pending commands (defensive check) */
        if (command.status !== 'pending') return;

        /** Mark as processed immediately to prevent duplicate execution */
        processedIdsRef.current.add(command.id);

        /** Validate the parameter value against CWF_PARAM_RANGES */
        const validation = validateCWFParamValue(
            command.station,
            command.parameter,
            command.new_value,
        );

        if (!validation.valid) {
            /** Reject: value is out of range or parameter/station is unknown */
            console.warn(
                `[CWF Listener] ❌ Rejected command ${command.id}: ${validation.reason}`,
            );
            /** Update command status to 'rejected' in Supabase */
            supabase!
                .from('cwf_commands')
                .update({
                    status: 'rejected',
                    rejected_reason: validation.reason,
                })
                .eq('id', command.id)
                .then(({ error }) => {
                    /** Log any errors from the status update (non-blocking) */
                    if (error) console.error('[CWF Listener] Failed to update rejected status:', error.message);
                    /** Post a warning message to the CWF chat panel */
                    useCWFStore.getState().addSystemMessage(
                        `⚠️ Parameter change rejected: ${validation.reason}`,
                    );
                });
            return;
        }

        /**
         * Apply the parameter change to the correct store action.
         *
         * Conveyor params are stored separately from machine station params:
         *   - Boolean params (speed_change, jammed_events): updateConveyorBoolParam()
         *   - Numeric params (jammed_time, impacted_tiles, scrap_probability_pct):
         *     updateConveyorParam()
         * All other stations use the standard updateParameter() path.
         */
        if (command.station === 'conveyor') {
            if (CONVEYOR_BOOL_PARAMS.has(command.parameter)) {
                /** Convert 0/1 number back to boolean (0 = false, any other = true) */
                useSimulationDataStore.getState().updateConveyorBoolParam(
                    command.parameter as 'speed_change' | 'jammed_events',
                    command.new_value !== 0,
                );
            } else {
                /**
                 * Apply numeric conveyor param (jammed_time, impacted_tiles, scrap_probability).
                 * Cast to the ConveyorNumericParams key union — validated upstream by
                 * CWF_PARAM_RANGES, so only valid keys reach this branch.
                 */
                useSimulationDataStore.getState().updateConveyorParam(
                    command.parameter as 'jammed_time' | 'impacted_tiles' | 'scrap_probability',
                    command.new_value,
                );
            }
        } else {
            /** Standard 7-station path: apply to simulationDataStore currentParams */
            useSimulationDataStore.getState().updateParameter(
                command.station as StationName,
                command.parameter,
                command.new_value,
                'step',         // changeType: discrete step change from CWF
                'cwf_agent',    // changeReason: originated from AI agent
            );
        }

        /** Update command status to 'applied' in Supabase */
        supabase!
            .from('cwf_commands')
            .update({ status: 'applied' })
            .eq('id', command.id)
            .then(({ error }) => {
                /** Log any errors from the status update (non-blocking) */
                if (error) console.error('[CWF Listener] Failed to update applied status:', error.message);
                /** Post a confirmation message to the CWF chat panel */
                const changeDirection = command.new_value > command.old_value ? '↑' : '↓';
                const changePct = command.old_value !== 0
                    ? (((command.new_value - command.old_value) / command.old_value) * 100).toFixed(1)
                    : '∞';
                useCWFStore.getState().addSystemMessage(
                    `✅ ${command.station}.${command.parameter}: ${command.old_value} → ${command.new_value} (${changeDirection}${changePct}%)`,
                );
            });

        console.log(
            `[CWF Listener] ✅ Applied: ${command.station}.${command.parameter} = ${command.new_value}`,
        );
    }, []);

    /**
     * Poll Supabase for any 'pending' commands that Realtime may have missed.
     * Called on an interval as a reliability fallback.
     *
     * @param sessionId - The current simulation session UUID
     */
    const pollPendingCommands = useCallback(async (sessionId: string): Promise<void> => {
        if (!supabase) return;

        /** Query for any pending commands for this session */
        const { data, error } = await supabase
            .from('cwf_commands')
            .select('*')
            .eq('session_id', sessionId)
            .eq('status', 'pending')
            .order('created_at', { ascending: true });

        if (error) {
            console.error('[CWF Poll] Failed to query pending commands:', error.message);
            return;
        }

        /** Process each pending command (processCommand handles deduplication) */
        if (data && data.length > 0) {
            console.log(`[CWF Poll] Found ${data.length} pending command(s), processing...`);
            for (const command of data as CWFCommand[]) {
                processCommand(command);
            }
        }
    }, [processCommand]);

    /**
     * Set up Realtime subscription and polling for a given session.
     * Extracted as a function to be called by both initial mount and session changes.
     *
     * @param sessionId - The simulation session UUID to subscribe to
     */
    const setupListeners = useCallback((sessionId: string): void => {
        if (!supabase) return;

        /** Clean up any existing channel before creating a new one */
        if (channelRef.current) {
            supabase.removeChannel(channelRef.current);
            channelRef.current = null;
        }

        /** Clean up any existing polling interval */
        if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
        }

        /** Clear processed IDs tracking for the new session */
        processedIdsRef.current.clear();

        // ── Realtime Subscription ───────────────────────────────────────
        /** Create a Realtime channel for cwf_commands INSERT events */
        const channel = supabase
            .channel(`cwf-commands-${sessionId}`)
            .on<CWFCommand>(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'cwf_commands',
                    filter: `session_id=eq.${sessionId}`,
                },
                (payload) => {
                    /** Process the newly inserted command */
                    console.log('[CWF Listener] Realtime INSERT received:', payload.new.id);
                    processCommand(payload.new);
                },
            )
            .subscribe((status) => {
                /** Log subscription state for debugging */
                console.log(`[CWF Listener] Realtime subscription status: ${status}`);

                /**
                 * Run an immediate poll once the subscription is established.
                 * This catches any commands inserted between session start
                 * and the Realtime subscription becoming active.
                 */
                if (status === 'SUBSCRIBED') {
                    pollPendingCommands(sessionId);
                }
            });

        /** Store channel reference for cleanup */
        channelRef.current = channel;

        // ── Fallback Polling ────────────────────────────────────────────
        /**
         * Start periodic polling as a reliability fallback.
         * Even if Realtime is working, polling is harmless — processCommand
         * deduplicates via processedIdsRef, so no command is applied twice.
         */
        pollIntervalRef.current = setInterval(() => {
            pollPendingCommands(sessionId);
        }, CWF_POLL_INTERVAL_MS);

        console.log(`[CWF Listener] Listeners active for session ${sessionId}`);
    }, [processCommand, pollPendingCommands]);

    /**
     * Tear down all listeners (Realtime + polling).
     * Called on unmount or session change.
     */
    const teardownListeners = useCallback((): void => {
        if (channelRef.current && supabase) {
            supabase.removeChannel(channelRef.current);
            channelRef.current = null;
            console.log('[CWF Listener] Realtime subscription removed');
        }
        if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
            console.log('[CWF Listener] Polling stopped');
        }
    }, []);

    // ── Effect 1: Setup on initial mount ──────────────────────────────────
    useEffect(() => {
        /** Guard: Supabase must be configured */
        if (!supabase) return;

        /** Read the current session ID from the simulation data store */
        const sessionId = useSimulationDataStore.getState().session?.id;

        /** If a session already exists at mount time, set up listeners immediately */
        if (sessionId) {
            setupListeners(sessionId);
        }

        /** Cleanup on unmount */
        return teardownListeners;
    }, [setupListeners, teardownListeners]);

    // ── Effect 2: React to session changes ────────────────────────────────
    useEffect(() => {
        /** Guard: Supabase must be configured */
        if (!supabase) return;

        /** Subscribe to Zustand store changes to detect session ID transitions */
        const unsubscribe = useSimulationDataStore.subscribe((state, prevState) => {
            /** Detect session ID changes */
            const currentId = state.session?.id;
            const previousId = prevState.session?.id;

            if (currentId !== previousId) {
                /** Tear down old listeners */
                teardownListeners();

                /** Set up new listeners if there's a new session */
                if (currentId) {
                    setupListeners(currentId);
                }
            }
        });

        return unsubscribe;
    }, [setupListeners, teardownListeners]);
}
