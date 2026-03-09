/**
 * cwfScenarioSwitch.test.ts — Unit Tests for CWF Scenario Switch Configuration
 *
 * Tests the cwfScenarioSwitch.ts params module, verifying:
 *   - CWF_SCENARIO_SWITCH_ACTION constant value correctness
 *   - VALID_SCENARIO_CODES array completeness and ordering
 *   - isValidScenarioCode() type guard logic (true/false/edge cases)
 *   - SCENARIO_DISPLAY_LABELS completeness and non-empty values
 *   - ScenarioCode type coverage (every code has a display label)
 *
 * Run: npx vitest run src/lib/params/cwfScenarioSwitch.test.ts
 */

import { describe, it, expect } from 'vitest';
import {
    CWF_SCENARIO_SWITCH_ACTION,
    VALID_SCENARIO_CODES,
    SCENARIO_DISPLAY_LABELS,
    isValidScenarioCode,
    type ScenarioCode,
} from './cwfScenarioSwitch';

// =============================================================================
// CWF_SCENARIO_SWITCH_ACTION
// =============================================================================

describe('CWF_SCENARIO_SWITCH_ACTION', () => {
    it('should be the string "switch_scenario"', () => {
        /**
         * This exact string is used in processUIActionCommand() as the switch-case key.
         * If it changes here, the handler case in useCWFCommandListener.ts must also change.
         */
        expect(CWF_SCENARIO_SWITCH_ACTION).toBe('switch_scenario');
    });

    it('should be a non-empty string', () => {
        /** An empty action type would silently match the default: case in the listener */
        expect(CWF_SCENARIO_SWITCH_ACTION.length).toBeGreaterThan(0);
    });

    it('should not contain spaces', () => {
        /**
         * Action type strings are stored in the cwf_commands.parameter DB column.
         * Spaces would make the CWF_UI_ACTION_VALUE_SEPARATOR regex ambiguous.
         */
        expect(CWF_SCENARIO_SWITCH_ACTION).not.toContain(' ');
    });
});

// =============================================================================
// VALID_SCENARIO_CODES
// =============================================================================

describe('VALID_SCENARIO_CODES', () => {
    it('should contain exactly 5 codes', () => {
        /** Factory has 5 scenarios: SCN-000 (reference) + SCN-001 through SCN-004 */
        expect(VALID_SCENARIO_CODES).toHaveLength(5);
    });

    it('should contain SCN-000 through SCN-004 in ascending order', () => {
        /** Order matters for enum display and for user-facing documentation */
        expect(VALID_SCENARIO_CODES).toEqual([
            'SCN-000',
            'SCN-001',
            'SCN-002',
            'SCN-003',
            'SCN-004',
        ]);
    });

    it('should include SCN-000 (reference/no-defect baseline)', () => {
        /** SCN-000 must be reachable via CWF so the user can return to factory defaults */
        expect(VALID_SCENARIO_CODES).toContain('SCN-000');
    });

    it('each code should match the SCN-NNN format', () => {
        /** All codes must follow the 7-character format SCN-NNN with 3 decimal digits */
        const format = /^SCN-\d{3}$/;
        for (const code of VALID_SCENARIO_CODES) {
            /** Code must match the pattern SCN-000, SCN-001, etc. */
            expect(code).toMatch(format);
        }
    });
});

// =============================================================================
// isValidScenarioCode()
// =============================================================================

