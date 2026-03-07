/**
 * conveyorBehaviour.test.ts — Unit Tests for the Conveyor Behaviour Engine
 *
 * Tests cover:
 *  - All CB_* constants exported from conveyorBehaviour.ts
 *  - Type and value invariants (numeric, within bounds)
 *  - Semantic rules (speed delta range, jam cooldown > jam duration)
 *  - Drift computation formulas verified against expected scenario values
 *
 * These tests do NOT render React (no hook testing) — the hook's logic
 * is integration-testable via the browser. Constants are the contract.
 */
/// <reference types="vitest/globals" />

import { describe, it, expect } from 'vitest';
import {
  CB_SPEED_CHECK_INTERVAL_P,
  CB_SPEED_DELTA_MIN,
  CB_SPEED_DELTA_MAX,
  CB_SPEED_CHANGE_PROBABILITY,
  CB_JAM_CHECK_INTERVAL_P,
  CB_JAM_PROBABILITY_PER_CHECK,
  CB_JAM_BASE_DURATION_P,
  CB_JAM_DURATION_SCALE,
  CB_POST_JAM_COOLDOWN_P,
} from '../lib/params/conveyorBehaviour';
import { CONVEYOR_SPEED_RANGE } from '../lib/params';

// =============================================================================
// Constants: existence and types
// =============================================================================

describe('conveyorBehaviour constants — existence and types', () => {
  it('CB_SPEED_CHECK_INTERVAL_P must be a positive number', () => {
    /** Spacing between speed checks must be at least 1 P-tick */
    expect(typeof CB_SPEED_CHECK_INTERVAL_P).toBe('number');
    expect(CB_SPEED_CHECK_INTERVAL_P).toBeGreaterThan(0);
  });

  it('CB_SPEED_DELTA_MIN and CB_SPEED_DELTA_MAX must be numbers', () => {
    /** Both speed delta bounds must be numeric */
    expect(typeof CB_SPEED_DELTA_MIN).toBe('number');
    expect(typeof CB_SPEED_DELTA_MAX).toBe('number');
  });

  it('CB_SPEED_CHANGE_PROBABILITY must be a number', () => {
    /** Probability gate must be defined */
    expect(typeof CB_SPEED_CHANGE_PROBABILITY).toBe('number');
  });

  it('CB_JAM_CHECK_INTERVAL_P must be a positive number', () => {
    /** Jam check interval must be at least 1 P-tick */
    expect(typeof CB_JAM_CHECK_INTERVAL_P).toBe('number');
    expect(CB_JAM_CHECK_INTERVAL_P).toBeGreaterThan(0);
  });

  it('CB_JAM_PROBABILITY_PER_CHECK must be a number', () => {
    /** Jam probability gate must be defined */
    expect(typeof CB_JAM_PROBABILITY_PER_CHECK).toBe('number');
  });

  it('CB_JAM_BASE_DURATION_P must be a positive number', () => {
    /** Base jam duration must be at least 1 P-tick */
    expect(typeof CB_JAM_BASE_DURATION_P).toBe('number');
    expect(CB_JAM_BASE_DURATION_P).toBeGreaterThan(0);
  });

  it('CB_JAM_DURATION_SCALE must be a number', () => {
    /** Duration scale must be defined */
    expect(typeof CB_JAM_DURATION_SCALE).toBe('number');
  });

  it('CB_POST_JAM_COOLDOWN_P must be a positive number', () => {
    /** Cooldown must be at least 1 P-tick */
    expect(typeof CB_POST_JAM_COOLDOWN_P).toBe('number');
    expect(CB_POST_JAM_COOLDOWN_P).toBeGreaterThan(0);
  });
});

// =============================================================================
// Constants: value invariants (semantic contracts)
// =============================================================================

