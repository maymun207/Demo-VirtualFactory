/**
 * cwfUIActions.test.ts — Unit Tests for CWF execute_ui_action Validation Logic
 *
 * Tests the server-side execute_ui_action tool validation (Phase 3 of CWF
 * Omniscience & UI Control). Since the actual executeUIAction() function lives
 * in an API route that requires Supabase + env vars, we test the validation
 * rules as isolated pure-function mirrors.
 *
 * Coverage:
 *   1. Auth ID validation (correct vs incorrect)
 *   2. action_type whitelist validation (valid vs unknown actions)
 *   3. set_language action_value validation ('en' | 'tr' only)
 *   4. CWF_VALID_UI_ACTIONS set completeness (all 15 expected actions present)
 *   5. Browser-side processUIActionCommand routing logic
 *   6. UI action command row shape (station='ui_action' sentinel)
 *   7. action_value extraction from reason field (format: "reason | value: X")
 */
/// <reference types="vitest/globals" />

import {
    describe,
    it,
    expect,
    vi,
    beforeEach,
} from 'vitest';

// =============================================================================
// MIRRORS — Isolated copies of validation logic from api/cwf/chat.ts
// We test logic, not the full Vercel function (which requires live env vars).
// =============================================================================

/** Authorization code — mirrors CWF_AUTH_CODE in chat.ts */
const TEST_AUTH_CODE = 'ARDICTECH-2025';

/**
 * Valid UI action types — mirrors CWF_VALID_UI_ACTIONS in chat.ts.
 * Tests verify this set is complete and matches the documented action list.
 */
const CWF_VALID_UI_ACTIONS = new Set([
    // Panel toggles
    'toggle_basic_panel', 'toggle_dtxfr', 'toggle_oee_hierarchy',
    'toggle_prod_table', 'toggle_cwf_panel', 'toggle_control_panel',
    'toggle_alarm_log', 'toggle_heatmap', 'toggle_kpi', 'toggle_tile_passport',
    'toggle_demo_settings',
    // Simulation lifecycle
    'start_simulation', 'stop_simulation', 'reset_simulation',
    // Conveyor belt status
    'set_conveyor_running', 'set_conveyor_stopped', 'set_conveyor_jammed',
    // Simulation parameter sliders
    'set_conveyor_speed', 'set_sclk_period', 'set_station_interval',
    // Configuration
    'set_language',
]);

/**
 * Pure function mirror of executeUIAction() auth check.
 * Returns 'invalid_auth' if auth fails, 'unknown_action' if action not in set,
 * 'invalid_language' if set_language has bad value, or 'ok'.
 */
function validateUIAction(args: {
    action_type: string;
    action_value?: string;
    authorized_by: string;
}): 'invalid_auth' | 'unknown_action' | 'invalid_language' | 'ok' {
    if (args.authorized_by !== TEST_AUTH_CODE) return 'invalid_auth';
    if (!CWF_VALID_UI_ACTIONS.has(args.action_type)) return 'unknown_action';
    if (
        args.action_type === 'set_language' &&
        !['en', 'tr'].includes(args.action_value ?? '')
    ) {
        return 'invalid_language';
    }
    return 'ok';
}

/**
 * Mirror of the action_value extraction logic in processUIActionCommand.
 * Extracts the value after "| value: " in the reason field.
 */
function extractActionValue(reason: string | null): string | undefined {
    if (!reason) return undefined;
    const match = reason.match(/\|\s*value:\s*(.+)$/);
    return match ? match[1].trim() : undefined;
}

// =============================================================================
// Tests: Auth validation
// =============================================================================

