/**
 * oeeHierarchyTable.test.ts — Unit Tests for OEE Hierarchy 3D Table Config
 *
 * Validates all configurable constants in the oeeHierarchyTable params module:
 *   - Bilingual column headers exist for each of the 6 metrics
 *   - Color threshold values are numeric and non-negative
 *   - 3D world position and rotation are valid tuples
 *   - Table dimension constants are positive numbers
 *   - Text size constants are positive numbers
 *   - Material color strings are valid hex colors
 *   - Bilingual labels exist for panel title, factory row, no-data state
 *
 * Uses the same Vitest patterns as params.test.ts for consistency.
 */

import { describe, it, expect } from 'vitest';
import {
    OEE_HIERARCHY_TITLE,
    OEE_HIERARCHY_COLUMNS,
    OEE_HIERARCHY_THRESHOLDS,
    OEE_HIERARCHY_FACTORY_LABEL,
    OEE_HIERARCHY_LEVEL_LABELS,
    OEE_HIERARCHY_NO_DATA,
    OEE_TABLE_3D_POSITION,
    OEE_TABLE_3D_ROTATION,
    OEE_TABLE_3D_WIDTH,
    OEE_TABLE_3D_HEIGHT,
    OEE_TABLE_3D_BASE_DEPTH,
    OEE_TABLE_3D_TITLE_SIZE,
    OEE_TABLE_3D_HEADER_SIZE,
    OEE_TABLE_3D_FACTORY_TEXT_SIZE,
    OEE_TABLE_3D_LINE_TEXT_SIZE,
    OEE_TABLE_3D_MACHINE_TEXT_SIZE,
    OEE_TABLE_3D_BG_COLOR,
    OEE_TABLE_3D_BORDER_COLOR,
} from '../lib/params';

// ═══════════════════════════════════════════════════════════════════
// COLUMN HEADERS — Bilingual labels for all 6 metrics
// ═══════════════════════════════════════════════════════════════════

