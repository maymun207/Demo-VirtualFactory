# STEP 3 — Store Integration: Scenario Loading, Defect Engine & KPI Propagation

> **Instruction to AI:** Read this document after completing STEP 2. You should have a working DemoSettingsPanel with scenario selector UI. Now integrate scenarios into the Zustand stores and simulation engine. This is the core logic step.

---

## 3.1 Pre-requisites

Before starting, confirm these are in place:
- `src/lib/scenarios.ts` — STEP 1 output (types + 4 scenarios)
- `src/components/ui/DemoSettingsPanel.tsx` — STEP 2 output (scenario UI with local state)
- `src/store/simulationDataStore.ts` — The file you will modify (ADD to, never remove existing code)
- `src/hooks/useSimulation.ts` — The file you will enhance (defect logic)
- `src/lib/params.ts` — You will add new constants here

---

## 3.2 Modify `src/store/simulationDataStore.ts`

### 3.2.1 Add New State Fields

In the store's state interface (find the existing interface definition), add:

```typescript
// ─── Scenario State ──────────────────────────────────────────────────
/** Currently active scenario, or null if no scenario is loaded. */
activeScenario: ScenarioDefinition | null;
/** ID of the active ScenarioActivationRecord (for tracking in Supabase). */
activeScenarioActivationId: string | null;
```

### 3.2.2 Add New Actions

Add these action signatures to the store interface:

```typescript
// ─── Scenario Actions ────────────────────────────────────────────────
/**
 * Load a scenario: apply all parameter overrides, set drift limits,
 * create ScenarioActivationRecord, log parameter changes.
 */
loadScenario: (scenario: ScenarioDefinition) => void;

/**
 * Clear the active scenario: reset to factory defaults,
 * deactivate the ScenarioActivationRecord, log system info alarm.
 */
clearScenario: () => void;

/**
 * Get the defect probability for a specific station under the current scenario.
 * Returns the base DEFECT_PROBABILITY if no scenario is active.
 */
getScenarioDefectProbability: (station: StationName) => number;

/**
 * Get the likely defect types for a station under the current scenario.
 * Returns empty array if no scenario or station not affected.
 */
getScenarioDefectTypes: (station: StationName) => { defectType: DefectType; probability_pct: number }[];
```

### 3.2.3 Implement `loadScenario`

```typescript
loadScenario: (scenario) => {
  const state = get();
  const simState = useSimulationStore.getState();
  const simTick = simState.sClockTick ?? 0;
  const prodTick = simState.pClockTick ?? 0;

  // 1. Store active scenario reference
  // 2. Apply all parameter overrides
  const paramChanges: ParameterChangeRecord[] = [];

  for (const override of scenario.parameterOverrides) {
    const currentValue = (state.currentParams[override.station] as Record<string, unknown>)?.[override.parameter];
    const oldValue = typeof currentValue === 'number' ? currentValue : undefined;

    // Apply parameter value
    state.updateParameter(
      override.station,
      override.parameter,
      override.value,
      'step' as ChangeType,
      'scenario' as ChangeReason
    );

    // Apply drift limit
    state.updateDriftLimit(override.station, override.parameter, override.driftLimit);

    // Record parameter change
    paramChanges.push({
      id: nanoid(),
      simulation_id: state.currentSession?.id ?? '',
      sim_tick: simTick,
      production_tick: prodTick,
      station: override.station,
      parameter_name: override.parameter,
      old_value: oldValue as number | undefined,
      new_value: override.value,
      change_magnitude: oldValue != null ? Math.abs(override.value - (oldValue as number)) : undefined,
      change_pct: oldValue != null && (oldValue as number) !== 0
        ? Math.abs(((override.value - (oldValue as number)) / (oldValue as number)) * 100)
        : undefined,
      change_type: 'step',
      change_reason: 'scenario',
      scenario_id: scenario.id,
      expected_impact: override.isOutOfRange ? 'Out of normal operating range — defects expected' : undefined,
      synced: false,
    });
  }

  // 3. Create ScenarioActivationRecord
  const activationId = nanoid();
  const activation: ScenarioActivationRecord = {
    id: activationId,
    simulation_id: state.currentSession?.id ?? '',
    scenario_id: scenario.id,
    scenario_code: scenario.code,
    activated_at_sim_tick: simTick,
    deactivated_at_sim_tick: undefined,
    duration_ticks: undefined,
    first_affected_tile_id: undefined,
    last_affected_tile_id: undefined,
    affected_tile_count: 0,
    actual_scrap_count: 0,
    actual_downgrade_count: 0,
    is_active: true,
    synced: false,
  };

  // 4. Add alarm log entry
  const alarmEntry: AlarmLogRecord = {
    id: nanoid(),
    simulation_id: state.currentSession?.id ?? '',
    sim_tick: simTick,
    alarm_type: 'system_info',
    severity: 'info',
    station_id: undefined,
    message: `Scenario ${scenario.code} (${scenario.name.en}) activated. Severity: ${scenario.severity}. Expected scrap: ${scenario.expectedScrapRange.min}–${scenario.expectedScrapRange.max}%`,
    timestamp: new Date().toISOString(),
    synced: false,
  };

  // 5. Set state
  set({
    activeScenario: scenario,
    activeScenarioActivationId: activationId,
    // Append to existing records
    parameterChanges: new Map([...state.parameterChanges, ...paramChanges.map(pc => [pc.id, pc] as [string, ParameterChangeRecord])]),
    scenarioActivations: new Map([...state.scenarioActivations, [activationId, activation]]),
    alarmLog: [...state.alarmLog, alarmEntry].slice(-MAX_ALARM_LOG),
    unsynced: {
      ...state.unsynced,
      parameterChanges: [...state.unsynced.parameterChanges, ...paramChanges.map(pc => pc.id)],
      scenarios: [...state.unsynced.scenarios, activationId],
      alarmLogs: [...state.unsynced.alarmLogs, alarmEntry.id],
    },
  });
},
```