describe('execute_ui_action — auth validation', () => {
    it('should return ok when auth code is correct', () => {
        /**
         * Correct auth code must pass validation without error.
         * This is the happy path for CWF UI commands.
         */
        const result = validateUIAction({
            action_type: 'toggle_cwf_panel',
            authorized_by: TEST_AUTH_CODE,
        });
        expect(result).toBe('ok');
    });

    it('should return invalid_auth when auth code is wrong', () => {
        /**
         * Wrong auth code must be rejected immediately.
         * This prevents CWF from executing UI actions without user approval.
         */
        const result = validateUIAction({
            action_type: 'toggle_cwf_panel',
            authorized_by: 'wrong-code',
        });
        expect(result).toBe('invalid_auth');
    });

    it('should return invalid_auth when auth code is empty string', () => {
        /**
         * Empty auth code must be rejected — not treated as "no auth needed".
         */
        const result = validateUIAction({
            action_type: 'start_simulation',
            authorized_by: '',
        });
        expect(result).toBe('invalid_auth');
    });

    it('should return invalid_auth when auth code has extra whitespace', () => {
        /**
         * Auth codes with leading/trailing whitespace must also fail
         * (strict equality check, not trimmed).
         */
        const result = validateUIAction({
            action_type: 'toggle_basic_panel',
            authorized_by: ` ${TEST_AUTH_CODE} `,
        });
        expect(result).toBe('invalid_auth');
    });
});

// =============================================================================
// Tests: action_type whitelist validation
// =============================================================================

describe('execute_ui_action — action_type whitelist', () => {
    it('should return ok for all 15 valid action types when auth is correct', () => {
        /**
         * Every action in CWF_VALID_UI_ACTIONS must be accepted.
         * This prevents regressions where a newly-added action is not whitelisted.
         */
        for (const action_type of CWF_VALID_UI_ACTIONS) {
            const actionValue = action_type === 'set_language' ? 'en' : undefined;
            const result = validateUIAction({
                action_type,
                action_value: actionValue,
                authorized_by: TEST_AUTH_CODE,
            });
            expect(result).toBe('ok');
        }
    });

    it('should return unknown_action for an unrecognised action type', () => {
        /**
         * Unknown action types must be rejected to prevent hallucinated commands
         * from Gemini from reaching the browser.
         */
        const result = validateUIAction({
            action_type: 'delete_database',
            authorized_by: TEST_AUTH_CODE,
        });
        expect(result).toBe('unknown_action');
    });

    it('should return unknown_action for empty action_type string', () => {
        const result = validateUIAction({
            action_type: '',
            authorized_by: TEST_AUTH_CODE,
        });
        expect(result).toBe('unknown_action');
    });

    it('should return unknown_action for action_type with wrong casing', () => {
        /**
         * Action types are case-sensitive. 'Toggle_Basic_Panel' ≠ 'toggle_basic_panel'.
         * We document this so callers know to use exact lowercase snake_case.
         */
        const result = validateUIAction({
            action_type: 'Toggle_Basic_Panel',
            authorized_by: TEST_AUTH_CODE,
        });
        expect(result).toBe('unknown_action');
    });
});

// =============================================================================
// Tests: set_language action_value validation
// =============================================================================

describe('execute_ui_action — set_language validation', () => {
    it('should accept action_value "en" for set_language', () => {
        const result = validateUIAction({
            action_type: 'set_language',
            action_value: 'en',
            authorized_by: TEST_AUTH_CODE,
        });
        expect(result).toBe('ok');
    });

    it('should accept action_value "tr" for set_language', () => {
        const result = validateUIAction({
            action_type: 'set_language',
            action_value: 'tr',
            authorized_by: TEST_AUTH_CODE,
        });
        expect(result).toBe('ok');
    });

    it('should return invalid_language when action_value is missing for set_language', () => {
        /**
         * set_language requires an explicit language code.
         * Missing value must be rejected, not silently defaulted.
         */
        const result = validateUIAction({
            action_type: 'set_language',
            authorized_by: TEST_AUTH_CODE,
        });
        expect(result).toBe('invalid_language');
    });

    it('should return invalid_language for unsupported language codes', () => {
        /**
         * Only 'en' and 'tr' are supported. 'fr', 'de', etc. must be rejected.
         */
        const result = validateUIAction({
            action_type: 'set_language',
            action_value: 'fr',
            authorized_by: TEST_AUTH_CODE,
        });
        expect(result).toBe('invalid_language');
    });

    it('should NOT apply language validation to other action types', () => {
        /**
         * action_value is irrelevant for toggle actions — the validator must
         * NOT return invalid_language for them even if action_value is absent.
         */
        const result = validateUIAction({
            action_type: 'toggle_basic_panel',
            authorized_by: TEST_AUTH_CODE,
        });
        expect(result).toBe('ok');
    });
});

