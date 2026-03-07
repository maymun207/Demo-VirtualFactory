/**
 * scenarios.ts — Defect Scenario Definitions & Types
 *
 * Defines 4 predefined defect scenarios for the Virtual Factory simulation.
 * Each scenario specifies parameter overrides, expected defects, and cause-effect
 * explanations that can be loaded via the Demo Settings Panel.
 *
 * Scenarios:
 *   SCN-001 — Optimal Production (baseline, all parameters in range)
 *   SCN-002 — Kiln Temperature Crisis (critical kiln overheating)
 *   SCN-003 — Glaze Viscosity Drift (glaze + printer cascade)
 *   SCN-004 — Multi-Station Cascade Failure (all 7 stations degraded)
 *
 * Architecture:
 *   - Types are imported from `../store/types` (StationName, DefectType)
 *   - Parameter keys match `machineTooltipConfig.ts` definitions exactly
 *   - Normal ranges match `machineTooltipConfig.ts` range values exactly
 *   - All constants follow the project rule: nothing hardcoded elsewhere
 *
 * Used by: DemoSettingsPanel.tsx, simulationDataStore.ts (future)
 */

import type { StationName, DefectType } from '../store/types';

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

/**
 * A single parameter override within a scenario.
 * Specifies the exact value and drift allowance for one parameter at one station.
 */
export interface ScenarioParameterOverride {
  /** Which station this override applies to (e.g., 'press', 'kiln'). */
  station: StationName;
  /** Parameter key matching machineTooltipConfig (e.g., 'pressure_bar'). */
  parameter: string;
  /** The scenario override value for this parameter. */
  value: number;
  /** Drift percentage limit for this parameter under this scenario. */
  driftLimit: number;
  /** True if the value falls outside the normal min–max operating range. */
  isOutOfRange: boolean;
  /** Reference to the normal operating range from machineTooltipConfig. */
  normalRange: { min: number; max: number };
}

/**
 * Expected defect outcome from a scenario.
 * Describes which defect type is likely, at what probability, and at which station.
 */
export interface ScenarioDefectExpectation {
  /** The type of defect expected (must match DefectType union in types.ts). */
  defectType: DefectType;
  /** Probability of this defect occurring (0–100%). */
  probability_pct: number;
  /** Which station primarily triggers this defect. */
  primaryStation: StationName;
  /** Bilingual description of why this defect occurs. */
  description: { tr: string; en: string };
}

/**
 * A single row in the cause-effect reference table.
 * Explains WHY a parameter deviation causes specific defects.
 */
export interface CauseEffectRow {
  /** Which station the deviating parameter belongs to. */
  station: StationName;
  /** Parameter key that is deviating. */
  parameter: string;
  /** Bilingual parameter display label. */
  parameterLabel: { tr: string; en: string };
  /** Bilingual description of the deviation magnitude. */
  deviation: { tr: string; en: string };
  /** Bilingual explanation of the consequence. */
  consequence: { tr: string; en: string };
  /** Which defect types this deviation causes. */
  expectedDefects: DefectType[];
  /** Which KPIs are impacted (e.g., ['oee', 'ftq', 'scrap', 'energy']). */
  affectedKPIs: string[];
  /** UI color coding based on severity: red=critical, orange=warning, green=ok. */
  severityColor: 'red' | 'orange' | 'green';
}

/**
 * Conveyor belt settings for a specific scenario.
 *
 * Each field represents one row in the "Conveyor Settings" table:
 *   - speedChange    — whether conveyor speed changes occur in this scenario
 *   - jammedEvents   — whether jam events occur in this scenario
 *   - jammedTime     — expected jam duration in Cycle Time units
 *   - impactedTiles  — number of scrap tiles produced by jam events
 *
 * Every numeric/boolean field has a corresponding drift percentage (XxxDrift)
 * matching the "Drift" column in the spreadsheet spec.
 *
 * These values are display-only in the Conveyor tab — they describe
 * the scenario's conveyor behaviour. They do NOT directly control
 * `conveyorStatus` or `conveyorSpeed`; those are managed by `simulationStore`.
 */
export interface ConveyorSettingsEntry {
  /** Whether speed changes occur during this scenario (Yes/No toggle). */
  speedChange: boolean;
  /** Drift % tolerance for the SpeedChange field. */
  speedChangeDrift: number;
  /** Whether jam events occur during this scenario (Yes/No toggle). */
  jammedEvents: boolean;
  /** Drift % tolerance for the JammedEvents field. */
  jammedEventsDrift: number;
  /** Expected jam duration in Cycle Time units. */
  jammedTime: number;
  /** Drift % tolerance for the JammedTime field. */
  jammedTimeDrift: number;
  /** Number of scrap tiles impacted by jam events. */
  impactedTiles: number;
  /** Drift % tolerance for the ImpactedTiles field. */
  impactedTilesDrift: number;
  /**
   * Global probability (0–1) that a scrap-classified tile is physically
   * discarded to the recycle bin at the station where the defect was detected.
   * Controllable from the Conveyor Settings tab in Demo Settings.
   */
  scrapProbability: number;
  /** Drift % tolerance for the ScrapProbability field. */
  scrapProbabilityDrift: number;
}

/**
 * Complete scenario definition with all parameters, expected outcomes, and explanations.
 * This is the master type for scenario objects used throughout the application.
 */
export interface ScenarioDefinition {
  /** Unique identifier (UUID-style string). */
  id: string;
  /** Short code for display (e.g., 'SCN-001'). */
  code: string;
  /** Bilingual scenario name. */
  name: { tr: string; en: string };
  /** Bilingual scenario description. */
  description: { tr: string; en: string };
  /** Overall severity level of the scenario. */
  severity: 'low' | 'medium' | 'high' | 'critical';

  /** Array of parameter overrides — which parameters change and to what values. */
  parameterOverrides: ScenarioParameterOverride[];
  /** Array of expected defect outcomes with probabilities. */
  expectedDefects: ScenarioDefectExpectation[];
  /** Cause-effect reference table explaining parameter→defect→KPI relationships. */
  causeEffectTable: CauseEffectRow[];

  /** Expected scrap rate range as a percentage (min–max). */
  expectedScrapRange: { min: number; max: number };
  /** Expected OEE range as a percentage (min–max). */
  expectedOEERange: { min: number; max: number };
  /** Expected energy impact as percentage increase from baseline (min–max). */
  expectedEnergyImpact: { min: number; max: number };

  /** Per-scenario conveyor belt settings for the Conveyor Settings tab. */
  conveyorSettings: ConveyorSettingsEntry;
}

// =============================================================================
// REFERENCE SCENARIO: SCN-000 — REFERENCE PRODUCTION
// =============================================================================

