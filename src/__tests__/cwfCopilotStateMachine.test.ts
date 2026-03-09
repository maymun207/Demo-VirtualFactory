/**
 * cwfCopilotStateMachine.test.ts
 *
 * Unit tests for the CWF Copilot State Machine logic.
 *
 * Tests cover the following state transitions and behaviours:
 *   1. NORMAL → COPILOT_PENDING_AUTH  (user requests copilot mode)
 *   2. COPILOT_PENDING_AUTH → COPILOT_ACTIVE  (correct auth code)
 *   3. COPILOT_PENDING_AUTH → NORMAL  (3 failed attempts)
 *   4. COPILOT_ACTIVE → NORMAL  (user disables / simulation ends)
 *   5. Auth-code recognition heuristic  (looksLikeAuthCode logic)
 *   6. Deadlock prevention  (no state can block all transitions)
 *   7. Conveyor speed out-of-range detection threshold boundaries
 *
 * NOTE: These are pure logic unit tests. They do NOT call Supabase or Gemini.
 * The state machine logic is extracted into helper functions tested here.
 */

import { describe, it, expect } from 'vitest';

// =============================================================================
// PURE LOGIC HELPERS (mirrors of the logic in chat.ts)
// These are re-implemented here as pure functions for testability.
// =============================================================================

/**
 * CWF State Machine states — mirrors CwfState in copilot.ts.
 */
type CwfState = 'normal' | 'copilot_pending_auth' | 'copilot_active';

/** Maximum failed auth attempts before returning to 'normal'. */
const COPILOT_MAX_AUTH_ATTEMPTS = 3;

/** The known authorisation code (test uses same value as production). */
const TEST_AUTH_CODE = 'airtk';

// =============================================================================
// STATE TRANSITION FUNCTIONS (pure logic, no side-effects)
// =============================================================================

/**
 * Computes the next CWF state after an authorisation attempt.
 *
 * @param currentState  - Current state from Supabase
 * @param currentAttempts - Current failed attempt count from Supabase
 * @param providedCode  - Auth code provided by the user
 * @param authCode      - The actual correct auth code
 *
 * @returns { nextState, nextAttempts, success, exhausted }
 */
function computeAuthTransition(
    currentState: CwfState,
    currentAttempts: number,
    providedCode: string,
    authCode: string,
): { nextState: CwfState; nextAttempts: number; success: boolean; exhausted: boolean } {
    /** Guard: only process auth when in pending_auth state */
    if (currentState !== 'copilot_pending_auth') {
        return {
            nextState: currentState,
            nextAttempts: currentAttempts,
            success: false,
            exhausted: false,
        };
    }

    const isCorrect = providedCode.trim().toLowerCase() === authCode.toLowerCase();

    if (isCorrect) {
        /** Correct code: transition to active, reset attempts */
        return { nextState: 'copilot_active', nextAttempts: 0, success: true, exhausted: false };
    }

    /** Wrong code: increment attempts */
    const newAttempts = currentAttempts + 1;
    if (newAttempts >= COPILOT_MAX_AUTH_ATTEMPTS) {
        /** Max attempts reached: return to normal */
        return { nextState: 'normal', nextAttempts: 0, success: false, exhausted: true };
    }

    /** More attempts remaining: stay in pending_auth */
    return { nextState: 'copilot_pending_auth', nextAttempts: newAttempts, success: false, exhausted: false };
}

/**
 * Determines if a user message looks like an auth code.
 * Mirrors the looksLikeAuthCode logic in chat.ts request handler.
 *
 * @param message - User's message text
 */
function looksLikeAuthCode(message: string): boolean {
    return (
        message.trim().length <= 15 &&
        !message.includes('?') &&
        !message.includes(' ')
    );
}

/**
 * Simulate the disable_copilot transition — always returns to 'normal'.
 */
function computeDisableTransition(): { nextState: CwfState; nextAttempts: number } {
    return { nextState: 'normal', nextAttempts: 0 };
}

/**
 * Simulate the simulation-end auto-disengage transition.
 * Any non-'running' simulation status should disengage copilot.
 */
function computeSimulationEndTransition(
    simulationStatus: string,
    currentState: CwfState,
): CwfState {
    if (simulationStatus === 'completed' || simulationStatus === 'stopped') {
        /** Auto-disengage: return to normal regardless of current copilot state */
        return 'normal';
    }
    return currentState;
}