describe('OEE_HIERARCHY_COLUMNS', () => {
    it('contains exactly 6 metric columns', () => {
        /** There must be exactly 6 metrics: OEE, Scrap, Defect, kWh, Gas, CO₂ */
        expect(OEE_HIERARCHY_COLUMNS).toHaveLength(6);
    });

    it('each column has both Turkish and English labels', () => {
        /** Every column must have non-empty bilingual labels */
        for (const col of OEE_HIERARCHY_COLUMNS) {
            expect(typeof col.labelTr).toBe('string');
            expect(col.labelTr.length).toBeGreaterThan(0);
            expect(typeof col.labelEn).toBe('string');
            expect(col.labelEn.length).toBeGreaterThan(0);
        }
    });

    it('each column has a unique id', () => {
        /** Column IDs must be unique to prevent data lookup collisions */
        const ids = OEE_HIERARCHY_COLUMNS.map((c) => c.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('each column has non-negative integer decimal places', () => {
        /** Decimal places must be a non-negative integer for formatting */
        for (const col of OEE_HIERARCHY_COLUMNS) {
            expect(Number.isInteger(col.decimals)).toBe(true);
            expect(col.decimals).toBeGreaterThanOrEqual(0);
        }
    });

    it('each column has a string unit (may be empty)', () => {
        /** Unit suffix must be a string (empty string is allowed for raw counts) */
        for (const col of OEE_HIERARCHY_COLUMNS) {
            expect(typeof col.unit).toBe('string');
        }
    });
});

// ═══════════════════════════════════════════════════════════════════
// COLOR THRESHOLDS — Per-metric threshold validation
// ═══════════════════════════════════════════════════════════════════

describe('OEE_HIERARCHY_THRESHOLDS', () => {
    it('has a threshold entry for each column ID', () => {
        /** Every metric column must have a corresponding threshold config */
        for (const col of OEE_HIERARCHY_COLUMNS) {
            expect(OEE_HIERARCHY_THRESHOLDS).toHaveProperty(col.id);
        }
    });

    it('each threshold has numeric good and warn values', () => {
        /** Threshold values must be numeric for comparison logic */
        for (const key of Object.keys(OEE_HIERARCHY_THRESHOLDS)) {
            const t = OEE_HIERARCHY_THRESHOLDS[key as keyof typeof OEE_HIERARCHY_THRESHOLDS];
            expect(typeof t.good).toBe('number');
            expect(typeof t.warn).toBe('number');
        }
    });

    it('each threshold has a boolean invert flag', () => {
        /** Invert flag determines whether lower-is-better logic applies */
        for (const key of Object.keys(OEE_HIERARCHY_THRESHOLDS)) {
            const t = OEE_HIERARCHY_THRESHOLDS[key as keyof typeof OEE_HIERARCHY_THRESHOLDS];
            expect(typeof t.invert).toBe('boolean');
        }
    });

    it('threshold good and warn are non-negative', () => {
        /** Threshold cutoffs should never be negative */
        for (const key of Object.keys(OEE_HIERARCHY_THRESHOLDS)) {
            const t = OEE_HIERARCHY_THRESHOLDS[key as keyof typeof OEE_HIERARCHY_THRESHOLDS];
            expect(t.good).toBeGreaterThanOrEqual(0);
            expect(t.warn).toBeGreaterThanOrEqual(0);
        }
    });
});

// ═══════════════════════════════════════════════════════════════════
// 3D WORLD POSITION + ROTATION — Valid [x,y,z] tuples
// ═══════════════════════════════════════════════════════════════════

describe('3D Position & Rotation', () => {
    it('position is a 3-element tuple of numbers', () => {
        /** World position must be [x, y, z] */
        expect(OEE_TABLE_3D_POSITION).toHaveLength(3);
        OEE_TABLE_3D_POSITION.forEach((v) => expect(typeof v).toBe('number'));
    });

    it('rotation is a 3-element tuple of numbers', () => {
        /** Euler rotation must be [x, y, z] */
        expect(OEE_TABLE_3D_ROTATION).toHaveLength(3);
        OEE_TABLE_3D_ROTATION.forEach((v) => expect(typeof v).toBe('number'));
    });
});

// ═══════════════════════════════════════════════════════════════════
// 3D TABLE DIMENSIONS — Positive size values
// ═══════════════════════════════════════════════════════════════════

describe('3D Table Dimensions', () => {
    it('width is a positive number', () => {
        expect(OEE_TABLE_3D_WIDTH).toBeGreaterThan(0);
    });

    it('height is a positive number', () => {
        expect(OEE_TABLE_3D_HEIGHT).toBeGreaterThan(0);
    });

    it('base depth is a positive number', () => {
        expect(OEE_TABLE_3D_BASE_DEPTH).toBeGreaterThan(0);
    });
});

// ═══════════════════════════════════════════════════════════════════
// 3D TEXT SIZES — Positive font sizes
// ═══════════════════════════════════════════════════════════════════

describe('3D Text Sizes', () => {
    it('all text sizes are positive numbers', () => {
        /** Every text size constant must be > 0 for Three.js Text rendering */
        expect(OEE_TABLE_3D_TITLE_SIZE).toBeGreaterThan(0);
        expect(OEE_TABLE_3D_HEADER_SIZE).toBeGreaterThan(0);
        expect(OEE_TABLE_3D_FACTORY_TEXT_SIZE).toBeGreaterThan(0);
        expect(OEE_TABLE_3D_LINE_TEXT_SIZE).toBeGreaterThan(0);
        expect(OEE_TABLE_3D_MACHINE_TEXT_SIZE).toBeGreaterThan(0);
    });

    it('hierarchy text sizes are descending: factory > line > machine', () => {
        /** Visual hierarchy requires larger text for higher-level rows */
        expect(OEE_TABLE_3D_FACTORY_TEXT_SIZE).toBeGreaterThan(OEE_TABLE_3D_LINE_TEXT_SIZE);
        expect(OEE_TABLE_3D_LINE_TEXT_SIZE).toBeGreaterThan(OEE_TABLE_3D_MACHINE_TEXT_SIZE);
    });
});

// ═══════════════════════════════════════════════════════════════════
// 3D MATERIAL COLORS — Valid hex color strings
// ═══════════════════════════════════════════════════════════════════

describe('3D Material Colors', () => {
    it('background color is a valid hex string', () => {
        expect(OEE_TABLE_3D_BG_COLOR).toMatch(/^#[0-9a-fA-F]{6}$/);
    });

    it('border color is a valid hex string', () => {
        expect(OEE_TABLE_3D_BORDER_COLOR).toMatch(/^#[0-9a-fA-F]{6}$/);
    });
});

// ═══════════════════════════════════════════════════════════════════
// BILINGUAL LABELS — Title, factory row, level labels, no-data
// ═══════════════════════════════════════════════════════════════════

describe('Bilingual Labels', () => {
    it('panel title has both tr and en strings', () => {
        expect(typeof OEE_HIERARCHY_TITLE.tr).toBe('string');
        expect(OEE_HIERARCHY_TITLE.tr.length).toBeGreaterThan(0);
        expect(typeof OEE_HIERARCHY_TITLE.en).toBe('string');
        expect(OEE_HIERARCHY_TITLE.en.length).toBeGreaterThan(0);
    });

    it('factory label has both tr and en strings', () => {
        expect(typeof OEE_HIERARCHY_FACTORY_LABEL.tr).toBe('string');
        expect(OEE_HIERARCHY_FACTORY_LABEL.tr.length).toBeGreaterThan(0);
        expect(typeof OEE_HIERARCHY_FACTORY_LABEL.en).toBe('string');
        expect(OEE_HIERARCHY_FACTORY_LABEL.en.length).toBeGreaterThan(0);
    });

    it('level labels have all 4 strings', () => {
        expect(typeof OEE_HIERARCHY_LEVEL_LABELS.lineTr).toBe('string');
        expect(typeof OEE_HIERARCHY_LEVEL_LABELS.lineEn).toBe('string');
        expect(typeof OEE_HIERARCHY_LEVEL_LABELS.machineTr).toBe('string');
        expect(typeof OEE_HIERARCHY_LEVEL_LABELS.machineEn).toBe('string');
    });

    it('no-data placeholder has both tr and en strings', () => {
        expect(typeof OEE_HIERARCHY_NO_DATA.tr).toBe('string');
        expect(OEE_HIERARCHY_NO_DATA.tr.length).toBeGreaterThan(0);
        expect(typeof OEE_HIERARCHY_NO_DATA.en).toBe('string');
        expect(OEE_HIERARCHY_NO_DATA.en.length).toBeGreaterThan(0);
    });
});
