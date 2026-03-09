/**
 * copilotPrompt.ts — JSON-First Gemini Prompt for CWF Copilot
 *
 * Implements the JSON-in / actions-out architecture for autonomous factory supervision:
 *
 *   REFERENCE JSON (built once at engine start):
 *     Full safe-range spec for every machine parameter. Passed as part of the
 *     Gemini system prompt so Gemini always knows what "normal" looks like without
 *     needing it re-embedded in every user message.
 *
 *   CURRENT STATE JSON (built every cycle from Supabase reads):
 *     All current parameter readings for every machine + conveyor, plus OEE
 *     metrics and cooldown status. Sent as the per-cycle user message.
 *
 *   ACTIONS JSON (returned by Gemini):
 *     An array of ALL corrections that should be applied in this cycle.
 *     The engine applies every action in the array — no autonomous fallback loop.
 *
 * This design gives Gemini full situational awareness in a single API call and
 * lets it return a complete correction plan rather than just one parameter at a time.
 *
 * Used by: api/cwf/copilotEngine.ts
 *
 * Dependencies:
 *   - src/lib/params/parameterRanges.ts (PARAMETER_RANGES)
 */

import { PARAMETER_RANGES } from '../../src/lib/params/parameterRanges.js';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Reference JSON — built ONCE from PARAMETER_RANGES at engine startup.
 * Passed to Gemini as part of the system prompt so it always knows the
 * safe range and correction midpoint for every parameter.
 *
 * Shape example:
 * {
 *   "kiln": {
 *     "max_temperature_c": { "min": 1000, "max": 1300, "midpoint": 1150 },
 *     ...
 *   },
 *   "conveyor": {
 *     "conveyor_speed_x": { "min": 0.7, "max": 2.0, "midpoint": 1.35 }
 *   }
 * }
 */
export interface CopilotReferenceJSON {
    /** Station name key (e.g. "kiln", "press", "conveyor") */
    [station: string]: {
        /** Parameter column name key (e.g. "max_temperature_c") */
        [parameter: string]: {
            /** Safe range lower bound */
            min: number;
            /** Safe range upper bound */
            max: number;
            /** Correction target — always (min + max) / 2 */
            midpoint: number;
        };
    };
}

/**
 * Current State JSON — built EVERY cycle from latest Supabase readings.
 * Contains ALL parameter values (not just out-of-range ones) so Gemini can
 * perform its own comparisons against the reference JSON.
 *
 * Also contains the list of parameters currently in cooldown (recently
 * corrected), which Gemini must exclude from its actions array.
 */
export interface CopilotStateJSON {
    /** Current simulation tick */
    sim_tick: number;
    /** Factory Overall Equipment Effectiveness percentage */
    foee: number;
    /** Per-machine OEE percentages */
    machine_oees: {
        press: number;
        dryer: number;
        glaze: number;
        printer: number;
        kiln: number;
        sorting: number;
        packaging: number;
        conveyor: number;
    };
    /**
     * All current parameter readings for every station.
     * Keys match the station names in the reference JSON.
     * Values are the latest readings; null = not yet reported by simulator.
     */
    parameters: {
        [station: string]: {
            [parameter: string]: number | null;
        };
    };
    /** Count of active fault alarms in the simulation */
    active_alarms: number;
    /**
     * Parameters currently in cooldown — DO NOT include these in actions[].
     * Format: ["station.parameter", ...] e.g. ["kiln.max_temperature_c"]
     */
    cooldown_params: string[];
}

/**
 * Structured JSON response from Gemini — the complete correction plan for
 * this evaluation cycle.
 *
 * Key change from the old architecture: `actions` is an ARRAY, not a single
 * `action` object. Gemini is expected to include ALL parameters that need
 * correction in one shot.
 */
