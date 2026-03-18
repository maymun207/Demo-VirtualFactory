# IMPLEMENTATION GUIDE — New Demo Flow
## What changes, what stays, what's new

---

## 1. FILES THAT CHANGE

### 1a. `src/lib/params/demoSystem/demoScript.ts` — REPLACE
The entire DEMO_ACTS array is rewritten. Types (UIPanel, PanelAction, MediaInstruction,
ScreenTextAlign, etc.) are UNCHANGED — same interfaces, same exports.

**Key structural changes:**

| Old | New | Reason |
|---|---|---|
| Act 0 "Welcome" — 2 steps | Act 0 "The Mirror" — 3 steps | Tier 1 auto-play. Carries the full 90-second mirror experience. |
| Act 1 "No System" — 4 steps | Act 1 "No System" — 2 steps | Compressed. 4 clicks was death for web visitors. |
| Act 2 "Basic System" — 2 steps | Act 2 "Basic System" — 2 steps | Kept. Minor text refinements. |
| Act 3 "Digital Twin" — 2 steps | Act 3 "Digital Twin" — 2 steps | Kept. CO₂ thread sharpened. |
| Act 4 "CWF" — 3 steps | Act 4 "CWF" — 3 steps | Kept. Roles simplified (CEO + Sustainability + param change). |
| Act 5 "Autonomous AI" — 2 steps | Act 5 "Autonomous AI" — 2 steps | Added competitive context (conventional vs autonomous timing). |
| Act 6 "Close" — 2 steps | Act 6 "Close" — 2 steps | Mirror question sharpened. CTA warmed. |

**Total clicks through full demo:**
- Old: 2 + 4 + 2 + 2 + 3 + 2 + 2 = **17 clicks**
- New: 3 + 2 + 2 + 2 + 3 + 2 + 2 = **16 clicks** (but Tier 1 has <clck> auto-advance, so effective clicks = ~13)

### 1b. `src/lib/params/demoSystem/demoConfig.ts` — MINOR CHANGES

```typescript
// CHANGE: Rename restart scenario comment (cosmetic only)
export const DEMO_RESTART_SCENARIO: string = 'SCN-001';  // unchanged

// CHANGE: First act index stays 0
export const DEMO_FIRST_ACT_INDEX: number = 0;  // unchanged
```

No functional changes needed. All existing constants work with the new script.

### 1c. `src/lib/params/demoSystem/demoSystemPrompt.ts` — MINOR REFINEMENTS

**Changes needed:**
1. Line 49: Change "guiding a live audience" → "guiding a solo web visitor"
2. Section 4 (ARIA Persona Rules):
   - Change "Maximum 5 sentences" → "Maximum 3–5 sentences depending on act"
   - Add: "In Tier 1 (Act 0), maximum 3 sentences. In Tier 2 (Acts 1–6), maximum 5."
   - Change "pointing to the → Continue button" → "pointing to → Continue or the CTA button"
3. Section 2 (Conveyor Loss Model):
   - Add: "This applies to Acts 0, 1, and 2 (was previously 1 and 2 only)"

**Everything else stays.** The quality model guardrails, CO₂ data, factory layout — all unchanged.

---

## 2. FILES THAT DON'T CHANGE

| File | Reason |
|---|---|
| `demoStore.ts` | The 5-phase engine works perfectly. No modifications needed. |
| `commandParser.ts` | All tokens (<cls>, <w:N>, <MI>, <clmi>, <clck>) are used. No new tokens. |
| `DemoSidePanel.tsx` | Sidebar reads DEMO_ACTS dynamically. sidebarLabel filtering works. |
| `DemoMediaView.tsx` | Renders screenText, slides, messages, charts. All used. |
| `DemoLayout.tsx` | Orchestrator. No changes. |
| `DemoMessageBubble.tsx` | Message rendering. No changes. |
| `DemoMediaInstructionRenderer.tsx` | chart:conveyor_speed still used in Act 1. |
| `DemoConveyorSpeedChart.tsx` | The chart component. No changes. |
| `simActionExecutor.ts` | start/stop/reset/reset-start all used. No changes. |
| `copilotStore.ts` | enableCopilot in Act 5 works via existing mechanism. |
| `cwfStore.ts` | CWF panel interactions unchanged. |
| All Supabase services | syncService, oeeSnapshotService, etc. — unchanged. |
| `api/cwf/chat.ts` | CWF API endpoint. No changes needed for v1. |

---

## 3. ACT-BY-ACT IMPLEMENTATION NOTES

### Act 0 — "The Mirror" (Tier 1)

**Step 0 timing analysis:**

