/**
 * stripFields.test.ts — Supabase'e Gönderilmeden Önce Alan Temizleme Testleri
 *
 * Bu test dosyası, `syncService.ts`'deki `stripFields` yardımcı fonksiyonunun
 * tam davranışını doğrular. Bu fonksiyon, kayıtlar Supabase'e upsert edilmeden
 * önce yerel-only alanları kaldırır.
 *
 * KRİTİK HATA BAĞLAMI:
 *  PostgREST'in `columns=` parametresi, isteğin ilk kaydının tüm anahtarları
 *  üzerinden oluşturulur. Eğer bir anahtar `undefined` değerine sahipse,
 *  PostgREST bu sütunu `columns=` parametresine ekler ama request body'sinde
 *  bulamaz → HTTP 400 Bad Request döner.
 *
 *  Örnek: `{ id: 'x', scenario_id: undefined, synced: false }`
 *  → columns=id,scenario_id,synced
 *  → body sadece 'id' içerir
 *  → 400: "body must contain columns: scenario_id"
 *
 *  Düzeltme: `undefined` değerleri olan anahtarlar da kaldırılır.
 *
 * NOT: stripFields syncService.ts'te private bir fonksiyondur.
 * Aynı algoritmayı burada yeniden uygulayarak kontratı test ediyoruz.
 * Gelecekte util modülüne taşınırsa, doğrudan import edilebilir.
 *
 * Testler:
 *  [SF-01] undefined değerler kaldırılır (PostgREST 400 fix)
 *  [SF-02] null değerler korunur
 *  [SF-03] 0 ve false değerler korunur (falsy ama geçerli DB değerleri)
 *  [SF-04] boş string değerler korunur
 *  [SF-05] 'synced' her zaman kaldırılır
 *  [SF-06] 'station' gibi ekstra alanlar kaldırılır
 *  [SF-07] Birden fazla kayıtta tutarlı davranış
 */
/// <reference types="vitest/globals" />

import { describe, it, expect } from 'vitest';

// ─────────────────────────────────────────────────────────────────────────────
// syncService.ts'teki stripFields algoritmasının yeniden uygulaması.
// Kontratı test etmek için aynı mantığı buraya kopyalıyoruz.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Supabase'e gönderilmeden önce kayıtlardan yerel-only alanları kaldırır.
 *
 * Kaldırılanlar:
 *  - 'synced' (yerel takip bayrağı, DB sütunu değil)
 *  - extraFields ile belirtilen ek alanlar
 *  - undefined değerli anahtarlar (PostgREST 400 hatasını önlemek için)
 *
 * @param records     - Temizlenecek kayıt dizisi
 * @param extraFields - 'synced' dışında kaldırılacak ek alan isimleri
 * @returns Her kaydın temizlenmiş kopyaları
 */
function stripFields<T extends object>(
    records: T[],
    extraFields: string[] = [],
): Record<string, unknown>[] {
    const fieldsToRemove = new Set(['synced', ...extraFields]);
    return records.map((record) => {
        const clean: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(record)) {
            // Yerel-only alanları ve undefined değerleri atla
            if (!fieldsToRemove.has(key) && value !== undefined) {
                clean[key] = value;
            }
        }
        return clean;
    });
}

// =============================================================================
// TESTLER
// =============================================================================

