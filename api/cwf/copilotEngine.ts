/**
 * copilotEngine.ts — CWF Copilot Autonomous Evaluation Engine (Server-Side)
 *
 * The core server-side service that powers CWF Copilot mode. Runs a polling
 * loop that periodically reads factory metrics from Supabase, sends structured
 * JSON to Gemini in a single shot, and applies ALL returned corrections at once.
 *
 * JSON-First Architecture:
 *   REFERENCE JSON — Built ONCE at engine startup from PARAMETER_RANGES.
 *                    Passed to Gemini in the system prompt. Never rebuilt.
 *   CURRENT STATE JSON — Built EVERY cycle from Supabase reads (all params,
 *                        all machines). Sent as the Gemini user message.
 *   ACTIONS JSON — Returned by Gemini: array of ALL corrections for this cycle.
 *                  Engine applies every entry — no autonomous fallback loop.
 *
 *   1. Timer-based polling loop (configurable interval, default 6s)
 *   2. Persistent Gemini ChatSession with genuine memory of all past corrections
 *   3. VERBOSE MODE: Every cycle injects a chat message into the CWF panel
 *   4. Pre-filter: skip Gemini when factory is truly healthy
 *   5. Gemini evaluation: JSON in → actions[] out (all params fixed in one shot)
 *   6. Action dispatch: INSERT into cwf_commands (same pipeline as interactive CWF)
 *   7. Audit trail: every cycle logged to copilot_actions table
 *   8. Safety: heartbeat check, rate limiting, per-param cooldown, sim-stop detection
 *
 * Lifecycle:
 *   - CopilotEngine.start(simulationId) — begins the polling loop + starts ChatSession
 *   - CopilotEngine.stop() — stops the polling loop + clears ChatSession
 *   - CopilotEngine.handleHeartbeat(simulationId) — updates last_heartbeat_at
 *   - CopilotEngine.getStatus() — returns current state for the status endpoint
 *
 * Used by: scripts/cwf-dev-server.ts (exposes via HTTP endpoints)
 *
 * Dependencies:
 *   - @supabase/supabase-js (Supabase client for DB reads/writes)
 *   - @google/generative-ai (Gemini SDK for AI evaluation)
 *   - api/cwf/copilotPrompt.ts (prompt builder + response parser)
 *   - api/cwf/cwfParameterRanges.ts (safe parameter ranges)
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI, type ChatSession } from '@google/generative-ai';
import {
    buildReferenceJSON,
    buildCopilotSystemPrompt,
    buildCopilotUserMessage,
    parseCopilotResponse,
    type CopilotReferenceJSON,
    type CopilotStateJSON,
} from './copilotPrompt.js';


// =============================================================================
// CONSTANTS (mirrored from src/lib/params/copilot.ts — api/ cannot import src/)
// =============================================================================

/** Sentinel value for authorized_by when copilot dispatches autonomous commands */
const COPILOT_AUTH_SENTINEL = 'system:copilot_auto';

/** Default polling interval in seconds (matches COPILOT_DEFAULT_POLL_INTERVAL_SEC in params/copilot.ts) */
const DEFAULT_POLL_INTERVAL_SEC = 6;

/** Maximum heartbeat age (ms) before auto-disengage.
 * Set to 45s (9 × 5s interval) — generous enough to avoid false-positive
 * disconnections due to Supabase network latency or a single missed heartbeat,
 * while still catching genuinely closed browser tabs (last heartbeat becomes
 * rapidly older than 45s once the tab closes).
 * Previously 15s which equaled the poll interval, causing a race.
 */
/**
 * How long (ms) without a browser heartbeat before the engine auto-disengages.
 * Must be > (HEARTBEAT_GRACE_MS + 2 × COPILOT_HEARTBEAT_INTERVAL_MS) to avoid
 * false-positive disconnects if the first heartbeat arrives during the grace window.
 * Matches the Vercel evaluate.ts value of 90s for consistency across environments.
 */
const HEARTBEAT_TIMEOUT_MS = 90_000;

/** Gemini model for routine copilot evaluations — gemini-2.5-flash (2.0-flash deprecated 404) */
const COPILOT_MODEL = 'gemini-2.5-flash';

/** Station sentinel for copilot chat messages in cwf_commands */
const COPILOT_MSG_STATION = 'copilot_message';

/**
 * Maximum number of chat message history turns kept in the persistent session.
 * Older turns are trimmed to prevent the ChatSession context window from growing
 * unbounded across many monitoring cycles.
 */
const MAX_SESSION_HISTORY_TURNS = 20;

// =============================================================================
// TYPES
// =============================================================================



/**
 * Public status object returned by getStatus() for the API endpoint.
 */
export interface CopilotStatus {
    /** Whether the copilot loop is currently running */
    running: boolean;
    /** The simulation session being monitored */
    simulationId: string | null;
    /** Total evaluation cycles completed this session */
    cycleCount: number;
    /** Total corrective actions taken this session */
    actionCount: number;
    /** Timestamp of the last evaluation cycle */
    lastCycleAt: string | null;
    /** Result of the last evaluation (skip/correct/escalate) */
    lastDecision: string | null;
}

// =============================================================================
// MACHINE STATE TABLE NAMES
// =============================================================================

/**
 * Mapping from station name to its Supabase machine_*_states table.
 * Used to query the latest parameter values for each production machine.
 */
const MACHINE_STATE_TABLES: Record<string, string> = {
    press: 'machine_press_states',
    dryer: 'machine_dryer_states',
    glaze: 'machine_glaze_states',
    printer: 'machine_printer_states',
    kiln: 'machine_kiln_states',
    sorting: 'machine_sorting_states',
    packaging: 'machine_packaging_states',
};

// =============================================================================
// COPILOT ENGINE CLASS
// =============================================================================

/**
 * CopilotEngine — The autonomous factory monitoring service.
 *
 * Singleton instance managed by the CWF dev server. Call start/stop to
 * control the polling loop. The engine is self-contained — it creates
 * its own Supabase and Gemini clients from environment variables.
 */
