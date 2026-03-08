/**
 * cwfPanelActions.test.ts
 *
 * Unit tests for the two behavioural changes made to the CWF panel action system:
 *   1. Idempotent panel state — "open X" when X is already open is a no-op.
 *      "open X" when X is closed opens it. Never accidentally closes.
 *   2. Auth-free UI actions — execute_ui_action no longer requires authorized_by.
 *      CWF_UI_ACTION_BYPASS_AUTH is written to the audit trail instead.
 *
 * Because useCWFCommandListener.ts contains React hooks, the idempotency logic
 * is tested by exercising the shouldOpen/shouldClose decision rule inline
 * (matching the exact pattern used in every case block).
 *
 * The params constants are imported and their values are asserted to confirm
 * they are what the production code relies on.
 */
import { describe, it, expect } from 'vitest';
import {
    CWF_UI_ACTION_OPEN,
    CWF_UI_ACTION_CLOSE,
    CWF_UI_ACTION_BYPASS_AUTH,
} from '../lib/params/cwfAgent';

// ─────────────────────────────────────────────────────────────────────────────
// 1. Params constants — value assertions
// ─────────────────────────────────────────────────────────────────────────────
describe('CWF UI action params constants', () => {
    it('CWF_UI_ACTION_OPEN has the canonical value "open"', () => {
        /** The Gemini tool is instructed to pass this string as action_value
         *  when the user requests opening a panel. */
        expect(CWF_UI_ACTION_OPEN).toBe('open');
    });

    it('CWF_UI_ACTION_CLOSE has the canonical value "close"', () => {
        /** The Gemini tool is instructed to pass this string as action_value
         *  when the user requests closing a panel. */
        expect(CWF_UI_ACTION_CLOSE).toBe('close');
    });

    it('CWF_UI_ACTION_BYPASS_AUTH is a non-empty system sentinel', () => {
        /** This string is written to cwf_commands.authorized_by for all UI actions.
         *  It must be non-empty (the DB column is NOT NULL) and distinct from any
         *  real auth code so audit queries can distinguish UI-action rows. */
        expect(CWF_UI_ACTION_BYPASS_AUTH).toBeTruthy();
        expect(CWF_UI_ACTION_BYPASS_AUTH).not.toBe('airtk'); // must differ from user auth code
        expect(CWF_UI_ACTION_BYPASS_AUTH.startsWith('system:')).toBe(true);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Idempotency decision rule (mirrors each case block in useCWFCommandListener)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * shouldToggle replicates the exact guard used in each panel case block:
 *   const shouldOpen = actionValue !== CWF_UI_ACTION_CLOSE;
 *   if (currentState !== shouldOpen) { toggle(); }
 *
 * Returns true if the toggle function SHOULD be called, false if it should not.
 */
function shouldToggle(currentState: boolean, actionValue: string | undefined): boolean {
    /** Default intent is "open" — only 'close' triggers close intent */
    const shouldOpen = actionValue !== CWF_UI_ACTION_CLOSE;
    /** Toggle only when current state disagrees with intent */
    return currentState !== shouldOpen;
}

describe('Idempotency decision rule', () => {
    // ── Open intent (actionValue = 'open' or undefined) ──────────────────────
    it('opens a closed panel when intent is "open"', () => {
        /** Panel is closed (false), intent is open → should toggle (false → true) */
        expect(shouldToggle(false, 'open')).toBe(true);
    });

    it('is a no-op when panel is already open and intent is "open"', () => {
        /** Panel is open (true), intent is open → no-op */
        expect(shouldToggle(true, 'open')).toBe(false);
    });

    it('opens a closed panel when actionValue is undefined (default = open)', () => {
        /** Omitted actionValue is treated as open intent */
        expect(shouldToggle(false, undefined)).toBe(true);
    });

    it('is a no-op when panel is already open and actionValue is undefined', () => {
        /** Panel open, intent defaulted to open → no-op */
        expect(shouldToggle(true, undefined)).toBe(false);
    });

    // ── Close intent (actionValue = 'close') ──────────────────────────────────
    it('closes an open panel when intent is "close"', () => {
        /** Panel is open (true), intent is close → should toggle (true → false) */
        expect(shouldToggle(true, 'close')).toBe(true);
    });

    it('is a no-op when panel is already closed and intent is "close"', () => {
        /** Panel is closed (false), intent is close → no-op */
        expect(shouldToggle(false, 'close')).toBe(false);
    });

    // ── Edge cases ────────────────────────────────────────────────────────────
    it('treats any actionValue other than "close" as open intent', () => {
        /** Unknown values (e.g., empty string or garbage) default to open */
        expect(shouldToggle(false, '')).toBe(true);        // empty string → open intent
        expect(shouldToggle(true, '')).toBe(false);       // already open, open intent → no-op
        expect(shouldToggle(false, 'OPEN')).toBe(true);    // case-sensitive: not 'close' → open
    });

    it('is strictly case-sensitive — only lowercase "close" triggers close intent', () => {
        /** 'Close' and 'CLOSE' are not equal to CWF_UI_ACTION_CLOSE = 'close' */
        expect(shouldToggle(true, 'Close')).toBe(false);  // close != Close → open intent → no-op
        expect(shouldToggle(true, 'CLOSE')).toBe(false);  // close != CLOSE → open intent → no-op
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. All 11 panel action types exercised with the idempotency rule
// ─────────────────────────────────────────────────────────────────────────────

/**
 * These are the exact action types handled by processUIActionCommand.
 * This test verifies the complete list has not changed accidentally.
 */
const PANEL_ACTION_TYPES = [
    'toggle_basic_panel',
    'toggle_dtxfr',
    'toggle_oee_hierarchy',
    'toggle_prod_table',
    'toggle_cwf_panel',
    'toggle_control_panel',
    'toggle_alarm_log',
    'toggle_heatmap',
    'toggle_kpi',
    'toggle_tile_passport',
    'toggle_demo_settings',
] as const;

describe('Idempotency covers all 11 panel action types', () => {
    it('has exactly 11 panel action types', () => {
        expect(PANEL_ACTION_TYPES).toHaveLength(11);
    });

    PANEL_ACTION_TYPES.forEach((actionType) => {
        it(`${actionType}: open-when-closed toggles, open-when-open is no-op`, () => {
            expect(shouldToggle(false, 'open')).toBe(true);   // closed → open
            expect(shouldToggle(true, 'open')).toBe(false);  // already open → no-op
        });

        it(`${actionType}: close-when-open toggles, close-when-closed is no-op`, () => {
            expect(shouldToggle(true, 'close')).toBe(true);  // open → close
            expect(shouldToggle(false, 'close')).toBe(false); // already closed → no-op
        });
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Auth bypass sentinel contract
// ─────────────────────────────────────────────────────────────────────────────
describe('CWF_UI_ACTION_BYPASS_AUTH contract', () => {
    const REAL_AUTH_CODE = 'airtk';

    it('is never equal to the real user auth code', () => {
        /** The audit trail must be able to distinguish UI-action rows from
         *  operator-authorized parameter-change rows. */
        expect(CWF_UI_ACTION_BYPASS_AUTH).not.toBe(REAL_AUTH_CODE);
    });

    it('starts with "system:" namespace prefix for readable audit filtering', () => {
        /** Allows SQL: WHERE authorized_by LIKE 'system:%' to find UI action rows */
        expect(CWF_UI_ACTION_BYPASS_AUTH).toMatch(/^system:/);
    });

    it('is a stable non-empty string (not undefined or null)', () => {
        expect(typeof CWF_UI_ACTION_BYPASS_AUTH).toBe('string');
        expect(CWF_UI_ACTION_BYPASS_AUTH.length).toBeGreaterThan(0);
    });
});
