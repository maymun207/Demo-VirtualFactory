/**
 * causeEffectConfig.ts — Scenario-Independent Cause-Effect Mapping
 *
 * Defines the physical cause-effect relationship for every station parameter
 * in the virtual factory. When a parameter goes out of its normal operating
 * range, this configuration describes:
 *   - What consequence occurs (bilingual TR/EN)
 *   - Which defect types are expected
 *   - Which KPIs are affected
 *
 * This module is **completely independent of scenarios**. Scenarios only set
 * parameter values; this module defines *what happens* when those values
 * fall outside their safe ranges. The CauseEffectTable component uses this
 * data to dynamically render rows for any out-of-range parameter.
 *
 * Used by: CauseEffectTable.tsx
 */

// =============================================================================
// TYPE DEFINITION
// =============================================================================

/**
 * A single cause-effect entry describing the physical impact of a parameter
 * deviation for a specific station.
 */
export interface CauseEffectEntry {
  /** Station identifier (e.g., 'press', 'kiln'). */
  station: string;
  /** Parameter key matching the ParamDefinition key in machineTooltipConfig. */
  parameter: string;
  /** Bilingual display label for the parameter. */
  parameterLabel: { tr: string; en: string };
  /** Bilingual description of the physical consequence when out of range. */
  consequence: { tr: string; en: string };
  /** List of defect type identifiers that are expected from this deviation. */
  expectedDefects: string[];
  /** List of KPI identifiers affected by this deviation (e.g., 'oee', 'ftq'). */
  affectedKPIs: string[];
}

// =============================================================================
// CAUSE-EFFECT MAP — ALL 45 PARAMETERS
// =============================================================================

/**
 * Complete cause-effect mapping for every parameter across all 7 stations.
 *
 * ORDER: press → dryer → glaze → printer → kiln → sorting → packaging
 *
 * Each entry documents the realistic physical consequence of a parameter
 * going beyond its defined min/max range (from machineTooltipConfig.ts).
 * Severity color and deviation text are computed dynamically at render time.
 */
