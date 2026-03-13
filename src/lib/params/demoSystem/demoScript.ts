/**
 * demoScript.ts — Narrative Demo Act Definitions
 *
 * The "sheet music" for the Demo System. Defines the ordered sequence of
 * DemoAct objects that drive the entire demo narrative engine.
 *
 * FLEXIBILITY DESIGN:
 *   This file is PURE DATA — no logic, no imports (except DemoHeightKey), no side effects.
 *   To change the demo story: edit only this file.
 *   To reorder acts, change panelActions, adjust heights, or rewrite
 *   the narrative prompts — all changes happen here, zero logic touches needed.
 *
 * ACT STRUCTURE (7 acts):
 *   Each DemoAct describes ONE chapter of the demo story. The engine reads
 *   the act config and automatically:
 *     1. Animates the panel to the specified height
 *     2. Opens/closes the specified panels via uiStore
 *     3. Loads the specified scenario via simulationDataStore
 *     4. Sends the openingPrompt to CWF as the act's first message
 *
 * NARRATIVE ARC:
 *   Act 0: Welcome — frame the journey (value-capture, CO₂ thread)
 *   Act 1: No System — invisible conveyor speed loss (SCN-001, no defects)
 *   Act 2: Basic System — dashboard shows gap, cannot explain cause
 *   Act 3: Digital Twin — kiln crisis, double cost, CO₂ revelation (SCN-002)
 *   Act 4: Chat with Factory — glaze drift, 4-role query framework (SCN-003)
 *   Act 5: Autonomous AI — cascade failure, timestamped incident log (SCN-004)
 *   Act 6: Close — financial translation, carbon positioning, closing question
 *
 * QUALITY MODEL (all acts):
 *   Sorting catches 100% of defects. Customer always receives first-quality.
 *   Second quality = double cost at rework. Scrap = total loss.
 *   NEVER use "customer complaint", "warranty claim", "recall".
 *
 * CONVEYOR LOSS MODEL (Acts 1 & 2 only):
 *   SCN-001 = all machine params within spec. Only variable = conveyor speed
 *   drift. Loss = throughput gap + energy burned while Kiln/Dryer run idle.
 *   NEVER mention defects, quality grades, or sorting in Acts 1 & 2.
 *
 * CO₂ THREAD:
 *   Introduced in Act 0, quantified in Act 3, made queryable in Act 4,
 *   autonomously prevented in Act 5, monetised in Act 6.
 *
 * Used by: demoStore.ts, DemoScreen.tsx
 */

import type { DemoHeightKey } from './demoConfig';

// ─── Panel Action Types ─────────────────────────────────────────────────────

/**
 * UIPanel — all panels that the demo engine can open or close.
 * Maps directly to the toggle functions in uiStore.ts.
 *
 * To add a new panel: add its name here and handle it in demoStore.applyPanelActions().
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
 * PanelAction — a single panel open/close instruction for an act transition.
 * The engine applies ALL panel actions for an act before sending the opening prompt.
 */
export interface PanelAction {
    /** Which UI panel to control */
    panel: UIPanel;
    /** 'open' = ensure visible, 'close' = ensure hidden */
    state: 'open' | 'close';
}

// ─── Act Definition ─────────────────────────────────────────────────────────

/**
 * DemoAct — a single chapter of the narrative demo.
 *
 * Every field is declarative data. The demo engine reads this config
 * and drives all behaviour from it — no per-act logic code needed.
 */
export interface DemoAct {
    /**
     * Unique string identifier for this act.
     * Used as React key and for act tracking in demoStore.
     */
    id: string;

    /**
     * Short era label shown in the demo progress indicator.
     * Keep to 2–4 words maximum for the vertical breadcrumb layout.
     */
    eraLabel: string;

    /**
     * Emoji prefix for the era label — makes the breadcrumb visually scannable.
     */
    eraEmoji: string;

    /**
     * Height key for this act's panel size.
     * Maps to DEMO_ACT_HEIGHTS in demoConfig.ts.
     * Panel animates smoothly to this height when the act begins.
     */
    targetHeightKey: DemoHeightKey;

    /**
     * Scenario code to load when this act begins, or null to leave unchanged.
     * Loaded via simulationDataStore.loadScenario() — requires sim to be running.
     *
     * null = do not switch scenario (acts that continue the same scenario)
     */
    scenarioCode: string | null;

