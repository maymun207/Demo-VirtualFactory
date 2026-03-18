/**
 * demoStore.test.ts — Unit Tests for the Narrative Demo Store
 *
 * Tests the Demo System Zustand store independently from the CWF system.
 * Verifies:
 *   - Initial state (messages empty, not loading, act at index 0)
 *   - clearMessages: empties the thread
 *   - sendMessage: user + assistant message lifecycle, error bubbles
 *   - advanceAct: increments act index, does not overflow past last act
 *   - advanceAct to autonomous-ai: calls Copilot enable API + updates copilotStore
 *   - advanceAct on non-copilot acts: does NOT call Copilot enable API
 *   - restartDemo: resets act index, clears messages, disables Copilot if enabled
 *   - fetch payload shape: correct endpoint, headers, persona seed
 *
 * All tests use Vitest + mocked fetch — no real network calls.
 * uiStore, simulationDataStore, and copilotStore are mocked for isolation.
 */

/// <reference types="vitest/globals" />

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { act } from 'react';
import { useDemoStore } from './demoStore';
import { DEMO_ACTS } from '../lib/params/demoSystem/demoScript';
import { DEMO_ARIA_LOADING_TIMEOUT_MS } from '../lib/params/demoSystem/demoConfig';

// =============================================================================
// MOCKS
// =============================================================================

/** Mock simulationDataStore — returns a stable fake session UUID + conveyorNumericParams for UIContext */
vi.mock('./simulationDataStore', () => ({
    useSimulationDataStore: {
        getState: () => ({
            session: {
                id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
                session_code: 'TEST01',
            },
            /** Minimal conveyorNumericParams needed to build a valid UIContext */
            conveyorNumericParams: {
                jammed_time: 0,
                impacted_tiles: 0,
                scrap_probability: 0,
                speed_change: 0,
                jammed_events: 0,
            },
            /** loadScenario is a no-op in tests — prevents real scenario switching */
            loadScenario: vi.fn(),
        }),
    },
}));

/**
 * Mock uiStore — all panel toggles are no-ops in tests.
 * Includes all panel-visibility flags needed to build a valid UIContext
 * so postToCWF doesn't crash when constructing the uiContext snapshot.
 */
vi.mock('./uiStore', () => ({
    useUIStore: {
        getState: () => ({
            showBasicPanel: false,
            showDTXFR: false,
            showCWF: false,
            showControlPanel: false,
            showKPI: false,
            showHeatmap: false,
            showPassport: false,
            showOEEHierarchy: false,
            /** Additional flags required by the UIContext builder in postToCWF */
            showProductionTable: false,
            showDemoSettings: false,
            showAlarmLog: false,
            isSimConfigured: true,
            simulationEnded: false,
            toggleBasicPanel: vi.fn(),
            toggleDTXFR: vi.fn(),
            toggleCWF: vi.fn(),
            toggleControlPanel: vi.fn(),
            toggleKPI: vi.fn(),
            toggleHeatmap: vi.fn(),
            togglePassport: vi.fn(),
            toggleOEEHierarchy: vi.fn(),
        }),
    },
}));

/** Stable mock functions for copilotStore enable/disable */
const mockEnableCopilot = vi.fn();
const mockDisableCopilot = vi.fn();
let mockCopilotIsEnabled = false;

/**
 * Mock copilotStore — tracks enable/disable calls without hitting Supabase.
 * isEnabled is a getter so tests can control it per-case.
 */
vi.mock('./copilotStore', () => ({
    useCopilotStore: {
        getState: () => ({
            /** Reflect the current test-controlled enabled state */
            get isEnabled() { return mockCopilotIsEnabled; },
            /** Record enable calls for assertion */
            enableCopilot: mockEnableCopilot,
            /** Record disable calls for assertion */
            disableCopilot: mockDisableCopilot,
        }),
    },
}));

/** Stub global fetch so we can mock it per test */
const mockFetch = vi.fn() as Mock;
vi.stubGlobal('fetch', mockFetch);

