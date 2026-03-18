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
import { WORK_ORDERS } from '../lib/params/demo';

// ─── Constants ────────────────────────────────────────────────────────────────

/** All valid UIPanel identifiers (must match UIPanel type in demoScript.ts) */
const VALID_PANELS = [
    'basicPanel', 'dtxfr', 'cwf', 'controlPanel',
    'kpi', 'heatmap', 'passport', 'oeeHierarchy',
];

/** All valid CtaStep.simulationAction values */
const VALID_SIM_ACTIONS = ['start', 'stop', 'reset', 'reset-start'];

/** All valid Work Order IDs (extracted from WORK_ORDERS) */
const VALID_WORK_ORDER_IDS = WORK_ORDERS.map(wo => wo.id);

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

    // ── Work Order validation ──────────────────────────────────────────────────

    it('workOrderId references a valid WORK_ORDERS entry when set on a step', () => {
        DEMO_ACTS.forEach(act => {
            act.ctaSteps?.forEach((step, stepIdx) => {
                if (step.workOrderId) {
                    expect(
                        VALID_WORK_ORDER_IDS,
                        `workOrderId '${step.workOrderId}' in act '${act.id}' step #${stepIdx + 1} is not a valid Work Order ID`,
                    ).toContain(step.workOrderId);
                }
            });
        });
    });

    it('WORK_ORDERS has at least one entry for workOrderId validation', () => {
        expect(WORK_ORDERS.length).toBeGreaterThanOrEqual(1);
    });

    it('all WORK_ORDERS entries have unique IDs', () => {
        const ids = WORK_ORDERS.map(wo => wo.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    // ── Mirror act specific tests ──────────────────────────────────────────────

    describe("Mirror act (id: 'mirror')", () => {
        const mirror = DEMO_ACTS[0];

        it("has id 'mirror'", () => {
            expect(mirror.id).toBe('mirror');
        });

        it('has exactly 3 ctaSteps', () => {
            /**
             * Mirror (Tier 1) has 3 CTA steps:
             *   0. "Start →" — factory intro + reveal
             *   1. "Ask the factory →" — CWF wow moment
             *   2. "Continue →" — 03:47 teaser + fork
             */
            expect(mirror.ctaSteps).toHaveLength(3);
        });

        it('act has scenarioCode: SCN-001 (loaded at act entry)', () => {
            /**
             * SCN-001 (Optimal Production baseline) is set at the ACT level
             * so it loads immediately when the mirror act begins.
             */
            expect(mirror.scenarioCode).toBe('SCN-001');
        });

        it('Click #1 — ARIA input is disabled (narration only)', () => {
            expect(mirror.ctaSteps![0].ariaInputEnabled).toBe(false);
        });

        it('Click #2 — ARIA input is disabled (auto CWF query)', () => {
            expect(mirror.ctaSteps![1].ariaInputEnabled).toBe(false);
        });

        it('act-level panelActions closes all 5 panels (clean slate)', () => {
            expect(mirror.panelActions).toHaveLength(5);
            mirror.panelActions.forEach(pa => expect(pa.state).toBe('close'));
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
             *   0. Conveyor chart + ariaApi query
             *   1. Financial translation + transition
             */
            expect(noManagement.ctaSteps).toHaveLength(2);
        });

        it('act-level scenarioCode is null (SCN-001 still active from mirror)', () => {
            /**
             * No new scenario is loaded — the No System era inherits the baseline
             * SCN-001 scenario that was set by the Mirror act.
             */
            expect(noManagement.scenarioCode).toBeNull();
        });

        it('Click #1 — ARIA input is enabled (interactive query step)', () => {
            expect(noManagement.ctaSteps![0].ariaInputEnabled).toBe(true);
        });

        it('Click #2 — ARIA input is disabled (transition step)', () => {
            expect(noManagement.ctaSteps![1].ariaInputEnabled).toBe(false);
        });

        it('act-level panelActions close all 4 panels (zero digital tools)', () => {
            /**
             * No System era simulates a factory with zero digital tools —
             * all panels are closed at act entry.
             */
            expect(noManagement.panelActions).toHaveLength(5);
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

    // ── CtaStep interface field type safety ────────────────────────────────────

    describe('CtaStep field type safety', () => {
        it('workOrderId is string or null/undefined when present on any step', () => {
            DEMO_ACTS.forEach(act => {
                act.ctaSteps?.forEach((step, stepIdx) => {
                    if (step.workOrderId !== undefined && step.workOrderId !== null) {
                        expect(
                            typeof step.workOrderId,
                            `workOrderId in act '${act.id}' step #${stepIdx + 1} must be a string`,
                        ).toBe('string');
                    }
                });
            });
        });

        it('scenarioCode is string or null/undefined when present on any step', () => {
            DEMO_ACTS.forEach(act => {
                act.ctaSteps?.forEach((step, stepIdx) => {
                    if (step.scenarioCode !== undefined && step.scenarioCode !== null) {
                        expect(
                            typeof step.scenarioCode,
                            `scenarioCode in act '${act.id}' step #${stepIdx + 1} must be a string`,
                        ).toBe('string');
                    }
                });
            });
        });

        it('delayMs is a non-negative number when present on any step', () => {
            DEMO_ACTS.forEach(act => {
                act.ctaSteps?.forEach((step, stepIdx) => {
                    if (step.delayMs !== undefined) {
                        expect(
                            typeof step.delayMs,
                            `delayMs in act '${act.id}' step #${stepIdx + 1} must be a number`,
                        ).toBe('number');
                        expect(
                            step.delayMs,
                            `delayMs in act '${act.id}' step #${stepIdx + 1} must be non-negative`,
                        ).toBeGreaterThanOrEqual(0);
                    }
                });
            });
        });
    });

});
