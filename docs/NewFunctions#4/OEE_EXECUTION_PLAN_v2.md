# OEE Deep Dive — Execution Plan v2

## Virtual Factory Simulator: Machine → Line → Factory OEE

**Date:** 2026-02-28
**Version:** 2.0 — Incorporates scrap routing and energy integration
**Status:** PLAN — Awaiting Approval

---

## 1. THE OEE MODEL

### 1.1 Philosophy: P × Q (not A × P × Q)

Based on the real-world tile factory reference, we adopt the **two-factor model**:

```
MOEE = Performance × Quality
```

**Why no explicit Availability?** In a continuous-flow tile line, when a machine stops, its output count drops to zero — so Performance (actual output / theoretical capacity) automatically absorbs downtime. This is cleaner and more accurate than artificially separating uptime from throughput.

**Why Output/Input for Quality?** Each machine's Q = tiles out / tiles in. This captures tile loss (breakage, jams, scrap) at each station. When chained across a line, intermediate variables cancel out — giving elegant telescoping.

### 1.2 Two Theoretical Rates (Configurable Module)

```
File: src/lib/params/oee.ts — Single source of truth for all OEE constants
```

| Constant | Symbol | Default | Description |
|----------|--------|---------|-------------|
| `PRESS_THEORETICAL_RATE` | **A** | 12 tiles/min | Press design capacity at full speed |
| `KILN_THEORETICAL_RATE` | **B** | 8 tiles/min | Kiln optimum feed rate |

These are isolated in their own params module so they can be fine-tuned independently
without touching calculation logic.

### 1.3 Measurement Variables

```
                    LINE 1                          LINE 3      LINE 2
         ┌──────────────────────────────┐         ┌───────┐  ┌─────────────────────────────┐
         │                              │         │       │  │                             │
    A    │  C       D       E       F   │         │   G   │  │  G     H       I       J   │
  (theo) │(press) (dryer) (glaze) (dig) │         │(conv) │  │(kiln  (kiln  (sort)  (pack) │
    ↓    │  out    out     out     out  │         │ yield │  │ in)    out)           out)  │
         │                              │         │       │  │                             │
  Press →│→ C  → Dryer → D → Glaze → E │→ Dig →  │→ F ──→│→ Kiln → H → Sort → I → Pack →│→ J
         │                          → F │         │   G   │  │                         → J │
         └──────────────────────────────┘         └───────┘  └─────────────────────────────┘
```

### 1.4 Station IN/OUT Counting — Critical Scrap Handling

**Any station can create a scrap tile.** A scrapped tile can be:
- **Path A: Removed from conveyor** — `scrapTile()` is called, tile gets `status: scrapped_at_{station}`, removed from conveyorPositions. Never reaches next station.
- **Path B: Left on conveyor** — tile gets a defect snapshot with `defect_detected: true` but `scrapped_here: false`, continues through to sorting where it's graded scrap.

**Counting rules for each station:**

```
Station INPUT  = tiles that have ANY snapshot at this station
                 (they physically arrived, regardless of what happened next)

Station OUTPUT = tiles that have a snapshot at this station
                 AND scrapped_here = false
                 (they survived this station and moved forward)
```

This handles both scrap paths correctly:
- Path A: scrapped_here = true → NOT counted in output → reduces Q
- Path B: scrapped_here = false, defect detected → counted in output → still alive, loss shows at sorting Q

**Per-station accounting table:**

| Station | IN (arrived) | OUT (survived) | Scrapped Here |
|---------|-------------|----------------|---------------|
| Press | Spawned tiles (= C_in) | C = snapshots where scrapped_here=false | C_in - C |
| Dryer | D_in = tiles with dryer snapshot | D = dryer snaps, scrapped_here=false | D_in - D |
| Glaze | E_in = tiles with glaze snapshot | E = glaze snaps, scrapped_here=false | E_in - E |
| Digital | F_in = tiles with printer snapshot | F = printer snaps, scrapped_here=false | F_in - F |
| Conveyor | F (digital output) | G_clean = tiles reaching kiln w/o damage | F - G_clean |
| Kiln | G = tiles with kiln snapshot | H = kiln snaps, scrapped_here=false | G - H |
| Sorting | H (kiln output) | I = first_quality + second_quality | H - I |
| Packaging | I (sorting usable) | J = packaging snaps, scrapped_here=false | I - J |

**Note on INPUT vs previous station OUTPUT:**

In a perfect line: `Station N input = Station N-1 output`. But if tiles are scrapped
AND removed from conveyor between stations (Path A), there's no snapshot gap because
the scrap happens AT the station (not between stations). So:

```
Dryer IN (D_in) = Press OUT (C)    — tiles that left press arrive at dryer
Glaze IN (E_in) = Dryer OUT (D)    — tiles that left dryer arrive at glaze
```

This means Quality can be computed two equivalent ways:
```
Q_dryer = D / D_in = D / C    (output / input at this station)
                               (which equals output / previous station output)
```

### 1.5 Machine OEE (MOEE) — 8 Machines

| # | Machine | Performance (P) | Quality (Q) | MOEE = P × Q |
|---|---------|-----------------|-------------|--------------|
| 1 | **Press** | C / A | 1.0 (creates tiles) | **C / A** |
| 2 | **Dryer** | D / A | D / C | **(D/A) × (D/C)** |
| 3 | **Glaze** | E / A | E / D | **(E/A) × (E/D)** |
| 4 | **Digital** | F / A | F / E | **(F/A) × (F/E)** |
| 5 | **Conveyor** | 1.0 | G_clean / F | **G_clean / F** |
| 6 | **Kiln** | G / B | H / G | **(G/B) × (H/G)** |
| 7 | **Sorting** | H / B | I / H | **(H/B) × (I/H)** |
| 8 | **Packaging** | I / B | J / I | **(I/B) × (J/I)** |

