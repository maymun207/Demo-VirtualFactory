/**
 * uiTelemetryParams.test.ts — Unit Tests for src/lib/params/uiTelemetry.ts
 *
 * Validates every exported constant in the UI Telemetry & CWF UI Control
 * params module. Per global rules, ALL configuration values must be in Params
 * and MUST have corresponding unit tests.
 *
 * Coverage:
 *   1. Telemetry queue constants (BATCH_SIZE, DEBOUNCE_MS, MAX_QUEUE, IDLE_DEADLINE_MS)
 *   2. Telemetry event category string constants
 *   3. CWF_VALID_UI_ACTIONS set: completeness, count, case-sensitivity
 *   4. CWF_UI_ACTION_VALID_LANGUAGES: exactly ['en', 'tr']
 *   5. CWF UI action ACK timing constants
 *   6. Sentinel and separator string constants
 *   7. Cross-constant relationships (DEBOUNCE < ACK_WAIT, BATCH > 0, etc.)
 */
/// <reference types="vitest/globals" />

import { describe, it, expect } from 'vitest';
import {
    TELEMETRY_BATCH_SIZE,
    TELEMETRY_FLUSH_DEBOUNCE_MS,
    TELEMETRY_MAX_QUEUE_SIZE,
    TELEMETRY_IDLE_DEADLINE_MS,
    TELEMETRY_CATEGORY_UI_ACTION,
    TELEMETRY_CATEGORY_SIM_STATE,
    TELEMETRY_CATEGORY_CWF_INTERACTION,
    TELEMETRY_CATEGORY_PARAMETER,
    CWF_VALID_UI_ACTIONS,
    CWF_UI_ACTION_VALID_LANGUAGES,
    CWF_UI_ACTION_ACK_WAIT_MS,
    CWF_UI_ACTION_ACK_POLL_INTERVAL_MS,
    CWF_UI_ACTION_STATION_SENTINEL,
    CWF_UI_ACTION_VALUE_SEPARATOR,
} from '../lib/params/uiTelemetry';

// =============================================================================
// Tests: Telemetry queue configuration constants
// =============================================================================

describe('uiTelemetry params — telemetry queue configuration', () => {
    it('TELEMETRY_BATCH_SIZE should be a positive integer', () => {
        /**
         * Batch size must be ≥ 1 to avoid zero-length INSERT calls.
         * Upper bound of ~50 prevents excessively large Supabase payloads.
         */
        expect(TELEMETRY_BATCH_SIZE).toBeGreaterThan(0);
        expect(Number.isInteger(TELEMETRY_BATCH_SIZE)).toBe(true);
        expect(TELEMETRY_BATCH_SIZE).toBeLessThanOrEqual(50);
    });

    it('TELEMETRY_FLUSH_DEBOUNCE_MS should be between 50ms and 2000ms', () => {
        /**
         * Too short (< 50ms): events fire before batching has value.
         * Too long (> 2000ms): events feel stale when viewed in Supabase.
         * 300ms is the calibrated sweet-spot for UI interaction patterns.
         */
        expect(TELEMETRY_FLUSH_DEBOUNCE_MS).toBeGreaterThanOrEqual(50);
        expect(TELEMETRY_FLUSH_DEBOUNCE_MS).toBeLessThanOrEqual(2000);
    });

    it('TELEMETRY_MAX_QUEUE_SIZE should be at least 50', () => {
        /**
         * Queue must handle burst activity (rapid panel toggles, slider drags)
         * without dropping events. 50 events is the minimum reasonable buffer.
         */
        expect(TELEMETRY_MAX_QUEUE_SIZE).toBeGreaterThanOrEqual(50);
    });

    it('TELEMETRY_IDLE_DEADLINE_MS should be greater than TELEMETRY_FLUSH_DEBOUNCE_MS', () => {
        /**
         * The idle callback deadline must be longer than the debounce window —
         * otherwise the flush would always be forced before idle time is checked.
         */
        expect(TELEMETRY_IDLE_DEADLINE_MS).toBeGreaterThan(TELEMETRY_FLUSH_DEBOUNCE_MS);
    });

    it('TELEMETRY_MAX_QUEUE_SIZE should be greater than TELEMETRY_BATCH_SIZE', () => {
        /**
         * Queue capacity must be larger than a single batch — otherwise the
         * queue would be exhausted in a single flush cycle and offer no buffering.
         */
        expect(TELEMETRY_MAX_QUEUE_SIZE).toBeGreaterThan(TELEMETRY_BATCH_SIZE);
    });
});