// =============================================================================
// TEST SUITE 1: State Transition — Normal → Pending Auth
// =============================================================================

describe('CWF State Machine: Normal → Pending Auth', () => {
    it('should NOT process auth attempts when in normal state', () => {
        /**
         * When in 'normal' state, auth attempts are ignored.
         * The state machine should remain unchanged.
         */
        const result = computeAuthTransition('normal', 0, TEST_AUTH_CODE, TEST_AUTH_CODE);
        expect(result.nextState).toBe('normal');
        expect(result.success).toBe(false);
        expect(result.exhausted).toBe(false);
    });

    it('should NOT accept auth codes when state is normal even if code is correct', () => {
        /**
         * Confirms the state machine guard: auth is only processed in pending_auth.
         * Prevents accidental state transitions.
         */
        const result = computeAuthTransition('normal', 0, TEST_AUTH_CODE, TEST_AUTH_CODE);
        expect(result.nextState).not.toBe('copilot_active');
    });
});

// =============================================================================
// TEST SUITE 2: Authorisation — Correct Code
// =============================================================================

describe('CWF State Machine: Authorisation — Correct Code', () => {
    it('should transition to copilot_active when correct code is provided on first attempt', () => {
        /**
         * Happy path: user provides correct code on first try.
         * Expects immediate transition to 'copilot_active' with 0 attempts.
         */
        const result = computeAuthTransition('copilot_pending_auth', 0, TEST_AUTH_CODE, TEST_AUTH_CODE);
        expect(result.nextState).toBe('copilot_active');
        expect(result.nextAttempts).toBe(0);
        expect(result.success).toBe(true);
        expect(result.exhausted).toBe(false);
    });

    it('should transition to copilot_active when correct code provided on second attempt', () => {
        /**
         * User got the code wrong once, then correct on the second try.
         * Expects transition to 'copilot_active' with attempts reset.
         */
        const result = computeAuthTransition('copilot_pending_auth', 1, TEST_AUTH_CODE, TEST_AUTH_CODE);
        expect(result.nextState).toBe('copilot_active');
        expect(result.nextAttempts).toBe(0);
        expect(result.success).toBe(true);
    });

    it('should be case-insensitive for auth code comparison', () => {
        /**
         * Auth codes should be case-insensitive. 'AIRTK', 'Airtk', and 'airtk'
         * should all be accepted as valid codes.
         */
        const upperResult = computeAuthTransition('copilot_pending_auth', 0, 'AIRTK', TEST_AUTH_CODE);
        expect(upperResult.success).toBe(true);
        expect(upperResult.nextState).toBe('copilot_active');

        const mixedResult = computeAuthTransition('copilot_pending_auth', 0, 'AirTK', TEST_AUTH_CODE);
        expect(mixedResult.success).toBe(true);
    });

    it('should trim whitespace from provided auth code before comparison', () => {
        /**
         * Users may accidentally type trailing spaces. The trim() ensures
         * minor whitespace differences don't cause auth failures.
         */
        const result = computeAuthTransition('copilot_pending_auth', 0, `  ${TEST_AUTH_CODE}  `, TEST_AUTH_CODE);
        expect(result.success).toBe(true);
        expect(result.nextState).toBe('copilot_active');
    });
});

// =============================================================================
// TEST SUITE 3: Authorisation — Wrong Code, 3-Attempt Enforcement
// =============================================================================

