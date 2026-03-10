/**
 * DemoControlBar.tsx — Fixed Bottom-of-Screen Demo Control Strip
 *
 * A glass HUD bar pinned to the very bottom of the viewport.
 * Visible whenever showDemoScreen is true (demo mode is active).
 *
 * Layout (horizontal, single row):
 *
 *  ┌──────────────────────────────────────────────────────────────────┐
 *  │  🏭 DEMO  │  ● ○ ○ │ ▶ Chat with Factory  │ [ask...]  [↑][🗑] │ [SCN-001] │
 *  │                                                                  │ [⟳ Restart] │
 *  └──────────────────────────────────────────────────────────────────┘
 *
 *  Left   : Demo label + horizontal act progress dots
 *  Centre : Continue / Restart button (advances act or restarts)
 *  Middle : Free-form text input + Send + Clear
 *  Right  : Active scenario badge + Restart button (stacked)
 *
 * Uses `fixed bottom-0 left-0 right-0` so it spans the full viewport
 * width and sits on top of the 3D scene / other panels.
 *
 * Used by: src/components/ui/Dashboard.tsx
 */

import React, { useRef, useState } from "react";
import {
  ChevronRight,
  RefreshCw,
  RotateCcw,
  Send,
  Trash2,
} from "lucide-react";
import { useDemoStore } from "../../store/demoStore";
import type { DemoState } from "../../store/demoStore";
import { DEMO_ACTS } from "../../lib/params/demoSystem/demoScript";
import { useSimulationDataStore } from "../../store/simulationDataStore";
import { useUIStore } from "../../store/uiStore";
import { SUB_HEADER_PANEL_Z_INDEX } from "../../lib/params/subHeaderPanel";

/**
 * DemoControlBar — the full-width, bottom-pinned demo HUD strip.
 * Returns null when demo is not active.
 */
