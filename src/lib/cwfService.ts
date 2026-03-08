/**
 * cwfService.ts — CWF Agent API Client
 *
 * Thin client that calls the Vercel serverless function at /api/cwf/chat.
 * Handles request formatting, error handling, and response parsing.
 *
 * ## uiContext
 * Every request includes a `uiContext` snapshot capturing the exact browser
 * state at the moment the message is sent — which panels are open, what the
 * simulation is doing, what scenario is active. This is injected into the
 * Gemini system prompt on the server so the AI has full situational awareness
 * without needing to query Supabase for current-state information.
 *
 * Used by: cwfStore.ts (sendMessage action)
 */

import { CWF_CLIENT_TIMEOUT_MS } from './params/cwfAgent';
/** UIContext type shared between this service and cwfStore.ts */
import type { UIContext } from './types/cwfTypes';

// ─── Types ───────────────────────────────────────────────────────────────────

/** Payload sent to the CWF serverless function */
export interface CWFRequest {
    /** User's natural language question */
    message: string;
    /** Active simulation UUID */
    simulationId: string;
    /** Human-readable 6-character session code (e.g., "1A7DDB") */
    sessionCode: string;
    /** Previous conversation turns for context */
    conversationHistory: Array<{ role: string; content: string }>;
    /** Response language */
    language: 'tr' | 'en';
    /**
     * Local simulation history (newest first).
     * Enables CWF to query data from previous simulations.
     */
    simulationHistory: Array<{
        uuid: string;
        sessionCode: string;
        startedAt: string;
        counter: number;
    }>;
    /**
     * Real-time UI state snapshot captured at the moment the message is sent.
     * Provides the Gemini agent with exact knowledge of:
     *  - Which panels are currently open on screen
     *  - Current simulation status (running, tick count, conveyor state)
     *  - Active scenario and Work Order
     *
     * Optional for backwards compatibility — absent in older clients.
     * When present, it is injected into the Gemini system prompt in chat.ts.
     */
    uiContext?: UIContext;
}

/** Response returned from the CWF serverless function */
export interface CWFResponse {
    /** Agent's natural language response (markdown) */
    response: string;
    /** Number of tool calls made during processing */
    toolCallCount: number;
    /** Model used */
    model: string;
    /** Copilot state change that occurred during this request (if any).
     *  'enabled' — copilot was just activated via enable_copilot tool.
     *  'disabled' — copilot was just deactivated via disable_copilot tool.
     *  null/undefined — no copilot state change. */
    copilotStateChange?: 'enabled' | 'disabled' | null;
}

// ─── API Call ────────────────────────────────────────────────────────────────

/**
 * Call the CWF agent API endpoint.
 *
 * @param request - The chat request payload (including optional uiContext)
 * @returns The agent's response
 * @throws Error if the API call fails
 */
export async function cwfApiCall(request: CWFRequest): Promise<CWFResponse> {
    /** POST to the Vercel serverless function with configurable timeout */
    const response = await fetch('/api/cwf/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(CWF_CLIENT_TIMEOUT_MS),
        body: JSON.stringify({
            message: request.message,
            simulationId: request.simulationId,
            sessionCode: request.sessionCode,
            conversationHistory: request.conversationHistory,
            language: request.language,
            simulationHistory: request.simulationHistory,
            /** Forward the UI context snapshot to the server for Gemini prompt injection */
            uiContext: request.uiContext,
        }),
    });

    /** Handle HTTP errors by extracting the error body */
    if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(
            errorBody.error ||
            errorBody.details ||
            `API error: ${response.status} ${response.statusText}`
        );
    }

    /** Parse and return the successful response */
    return response.json();
}
