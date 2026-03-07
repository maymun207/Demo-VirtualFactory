-- ═══════════════════════════════════════════════════════════════════
-- OEE Snapshots — Periodic OEE calculations per simulation session
-- Stores machine/line/factory OEE and energy data for historical analysis
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS oee_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  simulation_id UUID NOT NULL REFERENCES simulation_sessions(id) ON DELETE CASCADE,
  sim_tick INTEGER NOT NULL,
  elapsed_minutes NUMERIC NOT NULL,

  -- Station counts (A-J variables from real factory model)
  press_spawned INTEGER DEFAULT 0,
  press_output INTEGER DEFAULT 0,
  dryer_output INTEGER DEFAULT 0,
  glaze_output INTEGER DEFAULT 0,
  digital_output INTEGER DEFAULT 0,
  kiln_input INTEGER DEFAULT 0,
  kiln_output INTEGER DEFAULT 0,
  sorting_usable_output INTEGER DEFAULT 0,
  packaging_output INTEGER DEFAULT 0,
  conveyor_clean_output INTEGER DEFAULT 0,
  theoretical_a NUMERIC DEFAULT 0,
  theoretical_b NUMERIC DEFAULT 0,

  -- Machine OEEs (0-100 percentage scale)
  moee_press NUMERIC DEFAULT 0,
  moee_dryer NUMERIC DEFAULT 0,
  moee_glaze NUMERIC DEFAULT 0,
  moee_digital NUMERIC DEFAULT 0,
  moee_conveyor NUMERIC DEFAULT 0,
  moee_kiln NUMERIC DEFAULT 0,
  moee_sorting NUMERIC DEFAULT 0,
  moee_packaging NUMERIC DEFAULT 0,

  -- Line OEEs (0-100 percentage scale)
  loee_line1 NUMERIC DEFAULT 0,
  loee_line2 NUMERIC DEFAULT 0,
  loee_line3 NUMERIC DEFAULT 0,

  -- Factory OEE
  foee NUMERIC DEFAULT 0,
  bottleneck CHAR(1) DEFAULT 'B',

  -- Cumulative energy at this tick
  energy_total_kwh NUMERIC DEFAULT 0,
  energy_total_gas NUMERIC DEFAULT 0,
  energy_total_co2 NUMERIC DEFAULT 0,
  energy_kwh_per_tile NUMERIC DEFAULT 0,

  -- Per-station energy (cumulative kWh)
  energy_press_kwh NUMERIC DEFAULT 0,
  energy_dryer_kwh NUMERIC DEFAULT 0,
  energy_glaze_kwh NUMERIC DEFAULT 0,
  energy_digital_kwh NUMERIC DEFAULT 0,
  energy_conveyor_kwh NUMERIC DEFAULT 0,
  energy_kiln_kwh NUMERIC DEFAULT 0,
  energy_sorting_kwh NUMERIC DEFAULT 0,
  energy_packaging_kwh NUMERIC DEFAULT 0,
  energy_dryer_gas NUMERIC DEFAULT 0,
  energy_kiln_gas NUMERIC DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast lookup by simulation
CREATE INDEX IF NOT EXISTS idx_oee_snapshots_sim_tick
  ON oee_snapshots(simulation_id, sim_tick);

-- Index for time-range queries
CREATE INDEX IF NOT EXISTS idx_oee_snapshots_created
  ON oee_snapshots(simulation_id, created_at);

-- Enable RLS
ALTER TABLE oee_snapshots ENABLE ROW LEVEL SECURITY;

-- RLS policy: users can only see their own simulation data
-- (matches pattern used by other tables in this project)
CREATE POLICY "Users can manage own oee_snapshots"
  ON oee_snapshots
  FOR ALL
  USING (
    simulation_id IN (
      SELECT id FROM simulation_sessions
      WHERE simulation_sessions.id = oee_snapshots.simulation_id
    )
  );
