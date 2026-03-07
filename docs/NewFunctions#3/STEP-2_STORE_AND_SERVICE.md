# STEP 2 — Chat Store (Zustand) + API Client + Translations

> **Instruction to AI:** Read this ENTIRE document before writing any code. Also read these existing files first: `src/store/uiStore.ts`, `src/lib/translations.ts`, `src/App.tsx`, `src/store/simulationDataStore.ts`. Match their patterns exactly.

---

## RULES

1. **READ FIRST** — Read the entire document AND all referenced existing files before writing any code.
2. **SCOPE DISCIPLINE** — ONLY create or modify files explicitly listed. Do NOT refactor any existing files.
3. **PATTERN MATCHING** — Match existing Zustand store pattern from `uiStore.ts`. Match translation format from `translations.ts`.
4. **NO EXTRAS** — Do NOT add utility functions, types, tests, or improvements not described here.
5. **ASK, DON'T ASSUME** — If something conflicts with existing code, STOP and ask.
6. **VERIFY** — After implementing, run `npx tsc --noEmit` and fix any type errors.

---

## What This Step Creates/Modifies

| File | Type | Description |
|------|------|-------------|
| `src/store/cwfStore.ts` | NEW (complete file) | Zustand store for chat state |
| `src/lib/cwfService.ts` | NEW (complete file) | API client for the serverless function |
| `src/lib/translations.ts` | MODIFY (add section) | Add `cwf` translation section |
| `src/store/uiStore.ts` | MODIFY (add 3 lines) | Add `showCWF` state and `toggleCWF` action |
| `src/App.tsx` | MODIFY (add effect) | Wire simulation ID to CWF store |

---

## 2.1 Create `src/lib/cwfService.ts` (COMPLETE FILE)

```typescript
/**
 * cwfService.ts — CWF Agent API Client
 *
 * Thin client that calls the Vercel serverless function at /api/cwf/chat.
 * Handles request formatting, error handling, and response parsing.
 *
 * Used by: cwfStore.ts (sendMessage action)
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CWFRequest {
  /** User's natural language question */
  message: string;
  /** Active simulation UUID */
  simulationId: string;
  /** Previous conversation turns for context */
  conversationHistory: Array<{ role: string; content: string }>;
  /** Response language */
  language: 'tr' | 'en';
}

export interface CWFResponse {
  /** Agent's natural language response (markdown) */
  response: string;
  /** Number of tool calls made during processing */
  toolCallCount: number;
  /** Model used */
  model: string;
}

// ─── API Call ────────────────────────────────────────────────────────────────

/**
 * Call the CWF agent API endpoint.
 *
 * @param request - The chat request payload
 * @returns The agent's response
 * @throws Error if the API call fails
 */
export async function cwfApiCall(request: CWFRequest): Promise<CWFResponse> {
  const response = await fetch('/api/cwf/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: request.message,
      simulationId: request.simulationId,
      conversationHistory: request.conversationHistory,
      language: request.language,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(
      errorBody.error ||
        errorBody.details ||
        `API error: ${response.status} ${response.statusText}`
    );
  }

  return response.json();
}
```

---

## 2.2 Create `src/store/cwfStore.ts` (COMPLETE FILE)

