/**
 * copilot.ts — CWF Copilot Configuration Constants
 *
 * Centralised configuration for the CWF Copilot autonomous monitoring system.
 * Contains all timing constants, threshold defaults, theme colours, intent
 * detection keywords, Supabase table names, and type definitions.
 *
 * CWF STATE MACHINE: The copilot feature uses a 3-state machine:
 *   NORMAL → COPILOT_PENDING_AUTH → COPILOT_ACTIVE
 * The state is stored in Supabase (copilot_config.cwf_state) as the
 * authoritative source of truth. The Zustand client store mirrors it via
 * Supabase Realtime. The Vercel serverless function reads it directly.
 *
 * ALL copilot-related magic numbers and strings live here — no hard-coded
 * values in other modules. Every constant has a JSDoc comment explaining its
 * purpose and how it interacts with the rest of the system.
 *
 * Used by:
 *   - src/store/copilotStore.ts        (defaults, types)
 *   - src/hooks/useCopilotHeartbeat.ts (heartbeat timing)
 *   - src/hooks/useCopilotLifecycle.ts (table names, sentinel)
 *   - api/cwf/copilotEngine.ts         (timing, thresholds, model)
 *   - api/cwf/chat.ts                  (auth bypass sentinel, state machine)
 *   - src/hooks/useCWFCommandListener  (sentinel detection)
 */

// =============================================================================
// FEATURE FLAG
// =============================================================================

/**
 * Master feature flag for the copilot system.
 * When false, the copilot button is hidden, hooks are no-ops, and the server
 * endpoints return 503. Set to false to disable copilot without removing code.
 */
export const COPILOT_FEATURE_ENABLED = true;

// =============================================================================
// CWF STATE MACHINE
// =============================================================================

/**
 * Valid CWF state machine states.
 *
 * The state is stored in Supabase copilot_config.cwf_state (authoritative).
 * The Zustand copilotStore mirrors it for UI reactivity.
 *
 *   NORMAL              — Standard conversational CWF; HITL protocol applies.
 *   COPILOT_PENDING_AUTH — User requested copilot; awaiting correct auth code.
 *   COPILOT_ACTIVE       — Copilot authorised; applies corrections autonomously.
 */
export type CwfState = 'normal' | 'copilot_pending_auth' | 'copilot_active';

/**
 * Maximum number of failed authorization attempts before the state machine
 * rejects the copilot enable request and returns to NORMAL.
 * After 3 wrong codes, the user must reinitiate the copilot enable flow.
 */
export const COPILOT_MAX_AUTH_ATTEMPTS = 3;

// =============================================================================
// AUTHENTICATION
// =============================================================================

/**
 * Sentinel value for the `authorized_by` field in cwf_commands when a command
 * is dispatched by the copilot engine (not by a human operator).
 *
 * The CWF command listener and the chat.ts auth validator both check for this
 * sentinel to allow copilot commands to bypass the human auth prompt.
 *
 * FORMAT: 'system:copilot_auto' — the 'system:' prefix distinguishes it from
 * any possible human-entered auth code.
 */
export const COPILOT_AUTH_SENTINEL = 'system:copilot_auto';

// =============================================================================
// TIMING — POLL INTERVAL
// =============================================================================

/**
 * Default polling interval in seconds — how often the copilot engine reads
 * Supabase for the latest factory metrics and evaluates whether action is needed.
 *
 * 6 seconds provides fast anomaly detection (catches drift within one tick)
 * while staying well within Gemini API limits and Supabase query budgets.
 */
export const COPILOT_DEFAULT_POLL_INTERVAL_SEC = 6;

/**
 * Minimum allowed poll interval (seconds). Prevents the user from setting
 * an interval so low it overwhelms the Gemini API or Supabase.
 */
export const COPILOT_MIN_POLL_INTERVAL_SEC = 6;

/**
 * Maximum allowed poll interval (seconds). Beyond this, the copilot is so
 * slow it's unlikely to catch degradation before damage is done.
 */
export const COPILOT_MAX_POLL_INTERVAL_SEC = 120;

// =============================================================================
// TIMING — BROWSER HEARTBEAT
// =============================================================================

/**
 * Interval (ms) at which the browser sends a heartbeat POST to the CWF dev
 * server. The server updates `copilot_config.last_heartbeat_at` on each beat.
 *
 * 5 seconds = aggressive enough to detect tab closure within 15s.
 */
export const COPILOT_HEARTBEAT_INTERVAL_MS = 5_000;

