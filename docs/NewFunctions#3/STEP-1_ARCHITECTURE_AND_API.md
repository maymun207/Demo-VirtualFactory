# STEP 1 — Vercel Serverless API + Gemini Agent

> **Instruction to AI:** Read this ENTIRE document before writing any code. Then implement ONLY the files described here.

---

## RULES

1. **READ FIRST** — Read the entire document AND all referenced existing files before writing any code.
2. **SCOPE DISCIPLINE** — ONLY create or modify files explicitly listed. Do NOT refactor, rename, or "improve" any existing files.
3. **PATTERN MATCHING** — Match existing code style (JSDoc comments, import organization, etc.).
4. **NO EXTRAS** — Do NOT add utility functions, types, tests, or "nice to have" improvements not described here.
5. **ASK, DON'T ASSUME** — If something conflicts with existing code, STOP and ask before implementing.
6. **VERIFY** — After implementing, run `npx tsc --noEmit` and fix any type errors.

---

## What This Step Creates

| File | Type | Description |
|------|------|-------------|
| `api/cwf/chat.ts` | NEW (complete file) | Vercel serverless function — the CWF AI agent |
| `vercel.json` | MODIFY (add 2 lines) | Add API rewrite rule before the catch-all |
| `package.json` | MODIFY (add dependency) | Add `@google/generative-ai` and `@vercel/node` |

---

## 1.1 Install Dependencies

```bash
npm install @google/generative-ai --save
npm install @vercel/node --save-dev
```

---

## 1.2 Modify `vercel.json`

