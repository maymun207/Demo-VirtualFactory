/**
 * useWorkOrderEnforcer.ts — Work Order Press Limit Hook (Phase 1 only)
 *
 * A logic-only hook (no UI) that enforces the selected Work Order's
 * tile spawn limit against the running simulation.
 *
 * ─── ARCHITECTURE ─────────────────────────────────────────────────────────
 *
 * This hook implements PHASE 1 of the two-phase Work Order shutdown:
 *
 *   Phase 1 — Press Stop:
 *     Subscribes to workOrderStore. On each tilesSpawned change, compares
 *     against selectedWorkOrder.actualTileCount. When the count is reached:
 *       → setPressLimitReached(true)
 *     PartSpawner reads pressLimitReached imperatively at spawn time and
 *     immediately stops spawning new tiles.
 *
 *   Phase 2 — Simulation End (NOT HERE):
 *     Phase 2 lives INSIDE PartSpawner's useFrame loop (ConveyorBelt.tsx).
 *     This is the correct location because:
 *       a) useFrame has direct access to partsRef (no proxy needed)
 *       b) It runs at 60fps — far more responsive than S-Clock polling
 *       c) It can reliably detect partsRef.current.size === 0 in real time
 *     When pressLimitReached=true AND partsRef.current.size=0, PartSpawner
 *     calls stopDataFlow() + resetWorkOrderState() directly.
 *
 * ─── WHY tilesSpawned INSTEAD OF pClockCount ──────────────────────────────
 *
 * pClockCount increments on every P-Clock tick, even when no tile is spawned
 * (e.g., when MAX_VISIBLE_PARTS is hit and the spawn guard returns early).
 * This makes pClockCount greater than the actual tile count, causing the
 * press limit to trigger too early.
 *
 * tilesSpawned is incremented by PartSpawner only after ALL spawn guards have
 * passed and a tile is physically placed on the belt. It always equals the
 * true production count.
 *
 * ─── EXTERNAL STOP SAFETY ─────────────────────────────────────────────────
 *
 * When the user clicks Stop while pressLimitReached is true (Phase 2 is
 * pending), we ONLY clear pressLimitReached but PRESERVE tilesSpawned.
 * This prevents a critical double-production bug:
 *
 *   Old behavior: resetWorkOrderState() zeros BOTH flags.
 *     → Stop during Phase 2 → Start → full batch spawns again
 *     → Counters (shipment, waste) keep accumulating across batches
 *     → Runaway simulation with 5,874+ tiles
 *
 *   New behavior: only clear the flag, keep tilesSpawned intact.
 *     → Stop during Phase 2 → Start → tilesSpawned is still at limit
 *     → pressLimitReached fires immediately → no new tiles spawn
 *     → Counters remain consistent with actual production
 *
 * ─── MOUNT LOCATION ───────────────────────────────────────────────────────
 *
 * Mount once inside SimulationRunner.tsx (logic-only component).
 */

import { useEffect, useRef } from 'react';
import { useSimulationStore } from '../store/simulationStore';
import { useWorkOrderStore } from '../store/workOrderStore';
import { WORK_ORDERS } from '../lib/params/demo';

/**
 * useWorkOrderEnforcer — Phase 1 enforcer: watches tilesSpawned and sets
 * pressLimitReached when the Work Order production target is met.
 *
 * Phase 2 (stopping the simulation after belt drains) is handled inside
 * PartSpawner's useFrame in ConveyorBelt.tsx.
 *
 * @example
 * ```tsx
 * // Inside SimulationRunner component:
 * useWorkOrderEnforcer();
 * ```
 */
