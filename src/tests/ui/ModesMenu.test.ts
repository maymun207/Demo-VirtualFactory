/**
 * ModesMenu.test.ts — Unit Tests for ModesMenu UI Parameters
 *
 * Validates that the responsive menu's critical layout parameters
 * (stacking order and minimum breadth) are correctly defined to ensure
 * a consistent and accessible mobile experience.
 */

import { describe, expect, it } from 'vitest';
import {
    MODES_DROPDOWN_MIN_WIDTH,
    MODES_DROPDOWN_Z_INDEX,
} from '../../lib/params/ui';

describe('ModesMenu Responsive Parameters', () => {
    it('defines dropdown minimum width correctly', () => {
        /** 
         * The dropdown needs a minimum width to ensure labels 
         * don't wrap and remains touch-target friendly.
         */
        expect(MODES_DROPDOWN_MIN_WIDTH).toBe('min-w-[160px]');
    });

    it('contains standard Tailwind min-width class', () => {
        /** Verify the class follows expected Tailwind naming conventions. */
        expect(MODES_DROPDOWN_MIN_WIDTH).toContain('min-w-');
    });

    it('defines z-index correctly for stacking', () => {
        /** 
         * The modes menu must float above all other header elements.
         * z-100 is the designated layer for this dropdown.
         */
        expect(MODES_DROPDOWN_Z_INDEX).toBe('z-100');
    });

    it('uses a safe high z-index value', () => {
        /** Verify the z-index is reasonably high but compliant with the project's Tailwind config. */
        expect(MODES_DROPDOWN_Z_INDEX).toBe('z-100');
    });
});
