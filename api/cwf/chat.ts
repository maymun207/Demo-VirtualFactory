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
    SchemaType,
    type FunctionDeclaration,
    type Content,
    type Part,
} from '@google/generative-ai';
import { createClient } from '@supabase/supabase-js';
/** Google Drive knowledge base fetcher — .js extension required for Vercel ESM resolution */
import { fetchKnowledgeBase } from './cwfKnowledgeDocs.js';
/** Dynamic parameter ranges generator — imports from src/lib/params/parameterRanges.ts (single source of truth) */
import { generateSchemaRangesText, generateSafeRangesText, generateParameterGlossary } from './cwfParameterRanges.js';

// =============================================================================
// CWF AGENT CONFIGURATION
// These constants mirror src/lib/params/cwfAgent.ts.  The api/ folder is
// compiled separately (tsconfig.api.json) and cannot import from src/.
// Keep the two files in sync when changing tunables.
// =============================================================================

/** Maximum Gemini tool-use round-trips before forced summarisation */
const CWF_MAX_TOOL_LOOPS = 12;

/** Maximum retries when Gemini returns an empty response (0 text parts) */
const CWF_EMPTY_RESPONSE_MAX_RETRIES = 2;

/** Base delay in ms before each retry (multiplied by attempt number for backoff) */
const CWF_RETRY_BASE_DELAY_MS = 1000;

/** Gemini model identifier */
const CWF_MODEL_NAME = 'gemini-2.5-flash';

/** Model version tag persisted in ai_analysis_results */
const CWF_MODEL_VERSION_TAG = 'gemini-2.5-flash-cwf-v1';

/** Fallback when agent produces no text (English) */
const CWF_FALLBACK_RESPONSE_EN =
    '⚠️ I gathered data from the database but could not generate a complete answer. ' +
    'Please try again or rephrase your question with more specific details.';

/** Fallback when agent produces no text (Turkish) */
const CWF_FALLBACK_RESPONSE_TR =
    '⚠️ Veritabanından veri topladım ancak tam bir yanıt oluşturamadım. ' +
    'Lütfen tekrar deneyin veya sorunuzu daha spesifik ayrıntılarla yeniden ifade edin.';

/** Forced-summary prompt injected when loop limit is hit (English) */
const CWF_FORCE_SUMMARY_PROMPT_EN =
    'You have reached the maximum number of tool calls. ' +
    'Please provide your best answer now using ONLY the data you have already collected. ' +
    'Do NOT request any more tool calls. Summarise your findings clearly.';

/**
 * Unique sentinel prefix prepended to every force-summary / retry injection.
 * SOURCE OF TRUTH: src/lib/params/cwfAgent.ts — CWF_FORCE_SUMMARY_SENTINEL
 * The history sanitizer detects this prefix in user turns and removes them.
 */
const CWF_FORCE_SUMMARY_SENTINEL = '[[CWF_FORCE_SUMMARY]]';

/**
 * Fingerprint substring used to detect force-summary contamination in
 * ASSISTANT messages. When Gemini quotes the force-summary instruction back
 * (e.g. "as per your instruction to 'Do NOT call any tools'"), this fingerprint
 * identifies those contaminated assistant turns for removal from history.
 * SOURCE OF TRUTH: src/lib/params/cwfAgent.ts — CWF_FORCE_SUMMARY_FINGERPRINT
 */
const CWF_FORCE_SUMMARY_FINGERPRINT = 'Do NOT';

/**
 * Fingerprint for the retry prompt contamination path.
 * The retry prompt text "Answer NOW using all the data you already collected"
 * can also appear quoted back in Gemini assistant responses.
 * SOURCE OF TRUTH: src/lib/params/cwfAgent.ts — CWF_RETRY_PROMPT_FINGERPRINT
 */
const CWF_RETRY_PROMPT_FINGERPRINT = 'Answer NOW using all the data';

/**
 * Auth-turn fast-path system instruction injected when the user message
 * is the authorization code. Tells Gemini to execute immediately with ONE
 * tool call rather than re-querying state (which burns loops and can hit
 * CWF_MAX_TOOL_LOOPS before the actual execution tool is called).
 * SOURCE OF TRUTH: src/lib/params/cwfAgent.ts — CWF_AUTH_FAST_PATH_PROMPT_EN
 */
const CWF_AUTH_FAST_PATH_PROMPT_EN = `
## ⚡ AUTHORIZATION TURN — EXECUTE NOW

The user has just provided their authorization response. This is the execution step for a pending machine parameter change.

**YOU MUST do exactly this, in order:**
1. Call update_parameter ONCE, immediately, using:
   - All parameter values (station, parameter, old_value, new_value, reason) from the conversation history above
   - authorized_by = the exact text the user just typed (verbatim, no modifications)
2. Do NOT query the database again — you already have the values.
3. Do NOT evaluate whether the auth code looks correct — call the tool and the server validates.
4. Do NOT generate any text before the tool call — just call the tool.
5. After the tool returns, report the result in one line.

Example: if the user typed "airtk", call update_parameter with authorized_by="airtk" immediately.
`;

const CWF_AUTH_FAST_PATH_PROMPT_TR = `
## ⚡ YETKİLENDİRME TURU — HEMEN UYGULA

Kullanıcı yetkisini az önce sağladı. Bu bekleyen makine parametre değişikliği için uygulama adımıdır.

**BU SIRAYA GÖRE YAPMANIZ GEREKENLER:**
1. update_parameter'ı hemen, bir kez çağırın:
   - Tüm parametre değerlerini (station, parameter, old_value, new_value, reason) yukarıdaki konuşma geçmişinden alın
   - authorized_by = kullanıcının yazdığı tam metin (değiştirmeden)
2. Veritabanını tekrar sorgulamayın — değerlere zaten sahipsiniz.
3. Yetki kodunun doğru görünüp görünmediğini değerlendirmeyin — aracı çağırın, sunucu doğrular.
4. Araç çağrısından önce herhangi bir metin oluşturmayın — sadece aracı çağırın.
5. Araç döndükten sonra sonucu tek satırda raporlayın.

Örnek: kullanıcı "airtk" yazdıysa, hemen authorized_by="airtk" ile update_parameter'ı çağırın.
`;

// =============================================================================
// CWF PARAMETER CONTROL — Human-in-the-Loop Auth Code
// Mirror of CWF_AUTH_CODE from src/lib/params/cwfCommands.ts.
// The api/ folder is compiled separately (tsconfig.api.json) and cannot
// import from src/. Keep the two files in sync.
// =============================================================================

/** Authorization code for CWF parameter changes (human-in-the-loop) */
const CWF_AUTH_CODE = 'airtk';

/**
 * Sentinel value written to cwf_commands.authorized_by for UI actions
 * (toggle panels, start/stop simulation, etc.) that do NOT require human
 * authorization. Distinguishes UI-action rows from operator-authorized
 * parameter-change rows in the audit trail.
 * SOURCE OF TRUTH: src/lib/params/cwfAgent.ts — CWF_UI_ACTION_BYPASS_AUTH
 */
const CWF_UI_ACTION_BYPASS_AUTH = 'system:ui_action_no_auth_required';

/**
 * Valid station names for CWF commands.
 * MIRROR of CWF_VALID_STATIONS in src/lib/params/cwfCommands.ts.
 * Must be kept in sync — api/ cannot import from src/.
 * Includes the 7 production stations PLUS the conveyor belt (8th station).
 */
const CWF_VALID_STATIONS = [
    'press', 'dryer', 'glaze', 'printer', 'kiln', 'sorting', 'packaging',
    /** Conveyor belt — controls jammed_time, impacted_tiles, scrap_probability, speed_change, jammed_events */
    'conveyor',
] as const;

/**
 * Maximum time (ms) the server waits for the client to acknowledge a parameter
 * change. Mirror of CWF_ACK_WAIT_MS from src/lib/params/cwfCommands.ts.
 * Keep the two in sync — the api/ folder cannot import from src/.
 */
const CWF_ACK_WAIT_MS = 5_000;

/**
 * How often (ms) the server polls cwf_commands.status for client acknowledgment.
 * Mirror of CWF_ACK_POLL_MS from src/lib/params/cwfCommands.ts.
 */
const CWF_ACK_POLL_MS = 500;

/** Forced-summary prompt injected when loop limit is hit (Turkish) */
const CWF_FORCE_SUMMARY_PROMPT_TR =
    'Maksimum araç çağrısı sayısına ulaştınız. ' +
    'Lütfen şu ana kadar topladığınız verilerle en iyi yanıtınızı verin. ' +
    'Daha fazla araç çağrısı yapmayın. Bulgularınızı net bir şekilde özetleyin.';

// =============================================================================
// PARAMETER DISPLAY PROMPT (Mirrored from src/lib/params/cwfAgent.ts)
// =============================================================================

/**
 * Tells Gemini to translate raw DB column names into human-readable labels.
 * This is a MIRROR of CWF_PARAMETER_DISPLAY_PROMPT in cwfAgent.ts.
 * Keep the two in sync — the api/ folder cannot import from src/.
 */
const CWF_PARAMETER_DISPLAY_PROMPT = `## PARAMETER DISPLAY NAMES — MANDATORY
When presenting machine parameters to the user, you MUST NEVER use raw database column names.
Always translate them to the human-readable label from the table below.
Use the label that matches the session language (EN or TR).

**Examples:**
- ❌ WRONG: "pressure_bar was 350"
- ✅ RIGHT: "Pressure was 350 bar"
- ❌ WRONG: "exit_moisture_pct is 1.2"
- ✅ RIGHT: "Exit Moisture is 1.2%"
- ❌ WRONG: "glaze_density_g_cm3 = 1.45"
- ✅ RIGHT: "Glaze Density is 1.45 g/cm³"

| Column Name | English Label | Turkish Label |
|---|---|---|
| pressure_bar | Pressure (bar) | Basınç (bar) |
| cycle_time_sec | Cycle Time (sec) | Çevrim Süresi (sn) |
| mold_temperature_c | Mould Temperature (°C) | Kalıp Sıcaklığı (°C) |
| powder_moisture_pct | Powder Moisture (%) | Toz Nemi (%) |
| fill_amount_g | Fill Amount (g) | Dolum Miktarı (g) |
| mold_wear_pct | Mould Wear (%) | Kalıp Aşınması (%) |
| pressure_deviation_pct | Pressure Deviation (%) | Basınç Sapması (%) |
| fill_homogeneity_pct | Fill Homogeneity (%) | Dolum Homojenliği (%) |
| inlet_temperature_c | Inlet Temperature (°C) | Giriş Sıcaklığı (°C) |
| outlet_temperature_c | Outlet Temperature (°C) | Çıkış Sıcaklığı (°C) |
| belt_speed_m_min | Belt Speed (m/min) | Bant Hızı (m/dk) |
| drying_time_min | Drying Time (min) | Kurutma Süresi (dk) |
| exit_moisture_pct | Exit Moisture (%) | Çıkış Nemi (%) |
| fan_frequency_hz | Fan Frequency (Hz) | Fan Frekansı (Hz) |
| temperature_gradient_c_m | Temperature Gradient (°C/m) | Sıcaklık Gradyanı (°C/m) |
| drying_rate | Drying Rate | Kurutma Hızı |
| moisture_homogeneity_pct | Moisture Homogeneity (%) | Nem Homojenliği (%) |
| glaze_density_g_cm3 | Glaze Density (g/cm³) | Sır Yoğunluğu (g/cm³) |
| glaze_viscosity_sec | Glaze Viscosity (sec) | Sır Viskozitesi (sn) |
| application_weight_g_m2 | Application Weight (g/m²) | Uygulama Ağırlığı (g/m²) |
| cabin_pressure_bar | Cabin Pressure (bar) | Kabin Basıncı (bar) |
| nozzle_angle_deg | Nozzle Angle (°) | Nozül Açısı (°) |
| glaze_temperature_c | Glaze Temperature (°C) | Sır Sıcaklığı (°C) |
| weight_deviation_pct | Weight Deviation (%) | Ağırlık Sapması (%) |
| nozzle_clog_pct | Nozzle Clog (%) | Nozül Tıkanıklığı (%) |
| head_temperature_c | Head Temperature (°C) | Kafa Sıcaklığı (°C) |
| ink_viscosity_mpa_s | Ink Viscosity (mPa·s) | Mürekkep Viskozitesi (mPa·s) |
| drop_size_pl | Drop Size (pl) | Damla Boyutu (pl) |
| resolution_dpi | Resolution (dpi) | Çözünürlük (dpi) |
| head_gap_mm | Head Gap (mm) | Kafa Boşluğu (mm) |
| color_channels | Colour Channels | Renk Kanalları |
| active_nozzle_pct | Active Nozzle (%) | Aktif Nozül (%) |
| ink_levels_pct | Ink Levels (%) | Mürekkep Seviyeleri (%) |
| max_temperature_c | Max Temperature (°C) | Maks. Sıcaklık (°C) |
| firing_time_min | Firing Time (min) | Pişirme Süresi (dk) |
| preheat_gradient_c_min | Preheat Gradient (°C/min) | Ön Isıtma Gradyanı (°C/dk) |
| cooling_gradient_c_min | Cooling Gradient (°C/min) | Soğutma Gradyanı (°C/dk) |
| atmosphere_pressure_mbar | Atmosphere Pressure (mbar) | Atmosfer Basıncı (mbar) |
| zone_count | Zone Count | Bölge Sayısı |
| o2_level_pct | O₂ Level (%) | O₂ Seviyesi (%) |
| zone_temperatures_c | Zone Temperatures (°C) | Bölge Sıcaklıkları (°C) |
| temperature_deviation_c | Temperature Deviation (°C) | Sıcaklık Sapması (°C) |
| gradient_balance_pct | Gradient Balance (%) | Gradyan Dengesi (%) |
| zone_variance_c | Zone Variance (°C) | Bölge Varyansı (°C) |
| camera_resolution_mp | Camera Resolution (MP) | Kamera Çözünürlüğü (MP) |
| scan_rate_tiles_min | Scan Rate (tiles/min) | Tarama Hızı (karo/dk) |
| size_tolerance_mm | Size Tolerance (mm) | Boyut Toleransı (mm) |
| color_tolerance_de | Colour Tolerance (ΔE) | Renk Toleransı (ΔE) |
| flatness_tolerance_mm | Flatness Tolerance (mm) | Düzlük Toleransı (mm) |
| defect_threshold_mm2 | Defect Threshold (mm²) | Hata Eşiği (mm²) |
| grade_count | Grade Count | Kalite Sınıfı Sayısı |
| calibration_drift_pct | Calibration Drift (%) | Kalibrasyon Kayması (%) |
| camera_cleanliness_pct | Camera Cleanliness (%) | Kamera Temizliği (%) |
| stack_count | Stack Count | İstif Sayısı |
| box_sealing_pressure_bar | Box Sealing Pressure (bar) | Kutu Mühürleme Basıncı (bar) |
| pallet_capacity_m2 | Pallet Capacity (m²) | Palet Kapasitesi (m²) |
| stretch_tension_pct | Stretch Tension (%) | Germe Gerilimi (%) |
| robot_speed_cycles_min | Robot Speed (cycles/min) | Robot Hızı (çevrim/dk) |
| label_accuracy_pct | Label Accuracy (%) | Etiket Doğruluğu (%) |
| jammed_time | Jam Duration (cycles) | Sıkışma Süresi (çevrim) |
| impacted_tiles | Tiles Scrapped Per Jam | Sıkışma Başı Hurda Karo |
| scrap_probability | Scrap Probability (%) | Hurda Olasılığı (%) |
| speed_change | Speed Change Events | Hız Değişimi Olayları |
| jammed_events | Jam Events Enabled | Sıkışma Olayları Etkin |
`;

// =============================================================================
// ENVIRONMENT & CLIENTS
// =============================================================================

/** Google AI Studio API key for Gemini access */
const GEMINI_API_KEY = process.env.GEMINI_API_KEY!;

/** Supabase project URL (e.g. https://xxx.supabase.co) */
const SUPABASE_URL = process.env.SUPABASE_URL!;

/** Supabase service role key — full DB access, never exposed to frontend */
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/** Gemini SDK client instance */
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

/** Supabase client with service-role credentials for full DB access */
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// =============================================================================
// DATABASE SCHEMA CONTEXT (Injected into Gemini system prompt)
// =============================================================================

/**
 * Complete database schema description provided to Gemini so it can
 * generate accurate SQL queries against the simulation database.
 * Includes all tables, columns, types, constraints, and useful views.
 */
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

${generateSchemaRangesText()}

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

**cwf_commands** — CWF parameter change command queue (Realtime-enabled)
- id (UUID PK), session_id (FK to simulation_sessions)
- station (TEXT), parameter (TEXT), old_value (DOUBLE), new_value (DOUBLE)
- reason (TEXT), authorized_by (TEXT), status ('pending'|'applied'|'rejected')
- rejected_reason (TEXT), created_at (TIMESTAMPTZ)
- Frontend subscribes via Supabase Realtime for instant application

**simulation_events** — State transitions during simulation
- id (UUID PK), simulation_id (FK), sim_tick (INTEGER)
- event_type ('started'|'stopped'|'drain_started'|'drain_completed'|
  'force_stopped'|'resumed'|'reset'|'work_order_completed')
- details (JSONB — contextual data like pClockCount, tilesSpawned)
- created_at (TIMESTAMPTZ)
- Use this to identify manual stops that affect OEE interpretation
- When analysing OEE drops, ALWAYS check this table for stop/start patterns

**telemetry** — Per-simulation time-series telemetry (machine metrics per tick)
- id (UUID PK, auto-generated)
- machine_id ('press'|'dryer'|'glaze'|'printer'|'kiln'|'sorting'|'packaging'|'conveyor'|'factory')
- simulation_id (FK to simulation_sessions — ALWAYS filter by this)
- s_clock (INTEGER — simulation tick), p_clock (INTEGER — production tick)
- status, conveyor_speed
- oee, ftq, scrap_rate, energy_kwh, gas_m3, co2_kg (only on machine_id='factory')
- created_at, updated_at
- UNIQUE constraint on (machine_id, simulation_id, s_clock)

**oee_snapshots** — Periodic hierarchical OEE snapshots (inserted every ~10s while running)
- simulation_id (FK), sim_tick, elapsed_minutes
- Station counts (A-J variables): press_spawned, press_output, dryer_output, glaze_output, digital_output, kiln_input, kiln_output, sorting_usable_output, packaging_output, conveyor_clean_output, theoretical_a, theoretical_b
- Machine OEEs (0-100): moee_press, moee_dryer, moee_glaze, moee_digital, moee_conveyor, moee_kiln, moee_sorting, moee_packaging
- Line OEEs (0-100): loee_line1 (press→printer), loee_line2 (conveyor), loee_line3 (kiln→packaging)
- Factory OEE: foee (0-100), bottleneck ('A' press-limited or 'B' kiln-limited)
- Energy totals: energy_total_kwh, energy_total_gas, energy_total_co2, energy_kwh_per_tile
- Per-station energy: energy_press_kwh, energy_dryer_kwh, energy_glaze_kwh, energy_digital_kwh, energy_conveyor_kwh, energy_kiln_kwh, energy_sorting_kwh, energy_packaging_kwh, energy_dryer_gas, energy_kiln_gas
- Use this table for OEE trend analysis, bottleneck detection, energy efficiency queries, and line performance comparisons

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

### DATABASE RELATIONSHIP MODEL — Tile Passport (Künye) System

**IMPORTANT: This is the KEY to intelligent defect analysis.**

Each tile has a digital passport (künye) that records machine parameters at EVERY station it visits.
This passport is stored in tile_station_snapshots — one row per station visit per tile.

