/**
 * subHeaderPanel.ts — Configuration Parameters for SubHeaderPanel
 *
 * All tunable layout constants for the transparent glass panel that appears
 * below the header divider line (between the ModesMenu pill and Pillar 3).
 *
 * ── Parameters ─────────────────────────────────────────────────────────────
 *  SUB_HEADER_PANEL_HEIGHT_PX            → Panel height in pixels (10 text rows)
 *  SUB_HEADER_PANEL_RESIZE_DEBOUNCE_MS   → Debounce delay for resize observer
 *  SUB_HEADER_PANEL_Z_INDEX              → Tailwind z-index class
 */

/**
 * SUB_HEADER_PANEL_HEIGHT_PX — panel height in pixels.
 * 10 content rows × 16 px line-height = 160 px.
 * Adjust if the base font size or desired row count changes.
 */
export const SUB_HEADER_PANEL_HEIGHT_PX: number = 160;

/**
 * SUB_HEADER_PANEL_RESIZE_DEBOUNCE_MS — debounce delay for the window resize
 * listener inside SubHeaderPanel.tsx. Prevents excessive DOM reads while the
 * user is actively dragging the browser window border.
 * Default: 100 ms (imperceptible to the user, but avoids render storms).
 */
export const SUB_HEADER_PANEL_RESIZE_DEBOUNCE_MS: number = 100;

/**
 * SUB_HEADER_PANEL_Z_INDEX — Tailwind z-index class applied to the panel.
 * Must sit above the 3D scene canvas (z-0) and below modal overlays (z-50+).
 * z-40 is a safe mid-layer value.
 */
export const SUB_HEADER_PANEL_Z_INDEX: string = "z-40";
