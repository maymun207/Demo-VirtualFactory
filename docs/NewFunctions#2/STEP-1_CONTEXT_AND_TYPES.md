# STEP 1 — Project Context, Architecture Analysis & Type Definitions

> **Instruction to AI:** Read this document FIRST. Do NOT write any code yet. Analyze the existing codebase, confirm you understand the architecture, and then create ONLY the type definitions and scenario data file described at the end. Report back with a summary of what you created and any compatibility issues you found.

---

## 1.1 Project Overview

You are working on **Virtual-Factory** — a 3D Digital Twin ceramic tile production line simulator.


- **Tech Stack:** React 19, TypeScript 5.9, Vite 7, React Three Fiber v9.5, Zustand v5, Supabase, Tailwind CSS v4

---

## 1.2 Files You MUST Read Before Doing Anything

Open and read these files in this exact order. Do not proceed until you have read all of them:

1. **`src/store/types.ts`** — ALL type definitions. Contains `StationName`, `DefectType`, `QualityGrade`, `DefectScenario`, `ScenarioActivationRecord`, `TriggerCondition`, `ParameterChangeRecord`, and 30+ other types. This is the source of truth for the type system.

2. **`src/lib/params.ts`** — CENTRALIZED parameter module. Contains ALL constants, initial station data, KPI defaults, defect thresholds, energy config, alarm thresholds, colors, geometry, and factory functions. NO other file should contain hardcoded values.

3. **`src/components/ui/machineTooltipConfig.ts`** — Parameter definitions for all 7 stations. Each station has a `params` array with `key`, `label` (TR/EN), `unit`, and `range` (min/max). These ranges are the "normal operating ranges" — values outside these ranges cause defects.

4. **`src/store/simulationDataStore.ts`** — The data-layer Zustand store. Contains `currentParams`, `parameterDriftLimits`, `updateParameter()`, `updateDriftLimit()`, `resetToFactoryDefaults()`, tile tracking, snapshot recording, and unsynced record management. This is where scenario loading logic will be added.

5. **`src/components/ui/DemoSettingsPanel.tsx`** — The existing Demo Settings modal. Has left sidebar with 7 machines + General tab, right content with parameter table (Parameter, Range, Unit, Value, Δ%), Commit and Reference buttons. This is where the scenario UI will be added.

6. **`src/services/syncService.ts`** — Batch sync engine that writes to Supabase every 10 seconds. Syncs machine states, tiles, snapshots, parameter changes, scenario activations, metrics, and alarm logs.

7. **`src/hooks/useSimulation.ts`** — Main simulation tick loop. Handles tile creation, movement, defect detection, sorting, and collection.

8. **`src/lib/kpiCalculations.ts`** — OEE formula, energy calculations, CO₂ factor calculations.

---

## 1.3 Architecture Summary

### Store Architecture (4 Zustand stores)
| Store | File | Purpose | Modify? |
|-------|------|---------|---------|
| `simulationStore` | `src/store/simulationStore.ts` | S-Clock, P-Clock, conveyor state, speed | ❌ NEVER MODIFY — this is the MASTER store |
| `simulationDataStore` | `src/store/simulationDataStore.ts` | Machine params, tiles, snapshots, parameter changes, drift | ✅ ADD scenario actions here |
| `kpiStore` | `src/store/kpiStore.ts` | KPI calculations (OEE, FTQ, Scrap, Energy) | ✅ May need scenario-aware adjustments |
| `uiStore` | `src/store/uiStore.ts` | UI panel visibility, language | ⚠️ Minor additions only if needed |

### Production Line — 7 Stations