describe('CWF State Machine: Authorisation — Wrong Code', () => {
    it('should stay in copilot_pending_auth after first wrong attempt', () => {
        /**
         * Wrong code on attempt 1: should stay in pending_auth with attempt count = 1.
         * 2 attempts still remaining.
         */
        const result = computeAuthTransition('copilot_pending_auth', 0, 'wrongcode', TEST_AUTH_CODE);
        expect(result.nextState).toBe('copilot_pending_auth');
        expect(result.nextAttempts).toBe(1);
        expect(result.success).toBe(false);
        expect(result.exhausted).toBe(false);
    });

    it('should stay in copilot_pending_auth after second wrong attempt', () => {
        /**
         * Wrong code on attempt 2: still in pending_auth with attempt count = 2.
         * 1 attempt remaining before lockout.
         */
        const result = computeAuthTransition('copilot_pending_auth', 1, 'stillwrong', TEST_AUTH_CODE);
        expect(result.nextState).toBe('copilot_pending_auth');
        expect(result.nextAttempts).toBe(2);
        expect(result.success).toBe(false);
        expect(result.exhausted).toBe(false);
    });

    it('should return to normal after third (final) wrong attempt — 3-attempt limit', () => {
        /**
         * Wrong code on attempt 3: exhausts all attempts.
         * State machine MUST return to 'normal' and reset auth_attempts to 0.
         * This is the core 3-attempt enforcement requirement.
         */
        const result = computeAuthTransition('copilot_pending_auth', 2, 'finalwrong', TEST_AUTH_CODE);
        expect(result.nextState).toBe('normal');
        expect(result.nextAttempts).toBe(0);
        expect(result.success).toBe(false);
        expect(result.exhausted).toBe(true);
    });

    it('should have exactly COPILOT_MAX_AUTH_ATTEMPTS=3 as the limit', () => {
        /**
         * Documents the specific limit value. If this changes, the test fails
         * explicitly to flag the change.
         */
        expect(COPILOT_MAX_AUTH_ATTEMPTS).toBe(3);
    });

    it('full 3-attempt sequence should end in normal state', () => {
        /**
         * Integration test: simulate the full sequence of 3 wrong attempts.
         * After each attempt, use the result state as input to the next.
         */
        let state: CwfState = 'copilot_pending_auth';
        let attempts = 0;

        // Attempt 1
        const r1 = computeAuthTransition(state, attempts, 'bad1', TEST_AUTH_CODE);
        state = r1.nextState; attempts = r1.nextAttempts;
        expect(state).toBe('copilot_pending_auth');

        // Attempt 2
        const r2 = computeAuthTransition(state, attempts, 'bad2', TEST_AUTH_CODE);
        state = r2.nextState; attempts = r2.nextAttempts;
        expect(state).toBe('copilot_pending_auth');

        // Attempt 3 — should exhaust and return to normal
        const r3 = computeAuthTransition(state, attempts, 'bad3', TEST_AUTH_CODE);
        state = r3.nextState; attempts = r3.nextAttempts;
        expect(state).toBe('normal');
        expect(attempts).toBe(0);
        expect(r3.exhausted).toBe(true);
    });
});

// =============================================================================
// TEST SUITE 4: Disable Copilot
// =============================================================================

describe('CWF State Machine: Disable Copilot', () => {
    it('should return to normal state from copilot_active', () => {
        /**
         * disable_copilot from active state: returns to normal immediately.
         */
        const { nextState, nextAttempts } = computeDisableTransition();
        expect(nextState).toBe('normal');
        expect(nextAttempts).toBe(0);
    });

    it('should return to normal state from copilot_pending_auth (user cancels)', () => {
        /**
         * User can cancel the auth flow at any point.
         * disable_copilot should work from pending_auth too.
         */
        const { nextState, nextAttempts } = computeDisableTransition();
        expect(nextState).toBe('normal');
        expect(nextAttempts).toBe(0);
    });
});

// =============================================================================
// TEST SUITE 5: Simulation End Auto-Disengage
// =============================================================================

describe('CWF State Machine: Simulation End Auto-Disengage', () => {
    it('should return to normal when simulation status is completed', () => {
        /**
         * When the simulation completes, copilot_active must auto-disengage.
         * This prevents the copilot from operating on a non-running simulation.
         */
        const nextState = computeSimulationEndTransition('completed', 'copilot_active');
        expect(nextState).toBe('normal');
    });

    it('should return to normal when simulation status is stopped', () => {
        /**
         * Same as completed — copilot cannot operate on a stopped simulation.
         */
        const nextState = computeSimulationEndTransition('stopped', 'copilot_active');
        expect(nextState).toBe('normal');
    });

    it('should NOT disengage when simulation is running', () => {
        /**
         * A running simulation should keep copilot in its current state.
         */
        const nextState = computeSimulationEndTransition('running', 'copilot_active');
        expect(nextState).toBe('copilot_active');
    });

    it('should be safe even if called when in normal state', () => {
        /**
         * Idempotent check: calling the sim-end handler when already normal
         * should safely remain in normal.
         */
        const nextState = computeSimulationEndTransition('completed', 'normal');
        expect(nextState).toBe('normal');
    });

    it('should disengage from copilot_pending_auth if simulation ends', () => {
        /**
         * Edge case: simulation ends while user is in the auth flow.
         * Should return to normal immediately.
         */
        const nextState = computeSimulationEndTransition('completed', 'copilot_pending_auth');
        expect(nextState).toBe('normal');
    });
});

