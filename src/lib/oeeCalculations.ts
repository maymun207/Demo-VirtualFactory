/**
 * oeeCalculations.ts — Hierarchical OEE Calculation Engine
 *
 * Pure functions implementing the real-world tile factory OEE methodology.
 * ALL functions are stateless — receive data through arguments, return results.
 * NO store imports, NO side effects.
 *
 * Data flow:
 *   tileSnapshots + counters → countStationExits()
 *   → calculateAllMOEEs() → calculateAllLOEEs() → calculateFOEE()
 *
 * Formulas based on real ceramic tile factory (two-factor P × Q model):
 *   MOEE = Performance × Quality per machine
 *   LOEE = telescoped across line stations
 *   FOEE = J / min(A, B) bottleneck-anchored
 */

import {
    THEORETICAL_RATE_HEADROOM,
    KILN_BOTTLENECK_FACTOR,
    LINE_DEFINITIONS,
    OEE_MACHINE_NAMES,
} from './params/oee';
import type {
    TileSnapshotRecord,
    StationCounts,
    MachineOEE,
    LineOEE,
    FactoryOEE,
    StationEnergy,
} from '../store/types';

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

/** Safe division: returns 0 when denominator is 0 (prevents NaN/Infinity) */
const safeDiv = (num: number, den: number): number => (den === 0 ? 0 : num / den);

/** Clamp a value between 0 and a max (default 1 for ratios) */
const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

// ═══════════════════════════════════════════════════════════════
// TILE COUNTING — Extract A-J variables from snapshot data
// ═══════════════════════════════════════════════════════════════

/**
 * Count tiles at each measurement point from tile snapshot data.
 *
 * Single-pass iteration over tileSnapshots Map.
 * For each tile, iterates its snapshots to determine:
 *   - Station IN count (tile has a snapshot at this station)
 *   - Station OUT count (snapshot has scrapped_here=false)
 *   - Conveyor damage (any snapshot has 'conveyor_jam_damage' in defect_types)
 *
 * Scrap handling:
 *   - Path A (removed from conveyor): scrapped_here=true → NOT in OUT count
 *   - Path B (stays on conveyor): scrapped_here=false → IS in OUT count,
 *     loss captured at sorting when graded as scrap
 *
 * Complexity: O(n × k) where n = tile count, k = avg snapshots per tile (~7)
 *
 * @param tileSnapshots      - Map from tileId → array of TileSnapshotRecord
 * @param totalFirstQuality  - Cumulative first quality tiles (from data store)
 * @param totalSecondQuality - Cumulative second quality tiles (from data store)
 * @param sClockCount        - Current S-Clock tick count
 * @param stationInterval    - Current station interval (P-Clock fires every N S-Clock ticks)
 * @returns StationCounts with all A-J variables and per-station IN/OUT
 */
