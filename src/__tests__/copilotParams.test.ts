/**
 * copilotParams.test.ts — Unit Tests for CWF Copilot Configuration Constants
 *
 * Validates that all copilot constants, theme values, keywords, and type
 * exports are correctly defined and meet expected constraints.
 *
 * Tests cover:
 *   - Feature flag existence
 *   - Auth sentinel format
 *   - Timing constants (ranges, relationships)
 *   - Rate limiting defaults
 *   - Threshold defaults
 *   - Table name strings
 *   - Theme colour validity (hex format)
 *   - Intent detection keyword arrays
 *   - TypeScript type existence
 */

import {
    COPILOT_FEATURE_ENABLED,
    COPILOT_AUTH_SENTINEL,
    COPILOT_DEFAULT_POLL_INTERVAL_SEC,
    COPILOT_MIN_POLL_INTERVAL_SEC,
    COPILOT_MAX_POLL_INTERVAL_SEC,
    COPILOT_HEARTBEAT_INTERVAL_MS,
    COPILOT_HEARTBEAT_TIMEOUT_MS,
    COPILOT_DEFAULT_MAX_ACTIONS_PER_MINUTE,
    COPILOT_DEFAULT_COOLDOWN_SEC,
    COPILOT_DEFAULT_OEE_ALARM,
    COPILOT_DEFAULT_QUALITY_ALARM,
    COPILOT_CONFIG_TABLE,
    COPILOT_ACTIONS_TABLE,
    COPILOT_ROUTINE_MODEL,
    COPILOT_ENABLE_KEYWORDS,
    COPILOT_DISABLE_KEYWORDS,
    COPILOT_THEME,
} from '../lib/params/copilot';

