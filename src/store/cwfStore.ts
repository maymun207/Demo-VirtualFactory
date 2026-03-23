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
import { createLogger } from '../lib/logger';
import { cwfApiCall } from '../lib/cwfService';
import { getSimulationHistory, type SimulationHistoryEntry } from '../services/simulationHistoryService';
import {
    CWF_FALLBACK_RESPONSE_EN,
    CWF_FALLBACK_RESPONSE_TR,
} from '../lib/params/cwfAgent';
/** Live simulation state used for UIContext snapshot — read at message-send time */
import { useSimulationStore } from './simulationStore';
/** Simulation data store — provides active scenario for UIContext snapshot */
import { useSimulationDataStore } from './simulationDataStore';
/** Zustand UI store — provides panel visibility state for UIContext snapshot */
import { useUIStore } from './uiStore';
/** Work order store — provides selectedWorkOrderId for UIContext config snapshot */
import { useWorkOrderStore } from './workOrderStore';
/** UIContext type for the real-time UI snapshot attached to every CWF request */
import type { UIContext } from '../lib/types/cwfTypes';
/** Copilot store — direct state sync when API reports copilot enable/disable */
import { useCopilotStore } from './copilotStore';

/** Module-level logger for CWF store */
const log = createLogger('CWFStore');

// =============================================================================
// TYPES
// =============================================================================

/** A single message in the CWF chat */
export interface CWFMessage {
    /** Unique message identifier */
    id: string;
    /** Message author: user input, assistant response, or system notification */
    role: 'user' | 'assistant' | 'system';
    /** Message text content (may contain markdown) */
    content: string;
    /** ISO 8601 timestamp of when the message was created */
    timestamp: string;
    /** Number of Gemini tool calls used to produce this response (assistant only) */
    toolCallCount?: number;
    /** Whether the assistant is still generating this message */
    isStreaming?: boolean;
    /** Whether this message represents an error condition */
    error?: boolean;
}

/** Quick action button for common queries */
export interface QuickAction {
    /** Bilingual button label */
    label: { tr: string; en: string };
    /** Bilingual pre-filled query text sent when clicked */
    query: { tr: string; en: string };
    /** Lucide icon name to display on the button */
    icon: string;
}

// =============================================================================
// QUICK ACTIONS
// =============================================================================

/** Predefined quick action buttons shown on the CWF welcome screen */
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

/** Auto-incrementing counter for unique message ID generation */
let messageCounter = 0;

/**
 * Generate a unique message ID using timestamp + counter.
 * @returns A unique string ID like "cwf-1708884000000-1"
 */
function generateMessageId(): string {
    return `cwf-${Date.now()}-${++messageCounter}`;
}

// =============================================================================
// STORE
// =============================================================================

/** Shape of the CWF chat store */
interface CWFState {
    /** Ordered list of all chat messages */
    messages: CWFMessage[];
    /** Whether the agent is currently processing a request */
    isLoading: boolean;
    /** Number of unread assistant messages (for badge display) */
    unreadCount: number;
    /** Local history of all known simulation sessions */
    simulationHistory: SimulationHistoryEntry[];

    /** Send a user message and receive an agent response */
    sendMessage: (content: string, language: 'tr' | 'en') => Promise<void>;
    /** Clear all messages from the chat history */
    clearMessages: () => void;
    /** Add a system notification message (e.g., simulation connected) */
    addSystemMessage: (content: string) => void;
}

/**
 * CWF chat store instance.
 * Follows the same create<T>((set, get) => ({...})) pattern as uiStore.ts.
 */
