/**
 * cwfForceSummaryFix.test.ts — Unit Tests for CWF Force-Summary Pollution Fix
 *
 * Tests the three-part fix for the conversation history pollution bug where
 * the forced-summary injection text ("Do NOT call any tools") leaked into
 * the persistent conversation history, causing Gemini to refuse tool calls
 * on subsequent turns.
 *
 * Covers:
 *   Part 1 — sentinel tagging: forcePrompt and retryPrompt are prefixed
 *             with CWF_FORCE_SUMMARY_SENTINEL before injection.
 *   Part 2 — history sanitization: sanitizeConversationHistory() removes:
 *             (a) user turns starting with CWF_FORCE_SUMMARY_SENTINEL
 *             (b) the assistant turn immediately following a sentinel user turn
 *             (c) assistant turns containing CWF_FORCE_SUMMARY_FINGERPRINT
 *             (d) assistant turns containing CWF_RETRY_PROMPT_FINGERPRINT
 *   Part 3 — auth-turn fast-path: isAuthTurn detection and
 *             authFastPathInstruction content from Params.
 *
 * Per global rules: unit tests must be written alongside every feature.
 */
/// <reference types="vitest/globals" />

import { describe, it, expect } from 'vitest';
import {
    CWF_FORCE_SUMMARY_SENTINEL,
    CWF_FORCE_SUMMARY_FINGERPRINT,
    CWF_RETRY_PROMPT_FINGERPRINT,
    CWF_FORCE_SUMMARY_PROMPT_EN,
    CWF_FORCE_SUMMARY_PROMPT_TR,
    CWF_AUTH_FAST_PATH_PROMPT_EN,
    CWF_AUTH_FAST_PATH_PROMPT_TR,
} from '../lib/params/cwfAgent';

// =============================================================================
// Re-implement sanitizeConversationHistory() here so it can be unit tested
// without importing the full api/cwf/chat.ts Vercel function.
// The logic is IDENTICAL to what is implemented in chat.ts.
// =============================================================================

/**
 * Mirror of the sanitizeConversationHistory() function defined in api/cwf/chat.ts.
 * Placed here for testability — any change to the implementation in chat.ts
 * MUST be reflected here, and all tests must still pass.
 */
function sanitizeConversationHistory(
    history: Array<{ role: string; content: string }>
): Array<{ role: string; content: string }> {
    /** Collect indices of turns to remove from history */
    const indicesToRemove = new Set<number>();

    history.forEach((msg, idx) => {
        /** Remove user turns that are force-summary / retry injections (sentinel prefix) */
        if (
            msg.role === 'user' &&
            msg.content.startsWith(CWF_FORCE_SUMMARY_SENTINEL)
        ) {
            /** Mark the injected user turn for removal */
            indicesToRemove.add(idx);
            /**
             * Also remove the following assistant turn — that turn quotes the
             * instruction back (e.g. "as per your instruction to 'Do NOT call tools'")
             * making it another contamination vector.
             */
            if (idx + 1 < history.length && history[idx + 1].role !== 'user') {
                indicesToRemove.add(idx + 1);
            }
        }

        /**
         * Remove assistant turns whose text contains the force-summary or retry
         * fingerprint. These are contaminated responses that quote back the
         * forbidden instructions, which would pollute subsequent Gemini calls.
         */
        if (
            msg.role === 'assistant' && (
                msg.content.includes(CWF_FORCE_SUMMARY_FINGERPRINT) ||
                msg.content.includes(CWF_RETRY_PROMPT_FINGERPRINT)
            )
        ) {
            indicesToRemove.add(idx);
        }
    });

    /** Return history with all contaminated turns removed */
    return history.filter((_, idx) => !indicesToRemove.has(idx));
}

// =============================================================================
// Part 1 Tests: Sentinel Tagging
// =============================================================================

