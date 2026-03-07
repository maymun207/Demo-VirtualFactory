/**
 * scenarioSlice.ts — Scenario Management Slice
 *
 * Manages defect scenario lifecycle within the simulation data store:
 * both automatic trigger-based scenarios and user-loaded scenarios
 * from the DemoSettingsPanel.
 *
 * Actions:
 *  - checkAndActivateScenarios: Evaluate trigger conditions each tick
 *  - deactivateScenario: Deactivate a specific scenario
 *  - loadScenario: Load a user-selected scenario (apply overrides)
 *  - getScenarioDefectProbability: Get total defect probability
 *  - getScenarioDefectTypes: Get defect types for a specific station
 *
 * Dependencies:
 *  - generateUUID for unique IDs
 *  - useSimulationStore for the master S-Clock tick
 *  - DEFECT_PROBABILITY from params.ts (baseline defect rate)
 *
 * Used by: simulationDataStore.ts (composed via spread in the main create() call)
 */

import { generateUUID } from '../../lib/idGenerator';
import { useSimulationStore } from '../simulationStore';
import { DEFECT_PROBABILITY, MAX_SCENARIO_HISTORY, MAX_ALARM_LOGS } from '../../lib/params';
import { REFERENCE_SCENARIO } from '../../lib/scenarios';
import { createLogger } from '../../lib/logger';
import type {
  ScenarioActivationRecord,
  AlarmLogRecord,
} from '../types';
import type { SetState, GetState, SimulationDataState } from './storeHelpers';
import { getStationParamValue } from './storeHelpers';

/** Module-level logger for scenario operations. */
const log = createLogger('ScenarioSlice');

/**
 * Factory function that creates the scenario management portion of the store.
 * Receives Zustand's `set` and `get` to read/write the full store state.
 *
 * @param set - Zustand state setter (partial or updater function)
 * @param get - Zustand state getter (returns full SimulationDataState)
 * @returns Partial state object containing scenario fields and actions
 */
export const createScenarioSlice = (
  set: SetState,
  get: GetState,
): Pick<
  SimulationDataState,
  | 'loadedScenarios'
  | 'activeScenarios'
  | 'scenarioHistory'
  | 'activeScenario'
  | 'activeScenarioActivationId'
  | 'checkAndActivateScenarios'
  | 'deactivateScenario'
  | 'loadScenario'
  | 'getScenarioDefectProbability'
  | 'getScenarioDefectTypes'
