# STEP 2 — DemoSettingsPanel UI: Scenario Selector, Cause-Effect Table & Impact Summary

> **Instruction to AI:** Read this document after completing STEP 1. You should have already created `src/lib/scenarios.ts`. Now modify the existing `src/components/ui/DemoSettingsPanel.tsx` to add scenario management UI. Do NOT touch any store logic yet — this step is UI only. Use the scenario data from `src/lib/scenarios.ts` for display.

---

## 2.1 Pre-requisites

Before starting, verify these files exist and are accessible:
- `src/lib/scenarios.ts` — Created in STEP 1 (ScenarioDefinition types + 4 scenario objects + SCENARIOS array)
- `src/components/ui/DemoSettingsPanel.tsx` — The existing file you will modify
- `src/lib/params.ts` — For color constants and any new params you add
- `src/store/uiStore.ts` — For `currentLang` (language toggle)

---

## 2.2 Current DemoSettingsPanel Structure

The existing panel has this layout:
```
┌──────────────────────────────────────────────────────────┐
│  [Settings2 icon]  Demo Settings                    [X]  │  ← Header Bar
├──────────────┬───────────────────────────────────────────┤
│  Press       │  Press                                    │
│  Dryer       │  ┌─────────────────────────────────────┐  │
│  Glaze       │  │ Parameter │ Range │ Unit │ Val │ Δ% │  │  ← Parameter Table
│  Digital Print│  │ Pressure  │280-450│ bar  │365 │ 5  │  │
│  Kiln        │  │ Cycle Time│ 4-8   │  s   │ 6  │ 5  │  │
│  Sorting     │  │ ...       │       │      │    │    │  │
│  Packaging   │  └─────────────────────────────────────┘  │
│  General     │                                           │
│              │                                           │
│  [Commit]    │                                           │
│  [Reference] │                                           │
└──────────────┴───────────────────────────────────────────┘
```

---

## 2.3 New Layout After Modifications

```
┌──────────────────────────────────────────────────────────┐
│  [Settings2 icon]  Demo Settings                    [X]  │  ← Header Bar (unchanged)
├──────────────────────────────────────────────────────────┤
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │
│  │ SCN-001  │ │ SCN-002  │ │ SCN-003  │ │ SCN-004  │   │  ← NEW: Scenario Selector Cards
│  │ Optimal  │ │ Kiln     │ │ Glaze    │ │ Cascade  │   │
│  │ ●low     │ │ ●critical│ │ ●high    │ │ ●critical│   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘   │
│  ┌─ Impact: OEE 85-92% │ Scrap 3-5% │ Energy +0% ──┐   │  ← NEW: Impact Summary (shown when scenario selected)
│  └──────────────────────────────────────────────────┘   │
├──────────────┬───────────────────────────────────────────┤
│  Press       │  Press                                    │
│  Dryer       │  ┌─────────────────────────────────────┐  │
│  Glaze       │  │ Parameter │ Range │ Unit │ Val │ Δ% │  │  ← Parameter Table (existing, values updated by scenario)
│  Digital Print│  │ Pressure  │280-450│ bar  │260 │ 15 │  │     Out-of-range values highlighted in RED
│  Kiln        │  │ ...       │       │      │    │    │  │
│  Sorting     │  └─────────────────────────────────────┘  │
│  Packaging   │                                           │
│  General     │  ▼ CAUSE-EFFECT REFERENCE                 │  ← NEW: Collapsible cause-effect table
│              │  ┌─────────────────────────────────────┐  │
│  [Commit]    │  │ Param  │Deviation│Defects│KPI Impact│  │
│  [Reference] │  │ Press..│-20bar.. │crack..│OEE,Scrap │  │
│  [Reset Scn] │  │ ...    │        │       │          │  │  ← NEW: Reset Scenario button
│              │  └─────────────────────────────────────┘  │
└──────────────┴───────────────────────────────────────────┘
```

---

## 2.4 Implementation Details

### 2.4.1 Scenario Selector Cards (Top Section)

