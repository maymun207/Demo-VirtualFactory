# STEP 5 — End-to-End Testing, Verification & Final Polish

> **Instruction to AI:** This is the FINAL step. All code should be written. Now test everything end-to-end, fix bugs, polish UI, and verify data integrity. Run through each scenario and document the results.

---

## 5.1 Pre-requisites

All previous steps must be complete:
- [x] STEP 1: `src/lib/scenarios.ts` created with 4 scenarios and types
- [x] STEP 2: `DemoSettingsPanel.tsx` has scenario selector, cause-effect table, impact summary
- [x] STEP 3: `simulationDataStore.ts` has `loadScenario/clearScenario`, defect engine enhanced
- [x] STEP 4: Supabase migration applied, syncService verified, data integrity queries tested

---

## 5.2 End-to-End Test Protocol

Run each of these 4 test scenarios. For EACH scenario, follow these exact steps:

### Test Template (repeat for each scenario):

1. **Open the application** in the browser
2. **Open Demo Settings** panel (header button)
3. **Click the scenario card** (e.g., SCN-002)
4. **Verify UI response:**
   - Scenario card shows "ACTIVE" badge with correct severity glow
   - Impact summary bar shows expected OEE/Scrap/Energy ranges
   - Parameter table values update for affected machines
   - Out-of-range parameters highlighted in red
   - Cause-effect table appears below parameters (for affected stations only)
5. **Click through machine tabs** in the sidebar:
   - Verify each affected machine shows updated (scenario) values
   - Verify cause-effect table filters to show only rows for that machine
   - Verify unaffected machines show factory default values (green)
6. **Close Demo Settings** panel
7. **Start the simulation** (toggle data flow)
8. **Observe for 30–60 seconds:**
   - Watch tile movement on the conveyor
   - Check: Do more tiles go to Waste Bin than in baseline?
   - Check: KPI panel — does OEE drop? Does Scrap rise? Does Energy increase?
   - Check: Defect Heatmap — do relevant defect types show elevated values?
   - Check: Alarm Log — do threshold alarms appear?
9. **Stop the simulation**
10. **Check Supabase data** (run the queries from STEP 4, Section 4.5)
11. **Open Demo Settings** → click "Reset Scenario" → verify everything returns to defaults
12. **Start simulation again** → verify baseline behavior is restored

---

## 5.3 Test Scenario Results Table

Fill this table after running each test:

### SCN-001: Optimal Production (Baseline)

| Metric | Expected | Actual | Pass? |
|--------|----------|--------|-------|
| Scenario card active | ✓ green glow | | |
| Parameter table | All green (in-range) | | |
| Cause-effect table | Empty/hidden | | |
| OEE after 60s | 85–92% | | |
| Scrap rate | 3–5% | | |
| Energy | Baseline | | |
| Waste bin count (per 20 tiles) | 0–1 | | |
| Defect heatmap | Low values (all < 2%) | | |
| Alarm log | No threshold alarms | | |
| Supabase: scenario_activations | 1 record, code='SCN-001' | | |
| Supabase: parameter_change_events | ~40+ records (all stations) | | |
| Supabase: tile_station_snapshots | defect_detected mostly false | | |

### SCN-002: Kiln Temperature Crisis

| Metric | Expected | Actual | Pass? |
|--------|----------|--------|-------|
| Scenario card active | ✓ red glow (critical) | | |
| Parameter table (Kiln tab) | 4+ params in red (out-of-range) | | |
| Cause-effect table (Kiln tab) | 4–6 rows visible | | |
| OEE after 60s | 55–65% | | |
| Scrap rate | 25–35% | | |
| Energy | +15–20% above baseline | | |
| Waste bin count (per 20 tiles) | 5–7 | | |
| Defect heatmap | crack_kiln, warp_kiln elevated | | |
| Alarm log | OEE alert, quality alerts | | |
| Supabase: snapshots at kiln | defect_detected=true ~30% | | |
| Supabase: snapshot params | scenario_active=true, code=SCN-002 | | |

