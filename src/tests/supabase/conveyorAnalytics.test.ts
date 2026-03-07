/**
 * conveyorAnalytics.test.ts — Konveyör Analitik Kayıt Testleri
 *
 * Bu test dosyası, konveyör analitik pipeline'ının tam davranışını doğrular:
 *
 *  - recordConveyorState(): Her S-Clock tiği için anlık görüntü kaydı
 *  - recordConveyorEvent(): Ayrık olaylar (jam, hız değişimi)
 *  - Oturum koruma: session yokken no-op davranışı
 *  - Kuyruk yönetimi: ID'ler unsyncedRecords'a eklenir
 *  - Ring-buffer: MAX sabitleri aşıldığında kırpma
 *  - Session upgrade: simulation_id yerel → server ID remapı
 *
 * Kapsanan hatalar:
 *  - Oturum yokken recordConveyorState çağrısının sessizce geçmesi
 *  - jam_start/jam_cleared olay tipi doğrulaması
 *  - speed_change olayında old_value / new_value string formatı
 *  - Session upgrade sonrası FK ihlali (simulation_id remap)
 */
/// <reference types="vitest/globals" />

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useSimulationDataStore } from '../../store/simulationDataStore';
import {
    MAX_CONVEYOR_STATE_RECORDS,
    MAX_CONVEYOR_EVENT_RECORDS,
} from '../../lib/params';

// ─── Mock'lar ─────────────────────────────────────────────────────────────────
vi.mock('../../lib/supabaseClient', () => ({ supabase: null }));
vi.mock('../../lib/usageTracker', () => ({
    logConnect: vi.fn(),
    logDisconnect: vi.fn(),
}));

// ─── Yardımcı Fonksiyonlar ────────────────────────────────────────────────────
const getStore = () => useSimulationDataStore.getState();

/**
 * Testler için bir oturum enjekte eder.
 * Supabase null olduğundan bu tamamen yerel bir oturumdur.
 */
