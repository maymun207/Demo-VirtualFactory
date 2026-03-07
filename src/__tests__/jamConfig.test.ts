/**
 * jamConfig.test.ts — Unit Tests for Station-Specific Jam Configuration
 *
 * Tests the jam location type system, probability weights, t-positions,
 * display names, and helper functions (selectJamLocation, isQueueStation).
 *
 * These tests verify that:
 *  1. JAM_LOCATION_WEIGHTS probabilities sum to 1.0 (±epsilon)
 *  2. Kiln and Dryer have ~40% weight each
 *  3. selectJamLocation returns valid JamLocation values
 *  4. isQueueStation correctly identifies dryer and kiln
 *  5. All stations have t-positions, display names, and weights
 *  6. T-positions are within valid [0, 0.5] range
 *  7. The weighted random selection is statistically reasonable
 */
import { describe, it, expect } from 'vitest';
import {
    JAM_LOCATIONS,
    JAM_LOCATION_WEIGHTS,
    JAM_LOCATION_T_POSITIONS,
    JAM_LOCATION_DISPLAY_NAMES,
    JAM_INTERCEPT_TOLERANCE,
    selectJamLocation,
    isQueueStation,
} from '../lib/params/jamConfig';
import type { JamLocation } from '../lib/params/jamConfig';

describe('jamConfig — Station-Specific Jam Configuration', () => {
    // ── Constants & Coverage ─────────────────────────────────────────

    it('JAM_LOCATIONS contains all 8 expected locations', () => {
        /** Verifies the complete set of jam-eligible locations */
        expect(JAM_LOCATIONS).toHaveLength(8);
        expect(JAM_LOCATIONS).toContain('press');
        expect(JAM_LOCATIONS).toContain('dryer');
        expect(JAM_LOCATIONS).toContain('glaze');
        expect(JAM_LOCATIONS).toContain('digital_print');
        expect(JAM_LOCATIONS).toContain('kiln');
        expect(JAM_LOCATIONS).toContain('sorting');
        expect(JAM_LOCATIONS).toContain('packaging');
        expect(JAM_LOCATIONS).toContain('conveyor');
    });

    it('every location has a weight, t-position, and display name', () => {
        /** Ensures no location is missing from any lookup map */
        for (const loc of JAM_LOCATIONS) {
            expect(JAM_LOCATION_WEIGHTS).toHaveProperty(loc);
            expect(JAM_LOCATION_T_POSITIONS).toHaveProperty(loc);
            expect(JAM_LOCATION_DISPLAY_NAMES).toHaveProperty(loc);
        }
    });

    // ── Probability Weights ──────────────────────────────────────────

    describe('JAM_LOCATION_WEIGHTS', () => {
        it('all weights sum to 1.0 (±0.001)', () => {
            /** Total probability must be normalized to 1 */
            const total = Object.values(JAM_LOCATION_WEIGHTS).reduce(
                (sum, w) => sum + w,
                0,
            );
            expect(total).toBeCloseTo(1.0, 2);
        });

        it('Kiln has ~40% weight', () => {
            /** Real-world: Kiln is a high-probability jam station */
            expect(JAM_LOCATION_WEIGHTS.kiln).toBeCloseTo(0.4, 2);
        });

        it('Dryer has ~40% weight', () => {
            /** Real-world: Dryer is a high-probability jam station */
            expect(JAM_LOCATION_WEIGHTS.dryer).toBeCloseTo(0.4, 2);
        });

        it('remaining 6 locations share ~20% total weight', () => {
            /** Non-priority stations split the remaining probability equally */
            const remaining =
                1.0 -
                JAM_LOCATION_WEIGHTS.kiln -
                JAM_LOCATION_WEIGHTS.dryer;
            expect(remaining).toBeCloseTo(0.2, 2);
        });

        it('every weight is positive', () => {
            /** No station should have zero or negative jam probability */
            for (const [, weight] of Object.entries(JAM_LOCATION_WEIGHTS)) {
                expect(weight).toBeGreaterThan(0);
            }
        });
    });

    // ── T-Positions ──────────────────────────────────────────────────

    describe('JAM_LOCATION_T_POSITIONS', () => {
        it('all t-positions are within [0, 0.5] belt range', () => {
            /** T-positions must be within the valid belt parameter range */
            for (const [, t] of Object.entries(JAM_LOCATION_T_POSITIONS)) {
                expect(t).toBeGreaterThanOrEqual(0);
                expect(t).toBeLessThanOrEqual(0.5);
            }
        });

        it('JAM_INTERCEPT_TOLERANCE is a small positive number', () => {
            /** Tolerance for tile-at-station detection must be reasonable */
            expect(JAM_INTERCEPT_TOLERANCE).toBeGreaterThan(0);
            expect(JAM_INTERCEPT_TOLERANCE).toBeLessThan(0.1);
        });
    });

    // ── Display Names ────────────────────────────────────────────────

    describe('JAM_LOCATION_DISPLAY_NAMES', () => {
        it('all display names are non-empty strings', () => {
            /** Display names appear in alarm messages — must not be empty */
            for (const [, name] of Object.entries(JAM_LOCATION_DISPLAY_NAMES)) {
                expect(typeof name).toBe('string');
                expect(name.length).toBeGreaterThan(0);
            }
        });
    });

    // ── selectJamLocation ────────────────────────────────────────────

    describe('selectJamLocation()', () => {
        it('always returns a valid JamLocation', () => {
            /** Run multiple selections and verify each is a known location */
            for (let i = 0; i < 100; i++) {
                const location = selectJamLocation();
                expect(JAM_LOCATIONS).toContain(location);
            }
        });

        it('over many iterations, Kiln and Dryer appear more often than others', () => {
            /**
             * Statistical test: over 10,000 trials, Kiln+Dryer should
             * dominate. We use a generous threshold (>50%) to avoid flaky tests.
             */
            const counts: Record<string, number> = {};
            const iterations = 10000;

            for (let i = 0; i < iterations; i++) {
                const loc = selectJamLocation();
                counts[loc] = (counts[loc] ?? 0) + 1;
            }

            const kilnDryerFraction =
                ((counts.kiln ?? 0) + (counts.dryer ?? 0)) / iterations;

            /** Kiln + Dryer = 80% weight, so >50% is a very conservative check */
            expect(kilnDryerFraction).toBeGreaterThan(0.5);
        });
    });

    // ── isQueueStation ───────────────────────────────────────────────

    describe('isQueueStation()', () => {
        it('returns true for dryer', () => {
            /** Dryer has a FIFO queue in the simulation */
            expect(isQueueStation('dryer')).toBe(true);
        });

        it('returns true for kiln', () => {
            /** Kiln has a FIFO queue in the simulation */
            expect(isQueueStation('kiln')).toBe(true);
        });

        it('returns false for all non-queue stations', () => {
            /** All other stations are belt-based, not queue-based */
            const nonQueueStations: JamLocation[] = [
                'press',
                'glaze',
                'digital_print',
                'sorting',
                'packaging',
                'conveyor',
            ];
            for (const loc of nonQueueStations) {
                expect(isQueueStation(loc)).toBe(false);
            }
        });
    });
});
