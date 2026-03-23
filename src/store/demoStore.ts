/**
 * demoStore.ts — Demo System State Machine (Zustand)
 *
 * The engine that drives the Narrative Demo System. Manages:
 *   1. CONVERSATION THREAD  — DemoMessage[] isolated from cwfStore
 *   2. ACT STATE MACHINE    — currentActIndex, advanceAct, restartDemo, jumpToAct
 *   3. SLIDE / MEDIA STATE  — currentSlide, currentMediaInstruction, currentScreenText
 *   4. CTA STEP SEQUENCER  — currentStepIndex, enterStep, userAdvance
 *   5. PANEL CONTROL        — applies per-act and per-step panelActions via uiStore
 *   6. SCENARIO SWITCHING   — loads per-act scenarioCode via simulationDataStore
 *   7. API CALLS            — sends openingPrompt to /api/cwf/chat with ARIA persona
 *
 * PHASE-BASED EXECUTION MODEL:
 *   Each CtaStep now executes across multiple phases instead of a single click:
 *
 *   Phase 1 (auto on step load): ctaLabel → slide → scenario → delayMs
 *   Phase 2 (auto after 1):      screenText tokens processed (<cls>,<clmi>,<w:N>,<MI>,<clck>)
 *                                 → if no <clck> and has screenText: WAITS for user click
 *                                 → if <clck> found: auto-advances to Phase 3
 *                                 → if no screenText: immediately proceeds to Phase 3
 *   Phase 3 (user click or <clck>): ARIA Local tokens → ARIA API call
 *   Phase 4 (auto after API response): ariaInputEnabled → panelActions → simActions
 *                                      → WAITS for user click
 *   Phase 5 (user click): transitionTo fires (next step, next act, or named act)
 *
 *   Inline commands <cls>,<clmi>,<w:N>,<MI>,<clck> are parsed by commandParser.ts.
 *   mediaInstruction is ONLY activated via explicit <MI> command (no longer auto-runs).
 *
 * Architecture:
 *   - Calls /api/cwf/chat directly — the SAME endpoint as the CWF panel.
 *   - Does NOT import or mutate cwfStore or cwfService.
 *   - Reads simulationDataStore and uiStore via getState() snapshot only.
 *   - Dual-channel isolation: demoStore.messages[] is completely separate from
 *     cwfStore.messages[]. The CWF panel never sees demo messages.
 *   - All panel opens/closes happen synchronously (local uiStore calls).
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
import { createLogger } from '../lib/logger';

/** Module-level logger for demo store operations. */
const log = createLogger('Demo');

/** Inline command parser — tokenises screenText and ARIA Local fields */
import { parseCommands, executeTokens } from '../lib/utils/commandParser';


/** Declarative act config — the "sheet music" for the engine */
import { DEMO_ACTS } from '../lib/params/demoSystem/demoScript';
import { resolveText } from '../lib/params/demoSystem/demoScript';
import type { DemoAct, UIPanel, CtaStep, MediaInstruction, ScreenTextAlign, ScreenTextWeight, ScreenTextSize } from '../lib/params/demoSystem/demoScript';

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

/** workOrderStore — needed to switch work orders from CtaStep.workOrderId */
import { useWorkOrderStore } from './workOrderStore';

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

// ─── Demo Phase ───────────────────────────────────────────────────────────────

/**
 * DemoPhase — tracks which execution phase the current step is in.
 *
 * State transitions:
 *   idle             → content (when enterStep() is called)
 *   content          → awaiting-click   (screenText done, waiting for user)
 *   content          → aria             (auto, when no screenText or <clck> hit)
 *   awaiting-click   → aria             (on userAdvance() call)
 *   aria             → awaiting-transition (ARIA+post-ARIA complete)
 *   awaiting-transition → (next step or act loaded via enterStep or jumpToAct)
 */
export type DemoPhase =
    | 'idle'                  // No step loaded yet (initial state)
    | 'content'               // Auto-executing: slide, scenario, delayMs, screenText
    | 'awaiting-click'        // Paused after screenText, waiting for user click
    | 'aria'                  // Auto-executing: ARIA Local + ARIA API
    | 'awaiting-transition';  // Post-ARIA done; waiting for click to fire transitionTo

