/**
 * simulationHistoryService.ts — Local Simulation History (localStorage)
 *
 * Maintains a chronological list of simulation sessions in the browser's
 * localStorage. Each entry records the Supabase-assigned UUID, session code,
 * start timestamp, and a 1-based counter indicating the simulation number
 * within this browser session.
 *
 * ─── Purpose ─────────────────────────────────────────────────────────────────
 *
 * Allows CWF (Chat With your Factory) to access data from previous
 * simulations, not just the current one. When a user says "show me the
 * scrap rate from the previous simulation," CWF reads this history to
 * resolve "previous" to a specific UUID and queries Supabase accordingly.
 *
 * ─── Architecture ────────────────────────────────────────────────────────────
 *
 *  - Storage: browser localStorage (survives refresh/tab close)
 *  - Key: SIMULATION_HISTORY_STORAGE_KEY (from params)
 *  - Format: JSON array of SimulationHistoryEntry objects
 *  - Ordering: newest first (descending by startedAt)
 *  - Limit: MAX_SIMULATION_HISTORY entries (from params)
 *
 * ─── Usage ────────────────────────────────────────────────────────────────────
 *
 *  Called by: sessionSlice.ts on successful Supabase session creation
 *  Read by:  cwfStore.ts to include history in CWF API requests
 */

import {
    SIMULATION_HISTORY_STORAGE_KEY,
    MAX_SIMULATION_HISTORY,
    MAX_HISTORY_AGE_DAYS,
} from '../lib/params';
import { createLogger } from '../lib/logger';

/** Module-level logger for simulation history operations. */
const log = createLogger('SimHistory');

// =============================================================================
// TYPES
// =============================================================================

/**
 * A single entry in the local simulation history.
 * Represents one simulation session that was started in this browser.
 */
export interface SimulationHistoryEntry {
    /** Supabase-assigned UUID for this simulation session. */
    uuid: string;

    /** Human-readable 6-character session code (e.g., "1A7DDB"). */
    sessionCode: string;

    /** ISO 8601 timestamp of when the simulation was started. */
    startedAt: string;

    /**
     * 1-based counter: 1st simulation since browser opened = 1,
     * 2nd simulation = 2, etc. Helps CWF interpret "the second simulation."
     */
    counter: number;
}

// =============================================================================
// CORE FUNCTIONS
// =============================================================================

/**
 * Read the full simulation history from localStorage.
 * Returns an empty array if no history exists or if parsing fails.
 *
 * @returns Array of SimulationHistoryEntry, newest first.
 */
export function getSimulationHistory(): SimulationHistoryEntry[] {
    try {
        /** Read raw JSON string from localStorage. */
        const raw = localStorage.getItem(SIMULATION_HISTORY_STORAGE_KEY);
        if (!raw) return [];

        /** Parse and validate — return empty array on malformed data. */
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];

        /** Filter out entries older than MAX_HISTORY_AGE_DAYS (24h as per Supabase policy). */
        const now = Date.now();
        const maxAgeMs = MAX_HISTORY_AGE_DAYS * 24 * 60 * 60 * 1000;
        const valid = (parsed as SimulationHistoryEntry[]).filter((entry) => {
            const age = now - new Date(entry.startedAt).getTime();
            return age < maxAgeMs;
        });

        /** If snapshots were pruned, persist the cleaned list back to storage. */
        if (valid.length !== parsed.length) {
            log.info('Pruned %d expired simulation(s) from local history.', parsed.length - valid.length);
            localStorage.setItem(SIMULATION_HISTORY_STORAGE_KEY, JSON.stringify(valid));
        }

        return valid;
    } catch (error) {
        /**
         * JSON.parse failure or localStorage access denied (private browsing).
         * Fail silently — simulation history is a convenience feature, not critical.
         */
        log.warn('Failed to read simulation history from localStorage:', error);
        return [];
    }
}

/**
 * Add a new simulation to the local history.
 * Automatically assigns the next counter value and enforces
 * the MAX_SIMULATION_HISTORY limit by dropping the oldest entries.
 *
 * @param uuid        - Supabase-assigned simulation session UUID
 * @param sessionCode - Human-readable 6-character session code
 */
export function addSimulation(uuid: string, sessionCode: string): void {
    try {
        /** Read existing history to determine next counter value. */
        const history = getSimulationHistory();

        /**
         * Counter is based on the highest existing counter + 1.
         * If history is empty, start at 1.
         */
        const maxCounter = history.reduce((max, entry) => Math.max(max, entry.counter), 0);

        /** Build the new entry. */
        const newEntry: SimulationHistoryEntry = {
            uuid,
            sessionCode,
            startedAt: new Date().toISOString(),
            counter: maxCounter + 1,
        };

        /** Prepend new entry (newest first) and enforce max limit. */
        const updated = [newEntry, ...history].slice(0, MAX_SIMULATION_HISTORY);

        /** Persist to localStorage. */
        localStorage.setItem(SIMULATION_HISTORY_STORAGE_KEY, JSON.stringify(updated));

        log.info(
            'Simulation #%d added to history (code: %s, uuid: %s)',
            newEntry.counter,
            sessionCode,
            uuid.slice(0, 8) + '…',
        );
    } catch (error) {
        /**
         * localStorage write failure (quota exceeded, private browsing, etc.).
         * Fail silently — simulation proceeds normally without history tracking.
         */
        log.warn('Failed to save simulation history to localStorage:', error);
    }
}

/**
 * Clear all simulation history from localStorage.
 * Useful for testing or when the user explicitly requests a reset.
 */
export function clearSimulationHistory(): void {
    try {
        localStorage.removeItem(SIMULATION_HISTORY_STORAGE_KEY);
        log.info('Simulation history cleared.');
    } catch (error) {
        log.warn('Failed to clear simulation history:', error);
    }
}
