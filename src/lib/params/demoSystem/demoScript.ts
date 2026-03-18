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
            // ──────────────────────────────────────────────────────────
            // STEP 0: "Your Factory" + "The Invisible Bleed"
            // The visitor watches, reads, and feels the shock.
            // Factory starts in Phase 4 — tiles begin moving AFTER
            // the reveal text has landed.
            // ──────────────────────────────────────────────────────────
            {
                ctaLabel: 'Start →',
                scenarioCode: 'SCN-001',
                workOrderId: 'WorkID#3',
                delayMs: 800,

                screenText:
                    // ── Beat 1: Recognition ──
                    `This factory produces 4,200 tiles per shift.\n` +
                    `Seven stations. One production line.\n` +
                    `Press → Dryer → Glaze → Printer → Kiln → Sort → Package.` +
                    `<w:4000><cls>` +

                    // ── Beat 2: The Invisible Bleed ──
                    `<w:800>` +
                    `A factory like this, running normally, loses approximately:\n\n` +
                    `€47 in wasted energy — every 20 seconds.\n` +
                    `12 tiles of throughput — never produced, never counted.\n\n` +
                    `No alarm fires.\n` +
                    `No report is filed.\n` +
                    `No one notices.` +
                    `<w:4000><cls>` +

                    // ── Beat 3: The Silence ──
                    `<w:600>` +
                    `This happens every shift. Every day.\n\n` +
                    `The factory looks fine from the outside.\n` +
                    `The losses are entirely invisible.` +
                    `<w:3500><clck>`,

                screenTextAlign: 'left',
                screenTextWeight: 'normal',
                screenTextSize: 'sm',

                /**
                 * ariaLocal — ARIA's first words. Delivered AFTER the
                 * screenText shock. Short, warm, sets up the next beat.
                 */
                ariaLocal:
                    `<cls><w:500>` +
                    `Welcome. I am ARIA — the intelligence layer of this factory.\n\n` +
                    `What you just read is not a worst case. ` +
                    `It is the everyday reality of factories that have no visibility ` +
                    `into what is actually happening on their production line.\n\n` +
                    `The factory behind me is starting now. Watch the tiles move.\n\n` +
                    `→ Click to ask the factory a question.`,
                ariaLocalSize: 'sm',

                /**
                 * No ariaApi — sim hasn't started yet, no data.
                 * ARIA speaks from scripted knowledge only.
                 */

                ariaInputEnabled: false,

                /**
                 * simulationAction: 'reset-start' fires in Phase 4,
                 * AFTER screenText and ariaLocal have finished.
                 * The factory visually comes alive as the visitor
                 * processes ARIA's welcome words.
                 */
                simulationAction: 'reset-start',

                /**
                 * transitionTo: null → next step within same act.
                 * User clicks CTA to advance to Step 1.
                 */
            },

            // ──────────────────────────────────────────────────────────
            // STEP 1: "What If You Could Ask?"
            // CWF panel opens. ARIA queries live simulation data.
            // The visitor sees AI answer a real question with real
            // numbers. This is the WOW moment of Tier 1.
            //
            // By this point the sim has been running for ~10-20s
            // (Step 0 screenText duration + user read time).
            // There should be some production data in Supabase.
            // ──────────────────────────────────────────────────────────
            {
                ctaLabel: 'Ask the factory →',

                screenText:
                    `<cls><w:500>` +
                    `What if you could just ask the factory?\n\n` +
                    `In plain language. Right now.` +
                    `<w:2000><clck>`,

                screenTextAlign: 'center',
                screenTextWeight: 'bold',
                screenTextSize: 'md',

                /**
                 * ariaApi — the live CWF call. This is the ONE API call
                 * in Tier 1. The prompt is optimised for speed and
                 * conciseness. Gemini queries Supabase and returns a
                 * real financial figure.
                 *
                 * Prompt design:
                 *   - Asks for ONE summary number (grabs attention)
                 *   - Requests extrapolation to annual cost (makes it real)
                 *   - Max 3 sentences (fits attention window)
                 *   - No jargon, no OEE terminology
                 *   - If data is sparse (sim just started): the prompt
                 *     explicitly tells Gemini to estimate conservatively
                 */
                ariaApi:
                    `Using the current simulation data for this session: ` +
                    `what is the total estimated financial loss so far from ` +
                    `throughput gaps (tiles not produced due to conveyor speed drift) ` +
                    `and energy wasted during non-productive periods (Kiln gas + Dryer electricity ` +
                    `running while belt speed is below nominal)? ` +
                    `Give ONE total number in euros. ` +
                    `Then say: "This factory has been running for [X] minutes. ` +
                    `At this rate, the annual cost would be approximately €[Y]." ` +
                    `If data is sparse because the simulation just started, estimate ` +
                    `conservatively based on the production rate you can observe. ` +
                    `Maximum 3 sentences. Plain language. No technical acronyms.`,

                ariaInputEnabled: false,

                /** Open CWF panel — the visitor sees where the answer came from */
                panelActions: [
                    { panel: 'cwf', state: 'open' },
                ],
            },

            // ──────────────────────────────────────────────────────────
            // STEP 2: "The 03:47 Incident" + The Fork
            // Seeds the autonomous AI story. Delivers the Tier 1 close.
            // The screenText tells the 03:47 story in compressed form.
            // ariaLocal delivers the fork: full journey or contact.
            //
            // transitionTo: 'next' sends engaged visitors to Act 1
            // (Tier 2: The Journey).
            // ──────────────────────────────────────────────────────────
            {
                ctaLabel: 'Continue →',

                screenText:
                    `<cls><w:1000>` +
                    `That answer came from live production data.\n` +
                    `The AI queried the database, calculated the loss, and responded ` +
                    `— in seconds.` +
                    `<w:3000><cls>` +

                    // ── 03:47 Teaser ──
                    `<w:800>` +
                    `Now imagine this.\n\n` +
                    `03:47 AM. Night shift.\n` +
                    `Kiln temperature drifts above specification.\n` +
                    `The shift operator does not notice.` +
                    `<w:3500><cls>` +

                    `<w:600>` +
                    `03:48 — The system detects the anomaly.\n` +
                    `03:48 — Root cause identified.\n` +
                    `03:49 — Correction applied automatically.\n\n` +
                    `No one was woken up.\n` +
                    `The customer received only first-quality tiles.\n` +
                    `~1,900 kg of CO₂ emissions prevented.` +
                    `<w:4000><clck>`,

                screenTextAlign: 'left',
                screenTextWeight: 'normal',
                screenTextSize: 'sm',

                /**
                 * ariaLocal — the fork. Invites the visitor to choose
                 * depth. "Full journey" = click CTA (transitionTo: next).
                 * "Ask your own question" = use the ARIA input in the
                 * sidebar (already visible). "Talk to an expert" = link.
                 */
                ariaLocal:
                    `<cls><w:500>` +
                    `You have just seen three things most factory owners never see:\n\n` +
                    `1. The silent cost of running blind\n` +
                    `2. A factory that answers questions in plain language\n` +
                    `3. A system that corrects problems before humans notice\n\n` +
                    `What you saw in 90 seconds is available in full detail.\n` +
                    `→ Click "Continue" to walk through the complete journey — from a factory ` +
                    `with zero visibility to one that manages itself autonomously.\n\n` +
                    `Or type your own question to ARIA in the sidebar below.`,
                ariaLocalSize: 'sm',

                ariaInputEnabled: true,

                /** Close CWF panel — Tier 2 will reopen it in Act 4 */
                panelActions: [
                    { panel: 'cwf', state: 'close' },
                ],

                /** Advance to Act 1 (Tier 2: The Journey) */
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
            // STEP 0: Conveyor chart + narration
            {
                ctaLabel: 'Show me →',
                delayMs: 1000,
                mediaInstruction: 'chart:conveyor_speed',

                screenText:
                    `<w:500>` +
                    `This is the conveyor speed over time.` +
                    `<MI><w:5000>\n\n` +
                    `Every dip on this chart is a silent transaction:\n` +
                    `energy in, zero output, no record.` +
                    `<w:3000>\n\n` +
                    `The Kiln keeps burning gas.\n` +
                    `The Dryer keeps drawing electricity.\n` +
                    `No tile moves. No alarm fires. No one knows.` +
                    `<w:3500><clck>`,

                screenTextAlign: 'left',
                screenTextWeight: 'normal',
                screenTextSize: 'sm',

                /**
                 * ariaApi — query live session data. The sim has been
                 * running since Act 0 Step 0 (30-60+ seconds by now).
                 * There should be meaningful data.
                 */
                ariaApi:
                    `Using the live simulation data for this session: ` +
                    `what is the current conveyor speed compared to the nominal speed of 1.0? ` +
                    `How many tiles per hour are being produced vs the theoretical maximum? ` +
                    `During any conveyor speed drops, what is the estimated energy cost ` +
                    `of the Kiln and Dryer running without producing tiles? ` +
                    `Give me concrete numbers from the session data. ` +
                    `End with: "→ What if we at least had a dashboard?"`,

                ariaInputEnabled: true,

                /** Open control panel to show the conveyor controls */
                panelActions: [
                    { panel: 'controlPanel', state: 'open' },
                ],
            },

            // STEP 1: Financial translation + transition
            {
                ctaLabel: 'Add a dashboard →',

                screenText:
                    `<cls><clmi><w:800>` +
                    `At a factory producing 10 million tiles per year,\n` +
                    `a 3% throughput gap from conveyor drift costs approximately\n` +
                    `€180,000–€240,000 annually in lost production capacity\n` +
                    `— before counting the energy wasted during idle periods.` +
                    `<w:3500><clck>`,

                screenTextAlign: 'left',
                screenTextWeight: 'normal',
                screenTextSize: 'sm',

                ariaLocal:
                    `<cls><w:500>` +
                    `No one filed a report. No alarm was triggered. ` +
                    `It happened, cost money, and disappeared.\n\n` +
                    `This is the daily reality of every factory without visibility. ` +
                    `Not a catastrophe — just a slow, silent drain.\n\n` +
                    `→ What changes when we add a dashboard?`,
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

        openingPrompt:
            `A KPI dashboard has just been added to the factory. ` +
            `In 3 sentences: what does the Basic Panel now show ` +
            `(OEE percentage, throughput count, energy figures), ` +
            `what critical information is still completely invisible ` +
            `(when the belt slowed, trend direction, root cause, idle energy cost), ` +
            `and why a number without context is worse than no number at all ` +
            `(it creates false confidence). ` +
            `Still SCN-001 — only throughput and energy, no defects. ` +
            `End with: "→ The dashboard raises a question it cannot answer."`,

        ctaSteps: [
            // STEP 0: Dashboard opens, live data query
            {
                ctaLabel: 'Show the dashboard →',
                slideImageUrl: '/demo/ACT-2.png',

                screenText:
                    `A dashboard. OEE. Throughput. Energy. All visible now.` +
                    `<w:2000>\n\n` +
                    `But can we explain any of them?` +
                    `<w:1500><clck>`,

                screenTextAlign: 'center',
                screenTextWeight: 'bold',
                screenTextSize: 'md',

                ariaApi:
                    `The Basic Panel is now open. Using the current simulation data: ` +
                    `what is the OEE right now, and what is the gap between ` +
                    `actual throughput and theoretical maximum? ` +
                    `Then ask: what specific information would a factory manager need ` +
                    `to understand WHY OEE is at this level — information that ` +
                    `the basic dashboard fundamentally cannot provide? Be concrete.`,

                ariaInputEnabled: true,

                panelActions: [
                    { panel: 'basicPanel', state: 'open' },
                ],
            },

            // STEP 1: The limitation + transition
            {
                ctaLabel: 'Go deeper →',

                screenText:
                    `<cls><w:600>` +
                    `OEE at 87%.\n\n` +
                    `Good? Bad? Getting worse?\n` +
                    `Which machine? Which parameter? Since when?\n\n` +
                    `The dashboard cannot answer.` +
                    `<w:3000><clck>`,

                screenTextAlign: 'center',
                screenTextWeight: 'normal',
                screenTextSize: 'md',

                ariaLocal:
                    `<cls><w:500>` +
                    `This is the gap that costs manufacturers millions without anyone noticing. ` +
                    `They see the score. They cannot see the game.\n\n` +
                    `The dashboard shows a single point in time with no root cause, ` +
                    `no trend, no breakdown by station, no explanation for why today ` +
                    `is different from last Tuesday.\n\n` +
                    `The answer requires something fundamentally different. ` +
                    `Not more dashboards. Unit-level traceability.\n\n` +
                    `→ Continue`,
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

        openingPrompt:
            `SCN-002 (Kiln Temperature Crisis) has just been loaded. Kiln running 14°C above spec. ` +
            `The Tile Passport panel is now open showing every tile's complete station-by-station record. ` +
            `In 4 sentences: describe what is happening to tiles as they pass through the kiln, ` +
            `what the tile passport reveals about each affected tile, ` +
            `the double-cost mechanism of second quality (40–60% paid again at rework), ` +
            `and the CO₂ dimension: kiln at +14°C uses ~18% more gas at 1.9 kg CO₂/m³, ` +
            `every affected tile carries excess embedded carbon that also travels to rework. ` +
            `End with: "→ Let's look at a specific tile."`,

        ctaSteps: [
            // STEP 0: Kiln crisis + passport reveal
            {
                ctaLabel: 'Show the crisis →',
                slideImageUrl: '/demo/ACT-3.png',

                screenText:
                    `New scenario: Kiln Temperature Crisis.\n` +
                    `The kiln is running +14°C above specification.` +
                    `<w:2000>\n\n` +
                    `Watch the tiles. Every one has a digital passport.\n` +
                    `Every station. Every parameter. Every second.` +
                    `<w:2000><clck>`,

                screenTextAlign: 'left',
                screenTextWeight: 'normal',
                screenTextSize: 'sm',

                ariaApi:
                    `Using the current simulation data for SCN-002: ` +
                    `how many tiles have passed through the kiln so far, ` +
                    `how many show kiln-related quality issues, ` +
                    `and what is the CO₂ impact of running the kiln 14°C above spec? ` +
                    `Calculate: kiln ~100 m³ gas/hour nominal, 18% overconsumption at +14°C, ` +
                    `emission factor 1.9 kg CO₂/m³. ` +
                    `Give both energy waste and excess CO₂ for the session.`,

                ariaInputEnabled: true,
            },

            // STEP 1: Double cost + CO₂ + transition
            {
                ctaLabel: 'Ask the factory →',

                screenText:
                    `<cls><w:600>` +
                    `Every affected tile carries excess embedded carbon.\n\n` +
                    `Sent to rework? A second energy cycle adds more CO₂.\n` +
                    `Scrapped? Total loss — material, energy, carbon.\n\n` +
                    `Quality cost and carbon cost share the same root cause.\n` +
                    `Same fix solves both.` +
                    `<w:3000><clck>`,

                screenTextAlign: 'left',
                screenTextWeight: 'normal',
                screenTextSize: 'sm',

                ariaLocal:
                    `<cls><w:500>` +
                    `This is unit-level traceability. When a tile is classified as ` +
                    `second quality, the manufacturer pays 40–60% of the original ` +
                    `production cost again at rework. Some tiles are recovered. ` +
                    `Some become scrap at rework. Either way: paid twice.\n\n` +
                    `And that same tile carries its excess embedded carbon to rework, ` +
                    `where a second energy cycle adds more.\n\n` +
                    `What if you could just ask the factory about it?\n\n` +
                    `→ Continue`,
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

        openingPrompt:
            `SCN-003 (Glaze Viscosity Drift) is now active. Subtle defect — ` +
            `glaze viscosity slightly off, second-quality rate rising slowly. ` +
            `The CWF panel is open. In 3 sentences: introduce what the visitor ` +
            `is about to experience (ask the factory anything in plain language, ` +
            `get answers from real production data), mention organisational resilience ` +
            `(15 years of engineering knowledge accessible to anyone, any hour), ` +
            `and invite them to follow the guided queries or type their own. ` +
            `End with: "→ Let\'s ask."`,

        ctaSteps: [
            // STEP 0: CEO question
            {
                ctaLabel: 'Ask as CEO →',
                slideImageUrl: '/demo/ACT-4a.png',

                screenText:
                    `New scenario: Glaze Viscosity Drift.\n` +
                    `Subtle. Slow-building. Expensive when ignored.` +
                    `<w:2000>\n\n` +
                    `First question — from the factory owner.` +
                    `<w:1500><clck>`,

                screenTextAlign: 'left',
                screenTextWeight: 'normal',
                screenTextSize: 'sm',

                ariaApi:
                    `🏢 FACTORY OWNER QUESTION: ` +
                    `I run this factory. Looking at our current production session, ` +
                    `what is our quality situation in plain business language? ` +
                    `How much is the glaze viscosity drift costing us — estimate ` +
                    `the double-cost from second-quality tiles (40–60% of production ` +
                    `cost paid again at rework). And what production window do we have ` +
                    `before this becomes critical? One paragraph. Real numbers.`,

                ariaInputEnabled: true,
            },

            // STEP 1: Sustainability question
            {
                ctaLabel: 'Ask about CO₂ →',
                slideImageUrl: '/demo/ACT-4b.png',

                screenText:
                    `<cls><w:600>` +
                    `Different role. Same factory. Same data.` +
                    `<w:1500>\n\n` +
                    `Now — the sustainability question.` +
                    `<w:1000><clck>`,

                screenTextAlign: 'center',
                screenTextWeight: 'normal',
                screenTextSize: 'md',

                ariaApi:
                    `🌿 SUSTAINABILITY QUESTION: ` +
                    `What is the CO₂ intensity per 1,000 tiles in the current session? ` +
                    `How does the glaze viscosity drift contribute to excess carbon — ` +
                    `consider both direct energy and the additional CO₂ embedded in ` +
                    `second-quality tiles sent to rework (second energy cycle). ` +
                    `Emission factors: electricity 0.4 kg CO₂/kWh, gas 1.9 kg CO₂/m³. ` +
                    `How does this compare to optimal (SCN-001) conditions?`,

                ariaInputEnabled: true,
            },

            // STEP 2: Parameter change demo (the most impressive interactive moment)
            {
                ctaLabel: 'Change a parameter →',
                slideImageUrl: '/demo/ACT-4c.png',

                screenText:
                    `<cls><w:800>` +
                    `The most powerful capability.\n\n` +
                    `You don't just ask questions.\n` +
                    `You give instructions.` +
                    `<w:2500><clck>`,

                screenTextAlign: 'center',
                screenTextWeight: 'bold',
                screenTextSize: 'md',

                ariaLocal:
                    `<cls><w:500>` +
                    `💬 Type this in the CWF chat panel on the right:\n\n` +
                    `"Increase glaze cabin pressure to 0.9 bar"\n\n` +
                    `The system will ask for your authorisation code. Type: airtk\n\n` +
                    `When confirmed: the parameter changes live — while the factory ` +
                    `keeps running. No shutdown. No manual adjustment. No phone call.\n\n` +
                    `Intent → Authorisation → Action. Under 30 seconds.\n\n` +
                    `→ Now watch what happens when the system does this itself.`,
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

        openingPrompt:
            `SCN-004 (Multi-Station Cascade Failure) has just been loaded. ` +
            `Press and Kiln failing simultaneously. The AI Copilot is enabled ` +
            `and monitoring autonomously. Read the following incident log exactly ` +
            `as written, as if reading from a real system log. Use precise timestamps. ` +
            `After the log, add only this one sentence: ` +
            `"The customer received only first-quality tiles. The Copilot did not ` +
            `alert someone — it acted."\n\n` +
            `THE LOG:\n` +
            `03:47:00 — Press pressure: 296 bar (+12% above spec = 285 bar)\n` +
            `03:47:23 — ANOMALY DETECTED. Kiln thermal drift trajectory calculated.\n` +
            `03:48:01 — Root cause confirmed: press pressure → kiln temperature cascade\n` +
            `03:48:45 — CORRECTIONS APPLIED: press 296→284 bar, kiln setpoint −8°C. No human instruction.\n` +
            `03:51:12 — Recovery trajectory confirmed. First-quality rate returning.\n` +
            `03:53:40 — ALL PARAMETERS WITHIN SPEC. Recovery complete.\n` +
            `Tiles in drift window: 61 (48 second quality → rework, 13 scrap → recycled)\n` +
            `CO₂ overrun prevented: ~1,900 kg\n` +
            `Duration: 6 minutes 40 seconds. Filed automatically.`,

        ctaSteps: [
            // STEP 0: OEE impact + financial calculation
            {
                ctaLabel: 'Show the impact →',
                slideImageUrl: '/demo/ACT-4d.png',

                screenText:
                    `Multi-Station Cascade Failure.\n` +
                    `Press + Kiln failing simultaneously.` +
                    `<w:2000>\n\n` +
                    `The Copilot is active.\n` +
                    `Watch the OEE Hierarchy on the left.` +
                    `<w:1500><clck>`,

                screenTextAlign: 'left',
                screenTextWeight: 'normal',
                screenTextSize: 'sm',

                ariaApi:
                    `The OEE Hierarchy is showing the cascade impact. ` +
                    `Using simulation data for SCN-004: what is the current factory OEE, ` +
                    `which line and machine is pulling it down most, ` +
                    `and what would the monthly financial impact be at 10 million tiles/year ` +
                    `if OEE stayed at the current level? ` +
                    `Use benchmark: €8,000–€15,000 per 1% OEE improvement per line per month.`,

                ariaInputEnabled: true,
            },

            // STEP 1: The recovery + competitive context
            {
                ctaLabel: 'The closing question →',

                screenText:
                    `<cls><w:800>` +
                    `The factory recovered.\n\n` +
                    `Not because someone was paged.\n` +
                    `Not because an expert was called in.\n\n` +
                    `Because the system acted first.` +
                    `<w:3000><cls>` +

                    // ── Competitive context ──
                    `<w:600>` +
                    `In a conventional factory:\n` +
                    `Detection: 2–4 hours. Root cause: 1–2 days. Fix: next shift.\n\n` +
                    `Here:\n` +
                    `Detection: 23 seconds. Root cause: 38 seconds. Fix: 6 minutes 40 seconds.\n\n` +
                    `The difference: 847 tiles and €12,400.` +
                    `<w:4000><clck>`,

                screenTextAlign: 'left',
                screenTextWeight: 'normal',
                screenTextSize: 'sm',

                ariaLocal:
                    `<cls><w:500>` +
                    `At 03:47, every operator in this building was focused elsewhere. ` +
                    `The Copilot detected the cascade in 23 seconds, traced the root cause, ` +
                    `applied corrections, confirmed recovery, and filed the incident report ` +
                    `— in 6 minutes and 40 seconds.\n\n` +
                    `~1,900 kg of CO₂ were not emitted. 61 tiles were partially recovered. ` +
                    `The customer received first-quality goods.\n\n` +
                    `This did not require a special team. It required the right foundation.\n\n` +
                    `→ One final question.`,
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

        openingPrompt:
            `This is the financial close. Translate the journey into business language. ` +
            `Financial model: €8,000–€15,000 per 1% OEE improvement per line per month; ` +
            `3–5 OEE points recovery in first quarter; second-quality elimination removes ` +
            `double-cost AND CO₂ liability in the same intervention. ` +
            `Then deliver the closing question as a soft mirror: reflect the visitor's ` +
            `own production gap back to them. Not about technology — about their operation. ` +
            `End with: "If you'd like to explore what this looks like for your operation, ` +
            `the team at ARDICTECH would be glad to continue the conversation. → ardic.ai"`,

        ctaSteps: [
            // STEP 0: Financial translation + mirror question
            {
                ctaLabel: 'Show the numbers →',
                slideImageUrl: '/demo/AiPoweredCF-3.png',

                screenText:
                    `The OEE Hierarchy shows the full picture:\n` +
                    `Factory → Line → Machine → Parameter.` +
                    `<w:2500>\n\n` +
                    `Every number has a cause.\n` +
                    `Every cause has a cost.` +
                    `<w:2000><clck>`,

                screenTextAlign: 'center',
                screenTextWeight: 'bold',
                screenTextSize: 'md',

                ariaApi:
                    `Based on everything the visitor just experienced — invisible throughput loss, ` +
                    `double cost of second quality, the CO₂ dimension, and autonomous recovery — ` +
                    `what is the single most important question a factory owner should ask ` +
                    `themselves after watching this demo? Not about technology. About their ` +
                    `own operation, their own numbers, their own production gap.`,

                ariaInputEnabled: true,
            },

            // STEP 1: CTA + close
            {
                slideImageUrl: '/demo/SentialFactory.png',

                screenText:
                    `<cls><w:800>` +
                    `How much total waste did your factory produce last year?\n\n` +
                    `If you don't know the answer\n` +
                    `— that is exactly the problem we solve.` +
                    `<w:4000><clck>`,

                screenTextAlign: 'center',
                screenTextWeight: 'bold',
                screenTextSize: 'md',

                ariaLocal:
                    `<cls><w:500>` +
                    `Thank you for taking the time to walk through this journey.\n\n` +
                    `If something resonated — the invisible throughput loss, the double cost ` +
                    `of rework, the CO₂ dimension, or the 03:47 incident — that instinct ` +
                    `is worth exploring.\n\n` +
                    `ARDICTECH has worked with manufacturers facing exactly these questions ` +
                    `since 2008. 16 facilities. Over a million IoT endpoints.\n\n` +
                    `Restart the demo any time. Or reach out directly.\n` +
                    `→ ardic.ai`,
                ariaLocalSize: 'sm',

                ariaInputEnabled: true,
            },
        ],
    },
];
