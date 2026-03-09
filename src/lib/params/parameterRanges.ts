/**
 * parameterRanges.ts — Normal Operating Ranges for All Machine Parameters
 *
 * Defines the safe operating window (min–max) for every numeric parameter
 * across all 7 production stations PLUS the conveyor belt.
 * When a parameter's live value falls OUTSIDE its range, the copilot engine
 * can detect it as a deviation and propose a corrective action.
 * The defect engine (defectEngine.ts) also uses these ranges.
 *
 * Range values are sourced from SCN-001 parameterOverrides.normalRange
 * entries, which represent the widest "acceptable" operating window.
 *
 * CONVEYOR NOTE:
 * The conveyor belt is treated as the 8th station for copilot monitoring.
 * Its behavioral parameters (speed, jam events, scrap probability) are
 * stored in the conveyor_states table. Only conveyor_speed_x has a
 * meaningful operational range for OEE correction purposes:
 *   min=0.7x, max=2.0x — the demo can be set to 0.3x which triggers detection.
 * Scenario/demo controls (jammed_events, scrap_probability, etc.) are NOT
 * included here because they are simulation scenario knobs, not real
 * process parameters.
 *
 * Architecture:
 *   - This module is PURE DATA — no imports from stores or React.
 *   - Used by: defectEngine.ts, copilotEngine.ts (findOutOfRangeParams)
 *   - NOT used directly by UI components; they read via scenarios.ts.
 *
 * Maintenance:
 *   - If a new parameter is added to a station, add its range here AND
 *     in causeEffectConfig.ts to define the associated defect types.
 *   - Ranges must satisfy: min < max for every entry.
 */

import type { StationName } from '../../store/types.js';

// =============================================================================
// TYPE DEFINITION
// =============================================================================

/**
 * A single parameter's safe operating range.
 * Values outside [min, max] trigger the defect evaluation logic.
 */
export interface ParameterRange {
  /** Lower bound of the safe operating window. */
  min: number;
  /** Upper bound of the safe operating window. */
  max: number;
}

// =============================================================================
// NORMAL OPERATING RANGES — ALL 45 PARAMETERS
// =============================================================================

/**
 * Complete normal operating range map for every parameter across all 7 stations
 * PLUS the conveyor belt (monitored by the copilot engine for OEE deviations).
 *
 * KEY FORMAT: The parameter key must EXACTLY match the key used in:
 *   - DEFAULT_MACHINE_PARAMS (machineParams.ts)
 *   - currentParams[station] in simulationDataStore
 *   - CAUSE_EFFECT_MAP entries (causeEffectConfig.ts)
 *   - For conveyor: column names in the conveyor_states table
 *
 * ORDER: press → dryer → glaze → printer → kiln → sorting → packaging → conveyor
 */