| # | Station | StationName Key | Parameters (with normal ranges) |
|---|---------|-----------------|-------------------------------|
| 1 | Press | `press` | pressure_bar (280–450), cycle_time_sec (4–8), mold_temperature_c (40–60), powder_moisture_pct (5–7), fill_amount_g (800–2500), mold_wear_pct (0–30) |
| 2 | Dryer | `dryer` | inlet_temperature_c (150–250), outlet_temperature_c (80–120), belt_speed_m_min (1–5), drying_time_min (30–60), exit_moisture_pct (0.5–1.5), fan_frequency_hz (30–50) |
| 3 | Glaze | `glaze` | glaze_density_g_cm3 (1.35–1.55), glaze_viscosity_sec (18–35), application_weight_g_m2 (300–600), cabin_pressure_bar (0.3–1.2), nozzle_angle_deg (15–45), belt_speed_m_min (15–35), glaze_temperature_c (20–30) |
| 4 | Digital Print | `printer` | head_temperature_c (35–45), ink_viscosity_mpa_s (8–15), drop_size_pl (6–80), resolution_dpi (360–720), belt_speed_m_min (20–45), head_gap_mm (1.5–4), active_nozzle_pct (95–100) |
| 5 | Kiln | `kiln` | max_temperature_c (1100–1220), firing_time_min (35–60), preheat_gradient_c_min (15–40), cooling_gradient_c_min (20–50), belt_speed_m_min (1–3), atmosphere_pressure_mbar (-0.5–+0.5), o2_level_pct (2–8) |
| 6 | Sorting | `sorting` | camera_resolution_mp (5–20), scan_rate_tiles_min (20–60), size_tolerance_mm (0.3–1.0), color_tolerance_de (0.5–2.0), flatness_tolerance_mm (0.1–0.5), defect_threshold_mm2 (0.5–3.0) |
| 7 | Packaging | `packaging` | stack_count (4–12), box_sealing_pressure_bar (2–5), pallet_capacity_m2 (40–80), stretch_tension_pct (150–300), robot_speed_cycles_min (6–15), label_accuracy_pct (99–100) |

### Existing Type System (already in `src/store/types.ts`)

These types are ALREADY defined — do NOT redefine them:
- `DefectScenario` — Has `trigger_conditions`, `affected_stations`, `likely_defects`, `scrap_probability_pct`
- `ScenarioActivationRecord` — Has `scenario_id`, `scenario_code`, `activated_at_sim_tick`, `affected_tile_count`, `is_active`
- `TriggerCondition` — Has `station`, `parameter`, `condition`, `threshold`
- `ParameterChangeRecord` — Has `change_type`, `change_reason`, `scenario_id`, `old_value`, `new_value`
- `DefectType` — 30+ defect types across all stations
- `ChangeReason` — Includes `'scenario'` as a valid value

---

## 1.4 TASK: Create Type Definitions & Scenario Data File

### 1.4.1 Create `src/lib/scenarios.ts`

Create a NEW file. Define these interfaces and export 4 scenario objects:

```typescript
// src/lib/scenarios.ts

import type { StationName, DefectType } from '../store/types';

/**
 * A single parameter override within a scenario.
 * Specifies the exact value and drift allowance for one parameter at one station.
 */
export interface ScenarioParameterOverride {
  station: StationName;
  parameter: string;          // key from machineTooltipConfig (e.g., 'pressure_bar')
  value: number;              // the scenario override value
  driftLimit: number;         // drift % for this param under this scenario
  isOutOfRange: boolean;      // true if value falls outside the normal min–max
  normalRange: { min: number; max: number };  // reference for display
}

/**
 * Expected defect outcome from a scenario.
 */
export interface ScenarioDefectExpectation {
  defectType: DefectType;
  probability_pct: number;              // 0–100
  primaryStation: StationName;          // which station triggers this defect
  description: { tr: string; en: string };
}

/**
 * A single row in the cause-effect reference table.
 * Explains WHY a parameter deviation causes specific defects.
 */
export interface CauseEffectRow {
  station: StationName;
  parameter: string;
  parameterLabel: { tr: string; en: string };
  deviation: { tr: string; en: string };        // e.g., "Maksimumun 18°C üzerinde" / "+18°C above max"
  consequence: { tr: string; en: string };       // e.g., "Siyah çekirdek ve termal şok çatlakları oluşturur"
  expectedDefects: DefectType[];
  affectedKPIs: string[];                        // e.g., ['oee', 'ftq', 'scrap', 'energy']
  severityColor: 'red' | 'orange' | 'green';    // for UI color coding
}

/**
 * Complete scenario definition with all parameters, expected outcomes, and explanations.
 */
export interface ScenarioDefinition {
  id: string;
  code: string;                                   // 'SCN-001' to 'SCN-004'
  name: { tr: string; en: string };
  description: { tr: string; en: string };
  severity: 'low' | 'medium' | 'high' | 'critical';

  parameterOverrides: ScenarioParameterOverride[];
  expectedDefects: ScenarioDefectExpectation[];
  causeEffectTable: CauseEffectRow[];

  expectedScrapRange: { min: number; max: number };
  expectedOEERange: { min: number; max: number };
  expectedEnergyImpact: { min: number; max: number };  // % increase from baseline
}
```

