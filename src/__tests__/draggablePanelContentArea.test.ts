/**
 * draggablePanelContentArea.test.ts
 *
 * Unit tests for the content-area-aware positioning logic introduced by Fix 3
 * in useDraggablePanel.ts.
 *
 * Because useDraggablePanel.ts is a React hook that depends on DOM APIs
 * (window.innerWidth, getBoundingClientRect) and Zustand's uiStore, these
 * tests replicate the pure calculation logic inline, mocking the minimal
 * environment needed to verify correctness without requiring a browser or React.
 *
 * Tests cover:
 *   1. computeContentArea()  — derives content boundaries from side-panel state
 *   2. clampPosition()       — constrains panel position within content area
 *   3. getDefaultPosition()  — computes cascade position relative to content area
 *   4. Integration scenarios — real-world combinations of open side panels
 *
 * All boundary constants use the same values as the production params to
 * ensure tests remain in sync with the implementation.
 */
import { describe, it, expect, beforeEach } from 'vitest';

// ─── Constants (mirroring production param values) ────────────────────────────
/** Matches PANEL_EDGE_MARGIN in ui.ts */
const PANEL_EDGE_MARGIN = 12;
/** Matches PANEL_HEADER_CLEARANCE fallback in ui.ts */
const PANEL_HEADER_CLEARANCE = 120;
/** Matches PANEL_GAP in ui.ts */
const PANEL_GAP = 2;
/** Matches PANEL_BOTTOM_CLEARANCE in ui.ts */
const PANEL_BOTTOM_CLEARANCE = 100;
/** Matches PANEL_DEFAULT_WIDTH in ui.ts */
const PANEL_DEFAULT_WIDTH = 359;
/** Matches PANEL_MIN_WIDTH in ui.ts */
const PANEL_MIN_WIDTH = 220;
/** Matches PANEL_MOBILE_BREAKPOINT in ui.ts */
const PANEL_MOBILE_BREAKPOINT = 640;
/** Matches PANEL_MAX_SLOTS in ui.ts */
const PANEL_MAX_SLOTS = 4;
/** Matches PANEL_STACK_GAP in ui.ts */
const PANEL_STACK_GAP = 8;
/** Matches PANEL_MIN_HEIGHT in ui.ts */
const PANEL_MIN_HEIGHT = 150;

// ─── Replicated pure functions (same logic as useDraggablePanel.ts) ───────────

/** Simulated uiStore state for testing */
interface MockUIState {
    showCWF: boolean;
    cwfPanelWidth: number;
    showDTXFR: boolean;
    dtxfrPanelWidth: number;
    showBasicPanel: boolean;
    basicPanelWidth: number;
}

/** Replicated computeContentArea — takes state explicitly for testability */
function computeContentArea(state: MockUIState, viewportWidth: number): { contentLeft: number; contentRight: number } {
    /** Sum of all left-docked side-panel widths currently visible */
    const contentLeft =
        (state.showDTXFR ? state.dtxfrPanelWidth : 0) +
        (state.showBasicPanel ? state.basicPanelWidth : 0);
    /** Right boundary: full viewport width minus the CWF right-docked panel */
    const contentRight = viewportWidth - (state.showCWF ? state.cwfPanelWidth : 0);
    return { contentLeft, contentRight };
}

/** Replicated clampPosition — content-area-aware version */
function clampPosition(
    top: number, left: number, panelWidth: number,
    contentLeft: number, contentRight: number,
    viewportHeight: number, headerBottom: number,
): { top: number; left: number } {
    return {
        top: Math.max(headerBottom, Math.min(top, viewportHeight - PANEL_BOTTOM_CLEARANCE)),
        left: Math.max(
            contentLeft + PANEL_EDGE_MARGIN,
            Math.min(contentRight - panelWidth - PANEL_EDGE_MARGIN, left),
        ),
    };
}

/** Column assignment matching production COLUMN_OF map */
const COLUMN_OF: Record<number, number> = { 0: 0, 2: 1, 1: 2, 3: 3 };

