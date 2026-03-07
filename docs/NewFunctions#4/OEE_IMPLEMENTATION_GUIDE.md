# OEE Implementation Guide

## For AntiGravity + Claude Opus 4.6 (Extended Thinking)

**Repository:** `https://github.com/maymun207/Virtual-Factory.git` (main branch)
**Total Phases:** 8 (execute in exact order)
**Estimated Time:** ~16 hours across all phases

---

## 🔑 HOW TO USE THIS GUIDE

### For You (Maymun):

1. **Open AntiGravity** with the Virtual Factory repository loaded
2. **Copy-paste each prompt** exactly as written in the gray code blocks
3. **Wait for completion** — let Opus 4.6 finish thinking and writing
4. **Run the validation command** after each phase
5. **Only proceed to next phase** after validation passes
6. If anything fails, paste the error into AntiGravity and ask it to fix

### Important Rules:

- **Execute phases in order** — each phase depends on the previous one
- **One prompt per phase** — don't combine prompts
- **Don't edit the AI's output** unless validation fails
- **Commit after each successful phase** — so you can rollback if needed

```bash
# After each phase passes validation:
git add -A && git commit -m "OEE Phase N: <description>"
```

---

## PHASE 0: Constants & Type Definitions

### What this phase does:

Creates the new `params/oee.ts` file with all OEE constants, adds OEE type
definitions to `types.ts`, and re-exports from the params barrel.

### Prompt — Copy-paste this into AntiGravity:

````
## TASK: Create OEE Constants Module and Type Definitions (Phase 0 of 8)

I am implementing a hierarchical OEE (Overall Equipment Effectiveness) system for a ceramic tile factory simulator. This is Phase 0: creating the constants and types.

### CONTEXT

The simulator has 8 machines organized into 3 lines:
- Line 1 (Forming & Finishing): press → dryer → glaze → printer
- Line 2 (Firing & Dispatch): kiln → sorting → packaging
- Line 3 (Transport): conveyor (connecting Line 1 output to Line 2 input)

The OEE model uses two theoretical rates:
- A = Press theoretical rate (12 tiles/min)
- B = Kiln theoretical rate (8 tiles/min) — kiln is the bottleneck

OEE = Performance × Quality (two-factor model, no separate Availability)

### FILE 1: Create `src/lib/params/oee.ts` (NEW FILE)

Create this file with EXACTLY these contents:

```typescript
/**
 * oee.ts — OEE Configuration Constants
 *
 * SINGLE SOURCE OF TRUTH for all OEE-related constants.
 * Isolated module for clean fine-tuning without touching calculation logic.
 *
 * Two theoretical rates represent "what the machine SHOULD produce per minute
 * at design capacity with zero losses":
 *   A = Press (fast mechanical stamping)
 *   B = Kiln (slower thermal process — the natural bottleneck)
 */

// ═══════════════════════════════════════════════════════════════
// THEORETICAL RATES
// ═══════════════════════════════════════════════════════════════

/** Press design capacity — tiles per minute at full speed, no stops.
 *  Derived from press cycle_time_sec range 4-8 sec → 7.5-15 tiles/min.
 *  Set to 12 as representative of normal operation (~5 sec cycle). */
export const PRESS_THEORETICAL_RATE = 12;

/** Kiln optimum feed rate — tiles per minute at ideal throughput.
 *  Kiln is the natural bottleneck in ceramic manufacturing.
 *  Set to ~67% of press rate, matching real-world kiln/press ratio. */
export const KILN_THEORETICAL_RATE = 8;

// ═══════════════════════════════════════════════════════════════
// LINE DEFINITIONS
// ═══════════════════════════════════════════════════════════════

export const LINE_DEFINITIONS = {
  line1: {
    id: 'line1' as const,
    name: { tr: 'Hat 1 — Şekillendirme & Baskı', en: 'Line 1 — Forming & Finishing' },
    stations: ['press', 'dryer', 'glaze', 'printer'] as const,
    theoreticalRateSymbol: 'A' as const,
    theoreticalRate: PRESS_THEORETICAL_RATE,
  },
  line2: {
    id: 'line2' as const,
    name: { tr: 'Hat 2 — Pişirme & Sevkiyat', en: 'Line 2 — Firing & Dispatch' },
    stations: ['kiln', 'sorting', 'packaging'] as const,
    theoreticalRateSymbol: 'B' as const,
    theoreticalRate: KILN_THEORETICAL_RATE,
  },
  line3: {
    id: 'line3' as const,
    name: { tr: 'Hat 3 — Konveyör', en: 'Line 3 — Conveyor' },
    stations: ['conveyor'] as const,
    theoreticalRateSymbol: null,
    theoreticalRate: null,
  },
} as const;

export type LineId = keyof typeof LINE_DEFINITIONS;

// ═══════════════════════════════════════════════════════════════
// OEE MACHINE ORDER — All 8 machines for OEE tracking
// ═══════════════════════════════════════════════════════════════

/** OEE tracks 8 machines (7 stations + conveyor).
 *  NOTE: StationName stays as 7 stations. OEEMachineId is a SEPARATE type. */
export const OEE_MACHINE_ORDER = [
  'press', 'dryer', 'glaze', 'printer',
  'conveyor',
  'kiln', 'sorting', 'packaging',
] as const;

export type OEEMachineId = (typeof OEE_MACHINE_ORDER)[number];

// ═══════════════════════════════════════════════════════════════
// DISPLAY THRESHOLDS — Color coding for the UI
// ═══════════════════════════════════════════════════════════════

/** OEE >= this → green (world-class) */
export const OEE_THRESHOLD_GOOD = 85;
/** OEE >= this → yellow (acceptable), below → red (needs attention) */
export const OEE_THRESHOLD_WARNING = 65;

// ═══════════════════════════════════════════════════════════════
// CONVEYOR ENERGY — Belt motor energy consumption
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

// ═══════════════════════════════════════════════════════════════
// MACHINE DISPLAY NAMES (bilingual)
// ═══════════════════════════════════════════════════════════════

export const OEE_MACHINE_NAMES: Record<OEEMachineId, { tr: string; en: string }> = {
  press:     { tr: 'Pres',          en: 'Press' },
  dryer:     { tr: 'Kurutucu',      en: 'Dryer' },
  glaze:     { tr: 'Sırlama',       en: 'Glaze' },
  printer:   { tr: 'Dijital Baskı', en: 'Digital' },
  conveyor:  { tr: 'Konveyör',      en: 'Conveyor' },
  kiln:      { tr: 'Fırın',         en: 'Kiln' },
  sorting:   { tr: 'Seçme',         en: 'Sorting' },
  packaging: { tr: 'Paketleme',     en: 'Packaging' },
};
```

### FILE 2: Modify `src/lib/params/index.ts`

Add this line at the end of the file, after the last `export * from ...` line:

```typescript
export * from './oee';
```

### FILE 3: Modify `src/store/types.ts`

Add the following type definitions at the VERY END of the file (after the `SimulationDataConfig` interface). Do NOT modify any existing types. Do NOT add 'conveyor' to StationName — it stays as 7 stations.