```typescript
/**
 * cwfStore.ts — CWF (Chat With your Factory) State Management
 *
 * Zustand store for the AI chat agent. Manages:
 *  - Message history (user + assistant messages)
 *  - Loading state
 *  - Active simulation context
 *  - Conversation persistence across panel open/close
 *
 * Architecture:
 *  - Messages are kept in memory (not persisted to DB)
 *  - Each message has a role, content, timestamp, and optional metadata
 *  - The store tracks tool call counts for transparency
 *  - Integrates with uiStore for language preference
 *
 * Used by: CWFChatPanel.tsx
 */
import { create } from 'zustand';
import { cwfApiCall } from '../lib/cwfService';

// =============================================================================
// TYPES
// =============================================================================

/** A single message in the CWF chat */
export interface CWFMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  toolCallCount?: number;
  isStreaming?: boolean;
  error?: boolean;
}

/** Quick action button for common queries */
export interface QuickAction {
  label: { tr: string; en: string };
  query: { tr: string; en: string };
  icon: string;
}

// =============================================================================
// QUICK ACTIONS
// =============================================================================

export const CWF_QUICK_ACTIONS: QuickAction[] = [
  {
    label: { tr: 'Üretim Özeti', en: 'Production Summary' },
    query: {
      tr: 'Bu simülasyonun genel üretim özetini ver. Toplam üretim, kalite dağılımı ve OEE değerlerini göster.',
      en: 'Give me an overall production summary. Show total production, quality distribution, and OEE.',
    },
    icon: 'BarChart3',
  },
  {
    label: { tr: 'Fire Analizi', en: 'Scrap Analysis' },
    query: {
      tr: 'Fire/hurda oranını analiz et. Hangi istasyonlarda en çok fire oluşuyor ve kök nedenleri neler?',
      en: 'Analyze the scrap rate. Which stations have the most scrap and what are the root causes?',
    },
    icon: 'AlertTriangle',
  },
  {
    label: { tr: 'Kusur Haritası', en: 'Defect Map' },
    query: {
      tr: 'En sık görülen kusur tiplerini ve hangi istasyonlarda oluştuklarını göster.',
      en: 'Show the most common defect types and which stations they occur at.',
    },
    icon: 'Search',
  },
  {
    label: { tr: 'Makine Sağlığı', en: 'Machine Health' },
    query: {
      tr: 'Tüm makinelerin mevcut sağlık durumunu değerlendir. Kritik parametre sapmalarını göster.',
      en: 'Evaluate machine health status. Show critical parameter deviations.',
    },
    icon: 'Activity',
  },
  {
    label: { tr: 'Senaryo Etkisi', en: 'Scenario Impact' },
    query: {
      tr: 'Aktif senaryonun üretim üzerindeki etkisini analiz et.',
      en: 'Analyze the active scenario impact on production.',
    },
    icon: 'Zap',
  },
  {
    label: { tr: 'Öneri Ver', en: 'Recommendations' },
    query: {
      tr: 'Mevcut verilere dayanarak iyileştirme önerileri sun.',
      en: 'Based on current data, provide improvement recommendations.',
    },
    icon: 'Lightbulb',
  },
];

// =============================================================================
// HELPERS
// =============================================================================

let messageCounter = 0;
function generateMessageId(): string {
  return `cwf-${Date.now()}-${++messageCounter}`;
}

// =============================================================================
// STORE
// =============================================================================

interface CWFState {
  messages: CWFMessage[];
  isLoading: boolean;
  simulationId: string | null;
  unreadCount: number;

  sendMessage: (content: string, language: 'tr' | 'en') => Promise<void>;
  setSimulationId: (id: string | null) => void;
  clearMessages: () => void;
  addSystemMessage: (content: string) => void;
}

export const useCWFStore = create<CWFState>((set, get) => ({
  messages: [],
  isLoading: false,
  simulationId: null,
  unreadCount: 0,

  setSimulationId: (id) => set({ simulationId: id }),

  clearMessages: () => set({ messages: [] }),

  addSystemMessage: (content) =>
    set((s) => ({
      messages: [
        ...s.messages,
        {
          id: generateMessageId(),
          role: 'system',
          content,
          timestamp: new Date().toISOString(),
        },
      ],
    })),

  sendMessage: async (content, language) => {
    const { simulationId, messages } = get();

    if (!simulationId) {
      set((s) => ({
        messages: [
          ...s.messages,
          {
            id: generateMessageId(),
            role: 'system',
            content:
              language === 'tr'
                ? '⚠️ Simülasyon başlatılmadı. Lütfen önce bir simülasyon çalıştırın.'
                : '⚠️ No simulation running. Please start a simulation first.',
            timestamp: new Date().toISOString(),
            error: true,
          },
        ],
      }));
      return;
    }

    // Add user message + assistant placeholder
    const userMsg: CWFMessage = {
      id: generateMessageId(),
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
    };

    const placeholderId = generateMessageId();
    const placeholder: CWFMessage = {
      id: placeholderId,
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
      isStreaming: true,
    };

    set((s) => ({
      messages: [...s.messages, userMsg, placeholder],
      isLoading: true,
    }));

    try {
      // Build conversation history (last 10 non-system messages)
      const history = messages
        .filter((m) => m.role !== 'system')
        .slice(-10)
        .map((m) => ({ role: m.role, content: m.content }));

      const result = await cwfApiCall({
        message: content,
        simulationId,
        conversationHistory: history,
        language,
      });

      // Replace placeholder with actual response
      set((s) => ({
        messages: s.messages.map((m) =>
          m.id === placeholderId
            ? {
                ...m,
                content: result.response,
                toolCallCount: result.toolCallCount,
                isStreaming: false,
              }
            : m
        ),
        isLoading: false,
      }));
    } catch (error) {
      const errorMsg =
        language === 'tr'
          ? `❌ Hata: ${(error as Error).message}`
          : `❌ Error: ${(error as Error).message}`;

      set((s) => ({
        messages: s.messages.map((m) =>
          m.id === placeholderId
            ? { ...m, content: errorMsg, isStreaming: false, error: true }
            : m
        ),
        isLoading: false,
      }));
    }
  },
}));
```

---

