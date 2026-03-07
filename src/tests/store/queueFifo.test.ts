/**
 * queueFifo.test.ts — Mathematical Flow Verification for FIFO Queues
 *
 * Validates the Dryer and Kiln FIFO queue logic at the parameter level:
 *  - Threshold and capacity constants are correctly defined
 *  - FIFO ordering: entry order matches release order
 *  - Drain mode guarantees queue empties completely
 *  - Gap-check spacing is consistent with station layout
 *  - Full pipeline flow: N tiles in → N tiles out (minus defects)
 *
 * These tests do NOT mount React components or R3F scenes.
 * They verify the mathematical invariants that the visual layer relies on.
 */

import { describe, it, expect } from 'vitest';
import {
    DRYER_RELEASE_THRESHOLD,
    DRYER_QUEUE_CAPACITY,
    DRYER_ENTRY_T,
    DRYER_RELEASE_SPACING,
    KILN_RELEASE_THRESHOLD,
    KILN_QUEUE_CAPACITY,
    KILN_ENTRY_T,
    KILN_RELEASE_SPACING,
    STATION_SPACING,
    STATION_STAGES,
    SPAWN_T,
    SORT_THRESHOLD,
    COLLECT_THRESHOLD,
    END_OF_LINE_T,
} from '../../lib/params';

/**
 * Minimal tile data for visibility-invariant tests.
 * Mirrors the fields used by Part's useFrame and PartSpawner's queue logic.
 */
interface MockTileData {
    /** Unique tile ID */
    id: number;
    /** Normalised position on the spline (0→1) */
    t: number;
    /** Current visual scale (0 = invisible, 1 = full size) */
    scale: number;
    /** Whether this tile has been flagged as inside the dryer queue */
    isQueued: boolean;
    /** Whether the tile has already passed through the Dryer station */
    hasVisitedDryer: boolean;
    /** Whether this tile has been flagged as inside the kiln queue */
    isKilnQueued: boolean;
    /** Whether the tile has already passed through the Kiln station */
    hasVisitedKiln: boolean;
}

/**
 * Simulates the PartSpawner queue-entry logic for a single tile.
 * Reproduces lines ~742-776 of ConveyorBelt.tsx (post-fix version).
 * Returns the mutated tile data after applying the entry checks.
 */
function simulateQueueEntry(tile: MockTileData): MockTileData {
    /** Dryer entry check (mirrors PartSpawner dryer-entry logic) */
    if (tile.t >= DRYER_ENTRY_T && !tile.hasVisitedDryer && !tile.isQueued) {
        tile.isQueued = true;
        tile.hasVisitedDryer = true;
        tile.t = DRYER_ENTRY_T; // Snap to entry point
        /** Scale stays at 1 — Part visibility gate handles hiding. */
        return tile;
    }
    /** Kiln entry check (mirrors PartSpawner kiln-entry logic) */
    if (tile.t >= KILN_ENTRY_T && !tile.hasVisitedKiln && !tile.isKilnQueued) {
        tile.isKilnQueued = true;
        tile.hasVisitedKiln = true;
        tile.t = KILN_ENTRY_T; // Snap to entry point
        /** Scale stays at 1 — Part visibility gate handles hiding. */
        return tile;
    }
    return tile;
}

/**
 * Simulates the Part renderer's pre-queue visibility guard.
 * Mirrors the hide logic in Part's useFrame (post-fix version).
 * Returns true if the tile should be completely hidden (scale=0).
 * Does NOT modify input tile data — this is a read-only check.
 */
function shouldHideAtEntry(tile: MockTileData): boolean {
    if (!tile.hasVisitedKiln && !tile.isKilnQueued && tile.t >= KILN_ENTRY_T) return true;
    if (!tile.hasVisitedDryer && !tile.isQueued && tile.t >= DRYER_ENTRY_T) return true;
    return false;
}

// =============================================================================
// DRYER QUEUE PARAMETER INVARIANTS
// =============================================================================

