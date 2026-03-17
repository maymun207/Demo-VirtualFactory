/**
 * cwfWorkOrder.test.ts — Unit Tests for CWF Work Order Action Params
 *
 * Tests the params module (cwfWorkOrder.ts) introduced to support the
 * `set_work_order` CWF UI action. Covers:
 *
 *  [T-01] CWF_SET_WORK_ORDER_ACTION constant value
 *  [T-02] CWF_VALID_WORK_ORDER_IDS contains the expected 3 entries
 *  [T-03] isValidWorkOrderId accepts each known Work Order ID
 *  [T-04] isValidWorkOrderId rejects unknown string
 *  [T-05] isValidWorkOrderId rejects empty string
 *  [T-06] isValidWorkOrderId rejects undefined
 *  [T-07] WORK_ORDER_DISPLAY_LABELS has an entry for each valid ID
 *  [T-08] WORK_ORDER_DISPLAY_LABELS values are non-empty strings
 */

import { describe, it, expect } from 'vitest';
import {
    CWF_SET_WORK_ORDER_ACTION,
    CWF_VALID_WORK_ORDER_IDS,
    isValidWorkOrderId,
    WORK_ORDER_DISPLAY_LABELS,
} from '../lib/params/cwfWorkOrder';

// =============================================================================
// [T-01] ACTION TYPE CONSTANT
// =============================================================================

describe('CWF_SET_WORK_ORDER_ACTION', () => {
    /**
     * [T-01] The constant must match the string that CWF backend sends
     * in the execute_ui_action.action_type field. Changing this value
     * without updating api/cwf/chat.ts will silently break the feature.
     */
    it('[T-01] equals the expected action_type string', () => {
        expect(CWF_SET_WORK_ORDER_ACTION).toBe('set_work_order');
    });
});

// =============================================================================
// [T-02] VALID WORK ORDER IDS ARRAY
// =============================================================================

describe('CWF_VALID_WORK_ORDER_IDS', () => {
    /**
     * [T-02] All 3 Work Orders defined in lib/params/demo.ts must have
     * matching entries in CWF_VALID_WORK_ORDER_IDS. Add a case here
     * whenever a new Work Order is added to demo.ts.
     */
    it('[T-02] contains exactly WorkID#1, WorkID#2, WorkID#3', () => {
        /** Cast to mutable array for toContain / toHaveLength assertions */
        const ids = CWF_VALID_WORK_ORDER_IDS as readonly string[];
        expect(ids).toHaveLength(3);
        expect(ids).toContain('WorkID#1');
        expect(ids).toContain('WorkID#2');
        expect(ids).toContain('WorkID#3');
    });
});

// =============================================================================
// [T-03 – T-06] isValidWorkOrderId TYPE GUARD
// =============================================================================

describe('isValidWorkOrderId', () => {
    /**
     * [T-03] Each of the 3 known Work Order IDs must pass validation.
     * CWF sends exactly these strings as action_value for set_work_order.
     */
    it('[T-03] accepts WorkID#1', () => {
        expect(isValidWorkOrderId('WorkID#1')).toBe(true);
    });

    it('[T-03] accepts WorkID#2', () => {
        expect(isValidWorkOrderId('WorkID#2')).toBe(true);
    });

    it('[T-03] accepts WorkID#3', () => {
        expect(isValidWorkOrderId('WorkID#3')).toBe(true);
    });

    /**
     * [T-04] An unknown Work Order ID (e.g. a non-existent WorkID#9)
     * must be rejected so it never reaches setSelectedWorkOrderId().
     */
    it('[T-04] rejects an unknown Work Order ID', () => {
        expect(isValidWorkOrderId('WorkID#9')).toBe(false);
    });

    /**
     * [T-05] An empty string must be rejected.
     * This guards against CWF sending action_value="" (missing value).
     */
    it('[T-05] rejects an empty string', () => {
        expect(isValidWorkOrderId('')).toBe(false);
    });

    /**
     * [T-06] undefined must be rejected.
     * The listener calls isValidWorkOrderId(actionValue) where actionValue
     * may be undefined when no "| value:" token appears in the reason field.
     */
    it('[T-06] rejects undefined', () => {
        expect(isValidWorkOrderId(undefined)).toBe(false);
    });
});

// =============================================================================
// [T-07 – T-08] WORK_ORDER_DISPLAY_LABELS
// =============================================================================

describe('WORK_ORDER_DISPLAY_LABELS', () => {
    /**
     * [T-07] Every valid Work Order ID must have a corresponding label.
     * Missing labels cause a TypeScript error at compile time, but this
     * test provides an explicit runtime guarantee.
     */
    it('[T-07] has a label for every valid Work Order ID', () => {
        for (const id of CWF_VALID_WORK_ORDER_IDS) {
            expect(WORK_ORDER_DISPLAY_LABELS[id]).toBeDefined();
        }
    });

    /**
     * [T-08] Each label must be a non-empty string.
     * An empty label would produce a confusing confirmation message.
     */
    it('[T-08] all label values are non-empty strings', () => {
        for (const id of CWF_VALID_WORK_ORDER_IDS) {
            const label = WORK_ORDER_DISPLAY_LABELS[id];
            expect(typeof label).toBe('string');
            expect(label.length).toBeGreaterThan(0);
        }
    });
});
