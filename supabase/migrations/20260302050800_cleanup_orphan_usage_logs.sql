-- ============================================================================
-- Migration: Cleanup orphan usage_log entries
--
-- Problem:
--   The browser's beforeunload/visibilitychange events are unreliable.
--   When a user closes the tab, refreshes, or the browser crashes, the
--   logDisconnect() call in usageTracker.ts never fires. This leaves
--   usage_log rows with disconnected_at = NULL, duration_seconds = NULL
--   permanently — creating orphan records that skew usage analytics.
--
-- Solution:
--   1. cleanup_orphan_usage_logs() — Finds usage_log entries older than
--      a configurable threshold (default 2 hours) with no disconnect
--      timestamp, and fills in estimated values.
--
--   2. Add usage_log cleanup to purge_old_sessions() so that when old
--      simulation sessions are purged, their usage_log entries are too.
--
--   3. Schedule cleanup_orphan_usage_logs via pg_cron every 30 minutes.
--
-- Date: 2026-03-02
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. cleanup_orphan_usage_logs()
--    Finds usage_log rows where:
--      - disconnected_at IS NULL (browser never called logDisconnect)
--      - connected_at is older than the stale_threshold (default 2 hours)
--    For each orphan, sets:
--      - disconnected_at = connected_at + stale_threshold (estimated)
--      - duration_seconds = EXTRACT(EPOCH FROM stale_threshold)
--    Returns the number of orphan records that were cleaned up.
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION cleanup_orphan_usage_logs(
    stale_threshold INTERVAL DEFAULT '2 hours'
)
RETURNS INTEGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    -- Number of orphan records updated
    updated_count INTEGER;
BEGIN
    -- Update orphan usage_log entries that have no disconnect timestamp
    -- and are older than the stale_threshold
    UPDATE public.usage_log
    SET
        -- Estimate disconnect time as connected_at + threshold
        disconnected_at = connected_at + stale_threshold,
        -- Duration in seconds = threshold converted to seconds
        duration_seconds = EXTRACT(EPOCH FROM stale_threshold)::INTEGER
    WHERE disconnected_at IS NULL
      AND connected_at < NOW() - stale_threshold;

    -- Capture how many rows were affected
    GET DIAGNOSTICS updated_count = ROW_COUNT;

    -- Log cleanup activity for monitoring
    IF updated_count > 0 THEN
        RAISE LOG 'cleanup_orphan_usage_logs: patched % orphan record(s) older than %',
            updated_count, stale_threshold;
    END IF;

    RETURN updated_count;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION cleanup_orphan_usage_logs(INTERVAL) TO service_role, anon;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Update purge_old_sessions() to also clean up usage_log entries
--    belonging to the session being purged. This ensures that when old
--    simulation data is deleted, the usage analytics entries go with it.
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION purge_old_sessions(
    max_sessions INTEGER DEFAULT 3,
    older_than INTERVAL DEFAULT '24 hours'
)
RETURNS INTEGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    -- Loop variable for each session to be purged
    session_rec RECORD;
    -- Counter of successfully purged sessions
    purged_count INT := 0;
BEGIN
    -- Find old abandoned/completed sessions to purge
    FOR session_rec IN
        SELECT id FROM public.simulation_sessions
        WHERE status IN ('abandoned', 'completed')
          AND updated_at < NOW() - older_than
        ORDER BY updated_at ASC
        LIMIT max_sessions
    LOOP
        -- Delete child tables explicitly before parent to avoid FK issues
        DELETE FROM public.tile_station_snapshots WHERE simulation_id = session_rec.id;
        DELETE FROM public.oee_snapshots WHERE simulation_id = session_rec.id;
        DELETE FROM public.telemetry WHERE simulation_id = session_rec.id;
        DELETE FROM public.tiles WHERE simulation_id = session_rec.id;
        DELETE FROM public.conveyor_events WHERE simulation_id = session_rec.id;
        DELETE FROM public.conveyor_states WHERE simulation_id = session_rec.id;
        DELETE FROM public.production_metrics WHERE simulation_id = session_rec.id;
        DELETE FROM public.machine_press_states WHERE simulation_id = session_rec.id;
        DELETE FROM public.machine_dryer_states WHERE simulation_id = session_rec.id;
        DELETE FROM public.machine_glaze_states WHERE simulation_id = session_rec.id;
        DELETE FROM public.machine_printer_states WHERE simulation_id = session_rec.id;
        DELETE FROM public.machine_kiln_states WHERE simulation_id = session_rec.id;
        DELETE FROM public.machine_sorting_states WHERE simulation_id = session_rec.id;
        DELETE FROM public.machine_packaging_states WHERE simulation_id = session_rec.id;
        DELETE FROM public.simulation_alarm_logs WHERE simulation_id = session_rec.id;
        DELETE FROM public.parameter_change_events WHERE simulation_id = session_rec.id;
        DELETE FROM public.scenario_activations WHERE simulation_id = session_rec.id;
        -- ⬇️ NEW: Also clean up usage_log entries for this session
        DELETE FROM public.usage_log WHERE session_id = session_rec.id;
        -- Finally delete the session itself
        DELETE FROM public.simulation_sessions WHERE id = session_rec.id;
        purged_count := purged_count + 1;
    END LOOP;
    RETURN purged_count;
END;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. Schedule cleanup_orphan_usage_logs via pg_cron
--    Runs every 30 minutes to patch orphaned usage_log entries.
-- ────────────────────────────────────────────────────────────────────────────

SELECT cron.schedule(
    'cleanup_orphan_usage',                              -- Job name
    '*/30 * * * *',                                      -- Every 30 minutes
    $$SELECT public.cleanup_orphan_usage_logs('2 hours'::INTERVAL)$$  -- Command
);

-- ────────────────────────────────────────────────────────────────────────────
-- 4. Fix purge_old_sessions cron schedule
--    Previously set to */5 (every 5 minutes) which is far too aggressive.
--    Changed to 0 */12 (every 12 hours) — at midnight and noon UTC.
-- ────────────────────────────────────────────────────────────────────────────

SELECT cron.alter_job(
    (SELECT jobid FROM cron.job WHERE jobname = 'purge_old'),
    schedule := '0 */12 * * *'
);

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
