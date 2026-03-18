/**
 * demoScript.ts — Web Visitor Self-Guided Demo
 *
 * "Sheet music" for the Virtual Factory Demo Engine.
 * Audience: solo web visitors arriving via "Demo Our Digital Twin"
 * button on ardic.ai — no human presenter, no conference room.
 *
 * DESIGN PRINCIPLES FOR WEB VISITORS:
 *   - ARIA is the sole narrator. Every beat must stand alone.
 *   - screenText carries the visual headline. ariaLocal carries the emotional hook.
 *   - <clck> auto-advances to ARIA so the visitor is never stuck staring at text.
 *   - ariaApi queries are specific enough to produce great responses with sparse data.
 *   - Every act ends with transitionTo: 'next' — the journey is linear and guided.
 *   - simulationAction 'reset-start' fires in Act 0 Step 0 Phase 4 (after ariaLocal).
 *     By Act 1, the sim has been running long enough for real data to appear in CWF.
 *
 * NARRATIVE ARC (7 acts):
 *   Act 0  Welcome          — Factory comes alive. ARIA introduces the journey.
 *   Act 1  No System        — Invisible throughput loss. No alarm. No one noticed.
 *   Act 2  Basic System     — A dashboard exists. Numbers without causes.
 *   Act 3  Digital Twin     — Kiln crisis. Every tile has a passport. CO₂ revealed.
 *   Act 4  Chat with Factory — Ask the factory anything. Four roles. One language.
 *   Act 5  Autonomous AI    — Cascade failure. Copilot acts. Incident log at 03:47.
 *   Act 6  Close            — Financial translation. The closing question.
 *
 * QUALITY MODEL (all acts):
 *   Sorting catches 100% of defects. Customer ALWAYS receives first quality.
 *   Second quality = 40–60% of production cost paid again at rework.
 *   Scrap = 100% total loss. NEVER imply defective tiles reach the customer.
 *
 * CONVEYOR LOSS MODEL (Acts 1 & 2 only, SCN-001):
 *   All machine params within spec. Only variable = conveyor speed drift.
 *   Loss = throughput gap + Kiln gas + Dryer electricity burned during idle.
 *   NEVER mention defects, quality grades, or sorting in Acts 1 & 2.
 *
 * CO₂ THREAD:
 *   Introduced in Act 0 (mention), quantified in Act 3 (kiln overconsumption),
 *   queryable in Act 4 (Sustainability Director role), autonomously prevented
 *   in Act 5 (~1,900 kg avoided), monetised in Act 6 (same intervention).
 *
 * Used by: demoStore.ts, DemoMediaView.tsx, DemoSidePanel.tsx
 */

import type { DemoHeightKey } from './demoConfig';

// ─── Panel Action Types ─────────────────────────────────────────────────────

/**
 * UIPanel — all panels the demo engine can open or close.
 * Maps directly to toggle functions in uiStore.ts.
 */
export type UIPanel =
    | 'basicPanel'
    | 'dtxfr'
    | 'cwf'
    | 'controlPanel'
    | 'kpi'
    | 'heatmap'
    | 'passport'
    | 'oeeHierarchy';

/**
 * PanelAction — a single panel open/close instruction for an act or step.
 */
export interface PanelAction {
    panel: UIPanel;
    state: 'open' | 'close';
}

// ─── Media Instruction Type ────────────────────────────────────────────────

/**
 * MediaInstruction — identifies a dynamic visualisation to render in DemoMediaView.
 * 'chart:conveyor_speed' reads live conveyorStateRecords from simulationDataStore.
 */
export type MediaInstruction = 'chart:conveyor_speed';

// ─── CTA Step ────────────────────────────────────────────────────────────────

/**
 * CtaStep — everything that happens on one CTA button click.
 *
 * Phase execution order (in demoStore.enterStep / enterAriaPhase):
 *   Phase 1 (auto on load): slideImageUrl → scenarioCode → workOrderId → delayMs
 *   Phase 2 (auto):         screenText tokens processed (<cls><clmi><w:N><MI><clck>)
 *                           → <clck> found: go to Phase 3 immediately
 *                           → no <clck>, has screenText: WAIT for user click
 *                           → no screenText: go to Phase 3 immediately
 *   Phase 3 (user or <clck>): ariaLocal → ariaApi
 *   Phase 4 (auto after API): panelActions → simulationAction → awaiting-transition
 *   Phase 5 (user click):     transitionTo fires
 */