**Press Q=1.0 rationale:** Press creates tiles from raw material. There's no input
tile stream to compare against. If the press itself creates defective tiles, they
still exit the press and the defect shows up as quality loss at the NEXT station's Q.

**However**, if press scraps a tile (Path A, scrapTile called at press), that tile
is removed from conveyor and never reaches dryer. In that case:
```
Press creates 100 tiles, scraps 5 at press:
  C_in = 100 (spawned), C = 95 (survived press)
  Press Q should reflect this: Q_press = C / C_in = 95/100 = 0.95
```

**Updated Press formula:**
```
  Press P = C_in / A    (spawn rate vs theoretical)
  Press Q = C / C_in    (survived press / spawned)
  MOEE_press = (C_in / A) × (C / C_in) = C / A
```
The result C/A is the same! But we track P and Q separately for diagnostics.

### 1.6 Line OEE (LOEE) — 3 Lines (Telescoping)

**Line 1** (Forming & Finishing): Press → Dryer → Glaze → Digital
```
  LOEE₁ = F / A
  Decomposed: P_line1 = C_in/A,  Q_line1 = F/C_in
  Verify: (C_in/A) × (F/C_in) = F/A  ✓
```

**Line 2** (Firing & Dispatch): Kiln → Sorting → Packaging
```
  LOEE₂ = J / B
  Decomposed: P_line2 = G/B,  Q_line2 = J/G
  Verify: (G/B) × (J/G) = J/B  ✓
```

**Line 3** (Transport): Conveyor
```
  LOEE₃ = G_clean / F
```

### 1.7 Factory OEE (FOEE) — Bottleneck-Anchored

```
FOEE = J / min(A, B) × T

Where T = elapsed simulation minutes
```

Since kiln is typically the bottleneck (B < A): `FOEE ≈ J/B = LOEE₂`
If press becomes constraint (A < B): `FOEE = J/A`

### 1.8 Complete Formula Summary

```
┌──────────────────────────────────────────────────────────────────┐
│  MACHINE OEEs (P × Q per machine)                                │
│  ────────────────────────────────────────────────────────────── │
│  MOEE_press     = (C_in/A) × (C/C_in)     → simplifies to C/A  │
│  MOEE_dryer     = (D/A) × (D/C)                                 │
│  MOEE_glaze     = (E/A) × (E/D)                                 │
│  MOEE_digital   = (F/A) × (F/E)                                 │
│  MOEE_conveyor  = 1.0 × (G_clean/F)       → G_clean/F           │
│  MOEE_kiln      = (G/B) × (H/G)                                 │
│  MOEE_sorting   = (H/B) × (I/H)                                 │
│  MOEE_packaging = (I/B) × (J/I)                                 │
│                                                                  │
│  LINE OEEs (telescoped)                                          │
│  ────────────────────────────────────────────────────────────── │
│  LOEE₁ = F / A          (Line1: Press→Digital)                   │
│  LOEE₂ = J / B          (Line2: Kiln→Packaging)                 │
│  LOEE₃ = G_clean / F    (Line3: Conveyor)                       │
│                                                                  │
│  FACTORY OEE (bottleneck-anchored)                               │
│  ────────────────────────────────────────────────────────────── │
│  FOEE  = J / min(A,B)                                            │
└──────────────────────────────────────────────────────────────────┘
```

---

## 2. ENERGY INTEGRATION

### 2.1 Current Energy Architecture

The existing `calculateEnergy()` in `kpiCalculations.ts` iterates over all 7 stations
and sums total kWh, total gas, and total CO₂. The per-station calculation exists inside
the reduce loop but is NOT exposed individually.

```
Current: calculateEnergy() → { totalKwh, totalGas, totalCO₂ }
Needed:  calculateEnergy() → { totalKwh, totalGas, totalCO₂, perStation: {...} }
```

### 2.2 Per-Station Energy Model

From the uploaded Energy.pdf and `energyConfig.ts`:

| Station | Base kWh | Gas m³ | Speed Sensitive? | Idle Factor |
|---------|----------|--------|------------------|-------------|
| Press | 10 | — | Yes (-20%/+30%) | 15% |
| Dryer | 20 | 30 | No (thermal) | 15% |
| Glaze | 8 | — | Yes (-10%/+15%) | 15% |
| Digital | 20 | — | Yes (-30%/+30%) | 15% |
| Kiln | 100 | 100 | No (thermal) | 80% (furnace stays hot) |
| Sorting | 10 | — | Yes (-50%/+50%) | 15% |
| Packaging | 10 | — | Yes (-50%/+50%) | 15% |

Formula per station (from `energyConfig.ts`):
```
If factory stopped:     consumption = base × idleFactor
If tile NOT present:    consumption = base × speedMultiplier × idleFactor
If tile present:        consumption = base × speedMultiplier
```

Speed multiplier = linear interpolation between minEffect and maxEffect based on
current conveyor speed relative to SPEED_RANGE.

### 2.3 Energy Metrics Per OEE Level

**Per Machine:**
```
energy_per_tile[station] = cumulative_kWh[station] / tiles_processed[station]
energy_efficiency[station] = ideal_energy_per_tile / actual_energy_per_tile × 100%
```

**Per Line:**
```
line_total_kWh = Σ station_kWh for all stations in line
line_energy_per_tile = line_total_kWh / line_output_tiles
```

**Factory:**
```
factory_total_kWh = Σ all station kWh
factory_total_gas = Σ dryer + kiln gas
factory_total_CO₂ = (kWh × 0.4) + (gas × 1.9)
factory_energy_per_tile = factory_total_kWh / J (final output)
```

### 2.4 Energy-Enhanced EnergyResult Interface