```
Phase 1: delayMs=800                                    →  0.8s
Phase 2 (screenText):
  "This factory produces..." text appears               →  instant
  <w:4000>                                               →  4.0s
  <cls>                                                  →  instant
  <w:800>                                                →  0.8s
  "A factory like this..." + loss numbers                →  instant
  <w:4000>                                               →  4.0s
  <cls>                                                  →  instant
  <w:600>                                                →  0.6s
  "This happens every shift..." text                     →  instant
  <w:3500>                                               →  3.5s
  <clck>                                                 →  immediate
Phase 3a (ariaLocal):
  <cls>                                                  →  instant
  <w:500>                                                →  0.5s
  ARIA welcome text appears in bubble                    →  instant
Phase 3b: no ariaApi                                     →  0s
Phase 4: simulationAction: 'reset-start'                 →  instant
  → factory starts, tiles begin moving
  → demoPhase = 'awaiting-transition'
                                                    TOTAL: ~15s auto + read time
```

**Critical: `simulationAction: 'reset-start'` fires in Phase 4.**
This means the factory is NOT running during the screenText. This is INTENTIONAL:
- The text says "This factory produces 4,200 tiles" — present tense, hypothetical
- The bleed numbers are presented as "A factory LIKE this loses..."
- When ARIA says "The factory behind me is starting now" the sim actually starts
- The factory coming alive AFTER the reveal is a powerful visual beat

**Step 1 timing analysis:**

```
Phase 1: no delayMs                                      →  0s
Phase 2 (screenText):
  <cls><w:500>                                           →  0.5s
  "What if you could just ask?" text                     →  instant
  <w:2000>                                               →  2.0s
  <clck>                                                 →  immediate
Phase 3a: no ariaLocal                                   →  0s
Phase 3b (ariaApi):
  POST /api/cwf/chat → Gemini tool loop → response       →  3-8s
Phase 4:
  panelActions: open cwf                                  →  instant
  → demoPhase = 'awaiting-transition'
                                                    TOTAL: ~3s auto + API wait
```

**By the time Step 1's ariaApi fires, the sim has been running for:**
- Step 0's full duration (~15s auto + user read/click time, say 5-10s)
- Total: ~20-25 seconds of simulation
- At nominal production rate, this means 10-15+ tiles have been produced
- Supabase should have tile data, telemetry data, and at least 2 OEE snapshots
- The ariaApi prompt is designed to handle sparse data gracefully:
  "If data is sparse because the simulation just started, estimate conservatively"

**Step 2 timing analysis:**

```
Phase 2 (screenText):
  "That answer came from live data..."                   →  3s
  <cls> 03:47 teaser scenes                              →  ~12s total
  <clck>                                                 →  immediate
Phase 3a (ariaLocal):
  Fork text with 3 options                               →  instant
Phase 4: close cwf                                       →  instant
  → demoPhase = 'awaiting-transition'
Phase 5 (user click): transitionTo: 'next' → Act 1
                                                    TOTAL: ~15s auto + read
```

### Act 1 — No System

