/**
 * demoScriptEditor.test.ts — Automated tests for the DemoScript Editor
 *
 * Tests the pure functions that power the editor's import/export/save pipeline.
 * Since the editor files are browser globals (not ES modules), we re-implement
 * the core logic here as testable functions and verify correctness.
 *
 * Coverage:
 *   1. parseCtaStepsArray   — parsing ctaSteps source from demoScript.ts
 *   2. Newline preservation — template-literal newlines survive round-trip
 *   3. buildStepFields      — correct field emission / omission
 *   4. Step add/remove       — array length and index correctness
 *   5. replaceCtaStepsForAct — bracket-depth splice accuracy
 *   6. Full round-trip       — export → re-import preserves data
 */

import { describe, it, expect, beforeEach } from 'vitest';

// ─── Re-implemented pure functions (mirrors editor JS) ────────────────────────

/** Panels used by the editor */
const PANELS = [
    { id: 'basicPanel',   label: 'Basic Panel' },
    { id: 'dtxfr',        label: 'DTXFR Passport' },
    { id: 'cwf',          label: 'CWF Chat' },
    { id: 'oeeHierarchy', label: 'OEE Hierarchy' },
    { id: 'controlPanel', label: 'Control Panel' },
];

/** Create a blank editor step (mirrors schema.js createEmptyStep) */
function createEmptyStep() {
    const panelActions: Record<string, string> = {};
    PANELS.forEach(p => { panelActions[p.id] = ''; });
    return {
        ctaLabel:         '',
        slideImageUrl:    '',
        mediaInstruction: '',
        scenarioCode:     '',
        workOrderId:      '',
        delayMs:          '',
        screenText:       '',
        screenTextAlign:  'center',
        screenTextWeight: 'bold',
        screenTextSize:   'lg',
        ariaLocal:        '',
        ariaLocalAlign:   'left',
        ariaLocalWeight:  'normal',
        ariaLocalSize:    'md',
        ariaApi:          '',
        ariaApiAlign:     'left',
        ariaApiWeight:    'normal',
        ariaApiSize:      'md',
        ariaInputEnabled: true,
        panelActions,
        simulationAction: '',
        transitionTo:     '',
    };
}

/**
 * parseCtaStepsArray — mirrors importer.js (FIXED version with newline preservation).
 * Takes the raw source string inside ctaSteps: [ ] and returns parsed objects.
 */
function parseCtaStepsArray(innerSource: string): Array<Record<string, unknown>> | null {
    // Strip inline comments
    let cleaned = innerSource.replace(/\/\/[^\n]*/g, '');

    // Convert template literals to regular strings — PRESERVE NEWLINES
    cleaned = cleaned.replace(/`([^`]*)`/g, function (_match: string, inner: string) {
        const escaped = inner.replace(/'/g, "\\'");
        // Preserve newlines as \n escape sequences
        const normalized = escaped.replace(/\n\s*/g, '\\n');
        return "'" + normalized.trim() + "'";
    });

    try {
        const fn = new Function('return [' + cleaned + ']');
        return fn();
    } catch (err) {
        return null;
    }
}

/**
 * mapToEditorStep — mirrors importer.js mapToEditorStep.
 * Converts a parsed TS step object into editor internal format.
 */
function mapToEditorStep(parsed: Record<string, unknown>) {
    const step = createEmptyStep();

    const simpleFields = [
        'ctaLabel', 'slideImageUrl', 'mediaInstruction', 'scenarioCode',
        'workOrderId', 'screenText', 'screenTextAlign', 'screenTextWeight',
        'screenTextSize', 'ariaLocal', 'ariaLocalAlign', 'ariaLocalWeight',
        'ariaLocalSize', 'ariaApi', 'ariaApiAlign', 'ariaApiWeight',
        'ariaApiSize', 'simulationAction', 'transitionTo',
    ];
    simpleFields.forEach(field => {
        if (parsed[field] !== undefined && parsed[field] !== null) {
            (step as Record<string, unknown>)[field] = String(parsed[field]);
        }
    });

    if (parsed.delayMs !== undefined && parsed.delayMs !== null) {
        step.delayMs = String(parsed.delayMs);
    }

    if (parsed.ariaInputEnabled !== undefined) {
        step.ariaInputEnabled = !!parsed.ariaInputEnabled;
    }

    if (Array.isArray(parsed.panelActions)) {
        (parsed.panelActions as Array<{ panel: string; state: string }>).forEach(pa => {
            if (pa.panel && pa.state && step.panelActions.hasOwnProperty(pa.panel)) {
                step.panelActions[pa.panel] = pa.state;
            }
        });
    }

    return step;
}

/** q — single-quote wrapper (mirrors exporter.js) */
function q(str: string): string {
    return "'" + String(str).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
}

/** bt — backtick wrapper for multi-line fields (mirrors exporter.js) */
function bt(str: string): string {
    const escaped = String(str)
        .replace(/`/g, '\\`')
        .replace(/\$\{/g, '\\${');
    return '`' + escaped + '`';
}

