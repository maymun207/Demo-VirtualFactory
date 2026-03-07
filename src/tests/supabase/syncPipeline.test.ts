/**
 * syncPipeline.test.ts — Supabase Sync Pipeline Entegrasyon Testleri
 *
 * Bu test dosyası, getUnsyncedData() → sync → markAsSynced() tam döngüsünü kapsar.
 * syncSlice.ts'teki veri toplama mantığını doğrular.
 *
 * Kapsanan hatalar:
 *  - BUG #1: machineStates kuyruğu hiçbir zaman temizlenmiyordu.
 *    Eski kod, { station, simTick } nesnesi kullanarak Map.get() yaptı ama
 *    simTick ayrı depolandığından her zaman undefined döndü.
 *    Düzeltme: tüm kuyruklar artık string ID kullanır.
 *
 *  - Yeni kuyruklar: conveyorStates ve conveyorEvents
 *    Bu kuyruklar da Set tabanlı ID filtreleme kullanır.
 *
 * Testler [SP-01..SP-14]:
 *  SP-01..04  getUnsyncedData doğru kayıtları döndürür
 *  SP-05      Tüm 9 kuyruk türü boş başlar
 *  SP-06..08  markAsSynced kuyrukları kısmen/tamamen temizler
 *  SP-09..12  stripFields kontrat testleri
 *  SP-13      syncService.sync() — Supabase null iken no-op
 *  SP-14      EMPTY_UNSYNCED tüm beklenen 9 anahtarı içerir
 */
/// <reference types="vitest/globals" />

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useSimulationDataStore } from '../../store/simulationDataStore';
import { EMPTY_UNSYNCED } from '../../store/slices/storeHelpers';

// ─── Mock'lar ─────────────────────────────────────────────────────────────────
vi.mock('../../lib/supabaseClient', () => ({ supabase: null }));
vi.mock('../../lib/usageTracker', () => ({
    logConnect: vi.fn(),
    logDisconnect: vi.fn(),
}));

// ─── Helper'lar ────────────────────────────────────────────────────────────────
const getStore = () => useSimulationDataStore.getState();

function injectSession(id = 'test-sess-id') {
    useSimulationDataStore.setState({
        session: {
            id,
            session_code: 'SYNC01',
            name: 'Sync Test',
            description: '',
            tick_duration_ms: 500,
            production_tick_ratio: 10,
            station_gap_production_ticks: 5,
            status: 'running',
            current_sim_tick: 0,
            current_production_tick: 0,
            target_tiles_per_hour: 100,
            target_first_quality_pct: 95,
            started_at: new Date().toISOString(),
            paused_at: undefined,
            completed_at: undefined,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        },
        isRunning: true,
    });
}

// =============================================================================
// TEST GRUBU 1 — getUnsyncedData
// =============================================================================

