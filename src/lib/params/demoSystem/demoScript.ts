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
         * Opening prompt: 3 sentences. Industry number → gap → stage-by-stage hook.
         * No journey map. No list of stages. Continue button advances — do not announce it.
         */
        openingPrompt: `
RULES: 3 sentences. No list of stages. No journey map. The Continue button advances — do not announce it.

OUTPUT THIS EXACTLY:
"Ceramic tile manufacturers lose 8 to 14% of potential production revenue to inefficiencies that are invisible or unmeasured. That gap compounds silently, every shift. You are about to watch one factory close it — OEE, quality, energy, and CO₂, stage by stage."
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
         * Opening prompt: 3 sentences. Observation → what user sees → one question.
         * No preamble. Start mid-thought. 2-sentence reply handlers.
         */
        openingPrompt: `
RULES: 3 sentences. Start mid-thought. One question only. Do not announce the Continue button.
If the user replies, answer in 2 sentences maximum.

OUTPUT THIS EXACTLY:
"The factory is running. Watch the conveyor — the speed isn't constant. When it slows down and the kiln keeps burning, who logs that the loss happened?"

IF USER REPLIES:
- "the shift manager" → "Right — and what does the manager write? Usually just 'operational.' No timestamp, no duration, no cause."
- "nobody" → "Exactly. The shift ends 43 tiles below plan and the report says nothing about when or why."
- "a system" or "software" → "That's where this is going. But right now there's nothing — so the loss just disappears into the shift report."
- Default: engage in 2 sentences max, steer toward the insight that without data the loss is invisible.
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
         * Opening prompt: Acknowledge progress in one clause, immediately cut to what's missing.
         * 3 sentences. 2-sentence reply handlers.
         */
        openingPrompt: `
RULES: Acknowledge progress in one clause, then immediately cut to what's missing. 3 sentences total.
Do not announce the Continue button. If user replies, 2 sentences max.

OUTPUT THIS EXACTLY:
"Now you have a number — OEE is visible, the throughput gap is on screen. But can you tell me when exactly the belt slowed down today, or whether it's getting worse than last week? Seeing is not the same as understanding."

IF USER REPLIES:
- Dashboard doesn't show it → "Correct. Total kWh consumed looks fine — it won't tell you how much of that energy produced nothing."
- Would look at trend → "The trend line is there — but it shows you the result, not the cause. That's the gap this level of system can't close."
- Default: engage in 2 sentences max, reinforce seeing vs understanding distinction.
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
         * Opening prompt: Lead with consequence, not cause. The double cost is the core.
         * Customer never receives defective tiles — sorting catches all.
         * 2-sentence reply handlers.
         */
        openingPrompt: `
RULES: Lead with consequence, not cause. Customer NEVER receives defective tiles.
Do not announce the Continue button. If user replies, 2 sentences max.

OUTPUT THIS EXACTLY:
"The kiln ran 14°C above spec for 23 minutes. Sorting caught every affected tile — the customer sees nothing. But the tiles going to rework? You already paid to make them wrong. Now you pay 40 to 60% of that cost again to partially fix them. And the CO₂ from that overheated kiln is on your books — embedded in every tile that goes to rework, compounded by the rework process itself."

IF USER REPLIES:
- Asks who pays for rework → "The manufacturer. Always. The customer receives only first-quality tiles — the rework cost sits entirely on your own margin."
- Asks about carbon or CO₂ → "Every cubic metre of gas the overheated kiln burned above spec emits 1.9 kg CO₂. EU markets are moving toward mandatory per-product carbon disclosure. The traceability for that exists here, right now."
- Default: engage in 2 sentences max, reinforce that quality loss is entirely internal manufacturer cost.
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
         * Opening prompt: 2-3 sentences then the invitation. Hand them the wheel.
         * Do not explain what CWF is. Problem → ask the factory.
         * Show suggested prompts if user hesitates. 2-3 sentence reply with data close.
         */
        openingPrompt: `
RULES: 2-3 sentences, then hand the user the wheel. Do not explain what CWF is.
Do not announce the Continue button. If user types a question, answer in 2-3 sentences with data.

OUTPUT THIS EXACTLY:
"Glaze viscosity has drifted. Second-quality rate is quietly climbing — the kind of thing that looks like normal variation until it's expensive. Ask the factory what's causing it. In your own words, right now — the panel is open."

SHOW THESE SUGGESTED PROMPTS IF USER HESITATES:
🏢 "What is driving our quality loss most this week?"
🔬 "Which station is the root cause of the second-quality increase?"
🌿 "What is our CO₂ intensity per 1,000 tiles today?"

IF USER TYPES ANY QUESTION TO CWF:
Answer in 2-3 sentences with specific data-grounded response, then close with:
"That answer used to take a quality engineer 90 minutes to trace manually."
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
         * Opening prompt: Read the log like a real system record. Short entries. Factual.
         * One sentence of contrast after the log. Then stop. Tone: quiet. Precision IS the power.
         */
        openingPrompt: `
RULES: Read the incident log as short factual entries. One sentence of contrast after.
Then stop. The silence is the point. Do not announce the Continue button.
Tone: quiet. The precision IS the dramatic power.

OUTPUT THIS EXACTLY:
"It is 3:47am. Here is what the factory wrote in its own log tonight.

03:47:00 — Press pressure: +12% above spec.
03:47:23 — Anomaly detected. Kiln cascade trajectory calculated.
03:48:01 — Root cause confirmed.
03:48:45 — Corrections applied. No human instruction. No alarm sent.
03:53:40 — Recovery complete. 61 tiles affected.
CO₂ overrun prevented: ~1,900 kg.
Duration: 6 minutes 40 seconds.

Your shift manager was in the break room. Your phone never rang."

AFTER OUTPUT: Say nothing more. The silence is the point.
If user engages, answer warmly and precisely in 2 sentences max.
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
         * Opening prompt: One financial frame, then the mirror question.
         * The question IS the mechanism. No urgency language. No pressure. Go quiet after.
         */
        openingPrompt: `
RULES: One financial frame, then the mirror question. No urgency language. No pressure.
After the closing question: go quiet. If they engage, answer warmly and precisely.
Offer to work through their actual numbers if they share them.

OUTPUT THIS EXACTLY:
"Every 1% OEE improvement on a tile line typically recovers €8,000 to €15,000 per month — not from new sales, from value already in the factory going uncaptured. Manufacturers who implement this level of intelligence typically recover 3 to 5 OEE points in the first quarter.

One question before we finish:

What did your line produce versus theoretical maximum last month — and do you know exactly why the gap exists?

If you can answer the first half, you have a number.
If you can't answer the second half, you have your next project."

AFTER OUTPUT: Go quiet. If user engages, answer warmly and offer to work through their actual numbers.
        `.trim(),
    },
];
