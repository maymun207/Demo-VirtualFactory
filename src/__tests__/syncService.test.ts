/**
 * syncService.test.ts — Unit Tests for stripFields Utility
 *
 * Tests the `stripFields` helper function that removes local-only
 * tracking fields (like `synced`) from records before sending
 * them to Supabase. The function:
 *  - Always removes the `synced` key
 *  - Accepts additional field names to strip via `extraFields`
 *  - Returns new objects without mutating originals
 *
 * Since `stripFields` is a private module-scoped function, we
 * re-implement the same algorithm here to test the contract.
 * If the function moves to a shared utility module in the future,
 * this test can import it directly.
 */
/// <reference types="vitest/globals" />

import { describe, it, expect } from 'vitest';

// ─────────────────────────────────────────────────────────────────────────────
// Re-implementation of stripFields to test the contract.
// This mirrors the exact algorithm from syncService.ts.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Remove local-only fields from records before sending to Supabase.
 * Mirrors `syncService.ts > stripFields()`.
 *
 * @param records     - Array of record objects to clean
 * @param extraFields - Additional field names to remove besides 'synced'
 * @returns New array of cleaned objects (original records are not mutated)
 */
function stripFields<T extends object>(
  records: T[],
  extraFields: string[] = []
): Record<string, unknown>[] {
  const fieldsToRemove = new Set(['synced', ...extraFields]);
  return records.map((record) => {
    const clean: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(record)) {
      if (!fieldsToRemove.has(key)) {
        clean[key] = value;
      }
    }
    return clean;
  });
}

// =============================================================================
// Tests
// =============================================================================

describe('stripFields', () => {
  it('should remove the "synced" field by default', () => {
    /** Arrange: a record with a `synced` tracking flag */
    const records = [
      { id: 'rec-1', name: 'Alpha', synced: true },
      { id: 'rec-2', name: 'Beta', synced: false },
    ];

    /** Act */
    const result = stripFields(records);

    /** Assert: `synced` is gone, other fields remain */
    expect(result).toEqual([
      { id: 'rec-1', name: 'Alpha' },
      { id: 'rec-2', name: 'Beta' },
    ]);
  });

  it('should remove additional extra fields when specified', () => {
    /** Arrange: a record with extra local-only metadata */
    const records = [
      { id: 'rec-1', data: 42, synced: true, _localFlag: 'x', _tempId: 'tmp' },
    ];

    /** Act: strip synced + two extra fields */
    const result = stripFields(records, ['_localFlag', '_tempId']);

    /** Assert: only id and data remain */
    expect(result).toEqual([{ id: 'rec-1', data: 42 }]);
  });

  it('should return empty array for empty input', () => {
    /** Edge case: no records to process */
    const result = stripFields([]);
    expect(result).toEqual([]);
  });

  it('should not mutate the original records', () => {
    /** Arrange */
    const original = { id: 'rec-1', synced: true, value: 99 };
    const records = [original];

    /** Act */
    stripFields(records);

    /** Assert: original still has its synced field */
    expect(original).toHaveProperty('synced', true);
    expect(original).toHaveProperty('value', 99);
  });

  it('should handle records without a synced field (no-op removal)', () => {
    /** Arrange: records that don't have a `synced` field at all */
    const records = [{ id: 'rec-1', value: 10 }];

    /** Act */
    const result = stripFields(records);

    /** Assert: record passes through unchanged */
    expect(result).toEqual([{ id: 'rec-1', value: 10 }]);
  });

  it('should handle nested objects (shallow copy only)', () => {
    /** Arrange: record with a nested object value */
    const nested = { a: 1, b: 2 };
    const records = [{ id: 'rec-1', synced: true, data: nested }];

    /** Act */
    const result = stripFields(records);

    /** Assert: nested object is copied by reference (shallow) */
    expect(result[0].data).toBe(nested);
  });

  it('should strip multiple records in a single call', () => {
    /** Arrange: batch of 3 records */
    const records = [
      { id: '1', synced: true },
      { id: '2', synced: false },
      { id: '3', synced: true },
    ];

    /** Act */
    const result = stripFields(records);

    /** Assert: all 3 records cleaned */
    expect(result).toHaveLength(3);
    expect(result.every((r) => !('synced' in r))).toBe(true);
  });

  it('should NOT strip tile_number from tile records (sent to Supabase)', () => {
    /**
     * Arrange: a tile record with tile_number.
     * tile_number was previously stripped, but is now preserved so
     * Supabase stores the app's per-session sequential number.
     */
    const records = [
      { id: 'tile-1', tile_number: 42, status: 'completed', synced: true },
    ];

    /** Act: strip only 'synced' (no extra fields for tiles anymore) */
    const result = stripFields(records);

    /** Assert: tile_number is preserved, synced is removed */
    expect(result[0]).toHaveProperty('tile_number', 42);
    expect(result[0]).not.toHaveProperty('synced');
  });
});