### 1.4.2 Define 4 Scenarios in the Same File

#### Scenario 1: "Optimal Production" (SCN-001)
- **Severity:** `low`
- **Name TR:** "Optimal Üretim" / **EN:** "Optimal Production"
- **Description TR:** "Tüm parametreler optimal aralıklarda. İdeal üretim koşullarını temsil eder." / **EN:** "All parameters within optimal ranges. Represents ideal production conditions."
- **Parameter overrides:** Factory defaults from `params.ts` (mid-range values). Set ALL station parameters to their midpoint values.
  - Press: pressure_bar=365, cycle_time_sec=6, mold_temperature_c=50, powder_moisture_pct=6, fill_amount_g=1650, mold_wear_pct=10
  - Dryer: inlet_temperature_c=200, outlet_temperature_c=100, belt_speed_m_min=3, drying_time_min=45, exit_moisture_pct=1.0, fan_frequency_hz=40
  - Glaze: glaze_density_g_cm3=1.45, glaze_viscosity_sec=26, application_weight_g_m2=450, cabin_pressure_bar=0.75, nozzle_angle_deg=30, belt_speed_m_min=25, glaze_temperature_c=25
  - Printer: head_temperature_c=40, ink_viscosity_mpa_s=11.5, drop_size_pl=43, resolution_dpi=540, belt_speed_m_min=32, head_gap_mm=2.75, active_nozzle_pct=98
  - Kiln: max_temperature_c=1160, firing_time_min=47, preheat_gradient_c_min=27, cooling_gradient_c_min=35, belt_speed_m_min=2, atmosphere_pressure_mbar=0, o2_level_pct=5
  - Sorting: camera_resolution_mp=12, scan_rate_tiles_min=40, size_tolerance_mm=0.65, color_tolerance_de=1.25, flatness_tolerance_mm=0.3, defect_threshold_mm2=1.75
  - Packaging: stack_count=8, box_sealing_pressure_bar=3.5, pallet_capacity_m2=60, stretch_tension_pct=225, robot_speed_cycles_min=10, label_accuracy_pct=99.5
- **Drift limits:** 2–3% across all parameters
- **isOutOfRange:** false for ALL parameters
- **Expected defect rate:** ~3–5% baseline
- **Expected scrap:** { min: 3, max: 5 }
- **Expected OEE:** { min: 85, max: 92 }
- **Expected energy impact:** { min: 0, max: 0 } (baseline)
- **causeEffectTable:** Empty array (no deviations)

#### Scenario 2: "Kiln Temperature Crisis" (SCN-002)
- **Severity:** `critical`
- **Name TR:** "Fırın Sıcaklık Krizi" / **EN:** "Kiln Temperature Crisis"
- **Description TR:** "Fırın Zon-5 sıcaklığı ayar noktasının +18–25°C üzerine çıkıyor. Soğutma gradyanı çok agresif. Siyah çekirdek, termal şok çatlakları ve çarpılma defektleri üretir." / **EN:** "Kiln Zone-5 temperature deviates +18–25°C above setpoint. Cooling gradient too aggressive. Produces black core, thermal shock cracks, and warping defects."
- **Parameter overrides (only deviated stations):**
  - `kiln`: max_temperature_c=1238 (isOutOfRange=true), cooling_gradient_c_min=55 (isOutOfRange=true), o2_level_pct=1.5 (isOutOfRange=true), atmosphere_pressure_mbar=0.8 (isOutOfRange=true), firing_time_min=62 (isOutOfRange=true), preheat_gradient_c_min=45 (isOutOfRange=true), belt_speed_m_min=0.8 (isOutOfRange=true). Drift limits: 8–12%
  - `sorting`: defect_threshold_mm2=2.8 (isOutOfRange=false, within range but near max), color_tolerance_de=1.8 (isOutOfRange=false). Drift limits: 5%
