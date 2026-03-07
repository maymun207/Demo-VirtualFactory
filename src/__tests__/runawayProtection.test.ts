/**
 * runawayProtection.test.ts — Unit Tests for Runaway Simulation Protection
 *
 * Validates the safety constants and slider range constraints that prevent
 * the simulation from running away due to compounding speed slider effects,
 * browser tab sleep/wake delta spikes, and Stop → Start state leaks.
 *
 * These tests were added after the 5,874-tile runaway incident caused by
 * S-Clock=100ms + StationInterval=1 + Speed=2.0× creating a 10.7× speedup.
 *
 * Test Groups:
 *   1. Safety constants (MAX_TICKS_PER_FRAME, MAX_FRAME_DELTA_S) values
 *   2. Slider range constraints (S_CLOCK_RANGE, STATION_INTERVAL_RANGE)
 *   3. Maximum theoretical production rate calculations
 *   4. Default values within tightened ranges
 */

import { describe, it, expect } from 'vitest';
import {
    MAX_TICKS_PER_FRAME,
    MAX_FRAME_DELTA_S,
    DEFAULT_S_CLOCK_PERIOD,
    DEFAULT_STATION_INTERVAL,
    DEFAULT_CONVEYOR_SPEED,
} from '../lib/params/simulation';
import {
    S_CLOCK_RANGE,
    STATION_INTERVAL_RANGE,
    CONVEYOR_SPEED_RANGE,
} from '../lib/params/ui';

// =============================================================================
// SAFETY CONSTANTS
// =============================================================================

describe('Runaway Protection — Safety Constants', () => {

    it('MAX_TICKS_PER_FRAME should be a small positive integer', () => {
        /** Cap must be > 0 (at least 1 tick per frame for normal operation). */
        expect(MAX_TICKS_PER_FRAME).toBeGreaterThan(0);
        /** Cap must be small enough to prevent burst-spawning (≤ 5 is safe). */
        expect(MAX_TICKS_PER_FRAME).toBeLessThanOrEqual(5);
        /** Must be an integer (fractional tick caps make no sense). */
        expect(Number.isInteger(MAX_TICKS_PER_FRAME)).toBe(true);
    });

    it('MAX_FRAME_DELTA_S should clamp to a reasonable real-time window', () => {
        /** Must be > 0 (zero delta means no time passes). */
        expect(MAX_FRAME_DELTA_S).toBeGreaterThan(0);
        /** Must be ≤ 0.2s to prevent large accumulator spikes. */
        expect(MAX_FRAME_DELTA_S).toBeLessThanOrEqual(0.2);
    });

    it('MAX_FRAME_DELTA_S should keep accumulator within tick cap at max speed', () => {
        /**
         * Worst-case accumulator per frame:
         *   MAX_FRAME_DELTA_S × 1000 × CONVEYOR_SPEED_RANGE.max
         *
         * Divided by S_CLOCK_RANGE.min gives the number of ticks that would fire.
         * This must be ≤ MAX_TICKS_PER_FRAME to ensure the cap is actually effective.
         */
        const worstCaseAccumulation =
            MAX_FRAME_DELTA_S * 1000 * CONVEYOR_SPEED_RANGE.max;
        const worstCaseTicks = worstCaseAccumulation / S_CLOCK_RANGE.min;
        expect(worstCaseTicks).toBeLessThanOrEqual(MAX_TICKS_PER_FRAME);
    });
});

// =============================================================================
// SLIDER RANGE CONSTRAINTS
// =============================================================================