```typescript
// =============================================================================
// OEE TYPES — Hierarchical OEE calculation results
// =============================================================================

/** Per-station tile IN/OUT counts (A-J variables from real factory model).
 *
 *  Measurement points:
 *    A = PRESS_THEORETICAL_RATE × elapsed_minutes
 *    B = KILN_THEORETICAL_RATE × elapsed_minutes
 *    C_in = tiles spawned at press (press input)
 *    C = tiles exiting press (scrapped_here=false)
 *    D = tiles exiting dryer (scrapped_here=false)
 *    E = tiles exiting glaze (scrapped_here=false)
 *    F = tiles exiting digital printer (scrapped_here=false)
 *    G = tiles reaching kiln (any kiln snapshot)
 *    G_clean = tiles transiting conveyor without jam damage
 *    H = tiles exiting kiln (scrapped_here=false)
 *    I = first_quality + second_quality
 *    J = tiles exiting packaging (scrapped_here=false)
 */
export interface StationCounts {
  /** C_in: Tiles spawned at press (press input count) */
  pressSpawned: number;
  /** C: Tiles that exited press (scrapped_here=false) */
  pressOutput: number;
  /** D: Tiles that exited dryer (scrapped_here=false) */
  dryerOutput: number;
  /** E: Tiles that exited glaze (scrapped_here=false) */
  glazeOutput: number;
  /** F: Tiles that exited digital printer (scrapped_here=false) */
  digitalOutput: number;
  /** G: Tiles that reached kiln (any kiln snapshot — they arrived) */
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
  /** Elapsed simulation minutes */
  elapsedMinutes: number;
  /** Per-station detailed IN/OUT/scrapped for diagnostics */
  perStation: Record<string, { in: number; out: number; scrappedHere: number }>;
}

/** Per-machine OEE breakdown (P × Q model) */
export interface MachineOEE {
  /** Machine identifier (one of 8 OEE machines including conveyor) */
  machineId: string;
  /** Bilingual display name */
  name: { tr: string; en: string };
  /** Performance component (0-1): actual output / theoretical capacity */
  performance: number;
  /** Quality component (0-1): output / input (yield per machine) */
  quality: number;
  /** OEE percentage (0-100): P × Q × 100 */
  oee: number;
  /** Tiles that entered this machine */
  actualInput: number;
  /** Tiles that exited this machine successfully */
  actualOutput: number;
  /** Tiles scrapped at this machine */
  scrappedHere: number;
}

/** Per-station energy consumption breakdown */
export interface StationEnergy {
  /** Station or machine identifier */
  stationId: string;
  /** Cumulative electrical consumption (kWh) */
  kWh: number;
  /** Cumulative gas consumption (m³) */
  gas: number;
  /** Derived CO₂ emissions (kg) */
  co2: number;
  /** Tiles processed at this station */
  tilesProcessed: number;
  /** Energy efficiency: kWh per tile */
  kWhPerTile: number;
}

/** Per-line OEE + energy result */
export interface LineOEE {
  /** Line identifier: 'line1', 'line2', or 'line3' */
  lineId: string;
  /** Bilingual display name */
  name: { tr: string; en: string };
  /** Line-level Performance component (0-1) */
  performance: number;
  /** Line-level Quality component (0-1) */
  quality: number;
  /** OEE percentage (0-100) */
  oee: number;
  /** Constituent machine OEEs */
  machines: MachineOEE[];
  /** Energy aggregation for this line */
  energy: {
    totalKwh: number;
    totalGas: number;
    totalCo2: number;
    kWhPerTile: number;
  };
}

/** Factory-level OEE + energy (top of the hierarchy) */
export interface FactoryOEE {
  /** Factory OEE percentage (0-100) */
  oee: number;
  /** Which theoretical rate is constraining: 'A' (press) or 'B' (kiln) */
  bottleneck: 'A' | 'B';
  /** The constraining rate value: min(A, B) × elapsed */
  bottleneckRate: number;
  /** J: Final packaging output count */
  finalOutput: number;
  /** All 3 line OEEs */
  lines: LineOEE[];
  /** Factory-wide energy totals */
  energy: {
    totalKwh: number;
    totalGas: number;
    totalCo2: number;
    kWhPerTile: number;
    perStation: Record<string, StationEnergy>;
  };
}
```

### CRITICAL RULES:
1. Do NOT add 'conveyor' to the StationName type — it must remain as 7 stations
2. Do NOT modify any existing types, interfaces, or constants
3. The OEE types use `string` for machineId and lineId (not the OEEMachineId/LineId types) to avoid circular imports between types.ts and params/oee.ts
4. Create params/oee.ts EXACTLY as shown — these constants will be referenced by all subsequent phases

### VALIDATION:
After making changes, run:
```bash
npx tsc --noEmit
```
There should be zero new TypeScript errors.
````

### Validation Command:

```bash
cd Virtual-Factory && npx tsc --noEmit 2>&1 | head -20
```

---

## PHASE 1: Enhanced Energy Calculation (Per-Station Breakdown)

### What this phase does:

Modifies `calculateEnergy()` in `kpiCalculations.ts` to return per-station energy breakdown
alongside existing global totals. Adds conveyor energy to `ENERGY_CONFIG`. Fully backward compatible.

### Prompt — Copy-paste this into AntiGravity:

````
## TASK: Enhanced Energy Calculation with Per-Station Breakdown (Phase 1 of 8)

I am adding per-station energy tracking to the existing energy calculation system. This must be 100% backward compatible — the existing `calculateEnergy()` return value shape must still work everywhere it's currently used.

### CONTEXT

Current `calculateEnergy()` in `src/lib/kpiCalculations.ts` returns:
```typescript
interface EnergyResult {
  totalKwh: number;
  totalGas: number;
  totalCO2: number;
}
```

It's called in `src/hooks/useKPISync.ts` and the result is used like:
```typescript
const energy = calculateEnergy(speed, positions, isRunning, multiplier);
// Then: energy.totalKwh, energy.totalGas, energy.totalCO2
```

I need to ADD a `perStation` field to EnergyResult without breaking existing code.

### STEP 1: Add conveyor to ENERGY_CONFIG in `src/lib/params/energy.ts`

In the `ENERGY_CONFIG` object, add a `conveyor` entry to the `kwh` section. The conveyor belt motor is strongly speed-dependent and nearly zero when stopped.

Add this entry AFTER the `packaging` entry inside `ENERGY_CONFIG.kwh`:

```typescript
    conveyor:  { base: 5,  minEffect: -0.3, maxEffect: 0.5, idleFactor: 0.1 },
```

So the `kwh` section becomes:
```typescript
  kwh: {
    press:     { base: 10,  minEffect: -0.2, maxEffect: 0.3,  idleFactor: 0.15 },
    dryer:     { base: 20,  minEffect: 0,    maxEffect: 0,    idleFactor: 0.15 },
    glaze:     { base: 8,   minEffect: -0.1, maxEffect: 0.15, idleFactor: 0.15 },
    digital:   { base: 20,  minEffect: -0.3, maxEffect: 0.3,  idleFactor: 0.15 },
    kiln:      { base: 100, minEffect: 0,    maxEffect: 0,    idleFactor: 0.8  },
    sorting:   { base: 10,  minEffect: -0.5, maxEffect: 0.5,  idleFactor: 0.15 },
    packaging: { base: 10,  minEffect: -0.5, maxEffect: 0.5,  idleFactor: 0.15 },
    conveyor:  { base: 5,   minEffect: -0.3, maxEffect: 0.5,  idleFactor: 0.1  },
  },
```

### STEP 2: Modify `EnergyResult` interface in `src/lib/kpiCalculations.ts`

Change the EnergyResult interface to add the perStation field:

```typescript
export interface EnergyResult {
  /** Total electrical energy consumption (kWh) */
  totalKwh: number;
  /** Total natural gas consumption (m³) */
  totalGas: number;
  /** Total CO₂ emissions (kg) = electric CO₂ + gas CO₂ */
  totalCO2: number;
  /** Per-station energy breakdown (NEW — for OEE energy integration) */
  perStation: Record<string, { kWh: number; gas: number; co2: number }>;
}
```

### STEP 3: Modify the `calculateEnergy()` function body in `src/lib/kpiCalculations.ts`

Replace the function body to build per-station breakdown. Here is the COMPLETE new function:

```typescript
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

  // ── Build per-station breakdown ──────────────────────────────
  const perStation: Record<string, { kWh: number; gas: number; co2: number }> = {};

  // Electrical consumption per station
  let totalKwh = 0;
  for (const [id, params] of Object.entries(ENERGY_CONFIG.kwh)) {
    // Conveyor occupancy = always "on" when running (it's a belt, not a station)
    const occupied = id === 'conveyor' ? isRunning : (machineStates[id] ?? false);
    const stationKwh = calculateConsumption(params, conveyorSpeed, occupied, isRunning)
                       * scenarioEnergyMultiplier;
    totalKwh += stationKwh;
    perStation[id] = { kWh: stationKwh, gas: 0, co2: stationKwh * CO2_FACTOR_ELECTRIC };
  }

  // Gas consumption (only dryer + kiln)
  let totalGas = 0;
  for (const [id, params] of Object.entries(ENERGY_CONFIG.gas)) {
    const stationGas = calculateConsumption(params, conveyorSpeed, machineStates[id] ?? false, isRunning)
                       * scenarioEnergyMultiplier;
    totalGas += stationGas;
    if (perStation[id]) {
      perStation[id].gas = stationGas;
      perStation[id].co2 += stationGas * CO2_FACTOR_GAS;
    }
  }

  const totalCO2 = (totalKwh * CO2_FACTOR_ELECTRIC) + (totalGas * CO2_FACTOR_GAS);
  return { totalKwh, totalGas, totalCO2, perStation };
};
```

