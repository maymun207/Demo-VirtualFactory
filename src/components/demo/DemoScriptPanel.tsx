/**
 * DemoScriptPanel.tsx — Demo Script Scene Cards
 *
 * Renders the left column of the DemoScreen panel: a vertical list of
 * clickable scene cards, each representing one beat of the demo presentation.
 *
 * Clicking a scene card calls demoStore.runScene(scene), which auto-sends
 * that scene's prompt to CWF and shows the response in the DemoChatView.
 *
 * The currently active scene card is visually highlighted via activeSceneId
 * from demoStore. A loading spinner is shown on the active card while the
 * AI is generating its response.
 *
 * Used by: DemoScreen.tsx
 */

import { Loader2 } from "lucide-react";
import { useDemoStore } from "../../store/demoStore";
import type { DemoState } from "../../store/demoStore";
import { DEMO_SCRIPT } from "../../lib/params/demoSystem/demoScript";
import type { DemoScene } from "../../lib/params/demoSystem/demoScript";

/**
 * DemoScriptPanel — vertical list of demo scene cards.
 * Each card sends its scene prompt to CWF on click.
 */
export const DemoScriptPanel: React.FC = () => {
  /** Whether the agent is currently loading (disables all cards) */
  const isLoading = useDemoStore((s: DemoState) => s.isLoading);
  /** The ID of the most recently triggered scene (for active state) */
  const activeSceneId = useDemoStore((s: DemoState) => s.activeSceneId);
  /** runScene action — called when a card is clicked */
  const runScene = useDemoStore((s: DemoState) => s.runScene);

  return (
    <div
      className="flex flex-col gap-1 overflow-y-auto py-1 pr-1"
      style={{ scrollbarWidth: "none" }}
    >
      {/* Script header label */}
      <div className="px-2 pb-0.5">
        <span className="text-[9px] font-semibold tracking-widest uppercase text-white/25 select-none">
          Demo Script
        </span>
      </div>

      {/* Scene cards — one per DemoScene in DEMO_SCRIPT */}
      {DEMO_SCRIPT.map((scene: DemoScene) => {
        /** Whether this specific scene is the active one */
        const isActive = scene.id === activeSceneId;
        /** Spinner only shown on the active card while loading */
        const showSpinner = isActive && isLoading;

        return (
          <button
            key={scene.id}
            onClick={() => {
              /** Guard against double-clicks while already loading */
              if (isLoading) return;
              /** Trigger this scene — sets activeSceneId and sends the prompt */
              runScene(scene);
            }}
            disabled={isLoading}
            className={`
              relative w-full text-left px-2.5 py-1.5 rounded-xl
              border text-[10px] leading-tight font-medium
              transition-all duration-150 active:scale-95
              flex items-center gap-2
              ${
                isActive
                  ? "bg-violet-500/25 border-violet-400/50 text-violet-200 shadow-[0_0_8px_rgba(167,139,250,0.2)]"
                  : isLoading
                    ? "bg-white/3 border-white/6 text-white/25 cursor-not-allowed"
                    : "bg-white/5 border-white/10 text-white/65 hover:bg-white/8 hover:border-white/20 hover:text-white/85 cursor-pointer"
              }
            `}
          >
            {/* Spinner on active + loading, otherwise scene title emoji/text */}
            {showSpinner ? (
              <Loader2
                size={10}
                className="shrink-0 text-violet-400 animate-spin"
              />
            ) : (
              <span className="shrink-0 text-xs leading-none">
                {scene.title.split(" ")[0]}
              </span>
            )}
            {/* Scene title without the first emoji word */}
            <span className="truncate">
              {scene.title.split(" ").slice(1).join(" ")}
            </span>
          </button>
        );
      })}
    </div>
  );
};