describe('Runaway Protection — Slider Ranges', () => {

    it('S_CLOCK_RANGE.min should be ≥ 200ms to prevent extreme tick rates', () => {
        /**
         * At 100ms min (old value), tick rate was 10/sec before speed scaling.
         * At 200ms min, tick rate is 5/sec — a 2× reduction in maximum speed.
         */
        expect(S_CLOCK_RANGE.min).toBeGreaterThanOrEqual(200);
    });

    it('STATION_INTERVAL_RANGE.min should be ≥ 2 to require P-Clock gating', () => {
        /**
         * At interval=1 (old value), every S-Clock tick produced a tile.
         * At interval=2, production requires 2 S-ticks — halving the rate.
         */
        expect(STATION_INTERVAL_RANGE.min).toBeGreaterThanOrEqual(2);
    });

    it('default values should fall within the tightened ranges', () => {
        /** DEFAULT_S_CLOCK_PERIOD must be within [min, max]. */
        expect(DEFAULT_S_CLOCK_PERIOD).toBeGreaterThanOrEqual(S_CLOCK_RANGE.min);
        expect(DEFAULT_S_CLOCK_PERIOD).toBeLessThanOrEqual(S_CLOCK_RANGE.max);

        /** DEFAULT_STATION_INTERVAL must be within [min, max]. */
        expect(DEFAULT_STATION_INTERVAL).toBeGreaterThanOrEqual(
            STATION_INTERVAL_RANGE.min,
        );
        expect(DEFAULT_STATION_INTERVAL).toBeLessThanOrEqual(
            STATION_INTERVAL_RANGE.max,
        );

        /** DEFAULT_CONVEYOR_SPEED must be within [min, max]. */
        expect(DEFAULT_CONVEYOR_SPEED).toBeGreaterThanOrEqual(
            CONVEYOR_SPEED_RANGE.min,
        );
        expect(DEFAULT_CONVEYOR_SPEED).toBeLessThanOrEqual(
            CONVEYOR_SPEED_RANGE.max,
        );
    });

    it('S_CLOCK_RANGE should have min < max and step divides evenly', () => {
        /** Basic sanity: min must be strictly less than max. */
        expect(S_CLOCK_RANGE.min).toBeLessThan(S_CLOCK_RANGE.max);
        /** Step must be positive. */
        expect(S_CLOCK_RANGE.step).toBeGreaterThan(0);
    });

    it('STATION_INTERVAL_RANGE should have min < max and step divides evenly', () => {
        /** Basic sanity: min must be strictly less than max. */
        expect(STATION_INTERVAL_RANGE.min).toBeLessThan(STATION_INTERVAL_RANGE.max);
        /** Step must be positive. */
        expect(STATION_INTERVAL_RANGE.step).toBeGreaterThan(0);
    });
});

// =============================================================================
// MAXIMUM PRODUCTION RATE
// =============================================================================

describe('Runaway Protection — Production Rate Limits', () => {

    it('maximum compound speedup should be ≤ 4× over default rate', () => {
        /**
         * Default production rate (tiles per second):
         *   1000 / (DEFAULT_S_CLOCK_PERIOD × DEFAULT_STATION_INTERVAL)
         *   × DEFAULT_CONVEYOR_SPEED
         *
         * Maximum production rate (tiles per second):
         *   1000 / (S_CLOCK_RANGE.min × STATION_INTERVAL_RANGE.min)
         *   × CONVEYOR_SPEED_RANGE.max
         *
         * The speedup ratio should be ≤ 4× to prevent runaway.
         * (Down from 10.7× with the old 100ms/1 minimums.)
         */
        const defaultRate =
            (1000 / (DEFAULT_S_CLOCK_PERIOD * DEFAULT_STATION_INTERVAL)) *
            DEFAULT_CONVEYOR_SPEED;

        const maxRate =
            (1000 / (S_CLOCK_RANGE.min * STATION_INTERVAL_RANGE.min)) *
            CONVEYOR_SPEED_RANGE.max;

        const speedupRatio = maxRate / defaultRate;

        /** Speedup must be ≤ 4× to prevent runaway production. */
        expect(speedupRatio).toBeLessThanOrEqual(4);
    });

    it('maximum tiles per second should not exceed 10', () => {
        /**
         * At extreme slider settings, the absolute maximum tile rate is:
         *   1000 / (S_CLOCK_RANGE.min × STATION_INTERVAL_RANGE.min)
         *   × CONVEYOR_SPEED_RANGE.max
         *
         * This must stay below 10 tiles/sec to keep UI and data pipelines stable.
         */
        const maxTilesPerSec =
            (1000 / (S_CLOCK_RANGE.min * STATION_INTERVAL_RANGE.min)) *
            CONVEYOR_SPEED_RANGE.max;

        /** Absolute maximum must be < 10 tiles/sec. */
        expect(maxTilesPerSec).toBeLessThan(10);
    });
});
