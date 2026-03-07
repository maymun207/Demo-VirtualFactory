/**
 * useSimulation.ts — UI Hooks for Simulation Data Store
 *
 * Provides optimized React hooks that subscribe to specific slices of
 * `simulationDataStore`, minimizing re-renders via `subscribeWithSelector`.
 *
 * These hooks do NOT access the MASTER `simulationStore` — they only
 * consume the data layer store. Components that need master clock data
 * (S-Clock, P-Clock, conveyor visual state) should continue using
 * `useSimulationStore` directly.
 *
 * Hooks:
 *  - useMachineState(station)    — params, status, deviations for one station
 *  - useSimulationMetrics()      — current period metrics and OEE history
 *  - useSimulationSession()      — session info and tick counters
 *  - useTilePassport(tileId)     — single tile's full künye (snapshot chain)
 *  - useScenarioState()          — active scenarios and scenario history
 *
 * Used by: UI components, dashboards, ML/AI visualizations
 */

import { useSimulationDataStore } from '../store/simulationDataStore';
import type { StationName } from '../store/types';
import { STATION_TOOLTIP_CONFIG } from '../components/ui/machineTooltipConfig';

/**
 * Derive optimal operating ranges from machineTooltipConfig.
 * This prevents duplication — ranges are defined once in STATION_TOOLTIP_CONFIG.
 * Result shape: { [stationName]: { [paramKey]: { min, max } } }
 */
const OPTIMAL_RANGES: Record<string, Record<string, { min: number; max: number }>> = (() => {
  const result: Record<string, Record<string, { min: number; max: number }>> = {};
  for (const [station, meta] of Object.entries(STATION_TOOLTIP_CONFIG)) {
    result[station] = {};
    for (const param of meta.params) {
      if (param.range) {
        result[station][param.key] = param.range;
      }
    }
  }
  return result;
})();

// =============================================================================
// DEVIATION STATUS TYPE
// =============================================================================

/** How far a parameter is from its optimal range. */
export interface ParameterDeviation {
  /** Normalized deviation (0 = center, 1 = edge of range, >1 = outside range). */
  value: number;
  /** Visual severity classification. */
  status: 'ok' | 'warning' | 'critical';
}

// =============================================================================
// useMachineState — Parameters, status, and deviations for one station
// =============================================================================

/**
 * Hook for individual machine state at a given station.
 *
 * @param station - The station to observe
 * @returns Current parameters, operational status, recent changes, and deviations
 *
 * @example
 * ```tsx
 * const { params, deviations, isHealthy } = useMachineState('press');
 * ```
 */
export function useMachineState(station: StationName) {
  const currentParams = useSimulationDataStore((s) => s.currentParams[station]);
  const machineStatus = useSimulationDataStore((s) => s.machineStatus[station]);
  const recentChanges = useSimulationDataStore((s) =>
    s.getRecentParameterChanges(station, 5)
  );

  // Calculate deviations from optimal ranges
  const ranges = OPTIMAL_RANGES[station] || {};
  const deviations: Record<string, ParameterDeviation> = {};

  for (const [param, range] of Object.entries(ranges)) {
    const value = (currentParams as Record<string, unknown>)[param];
    if (typeof value === 'number' && range) {
      const mid = (range.min + range.max) / 2;
      const tolerance = (range.max - range.min) / 2;
      const deviation = tolerance > 0 ? Math.abs(value - mid) / tolerance : 0;

      deviations[param] = {
        value: deviation,
        status: deviation > 1.5 ? 'critical' : deviation > 1 ? 'warning' : 'ok',
      };
    }
  }

  return {
    /** Current operating parameters for this station. */
    params: currentParams,
    /** Operating status (isOperating, faultCode). */
    status: machineStatus,
    /** Last 5 parameter change events for this station. */
    recentChanges,
    /** Deviation from optimal for each parameter. */
    deviations,
    /** True if ALL parameters are within optimal range. */
    isHealthy: Object.values(deviations).every((d) => d.status === 'ok'),
  };
}


// =============================================================================
// useSimulationMetrics — Current period and historical OEE/quality data
// =============================================================================

