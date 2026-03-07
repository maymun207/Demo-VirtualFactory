/**
 * workOrderStore.ts — Work Order Selection and Press Limit State (Zustand)
 *
 * Manages the Work Order feature state for the virtual factory demo:
 *  - Which Work Order is currently selected by the user (WorkID#1/2/3)
 *  - Whether the Press production limit has been reached for the current run
 *  - How many tiles have ACTUALLY been spawned (tilesSpawned counter)
 *
 * Why a separate store?
 *   `simulationStore.ts` is the master clock/conveyor/tile store (physical).
 *   `simulationDataStore.ts` is the Supabase sync/session/data store.
 *   Work Order selection is a DEMO-LAYER concern — it is orthogonal to both and
 *   must NOT be placed in either of those stores to preserve architectural clarity.
 *
 * IMPORTANT — Why tilesSpawned instead of pClockCount?
 *   pClockCount is the P-Clock tick counter. It advances on every P-Clock tick
 *   regardless of whether a tile was actually spawned. If the conveyor belt is
 *   full (MAX_VISIBLE_PARTS reached), some P-Clock ticks fire but NO tile is
 *   spawned. Using pClockCount therefore causes the press-limit to trigger too
 *   early — fewer tiles than actualTileCount are physically produced.
 *   tilesSpawned only increments when PartSpawner physically creates a tile,
 *   ensuring the count always matches actual production.
 *
 * Lifecycle:
 *   1. User selects a WorkID in the WorkOrderBar dropdown → setSelectedWorkOrderId
 *   2. Simulation starts — PartSpawner calls incrementTilesSpawned each time a
 *      tile is physically created on the belt.
 *   3. useWorkOrderEnforcer watches tilesSpawned (NOT pClockCount).
 *      When tilesSpawned >= selectedWorkOrder.actualTileCount:
 *        → setPressLimitReached(true)
 *        → PartSpawner reads this flag and stops spawning new tiles
 *   4. When conveyor empties (all tiles shipped/scrapped):
 *        → simulationStore.toggleDataFlow() is called to end the simulation
 *   5. resetWorkOrderState() is called by useFactoryReset after each reset
 *        → pressLimitReached AND tilesSpawned return to 0/false
 *        → selectedWorkOrderId is preserved
 *
 * Used by: WorkOrderBar, useWorkOrderEnforcer, ConveyorBelt (PartSpawner), useFactoryReset
 */

import { create } from 'zustand';
import { DEFAULT_WORK_ORDER_ID } from '../lib/params/demo';

// ─── State Interface ─────────────────────────────────────────────────────────

/**
 * Full state shape for the Work Order store.
 * Divided into: user-selection state, production counters, and actions.
 */
interface WorkOrderState {
  // ── Selection ──────────────────────────────────────────────────
  /**
   * The ID of the currently selected Work Order (e.g., 'WorkID#1').
   * Defaults to DEFAULT_WORK_ORDER_ID on first load.
   * Persists across simulation runs — user must manually change it.
   */
  selectedWorkOrderId: string;

  // ── Production Limit Flag ──────────────────────────────────────
  /**
   * True when the press has PHYSICALLY spawned `actualTileCount` tiles.
   * Once true, PartSpawner skips new tile spawning.
   * Reset to false by resetWorkOrderState() after a factory reset.
   */
  pressLimitReached: boolean;

  // ── Actual Spawn Counter ───────────────────────────────────────
  /**
   * Running count of tiles ACTUALLY spawned on the conveyor belt
   * during the current simulation run.
   *
   * This is incremented by PartSpawner each time a tile is physically
   * placed on the belt — NOT by every P-Clock tick.
   *
   * The enforcer compares this value against actualTileCount.
   * It is reset to 0 by resetWorkOrderState() on factory reset.
   */
  tilesSpawned: number;

  // ── Actions ────────────────────────────────────────────────────

  /**
   * Update the selected Work Order ID.
   * Also resets pressLimitReached and tilesSpawned; a new Work Order = fresh run.
   *
   * @param id - The Work Order ID to select (e.g., 'WorkID#2')
   */
  setSelectedWorkOrderId: (id: string) => void;

  /**
   * Set the press production limit reached flag.
   * Called by useWorkOrderEnforcer when tilesSpawned >= actualTileCount.
   *
   * @param reached - true = press limit hit, false = reset
   */
  setPressLimitReached: (reached: boolean) => void;

  /**
   * Increment tilesSpawned by 1.
   * Called by PartSpawner's spawn effect AFTER a tile has been successfully
   * placed on the conveyor belt (i.e., after all spawn guards have passed).
   * This is the ONLY correct place to call this action.
   */
  incrementTilesSpawned: () => void;

  /**
   * Reset ONLY the runtime state (pressLimitReached, tilesSpawned) to zero.
   * The selectedWorkOrderId is intentionally PRESERVED — users should not
   * have to re-select their work order after each factory reset.
   * Called by useFactoryReset after completing a full factory reset.
   */
  resetWorkOrderState: () => void;
}

// ─── Store Implementation ────────────────────────────────────────────────────

export const useWorkOrderStore = create<WorkOrderState>((set) => ({
  // ── Initial State ──────────────────────────────────────────────

  /** Start with the default work order selected (configured in params/demo.ts) */
  selectedWorkOrderId: DEFAULT_WORK_ORDER_ID,

  /** Press has not yet reached its limit at initialisation */
  pressLimitReached: false,

  /** No tiles have been spawned yet at initialisation */
  tilesSpawned: 0,

  // ── Action Implementations ─────────────────────────────────────

  /**
   * Update the selected Work Order.
   * Resets all runtime production state because switching Work Orders
   * means a new production batch — previous limit tracking is invalid.
   */
  setSelectedWorkOrderId: (id) =>
    set({
      /** Store the new Work Order ID as selected */
      selectedWorkOrderId: id,
      /**
       * Clear the press limit flag: changing Work Order is equivalent
       * to setting up a new job — the previous limit is irrelevant.
       */
      pressLimitReached: false,
      /**
       * Reset spawn counter: new Work Order = new production batch
       * starting from zero tiles.
       */
      tilesSpawned: 0,
    }),

  /**
   * Mark whether the press production limit has been reached.
   * When true, PartSpawner will skip the tile-spawn effect.
   */
  setPressLimitReached: (reached) =>
    set({ pressLimitReached: reached }),

  /**
   * Increment the actual tile spawn count by 1.
   * Must only be called when PartSpawner successfully creates a new tile
   * (i.e., after all guards, including MAX_VISIBLE_PARTS, have passed).
   */
  incrementTilesSpawned: () =>
    set((state) => ({
      /** Increment by exactly 1 per physical tile spawned */
      tilesSpawned: state.tilesSpawned + 1,
    })),

  /**
   * Reset all runtime production state without touching the
   * user's Work Order selection. Called by useFactoryReset.
   */
  resetWorkOrderState: () =>
    set({
      /** Preserve the selected Work Order across factory resets */
      pressLimitReached: false,
      /** Reset spawn counter to 0 so the next run starts fresh */
      tilesSpawned: 0,
    }),
}));
