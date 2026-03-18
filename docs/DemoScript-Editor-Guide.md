# DemoScript Editor — User Guide

> **File location:** `src/lib/params/demoSystem/demoScript.ts`
> This is the **only file** you need to edit to change the demo story.

---

## What Is It?

The DemoScript is a pure-data file that defines the **7 acts** (chapters) of the Virtual Factory narrative demo. The demo engine reads this file and drives all behaviour automatically — no logic code to touch.

Think of it as **sheet music**: you write what happens, the engine plays it.

---

## Architecture at a Glance

```
demoScript.ts    →  DEMO_ACTS[]  →  demoStore.ts (engine)  →  UI renders
 (pure data)         (7 acts)         (state machine)          (React)
```

| File | Role |
|------|------|
| `demoScript.ts` | Act definitions (edit this) |
| `demoConfig.ts` | Tunable constants (timeouts, dimensions) |
| `demoSystemPrompt.ts` | Base ARIA AI persona |
| `demoStore.ts` | Engine — reads acts, drives flow |

---

## The 7 Acts

| # | ID | Era Label | Scenario | Purpose |
|---|-----|-----------|----------|---------|
| 0 | `welcome` | Welcome 👋 | SCN-001 | Frame the journey |
| 1 | `no-management` | No System 🏭 | — | Invisible throughput loss |
| 2 | `basic-system` | Basic System 📊 | SCN-001 | Dashboard gap — sees numbers, not causes |
| 3 | `digital-twin` | Digital Twin 🔗 | SCN-002 | Kiln crisis, CO₂ revelation |
| 4 | `chat-with-factory` | Chat with Factory 💬 | SCN-003 | Natural language queries |
| 5 | `autonomous-ai` | Autonomous AI 🤖 | SCN-004 | Copilot auto-correction |
| 6 | `close` | Close 💰 | — | Financial translation |

> **Scenario `null`** means "keep whatever scenario is already running."

---

## Act Properties — Quick Reference

Every act is a `DemoAct` object. Here are the fields you can set:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | `string` | ✅ | Unique identifier (React key) |
| `eraLabel` | `string` | ✅ | Short label for the progress indicator |
| `eraEmoji` | `string` | ✅ | Emoji badge for the era label |
| `targetHeightKey` | `DemoHeightKey` | ✅ | Panel height: `compact` · `medium` · `tall` · `large` |
| `scenarioCode` | `string \| null` | ✅ | Scenario to load (`SCN-001` – `SCN-004`), or `null` |
| `panelActions` | `PanelAction[]` | ✅ | Panels to open/close when act begins |
| `systemContext` | `string` | ✅ | AI context injected for this act |
| `ctaSteps` | `CtaStep[]` | ❌ | Sequence of CTA button click actions |
| `openingPrompt` | `string` | ❌ | Auto-sent to ARIA when act starts |
| `sidebarLabel` | `string` | ❌ | LED list label in sidebar (acts 1–5) |
| `sidebarSubLabel` | `string` | ❌ | Italic tech tag below sidebar label |
| `enableCopilot` | `boolean` | ❌ | Auto-enable AI Copilot on act start |

---

## CTA Steps — The Click Sequence

Each act has a `ctaSteps[]` array. **Click 1 → `ctaSteps[0]`**, Click 2 → `ctaSteps[1]`, etc.

### CtaStep Fields

| Field | Type | What It Does |
|-------|------|--------------|
| `ctaLabel` | `string` | Custom button label (default: "Next ›") |
| `slideImageUrl` | `string` | Static image shown on screen (e.g. `'/demo/ACT-1a.png'`) |
| `mediaInstruction` | `MediaInstruction` | Dynamic viz instead of image (e.g. `'chart:conveyor_speed'`) |
| `screenText` | `string` | On-screen text caption (supports inline commands) |
| `ariaLocal` | `string` | Scripted ARIA chat bubble — no API call, instant |
| `ariaApi` | `string` | Prompt sent to CWF — ARIA generates a dynamic reply |
| `ariaInputEnabled` | `boolean` | Enable/disable the ARIA chat input |
| `scenarioCode` | `string` | Load a scenario mid-step |
| `simulationAction` | `string` | `'start'` · `'stop'` · `'reset'` · `'reset-start'` |
| `panelActions` | `PanelAction[]` | Open/close panels on this click |
| `delayMs` | `number` | Wait N ms before showing screenText |
| `transitionTo` | `string \| null` | `'next'` = next act · `act-id` = jump · `null` = stay |

### Execution Order Within a Step

When the user clicks the CTA button, each step executes in this order:

```
1. panelActions      → toggle panels
2. scenarioCode      → load scenario
3. simulationAction  → start/stop/reset simulation
4. slideImageUrl     → show static slide
   OR mediaInstruction → show live chart
5. delayMs           → wait
6. screenText        → display text overlay
7. ariaLocal         → scripted ARIA bubble
8. ariaApi           → AI-generated reply
9. transitionTo      → navigate to next act/step
```

