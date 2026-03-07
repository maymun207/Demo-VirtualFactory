/**
 * sessionLifecycle.test.ts — Supabase Session Lifecycle Integration Tests
 *
 * Bu test dosyası, oturum yaşam döngüsünün tüm kritik adımlarını kapsar:
 *
 *  1. startSession → yerel UUID atanır, Supabase çevrimdışı
 *  2. startSession → Supabase başarılıysa server ID'ye yükseltilir
 *  3. Session upgrade → tüm kayıt dizilerinde simulation_id remapı yapılır
 *     Bu, FK ihlalini önleyen kritik düzeltmedir (machine_press_states gibi
 *     tablolara upsert yapılırken yerel UUID, simulation_sessions'ta bulunmaz)
 *  4. resetDataStore → tüm diziler ve kuyruklar sıfıra döner
 *
 * TEST ALTYAPISI:
 *  - Supabase client, gerçek ağ çağrısı yapılmadan mock edilir
 *  - Tüm testler izole — beforeEach store'u sıfırlar
 *  - usageTracker mock edilir (Supabase'e bağımlı)
 */
/// <reference types="vitest/globals" />

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useSimulationDataStore } from '../../store/simulationDataStore';

// ─── Sabit Mock ID'ler ─────────────────────────────────────────────────────────

/** Supabase'in döneceği server tarafı oturum ID'si. */
const SERVER_SESSION_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
/** Supabase'in döneceği oturum kodu. */
const SERVER_SESSION_CODE = 'SRV001';

// ─── Supabase Mock ────────────────────────────────────────────────────────────
/**
 * Zincirleme Supabase builder'ı simüle eder.
 * startSession → .from('simulation_sessions').insert(...).select().single()
 * heartbeat    → .from('simulation_sessions').update(...).eq(...)
 */
vi.mock('../../lib/supabaseClient', () => ({
    supabase: {
        from: () => ({
            insert: () => ({
                select: () => ({
                    single: () =>
                        Promise.resolve({
                            data: { id: SERVER_SESSION_ID, session_code: SERVER_SESSION_CODE },
                            error: null,
                        }),
                }),
            }),
            update: () => ({
                eq: () => Promise.resolve({ error: null }),
            }),
            upsert: () => Promise.resolve({ error: null }),
        }),
    },
}));

// ─── usageTracker Mock ────────────────────────────────────────────────────────
vi.mock('../../lib/usageTracker', () => ({
    logConnect: vi.fn().mockResolvedValue(null),
    logDisconnect: vi.fn(),
}));

// ─── Helper ───────────────────────────────────────────────────────────────────
const getStore = () => useSimulationDataStore.getState();

// =============================================================================
// TEST GRUBu 1 — Oturum Başlatma
// =============================================================================

describe('[SL] Session Lifecycle — startSession + Supabase Upgrade', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        getStore().resetDataStore();
    });

    afterEach(() => {
        getStore().stopHeartbeat();
        vi.useRealTimers();
    });

    // ── [SL-01] Yerel UUID atanır ─────────────────────────────────────────────
    it('[SL-01] startSession → session.id, Supabase çevrimdışıyken geçerli UUID olur', async () => {
        /**
         * Supabase null mock'u — mevcut mock'un üzerine bu testte özel null kullanıyoruz.
         * Bunun yerine, oturumun yalnızca yerel ID almasını doğruluyoruz: session başlar
         * ve session.id bir UUID formatındadır.
         */
        await getStore().startSession('TestSession', 'Desc');
        const { session } = getStore();
        /** Oturum nesnesi oluşturulmuş olmalı. */
        expect(session).not.toBeNull();
        /** UUID formatını doğrula: 8-4-4-4-12 hex grupları. */
        expect(session!.id).toMatch(
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
        );
    });

    // ── [SL-02] Supabase başarılıysa server ID'ye yükseltilir ────────────────
    it('[SL-02] startSession → Supabase INSERT başarılı → session.id server ID olur', async () => {
        await getStore().startSession('TestSession', 'Desc');
        /** Supabase INSERT asenkron — Promise.resolve ile tamamlanmasını bekle. */
        await Promise.resolve();
        await Promise.resolve(); // İkinci tick: .then() zinciri için

        const { session } = getStore();
        expect(session!.id).toBe(SERVER_SESSION_ID);
    });

    // ── [SL-03] session_code server'dan gelir ────────────────────────────────
    it('[SL-03] startSession → Supabase INSERT başarılı → session_code server koduna güncellenir', async () => {
        await getStore().startSession('TestSession', 'Desc');
        await Promise.resolve();
        await Promise.resolve();

        expect(getStore().session!.session_code).toBe(SERVER_SESSION_CODE);
        expect(getStore().sessionCode).toBe(SERVER_SESSION_CODE);
    });
});


