/**
 * uiTelemetry.ts — UI Telemetry & CWF UI Control Configuration Parameters
 *
 * Centralises every tunable constant for two related Phase 2 & 3 features
 * of CWF Omniscience & UI Control:
 *
 *   Phase 2 — UI Telemetry (ui_telemetry_events Supabase table)
 *     Controls how events are buffered in-memory and batched to Supabase.
 *
 *   Phase 3 — CWF UI Commands (execute_ui_action Gemini tool)
 *     Defines every action type CWF is allowed to trigger, the
 *     acknowledgement window, and the languages CWF can set.
 *
 * WHY PARAMS?
 *   Per project convention, ALL numeric magic values, configuration flags,
 *   and valid-value sets must live here — NOT hardcoded in business logic.
 *   This ensures they can be tuned without touching feature code.
 *
 * Used by:
 *   src/services/telemetryService.ts        (Phase 2 — emit / flush)
 *   src/hooks/useCWFCommandListener.ts      (Phase 3 — UI action routing)
 *   api/cwf/chat.ts                         (Phase 3 — tool definition, ACK wait)
 *   src/__tests__/telemetryService.test.ts  (unit tests)
 *   src/__tests__/cwfUIActions.test.ts      (unit tests)
 */

// =============================================================================
// PHASE 2 — TELEMETRY QUEUE CONFIGURATION
// =============================================================================

/**
 * Maximum number of events to include in a single Supabase INSERT batch.
 * Smaller batches = more network calls but lower individual payload size.
 * Larger batches = fewer calls but higher risk of payload rejection.
 * 10 is empirically safe for JSONB payloads with full ui/sim snapshots.
 */
export const TELEMETRY_BATCH_SIZE = 10;

/**
 * Debounce window in milliseconds before flushing the in-memory event queue.
 * During rapid UI interactions (slider drags, burst clicks) multiple events
 * accumulate in the queue during this window and are sent as a single batch.
 * 300 ms keeps the delay imperceptible while effectively reducing write calls.
 */
export const TELEMETRY_FLUSH_DEBOUNCE_MS = 300;

/**
 * Maximum number of events held in the in-memory queue at any time.
 * If Supabase is unreachable and the queue grows beyond this limit,
 * the OLDEST event is evicted (FIFO) to prevent unbounded memory growth.
 * 200 events × (approx. 2 KB per event) ≈ 400 KB upper bound.
 */
export const TELEMETRY_MAX_QUEUE_SIZE = 200;

/**
 * requestIdleCallback deadline in milliseconds.
 * After the debounce window expires, we ask the browser to flush the queue
 * during idle time — but if no idle slot appears within this deadline,
 * the browser is forced to execute the flush anyway to prevent stale events.
 */
export const TELEMETRY_IDLE_DEADLINE_MS = 2_000;

// =============================================================================
// PHASE 2 — TELEMETRY EVENT CATEGORIES
// =============================================================================

/**
 * TELEMETRY_CATEGORY_UI_ACTION — User initiated an interaction
 * (button click, panel toggle, conveyor status selection, etc.)
 */
export const TELEMETRY_CATEGORY_UI_ACTION = 'ui_action' as const;

/**
 * TELEMETRY_CATEGORY_SIM_STATE — Simulation state changed automatically
 * (jam detected, drain started, parameter drift applied, etc.)
 */
export const TELEMETRY_CATEGORY_SIM_STATE = 'sim_state' as const;

/**
 * TELEMETRY_CATEGORY_CWF_INTERACTION — User interacted with the CWF chat agent
 * (sent a message, received a response, CWF executed a UI action, etc.)
 */
export const TELEMETRY_CATEGORY_CWF_INTERACTION = 'cwf_interaction' as const;

/**
 * TELEMETRY_CATEGORY_PARAMETER — A machine or conveyor parameter was changed
 * (either by CWF command or by parameter drift engine)
 */
export const TELEMETRY_CATEGORY_PARAMETER = 'parameter' as const;

/**
 * Union type of all valid telemetry event categories.
 * Matches the CHECK constraint on the ui_telemetry_events.event_category column.
 */
export type TelemetryEventCategory =
    | typeof TELEMETRY_CATEGORY_UI_ACTION
    | typeof TELEMETRY_CATEGORY_SIM_STATE
    | typeof TELEMETRY_CATEGORY_CWF_INTERACTION
    | typeof TELEMETRY_CATEGORY_PARAMETER;

// =============================================================================
// PHASE 3 — CWF UI ACTION TYPES
// =============================================================================

