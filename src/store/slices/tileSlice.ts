/**
 * tileSlice.ts — Tile Management & Conveyor Slice
 *
 * Manages the tile lifecycle, snapshot (künye) recording, and conveyor
 * belt movement logic within the simulation data store.
 *
 * Actions:
 *  - createTile: Create a new tile at the press station
 *  - updateTileStatus: Update a tile's lifecycle status
 *  - setTileGrade: Assign a quality grade to a tile
 *  - scrapTile: Mark a tile as scrapped at a specific station
 *  - recordTileSnapshot: Record a tile's visit to a station (künye data)
 *  - moveTilesOnConveyor: Advance all tiles on the conveyor one step
 *
 * Queries:
 *  - getTileById: Look up a tile by unique ID
 *  - getTileByNumber: Look up a tile by sequential number
 *  - getTileSnapshots: Get all station visit snapshots for a tile
 *
 * Dependencies:
 *  - generateUUID for unique IDs
 *  - STATION_ORDER / STATION_ORDER_MAP from types
 *
 * Used by: simulationDataStore.ts (composed via spread in the main create() call)
 */

import { generateUUID } from '../../lib/idGenerator';
import { MAX_COMPLETED_TILES } from '../../lib/params';
import type {
  StationName,
  TileRecord,
  TileSnapshotRecord,
  ConveyorPosition,
  TileStatus,
  QualityGrade,
} from '../types';
import {
  STATION_ORDER,
  STATION_ORDER_MAP,
} from '../types';
import type { SetState, GetState, SimulationDataState, DefectInfo } from './storeHelpers';
import { evaluateStationDefects, classifyDefectOutcome } from '../../lib/defectEngine';
import { getRangesForStation } from '../../lib/params/parameterRanges';

/**
 * Factory function that creates the tile management portion of the store.
 * Receives Zustand's `set` and `get` to read/write the full store state.
 *
 * @param set - Zustand state setter (partial or updater function)
 * @param get - Zustand state getter (returns full SimulationDataState)
 * @returns Partial state object containing tile/conveyor fields and actions
 */
export const createTileSlice = (
  set: SetState,
  get: GetState,
): Pick<
  SimulationDataState,
  | 'tiles'
  | 'tilesByNumber'
  | 'tileCounter'
  | 'totalTilesProduced'
  | 'totalTilesScrapped'
  | 'totalFirstQuality'
  | 'totalSecondQuality'
  | 'totalScrapGraded'
  | 'tileSnapshots'
  | 'conveyorPositions'
  | 'createTile'
  | 'updateTileStatus'
  | 'setTileGrade'
  | 'scrapTile'
  | 'recordTileSnapshot'
  | 'moveTilesOnConveyor'
  | 'getTileById'
  | 'getTileByNumber'
  | 'getTileSnapshots'
  | 'pruneCompletedTiles'
  | 'drainConveyor'
