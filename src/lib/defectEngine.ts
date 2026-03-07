/**
 * defectEngine.ts — Parameter-Driven Defect Evaluation Engine
 *
 * Pure function module that determines whether a tile should receive a defect
 * when it passes through a station. The decision is based on:
 *
 *   1. Whether any of the station's current parameters are OUTSIDE their
 *      normal operating range (from parameterRanges.ts)
 *   2. A random probability roll (default 20%) for each out-of-range parameter
 *   3. The CAUSE_EFFECT_MAP lookup to determine which defect types apply
 *
 * This module has ZERO store imports — it receives all data via function
 * arguments, making it fully unit-testable without any React or Zustand setup.
 *
 * Architecture:
 *   - Called by: tileSlice.ts → moveTilesOnConveyor() → snapshot recording
 *   - Reads from: CAUSE_EFFECT_MAP (causeEffectConfig.ts), passed ranges/params
 *   - Does NOT import any store or React module
 *
 * Data flow:
 *   currentParams[station] + PARAMETER_RANGES[station] → evaluateStationDefects()
 *   → DefectEvaluation { detected, types[], severity, outOfRangeParams[] }
 *
 * Used by: tileSlice.ts (moveTilesOnConveyor snapshot recording)
 */

import type { StationName, DefectType } from '../store/types';
import { CAUSE_EFFECT_MAP } from './causeEffectConfig';
import type { ParameterRange } from './params/parameterRanges';
import { DEFECT_RANDOM_CHANCE } from './params/demo';
import { SCRAP_DEFECT_TYPES, SORTING_WARP_DEFECT_TYPES } from './params/scrapConfig';

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

/**
 * Result of evaluating one station's parameters for one tile.
 * Contains all information needed to populate the TileSnapshotRecord
 * defect fields (defect_detected, defect_types, defect_severity).
 */
export interface DefectEvaluation {
  /** Whether any defect was actually injected (after random roll). */
  detected: boolean;
  /** Array of defect type identifiers from CAUSE_EFFECT_MAP. */
  types: DefectType[];
  /** Severity score (0–1) based on how far parameters deviated from range. */
  severity: number;
  /** Parameter keys that were found outside their normal range. */
  outOfRangeParams: string[];
}

/**
 * Detail for a single out-of-range parameter evaluation.
 * Used internally during the evaluation process.
 */
interface ParameterDeviation {
  /** The parameter key (e.g., 'pressure_bar'). */
  parameter: string;
  /** Current live value of the parameter. */
  currentValue: number;
  /** Normal operating range for this parameter. */
  range: ParameterRange;
  /** How far the value is from the nearest range boundary (absolute). */
  absoluteDeviation: number;
  /** Deviation as a fraction of the range span (0–1+). */
  normalizedDeviation: number;
  /** Defect types associated with this parameter (from CAUSE_EFFECT_MAP). */
  mappedDefects: string[];
}

// =============================================================================
// INTERNAL LOOKUP CACHE
// =============================================================================

/**
 * Pre-built index: station + parameter → expectedDefects[] from CAUSE_EFFECT_MAP.
 * Built once at module load time for O(1) lookups during evaluation.
 */
const CAUSE_EFFECT_INDEX: Map<string, string[]> = new Map();

/** Build the index on module load. */
for (const entry of CAUSE_EFFECT_MAP) {
  const key = `${entry.station}::${entry.parameter}`;
  CAUSE_EFFECT_INDEX.set(key, entry.expectedDefects);
}

// =============================================================================
// CORE EVALUATION FUNCTION
// =============================================================================

/**
 * Evaluate whether a tile passing through a station should receive a defect.
 *
 * Algorithm:
 *   1. For each parameter at this station, check if current value is outside
 *      the normal [min, max] range.
 *   2. For each out-of-range parameter, perform a random roll against
 *      `defectChance` (default 20%). This ensures that exceeding a threshold
 *      does NOT always cause a defect — it introduces realistic randomness.
 *   3. If the roll succeeds, look up CAUSE_EFFECT_MAP to get the expected
 *      defect types for this station + parameter combination.
 *   4. Calculate severity based on how far the parameter deviates from range.
 *   5. Merge all fired defect types and return the evaluation result.
 *
 * @param station        - Which station the tile is currently at
 * @param currentValues  - Live parameter values (from currentParams[station])
 * @param ranges         - Normal operating ranges (from PARAMETER_RANGES or scenario)
 * @param defectChance   - Probability (0–1) that an OOR parameter actually
 *                         causes a defect. Default: DEFECT_RANDOM_CHANCE (0.20)
 * @returns DefectEvaluation with all defect information
 */
