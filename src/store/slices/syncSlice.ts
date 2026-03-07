/**
 * syncSlice.ts — Sync Tracking & Query Slice
 *
 * Manages the write-buffer tracking for Supabase batch sync and provides
 * query methods for accessing machine state and parameter change history.
 *
 * Actions:
 *  - markForSync: Mark a record for Supabase sync
 *  - getUnsyncedData: Collect all unsynced records by type
 *  - markAsSynced: Remove synced records from the tracking queue
 *
 * Queries:
 *  - getMachineStateAtTick: Get machine state snapshot for a station at a tick
 *  - getRecentParameterChanges: Get recent parameter change events
 *
 * Dependencies:
 *  - appendUnsyncedItem / filterUnsyncedItems typed helpers from storeHelpers
 *
 * Used by: simulationDataStore.ts (composed via spread in the main create() call)
 */

import type {
  StationName,
  AnyMachineStateRecord,
  TileRecord,
  TileSnapshotRecord,
  ConveyorStateRecord,
  ConveyorEventRecord,
} from '../types';
import type { SetState, GetState, SimulationDataState } from './storeHelpers';
import {
  EMPTY_UNSYNCED,
  appendUnsyncedItem,
  filterUnsyncedItems,
} from './storeHelpers';

/**
 * Factory function that creates the sync tracking and query portion of the store.
 * Receives Zustand's `set` and `get` to read/write the full store state.
 *
 * @param set - Zustand state setter (partial or updater function)
 * @param get - Zustand state getter (returns full SimulationDataState)
 * @returns Partial state object containing sync tracking fields and actions
 */
export const createSyncSlice = (
  set: SetState,
  get: GetState,
): Pick<
  SimulationDataState,
  | 'unsyncedRecords'
  | 'markForSync'
  | 'getUnsyncedData'
  | 'markAsSynced'
  | 'getMachineStateAtTick'
  | 'getRecentParameterChanges'
