/**
 * commandParser.test.ts — Unit Tests for the Inline Command Parser
 *
 * Tests parseCommands() and executeTokens() from src/lib/utils/commandParser.ts.
 *
 * Coverage:
 *   - parseCommands(): plain text, all five command types, mixed sequences,
 *     edge cases (empty input, unknown tags, malformed wait commands)
 *   - executeTokens(): each callback is invoked correctly, <clck> returns
 *     hitClick=true and stops processing, missing callbacks are skipped safely
 *
 * Does NOT test demoStore.ts integration — that would require Zustand mocking.
 * The integration is covered by manual browser walkthrough in walkthrough.md.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseCommands, executeTokens } from '../lib/utils/commandParser';
import type { CommandToken, TokenCallbacks } from '../lib/utils/commandParser';

// =============================================================================
// parseCommands() — tokeniser
// =============================================================================

describe('parseCommands()', () => {

    // ── Edge cases ──────────────────────────────────────────────────────────

    it('returns empty array for null input', () => {
        /** Guard: null should produce no tokens */
        expect(parseCommands(null)).toEqual([]);
    });

    it('returns empty array for undefined input', () => {
        /** Guard: undefined should produce no tokens */
        expect(parseCommands(undefined)).toEqual([]);
    });

    it('returns empty array for empty string', () => {
        /** Guard: empty string should produce no tokens */
        expect(parseCommands('')).toEqual([]);
    });

    // ── Plain text ───────────────────────────────────────────────────────────

    it('returns a single text token for plain text without commands', () => {
        /** Simple string with no commands should be a single text token */
        const result = parseCommands('Hello world');
        expect(result).toEqual<CommandToken[]>([
            { type: 'text', value: 'Hello world' },
        ]);
    });

    it('treats an unknown <> tag as literal text', () => {
        /** Unknown tags like <foo> should be emitted as plain text, not dropped */
        const result = parseCommands('Hello <foo> world');
        /** The '<' gets emitted as literal, 'foo> world' as the next text token */
        const combined = result.filter(t => t.type === 'text').map(t => (t as { type: 'text'; value: string }).value).join('');
        expect(combined).toBe('Hello <foo> world');
    });

    // ── <cls> ────────────────────────────────────────────────────────────────

    it('parses <cls> at end of text correctly', () => {
        /** <cls> at the very end of the string */
        const result = parseCommands('Hello<cls>');
        expect(result).toEqual<CommandToken[]>([
            { type: 'text', value: 'Hello' },
            { type: 'cls' },
        ]);
    });

    it('parses <cls> in the middle of text', () => {
        /** <cls> surrounded by text on both sides */
        const result = parseCommands('Before<cls>After');
        expect(result).toEqual<CommandToken[]>([
            { type: 'text', value: 'Before' },
            { type: 'cls' },
            { type: 'text', value: 'After' },
        ]);
    });

    // ── <clmi> ───────────────────────────────────────────────────────────────

    it('parses <clmi> command', () => {
        /** <clmi> clears the active media instruction */
        const result = parseCommands('<clmi>');
        expect(result).toEqual<CommandToken[]>([{ type: 'clmi' }]);
    });

    // ── <MI> ─────────────────────────────────────────────────────────────────

    it('parses <MI> command', () => {
        /** <MI> triggers the step's mediaInstruction */
        const result = parseCommands('<MI>');
        expect(result).toEqual<CommandToken[]>([{ type: 'mi' }]);
    });

    it('does not confuse <MI> with other tags', () => {
        /** Verify <MI> is only matched exactly */
        const result = parseCommands('<MIS>');
        /** <MIS> is not a known command — should be emitted as text */
        const combined = result.map(t => t.type === 'text' ? t.value : '').join('');
        expect(combined).toBe('<MIS>');
    });

    // ── <clck> ───────────────────────────────────────────────────────────────

    it('parses <clck> command', () => {
        /** <clck> is the soft-click token */
        const result = parseCommands('<clck>');
        expect(result).toEqual<CommandToken[]>([{ type: 'click' }]);
    });

    it('stops accumulating text at <clck>', () => {
        /** Text after <clck> should still be parsed as a token (executor stops early) */
        const result = parseCommands('Hello<clck>World');
        expect(result).toEqual<CommandToken[]>([
            { type: 'text', value: 'Hello' },
            { type: 'click' },
            { type: 'text', value: 'World' },
        ]);
    });

    // ── <w:N> ────────────────────────────────────────────────────────────────

    it('parses <w:1000> into a wait token with ms=1000', () => {
        /** Numeric wait command */
        const result = parseCommands('<w:1000>');
        expect(result).toEqual<CommandToken[]>([{ type: 'wait', ms: 1000 }]);
    });

    it('parses <w:0> into a wait token with ms=0', () => {
        /** Zero-ms wait is valid (no-op but not an error) */
        const result = parseCommands('<w:0>');
        expect(result).toEqual<CommandToken[]>([{ type: 'wait', ms: 0 }]);
    });

    it('treats <w:abc> (non-numeric) as plain text', () => {
        /** Non-numeric wait argument should NOT produce a wait token */
        const result = parseCommands('<w:abc>');
        const combined = result.map(t => t.type === 'text' ? t.value : '').join('');
        expect(combined).toBe('<w:abc>');
    });

    // ── Mixed sequences ──────────────────────────────────────────────────────

    it('parses a complex mixed sequence in correct order', () => {
        /**
         * Full integration of all five command types interleaved with text.
         * Order matters — token array must mirror input order.
         */
        const result = parseCommands('Start<cls><w:500>Middle<MI><clmi>End<clck>Tail');
        expect(result).toEqual<CommandToken[]>([
            { type: 'text',  value: 'Start' },
            { type: 'cls' },
            { type: 'wait',  ms: 500 },
            { type: 'text',  value: 'Middle' },
            { type: 'mi' },
            { type: 'clmi' },
            { type: 'text',  value: 'End' },
            { type: 'click' },
            { type: 'text',  value: 'Tail' },
        ]);
    });

    it('handles consecutive commands with no text between them', () => {
        /** Back-to-back commands should produce consecutive command tokens */
        const result = parseCommands('<cls><clmi><MI>');
        expect(result).toEqual<CommandToken[]>([
            { type: 'cls' },
            { type: 'clmi' },
            { type: 'mi' },
        ]);
    });

    it('handles multiline input with real newlines', () => {
        /**
         * Screen text often contains real newlines after sanitisation.
         * These should pass through as part of text tokens unchanged.
         */
        const result = parseCommands('Line 1\nLine 2<cls>Line 3');
        expect(result).toEqual<CommandToken[]>([
            { type: 'text',  value: 'Line 1\nLine 2' },
            { type: 'cls' },
            { type: 'text',  value: 'Line 3' },
        ]);
    });
});