export function evaluateStationDefects(
  station: StationName,
  currentValues: Record<string, number>,
  ranges: Record<string, ParameterRange>,
  defectChance: number = DEFECT_RANDOM_CHANCE,
): DefectEvaluation {

  /** Step 1: Identify all out-of-range parameters. */
  const deviations: ParameterDeviation[] = [];

  for (const [paramKey, currentValue] of Object.entries(currentValues)) {
    /** Skip parameters that don't have a defined range (e.g., fixed params). */
    const range = ranges[paramKey];
    if (!range) continue;

    /** Skip if value is a non-numeric type (safety guard). */
    if (typeof currentValue !== 'number') continue;

    /** Check if value falls outside the [min, max] window. */
    if (currentValue >= range.min && currentValue <= range.max) continue;

    /** Parameter is OUT OF RANGE — calculate deviation metrics. */
    const rangeSpan = range.max - range.min;
    const absoluteDeviation = currentValue < range.min
      ? range.min - currentValue
      : currentValue - range.max;
    /** Normalized deviation: how far past the boundary, as a fraction of span. */
    const normalizedDeviation = rangeSpan > 0 ? absoluteDeviation / rangeSpan : 1;

    /** Look up expected defects from CAUSE_EFFECT_MAP. */
    const lookupKey = `${station}::${paramKey}`;
    const mappedDefects = CAUSE_EFFECT_INDEX.get(lookupKey) ?? [];

    deviations.push({
      parameter: paramKey,
      currentValue,
      range,
      absoluteDeviation,
      normalizedDeviation,
      mappedDefects,
    });
  }

  /** If no parameters are out of range, no defect evaluation needed. */
  if (deviations.length === 0) {
    return {
      detected: false,
      types: [],
      severity: 0,
      outOfRangeParams: [],
    };
  }

  /** Step 2: For each OOR parameter, roll the dice. */
  const firedDefectTypes: Set<string> = new Set();
  let maxSeverity = 0;
  const outOfRangeParams: string[] = [];

  for (const deviation of deviations) {
    /** Record that this parameter was out of range (regardless of roll). */
    outOfRangeParams.push(deviation.parameter);

    /** Random roll — only defectChance% of OOR parameters actually cause defects. */
    if (Math.random() >= defectChance) continue;

    /** Roll succeeded — this parameter DOES cause a defect. */
    for (const defectType of deviation.mappedDefects) {
      firedDefectTypes.add(defectType);
    }

    /** Track the highest severity across all fired parameters. */
    /** Severity capped at 1.0 — even extreme deviations stay within scale. */
    const severity = Math.min(1.0, deviation.normalizedDeviation);
    if (severity > maxSeverity) {
      maxSeverity = severity;
    }
  }

  /** Step 3: Build and return the evaluation result. */
  return {
    detected: firedDefectTypes.size > 0,
    types: Array.from(firedDefectTypes) as DefectType[],
    severity: maxSeverity,
    outOfRangeParams,
  };
}

// =============================================================================
// UTILITY FUNCTION — DEVIATION SUMMARY (for logging / debugging)
// =============================================================================

/**
 * Get a summary of which parameters are currently out of range at a station.
 * Useful for debugging and for the CauseEffectTable UI component.
 *
 * @param station       - Station to check
 * @param currentValues - Live parameter values
 * @param ranges        - Normal operating ranges
 * @returns Array of { parameter, value, min, max, deviation } for OOR params
 */
export function getOutOfRangeParams(
  _station: StationName,
  currentValues: Record<string, number>,
  ranges: Record<string, ParameterRange>,
): Array<{
  parameter: string;
  value: number;
  min: number;
  max: number;
  deviation: number;
}> {
  const result: Array<{
    parameter: string;
    value: number;
    min: number;
    max: number;
    deviation: number;
  }> = [];

  for (const [paramKey, currentValue] of Object.entries(currentValues)) {
    const range = ranges[paramKey];
    if (!range || typeof currentValue !== 'number') continue;
    if (currentValue >= range.min && currentValue <= range.max) continue;

    /** Absolute distance from nearest boundary. */
    const deviation = currentValue < range.min
      ? range.min - currentValue
      : currentValue - range.max;

    result.push({
      parameter: paramKey,
      value: currentValue,
      min: range.min,
      max: range.max,
      deviation,
    });
  }

  return result;
}

// =============================================================================
// SCRAP CLASSIFICATION — Determines tile outcome from defect types
// =============================================================================

/**
 * classifyDefectOutcome — Given an array of defect types detected on a tile,
 * determines whether the tile should be classified as 'scrap' (structurally
 * unusable) or 'second_quality' (cosmetic/functional imperfections).
 *
 * Classification rules:
 *   1. If ANY defect type is in the SCRAP_DEFECT_TYPES set → 'scrap'
 *   2. Otherwise → 'second_quality'
 *   3. Empty array → 'second_quality' (no defects = no scrap)
 *
 * The SCRAP_DEFECT_TYPES set is configurable in params/scrapConfig.ts.
 *
 * @param types — Array of DefectType values from evaluateStationDefects()
 * @returns 'scrap' if any structural defect present, 'second_quality' otherwise
 */
export function classifyDefectOutcome(
  types: DefectType[],
): 'scrap' | 'second_quality' {
  /** Check if ANY defect type in the array is classified as scrap-worthy. */
  for (const defectType of types) {
    if (SCRAP_DEFECT_TYPES.has(defectType)) {
      return 'scrap';
    }
  }
  /** No scrap-worthy defects found — tile is second quality at worst. */
  return 'second_quality';
}

/**
 * hasWarpDefect — Checks whether a tile's accumulated defect types include
 * any warp/dimensional defect that the Sorting station can detect.
 *
 * Used by ConveyorBelt.tsx at the sorting threshold to auto-scrap warped tiles.
 *
 * @param types — Array of DefectType values from tile passport
 * @returns true if any warp/size defect is present
 */
export function hasWarpDefect(types: DefectType[]): boolean {
  /** Check if ANY defect type in the array is a sorting-detectable warp defect. */
  for (const defectType of types) {
    if (SORTING_WARP_DEFECT_TYPES.has(defectType)) {
      return true;
    }
  }
  return false;
}