describe('CWF force-summary fix — Part 1: sentinel tagging constants', () => {
    it('CWF_FORCE_SUMMARY_SENTINEL should be a non-empty distinctive string', () => {
        /**
         * The sentinel must be distinctive enough to never appear in real user
         * messages. Double-bracket format [[...]] achieves this.
         */
        expect(CWF_FORCE_SUMMARY_SENTINEL).toBeTruthy();
        expect(CWF_FORCE_SUMMARY_SENTINEL).toContain('[[');
        expect(CWF_FORCE_SUMMARY_SENTINEL).toContain(']]');
    });

    it('CWF_FORCE_SUMMARY_SENTINEL should not appear naturally in the existing force-summary prompts', () => {
        /**
         * The prompt text itself must NOT contain the sentinel — otherwise
         * sentinel detection would fire on the wrong content.
         */
        expect(CWF_FORCE_SUMMARY_PROMPT_EN).not.toContain(CWF_FORCE_SUMMARY_SENTINEL);
        expect(CWF_FORCE_SUMMARY_PROMPT_TR).not.toContain(CWF_FORCE_SUMMARY_SENTINEL);
    });

    it('tagged injection string should start with sentinel', () => {
        /**
         * Simulates exactly how chat.ts prefixes the prompt before injection:
         * `${CWF_FORCE_SUMMARY_SENTINEL} ${forcePromptText}`
         * The sanitizer uses startsWith() to detect this prefix.
         */
        const tagged = `${CWF_FORCE_SUMMARY_SENTINEL} ${CWF_FORCE_SUMMARY_PROMPT_EN}`;
        expect(tagged.startsWith(CWF_FORCE_SUMMARY_SENTINEL)).toBe(true);
    });

    it('CWF_FORCE_SUMMARY_FINGERPRINT should be a substring of the English force prompt', () => {
        /**
         * The fingerprint is extracted from the force-summary prompt text itself.
         * This validates that the fingerprint will match when Gemini quotes the prompt back.
         */
        expect(CWF_FORCE_SUMMARY_PROMPT_EN).toContain(CWF_FORCE_SUMMARY_FINGERPRINT);
    });

    it('CWF_RETRY_PROMPT_FINGERPRINT should be a unique non-empty string', () => {
        /**
         * The retry prompt fingerprint must be distinct from force-summary fingerprint
         * so both contamination paths are detected independently.
         */
        expect(CWF_RETRY_PROMPT_FINGERPRINT).toBeTruthy();
        expect(CWF_RETRY_PROMPT_FINGERPRINT).not.toBe(CWF_FORCE_SUMMARY_FINGERPRINT);
    });
});

// =============================================================================
// Part 2 Tests: sanitizeConversationHistory()
// =============================================================================

