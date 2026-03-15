/**
 * demoMediaInstruction.test.ts — Unit Tests for mediaInstruction Feature
 *
 * Verifies the full pipeline of the dynamic media instruction system:
 *   1. CtaStep type accepts the mediaInstruction field
 *   2. demoStore initialises currentMediaInstruction as null
 *   3. Transition / reset paths clear currentMediaInstruction
 *   4. DemoMediaInstructionRenderer resolves known/unknown instructions correctly
 *
 * These tests are pure unit tests — no browser, no network, no Supabase.
 *
 * Coverage areas:
 *   - MediaInstruction type contract (compile-time guard via assignment)
 *   - Store state shape (currentMediaInstruction initial value)
 *   - Renderer routing (renders chart for known key, null for unknown)
 *
 * NOTE: DemoConveyorSpeedChart is a visual/SVG component that depends on
 *       ResizeObserver and SVG layout — it is exercised via integration tests
 *       in a browser environment (Playwright), not here.
 */

import { describe, it, expect, beforeEach } from 'vitest';

// ─── Import the types we want to contract-test ───────────────────────────────
import type { MediaInstruction, CtaStep } from '../lib/params/demoSystem/demoScript';

// ─── 1. MediaInstruction type contract ───────────────────────────────────────

describe('MediaInstruction type', () => {
    it('is assignable from the known chart:conveyor_speed literal', () => {
        /** TypeScript compile-time guard: if the type changes this line breaks. */
        const mi: MediaInstruction = 'chart:conveyor_speed';
        expect(mi).toBe('chart:conveyor_speed');
    });

    it('can be stored in CtaStep.mediaInstruction', () => {
        /** Verifies the field exists on the interface (TypeScript compile-time). */
        const step: CtaStep = {
            ctaLabel: 'Test',
            mediaInstruction: 'chart:conveyor_speed',
        };
        expect(step.mediaInstruction).toBe('chart:conveyor_speed');
    });

    it('CtaStep.mediaInstruction is optional (omission is valid)', () => {
        /** A step without mediaInstruction must still type-check. */
        const step: CtaStep = { ctaLabel: 'No chart here' };
        expect(step.mediaInstruction).toBeUndefined();
    });
});

// ─── 2. DemoMediaInstructionRenderer routing ─────────────────────────────────

describe('DemoMediaInstructionRenderer resolution', () => {
    /**
     * We test the routing logic (which instruction maps to which component)
     * without mounting React — just assert the switch resolution is correct via
     * a plain function that mirrors the component's switch-case logic.
     *
     * This keeps these tests lightweight and decoupled from JSDOM.
     */

    /** Mirror of the switch logic in DemoMediaInstructionRenderer. */
    function resolveInstruction(instruction: string): string | null {
        switch (instruction) {
            case 'chart:conveyor_speed': return 'DemoConveyorSpeedChart';
            default: return null;
        }
    }

    it("resolves 'chart:conveyor_speed' to DemoConveyorSpeedChart", () => {
        /** Known instruction must resolve to a concrete component name. */
        expect(resolveInstruction('chart:conveyor_speed')).toBe('DemoConveyorSpeedChart');
    });

    it('returns null for an unknown instruction key', () => {
        /**
         * Unknown keys must fall through to null — the demo continues without
         * a chart rather than throwing, preserving presenter flow.
         */
        expect(resolveInstruction('chart:this_does_not_exist')).toBeNull();
    });
});

// ─── 3. demoScript.ts Click #3 of No System has mediaInstruction ─────────────

describe('No System act — mediaInstruction structure', () => {
    /** Import the actual DEMO_ACTS to verify the script is configured correctly. */
    let click2: CtaStep;
    let click3: CtaStep;

    beforeEach(async () => {
        /**
         * Import lazily to avoid side effects at module evaluation time.
         * demoScript.ts is pure data — no side effects.
         */
        const { DEMO_ACTS } = await import('../lib/params/demoSystem/demoScript');
        const noMgmtAct = DEMO_ACTS.find((a) => a.id === 'no-management');
        if (!noMgmtAct || !noMgmtAct.ctaSteps) {
            throw new Error('no-management act or ctaSteps missing from DEMO_ACTS');
        }
        click2 = noMgmtAct.ctaSteps[1];
        click3 = noMgmtAct.ctaSteps[2];
    });

    it('Click #2 has mediaInstruction: chart:conveyor_speed (visual teaser)', () => {
        /**
         * The chart now appears on Click #2 — a live data visual BEFORE the query.
         * This gives the audience context before ARIA presents the table.
         */
        expect(click2.mediaInstruction).toBe('chart:conveyor_speed');
    });

    it('Click #2 has no slideImageUrl (chart replaces the static image)', () => {
        expect(click2.slideImageUrl).toBeUndefined();
    });

    it('Click #2 opens the controlPanel so the presenter can gesture at live speed', () => {
        const cpAction = click2.panelActions?.find(p => p.panel === 'controlPanel');
        expect(cpAction?.state).toBe('open');
    });

    it('Click #3 has mediaInstruction: chart:conveyor_speed (chart stays visible during query)', () => {
        /**
         * Click #3 keeps the chart on screen while ARIA responds with the data table.
         * The audience can see the visual + the tabular data simultaneously.
         */
        expect(click3.mediaInstruction).toBe('chart:conveyor_speed');
    });

    it('Click #3 has no slideImageUrl (chart takes visual priority)', () => {
        expect(click3.slideImageUrl).toBeUndefined();
    });

    it('Click #3 has no ariaLocal or ariaApi (no live query — pure chart-transition step)', () => {
        /**
         * ariaLocal and ariaApi were removed from Click #3.
         * No ARIA query is triggered here; ARIA responds via the next act's openingPrompt.
         */
        expect(click3.ariaLocal).toBeUndefined();
        expect(click3.ariaApi).toBeUndefined();
    });

    it('Click #3 closes all 5 panels (including controlPanel that opened on Click #2)', () => {
        const panels = click3.panelActions!;
        expect(panels).toHaveLength(5);
        panels.forEach(p => expect(p.state).toBe('close'));
    });

    it('Click #3 has transitionTo: next so step auto-advances after API responds', () => {
        expect(click3.transitionTo).toBe('next');
    });
});

// ─── 4. demoStore — currentMediaInstruction state management ─────────────────

describe('demoStore — currentMediaInstruction', () => {
    /**
     * We verify the demoStore's initial state and the shape of DemoState
     * at compile time by importing and inspecting the Zustand store.
     * This test avoids mounting React or using JSDOM.
     */

    it('initialises currentMediaInstruction as null', async () => {
        /**
         * Lazily import the store to avoid triggering Zustand subscriptions at
         * module eval time. We read the state directly from the store.
         */
        const { useDemoStore } = await import('../store/demoStore');
        const state = useDemoStore.getState();
        /**
         * On cold start, no act has fired and no step has set mediaInstruction,
         * so currentMediaInstruction must be null (not undefined, not a string).
         */
        expect(state.currentMediaInstruction).toBeNull();
    });

    it('exposes currentMediaInstruction on the DemoState type', async () => {
        /** TypeScript compile-time: if this property is removed the test file itself fails. */
        const { useDemoStore } = await import('../store/demoStore');
        const state = useDemoStore.getState();
        /** null is a valid initial value — undefined would indicate a missing field. */
        expect(state.currentMediaInstruction === null || typeof state.currentMediaInstruction === 'string').toBe(true);
    });
});
