# 🚀 AntiGravity + Claude Opus 4.6 Implementation Guide
# Ceramic Tile Production Line Simulator - Supabase Integration

> **Model**: Claude Opus 4.6
> **Platform**: AntiGravity
> **Project**: ARDICTECH Ceramic Simulator

---

## 📌 CONTEXT FOR OPUS 4.6

Bu proje ARDICTECH'in seramik karo üretim hattı simülatörüdür. 7 istasyonlu bir konveyör sistemi simüle edilmektedir:

```
PRESS → DRYER → GLAZE → PRINTER → KILN → SORTING → PACKAGING
```

**Mevcut durum**: Simülatör Zustand ile çalışıyor ama henüz:
- Her makine için ayrı state tablosu YOK
- Tile tracking (künye) sistemi YOK  
- Supabase entegrasyonu YOK

**Hedef**: Zustand'ı genişlet + Supabase'e batch sync yap

---

## 🎯 OPUS 4.6 SPECIFIC INSTRUCTIONS

### Kod Yazarken

1. **TypeScript Strict Mode** kullan - tüm type'ları explicit yaz
2. **Zustand subscribeWithSelector** middleware kullan - performans için
3. **Map<K,V>** kullan array yerine - O(1) lookup için
4. **nanoid** kullan UUID generation için - daha kısa, URL-safe

### Dosya Oluştururken

Şu sırayla ilerle:
```
1. src/types/simulator.ts        ← İlk bu (type definitions)
2. src/store/types.ts            ← Zustand-specific types
3. src/lib/supabase.ts           ← Supabase client
4. src/store/simulationStore.ts  ← Ana store (EN BÜYÜK DOSYA)
5. src/services/syncService.ts   ← Batch sync logic
6. src/hooks/useSimulation.ts    ← UI hooks
7. src/components/SimulationRunner.tsx
```

### Hata Yapmamak İçin

```typescript
// ❌ YAPMA - Array kullanma büyük veri setleri için
const machineStates: MachineState[] = [];

// ✅ YAP - Map kullan, simTick key olsun
const machineStates: Map<number, MachineState> = new Map();
```

```typescript
// ❌ YAPMA - Her tick'te Supabase'e yazma
await supabase.from('machine_states').insert(state);

// ✅ YAP - Local state'e yaz, batch sync et
set(s => {
  s.machineStates.press.set(simTick, state);
  s.unsyncedRecords.machineStates.push({ station: 'press', simTick });
});
```

```typescript
// ❌ YAPMA - Sync flag'i unutma
interface TileRecord {
  id: string;
  // ...
}

// ✅ YAP - Her record'da synced flag olmalı
interface TileRecord {
  id: string;
  // ...
  synced: boolean;  // Supabase'e yazıldı mı?
}
```

---

## 📂 IMPLEMENTATION ORDER

### Phase 1: Database Setup (Manuel)

```sql
-- Supabase SQL Editor'da ceramic_simulator_schema.sql dosyasını çalıştır
-- Bu adımı BEN yapacağım, sen sadece hatırlat
```

### Phase 2: Types (Opus 4.6 yapacak)

```typescript
// src/types/simulator.ts - simulator-types.ts dosyasından kopyala
// src/store/types.ts - Zustand record types (aşağıda detay var)
```

### Phase 3: Core Store (Opus 4.6 yapacak)

```typescript
// src/store/simulationStore.ts
// EN KRİTİK DOSYA - ~800 satır olacak
// Aşağıdaki yapıyı takip et
```

### Phase 4: Services (Opus 4.6 yapacak)

```typescript
// src/services/syncService.ts - Batch sync
// src/lib/supabase.ts - Client setup
```

### Phase 5: Integration (Opus 4.6 yapacak)

```typescript
// src/hooks/useSimulation.ts
// src/components/SimulationRunner.tsx
// Mevcut UI component'larını güncelle
```

---

## 🏗️ ZUSTAND STORE STRUCTURE

Opus 4.6, bu yapıyı oluştur:

```typescript
interface SimulationStore {
  // ═══════════════════════════════════════════════════════════
  // SESSION
  // ═══════════════════════════════════════════════════════════
  session: SimulationSession | null;
  sessionCode: string | null;  // 6-digit code: "A3F2B1"
  
  // ═══════════════════════════════════════════════════════════
  // RUNTIME STATE
  // ═══════════════════════════════════════════════════════════
  isRunning: boolean;
  currentSimTick: number;
  currentProductionTick: number;
  
  // ═══════════════════════════════════════════════════════════
  // MACHINE STATE TABLES (Her makine için ayrı Map)
  // Key: simTick, Value: O anki makine durumu
  // ═══════════════════════════════════════════════════════════
  machineStates: {
    press: Map<number, PressStateRecord>;
    dryer: Map<number, DryerStateRecord>;
    glaze: Map<number, GlazeStateRecord>;
    printer: Map<number, PrinterStateRecord>;
    kiln: Map<number, KilnStateRecord>;
    sorting: Map<number, SortingStateRecord>;
    packaging: Map<number, PackagingStateRecord>;
  };
  
  // ═══════════════════════════════════════════════════════════
  // CURRENT LIVE PARAMETERS (UI'da gösterilen anlık değerler)
  // ═══════════════════════════════════════════════════════════
  currentParams: {
    press: PressParameters;
    dryer: DryerParameters;
    glaze: GlazeParameters;
    printer: PrinterParameters;
    kiln: KilnParameters;
    sorting: SortingParameters;
    packaging: PackagingParameters;
  };
  
  // ═══════════════════════════════════════════════════════════
  // TILES & KÜNYE
  // ═══════════════════════════════════════════════════════════
  tiles: Map<string, TileRecord>;
  tilesByNumber: Map<number, string>;  // tile_number → tile_id
  tileSnapshots: Map<string, TileSnapshotRecord[]>;  // tile_id → snapshots
  
  // ═══════════════════════════════════════════════════════════
  // CONVEYOR (Runtime only - DB'ye yazılmaz)
  // ═══════════════════════════════════════════════════════════
  conveyorPositions: Map<string, ConveyorPosition>;
  
  // ═══════════════════════════════════════════════════════════
  // EVENTS & METRICS
  // ═══════════════════════════════════════════════════════════
  parameterChanges: ParameterChangeRecord[];
  activeScenarios: Map<string, ScenarioActivationRecord>;
  metricsHistory: ProductionMetricsRecord[];
  
  // ═══════════════════════════════════════════════════════════
  // SYNC TRACKING
  // ═══════════════════════════════════════════════════════════
  unsyncedRecords: {
    machineStates: Array<{ station: StationName; simTick: number }>;
    tiles: string[];        // tile IDs
    snapshots: string[];    // snapshot IDs
    parameterChanges: string[];
    metrics: string[];
  };
  
  // ═══════════════════════════════════════════════════════════
  // CONFIG
  // ═══════════════════════════════════════════════════════════
  config: {
    tickDurationMs: number;           // Default: 500
    productionTickRatio: number;      // Default: 2
    stationGapProductionTicks: number; // Default: 2
    syncIntervalMs: number;           // Default: 2000
    parameterChangeChance: number;    // Default: 0.02
  };
}
```

---

## 🔄 TICK LOGIC (Her 500ms'de)

```typescript
tick: () => {
  const state = get();
  if (!state.isRunning || !state.session) return;
  
  const newSimTick = state.currentSimTick + 1;
  const newProductionTick = Math.floor(newSimTick / state.config.productionTickRatio);
  
  // ╔═══════════════════════════════════════════════════════════╗
  // ║ 1. TÜM MAKİNELERİN STATE'İNİ KAYDET                       ║
  // ╚═══════════════════════════════════════════════════════════╝
  const machineStateIds: Record<StationName, string> = {};
  for (const station of STATION_ORDER) {
    machineStateIds[station] = recordMachineState(station, newSimTick, newProductionTick);
  }
  
  // ╔═══════════════════════════════════════════════════════════╗
  // ║ 2. YENİ KARO OLUŞTUR (Her production tick'te)             ║
  // ╚═══════════════════════════════════════════════════════════╝
  if (newSimTick % state.config.productionTickRatio === 0) {
    const tile = createTile(newSimTick, newProductionTick);
    recordTileSnapshot(tile.id, 'press', newSimTick, machineStateIds.press);
    addToConveyor(tile.id, newSimTick);
  }
  
  // ╔═══════════════════════════════════════════════════════════╗
  // ║ 3. KONVEYÖR HAREKETİ                                      ║
  // ╚═══════════════════════════════════════════════════════════╝
  moveTilesOnConveyor(newSimTick, newProductionTick, machineStateIds);
  
  // ╔═══════════════════════════════════════════════════════════╗
  // ║ 4. RANDOM PARAMETRE DEĞİŞİKLİKLERİ                        ║
  // ╚═══════════════════════════════════════════════════════════╝
  if (Math.random() < state.config.parameterChangeChance) {
    applyRandomParameterChange();
  }
  
  // ╔═══════════════════════════════════════════════════════════╗
  // ║ 5. SENARYO KONTROLÜ                                       ║
  // ╚═══════════════════════════════════════════════════════════╝
  checkAndActivateScenarios(newSimTick);
  
  // ╔═══════════════════════════════════════════════════════════╗
  // ║ 6. TICK COUNTER GÜNCELLE                                  ║
  // ╚═══════════════════════════════════════════════════════════╝
  set({ currentSimTick: newSimTick, currentProductionTick: newProductionTick });
}
```

---

## 🔗 SYNC SERVICE LOGIC

