/**
 * tickSnapshotRingBuffer.test.ts — Unit Tests for TickSnapshot Ring Buffer
 *
 * PHASE 2 of the Simulate-Ahead migration.
 *
 * Validates the ring buffer mechanics: push, consume, peek, overflow wrapping,
 * buffer clearing, and getBufferedCount. Uses the actual Zustand store in
 * isolation (no React, no Supabase).
 *
 * Tests:
 *   - pushTickSnapshot writes to the buffer and advances write cursor
 *   - consumeTickSnapshot reads and advances read cursor
 *   - peekTickSnapshot reads without advancing
 *   - getBufferedCount returns correct count
 *   - Buffer overflow wraps and drops oldest entry
 *   - clearTickSnapshots resets all cursors and entries
 *   - TickSnapshot contains correct event data
 */
/// <reference types="vitest/globals" />

import { describe, it, expect, beforeEach } from 'vitest';
import { useSimulationDataStore } from '../../store/simulationDataStore';
import { SNAPSHOT_BUFFER_SIZE } from '../../lib/params/simulation';
import type { TickSnapshot } from '../../store/slices/tickSnapshotSlice';

// =============================================================================
// HELPERS — Create mock TickSnapshot records
// =============================================================================

/**
 * Create a minimal TickSnapshot for testing.
 * Contains no events — just the tick number and empty arrays.
 *
 * @param tick - The sim tick this snapshot represents
 * @returns A TickSnapshot with empty event arrays
 */
function makeSnapshot(tick: number): TickSnapshot {
    return {
        tick,
        productionTick: Math.floor(tick / 2),
        tilesCreated: [],
        movements: [],
        completions: [],
        counters: {
            totalProduced: tick,
            firstQuality: 0,
            secondQuality: 0,
            scrapGraded: 0,
            onBelt: 0,
        },
    };
}

/**
 * Create a TickSnapshot with specific event data for event-content tests.
 *
 * @param tick - The sim tick this snapshot represents
 * @returns A TickSnapshot with sample events
 */
function makeSnapshotWithEvents(tick: number): TickSnapshot {
    return {
        tick,
        productionTick: Math.floor(tick / 2),
        tilesCreated: [{ tileId: `tile-${tick}`, tileNumber: tick }],
        movements: [{
            tileId: `tile-${tick - 1}`,
            tileNumber: tick - 1,
            fromStation: 'press',
            toStation: 'dryer',
            defectDetected: false,
            scrappedHere: false,
        }],
        completions: [{
            tileId: `tile-${tick - 10}`,
            tileNumber: tick - 10,
            finalGrade: 'first_quality',
            destination: 'shipment',
        }],
        counters: {
            totalProduced: tick,
            firstQuality: tick - 5,
            secondQuality: 2,
            scrapGraded: 3,
            onBelt: 7,
        },
    };
}

// =============================================================================
// TEST SUITE
// =============================================================================

