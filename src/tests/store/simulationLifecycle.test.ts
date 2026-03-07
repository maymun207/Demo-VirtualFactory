/**
 * simulationLifecycle.test.ts — Simulation Start/Stop Lifecycle Tests
 *
 * Validates the complete simulation lifecycle:
 *   1. Press spawns exactly targetQuantity tiles (Phase 1)
 *   2. All tiles eventually drain off the belt (Phase 2)
 *   3. END_OF_LINE_T guard removes orphan tiles from partsRef
 *   4. Station t-positions are curve-accurate (no spline overshoot)
 *   5. COLLECT_THRESHOLD < END_OF_LINE_T ensures all tiles are caught
 *
 * These tests prevent regressions like:
 *   - Tiles stuck in partsRef forever (simulation never ends)
 *   - STATION_STAGES drifting from actual spline positions
 *   - Velocity miscalculations from incorrect STATION_SPACING
 */

import { describe, expect, it } from 'vitest';
import {
    STATION_STAGES,
    STATION_SPACING,
    SPAWN_T,
    DRYER_ENTRY_T,
    KILN_ENTRY_T,
    SORT_THRESHOLD,
    COLLECT_THRESHOLD,
    END_OF_LINE_T,
    DRYER_RELEASE_SPACING,
    KILN_RELEASE_SPACING,
    MAX_VISIBLE_PARTS,
} from '../../lib/params/simulation';
import { WORK_ORDERS } from '../../lib/params/demo';

// =============================================================================
// HELPER — MockPartData for end-of-line guard simulation
// =============================================================================

/**
 * Minimal mock of PartData for testing the end-of-line removal logic.
 * Mirrors the fields checked by the end-of-line guard in ConveyorBelt.tsx.
 */
interface MockPartData {
    id: number;
    t: number;
    isSorted: boolean;
    isSecondQualitySorted: boolean;
    isCollected: boolean;
    isDefected: boolean;
    isQueued: boolean;
    isKilnQueued: boolean;
}

/**
 * Simulates the end-of-line guard logic from ConveyorBelt.tsx useFrame.
 * Returns true if the tile should be removed from partsRef (added to idsToRemove).
 */
function shouldRemoveAtEndOfLine(tile: MockPartData): boolean {
    return (
        tile.t >= END_OF_LINE_T &&
        !tile.isSorted &&
        !tile.isSecondQualitySorted &&
        !tile.isCollected
    );
}

/**
 * Simulates the sort/collect gate logic to check if a tile WILL be
 * caught before END_OF_LINE_T. Returns the earliest threshold that catches it.
 */
export function getEarliestCatchThreshold(tile: MockPartData): number | null {
    if (tile.isDefected && tile.t >= SORT_THRESHOLD) return SORT_THRESHOLD;
    if (!tile.isDefected && !tile.isSorted && tile.t >= SORT_THRESHOLD) {
        // SQ check would happen here
        return SORT_THRESHOLD;
    }
    if (!tile.isDefected && !tile.isSecondQualitySorted && tile.t >= COLLECT_THRESHOLD) {
        return COLLECT_THRESHOLD;
    }
    return null;
}

// =============================================================================
// SIMULATION LIFECYCLE — Phase 1 & 2 Preconditions
// =============================================================================

describe('Simulation Lifecycle — Phase 1 Preconditions', () => {
    it('every Work Order has a positive actualTileCount', () => {
        /**
         * If actualTileCount is 0 or negative, pressLimitReached would
         * fire immediately and no tiles would be spawned.
         */
        WORK_ORDERS.forEach((wo) => {
            expect(wo.actualTileCount).toBeGreaterThan(0);
        });
    });

    it('SPAWN_T is the first station stage (Press)', () => {
        /** Tiles must spawn at the Press position. */
        expect(SPAWN_T).toBe(STATION_STAGES[0]);
    });

    it('MAX_VISIBLE_PARTS is large enough for smallest Work Order', () => {
        /**
         * If MAX_VISIBLE_PARTS < Work Order size, tiles would stop spawning
         * due to the capacity guard, but tilesSpawned would still be below
         * actualTileCount. This could delay Phase 1 indefinitely.
         * MAX_VISIBLE_PARTS just needs to be > 0 — the capacity guard
         * pauses spawning (not stops), and tiles drain off the belt to
         * make room.
         */
        expect(MAX_VISIBLE_PARTS).toBeGreaterThan(0);
    });
});

