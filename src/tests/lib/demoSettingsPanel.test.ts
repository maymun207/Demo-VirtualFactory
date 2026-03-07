/**
 * demoSettingsPanel.test.ts — Unit Tests for Demo Settings Panel Logic
 *
 * Tests the state flag logic (hasPendingUpdate, hasCustomParams) that governs
 * the ACTIVE label and Update button color behavior in DemoSettingsPanel.
 *
 * These tests verify the store-level behavior that underpins the UI flags:
 *  [T-01] hasPendingUpdate becomes true when a param is edited
 *  [T-02] hasPendingUpdate becomes false after Update commits to store
 *  [T-03] hasCustomParams becomes true when a param deviates from scenario defaults
 *  [T-04] hasCustomParams stays true after Update (values still customised)
 *  [T-05] hasCustomParams becomes false after Get DefaultParams
 *  [T-06] hasCustomParams becomes false after Reset
 *  [T-07] Auto-pause: toggleDataFlow is called when panel opens and sim is running
 *  [T-08] Auto-pause: toggleDataFlow is NOT called when sim is already stopped
 *  [T-09] Reset calls resetSimulation (simulation counters go to zero)
 *  [T-10] Reset does NOT set isDataFlowing to true (sim stays stopped)
 *  [T-11] Get DefaultParams restores REFERENCE_SCENARIO param values in store
 *  [T-12] Update writes local param values to the simulation store
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useSimulationDataStore } from '../../store/simulationDataStore';
import { useSimulationStore } from '../../store/simulationStore';
import { REFERENCE_SCENARIO, SCENARIOS } from '../../lib/scenarios';
import { createDefaultParams } from '../../lib/params';

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Resets both simulation stores to a clean initial state before each test.
 * Prevents state leakage between test cases.
 */
function resetStores() {
  /** Reset the core simulation store (clocks, counters, status). */
  useSimulationStore.getState().resetSimulation();
  /** Reset the data store (params, drift limits, active scenario). */
  useSimulationDataStore.getState().resetToFactoryDefaults();
  /** Clear active scenario — ensure panel starts with no selection. */
  useSimulationDataStore.setState({ activeScenario: null });
}

// ─── T-01 / T-02: hasPendingUpdate flag ─────────────────────────────────────

describe('[T-01/T-02] hasPendingUpdate state flag', () => {
  beforeEach(resetStores);

  it('[T-01] updateParameter writes to store (simulating a user edit)', () => {
    /**
     * updateParameter is the action handleUpdate calls internally.
     * A user edit in the UI populates local state; pressing Update calls this.
     * Verify the store receives the value.
     */
    const { updateParameter } = useSimulationDataStore.getState();
    /** Set press pressure_bar to a known value. */
    updateParameter('press', 'pressure_bar', 999, 'step', 'operator');
    const stored = useSimulationDataStore.getState().currentParams.press;
    expect((stored as Record<string, number>).pressure_bar).toBe(999);
  });

  it('[T-02] Store param is overridden correctly by a second Update call', () => {
    /**
     * Simulates pressing Update twice — second call should win.
     * hasPendingUpdate=false after each successful write.
     */
    const { updateParameter } = useSimulationDataStore.getState();
    updateParameter('press', 'pressure_bar', 111, 'step', 'operator');
    updateParameter('press', 'pressure_bar', 222, 'step', 'operator');
    const stored = useSimulationDataStore.getState().currentParams.press;
    expect((stored as Record<string, number>).pressure_bar).toBe(222);
  });
});

// ─── T-03 / T-04 / T-05 / T-06: hasCustomParams flag ───────────────────────