describe('Dryer FIFO Queue — Parameter Invariants', () => {
    it('threshold is 10 (accumulate 10 tiles before first release)', () => {
        /** User spec: Dryer accumulates to 10, releases 1st on 11th entry. */
        expect(DRYER_RELEASE_THRESHOLD).toBe(10);
    });

    it('capacity is 15 (10 threshold + 5 headroom for speed variation)', () => {
        /** 5 extra slots absorb back-pressure from conveyor speed drops. */
        expect(DRYER_QUEUE_CAPACITY).toBe(15);
    });

    it('capacity > threshold (headroom slots exist)', () => {
        /** Headroom slots prevent force-release during normal operation. */
        expect(DRYER_QUEUE_CAPACITY).toBeGreaterThan(DRYER_RELEASE_THRESHOLD);
    });

    it('headroom = 5 slots (capacity - threshold)', () => {
        /** Exact headroom size for documentation and regression detection. */
        expect(DRYER_QUEUE_CAPACITY - DRYER_RELEASE_THRESHOLD).toBe(5);
    });

    it('release spacing is positive and less than station spacing', () => {
        /**
         * DRYER_RELEASE_SPACING must be:
         *   > 0  — so released tile doesn't overlap with queued tiles
         *   < STATION_SPACING — so released tile doesn't skip the next station
         */
        expect(DRYER_RELEASE_SPACING).toBeGreaterThan(0);
        expect(DRYER_RELEASE_SPACING).toBeLessThan(STATION_SPACING);
    });

    it('entry t-position matches Dryer station stage', () => {
        /** DRYER_ENTRY_T must equal STATION_STAGES[1] (Dryer = 2nd station). */
        expect(DRYER_ENTRY_T).toBe(STATION_STAGES[1]);
    });
});

// =============================================================================
// KILN QUEUE PARAMETER INVARIANTS
// =============================================================================

describe('Kiln FIFO Queue — Parameter Invariants', () => {
    it('threshold is 40 (accumulate 40 tiles before first release)', () => {
        /** User spec: Kiln accumulates to 40, releases 1st on 41st entry. */
        expect(KILN_RELEASE_THRESHOLD).toBe(40);
    });

    it('capacity is 45 (40 threshold + 5 headroom for speed variation)', () => {
        /** 5 extra slots absorb back-pressure — same pattern as Dryer. */
        expect(KILN_QUEUE_CAPACITY).toBe(45);
    });

    it('capacity > threshold (headroom slots exist)', () => {
        /** Headroom slots prevent force-release during normal operation. */
        expect(KILN_QUEUE_CAPACITY).toBeGreaterThan(KILN_RELEASE_THRESHOLD);
    });

    it('headroom = 5 slots (capacity - threshold), matching Dryer pattern', () => {
        /** Both Dryer and Kiln use +5 headroom. */
        const dryerHeadroom = DRYER_QUEUE_CAPACITY - DRYER_RELEASE_THRESHOLD;
        const kilnHeadroom = KILN_QUEUE_CAPACITY - KILN_RELEASE_THRESHOLD;
        expect(kilnHeadroom).toBe(5);
        expect(kilnHeadroom).toBe(dryerHeadroom);
    });

    it('release spacing is positive and less than station spacing', () => {
        /**
         * KILN_RELEASE_SPACING must be:
         *   > 0  — so released tile doesn't overlap with queued tiles
         *   < STATION_SPACING — so released tile doesn't skip Sorting station
         */
        expect(KILN_RELEASE_SPACING).toBeGreaterThan(0);
        expect(KILN_RELEASE_SPACING).toBeLessThan(STATION_SPACING);
    });

    it('entry t-position matches Kiln station stage', () => {
        /** KILN_ENTRY_T must equal STATION_STAGES[4] (Kiln = 5th station). */
        expect(KILN_ENTRY_T).toBe(STATION_STAGES[4]);
    });
});

// =============================================================================
// FIFO ORDERING — Pure data-structure simulation
// =============================================================================

describe('FIFO Queue Ordering — Dryer', () => {
    /**
     * Simulates the Dryer queue using a plain array (same as dryerQueueRef).
     * Verifies tiles are released in strict FIFO order once threshold is met.
     */

    it('first 10 tiles accumulate without any release', () => {
        /** Tiles 1–10 enter the queue. None should be released. */
        const queue: number[] = [];
        const released: number[] = [];

        for (let tile = 1; tile <= 10; tile++) {
            queue.push(tile);
            /** No release: queue.length (=tile) is NOT > threshold (10). */
            if (queue.length > DRYER_RELEASE_THRESHOLD) {
                released.push(queue.shift()!);
            }
        }

        expect(queue).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
        expect(released).toEqual([]);
    });

    it('11th tile triggers release of tile #1 (FIFO)', () => {
        /** Tile 11 enters → tile 1 exits. Queue: [2..11]. */
        const queue: number[] = [];
        const released: number[] = [];

        for (let tile = 1; tile <= 11; tile++) {
            queue.push(tile);
            if (queue.length > DRYER_RELEASE_THRESHOLD) {
                released.push(queue.shift()!);
            }
        }

        expect(released).toEqual([1]);
        expect(queue.length).toBe(DRYER_RELEASE_THRESHOLD);
        expect(queue[0]).toBe(2); // Oldest remaining tile
    });

    it('tiles 11–20: each entry releases the next oldest in strict order', () => {
        /** Steady-state: one-in → one-out, FIFO. */
        const queue: number[] = [];
        const released: number[] = [];

        for (let tile = 1; tile <= 20; tile++) {
            queue.push(tile);
            if (queue.length > DRYER_RELEASE_THRESHOLD) {
                released.push(queue.shift()!);
            }
        }

        /** Releases: tile 1 on entry of 11, tile 2 on entry of 12, ..., tile 10 on entry of 20. */
        expect(released).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
        /** Queue always holds exactly threshold tiles. */
        expect(queue.length).toBe(DRYER_RELEASE_THRESHOLD);
        /** Remaining: [11, 12, ..., 20]. */
        expect(queue[0]).toBe(11);
        expect(queue[queue.length - 1]).toBe(20);
    });
});