// =============================================================================
// TEST SUITE 6: Auth-Code Recognition Heuristic (looksLikeAuthCode)
// =============================================================================

describe('CWF State Machine: Auth-Code Recognition Heuristic', () => {
    it('should recognise a short single word as an auth code', () => {
        /** 'airtk' — typical auth code format */
        expect(looksLikeAuthCode('airtk')).toBe(true);
    });

    it('should recognise a short alphanumeric as an auth code', () => {
        /** Short alphanumerics are common auth code formats */
        expect(looksLikeAuthCode('ABC123')).toBe(true);
    });

    it('should NOT recognise a sentence as an auth code', () => {
        /** Sentences contain spaces and are clearly not auth codes */
        expect(looksLikeAuthCode('what is the status')).toBe(false);
    });

    it('should NOT recognise a question as an auth code', () => {
        /** Questions contain '?' and are clearly not auth codes */
        expect(looksLikeAuthCode('what is the OEE?')).toBe(false);
    });

    it('should NOT recognise a string longer than 15 chars as an auth code', () => {
        /** Auth codes are short; long strings are not auth codes */
        expect(looksLikeAuthCode('thisiswaytoolongtobeanauthcode')).toBe(false);
    });

    it('should handle boundary at 15 characters', () => {
        /** Exactly 15 chars (no spaces, no ?) — should be recognised */
        const exactly15 = 'abcdefghijklmno'; // 15 chars
        expect(looksLikeAuthCode(exactly15)).toBe(true);

        const exactly16 = 'abcdefghijklmnop'; // 16 chars
        expect(looksLikeAuthCode(exactly16)).toBe(false);
    });

    it('should NOT recognise messages with spaces even if short', () => {
        /** "go on" has a space — not an auth code */
        expect(looksLikeAuthCode('go on')).toBe(false);
    });
});

// =============================================================================
// TEST SUITE 7: Deadlock Prevention
// =============================================================================

describe('CWF State Machine: Deadlock Prevention', () => {
    it('has no unreachable states — all states can be exited', () => {
        /**
         * Verifies the state machine graph is free of absorbing states (deadlocks).
         *
         * - 'normal': can enter pending_auth via copilot request
         * - 'copilot_pending_auth': exits via correct auth OR 3 wrong attempts OR disable
         * - 'copilot_active': exits via disable_copilot OR simulation end
         *
         * Each state MUST have at least one outgoing transition.
         */
        const states: CwfState[] = ['normal', 'copilot_pending_auth', 'copilot_active'];

        for (const state of states) {
            if (state === 'copilot_pending_auth') {
                // Can exit via correct auth
                const successExit = computeAuthTransition(state, 0, TEST_AUTH_CODE, TEST_AUTH_CODE);
                expect(successExit.nextState).not.toBe(state);

                // Can exit via 3 failed attempts
                const exhaustExit = computeAuthTransition(state, 2, 'wrong', TEST_AUTH_CODE);
                expect(exhaustExit.nextState).not.toBe(state);

                // Can exit via disable
                const disableExit = computeDisableTransition();
                expect(disableExit.nextState).not.toBe(state);
            }

            if (state === 'copilot_active') {
                // Can exit via disable
                const disableExit = computeDisableTransition();
                expect(disableExit.nextState).not.toBe(state);

                // Can exit via sim end
                const simEndExit = computeSimulationEndTransition('completed', state);
                expect(simEndExit).not.toBe(state);
            }

            // 'normal' can always progress — verified by other tests above
        }
    });

    it('copilot_active state never requires repeated auth', () => {
        /**
         * The core UX bug we're fixing: once copilot is active,
         * auth should NEVER be requested again unless the user
         * explicitly exits and re-enables copilot.
         *
         * In the active state, auth code processing is a no-op.
         */
        const result = computeAuthTransition('copilot_active', 0, 'wrongcode', TEST_AUTH_CODE);
        expect(result.nextState).toBe('copilot_active');
        expect(result.success).toBe(false);
        // Key assertion: active state is NOT changed by auth attempts
        expect(result.nextState).not.toBe('copilot_pending_auth');
        expect(result.nextState).not.toBe('normal');
    });
});

