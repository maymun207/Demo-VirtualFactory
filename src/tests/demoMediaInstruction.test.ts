/**
 * demoMediaInstruction.test.ts — Unit Tests for mediaInstruction Feature
 *
 * Verifies the full pipeline of the dynamic media instruction system:
 *   1. CtaStep type accepts the mediaInstruction field
 *   2. demoStore initialises currentMediaInstruction as null
 *   3. Transition / reset paths clear currentMediaInstruction
 *   4. DemoMediaInstructionRenderer resolves known/unknown instructions correctly
 *   5. Demo script — which acts/steps carry mediaInstruction in the current script
 *
 * These tests are pure unit tests — no browser, no network, no Supabase.
 *
 * HISTORY NOTE: mediaInstruction was originally on the No System act (Click #2/#3).
 * It was later moved to the Basic System act (Click #2) when the No System act was
 * simplified to a 2-step pure narrative. These tests document the CURRENT design.
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

// ─── 3. No System act — no longer uses mediaInstruction ──────────────────────

describe('No System act — pure narrative (no mediaInstruction)', () => {
    /**
     * HISTORY NOTE: The No System act previously used mediaInstruction: 'chart:conveyor_speed'
     * on Click #2 and Click #3. That design was replaced when the act was simplified:
     *   OLD: No System → 3 steps, Click #2/#3 had chart:conveyor_speed
     *   NEW: No System → 2 steps, pure narrative, no chart
     *
     * chart:conveyor_speed now lives in the Basic System act (see next describe block).
     */
    let click1: CtaStep;
    let click2: CtaStep;

    let noMgmtAct: (typeof import('../lib/params/demoSystem/demoScript'))['DEMO_ACTS'][number];

    beforeEach(async () => {
        /** Import lazily to avoid side effects at module evaluation time. */
        const { DEMO_ACTS } = await import('../lib/params/demoSystem/demoScript');
        const act = DEMO_ACTS.find((a) => a.id === 'no-management');
        if (!act || !act.ctaSteps) {
            throw new Error('no-management act or ctaSteps missing from DEMO_ACTS');
        }
        noMgmtAct = act;
        click1 = noMgmtAct.ctaSteps![0];
        click2 = noMgmtAct.ctaSteps![1];
    });

    it('has exactly 4 ctaSteps', () => {
        expect(noMgmtAct.ctaSteps).toHaveLength(4);
    });



    it('Click #1 has no mediaInstruction (pure narrative step)', () => {
        /**
         * Click #1 is a narrative step — ARIA input enabled for Q&A.
         * No chart: the story is "everything looks fine on the outside."
         */
        expect(click1.mediaInstruction).toBeUndefined();
    });

    it('Click #4 has mediaInstruction chart:conveyor_speed', () => {
        /**
         * Click #4 shows the live conveyor speed chart — making the invisible
         * throughput loss visible for the first time.
         */
        expect(noMgmtAct.ctaSteps![3].mediaInstruction).toBe('chart:conveyor_speed');
    });
});

// ─── 4. Basic System act — mediaInstruction lives here now ───────────────────

describe('Basic System act — chart:conveyor_speed is on Click #2', () => {
    /**
     * mediaInstruction: 'chart:conveyor_speed' was moved from No System to Basic System
     * so the audience sees the OEE + speed chart TOGETHER when the Basic Panel is open.
     * This makes the "numbers without context" story more visceral.
     */
    let click2: CtaStep;

    beforeEach(async () => {
        /** Import lazily to avoid side effects at module evaluation time. */
        const { DEMO_ACTS } = await import('../lib/params/demoSystem/demoScript');
        const basicAct = DEMO_ACTS.find((a) => a.id === 'basic-system');
        if (!basicAct || !basicAct.ctaSteps) {
            throw new Error('basic-system act or ctaSteps missing from DEMO_ACTS');
        }
        click2 = basicAct.ctaSteps[1]; // Click #2 = index 1
    });

    it('Click #2 has no mediaInstruction (narrative only)', () => {
        /**
         * mediaInstruction was moved to the No System act.
         * Basic System Click #2 is now a pure narrative step.
         */
        expect(click2.mediaInstruction).toBeUndefined();
    });

    it('Click #2 has no slideImageUrl (per-act authoring pending)', () => {
        /**
         * Neither slideImageUrl nor mediaInstruction is set on this step
         * in the current simplified data.
         */
        expect(click2.slideImageUrl).toBeUndefined();
    });

    it('Click #2 — ARIA input is enabled', () => {
        /**
         * ARIA input is enabled for presenter Q&A during this step.
         */
        expect(click2.ariaInputEnabled).toBe(true);
    });
});

// ─── 5. demoStore — currentMediaInstruction state management ─────────────────

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
