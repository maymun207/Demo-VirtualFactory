/**
 * energyConfig.test.ts — Unit Tests for Energy Consumption Calculator
 *
 * Tests the calculateConsumption pure function from energyConfig.ts.
 * Verifies behavior across all branches:
 *  - Factory stopped (idle)
 *  - Factory running + occupied vs unoccupied
 *  - Speed below min / at base / above max / interpolated ranges
 *
 * Uses known constant values from params.ts to build expected results.
 */
/// <reference types="vitest/globals" />

import { describe, it, expect } from 'vitest';
import { calculateConsumption } from '../../lib/energyConfig';
import { SPEED_RANGE } from '../../lib/params';
import type { ConsumptionParams } from '../../lib/params';

/**
 * Test fixture: a simple station with known parameters.
 * Chosen for easy mental arithmetic in assertions.
 */
const TEST_PARAMS: ConsumptionParams = {
  /** Base consumption: 100 kWh */
  base: 100,
  /** At min speed: -20% effect → multiplier = 0.8 */
  minEffect: -0.2,
  /** At max speed: +30% effect → multiplier = 1.3 */
  maxEffect: 0.3,
  /** Idle factor: 80% of active consumption */
  idleFactor: 0.8,
};

// =============================================================================
// Factory not running (idle consumption)
// =============================================================================

describe('calculateConsumption — factory stopped', () => {
  it('should return base × idleFactor when factory is not running', () => {
    /**
     * Factory stopped → flat idle consumption regardless of speed or occupancy.
     * Expected: 100 × 0.8 = 80
     */
    const result = calculateConsumption(TEST_PARAMS, SPEED_RANGE.base, true, false);
    expect(result).toBe(80);
  });

  it('should ignore speed when factory is not running', () => {
    /** Speed should have no effect when the factory is stopped */
    const atMin = calculateConsumption(TEST_PARAMS, SPEED_RANGE.min, true, false);
    const atMax = calculateConsumption(TEST_PARAMS, SPEED_RANGE.max, true, false);
    expect(atMin).toBe(80);
    expect(atMax).toBe(80);
  });

  it('should ignore occupancy when factory is not running', () => {
    /** Occupancy should have no effect when the factory is stopped */
    const occupied = calculateConsumption(TEST_PARAMS, SPEED_RANGE.base, true, false);
    const unoccupied = calculateConsumption(TEST_PARAMS, SPEED_RANGE.base, false, false);
    expect(occupied).toBe(unoccupied);
  });
});

// =============================================================================
// Factory running — speed scaling
// =============================================================================

describe('calculateConsumption — speed scaling', () => {
  it('should return base consumption at base speed (multiplier = 1.0)', () => {
    /** At base speed, no speed effect → multiplier = 1.0, consumption = 100 */
    const result = calculateConsumption(TEST_PARAMS, SPEED_RANGE.base, true, true);
    expect(result).toBe(100);
  });

  it('should apply minEffect at minimum speed', () => {
    /**
     * At min speed: multiplier = 1 + minEffect = 1 + (-0.2) = 0.8
     * Consumption = 100 × 0.8 = 80
     */
    const result = calculateConsumption(TEST_PARAMS, SPEED_RANGE.min, true, true);
    expect(result).toBeCloseTo(80, 1);
  });

  it('should apply maxEffect at maximum speed', () => {
    /**
     * At max speed: multiplier = 1 + maxEffect = 1 + 0.3 = 1.3
     * Consumption = 100 × 1.3 = 130
     */
    const result = calculateConsumption(TEST_PARAMS, SPEED_RANGE.max, true, true);
    expect(result).toBeCloseTo(130, 1);
  });

  it('should interpolate between min and base speed', () => {
    /** Midpoint between min and base → should be between min and base consumption */
    const midSpeed = (SPEED_RANGE.min + SPEED_RANGE.base) / 2;
    const result = calculateConsumption(TEST_PARAMS, midSpeed, true, true);
    /** Should be between 80 (at min) and 100 (at base) */
    expect(result).toBeGreaterThan(80);
    expect(result).toBeLessThan(100);
  });

  it('should interpolate between base and max speed', () => {
    /** Midpoint between base and max → should be between base and max consumption */
    const midSpeed = (SPEED_RANGE.base + SPEED_RANGE.max) / 2;
    const result = calculateConsumption(TEST_PARAMS, midSpeed, true, true);
    /** Should be between 100 (at base) and 130 (at max) */
    expect(result).toBeGreaterThan(100);
    expect(result).toBeLessThan(130);
  });

  it('should apply minEffect for speeds at or below minimum', () => {
    /** Speed below minimum should still use minEffect (clamped) */
    const result = calculateConsumption(TEST_PARAMS, SPEED_RANGE.min - 1, true, true);
    expect(result).toBeCloseTo(80, 1);
  });

  it('should apply maxEffect for speeds at or above maximum', () => {
    /** Speed above maximum should still use maxEffect (clamped) */
    const result = calculateConsumption(TEST_PARAMS, SPEED_RANGE.max + 1, true, true);
    expect(result).toBeCloseTo(130, 1);
  });
});

// =============================================================================
// Occupancy effect (running, occupied vs unoccupied)
// =============================================================================

describe('calculateConsumption — occupancy', () => {
  it('should return full consumption when occupied', () => {
    /** Occupied station → full baseWithSpeed consumption */
    const result = calculateConsumption(TEST_PARAMS, SPEED_RANGE.base, true, true);
    expect(result).toBe(100);
  });

  it('should return baseWithSpeed × idleFactor when unoccupied', () => {
    /** Unoccupied station → baseWithSpeed × idleFactor = 100 × 0.8 = 80 */
    const result = calculateConsumption(TEST_PARAMS, SPEED_RANGE.base, false, true);
    expect(result).toBeCloseTo(80, 1);
  });

  it('should always have occupied ≥ unoccupied consumption', () => {
    /** Running factory: occupied should always consume ≥ unoccupied (idleFactor ≤ 1) */
    const speeds = [SPEED_RANGE.min, SPEED_RANGE.base, SPEED_RANGE.max];
    for (const speed of speeds) {
      const occupied = calculateConsumption(TEST_PARAMS, speed, true, true);
      const unoccupied = calculateConsumption(TEST_PARAMS, speed, false, true);
      expect(occupied).toBeGreaterThanOrEqual(unoccupied);
    }
  });
});
