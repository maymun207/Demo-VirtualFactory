/**
 * cwfCommands.test.ts — Unit tests for CWF Command Configuration
 *
 * Tests the CWF parameter control configuration module including:
 *   - CWF_AUTH_CODE value validation
 *   - CWF_VALID_STATIONS completeness
 *   - CWF_PARAM_RANGES structure and bounds
 *   - isValidCWFStation() helper
 *   - validateCWFParamValue() validation logic
 *
 * Run: npx vitest run src/lib/params/cwfCommands.test.ts
 */

import { describe, it, expect } from 'vitest';
import {
    CWF_AUTH_CODE,
    CWF_AUTH_TIMEOUT_MS,
    CWF_ACK_WAIT_MS,
    CWF_ACK_POLL_MS,
    CWF_VALID_STATIONS,
    CWF_PARAM_RANGES,
    isValidCWFStation,
    validateCWFParamValue,
} from './cwfCommands';

// =============================================================================
// CWF_AUTH_CODE
// =============================================================================

describe('CWF_AUTH_CODE', () => {
    it('should be the expected authorization code', () => {
        /** The auth code must match the known human-in-the-loop credential */
        expect(CWF_AUTH_CODE).toBe('airtk');
    });

    it('should be a non-empty string', () => {
        /** Auth code must never be empty */
        expect(CWF_AUTH_CODE.length).toBeGreaterThan(0);
    });
});

// =============================================================================
// CWF_AUTH_TIMEOUT_MS
// =============================================================================

describe('CWF_AUTH_TIMEOUT_MS', () => {
    it('should be 20 seconds in milliseconds', () => {
        /** 20s = 20,000ms — user has 20 seconds to respond */
        expect(CWF_AUTH_TIMEOUT_MS).toBe(20_000);
    });
});

// =============================================================================
// CWF_ACK_WAIT_MS & CWF_ACK_POLL_MS
// =============================================================================

describe('CWF_ACK_WAIT_MS', () => {
    it('should be 5 seconds in milliseconds', () => {
        /** 5s = 5000ms — server waits up to 5s for client ACK */
        expect(CWF_ACK_WAIT_MS).toBe(5_000);
    });

    it('should be positive', () => {
        /** Zero or negative wait would break the polling loop */
        expect(CWF_ACK_WAIT_MS).toBeGreaterThan(0);
    });
});

describe('CWF_ACK_POLL_MS', () => {
    it('should be 500 milliseconds', () => {
        /** Server polls every 500ms = max 10 queries per parameter */
        expect(CWF_ACK_POLL_MS).toBe(500);
    });

    it('should be less than CWF_ACK_WAIT_MS', () => {
        /** Poll interval must be shorter than total wait, otherwise no polling occurs */
        expect(CWF_ACK_POLL_MS).toBeLessThan(CWF_ACK_WAIT_MS);
    });

    it('worst case total wait (7 params) should fit within 60s Vercel limit', () => {
        /** 7 parameters × CWF_ACK_WAIT_MS must be < 60,000ms (Vercel maxDuration) */
        const worstCaseMs = 7 * CWF_ACK_WAIT_MS;
        expect(worstCaseMs).toBeLessThan(60_000);
    });
});

// =============================================================================
// CWF_VALID_STATIONS
// =============================================================================

describe('CWF_VALID_STATIONS', () => {
    it('should contain all 7 factory stations', () => {
        /** Must match the 7 stations in the ceramic tile production line */
        expect(CWF_VALID_STATIONS).toEqual([
            'press', 'dryer', 'glaze', 'printer', 'kiln', 'sorting', 'packaging',
        ]);
    });

    it('should have exactly 7 entries', () => {
        /** Factory has 7 stations — no more, no less */
        expect(CWF_VALID_STATIONS).toHaveLength(7);
    });
});

// =============================================================================
// CWF_PARAM_RANGES
// =============================================================================

