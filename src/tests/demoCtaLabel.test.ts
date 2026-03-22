/**
 * demoCtaLabel.test.ts — CTA Button Label Derivation Tests
 *
 * Unit tests for the deriveCtaButtonLabel() pure function
 * (src/lib/utils/demoCtaLabel.ts).
 *
 * Covers all label priority cases:
 *   1. isLastAct = true → always '↺ Restart' (EN) / '↺ Yeniden Başlat' (TR)
 *   2. currentStep.ctaLabel set → use custom label (resolved to language)
 *   3. ctaStepIndex === 0, no ctaLabel → '▶ Start' / '▶ Başla'
 *   4. ctaStepIndex > 0, no ctaLabel → 'Next ›' / 'İleri ›'
 *   5. Empty string ctaLabel → falls through to index-based default
 *   6. Custom label overrides even later steps
 *   7. I18nText object resolves to the correct language
 */

import { describe, it, expect } from 'vitest';
import { deriveCtaButtonLabel } from '../lib/utils/demoCtaLabel';

describe('deriveCtaButtonLabel', () => {

    describe('isLastAct = true (English)', () => {
        it('returns "↺ Restart" regardless of step index', () => {
            expect(deriveCtaButtonLabel({ isLastAct: true, ctaStepIndex: 0, lang: 'en' })).toBe('↺ Restart');
            expect(deriveCtaButtonLabel({ isLastAct: true, ctaStepIndex: 3, lang: 'en' })).toBe('↺ Restart');
        });

        it('ignores any configured ctaLabel on the last act', () => {
            /** Even if a step has a custom label, last act always shows Restart */
            expect(deriveCtaButtonLabel({
                isLastAct: true,
                ctaStepIndex: 0,
                currentStep: { ctaLabel: 'Do not use me' },
                lang: 'en',
            })).toBe('↺ Restart');
        });
    });

    describe('isLastAct = true (Turkish)', () => {
        it('returns "↺ Yeniden Başlat" in Turkish', () => {
            expect(deriveCtaButtonLabel({ isLastAct: true, ctaStepIndex: 0, lang: 'tr' })).toBe('↺ Yeniden Başlat');
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
