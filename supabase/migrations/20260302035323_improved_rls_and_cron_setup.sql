-- ============================================================================
-- Migration: Improved RLS policies and session cleanup functions
--
-- This migration enhances the security posture and adds database-side
-- session lifecycle management:
--
--   1. Replace overly broad "Allow anon/authenticated full access" policies
--      on simulation_sessions and telemetry with per-operation granular
--      policies (SELECT, INSERT, UPDATE, DELETE separately).
--
--   2. Add helper RPC functions for session cleanup and lookup:
--      - cleanup_stale_sessions() — marks orphaned sessions as abandoned
--      - mark_abandoned_sessions() — lightweight version of above
--      - purge_old_sessions()     — fully deletes old sessions + child data
--      - get_machine_state()      — retrieves machine state by station/tick
--      - get_simulation_by_code() — looks up simulation UUID by session code
--
-- Date: 2026-03-02
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Improved RLS policies for simulation_sessions
--    Replace broad "Allow anon/authenticated full access" with per-op policies
-- ────────────────────────────────────────────────────────────────────────────

-- Drop old overly broad policies (if they exist from earlier migrations)
DROP POLICY IF EXISTS "Allow anon full access" ON simulation_sessions;
DROP POLICY IF EXISTS "Allow all for authenticated users" ON simulation_sessions;

-- Granular anon policies: SELECT, INSERT, UPDATE (no DELETE for anon)
CREATE POLICY "anon_select" ON simulation_sessions
    FOR SELECT TO anon USING (true);
CREATE POLICY "anon_insert" ON simulation_sessions
    FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_update" ON simulation_sessions
    FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- Granular authenticated policies: full CRUD
CREATE POLICY "authenticated_select" ON simulation_sessions
    FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_insert" ON simulation_sessions
    FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated_update" ON simulation_sessions
    FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_delete" ON simulation_sessions
    FOR DELETE TO authenticated USING (true);

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Improved RLS policies for telemetry
--    Replace broad "Allow anon full access" with per-op policies
-- ────────────────────────────────────────────────────────────────────────────

-- Drop old overly broad policies (if they exist)
DROP POLICY IF EXISTS "Allow anon full access" ON telemetry;
DROP POLICY IF EXISTS "Allow all for authenticated users" ON telemetry;

-- Granular anon policies: SELECT, INSERT, UPDATE (no DELETE for anon)
CREATE POLICY "anon_select" ON telemetry
    FOR SELECT TO anon USING (true);
CREATE POLICY "anon_insert" ON telemetry
    FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_update" ON telemetry
    FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- Granular authenticated policies: SELECT, INSERT, UPDATE (no DELETE)
CREATE POLICY "authenticated_select" ON telemetry
    FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_insert" ON telemetry
    FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated_update" ON telemetry
    FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- ────────────────────────────────────────────────────────────────────────────
-- 3. cleanup_stale_sessions()
--    Marks sessions as 'abandoned' if they haven't been updated in 5 minutes.
--    Called by pg_cron or manually to clean up orphaned sessions.
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION cleanup_stale_sessions()
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  updated_count INT;
BEGIN
  UPDATE public.simulation_sessions
  SET status = 'abandoned',
      updated_at = NOW(),
      completed_at = COALESCE(completed_at, NOW())
  WHERE status NOT IN ('completed', 'abandoned')
    AND updated_at < now() - interval '5 minutes';
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  IF updated_count > 0 THEN
    RAISE LOG 'cleanup_stale_sessions: marked % orphaned session(s)', updated_count;
  END IF;
END;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 4. mark_abandoned_sessions()
--    Lightweight version of cleanup_stale_sessions — marks running/paused
--    sessions as abandoned if inactive for 5 minutes.
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION mark_abandoned_sessions()
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  UPDATE public.simulation_sessions
  SET status = 'abandoned',
      updated_at = NOW(),
      completed_at = COALESCE(completed_at, NOW())
  WHERE status IN ('running', 'paused')
    AND updated_at < NOW() - INTERVAL '5 minutes';