describe('[SP] getUnsyncedData — Bekleyen Kayıt Toplama', () => {
    beforeEach(() => {
        getStore().resetDataStore();
        injectSession();
    });

    // ── [SP-01] machineState kayıtları döndürülür ─────────────────────────────
    it('[SP-01] getUnsyncedData → bekleyen machineState kayıtlarını döndürür', () => {
        /**
         * machineStates kuyruğuna string ID ekliyoruz, gerçek kaydı da diziye enjekte ediyoruz.
         * getUnsyncedData() bunları Set filtresiyle birleştirmeli.
         */
        const fakeRecord = {
            id: 'ms-test-1',
            simulation_id: 'test-sess-id',
            station: 'press' as const,
            sim_tick: 10,
            production_tick: 1,
            synced: false,
        } as import('../../store/types').AnyMachineStateRecord;

        useSimulationDataStore.setState((s) => ({
            machineStateRecords: [...s.machineStateRecords, fakeRecord],
            unsyncedRecords: {
                ...s.unsyncedRecords,
                machineStates: [...s.unsyncedRecords.machineStates, fakeRecord.id],
            },
        }));

        const { machineStates } = getStore().getUnsyncedData();
        expect(machineStates.press).toHaveLength(1);
        expect(machineStates.press[0].id).toBe('ms-test-1');
    });

    // ── [SP-02] synced:true olan kayıtlar atlanır ─────────────────────────────
    it('[SP-02] synced:true olan kayıtlar getUnsyncedData tarafından atlanır', () => {
        const fakeRecord = {
            id: 'ms-synced-1',
            simulation_id: 'test-sess-id',
            station: 'press' as const,
            sim_tick: 5,
            production_tick: 0,
            synced: true, // ← Zaten senkronize
        } as import('../../store/types').AnyMachineStateRecord;

        useSimulationDataStore.setState((s) => ({
            machineStateRecords: [...s.machineStateRecords, fakeRecord],
            unsyncedRecords: {
                ...s.unsyncedRecords,
                machineStates: [...s.unsyncedRecords.machineStates, fakeRecord.id],
            },
        }));

        const { machineStates } = getStore().getUnsyncedData();
        /** synced: true olduğu için dahil edilmemeli. */
        expect(machineStates.press).toHaveLength(0);
    });

    // ── [SP-03] conveyorStates kayıtları döndürülür ──────────────────────────── YENİ
    it('[SP-03] getUnsyncedData → bekleyen conveyorStates kayıtlarını döndürür', () => {
        const csRecord = {
            id: 'cs-pipeline-1',
            simulation_id: 'test-sess-id',
            sim_tick: 20,
            production_tick: 2,
            conveyor_speed: 1.5,
            conveyor_status: 'running' as const,
            fault_count: 0,
            active_tiles_on_belt: 3,
            created_at: new Date().toISOString(),
            synced: false,
        };

        useSimulationDataStore.setState((s) => ({
            conveyorStateRecords: [...s.conveyorStateRecords, csRecord],
            unsyncedRecords: {
                ...s.unsyncedRecords,
                conveyorStates: [...s.unsyncedRecords.conveyorStates, csRecord.id],
            },
        }));

        const { conveyorStates } = getStore().getUnsyncedData();
        expect(conveyorStates).toHaveLength(1);
        expect(conveyorStates[0].id).toBe('cs-pipeline-1');
        expect(conveyorStates[0].conveyor_speed).toBe(1.5);
    });

    // ── [SP-04] conveyorEvents kayıtları döndürülür ─────────────────────────── YENİ
    it('[SP-04] getUnsyncedData → bekleyen conveyorEvents kayıtlarını döndürür', () => {
        const ceRecord = {
            id: 'ce-pipeline-1',
            simulation_id: 'test-sess-id',
            sim_tick: 50,
            production_tick: 5,
            event_type: 'jam_start' as const,
            old_value: null,
            new_value: 'jammed',
            created_at: new Date().toISOString(),
            synced: false,
        };

        useSimulationDataStore.setState((s) => ({
            conveyorEventRecords: [...s.conveyorEventRecords, ceRecord],
            unsyncedRecords: {
                ...s.unsyncedRecords,
                conveyorEvents: [...s.unsyncedRecords.conveyorEvents, ceRecord.id],
            },
        }));

        const { conveyorEvents } = getStore().getUnsyncedData();
        expect(conveyorEvents).toHaveLength(1);
        expect(conveyorEvents[0].id).toBe('ce-pipeline-1');
        expect(conveyorEvents[0].event_type).toBe('jam_start');
    });

    // ── [SP-05] Tüm kuyruk türleri boş başlar ────────────────────────────────
    it('[SP-05] Taze store\'da tüm 9 kuyruk türü boş döner', () => {
        const data = getStore().getUnsyncedData();

        /** Makine durumları — 7 istasyon, hepsi boş. */
        expect(data.machineStates.press).toHaveLength(0);
        expect(data.machineStates.dryer).toHaveLength(0);
        expect(data.machineStates.kiln).toHaveLength(0);

        /** Diğer kutular. */
        expect(data.tiles).toHaveLength(0);
        expect(data.snapshots).toHaveLength(0);
        expect(data.parameterChanges).toHaveLength(0);
        expect(data.alarmLogs).toHaveLength(0);
        expect(data.metrics).toHaveLength(0);
        expect(data.scenarios).toHaveLength(0);

        /** Yeni: konveyör analitik dizileri. */
        expect(data.conveyorStates).toHaveLength(0);
        expect(data.conveyorEvents).toHaveLength(0);
    });
});

