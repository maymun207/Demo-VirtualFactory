/**
 * Header.test.ts — Unit Tests for Header Parameter and Style Logic
 *
 * Validates that the header button font style is centralized and consistent
 * with the 'Basic' button's original design.
 */

import { describe, expect, it } from 'vitest';
import {
    HEADER_BUTTON_FONT,
    HEADER_BUTTON_SHAPE,
    HEADER_BUTTON_PADDING,
    HEADER_BUTTON_ICON_GAP,
} from '../../lib/params';

// =============================================================================
// HEADER BUTTON FONT STYLE
// =============================================================================

describe('Header Button Font Style', () => {
    it('is defined correctly in Params', () => {
        /** 
         * The font style must match the 'Basic' button requirement:
         * text-xs (font size) and font-medium (font weight).
         */
        expect(HEADER_BUTTON_FONT).toBe('text-xs font-medium');
    });

    it('contains expected Tailwind classes', () => {
        /** Verify both size and weight classes are present in the constant. */
        expect(HEADER_BUTTON_FONT).toContain('text-xs');
        expect(HEADER_BUTTON_FONT).toContain('font-medium');
    });
});

// =============================================================================
// HEADER BUTTON SHAPE & LAYOUT
// =============================================================================

describe('Header Button Shape & Layout', () => {
    it('defines shape correctly in Params', () => {
        /** Shape must match the 'Basic' button's contour (rounded-lg). */
        expect(HEADER_BUTTON_SHAPE).toBe('rounded-lg');
    });

    it('defines padding correctly in Params', () => {
        /** Standard padding for all header buttons. */
        expect(HEADER_BUTTON_PADDING).toBe('px-3 py-1.5');
    });

    it('defines icon gap correctly in Params', () => {
        /** Standard gap between icon and text. */
        expect(HEADER_BUTTON_ICON_GAP).toBe('gap-1.5');
    });
});