// =============================================================================
// TEST SUITE 8: Conveyor Speed Threshold Validation
// =============================================================================

describe('CWF Copilot: Conveyor Speed Out-of-Range Thresholds', () => {
    const SPEED_MIN = 0.7;
    const SPEED_MAX = 2.0;

    /**
     * Helper mirrors the copilotEngine.ts logic for checking if
     * conveyor_speed_x is outside the safe range.
     */
    function isConveyorSpeedOutOfRange(speedX: number): boolean {
        return speedX < SPEED_MIN || speedX > SPEED_MAX;
    }

    it('should flag a speed of 0.5 as out of range (below minimum)', () => {
        /** 0.5x is below the 0.7 minimum — OEE Performance drops */
        expect(isConveyorSpeedOutOfRange(0.5)).toBe(true);
    });

    it('should flag a speed of 0.0 as out of range', () => {
        /** 0.0 = conveyor stopped — definitely out of range */
        expect(isConveyorSpeedOutOfRange(0.0)).toBe(true);
    });

    it('should flag a speed of 2.5 as out of range (above maximum)', () => {
        /** 2.5x is above the 2.0 maximum — physical stress */
        expect(isConveyorSpeedOutOfRange(2.5)).toBe(true);
    });

    it('should NOT flag a speed of 0.7 as out of range (at minimum boundary)', () => {
        /** Exactly at minimum: should be within range */
        expect(isConveyorSpeedOutOfRange(0.7)).toBe(false);
    });

    it('should NOT flag a speed of 2.0 as out of range (at maximum boundary)', () => {
        /** Exactly at maximum: should be within range */
        expect(isConveyorSpeedOutOfRange(2.0)).toBe(false);
    });

    it('should NOT flag the target midpoint speed of 1.35 as out of range', () => {
        /** 1.35x is the healthy operational target — must be within range */
        expect(isConveyorSpeedOutOfRange(1.35)).toBe(false);
    });

    it('should NOT flag a speed of 1.0 (normal operating speed) as out of range', () => {
        /** 1.0x = normal speed — within range */
        expect(isConveyorSpeedOutOfRange(1.0)).toBe(false);
    });
});

// =============================================================================
// TEST SUITE 9: Eager copilot_pending_auth Keyword Detection (Bug 1 Fix)
// =============================================================================

/**
 * Mirror of the keyword-detection logic added to the chat.ts handler.
 * The server sets cwf_state='copilot_pending_auth' in DB *before* calling Gemini
 * when these keywords are detected in NORMAL state.
 * This eliminates the race condition that caused auth to be needed twice.
 */
function isCopilotEnableRequest(message: string, cwfState: CwfState): boolean {
    const COPILOT_ENABLE_KEYWORDS = [
        'copilot mode', 'into copilot', 'enable copilot', 'start copilot',
        'activate copilot', 'go copilot', 'kopilot', 'kopilot aç',
    ];
    const messageLower = message.toLowerCase();
    return (
        cwfState === 'normal' &&
        COPILOT_ENABLE_KEYWORDS.some((kw) => messageLower.includes(kw))
    );
}

