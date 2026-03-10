/**
 * CopilotToggleButton.tsx — Copilot Mode Toggle for CWF Panel Header
 *
 * Self-contained button component that appears in the CWF panel header toolbar.
 * Provides two visual states:
 *   - INACTIVE: A subtle ShieldCheck icon that glows pink on hover.
 *               Clicking sends the copilot activation message to CWF chat (LLM-driven).
 *   - ACTIVE:   A glowing pink badge with:
 *                 • A GREEN indicator dot (signals "engine alive / healthy")
 *                 • "COPILOT" label + action counter in pink
 *               Clicking DIRECTLY calls the disable endpoint — no LLM roundtrip.
 *
 * Why direct API call on disable?
 *   Routing through the LLM on disable is slow and fragile. The user expects an
 *   immediate, reliable response when they press the toggle to stop copilot.
 *   The API call resets cwf_state='normal' in Supabase, which triggers Realtime
 *   → useCopilotLifecycle → syncStateFromCloud → isEnabled transitions to false
 *   → all pink theme reverts automatically.
 *
 * All text labels, colours, and messages are sourced from params/copilot.ts
 * (COPILOT_THEME and COPILOT_UI_LABELS) — no hard-coded values here.
 *
 * Used by:
 *   - src/components/ui/CWFChatPanel.tsx (rendered in the header toolbar)
 */

import { useState } from "react";
import { ShieldCheck, Loader2 } from "lucide-react";
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
  /** Whether the CWF agent is currently processing (disables button during message send) */
  isLoading: boolean;
  /** The active simulation session ID (needed for direct disable API call) */
  simulationId: string | null;
  /** Callback to send a chat message — used only for the ENABLE flow */
  onSendMessage: (message: string, language: "en" | "tr") => void;
  /** Optional callback fired after direct disable succeeds (e.g., add a chat message) */
  onDisabled?: () => void;
  /**
   * Fallback local disable — called when simulationId is null (e.g., after
   * factory reset) so the pink theme can still be cleared without a server call.
   */
  onLocalDisable?: () => void;
}

// =============================================================================
// COMPONENT
// =============================================================================

/**
 * CopilotToggleButton — Renders a header toolbar button for copilot mode.
 *
 * @param props - See CopilotToggleButtonProps interface above.
 * @returns React element — either an active green+pink badge or an inactive icon button.
 */
export function CopilotToggleButton({
  isEnabled,
  totalActions,
  language,
  isLoading,
  simulationId,
  onSendMessage,
  onDisabled,
  onLocalDisable,
}: CopilotToggleButtonProps) {
  /** Resolve bilingual labels from the centralised params module */
  const labels = COPILOT_UI_LABELS;

  /**
   * Local loading state for the direct disable API call.
   * Shown only during the brief network round-trip to prevent double-clicks.
   */
  const [isDisabling, setIsDisabling] = useState(false);

  // ===========================================================================
  // ACTIVE STATE — Glowing pink badge with green health indicator
  // ===========================================================================

  if (isEnabled) {
    /**
     * Handle direct disable: bypasses the LLM entirely.
     *
     * Calls /api/cwf/copilot/disable directly:
     *  1. POST to the engine endpoint to stop the polling loop.
     *  2. Supabase is updated server-side (cwf_state='normal').
     *  3. Realtime fires → useCopilotLifecycle → syncStateFromCloud → UI reverts.
     *
     * We do NOT update Zustand directly here — the Realtime event is the source of truth.
     */
    const handleDirectDisable = async () => {
      if (isDisabling) return;

      setIsDisabling(true);
      try {
        /**
         * When simulationId is null (factory reset cleared the session),
         * we can't call the server endpoint. Instead, perform a LOCAL-ONLY
         * disable so the pink theme clears and the UI returns to normal.
         */
        if (!simulationId) {
          onLocalDisable?.();
          onDisabled?.();
          return;
        }

        /** Call the disable endpoint — CWF dev server or Vercel function */
        await fetch("/api/cwf/copilot/disable", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ simulationId }),
        });
        /** Notify parent so it can add a system message to chat */
        onDisabled?.();
      } catch {
        /** Engine may already be stopped — the Supabase state reset is what matters */
      } finally {
        setIsDisabling(false);
      }
    };

    return (
      <button
        /** Direct disable — no LLM roundtrip */
        onClick={handleDirectDisable}
        /** Prevent double-clicks while the API call is in flight */
        disabled={isDisabling}
        /** Pink badge layout: horizontal flex, rounded, with glow */
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg mr-1 transition-all duration-300 hover:opacity-80 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
        /** Dynamic pink glow styling from centralised theme */
        style={{
          background: `${COPILOT_THEME.primary}20`,
          border: `1px solid ${COPILOT_THEME.primary}40`,
          boxShadow: `0 0 12px ${COPILOT_THEME.glow}`,
        }}
        /** Tooltip: localised disable instruction */
        title={labels.disableTooltip[language]}
      >
        {isDisabling ? (
          /** Spinner while awaiting the disable API response */
          <Loader2
            size={10}
            className="animate-spin"
            style={{ color: COPILOT_THEME.primary }}
          />
        ) : (
          /**
           * GREEN indicator dot — signals "engine is alive and monitoring".
           * Distinct from the pink branding: green = healthy/active status,
           * the same UX convention used in the simulation session dot in the header.
           */
          <div
            className="w-2 h-2 rounded-full animate-pulse"
            style={{ backgroundColor: "#4ade80" }} /** green-400 */
            title="Copilot engine active"
          />
        )}
        {/* Badge label + action counter in pink */}
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

  // ===========================================================================
  // INACTIVE STATE — Subtle icon button
  // ===========================================================================

  /**
   * INACTIVE STATE — shows a muted ShieldCheck icon that glows pink on hover.
   * Click sends the localised enable message to CWF chat (LLM-driven flow).
   * The LLM sets cwf_state='copilot_pending_auth' → asks for auth code.
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
