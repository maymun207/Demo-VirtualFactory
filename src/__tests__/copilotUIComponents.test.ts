/**
 * copilotUIComponents.test.ts — Unit Tests for Copilot UI Components
 *
 * Tests the extracted copilot UI component logic:
 *   1. CopilotMessageBadge — helper functions (isCopilotMessage, stripCopilotPrefix)
 *   2. COPILOT_UI_LABELS — all text labels, tooltips, and bilingual support
 *   3. COPILOT_AUTH_SENTINEL — in cwfCommands.ts matches params/copilot.ts
 *
 * Does NOT test React rendering (requires @testing-library/react).
 * Focuses on pure logic and configuration correctness.
 */

import { describe, test, expect } from 'vitest';

import {
    COPILOT_UI_LABELS,
    COPILOT_THEME,
    COPILOT_DEFAULT_POLL_INTERVAL_SEC,
    COPILOT_AUTH_SENTINEL as COPILOT_AUTH_SENTINEL_PARAMS,
} from '../lib/params/copilot';

import {
    COPILOT_AUTH_SENTINEL as COPILOT_AUTH_SENTINEL_COMMANDS,
} from '../lib/params/cwfCommands';

import {
    isCopilotMessage,
    stripCopilotPrefix,
} from '../components/ui/copilot/CopilotMessageBadge';

// =============================================================================
// COPILOT MESSAGE DETECTION HELPERS
// =============================================================================

describe('CopilotMessageBadge — isCopilotMessage helper', () => {
    test('returns true for messages starting with 🤖 prefix', () => {
        /** Messages from copilot engine always begin with the emoji */
        expect(isCopilotMessage('🤖 Kiln temperature corrected')).toBe(true);
    });

    test('returns true for prefix-only messages', () => {
        /** Edge case: just the emoji with no body text */
        expect(isCopilotMessage('🤖')).toBe(true);
    });

    test('returns false for regular system messages', () => {
        /** Normal system messages should not trigger copilot styling */
        expect(isCopilotMessage('Connected to simulation')).toBe(false);
    });

    test('returns false for empty messages', () => {
        /** Empty strings should not match */
        expect(isCopilotMessage('')).toBe(false);
    });

    test('returns false for messages with emoji in the middle', () => {
        /** Only the START of the message triggers detection */
        expect(isCopilotMessage('System update 🤖 check')).toBe(false);
    });

    test('uses the prefix from COPILOT_UI_LABELS', () => {
        /** Ensuring the detection logic uses the centralised constant */
        const prefix = COPILOT_UI_LABELS.copilotMessagePrefix;
        expect(isCopilotMessage(`${prefix} test message`)).toBe(true);
    });
});

describe('CopilotMessageBadge — stripCopilotPrefix helper', () => {
    test('strips 🤖 and leading whitespace from copilot messages', () => {
        /** The badge label replaces the emoji, so it must be removed */
        expect(stripCopilotPrefix('🤖 Kiln corrected')).toBe('Kiln corrected');
    });

    test('strips 🤖 without trailing whitespace', () => {
        /** Handle case where emoji is immediately followed by text */
        expect(stripCopilotPrefix('🤖Action taken')).toBe('Action taken');
    });

    test('returns original content for non-copilot messages', () => {
        /** Non-copilot messages pass through unchanged */
        expect(stripCopilotPrefix('Normal message')).toBe('Normal message');
    });

    test('returns empty string for prefix-only messages', () => {
        /** Edge case: just the emoji with optional space */
        expect(stripCopilotPrefix('🤖 ')).toBe('');
    });
});

// =============================================================================
// COPILOT UI LABELS — Bilingual Text Validation
// =============================================================================

describe('COPILOT_UI_LABELS — Text Labels', () => {
    test('enableTooltip has both en and tr translations', () => {
        expect(typeof COPILOT_UI_LABELS.enableTooltip.en).toBe('string');
        expect(typeof COPILOT_UI_LABELS.enableTooltip.tr).toBe('string');
        /** Both should be non-empty */
        expect(COPILOT_UI_LABELS.enableTooltip.en.length).toBeGreaterThan(0);
        expect(COPILOT_UI_LABELS.enableTooltip.tr.length).toBeGreaterThan(0);
    });

    test('disableTooltip has both en and tr translations', () => {
        expect(typeof COPILOT_UI_LABELS.disableTooltip.en).toBe('string');
        expect(typeof COPILOT_UI_LABELS.disableTooltip.tr).toBe('string');
    });

    test('enableChatMessage has both en and tr translations', () => {
        expect(typeof COPILOT_UI_LABELS.enableChatMessage.en).toBe('string');
        expect(typeof COPILOT_UI_LABELS.enableChatMessage.tr).toBe('string');
    });

    test('disableChatMessage has both en and tr translations', () => {
        expect(typeof COPILOT_UI_LABELS.disableChatMessage.en).toBe('string');
        expect(typeof COPILOT_UI_LABELS.disableChatMessage.tr).toBe('string');
    });

    test('badgeLabel is a non-empty string', () => {
        expect(typeof COPILOT_UI_LABELS.badgeLabel).toBe('string');
        expect(COPILOT_UI_LABELS.badgeLabel.length).toBeGreaterThan(0);
    });

    test('messageBadgeLabel is a non-empty string', () => {
        expect(typeof COPILOT_UI_LABELS.messageBadgeLabel).toBe('string');
        expect(COPILOT_UI_LABELS.messageBadgeLabel.length).toBeGreaterThan(0);
    });

    test('copilotMessageStation equals copilot_message', () => {
        /** Must match the station value used in cwf_commands table */
        expect(COPILOT_UI_LABELS.copilotMessageStation).toBe('copilot_message');
    });

    test('copilotMessagePrefix is the robot emoji', () => {
        /** Must be 🤖 for consistent detection */
        expect(COPILOT_UI_LABELS.copilotMessagePrefix).toBe('🤖');
    });
});

