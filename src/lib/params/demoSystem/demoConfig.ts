/**
 * demoConfig.ts — Demo System Configuration Constants
 *
 * Tunable runtime constants for the Narrative Demo System.
 *
 * INLINE COMMAND TOKENS (used in screenText and ARIA Local fields):
 *   <cls>    — clears the demo screen (removes current slide)
 *   <clmi>   — clears the active media instruction (removes chart/graph)
 *   <w:N>    — waits N milliseconds before continuing (N is an integer)
 *   <MI>     — executes the step's mediaInstruction (shows chart/graph)
 *   <clck>   — soft auto-click (skips waiting for the user's mouse click):
 *              in screenText → triggers the ARIA phase immediately
 *              in ARIA Local → skips remaining local text, goes to ARIA API
 * All values used by demoStore.ts and demo UI components come from here.
 * No hardcoded values anywhere else in the demo module.
 *
 * HEIGHT SYSTEM (legacy — retained for reference):
 *   The old floating DemoScreen used per-act height keys. The new layout
 *   uses a fixed sidebar + full-height media area, so DEMO_ACT_HEIGHTS
 *   remains only to avoid breaking existing demoScript.ts field declarations.
 *
 * SIDEBAR:
 *   The new Demo UI places a collapsible left sidebar (DemoSidePanel) next
 *   to a central media+ARIA area (DemoMediaView). Width and default
 *   visibility are configured here.
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
 * DEMO_ARIA_LOADING_TIMEOUT_MS — Safety unlock timeout for the CTA button.
 *
 * If the ARIA API call does not complete within this duration, the CTA button
 * is re-enabled so the presenter is never permanently stuck during a live demo.
 * The underlying fetch continues in the background and will still update the
 * message thread when (if) it eventually resolves.
 *
 * Set to 15 s — generous enough for slow networks, tight enough not to stall a demo.
 */
export const DEMO_ARIA_LOADING_TIMEOUT_MS: number = 15_000;

/**
 * DEMO_ARIA_LOADING_LABEL — Text shown on the CTA button while ARIA is responding.
 * Tells the presenter exactly why the button is momentarily disabled.
 */
export const DEMO_ARIA_LOADING_LABEL: string = 'ARIA responding…';

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
    compact: 154,   // ~6 rows (−20%)
    medium: 230,    // ~10 rows (−20%)
    tall: 307,      // ~13 rows (−20%)
    large: 384,     // ~16 rows (−20%)
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

/**
 * DEMO_SIDE_PANEL_WIDTH_PX — Pixel width of the collapsible left sidebar
 * (DemoSidePanel) in the new Demo UI layout.
 * Adjust to fit the sidebar content comfortably at any screen resolution.
 */
export const DEMO_SIDE_PANEL_WIDTH_PX: number = 210;

/**
 * DEMO_SIDE_PANEL_VISIBLE_DEFAULT — Whether the left sidebar is shown by
 * default when the user opens the Demo tab.
 * Set to true so presenters always see the control panel on entry.
 */
export const DEMO_SIDE_PANEL_VISIBLE_DEFAULT: boolean = true;

/**
 * DEMO_MOVIE_PATH — Root-relative URL of the short demo video file.
 * Served from /public/demo/ as a static Vite asset.
 * Used by DemoSidePanel's "Watch movie" button and DemoMediaView's player.
 */
export const DEMO_MOVIE_PATH: string = '/demo/ShortVideo.mp4';

/**
 * DEMO_MEDIA_LEFT_OFFSET_PCT — additional leftward shift applied to the
 * DemoMediaView panel after its anchor position (midpoint between the Demo
 * and Basic header buttons) has been calculated.
 * Expressed as a fraction of window.innerWidth (0.10 = 10%).
 * Increase to shift the panel further left, decrease to move it right.
 * Used exclusively by DemoMediaView.tsx.
 */
export const DEMO_MEDIA_LEFT_OFFSET_PCT: number = 0.005;

// =============================================================================
// MEDIA INSTRUCTION CHART CONFIG
// =============================================================================