export const useCWFStore = create<CWFState>((set, get) => ({
    // ── Initial State ──────────────────────────────────────────────
    /** Start with empty message history */
    messages: [],
    /** Not loading on init */
    isLoading: false,
    /** No unread messages on init */
    unreadCount: 0,
    /** Initialize history from localStorage */
    simulationHistory: getSimulationHistory(),

    // ── Action Implementations ─────────────────────────────────────

    /** Clear all messages */
    clearMessages: () => set({ messages: [] }),

    /** Append a system message to the conversation */
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

    /**
     * Send a user message to the CWF agent and handle the response.
     * Creates a placeholder message while waiting, then replaces it
     * with the actual response or error.
     *
     * @param content - The user's question text
     * @param language - Response language preference
     */
    sendMessage: async (content, language) => {
        const { messages } = get();

        /**
         * SINGLE SOURCE OF TRUTH: read the session UUID directly from
         * simulationDataStore — the authoritative owner of session state.
         * This eliminates the mirror copy that cwfStore previously maintained
         * via setSimulationId(), which could become stale or out-of-sync.
         */
        const simDataSnapshot = useSimulationDataStore.getState();
        const simulationId = simDataSnapshot.session?.id ?? null;
        const sessionCode = simDataSnapshot.session?.session_code ?? '';

        // ── Build real-time UIContext snapshot ─────────────────────────────
        /**
         * Capture the exact browser state at the moment the user sends
         * the message. This is attached to the API request body and
         * injected into the Gemini system prompt by api/cwf/chat.ts,
         * giving the AI full situational awareness of what is on screen.
         *
         * All reads are synchronous Zustand getState() calls — zero lag,
         * no async, no re-render triggered.
         */
        const uiState = useUIStore.getState();
        const simState = useSimulationStore.getState();
        const simDataState = useSimulationDataStore.getState();
        const workOrderState = useWorkOrderStore.getState();

        /** Complete real-time UI context snapshot */
        const uiContext: UIContext = {
            panels: {
                /** Left KPI + Heatmap side panel */
                basicPanel: uiState.showBasicPanel,
                /** Digital Transfer passport side panel */
                dtxfr: uiState.showDTXFR,
                /** 3D OEE Hierarchy table in scene */
                oeeHierarchy: uiState.showOEEHierarchy,
                /** 3D Production Status table in scene */
                prodTable: uiState.showProductionTable,
                /** CWF chat panel (always true when message is sent) */
                cwf: uiState.showCWF,
                /** Control & Actions floating panel */
                controlPanel: uiState.showControlPanel,
                /** Demo Settings modal */
                demoSettings: uiState.showDemoSettings,
                /** Alarm Log popup */
                alarmLog: uiState.showAlarmLog,
                /** Tile Passport floating panel */
                tilePassport: uiState.showPassport,
                /** FTQ Defect Heatmap floating panel */
                heatmap: uiState.showHeatmap,
                /** KPI floating panel */
                kpi: uiState.showKPI,
            },
            simulation: {
                /** Whether the simulation S-Clock is actively ticking */
                isRunning: simState.isDataFlowing,
                /** Whether Phase-2 drain is in progress */
                isDraining: simState.isDraining,
                /** Current simulation tick number */
                sClockCount: simState.sClockCount,
                /** S-Clock period in ms — lower = faster simulation */
                sClockPeriod: simState.sClockPeriod,
                /** Station processing interval in ticks */
                stationInterval: simState.stationInterval,
                /** Conveyor belt operational status */
                conveyorStatus: simState.conveyorStatus,
                /** Conveyor speed multiplier */
                conveyorSpeed: simState.conveyorSpeed,
            },
            config: {
                /** Current interface language */
                language,
                /** Active scenario code (e.g. "SCN-002") or null */
                activeScenarioCode: simDataState.activeScenario?.code ?? null,
                /** Selected Work Order ID or null */
                selectedWorkOrderId: workOrderState.selectedWorkOrderId ?? null,
                /** Whether user has completed Demo Settings gate for this run */
                isSimConfigured: uiState.isSimConfigured,
                /** Whether the simulation has finished naturally */
                simulationEnded: uiState.simulationEnded,
            },
            /**
             * Live conveyor behavioral parameters from the store.
             *
             * These are read from simulationDataStore.conveyorNumericParams, which is the
             * STORE-SIDE source of truth. They are updated immediately when a CWF command
             * is applied by useCWFCommandListener (via updateConveyorBoolParam / updateConveyorParam).
             *
             * Unlike conveyor_states in Supabase (populated each tick by the sync service),
             * this snapshot is ALWAYS current — it reflects the exact parameter state the
             * user sees at the moment they send this message.
             *
             * CWF should use conveyorParams from uiContext for status questions, and only
             * fall back to querying conveyor_states when historical/trend data is needed.
             */
            conveyorParams: {
                /** Jam duration per event in simulation clock cycles */
                jammed_time: simDataState.conveyorNumericParams.jammed_time as number,
                /** Number of tiles scrapped per jam event */
                impacted_tiles: simDataState.conveyorNumericParams.impacted_tiles as number,
                /** Global tile scrap probability (%) */
                scrap_probability: simDataState.conveyorNumericParams.scrap_probability as number ?? 0,
                /** Whether random belt speed-change events are enabled */
                speed_change: !!simDataState.conveyorNumericParams.speed_change,
                /** Whether jam events are enabled on the belt */
                jammed_events: !!simDataState.conveyorNumericParams.jammed_events,
            },
        };
        // ─────────────────────────────────────────────────────────────────

        /** Guard: require an active simulation before sending */
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
        /** The user's message record */
        const userMsg: CWFMessage = {
            id: generateMessageId(),
            role: 'user',
            content,
            timestamp: new Date().toISOString(),
        };

        /** Placeholder ID used to replace with actual response later */
        const placeholderId = generateMessageId();
        /** Streaming placeholder displayed while waiting for the agent */
        const placeholder: CWFMessage = {
            id: placeholderId,
            role: 'assistant',
            content: '',
            timestamp: new Date().toISOString(),
            isStreaming: true,
        };

        /** Append both messages and set loading state */
        set((s) => ({
            messages: [...s.messages, userMsg, placeholder],
            isLoading: true,
        }));

        try {
            // Build conversation history (last 10 non-system messages)
            /** Filter out system messages and keep only recent context */
            const history = messages
                .filter((m) => m.role !== 'system')
                .slice(-10)
                .map((m) => ({ role: m.role, content: m.content }));

            /** Call the CWF API endpoint with simulation history + real-time UI context */
            const result = await cwfApiCall({
                message: content,
                simulationId,
                sessionCode,
                conversationHistory: history,
                language,
                simulationHistory: getSimulationHistory(),
                /** Attach the UI context snapshot built above — injected into Gemini system prompt */
                uiContext,
            });

            /**
             * Client-side guard: if the server returns an empty response
             * (e.g., Gemini 2.5 thinking-part edge case), replace it with
             * a user-friendly fallback so the bubble is never blank.
             */
            const safeResponse = result.response?.trim()
                ? result.response
                : (language === 'tr' ? CWF_FALLBACK_RESPONSE_TR : CWF_FALLBACK_RESPONSE_EN);

            // Replace placeholder with actual response
            set((s) => ({
                messages: s.messages.map((m) =>
                    m.id === placeholderId
                        ? {
                            ...m,
                            content: safeResponse,
                            toolCallCount: result.toolCallCount,
                            isStreaming: false,
                        }
                        : m
                ),
                isLoading: false,
            }));

            /** Direct copilot state sync — the API returns copilotStateChange
             *  ('enabled' | 'disabled' | null) when a copilot tool was called.
             *  This bypasses the Supabase Realtime subscription which can be
             *  unreliable, ensuring the pink theme activates immediately. */
            if (result.copilotStateChange === 'enabled') {
                useCopilotStore.getState().enableCopilot();
                log.info('Copilot enabled via API response flag');
            } else if (result.copilotStateChange === 'disabled') {
                useCopilotStore.getState().disableCopilot();
                log.info('Copilot disabled via API response flag');
            }
        } catch (error) {
            /** Format error message in the user's language */
            const errorMsg =
                language === 'tr'
                    ? `❌ Hata: ${(error as Error).message}`
                    : `❌ Error: ${(error as Error).message}`;

            /** Replace placeholder with error message */
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
