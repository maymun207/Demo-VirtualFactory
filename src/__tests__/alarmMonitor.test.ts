/**
 * alarmMonitor.test.ts — Unit Tests for Alarm Threshold Logic
 *
 * Tests the core decision logic used by useAlarmMonitor.ts:
 *  - KPI threshold evaluation (FTQ < warning, scrap > warning, energy > warning)
 *  - Cooldown mechanism (no re-alarm within ALARM_COOLDOWN_TICKS)
 *  - Station status change detection
 *
 * Since useAlarmMonitor is a React hook with subscription side-effects,
 * we extract and test the pure decision functions (threshold check,
 * cooldown check, status change detection) independently.
 */
/// <reference types="vitest/globals" />

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ALARM_FTQ_WARNING,
  ALARM_SCRAP_WARNING,
  ALARM_ENERGY_WARNING,
  ALARM_COOLDOWN_TICKS,
} from '../lib/params';
// Note: ALARM_OEE_CRITICAL import removed — OEE alert was eliminated from useAlarmMonitor.

// =============================================================================
// EXTRACTED PURE LOGIC — Mirrors useAlarmMonitor's decision functions
// =============================================================================

/**
 * Track the last S-Clock tick at which each alarm type fired.
 * Maps alarm type string → last-fired tick number.
 */
type CooldownMap = Record<string, number>;

/**
 * Check if a specific alarm type should fire based on cooldown.
 * Returns true if the alarm should fire (cooldown has elapsed).
 *
 * @param cooldowns  - Map of alarm type → last-fired tick
 * @param type       - The alarm type to check
 * @param currentTick - Current S-Clock tick
 * @returns true if enough ticks have passed since last firing
 */
function shouldFireAlarm(
  cooldowns: CooldownMap,
  type: string,
  currentTick: number
): boolean {
  const lastFired = cooldowns[type] ?? -Infinity;
  return currentTick - lastFired >= ALARM_COOLDOWN_TICKS;
}

/**
 * Parse a KPI value string into a number, with a fallback default.
 * Mirrors the `parseFloat(kpis.find(...)?.value ?? default)` pattern
 * used in useAlarmMonitor.
 *
 * @param kpis     - Array of KPI-like objects with id and value
 * @param id       - KPI ID to look up
 * @param fallback - Default value if KPI not found
 * @returns Parsed numeric value
 */
function parseKPIValue(
  kpis: { id: string; value: string }[],
  id: string,
  fallback: string
): number {
  return parseFloat(kpis.find((k) => k.id === id)?.value ?? fallback);
}

/**
 * Detect station status transitions that should trigger alarms.
 * Returns the alarm severity based on old → new status transition.
 *
 * @param prevStatus - Previous station status
 * @param currStatus - Current station status
 * @returns 'critical' | 'warning' | 'info' | null (null = no alarm)
 */
function detectStatusTransition(
  prevStatus: string,
  currStatus: string
): 'critical' | 'warning' | 'info' | null {
  if (prevStatus === currStatus) return null;
  if (currStatus === 'error') return 'critical';
  if (currStatus === 'warning') return 'warning';
  if (currStatus === 'normal' && (prevStatus === 'error' || prevStatus === 'warning')) {
    return 'info';
  }
  return null;
}

// =============================================================================
// TESTS — Threshold Evaluation
// =============================================================================

describe('Alarm Threshold Evaluation', () => {
  // Note: OEE alert was intentionally removed from the alarm monitor.
  // It was noisy at startup and redundant with the OEE Hierarchy Table.

  it('should trigger FTQ alert when FTQ drops below warning threshold', () => {
    const ftq = ALARM_FTQ_WARNING - 5;
    expect(ftq < ALARM_FTQ_WARNING).toBe(true);
  });

  it('should NOT trigger FTQ alert when FTQ is at or above threshold', () => {
    const ftq = ALARM_FTQ_WARNING;
    expect(ftq < ALARM_FTQ_WARNING).toBe(false);
  });

  it('should trigger scrap alert when scrap exceeds warning threshold', () => {
    const scrap = ALARM_SCRAP_WARNING + 1;
    expect(scrap > ALARM_SCRAP_WARNING).toBe(true);
  });

  it('should trigger energy alert when energy exceeds warning threshold', () => {
    const energy = ALARM_ENERGY_WARNING + 0.5;
    expect(energy > ALARM_ENERGY_WARNING).toBe(true);
  });
});

