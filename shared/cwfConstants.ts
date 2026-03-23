/**
 * cwfConstants.ts — SHARED CWF Agent Configuration Constants
 *
 * SHARED between src/ and api/. Do NOT add imports from src/lib
 * or node_modules that are not available in the Vercel serverless
 * environment.
 *
 * This file is the SINGLE SOURCE OF TRUTH for constants that must stay
 * in sync between the client-side app (src/) and the Vercel serverless
 * functions (api/). By sharing a single file, drift between the two
 * compilation targets is impossible.
 *
 * Imported by:
 *   - src/lib/params/cwfAgent.ts (re-exports for client-side consumers)
 *   - api/cwf/chat.ts (direct import for serverless function)
 *
 * Both tsconfig.app.json and tsconfig.api.json include the shared/
 * directory in their include arrays to support this shared module.
 */

// =============================================================================
// AGENT LOOP CONFIGURATION
// =============================================================================

/**
 * Maximum number of Gemini tool-use round-trips before the agent loop
 * forcefully terminates. Set to 12 to allow complex multi-query analyses
 * (e.g., root cause investigations that need 8–10 queries) without
 * premature cut-off.
 *
 * History: was 5 → 8 (client) → 12 (server). Unified at 12.
 */
export const CWF_MAX_TOOL_LOOPS = 12;

/** Maximum retries when Gemini returns an empty response (0 text parts) */
export const CWF_EMPTY_RESPONSE_MAX_RETRIES = 2;

/** Base delay in ms before each retry (multiplied by attempt number for backoff) */
export const CWF_RETRY_BASE_DELAY_MS = 1000;

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
 * response still contains functionCall parts, we inject this prompt to
 * force Gemini to produce a text-only summary.
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
// FORCED-SUMMARY HISTORY SANITIZATION
// =============================================================================

/**
 * Unique sentinel prefix prepended to every forced-summary injection.
 * The history sanitizer detects this prefix in user turns and removes them.
 */
export const CWF_FORCE_SUMMARY_SENTINEL = '[[CWF_FORCE_SUMMARY]]';

/**
 * Substring fingerprint used to detect forced-summary contamination in
 * ASSISTANT messages. The sanitizer scans prior assistant turns for this
 * fingerprint and removes any that contain it.
 */
export const CWF_FORCE_SUMMARY_FINGERPRINT = 'Do NOT';

/**
 * Substring fingerprint for the retry prompt contamination path.
 * Appears in retry-path assistant turns and must be stripped from history.
 */
export const CWF_RETRY_PROMPT_FINGERPRINT = 'Answer NOW using all the data';

// =============================================================================
// AUTH-TURN FAST-PATH PROMPT (BILINGUAL)
// =============================================================================

/**
 * Injected into the Gemini system prompt when the current user message
 * is detected as an authorization code confirmation turn.
 *
 * Tells Gemini to execute the pending action immediately with ONE tool call
 * rather than re-querying state (which burns loops and can hit
 * CWF_MAX_TOOL_LOOPS before the actual execution tool is called).
 */
export const CWF_AUTH_FAST_PATH_PROMPT_EN = `
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

Example: if the user typed "ardic", call update_parameter with authorized_by="ardic" immediately.
`;

/** Turkish translation of the auth fast-path prompt */
export const CWF_AUTH_FAST_PATH_PROMPT_TR = `
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

Örnek: kullanıcı "ardic" yazdıysa, hemen authorized_by="ardic" ile update_parameter'ı çağırın.
`;

// =============================================================================
// PARAMETER DISPLAY PROMPT (Injected into CWF system prompt)
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
 * Grouped by station for maintainability.
 */
