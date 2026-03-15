/**
 * simActionExecutor.ts — Simulation Action Executor Utility
 *
 * A pure function that executes a CtaStep.simulationAction by calling
 * the appropriate method on the simulation store.
 *
 * Extracted from demoStore.ts handleCtaClick() into its own module so it can be:
 *  1. Tested independently using dependency injection (no module mocking needed).
 *  2. Reused if other parts of the system need to trigger sim actions.
 *
 * Supported actions:
 *   'start'       — Start the sim only if not already running
 *   'stop'        — Stop the sim idempotently
 *   'reset'       — Reset all simulation state (leaves stopped)
 *   'reset-start' — Reset then immediately start (clean demo opening)
 *   undefined/''  — No-op (leaves simulation state unchanged)
 *
 * Used by: demoStore.ts → handleCtaClick()
 * Tested in: src/tests/simActionExecutor.test.ts
 */

import type { CtaStep } from '../params/demoSystem/demoScript';

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * SimActionDeps — the simulation store methods required by the executor.
 *
 * Passed in by the caller (demoStore reads from useSimulationStore.getState()).
 * Using dependency injection makes this function purely testable.
 */
export interface SimActionDeps {
    /** True when the simulation is currently running */
    isDataFlowing: boolean;
    /** Toggle start/stop — starts if stopped, stops if running */
    toggleDataFlow: () => void;
    /** Idempotent stop — safe to call even when already stopped */
    stopDataFlow: () => void;
    /** Full reset: clears all clocks/counters/tiles, leaves sim stopped */
    resetSimulation: () => void;
}

// ─── Function ────────────────────────────────────────────────────────────────

/**
 * executeSimulationAction — runs the appropriate simulation store call
 * for the given CtaStep simulationAction value.
 *
 * @param action - The simulationAction value from CtaStep (or undefined)
 * @param sim    - Simulation store methods (injected by caller)
 */
export function executeSimulationAction(
    action: CtaStep['simulationAction'] | undefined,
    sim: SimActionDeps,
): void {
    switch (action) {
        case 'start':
            /**
             * Start only if currently stopped.
             * Calling toggleDataFlow on a running sim would STOP it — wrong.
             */
            if (!sim.isDataFlowing) sim.toggleDataFlow();
            break;

        case 'stop':
            /** Idempotent stop — safe to call even when already stopped */
            sim.stopDataFlow();
            break;

        case 'reset':
            /**
             * Full reset: clears all state (clocks, counters, tiles).
             * Leaves the simulation in stopped state after reset.
             */
            sim.resetSimulation();
            break;

        case 'reset-start':
            /**
             * Reset first (clears isDataFlowing → false), then immediately
             * start. Order is critical: reset must precede toggleDataFlow
             * so the fresh start is from a clean baseline.
             * Used by the Welcome stage for a clean first demo run.
             */
            sim.resetSimulation();
            sim.toggleDataFlow();
            break;

        default:
            /** undefined or '' → leave simulation state unchanged, no-op */
            break;
    }
}
