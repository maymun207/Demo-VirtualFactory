/**
 * useStationQueue.ts — Reusable FIFO Queue Hook for Station Machines
 *
 * Encapsulates the Dryer and Kiln queue subsystems that were previously
 * inlined in ConveyorBelt.tsx. Both stations use the same algorithm:
 *
 *   enqueue → gap-check → dwell-time check → shift → re-position
 *
 * Usage:
 *   const dryerQueue = useStationQueue({ entryT: DRYER_ENTRY_T, ... }, partsRef);
 *   // In useFrame: dryerQueue.tryRelease(false); dryerQueue.enqueue(tileId);
 */

import { useRef, useCallback } from 'react';
import type { PartData } from './types';

// =============================================================================
// Configuration
// =============================================================================

/** Configuration for a single station FIFO queue. */
export interface StationQueueConfig {
  /** Normalized t-position on the spline where tiles enter this queue */
  entryT: number;
  /** Queue must reach this depth before periodic releases begin */
  releaseThreshold: number;
  /** Maximum queue depth — force-releases bypass gap check above this */
  capacity: number;
  /** Offset added to entryT when a tile is released (belt re-entry point) */
  releaseSpacing: number;
  /** Minimum time (ms) a tile must spend in the queue before release */
  minDwellMs: number;
  /** Width of the gap-check zone after entryT (uses STATION_SPACING) */
  stationSpacing: number;
  /** Human-readable name for logging (e.g. 'Dryer', 'Kiln') */
  stationName: string;
}

/** Return type of useStationQueue — the public API surface. */
export interface StationQueueAPI {
  /** Reference to the internal FIFO array (for direct reads like .length) */
  queueRef: React.RefObject<number[]>;

  /**
   * Enqueue a tile into this station's FIFO queue.
   * Sets the tile's queue flags and snaps its t to entryT.
   *
   * @param tileId - ID of the tile to enqueue
   * @param part - The PartData for this tile (mutated in place)
   * @param isQueueKey - 'isQueued' for Dryer, 'isKilnQueued' for Kiln
   * @param hasVisitedKey - 'hasVisitedDryer' for Dryer, 'hasVisitedKiln' for Kiln
   */
  enqueue: (tileId: number, part: PartData) => void;

  /**
   * Attempt to release the oldest tile from the queue.
   *
   * @param bypassGap — When true (force-release), skip the gap check.
   * @param partsRef — Live parts map for gap-check scanning.
   * @returns The released tile ID, or null if blocked/empty.
   */
  tryRelease: (
    bypassGap: boolean,
    partsRef: React.RefObject<Map<number, PartData>>,
  ) => number | null;

  /** Clear the queue and reset gap-check tracking (for session reset). */
  clear: () => void;

  /** Current queue depth (getter for convenience). */
  readonly size: number;
}

// =============================================================================
// Hook
// =============================================================================

/**
 * useStationQueue — Custom hook for a single station FIFO queue.
 *
 * @param config - Station queue parameters (entryT, threshold, capacity, etc.)
 * @param queueFlag - PartData boolean key for "is in this queue" ('isQueued' | 'isKilnQueued')
 * @param visitedFlag - PartData boolean key for "has visited this station" ('hasVisitedDryer' | 'hasVisitedKiln')
 */
export function useStationQueue(
  config: StationQueueConfig,
  queueFlag: 'isQueued' | 'isKilnQueued',
  visitedFlag: 'hasVisitedDryer' | 'hasVisitedKiln',
): StationQueueAPI {
  const queueRef = useRef<number[]>([]);
  const lastReleasedIdRef = useRef<number | null>(null);

  const enqueue = useCallback(
    (tileId: number, part: PartData) => {
      part[queueFlag] = true;
      part[visitedFlag] = true;
      part.enteredQueueAt = performance.now();
      part.t = config.entryT; // Snap to entry point
      queueRef.current.push(tileId);
    },
    [config.entryT, queueFlag, visitedFlag],
  );

  /**
   * tryRelease — the core release algorithm.
   *
   * 1. Gap check: scan all live belt tiles for one within STATION_SPACING
   *    after entryT. If found, block the release (unless bypassGap).
   * 2. Dwell time check: ensure the head tile has been in the queue
   *    for at least minDwellMs milliseconds.
   * 3. Shift the head tile out of the FIFO array.
   * 4. Re-position the tile at entryT + releaseSpacing.
   * 5. Track the released ID for the next gap check cycle.
   */
  const tryRelease = useCallback(
    (
      bypassGap: boolean,
      partsRef: React.RefObject<Map<number, PartData>>,
    ): number | null => {
      if (queueRef.current.length === 0) return null;

      // ── Gap check ────────────────────────────────────────────
      if (!bypassGap) {
        const parts = Array.from(partsRef.current!.values());
        const hasBlocker = parts.some(
          (p) =>
            !p.isQueued &&
            !p.isKilnQueued &&
            p.t > config.entryT &&
            p.t < config.entryT + config.stationSpacing,
        );
        if (hasBlocker) return null;
      }

      // ── Dwell time check ─────────────────────────────────────
      const headId = queueRef.current[0];
      if (headId === undefined) return null;
      const headPart = partsRef.current!.get(headId);
      if (headPart?.enteredQueueAt) {
        const elapsed = performance.now() - headPart.enteredQueueAt;
        if (elapsed < config.minDwellMs) return null;
      }

      // ── Release ──────────────────────────────────────────────
      const releasedId = queueRef.current.shift()!;
      const part = partsRef.current!.get(releasedId);
      if (!part) return null;

      part[queueFlag] = false;
      part.t = config.entryT + config.releaseSpacing;
      part.scale = 1;
      lastReleasedIdRef.current = releasedId;

      return releasedId;
    },
    [config.entryT, config.releaseSpacing, config.stationSpacing, config.minDwellMs, queueFlag],
  );

  const clear = useCallback(() => {
    queueRef.current = [];
    lastReleasedIdRef.current = null;
  }, []);

  return {
    queueRef: queueRef as React.RefObject<number[]>,
    enqueue,
    tryRelease,
    clear,
    get size() {
      return queueRef.current.length;
    },
  };
}
