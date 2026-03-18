/**
 * cwfWorkOrderShortCircuit.test.ts — Unit Tests for Work Order Short-Circuit (Fix B)
 *
 * Tests the server-side regex detection and response generation logic added
 * to api/cwf/chat.ts to bypass Gemini for work order commands.
 *
 * The actual short-circuit lives in the Vercel handler and requires Supabase,
 * so we mirror the regex + response logic as pure functions (same pattern as
 * cwfUIActions.test.ts).
 *
 * Coverage:
 *   [T-01] Regex matches "set work order to workid#3" variants
 *   [T-02] Regex matches "workid#1" (bare format)
 *   [T-03] Regex matches "workid 2" (no hash)
 *   [T-04] Regex matches "work order 3" (no workid prefix)
 *   [T-05] Regex matches "load workid#1"
 *   [T-06] Regex matches "switch to work order 2"
 *   [T-07] Regex matches "use workid#3"
 *   [T-08] Regex matches "change work order to 1"
 *   [T-09] Regex rejects invalid work order numbers (4, 5, 0)
 *   [T-10] Regex rejects messages without work order keywords
 *   [T-11] Regex rejects partial "work" without "order" or "workid"
 *   [T-12] WorkID formatting produces correct canonical form
 *   [T-13] English success response is correct
 *   [T-14] Turkish success response is correct
 *   [T-15] English failure response includes error message
 *   [T-16] Turkish failure response includes error message
 *   [T-17] Regex is case-insensitive (mixed case)
 *   [T-18] Regex handles extra whitespace
 *   [T-19] Regex matches Turkish "iş emri" variant (future-proofing guard)
 */

import { describe, it, expect } from 'vitest';

// =============================================================================
// MIRRORS — Isolated copies of short-circuit logic from api/cwf/chat.ts
// =============================================================================

/**
 * Mirror of the work order regex detection from chat.ts (Fix B, line ~2870).
 * Extracts the work order number (1, 2, or 3) from a lowercased user message.
 *
 * @param messageLower - The user's message, already lowercased
 * @returns The work order number string ("1", "2", or "3"), or null if no match
 */
function detectWorkOrderNumber(messageLower: string): string | null {
    const match = messageLower.match(
        /(?:work\s*order|workid)(?:\s+\w+)*\s*#?\s*([123])/
    );
    return match ? match[1] : null;
}

/**
 * Mirror of the WorkID formatting from chat.ts (Fix B, line ~2876).
 * Converts a work order number to the canonical WorkID format.
 *
 * @param workOrderNumber - "1", "2", or "3"
 * @returns "WorkID#1", "WorkID#2", or "WorkID#3"
 */
function formatWorkOrderId(workOrderNumber: string): string {
    return `WorkID#${workOrderNumber}`;
}

/**
 * Mirror of the bilingual response generation from chat.ts (Fix B, lines ~2893-2899).
 * Generates the success/failure response message.
 *
 * @param succeeded - Whether the executeUIAction call succeeded
 * @param workOrderId - The canonical WorkID (e.g. "WorkID#3")
 * @param lang - 'en' or 'tr'
 * @param errorMsg - Error message from executeUIAction (only used on failure)
 * @returns The response string to send to the client
 */
function buildShortCircuitResponse(
    succeeded: boolean,
    workOrderId: string,
    lang: 'en' | 'tr',
    errorMsg?: string,
): string {
    if (succeeded) {
        return lang === 'tr'
            ? `✅ İş Emri **${workOrderId}** olarak ayarlandı.`
            : `✅ Work Order set to **${workOrderId}**.`;
    }
    return lang === 'tr'
        ? `⚠️ İş Emri ${workOrderId} ayarlanamadı: ${errorMsg ?? 'Bilinmeyen hata'}`
        : `⚠️ Could not set Work Order to ${workOrderId}: ${errorMsg ?? 'Unknown error'}`;
}

// =============================================================================
// [T-01 – T-08] Regex matches valid work order commands
// =============================================================================

