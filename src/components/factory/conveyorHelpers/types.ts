/**
 * types.ts — Shared type definitions for the ConveyorBelt subsystem.
 *
 * Houses PartData and related types used by ConveyorBelt.tsx,
 * useStationQueue.ts, and other conveyor helper modules.
 *
 * Extracted to avoid circular dependencies between the parent component
 * and its helper hooks.
 */

import type * as THREE from 'three';

/**
 * Internal data for a single tile on the conveyor belt.
 * This is NOT a React component — it's a plain data object
 * managed imperatively inside PartSpawner's useFrame loop.
 */
export interface PartData {
  /** Unique tile ID (matches P-Clock count at spawn time) */
  id: number;
  /** Normalized position on the spline curve (0→1). 0=start, 1=end of line */
  t: number;
  /** Whether this tile was flagged as defective at the sorting station */
  isDefected: boolean;
  /** Whether this tile has started its sort-to-waste-bin animation */
  isSorted: boolean;
  /** Sort animation progress (0→1). At 1.0, tile is removed */
  sortProgress: number;
  /** Whether this tile has started its collect-to-shipment animation */
  isCollected: boolean;
  /** Collect animation progress (0→1). At 1.0, tile is removed */
  collectProgress: number;
  /** Whether this tile has been flagged as second quality by the data layer */
  isSecondQuality: boolean;
  /** Whether this tile has started its sort-to-2nd-quality-box animation */
  isSecondQualitySorted: boolean;
  /** Second quality animation progress (0→1). At 1.0, tile is removed */
  secondQualityProgress: number;
  /** Snapshot of tile's world position when sort/collect begins (pooled) */
  originalPos: THREE.Vector3;
  /** Current visual scale (0→1). Animated on spawn for a grow-in effect */
  scale: number;
  /** How the tile's collect animation should position relative to Y axis.
   * Computed at collect-start time from the current shipmentCount so each
   * tile lands exactly on top of the previous one in the visible stack. */
  collectTargetY: number;
  /** Whether this tile is currently waiting in the dryer FIFO queue */
  isQueued: boolean;
  /** Whether this tile has already passed through the Dryer station */
  hasVisitedDryer: boolean;
  /** Whether this tile is currently waiting in the Kiln FIFO queue */
  isKilnQueued: boolean;
  /** Whether this tile has already passed through the Kiln station */
  hasVisitedKiln: boolean;
  /**
   * High-resolution timestamp (performance.now()) when the tile entered
   * either the Dryer or Kiln queue. Used to enforce minimum dwell time.
   */
  enteredQueueAt: number | null;
  /**
   * Whether this tile has started its per-station scrap arc animation
   * (thrown from the station where the defect was detected to the waste bin).
   */
  isScrapped: boolean;
  /**
   * Animation progress for the scrap arc (0→1).
   * At 1.0, tile has reached the waste bin and is removed from partsRef.
   */
  scrapProgress: number;
}
