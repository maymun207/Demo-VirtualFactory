/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * CWF DEMO CHAT — Dedicated endpoint for the demo engine's ariaApi calls
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * POST /api/cwf/demo-chat
 *
 * Purpose-built for speed: slim system prompt, 2 tools, 4-loop cap,
 * no knowledge base, no copilot state machine, no auth flows.
 *
 * The demo engine injects ARIA's personality, quality model guardrails,
 * and per-act narrative context via the conversationHistory field.
 * This endpoint only provides DB knowledge (schema, ranges) and
 * speed instructions for Gemini.
 *
 * Architecture: This is a SEPARATE endpoint from /api/cwf/chat.
 * The main chat.ts continues to handle interactive CWF panel queries,
 * copilot enable/disable, parameter changes, and all other CWF functionality.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
    GoogleGenerativeAI,
    SchemaType,
    type FunctionDeclaration,
    type Content,
    type Part,
} from '@google/generative-ai';
import { createClient } from '@supabase/supabase-js';
// Shared parameter ranges — single source of truth
import { generateSchemaRangesText, generateSafeRangesText } from './cwfParameterRanges.js';

// =============================================================================
// CONSTANTS
// =============================================================================

/** Gemini model — same as main CWF for consistency */
const MODEL_NAME = 'gemini-2.5-flash';

/** Max tool-use loops — aggressively low for speed */
const MAX_LOOPS = 4;

/** Max retries when Gemini returns empty */
const MAX_EMPTY_RETRIES = 1;

/** Retry delay */
const RETRY_DELAY_MS = 800;

/** Fallback responses */
const FALLBACK_EN = '⚠️ I could not generate a complete answer. Please try again.';
const FALLBACK_TR = '⚠️ Tam bir yanıt oluşturamadım. Lütfen tekrar deneyin.';

/** Force-summary prompt when loop cap is hit */
const FORCE_SUMMARY = 'You have reached the tool call limit. Answer NOW using the data you already have. Maximum 4 sentences. Lead with the number.';

// =============================================================================
// ENVIRONMENT & CLIENTS
// =============================================================================

const GEMINI_API_KEY = process.env.GEMINI_API_KEY!;
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// =============================================================================
// DB SCHEMA (SLIM VERSION — demo-relevant tables only)
// =============================================================================

