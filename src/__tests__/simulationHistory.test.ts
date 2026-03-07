/**
 * @vitest-environment jsdom
 *
 * simulationHistory.test.ts — Unit Tests for Simulation History Service
 *
 * Tests the localStorage-based simulation history CRUD operations.
 * The history enables CWF to access data from previous simulations.
 *
 * Uses a manual localStorage mock because vitest's jsdom environment
 * may not provide a fully functional localStorage in all configurations.
 */
/// <reference types="vitest/globals" />

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { SIMULATION_HISTORY_STORAGE_KEY, MAX_SIMULATION_HISTORY } from '../lib/params';

// =============================================================================
// localStorage mock — provides getItem/setItem/removeItem
// =============================================================================

/** In-memory localStorage mock store. */
let localStorageData: Record<string, string> = {};

/** Mock localStorage implementation for testing. */
const localStorageMock = {
    /** Get item from mock store. Returns null if key doesn't exist. */
    getItem: vi.fn((key: string) => localStorageData[key] ?? null),
    /** Set item in mock store. */
    setItem: vi.fn((key: string, value: string) => { localStorageData[key] = value; }),
    /** Remove item from mock store. */
    removeItem: vi.fn((key: string) => { delete localStorageData[key]; }),
    /** Clear all items from mock store. */
    clear: vi.fn(() => { localStorageData = {}; }),
};

/** Replace global localStorage with mock before importing the service. */
Object.defineProperty(globalThis, 'localStorage', {
    value: localStorageMock,
    writable: true,
    configurable: true,
});

// Must import AFTER localStorage mock is set up
// eslint-disable-next-line @typescript-eslint/no-var-requires
import {
    addSimulation,
    getSimulationHistory,
    clearSimulationHistory,
} from '../services/simulationHistoryService';

// =============================================================================
// Setup — Clear localStorage before each test
// =============================================================================

beforeEach(() => {
    localStorageData = {};
    localStorageMock.getItem.mockClear();
    localStorageMock.setItem.mockClear();
    localStorageMock.removeItem.mockClear();
});

afterEach(() => {
    vi.restoreAllMocks();
});

// =============================================================================
// Tests
// =============================================================================

describe('simulationHistoryService', () => {
    describe('getSimulationHistory', () => {
        it('should return empty array when no history exists', () => {
            /** No entries in localStorage */
            const history = getSimulationHistory();
            expect(history).toEqual([]);
        });

        it('should return empty array when localStorage contains malformed JSON', () => {
            /** Corrupt data */
            localStorageData[SIMULATION_HISTORY_STORAGE_KEY] = 'not-json-{{{';
            const history = getSimulationHistory();
            expect(history).toEqual([]);
        });

        it('should return empty array when localStorage contains non-array JSON', () => {
            /** Valid JSON but not an array */
            localStorageData[SIMULATION_HISTORY_STORAGE_KEY] = '{"key": "value"}';
            const history = getSimulationHistory();
            expect(history).toEqual([]);
        });
    });

    describe('addSimulation', () => {
        it('should add first simulation with counter 1', () => {
            /** Act */
            addSimulation('uuid-aaa', 'ABC123');

            /** Assert */
            const history = getSimulationHistory();
            expect(history).toHaveLength(1);
            expect(history[0].uuid).toBe('uuid-aaa');
            expect(history[0].sessionCode).toBe('ABC123');
            expect(history[0].counter).toBe(1);
            expect(history[0].startedAt).toBeDefined();
        });

        it('should increment counter for each new simulation', () => {
            /** Act: add 3 simulations */
            addSimulation('uuid-1', 'CODE01');
            addSimulation('uuid-2', 'CODE02');
            addSimulation('uuid-3', 'CODE03');

            /** Assert: counters are 1, 2, 3 */
            const history = getSimulationHistory();
            expect(history).toHaveLength(3);
            /** Newest first */
            expect(history[0].counter).toBe(3);
            expect(history[0].uuid).toBe('uuid-3');
            expect(history[1].counter).toBe(2);
            expect(history[2].counter).toBe(1);
        });

        it('should order entries newest-first', () => {
            /** Act */
            addSimulation('uuid-old', 'OLD001');
            addSimulation('uuid-new', 'NEW001');

            /** Assert: newest is at index 0 */
            const history = getSimulationHistory();
            expect(history[0].uuid).toBe('uuid-new');
            expect(history[1].uuid).toBe('uuid-old');
        });

        it('should enforce MAX_SIMULATION_HISTORY limit', () => {
            /** Act: add more than the max allowed entries */
            for (let i = 0; i < MAX_SIMULATION_HISTORY + 10; i++) {
                addSimulation(`uuid-${i}`, `CD${i.toString().padStart(4, '0')}`);
            }

            /** Assert: only MAX_SIMULATION_HISTORY entries kept */
            const history = getSimulationHistory();
            expect(history).toHaveLength(MAX_SIMULATION_HISTORY);
            /** Newest entry should have the highest counter */
            expect(history[0].counter).toBe(MAX_SIMULATION_HISTORY + 10);
        });

        it('should store ISO timestamp in startedAt', () => {
            /** Act */
            addSimulation('uuid-ts', 'TS0001');

            /** Assert: valid ISO timestamp */
            const history = getSimulationHistory();
            const date = new Date(history[0].startedAt);
            expect(date.getTime()).not.toBeNaN();
        });
    });

    describe('clearSimulationHistory', () => {
        it('should remove all history from localStorage', () => {
            /** Arrange */
            addSimulation('uuid-1', 'CODE01');
            addSimulation('uuid-2', 'CODE02');
            expect(getSimulationHistory()).toHaveLength(2);

            /** Act */
            clearSimulationHistory();

            /** Assert */
            expect(getSimulationHistory()).toEqual([]);
        });

        it('should be safe to call when no history exists', () => {
            /** Act: clear when nothing exists — should not throw */
            expect(() => clearSimulationHistory()).not.toThrow();
        });
    });
});