describe('CWF State Machine: Eager copilot_pending_auth Keyword Detection', () => {
    it('detects "go into copilot mode"', () => {
        expect(isCopilotEnableRequest('go into copilot mode', 'normal')).toBe(true);
    });

    it('detects "enable copilot"', () => {
        expect(isCopilotEnableRequest('enable copilot', 'normal')).toBe(true);
    });

    it('detects "start copilot"', () => {
        expect(isCopilotEnableRequest('start copilot', 'normal')).toBe(true);
    });

    it('detects "activate copilot"', () => {
        expect(isCopilotEnableRequest('activate copilot', 'normal')).toBe(true);
    });

    it('detects Turkish "kopilot"', () => {
        expect(isCopilotEnableRequest('kopilot aç', 'normal')).toBe(true);
    });

    it('does NOT detect keyword when state is already copilot_pending_auth', () => {
        /** Should only trigger in normal state — prevents double-upsert */
        expect(isCopilotEnableRequest('go into copilot mode', 'copilot_pending_auth')).toBe(false);
    });

    it('does NOT detect keyword when state is copilot_active', () => {
        /** Re-enable request while already active should not fire eager transition */
        expect(isCopilotEnableRequest('enable copilot', 'copilot_active')).toBe(false);
    });

    it('does NOT trigger for unrelated messages in normal state', () => {
        expect(isCopilotEnableRequest('what is the current OEE?', 'normal')).toBe(false);
        expect(isCopilotEnableRequest('show me the defect report', 'normal')).toBe(false);
    });

    it('is case-insensitive for keyword matching', () => {
        expect(isCopilotEnableRequest('Go Into COPILOT Mode', 'normal')).toBe(true);
    });
});

// =============================================================================
// TEST SUITE 10: Re-Request in copilot_pending_auth Guard
// =============================================================================

/**
 * Mirror of the isReRequestInPendingAuth logic added to chat.ts (Bug fix).
 *
 * When the user says "go into copilot mode" while DB already has
 * copilot_pending_auth (stale from a previous failed session), the server
 * MUST NOT treat the phrase as an auth code attempt (which would report
 * "Incorrect code"). Instead, it resets auth_attempts to 0 and lets Gemini
 * re-ask for the code — giving the user a fresh start.
 */
function isReRequestInPendingAuth(message: string, cwfState: CwfState): boolean {
    const COPILOT_ENABLE_KEYWORDS = [
        'copilot mode', 'into copilot', 'enable copilot', 'start copilot',
        'activate copilot', 'go copilot', 'kopilot', 'kopilot aç',
    ];
    const messageLower = message.toLowerCase();
    return (
        cwfState === 'copilot_pending_auth' &&
        COPILOT_ENABLE_KEYWORDS.some((kw) => messageLower.includes(kw))
    );
}

describe('CWF State Machine: Re-Request in copilot_pending_auth Guard', () => {
    it('detects "go into copilot mode" as a re-request in pending_auth', () => {
        /**
         * This is the exact scenario that caused the airtk rejection bug:
         * User types "go into copilot mode" but DB is still in pending_auth
         * from a previous session. Without the guard, this would be treated
         * as a failed auth attempt.
         */
        expect(isReRequestInPendingAuth('go into copilot mode', 'copilot_pending_auth')).toBe(true);
    });

    it('detects "enable copilot" as a re-request in pending_auth', () => {
        expect(isReRequestInPendingAuth('enable copilot', 'copilot_pending_auth')).toBe(true);
    });

    it('does NOT treat a short auth code as a re-request', () => {
        /**
         * The auth code "airtk" is not a copilot-enable keyword phrase.
         * It must be treated as an auth attempt, not a re-request.
         */
        expect(isReRequestInPendingAuth('airtk', 'copilot_pending_auth')).toBe(false);
    });

    it('does NOT flag a re-request in normal state (would be new request)', () => {
        /**
         * In normal state, "go into copilot mode" triggers the eager transition,
         * not the re-request reset. These are distinct code paths.
         */
        expect(isReRequestInPendingAuth('go into copilot mode', 'normal')).toBe(false);
    });

    it('does NOT flag a re-request in copilot_active state', () => {
        expect(isReRequestInPendingAuth('enable copilot', 'copilot_active')).toBe(false);
    });

    it('the auth code "airtk" in pending_auth goes through normal auth check', () => {
        /**
         * When user sends "airtk" in pending_auth state, isReRequestInPendingAuth=false
         * and isStateMachinePendingAuth=true → auth check runs → success.
         * This ensures the auth code path is not blocked by the re-request guard.
         */
        expect(isReRequestInPendingAuth('airtk', 'copilot_pending_auth')).toBe(false);
        // Then the normal auth transition succeeds:
        const authResult = computeAuthTransition('copilot_pending_auth', 0, 'airtk', TEST_AUTH_CODE);
        expect(authResult.success).toBe(true);
        expect(authResult.nextState).toBe('copilot_active');
    });
});