const DB_SCHEMA_DEMO = `
## DATABASE SCHEMA — Ceramic Tile Production Line Simulator (Demo Subset)

### Core Tables:

**simulation_sessions** — Each simulation run
- id (UUID PK), session_code (VARCHAR 6-char unique), name, description
- tick_duration_ms, production_tick_ratio, station_gap_production_ticks
- status (created|running|paused|completed|aborted)
- current_sim_tick, current_production_tick
- target_tiles_per_hour, target_first_quality_pct
- started_at, completed_at, created_at, updated_at

**tiles** — Every tile produced
- id (UUID PK), simulation_id (FK), tile_number (SERIAL)
- created_at_sim_tick, created_at_production_tick, completed_at_sim_tick
- status (in_production|scrapped_at_press|scrapped_at_dryer|scrapped_at_glaze|scrapped_at_printer|scrapped_at_kiln|sorted|packaged|completed)
- current_station (press|dryer|glaze|printer|kiln|sorting|packaging)
- final_grade (first_quality|second_quality|third_quality|scrap|pending)
- width_mm, height_mm, thickness_mm, weight_g

### Machine State Tables (one per station, all share base columns):
Base columns: id, simulation_id, sim_tick, production_tick, is_operating, fault_code, created_at
UNIQUE constraint on each: (simulation_id, sim_tick)

${generateSchemaRangesText()}

### Tile Tracking:

**tile_station_snapshots** — Snapshot when tile passes each station
- tile_id (FK), simulation_id (FK), station, station_order (1-7)
- entry_sim_tick, entry_production_tick, exit_sim_tick, processing_duration_ticks
- machine_state_id (FK to respective machine table)
- parameters_snapshot (JSONB — denormalized machine params)
- tile_measurements (JSONB)
- defect_detected (BOOL), defect_types (defect_type[]), defect_severity (0-1), scrapped_here (BOOL)

### OEE & Metrics:

**oee_snapshots** — Periodic hierarchical OEE snapshots (inserted every ~10s while running)
- simulation_id (FK), sim_tick, elapsed_minutes
- Station counts: press_spawned, press_output, dryer_output, glaze_output, digital_output, kiln_input, kiln_output, sorting_usable_output, packaging_output, conveyor_clean_output, theoretical_a, theoretical_b
- Machine OEEs (0-100): moee_press, moee_dryer, moee_glaze, moee_digital, moee_conveyor, moee_kiln, moee_sorting, moee_packaging
- Line OEEs (0-100): loee_line1 (press→printer), loee_line2 (conveyor), loee_line3 (kiln→packaging)
- Factory OEE: foee (0-100), bottleneck ('A' press-limited or 'B' kiln-limited)
- Energy totals: energy_total_kwh, energy_total_gas, energy_total_co2, energy_kwh_per_tile
- Per-station energy: energy_press_kwh, energy_dryer_kwh, energy_glaze_kwh, energy_digital_kwh, energy_conveyor_kwh, energy_kiln_kwh, energy_sorting_kwh, energy_packaging_kwh, energy_dryer_gas, energy_kiln_gas

**telemetry** — Per-simulation time-series telemetry (machine metrics per tick)
- machine_id ('press'|'dryer'|'glaze'|'printer'|'kiln'|'sorting'|'packaging'|'conveyor'|'factory')
- simulation_id (FK), s_clock (INTEGER — sim tick), p_clock (INTEGER — production tick)
- status, conveyor_speed
- oee, ftq, scrap_rate, energy_kwh, gas_m3, co2_kg (only on machine_id='factory')
- UNIQUE constraint on (machine_id, simulation_id, s_clock)

**conveyor_states** — Per-tick conveyor snapshots (speed, status, fault_count)

**simulation_events** — State transitions during simulation
- simulation_id (FK), sim_tick, event_type ('started'|'stopped'|'drain_started'|'drain_completed'|'force_stopped'|'resumed'|'reset'|'work_order_completed')
- details (JSONB), created_at

### Defect Types (enum):
Press: crack_press, delamination, dimension_variance, density_variance, edge_defect, press_explosion
Dryer: surface_crack_dry, warp_dry, explosion_dry
Glaze: color_tone_variance, glaze_thickness_variance, pinhole_glaze, glaze_drip, line_defect_glaze, edge_buildup
Printer: line_defect_print, white_spot, color_shift, saturation_variance, blur, pattern_stretch, pattern_compress
Kiln: crack_kiln, warp_kiln, corner_lift, pinhole_kiln, color_fade, size_variance_kiln, thermal_shock_crack
Packaging: chip, edge_crack_pack, crush_damage

### EXAMPLE SQL QUERIES:

**Defect root cause — which stations are causing defects?**
SELECT tss.station, COUNT(*) as defect_count, array_agg(DISTINCT unnest_dt) as defect_types
FROM tile_station_snapshots tss
CROSS JOIN LATERAL unnest(tss.defect_types) AS unnest_dt
WHERE tss.simulation_id = '<session_id>' AND tss.defect_detected = true
GROUP BY tss.station ORDER BY defect_count DESC

**OEE trend over time:**
SELECT sim_tick, foee, moee_press, moee_kiln, moee_conveyor, loee_line1, loee_line2, loee_line3
FROM oee_snapshots WHERE simulation_id = '<session_id>' ORDER BY sim_tick

**Energy consumption by station:**
SELECT energy_total_kwh, energy_kwh_per_tile, energy_press_kwh, energy_kiln_kwh, energy_total_co2
FROM oee_snapshots WHERE simulation_id = '<session_id>' ORDER BY sim_tick DESC LIMIT 1

### SAFE RANGES — Compare actual values against these to find deviations:

${generateSafeRangesText()}
`;

// =============================================================================
// SYSTEM PROMPT
// =============================================================================

/**
 * Build the slim demo system prompt (~2,000 tokens).
 * Contains DB schema, speed rules, and language instructions only.
 * ARIA personality, quality model, and narrative context are injected
 * by the client via conversationHistory.
 */
