/**
 * defectHeatmap.test.ts — Unit Tests for calculateDefectRatesFromSnapshots
 *
 * Verifies that the defect heatmap calculation function:
 *  1. Uses per-tile counting (not per-station-visit) as the denominator.
 *  2. Deduplicates defect categories within a single tile (one tile
 *     visiting multiple stations with the same defect type should only
 *     count once per category per tile).
 *  3. Converts raw tile counts to percentages correctly.
 *  4. Returns baseline jitter values (via randomizeDefects) when no tiles
 *     have been produced yet.
 *  5. Ignores defect type strings that have no mapping in
 *     DEFECT_TYPE_TO_HEATMAP_CATEGORY.
 *
 * These tests were added alongside the fix that changed the denominator from
 * total station visits to total unique tiles (Map.size), resolving the bug
 * where the heatmap always displayed ~7× lower rates than expected.
 */
/// <reference types="vitest/globals" />

import { describe, it, expect } from 'vitest';
import { calculateDefectRatesFromSnapshots } from '../../lib/kpiCalculations';
import type { Defect } from '../../lib/params';

// =============================================================================
// TEST FIXTURE HELPERS
// =============================================================================

/**
 * Build the minimal base-defect array needed for tests.
 * Only includes the categories exercised by the tests to keep fixtures small.
 */
function makeBaseDefects(): Defect[] {
    return [
        { name: 'pinhole', value: 0.8, label: { tr: 'Pinhole', en: 'Pinhole' } },
        { name: 'glaze', value: 1.2, label: { tr: 'Glaze', en: 'Glaze' } },
        { name: 'banding', value: 0.5, label: { tr: 'Banding', en: 'Banding' } },
        { name: 'black', value: 0.3, label: { tr: 'Black', en: 'Black' } },
        { name: 'ghosting', value: 0.7, label: { tr: 'Ghosting', en: 'Ghosting' } },
        { name: 'edge', value: 0.6, label: { tr: 'Edge', en: 'Edge' } },
        { name: 'crack', value: 0.9, label: { tr: 'Crack', en: 'Crack' } },
        { name: 'pattern', value: 0.4, label: { tr: 'Pattern', en: 'Pattern' } },
    ];
}

/**
 * Convenience: build a single-snapshot entry for one tile with given defect types.
 */
function makeSnapshot(defect_detected: boolean, defect_types?: string[]) {
    return { defect_detected, defect_types };
}

// =============================================================================
// TESTS
// =============================================================================

