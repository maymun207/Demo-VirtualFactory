/**
 * telemetryStore.ts — Supabase Telemetry Sync (Zustand)
 *
 * Periodically pushes simulation state and KPI values to a Supabase
 * 'telemetry' table for external monitoring, dashboards, and analytics.
 *
 * ─── BUGS FIXED (2026-02-24) ───────────────────────────────────────────────
 *
 * Bug 1 — Always-on telemetry:
 *   Previously started on app mount and ran 24/7 regardless of whether the
 *   simulation was running. Now the upsert cycle is SKIPPED when the
 *   simulation is not in 'running' state (status check inside interval callback).
 *
 * Bug 2 — 8 sequential upserts per cycle:
 *   Previously fired one await'd upsert per station (7) + 1 global = 8 serial
 *   network calls per cycle. Now a SINGLE batch upsert sends all rows in one
 *   request, reducing network calls by 87.5%.
 *
 * Bug 3 — No circuit breaker:
 *   Previously retried forever — during a Supabase outage this produced
 *   288+ failed requests/minute. Now a circuit breaker opens after
 *   TELEMETRY_CIRCUIT_BREAKER_FAILURES consecutive failures and suspends
 *   all telemetry for TELEMETRY_CIRCUIT_BREAKER_COOLDOWN_MS (5 minutes).
 *
 * Bug 4 — 503 treated same as any error:
 *   A 503 means the server is completely unavailable. Previously the code
 *   retried 503s with the same 1s/2s/4s backoff as transient errors, making
 *   outages worse. Now a 503 immediately opens the circuit breaker and skips
 *   all retries for that cycle.
 *
 * ─── Architecture ──────────────────────────────────────────────────────────
 *  Reads from simulationStore and kpiStore (cross-store read via getState).
 *  Does NOT modify any other store — pure side-effect (network writes).
 *  Used by: App.tsx (started on mount, stopped on unmount)
 */

import { create } from 'zustand';
import { supabase } from '../lib/supabaseClient';
import { useSimulationStore } from './simulationStore';
import { useKPIStore } from './kpiStore';
import { useSimulationDataStore } from './simulationDataStore';
import { STATION_ORDER } from './types';
import {
  TELEMETRY_INTERVAL_MS,
  TELEMETRY_FACTORY_ID,
  TELEMETRY_MAX_RETRIES,
  TELEMETRY_BASE_RETRY_DELAY_MS,
  TELEMETRY_CIRCUIT_BREAKER_FAILURES,
  TELEMETRY_CIRCUIT_BREAKER_COOLDOWN_MS,
} from '../lib/params';
import { createLogger } from '../lib/logger';

/** Module-level logger for telemetry sync operations. */
const log = createLogger('Telemetry');

// ─── Circuit Breaker State (module-level, not in Zustand) ─────────────────────
// Kept outside Zustand to avoid triggering React re-renders on breaker state
// changes. These values only affect network behavior, not UI state.

/**
 * Tracks the number of consecutive failed upsert cycles.
 * Resets to 0 on any successful upsert batch.
 * When it reaches TELEMETRY_CIRCUIT_BREAKER_FAILURES the circuit opens.
 */
let consecutiveFailures = 0;

/**
 * Timestamp (ms) until which the circuit breaker is OPEN.
 * While Date.now() < circuitOpenUntil, all upserts are skipped.
 * Set to 0 initially (circuit closed / normal operation).
 */
let circuitOpenUntil = 0;

// ─── Interfaces ──────────────────────────────────────────────────────────────

/**
 * TelemetryState — Shape of the telemetry store.
 */
interface TelemetryState {
  /** Handle to the active setInterval, or null when not syncing */
  telemetryInterval: ReturnType<typeof setInterval> | null;

  /**
   * Start the periodic telemetry sync.
   * No-op if already started (prevents duplicate intervals).
   * Sets up a setInterval that fires every TELEMETRY_INTERVAL_MS.
   * IMPORTANT: The interval runs always, but upserts are SKIPPED when
   * the simulation is not in 'running' state (fix: Bug 1).
   */
  startTelemetrySync: () => void;

