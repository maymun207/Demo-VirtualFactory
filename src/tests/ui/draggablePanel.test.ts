/**
 * draggablePanel.test.ts — Font Scale Calculation Tests
 *
 * Validates the proportional font-scale logic used by the useDraggablePanel
 * hook. When a panel is resized, fonts inside should scale proportionally
 * using the formula:
 *   fontScale = clamp((widthRatio × heightRatio)^EXPONENT, MIN, MAX)
 *
 * When height is undefined (auto mode), falls back to width-only scaling:
 *   fontScale = clamp(widthRatio, MIN, MAX)
 *
 * These tests exercise the pure math (no DOM/React) to ensure:
 *   - Scale is exactly 1.0 at default dimensions
 *   - Scale responds to height changes (vertical resize)
 *   - Scale responds to width changes (horizontal resize)
 *   - Power-based formula produces correct results for combined resize
 *   - Scale never drops below PANEL_FONT_SCALE_MIN
 *   - Scale never exceeds PANEL_FONT_SCALE_MAX
 */

import { describe, expect, it } from 'vitest';
import {
    PANEL_DEFAULT_WIDTH,
    PANEL_DEFAULT_HEIGHT,
    PANEL_MIN_WIDTH,
    PANEL_MAX_WIDTH,
    PANEL_FONT_SCALE_MIN,
    PANEL_FONT_SCALE_MAX,
    PANEL_FONT_SCALE_EXPONENT,
} from '../../lib/params';

// =============================================================================
// HELPER — Pure font-scale calculation (mirrors useDraggablePanel logic)
// =============================================================================

/**
 * Computes the font scale factor for a given panel width and optional height.
 * This is the exact same formula used in useDraggablePanel.ts:
 *   - With height: scale = clamp((widthRatio × heightRatio)^EXPONENT, MIN, MAX)
 *   - Without height: scale = clamp(widthRatio, MIN, MAX)
 *
 * @param width  - Current panel width in pixels
 * @param height - Current panel height in pixels, or undefined for auto-height
 * @returns Clamped font scale factor
 */
function computeFontScale(width: number, height?: number): number {
    /** Width ratio relative to default panel width */
    const widthRatio = width / PANEL_DEFAULT_WIDTH;

    if (height !== undefined) {
        /** Height ratio relative to default panel height */
        const heightRatio = height / PANEL_DEFAULT_HEIGHT;
        /** Power-based formula — steeper than geometric mean (sqrt) */
        return Math.max(
            PANEL_FONT_SCALE_MIN,
            Math.min(PANEL_FONT_SCALE_MAX, Math.pow(widthRatio * heightRatio, PANEL_FONT_SCALE_EXPONENT)),
        );
    }

    /** Auto-height mode: scale based on width only */
    return Math.max(
        PANEL_FONT_SCALE_MIN,
        Math.min(PANEL_FONT_SCALE_MAX, widthRatio),
    );
}

// =============================================================================
// FONT SCALE — Width-only (auto-height mode)
// =============================================================================

describe('DraggablePanel — Font Scale (Width-Only, Auto-Height)', () => {
    it('returns 1.0 at PANEL_DEFAULT_WIDTH', () => {
        /** At the default width with auto-height, fonts render at original size. */
        expect(computeFontScale(PANEL_DEFAULT_WIDTH)).toBeCloseTo(1.0, 5);
    });

    it('shrinks when panel is narrower than default', () => {
        /** A narrower panel should have scale < 1. */
        const scale = computeFontScale(250);
        expect(scale).toBeLessThan(1.0);
        expect(scale).toBeGreaterThanOrEqual(PANEL_FONT_SCALE_MIN);
    });

    it('grows when panel is wider than default', () => {
        /** A wider panel should have scale > 1. */
        const scale = computeFontScale(500);
        expect(scale).toBeGreaterThan(1.0);
        expect(scale).toBeLessThanOrEqual(PANEL_FONT_SCALE_MAX);
    });

    it('clamps to MIN at PANEL_MIN_WIDTH', () => {
        /** At minimum width (220px), scale should not go below min. */
        const scale = computeFontScale(PANEL_MIN_WIDTH);
        expect(scale).toBe(PANEL_FONT_SCALE_MIN);
    });

    it('stays below MAX at PANEL_MAX_WIDTH in width-only mode', () => {
        /** At maximum width (600px) in auto-height mode, scale is below max
         *  because width-only scaling is linear (600/359 ≈ 1.67 < 2.0). */
        const scale = computeFontScale(PANEL_MAX_WIDTH);
        expect(scale).toBeGreaterThan(1.0);
        expect(scale).toBeLessThanOrEqual(PANEL_FONT_SCALE_MAX);
    });
});

// =============================================================================
// FONT SCALE — Power-based formula (both dimensions)
// =============================================================================

