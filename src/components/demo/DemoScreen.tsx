/**
 * DemoScreen.tsx — Root Demo Panel with Dynamic Height
 *
 * The fixed-position, glass-effect panel that appears below the header
 * when the Demo button is clicked. Toggled via `showDemoScreen` in uiStore.
 *
 * DYNAMIC HEIGHT:
 *   The panel height is NOT fixed. Each DemoAct defines a `targetHeightKey`
 *   (compact / medium / tall / large). DemoScreen reads the current act's key
 *   from demoStore, looks up the pixel value from DEMO_ACT_HEIGHTS, and
 *   applies it as an inline style. A CSS transition animates the change
 *   smoothly — the "breathing panel" effect.
 *
 * LAYOUT:
 *   LEFT  (~25% width) → DemoActBreadcrumb (progress dots + restart)
 *   RIGHT (~75% width) → DemoChatView (chat thread + Continue button)
 *
 * POSITIONING:
 *   Anchored to three DOM elements via getBoundingClientRect():
 *     LEFT  edge: left edge of #btn-demo
 *     RIGHT edge: right edge of #header-pillar3
 *     TOP   edge: bottom of #header-container
 *   Handles window resize events (debounced) to stay accurate.
 *
 * All layout and height constants come from params — no hardcoded values.
 *
 * Used by: src/components/ui/Dashboard.tsx
 */

import React, { useEffect, useRef, useState } from "react";
import { useUIStore } from "../../store/uiStore";
import type { UIState } from "../../store/uiStore";
import { useDemoStore } from "../../store/demoStore";
import type { DemoState } from "../../store/demoStore";
import {
  DEMO_ACT_HEIGHTS,
  DEMO_HEIGHT_TRANSITION_MS,
} from "../../lib/params/demoSystem/demoConfig";
import { DEMO_ACTS } from "../../lib/params/demoSystem/demoScript";
import {
  SUB_HEADER_PANEL_RESIZE_DEBOUNCE_MS,
  SUB_HEADER_PANEL_Z_INDEX,
} from "../../lib/params/subHeaderPanel";
import { DemoActBreadcrumb } from "./DemoActBreadcrumb";
import { DemoChatView } from "./DemoChatView";

/** Viewport-relative bounds for fixed positioning */
interface PanelBounds {
  /** Distance from viewport top to the panel's top edge */
  top: number;
  /** Distance from viewport left to the panel's left edge */
  left: number;
  /** Panel width in pixels */
  width: number;
}

/**
 * computeBounds — reads the three anchor DOM elements and derives
 * the panel's fixed positioning. Returns null if any anchor is missing.
 */
const computeBounds = (): PanelBounds | null => {
  /** Header container — bottom edge becomes panel top */
  const header = document.getElementById("header-container");
  /** Demo button — left edge becomes panel left */
  const demoBtn = document.getElementById("btn-demo");
  /** Pillar 3 (status grid) — right edge becomes panel right */
  const pillar3 = document.getElementById("header-pillar3");

  if (!header || !demoBtn || !pillar3) return null;

  return {
    top: header.getBoundingClientRect().bottom,
    left: demoBtn.getBoundingClientRect().left,
    width:
      pillar3.getBoundingClientRect().right -
      demoBtn.getBoundingClientRect().left,
  };
};

/**
 * DemoScreen — the root demo panel component.
 * Returns null when hidden or when DOM anchors cannot be measured.
 */
export const DemoScreen: React.FC = () => {
  /** Visibility controlled by uiStore.showDemoScreen */
  const showDemoScreen = useUIStore((s: UIState) => s.showDemoScreen);

  /** Current act index drives dynamic height */
  const currentActIndex = useDemoStore((s: DemoState) => s.currentActIndex);

  /** Measured DOM position for fixed layout */
  const [bounds, setBounds] = useState<PanelBounds | null>(null);

  /** Holds the active resize debounce timer */
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    /** Read DOM and update bounds state */
    const measureAndSet = () => setBounds(computeBounds());

    /** Debounced resize handler — prevents excessive DOM reads */
    const handleResize = () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(
        measureAndSet,
        SUB_HEADER_PANEL_RESIZE_DEBOUNCE_MS,
      );
    };

    /** Initial measurement on mount */
    measureAndSet();
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, []);

  /** Do not render when hidden or anchors not yet measured */
  if (!showDemoScreen || !bounds) return null;

  /**
   * Dynamic height: read the current act's targetHeightKey, look up pixels.
   * Falls back to 'compact' if the act index is somehow out of bounds.
   */
  const currentAct = DEMO_ACTS[currentActIndex] ?? DEMO_ACTS[0];
  const panelHeightPx = DEMO_ACT_HEIGHTS[currentAct.targetHeightKey];

  return (
    <div
      id="demo-screen"
      className={`fixed ${SUB_HEADER_PANEL_Z_INDEX} pointer-events-none`}
      style={{
        top: bounds.top,
        left: bounds.left,
        width: bounds.width,
        /** Dynamic height with smooth CSS transition — the "breathing" effect */
        height: panelHeightPx,
        transition: `height ${DEMO_HEIGHT_TRANSITION_MS}ms cubic-bezier(0.4, 0, 0.2, 1)`,
      }}
    >
      {/* Glass panel body */}
      <div
        className="
                    w-full h-full
                    bg-black/35
                    backdrop-blur-md
                    border border-white/8
                    border-t-0
                    rounded-b-2xl
                    overflow-hidden
                    pointer-events-auto
                    shadow-[0_8px_32px_rgba(0,0,0,0.5)]
                "
      >
        {/* Two-column layout: Breadcrumb (left) + Chat (right) */}
        <div className="grid h-full" style={{ gridTemplateColumns: "22% 78%" }}>
          {/* Left column — act progress breadcrumb */}
          <div className="h-full overflow-hidden border-r border-white/8">
            <DemoActBreadcrumb />
          </div>

          {/* Right column — narrative chat + Continue button */}
          <div className="h-full overflow-hidden">
            <DemoChatView />
          </div>
        </div>
      </div>
    </div>
  );
};