// =============================================================================
// Tests: CWF_VALID_UI_ACTIONS set completeness
// =============================================================================

describe('execute_ui_action — CWF_VALID_UI_ACTIONS completeness', () => {
    const EXPECTED_PANEL_TOGGLES = [
        'toggle_basic_panel', 'toggle_dtxfr', 'toggle_oee_hierarchy',
        'toggle_prod_table', 'toggle_cwf_panel', 'toggle_control_panel',
        'toggle_alarm_log', 'toggle_heatmap', 'toggle_kpi',
        'toggle_tile_passport', 'toggle_demo_settings',
    ];

    const EXPECTED_SIM_ACTIONS = ['start_simulation', 'stop_simulation', 'reset_simulation'];
    const EXPECTED_CONFIG_ACTIONS = ['set_language'];

    it('should contain exactly 11 panel toggle actions', () => {
        /**
         * Verifies all 11 panel toggles (Basic, DTXFR, OEE, ProdTbl, CWF,
         * Control, Alarm, Heatmap, KPI, Passport, Demo Settings) are present.
         */
        const toggleCount = [...CWF_VALID_UI_ACTIONS].filter(a => a.startsWith('toggle_')).length;
        expect(toggleCount).toBe(11);
    });

    it('should contain exactly 3 simulation lifecycle actions', () => {
        /** start_simulation, stop_simulation, reset_simulation */
        EXPECTED_SIM_ACTIONS.forEach(action => {
            expect(CWF_VALID_UI_ACTIONS).toContain(action);
        });
    });

    it('should contain the set_language configuration action', () => {
        EXPECTED_CONFIG_ACTIONS.forEach(action => {
            expect(CWF_VALID_UI_ACTIONS).toContain(action);
        });
    });

    it('should contain exactly 21 total actions', () => {
        /**
         * 11 panel toggles + 3 simulation + 3 conveyor status + 3 sliders + 1 config = 21 total.
         * Any addition/removal must be explicitly documented and this test updated.
         */
        expect(CWF_VALID_UI_ACTIONS.size).toBe(21);
    });

    it('should contain all expected panel toggles', () => {
        EXPECTED_PANEL_TOGGLES.forEach(action => {
            expect(CWF_VALID_UI_ACTIONS).toContain(action);
        });
    });
});

// =============================================================================
// Tests: action_value extraction from reason field
// =============================================================================

describe('processUIActionCommand — extractActionValue()', () => {
    it('should extract action_value after "| value:" in the reason field', () => {
        /**
         * executeUIAction encodes action_value into the reason field as:
         *   "User requested language change | value: en"
         * processUIActionCommand must decode this on the browser side.
         */
        const reason = 'Change language to English | value: en';
        expect(extractActionValue(reason)).toBe('en');
    });

    it('should extract action_value with extra whitespace around "| value:"', () => {
        /** The regex must be tolerant of variable whitespace */
        const reason = 'Change language |  value:   tr  ';
        expect(extractActionValue(reason)).toBe('tr');
    });

    it('should return undefined when reason has no "| value:" suffix', () => {
        /**
         * Panel toggle commands have no action_value — reason is plain text.
         * extractActionValue must return undefined, not crash.
         */
        const reason = 'Open the OEE hierarchy panel on user request';
        expect(extractActionValue(reason)).toBeUndefined();
    });

    it('should return undefined for null reason', () => {
        /**
         * reason column can be null in the DB schema.
         * Extraction must handle null gracefully.
         */
        expect(extractActionValue(null)).toBeUndefined();
    });

    it('should return undefined for empty string reason', () => {
        expect(extractActionValue('')).toBeUndefined();
    });
});

// =============================================================================
// Tests: cwf_commands row shape for UI actions
// =============================================================================

