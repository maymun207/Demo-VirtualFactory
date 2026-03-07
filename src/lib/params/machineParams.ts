/**
 * ╔═══════════════════════════════════════════════════════════════════╗
 * ║  MACHINE PARAMS — Default operating parameters for all 7        ║
 * ║  factory stations, deep-clone factory, and drift limit.         ║
 * ╚═══════════════════════════════════════════════════════════════════╝
 */

// =============================================================================
// DEFAULT MACHINE PARAMETERS
// =============================================================================

/**
 * Default (optimal) operating parameters for every station.
 * Values are set to the midpoints of the optimal ranges defined
 * in 'types.ts' (e.g., PressParams, DryerParams, etc.).
 *
 * NOTE: This object is the SINGLE SOURCE OF TRUTH for starting values.
 * simulationDataStore and tests should always clone via `createDefaultParams()`.
 */
export const DEFAULT_MACHINE_PARAMS = {
  /** Hydraulic press — forms raw powder into green tiles. */
  press: {
    pressure_bar: 365,           // Optimal: 350–380 bar
    cycle_time_sec: 6,           // Optimal: 5–7 seconds
    mold_temperature_c: 50,      // Optimal: 40–60°C
    powder_moisture_pct: 6,      // Optimal: 5–7%
    fill_amount_g: 1650,         // Optimal: 1600–1700g
    mold_wear_pct: 0,            // Starts at 0% wear
  },
  /** Horizontal dryer — removes residual moisture from green tiles. */
  dryer: {
    inlet_temperature_c: 200,    // Optimal: 150–250°C
    outlet_temperature_c: 100,   // Optimal: 80–120°C
    belt_speed_m_min: 3,         // Optimal: 2–4 m/min
    drying_time_min: 45,         // Optimal: 30–60 min
    exit_moisture_pct: 1.0,      // Optimal: 0.5–1.5%
    fan_frequency_hz: 40,        // Optimal: 30–50 Hz
  },
  /** Glaze application — sprays ceramic glaze onto dried tiles. */
  glaze: {
    glaze_density_g_cm3: 1.45,   // Optimal: 1.40–1.50 g/cm³
    glaze_viscosity_sec: 26,     // Optimal: 22–30 sec (flow cup)
    application_weight_g_m2: 450,// Optimal: 400–500 g/m²
    cabin_pressure_bar: 0.75,    // Optimal: 0.5–1.0 bar
    nozzle_angle_deg: 30,        // Optimal: 25–35°
    belt_speed_m_min: 25,        // Optimal: 20–30 m/min
    glaze_temperature_c: 25,     // Optimal: 20–30°C
  },
  /** Digital printer — applies decoration pattern via inkjet. */
  printer: {
    head_temperature_c: 40,      // Optimal: 35–45°C
    ink_viscosity_mpa_s: 11.5,   // Optimal: 10–13 mPa·s
    drop_size_pl: 43,            // Optimal: 36–50 pL
    resolution_dpi: 540,         // Optimal: 400–720 dpi
    belt_speed_m_min: 32,        // Optimal: 25–40 m/min
    head_gap_mm: 2.75,           // Optimal: 2.5–3.0 mm
    color_channels: 6,           // Fixed: 4–8 channels
    active_nozzle_pct: 98,       // Optimal: 95–100%
  },
  /** Roller kiln — fires glazed tiles at high temperature. */
  kiln: {
    max_temperature_c: 1160,     // Optimal: 1100–1220°C
    firing_time_min: 47,         // Optimal: 40–55 min
    preheat_gradient_c_min: 27,  // Optimal: 15–40°C/min
    cooling_gradient_c_min: 35,  // Optimal: 20–50°C/min
    belt_speed_m_min: 2,         // Optimal: 1–3 m/min
    atmosphere_pressure_mbar: 0, // Optimal: -5 to +5 mbar
    zone_count: 10,              // Fixed: 8–12 zones
    o2_level_pct: 5,             // Optimal: 2–8%
  },
  /** Quality sorting — machine vision inspection and grading. */
  sorting: {
    camera_resolution_mp: 12,    // Fixed: 8–16 MP
    scan_rate_tiles_min: 40,     // Optimal: 30–50 tiles/min
    size_tolerance_mm: 0.5,      // Optimal: 0.3–0.8 mm
    color_tolerance_de: 1.0,     // Optimal: 0.5–1.5 ΔE
    flatness_tolerance_mm: 0.3,  // Optimal: 0.2–0.5 mm
    defect_threshold_mm2: 1.5,   // Optimal: 1.0–2.0 mm²
    grade_count: 4,              // Fixed: 3–5 grades
  },
  /** Packaging — palletizing and wrapping finished tiles. */
  packaging: {
    stack_count: 8,              // Optimal: 6–10 tiles/stack
    box_sealing_pressure_bar: 3.5,// Optimal: 3.0–4.0 bar
    pallet_capacity_m2: 60,      // Optimal: 50–70 m²
    stretch_tension_pct: 225,    // Optimal: 200–250%
    robot_speed_cycles_min: 10,  // Optimal: 8–12 cycles/min
    label_accuracy_pct: 99.5,    // Optimal: 99–100%
  },
} as const;

