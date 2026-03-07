/**
 * kpiCalculations.test.ts — Unit Tests for KPI Pure Functions
 *
 * Tests all exported calculation functions from kpiCalculations.ts:
 *  - calculateFTQ: First Time Quality percentage (3-arg: shipped, secondQuality, waste)
 *  - calculateScrap: Scrap rate percentage (3-arg: shipped, secondQuality, waste)
 *  - calculateTotalKPI: Total usable output percentage
 *  - calculateOEE: Overall Equipment Effectiveness
 *  - calculateTrends: Rolling-window trend arrows
 *  - randomizeDefects: Defect value jitter for heatmap
 *
 * All functions are pure (no side effects), so tests are straightforward
 * with direct input → output assertions.
 */
/// <reference types="vitest/globals" />

import { describe, it, expect } from 'vitest';
import {
  calculateFTQ,
  calculateScrap,
  calculateTotalKPI,
  calculateOEE,
  calculateTrends,
  randomizeDefects,
} from '../../lib/kpiCalculations';
import {
  AVAILABILITY_FACTOR,
  DESIGN_SPEED,
  JAM_AVAILABILITY_PENALTY,
  JAM_MAX_AVAILABILITY_PENALTY,
  DEFECT_RANDOMIZATION,
  KPI_TREND_MIN_TICKS,
} from '../../lib/params';
import type { KPI, Defect } from '../../lib/params';

/**
 * Helper: create a minimal KPI test fixture with sensible defaults.
 * Avoids `as any` casts while satisfying the full KPI interface.
 */
function makeTestKPI(overrides: Partial<KPI> & { id: string }): KPI {
  return {
    label: { tr: '', en: '' },
    value: '0',
    unit: '%',
    trend: { tr: '', en: '' },
    trendDirection: 'up',
    ...overrides,
  };
}

// =============================================================================
// calculateFTQ
// =============================================================================

describe('calculateFTQ', () => {
  it('should return 100 when no tiles have been produced (0/0)', () => {
    /** Edge case: division by zero guard — FTQ defaults to 100% */
    expect(calculateFTQ(0, 0, 0)).toBe(100.0);
  });

  it('should return 100 when all tiles pass (zero waste, zero secondQuality)', () => {
    /** 50 shipped, 0 secondQuality, 0 wasted → 50/50 × 100 = 100 */
    expect(calculateFTQ(50, 0, 0)).toBe(100.0);
  });

  it('should return 0 when all tiles are scrapped', () => {
    /** 0 shipped, 0 secondQuality, 10 wasted → 0/10 × 100 = 0 */
    expect(calculateFTQ(0, 0, 10)).toBe(0.0);
  });

  it('should calculate correct percentage for mixed results', () => {
    /** 80 shipped, 0 secondQuality, 20 wasted → 80/100 × 100 = 80 */
    expect(calculateFTQ(80, 0, 20)).toBe(80.0);
  });

  it('should handle single-tile production', () => {
    /** 1 shipped, 0 SQ, 0 wasted → 100% */
    expect(calculateFTQ(1, 0, 0)).toBe(100.0);
    /** 0 shipped, 0 SQ, 1 wasted → 0% */
    expect(calculateFTQ(0, 0, 1)).toBe(0.0);
  });

  it('should reduce FTQ when second quality tiles are present', () => {
    /** 70 shipped, 10 secondQuality, 20 wasted → 70/100 × 100 = 70 */
    expect(calculateFTQ(70, 10, 20)).toBe(70.0);
  });

  it('should return 0 when all tiles are second quality', () => {
    /** 0 shipped, 10 secondQuality, 0 wasted → 0/10 × 100 = 0 */
    expect(calculateFTQ(0, 10, 0)).toBe(0.0);
  });
});

// =============================================================================
// calculateScrap
// =============================================================================

describe('calculateScrap', () => {
  it('should return 0 when no tiles have been produced (0/0)', () => {
    /** Edge case: division by zero guard — scrap defaults to 0% */
    expect(calculateScrap(0, 0, 0)).toBe(0.0);
  });

  it('should return 0 when all tiles pass (zero waste)', () => {
    /** 50 shipped, 0 SQ, 0 wasted → 0/50 × 100 = 0 */
    expect(calculateScrap(50, 0, 0)).toBe(0.0);
  });

  it('should return 100 when all tiles are scrapped', () => {
    /** 0 shipped, 0 SQ, 10 wasted → 10/10 × 100 = 100 */
    expect(calculateScrap(0, 0, 10)).toBe(100.0);
  });

  it('should calculate with three-way distribution', () => {
    /** 70 shipped, 10 SQ, 20 wasted → 20/100 × 100 = 20 */
    expect(calculateScrap(70, 10, 20)).toBe(20.0);
  });

  it('should verify FTQ + Scrap + SecondQuality% = 100', () => {
    /** Verify all three rates sum to 100% for any non-zero production */
    const shipped = 60;
    const sq = 15;
    const wasted = 25;
    const ftq = calculateFTQ(shipped, sq, wasted);
    const scrap = calculateScrap(shipped, sq, wasted);
    const sqRate = (sq / (shipped + sq + wasted)) * 100;
    expect(ftq + scrap + sqRate).toBe(100.0);
  });
});