// =============================================================================
// Tests: Telemetry event category constants
// =============================================================================

describe('uiTelemetry params — telemetry event categories', () => {
    it('TELEMETRY_CATEGORY_UI_ACTION should be the string "ui_action"', () => {
        /**
         * Must match the CHECK constraint on ui_telemetry_events.event_category.
         * Changing this would require a DB migration.
         */
        expect(TELEMETRY_CATEGORY_UI_ACTION).toBe('ui_action');
    });

    it('TELEMETRY_CATEGORY_SIM_STATE should be the string "sim_state"', () => {
        expect(TELEMETRY_CATEGORY_SIM_STATE).toBe('sim_state');
    });

    it('TELEMETRY_CATEGORY_CWF_INTERACTION should be the string "cwf_interaction"', () => {
        expect(TELEMETRY_CATEGORY_CWF_INTERACTION).toBe('cwf_interaction');
    });

    it('TELEMETRY_CATEGORY_PARAMETER should be the string "parameter"', () => {
        expect(TELEMETRY_CATEGORY_PARAMETER).toBe('parameter');
    });

    it('all 4 categories should be distinct strings', () => {
        /**
         * Each category serves a different analytics dimension.
         * Duplicate string values would cause events to be mis-classified.
         */
        const categories = [
            TELEMETRY_CATEGORY_UI_ACTION,
            TELEMETRY_CATEGORY_SIM_STATE,
            TELEMETRY_CATEGORY_CWF_INTERACTION,
            TELEMETRY_CATEGORY_PARAMETER,
        ];
        const unique = new Set(categories);
        expect(unique.size).toBe(4);
    });
});

// =============================================================================
// Tests: CWF_VALID_UI_ACTIONS set
// =============================================================================

describe('uiTelemetry params — CWF_VALID_UI_ACTIONS', () => {
    it('should be a Set instance', () => {
        /** Consumers rely on CWF_VALID_UI_ACTIONS.has() for O(1) lookup */
        expect(CWF_VALID_UI_ACTIONS).toBeInstanceOf(Set);
    });

    it('should contain exactly 15 action types', () => {
        /**
         * 11 panel toggles + 3 simulation + 1 config = 15 total.
         * Any addition/removal must be documented and this test updated.
         */
        expect(CWF_VALID_UI_ACTIONS.size).toBe(15);
    });

    it('should contain all 11 panel toggle actions', () => {
        /** All panel toggle action types that map to uiStore toggle methods */
        const expectedToggles = [
            'toggle_basic_panel', 'toggle_dtxfr', 'toggle_oee_hierarchy',
            'toggle_prod_table', 'toggle_cwf_panel', 'toggle_control_panel',
            'toggle_alarm_log', 'toggle_heatmap', 'toggle_kpi',
            'toggle_tile_passport', 'toggle_demo_settings',
        ];
        expectedToggles.forEach(action => {
            expect(CWF_VALID_UI_ACTIONS).toContain(action);
        });
    });

    it('should contain all 3 simulation lifecycle actions', () => {
        expect(CWF_VALID_UI_ACTIONS).toContain('start_simulation');
        expect(CWF_VALID_UI_ACTIONS).toContain('stop_simulation');
        expect(CWF_VALID_UI_ACTIONS).toContain('reset_simulation');
    });

    it('should contain the set_language configuration action', () => {
        expect(CWF_VALID_UI_ACTIONS).toContain('set_language');
    });

    it('should NOT contain unknown action types', () => {
        /**
         * Guard against Gemini hallucinating action types that don't exist.
         * These would be silently ignored by processUIActionCommand without
         * this validation gate on the server side.
         */
        expect(CWF_VALID_UI_ACTIONS).not.toContain('delete_database');
        expect(CWF_VALID_UI_ACTIONS).not.toContain('');
        expect(CWF_VALID_UI_ACTIONS).not.toContain('Toggle_Basic_Panel');
    });

    it('all action type strings should be lowercase_snake_case', () => {
        /**
         * Consistent casing prevents lookup failures from capitalisation mismatches.
         * All actions are defined as lowercase_snake_case and must remain so.
         */
        for (const action of CWF_VALID_UI_ACTIONS) {
            expect(action).toBe(action.toLowerCase().replace(/-/g, '_'));
        }
    });
});

// =============================================================================
// Tests: CWF_UI_ACTION_VALID_LANGUAGES
// =============================================================================

