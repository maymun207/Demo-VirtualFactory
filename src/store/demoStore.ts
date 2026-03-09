/**
 * demoStore.ts — Demo System State Machine (Zustand)
 *
 * The engine that drives the Narrative Demo System. Manages:
 *   1. CONVERSATION THREAD — DemoMessage[] isolated from cwfStore
 *   2. ACT STATE MACHINE — currentActIndex, advanceAct, restartDemo
 *   3. PANEL CONTROL — applies per-act panelActions via uiStore (local, instant)
 *   4. SCENARIO SWITCHING — loads per-act scenarioCode via simulationDataStore
 *   5. API CALLS — sends openingPrompt to /api/cwf/chat with ARIA persona injected
 *
 * Architecture:
 *   - Calls /api/cwf/chat directly — the SAME endpoint as the CWF panel.
 *   - Does NOT import or mutate cwfStore or cwfService.
 *   - Reads simulationDataStore and uiStore via getState() snapshot only.
 *   - Dual-channel isolation: demoStore.messages[] is completely separate from
 *     cwfStore.messages[]. The CWF panel never sees demo messages.
 *   - All panel opens/closes happen synchronously (local uiStore calls) BEFORE
 *     the opening prompt API call — no round-trip delay for UI transitions.
 *
 * Used by: src/components/demo/DemoChatView.tsx, DemoActBreadcrumb.tsx, DemoScreen.tsx
 */

import { create } from 'zustand';

/** Demo configuration constants */
import {
    DEMO_API_ENDPOINT,
    DEMO_MAX_HISTORY_MESSAGES,
    DEMO_CLIENT_TIMEOUT_MS,
    DEMO_MESSAGE_ID_PREFIX,
    DEMO_FALLBACK_RESPONSE,
    DEMO_RESTART_SCENARIO,
    DEMO_FIRST_ACT_INDEX,
} from '../lib/params/demoSystem/demoConfig';

/** ARIA storyteller persona — injected as synthetic conversation seed */
import { DEMO_SYSTEM_PROMPT } from '../lib/params/demoSystem/demoSystemPrompt';

/** Declarative act config — the "sheet music" for the engine */
import { DEMO_ACTS } from '../lib/params/demoSystem/demoScript';
import type { DemoAct, UIPanel } from '../lib/params/demoSystem/demoScript';

/** Read-only simulation session data and scenario loader */
import { useSimulationDataStore } from './simulationDataStore';
/** Resolves a scenario code string to a full ScenarioDefinition object */
import { getScenarioByCode } from '../lib/scenarios';

/** uiStore — used ONLY for read-only getState() panel toggle calls */
import { useUIStore } from './uiStore';

// =============================================================================
// TYPES
// =============================================================================

/**
 * DemoMessage — a single message in the DemoScreen conversation thread.
 * Mirrors the shape of CWFMessage but kept entirely separate from cwfStore.
 */
export interface DemoMessage {
    /** Unique identifier, e.g. "demo-1708884000000-1" */
    id: string;
    /** Message author: user prompt, AI response, or system notification */
    role: 'user' | 'assistant' | 'system';
    /** Text content */
    content: string;
    /** ISO 8601 creation timestamp */
    timestamp: string;
    /** True while the assistant is generating its response */
    isStreaming?: boolean;
    /** True if this message represents an error condition */
    error?: boolean;
    /** Number of tool calls the AI made to generate this response */
    toolCallCount?: number;
    /** The act id that triggered this message, null for free-form input */
    actId?: string | null;
}

/**
 * DemoState — the full shape of the Zustand demo store.
 */
export interface DemoState {
    /** Ordered list of messages displayed in the DemoScreen chat thread */
    messages: DemoMessage[];
    /** True while the AI is generating a response */
    isLoading: boolean;
    /**
     * currentActIndex — the index (0-based) into DEMO_ACTS[] for the active act.
     * Starts at DEMO_FIRST_ACT_INDEX (act 0 = Welcome).
     */
    currentActIndex: number;

    // ── Actions ──────────────────────────────────────────────────────────────

