/**
 * bufferLimits.test.ts — Unit Tests for Ring-Buffer Cap Constants
 *
 * Verifies that all buffer limit constants are exported from params
 * and have sensible values (positive integers).
 *
 * Used by: CI/CD pipeline
 */

import { describe, it, expect } from 'vitest';
import {
  MAX_ALARM_LOGS,
  MAX_METRICS_HISTORY,
  MAX_SCENARIO_HISTORY,
  MAX_PARAMETER_CHANGES,
  MAX_COMPLETED_TILES,
} from '../lib/params';

describe('bufferLimits params', () => {
  /** All cap constants must be positive integers. */
  it('should export positive integer cap values', () => {
    const caps = [
      MAX_ALARM_LOGS,
      MAX_METRICS_HISTORY,
      MAX_SCENARIO_HISTORY,
      MAX_PARAMETER_CHANGES,
      MAX_COMPLETED_TILES,
    ];

    for (const cap of caps) {
      /** Each cap must be a positive integer. */
      expect(cap).toBeGreaterThan(0);
      expect(Number.isInteger(cap)).toBe(true);
    }
  });

  /** Alarm log cap should be >= 100 to cover a reasonable session. */
  it('MAX_ALARM_LOGS should be at least 100', () => {
    expect(MAX_ALARM_LOGS).toBeGreaterThanOrEqual(100);
  });

  /** Metrics history should be >= 50 for reasonable period tracking. */
  it('MAX_METRICS_HISTORY should be at least 50', () => {
    expect(MAX_METRICS_HISTORY).toBeGreaterThanOrEqual(50);
  });

  /** Parameter changes cap should be largest since drift events are frequent. */
  it('MAX_PARAMETER_CHANGES should be the largest cap', () => {
    expect(MAX_PARAMETER_CHANGES).toBeGreaterThan(MAX_ALARM_LOGS);
    expect(MAX_PARAMETER_CHANGES).toBeGreaterThan(MAX_METRICS_HISTORY);
    expect(MAX_PARAMETER_CHANGES).toBeGreaterThan(MAX_SCENARIO_HISTORY);
  });

  /** Completed tiles cap should be >= 100 to keep enough history for the UI. */
  it('MAX_COMPLETED_TILES should be at least 100', () => {
    expect(MAX_COMPLETED_TILES).toBeGreaterThanOrEqual(100);
  });
});