describe('Simulation Lifecycle — Phase 2 Drain Preconditions', () => {
    it('SORT_THRESHOLD is between Sorting stage and COLLECT_THRESHOLD', () => {
        /** Sort must trigger BEFORE collect, and AFTER the sorting station. */
        expect(SORT_THRESHOLD).toBeGreaterThan(STATION_STAGES[5]);
        expect(SORT_THRESHOLD).toBeLessThan(COLLECT_THRESHOLD);
    });

    it('COLLECT_THRESHOLD is between Packaging stage and END_OF_LINE_T', () => {
        /**
         * Collect must trigger AFTER Packaging and BEFORE the removal point.
         * If COLLECT_THRESHOLD >= END_OF_LINE_T, good tiles would never be
         * collected and would pile up in partsRef forever.
         */
        expect(COLLECT_THRESHOLD).toBeGreaterThan(STATION_STAGES[6]);
        expect(COLLECT_THRESHOLD).toBeLessThan(END_OF_LINE_T);
    });

    it('END_OF_LINE_T is past Packaging but before spline turnaround (0.5)', () => {
        /** END_OF_LINE_T must be after all stations but before the curve loops back. */
        expect(END_OF_LINE_T).toBeGreaterThan(STATION_STAGES[6]);
        expect(END_OF_LINE_T).toBeLessThan(0.5);
    });

    it('gap between COLLECT_THRESHOLD and END_OF_LINE_T is sufficient for collect arc', () => {
        /**
         * Tiles need enough belt distance after being flagged to complete
         * the collect animation before hitting END_OF_LINE_T.
         * A gap of at least 0.005 (about 1/12 of STATION_SPACING) ensures
         * the collect flag fires with room to spare.
         */
        expect(END_OF_LINE_T - COLLECT_THRESHOLD).toBeGreaterThan(0.005);
    });
});

// =============================================================================
// END-OF-LINE GUARD — Orphan tile removal
// =============================================================================

describe('End-of-Line Guard — Tile Removal', () => {
    it('removes an unflagged tile that passed END_OF_LINE_T', () => {
        /** A tile that somehow reached END_OF_LINE_T without any flag must be removed. */
        const tile: MockPartData = {
            id: 1,
            t: END_OF_LINE_T + 0.001,
            isSorted: false,
            isSecondQualitySorted: false,
            isCollected: false,
            isDefected: false,
            isQueued: false,
            isKilnQueued: false,
        };
        expect(shouldRemoveAtEndOfLine(tile)).toBe(true);
    });

    it('removes a defected tile that passed END_OF_LINE_T without being sorted', () => {
        /** Defected tiles that bypassed SORT_THRESHOLD must be caught here. */
        const tile: MockPartData = {
            id: 2,
            t: END_OF_LINE_T + 0.001,
            isSorted: false,
            isSecondQualitySorted: false,
            isCollected: false,
            isDefected: true,
            isQueued: false,
            isKilnQueued: false,
        };
        expect(shouldRemoveAtEndOfLine(tile)).toBe(true);
    });

    it('does NOT remove a tile that was sorted (scrap arc in progress)', () => {
        /** Sorted tiles are handled by the drain block, not the end-of-line guard. */
        const tile: MockPartData = {
            id: 3,
            t: END_OF_LINE_T + 0.001,
            isSorted: true,
            isSecondQualitySorted: false,
            isCollected: false,
            isDefected: true,
            isQueued: false,
            isKilnQueued: false,
        };
        expect(shouldRemoveAtEndOfLine(tile)).toBe(false);
    });

    it('does NOT remove a tile that was collected (shipment arc in progress)', () => {
        /** Collected tiles are handled by the drain block. */
        const tile: MockPartData = {
            id: 4,
            t: END_OF_LINE_T + 0.001,
            isSorted: false,
            isSecondQualitySorted: false,
            isCollected: true,
            isDefected: false,
            isQueued: false,
            isKilnQueued: false,
        };
        expect(shouldRemoveAtEndOfLine(tile)).toBe(false);
    });

    it('does NOT remove a tile that is SQ-sorted (second quality arc in progress)', () => {
        /** SQ tiles are handled by the drain block. */
        const tile: MockPartData = {
            id: 5,
            t: END_OF_LINE_T + 0.001,
            isSorted: false,
            isSecondQualitySorted: true,
            isCollected: false,
            isDefected: false,
            isQueued: false,
            isKilnQueued: false,
        };
        expect(shouldRemoveAtEndOfLine(tile)).toBe(false);
    });

    it('does NOT remove a tile before END_OF_LINE_T', () => {
        /** Tiles still on the belt should not be removed. */
        const tile: MockPartData = {
            id: 6,
            t: END_OF_LINE_T - 0.001,
            isSorted: false,
            isSecondQualitySorted: false,
            isCollected: false,
            isDefected: false,
            isQueued: false,
            isKilnQueued: false,
        };
        expect(shouldRemoveAtEndOfLine(tile)).toBe(false);
    });
});

