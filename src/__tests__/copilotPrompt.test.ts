/**
 * copilotPrompt.test.ts — Unit Tests for CWF Copilot Gemini Prompt Module
 *
 * Tests the prompt building and response parsing functions:
 *   - buildCopilotSystemPrompt: generates the system prompt with ranges, cooldowns
 *   - buildMetricsSnapshot: formats factory metrics for the user message
 *   - parseCopilotResponse: validates and parses Gemini JSON responses
 *
 * These tests do NOT call Gemini — they only validate the prompt construction
 * and response parsing logic.
 */

import {
    buildCopilotSystemPrompt,
    buildMetricsSnapshot,
    parseCopilotResponse,
} from '../../api/cwf/copilotPrompt';

describe('buildCopilotSystemPrompt', () => {
    test('includes the role definition', () => {
        const prompt = buildCopilotSystemPrompt(30, []);
        expect(prompt).toContain('AUTONOMOUS FACTORY SUPERVISOR');
    });

    test('includes decision options (skip, correct, escalate)', () => {
        const prompt = buildCopilotSystemPrompt(30, []);
        expect(prompt).toContain('**SKIP**');
        expect(prompt).toContain('**CORRECT**');
        expect(prompt).toContain('**ESCALATE**');
    });

    test('includes safety rules', () => {
        const prompt = buildCopilotSystemPrompt(30, []);
        expect(prompt).toContain('SAFETY RULES');
        expect(prompt).toContain('EXACTLY ONE parameter');
    });

    test('includes parameter ranges from PARAMETER_RANGES', () => {
        const prompt = buildCopilotSystemPrompt(30, []);
        /** Should contain at least one station header in uppercase */
        expect(prompt).toMatch(/### [A-Z]+/);
    });

    test('includes cooldown list when params are provided', () => {
        const prompt = buildCopilotSystemPrompt(30, ['kiln.max_temperature_c', 'press.pressure_bar']);
        expect(prompt).toContain('kiln.max_temperature_c');
        expect(prompt).toContain('press.pressure_bar');
    });

    test('shows no cooldown message when list is empty', () => {
        const prompt = buildCopilotSystemPrompt(30, []);
        expect(prompt).toContain('all parameters are eligible');
    });

    test('includes cooldown period value', () => {
        const prompt = buildCopilotSystemPrompt(45, []);
        expect(prompt).toContain('45 seconds');
    });

    test('includes JSON response format specification', () => {
        const prompt = buildCopilotSystemPrompt(30, []);
        expect(prompt).toContain('"decision"');
        expect(prompt).toContain('"severity"');
        expect(prompt).toContain('"reasoning"');
        expect(prompt).toContain('"chat_message"');
        expect(prompt).toContain('"action"');
    });
});

describe('buildMetricsSnapshot', () => {
    test('includes FOEE value', () => {
        const snapshot = buildMetricsSnapshot(72.3, {}, [], 0, 100);
        expect(snapshot).toContain('72.3%');
    });

    test('includes machine OEEs', () => {
        const snapshot = buildMetricsSnapshot(80, { press: 85.5, kiln: 65.2 }, [], 0, 100);
        expect(snapshot).toContain('press: 85.5%');
        expect(snapshot).toContain('kiln: 65.2%');
    });

    test('includes out-of-range params', () => {
        const outOfRange = [
            { station: 'kiln', parameter: 'max_temperature_c', current_value: 1400, min: 950, max: 1200 },
        ];
        const snapshot = buildMetricsSnapshot(50, {}, outOfRange, 0, 100);
        expect(snapshot).toContain('kiln.max_temperature_c');
        expect(snapshot).toContain('current=1400');
    });

    test('shows "all parameters within safe ranges" when none are out', () => {
        const snapshot = buildMetricsSnapshot(80, {}, [], 0, 100);
        expect(snapshot).toContain('all parameters within safe ranges');
    });

    test('includes sim tick', () => {
        const snapshot = buildMetricsSnapshot(80, {}, [], 0, 42);
        expect(snapshot).toContain('Tick 42');
    });
});

describe('parseCopilotResponse', () => {
    test('parses valid skip response', () => {
        const json = JSON.stringify({
            decision: 'skip',
            severity: 'low',
            reasoning: 'Factory is healthy',
            chat_message: '✅ All good',
            action: null,
        });

        const result = parseCopilotResponse(json);
        expect(result).not.toBeNull();
        expect(result!.decision).toBe('skip');
        expect(result!.action).toBeNull();
    });

    test('parses valid correct response', () => {
        const json = JSON.stringify({
            decision: 'correct',
            severity: 'high',
            reasoning: 'Kiln temperature too high',
            chat_message: '🔧 Fixing kiln',
            action: {
                station: 'kiln',
                parameter: 'max_temperature_c',
                current_value: 1400,
                new_value: 1075,
                reason: 'Out of range',
            },
        });

        const result = parseCopilotResponse(json);
        expect(result).not.toBeNull();
        expect(result!.decision).toBe('correct');
        expect(result!.action!.station).toBe('kiln');
        expect(result!.action!.new_value).toBe(1075);
    });

    test('parses valid escalate response', () => {
        const json = JSON.stringify({
            decision: 'escalate',
            severity: 'critical',
            reasoning: 'Multiple critical failures',
            chat_message: '⚠️ Human review needed',
            action: null,
        });

        const result = parseCopilotResponse(json);
        expect(result).not.toBeNull();
        expect(result!.decision).toBe('escalate');
    });

    test('handles markdown-wrapped JSON', () => {
        const wrapped = '```json\n' + JSON.stringify({
            decision: 'skip',
            severity: 'low',
            reasoning: 'OK',
            chat_message: '✅',
            action: null,
        }) + '\n```';

        const result = parseCopilotResponse(wrapped);
        expect(result).not.toBeNull();
        expect(result!.decision).toBe('skip');
    });

    test('returns null for invalid JSON', () => {
        const result = parseCopilotResponse('not json at all');
        expect(result).toBeNull();
    });

    test('returns null for missing required fields', () => {
        const result = parseCopilotResponse(JSON.stringify({ decision: 'skip' }));
        expect(result).toBeNull();
    });

    test('returns null for invalid decision value', () => {
        const result = parseCopilotResponse(JSON.stringify({
            decision: 'invalid_value',
            severity: 'low',
            reasoning: 'foo',
            chat_message: 'bar',
            action: null,
        }));
        expect(result).toBeNull();
    });

    test('returns null for correct decision with missing action', () => {
        const result = parseCopilotResponse(JSON.stringify({
            decision: 'correct',
            severity: 'high',
            reasoning: 'need to fix',
            chat_message: 'fixing',
            action: null,
        }));
        expect(result).toBeNull();
    });

    test('returns null for correct decision with incomplete action', () => {
        const result = parseCopilotResponse(JSON.stringify({
            decision: 'correct',
            severity: 'high',
            reasoning: 'need to fix',
            chat_message: 'fixing',
            action: { station: 'kiln' }, // Missing parameter, values
        }));
        expect(result).toBeNull();
    });

    test('handles extra whitespace', () => {
        const json = '   \n  ' + JSON.stringify({
            decision: 'skip',
            severity: 'low',
            reasoning: 'OK',
            chat_message: '✅',
            action: null,
        }) + '  \n\n';

        const result = parseCopilotResponse(json);
        expect(result).not.toBeNull();
    });
});
