/**
 * conveyorIntegration.test.ts — Unit Tests for Conveyor 8th Machine Integration
 *
 * Tests validate that:
 *  1. CONVEYOR_DEFAULT_NUMERIC_PARAMS is defined and has correct default values.
 *  2. createDefaultConveyorParams() returns a mutable clone (not the same reference).
 *  3. simulationDataStore initialises conveyorNumericParams and conveyorDriftLimits.
 *  4. updateConveyorParam correctly updates a single param without mutating others.
 *  5. updateConveyorDriftLimit correctly updates a drift limit.
 *  6. resetToFactoryDefaults resets conveyor params back to defaults.
 *
 * Rules:
 *  - Every test is isolated using beforeEach store reset.
 *  - No external network calls (Supabase is mocked).
 *  - All new constants must be tested for existence and correct type.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  CONVEYOR_DEFAULT_NUMERIC_PARAMS,
  createDefaultConveyorParams,
} from '../../lib/params';
import { useSimulationDataStore } from '../../store/simulationDataStore';


// ── Mock Supabase to prevent actual API calls during tests ──────────────────
vi.mock('../../lib/supabaseClient', () => ({
  supabase: null,
}));

// ── Mock usageTracker ───────────────────────────────────────────────────────
vi.mock('../../lib/usageTracker', () => ({
  logConnect: vi.fn().mockResolvedValue(null),
  logDisconnect: vi.fn(),
}));

// =============================================================================
// CONVEYOR DEFAULT NUMERIC PARAMS (machineParams.ts)
// =============================================================================

describe('CONVEYOR_DEFAULT_NUMERIC_PARAMS', () => {
  /**
   * Validates the constant is exported correctly and has numeric values
   * matching the CB_JAMMED_TIME_NORMAL_RANGE and CB_IMPACTED_TILES_NORMAL_RANGE
   * midpoints defined in conveyorBehaviour.ts.
   */

  it('should export CONVEYOR_DEFAULT_NUMERIC_PARAMS with correct shape', () => {
    /** Verify the constant has the two expected keys. */
    expect(CONVEYOR_DEFAULT_NUMERIC_PARAMS).toHaveProperty('jammed_time');
    expect(CONVEYOR_DEFAULT_NUMERIC_PARAMS).toHaveProperty('impacted_tiles');
  });

  it('should have jammed_time = 7 (SCN-000 reference baseline)', () => {
    /** Baseline jam duration aligned with SCN-000 reference scenario. */
    expect(CONVEYOR_DEFAULT_NUMERIC_PARAMS.jammed_time).toBe(7);
  });

  it('should have impacted_tiles = 0 (SCN-000 zero-scrap baseline)', () => {
    /** impacted_tiles defaults to 0 for zero-scrap reference production. */
    expect(CONVEYOR_DEFAULT_NUMERIC_PARAMS.impacted_tiles).toBe(0);
  });
});

// =============================================================================
// createDefaultConveyorParams (machineParams.ts)
// =============================================================================

describe('createDefaultConveyorParams', () => {
  it('should return an object with correct default values', () => {
    /** Each call must return a new object with the correct values. */
    const params = createDefaultConveyorParams();
    expect(params.jammed_time).toBe(7);
    expect(params.impacted_tiles).toBe(0);
  });

  it('should return a mutable clone (not the original const reference)', () => {
    /** Modifying the returned object must NOT affect CONVEYOR_DEFAULT_NUMERIC_PARAMS. */
    const params = createDefaultConveyorParams();
    params.jammed_time = 99;
    expect((CONVEYOR_DEFAULT_NUMERIC_PARAMS as { jammed_time: number }).jammed_time).toBe(7);
  });

  it('should return a different object on each call', () => {
    /** Two calls must return separate object references. */
    const a = createDefaultConveyorParams();
    const b = createDefaultConveyorParams();
    expect(a).not.toBe(b);
  });
});

// =============================================================================
// simulationDataStore — conveyor state
// =============================================================================

