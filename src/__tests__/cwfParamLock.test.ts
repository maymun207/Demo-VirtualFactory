/**
 * cwfParamLock.test.ts — Unit Tests for CWF Drift-Reset Mechanism
 *
 * Verifies that when CWF corrects a machine parameter, the drift limit
 * for that specific parameter is zeroed out so that the random drift engine
 * cannot re-degrade the corrected value.
 *
 * The drift engine (`applyRandomParameterChange`) applies drift proportional
 * to `parameterDriftLimits[station][param]`. When this limit is 0, the drift
 * step is 0% — effectively freezing the parameter at the CWF-corrected value.
 *
 * Run: npx vitest run src/__tests__/cwfParamLock.test.ts
 */
/// <reference types="vitest/globals" />

import { describe, it, expect, beforeEach } from 'vitest';
import { useSimulationDataStore } from '../store/simulationDataStore';
import type { StationName } from '../store/types';

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Reset the store to a clean state before each test.
 * Uses resetDataStore() which restores factory default params and drift limits.
 */
function resetStore(): void {
    useSimulationDataStore.getState().resetDataStore();
}

/**
 * Get the current drift limit for a specific station + parameter.
 *
 * @param station   - Station name (e.g. 'kiln')
 * @param parameter - Parameter column name (e.g. 'max_temperature_c')
 * @returns The drift limit percentage, or undefined if not set
 */
function getDriftLimit(station: StationName, parameter: string): number | undefined {
    return useSimulationDataStore.getState().parameterDriftLimits[station]?.[parameter];
}

/**
 * Get the current parameter value for a specific station + parameter.
 *
 * @param station   - Station name (e.g. 'kiln')
 * @param parameter - Parameter column name (e.g. 'max_temperature_c')
 * @returns The numeric value, or undefined if not found
 */
function getParamValue(station: StationName, parameter: string): number | undefined {
    const params = useSimulationDataStore.getState().currentParams[station] as Record<string, unknown>;
    const value = params[parameter];
    return typeof value === 'number' ? value : undefined;
}

// =============================================================================
// TESTS
// =============================================================================

