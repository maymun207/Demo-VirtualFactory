-- ============================================================================
-- Migration: Add 4 missing tables + cleanup function
--
-- These tables were created manually in the Supabase SQL Editor during
-- development but never captured in version-controlled migration files.
-- This migration ensures full reproducibility when deploying to a fresh
-- Supabase project.
--
-- Tables added:
--   1. simulation_alarm_logs — Per-session alarm events (jam, OEE, quality)
--   2. conveyor_states       — Per-tick conveyor belt operational snapshots
--   3. conveyor_events       — Discrete conveyor state transition events
--   4. usage_log             — Simulator browser/geo usage analytics
--
-- Also adds:
--   5. cleanup_old_simulation_data() — Scheduled cleanup function
--      (previously referenced by 20260301_fix_security_advisories.sql
--       ALTER FUNCTION but never created in migrations)
--
-- Date: 2026-03-02
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. simulation_alarm_logs
--    Stores per-simulation alarm events (conveyor jams, OEE alerts, etc.).
--    Zustand type: AlarmLogRecord (src/store/types.ts)
--    Written by: syncService.ts → batch upsert via ALARM_LOG_TABLE_NAME
--    Conflict key: (simulation_id, sim_tick, alarm_type) for dedup on retry
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS simulation_alarm_logs (
    -- Primary key: auto-generated UUID
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- FK to simulation_sessions — scopes alarm to a specific run
    simulation_id UUID NOT NULL REFERENCES simulation_sessions(id) ON DELETE CASCADE,
    -- S-Clock tick at which this alarm was generated
    sim_tick BIGINT NOT NULL,
    -- Alarm classification (e.g. 'jam_start', 'oee_alert', 'machine_error')
    alarm_type VARCHAR(50) NOT NULL,
    -- Severity level: 'critical', 'warning', or 'info'
    severity VARCHAR(20) NOT NULL,
    -- Optional station that triggered the alarm (e.g. 'press', 'kiln')
    station_id VARCHAR(50),
    -- Optional human-readable description of the alarm condition
    message TEXT,
    -- ISO timestamp — real-world time when the alarm was raised
    timestamp TIMESTAMPTZ NOT NULL,
    -- Row creation timestamp
    created_at TIMESTAMPTZ DEFAULT now(),
    -- Compound unique constraint used by syncService upsert (onConflict)
    UNIQUE(simulation_id, sim_tick, alarm_type)
);

-- Index for fast lookup by simulation + tick range
CREATE INDEX IF NOT EXISTS idx_alarm_logs_sim_tick
    ON simulation_alarm_logs(simulation_id, sim_tick);

-- Index for filtering by alarm type across simulations
CREATE INDEX IF NOT EXISTS idx_alarm_logs_type
    ON simulation_alarm_logs(alarm_type);

-- Enable Row Level Security
ALTER TABLE simulation_alarm_logs ENABLE ROW LEVEL SECURITY;

-- RLS policies: allow both authenticated and anon full access
-- (matches pattern used by all other simulation tables)
CREATE POLICY "Allow all for authenticated users" ON simulation_alarm_logs
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon full access" ON simulation_alarm_logs
    FOR ALL TO anon USING (true) WITH CHECK (true);


-- ────────────────────────────────────────────────────────────────────────────
-- 2. conveyor_states
--    Per-tick snapshot of conveyor belt operational state.
--    Zustand type: ConveyorStateRecord (src/store/types.ts)
--    Written by: syncService.ts → batch upsert via CONVEYOR_STATES_TABLE
--    Conflict key: (simulation_id, sim_tick) — one snapshot per tick
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS conveyor_states (
    -- Primary key: auto-generated UUID
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- FK to simulation_sessions — scopes record to a specific run
    simulation_id UUID NOT NULL REFERENCES simulation_sessions(id) ON DELETE CASCADE,
    -- S-Clock tick at which this snapshot was captured
    sim_tick BIGINT NOT NULL,
    -- P-Clock tick (production tick counter at snapshot time)
    production_tick BIGINT NOT NULL,
    -- Belt speed in the 0.0–2.0 range matching CONVEYOR_SPEED_RANGE
    conveyor_speed NUMERIC NOT NULL,
    -- Operational status at this tick: 'running', 'stopped', 'jammed', 'jam_scrapping'
    conveyor_status VARCHAR(20) NOT NULL,
    -- Cumulative jam / fault count up to and including this tick
    fault_count INTEGER NOT NULL DEFAULT 0,
    -- Total tiles alive on the belt at this tick
    active_tiles_on_belt INTEGER NOT NULL DEFAULT 0,
    -- ISO timestamp — real-world time when this record was created
    created_at TIMESTAMPTZ DEFAULT now(),
    -- Compound unique constraint: one state snapshot per simulation per tick
    UNIQUE(simulation_id, sim_tick)
);

-- Index for fast time-range queries within a simulation
CREATE INDEX IF NOT EXISTS idx_conveyor_states_sim_tick
    ON conveyor_states(simulation_id, sim_tick);

-- Enable Row Level Security
ALTER TABLE conveyor_states ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Allow all for authenticated users" ON conveyor_states
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon full access" ON conveyor_states
    FOR ALL TO anon USING (true) WITH CHECK (true);


