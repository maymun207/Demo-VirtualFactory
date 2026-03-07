/**
 * defectEngine.test.ts — Unit Tests for the Parameter-Driven Defect Engine
 *
 * Tests the pure function `evaluateStationDefects()` from defectEngine.ts.
 * Covers: all params in range, single OOR param, random roll logic,
 * multiple OOR params, severity calculation, and multi-station accumulation.
 *
 * Uses vi.spyOn(Math, 'random') to control random outcomes for deterministic tests.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { evaluateStationDefects, getOutOfRangeParams } from '../lib/defectEngine';
import type { ParameterRange } from '../lib/params/parameterRanges';

// =============================================================================
// TEST DATA — Mock station params and ranges
// =============================================================================

/** Press station ranges (subset for testing). */
const PRESS_RANGES: Record<string, ParameterRange> = {
  pressure_bar:       { min: 280, max: 450 },
  cycle_time_sec:     { min: 4,   max: 8 },
  mold_temperature_c: { min: 40,  max: 60 },
  powder_moisture_pct:{ min: 5,   max: 7 },
  fill_amount_g:      { min: 800, max: 2500 },
  mold_wear_pct:      { min: 0,   max: 30 },
};

/** Kiln station ranges (subset for testing). */
const KILN_RANGES: Record<string, ParameterRange> = {
  max_temperature_c:        { min: 1100, max: 1220 },
  firing_time_min:          { min: 35,   max: 60 },
  preheat_gradient_c_min:   { min: 15,   max: 40 },
  cooling_gradient_c_min:   { min: 20,   max: 50 },
  belt_speed_m_min:         { min: 1,    max: 3 },
  atmosphere_pressure_mbar: { min: -0.5, max: 0.5 },
  o2_level_pct:             { min: 2,    max: 8 },
};

/** Optimal press params — all within range. */
const OPTIMAL_PRESS_PARAMS: Record<string, number> = {
  pressure_bar:       365,
  cycle_time_sec:     6,
  mold_temperature_c: 50,
  powder_moisture_pct:6,
  fill_amount_g:      1650,
  mold_wear_pct:      10,
};

/** Drifted press params — pressure_bar below range. */
const DRIFTED_PRESS_PARAMS: Record<string, number> = {
  pressure_bar:       260,  // Below min 280
  cycle_time_sec:     6,
  mold_temperature_c: 50,
  powder_moisture_pct:6,
  fill_amount_g:      1650,
  mold_wear_pct:      10,
};

/** Severely drifted kiln params — multiple out of range. */
const DRIFTED_KILN_PARAMS: Record<string, number> = {
  max_temperature_c:        1238,  // Above max 1220
  firing_time_min:          62,    // Above max 60
  preheat_gradient_c_min:   45,    // Above max 40
  cooling_gradient_c_min:   55,    // Above max 50
  belt_speed_m_min:         0.8,   // Below min 1
  atmosphere_pressure_mbar: 0.8,   // Above max 0.5
  o2_level_pct:             1.5,   // Below min 2
};

// =============================================================================
// TESTS
// =============================================================================