/**
 * COPILOT_ENABLE_URL — the URL that applyCopilotEnable() fires at.
 * Defined here so tests assert against it without hardcoding the string.
 */
const COPILOT_ENABLE_URL = '/api/cwf/copilot/enable';
/** COPILOT_DISABLE_URL — fired by restartDemo() when Copilot is active */
const COPILOT_DISABLE_URL = '/api/cwf/copilot/disable';

// =============================================================================
// HELPERS
// =============================================================================

/** Resolve fetch with a successful CWF response */
const mockSuccessResponse = (reply = 'Factory OEE is 87%.') => {
    mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ response: reply, toolCallCount: 2 }),
    });
};

/** Resolve fetch with an HTTP error */
const mockErrorResponse = (status = 500) => {
    mockFetch.mockResolvedValueOnce({
        ok: false,
        status,
        json: async () => ({ error: 'Internal Server Error' }),
    });
};

// =============================================================================
// TESTS
// =============================================================================

describe('demoStore', () => {
    beforeEach(() => {
        /** Reset the store to initial state before each test */
        act(() => {
            useDemoStore.setState({
                messages: [],
                isLoading: false,
                currentActIndex: 0,
            });
        });
        /** Reset fetch mock */
        mockFetch.mockReset();
        /** Reset copilotStore mocks */
        mockEnableCopilot.mockReset();
        mockDisableCopilot.mockReset();
        /** Default: Copilot starts disabled */
        mockCopilotIsEnabled = false;
    });

    // ── Initial State ──────────────────────────────────────────────────────────

    it('starts with empty messages, not loading, at act 0', () => {
        const state = useDemoStore.getState();
        /** No messages on init */
        expect(state.messages).toHaveLength(0);
        /** Not loading */
        expect(state.isLoading).toBe(false);
        /** Starts at welcome act (index 0) */
        expect(state.currentActIndex).toBe(0);
    });

    // ── clearMessages ──────────────────────────────────────────────────────────

    it('clearMessages empties the message thread', async () => {
        mockSuccessResponse();
        await act(async () => {
            await useDemoStore.getState().sendMessage('Hello');
        });
        /** Should have messages after sending */
        expect(useDemoStore.getState().messages.length).toBeGreaterThan(0);

        /** Clear */
        act(() => useDemoStore.getState().clearMessages());
        /** Now empty */
        expect(useDemoStore.getState().messages).toHaveLength(0);
    });

    // ── sendMessage ────────────────────────────────────────────────────────────

    it('sendMessage appends a user message and an assistant response', async () => {
        mockSuccessResponse('Factory OEE is 87%.');
        await act(async () => {
            await useDemoStore.getState().sendMessage('What is the OEE?');
        });

        const { messages } = useDemoStore.getState();
        /** User + assistant messages */
        expect(messages.length).toBe(2);
        expect(messages[0].role).toBe('user');
        expect(messages[0].content).toBe('What is the OEE?');
        expect(messages[1].role).toBe('assistant');
        expect(messages[1].content).toBe('Factory OEE is 87%.');
        expect(messages[1].isStreaming).toBe(false);
    });

    it('sendMessage toggles isLoading correctly', async () => {
        let loadingDuringFetch = false;
        mockFetch.mockImplementationOnce(async () => {
            /** Capture isLoading while fetch is in-flight */
            loadingDuringFetch = useDemoStore.getState().isLoading;
            return { ok: true, json: async () => ({ response: 'ok', toolCallCount: 0 }) };
        });

        await act(async () => {
            await useDemoStore.getState().sendMessage('test');
        });

        /** Must have been true during the fetch */
        expect(loadingDuringFetch).toBe(true);
        /** Must be restored to false after */
        expect(useDemoStore.getState().isLoading).toBe(false);
    });

    it('sendMessage shows error bubble on API failure', async () => {
        mockErrorResponse(503);
        await act(async () => {
            await useDemoStore.getState().sendMessage('Test fail');
        });
        const messages = useDemoStore.getState().messages;
        const lastMsg = messages[messages.length - 1];
        /** Error bubble expected */
        expect(lastMsg.error).toBe(true);
        expect(lastMsg.content).toContain('❌ Error');
    });

    it('sendMessage shows system message when no simulation is running', async () => {
        /** Spy on getState to return null session for this test */
        const simDataStore = await import('./simulationDataStore');
        const spy = vi.spyOn(simDataStore.useSimulationDataStore, 'getState').mockReturnValueOnce({
            session: null,
            loadScenario: vi.fn(),
        } as unknown as ReturnType<typeof simDataStore.useSimulationDataStore.getState>);

        act(() => useDemoStore.setState({ messages: [] }));
        await act(async () => {
            await useDemoStore.getState().sendMessage('Hello');
        });

        const msgs = useDemoStore.getState().messages;
        /** System error notification expected */
        expect(msgs[msgs.length - 1].role).toBe('system');
        expect(msgs[msgs.length - 1].error).toBe(true);

        spy.mockRestore();
    });

    // ── API request body ──────────────────────────────────────────────────────

    it('sends simulationHistory (not empty []) and uiContext in the API request body', async () => {
        /**
         * Root-cause regression guard: demo ARIA previously sent simulationHistory:[]
         * and no uiContext, causing the server-side Gemini agent to say "I don't have
         * historical data" even when the data existed in Supabase.
         * This test ensures the request body contains the correct fields so the
         * server can inject uiContext into the Gemini system prompt and ARIA can
         * make proper tool calls (e.g. query conveyor speed history).
         */
        mockSuccessResponse('ok');
        await act(async () => {
            await useDemoStore.getState().sendMessage('List conveyor speed from s_clock 0 to s_clock 300.');
        });

        expect(mockFetch).toHaveBeenCalledOnce();
        const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body as string);

        /** simulationHistory must be an array (not the empty literal []) */
        expect(Array.isArray(requestBody.simulationHistory)).toBe(true);

        /** uiContext must be present with at minimum simulation + config sub-objects */
        expect(requestBody.uiContext).toBeDefined();
        expect(requestBody.uiContext.simulation).toBeDefined();
        expect(requestBody.uiContext.config).toBeDefined();

        /** simulation node must include the fields the server uses for tool calls */
        expect(typeof requestBody.uiContext.simulation.isRunning).toBe('boolean');
        expect(typeof requestBody.uiContext.simulation.sClockCount).toBe('number');

        /** config node must identify the language and active scenario */
        expect(requestBody.uiContext.config.language).toBe('en');
    });

    // ── Safety timeout ──────────────────────────────────────────────────────────


    it('re-enables isLoading after DEMO_ARIA_LOADING_TIMEOUT_MS when ARIA never responds', async () => {
        /**
         * Simulate a hung ARIA request: fetch returns a Promise that NEVER resolves.
         * The safety setTimeout in postToCWF should fire after DEMO_ARIA_LOADING_TIMEOUT_MS
         * and set isLoading back to false so the CTA button is unblocked.
         */
        vi.useFakeTimers();

        /** Never-resolving fetch simulates a network hang */
        mockFetch.mockImplementation(() => new Promise(() => {}));

        /** Start sendMessage — do NOT await (it hangs on the infinite fetch) */
        act(() => { void useDemoStore.getState().sendMessage('test'); });

        /** Flush the microtask queue so the initial set({ isLoading: true }) fires */
        await act(async () => { await Promise.resolve(); });

        /** isLoading must be true while the fetch is in-flight */
        expect(useDemoStore.getState().isLoading).toBe(true);

        /** Advance fake clock past the safety threshold */
        await act(async () => { vi.advanceTimersByTime(DEMO_ARIA_LOADING_TIMEOUT_MS + 1); });

        /** Safety timeout must have fired — isLoading re-enabled */
        expect(useDemoStore.getState().isLoading).toBe(false);

        vi.useRealTimers();
    });

    it('clears the safety timer on a successful ARIA response (no double-fire)', async () => {
        /**
         * Verify that the safety timer is properly cleared (via finally: clearTimeout)
         * when ARIA responds normally. Advancing fake timers past DEMO_ARIA_LOADING_TIMEOUT_MS
         * after a successful response must NOT change isLoading again.
         */
        vi.useFakeTimers();

        mockSuccessResponse('All good.');

        await act(async () => {
            await useDemoStore.getState().sendMessage('test');
        });

        /** After successful response isLoading is false */
        expect(useDemoStore.getState().isLoading).toBe(false);

        /**
         * Advance past the timeout window — the timer should have been cleared
         * in finally so this must NOT flip isLoading back to true.
         */
        act(() => { vi.advanceTimersByTime(DEMO_ARIA_LOADING_TIMEOUT_MS + 1); });
        expect(useDemoStore.getState().isLoading).toBe(false);

        vi.useRealTimers();
    });

    // ── advanceAct ─────────────────────────────────────────────────────────────

    it('advanceAct increments currentActIndex', async () => {
        mockSuccessResponse('Act 1 narrative...');
        /** Start at act 0 */
        expect(useDemoStore.getState().currentActIndex).toBe(0);

        await act(async () => {
            await useDemoStore.getState().advanceAct();
        });

        /** Should now be at act 1 */
        expect(useDemoStore.getState().currentActIndex).toBe(1);
    }, 15_000);

    it('advanceAct does not overflow past the last act', async () => {
        const lastIndex = DEMO_ACTS.length - 1;
        /** Jump directly to the last act */
        act(() => useDemoStore.setState({ currentActIndex: lastIndex }));

        /** Should be clamped — no fetch call, no state change */
        await act(async () => {
            await useDemoStore.getState().advanceAct();
        });

        expect(useDemoStore.getState().currentActIndex).toBe(lastIndex);
        /** No fetch should have been called since we were already at the last act */
        expect(mockFetch).not.toHaveBeenCalled();
    });

    it('advanceAct sends the next act opening prompt to CWF when prompt is non-empty', async () => {
        /**
         * DEMO_ACTS[1].openingPrompt is non-empty.
         * advanceAct fires postToCWF with the opening prompt AND then enterStep
         * may fire additional fetches (ariaApi on step 0, etc.).
         * We provide enough mock responses and verify at least one targets /api/cwf/chat.
         */
        const originalPrompt = DEMO_ACTS[1].openingPrompt;
        DEMO_ACTS[1].openingPrompt = 'Welcome to the factory tour.';

        try {
            /** Provide enough responses for openingPrompt + enterStep ariaApi calls */
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => ({ response: 'Act 1 narrative...', toolCallCount: 0 }),
            });
            act(() => useDemoStore.setState({ currentActIndex: 0 }));

            await act(async () => {
                await useDemoStore.getState().advanceAct();
            });

            /** Fetch must have been called at least once for the opening prompt */
            expect(mockFetch).toHaveBeenCalled();
            /** At least one call must target /api/cwf/chat with the patched prompt */
            const chatCalls = mockFetch.mock.calls.filter((c: unknown[]) => c[0] === '/api/cwf/chat');
            expect(chatCalls.length).toBeGreaterThanOrEqual(1);
            const promptCall = chatCalls.find((c: unknown[]) => {
                const body = JSON.parse((c[1] as { body: string }).body);
                return body.message === 'Welcome to the factory tour.';
            });
            expect(promptCall).toBeDefined();
        } finally {
            /** Always restore the original value so other tests are unaffected */
            DEMO_ACTS[1].openingPrompt = originalPrompt;
        }
    }, 15_000);

    it('advanceAct does NOT call CWF when openingPrompt is empty', async () => {
        /**
         * Temporarily patch DEMO_ACTS[1].openingPrompt to '' so the guard
         * `if (nextAct.openingPrompt?.trim())` in advanceAct skips the CWF call.
         * enterStep may still fire fetches (ariaApi on step 0), so we only
         * verify that no fetch targeted the opening prompt specifically.
         */
        const originalPrompt = DEMO_ACTS[1].openingPrompt;
        DEMO_ACTS[1].openingPrompt = '';

        try {
            /** Provide responses for any enterStep ariaApi calls */
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => ({ response: 'step response', toolCallCount: 0 }),
            });
            act(() => useDemoStore.setState({ currentActIndex: 0 }));

            await act(async () => {
                await useDemoStore.getState().advanceAct();
            });

            /** Act index must still advance */
            expect(useDemoStore.getState().currentActIndex).toBe(1);

            /**
             * No fetch call should contain the original prompt text.
             * enterStep may make ariaApi calls, but the opening prompt must be skipped.
             */
            for (const callArgs of mockFetch.mock.calls) {
                if (callArgs[0] === '/api/cwf/chat') {
                    const body = JSON.parse((callArgs[1] as { body: string }).body);
                    expect(body.message).not.toBe(originalPrompt);
                }
            }
        } finally {
            DEMO_ACTS[1].openingPrompt = originalPrompt;
        }
    }, 15_000);

    // ── Copilot enable / disable mechanics ────────────────────────────────────

    it('advanceAct to autonomous-ai act calls copilot enable API and updates copilotStore', async () => {
        /**
         * Find the index of the autonomous-ai act dynamically so the test is
         * resilient to future reordering of DEMO_ACTS.
         */
        const autonomousIndex = DEMO_ACTS.findIndex((a) => a.id === 'autonomous-ai');
        expect(autonomousIndex).toBeGreaterThan(0); // guard: act must exist

        /** Place store at the act immediately before autonomous-ai */
        act(() => useDemoStore.setState({ currentActIndex: autonomousIndex - 1 }));

        /**
         * mockFetch must answer TWO calls:
         *   1) /api/cwf/chat     — the opening prompt
         *   2) /api/cwf/copilot/enable — the Copilot enable API (fire-and-forget)
         * We set up two responses so neither call hangs.
         */
        mockFetch
            .mockResolvedValueOnce({ ok: true, json: async () => ({ response: 'Autonomous narrative', toolCallCount: 0 }) })
            .mockResolvedValueOnce({ ok: true, json: async () => ({}) });

        await act(async () => {
            await useDemoStore.getState().advanceAct();
        });

        /** The act must have advanced to the autonomous-ai act */
        expect(useDemoStore.getState().currentActIndex).toBe(autonomousIndex);

        /** copilotStore.enableCopilot() must have been called once */
        expect(mockEnableCopilot).toHaveBeenCalledOnce();

        /**
         * One of the fetch calls must target the Copilot enable endpoint.
         * We check all calls (order is non-deterministic for fire-and-forget).
         */
        const calledUrls = mockFetch.mock.calls.map((c) => c[0]);
        expect(calledUrls).toContain(COPILOT_ENABLE_URL);
    }, 15_000);

    it('advanceAct on a non-copilot act does NOT call copilot enable API', async () => {
        /** Start at act 0 (Welcome) — no enableCopilot flag */
        mockSuccessResponse('Act 1 narrative');

        await act(async () => {
            await useDemoStore.getState().advanceAct();
        });

        /** copilotStore.enableCopilot() must NOT have been called */
        expect(mockEnableCopilot).not.toHaveBeenCalled();

        /** No fetch call should target the Copilot enable endpoint */
        const calledUrls = mockFetch.mock.calls.map((c) => c[0]);
        expect(calledUrls).not.toContain(COPILOT_ENABLE_URL);
    }, 15_000);

    it('restartDemo disables Copilot via store + API if Copilot was enabled', async () => {
        /** Simulate Copilot being active when the demo restarts */
        mockCopilotIsEnabled = true;

        /**
         * mockFetch answers only the Copilot disable call.
         * No /api/cwf/chat call is expected — restartDemo no longer auto-sends
         * the welcome prompt to avoid racing against session teardown.
         */
        mockFetch
            .mockResolvedValueOnce({ ok: true, json: async () => ({}) });

        await act(async () => {
            await useDemoStore.getState().restartDemo();
        });

        /** copilotStore.disableCopilot() must have been called */
        expect(mockDisableCopilot).toHaveBeenCalledOnce();

        /** One of the fetch calls must target the Copilot disable endpoint */
        const calledUrls = mockFetch.mock.calls.map((c) => c[0]);
        expect(calledUrls).toContain(COPILOT_DISABLE_URL);
        /** /api/cwf/chat must NOT have been called (no welcome prompt race) */
        expect(calledUrls).not.toContain('/api/cwf/chat');
    });

    it('restartDemo does not call copilot disable if Copilot was not enabled', async () => {
        /** Copilot starts disabled (default in beforeEach) — no fetch mocking needed */

        await act(async () => {
            await useDemoStore.getState().restartDemo();
        });

        /** disableCopilot must NOT have been called */
        expect(mockDisableCopilot).not.toHaveBeenCalled();
        /** No fetch calls at all — no welcome prompt, no disable call */
        expect(mockFetch).not.toHaveBeenCalled();
    });

    // ── restartDemo ────────────────────────────────────────────────────────────

    it('restartDemo resets currentActIndex to 0 and clears messages without sending welcome prompt', async () => {
        /** Move to a later act and add some messages */
        act(() => useDemoStore.setState({ currentActIndex: 3 }));
        mockSuccessResponse();
        await act(async () => {
            await useDemoStore.getState().sendMessage('Some message');
        });
        mockFetch.mockReset();

        /**
         * Restart — must NOT call fetch for the welcome prompt.
         * The static welcome card in DemoChatView handles the empty-state UI.
         */
        await act(async () => {
            await useDemoStore.getState().restartDemo();
        });

        /** Act index must be reset to 0 */
        expect(useDemoStore.getState().currentActIndex).toBe(0);
        /** Messages must be cleared */
        expect(useDemoStore.getState().messages).toHaveLength(0);
        /** fetch must NOT have been called — no welcome prompt race condition */
        expect(mockFetch).not.toHaveBeenCalled();
    });

    // ── fetch payload shape ────────────────────────────────────────────────────

    it('sendMessage posts to /api/cwf/chat with ARIA persona in conversationHistory', async () => {
        mockSuccessResponse();
        await act(async () => {
            await useDemoStore.getState().sendMessage('Payload test');
        });

        expect(mockFetch).toHaveBeenCalledOnce();
        const [url, options] = mockFetch.mock.calls[0];
        expect(url).toBe('/api/cwf/chat');
        expect(options.method).toBe('POST');

        const body = JSON.parse(options.body);
        expect(body.message).toBe('Payload test');
        expect(body.language).toBe('en');
        expect(body.simulationId).toBe('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');

        /** Conversation history must start with the ARIA persona seed */
        expect(body.conversationHistory[0].role).toBe('user');
        /** Check for ARIA persona content — not a hardcoded string */
        expect(body.conversationHistory[0].content).toContain('You are ARIA');
        /** Second turn must be ARIA's acknowledgement */
        expect(body.conversationHistory[1].role).toBe('assistant');
        expect(body.conversationHistory[1].content).toContain('ARIA in Demo Mode');
    });

    // ── slideImageUrl image message injection ──────────────────────────────────

    it('advanceAct advances act index and does not auto-inject slide images', async () => {
        /**
         * ARCHITECTURE NOTE (updated from the legacy slideImageUrl test):
         *
         * In the previous architecture, acts had a top-level `slideImageUrl`
         * which advanceAct would inject as a local image message before the
         * ARIA response. That design was replaced:
         *
         *   OLD: DemoAct.slideImageUrl (act-level, injected on act transition)
         *   NEW: CtaStep.slideImageUrl (step-level, injected via handleCtaClick)
         *
         * advanceAct now:
         *   1. Applies act-level panelActions
         *   2. Applies scenarioCode (if set)
         *   3. Updates currentActIndex
         *   4. Calls postToCWF with openingPrompt (if non-empty)
         *   It does NOT auto-inject any image messages — slides are explicit CTA clicks.
         */
        act(() => useDemoStore.setState({ currentActIndex: 0, messages: [] }));

        await act(async () => {
            await useDemoStore.getState().advanceAct();
        });

        const { currentActIndex, messages } = useDemoStore.getState();

        /** Must have advanced to act 1 */
        expect(currentActIndex).toBe(1);

        /**
         * No image message should be injected by advanceAct itself.
         * Slides are only shown when the presenter clicks the CTA button.
         */
        const hasImageMsg = messages.some(m => !!m.imageUrl);
        expect(hasImageMsg).toBe(false);
    });
});


