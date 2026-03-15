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

// ─── Media Instruction Type ────────────────────────────────────────────────

/**
 * MediaInstruction — identifies a dynamic visualisation to render in DemoMediaView
 * instead of a static slide image for a given CtaStep.
 *
 * Each value maps to a dedicated React component inside
 * `src/components/demo/media/DemoMediaInstructionRenderer.tsx`.
 *
 * Adding a new visualisation:
 *   1. Add a new string literal to this union.
 *   2. Implement the component in DemoMediaInstructionRenderer.
 *   3. Reference it in the ctaSteps[] of the relevant act.
 *
 * Current values:
 *   'chart:conveyor_speed' — SVG line chart of S-Clock vs conveyor belt speed.
 *                            Reads directly from the local conveyorStateRecords
 *                            ring-buffer in simulationDataStore — no API call.
 */
export type MediaInstruction = 'chart:conveyor_speed';

// ─── CTA Step ────────────────────────────────────────────────────────────────

/**
 * CtaStep — describes every action triggered by a single CTA button click.
 *
 * Each DemoAct has an ordered ctaSteps[] array. Click N executes ctaSteps[N-1].
 * Only fields relevant to the click need to be set — all are optional.
 *
 * Field execution order (inside handleCtaClick):
 *   1. panelActions      — immediately toggle panels (open/close)
 *   2. scenarioCode      — load scenario into simulationDataStore
 *   3. simulationReset   — reset simulation to fresh state
 *   4. slideImageUrl     — show static slide on the demo screen surface,
 *                          OR replaced by mediaInstruction when that is set
 *   4b. mediaInstruction — show a dynamic chart/viz (overrides slideImageUrl)
 *   5. delayMs           — wait this many ms, then show screenText
 *   6. screenText        — display plain text on the demo screen surface
 *   7. ariaLocal         — inject a scripted ARIA bubble (no API call)
 *   8. ariaApi           — send prompt to CWF, ARIA generates a dynamic reply
 *   9. transitionTo      — navigate to next/named act ('next' | act-id | null)
 *
 * ctaLabel controls the button label during this step (defaults to 'Next ›').
 */
export interface CtaStep {
    /** Label shown on the CTA button during this step */
    ctaLabel?: string;
    /** Slide image URL shown on the demo screen (root-relative, e.g. '/demo/ACT-0.png').
     * Ignored when mediaInstruction is also set — the chart takes priority. */
    slideImageUrl?: string;
    /**
     * Dynamic visualisation to render in the media area instead of a static slide.
     * When set, DemoMediaView renders the appropriate chart/viz component using
     * live simulation data from the local store — no API or image file needed.
     * Overrides slideImageUrl for this step.
     */
    mediaInstruction?: MediaInstruction;
    /** Scenario code to load — null or omit to keep current scenario */
    scenarioCode?: string | null;
    /** Milliseconds to wait before displaying screenText */
    delayMs?: number;
    /** Plain text rendered as an overlay on the demo screen surface (not ARIA chat) */
    screenText?: string;
    /** Scripted ARIA chat bubble injected locally — no CWF API call, instant */
    ariaLocal?: string;
    /** Prompt sent to CWF — ARIA generates a dynamic reply via the API */
    ariaApi?: string;
    /** Whether the ARIA chat input is enabled for this step (default: true) */
    ariaInputEnabled?: boolean;
    /** Panel open/close instructions applied immediately on this click */
    panelActions?: PanelAction[];
    /**
     * simulationAction — controls the simulation engine on this click.
     *   'start'       : start the sim (calls toggleDataFlow() if not already running)
     *   'stop'        : stop the sim immediately (calls stopDataFlow())
     *   'reset'       : reset all simulation state (clocks, counters, tiles)
     *   'reset-start' : reset then immediately start (most common for demo opening)
     * Omit / undefined to leave the simulation state unchanged.
     */
    simulationAction?: 'start' | 'stop' | 'reset' | 'reset-start';
    /** Where to navigate after this step: 'next' = next act, an act id = jump, null/'' = stay */
    transitionTo?: 'next' | string | null;
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
     * CtaStep — describes everything that happens on a single CTA button click.
     *
     * Each act has an ordered ctaSteps array. Click N → executes ctaSteps[N-1].
     * After the last step the next click has no further steps to execute
     * (a step with transitionTo:'next' is the idiomatic final step).
     */

    /**
     * ctaSteps — ordered list of rich step definitions for the CTA button.
     *
     * Replaces the old ctaSlides: string[] with a fully declarative model:
     *   Click 1 → executes ctaSteps[0], Click 2 → ctaSteps[1], …
     *
     * Leave undefined (or empty) for acts that have no CTA-driven slides.
     */
    ctaSteps?: CtaStep[];

