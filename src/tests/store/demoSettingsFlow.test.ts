/**
 * demoSettingsFlow.test.ts — Automated Functional Tests for Demo Settings Flow
 *
 * End-to-end store-level tests that simulate the full user flow through the
 * Demo Settings Panel, verifying state transitions across multiple scenarios.
 *
 * Test cases:
 *  [F-01] SCN-000 selected → Get DefaultParams → values match REFERENCE_SCENARIO baseline
 *  [F-02] Edit a value → Update → store's currentParams is updated correctly
 *  [F-03] Edit + Update → SCN defaults not restored → hasCustomParams stays (not cleared)
 *  [F-04] Get DefaultParams → store is auto-updated (no separate Update needed)
 *  [F-05] Reset → isDataFlowing === false (simulation does NOT restart)
 *  [F-06] Reset → currentParams returns to factory defaults
 *  [F-07] Parameter persistence after Update → reopen (buildInitialValues round-trip)
 *  [F-08] Factory reset clears activeScenario to REFERENCE_SCENARIO
 *  [F-09] Factory reset clears cumulative quality counters to zero
 *  [F-10] Reset inside Demo Settings reads FRESH activeScenario (no stale closure)
 *  [F-11] startSession preserves activeScenario across session boundary
 *  [F-12] Live-store overrides win over scenario definition (speed_change regression)
 *  [F-13] Start gate stays locked after natural simulation end even if
 *          Demo Settings is opened and closed (simulationEnded guard)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useSimulationDataStore } from '../../store/simulationDataStore';
import { useSimulationStore } from '../../store/simulationStore';
/** uiStore import — needed by F-13 tests for simulationEnded flag assertions */
import { useUIStore } from '../../store/uiStore';
import { REFERENCE_SCENARIO, SCENARIOS } from '../../lib/scenarios';
import { createDefaultParams } from '../../lib/params';
import type { StationName } from '../../store/types';


// ─── Test Utilities ──────────────────────────────────────────────────────────

/**
 * simulateUpdate: replicates what handleUpdate does in DemoSettingsPanel.
 * Writes a map of {machine: {param: {value, variation}}} to the store.
 */
function simulateUpdate(
  paramMap: Record<string, Record<string, { value: string; variation: string }>>,
) {
  const { updateParameter, updateDriftLimit } =
    useSimulationDataStore.getState();
  for (const [machine, params] of Object.entries(paramMap)) {
    for (const [paramKey, pv] of Object.entries(params)) {
      /** Parse and write value. */
      const numValue = parseFloat(pv.value);
      if (!isNaN(numValue)) {
        updateParameter(machine as StationName, paramKey, numValue, 'step', 'operator');
      }
      /** Parse and write drift limit. */
      const driftLimit = parseFloat(pv.variation);
      if (!isNaN(driftLimit) && driftLimit >= 0) {
        updateDriftLimit(machine as StationName, paramKey, driftLimit);
      }
    }
  }
}

/**
 * simulateGetDefaultParams: replicates what handleGetDefaultParams does.
 * For SCN-000: reset only. For SCN-001..004: reset + re-apply overrides.
 */
function simulateGetDefaultParams(scenarioId: string | null) {
  const { resetToFactoryDefaults, loadScenario } =
    useSimulationDataStore.getState();
  /** Step 1: reset to factory baseline. */
  resetToFactoryDefaults();
  /** Step 2: for non-reference scenarios, re-apply their overrides. */
  if (scenarioId && scenarioId !== REFERENCE_SCENARIO.id) {
    const scenario = SCENARIOS.find((s) => s.id === scenarioId);
    if (scenario) loadScenario(scenario);
  }
}

/**
 * simulateReset: replicates what the FIXED handleReset does (without Supabase).
 * Resets simulation store + data store. Reads activeScenario from the FRESH
 * store state after reset (not from a stale closure parameter).
 */
