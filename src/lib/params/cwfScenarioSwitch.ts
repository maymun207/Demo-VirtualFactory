/**
 * cwfScenarioSwitch.ts — CWF Scenario Switch Configuration Parameters
 *
 * Centralises EVERY configuration constant required for CWF's live scenario-
 * switching feature. This module represents the source-of-truth for:
 *
 *   - The action type string used in the cwf_commands UI-action route
 *   - The ordered list of valid scenario codes (SCN-000 through SCN-004)
 *   - A type-safe validation helper for scenario codes
 *   - Human-readable labels for each scenario (used in CWF confirmation messages)
 *
 * WHY A SEPARATE MODULE?
 *   Per project convention, every new feature must have its configuration
 *   isolated in its own Params module. This prevents hardcoded strings from
 *   appearing in business logic and makes the feature fully configurable
 *   without touching hook or API code.
 *
 * HOW SCENARIO SWITCHING WORKS (end-to-end):
 *   1. User tells CWF: "switch to SCN-002"
 *   2. Gemini calls the `switch_scenario` tool in api/cwf/chat.ts
 *   3. chat.ts calls executeUIAction({ action_type: 'switch_scenario',
 *        action_value: 'SCN-002' }) which INSERTs to cwf_commands
 *   4. useCWFCommandListener.processUIActionCommand() catches the row,
 *        validates the code via isValidScenarioCode(), then calls
 *        resetToFactoryDefaults() + loadScenario()
 *   5. The simulation continues uninterrupted — NO pause, NO drain.
 *   6. The cwf_commands row is ACKed as 'applied'; a system message is posted
 *        to the CWF chat panel confirming the switch.
 *
 * There is NO migration required for this feature — it reuses the existing
 * cwf_commands `ui_action` route (station='ui_action', parameter='switch_scenario').
 *
 * Used by:
 *   src/hooks/useCWFCommandListener.ts  (handler validation & messaging)
 *   src/lib/params/uiTelemetry.ts       (adds action to CWF_VALID_UI_ACTIONS)
 *   api/cwf/chat.ts                     (mirrored constants, tool declaration)
 *   src/lib/params/cwfScenarioSwitch.test.ts  (unit tests)
 */

// =============================================================================
// ACTION TYPE CONSTANT
// =============================================================================

/**
 * CWF_SCENARIO_SWITCH_ACTION — The action_type string used in the UI-action
 * route when CWF switches a simulation scenario.
 *
 * This value is stored in cwf_commands.parameter for rows that carry a
 * scenario-switch command (station='ui_action'). The listener compares
 * command.parameter against this constant to route to the correct handler.
 *
 * SOURCE OF TRUTH — api/cwf/chat.ts must mirror this exact string.
 */
export const CWF_SCENARIO_SWITCH_ACTION = 'switch_scenario' as const;

// =============================================================================
// VALID SCENARIO CODES
// =============================================================================

/**
 * VALID_SCENARIO_CODES — All scenario codes that CWF is permitted to activate.
 *
 * Ordered from reference (no defects) to most complex cascade defect.
 * Every code corresponds to a ScenarioDefinition in src/lib/scenarios.ts
 * and can be looked up via getScenarioByCode().
 *
 * api/cwf/chat.ts uses this list to populate the Gemini tool's `enum` field,
 * which prevents the model from hallucinating unsupported codes.
 */
export const VALID_SCENARIO_CODES = [
    /** SCN-000 — Optimal Production (reference — no defects, factory defaults) */
    'SCN-000',
    /** SCN-001 — Press Pressure Anomaly (press underpressure, structural defects) */
    'SCN-001',
    /** SCN-002 — Kiln Temperature Crisis (over-fired tiles, surface cracks) */
    'SCN-002',
    /** SCN-003 — Glaze Drift (low glaze density, colour inconsistencies) */
    'SCN-003',
    /** SCN-004 — Cascade Multi-station Defect (simultaneous press + kiln failures) */
    'SCN-004',
] as const;

/**
 * Type-safe union of all valid scenario code strings.
 * Constrains function signatures that accept scenario codes.
 */
export type ScenarioCode = typeof VALID_SCENARIO_CODES[number];

// =============================================================================
// VALIDATION HELPER
// =============================================================================

/**
 * isValidScenarioCode — Type guard that returns true if `code` is one of the
 * five supported scenario codes (SCN-000 through SCN-004).
 *
 * Used by processUIActionCommand() in useCWFCommandListener before attempting
 * to call getScenarioByCode(), and by the Gemini tool handler in chat.ts to
 * reject invalid codes before inserting a cwf_commands row.
 *
 * @param code - The string to validate (e.g. 'SCN-002')
 * @returns true if `code` is a valid ScenarioCode, false otherwise
 */
export function isValidScenarioCode(code: string): code is ScenarioCode {
    /** Cast to the readonly tuple for includes() type narrowing */
    return (VALID_SCENARIO_CODES as readonly string[]).includes(code);
}

// =============================================================================
// DISPLAY LABELS (for CWF confirmation messages)
// =============================================================================

/**
 * SCENARIO_DISPLAY_LABELS — Short human-readable labels for each scenario.
 *
 * Injected into the CWF system message after a successful scenario switch so
 * the user sees: "✅ Switched to SCN-002 — Kiln Temperature Crisis".
 * Map keyed by ScenarioCode for O(1) lookup without importing scenarios.ts.
 *
 * Must be kept in sync with ScenarioDefinition.name in src/lib/scenarios.ts.
 */
export const SCENARIO_DISPLAY_LABELS: Record<ScenarioCode, string> = {
    /** SCN-000 — reference production, all defaults, no injected faults */
    'SCN-000': 'Optimal Production',
    /** SCN-001 — press pressure drop causing structural tile defects */
    'SCN-001': 'Press Pressure Anomaly',
    /** SCN-002 — kiln over-temperature causing surface cracks and colour deviation */
    'SCN-002': 'Kiln Temperature Crisis',
    /** SCN-003 — glaze density drift leading to uneven glaze and colour variance */
    'SCN-003': 'Glaze Drift',
    /** SCN-004 — simultaneous press + kiln failures producing compound defect types */
    'SCN-004': 'Cascade Defect',
};
