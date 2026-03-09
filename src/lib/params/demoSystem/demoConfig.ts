/**
 * demoConfig.ts — Demo System Configuration Constants
 *
 * Tunable runtime constants for the Narrative Demo System.
 * All values used by demoStore.ts and demo UI components come from here.
 * No hardcoded values anywhere else in the demo module.
 *
 * HEIGHT SYSTEM:
 *   Each act defines a targetHeightKey. The demo screen animates smoothly
 *   between these heights as the user progresses through the story.
 *   This creates the "breathing panel" effect — the screen grows as the
 *   narrative complexity increases.
 *
 * Isolated from main params/index.ts — only imported by demo system files.
 */

/**
 * DEMO_API_ENDPOINT — The CWF API endpoint the Demo System calls.
 * Uses the same endpoint as the regular CWF panel — no separate backend.
 */
export const DEMO_API_ENDPOINT: string = '/api/cwf/chat';

/**
 * DEMO_MAX_HISTORY_MESSAGES — Maximum conversation turns sent per API request.
 * Keeps context windows bounded. Per-act context is injected via systemContext,
 * not the conversation history, so this can stay small.
 */
export const DEMO_MAX_HISTORY_MESSAGES: number = 6;

/**
 * DEMO_CLIENT_TIMEOUT_MS — Request timeout in milliseconds.
 * Aborts the fetch if the CWF API doesn't respond in time.
 */
export const DEMO_CLIENT_TIMEOUT_MS: number = 60_000;

/**
 * DEMO_MESSAGE_ID_PREFIX — Prefix for generated demo message IDs.
 * Keeps demo message IDs visually distinct from CWF message IDs (cwf-...).
 */
export const DEMO_MESSAGE_ID_PREFIX: string = 'demo';

/**
 * DEMO_FALLBACK_RESPONSE — Text shown if the CWF API returns an empty reply.
 * Prevents blank message bubbles in the DemoScreen chat view.
 */
export const DEMO_FALLBACK_RESPONSE: string =
    'I wasn\'t able to generate a response right now. Please try again.';

/**
 * DEMO_HEIGHT_TRANSITION_MS — Duration of the panel height animation in ms.
 * Controls how long the "breathing" resize animation takes between acts.
 * 400ms matches the design system's motion speed for large panel transitions.
 */
export const DEMO_HEIGHT_TRANSITION_MS: number = 400;

/**
 * DEMO_ACT_HEIGHTS — Maps the height key from each DemoAct to a pixel value.
 *
 * compact  → welcome/intro acts   (~8 text rows)
 * medium   → narrative acts       (~12 text rows)
 * tall     → interactive acts     (~16 text rows)
 * large    → climax/AI Copilot    (~20 text rows)
 *
 * 1 text row ≈ 24px (line-height 1.5 × 16px font).
 * Adjust these values to match your viewport and font size.
 */
export const DEMO_ACT_HEIGHTS: Record<DemoHeightKey, number> = {
    compact: 192,   // ~8 rows
    medium: 288,   // ~12 rows
    tall: 384,   // ~16 rows
    large: 480,   // ~20 rows
};

/**
 * DemoHeightKey — the four named height presets available per act.
 * Each DemoAct specifies one of these to declare how tall the panel should be.
 */
export type DemoHeightKey = 'compact' | 'medium' | 'tall' | 'large';

/**
 * DEMO_RESTART_SCENARIO — The scenario loaded when the user restarts the demo.
 * SCN-001 (Press Pressure Anomaly) is the narrative baseline — it provides
 * visible defect activity without being catastrophically broken.
 */
export const DEMO_RESTART_SCENARIO: string = 'SCN-001';

/**
 * DEMO_FIRST_ACT_INDEX — Index of the first act to display after welcome.
 * Act 0 is always welcome; Act 1 is the first narrative act.
 */
export const DEMO_FIRST_ACT_INDEX: number = 0;
