/**
 * copilotPrompt.ts — Gemini System Prompt for CWF Copilot Autonomous Decisions
 *
 * Builds the specialised system prompt that the CWF Copilot engine sends to
 * Gemini on each evaluation cycle. Unlike the interactive CWF prompt (which
 * expects conversational responses), this prompt instructs Gemini to return
 * **structured JSON** with a decision, reasoning, and optional corrective action.
 *
 * The prompt includes:
 *   - Role definition (autonomous factory supervisor, not a chatbot)
 *   - Decision taxonomy (skip / correct / escalate)
 *   - Safety rules (one action per cycle, midpoint correction strategy)
 *   - Full parameter range reference (copied from cwfParameterRanges.ts)
 *   - JSON response format specification
 *   - Human-readable chat message requirement
 *
 * Used by: api/cwf/copilotEngine.ts
 *
 * Dependencies:
 *   - api/cwf/cwfParameterRanges.ts (CWF_PARAM_RANGES — mirrors src/lib/params)
 */

import { PARAMETER_RANGES } from '../../src/lib/params/parameterRanges.js';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Shape of the structured JSON response expected from Gemini.
 * The copilot engine parses this and acts on the decision.
 */
export interface CopilotGeminiResponse {
    /** Decision outcome: skip (healthy), correct (fix one param), escalate (human review) */
    decision: 'skip' | 'correct' | 'escalate';
    /** Severity assessment of the current factory state */
    severity: 'low' | 'medium' | 'high' | 'critical';
    /** Brief technical reasoning for the decision (for audit trail) */
    reasoning: string;
    /** Human-readable message to display in the CWF chat panel with emoji */
    chat_message: string;
    /** Corrective action details — null when decision is 'skip' or 'escalate' */
    action: {
        /** Station name (e.g., 'kiln', 'press', 'dryer') */
        station: string;
        /** Parameter column name (e.g., 'max_temperature_c') */
        parameter: string;
        /** Current value of the parameter (from latest machine state) */
        current_value: number;
        /** Target value to correct to (should be midpoint of safe range) */
        new_value: number;
        /** Brief reason for this specific correction */
        reason: string;
    } | null;
}

// =============================================================================
// PARAMETER RANGES — formatted for the prompt
// =============================================================================

/**
 * Build a human-readable parameter range reference for the Gemini prompt.
 * Lists every station and every parameter with its min/max safe range,
 * so Gemini can identify out-of-range values and calculate midpoints.
 *
 * @returns Formatted string with all parameter ranges for prompt injection
 */
function buildParameterRangeReference(): string {
    /** Collect formatted lines for each station's parameters */
    const lines: string[] = [];

    for (const [station, params] of Object.entries(PARAMETER_RANGES)) {
        /** Station header */
        lines.push(`### ${station.toUpperCase()}`);

        for (const [param, range] of Object.entries(params)) {
            /** Calculate the midpoint — this is the correction target */
            const typedRange = range as { min: number; max: number };
            const midpoint = ((typedRange.min + typedRange.max) / 2).toFixed(1);

            /** Format: "  - parameter_name: [min – max], midpoint = X" */
            lines.push(`  - ${param}: [${typedRange.min} – ${typedRange.max}], midpoint = ${midpoint}`);
        }

        /** Blank line between stations for readability */
        lines.push('');
    }

    return lines.join('\n');
}

// =============================================================================
// SYSTEM PROMPT BUILDER
// =============================================================================

/**
 * Build the complete Gemini system prompt for a copilot evaluation cycle.
 *
 * @param cooldownSec - Current cooldown setting in seconds
 * @param recentlyCorrectedParams - List of "station.parameter" strings that are
 *                                   currently in cooldown (recently corrected)
 * @returns Complete system prompt string for Gemini
 */