describe('isValidScenarioCode', () => {
    it('should return true for every code in VALID_SCENARIO_CODES', () => {
        /** The type guard must accept all codes it protects */
        for (const code of VALID_SCENARIO_CODES) {
            expect(isValidScenarioCode(code)).toBe(true);
        }
    });

    it('should return true for SCN-000 (reference scenario)', () => {
        /** SCN-000 acceptance is critical — it is the reset-to-defaults path */
        expect(isValidScenarioCode('SCN-000')).toBe(true);
    });

    it('should return true for SCN-004 (maximum cascade scenario)', () => {
        /** Boundary check on the highest-numbered scenario */
        expect(isValidScenarioCode('SCN-004')).toBe(true);
    });

    it('should return false for a non-existent code SCN-005', () => {
        /**
         * SCN-005 does not exist. If the guard passes it, the handler will call
         * getScenarioByCode('SCN-005') → undefined → data integrity rejection.
         * Better to reject early here.
         */
        expect(isValidScenarioCode('SCN-005')).toBe(false);
    });

    it('should return false for an empty string', () => {
        /** An empty action_value would cause a confusing lookup failure — reject at guard */
        expect(isValidScenarioCode('')).toBe(false);
    });

    it('should return false for lowercase versions of codes', () => {
        /**
         * Codes are stored and matched case-sensitively. 'scn-002' is NOT valid.
         * If Gemini ever returns lowercase (hallucination), we reject here.
         */
        expect(isValidScenarioCode('scn-002')).toBe(false);
        expect(isValidScenarioCode('scn-000')).toBe(false);
    });

    it('should return false for codes without the SCN- prefix', () => {
        /** Bare numbers like '002' or 'scenario-002' must be rejected */
        expect(isValidScenarioCode('002')).toBe(false);
        expect(isValidScenarioCode('scenario-002')).toBe(false);
    });

    it('should return false for undefined cast as string', () => {
        /** Defensive test: undefined action_value coerced to string */
        expect(isValidScenarioCode(String(undefined))).toBe(false);
    });
});

// =============================================================================
// SCENARIO_DISPLAY_LABELS
// =============================================================================

describe('SCENARIO_DISPLAY_LABELS', () => {
    it('should have a label for every valid scenario code', () => {
        /**
         * Every code in VALID_SCENARIO_CODES must be a key in SCENARIO_DISPLAY_LABELS.
         * If a code is added to VALID_SCENARIO_CODES without a label, the CWF
         * confirmation message will show `undefined`.
         */
        for (const code of VALID_SCENARIO_CODES) {
            /** Cast is safe because VALID_SCENARIO_CODES is ScenarioCode[] */
            const label = SCENARIO_DISPLAY_LABELS[code as ScenarioCode];
            expect(label).toBeDefined();
        }
    });

    it('should have non-empty labels for every scenario', () => {
        /** Labels must never be empty strings — they are shown to users in CWF chat */
        for (const code of VALID_SCENARIO_CODES) {
            const label = SCENARIO_DISPLAY_LABELS[code as ScenarioCode];
            expect(label.length).toBeGreaterThan(0);
        }
    });

    it('should have exactly 5 label entries matching VALID_SCENARIO_CODES', () => {
        /**
         * The label map and the valid codes set must stay in sync.
         * If VALID_SCENARIO_CODES grows, SCENARIO_DISPLAY_LABELS for the new code must
         * also be added — this test will fail to remind the developer.
         */
        expect(Object.keys(SCENARIO_DISPLAY_LABELS)).toHaveLength(VALID_SCENARIO_CODES.length);
    });

    it('SCN-000 should have a label that indicates reference or optimal production', () => {
        /**
         * SCN-000 represents the no-defect baseline. The label must make this clear
         * so users understand what "switch to SCN-000" means.
         */
        const label = SCENARIO_DISPLAY_LABELS['SCN-000'];
        /** Check that it contains one of the expected keywords */
        const hasKeyword = label.includes('Optimal') || label.includes('Reference') || label.includes('Production');
        expect(hasKeyword).toBe(true);
    });

    it('SCN-002 label should mention Kiln or Temperature', () => {
        /** The label must clearly identify the Kiln Temperature Crisis scenario */
        const label = SCENARIO_DISPLAY_LABELS['SCN-002'];
        const hasKeyword = label.includes('Kiln') || label.includes('Temperature');
        expect(hasKeyword).toBe(true);
    });
});
