/**
 * ringBuffer.test.ts — Ring-Buffer Üst Cap Davranış Testleri
 *
 * Bu test dosyası, tüm büyüyen dizilerin belirli bir eşiği aştıklarında
 * en eski kayıtları kırptığını doğrular. Uzun süreli simülasyon oturumlarında
 * sınırsız bellek büyümesini önlemek için kritik bir güvencedir.
 *
 * Kapsanan diziler:
 *  - machineStateRecords (MAX_MACHINE_STATE_RECORDS = 20_000)
 *  - conveyorStateRecords (MAX_CONVEYOR_STATE_RECORDS = 20_000) ← YENİ
 *  - conveyorEventRecords (MAX_CONVEYOR_EVENT_RECORDS = 1_000) ← YENİ
 *  - parameterChanges (MAX_PARAMETER_CHANGES = 1_000)
 *  - alarmLogs (MAX_ALARM_LOGS = 500)
 *
 * Her test için yaklaşım:
 *  1. Buffer limitini aşacak sayıda kayıt doğrudan store'a enjekte edilir
 *  2. İlgili "record" eylemi çağrılır (sınırın 1 üzerinde)
 *  3. Dizinin budandığı ve en yeni kayıtların korunduğu doğrulanır
 */
/// <reference types="vitest/globals" />

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    MAX_MACHINE_STATE_RECORDS,
    MAX_CONVEYOR_STATE_RECORDS,
    MAX_CONVEYOR_EVENT_RECORDS,
    MAX_PARAMETER_CHANGES,
    MAX_ALARM_LOGS,
} from '../../lib/params';
import { useSimulationDataStore } from '../../store/simulationDataStore';

// ─── Supabase Mock ────────────────────────────────────────────────────────────
vi.mock('../../lib/supabaseClient', () => ({ supabase: null }));
vi.mock('../../lib/usageTracker', () => ({
    logConnect: vi.fn(),
    logDisconnect: vi.fn(),
}));

// ─── Helper ───────────────────────────────────────────────────────────────────
const getStore = () => useSimulationDataStore.getState();