```typescript
/** Per-station energy breakdown */
export interface StationEnergy {
  stationId: string;
  kWh: number;
  gas: number;
  co2: number;
  tilesProcessed: number;
  kWhPerTile: number;       // efficiency metric
}

/** Enhanced energy result with per-station granularity */
export interface EnergyResult {
  // Existing global totals (backward compatible)
  totalKwh: number;
  totalGas: number;
  totalCO2: number;
  // NEW: Per-station breakdown
  perStation: Record<string, StationEnergy>;
  // NEW: Per-line energy aggregation
  perLine: {
    line1: { kWh: number; gas: number; co2: number; kWhPerTile: number };
    line2: { kWh: number; gas: number; co2: number; kWhPerTile: number };
    line3: { kWh: number; gas: number; co2: number; kWhPerTile: number };
  };
}
```

### 2.5 Conveyor Energy

The conveyor belt itself doesn't appear in `ENERGY_CONFIG` as a separate entry.
The conveyor's energy is implicit in the belt motor which is part of the global
system. For OEE energy tracking, we have two options:

**Option A (Recommended):** Add a `conveyor` entry to `ENERGY_CONFIG.kwh`:
```typescript
conveyor: { base: 5, minEffect: -0.3, maxEffect: 0.5, idleFactor: 0.1 }
```
The conveyor motor's energy scales strongly with speed and is nearly zero when stopped.

**Option B:** Leave conveyor energy as zero (simplest, less realistic).

---

## 3. IMPLEMENTATION ARCHITECTURE

### 3.1 File Map

```
src/
├── lib/
│   ├── params/
│   │   ├── oee.ts                    ← NEW: Theoretical rates A & B, line defs
│   │   └── index.ts                  ← MODIFY: Re-export oee constants
│   ├── oeeCalculations.ts            ← NEW: Pure OEE calculation functions
│   ├── kpiCalculations.ts            ← MODIFY: Enhance calculateEnergy w/ per-station
│   └── energyConfig.ts               ← VERIFY: No changes needed, already pure
├── store/
│   ├── types.ts                      ← MODIFY: Add OEE types (keep StationName as 7)
│   ├── kpiStore.ts                   ← MODIFY: Add OEE + energy state
│   └── slices/
│       └── tileSlice.ts              ← VERIFY: Confirm IN/OUT counting from snapshots
├── hooks/
│   └── useKPISync.ts                 ← MODIFY: Orchestrate OEE + enhanced energy
├── components/ui/
│   └── OEEPanel.tsx                  ← NEW: Hierarchical OEE + energy display
├── services/
│   └── syncService.ts                ← MODIFY: Sync OEE + energy metrics to Supabase
└── __tests__/
    └── oeeCalculations.test.ts       ← NEW: Comprehensive OEE tests
```

### 3.2 Dependency Flow

```
params/oee.ts + params/energy.ts (constants)
       ↓              ↓
oeeCalculations.ts   kpiCalculations.ts (enhanced)
       ↓              ↓
       └──────┬───────┘
              ↓
        useKPISync.ts (orchestration)
         ↙        ↘
  kpiStore.ts    syncService.ts
       ↓
  OEEPanel.tsx (display)
```

### 3.3 Key Design Decision: OEEMachineId (Not StationName)

```typescript
// StationName stays as 7 stations (no changes to existing code)
export type StationName = 'press' | 'dryer' | 'glaze' | 'printer' | 'kiln' | 'sorting' | 'packaging';

// OEEMachineId adds conveyor for OEE calculations only
export type OEEMachineId = StationName | 'conveyor';
```

This isolates the OEE system from existing station-based code.

---

## 4. PHASE-BY-PHASE IMPLEMENTATION

### PHASE 0: Types & Constants

**File: `src/lib/params/oee.ts`** (NEW — configurable module for all OEE constants)

```typescript
/**
 * oee.ts — OEE Configuration Constants
 *
 * SINGLE SOURCE OF TRUTH for all OEE-related constants.
 * Isolated module for clean fine-tuning without touching calculation logic.
 *
 * Theoretical rates represent "what the machine SHOULD produce per minute
 * if running at design capacity with zero losses."
 */

// ═══════════════════════════════════════════════════════════════
// THEORETICAL RATES — The two capacity benchmarks
// ═══════════════════════════════════════════════════════════════

/** Press design capacity (tiles per minute at full speed, no stops).
 *  Derived from: press cycle_time_sec range 4-8 sec → 7.5-15 tiles/min.
 *  Set to 12 as representative of normal operation (~5 sec cycle). */
export const PRESS_THEORETICAL_RATE = 12;

/** Kiln optimum feed rate (tiles per minute at ideal throughput).
 *  Kiln is the natural bottleneck in ceramic manufacturing.
 *  Set to ~67% of press rate, matching real-world kiln/press ratio. */
export const KILN_THEORETICAL_RATE = 8;

// ═══════════════════════════════════════════════════════════════
// LINE DEFINITIONS — Which machines belong to which line
// ═══════════════════════════════════════════════════════════════

export const LINE_DEFINITIONS = {
  line1: {
    id: 'line1' as const,
    name: { tr: 'Hat 1 — Şekillendirme & Baskı', en: 'Line 1 — Forming & Finishing' },
    stations: ['press', 'dryer', 'glaze', 'printer'] as const,
    theoreticalRateSymbol: 'A' as const,
    theoreticalRate: 12,   // references PRESS_THEORETICAL_RATE
  },
  line2: {
    id: 'line2' as const,
    name: { tr: 'Hat 2 — Pişirme & Sevkiyat', en: 'Line 2 — Firing & Dispatch' },
    stations: ['kiln', 'sorting', 'packaging'] as const,
    theoreticalRateSymbol: 'B' as const,
    theoreticalRate: 8,    // references KILN_THEORETICAL_RATE
  },
  line3: {
    id: 'line3' as const,
    name: { tr: 'Hat 3 — Konveyör', en: 'Line 3 — Conveyor' },
    stations: ['conveyor'] as const,
    theoreticalRateSymbol: null,
    theoreticalRate: null,  // yield-only, no theoretical rate
  },
} as const;

export type LineId = keyof typeof LINE_DEFINITIONS;

// ═══════════════════════════════════════════════════════════════
// OEE MACHINE ORDER — All 8 machines for OEE tracking
// ═══════════════════════════════════════════════════════════════

export const OEE_MACHINE_ORDER = [
  'press', 'dryer', 'glaze', 'printer',
  'conveyor',
  'kiln', 'sorting', 'packaging',
] as const;

export type OEEMachineId = (typeof OEE_MACHINE_ORDER)[number];

// ═══════════════════════════════════════════════════════════════
// OEE DISPLAY THRESHOLDS — Color coding for the UI panel
// ═══════════════════════════════════════════════════════════════

/** OEE ≥ this → green (world-class) */
export const OEE_THRESHOLD_GOOD = 85;
/** OEE ≥ this → yellow (acceptable), below → red (needs attention) */
export const OEE_THRESHOLD_WARNING = 65;

// ═══════════════════════════════════════════════════════════════
// CONVEYOR ENERGY — Belt motor consumption (new entry for ENERGY_CONFIG)
// ═══════════════════════════════════════════════════════════════

/** Conveyor belt motor energy parameters.
 *  Strongly speed-dependent (motor works harder at higher speeds).
 *  Nearly zero when stopped. */
export const CONVEYOR_ENERGY_KWH = {
  base: 5,
  minEffect: -0.3,
  maxEffect: 0.5,
  idleFactor: 0.1,
} as const;
```