/**
 * Maximum age (ms) of the last heartbeat before the server considers the
 * browser disconnected and auto-disengages copilot mode.
 *
 * 15_000ms = 3 missed heartbeats (3 × 5s). This is the safety window.
 * If the browser closes, tabes away, or loses network for 15s, copilot stops.
 */
export const COPILOT_HEARTBEAT_TIMEOUT_MS = 15_000;

// =============================================================================
// TIMING — VERCEL CLIENT-SIDE POLLING
// =============================================================================

/**
 * Interval (ms) at which the browser triggers copilot evaluation cycles
 * on the Vercel deployment by calling POST /api/cwf/copilot/evaluate.
 *
 * 6_000ms (6 seconds) matches the server-side COPILOT_DEFAULT_POLL_INTERVAL_SEC.
 * This is only used on Vercel — locally, the cwf-dev-server.ts runs its own
 * polling loop via the in-memory CopilotEngine.
 *
 * The evaluate endpoint also updates the heartbeat timestamp internally,
 * so a separate heartbeat call is not needed on Vercel.
 */
export const COPILOT_VERCEL_POLL_INTERVAL_MS = 6_000;

// =============================================================================
// DATA-FLOW DISENGAGE GRACE PERIOD
// =============================================================================

/**
 * Grace period (ms) before copilot auto-disengages when isDataFlowing goes false.
 *
 * Brief Supabase Realtime disconnections or transient data gaps can cause
 * isDataFlowing to flicker to false for a few seconds. Without this grace
 * period, the copilot theme drops and monitoring stops prematurely.
 *
 * 30_000ms = 30 seconds. If isDataFlowing stays false for 30 consecutive
 * seconds, copilot will disengage. If data flow resumes within this window,
 * the timer resets and copilot continues uninterrupted.
 */
export const COPILOT_DISENGAGE_GRACE_PERIOD_MS = 30_000;

// =============================================================================
// RATE LIMITING & COOLDOWN
// =============================================================================

/**
 * Maximum number of autonomous corrective actions the copilot may take per
 * minute. Set to 20 to allow the copilot to correct all out-of-range parameters
 * in a single evaluation cycle (up to 7 kiln params + other stations).
 * Per-parameter cooldown still prevents oscillation on any individual param.
 */
export const COPILOT_DEFAULT_MAX_ACTIONS_PER_MINUTE = 20;

/**
 * Default cooldown in seconds between corrections to the SAME parameter.
 * After the copilot corrects kiln.max_temperature_c, it will not touch that
 * specific parameter again for at least 30 seconds, even if it drifts again.
 *
 * This prevents oscillation (correct → drift → correct → drift) and gives
 * the parameter drift engine time to show whether the fix held.
 */
export const COPILOT_DEFAULT_COOLDOWN_SEC = 30;

// =============================================================================
// THRESHOLDS — PRE-FILTER (skip Gemini when factory is healthy)
// =============================================================================

/**
 * Factory OEE (FOEE) threshold. When FOEE is below this value, the copilot
 * engine calls Gemini for a full evaluation. When FOEE is above this AND
 * all parameters are within range, the cycle is skipped (no API call).
 */
export const COPILOT_DEFAULT_OEE_ALARM = 60.0;

/**
 * Quality percentage threshold. When first-quality rate drops below this,
 * the copilot triggers an evaluation even if FOEE looks acceptable.
 */
export const COPILOT_DEFAULT_QUALITY_ALARM = 85.0;

// =============================================================================
// SUPABASE TABLE NAMES
// =============================================================================

/**
 * Name of the copilot configuration table in Supabase.
 * One row per simulation session, holding the master toggle and thresholds.
 */
export const COPILOT_CONFIG_TABLE = 'copilot_config';

/**
 * Name of the copilot audit trail table in Supabase.
 * Every evaluation cycle produces one row, regardless of outcome.
 */
export const COPILOT_ACTIONS_TABLE = 'copilot_actions';

// =============================================================================
// GEMINI MODEL
// =============================================================================

/**
 * Gemini model used for routine copilot health checks.
 * Using a lighter/faster model keeps cost and latency low for the frequent
 * checks that typically result in "skip" (factory healthy).
 */
export const COPILOT_ROUTINE_MODEL = 'gemini-2.0-flash-lite';

// =============================================================================
// INTENT DETECTION — TYPED ACTIVATION / DEACTIVATION
// =============================================================================

