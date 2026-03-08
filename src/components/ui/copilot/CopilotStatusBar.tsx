/**
 * CopilotStatusBar.tsx — Copilot Active Status Indicator for CWF Panel
 *
 * A slim horizontal bar displayed above the CWF input area when copilot
 * mode is active. Shows:
 *   - Green pulse dot (alive indicator)
 *   - "Copilot Active — monitoring every 15s"
 *   - "• 3 actions taken" (if actions > 0)
 *
 * This component only renders when copilot is enabled (the parent
 * conditionally renders it). All text and colours come from params/copilot.ts.
 *
 * Used by:
 *   - src/components/ui/CWFChatPanel.tsx (rendered above the input area)
 */

import {
  COPILOT_THEME,
  COPILOT_UI_LABELS,
  COPILOT_DEFAULT_POLL_INTERVAL_SEC,
} from "../../../lib/params/copilot";

// =============================================================================
// PROPS INTERFACE
// =============================================================================

/**
 * Props accepted by the CopilotStatusBar component.
 * Injected by parent — component is pure and testable.
 */
interface CopilotStatusBarProps {
  /** Number of copilot actions taken this session */
  totalActions: number;
  /** Current UI language ('en' or 'tr') for bilingual status text */
  language: "en" | "tr";
  /** Custom poll interval in seconds (default from params if not specified) */
  pollIntervalSec?: number;
}

// =============================================================================
// INTERNAL CONSTANTS
// =============================================================================

/** Green-400 hex colour for the alive pulse dot */
const ALIVE_DOT_COLOR = "#4ade80";

// =============================================================================
// COMPONENT
// =============================================================================

/**
 * CopilotStatusBar — Renders a status strip showing copilot monitoring state.
 *
 * @param props - See CopilotStatusBarProps interface above.
 * @returns React element — a slim bar with pulse dot, status text, and action count.
 */
export function CopilotStatusBar({
  totalActions,
  language,
  pollIntervalSec = COPILOT_DEFAULT_POLL_INTERVAL_SEC,
}: CopilotStatusBarProps) {
  /** Resolve bilingual labels from the centralised params module */
  const labels = COPILOT_UI_LABELS;

  return (
    <div
      /** Horizontal centered layout with small padding */
      className="flex items-center justify-center gap-2 py-1.5 text-[10px] border-t transition-all duration-300"
      /** Dynamic pink-tinted background and border from theme */
      style={{
        background: `${COPILOT_THEME.primary}08`,
        borderColor: `${COPILOT_THEME.primary}20`,
        color: COPILOT_THEME.primaryLight,
      }}
    >
      {/* Green pulse dot — visually indicates the copilot loop is alive */}
      <div
        className="w-1.5 h-1.5 rounded-full animate-pulse"
        style={{ backgroundColor: ALIVE_DOT_COLOR }}
      />
      {/* Status text: localised "Copilot Active — monitoring every Ns" */}
      <span>{labels.statusActive[language](pollIntervalSec)}</span>
      {/* Action count suffix: only shown when at least one action was taken */}
      {totalActions > 0 && (
        <span className="opacity-60">
          {/* Bullet separator + localised action count */}•{" "}
          {labels.actionCountSuffix[language](totalActions)}
        </span>
      )}
    </div>
  );
}
