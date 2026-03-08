/**
 * cwfTypes.ts — Shared Type Definitions for CWF (Chat With your Factory)
 *
 * This module centralises all TypeScript interfaces shared between the
 * CWF store (cwfStore.ts) and the CWF API service client (cwfService.ts).
 *
 * ## UIContext
 * A lightweight snapshot of the browser's exact state at the moment a CWF
 * message is sent. It is attached to every POST body so the Vercel serverless
 * function can inject it into the Gemini system prompt, giving the AI full
 * situational awareness of what is currently on the user's screen and what
 * the simulation is doing — without querying Supabase.
 *
 * Used by: cwfStore.ts (builder), cwfService.ts (request shape)
 */

// =============================================================================
// PANEL VISIBILITY SNAPSHOT
// =============================================================================

/**
 * PanelSnapshot — Boolean flags for every panel / overlay the user can
 * open or close. Reflects the *exact* current state of uiStore at the
 * moment the CWF message is sent.
 *
 * Panel descriptions:
 *  - basicPanel      : Left sidebar showing KPI cards + FTQ Defect Heatmap
 *  - dtxfr           : Digital Transfer passport side panel
 *  - oeeHierarchy    : 3D OEE Hierarchy table rendered in the scene
 *  - prodTable       : 3D Production Status table rendered in the scene
 *  - cwf             : CWF chat panel (will always be true when a msg is sent)
 *  - controlPanel    : Floating "Control & Actions" panel with sliders
 *  - demoSettings    : Demo Settings modal (scenario + param config)
 *  - alarmLog        : Alarm Log popup
 *  - tilePassport    : Floating Tile Passport detail panel
 *  - heatmap         : Separate FTQ Defect Heatmap floating panel
 *  - kpi             : Separate KPI floating panel
 */
export interface PanelSnapshot {
    /** Left Basic side panel (KPI + Heatmap) */
    basicPanel: boolean;
    /** DTXFR Digital Transfer passport side panel */
    dtxfr: boolean;
    /** 3D OEE Hierarchy table in the scene */
    oeeHierarchy: boolean;
    /** 3D Production Status table in the scene */
    prodTable: boolean;
    /** CWF chat panel itself */
    cwf: boolean;
    /** Control & Actions floating panel (sliders + conveyor status) */
    controlPanel: boolean;
    /** Demo Settings modal */
    demoSettings: boolean;
    /** Alarm Log popup */
    alarmLog: boolean;
    /** Tile Passport floating panel */
    tilePassport: boolean;
    /** FTQ Defect Heatmap floating panel */
    heatmap: boolean;
    /** KPI floating panel */
    kpi: boolean;
}

// =============================================================================
// SIMULATION STATE SNAPSHOT
// =============================================================================

/**
 * SimSnapshot — Real-time simulation state at the moment the CWF message
 * is sent. Derived from simulationStore values read in the browser.
 *
 * This allows CWF to answer questions like:
 *  - "Is the simulation running?"
 *  - "What tick is the simulation on?"
 *  - "Is the conveyor jammed right now?"
 *  - "What is the current clock speed?"
 */
export interface SimSnapshot {
    /** Whether the simulation is actively ticking (S-Clock running) */
    isRunning: boolean;
    /** Whether the simulation is in Phase-2 drain (winding down, no new tiles) */
    isDraining: boolean;
    /** Current S-Clock tick counter */
    sClockCount: number;
    /** S-Clock period in milliseconds (lower = faster simulation) */
    sClockPeriod: number;
    /** Station processing interval in ticks (how often stations produce) */
    stationInterval: number;
    /**
   * Current conveyor belt operational status.
   * 'jam_scrapping' is a transient sub-state of 'jammed' while tiles are
   * being automatically discarded — shown to CWF as jammed context.
   */
    conveyorStatus: 'running' | 'stopped' | 'jammed' | 'jam_scrapping';
    /** Current conveyor speed multiplier (1.0 = nominal) */
    conveyorSpeed: number;
}

// =============================================================================
// CONFIGURATION SNAPSHOT
// =============================================================================

/**
 * ConfigSnapshot — Session / configuration state at the moment the message
 * is sent. Provides context about what demo scenario is active, what language
 * the interface is in, and whether the simulation was configured and run.
 */
export interface ConfigSnapshot {
    /** UI language: 'tr' = Turkish, 'en' = English */
    language: 'tr' | 'en';
    /** Code of the active scenario (e.g. "SCN-002"), or null if none active */
    activeScenarioCode: string | null;
    /** ID of the selected Work Order (e.g. "WRK-0001"), or null if none */
    selectedWorkOrderId: string | null;
    /**
     * Whether the user has completed the Demo Settings gate for this run.
     * false = simulation not yet configured (Start button is locked)
     */
    isSimConfigured: boolean;
    /**
     * Whether the simulation has finished naturally (Work Order completed).
     * true = simulation ran to completion; Reset required before next run
     */
    simulationEnded: boolean;
}

// =============================================================================
// FULL UI CONTEXT
// =============================================================================

/**
 * UIContext — Complete browser-side state snapshot attached to every CWF
 * POST request. This is the primary mechanism for giving the Gemini agent
 * exact situational awareness of the current UI state without querying
 * Supabase (which only holds persisted/historical data).
 *
 * Built in: cwfStore.ts (sendMessage action)
 * Consumed in: cwfService.ts (fetch body) → api/cwf/chat.ts (system prompt)
 *
 * Design principle: Read-only snapshot — never mutated after construction.
 * All values are captured atomically at the moment sendMessage() is called.
 */
export interface UIContext {
    /** Which panels are currently open on the user's screen */
    panels: PanelSnapshot;
    /** Real-time simulation state at the moment of the message */
    simulation: SimSnapshot;
    /** Session configuration and scenario state */
    config: ConfigSnapshot;
}
