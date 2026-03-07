-- ============================================================================
-- Migration: Fix Supabase security advisories
--
-- Addresses 5 linter findings:
--   2 × ERROR — SECURITY DEFINER views (defective_tiles_analysis, tile_journey)
--   3 × WARN  — Mutable search_path functions
--
-- 1. Recreate defective_tiles_analysis and tile_journey views with
--    SECURITY INVOKER instead of SECURITY DEFINER.
--    This ensures RLS policies of the QUERYING user apply, not the creator.
--
-- 2. Set explicit search_path on execute_readonly_query, get_simulation_stats,
--    and cleanup_old_simulation_data to prevent search_path injection attacks.
-- ============================================================================

-- ─── 1a. Recreate defective_tiles_analysis as SECURITY INVOKER ────────────

-- Drop and recreate with security_invoker = true so RLS of querying user applies
DROP VIEW IF EXISTS public.defective_tiles_analysis;

CREATE VIEW public.defective_tiles_analysis
WITH (security_invoker = true)
AS
SELECT t.id AS tile_id,
    t.tile_number,
    t.simulation_id,
    ss.session_code,
    t.final_grade,
    -- Aggregate all distinct defect types across all stations for this tile
    ARRAY( SELECT DISTINCT unnest(tss.defect_types) AS unnest
           FROM tile_station_snapshots tss
          WHERE tss.tile_id = t.id AND tss.defect_detected = true) AS all_defects,
    -- Identify the station where the tile was scrapped (if any)
    ( SELECT tile_station_snapshots.station
           FROM tile_station_snapshots
          WHERE tile_station_snapshots.tile_id = t.id AND tile_station_snapshots.scrapped_here = true
         LIMIT 1) AS scrapped_at_station,
    -- Build a JSON object with machine parameters at each station
    jsonb_build_object(
        'press',    (SELECT tile_station_snapshots.parameters_snapshot FROM tile_station_snapshots WHERE tile_station_snapshots.tile_id = t.id AND tile_station_snapshots.station::text = 'press'),
        'dryer',    (SELECT tile_station_snapshots.parameters_snapshot FROM tile_station_snapshots WHERE tile_station_snapshots.tile_id = t.id AND tile_station_snapshots.station::text = 'dryer'),
        'glaze',    (SELECT tile_station_snapshots.parameters_snapshot FROM tile_station_snapshots WHERE tile_station_snapshots.tile_id = t.id AND tile_station_snapshots.station::text = 'glaze'),
        'printer',  (SELECT tile_station_snapshots.parameters_snapshot FROM tile_station_snapshots WHERE tile_station_snapshots.tile_id = t.id AND tile_station_snapshots.station::text = 'printer'),
        'kiln',     (SELECT tile_station_snapshots.parameters_snapshot FROM tile_station_snapshots WHERE tile_station_snapshots.tile_id = t.id AND tile_station_snapshots.station::text = 'kiln'),
        'sorting',  (SELECT tile_station_snapshots.parameters_snapshot FROM tile_station_snapshots WHERE tile_station_snapshots.tile_id = t.id AND tile_station_snapshots.station::text = 'sorting'),
        'packaging',(SELECT tile_station_snapshots.parameters_snapshot FROM tile_station_snapshots WHERE tile_station_snapshots.tile_id = t.id AND tile_station_snapshots.station::text = 'packaging')
    ) AS all_parameters,
    -- Gather parameter change events that occurred during this tile's production (±20 ticks)
    ( SELECT jsonb_agg(jsonb_build_object(
        'tick', pce.sim_tick, 'station', pce.station, 'parameter', pce.parameter_name,
        'old_value', pce.old_value, 'new_value', pce.new_value, 'change_type', pce.change_type))
       FROM parameter_change_events pce
      WHERE pce.simulation_id = t.simulation_id
        AND pce.sim_tick >= (t.created_at_sim_tick - 20)
        AND pce.sim_tick <= t.completed_at_sim_tick) AS parameter_changes_during_production
FROM tiles t
JOIN simulation_sessions ss ON t.simulation_id = ss.id
-- Only include tiles that are defective or have detected defects
WHERE t.final_grade = ANY (ARRAY['scrap'::quality_grade, 'second_quality'::quality_grade, 'third_quality'::quality_grade])
   OR EXISTS (SELECT 1 FROM tile_station_snapshots tss WHERE tss.tile_id = t.id AND tss.defect_detected = true);

-- Grant SELECT access so anon and authenticated users can query the view
GRANT SELECT ON public.defective_tiles_analysis TO anon, authenticated;

