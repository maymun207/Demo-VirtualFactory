/**
 * scrapClassification.test.ts — Unit Tests for Scrap Classification Logic
 *
 * Tests the `classifyDefectOutcome()` and `hasWarpDefect()` functions
 * from defectEngine.ts. These determine whether a tile with given defect
 * types should be classified as 'scrap' (structurally unusable) or
 * 'second_quality' (cosmetic/functional imperfections).
 *
 * Also validates that the SCRAP_DEFECT_TYPES and SORTING_WARP_DEFECT_TYPES
 * configurable sets in scrapConfig.ts contain the expected members.
 *
 * Uses vitest for test framework (consistent with defectEngine.test.ts).
 */

import { describe, it, expect } from 'vitest';
import { classifyDefectOutcome, hasWarpDefect } from '../lib/defectEngine';
import { SCRAP_DEFECT_TYPES, SORTING_WARP_DEFECT_TYPES, DEFAULT_SCRAP_PROBABILITY } from '../lib/params/scrapConfig';
import type { DefectType } from '../store/types';

// =============================================================================
// classifyDefectOutcome() TESTS
// =============================================================================

describe('classifyDefectOutcome', () => {
    // ── Structural defects → 'scrap' ────────────────────────────────────────

    it('returns "scrap" for crack_press (structural)', () => {
        /** crack_press is a structural failure — tile should be scrapped. */
        expect(classifyDefectOutcome(['crack_press'])).toBe('scrap');
    });

    it('returns "scrap" for lamination (structural)', () => {
        /** lamination is layer separation — tile should be scrapped. */
        expect(classifyDefectOutcome(['lamination'])).toBe('scrap');
    });

    it('returns "scrap" for explosion_dry (structural)', () => {
        /** explosion_dry is tile shattering — tile should be scrapped. */
        expect(classifyDefectOutcome(['explosion_dry'])).toBe('scrap');
    });

    it('returns "scrap" for crack_kiln (structural)', () => {
        /** crack_kiln is thermal stress fracture — tile should be scrapped. */
        expect(classifyDefectOutcome(['crack_kiln'])).toBe('scrap');
    });

    it('returns "scrap" for thermal_shock_crack (structural)', () => {
        /** thermal_shock_crack from rapid cooling — tile should be scrapped. */
        expect(classifyDefectOutcome(['thermal_shock_crack'])).toBe('scrap');
    });

    it('returns "scrap" for crush_damage (structural)', () => {
        /** crush_damage from packaging — tile should be scrapped. */
        expect(classifyDefectOutcome(['crush_damage'])).toBe('scrap');
    });

    it('returns "scrap" for conveyor_jam_damage (structural)', () => {
        /** conveyor_jam_damage from belt jam — tile should be scrapped. */
        expect(classifyDefectOutcome(['conveyor_jam_damage'])).toBe('scrap');
    });

    // ── Cosmetic defects → 'second_quality' ─────────────────────────────────

    it('returns "second_quality" for density_variance (cosmetic)', () => {
        /** density_variance is not structural — tile is second quality. */
        expect(classifyDefectOutcome(['density_variance'])).toBe('second_quality');
    });

    it('returns "second_quality" for surface_defect (cosmetic)', () => {
        /** surface_defect is cosmetic — tile is second quality. */
        expect(classifyDefectOutcome(['surface_defect'])).toBe('second_quality');
    });

    it('returns "second_quality" for color_tone_variance (cosmetic)', () => {
        /** color_tone_variance is cosmetic — tile is second quality. */
        expect(classifyDefectOutcome(['color_tone_variance'])).toBe('second_quality');
    });

    it('returns "second_quality" for blur (cosmetic)', () => {
        /** blur is cosmetic — tile is second quality. */
        expect(classifyDefectOutcome(['blur'])).toBe('second_quality');
    });

    it('returns "second_quality" for warp_kiln (not in scrap set)', () => {
        /** warp_kiln is dimensional, not structural — second quality. */
        expect(classifyDefectOutcome(['warp_kiln'])).toBe('second_quality');
    });

    // ── Mixed defects — structural + cosmetic → 'scrap' (scrap wins) ───────

    it('returns "scrap" when mixed structural + cosmetic defects are present', () => {
        /** If ANY defect is structural, the entire tile is scrap. */
        expect(
            classifyDefectOutcome(['density_variance', 'crack_press', 'blur']),
        ).toBe('scrap');
    });

    it('returns "scrap" when structural defect is last in array', () => {
        /** Order should not matter — scan all types. */
        expect(
            classifyDefectOutcome(['surface_defect', 'color_tone_variance', 'lamination']),
        ).toBe('scrap');
    });

    // ── Edge cases ──────────────────────────────────────────────────────────

    it('returns "second_quality" for empty array (no defects)', () => {
        /** No defects means no scrap — tile is at worst second quality. */
        expect(classifyDefectOutcome([])).toBe('second_quality');
    });

    it('returns "second_quality" for unknown defect type', () => {
        /** unknown is not in SCRAP_DEFECT_TYPES — second quality. */
        expect(classifyDefectOutcome(['unknown'])).toBe('second_quality');
    });

    // ── Exhaustive SCRAP_DEFECT_TYPES membership ───────────────────────────

    it('classifies ALL members of SCRAP_DEFECT_TYPES as scrap', () => {
        /** Iterate every scrap defect type and verify classification. */
        for (const defectType of SCRAP_DEFECT_TYPES) {
            expect(
                classifyDefectOutcome([defectType]),
                `Expected '${defectType}' to be classified as 'scrap'`,
            ).toBe('scrap');
        }
    });
});

