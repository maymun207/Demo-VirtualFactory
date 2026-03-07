/**
 * useDraggablePanel.ts — Shared Drag & Resize Behavior for Floating Panels
 *
 * Provides position, size, and mouse/touch event handlers for any floating
 * panel (TilePassport, KPIContainer, DefectHeatmap). Panels are
 * positioned with a cascade layout (each subsequent panel offset to
 * the right) and are kept within safe viewport bounds at all times.
 *
 * Architecture:
 *  - Uses TOP/LEFT absolute positioning for header clearance.
 *  - Each panel receives a `panelIndex` (0, 1, 2) for cascade layout.
 *  - Clamping prevents panels from overlapping the header or leaving viewport.
 *  - On mobile (<640px), panels stack vertically at full viewport width.
 *  - Resize is optional (controlled via `resizable` parameter).
 *  - Full touch support: touchstart/touchmove/touchend mirror mouse events.
 *    Touch events use { passive: false } to block page scroll while dragging.
 *
 * Used by: DraggablePanel.tsx (which wraps TilePassport, KPIContainer, DefectHeatmap)
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
} from '../lib/params';

// ─── Types ───────────────────────────────────────────────────────────────────

/** CSS top/left position of a panel in pixels */
interface PanelPosition {
  /** Distance from viewport top edge (px) */
  top: number;
  /** Distance from viewport left edge (px) */
  left: number;
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
 * Clamp a panel's position to keep it within the safe viewport area.
 * Ensures the panel never overlaps the header or exits the screen edges.
 *
 * Uses dynamic header height detection so panels always clear the full
 * header (including Row 2 info strip) at any viewport size.
 *
 * @param top        - Desired top position (px)
 * @param left       - Desired left position (px)
 * @param panelWidth - Current panel width (px), used for right-edge clamping
 * @returns Clamped {top, left} position
 */
const clampPosition = (
  top: number,
  left: number,
  panelWidth: number,
): PanelPosition => {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  /** Dynamic minimum top: always clear the full header */
  const minTop = getHeaderBottom();

  return {
    top: Math.max(minTop, Math.min(top, vh - PANEL_BOTTOM_CLEARANCE)),
    left: Math.max(PANEL_EDGE_MARGIN, Math.min(left, vw - panelWidth - PANEL_EDGE_MARGIN)),
  };
};

/**
 * Compute the default cascade position for a panel based on its index.
 *
 * Three layout modes:
 *  1. NARROW (viewport width < PANEL_MOBILE_BREAKPOINT):
 *     Panels are stacked vertically, dividing the available vertical space
 *     into PANEL_MAX_SLOTS equal slots. Each panel takes one slot.
 *     Width = full viewport minus margins. Height = slot height.
 *     This auto-arranges panels so they're all visible simultaneously,
 *     exactly like the user manually arranging them in cramped viewports.
 *
 *  2. COMPACT (width is enough but cascade would cause overflow):
 *     Panels use viewport-proportional cascade width and panel width.
 *     If cascade exceeds viewport, wraps with downward shift.
 *
 *  3. WIDE (normal desktop):
 *     Full cascade with default panel widths.
 *
 * @param panelIndex - 0-based index determining cascade position
 * @returns Default {position, width, height?} for the panel
 */
const getDefaultPosition = (panelIndex: number): {
  position: PanelPosition;
  width: number;
  height?: number;
} => {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const isNarrow = vw < PANEL_MOBILE_BREAKPOINT;
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
     * Width: capped to natural panel width (never wider than needed).
     * Height: slotHeight (content scrolls internally).
     */
    const bottomMargin = PANEL_EDGE_MARGIN;
    const availableHeight = vh - headerBottom - bottomMargin;
    const totalGaps = (PANEL_MAX_SLOTS - 1) * PANEL_STACK_GAP;
    const slotHeight = Math.max(
      PANEL_MIN_HEIGHT,
      Math.floor((availableHeight - totalGaps) / PANEL_MAX_SLOTS),
    );
    /**
     * Panel width: use the default compact width, but never exceed
     * the available viewport width. This prevents the panel from
     * stretching edge-to-edge and pushing content apart unnaturally.
     */
    const maxAvailableWidth = vw - PANEL_EDGE_MARGIN * 2;
    const panelWidth = Math.min(maxAvailableWidth, PANEL_DEFAULT_WIDTH);

    return {
      position: {
        top: headerBottom + panelIndex * (slotHeight + PANEL_STACK_GAP),
        left: PANEL_EDGE_MARGIN,
      },
      width: panelWidth,
      height: slotHeight,
    };
  }