**IMPORTANT:** The exact implementation depends on how the existing store structures its Maps and arrays. Read `simulationDataStore.ts` carefully to match the existing patterns for:
- How `parameterChanges` Map is structured
- How `scenarioActivations` Map is structured
- How `alarmLog` array is structured
- How `unsynced` tracking works

Adapt the code above to match the EXISTING patterns. Do NOT introduce new patterns.

### 3.2.4 Implement `clearScenario`

```typescript
clearScenario: () => {
  const state = get();
  const simState = useSimulationStore.getState();
  const simTick = simState.sClockTick ?? 0;

  // 1. Deactivate the ScenarioActivationRecord
  if (state.activeScenarioActivationId) {
    const activation = state.scenarioActivations.get(state.activeScenarioActivationId);
    if (activation) {
      const updated = {
        ...activation,
        is_active: false,
        deactivated_at_sim_tick: simTick,
        duration_ticks: simTick - activation.activated_at_sim_tick,
        synced: false,
      };
      state.scenarioActivations.set(state.activeScenarioActivationId, updated);
    }
  }

  // 2. Reset to factory defaults
  state.resetToFactoryDefaults();

  // 3. Log alarm
  const alarmEntry: AlarmLogRecord = {
    id: nanoid(),
    simulation_id: state.currentSession?.id ?? '',
    sim_tick: simTick,
    alarm_type: 'system_info',
    severity: 'info',
    message: `Scenario deactivated. Factory defaults restored.`,
    timestamp: new Date().toISOString(),
    synced: false,
  };

  // 4. Set state
  set({
    activeScenario: null,
    activeScenarioActivationId: null,
    alarmLog: [...state.alarmLog, alarmEntry].slice(-MAX_ALARM_LOG),
    unsynced: {
      ...state.unsynced,
      scenarios: [...state.unsynced.scenarios, state.activeScenarioActivationId!],
      alarmLogs: [...state.unsynced.alarmLogs, alarmEntry.id],
    },
  });
},
```

### 3.2.5 Implement `getScenarioDefectProbability`

```typescript
getScenarioDefectProbability: (station) => {
  const { activeScenario } = get();
  if (!activeScenario) return DEFECT_PROBABILITY; // from params.ts, default 0.05

  // Sum all expected defect probabilities for this station
  const stationDefects = activeScenario.expectedDefects.filter(
    d => d.primaryStation === station
  );

  if (stationDefects.length === 0) return DEFECT_PROBABILITY;

  // Convert the total defect percentage to a probability (0–1 scale)
  const totalPct = stationDefects.reduce((sum, d) => sum + d.probability_pct, 0);
  return Math.min(totalPct / 100, 0.95); // Cap at 95%
},
```

