/**
 * metricsSlice.ts — Metrics Aggregation & Alarm Logging Slice
 *
 * Manages production metrics aggregation and alarm event recording
 * within the simulation data store.
 *
 * Actions:
 *  - finalizePeriodMetrics: Archive the current metrics window and start a new one
 *  - recordAlarm: Record an alarm event and queue it for Supabase sync
 *
 * Dependencies:
 *  - generateUUID for unique IDs
 *  - useSimulationStore for the master S-Clock tick (used in alarm recording)
 *  - createEmptyPeriodMetrics from storeHelpers
 *
 * Used by: simulationDataStore.ts (composed via spread in the main create() call)
 */

import { generateUUID } from '../../lib/idGenerator';
import { useSimulationStore } from '../simulationStore';
import type {
  ProductionMetricsRecord,
  AlarmLogRecord,
  DefectType,
} from '../types';
import type { SetState, GetState, SimulationDataState } from './storeHelpers';
import { createEmptyPeriodMetrics } from './storeHelpers';
import { MAX_ALARM_LOGS, MAX_METRICS_HISTORY } from '../../lib/params';

/**
 * Factory function that creates the metrics and alarm portion of the store.
 * Receives Zustand's `set` and `get` to read/write the full store state.
 *
 * @param set - Zustand state setter (partial or updater function)
 * @param get - Zustand state getter (returns full SimulationDataState)
 * @returns Partial state object containing metrics/alarm fields and actions
 */
export const createMetricsSlice = (
  set: SetState,
  get: GetState,
): Pick<
  SimulationDataState,
  | 'currentPeriodMetrics'
  | 'metricsHistory'
  | 'alarmLogs'
  | 'finalizePeriodMetrics'
  | 'recordAlarm'
> => ({
  // ── Initial State ─────────────────────────────────────────────────
  /** Fresh metrics accumulator starting at tick 0. */
  currentPeriodMetrics: createEmptyPeriodMetrics(),
  /** No completed metrics periods yet. */
  metricsHistory: [],
  /** No alarm events yet. */
  alarmLogs: [],

  // ── Actions ─────────────────────────────────────────────────────

  /**
   * Finalize and archive the current metrics period.
   * Calculates OEE quality component, creates a ProductionMetricsRecord,
   * adds it to history, and starts a fresh accumulation window.
   *
   * @param simTick        - Current simulation tick (marks end of period)
   * @param productionTick - Current production tick (marks end of period)
   */
  finalizePeriodMetrics: (simTick, productionTick) => {
    const state = get();
    const metrics = state.currentPeriodMetrics;

    /** Calculate OEE quality component: first-quality / (total + scrap). */
    const total = metrics.totalProduced + metrics.scrap;
    const qualityPct = total > 0
      ? (metrics.firstQuality / total) * 100
      : 100;

    /** Build the completed metrics record. */
    const record: ProductionMetricsRecord = {
      id: generateUUID(),
      simulation_id: state.session!.id,
      period_start_sim_tick: metrics.periodStartTick,
      period_end_sim_tick: simTick,
      period_start_production_tick: Math.floor(
        metrics.periodStartTick / state.config.productionTickRatio
      ),
      period_end_production_tick: productionTick,
      total_tiles_produced: metrics.totalProduced,
      first_quality_count: metrics.firstQuality,
      second_quality_count: metrics.secondQuality,
      third_quality_count: metrics.thirdQuality,
      scrap_count: metrics.scrap,
      quality_pct: qualityPct,
      scrap_by_station: { ...metrics.scrapByStation },
      defect_counts: { ...metrics.defectCounts } as Record<DefectType, number>,
      synced: false,
    };

    /** Archive the record and start a new aggregation window.
     *  Ring-buffer: evict oldest entries when exceeding MAX_METRICS_HISTORY. */
    set((s) => {
      const nextHistory = [...s.metricsHistory, record];
      return {
        metricsHistory: nextHistory.length > MAX_METRICS_HISTORY
          ? nextHistory.slice(-MAX_METRICS_HISTORY)
          : nextHistory,
        currentPeriodMetrics: createEmptyPeriodMetrics(simTick),
        unsyncedRecords: {
          ...s.unsyncedRecords,
          metrics: [...s.unsyncedRecords.metrics, record.id],
        },
      };
    });
  },

  /**
   * Records an alarm event and queues it for Supabase sync.
   * Creates an AlarmLogRecord scoped to the active simulation session.
   * No-op if no session is active.
   *
   * @param params.type     - Alarm type string (e.g., 'oee_alert', 'machine_error')
   * @param params.severity - Severity level ('critical', 'warning', 'info')
   * @param params.stationId - Optional station that triggered the alarm
   * @param params.message  - Optional human-readable description
   */
  recordAlarm: (params) => {
    const state = get();
    /** Cannot record alarms without an active session. */
    if (!state.session) return;

    /** Read the master S-Clock tick for timing. */
    const masterState = useSimulationStore.getState();
    /** Generate unique ID for this alarm record. */
    const id = generateUUID();
    /** Timestamp for the alarm event. */
    const now = new Date().toISOString();

    /** Alarm log record mirroring the simulation_alarm_logs DB schema. */
    const record: AlarmLogRecord = {
      id,
      simulation_id: state.session.id,
      sim_tick: masterState.sClockCount,
      alarm_type: params.type,
      severity: params.severity,
      station_id: params.stationId,
      message: params.message,
      timestamp: now,
      synced: false,
    };

    /** Append to alarm logs and mark for sync.
     *  Ring-buffer: evict oldest entries when exceeding MAX_ALARM_LOGS. */
    set((s) => {
      const nextLogs = [...s.alarmLogs, record];
      return {
        alarmLogs: nextLogs.length > MAX_ALARM_LOGS
          ? nextLogs.slice(-MAX_ALARM_LOGS)
          : nextLogs,
        unsyncedRecords: {
          ...s.unsyncedRecords,
          alarmLogs: [...s.unsyncedRecords.alarmLogs, record.id],
        },
      };
    });
  },
});
