/**
 * oeeSnapshotService.ts — Periodic OEE Snapshot Sync (kpiStore → Supabase)
 *
 * Periodically reads the hierarchical OEE data from `kpiStore` (computed
 * by useKPISync) and inserts a snapshot row into the `oee_snapshots` table
 * in Supabase. This gives the CWF agent access to:
 *
 *   - Machine-level OEE (8 machines: press, dryer, glaze, printer, conveyor,
 *     kiln, sorting, packaging)
 *   - Line-level OEE (3 lines)
 *   - Factory-level OEE with bottleneck identification
 *   - Station tile counts (A-J variables from the real factory model)
 *   - Cumulative per-station energy consumption (kWh, gas, CO₂)
 *
 * Architecture:
 *   - Uses setInterval at OEE_SNAPSHOT_INTERVAL_MS (default: 10s)
 *   - Only inserts when simulation is running AND factoryOEE is computed
 *   - Time-series append-only (insert, not upsert) — each row is unique
 *   - Follows the same circuit-breaker pattern as telemetryStore for
 *     resilience during Supabase outages
 *   - Does NOT modify any store — pure side-effect (network writes)
 *
 * Lifecycle:
 *   - start() — called by SimulationRunner when isDataFlowing becomes true
 *   - stop()  — called by SimulationRunner on unmount or simulation stop
 *
 * Used by: SimulationRunner.tsx (start/stop lifecycle)
 */

import { supabase } from '../lib/supabaseClient';
import { useSimulationStore } from '../store/simulationStore';
import { useSimulationDataStore } from '../store/simulationDataStore';
import { useKPIStore } from '../store/kpiStore';
import {
    OEE_SNAPSHOT_TABLE,
    OEE_SNAPSHOT_INTERVAL_MS,
    TELEMETRY_MAX_RETRIES,
    TELEMETRY_BASE_RETRY_DELAY_MS,
    TELEMETRY_CIRCUIT_BREAKER_FAILURES,
    TELEMETRY_CIRCUIT_BREAKER_COOLDOWN_MS,
} from '../lib/params';
import { createLogger } from '../lib/logger';
import type { FactoryOEE, StationCounts, MachineOEE } from '../store/types';

/** Module-level logger for OEE snapshot sync operations. */
const log = createLogger('OEESnapshot');

// ═══════════════════════════════════════════════════════════════════
// CIRCUIT BREAKER STATE (module-level, same pattern as telemetryStore)
// ═══════════════════════════════════════════════════════════════════

/**
 * Tracks the number of consecutive failed insert cycles.
 * Resets to 0 on any successful insert.
 * When it reaches TELEMETRY_CIRCUIT_BREAKER_FAILURES the circuit opens.
 */
let consecutiveFailures = 0;

/**
 * Timestamp (ms) until which the circuit breaker is OPEN.
 * While Date.now() < circuitOpenUntil, all inserts are skipped.
 * Set to 0 initially (circuit closed / normal operation).
 */
let circuitOpenUntil = 0;

// ═══════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════

/**
 * Check whether the circuit breaker is currently OPEN.
 * Returns true if we are within the cooldown window (inserts should be skipped).
 * Returns false if the circuit is CLOSED (normal operation allowed).
 */
function isCircuitOpen(): boolean {
    return Date.now() < circuitOpenUntil;
}

/**
 * Trip the circuit breaker OPEN.
 * All inserts will be suppressed for TELEMETRY_CIRCUIT_BREAKER_COOLDOWN_MS.
 */
function openCircuit(): void {
    circuitOpenUntil = Date.now() + TELEMETRY_CIRCUIT_BREAKER_COOLDOWN_MS;
    consecutiveFailures = 0;
    const cooldownMinutes = TELEMETRY_CIRCUIT_BREAKER_COOLDOWN_MS / 60_000;
    log.error(
        `Circuit breaker OPEN — OEE snapshot sync suspended for ${cooldownMinutes} minutes.`,
    );
}

/**
 * Extract a machine's OEE value from the FactoryOEE hierarchy by machineId.
 * Searches across all lines to find the matching machine.
 *
 * @param foee      - The FactoryOEE object containing the full hierarchy
 * @param machineId - The machine identifier (e.g., 'press', 'kiln')
 * @returns The machine's OEE percentage (0-100), or 0 if not found
 */
function getMachineOEE(foee: FactoryOEE, machineId: string): number {
    for (const line of foee.lines) {
        const machine: MachineOEE | undefined = line.machines.find(
            (m) => m.machineId === machineId,
        );
        if (machine) return machine.oee;
    }
    return 0;
}

/**
 * Build a single oee_snapshots row from the current kpiStore and simulation state.
 * Maps the in-memory FactoryOEE hierarchy to the flat database columns.
 *
 * @param simulationId  - Active simulation session UUID
 * @param simTick       - Current S-Clock tick value
 * @param foee          - The full FactoryOEE hierarchy from kpiStore
 * @param counts        - Station tile counts (A-J variables) from kpiStore
 * @returns A plain object matching the oee_snapshots table schema
 */
