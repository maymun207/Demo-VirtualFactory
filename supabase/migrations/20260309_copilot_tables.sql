/**
 * 20260309_copilot_tables.sql — Supabase Migration for CWF Copilot
 *
 * Creates two new tables to support the CWF Copilot autonomous monitoring system:
 *
 * 1. copilot_config  — Per-session copilot configuration (master toggle, thresholds,
 *                      heartbeat tracking, activation auth).
 * 2. copilot_actions — Audit trail of every copilot decision (corrected, observed,
 *                      escalated, skipped) with full metrics snapshots and reasoning.
 *
 * Both tables are added to the Supabase Realtime publication so the browser can
 * live-subscribe to copilot state changes and action feed.
 *
 * RLS policies follow the existing anon-access pattern used by oee_snapshots,
 * cwf_commands, and other simulation tables.
 *
 * Dependencies:
 *   - simulation_sessions table (FK target for simulation_id)
 *   - cwf_commands table (FK target for cwf_command_id in copilot_actions)
 */

-- =============================================================================
-- TABLE: copilot_config
-- =============================================================================
-- Per-session copilot configuration. One row per active simulation session.
-- The browser writes this when the user enables/disables copilot mode.
-- The server reads this on every evaluation cycle to check enabled status
-- and heartbeat freshness.
-- =============================================================================

CREATE TABLE IF NOT EXISTS copilot_config (
    /** Unique row identifier — auto-generated UUID */
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    /** Foreign key to the active simulation session */
    simulation_id  UUID NOT NULL REFERENCES simulation_sessions(id) ON DELETE CASCADE,

    /** Master on/off switch — true when copilot is actively monitoring */
    enabled        BOOLEAN NOT NULL DEFAULT false,

    /** How often (seconds) the copilot engine evaluates the factory state */
    poll_interval_sec INTEGER NOT NULL DEFAULT 15,

    /** Maximum number of autonomous corrective actions per minute */
    max_actions_per_minute INTEGER NOT NULL DEFAULT 2,

    /** Minimum seconds between changes to the SAME parameter (prevents spam) */
    cooldown_sec   INTEGER NOT NULL DEFAULT 30,

    /** Minimum severity level to auto-fix: 'low', 'medium', 'high' */
    severity_threshold TEXT NOT NULL DEFAULT 'medium',

    /** Factory OEE (FOEE) below this value triggers copilot evaluation */
    oee_alarm_threshold REAL NOT NULL DEFAULT 75.0,

    /** Quality percentage below this value triggers copilot evaluation */
    quality_alarm_threshold REAL NOT NULL DEFAULT 85.0,

    /** Timestamp of the most recent browser heartbeat. Server checks this on
        every cycle; if stale beyond COPILOT_HEARTBEAT_TIMEOUT_MS, copilot
        auto-disengages (browser is gone). */
    last_heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    /** The authorization code used to activate copilot ('ardic'). Stored for
        audit purposes so we know who authorized autonomous operation. */
    activated_by   TEXT,

    /** Row creation timestamp */
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

    /** Last modification timestamp */
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

    /** Only one copilot config row per simulation session */
    UNIQUE (simulation_id)
);

-- Enable RLS on copilot_config
ALTER TABLE copilot_config ENABLE ROW LEVEL SECURITY;

-- Allow anonymous read access (browser needs to read copilot status)
CREATE POLICY "copilot_config_anon_select"
    ON copilot_config
    FOR SELECT
    TO anon
    USING (true);

-- Allow anonymous insert (browser creates config when copilot is first enabled)
CREATE POLICY "copilot_config_anon_insert"
    ON copilot_config
    FOR INSERT
    TO anon
    WITH CHECK (true);

-- Allow anonymous update (browser toggles enabled, server updates heartbeat)
CREATE POLICY "copilot_config_anon_update"
    ON copilot_config
    FOR UPDATE
    TO anon
    USING (true)
    WITH CHECK (true);

-- =============================================================================
-- TABLE: copilot_actions
-- =============================================================================
-- Audit trail of every copilot decision. Every evaluation cycle produces one
-- row regardless of whether action was taken (decision = 'skipped', 'observed',
-- 'corrected', or 'escalated'). This provides full transparency into what the
-- copilot saw and why it acted (or didn't).
-- =============================================================================

CREATE TABLE IF NOT EXISTS copilot_actions (
    /** Unique row identifier — auto-generated UUID */
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    /** Foreign key to the simulation session */
    simulation_id   UUID NOT NULL REFERENCES simulation_sessions(id) ON DELETE CASCADE,

    /** Simulation tick at the time of this decision */
    sim_tick        INTEGER NOT NULL DEFAULT 0,

    /** Decision outcome:
        'corrected'  — one parameter was auto-fixed
        'observed'   — issues detected but below severity threshold
        'escalated'  — critical issues flagged for human review
        'skipped'    — factory healthy, no Gemini call made (pre-filter) */
    decision        TEXT NOT NULL,

    /** Human-readable description of what triggered this evaluation cycle
        (e.g., "FOEE dropped to 48.2%", "Kiln max_temperature_c at 980") */
    trigger_reason  TEXT NOT NULL,

    /** Full metrics snapshot at decision time — JSONB for flexible schema.
        Contains FOEE, all MOEEs, out-of-range parameter list, alarm counts. */
    metrics_snapshot JSONB,

    /** Details of the corrective action taken, or null if no action.
        Shape: {station, parameter, old_value, new_value, reason} */
    action_taken    JSONB,

    /** FK to the cwf_commands row if a parameter change was dispatched.
        Null when decision is 'skipped', 'observed', or 'escalated'. */
    cwf_command_id  UUID,

    /** Raw Gemini reasoning text — the AI's explanation for its decision */
    gemini_reasoning TEXT,

    /** Human-readable message that was posted to the CWF chat panel.
        This is what the user sees in the pink-themed copilot chat. */
    chat_message    TEXT,

    /** Which Gemini model was used for this evaluation cycle */
    model_used      TEXT,

    /** Wall-clock time (ms) taken for the full evaluation cycle
        (query + Gemini call + command insert) */
    latency_ms      INTEGER,

    /** Row creation timestamp */
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on copilot_actions
ALTER TABLE copilot_actions ENABLE ROW LEVEL SECURITY;

-- Allow anonymous read access (browser displays action history in CWF chat)
CREATE POLICY "copilot_actions_anon_select"
    ON copilot_actions
    FOR SELECT
    TO anon
    USING (true);

-- Allow anonymous insert (server inserts action logs via service role,
-- but anon policy is needed for Realtime subscription compatibility)
CREATE POLICY "copilot_actions_anon_insert"
    ON copilot_actions
    FOR INSERT
    TO anon
    WITH CHECK (true);

-- =============================================================================
-- INDEX: Fast lookups by simulation session
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_copilot_config_sim
    ON copilot_config (simulation_id);

CREATE INDEX IF NOT EXISTS idx_copilot_actions_sim_created
    ON copilot_actions (simulation_id, created_at DESC);

-- =============================================================================
-- REALTIME: Add both tables to the Supabase Realtime publication
-- =============================================================================
-- This enables the browser to subscribe to INSERT/UPDATE events via
-- Supabase Realtime channels, powering the live copilot status indicator
-- and action feed in the CWF panel.
-- =============================================================================

ALTER PUBLICATION supabase_realtime ADD TABLE copilot_config;
ALTER PUBLICATION supabase_realtime ADD TABLE copilot_actions;