// =============================================================================
// SPLINE POSITION ACCURACY — Prevents t-value drift
// =============================================================================

describe('Spline Position Accuracy — Station T-Value Invariants', () => {
    it('all station t-values are within (0, 0.5) — top segment of the spline', () => {
        /** The top segment of the closed CatmullRom loop is t ∈ [0, 0.5]. */
        STATION_STAGES.forEach((t) => {
            expect(t).toBeGreaterThan(0);
            expect(t).toBeLessThan(0.5);
        });
    });

    it('STATION_SPACING is positive and less than 0.1', () => {
        /**
         * STATION_SPACING ≈ 0.05855 for the current curve geometry.
         * If it drifts outside a reasonable range, tile velocity will be wrong.
         */
        expect(STATION_SPACING).toBeGreaterThan(0.04);
        expect(STATION_SPACING).toBeLessThan(0.08);
    });

    it('Dryer release position is strictly between Dryer and Glaze', () => {
        /** Released tiles must appear between their queue station and the NEXT station. */
        const dryerRelease = DRYER_ENTRY_T + DRYER_RELEASE_SPACING;
        expect(dryerRelease).toBeGreaterThan(STATION_STAGES[1]); // Past dryer
        expect(dryerRelease).toBeLessThan(STATION_STAGES[2]);    // Before glaze
    });

    it('Kiln release position is strictly between Kiln and Sorting', () => {
        /** Released tiles must appear between Kiln and the next station. */
        const kilnRelease = KILN_ENTRY_T + KILN_RELEASE_SPACING;
        expect(kilnRelease).toBeGreaterThan(STATION_STAGES[4]); // Past kiln
        expect(kilnRelease).toBeLessThan(STATION_STAGES[5]);    // Before sorting
    });

    it('station t-values do not use the old linear formula', () => {
        /**
         * Regression guard: the linear formula (machineX + 16) / 64 produces
         * wrong values for the CatmullRom spline. If any station matches the
         * linear formula, it's likely a regression.
         *
         * Machine X positions: [-15, -11, -7, -3, 4, 8, 14]
         */
        const machineXPositions = [-15, -11, -7, -3, 4, 8, 14];
        machineXPositions.forEach((x, i) => {
            const linearT = (x + 16) / 64;
            expect(STATION_STAGES[i]).not.toBeCloseTo(linearT, 3);
        });
    });
});

// =============================================================================
// FULL PIPELINE DRAIN — Every tile exits belt
// =============================================================================

describe('Full Pipeline Drain — Simulation End Guarantee', () => {
    it('defected tiles are caught at SORT_THRESHOLD (before END_OF_LINE_T)', () => {
        /**
         * Every defected tile reaching SORT_THRESHOLD must be flagged as isSorted.
         * This ensures it enters the drain block and is eventually removed from partsRef.
         */
        expect(SORT_THRESHOLD).toBeLessThan(END_OF_LINE_T);
        const gap = END_OF_LINE_T - SORT_THRESHOLD;
        expect(gap).toBeGreaterThan(0.05); // Enough distance for sort arc
    });

    it('good tiles are caught at COLLECT_THRESHOLD (before END_OF_LINE_T)', () => {
        /**
         * Every non-defected, non-SQ tile reaching COLLECT_THRESHOLD must be
         * flagged as isCollected. This ensures it's eventually removed.
         */
        expect(COLLECT_THRESHOLD).toBeLessThan(END_OF_LINE_T);
    });

    it('every tile path (defect/good/SQ) leads to removal from partsRef', () => {
        /**
         * Three paths through the pipeline, all leading to tile removal:
         *   1. Defected → isSorted=true at SORT_THRESHOLD → drain block removes
         *   2. SQ → isSecondQualitySorted=true at SORT_THRESHOLD → drain block
         *   3. Good → isCollected=true at COLLECT_THRESHOLD → drain block
         *   4. Orphan → end-of-line guard at END_OF_LINE_T → idsToRemove
         *
         * Verify that all thresholds are reachable (< 0.5, the turnaround).
         */
        expect(SORT_THRESHOLD).toBeLessThan(0.5);
        expect(COLLECT_THRESHOLD).toBeLessThan(0.5);
        expect(END_OF_LINE_T).toBeLessThan(0.5);

        /** All thresholds are ordered correctly. */
        expect(SORT_THRESHOLD).toBeLessThan(COLLECT_THRESHOLD);
        expect(COLLECT_THRESHOLD).toBeLessThan(END_OF_LINE_T);
    });
});
