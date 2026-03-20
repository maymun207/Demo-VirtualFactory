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
 * The demo engine sends per-act narrative context via a dedicated
 * `narrativeContext` field (NOT via conversationHistory). This endpoint
 * builds ONE coherent systemInstruction containing: DB schema, quality
 * guardrail, response rules, and the act-specific narrative context.
 * conversationHistory contains only real user/assistant messages.
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
## DATABASE SCHEMA — Ceramic Tile Production Simulator (Slim)

### Core Tables:
simulation_sessions — Each simulation run (id UUID PK, session_code, status, current_sim_tick, started_at)
tiles — Every tile (id, simulation_id, tile_number, status, current_station, final_grade: first_quality|second_quality|scrap|pending)

### Machine State Tables (one per station, shared base columns):
Base: id, simulation_id, sim_tick, production_tick, is_operating, fault_code
UNIQUE: (simulation_id, sim_tick)

${generateSchemaRangesText()}

### Tile Tracking:

**tile_station_snapshots** — Snapshot when tile passes each station
- tile_id (FK), simulation_id (FK), station, station_order (1-7)
- entry_sim_tick, exit_sim_tick, processing_duration_ticks
- parameters_snapshot (JSONB), tile_measurements (JSONB)
- defect_detected (BOOL), defect_types (defect_type[]), defect_severity (0-1), scrapped_here (BOOL)

### OEE & Metrics:

**oee_snapshots** — Periodic hierarchical OEE snapshots (every ~10s while running)
- simulation_id (FK), sim_tick, elapsed_minutes
- Station counts: press_spawned, press_output, dryer_output, glaze_output, digital_output, kiln_input, kiln_output, sorting_usable_output, packaging_output, conveyor_clean_output, theoretical_a, theoretical_b
- Machine OEEs (0-100): moee_press, moee_dryer, moee_glaze, moee_digital, moee_conveyor, moee_kiln, moee_sorting, moee_packaging
- Line OEEs (0-100): loee_line1 (press→printer), loee_line2 (conveyor), loee_line3 (kiln→packaging)
- Factory OEE: foee (0-100), bottleneck ('A' press-limited or 'B' kiln-limited)
- Energy: energy_total_kwh, energy_total_gas, energy_total_co2, energy_kwh_per_tile
- Per-station energy: energy_press_kwh, energy_dryer_kwh, energy_glaze_kwh, energy_digital_kwh, energy_conveyor_kwh, energy_kiln_kwh, energy_sorting_kwh, energy_packaging_kwh, energy_dryer_gas, energy_kiln_gas

telemetry — Per-tick machine metrics (machine_id, simulation_id, s_clock, oee, ftq, scrap_rate, energy_kwh, co2_kg). UNIQUE: (machine_id, simulation_id, s_clock)
conveyor_states — Per-tick conveyor snapshots (speed, status, fault_count)
simulation_events — State transitions (event_type: started|stopped|drain_started|drain_completed|work_order_completed, sim_tick, details JSONB)

### Defect Types (enum):
Press: crack_press, delamination, dimension_variance, density_variance, edge_defect, press_explosion
Dryer: surface_crack_dry, warp_dry, explosion_dry
Glaze: color_tone_variance, glaze_thickness_variance, pinhole_glaze, glaze_drip, line_defect_glaze, edge_buildup
Printer: line_defect_print, white_spot, color_shift, saturation_variance, blur, pattern_stretch, pattern_compress
Kiln: crack_kiln, warp_kiln, corner_lift, pinhole_kiln, color_fade, size_variance_kiln, thermal_shock_crack
Packaging: chip, edge_crack_pack, crush_damage

### EXAMPLE QUERIES:

**Defect root cause:**
SELECT tss.station, COUNT(*) as defect_count, array_agg(DISTINCT unnest_dt) as defect_types
FROM tile_station_snapshots tss CROSS JOIN LATERAL unnest(tss.defect_types) AS unnest_dt
WHERE tss.simulation_id = '<session_id>' AND tss.defect_detected = true
GROUP BY tss.station ORDER BY defect_count DESC

**OEE trend:**
SELECT sim_tick, foee, moee_press, moee_kiln, loee_line1, loee_line2, loee_line3
FROM oee_snapshots WHERE simulation_id = '<session_id>' ORDER BY sim_tick

### SAFE RANGES — Compare actual values against these to find deviations:

${generateSafeRangesText()}
`;

// =============================================================================
// SYSTEM PROMPT
// =============================================================================

/**
 * Build the demo system prompt (~2,100 tokens).
 * Contains: DB schema, quality guardrail, response rules, language instructions,
 * and act-specific narrative context. Everything Gemini needs in ONE instruction.
 */
function buildDemoSystemPrompt(language: 'tr' | 'en', narrativeContext: string): string {
    const langInstructions = language === 'tr'
        ? `LANGUAGE: Respond in Turkish (Türkçe). Use Turkish manufacturing terminology.
           If the user writes in English, still respond in Turkish unless they explicitly ask for English.`
        : `LANGUAGE: Respond in English. Use standard manufacturing and engineering terminology.
           If the user writes in Turkish, still respond in English unless they explicitly ask for Turkish.`;

    return `You are the data engine behind ARIA, the demo AI guide for a ceramic tile production line digital twin simulator.

${langInstructions}

══════════════════════════════════════════════════════════════
QUALITY MODEL — IMMOVABLE GUARDRAIL
══════════════════════════════════════════════════════════════
The sorting station catches 100% of non-conforming tiles BEFORE
anything leaves the factory. Customer ALWAYS receives good tiles.

Three outcomes:
1. FIRST QUALITY → shipped to customer (only revenue-generating outcome)
2. SECOND QUALITY → rework facility (manufacturer pays 40-60% again)
3. SCRAP → 100% loss (materials + energy + labour, zero revenue)

NEVER imply defective tiles reach the customer. NEVER say "customer
complaint", "warranty claim", or "recall". Quality loss is entirely
internal — frame it as wasted cost, wasted energy, lost margin.

${DB_SCHEMA_DEMO}

══════════════════════════════════════════════════════════════
RESPONSE RULES
══════════════════════════════════════════════════════════════
Call get_simulation_summary FIRST. It has OEE, tiles, energy, scenario.
Only use query_database if get_simulation_summary lacks the specific data.
Maximum 2 tool calls. Then answer with what you have.
Maximum 5 sentences. Start with the key number.
Round to 1 decimal. € for money. % for rates. Metric units.
If data is sparse, estimate from available data. Never refuse to answer.
ALWAYS filter by simulation_id. Never query across sessions.
Never expose table names, column names, or SQL. Speak manufacturing language.
${narrativeContext ? `
══════════════════════════════════════════════════════════════
ACT-SPECIFIC NARRATIVE CONTEXT (from the demo engine)
══════════════════════════════════════════════════════════════
${narrativeContext}
` : ''}
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
            narrativeContext = '',
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
            narrativeContext?: string;
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

        console.log(`[CWF-Demo] Request — lang: ${lang}, simId: ${simulationId.slice(0, 8)}…, msg: ${message.length}c, narrative: ${narrativeContext.length}c`);

        // =================================================================
        // Build Gemini conversation from client-provided history + message
        // =================================================================

        /**
         * Gemini SDK hard rules for chat history:
         *   1. First entry MUST be role 'user' (not 'model')
         *   2. Entries must strictly alternate: user → model → user → model
         *   3. History passed to startChat must end with 'model'
         *      (sendMessage adds the next 'user' turn)
         *
         * After postToCWF stopped injecting a fake user/assistant seed,
         * conversationHistory can start with an assistant message (ARIA's
         * response from a prior step). We sanitize to prevent SDK errors.
         */
        const mappedHistory: Content[] = conversationHistory.map(
            (msg: { role: string; content: string }) => ({
                role: msg.role === 'user' ? ('user' as const) : ('model' as const),
                parts: [{ text: msg.content }] as Part[],
            })
        );

        // Drop leading 'model' entries until we find a 'user' entry
        while (mappedHistory.length > 0 && mappedHistory[0].role !== 'user') {
            mappedHistory.shift();
        }

        // Enforce strict alternation: drop consecutive same-role entries
        const cleanHistory: Content[] = [];
        for (const entry of mappedHistory) {
            if (cleanHistory.length === 0 || cleanHistory[cleanHistory.length - 1].role !== entry.role) {
                cleanHistory.push(entry);
            }
        }

        // History must end with 'model' (sendMessage adds the next 'user' turn)
        while (cleanHistory.length > 0 && cleanHistory[cleanHistory.length - 1].role === 'user') {
            cleanHistory.pop();
        }

        console.log(`[CWF-Demo] History: ${conversationHistory.length} raw → ${cleanHistory.length} clean`);

        const contents: Content[] = [
            ...cleanHistory,
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
            systemInstruction: buildDemoSystemPrompt(lang, narrativeContext),
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