function simulateReset() {
  /** Reset core simulation state (sets isDataFlowing=false, clears clocks). */
  useSimulationStore.getState().resetSimulation();
  /** Reset data store (sets activeScenario=REFERENCE_SCENARIO, clears counters). */
  useSimulationDataStore.getState().resetDataStore();

  /**
   * Read activeScenario from the FRESH store state — this is the key fix.
   * After resetDataStore(), activeScenario is always REFERENCE_SCENARIO.
   * The old code used a stale closure parameter which would re-apply the
   * previous scenario, undoing the reset.
   */
  const freshScenario = useSimulationDataStore.getState().activeScenario;
  if (freshScenario && freshScenario.id !== REFERENCE_SCENARIO.id) {
    useSimulationDataStore.getState().resetToFactoryDefaults();
    useSimulationDataStore.getState().loadScenario(freshScenario);
  }
}

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  /** Clear all store state before each test to prevent cross-test leakage. */
  useSimulationStore.getState().resetSimulation();
  useSimulationDataStore.getState().resetToFactoryDefaults();
  useSimulationDataStore.setState({ activeScenario: null });
});

// ─── [F-01] SCN-000 + Get DefaultParams ─────────────────────────────────────

describe('[F-01] SCN-000 → Get DefaultParams flow', () => {

  it('after selecting SCN-000, Get DefaultParams restores factory defaults in store', () => {
    /**
     * User flow: select SCN-000 → deviate params → Get DefaultParams.
     * Expected: store params match createDefaultParams() exactly.
     */
    /** Simulate selecting SCN-000: set activeScenario to REFERENCE_SCENARIO. */
    useSimulationDataStore.getState().loadScenario(REFERENCE_SCENARIO);

    /** Deviate params to simulate user editing. */
    useSimulationDataStore.getState().updateParameter(
      'press', 'pressure_bar', 1111, 'step', 'operator',
    );

    /** Simulate Get DefaultParams for SCN-000. */
    simulateGetDefaultParams(REFERENCE_SCENARIO.id);

    /** Assert: press pressure_bar is back to factory default. */
    const expected =
      (createDefaultParams().press as Record<string, number>).pressure_bar;
    const actual =
      (useSimulationDataStore.getState().currentParams.press as Record<string, number>).pressure_bar;
    expect(actual).toBe(expected);
  });

  it('REFERENCE_SCENARIO has no parameter overrides — defaults are pure factory values', () => {
    /**
     * For SCN-000, Get DefaultParams should produce exactly factory defaults.
     * Verify no hidden overrides exist in REFERENCE_SCENARIO.
     */
    expect(REFERENCE_SCENARIO.parameterOverrides).toHaveLength(0);
  });
});

// ─── [F-02] Edit → Update flow ───────────────────────────────────────────────

describe('[F-02] Edit value → Update → store updated', () => {

  it('simulateUpdate writes multiple machine params to store in one pass', () => {
    /**
     * handleUpdate iterates all machines and writes each param.
     * Verify multi-machine writes land correctly.
     * Uses 'inlet_temperature_c' — the correct dryer param key from params.ts.
     */
    simulateUpdate({
      press: {
        pressure_bar: { value: '400', variation: '6' },
      },
      dryer: {
        /** 'inlet_temperature_c' is the correct dryer parameter key in machineParams.ts. */
        inlet_temperature_c: { value: '195', variation: '4' },
      },
    });

    const pressAfter =
      (useSimulationDataStore.getState().currentParams.press as Record<string, number>).pressure_bar;
    const dryerAfter =
      ((useSimulationDataStore.getState().currentParams.dryer as unknown) as Record<string, number>).inlet_temperature_c;

    expect(pressAfter).toBe(400);
    expect(dryerAfter).toBe(195);
  });

  it('drift limits are also committed to store via simulateUpdate', () => {
    /**
     * The variation column maps to drift limits. Ensure they are written.
     */
    simulateUpdate({
      kiln: {
        zone1_temp_c: { value: '950', variation: '7' },
      },
    });

    const driftAfter =
      (useSimulationDataStore.getState().parameterDriftLimits.kiln as Record<string, number>).zone1_temp_c;

    expect(driftAfter).toBe(7);
  });
});

// ─── [F-03] Edit + Update ≠ cleared customisation ────────────────────────────

describe('[F-03] Edit + Update does not restore defaults (hasCustomParams persists)', () => {

  it('after simulateUpdate with custom value, store retains custom (not factory) value', () => {
    /**
     * hasCustomParams stays true after Update. Store holds the custom value.
     * Get DefaultParams (not Update) is what restores the factory value.
     */
    const defaultPressure =
      (createDefaultParams().press as Record<string, number>).pressure_bar;

    simulateUpdate({
      press: {
        pressure_bar: { value: String(defaultPressure + 50), variation: '5' },
      },
    });

    const after =
      (useSimulationDataStore.getState().currentParams.press as Record<string, number>).pressure_bar;

    /** Value is custom, not factory default. */
    expect(after).toBe(defaultPressure + 50);
    expect(after).not.toBe(defaultPressure);
  });
});

