/**
 * demoCtaLabel.test.ts — CTA Button Label Derivation Tests
 *
 * Unit tests for the deriveCtaButtonLabel() pure function
 * (src/lib/utils/demoCtaLabel.ts).
 *
 * Covers all label priority cases:
 *   1. isLastAct = true → always '↺ Restart'
 *   2. currentStep.ctaLabel set → use custom label
 *   3. ctaStepIndex === 0, no ctaLabel → '▶ Start'
 *   4. ctaStepIndex > 0, no ctaLabel → 'Next ›'
 *   5. Empty string ctaLabel → falls through to index-based default
 *   6. Custom label overrides even later steps
 */

import { describe, it, expect } from 'vitest';
import { deriveCtaButtonLabel } from '../lib/utils/demoCtaLabel';

describe('deriveCtaButtonLabel', () => {

    describe('isLastAct = true', () => {
        it('returns "↺ Restart" regardless of step index', () => {
            expect(deriveCtaButtonLabel({ isLastAct: true, ctaStepIndex: 0 })).toBe('↺ Restart');
            expect(deriveCtaButtonLabel({ isLastAct: true, ctaStepIndex: 3 })).toBe('↺ Restart');
        });

        it('ignores any configured ctaLabel on the last act', () => {
            /** Even if a step has a custom label, last act always shows Restart */
            expect(deriveCtaButtonLabel({
                isLastAct: true,
                ctaStepIndex: 0,
                currentStep: { ctaLabel: 'Do not use me' },
            })).toBe('↺ Restart');
        });
    });

    describe('isLastAct = false, step has ctaLabel', () => {
        it('returns the custom ctaLabel', () => {
            expect(deriveCtaButtonLabel({
                isLastAct: false,
                ctaStepIndex: 0,
                currentStep: { ctaLabel: 'Start' },
            })).toBe('Start');
        });

        it('custom label works on later steps too', () => {
            expect(deriveCtaButtonLabel({
                isLastAct: false,
                ctaStepIndex: 2,
                currentStep: { ctaLabel: 'Show Results' },
            })).toBe('Show Results');
        });
    });

    describe('isLastAct = false, no ctaLabel (or empty string)', () => {
        it('returns "▶ Start" on the first step (index 0)', () => {
            expect(deriveCtaButtonLabel({ isLastAct: false, ctaStepIndex: 0 })).toBe('▶ Start');
        });

        it('returns "▶ Start" on index 0 with undefined currentStep', () => {
            expect(deriveCtaButtonLabel({
                isLastAct: false,
                ctaStepIndex: 0,
                currentStep: undefined,
            })).toBe('▶ Start');
        });

        it('returns "▶ Start" if ctaLabel is empty string (falls through)', () => {
            expect(deriveCtaButtonLabel({
                isLastAct: false,
                ctaStepIndex: 0,
                currentStep: { ctaLabel: '' },
            })).toBe('▶ Start');
        });

        it('returns "Next ›" on second step (index 1)', () => {
            expect(deriveCtaButtonLabel({ isLastAct: false, ctaStepIndex: 1 })).toBe('Next ›');
        });

        it('returns "Next ›" on any step > 0', () => {
            [1, 2, 3, 10].forEach(idx => {
                expect(deriveCtaButtonLabel({ isLastAct: false, ctaStepIndex: idx })).toBe('Next ›');
            });
        });
    });

});