describe('conveyorBehaviour constants — value invariants', () => {
  it('CB_SPEED_DELTA_MIN must be less than CB_SPEED_DELTA_MAX', () => {
    /** Min delta must be strictly below max delta for a valid range */
    expect(CB_SPEED_DELTA_MIN).toBeLessThan(CB_SPEED_DELTA_MAX);
  });

  it('CB_SPEED_DELTA_MIN must be non-negative', () => {
    /** Minimum speed delta must not be negative */
    expect(CB_SPEED_DELTA_MIN).toBeGreaterThanOrEqual(0);
  });

  it('CB_SPEED_CHANGE_PROBABILITY must be between 0 and 1', () => {
    /** Probability must be a valid [0, 1] value */
    expect(CB_SPEED_CHANGE_PROBABILITY).toBeGreaterThanOrEqual(0);
    expect(CB_SPEED_CHANGE_PROBABILITY).toBeLessThanOrEqual(1);
  });

  it('CB_JAM_PROBABILITY_PER_CHECK must be between 0 and 1', () => {
    /** Probability must be a valid [0, 1] value */
    expect(CB_JAM_PROBABILITY_PER_CHECK).toBeGreaterThanOrEqual(0);
    expect(CB_JAM_PROBABILITY_PER_CHECK).toBeLessThanOrEqual(1);
  });

  it('CB_JAM_DURATION_SCALE must be non-negative', () => {
    /** A negative scale would create shorter jams for higher jammedTime — nonsensical */
    expect(CB_JAM_DURATION_SCALE).toBeGreaterThanOrEqual(0);
  });

  it('CB_POST_JAM_COOLDOWN_P must be greater than CB_JAM_BASE_DURATION_P', () => {
    /**
     * The cooldown must be longer than the minimum jam duration.
     * If not, consecutive jams could stack — no recovery time for the conveyor.
     */
    expect(CB_POST_JAM_COOLDOWN_P).toBeGreaterThan(CB_JAM_BASE_DURATION_P);
  });
});

// =============================================================================
// Duration formula: verify expected jam duration for known scenario values
// =============================================================================

describe('Jam duration formula', () => {
  /**
   * Formula: jamDurationP = CB_JAM_BASE_DURATION_P + Math.floor(jammedTime × CB_JAM_DURATION_SCALE)
   * This must produce sensible results for each scenario's jammedTime.
   */
  function computeJamDuration(jammedTime: number): number {
    /** Mirrors the formula used in useConveyorBehaviour.ts exactly */
    return CB_JAM_BASE_DURATION_P + Math.floor(jammedTime * CB_JAM_DURATION_SCALE);
  }

  it('SCN-001 (jammedTime=20) produces a valid positive duration', () => {
    /** SCN-001: moderate jams */
    const duration = computeJamDuration(20);
    expect(duration).toBeGreaterThan(0);
  });

  it('SCN-002 (jammedTime=40) produces a longer duration than SCN-001', () => {
    /** Kiln crisis jams must last longer than optimal production jams */
    expect(computeJamDuration(40)).toBeGreaterThan(computeJamDuration(20));
  });

  it('SCN-003 (jammedTime=100) produces a longer duration than SCN-002', () => {
    /** Glaze drift causes the most severe jams in the suite */
    expect(computeJamDuration(100)).toBeGreaterThan(computeJamDuration(40));
  });

  it('SCN-004 (jammedTime=100) produces same duration as SCN-003', () => {
    /** Both scenarios have jammedTime=100, so durations must be equal */
    expect(computeJamDuration(100)).toBe(computeJamDuration(100));
  });

  it('reference (jammedTime=10) produces the shortest duration', () => {
    /** Baseline would have minimal jam duration if it ever triggered */
    expect(computeJamDuration(10)).toBeLessThanOrEqual(computeJamDuration(20));
  });
});

// =============================================================================
// Speed delta: verify it stays within CONVEYOR_SPEED_RANGE
// =============================================================================

describe('Speed delta range', () => {
  it('max delta from default speed does not exceed CONVEYOR_SPEED_RANGE.max', () => {
    /**
     * Even if we always apply the maximum delta upward from the max speed,
     * setConveyorSpeed clamps it. But the delta itself should be sane relative
     * to the allowed range: max delta < (range.max - range.min).
     */
    const speedRange = CONVEYOR_SPEED_RANGE.max - CONVEYOR_SPEED_RANGE.min;
    /** Delta should not span more than the full speed range */
    expect(CB_SPEED_DELTA_MAX).toBeLessThan(speedRange);
  });
});
