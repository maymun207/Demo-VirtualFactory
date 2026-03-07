/**
 * kpiStore.ts — Key Performance Indicator State (Zustand)
 *
 * Holds the current values of all KPIs (OEE, FTQ, Scrap, Energy, Gas, CO₂),
 * defect heatmap data, and the trend history buffer used by kpiCalculations.
 *
 * Architecture:
 *  This store is PASSIVE — it holds data but does NOT compute KPIs itself.
 *  All KPI calculations and updates are driven by the `useKPISync` hook,
 *  which subscribes to simulationStore changes and writes results here.
 *
 * Used by: KPIContainer, DefectHeatmap, useKPISync, telemetryStore
 */
import { create } from 'zustand';
import type { KPI, Defect } from '../lib/params';
import { createInitialKPIs, createInitialDefects } from '../lib/params';
import type { KPIHistoryRecord } from '../lib/kpiCalculations';
import type { FactoryOEE, StationCounts } from './types';

/**
 * KPIState — Shape of the KPI store.
 */
interface KPIState {
  /**
   * Array of 6 KPI objects (OEE, FTQ, Scrap, Energy, Gas, CO₂).
   * Each KPI has a value string, unit, trend arrow, and direction.
   * Updated by useKPISync on every P-Clock tick.
   */
  kpis: KPI[];

  /**
   * Array of 8 defect types with current percentage values.
   * Used by the DefectHeatmap panel for color-coded visualization.
   * Values are randomized with jitter on each P-Clock tick.
   */
  defects: Defect[];

  /**
   * Rolling history of KPI snapshots used for trend calculation.
   * Each record captures KPI values at a specific S-Clock tick.
   * Older records beyond KPI_TREND_WINDOW are pruned automatically.
   */
  kpiHistory: KPIHistoryRecord[];

  /**
   * Reset all KPIs to their initial values.
   * Called by useFactoryReset during full factory reset.
   */
  resetKPIs: () => void;

  /** Hierarchical OEE data: machine → line → factory (updated each tick) */
  factoryOEE: FactoryOEE | null;

  /** Station tile counts (A-J variables, for diagnostics display) */
  stationCounts: StationCounts | null;

  /** Cumulative per-station energy since simulation start.
   *  Each tick's per-station energy from calculateEnergy() is ADDED here.
   *  Used for kWhPerTile calculations in OEE. */
  cumulativeStationEnergy: Record<string, { kWh: number; gas: number; co2: number }>;

  /**
   * Instantaneous (per-tick) total energy consumption in kWh.
   * Used by the alarm monitor for threshold comparison — the KPI card
   * shows cumulative totals, but alarms fire on the per-tick rate.
   */
  instantaneousEnergyKwh: number;

  /** Reset OEE-specific state (called during factory reset) */
  resetOEE: () => void;
}

// ─── Store Implementation ────────────────────────────────────────────────────

export const useKPIStore = create<KPIState>((set) => ({
  kpis: createInitialKPIs(),
  defects: createInitialDefects(),
  kpiHistory: [],
  factoryOEE: null,
  stationCounts: null,
  cumulativeStationEnergy: {},
  instantaneousEnergyKwh: 0,

  resetKPIs: () => set({
    kpis: createInitialKPIs(),
    defects: createInitialDefects(),
    kpiHistory: [],
    factoryOEE: null,
    stationCounts: null,
    cumulativeStationEnergy: {},
    instantaneousEnergyKwh: 0,
  }),

  resetOEE: () => set({
    factoryOEE: null,
    stationCounts: null,
    cumulativeStationEnergy: {},
    instantaneousEnergyKwh: 0,
  }),
}));