export class CopilotEngine {
    /** Supabase client (service role — full DB access) */
    private supabase: SupabaseClient;

    /** Gemini SDK client */
    private genAI: GoogleGenerativeAI;

    /**
     * Timer handle for the polling loop — null when not running.
     * This is a setTimeout handle (not setInterval) — we use a recursive
     * setTimeout chain so the next cycle starts AFTER the previous one
     * finishes. setInterval would accumulate skipped ticks and produce
     * wildly inconsistent reporting gaps.
     */
    private pollTimer: ReturnType<typeof setTimeout> | null = null;

    /** Active simulation session ID — null when not monitoring */
    private simulationId: string | null = null;

    /**
     * Persistent Gemini ChatSession for this copilot monitoring session.
     *
     * Using a persistent session (vs. fresh generateContent() calls) gives Gemini
     * genuine memory of what it observed and corrected in previous cycles. This
     * prevents two key bugs:
     *   1. Re-correcting parameters that were already fixed earlier in the session.
     *   2. Conflicting decisions when Gemini "forgets" it already took an action.
     *
     * The session is started in start() and cleared in stop().
     */
    private chatSession: ChatSession | null = null;

    /** In-memory cooldown map: "station.parameter" → timestamp when cooldown expires */
    private cooldownMap: Map<string, number> = new Map();

    /** Counter: total evaluation cycles this session */
    private cycleCount = 0;

    /** Counter: total corrective actions this session */
    private actionCount = 0;

    /** Timestamp of the last evaluation cycle */
    private lastCycleAt: string | null = null;

    /** Result of the last evaluation */
    private lastDecision: string | null = null;


    /**
     * Reference JSON — built ONCE in the constructor from PARAMETER_RANGES.
     * Contains the safe range and midpoint for every machine parameter.
     * Passed to Gemini via the system prompt and never rebuilt during the session.
     */
    private referenceJSON: CopilotReferenceJSON;

    /** Poll interval in seconds — set in start(), used by scheduleNextCycle() */
    private pollIntervalSec: number = DEFAULT_POLL_INTERVAL_SEC;

    /**
     * Timestamp when this engine session was started (via start()).
     * Used to implement a grace window: heartbeat checks are skipped for the
     * first HEARTBEAT_GRACE_MS after start(), giving the browser client time
     * to reconnect and send its first heartbeat to the new server instance.
     */
    private startedAt: number = 0;

    // =========================================================================
    // CONSTRUCTOR
    // =========================================================================

    /**
     * Create a new CopilotEngine instance.
     * Initialises Supabase and Gemini clients from environment variables.
     */
    constructor() {
        /** Read environment variables (same as chat.ts) */
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        const geminiKey = process.env.GEMINI_API_KEY;

        /** Guard: ensure all required env vars are present */
        if (!supabaseUrl || !supabaseKey || !geminiKey) {
            console.error('[Copilot] ❌ Missing required environment variables (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY)');
        }

        /** Initialise clients */
        this.supabase = createClient(supabaseUrl || '', supabaseKey || '');
        this.genAI = new GoogleGenerativeAI(geminiKey || '');

        /**
         * Build the reference JSON ONCE at construction time.
         * This is the canonical specification of safe parameter ranges for every
         * machine and the conveyor. It is embedded in the Gemini system prompt
         * and never rebuilt during the engine's lifetime.
         */
        this.referenceJSON = buildReferenceJSON();
        console.log(`[Copilot] 📋 Reference JSON built: ${Object.keys(this.referenceJSON).length} stations, ` +
            `${Object.values(this.referenceJSON).reduce((sum, s) => sum + Object.keys(s).length, 0)} parameters`);
    }

    // =========================================================================
    // PUBLIC API
    // =========================================================================

    /**
     * Start the copilot monitoring loop for a specific simulation session.
     * Reads the poll interval from copilot_config if available.
     * Starts a persistent Gemini ChatSession so the LLM retains memory across cycles.
     *
     * @param simulationId - The UUID of the active simulation session
     */
    async start(simulationId: string): Promise<void> {
        /** Guard: don't start if already running */
        if (this.pollTimer) {
            console.warn('[Copilot] ⚠️ Already running — ignoring start()');
            return;
        }

        this.simulationId = simulationId;
        this.cycleCount = 0;
        this.actionCount = 0;
        this.cooldownMap.clear();
        /**
         * Record when this monitoring session started.
         * The grace window check in checkHeartbeat() uses this to avoid
         * false-positive disconnections immediately after server/engine restart.
         */
        this.startedAt = Date.now();

        /** Read poll interval from copilot_config (or use default) */
        const { data: config } = await this.supabase
            .from('copilot_config')
            .select('poll_interval_sec')
            .eq('simulation_id', simulationId)
            .single();

        const intervalSec = config?.poll_interval_sec || DEFAULT_POLL_INTERVAL_SEC;

        /**
         * Initialise the persistent Gemini ChatSession.
         *
         * The system prompt is built from the pre-cached referenceJSON (safe ranges
         * for all parameters) and passed once to startChat(). All subsequent
         * evaluation cycles send the current state JSON via chatSession.sendMessage().
         * Gemini retains full memory of all past cycles and corrections.
         *
         * History is bounded by MAX_SESSION_HISTORY_TURNS to prevent token bloat.
         */
        const systemPrompt = buildCopilotSystemPrompt(this.referenceJSON);
        const model = this.genAI.getGenerativeModel({
            model: COPILOT_MODEL,
            systemInstruction: systemPrompt,
        });
        this.chatSession = model.startChat({
            history: [], // Fresh session — no prior context
        });

        console.log(`[Copilot] 💬 ChatSession initialised for simulation ${simulationId}`);

        /** Store interval for use by the recursive chain */
        this.pollIntervalSec = intervalSec;

        console.log(`[Copilot] 🟢 Started monitoring session ${simulationId} (poll every ${intervalSec}s)`);

        /**
         * Run first evaluation immediately then schedule the next one when it
         * completes (recursive setTimeout chain). This guarantees a fixed gap
         * between the END of one cycle and the START of the next, so reporting
         * is always separated by ~15 real seconds regardless of how long each
         * Gemini call or Supabase query took.
         */
        this.runCycleAndScheduleNext();
    }