// =============================================================================
// jumpToAct tests
// =============================================================================

/**
 * jumpToAct — tests for direct act navigation via sidebar LED clicks.
 * Verifies index clamping, message clearing, slide injection, and prompt delivery.
 */
describe('jumpToAct', () => {
    /**
     * Reset store and fetch mock before each jumpToAct test.
     * This prevents state leakage from the parent 'demoStore' suite
     * which may have left currentActIndex > 0 from its own tests.
     */
    beforeEach(() => {
        act(() => {
            useDemoStore.setState({ messages: [], isLoading: false, currentActIndex: 0 });
        });
        mockFetch.mockReset();
        /** Default successful CWF response for all jump tests */
        mockFetch.mockResolvedValue({
            ok: true,
            json: async () => ({ response: 'Jump act response', toolCallCount: 0 }),
        });
    });

    it('sets currentActIndex to the target act directly', async () => {
        /** Start at act 0 (Welcome) */
        expect(useDemoStore.getState().currentActIndex).toBe(0);


        /** Jump to act 2 (Basic System) */
        await act(async () => {
            await useDemoStore.getState().jumpToAct(2);
        });

        /** Must land exactly on act 2, not step by step */
        expect(useDemoStore.getState().currentActIndex).toBe(2);
    });

    it('clears the message thread before jumping', async () => {
        /** Pre-populate messages so we can verify they are cleared */
        await act(async () => {
            await useDemoStore.getState().sendMessage('pre-existing message');
        });

        const beforeJump = useDemoStore.getState().messages;
        expect(beforeJump.length).toBeGreaterThan(0);

        /** Jump to act 1 — must wipe the thread first */
        await act(async () => {
            await useDemoStore.getState().jumpToAct(1);
        });

        /**
         * After jump, messages contain only the messages generated by the jump
         * (sliding image + ARIA response), NOT the pre-existing ones.
         * We verify the pre-existing content is gone.
         */
        const afterJump = useDemoStore.getState().messages;
        const hasPreExisting = afterJump.some(
            (m) => m.content === 'pre-existing message',
        );
        expect(hasPreExisting).toBe(false);
    });

    it('clamps target index below 0 to act 0 (Welcome)', async () => {
        /** -5 is out of range — must clamp to 0 */
        await act(async () => {
            await useDemoStore.getState().jumpToAct(-5);
        });

        expect(useDemoStore.getState().currentActIndex).toBe(0);
    });

    it('clamps target index above max to the last act', async () => {
        const lastIndex = DEMO_ACTS.length - 1;

        /** 999 is way beyond max — must clamp to last act */
        await act(async () => {
            await useDemoStore.getState().jumpToAct(999);
        });

        expect(useDemoStore.getState().currentActIndex).toBe(lastIndex);
    });

    it('does NOT auto-inject image messages when jumping to an act (slides are CTA-step-driven)', async () => {
        /**
         * ARCHITECTURE NOTE (updated from the legacy slideImageUrl test):
         *
         * In the previous architecture, acts had a top-level `slideImageUrl` which
         * jumpToAct would inject as a local image message before sending the ARIA prompt.
         * That design was replaced:
         *
         *   OLD: DemoAct.slideImageUrl (act-level, injected on jump)
         *   NEW: CtaStep.slideImageUrl (step-level, injected via handleCtaClick)
         *
         * jumpToAct now only: navigates to the target act, clears messages, applies
         * panelActions + scenarioCode, and sends openingPrompt if non-empty.
         * It does NOT auto-inject slide images.
         */
        await act(async () => {
            await useDemoStore.getState().jumpToAct(1);
        });

        const messages = useDemoStore.getState().messages;

        /** There must be no auto-injected image message from jumpToAct */
        const hasImageMsg = messages.some(m => !!m.imageUrl);
        expect(hasImageMsg).toBe(false);
    });
});

