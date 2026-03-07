/**
 * params.test.ts — Unit Tests for Default Parameters
 *
 * Validates:
 *  - `DEFAULT_MACHINE_PARAMS` contains all stations
 *  - `createDefaultParams()` returns a deep clone (mutation-safe)
 *  - `DEFAULT_DRIFT_LIMIT_PCT` is a positive number
 *  - `LOG_LEVEL` is a valid log level string
 */

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_MACHINE_PARAMS,
  createDefaultParams,
  DEFAULT_DRIFT_LIMIT_PCT,
  LOG_LEVEL,
  CAMERA_POSITION,
  CAMERA_FOV,
  ORBIT_TARGET,
} from '../lib/params';
import { STATION_ORDER } from '../store/types';

describe('DEFAULT_MACHINE_PARAMS', () => {
  it('contains an entry for every station in STATION_ORDER', () => {
    /** Every station should have a corresponding key in DEFAULT_MACHINE_PARAMS */
    for (const station of STATION_ORDER) {
      expect(DEFAULT_MACHINE_PARAMS).toHaveProperty(station);
    }
  });

  it('all station parameter values are numbers', () => {
    /** Each station's parameters should be numeric key-value pairs */
    for (const station of STATION_ORDER) {
      const params = DEFAULT_MACHINE_PARAMS[station as keyof typeof DEFAULT_MACHINE_PARAMS];
      for (const [_key, value] of Object.entries(params)) {
        expect(typeof value).toBe('number');
      }
    }
  });
});

describe('createDefaultParams()', () => {
  it('returns an object with the same structure as DEFAULT_MACHINE_PARAMS', () => {
    const result = createDefaultParams();
    /** Keys should match */
    expect(Object.keys(result).sort()).toEqual(Object.keys(DEFAULT_MACHINE_PARAMS).sort());
  });

  it('returns a deep clone (mutations do not affect the original)', () => {
    const clone = createDefaultParams();
    const originalPressure = DEFAULT_MACHINE_PARAMS.press.pressure_bar;

    /** Mutate the clone */
    (clone as Record<string, Record<string, number>>).press.pressure_bar = 9999;

    /** Original should be unchanged */
    expect(DEFAULT_MACHINE_PARAMS.press.pressure_bar).toBe(originalPressure);
  });

  it('each call returns an independent instance', () => {
    const a = createDefaultParams();
    const b = createDefaultParams();

    /** Mutating one should not affect the other */
    (a as Record<string, Record<string, number>>).press.pressure_bar = 1;
    expect((b as Record<string, Record<string, number>>).press.pressure_bar).not.toBe(1);
  });
});

describe('DEFAULT_DRIFT_LIMIT_PCT', () => {
  it('is a non-negative number (0 = zero drift for SCN-000)', () => {
    expect(typeof DEFAULT_DRIFT_LIMIT_PCT).toBe('number');
    expect(DEFAULT_DRIFT_LIMIT_PCT).toBeGreaterThanOrEqual(0);
  });
});

describe('LOG_LEVEL', () => {
  it('is a valid log level string', () => {
    const validLevels = ['debug', 'info', 'warn', 'error', 'none'];
    expect(validLevels).toContain(LOG_LEVEL);
  });
});

describe('CAMERA_POSITION', () => {
  it('is a 3-element number tuple', () => {
    /** Camera position must be a valid [x, y, z] coordinate */
    expect(CAMERA_POSITION).toHaveLength(3);
    CAMERA_POSITION.forEach((v) => expect(typeof v).toBe('number'));
  });
});

describe('CAMERA_FOV', () => {
  it('is a positive number within a reasonable range', () => {
    /** FOV should be between 10 and 120 degrees for a usable perspective */
    expect(typeof CAMERA_FOV).toBe('number');
    expect(CAMERA_FOV).toBeGreaterThan(10);
    expect(CAMERA_FOV).toBeLessThan(120);
  });
});

describe('ORBIT_TARGET', () => {
  it('is a 3-element number tuple', () => {
    /** Orbit target must be a valid [x, y, z] coordinate */
    expect(ORBIT_TARGET).toHaveLength(3);
    ORBIT_TARGET.forEach((v) => expect(typeof v).toBe('number'));
  });
});