/**
 * DEMO_CHART_HEIGHT_PX — Pixel height of the SVG canvas for media instruction charts.
 * Tuned to fit comfortably within the 55vh DemoMediaView without overflow.
 */
export const DEMO_CHART_HEIGHT_PX: number = 220;

/**
 * DEMO_CHART_PADDING — Inner padding for SVG chart axes, in pixels.
 * top/right leave room for axis labels; bottom accommodates X-axis labels;
 * left accommodates Y-axis labels and tick values.
 */
export const DEMO_CHART_PADDING: { top: number; right: number; bottom: number; left: number } = {
    top: 28,
    right: 20,
    bottom: 40,
    left: 52,
};

/**
 * DEMO_CHART_REF_SPEED — Nominal conveyor speed used as the reference (green) line.
 * The belt runs at 1.0 m/s under normal conditions; drifts are visible as deviations.
 */
export const DEMO_CHART_REF_SPEED: number = 1.0;

/**
 * DEMO_CHART_MAX_SPEED — Y-axis ceiling for the conveyor speed chart.
 * Matches the CONVEYOR_SPEED_RANGE upper bound (2.0) plus a small margin.
 */
export const DEMO_CHART_MAX_SPEED: number = 2.1;

/**
 * DEMO_CHART_MIN_SPEED — Y-axis floor for the conveyor speed chart.
 * Belt can reach 0 during a jam. Small negative margin keeps the zero line visible.
 */
export const DEMO_CHART_MIN_SPEED: number = -0.05;

/**
 * DEMO_SCREEN_TEXT_FONT_SIZE_PX — Font size in pixels for the on-screen text caption
 * (CtaStep.screenText). Rendered at the TOP of the DemoMediaView content area, centred,
 * so it reads like a section headline before the slide or chart appears in the same panel.
 *
 * 17 px — halved from 34 px to match the 50% panel size reduction.
 */
export const DEMO_SCREEN_TEXT_FONT_SIZE_PX: number = 18;

/**
 * DEMO_SCREEN_MAX_HEIGHT_VH — Maximum height of the DemoMediaView panel as a percentage
 * of the viewport height. The panel grows freely with its content up to this ceiling,
 * then clips with an internal scrollbar. Prevents the panel from covering the entire
 * factory 3D view on tall displays.
 *
 * 40vh — halved from 80vh to match the 50% panel size reduction.
 */
export const DEMO_SCREEN_MAX_HEIGHT_VH: number = 43;

// =============================================================================
// INLINE COMMAND TOKENS
// =============================================================================

/**
 * DEMO_CMD_CLEAR_SCREEN — inline command that removes the current slide image
 * from the demo screen surface. Write <cls> anywhere in screenText or ARIA Local.
 */
export const DEMO_CMD_CLEAR_SCREEN: string = '<cls>';

/**
 * DEMO_CMD_CLEAR_MI — inline command that removes the active media instruction
 * (chart/graph) from the demo screen. Write <clmi> in screenText or ARIA Local.
 */
export const DEMO_CMD_CLEAR_MI: string = '<clmi>';

/**
 * DEMO_CMD_WAIT_PREFIX — prefix for the wait command (followed by integer ms and >).
 * Example: <w:1000> waits 1000 ms before the next token is processed.
 * commandParser detects any token starting with this prefix.
 */
export const DEMO_CMD_WAIT_PREFIX: string = '<w:';

/**
 * DEMO_CMD_MEDIA_INSTRUCTION — inline command that activates the current step's
 * mediaInstruction (renders a live chart/graph in the media area).
 * Write <MI> in screenText or ARIA Local to trigger it.
 */
export const DEMO_CMD_MEDIA_INSTRUCTION: string = '<MI>';

/**
 * DEMO_CMD_SOFT_CLICK — inline command that simulates a presenter mouse-click,
 * removing the need for the user to click manually at that point.
 * In screenText → triggers the ARIA phase immediately.
 * In ARIA Local  → skips remaining ARIA Local text and calls ARIA API.
 */
export const DEMO_CMD_SOFT_CLICK: string = '<clck>';