describe('TickSnapshot Ring Buffer — Phase 2', () => {

    /**
     * Reset the data store before each test to prevent cross-contamination.
     */
    beforeEach(() => {
        useSimulationDataStore.getState().resetDataStore();
    });

    // ─────────────────────────────────────────────────────────────────
    // Basic push and consume
    // ─────────────────────────────────────────────────────────────────

    it('should push a snapshot and consume it', () => {
        const store = useSimulationDataStore.getState();
        const snap = makeSnapshot(1);

        /** Push one snapshot */
        store.pushTickSnapshot(snap);

        /** Buffered count should be 1 */
        expect(store.getBufferedCount()).toBe(1);

        /** Consume should return the pushed snapshot */
        const consumed = store.consumeTickSnapshot();
        expect(consumed).not.toBeNull();
        expect(consumed!.tick).toBe(1);

        /** After consume, buffered count should be 0 */
        expect(useSimulationDataStore.getState().getBufferedCount()).toBe(0);
    });

    // ─────────────────────────────────────────────────────────────────
    // Peek does not advance cursor
    // ─────────────────────────────────────────────────────────────────

    it('should peek without advancing the read cursor', () => {
        const store = useSimulationDataStore.getState();
        store.pushTickSnapshot(makeSnapshot(5));

        /** Peek returns the snapshot */
        const peeked = store.peekTickSnapshot();
        expect(peeked).not.toBeNull();
        expect(peeked!.tick).toBe(5);

        /** Buffered count unchanged after peek */
        expect(useSimulationDataStore.getState().getBufferedCount()).toBe(1);

        /** Peek again returns the same snapshot */
        const peekedAgain = useSimulationDataStore.getState().peekTickSnapshot();
        expect(peekedAgain!.tick).toBe(5);
    });

    // ─────────────────────────────────────────────────────────────────
    // Empty buffer returns null
    // ─────────────────────────────────────────────────────────────────

    it('should return null when consuming from an empty buffer', () => {
        const store = useSimulationDataStore.getState();
        expect(store.consumeTickSnapshot()).toBeNull();
        expect(store.peekTickSnapshot()).toBeNull();
        expect(store.getBufferedCount()).toBe(0);
    });

    // ─────────────────────────────────────────────────────────────────
    // Multiple push and consume (FIFO order)
    // ─────────────────────────────────────────────────────────────────

    it('should maintain FIFO order across multiple pushes', () => {
        const store = useSimulationDataStore.getState();

        /** Push 5 snapshots */
        for (let i = 1; i <= 5; i++) {
            store.pushTickSnapshot(makeSnapshot(i));
        }

        /** Buffered count should be 5 */
        expect(useSimulationDataStore.getState().getBufferedCount()).toBe(5);

        /** Consume in FIFO order */
        for (let i = 1; i <= 5; i++) {
            const snap = useSimulationDataStore.getState().consumeTickSnapshot();
            expect(snap).not.toBeNull();
            expect(snap!.tick).toBe(i);
        }

        /** Buffer empty after consuming all */
        expect(useSimulationDataStore.getState().getBufferedCount()).toBe(0);
    });

    // ─────────────────────────────────────────────────────────────────
    // Buffer overflow wraps around
    // ─────────────────────────────────────────────────────────────────

    it('should wrap around when buffer overflows, dropping oldest entries', () => {
        const store = useSimulationDataStore.getState();

        /** Fill the buffer completely + one extra to cause overflow */
        for (let i = 1; i <= SNAPSHOT_BUFFER_SIZE + 1; i++) {
            store.pushTickSnapshot(makeSnapshot(i));
        }

        /** Buffered count should be capped at SNAPSHOT_BUFFER_SIZE */
        const currentStore = useSimulationDataStore.getState();
        expect(currentStore.getBufferedCount()).toBe(SNAPSHOT_BUFFER_SIZE);

        /** First consumed snapshot should be tick 2 (tick 1 was dropped) */
        const first = currentStore.consumeTickSnapshot();
        expect(first).not.toBeNull();
        expect(first!.tick).toBe(2);
    });

    // ─────────────────────────────────────────────────────────────────
    // clearTickSnapshots resets everything
    // ─────────────────────────────────────────────────────────────────

    it('should reset all state on clearTickSnapshots', () => {
        const store = useSimulationDataStore.getState();

        /** Push some snapshots */
        for (let i = 1; i <= 5; i++) {
            store.pushTickSnapshot(makeSnapshot(i));
        }
        /** Consume one */
        useSimulationDataStore.getState().consumeTickSnapshot();

        /** Clear the buffer */
        useSimulationDataStore.getState().clearTickSnapshots();

        /** Everything should be reset */
        const state = useSimulationDataStore.getState();
        expect(state.getBufferedCount()).toBe(0);
        expect(state.tickSnapshotWriteIndex).toBe(0);
        expect(state.tickSnapshotReadIndex).toBe(0);
        expect(state.tickSnapshotWriteCount).toBe(0);
        expect(state.tickSnapshotReadCount).toBe(0);

        /** All buffer slots should be null */
        expect(state.tickSnapshotBuffer.every((slot) => slot === null)).toBe(true);
    });

    // ─────────────────────────────────────────────────────────────────
    // Snapshot event content is preserved
    // ─────────────────────────────────────────────────────────────────

    it('should preserve event data in pushed snapshots', () => {
        const store = useSimulationDataStore.getState();
        const snap = makeSnapshotWithEvents(20);

        store.pushTickSnapshot(snap);

        const consumed = useSimulationDataStore.getState().consumeTickSnapshot();
        expect(consumed).not.toBeNull();

        /** Verify tilesCreated */
        expect(consumed!.tilesCreated).toHaveLength(1);
        expect(consumed!.tilesCreated[0].tileId).toBe('tile-20');
        expect(consumed!.tilesCreated[0].tileNumber).toBe(20);

        /** Verify movements */
        expect(consumed!.movements).toHaveLength(1);
        expect(consumed!.movements[0].fromStation).toBe('press');
        expect(consumed!.movements[0].toStation).toBe('dryer');

        /** Verify completions */
        expect(consumed!.completions).toHaveLength(1);
        expect(consumed!.completions[0].finalGrade).toBe('first_quality');
        expect(consumed!.completions[0].destination).toBe('shipment');

        /** Verify counters */
        expect(consumed!.counters.totalProduced).toBe(20);
        expect(consumed!.counters.onBelt).toBe(7);
    });

    // ─────────────────────────────────────────────────────────────────
    // Buffer mixed read/write interleaving
    // ─────────────────────────────────────────────────────────────────

    it('should handle interleaved push and consume operations', () => {
        const store = useSimulationDataStore.getState();

        /** Push 3, consume 2, push 3 more */
        store.pushTickSnapshot(makeSnapshot(1));
        store.pushTickSnapshot(makeSnapshot(2));
        store.pushTickSnapshot(makeSnapshot(3));

        useSimulationDataStore.getState().consumeTickSnapshot(); // tick 1
        useSimulationDataStore.getState().consumeTickSnapshot(); // tick 2

        useSimulationDataStore.getState().pushTickSnapshot(makeSnapshot(4));
        useSimulationDataStore.getState().pushTickSnapshot(makeSnapshot(5));
        useSimulationDataStore.getState().pushTickSnapshot(makeSnapshot(6));

        /** Buffer should have 4 unconsumed: 3, 4, 5, 6 */
        expect(useSimulationDataStore.getState().getBufferedCount()).toBe(4);

        /** Consume in FIFO order */
        expect(useSimulationDataStore.getState().consumeTickSnapshot()!.tick).toBe(3);
        expect(useSimulationDataStore.getState().consumeTickSnapshot()!.tick).toBe(4);
        expect(useSimulationDataStore.getState().consumeTickSnapshot()!.tick).toBe(5);
        expect(useSimulationDataStore.getState().consumeTickSnapshot()!.tick).toBe(6);

        /** Buffer empty */
        expect(useSimulationDataStore.getState().getBufferedCount()).toBe(0);
    });

    // ─────────────────────────────────────────────────────────────────
    // resetDataStore clears the ring buffer
    // ─────────────────────────────────────────────────────────────────

    it('should clear the ring buffer on resetDataStore', () => {
        const store = useSimulationDataStore.getState();

        /** Push snapshots */
        for (let i = 1; i <= 5; i++) {
            store.pushTickSnapshot(makeSnapshot(i));
        }
        expect(useSimulationDataStore.getState().getBufferedCount()).toBe(5);

        /** Full store reset */
        useSimulationDataStore.getState().resetDataStore();

        /** Ring buffer should be empty */
        const state = useSimulationDataStore.getState();
        expect(state.getBufferedCount()).toBe(0);
        expect(state.tickSnapshotWriteCount).toBe(0);
        expect(state.tickSnapshotReadCount).toBe(0);
    });
});