    /**
     * advanceAct — move to the next act.
     * Applies panel actions, loads scenario, sends opening prompt to CWF.
     * No-op if already at the last act (prevents index overflow).
     */
    advanceAct: () => Promise<void>;

    /**
     * restartDemo — reset to act 0 (Welcome).
     * Closes all demo-opened panels, reloads DEMO_RESTART_SCENARIO, clears messages.
     */
    restartDemo: () => Promise<void>;

    /**
     * sendMessage — send free-form user text to CWF.
     * Routes response back to the demo thread, not the CWF panel.
     */
    sendMessage: (text: string) => Promise<void>;

    /** Clear the message thread (used internally by restartDemo) */
    clearMessages: () => void;
}

// =============================================================================
// HELPERS
// =============================================================================

/** Monotonic counter for unique message IDs within this session */
let demoMsgCounter = 0;

/**
 * generateDemoMessageId — creates a prefixed unique string ID.
 * Uses DEMO_MESSAGE_ID_PREFIX from demoConfig — no hardcoded strings.
 */
function generateDemoMessageId(): string {
    return `${DEMO_MESSAGE_ID_PREFIX}-${Date.now()}-${++demoMsgCounter}`;
}

/**
 * applyPanelActions — applies the panelActions array from a DemoAct
 * to the UI immediately via synchronous uiStore.getState() calls.
 *
 * Maps each UIPanel name to its corresponding uiStore toggle function.
 * 'open' = ensure visible, 'close' = ensure hidden.
 * Only toggles if the panel's current state differs from the desired state
 * to avoid redundant re-renders.
 */
function applyPanelActions(act: DemoAct): void {
    const ui = useUIStore.getState();

    for (const { panel, state } of act.panelActions) {
        const desired = state === 'open';

        /** Map UIPanel name → current visibility state and toggle function */
        const panelMap: Record<UIPanel, { current: boolean; toggle: () => void }> = {
            basicPanel: { current: ui.showBasicPanel, toggle: ui.toggleBasicPanel },
            dtxfr: { current: ui.showDTXFR, toggle: ui.toggleDTXFR },
            cwf: { current: ui.showCWF, toggle: ui.toggleCWF },
            controlPanel: { current: ui.showControlPanel, toggle: ui.toggleControlPanel },
            kpi: { current: ui.showKPI, toggle: ui.toggleKPI },
            heatmap: { current: ui.showHeatmap, toggle: ui.toggleHeatmap },
            passport: { current: ui.showPassport, toggle: ui.togglePassport },
            oeeHierarchy: { current: ui.showOEEHierarchy, toggle: ui.toggleOEEHierarchy },
        };

        const entry = panelMap[panel];
        if (entry && entry.current !== desired) {
            /** Only toggle if the current state differs from desired */
            entry.toggle();
        }
    }
}

/**
 * applyScenario — loads the act's scenario via simulationDataStore.
 * No-op if scenarioCode is null (act continues the current scenario).
 * Graceful no-op if no simulation is running.
 */
function applyScenario(scenarioCode: string | null): void {
    if (!scenarioCode) return;

    /** Resolve the short code to a full ScenarioDefinition — loadScenario requires the object */
    const definition = getScenarioByCode(scenarioCode);
    if (!definition) return;  // unknown code — silent no-op

    const simStore = useSimulationDataStore.getState();
    /** loadScenario exists on the simulationDataStore when the sim is running */
    if (typeof simStore.loadScenario === 'function') {
        simStore.loadScenario(definition);
    }
}

// =============================================================================
// SHARED API CALL — postToCWF
// =============================================================================

/**
 * postToCWF — internal helper for all API calls (advanceAct, sendMessage).
 *
 * Builds the payload with ARIA persona injected, per-act systemContext prepended,
 * POSTs to /api/cwf/chat, and updates the message list + loading state.
 *
 * @param text          - The prompt string to send (openingPrompt or user free-form)
 * @param actId         - Act id if triggered by act advance, null for free-form
 * @param systemContext - Per-act AI framing appended after DEMO_SYSTEM_PROMPT
 * @param get           - Zustand store getter
 * @param set           - Zustand store setter
 */
