/**
 * schema.js — Static Data Schema + Dynamic Slide Discovery
 *
 * Defines every dropdown option, stage definition, panel name, and preset
 * used across the editor. All values are exposed on `window` so editor.js
 * and exporter.js can share them.
 *
 * ── Dynamic Slide Discovery ──────────────────────────────────────────────────
 * window.SLIDES is populated in two ways:
 *
 *   1. DYNAMIC (preferred): When the editor is opened via Vite at
 *      http://localhost:5173, it fetches GET /api/demo-slides which reads
 *      the public/demo/ directory on disk and returns all filenames as JSON.
 *      This means adding a new file to public/demo/ and clicking "🔄 Refresh
 *      Slides" updates the dropdown immediately — no code changes needed.
 *
 *   2. STATIC FALLBACK: When opened as a file:// URL (double-click), fetch
 *      will fail silently and the hard-coded SLIDES_FALLBACK list is used
 *      instead so the editor still functions offline.
 *
 * ── How To Add New Slides ────────────────────────────────────────────────────
 *   1. Drop any image/video file into: virtual-factory-demo/public/demo/
 *   2. Click the "🔄 Refresh Slides" button in the editor header.
 *   3. The new file appears immediately in the Demo Screen dropdown.
 */

// ─── Static Data ─────────────────────────────────────────────────────────────

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

/**
 * SLIDES_FALLBACK — used when the editor is opened as a file:// URL and
 * the fetch to /api/demo-slides cannot succeed.
 * Keep this in sync with the actual files in public/demo/ for offline use.
 */
const SLIDES_FALLBACK = [
    { id: '',                  label: '— (no slide)' },
    { id: '/demo/Welcome.png', label: 'Welcome.png' },
    { id: '/demo/ACT-0.png',   label: 'ACT-0.png' },
    { id: '/demo/ACT-1a.png',  label: 'ACT-1a.png' },
    { id: '/demo/ACT-1b.png',  label: 'ACT-1b.png' },
    { id: '/demo/ACT-2.png',   label: 'ACT-2.png' },
    { id: '/demo/ACT-3.png',   label: 'ACT-3.png' },
    { id: '/demo/ACT-4.png',   label: 'ACT-4.png' },
    { id: '/demo/ACT-4a.png',  label: 'ACT-4a.png' },
    { id: '/demo/ACT-4b.png',  label: 'ACT-4b.png' },
    { id: '/demo/ACT-4c.png',  label: 'ACT-4c.png' },
    { id: '/demo/ACT-4d.png',  label: 'ACT-4d.png' },
];

/**
 * Initial value — will be replaced by the dynamic fetch below.
 * Using the fallback list immediately means all select rows render while
 * the fetch is in-flight; they are re-rendered once the fetch completes.
 */
window.SLIDES = SLIDES_FALLBACK;

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

// ─── Dynamic Slide Discovery ──────────────────────────────────────────────────

/**
 * _slideRefreshStatus — tracks whether a refresh is in progress.
 * Prevents concurrent fetches if the user clicks Refresh quickly.
 */
let _slideRefreshInProgress = false;

/**
 * _updateRefreshButton — sets the refresh button text/state based on fetch
 * progress.
 *
 * @param {'idle'|'loading'|'ok'|'error'} status - Current state
 * @param {number} [count] - Number of slides found (for 'ok' status)
 */
function _updateRefreshButton(status, count) {
    /** Button may not exist yet on first call (DOMContentLoaded hasn't fired) */
    const btn = document.getElementById('btn-refresh-slides');
    if (!btn) return;

    /** Map each status to a readable label string */
    const labels = {
        idle:    '🔄 Refresh Slides',
        loading: '⏳ Scanning…',
        ok:      `✅ ${count} slide${count !== 1 ? 's' : ''} found`,
        error:   '⚠️ Refresh failed',
    };
    btn.textContent = labels[status] || labels.idle;

    /** Disable the button while a fetch is in progress */
    btn.disabled = (status === 'loading');

    /** Auto-reset label back to 'idle' after 3 seconds for ok/error states */
    if (status === 'ok' || status === 'error') {
        setTimeout(() => _updateRefreshButton('idle'), 3000);
    }
}

/**
 * refreshSlides — Fetches GET /api/demo-slides and rebuilds window.SLIDES.
 *
 * 1. Calls /api/demo-slides (proxied by Vite to the CWF dev server at :3001).
 * 2. Prepends the "no slide" sentinel option.
 * 3. Replaces window.SLIDES with the fresh list.
 * 4. Re-renders the current editor stage so all slide dropdowns update.
 *
 * Falls back silently to SLIDES_FALLBACK if fetch fails (e.g. opened as
 * file:// without the Vite server running).
 *
 * Exposed on window so the "🔄 Refresh Slides" button can call it and so
 * editor.js can call it on DOMContentLoaded.
 */
window.refreshSlides = async function refreshSlides() {
    /** Guard against concurrent fetches */
    if (_slideRefreshInProgress) return;
    _slideRefreshInProgress = true;
    _updateRefreshButton('loading');

    try {
        /** Fetch the live file list from the CWF dev server via Vite proxy */
        const res = await fetch('/api/demo-slides', { cache: 'no-store' });

        if (!res.ok) {
            /** Server returned a non-2xx status — fall through to catch */
            throw new Error(`HTTP ${res.status}`);
        }

        /** Parse the response and build the SLIDES array */
        const data = await res.json();

        /** Prepend the "no slide" sentinel entry before the file list */
        window.SLIDES = [
            { id: '', label: '— (no slide)' },
            ...data.slides,
        ];

        /** Update the refresh button to show how many slides were found */
        _updateRefreshButton('ok', data.slides.length);

        console.log(`[Demo Script Editor] Slide list refreshed: ${data.slides.length} files found in public/demo/`);
    } catch (err) {
        /**
         * Fetch failed — this is expected when the editor is opened as a
         * file:// URL without the Vite + CWF dev servers running.
         * Fall back to the static list so the editor still works.
         */
        console.warn('[Demo Script Editor] Could not fetch /api/demo-slides — using static fallback.', err);
        window.SLIDES = SLIDES_FALLBACK;
        _updateRefreshButton('error');
    } finally {
        /** Release the in-progress guard regardless of success or failure */
        _slideRefreshInProgress = false;
    }

    /**
     * Re-render the active stage so all slide <select> elements are rebuilt
     * with the updated SLIDES list.
     * renderStage() is defined in editor.js but loaded after schema.js; by the
     * time refreshSlides() is called at runtime (DOMContentLoaded or button
     * click), renderStage() is guaranteed to be available on window.
     */
    if (typeof window.renderStage === 'function') {
        window.renderStage();
    }
};

// ─── Bootstrap ────────────────────────────────────────────────────────────────

/**
 * Kick off the initial dynamic slide fetch once the DOM is ready.
 * This runs automatically when the page loads so the dropdown is always
 * up-to-date without the user having to click Refresh manually.
 */
document.addEventListener('DOMContentLoaded', function () {
    /** Non-blocking — editor renders immediately with fallback, then refreshes */
    window.refreshSlides();
});

// ─── Step Factories ───────────────────────────────────────────────────────────

/**
 * createEmptyStep — returns a blank CtaStep object with all defaults.
 * Called when adding a new step column to a stage.
 */
window.createEmptyStep = function () {
    const panelActions = {};
    /** Initialise every known panel to '' (no change) */
    PANELS.forEach(p => panelActions[p.id] = '');
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
