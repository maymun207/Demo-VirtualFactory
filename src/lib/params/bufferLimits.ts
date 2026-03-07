/**
 * bufferLimits.ts — Ring-Buffer Cap Constants
 *
 * Defines maximum sizes for all in-memory arrays that grow during
 * a simulation session. Each array is capped with oldest-first eviction
 * to prevent unbounded memory growth in long-running sessions.
 *
 * Cap values are tuned for a typical 8-hour session at normal tick rates.
 *
 * Used by: metricsSlice, scenarioSlice, simulationDataStore
 */

/** Maximum number of alarm log records to keep in memory. ~8h at 1 alarm/min. */
export const MAX_ALARM_LOGS = 500;

/** Maximum number of completed metrics period records. ~3h of 1-min periods. */
export const MAX_METRICS_HISTORY = 200;

/** Maximum number of scenario activation/deactivation records. */
export const MAX_SCENARIO_HISTORY = 100;

/** Maximum number of parameter change records. ~16min at 60 drift events/min. */
export const MAX_PARAMETER_CHANGES = 1000;

/**
 * Maximum number of completed/scrapped synced tiles to keep in the tiles Map.
 * Older synced tiles are pruned to prevent Map growth over long sessions.
 */
export const MAX_COMPLETED_TILES = 500;

/**
 * Maximum number of machine state records to keep in the flat machineStateRecords
 * array. At 7 stations × ~2 ticks/sec the queue fills at ~14 records/sec.
 * 20,000 records ≈ ~24 minutes of buffering between sync flushes.
 * After eviction the oldest (already-synced) records are removed first.
 */
export const MAX_MACHINE_STATE_RECORDS = 20_000;

/**
 * Maximum number of conveyor state records to keep in the flat conveyorStateRecords
 * array. At ~2 ticks/sec the queue fills at ~2 records/sec.
 * 20,000 records ≈ ~2.8 hours of buffering — matches the machine state cap.
 */
export const MAX_CONVEYOR_STATE_RECORDS = 20_000;

/**
 * Maximum number of conveyor event records to keep in memory.
 * Events are infrequent (jams, speed changes) so a smaller cap is sufficient.
 * 1,000 events ≈ hundreds of jam cycles.
 */
export const MAX_CONVEYOR_EVENT_RECORDS = 1_000;
