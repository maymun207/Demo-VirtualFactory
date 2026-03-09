/// <reference types="vitest/globals" />
/**
 * copilotPrompt.test.ts — Unit Tests for CWF Copilot Gemini Prompt Module
 *
 * Tests the prompt building and response parsing functions:
 *   - buildCopilotSystemPrompt: generates the system prompt from a ReferenceJSON object.
 *     Signature changed from (cooldownSecs, cooldownParams[]) to (referenceJSON).
 *   - buildCopilotUserMessage: formats a CopilotStateJSON snapshot as a per-cycle user message.
 *     This replaced the old buildMetricsSnapshot function.
 *   - buildReferenceJSON: builds the static reference JSON from PARAMETER_RANGES.
 *   - parseCopilotResponse: validates and parses Gemini JSON responses.
 *     Schema changed from single `action` object to `actions` array.
 *
 * These tests do NOT call Gemini — they only validate prompt construction and
 * response parsing logic.
 */

import {
    buildCopilotSystemPrompt,
    buildCopilotUserMessage,
    buildReferenceJSON,
    parseCopilotResponse,
} from '../../api/cwf/copilotPrompt';
import type { CopilotReferenceJSON, CopilotStateJSON } from '../../api/cwf/copilotPrompt';

// =============================================================================
// Shared test fixtures
// =============================================================================

/**
 * Minimal reference JSON — one station with two parameters.
 * Used for prompt-building tests without pulling in the full PARAMETER_RANGES.
 */
const MINIMAL_REF: CopilotReferenceJSON = {
    kiln: {
        max_temperature_c: { min: 950, max: 1200, midpoint: 1075 },
        pressure_bar: { min: 2, max: 8, midpoint: 5 },
    },
};

/**
 * Minimal state JSON fixture for buildCopilotUserMessage tests.
 */
const MINIMAL_STATE: CopilotStateJSON = {
    sim_tick: 42,
    foee: 72.3,
    machine_oees: {
        press: 85.5,
        dryer: 90,
        glaze: 88,
        printer: 91,
        kiln: 65.2,
        sorting: 78,
        packaging: 82,
        conveyor: 77,
    },
    parameters: {
        kiln: { max_temperature_c: 1400, pressure_bar: 6 },
    },
    active_alarms: 1,
    cooldown_params: [],
};

// =============================================================================
// buildReferenceJSON
// =============================================================================

describe('buildReferenceJSON', () => {
    test('returns an object with at least one station', () => {
        /** Confirms the builder produces non-empty output from PARAMETER_RANGES */
        const ref = buildReferenceJSON();
        expect(typeof ref).toBe('object');
        expect(Object.keys(ref).length).toBeGreaterThan(0);
    });

    test('includes conveyor station with conveyor_speed_x', () => {
        /** Conveyor is added manually outside PARAMETER_RANGES — verify it is present */
        const ref = buildReferenceJSON();
        expect(ref.conveyor).toBeDefined();
        expect(ref.conveyor.conveyor_speed_x).toBeDefined();
        expect(ref.conveyor.conveyor_speed_x.min).toBe(0.7);
        expect(ref.conveyor.conveyor_speed_x.max).toBe(2.0);
        expect(ref.conveyor.conveyor_speed_x.midpoint).toBe(1.35);
    });

    test('each parameter entry has min, max, and midpoint', () => {
        /** Structural validation: every entry must have all three fields */
        const ref = buildReferenceJSON();
        for (const [, params] of Object.entries(ref)) {
            for (const [, range] of Object.entries(params)) {
                expect(typeof range.min).toBe('number');
                expect(typeof range.max).toBe('number');
                expect(typeof range.midpoint).toBe('number');
            }
        }
    });

    test('midpoint equals (min + max) / 2 for all parameters', () => {
        /** Midpoint formula correctness — rounded to 2 decimal places */
        const ref = buildReferenceJSON();
        for (const [, params] of Object.entries(ref)) {
            for (const [, range] of Object.entries(params)) {
                const expected = Math.round(((range.min + range.max) / 2) * 100) / 100;
                expect(range.midpoint).toBeCloseTo(expected, 5);
            }
        }
    });
});

// =============================================================================
// buildCopilotSystemPrompt
// =============================================================================

