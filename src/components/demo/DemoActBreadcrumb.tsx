/**
 * DemoActBreadcrumb.tsx — Demo Act Progress Indicator + Navigation Controls
 *
 * Left column of DemoScreen. Shows:
 *   - Completed acts: filled dim dot
 *   - Current act:    bright pulsing dot + era label highlighted
 *   - Future acts:    empty ring + dim era label
 *
 * Action buttons at the bottom (above Restart):
 *   - Continue → button: advances to the next act (or restarts on final act)
 *   - Restart button: resets the demo back to Act 0
 *
 * Props: none — reads all state directly from demoStore.
 * Used by: DemoScreen.tsx
 */

import { ChevronRight, RefreshCw, RotateCcw } from "lucide-react";
import { useDemoStore } from "../../store/demoStore";
import type { DemoState } from "../../store/demoStore";
import { DEMO_ACTS } from "../../lib/params/demoSystem/demoScript";

/**
 * DemoActBreadcrumb — vertical progress indicator + Continue / Restart controls.
 */
export const DemoActBreadcrumb: React.FC = () => {
  /** Current act index from the demo state machine */
  const currentActIndex = useDemoStore((s: DemoState) => s.currentActIndex);
  /** Whether CWF is currently generating a response */
  const isLoading = useDemoStore((s: DemoState) => s.isLoading);
  /** Action creators from the state machine */
  const advanceAct = useDemoStore((s: DemoState) => s.advanceAct);
  const restartDemo = useDemoStore((s: DemoState) => s.restartDemo);

  /** True when we are on the last act */
  const isLastAct = currentActIndex >= DEMO_ACTS.length - 1;
  /** Label + emoji for the next act (used on the Continue button) */
  const nextAct = isLastAct ? null : DEMO_ACTS[currentActIndex + 1];
  const continueLabel = isLastAct
    ? "↺ Restart"
    : `${nextAct?.eraEmoji ?? "→"} ${nextAct?.eraLabel ?? "Continue"}`;

  return (
    <div className="flex flex-col h-full justify-between py-2 px-2">
      {/* ── Act progress dots ─────────────────────────────────── */}
      <div className="flex flex-col gap-1 overflow-y-auto">
        {DEMO_ACTS.map((act, index) => {
          /** Classify this act relative to the current position */
          const isCompleted = index < currentActIndex;
          const isCurrent = index === currentActIndex;
          const isFuture = index > currentActIndex;

          return (
            <div
              key={act.id}
              className="flex items-center gap-2 py-1"
              title={act.eraLabel}
            >
              {/* Progress dot indicator */}
              <div className="shrink-0 w-5 flex items-center justify-center">
                {isCompleted && (
                  /* Completed: filled dim dot */
                  <div className="w-3 h-3 rounded-full bg-white/30 flex items-center justify-center">
                    <div className="w-1.5 h-1.5 rounded-full bg-white/60" />
                  </div>
                )}
                {isCurrent && (
                  /* Current: bright pulsing dot */
                  <div className="w-3.5 h-3.5 rounded-full bg-blue-400 shadow-[0_0_6px_2px_rgba(96,165,250,0.5)] animate-pulse" />
                )}
                {isFuture && (
                  /* Future: empty ring */
                  <div className="w-3 h-3 rounded-full border border-white/20" />
                )}
              </div>

              {/* Era label */}
              <div className="flex flex-col min-w-0">
                <span
                  className={`text-xs leading-tight truncate transition-all duration-300 ${
                    isCurrent
                      ? "text-white font-semibold"
                      : isCompleted
                        ? "text-white/50 text-[10px]"
                        : "text-white/25 text-[10px]"
                  }`}
                >
                  {act.eraEmoji} {act.eraLabel}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Navigation buttons ────────────────────────────────── */}
      <div className="flex flex-col gap-1.5">
        {/* Continue → button — above Restart */}
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
            isLastAct ? "Restart the demo" : `Advance to: ${nextAct?.eraLabel}`
          }
          className="
            w-full flex items-center justify-center gap-1.5
            px-2 py-2 rounded-lg
            bg-blue-500/20 hover:bg-blue-500/35
            border border-blue-400/30 hover:border-blue-400/60
            text-blue-300 hover:text-blue-200
            text-[11px] font-semibold
            transition-all duration-200
            disabled:opacity-40 disabled:cursor-not-allowed
            shadow-[0_2px_10px_rgba(96,165,250,0.15)]
          "
        >
          {/* Icon: refresh on last act, chevron otherwise */}
          {isLastAct ? <RefreshCw size={10} /> : <ChevronRight size={10} />}
          <span className="truncate">{continueLabel}</span>
        </button>

        {/* Restart button — always at bottom */}
        <button
          onClick={() => {
            void restartDemo();
          }}
          disabled={isLoading}
          title="Restart Demo from the beginning"
          className="
            flex items-center gap-1.5 px-2 py-1.5 rounded-lg
            text-white/40 hover:text-white/70
            text-[10px] font-medium
            border border-white/10 hover:border-white/25
            transition-all duration-200
            disabled:opacity-30 disabled:cursor-not-allowed
          "
        >
          <RotateCcw size={10} />
          <span>Restart</span>
        </button>
      </div>
    </div>
  );
};