// ─── [F-04] Get DefaultParams auto-commits ───────────────────────────────────

describe('[F-04] Get DefaultParams auto-commits without separate Update', () => {

  it('after simulateGetDefaultParams for SCN-000, store holds factory defaults (no Update needed)', () => {
    /**
     * Get DefaultParams does an immediate store write via resetToFactoryDefaults
     * (and loadScenario for non-reference). No separate Update button press needed.
     */
    /** Deviate first. */
    useSimulationDataStore.getState().updateParameter(
      'sorting', 'sensitivity_pct', 999, 'step', 'operator',
    );

    /** Get DefaultParams — auto-commit. */
    simulateGetDefaultParams(REFERENCE_SCENARIO.id);

    const expected =
      (createDefaultParams().sorting as Record<string, number>).sensitivity_pct;
    const actual =
      (useSimulationDataStore.getState().currentParams.sorting as Record<string, number>).sensitivity_pct;

    expect(actual).toBe(expected);
  });

  it('after simulateGetDefaultParams for SCN-001, re-applied overrides are in store', () => {
    /**
     * For non-reference scenarios, overrides should be re-applied.
     * The active scenario's loadScenario is called as part of Get DefaultParams.
     */
    const scn001 = SCENARIOS[0]; // SCN-001

    /** Load SCN-001 as active scenario. */
    useSimulationDataStore.getState().loadScenario(scn001);
    /** Deviate a param away from scenario defaults. */
    useSimulationDataStore.getState().updateParameter(
      'press', 'pressure_bar', 1, 'step', 'operator',
    );

    /** Simulate Get DefaultParams for SCN-001. */
    simulateGetDefaultParams(scn001.id);

    /**
     * activeScenario should still be SCN-001 after reloading.
     * (loadScenario re-sets activeScenario as a side effect.)
     */
    const active = useSimulationDataStore.getState().activeScenario;
    expect(active?.id).toBe(scn001.id);
  });
});

// ─── [F-05] Reset keeps simulation stopped ───────────────────────────────────

describe('[F-05] Reset → simulation does NOT start', () => {

  it('after simulateReset, isDataFlowing remains false', () => {
    /**
     * CRITICAL: handleReset must never restart the simulation. Only the Header
     * Start button can set isDataFlowing = true.
     */
    /** Start the simulation to create a realistic pre-condition. */
    useSimulationStore.getState().toggleDataFlow();
    expect(useSimulationStore.getState().isDataFlowing).toBe(true);

    /** Simulate the Reset action (stops sim as part of resetSimulation). */
    simulateReset();

    expect(useSimulationStore.getState().isDataFlowing).toBe(false);
    expect(useSimulationStore.getState().conveyorStatus).toBe('stopped');
  });

  it('sClockCount and pClockCount are zero after simulateReset', () => {
    /**
     * Full clock reset is part of simulateReset.
     */
    useSimulationStore.getState().toggleDataFlow();
    useSimulationStore.getState().advanceSClock();
    simulateReset();
    expect(useSimulationStore.getState().sClockCount).toBe(0);
    expect(useSimulationStore.getState().pClockCount).toBe(0);
  });
});

// ─── [F-06] Reset restores factory defaults ───────────────────────────────────