export function countStationExits(
    tileSnapshots: Map<string, TileSnapshotRecord[]>,
    totalFirstQuality: number,
    _totalSecondQuality: number,
    sClockCount: number,
    stationInterval: number,
): StationCounts {
    // Per-station IN/OUT/scrapped accumulators
    const stationStats: Record<string, { in: number; out: number; scrappedHere: number }> = {
        press: { in: 0, out: 0, scrappedHere: 0 },
        dryer: { in: 0, out: 0, scrappedHere: 0 },
        glaze: { in: 0, out: 0, scrappedHere: 0 },
        printer: { in: 0, out: 0, scrappedHere: 0 },
        kiln: { in: 0, out: 0, scrappedHere: 0 },
        sorting: { in: 0, out: 0, scrappedHere: 0 },
        packaging: { in: 0, out: 0, scrappedHere: 0 },
    };

    /** Tracks tiles that successfully transited the conveyor without jam damage */
    let conveyorCleanOutput = 0;

    /**
     * Passport-based conveyor scrap counter.
     * Counts tiles where conveyor_jam_damage was detected AND the tile was
     * scrapped at sorting (scrapped_here=true). This separates conveyor-caused
     * scrap from sorting's own defect scrap to prevent double-counting.
     */
    let conveyorScrapped = 0;

    for (const [, snapshots] of tileSnapshots) {
        // ── Per-tile flags ──
        let hasConveyorDamage = false;
        let exitedDigital = false;
        let reachedKiln = false;

        // First scan: detect conveyor damage across ALL snapshots for this tile.
        // We must check all snapshots because conveyor_jam_damage is recorded
        // at the SORTING station, not at the conveyor itself.
        for (const snap of snapshots) {
            if (
                snap.defect_detected &&
                snap.defect_types != null &&
                (snap.defect_types as string[]).includes('conveyor_jam_damage')
            ) {
                hasConveyorDamage = true;
                break; // One is enough
            }
        }

        // Second scan: count station IN/OUT
        for (const snap of snapshots) {
            const station = snap.station;
            const stats = stationStats[station];
            if (!stats) continue; // Safety: skip unknown stations

            // IN: tile arrived at this station (has a snapshot)
            stats.in++;

            if (snap.scrapped_here) {
                // Tile was scrapped AND removed at this station (Path A)
                stats.scrappedHere++;
            } else {
                // Tile survived this station (Path A: not scrapped, or Path B: defective but continues)
                stats.out++;

                // Track if tile exited the digital printer (last station in Line 1)
                if (station === 'printer') exitedDigital = true;
            }

            // Track if tile reached kiln (regardless of scrapped_here)
            if (station === 'kiln') reachedKiln = true;
        }

        // Conveyor clean output: tile exited digital AND reached kiln AND no jam damage
        if (exitedDigital && reachedKiln && !hasConveyorDamage) {
            conveyorCleanOutput++;
        }

        /**
         * Conveyor scrap: tile had conveyor_jam_damage AND was scrapped at sorting.
         * Read directly from the tile passport — the single source of truth.
         */
        if (hasConveyorDamage) {
            const wasScrappedAtSorting = snapshots.some(
                (s) => s.station === 'sorting' && s.scrapped_here,
            );
            if (wasScrappedAtSorting) conveyorScrapped++;
        }
    }

    return {
        pressSpawned: stationStats.press.in,
        pressOutput: stationStats.press.out,
        dryerOutput: stationStats.dryer.out,
        glazeOutput: stationStats.glaze.out,
        digitalOutput: stationStats.printer.out,
        kilnInput: stationStats.kiln.in,
        conveyorCleanOutput,
        conveyorScrapped,
        kilnOutput: stationStats.kiln.out,
        sortingUsableOutput: totalFirstQuality,
        /**
         * J = first quality output ONLY.
         * In OEE methodology, Quality = good parts / total parts.
         * "Good" means first quality — second quality IS a quality loss.
         * Using totalFirstQuality (not packaging snapshot count) because
         * packaging doesn't add quality losses, it boxes what sorting approved.
         */
        packagingOutput: totalFirstQuality,
        /**
         * Theoretical output = P-Clock ticks that COULD have fired × headroom.
         * P-Clock fires every `stationInterval` S-Clock ticks, spawning 1 tile.
         * Using runtime stationInterval (not DEFAULT) so this is correct
         * regardless of slider position. The 169%/167% bug was caused by
         * hardcoding DEFAULT_STATION_INTERVAL=2 when runtime was 1.
         */
        theoreticalA: (sClockCount / stationInterval) * THEORETICAL_RATE_HEADROOM,
        theoreticalB: (sClockCount / stationInterval) * THEORETICAL_RATE_HEADROOM * KILN_BOTTLENECK_FACTOR,
        elapsedMinutes: 0, // deprecated — tick-based model doesn't need time
        perStation: stationStats,
    };
}

// ═══════════════════════════════════════════════════════════════
// MACHINE OEE — 8 individual calculations
// ═══════════════════════════════════════════════════════════════

/**
 * Calculate OEE for all 8 machines from station counts.
 *
 * Each machine:
 *   P = actual output / theoretical capacity (0-1)
 *   Q = output / input (yield, 0-1)
 *   MOEE = P × Q × 100 (0-100%)
 *
 * Line 1 machines reference theoretical rate A (press capacity).
 * Line 2 machines reference theoretical rate B (kiln capacity).
 * Conveyor is yield-only (P = 1.0).
 *
 * @param c - Station counts from countStationExits()
 * @returns Array of 8 MachineOEE objects in production order
 */
