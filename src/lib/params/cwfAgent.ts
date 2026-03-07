/**
 * cwfAgent.ts — CWF (Chat With your Factory) Agent Configuration Parameters
 *
 * Centralised configuration for the CWF AI agent serverless function
 * and client-side handling. All CWF-related constants live here so they
 * can be tuned without modifying business logic in cwfService.ts,
 * cwfStore.ts, or api/cwf/chat.ts.
 *
 * Sections:
 *  - Agent loop limits (max tool-use iterations)
 *  - Client timeout settings
 *  - Model configuration
 *  - Fallback response messages (bilingual)
 *  - Forced-summarisation prompt text
 *  - Parameter display-name mapping (bilingual)
 *
 * Used by: api/cwf/chat.ts, cwfService.ts, cwfStore.ts
 */

// =============================================================================
// AGENT LOOP CONFIGURATION
// =============================================================================

/**
 * Maximum number of Gemini tool-use round-trips before the agent loop
 * forcefully terminates. Increased from 5 → 8 so complex multi-query
 * questions (e.g., root cause analyses that need 6–7 queries) are not
 * cut short prematurely.
 */
export const CWF_MAX_TOOL_LOOPS = 8;

// =============================================================================
// CLIENT-SIDE TIMEOUT
// =============================================================================

/**
 * AbortSignal timeout in milliseconds for the frontend fetch() call.
 * Must be lower than the Vercel function maxDuration (60 s) so the
 * client aborts before the serverless function is forcibly killed,
 * allowing a user-readable timeout error rather than a dropped connection.
 */
export const CWF_CLIENT_TIMEOUT_MS = 55_000;

// =============================================================================
// MODEL CONFIGURATION
// =============================================================================

/** Gemini model identifier used by the CWF agent */
export const CWF_MODEL_NAME = 'gemini-2.5-flash';

/** Model version tag persisted alongside saved analyses in ai_analysis_results */
export const CWF_MODEL_VERSION_TAG = 'gemini-2.5-flash-cwf-v1';

// =============================================================================
// FALLBACK RESPONSE MESSAGES (BILINGUAL)
// =============================================================================

/**
 * Fallback message shown when the agent loop exhausts all tool-use
 * rounds but the model fails to produce any final text response.
 * This can happen when Gemini 2.5 Flash returns empty text parts
 * after intensive tool-use sessions — a known SDK/model behaviour.
 */
export const CWF_FALLBACK_RESPONSE_EN =
    '⚠️ I gathered data from the database but could not generate a complete answer. ' +
    'Please try again or rephrase your question with more specific details.';

/** Turkish translation of the fallback response */
export const CWF_FALLBACK_RESPONSE_TR =
    '⚠️ Veritabanından veri topladım ancak tam bir yanıt oluşturamadım. ' +
    'Lütfen tekrar deneyin veya sorunuzu daha spesifik ayrıntılarla yeniden ifade edin.';

// =============================================================================
// FORCED-SUMMARISATION PROMPT
// =============================================================================

/**
 * When the agent loop reaches CWF_MAX_TOOL_LOOPS and the model's last
 * response still contains functionCall parts (i.e., it wants MORE tools),
 * we inject this prompt to force Gemini to produce a text-only summary
 * of everything it has gathered so far.
 *
 * Bilingual variant is chosen at runtime based on the session language.
 */
export const CWF_FORCE_SUMMARY_PROMPT_EN =
    'You have reached the maximum number of tool calls. ' +
    'Please provide your best answer now using ONLY the data you have already collected. ' +
    'Do NOT request any more tool calls. Summarise your findings clearly.';

/** Turkish translation of the forced-summary prompt */
export const CWF_FORCE_SUMMARY_PROMPT_TR =
    'Maksimum araç çağrısı sayısına ulaştınız. ' +
    'Lütfen şu ana kadar topladığınız verilerle en iyi yanıtınızı verin. ' +
    'Daha fazla araç çağrısı yapmayın. Bulgularınızı net bir şekilde özetleyin.';