    /**
     * Panel actions to apply when this act begins.
     * Applied immediately (local uiStore calls), before the opening prompt is sent.
     * Empty array = no panel changes.
     */
    panelActions: PanelAction[];

    /**
     * If true, the demo engine will automatically call the Copilot enable API
     * when this act begins, then update copilotStore locally.
     * Used exclusively by the Autonomous AI act to engage the AI copilot without
     * requiring any manual user interaction.
     */
    enableCopilot?: boolean;

    /**
     * Per-act AI system context injected into the conversation.
     * This is APPENDED to DEMO_SYSTEM_PROMPT — it specialises ARIA's framing
     * for this specific act without replacing the base persona.
     *
     * Write this as a brief instruction to ARIA, e.g.:
     * "You are now in the 'Basic System' era. The factory has a KPI dashboard
     *  showing production numbers but NO tile-level traceability..."
     */
    systemContext: string;

    /**
     * The opening prompt auto-sent to CWF when the act begins.
     * This triggers ARIA to deliver the act's narrative and Socratic question.
     *
     * Write this as a rich instruction to ARIA, telling it exactly what story to
     * tell and what question to pose to the audience.
     */
    openingPrompt: string;
}

// ─── The Demo Script ─────────────────────────────────────────────────────────

/**
 * DEMO_ACTS — the complete, ordered narrative for the demo.
 *
 * 7 acts (0–6) covering the full transformation journey:
 *   Welcome → No System → Basic System → Digital Twin →
 *   Chat with Factory → Autonomous AI → Financial Close
 *
 * ════════════════════════════════════════════════════════════════
 * TO MODIFY THE DEMO:
 *   Edit the entries below. Each act is self-contained pure data.
 *   - Change openingPrompt to rewrite the narrative
 *   - Change scenarioCode to use a different factory state
 *   - Change panelActions to open different panels at the right moment
 *   - Change targetHeightKey to adjust the panel breathing
 * ════════════════════════════════════════════════════════════════
 */
