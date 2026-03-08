/**
 * telemetryService.ts — UI Interaction & Simulation Event Telemetry
 *
 * Provides a fire-and-forget `emit()` function that records every meaningful
 * user interaction and simulation state change to the `ui_telemetry_events`
 * Supabase table for behavioral analytics and CWF historical queries.
 *
 * ## Architecture
 *
 *  Browser components call:
 *    telemetry.emit({ event_type: 'panel_toggled', event_category: 'ui_action',
 *                     properties: { panel: 'oee_hierarchy', state: 'opened' } })
 *
 *  The service:
 *  1. Enriches the event with a full ui_snapshot + sim_snapshot from stores
 *  2. Pushes it to an in-memory queue
 *  3. Uses requestIdleCallback (or setTimeout fallback) to flush the queue
 *     in small batches — never blocking the UI thread
 *
 * ## Design Principles
 *  - **Zero UI impact**: event emitting is synchronous and O(1) per call.
 *    All network I/O happens asynchronously during browser idle time.
 *  - **Fire-and-forget**: callers never await emit(). Failures are logged
 *    silently — telemetry loss is preferable to UI degradation.
 *  - **Self-describing events**: every event carries its own ui_snapshot and
 *    sim_snapshot so CWF can reconstruct context without joining other tables.
 *  - **Batching**: up to TELEMETRY_BATCH_SIZE events are sent per network call,
 *    reducing Supabase write pressure during rapid UI changes.
 *
 * Used by: useTelemetry.ts (auto-wired), Header.tsx, ControlPanel.tsx,
 *          DemoSettingsPanel.tsx, ModesMenu.tsx, CWFChatPanel.tsx
 */

import { supabase } from '../lib/supabaseClient';
import { useUIStore } from '../store/uiStore';
import { useSimulationStore } from '../store/simulationStore';
import { useSimulationDataStore } from '../store/simulationDataStore';
import { createLogger } from '../lib/logger';
/** Telemetry configuration constants — all tunable values live in Params, NOT here */
import {
    TELEMETRY_BATCH_SIZE,
    TELEMETRY_FLUSH_DEBOUNCE_MS,
    TELEMETRY_MAX_QUEUE_SIZE,
    TELEMETRY_IDLE_DEADLINE_MS,
    type TelemetryEventCategory,
} from '../lib/params/uiTelemetry';

/** Module-level logger for telemetry operations */
const log = createLogger('UITelemetry');

// =============================================================================
// TYPES
// =============================================================================

/**
 * TelemetryEventInput — What the caller provides when emitting an event.
 * The service enriches this with ui_snapshot, sim_snapshot, occurred_at,
 * simulation_id, and session_code before writing to Supabase.
 */
export interface TelemetryEventInput {
    /** Specific event name (e.g. 'panel_toggled', 'conveyor_jammed') */
    event_type: string;
    /**
     * Broad category for grouping and filtering.
     * All valid categories are defined in src/lib/params/uiTelemetry.ts.
     *  'ui_action'          — user clicked a button or toggled a panel
     *  'sim_state'          — simulation state changed automatically
     *  'cwf_interaction'    — user interacted with the CWF chat agent
     *  'parameter'          — a machine or conveyor parameter was changed
     */
    event_category: TelemetryEventCategory;
    /** Event-specific key-value payload (optional, defaults to {}) */
    properties?: Record<string, unknown>;
}

/** Complete event row as stored in Supabase — enriched by the service */
interface TelemetryEventRow {
    simulation_id: string | null;       // UUID of active simulation (or null)
    session_code: string | null;        // Human-readable session code (or null)
    event_type: string;                 // From TelemetryEventInput
    event_category: string;             // From TelemetryEventInput
    properties: Record<string, unknown>;// From TelemetryEventInput (defaulted to {})
    ui_snapshot: Record<string, boolean | string | number | null>; // Panel states
    sim_snapshot: Record<string, unknown>; // Simulation state
    occurred_at: string;                // ISO 8601 wall-clock timestamp
    s_clock_at: number | null;          // Simulation tick at moment of event
}

// =============================================================================
// INTERNAL QUEUE
// =============================================================================

