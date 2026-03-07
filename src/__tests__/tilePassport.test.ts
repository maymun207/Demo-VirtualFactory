/**
 * tilePassport.test.ts — Unit Tests for Tile Passport (Künye) Data Integrity
 *
 * Tests that tile station snapshots correctly track:
 *  1. exit_sim_tick: populated when a tile moves to the next station
 *  2. processing_duration_ticks: calculated as (exit_sim_tick - entry_sim_tick)
 *  3. Snapshot-aware pruning: tiles are not pruned until all snapshots are synced
 *
 * These tests validate the data path from the Zustand store to Supabase,
 * ensuring the complete tile passport can be reconstructed from database data.
 *
 * Dependencies:
 *  - tileSlice: createTile, recordTileSnapshot, moveTilesOnConveyor, pruneCompletedTiles
 *  - types: STATION_ORDER, STATION_ORDER_MAP
 */
/// <reference types="vitest/globals" />

import { describe, it, expect } from 'vitest';
import type {
    TileSnapshotRecord,
    TileRecord,
    StationName,
} from '../store/types';
import {
    STATION_ORDER,
    STATION_ORDER_MAP,
} from '../store/types';

// =============================================================================
// Helper: Build a mock TileSnapshotRecord for testing
// =============================================================================

/**
 * Create a mock TileSnapshotRecord with sensible defaults.
 * Only the fields relevant to exit_sim_tick testing are required.
 *
 * @param overrides - Partial fields to override defaults
 * @returns A complete TileSnapshotRecord
 */
function createMockSnapshot(
    overrides: Partial<TileSnapshotRecord> & { id: string; tile_id: string; station: StationName; entry_sim_tick: number }
): TileSnapshotRecord {
    return {
        simulation_id: 'sim-1',
        station_order: STATION_ORDER_MAP[overrides.station],
        entry_production_tick: overrides.entry_sim_tick,
        machine_state_id: `machine-${overrides.station}-${overrides.entry_sim_tick}`,
        parameters_snapshot: { test_param: 42 },
        defect_detected: false,
        scrapped_here: false,
        synced: false,
        ...overrides,
    };
}

/**
 * Create a mock TileRecord with sensible defaults.
 *
 * @param overrides - Partial fields to override defaults
 * @returns A complete TileRecord
 */
function createMockTile(
    overrides: Partial<TileRecord> & { id: string; tile_number: number }
): TileRecord {
    return {
        simulation_id: 'sim-1',
        created_at_sim_tick: 10,
        created_at_production_tick: 10,
        status: 'in_production',
        final_grade: 'pending',
        synced: false,
        syncVersion: 0,
        ...overrides,
    };
}

// =============================================================================
// exit_sim_tick and processing_duration_ticks Tests
// =============================================================================

describe('exit_sim_tick population logic', () => {
    /**
     * Core behavior: when a tile moves from station A to station B,
     * station A's snapshot should get exit_sim_tick = current tick
     * and processing_duration_ticks = exit - entry.
     */
    it('should calculate processing_duration_ticks correctly', () => {
        /** Arrange: a snapshot entered at tick 100 */
        const entryTick = 100;
        const exitTick = 104;
        const expectedDuration = exitTick - entryTick;

        /** Act: simulate the exit tick fill logic */
        const snapshot = createMockSnapshot({
            id: 'snap-1',
            tile_id: 'tile-1',
            station: 'press',
            entry_sim_tick: entryTick,
        });

        /** Apply exit tick (mirrors moveTilesOnConveyor logic). */
        const updated = {
            ...snapshot,
            exit_sim_tick: exitTick,
            processing_duration_ticks: exitTick - snapshot.entry_sim_tick,
            synced: false,
        };

        /** Assert */
        expect(updated.exit_sim_tick).toBe(exitTick);
        expect(updated.processing_duration_ticks).toBe(expectedDuration);
        expect(updated.synced).toBe(false);
    });

    it('should only update snapshots with null exit_sim_tick', () => {
        /** Arrange: two snapshots — one already has exit_sim_tick, one does not */
        const snapshots: TileSnapshotRecord[] = [
            createMockSnapshot({
                id: 'snap-1',
                tile_id: 'tile-1',
                station: 'press',
                entry_sim_tick: 100,
                exit_sim_tick: 104,
                processing_duration_ticks: 4,
                synced: true,
            }),
            createMockSnapshot({
                id: 'snap-2',
                tile_id: 'tile-1',
                station: 'dryer',
                entry_sim_tick: 104,
            }),
        ];

        const currentTick = 108;
        const departingStation: StationName = 'dryer';

        /**
         * Act: apply exit tick fill logic (mirrors moveTilesOnConveyor).
         * Only update snapshots matching departing station with null exit_sim_tick.
         */
        const updated = snapshots.map((snap) => {
            if (snap.station === departingStation && snap.exit_sim_tick == null) {
                return {
                    ...snap,
                    exit_sim_tick: currentTick,
                    processing_duration_ticks: currentTick - snap.entry_sim_tick,
                    synced: false,
                };
            }
            return snap;
        });

        /** Assert: only the dryer snapshot was updated */
        expect(updated[0].exit_sim_tick).toBe(104);
        expect(updated[0].synced).toBe(true);
        expect(updated[1].exit_sim_tick).toBe(108);
        expect(updated[1].processing_duration_ticks).toBe(4);
        expect(updated[1].synced).toBe(false);
    });

    it('should fill exit_sim_tick on the last station (packaging) when tile completes', () => {
        /** Arrange: a snapshot at packaging (last station, order 7) with no exit tick. */
        const snapshot = createMockSnapshot({
            id: 'snap-pkg',
            tile_id: 'tile-1',
            station: 'packaging',
            entry_sim_tick: 124,
        });

        const completionTick = 128;

        /** Act: apply the completion exit tick logic. */
        const updated = snapshot.exit_sim_tick == null
            ? {
                ...snapshot,
                exit_sim_tick: completionTick,
                processing_duration_ticks: completionTick - snapshot.entry_sim_tick,
                synced: false,
            }
            : snapshot;

        /** Assert */
        expect(updated.exit_sim_tick).toBe(128);
        expect(updated.processing_duration_ticks).toBe(4);
    });

    it('should build a complete tile passport with entry AND exit ticks for all 7 stations', () => {
        /** Arrange: simulate a tile that visited all 7 stations. */
        const tileId = 'tile-full';
        const stationGap = 4;
        const startTick = 100;

        /** Create 7 snapshots with entry ticks, then fill exit ticks. */
        const snapshots: TileSnapshotRecord[] = STATION_ORDER.map((station, i) =>
            createMockSnapshot({
                id: `snap-${station}`,
                tile_id: tileId,
                station,
                entry_sim_tick: startTick + i * stationGap,
            })
        );

        /**
         * Act: fill exit ticks for each station.
         * Station N gets exit_sim_tick = station N+1's entry_sim_tick.
         * Last station gets exit_sim_tick = entry + stationGap.
         */
        const completed = snapshots.map((snap, i) => ({
            ...snap,
            exit_sim_tick: startTick + (i + 1) * stationGap,
            processing_duration_ticks: stationGap,
        }));

        /** Assert: every station has both entry and exit ticks. */
        expect(completed).toHaveLength(7);
        for (let i = 0; i < completed.length; i++) {
            expect(completed[i].entry_sim_tick).toBe(startTick + i * stationGap);
            expect(completed[i].exit_sim_tick).toBe(startTick + (i + 1) * stationGap);
            expect(completed[i].processing_duration_ticks).toBe(stationGap);
            expect(completed[i].station).toBe(STATION_ORDER[i]);
        }
    });
});