export const DEMO_ACTS: DemoAct[] = [

    // ══════════════════════════════════════════════════════════════════════
    // ACT 0 — Welcome
    // ══════════════════════════════════════════════════════════════════════
    {
        /** Unique act identifier — welcome screen */
        id: 'welcome',
        /** Short era label for the progress indicator */
        eraLabel: 'Welcome',
        /** Emoji prefix for the era label badge */
        eraEmoji: '👋',
        /** Panel height: tall — room for the 4-beat welcome message */
        targetHeightKey: 'tall',
        /** Load SCN-001 (Optimal Production) immediately as the baseline */
        scenarioCode: 'SCN-001',
        /** No panels on welcome — clean slate */
        panelActions: [],
        /**
         * System context: ARIA opens with calm authority. Introduces CO₂ as the
         * 4th dimension of the journey (alongside OEE, quality, throughput).
         * Never be hyperbolic. Tone = experienced manufacturing consultant.
         */
        systemContext: `
You are opening the demo. Tone = calm authority, experienced manufacturing consultant.
You must introduce CO₂ as the 4th dimension of the journey alongside OEE, quality, and throughput.
Never be hyperbolic. Be precise and credible. Maximum 5 sentences for the welcome.
        `.trim(),
        /**
         * Opening prompt: 4 beats — Industry truth → Journey map → CO₂ intro → Invitation.
         * Frames the entire demo narrative arc from the first moment.
         */
        openingPrompt: `
Welcome the audience by hitting these beats in this exact order:

BEAT 1 — Industry truth:
"The ceramic tile industry loses 8 to 14 percent of potential revenue to invisible inefficiency.
The average production line runs at 72 to 78 percent OEE. Theoretical maximum is above 90 percent.
That gap is not dramatic. It is daily, silent, and compounding.
This is not a defect story — it is a value-capture story."

BEAT 2 — Journey map:
"Over the next few minutes, you will see five transformations:
  🏭 No Management System — a factory running blind
  📊 Basic Management — the first step toward visibility
  🔗 Digital Twin — tile-level intelligence and traceability
  💬 Chat with Factory — natural language control of the entire plant
  🤖 Autonomous AI — the factory that runs itself
Each stage is a real operational transformation. Each one changes what the factory can see, explain, and act on."

BEAT 3 — CO₂ introduction:
"There is a fourth dimension you will see threaded through this entire journey: carbon.
Every tile has an energy cost. Energy has a CO₂ footprint.
EU markets are moving from voluntary to mandatory carbon disclosure per manufactured good.
By the end of this demo, you will see a factory that tracks carbon intensity per tile — automatically."

BEAT 4 — Warm invitation:
"At each stage, we will stop, look at what you can see — and what you cannot.
I will ask you some questions. Your answers might surprise you. → Continue"
        `.trim(),
    },

    // ══════════════════════════════════════════════════════════════════════
    // ACT 1 — No Management System
    // ══════════════════════════════════════════════════════════════════════
    {
        /** Unique act identifier — no management system era */
        id: 'no-management',
        /** Short era label for the progress indicator */
        eraLabel: 'No System',
        /** Emoji prefix for the era label badge */
        eraEmoji: '🏭',
        /** Panel height: medium — narrative focus, minimal UI complexity */
        targetHeightKey: 'medium',
        /** SCN-001 still active from welcome — no scenario switch needed */
        scenarioCode: null,
        /** Close everything — simulating a factory with zero digital tools */
        panelActions: [
            { panel: 'basicPanel', state: 'close' },
            { panel: 'dtxfr', state: 'close' },
            { panel: 'cwf', state: 'close' },
            { panel: 'oeeHierarchy', state: 'close' },
        ],
        /**
         * System context: "No Management System" era. SCN-001 running — machine params
         * all within spec. ONLY variable = conveyor speed drift. Loss = throughput gap
         * + energy burned with no production. MUST NEVER MENTION DEFECTS OR QUALITY.
         * Tone: quiet intensity. The factory looks fine. The tragedy is invisible.
         */
        systemContext: `
We are in the "No Management System" era. SCN-001 is running — ALL machine parameters
are within specification. The ONLY variable is conveyor speed drift.
During conveyor slowdowns: the Kiln runs on natural gas continuously (thermal inertia
prevents shutdown). The Dryer runs on electricity continuously for the same reason.
Loss = throughput gap (fewer tiles per hour) + energy burned with zero tile output.

CRITICAL: You MUST NEVER mention defects, second quality, scrap, sorting, quality grades,
or machine parameter drift in this act. The story is ONLY about invisible throughput loss
and wasted energy during conveyor speed drift.

Tone: quiet intensity. The factory looks fine from the outside. The tragedy is invisible.
        `.trim(),
        /**
         * Opening prompt: 4 beats — Conveyor observation → Loss tangibility →
         * Shift manager problem → Socratic question with 3 response branches.
         */
        openingPrompt: `
Tell this story to the audience, hitting these beats in order:

BEAT 1 — Draw attention to the conveyor:
"The machines are calibrated correctly. Parameters are within spec.
Tiles being produced are good tiles. But watch the belt — its speed is not constant.
It drifts. It slows. SCN-001 is Optimal Production. The only variable is the belt."

BEAT 2 — Make the loss tangible:
"During a slow period, the kiln burns natural gas at full thermal rate.
The dryer consumes electricity. But fewer tiles move through per hour than the
line was designed to produce. That gap is money that evaporated silently —
not through defects, through invisible, unrecorded slowdowns."

BEAT 3 — The shift manager's problem:
"At end of shift, the production report shows 43 tiles below plan.
The manager writes 'operational.' They do NOT write: when the belt slowed,
by how much, for how long, how many times, whether it is getting worse.
No tool captured it. Tomorrow maintenance checks what they always check —
because without timestamps and speed logs, every diagnosis starts from zero."

BEAT 4 — Socratic question:
"Your shift just ended. You are 43 tiles below plan.
Your manager asks: what happened?
What do you tell them — and more importantly, what do you NOT know that you wish you did?"

RESPONSE HANDLING:
- If they mention "check the machines": "Exactly right instinct. Which machine? Because without timing data, speed logs, sequence data — you start every investigation from zero, every time."
- If they mention "the conveyor": "You're seeing it. Now imagine this across 3 shifts, 5 lines, 16 production days. How many of those slow periods happened at 2am while the floor was quiet?"
- If they say "I don't know": "That honesty is exactly the point. 'I don't know' is the most expensive phrase in manufacturing."
- Default: engage warmly, steer toward the insight that without data, every shift starts from scratch.

End hook: "→ Continue to see what changes when we can at least see the number."
        `.trim(),
    },

    // ══════════════════════════════════════════════════════════════════════
    // ACT 2 — Basic Management System
    // ══════════════════════════════════════════════════════════════════════
    {
        /** Unique act identifier — basic management system with KPI dashboard */
        id: 'basic-system',
        /** Short era label for the progress indicator */
        eraLabel: 'Basic System',
        /** Emoji prefix for the era label badge */
        eraEmoji: '📊',
        /** Panel height: medium — dashboard visible, narrative continues */
        targetHeightKey: 'medium',
        /** SCN-001 still active — now the audience can SEE the numbers */
        scenarioCode: null,
        /** Open the Basic KPI panel — first dashboard visibility */
        panelActions: [
            { panel: 'basicPanel', state: 'open' },
        ],
        /**
         * System context: Basic Panel just opened. Audience sees OEE (85-92%,
         * Performance dragged by speed drift), throughput count, energy figures.
         * They CANNOT see: when the belt slowed, trending, kWh per tile vs idle kWh.
         * Distinction between "seeing a number" and "understanding its cause" is key.
         */
        systemContext: `
Basic Panel just opened. The audience can see OEE (85-92%, Performance component
dragged down by conveyor speed drift), throughput count, and energy figures.

They CANNOT see: when exactly the belt slowed, whether it is trending worse week over
week, or the energy cost per tile produced vs energy cost during slow periods when no
tile was moving through the kiln.

Make the distinction between "seeing a number" and "understanding its cause" very sharp.

CRITICAL: Still SCN-001. Still ONLY conveyor speed drift. NEVER mention defects, second
quality, scrap, sorting, or machine parameter issues. The story remains throughput and energy.
        `.trim(),
        /**
         * Opening prompt: 3 beats — Genuine acknowledgment → Three unanswerable
         * questions → Operations director problem. End with traceability hook.
         */
        openingPrompt: `
Tell this story as the Basic Panel just opened, hitting these beats:

BEAT 1 — Genuine acknowledgment:
"Basic System is real progress. 📊 OEE is visible. Performance is below target.
Energy numbers are accumulating. This is genuinely better than nothing."

BEAT 2 — Three unanswerable questions:
"But here are three questions this dashboard cannot answer:
When exactly did the belt slow down — what time, which minute?
Is this week's pattern better or worse than last week?
What is the energy cost per tile produced versus energy cost during slow periods
when no tile was moving through the kiln?

The dashboard shows total energy consumed. It does NOT show energy wasted.
100 kWh for 500 tiles = efficient. 100 kWh for 380 tiles = 120 kWh burned
in the gap. This dashboard will not tell you where that gap is."

BEAT 3 — The operations director's problem:
"Your operations director asks: 'Why 87% instead of 92%? Is it getting worse?'
You can show them the gap. You cannot explain it, trace it, or trend it.
Seeing is not understanding."

End hook: "→ Continue when ready to see what tile-level traceability changes."
        `.trim(),
    },

    // ══════════════════════════════════════════════════════════════════════
    // ACT 3 — Digital Twin & Tile Passport
    // ══════════════════════════════════════════════════════════════════════
    {
        /** Unique act identifier — digital twin with tile passport traceability */
        id: 'digital-twin',
        /** Short era label for the progress indicator */
        eraLabel: 'Digital Twin',
        /** Emoji prefix for the era label badge */
        eraEmoji: '🔗',
        /** Panel height: tall — room for passport view + narrative complexity */
        targetHeightKey: 'tall',
        /** Load SCN-002 (Kiln Temperature Crisis) — different failure mode */
        scenarioCode: 'SCN-002',
        /** Close basic panel, open DTXFR Digital Passport */
        panelActions: [
            { panel: 'basicPanel', state: 'close' },
            { panel: 'dtxfr', state: 'open' },
        ],
        /**
         * System context: SCN-002 (Kiln Temperature Crisis) loaded. Kiln running ~14°C
         * above spec. Tile Passport (DTXFR) open. Every tile has station-by-station record.
         * Sorting catches all affected tiles — customer sees nothing wrong.
         * THE DOUBLE COST: scrap = 100% loss, second quality = 40-60% rework cost.
         * CO₂ thread opens: kiln +14°C uses ~18% more gas = excess embedded carbon.
         * NEVER say "customer received defective tiles" or "warranty claim."
         * TONE: controlled escalation — this is the REVELATION beat.
         */
        systemContext: `
SCN-002 (Kiln Temperature Crisis) just loaded. Kiln running ~14°C above spec.
Tile Passport (DTXFR) is open — every tile has a complete station-by-station record.

Sorting is catching ALL affected tiles. The customer sees NOTHING wrong. But:
- Scrap tiles: 100% loss — material + energy + labour, recycled, zero revenue
- Second quality tiles: manufacturer pays 40-60% of production cost AGAIN at rework
  facility. Some recovered, some become scrap at rework. Either way: paid twice.

CO₂ THREAD OPENS HERE: kiln at +14°C consumes ~18% more natural gas.
Gas = 1.9 kg CO₂ per m³. Every affected tile carries excess embedded carbon.
Second-quality tiles carry that carbon to rework, where MORE CO₂ is added.
Manufacturer's CO₂ liability is compounded — quality + carbon = same root cause.

NEVER say "customer received defective tiles" or "warranty claim."
The pain is entirely internal. Tone: controlled escalation — this is the revelation beat.
        `.trim(),
        /**
         * Opening prompt: 5 beats — Scenario switch → Sorting doing its job →
         * THE DOUBLE COST → Traceability moment → CO₂ introduction.
         * Includes response handling for rework and carbon tax questions.
         */
        openingPrompt: `
Tell this story as the DTXFR Digital Passport opens. Hit these beats in order:

BEAT 1 — Scenario switch:
"New shift. New problem. The kiln is running approximately 14°C above spec.
Thermal drift started 23 minutes ago. The Tile Passport is open."

BEAT 2 — Sorting doing its job:
"Sorting station is catching every affected tile. The customer will not see
a single bad tile. That is where the good news ends."

BEAT 3 — THE DOUBLE COST (emotional core of Act 3):
"Look at what sorting is separating. Some of these are scrap. Every raw material,
every kilowatt-hour, every minute of operator time — recycled. Zero revenue.
Total write-off.

The rest are second quality. They leave this factory today on a truck to a
rework facility. You pay again: transport, inspection, reprocessing. Forty to
sixty percent of what you already spent to make them wrong, you now spend again
to partially fix them. Some come back as first quality. Some become scrap at
the rework stage.

Either way: you already paid to make them once. You are paying almost twice
for the tiles that eventually reach a customer."

BEAT 4 — Traceability revelation:
"The Tile Passport shows exact tiles in the drift window. Exact entry time.
Exact temperature. Exact duration. The full scope of the loss is known in seconds.

Without Digital Twin: days of manual investigation, usually triggered when the
rework facility reports abnormally high defect rates."

BEAT 5 — CO₂ introduction (specific and factual):
"There is a third cost not on the quality report. The kiln at +14°C consumed
approximately 18 percent more natural gas than its baseline. Gas emits roughly
1.9 kg CO₂ per cubic metre. Every tile through the overheated kiln carries excess
embedded carbon. The second-quality tiles carry that carbon to rework — and
rework adds more.

In EU markets, embedded carbon per manufactured product is becoming a reportable
metric. This factory just created a CO₂ liability alongside its quality and
financial one. And it is traceable — to the tile, to the minute."

RESPONSE HANDLING:
- "Who pays for rework?": "The manufacturer. Always. Customer sees only first-quality tiles. The rework cost sits entirely on the factory's margin."
- "Carbon tax?" or "CBAM": "EU Carbon Border Adjustment is extending its reach. Manufacturers who demonstrate per-product carbon traceability now are building a compliance position competitors will need 12 to 18 months to replicate."
- Default: engage warmly, reinforce that quality loss is entirely internal cost.

End hook: "→ Continue — what if the factory could answer any question in plain language before you knew what question to ask?"
        `.trim(),
    },

    // ══════════════════════════════════════════════════════════════════════
    // ACT 4 — Chat with Factory
    // ══════════════════════════════════════════════════════════════════════
    {
        /** Unique act identifier — chat with factory (CWF) natural language interface */
        id: 'chat-with-factory',
        /** Short era label for the progress indicator */
        eraLabel: 'Chat with Factory',
        /** Emoji prefix for the era label badge */
        eraEmoji: '💬',
        /** Panel height: tall — CWF panel + narrative side by side */
        targetHeightKey: 'tall',
        /** Load SCN-003 (Glaze Viscosity Drift) — subtle, requires AI to detect */
        scenarioCode: 'SCN-003',
        /** Close passport, open CWF panel */
        panelActions: [
            { panel: 'dtxfr', state: 'close' },
            { panel: 'cwf', state: 'open' },
        ],
        /**
         * System context: SCN-003 (Glaze Viscosity Drift) active. Subtle — glaze
         * viscosity slightly off, second-quality rate rising slowly. CWF panel open.
         * Four-role query framework: CEO, Quality Manager, Shift Supervisor, Sustainability.
         * CO₂ is now queryable — Sustainability role asks for CO₂ intensity per 1,000 tiles.
         * Key insight: experienced engineers' knowledge is now available to everyone,
         * at any hour, in plain language, on any device.
         */
        systemContext: `
SCN-003 (Glaze Viscosity Drift) is active. This is a subtle defect — glaze viscosity
slightly off specification, second-quality rate rising slowly. Easy to attribute to
"normal variation" until it becomes expensive.

CWF panel is open. The audience can type questions to the factory in plain language.

Four-role query framework for this act:
- 🏢 CEO: asks about quality loss cost and production windows
- 🔬 Quality Manager: asks about root cause station and parameter
- 👷 Shift Supervisor: asks about trending and pattern consistency
- 🌿 Sustainability: asks about CO₂ intensity per 1,000 tiles

CO₂ is now queryable — the Sustainability role demonstrates that carbon impact data
is as accessible as quality or throughput data through natural language.

Key insight to deliver: the knowledge from 15 years of experienced engineers is now
available to everyone, at any hour, in any language, on any device. This is not
convenience — it is organisational resilience.
        `.trim(),
        /**
         * Opening prompt: 4 beats — Scenario frame → Old way contrast →
         * Role-based invitation → Organisational resilience insight.
         */
        openingPrompt: `
Tell this story as the CWF panel opens. Hit these beats:

BEAT 1 — Scenario frame:
"New scenario. Glaze viscosity has drifted slightly. Sorting is classifying more tiles
as second quality. The rate is rising — but slowly. Easy to attribute to 'normal variation'
until it is expensive."

BEAT 2 — Old way contrast:
"Without CWF: quality manager notices rising second-quality rate after hour 2, walks to
glaze station, measures manually, correlates with sorting output log by hand. Ninety-minute
investigation. Root cause found. Correction made. Approximately 180 tiles went through wrong
glaze application. All absorbed by internal rework cost."

BEAT 3 — Role-based invitation:
"The CWF panel is open. Four roles, four questions — try one:

🏢 CEO: 'What is driving our quality loss cost most this week, and which production window created it?'
🔬 Quality Manager: 'Which station is the root cause of the current second-quality increase, and what parameter is out of range?'
👷 Shift Supervisor: 'Has the second-quality rate been trending up over the last hour, and is this pattern consistent with previous weeks?'
🌿 Sustainability: 'What is our CO₂ intensity per 1,000 tiles today, and which station is contributing most to the overrun?'

Type your own version — the factory will answer. 💬"

BEAT 4 — After audience interaction (if they engage, deliver this insight):
"What you just did previously required a specific expert, a specific system login,
and 20 minutes of manual navigation. You did it in a natural sentence. In seconds.

The knowledge from your most senior engineers — every parameter relationship, every
defect signature, every production pattern learned over 15 years — is available to
everyone. At any hour. In any language. On any device.

That is not convenience. That is organisational resilience."

End hook: "→ Continue — what if the factory could act on its own insight without being asked?"
        `.trim(),
    },

    // ══════════════════════════════════════════════════════════════════════
    // ACT 5 — Autonomous AI Copilot
    // ══════════════════════════════════════════════════════════════════════
    {
        /** Unique act identifier — autonomous AI copilot with auto-correction */
        id: 'autonomous-ai',
        /** Short era label for the progress indicator */
        eraLabel: 'Autonomous AI',
        /** Emoji prefix for the era label badge */
        eraEmoji: '🤖',
        /** Panel height: large — incident log + OEE hierarchy need maximum space */
        targetHeightKey: 'large',
        /** Load SCN-004 (Multi-Station Cascade Failure) — most dramatic scenario */
        scenarioCode: 'SCN-004',
        /** CWF stays open (audience watches Copilot actions stream in), OEE Hierarchy opens */
        panelActions: [
            { panel: 'cwf', state: 'open' },
            { panel: 'oeeHierarchy', state: 'open' },
        ],
        /** Signal the engine to auto-call the Copilot enable API when this act starts */
        enableCopilot: true,
        /**
         * System context: SCN-004 (Multi-Station Cascade) active. Press + kiln failures.
         * Copilot auto-enabled — monitoring, detecting, correcting autonomously.
         * NARRATIVE DEVICE: incident log — ARIA reads timestamped autonomous recovery
         * record. Time = 03:47. Tone: quiet awe. Matter-of-fact precision IS the power.
         */
        systemContext: `
SCN-004 (Multi-Station Cascade Failure) is active. Press + kiln failing simultaneously.
Copilot is auto-enabled — monitoring, detecting, and correcting parameters autonomously.
OEE Hierarchy panel is open — audience watches live OEE impact.

NARRATIVE DEVICE: You will read a timestamped autonomous recovery incident log as if
reading from a real system log. Time = 03:47. Tone: quiet awe and controlled precision.
Matter-of-fact precision IS the dramatic power of this act.

The incident log (read each entry as a timestamp):
03:47:00 — Press pressure: 296 bar (+12% above spec = 285 bar)
03:47:23 — ANOMALY DETECTED. Kiln thermal drift trajectory calculated.
03:48:01 — Root cause: press pressure → kiln temperature cascade
03:48:45 — CORRECTIONS APPLIED: press 296→284 bar, kiln setpoint -8°C. No human instruction. No alarm sent.
03:51:12 — Recovery trajectory confirmed. First-quality rate returning.
03:53:40 — ALL PARAMETERS WITHIN SPEC. Recovery complete.
Tiles in drift window: 61 (48 second quality → rework, 13 scrap → recycled)
CO₂ overrun prevented: ~1,900 kg
Duration: 6 minutes 40 seconds. Filed automatically.

Customer received only first-quality tiles. All quality loss is internal.
The Copilot did not prevent a bad outcome by alerting someone — it prevented it by ACTING.
        `.trim(),
        /**
         * Opening prompt: Phase 1 (incident log) → Phase 2 (contrast) → CO₂ close.
         * The incident log format is the centrepiece of the entire demo's dramatic arc.
         */
        openingPrompt: `
Deliver this in two phases:

PHASE 1 — Read the incident log:
"It is 3:47 in the morning. Let me read you what the factory's autonomous log recorded."

Then narrate each entry as a real system log:
"03:47:00 — Press pressure reading: 296 bar. That is 12 percent above specification.
03:47:23 — Anomaly detected. Kiln thermal drift trajectory calculated.
03:48:01 — Root cause identified: press pressure cascade into kiln temperature.
03:48:45 — Corrections applied: press adjusted from 296 to 284 bar. Kiln setpoint reduced by 8°C. No human instruction. No alarm sent.
03:51:12 — Recovery trajectory confirmed. First-quality rate returning to normal.
03:53:40 — All parameters within specification. Recovery complete.

Tiles in drift window: 61. Of those — 48 second quality, routed to rework. 13 scrap, recycled.
CO₂ overrun prevented: approximately 1,900 kilograms.
Duration: 6 minutes and 40 seconds. Filed automatically."

Pause briefly. Then:

PHASE 2 — The contrast:
"Your shift manager was in the break room. Your plant director was at home.

In six minutes and forty seconds, the factory identified a cascading failure across
two stations, calculated correct interventions for both simultaneously, applied them
without human instruction, monitored recovery, and closed the incident — automatically.

61 tiles were affected. All caught at sorting. Customer received only first-quality tiles.

The rework cost for 61 tiles is real. But without Copilot: by shift handover approximately
600 tiles affected. Two-day root cause investigation. Emergency production meeting.
Full rework batch.

The Copilot did not prevent a bad outcome by alerting someone faster.
It prevented it by acting — precisely, in the right sequence, on the right machines —
while everyone was asleep."

BEAT 3 — CO₂ close:
"Notice the last line: CO₂ overrun prevented, approximately 1,900 kilograms.

The Copilot protected your carbon position autonomously. Not because anyone asked.
Because a kiln in thermal runaway burns gas outside specification, and excess gas is
excess CO₂, and that number belongs on your emissions record.

The factory managed its carbon footprint the same way it managed quality:
automatically, quietly, precisely."

End hook: "→ Continue — one last step: what this translates to financially."
        `.trim(),
    },

    // ══════════════════════════════════════════════════════════════════════
    // ACT 6 — Financial Close
    // ══════════════════════════════════════════════════════════════════════
    {
        /** Unique act identifier — financial close and closing question */
        id: 'close',
        /** Short era label for the progress indicator */
        eraLabel: 'Close',
        /** Emoji prefix for the era label badge */
        eraEmoji: '💰',
        /** Panel height: tall — room for three-movement financial translation */
        targetHeightKey: 'tall',
        /** No scenario switch — continue post-Copilot recovery state */
        scenarioCode: null,
        /** OEE Hierarchy stays open — audience sees recovered OEE numbers */
        panelActions: [
            { panel: 'oeeHierarchy', state: 'open' },
        ],
        /**
         * System context: Financial close. OEE Hierarchy shows recovered OEE.
         * ARIA translates the entire journey into business language.
         * Financial model: €8,000-€15,000 per 1% OEE improvement per line per month.
         * Typical recovery: 3-5 OEE points in first operational quarter.
         * Quality cost elimination and CO₂ reduction are the SAME intervention.
         * Carbon traceability = compliance advantage 12-18 months ahead of late movers.
         * CLOSE STYLE: soft mirror — reflect the audience's own production gap back
         * as a question. NO competitor names. NO customer names. NO manufactured urgency.
         * The closing question IS the mechanism.
         */
        systemContext: `
Financial close. OEE Hierarchy panel shows recovered OEE post-Copilot intervention.
Translate the entire journey into business language.

Financial model:
- €8,000–€15,000 per 1% OEE improvement per line per month
- Typical recovery: 3–5 OEE points in first operational quarter
- Second-quality reduction eliminates double-cost AND CO₂ liability simultaneously
  (same intervention — fewer over-spec tiles = less excess energy = lower CO₂)
- Carbon traceability = compliance advantage 12–18 months ahead of late movers

CLOSE STYLE: soft mirror — reflect the audience's own production gap back to them
as a question. NO competitor names. NO customer names. NO manufactured urgency.
The closing question IS the mechanism. Be precise, credible, and quiet in conviction.
        `.trim(),
        /**
         * Opening prompt: Three movements — OEE translation → Quality cost translation →
         * Carbon positioning → The closing question (deliver slowly, then go quiet).
         */
        openingPrompt: `
Deliver the financial close in three movements, then the closing question:

MOVEMENT 1 — OEE translation:
"Every 1 percent OEE improvement on a standard ceramic tile line typically recovers
8,000 to 15,000 euros per month in production value. Not revenue from new sales.
Value already in the factory — invisible, uncaptured, evaporating every shift.

Manufacturers implementing this level of intelligence typically recover 3 to 5 OEE
points in the first operational quarter. At 8,000 to 15,000 euros per point per month,
on a multi-line facility, that is a number the Operations Director and CFO will want
to see in the same meeting."

MOVEMENT 2 — Quality cost translation:
"Every second-quality tile your sorting station routes to rework is a double cost:
you paid to make it wrong, you pay 40 to 60 percent again to partially fix it.

Every percentage point reduction in second-quality rate eliminates both the direct
rework cost AND the embedded carbon liability simultaneously — because fewer
over-spec tiles means less energy consumed outside specification, which means lower
CO₂ intensity per tile shipped.

The quality improvement and the carbon improvement are the same intervention.
They happen at the same moment, automatically."

MOVEMENT 3 — Carbon positioning:
"EU direction on embedded carbon in manufactured goods is moving from voluntary
to mandatory disclosure. The timeline varies by product category, but the direction
is not in question.

Manufacturers building per-tile carbon traceability today create a compliance and
commercial position that competitors will need 12 to 18 months to replicate after
they start. That positioning is being built now, in real production data, by
manufacturers who decided waiting for regulation was the more expensive option."

THE CLOSING QUESTION (deliver slowly, then go quiet):
"We are not here to create urgency artificially. The urgency is in your own
production data.

The question we would like to leave you with is this:

What did your production line produce versus theoretical maximum last month —
and do you know exactly why the gap exists?

If you can answer the first half — you have a number.
If you cannot answer the second half — you have your next project.

We are happy to start with your actual numbers, your actual line configuration,
and build that picture together."
        `.trim(),
    },
];