### SCN-003: Glaze Viscosity Drift

| Metric | Expected | Actual | Pass? |
|--------|----------|--------|-------|
| Scenario card active | ✓ amber glow (high) | | |
| Parameter table (Glaze tab) | 6 params in red | | |
| Parameter table (Printer tab) | 3 params in red | | |
| Parameter table (Dryer tab) | 1 param in red | | |
| Cause-effect table (Glaze tab) | 5+ rows | | |
| Cause-effect table (Printer tab) | 2+ rows | | |
| OEE after 60s | 65–72% | | |
| Scrap rate | 18–25% | | |
| Energy | +8–10% | | |
| Waste bin count (per 20 tiles) | 3–5 | | |
| Defect heatmap | glaze_drip, pinhole elevated | | |
| Alarm log | Quality and FTQ alerts | | |

### SCN-004: Multi-Station Cascade Failure

| Metric | Expected | Actual | Pass? |
|--------|----------|--------|-------|
| Scenario card active | ✓ red glow (critical) | | |
| Parameter table | ALL machine tabs have red params | | |
| Cause-effect table | Every machine tab has rows | | |
| OEE after 60s | 30–45% | | |
| Scrap rate | 40–55% | | |
| Energy | +25–35% | | |
| Waste bin count (per 20 tiles) | 8–11 | | |
| Defect heatmap | Multiple types elevated | | |
| Alarm log | Multiple critical alarms | | |
| Supabase: total alarms | 10+ alarm records | | |

---

## 5.4 Common Issues & Fixes

### Issue: OEE doesn't drop enough
**Cause:** Defect probability not propagating correctly to tile sorting
**Fix:** Verify `getScenarioDefectProbability()` returns correct values. Add console.log at defect decision point:
```typescript
console.log(`Station ${station}: defectProb=${defectProb}, isDefective=${isDefective}, scenario=${activeScenario?.code}`);
```

### Issue: Parameter table doesn't update when scenario loads
**Cause:** `buildInitialValues()` called before store update completes
**Fix:** Use `setTimeout(() => setParamValues(buildInitialValues()), 100)` or use Zustand's `subscribe` to react to store changes

### Issue: Cause-effect table empty for affected machine
**Cause:** `causeEffectTable` rows have different station key than `selectedMachine`
**Fix:** Verify station keys match between `scenarios.ts` causeEffectTable and `DEMO_SETTINGS_MACHINES` keys

### Issue: Supabase sync fails / records missing
**Cause:** `synced` flag not being set correctly, or records created before session exists
**Fix:** Check `syncService.ts` for each record type. Ensure `simulation_id` is set before creating records.

### Issue: Energy doesn't increase under scenario
**Cause:** Energy multiplier not applied in `kpiCalculations.ts`
**Fix:** Add scenario energy factor to the energy calculation pipeline

### Issue: Alarm log doesn't show scenario activation
**Cause:** `alarmLog` array not being updated or `MAX_ALARM_LOG` truncating too aggressively
**Fix:** Verify the alarm entry is pushed and the array slice keeps recent entries

---

## 5.5 UI Polish Checklist

- [ ] Scenario cards have smooth hover transitions (300ms)
- [ ] Active scenario card has pulsing glow animation (use CSS `@keyframes` or Tailwind `animate-pulse`)
- [ ] Impact summary bar animates in when scenario is selected (opacity + translateY)
- [ ] Cause-effect table collapse/expand has smooth transition
- [ ] Out-of-range parameters have a subtle red background tint (not just border)
- [ ] "Reset Scenario" button has a confirmation behavior (or is clearly destructive-styled)
- [ ] All text renders correctly in both TR and EN
- [ ] No text overflow or truncation issues on smaller viewports
- [ ] Severity badges have consistent sizing across all 4 cards
- [ ] Scenario card descriptions don't exceed 2 lines (use `line-clamp-2` or equivalent)

---

## 5.6 Code Quality Checklist

