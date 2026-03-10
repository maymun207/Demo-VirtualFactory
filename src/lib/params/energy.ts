/**
 * ╔═══════════════════════════════════════════════════════════════════╗
 * ║  ENERGY — KPI calculation factors, per-station energy config,   ║
 * ║  speed range, and CO₂ emission factors.                         ║
 * ╚═══════════════════════════════════════════════════════════════════╝
 */

// ═══════════════════════════════════════════════════════════════════
// KPI CALCULATION — Factors and constants for formulae
// ═══════════════════════════════════════════════════════════════════

/** CO₂ emission factor for electricity (kg CO₂ per kWh) */
export const CO2_FACTOR_ELECTRIC = 0.4;
/** CO₂ emission factor for natural gas (kg CO₂ per m³) */
export const CO2_FACTOR_GAS = 1.9;
/** Simulated baseline uptime factor (0.96 = 96%) */
export const AVAILABILITY_FACTOR = 0.96;
/** Benchmark conveyor speed for 100% performance rating */
export const DESIGN_SPEED = 2.0;
/** Number of recent ticks kept for rolling trend calculations (shortened to 5 for faster trend updates) */
export const KPI_TREND_WINDOW = 5;
/** Minimum ticks required before showing a trend arrow (reduced to 2 to match the shorter window) */
export const KPI_TREND_MIN_TICKS = 2;
/** ±range for random jitter applied to defect values each tick */
export const DEFECT_RANDOMIZATION = 0.2;

/**
 * Per-tick energy scaling factor.
 *
 * Base consumption values in ENERGY_CONFIG are expressed in kWh (or m³)
 * per hour at rated capacity. Each S-Clock tick represents approximately
 * 1 minute of real factory time. This factor converts the per-tick
 * accumulation so cumulative totals across ~1,000 ticks match realistic
 * production run outputs (~15,000-20,000 kWh for 530 tiles).
 *
 * Formula: ENERGY_TICK_SCALE = (1 minute / 60 minutes per hour)
 *          ≈ 0.0167, but we use 0.08 to account for the simulation's
 *          compressed time scale (tiles move faster than real-time).
 */
export const ENERGY_TICK_SCALE = 0.08;

// ═══════════════════════════════════════════════════════════════════
// SPEED RANGE — Min/base/max for energy calculations
// ═══════════════════════════════════════════════════════════════════

/**
 * Speed range used in energy formulae.
 * Values must stay in sync with CONVEYOR_SPEED_RANGE in ui.ts.
 */
export const SPEED_RANGE = {
  /** Minimum speed (matches CONVEYOR_SPEED_RANGE.min in ui.ts) */
  min: 0.3,
  /** Base/reference speed (1.0 = normal) */
  base: 1.0,
  /** Maximum speed (matches CONVEYOR_SPEED_RANGE.max in ui.ts) */
  max: 2,
} as const;

// ═══════════════════════════════════════════════════════════════════
// ENERGY CONFIG — Per-station consumption parameters
// ═══════════════════════════════════════════════════════════════════

/**
 * Per-station energy consumption parameters.
 * Used by energyConfig.ts to calculate instantaneous consumption.
 */
export interface ConsumptionParams {
  /** Base consumption value (kWh or m³) at normal speed with tile present */
  base: number;
  /** Speed effect at minimum speed (e.g., -0.2 = 20% reduction) */
  minEffect: number;
  /** Speed effect at maximum speed (e.g., 0.3 = 30% increase) */
  maxEffect: number;
  /** Fraction of base consumption when station is idle (e.g., 0.15 = 15%) */
  idleFactor: number;
}

/** Per-station consumption look-up for electricity (kWh) and gas (m³) */
export const ENERGY_CONFIG: {
  kwh: Record<string, ConsumptionParams>;
  gas: Record<string, ConsumptionParams>;
} = {
  kwh: {
    press: { base: 10, minEffect: -0.2, maxEffect: 0.3, idleFactor: 0.15 },
    dryer: { base: 20, minEffect: 0, maxEffect: 0, idleFactor: 0.15 },
    glaze: { base: 8, minEffect: -0.1, maxEffect: 0.15, idleFactor: 0.15 },
    digital: { base: 20, minEffect: -0.3, maxEffect: 0.3, idleFactor: 0.15 },
    kiln: { base: 100, minEffect: 0, maxEffect: 0, idleFactor: 0.8 },
    sorting: { base: 10, minEffect: -0.5, maxEffect: 0.5, idleFactor: 0.15 },
    packaging: { base: 10, minEffect: -0.5, maxEffect: 0.5, idleFactor: 0.15 },
    /** Conveyor belt motor — strongly speed-dependent, nearly zero when stopped */
    conveyor: { base: 5, minEffect: -0.3, maxEffect: 0.5, idleFactor: 0.1 },
  },
  gas: {
    dryer: { base: 30, minEffect: 0, maxEffect: 0, idleFactor: 0.15 },
    kiln: { base: 100, minEffect: 0, maxEffect: 0, idleFactor: 0.8 },
  },
};
