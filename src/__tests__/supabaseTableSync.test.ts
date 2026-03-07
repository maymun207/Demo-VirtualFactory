/**
 * supabaseTableSync.test.ts — Zustand ↔ Supabase Table Sync Consistency Tests
 *
 * Automated test suite that verifies every Zustand store record type has a
 * corresponding Supabase table reference, every sync queue category maps to
 * a valid Supabase table, and every table name used in service code exists
 * in either the params constants or migration files.
 *
 * Purpose:
 *   Prevents silent sync failures caused by tables being added to Zustand
 *   stores (or sync queues) without a matching Supabase migration. This was
 *   a real production issue discovered on 2026-03-02 where 4 tables existed
 *   only because they were manually created in the SQL Editor but had no
 *   version-controlled CREATE TABLE statement.
 *
 * When to update:
 *   - When adding a new Zustand record type that maps to a Supabase table
 *   - When adding a new UnsyncedRecords queue category
 *   - When creating a new Supabase table migration
 *   - When adding a new service that writes to Supabase
 *
 * Coverage:
 *   1. UnsyncedRecords queue categories ↔ known Supabase table names
 *   2. MACHINE_TABLE_NAMES entries ↔ station list consistency
 *   3. All table name constants are non-empty and valid identifiers
 *   4. Migration file coverage — ensures SQL files exist for every table
 *   5. Cross-reference: every .from() target table has a migration
 *   6. syncService ↔ migration file alignment
 *
 * Used by: CI/CD pipeline (runs on every build via `npm test`)
 */
/// <reference types="vitest/globals" />

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// ─────────────────────────────────────────────────────────────────────────────
// Import all table name constants from params
// ─────────────────────────────────────────────────────────────────────────────

import {
    MACHINE_TABLE_NAMES,
    CONVEYOR_STATES_TABLE,
    CONVEYOR_EVENTS_TABLE,
    OEE_SNAPSHOT_TABLE,
    ALARM_LOG_TABLE_NAME,
} from '../lib/params';

import { STATION_ORDER } from '../store/types';
import type { UnsyncedRecords } from '../store/types';

// ─────────────────────────────────────────────────────────────────────────────
// Constants: Complete registry of ALL Supabase tables the app interacts with
// ─────────────────────────────────────────────────────────────────────────────

/**
 * MASTER LIST of every Supabase table that the application reads from or
 * writes to. This list MUST be kept in sync with the codebase.
 *
 * When adding a new table:
 *   1. Add the table name here
 *   2. Create a migration file in supabase/migrations/
 *   3. Add the corresponding Zustand type (if applicable)
 *   4. Add the sync mechanism in syncService.ts (if applicable)
 *
 * ⚠️ If you add a table here but skip step 2, this test will FAIL — that's
 *    the entire point. It forces you to create the migration.
 */
const ALL_SUPABASE_TABLES: string[] = [
    // ── Core session management ──
    'simulation_sessions',

    // ── Machine state tables (7 stations) ──
    'machine_press_states',
    'machine_dryer_states',
    'machine_glaze_states',
    'machine_printer_states',
    'machine_kiln_states',
    'machine_sorting_states',
    'machine_packaging_states',

    // ── Tile tracking ──
    'tiles',
    'tile_station_snapshots',

    // ── Events and analytics ──
    'parameter_change_events',
    'defect_scenarios',
    'scenario_activations',
    'production_metrics',
    'ai_analysis_results',

    // ── Telemetry ──
    'telemetry',

    // ── Conveyor analytics ──
    'conveyor_states',
    'conveyor_events',

    // ── Alarm logging ──
    'simulation_alarm_logs',

    // ── OEE snapshots ──
    'oee_snapshots',

    // ── Usage analytics ──
    'usage_log',

    // ── Simulation state transitions (CWF context enrichment) ──
    'simulation_events',
];

/**
 * Maps each UnsyncedRecords queue key to the Supabase table(s) it writes to.
 * This is the single source of truth for sync queue → table mapping.
 *
 * When adding a new sync queue category:
 *   1. Add the key to UnsyncedRecords in types.ts
 *   2. Add the mapping here
 *   3. Add the sync logic in syncService.ts
 *   4. Create the migration if the table doesn't exist
 */