/** In-memory queue of enriched events waiting to be flushed to Supabase */
const eventQueue: TelemetryEventRow[] = [];

/** Timer handle for the debounced flush */
let flushTimer: ReturnType<typeof setTimeout> | null = null;

/** Whether a flush is currently in-progress (prevents overlapping batches) */
let isFlushing = false;

// =============================================================================
// SNAPSHOT BUILDERS
// =============================================================================

/**
 * Build a ui_snapshot from the current uiStore state.
 * Captures which panels are open at the exact moment of the event.
 *
 * @returns Record mapping panel key to its current visibility state
 */
function buildUISnapshot(): Record<string, boolean> {
    /** Read uiStore synchronously — no re-render triggered */
    const ui = useUIStore.getState();
    return {
        /** Left Basic side panel (KPI + Heatmap) */
        basicPanel: ui.showBasicPanel,
        /** Digital Transfer passport side panel */
        dtxfr: ui.showDTXFR,
        /** 3D OEE Hierarchy table in scene */
        oeeHierarchy: ui.showOEEHierarchy,
        /** 3D Production Status table in scene */
        prodTable: ui.showProductionTable,
        /** CWF chat panel */
        cwf: ui.showCWF,
        /** Control & Actions floating panel */
        controlPanel: ui.showControlPanel,
        /** Demo Settings modal */
        demoSettings: ui.showDemoSettings,
        /** Alarm Log popup */
        alarmLog: ui.showAlarmLog,
        /** Tile Passport floating panel */
        tilePassport: ui.showPassport,
        /** FTQ Defect Heatmap floating panel */
        heatmap: ui.showHeatmap,
        /** KPI floating panel */
        kpi: ui.showKPI,
    };
}

/**
 * Build a sim_snapshot from the current simulationStore state.
 * Captures the exact running state of the simulation at the moment of the event.
 *
 * @returns Record of key simulation state values
 */
function buildSimSnapshot(): Record<string, unknown> {
    /** Read simulationStore synchronously — no re-render triggered */
    const sim = useSimulationStore.getState();
    return {
        /** Whether the S-Clock is actively ticking */
        isRunning: sim.isDataFlowing,
        /** Whether Phase-2 drain is in progress */
        isDraining: sim.isDraining,
        /** Current simulation tick number */
        sClockCount: sim.sClockCount,
        /** S-Clock period in ms — lower = faster simulation */
        sClockPeriod: sim.sClockPeriod,
        /** Station processing interval in ticks */
        stationInterval: sim.stationInterval,
        /** Conveyor belt operational status */
        conveyorStatus: sim.conveyorStatus,
        /** Conveyor speed multiplier */
        conveyorSpeed: sim.conveyorSpeed,
    };
}

// =============================================================================
// FLUSH LOGIC
// =============================================================================

/**
 * Flush pending events from the queue to Supabase in batches.
 * Called automatically during browser idle time (or after debounce window).
 * Never called while a flush is already in-progress (`isFlushing` guard).
 */
async function flushQueue(): Promise<void> {
    // Guard: skip if already flushing or queue is empty
    if (isFlushing || eventQueue.length === 0) return;
    if (!supabase) {
        // Supabase not configured — discard queue silently
        eventQueue.length = 0;
        return;
    }

    isFlushing = true;

    try {
        /** Drain up to TELEMETRY_BATCH_SIZE events from the front of the queue */
        while (eventQueue.length > 0) {
            const batch = eventQueue.splice(0, TELEMETRY_BATCH_SIZE);

            /** INSERT batch to Supabase — fire-and-forget: failures are logged but not thrown */
            const { error } = await supabase
                .from('ui_telemetry_events')
                .insert(batch);

            if (error) {
                /** Log the error but do NOT re-queue — telemetry loss is acceptable */
                log.warn('Telemetry batch insert failed: %s', error.message);
            }
        }
    } catch (err) {
        /** Catch unexpected errors (network timeout, etc.) — never let telemetry crash the app */
        log.warn('Telemetry flush error: %s', (err as Error).message);
    } finally {
        /** Release the in-progress guard regardless of success or failure */
        isFlushing = false;
    }
}

