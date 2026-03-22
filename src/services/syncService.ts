/**
 * syncService.ts — Batch Sync Engine (Zustand → Supabase)
 *
 * Periodically collects unsynced records from `simulationDataStore`
 * and writes them to Supabase in batches. Runs on a configurable
 * interval (default: 2 seconds) while the simulation is active.
 *
 * Key design decisions:
 *  - Syncs session FIRST, then all children (prevents FK violations)
 *  - Guard against concurrent syncs via `isSyncing` flag
 *  - Gracefully handles missing Supabase client (no-op)
 *  - Strips local-only fields (`synced`, `is_active`, `scenario_code`)
 *  - Uses `upsert` everywhere to gracefully handle retries / conflicts
 *  - Logs sync count for debugging
 *
 * This service does NOT modify the MASTER simulationStore.
 *
 * Used by: SimulationRunner.tsx (start/stop lifecycle)
 */

import { supabase } from '../lib/supabaseClient';
import { useSimulationDataStore } from '../store/simulationDataStore';
import type { StationName } from '../store/types';
import { SYNC_INTERVAL_MS, ALARM_LOG_TABLE_NAME, MACHINE_TABLE_NAMES, CONVEYOR_STATES_TABLE, CONVEYOR_EVENTS_TABLE } from '../lib/params';
import { createLogger } from '../lib/logger';

/** Module-level logger for sync service operations. */
const log = createLogger('SyncService');

// =============================================================================
// HELPER: Strip local-only fields before DB insert
// =============================================================================

/**
 * Remove local-only fields and undefined values from records before sending
 * to Supabase.
 *
 * Strips:
 *  - `synced` (local tracking flag, not a DB column)
 *  - Any additional keys passed in `extraFields`
 *  - Keys whose value is `undefined` — CRITICAL: the Supabase JS client
 *    builds a `columns=` query parameter from every key in the first record
 *    of the array, including those with undefined values. PostgREST then
 *    validates that the request body contains all listed columns, and returns
 *    HTTP 400 if a listed column is missing from the body. Removing undefined
 *    keys ensures only columns with real values appear in `columns=`.
 *
 * Uses `T extends object` rather than `Record<string, any>` so that
 * concrete interface types (PressStateRecord, TileRecord, etc.) are
 * accepted without needing an explicit index signature.
 */
function stripFields<T extends object>(
  records: T[],
  extraFields: string[] = []
): Record<string, unknown>[] {
  const fieldsToRemove = new Set(['synced', 'syncVersion', ...extraFields]);
  return records.map((record) => {
    const clean: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(record)) {
      // Skip local-only fields and undefined values (undefined → omit from payload)
      if (!fieldsToRemove.has(key) && value !== undefined) {
        clean[key] = value;
      }
    }
    return clean;
  });
}

/**
 * DB integer columns that can drift to floats via the parameter drift system.
 * These MUST be rounded before upserting to Supabase, otherwise PostgreSQL
 * rejects the value with: "invalid input syntax for type integer".
 *
 * Covers all 5 integer columns across machine_*_states tables:
 *   machine_kiln_states.zone_count
 *   machine_packaging_states.stack_count
 *   machine_printer_states.resolution_dpi
 *   machine_printer_states.color_channels
 *   machine_sorting_states.grade_count
 */
const DB_INTEGER_FIELDS = new Set([
  'zone_count',
  'stack_count',
  'resolution_dpi',
  'color_channels',
  'grade_count',
]);

/** Round known integer fields to prevent DB type errors from drifted floats. */
function roundIntegerFields(
  records: Record<string, unknown>[]
): Record<string, unknown>[] {
  return records.map((record) => {
    const rounded = { ...record };
    for (const field of DB_INTEGER_FIELDS) {
      if (typeof rounded[field] === 'number') {
        rounded[field] = Math.round(rounded[field] as number);
      }
    }
    return rounded;
  });
}

/**
 * Remove duplicate records by `id`, keeping the LAST occurrence
 * (which represents the most recent state of the record).
 *
 * Safety-net: even after syncSlice deduplication, this ensures
 * no duplicate `id` values appear in any batch sent to Supabase.
 * PostgreSQL's INSERT ... ON CONFLICT rejects duplicate conflict-key
 * values within a single statement, causing HTTP 500.
 *
 * @param records - Array of record objects with an `id` field
 * @returns New array with unique `id` values, last-write-wins
 */