    /**
     * Stop the copilot monitoring loop.
     * Clears the timer, ChatSession, and resets internal state.
     */
    stop(): void {
        if (this.pollTimer) {
            clearTimeout(this.pollTimer);
            this.pollTimer = null;
        }

        /** Clear the persistent ChatSession — LLM memory is abandoned on stop */
        this.chatSession = null;

        const sessionId = this.simulationId;
        this.simulationId = null;
        this.cooldownMap.clear();

        console.log(`[Copilot] 🔴 Stopped monitoring session ${sessionId || 'unknown'} — ChatSession cleared`);
    }

    /**
     * Handle a browser heartbeat — update last_heartbeat_at in copilot_config.
     *
     * @param simulationId - Session to heartbeat for
     */
    async handleHeartbeat(simulationId: string): Promise<void> {
        /** Update last_heartbeat_at for the given simulation row */
        const { error, count } = await this.supabase
            .from('copilot_config')
            .update({ last_heartbeat_at: new Date().toISOString() })
            .eq('simulation_id', simulationId)
            .select('simulation_id');

        if (error) {
            console.error(`[Copilot] ❌ Heartbeat DB update failed for sim ${simulationId.slice(0, 8)}: ${error.message}`);
        } else if (!count || count === 0) {
            console.warn(`[Copilot] ⚠️ Heartbeat update matched 0 rows — simulationId ${simulationId.slice(0, 8)} may not have a copilot_config row yet`);
        } else {
            console.log(`[Copilot] 💓 Heartbeat updated for sim ${simulationId.slice(0, 8)}`);
        }
    }

    /**
     * Get the current status of the copilot engine.
     *
     * @returns Public status object for the API endpoint
     */
    getStatus(): CopilotStatus {
        return {
            running: this.pollTimer !== null,
            simulationId: this.simulationId,
            cycleCount: this.cycleCount,
            actionCount: this.actionCount,
            lastCycleAt: this.lastCycleAt,
            lastDecision: this.lastDecision,
        };
    }

    // =========================================================================
    // POLLING LOOP — RECURSIVE setTimeout CHAIN
    // =========================================================================

    /**
     * Execute one evaluation cycle, then schedule the next one to run after
     * pollIntervalSec seconds from when THIS cycle FINISHES.
     *
     * Using a recursive setTimeout chain (instead of setInterval) ensures that
     * the gap between cycles is always measured from the END of a cycle, not
     * from a fixed wall-clock tick. This prevents the "burst + long gap" problem
     * recursive setTimeout chain guarantees no concurrent evaluations.
     * multiple ticks, and then fires them in rapid succession.
     */
    private async runCycleAndScheduleNext(): Promise<void> {
        /** Run one evaluation cycle */
        await this.evaluateOnce();

        /**
         * If the engine is still running (not stopped by heartbeat/sim-end),
         * schedule the next cycle to start after the configured interval.
         * pollTimer being set signals that we have a pending scheduled cycle.
         */
        if (this.simulationId) {
            this.pollTimer = setTimeout(() => {
                this.pollTimer = null;
                this.runCycleAndScheduleNext();
            }, this.pollIntervalSec * 1000);
        }
    }

    // =========================================================================
    // CORE EVALUATION CYCLE
    // =========================================================================