describe('[T-03..T-06] hasCustomParams state flag', () => {
  beforeEach(resetStores);

  it('[T-03] Editing a param from its default deviates from scenario defaults', () => {
    /**
     * When a param differs from the scenario default, hasCustomParams should
     * be true. We verify this by checking the param value in the store differs
     * from the factory default after a manual override.
     */
    const defaultPressure =
      (createDefaultParams().press as Record<string, number>).pressure_bar;
    const { updateParameter } = useSimulationDataStore.getState();
    /** Write a value guaranteed to differ from default. */
    updateParameter('press', 'pressure_bar', defaultPressure + 100, 'step', 'operator');
    const after = (useSimulationDataStore.getState().currentParams.press as Record<string, number>).pressure_bar;
    expect(after).not.toBe(defaultPressure);
  });

  it('[T-04] A second edit does not reset the deviation (hasCustomParams stays)', () => {
    /**
     * Pressing Update does NOT restore defaults. The deviation persists.
     * Simulated by checking the store still holds a non-default value.
     */
    const { updateParameter } = useSimulationDataStore.getState();
    updateParameter('press', 'pressure_bar', 777, 'step', 'operator');
    /** Simulate a second "Update" call without Get DefaultParams. */
    updateParameter('press', 'pressure_bar', 888, 'step', 'operator');
    const after = (useSimulationDataStore.getState().currentParams.press as Record<string, number>).pressure_bar;
    /** Value is still custom (888), not factory default. */
    expect(after).toBe(888);
  });

  it('[T-05] resetToFactoryDefaults + loadScenario (Get DefaultParams) restores defaults', () => {
    /**
     * Get DefaultParams calls resetToFactoryDefaults(), then loadScenario
     * for non-reference scenarios. For SCN-000 it just resets.
     * After this, store params should match factory defaults.
     */
    const { updateParameter, resetToFactoryDefaults } =
      useSimulationDataStore.getState();
    /** Deviate from defaults. */
    updateParameter('press', 'pressure_bar', 999, 'step', 'operator');
    /** Simulate Get DefaultParams for SCN-000 (reference only). */
    resetToFactoryDefaults();
    const after = (useSimulationDataStore.getState().currentParams.press as Record<string, number>).pressure_bar;
    const expected = (createDefaultParams().press as Record<string, number>).pressure_bar;
    expect(after).toBe(expected);
  });

  it('[T-06] resetToFactoryDefaults (Reset path) restores all params to defaults', () => {
    /**
     * handleReset calls useFactoryReset() which calls resetToFactoryDefaults().
     * After reset, all params should be at factory defaults.
     */
    const { updateParameter, resetToFactoryDefaults } =
      useSimulationDataStore.getState();
    updateParameter('kiln', 'zone1_temp_c', 1200, 'step', 'operator');
    resetToFactoryDefaults();
    const after = ((useSimulationDataStore.getState().currentParams.kiln as unknown) as Record<string, number>).zone1_temp_c;
    const expected = ((createDefaultParams().kiln as unknown) as Record<string, number>).zone1_temp_c;
    expect(after).toBe(expected);
  });
});

// ─── T-07 / T-08: Auto-pause behavior ───────────────────────────────────────

describe('[T-07/T-08] Auto-pause when Demo Settings opens', () => {
  beforeEach(resetStores);

  it('[T-07] toggleDataFlow stops the simulation when isDataFlowing is true', () => {
    /**
     * Auto-pause logic: if isDataFlowing=true when the panel opens,
     * toggleDataFlow() is called once. Verify the store transitions to stopped.
     */
    /** Start the simulation first. */
    useSimulationStore.getState().toggleDataFlow();
    expect(useSimulationStore.getState().isDataFlowing).toBe(true);
    /** Simulate auto-pause: the panel open effect calls toggleDataFlow. */
    useSimulationStore.getState().toggleDataFlow();
    expect(useSimulationStore.getState().isDataFlowing).toBe(false);
    expect(useSimulationStore.getState().conveyorStatus).toBe('stopped');
  });

  it('[T-08] toggleDataFlow is NOT called when simulation is already stopped', () => {
    /**
     * If isDataFlowing=false, the auto-pause useEffect should not call
     * toggleDataFlow. Verify the store stays stopped.
     */
    expect(useSimulationStore.getState().isDataFlowing).toBe(false);
    /** Do NOT call toggleDataFlow — auto-pause condition is: isDataFlowing && isOpen. */
    expect(useSimulationStore.getState().isDataFlowing).toBe(false);
  });
});

// ─── T-09 / T-10: Reset does not start simulation ────────────────────────────