/**
 * All UI action types that CWF is permitted to execute via the
 * execute_ui_action Gemini tool. Maintained as a readonly Set for O(1) lookup.
 *
 * Each value corresponds to exactly one Zustand store action in the browser:
 *
 *  Panel Toggles (uiStore):
 *    toggle_basic_panel    → uiStore.toggleBasicPanel()
 *    toggle_dtxfr          → uiStore.toggleDTXFR()
 *    toggle_oee_hierarchy  → uiStore.toggleOEEHierarchy()
 *    toggle_prod_table     → uiStore.setShowProductionTable(!current)
 *    toggle_cwf_panel      → uiStore.toggleCWF()
 *    toggle_control_panel  → uiStore.toggleControlPanel()
 *    toggle_alarm_log      → uiStore.toggleAlarmLog()
 *    toggle_heatmap        → uiStore.toggleHeatmap()
 *    toggle_kpi            → uiStore.toggleKPI()
 *    toggle_tile_passport  → uiStore.togglePassport()
 *    toggle_demo_settings  → uiStore.toggleDemoSettings()
 *
 *  Simulation Lifecycle (simulationStore):
 *    start_simulation      → simulationStore.toggleDataFlow() [if not running]
 *    stop_simulation       → simulationStore.toggleDataFlow() [if running]
 *    reset_simulation      → full factory reset orchestration (8 steps)
 *
 *  Configuration (uiStore):
 *    set_language          → uiStore.setLanguage(action_value)  ['en' | 'tr']
 */
export const CWF_VALID_UI_ACTIONS = new Set([
    // ── Panel Toggles (11) ────────────────────────────────────────────────
    /** Left Basic side panel (KPI + Heatmap) */
    'toggle_basic_panel',
    /** Digital Transfer (DTXFR) side panel */
    'toggle_dtxfr',
    /** 3D OEE Hierarchy table in scene */
    'toggle_oee_hierarchy',
    /** 3D Production Status table in scene */
    'toggle_prod_table',
    /** CWF chat panel */
    'toggle_cwf_panel',
    /** Control & Actions floating panel */
    'toggle_control_panel',
    /** Alarm Log popup */
    'toggle_alarm_log',
    /** FTQ Defect Heatmap floating panel */
    'toggle_heatmap',
    /** KPI floating panel */
    'toggle_kpi',
    /** Tile Passport floating panel */
    'toggle_tile_passport',
    /** Demo Settings modal */
    'toggle_demo_settings',
    // ── Simulation Lifecycle (3) ──────────────────────────────────────────
    /** Start the simulation (requires isSimConfigured gate) */
    'start_simulation',
    /** Stop the simulation */
    'stop_simulation',
    /** Full factory reset (all stores, session, conveyor drain) */
    'reset_simulation',
    // ── Configuration (1) ────────────────────────────────────────────────
    /** Change the interface language — action_value must be 'en' or 'tr' */
    'set_language',
] as const);

/**
 * Type-safe union of all string literals in CWF_VALID_UI_ACTIONS.
 * Used in TypeScript function signatures to constrain action type arguments.
 */
export type CWFUIActionType = typeof CWF_VALID_UI_ACTIONS extends Set<infer T> ? T : never;

// =============================================================================
// PHASE 3 — CWF UI ACTION VALID LANGUAGE VALUES
// =============================================================================

/**
 * Valid language codes accepted by the set_language UI action.
 * Only these values are forwarded to uiStore.setLanguage().
 * Any other value causes the command to be rejected.
 */
export const CWF_UI_ACTION_VALID_LANGUAGES = ['en', 'tr'] as const;

/**
 * Type-safe union of valid language codes for set_language action.
 */
export type CWFUILanguageCode = typeof CWF_UI_ACTION_VALID_LANGUAGES[number];

// =============================================================================
// PHASE 3 — CWF UI COMMAND ACK CONFIGURATION
// =============================================================================

/**
 * Maximum time in milliseconds that executeUIAction() waits for the browser
 * client to acknowledge a UI command by updating cwf_commands.status to
 * 'applied' or 'rejected'. If the browser does not respond within this window,
 * the server returns a timeout error to CWF.
 *
 * Must be shorter than CWF_CLIENT_TIMEOUT_MS (55 000 ms) to ensure CWF still
 * receives a useful response before the fetch() times out.
 *
 * Set to 8 000 ms — longer than CWF_POLL_INTERVAL_MS (3 000 ms × 2 polls)
 * to allow at least two polling cycles before declaring timeout.
 */
export const CWF_UI_ACTION_ACK_WAIT_MS = 8_000;

/**
 * Interval in milliseconds between server-side polls when waiting for the
 * browser to acknowledge a UI action. During the CWF_UI_ACTION_ACK_WAIT_MS
 * window, the server queries the cwf_commands row at this interval to check
 * whether the browser has updated its status.
 */
export const CWF_UI_ACTION_ACK_POLL_INTERVAL_MS = 500;

// =============================================================================
// PHASE 3 — CWF UI COMMAND ROW VALUES
// =============================================================================

/**
 * Sentinel value for the `station` column in cwf_commands rows that carry
 * UI action commands. useCWFCommandListener routes any row with this station
 * value to processUIActionCommand() instead of the parameter-update path.
 */
export const CWF_UI_ACTION_STATION_SENTINEL = 'ui_action' as const;

/**
 * Separator used to encode action_value inside the cwf_commands.reason field.
 * Format: "<human reason> | value: <action_value>"
 * Example: "Change interface language to English | value: en"
 *
 * processUIActionCommand() uses this pattern to extract action_value via regex.
 */
export const CWF_UI_ACTION_VALUE_SEPARATOR = '| value:' as const;
