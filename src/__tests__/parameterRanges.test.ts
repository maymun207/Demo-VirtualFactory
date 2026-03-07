/**
 * parameterRanges.test.ts — Unit Tests for Normal Operating Ranges
 *
 * Validates the PARAMETER_RANGES constant and getRangesForStation helper
 * from parameterRanges.ts. Ensures:
 *   - Every station has ranges for all its parameters
 *   - All ranges have min < max
 *   - Default values from machineParams.ts fall within ranges
 *   - getRangesForStation merges scenario overrides correctly
 */

import { describe, it, expect } from 'vitest';
import { PARAMETER_RANGES, getRangesForStation } from '../lib/params/parameterRanges';
import { DEFAULT_MACHINE_PARAMS } from '../lib/params/machineParams';
import { STATION_ORDER } from '../store/types';

// =============================================================================
// TESTS
// =============================================================================

describe('PARAMETER_RANGES', () => {

  it('should have entries for all 7 stations', () => {
    for (const station of STATION_ORDER) {
      expect(PARAMETER_RANGES[station]).toBeDefined();
      expect(Object.keys(PARAMETER_RANGES[station]).length).toBeGreaterThan(0);
    }
  });

  it('should have min < max for every parameter range', () => {
    for (const station of STATION_ORDER) {
      const stationRanges = PARAMETER_RANGES[station];
      for (const [paramKey, range] of Object.entries(stationRanges)) {
        expect(
          range.min,
          `${station}.${paramKey}: min (${range.min}) should be < max (${range.max})`,
        ).toBeLessThan(range.max);
      }
    }
  });

  it('should contain ranges for every parameter in DEFAULT_MACHINE_PARAMS', () => {
    for (const station of STATION_ORDER) {
      const defaultParams = DEFAULT_MACHINE_PARAMS[station];
      const stationRanges = PARAMETER_RANGES[station];
      for (const paramKey of Object.keys(defaultParams)) {
        /** Skip fixed params that don't have ranges (color_channels, zone_count, grade_count). */
        const fixedParams = ['color_channels', 'zone_count', 'grade_count'];
        if (fixedParams.includes(paramKey)) continue;

        expect(
          stationRanges[paramKey],
          `Missing range for ${station}.${paramKey}`,
        ).toBeDefined();
      }
    }
  });

  it('should have default values falling within their defined ranges', () => {
    for (const station of STATION_ORDER) {
      const defaultParams = DEFAULT_MACHINE_PARAMS[station];
      const stationRanges = PARAMETER_RANGES[station];
      for (const [paramKey, value] of Object.entries(defaultParams)) {
        const range = stationRanges[paramKey];
        if (!range) continue; // Skip fixed params without ranges

        expect(
          value,
          `${station}.${paramKey} default (${value}) should be >= min (${range.min})`,
        ).toBeGreaterThanOrEqual(range.min);
        expect(
          value,
          `${station}.${paramKey} default (${value}) should be <= max (${range.max})`,
        ).toBeLessThanOrEqual(range.max);
      }
    }
  });
});

describe('getRangesForStation', () => {

  it('should return base ranges when no scenario overrides are provided', () => {
    const ranges = getRangesForStation('press');
    expect(ranges).toEqual(PARAMETER_RANGES['press']);
  });

  it('should merge scenario overrides into base ranges', () => {
    /** Override press pressure_bar with a tighter range. */
    const overrides = [
      { station: 'press', parameter: 'pressure_bar', normalRange: { min: 300, max: 400 } },
    ];

    const ranges = getRangesForStation('press', overrides);

    /** pressure_bar should use scenario override. */
    expect(ranges.pressure_bar).toEqual({ min: 300, max: 400 });
    /** Other params should use base ranges. */
    expect(ranges.cycle_time_sec).toEqual(PARAMETER_RANGES['press'].cycle_time_sec);
  });

  it('should ignore overrides for other stations', () => {
    /** Override for kiln, but querying press. */
    const overrides = [
      { station: 'kiln', parameter: 'max_temperature_c', normalRange: { min: 1000, max: 1300 } },
    ];

    const ranges = getRangesForStation('press', overrides);
    /** Should be unchanged — kiln override doesn't affect press. */
    expect(ranges).toEqual(PARAMETER_RANGES['press']);
  });

  it('should handle empty overrides array', () => {
    const ranges = getRangesForStation('kiln', []);
    expect(ranges).toEqual(PARAMETER_RANGES['kiln']);
  });
});