END;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 5. purge_old_sessions()
--    Fully deletes old abandoned/completed sessions and ALL child data.
--    Deletes child tables explicitly before parent to avoid FK issues.
--    @param max_sessions  Maximum number of sessions to purge per call (default 3)
--    @param older_than    Minimum age of sessions to purge (default '24 hours')
--    @returns Number of sessions purged
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
  session_rec RECORD;
  purged_count INT := 0;
BEGIN
  FOR session_rec IN
    SELECT id FROM public.simulation_sessions
    WHERE status IN ('abandoned', 'completed')
      AND updated_at < NOW() - older_than
    ORDER BY updated_at ASC
    LIMIT max_sessions
  LOOP
    -- Delete child tables explicitly before parent
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
    -- Finally delete the session itself
    DELETE FROM public.simulation_sessions WHERE id = session_rec.id;
    purged_count := purged_count + 1;
  END LOOP;
  RETURN purged_count;
END;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 6. get_machine_state()
--    Retrieves the full machine state JSONB for a given station at a given tick.
--    Used by CWF agent tool calls.
--    @param p_simulation_id  The simulation UUID
--    @param p_station        Station name ('press', 'dryer', 'glaze', etc.)
--    @param p_sim_tick       The S-Clock tick to query
--    @returns JSONB of the machine state row, or NULL if not found
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_machine_state(
  p_simulation_id UUID,
  p_station VARCHAR,
  p_sim_tick BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    result JSONB;
BEGIN
    CASE p_station
        WHEN 'press' THEN
            SELECT to_jsonb(m.*) INTO result 
            FROM machine_press_states m 
            WHERE m.simulation_id = p_simulation_id AND m.sim_tick = p_sim_tick;
        WHEN 'dryer' THEN
            SELECT to_jsonb(m.*) INTO result 
            FROM machine_dryer_states m 
            WHERE m.simulation_id = p_simulation_id AND m.sim_tick = p_sim_tick;
        WHEN 'glaze' THEN
            SELECT to_jsonb(m.*) INTO result 
            FROM machine_glaze_states m 
            WHERE m.simulation_id = p_simulation_id AND m.sim_tick = p_sim_tick;
        WHEN 'printer' THEN
            SELECT to_jsonb(m.*) INTO result 
            FROM machine_printer_states m 
            WHERE m.simulation_id = p_simulation_id AND m.sim_tick = p_sim_tick;
        WHEN 'kiln' THEN
            SELECT to_jsonb(m.*) INTO result 
            FROM machine_kiln_states m 
            WHERE m.simulation_id = p_simulation_id AND m.sim_tick = p_sim_tick;
        WHEN 'sorting' THEN
            SELECT to_jsonb(m.*) INTO result 
            FROM machine_sorting_states m 
            WHERE m.simulation_id = p_simulation_id AND m.sim_tick = p_sim_tick;
        WHEN 'packaging' THEN
            SELECT to_jsonb(m.*) INTO result 
            FROM machine_packaging_states m 
            WHERE m.simulation_id = p_simulation_id AND m.sim_tick = p_sim_tick;
    END CASE;
    
    RETURN result;
END;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 7. get_simulation_by_code()
--    Looks up a simulation UUID by its 6-character session code.
--    Used by CWF agent for session identification.
--    @param p_session_code  The 6-char session code (e.g., 'A3F2B1')
--    @returns UUID of the simulation session, or NULL if not found
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_simulation_by_code(p_session_code VARCHAR)
RETURNS UUID
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    sim_id UUID;
BEGIN
    SELECT id INTO sim_id 
    FROM simulation_sessions 
    WHERE session_code = upper(p_session_code);
    
    RETURN sim_id;
END;
$$;

-- Grant execute permissions on new functions
GRANT EXECUTE ON FUNCTION cleanup_stale_sessions() TO service_role, anon;
GRANT EXECUTE ON FUNCTION mark_abandoned_sessions() TO service_role, anon;
GRANT EXECUTE ON FUNCTION purge_old_sessions(INTEGER, INTERVAL) TO service_role, anon;
GRANT EXECUTE ON FUNCTION get_machine_state(UUID, VARCHAR, BIGINT) TO service_role, anon, authenticated;
GRANT EXECUTE ON FUNCTION get_simulation_by_code(VARCHAR) TO service_role, anon, authenticated;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