// =============================================================================
// OEE SYSTEM CONTEXT (Injected into CWF system prompt)
// =============================================================================

/**
 * OEE domain knowledge for the CWF agent.
 * This is the SOURCE OF TRUTH — keep in sync with the mirrored copy
 * in api/cwf/chat.ts (which cannot import from src/).
 */
export const CWF_OEE_SYSTEM_CONTEXT = `
## OEE SYSTEM (Hierarchical Machine/Line/Factory)

This factory uses a real-world P × Q OEE model (no synthetic Availability factor):
- Performance (P) = actual output / theoretical capacity
- Quality (Q) = output / input (yield per machine)
- MOEE = P × Q per machine

### 8 Machine OEEs:
Line 1: Press (C/A), Dryer (D²/AC), Glaze (E²/AD), Digital (F²/AE)
Line 3: Conveyor (G_clean/F) — yield only, measures transit damage
Line 2: Kiln (GH/BG), Sorting (HI/BH), Packaging (IJ/BI)

### 3 Line OEEs (telescoped — intermediate variables cancel):
- Line 1 (Forming & Finishing): LOEE = F/A (digital output / press theoretical)
- Line 2 (Firing & Dispatch): LOEE = J/B (packaging output / kiln theoretical)
- Line 3 (Conveyor): LOEE = G_clean/F (clean transit yield)

### Factory OEE:
FOEE = J / min(A, B) — anchored to the bottleneck
- A = Press theoretical rate (12 tiles/min)
- B = Kiln theoretical rate (8 tiles/min)
- Kiln is typically the bottleneck (B < A), so FOEE ≈ J/B

### Diagnostic approach:
When asked about OEE, trace: FOEE → weakest LOEE → weakest MOEE → P vs Q
- Low P = machine slow, starved, or stopped frequently
- Low Q = machine creating defects or losing tiles
- Conveyor Q < 1.0 = jam damage during transit

### Energy:
Each machine has kWh/tile efficiency. Kiln dominates energy (100 kWh base + 100 m³ gas, 80% idle factor).
Factory energy = Σ all stations. Watch kWh/tile trends.
`;

// =============================================================================
// PARAMETER DISPLAY-NAME MAPPING (Bilingual EN/TR)
// =============================================================================

/**
 * Bilingual display-name entry for a single database column.
 * `en` = English human-readable label shown to the user.
 * `tr` = Turkish human-readable label shown to the user.
 */
export interface ParameterDisplayEntry {
    /** English human-readable label */
    en: string;
    /** Turkish human-readable label */
    tr: string;
}

/**
 * Complete mapping from raw database column names to bilingual
 * human-readable labels. Every machine-state column that the CWF
 * agent might reference in a response is listed here.
 *
 * This is the SOURCE OF TRUTH — keep in sync with the mirrored copy
 * in api/cwf/chat.ts (which cannot import from src/).
 *
 * Grouped by station for maintainability.
 */
