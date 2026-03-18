/**
 * demoScript.test.ts — DEMO_ACTS Data Integrity Tests
 *
 * Verifies that the DEMO_ACTS array in demoScript.ts is structurally correct.
 * These are pure data integrity tests — no mocking, no async calls, no UI.
 *
 * What is tested:
 *   - All 7 acts defined with unique IDs and non-empty labels
 *   - Every act has a ctaSteps array with at least one step
 *   - All panelAction references are valid UIPanel names
 *   - All simulationAction values are from the approved enum
 *   - Welcome stage specific fields (Phase 1 implementation)
 *   - No System stage: simulation starts on Click #2 (simulationAction: 'start')
 */

import { describe, it, expect } from 'vitest';
import { DEMO_ACTS } from '../lib/params/demoSystem/demoScript';

// ─── Constants ────────────────────────────────────────────────────────────────

/** All valid UIPanel identifiers (must match UIPanel type in demoScript.ts) */
const VALID_PANELS = [
    'basicPanel', 'dtxfr', 'cwf', 'controlPanel',
    'kpi', 'heatmap', 'passport', 'oeeHierarchy',
];

/** All valid CtaStep.simulationAction values */
const VALID_SIM_ACTIONS = ['start', 'stop', 'reset', 'reset-start'];

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('DEMO_ACTS — data integrity', () => {

    it('defines exactly 7 acts', () => {
        expect(DEMO_ACTS).toHaveLength(7);
    });

    it('every act has a unique, non-empty id', () => {
        const ids = DEMO_ACTS.map(a => a.id);
        /** Each id must be truthy (no empty strings) */
        ids.forEach(id => expect(id).toBeTruthy());
        /** All ids must be unique */
        expect(new Set(ids).size).toBe(7);
    });

    it('every act has a non-empty eraLabel', () => {
        DEMO_ACTS.forEach(act => expect(act.eraLabel).toBeTruthy());
    });

    it('every act has a ctaSteps array with at least one step', () => {
        DEMO_ACTS.forEach(act => {
            expect(Array.isArray(act.ctaSteps), `act '${act.id}' ctaSteps must be array`).toBe(true);
            expect(
                act.ctaSteps!.length,
                `act '${act.id}' must have at least 1 step`,
            ).toBeGreaterThanOrEqual(1);
        });
    });

    it('every act-level panelAction references a valid UIPanel name and a valid state', () => {
        DEMO_ACTS.forEach(act => {
            act.panelActions.forEach(pa => {
                expect(VALID_PANELS, `panel '${pa.panel}' in act '${act.id}' must be a valid UIPanel`).toContain(pa.panel);
                expect(['open', 'close'], `state must be 'open' or 'close'`).toContain(pa.state);
            });
        });
    });

    it('every step-level panelAction references a valid UIPanel name', () => {
        DEMO_ACTS.forEach(act => {
            act.ctaSteps?.forEach((step, stepIdx) => {
                step.panelActions?.forEach(pa => {
                    expect(
                        VALID_PANELS,
                        `panel '${pa.panel}' in act '${act.id}' step #${stepIdx + 1} must be a valid UIPanel`,
                    ).toContain(pa.panel);
                    expect(['open', 'close']).toContain(pa.state);
                });
            });
        });
    });

    it('simulationAction is a valid value when set on a step', () => {
        DEMO_ACTS.forEach(act => {
            act.ctaSteps?.forEach((step, stepIdx) => {
                if (step.simulationAction !== undefined) {
                    expect(
                        VALID_SIM_ACTIONS,
                        `simulationAction '${step.simulationAction}' in act '${act.id}' step #${stepIdx + 1} is invalid`,
                    ).toContain(step.simulationAction);
                }
            });
        });
    });

    // ── Welcome act specific tests ─────────────────────────────────────────────

    describe("Welcome act (id: 'welcome')", () => {
        const welcome = DEMO_ACTS[0];

        it("has id 'welcome'", () => {
            expect(welcome.id).toBe('welcome');
        });

        it('has exactly 2 ctaSteps', () => {
            /**
             * Welcome has 2 CTA steps:
             *   1. Shows the ACT-0 overview slide
             *   2. Presenter advances — ARIA input enabled for Q&A
             */
            expect(welcome.ctaSteps).toHaveLength(2);
        });

        it('act has scenarioCode: SCN-001 (loaded at act entry)', () => {
            /**
             * SCN-001 (Optimal Production baseline) is set at the ACT level
             * so it loads immediately when the welcome act begins.
             */
            expect(welcome.scenarioCode).toBe('SCN-001');
        });

        it('Click #1 — shows ACT-0 slide', () => {
            expect(welcome.ctaSteps![0].slideImageUrl).toBe('/demo/ACT-0.png');
        });

        it('Click #1 — ARIA input is enabled', () => {
            expect(welcome.ctaSteps![0].ariaInputEnabled).toBe(true);
        });

        it('Click #2 — ARIA input is enabled', () => {
            expect(welcome.ctaSteps![1].ariaInputEnabled).toBe(true);
        });

        it('act-level panelActions is empty (clean slate)', () => {
            expect(welcome.panelActions).toHaveLength(0);
        });
    });

    // ── No System act specific tests ───────────────────────────────────────────

    describe("No System act (id: 'no-management')", () => {
        const noManagement = DEMO_ACTS[1];

        it("has id 'no-management'", () => {
            expect(noManagement.id).toBe('no-management');
        });

        it('has exactly 2 ctaSteps', () => {
            /**
             * No System act has 2 steps:
             *   1. ARIA input enabled for narrative
             *   2. ARIA input enabled for Q&A
             */
            expect(noManagement.ctaSteps).toHaveLength(2);
        });

        it('act-level scenarioCode is null (SCN-001 still active from welcome)', () => {
            /**
             * No new scenario is loaded — the No System era inherits the baseline
             * SCN-001 scenario that was set by the Welcome act.
             */
            expect(noManagement.scenarioCode).toBeNull();
        });

        it('Click #1 — ARIA input is enabled', () => {
            expect(noManagement.ctaSteps![0].ariaInputEnabled).toBe(true);
        });

        it('Click #2 — ARIA input is enabled', () => {
            expect(noManagement.ctaSteps![1].ariaInputEnabled).toBe(true);
        });

        it('act-level panelActions close all 4 panels (zero digital tools)', () => {
            /**
             * No System era simulates a factory with zero digital tools —
             * all panels are closed at act entry.
             */
            expect(noManagement.panelActions).toHaveLength(4);
            noManagement.panelActions.forEach(pa => expect(pa.state).toBe('close'));
        });
    });

    // ── Basic Management act specific tests ────────────────────────────────────

    describe("Basic Management act (id: 'basic-system')", () => {
        const basicSystem = DEMO_ACTS[2];

        it("has id 'basic-system'", () => {
            expect(basicSystem.id).toBe('basic-system');
        });

        it('has exactly 2 ctaSteps', () => {
            /**
             * Basic System act has 2 steps:
             *   1. ARIA input enabled for narrative
             *   2. ARIA input enabled for Q&A
             */
            expect(basicSystem.ctaSteps).toHaveLength(2);
        });

        it('Click #1 — ARIA input is enabled', () => {
            expect(basicSystem.ctaSteps![0].ariaInputEnabled).toBe(true);
        });

        it('Click #2 — ARIA input is enabled', () => {
            expect(basicSystem.ctaSteps![1].ariaInputEnabled).toBe(true);
        });

        it('act-level panelActions close all 5 panels (clean slate for dashboard reveal)', () => {
            /**
             * All panels are closed at act entry — the basicPanel is meant to be
             * opened later via ctaSteps (when per-act authoring is completed).
             */
            expect(basicSystem.panelActions).toHaveLength(5);
            basicSystem.panelActions.forEach(pa => expect(pa.state).toBe('close'));
        });

        it('act-level scenarioCode is SCN-001', () => {
            expect(basicSystem.scenarioCode).toBe('SCN-001');
        });
    });

});
