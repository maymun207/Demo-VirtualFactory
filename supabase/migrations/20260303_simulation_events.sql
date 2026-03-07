/**
 * 20260303_simulation_events.sql — Simulation State Transition Events Table
 *
 * Creates the `simulation_events` table to log every state transition
 * during a simulation (start, stop, drain, resume, reset, work_order_completed).
 *
 * CWF queries this table to understand manual stop/start patterns,
 * which is critical for accurate OEE interpretation (the factory uses
 * a P×Q model where manual stops are excluded from OEE calculation).
 *
 * Event types:
 *   'started'              — user clicked Start (data flow enabled)
 *   'stopped'              — simulation stopped (belt was empty)
 *   'drain_started'        — user clicked Stop while tiles were on belt
 *   'drain_completed'      — all in-flight tiles exited the belt naturally
 *   'force_stopped'        — user double-clicked Stop during drain (abort)
 *   'resumed'              — reserved for future pause/resume feature
 *   'reset'                — full factory reset triggered
 *   'work_order_completed' — target tile count reached, production ended
 */

-- ─── Table Definition ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS simulation_events (
    /** Unique event identifier */
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    /** Foreign key to the simulation this event belongs to */
    simulation_id UUID NOT NULL REFERENCES simulation_sessions(id),

    /** Simulation tick at which the event occurred */
    sim_tick INTEGER NOT NULL,

    /** Event type classifier (see module header for valid values) */
    event_type TEXT NOT NULL,

    /** Optional contextual data (e.g., pClockCount, tilesSpawned, reason) */
    details JSONB DEFAULT '{}',

    /** Timestamp when the event was recorded */
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ─── Row Level Security ─────────────────────────────────────────────────────────
ALTER TABLE simulation_events ENABLE ROW LEVEL SECURITY;

/** Allow anonymous users to read simulation events (CWF queries this) */
CREATE POLICY "anon_select_simulation_events"
    ON simulation_events FOR SELECT TO anon USING (true);

/** Allow anonymous users to insert events (frontend logger writes here) */
CREATE POLICY "anon_insert_simulation_events"
    ON simulation_events FOR INSERT TO anon WITH CHECK (true);

-- ─── Indexes ─────────────────────────────────────────────────────────────────────
/** Composite index for efficient queries filtered by simulation + ordered by tick */
CREATE INDEX idx_simulation_events_sim_id
    ON simulation_events(simulation_id, sim_tick);