### CRITICAL RULES:
1. The function signature does NOT change
2. The return type EXTENDS (adds perStation) — it does NOT remove totalKwh/totalGas/totalCO2
3. All existing code that uses `energy.totalKwh`, `energy.totalGas`, `energy.totalCO2` continues to work unchanged
4. The conveyor is treated as "occupied = isRunning" since it's a continuous belt, not a station that tiles visit individually
5. The `machineStates` map for the 7 original stations stays EXACTLY the same

### VALIDATION:
After making changes, run:
```bash
npx tsc --noEmit
```
There should be zero new TypeScript errors. The existing `useKPISync.ts` should still compile because EnergyResult still has totalKwh, totalGas, totalCO2.
````

### Validation Command:

```bash
cd Virtual-Factory && npx tsc --noEmit 2>&1 | head -20
```

---

## PHASE 2: OEE Calculation Engine (Pure Functions)

### What this phase does:

Creates the core `oeeCalculations.ts` with pure functions: `countStationExits()`,
`calculateAllMOEEs()`, `calculateAllLOEEs()`, `calculateFOEE()`.

### Prompt — Copy-paste this into AntiGravity:

````
## TASK: Create OEE Calculation Engine — Pure Functions (Phase 2 of 8)

Create a new file `src/lib/oeeCalculations.ts` containing pure calculation functions for the hierarchical OEE system. These functions have ZERO side effects and ZERO store imports — they receive all data through arguments and return results.

### OEE MODEL SUMMARY

8 machines, 3 lines, 1 factory. Two-factor model: MOEE = Performance × Quality.

Two theoretical rates:
- A = PRESS_THEORETICAL_RATE (12 tiles/min)
- B = KILN_THEORETICAL_RATE (8 tiles/min)

Variables (tile counts):
- C_in = tiles spawned at press
- C = tiles exiting press (survived)
- D = tiles exiting dryer (survived)
- E = tiles exiting glaze (survived)
- F = tiles exiting digital (survived)
- G = tiles reaching kiln (kiln input)
- G_clean = tiles transiting conveyor WITHOUT conveyor_jam_damage
- H = tiles exiting kiln (survived)
- I = first_quality + second_quality (sorting usable output)
- J = tiles exiting packaging (survived)

Machine OEE formulas:
- Press:     P = C_in/A, Q = C/C_in → MOEE = C/A
- Dryer:     P = D/A,    Q = D/C    → MOEE = (D/A)×(D/C)
- Glaze:     P = E/A,    Q = E/D    → MOEE = (E/A)×(E/D)
- Digital:   P = F/A,    Q = F/E    → MOEE = (F/A)×(F/E)
- Conveyor:  P = 1.0,    Q = G_clean/F → MOEE = G_clean/F
- Kiln:      P = G/B,    Q = H/G    → MOEE = (G/B)×(H/G)
- Sorting:   P = H/B,    Q = I/H    → MOEE = (H/B)×(I/H)
- Packaging: P = I/B,    Q = J/I    → MOEE = (I/B)×(J/I)

Line OEE (telescoped):
- Line 1: LOEE₁ = F/A
- Line 2: LOEE₂ = J/B
- Line 3: LOEE₃ = G_clean/F

Factory OEE (bottleneck-anchored):
- FOEE = J / min(A, B)

### EXISTING TYPES YOU MUST USE

These types already exist in `src/store/types.ts`:
- `TileSnapshotRecord` — has fields: station (StationName), scrapped_here (boolean), defect_detected (boolean), defect_types (DefectType[] | undefined)
- `StationCounts` — the interface you'll populate (created in Phase 0)
- `MachineOEE` — per-machine result (created in Phase 0)
- `LineOEE` — per-line result (created in Phase 0)
- `FactoryOEE` — factory result (created in Phase 0)
- `StationEnergy` — per-station energy (created in Phase 0)

These constants exist in `src/lib/params/oee.ts`:
- `PRESS_THEORETICAL_RATE` (12)
- `KILN_THEORETICAL_RATE` (8)
- `LINE_DEFINITIONS` — maps lineId to station arrays
- `OEE_MACHINE_NAMES` — bilingual names for each machine

### CREATE FILE: `src/lib/oeeCalculations.ts`