    /**
     * Execute a single copilot evaluation cycle.
     * This is the heart of the copilot — called every poll interval.
     *
     * Steps:
     *   1. Check heartbeat freshness (auto-disengage if stale)
     *   2. Read latest OEE snapshot
     *   3. Read latest machine states + compare against ranges
     *   4. Pre-filter: skip Gemini if factory is HEALTHY — but ALWAYS inject a
     *      verbose status chat message (even when skipping Gemini call).
     *   5. Call Gemini via persistent ChatSession for decision
     *   6. Execute action if needed
     *   7. Log to audit trail
     */
    private async evaluateOnce(): Promise<void> {
        /** Acquires evaluation lock */
        const cycleStart = Date.now();
        /**
         * Declared outside try{} so the catch block can reference it when
         * building the error message injected into the chat. Starts as 0
         * (unknown tick) and is overwritten once the OEE snapshot is read.
         */
        let simTick = 0;

        try {
            /** Guard: must have an active session */
            if (!this.simulationId) {
                return;
            }

            // -----------------------------------------------------------------
            // STEP 1: Check heartbeat freshness (browser disconnect safety)
            // -----------------------------------------------------------------
            const heartbeatOk = await this.checkHeartbeat();
            if (!heartbeatOk) {
                return; // Engine was stopped inside checkHeartbeat
            }

            // -----------------------------------------------------------------
            // STEP 1B: Simulation end guard
            // Auto-disengage copilot if the simulation has ended.
            // A completed/stopped simulation cannot accept parameter changes,
            // so continuing to poll would be wasteful and potentially confusing.
            // -----------------------------------------------------------------
            const { data: simRow } = await this.supabase
                .from('simulation_sessions')
                .select('status')
                .eq('id', this.simulationId)
                .maybeSingle();

            if (simRow && (simRow.status === 'completed' || simRow.status === 'stopped')) {
                /** Simulation ended — reset copilot state and stop the engine */
                console.log(`[CopilotEngine] Simulation ${this.simulationId} ended (status=${simRow.status}) — disengaging Copilot`);

                /** Update Supabase: reset state machine to 'normal' */
                await this.supabase.from('copilot_config')
                    .update({
                        cwf_state: 'normal',
                        auth_attempts: 0,
                        updated_at: new Date().toISOString(),
                    })
                    .eq('simulation_id', this.simulationId);

                /** Inject a user-facing chat message explaining the auto-disengage.
                 *  Uses 'AutoPilot' to match branding (not Microsoft Copilot). */
                await this.injectChatMessage(
                    '⏹️ The simulation has ended. AutoPilot mode has been automatically disengaged. ' +
                    'You can reset the simulation and re-enable AutoPilot for a new run.',
                    0,
                );

                /** Stop the engine loop */
                this.stop();
                return;
            }


            // -----------------------------------------------------------------
            // STEP 2: Read latest OEE snapshot
            // -----------------------------------------------------------------
            const { data: oeeRow } = await this.supabase
                .from('oee_snapshots')
                .select('foee, moee_press, moee_dryer, moee_glaze, moee_digital, moee_kiln, moee_sorting, moee_packaging, moee_conveyor, sim_tick')
                .eq('simulation_id', this.simulationId)
                .order('sim_tick', { ascending: false })
                .limit(1)
                .single();

            if (!oeeRow) {
                /** No OEE data yet — simulation may have just started */
                await this.injectChatMessage(
                    `🤖 [Cycle ${this.cycleCount + 1}] Monitoring active — waiting for first OEE snapshot from the simulation.`,
                    0,
                );
                this.logSkipCycle('No OEE data available yet', cycleStart);
                return;
            }

            /** Extract FOEE and machine OEEs */
            const foee = oeeRow.foee ?? 100;
            const machineOees: Record<string, number> = {
                press: oeeRow.moee_press ?? 100,
                dryer: oeeRow.moee_dryer ?? 100,
                glaze: oeeRow.moee_glaze ?? 100,
                printer: oeeRow.moee_digital ?? 100,
                kiln: oeeRow.moee_kiln ?? 100,
                sorting: oeeRow.moee_sorting ?? 100,
                packaging: oeeRow.moee_packaging ?? 100,
                conveyor: oeeRow.moee_conveyor ?? 100,
            };
            simTick = oeeRow.sim_tick ?? 0;  /** Update hoisted outer simTick so catch can report it */

            // -----------------------------------------------------------------
            // STEP 3: Build the current state JSON from ALL machine parameter readings
            //
            // This replaces the old findOutOfRangeParams() approach. Instead of
            // pre-filtering to only out-of-range params, we send Gemini ALL current
            // readings so it can perform its own comparison against the reference JSON.
            // Gemini has the full picture and returns a complete correction plan.
            // -----------------------------------------------------------------

            /** Clean expired cooldowns and collect active ones for the state JSON */
            const now = Date.now();
            const cooldownParams: string[] = [];
            for (const [key, expiresAt] of this.cooldownMap) {
                if (now >= expiresAt) {
                    /** Cooldown expired — remove from map */
                    this.cooldownMap.delete(key);
                } else {
                    /** Still in cooldown — tell Gemini not to touch this param */
                    cooldownParams.push(key);
                }
            }

            /** Build the state JSON from Supabase readings */
            const stateJSON = await this.buildCurrentStateJSON(
                simTick, foee, machineOees, cooldownParams,
            );

            // -----------------------------------------------------------------
            // STEP 4: Read copilot config for thresholds
            // -----------------------------------------------------------------
            const { data: config } = await this.supabase
                .from('copilot_config')
                .select('oee_alarm_threshold, cooldown_sec, max_actions_per_minute')
                .eq('simulation_id', this.simulationId)
                .single();

            const oeeAlarm = config?.oee_alarm_threshold ?? 75;
            /** Seconds a corrected param stays locked from re-correction (prevents oscillation) */
            const cooldownSec = config?.cooldown_sec ?? 30;

            /**
             * Per-machine OEE low-water-mark threshold.
             * At 80%, the ⚠️ warning badge shows and Gemini is called to evaluate.
             */
            const MACHINE_OEE_LOW_WATER_MARK = 80;

            /** Find any machine whose OEE is critically low */
            const lowMachines = Object.entries(machineOees)
                .filter(([, oee]) => oee < MACHINE_OEE_LOW_WATER_MARK)
                .map(([machine, oee]) => `${machine}: ${oee.toFixed(0)}%`);

            /**
             * Count out-of-range params by scanning the state JSON parameters
             * against the reference JSON (for pre-filter decision only — Gemini
             * will do the authoritative comparison during evaluation).
             */
            const outOfRangeCount = this.countOutOfRangeParams(stateJSON);

            const factoryTrulyHealthy =
                foee >= oeeAlarm &&
                outOfRangeCount === 0 &&
                lowMachines.length === 0;

            // -----------------------------------------------------------------
            // STEP 5: PRE-FILTER — skip Gemini if factory is truly healthy
            // -----------------------------------------------------------------
            if (factoryTrulyHealthy) {
                /**
                 * Factory is truly healthy — no Gemini call needed.
                 * Build a compact OEE summary line with colour-coded per-machine values.
                 */
                const machineOeeSummary = Object.entries(machineOees)
                    .map(([m, v]) => {
                        const badge = v < 80 ? '⚠️' : '';
                        return `${m}: ${v.toFixed(0)}%${badge}`;
                    })
                    .join(' | ');

                const warningMachines = Object.entries(machineOees)
                    .filter(([, oee]) => oee >= MACHINE_OEE_LOW_WATER_MARK && oee < 90)
                    .map(([m, v]) => `${m} (${v.toFixed(0)}%)`);
                const warningNote = warningMachines.length > 0
                    ? ` | ⚠️ Watching: ${warningMachines.join(', ')}`
                    : '';

                await this.injectChatMessage(
                    `🤖 [Tick ${simTick}] Monitoring — FOEE: ${foee.toFixed(1)}% ✅ | ${machineOeeSummary}${warningNote} | No intervention needed.`,
                    simTick,
                );

                this.logSkipCycle(
                    `Factory healthy: FOEE=${foee.toFixed(1)}% (>=${oeeAlarm}%), ${outOfRangeCount} out-of-range params, no low machines`,
                    cycleStart,
                );
                return;
            }

            /**
             * Factory is NOT healthy — Gemini evaluation needed.
             * Log the trigger reason and proceed.
             */
            const triggerReason = lowMachines.length > 0
                ? `Low machine OEE: ${lowMachines.join(', ')}`
                : outOfRangeCount > 0
                    ? `${outOfRangeCount} params out of range`
                    : `FOEE ${foee.toFixed(1)}% below alarm ${oeeAlarm}%`;
            console.log(`[Copilot] 🔍 Triggering Gemini evaluation: ${triggerReason}`);

            // -----------------------------------------------------------------
            // STEP 6: (merged into STEP 3 above — cooldowns collected with state JSON)
            // STEP 7: (Rate limiter removed — redundant in JSON-first architecture)
            //
            // The old per-minute action counter prevented runaway corrections in the
            // Phase A+B architecture. In the new design, Gemini returns all corrections
            // in one actions[] array using the cached referenceJSON for safe bounds, and
            // applyCorrection() enforces the midpoint. Per-param cooldown (30s) handles
            // oscillation. No need for a separate 60-second rate window.
            // -----------------------------------------------------------------

            // -----------------------------------------------------------------
            // STEP 8: Call Gemini via persistent ChatSession
            //
            // Send the current state JSON as the user message. Gemini compares it
            // against the reference JSON (in its system prompt) and returns the
            // full actions[] array of ALL corrections to apply this cycle.
            // -----------------------------------------------------------------

            /** Build the per-cycle user message from the state JSON */
            const userMessage = buildCopilotUserMessage(stateJSON);

            let responseText: string;

            if (this.chatSession) {
                /**
                 * Use the persistent ChatSession — Gemini retains memory of all
                 * previous cycles and its own past decisions in this session.
                 *
                 * Trim history when it exceeds MAX_SESSION_HISTORY_TURNS to prevent
                 * token bloat across long monitoring sessions.
                 */
                const history = await this.chatSession.getHistory();
                if (history.length > MAX_SESSION_HISTORY_TURNS * 2) {
                    console.log(`[Copilot] 🔄 ChatSession history trimmed (was ${history.length} turns)`);
                    const refreshedSystemPrompt = buildCopilotSystemPrompt(this.referenceJSON);
                    const refreshedModel = this.genAI.getGenerativeModel({
                        model: COPILOT_MODEL,
                        systemInstruction: refreshedSystemPrompt,
                    });
                    /** Keep the most recent turns for short-term memory */
                    const recentHistory = history.slice(-MAX_SESSION_HISTORY_TURNS * 2);
                    this.chatSession = refreshedModel.startChat({ history: recentHistory });
                }

                const result = await this.chatSession.sendMessage(userMessage);
                responseText = result.response.text();
            } else {
                /**
                 * Fallback: ChatSession was cleared (engine restart without full stop).
                 * Use a one-shot generateContent() and re-initialise the session.
                 */
                console.warn('[Copilot] ⚠️ ChatSession is null — using fallback generateContent()');
                const fallbackSystemPrompt = buildCopilotSystemPrompt(this.referenceJSON);
                const fallbackModel = this.genAI.getGenerativeModel({
                    model: COPILOT_MODEL,
                    systemInstruction: fallbackSystemPrompt,
                });
                const result = await fallbackModel.generateContent(userMessage);
                responseText = result.response.text();

                /** Re-initialise the session for subsequent cycles */
                this.chatSession = fallbackModel.startChat({ history: [] });
            }

            /** Parse and validate the structured JSON response */
            const parsed = parseCopilotResponse(responseText);

            if (!parsed) {
                /** Gemini returned an unparseable response — log and skip this cycle */
                await this.logAction({
                    simTick,
                    decision: 'skipped',
                    triggerReason,
                    metricsSnapshot: { foee, machineOees, outOfRangeCount },
                    actionTaken: null,
                    cwfCommandId: null,
                    geminiReasoning: responseText.substring(0, 500),
                    chatMessage: null,
                    modelUsed: COPILOT_MODEL,
                    latencyMs: Date.now() - cycleStart,
                });
                return;
            }


            // -----------------------------------------------------------------
            // STEP 9: Correct ALL out-of-range parameters in this cycle
            //
            // Design change: instead of asking Gemini to pick ONE parameter and
            // waiting for the next cycle for the rest, the engine now corrects
            // every out-of-range parameter that is not in cooldown — all in one
            // cycle. This eliminates the "Will correct next cycle" deferral and
            // means a widespread fault like SCN-002 (7 kiln params) is fixed
            // in a single pass rather than over 7 separate 15-second cycles.
            //
            // Gemini's action (if decision='correct') is applied FIRST as the
            // highest-confidence correction. Then the engine loops all remaining
            // outOfRangeParams in station-priority order and corrects any that
            // are not in cooldown.
            //
            // Rate limiting (now 20/min) still prevents runaway corrections if
            // Gemini hallucinates. Per-param cooldown prevents oscillation.
            // -----------------------------------------------------------------
            const correctedParams: Array<{ station: string; parameter: string; old_value: number; new_value: number }> = [];

            /**
             * Helper — insert one cwf_commands row for a parameter correction.
             * Returns the inserted row ID or null on failure.
             */
            const applyCorrection = async (
                station: string,
                parameter: string,
                oldValue: number,
                targetValue: number,
                reason: string,
            ): Promise<string | null> => {
                const cooldownKey = `${station}.${parameter}`;

                /** Skip if this parameter is in cooldown (recently corrected) */
                if (this.cooldownMap.has(cooldownKey) && this.cooldownMap.get(cooldownKey)! > now) {
                    console.log(`[Copilot] ⏳ Skipping ${cooldownKey} — on cooldown`);
                    return null;
                }

                /**
                 * Force target_value to the midpoint from the reference JSON.
                 * Even if Gemini provided a different target, we override it here
                 * to guarantee we never set a value outside the safe range.
                 */
                const stationRef = this.referenceJSON[station];
                const paramRef = stationRef?.[parameter];
                const safeTarget = paramRef ? paramRef.midpoint : targetValue;

                const { data: cmdData, error: cmdError } = await this.supabase
                    .from('cwf_commands')
                    .insert({
                        session_id: this.simulationId,
                        station,
                        parameter,
                        old_value: oldValue,
                        new_value: safeTarget,
                        reason: `[Copilot] ${reason}`,
                        authorized_by: COPILOT_AUTH_SENTINEL,
                        status: 'pending',
                    })
                    .select('id')
                    .single();

                if (cmdError) {
                    console.error(`[Copilot] ❌ Failed to insert cwf_command for ${cooldownKey}:`, cmdError.message);
                    return null;
                }

                this.actionCount++;
                this.cooldownMap.set(cooldownKey, now + cooldownSec * 1000);
                correctedParams.push({ station, parameter, old_value: oldValue, new_value: safeTarget });
                console.log(`[Copilot] 🔧 Corrected ${cooldownKey}: ${oldValue} → ${safeTarget}`);
                return cmdData.id;
            };

            /** The first command ID applied (used in the audit log) */
            let cwfCommandId: string | null = null;

            /**
             * Apply ALL actions returned by Gemini in a single pass.
             *
             * Gemini's actions[] is already ordered by priority (kiln → press → dryer →
             * glaze → printer → sorting → packaging → conveyor) as specified in the
             * system prompt. We simply iterate, skip cooldown params, and apply each.
             *
             * This replaces the old Phase A (Gemini's single action) + Phase B (engine
             * autonomous loop) pattern. Gemini is now responsible for selecting ALL
             * corrections; the engine just applies them.
             */
            if (parsed.decision === 'correct' && parsed.actions.length > 0) {
                for (const action of parsed.actions) {
                    const commandId = await applyCorrection(
                        action.station,
                        action.parameter,
                        action.current_value,
                        action.target_value,
                        action.reason,
                    );
                    /** Record the first command ID for the audit trail */
                    if (commandId && !cwfCommandId) {
                        cwfCommandId = commandId;
                    }
                }
            }

            // -----------------------------------------------------------------
            // STEP 10: Inject verbose chat message into CWF
            // -----------------------------------------------------------------

            let chatMessage = parsed.chat_message;

            if (correctedParams.length > 1) {
                /**
                 * Multiple corrections in this cycle — build a summary list so the
                 * user sees all fixes at once rather than just the one Gemini mentioned.
                 */
                const correctionList = correctedParams
                    .map(c => `🔧 ${c.station}.${c.parameter}: ${c.old_value} → ${c.new_value}`)
                    .join('\n');
                chatMessage = `[Tick ${simTick}] 🔧 Bulk correction — ${correctedParams.length} parameters restored to safe range:\n${correctionList}\nFOEE: ${foee.toFixed(1)}%`;
            } else if (correctedParams.length === 1 && chatMessage) {
                /** Single correction — prepend tick to Gemini's message */
                chatMessage = `[Tick ${simTick}] ${chatMessage}`;
            } else if (parsed.decision === 'skip' || correctedParams.length === 0) {
                /**
                 * No corrections applied (Gemini decided skip, or all actions were on
                 * cooldown) — generate canonical monitoring line to keep format consistent
                 * with the pre-filter healthy path.
                 */
                const machineSummary = Object.entries(machineOees)
                    .map(([m, v]) => `${m}: ${v.toFixed(0)}%${v < 80 ? '⚠️' : ''}`)
                    .join(' | ');
                const watchingMachines = Object.entries(machineOees)
                    .filter(([, oee]) => oee >= 80 && oee < 90)
                    .map(([m, v]) => `${m} (${v.toFixed(0)}%)`);
                const watchNote = watchingMachines.length > 0
                    ? ` | ⚠️ Watching: ${watchingMachines.join(', ')}`
                    : '';
                /** Use ✅ only when FOEE is genuinely healthy; ⚠️ when below the alarm threshold */
                const foeeBadge = foee >= oeeAlarm ? '✅' : '⚠️';
                chatMessage = `🤖 [Tick ${simTick}] Monitoring — FOEE: ${foee.toFixed(1)}% ${foeeBadge} | ${machineSummary}${watchNote} | No intervention needed.`;
            } else if (chatMessage) {
                chatMessage = `[Tick ${simTick}] ${chatMessage}`;
            }

            if (chatMessage) {
                await this.injectChatMessage(chatMessage, simTick);
            }

            // -----------------------------------------------------------------
            // STEP 11: Log to audit trail
            // -----------------------------------------------------------------
            await this.logAction({
                simTick,
                decision: parsed.decision,
                triggerReason,
                metricsSnapshot: { foee, machineOees, outOfRangeCount, actionsApplied: correctedParams.length },
                actionTaken: correctedParams.length > 0 ? {
                    station: correctedParams[0].station,
                    parameter: correctedParams[0].parameter,
                    old_value: correctedParams[0].old_value,
                    new_value: correctedParams[0].new_value,
                    reason: parsed.actions[0]?.reason ?? 'multi-action',
                } : null,
                cwfCommandId,
                geminiReasoning: parsed.reasoning,
                chatMessage: chatMessage,
                modelUsed: COPILOT_MODEL,
                latencyMs: Date.now() - cycleStart,
            });


        } catch (error) {
            const errMsg = error instanceof Error ? error.message : String(error);
            console.error('[Copilot] ❌ Evaluation cycle error:', error);

            /**
             * Inject a visible error message into the CWF chat so the user
             * is not left with silence when the engine crashes (e.g. Gemini
             * API error, model 404, Supabase timeout). Previously this only
             * logged to the server console which the user never sees.
             */
            try {
                await this.injectChatMessage(
                    `🚨 [Tick ${simTick ?? '?'}] Copilot engine error — ${errMsg.substring(0, 120)}. Retrying next cycle.`,
                    simTick ?? 0,
                );
            } catch {
                /** Ignore inject failure — don't mask the original error */
            }
        } finally {
            /** Update counters and release lock */
            this.cycleCount++;
            this.lastCycleAt = new Date().toISOString();
        }
    }

