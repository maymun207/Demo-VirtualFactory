-- Allow machine_state_id to be NULL in tile_station_snapshots.
-- The machine state record for the current tick may not exist yet when the
-- snapshot is created (Zustand state batching edge case).
ALTER TABLE tile_station_snapshots
  ALTER COLUMN machine_state_id DROP NOT NULL;
