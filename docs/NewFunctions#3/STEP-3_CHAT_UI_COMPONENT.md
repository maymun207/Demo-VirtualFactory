# STEP 3 — CWF Chat Panel UI Component

> **Instruction to AI:** Read this ENTIRE document before writing any code. **CRITICAL: You MUST read `src/hooks/useDraggablePanel.ts` first** and adapt the CWFChatPanel code to match its ACTUAL interface. Also read: `src/components/ui/Header.tsx`, `src/components/ui/Dashboard.tsx`, `src/index.css`.

---

## RULES

1. **READ FIRST** — Read the entire document AND all referenced existing files.
2. **READ `useDraggablePanel.ts` CAREFULLY** — The code below assumes `{ position, handleMouseDown }` return shape. If the real hook has different names or parameters, **adapt the component to match the real hook**.
3. **SCOPE DISCIPLINE** — Only create/modify files listed below.
4. **TAILWIND ONLY** — All styles use Tailwind classes inline. No separate CSS files for components.
5. **PATTERN MATCHING** — Match existing component patterns (JSDoc, imports, naming).
6. **VERIFY** — After implementing, run `npx tsc --noEmit`.

---

## What This Step Creates/Modifies

| File | Type | Description |
|------|------|-------------|
| `src/components/ui/CWFChatPanel.tsx` | NEW (complete file) | The chat panel UI |
| `src/components/ui/Header.tsx` | MODIFY (add button) | Add CWF toggle button |
| `src/components/ui/Dashboard.tsx` | MODIFY (add import + render) | Add CWFChatPanel to overlay |
| `src/index.css` | MODIFY (add animation) | Add fade-in keyframe |

---

## ⚠️ CRITICAL: useDraggablePanel Adaptation

Before implementing, read `src/hooks/useDraggablePanel.ts` and answer:

1. What parameters does it accept? (`{ defaultX, defaultY }` or something else?)
2. What does it return? (`{ position, handleMouseDown }` or different property names?)
3. Does `position` have `.x` and `.y` or different properties?

**If the hook interface differs from what's shown below, adapt the CWFChatPanel usage accordingly.** The document uses this assumed interface:

```typescript
// ASSUMED — verify against actual hook:
const { position, handleMouseDown } = useDraggablePanel({
  defaultX: number,
  defaultY: number,
});
// position.x, position.y
// handleMouseDown: React.MouseEventHandler
```

---

## 3.1 Create `src/components/ui/CWFChatPanel.tsx` (COMPLETE FILE)