describe('Work Order Short-Circuit — regex detection (valid commands)', () => {

    it('[T-01] matches "set work order to workid#3"', () => {
        /** The exact phrase from the bug report screenshot */
        expect(detectWorkOrderNumber('set work order to workid#3')).toBe('3');
    });

    it('[T-01b] matches "set work order to workid #3" (space before number)', () => {
        expect(detectWorkOrderNumber('set work order to workid #3')).toBe('3');
    });

    it('[T-01c] matches "set work order to workid # 3" (space after hash)', () => {
        expect(detectWorkOrderNumber('set work order to workid # 3')).toBe('3');
    });

    it('[T-02] matches "workid#1" (bare format, no verb)', () => {
        expect(detectWorkOrderNumber('workid#1')).toBe('1');
    });

    it('[T-03] matches "workid 2" (no hash symbol)', () => {
        expect(detectWorkOrderNumber('workid 2')).toBe('2');
    });

    it('[T-04] matches "work order 3" (no workid prefix)', () => {
        expect(detectWorkOrderNumber('work order 3')).toBe('3');
    });

    it('[T-05] matches "load workid#1"', () => {
        expect(detectWorkOrderNumber('load workid#1')).toBe('1');
    });

    it('[T-06] matches "switch to work order 2"', () => {
        expect(detectWorkOrderNumber('switch to work order 2')).toBe('2');
    });

    it('[T-07] matches "use workid#3"', () => {
        expect(detectWorkOrderNumber('use workid#3')).toBe('3');
    });

    it('[T-08] matches "change work order to 1"', () => {
        expect(detectWorkOrderNumber('change work order to 1')).toBe('1');
    });
});

// =============================================================================
// [T-09 – T-11] Regex rejects invalid or unrelated messages
// =============================================================================

describe('Work Order Short-Circuit — regex rejection (invalid commands)', () => {

    it('[T-09a] rejects work order number 4 (out of range)', () => {
        /** Only WorkID#1, #2, #3 are valid — anything else must be rejected */
        expect(detectWorkOrderNumber('set work order to workid#4')).toBeNull();
    });

    it('[T-09b] rejects work order number 0', () => {
        expect(detectWorkOrderNumber('work order 0')).toBeNull();
    });

    it('[T-09c] rejects work order number 5', () => {
        expect(detectWorkOrderNumber('workid#5')).toBeNull();
    });

    it('[T-10a] rejects "what is the current OEE?" (unrelated data query)', () => {
        expect(detectWorkOrderNumber('what is the current oee?')).toBeNull();
    });

    it('[T-10b] rejects "load scn-002" (scenario command, not work order)', () => {
        expect(detectWorkOrderNumber('load scn-002')).toBeNull();
    });

    it('[T-10c] rejects "open basic panel" (UI toggle, not work order)', () => {
        expect(detectWorkOrderNumber('open basic panel')).toBeNull();
    });

    it('[T-10d] rejects empty string', () => {
        expect(detectWorkOrderNumber('')).toBeNull();
    });

    it('[T-11a] rejects "the work is done" (partial keyword "work" without "order")', () => {
        /** "work" alone should not trigger the short-circuit */
        expect(detectWorkOrderNumber('the work is done')).toBeNull();
    });

    it('[T-11b] rejects "order 3 pizzas" ("order" without "work")', () => {
        expect(detectWorkOrderNumber('order 3 pizzas')).toBeNull();
    });

    it('[T-11c] rejects "what work order is active?" (no number)', () => {
        /** Asking ABOUT the work order (no number) should go to Gemini */
        expect(detectWorkOrderNumber('what work order is active?')).toBeNull();
    });
});

// =============================================================================
// [T-12] WorkID formatting
// =============================================================================

