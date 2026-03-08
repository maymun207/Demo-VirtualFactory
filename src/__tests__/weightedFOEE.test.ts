/**
 * weightedFOEE.test.ts — Unit Tests for Weighted Factory OEE (Option A)
 *
 * Tests the calculateFOEE function's conveyor weight factor behaviour.
 * Verifies that:
 *   - Conveyor OEE at 100% has no impact on Factory OEE
 *   - Conveyor OEE at 20% with exponent 0.5 drags FOEE to ~45% of base
 *   - Conveyor OEE at 0% produces FOEE = 0
 *   - Default parameter (no conveyorOee arg) behaves as legacy (100%)
 *   - FOEE_CONVEYOR_WEIGHT_EXPONENT exists and is 0.5
 */

import { describe, test, expect } from 'vitest';

import { calculateFOEE } from '../lib/oeeCalculations';
import {
    FOEE_CONVEYOR_WEIGHT_EXPONENT,
    THEORETICAL_RATE_HEADROOM,
} from '../lib/params/oee';
import type { StationCounts, LineOEE } from '../store/types';

// ── Helpers ──────────────────────────────────────────────────────

/** Build a minimal StationCounts with known throughput values */
function makeCounts(output: number, theoretical: number): StationCounts {
    return {
        pressSpawned: output,
        pressOutput: output,
        dryerOutput: output,
        glazeOutput: output,
        digitalOutput: output,
        kilnInput: output,
        conveyorCleanOutput: output,
        conveyorScrapped: 0,
        kilnOutput: output,
        sortingUsableOutput: output,
        packagingOutput: output,
        theoreticalA: theoretical,
        theoreticalB: theoretical,
        elapsedMinutes: 0,
        perStation: {
            press: { in: output, out: output, scrappedHere: 0 },
            dryer: { in: output, out: output, scrappedHere: 0 },
            glaze: { in: output, out: output, scrappedHere: 0 },
            printer: { in: output, out: output, scrappedHere: 0 },
            kiln: { in: output, out: output, scrappedHere: 0 },
            sorting: { in: output, out: output, scrappedHere: 0 },
            packaging: { in: output, out: output, scrappedHere: 0 },
        },
    };
}

/** Build minimal LineOEE array (values don't matter for FOEE, just structure) */
function makeLoees(): LineOEE[] {
    return [
        { lineId: 'line1', name: { en: 'L1', tr: 'H1' }, performance: 1, quality: 1, oee: 100, machines: [], energy: { totalKwh: 0, totalGas: 0, totalCo2: 0, kWhPerTile: 0 } },
        { lineId: 'line2', name: { en: 'L2', tr: 'H2' }, performance: 1, quality: 1, oee: 100, machines: [], energy: { totalKwh: 0, totalGas: 0, totalCo2: 0, kWhPerTile: 0 } },
        { lineId: 'line3', name: { en: 'L3', tr: 'H3' }, performance: 0.2, quality: 1, oee: 20, machines: [], energy: { totalKwh: 0, totalGas: 0, totalCo2: 0, kWhPerTile: 0 } },
    ];
}

const emptyEnergy: Record<string, { kWh: number; gas: number; co2: number }> = {};

// ── Tests ─────────────────────────────────────────────────────────

describe('FOEE_CONVEYOR_WEIGHT_EXPONENT param', () => {
    /** Verify the parameter exists and is set to the recommended 0.5 */
    test('should be 0.5 (square-root softening)', () => {
        expect(FOEE_CONVEYOR_WEIGHT_EXPONENT).toBe(0.5);
    });
});

describe('calculateFOEE with conveyor weighting', () => {
    /** With 100 output and ~105 theoretical (headroom), base OEE ≈ 95.2% */
    const counts = makeCounts(100, 100 * THEORETICAL_RATE_HEADROOM);
    const loees = makeLoees();

    test('conveyor at 100% → FOEE equals base FOEE (no drag)', () => {
        const foee = calculateFOEE(counts, loees, emptyEnergy, 100);
        /** With 100 tiles out of 105 theoretical, base ≈ 95.24%.
         *  Conveyor at 100%, factor = 1^0.5 = 1, so FOEE = base. */
        expect(foee.oee).toBeCloseTo(95.24, 0);
    });

    test('conveyor at 20% → FOEE ≈ base × sqrt(0.2) ≈ 42.6%', () => {
        const foee = calculateFOEE(counts, loees, emptyEnergy, 20);
        /** sqrt(0.2) ≈ 0.4472, 95.24 × 0.4472 ≈ 42.6 */
        const expected = 95.24 * Math.sqrt(0.2);
        expect(foee.oee).toBeCloseTo(expected, 0);
    });

    test('conveyor at 50% → FOEE ≈ base × sqrt(0.5) ≈ 67.3%', () => {
        const foee = calculateFOEE(counts, loees, emptyEnergy, 50);
        const expected = 95.24 * Math.sqrt(0.5);
        expect(foee.oee).toBeCloseTo(expected, 0);
    });

    test('conveyor at 0% → FOEE = 0', () => {
        const foee = calculateFOEE(counts, loees, emptyEnergy, 0);
        expect(foee.oee).toBe(0);
    });

    test('default (no conveyorOee arg) → FOEE equals base (legacy compat)', () => {
        /** When conveyorOee is omitted, defaults to 100 — no impact */
        const foee = calculateFOEE(counts, loees, emptyEnergy);
        expect(foee.oee).toBeCloseTo(95.24, 0);
    });

    test('FOEE is capped at 100% even with high base throughput', () => {
        /** When packagingOutput > theoretical (headroom exceeded), FOEE shouldn't exceed 100% */
        const highCounts = makeCounts(200, 100);
        const foee = calculateFOEE(highCounts, loees, emptyEnergy, 100);
        expect(foee.oee).toBeLessThanOrEqual(100);
    });

    test('bottleneck detection still works with conveyor weighting', () => {
        /** The bottleneck detection (A vs B) should not be affected by conveyor OEE */
        const foee = calculateFOEE(counts, loees, emptyEnergy, 50);
        expect(foee.bottleneck).toBe('B');
    });
});
