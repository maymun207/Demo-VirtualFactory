/**
 * commandParser.ts — Inline Command Token Parser for the Demo Engine
 *
 * Parses a plain-text string that may contain inline control commands into an
 * ordered list of typed tokens. Used by the demo step execution engine
 * (demoStore.ts) to process screenText and ARIA Local fields.
 *
 * SUPPORTED COMMANDS (all case-sensitive):
 *   <cls>    — clear demo screen (removes the current slide image)
 *   <clmi>   — clear media instruction (removes the active chart/graph)
 *   <w:N>    — wait N milliseconds (N must be a positive integer)
 *   <MI>     — activate the step's mediaInstruction (show chart/graph)
 *   <clck>   — soft auto-click:
 *              · in screenText  → proceeds to the ARIA phase without a user click
 *              · in ARIA Local  → skips remaining local text and calls ARIA API
 *
 * EXAMPLE — parsing 'Hello<cls><w:500>World<clck>Done':
 *   [
 *     { type: 'text',  value: 'Hello' },
 *     { type: 'cls' },
 *     { type: 'wait',  ms: 500 },
 *     { type: 'text',  value: 'World' },
 *     { type: 'click' },
 *     { type: 'text',  value: 'Done' },
 *   ]
 *
 * Used by:
 *   demoStore.ts → executeScreenText(), executeAriaLocal()
 *
 * Tested by:
 *   src/tests/commandParser.test.ts
 */

import {
    DEMO_CMD_CLEAR_SCREEN,
    DEMO_CMD_CLEAR_MI,
    DEMO_CMD_WAIT_PREFIX,
    DEMO_CMD_MEDIA_INSTRUCTION,
    DEMO_CMD_SOFT_CLICK,
} from '../params/demoSystem/demoConfig';

// ─── Token Types ──────────────────────────────────────────────────────────────

/**
 * CommandToken — a single unit of executable content.
 * Produced by parseCommands() and consumed by executeTokens().
 */
export type CommandToken =
    /** Plain text segment — displayed on screen */
    | { type: 'text';  value: string }
    /** <cls> — clear the current slide image from the demo screen */
    | { type: 'cls' }
    /** <clmi> — clear the active media instruction (chart/graph) */
    | { type: 'clmi' }
    /** <w:N> — pause execution for N milliseconds */
    | { type: 'wait'; ms: number }
    /** <MI> — activate the step's mediaInstruction */
    | { type: 'mi' }
    /** <clck> — soft click (advance to next phase without user input) */
    | { type: 'click' };

// ─── Parser ───────────────────────────────────────────────────────────────────

/**
 * KNOWN_LITERAL_COMMANDS — simple constant commands that map directly to a token.
 * Ordered from longest to shortest to prevent prefix sub-matching (e.g. <cls>
 * must not match before <clck> if they share a prefix — they don't here, but
 * this ordering is a defensive best practice).
 */
const KNOWN_LITERAL_COMMANDS: Array<{ raw: string; token: CommandToken }> = [
    { raw: DEMO_CMD_SOFT_CLICK,         token: { type: 'click' } },
    { raw: DEMO_CMD_CLEAR_MI,           token: { type: 'clmi' } },
    { raw: DEMO_CMD_MEDIA_INSTRUCTION,  token: { type: 'mi' } },
    { raw: DEMO_CMD_CLEAR_SCREEN,       token: { type: 'cls' } },
];

/**
 * parseCommands — splits a text string into an ordered array of CommandTokens.
 *
 * The parser scans left-to-right, consuming characters until a known command
 * is detected. Text between commands is grouped into a single 'text' token.
 * Unknown <> sequences that don't match any command are treated as literal text.
 *
 * @param input - Raw string from screenText or ARIA Local (may be empty or null)
 * @returns Ordered array of CommandTokens. Empty array if input is falsy.
 */
