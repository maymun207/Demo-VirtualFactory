/**
 * basicPanel.test.ts — Basic Side Panel Parameter Tests
 *
 * Validates the configurable constants that control the Basic
 * (KPI + Defect Heatmap) left-docked side panel layout and resize behaviour.
 *
 * These tests verify:
 *   - Default, min, and max widths are positive and in logical order
 *   - Handle width is a positive, small value suitable for dragging
 *   - Default width is within [min, max] bounds
 *   - UI_DEFAULTS.showBasicPanel is false on startup
 */

import { describe, expect, it } from 'vitest';
import {
    BASIC_SIDE_PANEL_DEFAULT_WIDTH,
    BASIC_SIDE_PANEL_MIN_WIDTH,
    BASIC_SIDE_PANEL_MAX_WIDTH,
    BASIC_SIDE_PANEL_HANDLE_WIDTH,
    UI_DEFAULTS,
} from '../../lib/params';

// =============================================================================
// BASIC SIDE PANEL WIDTH PARAMS
// =============================================================================

describe('Basic Side Panel Width Params', () => {
    it('default width is a positive number', () => {
        /** The panel must have a meaningful starting width. */
        expect(BASIC_SIDE_PANEL_DEFAULT_WIDTH).toBeGreaterThan(0);
    });

    it('min width is a positive number', () => {
        /** The minimum width must be positive to remain usable. */
        expect(BASIC_SIDE_PANEL_MIN_WIDTH).toBeGreaterThan(0);
    });

    it('max width is greater than min width', () => {
        /** Max must exceed min to allow a valid resize range. */
        expect(BASIC_SIDE_PANEL_MAX_WIDTH).toBeGreaterThan(BASIC_SIDE_PANEL_MIN_WIDTH);
    });

    it('default width is within [min, max] bounds', () => {
        /** The default must be a valid width within the allowed range. */
        expect(BASIC_SIDE_PANEL_DEFAULT_WIDTH).toBeGreaterThanOrEqual(BASIC_SIDE_PANEL_MIN_WIDTH);
        expect(BASIC_SIDE_PANEL_DEFAULT_WIDTH).toBeLessThanOrEqual(BASIC_SIDE_PANEL_MAX_WIDTH);
    });

    it('max width does not exceed 80% of a typical viewport (1920px)', () => {
        /** Prevents the panel from consuming the entire screen. */
        expect(BASIC_SIDE_PANEL_MAX_WIDTH).toBeLessThanOrEqual(1920 * 0.8);
    });
});

// =============================================================================
// BASIC SIDE PANEL HANDLE WIDTH
// =============================================================================

describe('Basic Side Panel Handle Width', () => {
    it('is a positive number', () => {
        /** The handle must have some width to be draggable. */
        expect(BASIC_SIDE_PANEL_HANDLE_WIDTH).toBeGreaterThan(0);
    });

    it('is small enough to not intrude on content (≤ 12px)', () => {
        /** A handle wider than 12px wastes visual space. */
        expect(BASIC_SIDE_PANEL_HANDLE_WIDTH).toBeLessThanOrEqual(12);
    });
});

// =============================================================================
// UI_DEFAULTS — Basic panel initial visibility
// =============================================================================

describe('UI_DEFAULTS — Basic Panel', () => {
    it('showBasicPanel defaults to false', () => {
        /** The Basic panel should be hidden on app startup. */
        expect(UI_DEFAULTS.showBasicPanel).toBe(false);
    });
});