describe('CWF Copilot Configuration Constants', () => {
    // ─── Feature Flag ────────────────────────────────────────────────────────

    test('COPILOT_FEATURE_ENABLED is a boolean', () => {
        expect(typeof COPILOT_FEATURE_ENABLED).toBe('boolean');
    });

    // ─── Auth Sentinel ───────────────────────────────────────────────────────

    test('COPILOT_AUTH_SENTINEL has system: prefix', () => {
        /** The sentinel must start with 'system:' to be clearly distinguishable
         *  from any human-entered auth code */
        expect(COPILOT_AUTH_SENTINEL).toMatch(/^system:/);
    });

    test('COPILOT_AUTH_SENTINEL is not the human auth code', () => {
        /** Must never equal 'ardic' — that's the human auth code */
        expect(COPILOT_AUTH_SENTINEL).not.toBe('ardic');
    });

    // ─── Timing: Poll Interval ───────────────────────────────────────────────

    test('default poll interval is within min/max bounds', () => {
        expect(COPILOT_DEFAULT_POLL_INTERVAL_SEC).toBeGreaterThanOrEqual(COPILOT_MIN_POLL_INTERVAL_SEC);
        expect(COPILOT_DEFAULT_POLL_INTERVAL_SEC).toBeLessThanOrEqual(COPILOT_MAX_POLL_INTERVAL_SEC);
    });

    test('minimum poll interval is positive', () => {
        expect(COPILOT_MIN_POLL_INTERVAL_SEC).toBeGreaterThan(0);
    });

    test('max poll interval is greater than min', () => {
        expect(COPILOT_MAX_POLL_INTERVAL_SEC).toBeGreaterThan(COPILOT_MIN_POLL_INTERVAL_SEC);
    });

    // ─── Timing: Heartbeat ───────────────────────────────────────────────────

    test('heartbeat timeout is at least 3x the heartbeat interval', () => {
        /** The timeout should be at least 3 missed beats to avoid false positives
         *  from network jitter or brief pauses */
        expect(COPILOT_HEARTBEAT_TIMEOUT_MS).toBeGreaterThanOrEqual(COPILOT_HEARTBEAT_INTERVAL_MS * 3);
    });

    test('heartbeat interval is in milliseconds (> 1000)', () => {
        expect(COPILOT_HEARTBEAT_INTERVAL_MS).toBeGreaterThanOrEqual(1000);
    });

    test('heartbeat timeout is in milliseconds (> 1000)', () => {
        expect(COPILOT_HEARTBEAT_TIMEOUT_MS).toBeGreaterThanOrEqual(1000);
    });

    // ─── Rate Limiting ───────────────────────────────────────────────────────

    test('max actions per minute is a positive integer', () => {
        expect(Number.isInteger(COPILOT_DEFAULT_MAX_ACTIONS_PER_MINUTE)).toBe(true);
        expect(COPILOT_DEFAULT_MAX_ACTIONS_PER_MINUTE).toBeGreaterThan(0);
    });

    test('cooldown is positive seconds', () => {
        expect(COPILOT_DEFAULT_COOLDOWN_SEC).toBeGreaterThan(0);
    });

    // ─── Thresholds ──────────────────────────────────────────────────────────

    test('OEE alarm threshold is between 0 and 100', () => {
        expect(COPILOT_DEFAULT_OEE_ALARM).toBeGreaterThan(0);
        expect(COPILOT_DEFAULT_OEE_ALARM).toBeLessThanOrEqual(100);
    });

    test('quality alarm threshold is between 0 and 100', () => {
        expect(COPILOT_DEFAULT_QUALITY_ALARM).toBeGreaterThan(0);
        expect(COPILOT_DEFAULT_QUALITY_ALARM).toBeLessThanOrEqual(100);
    });

    // ─── Table Names ─────────────────────────────────────────────────────────

    test('table names are valid snake_case strings', () => {
        expect(COPILOT_CONFIG_TABLE).toMatch(/^[a-z_]+$/);
        expect(COPILOT_ACTIONS_TABLE).toMatch(/^[a-z_]+$/);
    });

    test('table names are distinct', () => {
        expect(COPILOT_CONFIG_TABLE).not.toBe(COPILOT_ACTIONS_TABLE);
    });

    // ─── Gemini Model ────────────────────────────────────────────────────────

    test('routine model is a non-empty string', () => {
        expect(COPILOT_ROUTINE_MODEL.length).toBeGreaterThan(0);
    });

    // ─── Intent Detection Keywords ───────────────────────────────────────────

    test('enable keywords array is non-empty', () => {
        expect(COPILOT_ENABLE_KEYWORDS.length).toBeGreaterThan(0);
    });

    test('disable keywords array is non-empty', () => {
        expect(COPILOT_DISABLE_KEYWORDS.length).toBeGreaterThan(0);
    });

    test('enable and disable keywords have no overlap', () => {
        /** Enable and disable keywords must be disjoint sets */
        const enableSet = new Set(COPILOT_ENABLE_KEYWORDS);
        for (const keyword of COPILOT_DISABLE_KEYWORDS) {
            expect(enableSet.has(keyword as typeof COPILOT_ENABLE_KEYWORDS[number])).toBe(false);
        }
    });

    test('all keywords are lowercase', () => {
        for (const kw of COPILOT_ENABLE_KEYWORDS) {
            expect(kw).toBe(kw.toLowerCase());
        }
        for (const kw of COPILOT_DISABLE_KEYWORDS) {
            expect(kw).toBe(kw.toLowerCase());
        }
    });

    // ─── Theme Colours ───────────────────────────────────────────────────────

    test('theme primary is a valid hex colour', () => {
        expect(COPILOT_THEME.primary).toMatch(/^#[0-9A-Fa-f]{6}$/);
    });

    test('theme primaryLight is a valid hex colour', () => {
        expect(COPILOT_THEME.primaryLight).toMatch(/^#[0-9A-Fa-f]{6}$/);
    });

    test('theme primaryDark is a valid hex colour', () => {
        expect(COPILOT_THEME.primaryDark).toMatch(/^#[0-9A-Fa-f]{6}$/);
    });

    test('theme glow uses rgba format', () => {
        expect(COPILOT_THEME.glow).toMatch(/^rgba\(/);
    });

    test('theme bgGradient uses linear-gradient', () => {
        expect(COPILOT_THEME.bgGradient).toMatch(/^linear-gradient\(/);
    });

    test('all theme keys are present', () => {
        const expectedKeys = ['primary', 'primaryLight', 'primaryDark', 'glow', 'bgGradient', 'headerBg', 'borderColor', 'messageBg'];
        for (const key of expectedKeys) {
            expect(COPILOT_THEME).toHaveProperty(key);
        }
    });
});