/**
 * SCN-000 — Reference Production: Factory defaults, all parameters at baseline.
 * Selecting this card resets the simulation to factory-default values and
 * clears any active scenario. Severity is "low" because no deviations exist.
 * 
 * NOTE: This scenario has an empty parameterOverrides array because it
 * represents the "clean" factory state — no overrides are applied. The
 * DemoSettingsPanel handles this scenario specially by calling
 * handleLoadReference() instead of the normal loadScenario() path.
 */
export const REFERENCE_SCENARIO: ScenarioDefinition = {
  /** Unique ID used for active-scenario comparison */
  id: 'scn-000-reference-production',
  /** Display code shown on the card's top-left label */
  code: 'SCN-000',
  /** Bilingual scenario name */
  name: {
    tr: 'Referans Üretim',
    en: 'Reference Production',
  },
  /** Bilingual description shown below the name on the card */
  description: {
    tr: 'Tüm parametreler referans değerleri alınarak konmuştur.',
    en: 'All parameters set using reference values.',
  },
  /** Severity level displayed as a badge on the card */
  severity: 'low',

  /** No overrides — factory defaults are used */
  parameterOverrides: [],
  /** No defects expected under reference conditions */
  expectedDefects: [],
  /** No cause-effect rows — nothing is deviating */
  causeEffectTable: [],

  /**
   * Expected KPI ranges under reference (factory-default) conditions.
   * These values are shown in the "Senaryo Etkisi" bar when SCN-000 is selected.
   * OEE: 85–95%, Scrap: 0% (zero defects in reference production),
   * Energy: 0% (no additional energy impact at baseline).
   */
  expectedScrapRange: { min: 0, max: 0 },
  expectedOEERange: { min: 85, max: 95 },
  expectedEnergyImpact: { min: 0, max: 0 },

  /**
   * SCN-000 conveyor settings: no speed changes, no jams, ZERO drift, ZERO scrap.
   * Represents a perfectly stable baseline — no parameters deviate, no scrap at all.
   */
  conveyorSettings: {
    /** No speed changes in reference production */
    speedChange: false,
    /** 0% drift — no speed fluctuation whatsoever */
    speedChangeDrift: 0,
    /** No jam events in reference production */
    jammedEvents: false,
    /** 0% drift — no jam probability variation */
    jammedEventsDrift: 0,
    /** Baseline jam time: 7 cycle times (within 6–10 normal range) */
    jammedTime: 7,
    /** 0% drift — jam duration is perfectly stable */
    jammedTimeDrift: 0,
    /** 0 scrap tiles impacted — no conveyor damage in reference production */
    impactedTiles: 0,
    /** 0% drift — impacted tile count is perfectly stable */
    impactedTilesDrift: 0,
    /** 0% scrap probability — zero conveyor scrap in reference production */
    scrapProbability: 0,
    /** 0% drift — scrap probability is perfectly stable */
    scrapProbabilityDrift: 0,
  },
};

// =============================================================================
// SCENARIO 1: OPTIMAL PRODUCTION (SCN-001)
// =============================================================================