function buildDemoSystemPrompt(language: 'tr' | 'en'): string {
    const langInstructions = language === 'tr'
        ? `LANGUAGE: Respond in Turkish (Türkçe). Use Turkish manufacturing terminology.
           If the user writes in English, still respond in Turkish unless they explicitly ask for English.`
        : `LANGUAGE: Respond in English. Use standard manufacturing and engineering terminology.
           If the user writes in Turkish, still respond in English unless they explicitly ask for Turkish.`;

    return `You are the data engine behind ARIA, the demo AI guide for a ceramic tile production line digital twin simulator.

${langInstructions}

${DB_SCHEMA_DEMO}

══════════════════════════════════════════════════════════════
DEMO ENGINE RESPONSE RULES — STRICT
══════════════════════════════════════════════════════════════
The ARIA personality and narrative context are provided in the conversation history —
you do NOT need to add personality or narrative framing. Your job: query the database,
calculate the answer, and return it clearly.

PREFER get_simulation_summary as your primary data source. It returns
session info, tile counts by grade, active scenario, latest OEE snapshot
(all 8 machine OEEs, 3 line OEEs, factory OEE), energy totals, and
recent events. Only call query_database if get_simulation_summary does
not contain the specific data point requested.

MAXIMUM 2 tool calls before generating your response. After 2 calls,
use whatever data you have. Estimate if needed. State confidence.

MAXIMUM 5 sentences. Lead with the key number or finding.

No preambles ("Let me analyze...", "Based on the data...").
Start with the answer.

Round numbers to 1 decimal place. Use € for monetary values.
Use metric units. Use percentage for rates.

If the simulation just started and data is sparse, say so briefly
and give your best estimate based on available data. Do NOT refuse
to answer or say "insufficient data."

When querying with query_database, ALWAYS filter by simulation_id.
Never query across sessions.

NEVER expose database internals (table names, column names, SQL queries).
Speak in manufacturing language. If you cannot find data, say
"this information is not available for this session."
`;
}

// =============================================================================
// TOOL DEFINITIONS (only 2)
// =============================================================================

const tools: FunctionDeclaration[] = [
    {
        name: 'query_database',
        description:
            'Execute a READ-ONLY SQL query against the PostgreSQL database. ' +
            'Use this to retrieve simulation data, machine states, tile information, defects, metrics. ' +
            'ONLY SELECT statements allowed. Always filter by simulation_id. ' +
            'Use LIMIT to keep result sets manageable (max 100 rows unless aggregating). ' +
            'Prefer aggregation (COUNT, AVG, SUM, GROUP BY) over raw rows. ' +
            'Do NOT include a trailing semicolon.',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                sql: {
                    type: SchemaType.STRING,
                    description: 'The SELECT SQL query to execute. Must be read-only.',
                },
                description: {
                    type: SchemaType.STRING,
                    description: 'Brief description of what this query retrieves.',
                },
            },
            required: ['sql', 'description'],
        },
    },
    {
        name: 'get_simulation_summary',
        description:
            'Get a quick overview of a simulation session: status, tile counts by grade, ' +
            'active scenario, latest OEE (all 8 machines, 3 lines, factory), and energy totals. ' +
            'Use this as your FIRST tool call — it provides most data points in one call.',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                simulation_id: {
                    type: SchemaType.STRING,
                    description: 'UUID of the simulation session to summarize.',
                },
            },
            required: ['simulation_id'],
        },
    },
];

// =============================================================================
// TOOL EXECUTION FUNCTIONS
// =============================================================================

/**
 * Execute a read-only SQL query via the Supabase `execute_readonly_query` RPC.
 * Server-side validation: SELECT/WITH only, 10s timeout, 500-row cap.
 */
async function executeQuery(
    sql: string
): Promise<{ data: unknown; error: string | null }> {
    const cleanedSql = sql.trim().replace(/;+\s*$/, '');

    // Client-side safety: block non-SELECT statements
    const normalized = cleanedSql.toUpperCase();
    if (!normalized.startsWith('SELECT') && !normalized.startsWith('WITH')) {
        return {
            data: null,
            error: 'Only SELECT/WITH (read-only) queries are allowed.',
        };
    }

    // Block dangerous keywords
    const dangerous = [
        'INSERT', 'UPDATE', 'DELETE', 'DROP', 'ALTER',
        'TRUNCATE', 'CREATE', 'GRANT', 'REVOKE',
    ];
    for (const keyword of dangerous) {
        const regex = new RegExp(`\\b${keyword}\\b`, 'i');
        if (regex.test(cleanedSql)) {
            return { data: null, error: `Forbidden keyword: ${keyword}` };
        }
    }

    try {
        const { data, error } = await supabase.rpc('execute_readonly_query', {
            query_text: cleanedSql,
        });

        if (error) {
            return { data: null, error: error.message };
        }

        return { data, error: null };
    } catch (err) {
        return {
            data: null,
            error: `Query execution failed: ${(err as Error).message}`,
        };
    }
}

