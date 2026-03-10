/**
 * kpiCalculations.ts — Pure Functions for KPI Math
 *
 * All Key Performance Indicator calculations are centralized here.
 * Functions are stateless and side-effect-free, making them easy to
 * unit test independently of stores or React.
 *
 * Exports:
 *  - calculateEnergy()   — Per-station energy/gas/CO₂ consumption
 *  - calculateFTQ()      — First Time Quality percentage
 *  - calculateScrap()    — Scrap rate percentage
 *  - calculateOEE()      — Overall Equipment Effectiveness
 *  - updateKPIs()        — Map raw values into KPI display objects
 *  - calculateTrends()   — Rolling-window trend arrows and percentages
 *  - randomizeDefects()  — Jitter defect values for heatmap animation
 *
 * Data flow:
 *  useKPISync hook → calls these functions → writes results to kpiStore
 *
 * Depends on: params.ts (constants), energyConfig.ts (consumption formula)
 */
import type { KPI, Defect, KpiId } from './params';
import {
  ENERGY_CONFIG,
  CO2_FACTOR_ELECTRIC,
  CO2_FACTOR_GAS,
  AVAILABILITY_FACTOR,
  DESIGN_SPEED,
  STATION_STAGES,
  SNAPSHOT_TOLERANCE,
  KPI_TREND_WINDOW,
  KPI_TREND_MIN_TICKS,
  DEFECT_RANDOMIZATION,
  JAM_AVAILABILITY_PENALTY,
  JAM_MAX_AVAILABILITY_PENALTY,
  INVERTED_KPI_IDS,
  TRACKED_KPI_IDS,
  ENERGY_TICK_SCALE,
} from './params';
import { calculateConsumption } from './energyConfig';

// ═══════════════════════════════════════════════════════════════════
// Energy & Emissions
// ═══════════════════════════════════════════════════════════════════

/**
 * Result of a single energy calculation pass.
 * All values are in their respective physical units.
 */
export interface EnergyResult {
  /** Total electrical energy consumption (kWh) */
  totalKwh: number;
  /** Total natural gas consumption (m³) */
  totalGas: number;
  /** Total CO₂ emissions (kg) = electric CO₂ + gas CO₂ */
  totalCO2: number;
  /** Per-station energy breakdown (for OEE energy integration) */
  perStation: Record<string, { kWh: number; gas: number; co2: number }>;
}

/**
 * Calculate energy consumption, gas usage, and CO₂ emissions for one tick.
 *
 * For each station, determines whether it is occupied (has a tile at its
 * position) and calculates consumption based on speed and occupancy state.
 *
 * @param conveyorSpeed  - Current conveyor speed (affects energy multiplier)
 * @param partPositions  - Array of normalized tile positions (0→1) on the belt
 * @param isRunning      - Whether the production line is actively running
 * @param scenarioEnergyMultiplier - STEP-3: Multiplier for scenario-driven energy increase (default 1.0)
 * @returns {EnergyResult} Total kWh, gas, and CO₂ for this tick
 */