- [ ] All new functions have JSDoc comments (matching existing pattern in the project)
- [ ] No `console.log` left in production code (remove after debugging)
- [ ] No `any` types — all types are explicit
- [ ] No hardcoded strings in components — all constants in `params.ts`, all translations in bilingual objects
- [ ] All new constants added to `params.ts` with section headers and JSDoc
- [ ] `scenarios.ts` has comprehensive file-level JSDoc header (matching `params.ts` style)
- [ ] No unused imports
- [ ] TypeScript compiles with zero errors: `npx tsc --noEmit`
- [ ] ESLint passes: `npm run lint`
- [ ] Build succeeds: `npm run build`

---

## 5.7 File Change Summary

List ALL files that were created or modified across all 5 steps:

### New Files Created
| File | Step | Description |
|------|------|-------------|
| `src/lib/scenarios.ts` | STEP 1 | Scenario type definitions + 4 scenario objects |
| `supabase/migrations/20260217_add_defect_scenarios.sql` | STEP 4 | DB migration for defect_scenarios table |

### Files Modified
| File | Step | What Changed |
|------|------|-------------|
| `src/store/simulationDataStore.ts` | STEP 3 | Added `activeScenario`, `loadScenario()`, `clearScenario()`, `getScenarioDefectProbability()`, `getScenarioDefectTypes()` |
| `src/components/ui/DemoSettingsPanel.tsx` | STEP 2 | Added scenario selector cards, impact summary, cause-effect table, out-of-range highlighting, reset button |
| `src/lib/params.ts` | STEP 3 | Added `SCENARIO_SEVERITY_COLORS`, `SCENARIO_SEVERITY_CLASSES` constants |
| `src/hooks/useSimulation.ts` | STEP 3 | Enhanced defect detection with scenario-aware probabilities and defect type assignment |
| `src/services/syncService.ts` | STEP 4 | Verified/added sync for scenario_activations, parameter_change_events with scenario_id |
| `src/lib/kpiCalculations.ts` | STEP 3 | Added scenario energy multiplier |
| `src/store/types.ts` | STEP 1 | Verified compatibility, possibly added ScenarioDefinition export |

### Files NOT Modified (verify these are untouched)
| File | Reason |
|------|--------|
| `src/store/simulationStore.ts` | MASTER store — NEVER modify |
| `src/components/factory/Scene.tsx` | 3D scene — no changes needed |
| `src/components/factory/ConveyorBelt.tsx` | Conveyor — no changes needed |
| `src/App.tsx` | Root component — no changes needed |

---

## 5.8 Deployment Verification

1. **Run build:** `npm run build` — must succeed with zero errors
2. **Run preview:** `npm run preview` — test locally before deploying
3. **Push to master:** `git add . && git commit -m "feat: scenario-based simulation system with 4 predefined scenarios"` 
4. **Vercel auto-deploys** from master branch
5. **Test on production URL:** `https://virtual-factory.vercel.app`
6. **Verify Supabase connectivity:** Open DevTools console, check for Supabase errors during sync cycles

---

## 5.9 Final Deliverable Confirmation

After ALL tests pass, confirm:

1. ✅ 4 scenarios are selectable from DemoSettingsPanel
2. ✅ Each scenario correctly modifies station parameters
3. ✅ Out-of-range parameters are visually highlighted
4. ✅ Cause-effect reference table educates users on parameter → defect relationships
5. ✅ Simulation produces higher defect rates under crisis scenarios
6. ✅ KPIs (OEE, FTQ, Scrap, Energy) reflect scenario impact
7. ✅ ALL data is persisted to Supabase with correct `simulation_id` scoping
8. ✅ An AI agent can query the session data and understand: which scenario was active, what parameters were changed, which tiles were defected, at which stations, with what root causes
9. ✅ Resetting a scenario cleanly restores factory defaults
10. ✅ The application builds and deploys without errors

**Report back with:** Final file change summary, test results for all 4 scenarios, and confirmation that the build succeeds.
