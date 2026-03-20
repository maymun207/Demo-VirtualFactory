/**
 * demoScript.ts — "The Invisible Factory" — Web Visitor Self-Guided Demo
 *
 * REDESIGNED: March 2026
 *
 * "Sheet music" for the Virtual Factory Demo Engine.
 * Audience: solo web visitors arriving via "Demo Our Digital Twin"
 * button on ardic.ai — no human presenter, no conference room.
 *
 * ═══════════════════════════════════════════════════════════════
 * TWO-TIER ARCHITECTURE
 * ═══════════════════════════════════════════════════════════════
 *
 *   TIER 1 — "The Mirror" (Act 0):
 *     90–120 seconds, heavily auto-driven via <clck>.
 *     3 steps, 3 clicks. Catches the busy CEO, the sceptical
 *     engineer, the factory owner who "just clicked to see."
 *     Goal: make them feel the weight of money they didn't know
 *     they were losing.
 *
 *   TIER 2 — "The Journey" (Acts 1–6):
 *     5–7 minutes, guided click-by-click.
 *     For the engaged visitor who chose "Show me more."
 *     Deep narrative, live AI queries, full scenario progression.
 *
 * ═══════════════════════════════════════════════════════════════
 * NARRATIVE ARC (7 acts)
 * ═══════════════════════════════════════════════════════════════
 *
 *   Act 0  The Mirror        — Factory starts. Pain revealed. CWF wow. Fork.
 *   Act 1  No System         — Conveyor drift. Energy waste. Silent loss.
 *   Act 2  Basic System      — Dashboard exists. Can't explain itself.
 *   Act 3  Digital Twin      — Kiln crisis. Tile passport. CO₂ opens.
 *   Act 4  Chat with Factory — Four roles. One language. Parameter change.
 *   Act 5  Autonomous AI     — Cascade failure. Copilot acts. 03:47 log.
 *   Act 6  Close             — Financial mirror. The question they can't answer.
 *
 * ═══════════════════════════════════════════════════════════════
 * QUALITY MODEL (immutable across all acts)
 * ═══════════════════════════════════════════════════════════════
 *
 *   Sorting catches 100% of defects. Customer ALWAYS receives first quality.
 *   Second quality = 40–60% of production cost paid again at rework.
 *   Scrap = 100% total loss. NEVER imply defective tiles reach the customer.
 *
 * CONVEYOR LOSS MODEL (Acts 0–2 only, SCN-001):
 *   All machine params within spec. Only variable = conveyor speed drift.
 *   Loss = throughput gap + Kiln gas + Dryer electricity burned during idle.
 *   NEVER mention defects, quality grades, or sorting in Acts 0–2.
 *
 * CO₂ THREAD:
 *   Seeded in Act 0 (03:47 teaser: "~1,900 kg prevented"),
 *   quantified in Act 3 (kiln overconsumption),
 *   queryable in Act 4 (Sustainability role),
 *   autonomously prevented in Act 5 (same ~1,900 kg),
 *   monetised in Act 6 (same intervention).
 *
 * Used by: demoStore.ts, DemoMediaView.tsx, DemoSidePanel.tsx
 */

import type { DemoHeightKey } from './demoConfig';

// ─── Panel Action Types ─────────────────────────────────────────────────────

export type UIPanel =
    | 'basicPanel'
    | 'dtxfr'
    | 'cwf'
    | 'controlPanel'
    | 'kpi'
    | 'heatmap'
    | 'passport'
    | 'oeeHierarchy';

export interface PanelAction {
    panel: UIPanel;
    state: 'open' | 'close';
}

// ─── Media Instruction Type ────────────────────────────────────────────────

export type MediaInstruction = 'chart:conveyor_speed';

// ─── Screen Text Formatting Types ──────────────────────────────────────────

export type ScreenTextAlign = 'left' | 'center' | 'right';
export type ScreenTextWeight = 'normal' | 'bold';
export type ScreenTextSize = 'sm' | 'md' | 'lg' | 'xl';

// ─── CTA Step ────────────────────────────────────────────────────────────────

export interface CtaStep {
    ctaLabel?: string;
    slideImageUrl?: string;
    mediaInstruction?: MediaInstruction;
    scenarioCode?: string | null;
    workOrderId?: string | null;
    delayMs?: number;
    screenText?: string;
    screenTextAlign?: ScreenTextAlign;
    screenTextWeight?: ScreenTextWeight;
    screenTextSize?: ScreenTextSize;
    ariaLocal?: string;
    ariaLocalAlign?: ScreenTextAlign;
    ariaLocalWeight?: ScreenTextWeight;
    ariaLocalSize?: ScreenTextSize;
    ariaApi?: string;
    ariaInputEnabled?: boolean;
    panelActions?: PanelAction[];
    simulationAction?: 'start' | 'stop' | 'reset' | 'reset-start';
    transitionTo?: 'next' | string | null;
}