export const calculateEnergy = (
  conveyorSpeed: number,
  partPositions: number[],
  isRunning: boolean,
  scenarioEnergyMultiplier: number = 1.0,
): EnergyResult => {
  /**
   * Check if a station at a given stage index is occupied by a tile.
   * Uses SNAPSHOT_TOLERANCE for fuzzy position matching.
   */
  const checkOccupancy = (stageIdx: number) =>
    partPositions.some(t => Math.abs(t - STATION_STAGES[stageIdx]) < SNAPSHOT_TOLERANCE);

  // Map station IDs to their occupancy state (7 original stations)
  const machineStates: Record<string, boolean> = {
    press: isRunning,           // Press is "on" whenever production runs
    dryer: checkOccupancy(1),   // Dryer station (stage index 1)
    glaze: checkOccupancy(2),   // Glaze/color station
    digital: checkOccupancy(3), // Digital printing station
    kiln: checkOccupancy(4),    // Kiln (firing oven)
    sorting: checkOccupancy(5), // AI vision sorting
    packaging: checkOccupancy(6), // End-of-line packaging
  };

  // ── Build per-station breakdown ──────────────────────────────
  const perStation: Record<string, { kWh: number; gas: number; co2: number }> = {};

  // Electrical consumption per station (now includes conveyor)
  let totalKwh = 0;
  for (const [id, params] of Object.entries(ENERGY_CONFIG.kwh)) {
    // Conveyor occupancy = always "on" when running (it's a belt, not a station)
    const occupied = id === 'conveyor' ? isRunning : (machineStates[id] ?? false);
    const stationKwh = calculateConsumption(params, conveyorSpeed, occupied, isRunning)
      * scenarioEnergyMultiplier
      * ENERGY_TICK_SCALE;
    totalKwh += stationKwh;
    perStation[id] = { kWh: stationKwh, gas: 0, co2: stationKwh * CO2_FACTOR_ELECTRIC };
  }

  // Gas consumption (only dryer + kiln use gas)
  let totalGas = 0;
  for (const [id, params] of Object.entries(ENERGY_CONFIG.gas)) {
    const stationGas = calculateConsumption(params, conveyorSpeed, machineStates[id] ?? false, isRunning)
      * scenarioEnergyMultiplier
      * ENERGY_TICK_SCALE;
    totalGas += stationGas;
    if (perStation[id]) {
      perStation[id].gas = stationGas;
      perStation[id].co2 += stationGas * CO2_FACTOR_GAS;
    }
  }

  // CO₂ = electric contribution + gas contribution
  const totalCO2 = (totalKwh * CO2_FACTOR_ELECTRIC) + (totalGas * CO2_FACTOR_GAS);
  return { totalKwh, totalGas, totalCO2, perStation };
};

// ═══════════════════════════════════════════════════════════════════
// Quality KPIs
// ═══════════════════════════════════════════════════════════════════

/**
 * Calculate First-Time Quality (FTQ) —
 * Only first quality tiles (shipment) count as "passing".
 * Second quality and waste both reduce FTQ.
 *
 * Formula: FTQ = shipmentCount / (shipmentCount + secondQualityCount + wasteCount) × 100
 *
 * @param shipmentCount      - First quality tiles shipped
 * @param secondQualityCount - Tiles routed to 2nd quality box
 * @param wasteCount         - Scrap tiles sent to waste bin
 * @returns Percentage (0–100); 100 if no tiles produced yet
 */
export const calculateFTQ = (
  shipmentCount: number,
  secondQualityCount: number,
  wasteCount: number,
): number => {
  const total = shipmentCount + secondQualityCount + wasteCount;
  return total === 0 ? 100.0 : (shipmentCount / total) * 100;
};

/**
 * Calculate Scrap Rate —
 * the ratio of waste tiles to total produced (all three grades).
 *
 * Formula: Scrap = wasteCount / (shipmentCount + secondQualityCount + wasteCount) × 100
 *
 * @param shipmentCount      - First quality tiles shipped
 * @param secondQualityCount - Tiles routed to 2nd quality box
 * @param wasteCount         - Scrap tiles sent to waste bin
 * @returns Percentage (0–100); 0 if no tiles produced yet
 */
export const calculateScrap = (
  shipmentCount: number,
  secondQualityCount: number,
  wasteCount: number,
): number => {
  const total = shipmentCount + secondQualityCount + wasteCount;
  return total === 0 ? 0.0 : (wasteCount / total) * 100;
};

/**
 * Calculate Total KPI —
 * the ratio of all usable output (first quality + second quality) to total.
 * Only scrap reduces this metric.
 *
 * Formula: TotalKPI = (shipmentCount + secondQualityCount) / total × 100
 *
 * @param shipmentCount      - First quality tiles shipped
 * @param secondQualityCount - Tiles routed to 2nd quality box
 * @param wasteCount         - Scrap tiles sent to waste bin
 * @returns Percentage (0–100); 100 if no tiles produced yet
 */
export const calculateTotalKPI = (
  shipmentCount: number,
  secondQualityCount: number,
  wasteCount: number,
): number => {
  const total = shipmentCount + secondQualityCount + wasteCount;
  return total === 0 ? 100.0 : ((shipmentCount + secondQualityCount) / total) * 100;
};

// ═══════════════════════════════════════════════════════════════════
// OEE (Overall Equipment Effectiveness)
// ═══════════════════════════════════════════════════════════════════