## 2.3 Modify `src/lib/translations.ts` (ADD SECTION)

**Do NOT rewrite the entire file.** Find the closing `};` of the `translations` object and add the `cwf` section BEFORE it:

```typescript
  // ── ADD THIS SECTION before the final closing }; ──

  cwf: {
    panelTitle: {
      tr: "💬 CWF — Fabrikanla Konuş",
      en: "💬 CWF — Chat With your Factory",
    },
    placeholder: {
      tr: "Fabrikanız hakkında bir soru sorun...",
      en: "Ask a question about your factory...",
    },
    send: { tr: "Gönder", en: "Send" },
    thinking: {
      tr: "Analiz ediliyor...",
      en: "Analyzing...",
    },
    noSimulation: {
      tr: "Simülasyon başlatılmadı",
      en: "No simulation running",
    },
    toolCalls: {
      tr: "sorgu yapıldı",
      en: "queries executed",
    },
    clearChat: { tr: "Sohbeti Temizle", en: "Clear Chat" },
    quickActions: { tr: "Hızlı Sorular", en: "Quick Questions" },
    welcomeTitle: {
      tr: "Merhaba! Ben CWF 🏭",
      en: "Hello! I'm CWF 🏭",
    },
    welcomeMessage: {
      tr: "Seramik üretim hattınız hakkında her şeyi sorabilirsiniz. OEE analizi, kusur tespiti, kök neden analizi ve iyileştirme önerileri sunabilirim.",
      en: "You can ask me anything about your ceramic production line. I can provide OEE analysis, defect detection, root cause analysis, and improvement recommendations.",
    },
    poweredBy: {
      tr: "Powered by Gemini AI",
      en: "Powered by Gemini AI",
    },
  },
```

---

## 2.4 Modify `src/store/uiStore.ts` (ADD 3 THINGS)

**Do NOT rewrite the entire file.** Make these 3 surgical additions:

### Addition 1: Add to the `UIState` interface

Find the interface that defines all the state properties. Add this line among the other `show*` booleans:

```typescript
  /** Whether the CWF chat panel is visible */
  showCWF: boolean;
```

And add this among the other toggle actions:

```typescript
  /** Toggle the CWF chat panel */
  toggleCWF: () => void;
```

### Addition 2: Add to the initial state

Find the initial state values inside `create<UIState>((set) => ({`. Add:

```typescript
  showCWF: false,
```

### Addition 3: Add the action implementation

Find the action implementations. Add:

```typescript
  toggleCWF: () => set((s) => ({ showCWF: !s.showCWF })),
```

### Addition 4: Update `closeAllPanels`

Find the `closeAllPanels` action. Add `showCWF: false` to its `set()` call:

```typescript
  closeAllPanels: () => set({
    showPassport: false,
    showHeatmap: false,
    showKPI: false,
    showControlPanel: false,
    showProductionTable: false,
    showCWF: false,  // ← ADD THIS LINE
  }),
```

---

## 2.5 Modify `src/App.tsx` (ADD EFFECT)

**Do NOT rewrite the entire file.** Add these imports at the top and one `useEffect` inside the component.

### Add imports:

```typescript
import { useCWFStore } from './store/cwfStore';
import { useSimulationDataStore } from './store/simulationDataStore';
import { useUIStore } from './store/uiStore';
```

> NOTE: `useSimulationDataStore` and `useUIStore` may already be imported. Only add what's missing.

### Add this effect inside the `App()` function (after the existing `useEffect`):

```typescript
  // Sync simulation ID to CWF store
  useEffect(() => {
    const unsubscribe = useSimulationDataStore.subscribe((state) => {
      const sessionId = state.session?.id ?? null;
      const currentCWFId = useCWFStore.getState().simulationId;

      if (sessionId !== currentCWFId) {
        useCWFStore.getState().setSimulationId(sessionId);
        if (sessionId) {
          const lang = useUIStore.getState().currentLang;
          const code = state.session?.session_code ?? '';
          useCWFStore.getState().addSystemMessage(
            lang === 'tr'
              ? `✅ Simülasyon bağlandı: ${code}`
              : `✅ Connected to simulation: ${code}`
          );
        }
      }
    });
    return unsubscribe;
  }, []);
```

---

## 2.6 Verification Checklist

- [ ] `src/lib/cwfService.ts` exists and compiles
- [ ] `src/store/cwfStore.ts` exists and compiles
- [ ] `translations.ts` has the new `cwf` section
- [ ] `uiStore.ts` has `showCWF`, `toggleCWF`, and updated `closeAllPanels`
- [ ] `App.tsx` has the simulation ID sync effect
- [ ] `npx tsc --noEmit` passes
- [ ] No existing functionality is broken

---

**NEXT:** Proceed to STEP-3.