/**
 * Factory function: returns a DEEP CLONE of DEFAULT_MACHINE_PARAMS.
 * Must be used instead of direct reference to prevent shared-state mutation.
 *
 * Uses JSON.parse(JSON.stringify(...)) — safe because all values are
 * primitive numbers (no Date, Map, Set, or functions).
 */
export function createDefaultParams(): typeof DEFAULT_MACHINE_PARAMS {
  return JSON.parse(JSON.stringify(DEFAULT_MACHINE_PARAMS));
}

/**
 * Default drift limit per parameter (max % change per random drift event).
 * All machine station parameters start at this value on initial load (SCN-000).
 * Set to 0 for SCN-000 so reference production has ZERO drift → zero defects.
 * Individual scenarios (SCN-001+) apply their own 2–3% drift via parameterOverrides.
 */
export const DEFAULT_DRIFT_LIMIT_PCT = 0;

// =============================================================================
// CONVEYOR DEFAULT NUMERIC PARAMETERS
// =============================================================================

/**
 * Default (optimal) operating parameters for the conveyor belt.
 *
 * Includes both the two numeric params (jammed_time, impacted_tiles) AND the
 * two boolean params (speed_change, jammed_events). All four are persisted in
 * the data store so that changes made in Demo Settings survive panel
 * close → reopen cycles.
 *
 * Factory default: no speed-change events and no jammed-events (both false).
 * Values align with CB_JAMMED_TIME_NORMAL_RANGE and CB_IMPACTED_TILES_NORMAL_RANGE
 * in conveyorBehaviour.ts.
 */
export const CONVEYOR_DEFAULT_NUMERIC_PARAMS = {
  /** Expected jam duration (normal range: 6–10 Cycle Time units). */
  jammed_time: 7,
  /** Scrap tiles produced per jam event — 0 for SCN-000 zero-scrap baseline. */
  impacted_tiles: 0,
  /**
   * Whether speed-change events are enabled on the conveyor.
   * false = stable belt (reference/factory default).
   * true  = random speed fluctuations (increases defect risk).
   */
  speed_change: false,
  /**
   * Whether jam events are enabled on the conveyor.
   * false = no jams (reference/factory default).
   * true  = random jam events can occur during simulation.
   */
  jammed_events: false,
  /**
   * Global scrap probability stored as whole percentage (e.g. 2 = 2%).
   * Converted to 0–1 fraction only at the random-check consumption point.
   * Valid range: 0–3%. Default: 0% (zero scrap for SCN-000). Adjustable via Conveyor Settings.
   */
  scrap_probability: 0,
} as const;

/**
 * Factory function: returns a MUTABLE CLONE of CONVEYOR_DEFAULT_NUMERIC_PARAMS.
 * Must be used instead of direct object reference to prevent shared-state mutation.
 * Returns all four params (jammed_time, impacted_tiles, speed_change, jammed_events).
 */
export function createDefaultConveyorParams(): {
  jammed_time: number;
  impacted_tiles: number;
  speed_change: boolean;
  jammed_events: boolean;
  scrap_probability: number;
} {
  return { ...CONVEYOR_DEFAULT_NUMERIC_PARAMS };
}
