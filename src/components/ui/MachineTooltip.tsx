/**
 * MachineTooltip.tsx — Responsive Machine Hover Tooltip Overlay
 *
 * A floating HTML overlay that appears when hovering over a factory station
 * in the 3D scene. Displays a parameter table via MachineTooltipContent.
 *
 * Responsiveness:
 *  - Uses CSS clamp() for font/padding scaling
 *  - Viewport-aware positioning: auto-flips when near screen edges
 *  - Listens to window resize and repositions accordingly
 *  - Max width/height constrained by viewport percentages
 *  - Smooth fade + slide animation on enter/exit
 *
 * Data flow: uiStore.hoveredStation → show/hide tooltip
 *            uiStore.hoveredStationScreenPos → position on screen
 *
 * Used by: Dashboard.tsx
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { useUIStore } from "../../store/uiStore";
import { MachineTooltipContent } from "./MachineTooltipContent";
import {
  TOOLTIP_EDGE_PADDING,
  TOOLTIP_SHOW_DELAY_MS,
  TOOLTIP_CURSOR_OFFSET,
} from "../../lib/params";

export const MachineTooltip = () => {
  const hoveredStation = useUIStore((s) => s.hoveredStation);
  const screenPos = useUIStore((s) => s.hoveredStationScreenPos);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState<{ left: number; top: number }>({
    left: 0,
    top: 0,
  });

  // ─── Viewport-Aware Positioning ─────────────────────────────────────────
  const calculatePosition = useCallback(() => {
    if (!screenPos || !tooltipRef.current) return;

    const tooltip = tooltipRef.current;
    const tooltipRect = tooltip.getBoundingClientRect();
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;
    const tooltipW = tooltipRect.width || 280;
    const tooltipH = tooltipRect.height || 200;

    // Default: place to the right and slightly above the cursor
    let left = screenPos.x + TOOLTIP_CURSOR_OFFSET;
    let top = screenPos.y - tooltipH / 2;

    // Flip horizontally if too close to right edge
    if (left + tooltipW + TOOLTIP_EDGE_PADDING > viewportW) {
      left = screenPos.x - tooltipW - TOOLTIP_CURSOR_OFFSET;
    }

    // Clamp vertically within viewport
    if (top < TOOLTIP_EDGE_PADDING) {
      top = TOOLTIP_EDGE_PADDING;
    }
    if (top + tooltipH + TOOLTIP_EDGE_PADDING > viewportH) {
      top = viewportH - tooltipH - TOOLTIP_EDGE_PADDING;
    }

    // Also clamp left
    if (left < TOOLTIP_EDGE_PADDING) {
      left = TOOLTIP_EDGE_PADDING;
    }

    setPosition({ left, top });
  }, [screenPos]);

  // Recalculate on screenPos change
  useEffect(() => {
    calculatePosition();
  }, [calculatePosition]);

  // Recalculate on window resize
  useEffect(() => {
    const handleResize = () => calculatePosition();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [calculatePosition]);

  // ─── Show/Hide Animation ────────────────────────────────────────────────
  useEffect(() => {
    if (hoveredStation && screenPos) {
      // Small delay for smooth entrance
      const timer = setTimeout(() => setVisible(true), TOOLTIP_SHOW_DELAY_MS);
      return () => clearTimeout(timer);
    } else {
      setVisible(false);
    }
  }, [hoveredStation, screenPos]);

  // Don't render at all if no station is hovered
  if (!hoveredStation) return null;

  return (
    <div
      ref={tooltipRef}
      className="fixed z-[200] pointer-events-none"
      style={{
        left: `${position.left}px`,
        top: `${position.top}px`,
        opacity: visible ? 1 : 0,
        transform: visible
          ? "translateY(0) scale(1)"
          : "translateY(4px) scale(0.97)",
        transition: "opacity 200ms ease-out, transform 200ms ease-out",
      }}
    >
      {/* Glassmorphism Container */}
      <div
        className="rounded-xl border border-white/[0.12] shadow-2xl overflow-hidden"
        style={{
          background:
            "linear-gradient(135deg, rgba(15,17,21,0.92) 0%, rgba(10,12,16,0.95) 100%)",
          backdropFilter: "blur(20px) saturate(1.3)",
          WebkitBackdropFilter: "blur(20px) saturate(1.3)",
          maxWidth: "clamp(240px, 28vw, 380px)",
          minWidth: "clamp(200px, 22vw, 260px)",
          maxHeight: "clamp(200px, 40vh, 500px)",
          padding: "clamp(8px, 1.2vw, 16px)",
        }}
      >
        {/* Accent top border glow */}
        <div
          className="absolute top-0 left-0 right-0 h-[2px] rounded-t-xl"
          style={{
            background: `linear-gradient(90deg, transparent, ${
              hoveredStation ? getStationColor(hoveredStation) : "#00ff88"
            }, transparent)`,
            opacity: 0.6,
          }}
        />

        <MachineTooltipContent station={hoveredStation} />
      </div>
    </div>
  );
};

// =============================================================================
// HELPER
// =============================================================================

/** Quick color lookup without importing the full config. */
const STATION_COLORS: Record<string, string> = {
  press: "#ef4444",
  dryer: "#f97316",
  glaze: "#06b6d4",
  printer: "#a855f7",
  kiln: "#f43f5e",
  sorting: "#22c55e",
  packaging: "#eab308",
};

function getStationColor(station: string): string {
  return STATION_COLORS[station] ?? "#00ff88";
}