describe('evaluateStationDefects', () => {
  let randomSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    /** Spy on Math.random for deterministic tests. */
    randomSpy = vi.spyOn(Math, 'random');
  });

  afterEach(() => {
    randomSpy.mockRestore();
  });

  // ── Scenario: All parameters in range ──
  it('should return detected=false when all parameters are within range', () => {
    /** Force random to always return 0 (would succeed roll). */
    randomSpy.mockReturnValue(0);

    const result = evaluateStationDefects('press', OPTIMAL_PRESS_PARAMS, PRESS_RANGES);

    expect(result.detected).toBe(false);
    expect(result.types).toHaveLength(0);
    expect(result.severity).toBe(0);
    expect(result.outOfRangeParams).toHaveLength(0);
  });

  // ── Scenario: One param OOR + roll succeeds (< 0.20) ──
  it('should detect defect when one param is OOR and roll succeeds', () => {
    /** Return 0.1 — below 0.20 threshold → roll succeeds. */
    randomSpy.mockReturnValue(0.1);

    const result = evaluateStationDefects('press', DRIFTED_PRESS_PARAMS, PRESS_RANGES);

    expect(result.detected).toBe(true);
    expect(result.types.length).toBeGreaterThanOrEqual(1);
    expect(result.outOfRangeParams).toContain('pressure_bar');
    expect(result.severity).toBeGreaterThan(0);
  });

  // ── Scenario: One param OOR + roll fails (>= 0.20) ──
  it('should NOT detect defect when one param is OOR but roll fails', () => {
    /** Return 0.5 — above 0.20 threshold → roll fails. */
    randomSpy.mockReturnValue(0.5);

    const result = evaluateStationDefects('press', DRIFTED_PRESS_PARAMS, PRESS_RANGES);

    /** outOfRangeParams still recorded, but no defect fired. */
    expect(result.detected).toBe(false);
    expect(result.types).toHaveLength(0);
    expect(result.outOfRangeParams).toContain('pressure_bar');
  });

  // ── Scenario: Multiple params OOR ──
  it('should accumulate defect types from multiple OOR parameters', () => {
    /** All rolls succeed. */
    randomSpy.mockReturnValue(0.05);

    const result = evaluateStationDefects('kiln', DRIFTED_KILN_PARAMS, KILN_RANGES);

    expect(result.detected).toBe(true);
    /** Should have multiple out-of-range params. */
    expect(result.outOfRangeParams.length).toBeGreaterThan(1);
    /** Should accumulate defect types from multiple cause-effect entries. */
    expect(result.types.length).toBeGreaterThanOrEqual(1);
  });

  // ── Scenario: Custom defect chance ──
  it('should respect custom defectChance parameter', () => {
    /** Return 0.05 — below custom 0.10 threshold → roll succeeds. */
    randomSpy.mockReturnValue(0.05);

    const result = evaluateStationDefects(
      'press', DRIFTED_PRESS_PARAMS, PRESS_RANGES, 0.10,
    );
    expect(result.detected).toBe(true);

    /** Return 0.15 — above custom 0.10 threshold → roll fails. */
    randomSpy.mockReturnValue(0.15);
    const result2 = evaluateStationDefects(
      'press', DRIFTED_PRESS_PARAMS, PRESS_RANGES, 0.10,
    );
    expect(result2.detected).toBe(false);
  });

  // ── Scenario: Severity proportional to deviation ──
  it('should calculate severity proportional to deviation distance', () => {
    randomSpy.mockReturnValue(0.05);

    /** Small deviation: pressure_bar = 270 (10 below min 280, span = 170). */
    const smallDrift = { ...OPTIMAL_PRESS_PARAMS, pressure_bar: 270 };
    const resultSmall = evaluateStationDefects('press', smallDrift, PRESS_RANGES);

    /** Large deviation: pressure_bar = 100 (180 below min 280, span = 170). */
    const largeDrift = { ...OPTIMAL_PRESS_PARAMS, pressure_bar: 100 };
    const resultLarge = evaluateStationDefects('press', largeDrift, PRESS_RANGES);

    if (resultSmall.detected && resultLarge.detected) {
      expect(resultLarge.severity).toBeGreaterThan(resultSmall.severity);
    }
  });

  // ── Scenario: Severity capped at 1.0 ──
  it('should cap severity at 1.0 even for extreme deviations', () => {
    randomSpy.mockReturnValue(0.05);

    /** Extreme deviation: pressure_bar = 0 (280 below min, far exceeds span). */
    const extremeDrift = { ...OPTIMAL_PRESS_PARAMS, pressure_bar: 0 };
    const result = evaluateStationDefects('press', extremeDrift, PRESS_RANGES);

    if (result.detected) {
      expect(result.severity).toBeLessThanOrEqual(1.0);
    }
  });

  // ── Scenario: Non-numeric values ignored ──
  it('should skip non-numeric parameter values gracefully', () => {
    randomSpy.mockReturnValue(0.05);

    /** Pass a parameter with string value (simulating edge case). */
    const mixedParams = { ...OPTIMAL_PRESS_PARAMS, pressure_bar: 'invalid' as unknown as number };
    const result = evaluateStationDefects('press', mixedParams, PRESS_RANGES);

    /** Should not crash, and pressure_bar is skipped. */
    expect(result.detected).toBe(false);
  });
});

// =============================================================================
// getOutOfRangeParams utility tests
// =============================================================================

describe('getOutOfRangeParams', () => {
  it('should return empty array when all params are in range', () => {
    const result = getOutOfRangeParams('press', OPTIMAL_PRESS_PARAMS, PRESS_RANGES);
    expect(result).toHaveLength(0);
  });

  it('should return OOR params with correct deviation', () => {
    const result = getOutOfRangeParams('press', DRIFTED_PRESS_PARAMS, PRESS_RANGES);

    expect(result.length).toBeGreaterThanOrEqual(1);
    const pressureEntry = result.find(r => r.parameter === 'pressure_bar');
    expect(pressureEntry).toBeDefined();
    if (pressureEntry) {
      /** pressure_bar = 260, min = 280 → deviation = 20. */
      expect(pressureEntry.deviation).toBe(20);
      expect(pressureEntry.min).toBe(280);
      expect(pressureEntry.max).toBe(450);
    }
  });

  it('should detect multiple OOR params in kiln crisis', () => {
    const result = getOutOfRangeParams('kiln', DRIFTED_KILN_PARAMS, KILN_RANGES);
    /** All 7 kiln params are OOR in the drifted set. */
    expect(result.length).toBe(7);
  });
});