> => ({
  // ── Initial State ─────────────────────────────────────────────────
  /** No scenarios loaded initially. */
  loadedScenarios: [],
  /** No scenarios active initially. */
  activeScenarios: new Map(),
  /** Empty scenario history. */
  scenarioHistory: [],
  /**
   * SCN-000 (REFERENCE_SCENARIO) is pre-selected as the default active scenario.
   * This ensures the Senaryo Etkisi bar and ACTIVE label are visible immediately
   * when the Demo Settings panel is opened for the first time.
   */
  activeScenario: REFERENCE_SCENARIO,
  /** No activation record ID initially — SCN-000 has no formal activation. */
  activeScenarioActivationId: null,

  // ── Automatic Trigger-Based Scenarios ─────────────────────────────

  /**
   * Check loaded scenarios' trigger conditions against current parameters.
   * Activates matching scenarios that are not already active.
   *
   * @param simTick - Current simulation tick for the activation record
   */
  checkAndActivateScenarios: (simTick) => {
    const state = get();
    /** No scenarios to check. */
    if (state.loadedScenarios.length === 0) return;

    for (const scenario of state.loadedScenarios) {
      /** Skip inactive scenarios. */
      if (!scenario.is_active) continue;

      /** Skip already-active scenarios. */
      if (state.activeScenarios.has(scenario.id)) continue;

      /** Evaluate trigger conditions against current parameters. */
      const condition = scenario.trigger_conditions;
      const paramValue = getStationParamValue(
        state.currentParams[condition.station] as Record<string, unknown>,
        condition.parameter,
      );

      /** Skip if parameter not found. */
      if (paramValue === undefined) continue;

      /** Evaluate the condition operator against the threshold. */
      let triggered = false;
      switch (condition.condition) {
        case '>':
          triggered = condition.threshold !== undefined && paramValue > condition.threshold;
          break;
        case '<':
          triggered = condition.threshold !== undefined && paramValue < condition.threshold;
          break;
        case '>=':
          triggered = condition.threshold !== undefined && paramValue >= condition.threshold;
          break;
        case '<=':
          triggered = condition.threshold !== undefined && paramValue <= condition.threshold;
          break;
        case '=':
          triggered = condition.threshold !== undefined && paramValue === condition.threshold;
          break;
        case '!=':
          triggered = condition.threshold !== undefined && paramValue !== condition.threshold;
          break;
        case 'not_between':
          triggered =
            condition.threshold_low !== undefined &&
            condition.threshold_high !== undefined &&
            (paramValue < condition.threshold_low || paramValue > condition.threshold_high);
          break;
      }

      /** If triggered, create an activation record and update state. */
      if (triggered) {
        const activation: ScenarioActivationRecord = {
          id: generateUUID(),
          simulation_id: state.session!.id,
          scenario_id: scenario.id,
          scenario_code: scenario.code,
          activated_at_sim_tick: simTick,
          affected_tile_count: 0,
          actual_scrap_count: 0,
          actual_downgrade_count: 0,
          is_active: true,
          synced: false,
        };

        set((s) => {
          const newActive = new Map(s.activeScenarios);
          newActive.set(scenario.id, activation);
          return {
            activeScenarios: newActive,
            unsyncedRecords: {
              ...s.unsyncedRecords,
              scenarios: [...s.unsyncedRecords.scenarios, activation.id],
            },
          };
        });
      }
    }
  },

  /**
   * Deactivate a specific scenario.
   * Moves the activation record from active to history with timing data.
   *
   * @param scenarioId - ID of the scenario to deactivate
   * @param simTick    - Current simulation tick for duration calculation
   */
  deactivateScenario: (scenarioId, simTick) => {
    set((s) => {
      const newActive = new Map(s.activeScenarios);
      const scenario = newActive.get(scenarioId);
      if (scenario) {
        /** Create completed record with timing data. */
        const completed = {
          ...scenario,
          deactivated_at_sim_tick: simTick,
          duration_ticks: simTick - scenario.activated_at_sim_tick,
          is_active: false,
        };
        newActive.delete(scenarioId);
        /** Ring-buffer: evict oldest entries when exceeding MAX_SCENARIO_HISTORY. */
        const nextHistory = [...s.scenarioHistory, completed];
        return {
          activeScenarios: newActive,
          scenarioHistory: nextHistory.length > MAX_SCENARIO_HISTORY
            ? nextHistory.slice(-MAX_SCENARIO_HISTORY)
            : nextHistory,
        };
      }
      return {};
    });
  },

  // ── User-Loaded Scenario Management ───────────────────────────────

  /**
   * Load a scenario from DemoSettingsPanel.
   * Applies all parameter overrides, sets drift limits, creates an
   * activation record, records parameter change events, and logs an alarm.
   *
   * @param scenario - Full scenario definition to load
   */
  loadScenario: (scenario) => {
    const state = get();
    const masterState = useSimulationStore.getState();
    /** Read the current S-Clock tick for timing records. */
    const simTick = masterState.sClockCount;

    /** 1. Apply all parameter overrides using existing store actions. */
    for (const override of scenario.parameterOverrides) {
      /** Apply the parameter value (records change automatically if session). */
      state.updateParameter(
        override.station,
        override.parameter,
        override.value,
        'step',     // ChangeType
        'scenario'  // ChangeReason
      );

      /** Apply the drift limit for this parameter. */
      state.updateDriftLimit(
        override.station,
        override.parameter,
        override.driftLimit
      );
    }

    /**
     * 1b. Apply conveyor settings from the scenario to the conveyor store.
     * Without this, clicking a scenario card only updates machine station params
     * but leaves conveyor at factory defaults — the user would need to manually
     * click "Get DefaultParams" on the Conveyor tab to apply scenario values.
     */
    const cs = scenario.conveyorSettings;
    state.updateConveyorParam('jammed_time', cs.jammedTime);
    state.updateConveyorParam('impacted_tiles', cs.impactedTiles);
    state.updateConveyorParam('scrap_probability', cs.scrapProbability);
    state.updateConveyorDriftLimit('jammed_time', cs.jammedTimeDrift);
    state.updateConveyorDriftLimit('impacted_tiles', cs.impactedTilesDrift);
    state.updateConveyorDriftLimit('scrap_probability', cs.scrapProbabilityDrift);
    state.updateConveyorBoolParam('speed_change', cs.speedChange);
    state.updateConveyorBoolParam('jammed_events', cs.jammedEvents);
    state.updateConveyorDriftLimit('speed_change', cs.speedChangeDrift);
    state.updateConveyorDriftLimit('jammed_events', cs.jammedEventsDrift);

    /** 2. Create ScenarioActivationRecord. */
    const activationId = generateUUID();
    const activation: ScenarioActivationRecord = {
      id: activationId,
      simulation_id: state.session?.id ?? '',
      scenario_id: scenario.id,
      scenario_code: scenario.code,
      activated_at_sim_tick: simTick,
      affected_tile_count: 0,
      actual_scrap_count: 0,
      actual_downgrade_count: 0,
      is_active: true,
      synced: false,
    };

    /** 3. Log scenario activation alarm. */
    const alarmId = generateUUID();
    const alarmRecord: AlarmLogRecord = {
      id: alarmId,
      simulation_id: state.session?.id ?? '',
      sim_tick: simTick,
      alarm_type: 'system_info',
      severity: 'info',
      station_id: undefined,
      message: `Scenario ${scenario.code} (${scenario.name.en}) activated. Severity: ${scenario.severity}. Expected scrap: ${scenario.expectedScrapRange.min}–${scenario.expectedScrapRange.max}%`,
      timestamp: new Date().toISOString(),
      synced: false,
    };

    /** 4. Set state atomically.
     *  Ring-buffer: evict oldest alarm entries when exceeding MAX_ALARM_LOGS. */
    set((s) => {
      const newActiveScenarios = new Map(s.activeScenarios);
      newActiveScenarios.set(activationId, activation);
      const nextAlarmLogs = [...s.alarmLogs, alarmRecord];
      return {
        activeScenario: scenario,
        activeScenarioActivationId: activationId,
        activeScenarios: newActiveScenarios,
        alarmLogs: nextAlarmLogs.length > MAX_ALARM_LOGS
          ? nextAlarmLogs.slice(-MAX_ALARM_LOGS)
          : nextAlarmLogs,
        unsyncedRecords: {
          ...s.unsyncedRecords,
          scenarios: [...s.unsyncedRecords.scenarios, activationId],
          alarmLogs: [...s.unsyncedRecords.alarmLogs, alarmId],
        },
      };
    });

    log.info('Scenario %s activated — %d overrides applied', scenario.code, scenario.parameterOverrides.length);
  },

  // ── Defect Probability Queries ────────────────────────────────────

  /**
   * Get the TOTAL defect probability across ALL stations under the active scenario.
   * Returns the base DEFECT_PROBABILITY (0.05) if no scenario is active.
   *
   * Sums every expectedDefect entry regardless of primaryStation, because
   * defects originating at ANY upstream station (kiln, glaze, printer, etc.)
   * ultimately manifest as scrap at the sorting station.
   * The result is converted to a 0–1 scale and capped at 0.95.
   */
  getScenarioDefectProbability: () => {
    const { activeScenario } = get();
    /** No scenario loaded — use the baseline defect rate from params. */
    if (!activeScenario) return DEFECT_PROBABILITY;

    /** If the scenario has no expected defects, fall back to baseline. */
    const allDefects = activeScenario.expectedDefects;
    if (allDefects.length === 0) return DEFECT_PROBABILITY;

    /** Sum ALL expected defect probabilities across every station. */
    const totalPct = allDefects.reduce((sum, d) => sum + d.probability_pct, 0);
    /** Convert percentage to a 0–1 probability, capped at 95%. */
    return Math.min(totalPct / 100, 0.95);
  },

  /**
   * Get the likely defect types for a station under the active scenario.
   * Returns empty array if no scenario is active or station not affected.
   *
   * @param station - Station to query defect types for
   * @returns Array of { defectType, probability_pct } for the station
   */
  getScenarioDefectTypes: (station) => {
    const { activeScenario } = get();
    if (!activeScenario) return [];

    return activeScenario.expectedDefects
      .filter((d) => d.primaryStation === station)
      .map((d) => ({ defectType: d.defectType, probability_pct: d.probability_pct }));
  },
});