**File: `src/store/types.ts`** (MODIFY — add OEE types, keep StationName unchanged)

```typescript
// ═════════════════════════════════════════════════════════════
// OEE TYPES (added at end of types.ts)
// ═════════════════════════════════════════════════════════════

import type { OEEMachineId, LineId } from '../lib/params/oee';

/** Per-station tile IN/OUT counts (A-J variables from real factory model) */
export interface StationCounts {
  /** Tiles spawned at press (C_in — press input) */
  pressSpawned: number;
  /** C: Tiles that exited press (scrapped_here=false) */
  pressOutput: number;
  /** D: Tiles that exited dryer (scrapped_here=false) */
  dryerOutput: number;
  /** E: Tiles that exited glaze (scrapped_here=false) */
  glazeOutput: number;
  /** F: Tiles that exited digital printer (scrapped_here=false) */
  digitalOutput: number;
  /** G: Tiles that reached kiln (any kiln snapshot = they arrived) */
  kilnInput: number;
  /** G_clean: Tiles that transited conveyor without jam damage */
  conveyorCleanOutput: number;
  /** H: Tiles that exited kiln (scrapped_here=false) */
  kilnOutput: number;
  /** I: First quality + second quality (usable output from sorting) */
  sortingUsableOutput: number;
  /** J: Tiles that exited packaging (scrapped_here=false) */
  packagingOutput: number;
  /** A: Press theoretical output for elapsed time */
  theoreticalA: number;
  /** B: Kiln theoretical output for elapsed time */
  theoreticalB: number;
  /** Elapsed simulation minutes (for rate calculations) */
  elapsedMinutes: number;

  /** Per-station detailed IN/OUT for diagnostics display */
  perStation: Record<string, { in: number; out: number; scrappedHere: number }>;
}

/** Per-machine OEE breakdown */
export interface MachineOEE {
  machineId: OEEMachineId;
  name: { tr: string; en: string };
  performance: number;       // P component (0-1)
  quality: number;           // Q component (0-1)
  oee: number;               // P × Q × 100 (0-100 percentage)
  actualInput: number;       // tiles IN to this machine
  actualOutput: number;      // tiles OUT from this machine
  scrappedHere: number;      // tiles lost at this machine
}

/** Per-station energy consumption */
export interface StationEnergy {
  stationId: string;
  kWh: number;               // cumulative electrical consumption
  gas: number;               // cumulative gas consumption
  co2: number;               // derived CO₂
  tilesProcessed: number;    // tiles that passed through
  kWhPerTile: number;        // energy efficiency metric
}

/** Per-line OEE + energy result */
export interface LineOEE {
  lineId: LineId;
  name: { tr: string; en: string };
  performance: number;       // line-level P
  quality: number;           // line-level Q
  oee: number;               // 0-100 percentage
  machines: MachineOEE[];    // constituent machine OEEs
  /** Energy aggregation for this line */
  energy: {
    totalKwh: number;
    totalGas: number;
    totalCo2: number;
    kWhPerTile: number;      // line total kWh / line output tiles
  };
}

/** Factory-level OEE + energy */
export interface FactoryOEE {
  oee: number;               // 0-100 percentage
  bottleneck: 'A' | 'B';    // which theoretical rate is constraining
  bottleneckRate: number;    // min(A, B) × elapsed time
  finalOutput: number;       // J (packaging output)
  lines: LineOEE[];          // all 3 line OEEs
  /** Factory energy totals */
  energy: {
    totalKwh: number;
    totalGas: number;
    totalCo2: number;
    kWhPerTile: number;      // factory kWh / J
    perStation: Record<string, StationEnergy>;
  };
}
```

---

### PHASE 1: Enhanced Energy Calculation

**File: `src/lib/kpiCalculations.ts`** (MODIFY — break out per-station energy)

The `calculateEnergy()` function currently uses `reduce()` to sum across stations.
We modify it to also return per-station values:

```typescript
/** Enhanced energy result with per-station breakdown */
export interface EnergyResult {
  totalKwh: number;
  totalGas: number;
  totalCO2: number;
  /** NEW: Per-station energy breakdown */
  perStation: Record<string, { kWh: number; gas: number; co2: number }>;
}

export const calculateEnergy = (
  conveyorSpeed: number,
  partPositions: number[],
  isRunning: boolean,
  scenarioEnergyMultiplier: number = 1.0,
): EnergyResult => {
  const checkOccupancy = (stageIdx: number) =>
    partPositions.some(t => Math.abs(t - STATION_STAGES[stageIdx]) < SNAPSHOT_TOLERANCE);

  const machineStates: Record<string, boolean> = {
    press: isRunning,
    dryer: checkOccupancy(1),
    glaze: checkOccupancy(2),
    digital: checkOccupancy(3),
    kiln: checkOccupancy(4),
    sorting: checkOccupancy(5),
    packaging: checkOccupancy(6),
  };

  // NEW: Build per-station breakdown
  const perStation: Record<string, { kWh: number; gas: number; co2: number }> = {};

  let totalKwh = 0;
  for (const [id, params] of Object.entries(ENERGY_CONFIG.kwh)) {
    const stationKwh = calculateConsumption(params, conveyorSpeed, machineStates[id], isRunning)
                       * scenarioEnergyMultiplier;
    totalKwh += stationKwh;
    perStation[id] = { kWh: stationKwh, gas: 0, co2: stationKwh * CO2_FACTOR_ELECTRIC };
  }

  // Add conveyor energy (new entry)
  const conveyorKwh = calculateConsumption(
    CONVEYOR_ENERGY_KWH, conveyorSpeed, isRunning, isRunning
  ) * scenarioEnergyMultiplier;
  totalKwh += conveyorKwh;
  perStation['conveyor'] = { kWh: conveyorKwh, gas: 0, co2: conveyorKwh * CO2_FACTOR_ELECTRIC };

  let totalGas = 0;
  for (const [id, params] of Object.entries(ENERGY_CONFIG.gas)) {
    const stationGas = calculateConsumption(params, conveyorSpeed, machineStates[id], isRunning)
                       * scenarioEnergyMultiplier;
    totalGas += stationGas;
    perStation[id].gas = stationGas;
    perStation[id].co2 += stationGas * CO2_FACTOR_GAS;
  }

  const totalCO2 = (totalKwh * CO2_FACTOR_ELECTRIC) + (totalGas * CO2_FACTOR_GAS);
  return { totalKwh, totalGas, totalCO2, perStation };
};
```

**File: `src/lib/params/energy.ts`** (MODIFY — add conveyor to ENERGY_CONFIG)

```typescript
import { CONVEYOR_ENERGY_KWH } from './oee';

// Add to ENERGY_CONFIG.kwh:
export const ENERGY_CONFIG = {
  kwh: {
    press:     { base: 10,  minEffect: -0.2, maxEffect: 0.3,  idleFactor: 0.15 },
    dryer:     { base: 20,  minEffect: 0,    maxEffect: 0,    idleFactor: 0.15 },
    glaze:     { base: 8,   minEffect: -0.1, maxEffect: 0.15, idleFactor: 0.15 },
    digital:   { base: 20,  minEffect: -0.3, maxEffect: 0.3,  idleFactor: 0.15 },
    kiln:      { base: 100, minEffect: 0,    maxEffect: 0,    idleFactor: 0.8  },
    sorting:   { base: 10,  minEffect: -0.5, maxEffect: 0.5,  idleFactor: 0.15 },
    packaging: { base: 10,  minEffect: -0.5, maxEffect: 0.5,  idleFactor: 0.15 },
    conveyor:  CONVEYOR_ENERGY_KWH,  // ← NEW
  },
  gas: {
    dryer:  { base: 30,  minEffect: 0, maxEffect: 0, idleFactor: 0.15 },
    kiln:   { base: 100, minEffect: 0, maxEffect: 0, idleFactor: 0.8  },
  },
};
```

---

### PHASE 2: Tile Counting Engine

**File: `src/lib/oeeCalculations.ts`** (NEW — pure functions, zero store imports)

```typescript
/**
 * oeeCalculations.ts — Hierarchical OEE Calculation Engine
 *
 * Implements real-world tile factory OEE methodology:
 *   MOEE = P × Q per machine (8 machines)
 *   LOEE = telescoped across line stations (3 lines)
 *   FOEE = bottleneck-anchored J / min(A,B) (1 factory)
 *
 * Plus per-machine / per-line / factory energy aggregation.
 *
 * ALL FUNCTIONS ARE PURE — no store imports, no side effects.
 * Receives all data through function arguments.
 */

// countStationExits():
//   Single-pass iteration over tileSnapshots Map.
//   For each tile, for each snapshot:
//     - Increment station IN count (tile arrived at this station)
//     - If scrapped_here=false: increment station OUT count
//     - Track conveyor damage via defect_types
//   O(n × k) where n = tile count, k = avg snapshots per tile

// calculateAllMOEEs():
//   Takes StationCounts → returns MachineOEE[8]
//   Each machine: P = output / theoretical, Q = output / input
//   Safe division (returns 0 when denominator is 0)

// calculateAllLOEEs():
//   Takes StationCounts + MachineOEE[] + perStationEnergy
//   Line 1: OEE = F/A, Energy = Σ(press+dryer+glaze+digital)
//   Line 2: OEE = J/B, Energy = Σ(kiln+sorting+packaging)
//   Line 3: OEE = G_clean/F, Energy = conveyor

// calculateFOEE():
//   Takes StationCounts + LineOEE[]
//   FOEE = J / min(theoreticalA, theoreticalB)
//   Bottleneck = 'A' or 'B' depending on which is smaller
//   Factory energy = Σ all station energy
```

**Detailed countStationExits implementation:**