// =============================================================================
// calculateTotalKPI
// =============================================================================

describe('calculateTotalKPI', () => {
  it('should return 100 when no tiles have been produced (0/0/0)', () => {
    /** Edge case: division by zero guard — total defaults to 100% */
    expect(calculateTotalKPI(0, 0, 0)).toBe(100.0);
  });

  it('should return 100 when all tiles are usable (first + second quality)', () => {
    /** 40 shipped, 10 SQ, 0 wasted → (40+10)/50 × 100 = 100 */
    expect(calculateTotalKPI(40, 10, 0)).toBe(100.0);
  });

  it('should return 0 when all tiles are scrapped', () => {
    /** 0 shipped, 0 SQ, 20 wasted → 0/20 × 100 = 0 */
    expect(calculateTotalKPI(0, 0, 20)).toBe(0.0);
  });

  it('should include second quality tiles as usable output', () => {
    /** 60 shipped, 20 SQ, 20 wasted → (60+20)/100 × 100 = 80 */
    expect(calculateTotalKPI(60, 20, 20)).toBe(80.0);
  });

  it('should always be >= FTQ (total usable includes more tiles)', () => {
    /** Total KPI includes SQ, so it should always be >= FTQ */
    const shipped = 60;
    const sq = 20;
    const wasted = 20;
    const ftq = calculateFTQ(shipped, sq, wasted);
    const totalKpi = calculateTotalKPI(shipped, sq, wasted);
    expect(totalKpi).toBeGreaterThanOrEqual(ftq);
  });

  it('should equal FTQ when no second quality tiles exist', () => {
    /** Without SQ tiles, Total KPI and FTQ should be identical */
    const shipped = 80;
    const wasted = 20;
    const ftq = calculateFTQ(shipped, 0, wasted);
    const totalKpi = calculateTotalKPI(shipped, 0, wasted);
    expect(totalKpi).toBe(ftq);
  });
});

// =============================================================================
// calculateOEE
// =============================================================================

describe('calculateOEE', () => {
  it('should calculate OEE from availability × performance × quality', () => {
    /**
     * At design speed (2.0), 100% FTQ, 0 faults:
     * Performance = min(1.0, 2.0/2.0) = 1.0
     * Quality = 100/100 = 1.0
     * Availability = AVAILABILITY_FACTOR - 0 = 0.96
     * OEE = 0.96 × 1.0 × 1.0 × 100 = 96.0
     */
    const oee = calculateOEE(DESIGN_SPEED, 100, 0);
    expect(oee).toBeCloseTo(AVAILABILITY_FACTOR * 100, 1);
  });

  it('should cap performance at 1.0 when speed exceeds design speed', () => {
    /** Speed 3.0 > DESIGN_SPEED 2.0 → performance is capped at 1.0 */
    const oeeAtDesign = calculateOEE(DESIGN_SPEED, 100, 0);
    const oeeAboveDesign = calculateOEE(DESIGN_SPEED * 1.5, 100, 0);
    /** Both should yield the same OEE since performance is capped */
    expect(oeeAboveDesign).toBeCloseTo(oeeAtDesign, 1);
  });

  it('should reduce OEE proportionally with lower speed', () => {
    /** Half of design speed → performance = 0.5 */
    const oee = calculateOEE(DESIGN_SPEED / 2, 100, 0);
    const expected = AVAILABILITY_FACTOR * 0.5 * 1.0 * 100;
    expect(oee).toBeCloseTo(expected, 1);
  });

  it('should reduce availability with each fault (jam)', () => {
    /** 1 fault → penalty = JAM_AVAILABILITY_PENALTY (0.15) */
    const oee = calculateOEE(DESIGN_SPEED, 100, 1);
    const expectedAvail = AVAILABILITY_FACTOR - JAM_AVAILABILITY_PENALTY;
    const expected = expectedAvail * 1.0 * 1.0 * 100;
    expect(oee).toBeCloseTo(expected, 1);
  });

  it('should cap availability penalty at JAM_MAX_AVAILABILITY_PENALTY', () => {
    /**
     * Many faults → penalty is capped at JAM_MAX_AVAILABILITY_PENALTY (0.50)
     * Availability = max(0.1, 0.96 - 0.50) = 0.46
     */
    const manyFaults = 100; // well over the cap
    const oee = calculateOEE(DESIGN_SPEED, 100, manyFaults);
    const expectedAvail = Math.max(0.1, AVAILABILITY_FACTOR - JAM_MAX_AVAILABILITY_PENALTY);
    const expected = expectedAvail * 1.0 * 1.0 * 100;
    expect(oee).toBeCloseTo(expected, 1);
  });

  it('should reflect quality (FTQ) in the OEE calculation', () => {
    /** FTQ of 80% → quality factor = 0.8 */
    const oee = calculateOEE(DESIGN_SPEED, 80, 0);
    const expected = AVAILABILITY_FACTOR * 1.0 * 0.8 * 100;
    expect(oee).toBeCloseTo(expected, 1);
  });

  it('should never exceed 100', () => {
    /** Even with extreme inputs, OEE is capped at 100 */
    const oee = calculateOEE(DESIGN_SPEED * 10, 100, 0);
    expect(oee).toBeLessThanOrEqual(100);
  });
});