// ─── DemoState ────────────────────────────────────────────────────────────────

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
     * Written by enterStep when slide is set by slideImageUrl.
     * Ignored when currentMediaInstruction is also set.
     */
    currentSlide: string | null;
    /**
     * currentMediaInstruction — active media instruction for the current step.
     * When set, DemoMediaView renders a dynamic chart/viz instead of the slide image.
     * Activated ONLY via explicit <MI> command in screenText or ARIA Local.
     * Cleared on every act transition or by <clmi> command.
     */
    currentMediaInstruction: MediaInstruction | null;
    /**
     * currentScreenText — plain text shown as an overlay on the demo screen surface.
     * Written incrementally by the screenText token processor. Cleared on act transition.
     */
    currentScreenText: string | null;
    /** Text alignment for the current screenText. Default: 'center'. */
    currentScreenTextAlign: ScreenTextAlign;
    /** Font weight for the current screenText. Default: 'bold'. */
    currentScreenTextWeight: ScreenTextWeight;
    /** Font size preset for the current screenText. Default: 'lg'. */
    currentScreenTextSize: ScreenTextSize;
    /** Text alignment for the current ariaLocal chat bubbles. Default: 'left'. */
    currentAriaLocalAlign: ScreenTextAlign;
    /** Font weight for the current ariaLocal chat bubbles. Default: 'normal'. */
    currentAriaLocalWeight: ScreenTextWeight;
    /** Font size preset for the current ariaLocal chat bubbles. Default: 'md'. */
    currentAriaLocalSize: ScreenTextSize;
    /**
     * currentStepIndex — which CtaStep within the current act is active.
     * Replaces ctaStepIndex. Managed by enterStep() and userAdvance().
     */
    currentStepIndex: number;
    /**
     * demoPhase — which execution phase the current step is in.
     * Determines what happens when the user clicks the CTA button.
     * The CTA button is active (clickable) only during 'awaiting-click' and
     * 'awaiting-transition' phases.
     */
    demoPhase: DemoPhase;
    /**
     * isCtaExecuting — true while an async phase is running.
     * Prevents the CTA button from being pressed during auto-executing phases.
     * Kept for backward compatibility with existing DemoSidePanel.tsx checks.
     */
    isCtaExecuting: boolean;
    /**
     * ctaStepIndex — alias for currentStepIndex, kept for backward compatibility
     * with existing tests and components that read this field.
     * @deprecated Use currentStepIndex instead.
     */
    ctaStepIndex: number;

    // ── Actions ──────────────────────────────────────────────────────────────

    /**
     * enterStep — loads a specific step and auto-executes Phase 1 + Phase 2.
     *
     * Called automatically when:
     *   - The demo starts (act 0, step 0)
     *   - A transitionTo fires (new act or step within same act)
     *   - advanceAct() or jumpToAct() complete
     *
     * Phase 1 (auto): ctaLabel updates button → slideImageUrl shown → scenario loaded
     *                 → delayMs waited
     * Phase 2 (auto): screenText tokens processed (<cls>,<clmi>,<w:N>,<MI>,<clck>)
     *   → hits <clck>: immediately proceed to Phase 3 (ARIA)
     *   → no <clck>, has text: sets demoPhase='awaiting-click', waits for userAdvance()
     *   → no screenText: immediately proceed to Phase 3 (ARIA)
     *
     * @param actIndex  - Index into DEMO_ACTS[]
     * @param stepIndex - Index into act.ctaSteps[]
     */
    enterStep: (actIndex: number, stepIndex: number) => Promise<void>;

    /**
     * userAdvance — called by the CTA button click.
     *
     * Behaviour depends on current demoPhase:
     *   'awaiting-click'       → triggers Phase 3 (ARIA Local + API)
     *   'awaiting-transition'  → fires transitionTo:
     *                            'next' → advanceAct()
     *                            act-id → jumpToAct(idx)
     *                            'stay' / null → advance to next step in same act
     *                            last step + stay → do nothing
     *   other phases           → no-op (button is disabled in these phases)
     */
    userAdvance: () => Promise<void>;

    /**
     * handleCtaClick — backward-compatible alias for userAdvance().
     * Kept so existing code calling handleCtaClick() continues to work
     * without changes during the transition period.
     */
    handleCtaClick: () => Promise<void>;

    /**
     * advanceAct — move to the next act.
     * Applies panel actions, loads scenario, sends opening prompt to CWF,
     * then calls enterStep(nextActIndex, 0).
     * No-op if already at the last act.
     */
    advanceAct: () => Promise<void>;

    /**
     * restartDemo — reset to act 0 (Welcome).
     * Closes all demo-opened panels, reloads DEMO_RESTART_SCENARIO, clears messages,
     * then calls enterStep(0, 0).
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
     * loads the target act's scenario, then calls enterStep(targetIndex, 0).
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
        log.warn('applyCopilotEnable: no simulation session — skipping server call');
        return;
    }

    /** Call the same copilot enable endpoint the CWF toggle button uses */
    fetch('/api/cwf/copilot/enable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ simulationId }),
    }).catch((err) => {
        /** Log but do not throw — demo must continue even if the server is slow */
        log.error('applyCopilotEnable: server call failed', err);
    });
}