> => ({
  // ── Initial State ─────────────────────────────────────────────────
  /** Empty sync queue on first load. */
  unsyncedRecords: { ...EMPTY_UNSYNCED },

  // ── Sync Actions ──────────────────────────────────────────────────

  /**
   * Mark a record for Supabase sync by appending its ID to the queue.
   *
   * @param type - Record type key (e.g., 'tiles', 'machineStates')
   * @param id   - Record identifier (string ID or machine state reference)
   */
  markForSync: (type, id) => {
    set((s) => ({
      unsyncedRecords: appendUnsyncedItem(s.unsyncedRecords, type, id),
    }));
  },

  /**
   * Collect all unsynced records organized by type for batch Supabase write.
   * Reads from the sync tracking queue and looks up actual records in state.
   *
   * @returns Object with arrays of unsynced records per type
   */
  getUnsyncedData: () => {
    const state = get();

    /**
     * Collect unsynced machine states from the flat machineStateRecords array.
     *
     * CHANGE: Previously used a compound { station, simTick, id } queue entry
     * with a Map.get(simTick) lookup here. That lookup silently returned
     * undefined for every record, so the result was always empty. Now uses
     * the same simple string-ID filter pattern as alarmLogs and metricsHistory,
     * which both work correctly.
     */
    const unsyncedMachineStateIds = new Set(state.unsyncedRecords.machineStates);
    /** Split into per-station arrays for batch upsert by table name. */
    const machineStates: Record<StationName, AnyMachineStateRecord[]> = {
      press: [], dryer: [], glaze: [], printer: [],
      kiln: [], sorting: [], packaging: [],
    };
    for (const record of state.machineStateRecords) {
      /** Include only records that are queued AND not yet synced. */
      if (unsyncedMachineStateIds.has(record.id) && !record.synced) {
        machineStates[record.station as StationName].push(record);
      }
    }

    /**
     * Collect unsynced tiles.
     * CRITICAL: Deduplicate tile IDs with Set before lookup.
     * The same tile ID is queued multiple times across its lifecycle
     * (creation → station move → grade change → completion). Without dedup,
     * the batch sent to Supabase contains duplicate rows, and PostgreSQL's
     * INSERT ... ON CONFLICT rejects duplicate conflict-key values within
     * a single statement (HTTP 500).
     */
    const uniqueTileIds = [...new Set(state.unsyncedRecords.tiles)];
    const tiles = uniqueTileIds
      .map((id) => state.tiles.get(id))
      .filter((t): t is TileRecord => t !== undefined && !t.synced);

    /**
     * Capture each tile's syncVersion at read time.
     * markAsSynced will compare this against the tile's CURRENT version
     * to detect tiles modified during the sync's network round-trip.
     */
    const tileSyncVersions = new Map<string, number>();
    for (const t of tiles) {
      tileSyncVersions.set(t.id, t.syncVersion);
    }

    /**
     * Collect unsynced snapshots by searching all tile snapshot arrays.
     * Deduplicate IDs to prevent duplicate rows in the batch.
     */
    const snapshots: TileSnapshotRecord[] = [];
    const uniqueSnapshotIds = new Set(state.unsyncedRecords.snapshots);
    for (const id of uniqueSnapshotIds) {
      for (const [, snaps] of state.tileSnapshots) {
        const snap = snaps.find((s) => s.id === id);
        if (snap && !snap.synced) {
          snapshots.push(snap);
          break; // Found this ID, move to next
        }
      }
    }

    /** Collect unsynced parameter changes. */
    const parameterChanges = state.parameterChanges.filter(
      (p) =>
        state.unsyncedRecords.parameterChanges.includes(p.id) && !p.synced
    );

    /** Collect unsynced scenarios from history. */
    const scenarios = state.scenarioHistory.filter(
      (s) =>
        state.unsyncedRecords.scenarios.includes(s.id) && !s.synced
    );

    /** Collect unsynced metrics. */
    const metrics = state.metricsHistory.filter(
      (m) =>
        state.unsyncedRecords.metrics.includes(m.id) && !m.synced
    );

    /** Collect unsynced alarm logs. */
    const alarmLogs = state.alarmLogs.filter(
      (a) =>
        state.unsyncedRecords.alarmLogs.includes(a.id) && !a.synced
    );

    /** Collect unsynced conveyor state snapshots from flat array. */
    const unsyncedConveyorStateIds = new Set(state.unsyncedRecords.conveyorStates);
    const conveyorStates: ConveyorStateRecord[] = state.conveyorStateRecords.filter(
      (r) => unsyncedConveyorStateIds.has(r.id) && !r.synced
    );

    /** Collect unsynced conveyor events from flat array. */
    const unsyncedConveyorEventIds = new Set(state.unsyncedRecords.conveyorEvents);
    const conveyorEvents: ConveyorEventRecord[] = state.conveyorEventRecords.filter(
      (r) => unsyncedConveyorEventIds.has(r.id) && !r.synced
    );

    return { machineStates, tiles, tileSyncVersions, snapshots, parameterChanges, scenarios, metrics, alarmLogs, conveyorStates, conveyorEvents };
  },

  /**
   * Remove synced records from the tracking queue by their IDs
   * AND mark the underlying records as synced (synced = true).
   *
   * CRITICAL: Without setting synced=true on the actual tile/snapshot
   * records in the Map, we lose the ability to distinguish between
   * tiles that have been successfully written to Supabase vs those
   * that haven't. This matters because:
   *  - drainConveyor() sets synced=false on completed tiles
   *  - If the ID was already removed from the queue by a prior sync,
   *    these dirty tiles would never be re-picked-up for syncing
   *  - getUnsyncedData checks BOTH queue membership AND !tile.synced
   *
   * @param type - Record type key
   * @param ids  - Array of record IDs that have been successfully synced
   */
  markAsSynced: (type, ids, syncVersions) => {
    set((s) => {
      /** Always remove from the unsynced queue */
      const newUnsyncedRecords = filterUnsyncedItems(s.unsyncedRecords, type, ids);

      /**
       * For tiles: version-aware acknowledgment.
       * Only set synced=true if the tile's CURRENT syncVersion matches
       * the version captured when getUnsyncedData was called. If the tile
       * was modified during the sync's network round-trip (version increased),
       * leave synced=false so it gets re-picked-up by the next sync cycle.
       */
      if (type === 'tiles') {
        const newTiles = new Map(s.tiles);
        const idSet = new Set(ids);
        /** Count tiles that were re-queued due to version mismatch. */
        const reQueuedIds: string[] = [];
        for (const [id, tile] of newTiles) {
          if (!idSet.has(id)) continue;
          if (tile.synced) continue;

          /** If syncVersions were provided, do a version check. */
          if (syncVersions) {
            const sentVersion = syncVersions.get(id);
            if (sentVersion !== undefined && tile.syncVersion !== sentVersion) {
              /**
               * Tile was modified after the sync read it — version mismatch.
               * Leave synced=false and re-queue so the next sync picks it up.
               */
              reQueuedIds.push(id);
              continue;
            }
          }

          /** Version matches (or no version map) — safe to acknowledge. */
          newTiles.set(id, { ...tile, synced: true });
        }

        /** Re-queue dirty tiles that had a version mismatch. */
        const finalUnsyncedRecords = reQueuedIds.length > 0
          ? {
            ...newUnsyncedRecords,
            tiles: [...newUnsyncedRecords.tiles, ...reQueuedIds],
          }
          : newUnsyncedRecords;

        return { unsyncedRecords: finalUnsyncedRecords, tiles: newTiles };
      }

      /** For snapshots: stamp synced=true on each snapshot in the Map */
      if (type === 'snapshots') {
        const newSnapshots = new Map(s.tileSnapshots);
        const idSet = new Set(ids);
        for (const [tileId, snaps] of newSnapshots) {
          const updated = snaps.map((snap) =>
            idSet.has(snap.id) ? { ...snap, synced: true } : snap
          );
          if (updated !== snaps) {
            newSnapshots.set(tileId, updated);
          }
        }
        return { unsyncedRecords: newUnsyncedRecords, tileSnapshots: newSnapshots };
      }

      /** All other types: just remove from the queue (no Map flag needed) */
      return { unsyncedRecords: newUnsyncedRecords };
    });
  },

  // ── Query Methods ─────────────────────────────────────────────────

  /**
   * Get a machine state snapshot for a station at a specific simulation tick.
   *
   * @param station - Station name to query
   * @param simTick - Simulation tick to look up
   * @returns The machine state record, or undefined if not found
   */
  getMachineStateAtTick: (station, simTick) =>
    (get().machineStates[station] as Map<number, AnyMachineStateRecord>).get(simTick),

  /**
   * Get recent parameter change events, optionally filtered by station.
   *
   * @param station - Optional station to filter by
   * @param limit   - Maximum number of records to return (default: 10)
   * @returns Array of the most recent parameter change records
   */
  getRecentParameterChanges: (station, limit = 10) => {
    const changes = get().parameterChanges;
    /** Filter by station if specified. */
    const filtered = station
      ? changes.filter((c) => c.station === station)
      : changes;
    /** Return the last N records. */
    return filtered.slice(-limit);
  },
});