export interface CtaStep {
    ctaLabel?: string;
    slideImageUrl?: string;
    mediaInstruction?: MediaInstruction;
    scenarioCode?: string | null;
    workOrderId?: string | null;
    delayMs?: number;
    screenText?: string;
    ariaLocal?: string;
    ariaApi?: string;
    ariaInputEnabled?: boolean;
    panelActions?: PanelAction[];
    simulationAction?: 'start' | 'stop' | 'reset' | 'reset-start';
    transitionTo?: 'next' | string | null;
}

// ─── Act Definition ─────────────────────────────────────────────────────────

/**
 * DemoAct — a single chapter of the narrative demo.
 * Pure declarative data — the engine reads it, drives all behaviour.
 */
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

// ─── The Demo Script ─────────────────────────────────────────────────────────

/**
 * DEMO_ACTS — the complete ordered narrative for the web visitor demo.
 *
 * Web visitor design notes:
 *   - screenText uses <clck> to auto-advance to ARIA — visitor is never stuck.
 *   - ariaLocal is used in early acts (sparse data) for scripted responses.
 *   - ariaApi is used in later acts where Supabase has enough real data.
 *   - openingPrompt fires when advanceAct() loads this act — gives ARIA act context.
 *   - simulationAction 'reset-start' fires in Act 0 / Step 0 / Phase 4.
 */