```typescript
export function countStationExits(
  tileSnapshots: Map<string, TileSnapshotRecord[]>,
  totalFirstQuality: number,
  totalSecondQuality: number,
  elapsedSimMinutes: number,
): StationCounts {
  // Per-station IN/OUT/scrapped tracking
  const stationStats: Record<string, { in: number; out: number; scrappedHere: number }> = {
    press: { in: 0, out: 0, scrappedHere: 0 },
    dryer: { in: 0, out: 0, scrappedHere: 0 },
    glaze: { in: 0, out: 0, scrappedHere: 0 },
    printer: { in: 0, out: 0, scrappedHere: 0 },
    kiln: { in: 0, out: 0, scrappedHere: 0 },
    sorting: { in: 0, out: 0, scrappedHere: 0 },
    packaging: { in: 0, out: 0, scrappedHere: 0 },
  };

  let conveyorCleanOutput = 0;

  for (const [, snapshots] of tileSnapshots) {
    let hasConveyorDamage = false;
    let exitedDigital = false;
    let reachedKiln = false;

    // First pass: detect conveyor damage across ALL snapshots
    for (const snap of snapshots) {
      if (snap.defect_detected &&
          snap.defect_types?.includes('conveyor_jam_damage' as any)) {
        hasConveyorDamage = true;
      }
    }

    // Second pass: count station IN/OUT
    for (const snap of snapshots) {
      const station = snap.station;
      if (stationStats[station]) {
        // IN: tile arrived at this station (has a snapshot)
        stationStats[station].in++;

        if (snap.scrapped_here) {
          // Tile was scrapped AND removed at this station
          stationStats[station].scrappedHere++;
        } else {
          // Tile survived this station
          stationStats[station].out++;

          if (station === 'printer') exitedDigital = true;
        }
      }
      if (station === 'kiln') reachedKiln = true;
    }

    // Conveyor clean = exited digital AND reached kiln AND no jam damage
    if (exitedDigital && reachedKiln && !hasConveyorDamage) {
      conveyorCleanOutput++;
    }
  }

  return {
    pressSpawned: stationStats.press.in,
    pressOutput: stationStats.press.out,
    dryerOutput: stationStats.dryer.out,
    glazeOutput: stationStats.glaze.out,
    digitalOutput: stationStats.printer.out,
    kilnInput: stationStats.kiln.in,      // G = tiles that reached kiln
    conveyorCleanOutput,
    kilnOutput: stationStats.kiln.out,
    sortingUsableOutput: totalFirstQuality + totalSecondQuality,
    packagingOutput: stationStats.packaging.out,
    theoreticalA: PRESS_THEORETICAL_RATE * elapsedSimMinutes,
    theoreticalB: KILN_THEORETICAL_RATE * elapsedSimMinutes,
    elapsedMinutes: elapsedSimMinutes,
    perStation: stationStats,
  };
}
```

---

### PHASE 3: Store Integration

**File: `src/store/kpiStore.ts`** (MODIFY — add OEE + energy state)

```typescript
interface KPIState {
  // ── Existing (unchanged) ──
  kpis: KPI[];
  defects: Defect[];
  kpiHistory: KPIHistoryRecord[];
  resetKPIs: () => void;

  // ── NEW: OEE hierarchy ──
  factoryOEE: FactoryOEE | null;
  stationCounts: StationCounts | null;

  // ── NEW: Cumulative per-station energy ──
  cumulativeStationEnergy: Record<string, { kWh: number; gas: number; co2: number }>;

  resetOEE: () => void;
}
```

The `cumulativeStationEnergy` accumulates per-station energy across all ticks.
On each S-Clock tick, the per-station values from `calculateEnergy()` are ADDED
to the cumulative totals. This gives us total energy consumed per station since
simulation start — needed for kWhPerTile calculations.

---

### PHASE 4: Hook Orchestration

**File: `src/hooks/useKPISync.ts`** (MODIFY — add OEE + energy pipeline)

```
In the existing S-Clock subscription callback, AFTER current KPI calculations:

1. Calculate per-station energy (enhanced calculateEnergy)
2. Accumulate per-station energy in kpiStore.cumulativeStationEnergy
3. Count station exits from tileSnapshots
4. Calculate all 8 MOEEs
5. Calculate all 3 LOEEs (with per-line energy from cumulative data)
6. Calculate FOEE (with factory energy totals)
7. Update legacy OEE KPI card with FOEE value
8. Push factoryOEE to kpiStore
```

**Elapsed time calculation (simulation clock):**
```typescript
const elapsedSimMinutes = sClockCount * DEFAULT_S_CLOCK_PERIOD / 60000;
```

---

### PHASE 5: Legacy OEE Transition

**File: `src/lib/kpiCalculations.ts`** (MODIFY)

```
- Mark calculateOEE() as @deprecated
- Keep it for fallback but useKPISync will use foee.oee for the KPI card
- Remove these constants from OEE path (may keep for other uses):
    AVAILABILITY_FACTOR
    DESIGN_SPEED
    JAM_AVAILABILITY_PENALTY
    JAM_MAX_AVAILABILITY_PENALTY
```

---

### PHASE 6: OEE Display Panel

**File: `src/components/ui/OEEPanel.tsx`** (NEW)

Three-tab panel: Machine / Line / Factory views.

