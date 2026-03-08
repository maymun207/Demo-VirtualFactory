/**
 * copilotEngine.ts — CWF Copilot Autonomous Evaluation Engine (Server-Side)
 *
 * The core server-side service that powers CWF Copilot mode. Runs a polling
 * loop that periodically reads factory metrics from Supabase, compares them
 * against safe parameter ranges, and calls Gemini when anomalies are detected.
 *
 * Architecture:
 *   1. Timer-based polling loop (configurable interval, default 15s)
 *   2. Pre-filter: skip Gemini call when factory is healthy (saves ~80% API cost)
 *   3. Gemini evaluation: structured JSON decision (skip/correct/escalate)
 *   4. Action dispatch: INSERT into cwf_commands via same pipeline as interactive CWF
 *   5. Audit trail: every cycle logged to copilot_actions table
 *   6. Chat injection: copilot actions appear as messages in CWF chat
 *   7. Safety: heartbeat check, rate limiting, cooldown tracking, sim-stop detection
 *
 * Lifecycle:
 *   - CopilotEngine.start(simulationId) — begins the polling loop
 *   - CopilotEngine.stop() — stops the polling loop
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
import { GoogleGenerativeAI } from '@google/generative-ai';
import {
    buildCopilotSystemPrompt,
    buildMetricsSnapshot,
    parseCopilotResponse,
} from './copilotPrompt.js';
import { PARAMETER_RANGES } from '../../src/lib/params/parameterRanges.js';
import type { StationName } from '../../src/store/types.js';

// =============================================================================
// CONSTANTS (mirrored from src/lib/params/copilot.ts — api/ cannot import src/)
// =============================================================================

/** Sentinel value for authorized_by when copilot dispatches autonomous commands */
const COPILOT_AUTH_SENTINEL = 'system:copilot_auto';

/** Default polling interval in seconds */
const DEFAULT_POLL_INTERVAL_SEC = 15;

/** Maximum heartbeat age (ms) before auto-disengage (3 missed × 5s interval) */
const HEARTBEAT_TIMEOUT_MS = 15_000;

/** Gemini model for routine copilot evaluations */
const COPILOT_MODEL = 'gemini-2.0-flash-lite';

/** Station sentinel for copilot chat messages in cwf_commands */
const COPILOT_MSG_STATION = 'copilot_message';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Shape of a parameter that is currently outside its safe range.
 * Built by comparing latest machine_*_states against CWF_PARAM_RANGES.
 */