### 3.2.6 Implement `getScenarioDefectTypes`

```typescript
getScenarioDefectTypes: (station) => {
  const { activeScenario } = get();
  if (!activeScenario) return [];

  return activeScenario.expectedDefects
    .filter(d => d.primaryStation === station)
    .map(d => ({ defectType: d.defectType, probability_pct: d.probability_pct }));
},
```

### 3.2.7 Initialize New State Fields

In the store's initial state (the create function), add defaults:

```typescript
activeScenario: null,
activeScenarioActivationId: null,
```

---

## 3.3 Enhance Defect Generation in `src/hooks/useSimulation.ts`

### 3.3.1 Find the Existing Defect Logic

In `useSimulation.ts`, locate where defect detection happens. Look for:
- References to `DEFECT_PROBABILITY`
- Where `defect_detected` is set on tile snapshots
- Where tiles are marked as defective for sorting

### 3.3.2 Replace Flat Probability with Scenario-Aware Logic

**Current (simplified):**
```typescript
const isDefective = Math.random() < DEFECT_PROBABILITY;
```

**New:**
```typescript
const { getScenarioDefectProbability, getScenarioDefectTypes, activeScenario } = useSimulationDataStore.getState();

// Get scenario-aware defect probability for this station
const defectProb = getScenarioDefectProbability(currentStation);
const isDefective = Math.random() < defectProb;

// If defective, determine which defect types based on scenario
let assignedDefects: DefectType[] = [];
if (isDefective && activeScenario) {
  const stationDefects = getScenarioDefectTypes(currentStation);
  // Weighted random selection based on relative probabilities
  for (const { defectType, probability_pct } of stationDefects) {
    if (Math.random() < (probability_pct / 100)) {
      assignedDefects.push(defectType);
    }
  }
  // Ensure at least one defect if tile is defective
  if (assignedDefects.length === 0 && stationDefects.length > 0) {
    assignedDefects.push(stationDefects[0].defectType);
  }
} else if (isDefective) {
  // Fallback: use generic defect type for the station (existing behavior)
  assignedDefects.push('unknown');
}
```

### 3.3.3 Record Defects in Tile Snapshots

When creating `TileSnapshotRecord` for a station visit, include:
```typescript
defect_detected: isDefective,
defect_types: assignedDefects.length > 0 ? assignedDefects : undefined,
defect_severity: assignedDefects.length > 0 ? Math.min(assignedDefects.length * 0.2, 1.0) : 0,
```

### 3.3.4 Cumulative Defects

Tiles accumulate defects across stations. When a tile arrives at a new station:
1. Check the tile's existing defects from previous snapshots
2. Add any new defects from the current station
3. The cumulative defect count affects the final quality grade at sorting

---

## 3.4 Update KPI Propagation

### 3.4.1 In `src/lib/kpiCalculations.ts` or `src/store/kpiStore.ts`

When a scenario is active, the KPI calculations should reflect the scenario's impact:

**OEE Impact:**
- The quality component of OEE (Q = good_tiles / total_tiles) naturally decreases as more tiles get defected
- No need to artificially adjust — if defect generation is correct, OEE will drop naturally

**Energy Impact:**
- When scenario parameters push stations outside normal ranges, energy consumption should increase
- In `energyConfig.ts`, the consumption formula already considers conveyor speed
- Add a scenario energy multiplier:
  ```typescript
  const scenarioEnergyMultiplier = activeScenario
    ? 1 + (activeScenario.expectedEnergyImpact.min + activeScenario.expectedEnergyImpact.max) / 200
    : 1.0;
  ```
- Apply this multiplier to the per-tick energy calculation

**Scrap Rate:**
- Naturally handled by increased defect probability → more tiles sorted to waste bin
- No artificial adjustment needed

---

## 3.5 Connect DemoSettingsPanel to Store

### 3.5.1 Replace Local State with Store State

In `DemoSettingsPanel.tsx`, replace the local `activeScenarioId` state with store state:

```typescript
// Remove local state
// const [activeScenarioId, setActiveScenarioId] = useState<string | null>(null);

// Use store state instead
const activeScenario = useSimulationDataStore(s => s.activeScenario);
const loadScenario = useSimulationDataStore(s => s.loadScenario);
const clearScenario = useSimulationDataStore(s => s.clearScenario);

const activeScenarioId = activeScenario?.id ?? null;

const handleLoadScenario = (scenario: ScenarioDefinition) => {
  loadScenario(scenario);
  setCauseEffectOpen(true);
  // Refresh UI values from store
  setParamValues(buildInitialValues());
};

const handleClearScenario = () => {
  clearScenario();
  setCauseEffectOpen(false);
  setParamValues(buildInitialValues());
};
```

---

## 3.6 Add Constants to `src/lib/params.ts`

Add these to `params.ts` in the appropriate sections:

```typescript
// ═══════════════════════════════════════════════════════════════════
// SCENARIO — Severity colors and configuration
// ═══════════════════════════════════════════════════════════════════

/** Color map for scenario severity levels (used in DemoSettingsPanel cards) */
export const SCENARIO_SEVERITY_COLORS: Record<string, string> = {
  low: '#22c55e',
  medium: '#3b82f6',
  high: '#f59e0b',
  critical: '#ef4444',
} as const;

/** Color map for severity levels — Tailwind-compatible class fragments */
export const SCENARIO_SEVERITY_CLASSES: Record<string, {
  bg: string; text: string; border: string; glow: string;
}> = {
  low:      { bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/30', glow: 'shadow-emerald-500/20' },
  medium:   { bg: 'bg-blue-500/15',    text: 'text-blue-400',    border: 'border-blue-500/30',    glow: 'shadow-blue-500/20' },
  high:     { bg: 'bg-amber-500/15',   text: 'text-amber-400',   border: 'border-amber-500/30',   glow: 'shadow-amber-500/20' },
  critical: { bg: 'bg-red-500/15',     text: 'text-red-400',     border: 'border-red-500/30',     glow: 'shadow-red-500/20' },
} as const;
```

---

## 3.7 Update ScenarioActivation Tracking During Simulation

When tiles are produced under an active scenario, update the `ScenarioActivationRecord`:

In the simulation tick (wherever tiles are finalized/scrapped), add:
```typescript
const { activeScenario, activeScenarioActivationId, scenarioActivations } = useSimulationDataStore.getState();

if (activeScenarioActivationId) {
  const activation = scenarioActivations.get(activeScenarioActivationId);
  if (activation) {
    activation.affected_tile_count += 1;
    if (tileIsScrapped) activation.actual_scrap_count += 1;
    if (tileIsDowngraded) activation.actual_downgrade_count += 1;
    if (!activation.first_affected_tile_id) activation.first_affected_tile_id = tile.id;
    activation.last_affected_tile_id = tile.id;
    activation.synced = false; // Mark for re-sync
  }
}
```

---

## 3.8 Verification Checklist

After completing store integration:

- [ ] `simulationDataStore` has `activeScenario`, `loadScenario()`, `clearScenario()`, `getScenarioDefectProbability()`, `getScenarioDefectTypes()`
- [ ] Loading a scenario from DemoSettingsPanel writes parameter changes to the store
- [ ] ParameterChangeRecords with `change_reason: 'scenario'` are created for each override
- [ ] ScenarioActivationRecord is created with `is_active: true`
- [ ] AlarmLogRecord entry is created when scenario loads and when it clears
- [ ] Defect probability increases at affected stations when scenario is active
- [ ] Defect types are correctly assigned based on scenario expected defects
- [ ] Tiles accumulate defects across stations
- [ ] OEE naturally drops as more tiles are scrapped
- [ ] Energy calculation includes scenario multiplier
- [ ] Clearing scenario resets all parameters to factory defaults
- [ ] ScenarioActivationRecord is updated with `is_active: false` on clear
- [ ] No TypeScript errors
- [ ] Existing simulation behavior is unchanged when no scenario is active (DEFECT_PROBABILITY = 0.05)

**Report back with:** List of modified files, new function signatures added, and test results showing defect rate difference between SCN-001 (baseline) and SCN-002 (kiln crisis).