async function postToCWF(
    text: string,
    actId: string | null,
    systemContext: string,
    get: () => DemoState,
    set: (updater: Partial<DemoState> | ((s: DemoState) => Partial<DemoState>)) => void,
): Promise<void> {
    const { messages } = get();

    // ── Read simulation context ──────────────────────────────────────────────
    /**
     * getState() is synchronous — zero lag, no re-render triggered.
     * Never subscribes to or modifies simulationDataStore.
     */
    const simDataState = useSimulationDataStore.getState();
    const simulationId = simDataState.session?.id ?? null;
    const sessionCode = simDataState.session?.session_code ?? '';

    /** Require an active simulation */
    if (!simulationId) {
        set((s) => ({
            messages: [
                ...s.messages,
                {
                    id: generateDemoMessageId(),
                    role: 'system' as const,
                    content: '⚠️ No simulation running. Please start the simulation first, then continue the demo.',
                    timestamp: new Date().toISOString(),
                    error: true,
                },
            ],
        }));
        return;
    }

    // ── Append user message + streaming placeholder ─────────────────────────

    const userMsg: DemoMessage = {
        id: generateDemoMessageId(),
        role: 'user',
        content: text,
        timestamp: new Date().toISOString(),
        actId,
    };

    const placeholderId = generateDemoMessageId();
    const placeholder: DemoMessage = {
        id: placeholderId,
        role: 'assistant',
        content: '',
        timestamp: new Date().toISOString(),
        isStreaming: true,
    };

    set((s) => ({
        messages: [...s.messages, userMsg, placeholder],
        isLoading: true,
    }));

    try {
        // ── Build conversation history with ARIA persona seed ────────────────

        const recentHistory = messages
            .filter((m) => m.role !== 'system')
            .slice(-DEMO_MAX_HISTORY_MESSAGES)
            .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

        /**
         * Full system context = base ARIA persona + per-act framing.
         * Injected as a synthetic user→assistant exchange so Gemini treats it
         * as established context without any backend changes.
         */
        const fullSystemContext = systemContext
            ? `${DEMO_SYSTEM_PROMPT}\n\nACT-SPECIFIC CONTEXT:\n${systemContext}`
            : DEMO_SYSTEM_PROMPT;

        const conversationHistory = [
            { role: 'user' as const, content: fullSystemContext },
            {
                role: 'assistant' as const,
                content:
                    'Understood. I am ARIA in Demo Mode. ' +
                    'I will guide this presentation with warmth, clarity, and Socratic engagement.',
            },
            ...recentHistory,
        ];

        // ── POST to /api/cwf/chat ────────────────────────────────────────────

        const httpResponse = await fetch(DEMO_API_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: AbortSignal.timeout(DEMO_CLIENT_TIMEOUT_MS),
            body: JSON.stringify({
                message: text,
                simulationId,
                sessionCode,
                conversationHistory,
                language: 'en',
                simulationHistory: [],
            }),
        });

        if (!httpResponse.ok) {
            const errBody = await httpResponse.json().catch(() => ({}));
            throw new Error(
                (errBody as { error?: string; details?: string }).error ||
                (errBody as { error?: string; details?: string }).details ||
                `API error: ${httpResponse.status}`,
            );
        }

        const result = await httpResponse.json() as { response?: string; toolCallCount?: number };

        const safeReply: string = result.response?.trim()
            ? result.response
            : DEMO_FALLBACK_RESPONSE;

        /** Replace the streaming placeholder with the real response */
        set((s) => ({
            messages: s.messages.map((m) =>
                m.id === placeholderId
                    ? {
                        ...m,
                        content: safeReply,
                        toolCallCount: result.toolCallCount,
                        isStreaming: false,
                    }
                    : m,
            ),
            isLoading: false,
        }));

    } catch (error) {
        /** Replace placeholder with an error bubble */
        set((s) => ({
            messages: s.messages.map((m) =>
                m.id === placeholderId
                    ? {
                        ...m,
                        content: `❌ Error: ${(error as Error).message}`,
                        isStreaming: false,
                        error: true,
                    }
                    : m,
            ),
            isLoading: false,
        }));
    }
}