describe('CWF force-summary fix — Part 2: sanitizeConversationHistory()', () => {
    it('should return empty array unchanged', () => {
        /** No history — no contamination to remove */
        expect(sanitizeConversationHistory([])).toEqual([]);
    });

    it('should pass through clean history with no contamination', () => {
        /** A normal clean conversation should go through unchanged */
        const cleanHistory = [
            { role: 'user', content: 'jamm the conveyor' },
            { role: 'assistant', content: 'Here is the proposed change...' },
            { role: 'user', content: 'yes' },
            { role: 'assistant', content: 'Please enter your authorization ID.' },
        ];
        expect(sanitizeConversationHistory(cleanHistory)).toEqual(cleanHistory);
    });

    it('should remove user turns that start with the sentinel prefix', () => {
        /**
         * The sentinel-tagged force-summary injection must be stripped.
         * In production this would be a turn injected by chat.ts, not a real user message.
         */
        const history = [
            { role: 'user', content: 'tell me the OEE' },
            { role: 'assistant', content: 'Factory OEE is 87%.' },
            { role: 'user', content: `${CWF_FORCE_SUMMARY_SENTINEL} Do NOT call any tools.` },
            { role: 'assistant', content: 'The data shows 87% Factory OEE.' },
        ];
        const result = sanitizeConversationHistory(history);
        /** Only the first two clean turns should remain */
        expect(result).toHaveLength(2);
        expect(result[0].role).toBe('user');
        expect(result[0].content).toBe('tell me the OEE');
        expect(result[1].role).toBe('assistant');
        expect(result[1].content).toBe('Factory OEE is 87%.');
    });

    it('should also remove the assistant turn immediately following a sentinel injection', () => {
        /**
         * The assistant response to the force-summary often quotes the forbidden
         * instruction back. Removing it prevents that text from appearing in
         * any future Gemini context.
         */
        const history = [
            { role: 'user', content: `${CWF_FORCE_SUMMARY_SENTINEL} Do NOT call tools.` },
            { role: 'assistant', content: 'as per your instruction I will not call tools.' },
        ];
        const result = sanitizeConversationHistory(history);
        /** Both the injected user turn and its assistant response must be removed */
        expect(result).toHaveLength(0);
    });

    it('should remove assistant turns containing the force-summary fingerprint', () => {
        /**
         * This is the self-reinforcing pollution loop: even without the sentinel
         * in a user turn, an assistant message that QUOTES "Do NOT" is contaminated.
         * The fingerprint scanner catches these.
         */
        const history = [
            { role: 'user', content: 'ardic' },
            {
                role: 'assistant',
                content: `as per your instruction to '${CWF_FORCE_SUMMARY_FINGERPRINT} call any tools', the change was not applied.`,
            },
        ];
        const result = sanitizeConversationHistory(history);
        /** The contaminated assistant turn should be removed; the user turn stays */
        expect(result).toHaveLength(1);
        expect(result[0].role).toBe('user');
        expect(result[0].content).toBe('ardic');
    });

    it('should remove assistant turns containing the retry prompt fingerprint', () => {
        /**
         * The retry path ("Answer NOW using all the data...") creates a separate
         * contamination vector. Verify the retry fingerprint scanner works.
         */
        const history = [
            { role: 'user', content: 'what is the scrap rate' },
            {
                role: 'assistant',
                content: `${CWF_RETRY_PROMPT_FINGERPRINT} you already collected. The scrap rate is 2%.`,
            },
        ];
        const result = sanitizeConversationHistory(history);
        /** Contaminated assistant turn removed, user turn stays */
        expect(result).toHaveLength(1);
        expect(result[0].role).toBe('user');
    });

    it('should handle multiple contaminated turns in one history', () => {
        /**
         * Realistic scenario: two separate force-summary events occurred in
         * prior turns. Both sets of contaminated pairs must be removed.
         */
        const history = [
            { role: 'user', content: 'what is OEE' },
            { role: 'assistant', content: 'OEE is 87%.' },
            { role: 'user', content: `${CWF_FORCE_SUMMARY_SENTINEL} summarise now` },
            { role: 'assistant', content: 'I was told Do NOT call tools so I summarised.' },
            { role: 'user', content: 'what about press OEE' },
            { role: 'assistant', content: 'Press OEE is 94%.' },
            { role: 'user', content: `${CWF_FORCE_SUMMARY_SENTINEL} answer now` },
            { role: 'assistant', content: 'Press OEE: 94%.' },
        ];
        const result = sanitizeConversationHistory(history);
        /** Only the two clean pairs remain */
        expect(result).toHaveLength(4);
        expect(result[0].content).toBe('what is OEE');
        expect(result[2].content).toBe('what about press OEE');
    });

    it('should not remove a normal user message that happens to contain the fingerprint text incidentally', () => {
        /**
         * Only ASSISTANT turns are checked for fingerprint contamination.
         * A user who happens to write "Do NOT" in their message must not be filtered.
         */
        const history = [
            { role: 'user', content: 'Do NOT stop the simulation, keep it running.' },
            { role: 'assistant', content: 'Understood. The simulation will continue.' },
        ];
        const result = sanitizeConversationHistory(history);
        /** Both turns should remain — fingerprint check only applies to assistant role */
        expect(result).toHaveLength(2);
    });

    it('should preserve conversation order after sanitization', () => {
        /**
         * The filter must maintain the original order of remaining turns.
         * Verifies that filter() preserves sequential ordering.
         */
        const history = [
            { role: 'user', content: 'message A' },
            { role: 'assistant', content: 'response A' },
            { role: 'user', content: `${CWF_FORCE_SUMMARY_SENTINEL} skip this` },
            { role: 'assistant', content: 'skipped response' },
            { role: 'user', content: 'message B' },
            { role: 'assistant', content: 'response B' },
        ];
        const result = sanitizeConversationHistory(history);
        expect(result[0].content).toBe('message A');
        expect(result[1].content).toBe('response A');
        expect(result[2].content).toBe('message B');
        expect(result[3].content).toBe('response B');
    });
});

