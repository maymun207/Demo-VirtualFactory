/**
 * demoScript.ts — Narrative Demo Act Definitions
 *
 * The "sheet music" for the Demo System. Defines the ordered sequence of
 * DemoAct objects that drive the entire demo narrative engine.
 *
 * FLEXIBILITY DESIGN:
 *   This file is PURE DATA — no logic, no imports, no side effects.
 *   To change the demo story: edit only this file.
 *   To reorder acts, change panelActions, adjust heights, or rewrite
 *   the narrative prompts — all changes happen here, zero logic touches needed.
 *
 * ACT STRUCTURE:
 *   Each DemoAct describes ONE chapter of the demo story. The engine reads
 *   the act config and automatically:
 *     1. Animates the panel to the specified height
 *     2. Opens/closes the specified panels via uiStore
 *     3. Loads the specified scenario via simulationDataStore
 *     4. Sends the openingPrompt to CWF as the act's first message
 *
 * SCENARIO PROGRESSION:
 *   Acts start with SCN-001 (Press anomaly — visible but not catastrophic).
 *   As the story escalates, scenarios escalate: SCN-002 → SCN-003 → SCN-004.
 *   This means the audience sees factory behaviour change in real-time as the
 *   narrative advances — making the simulation an active part of the demo.
 *
 * Used by: demoStore.ts, DemoScreen.tsx, DemoActBreadcrumb.tsx
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
     * Short era label shown in the DemoActBreadcrumb progress indicator.
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
     * null = do not switch scenario (welcome act, or acts that continue the same scenario)
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
    // ── ACT 0 — Welcome ──────────────────────────────────────────────────────
    {
        id: 'welcome',
        eraLabel: 'Welcome',
        eraEmoji: '👋',
        targetHeightKey: 'tall',
        scenarioCode: 'SCN-001',   // Load the baseline scenario immediately
        panelActions: [],           // No panels on welcome
        systemContext: `
You are opening the demo. Deliver the welcome message exactly as specified in the prompt.
Keep it warm, cinematic, and exciting. Maximum 5 sentences for the welcome.
        `.trim(),
        openingPrompt: `
Welcome the audience with this exact message (adapt naturally but keep all key points):

"Welcome to the Digital Twin Demo of a Ceramic Tile Factory. 🏭

Over the next few minutes, we'll take you on a journey — from a factory operating completely blind, 
with no management system, to a factory where every tile has a digital passport and an autonomous 
AI is optimising production in real time.

You'll see four transformations:
  📊 Basic Management — the first step toward visibility
  🔗 Digital Transformation — tile-level intelligence and traceability  
  💬 Chat with Factory — natural language control of the entire plant
  🤖 Autonomous AI Copilot — the factory that runs itself

At each step, we'll stop, look at what you can see — and what you can't.
I'll ask you some questions. Your answers might surprise you.

Ready? Let's begin. → Continue"
        `.trim(),
    },

    // ── ACT 1 — No Management ────────────────────────────────────────────────
    {
        id: 'no-management',
        eraLabel: 'No System',
        eraEmoji: '🏭',
        targetHeightKey: 'medium',
        scenarioCode: null,         // SCN-001 still active from welcome
        panelActions: [
            // Close everything — simulating "blind" factory management
            { panel: 'basicPanel', state: 'close' },
            { panel: 'dtxfr', state: 'close' },
            { panel: 'cwf', state: 'close' },
            { panel: 'oeeHierarchy', state: 'close' },
        ],
        systemContext: `
We are in the "No Management System" era. The factory is running but the owner has NO digital tools.
They rely on clipboards, shift managers walking the floor, and end-of-day paper reports.
Help the audience feel how blind this is. The simulation is running with defects (SCN-001 is active).
        `.trim(),
        openingPrompt: `
Tell this story to the audience:

"This factory is running. Tiles are being produced. Somewhere on the line — right now — 
something is going wrong. A parameter is drifting. Defects are accumulating.

But the factory owner? They don't know yet. They won't know until the end of the shift 
when the quality inspector counts the scrap pile.

Here's my question for you: Without any digital system — no dashboard, no sensors, 
no alerts — if you had to guess... which machine do you think is causing the defects right now?"

Wait for the audience to respond. Engage with their answer using the gentle correction rules.
        `.trim(),
    },

    // ── ACT 2 — Basic Management (Basic Panel) ───────────────────────────────
    {
        id: 'basic-system',
        eraLabel: 'Basic System',
        eraEmoji: '📊',
        targetHeightKey: 'medium',
        scenarioCode: null,         // Same SCN-001 scenario — now we can SEE it
        panelActions: [
            { panel: 'basicPanel', state: 'open' },  // Open the Basic KPI panel
        ],
        systemContext: `
We have just opened the Basic Management System — a KPI dashboard showing production numbers,
OEE percentages, and a defect heatmap. The factory owner can now SEE that something
is wrong, but they still cannot trace WHICH tile is defective or WHERE in the process it went wrong.
SCN-001 (Press Pressure Anomaly) is active — defects are happening at the Press station.
        `.trim(),
        openingPrompt: `
Tell this story as the Basic Panel just opened:

"Now we have a Basic System. 📊 A dashboard. Numbers on a screen.

You can see the OEE has dropped. The defect rate is climbing. Something is clearly wrong.
Look at the heatmap — you can see which stations are struggling.

But here's the hard question: Can you tell me WHY the press is underperforming? 
Can you trace which specific tiles are affected? Can you tell when exactly the problem started?

Imagine you're the factory owner right now. The data tells you there's a problem. 
What do you do next — and what information are you missing?"

Wait for the audience to respond. Guide them to realise they cannot trace individual tiles.
        `.trim(),
    },

    // ── ACT 3 — Digital Twin & Tile Passport ─────────────────────────────────
    {
        id: 'digital-twin',
        eraLabel: 'Digital Twin',
        eraEmoji: '🔗',
        targetHeightKey: 'tall',
        scenarioCode: 'SCN-002',    // Kiln Temperature Crisis — different defect type
        panelActions: [
            { panel: 'basicPanel', state: 'close' },  // Close basic — upgrade complete
            { panel: 'dtxfr', state: 'open' },  // Open the DTXFR Digital Passport
        ],
        systemContext: `
We've switched to SCN-002 (Kiln Temperature Crisis — over-fired tiles, surface cracks).
The factory now has a DIGITAL TWIN with full tile-level traceability via the Tile Passport.
Every tile has a digital record of every station it passed through, every parameter reading.
The audience can now see exactly which tiles are affected and exactly when/where the problem started.
        `.trim(),
        openingPrompt: `
Tell this story as the DTXFR Digital Passport opens:

"Notice something? We just switched scenarios. There's a new problem — the Kiln is now 
running too hot. Surface cracks are forming. 🔧

But this time — we can trace exactly which tiles are affected. Every single tile 
has a digital passport. We know exactly when it entered the kiln, what temperature 
it experienced, and whether it passed quality inspection.

This is the power of a Digital Twin: not just seeing that something went wrong — 
but knowing exactly WHAT went wrong, WHERE, and to WHICH products.

Can you imagine what this means for your quality warranty costs? For customer claims? 
For waste reduction? → Continue when you're ready to go further."
        `.trim(),
    },

    // ── ACT 4 — Chat with Factory ────────────────────────────────────────────
    {
        id: 'chat-with-factory',
        eraLabel: 'Chat with Factory',
        eraEmoji: '💬',
        targetHeightKey: 'tall',
        scenarioCode: 'SCN-003',    // Glaze Drift — subtler, requires AI to detect
        panelActions: [
            { panel: 'dtxfr', state: 'close' },  // Close passport
            { panel: 'cwf', state: 'open' },  // Open the CWF chat panel
        ],
        systemContext: `
We are now in the Chat with Factory era. SCN-003 (Glaze Drift) is active — a subtle
parameter drift affecting colour consistency. This defect is hard to spot visually
but CWF can diagnose it immediately from the data.
The audience should be invited to ask CWF a direct question in their own words.
        `.trim(),
        openingPrompt: `
Tell this story as the CWF panel opens alongside the demo:

"New scenario. New problem. The glaze density is drifting — tiles are coming out 
with inconsistent colour. It's subtle. You might not see it until the customer complains.

But now — you don't need to know the technical parameter name. You don't need to 
remember which station handles glaze. You just... ask.

Go ahead. Type a question to the factory right now — in your own words. 
Try something like: 'What's causing the colour inconsistency?' or 'Where should I look first?'

The factory will answer you. Directly. In plain language. 💬"

Encourage the audience to interact with the CWF panel directly. Tell them to try it.
        `.trim(),
    },

    // ── ACT 5 — Autonomous AI Copilot ────────────────────────────────────────
    {
        id: 'autonomous-ai',
        eraLabel: 'Autonomous AI',
        eraEmoji: '🤖',
        targetHeightKey: 'large',
        scenarioCode: 'SCN-004',    // Cascade failure — most dramatic scenario
        panelActions: [
            // CWF panel must stay OPEN so the audience can watch Copilot corrections stream in
            { panel: 'cwf', state: 'open' },
            // Open the 3D OEE hierarchy so the OEE impact is visible alongside the CWF panel
            { panel: 'oeeHierarchy', state: 'open' },
        ],
        // Signal the engine to auto-call the Copilot enable API when this act starts
        enableCopilot: true,
        systemContext: `
We are at the final frontier — the Autonomous AI Copilot. SCN-004 (Cascade Multi-station failure)
is active: simultaneous press + kiln failures causing a dramatic OEE drop.
The Copilot AI is monitoring, detecting, and CORRECTING parameters autonomously — no human input needed.
This is the climax of the demo. Make it feel like magic.
        `.trim(),
        openingPrompt: `
Tell this final story with maximum impact:

"This is the final frontier. 🤖

We just triggered our most dramatic scenario — simultaneous failures across the press AND the kiln.
OEE is dropping. Defects are cascading. In the old world, this would be a crisis requiring 
an emergency meeting, manual intervention, shift manager calls at 3am.

Watch the Copilot. It already knows. It's already acting.

Without any human instruction, it identifies the root causes, calculates the corrections,
applies them in order of priority, and monitors the recovery — all within seconds.

This is what 'Autonomous AI Factory Management' actually means. Not a dashboard. Not an alert.
A cognitive layer that runs your factory to optimal efficiency while you sleep.

The journey from clipboard to cognitive AI — that's what you just witnessed. 
And this? This is available today. → Press Restart to run it again, or ask me anything."
        `.trim(),
    },
];
