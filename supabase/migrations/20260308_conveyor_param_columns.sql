-- ============================================================================
-- Migration: Add conveyor behavioral parameter columns to conveyor_states
--
-- PURPOSE:
--   The 5 conveyor behavioral parameters (jammed_time, impacted_tiles,
--   scrap_probability, speed_change, jammed_events) were previously stored
--   only in the frontend Zustand store (conveyorNumericParams). This meant
--   CWF could not query current or historical conveyor settings from Supabase,
--   and had to ask the user instead.
--
--   This migration adds all 5 parameters as columns to the conveyor_states
--   table so that every per-tick snapshot captures the EXACT parameter state
--   active at that moment — including scenario-driven overrides and CWF-applied
--   changes — exactly as machine_*_states tables do for the 7 production stations.
--
-- DESIGN NOTES:
--   - Columns are nullable (NULL for rows created before this migration).
--   - jammed_time, impacted_tiles, scrap_probability are NUMERIC (float-safe).
--   - speed_change, jammed_events are BOOLEAN (stored as true/false, not 0/1).
--   - No UNIQUE constraint changes — existing (simulation_id, sim_tick) key
--     remains; ALTER TABLE ADD COLUMN is non-destructive.
--
-- EFFECT ON EXISTING ROWS:
--   All rows inserted before this migration will have NULL for the 5 new
--   columns. This is acceptable — they predate the feature. New rows
--   will always have all 5 columns populated from conveyorNumericParams.
--
-- Date: 2026-03-08
-- ============================================================================

ALTER TABLE conveyor_states
  -- How long each jam lasts in simulation cycles (frontend: jammed_time).
  -- NULL on pre-migration rows; populated on every new tick thereafter.
  ADD COLUMN IF NOT EXISTS jammed_time       NUMERIC,

  -- Number of tiles scrapped per jam event (frontend: impacted_tiles).
  -- NULL on pre-migration rows; populated on every new tick thereafter.
  ADD COLUMN IF NOT EXISTS impacted_tiles    NUMERIC,

  -- Global tile scrap probability applied at all stations, in % (frontend: scrap_probability).
  -- NULL on pre-migration rows; populated on every new tick thereafter.
  ADD COLUMN IF NOT EXISTS scrap_probability NUMERIC,

  -- Whether random belt speed-change events are enabled (frontend: speed_change).
  -- Stored as BOOLEAN (true/false), not as 0/1 integer.
  -- NULL on pre-migration rows; populated on every new tick thereafter.
  ADD COLUMN IF NOT EXISTS speed_change      BOOLEAN,

  -- Whether jam events can occur on the belt (frontend: jammed_events).
  -- Stored as BOOLEAN (true/false), not as 0/1 integer.
  -- NULL on pre-migration rows; populated on every new tick thereafter.
  ADD COLUMN IF NOT EXISTS jammed_events     BOOLEAN;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