// =============================================================================
// Part 3 Tests: Auth-Turn Fast-Path
// =============================================================================

describe('CWF force-summary fix — Part 3: auth-turn fast-path prompts', () => {
    it('CWF_AUTH_FAST_PATH_PROMPT_EN should be a non-empty string', () => {
        /** Fast-path prompt must have content to be useful */
        expect(CWF_AUTH_FAST_PATH_PROMPT_EN.trim()).toBeTruthy();
    });

    it('CWF_AUTH_FAST_PATH_PROMPT_TR should be a non-empty string', () => {
        expect(CWF_AUTH_FAST_PATH_PROMPT_TR.trim()).toBeTruthy();
    });

    it('English fast-path prompt should instruct execution without re-querying', () => {
        /**
         * The prompt must convey: execute now, do not re-query, one tool call.
         * This prevents Gemini burning 3-5 loops before calling update_parameter.
         */
        expect(CWF_AUTH_FAST_PATH_PROMPT_EN).toContain('Execute');
        expect(CWF_AUTH_FAST_PATH_PROMPT_EN).toContain('Do NOT query');
    });

    it('both prompts should be distinct (not identical)', () => {
        /**
         * EN and TR prompts serve the same semantic purpose but in different
         * languages. If they are identical, the TR prompt is broken.
         */
        expect(CWF_AUTH_FAST_PATH_PROMPT_EN).not.toBe(CWF_AUTH_FAST_PATH_PROMPT_TR);
    });

    it('auth-turn detection logic should match exact auth code case-insensitively', () => {
        /**
         * Simulates the isAuthTurn detection logic from chat.ts:
         *   const isAuthTurn = message.trim().toLowerCase() === CWF_AUTH_CODE.toLowerCase();
         *
         * Tests: correct code, wrong code, extra spaces, uppercase variation.
         */
        const CWF_AUTH_CODE = 'ardic'; // Mirror of chat.ts constant

        /** Simulate the detection function */
        function isAuthTurn(message: string): boolean {
            return message.trim().toLowerCase() === CWF_AUTH_CODE.toLowerCase();
        }

        /** Exact match */
        expect(isAuthTurn('ardic')).toBe(true);
        /** Case insensitive */
        expect(isAuthTurn('ARDIC')).toBe(true);
        /** Leading/trailing whitespace trimmed */
        expect(isAuthTurn('  ardic  ')).toBe(true);
        /** Wrong code must not match */
        expect(isAuthTurn('wrongcode')).toBe(false);
        /** Partial match must not match */
        expect(isAuthTurn('airt')).toBe(false);
        /** Empty string must not match */
        expect(isAuthTurn('')).toBe(false);
    });

    it('sentinel tag should not appear in auth fast-path prompts', () => {
        /**
         * The auth fast-path prompt is a normal system instruction, not a
         * force-summary injection. It must not contain the sentinel to avoid
         * triggering the sanitizer inadvertently.
         */
        expect(CWF_AUTH_FAST_PATH_PROMPT_EN).not.toContain(CWF_FORCE_SUMMARY_SENTINEL);
        expect(CWF_AUTH_FAST_PATH_PROMPT_TR).not.toContain(CWF_FORCE_SUMMARY_SENTINEL);
    });
});
