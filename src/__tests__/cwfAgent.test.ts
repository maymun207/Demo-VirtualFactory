/**
 * cwfAgent.test.ts — Unit Tests for CWF Agent Configuration Parameters
 *
 * Validates that all CWF agent configuration constants in
 * src/lib/params/cwfAgent.ts are within expected ranges and have
 * the correct types. These are guard-rail tests that catch
 * accidental misconfiguration (e.g., setting timeout to 0 or
 * max loops to a negative number).
 *
 * Run: npx vitest run src/__tests__/cwfAgent.test.ts
 */
/// <reference types="vitest/globals" />

import { describe, it, expect } from 'vitest';
import {
    CWF_MAX_TOOL_LOOPS,
    CWF_CLIENT_TIMEOUT_MS,
    CWF_MODEL_NAME,
    CWF_MODEL_VERSION_TAG,
    CWF_FALLBACK_RESPONSE_EN,
    CWF_FALLBACK_RESPONSE_TR,
    CWF_FORCE_SUMMARY_PROMPT_EN,
    CWF_FORCE_SUMMARY_PROMPT_TR,
    CWF_PARAMETER_DISPLAY_NAMES,
    CWF_PARAMETER_DISPLAY_PROMPT,
} from '../lib/params/cwfAgent';

// =============================================================================
// Tests
// =============================================================================