export function buildSnapshotRow(
    simulationId: string,
    simTick: number,
    foee: FactoryOEE,
    counts: StationCounts,
): Record<string, unknown> {
    return {
        /* ── Session scoping ────────────────────────────────────────────── */
        simulation_id: simulationId,
        sim_tick: simTick,
        elapsed_minutes: counts.elapsedMinutes,

        /* ── Station counts (A-J variables) ─────────────────────────────── */
        press_spawned: counts.pressSpawned,
        press_output: counts.pressOutput,
        dryer_output: counts.dryerOutput,
        glaze_output: counts.glazeOutput,
        digital_output: counts.digitalOutput,
        kiln_input: counts.kilnInput,
        kiln_output: counts.kilnOutput,
        sorting_usable_output: counts.sortingUsableOutput,
        packaging_output: counts.packagingOutput,
        conveyor_clean_output: counts.conveyorCleanOutput,
        theoretical_a: counts.theoreticalA,
        theoretical_b: counts.theoreticalB,

        /* ── Machine OEEs (0-100) ───────────────────────────────────────── */
        moee_press: getMachineOEE(foee, 'press'),
        moee_dryer: getMachineOEE(foee, 'dryer'),
        moee_glaze: getMachineOEE(foee, 'glaze'),
        moee_digital: getMachineOEE(foee, 'printer'),
        moee_conveyor: getMachineOEE(foee, 'conveyor'),
        moee_kiln: getMachineOEE(foee, 'kiln'),
        moee_sorting: getMachineOEE(foee, 'sorting'),
        moee_packaging: getMachineOEE(foee, 'packaging'),

        /* ── Line OEEs (0-100) ──────────────────────────────────────────── */
        loee_line1: foee.lines[0]?.oee ?? 0,
        loee_line2: foee.lines[1]?.oee ?? 0,
        loee_line3: foee.lines[2]?.oee ?? 0,

        /* ── Factory OEE ────────────────────────────────────────────────── */
        foee: foee.oee,
        bottleneck: foee.bottleneck,

        /* ── Cumulative energy totals ────────────────────────────────────── */
        energy_total_kwh: foee.energy.totalKwh,
        energy_total_gas: foee.energy.totalGas,
        energy_total_co2: foee.energy.totalCo2,
        energy_kwh_per_tile: foee.energy.kWhPerTile,

        /* ── Per-station energy (cumulative kWh from perStation map) ────── */
        energy_press_kwh: foee.energy.perStation?.press?.kWh ?? 0,
        energy_dryer_kwh: foee.energy.perStation?.dryer?.kWh ?? 0,
        energy_glaze_kwh: foee.energy.perStation?.glaze?.kWh ?? 0,
        energy_digital_kwh: foee.energy.perStation?.printer?.kWh ?? 0,
        energy_conveyor_kwh: foee.energy.perStation?.conveyor?.kWh ?? 0,
        energy_kiln_kwh: foee.energy.perStation?.kiln?.kWh ?? 0,
        energy_sorting_kwh: foee.energy.perStation?.sorting?.kWh ?? 0,
        energy_packaging_kwh: foee.energy.perStation?.packaging?.kWh ?? 0,
        energy_dryer_gas: foee.energy.perStation?.dryer?.gas ?? 0,
        energy_kiln_gas: foee.energy.perStation?.kiln?.gas ?? 0,
    };
}

// ═══════════════════════════════════════════════════════════════════
// OEE SNAPSHOT SERVICE CLASS
// ═══════════════════════════════════════════════════════════════════

class OEESnapshotService {
    /** Handle to the active setInterval, or null when not syncing. */
    private syncInterval: ReturnType<typeof setInterval> | null = null;

    /**
     * Start the periodic OEE snapshot sync loop.
     * Safe to call multiple times — subsequent calls are no-ops.
     */
    start(): void {
        /* Prevent duplicate intervals (idempotent start). */
        if (this.syncInterval) return;

        this.syncInterval = setInterval(async () => {
            await this.insertSnapshot();
        }, OEE_SNAPSHOT_INTERVAL_MS);

        log.info('Started (interval: %dms)', OEE_SNAPSHOT_INTERVAL_MS);
    }

    /**
     * Stop the periodic OEE snapshot sync loop.
     * Performs one final insert to capture the latest OEE state.
     * Resets the circuit breaker for a clean slate on next start.
     */
    async stop(): Promise<void> {
        /* Clear the periodic interval. */
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
        }

        /* One final insert to capture end-of-simulation OEE. */
        await this.insertSnapshot();