/**
 * Get a simplified simulation summary via Supabase RPC + latest OEE snapshot.
 * No fallback path — if RPC fails, return the error directly.
 */
async function getDemoSummary(
    simulationId: string
): Promise<object> {
    const { data: rpcData, error: rpcError } = await supabase.rpc(
        'get_simulation_stats',
        { p_simulation_id: simulationId }
    );

    if (rpcError) {
        return { error: `Simulation stats RPC failed: ${rpcError.message}` };
    }

    // Augment with latest OEE snapshot (not included in get_simulation_stats)
    const { data: oeeData } = await supabase
        .from('oee_snapshots')
        .select(
            'foee, loee_line1, loee_line2, loee_line3, ' +
            'moee_press, moee_dryer, moee_glaze, moee_digital, ' +
            'moee_conveyor, moee_kiln, moee_sorting, moee_packaging, ' +
            'energy_total_kwh, energy_total_co2, energy_kwh_per_tile, sim_tick'
        )
        .eq('simulation_id', simulationId)
        .order('sim_tick', { ascending: false })
        .limit(1)
        .maybeSingle();

    return { ...rpcData, latest_oee: oeeData ?? null };
}

// =============================================================================
// MAIN REQUEST HANDLER
// =============================================================================

/**
 * Vercel serverless function handler for POST /api/cwf/demo-chat.
 *
 * Receives a user message from the demo engine's ariaApi,
 * runs Gemini with a slim prompt and 2 tools, and returns the response.
 */