**Current file:**
```json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

**Change to:**
```json
{
  "rewrites": [
    { "source": "/api/(.*)", "destination": "/api/$1" },
    { "source": "/(.*)", "destination": "/index.html" }
  ],
  "functions": {
    "api/**/*.ts": {
      "maxDuration": 30
    }
  }
}
```

> The API rewrite MUST come before the catch-all, otherwise `/api/*` routes will serve `index.html`.

---

## 1.3 Create `api/cwf/chat.ts` (COMPLETE FILE)

Create this file at the **repository root** in an `api/cwf/` directory (NOT inside `src/`). This is a Vercel convention — any `.ts` file under `api/` becomes a serverless function.

```typescript
/**
 * api/cwf/chat.ts — CWF Agent Vercel Serverless Function
 *
 * Multi-turn tool-use agent powered by Google Gemini.
 * Receives natural language questions about the ceramic tile production
 * simulation, generates SQL queries, executes them against Supabase,
 * and returns interpreted answers with root cause analysis.
 *
 * Environment Variables Required:
 *   GEMINI_API_KEY           — Google AI Studio API key
 *   SUPABASE_URL             — Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY — Supabase service role key (NOT anon)
 *
 * Endpoint: POST /api/cwf/chat
 * Body: { message, simulationId, conversationHistory?, language? }
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  GoogleGenerativeAI,
  FunctionDeclarationSchemaType,
  type FunctionDeclaration,
  type Content,
  type Part,
} from '@google/generative-ai';
import { createClient } from '@supabase/supabase-js';

// =============================================================================
// ENVIRONMENT & CLIENTS
// =============================================================================

const GEMINI_API_KEY = process.env.GEMINI_API_KEY!;
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// =============================================================================
// DATABASE SCHEMA CONTEXT (Injected into Gemini system prompt)
// =============================================================================

const DB_SCHEMA_CONTEXT = `
## DATABASE SCHEMA — Ceramic Tile Production Line Simulator

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

**machine_press_states** — pressure_bar (280-450), cycle_time_sec (4-8), mold_temperature_c (40-60), powder_moisture_pct (5-7), fill_amount_g (800-2500), mold_wear_pct (0-100), pressure_deviation_pct, fill_homogeneity_pct

**machine_dryer_states** — inlet_temperature_c (150-250), outlet_temperature_c (80-120), belt_speed_m_min (1-5), drying_time_min (30-60), exit_moisture_pct (0.5-1.5), fan_frequency_hz (30-50), temperature_gradient_c_m, drying_rate, moisture_homogeneity_pct

**machine_glaze_states** — glaze_density_g_cm3 (1.35-1.55), glaze_viscosity_sec (18-35 Ford cup), application_weight_g_m2 (300-600), cabin_pressure_bar (0.3-1.2), nozzle_angle_deg (15-45), belt_speed_m_min (15-35), glaze_temperature_c (20-30), weight_deviation_pct, nozzle_clog_pct

**machine_printer_states** — head_temperature_c (35-45), ink_viscosity_mpa_s (8-15), drop_size_pl (6-80), resolution_dpi (360-720), belt_speed_m_min (20-45), head_gap_mm (1.5-4), color_channels (4-8), active_nozzle_pct (95-100), nozzle_clog_pct, ink_levels_pct (JSONB)

**machine_kiln_states** — max_temperature_c (1100-1220), firing_time_min (35-60), preheat_gradient_c_min (15-40), cooling_gradient_c_min (20-50), belt_speed_m_min (1-3), atmosphere_pressure_mbar (-0.5 to +0.5), zone_count (5-15), o2_level_pct (2-8), zone_temperatures_c (JSONB array), temperature_deviation_c, gradient_balance_pct, zone_variance_c

**machine_sorting_states** — camera_resolution_mp (5-20), scan_rate_tiles_min (20-60), size_tolerance_mm, color_tolerance_de, flatness_tolerance_mm, defect_threshold_mm2, grade_count (3-5), calibration_drift_pct, camera_cleanliness_pct

**machine_packaging_states** — stack_count (4-12), box_sealing_pressure_bar (2-5), pallet_capacity_m2, stretch_tension_pct, robot_speed_cycles_min, label_accuracy_pct

### Tile Tracking:

**tile_station_snapshots** — Snapshot when tile passes each station
- tile_id (FK), simulation_id (FK), station, station_order (1-7)
- entry_sim_tick, entry_production_tick, exit_sim_tick, processing_duration_ticks
- machine_state_id (FK to respective machine table)
- parameters_snapshot (JSONB — denormalized machine params)
- tile_measurements (JSONB)
- defect_detected (BOOL), defect_types (defect_type[]), defect_severity (0-1), scrapped_here (BOOL)

**parameter_change_events** — When machine params change
- simulation_id, sim_tick, production_tick, station, parameter_name
- old_value, new_value, change_magnitude, change_pct
- change_type (drift|spike|step|random|scheduled)
- change_reason (wear|environment|operator|random|scenario)
- expected_impact, expected_scrap_increase_pct

### Scenarios:

**defect_scenarios** — Predefined scenarios with bilingual names
- code, name, name_tr, name_en, description_tr, description_en
- severity, trigger_conditions (JSONB), parameter_overrides (JSONB)
- expected_defects, expected_scrap_range, expected_oee_range

**scenario_activations** — When scenarios activate during simulation
- simulation_id, scenario_id, scenario_code, is_active
- activated_at_sim_tick, deactivated_at_sim_tick, duration_ticks
- affected_tile_count, actual_scrap_count, actual_downgrade_count

### Metrics & Analytics:

**production_metrics** — Aggregated KPIs per period
- simulation_id, period_start/end sim_tick and production_tick
- total_tiles_produced, first/second/third_quality_count, scrap_count
- availability_pct, performance_pct, quality_pct, oee_pct
- scrap_by_station (JSONB), defect_counts (JSONB), machine_uptime (JSONB)

**simulation_alarm_logs** — Alarm events with severity and station

**conveyor_states** — Per-tick conveyor snapshots (speed, status, fault_count)

**conveyor_events** — Discrete conveyor events (jam_start, jam_cleared, speed_change)

**ai_analysis_results** — Persisted AI analysis results
- simulation_id, analysis_type, summary, root_causes (JSONB), recommendations (JSONB), confidence_score

### Helpful Views:
**tile_journey** — Complete tile lifecycle with all station params and defects
**defective_tiles_analysis** — Defective tiles with full parameter context

### Defect Types (enum):
Press: crack_press, delamination, dimension_variance, density_variance, edge_defect, press_explosion
Dryer: surface_crack_dry, warp_dry, explosion_dry
Glaze: color_tone_variance, glaze_thickness_variance, pinhole_glaze, glaze_drip, line_defect_glaze, edge_buildup
Printer: line_defect_print, white_spot, color_shift, saturation_variance, blur, pattern_stretch, pattern_compress
Kiln: crack_kiln, warp_kiln, corner_lift, pinhole_kiln, color_fade, size_variance_kiln, thermal_shock_crack
Packaging: chip, edge_crack_pack, crush_damage
`;

// =============================================================================
// TOOL DEFINITIONS (Gemini Function Calling)
// =============================================================================

const tools: FunctionDeclaration[] = [
  {
    name: 'query_database',
    description:
      'Execute a READ-ONLY SQL query against the Supabase PostgreSQL database. ' +
      'Use this to retrieve simulation data, machine states, tile information, defects, metrics, etc. ' +
      'ONLY SELECT statements are allowed. Never use INSERT, UPDATE, DELETE, DROP, ALTER, or any DDL/DML. ' +
      'Always filter by simulation_id when querying session-specific data. ' +
      'Use LIMIT to keep result sets manageable (max 100 rows unless aggregating). ' +
      'Prefer aggregation (COUNT, AVG, SUM, GROUP BY) over returning raw rows.',
    parameters: {
      type: FunctionDeclarationSchemaType.OBJECT,
      properties: {
        sql: {
          type: FunctionDeclarationSchemaType.STRING,
          description: 'The SELECT SQL query to execute. Must be read-only.',
        },
        description: {
          type: FunctionDeclarationSchemaType.STRING,
          description: 'Brief description of what this query retrieves and why.',
        },
      },
      required: ['sql', 'description'],
    },
  },
  {
    name: 'get_simulation_summary',
    description:
      'Get a quick overview of a simulation session including status, tile counts by grade, ' +
      'active scenario, defect summary, and latest OEE. Use this as a first step to understand ' +
      'the current state before diving into specific queries.',
    parameters: {
      type: FunctionDeclarationSchemaType.OBJECT,
      properties: {
        simulation_id: {
          type: FunctionDeclarationSchemaType.STRING,
          description: 'UUID of the simulation session to summarize.',
        },
      },
      required: ['simulation_id'],
    },
  },
  {
    name: 'save_analysis',
    description:
      'Save an AI analysis result to the database for future reference. ' +
      'Call this AFTER completing a root cause analysis, trend analysis, or generating recommendations. ' +
      'This persists the analysis so it can be reviewed later.',
    parameters: {
      type: FunctionDeclarationSchemaType.OBJECT,
      properties: {
        simulation_id: {
          type: FunctionDeclarationSchemaType.STRING,
          description: 'UUID of the simulation this analysis belongs to.',
        },
        analysis_type: {
          type: FunctionDeclarationSchemaType.STRING,
          description: 'Type: root_cause, trend, prediction, anomaly, or recommendation',
        },
        summary: {
          type: FunctionDeclarationSchemaType.STRING,
          description: 'Brief summary of findings (1-3 sentences).',
        },
        root_causes: {
          type: FunctionDeclarationSchemaType.STRING,
          description: 'JSON string of root causes: [{"station":"...", "parameter":"...", "contribution": 0.0-1.0}]',
        },
        recommendations: {
          type: FunctionDeclarationSchemaType.STRING,
          description: 'JSON string of recommendations: [{"action":"...", "expected_improvement":"..."}]',
        },
        confidence_score: {
          type: FunctionDeclarationSchemaType.NUMBER,
          description: 'Confidence in the analysis (0.0 to 1.0).',
        },
      },
      required: ['simulation_id', 'analysis_type', 'summary'],
    },
  },
];

// =============================================================================
// TOOL EXECUTION FUNCTIONS
// =============================================================================

/**
 * Execute a read-only SQL query via the Supabase `execute_readonly_query` RPC.
 * This RPC function is created by the STEP-4 migration and provides:
 *   - Server-side SQL validation (SELECT/WITH only)
 *   - 10-second timeout
 *   - 500-row result cap
 *   - Read-only transaction enforcement
 */