Add a horizontal scrollable row above the sidebar/content split area (inside the panel, below the header bar).

**Component structure:**
```tsx
<div className="flex gap-3 px-4 py-3 border-b border-white/10 overflow-x-auto shrink-0">
  {SCENARIOS.map(scenario => (
    <ScenarioCard
      key={scenario.id}
      scenario={scenario}
      isActive={activeScenarioId === scenario.id}
      currentLang={currentLang}
      onClick={() => handleLoadScenario(scenario)}
    />
  ))}
</div>
```

**ScenarioCard design:**
- Width: `min-w-[160px]` or `clamp(140px, 18vw, 200px)`
- Background: `bg-white/[0.04]` default, `bg-white/[0.08]` when active
- Left border: 3px solid severity color (critical=`#ef4444`, high=`#f59e0b`, medium=`#3b82f6`, low=`#22c55e`)
- Active state: Add pulsing glow shadow using the severity color: `shadow-[0_0_15px_${severityColor}40]`
- Content layout:
  ```
  ┌────────────────────┐
  │ SCN-001       ●low │  ← code + severity badge
  │ Optimal Production │  ← name (in currentLang)
  │ All params optimal │  ← truncated description (max 2 lines)
  │        [ACTIVE ✓]  │  ← only when active
  └────────────────────┘
  ```
- Severity badge: Small pill with `text-[10px]` uppercase, colored background matching severity
- When active: Show "ACTIVE ✓" or "AKTİF ✓" badge at bottom right with a pulse animation
- Hover: `hover:bg-white/[0.06]` + slight scale `hover:scale-[1.02]`
- Transition: `transition-all duration-300`

**Severity color map (add to `params.ts` if not present):**
```typescript
export const SCENARIO_SEVERITY_COLORS = {
  low: '#22c55e',
  medium: '#3b82f6',
  high: '#f59e0b',
  critical: '#ef4444',
} as const;
```

### 2.4.2 Impact Summary Bar

Show only when a scenario is selected. Positioned below the scenario cards.

**Layout:** Horizontal strip with 4 metric pills:
```tsx
<div className="flex items-center gap-3 px-4 py-2 border-b border-white/10 bg-white/[0.02]">
  <ImpactPill label="OEE" value={`${scenario.expectedOEERange.min}–${scenario.expectedOEERange.max}%`} color={oeeColor} />
  <ImpactPill label="Scrap" value={`${scenario.expectedScrapRange.min}–${scenario.expectedScrapRange.max}%`} color={scrapColor} />
  <ImpactPill label="Energy" value={`+${scenario.expectedEnergyImpact.min}–${scenario.expectedEnergyImpact.max}%`} color={energyColor} />
  <ImpactPill label={currentLang === 'tr' ? 'Seviye' : 'Severity'} value={scenario.severity.toUpperCase()} color={severityColor} />
</div>
```

**ImpactPill:** `px-3 py-1.5 rounded-lg bg-{color}/10 border border-{color}/20 text-{color}`

### 2.4.3 Cause-Effect Reference Table

Add below the existing parameter table in the right content area. Only show when:
1. A scenario is active (not null)
2. The current machine tab has entries in `scenario.causeEffectTable` for that station

**Implementation:**

```tsx
// Filter causeEffectTable rows for the currently selected machine
const relevantCauseEffects = activeScenario?.causeEffectTable.filter(
  row => row.station === selectedMachine
) ?? [];
```

