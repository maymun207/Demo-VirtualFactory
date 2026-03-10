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

// =============================================================================
// MOCKS
// =============================================================================

/** Mock simulationDataStore — returns a stable fake session UUID */
vi.mock('./simulationDataStore', () => ({
    useSimulationDataStore: {
        getState: () => ({
            session: {
                id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
                session_code: 'TEST01',
            },
            /** loadScenario is a no-op in tests — prevents real scenario switching */
            loadScenario: vi.fn(),
        }),
    },
}));

/**
 * Mock uiStore — all panel toggles are no-ops in tests.
 * Prevents "cannot read properties of undefined" on toggle calls inside advanceAct.
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
    });

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

    it('advanceAct sends the next act opening prompt to CWF', async () => {
        mockSuccessResponse('Act 1 narrative...');
        /** Start at act 0 */
        act(() => useDemoStore.setState({ currentActIndex: 0 }));

        await act(async () => {
            await useDemoStore.getState().advanceAct();
        });

        /** Fetch should have been called once */
        expect(mockFetch).toHaveBeenCalledOnce();
        const [url, options] = mockFetch.mock.calls[0];
        expect(url).toBe('/api/cwf/chat');
        expect(options.method).toBe('POST');

        const body = JSON.parse(options.body);
        /** The sent message should be the act 1 opening prompt */
        expect(body.message).toBe(DEMO_ACTS[1].openingPrompt);
    });

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
    });

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
    });

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
});