export interface CopilotGeminiResponse {
    /**
     * 'correct' — one or more parameters need correction, see actions[].
     * 'skip'    — factory is operating within normal parameters.
     * 'escalate'— OEE is low but root cause is unknown (no out-of-range params found).
     */
    decision: 'skip' | 'correct' | 'escalate';
    /** Overall severity of the detected condition */
    severity: 'low' | 'medium' | 'high' | 'critical';
    /** Brief technical reasoning for the decision (for audit log) */
    reasoning: string;
    /** Human-readable message for the CWF chat panel (1–2 sentences, with emojis) */
    chat_message: string;
    /**
     * Ordered list of corrective actions to apply this cycle.
     * Empty array when decision is 'skip' or 'escalate'.
     * Ordered by priority: kiln > press > dryer > glaze > printer > sorting > packaging > conveyor.
     * target_value MUST always equal the parameter's midpoint from the reference JSON.
     */
    actions: Array<{
        /** Station name — must match a key in the reference JSON */
        station: string;
        /** Parameter column name — must match a key in station's reference JSON */
        parameter: string;
        /** Current reading (from state JSON — include for audit trail) */
        current_value: number;
        /** Correction target — MUST equal midpoint from reference JSON */
        target_value: number;
        /** One-line reason for this specific correction */
        reason: string;
    }>;
}

// =============================================================================
// REFERENCE JSON BUILDER — called ONCE at engine startup
// =============================================================================

/**
 * Build the static Reference JSON from PARAMETER_RANGES.
 *
 * This is called ONCE when the CopilotEngine is constructed and cached as
 * a class field. It is never rebuilt during a monitoring session.
 *
 * Also adds the conveyor speed parameter, which lives outside PARAMETER_RANGES
 * but is monitored and corrected the same way.
 *
 * @returns CopilotReferenceJSON — safe ranges + midpoints for every parameter
 */
export function buildReferenceJSON(): CopilotReferenceJSON {
    const ref: CopilotReferenceJSON = {};

    /** Build from PARAMETER_RANGES (all machine stations except conveyor) */
    for (const [station, params] of Object.entries(PARAMETER_RANGES)) {
        ref[station] = {};
        for (const [param, range] of Object.entries(params)) {
            /** Cast to typed range (PARAMETER_RANGES uses Record<string, {min, max}>) */
            const typedRange = range as { min: number; max: number };
            const midpoint = (typedRange.min + typedRange.max) / 2;
            ref[station][param] = {
                min: typedRange.min,
                max: typedRange.max,
                /** Round to 2 decimal places to avoid floating-point noise in prompts */
                midpoint: Math.round(midpoint * 100) / 100,
            };
        }
    }

    /**
     * Add conveyor speed — monitored separately because conveyor is not a
     * process machine station but a cross-cutting infrastructure component.
     * Safe range: 0.7–2.0x. Midpoint: 1.35x. Below 0.7 causes OEE Performance drop.
     */
    ref['conveyor'] = {
        conveyor_speed_x: { min: 0.7, max: 2.0, midpoint: 1.35 },
    };

    return ref;
}

// =============================================================================
// SYSTEM PROMPT BUILDER — called ONCE per monitoring session
// =============================================================================

/**
 * Build the Gemini system prompt for the copilot monitoring session.
 *
 * The system prompt is constructed ONCE at session start (in CopilotEngine.start())
 * and passed to the persistent ChatSession. It includes:
 *   - Role definition
 *   - Decision taxonomy
 *   - Response format (with actions[] array schema)
 *   - The full Reference JSON (safe ranges + midpoints)
 *
 * Per-cycle variable data (current readings, cooldown list, OEE values) is
 * passed in the per-cycle user message via buildCopilotUserMessage().
 *
 * @param referenceJSON - Pre-built reference JSON (from buildReferenceJSON())
 * @returns Complete system prompt string
 */
