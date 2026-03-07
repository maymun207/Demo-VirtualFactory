-- ============================================================================
-- Fix telemetry table schema
--
-- The telemetry table was originally created with machine_id as the sole PK
-- (one row per machine, upserted). The app code was later updated to support
-- per-simulation time-series telemetry, adding simulation_id and created_at
-- columns. This migration aligns the DB schema with the app code.
--
-- Changes:
--   1. Add id (UUID) column for unique row identification
--   2. Add simulation_id column (FK to simulation_sessions)
--   3. Add created_at column (timestamp for time-series ordering)
--   4. Drop old PK (machine_id only) and create new composite unique constraint
--   5. Add index for simulation-scoped queries
--
-- Date: 2026-03-02
-- ============================================================================

-- Step 1: Add the missing columns
ALTER TABLE telemetry
  ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS simulation_id UUID REFERENCES simulation_sessions(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

-- Step 2: Drop the old primary key (machine_id only)
-- This allows multiple rows per machine_id (one per simulation per tick)
ALTER TABLE telemetry DROP CONSTRAINT IF EXISTS telemetry_pkey;

-- Step 3: Set id as the new primary key
ALTER TABLE telemetry ADD PRIMARY KEY (id);

-- Step 4: Create composite unique constraint for upsert conflict resolution
-- (machine_id, simulation_id, s_clock) — one row per machine per simulation per tick
CREATE UNIQUE INDEX IF NOT EXISTS idx_telemetry_machine_sim_sclock
  ON telemetry(machine_id, simulation_id, s_clock);

-- Step 5: Index for simulation-scoped queries  
CREATE INDEX IF NOT EXISTS idx_telemetry_simulation
  ON telemetry(simulation_id);