export const CAUSE_EFFECT_MAP: CauseEffectEntry[] = [

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. PRESS — 6 parameters
  // ═══════════════════════════════════════════════════════════════════════════

  {
    /** Basınç — Low pressure leads to insufficient compaction and cracks. */
    station: 'press',
    parameter: 'pressure_bar',
    parameterLabel: { tr: 'Basınç', en: 'Pressure' },
    consequence: { tr: 'Yetersiz sıkıştırma, karo yoğunluğu düşük', en: 'Insufficient compaction, low tile density' },
    expectedDefects: ['crack_press', 'density_variance'],
    affectedKPIs: ['oee', 'ftq', 'scrap'],
  },
  {
    /** Çevrim Süresi — Out-of-range cycle time causes irregular compaction. */
    station: 'press',
    parameter: 'cycle_time_sec',
    parameterLabel: { tr: 'Çevrim Süresi', en: 'Cycle Time' },
    consequence: { tr: 'Düzensiz sıkıştırma, karo kalınlık sapması', en: 'Irregular compaction, tile thickness variance' },
    expectedDefects: ['density_variance', 'dimension_variance'],
    affectedKPIs: ['oee', 'ftq'],
  },
  {
    /** Kalıp Sıcaklığı — Mold temp drift causes adhesion and surface issues. */
    station: 'press',
    parameter: 'mold_temperature_c',
    parameterLabel: { tr: 'Kalıp Sıcaklığı', en: 'Mold Temp' },
    consequence: { tr: 'Kalıp yapışması ve yüzey pürüzlülüğü riski', en: 'Mold adhesion and surface roughness risk' },
    expectedDefects: ['surface_defect', 'mold_sticking'],
    affectedKPIs: ['ftq', 'scrap'],
  },
  {
    /** Nem Oranı — Excess moisture causes steam explosions in the press. */
    station: 'press',
    parameter: 'powder_moisture_pct',
    parameterLabel: { tr: 'Nem Oranı', en: 'Moisture' },
    consequence: { tr: 'Aşırı nem buhar patlaması ve çatlak riski yaratır', en: 'Excess moisture causes steam explosion and crack risk' },
    expectedDefects: ['crack_press', 'lamination'],
    affectedKPIs: ['ftq', 'scrap', 'oee'],
  },
  {
    /** Dolum Miktarı — Wrong fill amount causes weight and size deviation. */
    station: 'press',
    parameter: 'fill_amount_g',
    parameterLabel: { tr: 'Dolum Miktarı', en: 'Fill Amount' },
    consequence: { tr: 'Ağırlık ve boyut sapması, dengesiz karo', en: 'Weight and dimensional deviation, unbalanced tile' },
    expectedDefects: ['dimension_variance', 'density_variance'],
    affectedKPIs: ['ftq', 'scrap'],
  },
  {
    /** Kalıp Aşınması — Worn mold creates edge and dimensional defects. */
    station: 'press',
    parameter: 'mold_wear_pct',
    parameterLabel: { tr: 'Kalıp Aşınması', en: 'Mold Wear' },
    consequence: { tr: 'Aşınmış kalıp kenar ve boyut defektleri üretir', en: 'Worn mold produces edge and dimensional defects' },
    expectedDefects: ['edge_defect', 'dimension_variance'],
    affectedKPIs: ['ftq', 'scrap'],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. DRYER — 6 parameters
  // ═══════════════════════════════════════════════════════════════════════════

  {
    /** Giriş Sıcaklığı — Excess heat risks drying explosion and cracks. */
    station: 'dryer',
    parameter: 'inlet_temperature_c',
    parameterLabel: { tr: 'Giriş Sıcaklığı', en: 'Inlet Temp' },
    consequence: { tr: 'Aşırı ısı kurutma patlaması ve yüzey çatlağı riski', en: 'Excess heat risks drying explosion and surface cracks' },
    expectedDefects: ['explosion_dry', 'surface_crack_dry'],
    affectedKPIs: ['oee', 'ftq', 'scrap', 'energy'],
  },
  {
    /** Çıkış Sıcaklığı — Outlet temperature deviation causes uneven drying. */
    station: 'dryer',
    parameter: 'outlet_temperature_c',
    parameterLabel: { tr: 'Çıkış Sıcaklığı', en: 'Outlet Temp' },
    consequence: { tr: 'Dengesiz kurutma profili, iç gerilme oluşumu', en: 'Uneven drying profile, internal stress formation' },
    expectedDefects: ['warp_dry', 'surface_crack_dry'],
    affectedKPIs: ['ftq', 'scrap'],
  },
  {
    /** Bant Hızı — Belt speed deviation alters drying time. */
    station: 'dryer',
    parameter: 'belt_speed_m_min',
    parameterLabel: { tr: 'Bant Hızı', en: 'Belt Speed' },
    consequence: { tr: 'Kurutma süresi sapması, nem profili dengesiz', en: 'Drying time deviation, uneven moisture profile' },
    expectedDefects: ['warp_dry', 'surface_crack_dry'],
    affectedKPIs: ['oee', 'ftq', 'energy'],
  },
  {
    /** Kurutma Süresi — Too short or too long drying degrades tile quality. */
    station: 'dryer',
    parameter: 'drying_time_min',
    parameterLabel: { tr: 'Kurutma Süresi', en: 'Drying Time' },
    consequence: { tr: 'Yetersiz veya aşırı kurutma iç gerilme yaratır', en: 'Under or over-drying creates internal stress' },
    expectedDefects: ['warp_dry', 'explosion_dry'],
    affectedKPIs: ['ftq', 'scrap', 'energy'],
  },
  {
    /** Çıkış Nemi — High exit moisture impairs glaze adhesion. */
    station: 'dryer',
    parameter: 'exit_moisture_pct',
    parameterLabel: { tr: 'Çıkış Nemi', en: 'Exit Moisture' },
    consequence: { tr: 'Yüksek nem sır yapışmasını bozar', en: 'High moisture impairs glaze adhesion' },
    expectedDefects: ['pinhole_glaze', 'glaze_peel'],
    affectedKPIs: ['ftq', 'scrap'],
  },
  {
    /** Fan Frekansı — Low fan frequency causes uneven air circulation. */
    station: 'dryer',
    parameter: 'fan_frequency_hz',
    parameterLabel: { tr: 'Fan Frekansı', en: 'Fan Freq' },
    consequence: { tr: 'Yetersiz hava sirkülasyonu, dengesiz kurutma', en: 'Insufficient air circulation, uneven drying' },
    expectedDefects: ['warp_dry', 'moisture_variance'],
    affectedKPIs: ['ftq', 'scrap'],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. GLAZE — 7 parameters
  // ═══════════════════════════════════════════════════════════════════════════

  {
    /** Sır Yoğunluğu — Low density creates insufficient glaze coverage. */
    station: 'glaze',
    parameter: 'glaze_density_g_cm3',
    parameterLabel: { tr: 'Sır Yoğunluğu', en: 'Glaze Density' },
    consequence: { tr: 'Yetersiz sır katmanı, renk tutarsızlığı', en: 'Insufficient glaze layer, color inconsistency' },
    expectedDefects: ['color_tone_variance', 'pinhole_glaze'],
    affectedKPIs: ['ftq', 'scrap'],
  },
  {
    /** Viskozite — Out-of-range viscosity causes dripping or uneven coating. */
    station: 'glaze',
    parameter: 'glaze_viscosity_sec',
    parameterLabel: { tr: 'Viskozite', en: 'Viscosity' },
    consequence: { tr: 'Sır akışkanlığı bozulur — damlama veya düzensiz kaplama', en: 'Glaze fluidity disrupted — dripping or uneven coat' },
    expectedDefects: ['glaze_drip', 'glaze_thickness_variance'],
    affectedKPIs: ['ftq', 'scrap', 'oee'],
  },
  {
    /** Uygulama Ağırlığı — Thin or thick glaze layer causes defects. */
    station: 'glaze',
    parameter: 'application_weight_g_m2',
    parameterLabel: { tr: 'Uygulama Ağırlığı', en: 'App. Weight' },
    consequence: { tr: 'Sır kalınlık sapması — pinhole ve renk sapması riski', en: 'Glaze thickness deviation — pinhole and color risk' },
    expectedDefects: ['pinhole_glaze', 'color_tone_variance'],
    affectedKPIs: ['ftq', 'scrap'],
  },
  {
    /** Kabin Basıncı — Cabin pressure deviation disrupts spray pattern. */
    station: 'glaze',
    parameter: 'cabin_pressure_bar',
    parameterLabel: { tr: 'Kabin Basıncı', en: 'Cabin Pressure' },
    consequence: { tr: 'Sprey basıncı dengesizliği, düzensiz sır dağılımı', en: 'Spray pressure imbalance, uneven glaze distribution' },
    expectedDefects: ['glaze_thickness_variance', 'pinhole_glaze'],
    affectedKPIs: ['ftq', 'scrap'],
  },
  {
    /** Nozül Açısı — Extreme nozzle angle disrupts spray distribution. */
    station: 'glaze',
    parameter: 'nozzle_angle_deg',
    parameterLabel: { tr: 'Nozül Açısı', en: 'Nozzle Angle' },
    consequence: { tr: 'Sprey dağılımı bozulur, kenar birikimi oluşur', en: 'Spray distribution disrupted, edge buildup forms' },
    expectedDefects: ['edge_buildup', 'line_defect_glaze'],
    affectedKPIs: ['ftq', 'scrap'],
  },
  {
    /** Bant Hızı — Belt speed changes alter glaze application time. */
    station: 'glaze',
    parameter: 'belt_speed_m_min',
    parameterLabel: { tr: 'Bant Hızı', en: 'Belt Speed' },
    consequence: { tr: 'Uygulama süresi sapması, sır kalınlık dengesizliği', en: 'Application time deviation, glaze thickness imbalance' },
    expectedDefects: ['glaze_thickness_variance', 'color_tone_variance'],
    affectedKPIs: ['oee', 'ftq'],
  },
  {
    /** Sır Sıcaklığı — Temperature drift alters glaze viscosity behavior. */
    station: 'glaze',
    parameter: 'glaze_temperature_c',
    parameterLabel: { tr: 'Sır Sıcaklığı', en: 'Glaze Temp' },
    consequence: { tr: 'Sıcaklık viskoziteyi değiştirir, kaplama kalitesi düşer', en: 'Heat alters viscosity, coating quality drops' },
    expectedDefects: ['glaze_drip', 'color_tone_variance'],
    affectedKPIs: ['ftq'],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. DIGITAL PRINTER — 7 parameters
  // ═══════════════════════════════════════════════════════════════════════════

  {
    /** Kafa Sıcaklığı — Head temperature deviation causes ink issues. */
    station: 'printer',
    parameter: 'head_temperature_c',
    parameterLabel: { tr: 'Kafa Sıcaklığı', en: 'Head Temp' },
    consequence: { tr: 'Mürekkep buharlaşması, nozül tıkanması', en: 'Ink evaporation, nozzle clogging' },
    expectedDefects: ['line_defect_print', 'white_spot'],
    affectedKPIs: ['ftq', 'scrap'],
  },
  {
    /** Mürekkep Viskozite — Ink viscosity drift causes uneven spray. */
    station: 'printer',
    parameter: 'ink_viscosity_mpa_s',
    parameterLabel: { tr: 'Mürekkep Viskozite', en: 'Ink Viscosity' },
    consequence: { tr: 'Mürekkep spreyi dengesiz, beyaz noktalar oluşur', en: 'Ink spray uneven, white spots form' },
    expectedDefects: ['white_spot', 'line_defect_print'],
    affectedKPIs: ['ftq', 'scrap'],
  },
  {
    /** Damla Boyutu — Drop size deviation affects print resolution. */
    station: 'printer',
    parameter: 'drop_size_pl',
    parameterLabel: { tr: 'Damla Boyutu', en: 'Drop Size' },
    consequence: { tr: 'Baskı çözünürlük kaybı, renk doygunluk sapması', en: 'Print resolution loss, color saturation deviation' },
    expectedDefects: ['blur', 'saturation_variance'],
    affectedKPIs: ['ftq'],
  },
  {
    /** Çözünürlük — Resolution deviation causes blurry or banded prints. */
    station: 'printer',
    parameter: 'resolution_dpi',
    parameterLabel: { tr: 'Çözünürlük', en: 'Resolution' },
    consequence: { tr: 'Düşük çözünürlük bulanık desen ve bant etkisi oluşturur', en: 'Low resolution creates blurry patterns and banding' },
    expectedDefects: ['blur', 'banding'],
    affectedKPIs: ['ftq'],
  },
  {
    /** Bant Hızı — Belt speed mismatch causes print stretching. */
    station: 'printer',
    parameter: 'belt_speed_m_min',
    parameterLabel: { tr: 'Bant Hızı', en: 'Belt Speed' },
    consequence: { tr: 'Baskı gerilmesi veya sıkışması, desen bozulması', en: 'Print stretching or compression, pattern distortion' },
    expectedDefects: ['pattern_distortion', 'dimension_variance'],
    affectedKPIs: ['oee', 'ftq'],
  },
  {
    /** Kafa Boşluğu — Wide head gap reduces print sharpness. */
    station: 'printer',
    parameter: 'head_gap_mm',
    parameterLabel: { tr: 'Kafa Boşluğu', en: 'Head Gap' },
    consequence: { tr: 'Geniş boşluk baskı netliğini düşürür', en: 'Wide gap reduces print sharpness' },
    expectedDefects: ['blur', 'saturation_variance'],
    affectedKPIs: ['ftq'],
  },
  {
    /** Aktif Nozül — Low active nozzle count creates print line defects. */
    station: 'printer',
    parameter: 'active_nozzle_pct',
    parameterLabel: { tr: 'Aktif Nozül', en: 'Active Nozzles' },
    consequence: { tr: 'Baskı çizgileri ve beyaz noktalar oluşur', en: 'Print lines and white spots appear' },
    expectedDefects: ['line_defect_print', 'white_spot'],
    affectedKPIs: ['ftq', 'scrap'],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. KILN — 7 parameters
  // ═══════════════════════════════════════════════════════════════════════════

  {
    /** Maks Sıcaklık — Over/under-firing causes thermal stress or weakness. */
    station: 'kiln',
    parameter: 'max_temperature_c',
    parameterLabel: { tr: 'Maks Sıcaklık', en: 'Max Temp' },
    consequence: { tr: 'Sıcaklık sapması termal stres çatlakları veya yetersiz pişirme', en: 'Temperature deviation causes thermal stress cracks or under-firing' },
    expectedDefects: ['crack_kiln', 'color_fade', 'warp_kiln'],
    affectedKPIs: ['oee', 'ftq', 'scrap'],
  },
  {
    /** Pişirme Süresi — Short/long firing creates dimensional variance. */
    station: 'kiln',
    parameter: 'firing_time_min',
    parameterLabel: { tr: 'Pişirme Süresi', en: 'Firing Time' },
    consequence: { tr: 'Pişirme süresi sapması boyut ve mukavemet sapması yaratır', en: 'Firing time deviation creates dimensional and strength variance' },
    expectedDefects: ['size_variance_kiln', 'warp_kiln'],
    affectedKPIs: ['ftq', 'scrap'],
  },
  {
    /** Ön Isıtma Hızı — Rapid preheat causes thermal shock. */
    station: 'kiln',
    parameter: 'preheat_gradient_c_min',
    parameterLabel: { tr: 'Ön Isıtma Hızı', en: 'Preheat Rate' },
    consequence: { tr: 'Hızlı ön ısıtma termal şok ve çatlak riski yaratır', en: 'Rapid preheat creates thermal shock and crack risk' },
    expectedDefects: ['thermal_shock_crack', 'crack_kiln'],
    affectedKPIs: ['ftq', 'scrap'],
  },
  {
    /** Soğutma Hızı — Rapid cooling causes thermal shock cracks and warping. */
    station: 'kiln',
    parameter: 'cooling_gradient_c_min',
    parameterLabel: { tr: 'Soğutma Hızı', en: 'Cooling Rate' },
    consequence: { tr: 'Termal şok çatlakları ve çarpılma riski', en: 'Thermal shock cracks and warping risk' },
    expectedDefects: ['thermal_shock_crack', 'warp_kiln'],
    affectedKPIs: ['oee', 'ftq', 'scrap'],
  },
  {
    /** Bant Hızı — Belt speed in kiln alters heat exposure time. */
    station: 'kiln',
    parameter: 'belt_speed_m_min',
    parameterLabel: { tr: 'Bant Hızı', en: 'Belt Speed' },
    consequence: { tr: 'Uzun/kısa süreli ısıya maruz kalma, boyut sapması', en: 'Prolonged/short heat exposure, dimensional variance' },
    expectedDefects: ['size_variance_kiln', 'warp_kiln'],
    affectedKPIs: ['oee', 'energy'],
  },
  {
    /** Atmosfer Basıncı — Pressure deviation blocks gas escape, creates pinholes. */
    station: 'kiln',
    parameter: 'atmosphere_pressure_mbar',
    parameterLabel: { tr: 'Atmosfer Basıncı', en: 'Atm. Pressure' },
    consequence: { tr: 'Gaz çıkışı engellenir, pinhole oluşumu', en: 'Gas escape blocked, pinhole formation' },
    expectedDefects: ['pinhole_kiln'],
    affectedKPIs: ['ftq', 'scrap'],
  },
  {
    /** O₂ Seviyesi — Low O2 causes insufficient oxidation, color issues. */
    station: 'kiln',
    parameter: 'o2_level_pct',
    parameterLabel: { tr: 'O₂ Seviyesi', en: 'O₂ Level' },
    consequence: { tr: 'Yetersiz oksidasyon, renk bozulması', en: 'Insufficient oxidation, color degradation' },
    expectedDefects: ['color_fade', 'pinhole_kiln'],
    affectedKPIs: ['ftq', 'scrap'],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 6. SORTING — 6 parameters
  // ═══════════════════════════════════════════════════════════════════════════

  {
    /** Kamera Çözünürlük — Low camera resolution causes missed defects. */
    station: 'sorting',
    parameter: 'camera_resolution_mp',
    parameterLabel: { tr: 'Kamera Çözünürlük', en: 'Camera Res.' },
    consequence: { tr: 'Düşük çözünürlük defektlerin kaçırılmasına neden olur', en: 'Low resolution causes missed defects' },
    expectedDefects: ['missed_defect', 'false_pass'],
    affectedKPIs: ['ftq'],
  },
  {
    /** Tarama Hızı — Scan rate deviation alters inspection accuracy. */
    station: 'sorting',
    parameter: 'scan_rate_tiles_min',
    parameterLabel: { tr: 'Tarama Hızı', en: 'Scan Rate' },
    consequence: { tr: 'Tarama hızı sapması muayene doğruluğunu düşürür', en: 'Scan rate deviation reduces inspection accuracy' },
    expectedDefects: ['missed_defect', 'false_pass'],
    affectedKPIs: ['oee', 'ftq'],
  },
  {
    /** Boyut Toleransı — Loose size tolerance passes oversized tiles. */
    station: 'sorting',
    parameter: 'size_tolerance_mm',
    parameterLabel: { tr: 'Boyut Toleransı', en: 'Size Tolerance' },
    consequence: { tr: 'Gevşek tolerans boyut sapmalı karoların geçmesine izin verir', en: 'Loose tolerance allows dimensionally deviant tiles to pass' },
    expectedDefects: ['dimension_variance', 'false_pass'],
    affectedKPIs: ['ftq'],
  },
  {
    /** Renk Toleransı — Loose color tolerance passes discolored tiles. */
    station: 'sorting',
    parameter: 'color_tolerance_de',
    parameterLabel: { tr: 'Renk Toleransı', en: 'Color ΔE' },
    consequence: { tr: 'Gevşek tolerans renk sapmalı karoların geçmesine izin verir', en: 'Loose tolerance allows discolored tiles to pass' },
    expectedDefects: ['color_tone_variance', 'false_pass'],
    affectedKPIs: ['ftq'],
  },
  {
    /** Düzlük Toleransı — Loose flatness tolerance passes warped tiles. */
    station: 'sorting',
    parameter: 'flatness_tolerance_mm',
    parameterLabel: { tr: 'Düzlük Toleransı', en: 'Flatness Tol.' },
    consequence: { tr: 'Gevşek tolerans eğilmiş karoların geçmesine izin verir', en: 'Loose tolerance allows warped tiles to pass' },
    expectedDefects: ['warp_pass', 'false_pass'],
    affectedKPIs: ['ftq'],
  },
  {
    /** Hata Eşiği — High threshold allows small defects to pass. */
    station: 'sorting',
    parameter: 'defect_threshold_mm2',
    parameterLabel: { tr: 'Hata Eşiği', en: 'Defect Threshold' },
    consequence: { tr: 'Yüksek eşik küçük defektlerin geçmesine izin verir', en: 'High threshold allows small defects to pass' },
    expectedDefects: ['missed_defect', 'false_pass'],
    affectedKPIs: ['ftq'],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 7. PACKAGING — 6 parameters
  // ═══════════════════════════════════════════════════════════════════════════

  {
    /** Karo / Kutu — Wrong stack count causes packaging instability. */
    station: 'packaging',
    parameter: 'stack_count',
    parameterLabel: { tr: 'Karo / Kutu', en: 'Tiles/Box' },
    consequence: { tr: 'Yanlış istifleme paket kararsızlığı ve hasar riski', en: 'Wrong stacking causes package instability and damage risk' },
    expectedDefects: ['chip', 'crush_damage'],
    affectedKPIs: ['scrap', 'oee'],
  },
  {
    /** Mühürleme Basıncı — Low seal pressure risks transport damage. */
    station: 'packaging',
    parameter: 'box_sealing_pressure_bar',
    parameterLabel: { tr: 'Mühürleme Basıncı', en: 'Seal Pressure' },
    consequence: { tr: 'Zayıf mühürleme taşıma sırasında hasara neden olur', en: 'Weak seal causes transport damage' },
    expectedDefects: ['chip', 'edge_crack_pack'],
    affectedKPIs: ['scrap'],
  },
  {
    /** Palet Kapasitesi — Overloading pallets causes crushing damage. */
    station: 'packaging',
    parameter: 'pallet_capacity_m2',
    parameterLabel: { tr: 'Palet Kapasitesi', en: 'Pallet Cap.' },
    consequence: { tr: 'Aşırı yükleme palet ezilmesi ve karo hasarı riski', en: 'Overloading risks pallet crushing and tile damage' },
    expectedDefects: ['crush_damage', 'chip'],
    affectedKPIs: ['scrap'],
  },
  {
    /** Streç Gerginliği — Loose wrap reduces pallet stability. */
    station: 'packaging',
    parameter: 'stretch_tension_pct',
    parameterLabel: { tr: 'Streç Gerginliği', en: 'Wrap Tension' },
    consequence: { tr: 'Gevşek sarma palet stabilitesini düşürür', en: 'Loose wrap reduces pallet stability' },
    expectedDefects: ['crush_damage', 'chip'],
    affectedKPIs: ['scrap'],
  },
  {
    /** Robot Hızı — Off-speed robot causes placement errors. */
    station: 'packaging',
    parameter: 'robot_speed_cycles_min',
    parameterLabel: { tr: 'Robot Hızı', en: 'Robot Speed' },
    consequence: { tr: 'Hız sapması yerleştirme hataları ve karo çarpması riski', en: 'Speed deviation causes placement errors and tile collision risk' },
    expectedDefects: ['chip', 'edge_crack_pack'],
    affectedKPIs: ['oee', 'scrap'],
  },
  {
    /** Etiket Doğruluğu — Label inaccuracy causes traceability issues. */
    station: 'packaging',
    parameter: 'label_accuracy_pct',
    parameterLabel: { tr: 'Etiket Doğruluğu', en: 'Label Accuracy' },
    consequence: { tr: 'Etiket hatası izlenebilirlik kaybı ve müşteri şikayeti', en: 'Label error causes traceability loss and customer complaints' },
    expectedDefects: ['mislabel', 'customer_complaint'],
    affectedKPIs: ['ftq'],
  },
];

// =============================================================================
// LOOKUP HELPER
// =============================================================================

/**
 * Get all cause-effect entries for a specific station.
 *
 * @param station - Station identifier (e.g., 'press', 'kiln').
 * @returns Array of cause-effect entries for that station.
 */
export function getCauseEffectsForStation(station: string): CauseEffectEntry[] {
  return CAUSE_EFFECT_MAP.filter((entry) => entry.station === station);
}