- **Expected defects:**
  - crack_kiln — 35% at kiln — "Aşırı sıcaklık stresi çatlak oluşturur" / "Excessive thermal stress causes cracking"
  - warp_kiln — 20% at kiln — "Dengesiz soğutma çarpılmaya neden olur" / "Uneven cooling causes warping"
  - color_fade — 15% at kiln — "Aşırı pişirme renk solmasına neden olur" / "Over-firing causes color fading"
  - thermal_shock_crack — 10% at kiln — "Hızlı soğutma termal şok çatlağı oluşturur" / "Rapid cooling creates thermal shock cracks"
  - size_variance_kiln — 10% at kiln — "Sıcaklık sapması boyut varyansı yaratır" / "Temperature deviation creates dimensional variance"
  - pinhole_kiln — 10% at kiln — "Atmosfer basıncı sapması pinhole oluşturur" / "Atmosphere pressure deviation creates pinholes"
- **Expected scrap:** { min: 25, max: 35 }
- **Expected OEE:** { min: 55, max: 65 }
- **Expected energy impact:** { min: 15, max: 20 }
- **causeEffectTable:** 4–6 rows explaining kiln parameter → defect → KPI relationships

#### Scenario 3: "Glaze Viscosity Drift" (SCN-003)
- **Severity:** `high`
- **Name TR:** "Sır Viskozite Kayması" / **EN:** "Glaze Viscosity Drift"
- **Description TR:** "Sır bulamacı viskozitesi sıcaklık artışı ve yoğunluk değişimi nedeniyle spek altına düşer. Nozüller kısmen tıkanır. Sır akma defektleri, pinholes ve renk tutarsızlığı üretir. Baskı makinesini de etkiler." / **EN:** "Glaze slurry viscosity drops below spec due to temperature rise and density change. Nozzles partially clog. Produces glaze flow defects, pinholes, and color inconsistency. Cascades into printer issues."
- **Parameter overrides (3 stations affected):**
  - `glaze`: glaze_viscosity_sec=15 (isOutOfRange=true), glaze_density_g_cm3=1.30 (isOutOfRange=true), application_weight_g_m2=250 (isOutOfRange=true), glaze_temperature_c=34 (isOutOfRange=true), nozzle_angle_deg=50 (isOutOfRange=true), cabin_pressure_bar=0.2 (isOutOfRange=true). Drift limits: 10–15%
  - `printer`: head_temperature_c=48 (isOutOfRange=true), ink_viscosity_mpa_s=6 (isOutOfRange=true), active_nozzle_pct=88 (isOutOfRange=true). Drift limits: 8%
  - `dryer`: exit_moisture_pct=2.0 (isOutOfRange=true). Drift limits: 5%
- **Expected defects:**
  - glaze_drip — 30% at glaze — "Düşük viskozite sır akmasına neden olur" / "Low viscosity causes glaze dripping"
  - pinhole_glaze — 20% at glaze — "Kabin basıncı düşüklüğü pinhole oluşturur" / "Low cabin pressure creates pinholes"
  - color_tone_variance — 15% at glaze — "Yoğunluk sapması renk tutarsızlığı yaratır" / "Density deviation creates color inconsistency"
  - line_defect_glaze — 10% at glaze — "Nozül tıkanması çizgi defekti oluşturur" / "Nozzle clog creates line defects"
  - edge_buildup — 10% at glaze — "Nozül açısı sapması kenar birikimi yaratır" / "Nozzle angle deviation causes edge buildup"
  - line_defect_print — 8% at printer — "Sır kalıntısı baskı nozüllerini etkiler" / "Glaze residue affects print nozzles"
  - white_spot — 7% at printer — "Mürekkep viskozite düşüklüğü beyaz nokta oluşturur" / "Low ink viscosity creates white spots"