**Layout — Collapsible section:**
```tsx
{relevantCauseEffects.length > 0 && (
  <div className="mt-6">
    <button onClick={() => setCauseEffectOpen(!causeEffectOpen)} className="flex items-center gap-2 text-sm font-bold text-white/80 mb-3">
      <span className={`transition-transform ${causeEffectOpen ? 'rotate-90' : ''}`}>▶</span>
      {currentLang === 'tr' ? '📋 Neden-Sonuç Referans Tablosu' : '📋 Cause-Effect Reference Table'}
    </button>
    
    {causeEffectOpen && (
      <table>
        <thead>
          <tr>
            <th>{currentLang === 'tr' ? 'Parametre' : 'Parameter'}</th>
            <th>{currentLang === 'tr' ? 'Sapma' : 'Deviation'}</th>
            <th>{currentLang === 'tr' ? 'Beklenen Defektler' : 'Expected Defects'}</th>
            <th>{currentLang === 'tr' ? 'Sonuç' : 'Consequence'}</th>
            <th>{currentLang === 'tr' ? 'Etkilenen KPI' : 'Affected KPIs'}</th>
          </tr>
        </thead>
        <tbody>
          {relevantCauseEffects.map(row => (
            <tr style={{ borderLeft: `3px solid ${severityColorMap[row.severityColor]}` }}>
              <td>{row.parameterLabel[currentLang]}</td>
              <td>{row.deviation[currentLang]}</td>
              <td>{row.expectedDefects.join(', ')}</td>
              <td>{row.consequence[currentLang]}</td>
              <td>{row.affectedKPIs.map(kpi => <KPIBadge key={kpi} kpi={kpi} />)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )}
  </div>
)}
```

**Table styling:**
- Same glassmorphism style as existing parameter table
- Row left border colored by `severityColor` (red/orange/green)
- `expectedDefects` shown as small pills/badges
- `affectedKPIs` shown as colored mini-badges (OEE=green, FTQ=cyan, Scrap=amber, Energy=red)
- Default state: **expanded** when a scenario is first loaded, collapsible after

### 2.4.4 Parameter Table Modifications

The existing parameter table already shows Value and Δ% columns. When a scenario is loaded:

1. **Out-of-range values:** When `isOutOfRange === true` for a parameter override, change the Value input border and text color:
   - Current: `border-green-500/50 text-green-300` (normal) or `border-orange-500/50 text-orange-300` (modified from reference)
   - New: Add a **third state** → `border-red-500/50 text-red-300` when the scenario pushes a value outside normal range
   - Add a small ⚠️ icon or red dot indicator next to out-of-range values

2. **Determining out-of-range status:**
   ```typescript
   const isOutOfRange = activeScenario?.parameterOverrides.find(
     o => o.station === selectedMachine && o.parameter === param.key
   )?.isOutOfRange ?? false;
   ```

3. **Color logic for Value input:**
   ```typescript
   const inputColorClass = isOutOfRange
     ? 'border-red-500/50 text-red-400 focus:border-red-400/70 focus:ring-red-400/20'
     : isModified(selectedMachine, param.key, 'value')
       ? 'border-orange-500/50 text-orange-300 focus:border-orange-400/70 focus:ring-orange-400/20'
       : 'border-green-500/50 text-green-300 focus:border-green-400/70 focus:ring-green-400/20';
   ```

### 2.4.5 Sidebar Additions

Add to the existing sidebar (below the Reference button):

**"Reset Scenario" button:**
```tsx
{activeScenarioId && (
  <button
    onClick={handleClearScenario}
    className="flex items-center justify-center gap-2 px-3 py-2.5 mt-2
               rounded-xl text-xs sm:text-sm font-medium
               bg-red-500/10 text-red-400 border border-red-500/20
               hover:bg-red-500/20 hover:border-red-500/30
               transition-all duration-200 group"
  >
    <X className="w-3.5 h-3.5" />
    <span>{currentLang === 'tr' ? 'Senaryoyu Sıfırla' : 'Reset Scenario'}</span>
  </button>
)}
```

### 2.4.6 Local State Management (UI-only for now)

For this step, manage scenario selection as LOCAL state within DemoSettingsPanel. The store integration will happen in STEP 3.

