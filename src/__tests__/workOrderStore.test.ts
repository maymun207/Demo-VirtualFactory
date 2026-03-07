/**
 * workOrderStore.test.ts — Unit Tests for Work Order Store
 *
 * Validates the Zustand workOrderStore state and action correctness:
 *  - Initial state matches defaults (selectedWorkOrderId, pressLimitReached, tilesSpawned)
 *  - setSelectedWorkOrderId updates the selected ID and resets pressLimitReached + tilesSpawned
 *  - setPressLimitReached correctly updates the flag
 *  - incrementTilesSpawned increments tilesSpawned by 1 per call
 *  - resetWorkOrderState resets pressLimitReached and tilesSpawned but preserves selectedWorkOrderId
 *
 * Note: the store is reset between tests using setState directly
 * to ensure test isolation without triggering external side effects.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useWorkOrderStore } from '../store/workOrderStore';
import { DEFAULT_WORK_ORDER_ID } from '../lib/params/demo';

// ─── Test Helpers ─────────────────────────────────────────────────────────────

/**
 * Reset the store to its factory-default state before each test.
 * This prevents test state from leaking between individual tests.
 * We use setState directly to reset without triggering external side effects.
 */
beforeEach(() => {
  /** Reset ALL work order store state to initial values before each test */
  useWorkOrderStore.setState({
    selectedWorkOrderId: DEFAULT_WORK_ORDER_ID,
    pressLimitReached: false,
    tilesSpawned: 0,
  });
});

// ─── Initial State ────────────────────────────────────────────────────────────

describe('useWorkOrderStore — Initial State', () => {
  /**
   * The store must initialise with the default Work Order ID
   * as configured in lib/params/demo.ts.
   */
  it('selectedWorkOrderId defaults to DEFAULT_WORK_ORDER_ID', () => {
    const { selectedWorkOrderId } = useWorkOrderStore.getState();
    expect(selectedWorkOrderId).toBe(DEFAULT_WORK_ORDER_ID);
  });

  /**
   * pressLimitReached must be false at initialisation
   * so the conveyor starts spawning tiles correctly when simulation begins.
   */
  it('pressLimitReached defaults to false', () => {
    const { pressLimitReached } = useWorkOrderStore.getState();
    expect(pressLimitReached).toBe(false);
  });

  /**
   * tilesSpawned must be 0 at initialisation.
   * A fresh simulation begins with zero physical tile spawns recorded.
   */
  it('tilesSpawned defaults to 0', () => {
    const { tilesSpawned } = useWorkOrderStore.getState();
    expect(tilesSpawned).toBe(0);
  });
});

// ─── setSelectedWorkOrderId ───────────────────────────────────────────────────

describe('useWorkOrderStore — setSelectedWorkOrderId', () => {
  /**
   * Switching to a new Work Order ID must be reflected immediately in the store.
   */
  it('updates selectedWorkOrderId to the new value', () => {
    const { setSelectedWorkOrderId } = useWorkOrderStore.getState();

    /** Switch to WorkID#2 */
    setSelectedWorkOrderId('WorkID#2');

    expect(useWorkOrderStore.getState().selectedWorkOrderId).toBe('WorkID#2');
  });

  /**
   * When a user switches Work Orders mid-simulation (or before a new run),
   * pressLimitReached must be cleared. The previous press limit was for
   * a different batch and is no longer valid.
   */
  it('resets pressLimitReached to false when WorkID changes', () => {
    const store = useWorkOrderStore.getState();

    /** Simulate: press limit was reached for WorkID#1 */
    store.setPressLimitReached(true);
    expect(useWorkOrderStore.getState().pressLimitReached).toBe(true);

    /** Switch to WorkID#3 → should clear the press limit */
    store.setSelectedWorkOrderId('WorkID#3');

    expect(useWorkOrderStore.getState().pressLimitReached).toBe(false);
  });

  /**
   * Verify that switching back to an already-selected ID still works correctly.
   */
  it('can be called multiple times to change selection', () => {
    const { setSelectedWorkOrderId } = useWorkOrderStore.getState();

    /** Set to WorkID#2, then back to WorkID#1 */
    setSelectedWorkOrderId('WorkID#2');
    setSelectedWorkOrderId('WorkID#1');

    expect(useWorkOrderStore.getState().selectedWorkOrderId).toBe('WorkID#1');
  });

  /**
   * Switching Work Order must also reset tilesSpawned to 0.
   * Tiles spawned under the previous Work Order are irrelevant to the new batch.
   */
  it('resets tilesSpawned to 0 when WorkID changes', () => {
    const store = useWorkOrderStore.getState();

    /** Simulate some tiles spawned under WorkID#1 */
    store.incrementTilesSpawned();
    store.incrementTilesSpawned();
    expect(useWorkOrderStore.getState().tilesSpawned).toBe(2);

    /** Switch to WorkID#2 — tilesSpawned must reset */
    store.setSelectedWorkOrderId('WorkID#2');

    expect(useWorkOrderStore.getState().tilesSpawned).toBe(0);
  });
});

// ─── setPressLimitReached ─────────────────────────────────────────────────────

