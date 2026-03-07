/**
 * drainConveyor.test.ts — Unit Tests for Post-Drain Sweep Grading Logic
 *
 * SIMULATE-AHEAD PHASE 1:
 * Validates that drainConveyor()'s post-drain sweep correctly grades
 * tiles that are still `in_production` after the synchronous drain loop.
 *
 * Phase 1 architecture change:
 *   moveTilesOnConveyor() now evaluates defects SYNCHRONOUSLY inside set().
 *   There is no deferred microtask, no bridge fallback. Grading uses the
 *   inline snapshot data (defect_detected, scrapped_here) exclusively.
 *
 * These tests verify:
 *   - Tiles with snapshot scrapped_here=true are graded as 'scrap'
 *   - Tiles with snapshot defect_detected=true (non-scrap) are graded as 'second_quality'
 *   - Tiles with no defect snapshots are graded as 'first_quality' (default)
 *   - Multiple tiles with mixed defect states are graded correctly in one sweep
 *   - Swept tiles are re-queued for Supabase sync
 *
 * These tests exercise the actual Zustand stores in isolation (no React, no Supabase).
 */
/// <reference types="vitest/globals" />

import { describe, it, expect, beforeEach } from 'vitest';
import { useSimulationDataStore } from '../../store/simulationDataStore';
import type { TileRecord, TileSnapshotRecord } from '../../store/types';

// =============================================================================
// HELPERS — Create mock tile records and snapshot records for store injection
// =============================================================================

/**
 * Create a minimal TileRecord in 'in_production' status with 'pending' grade.
 * These represent tiles that the drain loop couldn't fully process.
 *
 * @param id          - Unique tile UUID
 * @param tileNumber  - Human-readable sequential number (e.g. 69, 411)
 * @param simId       - Simulation session UUID
 * @returns A TileRecord ready for store injection
 */
function makePendingTile(id: string, tileNumber: number, simId: string): TileRecord {
    return {
        id,
        simulation_id: simId,
        tile_number: tileNumber,
        created_at_sim_tick: 1,
        created_at_production_tick: 1,
        status: 'in_production',
        current_station: 'sorting',
        final_grade: 'pending',
        synced: false,
        syncVersion: 0,
    };
}

/**
 * Create a minimal TileSnapshotRecord with defect information.
 * Phase 1 grading reads scrapped_here and defect_detected from these records.
 *
 * @param tileId        - Tile UUID this snapshot belongs to
 * @param simId         - Simulation session UUID
 * @param station       - Station where the snapshot was taken
 * @param defectDetected - Whether a defect was detected at this station
 * @param scrappedHere   - Whether the tile should be scrapped (structural defect)
 * @param defectTypes    - Types of defects detected (e.g. 'conveyor_jam_damage')
 * @returns A TileSnapshotRecord ready for store injection
 */
function makeSnapshot(
    tileId: string,
    simId: string,
    station: string,
    defectDetected: boolean,
    scrappedHere: boolean,
    defectTypes?: string[],
): TileSnapshotRecord {
    return {
        id: `snap-${tileId}-${station}`,
        tile_id: tileId,
        simulation_id: simId,
        station: station as any,
        station_order: 6,
        entry_sim_tick: 400,
        entry_production_tick: 200,
        machine_state_id: null,
        parameters_snapshot: {},
        defect_detected: defectDetected,
        defect_types: defectTypes as import('../../store/types').DefectType[],
        defect_severity: defectDetected ? 0.8 : undefined,
        scrapped_here: scrappedHere,
        synced: false,
    };
}

// =============================================================================
// TEST SUITE
// =============================================================================