        /* Reset circuit breaker state for next session. */
        consecutiveFailures = 0;
        circuitOpenUntil = 0;
        log.info('Stopped (final snapshot inserted). Circuit breaker reset.');
    }

    /**
     * Insert a FINAL OEE snapshot, bypassing the conveyorStatus guard.
     *
     * Called by Phase 2 (ConveyorBelt.tsx) AFTER drainConveyor() to capture
     * the true post-drain production totals. By this point, stopDataFlow()
     * has already set conveyorStatus='stopped', so the normal insertSnapshot()
     * guard would skip the insert — leaving a stale OEE snapshot.
     *
     * This method reads the current kpiStore/simulationDataStore state
     * directly and inserts a row without checking conveyorStatus.
     *
     * @returns void — errors are logged, never thrown
     */
    async insertFinalSnapshot(): Promise<void> {
        /* Guard: Supabase not configured — no-op. */
        if (!supabase) return;

        /* Read session ID — must still exist even after stopDataFlow(). */
        const dataStore = useSimulationDataStore.getState();
        const simulationId = dataStore.session?.id;
        if (!simulationId) {
            log.warn('insertFinalSnapshot: no active session — skipping.');
            return;
        }

        /* Read OEE data from kpiStore. */
        const kpi = useKPIStore.getState();
        if (!kpi.factoryOEE || !kpi.stationCounts) {
            log.warn('insertFinalSnapshot: factoryOEE not computed — skipping.');
            return;
        }

        /* Read sim tick from simulation store. */
        const sim = useSimulationStore.getState();

        /* Build and insert the snapshot row. */
        const row = buildSnapshotRow(
            simulationId,
            sim.sClockCount,
            kpi.factoryOEE,
            kpi.stationCounts,
        );

        const { error } = await supabase
            .from(OEE_SNAPSHOT_TABLE)
            .insert(row);

        if (error) {
            log.error('insertFinalSnapshot failed:', error.message);
        } else {
            log.info('Post-drain final OEE snapshot inserted successfully.');
        }
    }

    /**
     * Perform a single OEE snapshot insert to Supabase.
     *
     * Guards:
     *  - Skips if Supabase client is not configured
     *  - Skips if simulation is not running
     *  - Skips if no active session exists
     *  - Skips if factoryOEE has not been computed yet (null)
     *  - Skips if circuit breaker is open
     *
     * Retries with exponential backoff on transient failures.
     * Opens circuit breaker after TELEMETRY_CIRCUIT_BREAKER_FAILURES
     * consecutive failures.
     */
    private async insertSnapshot(): Promise<void> {
        /* Guard: Supabase not configured — no-op. */
        if (!supabase) return;

        /* Guard: circuit breaker is open — skip silently. */
        if (isCircuitOpen()) {
            log.warn('Circuit breaker OPEN — skipping OEE snapshot insert.');
            return;
        }

        /* Guard: simulation not running — skip this cycle. */
        const sim = useSimulationStore.getState();
        if (sim.conveyorStatus !== 'running') return;

        /* Guard: no active session — skip this cycle. */
        const dataStore = useSimulationDataStore.getState();
        const simulationId = dataStore.session?.id;
        if (!simulationId) return;

        /* Guard: OEE not yet computed — skip until useKPISync produces data. */
        const kpi = useKPIStore.getState();
        if (!kpi.factoryOEE || !kpi.stationCounts) return;

        /* Build the snapshot row from current in-memory OEE state. */
        const row = buildSnapshotRow(
            simulationId,
            sim.sClockCount,
            kpi.factoryOEE,
            kpi.stationCounts,
        );

        /* Insert with exponential backoff retry. */
        for (let attempt = 0; attempt < TELEMETRY_MAX_RETRIES; attempt++) {
            const { error } = await supabase
                .from(OEE_SNAPSHOT_TABLE)
                .insert(row);

            if (!error) {
                /* SUCCESS — reset failure counter. */
                consecutiveFailures = 0;
                return;
            }

            /* 503 / Service Unavailable — open circuit immediately. */
            const is503 =
                error.message?.includes('503') ||
                error.message?.toLowerCase().includes('service unavailable') ||
                (error as unknown as { status?: number }).status === 503;

            if (is503) {
                log.error('Received 503 — opening circuit breaker immediately.');
                openCircuit();
                return;
            }

            /* Transient error — log and schedule retry. */
            log.warn(
                `Insert attempt ${attempt + 1}/${TELEMETRY_MAX_RETRIES} failed: ${error.message}`,
            );

            /* Wait before next retry (skip wait on last attempt). */
            if (attempt < TELEMETRY_MAX_RETRIES - 1) {
                const delay = TELEMETRY_BASE_RETRY_DELAY_MS * Math.pow(2, attempt);
                await new Promise((r) => setTimeout(r, delay));
            }
        }

        /* All retries exhausted — increment consecutive failure counter. */
        log.error(`All ${TELEMETRY_MAX_RETRIES} retry attempts exhausted.`);
        consecutiveFailures += 1;
        log.warn(
            `Consecutive failure count: ${consecutiveFailures}/${TELEMETRY_CIRCUIT_BREAKER_FAILURES}`,
        );

        /* Open circuit if threshold breached. */
        if (consecutiveFailures >= TELEMETRY_CIRCUIT_BREAKER_FAILURES) {
            openCircuit();
        }
    }
}

// ═══════════════════════════════════════════════════════════════════
// SINGLETON EXPORT
// ═══════════════════════════════════════════════════════════════════

/** Global OEE snapshot service instance. Start/stop from SimulationRunner. */
export const oeeSnapshotService = new OEESnapshotService();