describe('useWorkOrderStore — setPressLimitReached', () => {
  /**
   * Setting the flag to true must be reflected immediately.
   * This is called by useWorkOrderEnforcer when pClockCount >= actualTileCount.
   */
  it('sets pressLimitReached to true', () => {
    const { setPressLimitReached } = useWorkOrderStore.getState();

    /** Signal that press production limit has been reached */
    setPressLimitReached(true);

    expect(useWorkOrderStore.getState().pressLimitReached).toBe(true);
  });

  /**
   * Setting the flag to false must work too (used by resetWorkOrderState internally
   * and by the Phase 2 cleanup in useWorkOrderEnforcer).
   */
  it('sets pressLimitReached to false', () => {
    const store = useWorkOrderStore.getState();

    /** First set to true, then back to false */
    store.setPressLimitReached(true);
    store.setPressLimitReached(false);

    expect(useWorkOrderStore.getState().pressLimitReached).toBe(false);
  });

  /**
   * Verify that selectedWorkOrderId is NOT affected when pressLimitReached changes.
   * These two fields are fully independent.
   */
  it('does not change selectedWorkOrderId', () => {
    const store = useWorkOrderStore.getState();

    /** First switch to a non-default ID */
    store.setSelectedWorkOrderId('WorkID#3');
    const idBefore = useWorkOrderStore.getState().selectedWorkOrderId;

    /** Set press limit — should not touch the selected ID */
    store.setPressLimitReached(true);

    expect(useWorkOrderStore.getState().selectedWorkOrderId).toBe(idBefore);
  });
});

// ─── resetWorkOrderState ──────────────────────────────────────────────────────

describe('useWorkOrderStore — resetWorkOrderState', () => {
  /**
   * After a factory reset, pressLimitReached must return to false
   * so the next simulation run starts fresh.
   */
  it('resets pressLimitReached to false', () => {
    const store = useWorkOrderStore.getState();

    /** Simulate a completed production run */
    store.setPressLimitReached(true);
    expect(useWorkOrderStore.getState().pressLimitReached).toBe(true);

    /** Factory reset */
    store.resetWorkOrderState();

    expect(useWorkOrderStore.getState().pressLimitReached).toBe(false);
  });

  /**
   * Critical: selectedWorkOrderId must be PRESERVED across factory resets.
   * Users should not have to re-select their Work Order after resetting the factory.
   * This is a deliberate UX decision — see workOrderStore.ts architecture note.
   */
  it('preserves selectedWorkOrderId across factory resets', () => {
    const store = useWorkOrderStore.getState();

    /** User selected WorkID#3 */
    store.setSelectedWorkOrderId('WorkID#3');
    expect(useWorkOrderStore.getState().selectedWorkOrderId).toBe('WorkID#3');

    /** Factory reset — selection should survive */
    store.resetWorkOrderState();

    expect(useWorkOrderStore.getState().selectedWorkOrderId).toBe('WorkID#3');
  });

  /**
   * resetWorkOrderState must be idempotent: calling it multiple times
   * should not cause errors or unexpected state changes.
   */
  it('is idempotent — can be called multiple times safely', () => {
    const { resetWorkOrderState } = useWorkOrderStore.getState();

    /** Call reset multiple times */
    resetWorkOrderState();
    resetWorkOrderState();
    resetWorkOrderState();

    expect(useWorkOrderStore.getState().pressLimitReached).toBe(false);
    expect(useWorkOrderStore.getState().tilesSpawned).toBe(0);
  });
});

// ─── incrementTilesSpawned ────────────────────────────────────────────────────

describe('useWorkOrderStore — incrementTilesSpawned', () => {
  /**
   * Each call to incrementTilesSpawned must add exactly 1 to tilesSpawned.
   * This mirrors each physical tile spawn in PartSpawner.
   */
  it('increments tilesSpawned by 1 per call', () => {
    const { incrementTilesSpawned } = useWorkOrderStore.getState();

    /** Start at 0, add one spawn */
    incrementTilesSpawned();
    expect(useWorkOrderStore.getState().tilesSpawned).toBe(1);
  });

  it('increments correctly across multiple calls (cumulative)', () => {
    const { incrementTilesSpawned } = useWorkOrderStore.getState();

    /** Simulate 5 physical tile spawns */
    incrementTilesSpawned();
    incrementTilesSpawned();
    incrementTilesSpawned();
    incrementTilesSpawned();
    incrementTilesSpawned();

    expect(useWorkOrderStore.getState().tilesSpawned).toBe(5);
  });

  /**
   * incrementTilesSpawned must NOT affect other store fields.
   */
  it('does not change pressLimitReached or selectedWorkOrderId', () => {
    const store = useWorkOrderStore.getState();
    const idBefore = store.selectedWorkOrderId;

    store.incrementTilesSpawned();
    store.incrementTilesSpawned();

    expect(useWorkOrderStore.getState().selectedWorkOrderId).toBe(idBefore);
    expect(useWorkOrderStore.getState().pressLimitReached).toBe(false);
  });
});

// ─── resetWorkOrderState + tilesSpawned ───────────────────────────────────────

describe('useWorkOrderStore — resetWorkOrderState resets tilesSpawned', () => {
  /**
   * After a factory reset, tilesSpawned must return to 0
   * so the next simulation run counts from zero.
   */
  it('resets tilesSpawned to 0 after a production run', () => {
    const store = useWorkOrderStore.getState();

    /** Simulate a production run: spawn some tiles */
    store.incrementTilesSpawned();
    store.incrementTilesSpawned();
    store.incrementTilesSpawned();
    expect(useWorkOrderStore.getState().tilesSpawned).toBe(3);

    /** Factory reset */
    store.resetWorkOrderState();

    expect(useWorkOrderStore.getState().tilesSpawned).toBe(0);
  });
});