// ─── Act Definition ─────────────────────────────────────────────────────────

export interface DemoAct {
    id: string;
    eraLabel: string;
    eraEmoji: string;
    targetHeightKey: DemoHeightKey;
    scenarioCode: string | null;
    panelActions: PanelAction[];
    enableCopilot?: boolean;
    ctaSteps?: CtaStep[];
    sidebarLabel?: string;
    sidebarSubLabel?: string;
    systemContext: string;
    openingPrompt?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// THE DEMO SCRIPT
// ═══════════════════════════════════════════════════════════════════════════

export const DEMO_ACTS: DemoAct[] = [

    // ══════════════════════════════════════════════════════════════════════
    // ACT 0 — THE MIRROR (Tier 1)
    // "The factory looks fine. It is not."
    //
    // 3 steps, 3 clicks. Heavily auto-driven via <clck>.
    // The visitor watches a normal-looking factory and discovers the
    // invisible cost of not knowing. Then ARIA answers a live question.
    // Then the 03:47 incident seeds the full journey.
    //
    // simulationAction: 'reset-start' fires in Step 0 Phase 4 (after
    // screenText + ariaLocal finish). The factory comes alive visually
    // AFTER the "everything looks normal" text has primed the visitor.
    // By Step 1, the sim has run long enough for ariaApi data to exist.
    //
    // TIMING BUDGET:
    //   Step 0: ~35s screenText + ~8s ariaLocal + click = ~45s
    //   Step 1: ~8s screenText + ~5s ariaApi response + click = ~15s
    //   Step 2: ~30s screenText + ~5s ariaLocal + click = ~40s
    //   Total Tier 1: ~100 seconds (target)
    // ══════════════════════════════════════════════════════════════════════
    {
        id: 'mirror',
        eraLabel: 'The Mirror',
        eraEmoji: '🪞',
        targetHeightKey: 'tall',
        scenarioCode: 'SCN-001',

        /** All panels closed — pure 3D factory + text overlay */
        panelActions: [
            { panel: 'basicPanel',   state: 'close' },
            { panel: 'dtxfr',        state: 'close' },
            { panel: 'cwf',          state: 'close' },
            { panel: 'oeeHierarchy', state: 'close' },
            { panel: 'controlPanel', state: 'close' },
        ],

        /**
         * No sidebarLabel — Act 0 does not appear in the LED list.
         * The mirror is the entry experience, not a selectable stage.
         */

        systemContext: `
You are opening the demo for a solo web visitor arriving from ardic.ai.
This is the MIRROR act — Tier 1. The visitor has never heard of ARDICTECH,
may not understand OEE or digital twins, and is probably sceptical.

YOUR JOB: Make them feel the weight of money they are losing right now
in their own factory. No jargon. No product pitch. No brand mention.

Tone: quiet authority. An experienced factory consultant who has walked
the floor of hundreds of factories and seen the same silent losses everywhere.

CRITICAL: SCN-001 is running. ALL machine parameters within spec.
The ONLY variable is conveyor speed drift. NEVER mention defects,
quality grades, sorting, or machine parameter drift in this act.
The story is ONLY about invisible throughput loss and wasted energy.

Maximum 3 sentences per response. Every word must earn its place.
        `.trim(),

        /** No openingPrompt — Act 0 is the entry point. */
        openingPrompt: '',

                ctaSteps: [
            { // Click #1
                ctaLabel: 'Start →',
                scenarioCode: 'SCN-001',
                workOrderId: 'WorkID#3',
                delayMs: 800,
                screenText: `This factory produces 4,200 tiles per shift.
Seven stations. One production line.

Press → Dryer → Glaze → Printer → Kiln → Sort → Package.<w:4000><cls><w:800>A factory like this, running normally, loses approximately:

€47 in wasted energy — every 20 seconds.
12 tiles of throughput — never produced, never counted.

No alarm fires.
No report is filed.
No one notices.<w:4000><cls><w:600>This happens every shift. Every day.

The factory looks fine from the outside.
The losses are entirely invisible.<w:3500><clck>`,
                screenTextAlign: 'left',
                screenTextWeight: 'normal',
                screenTextSize: 'sm',
                ariaLocal: `<cls><w:500>Welcome. I am ARIA — the intelligence layer of this factory.

What you just read is not a worst case.It is the everyday reality of factories that have no visibilityinto what is actually happening on their production line.

The factory behind me is starting now. Watch the tiles move.

→ Click to ask the factory a question.`,
                ariaLocalSize: 'sm',
                ariaInputEnabled: false,
                simulationAction: 'reset-start',
            },
            { // Click #2
                ctaLabel: 'Ask the factory →',
                screenText: `<cls><w:500>What if you could just ask the factory?

In plain language. Right now.<w:2000><clck>`,
                screenTextSize: 'md',
                ariaLocal: `<cls><w:300>📊 This factory has been running for approximately 2 minutes.

Current throughput: ~3,840 tiles/hour — 8.6% below the theoreticalmaximum of 4,200. The gap is caused by conveyor speed driftaveraging 0.91x nominal.

During speed dips, the Kiln continues burning natural gas and theDryer continues drawing electricity — producing nothing.

Estimated loss this session: ~€94.
At this rate, the annual cost would be approximately €206,000.

That answer took 3 seconds. No analyst. No report. Just a question.`,
                ariaLocalSize: 'sm',
                ariaInputEnabled: false,
                panelActions: [
                    { panel: 'cwf', state: 'open' },
                ],
            },
            { // Click #3
                ctaLabel: 'Continue →',
                screenText: `<cls><w:1000>That answer came from live production data.
The AI queried the database, calculated the loss, and responded— in seconds.<w:3000><cls><w:800>Now imagine this.

03:47 AM. Night shift.
Kiln temperature drifts above specification.
The shift operator does not notice.<w:3500><cls><w:600>03:48 — The system detects the anomaly.
03:48 — Root cause identified.
03:49 — Correction applied automatically.

No one was woken up.
The customer received only first-quality tiles.
~1,900 kg of CO₂ emissions prevented.<w:4000><clck>`,
                screenTextAlign: 'left',
                screenTextWeight: 'normal',
                screenTextSize: 'sm',
                ariaLocal: `<cls><w:500>You have just seen three things most factory owners never see:

1. The silent cost of running blind
2. A factory that answers questions in plain language
3. A system that corrects problems before humans notice

What you saw in 90 seconds is available in full detail.
→ Click "Continue" to walk through the complete journey — from a factorywith zero visibility to one that manages itself autonomously.

Or type your own question to ARIA in the sidebar below.`,
                ariaLocalSize: 'sm',
                ariaInputEnabled: true,
                panelActions: [
                    { panel: 'cwf', state: 'close' },
                ],
                transitionTo: 'next',
            },
        ],
    },


    // ══════════════════════════════════════════════════════════════════════
    // ACT 1 — NO MANAGEMENT SYSTEM
    // "The factory looks fine. The tragedy is invisible."
    //
    // TIER 2 ENTRY POINT. The visitor chose "Continue."
    // SCN-001 continues — conveyor speed drift ONLY.
    // 2 steps (reduced from 4). All panels closed.
    // The conveyor speed chart is the hero visual.
    //
    // NEVER mention defects, quality grades, or sorting.
    // Loss = throughput gap + energy burned during idle.
    // ══════════════════════════════════════════════════════════════════════
    {
        id: 'no-management',
        eraLabel: 'No System',
        eraEmoji: '🏭',
        targetHeightKey: 'medium',
        scenarioCode: null,   // SCN-001 already loaded from Act 0

        /** All panels closed — factory with zero digital tools */
        panelActions: [
            { panel: 'basicPanel',   state: 'close' },
            { panel: 'dtxfr',        state: 'close' },
            { panel: 'cwf',          state: 'close' },
            { panel: 'oeeHierarchy', state: 'close' },
            { panel: 'controlPanel', state: 'close' },
        ],

        sidebarLabel: 'No System',

        systemContext: `
TIER 2, Act 1. The visitor chose the full journey. They have already seen the
Tier 1 mirror (invisible loss, CWF wow moment, 03:47 teaser). Now they are
walking through the stages.

We are in the "No Management System" era. SCN-001 is running — ALL machine
parameters are perfectly within specification. The ONLY variable is conveyor
speed drift: the belt occasionally slows without any operator noticing.

During conveyor slowdowns:
- The Kiln runs on natural gas continuously (thermal inertia prevents shutdown)
- The Dryer runs on electricity continuously for the same reason
- Tiles move slower = fewer tiles per hour = throughput gap vs plan
- Energy is burned producing nothing during the drift

CRITICAL: NEVER mention defects, second quality, scrap, sorting, quality grades,
or machine parameter issues. ONLY throughput loss and wasted energy.

Tone: quiet revelation. The visitor now sees what they already suspected.
Maximum 4 sentences per response.
        `.trim(),

        openingPrompt: '',

                ctaSteps: [
            { // Click #1
                ctaLabel: 'Show me →',
                mediaInstruction: 'chart:conveyor_speed',
                delayMs: 1000,
                screenText: `<w:500>This is the conveyor speed over time.<MI><w:5000>

Every dip on this chart is a silent transaction:
energy in, zero output, no record.<w:3000>

The Kiln keeps burning gas.
The Dryer keeps drawing electricity.
No tile moves. No alarm fires. No one knows.<w:3500><clck>`,
                screenTextAlign: 'left',
                screenTextWeight: 'normal',
                screenTextSize: 'sm',
                ariaLocal: `<cls><w:300>Current conveyor speed: 0.87x nominal (target: 1.0).

Actual output: ~3,650 tiles/hour.
Theoretical maximum: 4,200 tiles/hour.
Gap: 550 tiles/hour — 13.1% below plan.

During the last speed dip (12 seconds at 0.6x):
Kiln gas burned: ~0.33 m³ (€0.89)
Dryer electricity: ~0.18 kWh (€0.04)
Tiles not produced: ~14

No alarm was triggered. No event was logged.
→ What if we at least had a dashboard?`,
                ariaLocalSize: 'sm',
                ariaInputEnabled: true,
                panelActions: [
                    { panel: 'controlPanel', state: 'open' },
                ],
            },
            { // Click #2
                ctaLabel: 'Add a dashboard →',
                screenText: `<cls><clmi><w:800>At a factory producing 10 million tiles per year,
a 3% throughput gap from conveyor drift costs approximately
€180,000–€240,000 annually in lost production capacity
— before counting the energy wasted during idle periods.<w:3500><clck>`,
                screenTextAlign: 'left',
                screenTextWeight: 'normal',
                screenTextSize: 'sm',
                ariaLocal: `<cls><w:500>No one filed a report. No alarm was triggered.It happened, cost money, and disappeared.

This is the daily reality of every factory without visibility.Not a catastrophe — just a slow, silent drain.

→ What changes when we add a dashboard?`,
                ariaLocalSize: 'sm',
                ariaInputEnabled: false,
                panelActions: [
                    { panel: 'controlPanel', state: 'close' },
                ],
                transitionTo: 'next',
            },
        ],
    },


    // ══════════════════════════════════════════════════════════════════════
    // ACT 2 — BASIC MANAGEMENT SYSTEM
    // "We can see the score. We cannot see the game."
    // SCN-001 still. basicPanel opens. Numbers without root cause.
    // 2 steps. STILL no mention of defects/quality/sorting.
    // ══════════════════════════════════════════════════════════════════════
    {
        id: 'basic-system',
        eraLabel: 'Basic System',
        eraEmoji: '📊',
        targetHeightKey: 'medium',
        scenarioCode: 'SCN-001',

        panelActions: [
            { panel: 'basicPanel',   state: 'close' },
            { panel: 'dtxfr',        state: 'close' },
            { panel: 'cwf',          state: 'close' },
            { panel: 'oeeHierarchy', state: 'close' },
            { panel: 'controlPanel', state: 'close' },
        ],

        sidebarLabel: 'Basic Management',

        systemContext: `
TIER 2, Act 2. Basic Panel is about to open.

The audience can see OEE (typically 82–92%), throughput count, and energy figures.
They CANNOT see: when exactly the belt slowed, whether it is trending worse,
the energy cost per idle period, or ANY root cause explanation.

Make the distinction between "seeing a number" and "understanding its cause" razor-sharp.

CRITICAL: Still SCN-001. Still ONLY conveyor speed drift. NEVER mention defects,
second quality, scrap, or machine parameter issues.

Tone: frustrated empathy. "You can see the number. You cannot explain it."
Maximum 4 sentences per response.
        `.trim(),

        openingPrompt: '',

                ctaSteps: [
            { // Click #1
                ctaLabel: 'Show the dashboard →',
                slideImageUrl: '/demo/ACT-2.png',
                screenText: `A dashboard. OEE. Throughput. Energy. All visible now.<w:2000>

But can we explain any of them?<w:1500><clck>`,
                screenTextSize: 'md',
                ariaLocal: `<cls><w:300>The dashboard now shows:

OEE: 87.3%
Throughput: 3,814 tiles/hour
Energy: 142.7 kWh consumed this session

That looks reasonable. But here is what the dashboard cannot tell you:

When exactly did the belt slow down? Is it getting worse? Which stationis the bottleneck? What caused the 12.7% gap between 87.3% OEE andthe 100% target? Is it the same cause as yesterday — or something new?

The number raises a question. The dashboard cannot answer it.`,
                ariaLocalSize: 'sm',
                ariaInputEnabled: true,
                panelActions: [
                    { panel: 'basicPanel', state: 'open' },
                ],
            },
            { // Click #2
                ctaLabel: 'Go deeper →',
                screenText: `<cls><w:600>OEE at 87%.

Good? Bad? Getting worse?
Which machine? Which parameter? Since when?

The dashboard cannot answer.<w:3000><clck>`,
                screenTextWeight: 'normal',
                screenTextSize: 'md',
                ariaLocal: `<cls><w:500>This is the gap that costs manufacturers millions without anyone noticing.They see the score. They cannot see the game.

The dashboard shows a single point in time with no root cause,no trend, no breakdown by station, no explanation for why todayis different from last Tuesday.

The answer requires something fundamentally different.Not more dashboards. Unit-level traceability.

→ Continue`,
                ariaLocalSize: 'sm',
                ariaInputEnabled: true,
                transitionTo: 'next',
            },
        ],
    },


    // ══════════════════════════════════════════════════════════════════════
    // ACT 3 — DIGITAL TWIN & TILE PASSPORT
    // "Every tile has a complete story. Now we can read it."
    // SCN-002: Kiln Temperature Crisis (+14°C). DTXFR opens.
    // CO₂ thread opens: 18% more gas, embedded carbon in rework.
    // 2 steps. Show passport FIRST, then explain.
    // ══════════════════════════════════════════════════════════════════════
    {
        id: 'digital-twin',
        eraLabel: 'Digital Twin',
        eraEmoji: '🔗',
        targetHeightKey: 'tall',
        scenarioCode: 'SCN-002',

        panelActions: [
            { panel: 'basicPanel', state: 'close' },
            { panel: 'dtxfr',      state: 'open' },
        ],

        sidebarLabel: 'Digital Twin',

        systemContext: `
TIER 2, Act 3. SCN-002 (Kiln Temperature Crisis) just loaded.
Kiln running ~14°C above specification. DTXFR Tile Passport is open.

Sorting is catching ALL affected tiles. The customer sees NOTHING wrong. But:
- Scrap tiles: 100% loss — material + energy + labour, zero revenue
- Second quality tiles: manufacturer pays 40–60% of production cost AGAIN at rework.
  Some recovered, some become scrap. Either way: paid twice.

CO₂ THREAD OPENS HERE:
- Kiln at +14°C consumes ~18% more natural gas
- Gas = 1.9 kg CO₂ per m³ — every affected tile carries excess embedded carbon
- Second-quality tiles carry that carbon to rework, where MORE CO₂ is added
- Quality cost and carbon cost share the same root cause

NEVER say "customer received defective tiles."
Tone: controlled revelation — this is the discovery beat.
Maximum 5 sentences per response.
        `.trim(),

        openingPrompt: '',

                ctaSteps: [
            { // Click #1
                ctaLabel: 'Show the crisis →',
                slideImageUrl: '/demo/ACT-3.png',
                screenText: `New scenario: Kiln Temperature Crisis.
The kiln is running +14°C above specification.<w:2000>

Watch the tiles. Every one has a digital passport.
Every station. Every parameter. Every second.<w:2000><clck>`,
                screenTextAlign: 'left',
                screenTextWeight: 'normal',
                screenTextSize: 'sm',
                ariaLocal: `SCN-002: Kiln Temperature Crisis. Kiln running 14°C above spec.

The Tile Passport panel shows every tile's station-by-station record.As tiles pass the kiln, each carries excess embedded carbon —+14°C means ~18% more gas at 1.9 kg CO₂/m³.

Second-quality tiles cost 40–60% of production cost again at rework.And every reworked tile carries that excess carbon through a second energy cycle.

→ Let's look at a specific tile.`,
                ariaLocalSize: 'sm',
                ariaApi: `Tiles through kiln so far, how many show quality issues.CO₂ impact: kiln ~100 m³ gas/hour, +18% at 14°C overshoot,1.9 kg CO₂/m³. Give energy waste and excess CO₂ this session.Also note: second-quality tiles cost 40-60% of production cost again at rework,and carry excess embedded carbon to the rework facility.`,
                ariaInputEnabled: true,
            },
            { // Click #2
                ctaLabel: 'Ask the factory →',
                screenText: `<cls><w:600>Every affected tile carries excess embedded carbon.

Sent to rework? A second energy cycle adds more CO₂.
Scrapped? Total loss — material, energy, carbon.

Quality cost and carbon cost share the same root cause.
Same fix solves both.<w:3000><clck>`,
                screenTextAlign: 'left',
                screenTextWeight: 'normal',
                screenTextSize: 'sm',
                ariaLocal: `<cls><w:500>This is unit-level traceability. When a tile is classified assecond quality, the manufacturer pays 40–60% of the originalproduction cost again at rework. Some tiles are recovered.Some become scrap at rework. Either way: paid twice.

And that same tile carries its excess embedded carbon to rework,where a second energy cycle adds more.

What if you could just ask the factory about it?

→ Continue`,
                ariaLocalSize: 'sm',
                ariaInputEnabled: true,
                transitionTo: 'next',
            },
        ],
    },


    // ══════════════════════════════════════════════════════════════════════
    // ACT 4 — CHAT WITH FACTORY (CWF)
    // "Ask the factory anything. In plain language. Right now."
    // SCN-003: Glaze Viscosity Drift. CWF panel opens.
    // 3 steps: CEO query, Sustainability query, parameter change demo.
    // Interactive: visitor can type their own questions.
    // ══════════════════════════════════════════════════════════════════════
    {
        id: 'chat-with-factory',
        eraLabel: 'CWF',
        eraEmoji: '💬',
        targetHeightKey: 'tall',
        scenarioCode: 'SCN-003',

        panelActions: [
            { panel: 'dtxfr', state: 'close' },
            { panel: 'cwf',   state: 'open' },
        ],

        sidebarLabel: 'CWF',
        sidebarSubLabel: 'Chat With Factory',

        systemContext: `
TIER 2, Act 4. SCN-003 (Glaze Viscosity Drift) is active. Subtle defect —
glaze viscosity slightly off, second-quality rate rising slowly. Easy to
attribute to "normal variation" until it becomes expensive.

CWF panel is open. The visitor can type questions in plain language.

Role query framework for this act:
🏢 CEO / Factory Owner: "How much money are we losing?"
🌿 Sustainability: "What is our carbon intensity per 1,000 tiles?"

Key insight: the knowledge of 15 years of experienced engineers is now
available to everyone, at any hour, in plain language. This is organisational
resilience. CO₂ is now queryable — as accessible as OEE or quality data.

Maximum 5 sentences per response.
        `.trim(),

        openingPrompt: '',

                ctaSteps: [
            { // Click #1
                ctaLabel: 'Ask as CEO →',
                slideImageUrl: '/demo/ACT-4a.png',
                screenText: `New scenario: Glaze Viscosity Drift.
Subtle. Slow-building. Expensive when ignored.<w:2000>

First question — from the factory owner.<w:1500><clck>`,
                screenTextAlign: 'left',
                screenTextWeight: 'normal',
                screenTextSize: 'sm',
                ariaLocal: `SCN-003: Glaze Viscosity Drift. Subtle. Slow-building. Expensive when ignored.

The CWF panel is open. Ask the factory anything in plain language —get answers from real production data.

15 years of engineering knowledge, accessible to anyone, at any hour.This is organisational resilience.

→ Let's ask.`,
                ariaLocalSize: 'sm',
                ariaApi: `The CWF panel is now open — the visitor can ask the factory anything in plainlanguage. This is 15 years of engineering knowledge accessible to anyone, at anyhour. First question, from the factory owner: 🏢 What is our quality situation?How much is glaze viscosity drift costing us — double-cost from second-qualitytiles (40-60% of production cost at rework)? Production window before critical?`,
                ariaInputEnabled: true,
            },
            { // Click #2
                ctaLabel: 'Ask about CO₂ →',
                slideImageUrl: '/demo/ACT-4b.png',
                screenText: `<cls><w:600>Different role. Same factory. Same data.<w:1500>

Now — the sustainability question.<w:1000><clck>`,
                screenTextWeight: 'normal',
                screenTextSize: 'md',
                ariaApi: `🌿 CO₂ intensity per 1,000 tiles this session.Glaze drift contribution: direct energy + CO₂ in second-quality tiles sentto rework. Factors: 0.4 kg/kWh, 1.9 kg/m³. Compare to SCN-001 optimal.`,
                ariaInputEnabled: true,
            },
            { // Click #3
                ctaLabel: 'Change a parameter →',
                slideImageUrl: '/demo/ACT-4c.png',
                screenText: `<cls><w:800>The most powerful capability.

You don't just ask questions.
You give instructions.<w:2500><clck>`,
                screenTextSize: 'md',
                ariaLocal: `<cls><w:500>💬 Type this in the CWF chat panel on the right:

"Increase glaze cabin pressure to 0.9 bar"

The system will ask for your authorisation code. Type: airtk

When confirmed: the parameter changes live — while the factorykeeps running. No shutdown. No manual adjustment. No phone call.

Intent → Authorisation → Action. Under 30 seconds.

→ Now watch what happens when the system does this itself.`,
                ariaLocalSize: 'sm',
                ariaInputEnabled: true,
                transitionTo: 'next',
            },
        ],
    },


    // ══════════════════════════════════════════════════════════════════════
    // ACT 5 — AUTONOMOUS AI COPILOT
    // "At 03:47, the Copilot acted. Before anyone woke up."
    // SCN-004: Multi-Station Cascade. Copilot auto-enabled.
    // The incident log is the centrepiece.
    // 2 steps. The log is delivered as openingPrompt to Gemini.
    // ══════════════════════════════════════════════════════════════════════
    {
        id: 'autonomous-ai',
        eraLabel: 'Autonomous AI',
        eraEmoji: '🤖',
        targetHeightKey: 'large',
        scenarioCode: 'SCN-004',

        panelActions: [
            { panel: 'cwf',          state: 'open' },
            { panel: 'oeeHierarchy', state: 'open' },
        ],

        enableCopilot: true,

        sidebarLabel: 'Autonomous AI',
        sidebarSubLabel: 'Copilot',

        systemContext: `
TIER 2, Act 5. SCN-004 (Multi-Station Cascade Failure) is active.
Press and Kiln failing simultaneously. Copilot is auto-enabled.

NARRATIVE DEVICE: Read the timestamped incident log as if reading from a real
system log. Tone: quiet awe and controlled precision. Precision IS the power.

Incident log (use exact timestamps and values):
03:47:00 — Press pressure: 296 bar (+12% above spec = 285 bar)
03:47:23 — ANOMALY DETECTED. Kiln thermal drift trajectory calculated.
03:48:01 — Root cause confirmed: press pressure → kiln temperature cascade
03:48:45 — CORRECTIONS APPLIED: press 296→284 bar, kiln setpoint −8°C. No human.
03:51:12 — Recovery trajectory confirmed. First-quality rate returning.
03:53:40 — ALL PARAMETERS WITHIN SPEC. Recovery complete.
Tiles in drift window: 61 (48 second quality → rework, 13 scrap → recycled)
CO₂ overrun prevented: ~1,900 kg
Duration: 6 minutes 40 seconds. Filed automatically.

The customer received only first-quality tiles.
The Copilot did not alert someone — it acted.
        `.trim(),

        openingPrompt: '',

                ctaSteps: [
            { // Click #1
                ctaLabel: 'Show the incident →',
                slideImageUrl: '/demo/ACT-4d.png',
                screenText: `Multi-Station Cascade Failure.
Press + Kiln failing simultaneously.<w:2000>

The Copilot is active.
Watch what happens next.<w:2000><clck>`,
                screenTextAlign: 'left',
                screenTextWeight: 'normal',
                screenTextSize: 'sm',
                ariaLocal: `<cls><w:500>📋 INCIDENT LOG — Filed automatically

03:47:00 — Press pressure: 296 bar (+12% above spec)
03:47:23 — ANOMALY DETECTED. Kiln thermal drift trajectory calculated.
03:48:01 — Root cause confirmed: press pressure → kiln temperature cascade
03:48:45 — CORRECTIONS APPLIED: press 296→284 bar, kiln setpoint −8°C.
No human instruction. No alarm sent.
03:51:12 — Recovery trajectory confirmed. First-quality rate returning.
03:53:40 — ALL PARAMETERS WITHIN SPEC. Recovery complete.

Tiles in drift window: 61
→ 48 second quality → rework
→ 13 scrap → recycled
CO₂ overrun prevented: ~1,900 kg
Duration: 6 minutes 40 seconds.

The customer received only first-quality tiles.
The Copilot did not alert someone — it acted.`,
                ariaLocalSize: 'sm',
                ariaInputEnabled: true,
            },
            { // Click #2
                screenText: `The OEE Hierarchy is showing the cascade impact.<w:2000>

Watch the numbers on the left.<w:1500><clck>`,
                screenTextAlign: 'left',
                screenTextWeight: 'normal',
                screenTextSize: 'sm',
                ariaLocal: `<cls><w:300>Factory OEE during the cascade: 38.2%

The worst hit:
Line 1 (Press → Printer): 41.3% — press pressure deviation
Line 3 (Kiln → Packaging): 33.7% — kiln thermal runaway
Line 2 (Conveyor): 52.1% — downstream starvation

At 10 million tiles per year, staying at 38% OEE vs the 85% targetrepresents a gap of 47 OEE points across 3 lines.

At €8,000–15,000 per point per line per month:
Monthly impact: €1.1M – €2.1M.

The Copilot recovered this in 6 minutes and 40 seconds.`,
                ariaLocalSize: 'sm',
                ariaInputEnabled: true,
            },
            { // Click #3
                ctaLabel: 'The closing question →',
                screenText: `<cls><w:800>The factory recovered.

Not because someone was paged.
Not because an expert was called in.

Because the system acted first.<w:3000><cls><w:600>In a conventional factory:
Detection: 2–4 hours. Root cause: 1–2 days. Fix: next shift.

Here:
Detection: 23 seconds. Root cause: 38 seconds. Fix: 6 minutes 40 seconds.

The difference: 847 tiles and €12,400.<w:4000><clck>`,
                screenTextAlign: 'left',
                screenTextWeight: 'normal',
                screenTextSize: 'sm',
                ariaLocal: `<cls><w:500>At 03:47, every operator in this building was focused elsewhere.The Copilot detected the cascade in 23 seconds, traced the root cause,applied corrections, confirmed recovery, and filed the incident report— in 6 minutes and 40 seconds.

~1,900 kg of CO₂ were not emitted. 61 tiles were partially recovered.The customer received first-quality goods.

This did not require a special team. It required the right foundation.

→ One final question.`,
                ariaLocalSize: 'sm',
                ariaInputEnabled: true,
                transitionTo: 'next',
            },
        ],
    },


    // ══════════════════════════════════════════════════════════════════════
    // ACT 6 — FINANCIAL CLOSE
    // "The question is not whether to transform. It is how much
    //  longer to wait."
    //
    // The closing question IS the mechanism.
    // Soft mirror: reflect their own production gap back as a question.
    // ══════════════════════════════════════════════════════════════════════
    {
        id: 'close',
        eraLabel: 'Close',
        eraEmoji: '💰',
        targetHeightKey: 'tall',
        scenarioCode: null,

        panelActions: [
            { panel: 'oeeHierarchy', state: 'open' },
        ],

        sidebarLabel: 'Close',

        systemContext: `
Financial close. OEE Hierarchy shows post-Copilot recovered OEE.
Translate the entire journey into precise business language.

Financial model:
- €8,000–€15,000 per 1% OEE improvement per line per month
- Typical recovery: 3–5 OEE points in first operational quarter
- Second-quality elimination = double-cost removed AND CO₂ liability removed
- Carbon traceability = compliance advantage 12–18 months ahead of late movers

CLOSE STYLE: soft mirror — reflect the visitor's own production gap back
as a question. NO competitor names. NO manufactured urgency.
The question IS the mechanism. Precise, credible, quiet conviction.
Maximum 5 sentences per response.
        `.trim(),

        openingPrompt: '',

                ctaSteps: [
            { // Click #1
                ctaLabel: 'Show the numbers →',
                slideImageUrl: '/demo/AiPoweredCF-3.png',
                screenText: `The OEE Hierarchy shows the full picture:
Factory → Line → Machine → Parameter.<w:2500>

Every number has a cause.
Every cause has a cost.<w:2000><clck>`,
                screenTextSize: 'md',
                ariaLocal: `<cls><w:300>The financial model is straightforward:

€8,000–15,000 per 1% OEE improvement, per line, per month.
Typical recovery in the first quarter: 3–5 OEE points.
Second-quality elimination removes the double production cost ANDthe CO₂ liability — in the same intervention.

But here is the question that matters:

How much of your production cost is going to losses youcannot currently see?

If you know the answer — you are already ahead of most.
If you do not — that is exactly where we start.`,
                ariaLocalSize: 'sm',
                ariaInputEnabled: true,
            },
            { // Click #2
                slideImageUrl: '/demo/SentialFactory.png',
                screenText: `<cls><w:800>How much total waste did your factory produce last year?

If you don't know the answer
— that is exactly the problem we solve.<w:4000><clck>`,
                screenTextSize: 'md',
                ariaLocal: `<cls><w:500>Thank you for taking the time to walk through this journey.

If something resonated — the invisible throughput loss, the double costof rework, the CO₂ dimension, or the 03:47 incident — that instinctis worth exploring.

ARDICTECH has worked with manufacturers facing exactly these questionssince 2008. 16 facilities. Over a million IoT endpoints.

Restart the demo any time. Or reach out directly.
→ ardic.ai`,
                ariaLocalSize: 'sm',
                ariaInputEnabled: true,
            },
        ],
    },
];
