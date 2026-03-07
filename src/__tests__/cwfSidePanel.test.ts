/**
 * cwfSidePanel.test.ts — Unit Tests for CWF Side Panel Configuration Parameters
 *
 * Validates that all CWF side panel layout and resize constants in
 * src/lib/params/ui.ts are within expected ranges and maintain
 * correct relationships (e.g., min < default < max). These guard-rail
 * tests catch accidental misconfiguration that could break the
 * right-docked panel layout.
 *
 * Run: npx vitest run src/__tests__/cwfSidePanel.test.ts
 */
/// <reference types="vitest/globals" />

import { describe, it, expect } from 'vitest';
import {
    CWF_SIDE_PANEL_DEFAULT_WIDTH,
    CWF_SIDE_PANEL_MIN_WIDTH,
    CWF_SIDE_PANEL_MAX_WIDTH,
    CWF_SIDE_PANEL_HANDLE_WIDTH,
    CWF_SIDE_PANEL_ANIMATION_MS,
} from '../lib/params/ui';

// =============================================================================
// Tests
// =============================================================================

describe('CWF Side Panel Configuration Parameters', () => {
    // ── Default Width ─────────────────────────────────────────────────

    it('CWF_SIDE_PANEL_DEFAULT_WIDTH should be a positive number', () => {
        /** Default width must be positive to produce a visible panel */
        expect(CWF_SIDE_PANEL_DEFAULT_WIDTH).toBeGreaterThan(0);
    });

    it('CWF_SIDE_PANEL_DEFAULT_WIDTH should be ≥ CWF_SIDE_PANEL_MIN_WIDTH', () => {
        /** Default must not be smaller than the configured minimum */
        expect(CWF_SIDE_PANEL_DEFAULT_WIDTH).toBeGreaterThanOrEqual(CWF_SIDE_PANEL_MIN_WIDTH);
    });

    it('CWF_SIDE_PANEL_DEFAULT_WIDTH should be ≤ CWF_SIDE_PANEL_MAX_WIDTH', () => {
        /** Default must not exceed the configured maximum */
        expect(CWF_SIDE_PANEL_DEFAULT_WIDTH).toBeLessThanOrEqual(CWF_SIDE_PANEL_MAX_WIDTH);
    });

    // ── Min Width ──────────────────────────────────────────────────────

    it('CWF_SIDE_PANEL_MIN_WIDTH should be a positive number', () => {
        /** Minimum must be positive so the panel always has some visible width */
        expect(CWF_SIDE_PANEL_MIN_WIDTH).toBeGreaterThan(0);
    });

    it('CWF_SIDE_PANEL_MIN_WIDTH should be < CWF_SIDE_PANEL_MAX_WIDTH', () => {
        /** Min must be strictly less than max to allow a valid resize range */
        expect(CWF_SIDE_PANEL_MIN_WIDTH).toBeLessThan(CWF_SIDE_PANEL_MAX_WIDTH);
    });

    // ── Max Width ──────────────────────────────────────────────────────

    it('CWF_SIDE_PANEL_MAX_WIDTH should be ≤ 960 (50% of a 1920px viewport)', () => {
        /** Prevent the panel from consuming more than half the screen */
        expect(CWF_SIDE_PANEL_MAX_WIDTH).toBeLessThanOrEqual(960);
    });

    it('CWF_SIDE_PANEL_MAX_WIDTH should be > 0', () => {
        /** Max width must be positive */
        expect(CWF_SIDE_PANEL_MAX_WIDTH).toBeGreaterThan(0);
    });

    // ── Handle Width ───────────────────────────────────────────────────

    it('CWF_SIDE_PANEL_HANDLE_WIDTH should be between 2 and 12 (px)', () => {
        /** Handle must be wide enough to grab (≥ 2) but not intrusive (≤ 12) */
        expect(CWF_SIDE_PANEL_HANDLE_WIDTH).toBeGreaterThanOrEqual(2);
        expect(CWF_SIDE_PANEL_HANDLE_WIDTH).toBeLessThanOrEqual(12);
    });

    // ── Animation Duration ──────────────────────────────────────────────

    it('CWF_SIDE_PANEL_ANIMATION_MS should be between 100 and 1000 (ms)', () => {
        /** Too fast (< 100) feels jarring; too slow (> 1000) feels sluggish */
        expect(CWF_SIDE_PANEL_ANIMATION_MS).toBeGreaterThanOrEqual(100);
        expect(CWF_SIDE_PANEL_ANIMATION_MS).toBeLessThanOrEqual(1000);
    });

    it('CWF_SIDE_PANEL_ANIMATION_MS should be an integer', () => {
        /** CSS transition durations should be whole milliseconds */
        expect(Number.isInteger(CWF_SIDE_PANEL_ANIMATION_MS)).toBe(true);
    });
});