/**
 * @deprecated Use hierarchical OEE from oeeCalculations.ts instead.
 * This legacy formula uses A×P×Q with synthetic availability.
 * The new system uses P×Q with real tile counting per machine.
 *
 * Calculate OEE = Availability × Performance × Quality × 100
 *
 * - Availability: base uptime (AVAILABILITY_FACTOR) minus cumulative jam penalties
 * - Performance: ratio of current speed to benchmark (DESIGN_SPEED), capped at 1.0
 * - Quality: FTQ as a fraction (0–1)
 *
 * @param conveyorSpeed - Current conveyor speed
 * @param ftq           - First Time Quality percentage (0–100)
 * @param faultCount    - Total number of jam events (reduces availability)
 * @returns OEE percentage (0–100)
 */
export const calculateOEE = (conveyorSpeed: number, ftq: number, faultCount: number): number => {
  const performance = Math.min(1.0, conveyorSpeed / DESIGN_SPEED);
  const quality = ftq / 100;
  // Each fault reduces availability; penalty is cumulative but capped
  const penalty = Math.min(JAM_MAX_AVAILABILITY_PENALTY, faultCount * JAM_AVAILABILITY_PENALTY);
  const availability = Math.max(0.1, AVAILABILITY_FACTOR - penalty);
  return Math.min(100, availability * performance * quality * 100);
};

// ═══════════════════════════════════════════════════════════════════
// Single-Pass KPI Update
// ═══════════════════════════════════════════════════════════════════

/**
 * Input for the single-pass KPI value update.
 */
export interface KPIUpdateInput {
  /** Energy calculation results (kWh, gas, CO₂) */
  energy: EnergyResult;
  /** First Time Quality percentage */
  ftq: number;
  /** Total KPI percentage (first quality + second quality) */
  totalKpi: number;
  /** Scrap rate percentage */
  scrap: number;
  /** Overall Equipment Effectiveness percentage */
  oee: number;
}

/**
 * Map raw calculated values onto the KPI display array.
 * Each KPI's `value` string is updated with the formatted number.
 *
 * @param kpis  - Current KPI array from kpiStore
 * @param input - Freshly calculated KPI values
 * @returns New KPI array with updated value strings (immutable)
 */
export const updateKPIs = (kpis: KPI[], input: KPIUpdateInput): KPI[] => {
  return kpis.map(kpi => {
    const id = kpi.id as KpiId;
    switch (id) {
      case 'energy': return { ...kpi, value: input.energy.totalKwh.toFixed(1) };
      case 'gas': return { ...kpi, value: input.energy.totalGas.toFixed(1) };
      case 'co2': return { ...kpi, value: input.energy.totalCO2.toFixed(1) };
      case 'ftq': return { ...kpi, value: input.ftq.toFixed(1) };
      case 'total_kpi': return { ...kpi, value: input.totalKpi.toFixed(1) };
      case 'scrap': return { ...kpi, value: input.scrap.toFixed(1) };
      case 'oee': return { ...kpi, value: input.oee.toFixed(1) };
      default: return kpi;
    }
  });
};

// ═══════════════════════════════════════════════════════════════════
// Trend Calculation (Rolling Window)
// ═══════════════════════════════════════════════════════════════════

/**
 * A single snapshot of KPI values at a specific S-Clock tick.
 * Stored in kpiStore.kpiHistory as a rolling buffer.
 */
export interface KPIHistoryRecord {
  /** S-Clock tick when this snapshot was taken */
  sClock: number;
  /** Map of KPI ID → numeric value at this tick */
  values: Record<string, number>;
}

/**
 * KPIs where a numeric increase is BAD (shown as red/down arrow).
 * For these, "up" means decreasing (which is good).
 * Imported from params.ts — see INVERTED_KPI_IDS.
 */

/** All KPI IDs that participate in trend tracking.
 * Imported from params.ts — see TRACKED_KPI_IDS.
 */

/**
 * Calculate trend arrows and percentages by comparing current values
 * against the oldest value in the rolling history window.
 *
 * Algorithm:
 *   1. Append current values to history
 *   2. Trim history to KPI_TREND_WINDOW using a single findIndex + slice
 *   3. Compare current values to oldest record in the trimmed window
 *   4. Color/direction is inverted for "lower is better" KPIs (scrap, energy, gas, co2)
 *
 * @param kpis        - Current KPI display array
 * @param currentVals - Raw numeric values for this tick
 * @param history     - Existing trend history buffer
 * @param sClockCount - Current S-Clock tick
 * @returns Updated KPIs with trend arrows and trimmed history
 */