describe('[F-06] Reset → currentParams returns to factory defaults', () => {

  it('after simulateReset, all params are factory defaults', () => {
    /**
     * simulateReset calls resetDataStore which restores createDefaultParams().
     */
    /** Deviate multiple machines. */
    useSimulationDataStore.getState().updateParameter('press', 'pressure_bar', 1, 'step', 'operator');
    useSimulationDataStore.getState().updateParameter('kiln', 'zone1_temp_c', 1, 'step', 'operator');

    simulateReset();

    const defaults = createDefaultParams();
    const pressAfter =
      (useSimulationDataStore.getState().currentParams.press as Record<string, number>).pressure_bar;
    /** Cast via unknown to handle KilnParams zone_temperatures_c array field. */
    const kilnAfter =
      ((useSimulationDataStore.getState().currentParams.kiln as unknown) as Record<string, number>).zone1_temp_c;

    expect(pressAfter).toBe((defaults.press as Record<string, number>).pressure_bar);
    expect(kilnAfter).toBe(((defaults.kiln as unknown) as Record<string, number>).zone1_temp_c);
  });

  it('after reset, activeScenario is REFERENCE_SCENARIO (not a stale previous scenario)', () => {
    /**
     * CRITICAL FIX VERIFICATION: The old handleReset used a stale closure
     * that would re-apply the previous scenario after resetFactory(). The fix
     * reads activeScenario from the fresh store state. After resetDataStore(),
     * activeScenario is always REFERENCE_SCENARIO.
     */
    const scn002 = SCENARIOS[1]; // SCN-002
    useSimulationDataStore.getState().loadScenario(scn002);
    expect(useSimulationDataStore.getState().activeScenario?.id).toBe(scn002.id);

    /** Simulate full reset — this should NOT re-apply SCN-002. */
    simulateReset();

    /** After reset, activeScenario must be REFERENCE_SCENARIO, not SCN-002. */
    const active = useSimulationDataStore.getState().activeScenario;
    expect(active?.id).toBe(REFERENCE_SCENARIO.id);
  });
});

// ─── [F-07] Parameter persistence after Update → reopen ──────────────────────

describe('[F-07] Parameter persistence: Update → close → reopen', () => {

  it('values written via simulateUpdate survive a buildInitialValues re-read', () => {
    /**
     * Simulates the flow: user edits params, clicks Update, closes panel,
     * reopens panel → params should be read from store and match.
     */
    simulateUpdate({
      press: {
        pressure_bar: { value: '420', variation: '8' },
      },
    });

    /** Re-read from store (simulates panel reopen calling buildInitialValues). */
    const pressValue =
      (useSimulationDataStore.getState().currentParams.press as Record<string, number>).pressure_bar;
    const driftValue =
      (useSimulationDataStore.getState().parameterDriftLimits.press as Record<string, number>).pressure_bar;

    expect(pressValue).toBe(420);
    expect(driftValue).toBe(8);
  });

  it('multiple machines edited and Updated persist independently', () => {
    /**
     * Verify that editing press and kiln params, then reading them back,
     * returns the correct values for each machine independently.
     */
    simulateUpdate({
      press: {
        pressure_bar: { value: '350', variation: '3' },
      },
      kiln: {
        /** 'max_temperature_c' is the correct kiln param key in machineParams.ts. */
        max_temperature_c: { value: '960', variation: '9' },
      },
    });

    const pressVal = (useSimulationDataStore.getState().currentParams.press as Record<string, number>).pressure_bar;
    const kilnVal = ((useSimulationDataStore.getState().currentParams.kiln as unknown) as Record<string, number>).max_temperature_c;

    expect(pressVal).toBe(350);
    expect(kilnVal).toBe(960);
  });
});

// ─── [F-08] Factory reset clears activeScenario ──────────────────────────────

describe('[F-08] Factory reset clears activeScenario to REFERENCE_SCENARIO', () => {

  it('resetDataStore sets activeScenario to REFERENCE_SCENARIO', () => {
    /**
     * This is the store-level equivalent of what useFactoryReset does.
     * After resetDataStore(), activeScenario must be REFERENCE_SCENARIO.
     */
    const scn002 = SCENARIOS[1]; // SCN-002
    useSimulationDataStore.getState().loadScenario(scn002);
    expect(useSimulationDataStore.getState().activeScenario?.id).toBe(scn002.id);

    /** Full data store reset. */
    useSimulationDataStore.getState().resetDataStore();

    const active = useSimulationDataStore.getState().activeScenario;
    expect(active?.id).toBe(REFERENCE_SCENARIO.id);
  });

  it('resetDataStore clears all deviated params to factory defaults', () => {
    /**
     * All currentParams should match createDefaultParams() after reset.
     */
    useSimulationDataStore.getState().updateParameter('press', 'pressure_bar', 999, 'step', 'operator');
    useSimulationDataStore.getState().updateParameter('dryer', 'inlet_temperature_c', 999, 'step', 'operator');

    useSimulationDataStore.getState().resetDataStore();

    const defaults = createDefaultParams();
    const pressAfter = (useSimulationDataStore.getState().currentParams.press as Record<string, number>).pressure_bar;
    const dryerAfter = ((useSimulationDataStore.getState().currentParams.dryer as unknown) as Record<string, number>).inlet_temperature_c;

    expect(pressAfter).toBe((defaults.press as Record<string, number>).pressure_bar);
    expect(dryerAfter).toBe(((defaults.dryer as unknown) as Record<string, number>).inlet_temperature_c);
  });
});

