/**
 * DemoActBreadcrumb.tsx — Horizontal Demo Control Bar
 *
 * Bottom bar of DemoScreen. Lays out all controls in a single horizontal row:
 *
 *   ┌──────────────────────────────────────────────────────────────────────┐
 *   │  ● ○ ○ ○ ○ ○  │  ▶ Continue  │  [  input…  ] [↑] [🗑]  │  [Scenario] │
 *   │                                                           │  [Restart ] │
 *   └──────────────────────────────────────────────────────────────────────┘
 *
 *   Left group  : act progress dots (compact horizontal stepper)
 *   Mid-left    : Continue → / ↺ Restart button
 *   Mid-right   : free-form input + Send + Clear icons
 *   Right group : Scenario badge stacked above Restart (both right-aligned)
 *
 * All state is read directly from demoStore. No props needed.
 * Used by: DemoScreen.tsx
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

/**
 * DemoActBreadcrumb — horizontal act stepper + all controls in one bar.
 */
export const DemoActBreadcrumb: React.FC = () => {
  /** Current act index from the demo state machine */
  const currentActIndex = useDemoStore((s: DemoState) => s.currentActIndex);
  /** Whether CWF is currently generating a response */
  const isLoading = useDemoStore((s: DemoState) => s.isLoading);
  /** Action creators */
  const advanceAct = useDemoStore((s: DemoState) => s.advanceAct);
  const restartDemo = useDemoStore((s: DemoState) => s.restartDemo);
  const sendMessage = useDemoStore((s: DemoState) => s.sendMessage);
  const clearMessages = useDemoStore((s: DemoState) => s.clearMessages);

  /** Active scenario code for the badge (null when no sim running) */
  const activeScenarioCode = useSimulationDataStore(
    (s) => s.activeScenario?.code ?? null,
  );

  /** Free-form input text */
  const [inputText, setInputText] = useState<string>("");
  /** Ref for the text input — used for keyboard focus management */
  const inputRef = useRef<HTMLInputElement | null>(null);

  /** True when we are on the very last act */
  const isLastAct = currentActIndex >= DEMO_ACTS.length - 1;
  /** Next act metadata for the Continue button label */
  const nextAct = isLastAct ? null : DEMO_ACTS[currentActIndex + 1];

  /** Handles free-form message send */
  const handleSend = () => {
    const trimmed = inputText.trim();
    if (!trimmed || isLoading) return;
    setInputText("");
    void sendMessage(trimmed);
  };

  /** Enter key to send (Shift+Enter preserved for newlines) */
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex items-center gap-2 px-3 py-2">

      {/* ── LEFT: Act progress stepper (horizontal dots) ──────────── */}
      <div className="flex items-center gap-1 shrink-0">
        {DEMO_ACTS.map((act, index) => {
          /** Classify this act relative to the current position */
          const isCompleted = index < currentActIndex;
          const isCurrent = index === currentActIndex;

          return (
            <div
              key={act.id}
              title={`${act.eraEmoji} ${act.eraLabel}`}
              className="relative flex items-center justify-center"
            >
              {/* Dot indicator — completed (filled), current (pulsing), future (ring) */}
              {isCompleted && (
                <div className="w-2 h-2 rounded-full bg-white/40" />
              )}
              {isCurrent && (
                <div className="w-2.5 h-2.5 rounded-full bg-blue-400 shadow-[0_0_6px_2px_rgba(96,165,250,0.55)] animate-pulse" />
              )}
              {!isCompleted && !isCurrent && (
                <div className="w-2 h-2 rounded-full border border-white/20" />
              )}
            </div>
          );
        })}
      </div>

      {/* Thin divider */}
      <div className="w-px h-5 bg-white/10 shrink-0" />

      {/* ── CONTINUE button ───────────────────────────────────────── */}
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
          px-3 py-1.5 rounded-lg
          bg-blue-500/20 hover:bg-blue-500/35
          border border-blue-400/30 hover:border-blue-400/60
          text-blue-300 hover:text-blue-100
          text-[11px] font-semibold tracking-wide
          transition-all duration-200
          disabled:opacity-40 disabled:cursor-not-allowed
          shadow-[0_2px_10px_rgba(96,165,250,0.12)]
          hover:shadow-[0_2px_16px_rgba(96,165,250,0.25)]
          whitespace-nowrap
        "
      >
        {/* Icon changes: refresh on last act, chevron otherwise */}
        {isLastAct ? <RefreshCw size={11} /> : <ChevronRight size={11} />}
        <span>
          {isLastAct
            ? "↺ Restart"
            : `${nextAct?.eraEmoji ?? "→"} ${nextAct?.eraLabel ?? "Continue"}`}
        </span>
      </button>

      {/* Thin divider */}
      <div className="w-px h-5 bg-white/10 shrink-0" />

      {/* ── FREE-FORM INPUT (flex-1 to fill remaining space) ─────── */}
      <div className="flex items-center gap-1.5 flex-1 min-w-0">
        {/* Text input */}
        <input
          ref={inputRef}
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask a question…"
          disabled={isLoading}
          className="
            flex-1 min-w-0
            bg-white/5 border border-white/10
            rounded-lg px-3 py-1.5
            text-sm text-white placeholder-white/25
            focus:outline-none focus:border-white/25 focus:bg-white/8
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

        {/* Clear icon button */}
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

      {/* Thin divider */}
      <div className="w-px h-5 bg-white/10 shrink-0" />

      {/* ── RIGHT: Scenario badge + Restart stacked ──────────────── */}
      {/*
        These two controls are stacked vertically (flex-col) so they  
        occupy the same horizontal footprint, aligned with the rest of  
        the row items. min-w is set so the column doesn't collapse.      
      */}
      <div className="flex flex-col gap-0.5 shrink-0 items-stretch min-w-[96px]">
        {/* Scenario badge */}
        <div className="
          flex items-center gap-1.5 px-2.5 py-1 rounded-lg
          bg-white/5 border border-white/10
          text-white/80 text-[10px] font-mono font-bold tracking-wider
          whitespace-nowrap
        ">
          {/* Small coloured dot: green if active, amber if not */}
          <div
            className={`w-1.5 h-1.5 rounded-full shrink-0 ${
              activeScenarioCode
                ? "bg-emerald-400 shadow-[0_0_4px_rgba(52,211,153,0.7)]"
                : "bg-white/20"
            }`}
          />
          <span className={activeScenarioCode ? "text-white/90" : "text-white/30"}>
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
            px-2.5 py-1 rounded-lg
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
  );
};