/** buildStepFields — mirrors exporter.js */
function buildStepFields(step: ReturnType<typeof createEmptyStep>): string[] {
    const lines: string[] = [];

    if (step.ctaLabel && step.ctaLabel.trim())
        lines.push('ctaLabel: ' + q(step.ctaLabel) + ',');

    if (step.slideImageUrl && !step.mediaInstruction)
        lines.push('slideImageUrl: ' + q(step.slideImageUrl) + ',');

    if (step.mediaInstruction)
        lines.push('mediaInstruction: ' + q(step.mediaInstruction) + ',');

    if (step.scenarioCode)
        lines.push('scenarioCode: ' + q(step.scenarioCode) + ',');

    if (step.workOrderId)
        lines.push('workOrderId: ' + q(step.workOrderId) + ',');

    if (step.delayMs !== '' && step.delayMs !== null && step.delayMs !== undefined)
        lines.push('delayMs: ' + Number(step.delayMs) + ',');

    if (step.screenText && step.screenText.trim())
        lines.push('screenText: ' + bt(step.screenText.trim()) + ',');

    // Formatting fields — only emit when non-default
    if (step.screenTextAlign && step.screenTextAlign !== 'center')
        lines.push("screenTextAlign: '" + step.screenTextAlign + "',");
    if (step.screenTextWeight && step.screenTextWeight !== 'bold')
        lines.push("screenTextWeight: '" + step.screenTextWeight + "',");
    if (step.screenTextSize && step.screenTextSize !== 'lg')
        lines.push("screenTextSize: '" + step.screenTextSize + "',");

    if (step.ariaLocal && step.ariaLocal.trim())
        lines.push('ariaLocal: ' + bt(step.ariaLocal.trim()) + ',');

    if (step.ariaLocalAlign && step.ariaLocalAlign !== 'left')
        lines.push("ariaLocalAlign: '" + step.ariaLocalAlign + "',");
    if (step.ariaLocalWeight && step.ariaLocalWeight !== 'normal')
        lines.push("ariaLocalWeight: '" + step.ariaLocalWeight + "',");
    if (step.ariaLocalSize && step.ariaLocalSize !== 'md')
        lines.push("ariaLocalSize: '" + step.ariaLocalSize + "',");

    if (step.ariaApi && step.ariaApi.trim())
        lines.push('ariaApi: ' + bt(step.ariaApi.trim()) + ',');

    if (step.ariaApiAlign && step.ariaApiAlign !== 'left')
        lines.push("ariaApiAlign: '" + step.ariaApiAlign + "',");
    if (step.ariaApiWeight && step.ariaApiWeight !== 'normal')
        lines.push("ariaApiWeight: '" + step.ariaApiWeight + "',");
    if (step.ariaApiSize && step.ariaApiSize !== 'md')
        lines.push("ariaApiSize: '" + step.ariaApiSize + "',");

    lines.push('ariaInputEnabled: ' + (step.ariaInputEnabled ? 'true' : 'false') + ',');

    const panels = PANELS.filter(p =>
        step.panelActions[p.id] === 'open' || step.panelActions[p.id] === 'close'
    );
    if (panels.length > 0) {
        lines.push('panelActions: [');
        panels.forEach(p => {
            lines.push("    { panel: '" + p.id + "', state: '" + step.panelActions[p.id] + "' },");
        });
        lines.push('],');
    }

    if (step.simulationAction)
        lines.push("simulationAction: '" + step.simulationAction + "',");

    if (step.transitionTo)
        lines.push('transitionTo: ' + q(step.transitionTo) + ',');

    return lines;
}

