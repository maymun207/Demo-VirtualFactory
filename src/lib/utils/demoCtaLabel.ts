/**
 * demoCtaLabel.ts — CTA Button Label Derivation Utility
 *
 * A pure function that computes the correct label for the CTA button
 * in DemoSidePanel based on the current act and step state.
 *
 * Extracted from DemoSidePanel.tsx into its own module so it can be:
 *  1. Tested independently without mounting the component.
 *  2. Reused across different UI components if needed.
 *
 * Priority order:
 *   1. isLastAct   → '↺ Restart'  (always override on final act)
 *   2. ctaLabel    → the step's configured label (if non-empty)
 *   3. ctaStepIndex === 0 → '▶ Start' (first click ever in the act)
 *   4. default → 'Next ›' (subsequent clicks)
 *
 * Used by: DemoSidePanel.tsx
 * Tested in: src/tests/demoCtaLabel.test.ts
 */

import type { CtaStep } from '../params/demoSystem/demoScript';

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * Arguments passed to deriveCtaButtonLabel.
 * All fields map directly to the relevant demoStore / DEMO_ACTS values.
 */
export interface CtaLabelArgs {
    /** True when the current act is the last act in DEMO_ACTS */
    isLastAct: boolean;
    /** The 0-based index of the next unexecuted CTA step */
    ctaStepIndex: number;
    /**
     * The CtaStep object at ctaStepIndex (if any).
     * Undefined when no more steps remain in this act.
     */
    currentStep?: Pick<CtaStep, 'ctaLabel'>;
}

// ─── Function ────────────────────────────────────────────────────────────────

/**
 * deriveCtaButtonLabel — pure function for the CTA button label.
 *
 * @param args - Current act/step context
 * @returns  The string to show on the CTA button
 */
export function deriveCtaButtonLabel({ isLastAct, ctaStepIndex, currentStep }: CtaLabelArgs): string {
    /** Final act overrides everything — presenter can only restart */
    if (isLastAct) return '\u21ba Restart';

    /** Step has an explicit custom label configured */
    if (currentStep?.ctaLabel) return currentStep.ctaLabel;

    /** First click of the act — show Start to signal demo can begin */
    if (ctaStepIndex === 0) return '\u25b6 Start';

    /** Subsequent clicks — advance through the act steps */
    return 'Next \u203a';
}