export function buildCopilotSystemPrompt(referenceJSON: CopilotReferenceJSON): string {
    /** Serialise the reference JSON compactly — it will be embedded in the prompt */
    const referenceJSONStr = JSON.stringify(referenceJSON, null, 2);

    return `You are the AUTONOMOUS FACTORY SUPERVISOR for a ceramic tile production line digital twin.
You are NOT chatting with a human — you are making real-time autonomous control decisions.

Every evaluation cycle you will receive a CURRENT STATE JSON object with:
  - sim_tick: current simulation tick
  - foee: Factory OEE %
  - machine_oees: per-machine OEE %
  - parameters: current readings for ALL machine parameters
  - active_alarms: count of active fault alarms
  - cooldown_params: parameters recently corrected (DO NOT touch these)

You will compare the current readings against the REFERENCE JSON (safe ranges) provided below.

## YOUR JOB

Identify ALL parameters that are outside their safe range and return a correction plan for all of them in ONE response. Do NOT pick just one — fix everything that is wrong in a single cycle.

## DECISION OPTIONS

**"correct"** — One or more parameters are outside their safe range. Return ALL of them in the actions array. Always correct to the MIDPOINT from the reference JSON. Never include cooldown_params in actions[].

**"skip"** — All parameters are within safe range AND all machine OEEs are ≥ 80% AND factory OEE ≥ alarm threshold. Return empty actions array.

**"escalate"** — OEE is low but ALL parameters appear within safe range AND root cause is genuinely unknown. Return empty actions array. Use sparingly — prefer "correct" whenever any parameter is out of range.

## MANDATORY RULES

1. NEVER include a parameter in actions[] if it is listed in cooldown_params.
2. target_value MUST always equal the parameter's midpoint from the reference JSON. Never deviate.
3. If decision = "correct", actions[] MUST contain at least one entry.
4. If decision = "skip" or "escalate", actions[] MUST be an empty array [].
5. Only use parameters and stations that exist in the reference JSON.
6. If conveyor OEE < 70%, check conveyor.conveyor_speed_x — if it is below 0.7, add it to actions[].

## PRIORITY ORDER (within actions array — list in this order)

1. kiln parameters (highest thermal risk)
2. press parameters
3. dryer parameters
4. glaze parameters
5. printer parameters
6. sorting parameters
7. packaging parameters
8. conveyor parameters

Within the same station, list parameters that are FURTHEST from midpoint first.

## CHAT MESSAGE GUIDELINES

- 1–2 sentences maximum
- Use emojis: 🔧 correction, ✅ healthy, ⚠️ escalation
- Use display names: "Max Kiln Temperature" not "max_temperature_c"
- Include numbers: current → target
- For single correction: "🔧 Correcting [name] from [val] to [target] — [reason]."
- For multiple corrections: "🔧 Applying [N] corrections: [brief summary of stations affected]."
- For skip: "✅ Factory is operating within normal parameters."
- For escalate: "⚠️ [Machine] OEE is low but root cause is unclear. Please review manually."

## REFERENCE JSON (safe ranges and correction midpoints for all parameters)

\`\`\`json
${referenceJSONStr}
\`\`\`

## RESPONSE FORMAT (STRICT — respond with ONLY this JSON, no markdown, no backticks, no preamble)

{
  "decision": "skip" | "correct" | "escalate",
  "severity": "low" | "medium" | "high" | "critical",
  "reasoning": "Brief technical reasoning (1-2 sentences)",
  "chat_message": "Human-readable CWF chat message",
  "actions": [
    {
      "station": "station_name",
      "parameter": "parameter_column_name",
      "current_value": 123.4,
      "target_value": 456.7,
      "reason": "One-line correction reason"
    }
  ]
}

RESPOND WITH ONLY THE JSON OBJECT. NO MARKDOWN. NO BACKTICKS. NO PREAMBLE.`;
}

// =============================================================================
// PER-CYCLE USER MESSAGE BUILDER
// =============================================================================