/** Replicated getDefaultPosition — wide (desktop) mode only for these tests */
function getDefaultPositionWide(
    panelIndex: number,
    contentLeft: number, contentRight: number,
    viewportHeight: number, headerBottom: number,
): { top: number; left: number; width: number } {
    const effectiveWidth = Math.max(0, contentRight - contentLeft);
    const ratio = Math.max(0.5, effectiveWidth / 1440);
    const panelWidth = Math.max(PANEL_MIN_WIDTH, Math.min(PANEL_DEFAULT_WIDTH, Math.round(PANEL_DEFAULT_WIDTH * ratio)));
    const col = COLUMN_OF[panelIndex] ?? panelIndex;
    const desiredLeft = contentLeft + PANEL_EDGE_MARGIN + col * (panelWidth + PANEL_GAP);
    const desiredTop = panelIndex === 0 ? headerBottom : Math.round(viewportHeight * 0.63);
    const pos = clampPosition(desiredTop, desiredLeft, panelWidth, contentLeft, contentRight, viewportHeight, headerBottom);
    return { ...pos, width: panelWidth };
}

// ─── Test helpers ─────────────────────────────────────────────────────────────

/** Default "no side panels open" state */
const DEFAULT_STATE: MockUIState = {
    showCWF: false, cwfPanelWidth: 0,
    showDTXFR: false, dtxfrPanelWidth: 0,
    showBasicPanel: false, basicPanelWidth: 0,
};

/** Typical CWF panel width used in the demo */
const CWF_WIDTH = 420;
/** Typical DTXFR panel width */
const DTXFR_WIDTH = 360;
/** Typical Basic panel width */
const BASIC_WIDTH = 300;
/** Standard test viewport */
const VIEWPORT_W = 1440;
const VIEWPORT_H = 900;
const HEADER_H = PANEL_HEADER_CLEARANCE;