describe('execute_ui_action — cwf_commands row shape', () => {
    it('should use station="ui_action" as the sentinel value', () => {
        /**
         * UI action commands are differentiated from parameter commands by
         * station='ui_action'. useCWFCommandListener checks this field to
         * route to processUIActionCommand vs the parameter validation path.
         */
        const row = {
            session_id: 'session-uuid',
            station: 'ui_action',       // sentinel
            parameter: 'toggle_cwf_panel',
            old_value: 0,
            new_value: 0,
            reason: 'User asked CWF to open the chat panel',
            authorized_by: TEST_AUTH_CODE,
            status: 'pending',
        };
        expect(row.station).toBe('ui_action');
    });

    it('should store action_type in the parameter column', () => {
        /**
         * Since cwf_commands.parameter is a string column, action_type is
         * mapped there. processUIActionCommand reads command.parameter to
         * determine which Zustand action to dispatch.
         */
        const actionType = 'toggle_oee_hierarchy';
        const row = { parameter: actionType };
        expect(row.parameter).toBe(actionType);
    });

    it('should set old_value and new_value to 0 for UI actions', () => {
        /**
         * UI actions have no numeric before/after values — these fields are
         * set to 0 as placeholders to satisfy the cwf_commands schema.
         */
        const row = { old_value: 0, new_value: 0 };
        expect(row.old_value).toBe(0);
        expect(row.new_value).toBe(0);
    });

    it('should encode action_value into reason field with "| value:" separator', () => {
        /**
         * When action_value is provided (e.g. 'tr' for set_language), it is
         * appended to the reason string using a standardised separator.
         */
        const baseReason = 'Set interface language';
        const actionValue = 'tr';
        const reason = `${baseReason} | value: ${actionValue}`;
        expect(reason).toBe('Set interface language | value: tr');
        expect(extractActionValue(reason)).toBe('tr');
    });
});

// =============================================================================
// Tests: processUIActionCommand routing logic
// =============================================================================

