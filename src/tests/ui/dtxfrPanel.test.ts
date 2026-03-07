/**
 * dtxfrPanel.test.ts — DTXFR Side Panel Parameter Tests
 *
 * Validates the configurable constants that control the DTXFR (Digital Transfer)
 * left-docked Tile Passport side panel layout and resize behaviour.
 *
 * These tests verify:
 *   - Default, min, and max widths are positive and in logical order
 *   - Handle width is a positive, small value suitable for dragging
 *   - Default width is within [min, max] bounds
 *   - DTXFR params are symmetric with CWF side panel params
 */

import { describe, expect, it } from 'vitest';
import {
    DTXFR_SIDE_PANEL_DEFAULT_WIDTH,
    DTXFR_SIDE_PANEL_MIN_WIDTH,
    DTXFR_SIDE_PANEL_MAX_WIDTH,
    DTXFR_SIDE_PANEL_HANDLE_WIDTH,
    CWF_SIDE_PANEL_DEFAULT_WIDTH,
    CWF_SIDE_PANEL_MIN_WIDTH,
    CWF_SIDE_PANEL_MAX_WIDTH,
    CWF_SIDE_PANEL_HANDLE_WIDTH,
    UI_DEFAULTS,
} from '../../lib/params';

// =============================================================================
// DTXFR SIDE PANEL WIDTH PARAMS
// =============================================================================

describe('DTXFR Side Panel Width Params', () => {
    it('default width is a positive number', () => {
        /** The panel must have a meaningful starting width. */
        expect(DTXFR_SIDE_PANEL_DEFAULT_WIDTH).toBeGreaterThan(0);
    });

    it('min width is a positive number', () => {
        /** The minimum width must be positive to remain usable. */
        expect(DTXFR_SIDE_PANEL_MIN_WIDTH).toBeGreaterThan(0);
    });

    it('max width is greater than min width', () => {
        /** Max must exceed min to allow a valid resize range. */
        expect(DTXFR_SIDE_PANEL_MAX_WIDTH).toBeGreaterThan(DTXFR_SIDE_PANEL_MIN_WIDTH);
    });

    it('default width is within [min, max] bounds', () => {
        /** The default must be a valid width within the allowed range. */
        expect(DTXFR_SIDE_PANEL_DEFAULT_WIDTH).toBeGreaterThanOrEqual(DTXFR_SIDE_PANEL_MIN_WIDTH);
        expect(DTXFR_SIDE_PANEL_DEFAULT_WIDTH).toBeLessThanOrEqual(DTXFR_SIDE_PANEL_MAX_WIDTH);
    });

    it('max width does not exceed 80% of a typical viewport (1920px)', () => {
        /** Prevents the panel from consuming the entire screen. */
        expect(DTXFR_SIDE_PANEL_MAX_WIDTH).toBeLessThanOrEqual(1920 * 0.8);
    });
});

// =============================================================================
// DTXFR SIDE PANEL HANDLE WIDTH
// =============================================================================

describe('DTXFR Side Panel Handle Width', () => {
    it('is a positive number', () => {
        /** The handle must have some width to be draggable. */
        expect(DTXFR_SIDE_PANEL_HANDLE_WIDTH).toBeGreaterThan(0);
    });

    it('is small enough to not intrude on content (≤ 12px)', () => {
        /** A handle wider than 12px wastes visual space. */
        expect(DTXFR_SIDE_PANEL_HANDLE_WIDTH).toBeLessThanOrEqual(12);
    });
});

// =============================================================================
// DTXFR SYMMETRY WITH CWF
// =============================================================================

describe('DTXFR / CWF Proportion', () => {
    it('DTXFR default width is narrower than CWF default width', () => {
        /** DTXFR panel is intentionally narrower than CWF for a compact layout. */
        expect(DTXFR_SIDE_PANEL_DEFAULT_WIDTH).toBeLessThan(CWF_SIDE_PANEL_DEFAULT_WIDTH);
    });

    it('DTXFR min width is narrower than CWF min width', () => {
        /** DTXFR min width should be smaller than CWF min width. */
        expect(DTXFR_SIDE_PANEL_MIN_WIDTH).toBeLessThan(CWF_SIDE_PANEL_MIN_WIDTH);
    });

    it('DTXFR max width is narrower than CWF max width', () => {
        /** DTXFR max width should be smaller than CWF max width. */
        expect(DTXFR_SIDE_PANEL_MAX_WIDTH).toBeLessThan(CWF_SIDE_PANEL_MAX_WIDTH);
    });

    it('DTXFR and CWF share the same handle width', () => {
        /** Both resize handles should have identical hit-area widths. */
        expect(DTXFR_SIDE_PANEL_HANDLE_WIDTH).toBe(CWF_SIDE_PANEL_HANDLE_WIDTH);
    });
});

// =============================================================================
// UI_DEFAULTS — DTXFR initial visibility
// =============================================================================

describe('UI_DEFAULTS — DTXFR', () => {
    it('showDTXFR defaults to false', () => {
        /** The DTXFR panel should be hidden on app startup. */
        expect(UI_DEFAULTS.showDTXFR).toBe(false);
    });
});