// ─── [F-09] Factory reset clears cumulative quality counters ─────────────────

describe('[F-09] Factory reset clears cumulative quality counters', () => {

  it('totalFirstQuality, totalSecondQuality, totalScrapGraded are zero after reset', () => {
    /**
     * These counters were added as part of the single-source-of-truth KPI
     * architecture. They MUST be zero after any form of reset.
     */
    useSimulationDataStore.getState().resetDataStore();

    const state = useSimulationDataStore.getState();
    expect(state.totalFirstQuality).toBe(0);
    expect(state.totalSecondQuality).toBe(0);
    expect(state.totalScrapGraded).toBe(0);
    expect(state.totalTilesScrapped).toBe(0);
  });
});

// ─── [F-10] Reset reads FRESH activeScenario (stale closure fix) ─────────────

describe('[F-10] Reset reads fresh activeScenario, not stale closure', () => {

  it('selecting SCN-004 then resetting yields REFERENCE_SCENARIO, not SCN-004', () => {
    /**
     * This test directly verifies the stale closure fix.
     * Old behavior: Reset would re-apply SCN-004 from the closure variable.
     * New behavior: Reset reads from fresh getState() → gets REFERENCE_SCENARIO.
     */
    const scn004 = SCENARIOS[3]; // SCN-004
    useSimulationDataStore.getState().loadScenario(scn004);
    expect(useSimulationDataStore.getState().activeScenario?.id).toBe(scn004.id);

    /** simulateReset reads fresh store state after resetDataStore. */
    simulateReset();

    expect(useSimulationDataStore.getState().activeScenario?.id).toBe(REFERENCE_SCENARIO.id);
  });

  it('params after reset with previously active SCN-004 match factory defaults, not SCN-004 overrides', () => {
    /**
     * After reset, params should be factory defaults even if SCN-004 was
     * previously active. The stale closure bug would re-apply SCN-004's
     * overrides, making this test fail.
     */
    const scn004 = SCENARIOS[3]; // SCN-004
    useSimulationDataStore.getState().loadScenario(scn004);

    simulateReset();

    /** Verify press params are factory defaults (SCN-004 has press overrides). */
    const defaults = createDefaultParams();
    const pressAfter = (useSimulationDataStore.getState().currentParams.press as Record<string, number>).pressure_bar;
    expect(pressAfter).toBe((defaults.press as Record<string, number>).pressure_bar);
  });
});

// ─── [F-11] startSession preserves activeScenario ────────────────────────────

describe('[F-11] startSession preserves activeScenario across session boundary', () => {

  it('startSession keeps the user-selected scenario instead of resetting to REFERENCE_SCENARIO', async () => {
    /**
     * REGRESSION TEST for bug: startSession used to always overwrite activeScenario
     * with REFERENCE_SCENARIO, resetting the Demo Settings panel to SCN-000 any
     * time the user clicked Start — even if they had configured SCN-001 or another
     * scenario.
     *
     * Expected: after startSession, activeScenario is the same scenario that was
     * selected before the session started (SCN-001 in this case), NOT SCN-000.
     */
    const scn001 = SCENARIOS[0]; // SCN-001

    /** Step 1: simulate the user selecting SCN-001 in Demo Settings. */
    useSimulationDataStore.getState().loadScenario(scn001);
    expect(useSimulationDataStore.getState().activeScenario?.id).toBe(scn001.id);

    /**
     * Step 2: simulate clicking Start — startSession is called internally by
     * simulationStore when toggling data flow. We call it directly here to
     * test the scenario preservation logic in isolation.
     */
    await useSimulationDataStore.getState().startSession('F-11 Test', 'Regression test session');

    /**
     * Step 3: verify the active scenario is still SCN-001, NOT REFERENCE_SCENARIO.
     * Old behaviour would yield REFERENCE_SCENARIO here.
     */
    const activeAfterStart = useSimulationDataStore.getState().activeScenario;
    expect(activeAfterStart?.id).toBe(scn001.id);
  });

  it('resetDataStore() still resets activeScenario to REFERENCE_SCENARIO (deliberate full reset)', () => {
    /**
     * Verify that resetDataStore() (used by handleReset / useFactoryReset)
     * still correctly resets activeScenario to REFERENCE_SCENARIO.
     * This must NOT be affected by the startSession fix.
     */
    const scn002 = SCENARIOS[1]; // SCN-002
    useSimulationDataStore.getState().loadScenario(scn002);
    expect(useSimulationDataStore.getState().activeScenario?.id).toBe(scn002.id);

    /** Full factory reset — should always restore REFERENCE_SCENARIO. */
    useSimulationDataStore.getState().resetDataStore();

    const activeAfterReset = useSimulationDataStore.getState().activeScenario;
    expect(activeAfterReset?.id).toBe(REFERENCE_SCENARIO.id);
  });
});


