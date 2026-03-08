/**
 * useDraggablePanel.ts — Shared Drag & Resize Behavior for Floating Panels
 *
 * Provides position, size, and mouse/touch event handlers for any floating
 * panel (TilePassport, KPIContainer, DefectHeatmap, ControlPanel). Panels are
 * positioned with a cascade layout (each subsequent panel offset to
 * the right) and are kept within safe viewport bounds at all times.
 *
 * Architecture:
 *  - Uses TOP/LEFT absolute positioning for header clearance.
 *  - Each panel receives a `panelIndex` (0, 1, 2, 3) for cascade layout.
 *  - Clamping prevents panels from overlapping the header or leaving viewport.
 *  - On mobile (<640px), panels stack vertically at full content-area width.
 *  - Resize is optional (controlled via `resizable` parameter).
 *  - Full touch support: touchstart/touchmove/touchend mirror mouse events.
 *    Touch events use { passive: false } to block page scroll while dragging.
 *
 * --- Content-Area-Aware Positioning (Fix 3) ---
 *  Docked side panels (CWF on the right, DTXFR and Basic on the left) reduce
 *  the visible content area. All position calculations now use the effective
 *  content boundaries (contentLeft … contentRight) so that floating panels
 *  always cascade inside the visible area, never behind a side panel.
 *
 *  computeContentArea() reads the live uiStore state to derive these bounds.
 *  The hook subscribes to the relevant uiStore fields so that any panel
 *  change (open/close, resize) automatically triggers a recompute — exactly
 *  the same as a window resize does.
 *
 * Used by: DraggablePanel.tsx (which wraps TilePassport, KPIContainer,
 *          DefectHeatmap, ControlPanel)
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import {
  PANEL_HEADER_CLEARANCE,
  PANEL_DEFAULT_WIDTH,
  PANEL_DEFAULT_HEIGHT,
  PANEL_EDGE_MARGIN,
  PANEL_BOTTOM_CLEARANCE,
  PANEL_MIN_WIDTH,
  PANEL_MAX_WIDTH,
  PANEL_MIN_HEIGHT,
  PANEL_MAX_HEIGHT_RATIO,
  PANEL_MOBILE_BREAKPOINT,
  CONTROL_PANEL_GAP,
  PANEL_MAX_SLOTS,
  PANEL_STACK_GAP,
  PANEL_FONT_SCALE_MIN,
  PANEL_FONT_SCALE_MAX,
  PANEL_FONT_SCALE_EXPONENT,
  PANEL_GAP,
  PANEL_SIDE_REFLOW_DELAY_MS,
} from '../lib/params';
import { useUIStore } from '../store/uiStore';

// ─── Types ───────────────────────────────────────────────────────────────────

/** CSS top/left position of a panel in pixels */
interface PanelPosition {
  /** Distance from viewport top edge (px) */
  top: number;
  /** Distance from viewport left edge (px) */
  left: number;
}

/** Effective left/right pixel boundaries of the visible content area */
interface ContentArea {
  /** Left edge (px from viewport left) — accounts for DTXFR + Basic panels */
  contentLeft: number;
  /** Right edge (px from viewport left) — accounts for CWF panel */
  contentRight: number;
}

/** Return value of useDraggablePanel hook */
interface DraggablePanelResult {
  /** Current position of the panel */
  position: PanelPosition;
  /** Current width of the panel (px) */
  width: number;
  /** Current height (px), or undefined for "auto" height (content-driven) */
  height: number | undefined;
  /** Attach to the drag handle's onMouseDown */
  handleMouseDown: (e: React.MouseEvent) => void;
  /** Attach to the resize handle's onMouseDown */
  handleResizeMouseDown: (e: React.MouseEvent) => void;
  /** Attach to the drag handle's onTouchStart for mobile devices */
  handleTouchStart: (e: React.TouchEvent) => void;
  /** Attach to the resize handle's onTouchStart for mobile devices */
  handleResizeTouchStart: (e: React.TouchEvent) => void;
  /** Whether resize is enabled for this panel */
  isResizable: boolean;
  /** Proportional font scale factor based on current width vs default width.
   *  1.0 at PANEL_DEFAULT_WIDTH, clamped between PANEL_FONT_SCALE_MIN and MAX. */
  fontScale: number;
}

