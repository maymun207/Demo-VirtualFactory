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
            expect(welcome.ctaSteps).toHaveLength(2);
        });

        it('Click #1 — simulationAction is reset (resets sim to clean state)', () => {
            /**
             * Welcome Click #1 resets the simulation so the factory starts
             * from a clean baseline. The simulation starts on Click #2.
             */
            expect(welcome.ctaSteps![0].simulationAction).toBe('reset');
        });

        it('Click #1 — loads scenario SCN-001', () => {
            expect(welcome.ctaSteps![0].scenarioCode).toBe('SCN-001');
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

        it('Click #2 — shows ACT-0 overview slide', () => {
            /** Welcome summary/overview slide shown before transitioning to the factory demo. */
            expect(welcome.ctaSteps![1].ctaLabel).toBe('Continue');
            expect(welcome.ctaSteps![1].slideImageUrl).toBe('/demo/ACT-0.png');
        });

        it('Click #2 — transitions to next stage with simulationAction: start', () => {
            /**
             * simulationAction: 'start' is restored — factory data begins flowing
             * as the presenter moves from the ACT-0 overview slide into the demo.
             */
            expect(welcome.ctaSteps![1].transitionTo).toBe('next');
            expect(welcome.ctaSteps![1].simulationAction).toBe('start');
        });
    });

    // ── No System act specific tests ───────────────────────────────────────────

    describe("No System act (id: 'no-management')", () => {
        const noManagement = DEMO_ACTS[1];

        it("has id 'no-management'", () => {
            expect(noManagement.id).toBe('no-management');
        });

        it('has exactly 3 ctaSteps', () => {
            expect(noManagement.ctaSteps).toHaveLength(3);
        });

        it('Click #1 — shows ACT-1a slide with 2s delay', () => {
            const step = noManagement.ctaSteps![0];
            expect(step.slideImageUrl).toBe('/demo/ACT-1a.png');
            expect(step.delayMs).toBe(2000);
            expect(step.ariaInputEnabled).toBe(true);
            expect(step.simulationAction).toBeUndefined();
        });

        it('Click #1 — loads SCN-001 and closes all 5 panels', () => {
            const step = noManagement.ctaSteps![0];
            expect(step.scenarioCode).toBe('SCN-001');
            const panels = step.panelActions!;
            expect(panels).toHaveLength(5);
            panels.forEach(p => expect(p.state).toBe('close'));
        });

        it('Click #2 — shows live conveyor speed chart (mediaInstruction) + opens controlPanel', () => {
            const step = noManagement.ctaSteps![1];
            /**
             * Chart is now the visual for Click #2 — a live data teaser before the query.
             * No slideImageUrl: the chart component replaces the static image.
             */
            expect(step.mediaInstruction).toBe('chart:conveyor_speed');
            expect(step.slideImageUrl).toBeUndefined();
            /** delayMs ensures the screenText fades in after the chart renders. */
            expect(step.delayMs).toBe(2000);
            expect(step.screenText).toBe("Let's see how conveyor speed varies");
            /** controlPanel opens so the presenter can gesture at the live belt speed slider. */
            const cpAction = step.panelActions?.find(p => p.panel === 'controlPanel');
            expect(cpAction?.state).toBe('open');
        });

        it('Click #3 — chart shows + panelActions close all, no ARIA query, auto-transitions', () => {
            const step = noManagement.ctaSteps![2];
            /**
             * Click #3 is now a pure chart-transition step — no live query.
             * The chart stays visible, controlPanel closes, and the act advances.
             * ARIA will respond via the openingPrompt of the next act instead.
             */
            expect(step.ctaLabel).toBe('Continue');
            expect(step.mediaInstruction).toBe('chart:conveyor_speed');
            expect(step.slideImageUrl).toBeUndefined();
            expect(step.screenText).toBe('We will look into Conveyor speed change closer...');
            /** No live query on this step — ariaLocal and ariaApi are both absent. */
            expect(step.ariaLocal).toBeUndefined();
            expect(step.ariaApi).toBeUndefined();
            /** All 5 panels close (including controlPanel that opened on Click #2). */
            const panels = step.panelActions!;
            expect(panels).toHaveLength(5);
            panels.forEach(p => expect(p.state).toBe('close'));
            expect(step.transitionTo).toBe('next');
        });
    });

    // ── Basic Management act specific tests ────────────────────────────────────

    describe("Basic Management act (id: 'basic-system')", () => {
        const basicSystem = DEMO_ACTS[2];

        it("has id 'basic-system'", () => {
            expect(basicSystem.id).toBe('basic-system');
        });

        it('has exactly 2 ctaSteps', () => {
            expect(basicSystem.ctaSteps).toHaveLength(2);
        });

        it('Click #1 — shows chart + opens basicPanel and controlPanel', () => {
            const step = basicSystem.ctaSteps![0];
            /**
             * Click #1 shows the live conveyor speed chart alongside the Basic Panel
             * so the audience can see OEE fluctuating in real time while watching
             * the belt speed trend. controlPanel opens so the presenter can gesture
             * at the speed slider.
             */
            expect(step.mediaInstruction).toBe('chart:conveyor_speed');
            expect(step.slideImageUrl).toBeUndefined();
            expect(step.screenText).toBe('You can see how OEE fluctuates at the Basic screen');
            expect(step.delayMs).toBe(2000);
            const basicPanelAction = step.panelActions?.find(p => p.panel === 'basicPanel');
            const controlPanelAction = step.panelActions?.find(p => p.panel === 'controlPanel');
            expect(basicPanelAction?.state).toBe('open');
            expect(controlPanelAction?.state).toBe('open');
        });

        it('Click #2 — chart remains, controlPanel closes, basicPanel stays open, auto-advances', () => {
            const step = basicSystem.ctaSteps![1];
            /**
             * Click #2 delivers the punchline: the numbers exist but are hard to
             * interpret without digital traceability. controlPanel closes to refocus
             * the audience on the OEE dashboard. basicPanel stays open.
             */
            expect(step.mediaInstruction).toBe('chart:conveyor_speed');
            expect(step.screenText).toBe('Hard to understand what took place....');
            const basicPanelAction = step.panelActions?.find(p => p.panel === 'basicPanel');
            const controlPanelAction = step.panelActions?.find(p => p.panel === 'controlPanel');
            expect(basicPanelAction?.state).toBe('open');
            expect(controlPanelAction?.state).toBe('close');
            expect(step.transitionTo).toBe('next');
        });
    });

});
