/**
 * simulationEventLogger.ts — Fire-and-Forget Simulation Event Logger
 *
 * Logs simulation state transitions (start, stop, drain, reset, etc.)
 * to the `simulation_events` Supabase table. CWF queries these events
 * to understand manual stop/start patterns and provide accurate OEE
 * interpretation to users.
 *
 * Design:
 *   - Non-blocking: errors are caught and logged to console only.
 *   - No retry logic: event loss is acceptable (advisory, not critical).
 *   - Called from simulationStore.ts via queueMicrotask to avoid
 *     blocking synchronous Zustand state updates.
 *
 * Used by:
 *   - simulationStore.ts (toggleDataFlow, stopDataFlow, completeDrain, resetSimulation)
 *   - simulationEvents.test.ts (function signature validation)
 */

import { supabase } from '../lib/supabaseClient'; // Shared Supabase client instance
import type { SimulationEventType } from '../lib/params/cwfCommands'; // Type-safe event types

/** Supabase table name for simulation events (matches migration) */
const SIMULATION_EVENTS_TABLE = 'simulation_events';

/**
 * logSimulationEvent — Insert a state transition event into Supabase.
 *
 * Fire-and-forget: the returned Promise is intentionally NOT awaited
 * by callers in the Zustand store. Errors are caught and logged to
 * the console to avoid breaking the simulation.
 *
 * @param simulationId - UUID of the active simulation session
 * @param simTick      - Current S-Clock tick when the event occurred
 * @param eventType    - One of SIMULATION_EVENT_TYPES (type-safe)
 * @param details      - Optional JSONB payload with contextual data
 */
export async function logSimulationEvent(
    simulationId: string,
    simTick: number,
    eventType: SimulationEventType,
    details?: Record<string, unknown>,
): Promise<void> {
    try {
        /** Skip logging if Supabase client is not configured (env vars missing) */
        if (!supabase) return;

        /** Insert the event row — fire-and-forget pattern */
        const { error } = await supabase
            .from(SIMULATION_EVENTS_TABLE)
            .insert({
                simulation_id: simulationId,
                sim_tick: simTick,
                event_type: eventType,
                details: details ?? {},
            });

        if (error) {
            /** Log but do not throw — event logging is advisory, not critical */
            console.warn(
                `[SimEventLogger] Failed to log '${eventType}' for ${simulationId}:`,
                error.message,
            );
        }
    } catch (err) {
        /** Catch network errors or unexpected failures — never crash the simulation */
        console.warn(
            `[SimEventLogger] Network error logging '${eventType}':`,
            (err as Error).message,
        );
    }
}