/** SCN-001 — Optimal Production: All parameters within optimal ranges. */
const SCN_001_OPTIMAL: ScenarioDefinition = {
  id: 'scn-001-optimal-production',
  code: 'SCN-001',
  name: { tr: 'Optimal Üretim', en: 'Optimal Production' },
  description: {
    tr: 'Tüm parametreler optimal aralıklarda. İdeal üretim koşullarını temsil eder.',
    en: 'All parameters within optimal ranges. Represents ideal production conditions.',
  },
  severity: 'low',

  parameterOverrides: [
    // ── Press (midpoint values) ──
    { station: 'press', parameter: 'pressure_bar', value: 365, driftLimit: 3, isOutOfRange: false, normalRange: { min: 280, max: 450 } },
    { station: 'press', parameter: 'cycle_time_sec', value: 6, driftLimit: 2, isOutOfRange: false, normalRange: { min: 4, max: 8 } },
    { station: 'press', parameter: 'mold_temperature_c', value: 50, driftLimit: 3, isOutOfRange: false, normalRange: { min: 40, max: 60 } },
    { station: 'press', parameter: 'powder_moisture_pct', value: 6, driftLimit: 2, isOutOfRange: false, normalRange: { min: 5, max: 7 } },
    { station: 'press', parameter: 'fill_amount_g', value: 1650, driftLimit: 3, isOutOfRange: false, normalRange: { min: 800, max: 2500 } },
    { station: 'press', parameter: 'mold_wear_pct', value: 10, driftLimit: 2, isOutOfRange: false, normalRange: { min: 0, max: 30 } },
    // ── Dryer (midpoint values) ──
    { station: 'dryer', parameter: 'inlet_temperature_c', value: 200, driftLimit: 3, isOutOfRange: false, normalRange: { min: 150, max: 250 } },
    { station: 'dryer', parameter: 'outlet_temperature_c', value: 100, driftLimit: 3, isOutOfRange: false, normalRange: { min: 80, max: 120 } },
    { station: 'dryer', parameter: 'belt_speed_m_min', value: 3, driftLimit: 2, isOutOfRange: false, normalRange: { min: 1, max: 5 } },
    { station: 'dryer', parameter: 'drying_time_min', value: 45, driftLimit: 2, isOutOfRange: false, normalRange: { min: 30, max: 60 } },
    { station: 'dryer', parameter: 'exit_moisture_pct', value: 1.0, driftLimit: 2, isOutOfRange: false, normalRange: { min: 0.5, max: 1.5 } },
    { station: 'dryer', parameter: 'fan_frequency_hz', value: 40, driftLimit: 2, isOutOfRange: false, normalRange: { min: 30, max: 50 } },
    // ── Glaze (midpoint values) ──
    { station: 'glaze', parameter: 'glaze_density_g_cm3', value: 1.45, driftLimit: 2, isOutOfRange: false, normalRange: { min: 1.35, max: 1.55 } },
    { station: 'glaze', parameter: 'glaze_viscosity_sec', value: 26, driftLimit: 3, isOutOfRange: false, normalRange: { min: 18, max: 35 } },
    { station: 'glaze', parameter: 'application_weight_g_m2', value: 450, driftLimit: 3, isOutOfRange: false, normalRange: { min: 300, max: 600 } },
    { station: 'glaze', parameter: 'cabin_pressure_bar', value: 0.75, driftLimit: 2, isOutOfRange: false, normalRange: { min: 0.3, max: 1.2 } },
    { station: 'glaze', parameter: 'nozzle_angle_deg', value: 30, driftLimit: 2, isOutOfRange: false, normalRange: { min: 15, max: 45 } },
    { station: 'glaze', parameter: 'belt_speed_m_min', value: 25, driftLimit: 2, isOutOfRange: false, normalRange: { min: 15, max: 35 } },
    { station: 'glaze', parameter: 'glaze_temperature_c', value: 25, driftLimit: 2, isOutOfRange: false, normalRange: { min: 20, max: 30 } },
    // ── Printer (midpoint values) ──
    { station: 'printer', parameter: 'head_temperature_c', value: 40, driftLimit: 2, isOutOfRange: false, normalRange: { min: 35, max: 45 } },
    { station: 'printer', parameter: 'ink_viscosity_mpa_s', value: 11.5, driftLimit: 3, isOutOfRange: false, normalRange: { min: 8, max: 15 } },
    { station: 'printer', parameter: 'drop_size_pl', value: 43, driftLimit: 3, isOutOfRange: false, normalRange: { min: 6, max: 80 } },
    { station: 'printer', parameter: 'resolution_dpi', value: 540, driftLimit: 2, isOutOfRange: false, normalRange: { min: 360, max: 720 } },
    { station: 'printer', parameter: 'belt_speed_m_min', value: 32, driftLimit: 2, isOutOfRange: false, normalRange: { min: 20, max: 45 } },
    { station: 'printer', parameter: 'head_gap_mm', value: 2.75, driftLimit: 2, isOutOfRange: false, normalRange: { min: 1.5, max: 4 } },
    { station: 'printer', parameter: 'active_nozzle_pct', value: 98, driftLimit: 2, isOutOfRange: false, normalRange: { min: 95, max: 100 } },
    // ── Kiln (midpoint values) ──
    { station: 'kiln', parameter: 'max_temperature_c', value: 1160, driftLimit: 2, isOutOfRange: false, normalRange: { min: 1100, max: 1220 } },
    { station: 'kiln', parameter: 'firing_time_min', value: 47, driftLimit: 2, isOutOfRange: false, normalRange: { min: 35, max: 60 } },
    { station: 'kiln', parameter: 'preheat_gradient_c_min', value: 27, driftLimit: 3, isOutOfRange: false, normalRange: { min: 15, max: 40 } },
    { station: 'kiln', parameter: 'cooling_gradient_c_min', value: 35, driftLimit: 3, isOutOfRange: false, normalRange: { min: 20, max: 50 } },
    { station: 'kiln', parameter: 'belt_speed_m_min', value: 2, driftLimit: 2, isOutOfRange: false, normalRange: { min: 1, max: 3 } },
    { station: 'kiln', parameter: 'atmosphere_pressure_mbar', value: 0, driftLimit: 2, isOutOfRange: false, normalRange: { min: -0.5, max: 0.5 } },
    { station: 'kiln', parameter: 'o2_level_pct', value: 5, driftLimit: 2, isOutOfRange: false, normalRange: { min: 2, max: 8 } },
    // ── Sorting (midpoint values) ──
    { station: 'sorting', parameter: 'camera_resolution_mp', value: 12, driftLimit: 2, isOutOfRange: false, normalRange: { min: 5, max: 20 } },
    { station: 'sorting', parameter: 'scan_rate_tiles_min', value: 40, driftLimit: 2, isOutOfRange: false, normalRange: { min: 20, max: 60 } },
    { station: 'sorting', parameter: 'size_tolerance_mm', value: 0.65, driftLimit: 2, isOutOfRange: false, normalRange: { min: 0.3, max: 1.0 } },
    { station: 'sorting', parameter: 'color_tolerance_de', value: 1.25, driftLimit: 2, isOutOfRange: false, normalRange: { min: 0.5, max: 2.0 } },
    { station: 'sorting', parameter: 'flatness_tolerance_mm', value: 0.3, driftLimit: 2, isOutOfRange: false, normalRange: { min: 0.1, max: 0.5 } },
    { station: 'sorting', parameter: 'defect_threshold_mm2', value: 1.75, driftLimit: 2, isOutOfRange: false, normalRange: { min: 0.5, max: 3.0 } },
    // ── Packaging (midpoint values) ──
    { station: 'packaging', parameter: 'stack_count', value: 8, driftLimit: 2, isOutOfRange: false, normalRange: { min: 4, max: 12 } },
    { station: 'packaging', parameter: 'box_sealing_pressure_bar', value: 3.5, driftLimit: 2, isOutOfRange: false, normalRange: { min: 2, max: 5 } },
    { station: 'packaging', parameter: 'pallet_capacity_m2', value: 60, driftLimit: 2, isOutOfRange: false, normalRange: { min: 40, max: 80 } },
    { station: 'packaging', parameter: 'stretch_tension_pct', value: 225, driftLimit: 2, isOutOfRange: false, normalRange: { min: 150, max: 300 } },
    { station: 'packaging', parameter: 'robot_speed_cycles_min', value: 10, driftLimit: 2, isOutOfRange: false, normalRange: { min: 6, max: 15 } },
    { station: 'packaging', parameter: 'label_accuracy_pct', value: 99.5, driftLimit: 2, isOutOfRange: false, normalRange: { min: 99, max: 100 } },
  ],

  expectedDefects: [],           // No significant defects under optimal conditions
  causeEffectTable: [],          // No deviations to explain

  expectedScrapRange: { min: 3, max: 5 },
  expectedOEERange: { min: 85, max: 92 },
  expectedEnergyImpact: { min: 0, max: 0 },

  /**
   * SCN-001 conveyor settings: speed changes and jam events active,
   * moderate jam time (20 cycles), 10 impacted tiles, 5% drift on all fields.
   */
  conveyorSettings: {
    /** Speed changes start appearing in SCN-001 */
    speedChange: true,
    /** 5% drift on speed variation */
    speedChangeDrift: 5,
    /** No jam events yet in SCN-001 (only speed fluctuation) */
    jammedEvents: false,
    /** 1% drift — jam events inactive */
    jammedEventsDrift: 1,
    /** Jam time matches reference baseline: 7 cycle times */
    jammedTime: 7,
    /** 1% drift on jam duration */
    jammedTimeDrift: 1,
    /** Impacted tiles same as reference: 4 */
    impactedTiles: 4,
    /** 1% drift on impacted tile count */
    impactedTilesDrift: 1,
    /** 2% scrap probability at baseline */
    scrapProbability: 2,
    /** 1% drift */
    scrapProbabilityDrift: 1,
  },
};

// =============================================================================
// SCENARIO 2: KILN TEMPERATURE CRISIS (SCN-002)
// =============================================================================