    // =========================================================================
    // HEARTBEAT CHECK
    // =========================================================================

    /**
     * Check browser heartbeat freshness. If the browser hasn't sent a heartbeat
     * in HEARTBEAT_TIMEOUT_MS (15s = 3 missed beats), auto-disengage copilot.
     *
     * @returns true if heartbeat is fresh (OK to proceed), false if stale (engine stopped)
     */
    private async checkHeartbeat(): Promise<boolean> {
        if (!this.simulationId) return false;

        // -----------------------------------------------------------------
        // GRACE WINDOW: Skip heartbeat check for the first 30 seconds after
        // the engine starts. This prevents false-positive disconnections
        // when the browser client reconnects after a server restart and
        // hasn't yet sent its first heartbeat to the new server instance.
        // -----------------------------------------------------------------
        const HEARTBEAT_GRACE_MS = 30_000; // 30 seconds
        if (Date.now() - this.startedAt < HEARTBEAT_GRACE_MS) {
            console.log(`[Copilot] ⏳ Heartbeat grace window active (${((Date.now() - this.startedAt) / 1000).toFixed(1)}s / 30s) — skipping heartbeat check`);
            return true;
        }

        const { data: config } = await this.supabase
            .from('copilot_config')
            .select('last_heartbeat_at, cwf_state')
            .eq('simulation_id', this.simulationId)
            .single();

        if (!config) {
            /** No config row — should not happen, but disengage to be safe */
            console.warn('[Copilot] ⛔ No copilot_config row found — disengaging');
            this.stop();
            return false;
        }

        /** Check if copilot was externally disabled (user clicked button, sim stopped, etc.) */
        if (config.cwf_state !== 'copilot_active') {
            console.log('[Copilot] 🔴 Copilot disabled externally (cwf_state=' + config.cwf_state + ') — stopping engine');
            this.stop();
            return false;
        }

        /** Check heartbeat freshness */
        const heartbeatAge = Date.now() - new Date(config.last_heartbeat_at).getTime();
        if (heartbeatAge > HEARTBEAT_TIMEOUT_MS) {
            console.warn(`[Copilot] ⛔ Browser heartbeat lost (${(heartbeatAge / 1000).toFixed(1)}s old) — auto-disengaging`);

            /** Disable copilot in the database AND reset state machine to 'normal' */
            await this.supabase
                .from('copilot_config')
                .update({
                    cwf_state: 'normal',
                    auth_attempts: 0,
                    updated_at: new Date().toISOString(),
                })
                .eq('simulation_id', this.simulationId);

            /** Inject a user-facing chat message explaining the heartbeat-loss disengage.
             *  Uses 'AutoPilot' to match branding (not Microsoft Copilot). */
            await this.injectChatMessage(
                '⛔ AutoPilot auto-disengaged: browser connection lost. Please re-enable to resume monitoring.',
                0,
            );

            this.stop();
            return false;
        }

        return true;
    }

