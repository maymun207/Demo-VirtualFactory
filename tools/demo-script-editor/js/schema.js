/**
 * schema.js — Static Data Schema for the VF Demo Script Editor
 *
 * Defines every dropdown option, stage definition, panel name, and preset
 * used across the editor. No logic here — pure declarative data only.
 * All values are exposed on `window` so editor.js and exporter.js can share them.
 */

/** The 7 narrative acts — id must match DemoAct.id in demoScript.ts */
window.STAGES = [
    { id: 'welcome',           emoji: '👋', label: 'Welcome' },
    { id: 'no-management',     emoji: '❌', label: 'No System' },
    { id: 'basic-system',      emoji: '📊', label: 'Basic Management' },
    { id: 'digital-twin',      emoji: '🔗', label: 'Digital Twin' },
    { id: 'chat-with-factory', emoji: '💬', label: 'Chat with Factory' },
    { id: 'autonomous-ai',     emoji: '🤖', label: 'Autonomous AI' },
    { id: 'close',             emoji: '💰', label: 'Financial Close' },
];

/** UI panels that can be toggled open/closed per step */
window.PANELS = [
    { id: 'basicPanel',   label: 'Basic Panel' },
    { id: 'dtxfr',        label: 'DTXFR Passport' },
    { id: 'cwf',          label: 'CWF Chat' },
    { id: 'oeeHierarchy', label: 'OEE Hierarchy' },
    { id: 'controlPanel', label: 'Control Panel' },
];

/** Simulation scenario options — id = scenarioCode in demoScript.ts */
window.SCENARIOS = [
    { id: '',        label: '— (no change)' },
    { id: 'SCN-001', label: 'SCN-001 · Optimal Production' },
    { id: 'SCN-002', label: 'SCN-002 · Kiln Temperature Crisis' },
    { id: 'SCN-003', label: 'SCN-003 · Glaze Viscosity Drift' },
    { id: 'SCN-004', label: 'SCN-004 · Multi-Station Cascade' },
];

/** Available slide images in public/demo/ */
window.SLIDES = [
    { id: '',              label: '— (no slide)' },
    { id: '/demo/Welcome.png', label: 'Welcome.png' },
    { id: '/demo/ACT-0.png',  label: 'ACT-0.png' },
    { id: '/demo/ACT-1a.png', label: 'ACT-1a.png' },
    { id: '/demo/ACT-1b.png', label: 'ACT-1b.png' },
    { id: '/demo/ACT-2.png',  label: 'ACT-2.png' },
    { id: '/demo/ACT-3.png',  label: 'ACT-3.png' },
    { id: '/demo/ACT-4.png',  label: 'ACT-4.png' },
    { id: '/demo/ACT-4a.png', label: 'ACT-4a.png' },
    { id: '/demo/ACT-4b.png', label: 'ACT-4b.png' },
    { id: '/demo/ACT-4c.png', label: 'ACT-4c.png' },
    { id: '/demo/ACT-4d.png', label: 'ACT-4d.png' },
];

/** Where the step transitions after execution */
window.TRANSITIONS = [
    { id: '',                  label: '— (stay / no transition)' },
    { id: 'next',              label: '→ Linear: Next Stage' },
    { id: 'welcome',           label: 'Jump → Welcome' },
    { id: 'no-management',     label: 'Jump → No System' },
    { id: 'basic-system',      label: 'Jump → Basic Management' },
    { id: 'digital-twin',      label: 'Jump → Digital Twin' },
    { id: 'chat-with-factory', label: 'Jump → Chat with Factory' },
    { id: 'autonomous-ai',     label: 'Jump → Autonomous AI' },
    { id: 'close',             label: 'Jump → Financial Close' },
];

/** Simulation actions available per step — maps to CtaStep.simulationAction in demoScript.ts */
window.SIMULATION_ACTIONS = [
    { id: '',            label: '\u2014 (no change)' },
    { id: 'start',       label: '\u25b6 Start simulation' },
    { id: 'stop',        label: '\u25a0 Stop simulation' },
    { id: 'reset',       label: '\u21ba Reset (stays stopped)' },
    { id: 'reset-start', label: '\u21ba Reset + Start (clean run)' },
];

/**
 * MEDIA_INSTRUCTIONS — available dynamic visualisations for a CtaStep.
 * Matches the MediaInstruction union in demoScript.ts.
 * When a media instruction is selected, it overrides the static slideImageUrl
 * for that step and renders a live chart/viz from simulation data.
 */
window.MEDIA_INSTRUCTIONS = [
    { id: '',                      label: '\u2014 (none — use slide image)' },
    { id: 'chart:conveyor_speed',  label: '\ud83d\udcc8 Chart: S-Clock vs Conveyor Speed' },
];

/** Maximum click steps allowed per stage */
window.MAX_STEPS = 4;

/** localStorage key for persisting editor data between sessions */
window.STORAGE_KEY = 'vf-demo-script-editor-v1';

/**
 * createEmptyStep — returns a blank CtaStep object with all defaults.
 * Called when adding a new step column to a stage.
 */
window.createEmptyStep = function () {
    const panelActions = {};
    PANELS.forEach(p => panelActions[p.id] = ''); /* '' = no change */
    return {
        ctaLabel:          '',
        slideImageUrl:     '',
        /** mediaInstruction: dynamic chart/viz key (or '' for static slide). */
        mediaInstruction:  '',
        scenarioCode:      '',
        delayMs:           '',
        screenText:        '',
        ariaLocal:         '',
        ariaApi:           '',
        ariaInputEnabled:  true,
        panelActions,
        simulationAction:  '',   /* '' = no change */
        transitionTo:      '',
    };
};

/**
 * createInitialState — returns fresh app state with 2 empty steps per stage.
 */
window.createInitialState = function () {
    const stages = {};
    STAGES.forEach(s => { stages[s.id] = { steps: [createEmptyStep(), createEmptyStep()] }; });
    return { activeStageId: STAGES[0].id, stages };
};