export default async function handler(
    req: VercelRequest,
    res: VercelResponse
) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const {
            message,
            simulationId,
            sessionCode = '',
            conversationHistory = [],
            language = 'en',
            // ── Future-proof fields (accepted but not yet used in v1) ──
            actId: _actId,
            scenarioCode: _scenario,
            responseHint: _hint,
        } = req.body as {
            message: string;
            simulationId: string;
            sessionCode?: string;
            conversationHistory?: Array<{ role: string; content: string }>;
            language?: string;
            actId?: string;
            scenarioCode?: string;
            responseHint?: string;
        };

        if (!message || !simulationId) {
            return res.status(400).json({
                error: 'message and simulationId are required',
            });
        }

        const lang = (language === 'tr' ? 'tr' : 'en') as 'tr' | 'en';

        console.log(`[CWF-Demo] Request — lang: ${lang}, simId: ${simulationId.slice(0, 8)}…, sessionCode: ${sessionCode}, msg length: ${message.length}`);

        // =================================================================
        // Build Gemini conversation from client-provided history + message
        // =================================================================
        const contents: Content[] = [
            ...conversationHistory.map(
                (msg: { role: string; content: string }) => ({
                    role: msg.role === 'user' ? ('user' as const) : ('model' as const),
                    parts: [{ text: msg.content }] as Part[],
                })
            ),
            {
                role: 'user' as const,
                parts: [
                    {
                        text: `[Active simulation_id: ${simulationId}, session_code: ${sessionCode}]\n\n${message}`,
                    },
                ] as Part[],
            },
        ];

        // =================================================================
        // Initialize Gemini with slim system prompt and 2 tools
        // =================================================================
        const model = genAI.getGenerativeModel({
            model: MODEL_NAME,
            systemInstruction: buildDemoSystemPrompt(lang),
            tools: [{ functionDeclarations: tools }],
        });

        const chat = model.startChat({
            history: contents.slice(0, -1),
        });

        // Send the latest user message
        let response = await chat.sendMessage(
            contents[contents.length - 1].parts
        );
        let result = response.response;
        let loopCount = 0;

        // =================================================================
        // AGENT TOOL-USE LOOP (max MAX_LOOPS iterations)
        // =================================================================
        while (loopCount < MAX_LOOPS) {
            const candidate = result.candidates?.[0];
            if (!candidate) break;

            const functionCalls = (candidate.content?.parts ?? []).filter(
                (part) => 'functionCall' in part
            );

            if (functionCalls.length === 0) break;

            const functionResponses: Part[] = [];

            for (const part of functionCalls) {
                if (!('functionCall' in part)) continue;
                const { name, args } = part.functionCall!;
                const typedArgs = args as Record<string, unknown>;

                let toolResult: unknown;

                switch (name) {
                    case 'query_database':
                        toolResult = await executeQuery(typedArgs.sql as string);
                        break;
                    case 'get_simulation_summary':
                        // ALWAYS use server's authoritative simulationId
                        toolResult = await getDemoSummary(simulationId);
                        break;
                    default:
                        toolResult = { error: `Unknown tool: ${name}` };
                }

                functionResponses.push({
                    functionResponse: {
                        name,
                        response: { result: toolResult },
                    },
                } as Part);
            }

            response = await chat.sendMessage(functionResponses);
            result = response.response;
            loopCount++;

            console.log(`[CWF-Demo] Tool loop ${loopCount}/${MAX_LOOPS} — ${functionCalls.length} call(s)`);
        }

        // =================================================================
        // Force summary if loop cap hit and Gemini still wants tools
        // =================================================================
        const lastCandidate = result.candidates?.[0];
        const stillWantsTools = (lastCandidate?.content?.parts ?? []).some(
            (part) => 'functionCall' in part
        );

        if (stillWantsTools) {
            console.log('[CWF-Demo] Loop cap hit — forcing summary');
            response = await chat.sendMessage([{ text: FORCE_SUMMARY }]);
            result = response.response;
        }

        // =================================================================
        // Extract text (filter out Gemini 2.5 thinking parts)
        // =================================================================
        const extractedText = (result.candidates?.[0]?.content.parts ?? [])
            .filter((part): part is { text: string } => {
                if (!('text' in part)) return false;
                if ('thought' in part && (part as Record<string, unknown>).thought === true) return false;
                return true;
            })
            .map((part) => part.text)
            .join('\n');

        const finishReason = result.candidates?.[0]?.finishReason ?? 'UNKNOWN';
        console.log(`[CWF-Demo] Final — text length: ${extractedText.trim().length}, loops: ${loopCount}, finishReason: ${finishReason}`);

        // =================================================================
        // Retry once if empty response
        // =================================================================
        if (extractedText.trim().length === 0) {
            console.log('[CWF-Demo] ⚠️ Empty response — retrying in same chat');

            for (let retry = 1; retry <= MAX_EMPTY_RETRIES; retry++) {
                await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * retry));

                try {
                    const retryPrompt = lang === 'tr'
                        ? 'Topladığın tüm verileri kullanarak şimdi cevap ver. Araç çağrısı yapma. Kısa ve net bir özet yaz.'
                        : 'Answer NOW using all the data you already collected. Do NOT call any tools. Write a clear, concise summary with the actual numbers.';

                    const retryResponse = await chat.sendMessage([{ text: retryPrompt }]);
                    const retryResult = retryResponse.response;

                    const retryText = (retryResult.candidates?.[0]?.content.parts ?? [])
                        .filter((part): part is { text: string } => {
                            if (!('text' in part)) return false;
                            if ('thought' in part && (part as Record<string, unknown>).thought === true) return false;
                            return true;
                        })
                        .map((part) => part.text)
                        .join('\n');

                    if (retryText.trim().length > 0) {
                        console.log(`[CWF-Demo] ✅ Retry ${retry} succeeded`);
                        return res.status(200).json({
                            response: retryText,
                            toolCallCount: loopCount,
                        });
                    }
                } catch (retryErr) {
                    console.warn(`[CWF-Demo] Retry ${retry} failed:`, (retryErr as Error).message);
                }
            }

            console.log('[CWF-Demo] ❌ All retries exhausted — returning fallback');
        }

        // =================================================================
        // Return response
        // =================================================================
        const fallback = lang === 'tr' ? FALLBACK_TR : FALLBACK_EN;
        const finalText = extractedText.trim() ? extractedText : fallback;

        return res.status(200).json({
            response: finalText,
            toolCallCount: loopCount,
        });
    } catch (error) {
        console.error('[CWF-Demo] Error:', error);
        const errorMessage = (error as Error).message;

        let userMessage = errorMessage;
        if (errorMessage.includes('API key')) {
            userMessage = 'Gemini API authentication failed. Check the API key.';
        } else if (errorMessage.includes('quota') || errorMessage.includes('429')) {
            userMessage = 'Rate limit reached. Please wait and try again.';
        } else if (errorMessage.includes('timeout')) {
            userMessage = 'Request timed out. Try a simpler question.';
        }

        return res.status(500).json({
            error: userMessage,
            details: process.env.NODE_ENV === 'development' ? errorMessage : undefined,
        });
    }
}
