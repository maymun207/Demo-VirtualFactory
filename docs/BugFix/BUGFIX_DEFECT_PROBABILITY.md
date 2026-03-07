# BUGFIX — Defect Probability Calculation in ConveyorBelt.tsx

> **Priority:** HIGH — This bug makes all 3 crisis scenarios (SCN-002, SCN-003, SCN-004) produce ~95% scrap rate instead of their expected ranges.

---

## 1. THE PROBLEM

**File:** `src/components/factory/ConveyorBelt.tsx`, lines 360–369

**Current code:**
```typescript
const { activeScenario } = useSimulationDataStore.getState();
const baseDefectProb = activeScenario
  ? Math.min(
      activeScenario.expectedDefects.reduce(
        (sum, d) => sum + d.probability_pct,
        0,
      ) / 100,
      0.95,
    )
  : DEFECT_PROBABILITY;
```

**What it does wrong:**

The code sums ALL individual defect `probability_pct` values and uses the total as the tile's overall defect probability. But `probability_pct` on each `ScenarioDefectExpectation` represents the individual defect type's occurrence rate — NOT its contribution to total scrap. These are independent probabilities that should NOT be summed for overall tile defect chance.

**Proof — current behavior:**

| Scenario | expectedDefects sum | baseDefectProb | Actual Scrap Rate | Expected Scrap Rate |
|----------|-------------------|----------------|-------------------|---------------------|
| SCN-001 Optimal | 0% (no defects) | 0.05 (baseline) | ~5% | 3–5% ✅ |
| SCN-002 Kiln Crisis | 35+20+15+10+10+10 = 100% | 0.95 (cap) | **~95%** | **25–35%** ❌ |
| SCN-003 Glaze Drift | 30+20+15+10+10+8+7 = 100% | 0.95 (cap) | **~95%** | **18–25%** ❌ |
| SCN-004 Cascade | 20+15+10+15+12+18+10 = 100% | 0.95 (cap) | **~95%** | **40–55%** ❌ |

All 3 crisis scenarios hit the 0.95 cap because their individual defect probabilities sum to ≥100%. This makes every scenario equally catastrophic and erases the distinction between SCN-002 (critical, 25–35% scrap), SCN-003 (high, 18–25% scrap), and SCN-004 (critical, 40–55% scrap).

---

## 2. THE FIX

### 2.1 Use `expectedScrapRange` for Overall Defect Probability

Each `ScenarioDefinition` already has an `expectedScrapRange` field that defines the INTENDED overall scrap percentage range. Use its midpoint as the base defect probability:

**Replace lines 360–369 in `src/components/factory/ConveyorBelt.tsx`:**

```typescript
// ── BEFORE (BUG) ─────────────────────────────────────────────────
const { activeScenario } = useSimulationDataStore.getState();
const baseDefectProb = activeScenario
  ? Math.min(
      activeScenario.expectedDefects.reduce(
        (sum, d) => sum + d.probability_pct,
        0,
      ) / 100,
      0.95,
    )
  : DEFECT_PROBABILITY;
```

```typescript
// ── AFTER (FIX) ──────────────────────────────────────────────────
// Use the scenario's expected scrap range midpoint as the overall
// tile defect probability. The individual defect type probabilities
// (in expectedDefects[].probability_pct) are used LATER at the
// sorting/snapshot stage to determine WHICH defect type occurred —
// they are NOT summed for overall defect chance.
const { activeScenario } = useSimulationDataStore.getState();
const baseDefectProb = activeScenario
  ? (activeScenario.expectedScrapRange.min + activeScenario.expectedScrapRange.max) / 200
  : DEFECT_PROBABILITY;
```

**Resulting behavior after fix:**

| Scenario | expectedScrapRange | Calculation | baseDefectProb | Actual Scrap |
|----------|-------------------|-------------|----------------|-------------|
| SCN-001 Optimal | { min: 3, max: 5 } | (3+5)/200 | **0.04** | ~4% ✅ |
| SCN-002 Kiln Crisis | { min: 25, max: 35 } | (25+35)/200 | **0.30** | ~30% ✅ |
| SCN-003 Glaze Drift | { min: 18, max: 25 } | (18+25)/200 | **0.215** | ~22% ✅ |
| SCN-004 Cascade | { min: 40, max: 55 } | (40+55)/200 | **0.475** | ~48% ✅ |