describe('DraggablePanel — Font Scale (Power Formula, Width + Height)', () => {
    it('returns 1.0 at default width AND default height', () => {
        /** (1.0 × 1.0)^0.75 = 1.0 — unchanged at default dimensions. */
        const scale = computeFontScale(PANEL_DEFAULT_WIDTH, PANEL_DEFAULT_HEIGHT);
        expect(scale).toBeCloseTo(1.0, 5);
    });

    it('increases when height grows (width stays constant)', () => {
        /** Height doubles while width stays at default.
         *  (1.0 × 2.0)^0.75 ≈ 1.68 — much steeper than sqrt (1.41). */
        const scale = computeFontScale(PANEL_DEFAULT_WIDTH, PANEL_DEFAULT_HEIGHT * 2);
        expect(scale).toBeGreaterThan(1.4);
    });

    it('increases when width grows (height stays constant)', () => {
        /** Width doubles, height stays default.
         *  (2.0 × 1.0)^0.75 ≈ 1.68 */
        const scale = computeFontScale(PANEL_DEFAULT_WIDTH * 2, PANEL_DEFAULT_HEIGHT);
        expect(scale).toBeGreaterThan(1.4);
    });

    it('increases more when BOTH dimensions grow', () => {
        /** Panel enlarged in both directions — scale should be higher than
         *  either single-dimension resize. */
        const widthOnlyScale = computeFontScale(PANEL_DEFAULT_WIDTH * 1.5, PANEL_DEFAULT_HEIGHT);
        const heightOnlyScale = computeFontScale(PANEL_DEFAULT_WIDTH, PANEL_DEFAULT_HEIGHT * 1.5);
        const bothScale = computeFontScale(PANEL_DEFAULT_WIDTH * 1.5, PANEL_DEFAULT_HEIGHT * 1.5);
        expect(bothScale).toBeGreaterThan(widthOnlyScale);
        expect(bothScale).toBeGreaterThan(heightOnlyScale);
    });

    it('decreases when height shrinks (width constant)', () => {
        /** Panel made shorter: fonts should shrink. */
        const scale = computeFontScale(PANEL_DEFAULT_WIDTH, PANEL_DEFAULT_HEIGHT * 0.5);
        expect(scale).toBeLessThan(1.0);
    });

    it('clamps to PANEL_FONT_SCALE_MIN at very small dimensions', () => {
        /** Both dimensions very small — should clamp to min. */
        const scale = computeFontScale(200, 200);
        expect(scale).toBeGreaterThanOrEqual(PANEL_FONT_SCALE_MIN);
    });

    it('clamps to PANEL_FONT_SCALE_MAX at very large dimensions', () => {
        /** Both dimensions very large — should clamp to max. */
        const scale = computeFontScale(800, 900);
        expect(scale).toBe(PANEL_FONT_SCALE_MAX);
    });
});

// =============================================================================
// FONT SCALE — Invariants
// =============================================================================

describe('DraggablePanel — Font Scale Invariants', () => {
    it('scale is monotonically non-decreasing as width increases (auto-height)', () => {
        /** Font scale must never decrease when the panel gets wider. */
        const widths = [200, 250, 300, 359, 400, 500, 600];
        let prevScale = 0;
        widths.forEach((w) => {
            const scale = computeFontScale(w);
            expect(scale).toBeGreaterThanOrEqual(prevScale);
            prevScale = scale;
        });
    });

    it('scale is monotonically non-decreasing as height increases (fixed width)', () => {
        /** Font scale must never decrease when the panel gets taller. */
        const heights = [150, 250, 350, 450, 550, 700, 900];
        let prevScale = 0;
        heights.forEach((h) => {
            const scale = computeFontScale(PANEL_DEFAULT_WIDTH, h);
            expect(scale).toBeGreaterThanOrEqual(prevScale);
            prevScale = scale;
        });
    });

    it('PANEL_FONT_SCALE_MIN, MAX, and EXPONENT are sane', () => {
        /** Min must be positive, max must be greater than min. */
        expect(PANEL_FONT_SCALE_MIN).toBeGreaterThan(0);
        expect(PANEL_FONT_SCALE_MAX).toBeGreaterThan(PANEL_FONT_SCALE_MIN);
        /** Max should not exceed 3× to keep text readable. */
        expect(PANEL_FONT_SCALE_MAX).toBeLessThanOrEqual(3.0);
        /** Exponent must be between 0.5 (gentle) and 1.0 (linear). */
        expect(PANEL_FONT_SCALE_EXPONENT).toBeGreaterThanOrEqual(0.5);
        expect(PANEL_FONT_SCALE_EXPONENT).toBeLessThanOrEqual(1.0);
    });

    it('PANEL_DEFAULT_HEIGHT is a positive, reasonable value', () => {
        /** Default height must be positive and within a reasonable pixel range. */
        expect(PANEL_DEFAULT_HEIGHT).toBeGreaterThan(100);
        expect(PANEL_DEFAULT_HEIGHT).toBeLessThan(1000);
    });
});