describe('Work Order Short-Circuit — WorkID formatting', () => {

    it('[T-12a] formats "1" to "WorkID#1"', () => {
        expect(formatWorkOrderId('1')).toBe('WorkID#1');
    });

    it('[T-12b] formats "2" to "WorkID#2"', () => {
        expect(formatWorkOrderId('2')).toBe('WorkID#2');
    });

    it('[T-12c] formats "3" to "WorkID#3"', () => {
        expect(formatWorkOrderId('3')).toBe('WorkID#3');
    });
});

// =============================================================================
// [T-13 – T-16] Bilingual response generation
// =============================================================================

describe('Work Order Short-Circuit — response generation', () => {

    it('[T-13] generates correct English success response', () => {
        const response = buildShortCircuitResponse(true, 'WorkID#3', 'en');
        expect(response).toBe('✅ Work Order set to **WorkID#3**.');
    });

    it('[T-14] generates correct Turkish success response', () => {
        const response = buildShortCircuitResponse(true, 'WorkID#2', 'tr');
        expect(response).toBe('✅ İş Emri **WorkID#2** olarak ayarlandı.');
    });

    it('[T-15] generates English failure response with error message', () => {
        const response = buildShortCircuitResponse(false, 'WorkID#1', 'en', 'Timeout');
        expect(response).toBe('⚠️ Could not set Work Order to WorkID#1: Timeout');
    });

    it('[T-16] generates Turkish failure response with error message', () => {
        const response = buildShortCircuitResponse(false, 'WorkID#3', 'tr', 'Zaman aşımı');
        expect(response).toBe('⚠️ İş Emri WorkID#3 ayarlanamadı: Zaman aşımı');
    });

    it('[T-15b] generates English failure response with default error when none provided', () => {
        const response = buildShortCircuitResponse(false, 'WorkID#2', 'en');
        expect(response).toContain('Unknown error');
    });

    it('[T-16b] generates Turkish failure response with default error when none provided', () => {
        const response = buildShortCircuitResponse(false, 'WorkID#1', 'tr');
        expect(response).toContain('Bilinmeyen hata');
    });
});

// =============================================================================
// [T-17 – T-18] Edge cases: case insensitivity, whitespace
// =============================================================================

describe('Work Order Short-Circuit — edge cases', () => {

    it('[T-17a] matches mixed case when lowercased: "Set Work Order to WorkID#3"', () => {
        /** The handler lowercases the message before matching — test the same */
        const msg = 'Set Work Order to WorkID#3'.toLowerCase();
        expect(detectWorkOrderNumber(msg)).toBe('3');
    });

    it('[T-17b] matches "WORKID#2" when lowercased', () => {
        expect(detectWorkOrderNumber('WORKID#2'.toLowerCase())).toBe('2');
    });

    it('[T-18a] matches with extra leading/trailing whitespace', () => {
        expect(detectWorkOrderNumber('  set work order to workid#1  ')).toBe('1');
    });

    it('[T-18b] matches with multiple internal spaces', () => {
        /** "work    order   3" — extra whitespace between words */
        expect(detectWorkOrderNumber('work  order  3')).toBe('3');
    });

    it('[T-18c] matches "work order to workid#3" embedded in longer sentence', () => {
        /** The regex should find the pattern even in a longer message */
        expect(detectWorkOrderNumber('please set work order to workid#3 thanks')).toBe('3');
    });
});

// =============================================================================
// [T-19] Future-proofing: Turkish work order phrases
// =============================================================================

describe('Work Order Short-Circuit — Turkish language support (guard test)', () => {
    /**
     * Currently the regex does NOT match Turkish phrases like "iş emri".
     * These tests document the current behaviour. If Turkish support is added
     * later, update the regex and flip these expectations.
     */

    it('[T-19a] does NOT match "iş emri 3" (Turkish — not yet supported)', () => {
        /** Guard test: verifies current regex scope. Update when TR support added. */
        expect(detectWorkOrderNumber('iş emri 3')).toBeNull();
    });

    it('[T-19b] does NOT match "iş emrini 2 yap" (Turkish — not yet supported)', () => {
        expect(detectWorkOrderNumber('iş emrini 2 yap')).toBeNull();
    });
});