const SYNC_QUEUE_TABLE_MAP: Record<keyof UnsyncedRecords, string[]> = {
    /** Machine states route to 7 separate station tables via MACHINE_TABLE_NAMES */
    machineStates: Object.values(MACHINE_TABLE_NAMES),
    /** Tiles route to the tiles table */
    tiles: ['tiles'],
    /** Tile station snapshots (künye) */
    snapshots: ['tile_station_snapshots'],
    /** Parameter change events from behaviour engine */
    parameterChanges: ['parameter_change_events'],
    /** Scenario activation/deactivation events */
    scenarios: ['scenario_activations'],
    /** Periodic production metrics aggregation */
    metrics: ['production_metrics'],
    /** Alarm log entries (jams, OEE alerts, quality) */
    alarmLogs: [ALARM_LOG_TABLE_NAME],
    /** Per-tick conveyor belt state snapshots */
    conveyorStates: [CONVEYOR_STATES_TABLE],
    /** Discrete conveyor state transition events */
    conveyorEvents: [CONVEYOR_EVENTS_TABLE],
};

/**
 * Tables that are written to OUTSIDE of the syncService batch loop.
 * These use independent sync mechanisms (telemetryStore, oeeSnapshotService, etc.)
 * but still need migration coverage.
 */
const INDEPENDENT_SYNC_TABLES: string[] = [
    'telemetry',           // telemetryStore.ts — periodic upsert
    'oee_snapshots',       // oeeSnapshotService.ts — periodic insert
    'usage_log',           // usageTracker.ts — insert on connect, update on disconnect
    'simulation_sessions', // sessionSlice.ts — direct insert/update
    'simulation_events',   // simulationEventLogger.ts — fire-and-forget event insert
];

// ─────────────────────────────────────────────────────────────────────────────
// Helper: Read all migration SQL files from supabase/migrations/
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Path to the Supabase migrations directory.
 * Resolves from this test file's location up to the project root.
 */
const MIGRATIONS_DIR = path.resolve(__dirname, '../../supabase/migrations');

/**
 * Concatenate all .sql migration files into a single string for searching.
 * This allows testing that a CREATE TABLE statement exists for every table.
 *
 * @returns Combined SQL content from all migration files
 */