```typescript
class SyncService {
  private readonly SYNC_INTERVAL_MS = 2000;
  
  async sync() {
    const store = useSimulationStore.getState();
    const unsynced = store.getUnsyncedData();
    
    // Parallel batch inserts
    await Promise.all([
      this.syncMachineStates(unsynced.machineStates),
      this.syncTiles(unsynced.tiles),
      this.syncSnapshots(unsynced.snapshots),
      this.syncParameterChanges(unsynced.parameterChanges),
      this.syncMetrics(unsynced.metrics),
    ]);
    
    // Mark as synced
    store.clearSyncedRecords();
  }
  
  private async syncMachineStates(states: Record<StationName, any[]>) {
    for (const [station, records] of Object.entries(states)) {
      if (records.length === 0) continue;
      
      // synced field'ı çıkar, Supabase'e gönder
      const clean = records.map(({ synced, ...r }) => r);
      await supabase.from(`machine_${station}_states`).insert(clean);
    }
  }
}
```

---

## 📊 KÜNYE (Tile Journey) YAPISI

Her karo konveyörde ilerlerken, her istasyonda o anki makine parametreleri kaydedilir:

```
TILE #00142 Journey:
├── Press    @ tick:100  → pressure: 345 bar, moisture: 6.2%
├── Dryer    @ tick:108  → inlet_temp: 205°C, exit_moisture: 0.9%
├── Glaze    @ tick:116  → viscosity: 28 sec, weight: 415 g/m²
├── Printer  @ tick:124  → active_nozzle: 97%, head_temp: 41°C  ⚠️
├── Kiln     @ tick:132  → max_temp: 1165°C, cooling: 35°C/min
├── Sorting  @ tick:140  → [DEFECT DETECTED: line_defect_print]
└── Final Grade: second_quality
```

Bu data AI'ın root cause analysis yapmasını sağlar:
- "Printer'da nozzle %97'ye düştüğünde line defect oluşmuş"

---

## ⚡ PERFORMANCE TIPS FOR OPUS 4.6

1. **Map.set() kullan, spread kullanma:**
   ```typescript
   // ❌ Yavaş
   set(s => ({ tiles: new Map([...s.tiles, [id, tile]]) }));
   
   // ✅ Hızlı
   set(s => {
     s.tiles.set(id, tile);
     return { tiles: s.tiles };
   });
   ```

2. **Immer kullanma** - Plain objects + Maps daha hızlı

3. **Selector'lar ile subscribe:**
   ```typescript
   // Component sadece press state değişince render olur
   const pressState = useSimulationStore(s => s.currentParams.press);
   ```

4. **Batch state updates:**
   ```typescript
   set({
     currentSimTick: newTick,
     currentProductionTick: newProdTick,
     // ...diğer değişiklikler tek set() içinde
   });
   ```

---

## 🚨 COMMON PITFALLS

1. **Session code'u DB oluşturuyor** - Client'ta generate etme, Supabase'den al

2. **synced flag'i her record'da olmalı** - Yoksa sync logic çalışmaz

3. **Map'leri JSON.stringify edemezsin** - Persist için Array'e çevir

4. **Conveyor positions DB'ye yazılmaz** - Runtime-only state

5. **Metrics her tick değil, periyodik hesaplanır** - Her 100 tick gibi

---

## 🎬 BAŞLANGIÇ KOMUTU

AntiGravity'de şu komutla başla:

```
docs/ klasöründeki 3 dosyayı oku:
1. supabase-implementation-prompt.md
2. ceramic_simulator_schema.sql  
3. simulator-types.ts

Sonra bu dosyayı (ANTIGRAVITY_OPUS_PROMPT.md) oku.

İlk adım olarak src/store/types.ts dosyasını oluştur.
Zustand store için gerekli tüm record type'larını tanımla.
Her record'da synced: boolean field'ı olmalı.
```

---

## ✅ CHECKLIST FOR OPUS 4.6

```
□ src/types/simulator.ts oluşturuldu
□ src/store/types.ts oluşturuldu (synced flag'leri var)
□ src/lib/supabase.ts oluşturuldu
□ src/store/simulationStore.ts oluşturuldu
  □ machineStates 7 Map içeriyor
  □ tiles Map olarak tanımlı
  □ tileSnapshots Map olarak tanımlı
  □ unsyncedRecords tracking var
  □ tick() fonksiyonu complete
  □ recordMachineState() her station için çalışıyor
  □ recordTileSnapshot() künye kaydediyor
□ src/services/syncService.ts oluşturuldu
  □ 2 saniyede bir sync
  □ Batch insert yapıyor
  □ Error handling var
□ src/hooks/useSimulation.ts oluşturuldu
□ src/components/SimulationRunner.tsx oluşturuldu
□ Mevcut UI component'ları yeni store'u kullanıyor
□ Test: Simulation başlatılabiliyor
□ Test: Tile'lar konveyörde hareket ediyor
□ Test: Supabase'de data görünüyor
```

---

## 🔚 FINAL NOTE

Opus 4.6, bu implementation'ı yaparken:
- **Mevcut UI'ı bozma** - Sadece state management değiş
- **Incremental ilerle** - Her dosyayı bitir, test et, sonrakine geç
- **Console.log ekle** - Debug için tick, sync, tile creation logla
- **Error boundary ekle** - Supabase hataları UI'ı çökertmesin