function deduplicateById(records: Record<string, unknown>[]): Record<string, unknown>[] {
  /** Map from id → record, each new entry overwrites the previous (last-wins). */
  const seen = new Map<string, Record<string, unknown>>();
  for (const record of records) {
    seen.set(record.id as string, record);
  }
  return [...seen.values()];
}

// =============================================================================
// SYNC SERVICE CLASS
// =============================================================================

class SyncService {
  private syncInterval: ReturnType<typeof setInterval> | null = null;
  private isSyncing = false;

  /**
   * Start the periodic sync loop.
   * Safe to call multiple times — subsequent calls are no-ops.
   */
  start(): void {
    if (this.syncInterval) return;

    this.syncInterval = setInterval(() => {
      this.sync();
    }, SYNC_INTERVAL_MS);

    log.info('Started (interval: %dms)', SYNC_INTERVAL_MS);
  }

  /**
   * Stop the periodic sync loop and perform a guaranteed final sync.
   *
   * CRITICAL: sync() has a guard `if (this.isSyncing) return;` which
   * silently skips the call if a periodic sync is mid-flight. Without
   * waiting for it to finish, drain-completed tiles would never get
   * their final status/grade flushed to Supabase. We poll with a
   * safety cap to wait for the in-progress sync to complete, then
   * do one final flush to capture all drain-completed tiles.
   *
   * @returns Promise that resolves when the final sync completes
   */
  async stop(): Promise<void> {
    /** Stop the periodic interval so no new syncs are scheduled. */
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }

    /**
     * Wait for any in-progress sync to finish before doing final flush.
     * The sync() method sets isSyncing=true at start and false at end.
     * Poll every 50ms with a safety cap of 5 seconds (100 iterations).
     */
    let waitAttempts = 0;
    const MAX_WAIT_ATTEMPTS = 100;
    while (this.isSyncing && waitAttempts < MAX_WAIT_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      waitAttempts++;
    }

    if (waitAttempts > 0) {
      log.info(`Waited ${waitAttempts * 50}ms for in-progress sync to finish`);
    }

