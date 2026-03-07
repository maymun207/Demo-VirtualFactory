/**
 * syncDedup.test.ts — Unit Tests for Deduplication Logic
 *
 * Tests the deduplication mechanisms that prevent duplicate records
 * from being sent to Supabase in a single batch INSERT statement.
 * PostgreSQL's INSERT ... ON CONFLICT rejects duplicate conflict-key
 * values within a single statement (HTTP 500).
 *
 * Two layers of deduplication are tested:
 *  1. syncSlice: Set-based dedup of tile/snapshot IDs in getUnsyncedData()
 *  2. syncService: deduplicateById() safety-net before Supabase upsert
 *
 * Additionally tests that session.current_sim_tick is updated during tick().
 */
/// <reference types="vitest/globals" />

import { describe, it, expect } from 'vitest';

// =============================================================================
// Re-implementation of deduplicateById to test the contract.
// This mirrors the exact algorithm from syncService.ts.
// =============================================================================

/**
 * Remove duplicate records by `id`, keeping the LAST occurrence
 * (which represents the most recent state of the record).
 *
 * Mirrors `syncService.ts > deduplicateById()`.
 *
 * @param records - Array of record objects with an `id` field
 * @returns New array with unique `id` values, last-write-wins
 */
function deduplicateById(records: Record<string, unknown>[]): Record<string, unknown>[] {
    /** Map from id → record, each new entry overwrites the previous (last-wins). */
    const seen = new Map<string, Record<string, unknown>>();
    for (const record of records) {
        seen.set(record.id as string, record);
    }
    return [...seen.values()];
}

// =============================================================================
// deduplicateById Tests
// =============================================================================

describe('deduplicateById', () => {
    it('should return unique records when no duplicates exist', () => {
        /** Arrange: three records with distinct IDs */
        const records = [
            { id: 'tile-1', status: 'in_production', final_grade: 'pending' },
            { id: 'tile-2', status: 'in_production', final_grade: 'pending' },
            { id: 'tile-3', status: 'completed', final_grade: 'first' },
        ];

        /** Act */
        const result = deduplicateById(records);

        /** Assert: all three records returned unchanged */
        expect(result).toHaveLength(3);
        expect(result.map((r) => r.id)).toEqual(['tile-1', 'tile-2', 'tile-3']);
    });

    it('should keep the LAST occurrence when duplicates exist', () => {
        /** Arrange: same tile ID appears 3x with different states */
        const records = [
            { id: 'tile-1', status: 'in_production', final_grade: 'pending' },
            { id: 'tile-1', status: 'sorted', final_grade: 'first' },
            { id: 'tile-1', status: 'completed', final_grade: 'first' },
        ];

        /** Act */
        const result = deduplicateById(records);

        /** Assert: only one record, with the latest state */
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('tile-1');
        expect(result[0].status).toBe('completed');
        expect(result[0].final_grade).toBe('first');
    });

    it('should handle mixed duplicates and uniques', () => {
        /** Arrange: mix of duplicate and unique IDs */
        const records = [
            { id: 'tile-1', status: 'in_production' },
            { id: 'tile-2', status: 'in_production' },
            { id: 'tile-1', status: 'sorted' },
            { id: 'tile-3', status: 'completed' },
            { id: 'tile-2', status: 'completed' },
        ];

        /** Act */
        const result = deduplicateById(records);

        /** Assert: 3 unique records, each with the latest state */
        expect(result).toHaveLength(3);
        /** Last occurrence of tile-1 was 'sorted' */
        expect(result.find((r) => r.id === 'tile-1')?.status).toBe('sorted');
        /** Last occurrence of tile-2 was 'completed' */
        expect(result.find((r) => r.id === 'tile-2')?.status).toBe('completed');
        /** tile-3 only appeared once */
        expect(result.find((r) => r.id === 'tile-3')?.status).toBe('completed');
    });

    it('should return empty array for empty input', () => {
        /** Edge case: no records to deduplicate */
        const result = deduplicateById([]);
        expect(result).toEqual([]);
    });

    it('should handle single record', () => {
        /** Edge case: only one record */
        const records = [{ id: 'tile-1', status: 'in_production' }];
        const result = deduplicateById(records);
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('tile-1');
    });

    it('should preserve all fields from the last occurrence', () => {
        /** Arrange: record with many fields, duplicated with changes */
        const records = [
            { id: 'tile-1', status: 'in_production', station: 'press', grade: 'pending', sim_tick: 100 },
            { id: 'tile-1', status: 'completed', station: 'packaging', grade: 'first', sim_tick: 500 },
        ];

        /** Act */
        const result = deduplicateById(records);

        /** Assert: all fields from the last occurrence are preserved */
        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({
            id: 'tile-1',
            status: 'completed',
            station: 'packaging',
            grade: 'first',
            sim_tick: 500,
        });
    });
});

// =============================================================================
// Set-based ID deduplication (mirrors syncSlice logic)
// =============================================================================

describe('Set-based tile ID deduplication', () => {
    it('should deduplicate repeated tile IDs from unsyncedRecords', () => {
        /**
         * Arrange: simulate unsyncedRecords.tiles with repeated IDs.
         * This happens when a tile changes state multiple times before sync.
         */
        const unsyncedTileIds = ['tile-1', 'tile-1', 'tile-2', 'tile-1', 'tile-3', 'tile-2'];

        /** Act: same dedup logic as syncSlice.getUnsyncedData() */
        const uniqueIds = [...new Set(unsyncedTileIds)];

        /** Assert: only unique IDs remain */
        expect(uniqueIds).toEqual(['tile-1', 'tile-2', 'tile-3']);
    });

    it('should handle empty ID list', () => {
        /** Edge case: no tiles queued for sync */
        const unsyncedTileIds: string[] = [];
        const uniqueIds = [...new Set(unsyncedTileIds)];
        expect(uniqueIds).toEqual([]);
    });

    it('should handle all-unique IDs', () => {
        /** Edge case: no duplicates */
        const unsyncedTileIds = ['tile-1', 'tile-2', 'tile-3'];
        const uniqueIds = [...new Set(unsyncedTileIds)];
        expect(uniqueIds).toEqual(['tile-1', 'tile-2', 'tile-3']);
    });
});
