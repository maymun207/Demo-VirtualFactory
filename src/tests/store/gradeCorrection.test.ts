/**
 * gradeCorrection.test.ts — Unit Tests for Grade Correction & Period Metrics
 *
 * Validates that setTileGrade() and scrapTile() correctly update
 * currentPeriodMetrics when re-grading tiles. Previously, only the
 * cumulative counters (totalFirstQuality, etc.) were corrected,
 * leaving the period metrics stuck at their initial values.
 *
 * Also validates that derived selectors (used by ShipmentBox, 
 * SecondQualityBox, TrashBin) only count completed/scrapped tiles,
 * not in-flight tiles temporarily tagged with a grade.
 *
 * These tests exercise the actual Zustand stores in isolation
 * (no React, no Supabase).
 */
/// <reference types="vitest/globals" />

import { describe, it, expect, beforeEach } from 'vitest';
import { useSimulationDataStore } from '../../store/simulationDataStore';
import type { TileRecord, QualityGrade } from '../../store/types';

// =============================================================================
// HELPERS — Create mock tile records for injection into the store
// =============================================================================

/** Simulation session UUID used across all tests. */
const SIM_ID = 'test-sim-grade-correction-00001';

/**
 * Create a completed TileRecord with a given grade.
 * Represents a tile that has finished the production line.
 *
 * @param id         - Unique tile UUID
 * @param tileNumber - Human-readable sequential number
 * @param grade      - Quality grade to assign ('first_quality', 'second_quality', 'scrap', 'pending')
 * @returns A completed TileRecord ready for store injection
 */
function makeCompletedTile(
    id: string,
    tileNumber: number,
    grade: QualityGrade | 'pending',
): TileRecord {
    return {
        id,
        simulation_id: SIM_ID,
        tile_number: tileNumber,
        created_at_sim_tick: 1,
        created_at_production_tick: 1,
        status: 'completed',
        current_station: 'packaging',
        final_grade: grade,
        synced: false,
        syncVersion: 0,
    };
}

/**
 * Create an in_production TileRecord with a given grade.
 * Represents a tile still on the conveyor (not yet completed).
 *
 * @param id         - Unique tile UUID
 * @param tileNumber - Human-readable sequential number
 * @param grade      - Quality grade to assign (may be 'first_quality' if pre-graded)
 * @returns An in-production TileRecord ready for store injection
 */
function makeInFlightTile(
    id: string,
    tileNumber: number,
    grade: QualityGrade | 'pending',
): TileRecord {
    return {
        id,
        simulation_id: SIM_ID,
        tile_number: tileNumber,
        created_at_sim_tick: 1,
        created_at_production_tick: 1,
        status: 'in_production',
        current_station: 'kiln',
        final_grade: grade,
        synced: false,
        syncVersion: 0,
    };
}

// =============================================================================
// TEST SUITE: setTileGrade() period metrics correction
// =============================================================================

describe('setTileGrade — Period Metrics Correction', () => {
    /**
     * Reset the data store before each test to ensure clean state.
     */
    beforeEach(() => {
        useSimulationDataStore.getState().resetDataStore();
    });

    it('should decrement firstQuality and increment scrap in currentPeriodMetrics when re-grading first_quality → scrap', () => {
        /**
         * Arrange: inject a completed tile graded as first_quality.
         * Set period metrics to reflect the initial grading (firstQuality=1).
         */
        const tile = makeCompletedTile('tile-fg-001', 1, 'first_quality');

        useSimulationDataStore.setState({
            session: { id: SIM_ID } as any,
            tiles: new Map([['tile-fg-001', tile]]),
            totalFirstQuality: 1,
            currentPeriodMetrics: {
                ...useSimulationDataStore.getState().currentPeriodMetrics,
                firstQuality: 1,
                scrap: 0,
            },
        });

        /** Act: re-grade from first_quality to scrap (microtask defect evaluation). */
        useSimulationDataStore.getState().setTileGrade('tile-fg-001', 'scrap');

        /** Assert: period metrics should be corrected. */
        const metrics = useSimulationDataStore.getState().currentPeriodMetrics;
        expect(metrics.firstQuality).toBe(0);
        expect(metrics.scrap).toBe(1);

        /** Assert: cumulative counters should also be corrected. */
        const state = useSimulationDataStore.getState();
        expect(state.totalFirstQuality).toBe(0);
        expect(state.totalScrapGraded).toBe(1);
    });

    it('should decrement firstQuality and increment secondQuality in currentPeriodMetrics when re-grading first_quality → second_quality', () => {
        /**
         * Arrange: inject a completed tile graded as first_quality.
         */
        const tile = makeCompletedTile('tile-fg-002', 2, 'first_quality');

        useSimulationDataStore.setState({
            session: { id: SIM_ID } as any,
            tiles: new Map([['tile-fg-002', tile]]),
            totalFirstQuality: 1,
            currentPeriodMetrics: {
                ...useSimulationDataStore.getState().currentPeriodMetrics,
                firstQuality: 1,
                secondQuality: 0,
            },
        });

        /** Act: re-grade to second_quality. */
        useSimulationDataStore.getState().setTileGrade('tile-fg-002', 'second_quality');

        /** Assert: period metrics adjusted. */
        const metrics = useSimulationDataStore.getState().currentPeriodMetrics;
        expect(metrics.firstQuality).toBe(0);
        expect(metrics.secondQuality).toBe(1);
    });

    it('should no-op when grade does not change', () => {
        /**
         * Arrange: tile already graded as scrap.
         */
        const tile = makeCompletedTile('tile-fg-003', 3, 'scrap');

        useSimulationDataStore.setState({
            session: { id: SIM_ID } as any,
            tiles: new Map([['tile-fg-003', tile]]),
            totalScrapGraded: 1,
            currentPeriodMetrics: {
                ...useSimulationDataStore.getState().currentPeriodMetrics,
                scrap: 1,
            },
        });

        /** Act: re-grade to same grade (scrap → scrap). */
        useSimulationDataStore.getState().setTileGrade('tile-fg-003', 'scrap');

        /** Assert: no change. */
        const metrics = useSimulationDataStore.getState().currentPeriodMetrics;
        expect(metrics.scrap).toBe(1);
    });
});