// =============================================================================
// executeTokens() — callback executor
// =============================================================================

describe('executeTokens()', () => {

    let callbacks: TokenCallbacks;

    beforeEach(() => {
        /** Fresh mock callbacks for each test */
        callbacks = {
            onText:     vi.fn().mockResolvedValue(undefined),
            onClear:    vi.fn().mockResolvedValue(undefined),
            onClearMI:  vi.fn().mockResolvedValue(undefined),
            onWait:     vi.fn().mockResolvedValue(undefined),
            onShowMI:   vi.fn().mockResolvedValue(undefined),
            onSoftClick: vi.fn().mockResolvedValue(undefined),
        };
    });

    it('returns hitClick=false for an empty token array', async () => {
        /** Empty input — no callbacks called, no click */
        const result = await executeTokens([], callbacks);
        expect(result.hitClick).toBe(false);
        expect(callbacks.onText).not.toHaveBeenCalled();
    });

    it('calls onText with the correct value for text tokens', async () => {
        /** A single text token should invoke onText exactly once */
        const tokens: CommandToken[] = [{ type: 'text', value: 'Hello' }];
        await executeTokens(tokens, callbacks);
        expect(callbacks.onText).toHaveBeenCalledOnce();
        expect(callbacks.onText).toHaveBeenCalledWith('Hello');
    });

    it('calls onClear for cls tokens', async () => {
        /** <cls> should invoke onClear */
        const tokens: CommandToken[] = [{ type: 'cls' }];
        await executeTokens(tokens, callbacks);
        expect(callbacks.onClear).toHaveBeenCalledOnce();
    });

    it('calls onClearMI for clmi tokens', async () => {
        /** <clmi> should invoke onClearMI */
        const tokens: CommandToken[] = [{ type: 'clmi' }];
        await executeTokens(tokens, callbacks);
        expect(callbacks.onClearMI).toHaveBeenCalledOnce();
    });

    it('calls onWait with the correct ms value for wait tokens', async () => {
        /** <w:2000> should invoke onWait(2000) */
        const tokens: CommandToken[] = [{ type: 'wait', ms: 2000 }];
        await executeTokens(tokens, callbacks);
        expect(callbacks.onWait).toHaveBeenCalledOnce();
        expect(callbacks.onWait).toHaveBeenCalledWith(2000);
    });

    it('calls onShowMI for mi tokens', async () => {
        /** <MI> should invoke onShowMI */
        const tokens: CommandToken[] = [{ type: 'mi' }];
        await executeTokens(tokens, callbacks);
        expect(callbacks.onShowMI).toHaveBeenCalledOnce();
    });

    it('returns hitClick=true when a click token is encountered', async () => {
        /** <clck> must return hitClick:true */
        const tokens: CommandToken[] = [{ type: 'click' }];
        const result = await executeTokens(tokens, callbacks);
        expect(result.hitClick).toBe(true);
        expect(callbacks.onSoftClick).toHaveBeenCalledOnce();
    });

    it('stops processing tokens AFTER a click token', async () => {
        /**
         * CRITICAL: After <clck>, no further tokens should be processed.
         * This guarantees the executor advances to Phase 3 without completing
         * the remaining text tokens.
         */
        const tokens: CommandToken[] = [
            { type: 'text',  value: 'Before' },
            { type: 'click' },
            { type: 'text',  value: 'After' },  // must NOT be processed
        ];
        const result = await executeTokens(tokens, callbacks);
        expect(result.hitClick).toBe(true);
        expect(callbacks.onText).toHaveBeenCalledOnce();
        expect(callbacks.onText).toHaveBeenCalledWith('Before');
        /** onText should NOT have been called with 'After' */
    });

    it('executes all tokens in order when no click is present', async () => {
        /**
         * Without <clck>, all tokens should be processed in order.
         * Verify call order using callOrder pattern.
         */
        const callOrder: string[] = [];
        const orderedCallbacks: TokenCallbacks = {
            onText:    vi.fn((v: string) => { callOrder.push(`text:${v}`); }),
            onClear:   vi.fn(() => { callOrder.push('clear'); }),
            onClearMI: vi.fn(() => { callOrder.push('clearMI'); }),
            onWait:    vi.fn(() => { callOrder.push('wait'); }),
            onShowMI:  vi.fn(() => { callOrder.push('showMI'); }),
        };

        const tokens: CommandToken[] = [
            { type: 'text',  value: 'A' },
            { type: 'cls' },
            { type: 'wait',  ms: 100 },
            { type: 'text',  value: 'B' },
            { type: 'mi' },
            { type: 'clmi' },
        ];

        const result = await executeTokens(tokens, orderedCallbacks);
        expect(result.hitClick).toBe(false);
        expect(callOrder).toEqual(['text:A', 'clear', 'wait', 'text:B', 'showMI', 'clearMI']);
    });

    it('does not crash when optional callbacks are omitted', async () => {
        /**
         * All callbacks are optional. If the caller does not provide a callback
         * for a token type, the executor should silently skip it — no throw.
         */
        const sparseCallbacks: TokenCallbacks = {
            /** Only provide onText — all others are undefined */
            onText: vi.fn(),
        };

        const tokens: CommandToken[] = [
            { type: 'text',  value: 'Hello' },
            { type: 'cls' },
            { type: 'wait',  ms: 500 },
            { type: 'mi' },
            { type: 'clmi' },
        ];

        /** Should not throw */
        await expect(executeTokens(tokens, sparseCallbacks)).resolves.toEqual({ hitClick: false });
        expect(sparseCallbacks.onText).toHaveBeenCalledWith('Hello');
    });

    it('uses default sleep for wait tokens when onWait is not provided', async () => {
        /**
         * When no onWait callback is provided, the executor falls back to a real
         * setTimeout-based sleep. For test speed, we use w:0 (zero ms).
         */
        const minimalCallbacks: TokenCallbacks = {};
        const tokens: CommandToken[] = [{ type: 'wait', ms: 0 }];
        /** Should resolve without hanging */
        await expect(executeTokens(tokens, minimalCallbacks)).resolves.toEqual({ hitClick: false });
    });
});

// =============================================================================
// parseCommands() + executeTokens() integration
// =============================================================================

describe('parseCommands() + executeTokens() integration', () => {

    it('full round-trip: parse then execute produces correct side effects', async () => {
        /**
         * Simulates how demoStore.ts uses the two functions together.
         * Input: 'Clear<cls>Wait<w:0>Show<MI>Click<clck>Tail'
         * Expected: text → clear → wait → text → show → click (then stop)
         */
        const input = 'Clear<cls>Wait<w:0>Show<MI><clck>Tail';
        const tokens = parseCommands(input);

        const log: string[] = [];
        const result = await executeTokens(tokens, {
            onText:     (v) => { log.push(`text:${v}`); },
            onClear:    ()  => { log.push('clear'); },
            onWait:     ()  => { log.push('wait'); },
            onShowMI:   ()  => { log.push('showMI'); },
            onSoftClick: () => { log.push('click'); },
        });

        expect(result.hitClick).toBe(true);
        /** 'Tail' after <clck> must NOT appear */
        expect(log).toEqual(['text:Clear', 'clear', 'text:Wait', 'wait', 'text:Show', 'showMI', 'click']);
    });
});
