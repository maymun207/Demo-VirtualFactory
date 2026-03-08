/**
 * copilotStore.test.ts — Unit Tests for CWF Copilot Zustand Store
 *
 * Tests the copilot UI state management including:
 *   - Enable/disable copilot mode
 *   - Auth pending state transitions
 *   - Action history ring buffer (push, max capacity, ordering)
 *   - Config update merging
 *   - Cycle counter
 *   - Full reset to defaults
 *   - Action count tracking (only 'corrected' increments)
 */

import { useCopilotStore } from '../store/copilotStore';

/** Helper to reset the store between tests */
function resetStore() {
    useCopilotStore.getState().resetCopilot();
}

describe('CWF Copilot Store', () => {
    beforeEach(resetStore);

    // ─── Initial State ───────────────────────────────────────────────────────

    test('starts with copilot disabled', () => {
        const state = useCopilotStore.getState();
        expect(state.isEnabled).toBe(false);
        expect(state.isAuthPending).toBe(false);
        expect(state.lastAction).toBeNull();
        expect(state.actionHistory).toHaveLength(0);
        expect(state.totalActions).toBe(0);
        expect(state.totalCycles).toBe(0);
    });

    // ─── Enable / Disable ────────────────────────────────────────────────────

    test('enableCopilot sets isEnabled=true and clears authPending', () => {
        useCopilotStore.getState().setAuthPending(true);
        useCopilotStore.getState().enableCopilot();

        const state = useCopilotStore.getState();
        expect(state.isEnabled).toBe(true);
        expect(state.isAuthPending).toBe(false);
    });

    test('disableCopilot sets isEnabled=false and clears authPending', () => {
        useCopilotStore.getState().enableCopilot();
        useCopilotStore.getState().disableCopilot();

        const state = useCopilotStore.getState();
        expect(state.isEnabled).toBe(false);
        expect(state.isAuthPending).toBe(false);
    });

    // ─── Auth Pending ────────────────────────────────────────────────────────

    test('setAuthPending toggles pending state', () => {
        useCopilotStore.getState().setAuthPending(true);
        expect(useCopilotStore.getState().isAuthPending).toBe(true);

        useCopilotStore.getState().setAuthPending(false);
        expect(useCopilotStore.getState().isAuthPending).toBe(false);
    });

    // ─── Push Action ─────────────────────────────────────────────────────────

    test('pushAction adds to history and sets lastAction', () => {
        const action = {
            id: 'test-1',
            decision: 'corrected',
            chatMessage: '🔧 Fixed kiln temperature',
            timestamp: '2026-03-09T00:00:00Z',
            simTick: 100,
        };

        useCopilotStore.getState().pushAction(action);
        const state = useCopilotStore.getState();

        expect(state.lastAction).toEqual(action);
        expect(state.actionHistory).toHaveLength(1);
        expect(state.actionHistory[0]).toEqual(action);
    });

    test('pushAction prepends (newest first)', () => {
        const action1 = { id: '1', decision: 'corrected', chatMessage: 'msg1', timestamp: '2026-01-01', simTick: 1 };
        const action2 = { id: '2', decision: 'observed', chatMessage: 'msg2', timestamp: '2026-01-02', simTick: 2 };

        useCopilotStore.getState().pushAction(action1);
        useCopilotStore.getState().pushAction(action2);

        const history = useCopilotStore.getState().actionHistory;
        expect(history[0].id).toBe('2'); // Newest first
        expect(history[1].id).toBe('1');
    });

    test('pushAction increments totalActions only for corrected', () => {
        useCopilotStore.getState().pushAction({
            id: '1', decision: 'corrected', chatMessage: 'fix', timestamp: 'ts', simTick: 1,
        });
        expect(useCopilotStore.getState().totalActions).toBe(1);

        useCopilotStore.getState().pushAction({
            id: '2', decision: 'observed', chatMessage: 'obs', timestamp: 'ts', simTick: 2,
        });
        /** Should NOT increment for 'observed' */
        expect(useCopilotStore.getState().totalActions).toBe(1);

        useCopilotStore.getState().pushAction({
            id: '3', decision: 'corrected', chatMessage: 'fix2', timestamp: 'ts', simTick: 3,
        });
        expect(useCopilotStore.getState().totalActions).toBe(2);
    });

    test('pushAction caps history at 50 items', () => {
        /** Push 55 actions into the store */
        for (let i = 0; i < 55; i++) {
            useCopilotStore.getState().pushAction({
                id: `action-${i}`,
                decision: 'observed',
                chatMessage: `msg-${i}`,
                timestamp: `ts-${i}`,
                simTick: i,
            });
        }

        const history = useCopilotStore.getState().actionHistory;
        expect(history).toHaveLength(50);
        /** Most recent (action-54) should be first */
        expect(history[0].id).toBe('action-54');
        /** Oldest retained should be action-5 (55-50=5) */
        expect(history[49].id).toBe('action-5');
    });

    // ─── Config Update ───────────────────────────────────────────────────────

    test('updateConfig merges partial config', () => {
        useCopilotStore.getState().updateConfig({ pollIntervalSec: 30 });

        const config = useCopilotStore.getState().config;
        expect(config.pollIntervalSec).toBe(30);
        /** Other config values should remain unchanged */
        expect(config.oeeAlarmThreshold).toBe(60.0);
        expect(config.qualityAlarmThreshold).toBe(85.0);
    });

    test('updateConfig can update multiple fields', () => {
        useCopilotStore.getState().updateConfig({
            pollIntervalSec: 20,
            oeeAlarmThreshold: 50,
        });

        const config = useCopilotStore.getState().config;
        expect(config.pollIntervalSec).toBe(20);
        expect(config.oeeAlarmThreshold).toBe(50);
    });

    // ─── Cycle Counter ───────────────────────────────────────────────────────

    test('incrementCycles increments the counter', () => {
        useCopilotStore.getState().incrementCycles();
        useCopilotStore.getState().incrementCycles();
        useCopilotStore.getState().incrementCycles();

        expect(useCopilotStore.getState().totalCycles).toBe(3);
    });

    // ─── Reset ───────────────────────────────────────────────────────────────

    test('resetCopilot restores all defaults', () => {
        /** Mutate the store */
        useCopilotStore.getState().enableCopilot();
        useCopilotStore.getState().pushAction({
            id: '1', decision: 'corrected', chatMessage: 'msg', timestamp: 'ts', simTick: 1,
        });
        useCopilotStore.getState().updateConfig({ pollIntervalSec: 99 });
        useCopilotStore.getState().incrementCycles();

        /** Reset */
        useCopilotStore.getState().resetCopilot();

        const state = useCopilotStore.getState();
        expect(state.isEnabled).toBe(false);
        expect(state.isAuthPending).toBe(false);
        expect(state.lastAction).toBeNull();
        expect(state.actionHistory).toHaveLength(0);
        expect(state.totalActions).toBe(0);
        expect(state.totalCycles).toBe(0);
        expect(state.config.pollIntervalSec).toBe(15);
    });
});
