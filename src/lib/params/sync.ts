/**
 * ╔═══════════════════════════════════════════════════════════════════╗
 * ║  SYNC — Supabase sync interval, table name mappings, and        ║
 * ║  telemetry retry/backoff configuration.                          ║
 * ╚═══════════════════════════════════════════════════════════════════╝
 */

// ═══════════════════════════════════════════════════════════════════
// SYNC SERVICE — Batch sync engine interval and table names
// ═══════════════════════════════════════════════════════════════════

/** Interval (ms) between Supabase batch sync cycles (syncService) */
export const SYNC_INTERVAL_MS = 10000;

/** Maps StationName to the corresponding Supabase table name for machine states. */
export const MACHINE_TABLE_NAMES: Record<string, string> = {
  press: 'machine_press_states',
  dryer: 'machine_dryer_states',
  glaze: 'machine_glaze_states',
  printer: 'machine_printer_states',
  kiln: 'machine_kiln_states',
  sorting: 'machine_sorting_states',
  packaging: 'machine_packaging_states',
} as const;

/**
 * Supabase table name for per-tick conveyor state snapshots.
 * One row per S-Clock tick per simulation session.
 */
export const CONVEYOR_STATES_TABLE = 'conveyor_states';

/**
 * Supabase table name for discrete conveyor events (jams, speed changes).
 * One row per state transition per simulation session.
 */
export const CONVEYOR_EVENTS_TABLE = 'conveyor_events';

// ═══════════════════════════════════════════════════════════════════
// OEE SNAPSHOTS — Periodic hierarchical OEE sync to Supabase
// ═══════════════════════════════════════════════════════════════════

/**
 * Supabase table name for periodic OEE snapshots.
 * Each row captures the full machine → line → factory OEE hierarchy,
 * station tile counts (A-J variables), and cumulative energy data.
 * Used by the CWF agent for intelligent OEE trend analysis.
 */
export const OEE_SNAPSHOT_TABLE = 'oee_snapshots';

/**
 * Interval (ms) between OEE snapshot inserts to Supabase.
 * Set to match the batch sync interval (10s) so OEE data arrives
 * at the same cadence as machine states and tiles.
 */
export const OEE_SNAPSHOT_INTERVAL_MS = 10000;

// ═══════════════════════════════════════════════════════════════════
// TELEMETRY — Sync interval and retry behaviour
// ═══════════════════════════════════════════════════════════════════

/** Interval (ms) between telemetry upsert cycles */
export const TELEMETRY_INTERVAL_MS = 5000;
/** Machine ID used for global/factory-level KPI telemetry records */
export const TELEMETRY_FACTORY_ID = 'factory';

/** Maximum retry attempts before giving up on a single upsert */
export const TELEMETRY_MAX_RETRIES = 3;
/**
 * Base delay (ms) for exponential backoff on telemetry retries.
 * Actual delays: 1000ms, 2000ms, 4000ms (2^attempt × base)
 */
export const TELEMETRY_BASE_RETRY_DELAY_MS = 1000;

/**
 * Number of consecutive upsert failures that will OPEN the circuit breaker.
 * When this threshold is reached the telemetry sync pauses completely for
 * TELEMETRY_CIRCUIT_BREAKER_COOLDOWN_MS before trying again.
 * This prevents retry storms during Supabase outages.
 */
export const TELEMETRY_CIRCUIT_BREAKER_FAILURES = 5;

/**
 * Duration (ms) that the circuit breaker stays OPEN after being tripped.
 * During this window ALL telemetry upserts are skipped entirely.
 * Set to 5 minutes — enough time for Supabase to recover from a restart.
 */
export const TELEMETRY_CIRCUIT_BREAKER_COOLDOWN_MS = 300_000;

// ═══════════════════════════════════════════════════════════════════
// SESSION HEARTBEAT — Keeps active sessions alive for cleanup detection
// ═══════════════════════════════════════════════════════════════════

/**
 * Interval (ms) between session heartbeat updates.
 * Each heartbeat refreshes the session's `updated_at` timestamp
 * in Supabase so the server-side cleanup job knows it's alive.
 */
export const SESSION_HEARTBEAT_INTERVAL_MS = 30_000;

/**
 * Duration (ms) after which an inactive session is considered stale.
 * Must match the server-side pg_cron `cleanup_stale_sessions()` threshold.
 */
export const SESSION_STALE_TIMEOUT_MS = 180_000;

// ═══════════════════════════════════════════════════════════════════
// USAGE ANALYTICS — IP geolocation for usage_log
// ═══════════════════════════════════════════════════════════════════

/**
 * URL of the free IP geolocation API used to enrich usage_log entries.
 * Returns JSON with `ip`, `country_name`, `city` fields.
 * Fallback: if unavailable, usage log is still recorded without geo data.
 */
export const GEOIP_API_URL = 'https://ipapi.co/json/';

/**
 * Timeout (ms) for the IP geolocation API request.
 * If the API does not respond within this time, geo data is skipped.
 */
export const GEOIP_TIMEOUT_MS = 5_000;

// ═══════════════════════════════════════════════════════════════════
// SIMULATION HISTORY — localStorage key and entry limit
// ═══════════════════════════════════════════════════════════════════

/**
 * localStorage key for persisting local simulation history.
 * Stores an array of SimulationHistoryEntry objects (UUID + code + timestamp + counter).
 * Used by CWF to access data from previous simulations.
 */
export const SIMULATION_HISTORY_STORAGE_KEY = 'vf_simulation_history';

/**
 * Maximum number of simulation history entries to retain in localStorage.
 * Oldest entries are dropped when this limit is exceeded.
 * Prevents unbounded localStorage growth from many simulation runs.
 */
export const MAX_SIMULATION_HISTORY = 50;

/**
 * Maximum age (in days) to retain simulation history entries.
 * Entries older than this are automatically pruned to ensure the 
 * data still exists in Supabase (which is cleared every 24 hours).
 */
export const MAX_HISTORY_AGE_DAYS = 1;
