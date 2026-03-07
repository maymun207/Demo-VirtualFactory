/// <reference types="vitest/globals" />

/**
 * setup.ts — Global Test Setup
 *
 * Runs before every test file. Configures:
 *  - idGenerator mock: returns deterministic sequential UUIDs for predictable assertions
 *  - supabaseClient mock: exports null to disable network calls in tests
 *  - Console suppression: silences expected warn/log during tests
 *
 * This file is referenced by vitest.config.ts → setupFiles.
 */
import { vi } from 'vitest';

// =============================================================================
// MOCK: idGenerator — sequential deterministic UUIDs
// =============================================================================

/** Counter for generating deterministic sequential UUIDs in tests. */
let uuidCounter = 0;

/**
 * Pad a number into a 12-digit hex string for the last segment of a UUID.
 * Example: 1 → "000000000001"
 *
 * @param n - Counter value to pad
 * @returns 12-character zero-padded hex string
 */
function padHex12(n: number): string {
  return n.toString(16).padStart(12, '0');
}

vi.mock('../lib/idGenerator', () => ({
  /**
   * Mock generateUUID that returns deterministic UUIDs:
   *   00000000-0000-4000-8000-000000000001
   *   00000000-0000-4000-8000-000000000002
   *   etc.
   *
   * These are valid UUID v4 format (version nibble = 4, variant = 8).
   * Reset the counter between tests using `resetUUIDCounter()`.
   */
  generateUUID: () => `00000000-0000-4000-8000-${padHex12(++uuidCounter)}`,

  /**
   * Real UUID_REGEX is also exported for tests that need format validation.
   */
  UUID_REGEX: /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
}));

/**
 * Reset the UUID counter to 0.
 * Call this in `beforeEach` for tests that depend on specific ID values.
 */
export function resetUUIDCounter(): void {
  uuidCounter = 0;
}

// Keep backward-compatibility alias for any tests still using the old name
export const resetNanoidCounter = resetUUIDCounter;

// =============================================================================
// MOCK: Supabase client — disabled for tests
// =============================================================================

vi.mock('../lib/supabaseClient', () => ({
  /**
   * Export null Supabase client to prevent any network calls during tests.
   * All store logic gracefully handles `supabase === null`.
   */
  supabase: null,
}));

// =============================================================================
// CONSOLE: Suppress expected output during tests
// =============================================================================

/**
 * Suppress console.log and console.warn during tests to keep output clean.
 * Errors are NOT suppressed — they indicate real test failures.
 */
beforeAll(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

/**
 * Restore console methods after all tests in a file complete.
 */
afterAll(() => {
  vi.restoreAllMocks();
});