/** SCN-002 — Kiln Temperature Crisis: Critical kiln overheating with aggressive cooling. */
const SCN_002_KILN_CRISIS: ScenarioDefinition = {
  id: 'scn-002-kiln-temperature-crisis',
  code: 'SCN-002',
  name: { tr: 'Fırın Sıcaklık Krizi', en: 'Kiln Temperature Crisis' },
  description: {
    tr: 'Fırın Zon-5 sıcaklığı ayar noktasının +18–25°C üzerine çıkıyor. Soğutma gradyanı çok agresif. Siyah çekirdek, termal şok çatlakları ve çarpılma defektleri üretir.',
    en: 'Kiln Zone-5 temperature deviates +18–25°C above setpoint. Cooling gradient too aggressive. Produces black core, thermal shock cracks, and warping defects.',
  },
  severity: 'critical',

  parameterOverrides: [
    // ── Kiln (all out of range — critical deviations) ──
    { station: 'kiln', parameter: 'max_temperature_c', value: 1238, driftLimit: 10, isOutOfRange: true, normalRange: { min: 1100, max: 1220 } },
    { station: 'kiln', parameter: 'cooling_gradient_c_min', value: 55, driftLimit: 12, isOutOfRange: true, normalRange: { min: 20, max: 50 } },
    { station: 'kiln', parameter: 'o2_level_pct', value: 1.5, driftLimit: 8, isOutOfRange: true, normalRange: { min: 2, max: 8 } },
    { station: 'kiln', parameter: 'atmosphere_pressure_mbar', value: 0.8, driftLimit: 10, isOutOfRange: true, normalRange: { min: -0.5, max: 0.5 } },
    { station: 'kiln', parameter: 'firing_time_min', value: 62, driftLimit: 8, isOutOfRange: true, normalRange: { min: 35, max: 60 } },
    { station: 'kiln', parameter: 'preheat_gradient_c_min', value: 45, driftLimit: 10, isOutOfRange: true, normalRange: { min: 15, max: 40 } },
    { station: 'kiln', parameter: 'belt_speed_m_min', value: 0.8, driftLimit: 8, isOutOfRange: true, normalRange: { min: 1, max: 3 } },
    // ── Sorting (within range but near extremes — secondary impact) ──
    { station: 'sorting', parameter: 'defect_threshold_mm2', value: 2.8, driftLimit: 5, isOutOfRange: false, normalRange: { min: 0.5, max: 3.0 } },
    { station: 'sorting', parameter: 'color_tolerance_de', value: 1.8, driftLimit: 5, isOutOfRange: false, normalRange: { min: 0.5, max: 2.0 } },
  ],

  expectedDefects: [
    { defectType: 'crack_kiln', probability_pct: 35, primaryStation: 'kiln', description: { tr: 'Aşırı sıcaklık stresi çatlak oluşturur', en: 'Excessive thermal stress causes cracking' } },
    { defectType: 'warp_kiln', probability_pct: 20, primaryStation: 'kiln', description: { tr: 'Dengesiz soğutma çarpılmaya neden olur', en: 'Uneven cooling causes warping' } },
    { defectType: 'color_fade', probability_pct: 15, primaryStation: 'kiln', description: { tr: 'Aşırı pişirme renk solmasına neden olur', en: 'Over-firing causes color fading' } },
    { defectType: 'thermal_shock_crack', probability_pct: 10, primaryStation: 'kiln', description: { tr: 'Hızlı soğutma termal şok çatlağı oluşturur', en: 'Rapid cooling creates thermal shock cracks' } },
    { defectType: 'size_variance_kiln', probability_pct: 10, primaryStation: 'kiln', description: { tr: 'Sıcaklık sapması boyut varyansı yaratır', en: 'Temperature deviation creates dimensional variance' } },
    { defectType: 'pinhole_kiln', probability_pct: 10, primaryStation: 'kiln', description: { tr: 'Atmosfer basıncı sapması pinhole oluşturur', en: 'Atmosphere pressure deviation creates pinholes' } },
  ],

  causeEffectTable: [
    {
      station: 'kiln', parameter: 'max_temperature_c',
      parameterLabel: { tr: 'Maks Sıcaklık', en: 'Max Temp' },
      deviation: { tr: 'Maksimumun 18°C üzerinde (1238°C)', en: '+18°C above max (1238°C)' },
      consequence: { tr: 'Siyah çekirdek oluşumu ve termal stres çatlakları', en: 'Black core formation and thermal stress cracks' },
      expectedDefects: ['crack_kiln', 'color_fade'],
      affectedKPIs: ['oee', 'ftq', 'scrap'],
      severityColor: 'red',
    },
    {
      station: 'kiln', parameter: 'cooling_gradient_c_min',
      parameterLabel: { tr: 'Soğutma Hızı', en: 'Cooling Rate' },
      deviation: { tr: 'Maksimumun 5°C/min üzerinde (55°C/min)', en: '+5°C/min above max (55°C/min)' },
      consequence: { tr: 'Termal şok çatlakları ve çarpılma riski', en: 'Thermal shock cracks and warping risk' },
      expectedDefects: ['thermal_shock_crack', 'warp_kiln'],
      affectedKPIs: ['oee', 'ftq', 'scrap'],
      severityColor: 'red',
    },
    {
      station: 'kiln', parameter: 'o2_level_pct',
      parameterLabel: { tr: 'O₂ Seviyesi', en: 'O₂ Level' },
      deviation: { tr: 'Minimumun 0.5% altında (1.5%)', en: '-0.5% below min (1.5%)' },
      consequence: { tr: 'Yetersiz oksidasyon, renk bozulması', en: 'Insufficient oxidation, color degradation' },
      expectedDefects: ['color_fade', 'pinhole_kiln'],
      affectedKPIs: ['ftq', 'scrap'],
      severityColor: 'orange',
    },
    {
      station: 'kiln', parameter: 'atmosphere_pressure_mbar',
      parameterLabel: { tr: 'Atmosfer Basıncı', en: 'Atm. Pressure' },
      deviation: { tr: 'Maksimumun 0.3 mbar üzerinde (0.8 mbar)', en: '+0.3 mbar above max (0.8 mbar)' },
      consequence: { tr: 'Gaz çıkışı engellenir, pinhole oluşumu', en: 'Gas escape blocked, pinhole formation' },
      expectedDefects: ['pinhole_kiln'],
      affectedKPIs: ['ftq', 'scrap'],
      severityColor: 'orange',
    },
    {
      station: 'kiln', parameter: 'belt_speed_m_min',
      parameterLabel: { tr: 'Bant Hızı', en: 'Belt Speed' },
      deviation: { tr: 'Minimumun 0.2 m/min altında (0.8 m/min)', en: '-0.2 m/min below min (0.8 m/min)' },
      consequence: { tr: 'Uzun süreli ısıya maruz kalma, boyut sapması', en: 'Prolonged heat exposure, dimensional variance' },
      expectedDefects: ['size_variance_kiln', 'warp_kiln'],
      affectedKPIs: ['oee', 'energy'],
      severityColor: 'orange',
    },
  ],

  expectedScrapRange: { min: 25, max: 35 },
  expectedOEERange: { min: 55, max: 65 },
  expectedEnergyImpact: { min: 15, max: 20 },

  /**
   * SCN-002 conveyor settings: kiln crisis causes extended jam times and high
   * scrap count — but speed changes and jam EVENT toggles are OFF per spec.
   * 14 cycle-time jams, 8 impacted tiles, 5% drift tolerance.
   */
  conveyorSettings: {
    /** No speed change toggle for SCN-002 — conveyor speed is stable */
    speedChange: false,
    /** 5% drift on speed variation */
    speedChangeDrift: 5,
    /** No jam event toggle for SCN-002 — but jam duration and count are elevated */
    jammedEvents: false,
    /** 5% drift on jam event frequency */
    jammedEventsDrift: 5,
    /** Jam time: 14 cycle times (above normal 6–10 range) */
    jammedTime: 14,
    /** 5% drift on jam duration */
    jammedTimeDrift: 5,
    /** 8 scrap tiles per event — above normal 1–5 range */
    impactedTiles: 8,
    /** 5% drift on impacted tile count */
    impactedTilesDrift: 5,
    /** 2.5% scrap probability — elevated during kiln crisis */
    scrapProbability: 2.5,
    /** 1% drift on scrap probability */
    scrapProbabilityDrift: 1,
  },
};