    // =========================================================================
    // PARAMETER RANGE CHECKING
    // =========================================================================

    /**
    /**
     * Retired: findOutOfRangeParams() — superseded by buildCurrentStateJSON().
     *
     * The old approach only returned out-of-range parameters, losing context about
     * healthy parameter values. The new approach sends ALL parameter readings to
     * Gemini so it has full situational awareness for its correction decisions.
     *
     * Kept as a tombstone comment for reference; will be removed in a future cleanup.
     */

    // =========================================================================
    // CURRENT STATE JSON BUILDER — called EVERY evaluation cycle
    // =========================================================================

    /**
     * Build the CopilotStateJSON from the latest Supabase readings for all machines.
     *
     * Reads ALL parameters for ALL 7 machine stations + conveyor and packages them
     * into a structured JSON object. This is the user message sent to Gemini each
     * cycle. Gemini compares the values against the cached reference JSON (in its
     * system prompt) to identify which parameters need correction.
     *
     * Key difference from the old findOutOfRangeParams():
     *   OLD: filtered to only out-of-range params → Gemini had incomplete picture
     *   NEW: sends ALL params → Gemini sees the full state and decides autonomously
     *
     * @param simTick      - Current simulation tick
     * @param foee         - Current factory OEE %
     * @param machineOees  - Per-machine OEE map
     * @param cooldownParams - Parameters currently in cooldown (station.parameter[])
     * @returns CopilotStateJSON ready to send to Gemini
     */
    private async buildCurrentStateJSON(
        simTick: number,
        foee: number,
        machineOees: Record<string, number>,
        cooldownParams: string[],
    ): Promise<CopilotStateJSON> {
        /** Initialise the parameters container with empty entries for each station */
        const parameters: CopilotStateJSON['parameters'] = {};

        for (const [station, tableName] of Object.entries(MACHINE_STATE_TABLES)) {
            /** Query the latest row for this station's machine state table */
            const { data: row } = await this.supabase
                .from(tableName)
                .select('*')
                .eq('simulation_id', this.simulationId!)
                .order('sim_tick', { ascending: false })
                .limit(1)
                .maybeSingle();

            /** Get the parameter names for this station from the reference JSON */
            const stationRef = this.referenceJSON[station];
            if (!stationRef) continue;

            parameters[station] = {};

            for (const param of Object.keys(stationRef)) {
                /** Extract the value from the Supabase row; null if not yet reported */
                const value = row ? row[param] : null;
                parameters[station][param] =
                    (value !== null && value !== undefined && Number.isFinite(Number(value)))
                        ? Number(value)
                        : null;
            }
        }

        /** Also include conveyor speed — monitored separately from machine state tables.
         *
         * IMPORTANT: The DB column is `conveyor_speed` (not `conveyor_speed_x`).
         * We read the correct column but map it to the key `conveyor_speed_x` in
         * the JSON because that is the name used in:
         *   (a) referenceJSON (built from PARAMETER_RANGES which uses conveyor_speed_x)
         *   (b) cwf_commands.parameter (the simulator listener matches on conveyor_speed_x)
         */
        const { data: conveyorRow } = await this.supabase
            .from('conveyor_states')
            .select('conveyor_speed')   /** ← correct DB column name */
            .eq('simulation_id', this.simulationId!)
            .order('sim_tick', { ascending: false })
            .limit(1)
            .maybeSingle();

        parameters['conveyor'] = {
            /** Map DB column `conveyor_speed` to logical key `conveyor_speed_x` */
            conveyor_speed_x: conveyorRow?.conveyor_speed !== null &&
                conveyorRow?.conveyor_speed !== undefined
                ? Number(conveyorRow.conveyor_speed)
                : null,
        };

        /** Count active alarms for context */
        const { count: alarmCount } = await this.supabase
            .from('alarm_log')
            .select('id', { count: 'exact', head: true })
            .eq('simulation_id', this.simulationId!)
            .eq('acknowledged', false);

        return {
            sim_tick: simTick,
            foee,
            machine_oees: {
                press: machineOees.press ?? 100,
                dryer: machineOees.dryer ?? 100,
                glaze: machineOees.glaze ?? 100,
                printer: machineOees.printer ?? 100,
                kiln: machineOees.kiln ?? 100,
                sorting: machineOees.sorting ?? 100,
                packaging: machineOees.packaging ?? 100,
                conveyor: machineOees.conveyor ?? 100,
            },
            parameters,
            active_alarms: alarmCount ?? 0,
            cooldown_params: cooldownParams,
        };
    }

