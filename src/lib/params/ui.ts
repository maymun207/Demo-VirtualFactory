/**
 * ╔═══════════════════════════════════════════════════════════════════╗
 * ║  UI — Panel layout, tooltip, header, speed slider ranges,       ║
 * ║  KPI ID lists, tile passport defaults, and UI store defaults.   ║
 * ║                                                                  ║
 * ║  Includes simulationEnded flag (new, 2026-02) used to prevent   ║
 * ║  the Demo Settings close handler from re-enabling Start after a ║
 * ║  simulation has finished naturally.                              ║
 * ╚═══════════════════════════════════════════════════════════════════╝
 */

// ═══════════════════════════════════════════════════════════════════
// UI — Conveyor speed slider range and control panel config
// ═══════════════════════════════════════════════════════════════════

/** Conveyor speed slider min/max/step values */
export const CONVEYOR_SPEED_RANGE = {
  min: 0.3,
  max: 2,
  step: 0.1,
} as const;

/**
 * S-Clock period slider min/max/step values (ms).
 *
 * min raised from 100 → 200 to limit the maximum tick rate.
 * At 100ms + stationInterval=1 + speed=2.0×, the compound speedup
 * was 10.7× over default, causing runaway production (5,874 tiles).
 * At 200ms minimum, the max rate is 5 ticks/sec before speed scaling.
 */
export const S_CLOCK_RANGE = {
  min: 200,
  max: 700,
  step: 100,
} as const;

/**
 * Station interval slider min/max/step values.
 *
 * min raised from 1 → 2 to prevent P-Clock firing on every S-Clock tick.
 * At interval=1, every single S-tick produced a tile — doubling the
 * effective production rate vs the default (interval=2).
 * Combined with the S_CLOCK_RANGE.min change, this caps the maximum
 * compound speedup to ~2.7× over default instead of 10.7×.
 */
export const STATION_INTERVAL_RANGE = {
  min: 2,
  max: 7,
  step: 1,
} as const;

// ═══════════════════════════════════════════════════════════════════
// TOOLTIP — Machine hover tooltip parameters
// ═══════════════════════════════════════════════════════════════════

/** Padding from viewport edges for tooltip clamping (px) */
export const TOOLTIP_EDGE_PADDING = 12;
/** Delay before tooltip becomes visible after hover begins (ms) */
export const TOOLTIP_SHOW_DELAY_MS = 50;
/** Horizontal offset from cursor for tooltip placement (px) */
export const TOOLTIP_CURSOR_OFFSET = 16;

// ═══════════════════════════════════════════════════════════════════
// KPI IDs — Shared type for type-safe KPI matching
// ═══════════════════════════════════════════════════════════════════

/** Ordered tuple of all KPI identifiers */
export const KPI_IDS = ['oee', 'ftq', 'total_kpi', 'scrap', 'energy', 'gas', 'co2'] as const;
/** Union type of valid KPI ID strings */
export type KpiId = typeof KPI_IDS[number];

/**
 * KPI IDs where a numeric INCREASE is bad (shown as red/down arrow).
 * For these KPIs, a decrease in value is considered "improving".
 */
export const INVERTED_KPI_IDS: readonly string[] = ['scrap', 'energy', 'gas', 'co2'];

/** All KPI IDs that participate in rolling-window trend tracking */
export const TRACKED_KPI_IDS: readonly string[] = ['oee', 'ftq', 'total_kpi', 'scrap', 'energy', 'gas', 'co2'];

// ═══════════════════════════════════════════════════════════════════
// TILE PASSPORT — Default display values
// ═══════════════════════════════════════════════════════════════════

/** Default text values shown in the Tile Passport panel */
export const TILE_PASSPORT_DEFAULTS = {
  lot: 'LOT-2024-001',
  order: 'ORD-7845',
  recipe: 'GLZ-STD-01',
  qualityScore: '92.5',
} as const;

// ═══════════════════════════════════════════════════════════════════
// PANEL UI — Min widths, positions, and offsets
// ═══════════════════════════════════════════════════════════════════

/** Minimum widths for specific panels (px) */
export const PANEL_MIN_WIDTHS = {
  tilePassport: 260,
  defectHeatmap: 260,
  kpiContainer: 260,
} as const;

/** Fallback clearance below the header when DOM element is unavailable.
 *  Must clear the full 2-row header: Row 1 (~50px) + Row 2 (~30px)
 *  + border (1px) + CONTROL_PANEL_GAP (8px) + safety margin. */