describe('buildCopilotSystemPrompt', () => {
    /** Build once — shared across all prompt tests */
    const prompt = buildCopilotSystemPrompt(MINIMAL_REF);

    test('includes the role definition', () => {
        /** Role sentinel that all downstream tests depend on being stable */
        expect(prompt).toContain('AUTONOMOUS FACTORY SUPERVISOR');
    });

    test('includes decision options (skip, correct, escalate)', () => {
        /** Decision taxonomy must be present so Gemini knows its options */
        expect(prompt).toContain('"correct"');
        expect(prompt).toContain('"skip"');
        expect(prompt).toContain('"escalate"');
    });

    test('includes mandatory rules section', () => {
        /** Safety rules block — guards against invalid corrections */
        expect(prompt).toContain('MANDATORY RULES');
    });

    test('includes actions array schema (not single action)', () => {
        /**
         * The new multi-action schema uses "actions" array.
         * Old tests checked for "\"action\"" (singular) — that schema is retired.
         */
        expect(prompt).toContain('"actions"');
        expect(prompt).toContain('"target_value"');
    });

    test('includes reference JSON with station and parameter data', () => {
        /** The reference JSON (safe ranges) is embedded in the system prompt */
        expect(prompt).toContain('"kiln"');
        expect(prompt).toContain('"max_temperature_c"');
        expect(prompt).toContain('"midpoint"');
    });

    test('includes JSON response format specification', () => {
        /** Gemini must see the exact output schema to return compliant JSON */
        expect(prompt).toContain('"decision"');
        expect(prompt).toContain('"severity"');
        expect(prompt).toContain('"reasoning"');
        expect(prompt).toContain('"chat_message"');
    });

    test('includes priority order section', () => {
        /** Priority guide — ensures kiln corrections are listed before conveyor */
        expect(prompt).toContain('PRIORITY ORDER');
    });
});

// =============================================================================
// buildCopilotUserMessage (replaces the old buildMetricsSnapshot)
// =============================================================================

describe('buildCopilotUserMessage', () => {
    test('produces a parseable JSON string', () => {
        /** The user message must be valid JSON — Gemini parses it as structured input */
        const msg = buildCopilotUserMessage(MINIMAL_STATE);
        expect(() => JSON.parse(msg)).not.toThrow();
    });

    test('includes FOEE value', () => {
        /** Factory OEE must appear in the message for Gemini to make escalate decisions */
        const msg = buildCopilotUserMessage(MINIMAL_STATE);
        expect(msg).toContain('72.3');
    });

    test('includes machine OEEs', () => {
        /** Per-machine OEEs help Gemini identify which station to inspect */
        const msg = buildCopilotUserMessage(MINIMAL_STATE);
        expect(msg).toContain('85.5');   // press
        expect(msg).toContain('65.2');   // kiln
    });

    test('includes sim_tick', () => {
        /** Tick is included for audit trail context */
        const msg = buildCopilotUserMessage(MINIMAL_STATE);
        expect(msg).toContain('42');
    });

    test('includes parameter readings', () => {
        /** Parameter readings are the primary input for correction decisions */
        const msg = buildCopilotUserMessage(MINIMAL_STATE);
        expect(msg).toContain('max_temperature_c');
        expect(msg).toContain('1400');
    });

    test('includes active_alarms field', () => {
        /** Alarm count is forwarded to Gemini for situational awareness */
        const msg = buildCopilotUserMessage(MINIMAL_STATE);
        expect(msg).toContain('active_alarms');
    });

    test('represents cooldown_params as an array', () => {
        /** Gemini must receive cooldown list to avoid re-correcting recent changes */
        const stateWithCooldown: CopilotStateJSON = {
            ...MINIMAL_STATE,
            cooldown_params: ['kiln.max_temperature_c'],
        };
        const msg = buildCopilotUserMessage(stateWithCooldown);
        expect(msg).toContain('kiln.max_temperature_c');
        expect(msg).toContain('cooldown_params');
    });
});

// =============================================================================
// parseCopilotResponse
// =============================================================================