> => ({
  // ── Initial State ─────────────────────────────────────────────────
  /** Empty tile registry on first load. */
  tiles: new Map(),
  /** Empty reverse lookup map. */
  tilesByNumber: new Map(),
  /** Tile counter starts at zero. */
  tileCounter: 0,
  /** No tiles produced yet. */
  totalTilesProduced: 0,
  /** No tiles scrapped yet. */
  totalTilesScrapped: 0,
  /** No first-quality tiles yet. */
  totalFirstQuality: 0,
  /** No second-quality tiles yet. */
  totalSecondQuality: 0,
  /** No scrap-graded tiles yet. */
  totalScrapGraded: 0,
  /** Empty snapshot registry. */
  tileSnapshots: new Map(),
  /** Empty conveyor. */
  conveyorPositions: new Map(),

  // ── Tile CRUD Actions ─────────────────────────────────────────────

  /**
   * Create a new tile and place it at the press station.
   * Returns null if no session is active.
   *
   * @param simTick        - Current simulation tick
   * @param productionTick - Current production tick
   * @returns The newly created TileRecord, or null
   */
  createTile: (simTick, productionTick) => {
    const state = get();
    /** Cannot create tiles without an active session. */
    if (!state.session) return null;

    /** Auto-increment tile number. */
    const tileNumber = state.tileCounter + 1;
    /** Generate a unique ID for this tile. */
    const id = generateUUID();

    /** Build the tile record with initial status. */
    const tile: TileRecord = {
      id,
      simulation_id: state.session.id,
      tile_number: tileNumber,
      created_at_sim_tick: simTick,
      created_at_production_tick: productionTick,
      status: 'in_production',
      current_station: 'press',
      final_grade: 'pending',
      synced: false,
      /** Initial version — bumped on every subsequent mutation. */
      syncVersion: 0,
    };

    /** Initial conveyor position: starts at press, next station is dryer. */
    const position: ConveyorPosition = {
      tile_id: id,
      current_station: 'press',
      position_in_station: 0,
      entered_at_sim_tick: simTick,
      next_station: 'dryer',
      ticks_until_next_station:
        state.config.stationGapProductionTicks * state.config.productionTickRatio,
    };

    /** Atomically update tiles, tilesByNumber, conveyorPositions, and counter. */
    set((s) => {
      const newTiles = new Map(s.tiles);
      newTiles.set(id, tile);

      const newTilesByNumber = new Map(s.tilesByNumber);
      newTilesByNumber.set(tileNumber, id);

      const newConveyor = new Map(s.conveyorPositions);
      newConveyor.set(id, position);

      return {
        tiles: newTiles,
        tilesByNumber: newTilesByNumber,
        conveyorPositions: newConveyor,
        tileCounter: tileNumber,
        unsyncedRecords: {
          ...s.unsyncedRecords,
          tiles: [...s.unsyncedRecords.tiles, id],
        },
      };
    });

    return tile;
  },

  /**
   * Update the lifecycle status of a tile.
   *
   * @param tileId - Unique tile ID
   * @param status - New status value
   */
  updateTileStatus: (tileId, status) => {
    set((s) => {
      const newTiles = new Map(s.tiles);
      const tile = newTiles.get(tileId);
      if (tile) {
        newTiles.set(tileId, { ...tile, status, synced: false, syncVersion: tile.syncVersion + 1 });
      }
      return {
        tiles: newTiles,
        /** Re-queue tile for Supabase sync so status change is persisted. */
        unsyncedRecords: {
          ...s.unsyncedRecords,
          tiles: [...s.unsyncedRecords.tiles, tileId],
        },
      };
    });
  },

  /**
   * Assign a quality grade to a tile, correcting cumulative counters.
   *
   * When the microtask defect evaluation determines a tile should be
   * second_quality or scrap AFTER the tile was initially graded first_quality
   * in moveTilesOnConveyor, this function corrects the counters.
   *
   * @param tileId - Unique tile ID
   * @param grade  - Quality grade to assign
   */
  setTileGrade: (tileId, grade) => {
    set((s) => {
      const newTiles = new Map(s.tiles);
      const tile = newTiles.get(tileId);
      if (!tile) return {};

      /** Skip if grade doesn't actually change. */
      if (tile.final_grade === grade) return {};

      /**
       * COUNTER CORRECTION — Decrement the old grade counter
       * and increment the new grade counter. This fixes the divergence
       * between Zustand cumulative counters and the tiles table in Supabase.
       */
      let firstQualityAdj = 0;
      let secondQualityAdj = 0;
      let scrapGradedAdj = 0;

      /** Decrement old grade counter. */
      if (tile.final_grade === 'first_quality') firstQualityAdj--;
      else if (tile.final_grade === 'second_quality') secondQualityAdj--;
      else if (tile.final_grade === 'scrap') scrapGradedAdj--;

      /** Increment new grade counter. */
      if (grade === 'first_quality') firstQualityAdj++;
      else if (grade === 'second_quality') secondQualityAdj++;
      else if (grade === 'scrap') scrapGradedAdj++;

      newTiles.set(tileId, { ...tile, final_grade: grade, synced: false, syncVersion: tile.syncVersion + 1 });

      /**
       * PERIOD METRICS CORRECTION — Decrement the old grade's period counter
       * and increment the new grade's period counter. Without this, the
       * production_metrics table in Supabase would show 0 for scrap and
       * second_quality because only moveTilesOnConveyor's completion branch
       * populated period metrics, but the microtask re-grading never updated them.
       */
      const newMetrics = { ...s.currentPeriodMetrics };
      if (tile.final_grade === 'first_quality') newMetrics.firstQuality--;
      else if (tile.final_grade === 'second_quality') newMetrics.secondQuality--;
      else if (tile.final_grade === 'scrap') newMetrics.scrap--;
      if (grade === 'first_quality') newMetrics.firstQuality++;
      else if (grade === 'second_quality') newMetrics.secondQuality++;
      else if (grade === 'scrap') newMetrics.scrap++;

      return {
        tiles: newTiles,
        /** Correct cumulative counters to match the new grade. */
        totalFirstQuality: s.totalFirstQuality + firstQualityAdj,
        totalSecondQuality: s.totalSecondQuality + secondQualityAdj,
        totalScrapGraded: s.totalScrapGraded + scrapGradedAdj,
        /** Correct period metrics to match the new grade. */
        currentPeriodMetrics: newMetrics,
        /** Re-queue tile for Supabase sync so grade change is persisted. */
        unsyncedRecords: {
          ...s.unsyncedRecords,
          tiles: [...s.unsyncedRecords.tiles, tileId],
        },
      };
    });
  },

  /**
   * Mark a tile as scrapped at a specific station with defect types.
   * Removes from conveyor and updates period metrics.
   *
   * @param tileId  - Unique tile ID
   * @param station - Station where scrap occurred
   * @param defects - Array of defect types detected
   */
  scrapTile: (tileId, station, defects) => {
    set((s) => {
      const newTiles = new Map(s.tiles);
      const tile = newTiles.get(tileId);
      if (!tile) return {};

      /**
       * COUNTER CORRECTION — If this tile was previously graded (e.g.,
       * first_quality during moveTilesOnConveyor), decrement the corresponding
       * cumulative counter. This fixes the inflation bug where tiles graded
       * before microtask defect evaluation were never "ungraded" when later
       * scrapped by the defect engine.
       */
      let firstQualityAdj = 0;
      let secondQualityAdj = 0;
      if (tile.final_grade === 'first_quality') {
        firstQualityAdj = -1;
      } else if (tile.final_grade === 'second_quality') {
        secondQualityAdj = -1;
      }

      newTiles.set(tileId, {
        ...tile,
        status: `scrapped_at_${station}` as TileStatus,
        final_grade: 'scrap',
        completed_at_sim_tick: s.currentSimTick,
        synced: false,
        syncVersion: tile.syncVersion + 1,
      });

      /** Remove scrapped tile from conveyor. */
      const newConveyor = new Map(s.conveyorPositions);
      newConveyor.delete(tileId);

      /**
       * Update period metrics: increment scrap counter and decrement the
       * old grade counter. Without the decrement, tiles initially graded as
       * first_quality in moveTilesOnConveyor would keep their period metric
       * increment even after being scrapped by the defect engine.
       */
      const newMetrics = { ...s.currentPeriodMetrics };
      if (tile.final_grade === 'first_quality') newMetrics.firstQuality--;
      else if (tile.final_grade === 'second_quality') newMetrics.secondQuality--;
      newMetrics.scrap++;
      newMetrics.scrapByStation[station]++;
      defects.forEach((d) => {
        newMetrics.defectCounts[d] = (newMetrics.defectCounts[d] || 0) + 1;
      });

      return {
        tiles: newTiles,
        conveyorPositions: newConveyor,
        totalTilesScrapped: s.totalTilesScrapped + 1,
        /** Correct inflated counters when re-grading a previously graded tile. */
        totalFirstQuality: s.totalFirstQuality + firstQualityAdj,
        totalSecondQuality: s.totalSecondQuality + secondQualityAdj,
        totalScrapGraded: s.totalScrapGraded + 1,
        currentPeriodMetrics: newMetrics,
        /** Re-queue scrapped tile for Supabase sync so scrap grade is persisted. */
        unsyncedRecords: {
          ...s.unsyncedRecords,
          tiles: [...s.unsyncedRecords.tiles, tileId],
        },
      };
    });
  },

  // ── Snapshot (Künye) Recording ─────────────────────────────────────

  /**
   * Record a tile's visit to a station — builds the tile "passport" (künye).
   * Creates a TileSnapshotRecord capturing the machine parameters at the
   * moment the tile entered the station.
   *
   * @param tileId          - Unique tile ID
   * @param station         - Station being visited
   * @param simTick         - Current simulation tick
   * @param productionTick  - Current production tick
   * @param machineStateId  - ID of the machine state record for this tick
   * @param defectInfo      - Optional defect information detected at this station
   * @returns The unique ID of the created snapshot
   */
  recordTileSnapshot: (tileId, station, simTick, productionTick, machineStateId, defectInfo) => {
    const state = get();
    /** Generate unique ID for this snapshot. */
    const id = generateUUID();

    /** Build the snapshot record capturing current machine parameters. */
    const snapshot: TileSnapshotRecord = {
      id,
      tile_id: tileId,
      simulation_id: state.session!.id,
      station,
      station_order: STATION_ORDER_MAP[station],
      entry_sim_tick: simTick,
      entry_production_tick: productionTick,
      machine_state_id: machineStateId,
      parameters_snapshot: {
        ...state.currentParams[station],
        /** Tag if a defect scenario was active at snapshot time. */
        ...(state.activeScenario ? {
          scenario_active: true,
          scenario_code: state.activeScenario.code,
        } : {}),
      } as Record<string, unknown>,
      defect_detected: defectInfo?.detected ?? false,
      defect_types: defectInfo?.types,
      defect_severity: defectInfo?.severity,
      scrapped_here: defectInfo?.scrapped ?? false,
      synced: false,
    };

    /** Append snapshot to the tile's snapshot history. */
    set((s) => {
      const newSnapshots = new Map(s.tileSnapshots);
      const existing = newSnapshots.get(tileId) || [];
      newSnapshots.set(tileId, [...existing, snapshot]);

      return {
        tileSnapshots: newSnapshots,
        unsyncedRecords: {
          ...s.unsyncedRecords,
          snapshots: [...s.unsyncedRecords.snapshots, id],
        },
      };
    });

    return id;
  },

  // ── Conveyor Movement ─────────────────────────────────────────────

  /**
   * Advance all tiles on the conveyor by one step.
   *
   * SIMULATE-AHEAD PHASE 1 — Single-truth architecture:
   * Defect evaluation, snapshot recording, and grade assignment all happen
   * SYNCHRONOUSLY inside the same set() callback. There is no deferred
   * microtask, no bridge fallback, and no setTileGrade correction.
   *
   * When a tile enters a new station:
   *   1. evaluateStationDefects() runs INLINE
   *   2. Snapshot record is created INLINE into newSnapshots
   *   3. Bridge sets are populated for the visual engine (temporary — Phase 3 removes)
   *
   * When a tile completes the line:
   *   1. Final grade is determined from accumulated inline snapshots
   *   2. Counters are incremented atomically — always correct
   *
   * @param simTick        - Current simulation tick
   * @param productionTick - Current production tick
   */
  moveTilesOnConveyor: (simTick: number, productionTick: number) => {
    set((s) => {
      const newConveyor = new Map(s.conveyorPositions);
      const newTiles = new Map(s.tiles);
      /**
       * Clone the snapshot Map so we can update exit_sim_tick on previous
       * snapshots when a tile moves from one station to the next.
       */
      const newSnapshots = new Map(s.tileSnapshots);
      /** Track total tiles passing the final station. */
      let newTotalProduced = s.totalTilesProduced;
      /** Track cumulative quality grade counters. */
      let newTotalFirstQuality = s.totalFirstQuality;
      let newTotalSecondQuality = s.totalSecondQuality;
      let newTotalScrapGraded = s.totalScrapGraded;
      const newMetrics = { ...s.currentPeriodMetrics };
      /** Tile IDs that changed station or grade, must be re-queued for sync. */
      const modifiedTileIds: string[] = [];
      /** Snapshot IDs that had their exit_sim_tick updated, must be re-synced. */
      const modifiedSnapshotIds: string[] = [];
      /** New snapshot IDs created this tick, must be queued for initial sync. */
      const newSnapshotIds: string[] = [];

      /** Resolve scenario overrides for range lookups. */
      const scenarioOverrides = s.activeScenario?.parameterOverrides;

      for (const [tileId, position] of newConveyor) {
        const updated = { ...position };
        updated.ticks_until_next_station--;

        if (updated.ticks_until_next_station <= 0) {
          const currentIndex = STATION_ORDER.indexOf(
            updated.current_station as StationName
          );

          if (currentIndex < STATION_ORDER.length - 1) {
            // ── Tile moves to next station ────────────────────────
            const nextStation = STATION_ORDER[currentIndex + 1];

            /** Look up machine state for the next station at this tick. */
            const machineStateRecord = s.machineStates[nextStation].get(simTick);
            const machineStateId = machineStateRecord?.id ?? null;

            // ── INLINE DEFECT EVALUATION (replaces deferred microtask) ──
            /** Get current live parameter values for this station. */
            const stationParams = s.currentParams[nextStation] as Record<string, number>;
            /** Get normal operating ranges (scenario overrides take precedence). */
            const ranges = getRangesForStation(nextStation, scenarioOverrides);
            /** Evaluate: are any params out of range? Roll 20% chance. */
            const evaluation = evaluateStationDefects(nextStation, stationParams, ranges);

            /** Look up tile record for station-tracking updates below. */
            const tile = newTiles.get(tileId);

            /** Merge defect evaluation result. */
            let defectInfo: DefectInfo | undefined;
            if (evaluation.detected) {
              const outcome = classifyDefectOutcome(evaluation.types);
              defectInfo = {
                detected: true,
                types: evaluation.types,
                severity: evaluation.severity,
                scrapped: outcome === 'scrap',
              };
            }

            // ── INLINE SNAPSHOT RECORDING (replaces recordTileSnapshot) ──
            const snapshotId = generateUUID();
            const snapshot: TileSnapshotRecord = {
              id: snapshotId,
              tile_id: tileId,
              simulation_id: s.session!.id,
              station: nextStation,
              station_order: STATION_ORDER_MAP[nextStation],
              entry_sim_tick: simTick,
              entry_production_tick: productionTick,
              machine_state_id: machineStateId,
              parameters_snapshot: {
                ...s.currentParams[nextStation],
                ...(s.activeScenario ? {
                  scenario_active: true,
                  scenario_code: s.activeScenario.code,
                } : {}),
              } as Record<string, unknown>,
              defect_detected: defectInfo?.detected ?? false,
              defect_types: defectInfo?.types,
              defect_severity: defectInfo?.severity,
              scrapped_here: defectInfo?.scrapped ?? false,
              synced: false,
            };
            /** Append to tile's snapshot history. */
            const existing = newSnapshots.get(tileId) || [];
            newSnapshots.set(tileId, [...existing, snapshot]);
            newSnapshotIds.push(snapshotId);

            /**
             * FILL EXIT TICK on the PREVIOUS station's snapshot.
             * The tile is leaving `updated.current_station` and entering `nextStation`.
             */
            const departingStation = updated.current_station as StationName;
            const tileSnaps = newSnapshots.get(tileId);
            if (tileSnaps) {
              const updatedSnaps = tileSnaps.map((snap) => {
                if (snap.station === departingStation && snap.exit_sim_tick == null) {
                  const duration = simTick - snap.entry_sim_tick;
                  modifiedSnapshotIds.push(snap.id);
                  return {
                    ...snap,
                    exit_sim_tick: simTick,
                    processing_duration_ticks: duration,
                    synced: false,
                  };
                }
                return snap;
              });
              newSnapshots.set(tileId, updatedSnaps);
            }

            /** Update conveyor position. */
            updated.current_station = nextStation;
            updated.next_station = STATION_ORDER[currentIndex + 2];
            updated.ticks_until_next_station =
              s.config.stationGapProductionTicks * s.config.productionTickRatio;
            updated.entered_at_sim_tick = simTick;

            /** Update tile's current_station field. */
            if (tile) {
              newTiles.set(tileId, {
                ...tile,
                current_station: nextStation,
                synced: false,
                syncVersion: tile.syncVersion + 1,
              });
            }

            newConveyor.set(tileId, updated);
            modifiedTileIds.push(tileId);
          } else {
            // ── Tile completed the line ───────────────────────────
            /**
             * SINGLE-TRUTH GRADING — No bridge fallback, no alreadyGraded check.
             * Grade is determined entirely from the inline snapshots that were
             * created synchronously above. Every defect is already recorded.
             */
            const tile = newTiles.get(tileId);
            if (tile) {
              const snapshots = newSnapshots.get(tileId) || [];
              const hasDefects = snapshots.some((snap) => snap.defect_detected);
              /** Tiles sent to waste bin get 'conveyor_jam_damage' at sorting. */
              const isWasteBin = snapshots.some(
                (snap) =>
                  snap.defect_detected &&
                  snap.scrapped_here
              );

              const grade: QualityGrade = isWasteBin
                ? 'scrap'
                : hasDefects
                  ? 'second_quality'
                  : 'first_quality';

              /**
               * FILL EXIT TICK on the LAST station's snapshot (packaging).
               */
              const lastStation = updated.current_station as StationName;
              const completionSnaps = newSnapshots.get(tileId);
              if (completionSnaps) {
                const updatedSnaps = completionSnaps.map((snap) => {
                  if (snap.station === lastStation && snap.exit_sim_tick == null) {
                    const duration = simTick - snap.entry_sim_tick;
                    modifiedSnapshotIds.push(snap.id);
                    return {
                      ...snap,
                      exit_sim_tick: simTick,
                      processing_duration_ticks: duration,
                      synced: false,
                    };
                  }
                  return snap;
                });
                newSnapshots.set(tileId, updatedSnaps);
              }

              newTiles.set(tileId, {
                ...tile,
                status: 'completed',
                final_grade: grade,
                completed_at_sim_tick: simTick,
                synced: false,
                syncVersion: tile.syncVersion + 1,
              });

              /** Update counters atomically — always correct. */
              newTotalProduced++;
              newMetrics.totalProduced++;
              if (grade === 'first_quality') {
                newMetrics.firstQuality++;
                newTotalFirstQuality++;
              } else if (grade === 'second_quality') {
                newMetrics.secondQuality++;
                newTotalSecondQuality++;
              } else if (grade === 'scrap') {
                newMetrics.scrap++;
                newTotalScrapGraded++;
              }

              /** Remove completed tile from conveyor. */
              newConveyor.delete(tileId);
              modifiedTileIds.push(tileId);
            }
          }
        } else {
          newConveyor.set(tileId, updated);
        }
      }

      return {
        conveyorPositions: newConveyor,
        tiles: newTiles,
        /** Persist inline snapshots with defect data. */
        tileSnapshots: newSnapshots,
        totalTilesProduced: newTotalProduced,
        totalFirstQuality: newTotalFirstQuality,
        totalSecondQuality: newTotalSecondQuality,
        totalScrapGraded: newTotalScrapGraded,
        currentPeriodMetrics: newMetrics,
        /** Queue all modified tiles and new/updated snapshots for sync. */
        unsyncedRecords: (modifiedTileIds.length > 0 || modifiedSnapshotIds.length > 0 || newSnapshotIds.length > 0)
          ? {
            ...s.unsyncedRecords,
            tiles: [...s.unsyncedRecords.tiles, ...modifiedTileIds],
            snapshots: [...s.unsyncedRecords.snapshots, ...modifiedSnapshotIds, ...newSnapshotIds],
          }
          : s.unsyncedRecords,
      };
    });
  },

  // ── Query Methods ─────────────────────────────────────────────────

  /**
   * Look up a tile by its unique ID.
   *
   * @param id - Unique tile ID
   * @returns The TileRecord, or undefined if not found
   */
  getTileById: (id) => get().tiles.get(id),

  /**
   * Look up a tile by its sequential number.
   *
   * @param number - Sequential tile number
   * @returns The TileRecord, or undefined if not found
   */
  getTileByNumber: (number) => {
    const id = get().tilesByNumber.get(number);
    return id ? get().tiles.get(id) : undefined;
  },

  /**
   * Get all station visit snapshots for a tile.
   *
   * @param tileId - Unique tile ID
   * @returns Array of TileSnapshotRecords, empty if none found
   */
  getTileSnapshots: (tileId) => get().tileSnapshots.get(tileId) || [],

  /**
   * Fast-forward all tiles on the logical conveyor to completion.
   *
   * When the simulation stops, tiles still on the data-layer conveyor must
   * be flushed so that ON_BELT reaches 0 and every tile receives a final
   * quality grade. Without this, frozen tiles would create a count mismatch
   * between the visual and data layers.
   *
   * Uses a safety cap of 100 iterations to prevent infinite loops.
   * Each iteration calls moveTilesOnConveyor() with incrementing tick
   * values, moving every remaining tile one step closer to the exit.
   */
  drainConveyor: () => {
    const MAX_DRAIN_ITERATIONS = 100;
    let safety = 0;
    while (get().conveyorPositions.size > 0 && safety < MAX_DRAIN_ITERATIONS) {
      const state = get();
      /** Use virtual ticks beyond the last real tick for drain steps. */
      const drainSimTick = state.currentSimTick + safety + 1;
      const drainProdTick = state.currentProductionTick + safety + 1;
      /**
       * PHASE 1: moveTilesOnConveyor() is now fully synchronous —
       * defect evaluation happens inline inside set(). No drainMode needed.
       */
      state.moveTilesOnConveyor(drainSimTick, drainProdTick);
      safety++;
    }

    /**
     * POST-DRAIN SWEEP: Handle orphan tiles still in 'in_production'.
     *
     * PHASE 1 SIMPLIFICATION: The old Pass 2 (re-grading completed tiles
     * whose deferred microtask never fired) is no longer needed because
     * defect evaluation is now INLINE in moveTilesOnConveyor(). Grades
     * are correct at the moment of completion.
     *
     * Only Pass 1 remains: tiles somehow stuck in 'in_production' status
     * that were never picked up by moveTilesOnConveyor (edge case safety net).
     */

    set((s) => {
      const newTiles = new Map(s.tiles);
      const newMetrics = { ...s.currentPeriodMetrics };
      const modifiedIds: string[] = [];

      /** Track cumulative counter adjustments for orphan tiles. */
      let firstQualityAdj = 0;
      let secondQualityAdj = 0;
      let scrapGradedAdj = 0;
      let producedAdj = 0;

      for (const [id, tile] of newTiles) {
        /**
         * PASS 1 ONLY: Tiles stuck in 'in_production' — complete them.
         * Grade using existing inline snapshots (which now include defect data).
         */
        if (tile.status === 'in_production') {
          const snapshots = s.tileSnapshots.get(id) || [];
          const hasDefects = snapshots.some((snap) => snap.defect_detected);
          const isWasteBin = snapshots.some(
            (snap) =>
              snap.defect_detected &&
              snap.scrapped_here
          );

          const grade: QualityGrade = isWasteBin
            ? 'scrap'
            : hasDefects
              ? 'second_quality'
              : 'first_quality';

          newTiles.set(id, {
            ...tile,
            status: 'completed',
            final_grade: grade,
            completed_at_sim_tick: s.currentSimTick,
            synced: false,
            syncVersion: tile.syncVersion + 1,
          });
          modifiedIds.push(id);

          producedAdj++;
          if (grade === 'first_quality') firstQualityAdj++;
          else if (grade === 'second_quality') secondQualityAdj++;
          else if (grade === 'scrap') scrapGradedAdj++;
        }
      }

      if (modifiedIds.length === 0) return {};

      return {
        tiles: newTiles,
        totalTilesProduced: s.totalTilesProduced + producedAdj,
        totalFirstQuality: s.totalFirstQuality + firstQualityAdj,
        totalSecondQuality: s.totalSecondQuality + secondQualityAdj,
        totalScrapGraded: s.totalScrapGraded + scrapGradedAdj,
        currentPeriodMetrics: newMetrics,
        unsyncedRecords: {
          ...s.unsyncedRecords,
          tiles: [...s.unsyncedRecords.tiles, ...modifiedIds],
        },
      };
    });
  },

  /**
   * Remove synced completed/scrapped tiles from the tiles and tilesByNumber
   * Maps once they exceed MAX_COMPLETED_TILES, keeping the most recent ones.
   * Also removes their associated tileSnapshots to free memory.
   * Called periodically from tick() to prevent unbounded Map growth.
   */
  pruneCompletedTiles: () => {
    const state = get();
    /** Only prune when Maps grow significantly past the cap. */
    if (state.tiles.size <= MAX_COMPLETED_TILES) return;

    /**
     * Collect prunable tiles (completed/scrapped AND synced).
     * CRITICAL: Also check that ALL associated snapshots are synced.
     * Without this check, snapshots could be deleted from memory before
     * syncService has a chance to flush them to Supabase, causing tiles
     * to have zero passport data in the database.
     */
    const prunableTiles: Array<{ id: string; number: number; tick: number }> = [];
    for (const [id, tile] of state.tiles) {
      /** Keep tiles still on the conveyor or not yet synced. */
      if (state.conveyorPositions.has(id)) continue;
      if (!tile.synced) continue;
      const isFinished = tile.status === 'completed'
        || tile.status.startsWith('scrapped_at_');
      if (!isFinished) continue;

      /** Check that ALL snapshots for this tile have been synced to Supabase. */
      const snapshots = state.tileSnapshots.get(id);
      if (snapshots && snapshots.some((snap) => !snap.synced)) continue;

      prunableTiles.push({
        id,
        number: tile.tile_number,
        tick: tile.completed_at_sim_tick ?? tile.created_at_sim_tick,
      });
    }

    /** Nothing to prune. */
    if (prunableTiles.length <= MAX_COMPLETED_TILES) return;

    /** Sort oldest-first and determine which to evict. */
    prunableTiles.sort((a, b) => a.tick - b.tick);
    const toEvict = prunableTiles.slice(0, prunableTiles.length - MAX_COMPLETED_TILES);

    set((s) => {
      const newTiles = new Map(s.tiles);
      const newTilesByNumber = new Map(s.tilesByNumber);
      const newSnapshots = new Map(s.tileSnapshots);

      for (const { id, number } of toEvict) {
        newTiles.delete(id);
        newTilesByNumber.delete(number);
        newSnapshots.delete(id);
      }

      return {
        tiles: newTiles,
        tilesByNumber: newTilesByNumber,
        tileSnapshots: newSnapshots,
      };
    });
  },
});
