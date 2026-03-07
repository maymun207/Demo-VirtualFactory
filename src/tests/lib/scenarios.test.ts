/**
 * scenarios.test.ts — Unit Tests for Scenario Definitions & Helpers
 *
 * Tests the scenario data integrity and helper functions:
 *  - SCENARIOS array: all 4 scenarios have required fields
 *  - REFERENCE_SCENARIO: special reference scenario validation
 *  - getScenarioByCode: lookup by short code
 *  - getScenarioById: lookup by unique ID
 *  - Data integrity: parameter overrides reference valid stations
 *
 * These tests ensure scenario data consistency, which is critical for
 * the DemoSettingsPanel and the entire cause-effect simulation system.
 */
/// <reference types="vitest/globals" />

import { describe, it, expect } from 'vitest';
import {
  SCENARIOS,
  REFERENCE_SCENARIO,
  getScenarioByCode,
  getScenarioById,
  type ConveyorSettingsEntry,
} from '../../lib/scenarios';
import { STATION_ORDER } from '../../store/types';

// =============================================================================
// SCENARIOS array structural integrity
// =============================================================================

describe('SCENARIOS array', () => {
  it('should contain exactly 4 scenarios', () => {
    /** The project defines 4 predefined scenarios (SCN-001 through SCN-004) */
    expect(SCENARIOS).toHaveLength(4);
  });

  it('each scenario should have a unique id', () => {
    /** Extract all IDs and verify no duplicates */
    const ids = SCENARIOS.map(s => s.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('each scenario should have a unique code', () => {
    /** Extract all codes and verify no duplicates */
    const codes = SCENARIOS.map(s => s.code);
    const uniqueCodes = new Set(codes);
    expect(uniqueCodes.size).toBe(codes.length);
  });

  it('each scenario should have required fields', () => {
    /** Every scenario must have these fields populated */
    for (const scenario of SCENARIOS) {
      expect(scenario.id).toBeTruthy();
      expect(scenario.code).toBeTruthy();
      expect(scenario.name).toBeTruthy();
      expect(scenario.name.tr).toBeTruthy();
      expect(scenario.name.en).toBeTruthy();
      expect(scenario.description).toBeTruthy();
      expect(scenario.description.tr).toBeTruthy();
      expect(scenario.description.en).toBeTruthy();
      expect(scenario.severity).toBeTruthy();
      expect(scenario.parameterOverrides).toBeDefined();
      expect(Array.isArray(scenario.parameterOverrides)).toBe(true);
    }
  });

  it('each scenario code should follow SCN-XXX format', () => {
    /** All codes should match the pattern SCN-001, SCN-002, etc. */
    for (const scenario of SCENARIOS) {
      expect(scenario.code).toMatch(/^SCN-\d{3}$/);
    }
  });

  it('parameter overrides should reference valid station names', () => {
    /** Every parameter override must target a known station from STATION_ORDER */
    for (const scenario of SCENARIOS) {
      for (const override of scenario.parameterOverrides) {
        expect(STATION_ORDER).toContain(override.station);
      }
    }
  });
});

// =============================================================================
// REFERENCE_SCENARIO
// =============================================================================

describe('REFERENCE_SCENARIO', () => {
  it('should have code SCN-000', () => {
    /** The reference scenario uses a special code */
    expect(REFERENCE_SCENARIO.code).toBe('SCN-000');
  });

  it('should have severity "low"', () => {
    /** Reference scenario represents ideal conditions — low severity */
    expect(REFERENCE_SCENARIO.severity).toBe('low');
  });

  it('should have bilingual name and description', () => {
    /** Both Turkish and English localization required */
    expect(REFERENCE_SCENARIO.name.tr).toBeTruthy();
    expect(REFERENCE_SCENARIO.name.en).toBeTruthy();
    expect(REFERENCE_SCENARIO.description.tr).toBeTruthy();
    expect(REFERENCE_SCENARIO.description.en).toBeTruthy();
  });
});

// =============================================================================
// getScenarioByCode
// =============================================================================

describe('getScenarioByCode', () => {
  it('should find SCN-001 (first scenario)', () => {
    /** Lookup the first scenario by its code */
    const result = getScenarioByCode('SCN-001');
    expect(result).toBeDefined();
    expect(result!.code).toBe('SCN-001');
  });

  it('should find SCN-004 (last scenario)', () => {
    /** Lookup the last scenario by its code */
    const result = getScenarioByCode('SCN-004');
    expect(result).toBeDefined();
    expect(result!.code).toBe('SCN-004');
  });

  it('should return undefined for non-existent code', () => {
    /** Looking up a code that doesn't exist should return undefined */
    const result = getScenarioByCode('SCN-999');
    expect(result).toBeUndefined();
  });

  it('should be case-sensitive', () => {
    /** Lowercase code should not match */
    const result = getScenarioByCode('scn-001');
    expect(result).toBeUndefined();
  });
});

// =============================================================================
// getScenarioById
// =============================================================================

describe('getScenarioById', () => {
  it('should find all 4 scenarios by their IDs', () => {
    /** Verify every scenario in the array can be found by ID */
    for (const scenario of SCENARIOS) {
      const result = getScenarioById(scenario.id);
      expect(result).toBeDefined();
      expect(result!.id).toBe(scenario.id);
    }
  });

  it('should return undefined for non-existent ID', () => {
    /** Looking up an ID that doesn't exist should return undefined */
    const result = getScenarioById('nonexistent-scenario-id');
    expect(result).toBeUndefined();
  });
});

// =============================================================================
// Data integrity — parameter override consistency
// =============================================================================

describe('Scenario parameter override consistency', () => {
  it('each override should have value, driftLimit, and normalRange', () => {
    /**
     * Every parameter override needs these fields for the simulation
     * to correctly apply and manage the override.
     */
    for (const scenario of SCENARIOS) {
      for (const override of scenario.parameterOverrides) {
        expect(typeof override.value).toBe('number');
        expect(typeof override.driftLimit).toBe('number');
        expect(typeof override.isOutOfRange).toBe('boolean');
        expect(override.normalRange).toBeDefined();
        expect(typeof override.normalRange.min).toBe('number');
        expect(typeof override.normalRange.max).toBe('number');
        /** min should be less than max for valid ranges */
        expect(override.normalRange.min).toBeLessThan(override.normalRange.max);
      }
    }
  });
});

// =============================================================================
// ConveyorSettingsEntry — per-scenario conveyor settings
// =============================================================================

describe('Scenario conveyorSettings', () => {
  /** All scenarios including the reference must have conveyorSettings defined */
  const allScenarios = [REFERENCE_SCENARIO, ...SCENARIOS];

  it('every scenario (including REFERENCE_SCENARIO) must have conveyorSettings', () => {
    /** Ensures the new field was added to all 5 scenario objects */
    for (const scenario of allScenarios) {
      expect(scenario.conveyorSettings).toBeDefined();
    }
  });

  it('conveyorSettings must have all required fields', () => {
    /** Every ConveyorSettingsEntry must have exactly these 8 fields */
    const requiredKeys: (keyof ConveyorSettingsEntry)[] = [
      'speedChange',
      'speedChangeDrift',
      'jammedEvents',
      'jammedEventsDrift',
      'jammedTime',
      'jammedTimeDrift',
      'impactedTiles',
      'impactedTilesDrift',
    ];
    for (const scenario of allScenarios) {
      /** Verify each required key exists on the conveyorSettings object */
      for (const key of requiredKeys) {
        expect(scenario.conveyorSettings).toHaveProperty(key);
      }
    }
  });

  it('speedChange and jammedEvents must be booleans', () => {
    /** These two fields are toggled as Yes/No in the Conveyor Settings tab */
    for (const scenario of allScenarios) {
      expect(typeof scenario.conveyorSettings.speedChange).toBe('boolean');
      expect(typeof scenario.conveyorSettings.jammedEvents).toBe('boolean');
    }
  });

  it('jammedTime and impactedTiles must be positive numbers', () => {
    /** These must be valid, non-negative numeric values */
    for (const scenario of allScenarios) {
      expect(scenario.conveyorSettings.jammedTime).toBeGreaterThanOrEqual(0);
      expect(scenario.conveyorSettings.impactedTiles).toBeGreaterThanOrEqual(0);
    }
  });

  it('all drift values must be between 0 and 100', () => {
    /** Drift percentages must be valid % values */
    for (const scenario of allScenarios) {
      const cs = scenario.conveyorSettings;
      /** Check each of the 4 drift fields */
      expect(cs.speedChangeDrift).toBeGreaterThanOrEqual(0);
      expect(cs.speedChangeDrift).toBeLessThanOrEqual(100);
      expect(cs.jammedEventsDrift).toBeGreaterThanOrEqual(0);
      expect(cs.jammedEventsDrift).toBeLessThanOrEqual(100);
      expect(cs.jammedTimeDrift).toBeGreaterThanOrEqual(0);
      expect(cs.jammedTimeDrift).toBeLessThanOrEqual(100);
      expect(cs.impactedTilesDrift).toBeGreaterThanOrEqual(0);
      expect(cs.impactedTilesDrift).toBeLessThanOrEqual(100);
    }
  });

  it('REFERENCE_SCENARIO (SCN-000) must have speedChange=false and jammedEvents=false', () => {
    /** The baseline reference has no speed changes or jam events */
    expect(REFERENCE_SCENARIO.conveyorSettings.speedChange).toBe(false);
    expect(REFERENCE_SCENARIO.conveyorSettings.jammedEvents).toBe(false);
  });

  it('SCN-001/003/004 must have speedChange=true; SCN-002 must have speedChange=false', () => {
    /**
     * Speed change flags per scenario:
     *  SCN-001 (optimal)  — speed changes start appearing
     *  SCN-002 (kiln)     — conveyor speed is stable (kiln crisis only)
     *  SCN-003 (glaze)    — speed fluctuation from glaze affecting belt
     *  SCN-004 (cascade)  — cascading speed changes across all stations
     */
    const expected: Record<string, boolean> = {
      'SCN-001': true,
      'SCN-002': false,
      'SCN-003': true,
      'SCN-004': true,
    };
    for (const scenario of SCENARIOS) {
      expect(scenario.conveyorSettings.speedChange).toBe(expected[scenario.code]);
    }
  });

  it('SCN-003/004 must have jammedEvents=true; SCN-001/002 must have jammedEvents=false', () => {
    /**
     * Jam event flags escalate with severity:
     *  SCN-001 (low)      — no jams (only speed fluctuation)
     *  SCN-002 (critical) — no jams (kiln crisis, not conveyor failure)
     *  SCN-003 (high)     — jams from belt sagging under glaze load
     *  SCN-004 (critical) — multi-station cascade causes multiple jams
     */
    const expected: Record<string, boolean> = {
      'SCN-001': false,
      'SCN-002': false,
      'SCN-003': true,
      'SCN-004': true,
    };
    for (const scenario of SCENARIOS) {
      expect(scenario.conveyorSettings.jammedEvents).toBe(expected[scenario.code]);
    }
  });

  it('SCN-002 has higher jammedTime than SCN-001', () => {
    /** Kiln crisis (SCN-002) should produce longer jams than optimal (SCN-001) */
    const scn001 = SCENARIOS.find(s => s.code === 'SCN-001')!;
    const scn002 = SCENARIOS.find(s => s.code === 'SCN-002')!;
    expect(scn002.conveyorSettings.jammedTime).toBeGreaterThan(
      scn001.conveyorSettings.jammedTime,
    );
  });

  it('SCN-003 has the highest impactedTiles in the suite', () => {
    /** Glaze drift (SCN-003) produces the most scrap tiles (30) */
    const maxImpacted = Math.max(
      ...SCENARIOS.map(s => s.conveyorSettings.impactedTiles),
    );
    const scn003 = SCENARIOS.find(s => s.code === 'SCN-003')!;
    expect(scn003.conveyorSettings.impactedTiles).toBe(maxImpacted);
  });
});