describe('CWF Agent Configuration Parameters', () => {
    // ── Max Tool Loops ──────────────────────────────────────────────────

    it('CWF_MAX_TOOL_LOOPS should be a positive integer ≥ 1', () => {
        /** Must allow at least one tool-use iteration */
        expect(CWF_MAX_TOOL_LOOPS).toBeGreaterThanOrEqual(1);
        /** Must be an integer (no fractional loops) */
        expect(Number.isInteger(CWF_MAX_TOOL_LOOPS)).toBe(true);
    });

    it('CWF_MAX_TOOL_LOOPS should not exceed 20 (safety upper bound)', () => {
        /** Prevent runaway cost from too many Gemini tool calls */
        expect(CWF_MAX_TOOL_LOOPS).toBeLessThanOrEqual(20);
    });

    // ── Client Timeout ──────────────────────────────────────────────────

    it('CWF_CLIENT_TIMEOUT_MS should be a positive number', () => {
        expect(CWF_CLIENT_TIMEOUT_MS).toBeGreaterThan(0);
    });

    it('CWF_CLIENT_TIMEOUT_MS should be less than 60s (Vercel maxDuration)', () => {
        /**
         * The client timeout must be strictly less than the server's
         * maxDuration so the client aborts before the platform kills
         * the function, giving a user-readable error.
         */
        expect(CWF_CLIENT_TIMEOUT_MS).toBeLessThan(60_000);
    });

    it('CWF_CLIENT_TIMEOUT_MS should be at least 10s (minimum for complex queries)', () => {
        /** Very short timeouts would make CWF unusable */
        expect(CWF_CLIENT_TIMEOUT_MS).toBeGreaterThanOrEqual(10_000);
    });

    // ── Model Configuration ─────────────────────────────────────────────

    it('CWF_MODEL_NAME should be a non-empty string', () => {
        expect(typeof CWF_MODEL_NAME).toBe('string');
        expect(CWF_MODEL_NAME.length).toBeGreaterThan(0);
    });

    it('CWF_MODEL_VERSION_TAG should be a non-empty string', () => {
        expect(typeof CWF_MODEL_VERSION_TAG).toBe('string');
        expect(CWF_MODEL_VERSION_TAG.length).toBeGreaterThan(0);
    });

    // ── Fallback Responses ──────────────────────────────────────────────

    it('CWF_FALLBACK_RESPONSE_EN should be a non-empty English string', () => {
        expect(typeof CWF_FALLBACK_RESPONSE_EN).toBe('string');
        /** Must contain meaningful content, not just whitespace */
        expect(CWF_FALLBACK_RESPONSE_EN.trim().length).toBeGreaterThan(10);
    });

    it('CWF_FALLBACK_RESPONSE_TR should be a non-empty Turkish string', () => {
        expect(typeof CWF_FALLBACK_RESPONSE_TR).toBe('string');
        /** Must contain meaningful content, not just whitespace */
        expect(CWF_FALLBACK_RESPONSE_TR.trim().length).toBeGreaterThan(10);
    });

    it('Fallback responses should contain the warning emoji ⚠️', () => {
        /** Visual indicator that something went wrong */
        expect(CWF_FALLBACK_RESPONSE_EN).toContain('⚠️');
        expect(CWF_FALLBACK_RESPONSE_TR).toContain('⚠️');
    });

    // ── Forced-Summary Prompts ──────────────────────────────────────────

    it('CWF_FORCE_SUMMARY_PROMPT_EN should be a non-empty string', () => {
        expect(typeof CWF_FORCE_SUMMARY_PROMPT_EN).toBe('string');
        expect(CWF_FORCE_SUMMARY_PROMPT_EN.trim().length).toBeGreaterThan(10);
    });

    it('CWF_FORCE_SUMMARY_PROMPT_TR should be a non-empty string', () => {
        expect(typeof CWF_FORCE_SUMMARY_PROMPT_TR).toBe('string');
        expect(CWF_FORCE_SUMMARY_PROMPT_TR.trim().length).toBeGreaterThan(10);
    });

    it('Forced-summary prompts should mention tool calls', () => {
        /**
         * The prompt must explicitly tell the model to stop calling tools.
         * Check that both language variants mention the concept.
         */
        expect(CWF_FORCE_SUMMARY_PROMPT_EN.toLowerCase()).toContain('tool call');
        expect(CWF_FORCE_SUMMARY_PROMPT_TR.toLowerCase()).toContain('araç çağrısı');
    });

    // ── Parameter Display Names ─────────────────────────────────────────

    it('CWF_PARAMETER_DISPLAY_NAMES should be a non-empty object', () => {
        /** Must contain at least one parameter mapping */
        expect(typeof CWF_PARAMETER_DISPLAY_NAMES).toBe('object');
        expect(Object.keys(CWF_PARAMETER_DISPLAY_NAMES).length).toBeGreaterThan(0);
    });

    it('Every entry should have non-empty en and tr labels', () => {
        /** Every mapped column must provide both English and Turkish labels */
        for (const [key, entry] of Object.entries(CWF_PARAMETER_DISPLAY_NAMES)) {
            expect(typeof entry.en).toBe('string');
            expect(entry.en.trim().length).toBeGreaterThan(0);
            expect(typeof entry.tr).toBe('string');
            expect(entry.tr.trim().length).toBeGreaterThan(0);
        }
    });

    it('Should cover key Press parameters', () => {
        /** Spot-check that critical press columns are mapped */
        expect(CWF_PARAMETER_DISPLAY_NAMES).toHaveProperty('pressure_bar');
        expect(CWF_PARAMETER_DISPLAY_NAMES).toHaveProperty('cycle_time_sec');
        expect(CWF_PARAMETER_DISPLAY_NAMES).toHaveProperty('mold_temperature_c');
    });

    it('Should cover key Dryer parameters', () => {
        /** Spot-check that critical dryer columns are mapped */
        expect(CWF_PARAMETER_DISPLAY_NAMES).toHaveProperty('inlet_temperature_c');
        expect(CWF_PARAMETER_DISPLAY_NAMES).toHaveProperty('exit_moisture_pct');
    });

    it('Should cover key Glaze parameters', () => {
        /** Spot-check that critical glaze columns are mapped */
        expect(CWF_PARAMETER_DISPLAY_NAMES).toHaveProperty('glaze_density_g_cm3');
        expect(CWF_PARAMETER_DISPLAY_NAMES).toHaveProperty('nozzle_clog_pct');
    });

    it('Should cover key Printer parameters', () => {
        /** Spot-check that critical printer columns are mapped */
        expect(CWF_PARAMETER_DISPLAY_NAMES).toHaveProperty('head_temperature_c');
        expect(CWF_PARAMETER_DISPLAY_NAMES).toHaveProperty('resolution_dpi');
    });

    it('Should cover key Kiln parameters', () => {
        /** Spot-check that critical kiln columns are mapped */
        expect(CWF_PARAMETER_DISPLAY_NAMES).toHaveProperty('max_temperature_c');
        expect(CWF_PARAMETER_DISPLAY_NAMES).toHaveProperty('firing_time_min');
        expect(CWF_PARAMETER_DISPLAY_NAMES).toHaveProperty('zone_temperatures_c');
    });

    it('Should cover key Sorting parameters', () => {
        /** Spot-check that critical sorting columns are mapped */
        expect(CWF_PARAMETER_DISPLAY_NAMES).toHaveProperty('camera_resolution_mp');
        expect(CWF_PARAMETER_DISPLAY_NAMES).toHaveProperty('calibration_drift_pct');
    });

    it('Should cover key Packaging parameters', () => {
        /** Spot-check that critical packaging columns are mapped */
        expect(CWF_PARAMETER_DISPLAY_NAMES).toHaveProperty('stack_count');
        expect(CWF_PARAMETER_DISPLAY_NAMES).toHaveProperty('box_sealing_pressure_bar');
    });

    // ── Parameter Display Prompt ────────────────────────────────────────

    it('CWF_PARAMETER_DISPLAY_PROMPT should contain the mandatory header', () => {
        /** The prompt must clearly state the rule is mandatory */
        expect(CWF_PARAMETER_DISPLAY_PROMPT).toContain('PARAMETER DISPLAY NAMES');
        expect(CWF_PARAMETER_DISPLAY_PROMPT).toContain('MANDATORY');
    });

    it('CWF_PARAMETER_DISPLAY_PROMPT should contain wrong/right examples', () => {
        /** The prompt must include clear examples so Gemini knows the expected format */
        expect(CWF_PARAMETER_DISPLAY_PROMPT).toContain('WRONG');
        expect(CWF_PARAMETER_DISPLAY_PROMPT).toContain('RIGHT');
        expect(CWF_PARAMETER_DISPLAY_PROMPT).toContain('pressure_bar');
    });

    it('CWF_PARAMETER_DISPLAY_PROMPT should include all mapped parameters', () => {
        /** Every column in the mapping must appear in the prompt so Gemini has the full reference */
        for (const key of Object.keys(CWF_PARAMETER_DISPLAY_NAMES)) {
            expect(CWF_PARAMETER_DISPLAY_PROMPT).toContain(key);
        }
    });
});