export const calculateTrends = (
  kpis: KPI[],
  currentVals: Record<string, number>,
  history: KPIHistoryRecord[],
  sClockCount: number,
): { kpis: KPI[]; history: KPIHistoryRecord[] } => {
  // Build next history: push new record, then trim to window via single slice
  const nextHistory = [...history, { sClock: sClockCount, values: currentVals }];
  // Find first record within the trend window; trim everything before it
  const cutoff = nextHistory.findIndex(r => sClockCount - r.sClock <= KPI_TREND_WINDOW);
  const trimmedHistory = cutoff > 0 ? nextHistory.slice(cutoff) : nextHistory;

  // Need at least KPI_TREND_MIN_TICKS of history before showing trends
  const oldRecord = trimmedHistory[0];
  if (!oldRecord || sClockCount - oldRecord.sClock < KPI_TREND_MIN_TICKS) {
    return { kpis, history: trimmedHistory };
  }

  // Calculate trend for each tracked KPI
  const updatedKpis = kpis.map(kpi => {
    if (!TRACKED_KPI_IDS.includes(kpi.id)) return kpi;

    const current = currentVals[kpi.id];
    const previous = oldRecord.values[kpi.id];
    if (current === undefined || previous === undefined) return kpi;

    const diff = current - previous;
    const isIncreasing = diff >= 0;

    // True percentage change: (current − previous) / |previous| × 100
    // Guard against division-by-zero at simulation start (previous = 0)
    const pctChange = previous !== 0 ? (diff / Math.abs(previous)) * 100 : 0;
    const absPct = Math.abs(pctChange).toFixed(1);

    // For inverted KPIs: increasing value = bad (red/down arrow)
    let trendDir: 'up' | 'down';
    if (INVERTED_KPI_IDS.includes(kpi.id)) {
      trendDir = isIncreasing ? 'down' : 'up';
    } else {
      trendDir = isIncreasing ? 'up' : 'down';
    }

    const arrow = isIncreasing ? '↑' : '↓';

    return {
      ...kpi,
      trend: { tr: `${arrow} %${absPct}`, en: `${arrow} ${absPct}%` },
      trendDirection: trendDir,
    };
  });

  return { kpis: updatedKpis, history: trimmedHistory };
};

// ═══════════════════════════════════════════════════════════════════
// Defect Rates — Real Data from Tile Snapshots
// ═══════════════════════════════════════════════════════════════════

/**
 * Mapping from internal DefectType values (as defined in types.ts and
 * causeEffectConfig.ts) to the 8 heatmap display categories.
 *
 * Each heatmap category aggregates multiple related DefectType values.
 * The keys match the `name` field of INITIAL_DEFECTS in data.ts.
 */
const DEFECT_TYPE_TO_HEATMAP_CATEGORY: Record<string, string> = {
  // → Pinhole category
  pinhole_glaze: 'pinhole',
  pinhole_kiln: 'pinhole',
  // → Glaze Flow category
  glaze_drip: 'glaze',
  glaze_thickness_variance: 'glaze',
  glaze_peel: 'glaze',
  edge_buildup: 'glaze',
  line_defect_glaze: 'glaze',
  // → Banding category
  banding: 'banding',
  line_defect_print: 'banding',
  // → Black Core category (kiln-related severe defects)
  color_fade: 'black',
  thermal_shock_crack: 'black',
  // → Ghosting category (printer-related visual defects)
  white_spot: 'ghosting',
  blur: 'ghosting',
  color_shift: 'ghosting',
  saturation_variance: 'ghosting',
  // → Edge Break category
  edge_defect: 'edge',
  edge_crack_pack: 'edge',
  chip: 'edge',
  crush_damage: 'edge',
  // → Crack category
  crack_press: 'crack',
  crack_kiln: 'crack',
  surface_crack_dry: 'crack',
  delamination: 'crack',
  // → Pattern Shift category
  pattern_stretch: 'pattern',
  pattern_compress: 'pattern',
  pattern_distortion: 'pattern',
  color_tone_variance: 'pattern',
  // ── Additional mappings ──
  warp_dry: 'crack',
  warp_kiln: 'crack',
  corner_lift: 'crack',
  explosion_dry: 'crack',
  press_explosion: 'crack',
  density_variance: 'edge',
  dimension_variance: 'edge',
  size_variance_kiln: 'edge',
  conveyor_jam_damage: 'edge',
  surface_defect: 'crack',
  mold_sticking: 'edge',
  lamination: 'crack',
  moisture_variance: 'glaze',
  missed_defect: 'ghosting',
  false_pass: 'ghosting',
  warp_pass: 'crack',
  mislabel: 'pattern',
  customer_complaint: 'edge',
  unknown: 'pinhole',
};