/** escapeRegex — mirrors fileSaver.js */
function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** replaceCtaStepsForAct — mirrors fileSaver.js */
function replaceCtaStepsForAct(
    content: string,
    actId: string,
    newBlock: string
): { content: string; found: boolean } {
    const actIdPattern = new RegExp("id:\\s*['\"]" + escapeRegex(actId) + "['\"]");
    const actIdMatch = actIdPattern.exec(content);
    if (!actIdMatch) return { content, found: false };

    const remainderAfterActId = content.slice(actIdMatch.index + actIdMatch[0].length);
    const nextActIdMatch = /id:\s*['"]/.exec(remainderAfterActId);
    const scopeEnd = nextActIdMatch
        ? actIdMatch.index + actIdMatch[0].length + nextActIdMatch.index
        : content.length;

    const ctaStepsIdx = content.indexOf('ctaSteps:', actIdMatch.index);
    if (ctaStepsIdx === -1 || ctaStepsIdx >= scopeEnd) return { content, found: false };

    const openBracketIdx = content.indexOf('[', ctaStepsIdx);
    if (openBracketIdx === -1 || openBracketIdx >= scopeEnd) return { content, found: false };

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

    let endPos = closeBracketIdx + 1;
    if (content[endPos] === ',') endPos++;

    const before = content.substring(0, ctaStepsIdx);
    const after = content.substring(endPos);
    return { content: before + newBlock + ',' + after, found: true };
}

/** extractCtaStepsSource — mirrors importer.js */
function extractCtaStepsSource(content: string, actId: string): string | null {
    const actPattern = new RegExp("id:\\s*['\"]" + escapeRegex(actId) + "['\"]");
    const actMatch = actPattern.exec(content);
    if (!actMatch) return null;

    const remainder = content.slice(actMatch.index + actMatch[0].length);
    const nextActMatch = /id:\s*['"]/.exec(remainder);
    const scopeEnd = nextActMatch
        ? actMatch.index + actMatch[0].length + nextActMatch.index
        : content.length;

    const ctaIdx = content.indexOf('ctaSteps:', actMatch.index);
    if (ctaIdx === -1 || ctaIdx >= scopeEnd) return null;

    const openIdx = content.indexOf('[', ctaIdx);
    if (openIdx === -1 || openIdx >= scopeEnd) return null;

    let depth = 0;
    let closeIdx = -1;
    for (let i = openIdx; i < content.length; i++) {
        if (content[i] === '[') depth++;
        else if (content[i] === ']') {
            depth--;
            if (depth === 0) { closeIdx = i; break; }
        }
    }
    if (closeIdx === -1) return null;

    return content.substring(openIdx + 1, closeIdx);
}

// ─── TESTS ────────────────────────────────────────────────────────────────────

describe('DemoScript Editor — parseCtaStepsArray', () => {
    it('parses a simple ctaSteps source with single-quoted strings', () => {
        const source = `
            {
                ctaLabel: 'Start the factory',
                slideImageUrl: '/demo/Welcome.png',
                ariaInputEnabled: true,
            },
        `;
        const result = parseCtaStepsArray(source);
        expect(result).not.toBeNull();
        expect(result).toHaveLength(1);
        expect(result![0].ctaLabel).toBe('Start the factory');
        expect(result![0].slideImageUrl).toBe('/demo/Welcome.png');
        expect(result![0].ariaInputEnabled).toBe(true);
    });

    it('parses multiple steps', () => {
        const source = `
            { ctaLabel: 'Step 1', ariaInputEnabled: false },
            { ctaLabel: 'Step 2', ariaInputEnabled: true },
            { ctaLabel: 'Step 3', ariaInputEnabled: true },
        `;
        const result = parseCtaStepsArray(source);
        expect(result).not.toBeNull();
        expect(result).toHaveLength(3);
        expect(result![0].ctaLabel).toBe('Step 1');
        expect(result![2].ctaLabel).toBe('Step 3');
    });

    it('strips inline comments (// Click #N)', () => {
        const source = `
            { // Click #1
                ctaLabel: 'First',
                ariaInputEnabled: true,
            },
            { // Click #2
                ctaLabel: 'Second',
                ariaInputEnabled: false,
            },
        `;
        const result = parseCtaStepsArray(source);
        expect(result).not.toBeNull();
        expect(result).toHaveLength(2);
        expect(result![0].ctaLabel).toBe('First');
        expect(result![1].ctaLabel).toBe('Second');
    });

    it('preserves newlines from template literals', () => {
        const source = `
            { // Click #1
                screenText: \`Line one.
Line two.
Line three.\`,
                ariaInputEnabled: true,
            },
        `;
        const result = parseCtaStepsArray(source);
        expect(result).not.toBeNull();
        expect(result).toHaveLength(1);

        const text = result![0].screenText as string;
        // Must contain actual newline characters, not just spaces
        expect(text).toContain('\n');
        expect(text.split('\n')).toHaveLength(3);
        expect(text).toContain('Line one.');
        expect(text).toContain('Line two.');
        expect(text).toContain('Line three.');
    });

    it('preserves newlines in ariaLocal template literals', () => {
        const source = `
            {
                ariaLocal: \`Welcome to the factory.

This is a new paragraph.

And another one.\`,
                ariaInputEnabled: true,
            },
        `;
        const result = parseCtaStepsArray(source);
        expect(result).not.toBeNull();

        const text = result![0].ariaLocal as string;
        expect(text).toContain('\n');
        // Contains actual newlines (paragraph breaks)
        const lines = text.split('\n');
        expect(lines.length).toBeGreaterThanOrEqual(3);
    });

    it('handles embedded commands like <cls> and <w:N> with newlines', () => {
        const source = `
            {
                screenText: \`<cls> A ceramic tile factory.<w:1500>
Every tile.
Every machine.<w:3000> <cls> <clck>\`,
                ariaInputEnabled: true,
            },
        `;
        const result = parseCtaStepsArray(source);
        expect(result).not.toBeNull();

        const text = result![0].screenText as string;
        expect(text).toContain('<cls>');
        expect(text).toContain('<w:1500>');
        expect(text).toContain('\n');
    });

    it('returns null for malformed source', () => {
        const result = parseCtaStepsArray('{{{{ broken syntax');
        expect(result).toBeNull();
    });

    it('parses panelActions arrays', () => {
        const source = `
            {
                ariaInputEnabled: true,
                panelActions: [
                    { panel: 'cwf', state: 'open' },
                    { panel: 'basicPanel', state: 'close' },
                ],
            },
        `;
        const result = parseCtaStepsArray(source);
        expect(result).not.toBeNull();
        expect(result![0].panelActions).toEqual([
            { panel: 'cwf', state: 'open' },
            { panel: 'basicPanel', state: 'close' },
        ]);
    });

    it('parses numeric delayMs', () => {
        const source = `{ delayMs: 2500, ariaInputEnabled: false },`;
        const result = parseCtaStepsArray(source);
        expect(result).not.toBeNull();
        expect(result![0].delayMs).toBe(2500);
    });
});

describe('DemoScript Editor — mapToEditorStep', () => {
    it('maps simple fields correctly', () => {
        const parsed = {
            ctaLabel: 'Start',
            slideImageUrl: '/demo/img.png',
            screenText: 'Hello\nWorld',
            ariaInputEnabled: false,
            delayMs: 1500,
        };
        const step = mapToEditorStep(parsed);
        expect(step.ctaLabel).toBe('Start');
        expect(step.slideImageUrl).toBe('/demo/img.png');
        expect(step.screenText).toBe('Hello\nWorld');
        expect(step.ariaInputEnabled).toBe(false);
        expect(step.delayMs).toBe('1500');
    });

    it('preserves newlines in mapped screenText', () => {
        const parsed = { screenText: 'Line 1.\nLine 2.\nLine 3.' };
        const step = mapToEditorStep(parsed);
        expect(step.screenText).toContain('\n');
        expect(step.screenText.split('\n')).toHaveLength(3);
    });

    it('maps panelActions array to object format', () => {
        const parsed = {
            panelActions: [
                { panel: 'cwf', state: 'open' },
                { panel: 'basicPanel', state: 'close' },
            ],
        };
        const step = mapToEditorStep(parsed);
        expect(step.panelActions.cwf).toBe('open');
        expect(step.panelActions.basicPanel).toBe('close');
        expect(step.panelActions.dtxfr).toBe('');  // default
    });

    it('fills defaults for missing fields', () => {
        const step = mapToEditorStep({});
        expect(step.ctaLabel).toBe('');
        expect(step.ariaInputEnabled).toBe(true);
        expect(step.panelActions.cwf).toBe('');
    });
});

describe('DemoScript Editor — buildStepFields', () => {
    it('emits ctaLabel when present', () => {
        const step = createEmptyStep();
        step.ctaLabel = 'Next >';
        const lines = buildStepFields(step);
        expect(lines.some(l => l.includes("ctaLabel: 'Next >'"))).toBe(true);
    });

    it('omits empty ctaLabel', () => {
        const step = createEmptyStep();
        const lines = buildStepFields(step);
        expect(lines.some(l => l.includes('ctaLabel'))).toBe(false);
    });

    it('emits screenText as backtick template literal', () => {
        const step = createEmptyStep();
        step.screenText = 'Hello world';
        const lines = buildStepFields(step);
        expect(lines.some(l => l.includes('screenText: `Hello world`'))).toBe(true);
    });

    it('emits ariaLocal as backtick template literal with newlines', () => {
        const step = createEmptyStep();
        step.ariaLocal = 'Line 1.\nLine 2.';
        const lines = buildStepFields(step);
        const ariaLine = lines.find(l => l.startsWith('ariaLocal:'));
        expect(ariaLine).toBeDefined();
        // The backtick wrapper should preserve the actual newline
        expect(ariaLine).toContain('\n');
    });

    it('always emits ariaInputEnabled', () => {
        const step = createEmptyStep();
        step.ariaInputEnabled = false;
        const lines = buildStepFields(step);
        expect(lines.some(l => l.includes('ariaInputEnabled: false'))).toBe(true);
    });

    it('omits slideImageUrl when mediaInstruction is set', () => {
        const step = createEmptyStep();
        step.slideImageUrl = '/demo/img.png';
        step.mediaInstruction = 'chart:conveyor_speed';
        const lines = buildStepFields(step);
        expect(lines.some(l => l.includes('slideImageUrl'))).toBe(false);
        expect(lines.some(l => l.includes('mediaInstruction'))).toBe(true);
    });

    it('emits panelActions when set', () => {
        const step = createEmptyStep();
        step.panelActions.cwf = 'open';
        step.panelActions.basicPanel = 'close';
        const lines = buildStepFields(step);
        expect(lines.some(l => l.includes("panel: 'cwf', state: 'open'"))).toBe(true);
        expect(lines.some(l => l.includes("panel: 'basicPanel', state: 'close'"))).toBe(true);
    });

    it('omits panelActions when none are set', () => {
        const step = createEmptyStep();
        const lines = buildStepFields(step);
        expect(lines.some(l => l.includes('panelActions'))).toBe(false);
    });

    it('omits formatting fields when default (center/bold/lg)', () => {
        const step = createEmptyStep();
        step.screenText = 'some text';
        const lines = buildStepFields(step);
        expect(lines.some(l => l.includes('screenTextAlign'))).toBe(false);
        expect(lines.some(l => l.includes('screenTextWeight'))).toBe(false);
        expect(lines.some(l => l.includes('screenTextSize'))).toBe(false);
    });

    it('emits screenTextAlign when non-default', () => {
        const step = createEmptyStep();
        step.screenText = 'some text';
        step.screenTextAlign = 'left';
        const lines = buildStepFields(step);
        expect(lines.some(l => l.includes("screenTextAlign: 'left'"))).toBe(true);
    });

    it('emits screenTextWeight when non-default', () => {
        const step = createEmptyStep();
        step.screenText = 'some text';
        step.screenTextWeight = 'normal';
        const lines = buildStepFields(step);
        expect(lines.some(l => l.includes("screenTextWeight: 'normal'"))).toBe(true);
    });

    it('emits screenTextSize when non-default', () => {
        const step = createEmptyStep();
        step.screenText = 'some text';
        step.screenTextSize = 'xl';
        const lines = buildStepFields(step);
        expect(lines.some(l => l.includes("screenTextSize: 'xl'"))).toBe(true);
    });
});

describe('DemoScript Editor — Step Add / Remove', () => {
    let steps: ReturnType<typeof createEmptyStep>[];

    beforeEach(() => {
        steps = [createEmptyStep(), createEmptyStep()];
        steps[0].ctaLabel = 'Step A';
        steps[1].ctaLabel = 'Step B';
    });

    it('addStep increases array length', () => {
        const MAX_STEPS = 10;
        if (steps.length < MAX_STEPS) {
            steps.push(createEmptyStep());
        }
        expect(steps).toHaveLength(3);
    });

    it('addStep is blocked at MAX_STEPS', () => {
        const MAX_STEPS = 10;
        // Fill to max
        while (steps.length < MAX_STEPS) {
            steps.push(createEmptyStep());
        }
        // Try adding one more
        const beforeLength = steps.length;
        if (steps.length < MAX_STEPS) {
            steps.push(createEmptyStep());
        }
        expect(steps).toHaveLength(beforeLength);
        expect(steps).toHaveLength(MAX_STEPS);
    });

    it('removeStep at index 0 removes the correct step', () => {
        if (steps.length > 1) steps.splice(0, 1);
        expect(steps).toHaveLength(1);
        expect(steps[0].ctaLabel).toBe('Step B');
    });

    it('removeStep at last index removes the correct step', () => {
        if (steps.length > 1) steps.splice(steps.length - 1, 1);
        expect(steps).toHaveLength(1);
        expect(steps[0].ctaLabel).toBe('Step A');
    });

    it('removeStep from middle removes the correct step', () => {
        steps.push(createEmptyStep());
        steps[2].ctaLabel = 'Step C';

        if (steps.length > 1) steps.splice(1, 1);
        expect(steps).toHaveLength(2);
        expect(steps[0].ctaLabel).toBe('Step A');
        expect(steps[1].ctaLabel).toBe('Step C');
    });

    it('removeStep is blocked when only 1 step remains', () => {
        steps.splice(0, 1); // now length = 1
        const beforeLength = steps.length;
        if (steps.length > 1) steps.splice(0, 1);
        expect(steps).toHaveLength(beforeLength);
    });

    it('removeStep then buildStepFields only emits remaining steps', () => {
        // Remove Step A
        steps.splice(0, 1);
        const allFields = steps.map(s => buildStepFields(s));
        expect(allFields).toHaveLength(1);
        // Step B's label should be in the output
        const hasStepB = allFields[0].some(l => l.includes("'Step B'"));
        expect(hasStepB).toBe(true);
    });
});

describe('DemoScript Editor — replaceCtaStepsForAct', () => {
    const sampleFile = `
    {
        id: 'welcome',
        eraLabel: 'Welcome',
        ctaSteps: [
            { ctaLabel: 'Old Step 1', ariaInputEnabled: true },
            { ctaLabel: 'Old Step 2', ariaInputEnabled: false },
        ],
    },
    {
        id: 'no-management',
        eraLabel: 'No System',
        ctaSteps: [
            { ctaLabel: 'NM Step 1', ariaInputEnabled: true },
        ],
    },
    `;

    it('replaces ctaSteps for a specific act', () => {
        const newBlock = "        ctaSteps: [\n            { // Click #1\n                ctaLabel: 'New Step',\n                ariaInputEnabled: true,\n            },\n        ]";
        const result = replaceCtaStepsForAct(sampleFile, 'welcome', newBlock);
        expect(result.found).toBe(true);
        expect(result.content).toContain('New Step');
        expect(result.content).not.toContain('Old Step 1');
        expect(result.content).not.toContain('Old Step 2');
    });

    it('does not affect other acts', () => {
        const newBlock = "        ctaSteps: [\n            { ctaLabel: 'Replaced' },\n        ]";
        const result = replaceCtaStepsForAct(sampleFile, 'welcome', newBlock);
        expect(result.found).toBe(true);
        // no-management should still have its original step
        expect(result.content).toContain('NM Step 1');
    });

    it('returns found:false for unknown act id', () => {
        const result = replaceCtaStepsForAct(sampleFile, 'nonexistent', 'x');
        expect(result.found).toBe(false);
        expect(result.content).toBe(sampleFile);
    });

    it('handles empty replacement (0 steps)', () => {
        const newBlock = "        ctaSteps: []";
        const result = replaceCtaStepsForAct(sampleFile, 'welcome', newBlock);
        expect(result.found).toBe(true);
        expect(result.content).toContain('ctaSteps: []');
    });

    it('handles replacement with more steps than original', () => {
        const newBlock = [
            "        ctaSteps: [",
            "            { ctaLabel: 'S1' },",
            "            { ctaLabel: 'S2' },",
            "            { ctaLabel: 'S3' },",
            "            { ctaLabel: 'S4' },",
            "            { ctaLabel: 'S5' },",
            "        ]",
        ].join('\n');
        const result = replaceCtaStepsForAct(sampleFile, 'welcome', newBlock);
        expect(result.found).toBe(true);
        expect(result.content).toContain("'S5'");
        expect(result.content).not.toContain('Old Step');
    });
});

describe('DemoScript Editor — extractCtaStepsSource', () => {
    const file = `
    {
        id: 'test-act',
        eraLabel: 'Test',
        ctaSteps: [
            { // Click #1
                ctaLabel: 'Step 1',
                screenText: \`Hello
World\`,
                ariaInputEnabled: true,
            },
            { // Click #2
                ctaLabel: 'Step 2',
                ariaInputEnabled: false,
            },
        ],
    },
    {
        id: 'next-act',
        ctaSteps: [
            { ctaLabel: 'Other' },
        ],
    },
    `;

    it('extracts ctaSteps source for a given act', () => {
        const source = extractCtaStepsSource(file, 'test-act');
        expect(source).not.toBeNull();
        expect(source).toContain('Step 1');
        expect(source).toContain('Step 2');
    });

    it('does not include steps from the next act', () => {
        const source = extractCtaStepsSource(file, 'test-act');
        expect(source).not.toContain('Other');
    });

    it('returns null for unknown act id', () => {
        const source = extractCtaStepsSource(file, 'nonexistent');
        expect(source).toBeNull();
    });
});

describe('DemoScript Editor — Full Round-Trip (export → re-import)', () => {
    it('round-trips simple fields through export → import', () => {
        // 1. Create step with data
        const original = createEmptyStep();
        original.ctaLabel = 'Start the journey →';
        original.slideImageUrl = '/demo/Welcome.png';
        original.delayMs = '1500';
        original.ariaInputEnabled = false;
        original.transitionTo = 'next';

        // 2. Export via buildStepFields
        const lines = buildStepFields(original);
        const stepSource = '            { // Click #1\n' +
            lines.map(l => '                ' + l).join('\n') + '\n' +
            '            },';

        // 3. Re-import via parseCtaStepsArray
        const parsed = parseCtaStepsArray(stepSource);
        expect(parsed).not.toBeNull();
        expect(parsed).toHaveLength(1);

        // 4. Map back to editor format
        const reimported = mapToEditorStep(parsed![0]);

        // 5. Compare
        expect(reimported.ctaLabel).toBe(original.ctaLabel);
        expect(reimported.slideImageUrl).toBe(original.slideImageUrl);
        expect(reimported.delayMs).toBe(original.delayMs);
        expect(reimported.ariaInputEnabled).toBe(original.ariaInputEnabled);
        expect(reimported.transitionTo).toBe(original.transitionTo);
    });

    it('round-trips multi-line screenText with newlines preserved', () => {
        const original = createEmptyStep();
        original.screenText = 'A ceramic tile factory — live, right now.\nEvery tile.\nEvery machine.\nEvery gram of CO₂.';

        // Export
        const lines = buildStepFields(original);
        const stepSource = '{ // Click #1\n' + lines.join('\n') + '\n},';

        // Re-import
        const parsed = parseCtaStepsArray(stepSource);
        expect(parsed).not.toBeNull();
        const reimported = mapToEditorStep(parsed![0]);

        // Newlines must survive
        expect(reimported.screenText).toContain('\n');
        expect(reimported.screenText.split('\n')).toHaveLength(4);
        expect(reimported.screenText).toContain('Every tile.');
        expect(reimported.screenText).toContain('Every gram of CO₂.');
    });

    it('round-trips ariaLocal with embedded commands and newlines', () => {
        const original = createEmptyStep();
        original.ariaLocal = '<cls> Welcome to the factory.\n\nIn the next few minutes, I will take you through four stages.\n\n→ Click to begin.';

        // Export
        const lines = buildStepFields(original);
        const stepSource = '{ // Click #1\n' + lines.join('\n') + '\n},';

        // Re-import
        const parsed = parseCtaStepsArray(stepSource);
        expect(parsed).not.toBeNull();
        const reimported = mapToEditorStep(parsed![0]);

        expect(reimported.ariaLocal).toContain('<cls>');
        expect(reimported.ariaLocal).toContain('\n');
        expect(reimported.ariaLocal).toContain('→ Click to begin.');
    });

    it('round-trips panelActions correctly', () => {
        const original = createEmptyStep();
        original.panelActions.cwf = 'open';
        original.panelActions.basicPanel = 'close';

        // Export
        const lines = buildStepFields(original);
        const stepSource = '{ // Click #1\n' + lines.join('\n') + '\n},';

        // Re-import
        const parsed = parseCtaStepsArray(stepSource);
        expect(parsed).not.toBeNull();
        const reimported = mapToEditorStep(parsed![0]);

        expect(reimported.panelActions.cwf).toBe('open');
        expect(reimported.panelActions.basicPanel).toBe('close');
    });

    it('round-trips after deleting middle step — only remaining steps exported', () => {
        // 3 steps
        const steps = [createEmptyStep(), createEmptyStep(), createEmptyStep()];
        steps[0].ctaLabel = 'First';
        steps[1].ctaLabel = 'Second (to delete)';
        steps[2].ctaLabel = 'Third';

        // Delete middle step
        steps.splice(1, 1);

        // Export all remaining steps
        const allLines: string[] = [];
        steps.forEach((step, i) => {
            allLines.push('{ // Click #' + (i + 1));
            buildStepFields(step).forEach(l => allLines.push('    ' + l));
            allLines.push('},');
        });
        const combinedSource = allLines.join('\n');

        // Re-import
        const parsed = parseCtaStepsArray(combinedSource);
        expect(parsed).not.toBeNull();
        expect(parsed).toHaveLength(2);
        expect((parsed![0] as Record<string, unknown>).ctaLabel).toBe('First');
        expect((parsed![1] as Record<string, unknown>).ctaLabel).toBe('Third');
        // 'Second' must not appear
        expect(combinedSource).not.toContain('Second');
    });
});
