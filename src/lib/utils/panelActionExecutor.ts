/**
 * panelActionExecutor.ts — Panel Open/Close Action Executor Utility
 *
 * A pure function that applies an array of PanelAction objects to the
 * UI store, toggling panels open or closed as needed.
 *
 * Extracted from demoStore.ts applyPanelActionList() into its own module
 * so it can be:
 *  1. Tested independently using dependency injection (no module mocking needed).
 *  2. Reused by both act-level and step-level panel actions in demoStore.ts.
 *
 * KEY BEHAVIOUR:
 *   Idempotent — only calls toggle() if the current state differs from desired.
 *   This prevents redundant re-renders when a panel is already in the right state.
 *
 * Used by: demoStore.ts → handleCtaClick() (step-level) and advanceAct() (act-level)
 * Tested in: src/tests/panelActionExecutor.test.ts
 */

import type { UIPanel, PanelAction } from '../params/demoSystem/demoScript';

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * UIPanelDeps — the subset of uiStore state needed by the executor.
 *
 * Passed in by the caller (demoStore reads from useUIStore.getState()).
 * Using dependency injection makes this function purely testable.
 */
export interface UIPanelDeps {
    /** Visibility state for each panel */
    showBasicPanel:   boolean;
    showDTXFR:        boolean;
    showCWF:          boolean;
    showControlPanel: boolean;
    showKPI:          boolean;
    showHeatmap:      boolean;
    showPassport:     boolean;
    showOEEHierarchy: boolean;

    /** Toggle functions for each panel */
    toggleBasicPanel:   () => void;
    toggleDTXFR:        () => void;
    toggleCWF:          () => void;
    toggleControlPanel: () => void;
    toggleKPI:          () => void;
    toggleHeatmap:      () => void;
    togglePassport:     () => void;
    toggleOEEHierarchy: () => void;
}

// ─── Function ────────────────────────────────────────────────────────────────

/**
 * applyPanelActionList — applies an array of PanelAction items to the UI.
 *
 * Maps each UIPanel name to its current state and toggle function.
 * Toggles only when the current state differs from the desired state
 * (idempotent design — avoids redundant state updates).
 *
 * @param actions - Array of panel open/close instructions (or undefined/empty → no-op)
 * @param ui      - UI store state snapshot, injected by caller
 */
export function applyPanelActionList(
    actions: PanelAction[] | undefined,
    ui: UIPanelDeps,
): void {
    /** Guard: nothing to apply */
    if (!actions?.length) return;

    /** Build the panel map once per call (not per action) for O(n) dispatch */
    const panelMap: Record<UIPanel, { current: boolean; toggle: () => void }> = {
        basicPanel:   { current: ui.showBasicPanel,   toggle: ui.toggleBasicPanel },
        dtxfr:        { current: ui.showDTXFR,        toggle: ui.toggleDTXFR },
        cwf:          { current: ui.showCWF,          toggle: ui.toggleCWF },
        controlPanel: { current: ui.showControlPanel, toggle: ui.toggleControlPanel },
        kpi:          { current: ui.showKPI,          toggle: ui.toggleKPI },
        heatmap:      { current: ui.showHeatmap,      toggle: ui.toggleHeatmap },
        passport:     { current: ui.showPassport,     toggle: ui.togglePassport },
        oeeHierarchy: { current: ui.showOEEHierarchy, toggle: ui.toggleOEEHierarchy },
    };

    for (const { panel, state } of actions) {
        const desired = state === 'open';
        const entry   = panelMap[panel];

        /**
         * Only toggle if the current state differs from desired.
         * Entry may be undefined if a new panel was added to UIPanel but not
         * to this map yet — guarded here to fail silently.
         */
        if (entry && entry.current !== desired) {
            entry.toggle();
        }
    }
}