describe('CWF_PARAM_RANGES', () => {
    it('should have a range definition for every valid station', () => {
        /** Every station listed in CWF_VALID_STATIONS must have range definitions */
        for (const station of CWF_VALID_STATIONS) {
            expect(CWF_PARAM_RANGES[station]).toBeDefined();
        }
    });

    it('should have min < max for every parameter range', () => {
        /** Range integrity: minimum must be strictly less than maximum */
        for (const station of CWF_VALID_STATIONS) {
            const stationRanges = CWF_PARAM_RANGES[station];
            for (const [_param, range] of Object.entries(stationRanges)) {
                expect(range.min).toBeLessThan(range.max);
            }
        }
    });

    it('should have finite numbers for all range values', () => {
        /** All range bounds must be finite (not NaN, not Infinity) */
        for (const station of CWF_VALID_STATIONS) {
            const stationRanges = CWF_PARAM_RANGES[station];
            for (const [_param, range] of Object.entries(stationRanges)) {
                expect(Number.isFinite(range.min)).toBe(true);
                expect(Number.isFinite(range.max)).toBe(true);
            }
        }
    });

    it('should have press pressure_bar range covering optimal 350-380', () => {
        /** Press pressure optimal range (350–380) must be within CWF range */
        const range = CWF_PARAM_RANGES['press']['pressure_bar'];
        expect(range.min).toBeLessThanOrEqual(350);
        expect(range.max).toBeGreaterThanOrEqual(380);
    });
});

// =============================================================================
// isValidCWFStation()
// =============================================================================

describe('isValidCWFStation', () => {
    it('should return true for all valid station names', () => {
        /** Every station in the enumeration must pass validation */
        for (const station of CWF_VALID_STATIONS) {
            expect(isValidCWFStation(station)).toBe(true);
        }
    });

    it('should return false for invalid station names', () => {
        /** Non-existent stations must fail validation */
        expect(isValidCWFStation('conveyor')).toBe(false);
        expect(isValidCWFStation('assembly')).toBe(false);
        expect(isValidCWFStation('')).toBe(false);
        expect(isValidCWFStation('PRESS')).toBe(false); // Case-sensitive
    });
});

// =============================================================================
// validateCWFParamValue()
// =============================================================================

describe('validateCWFParamValue', () => {
    it('should accept values within range', () => {
        /** A value in the middle of the range must be valid */
        const result = validateCWFParamValue('press', 'pressure_bar', 365);
        expect(result.valid).toBe(true);
        expect(result.reason).toBeUndefined();
    });

    it('should accept values at range boundaries', () => {
        /** Range boundaries (inclusive) must be valid */
        const min = CWF_PARAM_RANGES['press']['pressure_bar'].min;
        const max = CWF_PARAM_RANGES['press']['pressure_bar'].max;
        expect(validateCWFParamValue('press', 'pressure_bar', min).valid).toBe(true);
        expect(validateCWFParamValue('press', 'pressure_bar', max).valid).toBe(true);
    });

    it('should reject values below range minimum', () => {
        /** Values below minimum must be rejected with a reason */
        const result = validateCWFParamValue('press', 'pressure_bar', 100);
        expect(result.valid).toBe(false);
        expect(result.reason).toContain('out of range');
    });

    it('should reject values above range maximum', () => {
        /** Values above maximum must be rejected with a reason */
        const result = validateCWFParamValue('press', 'pressure_bar', 9999);
        expect(result.valid).toBe(false);
        expect(result.reason).toContain('out of range');
    });

    it('should reject unknown stations', () => {
        /** Non-existent stations must produce an error reason */
        const result = validateCWFParamValue('conveyor', 'speed', 5);
        expect(result.valid).toBe(false);
        expect(result.reason).toContain('Unknown station');
    });

    it('should reject unknown parameters', () => {
        /** Non-existent parameters for valid stations must produce an error reason */
        const result = validateCWFParamValue('press', 'nonexistent_param', 100);
        expect(result.valid).toBe(false);
        expect(result.reason).toContain('Unknown parameter');
    });

    it('should reject NaN values', () => {
        /** Non-finite values must be rejected */
        const result = validateCWFParamValue('press', 'pressure_bar', NaN);
        expect(result.valid).toBe(false);
        expect(result.reason).toContain('finite number');
    });

    it('should reject Infinity values', () => {
        /** Infinity must be rejected */
        const result = validateCWFParamValue('press', 'pressure_bar', Infinity);
        expect(result.valid).toBe(false);
        expect(result.reason).toContain('finite number');
    });

    it('should validate across all stations', () => {
        /** Spot-check one parameter per station for in-range acceptance */
        const spotChecks: [string, string, number][] = [
            ['press', 'pressure_bar', 365],
            ['dryer', 'inlet_temperature_c', 200],
            ['glaze', 'glaze_density_g_cm3', 1.45],
            ['printer', 'head_temperature_c', 40],
            ['kiln', 'max_temperature_c', 1160],
            ['sorting', 'scan_rate_tiles_min', 40],
            ['packaging', 'stack_count', 8],
        ];
        for (const [station, param, value] of spotChecks) {
            const result = validateCWFParamValue(station, param, value);
            expect(result.valid).toBe(true);
        }
    });
});
