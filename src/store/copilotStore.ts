/**
 * copilotStore.ts — Zustand Store for CWF Copilot UI State
 *
 * Manages the client-side state for the CWF Copilot feature:
 *   - isEnabled: whether copilot mode is currently active
 *   - isAuthPending: whether the 3-step auth flow is in progress
 *   - lastAction: most recent copilot action (for status indicator)
 *   - actionHistory: ring buffer of recent actions (for action feed in chat)
 *   - config: current copilot configuration (mirrors Supabase copilot_config)
 *
 * The store is updated by:
 *   - User interactions (toggle button, typed commands)
 *   - useCopilotLifecycle hook (Supabase Realtime subscriptions)
 *   - useCWFCommandListener (when copilot messages arrive)
 *
 * Used by:
 *   - CWF panel component (pink theme, status indicator, action feed)
 *   - WatchdogStatusIndicator component
 *   - useCopilotHeartbeat hook (reads isEnabled to control heartbeat interval)
 *   - useCopilotLifecycle hook (writes state from Realtime events)
 */

import { create } from 'zustand';

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
 */
interface CopilotState {
    // ─── State ───────────────────────────────────────────────────────────────

    /** Whether copilot mode is currently active (monitoring + correcting) */
    isEnabled: boolean;

    /** Whether the 3-step auth flow is in progress (user has initiated but not
        yet provided the auth code) */
    isAuthPending: boolean;

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

    // ─── Actions ─────────────────────────────────────────────────────────────

    /** Enable copilot mode — called after successful auth flow */
    enableCopilot: () => void;

    /** Disable copilot mode — called by button, typed command, sim stop,
        or browser disconnect detection */
    disableCopilot: () => void;

    /** Set auth pending state — called when user clicks copilot button
        before auth is complete */
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

    /** Copilot starts disabled — user must explicitly activate via auth flow */
    isEnabled: false,

    /** No auth flow in progress initially */
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

    // ─── Actions ─────────────────────────────────────────────────────────────

    enableCopilot: () => set({
        isEnabled: true,
        isAuthPending: false,
    }),

    disableCopilot: () => set({
        isEnabled: false,
        isAuthPending: false,
    }),

    setAuthPending: (pending) => set({
        isAuthPending: pending,
    }),

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
        isEnabled: false,
        isAuthPending: false,
        lastAction: null,
        actionHistory: [],
        config: { ...DEFAULT_CONFIG },
        totalActions: 0,
        totalCycles: 0,
    }),
}));