export function useWorkOrderEnforcer(): void {
  // ── Reactive binding for external stop detection ──────────────────

  /**
   * Tracked reactively so the external-stop useEffect fires when
   * isDataFlowing changes (e.g., user manually clicks Stop).
   */
  const isDataFlowing = useSimulationStore((s) => s.isDataFlowing);

  /**
   * Safety flag: when the simulation stops externally while pressLimitReached
   * is still true, we clear ONLY the flag (not tilesSpawned) to prevent
   * double-production on the next Start.
   */
  const wasLimitReachedRef = useRef(false);

  // ── Phase 1: Watch tilesSpawned → set pressLimitReached ──────────

  useEffect(() => {
    /**
     * prevTilesSpawned: deduplicate workOrderStore subscription callbacks.
     * The callback fires on ANY field change; we only care about tilesSpawned.
     */
    let prevTilesSpawned = useWorkOrderStore.getState().tilesSpawned;

    const unsubscribe = useWorkOrderStore.subscribe((state) => {
      /**
       * Deduplicate: only proceed when tilesSpawned has actually changed.
       * Other field changes (pressLimitReached, selectedWorkOrderId) must
       * be ignored to avoid redundant computations.
       */
      if (state.tilesSpawned === prevTilesSpawned) return;
      prevTilesSpawned = state.tilesSpawned;

      /**
       * Guard: Phase 1 is a one-shot event.
       * Once pressLimitReached=true, this subscription has no more work to do
       * until the next run (when resetWorkOrderState() clears the flag).
       */
      if (state.pressLimitReached) return;

      /**
       * Guard: ignore resets that happen while the simulation is not running.
       * For example, when resetWorkOrderState() sets tilesSpawned=0 during
       * shutdown while isDataFlowing=false — we must not treat 0 as a new
       * production count for the next run's Phase 1 check.
       */
      if (!useSimulationStore.getState().isDataFlowing) return;

      /**
       * Resolve the selected Work Order from the static WORK_ORDERS list.
       * Falls back to WORK_ORDERS[0] defensively to prevent crashes when no
       * Work Order is selected.
       */
      const selectedWorkOrder =
        WORK_ORDERS.find((wo) => wo.id === state.selectedWorkOrderId) ??
        WORK_ORDERS[0];

      /**
       * Phase 1 trigger: the physical tile count has reached the target.
       *
       * actualTileCount = orderTileCount / (1 - expectedScrapRate).
       * It accounts for expected waste so the shipped count meets the order.
       *
       * Once this fires:
       *   → pressLimitReached=true in workOrderStore
       *   → PartSpawner's spawn guard returns early on next P-Clock tick
       *   → No more tiles spawn; existing tiles drain through all stations
       *   → Phase 2 (in PartSpawner useFrame) watches for partsRef.size=0
       */
      if (state.tilesSpawned >= selectedWorkOrder.actualTileCount) {
        state.setPressLimitReached(true);
        wasLimitReachedRef.current = true;
      }
    });

    /** Cleanup: unsubscribe when component unmounts */
    return unsubscribe;
  }, []);

  // ── External stop detection ────────────────────────────────────────

  useEffect(() => {
    /**
     * If the simulation is stopped externally (user clicks Stop button)
     * while the press limit was reached and Phase 2 hasn't completed yet,
     * clean up the pressLimitReached flag so the next run can proceed.
     *
     * CRITICAL FIX: We only clear pressLimitReached, NOT tilesSpawned.
     * The old code called resetWorkOrderState() which zeroed BOTH, allowing
     * the next Start to spawn an entire new batch while counters (shipment,
     * waste, scrap) kept accumulating — causing runaway production.
     *
     * By preserving tilesSpawned, the enforcer will immediately re-trigger
     * pressLimitReached on the next Start (since tilesSpawned is still at
     * or above the limit), preventing double-production.
     */
    if (!isDataFlowing && wasLimitReachedRef.current) {
      const workOrderState = useWorkOrderStore.getState();
      /**
       * Only clear pressLimitReached if it is still true.
       * If Phase 2 (in PartSpawner) already called resetWorkOrderState(),
       * it's already false and we skip the redundant reset.
       *
       * Use setPressLimitReached(false) instead of resetWorkOrderState()
       * to preserve tilesSpawned — prevents double-production bug.
       */
      if (workOrderState.pressLimitReached) {
        workOrderState.setPressLimitReached(false);
      }
      wasLimitReachedRef.current = false;
    }
  }, [isDataFlowing]);
}