export function buildCopilotSystemPrompt(
    cooldownSec: number,
    recentlyCorrectedParams: string[],
): string {
    /** Pre-build the parameter range reference (all stations + params) */
    const paramRanges = buildParameterRangeReference();

    /** Format the cooldown list for the prompt */
    const cooldownList = recentlyCorrectedParams.length > 0
        ? recentlyCorrectedParams.map(p => `  - ${p}`).join('\n')
        : '  (none — all parameters are eligible for correction)';

    return `You are the AUTONOMOUS FACTORY SUPERVISOR for a ceramic tile production line digital twin.
You are NOT chatting with a human — you are making real-time autonomous decisions.

YOUR SINGLE JOB: Analyze the metrics snapshot below and decide what to do.

## DECISION OPTIONS

1. **SKIP** — Factory is healthy. All parameters are within safe ranges and OEE is acceptable.
   Only use this when there is genuinely nothing wrong.

2. **CORRECT** — One parameter is out of safe range or causing quality/performance degradation.
   You may correct EXACTLY ONE parameter per evaluation cycle.
   Always correct to the MIDPOINT of the safe range (most stable operating point).

3. **ESCALATE** — Multiple critical issues detected simultaneously, or a parameter is so far
   out of range that autonomous correction might cause abrupt production changes.
   Flag this for the human operator's attention.

## SAFETY RULES (MANDATORY — VIOLATING THESE IS A CRITICAL FAILURE)

1. You may correct EXACTLY ONE parameter per evaluation cycle. Never two. Never zero-and-then-recommend.
2. Always correct to the MIDPOINT of the safe range for that parameter.
3. NEVER correct a parameter that is currently in cooldown (listed below).
4. NEVER set a value outside the safe range — the new_value MUST be the range midpoint.
5. If FOEE is above the alarm threshold AND all parameters are in range → decision MUST be "skip".

## PRIORITY ORDER (when multiple parameters are out of range)

Correct the MOST IMPACTFUL parameter first, using this priority:
1. KILN parameters — highest safety risk (thermal shock, energy waste)
2. PRESS parameters — structural quality (cracks, lamination)
3. DRYER parameters — moisture-related defects (explosions, warping)
4. GLAZE parameters — coating quality (pinholes, drips)
5. PRINTER parameters — decoration quality (lines, blur)
6. SORTING parameters — detection calibration
7. PACKAGING parameters — handling damage

Within the same station, prioritise parameters that are furthest from their midpoint.

## PARAMETERS IN COOLDOWN (recently corrected — DO NOT touch these)
${cooldownList}

Cooldown period: ${cooldownSec} seconds per parameter after correction.

## SAFE PARAMETER RANGES (with midpoints)
${paramRanges}

## CHAT MESSAGE GUIDELINES

The chat_message field will be displayed to the factory operator in the CWF chat panel.
- Use 1–2 sentences maximum
- Include relevant emojis (🔧 for correction, ✅ for healthy, ⚠️ for escalation)
- Mention the SPECIFIC parameter using its DISPLAY NAME (not the column name)
  Examples: "Max Kiln Temperature" not "max_temperature_c", "Press Pressure" not "pressure_bar"
- Include actual numbers: current value → new value
- For SKIP: "✅ Factory is operating within normal parameters."
- For CORRECT: "🔧 Correcting [Display Name] from [old] to [new] — was outside safe range [min–max]."
- For ESCALATE: "⚠️ Multiple parameters are out of range. Please review [list]. Copilot is standing by."

## RESPONSE FORMAT (STRICT — respond with ONLY this JSON, no markdown, no backticks, no preamble)

{
  "decision": "skip" | "correct" | "escalate",
  "severity": "low" | "medium" | "high" | "critical",
  "reasoning": "Brief technical reasoning for the decision (1-2 sentences)",
  "chat_message": "Human-readable message for the CWF chat panel",
  "action": null | {
    "station": "station_name",
    "parameter": "parameter_column_name",
    "current_value": 123.4,
    "new_value": 456.7,
    "reason": "Brief reason for this correction"
  }
}

RESPOND WITH ONLY THE JSON OBJECT. NO MARKDOWN. NO BACKTICKS. NO PREAMBLE.`;
}