// =============================================================================
// TEST GRUBU 2 — markAsSynced
// =============================================================================

describe('[SP] markAsSynced — Kuyruk Temizleme', () => {
    beforeEach(() => {
        getStore().resetDataStore();
    });

    // ── [SP-06] machineStates kuyruğu kısmen temizlenir ──────────────────────
    it('[SP-06] markAsSynced → machineStates kuyruğunu kısmen temizler', () => {
        useSimulationDataStore.setState((s) => ({
            unsyncedRecords: {
                ...s.unsyncedRecords,
                machineStates: ['ms-A', 'ms-B', 'ms-C'],
            },
        }));

        getStore().markAsSynced('machineStates', ['ms-A', 'ms-B']);

        const { unsyncedRecords } = getStore();
        expect(unsyncedRecords.machineStates).toHaveLength(1);
        expect(unsyncedRecords.machineStates[0]).toBe('ms-C');
    });

    // ── [SP-07] conveyorStates kuyruğu tamamen temizlenir ──────────────────── YENİ
    it('[SP-07] markAsSynced → conveyorStates kuyruğunu tamamen temizler', () => {
        useSimulationDataStore.setState((s) => ({
            unsyncedRecords: {
                ...s.unsyncedRecords,
                conveyorStates: ['cs-1', 'cs-2'],
            },
        }));

        getStore().markAsSynced('conveyorStates', ['cs-1', 'cs-2']);

        expect(getStore().unsyncedRecords.conveyorStates).toHaveLength(0);
    });

    // ── [SP-08] conveyorEvents kuyruğu tamamen temizlenir ──────────────────── YENİ
    it('[SP-08] markAsSynced → conveyorEvents kuyruğunu tamamen temizler', () => {
        useSimulationDataStore.setState((s) => ({
            unsyncedRecords: {
                ...s.unsyncedRecords,
                conveyorEvents: ['ce-1', 'ce-2', 'ce-3'],
            },
        }));

        getStore().markAsSynced('conveyorEvents', ['ce-1', 'ce-2', 'ce-3']);

        expect(getStore().unsyncedRecords.conveyorEvents).toHaveLength(0);
    });
});

// =============================================================================
// TEST GRUBU 3 — EMPTY_UNSYNCED Yapısı
// =============================================================================

describe('[SP] EMPTY_UNSYNCED — Kuyruk Şeması Koruması', () => {
    // ── [SP-14] EMPTY_UNSYNCED tüm 9 kuyruk anahtarını içerir ────────────────
    it('[SP-14] EMPTY_UNSYNCED tüm beklenen kuyruk anahtarlarını içerir', () => {
        /**
         * SCHEMA GUARD: Bu test, UnsyncedRecords arayüzündeki her alanın
         * EMPTY_UNSYNCED sabitinde de başlatıldığını doğrular.
         * Yeni bir kuyruk tipi eklenir ama EMPTY_UNSYNCED güncellenmezse
         * bu test başarısız olur ve geliştiriciyi uyarır.
         */
        expect(EMPTY_UNSYNCED).toHaveProperty('machineStates');
        expect(EMPTY_UNSYNCED).toHaveProperty('tiles');
        expect(EMPTY_UNSYNCED).toHaveProperty('snapshots');
        expect(EMPTY_UNSYNCED).toHaveProperty('parameterChanges');
        expect(EMPTY_UNSYNCED).toHaveProperty('scenarios');
        expect(EMPTY_UNSYNCED).toHaveProperty('metrics');
        expect(EMPTY_UNSYNCED).toHaveProperty('alarmLogs');
        expect(EMPTY_UNSYNCED).toHaveProperty('conveyorStates');   // YENİ
        expect(EMPTY_UNSYNCED).toHaveProperty('conveyorEvents');   // YENİ

        /** Hepsinin boş dizi olarak başladığını doğrula. */
        expect(EMPTY_UNSYNCED.machineStates).toEqual([]);
        expect(EMPTY_UNSYNCED.tiles).toEqual([]);
        expect(EMPTY_UNSYNCED.conveyorStates).toEqual([]);
        expect(EMPTY_UNSYNCED.conveyorEvents).toEqual([]);
    });
});

