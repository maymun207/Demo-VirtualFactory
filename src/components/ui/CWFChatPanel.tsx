/**
 * CWFChatPanel.tsx — Chat With your Factory UI Panel (Right-Docked Side Panel)
 *
 * This module implements the "Chat With your Factory" (CWF) interface.
 * It is a right-docked, resizable side panel that interacts with the CWF AI agent.
 * The panel provides a glassmorphic interface with real-time markdown messaging,
 * quick actions, and simulation connectivity status.
 *
 * Design: "Sentient Dark" theme with cyan/teal gradients.
 * Layout: Pushes main content via dynamic width adjustment.
 * Interactions: Drag-to-resize, keyboard shortcuts, and bilingual support.
 */

import {
  useState, // State management for local input and UI toggles
  useRef, // Multi-purpose refs for auto-scroll and input focus
  useEffect, // Side effect handling for scroll pinning and initial focus
  useCallback, // Memoizing event handlers for performance
  type KeyboardEvent, // Type definition for keyboard interactions
} from "react"; // React core hooks and types
import {
  Send, // IconButton for message dispatch
  X, // IconButton for panel dismissal
  Trash2, // IconButton for history clearing
  Database, // Icon for tool usage tracking
  Bot, // Icon for assistant message attribution
  User, // Icon for user message attribution
  Loader2, // Animated icon for loading states
  BarChart3, // QuickAction icon for performance
  AlertTriangle, // QuickAction icon for diagnostics
  Search, // QuickAction icon for investigation
  Activity, // QuickAction icon for status
  Zap, // QuickAction icon for optimization
  Lightbulb, // QuickAction icon for insights
  Sparkles, // Primary branding sparkle icon
  MessageSquare, // Fallback icon for quick actions
  MessageSquarePlus, // Quick actions dropdown trigger icon
  ChevronDown, // Dropdown toggle icon
  CheckCircle2, // Selection marker icon
  ShieldCheck, // Copilot mode indicator icon
} from "lucide-react"; // Comprehensive icon library
import {
  useCWFStore, // Accessing AI agent state and message history
  CWF_QUICK_ACTIONS, // Pre-defined query template definitions
  type CWFMessage, // Type representing a single chat entry
} from "../../store/cwfStore"; // CWF state management layer
import { useUIStore } from "../../store/uiStore"; // Global UI layout and width state
import { useTranslation } from "../../hooks/useTranslation"; // Localization utility for TR/EN
import {
  CWF_SIDE_PANEL_HANDLE_WIDTH, // Fixed width for the resize interaction area
  CWF_UI_CONFIG, // Centralized styling configuration for gradients/colors
} from "../../lib/params"; // Parametrization module for all UI constants
import { useCopilotStore } from "../../store/copilotStore"; // Copilot UI state
/** Single source of truth for session UUID and session code */
import { useSimulationDataStore } from "../../store/simulationDataStore";
import { useCopilotHeartbeat } from "../../hooks/useCopilotHeartbeat"; // Browser heartbeat sender
import { useCopilotLifecycle } from "../../hooks/useCopilotLifecycle"; // Auto-disengage + Realtime sync
import { COPILOT_THEME } from "../../lib/params/copilot"; // Copilot pink theme constants
import { CopilotToggleButton } from "./copilot/CopilotToggleButton"; // Extracted copilot header button
import { CopilotStatusBar } from "./copilot/CopilotStatusBar"; // Extracted copilot status bar
import { CopilotMessageBadge } from "./copilot/CopilotMessageBadge"; // Extracted copilot message badge

// ─── Icon Map for Quick Actions ──────────────────────────────────────────────

/**
 * ICON_MAP
 *
 * Maps icon identifier strings defined in CWF_QUICK_ACTIONS
 * to their respective Lucide icon component for dynamic rendering.
 */
const ICON_MAP: Record<string, typeof BarChart3> = {
  BarChart3, // Performance/Stats icon link
  AlertTriangle, // Alarm/Warning icon link
  Search, // Investigation/Search icon link
  Activity, // Real-time status icon link
  Zap, // Speed/Power icon link
  Lightbulb, // Insight/Optimization icon link
};

// ─── Simple Markdown Renderer ────────────────────────────────────────────────

/**
 * formatInlineMarkdown
 *
 * Parses a string for basic markdown patterns (bold, code, italic) and
 * converts them into styled React nodes for inline display.
 *
 * @param text - The raw text string to parse
 * @returns An array of string or JSX elements with styling applied
 */