/**
 * Build the per-cycle user message from the current state JSON.
 *
 * This is called every evaluation cycle and sent via chatSession.sendMessage().
 * Gemini compares these readings against the reference JSON (already in its
 * system prompt) and returns the complete correction plan.
 *
 * @param stateJSON - Current factory state snapshot
 * @returns JSON string to send as the Gemini user message
 */
export function buildCopilotUserMessage(stateJSON: CopilotStateJSON): string {
    /** Serialise compactly — Gemini parses JSON reliably */
    return JSON.stringify(stateJSON, null, 2);
}

// =============================================================================
// RESPONSE PARSER
// =============================================================================

/**
 * Parse and validate the JSON response from Gemini.
 *
 * Handles common Gemini quirks: markdown code fences, extra whitespace,
 * occasional preamble text before the JSON object.
 *
 * Validates:
 *   - Required top-level fields exist
 *   - decision / severity are valid enum values
 *   - actions[] is an array
 *   - Each action has required fields with finite numeric values
 *   - decision='correct' implies actions.length >= 1
 *
 * @param rawText - Raw text response from Gemini
 * @returns Parsed and validated CopilotGeminiResponse, or null if invalid
 */
export function parseCopilotResponse(rawText: string): CopilotGeminiResponse | null {
    try {
        let cleaned = rawText.trim();

        /** Strip markdown code fences if Gemini wrapped the JSON (common quirk) */
        if (cleaned.startsWith('```')) {
            cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
        }

        /**
         * Strip any preamble text before the opening brace.
         * Some Gemini models occasionally prefix with "Here is my response:" etc.
         */
        const jsonStart = cleaned.indexOf('{');
        if (jsonStart > 0) {
            cleaned = cleaned.substring(jsonStart);
        }

        /** Parse the JSON */
        const parsed = JSON.parse(cleaned);

        /** Validate required top-level fields */
        if (!parsed.decision || !parsed.severity || !parsed.reasoning || !parsed.chat_message) {
            console.error('[Copilot] ❌ Missing required fields in Gemini response:', parsed);
            return null;
        }

        /** Validate decision enum */
        if (!['skip', 'correct', 'escalate'].includes(parsed.decision)) {
            console.error('[Copilot] ❌ Invalid decision value:', parsed.decision);
            return null;
        }

        /** Validate severity enum */
        if (!['low', 'medium', 'high', 'critical'].includes(parsed.severity)) {
            console.error('[Copilot] ❌ Invalid severity value:', parsed.severity);
            return null;
        }

        /** Normalise actions: ensure it is always an array */
        if (!Array.isArray(parsed.actions)) {
            /** Handle old-style single action object (graceful degradation) */
            if (parsed.action && typeof parsed.action === 'object') {
                console.warn('[Copilot] ⚠️ Gemini returned old single-action format — converting to actions[]');
                parsed.actions = [parsed.action];
                delete parsed.action;
            } else {
                /** Default to empty array for skip/escalate */
                parsed.actions = [];
            }
        }

        /** Validate each action entry */
        for (let i = 0; i < parsed.actions.length; i++) {
            const a = parsed.actions[i];
            if (!a.station || !a.parameter ||
                !Number.isFinite(a.current_value) ||
                !Number.isFinite(a.target_value)) {
                console.error(`[Copilot] ❌ Action[${i}] has invalid fields:`, a);
                /** Remove invalid action rather than rejecting the whole response */
                parsed.actions.splice(i, 1);
                i--;
            }
        }

        /** If decision is 'correct' but actions[] is empty, something went wrong */
        if (parsed.decision === 'correct' && parsed.actions.length === 0) {
            console.warn('[Copilot] ⚠️ Decision is "correct" but actions[] is empty — treating as escalate');
            parsed.decision = 'escalate';
        }

        return parsed as CopilotGeminiResponse;

    } catch (err) {
        console.error('[Copilot] ❌ Failed to parse Gemini JSON response:', err);
        console.error('[Copilot] Raw response was:', rawText.substring(0, 500));
        return null;
    }
}