/**
 * Calculate real defect rates from tile station snapshots.
 *
 * Counts defect occurrences on a PER-TILE basis (not per station visit)
 * to produce meaningful percentages:
 *   - Total tiles = Map.size (each key is one tile)
 *   - Per-tile contribution: a tile contributes at most 1 to each heatmap
 *     category (avoids inflation when the same tile has multiple snapshots
 *     with the same defect type at different stations)
 *
 * Fallback: when no tiles have been produced yet, applies a small baseline
 * jitter to keep the heatmap visually alive (see DEFECT_BASELINE_JITTER).
 *
 * @param tileSnapshots  - Map from tileId → array of TileSnapshotRecord
 * @param baseDefects    - Current defect array (provides structure and labels)
 * @returns New Defect[] with values based on real per-tile production data
 */
export const calculateDefectRatesFromSnapshots = (
  tileSnapshots: Map<string, Array<{ defect_detected: boolean; defect_types?: string[] }>>,
  baseDefects: Defect[],
): Defect[] => {

  /** Total unique tiles processed — used as the denominator for rates. */
  const totalTiles = tileSnapshots.size;

  /**
   * When no tiles have been produced yet, return a small baseline jitter
   * so the heatmap isn't a row of boring zeros while waiting for production.
   * These values are well below any alarm threshold (< 2%).
   */
  if (totalTiles === 0) {
    return randomizeDefects(baseDefects);
  }

  /**
   * Per-category tile counts.
   * Key = heatmap category name (matches Defect.name in INITIAL_DEFECTS).
   * Value = number of DISTINCT tiles that had at least one defect in this category.
   */
  const tileCategoryCounts: Record<string, number> = {};

  /** Initialize all categories to 0. */
  for (const defect of baseDefects) {
    tileCategoryCounts[defect.name] = 0;
  }

  /**
   * Iterate over every tile and aggregate its defect categories.
   * Using a Set<string> per tile ensures each category is counted at most
   * once per tile, even if multiple station snapshots report the same type.
   */
  for (const [, snapshots] of tileSnapshots) {
    /** Categories detected for this specific tile (deduplicated). */
    const tileCategories = new Set<string>();

    for (const snapshot of snapshots) {
      if (!snapshot.defect_detected || !snapshot.defect_types) continue;

      /** Map each defect type string to its heatmap category. */
      for (const defectType of snapshot.defect_types) {
        const category = DEFECT_TYPE_TO_HEATMAP_CATEGORY[defectType];
        if (category && tileCategoryCounts[category] !== undefined) {
          tileCategories.add(category);
        }
      }
    }

    /** Increment tile count once per category that was triggered for this tile. */
    for (const category of tileCategories) {
      tileCategoryCounts[category]++;
    }
  }

  /**
   * Convert per-tile counts to percentage of total tiles produced.
   * Example: 3 tiles out of 20 had a "crack" defect → 15.0%
   */
  return baseDefects.map(d => ({
    ...d,
    /** Rate = (defective tiles in this category / total tiles) × 100 */
    value: Number(((tileCategoryCounts[d.name] || 0) / totalTiles * 100).toFixed(1)),
  }));
};

/**
 * LEGACY: Add visual jitter to defect values for the heatmap animation.
 * Kept for fallback when no tile snapshot data is available.
 *
 * @param defects - Current defect array from kpiStore
 * @returns New defect array with jittered values (immutable)
 */
export const randomizeDefects = (defects: Defect[]): Defect[] => {
  return defects.map(d => ({
    ...d,
    value: Number(Math.max(0, parseFloat((d.value + (Math.random() - 0.5) * DEFECT_RANDOMIZATION).toFixed(1)))),
  }));
};