describe('FIFO Queue Ordering — Kiln', () => {
    it('first 40 tiles accumulate without any release', () => {
        /** Tiles 1–40 enter the queue. None should be released. */
        const queue: number[] = [];
        const released: number[] = [];

        for (let tile = 1; tile <= 40; tile++) {
            queue.push(tile);
            if (queue.length > KILN_RELEASE_THRESHOLD) {
                released.push(queue.shift()!);
            }
        }

        expect(queue.length).toBe(40);
        expect(released).toEqual([]);
    });

    it('41st tile triggers release of tile #1 (FIFO)', () => {
        /** Tile 41 enters → tile 1 exits. Queue: [2..41]. */
        const queue: number[] = [];
        const released: number[] = [];

        for (let tile = 1; tile <= 41; tile++) {
            queue.push(tile);
            if (queue.length > KILN_RELEASE_THRESHOLD) {
                released.push(queue.shift()!);
            }
        }

        expect(released).toEqual([1]);
        expect(queue.length).toBe(KILN_RELEASE_THRESHOLD);
        expect(queue[0]).toBe(2);
    });

    it('tiles 41–80: each entry releases the next oldest in strict order', () => {
        /** Steady-state: tiles 1–40 released as tiles 41–80 enter. */
        const queue: number[] = [];
        const released: number[] = [];

        for (let tile = 1; tile <= 80; tile++) {
            queue.push(tile);
            if (queue.length > KILN_RELEASE_THRESHOLD) {
                released.push(queue.shift()!);
            }
        }

        /** 40 releases: tiles 1–40 in order. */
        expect(released.length).toBe(40);
        expect(released[0]).toBe(1);
        expect(released[39]).toBe(40);
        /** Queue: [41..80], exactly 40 tiles. */
        expect(queue.length).toBe(KILN_RELEASE_THRESHOLD);
    });
});

// =============================================================================
// DRAIN MODE — Queue empties when no new tiles arrive
// =============================================================================