```typescript
/**
 * oeeCalculations.ts — Hierarchical OEE Calculation Engine
 *
 * Pure functions implementing the real-world tile factory OEE methodology.
 * ALL functions are stateless — receive data through arguments, return results.
 * NO store imports, NO side effects.
 *
 * Data flow:
 *   tileSnapshots + counters → countStationExits()
 *   → calculateAllMOEEs() → calculateAllLOEEs() → calculateFOEE()
 *
 * Formulas based on real ceramic tile factory (two-factor P × Q model):
 *   MOEE = Performance × Quality per machine
 *   LOEE = telescoped across line stations
 *   FOEE = J / min(A, B) bottleneck-anchored
 */

import {
  PRESS_THEORETICAL_RATE,
  KILN_THEORETICAL_RATE,
  LINE_DEFINITIONS,
  OEE_MACHINE_NAMES,
} from './params/oee';
import type {
  TileSnapshotRecord,
  StationCounts,
  MachineOEE,
  LineOEE,
  FactoryOEE,
  StationEnergy,
} from '../store/types';

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

/** Safe division: returns 0 when denominator is 0 (prevents NaN/Infinity) */
const safeDiv = (num: number, den: number): number => (den === 0 ? 0 : num / den);

/** Clamp a value between 0 and a max (default 1 for ratios) */
const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

// ═══════════════════════════════════════════════════════════════
// TILE COUNTING — Extract A-J variables from snapshot data
// ═══════════════════════════════════════════════════════════════

/**
 * Count tiles at each measurement point from tile snapshot data.
 *
 * Single-pass iteration over tileSnapshots Map.
 * For each tile, iterates its snapshots to determine:
 *   - Station IN count (tile has a snapshot at this station)
 *   - Station OUT count (snapshot has scrapped_here=false)
 *   - Conveyor damage (any snapshot has 'conveyor_jam_damage' in defect_types)
 *
 * Scrap handling:
 *   - Path A (removed from conveyor): scrapped_here=true → NOT in OUT count
 *   - Path B (stays on conveyor): scrapped_here=false → IS in OUT count,
 *     loss captured at sorting when graded as scrap
 *
 * Complexity: O(n × k) where n = tile count, k = avg snapshots per tile (~7)
 *
 * @param tileSnapshots      - Map from tileId → array of TileSnapshotRecord
 * @param totalFirstQuality  - Cumulative first quality tiles (from data store)
 * @param totalSecondQuality - Cumulative second quality tiles (from data store)
 * @param elapsedSimMinutes  - Elapsed simulation time in minutes
 * @returns StationCounts with all A-J variables and per-station IN/OUT
 */
export function countStationExits(
  tileSnapshots: Map<string, TileSnapshotRecord[]>,
  totalFirstQuality: number,
  totalSecondQuality: number,
  elapsedSimMinutes: number,
): StationCounts {
  // Per-station IN/OUT/scrapped accumulators
  const stationStats: Record<string, { in: number; out: number; scrappedHere: number }> = {
    press:     { in: 0, out: 0, scrappedHere: 0 },
    dryer:     { in: 0, out: 0, scrappedHere: 0 },
    glaze:     { in: 0, out: 0, scrappedHere: 0 },
    printer:   { in: 0, out: 0, scrappedHere: 0 },
    kiln:      { in: 0, out: 0, scrappedHere: 0 },
    sorting:   { in: 0, out: 0, scrappedHere: 0 },
    packaging: { in: 0, out: 0, scrappedHere: 0 },
  };

  let conveyorCleanOutput = 0;

  for (const [, snapshots] of tileSnapshots) {
    // ── Per-tile flags ──
    let hasConveyorDamage = false;
    let exitedDigital = false;
    let reachedKiln = false;

    // First scan: detect conveyor damage across ALL snapshots for this tile.
    // We must check all snapshots because conveyor_jam_damage is recorded
    // at the SORTING station, not at the conveyor itself.
    for (const snap of snapshots) {
      if (
        snap.defect_detected &&
        snap.defect_types != null &&
        (snap.defect_types as string[]).includes('conveyor_jam_damage')
      ) {
        hasConveyorDamage = true;
        break; // One is enough
      }
    }

    // Second scan: count station IN/OUT
    for (const snap of snapshots) {
      const station = snap.station;
      const stats = stationStats[station];
      if (!stats) continue; // Safety: skip unknown stations

      // IN: tile arrived at this station (has a snapshot)
      stats.in++;

      if (snap.scrapped_here) {
        // Tile was scrapped AND removed at this station (Path A)
        stats.scrappedHere++;
      } else {
        // Tile survived this station (Path A: not scrapped, or Path B: defective but continues)
        stats.out++;

        if (station === 'printer') exitedDigital = true;
      }

      // Track if tile reached kiln (regardless of scrapped_here)
      if (station === 'kiln') reachedKiln = true;
    }

    // Conveyor clean output: tile exited digital AND reached kiln AND no jam damage
    if (exitedDigital && reachedKiln && !hasConveyorDamage) {
      conveyorCleanOutput++;
    }
  }

  return {
    pressSpawned:          stationStats.press.in,
    pressOutput:           stationStats.press.out,
    dryerOutput:           stationStats.dryer.out,
    glazeOutput:           stationStats.glaze.out,
    digitalOutput:         stationStats.printer.out,
    kilnInput:             stationStats.kiln.in,
    conveyorCleanOutput,
    kilnOutput:            stationStats.kiln.out,
    sortingUsableOutput:   totalFirstQuality + totalSecondQuality,
    packagingOutput:       stationStats.packaging.out,
    theoreticalA:          PRESS_THEORETICAL_RATE * elapsedSimMinutes,
    theoreticalB:          KILN_THEORETICAL_RATE * elapsedSimMinutes,
    elapsedMinutes:        elapsedSimMinutes,
    perStation:            stationStats,
  };
}

// ═══════════════════════════════════════════════════════════════
// MACHINE OEE — 8 individual calculations
// ═══════════════════════════════════════════════════════════════

/**
 * Calculate OEE for all 8 machines from station counts.
 *
 * Each machine:
 *   P = actual output / theoretical capacity (0-1)
 *   Q = output / input (yield, 0-1)
 *   MOEE = P × Q × 100 (0-100%)
 *
 * Line 1 machines reference theoretical rate A (press capacity).
 * Line 2 machines reference theoretical rate B (kiln capacity).
 * Conveyor is yield-only (P = 1.0).
 *
 * @param c - Station counts from countStationExits()
 * @returns Array of 8 MachineOEE objects in production order
 */
export function calculateAllMOEEs(c: StationCounts): MachineOEE[] {
  const A = c.theoreticalA;
  const B = c.theoreticalB;

  const machines: MachineOEE[] = [
    // ── LINE 1 machines (reference rate A) ──
    {
      machineId: 'press',
      name: OEE_MACHINE_NAMES.press,
      performance: clamp01(safeDiv(c.pressSpawned, A)),
      quality:     clamp01(safeDiv(c.pressOutput, c.pressSpawned)),
      oee:         0, // calculated below
      actualInput:  c.pressSpawned,
      actualOutput: c.pressOutput,
      scrappedHere: c.pressSpawned - c.pressOutput,
    },
    {
      machineId: 'dryer',
      name: OEE_MACHINE_NAMES.dryer,
      performance: clamp01(safeDiv(c.dryerOutput, A)),
      quality:     clamp01(safeDiv(c.dryerOutput, c.pressOutput)),
      oee:         0,
      actualInput:  c.pressOutput,
      actualOutput: c.dryerOutput,
      scrappedHere: c.perStation.dryer.scrappedHere,
    },
    {
      machineId: 'glaze',
      name: OEE_MACHINE_NAMES.glaze,
      performance: clamp01(safeDiv(c.glazeOutput, A)),
      quality:     clamp01(safeDiv(c.glazeOutput, c.dryerOutput)),
      oee:         0,
      actualInput:  c.dryerOutput,
      actualOutput: c.glazeOutput,
      scrappedHere: c.perStation.glaze.scrappedHere,
    },
    {
      machineId: 'printer',
      name: OEE_MACHINE_NAMES.printer,
      performance: clamp01(safeDiv(c.digitalOutput, A)),
      quality:     clamp01(safeDiv(c.digitalOutput, c.glazeOutput)),
      oee:         0,
      actualInput:  c.glazeOutput,
      actualOutput: c.digitalOutput,
      scrappedHere: c.perStation.printer.scrappedHere,
    },

    // ── LINE 3 (Conveyor) ──
    {
      machineId: 'conveyor',
      name: OEE_MACHINE_NAMES.conveyor,
      performance: 1.0,
      quality:     clamp01(safeDiv(c.conveyorCleanOutput, c.digitalOutput)),
      oee:         0,
      actualInput:  c.digitalOutput,
      actualOutput: c.conveyorCleanOutput,
      scrappedHere: c.digitalOutput - c.conveyorCleanOutput,
    },

    // ── LINE 2 machines (reference rate B) ──
    {
      machineId: 'kiln',
      name: OEE_MACHINE_NAMES.kiln,
      performance: clamp01(safeDiv(c.kilnInput, B)),
      quality:     clamp01(safeDiv(c.kilnOutput, c.kilnInput)),
      oee:         0,
      actualInput:  c.kilnInput,
      actualOutput: c.kilnOutput,
      scrappedHere: c.perStation.kiln.scrappedHere,
    },
    {
      machineId: 'sorting',
      name: OEE_MACHINE_NAMES.sorting,
      performance: clamp01(safeDiv(c.kilnOutput, B)),
      quality:     clamp01(safeDiv(c.sortingUsableOutput, c.kilnOutput)),
      oee:         0,
      actualInput:  c.kilnOutput,
      actualOutput: c.sortingUsableOutput,
      scrappedHere: c.kilnOutput - c.sortingUsableOutput,
    },
    {
      machineId: 'packaging',
      name: OEE_MACHINE_NAMES.packaging,
      performance: clamp01(safeDiv(c.sortingUsableOutput, B)),
      quality:     clamp01(safeDiv(c.packagingOutput, c.sortingUsableOutput)),
      oee:         0,
      actualInput:  c.sortingUsableOutput,
      actualOutput: c.packagingOutput,
      scrappedHere: c.perStation.packaging.scrappedHere,
    },
  ];

  // Calculate OEE = P × Q × 100 for each machine
  for (const m of machines) {
    m.oee = m.performance * m.quality * 100;
  }

  return machines;
}

// ═══════════════════════════════════════════════════════════════
// LINE OEE — 3 telescoped calculations
// ═══════════════════════════════════════════════════════════════

/**
 * Calculate OEE for all 3 lines.
 *
 * Each line OEE telescopes: intermediate variables cancel out.
 *   Line 1: LOEE = F / A (digital output / press theoretical)
 *   Line 2: LOEE = J / B (packaging output / kiln theoretical)
 *   Line 3: LOEE = G_clean / F (conveyor yield)
 *
 * @param c     - Station counts
 * @param moees - All 8 machine OEEs (for grouping into lines)
 * @param cumulativeEnergy - Cumulative per-station energy from kpiStore
 * @returns Array of 3 LineOEE objects
 */
export function calculateAllLOEEs(
  c: StationCounts,
  moees: MachineOEE[],
  cumulativeEnergy: Record<string, { kWh: number; gas: number; co2: number }>,
): LineOEE[] {
  // Helper: aggregate energy for a list of station IDs
  const aggregateEnergy = (stationIds: readonly string[], outputTiles: number) => {
    let totalKwh = 0;
    let totalGas = 0;
    let totalCo2 = 0;
    for (const id of stationIds) {
      const e = cumulativeEnergy[id];
      if (e) {
        totalKwh += e.kWh;
        totalGas += e.gas;
        totalCo2 += e.co2;
      }
    }
    return {
      totalKwh,
      totalGas,
      totalCo2,
      kWhPerTile: outputTiles > 0 ? totalKwh / outputTiles : 0,
    };
  };

  // Helper: filter MOEEs for a line's stations
  const filterMOEEs = (stationIds: readonly string[]) =>
    moees.filter(m => (stationIds as readonly string[]).includes(m.machineId));

  const A = c.theoreticalA;
  const B = c.theoreticalB;

  return [
    // Line 1: LOEE = F / A
    {
      lineId: LINE_DEFINITIONS.line1.id,
      name: LINE_DEFINITIONS.line1.name,
      performance: clamp01(safeDiv(c.pressSpawned, A)),   // C_in / A
      quality:     clamp01(safeDiv(c.digitalOutput, c.pressSpawned)), // F / C_in
      oee:         safeDiv(c.digitalOutput, A) * 100,     // F / A × 100
      machines:    filterMOEEs(LINE_DEFINITIONS.line1.stations),
      energy:      aggregateEnergy(LINE_DEFINITIONS.line1.stations, c.digitalOutput),
    },
    // Line 2: LOEE = J / B
    {
      lineId: LINE_DEFINITIONS.line2.id,
      name: LINE_DEFINITIONS.line2.name,
      performance: clamp01(safeDiv(c.kilnInput, B)),       // G / B
      quality:     clamp01(safeDiv(c.packagingOutput, c.kilnInput)), // J / G
      oee:         safeDiv(c.packagingOutput, B) * 100,    // J / B × 100
      machines:    filterMOEEs(LINE_DEFINITIONS.line2.stations),
      energy:      aggregateEnergy(LINE_DEFINITIONS.line2.stations, c.packagingOutput),
    },
    // Line 3: LOEE = G_clean / F
    {
      lineId: LINE_DEFINITIONS.line3.id,
      name: LINE_DEFINITIONS.line3.name,
      performance: 1.0,
      quality:     clamp01(safeDiv(c.conveyorCleanOutput, c.digitalOutput)),
      oee:         safeDiv(c.conveyorCleanOutput, c.digitalOutput) * 100,
      machines:    filterMOEEs(LINE_DEFINITIONS.line3.stations),
      energy:      aggregateEnergy(['conveyor'], c.conveyorCleanOutput),
    },
  ];
}

// ═══════════════════════════════════════════════════════════════
// FACTORY OEE — Bottleneck-anchored
// ═══════════════════════════════════════════════════════════════

/**
 * Calculate factory-level OEE anchored to the bottleneck rate.
 *
 * FOEE = J / min(A, B)
 *
 * Since kiln is typically the bottleneck (B < A): FOEE ≈ J/B = LOEE₂
 * If press becomes constraint (A < B): FOEE = J/A
 *
 * @param c     - Station counts
 * @param loees - All 3 line OEEs
 * @param cumulativeEnergy - Cumulative per-station energy
 * @returns FactoryOEE with all lines, energy, and bottleneck info
 */
export function calculateFOEE(
  c: StationCounts,
  loees: LineOEE[],
  cumulativeEnergy: Record<string, { kWh: number; gas: number; co2: number }>,
): FactoryOEE {
  const bottleneckRate = Math.min(c.theoreticalA, c.theoreticalB);
  const bottleneck: 'A' | 'B' = c.theoreticalA <= c.theoreticalB ? 'A' : 'B';
  const oee = Math.min(100, safeDiv(c.packagingOutput, bottleneckRate) * 100);

  // Factory energy = sum of all station energy
  let totalKwh = 0;
  let totalGas = 0;
  let totalCo2 = 0;
  const perStationEnergy: Record<string, StationEnergy> = {};

  for (const [id, e] of Object.entries(cumulativeEnergy)) {
    totalKwh += e.kWh;
    totalGas += e.gas;
    totalCo2 += e.co2;

    // Find the corresponding station's tile count for kWhPerTile
    const stationOut = c.perStation[id]?.out ?? 0;
    perStationEnergy[id] = {
      stationId: id,
      kWh: e.kWh,
      gas: e.gas,
      co2: e.co2,
      tilesProcessed: stationOut,
      kWhPerTile: stationOut > 0 ? e.kWh / stationOut : 0,
    };
  }

  // Add conveyor energy (not in perStation since it's not a StationName)
  const conveyorE = cumulativeEnergy['conveyor'];
  if (conveyorE && !perStationEnergy['conveyor']) {
    perStationEnergy['conveyor'] = {
      stationId: 'conveyor',
      kWh: conveyorE.kWh,
      gas: conveyorE.gas,
      co2: conveyorE.co2,
      tilesProcessed: c.conveyorCleanOutput,
      kWhPerTile: c.conveyorCleanOutput > 0 ? conveyorE.kWh / c.conveyorCleanOutput : 0,
    };
  }

  return {
    oee,
    bottleneck,
    bottleneckRate,
    finalOutput: c.packagingOutput,
    lines: loees,
    energy: {
      totalKwh,
      totalGas,
      totalCo2,
      kWhPerTile: c.packagingOutput > 0 ? totalKwh / c.packagingOutput : 0,
      perStation: perStationEnergy,
    },
  };
}
```