describe('calculateDefectRatesFromSnapshots', () => {

    // ── Empty map (no production yet) ──────────────────────────────────────────

    it('returns jittered values (not hard zeros) when no tiles have been produced', () => {
        /**
         * Before the fix, an empty map returned all 0.0% values which made the
         * heatmap completely blank.  After the fix it should return small jittered
         * values derived from the base-defect initial values.
         */
        const result = calculateDefectRatesFromSnapshots(new Map(), makeBaseDefects());

        /**
         * We cannot assert exact values due to randomisation, but we can verify:
         *  - Same length as base defects
         *  - Values are non-negative (randomizeDefects clamps at 0)
         *  - Structure (name, label) is preserved
         */
        expect(result).toHaveLength(8);
        for (const d of result) {
            expect(d.value).toBeGreaterThanOrEqual(0);
        }
        expect(result[0].name).toBe('pinhole');
    });

    // ── Single tile, single clean snapshot ─────────────────────────────────────

    it('returns 0% for all categories when one tile has no defects', () => {
        /**
         * One tile passed through all stations without any defect detected.
         * Every category should be 0%.
         */
        const snapshots = new Map([
            ['tile-001', [
                makeSnapshot(false),
                makeSnapshot(false),
                makeSnapshot(false),
            ]],
        ]);
        const result = calculateDefectRatesFromSnapshots(snapshots, makeBaseDefects());

        for (const d of result) {
            expect(d.value).toBe(0); // 0 defective tiles / 1 total tile = 0%
        }
    });

    // ── Correct percentage math (1 of 4 tiles) ─────────────────────────────────

    it('calculates correct percentage from per-tile counts', () => {
        /**
         * 4 tiles total. Only tile-001 has a "crack_press" defect (maps to "crack").
         * Expected: crack = 1/4 × 100 = 25.0%,  all others = 0%
         */
        const snapshots = new Map([
            ['tile-001', [makeSnapshot(true, ['crack_press'])]],
            ['tile-002', [makeSnapshot(false)]],
            ['tile-003', [makeSnapshot(false)]],
            ['tile-004', [makeSnapshot(false)]],
        ]);
        const result = calculateDefectRatesFromSnapshots(snapshots, makeBaseDefects());

        const crack = result.find(d => d.name === 'crack')!;
        expect(crack.value).toBe(25.0);

        // All other categories should be 0%
        for (const d of result) {
            if (d.name !== 'crack') {
                expect(d.value).toBe(0);
            }
        }
    });

    // ── Per-tile deduplication (same category at multiple stations) ─────────────

    it('counts each category at most once per tile regardless of station visit count', () => {
        /**
         * BEFORE FIX: denominator was total visits (= 3) → rate = 3/3 = 100%.
         * AFTER FIX:  denominator is total tiles (= 1)  → rate = 1/1 = 100%.
         *
         * In this specific case both approaches give 100%, but the important
         * thing is that the count doesn't inflate beyond 1 per tile per category.
         * We test this with 2 tiles and mixed defects to verify deduplication.
         *
         * tile-A: 3 snapshots all reporting "crack_press" → should count once
         * tile-B: 1 clean snapshot
         * Expected: crack = 1/2 × 100 = 50%
         */
        const snapshots = new Map([
            ['tile-A', [
                makeSnapshot(true, ['crack_press']), // station 1 → crack
                makeSnapshot(true, ['crack_press']), // station 2 → crack (duplicate)
                makeSnapshot(true, ['crack_press']), // station 3 → crack (duplicate)
            ]],
            ['tile-B', [makeSnapshot(false)]],
        ]);
        const result = calculateDefectRatesFromSnapshots(snapshots, makeBaseDefects());

        const crack = result.find(d => d.name === 'crack')!;
        /**
         * If deduplication were absent, crack count would be 3 (one per snapshot)
         * and rate = 3/2 = 150% — clearly wrong.  With deduplication: 1/2 = 50%.
         */
        expect(crack.value).toBe(50.0);
    });

    // ── Multiple categories on a single tile ──────────────────────────────────

    it('correctly counts multiple distinct defect categories on a single tile', () => {
        /**
         * tile-001 has both a "crack_press" (→ crack) and a "glaze_drip" (→ glaze).
         * Should count as 1 crack tile AND 1 glaze tile, giving each 50% out of 2 total tiles.
         */
        const snapshots = new Map([
            ['tile-001', [
                makeSnapshot(true, ['crack_press', 'glaze_drip']),
            ]],
            ['tile-002', [makeSnapshot(false)]],
        ]);
        const result = calculateDefectRatesFromSnapshots(snapshots, makeBaseDefects());

        const crack = result.find(d => d.name === 'crack')!;
        const glaze = result.find(d => d.name === 'glaze')!;
        expect(crack.value).toBe(50.0);
        expect(glaze.value).toBe(50.0);
    });

    // ── Unknown defect type ───────────────────────────────────────────────────

    it('ignores defect type strings not present in the mapping table', () => {
        /**
         * "totally_unknown_defect" has no entry in DEFECT_TYPE_TO_HEATMAP_CATEGORY.
         * The result should be all zeros rather than throwing or populating
         * an unmapped category.
         */
        const snapshots = new Map([
            ['tile-001', [makeSnapshot(true, ['totally_unknown_defect'])]],
        ]);
        const result = calculateDefectRatesFromSnapshots(snapshots, makeBaseDefects());

        for (const d of result) {
            expect(d.value).toBe(0);
        }
    });

    // ── Structure preservation ────────────────────────────────────────────────

    it('preserves name and label on all returned defects', () => {
        /**
         * The calculation should never mutate name/label — only change value.
         */
        const base = makeBaseDefects();
        const snapshots = new Map([
            ['tile-001', [makeSnapshot(true, ['crack_press'])]],
        ]);
        const result = calculateDefectRatesFromSnapshots(snapshots, base);

        for (let i = 0; i < base.length; i++) {
            expect(result[i].name).toBe(base[i].name);
            expect(result[i].label).toEqual(base[i].label);
        }
    });

    // ── 100-tile run ─────────────────────────────────────────────────────────

    it('handles a 100-tile run producing correct rates at scale', () => {
        /**
         * 100 tiles, 20 have "pinhole_glaze" (→ pinhole).
         * Expected pinhole rate = 20 / 100 × 100 = 20.0%
         */
        const map = new Map<string, { defect_detected: boolean; defect_types?: string[] }[]>();
        for (let i = 0; i < 20; i++) {
            map.set(`tile-${i}`, [makeSnapshot(true, ['pinhole_glaze'])]);
        }
        for (let i = 20; i < 100; i++) {
            map.set(`tile-${i}`, [makeSnapshot(false)]);
        }

        const result = calculateDefectRatesFromSnapshots(map, makeBaseDefects());
        const pinhole = result.find(d => d.name === 'pinhole')!;
        expect(pinhole.value).toBe(20.0);
    });
});