    /**
     * Optional label shown next to the LED indicator in DemoSidePanel.
     * Only set for the 5 narrative acts (1–5). Acts without this field
     * (Welcome, Close) are excluded from the sidebar LED list.
     *
     * Keep to 2–4 words for the sidebar width.
     */
    sidebarLabel?: string;

    /**
     * Optional italic sub-label shown below sidebarLabel in DemoSidePanel.
     * Used to add a short technology tag (e.g. "Digital Twin", "CWF", "Auto Pilot").
     * Leave as undefined if no sub-label is needed.
     */
    sidebarSubLabel?: string;

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

    /** The opening prompt auto-sent to CWF when the act begins.
     * Leave empty string or omit to keep ARIA silent for this act.
     */
    openingPrompt?: string;
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
                                                                                                                                                                                                                                                                                                                                                                                                                        ctaSteps: [
            { // Click #1
                ctaLabel: 'Start',
                slideImageUrl: '/demo/Welcome.png',
                scenarioCode: 'SCN-001',
                delayMs: 3000,
                screenText: 'Let\'s start',
                ariaInputEnabled: true,
                panelActions: [
                    { panel: 'basicPanel', state: 'close' },
                    { panel: 'dtxfr', state: 'close' },
                    { panel: 'cwf', state: 'close' },
                    { panel: 'oeeHierarchy', state: 'close' },
                    { panel: 'controlPanel', state: 'close' },
                ],
                simulationAction: 'reset',
                transitionTo: 'next',
            },
        ],
        /** Opening prompt: cleared — to be authored per-act. */
        openingPrompt: '',
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
        /** Three CTA steps:
         *   1. Slide intro (ACT-1a) with scenario load
         *   2. Live conveyor speed chart (mediaInstruction) — visual teaser, control panel opens
         *   3. Static slide (ACT-1b) + ariaLocal + ariaApi query — ARIA responds with real data, auto-advance
         */
                                                                                                                                                                                                                                                                                                                                                                                                                        ctaSteps: [
            { // Click #1
                ctaLabel: 'Continue',
                scenarioCode: 'SCN-001',
                delayMs: 1000,
                screenText: 'Now, production started everything is looking great...',
                ariaInputEnabled: true,
                panelActions: [
                    { panel: 'basicPanel', state: 'close' },
                    { panel: 'dtxfr', state: 'close' },
                    { panel: 'cwf', state: 'close' },
                    { panel: 'oeeHierarchy', state: 'close' },
                    { panel: 'controlPanel', state: 'close' },
                ],
                simulationAction: 'start',
            },
            { // Click #2
                ctaLabel: 'Next',
                delayMs: 500,
                screenText: 'Is everything really going well?',
                ariaInputEnabled: true,
                panelActions: [
                    { panel: 'basicPanel', state: 'close' },
                    { panel: 'dtxfr', state: 'close' },
                    { panel: 'cwf', state: 'close' },
                    { panel: 'oeeHierarchy', state: 'close' },
                    { panel: 'controlPanel', state: 'close' },
                ],
            },
            { // Click #3
                ctaLabel: 'Next',
                delayMs: 500,
                screenText: 'Let\'s go deep dive a bit...',
                ariaInputEnabled: true,
                panelActions: [
                    { panel: 'basicPanel', state: 'close' },
                    { panel: 'dtxfr', state: 'close' },
                    { panel: 'cwf', state: 'close' },
                    { panel: 'oeeHierarchy', state: 'close' },
                    { panel: 'controlPanel', state: 'close' },
                ],
            },
            { // Click #4
                ariaInputEnabled: true,
                transitionTo: 'next',
            },
        ],
        /** Sidebar LED label — displayed in DemoSidePanel stage list */
        sidebarLabel: 'No System',
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
        /** Opening prompt: cleared — to be authored per-act. */
        openingPrompt: '',
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
        /** SCN-001 — conveyor speed drift visible in the KPI dashboard numbers */
        scenarioCode: 'SCN-001',
        /**
         * Close all panels at act entry — the basicPanel is opened only at
         * ctaSteps[1] (Click #2). Opening it here caused it to appear immediately
         * when transitioning from No System, before the first CTA click.
         */
        panelActions: [
            { panel: 'basicPanel', state: 'close' },
            { panel: 'dtxfr', state: 'close' },
            { panel: 'cwf', state: 'close' },
            { panel: 'oeeHierarchy', state: 'close' },
            { panel: 'controlPanel', state: 'close' },
        ],
        /** Sidebar LED label — displayed in DemoSidePanel stage list */
        sidebarLabel: 'Basic Management',
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
        /** Two CTA steps: chart + Basic/Control panels open so the audience sees live OEE alongside the chart. */
                                                                                                                                                                                                                                                                                                                                                                                                                        ctaSteps: [
            { // Click #1
                ctaLabel: 'Continue',
                slideImageUrl: '/demo/ACT-1a.png',
                delayMs: 300,
                screenText: 'You can see how OEE fluctuates at the Basic screen',
                ariaInputEnabled: true,
                panelActions: [
                    { panel: 'basicPanel', state: 'close' },
                    { panel: 'dtxfr', state: 'close' },
                    { panel: 'cwf', state: 'close' },
                    { panel: 'oeeHierarchy', state: 'close' },
                    { panel: 'controlPanel', state: 'open' },
                ],
            },
            { // Click #2
                ctaLabel: 'Next',
                mediaInstruction: 'chart:conveyor_speed',
                delayMs: 300,
                screenText: 'Hard to understand what took place....',
                ariaInputEnabled: true,
                panelActions: [
                    { panel: 'basicPanel', state: 'open' },
                    { panel: 'dtxfr', state: 'close' },
                    { panel: 'cwf', state: 'close' },
                    { panel: 'oeeHierarchy', state: 'close' },
                ],
            },
            { // Click #3
                ctaLabel: 'Next',
                slideImageUrl: '/demo/ACT-1b.png',
                delayMs: 300,
                screenText: 'Let\'s see how conveyor speed varies',
                ariaInputEnabled: true,
                panelActions: [
                    { panel: 'dtxfr', state: 'close' },
                    { panel: 'cwf', state: 'close' },
                    { panel: 'oeeHierarchy', state: 'close' },
                    { panel: 'controlPanel', state: 'close' },
                ],
                transitionTo: 'next',
            },
        ],
        /** Opening prompt: cleared — to be authored per-act. */
        openingPrompt: '',
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
        /** Sidebar LED label — displayed in DemoSidePanel stage list */
        sidebarLabel: 'Digital Transformation',
        /** Italic sub-label shown below the main sidebar label */
        sidebarSubLabel: 'Digital Twin',
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
        /** Two CTA steps: ARIA narrative + audience interaction. */
                                                                                                                                                                                                                                                                                                                                                                                                                        ctaSteps: [
            { // Click #1
                ctaLabel: 'Continue',
                slideImageUrl: '/demo/ACT-3.png',
                ariaInputEnabled: true,
            },
            { // Click #2
                ctaLabel: 'Next',
                slideImageUrl: '/demo/ACT-3.png',
                ariaInputEnabled: true,
                transitionTo: 'next',
            },
        ],
        /** Opening prompt: cleared — to be authored per-act. */
        openingPrompt: '',
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
        /** Sidebar LED label — displayed in DemoSidePanel stage list */
        sidebarLabel: 'Chat with Your Factory',
        /** Italic sub-label shown below the main sidebar label */
        sidebarSubLabel: 'CWF',
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
        /** Two CTA steps: ARIA narrative + audience interaction. */
                                                                                                                                                                                                                                                                                                                                                                                                                        ctaSteps: [
            { // Click #1
                ctaLabel: 'Continue',
                slideImageUrl: '/demo/ACT-4.png',
                ariaInputEnabled: true,
            },
            { // Click #2
                ctaLabel: 'Next',
                slideImageUrl: '/demo/ACT-4a.png',
                ariaInputEnabled: true,
            },
            { // Click #3
                slideImageUrl: '/demo/ACT-4b.png',
                ariaInputEnabled: true,
                transitionTo: 'next',
            },
        ],
        /** Opening prompt: cleared — to be authored per-act. */
        openingPrompt: '',
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
        /** Sidebar LED label — displayed in DemoSidePanel stage list */
        sidebarLabel: 'Autonomous AI',
        /** Italic sub-label shown below the main sidebar label */
        sidebarSubLabel: 'Auto Pilot',
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
        /** Two CTA steps: ARIA narrative + audience interaction. */
                                                                                                                                                                                                                                                                                                                                                                                                                        ctaSteps: [
            { // Click #1
                ctaLabel: 'Continue',
                slideImageUrl: '/demo/ACT-4c.png',
                ariaInputEnabled: true,
            },
            { // Click #2
                ctaLabel: 'Next',
                slideImageUrl: '/demo/ACT-4d.png',
                ariaInputEnabled: true,
                transitionTo: 'close',
            },
        ],
        /** Opening prompt: cleared — to be authored per-act. */
        openingPrompt: '',
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
        /** Opening prompt: cleared — to be authored per-act. */
        openingPrompt: '',
        /**
         * Two CTA steps: ARIA closing narrative + audience Q&A.
         * No further stage transition — this is the final act.
         */
                                                                                                                                                                                                                                                                                                                                                                                                                        ctaSteps: [
            { // Click #1
                ctaLabel: 'Continue',
                ariaInputEnabled: true,
            },
            { // Click #2
                ctaLabel: 'Next',
                ariaInputEnabled: true,
                transitionTo: 'close',
            },
        ],
    },
];
