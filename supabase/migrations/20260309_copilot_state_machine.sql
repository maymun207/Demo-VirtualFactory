-- =============================================================================
-- Migration: 20260309_copilot_state_machine.sql
--
-- Adds two columns to copilot_config to support the CWF State Machine:
--
--   cwf_state      VARCHAR  — Current state of the CWF chat for this session.
--                             One of: 'normal', 'copilot_pending_auth', 'copilot_active'.
--                             This is the AUTHORITATIVE source of truth — the Vercel
--                             serverless function (chat.ts) reads this column directly
--                             at the start of every request to decide how to behave.
--                             The Zustand client store mirrors this via Supabase Realtime.
--
--   auth_attempts  INTEGER  — How many failed authorization attempts have been made
--                             in the current COPILOT_PENDING_AUTH phase.
--                             Resets to 0 on every state transition.
--                             When this reaches COPILOT_MAX_AUTH_ATTEMPTS (3), the
--                             server returns cwf_state back to 'normal'.
--
-- State transitions (enforced in application layer, not DB constraints):
--   normal → copilot_pending_auth  : user requests copilot mode
--   copilot_pending_auth → copilot_active : correct auth code received
--   copilot_pending_auth → normal   : 3 failed attempts OR user cancels
--   copilot_active → normal         : simulation ends OR user disables copilot
--
-- Corresponding Zustand mirror fields:
--   copilotStore.cwfState    ← synced via Supabase Realtime on copilot_config changes
--   copilotStore.authAttempts ← synced via Supabase Realtime on copilot_config changes
-- =============================================================================

-- Add cwf_state column: tracks which state the CWF chat is in for this simulation.
-- Default is 'normal' so existing rows remain in a safe state after migration.
ALTER TABLE copilot_config
    ADD COLUMN IF NOT EXISTS cwf_state VARCHAR(30) NOT NULL DEFAULT 'normal';

-- Add auth_attempts column: counts failed auth attempts during COPILOT_PENDING_AUTH.
-- Resets to 0 on every state change. Never exceeds COPILOT_MAX_AUTH_ATTEMPTS (3).
ALTER TABLE copilot_config
    ADD COLUMN IF NOT EXISTS auth_attempts INTEGER NOT NULL DEFAULT 0;

-- Add a CHECK constraint to ensure only valid state values are stored.
-- This prevents application bugs from writing garbage states to the DB.
ALTER TABLE copilot_config
    ADD CONSTRAINT copilot_config_cwf_state_check
    CHECK (cwf_state IN ('normal', 'copilot_pending_auth', 'copilot_active'));

-- Add a CHECK constraint to ensure auth_attempts stays within legal bounds (0-3).
ALTER TABLE copilot_config
    ADD CONSTRAINT copilot_config_auth_attempts_check
    CHECK (auth_attempts >= 0 AND auth_attempts <= 3);

-- Index on cwf_state so the Vercel function's SELECT on (simulation_id, cwf_state)
-- can be satisfied without a full table scan.
CREATE INDEX IF NOT EXISTS idx_copilot_config_cwf_state
    ON copilot_config (cwf_state, simulation_id);

-- Comment the new columns for documentation in the DB schema viewer.
COMMENT ON COLUMN copilot_config.cwf_state IS
    'CWF State Machine: normal | copilot_pending_auth | copilot_active. '
    'Authoritative source — read by Vercel chat.ts on every request.';

COMMENT ON COLUMN copilot_config.auth_attempts IS
    'Failed authorization attempts in current copilot_pending_auth phase. '
    'Resets to 0 on state transition. Max 3 before returning to normal.';