/** sleep — resolves after `ms` milliseconds. Used for delayMs in CtaStep. */
const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

/**
 * sanitizeScreenText — cleans up a screenText value before displaying it on
 * the demo screen surface.
 *
 * Two common authoring mistakes handled:
 *
 *   1. Surrounding quotes: when text is written in demoScript.ts as
 *      `'Some text'` (with literal quote characters included in the string
 *      value), they appear verbatim. This strips one leading/trailing
 *      single or double quote if they form a matched pair.
 *
 *   2. Literal \n sequences: the demo screen uses `whitespace-pre-wrap` so
 *      real newline characters (\n) render as line breaks. But if the author
 *      wrote the escape sequence as two characters (backslash + n) rather
 *      than a real newline, it shows as "\n" on screen. This replaces every
 *      literal backslash-n with a real newline character.
 *
 * @param text - Raw screenText value from CtaStep
 * @returns Cleaned text ready for display
 */
function sanitizeScreenText(text: string): string {
    /** Step 1: replace any literal two-character "\n" (backslash + n) with a
     *  real newline so whitespace-pre-wrap renders line breaks correctly. */
    let cleaned = text.replace(/\\n/g, '\n');

    /** Step 2: strip one matching pair of surrounding single or double quotes.
     *  Only removes them when both the opening and closing character match,
     *  so normal apostrophes inside body text are not affected. */
    if (
        (cleaned.startsWith("'") && cleaned.endsWith("'")) ||
        (cleaned.startsWith('"') && cleaned.endsWith('"'))
    ) {
        cleaned = cleaned.slice(1, -1);
    }

    return cleaned;
}