**Data Flow:**
tiles (the tile itself) → tile_station_snapshots (passport: what happened at each station) → machine_*_states (full machine data at that tick)

**How to trace a defect to its root cause:**
1. Find defective tiles: tiles WHERE final_grade IN ('scrap', 'second_quality')
2. Read their passport: tile_station_snapshots WHERE tile_id = <defective_tile_id>
3. Check which station flagged defect_detected = true → that's the originating station
4. Read parameters_snapshot (JSONB) to see exact machine values at that moment
5. Compare against safe ranges below to identify which parameter was out of range

### EXAMPLE SQL QUERIES FOR DEFECT ROOT CAUSE ANALYSIS:

**Which stations are CAUSING defects?** (Not where the tile ended up)
SELECT tss.station, COUNT(*) as defect_count, array_agg(DISTINCT unnest_dt) as defect_types
FROM tile_station_snapshots tss
CROSS JOIN LATERAL unnest(tss.defect_types) AS unnest_dt
WHERE tss.simulation_id = '<session_id>' AND tss.defect_detected = true
GROUP BY tss.station ORDER BY defect_count DESC

**What parameters were out of range for defective tiles?**
SELECT tss.station, tss.parameters_snapshot, tss.defect_types, t.tile_number
FROM tile_station_snapshots tss
JOIN tiles t ON tss.tile_id = t.id
WHERE t.simulation_id = '<session_id>' AND t.final_grade IN ('scrap', 'second_quality')
AND tss.defect_detected = true
ORDER BY tss.station, t.tile_number

**Common defective parameter patterns across all scrapped tiles:**
SELECT tss.station, tss.defect_types, COUNT(*) as occurrence
FROM tile_station_snapshots tss
JOIN tiles t ON tss.tile_id = t.id
WHERE t.simulation_id = '<session_id>' AND tss.defect_detected = true
GROUP BY tss.station, tss.defect_types ORDER BY occurrence DESC

### FALLBACK: When tile_station_snapshots is empty

If tile_station_snapshots returns zero rows, check machine_*_states tables DIRECTLY:
1. Query each machine table for the current session (LIMIT 1 ORDER BY sim_tick DESC)
2. Compare actual values against these SAFE RANGES:

${generateSafeRangesText()}
`;

// =============================================================================
// TOOL DEFINITIONS (Gemini Function Calling)
// =============================================================================

/**
 * Function declarations exposed to Gemini for tool-use / function-calling.
 * Each declaration describes a tool the model can invoke during conversation.
 */
const tools: FunctionDeclaration[] = [
    {
        /**
         * query_database — Execute a read-only SQL SELECT against Supabase.
         * The model generates SQL based on the schema context above.
         */
        name: 'query_database',
        description:
            'Execute a READ-ONLY SQL query against the Supabase PostgreSQL database. ' +
            'Use this to retrieve simulation data, machine states, tile information, defects, metrics, etc. ' +
            'ONLY SELECT statements are allowed. Never use INSERT, UPDATE, DELETE, DROP, ALTER, or any DDL/DML. ' +
            'Always filter by simulation_id when querying session-specific data. ' +
            'Use LIMIT to keep result sets manageable (max 100 rows unless aggregating). ' +
            'Prefer aggregation (COUNT, AVG, SUM, GROUP BY) over returning raw rows. ' +
            'IMPORTANT: Do NOT include a trailing semicolon (;) in the SQL — the query is wrapped as a subquery and semicolons cause syntax errors.',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                sql: {
                    type: SchemaType.STRING,
                    description: 'The SELECT SQL query to execute. Must be read-only.',
                },
                description: {
                    type: SchemaType.STRING,
                    description: 'Brief description of what this query retrieves and why.',
                },
            },
            required: ['sql', 'description'],
        },
    },
    {
        /**
         * get_simulation_summary — Quick overview of a simulation session.
         * Returns tile counts by grade, active scenario, and latest OEE.
         */
        name: 'get_simulation_summary',
        description:
            'Get a quick overview of a simulation session including status, tile counts by grade, ' +
            'active scenario, defect summary, and latest OEE. Use this as a first step to understand ' +
            'the current state before diving into specific queries.',
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
    {
        /**
         * save_analysis — Persist an AI analysis result to the database.
         * Called after completing root cause, trend, or recommendation analyses.
         */
        name: 'save_analysis',
        description:
            'Save an AI analysis result to the database for future reference. ' +
            'Call this AFTER completing a root cause analysis, trend analysis, or generating recommendations. ' +
            'This persists the analysis so it can be reviewed later.',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                simulation_id: {
                    type: SchemaType.STRING,
                    description: 'UUID of the simulation this analysis belongs to.',
                },
                analysis_type: {
                    type: SchemaType.STRING,
                    description: 'Type: root_cause, trend, prediction, anomaly, or recommendation',
                },
                summary: {
                    type: SchemaType.STRING,
                    description: 'Brief summary of findings (1-3 sentences).',
                },
                root_causes: {
                    type: SchemaType.STRING,
                    description: 'JSON string of root causes: [{"station":"...", "parameter":"...", "contribution": 0.0-1.0}]',
                },
                recommendations: {
                    type: SchemaType.STRING,
                    description: 'JSON string of recommendations: [{"action":"...", "expected_improvement":"..."}]',
                },
                confidence_score: {
                    type: SchemaType.NUMBER,
                    description: 'Confidence in the analysis (0.0 to 1.0).',
                },
            },
            required: ['simulation_id', 'analysis_type', 'summary'],
        },
    },
    {
        /**
         * update_parameter — Change a machine parameter on the live simulation.
         * Only called AFTER the human-in-the-loop 3-step confirmation flow:
         *   Step 1: CWF proposes (reads current value, calculates new value)
         *   Step 2: User approves → CWF requests authorization ID
         *   Step 3: User provides correct auth ID → CWF calls this tool
         */
        name: 'update_parameter',
        description:
            'Change a machine parameter on the live simulation via the cwf_commands queue. ' +
            'CRITICAL: You MUST follow the 3-step human-in-the-loop protocol BEFORE calling this tool. ' +
            'Step 1: Query the current value and PROPOSE the change to the user. ' +
            'Step 2: After user says yes, ask for their authorization ID. ' +
            'Step 3: Validate the auth ID before calling this tool. ' +
            'NEVER call this tool without explicit user approval AND a valid authorization ID.',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                simulation_id: {
                    type: SchemaType.STRING,
                    description: 'UUID of the active simulation session.',
                },
                station: {
                    type: SchemaType.STRING,
                    description:
                        'Target station: press|dryer|glaze|printer|kiln|sorting|packaging|conveyor. ' +
                        'Use "conveyor" for conveyor belt parameters (jammed_time, impacted_tiles, ' +
                        'scrap_probability, speed_change, jammed_events).',
                },
                parameter: {
                    type: SchemaType.STRING,
                    description: 'Parameter column name (e.g. pressure_bar, inlet_temperature_c)',
                },
                old_value: {
                    type: SchemaType.NUMBER,
                    description: 'Current value read from the database (for audit trail)',
                },
                new_value: {
                    type: SchemaType.NUMBER,
                    description: 'Proposed new value to set',
                },
                reason: {
                    type: SchemaType.STRING,
                    description: 'AI-generated reason for the change (e.g. "User requested +10%")',
                },
                authorized_by: {
                    type: SchemaType.STRING,
                    description: 'The authorization ID provided by the user',
                },
            },
            required: ['simulation_id', 'station', 'parameter', 'old_value', 'new_value', 'reason', 'authorized_by'],
        },
    },
    {
        /**
         * execute_ui_action — Execute a UI-level action on the simulation browser.
         *
         * This tool lets CWF control the simulation UI: open/close panels, start or stop the
         * simulation, reset the factory, change language, or open Demo Settings.
         * The action is queued via cwf_commands (command_type='ui_action') and the browser
         * listener (useCWFCommandListener) picks it up and dispatches it to the correct Zustand action.
         *
         * ★ NO AUTHORIZATION REQUIRED — call this tool immediately when the user makes a UI request.
         *   Do NOT ask for a password. Do NOT ask for confirmation.
         *   Simply execute and report back what happened.
         *   (Authorization is ONLY required for update_parameter — machine parameter changes.)
         *
         * ★ IDEMPOTENT PANEL STATE — always pass action_value="open" or "close".
         *   The listener sets the panel to the target state directly (never blind-toggles).
         *
         * Available actions:
         *   Panel toggles: toggle_basic_panel | toggle_dtxfr | toggle_oee_hierarchy |
         *                  toggle_prod_table | toggle_cwf_panel | toggle_control_panel |
         *                  toggle_alarm_log | toggle_heatmap | toggle_kpi |
         *                  toggle_tile_passport | toggle_demo_settings
         *   Simulation:    start_simulation | stop_simulation | reset_simulation
         *   Config:        set_language (value: 'en' | 'tr')
         */
        name: 'execute_ui_action',
        description:
            'Execute a UI action on the user\'s browser: open/close panels, start/stop/reset the simulation, ' +
            'set conveyor belt status (running/stopped/jammed), adjust simulation parameter sliders, ' +
            'or change the interface language. ' +
            'NO AUTHORIZATION REQUIRED — call this tool immediately without asking for a password or confirmation. ' +
            'For panel toggles, you MUST pass action_value="open" or "close". ' +
            'For conveyor status: set_conveyor_running | set_conveyor_stopped | set_conveyor_jammed (no action_value needed). ' +
            'For sliders: set_conveyor_speed (action_value=float e.g. "1.5"), set_sclk_period (action_value=int ms e.g. "300"), set_station_interval (action_value=int e.g. "3"). ' +
            'Available action_type values: toggle_basic_panel, toggle_dtxfr, toggle_oee_hierarchy, ' +
            'toggle_prod_table, toggle_cwf_panel, toggle_control_panel, toggle_alarm_log, ' +
            'toggle_heatmap, toggle_kpi, toggle_tile_passport, toggle_demo_settings, ' +
            'start_simulation, stop_simulation, reset_simulation, ' +
            'set_conveyor_running, set_conveyor_stopped, set_conveyor_jammed, ' +
            'set_conveyor_speed, set_sclk_period, set_station_interval, set_language, ' +
            'switch_scenario (action_value=scenario code SCN-000…SCN-004 — switches defect scenario live, NO simulation pause), ' +
            'set_work_order (action_value=WorkID#1|WorkID#2|WorkID#3 — selects the active Work Order in Demo Settings; also resets the tile spawn counter for the new production batch).',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                simulation_id: {
                    type: SchemaType.STRING,
                    description: 'UUID of the active simulation session.',
                },
                action_type: {
                    type: SchemaType.STRING,
                    description:
                        'The UI action to perform. Valid values:\n' +
                        'Panels: toggle_basic_panel | toggle_dtxfr | toggle_oee_hierarchy | toggle_prod_table | toggle_cwf_panel | toggle_control_panel | toggle_alarm_log | toggle_heatmap | toggle_kpi | toggle_tile_passport | toggle_demo_settings\n' +
                        'Simulation lifecycle: start_simulation | stop_simulation | reset_simulation\n' +
                        'Conveyor belt status: set_conveyor_running | set_conveyor_stopped | set_conveyor_jammed\n' +
                        'Simulation sliders: set_conveyor_speed | set_sclk_period | set_station_interval\n' +
                        'Config: set_language\n' +
                        'Scenario switch: switch_scenario (action_value=ScenarioCode e.g. SCN-002)',
                },
                action_value: {
                    type: SchemaType.STRING,
                    description:
                        'REQUIRED for panel toggle actions: pass "open" to open the panel, "close" to close it. ' +
                        'REQUIRED for set_language: pass "en" or "tr". ' +
                        'REQUIRED for set_conveyor_speed: float string e.g. "1.5" (range 0.3-2.0). ' +
                        'REQUIRED for set_sclk_period: integer ms string e.g. "300" (range 200-700, step 100). ' +
                        'REQUIRED for set_station_interval: integer string e.g. "3" (range 2-7). ' +
                        'Not required for: start_simulation | stop_simulation | reset_simulation | set_conveyor_running | set_conveyor_stopped | set_conveyor_jammed.',
                },
                reason: {
                    type: SchemaType.STRING,
                    description: 'Short user-facing reason (e.g. "User requested Control & Actions panel").',
                },
            },
            required: ['simulation_id', 'action_type', 'reason'],
        },
    },
    {
        /**
         * enable_copilot — Activate autonomous CWF Copilot mode.
         * Requires human-in-the-loop authorization (auth code 'airtk').
         * Once enabled, the server-side Copilot engine polls the simulation
         * state and takes corrective actions autonomously.
         */
        name: 'enable_copilot',
        description:
            /** User-facing: tells Gemini to use 'AutoPilot' branding (not Microsoft Copilot). */
            'Enable CWF AutoPilot autonomous monitoring mode. ' +
            'REQUIRES the 3-step human-in-the-loop authorization protocol: ' +
            'Step 1: Explain what AutoPilot mode does and ask for confirmation. ' +
            'Step 2: After user confirms, ask for their authorization ID. ' +
            'Step 3: Call this tool with the auth code. ' +
            'AutoPilot mode allows the AI to autonomously monitor the simulation, detect issues, ' +
            'and take corrective parameter actions with full audit logging.',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                simulation_id: {
                    type: SchemaType.STRING,
                    description: 'UUID of the active simulation session.',
                },
                authorized_by: {
                    type: SchemaType.STRING,
                    description: 'The authorization ID provided by the user (must be valid auth code).',
                },
            },
            required: ['simulation_id', 'authorized_by'],
        },
    },
    {
        /**
         * disable_copilot — Deactivate Copilot autonomous mode.
         * NO AUTHORIZATION REQUIRED — user can disable at any time.
         */
        name: 'disable_copilot',
        description:
            /** User-facing: tells Gemini to use 'AutoPilot' branding (not Microsoft Copilot). */
            'Disable CWF AutoPilot autonomous monitoring mode. ' +
            'NO AUTHORIZATION REQUIRED — call immediately when the user wants to stop AutoPilot. ' +
            'This stops the autonomous monitoring loop and returns to normal CWF operation.',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                simulation_id: {
                    /** UUID of the active simulation session — FK for cwf_commands row */
                    type: SchemaType.STRING,
                    description: 'UUID of the active simulation session.',
                },
            },
            required: ['simulation_id'],
        },
    },
    {
        /**
         * switch_scenario — Switch the active defect scenario on the live simulation.
         *
         * Calls resetToFactoryDefaults() — clears prior scenario overrides — then
         * loadScenario() to apply the new scenario's parameter overrides and conveyor
         * settings. The simulation continues running with NO pause, NO drain step.
         *
         * This mirrors the two-step logic in DemoSettingsPanel.handleLoadScenario()
         * but skips the panel-open auto-pause useEffect (lines 1402–1408).
         *
         * ★ NO AUTHORIZATION REQUIRED — mirrors the manual panel flow which has no
         *   auth gate for scenario selection. Call immediately when the user requests.
         *
         * Scenarios:
         *   SCN-000 — Optimal Production (reference — no defects, factory defaults)
         *   SCN-001 — Press Pressure Anomaly
         *   SCN-002 — Kiln Temperature Crisis
         *   SCN-003 — Glaze Drift
         *   SCN-004 — Cascade Multi-station Defect
         */
        name: 'switch_scenario',
        description:
            'Switch the active defect scenario on the live simulation without pausing. ' +
            'NO AUTHORIZATION REQUIRED — call immediately when the user asks to switch, load, or change a scenario. ' +
            'resetToFactoryDefaults() is called first to clear prior overrides, then loadScenario() applies the new scenario. ' +
            'The simulation keeps running — no pause, no drain, no restart needed. ' +
            'SCN-000 = Optimal Production (reference/no defects). ' +
            'SCN-001 = Press Pressure Anomaly. ' +
            'SCN-002 = Kiln Temperature Crisis. ' +
            'SCN-003 = Glaze Drift. ' +
            'SCN-004 = Cascade Multi-station Defect.',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                simulation_id: {
                    type: SchemaType.STRING,
                    /** UUID of the active simulation session — required FK for cwf_commands row */
                    description: 'UUID of the active simulation session.',
                },
                scenario_code: {
                    type: SchemaType.STRING,
                    /**
                     * Valid values documented in description — matches VALID_SCENARIO_CODES
                     * in src/lib/params/cwfScenarioSwitch.ts. The Gemini SDK's EnumStringSchema
                     * type requires a separate `format: 'enum'` field which is nonstandard here;
                     * the description-only approach is used consistently in this file.
                     */
                    description:
                        'The 5-character scenario code to switch to. ' +
                        'Must be one of: SCN-000 (reference/no defects), SCN-001 (press anomaly), ' +
                        'SCN-002 (kiln crisis), SCN-003 (glaze drift), SCN-004 (cascade defect).',
                },
                reason: {
                    type: SchemaType.STRING,
                    /** Brief user-facing reason included in the cwf_commands.reason column for audit */
                    description: 'Short reason for switching (e.g. "User requested Kiln Temperature Crisis scenario").',
                },
            },
            required: ['simulation_id', 'scenario_code', 'reason'],
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
 *
 * @param sql - The SQL SELECT statement to execute
 * @returns Object with `data` (query results) and `error` (error message or null)
 */
async function executeQuery(
    sql: string
): Promise<{ data: unknown; error: string | null }> {
    /** Strip trailing semicolons — the RPC wraps queries as subqueries where ';' is invalid syntax */
    const cleanedSql = sql.trim().replace(/;+\s*$/, '');

    // Client-side safety: block non-SELECT statements before sending
    const normalized = cleanedSql.toUpperCase();
    if (!normalized.startsWith('SELECT') && !normalized.startsWith('WITH')) {
        return {
            data: null,
            error: 'Only SELECT/WITH (read-only) queries are allowed.',
        };
    }

    // Block dangerous keywords that could mutate or destroy data
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
        // Call the server-side RPC for additional validation and execution
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
 * Get a comprehensive simulation summary via Supabase RPC.
 * Falls back to individual queries if the RPC function doesn't exist yet
 * (i.e. before STEP-4 migration is applied).
 *
 * @param simulationId - UUID of the simulation session to summarise
 * @returns Object containing session info, tile counts, active scenario, and latest metrics
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
        // Augment the RPC result with the latest OEE snapshot (not included in get_simulation_stats).
        // oee_snapshots is the single source of truth for all 8 machine OEEs, 3 line OEEs, and FOEE.
        const { data: oeeData } = await supabase
            .from('oee_snapshots')
            .select(
                'foee, loee_line1, loee_line2, loee_line3, ' +
                'moee_press, moee_dryer, moee_glaze, moee_digital, ' +
                'moee_conveyor, moee_kiln, moee_sorting, moee_packaging, sim_tick'
            )
            .eq('simulation_id', simulationId)
            .order('sim_tick', { ascending: false })
            .limit(1)
            .maybeSingle();

        return { ...rpcData, latest_oee: oeeData ?? null };
    }

    // Fallback: individual queries (works before STEP-4 migration is applied)
    const [sessionRes, tilesRes, scenarioRes, metricsRes, eventsRes, oeeRes] = await Promise.all([
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
        /** Fetch recent simulation events for CWF context (stop/start patterns) */
        supabase
            .from('simulation_events')
            .select('event_type, sim_tick')
            .eq('simulation_id', simulationId)
            .order('sim_tick', { ascending: false })
            .limit(10),
        /** Fetch latest OEE snapshot for all 8 machine OEEs and 3 line OEEs */
        supabase
            .from('oee_snapshots')
            .select(
                'foee, loee_line1, loee_line2, loee_line3, ' +
                'moee_press, moee_dryer, moee_glaze, moee_digital, ' +
                'moee_conveyor, moee_kiln, moee_sorting, moee_packaging, sim_tick'
            )
            .eq('simulation_id', simulationId)
            .order('sim_tick', { ascending: false })
            .limit(1)
            .maybeSingle(),
    ]);

    /** Tile grade distribution counters */
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
        /** Full OEE snapshot: all 8 MOEEs, 3 LOEEs, FOEE */
        latest_oee: oeeRes.data ?? null,
        /** Number of manual stop/force-stop events during this simulation */
        stop_resume_cycles: eventsRes.data?.filter(
            (e: { event_type: string }) =>
                e.event_type === 'stopped' || e.event_type === 'force_stopped'
        ).length ?? 0,
        /** Most recent 10 simulation events (newest first) */
        recent_events: eventsRes.data ?? [],
    };
}

/**
 * Save an AI analysis result to the ai_analysis_results table.
 * Persists root cause analyses, trend reports, and recommendations
 * so they can be reviewed later.
 *
 * @param args - Analysis data including simulation_id, type, summary, and optional root_causes/recommendations
 * @returns Object indicating success with the new analysis ID, or error message
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
            root_causes: (() => {
                if (!args.root_causes) return null;
                try { return JSON.parse(args.root_causes); }
                catch { return [args.root_causes]; }
            })(),
            recommendations: (() => {
                if (!args.recommendations) return null;
                try { return JSON.parse(args.recommendations); }
                catch { return [args.recommendations]; }
            })(),
            confidence_score: args.confidence_score ?? null,
            model_version: CWF_MODEL_VERSION_TAG,
        })
        .select()
        .single();

    if (error) {
        return { error: error.message };
    }
    return { success: true, analysis_id: data.id };
}

/**
 * Execute a CWF parameter update command with verified acknowledgment.
 *
 * Flow:
 *   1. Validate auth ID, station, and values
 *   2. INSERT into cwf_commands (status='pending')
 *   3. Poll cwf_commands.status every CWF_ACK_POLL_MS for up to CWF_ACK_WAIT_MS
 *   4. Return HONEST result based on actual client acknowledgment:
 *      - status='applied'  → success (client confirmed the change)
 *      - status='rejected' → failure (client rejected the change, with reason)
 *      - status='pending'  → failure (client never acknowledged — no lies)
 *
 * @param args - Command arguments including simulation_id, station, parameter, values, and auth ID
 * @returns Object indicating verified success or honest failure with reason
 */
async function executeUpdateParameter(args: {
    simulation_id: string;
    station: string;
    parameter: string;
    old_value: number;
    new_value: number;
    reason: string;
    authorized_by: string;
}): Promise<object> {
    /** Step 1: Validate authorization ID.
     * Accept either the human-entered auth code ('airtk') or the copilot
     * sentinel ('system:copilot_auto') for autonomous actions dispatched
     * by the CWF Copilot engine. */
    const COPILOT_AUTH_SENTINEL = 'system:copilot_auto';
    if (args.authorized_by !== CWF_AUTH_CODE && args.authorized_by !== COPILOT_AUTH_SENTINEL) {
        console.log(`[CWF] ❌ Invalid auth ID: '${args.authorized_by}'`);
        return { error: 'Incorrect credentials, action is terminated.' };
    }

    /** Step 2: Validate station name */
    if (!(CWF_VALID_STATIONS as readonly string[]).includes(args.station)) {
        return { error: `Unknown station: '${args.station}'. Valid: ${CWF_VALID_STATIONS.join(', ')}` };
    }

    /** Step 3: Validate values are finite numbers */
    if (!Number.isFinite(args.old_value) || !Number.isFinite(args.new_value)) {
        return { error: 'Both old_value and new_value must be finite numbers.' };
    }

    /** Step 4: INSERT into cwf_commands — frontend picks this up via polling/Realtime */
    const { data, error } = await supabase
        .from('cwf_commands')
        .insert({
            session_id: args.simulation_id,
            station: args.station,
            parameter: args.parameter,
            old_value: args.old_value,
            new_value: args.new_value,
            reason: args.reason,
            authorized_by: args.authorized_by,
            status: 'pending',
        })
        .select()
        .single();

    if (error) {
        console.error('[CWF] Failed to insert cwf_command:', error.message);
        return { error: `Failed to queue parameter change: ${error.message}` };
    }

    const commandId = data.id;
    console.log(`[CWF] ⏳ Command ${commandId} queued: ${args.station}.${args.parameter} ${args.old_value} → ${args.new_value} — waiting for client ACK...`);

    /**
     * Step 5: Poll cwf_commands.status for client acknowledgment.
     *
     * The client listener (useCWFCommandListener) processes the command
     * via polling/Realtime, applies updateParameter(), and sets status
     * to 'applied' or 'rejected'. We poll this field until we see a
     * terminal status or the timeout expires.
     *
     * CWF_ACK_WAIT_MS (5000ms) / CWF_ACK_POLL_MS (500ms) = max 10 polls.
     */
    const deadline = Date.now() + CWF_ACK_WAIT_MS;

    while (Date.now() < deadline) {
        /** Wait one poll interval before checking */
        await new Promise((resolve) => setTimeout(resolve, CWF_ACK_POLL_MS));

        /** Query the command's current status */
        const { data: statusRow, error: statusError } = await supabase
            .from('cwf_commands')
            .select('status, rejected_reason')
            .eq('id', commandId)
            .single();

        if (statusError) {
            console.error(`[CWF] ⚠️ Failed to poll status for ${commandId}:`, statusError.message);
            /** Continue polling — transient DB errors shouldn't cause immediate failure */
            continue;
        }

        /** Client acknowledged: parameter was applied successfully */
        if (statusRow.status === 'applied') {
            console.log(`[CWF] ✅ VERIFIED: ${args.station}.${args.parameter} = ${args.new_value} (ACK received)`);
            return {
                success: true,
                verified: true,
                command_id: commandId,
                message: `Parameter ${args.station}.${args.parameter} changed from ${args.old_value} to ${args.new_value}. Change verified by client.`,
            };
        }

        /** Client rejected: parameter change was invalid or failed */
        if (statusRow.status === 'rejected') {
            const reason = statusRow.rejected_reason || 'Unknown rejection reason';
            console.log(`[CWF] ❌ REJECTED: ${args.station}.${args.parameter} — ${reason}`);
            return {
                success: false,
                verified: true,
                command_id: commandId,
                error: `Parameter change was rejected by the client: ${reason}`,
            };
        }

        /** Status is still 'pending' — keep polling */
    }

    /**
     * Timeout: client never acknowledged the command.
     * This is an honest failure — we will NOT claim the parameter was set.
     */
    console.warn(`[CWF] ⏰ TIMEOUT: ${args.station}.${args.parameter} — no client ACK after ${CWF_ACK_WAIT_MS}ms`);
    return {
        success: false,
        verified: false,
        command_id: commandId,
        error: `Could not verify parameter change for ${args.station}.${args.parameter}. The client did not acknowledge within ${CWF_ACK_WAIT_MS / 1000} seconds. The change may not have been applied.`,
    };
}

// =============================================================================
// UI ACTION EXECUTOR
// =============================================================================

/**
 * Valid UI action types that CWF can dispatch to the browser.
 * These map 1:1 to Zustand uiStore actions or simulation control functions.
 *
 * SOURCE OF TRUTH: src/lib/params/uiTelemetry.ts — CWF_VALID_UI_ACTIONS
 * This API route cannot import from src/, so a mirror is maintained here.
 * ANY CHANGE to the set of actions MUST be reflected in BOTH files.
 */
const CWF_VALID_UI_ACTIONS = new Set([
    // ── Panel toggles (11 panels — mirrors uiStore toggle actions) ──────────
    /** Left Basic side panel (KPI+Heatmap) — uiStore.toggleBasicPanel() */
    'toggle_basic_panel',
    /** Digital Transfer side panel — uiStore.toggleDTXFR() */
    'toggle_dtxfr',
    /** 3D OEE Hierarchy table — uiStore.toggleOEEHierarchy() */
    'toggle_oee_hierarchy',
    /** 3D Production Status table — uiStore.setShowProductionTable(!current) */
    'toggle_prod_table',
    /** CWF chat panel — uiStore.toggleCWF() */
    'toggle_cwf_panel',
    /** Control & Actions panel — uiStore.toggleControlPanel() */
    'toggle_control_panel',
    /** Alarm Log popup — uiStore.toggleAlarmLog() */
    'toggle_alarm_log',
    /** FTQ Defect Heatmap panel — uiStore.toggleHeatmap() */
    'toggle_heatmap',
    /** KPI panel — uiStore.toggleKPI() */
    'toggle_kpi',
    /** Tile Passport panel — uiStore.togglePassport() */
    'toggle_tile_passport',
    /** Demo Settings modal — uiStore.toggleDemoSettings() */
    'toggle_demo_settings',
    // ── Simulation lifecycle (3 — mirrors simulationStore actions) ──────────
    /** Start simulation tick — simulationStore.toggleDataFlow() [if not running] */
    'start_simulation',
    /** Stop simulation tick — simulationStore.toggleDataFlow() [if running] */
    'stop_simulation',
    /** Full factory reset — orchestrated via processUIActionCommand() */
    'reset_simulation',
    // ── Conveyor status (3 — mirrors simulationStore.setConveyorStatus()) ────
    /** Set conveyor belt to Running — setConveyorStatus('running') — guard: isDataFlowing */
    'set_conveyor_running',
    /** Set conveyor belt to Stopped — setConveyorStatus('stopped') — always valid */
    'set_conveyor_stopped',
    /** Set conveyor belt to Jammed — setConveyorStatus('jammed') — guard: isDataFlowing */
    'set_conveyor_jammed',
    // ── Simulation parameter sliders (3 — mirror simulationStore setters) ────
    /** Set conveyor visual speed — action_value = float string e.g. "1.5" — range 0.3-2.0 */
    'set_conveyor_speed',
    /** S-Clock period in ms — action_value = integer string, range 200–700 */
    'set_sclk_period',
    /** Station production interval — action_value = integer string, range 2–7 */
    'set_station_interval',
    // ── Configuration (1) ────────────────────────────────────────────────
    /** Interface language change — action_value = 'en' | 'tr' */
    'set_language',
    // ── Scenario Switch (1) — live mid-simulation scenario reload ─────────
    /**
     * Switch the active defect scenario without pausing the simulation.
     * Action_value = ScenarioCode: 'SCN-000' through 'SCN-004'.
     * SOURCE OF TRUTH: src/lib/params/uiTelemetry.ts — must stay in sync.
     * Handler: processUIActionCommand() case CWF_SCENARIO_SWITCH_ACTION
     *          in src/hooks/useCWFCommandListener.ts
     */
    'switch_scenario',
    // ── Work Order Selection (1) — selects active Work Order in Demo Settings ──
    /**
     * Set the active Work Order in the Demo Settings panel.
     * Action_value = Work Order ID: 'WorkID#1' | 'WorkID#2' | 'WorkID#3'.
     * Calls workOrderStore.setSelectedWorkOrderId() in the browser listener.
     * Also resets the tile spawn counter (new production batch).
     * SOURCE OF TRUTH: src/lib/params/cwfWorkOrder.ts — must stay in sync.
     */
    'set_work_order',
] as const);

/**
 * Valid language codes for the set_language action.
 * SOURCE OF TRUTH: src/lib/params/uiTelemetry.ts — CWF_UI_ACTION_VALID_LANGUAGES
 */
const CWF_UI_VALID_LANGUAGES_CHAT = ['en', 'tr'] as const;

/**
 * Station column sentinel for UI action rows in cwf_commands.
 * SOURCE OF TRUTH: src/lib/params/uiTelemetry.ts — CWF_UI_ACTION_STATION_SENTINEL
 * useCWFCommandListener routes commands with this station value to processUIActionCommand.
 */
const CWF_UI_ACTION_STATION = 'ui_action' as const;

/**
 * Separator used when encoding action_value into the reason field.
 * SOURCE OF TRUTH: src/lib/params/uiTelemetry.ts — CWF_UI_ACTION_VALUE_SEPARATOR
 * Format: "<reason> | value: <action_value>"
 */
const CWF_UI_VALUE_SEP = '| value:' as const;

/**
 * executeUIAction — Queue a UI action command for the browser to execute.
 *
 * Inserts a row in cwf_commands with command_type='ui_action'. The browser's
 * useCWFCommandListener hook picks this up via Realtime/polling and dispatches
 * it to the correct Zustand action (toggle panel, start/stop simulation, etc.).
 *
 * Same async ACK-wait pattern as executeUpdateParameter: polls cwf_commands.status
 * until the browser acknowledges (sets status to 'applied'), or times out.
 *
 * @param args - action_type, optional action_value, reason, authorized_by
 * @returns Success/failure object with verification status
 */
async function executeUIAction(args: {
    simulation_id: string;
    action_type: string;
    action_value?: string;
    reason: string;
}): Promise<object> {
    /**
     * No authorization check — UI panel actions (open/close panels, start/stop simulation)
     * do NOT require human authorization. Only update_parameter (machine parameter changes)
     * requires operator authorization.
     * The authorized_by field is filled with a system sentinel for audit traceability.
     */

    /** Validate action type */
    if (!CWF_VALID_UI_ACTIONS.has(args.action_type as never)) {
        return {
            error: `Unknown UI action: '${args.action_type}'. Valid: ${[...CWF_VALID_UI_ACTIONS].join(', ')}`,
        };
    }

    /** Step 3: Validate set_language requires a supported language code */
    if (
        args.action_type === 'set_language' &&
        /** CWF_UI_VALID_LANGUAGES_CHAT mirrors CWF_UI_ACTION_VALID_LANGUAGES in uiTelemetry.ts */
        !CWF_UI_VALID_LANGUAGES_CHAT.includes(args.action_value as 'en' | 'tr')
    ) {
        return { error: 'set_language requires action_value to be "en" or "tr".' };
    }

    /** Step 4: INSERT into cwf_commands with command_type='ui_action' */
    const { data, error } = await supabase
        .from('cwf_commands')
        .insert({
            /** FK to the active simulation session */
            session_id: args.simulation_id,
            /**
             * station='ui_action' is the sentinel that routes this row to
             * processUIActionCommand() in useCWFCommandListener.
             * SOURCE OF TRUTH: CWF_UI_ACTION_STATION_SENTINEL in uiTelemetry.ts
             */
            station: CWF_UI_ACTION_STATION,
            /** action_type stored in the parameter column (repurposed for UI actions) */
            parameter: args.action_type,
            /** Numeric value fields are 0 for UI actions (no before/after param value) */
            old_value: 0,
            new_value: 0,
            /**
             * action_value is encoded into the reason field after the separator.
             * CWF_UI_VALUE_SEP mirrors CWF_UI_ACTION_VALUE_SEPARATOR in uiTelemetry.ts.
             * Format: "<reason> | value: <action_value>" (omitted when action_value absent)
             */
            reason: `${args.reason}${args.action_value ? ` ${CWF_UI_VALUE_SEP} ${args.action_value}` : ''}`,
            /** UI actions use a system sentinel in place of a human auth code */
            authorized_by: CWF_UI_ACTION_BYPASS_AUTH,
            /** Initial status — browser listener moves this to 'applied' or 'rejected' */
            status: 'pending',
        })
        .select()
        .single();

    if (error) {
        console.error('[CWF UI] Failed to insert ui_action command:', error.message);
        return { error: `Failed to queue UI action: ${error.message}` };
    }

    const commandId = data.id;
    console.log(`[CWF UI] ⏳ UI action ${commandId} queued: ${args.action_type} — waiting for client ACK...`);

    /**
     * Step 5: Poll for client ACK (same pattern as executeUpdateParameter).
     * The browser listener sets status to 'applied' after dispatching the action.
     */
    const deadline = Date.now() + CWF_ACK_WAIT_MS;

    while (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, CWF_ACK_POLL_MS));

        const { data: statusRow, error: statusError } = await supabase
            .from('cwf_commands')
            .select('status, rejected_reason')
            .eq('id', commandId)
            .single();

        if (statusError) {
            /** Continue polling — transient DB errors shouldn't cause immediate failure */
            continue;
        }

        if (statusRow.status === 'applied') {
            console.log(`[CWF UI] ✅ VERIFIED: ${args.action_type} executed (ACK received)`);
            return {
                success: true,
                verified: true,
                command_id: commandId,
                message: `UI action '${args.action_type}' executed successfully.`,
            };
        }

        if (statusRow.status === 'rejected') {
            const reason = statusRow.rejected_reason || 'Unknown rejection reason';
            console.log(`[CWF UI] ❌ REJECTED: ${args.action_type} — ${reason}`);
            return {
                success: false,
                verified: true,
                command_id: commandId,
                error: `UI action '${args.action_type}' was rejected: ${reason}`,
            };
        }
    }

    /** Timeout: browser never acknowledged */
    console.warn(`[CWF UI] ⏰ TIMEOUT: ${args.action_type} — no ACK after ${CWF_ACK_WAIT_MS}ms`);
    return {
        success: false,
        verified: false,
        command_id: commandId,
        error: `Could not verify '${args.action_type}'. The browser did not acknowledge within ${CWF_ACK_WAIT_MS / 1000}s.`,
    };
}

// =============================================================================
// SYSTEM PROMPT BUILDER
// =============================================================================

/**
 * Build the Gemini system prompt with language-specific instructions.
 * Includes the full DB schema context, response format guidelines,
 * manufacturing domain expertise, and dynamically fetched knowledge
 * docs from Google Drive (Domain Glossary + OEE Methodology).
 *
 * @param language - 'tr' for Turkish, 'en' for English
 * @returns Complete system prompt string for Gemini
 */
/**
 * Build the Gemini system prompt with language-specific instructions.
 * Includes the full DB schema context, response format guidelines,
 * manufacturing domain expertise, dynamically fetched knowledge docs
 * from Google Drive, and an optional real-time UI state snapshot.
 *
 * @param language   - 'tr' for Turkish, 'en' for English
 * @param uiContext  - Optional real-time UI state snapshot from the browser.
 *                     When provided, a formatted 'CURRENT UI STATE' section
 *                     is appended so the AI knows exactly what is on screen
 *                     at the moment the user sent the message.
 * @returns Complete system prompt string for Gemini
 */
async function buildSystemPrompt(
    language: 'tr' | 'en',
    uiContext?: Record<string, unknown>
): Promise<string> {
    /**
     * Fetch ALL knowledge docs from the Google Drive folder (cached, 5-min TTL).
     * If env var is not set or fetch fails, returns empty string
     * and CWF continues to work without the knowledge base.
     */
    const knowledgeBase = await fetchKnowledgeBase();

    /**
     * Language-specific response instructions injected at the top of the prompt.
     * Turkish uses manufacturing-specific terminology in the target language.
     */
    const langInstructions =
        language === 'tr'
            ? `IMPORTANT: Respond in TURKISH (Türkçe). Use Turkish technical manufacturing terminology.