### CRITICAL RULES:
1. This file has ZERO store imports — only imports from `./params/oee` and `../store/types`
2. All functions are pure — no side effects, no mutations
3. `safeDiv()` prevents all division-by-zero (returns 0)
4. `clamp01()` keeps ratios in [0, 1] range
5. `countStationExits()` checks `scrapped_here` to distinguish Path A vs Path B scrap
6. Conveyor damage is detected via `conveyor_jam_damage` in defect_types (cast to string[] for comparison since DefectType is a union)
7. The `printer` station in code maps to `Digital` machine in OEE display (printer is the internal StationName)

### VALIDATION:
```bash
npx tsc --noEmit
```
````

### Validation Command:

```bash
cd Virtual-Factory && npx tsc --noEmit 2>&1 | head -20
```

---

## PHASE 3: Store Integration

### Prompt — Copy-paste this into AntiGravity:

````
## TASK: Add OEE State to KPI Store (Phase 3 of 8)

Modify `src/store/kpiStore.ts` to add OEE state fields. This is purely additive — no existing fields or functions change.

### CURRENT FILE STRUCTURE

The file exports `useKPIStore` created with Zustand's `create()`. Current state has:
- `kpis: KPI[]`
- `defects: Defect[]`
- `kpiHistory: KPIHistoryRecord[]`
- `resetKPIs: () => void`

### CHANGES NEEDED

1. Add import for OEE types at the top of the file:

```typescript
import type { FactoryOEE, StationCounts } from '../store/types';
```

Wait — `kpiStore.ts` is IN `src/store/`, so the import should be:

```typescript
import type { FactoryOEE, StationCounts } from './types';
```

2. Add three new fields to the `KPIState` interface:

```typescript
  /** Hierarchical OEE data: machine → line → factory (updated each tick) */
  factoryOEE: FactoryOEE | null;

  /** Station tile counts (A-J variables, for diagnostics display) */
  stationCounts: StationCounts | null;

  /** Cumulative per-station energy since simulation start.
   *  Each tick's per-station energy from calculateEnergy() is ADDED here.
   *  Used for kWhPerTile calculations in OEE. */
  cumulativeStationEnergy: Record<string, { kWh: number; gas: number; co2: number }>;

  /** Reset OEE-specific state (called during factory reset) */
  resetOEE: () => void;
```

3. Add initial values in the `create()` call:

```typescript
  factoryOEE: null,
  stationCounts: null,
  cumulativeStationEnergy: {},

  resetOEE: () => set({
    factoryOEE: null,
    stationCounts: null,
    cumulativeStationEnergy: {},
  }),
```

4. Extend the existing `resetKPIs` function to ALSO reset OEE state:

Change:
```typescript
  resetKPIs: () => set({
    kpis: createInitialKPIs(),
    defects: createInitialDefects(),
    kpiHistory: [],
  }),
```

To:
```typescript
  resetKPIs: () => set({
    kpis: createInitialKPIs(),
    defects: createInitialDefects(),
    kpiHistory: [],
    factoryOEE: null,
    stationCounts: null,
    cumulativeStationEnergy: {},
  }),
```

### CRITICAL RULES:
1. Do NOT remove or rename any existing fields
2. The import path from kpiStore.ts to types.ts is `./types` (both are in src/store/)
3. `cumulativeStationEnergy` starts as empty `{}` — it gets populated by useKPISync
4. `resetKPIs` must clear OEE state too, so factory reset works cleanly
5. `resetOEE` exists as a separate function for cases where only OEE needs resetting

### VALIDATION:
```bash
npx tsc --noEmit
```
````

### Validation Command:

```bash
cd Virtual-Factory && npx tsc --noEmit 2>&1 | head -20
```

---

## PHASE 4: Hook Orchestration (Wire Everything Together)

### Prompt — Copy-paste this into AntiGravity:

````
## TASK: Wire OEE Calculations into useKPISync Hook (Phase 4 of 8)