/**
 * postToCWF — internal helper for all API calls (advanceAct, sendMessage, ariaApi steps).
 *
 * Builds the payload with ARIA persona injected, per-act systemContext prepended,
 * POSTs to /api/cwf/chat, and updates the message list + loading state.
 *
 * @param text          - The prompt string to send (openingPrompt or user free-form)
 * @param actId         - Act id if triggered by act advance, null for free-form
 * @param systemContext - Per-act narrative framing sent as narrativeContext to the server
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
            log.warn('postToCWF: safety timeout — CTA re-enabled');
        }
    }, DEMO_ARIA_LOADING_TIMEOUT_MS);

    try {
        // ── Build clean conversation history (real messages only) ────────────
        // The ARIA persona seed is NO LONGER injected here. The server-side
        // demo-chat.ts receives narrativeContext as a separate field and
        // injects it into Gemini's systemInstruction — not the conversation.

        const recentHistory = messages
            .filter((m) => m.role !== 'system')
            .slice(-DEMO_MAX_HISTORY_MESSAGES)
            .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

        const conversationHistory = [
            ...recentHistory,
        ];

        // ── Build minimal UI context snapshot ────────────────────────────────
        /**
         * uiContext is injected into the server-side Gemini system prompt so ARIA
         * has situational awareness of the current simulation state.
         * Uses the same pattern as cwfStore.sendMessage() but with only the fields
         * that the demo API endpoint needs (simulation status + config language).
         */
        const simState = useSimulationStore.getState();
        const uiState = useUIStore.getState();
        const uiContext = {
            /** Active simulation tick count and running state */
            simulation: {
                isRunning: simState.isDataFlowing,
                sClockCount: simState.sClockCount,
            },
            /** Interface config snapshot */
            config: {
                language: useUIStore.getState().currentLang,
                isSimConfigured: uiState.isSimConfigured,
            },
        };

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
                language: useUIStore.getState().currentLang,
                narrativeContext: systemContext || '',
                uiContext,
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
    /** No slide shown on init */
    currentSlide: null,
    /** No dynamic chart/viz on init */
    currentMediaInstruction: null,
    /** No screen text on init */
    currentScreenText: null,
    currentScreenTextAlign: 'center' as ScreenTextAlign,
    currentScreenTextWeight: 'bold' as ScreenTextWeight,
    currentScreenTextSize: 'lg' as ScreenTextSize,
    currentAriaLocalAlign: 'left' as ScreenTextAlign,
    currentAriaLocalWeight: 'normal' as ScreenTextWeight,
    currentAriaLocalSize: 'md' as ScreenTextSize,
    /** No step loaded yet */
    currentStepIndex: 0,
    /** ctaStepIndex — backward-compat alias for currentStepIndex */
    ctaStepIndex: 0,
    /** Start in idle phase — enterStep() transitions to 'content' */
    demoPhase: 'idle' as DemoPhase,
    /** Not executing on init */
    isCtaExecuting: false,

    /** Clear the message thread */
    clearMessages: () => set({ messages: [] }),

    /**
     * enterStep — auto-executes Phase 1 + Phase 2 for the given act/step.
     *
     * Phase 1 (always runs):
     *   - Updates ctaLabel on the button (via currentStepIndex)
     *   - Shows the slideImageUrl (if set; note: mediaInstruction is NOT auto-applied)
     *   - Loads the scenarioCode (if set)
     *   - Waits delayMs (if set)
     *
     * Phase 2 (screenText token processing):
     *   - Walks tokenised screenText: text → append, <cls> → clear, <clmi> → clearMI,
     *     <w:N> → wait, <MI> → show MI, <clck> → soft click (triggers Phase 3)
     *   - If <clck> found → immediately executes Phase 3 (ARIA)
     *   - If no screenText → immediately executes Phase 3 (ARIA)
     *   - If screenText ends without <clck> → demoPhase='awaiting-click', wait for user
     */
    enterStep: async (actIndex: number, stepIndex: number) => {
        /** Guard: reject if another phase is already running */
        if (get().isCtaExecuting) return;

        set({ isCtaExecuting: true, demoPhase: 'content' as DemoPhase });

        try {
            const act = DEMO_ACTS[actIndex];
            if (!act) return;
            const steps = act.ctaSteps ?? [];
            const step: CtaStep | undefined = steps[stepIndex];

            /** Update step index — drives ctaLabel on the CTA button */
            set({
                currentActIndex: actIndex,
                currentStepIndex: stepIndex,
                ctaStepIndex: stepIndex,
                currentScreenTextAlign: (step?.screenTextAlign ?? 'center') as ScreenTextAlign,
                currentScreenTextWeight: (step?.screenTextWeight ?? 'bold') as ScreenTextWeight,
                currentScreenTextSize: (step?.screenTextSize ?? 'lg') as ScreenTextSize,
                currentAriaLocalAlign: (step?.ariaLocalAlign ?? 'left') as ScreenTextAlign,
                currentAriaLocalWeight: (step?.ariaLocalWeight ?? 'normal') as ScreenTextWeight,
                currentAriaLocalSize: (step?.ariaLocalSize ?? 'md') as ScreenTextSize,
            });

            if (!step) {
                /** No step at this index — enter idle phase */
                set({ demoPhase: 'idle' as DemoPhase, isCtaExecuting: false });
                return;
            }

            // ── Phase 1: Setup ────────────────────────────────────────────────

            /** Show the slideImageUrl (mediaInstruction is NOT auto-applied) */
            if (step.slideImageUrl) {
                set({ currentSlide: step.slideImageUrl, currentMediaInstruction: null });
            } else {
                /** No slide selected — clear the screen */
                set({ currentSlide: null });
            }

            /** Load the scenario if specified */
            if (step.scenarioCode) {
                applyScenario(step.scenarioCode);
            }

            /** Switch the active Work Order if specified */
            if (step.workOrderId) {
                useWorkOrderStore.getState().setSelectedWorkOrderId(step.workOrderId);
            }

            /** Wait delayMs before showing screen text */
            if (step.delayMs && step.delayMs > 0) {
                await sleep(step.delayMs);
            }

            // ── Phase 2: ScreenText token processing ──────────────────────────

            const lang = useUIStore.getState().currentLang;
            const resolvedScreenText = resolveText(step.screenText, lang);

            if (!resolvedScreenText) {
                /** No screenText → proceed directly to ARIA phase (Phase 3) */
                set({ isCtaExecuting: false });
                /** Call enterAriaPhase via the concrete store instance — not in DemoState type */
                await (useDemoStore.getState() as unknown as { enterAriaPhase: (a: number, s: number) => Promise<void> }).enterAriaPhase(actIndex, stepIndex);
                return;
            }

            /** Parse the screenText into typed tokens */
            const tokens = parseCommands(sanitizeScreenText(resolvedScreenText));

            /** Walk the tokens, updating screen state for each one */
            const { hitClick } = await executeTokens(tokens, {
                onText: (value) => {
                    /** Append text to whatever is already on screen */
                    set((s) => ({
                        currentScreenText: (s.currentScreenText ?? '') + value,
                    }));
                },
                onClear: () => {
                    /** <cls> — clear entire demo screen: slide + text overlay + chart + ARIA thread */
                    set({ currentSlide: null, currentScreenText: null, currentMediaInstruction: null, messages: [] });
                },
                onClearMI: () => {
                    /** <clmi> — remove the active media instruction */
                    set({ currentMediaInstruction: null });
                },
                onWait: async (ms) => {
                    /** <w:N> — pause for N milliseconds */
                    await sleep(ms);
                },
                onShowMI: () => {
                    /** <MI> — activate the step's mediaInstruction */
                    if (step.mediaInstruction) {
                        set({ currentMediaInstruction: step.mediaInstruction, currentSlide: null });
                    }
                },
            });

            if (hitClick) {
                /** <clck> was found — soft-click fires the ARIA phase immediately */
                set({ isCtaExecuting: false });
                /** Call enterAriaPhase via the concrete store instance — not in DemoState type */
                await (useDemoStore.getState() as unknown as { enterAriaPhase: (a: number, s: number) => Promise<void> }).enterAriaPhase(actIndex, stepIndex);
            } else {
                /** No <clck> — pause and wait for user's physical click */
                set({ demoPhase: 'awaiting-click' as DemoPhase, isCtaExecuting: false });
            }

        } catch (err) {
            log.error('enterStep error:', err);
            set({ demoPhase: 'idle' as DemoPhase, isCtaExecuting: false });
        }
    },

    /**
     * enterAriaPhase — internal async runner for Phase 3 + Phase 4.
     *
     * Phase 3 — ARIA execution:
     *   - Processes ARIA Local tokens (same commands as screenText).
     *     If <clck> found in ARIA Local: stops local text and calls ARIA API.
     *   - Calls ARIA API if ariaApi is set.
     *
     * Phase 4 — Post-ARIA setup:
     *   - Applies ariaInputEnabled setting.
     *   - Applies panelActions.
     *   - Applies simulationAction.
     *   - Sets demoPhase='awaiting-transition' → waits for user click to fire transitionTo.
     *
     * Not exposed on DemoState interface — called internally by enterStep and userAdvance.
     */
    enterAriaPhase: async (actIndex: number, stepIndex: number) => {
        const act = DEMO_ACTS[actIndex];
        if (!act) return;
        const steps = act.ctaSteps ?? [];
        const step: CtaStep | undefined = steps[stepIndex];
        if (!step) return;

        set({ isCtaExecuting: true, demoPhase: 'aria' as DemoPhase });

        try {
            // ── Phase 3a: ARIA Local ──────────────────────────────────────────

            const ariaLang = useUIStore.getState().currentLang;
            const resolvedAriaLocal = resolveText(step.ariaLocal, ariaLang);

            if (resolvedAriaLocal?.trim()) {
                const localTokens = parseCommands(sanitizeScreenText(resolvedAriaLocal));
                let localTextAcc = '';
                const msgId = generateDemoMessageId();

                /** Insert an empty bubble immediately so the audience sees it appear */
                set((s) => ({
                    messages: [
                        ...s.messages,
                        {
                            id: msgId,
                            role: 'assistant' as const,
                            content: '',
                            timestamp: new Date().toISOString(),
                            actId: act.id,
                        },
                    ],
                }));

                const { hitClick: localHitClick } = await executeTokens(localTokens, {
                    onText: (value) => {
                        /** Stream text progressively — each token updates the bubble */
                        localTextAcc += value;
                        const trimmed = localTextAcc.trim();
                        set((s) => {
                            const msgs = [...s.messages];
                            const idx = msgs.findIndex((m) => m.id === msgId);
                            if (idx >= 0) {
                                msgs[idx] = { ...msgs[idx], content: trimmed };
                            }
                            return { messages: msgs };
                        });
                    },
                    onClear: () => {
                        /** <cls> — clear screen and reset the streaming bubble */
                        localTextAcc = '';
                        set((s) => {
                            const msgs = s.messages.filter((m) => m.id !== msgId);
                            return {
                                currentSlide: null,
                                currentScreenText: null,
                                currentMediaInstruction: null,
                                messages: [
                                    ...msgs,
                                    {
                                        id: msgId,
                                        role: 'assistant' as const,
                                        content: '',
                                        timestamp: new Date().toISOString(),
                                        actId: act.id,
                                    },
                                ],
                            };
                        });
                    },
                    onClearMI: () => set({ currentMediaInstruction: null }),
                    onWait: async (ms) => { await sleep(ms); },
                    onShowMI: () => {
                        if (step.mediaInstruction) {
                            set({ currentMediaInstruction: step.mediaInstruction, currentSlide: null });
                        }
                    },
                });

                /** Remove the bubble if it ended up empty (e.g. only commands, no text) */
                const finalContent = localTextAcc.trim();
                if (!finalContent) {
                    set((s) => ({ messages: s.messages.filter((m) => m.id !== msgId) }));
                }

                /** <clck> in ARIA Local: skip remaining text, go to ARIA API immediately */
                if (localHitClick) {
                    /** Intentionally fall through to ARIA API below */
                }
            }

            // ── Phase 3b: ARIA API ────────────────────────────────────────────

            if (step.ariaApi?.trim()) {
                /**
                 * Guard: only call the ARIA API if a simulation session is active.
                 * Scripted ariaApi calls silently skip (with a console log) when
                 * no session exists — e.g. if the previous step ran `simulationAction:'reset'`
                 * which clears the session. The error bubble from postToCWF is reserved
                 * for the manual free-text ARIA input where the user can retry.
                 */
                const sessionId = useSimulationDataStore.getState().session?.id ?? null;
                if (sessionId) {
                    /** Strip any embedded commands from the prompt — AI gets clean text */
                    const cleanPrompt = step.ariaApi
                        .replace(/<w:\d+>/gi, '')
                        .replace(/<cls>/gi, '')
                        .replace(/<clck>/gi, '')
                        .replace(/<clmi>/gi, '')
                        .replace(/<MI>/g, '')
                        .replace(/\s{2,}/g, ' ')
                        .trim();
                    await postToCWF(cleanPrompt, act.id, act.systemContext, get, set);
                } else {
                    log.info('ariaApi skipped — no simulation session running (step scripted call).');
                }
            }

            // ── Phase 4: Post-ARIA setup ──────────────────────────────────────

            /** Apply ariaInputEnabled setting (true by default if not specified) */
            /** Note: this is consumed by DemoSidePanel — no store field needed */

            /** Apply panel actions from the step */
            applyStepPanelActions(step.panelActions);

            /**
             * Apply simulationAction in Phase 4 — AFTER the ARIA API call.
             * This is intentional: ARIA fires first while the simulation is still in its
             * pre-step state (e.g. running). The action (reset/start/stop) then takes effect
             * as cleanup/setup for the NEXT step.
             *
             * Example: Welcome step — ARIA fires while sim is running, THEN reset happens.
             * No System step   — ARIA fires (no ariaApi), THEN sim starts.
             */
            if (step.simulationAction) {
                executeSimulationAction(step.simulationAction, useSimulationStore.getState());
            }

            /** Phase 4 complete — wait for user click to fire transitionTo */
            set({ demoPhase: 'awaiting-transition' as DemoPhase, isCtaExecuting: false });

        } catch (err) {
            log.error('enterAriaPhase error:', err);
            set({ demoPhase: 'idle' as DemoPhase, isCtaExecuting: false });
        }
    },

    /**
     * userAdvance — called by the CTA button click.
     *
     * Routes to the correct next phase based on current demoPhase:
     *   'idle'                 → first click: start demo by entering the current step
     *   'awaiting-click'       → triggers Phase 3 (ARIA Local + API)
     *   'awaiting-transition'  → fires transitionTo: advance step or act
     *   other phases           → no-op (button is visually disabled)
     */
    userAdvance: async () => {
        const { demoPhase, isCtaExecuting, isLoading, currentActIndex, currentStepIndex } = get();

        /** Block if a phase is already running */
        if (isCtaExecuting || isLoading) return;

        if (demoPhase === 'idle') {
            /**
             * Demo not yet started (or just reset to idle state).
             * The first click triggers enterStep to load and auto-play the current step.
             * This is how the Welcome act auto-executes on demo start.
             */
            await get().enterStep(currentActIndex, currentStepIndex);
            return;
        }

        if (demoPhase === 'awaiting-click') {
            /** User clicked after screenText finished — trigger ARIA phase */
            /** Call enterAriaPhase via the concrete store instance — not in DemoState type */
            await (useDemoStore.getState() as unknown as { enterAriaPhase: (a: number, s: number) => Promise<void> }).enterAriaPhase(currentActIndex, currentStepIndex);
            return;
        }

        if (demoPhase === 'awaiting-transition') {
            /** User clicked after post-ARIA — fire transitionTo */
            const act = DEMO_ACTS[currentActIndex];
            const step = act?.ctaSteps?.[currentStepIndex];

            if (!step) return;

            const transition = step.transitionTo;

            if (transition === 'next') {
                /** Linear: advance to the next act */
                await get().advanceAct();
            } else if (transition && transition !== '') {
                /** Named jump: find the act by id */
                const targetIdx = DEMO_ACTS.findIndex(a => a.id === transition);
                if (targetIdx >= 0) await get().jumpToAct(targetIdx);
            } else {
                /** Stay / no transition: advance to next step within the same act */
                const steps = act?.ctaSteps ?? [];
                const nextStepIndex = currentStepIndex + 1;
                if (nextStepIndex < steps.length) {
                    /** Clear screen text before entering next step */
                    set({ currentScreenText: null });
                    await get().enterStep(currentActIndex, nextStepIndex);
                }
                /** If last step + stay: do nothing (presenter should design better flow) */
            }
            return;
        }

        /** Other phases (idle, content, aria): no-op */
    },

    /**
     * handleCtaClick — backward-compatible alias for userAdvance().
     * Existing references (DemoSidePanel, tests) continue to work unchanged.
     */
    handleCtaClick: async () => {
        await get().userAdvance();
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
            currentScreenTextAlign: 'center' as ScreenTextAlign,
            currentScreenTextWeight: 'bold' as ScreenTextWeight,
            currentScreenTextSize: 'lg' as ScreenTextSize,
            currentAriaLocalAlign: 'left' as ScreenTextAlign,
            currentAriaLocalWeight: 'normal' as ScreenTextWeight,
            currentAriaLocalSize: 'md' as ScreenTextSize,
            currentStepIndex: 0,
            ctaStepIndex: 0,
            demoPhase: 'idle' as DemoPhase,
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

        /** Auto-enter Step 0 of the new act */
        await get().enterStep(nextIndex, 0);
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
                    log.error('restartDemo: copilot disable server call failed', err);
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
            currentScreenTextAlign: 'center' as ScreenTextAlign,
            currentScreenTextWeight: 'bold' as ScreenTextWeight,
            currentScreenTextSize: 'lg' as ScreenTextSize,
            currentAriaLocalAlign: 'left' as ScreenTextAlign,
            currentAriaLocalWeight: 'normal' as ScreenTextWeight,
            currentAriaLocalSize: 'md' as ScreenTextSize,
            currentStepIndex: 0,
            ctaStepIndex: 0,
            demoPhase: 'idle' as DemoPhase,
            isCtaExecuting: false,
        });

        /**
         * Kick off Step 0 of act 0 as a fire-and-forget background task.
         * We intentionally do NOT await here — the restart function must return
         * immediately so the UI can display the clean welcome state. The welcome
         * step's Phase 1 delay (delayMs) and animations will auto-play in the
         * background. Errors from enterStep are suppressed (they are already
         * handled internally by enterStep's own try/catch).
         *
         * Note: in unit tests, this prevents the 5-second delayMs from causing
         * test timeouts since the test assertions run before the timer fires.
         */
        void get().enterStep(DEMO_FIRST_ACT_INDEX, 0);
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
            currentScreenTextAlign: 'center' as ScreenTextAlign,
            currentScreenTextWeight: 'bold' as ScreenTextWeight,
            currentScreenTextSize: 'lg' as ScreenTextSize,
            currentAriaLocalAlign: 'left' as ScreenTextAlign,
            currentAriaLocalWeight: 'normal' as ScreenTextWeight,
            currentAriaLocalSize: 'md' as ScreenTextSize,
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

        /** Auto-enter Step 0 of the target act */
        await get().enterStep(clampedIndex, 0);
    },
}));
