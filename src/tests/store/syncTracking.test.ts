/**
 * syncTracking.test.ts — Unit Tests for Sync Tracking Logic
 *
 * Tests the markForSync / markAsSynced / getUnsyncedData functions
 * in simulationDataStore. Verifies that:
 *  - String-based entries (tiles, snapshots, machineStates, conveyorStates, conveyorEvents,
 *    etc.) are properly tracked and cleared using the flat string-ID queue pattern.
 *  - markAsSynced correctly removes the specified IDs from each queue type.
 *  - Bug #1 fix regression: machine state entries are removed after markAsSynced
 *    (this bug caused machineStates queue to never clear; now all queues use string IDs)
 *
 * These tests exercise the actual Zustand store in isolation (no React, no Supabase).
 */
/// <reference types="vitest/globals" />

import { describe, it, expect, beforeEach } from 'vitest';
import { useSimulationDataStore } from '../../store/simulationDataStore';

describe('Sync Tracking (markForSync / markAsSynced)', () => {
  /**
   * Reset the store state before each test to prevent cross-contamination.
   * Uses the store's resetDataStore() action which clears all data including unsyncedRecords.
   */
  beforeEach(() => {
    useSimulationDataStore.getState().resetDataStore();
  });

  // ─────────────────────────────────────────────────────────────────
  // String-based entries (tiles, snapshots, parameterChanges, etc.)
  // ─────────────────────────────────────────────────────────────────

  describe('String-based entries', () => {
    it('should add string IDs to unsyncedRecords.tiles via markForSync', () => {
      /** Arrange & Act: mark two tile IDs for sync */
      const store = useSimulationDataStore.getState();
      store.markForSync('tiles', 'tile-001');
      store.markForSync('tiles', 'tile-002');

      /** Assert: both IDs appear in unsyncedRecords.tiles */
      const unsynced = useSimulationDataStore.getState().unsyncedRecords;
      expect(unsynced.tiles).toContain('tile-001');
      expect(unsynced.tiles).toContain('tile-002');
      expect(unsynced.tiles).toHaveLength(2);
    });

    it('should remove string IDs via markAsSynced', () => {
      /** Arrange: add three tile IDs */
      const store = useSimulationDataStore.getState();
      store.markForSync('tiles', 'tile-001');
      store.markForSync('tiles', 'tile-002');
      store.markForSync('tiles', 'tile-003');

      /** Act: mark first two as synced */
      store.markAsSynced('tiles', ['tile-001', 'tile-002']);

      /** Assert: only tile-003 remains */
      const unsynced = useSimulationDataStore.getState().unsyncedRecords;
      expect(unsynced.tiles).toEqual(['tile-003']);
    });

    it('should handle markAsSynced with no matching IDs (no-op)', () => {
      /** Arrange: add one tile ID */
      const store = useSimulationDataStore.getState();
      store.markForSync('tiles', 'tile-001');

      /** Act: try to mark non-existent IDs as synced */
      store.markAsSynced('tiles', ['nonexistent-id']);

      /** Assert: original ID is untouched */
      const unsynced = useSimulationDataStore.getState().unsyncedRecords;
      expect(unsynced.tiles).toEqual(['tile-001']);
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // Machine state entries (Bug #1 regression tests)
  // All queues now use plain string IDs — no more embedded objects.
  // ─────────────────────────────────────────────────────────────────

  describe('Machine state entries (Bug #1 fix — string-ID queue)', () => {
    it('should add machine state string IDs to unsyncedRecords.machineStates via markForSync', () => {
      /** Arrange & Act: mark a machine state ID for sync */
      const store = useSimulationDataStore.getState();
      store.markForSync('machineStates', 'ms-001');

      /** Assert: ID is in the queue */
      const unsynced = useSimulationDataStore.getState().unsyncedRecords;
      expect(unsynced.machineStates).toHaveLength(1);
      expect(unsynced.machineStates[0]).toBe('ms-001');
    });

    it('should remove machine state IDs via markAsSynced', () => {
      /**
       * This test is a regression test for Bug #1:
       * Before the flat-array fix, machineStates used a compound { station, simTick, id }
       * object queue and lookup would silently miss, leaving the queue full forever.
       * Now machineStates uses string IDs like all other queues.
       */
      const store = useSimulationDataStore.getState();

      /** Simulate what recordMachineState does: push plain string IDs directly */
      useSimulationDataStore.setState((s) => ({
        unsyncedRecords: {
          ...s.unsyncedRecords,
          machineStates: ['ms-001', 'ms-002', 'ms-003'],
        },
      }));

      /** Act: mark ms-001 and ms-002 as synced */
      store.markAsSynced('machineStates', ['ms-001', 'ms-002']);

      /** Assert: only ms-003 remains */
      const unsynced = useSimulationDataStore.getState().unsyncedRecords;
      expect(unsynced.machineStates).toHaveLength(1);
      expect(unsynced.machineStates[0]).toBe('ms-003');
    });

    it('should clear ALL machine state entries when all IDs are synced', () => {
      /** Arrange: push 3 machine state IDs */
      useSimulationDataStore.setState((s) => ({
        unsyncedRecords: {
          ...s.unsyncedRecords,
          machineStates: ['ms-001', 'ms-002', 'ms-003'],
        },
      }));

      /** Act: mark all as synced */
      const store = useSimulationDataStore.getState();
      store.markAsSynced('machineStates', ['ms-001', 'ms-002', 'ms-003']);

      /** Assert: array is empty */
      const unsynced = useSimulationDataStore.getState().unsyncedRecords;
      expect(unsynced.machineStates).toHaveLength(0);
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // Conveyor analytics entries (new: conveyorStates, conveyorEvents)
  // ─────────────────────────────────────────────────────────────────

  describe('Conveyor analytics entries (conveyorStates / conveyorEvents)', () => {
    it('should add conveyor state IDs to unsyncedRecords.conveyorStates via markForSync', () => {
      /** Arrange & Act: mark two conveyor state snapshot IDs */
      const store = useSimulationDataStore.getState();
      store.markForSync('conveyorStates', 'cs-001');
      store.markForSync('conveyorStates', 'cs-002');

      /** Assert: both IDs in the queue */
      const unsynced = useSimulationDataStore.getState().unsyncedRecords;
      expect(unsynced.conveyorStates).toContain('cs-001');
      expect(unsynced.conveyorStates).toContain('cs-002');
      expect(unsynced.conveyorStates).toHaveLength(2);
    });

    it('should remove conveyor state IDs via markAsSynced', () => {
      /** Arrange: push three conveyor state IDs */
      useSimulationDataStore.setState((s) => ({
        unsyncedRecords: {
          ...s.unsyncedRecords,
          conveyorStates: ['cs-001', 'cs-002', 'cs-003'],
        },
      }));

      /** Act: mark cs-001 and cs-002 as synced */
      const store = useSimulationDataStore.getState();
      store.markAsSynced('conveyorStates', ['cs-001', 'cs-002']);

      /** Assert: only cs-003 remains */
      const unsynced = useSimulationDataStore.getState().unsyncedRecords;
      expect(unsynced.conveyorStates).toHaveLength(1);
      expect(unsynced.conveyorStates[0]).toBe('cs-003');
    });

    it('should clear ALL conveyor state entries when all IDs are synced', () => {
      /** Arrange: two conveyor state IDs pending */
      useSimulationDataStore.setState((s) => ({
        unsyncedRecords: {
          ...s.unsyncedRecords,
          conveyorStates: ['cs-001', 'cs-002'],
        },
      }));

      /** Act: sync both */
      const store = useSimulationDataStore.getState();
      store.markAsSynced('conveyorStates', ['cs-001', 'cs-002']);

      /** Assert: queue is empty */
      const unsynced = useSimulationDataStore.getState().unsyncedRecords;
      expect(unsynced.conveyorStates).toHaveLength(0);
    });

    it('should add conveyor event IDs to unsyncedRecords.conveyorEvents via markForSync', () => {
      /** Arrange & Act: mark a jam_start event ID */
      const store = useSimulationDataStore.getState();
      store.markForSync('conveyorEvents', 'ce-001');

      /** Assert: ID is in the queue */
      const unsynced = useSimulationDataStore.getState().unsyncedRecords;
      expect(unsynced.conveyorEvents).toContain('ce-001');
      expect(unsynced.conveyorEvents).toHaveLength(1);
    });

    it('should remove conveyor event IDs via markAsSynced', () => {
      /** Arrange: push two event IDs (jam_start, jam_cleared) */
      useSimulationDataStore.setState((s) => ({
        unsyncedRecords: {
          ...s.unsyncedRecords,
          conveyorEvents: ['ce-001', 'ce-002'],
        },
      }));

      /** Act: mark the first event (jam_start) as synced */
      const store = useSimulationDataStore.getState();
      store.markAsSynced('conveyorEvents', ['ce-001']);

      /** Assert: only ce-002 (jam_cleared) remains */
      const unsynced = useSimulationDataStore.getState().unsyncedRecords;
      expect(unsynced.conveyorEvents).toHaveLength(1);
      expect(unsynced.conveyorEvents[0]).toBe('ce-002');
    });

    it('should reset conveyorStates and conveyorEvents queues on resetDataStore', () => {
      /** Arrange: add some entries to both queues */
      useSimulationDataStore.setState((s) => ({
        unsyncedRecords: {
          ...s.unsyncedRecords,
          conveyorStates: ['cs-001', 'cs-002'],
          conveyorEvents: ['ce-001'],
        },
      }));

      /** Act: reset the store */
      useSimulationDataStore.getState().resetDataStore();

      /** Assert: both queues are empty after reset */
      const unsynced = useSimulationDataStore.getState().unsyncedRecords;
      expect(unsynced.conveyorStates).toHaveLength(0);
      expect(unsynced.conveyorEvents).toHaveLength(0);
    });
  });
});