export function calculateAllMOEEs(c: StationCounts): MachineOEE[] {
    /** A = press theoretical output for elapsed time */
    const A = c.theoreticalA;
    /** B = kiln theoretical output for elapsed time */
    const B = c.theoreticalB;

    const machines: MachineOEE[] = [
        // ── LINE 1 machines (reference rate A) ──────────────────────
        {
            machineId: 'press',
            name: OEE_MACHINE_NAMES.press,
            performance: clamp01(safeDiv(c.pressSpawned, A)),      // P = C_in / A
            quality: clamp01(safeDiv(c.pressOutput, c.pressSpawned)), // Q = C / C_in
            oee: 0, // calculated below
            actualInput: c.pressSpawned,
            actualOutput: c.pressOutput,
            scrappedHere: c.perStation.press.scrappedHere,
        },
        {
            machineId: 'dryer',
            name: OEE_MACHINE_NAMES.dryer,
            performance: clamp01(safeDiv(c.dryerOutput, A)),       // P = D / A
            quality: clamp01(safeDiv(c.dryerOutput, c.pressOutput)), // Q = D / C
            oee: 0,
            actualInput: c.pressOutput,
            actualOutput: c.dryerOutput,
            scrappedHere: c.perStation.dryer.scrappedHere,
        },
        {
            machineId: 'glaze',
            name: OEE_MACHINE_NAMES.glaze,
            performance: clamp01(safeDiv(c.glazeOutput, A)),       // P = E / A
            quality: clamp01(safeDiv(c.glazeOutput, c.dryerOutput)), // Q = E / D
            oee: 0,
            actualInput: c.dryerOutput,
            actualOutput: c.glazeOutput,
            scrappedHere: c.perStation.glaze.scrappedHere,
        },
        {
            machineId: 'printer',
            name: OEE_MACHINE_NAMES.printer,
            performance: clamp01(safeDiv(c.digitalOutput, A)),     // P = F / A
            quality: clamp01(safeDiv(c.digitalOutput, c.glazeOutput)), // Q = F / E
            oee: 0,
            actualInput: c.glazeOutput,
            actualOutput: c.digitalOutput,
            scrappedHere: c.perStation.printer.scrappedHere,
        },

        // ── LINE 3 (Conveyor — yield-only, P = 1.0) ────────────────
        {
            machineId: 'conveyor',
            name: OEE_MACHINE_NAMES.conveyor,
            performance: 1.0,                                      // P = 1.0 (always)
            quality: clamp01(safeDiv(c.conveyorCleanOutput, c.digitalOutput)), // Q = G_clean / F
            oee: 0,
            actualInput: c.digitalOutput,
            actualOutput: c.conveyorCleanOutput,
            /** Use passport-derived count to avoid double-counting at sorting */
            scrappedHere: c.conveyorScrapped,
        },

        // ── LINE 2 machines (reference rate B) ──────────────────────
        {
            machineId: 'kiln',
            name: OEE_MACHINE_NAMES.kiln,
            performance: clamp01(safeDiv(c.kilnInput, B)),         // P = G / B
            quality: clamp01(safeDiv(c.kilnOutput, c.kilnInput)), // Q = H / G
            oee: 0,
            actualInput: c.kilnInput,
            actualOutput: c.kilnOutput,
            scrappedHere: c.perStation.kiln.scrappedHere,
        },
        {
            machineId: 'sorting',
            name: OEE_MACHINE_NAMES.sorting,
            performance: clamp01(safeDiv(c.kilnOutput, B)),        // P = H / B
            quality: clamp01(safeDiv(c.sortingUsableOutput, c.kilnOutput)), // Q = I / H
            oee: 0,
            actualInput: c.kilnOutput,
            actualOutput: c.sortingUsableOutput,
            /** Subtract conveyor scrap to avoid double-counting (conveyor already owns those tiles) */
            scrappedHere: c.perStation.sorting.scrappedHere - c.conveyorScrapped,
        },
        {
            machineId: 'packaging',
            name: OEE_MACHINE_NAMES.packaging,
            performance: clamp01(safeDiv(c.sortingUsableOutput, B)), // P = I / B
            quality: clamp01(safeDiv(c.packagingOutput, c.sortingUsableOutput)), // Q = J / I
            oee: 0,
            actualInput: c.sortingUsableOutput,
            actualOutput: c.packagingOutput,
            scrappedHere: c.perStation.packaging.scrappedHere,
        },
    ];

    // Calculate OEE = P × Q × 100 for each machine
    for (const m of machines) {
        m.oee = m.performance * m.quality * 100;
    }

    return machines;
}