export const DemoControlBar: React.FC = () => {
  /** Only visible while demo screen is open */
  const showDemoScreen = useUIStore((s) => s.showDemoScreen);

  /** Current act index from the demo state machine */
  const currentActIndex = useDemoStore((s: DemoState) => s.currentActIndex);
  /** Whether CWF is currently generating a response */
  const isLoading = useDemoStore((s: DemoState) => s.isLoading);
  /** Action creators */
  const advanceAct = useDemoStore((s: DemoState) => s.advanceAct);
  const restartDemo = useDemoStore((s: DemoState) => s.restartDemo);
  const sendMessage = useDemoStore((s: DemoState) => s.sendMessage);
  const clearMessages = useDemoStore((s: DemoState) => s.clearMessages);

  /** Active scenario code for the badge (null when no sim configured) */
  const activeScenarioCode = useSimulationDataStore(
    (s) => s.activeScenario?.code ?? null,
  );

  /** Free-form input text state */
  const [inputText, setInputText] = useState<string>("");
  /** Ref for focus management on the input */
  const inputRef = useRef<HTMLInputElement | null>(null);

  /** True when on the very last act */
  const isLastAct = currentActIndex >= DEMO_ACTS.length - 1;
  /** Metadata of the next act — used for Continue button label */
  const nextAct = isLastAct ? null : DEMO_ACTS[currentActIndex + 1];

  /** Sends the typed free-form message to the CWF endpoint */
  const handleSend = () => {
    const trimmed = inputText.trim();
    if (!trimmed || isLoading) return;
    setInputText("");
    void sendMessage(trimmed);
  };

  /** Enter to send (Shift+Enter preserved for future textarea) */
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  /** Do not render when demo is closed */
  if (!showDemoScreen) return null;

  return (
    <div
      id="demo-control-bar"
      className={`fixed bottom-0 left-0 right-0 ${SUB_HEADER_PANEL_Z_INDEX} pointer-events-none`}
    >
      {/* Glass HUD strip — full viewport width, fixed height */}
      <div className="
        w-full pointer-events-auto
        bg-black/60 backdrop-blur-xl
        border-t border-white/10
        shadow-[0_-8px_32px_rgba(0,0,0,0.5)]
        px-4 py-2
        flex items-center gap-3
      ">

        {/* ── DEMO LABEL + ACT PROGRESS DOTS ──────────────────── */}
        <div className="flex items-center gap-3 shrink-0">
          {/* Demo wordmark */}
          <div className="flex items-center gap-1.5">
            <span className="text-base leading-none">🏭</span>
            <span className="text-white/60 text-[10px] font-black uppercase tracking-widest">
              Demo
            </span>
          </div>

          {/* Thin separator */}
          <div className="w-px h-5 bg-white/10" />

          {/* Horizontal act progress dots */}
          <div className="flex items-center gap-1.5">
            {DEMO_ACTS.map((act, index) => {
              /** Classify this act relative to current position */
              const isCompleted = index < currentActIndex;
              const isCurrent = index === currentActIndex;

              return (
                <div
                  key={act.id}
                  title={`${act.eraEmoji} ${act.eraLabel}`}
                  className="flex items-center justify-center"
                >
                  {isCompleted && (
                    /** Completed: filled dim white dot */
                    <div className="w-2 h-2 rounded-full bg-white/35" />
                  )}
                  {isCurrent && (
                    /** Current: bright blue pulsing dot */
                    <div className="w-2.5 h-2.5 rounded-full bg-blue-400 shadow-[0_0_6px_2px_rgba(96,165,250,0.55)] animate-pulse" />
                  )}
                  {!isCompleted && !isCurrent && (
                    /** Future: empty ring */
                    <div className="w-2 h-2 rounded-full border border-white/20" />
                  )}
                </div>
              );
            })}
          </div>

          {/* Current act label (readable at a glance) */}
          <span className="text-white/50 text-[10px] font-medium whitespace-nowrap hidden sm:inline">
            {DEMO_ACTS[currentActIndex]?.eraEmoji}{" "}
            {DEMO_ACTS[currentActIndex]?.eraLabel}
          </span>
        </div>

        {/* Thin separator */}
        <div className="w-px h-5 bg-white/10 shrink-0" />

        {/* ── CONTINUE BUTTON ──────────────────────────────────── */}
        <button
          onClick={() => {
            if (isLastAct) {
              void restartDemo();
            } else {
              void advanceAct();
            }
          }}
          disabled={isLoading}
          title={
            isLastAct
              ? "Restart the demo"
              : `Advance to: ${nextAct?.eraLabel ?? "Continue"}`
          }
          className="
            shrink-0 flex items-center gap-1.5
            px-3.5 py-1.5 rounded-lg
            bg-blue-500/20 hover:bg-blue-500/35
            border border-blue-400/30 hover:border-blue-400/60
            text-blue-300 hover:text-blue-100
            text-xs font-semibold tracking-wide
            transition-all duration-200
            disabled:opacity-40 disabled:cursor-not-allowed
            shadow-[0_2px_10px_rgba(96,165,250,0.12)]
            hover:shadow-[0_2px_16px_rgba(96,165,250,0.28)]
            whitespace-nowrap
          "
        >
          {isLastAct ? <RefreshCw size={12} /> : <ChevronRight size={12} />}
          <span>
            {isLastAct
              ? "↺ Restart"
              : `${nextAct?.eraEmoji ?? "→"} ${nextAct?.eraLabel ?? "Continue"}`}
          </span>
        </button>

        {/* Thin separator */}
        <div className="w-px h-5 bg-white/10 shrink-0" />

        {/* ── FREE-FORM INPUT (flex-1) ──────────────────────────── */}
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          {/* Text input */}
          <input
            ref={inputRef}
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask ARIA a question…"
            disabled={isLoading}
            className="
              flex-1 min-w-0
              bg-white/5 border border-white/10
              rounded-lg px-3 py-1.5
              text-sm text-white placeholder-white/25
              focus:outline-none focus:border-white/30 focus:bg-white/8
              transition-all duration-150
              disabled:opacity-40 disabled:cursor-not-allowed
            "
          />

          {/* Send icon button */}
          <button
            onClick={handleSend}
            disabled={isLoading || !inputText.trim()}
            title="Send"
            className="
              shrink-0 p-1.5 rounded-lg
              bg-white/5 hover:bg-white/12
              border border-white/10 hover:border-white/25
              text-white/50 hover:text-white/80
              transition-all duration-150
              disabled:opacity-30 disabled:cursor-not-allowed
            "
          >
            <Send size={13} />
          </button>

          {/* Clear conversation icon button */}
          <button
            onClick={clearMessages}
            title="Clear conversation"
            className="
              shrink-0 p-1.5 rounded-lg
              bg-white/5 hover:bg-white/10
              border border-white/8 hover:border-white/20
              text-white/30 hover:text-white/60
              transition-all duration-150
            "
          >
            <Trash2 size={13} />
          </button>
        </div>

        {/* Thin separator */}
        <div className="w-px h-5 bg-white/10 shrink-0" />

        {/* ── RIGHT: SCENARIO + RESTART stacked ────────────────── */}
        {/*
          Two controls stacked vertically so they share the same
          horizontal footprint, aligned with the other row items.
        */}
        <div className="flex flex-col gap-0.5 shrink-0 items-stretch min-w-[100px]">
          {/* Scenario badge */}
          <div className="
            flex items-center gap-1.5 px-2.5 py-1 rounded-md
            bg-white/5 border border-white/8
            whitespace-nowrap
          ">
            {/* Status dot: green if active scenario loaded */}
            <div
              className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                activeScenarioCode
                  ? "bg-emerald-400 shadow-[0_0_4px_rgba(52,211,153,0.7)]"
                  : "bg-white/20"
              }`}
            />
            <span
              className={`font-mono font-bold text-[10px] tracking-wider ${
                activeScenarioCode ? "text-white/85" : "text-white/25"
              }`}
            >
              {activeScenarioCode ?? "NO SCENARIO"}
            </span>
          </div>

          {/* Restart button */}
          <button
            onClick={() => void restartDemo()}
            disabled={isLoading}
            title="Restart Demo from the beginning"
            className="
              flex items-center justify-center gap-1.5
              px-2.5 py-1 rounded-md
              bg-white/5 hover:bg-white/10
              border border-white/10 hover:border-white/25
              text-white/40 hover:text-white/75
              text-[10px] font-medium tracking-wide
              transition-all duration-200
              disabled:opacity-30 disabled:cursor-not-allowed
              whitespace-nowrap
            "
          >
            <RotateCcw size={10} />
            <span>Restart</span>
          </button>
        </div>
      </div>
    </div>
  );
};
