/**
 * DemoChatView.tsx — Narrative Demo Chat Thread + Inline Input
 *
 * Fills the DemoScreen chat panel (flex-1, scrollable).
 * Renders the conversation thread between the audience and ARIA,
 * plus an inline text input for free-form questions typed directly
 * in the chat window.
 *
 * Act navigation controls (Continue, Restart, Scenario, progress dots)
 * live in DemoControlBar — the fixed bottom-of-screen HUD strip.
 *
 * When messages is empty AND currentActIndex === 0, the welcome card
 * is shown instead (factory journey overview + Start buttons).
 *
 * Used by: DemoScreen.tsx
 */

import React, { useEffect, useRef, useState } from "react";
import { Send, Trash2 } from "lucide-react";
import { useDemoStore } from "../../store/demoStore";
import type { DemoState, DemoMessage } from "../../store/demoStore";

import { DemoMessageBubble } from "./DemoMessageBubble";
import { useSimulationDataStore } from "../../store/simulationDataStore";
import { useSimulationStore } from "../../store/simulationStore";

/**
 * DemoChatView — scrollable chat thread + inline input toolbar.
 */
export const DemoChatView: React.FC = () => {
  /** Full conversation message list */
  const messages = useDemoStore((s: DemoState) => s.messages);
  /** True while CWF is generating a response */
  const isLoading = useDemoStore((s: DemoState) => s.isLoading);
  /** Current act index for welcome card conditional */
  const currentActIndex = useDemoStore((s: DemoState) => s.currentActIndex);
  /** Store actions */
  const sendMessage = useDemoStore((s: DemoState) => s.sendMessage);
  const clearMessages = useDemoStore((s: DemoState) => s.clearMessages);
  const advanceAct = useDemoStore((s: DemoState) => s.advanceAct);

  /** Free-form input text */
  const [inputText, setInputText] = useState<string>("");
  /** Ref for auto-scroll to latest message */
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  /** True if a simulation session is active (required for CWF calls) */
  const simHasSession = useSimulationDataStore((s) => !!s.session?.id);

  /** Auto-scroll to the bottom whenever messages update */
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  /** Sends free-form input text to the CWF endpoint */
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

  return (
    <div className="flex flex-col h-full">
      {/* ── Message thread ─────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2 scroll-smooth">
        {messages.length === 0 && currentActIndex === 0 && (
          /*
           * Welcome Card — static, shown before the demo starts.
           * Disappears as soon as the first message arrives.
           */
          <div className="flex flex-col h-full px-5 py-5 gap-5">
            {/* ── Title ──────────────────────────────────────────── */}
            <div className="text-center pt-2">
              <div className="text-6xl mb-3">🏭</div>
              <h2 className="text-white font-bold text-3xl leading-tight tracking-tight">
                Digital Twin Demo
              </h2>
              <p className="text-white/50 text-lg mt-1.5">
                Ceramic Tile Factory — AI Transformation Journey
              </p>
            </div>

            {/* ── Description ─────────────────────────────────────── */}
            <p className="text-white/65 text-lg text-center leading-relaxed">
              Follow a ceramic tile factory evolving from{" "}
              <strong className="text-white/85">zero visibility</strong> to a{" "}
              <strong className="text-white/85">fully autonomous AI</strong>{" "}
              system — step by step, in real time. At each stage you can ask
              questions and challenge the system.
            </p>

            {/* ── 4-stage journey ─────────────────────────────────── */}
            <div className="flex flex-col gap-2">
              {[
                {
                  emoji: "📊",
                  label: "Basic Management",
                  desc: "First visibility into production",
                },
                {
                  emoji: "🔗",
                  label: "Digital Twin",
                  desc: "Tile-level traceability & live passport",
                },
                {
                  emoji: "💬",
                  label: "Chat with Factory",
                  desc: "Natural language control",
                },
                {
                  emoji: "🤖",
                  label: "Autonomous AI Copilot",
                  desc: "Self-optimising plant — no human input",
                },
              ].map((stage, i) => (
                <div
                  key={stage.label}
                  className="flex items-center gap-4 bg-white/5 rounded-xl px-4 py-3.5 border border-white/8"
                >
                  <span className="text-3xl leading-none shrink-0">
                    {stage.emoji}
                  </span>
                  <div className="min-w-0">
                    <span className="text-white/90 text-lg font-semibold">
                      {stage.label}
                    </span>
                    <span className="text-white/40 text-base ml-2">
                      {stage.desc}
                    </span>
                  </div>
                  <span className="ml-auto text-white/20 text-sm font-mono shrink-0">
                    0{i + 1}
                  </span>
                </div>
              ))}
            </div>

            {/* ── Action buttons ───────────────────────────────────── */}
            <div className="flex flex-col gap-2 mt-auto pb-1">
              {/* Step 1 — Start Simulation (shown when sim not running) */}
              {!simHasSession && (
                <button
                  onClick={() => useSimulationStore.getState().toggleDataFlow()}
                  className="
                    w-full flex items-center justify-center gap-2
                    px-4 py-3 rounded-xl
                    bg-emerald-500/25 hover:bg-emerald-500/45
                    border border-emerald-400/35 hover:border-emerald-400/70
                    text-emerald-200 hover:text-white
                    text-lg font-bold tracking-wide
                    transition-all duration-200
                    shadow-[0_4px_20px_rgba(52,211,153,0.15)]
                    hover:shadow-[0_4px_28px_rgba(52,211,153,0.35)]
                  "
                >
                  <span>⚡</span>
                  <span>Step 1 — Start Simulation</span>
                </button>
              )}

              {/* Step 2 — Start Demo (active only when sim is running) */}
              <button
                onClick={() => void advanceAct()}
                disabled={!simHasSession}
                className="
                  w-full flex items-center justify-center gap-2
                  px-4 py-3 rounded-xl
                  bg-blue-500/25 hover:bg-blue-500/45
                  border border-blue-400/35 hover:border-blue-400/70
                  text-blue-200 hover:text-white
                  text-sm font-bold tracking-wide
                  transition-all duration-200
                  shadow-[0_4px_20px_rgba(96,165,250,0.15)]
                  hover:shadow-[0_4px_28px_rgba(96,165,250,0.35)]
                  disabled:opacity-35 disabled:cursor-not-allowed
                "
              >
                <span>▶</span>
                <span>
                  {simHasSession
                    ? "Step 2 — Start Demo"
                    : "Start Demo (start simulation first)"}
                </span>
              </button>
            </div>
          </div>
        )}

        {/* Message bubbles */}
        {messages.map((msg: DemoMessage) => (
          <DemoMessageBubble key={msg.id} message={msg} />
        ))}
        {/* Scroll anchor */}
        <div ref={messagesEndRef} />
      </div>

      {/* ── Inline input toolbar ────────────────────────────────── */}
      <div className="shrink-0 border-t border-white/8 px-2 py-2">
        <div className="flex items-center gap-1.5">
          {/* Text input for free-form questions within chat window */}
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Your response or question…"
            disabled={isLoading}
            className="
              flex-1 min-w-0
              bg-white/5 border border-white/10
              rounded-lg px-3 py-2
              text-sm text-white placeholder-white/25
              focus:outline-none focus:border-white/25 focus:bg-white/8
              transition-all duration-150
              disabled:opacity-40 disabled:cursor-not-allowed
            "
          />

          {/* Send button */}
          <button
            onClick={handleSend}
            disabled={isLoading || !inputText.trim()}
            title="Send"
            className="
              shrink-0 p-1.5 rounded-lg
              bg-white/8 hover:bg-white/15
              border border-white/10 hover:border-white/25
              text-white/50 hover:text-white/80
              transition-all duration-150
              disabled:opacity-30 disabled:cursor-not-allowed
            "
          >
            <Send size={15} />
          </button>

          {/* Clear conversation button */}
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
            <Trash2 size={15} />
          </button>
        </div>
      </div>
    </div>
  );
};