  /**
   * Stop the periodic telemetry sync and clear the interval.
   * Safe to call even if not currently syncing.
   * Also resets the circuit breaker so the next startTelemetrySync
   * begins with a clean slate.
   */
  stopTelemetrySync: () => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Check whether the circuit breaker is currently OPEN.
 * Returns true if we are within the cooldown window (upserts should be skipped).
 * Returns false if the circuit is CLOSED (normal operation allowed).
 */
function isCircuitOpen(): boolean {
  return Date.now() < circuitOpenUntil;
}

/**
 * Trip the circuit breaker OPEN.
 * All upserts will be suppressed for TELEMETRY_CIRCUIT_BREAKER_COOLDOWN_MS.
 */
function openCircuit(): void {
  circuitOpenUntil = Date.now() + TELEMETRY_CIRCUIT_BREAKER_COOLDOWN_MS;
  consecutiveFailures = 0;
  const cooldownMinutes = TELEMETRY_CIRCUIT_BREAKER_COOLDOWN_MS / 60_000;
  log.error(
    `Circuit breaker OPEN — telemetry suspended for ${cooldownMinutes} minutes.`,
  );
}

/**
 * Batch upsert an array of rows to a Supabase table with exponential backoff
 * retry. Sends ALL rows in a SINGLE network request (fix: Bug 2).
 *
 * Circuit breaker behaviour (fix: Bug 3 + Bug 4):
 *  - If the circuit is OPEN: returns false immediately (no request made).
 *  - If upsert returns a 503: opens the circuit immediately, skips retries.
 *  - On other failures: retries up to TELEMETRY_MAX_RETRIES times.
 *  - On success: resets consecutiveFailures to 0.
 *  - After TELEMETRY_CIRCUIT_BREAKER_FAILURES consecutive full-cycle failures:
 *    opens the circuit.
 *
 * @param table   - Supabase table name (e.g., 'telemetry')
 * @param rows    - Array of row objects to upsert in one batch
 * @returns true if upsert succeeded, false after retries exhausted or circuit open
 */
async function batchUpsertWithCircuitBreaker(
  table: string,
  rows: Record<string, unknown>[],
): Promise<boolean> {
  // Fast path: Supabase client not configured
  if (!supabase) return false;

  // Fast path: circuit breaker is open — skip ALL upserts silently
  if (isCircuitOpen()) {
    log.warn('Circuit breaker OPEN — skipping telemetry upsert.');
    return false;
  }

  // Attempt upsert with exponential backoff
  for (let attempt = 0; attempt < TELEMETRY_MAX_RETRIES; attempt++) {
    const { error } = await supabase
      .from(table)
      .upsert(rows, {
        onConflict: 'machine_id,simulation_id,s_clock',
        ignoreDuplicates: true,
      });

    if (!error) {
      // SUCCESS — reset consecutive failure counter and return
      consecutiveFailures = 0;
      return true;
    }

    // ── 503 / Service Unavailable detection (fix: Bug 4) ──────────────────
    // Supabase returns status 503 when PostgREST is restarting or overwhelmed.
    // Retrying immediately only makes it worse. Open the circuit right away.
    const is503 =
      error.message?.includes('503') ||
      error.message?.toLowerCase().includes('service unavailable') ||
      // supabase-js wraps HTTP status in error.status for some versions
      (error as unknown as { status?: number }).status === 503;

    if (is503) {
      log.error('Received 503 Service Unavailable — opening circuit breaker immediately.');
      openCircuit();
      return false;
    }

    // ── Transient error — log and schedule retry ───────────────────────────
    log.warn(
      `Upsert attempt ${attempt + 1}/${TELEMETRY_MAX_RETRIES} failed: ${error.message}`,
    );

    // Wait before next retry (skip wait on last attempt to avoid blocking cleanup)
    if (attempt < TELEMETRY_MAX_RETRIES - 1) {
      // Exponential backoff: 1s → 2s → 4s
      const delay = TELEMETRY_BASE_RETRY_DELAY_MS * Math.pow(2, attempt);
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  // ── All retries exhausted ─────────────────────────────────────────────────
  log.error(`All ${TELEMETRY_MAX_RETRIES} retry attempts exhausted.`);

  // Increment the persistent consecutive-failure counter.
  consecutiveFailures += 1;
  log.warn(`Consecutive failure count: ${consecutiveFailures}/${TELEMETRY_CIRCUIT_BREAKER_FAILURES}`);

  // If it breaches the threshold, open the circuit.
  if (consecutiveFailures >= TELEMETRY_CIRCUIT_BREAKER_FAILURES) {
    openCircuit();
  }

  return false;
}

// ─── Store Implementation ────────────────────────────────────────────────────

export const useTelemetryStore = create<TelemetryState>((set, get) => ({
  telemetryInterval: null,

  startTelemetrySync: () => {
    // Prevent duplicate intervals (idempotent start)
    if (get().telemetryInterval) return;

    const interval = setInterval(async () => {
      // ── Fix: Bug 1 — Only push telemetry when simulation is running ──────
      // Read live status from simulationStore. If not running (paused/stopped/idle),
      // skip this cycle entirely. The interval keeps running so we resume
      // automatically when the simulation starts again.
      const sim = useSimulationStore.getState();
      if (sim.conveyorStatus !== 'running') {
        return; // Simulation is not active — skip this cycle silently
      }

      // ── Simulation scoping: read active session ID ────────────────────────
      // Every telemetry row must be tagged with the current simulation_id.
      // This ensures per-simulation isolation (no cross-user overwrites)
      // and allows CWF to query telemetry for a specific simulation.
      const dataStore = useSimulationDataStore.getState();
      const simulationId = dataStore.session?.id;
      if (!simulationId) {
        return; // No active simulation session — skip this cycle
      }

      const kpi = useKPIStore.getState();

      // ── Fix: Bug 2 — Build all rows upfront, then send in ONE batch insert ──
      // Previously: 8 sequential await'd upsert calls (7 stations + 1 global).
      // Now: a single supabase.insert([...rows]) network request.
      // Changed from upsert to insert — telemetry is now time-series (append-only).

      // Flatten KPI array into a key-value map for the global summary row
      const kpiMap: Record<string, string> = {};
      kpi.kpis.forEach((k) => {
        kpiMap[k.id] = k.value;
      });

      // Timestamp shared across all rows in this sync cycle
      const now = new Date().toISOString();

      // Build per-station rows (one per station — 7 machines)
      const stationRows: Record<string, unknown>[] = STATION_ORDER.map((stationId) => ({
        machine_id: stationId,             // e.g. 'press', 'kiln', …
        simulation_id: simulationId,       // Per-simulation scoping
        status: sim.conveyorStatus,        // Live factory status
        s_clock: sim.sClockCount,          // Current S-Clock tick (PK component)
        p_clock: sim.pClockCount,          // Current P-Clock tick
        conveyor_speed: sim.conveyorSpeed,
        created_at: now,
        updated_at: now,
      }));

      // Build conveyor row (8th machine)
      const conveyorRow: Record<string, unknown> = {
        machine_id: 'conveyor',            // 8th machine — the conveyor itself
        simulation_id: simulationId,
        status: sim.conveyorStatus,
        s_clock: sim.sClockCount,
        p_clock: sim.pClockCount,
        conveyor_speed: sim.conveyorSpeed,
        created_at: now,
        updated_at: now,
      };

      // Build the global KPI summary row (special sentinel machine_id = 'factory')
      const globalRow: Record<string, unknown> = {
        machine_id: TELEMETRY_FACTORY_ID,  // 'factory' sentinel
        simulation_id: simulationId,
        status: sim.conveyorStatus,
        s_clock: sim.sClockCount,
        p_clock: sim.pClockCount,
        conveyor_speed: sim.conveyorSpeed,
        oee: kpiMap.oee,            // Overall Equipment Effectiveness (%)
        ftq: kpiMap.ftq,            // First Time Quality (%)
        scrap_rate: kpiMap.scrap,          // Scrap Rate (%)
        energy_kwh: kpiMap.energy,         // Energy consumption (kWh)
        gas_m3: kpiMap.gas,            // Natural gas (m³)
        co2_kg: kpiMap.co2,            // CO₂ emissions (kg)
        created_at: now,
        updated_at: now,
      };

      // Single batch insert — time-series append (9 rows: 7 stations + conveyor + factory)
      await batchUpsertWithCircuitBreaker('telemetry', [...stationRows, conveyorRow, globalRow]);

    }, TELEMETRY_INTERVAL_MS);

    set({ telemetryInterval: interval });
    log.info('Telemetry sync started (interval: %dms)', TELEMETRY_INTERVAL_MS);
  },

  stopTelemetrySync: () => {
    const interval = get().telemetryInterval;
    if (interval) {
      clearInterval(interval);
      set({ telemetryInterval: null });
      // Reset circuit breaker state so the next session starts fresh
      consecutiveFailures = 0;
      circuitOpenUntil = 0;
      log.info('Telemetry sync stopped. Circuit breaker reset.');
    }
  },
}));