```tsx
/**
 * CWFChatPanel.tsx — Chat With your Factory UI Panel
 *
 * Floating chat panel for the CWF AI agent. Features:
 *  - Glassmorphic "Sentient Dark" theme
 *  - Welcome screen with quick action buttons
 *  - Message list with basic markdown rendering
 *  - Typing indicator with animated dots
 *  - Tool call count badge
 *  - Bilingual support (TR/EN)
 *  - Draggable via useDraggablePanel
 *
 * Used by: Dashboard.tsx
 */
import { useState, useRef, useEffect, type KeyboardEvent } from 'react';
import {
  Send,
  X,
  Trash2,
  Database,
  Bot,
  User,
  Loader2,
  BarChart3,
  AlertTriangle,
  Search,
  Activity,
  Zap,
  Lightbulb,
  Sparkles,
  MessageSquare,
} from 'lucide-react';
import { useCWFStore, CWF_QUICK_ACTIONS, type CWFMessage } from '../../store/cwfStore';
import { useUIStore } from '../../store/uiStore';
import { useTranslation } from '../../hooks/useTranslation';
import { useDraggablePanel } from '../../hooks/useDraggablePanel';

// ─── Icon Map for Quick Actions ──────────────────────────────────────────────

const ICON_MAP: Record<string, typeof BarChart3> = {
  BarChart3,
  AlertTriangle,
  Search,
  Activity,
  Zap,
  Lightbulb,
};

// ─── Simple Markdown Renderer ────────────────────────────────────────────────

function formatInlineMarkdown(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*(.+?)\*\*)|(`(.+?)`)|(_(.+?)_)/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    if (match[2]) {
      parts.push(<strong key={match.index} className="text-white font-semibold">{match[2]}</strong>);
    } else if (match[4]) {
      parts.push(
        <code key={match.index} className="px-1.5 py-0.5 bg-white/10 rounded text-cyan-300 text-[12px] font-mono">
          {match[4]}
        </code>
      );
    } else if (match[6]) {
      parts.push(<em key={match.index} className="text-white/70 italic">{match[6]}</em>);
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts.length > 0 ? parts : [text];
}

function renderMarkdown(text: string): React.ReactNode[] {
  return text.split('\n').map((line, i) => {
    const trimmed = line.trim();

    if (!trimmed) return <div key={i} className="h-2" />;

    if (trimmed.startsWith('### '))
      return <h4 key={i} className="text-sm font-bold text-cyan-300 mt-3 mb-1">{formatInlineMarkdown(trimmed.slice(4))}</h4>;
    if (trimmed.startsWith('## '))
      return <h3 key={i} className="text-sm font-bold text-cyan-200 mt-3 mb-1">{formatInlineMarkdown(trimmed.slice(3))}</h3>;

    if (trimmed.startsWith('- ') || trimmed.startsWith('• ') || trimmed.startsWith('* '))
      return (
        <div key={i} className="flex gap-2 ml-2 my-0.5">
          <span className="text-cyan-400 shrink-0">•</span>
          <span className="text-white/80 text-[13px] leading-relaxed">{formatInlineMarkdown(trimmed.slice(2))}</span>
        </div>
      );

    const numbered = trimmed.match(/^(\d+)\.\s(.+)/);
    if (numbered)
      return (
        <div key={i} className="flex gap-2 ml-2 my-0.5">
          <span className="text-cyan-400 shrink-0 text-[13px] w-4 text-right">{numbered[1]}.</span>
          <span className="text-white/80 text-[13px] leading-relaxed">{formatInlineMarkdown(numbered[2])}</span>
        </div>
      );

    return <p key={i} className="text-white/80 text-[13px] leading-relaxed my-0.5">{formatInlineMarkdown(trimmed)}</p>;
  });
}

// ─── Typing Indicator ────────────────────────────────────────────────────────

function TypingIndicator({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 px-4 py-3">
      <Bot size={16} className="text-cyan-400 shrink-0" />
      <span className="text-white/50 text-sm">{text}</span>
      <span className="flex gap-0.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce"
            style={{ animationDelay: `${i * 0.15}s`, animationDuration: '0.6s' }}
          />
        ))}
      </span>
    </div>
  );
}

// ─── Message Bubble ──────────────────────────────────────────────────────────

function MessageBubble({ message, language }: { message: CWFMessage; language: 'tr' | 'en' }) {
  const t = useTranslation('cwf');

  if (message.role === 'system') {
    return (
      <div className="flex justify-center my-2">
        <div className={`text-xs px-3 py-1.5 rounded-full ${
          message.error ? 'bg-red-500/20 text-red-300 border border-red-500/30' : 'bg-white/5 text-white/40 border border-white/10'
        }`}>
          {message.content}
        </div>
      </div>
    );
  }

  if (message.role === 'user') {
    return (
      <div className="flex justify-end mb-3">
        <div className="max-w-[85%] flex gap-2 items-start">
          <div className="bg-gradient-to-br from-cyan-500/20 to-teal-500/20 border border-cyan-500/30 rounded-2xl rounded-tr-sm px-4 py-2.5">
            <p className="text-white/90 text-[13px] leading-relaxed">{message.content}</p>
          </div>
          <div className="w-7 h-7 rounded-full bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center shrink-0 mt-0.5">
            <User size={14} className="text-cyan-400" />
          </div>
        </div>
      </div>
    );
  }

  // Assistant
  if (message.isStreaming) return <TypingIndicator text={t('thinking')} />;

  return (
    <div className="flex justify-start mb-3 cwf-fade-in">
      <div className="max-w-[90%] flex gap-2 items-start">
        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-cyan-500/30 to-teal-500/30 border border-cyan-500/40 flex items-center justify-center shrink-0 mt-0.5">
          <Sparkles size={14} className="text-cyan-300" />
        </div>
        <div className="flex-1">
          <div className={`bg-white/5 border rounded-2xl rounded-tl-sm px-4 py-3 ${
            message.error ? 'border-red-500/30 bg-red-500/5' : 'border-white/10'
          }`}>
            {renderMarkdown(message.content)}
          </div>
          {message.toolCallCount != null && message.toolCallCount > 0 && (
            <div className="flex items-center gap-1 mt-1.5 ml-1">
              <Database size={11} className="text-white/30" />
              <span className="text-[11px] text-white/30">
                {message.toolCallCount} {t('toolCalls')}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Welcome Screen ──────────────────────────────────────────────────────────

function WelcomeScreen({ language, onQuickAction }: { language: 'tr' | 'en'; onQuickAction: (q: string) => void }) {
  const t = useTranslation('cwf');

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-teal-500/20 border border-cyan-500/30 flex items-center justify-center mb-4">
        <Sparkles size={28} className="text-cyan-400" />
      </div>
      <h3 className="text-lg font-bold text-white mb-2">{t('welcomeTitle')}</h3>
      <p className="text-white/50 text-sm mb-6 max-w-xs leading-relaxed">{t('welcomeMessage')}</p>
      <div className="w-full space-y-2">
        <p className="text-white/30 text-xs uppercase tracking-wider mb-2">{t('quickActions')}</p>
        <div className="grid grid-cols-2 gap-2">
          {CWF_QUICK_ACTIONS.map((action, i) => {
            const Icon = ICON_MAP[action.icon] || MessageSquare;
            return (
              <button
                key={i}
                onClick={() => onQuickAction(action.query[language])}
                className="flex items-center gap-2 px-3 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-cyan-500/30 rounded-xl transition-all duration-200 text-left group"
              >
                <Icon size={14} className="text-white/30 group-hover:text-cyan-400 transition-colors shrink-0" />
                <span className="text-white/60 group-hover:text-white/90 text-xs transition-colors leading-tight">
                  {action.label[language]}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Main Panel ──────────────────────────────────────────────────────────────

export function CWFChatPanel() {
  const t = useTranslation('cwf');
  const language = useUIStore((s) => s.currentLang);
  const showCWF = useUIStore((s) => s.showCWF);
  const toggleCWF = useUIStore((s) => s.toggleCWF);

  const messages = useCWFStore((s) => s.messages);
  const isLoading = useCWFStore((s) => s.isLoading);
  const simulationId = useCWFStore((s) => s.simulationId);
  const sendMessage = useCWFStore((s) => s.sendMessage);
  const clearMessages = useCWFStore((s) => s.clearMessages);

  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // ⚠️ ADAPT THIS to match the REAL useDraggablePanel interface
  const { position, handleMouseDown } = useDraggablePanel({
    defaultX: typeof window !== 'undefined' ? window.innerWidth - 440 : 800,
    defaultY: typeof window !== 'undefined' ? window.innerHeight - 640 : 200,
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (showCWF) setTimeout(() => inputRef.current?.focus(), 300);
  }, [showCWF]);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;
    setInput('');
    sendMessage(trimmed, language);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!showCWF) return null;

  const hasMessages = messages.length > 0;

  return (
    <div className="fixed z-[60] select-none" style={{ left: position.x, top: position.y }}>
      <div className="w-[420px] h-[600px] flex flex-col bg-black/80 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-2xl shadow-cyan-500/10 overflow-hidden">

        {/* Header (draggable) */}
        <div
          className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-cyan-500/10 to-teal-500/10 border-b border-white/10 cursor-grab active:cursor-grabbing"
          onMouseDown={handleMouseDown}
        >
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500/30 to-teal-500/30 flex items-center justify-center">
              <Sparkles size={16} className="text-cyan-300" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white leading-tight">{t('panelTitle')}</h2>
              {simulationId ? (
                <p className="text-[10px] text-green-400/60">● Connected</p>
              ) : (
                <p className="text-[10px] text-red-400/60">● {t('noSimulation')}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1">
            {hasMessages && (
              <button onClick={clearMessages} className="p-1.5 hover:bg-white/10 rounded-lg transition-colors" title={t('clearChat')}>
                <Trash2 size={14} className="text-white/30 hover:text-white/60" />
              </button>
            )}
            <button onClick={toggleCWF} className="p-1.5 hover:bg-white/10 rounded-lg transition-colors">
              <X size={16} className="text-white/40 hover:text-white/80" />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-3 py-3">
          {!hasMessages ? (
            <WelcomeScreen language={language} onQuickAction={(q) => sendMessage(q, language)} />
          ) : (
            <>
              {messages.map((msg) => (
                <MessageBubble key={msg.id} message={msg} language={language} />
              ))}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* Input */}
        <div className="border-t border-white/10 p-3">
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t('placeholder')}
              disabled={isLoading}
              rows={1}
              className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white/90 text-sm placeholder-white/30 focus:outline-none focus:border-cyan-500/40 focus:ring-1 focus:ring-cyan-500/20 resize-none max-h-24 transition-all disabled:opacity-50"
              style={{ minHeight: '40px' }}
            />
            <button
              onClick={handleSend}
              disabled={isLoading || !input.trim()}
              className="p-2.5 bg-gradient-to-br from-cyan-500 to-teal-500 hover:from-cyan-400 hover:to-teal-400 disabled:from-white/10 disabled:to-white/10 disabled:text-white/30 text-white rounded-xl transition-all duration-200 shrink-0"
            >
              {isLoading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
            </button>
          </div>
          <div className="flex items-center justify-center gap-1 mt-2">
            <Sparkles size={10} className="text-white/20" />
            <span className="text-[10px] text-white/20">{t('poweredBy')}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
```

