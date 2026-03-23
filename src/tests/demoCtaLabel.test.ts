/**
 * demoCtaLabel.test.ts — CTA Button Label Derivation Tests
 *
 * Unit tests for the deriveCtaButtonLabel() pure function
 * (src/lib/utils/demoCtaLabel.ts).
 *
 * Covers all label priority cases:
 *   1. currentStep.ctaLabel set → use custom label (always takes priority)
 *   2. isLastAct = true, no ctaLabel → '↺ Restart' / '↺ Yeniden Başlat'
 *   3. ctaStepIndex === 0, no ctaLabel → '▶ Start' / '▶ Başla'
 *   4. ctaStepIndex > 0, no ctaLabel → 'Next ›' / 'İleri ›'
 *   5. Empty string ctaLabel → falls through to index-based default
 *   6. Custom label on last act → uses the custom label, NOT Restart
 */

import { describe, it, expect } from 'vitest';
import { deriveCtaButtonLabel } from '../lib/utils/demoCtaLabel';

describe('deriveCtaButtonLabel', () => {

    describe('isLastAct = true (English)', () => {
        it('returns "↺ Restart" when no custom ctaLabel is set', () => {
            expect(deriveCtaButtonLabel({ isLastAct: true, ctaStepIndex: 0, lang: 'en' })).toBe('↺ Restart');
            expect(deriveCtaButtonLabel({ isLastAct: true, ctaStepIndex: 3, lang: 'en' })).toBe('↺ Restart');
        });

        it('uses custom ctaLabel even on the last act', () => {
            /** Custom label takes priority — e.g. "Thank you!" on the Close act */
            expect(deriveCtaButtonLabel({
                isLastAct: true,
                ctaStepIndex: 0,
                currentStep: { ctaLabel: 'Thank you!' },
                lang: 'en',
            })).toBe('Thank you!');
        });

        it('resolves I18nText ctaLabel on last act', () => {
            expect(deriveCtaButtonLabel({
                isLastAct: true,
                ctaStepIndex: 0,
                currentStep: { ctaLabel: { en: 'Thank you!', tr: 'Teşekkürler!' } },
                lang: 'en',
            })).toBe('Thank you!');
        });
    });

    describe('isLastAct = true (Turkish)', () => {
        it('returns "↺ Yeniden Başlat" when no custom ctaLabel', () => {
            expect(deriveCtaButtonLabel({ isLastAct: true, ctaStepIndex: 0, lang: 'tr' })).toBe('↺ Yeniden Başlat');
        });

        it('resolves I18nText ctaLabel to Turkish on last act', () => {
            expect(deriveCtaButtonLabel({
                isLastAct: true,
                ctaStepIndex: 0,
                currentStep: { ctaLabel: { en: 'Thank you!', tr: 'Teşekkürler!' } },
                lang: 'tr',
            })).toBe('Teşekkürler!');
        });
    });

    describe('isLastAct = false, step has ctaLabel', () => {
        it('returns the custom ctaLabel (plain string)', () => {
            expect(deriveCtaButtonLabel({
                isLastAct: false,
                ctaStepIndex: 0,
                currentStep: { ctaLabel: 'Start' },
                lang: 'en',
            })).toBe('Start');
        });

        it('custom label works on later steps too', () => {
            expect(deriveCtaButtonLabel({
                isLastAct: false,
                ctaStepIndex: 2,
                currentStep: { ctaLabel: 'Show Results' },
                lang: 'en',
            })).toBe('Show Results');
        });

        it('resolves I18nText ctaLabel to English', () => {
            expect(deriveCtaButtonLabel({
                isLastAct: false,
                ctaStepIndex: 0,
                currentStep: { ctaLabel: { en: 'Begin', tr: 'Başla' } },
                lang: 'en',
            })).toBe('Begin');
        });

        it('resolves I18nText ctaLabel to Turkish', () => {
            expect(deriveCtaButtonLabel({
                isLastAct: false,
                ctaStepIndex: 0,
                currentStep: { ctaLabel: { en: 'Begin', tr: 'Başla' } },
                lang: 'tr',
            })).toBe('Başla');
        });
    });

    describe('isLastAct = false, no ctaLabel (or empty string) — English', () => {
        it('returns "▶ Start" on the first step (index 0)', () => {
            expect(deriveCtaButtonLabel({ isLastAct: false, ctaStepIndex: 0, lang: 'en' })).toBe('▶ Start');
        });

        it('returns "▶ Start" on index 0 with undefined currentStep', () => {
            expect(deriveCtaButtonLabel({
                isLastAct: false,
                ctaStepIndex: 0,
                currentStep: undefined,
                lang: 'en',
            })).toBe('▶ Start');
        });

        it('returns "▶ Start" if ctaLabel is empty string (falls through)', () => {
            expect(deriveCtaButtonLabel({
                isLastAct: false,
                ctaStepIndex: 0,
                currentStep: { ctaLabel: '' },
                lang: 'en',
            })).toBe('▶ Start');
        });

        it('returns "Next ›" on second step (index 1)', () => {
            expect(deriveCtaButtonLabel({ isLastAct: false, ctaStepIndex: 1, lang: 'en' })).toBe('Next ›');
        });

        it('returns "Next ›" on any step > 0', () => {
            [1, 2, 3, 10].forEach(idx => {
                expect(deriveCtaButtonLabel({ isLastAct: false, ctaStepIndex: idx, lang: 'en' })).toBe('Next ›');
            });
        });
    });

    describe('isLastAct = false, no ctaLabel — Turkish', () => {
        it('returns "▶ Başla" on first step', () => {
            expect(deriveCtaButtonLabel({ isLastAct: false, ctaStepIndex: 0, lang: 'tr' })).toBe('▶ Başla');
        });

        it('returns "İleri ›" on later steps', () => {
            expect(deriveCtaButtonLabel({ isLastAct: false, ctaStepIndex: 1, lang: 'tr' })).toBe('İleri ›');
            expect(deriveCtaButtonLabel({ isLastAct: false, ctaStepIndex: 3, lang: 'tr' })).toBe('İleri ›');
        });
    });

});
