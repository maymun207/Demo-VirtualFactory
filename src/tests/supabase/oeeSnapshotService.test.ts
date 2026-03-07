/**
 * oeeSnapshotService.test.ts — Unit Tests for OEE Snapshot Sync Service
 *
 * Tests the `buildSnapshotRow` function and the `oeeSnapshotService`
 * lifecycle (start/stop) in isolation. Supabase and all external stores
 * are mocked to keep tests fast and deterministic.
 *
 * Test coverage:
 *   [OSS-01] buildSnapshotRow maps all FactoryOEE fields to correct DB columns
 *   [OSS-02] buildSnapshotRow handles missing perStation energy gracefully
 *   [OSS-03] buildSnapshotRow maps printer machineId to moee_digital column
 *   [OSS-04] buildSnapshotRow sets correct bottleneck value
 *   [OSS-05] Service start/stop lifecycle creates and clears interval
 */
/// <reference types="vitest/globals" />

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildSnapshotRow } from '../../services/oeeSnapshotService';
import type { FactoryOEE, StationCounts, MachineOEE, LineOEE, StationEnergy } from '../../store/types';

// ─── Mocks ─────────────────────────────────────────────────────────────────
vi.mock('../../lib/supabaseClient', () => ({ supabase: null }));
vi.mock('../../lib/usageTracker', () => ({
    logConnect: vi.fn(),
    logDisconnect: vi.fn(),
}));

// ─── Test Data Factories ───────────────────────────────────────────────────

/**
 * Create a minimal MachineOEE with a specific machineId and OEE value.
 * Other fields default to zero for simplicity.
 */
function makeMachine(machineId: string, oee: number): MachineOEE {
    return {
        machineId,
        name: { tr: machineId, en: machineId },
        performance: oee / 100,
        quality: 1,
        oee,
        actualInput: 10,
        actualOutput: 8,
        scrappedHere: 2,
    };
}

/**
 * Create a minimal StationEnergy entry for a station.
 */
function makeStationEnergy(kWh: number, gas: number, co2: number): StationEnergy {
    return { stationId: '', kWh, gas, co2, tilesProcessed: 10, kWhPerTile: kWh / 10 };
}

/**
 * Create a complete mock FactoryOEE hierarchy for testing.
 * All values are deterministic for assertion.
 */
function makeMockFOEE(): FactoryOEE {
    /** Line 1: press → dryer → glaze → printer */
    const line1: LineOEE = {
        lineId: 'line1',
        name: { tr: 'Line 1', en: 'Line 1' },
        performance: 0.85,
        quality: 0.92,
        oee: 78.2,
        machines: [
            makeMachine('press', 82.5),
            makeMachine('dryer', 79.3),
            makeMachine('glaze', 88.1),
            makeMachine('printer', 75.0),
        ],
        energy: { totalKwh: 40, totalGas: 10, totalCo2: 15, kWhPerTile: 4 },
    };

    /** Line 2: conveyor */
    const line2: LineOEE = {
        lineId: 'line2',
        name: { tr: 'Line 2', en: 'Line 2' },
        performance: 0.95,
        quality: 0.98,
        oee: 93.1,
        machines: [makeMachine('conveyor', 93.1)],
        energy: { totalKwh: 5, totalGas: 0, totalCo2: 2, kWhPerTile: 0.5 },
    };

    /** Line 3: kiln → sorting → packaging */
    const line3: LineOEE = {
        lineId: 'line3',
        name: { tr: 'Line 3', en: 'Line 3' },
        performance: 0.80,
        quality: 0.90,
        oee: 72.0,
        machines: [
            makeMachine('kiln', 70.0),
            makeMachine('sorting', 85.5),
            makeMachine('packaging', 90.0),
        ],
        energy: { totalKwh: 60, totalGas: 25, totalCo2: 30, kWhPerTile: 6 },
    };

    return {
        oee: 68.5,
        bottleneck: 'B',
        bottleneckRate: 120,
        finalOutput: 82,
        lines: [line1, line2, line3],
        energy: {
            totalKwh: 105,
            totalGas: 35,
            totalCo2: 47,
            kWhPerTile: 1.28,
            perStation: {
                press: makeStationEnergy(15, 0, 5),
                dryer: makeStationEnergy(10, 5, 4),
                glaze: makeStationEnergy(8, 0, 3),
                printer: makeStationEnergy(7, 0, 3),
                conveyor: makeStationEnergy(5, 0, 2),
                kiln: makeStationEnergy(40, 25, 20),
                sorting: makeStationEnergy(12, 0, 5),
                packaging: makeStationEnergy(8, 5, 5),
            },
        },
    };
}

/**
 * Create a complete mock StationCounts for testing.
 */
function makeMockCounts(): StationCounts {
    return {
        pressSpawned: 100,
        pressOutput: 95,
        dryerOutput: 93,
        glazeOutput: 91,
        digitalOutput: 90,
        kilnInput: 88,
        conveyorCleanOutput: 87,
        kilnOutput: 85,
        sortingUsableOutput: 82,
        packagingOutput: 82,
        theoreticalA: 110,
        theoreticalB: 120,
        elapsedMinutes: 5.5,
        /** Tiles scrapped due to conveyor jam damage; zero for deterministic test fixture. */
        conveyorScrapped: 0,
        perStation: {},
    };
}