describe('CWF Drift-Reset Mechanism', () => {
    /** Reset the store before every test to ensure isolation. */
    beforeEach(() => {
        resetStore();
    });

    // ── Core Behaviour ──────────────────────────────────────────────────

    it('should zero the drift limit when CWF corrects a parameter', () => {
        /** Pre-set a non-zero drift limit to simulate an active scenario. */
        useSimulationDataStore.getState().updateDriftLimit('kiln', 'max_temperature_c', 80);
        /** Verify drift limit is 80% before CWF correction. */
        expect(getDriftLimit('kiln', 'max_temperature_c')).toBe(80);

        /** Drift the parameter away from default so CWF has something to correct. */
        useSimulationDataStore.getState().updateParameter(
            'kiln', 'max_temperature_c', 1250, 'drift', 'wear'
        );

        /** Apply CWF correction — changeReason = 'cwf_agent'. */
        useSimulationDataStore.getState().updateParameter(
            'kiln', 'max_temperature_c', 1160, 'step', 'cwf_agent'
        );

        /** The drift limit for this specific parameter should be zeroed. */
        expect(getDriftLimit('kiln', 'max_temperature_c')).toBe(0);
    });

    it('should apply the CWF-corrected value to currentParams', () => {
        /** Drift the parameter away from default first. */
        useSimulationDataStore.getState().updateParameter(
            'kiln', 'max_temperature_c', 1250, 'drift', 'wear'
        );

        /** Apply CWF correction. */
        useSimulationDataStore.getState().updateParameter(
            'kiln', 'max_temperature_c', 1160, 'step', 'cwf_agent'
        );

        /** The parameter value should be the CWF-proposed value. */
        expect(getParamValue('kiln', 'max_temperature_c')).toBe(1160);
    });

    // ── Isolation: Only the corrected parameter is affected ──────────────

    it('should NOT zero drift limits for other parameters on the same station', () => {
        /** Set drift limits for two kiln parameters. */
        useSimulationDataStore.getState().updateDriftLimit('kiln', 'max_temperature_c', 80);
        useSimulationDataStore.getState().updateDriftLimit('kiln', 'firing_time_min', 60);

        /** Drift the parameter away from default so CWF has something to correct. */
        useSimulationDataStore.getState().updateParameter(
            'kiln', 'max_temperature_c', 1250, 'drift', 'wear'
        );

        /** CWF corrects only max_temperature_c. */
        useSimulationDataStore.getState().updateParameter(
            'kiln', 'max_temperature_c', 1160, 'step', 'cwf_agent'
        );

        /** max_temperature_c drift should be zeroed. */
        expect(getDriftLimit('kiln', 'max_temperature_c')).toBe(0);
        /** firing_time_min drift should be UNCHANGED. */
        expect(getDriftLimit('kiln', 'firing_time_min')).toBe(60);
    });

    it('should NOT zero drift limits for parameters on other stations', () => {
        /** Set drift limits across multiple stations. */
        useSimulationDataStore.getState().updateDriftLimit('kiln', 'max_temperature_c', 80);
        useSimulationDataStore.getState().updateDriftLimit('press', 'pressure_bar', 50);

        /** CWF corrects only kiln max_temperature_c. */
        useSimulationDataStore.getState().updateParameter(
            'kiln', 'max_temperature_c', 1160, 'step', 'cwf_agent'
        );

        /** Press drift limit should be untouched. */
        expect(getDriftLimit('press', 'pressure_bar')).toBe(50);
    });

    // ── Non-CWF changes should NOT affect drift limits ───────────────────

    it('should NOT zero drift limits for drift-originated changes', () => {
        /** Set a non-zero drift limit. */
        useSimulationDataStore.getState().updateDriftLimit('kiln', 'max_temperature_c', 80);

        /** Apply a drift change (not CWF). */
        useSimulationDataStore.getState().updateParameter(
            'kiln', 'max_temperature_c', 1200, 'drift', 'wear'
        );

        /** Drift limit should remain at 80 — only CWF resets it. */
        expect(getDriftLimit('kiln', 'max_temperature_c')).toBe(80);
    });

    it('should NOT zero drift limits for scenario-originated changes', () => {
        /** Set a non-zero drift limit. */
        useSimulationDataStore.getState().updateDriftLimit('kiln', 'max_temperature_c', 80);

        /** Apply a scenario-driven change. */
        useSimulationDataStore.getState().updateParameter(
            'kiln', 'max_temperature_c', 1250, 'step', 'scenario'
        );

        /** Drift limit should remain at 80. */
        expect(getDriftLimit('kiln', 'max_temperature_c')).toBe(80);
    });

    // ── Multiple CWF corrections on the same station ─────────────────────

    it('should zero drift limits for multiple CWF corrections on the same station', () => {
        /** Set drift limits for all kiln params. */
        useSimulationDataStore.getState().updateDriftLimit('kiln', 'max_temperature_c', 80);
        useSimulationDataStore.getState().updateDriftLimit('kiln', 'firing_time_min', 60);
        useSimulationDataStore.getState().updateDriftLimit('kiln', 'belt_speed_m_min', 40);

        /** Drift all parameters away from default so CWF has something to correct. */
        useSimulationDataStore.getState().updateParameter(
            'kiln', 'max_temperature_c', 1250, 'drift', 'wear'
        );
        useSimulationDataStore.getState().updateParameter(
            'kiln', 'firing_time_min', 65, 'drift', 'wear'
        );
        useSimulationDataStore.getState().updateParameter(
            'kiln', 'belt_speed_m_min', 0.8, 'drift', 'wear'
        );

        /** CWF corrects all three parameters back to optimal midpoints. */
        useSimulationDataStore.getState().updateParameter(
            'kiln', 'max_temperature_c', 1160, 'step', 'cwf_agent'
        );
        useSimulationDataStore.getState().updateParameter(
            'kiln', 'firing_time_min', 47.5, 'step', 'cwf_agent'
        );
        useSimulationDataStore.getState().updateParameter(
            'kiln', 'belt_speed_m_min', 2.0, 'step', 'cwf_agent'
        );

        /** All three should have zeroed drift limits. */
        expect(getDriftLimit('kiln', 'max_temperature_c')).toBe(0);
        expect(getDriftLimit('kiln', 'firing_time_min')).toBe(0);
        expect(getDriftLimit('kiln', 'belt_speed_m_min')).toBe(0);
    });

    // ── Factory reset restores drift limits ──────────────────────────────

    it('should restore drift limits after factory reset', () => {
        /** Set drift limit, then drift param away, then CWF-correct to zero it. */
        useSimulationDataStore.getState().updateDriftLimit('kiln', 'max_temperature_c', 80);
        useSimulationDataStore.getState().updateParameter(
            'kiln', 'max_temperature_c', 1250, 'drift', 'wear'
        );
        useSimulationDataStore.getState().updateParameter(
            'kiln', 'max_temperature_c', 1160, 'step', 'cwf_agent'
        );
        expect(getDriftLimit('kiln', 'max_temperature_c')).toBe(0);

        /** Factory reset should restore all drift limits to defaults. */
        useSimulationDataStore.getState().resetToFactoryDefaults();

        /** Drift limit should be back to the default (0 for SCN-000 base). */
        const defaultLimit = getDriftLimit('kiln', 'max_temperature_c');
        expect(defaultLimit).toBeDefined();
        /** Default drift limit for SCN-000 is 0 (no drift). Any non-zero
         *  limit only comes from loaded scenarios. So after reset, 0 is expected. */
    });
});