**What changed from old Act 1:**
- Reduced from 4 steps to 2
- Old Steps 0+2+3 compressed into new Step 0 (chart + narration)
- Old Step 1 (ariaApi with long CWF query) merged into new Step 0's ariaApi
- New Step 1 = financial translation + transition (was old Step 3's ariaLocal)
- controlPanel opens in Step 0 (was Step 1 in old script)

**The conveyor chart (`<MI>`) now appears in Step 0.**
Previously it was Step 2 (3rd click). Now it's the first thing in Act 1.
The visitor sees the chart earlier = faster to the visual punch.

### Act 2 — Basic System

**Minimal changes from old Act 2.** Structure is identical (2 steps).
Text refinements only:
- Sharper "score vs game" framing
- openingPrompt adds "false confidence" angle

### Act 3 — Digital Twin

**Minimal changes.** Structure identical (2 steps).
- CO₂ framing tightened in Step 1 screenText
- "Quality cost and carbon cost share the same root cause" line added
- Prompt for ariaApi adds specific CO₂ calculation request

### Act 4 — CWF

**Changed from old Act 4:**
- Removed Quality Manager and Shift Supervisor roles (too many clicks)
- Kept: CEO (Step 0), Sustainability (Step 1), Parameter Change (Step 2)
- 3 roles → 2 queries + 1 interactive = 3 steps (same as before)
- Parameter change step gets MORE dramatic framing

### Act 5 — Autonomous AI

**Changed from old Act 5:**
- Added competitive context in Step 1 screenText:
  "Conventional: 2-4 hours detect, 1-2 days root cause, next shift fix"
  "Here: 23 seconds detect, 38 seconds root cause, 6:40 fix"
  "The difference: 847 tiles and €12,400"
- This gives the visitor the COMPARATIVE frame they need to feel urgency

### Act 6 — Close

**Changed from old Act 6:**
- Step 1 screenText replaced with the "mirror question":
  "How much total waste did your factory produce last year?
   If you don't know the answer — that is exactly the problem we solve."
- CTA warmed: ARDICTECH introduced by name, year, scale
- ardic.ai link maintained

---

## 4. SIDEBAR LED CONFIGURATION

Acts that appear in the sidebar LED list (those with `sidebarLabel` set):

| Index | sidebarLabel | sidebarSubLabel | LED Behaviour |
|---|---|---|---|
| 1 | "No System" | — | Green when active, grey otherwise |
| 2 | "Basic Management" | — | Green when active |
| 3 | "Digital Twin" | — | Green when active |
| 4 | "CWF" | "Chat With Factory" | Green when active |
| 5 | "Autonomous AI" | "Copilot" | Green when active |
| 6 | "Close" | — | Green when active |

Act 0 (The Mirror) has NO sidebarLabel → does not appear in LED list.
This is intentional: Tier 1 is the entry experience, not a selectable stage.

---

## 5. SCENARIO FLOW

| Act | scenarioCode | Effect |
|---|---|---|
| 0 (Mirror) | `'SCN-001'` | Loads optimal production. Act-level + Step 0. |
| 1 (No System) | `null` | Inherits SCN-001 from Act 0. |
| 2 (Basic) | `'SCN-001'` | Reloads SCN-001 (ensures clean state). |
| 3 (Digital Twin) | `'SCN-002'` | Kiln Temperature Crisis. |
| 4 (CWF) | `'SCN-003'` | Glaze Viscosity Drift. |
| 5 (Autonomous) | `'SCN-004'` | Multi-Station Cascade. Copilot enabled. |
| 6 (Close) | `null` | Inherits SCN-004 state. |

---

## 6. PANEL CHOREOGRAPHY

```
Act 0  Step 0: ALL closed        → sim starts
Act 0  Step 1:                   → cwf opens (visitor sees CWF answer)
Act 0  Step 2:                   → cwf closes
Act 1  Step 0: ALL closed        → controlPanel opens (conveyor controls)
Act 1  Step 1:                   → controlPanel closes
Act 2  Step 0: ALL closed        → basicPanel opens (dashboard)
Act 2  Step 1:                   → (basicPanel stays open)
Act 3  Step 0: basicPanel closes → dtxfr opens (tile passport)
Act 3  Step 1:                   → (dtxfr stays open)
Act 4  Step 0: dtxfr closes     → cwf opens (chat)
Act 4  Step 1:                   → (cwf stays open)
Act 4  Step 2:                   → (cwf stays open)
Act 5  Step 0:                   → cwf stays, oeeHierarchy opens
Act 5  Step 1:                   → (both stay open)
Act 6  Step 0:                   → oeeHierarchy stays open
Act 6  Step 1:                   → (oeeHierarchy stays open)
```

---

## 7. DEPLOYMENT STEPS

### Step 1: Replace demoScript.ts
Copy `new-demoScript.ts` → `src/lib/params/demoSystem/demoScript.ts`

### Step 2: Update demoSystemPrompt.ts
Apply the 3 minor changes listed in section 1c above.

### Step 3: Delete XYZ-demoScript.ts
The old alternate script at `src/lib/params/demoSystem/XYZ-demoScript.ts` (44KB)
should be removed — dead code.

### Step 4: Test
1. Load the demo page fresh (no prior session)
2. Verify Act 0 Step 0: screenText plays through 3 beats with <cls> and <w:N>
3. Verify factory starts after ariaLocal finishes (Phase 4 simulationAction)
4. Verify Act 0 Step 1: CWF panel opens, ariaApi returns real data
5. Verify Act 0 Step 2: 03:47 teaser plays, fork text appears
6. Click through all 7 acts verifying panel open/close choreography
7. Verify Act 5: Copilot enables, incident log delivered
8. Verify restartDemo() returns to Act 0 Step 0 cleanly

### Step 5: Timing tuning
The <w:N> values in the new script are initial estimates.
Run through the demo 3-5 times and adjust:
- If text disappears too fast: increase <w:N>
- If pacing feels slow: decrease <w:N>
- If ariaApi is slow: add fallback ariaLocal as backup
  (can be done per-step: ariaLocal fires first, ariaApi fires after)

---

## 8. FUTURE ENHANCEMENTS (not needed for v1)

### 8a. Calculator Component
A `DemoCalculator.tsx` component where the visitor types their daily production
and sees personalised annual loss estimate. Would require:
- New mediaInstruction type: `'calculator:annual_loss'`
- Update MediaInstruction union in demoScript.ts
- New component in `src/components/demo/media/`
- Wire into DemoMediaInstructionRenderer.tsx

### 8b. Auto-Advance Mode
Add `autoAdvance?: boolean` to CtaStep. When true, Phase 5 fires automatically
(no user click needed). Would make Tier 1 truly hands-free.
Requires ~10 lines of change in demoStore.ts userAdvance/enterAriaPhase.

### 8c. Turkish Language
Full Turkish translation of all screenText and ariaLocal.
The systemContext already supports bilingual — add a `language` field to the
API calls or detect from uiStore language setting.

### 8d. Mobile Fast Path
Detect mobile viewport → skip 3D rendering → show Tier 1 as 2D overlay
with pre-rendered factory image as background.