```
┌────────────────────────────────────────────────────────────────┐
│  OEE Dashboard                                    [M][L][F]   │
│────────────────────────────────────────────────────────────────│
│                                                                │
│  [M] Machine View                                              │
│  ┌───────────┬───────┬───────┬───────┬────────┬──────────────┐│
│  │ Machine   │   P   │   Q   │  OEE  │ kWh/tile│  In→Out     ││
│  ├───────────┼───────┼───────┼───────┼────────┼──────────────┤│
│  │ Press     │ 92.3% │  100% │ 92.3% │  1.2   │ 100→100     ││
│  │ Dryer     │ 88.1% │ 97.2% │ 85.6% │  2.4   │ 100→97      ││
│  │ Glaze     │ 85.4% │ 98.1% │ 83.8% │  0.9   │  97→95      ││
│  │ Digital   │ 82.7% │ 96.5% │ 79.8% │  2.3   │  95→92      ││
│  │ Conveyor  │   —   │ 95.0% │ 95.0% │  0.6   │  92→87      ││
│  │ Kiln      │ 78.2% │ 94.8% │ 74.1% │ 12.1   │  87→83      ││
│  │ Sorting   │ 72.3% │ 91.2% │ 65.9% │  1.1   │  83→76      ││
│  │ Packaging │ 68.5% │ 99.1% │ 67.9% │  1.1   │  76→75      ││
│  └───────────┴───────┴───────┴───────┴────────┴──────────────┘│
│                                                                │
│  [L] Line View                                                 │
│  ┌──────────────────────┬───────┬───────┬───────┬────────────┐│
│  │ Line                 │   P   │   Q   │  OEE  │ Energy     ││
│  ├──────────────────────┼───────┼───────┼───────┼────────────┤│
│  │ Line 1 (Forming)     │ 92.3% │ 86.5% │ 79.8% │ 58kWh     ││
│  │ Line 2 (Firing)      │ 78.2% │ 86.9% │ 67.9% │ 120kWh    ││
│  │ Line 3 (Conveyor)    │   —   │ 95.0% │ 95.0% │ 5kWh      ││
│  └──────────────────────┴───────┴───────┴───────┴────────────┘│
│                                                                │
│  [F] Factory View                                              │
│  ┌─────────────────────────────────────────────────────────── ┐│
│  │  ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐ ││
│  │  │  FOEE       │  │  Bottleneck  │  │  Energy          │ ││
│  │  │  67.9%      │  │  Kiln (B)    │  │  183 kWh total   │ ││
│  │  │             │  │  8 tiles/min │  │  2.4 kWh/tile    │ ││
│  │  └─────────────┘  └──────────────┘  └──────────────────┘ ││
│  │  Output: 75 tiles    Loss: 25 tiles (across all stations) ││
│  └────────────────────────────────────────────────────────────┘│
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

- Glassmorphism dark theme matching existing panels
- OEE color coding: green (≥85%), yellow (65-84%), red (<65%)
- kWh/tile shows energy efficiency per machine
- In→Out column shows tile flow loss at each station
- Bilingual labels (tr/en) via useTranslation

---

### PHASE 7: CWF Agent Integration

**File: `src/lib/params/cwfAgent.ts`** (MODIFY)

Add to CWF system prompt:

```
OEE SYSTEM:
The factory uses a hierarchical OEE model based on real-world tile manufacturing:
- 8 Machine OEEs (MOEE): Each = Performance × Quality
  - Performance = actual output / theoretical capacity
  - Quality = output / input (yield per machine)
- 3 Line OEEs (LOEE):
  - Line 1 (Press→Digital): F/A
  - Line 2 (Kiln→Packaging): J/B (≈ real-world Factory OEE)
  - Line 3 (Conveyor): G_clean/F
- Factory OEE (FOEE): J / min(A,B), bottleneck-anchored

Two theoretical rates: A (press=12/min), B (kiln=8/min).
Kiln is typically the bottleneck.

When diagnosing: trace FOEE → worst LOEE → worst MOEE → that machine's P vs Q.
If P is low: machine is slow or starved. If Q is low: machine is creating defects.

Energy is tracked per machine (kWh/tile), per line, and factory total.
Kiln dominates energy (100 kWh base + 100 m³ gas). Watch kWh/tile for efficiency.
```

---

### PHASE 8: Supabase Persistence

**New migration: `supabase/migrations/xxx_oee_snapshots.sql`**

```sql
CREATE TABLE oee_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  simulation_id UUID NOT NULL REFERENCES simulation_sessions(id),
  sim_tick INTEGER NOT NULL,
  elapsed_minutes NUMERIC NOT NULL,

  -- Station counts (A-J variables)
  theoretical_a NUMERIC,
  theoretical_b NUMERIC,
  press_spawned INTEGER,
  press_output INTEGER,
  dryer_output INTEGER,
  glaze_output INTEGER,
  digital_output INTEGER,
  kiln_input INTEGER,
  kiln_output INTEGER,
  sorting_usable_output INTEGER,
  packaging_output INTEGER,
  conveyor_clean_output INTEGER,

  -- Machine OEEs (0-100 scale)
  moee_press NUMERIC,
  moee_dryer NUMERIC,
  moee_glaze NUMERIC,
  moee_digital NUMERIC,
  moee_conveyor NUMERIC,
  moee_kiln NUMERIC,
  moee_sorting NUMERIC,
  moee_packaging NUMERIC,

  -- Line OEEs
  loee_line1 NUMERIC,
  loee_line2 NUMERIC,
  loee_line3 NUMERIC,

  -- Factory OEE
  foee NUMERIC,
  bottleneck CHAR(1),  -- 'A' or 'B'

  -- Per-station energy (cumulative at this tick)
  energy_press_kwh NUMERIC,
  energy_dryer_kwh NUMERIC,
  energy_glaze_kwh NUMERIC,
  energy_digital_kwh NUMERIC,
  energy_conveyor_kwh NUMERIC,
  energy_kiln_kwh NUMERIC,
  energy_sorting_kwh NUMERIC,
  energy_packaging_kwh NUMERIC,
  energy_dryer_gas NUMERIC,
  energy_kiln_gas NUMERIC,
  energy_total_kwh NUMERIC,
  energy_total_gas NUMERIC,
  energy_total_co2 NUMERIC,
  energy_kwh_per_tile NUMERIC,

  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_oee_snapshots_sim ON oee_snapshots(simulation_id, sim_tick);
```

---

## 5. IMPLEMENTATION ORDER & DEPENDENCIES

```
PHASE 0 ──→ PHASE 1 ──→ PHASE 2 ──→ PHASE 3 ──→ PHASE 4 ──→ PHASE 5
(Types &    (Energy     (Tile       (Store      (Hook       (Legacy
 Constants)  Enhance)    Counting)   Integrate)  Orchestrate) Cleanup)
                                        │
                                        ├──→ PHASE 6 (UI Panel)
                                        ├──→ PHASE 7 (CWF Agent)
                                        └──→ PHASE 8 (Supabase)
