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
 *   1. isLastAct   → '↺ Restart' / '↺ Yeniden Başlat'
 *   2. ctaLabel    → the step's configured label (if non-empty, resolved to lang)
 *   3. ctaStepIndex === 0 → '▶ Start' / '▶ Başla'
 *   4. default → 'Next ›' / 'İleri ›'
 *
 * Used by: DemoSidePanel.tsx
 * Tested in: src/tests/demoCtaLabel.test.ts
 */

import type { CtaStep } from '../params/demoSystem/demoScript';
import { resolveText } from '../params/demoSystem/demoScript';
import type { I18nText } from '../params/demoSystem/demoScript';
import type { Language } from '../../store/uiStore';

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
    /** Current interface language */
    lang: Language;
}

// ─── Function ────────────────────────────────────────────────────────────────

/**
 * deriveCtaButtonLabel — pure function for the CTA button label.
 *
 * @param args - Current act/step context
 * @returns  The string to show on the CTA button
 */
export function deriveCtaButtonLabel({ isLastAct, ctaStepIndex, currentStep, lang }: CtaLabelArgs): string {
    /** Final act overrides everything — presenter can only restart */
    if (isLastAct) return lang === 'tr' ? '\u21ba Yeniden Başlat' : '\u21ba Restart';

    /** Step has an explicit custom label configured — resolve to current language */
    const resolved = resolveText(currentStep?.ctaLabel as I18nText | string | undefined, lang);
    if (resolved) return resolved;

    /** First click of the act — show Start to signal demo can begin */
    if (ctaStepIndex === 0) return lang === 'tr' ? '\u25b6 Başla' : '\u25b6 Start';

    /** Subsequent clicks — advance through the act steps */
    return lang === 'tr' ? 'İleri \u203a' : 'Next \u203a';
}
