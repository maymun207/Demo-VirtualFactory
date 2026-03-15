/**
 * demoStore.ts — Demo System State Machine (Zustand)
 *
 * The engine that drives the Narrative Demo System. Manages:
 *   1. CONVERSATION THREAD  — DemoMessage[] isolated from cwfStore
 *   2. ACT STATE MACHINE    — currentActIndex, advanceAct, restartDemo, jumpToAct
 *   3. SLIDE / MEDIA STATE  — currentSlide, currentMediaInstruction, currentScreenText
 *   4. CTA STEP SEQUENCER  — ctaStepIndex, handleCtaClick
 *   5. PANEL CONTROL        — applies per-act and per-step panelActions via uiStore
 *   6. SCENARIO SWITCHING   — loads per-act scenarioCode via simulationDataStore
 *   7. API CALLS            — sends openingPrompt to /api/cwf/chat with ARIA persona
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
 * Used by: DemoSidePanel.tsx, DemoMediaView.tsx
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
    DEMO_ARIA_LOADING_TIMEOUT_MS,
} from '../lib/params/demoSystem/demoConfig';

/** ARIA storyteller persona — injected as synthetic conversation seed */
import { DEMO_SYSTEM_PROMPT } from '../lib/params/demoSystem/demoSystemPrompt';

/** Declarative act config — the "sheet music" for the engine */
import { DEMO_ACTS } from '../lib/params/demoSystem/demoScript';
import type { DemoAct, UIPanel, CtaStep, MediaInstruction } from '../lib/params/demoSystem/demoScript';

/** Read-only simulation session data and scenario loader */
import { useSimulationDataStore } from './simulationDataStore';
/** Resolves a scenario code string to a full ScenarioDefinition object */
import { getScenarioByCode } from '../lib/scenarios';

/** uiStore — used ONLY for read-only getState() panel toggle calls */
import { useUIStore } from './uiStore';

/** copilotStore — used ONLY for enable/disable calls triggered by the demo engine */
import { useCopilotStore } from './copilotStore';

/** simulationStore — needed to execute simulation actions (start/stop/reset) */
import { useSimulationStore } from './simulationStore';

/** executeSimulationAction — extracted utility for sim lifecycle control */
import { executeSimulationAction } from '../lib/utils/simActionExecutor';

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
    /** When set, message renders as a full-width slide image instead of text */
    imageUrl?: string;
}

/**
 * DemoState — the full shape of the Zustand demo store.
 */
export interface DemoState {
    /** Ordered list of messages displayed in the DemoScreen chat thread */
    messages: DemoMessage[];
    /** True while the AI is generating a response (ARIA API call in-flight) */
    isLoading: boolean;
    /**
     * currentActIndex — the index (0-based) into DEMO_ACTS[] for the active act.
     * Starts at DEMO_FIRST_ACT_INDEX (act 0 = Welcome).
     */
    currentActIndex: number;
    /**
     * currentSlide — URL of the slide currently shown in DemoMediaView.
     * Written by handleCtaClick; NOT cleared on advanceAct (persists as a bridge
     * slide until the next act's ctaStep sets a new slideImageUrl).
     * Cleared by jumpToAct (non-linear nav) and restartDemo.
     * Ignored when currentMediaInstruction is also set.
     */
    currentSlide: string | null;
    /**
     * currentMediaInstruction — active media instruction for the current step.
     * When set, DemoMediaView renders a dynamic chart/viz instead of the slide image.
     * Written by handleCtaClick (step.mediaInstruction); cleared on every act transition.
     */
    currentMediaInstruction: MediaInstruction | null;
    /**
     * currentScreenText — plain text shown as an overlay on the demo screen surface.
     * Written by handleCtaClick after delayMs (if set). Cleared on act transition.
     */
    currentScreenText: string | null;
    /**
     * ctaStepIndex — number of CTA clicks consumed within the current act.
     * When < ctaSteps.length: next click executes ctaSteps[ctaStepIndex].
     * When >= ctaSteps.length: no more steps (last step should set transitionTo).
     */
    ctaStepIndex: number;
    /**
     * isCtaExecuting — true while handleCtaClick is running (including any delayMs sleep).
     *
     * Distinct from isLoading (which only covers ARIA API calls).
     * Prevents the race condition where rapid clicks during a delayMs sleep would each
     * capture the same ctaStepIndex, execute the same step multiple times, and cause
     * later steps to be skipped.
     * The CTA button is disabled when EITHER isLoading OR isCtaExecuting is true.
     */
    isCtaExecuting: boolean;

    // ── Actions ──────────────────────────────────────────────────────────────