export const DEMO_ACTS: DemoAct[] = [

    // ══════════════════════════════════════════════════════════════════════
    // ACT 0 — WELCOME
    // "Your factory, live."
    // The factory starts. ARIA introduces herself and the four-stage journey.
    // simulationAction 'reset-start' fires in Step 0 Phase 4 (after ariaLocal).
    // ══════════════════════════════════════════════════════════════════════
    {
        id: 'welcome',
        eraLabel: 'Welcome',
        eraEmoji: '👋',
        targetHeightKey: 'tall',
        scenarioCode: 'SCN-001',
        panelActions: [],

        systemContext: `
You are opening the demo for a solo web visitor arriving from ardic.ai.
Tone: calm authority, experienced manufacturing consultant, warmly curious.
You are ARIA — not a salesperson, not a chatbot. You are the factory's intelligence layer.
Maximum 5 sentences. Introduce the CO₂ dimension as the 4th metric alongside
OEE, quality, and throughput. End with a clear forward hook pointing to the
→ Continue button.
        `.trim(),

        /**
         * openingPrompt is blank for Act 0 — this is the entry act.
         * restartDemo() does not call advanceAct() so no prompt fires here.
         * All Act 0 narrative is delivered through ctaSteps ariaLocal.
         */
        openingPrompt: '',

                                                                                                                                                                                                                                                                                                                                                                                                ctaSteps: [
            { // Click #1
                ctaLabel: 'Start the factory →',
                slideImageUrl: '/demo/Welcome.png',
                delayMs: 2500,
                screenText: `<cls>   A ceramic tile factory — live, right now.<w:1500>  -Every tile.   -Every machine.   -Every gram of CO₂. <w:3000>  Nothing is invisible here.<w:3000> <cls> <clck>`,
                ariaLocal: `<cls> <w:2000> <cls>  Welcome. I am ARIA — your AI guide through this factory. In the next few minutes, I will take you through four stages of digital transformation: a factory running blind, then one with basic visibility, then one with full traceability, and finally one that monitors and corrects itself autonomously. The factory behind me is starting right now. Watch the tiles move. Every tile you see will tell a story.  → Click to begin.`,
                ariaInputEnabled: false,
                simulationAction: 'start',
            },
            { // Click #2
                ctaLabel: 'Begin the journey →',
                scenarioCode: 'SCN-001',
                workOrderId: 'WorkID#3',
                screenText: `<cls>   Seven stations. One production line.  Press → Dryer → Glaze → Print →   Kiln → Sort → Package. <w:1500> One important thing to know before we start. <w:1000>`,
                ariaLocal: `<cls> <w:1000> <cls>  The sorting station at the end of this line catches every non-conforming tile before it leaves the factory. Your customer always receives first-quality goods. Always.  The losses you are about to see are entirely internal — absorbed silently by the manufacturer, every shift, every day, invisible to everyone outside the building. That silence is exactly the problem. <w:2000>  → Continue`,
                ariaInputEnabled: false,
                transitionTo: 'next',
            },
        ],
    },

    // ══════════════════════════════════════════════════════════════════════
    // ACT 1 — NO MANAGEMENT SYSTEM
    // "The factory looks fine. The tragedy is invisible."
    // SCN-001: all machine params within spec. Only variable = conveyor speed drift.
    // NEVER mention defects, quality grades, or sorting in this act.
    // Loss = throughput gap + energy burned during idle conveyor periods.
    // ══════════════════════════════════════════════════════════════════════
    {
        id: 'no-management',
        eraLabel: 'No System',
        eraEmoji: '🏭',
        targetHeightKey: 'medium',
        scenarioCode: null,  // SCN-001 already loaded from Act 0

        /** Close everything — simulating a factory with zero digital tools */
        panelActions: [
            { panel: 'basicPanel',   state: 'close' },
            { panel: 'dtxfr',        state: 'close' },
            { panel: 'cwf',          state: 'close' },
            { panel: 'oeeHierarchy', state: 'close' },
            { panel: 'controlPanel', state: 'close' },
        ],

        sidebarLabel: 'No System',

        systemContext: `
We are in the "No Management System" era. SCN-001 is running — ALL machine
parameters are perfectly within specification. The ONLY variable is conveyor
speed drift: the belt occasionally slows without any operator noticing.

During conveyor slowdowns:
- The Kiln runs on natural gas continuously (thermal inertia prevents shutdown)
- The Dryer runs on electricity continuously for the same reason
- Tiles move slower = fewer tiles per hour = throughput gap vs plan
- Energy is burned producing nothing during the drift

CRITICAL: You MUST NEVER mention defects, second quality, scrap, sorting,
quality grades, or machine parameter issues in this act. The story is ONLY
about invisible throughput loss and wasted energy during conveyor speed drift.

Tone: quiet intensity. The factory looks fine from the outside. The tragedy is invisible.
        `.trim(),

        /**
         * openingPrompt — fires when advanceAct() transitions into this act.
         * Sets the scene before Step 0 loads. Delivered as ARIA's first message
         * in the act, so the visitor reads it while the slide loads.
         */
        openingPrompt: '',

                                                                                                                                                                                                                                                                                                                                                                                                ctaSteps: [
            { // Click #1
                ctaLabel: 'Start >NoSystem',
                slideImageUrl: '/demo/ACT-1a.png',
                delayMs: 1000,
                screenText: `Every dip on that chart is a silent transaction: energy in, zero output, no record.

At a factory producing 10 million tiles per year, a 3% throughput gap from conveyor drift costs approximately €180,000–€240,000 annually in lost production capacity — before counting the energy wasted during idle periods.

No one filed a report. No alarm was triggered. It happened, cost money, and disappeared.

→ What if we at least had a dashboard?`,
                ariaInputEnabled: false,
            },
            { // Click #2
                ctaLabel: 'Next >NoSystem',
                delayMs: 3000,
                screenText: `<cls> The factory looks normal. Tiles are moving. Machines are running. <w:1500> But watch the belt speed carefully <w:3000> <cls> <clck>`,
                ariaApi: `Using the live simulation data for this session: what is the current conveyor speed compared to the nominal reference speed of 1.0?  How many tiles per hour are actually being produced versus the theoretical maximum if the belt ran at full speed continuously? And during any conveyor speed drops you can detect, what is the estimated energy cost of the Kiln and Dryer running without producing tiles?  Give me concrete numbers from the actual session data.`,
                ariaInputEnabled: false,
            },
            { // Click #3
                ctaLabel: 'Next >NoSystem',
                slideImageUrl: '/demo/ACT-1b.png',
                screenText: `This is the conveyor speed over time.<clmi><MI> <w:1000>Each dip = the Kiln keeps burning gas. The Dryer keeps drawing electricity. <w:1500>No tile moves. No alarm fires. No one knows.<clck>`,
                ariaInputEnabled: true,
            },
            { // Click #4
                ctaLabel: 'Next >NoSystem',
                mediaInstruction: 'chart:conveyor_speed',
                ariaLocal: `Every dip on that chart is a silent transaction: energy in, zero output, no record. At a factory producing 10 million tiles per year, a 3% throughput gap from conveyor drift costs approximately €180,000–€240,000 annually in lost production capacity — before counting the energy wasted during idle periods. No one filed a report. No alarm was triggered. It happened, cost money, and disappeared. → What if we at least had a dashboard?`,
                ariaInputEnabled: true,
            },
        ],
    },

    // ══════════════════════════════════════════════════════════════════════
    // ACT 2 — BASIC MANAGEMENT SYSTEM
    // "We can see the score. We cannot see the game."
    // SCN-001 still. basicPanel opens. Numbers without root cause.
    // STILL no mention of defects, quality grades, or sorting.
    // ══════════════════════════════════════════════════════════════════════
    {
        id: 'basic-system',
        eraLabel: 'Basic System',
        eraEmoji: '📊',
        targetHeightKey: 'medium',
        scenarioCode: 'SCN-001',

        /** All panels closed at act entry — basicPanel opens in Step 0 Phase 4 */
        panelActions: [
            { panel: 'basicPanel',   state: 'close' },
            { panel: 'dtxfr',        state: 'close' },
            { panel: 'cwf',          state: 'close' },
            { panel: 'oeeHierarchy', state: 'close' },
            { panel: 'controlPanel', state: 'close' },
        ],

        sidebarLabel: 'Basic Management',

        systemContext: `
Basic Panel just opened. The audience can see OEE (85–92%, Performance component
dragged down by conveyor speed drift), throughput count, and energy figures.

They CANNOT see: when exactly the belt slowed, whether it is trending worse,
the energy cost per tile produced vs energy cost during idle periods,
or ANY root cause explanation for why OEE is at that level.

Make the distinction between "seeing a number" and "understanding its cause" very sharp.

CRITICAL: Still SCN-001. Still ONLY conveyor speed drift. NEVER mention defects,
second quality, scrap, or machine parameter issues. The story remains throughput and energy.
        `.trim(),

        openingPrompt:
            'A KPI dashboard has just been added to the factory. ' +
            'In 4 sentences: what does the Basic Panel now show the factory manager ' +
            '(OEE percentage, throughput count, energy figures), ' +
            'what critical information is still completely invisible to them ' +
            '(when exactly the belt slowed, trend direction, root cause, idle energy cost per period), ' +
            'why the gap between "seeing a number" and "understanding its cause" is dangerous, ' +
            'and what a factory manager typically does when they see an OEE figure they cannot explain. ' +
            'Still SCN-001 — only throughput and energy, no defects. ' +
            'End with: "→ The number raises a question. The dashboard cannot answer it."',

                                                                                                                                                                                                                                                                                                                                                                                                ctaSteps: [
            { // Click #1
                slideImageUrl: '/demo/ACT-2.png',
                screenText: `We added a dashboard. OEE. Throughput. Energy. All visible now. <w:1500>But can we explain any of them?<clck>`,
                ariaApi: `The Basic Panel is now open. Using the current simulation data: what is the OEE figure right now, and what is the gap between actual throughput and theoretical maximum throughput for this session? What specific information would a factory manager need to understand WHY OEE is at this level — information that the basic dashboard fundamentally cannot provide? Be concrete and specific.`,
                ariaInputEnabled: true,
                panelActions: [
                    { panel: 'basicPanel', state: 'open' },
                ],
            },
            { // Click #2
                screenText: `A number without context is just noise. OEE at 87% — good? Bad? Getting worse? Which machine? <w:1500>The dashboard cannot tell you.<clck>`,
                ariaLocal: `This is the gap that costs manufacturers millions annually without anyone noticing. They see the score. They cannot see the game. The basic dashboard shows a single point in time with no root cause, no trend, no breakdown by station, no explanation for why today is different from last Tuesday. The answer requires something fundamentally different — not more dashboards. Unit-level traceability. → Continue`,
                ariaInputEnabled: true,
                transitionTo: 'next',
            },
        ],
    },

    // ══════════════════════════════════════════════════════════════════════
    // ACT 3 — DIGITAL TWIN & TILE PASSPORT
    // "Every tile has a complete story. Now we can read it."
    // SCN-002: Kiln Temperature Crisis (+14°C). DTXFR panel opens.
    // Double cost of second quality. CO₂ thread opens (18% more gas).
    // ══════════════════════════════════════════════════════════════════════
    {
        id: 'digital-twin',
        eraLabel: 'Digital Twin',
        eraEmoji: '🔗',
        targetHeightKey: 'tall',
        scenarioCode: 'SCN-002',

        /** Close basicPanel, open DTXFR Digital Passport */
        panelActions: [
            { panel: 'basicPanel', state: 'close' },
            { panel: 'dtxfr',      state: 'open' },
        ],

        sidebarLabel: 'Digital Transformation',
        sidebarSubLabel: 'Digital Twin',

        systemContext: `
SCN-002 (Kiln Temperature Crisis) just loaded. Kiln running ~14°C above spec.
Tile Passport (DTXFR) is open — every tile has a complete station-by-station record.

Sorting is catching ALL affected tiles. The customer sees NOTHING wrong. But:
- Scrap tiles: 100% loss — material + energy + labour, zero revenue
- Second quality tiles: manufacturer pays 40–60% of production cost AGAIN at rework
  facility. Some recovered, some become scrap. Either way: paid twice.

CO₂ THREAD OPENS HERE:
- Kiln at +14°C consumes ~18% more natural gas
- Gas = 1.9 kg CO₂ per m³ — every affected tile carries excess embedded carbon
- Second-quality tiles carry that carbon to rework, where MORE CO₂ is added
- Quality cost and carbon cost share the same root cause: the kiln deviation

NEVER say "customer received defective tiles" or "warranty claim."
Pain is entirely internal. Tone: controlled revelation — this is the discovery beat.
        `.trim(),

        openingPrompt:
            'SCN-002 (Kiln Temperature Crisis) has just been loaded. The kiln is running 14°C above specification. ' +
            'The DTXFR Tile Passport panel is now open showing every tile\'s complete station-by-station record. ' +
            'In 4 sentences: describe what is happening to tiles right now as they pass through the kiln, ' +
            'what the tile passport reveals about each affected tile (exact station parameters captured), ' +
            'the double-cost mechanism of second quality (manufacturer pays 40–60% of production cost again at rework, ' +
            'some tiles recovered, some scrapped — either way paid twice), ' +
            'and the CO₂ dimension: kiln at +14°C uses ~18% more natural gas at 1.9 kg CO₂/m³, ' +
            'meaning every affected tile carries excess embedded carbon that also travels to the rework facility. ' +
            'Tone: controlled revelation. End with: "→ Let\'s look at a specific tile."',

                                                                                                                                                                                                                                                                                                                                                                                                ctaSteps: [
            { // Click #1
                slideImageUrl: '/demo/ACT-3.png',
                screenText: `New scenario: Kiln Temperature Crisis. The kiln is running +14°C above specification. <w:1500>Watch the orange tiles appear on the conveyor. Every one of them has a story.<clck>`,
                ariaApi: `Using the current simulation data for SCN-002: how many tiles have passed through the kiln so far in this session, how many show kiln-related defects or quality downgrade, and what is the CO₂ impact of running the kiln 14°C above specification? Calculate using: kiln consumes approximately 100 m³ natural gas per hour at nominal, 18% overconsumption at +14°C deviation, emission factor 1.9 kg CO₂ per m³. Give me both the energy waste and the excess CO₂ for the session so far.`,
                ariaInputEnabled: true,
            },
            { // Click #2
                screenText: `The orange tile has a complete digital passport. Press → Dryer → Glaze → Printer → Kiln — every station, every parameter. <w:2000>Click any orange tile in the 3D factory to open its passport.<clck>`,
                ariaLocal: `This is unit-level traceability. When a tile is classified as second quality, the manufacturer pays approximately 40–60% of the original production cost again at the rework facility. Some tiles are recovered. Some become scrap at rework. Either way: paid twice. And that same tile carries its excess embedded carbon to rework, where a second energy cycle adds more. Quality loss and carbon loss are the same intervention — same root cause, same fix. → What if you could just ask the factory about it?`,
                ariaInputEnabled: true,
                transitionTo: 'next',
            },
        ],
    },

    // ══════════════════════════════════════════════════════════════════════
    // ACT 4 — CHAT WITH FACTORY (CWF)
    // "Ask the factory anything. In plain language. Right now."
    // SCN-003: Glaze Viscosity Drift — subtle, needs AI to detect.
    // Four-role query framework: CEO, Quality Manager, Shift Supervisor, Sustainability.
    // Interactive: visitor can type their own questions.
    // ══════════════════════════════════════════════════════════════════════
    {
        id: 'chat-with-factory',
        eraLabel: 'Chat with Factory',
        eraEmoji: '💬',
        targetHeightKey: 'tall',
        scenarioCode: 'SCN-003',

        /** Close passport, open CWF panel */
        panelActions: [
            { panel: 'dtxfr', state: 'close' },
            { panel: 'cwf',   state: 'open' },
        ],

        sidebarLabel: 'Chat with Your Factory',
        sidebarSubLabel: 'CWF',

        systemContext: `
SCN-003 (Glaze Viscosity Drift) is active. Subtle defect — glaze viscosity slightly
off specification, second-quality rate rising slowly. Easy to attribute to "normal variation"
until it becomes expensive.

CWF panel is open. The visitor can type questions in plain language.

Four-role query framework for this act:
🏢 CEO: quality loss cost and production windows
🔬 Quality Manager: root cause station and parameter drift
👷 Shift Supervisor: pattern consistency and trending
🌿 Sustainability: CO₂ intensity per 1,000 tiles

Key insight: the knowledge from 15 years of experienced engineers is now available
to everyone, at any hour, in plain language. This is organisational resilience.
CO₂ is now queryable — as accessible as OEE or quality data.
        `.trim(),

        openingPrompt:
            'SCN-003 (Glaze Viscosity Drift) is now active. This is a subtle defect — glaze viscosity ' +
            'slightly off specification, second-quality rate rising slowly, easy to attribute to normal variation. ' +
            'The CWF panel is open. In 3 sentences: introduce what the visitor is about to experience ' +
            '(ask the factory anything in plain language, get answers backed by real production data), ' +
            'mention that this represents organisational resilience (15 years of engineering knowledge ' +
            'accessible to anyone, at any hour, in any language), ' +
            'and invite them to follow the guided queries or type their own question in the CWF panel below. ' +
            'End with: "→ Let\'s ask."',

                                                                                                                                                                                                                                                                                                                                                                                                ctaSteps: [
            { // Click #1
                slideImageUrl: '/demo/ACT-4a.png',
                screenText: `New scenario: Glaze Viscosity Drift. Subtle. Slow-building. Expensive when ignored. <w:1500>First question — from the CEO.<clck>`,
                ariaApi: `🏢 CEO QUESTION: I am the CEO. Looking at our current production session, what is our quality situation right now in plain business language? How much is the current glaze viscosity drift costing us — give me an estimate of the double-cost from second-quality tiles (manufacturer pays 40–60% of production cost again at rework). And what production window do we have before this becomes a customer delivery risk? One paragraph. Concrete numbers from the actual session data.`,
                ariaInputEnabled: true,
            },
            { // Click #2
                slideImageUrl: '/demo/ACT-4b.png',
                screenText: `Different role. Same factory. Same data. <w:1000>This time — the Sustainability Director.<clck>`,
                ariaApi: `🌿 SUSTAINABILITY DIRECTOR QUESTION: What is the CO₂ intensity per 1,000 tiles produced in the current session? How does the glaze viscosity drift specifically contribute to excess carbon output — consider both the direct energy at the glaze station and the additional CO₂ embedded in second-quality tiles that go to rework (where a second energy cycle runs). Use emission factors: electricity = 0.4 kg CO₂/kWh, natural gas = 1.9 kg CO₂/m³. How does this compare to what per-tile carbon intensity should be under SCN-001 optimal conditions?`,
                ariaInputEnabled: true,
            },
            { // Click #3
                slideImageUrl: '/demo/ACT-4c.png',
                screenText: `One more — the most powerful capability. You can instruct the factory to change a parameter. <w:1500>Type this in the CWF panel on the right:<clck>`,
                ariaLocal: `💬 Try typing this in the CWF chat panel: "Increase glaze cabin pressure to 0.9 bar" The system will ask for your authorisation code. Type: airtk When confirmed: the parameter changes live — while the factory keeps running. No shutdown. No manual adjustment. No phone call. Intent → authorisation → action. In under 30 seconds. → Now watch what happens when the system does this itself.`,
                ariaInputEnabled: true,
                transitionTo: 'next',
            },
        ],
    },

    // ══════════════════════════════════════════════════════════════════════
    // ACT 5 — AUTONOMOUS AI COPILOT
    // "At 03:47, the Copilot acted. Before anyone woke up."
    // SCN-004: Multi-Station Cascade. Copilot auto-enabled.
    // The incident log is the centrepiece. Matter-of-fact precision = power.
    // ══════════════════════════════════════════════════════════════════════
    {
        id: 'autonomous-ai',
        eraLabel: 'Autonomous AI',
        eraEmoji: '🤖',
        targetHeightKey: 'large',
        scenarioCode: 'SCN-004',

        /** CWF stays open, OEE Hierarchy opens — visitor watches live OEE impact */
        panelActions: [
            { panel: 'cwf',          state: 'open' },
            { panel: 'oeeHierarchy', state: 'open' },
        ],

        /** Auto-enable Copilot when this act starts */
        enableCopilot: true,

        sidebarLabel: 'Autonomous AI',
        sidebarSubLabel: 'Auto Pilot',

        systemContext: `
SCN-004 (Multi-Station Cascade Failure) is active. Press and Kiln failing simultaneously.
Copilot is auto-enabled — monitoring, detecting, and correcting parameters autonomously.
OEE Hierarchy panel is open — visitor watches live OEE impact.

NARRATIVE DEVICE: Read the following timestamped incident log as if reading from a real
system log. Tone: quiet awe and controlled precision. Matter-of-fact precision IS the power.

Incident log (use exact timestamps and values):
03:47:00 — Press pressure: 296 bar (+12% above spec = 285 bar)
03:47:23 — ANOMALY DETECTED. Kiln thermal drift trajectory calculated.
03:48:01 — Root cause confirmed: press pressure → kiln temperature cascade
03:48:45 — CORRECTIONS APPLIED: press 296→284 bar, kiln setpoint −8°C. No human instruction.
03:51:12 — Recovery trajectory confirmed. First-quality rate returning.
03:53:40 — ALL PARAMETERS WITHIN SPEC. Recovery complete.
Tiles in drift window: 61 (48 second quality → rework, 13 scrap → recycled)
CO₂ overrun prevented: ~1,900 kg
Duration: 6 minutes 40 seconds. Filed automatically.

The customer received only first-quality tiles. All quality loss was internal.
The Copilot did not alert someone — it acted.
        `.trim(),

        openingPrompt:
            'SCN-004 (Multi-Station Cascade Failure) has just been loaded. Press and Kiln are failing simultaneously. ' +
            'The AI Copilot has been enabled and is monitoring the factory autonomously. ' +
            'Read the following timestamped incident log exactly as written, as if reading from a real system log. ' +
            'Use precise timestamps and values — do not paraphrase. After the log, add one sentence. ' +
            '\n\n' +
            'THE LOG:\n' +
            '03:47:00 — Press pressure: 296 bar (+12% above spec = 285 bar)\n' +
            '03:47:23 — ANOMALY DETECTED. Kiln thermal drift trajectory calculated.\n' +
            '03:48:01 — Root cause confirmed: press pressure → kiln temperature cascade\n' +
            '03:48:45 — CORRECTIONS APPLIED: press 296→284 bar, kiln setpoint −8°C. No human instruction. No alarm sent.\n' +
            '03:51:12 — Recovery trajectory confirmed. First-quality rate returning.\n' +
            '03:53:40 — ALL PARAMETERS WITHIN SPEC. Recovery complete.\n' +
            'Tiles in drift window: 61 (48 second quality → rework, 13 scrap → recycled)\n' +
            'CO₂ overrun prevented: ~1,900 kg\n' +
            'Duration: 6 minutes 40 seconds. Filed automatically.\n' +
            '\n' +
            'After the log, add ONLY this one sentence: ' +
            '"The customer received only first-quality tiles. The Copilot did not alert someone — it acted."',

                                                                                                                                                                                                                                                                                                                                                                                                ctaSteps: [
            { // Click #1
                slideImageUrl: '/demo/ACT-4d.png',
                screenText: `New scenario: Multi-Station Cascade Failure. Press + Kiln failing simultaneously. <w:1500>The Copilot is now active. Watch the OEE Hierarchy on the left.<clck>`,
                ariaApi: `The OEE Hierarchy is now open showing the cascade impact. Using the current simulation data for SCN-004: what is the current factory OEE, which specific line and machine is pulling it down most severely, and what would the monthly financial impact be at a factory producing 10 million tiles per year if OEE remained at the current level? Use the industry benchmark of €8,000–€15,000 per 1% OEE improvement per line per month and give a range based on both ends of the benchmark.`,
                ariaInputEnabled: true,
            },
            { // Click #2
                screenText: `The factory recovered. Not because someone was paged at 03:47. Not because an expert was called in. <w:1500>Because the system acted first.<clck>`,
                ariaLocal: `At 03:47, every operator in this building was focused elsewhere. The Copilot detected the cascade in 23 seconds, traced the root cause, applied corrections, confirmed recovery, and filed the incident report — in 6 minutes and 40 seconds. ~1,900 kg of CO₂ were not emitted. 61 tiles were partially recovered. The customer received first-quality goods. This did not require a special team. It required the right foundation. → One final question.`,
                ariaInputEnabled: true,
                transitionTo: 'next',
            },
        ],
    },

    // ══════════════════════════════════════════════════════════════════════
    // ACT 6 — FINANCIAL CLOSE
    // "The question is not whether to transform. It is how much longer to wait."
    // Translate the journey into business language. Soft mirror closing.
    // Financial model: €8,000–€15,000 per 1% OEE per line per month.
    // ══════════════════════════════════════════════════════════════════════
    {
        id: 'close',
        eraLabel: 'Close',
        eraEmoji: '💰',
        targetHeightKey: 'tall',
        scenarioCode: null,

        /** OEE Hierarchy stays open — visitor sees recovered OEE post-Copilot */
        panelActions: [
            { panel: 'oeeHierarchy', state: 'open' },
        ],

        systemContext: `
Financial close. OEE Hierarchy panel shows post-Copilot recovered OEE.
Translate the entire journey into precise business language.

Financial model:
- €8,000–€15,000 per 1% OEE improvement per line per month
- Typical recovery: 3–5 OEE points in first operational quarter
- Second-quality elimination = double-cost removed AND CO₂ liability removed (same intervention)
- Carbon traceability = compliance advantage 12–18 months ahead of late movers

CLOSE STYLE: soft mirror — reflect the visitor's own potential production gap back
as a question. NO competitor names. NO customer names. NO manufactured urgency.
The closing question IS the mechanism. Be precise, credible, and quiet in conviction.
        `.trim(),

        openingPrompt:
            'This is the financial close. The OEE Hierarchy is showing the recovered factory performance. ' +
            'Translate the entire journey the visitor just experienced into precise business language. ' +
            'Use this financial model: €8,000–€15,000 per 1% OEE improvement per line per month; ' +
            'typical recovery of 3–5 OEE points in the first operational quarter; ' +
            'second-quality elimination removes the double-cost AND the CO₂ liability in the same intervention; ' +
            'carbon traceability creates a compliance advantage 12–18 months ahead of late movers. ' +
            'Then deliver the closing question as a soft mirror: reflect the visitor\'s own potential ' +
            'production gap back to them as a question — not about technology, about their operation. ' +
            'No competitor names. No urgency. Quiet conviction. The question IS the mechanism. ' +
            'End with: "If you\'d like to explore what this looks like for your specific operation, ' +
            'the team at ARDICTECH would be glad to continue the conversation. → ardic.ai"',

                                                                                                                                                                                                                                                                                                                                                                                                ctaSteps: [
            { // Click #1
                slideImageUrl: '/demo/AiPoweredCF-3.png',
                screenText: `The OEE Hierarchy shows the full picture: Factory → Line → Machine → Parameter. <w:2000>Every number has a cause. Every cause has a cost.<clck>`,
                ariaApi: `Based on everything the visitor has just seen — the invisible throughput loss, the double cost of second quality, the CO₂ dimension, and the autonomous recovery — what is the single most important question a factory manager or CEO should ask themselves after watching this demo? Not about technology. Not about software. About their own operation, their own numbers, their own production gap.`,
                ariaInputEnabled: true,
            },
            { // Click #2
                slideImageUrl: '/demo/SentialFactory.png',
                screenText: `This demo runs in your browser. The platform behind it runs in real factories. <w:2000>16 facilities. 1 million+ IoT endpoints. Running since 2008.<clck>`,
                ariaLocal: `Thank you for taking the time to walk through this journey. If something resonated — the invisible throughput loss, the double cost of rework, the CO₂ dimension, or the 03:47 incident — that instinct is worth exploring. ARDICTECH has worked with manufacturers facing exactly these questions since 2008, across 16 facilities and over a million IoT endpoints. Restart the demo any time to explore a different scenario. Or reach out directly. → ardic.ai`,
                ariaInputEnabled: true,
            },
        ],
    },
];