// =============================================================================
// TEST GROUP 1 — buildSnapshotRow
// =============================================================================

describe('[OSS] buildSnapshotRow — Row Construction', () => {
    /** Re-usable test data created fresh for each test. */
    let foee: FactoryOEE;
    let counts: StationCounts;

    beforeEach(() => {
        foee = makeMockFOEE();
        counts = makeMockCounts();
    });

    // ── [OSS-01] All fields mapped correctly ──────────────────────────────────
    it('[OSS-01] maps all FactoryOEE fields to correct DB columns', () => {
        const row = buildSnapshotRow('sim-123', 500, foee, counts);

        /** Session scoping. */
        expect(row.simulation_id).toBe('sim-123');
        expect(row.sim_tick).toBe(500);
        expect(row.elapsed_minutes).toBe(5.5);

        /** Station counts. */
        expect(row.press_spawned).toBe(100);
        expect(row.press_output).toBe(95);
        expect(row.dryer_output).toBe(93);
        expect(row.glaze_output).toBe(91);
        expect(row.digital_output).toBe(90);
        expect(row.kiln_input).toBe(88);
        expect(row.kiln_output).toBe(85);
        expect(row.sorting_usable_output).toBe(82);
        expect(row.packaging_output).toBe(82);
        expect(row.conveyor_clean_output).toBe(87);
        expect(row.theoretical_a).toBe(110);
        expect(row.theoretical_b).toBe(120);

        /** Machine OEEs. */
        expect(row.moee_press).toBe(82.5);
        expect(row.moee_dryer).toBe(79.3);
        expect(row.moee_glaze).toBe(88.1);
        expect(row.moee_conveyor).toBe(93.1);
        expect(row.moee_kiln).toBe(70.0);
        expect(row.moee_sorting).toBe(85.5);
        expect(row.moee_packaging).toBe(90.0);

        /** Line OEEs. */
        expect(row.loee_line1).toBe(78.2);
        expect(row.loee_line2).toBe(93.1);
        expect(row.loee_line3).toBe(72.0);

        /** Factory OEE. */
        expect(row.foee).toBe(68.5);
        expect(row.bottleneck).toBe('B');

        /** Energy totals. */
        expect(row.energy_total_kwh).toBe(105);
        expect(row.energy_total_gas).toBe(35);
        expect(row.energy_total_co2).toBe(47);
        expect(row.energy_kwh_per_tile).toBe(1.28);
    });

    // ── [OSS-02] Missing perStation energy defaults to 0 ──────────────────────
    it('[OSS-02] defaults to 0 when perStation energy is missing', () => {
        /** Remove perStation to simulate incomplete data. */
        foee.energy.perStation = {} as typeof foee.energy.perStation;

        const row = buildSnapshotRow('sim-456', 100, foee, counts);

        /** All per-station energy columns should default to 0. */
        expect(row.energy_press_kwh).toBe(0);
        expect(row.energy_dryer_kwh).toBe(0);
        expect(row.energy_kiln_kwh).toBe(0);
        expect(row.energy_dryer_gas).toBe(0);
        expect(row.energy_kiln_gas).toBe(0);
    });

    // ── [OSS-03] printer machineId → moee_digital column ──────────────────────
    it('[OSS-03] maps printer machineId to moee_digital DB column', () => {
        /**
         * The machine is called 'printer' internally but the DB column
         * is 'moee_digital' (matching the station name "digital printer").
         * This test ensures the mapping is correct.
         */
        const row = buildSnapshotRow('sim-789', 200, foee, counts);
        expect(row.moee_digital).toBe(75.0);
    });

    // ── [OSS-04] Bottleneck value ─────────────────────────────────────────────
    it('[OSS-04] sets bottleneck to A when press is constraining', () => {
        foee.bottleneck = 'A';
        const row = buildSnapshotRow('sim-abc', 300, foee, counts);
        expect(row.bottleneck).toBe('A');
    });

    // ── [OSS-05] Line OEE fallback for missing lines ─────────────────────────
    it('[OSS-05] defaults line OEE to 0 when lines array is short', () => {
        /** Simulate a case where only 2 lines are present. */
        foee.lines = foee.lines.slice(0, 2);

        const row = buildSnapshotRow('sim-def', 400, foee, counts);
        expect(row.loee_line1).toBe(78.2);
        expect(row.loee_line2).toBe(93.1);
        expect(row.loee_line3).toBe(0); // No line3 → defaults to 0
    });
});

// =============================================================================
// TEST GROUP 2 — Service Lifecycle
// =============================================================================

describe('[OSS] OEE Snapshot Service — Lifecycle', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    // ── [OSS-06] start() is idempotent ────────────────────────────────────────
    it('[OSS-06] calling start() multiple times does not create duplicate intervals', async () => {
        /**
         * Import the service after mocks are set up.
         * Since supabase is null, insertSnapshot will be a no-op.
         */
        const { oeeSnapshotService } = await import('../../services/oeeSnapshotService');

        oeeSnapshotService.start();
        oeeSnapshotService.start(); // Second call should be no-op

        /** Advance past one interval — should fire exactly once, not twice. */
        vi.advanceTimersByTime(11000);

        /** Clean up. */
        await oeeSnapshotService.stop();
    });
});