    /**
     * handleCtaClick — the single action called by the CTA button in DemoSidePanel.
     * Steps through ctaSteps[] one per click and applies each field in sequence:
     *   1. panelActions  — toggle panels open/close immediately
     *   2. scenarioCode  — load scenario
     *   3. simulationAction — control simulation lifecycle
     *   4. slideImageUrl — show slide on screen
     *   5. delayMs + screenText — wait then show text on screen
     *   6. ariaLocal — inject local ARIA bubble (no API)
     *   7. ariaApi   — send to CWF API
     *   8. transitionTo — navigate to next/named act
     */
    handleCtaClick: () => Promise<void>;

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

    /**
     * jumpToAct — jump directly to a specific act by index.
     * Used by the sidebar LED list so the presenter can navigate non-linearly.
     * Clears the message thread, applies panel actions for the target act,
     * loads the target act's scenario, then sends its opening prompt.
     *
     * @param targetIndex — zero-based index into DEMO_ACTS[]. Clamped to valid range.
     */
    jumpToAct: (targetIndex: number) => Promise<void>;

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
 * applyActPanelActions — applies the panelActions array from a DemoAct
 * to the UI immediately via synchronous uiStore.getState() calls.
 *
 * Maps each UIPanel name to its corresponding uiStore toggle function.
 * 'open' = ensure visible, 'close' = ensure hidden.
 * Only toggles if the panel's current state differs from the desired state
 * to avoid redundant re-renders.
 */
function applyActPanelActions(act: DemoAct): void {
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
 * applyStepPanelActions — applies the panelActions array from a CtaStep
 * to the UI. Same logic as applyActPanelActions but accepts a step's
 * panelActions array directly (CtaStep.panelActions[] vs DemoAct.panelActions[]).
 */
function applyStepPanelActions(panelActions: CtaStep['panelActions']): void {
    if (!panelActions?.length) return;
    const ui = useUIStore.getState();

    for (const { panel, state } of panelActions) {
        const desired = state === 'open';
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
        if (entry && entry.current !== desired) entry.toggle();
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

/**
 * applyCopilotEnable — called when an act has enableCopilot: true.
 *
 * Enables the Copilot locally (copilotStore) and calls the server-side
 * enable endpoint so the CWF server begins its autonomous polling loop.
 * Uses the simulation UUID (simulationDataStore.session?.id) — the single
 * source of truth for all Supabase-keyed operations.
 *
 * Fire-and-forget: errors are suppressed so they never break the demo flow.
 */
async function applyCopilotEnable(): Promise<void> {
    /** Read the session UUID — required by the enable endpoint */
    const simulationId = useSimulationDataStore.getState().session?.id ?? null;

    /** Enable Copilot in the local Zustand store immediately so the UI reacts */
    useCopilotStore.getState().enableCopilot();

    /** Only make the server call if we have a valid session UUID */
    if (!simulationId) {
        console.warn('[Demo] applyCopilotEnable: no simulation session — skipping server call');
        return;
    }

    /** Call the same copilot enable endpoint the CWF toggle button uses */
    fetch('/api/cwf/copilot/enable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ simulationId }),
    }).catch((err) => {
        /** Log but do not throw — demo must continue even if the server is slow */
        console.error('[Demo] applyCopilotEnable: server call failed', err);
    });
}

/** sleep — resolves after `ms` milliseconds. Used for delayMs in CtaStep. */
const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

/**
 * postToCWF — internal helper for all API calls (advanceAct, sendMessage, ariaApi steps).
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

    /**
     * Safety timeout — re-enables the CTA button after DEMO_ARIA_LOADING_TIMEOUT_MS
     * even if the ARIA API call is still in-flight. Ensures the presenter is never
     * permanently stuck because of a slow network. The fetch() continues after this fires.
     */
    const safetyTimerId = setTimeout(() => {
        if (get().isLoading) {
            set({ isLoading: false });
            console.warn('[Demo] postToCWF: safety timeout — CTA re-enabled');
        }
    }, DEMO_ARIA_LOADING_TIMEOUT_MS);

    try {
        // ── Build conversation history with ARIA persona seed ────────────────

        const recentHistory = messages
            .filter((m) => m.role !== 'system')
            .slice(-DEMO_MAX_HISTORY_MESSAGES)
            .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

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
    } finally {
        clearTimeout(safetyTimerId);
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
    /** No slide shown until presenter clicks CTA */
    currentSlide: null,
    /** No dynamic chart/viz on init */
    currentMediaInstruction: null,
    /** No screen text on init */
    currentScreenText: null,
    /** CTA step counter — 0 means no clicks yet within this act */
    ctaStepIndex: 0,
    /** isCtaExecuting — false until handleCtaClick acquires the lock */
    isCtaExecuting: false,

    /** Clear the message thread */
    clearMessages: () => set({ messages: [] }),

    /**
     * handleCtaClick — executes the next CtaStep for the current act.
     *
     * Each act defines an ordered ctaSteps[] array. This function reads the
     * step at ctaStepIndex and applies every field in sequence:
     *   1. panelActions    — toggle panels open/close immediately
     *   2. scenarioCode    — load scenario
     *   3. simulationAction — control simulation lifecycle
     *   4. slideImageUrl   — show slide on screen
     *   4b. mediaInstruction — show dynamic chart/viz (replaces slide)
     *   5. delayMs + screenText — wait then show text on screen
     *   6. ariaLocal       — inject local ARIA bubble (no API)
     *   7. increment ctaStepIndex
     *   8. ariaApi         — send to CWF API
     *   9. transitionTo    — navigate to next/named act
     *
     * RACE CONDITION GUARD:
     *   isCtaExecuting is set to true at the start and released in finally.
     *   This prevents rapid clicks from executing the same step multiple times
     *   during a delayMs sleep (which doesn't disable isLoading).
     */
    handleCtaClick: async () => {
        // Dual-lock: isLoading covers ARIA API calls; isCtaExecuting covers the
        // full handleCtaClick body including any delayMs sleep.
        if (get().isLoading || get().isCtaExecuting) return;

        // Acquire the execution lock — released unconditionally in the finally block.
        set({ isCtaExecuting: true });

        try {
            const { currentActIndex, ctaStepIndex } = get();
            const act   = DEMO_ACTS[currentActIndex];
            const steps = act.ctaSteps ?? [];
            const step: CtaStep | undefined = steps[ctaStepIndex];

            // No more steps — nothing to do (lock released by finally)
            if (!step) return;

            /** ── 1. Panel actions ──────────────────────────────── */
            applyStepPanelActions(step.panelActions);

            /** ── 2. Scenario load ──────────────────────────────── */
            if (step.scenarioCode) {
                applyScenario(step.scenarioCode);
            }

            /** ── 3. Simulation action ──────────────────────────── */
            if (step.simulationAction) {
                executeSimulationAction(step.simulationAction, useSimulationStore.getState());
            }

            /** ── 4. Slide image ──────────────────────────────────── */
            if (step.slideImageUrl && !step.mediaInstruction) {
                set({ currentSlide: step.slideImageUrl });
            }

            /** ── 4b. Media instruction (dynamic chart/viz) ──────── */
            if (step.mediaInstruction) {
                set({ currentMediaInstruction: step.mediaInstruction, currentSlide: null });
            }

            /** ── 5. Delayed screen text ────────────────────────── */
            if (step.screenText) {
                if (step.delayMs && step.delayMs > 0) {
                    // Lock is held during this sleep — rapid clicks are ignored.
                    await sleep(step.delayMs);
                }
                set({ currentScreenText: step.screenText });
            }

            /** ── 6. ARIA local bubble ──────────────────────────── */
            if (step.ariaLocal?.trim()) {
                const msgId = generateDemoMessageId();
                set((s) => ({
                    messages: [
                        ...s.messages,
                        {
                            id: msgId,
                            role: 'assistant' as const,
                            content: step.ariaLocal!,
                            timestamp: new Date().toISOString(),
                            actId: act.id,
                        },
                    ],
                }));
            }

            /** ── 7. Increment step index ───────────────────────── */
            set({ ctaStepIndex: ctaStepIndex + 1 });

            /** ── 8. ARIA API call ──────────────────────────────── */
            if (step.ariaApi?.trim()) {
                await postToCWF(step.ariaApi, act.id, act.systemContext, get, set);
            }

            /** ── 9. Transition ─────────────────────────────────── */
            if (step.transitionTo === 'next') {
                await get().advanceAct();
            } else if (step.transitionTo) {
                const targetIdx = DEMO_ACTS.findIndex(a => a.id === step.transitionTo);
                if (targetIdx >= 0) await get().jumpToAct(targetIdx);
            }
        } finally {
            // Always release the execution lock, even if an error or early return occurs.
            // This ensures the CTA button never becomes permanently stuck disabled.
            set({ isCtaExecuting: false });
        }
    },

    /**
     * advanceAct — the primary act progression action.
     *
     * 1. Calculates the next act index (clamped to last act)
     * 2. Applies panel actions from the next act (local, synchronous)
     * 3. Loads the next act's scenario (if any)
     * 4. Updates currentActIndex in state
     * 5. Resets ctaStepIndex, currentMediaInstruction, currentScreenText
     * 6. Does NOT reset currentSlide — the bridge slide from the last step of the
     *    outgoing act persists until the first ctaStep of the new act sets a new one.
     *    (jumpToAct DOES clear currentSlide because non-linear nav should start fresh.)
     * 7. Sends the act's openingPrompt to CWF
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
        applyActPanelActions(nextAct);

        /** Load scenario — no-op if scenarioCode is null or sim not running */
        applyScenario(nextAct.scenarioCode);

        /**
         * Auto-enable Copilot if this act requests it (Autonomous AI act).
         * Fire-and-forget — does not block the opening prompt.
         */
        if (nextAct.enableCopilot === true) {
            void applyCopilotEnable();
        }

        /**
         * Update act index and reset per-act transient state.
         *
         * NOTE: currentSlide is intentionally NOT reset here.
         * A step with both slideImageUrl and transitionTo:'next' would have its slide
         * immediately cleared if we included currentSlide:null here — React would
         * never render it. The slide from the last step of the outgoing act acts as a
         * "bridge" visual into the new act, replaced naturally by the new act's first CTA.
         * jumpToAct() DOES clear currentSlide for non-linear presenter navigation.
         */
        set({
            currentActIndex: nextIndex,
            currentMediaInstruction: null,
            currentScreenText: null,
            ctaStepIndex: 0,
        });

        /** Send the act opening prompt to CWF — skip if prompt is blank */
        if (nextAct.openingPrompt?.trim()) {
            await postToCWF(
                nextAct.openingPrompt,
                nextAct.id,
                nextAct.systemContext,
                get,
                set,
            );
        }
    },

    /**
     * restartDemo — resets the entire demo to act 0.
     *
     * 1. Closes all panels that were opened during the demo
     * 2. Disables Copilot if it was active (Autonomous AI act cleanup)
     * 3. Loads the restart scenario (SCN-001 baseline)
     * 4. Clears the message thread and resets all state to initial
     *
     * NOTE: We intentionally do NOT auto-send the welcome opening prompt here.
     * applyScenario() calls loadScenario() which tears down and recreates the
     * simulation session — at the moment postToCWF would fire, session?.id is
     * transiently null, causing a "No simulation running" error message.
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

        /**
         * Disable Copilot if it was enabled by the Autonomous AI act.
         * This ensures a clean slate when the demo restarts.
         * Fire-and-forget — does not block the restart flow.
         */
        const copilot = useCopilotStore.getState();
        if (copilot.isEnabled) {
            copilot.disableCopilot();
            const simulationId = useSimulationDataStore.getState().session?.id ?? null;
            if (simulationId) {
                fetch('/api/cwf/copilot/disable', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ simulationId }),
                }).catch((err) => {
                    console.error('[Demo] restartDemo: copilot disable server call failed', err);
                });
            }
        }

        /** Load the restart scenario */
        applyScenario(DEMO_RESTART_SCENARIO);

        /** Reset all state to initial */
        set({
            messages: [],
            isLoading: false,
            currentActIndex: DEMO_FIRST_ACT_INDEX,
            currentSlide: null,
            currentMediaInstruction: null,
            currentScreenText: null,
            ctaStepIndex: 0,
            isCtaExecuting: false,
        });
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

    /**
     * jumpToAct — directly navigate to any act by index.
     *
     * Called when the presenter clicks an LED in DemoSidePanel.
     * Allows non-linear navigation: backwards or skipping forward.
     *
     * Steps:
     *   1. Clamp targetIndex to valid range (0..DEMO_ACTS.length-1)
     *   2. Guard against jumping to the currently active act while loading
     *   3. Clear the message thread so the new act starts clean
     *   4. Apply panel actions for the target act (synchronous, instant)
     *   5. Load the target act's scenario (if any)
     *   6. Update currentActIndex
     *   7. Send the target act's opening prompt to CWF
     *
     * @param targetIndex - zero-based index into DEMO_ACTS[]. Clamped to valid range.
     */
    jumpToAct: async (targetIndex: number) => {
        const { isLoading } = get();

        /** Block navigation while a response is in-flight */
        if (isLoading) return;

        /** Clamp to the valid range — prevents out-of-bounds */
        const clampedIndex = Math.max(0, Math.min(targetIndex, DEMO_ACTS.length - 1));

        const targetAct = DEMO_ACTS[clampedIndex];

        /** Clear message thread, slide, and reset CTA sequencer — new act starts fresh */
        set({
            messages: [],
            currentActIndex: clampedIndex,
            currentSlide: null,
            currentMediaInstruction: null,
            currentScreenText: null,
            ctaStepIndex: 0,
        });

        /** Apply panel actions for the target act (local, instant) */
        applyActPanelActions(targetAct);

        /** Load the target act's scenario if specified */
        applyScenario(targetAct.scenarioCode);

        /**
         * Auto-enable Copilot as needed.
         * Only the Autonomous AI act (act 5) requests this.
         */
        if (targetAct.enableCopilot === true) {
            void applyCopilotEnable();
        }

        /** Send the target act's opening prompt to CWF — skip if prompt is blank */
        if (targetAct.openingPrompt?.trim()) {
            await postToCWF(
                targetAct.openingPrompt,
                targetAct.id,
                targetAct.systemContext,
                get,
                set,
            );
        }
    },
}));