- **Expected scrap:** { min: 18, max: 25 }
- **Expected OEE:** { min: 65, max: 72 }
- **Expected energy impact:** { min: 8, max: 10 }
- **causeEffectTable:** 6–8 rows covering glaze→printer cascade

#### Scenario 4: "Multi-Station Cascade Failure" (SCN-004)
- **Severity:** `critical`
- **Name TR:** "Çoklu İstasyon Kaskad Arızası" / **EN:** "Multi-Station Cascade Failure"
- **Description TR:** "Eş zamanlı arızalar: Pres kalıbı aşınmış, kurutma fanı düşmüş, sır nozülleri tıkalı, fırında sıcaklık düşüşü, ayıklama kamerası kaymış. Vardiya sonu biriken arızaları simüle eder." / **EN:** "Simultaneous failures: worn press mold, dryer fan drop, clogged glaze nozzles, kiln under-firing, sorting camera drift. Simulates end-of-shift compounding failures."
- **Parameter overrides (ALL 7 stations affected):**
  - `press`: pressure_bar=260 (isOutOfRange=true), mold_wear_pct=42 (isOutOfRange=true), powder_moisture_pct=8.5 (isOutOfRange=true), fill_amount_g=750 (isOutOfRange=true). Drift: 15%
  - `dryer`: inlet_temperature_c=280 (isOutOfRange=true), fan_frequency_hz=25 (isOutOfRange=true), exit_moisture_pct=2.5 (isOutOfRange=true). Drift: 12%
  - `glaze`: glaze_viscosity_sec=40 (isOutOfRange=true), nozzle_angle_deg=12 (isOutOfRange=true), cabin_pressure_bar=1.5 (isOutOfRange=true). Drift: 15%
  - `printer`: active_nozzle_pct=82 (isOutOfRange=true), head_gap_mm=5 (isOutOfRange=true), head_temperature_c=50 (isOutOfRange=true). Drift: 12%
  - `kiln`: max_temperature_c=1080 (isOutOfRange=true), firing_time_min=30 (isOutOfRange=true). Drift: 15%
  - `sorting`: camera_resolution_mp=4 (isOutOfRange=true), defect_threshold_mm2=3.5 (isOutOfRange=true). Drift: 20%
  - `packaging`: box_sealing_pressure_bar=1.5 (isOutOfRange=true), stretch_tension_pct=120 (isOutOfRange=true). Drift: 15%
- **Expected defects:** ALL defect types active. Top ones:
  - edge_defect — 20% at press
  - crack_press — 15% at press
  - explosion_dry — 10% at dryer
  - glaze_drip — 15% at glaze
  - white_spot — 12% at printer
  - warp_kiln — 18% at kiln
  - chip — 10% at packaging
- **Expected scrap:** { min: 40, max: 55 }
- **Expected OEE:** { min: 30, max: 45 }
- **Expected energy impact:** { min: 25, max: 35 }
- **causeEffectTable:** 10–14 rows covering all stations

---

## 1.5 Verification Checklist

After creating `src/lib/scenarios.ts`, verify:

- [ ] All `StationName` values match the type definition in `types.ts`
- [ ] All `DefectType` values used exist in the `DefectType` union in `types.ts`
- [ ] All parameter `key` strings match the `key` field in `machineTooltipConfig.ts`
- [ ] All `normalRange` values match the `range` field in `machineTooltipConfig.ts`
- [ ] The file compiles with no TypeScript errors
- [ ] The file follows the existing JSDoc documentation pattern (see `params.ts` header comments)
- [ ] Export a `SCENARIOS` array containing all 4 scenario objects
- [ ] Export a `getScenarioByCode(code: string)` helper function
- [ ] Export a `getScenarioById(id: string)` helper function

**Report back with:** File created, line count, any type compatibility issues found, and confirmation that all parameter keys match machineTooltipConfig.
