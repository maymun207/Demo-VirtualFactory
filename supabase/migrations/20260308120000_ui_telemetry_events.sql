-- =============================================================================
-- Migration: ui_telemetry_events
-- 
-- Creates the event-based behavioral analytics table for the Virtual Factory
-- simulation. Records every meaningful user interaction (panel toggle, button
-- click, slider change) and simulation state change (jam, speed event, OEE
-- breach) with a full snapshot of the browser state at each moment.
--
-- This table is used by:
--  1. CWF (Chat With your Factory) — to answer behavioral questions:
--     "What was open when the first jam hit?"
--     "How did the user react to the OEE drop at tick 240?"
--  2. Post-simulation analysis — to reconstruct the user's journey through
--     the simulation and identify usability problems.
--
-- Design principles:
--  - Event-based: fires ONLY on state change, never on time
--  - Non-blocking: all inserts are fire-and-forget from the browser
--  - Self-describing: each event carries a full ui_snapshot + sim_snapshot
--  - Append-only: rows are never updated; historical record is immutable
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Create the ui_telemetry_events table
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ui_telemetry_events (
    -- Primary key: UUID generated server-side
    id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Foreign key to the active simulation session (nullable for pre-sim events
    -- like Demo Settings opens before a simulation has started)
    simulation_id     UUID         REFERENCES simulation_sessions(id) ON DELETE SET NULL,

    -- Human-readable session code matching simulation_sessions.session_code
    -- Stored denormalized so CWF can filter without a join
    session_code      TEXT,

    -- ── Event Classification ───────────────────────────────────────────────
    --
    -- event_type: the specific action that occurred (e.g. 'panel_toggled')
    -- event_category: the broad category for grouping/filtering:
    --   'ui_action'       — user clicked a button or toggled a panel
    --   'sim_state'       — simulation state changed automatically
    --   'cwf_interaction' — user interacted with the CWF chat agent
    --   'parameter'       — a machine or conveyor parameter was changed
    event_type        TEXT         NOT NULL,
    event_category    TEXT         NOT NULL CHECK (event_category IN (
                                       'ui_action', 'sim_state',
                                       'cwf_interaction', 'parameter'
                                   )),

    -- ── Flexible Payload ───────────────────────────────────────────────────
    --
    -- properties: event-specific key-value pairs
    -- Examples:
    --   panel_toggled:         { panel: 'oee_hierarchy', state: 'opened' }
    --   conveyor_speed_changed: { from: 1.0, to: 1.5 }
    --   conveyor_jammed:        { sClockCount: 342, conveyorOEE: 0.91 }
    properties        JSONB        NOT NULL DEFAULT '{}',

    -- ── Context Snapshots ──────────────────────────────────────────────────
    --
    -- ui_snapshot: which panels were open at the moment of the event
    -- sim_snapshot: simulation state (tick, speed, conveyor) at that moment
    -- Both are captured in the browser and sent with every event
    ui_snapshot       JSONB        NOT NULL DEFAULT '{}',
    sim_snapshot      JSONB        NOT NULL DEFAULT '{}',

    -- ── Timing ────────────────────────────────────────────────────────────
    --
    -- occurred_at: wall-clock time (UTC) when the event was fired in browser
    -- s_clock_at: simulation tick counter at the moment of the event
    --             NULL for events that occur before simulation starts
    occurred_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
    s_clock_at        INTEGER
);

-- ---------------------------------------------------------------------------
-- Indexes for efficient CWF queries
-- ---------------------------------------------------------------------------

-- CWF most commonly queries events for a specific simulation session
CREATE INDEX IF NOT EXISTS idx_tel_events_simulation
    ON ui_telemetry_events (simulation_id);

-- CWF queries for specific event types (e.g. all 'conveyor_jammed' events)
CREATE INDEX IF NOT EXISTS idx_tel_events_type
    ON ui_telemetry_events (event_type);

-- CWF queries for event categories (e.g. all 'ui_action' events)
CREATE INDEX IF NOT EXISTS idx_tel_events_category
    ON ui_telemetry_events (event_category);

-- Time-based queries (e.g. "what happened in the first 2 minutes?")
CREATE INDEX IF NOT EXISTS idx_tel_events_occurred
    ON ui_telemetry_events (occurred_at);

-- Combined simulation + time index for the most common CWF query pattern
CREATE INDEX IF NOT EXISTS idx_tel_events_sim_occurred
    ON ui_telemetry_events (simulation_id, occurred_at);

-- ---------------------------------------------------------------------------
-- Row-Level Security
-- ---------------------------------------------------------------------------

-- Enable RLS on the table
ALTER TABLE ui_telemetry_events ENABLE ROW LEVEL SECURITY;

-- Anon (browser) can INSERT events (fire-and-forget from the client)
-- This is safe: the table is append-only from the browser perspective
CREATE POLICY "anon_can_insert_telemetry_events"
    ON ui_telemetry_events
    FOR INSERT
    TO anon
    WITH CHECK (true);

-- Anon CANNOT read events (privacy: behavioral data is server-only)
-- Only the CWF Vercel function (service_role) can SELECT
-- Service role bypasses RLS by default — no explicit policy needed

-- ---------------------------------------------------------------------------
-- Comment the table for documentation
-- ---------------------------------------------------------------------------

COMMENT ON TABLE ui_telemetry_events IS
    'Event-based UI interaction and simulation state change log. '
    'Records every panel toggle, button click, conveyor jam, and CWF interaction '
    'with full ui_snapshot and sim_snapshot context for post-run behavioral analysis. '
    'Append-only. Anon INSERT only. SELECT requires service_role (CWF agent).';

COMMENT ON COLUMN ui_telemetry_events.event_type IS
    'Specific event type. Values: panel_toggled, simulation_started, simulation_stopped, '
    'simulation_reset, language_changed, conveyor_status_set, conveyor_speed_changed, '
    'sclock_period_changed, station_interval_changed, scenario_selected, params_updated, '
    'params_reset_to_defaults, work_order_changed, demo_settings_opened, demo_settings_closed, '
    'quick_action_used, conveyor_jammed, conveyor_unjammed, simulation_draining, '
    'simulation_completed, oee_breach, speed_event_fired, first_tile_produced, '
    'cwf_message_sent, cwf_response_received, cwf_ui_command_executed, cwf_param_changed';

COMMENT ON COLUMN ui_telemetry_events.properties IS
    'Event-specific key-value payload (JSONB). '
    'Examples: { panel: "oee_hierarchy", state: "opened" } for panel_toggled; '
    '{ from: 1.0, to: 1.5 } for conveyor_speed_changed.';

COMMENT ON COLUMN ui_telemetry_events.ui_snapshot IS
    'Boolean map of all 11 panels at moment of event. '
    'Keys: basicPanel, dtxfr, oeeHierarchy, prodTable, cwf, controlPanel, '
    'demoSettings, alarmLog, tilePassport, heatmap, kpi.';

COMMENT ON COLUMN ui_telemetry_events.sim_snapshot IS
    'Simulation state at moment of event. '
    'Keys: isRunning, isDraining, sClockCount, sClockPeriod, stationInterval, '
    'conveyorStatus, conveyorSpeed.';