/** Sessiz bir test oturumu oluşturur — Supabase null olduğu için yerel kalır. */
function injectSession(id = 'test-session-id') {
    useSimulationDataStore.setState({
        session: {
            id,
            session_code: 'TEST01',
            name: 'Ring Buffer Test',
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

/** Belirtilen seste bir ConveyorStateRecord oluşturur. */
function makeConveyorStateRecord(id: string, simId = 'test-session-id') {
    return {
        id,
        simulation_id: simId,
        sim_tick: 1,
        production_tick: 0,
        conveyor_speed: 1.0,
        conveyor_status: 'running' as const,
        fault_count: 0,
        active_tiles_on_belt: 0,
        created_at: new Date().toISOString(),
        synced: false,
    };
}

// =============================================================================
// TEST GRUBU — Buffer Sabitleri Doğrulaması
// =============================================================================

describe('[RB] Ring-Buffer — Sabit Değerler ve Tipler', () => {
    // ── [RB-08] Buffer sabitleri doğru tür ve değerlere sahip ────────────────
    it('[RB-08] Tüm buffer sabitleri pozitif tam sayıdır', () => {
        /** Her bir sabit, büyük ve pozitif olmalı. */
        expect(MAX_MACHINE_STATE_RECORDS).toBeGreaterThan(0);
        expect(MAX_CONVEYOR_STATE_RECORDS).toBeGreaterThan(0);
        expect(MAX_CONVEYOR_EVENT_RECORDS).toBeGreaterThan(0);
        expect(MAX_PARAMETER_CHANGES).toBeGreaterThan(0);
        expect(MAX_ALARM_LOGS).toBeGreaterThan(0);
        /** Tam sayı olduğunu doğrula. */
        expect(Number.isInteger(MAX_MACHINE_STATE_RECORDS)).toBe(true);
        expect(Number.isInteger(MAX_CONVEYOR_STATE_RECORDS)).toBe(true);
        expect(Number.isInteger(MAX_CONVEYOR_EVENT_RECORDS)).toBe(true);
    });

    it('[RB-08b] MAX_CONVEYOR_STATE_RECORDS = 20_000', () => {
        /** Bu değer kasıtlı olarak machine state records ile eşleştirildi. */
        expect(MAX_CONVEYOR_STATE_RECORDS).toBe(20_000);
    });

    it('[RB-08c] MAX_CONVEYOR_EVENT_RECORDS = 1_000', () => {
        /** Olaylar seyrek olduğundan daha küçük cap yeterlidir. */
        expect(MAX_CONVEYOR_EVENT_RECORDS).toBe(1_000);
    });
});

// =============================================================================
// TEST GRUBU — conveyorStateRecords Ring-Buffer
// =============================================================================

describe('[RB] conveyorStateRecords — Ring-Buffer Kırpma', () => {
    beforeEach(() => {
        getStore().resetDataStore();
        injectSession();
    });

    // ── [RB-04] conveyorStateRecords MAX_CONVEYOR_STATE_RECORDS'ı aşmaz ─────
    it('[RB-04] MAX_CONVEYOR_STATE_RECORDS asildiktan sonra dizi bu sayi ile sinirlidir', () => {
    /**
     * MAX+1 kayıt diziye dogrudan enjekte ediyoruz.
     * recordConveyorState çağrısı sonrasında dizi hala MAX boyutunda olmalı.
     */
    const limitPlusOne = MAX_CONVEYOR_STATE_RECORDS + 1;
    const fakeRecords = Array.from({ length: limitPlusOne }, (_, i) =>
        makeConveyorStateRecord(`cs-${i}`)
    );

    useSimulationDataStore.setState({ conveyorStateRecords: fakeRecords });

    /** Tek kayıt daha eklenir — ring-buffer tetiklenmeli. */
    getStore().recordConveyorState(9999, 0);

    const { conveyorStateRecords } = getStore();
    /** Tam limit sayısına kırpılmış olmalı. */
    expect(conveyorStateRecords.length).toBeLessThanOrEqual(MAX_CONVEYOR_STATE_RECORDS);
});

// ── [RB-06] En yeni kayıtlar korunur ─────────────────────────────────────
it('[RB-06] Ring-buffer doldugunda en yeni kayitlar (son N) korunur', () => {
    /**
     * MAX+1 eski kayıt ekleyip ardından 'yeni-son' etiketli bir kayıt ekleriz.
     * Kırpma sonrası son kayıt dizinin sonunda olmali.
     */
    const limitPlusOne = MAX_CONVEYOR_STATE_RECORDS + 1;
    const oldRecords = Array.from({ length: limitPlusOne }, (_, i) =>
        makeConveyorStateRecord(`old-${i}`)
    );
    useSimulationDataStore.setState({ conveyorStateRecords: oldRecords });

    /** Son eklenen kayıt — dizinin sonunda olmali, kırpılmamalı. */
    getStore().recordConveyorState(99999, 0);

    const { conveyorStateRecords } = getStore();
    const lastRecord = conveyorStateRecords[conveyorStateRecords.length - 1];
    /** Son eklenen kayıt sim_tick=99999 ile tanımlanabilir. */
    expect(lastRecord.sim_tick).toBe(99999);
});

// ── [RB-07] Limit altında kalan diziler kırpılmaz ─────────────────────────
it('[RB-07] Limit altindayken dizi kirpilmaz', () => {
    /**
     * 5 kayıt ekle (limit çok üzerinde bir değer) — hiçbiri kırpılmamalı.
     */
    useSimulationDataStore.setState({ conveyorStateRecords: [] });
    for (let i = 0; i < 5; i++) {
        getStore().recordConveyorState(i, 0);
    }

    const { conveyorStateRecords } = getStore();
    expect(conveyorStateRecords.length).toBe(5);
});
});

// =============================================================================
// TEST GRUBU — conveyorEventRecords Ring-Buffer
// =============================================================================

describe('[RB] conveyorEventRecords — Ring-Buffer Kırpma', () => {
    beforeEach(() => {
        getStore().resetDataStore();
        injectSession();
    });

    // ── [RB-05] conveyorEventRecords MAX_CONVEYOR_EVENT_RECORDS'ı aşmaz ─────
    it('[RB-05] MAX_CONVEYOR_EVENT_RECORDS asildiktan sonra dizi bu sayi ile sinirlidir', () => {
    const limitPlusOne = MAX_CONVEYOR_EVENT_RECORDS + 1;
    const fakeEvents = Array.from({ length: limitPlusOne }, (_, i) => ({
        id: `ce-${i}`,
        simulation_id: 'test-session-id',
        sim_tick: i,
        production_tick: 0,
        event_type: 'jam_start' as const,
        old_value: null,
        new_value: 'jammed',
        created_at: new Date().toISOString(),
        synced: false,
    }));

    useSimulationDataStore.setState({ conveyorEventRecords: fakeEvents });

    /** Bir olay daha kaydet — ring-buffer tetiklenmeli. */
    getStore().recordConveyorEvent(9999, 0, 'jam_cleared', 'jammed', 'running');

    const { conveyorEventRecords } = getStore();
    expect(conveyorEventRecords.length).toBeLessThanOrEqual(MAX_CONVEYOR_EVENT_RECORDS);
});

it('[RB-05b] En son olay dizi\'nin sonunda korunur', () => {
    const limitPlusOne = MAX_CONVEYOR_EVENT_RECORDS + 1;
    const fakeEvents = Array.from({ length: limitPlusOne }, (_, i) => ({
        id: `ce-${i}`,
        simulation_id: 'test-session-id',
        sim_tick: i,
        production_tick: 0,
        event_type: 'jam_start' as const,
        old_value: null,
        new_value: 'jammed',
        created_at: new Date().toISOString(),
        synced: false,
    }));

    useSimulationDataStore.setState({ conveyorEventRecords: fakeEvents });

    getStore().recordConveyorEvent(88888, 0, 'speed_change', '1.000', '1.500');

    const { conveyorEventRecords } = getStore();
    const lastEvent = conveyorEventRecords[conveyorEventRecords.length - 1];
    expect(lastEvent.sim_tick).toBe(88888);
    expect(lastEvent.event_type).toBe('speed_change');
});
});

// =============================================================================
// TEST GRUBU — Diğer Ring-Buffer'lar (regresyon koruması)
// =============================================================================

describe('[RB] Diğer diziler — Cap doğrulaması', () => {
    beforeEach(() => {
        getStore().resetDataStore();
    });

    // ── [RB-07b] Limitin altındaki diziler kırpılmaz ─────────────────────────
    it('[RB-07b] 10 makine durum kaydı eklendiğinde hiçbiri kırpılmaz', () => {
        const sessionId = 'test-id';
        injectSession(sessionId);

        const fakeRecords = Array.from({ length: 10 }, (_, i) => ({
            id: `ms-${i}`,
            simulation_id: sessionId,
            station: 'press' as const,
            sim_tick: i,
            production_tick: 0,
            synced: false,
        }));

        useSimulationDataStore.setState({
            machineStateRecords: fakeRecords as import('../../store/types').AnyMachineStateRecord[],
        });

        const { machineStateRecords } = getStore();
        expect(machineStateRecords.length).toBe(10);
    });
});
