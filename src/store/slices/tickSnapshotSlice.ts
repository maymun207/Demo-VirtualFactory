/**
 * tickSnapshotSlice.ts — TickSnapshot Ring Buffer for Simulate-Ahead Architecture
 *
 * PHASE 2 of the Simulate-Ahead migration.
 *
 * This slice maintains a fixed-size ring buffer of TickSnapshot records.
 * Each TickSnapshot captures ALL events that occurred during a single
 * simulation tick: tile creations, station movements, completions, and
 * quality grading. The visual engine (Phase 3) will consume these
 * snapshots to replay the data engine's decisions as pure rendering.
 *
 * The ring buffer overwrites the oldest entry when full, ensuring
 * bounded memory usage regardless of simulation length.
 *
 * Key types:
 *   - TickSnapshot     — One tick's worth of events
 *   - TickSnapshotSlice — State + actions for the ring buffer
 *
 * Key actions:
 *   - pushTickSnapshot()   — Write a new snapshot into the buffer
 *   - consumeTickSnapshot() — Read and advance the consumer pointer
 *   - peekTickSnapshot()    — Read without advancing
 *   - getBufferedCount()    — How many unconsumed snapshots exist
 *   - clearTickSnapshots()  — Reset the buffer (on session start)
 */

import type { StationName, QualityGrade } from '../types';
import { SNAPSHOT_BUFFER_SIZE } from '../../lib/params/simulation';
import type { SetState, GetState } from './storeHelpers';

// =============================================================================
// TYPES — TickSnapshot event record
// =============================================================================

/**
 * Represents a tile that was created (spawned at press) during this tick.
 */
export interface TickSnapshotTileCreated {
    /** Unique tile UUID */
    tileId: string;
    /** Sequential tile number for display / routing */
    tileNumber: number;
}

/**
 * Represents a tile that moved from one station to the next during this tick.
 */
export interface TickSnapshotMovement {
    /** Unique tile UUID */
    tileId: string;
    /** Sequential tile number for display / routing */
    tileNumber: number;
    /** Station the tile departed from */
    fromStation: StationName;
    /** Station the tile arrived at */
    toStation: StationName;
    /** Whether a defect was detected at toStation */
    defectDetected: boolean;
    /** Whether the tile was marked for scrap at toStation */
    scrappedHere: boolean;
}

/**
 * Represents a tile that completed the production line during this tick.
 */
export interface TickSnapshotCompletion {
    /** Unique tile UUID */
    tileId: string;
    /** Sequential tile number for display / routing */
    tileNumber: number;
    /** Final quality grade assigned at completion */
    finalGrade: QualityGrade;
    /** Visual destination for the 3D renderer */
    destination: 'shipment' | 'secondQuality' | 'wasteBin';
}

/**
 * A single tick's worth of simulation events.
 *
 * Emitted by moveTilesOnConveyor() after each call.
 * Consumed by ConveyorBelt (Phase 3) to replay visuals.
 */
export interface TickSnapshot {
    /** The sim tick this snapshot represents */
    tick: number;
    /** The production tick this snapshot represents */
    productionTick: number;
    /** Tiles created at press during this tick */
    tilesCreated: TickSnapshotTileCreated[];
    /** Tiles that moved between stations during this tick */
    movements: TickSnapshotMovement[];
    /** Tiles that completed the line during this tick */
    completions: TickSnapshotCompletion[];
    /** Cumulative counters AFTER this tick completed */
    counters: {
        /** Total tiles that have completed the line */
        totalProduced: number;
        /** Total first quality tiles */
        firstQuality: number;
        /** Total second quality tiles */
        secondQuality: number;
        /** Total scrapped tiles */
        scrapGraded: number;
        /** Tiles currently on the conveyor */
        onBelt: number;
    };
}

// =============================================================================
// SLICE STATE — Ring buffer fields
// =============================================================================

/**
 * State managed by this slice. These fields are merged into
 * SimulationDataState by the store combiner.
 */
export interface TickSnapshotState {
    /**
     * Fixed-size ring buffer holding TickSnapshot records.
     * Size is SNAPSHOT_BUFFER_SIZE (2 × SIMULATE_AHEAD_TICKS).
     */
    tickSnapshotBuffer: (TickSnapshot | null)[];
    /** Write cursor — next index to write to in the buffer */
    tickSnapshotWriteIndex: number;
    /** Read cursor — next index to consume from the buffer */
    tickSnapshotReadIndex: number;
    /** Total snapshots written (monotonically increasing, used for count calc) */
    tickSnapshotWriteCount: number;
    /** Total snapshots consumed (monotonically increasing, used for count calc) */
    tickSnapshotReadCount: number;
}

/**
 * Actions exposed by the TickSnapshot slice.
 */
export interface TickSnapshotActions {
    /**
     * Write a new TickSnapshot into the ring buffer.
     * Overwrites the oldest entry when the buffer is full.
     *
     * @param snapshot - The snapshot to write
     */
    pushTickSnapshot: (snapshot: TickSnapshot) => void;