describe('simulationDataStore — conveyor integration', () => {
  beforeEach(() => {
    /**
     * Reset the store to defaults before each test to ensure isolation.
     * We call resetDataStore directly (bypassing Supabase calls).
     */
    useSimulationDataStore.getState().resetDataStore();
  });

  it('should initialise conveyorNumericParams with factory defaults', () => {
    /** The store must start with conveyorNumericParams = CONVEYOR_DEFAULT_NUMERIC_PARAMS. */
    const { conveyorNumericParams } = useSimulationDataStore.getState();
    expect(conveyorNumericParams.jammed_time).toBe(7);
    expect(conveyorNumericParams.impacted_tiles).toBe(0);
  });

  it('should initialise conveyorDriftLimits with 0% per param (SCN-000 zero drift)', () => {
    /** Default drift limits should be 0% for each conveyor numeric param (SCN-000 = zero drift). */
    const { conveyorDriftLimits } = useSimulationDataStore.getState();
    expect(conveyorDriftLimits.jammed_time).toBe(0);
    expect(conveyorDriftLimits.impacted_tiles).toBe(0);
  });

  it('updateConveyorParam should update jammed_time without affecting impacted_tiles', () => {
    /** Updating one param must not change the other. */
    useSimulationDataStore.getState().updateConveyorParam('jammed_time', 12);
    const { conveyorNumericParams } = useSimulationDataStore.getState();
    expect(conveyorNumericParams.jammed_time).toBe(12);
    expect(conveyorNumericParams.impacted_tiles).toBe(0); // Unchanged
  });

  it('updateConveyorParam should update impacted_tiles without affecting jammed_time', () => {
    /** Symmetric test for impacted_tiles. */
    useSimulationDataStore.getState().updateConveyorParam('impacted_tiles', 7);
    const { conveyorNumericParams } = useSimulationDataStore.getState();
    expect(conveyorNumericParams.impacted_tiles).toBe(7);
    expect(conveyorNumericParams.jammed_time).toBe(7); // Unchanged
  });

  it('updateConveyorDriftLimit should update drift for jammed_time', () => {
    /** Drift limit for jammed_time must be independently updatable. */
    useSimulationDataStore.getState().updateConveyorDriftLimit('jammed_time', 15);
    const { conveyorDriftLimits } = useSimulationDataStore.getState();
    expect(conveyorDriftLimits.jammed_time).toBe(15);
    expect(conveyorDriftLimits.impacted_tiles).toBe(0); // Unchanged
  });

  it('updateConveyorDriftLimit should update drift for impacted_tiles', () => {
    /** Drift limit for impacted_tiles must be independently updatable. */
    useSimulationDataStore.getState().updateConveyorDriftLimit('impacted_tiles', 20);
    const { conveyorDriftLimits } = useSimulationDataStore.getState();
    expect(conveyorDriftLimits.impacted_tiles).toBe(20);
    expect(conveyorDriftLimits.jammed_time).toBe(0); // Unchanged
  });

  it('resetToFactoryDefaults should restore conveyor params and drift limits', () => {
    /**
     * After customisation, resetToFactoryDefaults must restore to default values.
     * This mirrors the "Get DefaultParams" button behaviour.
     */
    useSimulationDataStore.getState().updateConveyorParam('jammed_time', 99);
    useSimulationDataStore.getState().updateConveyorDriftLimit('impacted_tiles', 50);
    useSimulationDataStore.getState().resetToFactoryDefaults();

    const { conveyorNumericParams, conveyorDriftLimits } =
      useSimulationDataStore.getState();
    expect(conveyorNumericParams.jammed_time).toBe(7);
    expect(conveyorNumericParams.impacted_tiles).toBe(0);
    expect(conveyorDriftLimits.jammed_time).toBe(0);
    expect(conveyorDriftLimits.impacted_tiles).toBe(0);
  });
});

// ─── [C-05] Boolean conveyor param persistence ────────────────────────────────