Modify `src/hooks/useKPISync.ts` to calculate OEE on every S-Clock tick and push results to kpiStore. This is the most critical integration phase.

### CURRENT FLOW (do NOT break this):

```
sClockCount changes → calculateEnergy → calculateFTQ/Scrap/OEE → updateKPIs → calculateTrends → setState
```

### NEW FLOW (extend after existing calculations):

```
sClockCount changes →
  [existing] calculateEnergy → calculateFTQ/Scrap/OEE → updateKPIs → calculateTrends →
  [NEW] accumulate per-station energy → countStationExits → calculateAllMOEEs →
        calculateAllLOEEs → calculateFOEE → replace legacy OEE with FOEE → setState
```

### CHANGES TO MAKE:

1. Add new imports at the top of the file:

```typescript
import {
  countStationExits,
  calculateAllMOEEs,
  calculateAllLOEEs,
  calculateFOEE,
} from '../lib/oeeCalculations';
import { DEFAULT_S_CLOCK_PERIOD } from '../lib/params';
```

2. Inside the S-Clock subscription callback, AFTER the existing `calculateTrends` call and BEFORE the final `useKPIStore.setState()`, add the OEE pipeline.

Here is what the callback should look like. I'm showing the COMPLETE callback body with [EXISTING] markers for unchanged code and [NEW] markers for additions:

```typescript
(sClockCount) => {
  // [EXISTING] Guard: skip if clock hasn't advanced
  if (sClockCount <= prevSClockRef.current) {
    prevSClockRef.current = sClockCount;
    return;
  }
  prevSClockRef.current = sClockCount;

  // [EXISTING] Read current state
  const simState = useSimulationStore.getState();
  const kpiState = useKPIStore.getState();
  const isRunning = simState.isDataFlowing && simState.conveyorStatus === 'running';

  // [EXISTING] Scenario energy multiplier
  const { activeScenario } = useSimulationDataStore.getState();
  const scenarioEnergyMultiplier = activeScenario
    ? 1 + (activeScenario.expectedEnergyImpact.min + activeScenario.expectedEnergyImpact.max) / 200
    : 1.0;

  // [EXISTING] Calculate energy (now returns perStation too)
  const energy = calculateEnergy(
    simState.conveyorSpeed,
    simState.partPositionsRef.current,
    isRunning,
    scenarioEnergyMultiplier,
  );

  // [EXISTING] Quality counters from data store
  const ds = useSimulationDataStore.getState();
  const dsShipment = ds.totalFirstQuality;
  const dsSecondQuality = ds.totalSecondQuality;
  const dsWaste = ds.totalScrapGraded + ds.totalTilesScrapped;
  const ftq = calculateFTQ(dsShipment, dsSecondQuality, dsWaste);
  const scrap = calculateScrap(dsShipment, dsSecondQuality, dsWaste);
  const totalKpi = calculateTotalKPI(dsShipment, dsSecondQuality, dsWaste);

  // ── [NEW] OEE PIPELINE ────────────────────────────────────────

  // Step 1: Accumulate per-station energy (add this tick's energy to cumulative)
  const prevCumEnergy = kpiState.cumulativeStationEnergy;
  const newCumEnergy: Record<string, { kWh: number; gas: number; co2: number }> = { ...prevCumEnergy };
  for (const [id, e] of Object.entries(energy.perStation)) {
    const prev = newCumEnergy[id] || { kWh: 0, gas: 0, co2: 0 };
    newCumEnergy[id] = {
      kWh: prev.kWh + e.kWh,
      gas: prev.gas + e.gas,
      co2: prev.co2 + e.co2,
    };
  }

  // Step 2: Calculate elapsed simulation time (simulation clock, not wall clock)
  const elapsedSimMinutes = (sClockCount * DEFAULT_S_CLOCK_PERIOD) / 60000;

  // Step 3: Count tiles at each station measurement point
  const dataStore = useSimulationDataStore.getState();
  const stationCounts = countStationExits(
    dataStore.tileSnapshots,
    dsShipment,
    dsSecondQuality,
    elapsedSimMinutes,
  );

  // Step 4: Calculate hierarchical OEE
  const moees = calculateAllMOEEs(stationCounts);
  const loees = calculateAllLOEEs(stationCounts, moees, newCumEnergy);
  const foee = calculateFOEE(stationCounts, loees, newCumEnergy);

  // Step 5: Use FOEE as the OEE value for the KPI card (replaces legacy formula)
  const oee = foee.oee;

  // ── [END NEW] ─────────────────────────────────────────────────

  // [EXISTING] Update KPI display values
  let newKpis = updateKPIs(kpiState.kpis, { energy, ftq, totalKpi, scrap, oee });

  // [EXISTING] Calculate trends
  const currentVals = {
    oee,
    ftq,
    total_kpi: totalKpi,
    scrap,
    energy: energy.totalKwh,
    gas: energy.totalGas,
    co2: energy.totalCO2,
  };
  const trendResult = calculateTrends(newKpis, currentVals, kpiState.kpiHistory, sClockCount);
  newKpis = trendResult.kpis;

  // [EXISTING] Calculate real defect rates
  const newDefects = calculateDefectRatesFromSnapshots(dataStore.tileSnapshots, kpiState.defects);

  // [MODIFIED] Push ALL updates to kpiStore in one batch (added OEE fields)
  useKPIStore.setState({
    kpis: newKpis,
    defects: newDefects,
    kpiHistory: trendResult.history,
    factoryOEE: foee,                          // [NEW]
    stationCounts,                              // [NEW]
    cumulativeStationEnergy: newCumEnergy,      // [NEW]
  });
}
```

### IMPORTANT DETAILS:

The key change is that the OLD `calculateOEE()` call:
```typescript
const oee = calculateOEE(simState.conveyorSpeed, ftq, simState.faultCount);
```

Is REPLACED by:
```typescript
const oee = foee.oee;
```

So the legacy `calculateOEE` import can be removed from the imports at the top.

REMOVE this from the imports:
```typescript
calculateOEE,
```

But KEEP all other imports from `kpiCalculations`:
```typescript
import {
  calculateEnergy,
  calculateFTQ,
  calculateScrap,
  calculateTotalKPI,
  // calculateOEE REMOVED
  updateKPIs,
  calculateTrends,
  calculateDefectRatesFromSnapshots,
} from '../lib/kpiCalculations';
```

Also note: the existing code has TWO calls to `useSimulationDataStore.getState()`:
```typescript
const ds = useSimulationDataStore.getState();  // for quality counters
// ... later ...
const dataStore = useSimulationDataStore.getState();  // for tileSnapshots
```

You can optimize this to a SINGLE call at the top:
```typescript
const ds = useSimulationDataStore.getState();
```
And then use `ds.tileSnapshots` where `dataStore.tileSnapshots` was used. But this is optional — both approaches work.