export const CWF_PARAMETER_DISPLAY_NAMES: Record<string, ParameterDisplayEntry> = {
    // ── Press ────────────────────────────────────────────────────────────
    /** Hydraulic press force applied to the powder (280-450 bar) */
    pressure_bar: { en: 'Pressure (bar)', tr: 'Basınç (bar)' },
    /** Time for one full press cycle (4-8 sec) */
    cycle_time_sec: { en: 'Cycle Time (sec)', tr: 'Çevrim Süresi (sn)' },
    /** Temperature of the steel mould (40-60 °C) */
    mold_temperature_c: { en: 'Mould Temperature (°C)', tr: 'Kalıp Sıcaklığı (°C)' },
    /** Moisture content of the spray-dried powder (5-7 %) */
    powder_moisture_pct: { en: 'Powder Moisture (%)', tr: 'Toz Nemi (%)' },
    /** Weight of powder loaded into the mould (800-2500 g) */
    fill_amount_g: { en: 'Fill Amount (g)', tr: 'Dolum Miktarı (g)' },
    /** Cumulative wear of the mould surface (0-100 %) */
    mold_wear_pct: { en: 'Mould Wear (%)', tr: 'Kalıp Aşınması (%)' },
    /** Deviation of actual pressure from setpoint (%) */
    pressure_deviation_pct: { en: 'Pressure Deviation (%)', tr: 'Basınç Sapması (%)' },
    /** Uniformity of powder distribution inside the mould (%) */
    fill_homogeneity_pct: { en: 'Fill Homogeneity (%)', tr: 'Dolum Homojenliği (%)' },

    // ── Dryer ────────────────────────────────────────────────────────────
    /** Hot-air inlet temperature (150-250 °C) */
    inlet_temperature_c: { en: 'Inlet Temperature (°C)', tr: 'Giriş Sıcaklığı (°C)' },
    /** Temperature of air exiting the dryer (80-120 °C) */
    outlet_temperature_c: { en: 'Outlet Temperature (°C)', tr: 'Çıkış Sıcaklığı (°C)' },
    /** Speed of the roller/belt carrying tiles through the dryer (1-5 m/min) */
    belt_speed_m_min: { en: 'Belt Speed (m/min)', tr: 'Bant Hızı (m/dk)' },
    /** Total time a tile spends inside the dryer (30-60 min) */
    drying_time_min: { en: 'Drying Time (min)', tr: 'Kurutma Süresi (dk)' },
    /** Residual moisture of the tile leaving the dryer (0.5-1.5 %) */
    exit_moisture_pct: { en: 'Exit Moisture (%)', tr: 'Çıkış Nemi (%)' },
    /** Frequency of the dryer exhaust fan (30-50 Hz) */
    fan_frequency_hz: { en: 'Fan Frequency (Hz)', tr: 'Fan Frekansı (Hz)' },
    /** Temperature gradient along the dryer length (°C/m) */
    temperature_gradient_c_m: { en: 'Temperature Gradient (°C/m)', tr: 'Sıcaklık Gradyanı (°C/m)' },
    /** Rate at which moisture is removed from the tile */
    drying_rate: { en: 'Drying Rate', tr: 'Kurutma Hızı' },
    /** Uniformity of moisture removal across the tile surface (%) */
    moisture_homogeneity_pct: { en: 'Moisture Homogeneity (%)', tr: 'Nem Homojenliği (%)' },

    // ── Glaze ────────────────────────────────────────────────────────────
    /** Density of the glaze suspension (1.35-1.55 g/cm³) */
    glaze_density_g_cm3: { en: 'Glaze Density (g/cm³)', tr: 'Sır Yoğunluğu (g/cm³)' },
    /** Viscosity of the glaze measured by Ford cup (18-35 sec) */
    glaze_viscosity_sec: { en: 'Glaze Viscosity (sec)', tr: 'Sır Viskozitesi (sn)' },
    /** Weight of glaze applied per unit area (300-600 g/m²) */
    application_weight_g_m2: { en: 'Application Weight (g/m²)', tr: 'Uygulama Ağırlığı (g/m²)' },
    /** Air pressure inside the glaze spray cabin (0.3-1.2 bar) */
    cabin_pressure_bar: { en: 'Cabin Pressure (bar)', tr: 'Kabin Basıncı (bar)' },
    /** Spray nozzle angle relative to the tile surface (15-45 deg) */
    nozzle_angle_deg: { en: 'Nozzle Angle (°)', tr: 'Nozül Açısı (°)' },
    /** Temperature of the glaze suspension (20-30 °C) */
    glaze_temperature_c: { en: 'Glaze Temperature (°C)', tr: 'Sır Sıcaklığı (°C)' },
    /** Deviation of applied glaze weight from target (%) */
    weight_deviation_pct: { en: 'Weight Deviation (%)', tr: 'Ağırlık Sapması (%)' },
    /** Percentage of nozzle orifice blocked by dried glaze (%) */
    nozzle_clog_pct: { en: 'Nozzle Clog (%)', tr: 'Nozül Tıkanıklığı (%)' },

    // ── Printer (Digital Inkjet) ─────────────────────────────────────────
    /** Print-head operating temperature (35-45 °C) */
    head_temperature_c: { en: 'Head Temperature (°C)', tr: 'Kafa Sıcaklığı (°C)' },
    /** Viscosity of the ceramic ink (8-15 mPa·s) */
    ink_viscosity_mpa_s: { en: 'Ink Viscosity (mPa·s)', tr: 'Mürekkep Viskozitesi (mPa·s)' },
    /** Volume of each ink droplet (6-80 pl) */
    drop_size_pl: { en: 'Drop Size (pl)', tr: 'Damla Boyutu (pl)' },
    /** Print resolution in dots per inch (360-720 dpi) */
    resolution_dpi: { en: 'Resolution (dpi)', tr: 'Çözünürlük (dpi)' },
    /** Gap between print head and tile surface (1.5-4 mm) */
    head_gap_mm: { en: 'Head Gap (mm)', tr: 'Kafa Boşluğu (mm)' },
    /** Number of active colour channels (4-8) */
    color_channels: { en: 'Colour Channels', tr: 'Renk Kanalları' },
    /** Percentage of nozzles firing correctly (95-100 %) */
    active_nozzle_pct: { en: 'Active Nozzle (%)', tr: 'Aktif Nozül (%)' },
    /** Remaining ink levels per channel (JSONB, %) */
    ink_levels_pct: { en: 'Ink Levels (%)', tr: 'Mürekkep Seviyeleri (%)' },

    // ── Kiln ─────────────────────────────────────────────────────────────
    /** Peak firing temperature inside the kiln (1100-1220 °C) */
    max_temperature_c: { en: 'Max Temperature (°C)', tr: 'Maks. Sıcaklık (°C)' },
    /** Total time a tile spends in the kiln (35-60 min) */
    firing_time_min: { en: 'Firing Time (min)', tr: 'Pişirme Süresi (dk)' },
    /** Heating rate in the preheat zone (15-40 °C/min) */
    preheat_gradient_c_min: { en: 'Preheat Gradient (°C/min)', tr: 'Ön Isıtma Gradyanı (°C/dk)' },
    /** Cooling rate after peak firing (20-50 °C/min) */
    cooling_gradient_c_min: { en: 'Cooling Gradient (°C/min)', tr: 'Soğutma Gradyanı (°C/dk)' },
    /** Internal kiln atmosphere pressure (-0.5 to +0.5 mbar) */
    atmosphere_pressure_mbar: { en: 'Atmosphere Pressure (mbar)', tr: 'Atmosfer Basıncı (mbar)' },
    /** Number of temperature zones inside the kiln (5-15) */
    zone_count: { en: 'Zone Count', tr: 'Bölge Sayısı' },
    /** Oxygen level in the kiln atmosphere (2-8 %) */
    o2_level_pct: { en: 'O₂ Level (%)', tr: 'O₂ Seviyesi (%)' },
    /** Per-zone temperature readings (JSONB array, °C) */
    zone_temperatures_c: { en: 'Zone Temperatures (°C)', tr: 'Bölge Sıcaklıkları (°C)' },
    /** Deviation of actual temperature from setpoint (°C) */
    temperature_deviation_c: { en: 'Temperature Deviation (°C)', tr: 'Sıcaklık Sapması (°C)' },
    /** Balance ratio between preheat and cooling gradients (%) */
    gradient_balance_pct: { en: 'Gradient Balance (%)', tr: 'Gradyan Dengesi (%)' },
    /** Variance between zone temperatures (°C) */
    zone_variance_c: { en: 'Zone Variance (°C)', tr: 'Bölge Varyansı (°C)' },

    // ── Sorting ──────────────────────────────────────────────────────────
    /** Camera sensor resolution (5-20 MP) */
    camera_resolution_mp: { en: 'Camera Resolution (MP)', tr: 'Kamera Çözünürlüğü (MP)' },
    /** Number of tiles the scanner can inspect per minute (20-60) */
    scan_rate_tiles_min: { en: 'Scan Rate (tiles/min)', tr: 'Tarama Hızı (karo/dk)' },
    /** Dimensional tolerance for pass/fail (mm) */
    size_tolerance_mm: { en: 'Size Tolerance (mm)', tr: 'Boyut Toleransı (mm)' },
    /** Colour-difference threshold (ΔE) */
    color_tolerance_de: { en: 'Colour Tolerance (ΔE)', tr: 'Renk Toleransı (ΔE)' },
    /** Maximum allowed flatness deviation (mm) */
    flatness_tolerance_mm: { en: 'Flatness Tolerance (mm)', tr: 'Düzlük Toleransı (mm)' },
    /** Minimum defect area required to flag a tile (mm²) */
    defect_threshold_mm2: { en: 'Defect Threshold (mm²)', tr: 'Hata Eşiği (mm²)' },
    /** Number of quality grades the sorter classifies into (3-5) */
    grade_count: { en: 'Grade Count', tr: 'Kalite Sınıfı Sayısı' },
    /** Cumulative drift of camera calibration (%) */
    calibration_drift_pct: { en: 'Calibration Drift (%)', tr: 'Kalibrasyon Kayması (%)' },
    /** Cleanliness level of the camera lens (%) */
    camera_cleanliness_pct: { en: 'Camera Cleanliness (%)', tr: 'Kamera Temizliği (%)' },

    // ── Packaging ────────────────────────────────────────────────────────
    /** Number of tiles stacked per box (4-12) */
    stack_count: { en: 'Stack Count', tr: 'İstif Sayısı' },
    /** Pressure applied by the box-sealing mechanism (2-5 bar) */
    box_sealing_pressure_bar: { en: 'Box Sealing Pressure (bar)', tr: 'Kutu Mühürleme Basıncı (bar)' },
    /** Maximum area capacity of one pallet (m²) */
    pallet_capacity_m2: { en: 'Pallet Capacity (m²)', tr: 'Palet Kapasitesi (m²)' },
    /** Stretch-wrap film tension (%) */
    stretch_tension_pct: { en: 'Stretch Tension (%)', tr: 'Germe Gerilimi (%)' },
    /** Packaging robot cycle speed (cycles/min) */
    robot_speed_cycles_min: { en: 'Robot Speed (cycles/min)', tr: 'Robot Hızı (çevrim/dk)' },
    /** Accuracy of the label placement on the box (%) */
    label_accuracy_pct: { en: 'Label Accuracy (%)', tr: 'Etiket Doğruluğu (%)' },
};

// =============================================================================
// PARAMETER DISPLAY PROMPT (Injected into CWF system prompt)
// =============================================================================

/**
 * Pre-built prompt section that tells Gemini to always translate
 * raw database column names into human-readable labels.
 * Built dynamically from CWF_PARAMETER_DISPLAY_NAMES so the mapping
 * stays in sync automatically.
 *
 * This is the SOURCE OF TRUTH — keep in sync with the mirrored copy
 * in api/cwf/chat.ts (which cannot import from src/).
 */
export const CWF_PARAMETER_DISPLAY_PROMPT = (() => {
    /** Build a markdown table of column → EN label → TR label */
    const rows = Object.entries(CWF_PARAMETER_DISPLAY_NAMES)
        .map(([col, labels]) => `| ${col} | ${labels.en} | ${labels.tr} |`)
        .join('\n');

    return `## PARAMETER DISPLAY NAMES — MANDATORY
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
${rows}
`;
})();