function formatInlineMarkdown(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = []; // Accumulator for parsed segments
  const regex = /(\*\*(.+?)\*\*)|(`(.+?)`)|(_(.+?)_)/g; // Regex for **bold**, `code`, and _italic_
  let lastIndex = 0; // Tracking cursor for the original string
  let match; // Current regex match object

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index)); // Push unmatched plain text before the match
    }
    if (match[2]) {
      // Bold text handling (**text**)
      parts.push(
        <strong key={match.index} className="text-white font-semibold">
          {match[2]}
        </strong>, // Render emphasized bold text
      );
    } else if (match[4]) {
      // Inline code handling (`text`)
      parts.push(
        <code
          key={match.index}
          className={`px-1.5 py-0.5 bg-white/10 rounded text-cyan-300 ${CWF_UI_CONFIG.codeFontSize} font-mono`}
        >
          {match[4]}
        </code>, // Render mono-spaced code highlight
      );
    } else if (match[6]) {
      // Italic text handling (_text_)
      parts.push(
        <em key={match.index} className="text-white/70 italic">
          {match[6]}
        </em>, // Render slanted italic text
      );
    }
    lastIndex = match.index + match[0].length; // Advance cursor past match
  }

  if (lastIndex < text.length) parts.push(text.slice(lastIndex)); // Push remaining plain text
  return parts.length > 0 ? parts : [text]; // Return segments or original text if no matches
}

/**
 * renderMarkdown
 *
 * Splits multi-line text and renders various markdown block types
 * (headings, bullet points, numbered lists, paragraphs) into React elements.
 *
 * @param text - The full multi-line markdown content
 * @returns Array of JSX elements representable as content blocks
 */
function renderMarkdown(text: string): React.ReactNode[] {
  return text.split("\n").map((line, i) => {
    const trimmed = line.trim(); // Remove leading/trailing whitespace

    if (!trimmed) return <div key={i} className="h-2" />; // Render vertical spacer for empty lines

    if (trimmed.startsWith("### "))
      // H3 heading style (### text)
      return (
        <h4 key={i} className="text-sm font-bold text-cyan-300 mt-3 mb-1">
          {formatInlineMarkdown(trimmed.slice(4))}
        </h4> // Render level 3 section header
      );
    if (trimmed.startsWith("## "))
      // H2 heading style (## text)
      return (
        <h3 key={i} className="text-sm font-bold text-cyan-200 mt-3 mb-1">
          {formatInlineMarkdown(trimmed.slice(3))}
        </h3> // Render level 2 section header
      );

    if (
      trimmed.startsWith("- ") ||
      trimmed.startsWith("• ") ||
      trimmed.startsWith("* ")
    )
      // Unordered list item style (-/•/* text)
      return (
        <div key={i} className="flex gap-2 ml-2 my-0.5">
          <span className="text-cyan-400 shrink-0">•</span>
          <span
            className={`text-white/80 ${CWF_UI_CONFIG.messageFontSize} leading-relaxed`}
          >
            {formatInlineMarkdown(trimmed.slice(2))}
          </span>
        </div> // Render bulleted list item
      );

    const numbered = trimmed.match(/^(\d+)\.\s(.+)/); // Match patterns like "1. text"
    if (numbered)
      // Ordered list item style (1. text)
      return (
        <div key={i} className="flex gap-2 ml-2 my-0.5">
          <span
            className={`text-cyan-400 shrink-0 ${CWF_UI_CONFIG.messageFontSize} w-4 text-right`}
          >
            {numbered[1]}.
          </span>
          <span
            className={`text-white/80 ${CWF_UI_CONFIG.messageFontSize} leading-relaxed`}
          >
            {formatInlineMarkdown(numbered[2])}
          </span>
        </div> // Render numbered list item
      );

    // Default paragraph rendering
    return (
      <p
        key={i}
        className={`text-white/80 ${CWF_UI_CONFIG.messageFontSize} leading-relaxed my-0.5`}
      >
        {formatInlineMarkdown(trimmed)}
      </p> // Render standard text paragraph
    );
  });
}

// ─── Typing Indicator ────────────────────────────────────────────────────────

/**
 * TypingIndicator
 *
 * Renders an animated "thinking" state for the AI agent, including
 * an icon, status text, and bouncing dots.
 *
 * @param text - Localized thinking message (e.g. "Analyzing...")
 */
function TypingIndicator({
  text,
  isCopilotActive = false,
}: {
  text: string;
  isCopilotActive?: boolean;
}) {
  /** Accent colour class — pink when copilot is active, cyan otherwise */
  const accentClass = isCopilotActive ? "text-pink-400" : "text-cyan-400";
  /** Dot background — pink when copilot is active, cyan otherwise */
  const dotClass = isCopilotActive ? "bg-pink-400" : "bg-cyan-400";
  return (
    <div className="flex items-center gap-2 px-4 py-3">
      {/* Bot icon to indicate AI response origin */}
      <Bot size={16} className={`${accentClass} shrink-0`} />{" "}
      {/* Assistant identity icon */}
      {/* thinking text (e.g., "Analyzing...") */}
      <span className="text-white/50 text-sm">{text}</span>{" "}
      {/* Informational status text */}
      {/* Three bouncing dots with staggered animation delays */}
      <span className="flex gap-0.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={`w-1.5 h-1.5 ${dotClass} rounded-full animate-bounce`}
            style={{
              animationDelay: `${i * 0.15}s`, // Staggered start times
              animationDuration: "0.6s", // Consistent jump speed
            }}
          /> // Individual animated dot element
        ))}
      </span>
    </div>
  );
}

