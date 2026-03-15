/**
 * DemoMessageBubble.tsx — Single Message Bubble in the DemoScreen Chat
 *
 * Renders one user, assistant, or system message as a styled chat bubble.
 * Streaming placeholder shows three bouncing dots while the AI responds.
 *
 * Special case: when message.imageUrl is set, the bubble renders a full-width
 * slide image (<img>) instead of text content. This is used by acts that inject
 * a local-only presentation slide before ARIA's spoken narrative.
 *
 * Used by: DemoChatView.tsx
 */

import type { DemoMessage } from "../../store/demoStore";

interface DemoMessageBubbleProps {
  /** The message data to render */
  message: DemoMessage;
}

/**
 * DemoMessageBubble — renders a single demo conversation turn.
 * User messages: right-aligned violet glass.
 * Assistant messages: left-aligned dark glass with whitespace-preserved text.
 * System messages: centered pill notifications.
 */
export const DemoMessageBubble: React.FC<DemoMessageBubbleProps> = ({
  message,
}) => {
  /** Whether this is a user-side message */
  const isUser = message.role === "user";
  /** Whether this is a system notification */
  const isSystem = message.role === "system";

  if (isSystem) {
    return (
      <div className="flex justify-center px-2 py-1">
        <span
          className={`text-2xl px-4 py-1.5 rounded-full ${
            message.error
              ? "text-red-400 bg-red-500/10 border border-red-500/20"
              : "text-white/40 bg-white/5 border border-white/10"
          }`}
        >
          {message.content}
        </span>
      </div>
    );
  }

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} px-2`}>
      <div
        className={`w-full rounded-2xl px-5 py-4 text-2xl leading-relaxed ${
          isUser
            ? "bg-violet-500/20 border border-violet-400/30 text-violet-100 rounded-br-sm"
            : message.error
              ? "bg-red-500/10 border border-red-500/20 text-red-300 rounded-bl-sm"
              : "bg-white/5 border border-white/10 text-white/85 rounded-bl-sm"
        }`}
      >
        {message.isStreaming ? (
          /* ── Streaming placeholder: three bouncing dots ───────────────── */
          <span className="flex items-center gap-1 py-1 px-1">
            <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce [animation-delay:-0.3s]" />
            <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce [animation-delay:-0.15s]" />
            <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce" />
          </span>
        ) : message.imageUrl ? (
          /*
           * ── Slide image bubble ─────────────────────────────────────────
           * Rendered when the act injects a local-only presentation slide
           * (e.g. Act 1 invisible factory slide) before ARIA's spoken text.
           * No padding override needed — the outer bubble already has px-5 py-4.
           * object-contain preserves the slide's 16:9 aspect ratio at any width.
           */
          <img
            src={message.imageUrl}
            alt="Presentation slide"
            className="w-full rounded-xl object-contain"
          />
        ) : isUser ? (
          /* ── User message ─────────────────────────────────────────────── */
          <span>{message.content}</span>
        ) : (
          /* ── Assistant text message ───────────────────────────────────── */
          <pre className="whitespace-pre-wrap wrap-break-word font-sans text-2xl leading-relaxed text-white/85">
            {message.content}
          </pre>
        )}

        {/* Tool call count badge — shown on non-streaming assistant messages */}
        {!isUser &&
          !message.isStreaming &&
          !!message.toolCallCount &&
          message.toolCallCount > 0 && (
            <span className="absolute -bottom-1 -right-1 text-xs text-white/30 bg-black/40 border border-white/8 rounded-full px-1.5 py-0.5 leading-none">
              {message.toolCallCount} tools
            </span>
          )}
      </div>
    </div>
  );
};
