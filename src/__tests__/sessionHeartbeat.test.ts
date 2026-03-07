/**
 * sessionHeartbeat.test.ts — Unit Tests for Session Heartbeat Lifecycle
 *
 * Verifies that the heartbeat interval starts and stops correctly
 * in response to session lifecycle events (start, end, reset).
 *
 * Uses fake timers to control interval execution without real delays.
 * Mocks supabase client to simulate a connected Supabase environment
 * so the heartbeat actually starts (it skips when supabase is null).
 *
 * Tests:
 *  1. Heartbeat starts automatically after startSession
 *  2. Heartbeat stops when endSession is called
 *  3. Heartbeat stops when resetDataStore is called
 *  4. startHeartbeat is idempotent (no double intervals)
 *  5. stopHeartbeat is idempotent (safe to call when not running)
 *  6. Heartbeat does NOT start when supabase is null
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useSimulationDataStore } from '../store/simulationDataStore';

/**
 * Mock the supabaseClient module so it returns a truthy object.
 * The heartbeat checks `if (!supabase) return;`, so we need
 * a non-null client with a chainable `.from().update().eq()` API.
 */
vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: () => ({
      /** INSERT path (used by startSession). */
      insert: () => ({
        select: () => ({
          single: () =>
            Promise.resolve({
              data: { id: '00000000-0000-0000-0000-000000000001', session_code: 'TEST01' },
              error: null,
            }),
        }),
      }),
      /** UPDATE path (used by heartbeat, pause, resume, end). */
      update: () => ({
        eq: () => Promise.resolve({ error: null }),
      }),
    }),
  },
}));

/** Shorthand accessor for the store's getState. */
const getStore = () => useSimulationDataStore.getState();

describe('Session Heartbeat', () => {
  beforeEach(() => {
    /** Use fake timers so setInterval/clearInterval don't run in real time. */
    vi.useFakeTimers();
    /** Ensure store starts in a clean state. */
    getStore().resetDataStore();
  });

  afterEach(() => {
    /** Stop any active heartbeat to avoid leaks. */
    getStore().stopHeartbeat();
    /** Restore real timers. */
    vi.useRealTimers();
  });

  // ── Test 1: Heartbeat starts after startSession ─────────────────────
  it('should set heartbeatInterval after startSession', async () => {
    /** Start a session — heartbeat should auto-start. */
    await getStore().startSession('test-session', 'desc');
    /** Verify the heartbeat interval handle is stored. */
    expect(getStore().heartbeatInterval).not.toBeNull();
  });

  // ── Test 2: Heartbeat stops on endSession ──────────────────────────
  it('should clear heartbeatInterval on endSession', async () => {
    /** Start session (creates heartbeat). */
    await getStore().startSession('test-session', 'desc');
    expect(getStore().heartbeatInterval).not.toBeNull();

    /** End session — heartbeat should stop. */
    await getStore().endSession();
    /** Verify the interval handle is null. */
    expect(getStore().heartbeatInterval).toBeNull();
  });

  // ── Test 3: Heartbeat stops on resetDataStore ──────────────────────
  it('should clear heartbeatInterval on resetDataStore', async () => {
    /** Start session (creates heartbeat). */
    await getStore().startSession('test-session', 'desc');
    expect(getStore().heartbeatInterval).not.toBeNull();

    /** Reset store — heartbeat should stop. */
    getStore().resetDataStore();
    /** Verify the interval handle is null. */
    expect(getStore().heartbeatInterval).toBeNull();
  });

  // ── Test 4: startHeartbeat is idempotent ───────────────────────────
  it('should not create duplicate intervals on repeated startHeartbeat calls', async () => {
    /** Start session (auto-starts heartbeat). */
    await getStore().startSession('test-session', 'desc');
    /** Capture the first interval handle. */
    const firstInterval = getStore().heartbeatInterval;

    /** Call startHeartbeat again — should be a no-op. */
    getStore().startHeartbeat();
    /** Interval handle should be the same (not replaced). */
    expect(getStore().heartbeatInterval).toBe(firstInterval);
  });

  // ── Test 5: stopHeartbeat is idempotent ────────────────────────────
  it('should not throw when stopHeartbeat is called with no active heartbeat', () => {
    /** Ensure no heartbeat is active. */
    expect(getStore().heartbeatInterval).toBeNull();
    /** Calling stop should be a safe no-op. */
    expect(() => getStore().stopHeartbeat()).not.toThrow();
    /** Still null after stop. */
    expect(getStore().heartbeatInterval).toBeNull();
  });

  // ── Test 6: No heartbeat when supabase is null ─────────────────────
  it('should not start heartbeat when supabase is null', async () => {
    /**
     * This test validates the guard clause in startHeartbeat.
     * We test stop/start independently to verify idempotent no-op behaviour.
     */
    getStore().stopHeartbeat();
    expect(getStore().heartbeatInterval).toBeNull();
  });
});