// =============================================================================
// hasWarpDefect() TESTS
// =============================================================================

describe('hasWarpDefect', () => {
    // ── Positive cases — warp defects present ───────────────────────────────

    it('returns true for warp_kiln', () => {
        /** warp_kiln is detectable by sorting station dimensional scanner. */
        expect(hasWarpDefect(['warp_kiln'])).toBe(true);
    });

    it('returns true for warp_dry', () => {
        /** warp_dry is detectable by sorting station dimensional scanner. */
        expect(hasWarpDefect(['warp_dry'])).toBe(true);
    });

    it('returns true for size_variance_kiln', () => {
        /** size_variance_kiln is detectable by sorting station size sensor. */
        expect(hasWarpDefect(['size_variance_kiln'])).toBe(true);
    });

    it('returns true for dimension_variance', () => {
        /** dimension_variance is detectable by sorting station size sensor. */
        expect(hasWarpDefect(['dimension_variance'])).toBe(true);
    });

    it('returns true when warp defect is mixed with non-warp defects', () => {
        /** If ANY defect is a warp defect, return true. */
        expect(hasWarpDefect(['blur', 'warp_kiln', 'crack_press'])).toBe(true);
    });

    // ── Negative cases — no warp defects ────────────────────────────────────

    it('returns false for non-warp defect types', () => {
        /** crack_press is structural but NOT a warp defect. */
        expect(hasWarpDefect(['crack_press', 'lamination'])).toBe(false);
    });

    it('returns false for empty array', () => {
        /** No defects means no warp detected. */
        expect(hasWarpDefect([])).toBe(false);
    });

    it('returns false for cosmetic defects only', () => {
        /** Cosmetic defects are not detectable by the dimensional scanner. */
        expect(hasWarpDefect(['blur', 'surface_defect', 'color_tone_variance'])).toBe(false);
    });

    // ── Exhaustive SORTING_WARP_DEFECT_TYPES membership ────────────────────

    it('detects ALL members of SORTING_WARP_DEFECT_TYPES', () => {
        /** Iterate every warp defect type and verify detection. */
        for (const defectType of SORTING_WARP_DEFECT_TYPES) {
            expect(
                hasWarpDefect([defectType]),
                `Expected '${defectType}' to be detected as a warp defect`,
            ).toBe(true);
        }
    });
});

// =============================================================================
// CONFIGURABLE SCRAP SETS — Structure Validation
// =============================================================================

describe('SCRAP_DEFECT_TYPES config set', () => {
    it('is a non-empty ReadonlySet', () => {
        /** The set must contain at least one defect type. */
        expect(SCRAP_DEFECT_TYPES.size).toBeGreaterThan(0);
        /** It is a Set instance. */
        expect(SCRAP_DEFECT_TYPES).toBeInstanceOf(Set);
    });

    it('contains exactly 7 structural defect types', () => {
        /**
         * Expected members: crack_press, lamination, explosion_dry, crack_kiln,
         * thermal_shock_crack, crush_damage, conveyor_jam_damage.
         */
        expect(SCRAP_DEFECT_TYPES.size).toBe(7);
    });

    it('does NOT contain any cosmetic/dimensional defect types', () => {
        /** These should NOT be in the scrap set. */
        const cosmeticTypes: DefectType[] = [
            'density_variance', 'surface_defect', 'blur',
            'color_tone_variance', 'warp_kiln', 'warp_dry',
        ];
        for (const type of cosmeticTypes) {
            expect(SCRAP_DEFECT_TYPES.has(type), `'${type}' should NOT be in scrap set`).toBe(false);
        }
    });
});

describe('SORTING_WARP_DEFECT_TYPES config set', () => {
    it('is a non-empty ReadonlySet', () => {
        /** The set must contain at least one defect type. */
        expect(SORTING_WARP_DEFECT_TYPES.size).toBeGreaterThan(0);
        /** It is a Set instance. */
        expect(SORTING_WARP_DEFECT_TYPES).toBeInstanceOf(Set);
    });

    it('contains exactly 4 warp/dimensional defect types', () => {
        /**
         * Expected members: warp_kiln, warp_dry, size_variance_kiln, dimension_variance.
         */
        expect(SORTING_WARP_DEFECT_TYPES.size).toBe(4);
    });
});

// =============================================================================
// DEFAULT_SCRAP_PROBABILITY — Parameter Validation
// =============================================================================

describe('DEFAULT_SCRAP_PROBABILITY', () => {
    it('is a number between 1 and 3 (whole percentage)', () => {
        /** Scrap probability stored as whole % — valid range 1–3. */
        expect(DEFAULT_SCRAP_PROBABILITY).toBeGreaterThanOrEqual(1);
        expect(DEFAULT_SCRAP_PROBABILITY).toBeLessThanOrEqual(3);
    });

    it('defaults to 2 (2%)', () => {
        /** The factory default scrap probability is 2%. */
        expect(DEFAULT_SCRAP_PROBABILITY).toBe(2);
    });
});