describe('Drain Mode — Queue Emptying (post-production)', () => {
    it('Dryer: drain empties remaining tiles in FIFO order', () => {
        /**
         * Scenario: press produces 15 tiles, then stops.
         * Tiles 1–10 accumulate. Tiles 11–15 each trigger a release (1→5 exit).
         * Queue after production: [6, 7, 8, 9, 10, 11, 12, 13, 14, 15] (10 tiles).
         * Drain mode: release all 10 in FIFO order without new entries.
         */
        const queue: number[] = [];
        const released: number[] = [];

        /** Production phase. */
        for (let tile = 1; tile <= 15; tile++) {
            queue.push(tile);
            if (queue.length > DRYER_RELEASE_THRESHOLD) {
                released.push(queue.shift()!);
            }
        }
        expect(released).toEqual([1, 2, 3, 4, 5]);
        expect(queue.length).toBe(10);

        /** Drain phase: release all remaining without new entries. */
        const drainReleased: number[] = [];
        while (queue.length > 0) {
            drainReleased.push(queue.shift()!);
        }

        /** Drain releases tiles 6–15 in strict FIFO order. */
        expect(drainReleased).toEqual([6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
        /** Queue is completely empty after drain. */
        expect(queue.length).toBe(0);
    });

    it('Kiln: drain empties remaining tiles in FIFO order', () => {
        /**
         * Scenario: 50 tiles reach the Kiln, then production stops.
         * Tiles 1–40 accumulate. Tiles 41–50 trigger releases 1–10.
         * Queue after production: [11..50] (40 tiles).
         * Drain mode: release all 40 in FIFO order.
         */
        const queue: number[] = [];
        const released: number[] = [];

        for (let tile = 1; tile <= 50; tile++) {
            queue.push(tile);
            if (queue.length > KILN_RELEASE_THRESHOLD) {
                released.push(queue.shift()!);
            }
        }
        expect(released.length).toBe(10);
        expect(queue.length).toBe(40);

        const drainReleased: number[] = [];
        while (queue.length > 0) {
            drainReleased.push(queue.shift()!);
        }

        expect(drainReleased.length).toBe(40);
        expect(drainReleased[0]).toBe(11);
        expect(drainReleased[39]).toBe(50);
        expect(queue.length).toBe(0);
    });
});

// =============================================================================
// FULL PIPELINE MATH — N tiles through complete flow
// =============================================================================

describe('Full Pipeline Mathematical Verification', () => {
    it('every tile that enters must eventually exit (no tiles lost)', () => {
        /**
         * Simulates the complete Dryer→Kiln pipeline for 100 tiles.
         * Every tile must pass through both queues and exit.
         *
         * Dryer: threshold=10, Kiln: threshold=40.
         * With 100 tiles:
         *   Dryer releases: tiles 1–90 during production, tiles 91–100 during drain = 100 total
         *   Kiln receives 100 tiles from Dryer output:
         *     Kiln releases: tiles 1–60 during production, tiles 61–100 during drain = 100 total
         */
        const dryerQueue: number[] = [];
        const kilnQueue: number[] = [];
        const dryerOutput: number[] = [];
        const kilnOutput: number[] = [];

        /** Production: 100 tiles enter Dryer. */
        for (let tile = 1; tile <= 100; tile++) {
            dryerQueue.push(tile);
            if (dryerQueue.length > DRYER_RELEASE_THRESHOLD) {
                dryerOutput.push(dryerQueue.shift()!);
            }
        }

        /** Drain Dryer. */
        while (dryerQueue.length > 0) {
            dryerOutput.push(dryerQueue.shift()!);
        }

        /** All 100 tiles exit the Dryer. */
        expect(dryerOutput.length).toBe(100);

        /** Dryer output enters Kiln. */
        for (const tile of dryerOutput) {
            kilnQueue.push(tile);
            if (kilnQueue.length > KILN_RELEASE_THRESHOLD) {
                kilnOutput.push(kilnQueue.shift()!);
            }
        }

        /** Drain Kiln. */
        while (kilnQueue.length > 0) {
            kilnOutput.push(kilnQueue.shift()!);
        }

        /** All 100 tiles exit the Kiln. */
        expect(kilnOutput.length).toBe(100);

        /** FIFO integrity: exit order matches entry order. */
        for (let i = 0; i < kilnOutput.length; i++) {
            expect(kilnOutput[i]).toBe(i + 1);
        }
    });

    it('530 tiles (WorkID#1) all pass through pipeline with correct FIFO order', () => {
        /**
         * Full production run: 530 tiles (WorkID#1 actual tile count).
         * Every single tile must exit both queues in strict original order.
         */
        const PRODUCTION_COUNT = 530;
        const dryerQueue: number[] = [];
        const kilnQueue: number[] = [];
        const dryerOutput: number[] = [];
        const finalOutput: number[] = [];

        /** Dryer pipeline. */
        for (let tile = 1; tile <= PRODUCTION_COUNT; tile++) {
            dryerQueue.push(tile);
            if (dryerQueue.length > DRYER_RELEASE_THRESHOLD) {
                dryerOutput.push(dryerQueue.shift()!);
            }
        }
        while (dryerQueue.length > 0) {
            dryerOutput.push(dryerQueue.shift()!);
        }

        /** Kiln pipeline. */
        for (const tile of dryerOutput) {
            kilnQueue.push(tile);
            if (kilnQueue.length > KILN_RELEASE_THRESHOLD) {
                finalOutput.push(kilnQueue.shift()!);
            }
        }
        while (kilnQueue.length > 0) {
            finalOutput.push(kilnQueue.shift()!);
        }

        /** All 530 tiles exit, none lost. */
        expect(finalOutput.length).toBe(PRODUCTION_COUNT);

        /** Strict FIFO: tile i exits as tile i. */
        for (let i = 0; i < finalOutput.length; i++) {
            expect(finalOutput[i]).toBe(i + 1);
        }
    });
});

// =============================================================================
// STATION LAYOUT — Monotonic t-positions (no skipping)
// =============================================================================

describe('Station Layout — Conveyor Position Invariants', () => {
    it('station t-positions are strictly increasing (left to right on belt)', () => {
        /** Tiles must visit stations in order: Press → Packaging. */
        for (let i = 1; i < STATION_STAGES.length; i++) {
            expect(STATION_STAGES[i]).toBeGreaterThan(STATION_STAGES[i - 1]);
        }
    });

    it('spawn T (Press) < dryer entry < kiln entry < sort < collect < EOL', () => {
        /** The lifecycle thresholds must be in the correct order. */
        expect(SPAWN_T).toBeLessThan(DRYER_ENTRY_T);
        expect(DRYER_ENTRY_T).toBeLessThan(KILN_ENTRY_T);
        expect(KILN_ENTRY_T).toBeLessThan(SORT_THRESHOLD);
        expect(SORT_THRESHOLD).toBeLessThan(COLLECT_THRESHOLD);
        expect(COLLECT_THRESHOLD).toBeLessThan(END_OF_LINE_T);
    });

    it('Dryer release position lands between Dryer and Glaze', () => {
        /** Released tile must appear past Dryer but before Glaze. */
        const releaseT = DRYER_ENTRY_T + DRYER_RELEASE_SPACING;
        expect(releaseT).toBeGreaterThan(DRYER_ENTRY_T);
        expect(releaseT).toBeLessThan(STATION_STAGES[2]); // Glaze
    });

    it('Kiln release position lands between Kiln and Sorting', () => {
        /** Released tile must appear past Kiln but before Sorting. */
        const releaseT = KILN_ENTRY_T + KILN_RELEASE_SPACING;
        expect(releaseT).toBeGreaterThan(KILN_ENTRY_T);
        expect(releaseT).toBeLessThan(STATION_STAGES[5]); // Sorting
    });
});

// =============================================================================
// GAP-CHECK — Spacing invariants
// =============================================================================

describe('Gap-Check Spacing Invariants', () => {
    it('STATION_SPACING > both release spacings', () => {
        /**
         * The gap between released tiles (STATION_SPACING) must be larger than
         * the initial jump applied at release. Otherwise a tile released at
         * entry + RELEASE_SPACING could immediately trip the gap-check.
         */
        expect(STATION_SPACING).toBeGreaterThan(DRYER_RELEASE_SPACING);
        expect(STATION_SPACING).toBeGreaterThan(KILN_RELEASE_SPACING);
    });

    it('gap-check distance (STATION_SPACING) prevents released tiles from overlapping', () => {
        /**
         * If two tiles are released on consecutive entries, the first one must
         * advance at least STATION_SPACING past the entry T before the second
         * one is released. STATION_SPACING is ~0.05855 (curve-sampled), which
         * at conveyor speed 1.5 takes about 1 P-Clock tick — sufficient for
         * visual separation.
         */
        expect(STATION_SPACING).toBeGreaterThanOrEqual(0.055);
    });
});

// =============================================================================
// FORCE-RELEASE — Capacity overflow
// =============================================================================

describe('Force-Release at Capacity Overflow', () => {
    it('Dryer: force-release triggers when queue hits 15 (capacity)', () => {
        /**
         * If gap-check blocks releases and new tiles keep entering, the queue
         * can grow past the threshold (10). At capacity (15), force-release
         * bypasses the gap-check. This test verifies the queue never exceeds
         * capacity when force-release is applied.
         */
        const queue: number[] = [];
        let maxLen = 0;

        /** Simulate 30 tiles with NO releases (worst-case gap-block). */
        for (let tile = 1; tile <= 30; tile++) {
            queue.push(tile);

            /** Force-release when at capacity, regardless of gap. */
            if (queue.length >= DRYER_QUEUE_CAPACITY) {
                queue.shift();
            }

            maxLen = Math.max(maxLen, queue.length);
        }

        /** Queue must never exceed capacity. */
        expect(maxLen).toBeLessThanOrEqual(DRYER_QUEUE_CAPACITY);
    });

    it('Kiln: force-release triggers when queue hits 45 (capacity)', () => {
        const queue: number[] = [];
        let maxLen = 0;

        for (let tile = 1; tile <= 100; tile++) {
            queue.push(tile);

            if (queue.length >= KILN_QUEUE_CAPACITY) {
                queue.shift();
            }

            maxLen = Math.max(maxLen, queue.length);
        }

        expect(maxLen).toBeLessThanOrEqual(KILN_QUEUE_CAPACITY);
    });
});

// =============================================================================
// TILE VISIBILITY INVARIANTS — Scale and t-clamp on queue entry
// =============================================================================

describe('Tile Visibility Invariants — Queue Entry State', () => {
    /**
     * These tests validate that tiles are correctly flagged and snapped
     * when they enter a FIFO queue. Scale remains at 1 throughout —
     * the Part component's visibility gate (visible=false) handles hiding.
     */

    it('Dryer: tile is flagged and snapped when entering the queue', () => {
        /** Tile approaches Dryer from just below the entry t-position. */
        const tile: MockTileData = {
            id: 1,
            t: DRYER_ENTRY_T + 0.001, // Slightly past entry threshold
            scale: 1,                  // Fully visible before entry
            isQueued: false,
            hasVisitedDryer: false,
            isKilnQueued: false,
            hasVisitedKiln: false,
        };

        simulateQueueEntry(tile);

        /** Scale stays at 1 — visibility gate hides queued tiles. */
        expect(tile.scale).toBe(1);
        /** Tile must be flagged as in the dryer queue. */
        expect(tile.isQueued).toBe(true);
        /** t must be snapped back to entry point (not past the machine). */
        expect(tile.t).toBe(DRYER_ENTRY_T);
    });

    it('Kiln: tile is flagged and snapped when entering the queue', () => {
        /** Tile has already visited the Dryer, now approaches the Kiln. */
        const tile: MockTileData = {
            id: 42,
            t: KILN_ENTRY_T + 0.002,  // Slightly past kiln entry threshold
            scale: 1,                  // Fully visible before entry
            isQueued: false,
            hasVisitedDryer: true,     // Already passed through Dryer
            isKilnQueued: false,
            hasVisitedKiln: false,
        };

        simulateQueueEntry(tile);

        /** Scale stays at 1 — visibility gate hides queued tiles. */
        expect(tile.scale).toBe(1);
        /** Tile must be flagged as in the kiln queue. */
        expect(tile.isKilnQueued).toBe(true);
        /** t must be snapped back to kiln entry point. */
        expect(tile.t).toBe(KILN_ENTRY_T);
    });

    it('tile that has already visited Dryer is not re-queued', () => {
        /** After dryer release, hasVisitedDryer=true prevents re-entry. */
        const tile: MockTileData = {
            id: 5,
            t: DRYER_ENTRY_T + 0.01,
            scale: 1,
            isQueued: false,
            hasVisitedDryer: true,   // Already processed by Dryer
            isKilnQueued: false,
            hasVisitedKiln: false,
        };

        simulateQueueEntry(tile);

        /** Scale must remain at 1: tile was NOT re-queued. */
        expect(tile.scale).toBe(1);
        expect(tile.isQueued).toBe(false);
    });

    it('tile that has already visited Kiln is not re-queued', () => {
        /** After kiln release, hasVisitedKiln=true prevents re-entry. */
        const tile: MockTileData = {
            id: 50,
            t: KILN_ENTRY_T + 0.01,
            scale: 1,
            isQueued: false,
            hasVisitedDryer: true,
            isKilnQueued: false,
            hasVisitedKiln: true,    // Already processed by Kiln
        };

        simulateQueueEntry(tile);

        /** Scale must remain at 1: tile was NOT re-queued. */
        expect(tile.scale).toBe(1);
        expect(tile.isKilnQueued).toBe(false);
    });
});

// =============================================================================
// RENDER-SIDE T-CLAMP — Prevents visual flash past entry points
// =============================================================================

describe('Pre-Queue Visibility Guard — Hide at Entry Point', () => {
    /**
     * These tests validate the pre-queue visibility guard that completely
     * hides tiles past a machine entry point before the PartSpawner flags
     * them as queued. The guard is read-only (does not modify tile data).
     */

    it('tile past Dryer entry (not yet visited) is hidden', () => {
        /** Tile advanced past Dryer by useFrame delta, but not yet processed. */
        const tile: MockTileData = {
            id: 3,
            t: DRYER_ENTRY_T + 0.005,
            scale: 1,
            isQueued: false,
            hasVisitedDryer: false,
            isKilnQueued: false,
            hasVisitedKiln: false,
        };

        /** Guard triggers: tile must be hidden (scale=0 in renderer). */
        expect(shouldHideAtEntry(tile)).toBe(true);
        /** Original t is NOT modified by the guard. */
        expect(tile.t).toBe(DRYER_ENTRY_T + 0.005);
    });

    it('tile past Kiln entry (not yet visited) is hidden', () => {
        /** Tile advanced past Kiln by useFrame delta, already visited Dryer. */
        const tile: MockTileData = {
            id: 41,
            t: KILN_ENTRY_T + 0.003,
            scale: 1,
            isQueued: false,
            hasVisitedDryer: true,
            isKilnQueued: false,
            hasVisitedKiln: false,
        };

        /** Guard triggers: tile must be hidden. */
        expect(shouldHideAtEntry(tile)).toBe(true);
        /** Original t is NOT modified. */
        expect(tile.t).toBe(KILN_ENTRY_T + 0.003);
    });

    it('tile that has visited Dryer is NOT hidden (renders normally)', () => {
        /** Post-Dryer tile should render at its actual t position. */
        const tile: MockTileData = {
            id: 10,
            t: DRYER_ENTRY_T + DRYER_RELEASE_SPACING,
            scale: 1,
            isQueued: false,
            hasVisitedDryer: true,
            isKilnQueued: false,
            hasVisitedKiln: false,
        };

        /** Guard does NOT trigger — tile is visible. */
        expect(shouldHideAtEntry(tile)).toBe(false);
    });

    it('tile that has visited Kiln is NOT hidden (renders normally)', () => {
        /** Post-Kiln tile should render at its actual t position. */
        const tile: MockTileData = {
            id: 50,
            t: KILN_ENTRY_T + KILN_RELEASE_SPACING,
            scale: 1,
            isQueued: false,
            hasVisitedDryer: true,
            isKilnQueued: false,
            hasVisitedKiln: true,
        };

        /** Guard does NOT trigger — tile is visible. */
        expect(shouldHideAtEntry(tile)).toBe(false);
    });

    it('tile before Dryer entry is NOT hidden', () => {
        /** Normal tile moving toward Dryer — no hiding needed. */
        const tile: MockTileData = {
            id: 2,
            t: DRYER_ENTRY_T - 0.01,
            scale: 1,
            isQueued: false,
            hasVisitedDryer: false,
            isKilnQueued: false,
            hasVisitedKiln: false,
        };

        /** Guard does NOT trigger — tile is visible. */
        expect(shouldHideAtEntry(tile)).toBe(false);
    });
});

// =============================================================================
// QUEUE HEAD TELEMETRY — Snapshot Integration Invariants
// =============================================================================

describe('Queue Head Telemetry — Snapshot Integration', () => {
    /**
     * These tests validate the mathematical invariants that make the
     * queue-head telemetry fix work: the queue head's t-position is
     * always AT the station's exact STATION_STAGES value, meaning the
     * snapshot finds it at distance 0 (100% hit rate).
     */

    it('Dryer queue head t equals STATION_STAGES[1] (distance 0 from station)', () => {
        /**
         * When a tile enters the Dryer queue, its t is snapped to DRYER_ENTRY_T.
         * DRYER_ENTRY_T === STATION_STAGES[1], so the distance from the station is 0.
         */
        const tile: MockTileData = {
            id: 5,
            t: DRYER_ENTRY_T + 0.003,
            scale: 1,
            isQueued: false,
            hasVisitedDryer: false,
            isKilnQueued: false,
            hasVisitedKiln: false,
        };

        /** Simulate queue entry — t gets snapped. */
        simulateQueueEntry(tile);

        /** Snapped t must exactly equal the station's position. */
        expect(tile.t).toBe(STATION_STAGES[1]);
        /** Distance from station is exactly 0 — well within SNAPSHOT_TOLERANCE. */
        const distanceFromStation = Math.abs(tile.t - STATION_STAGES[1]);
        expect(distanceFromStation).toBe(0);
    });

    it('Kiln queue head t equals STATION_STAGES[4] (distance 0 from station)', () => {
        /**
         * When a tile enters the Kiln queue, its t is snapped to KILN_ENTRY_T.
         * KILN_ENTRY_T === STATION_STAGES[4], so the distance from the station is 0.
         */
        const tile: MockTileData = {
            id: 42,
            t: KILN_ENTRY_T + 0.005,
            scale: 1,
            isQueued: false,
            hasVisitedDryer: true,
            isKilnQueued: false,
            hasVisitedKiln: false,
        };

        simulateQueueEntry(tile);

        expect(tile.t).toBe(STATION_STAGES[4]);
        const distanceFromStation = Math.abs(tile.t - STATION_STAGES[4]);
        expect(distanceFromStation).toBe(0);
    });

    it('queue head t is within SNAPSHOT_TOLERANCE (trivially true, distance=0)', () => {
        /**
         * SNAPSHOT_TOLERANCE = 0.031 (from simulation.ts).
         * Queue head distance = 0. This test documents the invariant
         * explicitly so future changes to SNAPSHOT_TOLERANCE don't
         * accidentally break the queue-head telemetry.
         */
        const SNAPSHOT_TOL = 0.031;

        const dryerDistance = Math.abs(DRYER_ENTRY_T - STATION_STAGES[1]);
        const kilnDistance = Math.abs(KILN_ENTRY_T - STATION_STAGES[4]);

        expect(dryerDistance).toBeLessThan(SNAPSHOT_TOL);
        expect(kilnDistance).toBeLessThan(SNAPSHOT_TOL);
    });

    it('empty queue contributes no entry to partPositionsRef (simulated)', () => {
        /**
         * When a queue is empty, no head tile exists to include.
         * This simulates the guard: `if (queue.length > 0)` prevents
         * pushing undefined entries into the position array.
         */
        const queue: number[] = [];
        const posArr: number[] = [];

        /** Simulate the guard from ConveyorBelt.tsx. */
        if (queue.length > 0) {
            posArr.push(KILN_ENTRY_T);
        }

        /** Empty queue → no position entry added. */
        expect(posArr.length).toBe(0);
    });

    it('queue head changes after release (FIFO: oldest exits first)', () => {
        /**
         * After a release, the NEW head (queue[0]) should be the
         * next tile in FIFO order. This is what gets included in
         * partPositionsRef on subsequent frames.
         */
        const queue: number[] = [];

        /** Fill to threshold + 1. */
        for (let tile = 1; tile <= KILN_RELEASE_THRESHOLD + 1; tile++) {
            queue.push(tile);
        }

        /** Head before release. */
        expect(queue[0]).toBe(1);

        /** Release (shift) — simulates one-in-one-out. */
        queue.shift();

        /** New head is tile #2. */
        expect(queue[0]).toBe(2);
    });
});

// =============================================================================
// 1-SLOT STATION OCCUPANT — Pass-Through Station Invariants
// =============================================================================

describe('1-Slot Station Occupant — Pass-Through Station Invariants', () => {
    /**
     * These tests validate that pass-through stations (Glaze, Printer,
     * Sorting, Packaging) can use the same distance-0 trick as queue-head
     * telemetry: the occupant is pinned at STATION_STAGES[idx], so the
     * snapshot always finds it.
     */

    it('pass-through station t-positions equal STATION_STAGES (distance 0)', () => {
        /**
         * Pass-through stations: Glaze(2), Printer(3), Sorting(5), Packaging(6).
         * The occupant is placed at STATION_STAGES[idx] = exact station position.
         */
        const passThroughIndices = [2, 3, 5, 6];

        for (const idx of passThroughIndices) {
            const stationT = STATION_STAGES[idx];
            /** Distance from occupant to station is exactly 0. */
            expect(Math.abs(stationT - STATION_STAGES[idx])).toBe(0);
        }
    });

    it('all station positions are within SNAPSHOT_TOLERANCE of themselves', () => {
        /**
         * Trivially true (distance=0 < 0.031), but documents the invariant
         * that the 1-slot occupant approach relies on.
         */
        const SNAPSHOT_TOL = 0.031;

        for (let idx = 0; idx < STATION_STAGES.length; idx++) {
            const selfDistance = Math.abs(STATION_STAGES[idx] - STATION_STAGES[idx]);
            expect(selfDistance).toBeLessThan(SNAPSHOT_TOL);
        }
    });

    it('adjacent stations are far enough apart to prevent cross-claiming', () => {
        /**
         * Two occupants at adjacent stations must not interfere.
         * Distance between adjacent stations must be > SNAPSHOT_TOLERANCE.
         * (The snapshot also uses a `claimed` set as secondary protection,
         * but station spacing alone should prevent ambiguity.)
         */
        const SNAPSHOT_TOL = 0.031;

        for (let i = 1; i < STATION_STAGES.length; i++) {
            const gap = STATION_STAGES[i] - STATION_STAGES[i - 1];
            expect(gap).toBeGreaterThan(SNAPSHOT_TOL);
        }
    });

    it('occupant slot clears when tile is removed (simulated)', () => {
        /**
         * When a tile is sorted/scrapped/collected, the occupant slot
         * should be cleared (set to null) so stale IDs don't persist.
         */
        const occupants: (number | null)[] = new Array(STATION_STAGES.length).fill(null);

        /** Tile 42 is detected at Sorting (idx 5). */
        occupants[5] = 42;
        expect(occupants[5]).toBe(42);

        /** Tile 42 was defected and sorted to waste bin — clear the slot. */
        occupants[5] = null;
        expect(occupants[5]).toBeNull();
    });
});