```tsx
// Local state for scenario selection (will be moved to store in STEP 3)
const [activeScenarioId, setActiveScenarioId] = useState<string | null>(null);
const [causeEffectOpen, setCauseEffectOpen] = useState(true);

const activeScenario = SCENARIOS.find(s => s.id === activeScenarioId) ?? null;

const handleLoadScenario = (scenario: ScenarioDefinition) => {
  setActiveScenarioId(scenario.id);
  setCauseEffectOpen(true);
  
  // Apply parameter overrides to the UI (local state)
  const newValues = { ...paramValues };
  for (const override of scenario.parameterOverrides) {
    if (!newValues[override.station]) newValues[override.station] = {};
    newValues[override.station][override.parameter] = {
      value: override.value.toString(),
      variation: override.driftLimit.toString(),
    };
  }
  setParamValues(newValues);
  
  // Also write to simulation store (existing updateParameter/updateDriftLimit)
  for (const override of scenario.parameterOverrides) {
    updateParameter(override.station, override.parameter, override.value, 'step', 'operator');
    updateDriftLimit(override.station, override.parameter, override.driftLimit);
  }
};

const handleClearScenario = () => {
  setActiveScenarioId(null);
  setCauseEffectOpen(false);
  
  // Reset to factory defaults (existing function)
  const { resetToFactoryDefaults } = useSimulationDataStore.getState();
  resetToFactoryDefaults();
  setParamValues(buildInitialValues());
};
```

---

## 2.5 Bilingual Support

All new UI text must support TR/EN. Add these translations:

```typescript
const scenarioTranslations = {
  scenarioSelector: { tr: 'Senaryo Seçimi', en: 'Scenario Selection' },
  active: { tr: 'AKTİF', en: 'ACTIVE' },
  resetScenario: { tr: 'Senaryoyu Sıfırla', en: 'Reset Scenario' },
  causeEffectTitle: { tr: '📋 Neden-Sonuç Referans Tablosu', en: '📋 Cause-Effect Reference Table' },
  impactSummary: { tr: 'Etki Özeti', en: 'Impact Summary' },
  parameter: { tr: 'Parametre', en: 'Parameter' },
  deviation: { tr: 'Sapma', en: 'Deviation' },
  expectedDefects: { tr: 'Beklenen Defektler', en: 'Expected Defects' },
  consequence: { tr: 'Sonuç', en: 'Consequence' },
  affectedKPIs: { tr: 'Etkilenen KPI\'lar', en: 'Affected KPIs' },
  severity: { tr: 'Seviye', en: 'Severity' },
  outOfRange: { tr: '⚠️ Aralık Dışı', en: '⚠️ Out of Range' },
};
```

---

## 2.6 Design Rules

1. **Match existing theme:** black/90 backdrop-blur, border-white/10, glassmorphism, green-cyan accent (#00ff88 / #00d4ff)
2. **Use existing clamp patterns:** `clamp(0.6rem, 1vw, 0.8rem)` for text, responsive widths
3. **No new dependencies** — use only what's already in package.json (lucide-react for icons, tailwind for styling)
4. **Do NOT create separate component files** — keep everything inside DemoSettingsPanel.tsx. If components get too large, extract them into the same file as named functions above the main component.
5. **Preserve ALL existing functionality** — the parameter table, sidebar navigation, Commit, and Reference buttons must continue working exactly as before

---

## 2.7 Verification Checklist

After modifying `DemoSettingsPanel.tsx`:

- [ ] All 4 scenarios render as selectable cards at the top
- [ ] Clicking a scenario card highlights it with severity-colored glow
- [ ] Clicking a scenario updates parameter table values and drift limits
- [ ] Out-of-range parameters show in red (border + text)
- [ ] Impact summary bar shows OEE, Scrap, Energy, Severity when scenario is active
- [ ] Cause-effect table appears below parameter table (only for stations with deviations)
- [ ] Cause-effect table is collapsible
- [ ] "Reset Scenario" button appears in sidebar when scenario is active
- [ ] Clicking "Reset Scenario" restores factory defaults and clears all scenario indicators
- [ ] Language toggle (TR/EN) works for all new UI elements
- [ ] Existing Commit and Reference buttons still work
- [ ] Panel opens and closes correctly (Escape key, backdrop click, X button)
- [ ] No TypeScript errors
- [ ] Responsive at different viewport sizes (clamp-based sizing)

**Report back with:** Modified file line count, screenshots description of the 4 scenario cards, and confirmation that existing functionality is preserved.