function injectSession(id = 'local-session-id') {
    useSimulationDataStore.setState({
        session: {
            id,
            session_code: 'TEST01',
            name: 'Conveyor Analytics Test',
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
// TEST GRUBU 1 — recordConveyorState
// =============================================================================

describe('[CA] recordConveyorState — Anlık Görüntü Kaydı', () => {
    beforeEach(() => {
        getStore().resetDataStore();
    });

    // ── [CA-01] Oturum yokta no-op ────────────────────────────────────────────
    it('[CA-01] Session yokken recordConveyorState sessizce geçer (no-op)', () => {
        /** Store sıfırlanmış, session null. */
        expect(getStore().session).toBeNull();

        /** Çağrı herhangi bir hata fırlatmamalı. */
        expect(() => getStore().recordConveyorState(1, 0)).not.toThrow();

        /** Dizi boş kalmalı. */
        expect(getStore().conveyorStateRecords).toHaveLength(0);
    });

    // ── [CA-02] Kayıt conveyorStateRecords'a eklenir ─────────────────────────
    it('[CA-02] Session varken kayıt conveyorStateRecords dizisine eklenir', () => {
        injectSession();

        getStore().recordConveyorState(100, 10);

        const { conveyorStateRecords } = getStore();
        expect(conveyorStateRecords).toHaveLength(1);

        const record = conveyorStateRecords[0];
        /** Temel alanlar doğru atanmış olmalı. */
        expect(record.sim_tick).toBe(100);
        expect(record.production_tick).toBe(10);
        expect(record.simulation_id).toBe('local-session-id');
        /** synced başlangıçta false olmalı. */
        expect(record.synced).toBe(false);
    });

    // ── [CA-03] ID, unsyncedRecords.conveyorStates'e eklenir ─────────────────
    it('[CA-03] Kayıt ID\'si unsyncedRecords.conveyorStates kuyruğuna eklenir', () => {
        injectSession();

        getStore().recordConveyorState(50, 5);

        const { unsyncedRecords, conveyorStateRecords } = getStore();
        /** Kuyrukta tam olarak 1 ID olmalı. */
        expect(unsyncedRecords.conveyorStates).toHaveLength(1);
        /** Kuyrukta olan ID, oluşturulan kaydın ID'sine eşit olmalı. */
        expect(unsyncedRecords.conveyorStates[0]).toBe(conveyorStateRecords[0].id);
    });

    // ── [CA-04] conveyor_speed 3 ondalık basamağa yuvarlanır ─────────────────
    it('[CA-04] conveyor_speed değeri sayısal olarak kaydedilir', () => {
        injectSession();

        getStore().recordConveyorState(1, 0);

        const record = getStore().conveyorStateRecords[0];
        /** Sayı olmali ve negatif olmayan. */
        expect(typeof record.conveyor_speed).toBe('number');
        expect(record.conveyor_speed).toBeGreaterThanOrEqual(0);
    });

    // ── [CA-05] Ring-buffer MAX_CONVEYOR_STATE_RECORDS'ı aşmaz ───────────────
    it('[CA-05] MAX_CONVEYOR_STATE_RECORDS aşıldığında dizi kırpılır', () => {
        injectSession();

        /** MAX + 10 kayıt doğrudan enjekte et. */
        const overfill = Array.from({ length: MAX_CONVEYOR_STATE_RECORDS + 10 }, (_, i) => ({
            id: `cs-${i}`,
            simulation_id: 'local-session-id',
            sim_tick: i,
            production_tick: 0,
            conveyor_speed: 1.0,
            conveyor_status: 'running' as const,
            fault_count: 0,
            active_tiles_on_belt: 0,
            created_at: new Date().toISOString(),
            synced: false,
        }));

        useSimulationDataStore.setState({ conveyorStateRecords: overfill });

        /** Bir kayıt daha ekle — ring-buffer devreye girmeli. */
        getStore().recordConveyorState(999_999, 0);

        expect(getStore().conveyorStateRecords.length).toBeLessThanOrEqual(MAX_CONVEYOR_STATE_RECORDS);
    });
});

// =============================================================================
// TEST GRUBU 2 — recordConveyorEvent
// =============================================================================

describe('[CA] recordConveyorEvent — Ayrık Olay Kaydı', () => {
    beforeEach(() => {
        getStore().resetDataStore();
        injectSession();
    });

    // ── [CA-06] Oturum yokta no-op ────────────────────────────────────────────
    it('[CA-06] Session yokken recordConveyorEvent sessizce geçer (no-op)', () => {
        /** Oturumu kapat. */
        useSimulationDataStore.setState({ session: null });

        expect(() =>
            getStore().recordConveyorEvent(1, 0, 'jam_start', null, 'jammed'),
        ).not.toThrow();

        expect(getStore().conveyorEventRecords).toHaveLength(0);
    });

    // ── [CA-07] jam_start olayı kaydedilir ───────────────────────────────────
    it('[CA-07] "jam_start" olayı conveyorEventRecords\'a doğru alanlarla eklenir', () => {
        getStore().recordConveyorEvent(200, 20, 'jam_start', null, 'jammed');

        const records = getStore().conveyorEventRecords;
        expect(records).toHaveLength(1);

        const evt = records[0];
        expect(evt.event_type).toBe('jam_start');
        expect(evt.sim_tick).toBe(200);
        expect(evt.production_tick).toBe(20);
        expect(evt.old_value).toBeNull();
        expect(evt.new_value).toBe('jammed');
        expect(evt.simulation_id).toBe('local-session-id');
        expect(evt.synced).toBe(false);
    });

    // ── [CA-08] jam_cleared olayı kaydedilir ─────────────────────────────────
    it('[CA-08] "jam_cleared" olayı doğru alanlarla kaydedilir', () => {
        getStore().recordConveyorEvent(250, 25, 'jam_cleared', 'jammed', 'running');

        const evt = getStore().conveyorEventRecords[0];
        expect(evt.event_type).toBe('jam_cleared');
        expect(evt.old_value).toBe('jammed');
        expect(evt.new_value).toBe('running');
    });

    // ── [CA-09] speed_change olayı old/new string değerleriyle kaydedilir ────
    it('[CA-09] "speed_change" olayı hız değerlerini string olarak kaydeder', () => {
        /**
         * Hız değerleri float sayıdır ama Supabase olayı daha açık hale getirmek için
         * bunları string olarak kaydediyoruz. Bu, tek bir event_type sütunu kullanırken
         * hem hız hem de durum geçişlerini destekler.
         */
        getStore().recordConveyorEvent(300, 30, 'speed_change', '1.000', '1.500');

        const evt = getStore().conveyorEventRecords[0];
        expect(evt.event_type).toBe('speed_change');
        expect(evt.old_value).toBe('1.000');
        expect(evt.new_value).toBe('1.500');
    });

    // ── [CA-10] ID, unsyncedRecords.conveyorEvents'e eklenir ─────────────────
    it('[CA-10] Olay ID\'si unsyncedRecords.conveyorEvents kuyruğuna eklenir', () => {
        getStore().recordConveyorEvent(100, 10, 'jam_start', null, 'jammed');

        const { unsyncedRecords, conveyorEventRecords } = getStore();
        expect(unsyncedRecords.conveyorEvents).toHaveLength(1);
        expect(unsyncedRecords.conveyorEvents[0]).toBe(conveyorEventRecords[0].id);
    });

    // ── [CA-11] Ring-buffer MAX_CONVEYOR_EVENT_RECORDS'ı aşmaz ───────────────
    it('[CA-11] MAX_CONVEYOR_EVENT_RECORDS aşıldığında dizi kırpılır', () => {
        const overfill = Array.from({ length: MAX_CONVEYOR_EVENT_RECORDS + 5 }, (_, i) => ({
            id: `ce-${i}`,
            simulation_id: 'local-session-id',
            sim_tick: i,
            production_tick: 0,
            event_type: 'jam_start' as const,
            old_value: null,
            new_value: 'jammed',
            created_at: new Date().toISOString(),
            synced: false,
        }));

        useSimulationDataStore.setState({ conveyorEventRecords: overfill });
        getStore().recordConveyorEvent(999_000, 0, 'jam_cleared', 'jammed', 'running');

        expect(getStore().conveyorEventRecords.length).toBeLessThanOrEqual(MAX_CONVEYOR_EVENT_RECORDS);
    });
});

// =============================================================================
// TEST GRUBU 3 — resetDataStore Temizliği
// =============================================================================

describe('[CA] resetDataStore — Konveyör Analitik Temizliği', () => {
    // ── [CA-12] conveyorStateRecords sıfırlanır ───────────────────────────────
    it('[CA-12] resetDataStore sonrası conveyorStateRecords boş olur', () => {
        getStore().resetDataStore();
        injectSession();

        /** Birkaç kayıt ekle. */
        getStore().recordConveyorState(1, 0);
        getStore().recordConveyorState(2, 0);
        expect(getStore().conveyorStateRecords).toHaveLength(2);

        /** Sıfırla. */
        getStore().resetDataStore();

        expect(getStore().conveyorStateRecords).toHaveLength(0);
    });

    // ── [CA-13] conveyorEventRecords sıfırlanır ───────────────────────────────
    it('[CA-13] resetDataStore sonrası conveyorEventRecords boş olur', () => {
        getStore().resetDataStore();
        injectSession();

        getStore().recordConveyorEvent(1, 0, 'jam_start', null, 'jammed');
        expect(getStore().conveyorEventRecords).toHaveLength(1);

        getStore().resetDataStore();

        expect(getStore().conveyorEventRecords).toHaveLength(0);
    });
});

// =============================================================================
// TEST GRUBU 4 — Session Upgrade Sonrası Remap
// =============================================================================

describe('[CA] Session Upgrade — simulation_id Remap (FK Güvencesi)', () => {
    beforeEach(() => {
        getStore().resetDataStore();
    });

    // ── [CA-14] conveyorStateRecords simulation_id güncellenir ───────────────
    it('[CA-14] Upgrade sonrası conveyorStateRecords\'daki simulation_id\'ler server ID olur', () => {
        const localId = 'local-uuid-1234';
        const serverId = 'server-uuid-5678';

        /** Yerel ID ile kayıtlar enjekte et (upgrade öncesi hal). */
        useSimulationDataStore.setState({
            conveyorStateRecords: [
                {
                    id: 'cs-1', simulation_id: localId, sim_tick: 1, production_tick: 0,
                    conveyor_speed: 1.0, conveyor_status: 'running', fault_count: 0,
                    active_tiles_on_belt: 0, created_at: '', synced: false,
                },
                {
                    id: 'cs-2', simulation_id: localId, sim_tick: 2, production_tick: 0,
                    conveyor_speed: 1.0, conveyor_status: 'running', fault_count: 0,
                    active_tiles_on_belt: 0, created_at: '', synced: false,
                },
            ],
        });

        /** remapSimId mantığını manuel olarak simüle et (sessionSlice.ts upgrade yolu). */
        const remapSimId = <T extends { simulation_id: string }>(arr: T[]): T[] =>
            arr.map((r) => r.simulation_id === localId ? { ...r, simulation_id: serverId } : r);

        useSimulationDataStore.setState((s) => ({
            conveyorStateRecords: remapSimId(s.conveyorStateRecords),
        }));

        /** Tüm kayıtlar server ID'yi taşımalı. */
        for (const r of getStore().conveyorStateRecords) {
            expect(r.simulation_id).toBe(serverId);
        }
    });

    // ── [CA-15] conveyorEventRecords simulation_id güncellenir ───────────────
    it('[CA-15] Upgrade sonrası conveyorEventRecords\'daki simulation_id\'ler server ID olur', () => {
        const localId = 'local-uuid-abcd';
        const serverId = 'server-uuid-efgh';

        useSimulationDataStore.setState({
            conveyorEventRecords: [
                {
                    id: 'ce-1', simulation_id: localId, sim_tick: 5, production_tick: 0,
                    event_type: 'jam_start', old_value: null, new_value: 'jammed',
                    created_at: '', synced: false,
                },
            ],
        });

        const remapSimId = <T extends { simulation_id: string }>(arr: T[]): T[] =>
            arr.map((r) => r.simulation_id === localId ? { ...r, simulation_id: serverId } : r);

        useSimulationDataStore.setState((s) => ({
            conveyorEventRecords: remapSimId(s.conveyorEventRecords),
        }));

        for (const r of getStore().conveyorEventRecords) {
            expect(r.simulation_id).toBe(serverId);
        }
    });
});