/**
 * Schedule a debounced flush of the event queue.
 * Resets the debounce timer each time a new event arrives, so rapid UI changes
 * (e.g. slider dragging that fires many events in quick succession) are batched
 * into a single network call after TELEMETRY_FLUSH_DEBOUNCE_MS of quiet.
 *
 * After the debounce window, schedules the actual flush via requestIdleCallback
 * (or setTimeout fallback) so it never blocks user interaction.
 */
function scheduleFlush(): void {
    /** Reset debounce timer on each new event */
    if (flushTimer !== null) {
        clearTimeout(flushTimer);
    }

    flushTimer = setTimeout(() => {
        flushTimer = null;
        /** Use requestIdleCallback if available — lets browser prioritize rendering */
        if (typeof requestIdleCallback !== 'undefined') {
            /** TELEMETRY_IDLE_DEADLINE_MS forces flush even if browser stays busy */
            requestIdleCallback(() => void flushQueue(), { timeout: TELEMETRY_IDLE_DEADLINE_MS });
        } else {
            /** Fallback: defer by one event loop tick for non-supporting browsers */
            setTimeout(() => void flushQueue(), 0);
        }
    }, TELEMETRY_FLUSH_DEBOUNCE_MS);
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Emit a telemetry event.
 *
 * This is the single entry point for all telemetry. Callers call this at
 * interaction points (button clicks, slider changes, simulation state changes).
 * The function is synchronous and O(1) — all async work happens via
 * `scheduleFlush()` in the background during browser idle time.
 *
 * @param input - Event type, category, and optional properties
 *
 * @example
 *   // In a button click handler:
 *   telemetry.emit({
 *     event_type: 'panel_toggled',
 *     event_category: 'ui_action',
 *     properties: { panel: 'oee_hierarchy', state: 'opened' },
 *   });
 */
function emit(input: TelemetryEventInput): void {
    try {
        /** Read current simulation session for FK and session_code */
        const dataState = useSimulationDataStore.getState();
        const simState = useSimulationStore.getState();

        /** Build the enriched event row */
        const row: TelemetryEventRow = {
            /** FK to simulation_sessions (null if no simulation running yet) */
            simulation_id: dataState.session?.id ?? null,
            /** Human-readable 6-char session code for CWF display */
            session_code: dataState.session?.session_code ?? null,
            /** Event classification from caller */
            event_type: input.event_type,
            event_category: input.event_category,
            /** Caller-provided properties (default to empty object) */
            properties: input.properties ?? {},
            /** Full panel visibility snapshot at moment of event */
            ui_snapshot: buildUISnapshot(),
            /** Full simulation state snapshot at moment of event */
            sim_snapshot: buildSimSnapshot(),
            /** Wall-clock UTC timestamp */
            occurred_at: new Date().toISOString(),
            /** Simulation tick at moment of event (null before simulation starts) */
            s_clock_at: simState.sClockCount > 0 ? simState.sClockCount : null,
        };

        /**
         * Enforce queue capacity — evict oldest event (FIFO) if over TELEMETRY_MAX_QUEUE_SIZE.
         * Protects against memory growth during extended Supabase outages.
         */
        if (eventQueue.length >= TELEMETRY_MAX_QUEUE_SIZE) {
            /** Drop the oldest element from the front of the array */
            eventQueue.shift();
        }

        /** Push new event to the tail of the in-memory queue */
        eventQueue.push(row);

        /** Schedule a debounced flush — does NOT block the calling code */
        scheduleFlush();

    } catch (err) {
        /**
         * Catch any unexpected error in snapshot building.
         * Telemetry must NEVER crash the UI — log and discard silently.
         */
        log.warn('telemetry.emit() error (discarded): %s', (err as Error).message);
    }
}

// =============================================================================
// EXPORTED SINGLETON
// =============================================================================

/**
 * telemetry — Singleton service object.
 * Import this anywhere in the app to emit telemetry events.
 *
 * @example
 *   import { telemetry } from '../services/telemetryService';
 *   telemetry.emit({ event_type: 'panel_toggled', event_category: 'ui_action', ... });
 */
export const telemetry = {
    /** Emit a single telemetry event (fire-and-forget) */
    emit,
};