// =============================================================================
// SCENARIO 3: GLAZE VISCOSITY DRIFT (SCN-003)
// =============================================================================

/** SCN-003 — Glaze Viscosity Drift: Cascading glaze failure into printer. */
const SCN_003_GLAZE_DRIFT: ScenarioDefinition = {
  id: 'scn-003-glaze-viscosity-drift',
  code: 'SCN-003',
  name: { tr: 'Sır Viskozite Kayması', en: 'Glaze Viscosity Drift' },
  description: {
    tr: 'Sır bulamacı viskozitesi sıcaklık artışı ve yoğunluk değişimi nedeniyle spek altına düşer. Nozüller kısmen tıkanır. Sır akma defektleri, pinholes ve renk tutarsızlığı üretir. Baskı makinesini de etkiler.',
    en: 'Glaze slurry viscosity drops below spec due to temperature rise and density change. Nozzles partially clog. Produces glaze flow defects, pinholes, and color inconsistency. Cascades into printer issues.',
  },
  severity: 'high',

  parameterOverrides: [
    // ── Glaze (primary failure — all out of range) ──
    { station: 'glaze', parameter: 'glaze_viscosity_sec', value: 15, driftLimit: 12, isOutOfRange: true, normalRange: { min: 18, max: 35 } },
    { station: 'glaze', parameter: 'glaze_density_g_cm3', value: 1.30, driftLimit: 10, isOutOfRange: true, normalRange: { min: 1.35, max: 1.55 } },
    { station: 'glaze', parameter: 'application_weight_g_m2', value: 250, driftLimit: 15, isOutOfRange: true, normalRange: { min: 300, max: 600 } },
    { station: 'glaze', parameter: 'glaze_temperature_c', value: 34, driftLimit: 10, isOutOfRange: true, normalRange: { min: 20, max: 30 } },
    { station: 'glaze', parameter: 'nozzle_angle_deg', value: 50, driftLimit: 12, isOutOfRange: true, normalRange: { min: 15, max: 45 } },
    { station: 'glaze', parameter: 'cabin_pressure_bar', value: 0.2, driftLimit: 10, isOutOfRange: true, normalRange: { min: 0.3, max: 1.2 } },
    // ── Printer (cascade effect — out of range) ──
    { station: 'printer', parameter: 'head_temperature_c', value: 48, driftLimit: 8, isOutOfRange: true, normalRange: { min: 35, max: 45 } },
    { station: 'printer', parameter: 'ink_viscosity_mpa_s', value: 6, driftLimit: 8, isOutOfRange: true, normalRange: { min: 8, max: 15 } },
    { station: 'printer', parameter: 'active_nozzle_pct', value: 88, driftLimit: 8, isOutOfRange: true, normalRange: { min: 95, max: 100 } },
    // ── Dryer (minor cascade — out of range) ──
    { station: 'dryer', parameter: 'exit_moisture_pct', value: 2.0, driftLimit: 5, isOutOfRange: true, normalRange: { min: 0.5, max: 1.5 } },
  ],

  expectedDefects: [
    { defectType: 'glaze_drip', probability_pct: 30, primaryStation: 'glaze', description: { tr: 'Düşük viskozite sır akmasına neden olur', en: 'Low viscosity causes glaze dripping' } },
    { defectType: 'pinhole_glaze', probability_pct: 20, primaryStation: 'glaze', description: { tr: 'Kabin basıncı düşüklüğü pinhole oluşturur', en: 'Low cabin pressure creates pinholes' } },
    { defectType: 'color_tone_variance', probability_pct: 15, primaryStation: 'glaze', description: { tr: 'Yoğunluk sapması renk tutarsızlığı yaratır', en: 'Density deviation creates color inconsistency' } },
    { defectType: 'line_defect_glaze', probability_pct: 10, primaryStation: 'glaze', description: { tr: 'Nozül tıkanması çizgi defekti oluşturur', en: 'Nozzle clog creates line defects' } },
    { defectType: 'edge_buildup', probability_pct: 10, primaryStation: 'glaze', description: { tr: 'Nozül açısı sapması kenar birikimi yaratır', en: 'Nozzle angle deviation causes edge buildup' } },
    { defectType: 'line_defect_print', probability_pct: 8, primaryStation: 'printer', description: { tr: 'Sır kalıntısı baskı nozüllerini etkiler', en: 'Glaze residue affects print nozzles' } },
    { defectType: 'white_spot', probability_pct: 7, primaryStation: 'printer', description: { tr: 'Mürekkep viskozite düşüklüğü beyaz nokta oluşturur', en: 'Low ink viscosity creates white spots' } },
  ],

  causeEffectTable: [
    {
      station: 'glaze', parameter: 'glaze_viscosity_sec',
      parameterLabel: { tr: 'Viskozite', en: 'Viscosity' },
      deviation: { tr: 'Minimumun 3 s altında (15 s)', en: '-3 s below min (15 s)' },
      consequence: { tr: 'Sır çok akışkan — yüzeyden akar ve damlar', en: 'Glaze too fluid — flows and drips off surface' },
      expectedDefects: ['glaze_drip', 'glaze_thickness_variance'],
      affectedKPIs: ['ftq', 'scrap', 'oee'],
      severityColor: 'red',
    },
    {
      station: 'glaze', parameter: 'glaze_density_g_cm3',
      parameterLabel: { tr: 'Sır Yoğunluğu', en: 'Glaze Density' },
      deviation: { tr: 'Minimumun 0.05 g/cm³ altında (1.30)', en: '-0.05 g/cm³ below min (1.30)' },
      consequence: { tr: 'Yetersiz sır katmanı, renk tutarsızlığı', en: 'Insufficient glaze layer, color inconsistency' },
      expectedDefects: ['color_tone_variance'],
      affectedKPIs: ['ftq', 'scrap'],
      severityColor: 'red',
    },
    {
      station: 'glaze', parameter: 'application_weight_g_m2',
      parameterLabel: { tr: 'Uygulama Ağırlığı', en: 'App. Weight' },
      deviation: { tr: 'Minimumun 50 g/m² altında (250)', en: '-50 g/m² below min (250)' },
      consequence: { tr: 'İnce sır katmanı — pinhole ve renk sapması riski', en: 'Thin glaze layer — pinhole and color deviation risk' },
      expectedDefects: ['pinhole_glaze', 'color_tone_variance'],
      affectedKPIs: ['ftq', 'scrap'],
      severityColor: 'red',
    },
    {
      station: 'glaze', parameter: 'glaze_temperature_c',
      parameterLabel: { tr: 'Sır Sıcaklığı', en: 'Glaze Temp' },
      deviation: { tr: 'Maksimumun 4°C üzerinde (34°C)', en: '+4°C above max (34°C)' },
      consequence: { tr: 'Sıcaklık viskoziteyi daha da düşürür', en: 'Heat further reduces viscosity' },
      expectedDefects: ['glaze_drip'],
      affectedKPIs: ['ftq'],
      severityColor: 'orange',
    },
    {
      station: 'glaze', parameter: 'nozzle_angle_deg',
      parameterLabel: { tr: 'Nozül Açısı', en: 'Nozzle Angle' },
      deviation: { tr: 'Maksimumun 5° üzerinde (50°)', en: '+5° above max (50°)' },
      consequence: { tr: 'Sprey dağılımı bozulur, kenar birikimi oluşur', en: 'Spray distribution disrupted, edge buildup forms' },
      expectedDefects: ['edge_buildup', 'line_defect_glaze'],
      affectedKPIs: ['ftq', 'scrap'],
      severityColor: 'orange',
    },
    {
      station: 'printer', parameter: 'head_temperature_c',
      parameterLabel: { tr: 'Kafa Sıcaklığı', en: 'Head Temp' },
      deviation: { tr: 'Maksimumun 3°C üzerinde (48°C)', en: '+3°C above max (48°C)' },
      consequence: { tr: 'Mürekkep buharlaşması, nozül tıkanması', en: 'Ink evaporation, nozzle clogging' },
      expectedDefects: ['line_defect_print', 'white_spot'],
      affectedKPIs: ['ftq', 'scrap'],
      severityColor: 'orange',
    },
    {
      station: 'printer', parameter: 'ink_viscosity_mpa_s',
      parameterLabel: { tr: 'Mürekkep Viskozite', en: 'Ink Viscosity' },
      deviation: { tr: 'Minimumun 2 mPa·s altında (6)', en: '-2 mPa·s below min (6)' },
      consequence: { tr: 'Mürekkep spreyi dengesiz, beyaz noktalar oluşur', en: 'Ink spray uneven, white spots form' },
      expectedDefects: ['white_spot', 'line_defect_print'],
      affectedKPIs: ['ftq'],
      severityColor: 'red',
    },
    {
      station: 'dryer', parameter: 'exit_moisture_pct',
      parameterLabel: { tr: 'Çıkış Nemi', en: 'Exit Moisture' },
      deviation: { tr: 'Maksimumun 0.5% üzerinde (2.0%)', en: '+0.5% above max (2.0%)' },
      consequence: { tr: 'Yüksek nem sır yapışmasını bozar', en: 'High moisture impairs glaze adhesion' },
      expectedDefects: ['pinhole_glaze'],
      affectedKPIs: ['ftq', 'scrap'],
      severityColor: 'orange',
    },
  ],

  expectedScrapRange: { min: 18, max: 25 },
  expectedOEERange: { min: 65, max: 72 },
  expectedEnergyImpact: { min: 8, max: 10 },

  /**
   * SCN-003 conveyor settings: glaze drift causes severe conveyor disruption.
   * 100 cycle-time jams, 30 impacted tiles, highest drift tolerances (8–15%).
   */
  conveyorSettings: {
    /** Speed fluctuation from glaze viscosity changes affecting belt tension */
    speedChange: true,
    /** 8% drift on speed variation */
    speedChangeDrift: 8,
    /** Frequent jam events from belt sagging under high-viscosity glaze load */
    jammedEvents: true,
    /** 8% drift on jam event frequency */
    jammedEventsDrift: 8,
    /** Severe jam time: 20 cycle times (2× above normal ceiling) */
    jammedTime: 20,
    /** 12% drift on jam duration — high variability */
    jammedTimeDrift: 12,
    /** 12 scrap tiles per event — far above normal range */
    impactedTiles: 12,
    /** 15% drift on impacted tile count — high variability */
    impactedTilesDrift: 15,
    /** 2% scrap probability — glaze drift baseline scrap rate */
    scrapProbability: 2,
    /** 1% drift on scrap probability */
    scrapProbabilityDrift: 1,
  },
};