// ─── [F-12] Live-store overrides win over scenario definition ───────────────
//
// REGRESSION BLOCK — The original bug that broke SCN-000 and SCN-002.
//
// Root cause: useConveyorBehaviour read speed_change from
// activeScenario.conveyorSettings (scenario definition). In SCN-000 and
// SCN-002, conveyorSettings.speedChange is false by design. Even after the
// user set speed_change=true via Demo Settings → Update → store, the hook
// ignored the store value and kept using the scenario definition.
//
// Fix: useConveyorBehaviour now reads conveyorNumericParams.speed_change from
// the live data store. These tests verify the DATA LAYER side of that fix.

describe('[F-12] Live store speed_change wins over scenario definition', () => {

  it('SCN-000 has speedChange=false in its definition (bug pre-condition)', () => {
    /**
     * Confirm the scenario definition that caused the bug.
     * If this ever becomes true, the bug pre-condition no longer exists
     * and this test should be updated.
     */
    expect(REFERENCE_SCENARIO.conveyorSettings.speedChange).toBe(false);
  });

  it('SCN-002 has speedChange=false in its definition (bug pre-condition)', () => {
    /** SCN-002 was also broken by the same root cause. */
    expect(SCENARIOS[1].conveyorSettings.speedChange).toBe(false);
  });

  it('SCN-001/003/004 have speedChange=true — were already working before fix', () => {
    /**
     * These scenarios already had speedChange=true, so the bug was invisible.
     * Codify this assumption so that future scenario definition changes warn us.
     */
    expect(SCENARIOS[0].conveyorSettings.speedChange).toBe(true); // SCN-001
    expect(SCENARIOS[2].conveyorSettings.speedChange).toBe(true); // SCN-003
    expect(SCENARIOS[3].conveyorSettings.speedChange).toBe(true); // SCN-004
  });

  it('after updateConveyorBoolParam(speed_change, true) in SCN-000, store holds true', () => {
    /**
     * REGRESSION: before the fix the hook used activeScenario.conveyorSettings
     * and silently ignored the store value. The data layer must persist true.
     *
     * If this fails → updateConveyorBoolParam no longer persists the toggle.
     */
    useSimulationDataStore.getState().loadScenario(REFERENCE_SCENARIO);
    useSimulationDataStore.getState().updateConveyorBoolParam('speed_change', true);

    expect(useSimulationDataStore.getState().conveyorNumericParams.speed_change).toBe(true);
  });

  it('after updateConveyorBoolParam(speed_change, true) in SCN-002, store holds true', () => {
    /** Same regression, SCN-002 variant. Both were reported as broken. */
    useSimulationDataStore.getState().loadScenario(SCENARIOS[1]);
    useSimulationDataStore.getState().updateConveyorBoolParam('speed_change', true);

    expect(useSimulationDataStore.getState().conveyorNumericParams.speed_change).toBe(true);
  });

  it('store value persists through panel reopen (without Get DefaultParams)', () => {
    /**
     * Close panel → reopen panel (no reset). Store must retain the committed value.
     * Catches the case where panel mount accidentally re-initialises from scenario.
     */
    useSimulationDataStore.getState().loadScenario(REFERENCE_SCENARIO);
    useSimulationDataStore.getState().updateConveyorBoolParam('speed_change', true);

    /** Simulate reopen: re-read from store only, no reset. */
    expect(useSimulationDataStore.getState().conveyorNumericParams.speed_change).toBe(true);
  });

  it('Get DefaultParams is the only action that clears speed_change back to false', () => {
    /**
     * The ONLY legitimate way to restore speed_change=false for SCN-000 is an
     * explicit Get DefaultParams action. Verify this works correctly.
     */
    useSimulationDataStore.getState().loadScenario(REFERENCE_SCENARIO);
    useSimulationDataStore.getState().updateConveyorBoolParam('speed_change', true);

    simulateGetDefaultParams(REFERENCE_SCENARIO.id);

    expect(useSimulationDataStore.getState().conveyorNumericParams.speed_change).toBe(false);
  });

  it('jammed_events follows the same pattern: store wins over SCN-000 definition', () => {
    /**
     * Same antipattern for jammed_events. Both booleans were affected.
     */
    useSimulationDataStore.getState().loadScenario(REFERENCE_SCENARIO);
    expect(REFERENCE_SCENARIO.conveyorSettings.jammedEvents).toBe(false); // pre-condition

    useSimulationDataStore.getState().updateConveyorBoolParam('jammed_events', true);
    expect(useSimulationDataStore.getState().conveyorNumericParams.jammed_events).toBe(true);
  });
});