---

## 3.2 Modify `src/components/ui/Header.tsx` (ADD CWF BUTTON)

**Do NOT rewrite the entire file.** Read the existing file, find the toolbar/button area (where language toggle and other buttons are), and add this button:

```tsx
// ADD these imports at the top:
import { Sparkles } from 'lucide-react';

// ADD this button in the toolbar area (near the language toggle):
<button
  onClick={() => useUIStore.getState().toggleCWF()}
  className="relative flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-cyan-500/10 to-teal-500/10 hover:from-cyan-500/20 hover:to-teal-500/20 border border-cyan-500/30 rounded-lg transition-all duration-200"
  title="CWF — Chat With your Factory"
>
  <Sparkles size={14} className="text-cyan-400" />
  <span className="text-xs font-medium text-cyan-300">CWF</span>
</button>
```

> **IMPORTANT:** Find the right location by reading the existing Header.tsx. Place it near the other toolbar buttons (alarm log, demo settings, language toggle, etc.). Adapt the JSX wrapper if needed to match the existing button pattern.

---

## 3.3 Modify `src/components/ui/Dashboard.tsx` (ADD IMPORT + RENDER)

**Do NOT rewrite the entire file.** Make two additions:

```tsx
// ADD this import at the top:
import { CWFChatPanel } from './CWFChatPanel';

// ADD <CWFChatPanel /> at the end of the return, before the closing </>:
export const Dashboard = () => {
  useAlarmMonitor();
  return (
    <>
      {/* ... existing components ... */}
      <CWFChatPanel />   {/* ← ADD THIS LINE */}
    </>
  );
};
```

---

## 3.4 Modify `src/index.css` (ADD ANIMATION)

**Do NOT rewrite the entire file.** Add this at the end:

```css
/* CWF Chat Panel — message fade-in animation */
@keyframes cwfFadeIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
.cwf-fade-in {
  animation: cwfFadeIn 0.3s ease-out forwards;
}
```

---

## 3.5 Verification Checklist

- [ ] `CWFChatPanel.tsx` compiles (check `useDraggablePanel` interface!)
- [ ] Panel appears when `showCWF` is toggled true
- [ ] Panel is draggable via the header area
- [ ] Welcome screen shows 6 quick action buttons
- [ ] Language toggle switches all CWF text
- [ ] CWF button added to Header
- [ ] CWFChatPanel added to Dashboard
- [ ] `npx tsc --noEmit` passes
- [ ] No existing components are affected

---

**NEXT:** Run the STEP-4 SQL migration in Supabase SQL Editor, then proceed to STEP-4 document.
