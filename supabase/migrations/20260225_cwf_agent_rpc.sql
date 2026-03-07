-- ============================================================================
-- CWF Agent: Read-only query execution + simulation stats functions
-- Date: 2026-02-25
-- ============================================================================

-- ─── 1. Safe read-only SQL execution for AI agent ───────────────────────────

CREATE OR REPLACE FUNCTION execute_readonly_query(query_text TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout = '10s'
SET work_mem = '8MB'
AS $$
DECLARE
    result JSONB;
BEGIN
    -- Validate: only SELECT/WITH allowed
    IF NOT (
        trim(upper(query_text)) LIKE 'SELECT%' OR
        trim(upper(query_text)) LIKE 'WITH%'
    ) THEN
        RAISE EXCEPTION 'Only SELECT/WITH queries are allowed. Received: %',
            left(trim(upper(query_text)), 20);
    END IF;

    -- Block dangerous keywords even inside CTEs
    IF query_text ~* '\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE|GRANT|REVOKE|EXECUTE|COPY)\b' THEN
        RAISE EXCEPTION 'Query contains forbidden keyword';
    END IF;

    -- Execute within a read-only transaction
    SET LOCAL transaction_read_only = ON;

    EXECUTE format(
        'SELECT jsonb_agg(row_to_json(t)) FROM (%s) t',
        query_text
    ) INTO result;

    -- Safety: cap at 500 rows
    IF jsonb_array_length(COALESCE(result, '[]'::jsonb)) > 500 THEN
        result := (
            SELECT jsonb_agg(elem)
            FROM (
                SELECT elem
                FROM jsonb_array_elements(result) AS elem
                LIMIT 500
            ) sub
        );
    END IF;

    RETURN COALESCE(result, '[]'::jsonb);

EXCEPTION
    WHEN query_canceled THEN
        RAISE EXCEPTION 'Query timed out (10s limit). Try a more specific query.';
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Query error: %', SQLERRM;
END;
$$;

GRANT EXECUTE ON FUNCTION execute_readonly_query(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION execute_readonly_query(TEXT) TO anon;

-- ─── 2. Quick simulation stats (optimized single-query summary) ─────────────

CREATE OR REPLACE FUNCTION get_simulation_stats(p_simulation_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    result JSONB;
BEGIN
    SELECT jsonb_build_object(
        'session', (
            SELECT row_to_json(s.*)
            FROM simulation_sessions s
            WHERE s.id = p_simulation_id
        ),
        'tile_counts', (
            SELECT jsonb_build_object(
                'total', COUNT(*),
                'first_quality', COUNT(*) FILTER (WHERE final_grade = 'first_quality'),
                'second_quality', COUNT(*) FILTER (WHERE final_grade = 'second_quality'),
                'third_quality', COUNT(*) FILTER (WHERE final_grade = 'third_quality'),
                'scrap', COUNT(*) FILTER (WHERE final_grade = 'scrap'),
                'pending', COUNT(*) FILTER (WHERE final_grade = 'pending')
            )
            FROM tiles
            WHERE simulation_id = p_simulation_id
        ),
        'scrap_by_station', (
            SELECT COALESCE(jsonb_object_agg(station, cnt), '{}'::jsonb)
            FROM (
                SELECT tss.station, COUNT(*) as cnt
                FROM tile_station_snapshots tss
                WHERE tss.simulation_id = p_simulation_id AND tss.scrapped_here = true
                GROUP BY tss.station
            ) sub
        ),
        'active_scenario', (
            SELECT row_to_json(sa.*)
            FROM scenario_activations sa
            WHERE sa.simulation_id = p_simulation_id
            ORDER BY sa.activated_at_sim_tick DESC
            LIMIT 1
        ),
        'latest_metrics', (
            SELECT row_to_json(pm.*)
            FROM production_metrics pm
            WHERE pm.simulation_id = p_simulation_id
            ORDER BY pm.period_end_sim_tick DESC
            LIMIT 1
        ),
        'defect_summary', (
            SELECT COALESCE(jsonb_object_agg(defect, cnt), '{}'::jsonb)
            FROM (
                SELECT unnest(tss.defect_types) as defect, COUNT(*) as cnt
                FROM tile_station_snapshots tss
                WHERE tss.simulation_id = p_simulation_id AND tss.defect_detected = true
                GROUP BY unnest(tss.defect_types)
                ORDER BY cnt DESC
                LIMIT 10
            ) sub
        ),
        'parameter_change_count', (
            SELECT COUNT(*) FROM parameter_change_events WHERE simulation_id = p_simulation_id
        ),
        'alarm_count', (
            SELECT COUNT(*) FROM simulation_alarm_logs WHERE simulation_id = p_simulation_id
        )
    ) INTO result;

    RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_simulation_stats(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION get_simulation_stats(UUID) TO anon;

-- ─── 3. Ensure ai_analysis_results has anon access ──────────────────────────

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'ai_analysis_results' AND policyname = 'Allow anon full access'
    ) THEN
        CREATE POLICY "Allow anon full access" ON ai_analysis_results
            FOR ALL TO anon USING (true) WITH CHECK (true);
    END IF;
END $$;