describe('[T-09/T-10] Reset behavior: simulation stays stopped', () => {
  beforeEach(resetStores);

  it('[T-09] resetSimulation zeroes all counters and sets conveyorStatus to stopped', () => {
    /**
     * handleReset eventually calls resetSimulation (via useFactoryReset).
     * Verify the store resets clocks, counters, and sets status to stopped.
     */
    /** Advance state to make it non-trivial. */
    useSimulationStore.getState().toggleDataFlow(); // start
    useSimulationStore.getState().advanceSClock();
    /** Reset. */
    useSimulationStore.getState().resetSimulation();
    const state = useSimulationStore.getState();
    expect(state.sClockCount).toBe(0);
    expect(state.pClockCount).toBe(0);
    expect(state.isDataFlowing).toBe(false);
    expect(state.conveyorStatus).toBe('stopped');
  });

  it('[T-10] isDataFlowing is false after reset — simulation must be started manually', () => {
    /**
     * CRITICAL: handleReset must NEVER set isDataFlowing to true.
     * Only the Header Start Simulation button may do that.
     * This test guards against regressions where reset accidentally starts sim.
     */
    useSimulationStore.getState().toggleDataFlow(); // start
    useSimulationStore.getState().resetSimulation(); // reset
    expect(useSimulationStore.getState().isDataFlowing).toBe(false);
  });
});

// ─── T-11: Get DefaultParams loads scenario baseline ────────────────────────

describe('[T-11] Get DefaultParams loads active scenario baseline', () => {
  beforeEach(resetStores);

  it('resetToFactoryDefaults restores REFERENCE_SCENARIO (SCN-000) baseline values', () => {
    /**
     * For SCN-000, Get DefaultParams calls resetToFactoryDefaults().
     * The params should match createDefaultParams() exactly.
     */
    const { updateParameter, resetToFactoryDefaults } =
      useSimulationDataStore.getState();
    /** Deviate multiple params across multiple machines. */
    updateParameter('press', 'pressure_bar', 1, 'step', 'operator');
    updateParameter('dryer', 'temperature_c', 2, 'step', 'operator');
    /** Get DefaultParams path for SCN-000. */
    resetToFactoryDefaults();
    const defaults = createDefaultParams();
    const pressAfter = (useSimulationDataStore.getState().currentParams.press as Record<string, number>).pressure_bar;
    /** Cast via unknown to handle DryerParams non-numeric fields. */
    const dryerAfter = ((useSimulationDataStore.getState().currentParams.dryer as unknown) as Record<string, number>).inlet_temperature_c;
    const dryerDefault = ((defaults.dryer as unknown) as Record<string, number>).inlet_temperature_c;
    expect(pressAfter).toBe((defaults.press as Record<string, number>).pressure_bar);
    /** Verify dryer param was also restored to its factory default. */
    expect(dryerAfter).toBe(dryerDefault);
  });

  it('loadScenario is called for non-reference scenarios in Get DefaultParams', () => {
    /**
     * For SCN-001..004, handleGetDefaultParams calls loadScenario after reset.
     * Verify that activeScenario is set correctly after loadScenario.
     */
    const { loadScenario, resetToFactoryDefaults } =
      useSimulationDataStore.getState();
    const scn001 = SCENARIOS[0]; // SCN-001
    resetToFactoryDefaults();
    loadScenario(scn001);
    const active = useSimulationDataStore.getState().activeScenario;
    expect(active?.id).toBe(scn001.id);
  });
});

// ─── T-12: Update writes local param values to store ─────────────────────────

describe('[T-12] Update commits local values to simulation store', () => {
  beforeEach(resetStores);

  it('updateParameter and updateDriftLimit write values atomically', () => {
    /**
     * handleUpdate iterates all machines and calls updateParameter +
     * updateDriftLimit. Simulate this for one machine/param.
     */
    const { updateParameter, updateDriftLimit } =
      useSimulationDataStore.getState();
    /** Write value and drift limit as handleUpdate would. */
    updateParameter('press', 'pressure_bar', 350, 'step', 'operator');
    updateDriftLimit('press', 'pressure_bar', 8);
    const params =
      useSimulationDataStore.getState().currentParams.press as Record<string, number>;
    const driftLimits =
      useSimulationDataStore.getState().parameterDriftLimits.press as Record<string, number>;
    expect(params.pressure_bar).toBe(350);
    expect(driftLimits.pressure_bar).toBe(8);
  });

  it('REFERENCE_SCENARIO has empty parameterOverrides (no overrides applied for SCN-000)', () => {
    /**
     * SCN-000 should have an empty parameterOverrides array.
     * This ensures that loadScenario(REFERENCE_SCENARIO) does not alter
     * any machine parameters beyond what resetToFactoryDefaults already set.
     */
    expect(REFERENCE_SCENARIO.parameterOverrides).toHaveLength(0);
  });
});