export const PANEL_HEADER_CLEARANCE = 120;
/** Horizontal gap between cascaded panels */
export const PANEL_CASCADE_X = 268;
/** Default panel width (px) — 20% wider than original 260px for better readability */
export const PANEL_DEFAULT_WIDTH = 359;
/** Margin from viewport edges (px) */
export const PANEL_EDGE_MARGIN = 12;
/** Minimum clearance from bottom for toolbar (px) */
export const PANEL_BOTTOM_CLEARANCE = 100;
/** Gap between control panel buttons */
export const CONTROL_PANEL_GAP = 8;
/** Minimum panel width (px) — prevents collapse */
export const PANEL_MIN_WIDTH = 220;
/** Maximum panel width (px) — prevents overflow */
export const PANEL_MAX_WIDTH = 600;
/** Minimum panel height (px) when user is resizing */
export const PANEL_MIN_HEIGHT = 150;
/** Maximum panel height as fraction of viewport (0.85 = 85%) */
export const PANEL_MAX_HEIGHT_RATIO = 0.85;
/** Viewport width breakpoint for mobile panel layout (px) */
export const PANEL_MOBILE_BREAKPOINT = 640;
/** Vertical offset between stacked panels on mobile (px) */
export const PANEL_MOBILE_STACK_OFFSET = 12;
/** Vertical offset when desktop panels wrap to a second row (px) */
export const PANEL_DESKTOP_WRAP_OFFSET = 30;
/** Maximum number of panel slots for vertical stacking in narrow viewports */
export const PANEL_MAX_SLOTS = 4;
/** Gap between vertically stacked panels in narrow mode (px) */
export const PANEL_STACK_GAP = 8;
/** Minimum font scale factor when panel is resized smaller (70% of default) */
export const PANEL_FONT_SCALE_MIN = 0.7;
/** Maximum font scale factor when panel is resized larger (200% of default) */
export const PANEL_FONT_SCALE_MAX = 2.0;
/** Exponent controlling how aggressively fonts scale with panel size.
 *  0.5 = geometric mean (gentle), 0.75 = steeper growth, 1.0 = linear. */
export const PANEL_FONT_SCALE_EXPONENT = 0.75;
/** Default panel height reference (px) — used to compute vertical font scale.
 *  Approximates the typical auto-height of panel content at default width. */
export const PANEL_DEFAULT_HEIGHT = 450;

// ═══════════════════════════════════════════════════════════════════
// HEADER UI — Gradient and button config
// ═══════════════════════════════════════════════════════════════════

/** Gradient color stops for the header bar */
export const HEADER_GRADIENT = {
  from: '#a855f7', // Purple
  to: '#22d3ee',   // Cyan
} as const;

/** Standard font for header action buttons to match the 'Basic' button style */
export const HEADER_BUTTON_FONT = 'text-xs font-medium';
/** Standard shape for header action buttons to match the 'Basic' button style */
export const HEADER_BUTTON_SHAPE = 'rounded-lg';
/** Standard padding for header action buttons */
export const HEADER_BUTTON_PADDING = 'px-3 py-1.5';
/** Standard gap between icon and text in header buttons */
export const HEADER_BUTTON_ICON_GAP = 'gap-1.5';

/** ═══════════════════════════════════════════════════════════════════
 *  MODES MENU — Responsive dropdown configuration
 *  ═══════════════════════════════════════════════════════════════════ */

/** Minimum width of the modes dropdown on mobile (px) */
export const MODES_DROPDOWN_MIN_WIDTH = 'min-w-[160px]';
/** Z-index for the modes dropdown to ensure it floats above all other header elements */
export const MODES_DROPDOWN_Z_INDEX = 'z-100';

// ═══════════════════════════════════════════════════════════════════
// UI DEFAULTS — Initial values for the UI store
// ═══════════════════════════════════════════════════════════════════

/** Default UI state values used by uiStore on init and reset */
export const UI_DEFAULTS = {
  /** Default interface language ('tr' = Turkish, 'en' = English) */
  language: 'en' as const,

  /** Panel visibility defaults: only the Production Table is visible at start */
  showPassport: false,
  showHeatmap: false,
  showControlPanel: false,
  showProductionTable: true,
  showKPI: false,
  showDemoSettings: false,
  showAlarmLog: false,
  /** CWF chat panel hidden by default */
  showCWF: false,
  /** DTXFR (Digital Transfer) passport panel hidden by default */
  showDTXFR: false,
  /** Basic panel (KPI + Heatmap) hidden by default for a clean initial view */
  showBasicPanel: false,
  /** OEE Hierarchy drill-down panel visible by default */
  showOEEHierarchy: true,

  /**
   * isSimConfigured — Demo Settings Gate
   *
   * When false, the Start button shows a toast asking the user to open
   * Demo Settings before running the simulation. This ensures users always
   * configure their Work Order and Scenario before starting.
   *
   * Set to true when the Demo Settings panel is closed (by any means),
   * UNLESS simulationEnded is true — in that case the gate stays locked
   * until the user explicitly clicks Reset.
   * Reset to false by useFactoryReset after a full factory reset.
   */
  isSimConfigured: false,

  /**
   * simulationEnded — Distinguishes "simulation finished naturally" from
   * "simulation paused mid-run".
   *
   * Set to true by ConveyorBelt Phase 2 when all tiles have drained after
   * the Work Order's tile count is reached (natural end-of-run).
   * While true, the Demo Settings close handlers will NOT call
   * setSimConfigured(true), keeping the Start gate locked.
   *
   * Cleared to false ONLY by useFactoryReset (the explicit Reset button),
   * which also clears isSimConfigured so the next run can be configured
   * fresh via Demo Settings.
   */
  simulationEnded: false,
} as const;