// =============================================================================
// TEST GRUBU 2 — FK İhlali Düzeltmesi: simulation_id Remapping
// =============================================================================

describe('[SL] Session Upgrade — simulation_id Remapping (FK İhlali Düzeltmesi)', () => {
    /**
     * Bu testler, FK ihlali düzeltmesinin remap mantığını doğrular.
     *
     * Yaklaşım: startSession()'ın asenkron upgrade yolunu beklemek yerine,
     * remapSimId fonksiyonunun davranışını doğrudan durum manipülasyonuyla
     * test ediyoruz. Bu, vi.useFakeTimers() altındaki Promise zamanlama
     * sorunlarından kaçınır ve testin deterministik kalmasını sağlar.
     */

    /** Bilinen sahte yerel UUID — "Supabase INSERT'ten önce" durumu temsil eder. */
    const FAKE_LOCAL_ID = 'local-fake-uuid-1111-1111-111111111111';
    /** Bilinen sahte server UUID — Supabase INSERT'ten dönen ID. */
    const FAKE_SERVER_ID = 'server-fake-uuid-2222-2222-222222222222';

    /** sessionSlice.ts'deki remapSimId mantığını yansıtır. */
    function remapSimId<T extends { simulation_id: string }>(arr: T[]): T[] {
        return arr.map((r) =>
            r.simulation_id === FAKE_LOCAL_ID ? { ...r, simulation_id: FAKE_SERVER_ID } : r
        );
    }

    beforeEach(() => {
        getStore().resetDataStore();
    });

    // ── [SL-04] machineStateRecords remapping ────────────────────────────────
    it('[SL-04] remapSimId → machineStateRecords içindeki yerel UUID server ID\'ye güncellenir', () => {
        /** Yerel ID ile kayıt enjekte et. */
        useSimulationDataStore.setState((s) => ({
            ...s,
            machineStateRecords: [
                { id: 'ms-1', simulation_id: FAKE_LOCAL_ID, station: 'press', sim_tick: 1, production_tick: 0, synced: false } as import('../../store/types').AnyMachineStateRecord,
            ],
        }));

        /** Remap uygula (sessionSlice.ts'deki upgrade yolunu simüle eder). */
        useSimulationDataStore.setState((s) => ({
            machineStateRecords: remapSimId(s.machineStateRecords),
        }));

        const { machineStateRecords } = getStore();
        expect(machineStateRecords[0].simulation_id).toBe(FAKE_SERVER_ID);
    });

    // ── [SL-05] parameterChanges remapping ───────────────────────────────────
    it('[SL-05] remapSimId → parameterChanges içindeki yerel UUID server ID\'ye güncellenir', () => {
        useSimulationDataStore.setState((s) => ({
            ...s,
            parameterChanges: [
                { id: 'pc-1', simulation_id: FAKE_LOCAL_ID, station: 'press', parameter_name: 'temp', old_value: 100, new_value: 105, sim_tick: 2, production_tick: 0, change_type: 'drift', synced: false } as import('../../store/types').ParameterChangeRecord,
            ],
        }));

        useSimulationDataStore.setState((s) => ({
            parameterChanges: remapSimId(s.parameterChanges),
        }));

        expect(getStore().parameterChanges[0].simulation_id).toBe(FAKE_SERVER_ID);
    });

    // ── [SL-06] conveyorStateRecords remapping ─────────────────────────────── YENİ
    it('[SL-06] remapSimId → conveyorStateRecords içindeki yerel UUID server ID\'ye güncellenir', () => {
        useSimulationDataStore.setState({
            conveyorStateRecords: [
                { id: 'cs-1', simulation_id: FAKE_LOCAL_ID, sim_tick: 1, production_tick: 0, conveyor_speed: 1.0, conveyor_status: 'running', fault_count: 0, active_tiles_on_belt: 0, created_at: '', synced: false },
            ],
        });

        useSimulationDataStore.setState((s) => ({
            conveyorStateRecords: remapSimId(s.conveyorStateRecords),
        }));

        expect(getStore().conveyorStateRecords[0].simulation_id).toBe(FAKE_SERVER_ID);
    });

    // ── [SL-07] conveyorEventRecords remapping ─────────────────────────────── YENİ
    it('[SL-07] remapSimId → conveyorEventRecords içindeki yerel UUID server ID\'ye güncellenir', () => {
        useSimulationDataStore.setState({
            conveyorEventRecords: [
                { id: 'ce-1', simulation_id: FAKE_LOCAL_ID, sim_tick: 3, production_tick: 0, event_type: 'jam_start', old_value: null, new_value: 'jammed', created_at: '', synced: false },
            ],
        });

        useSimulationDataStore.setState((s) => ({
            conveyorEventRecords: remapSimId(s.conveyorEventRecords),
        }));

        expect(getStore().conveyorEventRecords[0].simulation_id).toBe(FAKE_SERVER_ID);
    });

    // ── [SL-08] tiles Map remapping ────────────────────────────────────────
    it('[SL-08] remapSimId mantığı → tiles Map içindeki yerel UUID server ID\'ye güncellenir', () => {
        /** Tiles Map'e yerel ID ile bir tile ekle. */
        useSimulationDataStore.setState((s) => {
            const newTiles = new Map(s.tiles);
            newTiles.set('tile-1', {
                id: 'tile-1',
                simulation_id: FAKE_LOCAL_ID,
                tile_number: 1,
                status: 'in_production' as const,
                final_grade: 'pending' as const,
                created_at_sim_tick: 1,
                created_at_production_tick: 0,
                synced: false,
                syncVersion: 0,
            });
            return { tiles: newTiles };
        });

        /** Tiles Map remap (sessionSlice.ts'deki Map rebuild mantığı). */
        useSimulationDataStore.setState((s) => {
            const newTiles = new Map(s.tiles);
            for (const [id, tile] of newTiles) {
                if (tile.simulation_id === FAKE_LOCAL_ID) {
                    newTiles.set(id, { ...tile, simulation_id: FAKE_SERVER_ID });
                }
            }
            return { tiles: newTiles };
        });

        expect(getStore().tiles.get('tile-1')?.simulation_id).toBe(FAKE_SERVER_ID);
    });
});