describe('parseCopilotResponse', () => {
    test('parses valid skip response', () => {
        /** Skip: decision is valid, actions must be empty array */
        const json = JSON.stringify({
            decision: 'skip',
            severity: 'low',
            reasoning: 'Factory is healthy',
            chat_message: '✅ All good',
            actions: [],
        });
        const result = parseCopilotResponse(json);
        expect(result).not.toBeNull();
        expect(result!.decision).toBe('skip');
        expect(result!.actions).toHaveLength(0);
    });

    test('parses valid correct response with actions array', () => {
        /**
         * Correct: actions[] must contain the full correction plan.
         * Note: the schema uses target_value (not new_value) per the current spec.
         */
        const json = JSON.stringify({
            decision: 'correct',
            severity: 'high',
            reasoning: 'Kiln temperature too high',
            chat_message: '🔧 Fixing kiln',
            actions: [{
                station: 'kiln',
                parameter: 'max_temperature_c',
                current_value: 1400,
                target_value: 1075,
                reason: 'Out of range',
            }],
        });
        const result = parseCopilotResponse(json);
        expect(result).not.toBeNull();
        expect(result!.decision).toBe('correct');
        expect(result!.actions).toHaveLength(1);
        expect(result!.actions[0].station).toBe('kiln');
        expect(result!.actions[0].target_value).toBe(1075);
    });

    test('parses valid escalate response', () => {
        /** Escalate: actions must be empty */
        const json = JSON.stringify({
            decision: 'escalate',
            severity: 'critical',
            reasoning: 'Multiple critical failures',
            chat_message: '⚠️ Human review needed',
            actions: [],
        });
        const result = parseCopilotResponse(json);
        expect(result).not.toBeNull();
        expect(result!.decision).toBe('escalate');
    });

    test('converts legacy single action object to actions array', () => {
        /**
         * Graceful degradation: if Gemini returns the old `action` (singular) field,
         * parseCopilotResponse converts it into actions[] silently.
         */
        const json = JSON.stringify({
            decision: 'correct',
            severity: 'high',
            reasoning: 'Kiln temperature too high',
            chat_message: '🔧 Fixing kiln',
            action: {
                station: 'kiln',
                parameter: 'max_temperature_c',
                current_value: 1400,
                target_value: 1075,
                reason: 'Out of range',
            },
        });
        const result = parseCopilotResponse(json);
        expect(result).not.toBeNull();
        expect(result!.decision).toBe('correct');
        expect(result!.actions).toHaveLength(1);
        expect(result!.actions[0].target_value).toBe(1075);
    });

    test('handles markdown-wrapped JSON', () => {
        /** Gemini sometimes wraps output in ```json code fences — parser must strip them */
        const wrapped = '```json\n' + JSON.stringify({
            decision: 'skip',
            severity: 'low',
            reasoning: 'OK',
            chat_message: '✅',
            actions: [],
        }) + '\n```';
        const result = parseCopilotResponse(wrapped);
        expect(result).not.toBeNull();
        expect(result!.decision).toBe('skip');
    });

    test('returns null for invalid JSON', () => {
        /** Completely unparseable input must return null, not throw */
        const result = parseCopilotResponse('not json at all');
        expect(result).toBeNull();
    });

    test('returns null for missing required fields', () => {
        /** Partial response without required fields must be rejected */
        const result = parseCopilotResponse(JSON.stringify({ decision: 'skip' }));
        expect(result).toBeNull();
    });

    test('returns null for invalid decision value', () => {
        /** Guard against Gemini hallucinating decision values outside the enum */
        const result = parseCopilotResponse(JSON.stringify({
            decision: 'invalid_value',
            severity: 'low',
            reasoning: 'foo',
            chat_message: 'bar',
            actions: [],
        }));
        expect(result).toBeNull();
    });

    test('decision becomes escalate when correct has no valid actions', () => {
        /**
         * When Gemini returns decision='correct' but provides no valid actions,
         * parseCopilotResponse promotes it to 'escalate' rather than returning null.
         * This is by design — the factory must always receive a usable decision.
         */
        const result = parseCopilotResponse(JSON.stringify({
            decision: 'correct',
            severity: 'high',
            reasoning: 'need to fix',
            chat_message: 'fixing',
            actions: [],
        }));
        expect(result).not.toBeNull();
        expect(result!.decision).toBe('escalate');
    });

    test('strips invalid actions from actions array rather than rejecting entire response', () => {
        /**
         * If one action has missing required fields, that action is removed but the
         * rest of the response is still accepted (non-null return).
         * If all actions are stripped and decision was 'correct', it becomes 'escalate'.
         */
        const result = parseCopilotResponse(JSON.stringify({
            decision: 'correct',
            severity: 'high',
            reasoning: 'need to fix',
            chat_message: 'fixing',
            actions: [{ station: 'kiln' }],  // Missing parameter, current_value, target_value
        }));
        expect(result).not.toBeNull();
        /** All actions stripped → promoted to escalate */
        expect(result!.decision).toBe('escalate');
    });

    test('handles extra whitespace in raw response', () => {
        /** Leading/trailing whitespace must not break parsing */
        const json = '   \n  ' + JSON.stringify({
            decision: 'skip',
            severity: 'low',
            reasoning: 'OK',
            chat_message: '✅',
            actions: [],
        }) + '  \n\n';
        const result = parseCopilotResponse(json);
        expect(result).not.toBeNull();
    });

    test('parses correct response with multiple actions', () => {
        /** Multi-action response — the primary new feature vs old single-action schema */
        const json = JSON.stringify({
            decision: 'correct',
            severity: 'high',
            reasoning: 'Multiple parameters out of range',
            chat_message: '🔧 Applying 2 corrections',
            actions: [
                { station: 'kiln', parameter: 'max_temperature_c', current_value: 1400, target_value: 1075, reason: 'Too hot' },
                { station: 'press', parameter: 'pressure_bar', current_value: 12, target_value: 8, reason: 'Over pressure' },
            ],
        });
        const result = parseCopilotResponse(json);
        expect(result).not.toBeNull();
        expect(result!.decision).toBe('correct');
        expect(result!.actions).toHaveLength(2);
        expect(result!.actions[0].station).toBe('kiln');
        expect(result!.actions[1].station).toBe('press');
    });
});