Use proper Turkish characters (ş, ç, ğ, ı, ö, ü, İ).
Example terms: fire rate → "fire oranı", defect → "kusur/hata", scrap → "hurda/fire",
kiln → "fırın", press → "pres", glaze → "sır", dryer → "kurutma", OEE → "OEE (Toplam Ekipman Etkinliği)".`
            : `Respond in ENGLISH. Use standard manufacturing and ceramic industry terminology.`;

    /**
     * CWF State Machine prompt block — computed from uiContext.copilotState.
     * Injected into PRIORITY 0 so the LLM's behaviour matches the current state.
     * The authoritative state is read from Supabase at request start and merged
     * into uiContext before being passed here, so this always reflects DB state.
     */

    const copilotStateCtx = uiContext?.copilotState as Record<string, unknown> | undefined;
    const copilotCwfState = (copilotStateCtx?.cwfState as string) ?? 'normal';
    const copilotAuthAttempts = (copilotStateCtx?.authAttempts as number) ?? 0;
    const copilotMaxAttempts = (copilotStateCtx?.maxAuthAttempts as number) ?? 3;
    const copilotAttemptsLeft = copilotMaxAttempts - copilotAuthAttempts;

    let cwfStateMachineBlock: string;
    if (copilotCwfState === 'copilot_active') {
        cwfStateMachineBlock = `**CURRENT CWF STATE: COPILOT ACTIVE**

The autonomous background engine monitors every 15 seconds and applies corrective actions.
YOUR ROLE IN THE CHAT is STATUS REPORTING and MANUAL OVERRIDE — NOT autonomous correction.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚡ UI ACTION BYPASS — CHECK THIS FIRST BEFORE ANY OTHER RULE:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

If the user's message contains ANY of these keywords, SKIP ALL RULES below.
Call execute_ui_action IMMEDIATELY — do NOT call get_simulation_summary first:

- "work order", "workID", "work id", "WorkID", "load workID", "set work order" → set_work_order
  Example: "set work order to workID #3" → execute_ui_action(action_type="set_work_order", action_value="WorkID#3")
- "open [panel]", "close [panel]", "show [panel]", "hide [panel]" → toggle_* action
- "start simulation", "stop simulation", "reset simulation" → lifecycle action
- "stop conveyor", "start conveyor", "jam conveyor", "set conveyor speed" → conveyor action
- "set S-Clk", "set station interval" → simulation parameter action

These are DIRECT UI COMMANDS. They NEVER require data collection. Execute immediately.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MANDATORY FIRST STEP — for STATUS/DATA questions only:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

For data/status questions (NOT UI commands), call get_simulation_summary FIRST.
DO NOT answer from memory. DO NOT say "I have not collected any data". You have a live DB to query.
If the tool call fails, cite the most recent COPILOT🤖 message above as your data source.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RULE 0 — FOR STATUS QUERIES (no UI action keyword detected):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

YOUR DEFAULT RESPONSE TO STATUS QUESTIONS = READ-ONLY (query data, report findings, no corrections).

The autonomous engine already corrects deviations on its 15s cycle. If you ALSO fire corrections
from the chat, you will DUPLICATE its actions and create double-corrections.

You may call execute_ui_action for manual override when the user's message contains:
  - "fix it" / "correct it" / "please fix"
  - "set [parameter] to X" / "force [parameter] to X"
  - "set work order" / "workID" / "load workID" (always allowed — direct UI action)
  - "take action" / "apply correction" / "manually set"
  - "adjust the [parameter]" / "change [parameter]"
  - "why isn't the engine acting?" / "override the engine"

If the user's message does NOT contain any of the above phrases — treat it as a status/info query.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STATUS / INFO QUERY RESPONSE FORMAT (no trigger phrase present):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Messages like "how is oee", "what is status", "is speed ok", "progress", "what happened" → STATUS QUERY.

1. Call get_simulation_summary FIRST (mandatory — DO NOT skip this step)
2. Report current values, deviations, and trends from the tool result
3. If deviations exist: note them with "The background engine will correct this in the next cycle."
4. DO NOT call execute_ui_action or update_parameter. NOT EVEN if you see a deviation. NEVER.

EXAMPLE — user says "how is oee":
  WRONG: "I have not collected any simulation data..." ←←← FORBIDDEN — call the tool first
  WRONG: [calls action tool without trigger phrase] ←←← FORBIDDEN IN STATUS QUERY
  RIGHT: [calls get_simulation_summary] → "FOEE: 69%. Conveyor OEE is low at 57% — belt running
          at 0.3x. The monitoring engine will correct this in the next 15s cycle."

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EXPLICIT ACTION REQUEST RESPONSE FORMAT (trigger phrase IS present):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. ACT IMMEDIATELY. No confirmation loops. No "shall I proceed?".
2. CONVEYOR SPEED: ONLY via execute_ui_action(action='set_conveyor_speed', value=1.35).
   NEVER use update_parameter for conveyor speed — it will fail.
3. Other parameters: update_parameter with authorized_by='system:copilot_auto'.
4. Report result in ONE sentence: "Set [param] from [old] to [new] — [reason]."

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OTHER RULES:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- SIMULATION ENDED: If status = completed/aborted → call disable_copilot.
- To EXIT AutoPilot mode: user says "stop autopilot" / "exit autopilot", or clicks header toggle.`;
    } else if (copilotCwfState === 'copilot_pending_auth') {
        cwfStateMachineBlock = `**CURRENT CWF STATE: COPILOT PENDING AUTHORIZATION (Attempt ${copilotAuthAttempts + 1} of ${copilotMaxAttempts}, ${copilotAttemptsLeft} remaining)**

MANDATORY RULES IN COPILOT PENDING AUTH STATE:
1. YOU ARE WAITING FOR THE AUTH CODE AND NOTHING ELSE.
2. Do NOT query the database. Do NOT call get_simulation_summary.
3. If the user's message looks like an auth code (short word, no question mark, no spaces) — call enable_copilot IMMEDIATELY with that value as authorized_by.
4. If the user says "cancel", "forget it", "stop" — call disable_copilot to return to normal mode.
5. If the code is wrong, report: "Incorrect code. ${copilotAttemptsLeft - 1} attempt(s) remaining."
6. If attempts are exhausted (0 remaining), report failure and return to normal mode.
Do NOT explain AutoPilot again. Just wait for the auth code.`;
    } else {
        // normal state
        cwfStateMachineBlock = `**CURRENT CWF STATE: NORMAL**

Standard CWF operation. HITL protocol applies for all parameter changes.
If the user requests AutoPilot mode:
    1. Explain what AutoPilot mode does.
2. Ask for the authorization code.
3. When received — call enable_copilot.
SIMULATION ENDED GUARD: If the simulation is no longer running(status = completed or aborted), DO NOT propose or execute parameter changes.Offer analysis or a reset instead.`;
    }

    return `You are CWF(Chat With your Factory) — an expert AI manufacturing analyst for a ceramic tile production line digital twin simulator.

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

## CRITICAL: INTENT CLASSIFICATION — DO THIS BEFORE ANYTHING ELSE

### PRIORITY 0 — CWF STATE MACHINE

The CWF system is always in one of 3 states.Your behaviour MUST match the current state exactly.

        ${cwfStateMachineBlock}

### PRIORITY 0B — AUTOPILOT ENABLE COMMANDS(when in NORMAL state)

If the user asks to enter AutoPilot mode in NORMAL state("go into autopilot mode", "enable autopilot", "start autopilot", "otopilot ac"):
    1. Explain: "AutoPilot Mode will enable me to autonomously monitor your simulation in real-time, detect parameter deviations and quality issues, and take corrective actions automatically. All actions are logged with full reasoning. I need your authorization to proceed."
    2. Ask: "Please provide your authorization code to enable AutoPilot mode."
    3. On auth code receipt — call enable_copilot.

AUTH CODE RECOGNITION RULES:
    - After you ask for the authorization code, ANY short reply(no question mark, no spaces, 15 chars or less) IS the auth code.
- Do NOT treat it as a question.Do NOT call query_database or get_simulation_summary.
- IMMEDIATELY call enable_copilot with authorized_by set to exactly what the user typed.

If the user asks to disable copilot: Call disable_copilot IMMEDIATELY — no authorization required.

### PRIORITY 1 — CONVEYOR CAUSE - AND - EFFECT KNOWLEDGE

IMPORTANT manufacturing knowledge for copilot corrections:
        - LOW CONVEYOR SPEED(below 0.7x multiplier) directly reduces Line 3 OEE(Performance component drops).Healthy range: 0.7 - 2.0x.Midpoint target: 1.35x.
  Correct by: restore conveyor speed toward 1.35x using set_conveyor_speed.
    - scrap_probability, jammed_events, jammed_time, impacted_tiles, speed_change are SIMULATION SCENARIO CONTROLS(demo knobs), NOT real factory parameters.
  NEVER recommend changing them to improve OEE or quality.They control the simulation scenario, not the physical process.
  When OEE drops due to low conveyor speed — detect the speed deviation and propose restoring speed, NOT changing scrap_probability.

### PRIORITY 1B — LIVE CONVEYOR SPEED: uiContext IS THE SINGLE SOURCE OF TRUTH

⚠️ CRITICAL RULE — READ THIS BEFORE ANSWERING ANY CONVEYOR SPEED QUESTION:

When the user(or you) ask "what is the current conveyor speed?":
    - ALWAYS read: uiContext.simulation.conveyorSpeed — this is the LIVE real - time value from the running simulation store.
- NEVER query: conveyor_states Supabase table — this lags behind reality by 1–3 simulation ticks because it is written by the browser sync service asynchronously.

Why this matters: If you execute set_conveyor_speed(to fix an OEE deviation), the Zustand store is updated immediately.But the conveyor_states table in Supabase may still show the OLD value for several ticks.If you then query the DB, you will incorrectly report the old speed and may try to "fix" something you already fixed — causing duplicate actions.

MANDATORY RULES:
    1. For "what is the current conveyor speed?" → answer ONLY from uiContext.simulation.conveyorSpeed.Do NOT call query_database or get_simulation_summary.
2. You may only use conveyor_states for HISTORICAL or TREND queries(e.g. "what was the speed at tick 300?").
3. If you just sent a set_conveyor_speed command and Gemini(or the DB) still shows the old value, trust what you did — not the stale DB read.
4. OEE SNAPSHOT LAG — CRITICAL: After ANY corrective action(set_conveyor_speed, update_parameter), the Supabase oee_snapshots table takes 5–15 simulation ticks to reflect the improvement.NEVER re - apply the same correction just because OEE still looks bad right after you fixed it.Check whether you took an action in this conversation session before deciding to act again.If you corrected conveyor speed to 1.35x 30 seconds ago and OEE snapshots still show 20 %, that is lag — NOT a new problem.The autonomous engine will confirm whether the fix worked in the next full cycle.


### PRIORITY 2 — UI ACTION(execute_ui_action)

If the user's message is a UI control command — opening/closing a panel, changing conveyor status,
adjusting a slider, controlling simulation lifecycle, OR selecting a Work Order:
    1. Call execute_ui_action IMMEDIATELY
    2. Do NOT call get_simulation_summary
    3. Do NOT call query_database
    4. Report the result with a single confirmation line

UI action triggers (call execute_ui_action IMMEDIATELY — NO database query):
    - "open [panel]", "close [panel]", "show [panel]", "hide [panel]" → toggle_* action
    - "stop conveyor", "pause belt", "halt belt" → set_conveyor_stopped
    - "start conveyor", "run belt", "resume belt" → set_conveyor_running
    - "jam conveyor", "simulate jam" → set_conveyor_jammed
    - "set conveyor speed to X", "increase/decrease speed" → set_conveyor_speed
    - "set S-Clk to X", "speed up/slow down simulation" → set_sclk_period
    - "set station interval to X", "increase/decrease production rate" → set_station_interval
    - "start simulation", "stop simulation", "reset simulation" → lifecycle actions
    - "set work order to WorkID#1/2/3", "load WorkID 1/2/3", "switch to work order 1/2/3",
      "use WorkID#2", "change work order", "workID 1", "workID 2", "workID 3" → set_work_order