-- ────────────────────────────────────────────────────────────────────────────
-- 3. conveyor_events
--    Discrete conveyor state transition events (jams, speed changes).
--    Zustand type: ConveyorEventRecord (src/store/types.ts)
--    Written by: syncService.ts → batch upsert via CONVEYOR_EVENTS_TABLE
--    Conflict key: (id) — each event is unique, ignoreDuplicates:true
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS conveyor_events (
    -- Primary key: auto-generated UUID
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- FK to simulation_sessions — scopes record to a specific run
    simulation_id UUID NOT NULL REFERENCES simulation_sessions(id) ON DELETE CASCADE,
    -- S-Clock tick at which the event occurred
    sim_tick BIGINT NOT NULL,
    -- P-Clock tick at event time
    production_tick BIGINT NOT NULL,
    -- Type of event: 'jam_start', 'jam_cleared', 'speed_change', 'status_change'
    event_type VARCHAR(50) NOT NULL,
    -- Previous value (speed as string, or previous status). Null for first-time events.
    old_value TEXT,
    -- New value after event (speed as string, or new status)
    new_value TEXT NOT NULL,
    -- ISO timestamp — real-world time when this record was created
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast time-range event queries within a simulation
CREATE INDEX IF NOT EXISTS idx_conveyor_events_sim_tick
    ON conveyor_events(simulation_id, sim_tick);

-- Index for filtering by event type
CREATE INDEX IF NOT EXISTS idx_conveyor_events_type
    ON conveyor_events(event_type);

-- Enable Row Level Security
ALTER TABLE conveyor_events ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Allow all for authenticated users" ON conveyor_events
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon full access" ON conveyor_events
    FOR ALL TO anon USING (true) WITH CHECK (true);


-- ────────────────────────────────────────────────────────────────────────────
-- 4. usage_log
--    Permanent audit log of simulator usage (browser, geo, session duration).
--    No Zustand type — used directly by usageTracker.ts.
--    Written by: usageTracker.ts → .insert() on connect, .update() on disconnect
--    Never deleted — historical analytics record.
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS usage_log (
    -- Primary key: auto-generated UUID
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Optional FK to simulation_sessions (may be null if session not yet created)
    session_id UUID REFERENCES simulation_sessions(id) ON DELETE SET NULL,
    -- Timestamp when the simulator tab/window connected
    connected_at TIMESTAMPTZ NOT NULL,
    -- Timestamp when the simulator tab/window disconnected (set on exit)
    disconnected_at TIMESTAMPTZ,
    -- Duration of the session in seconds (computed on disconnect)
    duration_seconds INTEGER,
    -- Full navigator.userAgent string
    user_agent TEXT,
    -- Parsed browser name + version (e.g. 'Chrome 120')
    browser_name VARCHAR(100),
    -- Parsed OS name (e.g. 'macOS 14.3')
    os_name VARCHAR(100),
    -- Screen resolution as 'WIDTHxHEIGHT' (e.g. '1920x1080')
    screen_resolution VARCHAR(20),
    -- Browser language preference (e.g. 'en-US')
    language VARCHAR(10),
    -- Public IP address from GeoIP API (may be null if API unavailable)
    ip_address VARCHAR(45),
    -- Country name from GeoIP API
    country VARCHAR(100),
    -- City name from GeoIP API
    city VARCHAR(100),
    -- Row creation timestamp
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for querying by session
CREATE INDEX IF NOT EXISTS idx_usage_log_session
    ON usage_log(session_id);

-- Index for time-range usage queries
CREATE INDEX IF NOT EXISTS idx_usage_log_connected
    ON usage_log(connected_at);

-- Enable Row Level Security
ALTER TABLE usage_log ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Allow all for authenticated users" ON usage_log
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon full access" ON usage_log
    FOR ALL TO anon USING (true) WITH CHECK (true);


-- ────────────────────────────────────────────────────────────────────────────
-- 5. cleanup_old_simulation_data function
--    Removes simulation data older than the specified interval.
--    Called by pg_cron scheduled job (e.g. every 24 hours).
--    Previously referenced by 20260301_fix_security_advisories.sql ALTER
--    but never created in any migration.
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION cleanup_old_simulation_data(retention_interval INTERVAL)
RETURNS void
LANGUAGE plpgsql
-- search_path pinned to prevent injection (matches 20260301 ALTER)
SET search_path = public
AS $$
BEGIN
    -- Delete simulation sessions older than the retention interval.
    -- CASCADE on FK constraints automatically removes all child records:
    --   machine_*_states, tiles, tile_station_snapshots,
    --   parameter_change_events, scenario_activations, production_metrics,
    --   ai_analysis_results, simulation_alarm_logs, conveyor_states,
    --   conveyor_events, oee_snapshots
    DELETE FROM simulation_sessions
    WHERE created_at < (now() - retention_interval)
      AND status IN ('completed', 'abandoned', 'aborted');

    -- Log how many sessions were cleaned up
    RAISE NOTICE 'cleanup_old_simulation_data: removed sessions older than %', retention_interval;
END;
$$;

-- Grant execute to service_role (for pg_cron calls) and anon (for manual triggers)
GRANT EXECUTE ON FUNCTION cleanup_old_simulation_data(INTERVAL) TO service_role;
GRANT EXECUTE ON FUNCTION cleanup_old_simulation_data(INTERVAL) TO anon;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