    /** Now do one final sync — guaranteed to run since isSyncing is false. */
    await this.sync();
    log.info('Stopped (final sync complete)');
  }

  /**
   * Perform a single sync cycle: collect unsynced records and write to Supabase.
   * Syncs the session FIRST, then all child records in parallel.
   * Uses upsert everywhere to handle conflict/retry scenarios.
   *
   * Tracks per-table sync results and logs a structured summary.
   */
  async sync(): Promise<void> {
    // Skip if Supabase is not configured
    if (!supabase) return;

    // Guard against concurrent syncs
    if (this.isSyncing) return;
    this.isSyncing = true;

    /** Per-table sync result tracking for structured reporting. */
    const succeeded: string[] = [];
    const failed: string[] = [];

    try {
      const store = useSimulationDataStore.getState();
      const session = store.session;

      // ── Step 1: Upsert session FIRST (all others have FK to it) ──
      if (session) {
        const { error } = await supabase
          .from('simulation_sessions')
          .upsert({
            id: session.id,
            session_code: session.session_code,
            name: session.name,
            description: session.description,
            tick_duration_ms: session.tick_duration_ms,
            production_tick_ratio: session.production_tick_ratio,
            station_gap_production_ticks: session.station_gap_production_ticks,
            status: session.status,
            current_sim_tick: session.current_sim_tick,
            current_production_tick: session.current_production_tick,
            target_tiles_per_hour: session.target_tiles_per_hour,
            target_first_quality_pct: session.target_first_quality_pct,
            started_at: session.started_at,
            paused_at: session.paused_at,
            completed_at: session.completed_at,
            created_at: session.created_at,
            updated_at: session.updated_at,
          });

        if (error) {
          log.error('Session upsert failed:', error.message);
          failed.push('session');
          // Don't proceed with children if parent failed
          this.isSyncing = false;
          return;
        }
        succeeded.push('session');
      }

      // ── Step 2: Sync tiles + machine states (no FK deps between them) ──
      const unsynced = store.getUnsyncedData();
      const phase2: PromiseLike<void>[] = [];


      // Machine States — upsert on compound unique key (simulation_id, sim_tick).
      //
      // WHY NOT onConflict:'id'?
      //   Each tick generates a new UUID. If the 10s sync interval fires TWICE
      //   for the same session, the second cycle sends a DIFFERENT UUID for an
      //   already-inserted tick. Using onConflict:'id' would try to INSERT a new row
      //   which then conflicts with the compound unique constraint → 400 or 409.
      //
      // WHY ignoreDuplicates:true?
      //   We only need ONE state record per (session, tick). If a row for this
      //   tick already exists (e.g., from a previous sync cycle), we skip it.
      //   This makes the upsert idempotent: first write wins, retries are no-ops.
      //   We never need to UPDATE an already-written machine state — these are
      //   immutable snapshots of the machine at a specific tick.
      for (const [station, records] of Object.entries(unsynced.machineStates)) {
        if (records.length > 0) {
          const tableName = MACHINE_TABLE_NAMES[station as StationName];
          // Clean the records — strip 'synced' (local-only) AND 'station' (routing-only,
          // not a DB column). All machine state tables share the same base fields;
          // the station field only exists on the local AnyMachineStateRecord union.
          const cleanRecords = roundIntegerFields(stripFields(records, ['station']));

          phase2.push(
            supabase
              .from(tableName)
              .upsert(cleanRecords, { onConflict: 'simulation_id,sim_tick', ignoreDuplicates: true })
              .then(({ error }) => {
                if (error) {
                  log.warn(`${tableName} upsert failed:`, error.message);
                  failed.push(tableName);
                  return;
                }
                // Mark as synced regardless — if row already existed (skipped),
                // there's nothing more to do for this tick.
                store.markAsSynced('machineStates', records.map((r) => r.id));
                succeeded.push(tableName);
              })
          );
        }
      }

      // Tiles — upsert on PK (id).
      //
      // Tiles ARE re-sent across sync cycles because their status and grade
      // change during their lifecycle (in_production → sorted → packaged →
      // completed). We use ignoreDuplicates:false so the UPDATE path fires
      // when a tile that was already inserted has new status/grade values.
      //
      // CRITICAL: deduplicateById() is a safety-net — ensures no duplicate
      // `id` values appear in a single INSERT statement. PostgreSQL rejects
      // ON CONFLICT when the same conflict-key appears in multiple rows.
      if (unsynced.tiles.length > 0) {
        /**
         * Strip only local-only fields (synced). tile_number IS sent to
         * Supabase so the DB stores the app's per-session sequential number
         * rather than the global DB auto-increment sequence value.
         */
        const cleanTiles = deduplicateById(stripFields(unsynced.tiles));
        phase2.push(
          supabase
            .from('tiles')
            .upsert(cleanTiles, { onConflict: 'id', ignoreDuplicates: false })
            .then(({ error }) => {
              if (error) {
                log.warn('tiles upsert failed:', error.message);
                failed.push('tiles');
                return;
              }
              store.markAsSynced('tiles', unsynced.tiles.map((t) => t.id), unsynced.tileSyncVersions);
              succeeded.push('tiles');
            })
        );
      }

      // Parameter Changes
      if (unsynced.parameterChanges.length > 0) {
        const cleanChanges = stripFields(unsynced.parameterChanges);
        phase2.push(
          supabase
            .from('parameter_change_events')
            .upsert(cleanChanges)
            .then(({ error }) => {
              if (error) {
                log.warn('param changes upsert failed:', error.message);
                failed.push('parameter_changes');
                return;
              }
              store.markAsSynced('parameterChanges', unsynced.parameterChanges.map((c) => c.id));
              succeeded.push('parameter_changes');
            })
        );
      }

      // Scenario Activations (is_active & scenario_code are now DB columns)
      if (unsynced.scenarios.length > 0) {
        const cleanScenarios = stripFields(unsynced.scenarios);
        phase2.push(
          supabase
            .from('scenario_activations')
            .upsert(cleanScenarios)
            .then(({ error }) => {
              if (error) {
                log.warn('scenarios upsert failed:', error.message);
                failed.push('scenarios');
                return;
              }
              store.markAsSynced('scenarios', unsynced.scenarios.map((s) => s.id));
              succeeded.push('scenarios');
            })
        );
      }

      // Alarm Logs (upsert with conflict on simulation_id + sim_tick + alarm_type)
      if (unsynced.alarmLogs.length > 0) {
        const cleanAlarms = stripFields(unsynced.alarmLogs)
          .filter((r) => r.simulation_id && r.simulation_id !== ''); // Skip records with no session
        phase2.push(
          supabase
            .from(ALARM_LOG_TABLE_NAME)
            .upsert(cleanAlarms, { onConflict: 'simulation_id,sim_tick,alarm_type' })
            .then(({ error }) => {
              if (error) {
                log.warn('alarm logs upsert failed:', error.message);
                failed.push('alarm_logs');
                return;
              }
              store.markAsSynced('alarmLogs', unsynced.alarmLogs.map((a) => a.id));
              succeeded.push('alarm_logs');
            })
        );
      }

      // Production Metrics
      if (unsynced.metrics.length > 0) {
        const cleanMetrics = stripFields(unsynced.metrics);
        phase2.push(
          supabase
            .from('production_metrics')
            .upsert(cleanMetrics)
            .then(({ error }) => {
              if (error) {
                log.warn('metrics upsert failed:', error.message);
                failed.push('metrics');
                return;
              }
              store.markAsSynced('metrics', unsynced.metrics.map((m) => m.id));
              succeeded.push('metrics');
            })
        );
      }

      // Conveyor States — per-tick snapshots upserted on compound unique key
      // (simulation_id, sim_tick). ignoreDuplicates:true because conveyor state
      // snapshots are immutable once written, same as machine states.
      if (unsynced.conveyorStates.length > 0) {
        const cleanConveyorStates = stripFields(unsynced.conveyorStates);
        phase2.push(
          supabase
            .from(CONVEYOR_STATES_TABLE)
            .upsert(cleanConveyorStates, { onConflict: 'simulation_id,sim_tick', ignoreDuplicates: true })
            .then(({ error }) => {
              if (error) {
                log.warn('conveyor_states upsert failed:', error.message);
                failed.push('conveyor_states');
                return;
              }
              store.markAsSynced('conveyorStates', unsynced.conveyorStates.map((r) => r.id));
              succeeded.push('conveyor_states');
            })
        );
      }

      // Conveyor Events — discrete events upserted on id (each event is unique).
      // ignoreDuplicates:true — events are immutable point-in-time records.
      if (unsynced.conveyorEvents.length > 0) {
        const cleanConveyorEvents = stripFields(unsynced.conveyorEvents);
        phase2.push(
          supabase
            .from(CONVEYOR_EVENTS_TABLE)
            .upsert(cleanConveyorEvents, { onConflict: 'id', ignoreDuplicates: true })
            .then(({ error }) => {
              if (error) {
                log.warn('conveyor_events upsert failed:', error.message);
                failed.push('conveyor_events');
                return;
              }
              store.markAsSynced('conveyorEvents', unsynced.conveyorEvents.map((r) => r.id));
              succeeded.push('conveyor_events');
            })
        );
      }

      // Wait for Phase 2 (tiles + machine states must be committed first)
      await Promise.all(phase2);

      // ── Step 3: Sync snapshots AFTER tiles are committed (FK dependency) ──
      // deduplicateById() safety-net prevents duplicate snapshot IDs in batch.
      if (unsynced.snapshots.length > 0) {
        const cleanSnapshots = deduplicateById(stripFields(unsynced.snapshots));
        const { error } = await supabase
          .from('tile_station_snapshots')
          .upsert(cleanSnapshots);

        if (error) {
          log.warn('snapshots upsert failed:', error.message);
          failed.push('snapshots');
        } else {
          store.markAsSynced('snapshots', unsynced.snapshots.map((s) => s.id));
          succeeded.push('snapshots');
        }
      }

      // ── Structured sync summary ──────────────────────────────────
      const totalRecords =
        Object.values(unsynced.machineStates).reduce(
          (sum, arr) => sum + arr.length,
          0
        ) +
        unsynced.tiles.length +
        unsynced.snapshots.length +
        unsynced.parameterChanges.length +
        unsynced.scenarios.length +
        unsynced.metrics.length +
        unsynced.alarmLogs.length +
        unsynced.conveyorStates.length +
        unsynced.conveyorEvents.length;

      if (totalRecords > 0) {
        if (failed.length > 0) {
          log.warn(
            'Synced %d records (%d tables OK, %d failed: %s)',
            totalRecords,
            succeeded.length,
            failed.length,
            failed.join(', '),
          );
        } else {
          log.info('Synced %d records (%d tables OK)', totalRecords, succeeded.length);
        }
      }
    } catch (error) {
      log.error('Sync error:', error);
    } finally {
      this.isSyncing = false;
    }
  }
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

/** Global sync service instance. Start/stop from SimulationRunner. */
export const syncService = new SyncService();
