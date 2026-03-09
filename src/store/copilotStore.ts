/**
 * copilotStore.ts — Zustand Store for CWF Copilot UI State
 *
 * Manages the client-side state for the CWF Copilot feature:
 *   - cwfState:     CWF State Machine state (SLAVE of Supabase copilot_config.cwf_state)
 *   - authAttempts: Failed auth attempts in the current COPILOT_PENDING_AUTH phase
 *   - isEnabled:    Derived helper — true only when cwfState = 'copilot_active'
 *   - isAuthPending: Derived helper — true when cwfState = 'copilot_pending_auth'
 *   - lastAction:   Most recent copilot action (for status indicator in CWF header)
 *   - actionHistory: Ring buffer of recent actions (displayed in CWF chat feed)
 *   - config:       Cached copilot config (mirrors Supabase copilot_config)
 *
 * IMPORTANT: This store is a READ-ONLY MIRROR of Supabase.
 * The canonical cwf_state and auth_attempts live in copilot_config (Supabase).
 * This store is updated by useCopilotLifecycle via Supabase Realtime so the
 * UI stays in sync. The Vercel function reads Supabase directly for decisions.
 *
 * State machine transitions:
 *   NORMAL → COPILOT_PENDING_AUTH → COPILOT_ACTIVE
 *   Any state → NORMAL (sim ends, user disables, 3 bad auth codes)
 *
 * The store is updated by:
 *   - useCopilotLifecycle hook (Supabase Realtime subscriptions — PRIMARY source)
 *   - useCWFCommandListener (when copilot messages arrive)
 *
 * Used by:
 *   - CWF panel component (pink theme, status indicator, action feed)
 *   - cwfStore.ts (injects cwfState into uiContext hint for the LLM)
 *   - useCopilotHeartbeat hook (reads isEnabled to control heartbeat interval)
 *   - useCopilotLifecycle hook (writes state from Realtime events)
 */

import { create } from 'zustand';
import type { CwfState } from '../lib/params/copilot';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Shape of a copilot action as displayed in the CWF chat feed.
 * Subset of the full copilot_actions database row — only UI-relevant fields.
 */
export interface CopilotChatAction {
    /** UUID from copilot_actions table */
    id: string;
    /** Decision outcome: 'corrected', 'observed', 'escalated', 'skipped' */
    decision: string;
    /** Human-readable message displayed in CWF chat with 🤖 badge */
    chatMessage: string;
    /** When this action occurred */
    timestamp: string;
    /** Simulation tick at the time of action */
    simTick: number;
}

/**
 * Configuration subset exposed to the UI store.
 * Full config is in Supabase — this is the cached client-side mirror.
 */
export interface CopilotUIConfig {
    /** Evaluation frequency in seconds */
    pollIntervalSec: number;
    /** FOEE threshold that triggers evaluation */
    oeeAlarmThreshold: number;
    /** Quality threshold that triggers evaluation */
    qualityAlarmThreshold: number;
    /** Minimum severity to auto-fix */
    severityThreshold: string;
}

/**
 * Copilot store state shape (Zustand).
 * SLAVE of Supabase copilot_config — updated via Supabase Realtime.
 */
interface CopilotState {
    // ─── CWF State Machine Mirror (master is Supabase copilot_config) ─────────

    /**
     * Current CWF state machine state.
     * This is a CLIENT-SIDE MIRROR synced from Supabase via Realtime.
     * The Vercel serverless function reads copilot_config.cwf_state directly
     * and does NOT rely on this value for its decisions.
     */
    cwfState: CwfState;

    /**
     * Number of failed authorization attempts in the current COPILOT_PENDING_AUTH phase.
     * Mirrored from Supabase copilot_config.auth_attempts via Realtime.
     * Resets to 0 on every state transition.
     */
    authAttempts: number;

    // ─── Derived State Helpers ────────────────────────────────────────────────

    /**
     * Convenience flag — true only when cwfState === 'copilot_active'.
     * Used by useCopilotHeartbeat and UI theme toggle.
     */
    isEnabled: boolean;

    /**
     * Convenience flag — true only when cwfState === 'copilot_pending_auth'.
     * Used by the toggle button to show a spinner while waiting for auth.
     */
    isAuthPending: boolean;

    // ─── Action Feed ──────────────────────────────────────────────────────────

    /** Most recent copilot action (for the status indicator in CWF header) */
    lastAction: CopilotChatAction | null;

    /** Ring buffer of recent actions (displayed as chat messages in CWF panel).
        Max 50 items — oldest are evicted when buffer is full. */
    actionHistory: CopilotChatAction[];

    /** Cached copilot configuration from Supabase */
    config: CopilotUIConfig;

    /** Total number of corrective actions taken in this copilot session */
    totalActions: number;

    /** Total evaluation cycles in this copilot session */
    totalCycles: number;

    // ─── State Machine Actions (mirror updates from Supabase Realtime) ────────

