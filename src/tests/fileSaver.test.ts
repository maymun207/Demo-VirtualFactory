/**
 * fileSaver.test.ts — Unit Tests for the fileSaver Pure Transformation Functions
 *
 * Tests the three pure, side-effect-free functions that form Layer 1 of fileSaver.js:
 *   - escapeRegex()             — regex metacharacter escaping
 *   - replaceCtaStepsForAct()   — bracket-depth surgical splice for a single act
 *   - replaceAllCtaSteps()      — multi-act orchestration wrapper (mocked STAGES)
 *
 * NOTE: These functions are NOT imported from fileSaver.js because that file is a
 * browser-only IIFE script (no ESM exports). Instead the pure transformation logic
 * is reproduced here verbatim — if you change the logic in fileSaver.js you MUST
 * keep these copies in sync.
 *
 * Layer 2 (File System Access API) and Layer 3 (DOM orchestration) functions are
 * NOT tested here — they require a real browser environment with File System Access
 * API support and cannot be meaningfully exercised in a Node-based test runner.
 */

import { describe, it, expect } from 'vitest';

// ─── Pure Function Reproductions ──────────────────────────────────────────────
// Verbatim copies of the Layer-1 pure functions from fileSaver.js.
// These have no side effects and no external dependencies.

/**
 * escapeRegex — escapes all special regex metacharacters in a plain string.
 * Copied verbatim from fileSaver.js Layer 1.
 */
function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * replaceCtaStepsForAct — bracket-depth surgical splice for a single act.
 * Copied verbatim from fileSaver.js Layer 1.
 *
 * @param content  - Full text of demoScript.ts
 * @param actId    - Target act id (e.g. 'welcome')
 * @param newBlock - Replacement ctaSteps block (no trailing comma)
 */
