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

        it('has exactly 1 ctaStep', () => {
            /**
             * Welcome has a single CTA step: the presenter clicks once, the
             * simulation resets to a clean baseline, and the factory begins.
             * The ACT-0 overview slide is no longer a separate step.
             */
            expect(welcome.ctaSteps).toHaveLength(1);
        });

        it('act has scenarioCode: SCN-001 (loaded at act entry)', () => {
            /**
             * SCN-001 (Optimal Production baseline) is set at the ACT level
             * so it loads immediately when the welcome act begins.
             */
            expect(welcome.scenarioCode).toBe('SCN-001');
        });

        it('Click #1 — simulationAction is reset (resets sim to clean state)', () => {
            /**
             * Welcome Click #1 resets the simulation so the factory starts
             * from a clean baseline.
             */
            expect(welcome.ctaSteps![0].simulationAction).toBe('reset');
        });

        it('Click #1 — shows Welcome.png slide', () => {
            expect(welcome.ctaSteps![0].slideImageUrl).toBe('/demo/Welcome.png');
        });

        it('Click #1 — has a non-empty screenText and a positive delayMs', () => {
            expect(welcome.ctaSteps![0].screenText).toBeTruthy();
            expect(welcome.ctaSteps![0].delayMs).toBeGreaterThan(0);
        });

        it('Click #1 — closes all 5 panels with state close', () => {
            const panels = welcome.ctaSteps![0].panelActions!;
            expect(panels).toHaveLength(5);
            panels.forEach(p => expect(p.state).toBe('close'));
        });

        it('Click #1 — auto-transitions to the next act (transitionTo: next)', () => {
            /** Single step now owns the transition — no separate Click #2 needed. */
            expect(welcome.ctaSteps![0].transitionTo).toBe('next');
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
             *   1. Starts the simulation (SCN-001 still active from welcome)
             *   2. Auto-transitions to the next act — the factory looks fine from outside
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

        it('Click #1 — starts the simulation', () => {
            /**
             * Click #1 fires simulationAction: start, beginning the live data flow.
             */
            const step = noManagement.ctaSteps![0];
            expect(step.simulationAction).toBe('start');
            expect(step.ariaInputEnabled).toBe(false);
            expect(step.delayMs).toBeGreaterThan(0);
            expect(step.screenText).toBeTruthy();
        });

        it('Click #2 — auto-transitions to next act to reveal the hidden tragedy', () => {
            /**
             * Click #2 is the punchline: everything looks fine, but the factory's
             * invisible losses are about to be revealed. transitionTo: next fires.
             */
            const step = noManagement.ctaSteps![1];
            expect(step.transitionTo).toBe('next');
            expect(step.ariaInputEnabled).toBe(false);
            expect(step.screenText).toBeTruthy();
        });
    });

    // ── Basic Management act specific tests ────────────────────────────────────

    describe("Basic Management act (id: 'basic-system')", () => {
        const basicSystem = DEMO_ACTS[2];

        it("has id 'basic-system'", () => {
            expect(basicSystem.id).toBe('basic-system');
        });

        it('has exactly 3 ctaSteps', () => {
            /**
             * Basic System act has 3 steps:
             *   1. Static slide (ACT-1a) + basicPanel opens — audience sees OEE numbers
             *   2. Live conveyor speed chart (mediaInstruction) — visual teaser
             *   3. Static slide (ACT-1b) + ariaApi sets work order — reveals root cause
             */
            expect(basicSystem.ctaSteps).toHaveLength(3);
        });

        it('Click #1 — shows ACT-1a slide and opens basicPanel', () => {
            const step = basicSystem.ctaSteps![0];
            /**
             * First click: show the baseline OEE slide and open the Basic Panel
             * so the audience can see the live KPI numbers alongside the narrative.
             */
            expect(step.slideImageUrl).toBe('/demo/ACT-1a.png');
            expect(step.delayMs).toBeGreaterThan(0);
            expect(step.screenText).toBeTruthy();
            const basicPanelAction = step.panelActions?.find(p => p.panel === 'basicPanel');
            expect(basicPanelAction?.state).toBe('open');
        });

        it('Click #2 — shows live conveyor speed chart (mediaInstruction)', () => {
            const step = basicSystem.ctaSteps![1];
            /**
             * Second click: switch to the live conveyor speed chart so the audience
             * can see the belt speed trend while OEE fluctuates on the Basic Panel.
             */
            expect(step.mediaInstruction).toBe('chart:conveyor_speed');
            expect(step.slideImageUrl).toBeUndefined();
            expect(step.delayMs).toBeGreaterThan(0);
        });

        it('Click #3 — shows ACT-1b slide, triggers ariaApi to set work order, auto-advances', () => {
            const step = basicSystem.ctaSteps![2];
            /**
             * Third click: reveal slide (ACT-1b), fire the CWF ariaApi command to
             * set Work Order (demo production batch), enable ARIA input for Q&A,
             * then auto-transition to the Digital Twin act.
             */
            expect(step.slideImageUrl).toBe('/demo/ACT-1b.png');
            expect(step.ariaApi).toBeTruthy();
            expect(step.ariaInputEnabled).toBe(true);
            expect(step.transitionTo).toBe('next');
            /** basicPanel closes so the audience focuses on the DTXFR passport view */
            const basicPanelAction = step.panelActions?.find(p => p.panel === 'basicPanel');
            expect(basicPanelAction?.state).toBe('close');
        });
    });

});