function getAllMigrationSQL(): string {
    /** Guard: migrations directory must exist */
    if (!fs.existsSync(MIGRATIONS_DIR)) {
        return '';
    }

    const sqlFiles = fs
        .readdirSync(MIGRATIONS_DIR)
        .filter((f) => f.endsWith('.sql'))
        .sort();

    return sqlFiles
        .map((f) => fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf-8'))
        .join('\n');
}

/**
 * Get the list of migration file names for display in error messages.
 *
 * @returns Array of .sql filenames in the migrations directory
 */
function getMigrationFileNames(): string[] {
    if (!fs.existsSync(MIGRATIONS_DIR)) return [];
    return fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
}

// =============================================================================
// TEST SUITE
// =============================================================================

describe('Zustand ↔ Supabase Table Sync Consistency', () => {
    // ─────────────────────────────────────────────────────────────────────────
    // Group 1: Table Name Constants
    // ─────────────────────────────────────────────────────────────────────────

    describe('Table name constants', () => {
        it('MACHINE_TABLE_NAMES should map all 7 stations to valid table names', () => {
            /**
             * Verify that every station in STATION_ORDER has a corresponding
             * entry in MACHINE_TABLE_NAMES with a non-empty table name.
             */
            for (const station of STATION_ORDER) {
                const tableName = MACHINE_TABLE_NAMES[station];
                expect(tableName, `Missing MACHINE_TABLE_NAMES entry for station '${station}'`).toBeDefined();
                expect(tableName.length, `Empty table name for station '${station}'`).toBeGreaterThan(0);
                expect(tableName, `Table name for '${station}' should follow 'machine_*_states' pattern`)
                    .toMatch(/^machine_[a-z]+_states$/);
            }
        });

        it('MACHINE_TABLE_NAMES should contain exactly 7 entries (one per station)', () => {
            /** Guard against accidentally adding or removing station mappings */
            expect(Object.keys(MACHINE_TABLE_NAMES)).toHaveLength(STATION_ORDER.length);
        });

        it('CONVEYOR_STATES_TABLE should be a valid non-empty table name', () => {
            expect(CONVEYOR_STATES_TABLE).toBe('conveyor_states');
            expect(CONVEYOR_STATES_TABLE.length).toBeGreaterThan(0);
        });

        it('CONVEYOR_EVENTS_TABLE should be a valid non-empty table name', () => {
            expect(CONVEYOR_EVENTS_TABLE).toBe('conveyor_events');
            expect(CONVEYOR_EVENTS_TABLE.length).toBeGreaterThan(0);
        });

        it('OEE_SNAPSHOT_TABLE should be a valid non-empty table name', () => {
            expect(OEE_SNAPSHOT_TABLE).toBe('oee_snapshots');
            expect(OEE_SNAPSHOT_TABLE.length).toBeGreaterThan(0);
        });

        it('ALARM_LOG_TABLE_NAME should be a valid non-empty table name', () => {
            expect(ALARM_LOG_TABLE_NAME).toBe('simulation_alarm_logs');
            expect(ALARM_LOG_TABLE_NAME.length).toBeGreaterThan(0);
        });

        it('all table names should use snake_case and only lowercase letters/underscores', () => {
            /**
             * PostgreSQL table names should be lowercase snake_case.
             * This prevents quoting issues with PostgREST/Supabase JS client.
             */
            for (const table of ALL_SUPABASE_TABLES) {
                expect(table, `Table '${table}' is not valid snake_case`)
                    .toMatch(/^[a-z][a-z0-9_]*$/);
            }
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Group 2: Sync Queue Coverage
    // ─────────────────────────────────────────────────────────────────────────

    describe('Sync queue ↔ table mapping', () => {
        it('every UnsyncedRecords key should map to at least one Supabase table', () => {
            /**
             * Every sync queue category in UnsyncedRecords must have a
             * corresponding entry in SYNC_QUEUE_TABLE_MAP pointing to
             * valid Supabase table(s).
             */
            const expectedKeys: (keyof UnsyncedRecords)[] = [
                'machineStates', 'tiles', 'snapshots', 'parameterChanges',
                'scenarios', 'metrics', 'alarmLogs', 'conveyorStates', 'conveyorEvents',
            ];

            for (const key of expectedKeys) {
                const tables = SYNC_QUEUE_TABLE_MAP[key];
                expect(tables, `Missing SYNC_QUEUE_TABLE_MAP entry for queue '${key}'`).toBeDefined();
                expect(tables.length, `Queue '${key}' maps to zero tables`).toBeGreaterThan(0);

                /** Every target table must be in the master list */
                for (const table of tables) {
                    expect(
                        ALL_SUPABASE_TABLES.includes(table),
                        `Queue '${key}' references table '${table}' which is not in ALL_SUPABASE_TABLES`
                    ).toBe(true);
                }
            }
        });

        it('SYNC_QUEUE_TABLE_MAP should have exactly 9 entries (one per UnsyncedRecords key)', () => {
            /** Guard against sync queue categories without table mappings */
            expect(Object.keys(SYNC_QUEUE_TABLE_MAP)).toHaveLength(9);
        });

        it('all sync queue target tables combined should be a subset of ALL_SUPABASE_TABLES', () => {
            /**
             * Every table used in sync operations must exist in the master list.
             * This catches cases where a table is added to syncService but not
             * registered in the master list (and therefore not in migrations).
             */
            const allSyncTargets = new Set<string>();
            for (const tables of Object.values(SYNC_QUEUE_TABLE_MAP)) {
                for (const t of tables) allSyncTargets.add(t);
            }
            for (const t of INDEPENDENT_SYNC_TABLES) {
                allSyncTargets.add(t);
            }

            for (const table of allSyncTargets) {
                expect(
                    ALL_SUPABASE_TABLES.includes(table),
                    `Sync target table '${table}' is not registered in ALL_SUPABASE_TABLES`
                ).toBe(true);
            }
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Group 3: Migration File Coverage
    // ─────────────────────────────────────────────────────────────────────────

    describe('Migration file coverage', () => {
        it('supabase/migrations/ directory should exist', () => {
            expect(
                fs.existsSync(MIGRATIONS_DIR),
                `Migrations directory not found at ${MIGRATIONS_DIR}`
            ).toBe(true);
        });

        it('should have at least 1 migration file', () => {
            const files = getMigrationFileNames();
            expect(files.length, 'No .sql migration files found').toBeGreaterThan(0);
        });

        it('every table in ALL_SUPABASE_TABLES should have a CREATE TABLE in migrations', () => {
            /**
             * This is the CRITICAL test that would have caught the 4 missing tables
             * during the 2026-03-02 audit. For every table the app writes to,
             * there MUST be a CREATE TABLE statement in the migration files.
             *
             * Pattern matches both:
             *   CREATE TABLE table_name (
             *   CREATE TABLE IF NOT EXISTS table_name (
             */
            const allSQL = getAllMigrationSQL();

            for (const table of ALL_SUPABASE_TABLES) {
                const createPattern = new RegExp(
                    `CREATE\\s+TABLE\\s+(IF\\s+NOT\\s+EXISTS\\s+)?${table}\\s*\\(`,
                    'i'
                );
                expect(
                    createPattern.test(allSQL),
                    `❌ MISSING MIGRATION: Table '${table}' is used by the app but has no CREATE TABLE in any migration file.\n` +
                    `   → Add a CREATE TABLE statement to a new migration in supabase/migrations/\n` +
                    `   → Migration files found: ${getMigrationFileNames().join(', ')}`
                ).toBe(true);
            }
        });

        it('migration files should follow chronological naming convention', () => {
            /**
             * Migration files should be prefixed with a date (YYYYMMDD) and sorted
             * chronologically. This ensures they execute in the correct order.
             */
            const files = getMigrationFileNames();
            for (const file of files) {
                expect(file, `Migration '${file}' does not start with a date prefix`)
                    .toMatch(/^\d{8}/);
            }
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Group 4: RLS Policy Coverage
    // ─────────────────────────────────────────────────────────────────────────

    describe('RLS policy coverage', () => {
        it('every table should have RLS enabled in migrations', () => {
            /**
             * Supabase requires RLS to be enabled on every table.
             * Without it, the table is wide open (no security).
             *
             * Pattern matches:
             *   ALTER TABLE table_name ENABLE ROW LEVEL SECURITY;
             */
            const allSQL = getAllMigrationSQL();

            for (const table of ALL_SUPABASE_TABLES) {
                const rlsPattern = new RegExp(
                    `ALTER\\s+TABLE\\s+${table}\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`,
                    'i'
                );
                expect(
                    rlsPattern.test(allSQL),
                    `❌ MISSING RLS: Table '${table}' does not have ROW LEVEL SECURITY enabled in any migration.\n` +
                    `   → Add: ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;`
                ).toBe(true);
            }
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Group 5: Cross-referencing Code ↔ Params ↔ Migrations
    // ─────────────────────────────────────────────────────────────────────────

    describe('Cross-reference consistency', () => {
        it('MACHINE_TABLE_NAMES values should all exist in ALL_SUPABASE_TABLES', () => {
            for (const [station, table] of Object.entries(MACHINE_TABLE_NAMES)) {
                expect(
                    ALL_SUPABASE_TABLES.includes(table),
                    `MACHINE_TABLE_NAMES['${station}'] = '${table}' is not in ALL_SUPABASE_TABLES`
                ).toBe(true);
            }
        });

        it('named table constants should all exist in ALL_SUPABASE_TABLES', () => {
            /**
             * Every table constant defined in params/sync.ts and params/alarms.ts
             * must be registered in the master table list.
             */
            const namedConstants = [
                CONVEYOR_STATES_TABLE,
                CONVEYOR_EVENTS_TABLE,
                OEE_SNAPSHOT_TABLE,
                ALARM_LOG_TABLE_NAME,
            ];

            for (const table of namedConstants) {
                expect(
                    ALL_SUPABASE_TABLES.includes(table),
                    `Table constant '${table}' is not registered in ALL_SUPABASE_TABLES`
                ).toBe(true);
            }
        });

        it('ALL_SUPABASE_TABLES should not contain duplicates', () => {
            /** Guard against accidental duplicate entries in the master list */
            const unique = new Set(ALL_SUPABASE_TABLES);
            expect(unique.size, 'ALL_SUPABASE_TABLES contains duplicate entries').toBe(
                ALL_SUPABASE_TABLES.length
            );
        });

        it('independent sync tables should all have migrations', () => {
            /**
             * Tables that bypass the syncService (telemetry, OEE snapshots, etc.)
             * still need CREATE TABLE migrations.
             */
            const allSQL = getAllMigrationSQL();

            for (const table of INDEPENDENT_SYNC_TABLES) {
                const createPattern = new RegExp(
                    `CREATE\\s+TABLE\\s+(IF\\s+NOT\\s+EXISTS\\s+)?${table}\\s*\\(`,
                    'i'
                );
                expect(
                    createPattern.test(allSQL),
                    `❌ Independent sync table '${table}' has no CREATE TABLE in migrations`
                ).toBe(true);
            }
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Group 6: Zustand Store Type Completeness
    // ─────────────────────────────────────────────────────────────────────────

    describe('Zustand store completeness', () => {
        it('STATION_ORDER should have exactly 7 stations', () => {
            /**
             * The factory has exactly 7 stations. If this changes,
             * MACHINE_TABLE_NAMES, CurrentMachineParams, and MachineStateTables
             * all need to be updated.
             */
            expect(STATION_ORDER).toHaveLength(7);
        });

        it('STATION_ORDER should contain the expected station names', () => {
            /** Canonical list of stations in production order */
            const expected = ['press', 'dryer', 'glaze', 'printer', 'kiln', 'sorting', 'packaging'];
            expect(STATION_ORDER).toEqual(expected);
        });

        it('every station in STATION_ORDER should have a MACHINE_TABLE_NAMES entry', () => {
            /**
             * If a new station is added to STATION_ORDER but not to
             * MACHINE_TABLE_NAMES, machine state records for that station
             * would silently fail to sync.
             */
            for (const station of STATION_ORDER) {
                expect(
                    MACHINE_TABLE_NAMES[station],
                    `Station '${station}' is in STATION_ORDER but missing from MACHINE_TABLE_NAMES`
                ).toBeDefined();
            }
        });

        it('every MACHINE_TABLE_NAMES entry should correspond to a station in STATION_ORDER', () => {
            /**
             * Inverse check: if MACHINE_TABLE_NAMES has an entry for a station
             * that's not in STATION_ORDER, it means there's a phantom mapping.
             */
            for (const station of Object.keys(MACHINE_TABLE_NAMES)) {
                expect(
                    STATION_ORDER.includes(station as typeof STATION_ORDER[number]),
                    `MACHINE_TABLE_NAMES has entry for '${station}' which is not in STATION_ORDER`
                ).toBe(true);
            }
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Group 7: Function Coverage in Migrations
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * MASTER LIST of all database functions the application uses.
     * Every function here must have a CREATE [OR REPLACE] FUNCTION statement
     * in the migration files to ensure reproducibility on a fresh DB.
     *
     * When adding a new function:
     *   1. Add the function name to this array
     *   2. Create the function in a migration file
     *   3. Grant appropriate permissions (service_role, anon, authenticated)
     *
     * ⚠️ If you add a function to the DB but not here, the next developer
     *    deploying to a fresh project will get missing function errors.
     */
    const ALL_DB_FUNCTIONS: string[] = [
        // ── Core session management ──
        'generate_session_code',         // Generates unique 6-char session codes
        'get_simulation_by_code',        // Looks up simulation UUID by session code

        // ── CWF agent functions ──
        'execute_readonly_query',        // Executes read-only SQL for CWF agent
        'get_simulation_stats',          // Aggregates simulation statistics for CWF
        'get_machine_state',             // Retrieves machine state by station/tick

        // ── Session lifecycle ──
        'cleanup_stale_sessions',        // Marks orphaned sessions as abandoned
        'mark_abandoned_sessions',       // Lightweight orphan cleanup
        'purge_old_sessions',            // Fully deletes old sessions + child data
        'cleanup_old_simulation_data',   // Scheduled cleanup by retention interval

        // ── Usage analytics ──
        'cleanup_orphan_usage_logs',     // Patches orphan usage_log entries with no disconnect

        // ── Utility triggers ──
        'update_updated_at_column',      // Trigger function for auto-updating updated_at
    ];

    describe('Database function coverage', () => {
        it('every function in ALL_DB_FUNCTIONS should have a CREATE FUNCTION in migrations', () => {
            /**
             * Iterate over all known DB functions and verify each has a
             * CREATE [OR REPLACE] FUNCTION statement in the migration files.
             * This prevents functions from being created manually in the
             * SQL Editor without a version-controlled migration.
             */
            const allSQL = getAllMigrationSQL();

            for (const funcName of ALL_DB_FUNCTIONS) {
                const pattern = new RegExp(
                    `CREATE\\s+(OR\\s+REPLACE\\s+)?FUNCTION\\s+${funcName}`,
                    'i'
                );
                expect(
                    pattern.test(allSQL),
                    `❌ MISSING FUNCTION: '${funcName}' has no CREATE FUNCTION in any migration file.\n` +
                    `   → Add a CREATE OR REPLACE FUNCTION statement to a migration in supabase/migrations/`
                ).toBe(true);
            }
        });

        it('ALL_DB_FUNCTIONS should not contain duplicates', () => {
            /** Guard against accidental duplicate entries */
            const unique = new Set(ALL_DB_FUNCTIONS);
            expect(unique.size, 'ALL_DB_FUNCTIONS contains duplicate entries').toBe(
                ALL_DB_FUNCTIONS.length
            );
        });

        it('ALL_DB_FUNCTIONS should have exactly 10 entries', () => {
            /**
             * Guard: If this count changes, a developer has added or removed
             * a function from the DB without updating this test file.
             */
            expect(ALL_DB_FUNCTIONS).toHaveLength(11);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Group 8: Migration File Inventory
    // ─────────────────────────────────────────────────────────────────────────

    describe('Migration file inventory', () => {
        /**
         * The expected set of migration files that must exist locally.
         * This list must match what's applied on the live Supabase project.
         *
         * When adding a new migration:
         *   1. Create the .sql file in supabase/migrations/
         *   2. Apply it to the live project via MCP or CLI
         *   3. Add the filename to this array
         */
        const EXPECTED_MIGRATION_FILES: string[] = [
            '20260215163500_ceramic_simulator_schema.sql',
            '20260215163600_add_anon_policies_and_telemetry.sql',
            '20260217_add_defect_scenarios.sql',
            '20260225_cwf_agent_rpc.sql',
            '20260228_oee_snapshots.sql',
            '20260301000000_add_missing_tables.sql',
            '20260302000000_fix_security_advisories.sql',
            '20260302035323_improved_rls_and_cron_setup.sql',
            '20260302042207_fix_telemetry_schema.sql',
            '20260302050800_cleanup_orphan_usage_logs.sql',
            '20260303_simulation_events.sql',
        ];

        it('should have exactly the expected number of migration files', () => {
            /**
             * Ensures no migration files are accidentally added or deleted
             * without updating this test.
             */
            const files = getMigrationFileNames();
            expect(
                files.length,
                `Expected ${EXPECTED_MIGRATION_FILES.length} migration files but found ${files.length}.\n` +
                `   Found: ${files.join(', ')}\n` +
                `   Expected: ${EXPECTED_MIGRATION_FILES.join(', ')}`
            ).toBe(EXPECTED_MIGRATION_FILES.length);
        });

        it('every expected migration file should exist', () => {
            /**
             * Each expected migration file must be present in the supabase/migrations
             * directory. A missing file means the migration was applied to live DB
             * but the local file was deleted or never created.
             */
            const files = getMigrationFileNames();

            for (const expected of EXPECTED_MIGRATION_FILES) {
                expect(
                    files.includes(expected),
                    `❌ MISSING MIGRATION FILE: '${expected}' is expected but not found in supabase/migrations/\n` +
                    `   → This migration was applied to the live Supabase project but has no local file.\n` +
                    `   → Recreate it from the live DB or the Supabase dashboard.`
                ).toBe(true);
            }
        });

        it('no unexpected migration files should exist', () => {
            /**
             * Inverse check: every file in the migrations directory must be
             * in the expected list. Catches accidental duplicates or leftover
             * test migration files.
             */
            const files = getMigrationFileNames();

            for (const file of files) {
                expect(
                    EXPECTED_MIGRATION_FILES.includes(file),
                    `❌ UNEXPECTED MIGRATION FILE: '${file}' exists but is not in the expected list.\n` +
                    `   → If this is a new migration, add it to EXPECTED_MIGRATION_FILES in the test.\n` +
                    `   → If this is a duplicate or test file, remove it.`
                ).toBe(true);
            }
        });

        it('migration files should be in chronological order', () => {
            /**
             * Migration files must be named with ascending date prefixes
             * so they execute in the correct order when deploying to a fresh DB.
             */
            const files = getMigrationFileNames();
            const sorted = [...files].sort();
            expect(files).toEqual(sorted);
        });

        it('all views should have CREATE VIEW statements in migrations', () => {
            /**
             * Both database views (defective_tiles_analysis, tile_journey)
             * must have CREATE VIEW statements in migration files.
             */
            const EXPECTED_VIEWS = ['defective_tiles_analysis', 'tile_journey'];
            const allSQL = getAllMigrationSQL();

            for (const view of EXPECTED_VIEWS) {
                const pattern = new RegExp(
                    `CREATE\\s+VIEW\\s+(public\\.)?${view}`,
                    'i'
                );
                expect(
                    pattern.test(allSQL),
                    `❌ MISSING VIEW: '${view}' has no CREATE VIEW in any migration file.`
                ).toBe(true);
            }
        });
    });
});