/** Cascade panel index for the CWF chat panel (indices 0–3 are taken by existing panels) */
export const CWF_PANEL_INDEX = 4;

// ═══════════════════════════════════════════════════════════════════
// CWF SIDE PANEL — Right-docked panel layout and resize config
// ═══════════════════════════════════════════════════════════════════

/** Default width of the CWF side panel when first opened (px) */
export const CWF_SIDE_PANEL_DEFAULT_WIDTH = 320
  ;
/** Minimum width the CWF side panel can be resized to (px) */
export const CWF_SIDE_PANEL_MIN_WIDTH = 300;
/** Maximum width the CWF side panel can be resized to (px) */
export const CWF_SIDE_PANEL_MAX_WIDTH = 700;
/** Width of the draggable resize handle hit-area on the left edge (px) */
export const CWF_SIDE_PANEL_HANDLE_WIDTH = 6;
/** Duration of the CWF side panel open/close slide animation (ms) */
export const CWF_SIDE_PANEL_ANIMATION_MS = 300;

// ═══════════════════════════════════════════════════════════════════
// DTXFR SIDE PANEL — Left-docked panel layout and resize config
// ═══════════════════════════════════════════════════════════════════

/** Default width of the DTXFR side panel when first opened (px) */
export const DTXFR_SIDE_PANEL_DEFAULT_WIDTH = 280;
/** Minimum width the DTXFR side panel can be resized to (px) */
export const DTXFR_SIDE_PANEL_MIN_WIDTH = 200;
/** Maximum width the DTXFR side panel can be resized to (px) */
export const DTXFR_SIDE_PANEL_MAX_WIDTH = 350;
/** Width of the draggable resize handle hit-area on the right edge (px) */
export const DTXFR_SIDE_PANEL_HANDLE_WIDTH = 6;

// ═══════════════════════════════════════════════════════════════════
// BASIC SIDE PANEL — Left-docked (right of DTXFR) KPI + Heatmap panel
// ═══════════════════════════════════════════════════════════════════

/** Default width of the Basic side panel when first opened (px) */
export const BASIC_SIDE_PANEL_DEFAULT_WIDTH = 280;
/** Minimum width the Basic side panel can be resized to (px) */
export const BASIC_SIDE_PANEL_MIN_WIDTH = 200;
/** Maximum width the Basic side panel can be resized to (px) */
export const BASIC_SIDE_PANEL_MAX_WIDTH = 400;
/** Width of the draggable resize handle hit-area on the right edge (px) */
export const BASIC_SIDE_PANEL_HANDLE_WIDTH = 6;

// ═══════════════════════════════════════════════════════════════════
// CWF UI CONFIG — Gradient and color configuration for the CWF panel
// ═══════════════════════════════════════════════════════════════════

/** 
 * CWF_UI_CONFIG 
 * 
 * Configuration object for the Chat With your Factory (CWF) panel styling.
 * Centralizes all visual parameters to avoid hard-coding in component logic.
 */
export const CWF_UI_CONFIG = {
  /** Background gradient classes for user message bubbles (Tailwind v4 syntax) */
  userBubbleGradient: 'bg-linear-to-br from-cyan-500/20 to-teal-500/20 border-cyan-500/30', // Gradient styling for user chat bubbles
  /** Background gradient classes for AI avatars and various UI boxes (Tailwind v4 syntax) */
  accentGradient: 'bg-linear-to-br from-cyan-500/30 to-teal-500/30 border-cyan-500/40', // Gradient styling for AI avatars and secondary UI elements
  /** Background gradient classes for the CWF panel header (Tailwind v4 syntax) */
  headerGradient: 'bg-linear-to-r from-cyan-500/10 to-teal-500/10', // Gradient styling for the panel header
  /** Background gradient classes for the main send button (Tailwind v4 syntax) */
  sendButtonGradient: 'bg-linear-to-br from-cyan-500 to-teal-500 hover:from-cyan-400 hover:to-teal-400', // Gradient and hover state for the send button
  /** Primary accent color used for icons and indicators (Cyan-400) */
  accentColor: 'text-cyan-400', // Primary accent color token 
  /** Secondary accent color used for subtle highlights (Cyan-300) */
  subtleAccentColor: 'text-cyan-300', // Secondary accent color token
  /** Standard font size for all chat messages and input (matches text entry) */
  messageFontSize: 'text-base', // Font size token for body text
  /** Font size for inline code spans — inherits from parent so code matches body text */
  codeFontSize: 'text-[length:inherit]', // Ensures `code` blocks are same size as surrounding text
} as const; // Export as read-only constant for type safety