    // =========================================================================
    // OUT-OF-RANGE COUNT — fast pre-filter helper (no Gemini call)
    // =========================================================================

    /**
     * Count how many parameters in the state JSON are currently outside their
     * safe range as defined in the reference JSON.
     *
     * Used in the pre-filter step to decide whether to skip Gemini evaluation
     * entirely. This is intentionally fast — it only does in-memory comparisons
     * against the cached referenceJSON, no Supabase queries.
     *
     * @param stateJSON - Current state snapshot (from buildCurrentStateJSON)
     * @returns Number of parameters currently outside their safe range
     */
    private countOutOfRangeParams(stateJSON: CopilotStateJSON): number {
        let count = 0;

        for (const [station, params] of Object.entries(stateJSON.parameters)) {
            const stationRef = this.referenceJSON[station];
            if (!stationRef) continue;

            for (const [param, value] of Object.entries(params)) {
                /** Skip null values (parameter not yet reported by simulator) */
                if (value === null || !Number.isFinite(value)) continue;

                const paramRef = stationRef[param];
                if (!paramRef) continue;

                /** Count if value is outside [min, max] safe range */
                if (value < paramRef.min || value > paramRef.max) {
                    count++;
                }
            }
        }

        return count;
    }


    // =========================================================================
    // CHAT MESSAGE INJECTION
    // =========================================================================