// =============================================================================
// METRICS SNAPSHOT BUILDER
// =============================================================================

/**
 * Build the user-message content for a copilot evaluation cycle.
 * This is the "question" sent alongside the system prompt, containing
 * the live factory metrics that Gemini must evaluate.
 *
 * @param foee - Current Factory OEE percentage
 * @param machineOees - Map of machine name → OEE percentage
 * @param outOfRangeParams - List of parameters currently outside safe range
 * @param alarmCount - Number of active alarms
 * @param simTick - Current simulation tick
 * @returns Formatted metrics string for the Gemini user message
 */
export function buildMetricsSnapshot(
    foee: number,
    machineOees: Record<string, number>,
    outOfRangeParams: Array<{
        station: string;
        parameter: string;
        current_value: number;
        min: number;
        max: number;
    }>,
    alarmCount: number,
    simTick: number,
): string {
    /** Format machine OEEs as a bulleted list */
    const oeeLines = Object.entries(machineOees)
        .map(([machine, oee]) => `  - ${machine}: ${oee.toFixed(1)}%`)
        .join('\n');

    /** Format out-of-range params with their current vs safe range */
    const paramLines = outOfRangeParams.length > 0
        ? outOfRangeParams.map(p => {
            const midpoint = ((p.min + p.max) / 2).toFixed(1);
            return `  - ${p.station}.${p.parameter}: current=${p.current_value}, safe=[${p.min}–${p.max}], midpoint=${midpoint}`;
        }).join('\n')
        : '  (all parameters within safe ranges)';

    return `## FACTORY METRICS SNAPSHOT (Tick ${simTick})

### Factory OEE: ${foee.toFixed(1)}%

### Machine OEEs:
${oeeLines}

### Out-of-Range Parameters:
${paramLines}

### Active Alarms: ${alarmCount}

Evaluate these metrics and respond with your decision.`;
}

// =============================================================================
// RESPONSE PARSER
// =============================================================================

/**
 * Parse and validate the JSON response from Gemini.
 * Handles common Gemini quirks: markdown wrapping, extra whitespace, etc.
 *
 * @param rawText - Raw text response from Gemini
 * @returns Parsed and validated CopilotGeminiResponse, or null if invalid
 */
export function parseCopilotResponse(rawText: string): CopilotGeminiResponse | null {
    try {
        /** Strip markdown code fences if Gemini wrapped the JSON */
        let cleaned = rawText.trim();

        /** Remove ```json ... ``` wrapping */
        if (cleaned.startsWith('```')) {
            cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
        }

        /** Parse the JSON */
        const parsed = JSON.parse(cleaned);

        /** Validate required fields exist */
        if (!parsed.decision || !parsed.severity || !parsed.reasoning || !parsed.chat_message) {
            console.error('[Copilot] ❌ Missing required fields in Gemini response:', parsed);
            return null;
        }

        /** Validate decision is one of the allowed values */
        if (!['skip', 'correct', 'escalate'].includes(parsed.decision)) {
            console.error('[Copilot] ❌ Invalid decision value:', parsed.decision);
            return null;
        }

        /** Validate severity is one of the allowed values */
        if (!['low', 'medium', 'high', 'critical'].includes(parsed.severity)) {
            console.error('[Copilot] ❌ Invalid severity value:', parsed.severity);
            return null;
        }

        /** If decision is 'correct', the action object must be present and valid */
        if (parsed.decision === 'correct') {
            if (!parsed.action || !parsed.action.station || !parsed.action.parameter ||
                !Number.isFinite(parsed.action.current_value) || !Number.isFinite(parsed.action.new_value)) {
                console.error('[Copilot] ❌ Decision is "correct" but action is invalid:', parsed.action);
                return null;
            }
        }

        return parsed as CopilotGeminiResponse;
    } catch (err) {
        console.error('[Copilot] ❌ Failed to parse Gemini JSON response:', err);
        console.error('[Copilot] Raw response was:', rawText.substring(0, 500));
        return null;
    }
}