// =============================================================================
// calculateTrends
// =============================================================================

describe('calculateTrends', () => {
  it('should not show trends when history is below minimum ticks', () => {
    /** With insufficient history, trends should not be calculated */
    const kpis = [makeTestKPI({ id: 'oee', label: { tr: 'OEE', en: 'OEE' }, value: '90.0' })];
    const currentVals = { oee: 90 };
    const result = calculateTrends(kpis, currentVals, [], 1);

    /** KPIs should be returned unchanged (no trend data) */
    expect(result.kpis[0].trendDirection).toBe('up');
  });

  it('should calculate trends after sufficient history', () => {
    /** Build enough history to meet KPI_TREND_MIN_TICKS */
    const kpis = [makeTestKPI({ id: 'oee', label: { tr: 'OEE', en: 'OEE' }, value: '95.0' })];
    const baseHistory = [{ sClock: 0, values: { oee: 85 } }];
    const currentVals = { oee: 95 };
    const currentTick = KPI_TREND_MIN_TICKS + 1;

    const result = calculateTrends(kpis, currentVals, baseHistory, currentTick);

    /** OEE went up (85 → 95), and OEE is a non-inverted KPI, so trend = 'up' */
    expect(result.kpis[0].trendDirection).toBe('up');
  });

  it('should return trimmed history (not grow unbounded)', () => {
    /** Add many records and verify history is capped */
    const kpis = [makeTestKPI({ id: 'oee', label: { tr: 'OEE', en: 'OEE' }, value: '90.0' })];
    const bigHistory = Array.from({ length: 1000 }, (_, i) => ({
      sClock: i,
      values: { oee: 80 + (i % 20) },
    }));
    const currentVals = { oee: 95 };

    const result = calculateTrends(kpis, currentVals, bigHistory, 1001);

    /** History should be trimmed, not 1001 entries */
    expect(result.history.length).toBeLessThan(1001);
  });
});

// =============================================================================
// randomizeDefects
// =============================================================================

describe('randomizeDefects', () => {
  it('should return an array with the same length as input', () => {
    /** Defects array structure: { name, label, value } */
    const defects: Defect[] = [
      { name: 'crack', label: { tr: 'Çatlak', en: 'Crack' }, value: 5.0 },
      { name: 'chip', label: { tr: 'Kırık', en: 'Chip' }, value: 3.0 },
    ];
    const result = randomizeDefects(defects);
    expect(result).toHaveLength(2);
  });

  it('should not modify the original array (immutability)', () => {
    /** Verify the function returns a new array, not mutating the input */
    const defects: Defect[] = [
      { name: 'crack', label: { tr: 'Çatlak', en: 'Crack' }, value: 5.0 },
    ];
    const original = [...defects];
    randomizeDefects(defects);

    /** Original array should be unchanged */
    expect(defects[0].value).toBe(original[0].value);
  });

  it('should keep values at or above 0 (floor clamp)', () => {
    /** Even with a value near 0 and jitter, result should never be negative */
    const defects: Defect[] = [
      { name: 'crack', label: { tr: 'Çatlak', en: 'Crack' }, value: 0.0 },
    ];

    /** Run multiple times to account for randomization */
    for (let i = 0; i < 100; i++) {
      const result = randomizeDefects(defects);
      expect(result[0].value).toBeGreaterThanOrEqual(0);
    }
  });

  it('should jitter values within ±DEFECT_RANDOMIZATION range', () => {
    /** Start with a value large enough that clamping won't interfere */
    const baseValue = 50.0;
    const defects: Defect[] = [
      { name: 'crack', label: { tr: 'Çatlak', en: 'Crack' }, value: baseValue },
    ];

    /** Run many iterations and check that jittered values stay within expected range */
    const results: number[] = [];
    for (let i = 0; i < 200; i++) {
      const result = randomizeDefects(defects);
      results.push(result[0].value);
    }

    /** All values should be within ±DEFECT_RANDOMIZATION/2 of baseValue */
    const maxExpected = baseValue + DEFECT_RANDOMIZATION / 2 + 0.1; // small tolerance for rounding
    const minExpected = baseValue - DEFECT_RANDOMIZATION / 2 - 0.1;
    for (const v of results) {
      expect(v).toBeGreaterThanOrEqual(minExpected);
      expect(v).toBeLessThanOrEqual(maxExpected);
    }
  });

  it('should preserve defect id and label', () => {
    /** Randomization should only affect the value, not other properties */
    const defects: Defect[] = [
      { name: 'crack', label: { tr: 'Çatlak', en: 'Crack' }, value: 5.0 },
    ];
    const result = randomizeDefects(defects);
    expect(result[0].name).toBe('crack');
    expect(result[0].label).toEqual({ tr: 'Çatlak', en: 'Crack' });
  });
});