---

## Panel Actions

Use `panelActions` to control which UI panels are visible:

```typescript
panelActions: [
    { panel: 'basicPanel', state: 'open' },
    { panel: 'dtxfr',      state: 'close' },
    { panel: 'cwf',        state: 'open' },
]
```

### Available Panels

| Panel ID | UI Element |
|----------|-----------|
| `basicPanel` | Basic KPI Dashboard |
| `dtxfr` | Digital Twin / Tile Passport |
| `cwf` | Chat with Factory panel |
| `controlPanel` | Simulation Control Panel |
| `kpi` | KPI indicators |
| `heatmap` | Factory heatmap |
| `passport` | Tile passport view |
| `oeeHierarchy` | OEE Hierarchy breakdown |

---

## Inline Commands (in screenText & ariaLocal)

You can embed special commands inside `screenText` and `ariaLocal` strings:

| Command | Effect |
|---------|--------|
| `<cls>` | Clears the current slide image |
| `<clmi>` | Clears the active media instruction (chart) |
| `<w:1000>` | Waits 1000 ms before processing next token |
| `<MI>` | Activates the step's `mediaInstruction` |
| `<clck>` | Soft auto-click — skips waiting for user click |

**Example:**

```typescript
screenText: `Welcome to the factory tour.<w:2000>Now let's see the data.<clck>`
```

This displays the text, waits 2 seconds, then auto-advances to the ARIA phase.

---

## How To: Common Tasks

### ✏️ Change the narrative text

Edit the `systemContext` field of the relevant act. ARIA uses this to frame its responses.

```typescript
systemContext: `
  You are now in the Digital Twin era. The factory has tile-level
  traceability. Focus on the CO₂ impact of kiln over-temperature.
`.trim(),
```

### 🖼️ Add a new slide image

1. Place the image in `/public/demo/` (e.g. `MY-SLIDE.png`)
2. Reference it in a CTA step:

```typescript
ctaSteps: [
    { slideImageUrl: '/demo/MY-SLIDE.png' },
]
```

### 📊 Show a live chart instead of a slide

```typescript
ctaSteps: [
    { mediaInstruction: 'chart:conveyor_speed' },
]
```

> To add a new chart type, see the instructions in `DemoMediaInstructionRenderer.tsx`.

### 🔄 Reorder acts

Simply move the act object to a different position in the `DEMO_ACTS[]` array. The engine reads them in order — index 0 is first.

### ➕ Add a new act

Copy an existing act block, give it a unique `id`, and insert it at the desired position:

```typescript
{
    id: 'my-new-act',
    eraLabel: 'New Stage',
    eraEmoji: '⚡',
    targetHeightKey: 'tall',
    scenarioCode: 'SCN-002',
    panelActions: [],
    systemContext: `Your AI context here.`.trim(),
    ctaSteps: [
        { screenText: 'Welcome to the new stage.' },
        { ariaApi: 'Explain what this stage demonstrates.' },
    ],
},
```

### 🎬 Add more clicks to an act

Just add more objects to the `ctaSteps[]` array. Each object = one CTA button click.

---

## Important Rules

> [!CAUTION]
> **Quality Model:** Sorting catches 100% of defects. Never imply defective tiles reach customers. No "customer complaint", "warranty claim", or "recall" language.

> [!WARNING]
> **Acts 1 & 2 (SCN-001):** Never mention defects, scrap, or second quality. Only discuss conveyor speed loss and wasted energy.

> [!TIP]
> **CO₂ Thread:** Introduced in Act 0, quantified in Act 3, queryable in Act 4, autonomously prevented in Act 5, monetised in Act 6.

---

## Testing Your Changes

Run the data integrity tests to validate your edits:

```bash
npx vitest run src/tests/demoScript.test.ts
```

This checks:
- All acts have unique IDs
- Required fields are present and valid
- Panel names match the `UIPanel` type
- Height keys are valid
- Scenario codes follow naming conventions

---

## File Map

| File | Path |
|------|------|
| Act definitions | `src/lib/params/demoSystem/demoScript.ts` |
| Config constants | `src/lib/params/demoSystem/demoConfig.ts` |
| ARIA persona | `src/lib/params/demoSystem/demoSystemPrompt.ts` |
| Engine (state machine) | `src/store/demoStore.ts` |
| Sidebar UI | `src/components/demo/DemoSidePanel.tsx` |
| Media view | `src/components/demo/DemoMediaView.tsx` |
| Command parser | `src/lib/utils/commandParser.ts` |
| Chart renderer | `src/components/demo/media/DemoMediaInstructionRenderer.tsx` |
| Data integrity tests | `src/tests/demoScript.test.ts` |