/**
 * Hook for the metrics dashboard.
 *
 * @returns Current period metrics, quality rate, and historical records
 *
 * @example
 * ```tsx
 * const { current, history } = useSimulationMetrics();
 * console.log(`Quality: ${current.qualityRate}%`);
 * ```
 */
export function useSimulationMetrics() {
  const currentMetrics = useSimulationDataStore((s) => s.currentPeriodMetrics);
  const history = useSimulationDataStore((s) => s.metricsHistory);
  const currentTick = useSimulationDataStore((s) => s.currentSimTick);

  // Calculate current quality rate
  const total = currentMetrics.totalProduced + currentMetrics.scrap;
  const qualityRate = total > 0
    ? (currentMetrics.firstQuality / total) * 100
    : 100;

  return {
    /** Current aggregation window metrics with computed quality rate. */
    current: {
      ...currentMetrics,
      qualityRate,
    },
    /** Array of finalized metric period records. */
    history,
    /** Current simulation tick (from data store). */
    currentTick,
  };
}

// =============================================================================
// useSimulationSession — Session info and run state
// =============================================================================

/**
 * Hook for session information display.
 *
 * @returns Session object, code, running state, and tick counters
 *
 * @example
 * ```tsx
 * const { sessionCode, isRunning, currentTick } = useSimulationSession();
 * ```
 */
export function useSimulationSession() {
  const session = useSimulationDataStore((s) => s.session);
  const sessionCode = useSimulationDataStore((s) => s.sessionCode);
  const isRunning = useSimulationDataStore((s) => s.isRunning);
  const currentTick = useSimulationDataStore((s) => s.currentSimTick);
  const productionTick = useSimulationDataStore((s) => s.currentProductionTick);

  return {
    /** Full session object (null if not started). */
    session,
    /** 6-character session code (e.g., 'A3F2B1'). */
    sessionCode,
    /** Whether the simulation data layer is actively recording. */
    isRunning,
    /** Current S-Clock tick (from data store). */
    currentTick,
    /** Current P-Clock tick (from data store). */
    productionTick,
  };
}

// =============================================================================
// useTilePassport — Full künye for a single tile
// =============================================================================

/**
 * Hook for viewing a tile's complete production passport (künye).
 *
 * @param tileId - The tile ID to observe (or undefined for no tile)
 * @returns Tile record, all station snapshots, and quality info
 *
 * @example
 * ```tsx
 * const { tile, snapshots, hasDefects } = useTilePassport(selectedTileId);
 * ```
 */
export function useTilePassport(tileId: string | undefined) {
  const tile = useSimulationDataStore((s) =>
    tileId ? s.getTileById(tileId) : undefined
  );
  const snapshots = useSimulationDataStore((s) =>
    tileId ? s.getTileSnapshots(tileId) : []
  );

  const hasDefects = snapshots.some((s) => s.defect_detected);
  const defectStations = snapshots
    .filter((s) => s.defect_detected)
    .map((s) => s.station);

  return {
    /** The tile record (undefined if not found). */
    tile,
    /** Ordered list of station snapshots (künye entries). */
    snapshots,
    /** Whether any defect was detected during production. */
    hasDefects,
    /** List of stations where defects were detected. */
    defectStations,
  };
}

// =============================================================================
// useActiveScenarios — Currently active defect scenarios
// =============================================================================

/**
 * Hook for monitoring active defect scenarios.
 *
 * @returns Array of currently active scenario activations
 *
 * @example
 * ```tsx
 * const { activeScenarios, hasActiveScenarios } = useActiveScenarios();
 * ```
 */
export function useActiveScenarios() {
  const activeScenarios = useSimulationDataStore((s) => s.activeScenarios);
  const scenarioHistory = useSimulationDataStore((s) => s.scenarioHistory);

  return {
    /** Map of currently active scenario activations. */
    activeScenarios,
    /** Whether any scenario is currently active. */
    hasActiveScenarios: activeScenarios.size > 0,
    /** Count of active scenarios. */
    activeCount: activeScenarios.size,
    /** Historical (deactivated) scenario records. */
    scenarioHistory,
  };
}