describe('[SF] stripFields — Supabase Kayıt Temizleme', () => {

    // ── [SF-01] undefined değerler kaldırılır ─────────────────────────────────
    it('[SF-01] undefined değerli anahtarlar silinir (PostgREST 400 hata düzeltmesi)', () => {
        /**
         * BAĞLAM: parameterChanges.scenario_id isteğe bağlıdır ve undefined olabilir.
         * PostgREST koleksiyonu için request boyunun bu anahtarı içermesi gerekir
         * ama undefined'ı JSON serialize ettiğinde anahtar body'den düşer.
         * Sonuç: 400 Bad Request.
         *
         * Bu düzeltme, undefined değerli anahtarları da filtereler.
         */
        const records = [
            {
                id: 'pc-1',
                simulation_id: 'sess-1',
                station: 'press',
                parameter_name: 'temperature',
                old_value: 100,
                new_value: 105,
                change_magnitude: 5,
                change_pct: 5,
                change_type: 'drift',
                change_reason: undefined,  // ← Burada problem çıkar
                scenario_id: undefined,    // ← Burada da
                sim_tick: 10,
                production_tick: 1,
                synced: false,
            },
        ];

        const result = stripFields(records);

        /** undefined değerleri olan anahtarlar hiç olmamalı. */
        expect(result[0]).not.toHaveProperty('change_reason');
        expect(result[0]).not.toHaveProperty('scenario_id');
        /** Geçerli alanlar korunmuş olmalı. */
        expect(result[0]).toHaveProperty('id', 'pc-1');
        expect(result[0]).toHaveProperty('old_value', 100);
    });

    // ── [SF-02] null değerler korunur ──────────────────────────────────────────
    it('[SF-02] null değerler korunur (null geçerli bir DB değeridir)', () => {
        /**
         * null, birçok nullable DB sütunu için geçerli bir değerdir.
         * Örn: completed_at, paused_at, old_value (conveyor_events).
         * null'u kaldırmak, DB'de yanlış varsayılan değer yazılmasına neden olur.
         */
        const records = [
            {
                id: 'ce-1',
                old_value: null,     // ← Korunmalı
                new_value: 'jammed',
                synced: false,
            },
        ];

        const result = stripFields(records);

        expect(result[0]).toHaveProperty('old_value', null);
        expect(result[0]).toHaveProperty('new_value', 'jammed');
        expect(result[0]).not.toHaveProperty('synced');
    });

    // ── [SF-03] 0 ve false değerler korunur ──────────────────────────────────
    it('[SF-03] 0 ve false değerler korunur (falsy ama geçerli DB değerleri)', () => {
        /**
         * conveyor_speed = 0 (durmuş bant) ve fault_count = 0 (hata yok) gibi
         * değerler korunmalıdır. Bunları kaldırmak veri kaybına yol açar.
         */
        const records = [
            {
                id: 'cs-1',
                conveyor_speed: 0,       // ← Durmuş bant
                fault_count: 0,          // ← Henüz hata yok
                is_active: false,        // ← Aktif değil
                active_tiles_on_belt: 0, // ← Boş bant
                synced: false,
            },
        ];

        const result = stripFields(records);

        expect(result[0]).toHaveProperty('conveyor_speed', 0);
        expect(result[0]).toHaveProperty('fault_count', 0);
        expect(result[0]).toHaveProperty('is_active', false);
        expect(result[0]).toHaveProperty('active_tiles_on_belt', 0);
    });

    // ── [SF-04] Boş string değerler korunur ──────────────────────────────────
    it('[SF-04] Boş string değerler korunur', () => {
        const records = [{ id: 'rec-1', description: '', synced: false }];
        const result = stripFields(records);
        expect(result[0]).toHaveProperty('description', '');
    });

    // ── [SF-05] 'synced' her zaman kaldırılır ─────────────────────────────────
    it('[SF-05] "synced" alanı her zaman kaldırılır (yerel takip bayrağı)', () => {
        /**
         * 'synced' sadece yerel store'da kullanılan bir bayrak.
         * DB şemasında bu sütun yok. Upsert isteğine dahil edilirse,
         * PostgREST 400 döner: "column 'synced' does not exist".
         */
        const records = [
            { id: 'r-1', value: 42, synced: true },
            { id: 'r-2', value: 99, synced: false },
        ];

        const result = stripFields(records);

        result.forEach((r) => {
            expect(r).not.toHaveProperty('synced');
        });
        expect(result[0]).toHaveProperty('value', 42);
        expect(result[1]).toHaveProperty('value', 99);
    });

    // ── [SF-06] 'station' gibi ekstra alanlar kaldırılır ─────────────────────
    it('[SF-06] "station" ekstra alan olarak belirtildiğinde kaldırılır', () => {
        /**
         * machineStateRecords dizisinde her kayıtta bir 'station' alanı bulunur.
         * Bu alan, syncService'in hangi tabloya yazacağını belirlemek için kullanılır
         * ama DB şemasında bu sütun yoktur (her station ayrı tabloda).
         */
        const records = [
            { id: 'ms-1', simulation_id: 's-1', station: 'press', sim_tick: 1, synced: false },
        ];

        const result = stripFields(records, ['station']);

        expect(result[0]).not.toHaveProperty('station');
        expect(result[0]).not.toHaveProperty('synced');
        expect(result[0]).toHaveProperty('id', 'ms-1');
        expect(result[0]).toHaveProperty('sim_tick', 1);
    });

    // ── [SF-07] Birden fazla kayıtta tutarlı davranış ─────────────────────────
    it('[SF-07] Birden fazla kayıt aynı kurallara göre temizlenir', () => {
        const records = [
            { id: 'r-1', speed: 1.5, extra: undefined, synced: true },
            { id: 'r-2', speed: 0, extra: null, synced: false },
            { id: 'r-3', speed: 2.0, extra: 'value', synced: true },
        ];

        const result = stripFields(records);

        expect(result).toHaveLength(3);

        /** r-1: undefined kaldırılır, synced kaldırılır */
        expect(result[0]).not.toHaveProperty('extra');
        expect(result[0]).not.toHaveProperty('synced');
        expect(result[0]).toHaveProperty('speed', 1.5);

        /** r-2: null korunur, synced kaldırılır */
        expect(result[1]).toHaveProperty('extra', null);
        expect(result[1]).not.toHaveProperty('synced');
        expect(result[1]).toHaveProperty('speed', 0);

        /** r-3: string değer korunur, synced kaldırılır */
        expect(result[2]).toHaveProperty('extra', 'value');
        expect(result[2]).not.toHaveProperty('synced');
        expect(result[2]).toHaveProperty('speed', 2.0);
    });
});