// ─── Content-Area Helper ─────────────────────────────────────────────────────

/**
 * computeContentArea — Derive content-area boundaries from live side-panel state.
 *
 * Reads the uiStore directly via getState() (NOT a hook) so it is safe to call
 * from event handlers and resize callbacks outside of render cycles.
 *
 * Left boundary  = width of DTXFR panel (if open) + width of Basic panel (if open).
 * Right boundary = window.innerWidth − width of CWF panel (if open).
 *
 * Floating panels must be positioned and clamped within [contentLeft … contentRight]
 * so they never slide behind a docked side panel.
 *
 * @returns {ContentArea} The current content-area pixel boundaries.
 */
function computeContentArea(): ContentArea {
  const s = useUIStore.getState();
  /** Sum of all left-docked side-panel widths currently visible */
  const contentLeft =
    (s.showDTXFR ? s.dtxfrPanelWidth : 0) +
    (s.showBasicPanel ? s.basicPanelWidth : 0);
  /** Right boundary: full viewport width minus the CWF right-docked panel */
  const contentRight = window.innerWidth - (s.showCWF ? s.cwfPanelWidth : 0);
  return { contentLeft, contentRight };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Read the actual header height from the DOM element with id="header-container".
 * Falls back to the static PANEL_HEADER_CLEARANCE constant if the element
 * is not found (e.g. during SSR or before first render).
 *
 * This is critical for the 2-row responsive header: the header height changes
 * dynamically as buttons wrap at narrow viewports, so a fixed pixel constant
 * cannot guarantee panels clear the header.
 */
const getHeaderBottom = (): number => {
  const header = document.getElementById('header-container');
  if (header) {
    /** getBoundingClientRect().bottom gives the actual pixel position of the
     *  header's bottom edge, accounting for any wrapping / multi-row layout. */
    return header.getBoundingClientRect().bottom + CONTROL_PANEL_GAP;
  }
  /** Fallback: use the static constant (works when header hasn't rendered yet) */
  return PANEL_HEADER_CLEARANCE;
};

/**
 * clampPosition — Clamp a floating panel's position to the visible content area.
 *
 * Ensures the panel never overlaps the header, exits the screen edges, or slides
 * behind a docked side panel. Unlike the previous version, this now receives
 * explicit contentLeft / contentRight bounds instead of using window.innerWidth.
 *
 * @param top          - Desired top position (px from viewport top)
 * @param left         - Desired left position (px from viewport left)
 * @param panelWidth   - Current panel width (px), used for right-edge clamping
 * @param contentLeft  - Left boundary of the visible content area (px)
 * @param contentRight - Right boundary of the visible content area (px)
 * @returns Clamped {top, left} position guaranteed to be within visible area
 */
const clampPosition = (
  top: number,
  left: number,
  panelWidth: number,
  contentLeft: number,
  contentRight: number,
): PanelPosition => {
  const vh = window.innerHeight;
  /** Dynamic minimum top: always clear the full header */
  const minTop = getHeaderBottom();
  return {
    top: Math.max(minTop, Math.min(top, vh - PANEL_BOTTOM_CLEARANCE)),
    /** Keep within content area, with PANEL_EDGE_MARGIN padding on each side */
    left: Math.max(
      contentLeft + PANEL_EDGE_MARGIN,
      Math.min(contentRight - panelWidth - PANEL_EDGE_MARGIN, left),
    ),
  };
};

/**
 * getDefaultPosition — Compute the default cascade position for a panel.
 *
 * All measurements are now relative to the effective content area
 * (contentLeft … contentRight) rather than the raw viewport width.
 * This ensures panels cascade inside the visible region even when side
 * panels are docked on the left (DTXFR, Basic) or right (CWF).
 *
 * Three layout modes:
 *  1. NARROW (effective width < PANEL_MOBILE_BREAKPOINT):
 *     Panels are stacked vertically within the content area.
 *
 *  2. WIDE (default desktop):
 *     Full cascade with PANEL_GAP separation, left-to-right within the
 *     content area. COLUMN_OF maps panelIndex → column slot.
 *
 * @param panelIndex   - 0-based index determining cascade position
 * @param contentLeft  - Left boundary of the visible content area (px)
 * @param contentRight - Right boundary of the visible content area (px)
 * @returns Default {position, width, height?} for the panel
 */
const getDefaultPosition = (
  panelIndex: number,
  contentLeft: number,
  contentRight: number,
): {
  position: PanelPosition;
  width: number;
  height?: number;
} => {
  const vh = window.innerHeight;
  /** Effective visible width available between side panels */
  const effectiveWidth = Math.max(0, contentRight - contentLeft);
  const isNarrow = effectiveWidth < PANEL_MOBILE_BREAKPOINT;
  /** Dynamic header bottom — adapts to 2-row header and viewport size */
  const headerBottom = getHeaderBottom();

  if (isNarrow) {
    /**
     * NARROW MODE — Vertical Auto-Stack:
     * Divide the available vertical space below the header into
     * PANEL_MAX_SLOTS equal slots. Each panel occupies one slot.
     *
     * Available height = viewport height - header bottom - bottom margin.
     * Slot height     = (available height - gaps between slots) / MAX_SLOTS.
     *
     * Position: panel N starts at headerBottom + N * (slotHeight + gap).
     * Left:     contentLeft + PANEL_EDGE_MARGIN (starts at content area edge).
     * Width:    capped to PANEL_DEFAULT_WIDTH but never wider than content area.
     * Height:   slotHeight (content scrolls internally).
     */
    const bottomMargin = PANEL_EDGE_MARGIN;
    const availableHeight = vh - headerBottom - bottomMargin;
    const totalGaps = (PANEL_MAX_SLOTS - 1) * PANEL_STACK_GAP;
    const slotHeight = Math.max(
      PANEL_MIN_HEIGHT,
      Math.floor((availableHeight - totalGaps) / PANEL_MAX_SLOTS),
    );
    /** Panel width: never exceed the available content-area width */
    const maxAvailableWidth = effectiveWidth - PANEL_EDGE_MARGIN * 2;
    const panelWidth = Math.min(maxAvailableWidth, PANEL_DEFAULT_WIDTH);

    return {
      position: {
        top: headerBottom + panelIndex * (slotHeight + PANEL_STACK_GAP),
        /** Pinned to the left edge of the content area */
        left: contentLeft + PANEL_EDGE_MARGIN,
      },
      width: panelWidth,
      height: slotHeight,
    };
  }

  /**
   * WIDE MODE — Content-area cascade layout.
   *
   * Panels sit in a fixed column order so each panel's left edge exactly
   * meets the prior panel's right edge (plus PANEL_GAP visual separation).
   *
   * Column order (left → right within the content area):
   *   col 0: Passport      (panelIndex 0) — top-left, anchored at headerBottom
   *   col 1: FTQ Heatmap   (panelIndex 2) — bottom row, immediately right of Passport
   *   col 2: KPI Panel     (panelIndex 1) — bottom row, immediately right of FTQ
   *   col 3: Control       (panelIndex 3) — bottom row, immediately right of KPI
   *
   * The cascade origin is contentLeft (not viewport left = 0), so panels
   * correctly clear any open DTXFR / Basic panels on the left.
   * The right-edge clamp uses contentRight, so panels never slide under
   * an open CWF panel.
   */

  /** Panel width: scale with effective width but never exceed PANEL_DEFAULT_WIDTH */
  const ratio = Math.max(0.5, effectiveWidth / 1440);
  const panelWidth = Math.max(PANEL_MIN_WIDTH, Math.min(PANEL_DEFAULT_WIDTH, Math.round(PANEL_DEFAULT_WIDTH * ratio)));

  /** Column index per panelIndex — determines horizontal slot within content area */
  const COLUMN_OF: Record<number, number> = {
    0: 0, // Passport  → leftmost column (top anchor)
    2: 1, // FTQ       → second column (right of Passport)
    1: 2, // KPI       → third column (right of FTQ)
    3: 3, // Control   → fourth column (right of KPI)
  };
  const col = COLUMN_OF[panelIndex] ?? panelIndex;

  /**
   * Each column starts at: contentLeft + PANEL_EDGE_MARGIN + col × (panelWidth + PANEL_GAP).
   *
   * PANEL_GAP (2px) separates panel borders visually.
   * Offsetting by contentLeft ensures cascading starts inside the visible area.
   */
  const desiredLeft = contentLeft + PANEL_EDGE_MARGIN + col * (panelWidth + PANEL_GAP);

  /**
   * Passport (panelIndex 0) stays pinned to headerBottom — top-left.
   * All other panels open at 63% of viewport height (lower half).
   */
  const desiredTop = panelIndex === 0 ? headerBottom : Math.round(vh * 0.63);

  return {
    position: clampPosition(desiredTop, desiredLeft, panelWidth, contentLeft, contentRight),
    width: panelWidth,
    /** No forced height — panels grow to fit content (auto) */
  };
};

// ─── Hook ────────────────────────────────────────────────────────────────────

/**
 * useDraggablePanel — Content-area-aware drag & resize hook for floating panels.
 *
 * Subscribes to the uiStore side-panel state (CWF, DTXFR, Basic) so that
 * whenever a side panel is opened, closed, or resized, this hook recomputes
 * the floating panel's default position to stay within the now-updated visible
 * content area. The recompute logic is identical to the existing window-resize
 * handler so behaviour is consistent across both triggers.
 *
 * @param panelIndex - 0-based index for cascade positioning (0=leftmost)
 * @param resizable  - Whether the panel supports user resizing (default: false)
 * @returns {DraggablePanelResult} Position, size, and event handlers
 *
 * @example
 * ```tsx
 * const { position, width, height, handleMouseDown, handleResizeMouseDown } =
 *   useDraggablePanel(0, true);
 *
 * <div style={{ top: position.top, left: position.left, width }}>
 *   <div onMouseDown={handleMouseDown}>Drag Handle</div>
 *   <div onMouseDown={handleResizeMouseDown}>↘</div>
 * </div>
 * ```
 */
export function useDraggablePanel(panelIndex: number, resizable = false): DraggablePanelResult {
  // ── Side-panel subscriptions for reactive recomputation ───────────────────
  /**
   * Subscribe to each dimension that affects the content area.
   * When any of these change, a useEffect below triggers a position recompute
   * — the same behaviour as a window resize — to keep the panel visible.
   */
  /** Whether the CWF right-docked panel is currently open */
  const cwfOpen = useUIStore((s) => s.showCWF);
  /** Current pixel width of the CWF side panel */
  const cwfWidth = useUIStore((s) => s.cwfPanelWidth);
  /** Whether the DTXFR left-docked panel is currently open */
  const dtxfrOpen = useUIStore((s) => s.showDTXFR);
  /** Current pixel width of the DTXFR side panel */
  const dtxfrWidth = useUIStore((s) => s.dtxfrPanelWidth);
  /** Whether the Basic left-docked panel is currently open */
  const basicOpen = useUIStore((s) => s.showBasicPanel);
  /** Current pixel width of the Basic side panel */
  const basicWidth = useUIStore((s) => s.basicPanelWidth);

  // ── Position state — initialised with content-area-aware defaults ─────────
  /** Compute content area once at mount time to seed useState */
  const initArea = computeContentArea();
  const initDefaults = getDefaultPosition(panelIndex, initArea.contentLeft, initArea.contentRight);

  /** Current top/left position of the floating panel */
  const [position, setPosition] = useState<PanelPosition>(initDefaults.position);
  /** Current width of the panel (px) */
  const [width, setWidth] = useState<number>(initDefaults.width);
  /** Height may be set by narrow-mode auto-stacking or user resize */
  const [height, setHeight] = useState<number | undefined>(initDefaults.height);

  // ── Drag/resize refs ──────────────────────────────────────────────────────
  /** True while user is actively dragging the panel */
  const isDragging = useRef(false);
  /** True while user is actively resizing the panel */
  const isResizing = useRef(false);
  /** Mouse offset from panel's top-left corner at drag start */
  const dragOffset = useRef({ x: 0, y: 0 });
  /** Mouse position and panel dimensions at resize start */
  const resizeStart = useRef({ x: 0, y: 0, w: 0, h: 0 });

  /**
   * contentAreaRef — keeps event handlers always synchronised with the latest
   * content area without needing them as effect dependencies.
   * Updated by every recompute (resize handler or side-panel change effect).
   */
  const contentAreaRef = useRef<ContentArea>(initArea);

  // ── Recompute helper ──────────────────────────────────────────────────────
  /**
   * recomputeDefaults — Recompute and apply the default panel position/size.
   *
   * Guards against recomputing while the user is interacting (dragging/resizing),
   * to avoid fighting the user's hand. Updates contentAreaRef so that drag
   * clamping in handlePointerMove uses the latest content boundaries.
   *
   * Called by:
   *  a) The window 'resize' event listener.
   *  b) The side-panel-change useEffect.
   */
  const recomputeDefaults = useCallback(() => {
    /** Skip recompute while user is actively interacting with the panel */
    if (isDragging.current || isResizing.current) return;
    const area = computeContentArea();
    /** Always refresh the ref so event handlers use fresh boundaries */
    contentAreaRef.current = area;
    const fresh = getDefaultPosition(panelIndex, area.contentLeft, area.contentRight);
    setPosition(fresh.position);
    setWidth(fresh.width);
    setHeight(fresh.height);
  }, [panelIndex]);

  // ── Effect 1: Recompute on window resize ───────────────────────────────────
  /**
   * Recalculate default position whenever the browser window is resized.
   * Also fires once after the first animation frame (to pick up the real header
   * height after the DOM has been laid out — the useState initialiser above may
   * use PANEL_HEADER_CLEARANCE as a fallback before the header element exists).
   */
  useEffect(() => {
    /** Attach to window resize so panels track viewport changes */
    window.addEventListener('resize', recomputeDefaults);

    /**
     * Delayed initial recalculation: at mount time the useState
     * initialiser may have used PANEL_HEADER_CLEARANCE because the header
     * DOM wasn't painted yet. Wait one animation frame so the browser has
     * laid out the header, then re-measure.
     */
    const rafId = requestAnimationFrame(recomputeDefaults);

    return () => {
      window.removeEventListener('resize', recomputeDefaults);
      cancelAnimationFrame(rafId);
    };
  }, [recomputeDefaults]);

  // ── Effect 2: Recompute on side-panel open / close / resize ──────────────
  /**
   * Trigger a full position recompute whenever any docked side panel changes.
   * This is the core of Fix 3 — without this effect, panels positioned at
   * their default cascade positions remain at those coordinates even as the
   * visible content area shrinks or shifts, hiding them behind side panels.
   *
   * Dependencies:
   *   cwfOpen, cwfWidth   — CWF right-docked panel
   *   dtxfrOpen, dtxfrWidth — DTXFR left-docked panel
   *   basicOpen, basicWidth — Basic left-docked panel
   *
   * PANEL_SIDE_REFLOW_DELAY_MS controls whether reposition is immediate (0)
   * or waits for the side-panel slide animation to complete.
   */
  useEffect(() => {
    if (PANEL_SIDE_REFLOW_DELAY_MS === 0) {
      /** Immediate reposition — panels move simultaneously with side panels */
      recomputeDefaults();
    } else {
      /** Delayed reposition — waits for slide animation to settle */
      const timer = setTimeout(recomputeDefaults, PANEL_SIDE_REFLOW_DELAY_MS);
      return () => clearTimeout(timer);
    }
  }, [cwfOpen, cwfWidth, dtxfrOpen, dtxfrWidth, basicOpen, basicWidth, recomputeDefaults]);

  // ── Global mouse + touch listeners for drag and resize ───────────────────
  useEffect(() => {
    /** Unified handler: move panel position based on pointer coordinates. */
    const handlePointerMove = (clientX: number, clientY: number) => {
      if (isDragging.current) {
        /** Calculate new position from pointer offset. */
        const rawTop = clientY - dragOffset.current.y;
        const rawLeft = clientX - dragOffset.current.x;
        /** Clamp within the current content area (reads from ref — always fresh) */
        const { contentLeft, contentRight } = contentAreaRef.current;
        setPosition(clampPosition(rawTop, rawLeft, width, contentLeft, contentRight));
      } else if (isResizing.current) {
        /** Calculate new dimensions from pointer delta. */
        const dx = clientX - resizeStart.current.x;
        const dy = clientY - resizeStart.current.y;
        const maxHeight = window.innerHeight * PANEL_MAX_HEIGHT_RATIO;
        setWidth(Math.max(PANEL_MIN_WIDTH, Math.min(PANEL_MAX_WIDTH, resizeStart.current.w + dx)));
        setHeight(Math.max(PANEL_MIN_HEIGHT, Math.min(maxHeight, resizeStart.current.h + dy)));
      }
    };

    /** Mouse move handler delegates to the unified pointer-move logic. */
    const handleMouseMove = (e: MouseEvent) => {
      handlePointerMove(e.clientX, e.clientY);
    };

    /** Touch move handler: uses the first touch point and prevents page scroll. */
    const handleTouchMove = (e: TouchEvent) => {
      if (!isDragging.current && !isResizing.current) return;
      /** Prevent page scroll while dragging/resizing a panel. */
      e.preventDefault();
      const touch = e.touches[0];
      handlePointerMove(touch.clientX, touch.clientY);
    };

    /** End drag/resize on mouse-up or touch-end. */
    const handlePointerUp = () => {
      isDragging.current = false;
      isResizing.current = false;
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handlePointerUp);
    /** passive: false is required so we can call preventDefault() in touchmove. */
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handlePointerUp);
    document.addEventListener('touchcancel', handlePointerUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handlePointerUp);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handlePointerUp);
      document.removeEventListener('touchcancel', handlePointerUp);
    };
  }, [width]);

  /**
   * Start dragging: record mouse offset from panel's top-left corner.
   * Attached to the drag handle element's onMouseDown.
   */
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    isDragging.current = true;
    dragOffset.current = {
      x: e.clientX - position.left,
      y: e.clientY - position.top,
    };
  }, [position.left, position.top]);

  /**
   * Start dragging via touch: uses the first touch point.
   * Attached to the drag handle element's onTouchStart.
   */
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    isDragging.current = true;
    const touch = e.touches[0];
    dragOffset.current = {
      x: touch.clientX - position.left,
      y: touch.clientY - position.top,
    };
  }, [position.left, position.top]);

  /**
   * Start resizing: record initial mouse position and panel dimensions.
   * Attached to the resize handle element's onMouseDown.
   */
  const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    isResizing.current = true;
    const el = (e.target as HTMLElement).closest('[data-resizable]') as HTMLElement | null;
    resizeStart.current = {
      x: e.clientX,
      y: e.clientY,
      w: width,
      h: el?.offsetHeight ?? height ?? 300,
    };
  }, [width, height]);

  /**
   * Start resizing via touch: uses the first touch point.
   * Attached to the resize handle element's onTouchStart.
   */
  const handleResizeTouchStart = useCallback((e: React.TouchEvent) => {
    e.stopPropagation();
    isResizing.current = true;
    const touch = e.touches[0];
    const el = (e.target as HTMLElement).closest('[data-resizable]') as HTMLElement | null;
    resizeStart.current = {
      x: touch.clientX,
      y: touch.clientY,
      w: width,
      h: el?.offsetHeight ?? height ?? 300,
    };
  }, [width, height]);

  /** Compute font scale ratio from both width AND height relative to defaults.
   *  Uses (widthRatio × heightRatio) raised to PANEL_FONT_SCALE_EXPONENT
   *  so resizing in either direction causes proportional font scaling.
   *  Exponent of 0.75 gives steeper growth than geometric mean (0.5).
   *  When height is undefined (auto mode), uses width-only scaling.
   *  Clamped between MIN and MAX to keep text readable. */
  const widthRatio = width / PANEL_DEFAULT_WIDTH;
  const fontScale = (() => {
    if (height !== undefined) {
      /** Panel has an explicit height (user resized or narrow-mode auto-stack) */
      const heightRatio = height / PANEL_DEFAULT_HEIGHT;
      return Math.max(
        PANEL_FONT_SCALE_MIN,
        Math.min(PANEL_FONT_SCALE_MAX, Math.pow(widthRatio * heightRatio, PANEL_FONT_SCALE_EXPONENT)),
      );
    }
    /** Auto-height mode: scale based on width only */
    return Math.max(
      PANEL_FONT_SCALE_MIN,
      Math.min(PANEL_FONT_SCALE_MAX, widthRatio),
    );
  })();

  return {
    position,
    width,
    height,
    handleMouseDown,
    handleResizeMouseDown,
    handleTouchStart,
    handleResizeTouchStart,
    isResizable: resizable,
    fontScale,
  };
}