export const CWF_PARAMETER_DISPLAY_NAMES: Record<string, ParameterDisplayEntry> = {
    // ── Press ────────────────────────────────────────────────────────────
    pressure_bar: { en: 'Pressure (bar)', tr: 'Basınç (bar)' },
    cycle_time_sec: { en: 'Cycle Time (sec)', tr: 'Çevrim Süresi (sn)' },
    mold_temperature_c: { en: 'Mould Temperature (°C)', tr: 'Kalıp Sıcaklığı (°C)' },
    powder_moisture_pct: { en: 'Powder Moisture (%)', tr: 'Toz Nemi (%)' },
    fill_amount_g: { en: 'Fill Amount (g)', tr: 'Dolum Miktarı (g)' },
    mold_wear_pct: { en: 'Mould Wear (%)', tr: 'Kalıp Aşınması (%)' },
    pressure_deviation_pct: { en: 'Pressure Deviation (%)', tr: 'Basınç Sapması (%)' },
    fill_homogeneity_pct: { en: 'Fill Homogeneity (%)', tr: 'Dolum Homojenliği (%)' },
    // ── Dryer ────────────────────────────────────────────────────────────
    inlet_temperature_c: { en: 'Inlet Temperature (°C)', tr: 'Giriş Sıcaklığı (°C)' },
    outlet_temperature_c: { en: 'Outlet Temperature (°C)', tr: 'Çıkış Sıcaklığı (°C)' },
    belt_speed_m_min: { en: 'Belt Speed (m/min)', tr: 'Bant Hızı (m/dk)' },
    drying_time_min: { en: 'Drying Time (min)', tr: 'Kurutma Süresi (dk)' },
    exit_moisture_pct: { en: 'Exit Moisture (%)', tr: 'Çıkış Nemi (%)' },
    fan_frequency_hz: { en: 'Fan Frequency (Hz)', tr: 'Fan Frekansı (Hz)' },
    temperature_gradient_c_m: { en: 'Temperature Gradient (°C/m)', tr: 'Sıcaklık Gradyanı (°C/m)' },
    drying_rate: { en: 'Drying Rate', tr: 'Kurutma Hızı' },
    moisture_homogeneity_pct: { en: 'Moisture Homogeneity (%)', tr: 'Nem Homojenliği (%)' },
    // ── Glaze ────────────────────────────────────────────────────────────
    glaze_density_g_cm3: { en: 'Glaze Density (g/cm³)', tr: 'Sır Yoğunluğu (g/cm³)' },
    glaze_viscosity_sec: { en: 'Glaze Viscosity (sec)', tr: 'Sır Viskozitesi (sn)' },
    application_weight_g_m2: { en: 'Application Weight (g/m²)', tr: 'Uygulama Ağırlığı (g/m²)' },
    cabin_pressure_bar: { en: 'Cabin Pressure (bar)', tr: 'Kabin Basıncı (bar)' },
    nozzle_angle_deg: { en: 'Nozzle Angle (°)', tr: 'Nozül Açısı (°)' },
    glaze_temperature_c: { en: 'Glaze Temperature (°C)', tr: 'Sır Sıcaklığı (°C)' },
    weight_deviation_pct: { en: 'Weight Deviation (%)', tr: 'Ağırlık Sapması (%)' },
    nozzle_clog_pct: { en: 'Nozzle Clog (%)', tr: 'Nozül Tıkanıklığı (%)' },
    // ── Printer (Digital Inkjet) ─────────────────────────────────────────
    head_temperature_c: { en: 'Head Temperature (°C)', tr: 'Kafa Sıcaklığı (°C)' },
    ink_viscosity_mpa_s: { en: 'Ink Viscosity (mPa·s)', tr: 'Mürekkep Viskozitesi (mPa·s)' },
    drop_size_pl: { en: 'Drop Size (pl)', tr: 'Damla Boyutu (pl)' },
    resolution_dpi: { en: 'Resolution (dpi)', tr: 'Çözünürlük (dpi)' },
    head_gap_mm: { en: 'Head Gap (mm)', tr: 'Kafa Boşluğu (mm)' },
    color_channels: { en: 'Colour Channels', tr: 'Renk Kanalları' },
    active_nozzle_pct: { en: 'Active Nozzle (%)', tr: 'Aktif Nozül (%)' },
    ink_levels_pct: { en: 'Ink Levels (%)', tr: 'Mürekkep Seviyeleri (%)' },
    // ── Kiln ─────────────────────────────────────────────────────────────
    max_temperature_c: { en: 'Max Temperature (°C)', tr: 'Maks. Sıcaklık (°C)' },
    firing_time_min: { en: 'Firing Time (min)', tr: 'Pişirme Süresi (dk)' },
    preheat_gradient_c_min: { en: 'Preheat Gradient (°C/min)', tr: 'Ön Isıtma Gradyanı (°C/dk)' },
    cooling_gradient_c_min: { en: 'Cooling Gradient (°C/min)', tr: 'Soğutma Gradyanı (°C/dk)' },
    atmosphere_pressure_mbar: { en: 'Atmosphere Pressure (mbar)', tr: 'Atmosfer Basıncı (mbar)' },
    zone_count: { en: 'Zone Count', tr: 'Bölge Sayısı' },
    o2_level_pct: { en: 'O₂ Level (%)', tr: 'O₂ Seviyesi (%)' },
    zone_temperatures_c: { en: 'Zone Temperatures (°C)', tr: 'Bölge Sıcaklıkları (°C)' },
    temperature_deviation_c: { en: 'Temperature Deviation (°C)', tr: 'Sıcaklık Sapması (°C)' },
    gradient_balance_pct: { en: 'Gradient Balance (%)', tr: 'Gradyan Dengesi (%)' },
    zone_variance_c: { en: 'Zone Variance (°C)', tr: 'Bölge Varyansı (°C)' },
    // ── Sorting ──────────────────────────────────────────────────────────
    camera_resolution_mp: { en: 'Camera Resolution (MP)', tr: 'Kamera Çözünürlüğü (MP)' },
    scan_rate_tiles_min: { en: 'Scan Rate (tiles/min)', tr: 'Tarama Hızı (karo/dk)' },
    size_tolerance_mm: { en: 'Size Tolerance (mm)', tr: 'Boyut Toleransı (mm)' },
    color_tolerance_de: { en: 'Colour Tolerance (ΔE)', tr: 'Renk Toleransı (ΔE)' },
    flatness_tolerance_mm: { en: 'Flatness Tolerance (mm)', tr: 'Düzlük Toleransı (mm)' },
    defect_threshold_mm2: { en: 'Defect Threshold (mm²)', tr: 'Hata Eşiği (mm²)' },
    grade_count: { en: 'Grade Count', tr: 'Kalite Sınıfı Sayısı' },
    calibration_drift_pct: { en: 'Calibration Drift (%)', tr: 'Kalibrasyon Kayması (%)' },
    camera_cleanliness_pct: { en: 'Camera Cleanliness (%)', tr: 'Kamera Temizliği (%)' },
    // ── Packaging ────────────────────────────────────────────────────────
    stack_count: { en: 'Stack Count', tr: 'İstif Sayısı' },
    box_sealing_pressure_bar: { en: 'Box Sealing Pressure (bar)', tr: 'Kutu Mühürleme Basıncı (bar)' },
    pallet_capacity_m2: { en: 'Pallet Capacity (m²)', tr: 'Palet Kapasitesi (m²)' },
    stretch_tension_pct: { en: 'Stretch Tension (%)', tr: 'Germe Gerilimi (%)' },
    robot_speed_cycles_min: { en: 'Robot Speed (cycles/min)', tr: 'Robot Hızı (çevrim/dk)' },
    label_accuracy_pct: { en: 'Label Accuracy (%)', tr: 'Etiket Doğruluğu (%)' },
    // ── Conveyor ─────────────────────────────────────────────────────────
    jammed_time: { en: 'Jam Duration (cycles)', tr: 'Sıkışma Süresi (çevrim)' },
    impacted_tiles: { en: 'Tiles Scrapped Per Jam', tr: 'Sıkışma Başı Hurda Karo' },
    scrap_probability: { en: 'Scrap Probability (%)', tr: 'Hurda Olasılığı (%)' },
    speed_change: { en: 'Speed Change Events', tr: 'Hız Değişimi Olayları' },
    jammed_events: { en: 'Jam Events Enabled', tr: 'Sıkışma Olayları Etkin' },
};

/**
 * Pre-built prompt section that tells Gemini to always translate
 * raw database column names into human-readable labels.
 * Built dynamically from CWF_PARAMETER_DISPLAY_NAMES so the mapping
 * stays in sync automatically.
 */
export const CWF_PARAMETER_DISPLAY_PROMPT = (() => {
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