// ─────────────────────────────────────────────────────────────────────────────
// 1. computeContentArea
// ─────────────────────────────────────────────────────────────────────────────
describe('computeContentArea', () => {
    it('returns full viewport when no side panels are open', () => {
        const result = computeContentArea(DEFAULT_STATE, VIEWPORT_W);
        expect(result.contentLeft).toBe(0);
        expect(result.contentRight).toBe(VIEWPORT_W);
    });

    it('reduces contentRight by CWF panel width when CWF is open', () => {
        const state: MockUIState = { ...DEFAULT_STATE, showCWF: true, cwfPanelWidth: CWF_WIDTH };
        const result = computeContentArea(state, VIEWPORT_W);
        expect(result.contentLeft).toBe(0);
        expect(result.contentRight).toBe(VIEWPORT_W - CWF_WIDTH);
    });

    it('increases contentLeft by DTXFR panel width when DTXFR is open', () => {
        const state: MockUIState = { ...DEFAULT_STATE, showDTXFR: true, dtxfrPanelWidth: DTXFR_WIDTH };
        const result = computeContentArea(state, VIEWPORT_W);
        expect(result.contentLeft).toBe(DTXFR_WIDTH);
        expect(result.contentRight).toBe(VIEWPORT_W);
    });

    it('stacks DTXFR + Basic widths on the left when both are open', () => {
        const state: MockUIState = {
            ...DEFAULT_STATE,
            showDTXFR: true, dtxfrPanelWidth: DTXFR_WIDTH,
            showBasicPanel: true, basicPanelWidth: BASIC_WIDTH,
        };
        const result = computeContentArea(state, VIEWPORT_W);
        expect(result.contentLeft).toBe(DTXFR_WIDTH + BASIC_WIDTH);
        expect(result.contentRight).toBe(VIEWPORT_W);
    });

    it('applies all three panels simultaneously', () => {
        const state: MockUIState = {
            showCWF: true, cwfPanelWidth: CWF_WIDTH,
            showDTXFR: true, dtxfrPanelWidth: DTXFR_WIDTH,
            showBasicPanel: true, basicPanelWidth: BASIC_WIDTH,
        };
        const result = computeContentArea(state, VIEWPORT_W);
        expect(result.contentLeft).toBe(DTXFR_WIDTH + BASIC_WIDTH);
        expect(result.contentRight).toBe(VIEWPORT_W - CWF_WIDTH);
    });

    it('does not include closed panel widths in the calculation', () => {
        // Panels have non-zero widths but showXxx is false → should not contribute
        const state: MockUIState = {
            showCWF: false, cwfPanelWidth: CWF_WIDTH,
            showDTXFR: false, dtxfrPanelWidth: DTXFR_WIDTH,
            showBasicPanel: false, basicPanelWidth: BASIC_WIDTH,
        };
        const result = computeContentArea(state, VIEWPORT_W);
        expect(result.contentLeft).toBe(0);
        expect(result.contentRight).toBe(VIEWPORT_W);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. clampPosition
// ─────────────────────────────────────────────────────────────────────────────
describe('clampPosition (content-area-aware)', () => {
    const panelWidth = PANEL_DEFAULT_WIDTH;

    it('allows a valid position within the content area unchanged', () => {
        const contentLeft = 0;
        const contentRight = VIEWPORT_W;
        const pos = clampPosition(200, 200, panelWidth, contentLeft, contentRight, VIEWPORT_H, HEADER_H);
        expect(pos.top).toBe(200);
        expect(pos.left).toBe(200);
    });

    it('clamps left edge to contentLeft + PANEL_EDGE_MARGIN', () => {
        const contentLeft = DTXFR_WIDTH; // 360
        const contentRight = VIEWPORT_W;
        /** Attempt to position the panel at left=0, well inside the DTXFR area */
        const pos = clampPosition(200, 0, panelWidth, contentLeft, contentRight, VIEWPORT_H, HEADER_H);
        expect(pos.left).toBe(contentLeft + PANEL_EDGE_MARGIN);
    });

    it('clamps right edge to contentRight - panelWidth - PANEL_EDGE_MARGIN', () => {
        const contentLeft = 0;
        const contentRight = VIEWPORT_W - CWF_WIDTH; // 1020

        /** Attempt to position panel so it overlaps the CWF area */
        const tooFarRight = contentRight + 100;
        const pos = clampPosition(200, tooFarRight, panelWidth, contentLeft, contentRight, VIEWPORT_H, HEADER_H);
        expect(pos.left).toBe(contentRight - panelWidth - PANEL_EDGE_MARGIN);
    });

    it('clamps top to headerBottom', () => {
        const pos = clampPosition(0, 200, panelWidth, 0, VIEWPORT_W, VIEWPORT_H, HEADER_H);
        expect(pos.top).toBe(HEADER_H);
    });

    it('clamps top to viewport height - PANEL_BOTTOM_CLEARANCE when too low', () => {
        const pos = clampPosition(VIEWPORT_H, 200, panelWidth, 0, VIEWPORT_W, VIEWPORT_H, HEADER_H);
        expect(pos.top).toBe(VIEWPORT_H - PANEL_BOTTOM_CLEARANCE);
    });

    it('keeps a valid position unchanged when CWF is open (right boundary)', () => {
        const contentRight = VIEWPORT_W - CWF_WIDTH;
        /** Position the panel well within the visible area */
        const validLeft = contentRight - panelWidth - PANEL_EDGE_MARGIN - 50;
        const pos = clampPosition(200, validLeft, panelWidth, 0, contentRight, VIEWPORT_H, HEADER_H);
        expect(pos.left).toBe(validLeft);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. getDefaultPosition (wide mode)
// ─────────────────────────────────────────────────────────────────────────────
describe('getDefaultPosition — wide mode', () => {
    it('positions Passport (panelIndex=0) at top-left of content area', () => {
        const { top, left } = getDefaultPositionWide(0, 0, VIEWPORT_W, VIEWPORT_H, HEADER_H);
        expect(top).toBe(HEADER_H); // pinned to headerBottom
        expect(left).toBeGreaterThanOrEqual(PANEL_EDGE_MARGIN);
    });

    it('positions ControlPanel (panelIndex=3) in the 4th column (col=3)', () => {
        const { left } = getDefaultPositionWide(3, 0, VIEWPORT_W, VIEWPORT_H, HEADER_H);
        // col=3 → left > col=2 position
        const col2Left = getDefaultPositionWide(1, 0, VIEWPORT_W, VIEWPORT_H, HEADER_H).left;
        expect(left).toBeGreaterThan(col2Left);
    });

    it('offsets all panels by contentLeft when DTXFR is open', () => {
        const noLeft = getDefaultPositionWide(0, 0, VIEWPORT_W, VIEWPORT_H, HEADER_H).left;
        const withLeft = getDefaultPositionWide(0, DTXFR_WIDTH, VIEWPORT_W, VIEWPORT_H, HEADER_H).left;
        /** With DTXFR open the Passport should sit further right by DTXFR_WIDTH */
        expect(withLeft).toBe(noLeft + DTXFR_WIDTH);
    });

    it('ControlPanel stays within content area when CWF is open', () => {
        const contentLeft = 0;
        const contentRight = VIEWPORT_W - CWF_WIDTH; // 1020
        const { left, width } = getDefaultPositionWide(3, contentLeft, contentRight, VIEWPORT_H, HEADER_H);
        /** Panel right edge must not exceed contentRight minus edge margin */
        expect(left + width).toBeLessThanOrEqual(contentRight - PANEL_EDGE_MARGIN);
    });

    it('ControlPanel stays within content area when both DTXFR and CWF are open', () => {
        const contentLeft = DTXFR_WIDTH;                // 360
        const contentRight = VIEWPORT_W - CWF_WIDTH;   // 1020
        const { left, width } = getDefaultPositionWide(3, contentLeft, contentRight, VIEWPORT_H, HEADER_H);
        expect(left).toBeGreaterThanOrEqual(contentLeft + PANEL_EDGE_MARGIN);
        expect(left + width).toBeLessThanOrEqual(contentRight - PANEL_EDGE_MARGIN);
    });

    it('panels open at 63% viewport height (non-Passport panels)', () => {
        const { top } = getDefaultPositionWide(3, 0, VIEWPORT_W, VIEWPORT_H, HEADER_H);
        /** desiredTop = round(vh * 0.63) = round(900 * 0.63) = 567, clamped min=120 */
        expect(top).toBe(Math.round(VIEWPORT_H * 0.63));
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Integration scenarios
// ─────────────────────────────────────────────────────────────────────────────
describe('Integration — real-world side-panel combinations', () => {
    it('Bug fix: ControlPanel is visible when CWF is open on a 1440px viewport', () => {
        /**
         * This is the exact bug that was filed:
         * CWF (420px) open → content area is 0..1020.
         * ControlPanel (panelIndex=3) was previously positioned using window.innerWidth=1440,
         * which placed it at left≈914…right≈1273 — partially behind CWF.
         * With the fix it must be fully within 0..1020.
         */
        const state: MockUIState = { ...DEFAULT_STATE, showCWF: true, cwfPanelWidth: 420 };
        const { contentLeft, contentRight } = computeContentArea(state, 1440);
        const { left, width } = getDefaultPositionWide(3, contentLeft, contentRight, 900, 120);
        expect(left).toBeGreaterThanOrEqual(contentLeft + PANEL_EDGE_MARGIN);
        expect(left + width).toBeLessThanOrEqual(contentRight - PANEL_EDGE_MARGIN);
    });

    it('All four panels cascade left-to-right within content area without overlap', () => {
        const contentLeft = 0;
        const contentRight = VIEWPORT_W;
        const positions = [0, 1, 2, 3].map((idx) =>
            getDefaultPositionWide(idx, contentLeft, contentRight, VIEWPORT_H, HEADER_H),
        );
        /** Verify each panel's right edge is at or before the content-area right boundary */
        for (const { left, width } of positions) {
            expect(left + width).toBeLessThanOrEqual(contentRight - PANEL_EDGE_MARGIN);
        }
        /** Verify panels are ordered: Passport (col0), KPI (col2), FTQ (col1), Control (col3)
         *  by their respective column assignments */
        const [passport, kpi, ftq, control] = positions;
        // Col 0 < Col 2 < Col 1... wait, the column order is: 0→col0, 2→col1, 1→col2, 3→col3
        // panelIndex 0 → col 0 (leftmost)
        // panelIndex 2 → col 1
        // panelIndex 1 → col 2
        // panelIndex 3 → col 3 (rightmost)
        expect(passport.left).toBeLessThan(ftq.left);  // col0 < col1
        expect(ftq.left).toBeLessThan(kpi.left);        // col1 < col2
        expect(kpi.left).toBeLessThan(control.left);    // col2 < col3
    });

    it('PANEL_GAP constant is correctly applied between panel columns', () => {
        const contentLeft = 0;
        const contentRight = VIEWPORT_W;
        const passport = getDefaultPositionWide(0, contentLeft, contentRight, VIEWPORT_H, HEADER_H);
        const ftq = getDefaultPositionWide(2, contentLeft, contentRight, VIEWPORT_H, HEADER_H);
        /**
         * FTQ is in col1, Passport in col0.
         * desiredLeft(col1) = contentLeft + MARGIN + 1*(panelWidth + PANEL_GAP)
         * desiredLeft(col0) = contentLeft + MARGIN + 0*(panelWidth + PANEL_GAP)
         * Difference = panelWidth + PANEL_GAP
         */
        const diff = ftq.left - passport.left;
        expect(diff).toBe(passport.width + PANEL_GAP);
    });
});