describe('uiTelemetry params — CWF_UI_ACTION_VALID_LANGUAGES', () => {
    it('should be a readonly array', () => {
        /** Must be an array — useable with .includes() */
        expect(Array.isArray(CWF_UI_ACTION_VALID_LANGUAGES)).toBe(true);
    });

    it('should contain exactly 2 language codes', () => {
        /**
         * Currently supported languages are English and Turkish.
         * Adding a language requires updating the uiStore.setLanguage() handler too.
         */
        expect(CWF_UI_ACTION_VALID_LANGUAGES).toHaveLength(2);
    });

    it('should contain "en" for English', () => {
        expect(CWF_UI_ACTION_VALID_LANGUAGES).toContain('en');
    });

    it('should contain "tr" for Turkish', () => {
        expect(CWF_UI_ACTION_VALID_LANGUAGES).toContain('tr');
    });

    it('should NOT contain uppercase or multi-char codes', () => {
        /** Language codes follow IETF short-form (2 lowercase chars) */
        for (const code of CWF_UI_ACTION_VALID_LANGUAGES) {
            expect(code).toHaveLength(2);
            expect(code).toBe(code.toLowerCase());
        }
    });
});

// =============================================================================
// Tests: CWF UI action ACK timing constants
// =============================================================================

describe('uiTelemetry params — CWF UI action ACK timing', () => {
    it('CWF_UI_ACTION_ACK_WAIT_MS should be positive', () => {
        expect(CWF_UI_ACTION_ACK_WAIT_MS).toBeGreaterThan(0);
    });

    it('CWF_UI_ACTION_ACK_WAIT_MS should be less than 55000ms (client timeout)', () => {
        /**
         * ACK wait must be shorter than CWF_CLIENT_TIMEOUT_MS (55 000 ms)
         * so the server can return a timeout error before the fetch() disconnects.
         */
        expect(CWF_UI_ACTION_ACK_WAIT_MS).toBeLessThan(55_000);
    });

    it('CWF_UI_ACTION_ACK_POLL_INTERVAL_MS should be positive', () => {
        expect(CWF_UI_ACTION_ACK_POLL_INTERVAL_MS).toBeGreaterThan(0);
    });

    it('CWF_UI_ACTION_ACK_POLL_INTERVAL_MS should be less than CWF_UI_ACTION_ACK_WAIT_MS', () => {
        /**
         * Poll interval must be shorter than the total wait window —
         * otherwise the server would poll zero times before timing out.
         * At minimum, 2 polls should fit within the wait window.
         */
        expect(CWF_UI_ACTION_ACK_POLL_INTERVAL_MS * 2).toBeLessThan(CWF_UI_ACTION_ACK_WAIT_MS);
    });
});

// =============================================================================
// Tests: Sentinel and separator string constants
// =============================================================================

describe('uiTelemetry params — sentinel and separator constants', () => {
    it('CWF_UI_ACTION_STATION_SENTINEL should be the string "ui_action"', () => {
        /**
         * The sentinel value used in cwf_commands.station to identify UI action
         * rows. Changing this would break useCWFCommandListener routing unless
         * both constants are updated in sync AND a DB migration is run for
         * any in-flight rows.
         */
        expect(CWF_UI_ACTION_STATION_SENTINEL).toBe('ui_action');
    });

    it('CWF_UI_ACTION_VALUE_SEPARATOR should contain "| value:"', () => {
        /**
         * The separator is used to encode action_value into the reason field.
         * It must be consistent between chat.ts (writer) and
         * useCWFCommandListener (reader) — both import from this module.
         */
        expect(CWF_UI_ACTION_VALUE_SEPARATOR).toContain('| value:');
    });

    it('CWF_UI_ACTION_VALUE_SEPARATOR should be parseable via regex in a reason string', () => {
        /**
         * End-to-end validation: encoding + decoding a value through the separator.
         * This verifies that the separator pattern is usable for the regex
         * extraction in processUIActionCommand.
         */
        const actionValue = 'tr';
        const reason = `Change language | value: ${actionValue}`;
        const sep = CWF_UI_ACTION_VALUE_SEPARATOR;
        /** Escape the pipe character for use in a RegExp */
        const sepEscaped = sep.replace(/[|]/g, '\\|');
        const match = reason.match(new RegExp(`${sepEscaped}\\s*(.+)$`));
        expect(match).not.toBeNull();
        expect(match![1].trim()).toBe('tr');
    });
});