/**
 * Keywords the user can type in the CWF chat to activate copilot mode.
 * The CWF agent (chat.ts) detects these and initiates the 3-step auth flow.
 * Includes both English and Turkish variants.
 */
export const COPILOT_ENABLE_KEYWORDS = [
    'enable copilot',
    'start copilot',
    'activate copilot',
    'copilot on',
    'turn on copilot',
    /** Turkish: "open copilot" */
    'kopilot aç',
    /** Turkish: "start copilot" */
    'kopilot başlat',
] as const;

/**
 * Keywords the user can type in the CWF chat to deactivate copilot mode.
 * No auth required to stop — stopping is always safe and immediate.
 */
export const COPILOT_DISABLE_KEYWORDS = [
    'stop copilot',
    'disable copilot',
    'deactivate copilot',
    'copilot off',
    'turn off copilot',
    /** Turkish: "close copilot" */
    'kopilot kapat',
    /** Turkish: "stop copilot" */
    'kopilot durdur',
] as const;

// =============================================================================
// UI — PINK THEME COLOURS
// =============================================================================

/**
 * Visual theme applied to the CWF panel when copilot mode is active.
 * The panel switches from its normal dark theme to a distinctive bright pink
 * theme so the user clearly knows autonomous control is engaged.
 *
 * Colours follow the HSL pink spectrum:
 *   primary     = Deep Pink (#FF1493)  — buttons, badges, active elements
 *   primaryLight = Hot Pink (#FF69B4)  — hover states, highlights
 *   primaryDark  = Med Violet Red (#C71585) — pressed states, borders
 *   glow        = Semi-transparent pink — box-shadow glow effect
 *   bgGradient  = Dark pinkish gradient — panel background
 *   headerBg    = Translucent pink — panel header strip
 *   borderColor = Translucent pink — panel border
 *   messageBg   = Very faint pink — copilot message bubble background
 */
export const COPILOT_THEME = {
    /** Primary accent colour — buttons, badges, status indicators */
    primary: '#FF1493',
    /** Lighter variant — hover states, secondary highlights */
    primaryLight: '#FF69B4',
    /** Darker variant — pressed/active states, strong borders */
    primaryDark: '#C71585',
    /** Glow effect — box-shadow around active copilot elements */
    glow: 'rgba(255, 20, 147, 0.3)',
    /** Panel background gradient — dark with pink tint */
    bgGradient: 'linear-gradient(135deg, #1a0a12 0%, #2d0a1e 50%, #1a0a12 100%)',
    /** Panel header background — translucent pink overlay */
    headerBg: 'rgba(255, 20, 147, 0.15)',
    /** Panel border colour — visible pink edge */
    borderColor: 'rgba(255, 20, 147, 0.4)',
    /** Message bubble background for copilot-generated messages */
    messageBg: 'rgba(255, 20, 147, 0.08)',
} as const;

// =============================================================================
// UI — TEXT LABELS & TOOLTIPS (bilingual EN/TR)
// =============================================================================

/**
 * All human-readable text used by copilot UI components.
 * Centralised here so:
 *   - No hard-coded strings exist in component files.
 *   - Both English and Turkish variants are co-located for consistency.
 *   - Any copy change only needs to happen in one place.
 *
 * Used by:
 *   - src/components/ui/copilot/CopilotToggleButton.tsx
 *   - src/components/ui/copilot/CopilotStatusBar.tsx
 *   - src/components/ui/copilot/CopilotMessageBadge.tsx
 */
export const COPILOT_UI_LABELS = {
    /** Button tooltip when copilot is currently OFF */
    enableTooltip: {
        en: 'Enable Copilot autonomous monitoring',
        tr: 'Copilot otonom izlemeyi etkinleştir',
    },
    /** Button tooltip when copilot is currently ON */
    disableTooltip: {
        en: 'Click to disable Copilot mode',
        tr: 'Copilot modunu devre dışı bırakmak için tıklayın',
    },
    /** Text the copilot button sends to CWF chat to enable copilot */
    enableChatMessage: {
        en: 'go into copilot mode',
        tr: 'copilot moduna geç',
    },
    /** Text the copilot button sends to CWF chat to disable copilot */
    disableChatMessage: {
        en: 'disable copilot',
        tr: 'copilot modunu devre dışı bırak',
    },
    /** Header badge label (shown next to pulse dot when copilot is active) */
    badgeLabel: 'COPILOT',
    /** Status bar: active state text (includes poll interval dynamically) */
    statusActive: {
        en: (intervalSec: number) => `Copilot Active — monitoring every ${intervalSec}s`,
        tr: (intervalSec: number) => `Copilot Aktif — her ${intervalSec}s izleniyor`,
    },
    /** Status bar: action count suffix */
    actionCountSuffix: {
        en: (count: number) => `${count} action${count !== 1 ? 's' : ''} taken`,
        tr: (count: number) => `${count} eylem gerçekleştirildi`,
    },
    /** Copilot message badge label (shown on system messages from copilot) */
    messageBadgeLabel: 'COPILOT',
    /** Station sentinel value for copilot chat messages in cwf_commands */
    copilotMessageStation: 'copilot_message',
    /** Prefix emoji for copilot system messages (used for detection + display) */
    copilotMessagePrefix: '🤖',
} as const;

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