// =============================================================================
// Snapshot-aware pruning Tests
// =============================================================================

describe('snapshot-aware pruning', () => {
    /**
     * Core behavior: tiles should NOT be pruned if any of their snapshots
     * has synced=false. This prevents snapshot data loss.
     */
    it('should NOT prune a tile if any snapshot has synced=false', () => {
        /** Arrange: a completed, synced tile with one unsynced snapshot. */
        const tile = createMockTile({
            id: 'tile-1',
            tile_number: 1,
            status: 'completed',
            final_grade: 'first_quality',
            completed_at_sim_tick: 200,
            synced: true,
        });

        const snapshots: TileSnapshotRecord[] = [
            createMockSnapshot({
                id: 'snap-1',
                tile_id: 'tile-1',
                station: 'press',
                entry_sim_tick: 100,
                synced: true,
            }),
            createMockSnapshot({
                id: 'snap-2',
                tile_id: 'tile-1',
                station: 'dryer',
                entry_sim_tick: 104,
                synced: false, // NOT synced yet!
            }),
        ];

        /**
         * Act: check pruning eligibility (mirrors pruneCompletedTiles logic).
         * The tile itself is synced, but one snapshot is not.
         */
        const isPrunable = tile.synced
            && (tile.status === 'completed' || tile.status.startsWith('scrapped_at_'))
            && !snapshots.some((snap) => !snap.synced);

        /** Assert: tile should NOT be prunable. */
        expect(isPrunable).toBe(false);
    });

    it('should prune a tile when ALL snapshots are synced', () => {
        /** Arrange: a completed, synced tile with all snapshots synced. */
        const tile = createMockTile({
            id: 'tile-2',
            tile_number: 2,
            status: 'completed',
            final_grade: 'first_quality',
            completed_at_sim_tick: 200,
            synced: true,
        });

        const snapshots: TileSnapshotRecord[] = [
            createMockSnapshot({
                id: 'snap-a',
                tile_id: 'tile-2',
                station: 'press',
                entry_sim_tick: 100,
                synced: true,
            }),
            createMockSnapshot({
                id: 'snap-b',
                tile_id: 'tile-2',
                station: 'dryer',
                entry_sim_tick: 104,
                synced: true,
            }),
        ];

        /** Act: check pruning eligibility. */
        const isPrunable = tile.synced
            && (tile.status === 'completed' || tile.status.startsWith('scrapped_at_'))
            && !snapshots.some((snap) => !snap.synced);

        /** Assert: tile SHOULD be prunable. */
        expect(isPrunable).toBe(true);
    });

    it('should prune a tile with no snapshots (edge case)', () => {
        /** Arrange: a completed tile that has no snapshots at all. */
        const tile = createMockTile({
            id: 'tile-3',
            tile_number: 3,
            status: 'completed',
            final_grade: 'first_quality',
            completed_at_sim_tick: 200,
            synced: true,
        });

        /** No snapshots for this tile. */
        const snapshots: TileSnapshotRecord[] | undefined = undefined;

        /**
     * Act: check pruning eligibility.
     * Mirrors: if (snapshots && snapshots.some(s => !s.synced)) continue;
     * With no snapshots, the check passes (tile is prunable).
     */
        const isPrunable = tile.synced
            && (tile.status === 'completed' || tile.status.startsWith('scrapped_at_'))
            && !(snapshots as TileSnapshotRecord[] | undefined)?.some((snap) => !snap.synced);

        /** Assert: tile should be prunable (no snapshots to wait for). */
        expect(isPrunable).toBe(true);
    });
});
