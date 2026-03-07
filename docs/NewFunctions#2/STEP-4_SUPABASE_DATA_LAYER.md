# STEP 4 — Supabase Data Layer: Migration, Sync Service & Data Integrity

> **Instruction to AI:** Read this document after completing STEP 3. The simulation engine now supports scenarios. This step ensures ALL scenario data is correctly persisted to Supabase. This is CRITICAL — the data generated here will be consumed by an AI agent (LLM) in the next project phase to perform root cause analysis on defects. Missing or malformed data is unacceptable.

---

## 4.1 Why This Matters

In the next project phase, an AI agent (LLM powered by Anthropic's Claude) will:
1. Receive a `simulation_id` (session_code)
2. Query Supabase tables to understand what happened during that simulation
3. Analyze: "Why was OEE so low? Which parameters were out of range? Which defects occurred? What was the root cause?"
4. Generate actionable insights and recommendations

**For the AI agent to work, it needs COMPLETE, ACCURATE, SESSION-SCOPED data in Supabase.** Every tile, every snapshot, every parameter change, every alarm MUST be synced.

---

## 4.2 Pre-requisites

Before starting, confirm:
- `src/services/syncService.ts` — The existing batch sync engine (you will modify this)
- `supabase/migrations/` — Existing migration files (you will add a new one)
- `src/store/types.ts` — All record types with `synced: boolean` flags
- `src/store/simulationDataStore.ts` — Now has `activeScenario`, `loadScenario()`, etc. from STEP 3

---

## 4.3 New Supabase Migration

Create a new migration file: `supabase/migrations/20260217_add_defect_scenarios.sql`

```sql
-- ============================================================================
-- MIGRATION: Add defect_scenarios reference table + seed 4 scenarios
-- ============================================================================

-- 1. Create defect_scenarios table (reference data, read-only at runtime)
CREATE TABLE IF NOT EXISTS defect_scenarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  name_tr TEXT NOT NULL,
  name_en TEXT NOT NULL,
  description_tr TEXT,
  description_en TEXT,
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  parameter_overrides JSONB NOT NULL DEFAULT '[]'::jsonb,
  expected_defects JSONB NOT NULL DEFAULT '[]'::jsonb,
  expected_scrap_range JSONB NOT NULL DEFAULT '{}'::jsonb,
  expected_oee_range JSONB NOT NULL DEFAULT '{}'::jsonb,
  expected_energy_impact JSONB NOT NULL DEFAULT '{}'::jsonb,
  cause_effect_table JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Add RLS policy (allow anon read access)
ALTER TABLE defect_scenarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anonymous read access to defect_scenarios"
  ON defect_scenarios
  FOR SELECT
  TO anon
  USING (true);

-- 3. Add scenario_code column to scenario_activations (if not exists)
-- This allows quick lookup without joining to defect_scenarios
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scenario_activations' AND column_name = 'scenario_code'
  ) THEN
    ALTER TABLE scenario_activations ADD COLUMN scenario_code TEXT;
  END IF;
END $$;

-- 4. Add scenario_id to parameter_change_events (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'parameter_change_events' AND column_name = 'scenario_id'
  ) THEN
    ALTER TABLE parameter_change_events ADD COLUMN scenario_id UUID REFERENCES defect_scenarios(id);
  END IF;
END $$;

-- 5. Create index for fast scenario lookup
CREATE INDEX IF NOT EXISTS idx_scenario_activations_simulation
  ON scenario_activations(simulation_id);

CREATE INDEX IF NOT EXISTS idx_scenario_activations_active
  ON scenario_activations(is_active) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_parameter_changes_scenario
  ON parameter_change_events(scenario_id) WHERE scenario_id IS NOT NULL;

-- 6. Seed 4 scenarios
-- NOTE: The actual JSONB content should match the ScenarioDefinition objects
-- from src/lib/scenarios.ts. Insert the full scenario data here.

INSERT INTO defect_scenarios (code, name_tr, name_en, description_tr, description_en, severity, parameter_overrides, expected_defects, expected_scrap_range, expected_oee_range, expected_energy_impact, cause_effect_table)
VALUES
  ('SCN-001', 'Optimal Üretim', 'Optimal Production',
   'Tüm parametreler optimal aralıklarda. İdeal üretim koşullarını temsil eder.',
   'All parameters within optimal ranges. Represents ideal production conditions.',
   'low',
   '[]'::jsonb, '[]'::jsonb,
   '{"min": 3, "max": 5}'::jsonb,
   '{"min": 85, "max": 92}'::jsonb,
   '{"min": 0, "max": 0}'::jsonb,
   '[]'::jsonb),

  ('SCN-002', 'Fırın Sıcaklık Krizi', 'Kiln Temperature Crisis',
   'Fırın Zon-5 sıcaklığı ayar noktasının +18–25°C üzerine çıkıyor. Soğutma gradyanı çok agresif.',
   'Kiln Zone-5 temperature deviates +18–25°C above setpoint. Cooling gradient too aggressive.',
   'critical',
   '[]'::jsonb, '[]'::jsonb,
   '{"min": 25, "max": 35}'::jsonb,
   '{"min": 55, "max": 65}'::jsonb,
   '{"min": 15, "max": 20}'::jsonb,
   '[]'::jsonb),

  ('SCN-003', 'Sır Viskozite Kayması', 'Glaze Viscosity Drift',
   'Sır bulamacı viskozitesi spek altına düşer. Nozüller kısmen tıkanır.',
   'Glaze slurry viscosity drops below spec. Nozzles partially clog.',
   'high',
   '[]'::jsonb, '[]'::jsonb,
   '{"min": 18, "max": 25}'::jsonb,
   '{"min": 65, "max": 72}'::jsonb,
   '{"min": 8, "max": 10}'::jsonb,
   '[]'::jsonb),

  ('SCN-004', 'Çoklu İstasyon Kaskad Arızası', 'Multi-Station Cascade Failure',
   'Eş zamanlı arızalar: Pres kalıbı aşınmış, kurutma fanı düşmüş, sır nozülleri tıkalı.',
   'Simultaneous failures: worn press mold, dryer fan drop, clogged glaze nozzles.',
   'critical',
   '[]'::jsonb, '[]'::jsonb,
   '{"min": 40, "max": 55}'::jsonb,
   '{"min": 30, "max": 45}'::jsonb,
   '{"min": 25, "max": 35}'::jsonb,
   '[]'::jsonb)
ON CONFLICT (code) DO NOTHING;

-- NOTE: The JSONB columns (parameter_overrides, expected_defects, cause_effect_table)
-- are seeded with empty arrays above. The FULL scenario data lives in the frontend
-- TypeScript code (src/lib/scenarios.ts). If you want to also populate the DB with
-- the full JSONB data, generate it from the ScenarioDefinition objects and run an
-- UPDATE statement. However, the frontend scenarios.ts is the source of truth at runtime.
```

**IMPORTANT:** Run this migration in Supabase. If you're using the Supabase CLI:
```bash
supabase db push
```
Or apply manually through the Supabase SQL Editor in the dashboard.

---

## 4.4 Verify Existing Sync Service

Open `src/services/syncService.ts` and verify it already syncs these record types:

| Record Type | Supabase Table | Must Sync? | Already Syncing? |
|-------------|---------------|------------|-----------------|
| Machine states (7 types) | `machine_*_states` | ✅ Yes | Check |
| TileRecord | `tiles` | ✅ Yes | Check |
| TileSnapshotRecord | `tile_station_snapshots` | ✅ Yes | Check |
| ParameterChangeRecord | `parameter_change_events` | ✅ Yes | Check |
| ScenarioActivationRecord | `scenario_activations` | ✅ Yes | Check |
| ProductionMetricsRecord | `production_metrics` | ✅ Yes | Check |
| AlarmLogRecord | `simulation_alarm_logs` | ✅ Yes | Check |

### 4.4.1 If Any Are Missing, Add Them

For each missing sync, follow the existing pattern in `syncService.ts`. The pattern is:

```typescript
// 1. Get unsynced record IDs from the store
const unsyncedIds = state.unsynced.{category};

// 2. Batch-fetch records from the store's Map/Array
const records = unsyncedIds.map(id => state.{recordMap}.get(id)).filter(Boolean);

// 3. Transform records for Supabase (remove 'synced' field, convert Maps to objects)
const payload = records.map(r => {
  const { synced, ...rest } = r;
  return rest;
});

// 4. Upsert to Supabase
const { error } = await supabase.from('{table_name}').upsert(payload);

// 5. Mark as synced in the store
if (!error) {
  records.forEach(r => { r.synced = true; });
  state.unsynced.{category} = [];
}
```

### 4.4.2 Ensure ScenarioActivation Sync Includes scenario_code

When syncing `ScenarioActivationRecord` to `scenario_activations` table, ensure the payload includes:
- `scenario_code` — the 'SCN-001' etc. code (needed for easy querying by the AI agent)
- `scenario_id` — the UUID (FK to `defect_scenarios` table)

### 4.4.3 Ensure ParameterChangeRecord Sync Includes scenario_id

When syncing `ParameterChangeRecord` to `parameter_change_events` table, include:
- `scenario_id` — UUID FK to `defect_scenarios` (nullable, only set when `change_reason === 'scenario'`)
- `change_reason` — must be `'scenario'` for scenario-driven changes

---

## 4.5 Data Integrity Queries

After implementing, run these queries in Supabase SQL Editor to verify data integrity. These are the same queries the AI agent will use:

### 4.5.1 Get Scenario Summary for a Session
```sql
SELECT
  sa.scenario_code,
  ds.name_en AS scenario_name,
  ds.severity,
  sa.activated_at_sim_tick,
  sa.deactivated_at_sim_tick,
  sa.affected_tile_count,
  sa.actual_scrap_count,
  sa.actual_downgrade_count
FROM scenario_activations sa
LEFT JOIN defect_scenarios ds ON sa.scenario_id = ds.id::text
WHERE sa.simulation_id = '{SESSION_ID}';
```

### 4.5.2 Get All Parameter Changes for a Scenario Activation
```sql
SELECT
  pce.station,
  pce.parameter_name,
  pce.old_value,
  pce.new_value,
  pce.change_magnitude,
  pce.change_pct,
  pce.change_reason,
  pce.expected_impact
FROM parameter_change_events pce
WHERE pce.simulation_id = '{SESSION_ID}'
  AND pce.change_reason = 'scenario'
ORDER BY pce.station, pce.parameter_name;
```

### 4.5.3 Get Tile Defect Summary
```sql
SELECT
  tss.station,
  tss.defect_detected,
  tss.defect_types,
  tss.defect_severity,
  tss.parameters_snapshot,
  t.status,
  t.final_grade
FROM tile_station_snapshots tss
JOIN tiles t ON tss.tile_id = t.id
WHERE tss.simulation_id = '{SESSION_ID}'
  AND tss.defect_detected = true
ORDER BY t.tile_number, tss.station_order;
```

### 4.5.4 Get OEE Trend During Scenario
```sql
SELECT
  period_start_sim_tick,
  period_end_sim_tick,
  total_tiles_produced,
  first_quality_count,
  scrap_count,
  oee_pct,
  quality_pct,
  availability_pct,
  performance_pct
FROM production_metrics
WHERE simulation_id = '{SESSION_ID}'
ORDER BY period_start_sim_tick;
```

### 4.5.5 Get Alarm Log for Scenario Run
```sql
SELECT
  sim_tick,
  alarm_type,
  severity,
  station_id,
  message,
  timestamp
FROM simulation_alarm_logs
WHERE simulation_id = '{SESSION_ID}'
ORDER BY sim_tick;
```

---

## 4.6 TileSnapshotRecord — The Most Critical Table

The `tile_station_snapshots` table is **THE MOST VALUABLE data for the AI agent**. Each row is a "passport stamp" — it records what the machine parameters were AND what happened to the tile when it passed through each station.

Verify that when writing snapshots, the `parameters_snapshot` JSONB field contains:

```json
{
  "pressure_bar": 260,
  "cycle_time_sec": 6.2,
  "mold_temperature_c": 52,
  "powder_moisture_pct": 8.5,
  "fill_amount_g": 750,
  "mold_wear_pct": 42,
  "scenario_active": true,
  "scenario_code": "SCN-004"
}
```

**Add `scenario_active` and `scenario_code` fields** to the `parameters_snapshot` object so the AI agent can easily identify which snapshots were taken under scenario conditions without joining to `scenario_activations`.

In `simulationDataStore.ts`, wherever `TileSnapshotRecord` is created, modify the `parameters_snapshot` construction:

```typescript
const paramsSnapshot: Record<string, unknown> = {
  ...currentStationParams,
};

// Append scenario context if active
const { activeScenario } = useSimulationDataStore.getState();
if (activeScenario) {
  paramsSnapshot.scenario_active = true;
  paramsSnapshot.scenario_code = activeScenario.code;
}
```

---

## 4.7 Session Lifecycle Integrity

Ensure these invariants hold:

1. **One session per simulation run:** Starting simulation → creates a new `SimulationSession` in Supabase. Stopping/resetting → marks it as `completed`/`abandoned`.

2. **Scenario activation scoped to session:** Each `ScenarioActivationRecord.simulation_id` matches the current session. If a new session starts, any previous scenario activation is automatically deactivated.

3. **No orphan records:** All records (tiles, snapshots, parameter changes, alarms) must have a valid `simulation_id`. If the session hasn't been created yet, queue the records until session creation.

4. **Reset behavior:** When user clicks "Reset" (not just "Stop"):
   - Session status → `completed`
   - Active scenario → deactivated
   - All pending records → sync to Supabase before clearing local state

---

## 4.8 Verification Checklist

After completing Supabase integration:

- [ ] `defect_scenarios` table exists in Supabase with 4 seeded scenarios
- [ ] Run a simulation with SCN-002 (Kiln Crisis) for ~30 seconds, then stop
- [ ] Query `scenario_activations` — find one record with `scenario_code = 'SCN-002'`, `is_active = false`
- [ ] Query `parameter_change_events` — find ~8 records with `change_reason = 'scenario'`
- [ ] Query `tiles` — find tiles with `status = 'sorted'` or `status = 'completed'` (some scrapped)
- [ ] Query `tile_station_snapshots` — find snapshots with `defect_detected = true` at kiln station
- [ ] Verify `parameters_snapshot` JSONB includes `scenario_active: true` and `scenario_code: 'SCN-002'`
- [ ] Query `simulation_alarm_logs` — find "Scenario SCN-002 activated" and any threshold alarms
- [ ] Query `production_metrics` — find OEE values in the 55–65% range (matching SCN-002 expectation)
- [ ] All records have the same `simulation_id` (session isolation confirmed)
- [ ] syncService.ts has no errors in browser console during sync cycles

**Report back with:** Migration applied confirmation, screenshot of Supabase table data (or query results), and count of records created during a 30-second SCN-002 test run.