// =============================================================================
// STORE
// =============================================================================

/**
 * useDemoStore — the Narrative Demo System's Zustand store.
 *
 * Acts as the engine reading DEMO_ACTS[] declarative config and driving
 * all demo behaviour. Completely independent from cwfStore.
 */
export const useDemoStore = create<DemoState>((set, get) => ({
    /** Empty message thread on init */
    messages: [],
    /** Not loading on init */
    isLoading: false,
    /** Start at the first act (Welcome) */
    currentActIndex: DEMO_FIRST_ACT_INDEX,

    /** Clear the message thread */
    clearMessages: () => set({ messages: [] }),

    /**
     * advanceAct — the primary progression action.
     *
     * 1. Calculates the next act index (clamped to last act)
     * 2. Applies panel actions from the next act (local, synchronous)
     * 3. Loads the next act's scenario (if any)
     * 4. Updates currentActIndex in state
     * 5. Sends the act's openingPrompt to CWF
     */
    advanceAct: async () => {
        const { currentActIndex, isLoading } = get();

        /** Do not advance while a response is loading */
        if (isLoading) return;

        /** Clamp to the last act — no overflow */
        const nextIndex = Math.min(currentActIndex + 1, DEMO_ACTS.length - 1);

        /** No-op if already at the final act */
        if (nextIndex === currentActIndex && currentActIndex === DEMO_ACTS.length - 1) return;

        const nextAct = DEMO_ACTS[nextIndex];

        /** Apply panel actions immediately — no round-trip needed */
        applyPanelActions(nextAct);

        /** Load scenario — no-op if scenarioCode is null or sim not running */
        applyScenario(nextAct.scenarioCode);

        /** Update act index in state */
        set({ currentActIndex: nextIndex });

        /** Send the act opening prompt to CWF */
        await postToCWF(
            nextAct.openingPrompt,
            nextAct.id,
            nextAct.systemContext,
            get,
            set,
        );
    },

    /**
     * restartDemo — resets the entire demo to act 0.
     *
     * 1. Closes all panels that were opened during the demo
     * 2. Loads the restart scenario
     * 3. Clears the message thread
     * 4. Resets currentActIndex to 0
     * 5. Sends the welcome act's opening prompt
     */
    restartDemo: async () => {
        /** Close all panels that the demo engine may have opened */
        const ui = useUIStore.getState();
        const panelsToClose: { current: boolean; toggle: () => void }[] = [
            { current: ui.showBasicPanel, toggle: ui.toggleBasicPanel },
            { current: ui.showDTXFR, toggle: ui.toggleDTXFR },
            { current: ui.showCWF, toggle: ui.toggleCWF },
            { current: ui.showControlPanel, toggle: ui.toggleControlPanel },
            { current: ui.showKPI, toggle: ui.toggleKPI },
            { current: ui.showHeatmap, toggle: ui.toggleHeatmap },
            { current: ui.showPassport, toggle: ui.togglePassport },
            { current: ui.showOEEHierarchy, toggle: ui.toggleOEEHierarchy },
        ];
        /** Only close panels that are currently open */
        for (const p of panelsToClose) {
            if (p.current) p.toggle();
        }

        /** Load the restart scenario */
        applyScenario(DEMO_RESTART_SCENARIO);

        /** Reset state to initial */
        set({
            messages: [],
            isLoading: false,
            currentActIndex: DEMO_FIRST_ACT_INDEX,
        });

        /** Auto-send the welcome act opening prompt */
        const welcomeAct = DEMO_ACTS[DEMO_FIRST_ACT_INDEX];
        await postToCWF(
            welcomeAct.openingPrompt,
            welcomeAct.id,
            welcomeAct.systemContext,
            get,
            set,
        );
    },

    /**
     * sendMessage — sends free-form user input.
     * Uses the current act's systemContext so ARIA stays in-character.
     */
    sendMessage: async (text: string) => {
        const { currentActIndex } = get();
        const currentAct = DEMO_ACTS[currentActIndex];
        await postToCWF(
            text,
            null,
            currentAct.systemContext,
            get,
            set,
        );
    },
}));