describe('drainConveyor — Post-Drain Sweep Grading', () => {
    /** Session UUID used across all tests */
    const SIM_ID = 'test-sim-00000000-0000-0000-0000-000000000001';

    /**
     * Reset both stores before each test to prevent cross-contamination.
     * simulationDataStore: clears tiles, snapshots, conveyor, session.
     * simulationStore: clears defectedPartIds, secondQualityPartIds.
     */
    beforeEach(() => {
        useSimulationDataStore.getState().resetDataStore();
    });

    // ─────────────────────────────────────────────────────────────────
    // Scrap: tile with scrapped_here snapshot → scrap
    // ─────────────────────────────────────────────────────────────────

    it('should grade tile as scrap when snapshot has scrapped_here=true', () => {
        /**
         * Arrange: inject a pending tile with a snapshot where scrapped_here=true.
         * Phase 1 grading reads scrapped_here from inline snapshots.
         */
        const tile = makePendingTile('tile-aaa', 69, SIM_ID);
        const snap = makeSnapshot('tile-aaa', SIM_ID, 'sorting', true, true, ['conveyor_jam_damage']);

        useSimulationDataStore.setState({
            session: { id: SIM_ID } as any,
            tiles: new Map([['tile-aaa', tile]]),
            tilesByNumber: new Map([[69, 'tile-aaa']]),
            tileSnapshots: new Map([['tile-aaa', [snap]]]),
            conveyorPositions: new Map(),
            currentSimTick: 500,
        });

        /** Act: invoke drainConveyor — drain loop does nothing (empty conveyor)
         *  but the post-drain sweep should catch the in_production tile */
        useSimulationDataStore.getState().drainConveyor();

        /** Assert: tile should be graded as 'scrap' */
        const result = useSimulationDataStore.getState().tiles.get('tile-aaa');
        expect(result).toBeDefined();
        expect(result!.final_grade).toBe('scrap');
        expect(result!.status).toBe('completed');
    });

    // ─────────────────────────────────────────────────────────────────
    // Second quality: tile with defect_detected but not scrapped
    // ─────────────────────────────────────────────────────────────────

    it('should grade tile as second_quality when snapshot has defect_detected=true and scrapped_here=false', () => {
        /**
         * Arrange: inject a pending tile with a cosmetic defect snapshot.
         * defect_detected=true but scrapped_here=false → second_quality.
         */
        const tile = makePendingTile('tile-bbb', 199, SIM_ID);
        const snap = makeSnapshot('tile-bbb', SIM_ID, 'kiln', true, false, ['color_fade']);

        useSimulationDataStore.setState({
            session: { id: SIM_ID } as any,
            tiles: new Map([['tile-bbb', tile]]),
            tilesByNumber: new Map([[199, 'tile-bbb']]),
            tileSnapshots: new Map([['tile-bbb', [snap]]]),
            conveyorPositions: new Map(),
            currentSimTick: 500,
        });

        /** Act */
        useSimulationDataStore.getState().drainConveyor();

        /** Assert: tile should be graded as 'second_quality' */
        const result = useSimulationDataStore.getState().tiles.get('tile-bbb');
        expect(result).toBeDefined();
        expect(result!.final_grade).toBe('second_quality');
        expect(result!.status).toBe('completed');
    });

    // ─────────────────────────────────────────────────────────────────
    // Default: no defects → first_quality
    // ─────────────────────────────────────────────────────────────────

    it('should grade tile as first_quality when no defects exist (default)', () => {
        /**
         * Arrange: inject a pending tile with no snapshots and no defects.
         */
        const tile = makePendingTile('tile-ccc', 300, SIM_ID);

        useSimulationDataStore.setState({
            session: { id: SIM_ID } as any,
            tiles: new Map([['tile-ccc', tile]]),
            tilesByNumber: new Map([[300, 'tile-ccc']]),
            tileSnapshots: new Map(),
            conveyorPositions: new Map(),
            currentSimTick: 500,
        });

        /** Act */
        useSimulationDataStore.getState().drainConveyor();

        /** Assert: tile should be graded as 'first_quality' (default) */
        const result = useSimulationDataStore.getState().tiles.get('tile-ccc');
        expect(result).toBeDefined();
        expect(result!.final_grade).toBe('first_quality');
        expect(result!.status).toBe('completed');
    });

    // ─────────────────────────────────────────────────────────────────
    // Priority: scrap takes precedence over second_quality
    // ─────────────────────────────────────────────────────────────────

    it('should grade as scrap when tile has both scrap and cosmetic defect snapshots', () => {
        /**
         * Arrange: tile has snapshots from two stations — one cosmetic defect
         * and one structural scrap. Scrap takes priority.
         */
        const tile = makePendingTile('tile-ddd', 411, SIM_ID);
        const cosmeticSnap = makeSnapshot('tile-ddd', SIM_ID, 'kiln', true, false, ['color_fade']);
        const scrapSnap = makeSnapshot('tile-ddd', SIM_ID, 'sorting', true, true, ['conveyor_jam_damage']);

        useSimulationDataStore.setState({
            session: { id: SIM_ID } as any,
            tiles: new Map([['tile-ddd', tile]]),
            tilesByNumber: new Map([[411, 'tile-ddd']]),
            tileSnapshots: new Map([['tile-ddd', [cosmeticSnap, scrapSnap]]]),
            conveyorPositions: new Map(),
            currentSimTick: 500,
        });

        /** Act */
        useSimulationDataStore.getState().drainConveyor();

        /** Assert: scrap wins over second_quality */
        const result = useSimulationDataStore.getState().tiles.get('tile-ddd');
        expect(result).toBeDefined();
        expect(result!.final_grade).toBe('scrap');
        expect(result!.status).toBe('completed');
    });

    // ─────────────────────────────────────────────────────────────────
    // Snapshot-based grading: conveyor_jam_damage at sorting → scrap
    // ─────────────────────────────────────────────────────────────────

    it('should grade as scrap via sorting snapshot with scrapped_here=true (existing path)', () => {
        /**
         * Arrange: tile has a sorting snapshot with scrapped_here=true.
         * This tests the inline snapshot grading path.
         */
        const tile = makePendingTile('tile-eee', 74, SIM_ID);
        const snap = makeSnapshot('tile-eee', SIM_ID, 'sorting', true, true, ['conveyor_jam_damage']);

        useSimulationDataStore.setState({
            session: { id: SIM_ID } as any,
            tiles: new Map([['tile-eee', tile]]),
            tilesByNumber: new Map([[74, 'tile-eee']]),
            tileSnapshots: new Map([['tile-eee', [snap]]]),
            conveyorPositions: new Map(),
            currentSimTick: 500,
        });

        /** Act */
        useSimulationDataStore.getState().drainConveyor();

        /** Assert: scrap via snapshot path */
        const result = useSimulationDataStore.getState().tiles.get('tile-eee');
        expect(result).toBeDefined();
        expect(result!.final_grade).toBe('scrap');
        expect(result!.status).toBe('completed');
    });

    // ─────────────────────────────────────────────────────────────────
    // Multi-tile sweep: mixed grades in a single sweep
    // ─────────────────────────────────────────────────────────────────

    it('should correctly grade multiple tiles with different defect states in a single sweep', () => {
        /**
         * Arrange: 4 tiles —
         *   1 scrap (snapshot scrapped_here=true),
         *   1 second_quality (snapshot defect_detected=true, scrapped_here=false),
         *   1 first_quality (no defects),
         *   1 already completed (should be skipped).
         */
        const scrapTile = makePendingTile('tile-scrap', 69, SIM_ID);
        const secondTile = makePendingTile('tile-second', 199, SIM_ID);
        const firstTile = makePendingTile('tile-first', 300, SIM_ID);
        const completedTile: TileRecord = {
            ...makePendingTile('tile-done', 100, SIM_ID),
            status: 'completed',
            final_grade: 'first_quality',
        };

        /** Snapshots for scrap and second_quality tiles */
        const scrapSnap = makeSnapshot('tile-scrap', SIM_ID, 'sorting', true, true, ['conveyor_jam_damage']);
        const secondSnap = makeSnapshot('tile-second', SIM_ID, 'kiln', true, false, ['color_fade']);

        useSimulationDataStore.setState({
            session: { id: SIM_ID } as any,
            tiles: new Map([
                ['tile-scrap', scrapTile],
                ['tile-second', secondTile],
                ['tile-first', firstTile],
                ['tile-done', completedTile],
            ]),
            tilesByNumber: new Map([
                [69, 'tile-scrap'],
                [199, 'tile-second'],
                [300, 'tile-first'],
                [100, 'tile-done'],
            ]),
            tileSnapshots: new Map([
                ['tile-scrap', [scrapSnap]],
                ['tile-second', [secondSnap]],
            ]),
            conveyorPositions: new Map(),
            currentSimTick: 500,
        });

        /** Act */
        useSimulationDataStore.getState().drainConveyor();

        /** Assert: each tile graded correctly */
        const tiles = useSimulationDataStore.getState().tiles;

        /** Tile 69: scrap via snapshot scrapped_here=true */
        expect(tiles.get('tile-scrap')!.final_grade).toBe('scrap');
        expect(tiles.get('tile-scrap')!.status).toBe('completed');

        /** Tile 199: second_quality via snapshot defect_detected=true */
        expect(tiles.get('tile-second')!.final_grade).toBe('second_quality');
        expect(tiles.get('tile-second')!.status).toBe('completed');

        /** Tile 300: first_quality (no defects) */
        expect(tiles.get('tile-first')!.final_grade).toBe('first_quality');
        expect(tiles.get('tile-first')!.status).toBe('completed');

        /** Tile 100: already completed — should NOT be modified */
        expect(tiles.get('tile-done')!.final_grade).toBe('first_quality');
        expect(tiles.get('tile-done')!.status).toBe('completed');
    });

    // ─────────────────────────────────────────────────────────────────
    // Sync queue: swept tiles are re-queued for Supabase
    // ─────────────────────────────────────────────────────────────────

    it('should add swept tile IDs to the unsyncedRecords.tiles queue', () => {
        /**
         * Arrange: one pending tile (will be swept).
         * Verify it gets re-queued for Supabase sync so the final grade is persisted.
         */
        const tile = makePendingTile('tile-fff', 500, SIM_ID);

        useSimulationDataStore.setState({
            session: { id: SIM_ID } as any,
            tiles: new Map([['tile-fff', tile]]),
            tilesByNumber: new Map([[500, 'tile-fff']]),
            tileSnapshots: new Map(),
            conveyorPositions: new Map(),
            currentSimTick: 500,
        });

        /** Act */
        useSimulationDataStore.getState().drainConveyor();

        /** Assert: tile-fff should appear in the unsyncedRecords.tiles queue */
        const unsynced = useSimulationDataStore.getState().unsyncedRecords;
        expect(unsynced.tiles).toContain('tile-fff');
    });
});