// ═══════════════════════════════════════════════════════════════
// LINE OEE — 3 telescoped calculations
// ═══════════════════════════════════════════════════════════════

/**
 * Calculate OEE for all 3 lines.
 *
 * Each line OEE telescopes: intermediate variables cancel out.
 *   Line 1: LOEE = F / A (digital output / press theoretical)
 *   Line 2: LOEE = J / B (packaging output / kiln theoretical)
 *   Line 3: LOEE = G_clean / F (conveyor yield)
 *
 * @param c     - Station counts
 * @param moees - All 8 machine OEEs (for grouping into lines)
 * @param cumulativeEnergy - Cumulative per-station energy from kpiStore
 * @returns Array of 3 LineOEE objects
 */
export function calculateAllLOEEs(
    c: StationCounts,
    moees: MachineOEE[],
    cumulativeEnergy: Record<string, { kWh: number; gas: number; co2: number }>,
): LineOEE[] {
    /**
     * Aggregate energy totals for a set of station IDs.
     * Returns totalKwh, totalGas, totalCo2, and kWhPerTile efficiency.
     */
    const aggregateEnergy = (stationIds: readonly string[], outputTiles: number) => {
        let totalKwh = 0;
        let totalGas = 0;
        let totalCo2 = 0;
        for (const id of stationIds) {
            const e = cumulativeEnergy[id];
            if (e) {
                totalKwh += e.kWh;
                totalGas += e.gas;
                totalCo2 += e.co2;
            }
        }
        return {
            totalKwh,
            totalGas,
            totalCo2,
            kWhPerTile: outputTiles > 0 ? totalKwh / outputTiles : 0,
        };
    };

    /** Filter MOEEs to only include machines belonging to a specific line */
    const filterMOEEs = (stationIds: readonly string[]) =>
        moees.filter(m => (stationIds as readonly string[]).includes(m.machineId));

    /** A = press theoretical output for elapsed time */
    const A = c.theoreticalA;
    /** B = kiln theoretical output for elapsed time */
    const B = c.theoreticalB;

    return [
        // Line 1: LOEE = F / A (digital output / press theoretical)
        {
            lineId: LINE_DEFINITIONS.line1.id,
            name: LINE_DEFINITIONS.line1.name,
            performance: clamp01(safeDiv(c.pressSpawned, A)),                  // C_in / A
            quality: clamp01(safeDiv(c.digitalOutput, c.pressSpawned)),    // F / C_in
            oee: Math.min(100, safeDiv(c.digitalOutput, A) * 100),     // F / A × 100, capped at 100%
            machines: filterMOEEs(LINE_DEFINITIONS.line1.stations),
            energy: aggregateEnergy(LINE_DEFINITIONS.line1.stations, c.digitalOutput),
        },
        // Line 2: LOEE = J / B (packaging output / kiln theoretical)
        {
            lineId: LINE_DEFINITIONS.line2.id,
            name: LINE_DEFINITIONS.line2.name,
            performance: clamp01(safeDiv(c.kilnInput, B)),                     // G / B
            quality: clamp01(safeDiv(c.packagingOutput, c.kilnInput)),     // J / G
            oee: Math.min(100, safeDiv(c.packagingOutput, B) * 100),   // J / B × 100, capped at 100%
            machines: filterMOEEs(LINE_DEFINITIONS.line2.stations),
            energy: aggregateEnergy(LINE_DEFINITIONS.line2.stations, c.packagingOutput),
        },
        // Line 3: LOEE = G_clean / F (conveyor yield)
        {
            lineId: LINE_DEFINITIONS.line3.id,
            name: LINE_DEFINITIONS.line3.name,
            performance: 1.0,                                                  // Always 1.0 for conveyor
            quality: clamp01(safeDiv(c.conveyorCleanOutput, c.digitalOutput)), // G_clean / F
            oee: Math.min(100, safeDiv(c.conveyorCleanOutput, c.digitalOutput) * 100), // G_clean / F × 100, capped at 100%
            machines: filterMOEEs(LINE_DEFINITIONS.line3.stations),
            energy: aggregateEnergy(['conveyor'], c.conveyorCleanOutput),
        },
    ];
}