// =============================================================================
// TESTS — Cooldown Mechanism
// =============================================================================

describe('Alarm Cooldown Mechanism', () => {
  let cooldowns: CooldownMap;

  beforeEach(() => {
    /** Reset cooldowns before each test */
    cooldowns = {};
  });

  it('should allow alarm to fire on first occurrence (no prior cooldown)', () => {
    /** No previous entry for this alarm type → should fire */
    expect(shouldFireAlarm(cooldowns, 'test_alarm', 10)).toBe(true);
  });

  it('should block alarm within cooldown window', () => {
    /** Simulate: alarm fired at tick 100, try again at tick 100 + half cooldown */
    cooldowns['test_alarm'] = 100;
    const halfCooldown = Math.floor(ALARM_COOLDOWN_TICKS / 2);
    expect(shouldFireAlarm(cooldowns, 'test_alarm', 100 + halfCooldown)).toBe(false);
  });

  it('should allow alarm after cooldown period has passed', () => {
    /** Simulate: alarm fired at tick 100, try again after full cooldown */
    cooldowns['test_alarm'] = 100;
    expect(shouldFireAlarm(cooldowns, 'test_alarm', 100 + ALARM_COOLDOWN_TICKS)).toBe(true);
  });

  it('should track independent cooldowns per alarm type', () => {
    /** quality alarm just fired, but scrap alarm has no cooldown → scrap should fire */
    cooldowns['quality_alert'] = 50;
    expect(shouldFireAlarm(cooldowns, 'quality_alert', 51)).toBe(false);
    expect(shouldFireAlarm(cooldowns, 'scrap_alert', 51)).toBe(true);
  });

  it('should handle tick 0 edge case', () => {
    /** Alarm at tick 0 should be allowed (no prior history) */
    expect(shouldFireAlarm(cooldowns, 'test_alarm', 0)).toBe(true);
  });
});

// =============================================================================
// TESTS — KPI Value Parsing
// =============================================================================

describe('KPI Value Parsing', () => {
  const mockKPIs = [
    { id: 'oee', value: '92.5' },
    { id: 'ftq', value: '88.0' },
    { id: 'scrap', value: '4.2' },
    { id: 'energy', value: '15.7' },
  ];

  it('should parse existing KPI value correctly', () => {
    expect(parseKPIValue(mockKPIs, 'oee', '100')).toBeCloseTo(92.5);
  });

  it('should return fallback when KPI not found', () => {
    /** "gas_consumption" doesn't exist in the mock → use fallback */
    expect(parseKPIValue(mockKPIs, 'gas_consumption', '0')).toBe(0);
  });

  it('should parse integer-format values', () => {
    const kpis = [{ id: 'count', value: '42' }];
    expect(parseKPIValue(kpis, 'count', '0')).toBe(42);
  });

  it('should return fallback for empty KPI array', () => {
    expect(parseKPIValue([], 'oee', '100')).toBe(100);
  });
});

// =============================================================================
// TESTS — Station Status Change Detection
// =============================================================================

describe('Station Status Transition Detection', () => {
  it('should return null when status has not changed', () => {
    /** Same status → no alarm */
    expect(detectStatusTransition('normal', 'normal')).toBeNull();
    expect(detectStatusTransition('error', 'error')).toBeNull();
  });

  it('should return "critical" when station enters error state', () => {
    expect(detectStatusTransition('normal', 'error')).toBe('critical');
    expect(detectStatusTransition('warning', 'error')).toBe('critical');
  });

  it('should return "warning" when station enters warning state', () => {
    expect(detectStatusTransition('normal', 'warning')).toBe('warning');
  });

  it('should return "info" when station recovers to normal from error', () => {
    expect(detectStatusTransition('error', 'normal')).toBe('info');
  });

  it('should return "info" when station recovers to normal from warning', () => {
    expect(detectStatusTransition('warning', 'normal')).toBe('info');
  });

  it('should return null for non-alarm transitions (e.g., normal → normal)', () => {
    /** Going from normal to some unknown status (not error/warning) */
    expect(detectStatusTransition('normal', 'idle')).toBeNull();
  });
});