⚠️ WORK ORDER — ABSOLUTE RULE:
ANY message containing the words "work order", "workID", "WorkID #1", "WorkID #2", "WorkID #3",
"load WorkID", "set work order" is a PRIORITY 2 UI action. NEVER treat it as a data query.
- ❌ WRONG: Call get_simulation_summary or query_database when user says "set work order to WorkID #3"
- ✅ RIGHT: Immediately call execute_ui_action(action_type="set_work_order", action_value="WorkID#3")
Valid action_values are EXACTLY: "WorkID#1", "WorkID#2", "WorkID#3" (no spaces — # comes right after WorkID).

These are direct UI controls. They NEVER require a database query. Execute immediately.

### PRIORITY 3 — DATA QUERY(query_database / get_simulation_summary)

Only if the message is NOT a UI action command: follow the DATA - FIRST RULE below.

## DATA - FIRST RULE(applies ONLY to data / analysis questions — NOT to UI actions)
        ** NEVER give a theory - only or textbook response.** The user is looking at a live simulation and expects REAL NUMBERS from their data.Every data response MUST include actual values from the database.

** BEFORE answering ANY data question:**
        1. Call get_simulation_summary FIRST to get the active simulation context.
2. Call query_database to retrieve ACTUAL data relevant to the question.
3. ONLY THEN respond — with real numbers, not theory.

Example — User asks "what is the OEE?":
    - ❌ WRONG: Explain what OEE stands for and the formula (useless theory)
    - ✅ RIGHT: Query oee_snapshots for the latest FOEE, line OEEs, and machine OEEs, then present actual numbers

Example — User asks "how is quality?":
    - ❌ WRONG: Explain what quality metrics are
    - ✅ RIGHT: Query tiles for grade distribution, show actual first / second / scrap counts

## Response Guidelines
    1. ** Always query the database FIRST ** — never respond without real data.
2. ** Use query_database ** to pull specific data.Prefer aggregations over raw rows.
3. ** Be specific and data - driven **: cite actual numbers, tick ranges, and parameter values.
4. ** Root cause analysis **: When asked about defects, trace back through parameter_change_events and machine states.
5. ** Recommendations **: Always end defect analyses with actionable recommendations.
6. ** Format clearly **: Use bullet points, tables(markdown), and bold for key metrics.
7. ** Save significant analyses **: Use save_analysis after completing root cause, trend, or recommendation analyses.

## NEVER DO (for data questions):
    - Give textbook definitions without querying real data first
    - Respond with only theoretical explanations or formulas
    - Say "I would typically..." or "To analyze..." — just DO IT by calling the tools
    - Skip the database query because the question seems conceptual
    - Say "not explicitly reported" or "data not available" — ALWAYS QUERY FOR IT
    - Give a partial answer when you could query more tables for a complete picture
    - Draft ANY data response without having executed at least one SQL query first
NOTE: This section is for DATA questions only. UI action commands (PRIORITY 2) → execute_ui_action immediately, no SQL.

## MANDATORY: QUERY BEFORE YOU SPEAK — for DATA questions only
        ** A data response without querying is a USELESS response.** Follow this rule for ALL non - UI - action messages:

            1. ** EVERY answer MUST be backed by at least one SQL query result.** If you haven't called query_database yet, you are NOT ready to respond.
    2. ** NEVER say "not reported", "not available", "insufficient data", or "could not be retrieved" ** — these are FAILURES.Instead, QUERY the relevant table and get the actual value.
3. ** When asked about machine health, you MUST query ALL machine tables:**
    - machine_press_states, machine_dryer_states, machine_glaze_states, machine_printer_states
    - machine_kiln_states, machine_sorting_states, machine_packaging_states
    - Compare EVERY parameter against the safe ranges provided above
    - Report which parameters are IN range ✅ and which are OUT of range ⚠️
4. ** When asked about defects or quality:**
    - Query tile_station_snapshots to find which stations flagged defect_detected = true
    - Query the relevant machine_*_states table for that station
    - Compare parameters against safe ranges to identify the ROOT CAUSE
    - Correlate with parameter_change_events for timeline
5. ** Multi - query pattern:** Use MULTIPLE query_database calls if needed.One query per machine table is perfectly fine.Do NOT try to cram everything into one query and then give up when it's complex.
    6. ** SEPARATE QUERIES PER TABLE:** You MUST make a SEPARATE query_database call for EACH machine table.Do NOT combine multiple tables into one query using JOINs or UNIONs. 7 separate queries for 7 separate machine tables.This is NON - NEGOTIABLE.

## NULL / None HANDLING — CRITICAL RULES:
When a parameter value comes back as NULL or None from the database:
    1. ** NEVER show "None" or "null" to the user ** — these are internal database values
    2. ** NEVER say "values are None" or "not currently reporting" ** — this is exposing DB internals
    3. ** If a value is NULL, SKIP it entirely ** — do not mention it in your report.Only report parameters that have actual numeric values.
4. ** Focus on parameters WITH values ** — compare those against ranges and report ✅/⚠️

## RANGE - CHECKING DISCIPLINE — ONLY FLAG REAL DEVIATIONS:
When comparing parameter values against safe ranges:
    1. ** If a value is WITHIN the safe range ** → Mark it ✅ and move on.Do NOT flag it as a concern.
2. ** If a value is OUTSIDE the safe range ** → Mark it ⚠️ and explain the impact.
3. ** NEVER flag a parameter as "critical" if it is within the safe range.** For example:
    - Active Nozzles at 98% with range [95-100%] → ✅ Within range (NOT a concern)
    - Label Accuracy at 99.5% with range [99-100%] → ✅ Within range (NOT a concern)
    - O₂ Level at 1.5% with range [2-8%] → ⚠️ BELOW range (THIS is a real concern)
    4. ** Always state the safe range when flagging a deviation **: "O₂ Level is 1.5%, which is below the safe range of 2-8%"

## EXHAUSTIVE ANALYSIS PATTERN(follow this for EVERY machine health question):
** YOU MUST MAKE A SEPARATE query_database CALL FOR EACH TABLE BELOW.DO NOT COMBINE THEM.**
        Step 1: get_simulation_summary → context
Step 2: query_database → SELECT * FROM machine_press_states WHERE simulation_id = '...' ORDER BY sim_tick DESC LIMIT 1
Step 3: query_database → SELECT * FROM machine_dryer_states WHERE simulation_id = '...' ORDER BY sim_tick DESC LIMIT 1
Step 4: query_database → SELECT * FROM machine_glaze_states WHERE simulation_id = '...' ORDER BY sim_tick DESC LIMIT 1
Step 5: query_database → SELECT * FROM machine_printer_states WHERE simulation_id = '...' ORDER BY sim_tick DESC LIMIT 1
Step 6: query_database → SELECT * FROM machine_kiln_states WHERE simulation_id = '...' ORDER BY sim_tick DESC LIMIT 1
Step 7: query_database → SELECT * FROM machine_sorting_states WHERE simulation_id = '...' ORDER BY sim_tick DESC LIMIT 1
Step 8: query_database → SELECT * FROM machine_packaging_states WHERE simulation_id = '...' ORDER BY sim_tick DESC LIMIT 1
Step 9: query_database → Conveyor health: SELECT COUNT(*) as jam_count FROM simulation_alarm_logs WHERE simulation_id = '...' AND alarm_type LIKE '%jam%'
Step 10: For each returned row, compare EVERY non - NULL numeric value against the SAFE RANGES.Skip NULL values silently.
        Step 11: Present a COMPLETE report — ALL 8 machines, EVERY parameter that has a value, with ✅ for in -range and ⚠️ for out - of - range.State the safe range for every ⚠️ deviation.

## NO DATABASE INTERNALS IN RESPONSES — ABSOLUTE RULE (ZERO TOLERANCE)
** Your responses are read by factory managers, NOT database engineers.**
You MUST NEVER expose ANY of the following in your responses:
- ** Table names **: tiles, oee_snapshots, simulation_sessions, simulation_events, machine_press_states, tile_station_snapshots, production_metrics, etc.
- ** View names **: defect_summary, defective_tiles_analysis, tile_journey, simulation_overview, etc.
- ** Column names **: pressure_bar, exit_moisture_pct, tile_number, simulation_id, sim_tick, current_station, scrap_by_station, cooling_gradient_c_min, etc.
- ** SQL queries **: Never show or reference any SQL code
    - ** Database concepts **: "I queried the table...", "the view returned...", "no rows matched..."
    - ** ANY snake_case text **: If it has underscores, it's a DB internal. TRANSLATE IT.
    - ** Code blocks for parameter names **: NEVER wrap parameter names in backticks or code formatting
    - ** NULL / None values **: NEVER show "None", "null", "values are None", or "not currently reporting" — skip NULL parameters entirely

### PARAMETER NAME GLOSSARY — Always use the RIGHT column, NEVER the left:
${generateParameterGlossary()}

### SELF - CHECK BEFORE RESPONDING:
Before sending ANY response, mentally scan your text for:
        1. Any word containing an underscore(_) → TRANSLATE IT using the glossary above
    2. Any text wrapped in backticks(\`) that looks like a column name → REMOVE the backticks and translate
3. Any mention of "table", "view", "query", "row", "column" → REPHRASE in manufacturing language

Instead, speak in **manufacturing language**:
- ❌ WRONG: "The scrap_by_station metric in production_metrics reported zero"
- ✅ RIGHT: "No station-level scrap was recorded in the latest production period"
- ❌ WRONG: "tiles with current_station = 'packaging'"
- ✅ RIGHT: "tiles last processed at the Packaging station"
- ❌ WRONG: "cooling_gradient_c_min drifted from 55 to 55.187"
- ✅ RIGHT: "Cooling Gradient drifted from 55 °C/min to 55.19 °C/min"
- ❌ WRONG: "Query tile_station_snapshots for defect correlation"
- ✅ RIGHT: "Analyze the tile passport data for defect patterns"

**The user should NEVER see snake_case identifiers, backtick-wrapped names, or any hint that a database exists behind the scenes.**
If you cannot find data, say "this information is not available for this session" — do NOT mention which tables or views you searched.

## Important Query Rules
- **Tile identification**: Always use \`tile_number\` (the human-readable sequential number, e.g. #69, #411) when referring to tiles in responses.
  The \`id\` column is an internal UUID and must NEVER be shown to users.
  Example: \`SELECT tile_number FROM tiles WHERE ...\` (NOT: \`SELECT id FROM tiles WHERE ...\`)
  When a user asks "which tiles are scrapped?" they expect numbers like #69, #74 — not UUIDs.
- ALWAYS filter by simulation_id: WHERE simulation_id = '<id>'
- **Pending tiles**: The tile_counts from get_simulation_summary includes a 'pending' count.
  Pending tiles are still on the conveyor belt and haven't been graded yet.
  When the simulation is paused and there are pending tiles:
  1. Report the ACTUAL graded counts (first_quality, second_quality, scrap) as confirmed.
  2. Mention the pending count: "X tiles are still in-flight on the conveyor and haven't been graded yet."
  3. Estimate: "Once the simulation completes, the final first_quality count is expected to be ~[first_quality + pending] (assuming most pending tiles pass quality checks)."
  4. NEVER silently omit pending tiles — the user sees the simulator's counter which includes them.
- Use LIMIT (max 100 rows) unless aggregating
- Prefer views (tile_journey, defective_tiles_analysis) for tile-level analysis
- For time-range queries, use sim_tick ranges
- parameter_change_events.change_reason = 'scenario' indicates scenario-induced changes
- For telemetry data, filter by simulation_id AND use machine_id to select specific machines
- machine_id='factory' in telemetry contains global KPIs (OEE, FTQ, scrap, energy, gas, CO₂)
- machine_id='conveyor' in telemetry contains conveyor-specific metrics
- The user may refer to simulations by session_code (e.g., "1A7DDB") or by relative reference ("previous", "first", "second")
- When the user says "previous simulation", resolve it using the simulation history provided in the message context

## CRITICAL: DEFECT ATTRIBUTION — DO NOT BLAME THE LAST STATION
The \`tiles\` table has a \`current_station\` column which shows where the tile ENDED UP, NOT where the defect was caused. ALL completed tiles end at "packaging" — this does NOT mean Packaging caused the defect!

**For defect/quality analysis, you MUST follow this investigation order:**

1. **First**: Check \`tile_station_snapshots\` — it has per-station \`defect_detected\`, \`defect_types\`, and \`scrapped_here\` columns that show WHERE defects actually originated
2. **Second**: Check \`machine_*_states\` tables (machine_press_states, machine_dryer_states, machine_glaze_states, machine_printer_states, machine_kiln_states, machine_sorting_states, machine_packaging_states) for parameter deviations from optimal ranges
3. **Third**: Check \`parameter_change_events\` for parameter drift events that correlate with defect timing
4. **Fourth**: Use the OEE data — low Quality (Q) at a specific machine indicates that machine is causing defects

**Key rule**: In a ceramic tile factory, most defects originate at:
- **Press**: cracks, lamination, density issues (structural)
- **Dryer**: explosions, warping, moisture issues (thermal/moisture)
- **Glaze**: pinholes, drips, color variance (coating)
- **Printer**: line defects, white spots, blur (decoration)
- **Kiln**: cracks, warping, thermal shock (firing)
- Sorting DETECTS defects, it doesn't CREATE them
- Packaging RARELY causes defects (only crush/chip from handling)

**If per-station defect data is not available**, state clearly: "Per-station defect records are not available for this session. Based on the machine parameter analysis, the likely defect origins are..." and then check machine states for parameters outside their optimal ranges.

**NEVER say "Packaging is the most significant source of quality issues" just because current_station = packaging.** That would be like blaming the airport for your flight being late because that's where you noticed the delay.

## Response Format
1. **Summary** — One-line TL;DR
2. **Data** — Key metrics with actual numbers
3. **Analysis** — Root cause or trend explanation
4. **Recommendations** — Numbered, actionable steps
5. **Confidence** — How confident you are and what additional data would help

Use emojis sparingly for status: ✅ ⚠️ ❌ 📊 🔍

## OEE SYSTEM (Hierarchical Machine/Line/Factory)

This factory uses a real-world P × Q OEE model (no synthetic Availability factor):
- Performance (P) = actual output / theoretical capacity
- Quality (Q) = output / input (yield per machine)
- MOEE = P × Q per machine

### 8 Machine OEEs:
Line 1: Press (C/A), Dryer (D²/AC), Glaze (E²/AD), Digital (F²/AE)
Line 3: Conveyor (G_clean/G) — yield only, measures transit damage (denominator = kilnInput, not digitalOutput)
Line 2: Kiln (GH/BG), Sorting (HI/BH), Packaging (IJ/BI)

### 3 Line OEEs (telescoped — intermediate variables cancel):
- Line 1 (Forming & Finishing): LOEE = F/A (digital output / press theoretical)
- Line 2 (Firing & Dispatch): LOEE = J/B (packaging output / kiln theoretical)
- Line 3 (Conveyor): LOEE = G_clean/G (clean transit yield vs completed transits)

### Factory OEE:
FOEE = J / min(A, B) — anchored to the bottleneck
- A = Press theoretical rate (12 tiles/min)
- B = Kiln theoretical rate (8 tiles/min)
- Kiln is typically the bottleneck (B < A), so FOEE ≈ J/B

### Diagnostic approach:
When asked about OEE, trace: FOEE → weakest LOEE → weakest MOEE → P vs Q

### MANDATORY OEE PRODUCTION SUMMARY FORMAT:
Whenever asked for a production summary, overall OEE, or factory performance, you MUST include ALL of the following. The get_simulation_summary response includes a "latest_oee" object with all the values — use them directly:

**Factory OEE:**
- Factory OEE (FOEE): [foee]%

**Line OEEs:**
- Line 1 (Forming & Finishing): [loee_line1]%
- Line 2 (Firing & Dispatch): [loee_line2]%
- Line 3 (Conveyor): [loee_line3]%   ← YOU MUST ALWAYS INCLUDE THIS

**Machine OEEs:**
- Press: [moee_press]%
- Dryer: [moee_dryer]%
- Glaze: [moee_glaze]%
- Digital Printer: [moee_digital]%
- **Conveyor: [moee_conveyor]%**   ← YOU MUST ALWAYS INCLUDE THIS
- Kiln: [moee_kiln]%
- Sorting: [moee_sorting]%
- Packaging: [moee_packaging]%

⚠️ NEVER omit the Conveyor machine OEE or Line 3 OEE from a production summary. They are a critical part of the 8-machine OEE hierarchy and must always appear.

### IMPORTANT — OEE Data Timing:
OEE data in the database comes from periodic snapshots (captured every ~10 seconds).
These figures may differ slightly from the real-time 3D OEE display on screen.
When presenting OEE numbers, ALWAYS say: "Based on the most recent recorded snapshot..."
or "As of the latest snapshot..." to set expectations. NEVER claim the numbers are "live" or "current".
- Low P = machine slow, starved, or stopped frequently
- Low Q = machine creating defects or losing tiles
- Conveyor Q < 1.0 = jam damage during transit

### Energy:
Each machine has kWh/tile efficiency. Kiln dominates energy (100 kWh base + 100 m³ gas, 80% idle factor).
Factory energy = Σ all stations. Watch kWh/tile trends.

${CWF_PARAMETER_DISPLAY_PROMPT}

${knowledgeBase ? `## CWF KNOWLEDGE BASE (from Google Drive)
The following knowledge documents are maintained by the factory team.
Use them as authoritative reference when analyzing data and answering questions.

${knowledgeBase}` : ''}

${uiContext ? (() => {
            /** Extract nested objects from the uiContext record (typed loosely since api/ cannot import src/ types) */
            const panels = uiContext['panels'] as Record<string, boolean> | undefined;
            const sim = uiContext['simulation'] as Record<string, unknown> | undefined;
            const cfg = uiContext['config'] as Record<string, unknown> | undefined;

            /** Format panel visibility: open panels as checkmark, closed as X */
            const panelLines = panels ? [
                `- Basic Panel (KPI + Heatmap): ${panels['basicPanel'] ? '\u2705 OPEN' : '\u274C CLOSED'}`,
                `- DTXFR (Digital Transfer): ${panels['dtxfr'] ? '\u2705 OPEN' : '\u274C CLOSED'}`,
                `- OEE Hierarchy 3D Table: ${panels['oeeHierarchy'] ? '\u2705 OPEN' : '\u274C CLOSED'}`,
                `- Production Status 3D Table: ${panels['prodTable'] ? '\u2705 OPEN' : '\u274C CLOSED'}`,
                `- CWF Chat Panel: ${panels['cwf'] ? '\u2705 OPEN' : '\u274C CLOSED'}`,
                `- Control & Actions Panel: ${panels['controlPanel'] ? '\u2705 OPEN' : '\u274C CLOSED'}`,
                `- Demo Settings Modal: ${panels['demoSettings'] ? '\u2705 OPEN' : '\u274C CLOSED'}`,
                `- Alarm Log: ${panels['alarmLog'] ? '\u2705 OPEN' : '\u274C CLOSED'}`,
                `- Tile Passport: ${panels['tilePassport'] ? '\u2705 OPEN' : '\u274C CLOSED'}`,
                `- Defect Heatmap: ${panels['heatmap'] ? '\u2705 OPEN' : '\u274C CLOSED'}`,
                `- KPI Panel: ${panels['kpi'] ? '\u2705 OPEN' : '\u274C CLOSED'}`,
            ].join('\n') : 'Panel state not available';

            /** Format conveyor status with icon */
            const cStatus = sim?.['conveyorStatus'];
            const conveyorStatusLabel = cStatus === 'running' ? '\uD83D\uDFE2 RUNNING'
                : (cStatus === 'jammed' || cStatus === 'jam_scrapping') ? '\uD83D\uDD34 JAMMED'
                    : cStatus === 'stopped' ? '\uD83D\UDFE1 STOPPED'
                        : String(cStatus ?? 'unknown');

            /** Simulation running status label */
            const simStatus = sim?.['isRunning'] ? '\u25B6\uFE0F RUNNING'
                : sim?.['isDraining'] ? '\u23F3 DRAINING (winding down)'
                    : '\u23F8\uFE0F STOPPED';

            return `## CURRENT UI STATE (live snapshot at message send time)

This is the EXACT browser state at the moment the user sent this message.
Use this to answer questions about what is currently on screen, simulation status, and active configuration.
NEVER query Supabase just to answer questions that are clearly answered by this snapshot.

### Open Panels
${panelLines}

### Simulation State
- Status: ${simStatus}
- S-Clock Tick: ${sim?.['sClockCount'] ?? 'N/A'}
- Conveyor: ${conveyorStatusLabel} at ${sim?.['conveyorSpeed'] ?? 'N/A'}x speed
- S-Clock Period: ${sim?.['sClockPeriod'] ?? 'N/A'} ms per tick
- Station Interval: ${sim?.['stationInterval'] ?? 'N/A'} ticks

### Conveyor Behavioral Parameters (live store snapshot — ALWAYS current)
${(() => {
                    const cp = uiContext?.['conveyorParams'] as Record<string, unknown> | undefined;
                    if (!cp) return '- Conveyor params not available in this snapshot.';
                    const speedChangeLabel = cp['speed_change'] ? '✅ ENABLED' : '❌ DISABLED';
                    const jammedLabel = cp['jammed_events'] ? '✅ ENABLED' : '❌ DISABLED';
                    return [
                        `- Speed Change Events: ${speedChangeLabel}`,
                        `- Jam Events: ${jammedLabel}`,
                        `- Jam Duration: ${cp['jammed_time']} cycles`,
                        `- Impacted Tiles per Jam: ${cp['impacted_tiles']} tiles`,
                        `- Scrap Probability: ${cp['scrap_probability']}%`,
                    ].join('\n');
                })()}

### Session Configuration
- Interface Language: ${cfg?.['language'] === 'tr' ? 'Turkish (TR)' : 'English (EN)'}
- Active Scenario: ${cfg?.['activeScenarioCode'] ?? 'None'}
- Work Order: ${cfg?.['selectedWorkOrderId'] ?? 'None'}
- Demo Settings Configured: ${cfg?.['isSimConfigured'] ? '✅ Yes' : '❌ No (Start button locked)'}
- Simulation Completed Naturally: ${cfg?.['simulationEnded'] ? '✅ Yes (Reset required)' : '❌ No'}

### How to use this context
- If user asks "what panels are open?", use the list above. Do NOT query the DB for this.
- If user asks "is the simulation running?", answer from Status above.
- If user asks "what speed is the conveyor?", answer from Conveyor above.
- If user asks "what scenario is active?", answer from Active Scenario above.
- **If user asks about ANY conveyor behavioral parameter (speed_change, jammed_events, jammed_time, impacted_tiles, scrap_probability), answer from "Conveyor Behavioral Parameters" above. Do NOT query conveyor_states in Supabase for this — the DB row may be one tick stale immediately after a change.**
- You CAN still query Supabase for historical or aggregated data (OEE trends, tile defects).
- This snapshot does NOT replace DB queries for historical or aggregated data.`;
        })() : ''}

## CONVEYOR PARAMETERS — How to Read and Change Them

The conveyor belt is the **8th controllable station** (station name: "conveyor"). Unlike the 7 production machines, it does NOT have its own machine_conveyor_states table. Instead:

- **Read (current values):** always use the **Conveyor Behavioral Parameters** section in the CURRENT UI STATE snapshot above. This reflects the live store state and is ALWAYS immediately current after a CWF parameter change — no query delay.
- **Read (historical/trend data):** query conveyor_states for trends, history, or if uiContext snapshot is unavailable.
- **Change** conveyor parameters using update_parameter with station = "conveyor".

### Conveyor Parameter Reference:

| Parameter Key | Display Name | Type | Default | Valid Range | Meaning |
|---|---|---|---|---|---|
| jammed_time | Jam Duration | Numeric | 7 cycles | 1–30 cycles | How long each jam lasts |
| impacted_tiles | Tiles Scrapped Per Jam | Numeric | 0 tiles | 0–20 tiles | Scrap tiles per jam event |
| scrap_probability | Scrap Probability (%) | Numeric | 0 % | 0–3 % | Global tile scrap probability |
| speed_change | Speed Change Events | Boolean 0/1 | 0 (off) | 0 = off, 1 = on | Whether speed-change events occur |
| jammed_events | Jam Events Enabled | Boolean 0/1 | 0 (off) | 0 = off, 1 = on | Whether jam events occur on the belt |

### ⚡ CRITICAL: NEVER ASK THE USER FOR THE CURRENT CONVEYOR PARAMETER VALUE

You MUST resolve the current value yourself using the rules below. Do NOT say "What is the current value?" or "What do you see in Demo Settings?". This is a bad user experience.

#### Rule 1 — Boolean params (speed_change, jammed_events):
These are ON/OFF toggles. Infer the current value purely from user intent:
- "disable", "turn off", "no speed changes", "stop jams" → current must be 1 (was on), new_value = 0
- "enable", "turn on", "allow jams" → current must be 0 (was off), new_value = 1
- ALWAYS set old_value based on the opposite of new_value. You do NOT need to query anything to determine old_value.

**⚠️ CRITICAL: "no query needed" means you skip the Supabase read only — it does NOT mean you skip the human-in-the-loop protocol. You MUST still follow the full 3-step process:**
- **Step 1 — PROPOSE: present the change in a table and ask "Shall I proceed?"**
- **Step 2 — REQUEST AUTH: when user approves, ask for their authorization ID**
- **Step 3 — EXECUTE: only call update_parameter after receiving the correct auth code**
**NEVER call update_parameter for any conveyor parameter without explicit user approval AND a valid authorization ID, even for simple boolean flips.**

#### Rule 2 — Numeric params (jammed_time, impacted_tiles, scrap_probability):
Query the latest known value directly from conveyor_states:
\`\`\`sql
SELECT jammed_time, impacted_tiles, scrap_probability, speed_change, jammed_events
FROM conveyor_states
WHERE simulation_id = '<session_id>'
ORDER BY sim_tick DESC LIMIT 1
\`\`\`
- If a row is found → use the relevant column value as old_value in your proposal.
- If no row is found (simulation just started) → use the factory default from the table above.
- NEVER ask the user — just proceed with the best known value.

### Example Interactions (use these EXACTLY):
- User: "disable speed changes" → infer old_value=1, new_value=0 (boolean inference — no query needed); THEN propose the change and follow the 3-step auth protocol before calling update_parameter
- User: "enable jam events" → infer old_value=0, new_value=1 (boolean inference — no query needed); THEN propose the change and follow the 3-step auth protocol before calling update_parameter
- User: "set jam time to 15" → query conveyor_states for jammed_time; if found use that as old_value; if not, use default 8 as old_value; THEN propose change and follow 3-step auth protocol
- User: "set conveyor scrap probability to 2" → query conveyor_states for scrap_probability; if found use that; else use default 0; THEN propose change and follow 3-step auth protocol
- User: "what are the current conveyor settings?" → query conveyor_states ORDER BY sim_tick DESC LIMIT 1 and report all 5 param columns
- User: "can you change conveyor parameters?" → Ask WHICH parameter and WHAT value they want. Do NOT ask for the current value.


## UI ACTIONS — No Authorization Required

When the user asks you to open, close, show, or hide any panel or widget, call execute_ui_action **immediately** — without asking for a password, authorization, or any confirmation.

### ⚡ CRITICAL: UI Action Intent Detection — Read This First

**If the user's message starts with or contains "open", "show", "close", "hide", "bring up", "pull up", or similar verbs followed by a panel keyword — it is ALWAYS a UI action, NOT a data query.**

Common mistake: seeing "control panel for conveyor" or "conveyor control panel" and treating it as a request for conveyor data. **Wrong.** It is a request to open the Control & Actions Panel UI widget. Call execute_ui_action with action_type = "toggle_control_panel". Do NOT query the database.

The words after the panel name (e.g., "for conveyor", "for the machine", "related to X") are qualifiers that describe WHY the user wants the panel — ignore them when determining the action_type.

**Detection rule:**
- Message contains ("open" OR "show" OR "close" OR "hide" OR "bring up") AND a panel keyword → UI action ✅
- Message does NOT contain a verb + panel keyword combo → potentially a data query

### Rules for call execute_ui_action:
1. Call it in ONE step with no preamble: just tell the user what you are doing, then call the tool.
   Example: User: "open the basic panel" → You: "Opening the Basic Panel…" → call execute_ui_action
2. For all panel toggle actions, you MUST pass:
   - action_value="open" when opening/showing a panel
   - action_value="close" when closing/hiding a panel
   This keeps state-setting idempotent — repeated "open" commands are safe no-ops.
3. After the tool returns, report the result:
   - Success: "✅ [Panel name] is now open." (or closed)
   - Rejected: "⚠️ [Panel name] could not be opened — [reason from tool response]"
4. For start_simulation / stop_simulation / reset_simulation: same rules — no auth, immediate execution.

### Panel name → action_type mapping (qualifiers in brackets are noise — ignore them):
| User says | action_type |
|---|---|
| basic panel / KPI / heatmap | toggle_basic_panel |
| control panel / controls / **conveyor control panel** / **control panel for conveyor** | toggle_control_panel |
| OEE table / OEE hierarchy | toggle_oee_hierarchy |
| DTXFR / digital transfer | toggle_dtxfr |
| alarm log | toggle_alarm_log |
| KPI panel | toggle_kpi |
| heatmap | toggle_heatmap |
| tile passport | toggle_tile_passport |
| production table | toggle_prod_table |
| demo settings | toggle_demo_settings |
| CWF panel | toggle_cwf_panel |

**NEVER ask for authorization before execute_ui_action. NEVER ask "are you sure?". Just do it.**

## CONVEYOR STATUS AND SIMULATION SLIDERS — UI Actions (No Auth Required)

These are DIRECT UI controls — exactly like clicking a button or moving a slider in the Control & Actions panel.
Call execute_ui_action IMMEDIATELY. No proposal table. No auth prompt. No confirmation. Just report the result.

### ⚡ CRITICAL DISAMBIGUATION: "stop/start/jam conveyor" vs "stop/start simulation"

| User says | Correct action | WRONG action |
|---|---|---|
| "stop the conveyor" / "pause conveyor" | set_conveyor_stopped | ~~stop_simulation~~ |
| "start the conveyor" / "run conveyor" | set_conveyor_running | ~~start_simulation~~ |
| "jam the conveyor" / "simulate a jam" | set_conveyor_jammed | ~~stop_simulation~~ |
| "stop the simulation" / "pause production" | stop_simulation | ~~set_conveyor_stopped~~ |
| "start the simulation" | start_simulation | ~~set_conveyor_running~~ |

Key distinction: The conveyor status (running/stopped/jammed) is INDEPENDENT of the simulation clock.
The simulation can be ticking while the belt is stopped. They are different controls.

### Conveyor Status Actions

| action_type | When to use | Guard |
|---|---|---|
| set_conveyor_running | "start/run conveyor", "resume belt", "get belt moving" | Sim must be running; if stopped, tell user to start simulation first |
| set_conveyor_stopped | "stop/pause/freeze conveyor", "halt belt" | Always valid |
| set_conveyor_jammed | "jam conveyor", "simulate jam", "trigger jam" | Sim must be running |

No action_value needed for these. After execution: report "✅ Conveyor is now [Running/Stopped/Jammed]."

### Simulation Parameter Slider Actions

Valid ranges (read from uiContext.simulation for current values before computing steps):

| action_type | action_value | Range | Step | Effect |
|---|---|---|---|---|
| set_conveyor_speed | float e.g. "1.5" | 0.3x – 2.0x | 0.1 | Visual belt speed (higher = faster tiles) |
| set_sclk_period | int ms e.g. "300" | 200ms – 700ms | 100ms | Simulation clock rate (LOWER = FASTER sim) |
| set_station_interval | int e.g. "3" | 2 – 7 ticks | 1 | Ticks per tile produced (LOWER = HIGHER output) |

**For relative commands** ("increase speed", "decrease S-Clk", "speed up production"):
1. Read the current value from uiContext.simulation (conveyorSpeed, sClockPeriod, stationInterval)
2. Compute: current_value ± one_step
3. Clamp to valid range
4. Call execute_ui_action with the computed value as action_value

**For ambiguous commands** ("speed up" with no subject):
- Ask: "Do you mean conveyor belt speed, S-Clock period, or station interval?"

### Worked Examples

1. "stop conveyor" → execute_ui_action(action_type="set_conveyor_stopped") → "✅ Conveyor is now Stopped."
2. "start the conveyor" → execute_ui_action(action_type="set_conveyor_running") → "✅ Conveyor is now Running."
3. "jam the conveyor" → execute_ui_action(action_type="set_conveyor_jammed") → "✅ Conveyor jam simulated."
4. "set conveyor speed to 1.5" → execute_ui_action(action_type="set_conveyor_speed", action_value="1.5")
5. "increase conveyor speed" → read uiContext conveyorSpeed (e.g. 1.0), add 0.1 → execute_ui_action(action_type="set_conveyor_speed", action_value="1.1")
6. "decrease conveyor speed" → read uiContext conveyorSpeed, subtract 0.1, clamp ≥ 0.3 → call set_conveyor_speed
7. "slow down simulation" / "increase S-Clk period" → read sClockPeriod, add 100, clamp ≤ 700 → set_sclk_period
8. "speed up simulation" / "decrease S-Clk period" → read sClockPeriod, subtract 100, clamp ≥ 200 → set_sclk_period
9. "set S-Clk to 300ms" → execute_ui_action(action_type="set_sclk_period", action_value="300")
10. "increase production rate" / "decrease station interval" → read stationInterval, subtract 1, clamp ≥ 2 → set_station_interval
11. "slow down production" / "increase station interval" → read stationInterval, add 1, clamp ≤ 7 → set_station_interval
12. "set station interval to 4" → execute_ui_action(action_type="set_station_interval", action_value="4")
13. "set work order to WorkID #3" / "load WorkID 3" / "switch to work order 3" → execute_ui_action(action_type="set_work_order", action_value="WorkID#3")
14. "set work order to WorkID #1" → execute_ui_action(action_type="set_work_order", action_value="WorkID#1")

**After any slider change, report:** "✅ [Parameter name] set to [value][unit]. (was [old_value][unit])"

---

## CHANGING PARAMETERS (Human-in-the-Loop Protocol)

You CAN change machine parameters on the live simulation using the update_parameter tool.
However, you MUST ALWAYS follow this strict 3-step process:

### PROACTIVE CORRECTION — When You Detect Deviations
When the machine health analysis reveals ⚠️ out-of-range parameters, you SHOULD proactively offer to fix them:
1. After presenting the deviation report, say: "I detected [N] parameters outside their safe ranges. Would you like me to correct them to optimal values?"
2. When calculating optimal target values: use the **midpoint** of the safe range as the target. For example:
   - Kiln Max Temperature safe range [1100-1220] → propose **1160 °C** (midpoint)
   - Kiln Belt Speed safe range [1-3] → propose **2 m/min** (midpoint)
   - Kiln O₂ Level safe range [2-8] → propose **5%** (midpoint)
   - Kiln Atmosphere Pressure safe range [-0.5 to +0.5] → propose **0 mbar** (midpoint)
3. Present ALL proposed corrections in one table so the user can approve them all at once.

### Step 1 — PROPOSE
1. Query the CURRENT value: SELECT <param> FROM machine_<station>_states WHERE simulation_id='...' ORDER BY sim_tick DESC LIMIT 1
2. Calculate the proposed new value: use the midpoint of the safe range (or the user's specific request).
3. Present ALL proposed changes in a clear table:
   | Station | Parameter | Current | Proposed | Safe Range | Change |
   |---------|-----------|---------|----------|------------|--------|
   | Kiln | Max Temperature (°C) | 1243.4 | 1160 | 1100-1220 | ↓ -6.7% |
   | Kiln | Belt Speed (m/min) | 0.8 | 2.0 | 1-3 | ↑ +150% |
4. Ask: "Shall I proceed with these changes?"

### Step 2 — REQUEST AUTHORIZATION
- When the user approves (says "yes", "proceed", "fix it", "go ahead", etc.), respond EXACTLY:
  "Please enter your authorization ID to confirm. You have 20 seconds.

  *For demo purposes, use \"airtk\" as the authorization code.*"
- Then WAIT. The next user message will be their authorization code.

### Step 3 — EXECUTE (immediately after the user sends any text in response to Step 2)
- When the user sends their authorization response, call update_parameter IMMEDIATELY.
- Use the EXACT text the user typed as the 'authorized_by' parameter — pass it verbatim, no changes.
- The SERVER will validate the code. Do NOT validate it yourself. Do NOT check if it looks correct. Just call the tool.
- Make ONE update_parameter call PER parameter — do NOT batch them.
- Do NOT query the database again before calling update_parameter — you already have old_value and new_value from the proposal.
- After execution, report the server's result:
  - If success: "✅ [Station] [Parameter] changed from [old] → [new] ([reason])"
  - If rejected by server: report the error the server returns.
- After ALL changes are applied, say: "All [N] parameter corrections have been applied."

**NEVER call update_parameter without BOTH explicit user approval AND receiving their auth response.**
**NEVER validate the auth code yourself — always pass it to the server via update_parameter and report what the server says.**

## CWF IMPACT REPORT — Before vs After Analysis

When the user asks for a "before and after" report, "CWF impact report", or "what did CWF contribute", follow this pattern:

### Step 1 — Find the correction point
Query: SELECT station, parameter, old_value, new_value, reason, created_at FROM cwf_commands WHERE session_id='...' AND status='applied' ORDER BY created_at ASC
This gives you the exact moment and details of CWF's corrections.

### Step 2 — Find the sim_tick when corrections were applied
Query: SELECT sim_tick FROM parameter_change_events WHERE simulation_id='...' AND change_reason='cwf_agent' ORDER BY sim_tick ASC LIMIT 1
This gives the simulation tick at which CWF corrections took effect. Call this the "correction_tick".

### Step 3 — Compare production metrics BEFORE vs AFTER the correction tick
BEFORE query: SELECT SUM(total_tiles_produced) as tiles, SUM(first_quality_count) as fq, SUM(second_quality_count) as sq, SUM(scrap_count) as scrap, AVG(quality_pct) as avg_quality, AVG(oee_pct) as avg_oee FROM production_metrics WHERE simulation_id='...' AND period_end_sim_tick <= [correction_tick]
AFTER query: SELECT SUM(total_tiles_produced) as tiles, SUM(first_quality_count) as fq, SUM(second_quality_count) as sq, SUM(scrap_count) as scrap, AVG(quality_pct) as avg_quality, AVG(oee_pct) as avg_oee FROM production_metrics WHERE simulation_id='...' AND period_start_sim_tick > [correction_tick]

### Step 4 — Present the CWF Impact Report
Format the report like this:

📊 **CWF Impact Report — Before vs After Corrections**

**Corrections Applied by CWF:**
| Station | Parameter | Before | After | Change |
(list all applied corrections from cwf_commands)

**Production Quality Comparison:**
| Metric | Before CWF | After CWF | Improvement |
|--------|-----------|----------|-------------|
| First Quality % | X% | Y% | +Z% |
| Second Quality % | X% | Y% | -Z% |
| Scrap % | X% | Y% | -Z% |
| Average OEE | X% | Y% | +Z% |

**Key Takeaway:** Summarize CWF's contribution in one sentence — e.g. "CWF's corrections to the Kiln reduced scrap by X% and improved first quality yield by Y%, demonstrating the value of AI-driven process optimization."

If the "AFTER" period has too few tiles (less than 20), tell the user: "The simulation needs to run longer after the corrections for meaningful comparison. Currently only N tiles have been produced since the corrections were applied."

${DB_SCHEMA_CONTEXT}
`;
}

// =============================================================================
// MAIN REQUEST HANDLER
// =============================================================================

/**
 * Vercel serverless function handler for POST /api/cwf/chat.
 *
 * Accepts a user message, simulation ID, optional conversation history,
 * and language preference. Runs a multi-turn Gemini agent loop that can
 * call database tools up to 8 times before returning a final response.
 *
 * @param req - Vercel request with body: { message, simulationId, conversationHistory?, language? }
 * @param res - Vercel response returning: { response, toolCallCount, model } or { error }
 */
export default async function handler(
    req: VercelRequest,
    res: VercelResponse
) {
    // CORS headers — allow requests from any origin (the frontend is on a different domain during dev)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle preflight CORS requests
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Only POST is supported
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // Destructure and validate request body
        const {
            message,
            simulationId,
            sessionCode = '',
            conversationHistory = [],
            language = 'en',
            simulationHistory = [],
            /**
             * Real-time UI context snapshot from the browser.
             * Built by cwfStore.sendMessage() and passed via cwfService.cwfApiCall().
             * When present, injected into the Gemini system prompt to give the AI
             * full situational awareness of the current browser/simulation state.
             * Typed as Record<string, unknown> since api/ cannot import from src/.
             */
            uiContext = undefined,
        } = req.body as {
            message: string;
            simulationId: string;
            sessionCode?: string;
            conversationHistory?: Array<{ role: string; content: string }>;
            language?: string;
            simulationHistory?: Array<{ uuid: string; sessionCode: string; startedAt: string; counter: number }>;
            uiContext?: Record<string, unknown>;
        };

        if (!message || !simulationId) {
            return res.status(400).json({
                error: 'message and simulationId are required',
            });
        }

        // =====================================================================
        // CWF STATE MACHINE — Read authoritative state from Supabase
        //
        // States:
        //   'normal'               — Standard CWF; HITL applies for all changes
        //   'copilot_pending_auth' — User requested copilot; awaiting auth code
        //   'copilot_active'       — Copilot authorised; no auth needed for changes
        //
        // CRITICAL: Supabase is the single source of truth. The client-side
        // Zustand store is a SLAVE mirror only. We never trust the client's
        // uiContext.copilotState for security decisions.
        // =====================================================================

        /** Maximum failed auth attempts before returning to 'normal' */
        const COPILOT_MAX_AUTH_ATTEMPTS = 3;

        /**
         * Fetch the authoritative copilot state from Supabase.
         * Falls back to 'normal' if the row doesn't exist or DB call fails.
         */
        let cwfState: 'normal' | 'copilot_pending_auth' | 'copilot_active' = 'normal';
        let authAttempts = 0;
        try {
            const { data: configRow } = await supabase
                .from('copilot_config')
                .select('cwf_state, auth_attempts')
                .eq('simulation_id', simulationId)
                .maybeSingle();

            if (configRow) {
                const dbState = configRow.cwf_state as string;
                if (dbState === 'copilot_pending_auth' || dbState === 'copilot_active') {
                    cwfState = dbState;
                }
                authAttempts = (configRow.auth_attempts as number) ?? 0;
            }
        } catch {
            /** Non-fatal — default to 'normal' (safest state) */
            console.warn('[CWF] Could not read copilot_config — defaulting cwfState to normal');
        }

        // =====================================================================
        // EAGER COPILOT_PENDING_AUTH TRANSITION (Bug 1 fix)
        //
        // The enable_copilot tool REQUIRES authorized_by — Gemini can NEVER call
        // it without the auth code, so it cannot set cwf_state='copilot_pending_auth'
        // itself. Instead the SERVER detects copilot-enable keywords in NORMAL state
        // and immediately writes copilot_pending_auth to DB BEFORE calling Gemini.
        // This is fully deterministic and removes all LLM-timing race conditions.
        // =====================================================================

        /**
         * Keywords that trigger the AutoPilot enable flow (DB upsert to copilot_pending_auth).
         * IMPORTANT: These MUST match what the UI sends (params/copilot.ts COPILOT_UI_LABELS.enableChatMessage).
         * The UI button sends 'go into autopilot mode' — this MUST be in this list.
         * Also keep legacy 'copilot' variants for typed commands.
         */
        const COPILOT_ENABLE_KEYWORDS = [
            /* ── AutoPilot keyword variants (UI canonical + typed shortcuts) ── */
            'go into autopilot mode',
            'enable autopilot',
            'start autopilot',
            'activate autopilot',
            'autopilot on',
            'turn on autopilot',
            /* ── Turkish AutoPilot variants ── */
            'otopilot aç',
            'otopilot başlat',
            /* ── Legacy copilot typed commands (backwards-compatible) ── */
            'copilot mode', 'into copilot', 'enable copilot', 'start copilot',
            'activate copilot', 'go copilot', 'kopilot', 'kopilot aç',
        ];
        const messageLower = message.toLowerCase();

        /**
         * Detect copilot-enable requests.
         *
         * Matches when:
         *  - cwfState === 'normal' → standard first-time enable
         *  - cwfState === 'copilot_active' → STALE state from previous session
         *    (e.g., user disabled copilot locally but the server-side disable
         *    never landed due to WebSocket failure, or the session ended but
         *    copilot_config wasn't cleaned up). The user explicitly requesting
         *    copilot mode means they want to restart the auth flow, so we reset
         *    the state machine to copilot_pending_auth.
         *
         * Does NOT match copilot_pending_auth — that means auth is already
         * in progress and the user's message is likely the auth code.
         */
        const isCopilotEnableRequest =
            (cwfState === 'normal' || cwfState === 'copilot_active') &&
            COPILOT_ENABLE_KEYWORDS.some((kw) => messageLower.includes(kw));

        if (isCopilotEnableRequest) {
            /**
             * Eagerly set cwf_state='copilot_pending_auth' in DB so that the NEXT
             * request (when user sends the auth code) will read the correct state
             * and trigger the state-machine auth path deterministically.
             * We use upsert() so the row is created if it doesn't yet exist.
             */
            try {
                await supabase.from('copilot_config').upsert({
                    simulation_id: simulationId,
                    cwf_state: 'copilot_pending_auth',
                    auth_attempts: 0,
                    /** Explicitly set poll interval so DB default (15s) is never used */
                    poll_interval_sec: 6,
                    cooldown_sec: 30,
                    /** Allow Copilot to correct ALL out-of-range params in one cycle (was 2 = too restrictive) */
                    max_actions_per_minute: 20,
                    updated_at: new Date().toISOString(),
                }, { onConflict: 'simulation_id' });
                cwfState = 'copilot_pending_auth';
                authAttempts = 0;
                console.log('[CWF] ⚡ Eager copilot_pending_auth set — user requested copilot in normal state');
            } catch (eagerErr) {
                /** Non-fatal — Gemini will still handle via heuristic fallback */
                console.warn('[CWF] Could not eagerly set copilot_pending_auth:', eagerErr);
            }
        }

        console.log(`[CWF] State machine: cwfState=${cwfState}, authAttempts=${authAttempts}/${COPILOT_MAX_AUTH_ATTEMPTS}`);

        /**
         * Merge the authoritative cwf state into uiContext.copilotState so that
         * buildSystemPrompt receives the server-read state, not just what the client sent.
         * This ensures the LLM prompt always reflects the true operational state.
         */
        const mergedUiContext: Record<string, unknown> = {
            ...(uiContext ?? {}),
            copilotState: {
                ...(((uiContext ?? {}) as Record<string, unknown>).copilotState as Record<string, unknown> ?? {}),
                cwfState,
                authAttempts,
                maxAuthAttempts: COPILOT_MAX_AUTH_ATTEMPTS,
            },
        };


        /**
         * Build simulation history context string for the user message.
         * Sorted newest-first. Enables Gemini to resolve references like
         * "previous simulation" or "the one with code ABC123".
         */
        let historyContext = '';
        if (simulationHistory.length > 0) {
            const historyLines = simulationHistory.map(
                (s: { uuid: string; sessionCode: string; startedAt: string; counter: number }) =>
                    `  #${s.counter}: code=${s.sessionCode}, uuid=${s.uuid}, started=${s.startedAt}`
            ).join('\n');
            historyContext = `\n\n[Simulation History (newest first):\n${historyLines}\nCurrent session: code=${sessionCode}]`;
        }


        /** Resolve language for bilingual prompt / fallback selection */
        const lang = language as 'tr' | 'en';


        // =====================================================================
        // HISTORY SANITIZATION
        // Strip any conversation turns that contain force-summary / retry prompt
        // pollution before feeding history to Gemini. This prevents the
        // "as per your instruction to 'Do NOT call any tools'" self-reinforcing
        // loop where Gemini treats a prior emergency control signal as a
        // standing user instruction.
        //
        // Two contamination vectors are removed:
        //   1. USER turns that start with CWF_FORCE_SUMMARY_SENTINEL
        //      (these are the injected force-summary / retry prompts themselves)
        //   2. ASSISTANT turns whose text contains CWF_FORCE_SUMMARY_FINGERPRINT
        //      or CWF_RETRY_PROMPT_FINGERPRINT (Gemini quoting the instruction back)
        // =====================================================================

        /**
         * Removes sentinel-tagged and fingerprint-contaminated turns from the
         * conversation history before it is mapped to Gemini Content objects.
         *
         * @param history - Raw history from cwfStore (user + assistant turns)
         * @returns Cleaned history safe to pass to Gemini
         */
        function sanitizeConversationHistory(
            history: Array<{ role: string; content: string }>
        ): Array<{ role: string; content: string }> {
            /** Collect indices of turns to remove */
            const indicesToRemove = new Set<number>();

            history.forEach((msg, idx) => {
                /** Remove user turns that are force-summary / retry injections */
                if (
                    msg.role === 'user' &&
                    msg.content.startsWith(CWF_FORCE_SUMMARY_SENTINEL)
                ) {
                    /** Mark this injected user turn for removal */
                    indicesToRemove.add(idx);
                    /**
                     * Also remove the ASSISTANT response that followed the injection.
                     * That response often quotes the forbidden instruction back,
                     * which is itself a contamination vector in later turns.
                     */
                    if (idx + 1 < history.length && history[idx + 1].role !== 'user') {
                        indicesToRemove.add(idx + 1);
                    }
                }

                /**
                 * Remove assistant turns that quote force-summary or retry fingerprints.
                 * This catches cases where Gemini's response TEXT repeats the forbidden
                 * instruction (e.g. "as per your instruction to 'Do NOT call any tools'").
                 */
                if (
                    msg.role === 'assistant' && (
                        msg.content.includes(CWF_FORCE_SUMMARY_FINGERPRINT) ||
                        msg.content.includes(CWF_RETRY_PROMPT_FINGERPRINT)
                    )
                ) {
                    /** Mark contaminated assistant turn for removal */
                    indicesToRemove.add(idx);
                }
            });

            /** Filter out all marked turns and return clean history */
            return history.filter((_, idx) => !indicesToRemove.has(idx));
        }

        // =====================================================================
        // AUTH-TURN DETECTION
        // If the current user message IS the authorization code, this is a
        // simple execution turn that requires ONE tool call only. Inject the
        // fast-path instruction to prevent Gemini from burning loops on
        // re-querying state data it already has from the prior proposal turn.
        // =====================================================================
        // AUTH-TURN DETECTION (STATE-MACHINE-DRIVEN)
        //
        // Primary path: cwfState = 'copilot_pending_auth'
        //   ANY short non-question message is treated as an auth code attempt.
        //   The server enforces a 3-attempt limit and resets to 'normal' on failure.
        //
        // Fallback path: cwfState = 'normal' + heuristic
        //   Last assistant message asked for auth AND current message looks like a code.
        //   Handles race conditions where DB hasn't updated yet.
        //
        // Parameter auth: exact match of CWF_AUTH_CODE (unchanged behaviour).
        // =====================================================================

        /**
         * True when this message looks like an auth code (short, no question mark,
         * no spaces — not a sentence or question).
         */
        const looksLikeAuthCode = (
            message.trim().length <= 15 &&
            !message.includes('?') &&
            !message.includes(' ')
        );

        /** Primary: state machine explicitly says we're waiting for auth */
        const isStateMachinePendingAuth = cwfState === 'copilot_pending_auth';

        /**
         * Heuristic fallback: check if the last assistant message asked for an
         * auth code, in case the DB update is lagging behind one request.
         */
        let lastAssistantAskedForCopilotAuth = false;
        if (!isStateMachinePendingAuth && conversationHistory.length > 0) {
            for (let i = conversationHistory.length - 1; i >= 0; i--) {
                const histMsg = conversationHistory[i];
                if (histMsg.role === 'assistant') {
                    const lc = histMsg.content.toLowerCase();
                    if (
                        (lc.includes('authorization code') || lc.includes('auth code') || lc.includes('yetki kodu')) &&
                        (lc.includes('copilot') || lc.includes('enable') || lc.includes('etkinleştir'))
                    ) {
                        lastAssistantAskedForCopilotAuth = true;
                    }
                    break;
                }
            }
        }

        /**
         * isCopilotAuthContext: true when this is a genuine copilot auth attempt.
         * Fires for state-machine-driven path OR heuristic fallback.
         *
         * EXCLUDES isReRequestInPendingAuth: if the user says "go into copilot mode"
         * while state is already copilot_pending_auth (stale from previous session),
         * that is NOT an auth attempt — it's a re-request. We reset auth_attempts
         * and let Gemini re-ask for the code instead of trying to call enable_copilot
         * with the re-request message as authorized_by.
         */
        const isReRequestInPendingAuth =
            isStateMachinePendingAuth &&
            COPILOT_ENABLE_KEYWORDS.some((kw) => messageLower.includes(kw));

        const isCopilotAuthContext =
            (isStateMachinePendingAuth && !isReRequestInPendingAuth) ||
            (looksLikeAuthCode && lastAssistantAskedForCopilotAuth);

        /**
         * isAuthTurn: true for any auth turn (copilot or parameter change).
         * Parameter auth still uses exact code match for security.
         */
        const isAuthTurn =
            isCopilotAuthContext ||
            message.trim().toLowerCase() === CWF_AUTH_CODE.toLowerCase();

        /**
         * Server-side 3-attempt enforcement for COPILOT_PENDING_AUTH state.
         * Only runs when the state machine is the primary detection path.
         * Heuristic fallback lets Gemini handle the attempt counting via LLM reasoning.
         *
         * IMPORTANT GUARD: Skip auth validation if the message is a copilot-enable
         * keyword phrase (e.g., "go into copilot mode"). This happens when the user
         * re-requests copilot while the DB already has copilot_pending_auth from a
         * previous failed/abandoned session. Treating "go into copilot mode" as an
         * auth code attempt would incorrectly consume an attempt and report "Incorrect code".
         * Instead, we reset auth_attempts to 0 so the user gets a clean fresh start,
         * and let Gemini re-ask for the authorization code.
         */

        let maxAttemptsReached = false;

        if (isReRequestInPendingAuth) {

            /**
             * User is re-requesting copilot (e.g., "go into copilot mode") while
             * the state machine is stuck in pending_auth from a previous session.
             * Reset auth_attempts to 0 so the user gets 3 fresh attempts.
             */
            await supabase.from('copilot_config')
                .update({ auth_attempts: 0, updated_at: new Date().toISOString() })
                .eq('simulation_id', simulationId);
            authAttempts = 0;
            console.log('[CWF] ↩️ Re-request in pending_auth — resetting auth_attempts to 0');
            /** Do NOT run the auth code check — let Gemini re-ask for the code */
        } else if (isStateMachinePendingAuth) {
            const providedCode = message.trim();
            const isCorrectCode = providedCode.toLowerCase() === CWF_AUTH_CODE.toLowerCase();

            if (isCorrectCode) {
                /**
                 * Correct code: transition to copilot_active.
                 * Reset auth_attempts. The enable_copilot tool call also does this,
                 * but doing it here ensures correctness even if Gemini's tool call fails.
                 */
                await supabase
                    .from('copilot_config')
                    .update({ cwf_state: 'copilot_active', auth_attempts: 0 })
                    .eq('simulation_id', simulationId);
                cwfState = 'copilot_active';
                console.log('[CWF] Correct copilot auth — transitioning to copilot_active');
            } else {
                /**
                 * Wrong code: increment counter. If at max, reset to 'normal'.
                 */
                const newAttempts = authAttempts + 1;
                if (newAttempts >= COPILOT_MAX_AUTH_ATTEMPTS) {
                    await supabase
                        .from('copilot_config')
                        .update({ cwf_state: 'normal', auth_attempts: 0 })
                        .eq('simulation_id', simulationId);
                    cwfState = 'normal';
                    maxAttemptsReached = true;
                    console.log('[CWF] Max copilot auth attempts reached — returning to normal');
                } else {
                    await supabase
                        .from('copilot_config')
                        .update({ auth_attempts: newAttempts })
                        .eq('simulation_id', simulationId);
                    authAttempts = newAttempts;
                    console.log(`[CWF] Wrong copilot auth — attempt ${newAttempts}/${COPILOT_MAX_AUTH_ATTEMPTS}`);
                }
            }
        }

        // =====================================================================
        // SHORT-CIRCUIT: COPILOT STATE MACHINE TRANSITIONS (Phase B)
        //
        // ALL copilot auth decisions are made server-side WITHOUT involving the LLM.
        // The LLM (Gemini) is a powerful but non-deterministic system — auth must be
        // 100% deterministic and fast. The server now handles these cases directly:
        //
        //   Case A: normal state + copilot keyword
        //           → already eagerly set copilot_pending_auth above
        //           → return "Please provide auth code" directly, NO Gemini call
        //
        //   Case B: copilot_pending_auth + correct auth code
        //           → already updated DB to copilot_active above (line 2427-2432)
        //           → return "✅ Copilot enabled" directly, NO Gemini call
        //
        //   Case C: copilot_pending_auth + wrong code (not max attempts)
        //           → already incremented auth_attempts in DB
        //           → return "Incorrect code. N remaining" directly, NO Gemini call
        //
        //   Case D: copilot_pending_auth + max attempts exhausted
        //           → already reset state to normal in DB
        //           → return failure message directly, NO Gemini call
        //
        //   Case E: copilot_pending_auth + keyword re-request
        //           → already reset auth_attempts to 0
        //           → return "Please provide auth code" directly, NO Gemini call
        //
        // The LLM is ONLY engaged for non-auth-state-machine messages, i.e.,
        // factory questions, parameter changes, and autonomous copilot actions.
        // The LLM receives the current cwfState as context in its system prompt.
        // =====================================================================

        /**
         * Case A: User just requested copilot from normal state.
         * The eager transition already set cwf_state='copilot_pending_auth' in DB.
         * Short-circuit: return the auth_prompt message directly without calling Gemini.
         */
        if (isCopilotEnableRequest) {
            console.log('[CWF] ⚡ Short-circuit: copilot enable request → pending_auth (no Gemini call)');
            const promptMsg = lang === 'tr'
                ? '🤖 AutoPilot Modu, simülasyonunuzu gerçek zamanlı olarak izlememi, parametre sapmalarını ve kalite sorunlarını tespit etmemi ve düzeltici işlemleri otomatik olarak gerçekleştirmemi sağlayacak. Tüm işlemler tam gerekçesiyle kaydedilecek. Devam etmek için yetkinize ihtiyacım var.\n\nLütfen yetki kodunuzu girerek AutoPilot modunu etkinleştirin.'
                : '🤖 AutoPilot Mode will enable me to autonomously monitor your simulation in real-time, detect parameter deviations and quality issues, and take corrective actions automatically. All actions are logged with full reasoning. I need your authorization to proceed.\n\nPlease provide your authorization code to enable AutoPilot mode.';
            return res.status(200).json({
                response: promptMsg,
                toolCallCount: 0,
                copilotStateChange: null,
            });
        }

        /**
         * Case E: User re-requested copilot while state was already pending_auth.
         * The auth_attempts were reset to 0 above. Short-circuit: re-prompt for code.
         */
        if (isReRequestInPendingAuth) {
            console.log('[CWF] ⚡ Short-circuit: re-request in pending_auth → re-prompting (no Gemini call)');
            const promptMsg = lang === 'tr'
                ? '🤖 AutoPilot Modu zaten yetki bekleme durumunda. Lütfen yetki kodunuzu girin.'
                : '🤖 AutoPilot Mode is already waiting for authorization. Please provide your authorization code.';
            return res.status(200).json({
                response: promptMsg,
                toolCallCount: 0,
                copilotStateChange: null,
            });
        }

        /**
         * Case D: Max auth attempts exhausted.
         * DB already reset to normal above. Short-circuit: return failure message.
         */
        if (maxAttemptsReached) {
            console.log('[CWF] ⚡ Short-circuit: max auth attempts reached → returning to normal (no Gemini call)');
            const failMsg = lang === 'tr'
                ? `❌ ${COPILOT_MAX_AUTH_ATTEMPTS} denemeden sonra yetkilendirme başarısız oldu. AutoPilot modu etkinleştirilemedi. Tekrar denemek için "otopilot moduna geç" diyebilirsiniz.`
                : `❌ Authorization failed after ${COPILOT_MAX_AUTH_ATTEMPTS} attempts. AutoPilot mode could not be activated. You can try again by saying 'go into autopilot mode'.`;
            return res.status(200).json({
                response: failMsg,
                toolCallCount: 0,
                copilotStateChange: null,
            });
        }

        /**
         * Case B: Auth code was correct — DB already transitioned to copilot_active above.
         * Short-circuit: fire engine start, return success message directly without Gemini.
         *
         * Case C: Auth code was wrong (not max attempts) — DB already incremented counter.
         * Short-circuit: return "Incorrect code" message directly without Gemini.
         *
         * Both cases only apply when the state machine was in copilot_pending_auth.
         */
        if (isStateMachinePendingAuth && !isReRequestInPendingAuth) {
            /** Re-derive correct/incorrect from the updated cwfState */
            const authSucceeded = cwfState === 'copilot_active';

            if (authSucceeded) {
                /** Case B: Correct code — fire the copilot engine start */
                console.log('[CWF] ⚡ Short-circuit: correct auth code → copilot_active (no Gemini call)');

                /** Fire the engine start endpoint (fire-and-forget) */
                const copilotApiBase = process.env.CWF_DEV_PORT ? `http://localhost:${process.env.CWF_DEV_PORT}` : '';
                try {
                    await fetch(`${copilotApiBase}/api/cwf/copilot/enable`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            simulationId,
                            activatedBy: CWF_AUTH_CODE,
                        }),
                    });
                } catch {
                    /** Engine endpoint unreachable — DB update already set state; engine will start on next heartbeat */
                }

                const successMsg = lang === 'tr'
                    ? `✅ AutoPilot Modu etkinleştirildi. Simülasyonu gerçek zamanlı olarak izliyorum ve gerektiğinde düzeltici işlemler uygulayacağım. Tüm işlemler kaydedilecek.`
                    : `✅ AutoPilot Mode has been enabled for simulation ID ${simulationId}. I will now autonomously monitor your simulation in real-time, detect deviations, and apply corrective actions as needed. All actions will be logged with full reasoning.`;

                return res.status(200).json({
                    response: successMsg,
                    toolCallCount: 0,
                    /** Signal the client to immediately enable the copilot UI theme */
                    copilotStateChange: 'enabled' as const,
                });
            } else {
                /** Case C: Wrong code — report attempts remaining */
                const attemptsRemaining = COPILOT_MAX_AUTH_ATTEMPTS - authAttempts;
                console.log(`[CWF] ⚡ Short-circuit: wrong auth code — ${attemptsRemaining} remaining (no Gemini call)`);
                const wrongMsg = lang === 'tr'
                    ? `❌ Yanlış kod. ${attemptsRemaining} deneme hakkınız kaldı.`
                    : `❌ Incorrect code. ${attemptsRemaining} attempt(s) remaining.`;
                return res.status(200).json({
                    response: wrongMsg,
                    toolCallCount: 0,
                    copilotStateChange: null,
                });
            }
        }

        /** Log auth-turn detection for debugging (non-short-circuit paths only) */
        if (isAuthTurn) {
            console.log(
                `[CWF] Auth turn (passed to Gemini): cwfState=${cwfState}, copilotCtx=${isCopilotAuthContext}, ` +
                `stateMachine=${isStateMachinePendingAuth}`
            );
        }

        // =====================================================================
        // SHORT-CIRCUIT: WORK ORDER COMMANDS (Fix B)
        //
        // Detect "set work order", "workID", "load workID" patterns and execute
        // them deterministically via executeUIAction() WITHOUT calling Gemini.
        //
        // WHY: Gemini's intent classification fails ~10-20% of the time on work
        // order commands due to the large system prompt (~40-80KB), causing:
        //   1. "set work order" misclassified as a data query
        //   2. Response misalignment (correction appears on the NEXT message)
        //   3. User must retry the command
        //
        // This mirrors the copilot auth short-circuit pattern (Cases A-E above).
        // See: cwf_bug_analysis.md for full root cause analysis.
        // =====================================================================

        /**
         * Regex to extract the Work Order number (1, 2, or 3) from the message.
         * Matches patterns like:
         *   "set work order to workid#3"
         *   "set work order to workID #3"
         *   "load workid 2"
         *   "load workID#1"
         *   "workid#3"
         *   "workid 2"
         *   "work order 3"
         *   "switch to work order 1"
         *   "use workid#2"
         *   "change work order to 3"
         *
         * Case-insensitive (applied on messageLower).
         */
        const workOrderMatch = messageLower.match(
            /(?:work\s*order|workid)(?:\s+\w+)*\s*#?\s*([123])/
        );

        if (workOrderMatch) {
            const workOrderNumber = workOrderMatch[1]; // "1", "2", or "3"
            const workOrderId = `WorkID#${workOrderNumber}`; // "WorkID#1", "WorkID#2", or "WorkID#3"

            console.log(`[CWF] ⚡ Short-circuit: work order command detected → ${workOrderId} (no Gemini call)`);

            /** Reuse executeUIAction() — same DB insert + ACK-wait as Gemini tool calls */
            const uiResult = await executeUIAction({
                simulation_id: simulationId,
                action_type: 'set_work_order',
                action_value: workOrderId,
                reason: `User requested work order change to ${workOrderId} (server short-circuit)`,
            });

            /** Extract success/failure from the executeUIAction result */
            const resultObj = uiResult as { success?: boolean; error?: string };
            const succeeded = resultObj.success === true;

            /** Bilingual response matching Gemini's typical confirmation format */
            const responseMsg = succeeded
                ? (lang === 'tr'
                    ? `✅ İş Emri **${workOrderId}** olarak ayarlandı.`
                    : `✅ Work Order set to **${workOrderId}**.`)
                : (lang === 'tr'
                    ? `⚠️ İş Emri ${workOrderId} ayarlanamadı: ${resultObj.error ?? 'Bilinmeyen hata'}`
                    : `⚠️ Could not set Work Order to ${workOrderId}: ${resultObj.error ?? 'Unknown error'}`);

            return res.status(200).json({
                response: responseMsg,
                toolCallCount: 1,
                model: CWF_MODEL_NAME,
                copilotStateChange: null,
            });
        }


        // =====================================================================
        // Build conversation history for multi-turn context.
        // Apply sanitization FIRST to remove any forced-summary pollution from
        // prior turns before those turns are fed to Gemini as context.
        // =====================================================================
        const sanitizedHistory = sanitizeConversationHistory(conversationHistory);

        const contents: Content[] = [
            /** Map SANITIZED prior conversation turns into Gemini Content format */
            ...sanitizedHistory.map(
                (msg: { role: string; content: string }) => ({
                    role: msg.role === 'user' ? ('user' as const) : ('model' as const),
                    parts: [{ text: msg.content }] as Part[],
                })
            ),
            /** Append the current user message with the active simulation ID context */
            {
                role: 'user' as const,
                parts: [
                    {
                        text: `[Active simulation_id: ${simulationId}, session_code: ${sessionCode}]${historyContext}\n\n${message}`,
                    },
                ] as Part[],
            },
        ];

        /**
         * For parameter change authorization (update_parameter fast-path).
         * Copilot auth cases are already short-circuited above and never reach Gemini.
         * Only the human-in-the-loop update_parameter auth flow (where the user provides
         * the auth code to authorize a pending parameter change) reaches this point.
         */
        const authFastPathInstruction = isAuthTurn && !isCopilotAuthContext
            ? (lang === 'tr' ? CWF_AUTH_FAST_PATH_PROMPT_TR : CWF_AUTH_FAST_PATH_PROMPT_EN)
            : '';

        /**
         * Initialize Gemini model AFTER auth detection so we can append
         * the fast-path instruction to the system prompt when needed.
         * Combining the base system prompt + auth fast-path (if any) into
         * one system instruction sent to Gemini for this single request.
         */
        const model = genAI.getGenerativeModel({
            model: CWF_MODEL_NAME,
            /** Base system prompt + optional fast-path instruction for auth turns */
            systemInstruction: (await buildSystemPrompt(lang, mergedUiContext)) + authFastPathInstruction,

            tools: [{ functionDeclarations: tools }],
        });

        // Start chat session with history (all messages except the latest)
        const chat = model.startChat({
            history: contents.slice(0, -1),
        });

        // Send the latest user message to begin the agent loop
        let response = await chat.sendMessage(
            contents[contents.length - 1].parts
        );
        let result = response.response;

        /** Tracks how many tool-use round-trips have occurred */
        let loopCount = 0;

        /** Tracks if copilot state was changed during this request.
         *  Set to 'enabled' or 'disabled' by the enable_copilot / disable_copilot
         *  tool handlers. Returned to the client so cwfStore can directly update
         *  the copilotStore without relying on Supabase Realtime. */
        let copilotStateChange: 'enabled' | 'disabled' | null = null;

        // =========================================================================
        // AGENT TOOL-USE LOOP
        // Gemini may request function calls; we execute them and feed results back.
        // The loop continues until Gemini returns a text-only response or we
        // hit CWF_MAX_TOOL_LOOPS (configurable via params/cwfAgent.ts).
        // =========================================================================
        while (loopCount < CWF_MAX_TOOL_LOOPS) {
            const candidate = result.candidates?.[0];
            if (!candidate) break;

            // Check if Gemini wants to call functions
            const functionCalls = (candidate.content?.parts ?? []).filter(
                (part) => 'functionCall' in part
            );

            /** No more function calls → final text response is ready */
            if (functionCalls.length === 0) break;

            // Execute all requested function calls in sequence
            const functionResponses: Part[] = [];

            for (const part of functionCalls) {
                if (!('functionCall' in part)) continue;
                const { name, args } = part.functionCall!;

                /** Cast args to a record for property access (SDK types args as object) */
                const typedArgs = args as Record<string, unknown>;

                /** Result of executing the tool function */
                let toolResult: unknown;

                // Dispatch to the appropriate tool handler
                switch (name) {
                    case 'query_database':
                        toolResult = await executeQuery(typedArgs.sql as string);
                        break;
                    case 'get_simulation_summary':
                        /**
                         * ALWAYS use the server's authoritative simulationId — NEVER trust
                         * the simulation_id the LLM passes in its tool call args.
                         * The LLM infers the UUID from conversation history and frequently
                         * supplies a stale or wrong ID, causing it to query a completely
                         * different session's OEE data. The server already has the correct
                         * simulationId from the validated request body.
                         */
                        toolResult = await getSimulationSummary(simulationId);
                        break;
                    case 'save_analysis': {
                        /** Always pin simulation_id to the server's authoritative value — never trust LLM-provided one */
                        const saveArgs = typedArgs as Parameters<typeof saveAnalysis>[0];
                        toolResult = await saveAnalysis({
                            ...saveArgs,
                            simulation_id: simulationId,
                        });
                        break;
                    }
                    case 'update_parameter':
                        /** Execute CWF parameter change via cwf_commands queue */
                        toolResult = await executeUpdateParameter(
                            typedArgs as unknown as Parameters<typeof executeUpdateParameter>[0]
                        );
                        break;
                    case 'execute_ui_action':
                        /** Dispatch a UI action (panel toggle, sim start/stop, etc.) via the browser listener */
                        toolResult = await executeUIAction(
                            typedArgs as unknown as Parameters<typeof executeUIAction>[0]
                        );
                        break;
                    case 'switch_scenario': {
                        /**
                         * switch_scenario — Load a different defect scenario without pausing
                         * the simulation. The tool re-uses the existing execute_ui_action transport:
                         * INSERT a cwf_commands row with station='ui_action',
                         * parameter='switch_scenario', reason=…| value: <scenario_code>.
                         * The browser listener's processUIActionCommand() picks it up and
                         * calls resetToFactoryDefaults() + loadScenario() directly on the store.
                         *
                         * Pin simulation_id to the server-authoritative value — same safeguard
                         * used by get_simulation_summary and save_analysis above.
                         */
                        const scenarioCode = typedArgs.scenario_code as string;
                        const switchReason = typedArgs.reason as string;

                        /**
                         * Delegate to executeUIAction() so the same ACK-wait polling loop
                         * is shared for switch_scenario as for all other UI commands.
                         * action_value carries the scenario code through the reason field
                         * encoding ('…| value: SCN-002') to the browser listener.
                         */
                        toolResult = await executeUIAction({
                            /** Always use server's authoritative simulationId */
                            simulation_id: simulationId,
                            /** action_type that processUIActionCommand() will dispatch on */
                            action_type: 'switch_scenario',
                            /** The scenario code to switch to, e.g. 'SCN-002' */
                            action_value: scenarioCode,
                            /** Human-readable reason forwarded to cwf_commands.reason column */
                            reason: switchReason || `Switch to ${scenarioCode}`,
                        });
                        break;
                    }
                    case 'enable_copilot': {
                        /**
                         * Enable copilot autonomous mode.
                         * Auth validation happens here AND server-side before Gemini is called.
                         * This double-validation ensures correctness even if LLM bypasses server check.
                         */
                        const copilotAuthCode = typedArgs.authorized_by as string;
                        const copilotSimId = (typedArgs.simulation_id as string) || simulationId;

                        /** Case-insensitive + trim() comparison — tolerates capitalisation and accidental whitespace */
                        if (copilotAuthCode.trim().toLowerCase() !== CWF_AUTH_CODE.trim().toLowerCase()) {
                            /**
                             * Wrong code: update Supabase to reflect this is still pending.
                             * The handler already incremented auth_attempts, but we re-set
                             * cwf_state to copilot_pending_auth to be explicit.
                             */
                            await supabase.from('copilot_config')
                                .update({ cwf_state: 'copilot_pending_auth' })
                                .eq('simulation_id', copilotSimId);
                            toolResult = {
                                error: 'Incorrect authorization code. AutoPilot mode was NOT enabled.',
                                attemptsRemaining: Math.max(0, COPILOT_MAX_AUTH_ATTEMPTS - (authAttempts + 1)),
                            };
                        } else {
                            try {
                                /**
                                 * Correct code: transition state to copilot_active.
                                 * The copilot engine endpoint also handles this, but we update
                                 * Supabase directly here as a safeguard (engine may be unreachable).
                                 */
                                await supabase.from('copilot_config').upsert({
                                    simulation_id: copilotSimId,
                                    cwf_state: 'copilot_active',
                                    auth_attempts: 0,
                                    activated_by: copilotAuthCode,
                                    /** Explicitly set poll interval — DB default would be 15s */
                                    poll_interval_sec: 6,
                                    cooldown_sec: 30,
                                    /** Allow Copilot to correct ALL out-of-range params in one cycle */
                                    max_actions_per_minute: 20,
                                    last_heartbeat_at: new Date().toISOString(),
                                    updated_at: new Date().toISOString(),
                                }, { onConflict: 'simulation_id' });

                                /**
                                 * Call the copilot engine endpoint.
                                 *
                                 * LOCAL DEV: cwf-dev-server.ts runs on CWF_DEV_PORT and starts the
                                 *   in-memory CopilotEngine polling loop.
                                 * VERCEL: No persistent engine — the DB upsert above is sufficient.
                                 *   The browser's useCopilotHeartbeat hook detects copilot_active state
                                 *   and drives evaluation cycles via /api/cwf/copilot/evaluate.
                                 */
                                if (process.env.CWF_DEV_PORT) {
                                    /** Local dev: call cwf-dev-server to start the engine */
                                    try {
                                        const enableRes = await fetch(`http://localhost:${process.env.CWF_DEV_PORT}/api/cwf/copilot/enable`, {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({
                                                simulationId: copilotSimId,
                                                activatedBy: copilotAuthCode,
                                            }),
                                        });
                                        const enableData = await enableRes.json() as Record<string, unknown>;
                                        toolResult = { ...enableData, cwfState: 'copilot_active', attemptsRemaining: COPILOT_MAX_AUTH_ATTEMPTS };
                                    } catch {
                                        /** Engine endpoint unreachable — DB update above already set state */
                                        toolResult = {
                                            success: true,
                                            message: 'Copilot enabled (engine will start on next poll).',
                                            cwfState: 'copilot_active',
                                            attemptsRemaining: COPILOT_MAX_AUTH_ATTEMPTS,
                                        };
                                    }
                                } else {
                                    /**
                                     * Vercel: DB upsert is done. Browser will detect copilot_active
                                     * via Supabase Realtime and start calling /api/cwf/copilot/evaluate.
                                     */
                                    toolResult = {
                                        success: true,
                                        message: 'Copilot enabled — browser will drive monitoring cycles.',
                                        cwfState: 'copilot_active',
                                        attemptsRemaining: COPILOT_MAX_AUTH_ATTEMPTS,
                                    };
                                }
                                /** Track successful copilot enablement for the response */
                                copilotStateChange = 'enabled';
                            } catch (enableErr) {
                                toolResult = { error: `Failed to enable copilot: ${String(enableErr)}` };
                            }
                        }
                        break;
                    }
                    case 'disable_copilot': {
                        /**
                         * Disable copilot mode — no auth required.
                         * Resets state machine to 'normal' and clears auth_attempts.
                         */
                        const disableSimId = (typedArgs.simulation_id as string) || simulationId;
                        try {
                            /** First update Supabase state machine to normal */
                            await supabase.from('copilot_config')
                                .update({
                                    cwf_state: 'normal',
                                    auth_attempts: 0,
                                    updated_at: new Date().toISOString(),
                                })
                                .eq('simulation_id', disableSimId);

                            /**
                             * Call the copilot engine disable endpoint.
                             *
                             * LOCAL DEV: cwf-dev-server.ts stops the in-memory CopilotEngine.
                             * VERCEL: DB update above is sufficient — browser stops calling evaluate.
                             */
                            if (process.env.CWF_DEV_PORT) {
                                /** Local dev: call cwf-dev-server to stop the engine */
                                try {
                                    const disableRes = await fetch(`http://localhost:${process.env.CWF_DEV_PORT}/api/cwf/copilot/disable`, {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ simulationId: disableSimId }),
                                    });
                                    const disableData = await disableRes.json() as Record<string, unknown>;
                                    toolResult = { ...disableData, cwfState: 'normal' };
                                } catch {
                                    toolResult = { success: true, message: 'Copilot disabled.', cwfState: 'normal' };
                                }
                            } else {
                                /** Vercel: DB update done. Browser will detect the state change. */
                                toolResult = { success: true, message: 'Copilot disabled.', cwfState: 'normal' };
                            }
                            /** Track successful copilot disablement for the response */
                            copilotStateChange = 'disabled';
                        } catch (disableErr) {
                            toolResult = { error: `Failed to disable copilot: ${String(disableErr)}` };
                        }
                        break;
                    }

                    default:
                        toolResult = { error: `Unknown function: ${name}` };
                }

                // Package the tool result for Gemini's next turn
                functionResponses.push({
                    functionResponse: {
                        name,
                        response: { result: toolResult },
                    },
                } as Part);
            }

            // Feed function results back to Gemini for the next round
            response = await chat.sendMessage(functionResponses);
            result = response.response;
            loopCount++;

            /** Log each tool-use round for debugging */
            console.log(`[CWF] Tool loop ${loopCount}/${CWF_MAX_TOOL_LOOPS} — ${functionCalls.length} call(s) executed`);
        }

        // =====================================================================
        // FIX: Force a final text turn when the loop limit is reached.
        // If Gemini's last response still contains functionCall parts, it
        // wanted more tool calls but we capped it. Send a forced-summary
        // prompt so the model produces a text-only answer with whatever
        // data it has gathered so far.
        // =====================================================================
        const lastCandidate = result.candidates?.[0];
        const stillWantsTools = (lastCandidate?.content?.parts ?? []).some(
            (part) => 'functionCall' in part
        );

        if (stillWantsTools) {
            /** Choose the bilingual forced-summary prompt */
            const forcePromptText = lang === 'tr'
                ? CWF_FORCE_SUMMARY_PROMPT_TR
                : CWF_FORCE_SUMMARY_PROMPT_EN;

            /**
             * Prefix with CWF_FORCE_SUMMARY_SENTINEL before sending.
             * This ensures that if this injected turn somehow ends up stored
             * in conversation history on the client side, the sanitizer will
             * detect and remove it on the next request.
             */
            const forcePrompt = `${CWF_FORCE_SUMMARY_SENTINEL} ${forcePromptText}`;

            /** Send one final user turn that forbids further tool calls */
            response = await chat.sendMessage([{ text: forcePrompt }]);
            result = response.response;
        }

        // =====================================================================
        // FIX: Robust text extraction with thinking-part filter.
        // Gemini 2.5 Flash may include "thinking" parts (thought: true)
        // with empty text. We filter those out and handle the case where
        // .join('') produces an empty string (the old ?? fallback missed
        // this because '' is not nullish).
        // =====================================================================
        /** Extract only genuine text parts (exclude thinking parts) */
        const extractedText = (result.candidates?.[0]?.content.parts ?? [])
            .filter((part): part is { text: string } => {
                /** Part must have a 'text' property */
                if (!('text' in part)) return false;
                /** Exclude Gemini 2.5 "thinking" parts that carry no user-facing text */
                if ('thought' in part && (part as Record<string, unknown>).thought === true) return false;
                return true;
            })
            .map((part) => part.text)
            .join('\n');

        /** Debug: log what Gemini returned so we can diagnose fallback triggers */
        const allParts = result.candidates?.[0]?.content.parts ?? [];
        const finishReason = result.candidates?.[0]?.finishReason ?? 'UNKNOWN';
        console.log(`[CWF] Final response — ${allParts.length} parts, extracted text length: ${extractedText.trim().length}, loops: ${loopCount}, stillWantsTools: ${stillWantsTools}, finishReason: ${finishReason}`);

        // =================================================================
        // RETRY LOGIC: If Gemini returned an empty response, retry within
        // the SAME chat session (preserving all tool results gathered)
        // with a direct "answer now" prompt. Previously this created a
        // fresh chat that lost all context — now we keep it.
        // =================================================================
        if (extractedText.trim().length === 0) {
            console.log(`[CWF] ⚠️ Empty text! Part types:`, allParts.map(p => {
                const keys = Object.keys(p);
                const isThought = 'thought' in p && (p as Record<string, unknown>).thought;
                return `{${keys.join(',')}}${isThought ? '[thinking]' : ''}`;
            }));

            /** Retry within the SAME chat session to preserve all gathered tool data */
            for (let retry = 1; retry <= CWF_EMPTY_RESPONSE_MAX_RETRIES; retry++) {
                const delayMs = CWF_RETRY_BASE_DELAY_MS * retry;
                console.log(`[CWF] 🔄 Retry ${retry}/${CWF_EMPTY_RESPONSE_MAX_RETRIES} after ${delayMs}ms (same chat)...`);
                await new Promise(resolve => setTimeout(resolve, delayMs));

                try {
                    /**
                     * Send a direct "answer now" prompt into the SAME chat session.
                     * This preserves all previous tool results so Gemini can
                     * summarize what it already gathered instead of starting over.
                     */
                    /**
                     * Prefix the retry prompt with the sentinel tag.
                     * This ensures it gets sanitized out of history on the next request
                     * and does not leak "Do NOT call any tools" as a standing instruction.
                     */
                    const retryPromptText = lang === 'tr'
                        ? 'Topladığın tüm verileri kullanarak şimdi cevap ver. Araç çağrısı yapma. Verilerle kısa ve net bir özet yaz.'
                        : 'Answer NOW using all the data you already collected. Do NOT call any tools. Write a clear, concise summary with the actual numbers you found.';
                    const retryPrompt = `${CWF_FORCE_SUMMARY_SENTINEL} ${retryPromptText}`;

                    const retryResponse = await chat.sendMessage([{ text: retryPrompt }]);
                    const retryResult = retryResponse.response;

                    /** Extract text from retry result using the same logic */
                    const retryText = (retryResult.candidates?.[0]?.content.parts ?? [])
                        .filter((part): part is { text: string } => {
                            if (!('text' in part)) return false;
                            if ('thought' in part && (part as Record<string, unknown>).thought === true) return false;
                            return true;
                        })
                        .map((part) => part.text)
                        .join('\n');

                    const retryFinishReason = retryResult.candidates?.[0]?.finishReason ?? 'UNKNOWN';
                    console.log(
                        `[CWF] 🔄 Retry ${retry} result — ${retryResult.candidates?.[0]?.content.parts?.length ?? 0} parts, ` +
                        `text length: ${retryText.trim().length}, finishReason: ${retryFinishReason}`
                    );

                    if (retryText.trim().length > 0) {
                        console.log(`[CWF] ✅ Retry ${retry} succeeded (same chat context)!`);
                        return res.status(200).json({
                            response: retryText,
                            toolCallCount: loopCount,
                            model: CWF_MODEL_NAME,
                            copilotStateChange,
                        });
                    }
                } catch (retryErr) {
                    console.warn(`[CWF] 🔄 Retry ${retry} failed:`, (retryErr as Error).message);
                }
            }

            console.log(`[CWF] ❌ All ${CWF_EMPTY_RESPONSE_MAX_RETRIES} retries exhausted. Returning fallback.`);
        }

        /** Choose language-appropriate fallback if the extracted text is empty */
        const fallbackMessage = lang === 'tr'
            ? CWF_FALLBACK_RESPONSE_TR
            : CWF_FALLBACK_RESPONSE_EN;

        /** FIX: Use trim-check instead of nullish coalescing so '' triggers the fallback */
        const finalText = extractedText.trim()
            ? extractedText
            : fallbackMessage;

        return res.status(200).json({
            response: finalText,
            toolCallCount: loopCount,
            model: CWF_MODEL_NAME,
            copilotStateChange,
        });
    } catch (error) {
        console.error('CWF Agent error:', error);
        const errorMessage = (error as Error).message;

        // Map technical errors to user-friendly messages
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