// ─── Message Bubble ──────────────────────────────────────────────────────────

/**
 * MessageBubble
 *
 * High-level component that renders a single chat message based on the sender's role
 * (user, system, or assistant). Applies distinct styling for each role.
 *
 * @param message - The CWFMessage object containing content and metadata
 * @param language - Current session language for localization
 */
function MessageBubble({
  message,
  language: _language,
  isCopilotActive = false,
}: {
  message: CWFMessage;
  language: "tr" | "en";
  isCopilotActive?: boolean;
}) {
  const t = useTranslation("cwf"); // Localized strings for CWF context

  // Handle System messages — delegated to CopilotMessageBadge component
  // which handles both copilot (pink) and normal (grey) system messages.
  if (message.role === "system") {
    return (
      <CopilotMessageBadge content={message.content} isError={message.error} />
    );
  }

  // Handle User messages (outgoing requests)
  if (message.role === "user") {
    return (
      <div className="flex justify-end mb-3">
        {" "}
        {/* Right-align user messages */}
        <div className="max-w-[85%] flex gap-2 items-start">
          {" "}
          {/* Limit width for readability */}
          {/* User message bubble with gradient background from configuration */}
          <div
            className={`${isCopilotActive ? "bg-linear-to-br from-pink-500/20 to-pink-600/10 border-pink-500/30" : CWF_UI_CONFIG.userBubbleGradient} border rounded-2xl rounded-tr-sm px-2 py-2.5 select-text cursor-text`}
          >
            {" "}
            {/* Apply user branding — pink variant when copilot is active */}
            <p
              className={`text-white/90 ${CWF_UI_CONFIG.messageFontSize} leading-relaxed`}
            >
              {message.content} {/* Display message payload */}
            </p>
          </div>
          {/* User avatar circle — pink when copilot is active, cyan default */}
          <div
            className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 border ${
              isCopilotActive
                ? "bg-pink-500/20 border-pink-500/40"
                : "bg-cyan-500/20 border-cyan-500/40"
            }`}
          >
            {" "}
            {/* Profile placeholder */}
            <User
              size={14}
              className={isCopilotActive ? "text-pink-400" : "text-cyan-400"}
            />{" "}
            {/* Identity symbol */}
          </div>
        </div>
      </div>
    );
  }

  // Handle Assistant messages (incoming AI responses)
  if (message.isStreaming)
    return (
      <TypingIndicator text={t("thinking")} isCopilotActive={isCopilotActive} />
    ); // Show motion during arrival

  return (
    <div className="flex justify-start mb-3 cwf-fade-in">
      {" "}
      {/* Left-align assistant responses with entry effect */}
      <div className="max-w-[98%] flex gap-2 items-start">
        {" "}
        {/* Allow more width for complex tables/markdown */}
        {/* Assistant avatar with accent gradient — pink when copilot active */}
        <div
          className={`w-7 h-7 rounded-full border flex items-center justify-center shrink-0 mt-0.5 ${
            isCopilotActive
              ? "bg-linear-to-br from-pink-500/30 to-pink-600/20 border-pink-500/40"
              : CWF_UI_CONFIG.accentGradient
          }`}
        >
          {" "}
          {/* Agent presence */}
          <Sparkles
            size={14}
            className={isCopilotActive ? "text-pink-300" : "text-cyan-300"}
          />{" "}
          {/* Intelligence symbol */}
        </div>
        <div className="flex-1">
          {" "}
          {/* Adaptive container for content */}
          {/* Assistant message content area with glassmorphic styling */}
          <div
            className={`bg-white/5 border rounded-2xl rounded-tl-sm px-2 py-3 select-text cursor-text ${
              message.error
                ? "border-red-500/30 bg-red-500/5" // Negative state aesthetic
                : isCopilotActive
                  ? "border-pink-500/20 bg-pink-500/5" // Copilot pink accent
                  : "border-white/10" // Default state aesthetic
            }`}
          >
            {renderMarkdown(message.content)}{" "}
            {/* Transform markdown to interactable nodes */}
          </div>
          {/* Optional: Counter badge for external tool calls executed by the agent */}
          {message.toolCallCount != null && message.toolCallCount > 0 && (
            <div className="flex items-center gap-1 mt-1.5 ml-1">
              {" "}
              {/* Info row for tool state */}
              <Database size={11} className="text-white/30" />{" "}
              {/* Data source icon */}
              <span className="text-[11px] text-white/30">
                {message.toolCallCount} {t("toolCalls")}{" "}
                {/* Localized usage count */}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Welcome Screen ──────────────────────────────────────────────────────────

/**
 * WelcomeScreen
 *
 * Initial view shown when the chat is empty. Greets the user,
 * provides a brief description, and offers quick action shortcuts.
 *
 * @param language - Current UI language for bilingual button labels
 * @param onQuickAction - Callback triggered when a quick action is clicked
 */
function WelcomeScreen({
  language,
  onQuickAction,
}: {
  language: "tr" | "en";
  onQuickAction: (q: string) => void;
}) {
  const t = useTranslation("cwf"); // Localization for first-run UI

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
      {" "}
      {/* Centered layout for instructions */}
      {/* Large central icon with accent gradient */}
      <div
        className={`w-16 h-16 rounded-2xl ${CWF_UI_CONFIG.accentGradient} border flex items-center justify-center mb-4`}
      >
        {" "}
        {/* Hero-style icon container */}
        <Sparkles size={28} className="text-cyan-400" />{" "}
        {/* Large branding sparkle */}
      </div>
      {/* localized greeting and instructions */}
      <h3 className="text-lg font-bold text-white mb-2">
        {t("welcomeTitle")}
      </h3>{" "}
      {/* Main greeting */}
      <p className="text-white/50 text-sm mb-6 max-w-xs leading-relaxed">
        {t("welcomeMessage")} {/* Descriptive helpful text */}
      </p>
      {/* Grid of predefined queries for easy selection */}
      <div className="w-full space-y-2">
        {" "}
        {/* Shortcut selector section */}
        <p className="text-white/30 text-xs uppercase tracking-wider mb-2">
          {t("quickActions")} {/* Section title for templates */}
        </p>
        <div className="grid grid-cols-2 gap-2">
          {" "}
          {/* Balanced 2-column action grid */}
          {CWF_QUICK_ACTIONS.map((action, i) => {
            const Icon = ICON_MAP[action.icon] || MessageSquare; // Dynamic icon resolution
            return (
              <button
                key={i} // Efficient mapping key
                onClick={() => onQuickAction(action.query[language])} // Execute localized template
                className="flex items-center gap-2 px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-cyan-500/30 rounded-xl transition-all duration-200 text-left group"
              >
                {" "}
                {/* Interactive tile with state transitions */}
                <Icon
                  size={12}
                  className="text-white/30 group-hover:text-cyan-400 transition-colors shrink-0"
                />{" "}
                {/* Tile prefix icon */}
                <span className="text-white/60 group-hover:text-white/90 text-[10px] transition-colors leading-tight">
                  {action.label[language]} {/* Action-specific label */}
                </span>
              </button> // End of tile interaction
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Simulation History Dropdown ─────────────────────────────────────────────

/**
 * SimulationHistoryDropdown
 *
 * Renders a glassmorphic dropdown list of past simulation sessions.
 * Allows users to see which session the CWF agent is currently synchronized with.
 */
function SimulationHistoryDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const t = useTranslation("cwf");

  const history = useCWFStore((s) => s.simulationHistory);
  /**
   * SINGLE SOURCE OF TRUTH: session data lives in simulationDataStore.
   * Read directly from there instead of from a mirror copy in cwfStore.
   */
  const currentId = useSimulationDataStore((s) => s.session?.id ?? null);
  const currentSessionCode = useSimulationDataStore((s) => s.session?.session_code ?? null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-white/5 transition-colors group"
      >
        <div className="flex flex-col items-start">
          <h2 className="text-sm font-bold text-white leading-tight">
            {t("panelTitle")}
          </h2>
          <div className="flex items-center gap-1">
            <div
              className={`w-1.5 h-1.5 rounded-full ${currentId ? "bg-green-400" : "bg-red-400"} shadow-[0_0_8px_rgba(74,222,128,0.5)]`}
            />
            <span className="text-[10px] text-white/50 group-hover:text-white/80 transition-colors">
              {currentId ? `${currentSessionCode}` : t("noSimulation")}
            </span>
            <ChevronDown
              size={10}
              className={`text-white/30 transform transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
            />
          </div>
        </div>
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-2 w-64 bg-black/90 backdrop-blur-2xl border border-white/10 rounded-xl shadow-2xl z-50 py-2 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="px-3 py-1.5 border-b border-white/5 mb-1">
            <span className="text-[10px] font-bold text-white/30 uppercase tracking-wider">
              {t("simulationHistory") || "Simulation History"}
            </span>
          </div>
          <div className="max-h-60 overflow-y-auto custom-scrollbar">
            {history.length === 0 ? (
              <div className="px-4 py-3 text-xs text-white/40 italic">
                {t("noHistory") || "No simulation history found"}
              </div>
            ) : (
              history.map((entry) => (
                <div
                  key={entry.uuid}
                  className={`px-4 py-2.5 flex items-center justify-between border-l-2 transition-colors ${
                    entry.uuid === currentId
                      ? "bg-cyan-500/10 border-cyan-500"
                      : "border-transparent hover:bg-white/5"
                  }`}
                >
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-white/90">
                        {entry.sessionCode}
                      </span>
                      <span className="text-[10px] text-white/30 truncate max-w-[100px]">
                        ID: {entry.uuid.slice(0, 8)}...
                      </span>
                    </div>
                    <span className="text-[10px] text-white/40">
                      {new Date(entry.startedAt).toLocaleString([], {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  {entry.uuid === currentId && (
                    <CheckCircle2
                      size={14}
                      className="text-cyan-400 shadow-cyan-500/50"
                    />
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Quick Actions Dropdown ──────────────────────────────────────────────────

/**
 * QuickActionsDropdown
 *
 * A header-mounted dropdown that provides persistent access to the 6 predefined
 * Quick Questions (Production Summary, Scrap Analysis, Defect Map, etc.).
 * Unlike the WelcomeScreen which disappears once chatting starts, this dropdown
 * is always available in the CWF header toolbar.
 *
 * @param language  - Current UI language for bilingual labels
 * @param onSelect  - Callback triggered when a quick action is clicked
 * @param disabled  - Whether clicking is disabled (e.g. during AI loading)
 */
function QuickActionsDropdown({
  language,
  onSelect,
  disabled,
}: {
  language: "tr" | "en";
  onSelect: (query: string) => void;
  disabled: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false); // Tracks dropdown visibility
  const dropdownRef = useRef<HTMLDivElement>(null); // Reference for click-outside detection
  const t = useTranslation("cwf"); // Localization for section header

  // Close dropdown when clicking outside its boundary
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false); // Dismiss on external click
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside); // Listen only when open
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside); // Cleanup on close or unmount
    };
  }, [isOpen]);

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger button — always visible in the header toolbar */}
      <button
        onClick={() => setIsOpen(!isOpen)} // Toggle dropdown visibility
        disabled={disabled} // Prevent interaction during AI processing
        className="p-1.5 hover:bg-white/10 rounded-lg transition-colors group"
        title={t("quickActions") || "Quick Questions"} // Tooltip for accessibility
      >
        <MessageSquarePlus
          size={14}
          className={`transition-colors ${
            isOpen
              ? "text-cyan-400" // Active state: highlighted
              : "text-white/30 group-hover:text-white/60" // Default: subtle with hover
          }`}
        />
      </button>

      {/* Dropdown panel — glassmorphic overlay with quick action grid */}
      {isOpen && (
        <div className="absolute top-full right-0 mt-2 w-72 bg-black/90 backdrop-blur-2xl border border-white/10 rounded-xl shadow-2xl z-50 py-2 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
          {/* Section header */}
          <div className="px-3 py-1.5 border-b border-white/5 mb-1">
            <span className="text-[10px] font-bold text-white/30 uppercase tracking-wider">
              {t("quickActions") || "Quick Questions"}
            </span>
          </div>
          {/* Quick action buttons — 2-column grid; auto-rows-fr makes all cells in a row equal height */}
          <div className="px-2 py-1 grid grid-cols-2 auto-rows-fr gap-1.5">
            {CWF_QUICK_ACTIONS.map((action, i) => {
              const Icon = ICON_MAP[action.icon] || MessageSquare; // Resolve icon component
              return (
                <button
                  key={i}
                  onClick={() => {
                    onSelect(action.query[language]); // Dispatch the localized query
                    setIsOpen(false); // Close dropdown after selection
                  }}
                  // min-h ensures short labels stay tall; h-full stretches button to fill the grid cell
                  className="flex items-start gap-2 px-2.5 py-2 min-h-[44px] h-full bg-white/5 hover:bg-white/10 border border-white/10 hover:border-cyan-500/30 rounded-lg transition-all duration-200 text-left group"
                >
                  <Icon
                    size={11}
                    className="text-white/30 group-hover:text-cyan-400 transition-colors shrink-0 mt-px"
                  />
                  {/* break-words allows long labels like "Recommendations" to wrap cleanly */}
                  <span className="text-white/60 group-hover:text-white/90 text-[10px] transition-colors leading-tight wrap-break-word min-w-0">
                    {action.label[language]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * CWFChatPanel (Main Export)
 *
 * Orchestrates the overall side panel functionality including
 * layout distribution, resize logic, and message state management.
 */
export function CWFChatPanel() {
  const t = useTranslation("cwf"); // Access strings via custom hook
  const language = useUIStore((s) => s.currentLang); // Observe active language
  const toggleCWF = useUIStore((s) => s.toggleCWF); // Wire-up close handler
  const setCwfPanelWidth = useUIStore((s) => s.setCwfPanelWidth); // Bind width adjustment logic

  const messages = useCWFStore((s) => s.messages); // Track chat history
  const isLoading = useCWFStore((s) => s.isLoading); // Track agent processing status
  const sendMessage = useCWFStore((s) => s.sendMessage); // Access send logic
  const clearMessages = useCWFStore((s) => s.clearMessages); // Access purge logic
  /** Simulation session ID — read from the single source of truth: simulationDataStore */
  const simulationId = useSimulationDataStore((s) => s.session?.id ?? null);

  /** ── Copilot State ───────────────────────────────────────────────────── */
  /**
   * Read copilot enabled state from the store.
   * The isEnabled flag is derived from cwfState inside syncStateFromCloud():
   *   isEnabled = (cwfState === 'copilot_active')
   * It is the ONLY reactive indicator that Supabase copilot_config has been
   * synced — NO local overrides, NO OR-fallbacks, NO parallel states.
   */
  const isCopilotEnabled = useCopilotStore((s) => s.isEnabled);
  const copilotTotalActions = useCopilotStore((s) => s.totalActions); // Corrective action count

  /**
   * Mount copilot lifecycle hooks:
   * - useCopilotHeartbeat: sends POST every 5s while copilot is active
   * - useCopilotLifecycle: syncs copilot_config/copilot_actions via Realtime,
   *   auto-disengages on simulation stop
   */
  useCopilotHeartbeat();
  useCopilotLifecycle();

  const [input, setInput] = useState(""); // Managed state for message text
  const messagesEndRef = useRef<HTMLDivElement>(null); // Anchor pointer for scroll lock
  const inputRef = useRef<HTMLTextAreaElement>(null); // DOM pointer for focus capture
  const isDragging = useRef(false); // Direct mutable state for event targeting

  // Auto-scrolling side effect: triggers when messages array updates
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); // Smooth slide to bottom
  }, [messages]); // Dependency on message count change

  // Initial focus effect: yields focus to CTA after panel opens
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 300); // Deferred focus for layout stabilization
  }, []); // Run only on mount

  // Re-focus input after each new message is appended to the chat history.
  // Using useEffect (not requestAnimationFrame) so focus is set AFTER React
  // has fully committed all state updates — including the new message bubble
  // and isLoading flag — to the DOM. rAF fires too early, before React's
  // commit phase completes, so subsequent renders steal the focus back.
  useEffect(() => {
    if (messages.length > 0) {
      inputRef.current?.focus(); // Return cursor to text box after send
    }
  }, [messages.length]); // Fires once per message added

  // ─── Resize Handle Logic ────────────────────────────────────────────

  // Calculates new width based on MouseEvent X position relative to viewport
  const handleResizeMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging.current) return; // Guard against rogue move events
      const newWidth = window.innerWidth - e.clientX; // Determine width from right edge
      setCwfPanelWidth(newWidth); // Dispatch width update to store
    },
    [setCwfPanelWidth], // Re-bind on store action change
  );

  // Touch-compatible resize logic (for mobile users)
  const handleResizeTouchMove = useCallback(
    (e: TouchEvent) => {
      if (!isDragging.current) return; // Guard against accidental touch drags
      const newWidth = window.innerWidth - e.touches[0].clientX; // Capture first point
      setCwfPanelWidth(newWidth); // Dispatch width update to store
    },
    [setCwfPanelWidth], // Re-bind on store action change
  );

  // Terminates drag session and cleans up global event listeners
  const handleResizeEnd = useCallback(() => {
    isDragging.current = false; // Reset drag session flag
    document.body.style.cursor = ""; // Normalize system cursor
    document.body.style.userSelect = ""; // Allow text selection again
    document.removeEventListener("mousemove", handleResizeMove); // Detach mouse listener
    document.removeEventListener("mouseup", handleResizeEnd); // Detach release listener
    document.removeEventListener("touchmove", handleResizeTouchMove); // Detach touch listener
    document.removeEventListener("touchend", handleResizeEnd); // Detach touch release
  }, [handleResizeMove, handleResizeTouchMove]); // Clear references

  // Initiates drag session via MouseDown on the handle
  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault(); // suppress browser defaults
      isDragging.current = true; // start session tracking
      document.body.style.cursor = "col-resize"; // lock visual cursor state
      document.body.style.userSelect = "none"; // disable UI interaction interference
      document.addEventListener("mousemove", handleResizeMove); // listen for moves
      document.addEventListener("mouseup", handleResizeEnd); // listen for release
    },
    [handleResizeMove, handleResizeEnd], // Prepare callbacks
  );

  // Initiates drag session via TouchStart for tablets
  const handleResizeTouchStart = useCallback(
    (e: React.TouchEvent) => {
      e.preventDefault(); // suppress scrolling interference
      isDragging.current = true; // start session tracking
      document.body.style.userSelect = "none"; // disable text interference
      document.addEventListener("touchmove", handleResizeTouchMove); // listen for touches
      document.addEventListener("touchend", handleResizeEnd); // listen for release
    },
    [handleResizeTouchMove, handleResizeEnd], // Prepare callbacks
  );

  // ─── Message Handling ────────────────────────────────────────────────

  // Trims input and dispatches message to store if valid.
  // Focus is returned to the textarea automatically by the messages.length
  // useEffect above — no manual focus call needed here.
  const handleSend = () => {
    const trimmed = input.trim(); // strip extraneous whitespace
    if (!trimmed || isLoading) return; // ignore invalid states
    setInput(""); // wipe UI for confirmation
    sendMessage(trimmed, language); // route to backend logic
  };

  // Maps keyboard events for fluid conversation flow
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault(); // bypass newline default
      handleSend(); // trigger transmission
    }
  };

  const hasMessages = messages.length > 0; // Check history length for UI switching

  return (
    <div className="w-full h-full flex flex-row">
      {" "}
      {/* Side-by-side assembly wrap */}
      {/* ── Resize Handle (left edge of panel) ──────────────────────── */}
      <div
        className="cwf-resize-handle h-full shrink-0 flex items-center justify-center group" // Hit area with interactive grouping
        style={{ width: CWF_SIDE_PANEL_HANDLE_WIDTH }} // Width drive from params module
        onMouseDown={handleResizeStart} // Direct mouse entry point
        onTouchStart={handleResizeTouchStart} // Direct touch entry point
      >
        {/* Visual vertical marker with dynamic glow on interaction — pink when copilot active */}
        <div
          className={`w-[2px] h-12 rounded-full transition-colors duration-200 ${
            isCopilotEnabled
              ? "bg-pink-400/30 group-hover:bg-pink-400/60"
              : "bg-white/10 group-hover:bg-cyan-400/50"
          }`}
        />{" "}
        {/* Centered aesthetic marker */}
      </div>
      {/* ── Panel Content Container ─────────────────────────────────── */}
      <div
        className={`flex-1 h-full flex flex-col backdrop-blur-2xl border-l shadow-2xl overflow-hidden cwf-slide-in transition-all duration-500 ${
          isCopilotEnabled
            ? "border-pink-500/40 shadow-pink-500/20 bg-linear-to-b from-pink-950/40 via-black/80 to-pink-950/30" // Bright pink theme
            : "border-white/10 shadow-cyan-500/10 bg-black/80" // Default cyan glow
        }`}
      >
        {" "}
        {/* Main glass viewport — switches to pink accent when copilot is active */}
        {/* ── Header Area ────────────────────────────────────────────── */}
        <div
          className={`flex items-center justify-between px-4 py-3 border-b transition-all duration-500 ${
            isCopilotEnabled
              ? "border-pink-500/30" // Pink border glow when copilot is active
              : "border-white/10" // Default subtle border
          }`}
          style={isCopilotEnabled ? { background: COPILOT_THEME.headerBg } : {}}
        >
          {" "}
          {/* Top bar structure — applies copilot pink theme when active */}
          <div className="flex items-center gap-2">
            {" "}
            {/* Left grouping: ID + Status + History Dropdown */}
            {/* Branding Sparkle with accent gradient from config — pink when copilot active */}
            <div
              className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-500 ${
                isCopilotEnabled
                  ? "" // Use inline style for pink gradient
                  : CWF_UI_CONFIG.accentGradient
              }`}
              style={
                isCopilotEnabled
                  ? {
                      background: `linear-gradient(135deg, ${COPILOT_THEME.primary}40, ${COPILOT_THEME.primaryDark}60)`,
                      border: `1px solid ${COPILOT_THEME.primary}60`,
                    }
                  : {}
              }
            >
              {" "}
              {/* Mini-logo container */}
              {isCopilotEnabled ? (
                <ShieldCheck
                  size={16}
                  className="text-pink-300"
                /> /* Copilot shield icon */
              ) : (
                <Sparkles
                  size={16}
                  className="text-cyan-300"
                /> /* Default AI symbol */
              )}
            </div>
            <SimulationHistoryDropdown />
          </div>
          {/* Header Actions: Reset Conversation and Close Panel */}
          <div className="flex items-center gap-1">
            {" "}
            {/* ── Copilot Toggle Button — Extracted Component ────────── */}
            <CopilotToggleButton
              isEnabled={isCopilotEnabled}
              totalActions={copilotTotalActions}
              language={language}
              isLoading={isLoading}
              simulationId={simulationId}
              onSendMessage={sendMessage}
            />
            {/* Quick Actions dropdown — always accessible for predefined queries */}
            <QuickActionsDropdown
              language={language}
              onSelect={(q) => sendMessage(q, language)}
              disabled={isLoading}
            />
            {hasMessages && (
              <button
                onClick={clearMessages} // clear history trigger
                className="p-1.5 hover:bg-white/10 rounded-lg transition-colors" // clickable icon container
                title={t("clearChat")} // Contextual tooltip
              >
                <Trash2
                  size={14}
                  className="text-white/30 hover:text-white/60" // Subtle icon states
                />
              </button>
            )}
            <button
              onClick={toggleCWF} // dismiss panel trigger
              className="p-1.5 hover:bg-white/10 rounded-lg transition-colors" // clickable icon container
            >
              <X size={16} className="text-white/40 hover:text-white/80" />{" "}
              {/* Close glyph */}
            </button>
          </div>
        </div>
        {/* ── Messages Scrollable Viewport ────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-1 py-3 select-text">
          {" "}
          {/* Conversation stream area */}
          {!hasMessages ? (
            /* display welcome state if no message history exists */
            <WelcomeScreen
              language={language} // current context
              onQuickAction={(q) => sendMessage(q, language)} // shortcut wire-up
            />
          ) : (
            <>
              {/* Map current messages to styled segments */}
              {messages.map((msg) => (
                <MessageBubble
                  key={msg.id}
                  message={msg}
                  language={language}
                  isCopilotActive={isCopilotEnabled}
                /> // Individual bubble unit
              ))}
              {/* Scrolling anchor: ensures visibility of latest messages */}
              <div ref={messagesEndRef} /> {/* Auto-scroller Target */}
            </>
          )}
        </div>
        {/* ── Copilot Status Bar — Extracted Component ─────────────── */}
        {isCopilotEnabled && (
          <CopilotStatusBar
            totalActions={copilotTotalActions}
            language={language}
          />
        )}
        {/* ── Input Interaction Area ─────────────────────────────────── */}
        <div
          className={`border-t px-1 py-2 transition-all duration-300 ${
            isCopilotEnabled ? "border-pink-500/20" : "border-white/10"
          }`}
        >
          {" "}
          {/* Composer wrap */}
          <div className="flex items-center gap-2">
            {" "}
            {/* Row distribution for text/button */}
            {/* Multi-line message composer (auto-expanding style) */}
            <textarea
              ref={inputRef} // bind focus target
              value={input} // sync current text
              onChange={(e) => setInput(e.target.value)} // update text capture
              onKeyDown={handleKeyDown} // map Enter key
              placeholder={t("placeholder")} // localized CTA
              // NOTE: do NOT set disabled={isLoading} here.
              // A disabled element cannot receive focus() — the browser silently
              // ignores any .focus() call on it. Instead we keep the textarea
              // always focusable and communicate loading state visually via
              // opacity and aria-busy. The send guard in handleSend() already
              // prevents submission while isLoading is true.
              aria-busy={isLoading} // accessibility hint during loading
              rows={1} // initial compact height
              className={`flex-1 bg-white/5 border rounded-xl px-3 py-2 text-white/90 ${CWF_UI_CONFIG.messageFontSize} placeholder-white/30 focus:outline-none resize-none max-h-24 transition-all h-[46px] ${
                isLoading ? "opacity-50" : "opacity-100"
              } ${
                isCopilotEnabled
                  ? "border-pink-500/30 focus:border-pink-500/50 focus:ring-1 focus:ring-pink-500/30"
                  : "border-white/10 focus:border-cyan-500/40 focus:ring-1 focus:ring-cyan-500/20"
              }`} // Pink focus ring when copilot is active
            />
            {/* Elevated Send Button — pink gradient when copilot active */}
            <button
              onClick={handleSend} // click trigger
              disabled={isLoading || !input.trim()} // dynamic eligibility logic
              className={`flex items-center justify-center w-[46px] h-[46px] disabled:from-white/10 disabled:to-white/10 disabled:text-white/30 text-white rounded-xl transition-all duration-200 shrink-0 ${
                isCopilotEnabled
                  ? "bg-linear-to-br from-pink-500 to-pink-600 hover:from-pink-400 hover:to-pink-500 shadow-lg shadow-pink-500/20"
                  : CWF_UI_CONFIG.sendButtonGradient
              }`} // Dynamic CTA button — pink when copilot is active
            >
              {isLoading ? (
                <Loader2 size={18} className="animate-spin" /> // Spinner during tool usage
              ) : (
                <Send size={18} /> // Default call-to-action glyph
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
