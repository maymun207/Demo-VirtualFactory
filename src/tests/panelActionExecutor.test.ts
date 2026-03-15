/**
 * panelActionExecutor.test.ts — Panel Open/Close Action Executor Tests
 *
 * Unit tests for the applyPanelActionList() pure function
 * (src/lib/utils/panelActionExecutor.ts).
 *
 * Uses dependency injection — a mock "ui" object is passed instead of the
 * real useUIStore. No module mocking is required.
 *
 * Covers:
 *   - Guard: undefined/empty actions → complete no-op
 *   - Toggle fired when current state differs from desired
 *   - Toggle NOT fired when already in desired state (idempotent)
 *   - Multiple panels handled in one call
 *   - Welcome Click #1 scenario: all 5 panels closed
 *   - Close panel that is already closed → no toggle (idempotent)
 */

import { describe, it, expect, vi } from 'vitest';
import { applyPanelActionList } from '../lib/utils/panelActionExecutor';
import type { UIPanelDeps } from '../lib/utils/panelActionExecutor';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * makeMockUI — creates a fresh UIPanelDeps mock object.
 * All panels start as 'closed' (false) by default.
 * All toggle methods are vi.fn() stubs.
 *
 * @param overrides - Partial state to override defaults
 */
function makeMockUI(overrides: Partial<UIPanelDeps> = {}): UIPanelDeps & {
    toggleBasicPanel:   ReturnType<typeof vi.fn>;
    toggleDTXFR:        ReturnType<typeof vi.fn>;
    toggleCWF:          ReturnType<typeof vi.fn>;
    toggleControlPanel: ReturnType<typeof vi.fn>;
    toggleKPI:          ReturnType<typeof vi.fn>;
    toggleHeatmap:      ReturnType<typeof vi.fn>;
    togglePassport:     ReturnType<typeof vi.fn>;
    toggleOEEHierarchy: ReturnType<typeof vi.fn>;
} {
    return {
        showBasicPanel:   false,
        showDTXFR:        false,
        showCWF:          false,
        showControlPanel: false,
        showKPI:          false,
        showHeatmap:      false,
        showPassport:     false,
        showOEEHierarchy: false,
        toggleBasicPanel:   vi.fn(),
        toggleDTXFR:        vi.fn(),
        toggleCWF:          vi.fn(),
        toggleControlPanel: vi.fn(),
        toggleKPI:          vi.fn(),
        toggleHeatmap:      vi.fn(),
        togglePassport:     vi.fn(),
        toggleOEEHierarchy: vi.fn(),
        ...overrides,
    } as UIPanelDeps & { toggleBasicPanel: ReturnType<typeof vi.fn>; toggleDTXFR: ReturnType<typeof vi.fn>; toggleCWF: ReturnType<typeof vi.fn>; toggleControlPanel: ReturnType<typeof vi.fn>; toggleKPI: ReturnType<typeof vi.fn>; toggleHeatmap: ReturnType<typeof vi.fn>; togglePassport: ReturnType<typeof vi.fn>; toggleOEEHierarchy: ReturnType<typeof vi.fn>; };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('applyPanelActionList', () => {

    // ── Guard cases ──────────────────────────────────────────────────────────

    it('is a complete no-op for undefined actions', () => {
        const ui = makeMockUI();
        applyPanelActionList(undefined, ui);
        expect(ui.toggleBasicPanel).not.toHaveBeenCalled();
        expect(ui.toggleCWF).not.toHaveBeenCalled();
    });

    it('is a complete no-op for an empty actions array', () => {
        const ui = makeMockUI();
        applyPanelActionList([], ui);
        expect(ui.toggleBasicPanel).not.toHaveBeenCalled();
    });

    // ── Single panel — toggle fired when state differs ────────────────────────

    it('toggles basicPanel when currently closed and desired = open', () => {
        const ui = makeMockUI({ showBasicPanel: false });
        applyPanelActionList([{ panel: 'basicPanel', state: 'open' }], ui);
        expect(ui.toggleBasicPanel).toHaveBeenCalledOnce();
    });

    it('toggles cwf when currently open and desired = close', () => {
        const ui = makeMockUI({ showCWF: true });
        applyPanelActionList([{ panel: 'cwf', state: 'close' }], ui);
        expect(ui.toggleCWF).toHaveBeenCalledOnce();
    });

    // ── Idempotency: no toggle when already in desired state ─────────────────

    it('does NOT toggle basicPanel when already open and desired = open', () => {
        const ui = makeMockUI({ showBasicPanel: true });
        applyPanelActionList([{ panel: 'basicPanel', state: 'open' }], ui);
        expect(ui.toggleBasicPanel).not.toHaveBeenCalled();
    });

    it('does NOT toggle dtxfr when already closed and desired = close', () => {
        const ui = makeMockUI({ showDTXFR: false });
        applyPanelActionList([{ panel: 'dtxfr', state: 'close' }], ui);
        expect(ui.toggleDTXFR).not.toHaveBeenCalled();
    });

    // ── Multiple panels in one call ──────────────────────────────────────────

    it('handles a mixed list: opens one, closes another, skips unchanged', () => {
        const ui = makeMockUI({
            showBasicPanel: false, /** needs open → toggle */
            showDTXFR:      true,  /** needs close → toggle */
            showCWF:        false, /** already closed → no toggle */
        });
        applyPanelActionList([
            { panel: 'basicPanel', state: 'open' },
            { panel: 'dtxfr',     state: 'close' },
            { panel: 'cwf',       state: 'close' },
        ], ui);
        expect(ui.toggleBasicPanel).toHaveBeenCalledOnce();
        expect(ui.toggleDTXFR).toHaveBeenCalledOnce();
        expect(ui.toggleCWF).not.toHaveBeenCalled();
    });

    // ── Welcome Click #1 scenario ─────────────────────────────────────────────

    describe('Welcome Click #1 — close all 5 panels', () => {
        it('toggles every panel that is open', () => {
            /** All 5 panels are open — all 5 should toggle */
            const ui = makeMockUI({
                showBasicPanel:   true,
                showDTXFR:        true,
                showCWF:          true,
                showOEEHierarchy: true,
                showControlPanel: true,
            });
            applyPanelActionList([
                { panel: 'basicPanel',   state: 'close' },
                { panel: 'dtxfr',        state: 'close' },
                { panel: 'cwf',          state: 'close' },
                { panel: 'oeeHierarchy', state: 'close' },
                { panel: 'controlPanel', state: 'close' },
            ], ui);
            expect(ui.toggleBasicPanel).toHaveBeenCalledOnce();
            expect(ui.toggleDTXFR).toHaveBeenCalledOnce();
            expect(ui.toggleCWF).toHaveBeenCalledOnce();
            expect(ui.toggleOEEHierarchy).toHaveBeenCalledOnce();
            expect(ui.toggleControlPanel).toHaveBeenCalledOnce();
        });

        it('is a no-op when all 5 panels are already closed (idempotent)', () => {
            /** All panels already closed — action list should produce zero toggles */
            const ui = makeMockUI(); /** all false by default */
            applyPanelActionList([
                { panel: 'basicPanel',   state: 'close' },
                { panel: 'dtxfr',        state: 'close' },
                { panel: 'cwf',          state: 'close' },
                { panel: 'oeeHierarchy', state: 'close' },
                { panel: 'controlPanel', state: 'close' },
            ], ui);
            expect(ui.toggleBasicPanel).not.toHaveBeenCalled();
            expect(ui.toggleDTXFR).not.toHaveBeenCalled();
            expect(ui.toggleCWF).not.toHaveBeenCalled();
            expect(ui.toggleOEEHierarchy).not.toHaveBeenCalled();
            expect(ui.toggleControlPanel).not.toHaveBeenCalled();
        });
    });

});
