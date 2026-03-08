/**
 * CopilotToggleButton.tsx — Copilot Mode Toggle for CWF Panel Header
 *
 * Self-contained button component that appears in the CWF panel header toolbar.
 * Provides two visual states:
 *   - INACTIVE: A visible ShieldCheck icon with pink accent that glows on hover.
 *              Clicking sends the copilot activation message to CWF chat.
 *   - ACTIVE:  A glowing pink badge with pulse dot, "COPILOT" label,
 *              and action counter. Clicking sends the disable message.
 *
 * All text labels, colours, and messages are sourced from params/copilot.ts
 * (COPILOT_THEME and COPILOT_UI_LABELS) — no hard-coded values here.
 *
 * Used by:
 *   - src/components/ui/CWFChatPanel.tsx (rendered in the header toolbar)
 */

import { ShieldCheck } from "lucide-react";
import { COPILOT_THEME, COPILOT_UI_LABELS } from "../../../lib/params/copilot";

// =============================================================================
// PROPS INTERFACE
// =============================================================================

/**
 * Props accepted by the CopilotToggleButton component.
 * All values are injected by the parent (CWFChatPanel) rather than being
 * read from stores, keeping the component pure and testable.
 */
interface CopilotToggleButtonProps {
  /** Whether copilot mode is currently active */
  isEnabled: boolean;
  /** Number of copilot actions taken this session (shown in badge) */
  totalActions: number;
  /** Current UI language ('en' or 'tr') for bilingual labels */
  language: "en" | "tr";
  /** Whether the CWF agent is currently processing (disables button) */
  isLoading: boolean;
  /** Callback to send a chat message when the button is clicked */
  onSendMessage: (message: string, language: "en" | "tr") => void;
}

// =============================================================================
// COMPONENT
// =============================================================================

/**
 * CopilotToggleButton — Renders a header toolbar button for copilot mode.
 *
 * @param props - See CopilotToggleButtonProps interface above.
 * @returns React element — either an active pink badge or an inactive icon button.
 */
export function CopilotToggleButton({
  isEnabled,
  totalActions,
  language,
  isLoading,
  onSendMessage,
}: CopilotToggleButtonProps) {
  /** Resolve bilingual labels from the centralised params module */
  const labels = COPILOT_UI_LABELS;

  if (isEnabled) {
    /**
     * ACTIVE STATE — Glowing pink badge.
     * Shows pulse dot + "COPILOT" label + action count.
     * Click sends the disable message to CWF chat.
     */
    return (
      <button
        /** Send the localised disable message on click */
        onClick={() =>
          onSendMessage(labels.disableChatMessage[language], language)
        }
        /** Prevent double-clicks while CWF is processing */
        disabled={isLoading}
        /** Pink badge layout: horizontal flex, rounded, with glow */
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg mr-1 transition-all duration-300 hover:opacity-80 cursor-pointer"
        /** Dynamic pink glow styling from centralised theme */
        style={{
          background: `${COPILOT_THEME.primary}20`,
          border: `1px solid ${COPILOT_THEME.primary}40`,
          boxShadow: `0 0 12px ${COPILOT_THEME.glow}`,
        }}
        /** Tooltip: localised disable instruction */
        title={labels.disableTooltip[language]}
      >
        {/* Animated pink pulse dot — signals active monitoring */}
        <div
          className="w-2 h-2 rounded-full animate-pulse"
          style={{ backgroundColor: COPILOT_THEME.primary }}
        />
        {/* Badge label + action counter */}
        <span
          className="text-[10px] font-bold"
          style={{ color: COPILOT_THEME.primaryLight }}
        >
          {/* Static "COPILOT" label from params */}
          {labels.badgeLabel}{" "}
          {/* Action count: "(3)" if > 0, empty otherwise */}
          {totalActions > 0 ? `(${totalActions})` : ""}
        </span>
      </button>
    );
  }

  /**
   * INACTIVE STATE — Subtle icon button.
   * Shows a muted ShieldCheck icon that glows pink on hover.
   * Click sends the localised enable message to CWF chat.
   */
  return (
    <button
      /** Send the localised enable message on click */
      onClick={() =>
        onSendMessage(labels.enableChatMessage[language], language)
      }
      /** Prevent clicks while CWF is processing */
      disabled={isLoading}
      /** Compact icon button with pink hover glow */
      className="p-1.5 hover:bg-pink-500/20 rounded-lg transition-all duration-200 group mr-0.5 disabled:opacity-50 disabled:cursor-not-allowed"
      /** Inline pink border hint so the button is always discoverable */
      style={{
        border: `1px solid ${COPILOT_THEME.primary}25`,
      }}
      /** Tooltip: localised enable instruction */
      title={labels.enableTooltip[language]}
    >
      {/* Shield icon — visible pink tint when idle, brighter on hover */}
      <ShieldCheck
        size={16}
        className="text-pink-400/60 group-hover:text-pink-400 transition-colors"
      />
    </button>
  );
}