export function parseCommands(input: string | undefined | null): CommandToken[] {
    /** Guard: falsy input returns empty array — caller can skip processing */
    if (!input) return [];

    const tokens: CommandToken[] = [];
    let remaining = input;

    /** Walk through the string until nothing is left */
    while (remaining.length > 0) {

        // ── Check literal commands (clck, clmi, MI, cls) ──────────────────
        let matchedLiteral = false;
        for (const cmd of KNOWN_LITERAL_COMMANDS) {
            if (remaining.startsWith(cmd.raw)) {
                /** Flush any accumulated text before this command */
                tokens.push(cmd.token);
                remaining = remaining.slice(cmd.raw.length);
                matchedLiteral = true;
                break;
            }
        }
        if (matchedLiteral) continue;

        // ── Check wait command: <w:N> where N is an integer ───────────────
        if (remaining.startsWith(DEMO_CMD_WAIT_PREFIX)) {
            /** Find closing > to extract the full tag */
            const closeIdx = remaining.indexOf('>');
            if (closeIdx !== -1) {
                /** Extract the numeric part between '<w:' and '>' */
                const rawMs = remaining.slice(DEMO_CMD_WAIT_PREFIX.length, closeIdx);
                const ms = parseInt(rawMs, 10);
                if (!isNaN(ms) && ms >= 0) {
                    /** Valid wait command */
                    tokens.push({ type: 'wait', ms });
                    remaining = remaining.slice(closeIdx + 1);
                    continue;
                }
                /** If ms is not a valid number, fall through to treat as text */
            }
        }

        // ── Plain text: consume until the next '<' or end of string ───────
        const nextTag = remaining.indexOf('<');
        if (nextTag === -1) {
            /** No more commands — rest is plain text */
            tokens.push({ type: 'text', value: remaining });
            break;
        } else if (nextTag > 0) {
            /** Text segment before the next possible command */
            tokens.push({ type: 'text', value: remaining.slice(0, nextTag) });
            remaining = remaining.slice(nextTag);
        } else {
            /** '<' at position 0 but no known command matched — treat '<' as literal */
            tokens.push({ type: 'text', value: '<' });
            remaining = remaining.slice(1);
        }
    }

    return tokens;
}

// ─── Executor ─────────────────────────────────────────────────────────────────

/**
 * TokenCallbacks — callbacks invoked by executeTokens() for each token type.
 * All callbacks are optional; unhandled token types are silently skipped.
 *
 * Async callbacks (appendText, clearScreen, clearMI, showMI) must resolve
 * before the executor moves to the next token — this preserves sequential order.
 */
export interface TokenCallbacks {
    /**
     * Called for each 'text' token with the text segment to display.
     * The caller is responsible for appending to existing screen text.
     */
    onText?:    (value: string)        => void | Promise<void>;
    /** Called for <cls> — should clear the current slide from screen */
    onClear?:   ()                     => void | Promise<void>;
    /** Called for <clmi> — should clear the active media instruction */
    onClearMI?: ()                     => void | Promise<void>;
    /**
     * Called for <w:N> — should resolve after N milliseconds.
     * Executor awaits this before continuing.
     */
    onWait?:    (ms: number)           => void | Promise<void>;
    /** Called for <MI> — should activate the step's mediaInstruction */
    onShowMI?:  ()                     => void | Promise<void>;
    /**
     * Called for <clck> — signals the soft click event.
     * The executor STOPS after calling this callback and returns true
     * to indicate to the caller that a click was processed.
     */
    onSoftClick?: ()                   => void | Promise<void>;
}

/**
 * executeTokens — walks a token array and invokes the matching callback
 * for each token in sequence, awaiting async callbacks before proceeding.
 *
 * Stops execution and returns { hitClick: true } as soon as a 'click' token
 * is encountered, leaving any remaining tokens unprocessed. The caller can
 * use this signal to immediately trigger the next phase without processing
 * the rest of the text.
 *
 * @param tokens    - Token array produced by parseCommands()
 * @param callbacks - Handler functions for each token type
 * @returns { hitClick: boolean } — true if a <clck> token was processed
 */
export async function executeTokens(
    tokens: CommandToken[],
    callbacks: TokenCallbacks,
): Promise<{ hitClick: boolean }> {

    for (const token of tokens) {
        switch (token.type) {
            case 'text':
                /** Append text segment to the screen — awaited for sequential rendering */
                if (callbacks.onText) await callbacks.onText(token.value);
                break;

            case 'cls':
                /** Clear the demo screen slide */
                if (callbacks.onClear) await callbacks.onClear();
                break;

            case 'clmi':
                /** Clear the active media instruction chart/graph */
                if (callbacks.onClearMI) await callbacks.onClearMI();
                break;

            case 'wait':
                /** Wait N milliseconds — use callback so tests can mock timing */
                if (callbacks.onWait) {
                    await callbacks.onWait(token.ms);
                } else {
                    /** Default implementation: use a real setTimeout-based sleep */
                    await new Promise<void>(resolve => setTimeout(resolve, token.ms));
                }
                break;

            case 'mi':
                /** Activate the step's mediaInstruction */
                if (callbacks.onShowMI) await callbacks.onShowMI();
                break;

            case 'click':
                /** Soft click — notify caller and STOP processing further tokens */
                if (callbacks.onSoftClick) await callbacks.onSoftClick();
                return { hitClick: true };
        }
    }

    /** Reached end of token list without encountering a <clck> */
    return { hitClick: false };
}