    /**
     * Called by useCopilotLifecycle when Realtime fires a copilot_config change.
     * Syncs cwfState + authAttempts from the Supabase row into the Zustand mirror.
     * Also keeps the derived isEnabled / isAuthPending flags consistent.
     */
    syncStateFromCloud: (cwfState: CwfState, authAttempts: number) => void;

    /**
     * Enable copilot mode — legacy helper, now equivalent to
     * syncStateFromCloud('copilot_active', 0).
     * Kept for backward-compat with useCopilotLifecycle.ts enableCopilot() calls.
     */
    enableCopilot: () => void;

    /**
     * Disable copilot mode — legacy helper, now equivalent to
     * syncStateFromCloud('normal', 0).
     * Kept for backward-compat with useCopilotLifecycle.ts disableCopilot() calls.
     */
    disableCopilot: () => void;

    /** Set auth pending state — legacy helper used by the toggle button */
    setAuthPending: (pending: boolean) => void;

    /** Push a new action into the history ring buffer.
        Called by useCopilotLifecycle when a copilot_actions Realtime event arrives. */
    pushAction: (action: CopilotChatAction) => void;

    /** Update the cached configuration from Supabase.
        Called by useCopilotLifecycle when copilot_config changes. */
    updateConfig: (config: Partial<CopilotUIConfig>) => void;

    /** Increment the total cycles counter.
        Called by the lifecycle hook on each evaluation. */
    incrementCycles: () => void;

    /** Reset all copilot state to defaults.
        Called when simulation ends or session changes. */
    resetCopilot: () => void;
}

// =============================================================================
// DEFAULT VALUES
// =============================================================================

/** Maximum number of actions to keep in the history ring buffer */
const MAX_ACTION_HISTORY = 50;

/** Default copilot configuration (matches copilot_config table defaults) */
const DEFAULT_CONFIG: CopilotUIConfig = {
    pollIntervalSec: 15,
    oeeAlarmThreshold: 60.0,
    qualityAlarmThreshold: 85.0,
    severityThreshold: 'medium',
};

// =============================================================================
// STORE
// =============================================================================

/**
 * Zustand store for CWF Copilot UI state.
 * Manages copilot activation state, action history (ring buffer),
 * and cached configuration.
 */
export const useCopilotStore = create<CopilotState>((set) => ({
    // ─── Initial State ───────────────────────────────────────────────────────

    /** CWF starts in normal mode — mirrored from Supabase, initialised locally */
    cwfState: 'normal',

    /** Zero failed auth attempts on init */
    authAttempts: 0,

    /** Derived: copilot not active at start */
    isEnabled: false,

    /** Derived: no auth pending at start */
    isAuthPending: false,

    /** No actions yet */
    lastAction: null,

    /** Empty action history */
    actionHistory: [],

    /** Default configuration (will be overwritten from Supabase on init) */
    config: { ...DEFAULT_CONFIG },

    /** Zero counters */
    totalActions: 0,
    totalCycles: 0,

    // ─── State Machine Sync (primary update path from Supabase Realtime) ─────

    syncStateFromCloud: (cwfState, authAttempts) => set({
        /** Mirror the authoritative Supabase state into Zustand */
        cwfState,
        authAttempts,
        /** Derive convenience flags from the received state */
        isEnabled: cwfState === 'copilot_active',
        isAuthPending: cwfState === 'copilot_pending_auth',
    }),

    // ─── Legacy Action Helpers (kept for backward-compat) ────────────────────

    enableCopilot: () => set({
        cwfState: 'copilot_active',
        authAttempts: 0,
        isEnabled: true,
        isAuthPending: false,
    }),

    disableCopilot: () => set({
        cwfState: 'normal',
        authAttempts: 0,
        isEnabled: false,
        isAuthPending: false,
    }),

    setAuthPending: (pending) => set((state) => ({
        cwfState: pending ? 'copilot_pending_auth' : state.cwfState,
        isAuthPending: pending,
    })),

    pushAction: (action) => set((state) => {
        /** Prepend new action (most recent first) and cap at MAX_ACTION_HISTORY */
        const updatedHistory = [action, ...state.actionHistory].slice(0, MAX_ACTION_HISTORY);

        return {
            lastAction: action,
            actionHistory: updatedHistory,
            /** Increment totalActions only for 'corrected' decisions */
            totalActions: action.decision === 'corrected'
                ? state.totalActions + 1
                : state.totalActions,
        };
    }),

    updateConfig: (configUpdate) => set((state) => ({
        config: { ...state.config, ...configUpdate },
    })),

    incrementCycles: () => set((state) => ({
        totalCycles: state.totalCycles + 1,
    })),

    resetCopilot: () => set({
        cwfState: 'normal',
        authAttempts: 0,
        isEnabled: false,
        isAuthPending: false,
        lastAction: null,
        actionHistory: [],
        config: { ...DEFAULT_CONFIG },
        totalActions: 0,
        totalCycles: 0,
    }),
}));
