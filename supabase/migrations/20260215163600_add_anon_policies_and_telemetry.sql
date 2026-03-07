-- ============================================================================
-- Fix migration: Add anon RLS policies + create telemetry table
-- ============================================================================

-- ─── 1. Create telemetry table (used by telemetryStore.ts) ──────────────────

CREATE TABLE IF NOT EXISTS telemetry (
    machine_id VARCHAR(50) PRIMARY KEY,
    status VARCHAR(20),
    s_clock BIGINT DEFAULT 0,
    p_clock BIGINT DEFAULT 0,
    conveyor_speed DECIMAL(6,2),
    oee VARCHAR(10),
    ftq VARCHAR(10),
    scrap_rate VARCHAR(10),
    energy_kwh VARCHAR(10),
    gas_m3 VARCHAR(10),
    co2_kg VARCHAR(10),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE telemetry ENABLE ROW LEVEL SECURITY;

-- ─── 2. Add anon policies for ALL tables ────────────────────────────────────

-- Telemetry
CREATE POLICY "Allow anon full access" ON telemetry
    FOR ALL TO anon USING (true) WITH CHECK (true);

-- Simulation sessions
CREATE POLICY "Allow anon full access" ON simulation_sessions
    FOR ALL TO anon USING (true) WITH CHECK (true);

-- Machine state tables
CREATE POLICY "Allow anon full access" ON machine_press_states
    FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY "Allow anon full access" ON machine_dryer_states
    FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY "Allow anon full access" ON machine_glaze_states
    FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY "Allow anon full access" ON machine_printer_states
    FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY "Allow anon full access" ON machine_kiln_states
    FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY "Allow anon full access" ON machine_sorting_states
    FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY "Allow anon full access" ON machine_packaging_states
    FOR ALL TO anon USING (true) WITH CHECK (true);

-- Tile tracking tables
CREATE POLICY "Allow anon full access" ON tiles
    FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY "Allow anon full access" ON tile_station_snapshots
    FOR ALL TO anon USING (true) WITH CHECK (true);

-- Events and metrics
CREATE POLICY "Allow anon full access" ON parameter_change_events
    FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY "Allow anon read access" ON defect_scenarios
    FOR SELECT TO anon USING (true);

CREATE POLICY "Allow anon full access" ON scenario_activations
    FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY "Allow anon full access" ON production_metrics
    FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY "Allow anon full access" ON ai_analysis_results
    FOR ALL TO anon USING (true) WITH CHECK (true);