```

| Phase | Files | Risk | Effort |
|-------|-------|------|--------|
| 0 | `params/oee.ts`, `types.ts` | 🟢 Low | 1hr — All new, no existing code touched |
| 1 | `kpiCalculations.ts`, `params/energy.ts` | 🟡 Med | 2hr — Modifying energy path, must keep backward compat |
| 2 | `oeeCalculations.ts` | 🟢 Low | 3hr — New file, pure functions, thorough testing |
| 3 | `kpiStore.ts` | 🟢 Low | 1hr — Additive only |
| 4 | `useKPISync.ts` | 🟡 Med | 2hr — Adding to tick loop, must not break existing KPIs |
| 5 | `kpiCalculations.ts` | 🟡 Med | 1hr — Deprecating old OEE, wiring FOEE to KPI card |
| 6 | `OEEPanel.tsx` | 🟢 Low | 4hr — New component, three-tab layout |
| 7 | `cwfAgent.ts` | 🟢 Low | 30min — Prompt updates |
| 8 | Migration + `syncService.ts` | 🟡 Med | 2hr — New table + sync category |

**Total estimated effort: ~16.5 hours**

---

## 6. TESTING STRATEGY

### 6.1 Unit Tests (`src/__tests__/oeeCalculations.test.ts`)

```
Test 1: Perfect factory — zero losses
  100 tiles through all stations, none scrapped, no conveyor damage.
  Expected: All MOEEs ≈ 100%, all LOEEs ≈ 100%, FOEE ≈ 100%

Test 2: Press scrap (Path A — removed from conveyor)
  100 spawned, 5 scrapped_here=true at press, 95 flow through.
  Expected: MOEE_press = 95/A, Dryer gets 95 in, chain continues

Test 3: Mid-line scrap (Path A — scrapped at dryer)
  100 press output, 3 scrapped_here=true at dryer, 97 continue.
  Expected: MOEE_dryer Q = 97/100, E(glaze_in) = 97

Test 4: Defective but not removed (Path B — continues to sorting)
  100 tiles, 10 have defects but scrapped_here=false at glaze.
  Expected: MOEE_glaze Q = 100/100 = 1.0 (tile wasn't removed!)
           Sorting Q catches it when grading as scrap.

Test 5: Conveyor jam damage
  92 tiles exit digital, 5 get conveyor_jam_damage, all 92 reach kiln.
  Expected: MOEE_conveyor = 87/92, kilnInput = 92

Test 6: Kiln bottleneck (normal case)
  B < A, kiln is constraint.
  Expected: FOEE = J/B, bottleneck = 'B'

Test 7: Press bottleneck (unusual case)
  Simulate A < B scenario (severe press failure dropping effective rate).
  Expected: FOEE = J/A, bottleneck = 'A'

Test 8: Zero tiles (early simulation)
  No tiles produced yet.
  Expected: All OEEs = 0%, no division-by-zero, energy = idle only

Test 9: Telescoping verification
  Verify LOEE₁ = F/A equals product of press×dryer×glaze×digital MOEEs
  Verify LOEE₂ = J/B equals product of kiln×sorting×packaging MOEEs

Test 10: Energy per tile
  Known energy values, known tile counts.
  Expected: kWhPerTile = totalKwh / tilesProcessed (per station)
```

### 6.2 Integration Tests

```
Test: OEE updates every S-Clock tick via useKPISync
Test: KPI card shows FOEE value (backward compatibility)
Test: Factory reset clears all OEE + cumulative energy state
Test: OEE sync to Supabase produces valid records
Test: Per-station energy accumulation is monotonically increasing
Test: Conveyor energy appears in both OEE panel and energy totals
```

---

## 7. OPEN ITEMS — RESOLVED

| # | Question | Decision |
|---|----------|----------|
| 1 | Theoretical rates | A=12, B=8 in separate `params/oee.ts` module |
| 2 | Elapsed time source | Simulation clock (pauses don't count) |
| 3 | StationName vs OEEMachineId | Keep StationName as 7, separate OEEMachineId |
| 4 | Scrap handling | IN/OUT per station, scrapped_here drives Q |
| 5 | FOEE formula | Bottleneck-anchored: J / min(A,B) |
| 6 | Energy integration | Per-station breakdown, kWh/tile per machine/line/factory |
| 7 | Conveyor energy | New entry in ENERGY_CONFIG: base=5, strong speed effect |

---

## 8. DELIVERABLES CHECKLIST

- [ ] `src/lib/params/oee.ts` — Configurable theoretical rates, line defs, thresholds
- [ ] `src/lib/params/index.ts` — Re-export OEE constants
- [ ] `src/lib/params/energy.ts` — Add conveyor to ENERGY_CONFIG
- [ ] `src/store/types.ts` — OEE types (StationCounts, MachineOEE, LineOEE, FactoryOEE)
- [ ] `src/lib/oeeCalculations.ts` — Pure OEE calculation functions
- [ ] `src/lib/kpiCalculations.ts` — Enhanced calculateEnergy with per-station breakdown
- [ ] `src/store/kpiStore.ts` — Add factoryOEE + cumulative energy state
- [ ] `src/hooks/useKPISync.ts` — Orchestrate OEE + enhanced energy pipeline
- [ ] `src/lib/kpiCalculations.ts` — Deprecate old calculateOEE, wire FOEE
- [ ] `src/components/ui/OEEPanel.tsx` — Three-tab hierarchical display
- [ ] `src/lib/params/cwfAgent.ts` — CWF prompt with OEE context
- [ ] `supabase/migrations/xxx_oee_snapshots.sql` — OEE + energy persistence table
- [ ] `src/services/syncService.ts` — OEE snapshot sync integration
- [ ] `src/__tests__/oeeCalculations.test.ts` — 10+ unit tests
- [ ] `src/lib/translations.ts` — OEE panel bilingual strings