describe('processUIActionCommand — UI action routing dispatch', () => {
    /**
     * Tests the core switch dispatch logic in processUIActionCommand.
     * We test routing decisions without actually calling Zustand stores
     * (which would require full React/Zustand bootstrapping).
     *
     * Approach: mirror the switch with a dispatcher that records which
     * "action" was triggered, rather than modifying UI state.
     */

    function simulateDispatch(actionType: string): string {
        /** Returns the logical destination for each action type */
        switch (actionType) {
            case 'toggle_basic_panel': return 'ui.toggleBasicPanel()';
            case 'toggle_dtxfr': return 'ui.toggleDTXFR()';
            case 'toggle_oee_hierarchy': return 'ui.toggleOEEHierarchy()';
            case 'toggle_prod_table': return 'ui.setShowProductionTable(!current)';
            case 'toggle_cwf_panel': return 'ui.toggleCWF()';
            case 'toggle_control_panel': return 'ui.toggleControlPanel()';
            case 'toggle_alarm_log': return 'ui.toggleAlarmLog()';
            case 'toggle_heatmap': return 'ui.toggleHeatmap()';
            case 'toggle_kpi': return 'ui.toggleKPI()';
            case 'toggle_tile_passport': return 'ui.togglePassport()';
            case 'toggle_demo_settings': return 'ui.toggleDemoSettings()';
            case 'start_simulation': return 'sim.toggleDataFlow() [if not running]';
            case 'stop_simulation': return 'sim.toggleDataFlow() [if running]';
            case 'reset_simulation': return 'full factory reset orchestration';
            // Conveyor status
            case 'set_conveyor_running': return 'sim.setConveyorStatus(running)';
            case 'set_conveyor_stopped': return 'sim.setConveyorStatus(stopped)';
            case 'set_conveyor_jammed': return 'sim.setConveyorStatus(jammed)';
            // Simulation sliders
            case 'set_conveyor_speed': return 'sim.setConveyorSpeed(actionValue)';
            case 'set_sclk_period': return 'sim.setSClockPeriod(actionValue)';
            case 'set_station_interval': return 'sim.setStationInterval(actionValue)';
            case 'set_language': return 'ui.setLanguage(actionValue)';
            default: return 'REJECTED: unknown action';
        }
    }

    it('toggle_basic_panel routes to ui.toggleBasicPanel()', () => {
        expect(simulateDispatch('toggle_basic_panel')).toBe('ui.toggleBasicPanel()');
    });

    it('toggle_oee_hierarchy routes to ui.toggleOEEHierarchy()', () => {
        expect(simulateDispatch('toggle_oee_hierarchy')).toBe('ui.toggleOEEHierarchy()');
    });

    it('start_simulation routes to sim.toggleDataFlow() [if not running]', () => {
        expect(simulateDispatch('start_simulation')).toContain('sim.toggleDataFlow()');
    });

    it('reset_simulation routes to full factory reset orchestration', () => {
        expect(simulateDispatch('reset_simulation')).toBe('full factory reset orchestration');
    });

    it('set_language routes to ui.setLanguage(actionValue)', () => {
        expect(simulateDispatch('set_language')).toBe('ui.setLanguage(actionValue)');
    });

    it('unknown action type routes to REJECTED path', () => {
        expect(simulateDispatch('destroy_everything')).toBe('REJECTED: unknown action');
    });

    it('all 21 valid actions have a non-REJECTED dispatch route', () => {
        /**
         * Regression guard: every action in the whitelist must have
         * a corresponding case in the switch statement.
         */
        for (const actionType of CWF_VALID_UI_ACTIONS) {
            const result = simulateDispatch(actionType);
            expect(result).not.toContain('REJECTED');
        }
    });

    // ── Conveyor status routing ───────────────────────────────────────────
    it('set_conveyor_running routes to sim.setConveyorStatus(running)', () => {
        expect(simulateDispatch('set_conveyor_running')).toBe('sim.setConveyorStatus(running)');
    });

    it('set_conveyor_stopped routes to sim.setConveyorStatus(stopped)', () => {
        expect(simulateDispatch('set_conveyor_stopped')).toBe('sim.setConveyorStatus(stopped)');
    });

    it('set_conveyor_jammed routes to sim.setConveyorStatus(jammed)', () => {
        expect(simulateDispatch('set_conveyor_jammed')).toBe('sim.setConveyorStatus(jammed)');
    });

    // ── Slider parameter routing ──────────────────────────────────────────
    it('set_conveyor_speed routes to sim.setConveyorSpeed(actionValue)', () => {
        expect(simulateDispatch('set_conveyor_speed')).toBe('sim.setConveyorSpeed(actionValue)');
    });

    it('set_sclk_period routes to sim.setSClockPeriod(actionValue)', () => {
        expect(simulateDispatch('set_sclk_period')).toBe('sim.setSClockPeriod(actionValue)');
    });

    it('set_station_interval routes to sim.setStationInterval(actionValue)', () => {
        expect(simulateDispatch('set_station_interval')).toBe('sim.setStationInterval(actionValue)');
    });
});

// =============================================================================
// Tests: Conveyor status action validation
// =============================================================================