    /**
     * Inject a copilot message into the CWF chat by inserting a special
     * cwf_commands row with station='copilot_message'. The browser's
     * useCWFCommandListener recognises this sentinel and adds the message
     * to the chat history with a 🤖 Copilot badge.
     *
     * @param message - Human-readable message to display in CWF chat
     * @param simTick - Current simulation tick for context
     */
    private async injectChatMessage(message: string, simTick: number): Promise<void> {
        if (!this.simulationId) return;

        await this.supabase
            .from('cwf_commands')
            .insert({
                session_id: this.simulationId,
                station: COPILOT_MSG_STATION,
                parameter: 'copilot_chat',
                old_value: simTick,
                new_value: 0,
                reason: message,
                authorized_by: COPILOT_AUTH_SENTINEL,
                status: 'pending',
            });
    }

    // =========================================================================
    // AUDIT TRAIL LOGGING
    // =========================================================================

    /**
     * Log a copilot decision to the copilot_actions audit trail table.
     *
     * @param entry - Data for the audit trail row
     */
    private async logAction(entry: {
        simTick: number;
        decision: string;
        triggerReason: string;
        metricsSnapshot: Record<string, unknown>;
        actionTaken: Record<string, unknown> | null;
        cwfCommandId: string | null;
        geminiReasoning: string | null;
        chatMessage: string | null;
        modelUsed: string;
        latencyMs: number;
    }): Promise<void> {
        if (!this.simulationId) return;

        this.lastDecision = entry.decision;

        const { error } = await this.supabase
            .from('copilot_actions')
            .insert({
                simulation_id: this.simulationId,
                sim_tick: entry.simTick,
                decision: entry.decision,
                trigger_reason: entry.triggerReason,
                metrics_snapshot: entry.metricsSnapshot,
                action_taken: entry.actionTaken,
                cwf_command_id: entry.cwfCommandId,
                gemini_reasoning: entry.geminiReasoning,
                chat_message: entry.chatMessage,
                model_used: entry.modelUsed,
                latency_ms: entry.latencyMs,
            });

        if (error) {
            console.error('[Copilot] ❌ Failed to log action:', error.message);
        }
    }

    /**
     * Log a skipped evaluation cycle (pre-filter pass or no data).
     * Lightweight — does NOT call Gemini or insert into copilot_actions.
     * Only updates local counters and console.
     *
     * @param reason - Why the cycle was skipped
     * @param cycleStart - When the cycle started (for latency calc)
     */
    private logSkipCycle(reason: string, cycleStart: number): void {
        this.lastDecision = 'skipped';
        this.cycleCount++;
        this.lastCycleAt = new Date().toISOString();
        console.log(`[Copilot] ⏭️ Skip: ${reason} (${Date.now() - cycleStart}ms)`);
    }
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

/**
 * Global CopilotEngine instance.
 * Managed by the CWF dev server — start/stop via HTTP endpoints.
 */
export const copilotEngine = new CopilotEngine();