interface OutOfRangeParam {
    /** Station name (e.g., 'kiln', 'press') */
    station: string;
    /** Parameter column name (e.g., 'max_temperature_c') */
    parameter: string;
    /** Current value from the latest machine state row */
    current_value: number;
    /** Safe range minimum */
    min: number;
    /** Safe range maximum */
    max: number;
}

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

    /** Timer handle for the polling loop — null when not running */
    private pollTimer: ReturnType<typeof setInterval> | null = null;

    /** Active simulation session ID — null when not monitoring */
    private simulationId: string | null = null;

    /** In-memory cooldown map: "station.parameter" → timestamp when cooldown expires */
    private cooldownMap: Map<string, number> = new Map();

    /** Rate limiter: timestamps of recent actions (for max-actions-per-minute) */
    private recentActionTimestamps: number[] = [];

    /** Counter: total evaluation cycles this session */
    private cycleCount = 0;

    /** Counter: total corrective actions this session */
    private actionCount = 0;

    /** Timestamp of the last evaluation cycle */
    private lastCycleAt: string | null = null;

    /** Result of the last evaluation */
    private lastDecision: string | null = null;

    /** Lock to prevent concurrent evaluations (if a cycle takes longer than the poll interval) */
    private isEvaluating = false;

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
    }

    // =========================================================================
    // PUBLIC API
    // =========================================================================

    /**
     * Start the copilot monitoring loop for a specific simulation session.
     * Reads the poll interval from copilot_config if available.
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
        this.recentActionTimestamps = [];

        /** Read poll interval from copilot_config (or use default) */
        const { data: config } = await this.supabase
            .from('copilot_config')
            .select('poll_interval_sec')
            .eq('simulation_id', simulationId)
            .single();

        const intervalSec = config?.poll_interval_sec || DEFAULT_POLL_INTERVAL_SEC;

        /** Start the polling loop */
        this.pollTimer = setInterval(() => {
            /** Guard against concurrent evaluations */
            if (!this.isEvaluating) {
                this.evaluateOnce();
            }
        }, intervalSec * 1000);

        console.log(`[Copilot] 🟢 Started monitoring session ${simulationId} (poll every ${intervalSec}s)`);

        /** Run first evaluation immediately (don't wait for first interval) */
        this.evaluateOnce();
    }

    /**
     * Stop the copilot monitoring loop.
     * Clears the timer and resets internal state.
     */
    stop(): void {
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = null;
        }

        const sessionId = this.simulationId;
        this.simulationId = null;
        this.cooldownMap.clear();
        this.recentActionTimestamps = [];
        this.isEvaluating = false;

        console.log(`[Copilot] 🔴 Stopped monitoring session ${sessionId || 'unknown'}`);
    }

    /**
     * Handle a browser heartbeat — update last_heartbeat_at in copilot_config.
     *
     * @param simulationId - Session to heartbeat for
     */
    async handleHeartbeat(simulationId: string): Promise<void> {
        await this.supabase
            .from('copilot_config')
            .update({ last_heartbeat_at: new Date().toISOString() })
            .eq('simulation_id', simulationId);
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
     *   4. Pre-filter: skip Gemini if factory is healthy
     *   5. Call Gemini for decision
     *   6. Execute action if needed
     *   7. Log to audit trail
     */
    private async evaluateOnce(): Promise<void> {
        /** Acquire evaluation lock */
        this.isEvaluating = true;
        const cycleStart = Date.now();

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
            const simTick = oeeRow.sim_tick ?? 0;

            // -----------------------------------------------------------------
            // STEP 3: Read latest machine states + compare against safe ranges
            // -----------------------------------------------------------------
            const outOfRangeParams = await this.findOutOfRangeParams();

            // -----------------------------------------------------------------
            // STEP 4: Read copilot config for thresholds
            // -----------------------------------------------------------------
            const { data: config } = await this.supabase
                .from('copilot_config')
                .select('oee_alarm_threshold, quality_alarm_threshold, cooldown_sec, severity_threshold, max_actions_per_minute')
                .eq('simulation_id', this.simulationId)
                .single();

            const oeeAlarm = config?.oee_alarm_threshold ?? 60;
            const cooldownSec = config?.cooldown_sec ?? 30;

            // -----------------------------------------------------------------
            // STEP 5: PRE-FILTER — skip Gemini if factory is healthy
            // -----------------------------------------------------------------
            if (foee >= oeeAlarm && outOfRangeParams.length === 0) {
                /** Factory is healthy — no Gemini call needed */
                this.logSkipCycle(
                    `Factory healthy: FOEE=${foee.toFixed(1)}% (>=${oeeAlarm}%), 0 out-of-range params`,
                    cycleStart,
                );
                return;
            }

            // -----------------------------------------------------------------
            // STEP 6: Filter cooldown params
            // -----------------------------------------------------------------
            const now = Date.now();
            const recentlyCorrected: string[] = [];

            /** Clean expired cooldowns and collect active ones */
            for (const [key, expiresAt] of this.cooldownMap) {
                if (now >= expiresAt) {
                    this.cooldownMap.delete(key);
                } else {
                    recentlyCorrected.push(key);
                }
            }

            // -----------------------------------------------------------------
            // STEP 7: Rate limiter check
            // -----------------------------------------------------------------
            const maxActionsPerMin = config?.max_actions_per_minute ?? 2;

            /** Purge action timestamps older than 60 seconds */
            this.recentActionTimestamps = this.recentActionTimestamps.filter(
                ts => now - ts < 60_000
            );

            const rateLimited = this.recentActionTimestamps.length >= maxActionsPerMin;

            // -----------------------------------------------------------------
            // STEP 8: Call Gemini for evaluation
            // -----------------------------------------------------------------
            const triggerReason = outOfRangeParams.length > 0
                ? `${outOfRangeParams.length} params out of range: ${outOfRangeParams.map(p => `${p.station}.${p.parameter}`).join(', ')}`
                : `FOEE=${foee.toFixed(1)}% below alarm threshold ${oeeAlarm}%`;

            /** Build the system prompt and metrics user message */
            const systemPrompt = buildCopilotSystemPrompt(cooldownSec, recentlyCorrected);
            const metricsMessage = buildMetricsSnapshot(foee, machineOees, outOfRangeParams, 0, simTick);

            /** Call Gemini */
            const model = this.genAI.getGenerativeModel({
                model: COPILOT_MODEL,
                systemInstruction: systemPrompt,
            });

            const result = await model.generateContent(metricsMessage);
            const responseText = result.response.text();

            /** Parse the structured JSON response */
            const parsed = parseCopilotResponse(responseText);

            if (!parsed) {
                /** Gemini returned unparseable response — log and skip */
                await this.logAction({
                    simTick,
                    decision: 'skipped',
                    triggerReason,
                    metricsSnapshot: { foee, machineOees, outOfRangeParams: outOfRangeParams.length },
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
            // STEP 9: Execute action if decision is 'correct' and not rate-limited
            // -----------------------------------------------------------------
            let cwfCommandId: string | null = null;

            if (parsed.decision === 'correct' && parsed.action && !rateLimited) {
                /** Validate the action against PARAMETER_RANGES */
                const stationRanges = PARAMETER_RANGES[parsed.action.station as StationName];
                const paramRange = stationRanges?.[parsed.action.parameter];

                if (paramRange) {
                    /** Ensure new_value is within safe range (force midpoint) */
                    const midpoint = (paramRange.min + paramRange.max) / 2;
                    const safeNewValue = midpoint;

                    /** INSERT into cwf_commands (same pipeline as interactive CWF) */
                    const { data: cmdData, error: cmdError } = await this.supabase
                        .from('cwf_commands')
                        .insert({
                            session_id: this.simulationId,
                            station: parsed.action.station,
                            parameter: parsed.action.parameter,
                            old_value: parsed.action.current_value,
                            new_value: safeNewValue,
                            reason: `[Copilot] ${parsed.action.reason}`,
                            authorized_by: COPILOT_AUTH_SENTINEL,
                            status: 'pending',
                        })
                        .select('id')
                        .single();

                    if (cmdError) {
                        console.error('[Copilot] ❌ Failed to insert cwf_command:', cmdError.message);
                    } else {
                        cwfCommandId = cmdData.id;
                        this.actionCount++;
                        this.recentActionTimestamps.push(now);

                        /** Set cooldown for this parameter */
                        const cooldownKey = `${parsed.action.station}.${parsed.action.parameter}`;
                        this.cooldownMap.set(cooldownKey, now + cooldownSec * 1000);

                        console.log(`[Copilot] 🔧 Corrected ${cooldownKey}: ${parsed.action.current_value} → ${safeNewValue}`);
                    }
                } else {
                    console.error(`[Copilot] ❌ Unknown param range: ${parsed.action.station}.${parsed.action.parameter}`);
                }
            } else if (rateLimited && parsed.decision === 'correct') {
                console.warn(`[Copilot] ⏳ Rate limited — skipping correction (${this.recentActionTimestamps.length}/${maxActionsPerMin} actions/min)`);
            }

            // -----------------------------------------------------------------
            // STEP 10: Inject chat message into CWF via cwf_commands
            // -----------------------------------------------------------------
            if (parsed.chat_message && parsed.decision !== 'skip') {
                await this.injectChatMessage(parsed.chat_message, simTick);
            }

            // -----------------------------------------------------------------
            // STEP 11: Log to audit trail
            // -----------------------------------------------------------------
            await this.logAction({
                simTick,
                decision: parsed.decision === 'correct' && rateLimited ? 'observed' : parsed.decision,
                triggerReason,
                metricsSnapshot: { foee, machineOees, outOfRangeCount: outOfRangeParams.length },
                actionTaken: parsed.action ? {
                    station: parsed.action.station,
                    parameter: parsed.action.parameter,
                    old_value: parsed.action.current_value,
                    new_value: parsed.action.new_value,
                    reason: parsed.action.reason,
                } : null,
                cwfCommandId,
                geminiReasoning: parsed.reasoning,
                chatMessage: parsed.chat_message,
                modelUsed: COPILOT_MODEL,
                latencyMs: Date.now() - cycleStart,
            });

        } catch (error) {
            console.error('[Copilot] ❌ Evaluation cycle error:', error);
        } finally {
            /** Update counters and release lock */
            this.cycleCount++;
            this.lastCycleAt = new Date().toISOString();
            this.isEvaluating = false;
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

        const { data: config } = await this.supabase
            .from('copilot_config')
            .select('last_heartbeat_at, enabled')
            .eq('simulation_id', this.simulationId)
            .single();

        if (!config) {
            /** No config row — should not happen, but disengage to be safe */
            console.warn('[Copilot] ⛔ No copilot_config row found — disengaging');
            this.stop();
            return false;
        }

        /** Check if copilot was externally disabled (user clicked button, sim stopped, etc.) */
        if (!config.enabled) {
            console.log('[Copilot] 🔴 Copilot disabled externally — stopping engine');
            this.stop();
            return false;
        }

        /** Check heartbeat freshness */
        const heartbeatAge = Date.now() - new Date(config.last_heartbeat_at).getTime();
        if (heartbeatAge > HEARTBEAT_TIMEOUT_MS) {
            console.warn(`[Copilot] ⛔ Browser heartbeat lost (${(heartbeatAge / 1000).toFixed(1)}s old) — auto-disengaging`);

            /** Disable copilot in the database */
            await this.supabase
                .from('copilot_config')
                .update({ enabled: false, updated_at: new Date().toISOString() })
                .eq('simulation_id', this.simulationId);

            /** Log the auto-disengage event */
            await this.injectChatMessage(
                '⛔ Copilot auto-disengaged: browser connection lost. Please re-enable to resume monitoring.',
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
     * Query all 7 machine_*_states tables and compare every parameter
     * against its safe range in CWF_PARAM_RANGES.
     *
     * @returns Array of parameters that are currently outside their safe range
     */
    private async findOutOfRangeParams(): Promise<OutOfRangeParam[]> {
        const outOfRange: OutOfRangeParam[] = [];

        for (const [station, tableName] of Object.entries(MACHINE_STATE_TABLES)) {
            /** Query the latest row for this station */
            const { data: row } = await this.supabase
                .from(tableName)
                .select('*')
                .eq('simulation_id', this.simulationId!)
                .order('sim_tick', { ascending: false })
                .limit(1)
                .single();

            if (!row) continue;

            /** Get the safe ranges for this station */
            const stationRanges = PARAMETER_RANGES[station as StationName];
            if (!stationRanges) continue;

            /** Compare each parameter against its range */
            for (const [param, range] of Object.entries(stationRanges)) {
                /** Cast range to typed object (PARAMETER_RANGES uses Record<string, {min, max}>) */
                const typedRange = range as { min: number; max: number };
                const value = row[param];

                /** Skip null/undefined values (parameter not reported yet) */
                if (value === null || value === undefined || !Number.isFinite(value)) {
                    continue;
                }

                /** Check if parameter is outside its safe range */
                if (value < typedRange.min || value > typedRange.max) {
                    outOfRange.push({
                        station,
                        parameter: param,
                        current_value: value,
                        min: typedRange.min,
                        max: typedRange.max,
                    });
                }
            }
        }

        return outOfRange;
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
        this.isEvaluating = false;
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