// ═══════════════════════════════════════════════════════════════
// FACTORY OEE — Bottleneck-anchored
// ═══════════════════════════════════════════════════════════════

/**
 * Calculate factory-level OEE anchored to the bottleneck rate.
 *
 * FOEE = J / min(A, B)
 *
 * Since kiln is typically the bottleneck (B < A): FOEE ≈ J/B = LOEE₂
 * If press becomes constraint (A < B): FOEE = J/A
 *
 * @param c     - Station counts
 * @param loees - All 3 line OEEs
 * @param cumulativeEnergy - Cumulative per-station energy
 * @returns FactoryOEE with all lines, energy, and bottleneck info
 */
export function calculateFOEE(
    c: StationCounts,
    loees: LineOEE[],
    cumulativeEnergy: Record<string, { kWh: number; gas: number; co2: number }>,
): FactoryOEE {
    /** Bottleneck rate = min(A, B) — the constraining theoretical capacity */
    const bottleneckRate = Math.min(c.theoreticalA, c.theoreticalB);
    /** Which rate is constraining: 'A' (press) or 'B' (kiln).
     *  When equal (A = B), defaults to 'B' since kiln is the real-world bottleneck. */
    const bottleneck: 'A' | 'B' = c.theoreticalA < c.theoreticalB ? 'A' : 'B';
    /** Factory OEE = J / min(A, B) × 100, capped at 100% */
    const oee = Math.min(100, safeDiv(c.packagingOutput, bottleneckRate) * 100);

    // Factory energy = sum of all station energy
    let totalKwh = 0;
    let totalGas = 0;
    let totalCo2 = 0;
    /** Per-station energy with kWhPerTile efficiency */
    const perStationEnergy: Record<string, StationEnergy> = {};

    for (const [id, e] of Object.entries(cumulativeEnergy)) {
        totalKwh += e.kWh;
        totalGas += e.gas;
        totalCo2 += e.co2;

        // Find the corresponding station's tile count for kWhPerTile calculation
        const stationOut = c.perStation[id]?.out ?? 0;
        perStationEnergy[id] = {
            stationId: id,
            kWh: e.kWh,
            gas: e.gas,
            co2: e.co2,
            tilesProcessed: stationOut,
            kWhPerTile: stationOut > 0 ? e.kWh / stationOut : 0,
        };
    }

    // Add conveyor energy (not in perStation since it's not a StationName)
    const conveyorE = cumulativeEnergy['conveyor'];
    if (conveyorE && !perStationEnergy['conveyor']) {
        perStationEnergy['conveyor'] = {
            stationId: 'conveyor',
            kWh: conveyorE.kWh,
            gas: conveyorE.gas,
            co2: conveyorE.co2,
            tilesProcessed: c.conveyorCleanOutput,
            kWhPerTile: c.conveyorCleanOutput > 0 ? conveyorE.kWh / c.conveyorCleanOutput : 0,
        };
    }

    return {
        oee,
        bottleneck,
        bottleneckRate,
        finalOutput: c.packagingOutput,
        lines: loees,
        energy: {
            totalKwh,
            totalGas,
            totalCo2,
            kWhPerTile: c.packagingOutput > 0 ? totalKwh / c.packagingOutput : 0,
            perStation: perStationEnergy,
        },
    };
}