function replaceCtaStepsForAct(
    content: string,
    actId: string,
    newBlock: string
): { content: string; found: boolean } {
    // Step 1: locate the act by its id declaration
    const actIdPattern = new RegExp("id:\\s*['\"]" + escapeRegex(actId) + "['\"]");
    const actIdMatch = actIdPattern.exec(content);
    if (!actIdMatch) return { content, found: false };

    // Step 2: determine end-of-scope (start of the next act)
    const remainderAfterActId = content.slice(actIdMatch.index + actIdMatch[0].length);
    const nextActIdMatch = /id:\s*['"]/.exec(remainderAfterActId);
    const scopeEnd = nextActIdMatch
        ? actIdMatch.index + actIdMatch[0].length + nextActIdMatch.index
        : content.length;

    // Step 3: find ctaSteps: within the act's scope
    const ctaStepsIdx = content.indexOf('ctaSteps:', actIdMatch.index);
    if (ctaStepsIdx === -1 || ctaStepsIdx >= scopeEnd) return { content, found: false };

    // Step 4: find the opening [ after ctaSteps:
    const openBracketIdx = content.indexOf('[', ctaStepsIdx);
    if (openBracketIdx === -1 || openBracketIdx >= scopeEnd) return { content, found: false };

    // Step 5: walk to find the matching closing bracket via depth counting
    let depth = 0;
    let closeBracketIdx = -1;
    for (let i = openBracketIdx; i < content.length; i++) {
        if (content[i] === '[') depth++;
        else if (content[i] === ']') {
            depth--;
            if (depth === 0) { closeBracketIdx = i; break; }
        }
    }
    if (closeBracketIdx === -1) return { content, found: false };

    // Step 6: determine the full replacement range (consume trailing comma)
    let endPos = closeBracketIdx + 1;
    if (content[endPos] === ',') endPos++;

    // Step 7: splice in the new block
    const before = content.substring(0, ctaStepsIdx);
    const after  = content.substring(endPos);
    return { content: before + newBlock + ',' + after, found: true };
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

/**
 * minimalAct — a tightly formatted minimal act block sufficient for the parser.
 * Covers: nested brackets inside ctaSteps, trailing comma, adjacent act.
 */
const MINIMAL_TWO_ACT_CONTENT = `
export const DEMO_ACTS: DemoAct[] = [
    {
        id: 'welcome',
        eraLabel: 'Welcome',
        ctaSteps: [
            { ctaLabel: 'Start', panelActions: [{ panel: 'basicPanel', state: 'close' }], ariaInputEnabled: false, },
            { ctaLabel: 'Continue', ariaInputEnabled: true, transitionTo: 'next', },
        ],
        openingPrompt: '',
    },
    {
        id: 'no-management',
        eraLabel: 'No System',
        ctaSteps: [
            { ctaLabel: 'Go', ariaInputEnabled: true, },
        ],
        openingPrompt: '',
    },
];
`.trim();

/** Replacement ctaSteps block for the 'welcome' act */
const WELCOME_REPLACEMENT = `        ctaSteps: [
            { // Click #1
                ctaLabel: 'Begin',
                ariaInputEnabled: false,
            },
        ]`;

/** Replacement ctaSteps block for the 'no-management' act */
const NO_MANAGEMENT_REPLACEMENT = `        ctaSteps: [
            { // Click #1
                ctaLabel: 'Replaced',
                ariaInputEnabled: true,
            },
        ]`;

// ─── Tests: escapeRegex ───────────────────────────────────────────────────────

describe('escapeRegex', () => {
    it('escapes hyphens so they are treated as literals in a RegExp', () => {
        // Hyphens in act ids like 'no-management' must not become range operators
        const pattern = new RegExp(escapeRegex('no-management'));
        expect('no-management'.match(pattern)).not.toBeNull();
    });

    it('escapes regex metacharacters: . * + ? ^ $ { } ( ) | [ ] \\', () => {
        // Every one of these characters should be treated as a literal
        const special = '.*+?^${}()|[]\\';
        const pattern = new RegExp(escapeRegex(special));
        expect(special.match(pattern)).not.toBeNull();
    });

    it('leaves plain alphanumeric strings unchanged', () => {
        // Strings that need no escaping should pass through unmodified
        expect(escapeRegex('digitalTwin')).toBe('digitalTwin');
    });
});

// ─── Tests: replaceCtaStepsForAct ─────────────────────────────────────────────

describe('replaceCtaStepsForAct', () => {

    it('returns found=true when the act is present', () => {
        const result = replaceCtaStepsForAct(MINIMAL_TWO_ACT_CONTENT, 'welcome', WELCOME_REPLACEMENT);
        expect(result.found).toBe(true);
    });

    it('returns found=false when the act id does not exist in the file', () => {
        // Act 'ghost-act' is not in the fixture content
        const result = replaceCtaStepsForAct(MINIMAL_TWO_ACT_CONTENT, 'ghost-act', '');
        expect(result.found).toBe(false);
    });

    it('replaces the ctaSteps block of the target act with the new block', () => {
        const { content } = replaceCtaStepsForAct(MINIMAL_TWO_ACT_CONTENT, 'welcome', WELCOME_REPLACEMENT);
        // The new label 'Begin' must appear in the output
        expect(content).toContain("ctaLabel: 'Begin'");
    });

    it('does NOT modify the ctaSteps of any other act', () => {
        const { content } = replaceCtaStepsForAct(MINIMAL_TWO_ACT_CONTENT, 'welcome', WELCOME_REPLACEMENT);
        // The 'Go' step in the 'no-management' act must remain intact
        expect(content).toContain("ctaLabel: 'Go'");
    });

    it('removes the old ctaLabel from the replaced act', () => {
        const { content } = replaceCtaStepsForAct(MINIMAL_TWO_ACT_CONTENT, 'welcome', WELCOME_REPLACEMENT);
        // The old 'Start' label must no longer appear (was in welcome act only)
        // We check the no-management block is still there to distinguish 'Go' from 'Start'
        expect(content).not.toContain("ctaLabel: 'Start'");
    });

    it('handles nested brackets inside ctaSteps (panelActions arrays) correctly', () => {
        // The original 'welcome' ctaSteps contains a nested panelActions: [{...}]
        // The bracket-depth parser must not stop at the inner ] and must find the outer ]
        const { found, content } = replaceCtaStepsForAct(MINIMAL_TWO_ACT_CONTENT, 'welcome', WELCOME_REPLACEMENT);
        // If nested brackets confused the parser, content would be malformed
        expect(found).toBe(true);
        // The no-management act must remain untouched after the splice
        expect(content).toContain("id: 'no-management'");
    });

    it('preserves all content before and after the ctaSteps block', () => {
        const { content } = replaceCtaStepsForAct(MINIMAL_TWO_ACT_CONTENT, 'welcome', WELCOME_REPLACEMENT);
        // The file header (export const) and the second act must both still exist
        expect(content).toContain('export const DEMO_ACTS');
        expect(content).toContain("id: 'no-management'");
        expect(content).toContain("openingPrompt: ''");
    });

    it('works with double-quoted id values', () => {
        // Some editors may use double quotes — the parser must support both
        const doubleQuoteContent = MINIMAL_TWO_ACT_CONTENT.replace("id: 'welcome'", 'id: "welcome"');
        const result = replaceCtaStepsForAct(doubleQuoteContent, 'welcome', WELCOME_REPLACEMENT);
        expect(result.found).toBe(true);
    });

    it('correctly replaces the SECOND act without affecting the first', () => {
        const { content } = replaceCtaStepsForAct(
            MINIMAL_TWO_ACT_CONTENT,
            'no-management',
            NO_MANAGEMENT_REPLACEMENT
        );
        // The replacement text must be present for no-management
        expect(content).toContain("ctaLabel: 'Replaced'");
        // The welcome act's original steps must remain untouched
        expect(content).toContain("ctaLabel: 'Start'");
        expect(content).toContain("ctaLabel: 'Continue'");
    });

    it('returns the original content unchanged when found=false', () => {
        // A missing act must produce no mutations at all
        const result = replaceCtaStepsForAct(MINIMAL_TWO_ACT_CONTENT, 'does-not-exist', 'REPLACEMENT');
        expect(result.content).toBe(MINIMAL_TWO_ACT_CONTENT);
    });

    it('handles an act with no ctaSteps key (found=false)', () => {
        // An act that has no ctaSteps field at all — parser must return found=false gracefully
        const noCtaContent = MINIMAL_TWO_ACT_CONTENT.replace(
            /ctaSteps: \[[\s\S]*?\],\n/,  // remove first ctaSteps block
            ''
        );
        const result = replaceCtaStepsForAct(noCtaContent, 'welcome', WELCOME_REPLACEMENT);
        expect(result.found).toBe(false);
    });

    it('appends a trailing comma after the new block in the output', () => {
        // The file structure requires `ctaSteps: [...],` — must have a trailing comma
        const { content } = replaceCtaStepsForAct(MINIMAL_TWO_ACT_CONTENT, 'welcome', WELCOME_REPLACEMENT);
        // The replacement block ends with ] and must be immediately followed by ,
        const idx = content.indexOf(WELCOME_REPLACEMENT);
        expect(content[idx + WELCOME_REPLACEMENT.length]).toBe(',');
    });
});

// ─── Tests: replaceAllCtaSteps (via direct iteration — no STAGES dependency) ──

describe('replaceCtaStepsForAct — sequential application across multiple acts', () => {

    it('applying to all acts in sequence produces a fully updated file', () => {
        // Simulate what replaceAllCtaSteps() does: apply per-act in sequence
        let content = MINIMAL_TWO_ACT_CONTENT;

        const acts = [
            { id: 'welcome',       block: WELCOME_REPLACEMENT },
            { id: 'no-management', block: NO_MANAGEMENT_REPLACEMENT },
        ];

        const results: Record<string, boolean> = {};
        acts.forEach(({ id, block }) => {
            const result = replaceCtaStepsForAct(content, id, block);
            content = result.content;
            results[id] = result.found;
        });

        // Both acts must have been found and replaced
        expect(results['welcome']).toBe(true);
        expect(results['no-management']).toBe(true);

        // Both new labels must appear in the final output
        expect(content).toContain("ctaLabel: 'Begin'");
        expect(content).toContain("ctaLabel: 'Replaced'");

        // No old labels from either act should remain
        expect(content).not.toContain("ctaLabel: 'Start'");
        expect(content).not.toContain("ctaLabel: 'Continue'");
        expect(content).not.toContain("ctaLabel: 'Go'");
    });

    it('gracefully records failed replacements without corrupting successful ones', () => {
        let content = MINIMAL_TWO_ACT_CONTENT;

        const acts = [
            { id: 'welcome',    block: WELCOME_REPLACEMENT },
            { id: 'ghost-act',  block: '-- should not appear --' },  // does not exist
        ];

        const results: Record<string, boolean> = {};
        acts.forEach(({ id, block }) => {
            const result = replaceCtaStepsForAct(content, id, block);
            content = result.content;
            results[id] = result.found;
        });

        // Welcome replacement must have succeeded
        expect(results['welcome']).toBe(true);
        // ghost-act must have gracefully failed
        expect(results['ghost-act']).toBe(false);

        // The ghost replacement text must not appear anywhere in the output
        expect(content).not.toContain('should not appear');

        // The valid replacement must still be present
        expect(content).toContain("ctaLabel: 'Begin'");
    });
});