Now each scenario produces a DISTINCT, CORRECT scrap rate that matches its severity level and expected range.

### 2.2 Keep `expectedDefects[].probability_pct` for Defect TYPE Assignment

The individual `probability_pct` values in each `ScenarioDefectExpectation` should still be used when determining WHICH type of defect occurred on a tile (e.g., `crack_kiln` vs `warp_kiln` vs `color_fade`). This happens in `simulationDataStore.ts` → `getScenarioDefectTypes()` and is used when recording `TileSnapshotRecord.defect_types[]`. That logic is correct and should NOT be changed.

**The two-stage defect model is:**

1. **Stage 1 — ConveyorBelt.tsx (this fix):** Decide IF a tile is defective → uses `expectedScrapRange` midpoint
2. **Stage 2 — simulationDataStore.ts (already correct):** Decide WHAT defects the tile has → uses `expectedDefects[].probability_pct` as relative weights

---

## 3. VERIFICATION

After applying the fix, run these tests:

### 3.1 TypeScript Check
```bash
npx tsc --noEmit
```
Expected: 0 errors.

### 3.2 Build Check
```bash
npm run build
```
Expected: Success.

### 3.3 Runtime Test — SCN-001 (Optimal)
1. Open Demo Settings → Select SCN-001
2. Start simulation → Run for 60 seconds
3. Check: Waste bin should receive ~1 tile per 20 produced (3–5% rate)
4. Check: OEE should be 85–92%

### 3.4 Runtime Test — SCN-002 (Kiln Crisis)
1. Open Demo Settings → Select SCN-002
2. Start simulation → Run for 60 seconds
3. Check: Waste bin should receive ~6 tiles per 20 produced (25–35% rate)
4. Check: OEE should drop to 55–65%
5. **CRITICAL:** Confirm it is NOT ~19 out of 20 (which would indicate the bug persists)

### 3.5 Runtime Test — SCN-003 (Glaze Drift)
1. Select SCN-003 → Run for 60 seconds
2. Check: Scrap rate ~18–25% (NOT ~95%)
3. Check: OEE ~65–72%

### 3.6 Runtime Test — SCN-004 (Cascade)
1. Select SCN-004 → Run for 60 seconds
2. Check: Scrap rate ~40–55% (NOT ~95%)
3. Check: OEE ~30–45%
4. This should be the MOST destructive scenario — visibly more waste than SCN-002 and SCN-003

### 3.7 Differentiation Test
Run SCN-002 and SCN-003 back to back (30 seconds each). Confirm:
- SCN-002 produces MORE waste than SCN-003 (critical > high severity)
- SCN-004 produces MORE waste than SCN-002 (cascade > single-station failure)
- The scenarios are clearly distinguishable by waste bin fill rate

---

## 4. FILES AFFECTED

| File | Change |
|------|--------|
| `src/components/factory/ConveyorBelt.tsx` | Replace lines 360–369: use `expectedScrapRange` midpoint instead of `expectedDefects` sum |

**No other files need to change.** The `getScenarioDefectProbability()` function in `simulationDataStore.ts` can remain as-is for other potential use cases, but it is no longer called from ConveyorBelt.

---

## 5. CONSTRAINTS

- ❌ Do NOT modify `src/store/simulationStore.ts` (master store, never touch)
- ❌ Do NOT modify `src/lib/scenarios.ts` (scenario definitions are correct)
- ❌ Do NOT modify `src/store/simulationDataStore.ts` (existing functions are correct)
- ❌ Do NOT change the jam recovery multiplier logic (`JAM_SCRAP_RATE_MULTIPLIER`)
- ✅ Only change the `baseDefectProb` calculation in `ConveyorBelt.tsx`