  /**
   * END-OF-RUN LAYOUT — Edge-to-edge panel positioning.
   *
   * Panels sit in a fixed column order so each panel's left edge exactly
   * meets the prior panel's right edge (plus a 2-px visual gap).
   * Using panelWidth-based arithmetic means the layout is correct at any
   * viewport width without trial-and-error ratio tuning.
   *
   * Column order (left → right):
   *   col 0: Passport      (panelIndex 0) — top-left, anchored at headerBottom
   *   col 1: FTQ Heatmap   (panelIndex 2) — bottom row, immediately right of Passport
   *   col 2: KPI Panel     (panelIndex 1) — bottom row, immediately right of FTQ
   *   col 3: Control       (panelIndex 3) — bottom row, immediately right of KPI
   */

  /** Panel width: scale with viewport but never exceed PANEL_DEFAULT_WIDTH */
  const ratio = Math.max(0.5, vw / 1440);
  const panelWidth = Math.max(PANEL_MIN_WIDTH, Math.min(PANEL_DEFAULT_WIDTH, Math.round(PANEL_DEFAULT_WIDTH * ratio)));

  /** 2-px gap between adjacent panels so borders remain distinguishable */
  const PANEL_GAP = 2;

  /** Column index per panelIndex — determines horizontal slot */
  const COLUMN_OF: Record<number, number> = {
    0: 0, // Passport  → leftmost column (top anchor)
    2: 1, // FTQ       → second column (right of Passport)
    1: 2, // KPI       → third column (right of FTQ)
    3: 3, // Control   → fourth column (right of KPI)
  };
  const col = COLUMN_OF[panelIndex] ?? panelIndex;

  /** Each column starts at: left-margin + col × (panelWidth + gap) */
  const desiredLeft = PANEL_EDGE_MARGIN + col * (panelWidth + PANEL_GAP);

  /**
   * Passport (panelIndex 0) stays pinned to headerBottom — top-left.
   * All other panels open at 63% of viewport height (lower half).
   */
  const desiredTop = panelIndex === 0 ? headerBottom : Math.round(vh * 0.63);

  return {
    position: clampPosition(desiredTop, desiredLeft, panelWidth),
    width: panelWidth,
    /** No forced height — panels grow to fit content (auto) */
  };
};

// ─── Hook ────────────────────────────────────────────────────────────────────

/**
 * Custom hook providing drag-and-resize behavior for floating panels.
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
  const defaults = getDefaultPosition(panelIndex);
  const [position, setPosition] = useState<PanelPosition>(defaults.position);
  const [width, setWidth] = useState<number>(defaults.width);
  /** Height may be set by narrow-mode auto-stacking or user resize */
  const [height, setHeight] = useState<number | undefined>(defaults.height);

  /** True while user is actively dragging the panel */
  const isDragging = useRef(false);
  /** True while user is actively resizing the panel */
  const isResizing = useRef(false);
  /** Mouse offset from panel's top-left corner at drag start */
  const dragOffset = useRef({ x: 0, y: 0 });
  /** Mouse position and panel dimensions at resize start */
  const resizeStart = useRef({ x: 0, y: 0, w: 0, h: 0 });

  // ── Recalculate default position when window resizes ─────────
  useEffect(() => {
    const handleResize = () => {
      // Only recompute if user isn't actively interacting
      if (!isDragging.current && !isResizing.current) {
        const fresh = getDefaultPosition(panelIndex);
        setPosition(fresh.position);
        setWidth(fresh.width);
        /** Apply computed height from auto-stack (narrow) or reset to auto (wide) */
        setHeight(fresh.height);
      }
    };

    window.addEventListener('resize', handleResize);

    /**
     * Delayed initial recalculation: at mount time the useState
     * initializer may have used the PANEL_HEADER_CLEARANCE fallback
     * because the header DOM wasn't painted yet. Wait one animation
     * frame so the browser has laid out the header, then re-measure
     * to get the real header height and position panels below it.
     */
    const rafId = requestAnimationFrame(() => handleResize());

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(rafId);
    };
  }, [panelIndex]);

  // ── Global mouse + touch listeners for drag and resize ───────
  useEffect(() => {
    /** Unified handler: move panel position based on pointer coordinates. */
    const handlePointerMove = (clientX: number, clientY: number) => {
      if (isDragging.current) {
        /** Calculate new position from pointer offset. */
        const rawTop = clientY - dragOffset.current.y;
        const rawLeft = clientX - dragOffset.current.x;
        setPosition(clampPosition(rawTop, rawLeft, width));
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