async function executeQuery(
  sql: string
): Promise<{ data: unknown; error: string | null }> {
  // Client-side safety: block non-SELECT statements before sending
  const normalized = sql.trim().toUpperCase();
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
    if (regex.test(sql)) {
      return { data: null, error: `Forbidden keyword: ${keyword}` };
    }
  }

  try {
    const { data, error } = await supabase.rpc('execute_readonly_query', {
      query_text: sql,
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
 * Get a comprehensive simulation summary via Supabase RPC.
 * Falls back to individual queries if the RPC function doesn't exist yet.
 */
async function getSimulationSummary(
  simulationId: string
): Promise<object> {
  // Try the optimized RPC first (created in STEP-4 migration)
  const { data: rpcData, error: rpcError } = await supabase.rpc(
    'get_simulation_stats',
    { p_simulation_id: simulationId }
  );

  if (!rpcError && rpcData) {
    return rpcData;
  }

  // Fallback: individual queries (works before STEP-4 migration is applied)
  const [sessionRes, tilesRes, scenarioRes, metricsRes] = await Promise.all([
    supabase
      .from('simulation_sessions')
      .select('*')
      .eq('id', simulationId)
      .single(),
    supabase
      .from('tiles')
      .select('final_grade')
      .eq('simulation_id', simulationId),
    supabase
      .from('scenario_activations')
      .select('scenario_code, is_active, activated_at_sim_tick')
      .eq('simulation_id', simulationId)
      .order('activated_at_sim_tick', { ascending: false })
      .limit(1),
    supabase
      .from('production_metrics')
      .select('*')
      .eq('simulation_id', simulationId)
      .order('period_end_sim_tick', { ascending: false })
      .limit(1),
  ]);

  const gradeCounts = {
    first_quality: 0, second_quality: 0, third_quality: 0, scrap: 0, pending: 0,
  };
  if (tilesRes.data) {
    for (const tile of tilesRes.data) {
      const grade = tile.final_grade as keyof typeof gradeCounts;
      if (grade in gradeCounts) gradeCounts[grade]++;
    }
  }

  return {
    session: sessionRes.data,
    tile_counts: gradeCounts,
    total_tiles: tilesRes.data?.length ?? 0,
    active_scenario: scenarioRes.data?.[0] ?? null,
    latest_metrics: metricsRes.data?.[0] ?? null,
  };
}

/**
 * Save an AI analysis result to the ai_analysis_results table.
 */
async function saveAnalysis(args: {
  simulation_id: string;
  analysis_type: string;
  summary: string;
  root_causes?: string;
  recommendations?: string;
  confidence_score?: number;
}): Promise<object> {
  const { data, error } = await supabase
    .from('ai_analysis_results')
    .insert({
      simulation_id: args.simulation_id,
      analysis_type: args.analysis_type,
      summary: args.summary,
      root_causes: args.root_causes
        ? JSON.parse(args.root_causes)
        : null,
      recommendations: args.recommendations
        ? JSON.parse(args.recommendations)
        : null,
      confidence_score: args.confidence_score ?? null,
      model_version: 'gemini-2.5-flash-cwf-v1',
    })
    .select()
    .single();

  if (error) {
    return { error: error.message };
  }
  return { success: true, analysis_id: data.id };
}

// =============================================================================
// SYSTEM PROMPT BUILDER
// =============================================================================

function buildSystemPrompt(language: 'tr' | 'en'): string {
  const langInstructions =
    language === 'tr'
      ? `IMPORTANT: Respond in TURKISH (Türkçe). Use Turkish technical manufacturing terminology.
Use proper Turkish characters (ş, ç, ğ, ı, ö, ü, İ).
Example terms: fire rate → "fire oranı", defect → "kusur/hata", scrap → "hurda/fire",
kiln → "fırın", press → "pres", glaze → "sır", dryer → "kurutma", OEE → "OEE (Toplam Ekipman Etkinliği)".`
      : `Respond in ENGLISH. Use standard manufacturing and ceramic industry terminology.`;

  return `You are CWF (Chat With your Factory) — an expert AI manufacturing analyst for a ceramic tile production line digital twin simulator.

${langInstructions}

## Your Expertise
- Ceramic tile manufacturing processes (pressing, drying, glazing, printing, kiln firing, sorting, packaging)
- Root cause analysis for production defects
- OEE (Overall Equipment Effectiveness) analysis
- Statistical process control and predictive quality analysis

## Your Capabilities
You have access to the simulation's PostgreSQL database via tools. You can:
1. Query any table to retrieve machine states, tile data, defects, metrics
2. Get quick simulation summaries
3. Perform root cause analysis by correlating parameter changes with defect patterns
4. Save your analysis results for future reference

## Response Guidelines
1. **Always start with get_simulation_summary** if you haven't seen the simulation context yet.
2. **Use query_database** to pull specific data. Prefer aggregations over raw rows.
3. **Be specific and data-driven**: cite actual numbers, tick ranges, and parameter values.
4. **Root cause analysis**: When asked about defects, trace back through parameter_change_events and machine states.
5. **Recommendations**: Always end defect analyses with actionable recommendations.
6. **Format clearly**: Use bullet points, tables (markdown), and bold for key metrics.
7. **Save significant analyses**: Use save_analysis after completing root cause, trend, or recommendation analyses.

## Important Query Rules
- ALWAYS filter by simulation_id: WHERE simulation_id = '<id>'
- Use LIMIT (max 100 rows) unless aggregating
- Prefer views (tile_journey, defective_tiles_analysis) for tile-level analysis
- For time-range queries, use sim_tick ranges
- parameter_change_events.change_reason = 'scenario' indicates scenario-induced changes

## Response Format
1. **Summary** — One-line TL;DR
2. **Data** — Key metrics with actual numbers
3. **Analysis** — Root cause or trend explanation
4. **Recommendations** — Numbered, actionable steps
5. **Confidence** — How confident you are and what additional data would help

Use emojis sparingly for status: ✅ ⚠️ ❌ 📊 🔍

${DB_SCHEMA_CONTEXT}
`;
}

// =============================================================================
// MAIN REQUEST HANDLER
// =============================================================================

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
      conversationHistory = [],
      language = 'en',
    } = req.body;

    if (!message || !simulationId) {
      return res.status(400).json({
        error: 'message and simulationId are required',
      });
    }

    // Initialize Gemini model with function-calling tools
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction: buildSystemPrompt(language as 'tr' | 'en'),
      tools: [{ functionDeclarations: tools }],
    });

    // Build conversation history for multi-turn context
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
            text: `[Active simulation_id: ${simulationId}]\n\n${message}`,
          },
        ] as Part[],
      },
    ];

    // Start chat and enter the tool-use loop
    const chat = model.startChat({
      history: contents.slice(0, -1),
    });

    let response = await chat.sendMessage(
      contents[contents.length - 1].parts
    );
    let result = response.response;
    let loopCount = 0;
    const maxLoops = 8; // Safety limit

    while (loopCount < maxLoops) {
      const candidate = result.candidates?.[0];
      if (!candidate) break;

      // Check if Gemini wants to call functions
      const functionCalls = candidate.content.parts.filter(
        (part) => 'functionCall' in part
      );

      if (functionCalls.length === 0) break; // Final text response ready

      // Execute all requested function calls
      const functionResponses: Part[] = [];

      for (const part of functionCalls) {
        if (!('functionCall' in part)) continue;
        const { name, args } = part.functionCall!;

        let toolResult: unknown;

        switch (name) {
          case 'query_database':
            toolResult = await executeQuery(args.sql as string);
            break;
          case 'get_simulation_summary':
            toolResult = await getSimulationSummary(
              args.simulation_id as string
            );
            break;
          case 'save_analysis':
            toolResult = await saveAnalysis(
              args as Parameters<typeof saveAnalysis>[0]
            );
            break;
          default:
            toolResult = { error: `Unknown function: ${name}` };
        }

        functionResponses.push({
          functionResponse: {
            name,
            response: { result: toolResult },
          },
        } as Part);
      }

      // Feed function results back to Gemini for next round
      response = await chat.sendMessage(functionResponses);
      result = response.response;
      loopCount++;
    }

    // Extract final text from Gemini's response
    const finalText =
      result.candidates?.[0]?.content.parts
        .filter((part) => 'text' in part)
        .map((part) => (part as { text: string }).text)
        .join('\n') ?? 'No response generated.';

    return res.status(200).json({
      response: finalText,
      toolCallCount: loopCount,
      model: 'gemini-2.5-flash',
    });
  } catch (error) {
    console.error('CWF Agent error:', error);
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
      details:
        process.env.NODE_ENV === 'development' ? errorMessage : undefined,
    });
  }
}
```

---

## 1.4 Verification Checklist

After implementing:

- [ ] `@google/generative-ai` is in `package.json` dependencies
- [ ] `@vercel/node` is in `package.json` devDependencies
- [ ] `vercel.json` has the API rewrite BEFORE the catch-all SPA rewrite
- [ ] `api/cwf/chat.ts` exists at the repo root (NOT inside `src/`)
- [ ] `npx tsc --noEmit` passes (note: the API file uses Node types, not Vite — it may need its own tsconfig. If tsc fails on this file only, that's OK — Vercel compiles it separately)
- [ ] Directory structure is:
  ```
  Virtual-Factory/
  ├── api/
  │   └── cwf/
  │       └── chat.ts    ← NEW
  ├── src/
  │   └── ...            ← UNTOUCHED
  ├── vercel.json        ← MODIFIED
  └── package.json       ← MODIFIED (dependencies)
  ```

> **NOTE:** This function depends on the `execute_readonly_query` RPC function in Supabase, which is created in STEP-4. The `get_simulation_summary` function has a fallback that works without it, but `query_database` tool will fail until STEP-4 migration is run.

---

**NEXT:** Proceed to STEP-2.
