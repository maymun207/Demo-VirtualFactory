/**
 * simActionExecutor.test.ts — Simulation Action Executor Tests
 *
 * Unit tests for the executeSimulationAction() pure function
 * (src/lib/utils/simActionExecutor.ts).
 *
 * Uses dependency injection — a mock "sim" object is passed instead of the
 * real useSimulationStore. No module mocking is required.
 *
 * Covers all 4 action types and edge cases:
 *   'start'       — starts only if stopped; no-op if already running
 *   'stop'        — always calls stopDataFlow
 *   'reset'       — calls resetSimulation, does NOT start
 *   'reset-start' — calls reset THEN toggle in that order
 *   undefined     — complete no-op
 */

import { describe, it, expect, vi } from 'vitest';
import { executeSimulationAction } from '../lib/utils/simActionExecutor';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * makeMockSim — creates a fresh SimActionDeps mock object.
 * All methods are vi.fn() stubs so their call counts can be asserted.
 * The return type is intentionally inferred so TypeScript resolves the mock
 * functions as vitest's native Mock type (which is callable and carries
 * .mockImplementation(), .toHaveBeenCalledOnce(), etc.) rather than requiring
 * the impossible (() => void) & Mock<...> intersection that an explicit
 * annotation would force.
 *
 * @param isDataFlowing - Simulates whether the sim is currently running
 */
function makeMockSim(isDataFlowing = false) {
    return {
        isDataFlowing,
        toggleDataFlow:  vi.fn(),
        stopDataFlow:    vi.fn(),
        resetSimulation: vi.fn(),
    };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('executeSimulationAction', () => {

    // ── 'start' ─────────────────────────────────────────────────────────────

    describe("action: 'start'", () => {
        it('calls toggleDataFlow when sim is currently stopped', () => {
            const sim = makeMockSim(false);
            executeSimulationAction('start', sim);
            expect(sim.toggleDataFlow).toHaveBeenCalledOnce();
        });

        it('does NOT call toggleDataFlow when sim is already running', () => {
            /** Calling toggle on a running sim would STOP it — must be guarded */
            const sim = makeMockSim(true);
            executeSimulationAction('start', sim);
            expect(sim.toggleDataFlow).not.toHaveBeenCalled();
        });

        it('never calls resetSimulation or stopDataFlow', () => {
            const sim = makeMockSim(false);
            executeSimulationAction('start', sim);
            expect(sim.resetSimulation).not.toHaveBeenCalled();
            expect(sim.stopDataFlow).not.toHaveBeenCalled();
        });
    });

    // ── 'stop' ──────────────────────────────────────────────────────────────

    describe("action: 'stop'", () => {
        it('calls stopDataFlow when sim is running', () => {
            const sim = makeMockSim(true);
            executeSimulationAction('stop', sim);
            expect(sim.stopDataFlow).toHaveBeenCalledOnce();
        });

        it('calls stopDataFlow even when sim is already stopped (idempotent)', () => {
            const sim = makeMockSim(false);
            executeSimulationAction('stop', sim);
            expect(sim.stopDataFlow).toHaveBeenCalledOnce();
        });

        it('never calls toggleDataFlow or resetSimulation', () => {
            const sim = makeMockSim(true);
            executeSimulationAction('stop', sim);
            expect(sim.toggleDataFlow).not.toHaveBeenCalled();
            expect(sim.resetSimulation).not.toHaveBeenCalled();
        });
    });

    // ── 'reset' ─────────────────────────────────────────────────────────────

    describe("action: 'reset'", () => {
        it('calls resetSimulation', () => {
            const sim = makeMockSim(true);
            executeSimulationAction('reset', sim);
            expect(sim.resetSimulation).toHaveBeenCalledOnce();
        });

        it('does NOT start the simulation after reset (leaves stopped)', () => {
            const sim = makeMockSim(false);
            executeSimulationAction('reset', sim);
            expect(sim.toggleDataFlow).not.toHaveBeenCalled();
        });

        it('does not call stopDataFlow', () => {
            const sim = makeMockSim(true);
            executeSimulationAction('reset', sim);
            expect(sim.stopDataFlow).not.toHaveBeenCalled();
        });
    });

    // ── 'reset-start' ───────────────────────────────────────────────────────

    describe("action: 'reset-start'", () => {
        it('calls resetSimulation then toggleDataFlow in that exact order', () => {
            const sim = makeMockSim(false);
            const callOrder: string[] = [];
            sim.resetSimulation.mockImplementation(() => callOrder.push('reset'));
            sim.toggleDataFlow.mockImplementation(()  => callOrder.push('toggle'));

            executeSimulationAction('reset-start', sim);

            /** Order is critical: reset clears isDataFlowing, then toggle starts */
            expect(callOrder).toEqual(['reset', 'toggle']);
        });

        it('calls both functions even when sim is already running', () => {
            /** isDataFlowing=true should not block the reset-start flow */
            const sim = makeMockSim(true);
            executeSimulationAction('reset-start', sim);
            expect(sim.resetSimulation).toHaveBeenCalledOnce();
            expect(sim.toggleDataFlow).toHaveBeenCalledOnce();
        });

        it('does not call stopDataFlow', () => {
            const sim = makeMockSim(false);
            executeSimulationAction('reset-start', sim);
            expect(sim.stopDataFlow).not.toHaveBeenCalled();
        });
    });

    // ── undefined / no-op ────────────────────────────────────────────────────

    describe('action: undefined (no-op)', () => {
        it('calls no simulation methods for undefined', () => {
            const sim = makeMockSim(false);
            executeSimulationAction(undefined, sim);
            expect(sim.toggleDataFlow).not.toHaveBeenCalled();
            expect(sim.stopDataFlow).not.toHaveBeenCalled();
            expect(sim.resetSimulation).not.toHaveBeenCalled();
        });
    });

});