### CRITICAL RULES:
1. Do NOT change the `useEffect` or `subscribe` structure — only modify the callback body
2. The `energy` variable from calculateEnergy() now has `.perStation` — use it for accumulation
3. `DEFAULT_S_CLOCK_PERIOD` is already exported from params (check: it's 400ms)
4. The cumulative energy accumulation happens EVERY tick (each tick adds to the running total)
5. `countStationExits` needs `tileSnapshots` from simulationDataStore, NOT simulationStore
6. The final `setState` call must include ALL existing fields PLUS the 3 new OEE fields

### VALIDATION:
```bash
npx tsc --noEmit
```

Then test: start the simulator, run a work order, and check the browser console for errors. The KPI panel should now show FOEE instead of the old OEE formula.
````

### Validation Command:

```bash
cd Virtual-Factory && npx tsc --noEmit 2>&1 | head -20
```

---

## PHASE 5: Legacy OEE Cleanup

### Prompt — Copy-paste this into AntiGravity:

````
## TASK: Mark Legacy OEE as Deprecated (Phase 5 of 8)

In `src/lib/kpiCalculations.ts`, add a `@deprecated` JSDoc tag to the `calculateOEE` function. Do NOT delete it — other parts of the codebase might still reference it. Just mark it deprecated.

Change:
```typescript
/**
 * Calculate OEE = Availability × Performance × Quality × 100
 * ...existing JSDoc...
 */
export const calculateOEE = (conveyorSpeed: number, ftq: number, faultCount: number): number => {
```

To:
```typescript
/**
 * @deprecated Use hierarchical OEE from oeeCalculations.ts instead.
 * This legacy formula uses A×P×Q with synthetic availability.
 * The new system uses P×Q with real tile counting per machine.
 *
 * Calculate OEE = Availability × Performance × Quality × 100
 * ...keep existing JSDoc...
 */
export const calculateOEE = (conveyorSpeed: number, ftq: number, faultCount: number): number => {
```

That's it for this phase. The actual replacement happened in Phase 4 (useKPISync now uses foee.oee instead of calculateOEE).

### VALIDATION:
```bash
npx tsc --noEmit
# Also verify calculateOEE is no longer imported in useKPISync.ts:
grep "calculateOEE" src/hooks/useKPISync.ts
# Should return nothing (it was removed in Phase 4)
```
````

---

## PHASE 6: OEE Display Panel (UI Component)

### Prompt — Copy-paste this into AntiGravity:

````
## TASK: Create OEE Dashboard Panel Component (Phase 6 of 8)

Create a new React component `src/components/ui/OEEPanel.tsx` that displays the hierarchical OEE data from kpiStore. This panel has 3 view tabs: Machine, Line, Factory.

### DESIGN REQUIREMENTS

1. Use the existing `DraggablePanel` wrapper (import from `./DraggablePanel`)
2. Match the existing dark glassmorphism theme used by other panels
3. Use Tailwind CSS classes (the project uses Tailwind)
4. Bilingual support: use a simple `lang` state toggle (tr/en)
5. OEE color coding:
   - Green: ≥ 85% (`text-emerald-400`)
   - Yellow: 65-84% (`text-yellow-400`)
   - Red: < 65% (`text-red-400`)
6. Show Performance, Quality, OEE for each machine/line
7. Show In→Out tile counts and kWh/tile energy for each machine
8. Line 3 (Conveyor) should be visible in Line view with its own OEE

### DATA SOURCE

Read from `useKPIStore`:
```typescript
const factoryOEE = useKPIStore(state => state.factoryOEE);
const stationCounts = useKPIStore(state => state.stationCounts);
```

`factoryOEE` is a `FactoryOEE | null` object with structure:
```
factoryOEE.oee                    → number (0-100)
factoryOEE.bottleneck             → 'A' | 'B'
factoryOEE.bottleneckRate         → number
factoryOEE.finalOutput            → number (J)
factoryOEE.lines                  → LineOEE[] (3 items)
factoryOEE.lines[0].oee          → number (0-100)
factoryOEE.lines[0].machines     → MachineOEE[] (machines in this line)
factoryOEE.lines[0].energy       → { totalKwh, totalGas, totalCo2, kWhPerTile }
factoryOEE.energy.totalKwh       → number
factoryOEE.energy.kWhPerTile     → number
factoryOEE.energy.perStation     → Record<string, StationEnergy>
```

Each `MachineOEE` has:
```
machineId, name: {tr, en}, performance, quality, oee, actualInput, actualOutput, scrappedHere
```

Each `LineOEE` has:
```
lineId, name: {tr, en}, performance, quality, oee, machines, energy: {totalKwh, totalGas, totalCo2, kWhPerTile}
```

### COMPONENT STRUCTURE

```tsx
import React, { useState } from 'react';
import { useKPIStore } from '../../store/kpiStore';
import { OEE_THRESHOLD_GOOD, OEE_THRESHOLD_WARNING } from '../../lib/params';

type ViewMode = 'machine' | 'line' | 'factory';

function getOeeColor(oee: number): string {
  if (oee >= OEE_THRESHOLD_GOOD) return 'text-emerald-400';
  if (oee >= OEE_THRESHOLD_WARNING) return 'text-yellow-400';
  return 'text-red-400';
}

function getOeeBgColor(oee: number): string {
  if (oee >= OEE_THRESHOLD_GOOD) return 'bg-emerald-500/20';
  if (oee >= OEE_THRESHOLD_WARNING) return 'bg-yellow-500/20';
  return 'bg-red-500/20';
}

export default function OEEPanel() {
  const factoryOEE = useKPIStore(s => s.factoryOEE);
  const [view, setView] = useState<ViewMode>('machine');
  const [lang, setLang] = useState<'tr' | 'en'>('en');

  if (!factoryOEE) {
    return (
      <div className="p-4 text-center text-white/40 text-sm">
        {lang === 'tr' ? 'OEE verisi bekleniyor...' : 'Waiting for OEE data...'}
      </div>
    );
  }

  // ... render tabs and content based on view mode
}
```

### BUILD THE FULL COMPONENT with:

**Tab bar:** Three buttons [Machine] [Line] [Factory] — highlight active tab with `bg-white/10 rounded`

**Machine View:** Table with columns:
- Machine name (from `machine.name[lang]`)
- P (performance as %, show "—" for conveyor)
- Q (quality as %)
- OEE (colored by threshold)
- kWh/tile (from factoryOEE.energy.perStation[machine.machineId].kWhPerTile)
- In→Out (actualInput → actualOutput)

Group machines by line with subtle dividers:
- Line 1 header
- Press, Dryer, Glaze, Digital
- Line 3 header (conveyor separator)
- Conveyor
- Line 2 header
- Kiln, Sorting, Packaging

**Line View:** Table with columns:
- Line name (from `line.name[lang]`)
- P, Q, OEE (colored)
- Total kWh
- kWh/tile

**Factory View:** Big FOEE number + bottleneck info + energy summary:
- Large FOEE percentage with color coding
- "Bottleneck: Kiln (B = 8 tiles/min)" or "Press (A = 12)"
- Final output: J tiles
- Total energy: kWh + gas + CO₂
- kWh/tile efficiency

**Language toggle:** Small button in top-right corner switching tr/en.

### STYLING (match existing panels):

```
Panel background: bg-black/60 backdrop-blur-md border border-white/10 rounded-xl
Table headers: text-white/50 text-xs uppercase tracking-wide
Table cells: text-white/80 text-sm font-mono
Tab active: bg-white/10 text-white
Tab inactive: text-white/40 hover:text-white/60
Section headers: text-white/30 text-xs uppercase border-b border-white/5
```

### EXPORT:
Export as default: `export default function OEEPanel()`

Do NOT wrap in DraggablePanel for now — that integration will come later.
The panel should be a standalone component that can be placed anywhere.

### CRITICAL RULES:
1. Handle `factoryOEE === null` gracefully (show loading state)
2. Format percentages with 1 decimal: `oee.toFixed(1)`
3. Format kWh/tile with 2 decimals: `kWhPerTile.toFixed(2)`
4. Conveyor has P = "—" (not a percentage)
5. Use `OEE_THRESHOLD_GOOD` (85) and `OEE_THRESHOLD_WARNING` (65) from params
6. All 3 lines must be visible in Line view including Line 3 (Conveyor)
7. Do NOT use `useEffect` or `useState` for data fetching — just read from the store selector

### VALIDATION:
```bash
npx tsc --noEmit
```
````

### Validation Command:

```bash
cd Virtual-Factory && npx tsc --noEmit 2>&1 | head -20
```

---

## PHASE 7: CWF Agent Integration

### Prompt — Copy-paste this into AntiGravity:

````
## TASK: Add OEE Context to CWF Agent System Prompt (Phase 7 of 8)

Modify `src/lib/params/cwfAgent.ts` to add OEE system knowledge to the CWF (Chat With Factory) AI agent's system prompt.

### WHAT TO DO

Find the system prompt string in cwfAgent.ts. It should be a template literal or string constant that describes the factory to the AI agent.

Add the following section to the system prompt (find an appropriate place — near where KPIs or factory capabilities are described):

```
## OEE SYSTEM (Hierarchical Machine/Line/Factory)

This factory uses a real-world P × Q OEE model (no synthetic Availability factor):
- Performance (P) = actual output / theoretical capacity
- Quality (Q) = output / input (yield per machine)
- MOEE = P × Q per machine

### 8 Machine OEEs:
Line 1: Press (C/A), Dryer (D²/AC), Glaze (E²/AD), Digital (F²/AE)
Line 3: Conveyor (G_clean/F) — yield only, measures transit damage
Line 2: Kiln (GH/BG), Sorting (HI/BH), Packaging (IJ/BI)

### 3 Line OEEs (telescoped — intermediate variables cancel):
- Line 1 (Forming & Finishing): LOEE = F/A (digital output / press theoretical)
- Line 2 (Firing & Dispatch): LOEE = J/B (packaging output / kiln theoretical)
- Line 3 (Conveyor): LOEE = G_clean/F (clean transit yield)

### Factory OEE:
FOEE = J / min(A, B) — anchored to the bottleneck
- A = Press theoretical rate (12 tiles/min)
- B = Kiln theoretical rate (8 tiles/min)
- Kiln is typically the bottleneck (B < A), so FOEE ≈ J/B

### Diagnostic approach:
When asked about OEE, trace: FOEE → weakest LOEE → weakest MOEE → P vs Q
- Low P = machine slow, starved, or stopped frequently
- Low Q = machine creating defects or losing tiles
- Conveyor Q < 1.0 = jam damage during transit

### Energy:
Each machine has kWh/tile efficiency. Kiln dominates energy (100 kWh base + 100 m³ gas, 80% idle factor).
Factory energy = Σ all stations. Watch kWh/tile trends.
```

### CRITICAL RULES:
1. Do NOT remove any existing content from the system prompt
2. Add the OEE section — don't replace other sections
3. Keep the formatting consistent with the rest of the prompt

### VALIDATION:
```bash
npx tsc --noEmit
```
````

---

## PHASE 8: Supabase Persistence (Database Schema)

### Prompt — Copy-paste this into AntiGravity:

````
## TASK: Create Supabase Migration for OEE Snapshots (Phase 8 of 8)

Create a new Supabase migration file for the OEE snapshot table. This table stores periodic OEE calculations for historical analysis.

### CREATE FILE: `supabase/migrations/20260228_oee_snapshots.sql`

```sql
-- ═══════════════════════════════════════════════════════════════════
-- OEE Snapshots — Periodic OEE calculations per simulation session
-- Stores machine/line/factory OEE and energy data for historical analysis
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS oee_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  simulation_id UUID NOT NULL REFERENCES simulation_sessions(id) ON DELETE CASCADE,
  sim_tick INTEGER NOT NULL,
  elapsed_minutes NUMERIC NOT NULL,

  -- Station counts (A-J variables from real factory model)
  press_spawned INTEGER DEFAULT 0,
  press_output INTEGER DEFAULT 0,
  dryer_output INTEGER DEFAULT 0,
  glaze_output INTEGER DEFAULT 0,
  digital_output INTEGER DEFAULT 0,
  kiln_input INTEGER DEFAULT 0,
  kiln_output INTEGER DEFAULT 0,
  sorting_usable_output INTEGER DEFAULT 0,
  packaging_output INTEGER DEFAULT 0,
  conveyor_clean_output INTEGER DEFAULT 0,
  theoretical_a NUMERIC DEFAULT 0,
  theoretical_b NUMERIC DEFAULT 0,

  -- Machine OEEs (0-100 percentage scale)
  moee_press NUMERIC DEFAULT 0,
  moee_dryer NUMERIC DEFAULT 0,
  moee_glaze NUMERIC DEFAULT 0,
  moee_digital NUMERIC DEFAULT 0,
  moee_conveyor NUMERIC DEFAULT 0,
  moee_kiln NUMERIC DEFAULT 0,
  moee_sorting NUMERIC DEFAULT 0,
  moee_packaging NUMERIC DEFAULT 0,

  -- Line OEEs (0-100 percentage scale)
  loee_line1 NUMERIC DEFAULT 0,
  loee_line2 NUMERIC DEFAULT 0,
  loee_line3 NUMERIC DEFAULT 0,

  -- Factory OEE
  foee NUMERIC DEFAULT 0,
  bottleneck CHAR(1) DEFAULT 'B',

  -- Cumulative energy at this tick
  energy_total_kwh NUMERIC DEFAULT 0,
  energy_total_gas NUMERIC DEFAULT 0,
  energy_total_co2 NUMERIC DEFAULT 0,
  energy_kwh_per_tile NUMERIC DEFAULT 0,

  -- Per-station energy (cumulative kWh)
  energy_press_kwh NUMERIC DEFAULT 0,
  energy_dryer_kwh NUMERIC DEFAULT 0,
  energy_glaze_kwh NUMERIC DEFAULT 0,
  energy_digital_kwh NUMERIC DEFAULT 0,
  energy_conveyor_kwh NUMERIC DEFAULT 0,
  energy_kiln_kwh NUMERIC DEFAULT 0,
  energy_sorting_kwh NUMERIC DEFAULT 0,
  energy_packaging_kwh NUMERIC DEFAULT 0,
  energy_dryer_gas NUMERIC DEFAULT 0,
  energy_kiln_gas NUMERIC DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast lookup by simulation
CREATE INDEX IF NOT EXISTS idx_oee_snapshots_sim_tick
  ON oee_snapshots(simulation_id, sim_tick);

-- Index for time-range queries
CREATE INDEX IF NOT EXISTS idx_oee_snapshots_created
  ON oee_snapshots(simulation_id, created_at);

-- Enable RLS
ALTER TABLE oee_snapshots ENABLE ROW LEVEL SECURITY;

-- RLS policy: users can only see their own simulation data
-- (matches pattern used by other tables in this project)
CREATE POLICY "Users can manage own oee_snapshots"
  ON oee_snapshots
  FOR ALL
  USING (
    simulation_id IN (
      SELECT id FROM simulation_sessions
      WHERE simulation_sessions.id = oee_snapshots.simulation_id
    )
  );
```

### NOTE:
This migration creates the table. The actual sync logic (writing OEE snapshots to Supabase periodically) should be added to `src/services/syncService.ts` in a follow-up task. The sync would:
1. Every N ticks (e.g., every 50 ticks), capture current factoryOEE from kpiStore
2. Build an oee_snapshots row with all fields
3. Upsert to Supabase

For now, just create the migration file. The sync integration is a separate task.

### VALIDATION:
Check that the SQL file is syntactically valid:
```bash
cat supabase/migrations/20260228_oee_snapshots.sql
```
````

---

## POST-IMPLEMENTATION CHECKLIST

After all 8 phases are complete, run this final validation:

```bash
# 1. TypeScript compilation (zero errors)
npx tsc --noEmit

# 2. Check all new files exist
ls -la src/lib/params/oee.ts
ls -la src/lib/oeeCalculations.ts
ls -la src/components/ui/OEEPanel.tsx
ls -la supabase/migrations/20260228_oee_snapshots.sql

# 3. Check no regressions in existing code
grep "calculateOEE" src/hooks/useKPISync.ts  # Should NOT find the old import

# 4. Verify params barrel export
grep "oee" src/lib/params/index.ts  # Should find: export * from './oee'

# 5. Verify StationName is still 7 stations (NOT 8)
grep "StationName" src/store/types.ts | head -5

# 6. Build the project
npm run build
```

### Manual Testing Steps:

1. Start the simulator: `npm run dev`
2. Create a work order and start production
3. Open browser DevTools console — check for errors
4. Verify KPI panel shows OEE value that changes as tiles are produced
5. Import OEEPanel in a test page to verify it renders the 3-tab view
6. Check that energy values are accumulating (not resetting each tick)
7. Trigger a conveyor jam and verify MOEE_conveyor drops below 100%
8. Reset the factory and verify all OEE values return to 0/null

---

## TROUBLESHOOTING

### "Cannot find module './params/oee'"

→ Check that `src/lib/params/oee.ts` exists and `index.ts` has `export * from './oee'`

### "Property 'perStation' does not exist on type 'EnergyResult'"

→ Phase 1 wasn't applied. The EnergyResult interface in kpiCalculations.ts needs the perStation field.

### "Property 'factoryOEE' does not exist on type 'KPIState'"

→ Phase 3 wasn't applied. kpiStore.ts needs the new fields.

### OEE shows 0% even when tiles are flowing

→ Check `elapsedSimMinutes`. If `DEFAULT_S_CLOCK_PERIOD` import is wrong, the theoretical count will be 0. It should be 400 (ms).

### OEE shows > 100%

→ The theoretical rates (A=12, B=8) might be too low for the simulator's actual throughput. Increase them in `params/oee.ts`.

### Conveyor OEE is always 100%

→ Conveyor damage is only detected when `conveyor_jam_damage` appears in `defect_types`. Trigger a conveyor jam to see it drop.

### Energy kWh/tile is NaN

→ Division by zero: no tiles have been processed yet. The `safeDiv` function should prevent this, but check that packaging output > 0.