// =============================================================================
// SCENARIO 4: MULTI-STATION CASCADE FAILURE (SCN-004)
// =============================================================================

/** SCN-004 — Multi-Station Cascade Failure: All 7 stations degraded simultaneously. */
const SCN_004_CASCADE: ScenarioDefinition = {
  id: 'scn-004-multi-station-cascade',
  code: 'SCN-004',
  name: { tr: 'Çoklu İstasyon Kaskad Arızası', en: 'Multi-Station Cascade Failure' },
  description: {
    tr: 'Eş zamanlı arızalar: Pres kalıbı aşınmış, kurutma fanı düşmüş, sır nozülleri tıkalı, fırında sıcaklık düşüşü, ayıklama kamerası kaymış. Vardiya sonu biriken arızaları simüle eder.',
    en: 'Simultaneous failures: worn press mold, dryer fan drop, clogged glaze nozzles, kiln under-firing, sorting camera drift. Simulates end-of-shift compounding failures.',
  },
  severity: 'critical',

  parameterOverrides: [
    // ── Press (worn mold, low pressure, wet powder) ──
    { station: 'press', parameter: 'pressure_bar', value: 260, driftLimit: 15, isOutOfRange: true, normalRange: { min: 280, max: 450 } },
    { station: 'press', parameter: 'mold_wear_pct', value: 42, driftLimit: 15, isOutOfRange: true, normalRange: { min: 0, max: 30 } },
    { station: 'press', parameter: 'powder_moisture_pct', value: 8.5, driftLimit: 15, isOutOfRange: true, normalRange: { min: 5, max: 7 } },
    { station: 'press', parameter: 'fill_amount_g', value: 750, driftLimit: 15, isOutOfRange: true, normalRange: { min: 800, max: 2500 } },
    // ── Dryer (overheated inlet, low fan, high exit moisture) ──
    { station: 'dryer', parameter: 'inlet_temperature_c', value: 280, driftLimit: 12, isOutOfRange: true, normalRange: { min: 150, max: 250 } },
    { station: 'dryer', parameter: 'fan_frequency_hz', value: 25, driftLimit: 12, isOutOfRange: true, normalRange: { min: 30, max: 50 } },
    { station: 'dryer', parameter: 'exit_moisture_pct', value: 2.5, driftLimit: 12, isOutOfRange: true, normalRange: { min: 0.5, max: 1.5 } },
    // ── Glaze (high viscosity, extreme angle, overpressure) ──
    { station: 'glaze', parameter: 'glaze_viscosity_sec', value: 40, driftLimit: 15, isOutOfRange: true, normalRange: { min: 18, max: 35 } },
    { station: 'glaze', parameter: 'nozzle_angle_deg', value: 12, driftLimit: 15, isOutOfRange: true, normalRange: { min: 15, max: 45 } },
    { station: 'glaze', parameter: 'cabin_pressure_bar', value: 1.5, driftLimit: 15, isOutOfRange: true, normalRange: { min: 0.3, max: 1.2 } },
    // ── Printer (low nozzle count, wide gap, overheated) ──
    { station: 'printer', parameter: 'active_nozzle_pct', value: 82, driftLimit: 12, isOutOfRange: true, normalRange: { min: 95, max: 100 } },
    { station: 'printer', parameter: 'head_gap_mm', value: 5, driftLimit: 12, isOutOfRange: true, normalRange: { min: 1.5, max: 4 } },
    { station: 'printer', parameter: 'head_temperature_c', value: 50, driftLimit: 12, isOutOfRange: true, normalRange: { min: 35, max: 45 } },
    // ── Kiln (under-firing) ──
    { station: 'kiln', parameter: 'max_temperature_c', value: 1080, driftLimit: 15, isOutOfRange: true, normalRange: { min: 1100, max: 1220 } },
    { station: 'kiln', parameter: 'firing_time_min', value: 30, driftLimit: 15, isOutOfRange: true, normalRange: { min: 35, max: 60 } },
    // ── Sorting (low res camera, high threshold) ──
    { station: 'sorting', parameter: 'camera_resolution_mp', value: 4, driftLimit: 20, isOutOfRange: true, normalRange: { min: 5, max: 20 } },
    { station: 'sorting', parameter: 'defect_threshold_mm2', value: 3.5, driftLimit: 20, isOutOfRange: true, normalRange: { min: 0.5, max: 3.0 } },
    // ── Packaging (low seal pressure, loose wrap) ──
    { station: 'packaging', parameter: 'box_sealing_pressure_bar', value: 1.5, driftLimit: 15, isOutOfRange: true, normalRange: { min: 2, max: 5 } },
    { station: 'packaging', parameter: 'stretch_tension_pct', value: 120, driftLimit: 15, isOutOfRange: true, normalRange: { min: 150, max: 300 } },
  ],

  expectedDefects: [
    { defectType: 'edge_defect', probability_pct: 20, primaryStation: 'press', description: { tr: 'Aşınmış kalıp kenar defekti oluşturur', en: 'Worn mold creates edge defects' } },
    { defectType: 'crack_press', probability_pct: 15, primaryStation: 'press', description: { tr: 'Düşük basınç pres çatlağı oluşturur', en: 'Low pressure creates press cracks' } },
    { defectType: 'explosion_dry', probability_pct: 10, primaryStation: 'dryer', description: { tr: 'Aşırı giriş sıcaklığı kurutma patlaması riski', en: 'Excessive inlet temp risks drying explosion' } },
    { defectType: 'glaze_drip', probability_pct: 15, primaryStation: 'glaze', description: { tr: 'Yüksek viskozite dengesiz sır dağılımı yaratır', en: 'High viscosity creates uneven glaze distribution' } },
    { defectType: 'white_spot', probability_pct: 12, primaryStation: 'printer', description: { tr: 'Düşük nozül oranı beyaz nokta oluşturur', en: 'Low nozzle count creates white spots' } },
    { defectType: 'warp_kiln', probability_pct: 18, primaryStation: 'kiln', description: { tr: 'Yetersiz pişirme çarpılmaya neden olur', en: 'Under-firing causes warping' } },
    { defectType: 'chip', probability_pct: 10, primaryStation: 'packaging', description: { tr: 'Düşük mühürleme basıncı paketleme hasarı riski', en: 'Low seal pressure risks packaging damage' } },
  ],

  causeEffectTable: [
    {
      station: 'press', parameter: 'pressure_bar',
      parameterLabel: { tr: 'Basınç', en: 'Pressure' },
      deviation: { tr: 'Minimumun 20 bar altında (260 bar)', en: '-20 bar below min (260 bar)' },
      consequence: { tr: 'Yetersiz sıkıştırma, karo yoğunluğu düşük', en: 'Insufficient compaction, low tile density' },
      expectedDefects: ['crack_press', 'density_variance'],
      affectedKPIs: ['oee', 'ftq', 'scrap'],
      severityColor: 'red',
    },
    {
      station: 'press', parameter: 'mold_wear_pct',
      parameterLabel: { tr: 'Kalıp Aşınması', en: 'Mold Wear' },
      deviation: { tr: 'Maksimumun 12% üzerinde (42%)', en: '+12% above max (42%)' },
      consequence: { tr: 'Aşınmış kalıp kenar ve boyut defektleri üretir', en: 'Worn mold produces edge and dimensional defects' },
      expectedDefects: ['edge_defect', 'dimension_variance'],
      affectedKPIs: ['ftq', 'scrap'],
      severityColor: 'red',
    },
    {
      station: 'dryer', parameter: 'inlet_temperature_c',
      parameterLabel: { tr: 'Giriş Sıcaklığı', en: 'Inlet Temp' },
      deviation: { tr: 'Maksimumun 30°C üzerinde (280°C)', en: '+30°C above max (280°C)' },
      consequence: { tr: 'Aşırı ısı kurutma patlaması ve yüzey çatlağı riski', en: 'Excess heat risks drying explosion and surface cracks' },
      expectedDefects: ['explosion_dry', 'surface_crack_dry'],
      affectedKPIs: ['oee', 'ftq', 'scrap', 'energy'],
      severityColor: 'red',
    },
    {
      station: 'dryer', parameter: 'fan_frequency_hz',
      parameterLabel: { tr: 'Fan Frekansı', en: 'Fan Freq' },
      deviation: { tr: 'Minimumun 5 Hz altında (25 Hz)', en: '-5 Hz below min (25 Hz)' },
      consequence: { tr: 'Yetersiz hava sirkülasyonu, dengesiz kurutma', en: 'Insufficient air circulation, uneven drying' },
      expectedDefects: ['warp_dry'],
      affectedKPIs: ['ftq', 'scrap'],
      severityColor: 'orange',
    },
    {
      station: 'glaze', parameter: 'glaze_viscosity_sec',
      parameterLabel: { tr: 'Viskozite', en: 'Viscosity' },
      deviation: { tr: 'Maksimumun 5 s üzerinde (40 s)', en: '+5 s above max (40 s)' },
      consequence: { tr: 'Çok kalın sır — akma ve damlama', en: 'Glaze too thick — dripping and uneven coating' },
      expectedDefects: ['glaze_drip', 'glaze_thickness_variance'],
      affectedKPIs: ['ftq', 'scrap'],
      severityColor: 'red',
    },
    {
      station: 'printer', parameter: 'active_nozzle_pct',
      parameterLabel: { tr: 'Aktif Nozül', en: 'Active Nozzles' },
      deviation: { tr: 'Minimumun 13% altında (82%)', en: '-13% below min (82%)' },
      consequence: { tr: 'Baskı çizgileri ve beyaz noktalar oluşur', en: 'Print lines and white spots appear' },
      expectedDefects: ['line_defect_print', 'white_spot'],
      affectedKPIs: ['ftq', 'scrap'],
      severityColor: 'red',
    },
    {
      station: 'printer', parameter: 'head_gap_mm',
      parameterLabel: { tr: 'Kafa Boşluğu', en: 'Head Gap' },
      deviation: { tr: 'Maksimumun 1 mm üzerinde (5 mm)', en: '+1 mm above max (5 mm)' },
      consequence: { tr: 'Geniş boşluk baskı netliğini düşürür', en: 'Wide gap reduces print sharpness' },
      expectedDefects: ['blur', 'saturation_variance'],
      affectedKPIs: ['ftq'],
      severityColor: 'orange',
    },
    {
      station: 'kiln', parameter: 'max_temperature_c',
      parameterLabel: { tr: 'Maks Sıcaklık', en: 'Max Temp' },
      deviation: { tr: 'Minimumun 20°C altında (1080°C)', en: '-20°C below min (1080°C)' },
      consequence: { tr: 'Yetersiz pişirme — karo çarpılır, mukavemet düşer', en: 'Under-firing — tile warps, strength drops' },
      expectedDefects: ['warp_kiln', 'crack_kiln'],
      affectedKPIs: ['oee', 'ftq', 'scrap'],
      severityColor: 'red',
    },
    {
      station: 'kiln', parameter: 'firing_time_min',
      parameterLabel: { tr: 'Pişirme Süresi', en: 'Firing Time' },
      deviation: { tr: 'Minimumun 5 min altında (30 min)', en: '-5 min below min (30 min)' },
      consequence: { tr: 'Kısa pişirme süresi boyut sapması yaratır', en: 'Short firing time creates dimensional variance' },
      expectedDefects: ['size_variance_kiln'],
      affectedKPIs: ['ftq', 'scrap'],
      severityColor: 'orange',
    },
    {
      station: 'sorting', parameter: 'camera_resolution_mp',
      parameterLabel: { tr: 'Kamera Çözünürlük', en: 'Camera Res.' },
      deviation: { tr: 'Minimumun 1 MP altında (4 MP)', en: '-1 MP below min (4 MP)' },
      consequence: { tr: 'Düşük çözünürlük defektlerin kaçırılmasına neden olur', en: 'Low resolution causes missed defects' },
      expectedDefects: ['unknown'],
      affectedKPIs: ['ftq'],
      severityColor: 'orange',
    },
    {
      station: 'sorting', parameter: 'defect_threshold_mm2',
      parameterLabel: { tr: 'Hata Eşiği', en: 'Defect Threshold' },
      deviation: { tr: 'Maksimumun 0.5 mm² üzerinde (3.5 mm²)', en: '+0.5 mm² above max (3.5 mm²)' },
      consequence: { tr: 'Yüksek eşik küçük defektlerin geçmesine izin verir', en: 'High threshold allows small defects to pass' },
      expectedDefects: ['unknown'],
      affectedKPIs: ['ftq'],
      severityColor: 'orange',
    },
    {
      station: 'packaging', parameter: 'box_sealing_pressure_bar',
      parameterLabel: { tr: 'Mühürleme Basıncı', en: 'Seal Pressure' },
      deviation: { tr: 'Minimumun 0.5 bar altında (1.5 bar)', en: '-0.5 bar below min (1.5 bar)' },
      consequence: { tr: 'Zayıf mühürleme taşıma sırasında hasara neden olur', en: 'Weak seal causes transport damage' },
      expectedDefects: ['chip', 'edge_crack_pack'],
      affectedKPIs: ['scrap'],
      severityColor: 'orange',
    },
    {
      station: 'packaging', parameter: 'stretch_tension_pct',
      parameterLabel: { tr: 'Streç Gerginliği', en: 'Wrap Tension' },
      deviation: { tr: 'Minimumun 30% altında (120%)', en: '-30% below min (120%)' },
      consequence: { tr: 'Gevşek sarma palet stabilitesini düşürür', en: 'Loose wrap reduces pallet stability' },
      expectedDefects: ['crush_damage'],
      affectedKPIs: ['scrap'],
      severityColor: 'orange',
    },
  ],

  expectedScrapRange: { min: 40, max: 55 },
  expectedOEERange: { min: 30, max: 45 },
  expectedEnergyImpact: { min: 25, max: 35 },

  /**
   * SCN-004 conveyor settings: multi-station cascade — speed and jam events active
   * but with low drift (1%) because the cascade is consistent and predictable.
   * 100 cycle-time jams, 10 impacted tiles.
   */
  conveyorSettings: {
    /** Cascade failures cause cascading speed changes across all stations */
    speedChange: true,
    /** 10% drift — unpredictable speed variation across cascade */
    speedChangeDrift: 10,
    /** Multiple simultaneous jam events from cascading station faults */
    jammedEvents: true,
    /** 15% drift — highly variable jam frequency in cascade mode */
    jammedEventsDrift: 15,
    /** Jam time: 20 cycle times — matches SCN-003 severity (same cause depth) */
    jammedTime: 20,
    /** 12% drift on jam duration — high variability from cascade timing */
    jammedTimeDrift: 12,
    /** 12 scrap tiles per event — matches SCN-003 impact level */
    impactedTiles: 12,
    /** 15% drift on impacted tile count — highest variability in the suite */
    impactedTilesDrift: 15,
    /** 3% scrap probability — cascade failure pushes to upper limit */
    scrapProbability: 3,
    /** 1% drift on scrap probability */
    scrapProbabilityDrift: 1,
  },
};

// =============================================================================
// EXPORTED SCENARIO COLLECTION & HELPER FUNCTIONS
// =============================================================================

/**
 * Array of all 4 predefined scenario definitions.
 * Used by DemoSettingsPanel to populate the scenario selector dropdown.
 */
export const SCENARIOS: ScenarioDefinition[] = [
  SCN_001_OPTIMAL,
  SCN_002_KILN_CRISIS,
  SCN_003_GLAZE_DRIFT,
  SCN_004_CASCADE,
];

/**
 * Look up a scenario by its short code (e.g., 'SCN-001').
 *
 * @param code - The scenario code to search for (case-sensitive).
 * @returns The matching ScenarioDefinition, or undefined if not found.
 */
export function getScenarioByCode(code: string): ScenarioDefinition | undefined {
  return SCENARIOS.find(s => s.code === code);
}

/**
 * Look up a scenario by its unique ID (e.g., 'scn-001-optimal-production').
 *
 * @param id - The scenario ID to search for.
 * @returns The matching ScenarioDefinition, or undefined if not found.
 */
export function getScenarioById(id: string): ScenarioDefinition | undefined {
  return SCENARIOS.find(s => s.id === id);
}