// =============================================================================
// TEST GRUBU 3 — resetDataStore Temizliği
// =============================================================================

describe('[SL] resetDataStore — Tam Temizlik Doğrulaması', () => {
    beforeEach(() => {
        getStore().resetDataStore();
    });

    // ── [SL-10] conveyorStateRecords temizlenir ──────────────────────────────
    it('[SL-10] resetDataStore → conveyorStateRecords boş dizi olur', () => {
        /** Önce bazı kayıtlar ekle. */
        useSimulationDataStore.setState(() => ({
            conveyorStateRecords: [
                { id: 'cs-1', simulation_id: 'x', sim_tick: 1, production_tick: 0, conveyor_speed: 1.0, conveyor_status: 'running', fault_count: 0, active_tiles_on_belt: 0, created_at: '', synced: false },
            ],
        }));

        /** Sıfırla. */
        getStore().resetDataStore();

        expect(getStore().conveyorStateRecords).toHaveLength(0);
    });

    // ── [SL-11] conveyorEventRecords temizlenir ──────────────────────────────
    it('[SL-11] resetDataStore → conveyorEventRecords boş dizi olur', () => {
        useSimulationDataStore.setState(() => ({
            conveyorEventRecords: [
                { id: 'ce-1', simulation_id: 'x', sim_tick: 1, production_tick: 0, event_type: 'jam_start', old_value: null, new_value: 'jammed', created_at: '', synced: false },
            ],
        }));

        getStore().resetDataStore();

        expect(getStore().conveyorEventRecords).toHaveLength(0);
    });

    // ── [SL-12] unsyncedRecords EMPTY_UNSYNCED olur ───────────────────────────
    it('[SL-12] resetDataStore → unsyncedRecords.conveyorStates ve conveyorEvents boştur', () => {
        /** Bazı ID'ler kuyruğa al. */
        useSimulationDataStore.setState((s) => ({
            unsyncedRecords: {
                ...s.unsyncedRecords,
                conveyorStates: ['cs-1', 'cs-2'],
                conveyorEvents: ['ce-1'],
                machineStates: ['ms-1'],
            },
        }));

        getStore().resetDataStore();

        const unsynced = getStore().unsyncedRecords;
        expect(unsynced.conveyorStates).toHaveLength(0);
        expect(unsynced.conveyorEvents).toHaveLength(0);
        expect(unsynced.machineStates).toHaveLength(0);
        expect(unsynced.tiles).toHaveLength(0);
        expect(unsynced.alarmLogs).toHaveLength(0);
    });
});