describe('COPILOT_UI_LABELS — Dynamic Status Functions', () => {
    test('statusActive.en generates correct text with interval', () => {
        const text = COPILOT_UI_LABELS.statusActive.en(15);
        expect(text).toContain('Copilot Active');
        expect(text).toContain('15s');
    });

    test('statusActive.tr generates Turkish text with interval', () => {
        const text = COPILOT_UI_LABELS.statusActive.tr(15);
        expect(text).toContain('Copilot Aktif');
        expect(text).toContain('15s');
    });

    test('statusActive uses configurable interval', () => {
        /** The function should interpolate whatever interval is passed */
        expect(COPILOT_UI_LABELS.statusActive.en(30)).toContain('30s');
        expect(COPILOT_UI_LABELS.statusActive.en(10)).toContain('10s');
    });

    test('actionCountSuffix.en pluralizes correctly', () => {
        /** 1 action → "1 action taken" (no 's') */
        expect(COPILOT_UI_LABELS.actionCountSuffix.en(1)).toContain('1 action taken');
        /** 3 actions → "3 actions taken" (with 's') */
        expect(COPILOT_UI_LABELS.actionCountSuffix.en(3)).toContain('3 actions taken');
    });

    test('actionCountSuffix.tr returns Turkish text', () => {
        const text = COPILOT_UI_LABELS.actionCountSuffix.tr(2);
        expect(text).toContain('2');
        expect(text).toContain('eylem');
    });

    test('default poll interval is used by status bar', () => {
        /** When no custom interval is provided, the default should work */
        const text = COPILOT_UI_LABELS.statusActive.en(COPILOT_DEFAULT_POLL_INTERVAL_SEC);
        expect(text).toContain(`${COPILOT_DEFAULT_POLL_INTERVAL_SEC}s`);
    });
});

// =============================================================================
// COPILOT AUTH SENTINEL — Cross-Module Consistency
// =============================================================================

describe('COPILOT_AUTH_SENTINEL — Cross-Module Consistency', () => {
    test('sentinel in cwfCommands.ts matches sentinel in params/copilot.ts', () => {
        /** Both modules must export the exact same sentinel value */
        expect(COPILOT_AUTH_SENTINEL_COMMANDS).toBe(COPILOT_AUTH_SENTINEL_PARAMS);
    });

    test('sentinel has system: prefix (distinguishes from human auth)', () => {
        expect(COPILOT_AUTH_SENTINEL_COMMANDS).toMatch(/^system:/);
    });

    test('sentinel is not the human auth code airtk', () => {
        expect(COPILOT_AUTH_SENTINEL_COMMANDS).not.toBe('airtk');
    });
});

// =============================================================================
// COPILOT THEME — UI Colour Validation
// =============================================================================

describe('COPILOT_THEME — used by extracted components', () => {
    test('messageBg is defined (used by CopilotMessageBadge glow)', () => {
        /** The message badge uses COPILOT_THEME.messageBg for box-shadow */
        expect(typeof COPILOT_THEME.messageBg).toBe('string');
        expect(COPILOT_THEME.messageBg.length).toBeGreaterThan(0);
    });

    test('primaryLight is a valid hex colour (used by badge label)', () => {
        /** The badge label renders in primaryLight colour */
        expect(COPILOT_THEME.primaryLight).toMatch(/^#[0-9A-Fa-f]{6}$/);
    });

    test('primary is a valid hex colour (used by status dot)', () => {
        /** The pulse dot uses primary colour */
        expect(COPILOT_THEME.primary).toMatch(/^#[0-9A-Fa-f]{6}$/);
    });

    test('glow is an rgba value (used by toggle button shadow)', () => {
        /** The active toggle button uses glow for box-shadow */
        expect(COPILOT_THEME.glow).toMatch(/^rgba\(/);
    });

    test('active indicator dot green colour is #4ade80 (green-400, not pink)', () => {
        /**
         * The CopilotToggleButton's active state renders a green dot (#4ade80)
         * to signal "engine is alive and healthy". This is intentionally distinct
         * from COPILOT_THEME.primary (pink) which is the branding colour.
         * Green = healthy status indicator (same UX convention as simulation dot).
         * If this test is changed, also update CopilotToggleButton.tsx.
         */
        const ACTIVE_INDICATOR_DOT = '#4ade80'; // green-400
        expect(ACTIVE_INDICATOR_DOT).not.toBe(COPILOT_THEME.primary);
        expect(ACTIVE_INDICATOR_DOT).toMatch(/^#[0-9A-Fa-f]{6}$/);
    });
});
