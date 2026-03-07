/**
 * DraggablePanel.tsx — Shared Floating Panel Wrapper
 *
 * A reusable container for draggable/resizable overlay panels.
 * Provides consistent behavior across TilePassport, KPIContainer,
 * and DefectHeatmap panels:
 *  - Drag handle with title text and close button
 *  - Position/size management via useDraggablePanel hook
 *  - Optional resize handle (bottom-right corner)
 *  - Cascade positioning based on panelIndex
 *  - Clamped to viewport boundaries
 *  - Full touch support for mobile devices (drag + resize)
 *
 * Eliminates duplicated drag/resize/container patterns across panels.
 * Used by: TilePassport, KPIContainer, DefectHeatmap
 */
import type { ReactNode } from "react";
import { useDraggablePanel } from "../../hooks/useDraggablePanel";

interface DraggablePanelProps {
  /** Panel index for cascade positioning (0, 1, 2, ...) */
  panelIndex: number;
  /** Panel title displayed in the drag handle */
  title: string;
  /** Whether the panel is visible */
  visible: boolean;
  /** Callback to toggle visibility (close button) */
  onClose: () => void;
  /** Panel content */
  children: ReactNode;
  /** Whether the panel is resizable (default: true) */
  resizable?: boolean;
}

export const DraggablePanel = ({
  panelIndex,
  title,
  visible,
  onClose,
  children,
  resizable = true,
}: DraggablePanelProps) => {
  const {
    position,
    width,
    height,
    handleMouseDown,
    handleResizeMouseDown,
    handleTouchStart,
    handleResizeTouchStart,
    fontScale,
  } = useDraggablePanel(panelIndex, resizable);

  if (!visible) return null;

  return (
    <div
      className="fixed z-[60] bg-black/95 border border-emerald-500/30 rounded-xl text-white shadow-2xl backdrop-blur-xl flex flex-col"
      data-resizable={resizable || undefined}
      style={{
        top: position.top,
        left: position.left,
        width,
        height: height ?? "auto",
        maxWidth: "90vw",
        /** Cap panel height to 80% of viewport so content scrolls
         *  instead of overflowing the window at small sizes / high zoom. */
        maxHeight: height ? undefined : "80vh",
        /* overflow hidden keeps the resize handle anchored at the corner
         * regardless of how far the inner content is scrolled. */
        overflow: "hidden",
      }}
    >
      {/* Drag Handle — fixed at top, outside the scroll area */}
      <div
        className="cursor-move shrink-0 text-xs text-emerald-400/80 select-none border-b border-emerald-500/20 flex justify-between items-center transition-colors hover:bg-white/5 hover:text-emerald-300 rounded-t-xl px-4 pt-3 pb-2"
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
      >
        <div className="flex items-center gap-2 font-medium tracking-wide">
          <span className="opacity-50 text-[10px]">⠿</span>
          {title}
        </div>
        <button
          onClick={onClose}
          className="text-white/40 hover:text-white p-1 rounded-md hover:bg-white/10 transition-colors"
        >
          ✕
        </button>
      </div>

      {/* Scrollable content area — grows to fill available height.
       *  CSS 'zoom' scales ALL visual content proportionally (text, spacing,
       *  borders) regardless of CSS unit (rem, px, em). This is critical
       *  because Tailwind classes use rem which ignores parent fontSize. */}
      <div
        className="flex-1 overflow-y-auto"
        style={{
          maxHeight: height ? undefined : "calc(100vh - 220px)",
          zoom: fontScale,
        }}
      >
        {children}
      </div>

      {/* Resize Handle — lives OUTSIDE the scroll container so it never scrolls away */}
      {resizable && (
        <div
          className="absolute bottom-0 right-0 w-5 h-5 cursor-nwse-resize flex items-end justify-end pr-1 pb-1 text-emerald-500/40 hover:text-emerald-400/80 select-none"
          onMouseDown={handleResizeMouseDown}
          onTouchStart={handleResizeTouchStart}
        >
          <svg width="10" height="10" viewBox="0 0 10 10">
            <path
              d="M9 1L1 9M9 5L5 9M9 9L9 9"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </div>
      )}
    </div>
  );
};