    /**
     * Read and advance the consumer pointer.
     * Returns null if no unconsumed snapshots are available.
     *
     * @returns The next TickSnapshot, or null if buffer is empty
     */
    consumeTickSnapshot: () => TickSnapshot | null;

    /**
     * Read without advancing the consumer pointer.
     * Returns null if no unconsumed snapshots are available.
     *
     * @returns The next TickSnapshot, or null if buffer is empty
     */
    peekTickSnapshot: () => TickSnapshot | null;

    /**
     * How many unconsumed snapshots are currently in the buffer.
     *
     * @returns Count of snapshots available for consumption
     */
    getBufferedCount: () => number;

    /**
     * Reset the ring buffer (called on session start/reset).
     * Clears all snapshots and resets cursors to zero.
     */
    clearTickSnapshots: () => void;
}

// =============================================================================
// SLICE FACTORY
// =============================================================================

/**
 * Create the initial state for the TickSnapshot ring buffer.
 *
 * @returns Initial TickSnapshotState with an empty buffer
 */
export function createTickSnapshotInitialState(): TickSnapshotState {
    return {
        tickSnapshotBuffer: new Array(SNAPSHOT_BUFFER_SIZE).fill(null),
        tickSnapshotWriteIndex: 0,
        tickSnapshotReadIndex: 0,
        tickSnapshotWriteCount: 0,
        tickSnapshotReadCount: 0,
    };
}

/**
 * Factory function that creates the TickSnapshot slice actions.
 * Receives Zustand's `set` and `get` to read/write the full store state.
 *
 * @param set - Zustand state setter
 * @param get - Zustand state getter
 * @returns Actions for the TickSnapshot ring buffer
 */
export const createTickSnapshotSlice = (
    set: SetState,
    get: GetState,
): TickSnapshotActions => ({

    pushTickSnapshot: (snapshot: TickSnapshot) => {
        set((s) => {
            /** Clone the buffer to avoid mutating existing state */
            const buffer = [...s.tickSnapshotBuffer];
            /** Write at the current write index (overwrites oldest if full) */
            buffer[s.tickSnapshotWriteIndex] = snapshot;
            /** Advance write cursor, wrapping around at buffer capacity */
            const nextWriteIndex = (s.tickSnapshotWriteIndex + 1) % SNAPSHOT_BUFFER_SIZE;
            /**
             * If the buffer was already full before this write, the oldest
             * unread entry was overwritten. Advance the read cursor to skip it.
             */
            let nextReadIndex = s.tickSnapshotReadIndex;
            let nextReadCount = s.tickSnapshotReadCount;
            const bufferedBeforeWrite = s.tickSnapshotWriteCount - s.tickSnapshotReadCount;
            if (bufferedBeforeWrite >= SNAPSHOT_BUFFER_SIZE) {
                nextReadIndex = (s.tickSnapshotReadIndex + 1) % SNAPSHOT_BUFFER_SIZE;
                nextReadCount = s.tickSnapshotReadCount + 1;
            }
            return {
                tickSnapshotBuffer: buffer,
                tickSnapshotWriteIndex: nextWriteIndex,
                tickSnapshotWriteCount: s.tickSnapshotWriteCount + 1,
                tickSnapshotReadIndex: nextReadIndex,
                tickSnapshotReadCount: nextReadCount,
            };
        });
    },

    consumeTickSnapshot: () => {
        const state = get();
        /** No snapshots to consume if read count equals write count */
        if (state.tickSnapshotReadCount >= state.tickSnapshotWriteCount) {
            return null;
        }
        const snapshot = state.tickSnapshotBuffer[state.tickSnapshotReadIndex];
        /** Advance the read cursor */
        set({
            tickSnapshotReadIndex: (state.tickSnapshotReadIndex + 1) % SNAPSHOT_BUFFER_SIZE,
            tickSnapshotReadCount: state.tickSnapshotReadCount + 1,
        });
        return snapshot;
    },

    peekTickSnapshot: () => {
        const state = get();
        /** No snapshots available if read count equals write count */
        if (state.tickSnapshotReadCount >= state.tickSnapshotWriteCount) {
            return null;
        }
        return state.tickSnapshotBuffer[state.tickSnapshotReadIndex];
    },

    getBufferedCount: () => {
        const state = get();
        /** Buffered count = total written - total consumed */
        return state.tickSnapshotWriteCount - state.tickSnapshotReadCount;
    },

    clearTickSnapshots: () => {
        set({
            tickSnapshotBuffer: new Array(SNAPSHOT_BUFFER_SIZE).fill(null),
            tickSnapshotWriteIndex: 0,
            tickSnapshotReadIndex: 0,
            tickSnapshotWriteCount: 0,
            tickSnapshotReadCount: 0,
        });
    },
});