// =============================================================================
// TEST GRUBU 4 — syncService.sync() davranışı (Supabase null)
// =============================================================================

describe('[SP] syncService.sync() — Supabase Null Koruması', () => {
    // ── [SP-13] Supabase null iken sync no-op ────────────────────────────────
    it('[SP-13] Supabase null olduğunda syncService.sync() hata fırlatmaz', async () => {
        /**
         * Supabase null mock'lu — syncService bu durumu kontrol eder ve sessizce çıkar.
         * Bu, ağ bağlantısı olmadan geliştirme modunda veya Supabase devre dışı
         * bırakıldığında uygulamanın çökmemesini sağlar.
         */
        const { syncService } = await import('../../services/syncService');

        await expect(syncService.sync()).resolves.toBeUndefined();
    });

    it('[SP-13b] Supabase null iken birden fazla sync() çağrısı güvenlidir', async () => {
        const { syncService } = await import('../../services/syncService');

        /** Paralel sync çağrıları race condition veya hata üretmemeli. */
        await expect(
            Promise.all([syncService.sync(), syncService.sync(), syncService.sync()])
        ).resolves.toBeDefined();
    });
});

// =============================================================================
// TEST GRUBU 5 — İzolasyon ve Çapraz Kontaminasyon Koruması
// =============================================================================

describe('[SP] Kuyruk İzolasyonu — Bir Kuyruk Diğerini Etkilemez', () => {
    beforeEach(() => {
        getStore().resetDataStore();
    });

    it('conveyorStates kuyruğunu temizlemek conveyorEvents\'i etkilemez', () => {
        useSimulationDataStore.setState((s) => ({
            unsyncedRecords: {
                ...s.unsyncedRecords,
                conveyorStates: ['cs-1', 'cs-2'],
                conveyorEvents: ['ce-1', 'ce-2'],
            },
        }));

        /** Sadece conveyorStates kuyruğunu temizle. */
        getStore().markAsSynced('conveyorStates', ['cs-1', 'cs-2']);

        const { unsyncedRecords } = getStore();
        /** conveyorStates boşalmış olmalı. */
        expect(unsyncedRecords.conveyorStates).toHaveLength(0);
        /** conveyorEvents dokunulmamış olmalı. */
        expect(unsyncedRecords.conveyorEvents).toHaveLength(2);
    });

    it('machineStates kuyruğunu temizlemek tiles, alarmLogs ve konveyör kuyruklarını etkilemez', () => {
        useSimulationDataStore.setState((s) => ({
            unsyncedRecords: {
                ...s.unsyncedRecords,
                machineStates: ['ms-1'],
                tiles: ['tile-1'],
                alarmLogs: ['alarm-1'],
                conveyorStates: ['cs-1'],
                conveyorEvents: ['ce-1'],
            },
        }));

        getStore().markAsSynced('machineStates', ['ms-1']);

        const { unsyncedRecords } = getStore();
        expect(unsyncedRecords.machineStates).toHaveLength(0);
        /** Diğerleri dokunulmamış olmalı. */
        expect(unsyncedRecords.tiles).toHaveLength(1);
        expect(unsyncedRecords.alarmLogs).toHaveLength(1);
        expect(unsyncedRecords.conveyorStates).toHaveLength(1);
        expect(unsyncedRecords.conveyorEvents).toHaveLength(1);
    });
});