export const PARAMETER_RANGES: Record<string, Record<string, ParameterRange>> = {

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. PRESS — 6 parameters
  // ═══════════════════════════════════════════════════════════════════════════
  press: {
    /** Hydraulic pressure — safe window: 280–450 bar. */
    pressure_bar: { min: 280, max: 450 },
    /** Cycle time — safe window: 4–8 seconds. */
    cycle_time_sec: { min: 4, max: 8 },
    /** Mold temperature — safe window: 40–60°C. */
    mold_temperature_c: { min: 40, max: 60 },
    /** Powder moisture — safe window: 5–7%. */
    powder_moisture_pct: { min: 5, max: 7 },
    /** Fill amount — safe window: 800–2500 g. */
    fill_amount_g: { min: 800, max: 2500 },
    /** Mold wear — safe window: 0–30%. */
    mold_wear_pct: { min: 0, max: 30 },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. DRYER — 6 parameters
  // ═══════════════════════════════════════════════════════════════════════════
  dryer: {
    /** Inlet temperature — safe window: 150–250°C. */
    inlet_temperature_c: { min: 150, max: 250 },
    /** Outlet temperature — safe window: 80–120°C. */
    outlet_temperature_c: { min: 80, max: 120 },
    /** Belt speed — safe window: 1–5 m/min. */
    belt_speed_m_min: { min: 1, max: 5 },
    /** Drying time — safe window: 30–60 min. */
    drying_time_min: { min: 30, max: 60 },
    /** Exit moisture — safe window: 0.5–1.5%. */
    exit_moisture_pct: { min: 0.5, max: 1.5 },
    /** Fan frequency — safe window: 30–50 Hz. */
    fan_frequency_hz: { min: 30, max: 50 },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. GLAZE — 7 parameters
  // ═══════════════════════════════════════════════════════════════════════════
  glaze: {
    /** Glaze density — safe window: 1.35–1.55 g/cm³. */
    glaze_density_g_cm3: { min: 1.35, max: 1.55 },
    /** Viscosity (flow cup) — safe window: 18–35 sec. */
    glaze_viscosity_sec: { min: 18, max: 35 },
    /** Application weight — safe window: 300–600 g/m². */
    application_weight_g_m2: { min: 300, max: 600 },
    /** Cabin pressure — safe window: 0.3–1.2 bar. */
    cabin_pressure_bar: { min: 0.3, max: 1.2 },
    /** Nozzle angle — safe window: 15–45°. */
    nozzle_angle_deg: { min: 15, max: 45 },
    /** Belt speed — safe window: 15–35 m/min. */
    belt_speed_m_min: { min: 15, max: 35 },
    /** Glaze temperature — safe window: 20–30°C. */
    glaze_temperature_c: { min: 20, max: 30 },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. DIGITAL PRINTER — 7 parameters (excl. fixed color_channels)
  // ═══════════════════════════════════════════════════════════════════════════
  printer: {
    /** Head temperature — safe window: 35–45°C. */
    head_temperature_c: { min: 35, max: 45 },
    /** Ink viscosity — safe window: 8–15 mPa·s. */
    ink_viscosity_mpa_s: { min: 8, max: 15 },
    /** Drop size — safe window: 6–80 pL. */
    drop_size_pl: { min: 6, max: 80 },
    /** Resolution — safe window: 360–720 dpi. */
    resolution_dpi: { min: 360, max: 720 },
    /** Belt speed — safe window: 20–45 m/min. */
    belt_speed_m_min: { min: 20, max: 45 },
    /** Head gap — safe window: 1.5–4.0 mm. */
    head_gap_mm: { min: 1.5, max: 4.0 },
    /** Active nozzle percentage — safe window: 95–100%. */
    active_nozzle_pct: { min: 95, max: 100 },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. KILN — 7 parameters (excl. fixed zone_count)
  // ═══════════════════════════════════════════════════════════════════════════
  kiln: {
    /** Max temperature — safe window: 1100–1220°C. */
    max_temperature_c: { min: 1100, max: 1220 },
    /** Firing time — safe window: 35–60 min. */
    firing_time_min: { min: 35, max: 60 },
    /** Preheat gradient — safe window: 15–40°C/min. */
    preheat_gradient_c_min: { min: 15, max: 40 },
    /** Cooling gradient — safe window: 20–50°C/min. */
    cooling_gradient_c_min: { min: 20, max: 50 },
    /** Belt speed — safe window: 1–3 m/min. */
    belt_speed_m_min: { min: 1, max: 3 },
    /** Atmosphere pressure — safe window: -0.5 to +0.5 mbar. */
    atmosphere_pressure_mbar: { min: -0.5, max: 0.5 },
    /** O₂ level — safe window: 2–8%. */
    o2_level_pct: { min: 2, max: 8 },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 6. SORTING — 6 parameters (excl. fixed grade_count)
  // ═══════════════════════════════════════════════════════════════════════════
  sorting: {
    /** Camera resolution — safe window: 5–20 MP. */
    camera_resolution_mp: { min: 5, max: 20 },
    /** Scan rate — safe window: 20–60 tiles/min. */
    scan_rate_tiles_min: { min: 20, max: 60 },
    /** Size tolerance — safe window: 0.3–1.0 mm. */
    size_tolerance_mm: { min: 0.3, max: 1.0 },
    /** Color tolerance — safe window: 0.5–2.0 ΔE. */
    color_tolerance_de: { min: 0.5, max: 2.0 },
    /** Flatness tolerance — safe window: 0.1–0.5 mm. */
    flatness_tolerance_mm: { min: 0.1, max: 0.5 },
    /** Defect threshold — safe window: 0.5–3.0 mm². */
    defect_threshold_mm2: { min: 0.5, max: 3.0 },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 7. PACKAGING — 6 parameters
  // ═══════════════════════════════════════════════════════════════════════════
  packaging: {
    /** Tiles per box — safe window: 4–12. */
    stack_count: { min: 4, max: 12 },
    /** Box sealing pressure — safe window: 2–5 bar. */
    box_sealing_pressure_bar: { min: 2, max: 5 },
    /** Pallet capacity — safe window: 40–80 m². */
    pallet_capacity_m2: { min: 40, max: 80 },
    /** Stretch tension — safe window: 150–300%. */
    stretch_tension_pct: { min: 150, max: 300 },
    /** Robot speed — safe window: 6–15 cycles/min. */
    robot_speed_cycles_min: { min: 6, max: 15 },
    /** Label accuracy — safe window: 99–100%. */
    label_accuracy_pct: { min: 99, max: 100 },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 8. CONVEYOR BELT — 1 operational parameter (monitored by copilot engine)
  //
  // Only conveyor_speed_x has a meaningful healthy operational range.
  // Demo/scenario controls (jammed_events, scrap_probability, jammed_time,
  // impacted_tiles, speed_change) are SIMULATION KNOBS, not real process
  // parameters, and are intentionally excluded from this range map.
  //
  // Cause-and-effect: low speed → low Line 3 OEE (Performance component drops).
  // The demo allows 0.3x which is below the healthy minimum — this triggers
  // copilot detection so the engine can propose restoring speed to midpoint.
  // ═══════════════════════════════════════════════════════════════════════════
  conveyor: {
    /**
     * Conveyor belt visual speed multiplier — healthy range: 0.7–2.0x.
     * Below 0.7x = slow inter-station transit → Line 3 OEE Performance drops.
     * Midpoint (1.35x) is the correction target used by the copilot engine.
     */
    conveyor_speed_x: { min: 0.7, max: 2.0 },
  },
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get the normal operating ranges for a specific station.
 *
 * If an active scenario is provided with its own normalRange overrides,
 * those take precedence over the static PARAMETER_RANGES. This allows
 * scenarios to define tighter or wider safe windows.
 *
 * @param station         - Station to get ranges for
 * @param scenarioOverrides - Optional scenario parameter overrides
 * @returns Record of parameter key → { min, max } ranges
 */
export function getRangesForStation(
  station: StationName,
  scenarioOverrides?: Array<{ station: string; parameter: string; normalRange: { min: number; max: number } }>,
): Record<string, ParameterRange> {
  /** Start with the static base ranges for this station. */
  const baseRanges = { ...PARAMETER_RANGES[station] };

  /** If scenario overrides exist, merge them in (scenario takes precedence). */
  if (scenarioOverrides) {
    for (const override of scenarioOverrides) {
      if (override.station === station && override.normalRange) {
        baseRanges[override.parameter] = { ...override.normalRange };
      }
    }
  }

  return baseRanges;
}