-- ─── 1b. Recreate tile_journey as SECURITY INVOKER ────────────────────────

-- Drop and recreate with security_invoker = true so RLS of querying user applies
DROP VIEW IF EXISTS public.tile_journey;

CREATE VIEW public.tile_journey
WITH (security_invoker = true)
AS
SELECT t.id AS tile_id,
    t.tile_number,
    t.simulation_id,
    ss.session_code,
    t.status,
    t.final_grade,
    t.created_at_sim_tick,
    t.completed_at_sim_tick,
    -- Per-station parameters and defects (correlated subqueries for each station)
    (SELECT tile_station_snapshots.parameters_snapshot FROM tile_station_snapshots WHERE tile_station_snapshots.tile_id = t.id AND tile_station_snapshots.station::text = 'press') AS press_params,
    (SELECT tile_station_snapshots.defect_types FROM tile_station_snapshots WHERE tile_station_snapshots.tile_id = t.id AND tile_station_snapshots.station::text = 'press') AS press_defects,
    (SELECT tile_station_snapshots.parameters_snapshot FROM tile_station_snapshots WHERE tile_station_snapshots.tile_id = t.id AND tile_station_snapshots.station::text = 'dryer') AS dryer_params,
    (SELECT tile_station_snapshots.defect_types FROM tile_station_snapshots WHERE tile_station_snapshots.tile_id = t.id AND tile_station_snapshots.station::text = 'dryer') AS dryer_defects,
    (SELECT tile_station_snapshots.parameters_snapshot FROM tile_station_snapshots WHERE tile_station_snapshots.tile_id = t.id AND tile_station_snapshots.station::text = 'glaze') AS glaze_params,
    (SELECT tile_station_snapshots.defect_types FROM tile_station_snapshots WHERE tile_station_snapshots.tile_id = t.id AND tile_station_snapshots.station::text = 'glaze') AS glaze_defects,
    (SELECT tile_station_snapshots.parameters_snapshot FROM tile_station_snapshots WHERE tile_station_snapshots.tile_id = t.id AND tile_station_snapshots.station::text = 'printer') AS printer_params,
    (SELECT tile_station_snapshots.defect_types FROM tile_station_snapshots WHERE tile_station_snapshots.tile_id = t.id AND tile_station_snapshots.station::text = 'printer') AS printer_defects,
    (SELECT tile_station_snapshots.parameters_snapshot FROM tile_station_snapshots WHERE tile_station_snapshots.tile_id = t.id AND tile_station_snapshots.station::text = 'kiln') AS kiln_params,
    (SELECT tile_station_snapshots.defect_types FROM tile_station_snapshots WHERE tile_station_snapshots.tile_id = t.id AND tile_station_snapshots.station::text = 'kiln') AS kiln_defects,
    (SELECT tile_station_snapshots.parameters_snapshot FROM tile_station_snapshots WHERE tile_station_snapshots.tile_id = t.id AND tile_station_snapshots.station::text = 'sorting') AS sorting_params,
    (SELECT tile_station_snapshots.defect_types FROM tile_station_snapshots WHERE tile_station_snapshots.tile_id = t.id AND tile_station_snapshots.station::text = 'sorting') AS sorting_defects,
    (SELECT tile_station_snapshots.parameters_snapshot FROM tile_station_snapshots WHERE tile_station_snapshots.tile_id = t.id AND tile_station_snapshots.station::text = 'packaging') AS packaging_params,
    (SELECT tile_station_snapshots.defect_types FROM tile_station_snapshots WHERE tile_station_snapshots.tile_id = t.id AND tile_station_snapshots.station::text = 'packaging') AS packaging_defects
FROM tiles t
JOIN simulation_sessions ss ON t.simulation_id = ss.id;

-- Grant SELECT access so anon and authenticated users can query the view
GRANT SELECT ON public.tile_journey TO anon, authenticated;

-- ─── 2. Fix mutable search_path on functions ──────────────────────────────
-- Pins search_path to 'public' to prevent search_path injection attacks

-- execute_readonly_query: CWF agent SQL execution function
ALTER FUNCTION public.execute_readonly_query(text) SET search_path = public;

-- get_simulation_stats: Simulation summary aggregation function
ALTER FUNCTION public.get_simulation_stats(uuid) SET search_path = public;

-- cleanup_old_simulation_data: Scheduled cleanup job function (takes interval param)
ALTER FUNCTION public.cleanup_old_simulation_data(interval) SET search_path = public;