/**
 * Severity levels for copilot decisions.
 * Determines which issues the copilot auto-fixes vs. flags for human review.
 *
 * 'low'      — Minor drift, within 10% of range boundary. Copilot can fix.
 * 'medium'   — Moderate deviation, clearly out of range. Copilot can fix.
 * 'high'     — Significant deviation, affecting OEE. Copilot can fix.
 * 'critical' — Multiple concurrent issues or safety risk. Escalate to human.
 */
export type CopilotSeverity = 'low' | 'medium' | 'high' | 'critical';

/**
 * Possible copilot decision outcomes, logged in the copilot_actions table.
 */
export type CopilotDecision = 'corrected' | 'observed' | 'escalated' | 'skipped';

/**
 * Shape of the copilot_config table row, used by both server and client.
 * Two columns were added in migration 20260309_copilot_state_machine.sql:
 *   cwf_state     — CWF State Machine current state
 *   auth_attempts — Failed auth count in COPILOT_PENDING_AUTH phase
 */
export interface CopilotConfig {
    /** UUID primary key */
    id: string;
    /** FK to simulation_sessions */
    simulation_id: string;
    /** CWF State Machine state: 'normal' | 'copilot_pending_auth' | 'copilot_active' */
    cwf_state: CwfState;
    /** Number of failed auth attempts in the current COPILOT_PENDING_AUTH phase */
    auth_attempts: number;
    /** Evaluation frequency in seconds */
    poll_interval_sec: number;
    /** Max corrections per minute */
    max_actions_per_minute: number;
    /** Per-parameter cooldown in seconds */
    cooldown_sec: number;
    /** Minimum severity to auto-fix */
    severity_threshold: string;
    /** FOEE threshold triggering evaluation */
    oee_alarm_threshold: number;
    /** Quality threshold triggering evaluation */
    quality_alarm_threshold: number;
    /** Most recent browser heartbeat timestamp (ISO 8601) */
    last_heartbeat_at: string;
    /** Auth code used to activate ('airtk') */
    activated_by: string | null;
    /** Row timestamps */
    created_at: string;
    updated_at: string;
}

/**
 * Shape of a copilot corrective action (stored as JSONB in copilot_actions).
 */
export interface CopilotActionDetail {
    /** Station name (e.g., 'kiln', 'press') */
    station: string;
    /** Parameter column name (e.g., 'max_temperature_c') */
    parameter: string;
    /** Value before correction */
    old_value: number;
    /** Value after correction (midpoint of safe range) */
    new_value: number;
    /** Human-readable reason for the correction */
    reason: string;
}

/**
 * Shape of the copilot_actions table row, used by the action feed in the UI.
 */
export interface CopilotActionRecord {
    /** UUID primary key */
    id: string;
    /** FK to simulation_sessions */
    simulation_id: string;
    /** Simulation tick at decision time */
    sim_tick: number;
    /** Decision outcome */
    decision: CopilotDecision;
    /** What triggered the evaluation */
    trigger_reason: string;
    /** Metrics snapshot at decision time */
    metrics_snapshot: Record<string, unknown> | null;
    /** Corrective action details, or null */
    action_taken: CopilotActionDetail | null;
    /** FK to cwf_commands (if action dispatched) */
    cwf_command_id: string | null;
    /** Raw Gemini reasoning text */
    gemini_reasoning: string | null;
    /** Message posted to CWF chat */
    chat_message: string | null;
    /** Gemini model used */
    model_used: string | null;
    /** Evaluation cycle duration in ms */
    latency_ms: number | null;
    /** Row creation timestamp */
    created_at: string;
}