describe('[C-05] Boolean conveyor params (speed_change / jammed_events) persist in the store', () => {
  beforeEach(() => {
    /**
     * Reset store before each test for isolation.
     */
    useSimulationDataStore.getState().resetDataStore();
  });

  it('factory default for speed_change is false (no speed fluctuations)', () => {
    /**
     * REGRESSION: speed_change was not stored — on panel reopen it silently
     * reverted to the scenario default. The factory default must be false.
     */
    const { conveyorNumericParams } = useSimulationDataStore.getState();
    expect(conveyorNumericParams.speed_change).toBe(false);
  });

  it('factory default for jammed_events is false (no jam events)', () => {
    /**
     * REGRESSION: jammed_events was not stored — on panel reopen it silently
     * reverted to the scenario default. The factory default must be false.
     */
    const { conveyorNumericParams } = useSimulationDataStore.getState();
    expect(conveyorNumericParams.jammed_events).toBe(false);
  });

  it('CONVEYOR_DEFAULT_NUMERIC_PARAMS includes speed_change and jammed_events', () => {
    /**
     * The constant must now expose all four conveyor params so tests and the
     * UI can rely on a single source of truth.
     */
    expect(CONVEYOR_DEFAULT_NUMERIC_PARAMS).toHaveProperty('speed_change');
    expect(CONVEYOR_DEFAULT_NUMERIC_PARAMS).toHaveProperty('jammed_events');
    expect(CONVEYOR_DEFAULT_NUMERIC_PARAMS.speed_change).toBe(false);
    expect(CONVEYOR_DEFAULT_NUMERIC_PARAMS.jammed_events).toBe(false);
  });

  it('updateConveyorBoolParam persists speed_change = true in the store', () => {
    /**
     * After calling updateConveyorBoolParam('speed_change', true), the store
     * must reflect the new value so it can be read back on panel reopen.
     * Before this fix, there was no updateConveyorBoolParam action — the toggle
     * was purely local React state and was lost when the panel unmounted.
     */
    useSimulationDataStore.getState().updateConveyorBoolParam('speed_change', true);
    const { conveyorNumericParams } = useSimulationDataStore.getState();
    expect(conveyorNumericParams.speed_change).toBe(true);
    /** jammed_events must be unaffected. */
    expect(conveyorNumericParams.jammed_events).toBe(false);
  });

  it('updateConveyorBoolParam persists jammed_events = true in the store', () => {
    /**
     * Symmetric test for jammed_events.
     */
    useSimulationDataStore.getState().updateConveyorBoolParam('jammed_events', true);
    const { conveyorNumericParams } = useSimulationDataStore.getState();
    expect(conveyorNumericParams.jammed_events).toBe(true);
    /** speed_change must be unaffected. */
    expect(conveyorNumericParams.speed_change).toBe(false);
  });

  it('boolean and numeric params are updated independently', () => {
    /**
     * Mixing updateConveyorParam (numeric) and updateConveyorBoolParam (boolean)
     * must not cross-contaminate each other.
     */
    useSimulationDataStore.getState().updateConveyorBoolParam('speed_change', true);
    useSimulationDataStore.getState().updateConveyorParam('jammed_time', 12);

    const { conveyorNumericParams } = useSimulationDataStore.getState();
    expect(conveyorNumericParams.speed_change).toBe(true);
    expect(conveyorNumericParams.jammed_time).toBe(12);
    expect(conveyorNumericParams.jammed_events).toBe(false);  // untouched
    expect(conveyorNumericParams.impacted_tiles).toBe(0);      // untouched
  });

  it('resetToFactoryDefaults resets boolean params back to false', () => {
    /**
     * A full factory reset must also reset the boolean toggles, not just
     * the numeric params. This verifies createDefaultConveyorParams() returns
     * all four fields and resetToFactoryDefaults uses it correctly.
     */
    useSimulationDataStore.getState().updateConveyorBoolParam('speed_change', true);
    useSimulationDataStore.getState().updateConveyorBoolParam('jammed_events', true);

    useSimulationDataStore.getState().resetToFactoryDefaults();

    const { conveyorNumericParams } = useSimulationDataStore.getState();
    expect(conveyorNumericParams.speed_change).toBe(false);
    expect(conveyorNumericParams.jammed_events).toBe(false);
  });

  it('resetDataStore resets boolean params back to false', () => {
    /**
     * Full store reset (used by the factory-reset button) must also restore
     * boolean conveyor params. This is the deepest reset path.
     */
    useSimulationDataStore.getState().updateConveyorBoolParam('jammed_events', true);
    useSimulationDataStore.getState().resetDataStore();

    const { conveyorNumericParams } = useSimulationDataStore.getState();
    expect(conveyorNumericParams.jammed_events).toBe(false);
    expect(conveyorNumericParams.speed_change).toBe(false);
  });

  it('boolean drift values (speed_change %, jammed_events %) persist in conveyorDriftLimits', () => {
    /**
     * REGRESSION: drift % values for boolean params were hardcoded to 0 in the
     * getter and the handleUpdate loop did `continue` before writing drift.
     * This test verifies that updateConveyorDriftLimit works for boolean param keys.
     */
    useSimulationDataStore.getState().updateConveyorDriftLimit('speed_change', 12);
    useSimulationDataStore.getState().updateConveyorDriftLimit('jammed_events', 8);

    const { conveyorDriftLimits } = useSimulationDataStore.getState();
    expect(conveyorDriftLimits.speed_change).toBe(12);
    expect(conveyorDriftLimits.jammed_events).toBe(8);
    /** Numeric drifts must be untouched. */
    expect(conveyorDriftLimits.jammed_time).toBe(0);
    expect(conveyorDriftLimits.impacted_tiles).toBe(0);
  });

  it('resetToFactoryDefaults resets ALL 4 conveyor drift limits to 5, including booleans', () => {
    /**
     * After setting custom boolean drift values, a factory reset must also
     * restore the drift limits for boolean params.
     */
    useSimulationDataStore.getState().updateConveyorDriftLimit('speed_change', 20);
    useSimulationDataStore.getState().updateConveyorDriftLimit('jammed_events', 15);
    useSimulationDataStore.getState().updateConveyorBoolParam('speed_change', true);

    useSimulationDataStore.getState().resetToFactoryDefaults();

    const { conveyorNumericParams, conveyorDriftLimits } =
      useSimulationDataStore.getState();
    /** Boolean values reset to false. */
    expect(conveyorNumericParams.speed_change).toBe(false);
    expect(conveyorNumericParams.jammed_events).toBe(false);
    /**
     * REGRESSION: all four drift limits must be restored to 5 after a factory
     * reset. Before the fix, boolean drift limits were NOT reset by this action,
     * meaning user-set drift values would silently survive a factory reset.
     *
     * If any of these fail, a regression was introduced in resetToFactoryDefaults.
     */
    expect(conveyorDriftLimits.jammed_time).toBe(0);     // numeric — zero-drift SCN-000
    expect(conveyorDriftLimits.impacted_tiles).toBe(0);  // numeric — zero-drift SCN-000
    expect(conveyorDriftLimits.speed_change).toBe(0);    // boolean — zero-drift SCN-000
    expect(conveyorDriftLimits.jammed_events).toBe(0);   // boolean — zero-drift SCN-000
  });

  it('initial conveyorDriftLimits has all 4 keys at value 0 (SCN-000 schema guard)', () => {
    /**
     * SCHEMA GUARD: if a new key is added to ConveyorNumericParams but omitted
     * from the initial drift limits, that key would be missing, causing
     * hard-to-find inconsistencies.
     *
     * This test documents the EXACT expected shape of conveyorDriftLimits after
     * a factory reset so any future schema drift is caught immediately.
     * Value 0 = SCN-000 zero-drift baseline.
     */
    useSimulationDataStore.getState().resetToFactoryDefaults();
    const { conveyorDriftLimits } = useSimulationDataStore.getState();

    expect(conveyorDriftLimits).toMatchObject({
      jammed_time: 0,
      impacted_tiles: 0,
      speed_change: 0,
      jammed_events: 0,
    });
  });
});