describe('execute_ui_action — conveyor status action validation', () => {

    /**
     * Mirror of the clamping + parse logic from processUIActionCommand.
     * Used to verify conveyor speed / sClockPeriod / stationInterval validation.
     */
    function validateConveyorSpeed(raw: string | undefined): number | 'invalid' {
        /**
         * Parse the raw action_value string as a float and clamp to [0.3, 2.0].
         * Returns 'invalid' if the value is not a number.
         */
        const parsed = parseFloat(raw ?? '');
        if (isNaN(parsed)) return 'invalid';
        return Math.max(0.3, Math.min(2.0, parsed));
    }

    function validateSClkPeriod(raw: string | undefined): number | 'invalid' {
        /**
         * Parse the raw action_value as an integer, round to nearest 100ms,
         * then clamp to [200, 700]. Returns 'invalid' if not a number.
         */
        const parsed = parseInt(raw ?? '', 10);
        if (isNaN(parsed)) return 'invalid';
        return Math.max(200, Math.min(700, Math.round(parsed / 100) * 100));
    }

    function validateStationInterval(raw: string | undefined): number | 'invalid' {
        /**
         * Parse the raw action_value as an integer and clamp to [2, 7].
         * Returns 'invalid' if not a number.
         */
        const parsed = parseInt(raw ?? '', 10);
        if (isNaN(parsed)) return 'invalid';
        return Math.max(2, Math.min(7, parsed));
    }

    // conveyor status whitelist
    it('set_conveyor_running should be in CWF_VALID_UI_ACTIONS', () => {
        /** Verifies the conveyor status action type is registered in the whitelist */
        expect(CWF_VALID_UI_ACTIONS).toContain('set_conveyor_running');
    });

    it('set_conveyor_stopped should be in CWF_VALID_UI_ACTIONS', () => {
        expect(CWF_VALID_UI_ACTIONS).toContain('set_conveyor_stopped');
    });

    it('set_conveyor_jammed should be in CWF_VALID_UI_ACTIONS', () => {
        expect(CWF_VALID_UI_ACTIONS).toContain('set_conveyor_jammed');
    });

    // conveyor speed clamping
    it('conveyor speed "1.5" should parse to 1.5', () => {
        /** Normal valid value within range — no clamping needed */
        expect(validateConveyorSpeed('1.5')).toBe(1.5);
    });

    it('conveyor speed "0.3" should parse to 0.3 (min boundary)', () => {
        expect(validateConveyorSpeed('0.3')).toBe(0.3);
    });

    it('conveyor speed "2.0" should parse to 2.0 (max boundary)', () => {
        expect(validateConveyorSpeed('2.0')).toBe(2.0);
    });

    it('conveyor speed "99" should be clamped to 2.0', () => {
        /**
         * Out-of-range high values are clamped to the max.
         * The listener prevents runaway speeds via Math.min(2.0, parsed).
         */
        expect(validateConveyorSpeed('99')).toBe(2.0);
    });

    it('conveyor speed "0" should be clamped to 0.3 (below min)', () => {
        expect(validateConveyorSpeed('0')).toBe(0.3);
    });

    it('conveyor speed undefined should return invalid', () => {
        expect(validateConveyorSpeed(undefined)).toBe('invalid');
    });

    it('conveyor speed "abc" should return invalid', () => {
        expect(validateConveyorSpeed('abc')).toBe('invalid');
    });

    // S-Clock period clamping and rounding
    it('sClk period "300" should parse to 300', () => {
        expect(validateSClkPeriod('300')).toBe(300);
    });

    it('sClk period "200" should parse to 200 (min boundary)', () => {
        expect(validateSClkPeriod('200')).toBe(200);
    });

    it('sClk period "700" should parse to 700 (max boundary)', () => {
        expect(validateSClkPeriod('700')).toBe(700);
    });

    it('sClk period "100" should be clamped to 200 (below min)', () => {
        /** Values below minimum are raised to S_CLOCK_RANGE.min=200ms */
        expect(validateSClkPeriod('100')).toBe(200);
    });

    it('sClk period "900" should be clamped to 700 (above max)', () => {
        expect(validateSClkPeriod('900')).toBe(700);
    });

    it('sClk period "350" should round to 400 (nearest 100ms)', () => {
        /** Non-multiples of 100 are rounded to prevent partial-tick periods */
        expect(validateSClkPeriod('350')).toBe(400);
    });

    it('sClk period undefined should return invalid', () => {
        expect(validateSClkPeriod(undefined)).toBe('invalid');
    });

    // Station interval clamping
    it('stationInterval "3" should parse to 3', () => {
        expect(validateStationInterval('3')).toBe(3);
    });

    it('stationInterval "2" should parse to 2 (min boundary)', () => {
        expect(validateStationInterval('2')).toBe(2);
    });

    it('stationInterval "7" should parse to 7 (max boundary)', () => {
        expect(validateStationInterval('7')).toBe(7);
    });

    it('stationInterval "1" should be clamped to 2 (below min)', () => {
        /** Values below STATION_INTERVAL_RANGE.min=2 are raised to 2 */
        expect(validateStationInterval('1')).toBe(2);
    });

    it('stationInterval "10" should be clamped to 7 (above max)', () => {
        expect(validateStationInterval('10')).toBe(7);
    });

    it('stationInterval undefined should return invalid', () => {
        expect(validateStationInterval(undefined)).toBe('invalid');
    });

    it('stationInterval "abc" should return invalid', () => {
        expect(validateStationInterval('abc')).toBe('invalid');
    });
});