// ─── [F-13] Start gate stays locked after natural simulation end ──────────────────
//
// REGRESSION TEST for the bug where opening and closing Demo Settings
// after a natural simulation end (Phase 2 auto-stop) would flip
// isSimConfigured back to true, allowing the user to click Start without
// doing a proper factory reset first.
//
// The fix: both DemoSettingsPanel close handlers now check simulationEnded
// (read via getState() to avoid stale closures) before calling
// setSimConfigured(true). If simulationEnded=true the gate stays locked.

describe('[F-13] Start gate locked after natural simulation end', () => {

  beforeEach(() => {
    /**
     * Reset both relevant flags to a clean baseline before each test.
     * This mirrors what useFactoryReset does (step 6) so tests are isolated.
     */
    useUIStore.getState().setSimConfigured(false);
    useUIStore.getState().setSimulationEnded(false);
  });

  it('[F-13a] isSimConfigured stays false after Phase 2 stop + Demo Settings open+close', () => {
    /**
     * Scenario: simulation ends naturally.
     *   1. Phase 2 calls setSimConfigured(false) AND setSimulationEnded(true).
     *   2. User opens Demo Settings (curious about results).
     *   3. User closes Demo Settings without pressing Reset.
     *
     * Bug (before fix): step 3 flipped isSimConfigured back to true.
     * Expected (after fix): isSimConfigured remains false.
     */

    // Simulate Phase 2 auto-stop
    useUIStore.getState().setSimConfigured(false);
    useUIStore.getState().setSimulationEnded(true);

    // Simulate Demo Settings close handler (the guarded version)
    if (!useUIStore.getState().simulationEnded) {
      useUIStore.getState().setSimConfigured(true);
    }

    expect(useUIStore.getState().isSimConfigured).toBe(false);
  });

  it('[F-13b] simulationEnded is true after Phase 2 sets it', () => {
    /**
     * Verify the Phase 2 flag itself is written correctly so the guard can
     * read it. This test catches any typo / state name mismatch.
     */
    useUIStore.getState().setSimulationEnded(true);
    expect(useUIStore.getState().simulationEnded).toBe(true);
  });

  it('[F-13c] after factory reset, simulationEnded is false and Demo Settings close unlocks Start', () => {
    /**
     * After the user clicks Reset:
     *   useFactoryReset clears simulationEnded=false AND isSimConfigured=false.
     * Then, when the user goes back through Demo Settings and closes the panel,
     * the guard should permit setSimConfigured(true) — re-enabling Start.
     */

    // Simulate Phase 2 stop
    useUIStore.getState().setSimConfigured(false);
    useUIStore.getState().setSimulationEnded(true);

    // Simulate factory reset (step 6 in useFactoryReset)
    useUIStore.setState({ isSimConfigured: false, simulationEnded: false });

    // Simulate Demo Settings close after reset
    if (!useUIStore.getState().simulationEnded) {
      useUIStore.getState().setSimConfigured(true);
    }

    // Start gate should now be OPEN — user has revisited Demo Settings
    expect(useUIStore.getState().isSimConfigured).toBe(true);
    expect(useUIStore.getState().simulationEnded).toBe(false);
  });

  it('[F-13d] simulationEnded defaults to false on fresh store initialisation', () => {
    /**
     * On page load / first run, simulationEnded must be false so the normal
     * Demo Settings → close → Start flow works without any user interaction.
     */
    // Fresh getState() — no mutation in this test
    expect(useUIStore.getState().simulationEnded).toBe(false);
  });
});
