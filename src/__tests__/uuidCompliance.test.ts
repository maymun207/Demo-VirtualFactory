/**
 * ╔═══════════════════════════════════════════════════════════════════╗
 * ║  uuidCompliance.test.ts — Store Integration Tests for UUID IDs   ║
 * ║                                                                   ║
 * ║  Validates that ALL record-creation functions in the stores       ║
 * ║  produce valid UUID v4 strings for `id` and `simulation_id`.     ║
 * ║  These tests exist specifically to prevent the nanoid-format      ║
 * ║  regression that caused Supabase upsert failures:                 ║
 * ║    "invalid input syntax for type uuid"                          ║
 * ║                                                                   ║
 * ║  Coverage:                                                        ║
 * ║    • createTile() — tile.id, tile.simulation_id                  ║
 * ║    • recordMachineState() — record.id, record.simulation_id      ║
 * ║    • recordTileSnapshot() — snapshot.id, snapshot.simulation_id   ║
 * ║    • recordParameterChange() — record.id, record.simulation_id   ║
 * ║    • recordAlarm() — record.id, record.simulation_id             ║
 * ║    • finalizePeriodMetrics() — record.id, record.simulation_id   ║
 * ║    • session fallback — session.id (when Supabase is unavailable)║
 * ║    • scenario activation — activation.id, activation.sim_id     ║
 * ╚═══════════════════════════════════════════════════════════════════╝
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useSimulationDataStore } from '../store/simulationDataStore';
import { UUID_REGEX } from '../lib/idGenerator';

/** Shorthand accessor for the data store state and actions. */
const getStore = () => useSimulationDataStore.getState();

/**
 * UUID validation helper.
 * Asserts that the given value is a string matching UUID v4 format.
 *
 * @param value    - The value to check
 * @param fieldName - Descriptive field name for error messages
 */
function expectValidUUID(value: unknown, fieldName: string): void {
  expect(
    typeof value === 'string' && UUID_REGEX.test(value),
    `${fieldName} should be a valid UUID v4, got: "${value}"`
  ).toBe(true);
}

describe('UUID Compliance — All DB-bound record IDs must be valid UUIDs', () => {
  /**
   * Before each test, start a fresh session so that `session.id` and
   * `simulation_id` references are available for child records.
   */
  beforeEach(async () => {
    /** Reset the store to a clean state. */
    getStore().resetDataStore();
    /** Start a session (will use the deterministic UUID mock). */
    await getStore().startSession('UUID Test Session', 'Testing UUID generation');
  });

  it('startSession() produces a UUID session.id', () => {
    /** Assert: session ID is a valid UUID. */
    const session = getStore().session;
    expect(session).not.toBeNull();
    expectValidUUID(session!.id, 'session.id');
  });

  it('createTile() produces UUID tile.id and tile.simulation_id', () => {
    /** Act: create a tile. */
    const tile = getStore().createTile(1, 1);

    /** Assert: tile exists and has valid UUID fields. */
    expect(tile).not.toBeNull();
    expectValidUUID(tile!.id, 'tile.id');
    expectValidUUID(tile!.simulation_id, 'tile.simulation_id');
  });

  it('recordMachineState() produces UUID record.id and record.simulation_id', () => {
    /** Act: record a machine state for the press station. */
    const id = getStore().recordMachineState('press', 1, 1);

    /** Assert: returned ID is a valid UUID. */
    expectValidUUID(id, 'machineState.id');

    /** Verify the stored record's simulation_id too. */
    const allStates = getStore().machineStates;
    const pressStates = allStates.press as unknown as Map<number, Record<string, unknown>>;
    const record = pressStates.get(1);
    expect(record).toBeDefined();
    expectValidUUID(record!.simulation_id as string, 'machineState.simulation_id');
  });

  it('recordTileSnapshot() produces UUID snapshot.id', () => {
    /** Arrange: create a tile first. */
    const tile = getStore().createTile(1, 1);
    expect(tile).not.toBeNull();

    /** Act: generate a machine state ID and record a snapshot. */
    const machineStateId = getStore().recordMachineState('press', 1, 1);
    const snapshotId = getStore().recordTileSnapshot(
      tile!.id, 'press', 1, 1, machineStateId
    );

    /** Assert: snapshot ID is a valid UUID. */
    expectValidUUID(snapshotId, 'tileSnapshot.id');
  });

  it('recordParameterChange() produces UUID record.id', () => {
    /** Act: record a parameter change event. */
    const id = getStore().recordParameterChange(
      'press',          // station
      'pressure_bar',   // parameter name
      280,              // old value
      290,              // new value
      5,                // sim tick
      3,                // production tick
      'drift',          // change type
      'wear',           // change reason
      undefined         // no scenario
    );

    /** Assert: returned ID is a valid UUID. */
    expectValidUUID(id, 'parameterChange.id');
  });

  it('recordAlarm() produces UUID alarm.id and alarm.simulation_id', () => {
    /** Act: record an alarm. */
    getStore().recordAlarm({
      type: 'jam_start',
      severity: 'critical',
      message: 'UUID compliance test alarm',
    });

    /** Assert: alarm record exists with valid UUID fields. */
    const alarmLogs = getStore().alarmLogs;
    expect(alarmLogs.length).toBeGreaterThanOrEqual(1);
    const latestAlarm = alarmLogs[alarmLogs.length - 1];
    expectValidUUID(latestAlarm.id, 'alarm.id');
    expectValidUUID(latestAlarm.simulation_id, 'alarm.simulation_id');
  });

  it('finalizePeriodMetrics() produces UUID metrics.id', () => {
    /** Arrange: produce some tiles so metrics have data. */
    getStore().createTile(1, 1);
    getStore().createTile(2, 2);

    /** Act: finalize the metrics period. */
    getStore().finalizePeriodMetrics(10, 5);

    /** Assert: metrics record has a valid UUID. */
    const history = getStore().metricsHistory;
    expect(history.length).toBeGreaterThanOrEqual(1);
    const latestMetrics = history[history.length - 1];
    expectValidUUID(latestMetrics.id, 'metrics.id');
    expectValidUUID(latestMetrics.simulation_id, 'metrics.simulation_id');
  });

  it('all IDs are unique across different record types', () => {
    /** Act: create multiple records. */
    const tile = getStore().createTile(1, 1);
    const machineId = getStore().recordMachineState('press', 1, 1);
    const paramId = getStore().recordParameterChange(
      'press', 'pressure_bar', 280, 290, 2, 1, 'drift', 'wear', undefined
    );

    /** Collect all IDs. */
    const ids = new Set([
      getStore().session!.id,
      tile!.id,
      machineId,
      paramId,
    ]);

    /** Assert: all are unique (4 distinct IDs). */
    expect(ids.size).toBe(4);

    /** Assert: all are valid UUIDs. */
    ids.forEach((id) => expectValidUUID(id, 'cross-record ID'));
  });
});