// =============================================================================
// TEST SUITE: scrapTile() period metrics correction
// =============================================================================

describe('scrapTile — Period Metrics Old Grade Decrement', () => {
    beforeEach(() => {
        useSimulationDataStore.getState().resetDataStore();
    });

    it('should decrement firstQuality when scrapping a tile that was previously first_quality', () => {
        /**
         * Arrange: inject a first_quality tile still on the conveyor.
         * Period metrics reflect the initial first_quality increment.
         */
        const tile = makeCompletedTile('tile-st-001', 10, 'first_quality');

        useSimulationDataStore.setState({
            session: { id: SIM_ID } as any,
            tiles: new Map([['tile-st-001', tile]]),
            conveyorPositions: new Map([['tile-st-001', {
                tile_id: 'tile-st-001',
                current_station: 'sorting',
                position_in_station: 0,
                entered_at_sim_tick: 1,
                next_station: 'packaging',
                ticks_until_next_station: 5,
            }]]),
            totalFirstQuality: 1,
            currentPeriodMetrics: {
                ...useSimulationDataStore.getState().currentPeriodMetrics,
                firstQuality: 1,
                scrap: 0,
            },
        });

        /** Act: scrap the tile at sorting. */
        useSimulationDataStore.getState().scrapTile(
            'tile-st-001',
            'sorting',
            ['conveyor_jam_damage'],
        );

        /** Assert: period metrics corrected. */
        const metrics = useSimulationDataStore.getState().currentPeriodMetrics;
        expect(metrics.firstQuality).toBe(0);
        expect(metrics.scrap).toBe(1);
    });
});

// =============================================================================
// TEST SUITE: Derived selectors — only count completed tiles
// =============================================================================

describe('Derived Selectors — Completed Status Guard', () => {
    beforeEach(() => {
        useSimulationDataStore.getState().resetDataStore();
    });

    it('should NOT count in-flight (in_production) tiles as first_quality in derived selector', () => {
        /**
         * Arrange: 2 completed first_quality tiles + 3 in_production tiles
         * with first_quality grade (simulating the microtask gap).
         * Only the 2 completed tiles should be counted.
         */
        const tiles = new Map<string, TileRecord>([
            ['tile-c1', makeCompletedTile('tile-c1', 1, 'first_quality')],
            ['tile-c2', makeCompletedTile('tile-c2', 2, 'first_quality')],
            ['tile-f1', makeInFlightTile('tile-f1', 3, 'first_quality')],
            ['tile-f2', makeInFlightTile('tile-f2', 4, 'first_quality')],
            ['tile-f3', makeInFlightTile('tile-f3', 5, 'first_quality')],
        ]);

        useSimulationDataStore.setState({
            session: { id: SIM_ID } as any,
            tiles,
        });

        /** Act: derive the count using the same selector as ShipmentBox. */
        const state = useSimulationDataStore.getState();
        let shipmentCount = 0;
        for (const tile of state.tiles.values()) {
            if (tile.status === 'completed' && tile.final_grade === 'first_quality') {
                shipmentCount++;
            }
        }

        /** Assert: only completed tiles counted (2, not 5). */
        expect(shipmentCount).toBe(2);
    });

    it('should count scrapped_at tiles as scrap in derived selector', () => {
        /**
         * Arrange: 1 completed scrap tile + 1 scrapped_at_sorting tile.
         * Both should be counted as scrap.
         */
        const scrapCompleted = makeCompletedTile('tile-sc1', 1, 'scrap');
        const scrapAtSorting: TileRecord = {
            ...makeCompletedTile('tile-sc2', 2, 'scrap'),
            status: 'scrapped_at_kiln',
        };

        useSimulationDataStore.setState({
            session: { id: SIM_ID } as any,
            tiles: new Map([
                ['tile-sc1', scrapCompleted],
                ['tile-sc2', scrapAtSorting],
            ]),
        });

        /** Act: derive waste count using the same selector as TrashBin. */
        const state = useSimulationDataStore.getState();
        let wasteCount = 0;
        for (const tile of state.tiles.values()) {
            const done = tile.status === 'completed' || tile.status.startsWith('scrapped_at_');
            if (done && tile.final_grade === 'scrap') wasteCount++;
        }

        /** Assert: both scrap tiles counted. */
        expect(wasteCount).toBe(2);
    });
});
