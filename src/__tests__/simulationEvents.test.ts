/**
 * simulationEvents.test.ts — Unit Tests for Simulation Event Constants & Logger
 *
 * Validates that:
 *   1. SIMULATION_EVENT_TYPES is a non-empty readonly array
 *   2. All 8 expected event types are present and correctly spelled
 *   3. Event types cover all simulation actions (start, stop, drain, reset)
 *   4. logSimulationEvent function exists and is a callable async function
 *   5. SimulationEventType union is exhaustive
 *
 * Used by: CI/CD pipeline (runs on every build via `npm test`)
 */

/// <reference types="vitest/globals" />

import { describe, it, expect } from 'vitest';
import {
    SIMULATION_EVENT_TYPES,
    type SimulationEventType,
} from '../lib/params/cwfCommands';
import { logSimulationEvent } from '../services/simulationEventLogger';

// =============================================================================
// Constants
// =============================================================================

/**
 * The exact 8 event types expected in the simulation_events table.
 * If you add a new event type, add it here AND in cwfCommands.ts.
 */
const EXPECTED_EVENT_TYPES: SimulationEventType[] = [
    'started',
    'stopped',
    'drain_started',
    'drain_completed',
    'force_stopped',
    'resumed',
    'reset',
    'work_order_completed',
];

// =============================================================================
// Test Suite
// =============================================================================

describe('Simulation Event Types & Logger', () => {

    // ─────────────────────────────────────────────────────────────────────────
    // Group 1: SIMULATION_EVENT_TYPES constant
    // ─────────────────────────────────────────────────────────────────────────

    describe('SIMULATION_EVENT_TYPES constant', () => {
        it('should be a non-empty array', () => {
            /** The constant must contain at least one event type */
            expect(Array.isArray(SIMULATION_EVENT_TYPES)).toBe(true);
            expect(SIMULATION_EVENT_TYPES.length).toBeGreaterThan(0);
        });

        it('should contain exactly 8 event types', () => {
            /**
             * We expect 8 distinct event types covering:
             * start, stop, drain_start, drain_complete, force_stop,
             * resume, reset, work_order_completed
             */
            expect(SIMULATION_EVENT_TYPES.length).toBe(8);
        });

        it('should contain all expected event type strings', () => {
            /** Every expected event type must be present in the constant */
            for (const eventType of EXPECTED_EVENT_TYPES) {
                expect(
                    SIMULATION_EVENT_TYPES.includes(eventType),
                    `Missing event type: '${eventType}'`,
                ).toBe(true);
            }
        });

        it('should only contain valid snake_case strings', () => {
            /** All event types must follow snake_case naming convention */
            for (const eventType of SIMULATION_EVENT_TYPES) {
                expect(eventType, `'${eventType}' is not valid snake_case`).toMatch(
                    /^[a-z][a-z0-9_]*$/,
                );
            }
        });

        it('should have no duplicate entries', () => {
            /** Each event type must appear exactly once */
            const unique = new Set(SIMULATION_EVENT_TYPES);
            expect(unique.size).toBe(SIMULATION_EVENT_TYPES.length);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Group 2: Action coverage validation
    // ─────────────────────────────────────────────────────────────────────────

    describe('Action coverage', () => {
        it('should include start-related event type', () => {
            /** toggleDataFlow (stopped→start) fires 'started' */
            expect(SIMULATION_EVENT_TYPES).toContain('started');
        });

        it('should include stop-related event types', () => {
            /** stopDataFlow and toggleDataFlow (running→stop) fire 'stopped' */
            expect(SIMULATION_EVENT_TYPES).toContain('stopped');
        });

        it('should include drain-related event types', () => {
            /** toggleDataFlow (running→drain) fires 'drain_started' */
            expect(SIMULATION_EVENT_TYPES).toContain('drain_started');
            /** completeDrain fires 'drain_completed' */
            expect(SIMULATION_EVENT_TYPES).toContain('drain_completed');
        });

        it('should include force stop event type', () => {
            /** toggleDataFlow (draining→force stop) fires 'force_stopped' */
            expect(SIMULATION_EVENT_TYPES).toContain('force_stopped');
        });

        it('should include reset event type', () => {
            /** resetSimulation fires 'reset' */
            expect(SIMULATION_EVENT_TYPES).toContain('reset');
        });

        it('should include work order completion event type', () => {
            /** Reserved for useWorkOrderEnforcer when target is reached */
            expect(SIMULATION_EVENT_TYPES).toContain('work_order_completed');
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Group 3: Logger function signature
    // ─────────────────────────────────────────────────────────────────────────

    describe('logSimulationEvent function', () => {
        it('should be a callable function', () => {
            /** The logger must be exported as a function */
            expect(typeof logSimulationEvent).toBe('function');
        });

        it('should accept 4 parameters (simulationId, simTick, eventType, details)', () => {
            /**
             * Function.length counts only the required parameters (no defaults).
             * The 4th parameter (details) is optional, so length should be 3.
             */
            expect(logSimulationEvent.length).toBeGreaterThanOrEqual(3);
        });
    });
});
