/**
 * api/cwf/copilot/evaluate.ts — Vercel Serverless Copilot Evaluation Endpoint
 *
 * Runs ONE evaluation cycle of the Copilot engine per invocation.
 * Called by the browser's copilotHeartbeat hook every 6 seconds when
 * Copilot mode is active on the Vercel deployment.
 *
 * Architecture:
 *   - STATELESS: each invocation reads fresh state from Supabase, evaluates
 *     via Gemini (one-shot generateContent, NOT persistent ChatSession),
 *     applies corrections, and returns. No in-memory polling loop.
 *   - This replaces the CopilotEngine's setTimeout polling loop which
 *     requires a persistent Node.js process (only available locally via
 *     cwf-dev-server.ts, NOT on Vercel serverless).
 *   - The browser drives the polling cadence instead of the server.
 *
 * Endpoint: POST /api/cwf/copilot/evaluate
 * Body: { simulationId: string }
 * Returns: { decision, correctedParams, foee, cycleCount, latencyMs }
 *
 * Environment Variables Required:
 *   GEMINI_API_KEY           — Google AI Studio API key
 *   SUPABASE_URL             — Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY — Supabase service role key
 *
 * Dependencies:
 *   - api/cwf/copilotPrompt.ts (prompt builder, response parser, reference JSON)
 *   - api/cwf/cwfParameterRanges.ts (PARAMETER_RANGES for reference JSON)
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import {
    buildReferenceJSON,
    buildCopilotSystemPrompt,
    buildCopilotUserMessage,
    parseCopilotResponse,
    type CopilotReferenceJSON,
    type CopilotStateJSON,
} from '../copilotPrompt.js';

// =============================================================================
// CONSTANTS
// =============================================================================

/** Sentinel value for authorized_by when copilot dispatches autonomous commands */
const COPILOT_AUTH_SENTINEL = 'system:copilot_auto';

/** Gemini model for copilot evaluations — gemini-2.5-flash */
const COPILOT_MODEL = 'gemini-2.5-flash';

/** Station sentinel for copilot chat messages in cwf_commands */
const COPILOT_MSG_STATION = 'copilot_message';

/**
 * Maximum heartbeat age (ms) before auto-disengage.
 * 45s — generous enough to avoid false-positive disconnections
 * while still catching genuinely closed tabs.
 */
const HEARTBEAT_TIMEOUT_MS = 45_000;

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

/**
 * Per-machine OEE low-water-mark threshold.
 * At 80%, the ⚠️ warning badge shows and Gemini is called to evaluate.
 */
const MACHINE_OEE_LOW_WATER_MARK = 80;

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Count how many parameters in the stateJSON are currently outside their
 * safe range as defined by the referenceJSON. Used for the pre-filter
 * decision (skip Gemini if factory is truly healthy).
 *
 * @param stateJSON     - Current factory state snapshot
 * @param referenceJSON - Safe parameter ranges and midpoints
 * @returns Number of out-of-range parameters
 */
function countOutOfRangeParams(
    stateJSON: CopilotStateJSON,
    referenceJSON: CopilotReferenceJSON,
): number {
    let count = 0;
    for (const [station, params] of Object.entries(stateJSON.parameters)) {
        const stationRef = referenceJSON[station];
        if (!stationRef) continue;
        for (const [param, value] of Object.entries(params)) {
            if (value === null || !Number.isFinite(value)) continue;
            const paramRef = stationRef[param];
            if (!paramRef) continue;
            if (value < paramRef.min || value > paramRef.max) {
                count++;
            }
        }
    }
    return count;
}

/**
 * Build the CopilotStateJSON from current Supabase readings.
 * Reads ALL parameter values for ALL 7 machine stations + conveyor.
 *
 * @param supabase       - Supabase client with service role
 * @param simulationId   - Active simulation session UUID
 * @param simTick        - Current simulation tick
 * @param foee           - Current Factory OEE
 * @param machineOees    - Per-machine OEE map
 * @param cooldownParams - Parameters currently in cooldown
 * @param referenceJSON  - Reference ranges for parameter extraction
 * @returns CopilotStateJSON ready for Gemini evaluation
 */
async function buildCurrentStateJSON(
    supabase: SupabaseClient,
    simulationId: string,
    simTick: number,
    foee: number,
    machineOees: Record<string, number>,
    cooldownParams: string[],
    referenceJSON: CopilotReferenceJSON,
): Promise<CopilotStateJSON> {
    /** Initialise empty parameters container */
    const parameters: CopilotStateJSON['parameters'] = {};

    /** Read latest row from each machine state table */
    for (const [station, tableName] of Object.entries(MACHINE_STATE_TABLES)) {
        const { data: row } = await supabase
            .from(tableName)
            .select('*')
            .eq('simulation_id', simulationId)
            .order('sim_tick', { ascending: false })
            .limit(1)
            .maybeSingle();

        const stationRef = referenceJSON[station];
        if (!stationRef) continue;

        parameters[station] = {};
        for (const param of Object.keys(stationRef)) {
            const value = row ? row[param] : null;
            parameters[station][param] =
                (value !== null && value !== undefined && Number.isFinite(Number(value)))
                    ? Number(value)
                    : null;
        }
    }

    /** Read conveyor speed — DB column is conveyor_speed, mapped to conveyor_speed_x */
    const { data: conveyorRow } = await supabase
        .from('conveyor_states')
        .select('conveyor_speed')
        .eq('simulation_id', simulationId)
        .order('sim_tick', { ascending: false })
        .limit(1)
        .maybeSingle();

    parameters['conveyor'] = {
        conveyor_speed_x: conveyorRow?.conveyor_speed !== null &&
            conveyorRow?.conveyor_speed !== undefined
            ? Number(conveyorRow.conveyor_speed)
            : null,
    };

    /** Count active unacknowledged alarms */
    const { count: alarmCount } = await supabase
        .from('alarm_log')
        .select('id', { count: 'exact', head: true })
        .eq('simulation_id', simulationId)
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

/**
 * Inject a copilot message into the CWF chat via cwf_commands.
 * The browser's useCWFCommandListener recognises station='copilot_message'
 * and renders it with a 🤖 badge.
 *
 * @param supabase     - Supabase client
 * @param simulationId - Active simulation session UUID
 * @param message      - Human-readable chat message
 * @param simTick      - Current simulation tick
 */
async function injectChatMessage(
    supabase: SupabaseClient,
    simulationId: string,
    message: string,
    simTick: number,
): Promise<void> {
    await supabase
        .from('cwf_commands')
        .insert({
            session_id: simulationId,
            station: COPILOT_MSG_STATION,
            parameter: 'copilot_chat',
            old_value: simTick,
            new_value: 0,
            reason: message,
            authorized_by: COPILOT_AUTH_SENTINEL,
            status: 'pending',
        });
}

/**
 * Log a copilot decision to the copilot_actions audit trail table.
 *
 * @param supabase     - Supabase client
 * @param simulationId - Active simulation session UUID
 * @param entry        - Audit trail entry data
 */
async function logAction(
    supabase: SupabaseClient,
    simulationId: string,
    entry: {
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
    },
): Promise<void> {
    const { error } = await supabase
        .from('copilot_actions')
        .insert({
            simulation_id: simulationId,
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
        console.error('[Copilot/Vercel] ❌ Failed to log action:', error.message);
    }
}

// =============================================================================
// VERCEL HANDLER
// =============================================================================

/**
 * POST /api/cwf/copilot/evaluate
 *
 * Runs a single copilot evaluation cycle:
 *   1. Validate simulationId and check copilot is enabled
 *   2. Update heartbeat timestamp (combined heartbeat + evaluate)
 *   3. Check simulation status (auto-disengage if ended)
 *   4. Read latest OEE snapshot
 *   5. Build current state JSON from all machine readings
 *   6. Pre-filter: skip Gemini if factory is truly healthy
 *   7. Call Gemini (one-shot) for correction plan
 *   8. Apply all corrections via cwf_commands
 *   9. Inject chat message and log to audit trail
 *  10. Return result summary
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
    /** Only accept POST requests */
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const cycleStart = Date.now();
    let simTick = 0;

    try {
        /** Extract simulationId from request body */
        const { simulationId } = req.body as { simulationId?: string };
        if (!simulationId) {
            return res.status(400).json({ error: 'simulationId is required' });
        }

        /** Initialise clients from environment variables */
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        const geminiKey = process.env.GEMINI_API_KEY;

        if (!supabaseUrl || !supabaseKey || !geminiKey) {
            return res.status(500).json({ error: 'Missing required environment variables' });
        }

        const supabase = createClient(supabaseUrl, supabaseKey);
        const genAI = new GoogleGenerativeAI(geminiKey);

        // -----------------------------------------------------------------
        // STEP 1: Check copilot is enabled and update heartbeat
        // -----------------------------------------------------------------

        /** Read copilot_config for this simulation */
        const { data: config, error: configError } = await supabase
            .from('copilot_config')
            .select('enabled, cwf_state, last_heartbeat_at, oee_alarm_threshold, cooldown_sec, max_actions_per_minute')
            .eq('simulation_id', simulationId)
            .single();

        if (configError || !config) {
            return res.status(404).json({ error: 'No copilot_config found for this simulation' });
        }

        /**
         * Check copilot is active using cwf_state as the SINGLE SOURCE OF TRUTH.
         * The legacy `enabled` boolean is no longer authoritative — it can be out
         * of sync with cwf_state. The 3-state machine (normal, copilot_pending_auth,
         * copilot_active) is the correct way to determine if copilot is running.
         */
        if (config.cwf_state !== 'copilot_active') {
            return res.status(200).json({
                decision: 'disabled',
                message: 'Copilot is not active for this simulation',
            });
        }

        /** Update heartbeat timestamp (combined heartbeat + evaluate) */
        await supabase
            .from('copilot_config')
            .update({ last_heartbeat_at: new Date().toISOString() })
            .eq('simulation_id', simulationId);

        // -----------------------------------------------------------------
        // STEP 2: Check heartbeat freshness (browser disconnect safety)
        // -----------------------------------------------------------------

        const heartbeatAge = Date.now() - new Date(config.last_heartbeat_at).getTime();
        if (heartbeatAge > HEARTBEAT_TIMEOUT_MS) {
            /** Browser heartbeat lost — auto-disengage */
            await supabase.from('copilot_config').update({
                enabled: false,
                cwf_state: 'normal',
                auth_attempts: 0,
                updated_at: new Date().toISOString(),
            }).eq('simulation_id', simulationId);

            await injectChatMessage(
                supabase, simulationId,
                '⛔ Copilot auto-disengaged: browser connection lost. Please re-enable to resume monitoring.',
                0,
            );

            return res.status(200).json({ decision: 'disengaged', reason: 'heartbeat_timeout' });
        }

        // -----------------------------------------------------------------
        // STEP 3: Check simulation status (auto-disengage if ended)
        // -----------------------------------------------------------------

        const { data: simRow } = await supabase
            .from('simulation_sessions')
            .select('status')
            .eq('id', simulationId)
            .maybeSingle();

        if (simRow && (simRow.status === 'completed' || simRow.status === 'stopped')) {
            await supabase.from('copilot_config').update({
                cwf_state: 'normal',
                auth_attempts: 0,
                enabled: false,
                updated_at: new Date().toISOString(),
            }).eq('simulation_id', simulationId);

            await injectChatMessage(
                supabase, simulationId,
                '⏹️ The simulation has ended. Copilot mode has been automatically disengaged.',
                0,
            );

            return res.status(200).json({ decision: 'disengaged', reason: 'simulation_ended' });
        }

        // -----------------------------------------------------------------
        // STEP 4: Read latest OEE snapshot
        // -----------------------------------------------------------------

        const { data: oeeRow } = await supabase
            .from('oee_snapshots')
            .select('foee, moee_press, moee_dryer, moee_glaze, moee_digital, moee_kiln, moee_sorting, moee_packaging, moee_conveyor, sim_tick')
            .eq('simulation_id', simulationId)
            .order('sim_tick', { ascending: false })
            .limit(1)
            .single();

        if (!oeeRow) {
            await injectChatMessage(
                supabase, simulationId,
                '🤖 Monitoring active — waiting for first OEE snapshot from the simulation.',
                0,
            );
            return res.status(200).json({ decision: 'waiting', message: 'No OEE data yet' });
        }

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
        simTick = oeeRow.sim_tick ?? 0;

        // -----------------------------------------------------------------
        // STEP 5: Build current state JSON
        // -----------------------------------------------------------------

        /** Build reference JSON (stateless — built fresh each invocation) */
        const referenceJSON = buildReferenceJSON();

        /**
         * Read cooldown state from copilot_actions — find parameters corrected
         * within the last cooldown_sec seconds. Since this is stateless (no in-memory
         * cooldown map), we check the audit trail for recent corrections.
         */
        const cooldownSec = config.cooldown_sec ?? 30;
        const cooldownCutoff = new Date(Date.now() - cooldownSec * 1000).toISOString();
        const { data: recentActions } = await supabase
            .from('copilot_actions')
            .select('action_taken')
            .eq('simulation_id', simulationId)
            .eq('decision', 'corrected')
            .gte('created_at', cooldownCutoff);

        /** Extract recently corrected param keys for cooldown */
        const cooldownParams: string[] = [];
        if (recentActions) {
            for (const row of recentActions) {
                const action = row.action_taken as { station?: string; parameter?: string } | null;
                if (action?.station && action?.parameter) {
                    cooldownParams.push(`${action.station}.${action.parameter}`);
                }
            }
        }

        const stateJSON = await buildCurrentStateJSON(
            supabase, simulationId, simTick, foee, machineOees, cooldownParams, referenceJSON,
        );

        // -----------------------------------------------------------------
        // STEP 6: Pre-filter — skip Gemini if factory is truly healthy
        // -----------------------------------------------------------------

        const oeeAlarm = config.oee_alarm_threshold ?? 75;
        const outOfRangeCount = countOutOfRangeParams(stateJSON, referenceJSON);

        const lowMachines = Object.entries(machineOees)
            .filter(([, oee]) => oee < MACHINE_OEE_LOW_WATER_MARK)
            .map(([machine, oee]) => `${machine}: ${oee.toFixed(0)}%`);

        const factoryTrulyHealthy =
            foee >= oeeAlarm &&
            outOfRangeCount === 0 &&
            lowMachines.length === 0;

        if (factoryTrulyHealthy) {
            /** Build compact OEE summary with colour-coded per-machine values */
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

            await injectChatMessage(
                supabase, simulationId,
                `🤖 [Tick ${simTick}] Monitoring — FOEE: ${foee.toFixed(1)}% ✅ | ${machineOeeSummary}${warningNote} | No intervention needed.`,
                simTick,
            );

            return res.status(200).json({
                decision: 'skip',
                foee: foee.toFixed(1),
                simTick,
                latencyMs: Date.now() - cycleStart,
            });
        }

        // -----------------------------------------------------------------
        // STEP 7: Call Gemini (one-shot generateContent — stateless)
        // -----------------------------------------------------------------

        const triggerReason = lowMachines.length > 0
            ? `Low machine OEE: ${lowMachines.join(', ')}`
            : outOfRangeCount > 0
                ? `${outOfRangeCount} params out of range`
                : `FOEE ${foee.toFixed(1)}% below alarm ${oeeAlarm}%`;

        console.log(`[Copilot/Vercel] 🔍 Triggering Gemini evaluation: ${triggerReason}`);

        const systemPrompt = buildCopilotSystemPrompt(referenceJSON);
        const userMessage = buildCopilotUserMessage(stateJSON);

        const model = genAI.getGenerativeModel({
            model: COPILOT_MODEL,
            systemInstruction: systemPrompt,
        });

        const result = await model.generateContent(userMessage);
        const responseText = result.response.text();

        /** Parse and validate the structured JSON response */
        const parsed = parseCopilotResponse(responseText);

        if (!parsed) {
            /** Gemini returned unparseable response — log and skip */
            await logAction(supabase, simulationId, {
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

            return res.status(200).json({
                decision: 'error',
                message: 'Gemini returned unparseable response',
                latencyMs: Date.now() - cycleStart,
            });
        }

        // -----------------------------------------------------------------
        // STEP 8: Apply all corrections via cwf_commands
        // -----------------------------------------------------------------

        const correctedParams: Array<{ station: string; parameter: string; old_value: number; new_value: number }> = [];
        let cwfCommandId: string | null = null;

        if (parsed.decision === 'correct' && parsed.actions.length > 0) {
            for (const action of parsed.actions) {
                const cooldownKey = `${action.station}.${action.parameter}`;

                /** Skip if parameter is in cooldown (recently corrected) */
                if (cooldownParams.includes(cooldownKey)) {
                    console.log(`[Copilot/Vercel] ⏳ Skipping ${cooldownKey} — on cooldown`);
                    continue;
                }

                /** Force target_value to the midpoint from reference JSON */
                const stationRef = referenceJSON[action.station];
                const paramRef = stationRef?.[action.parameter];
                const safeTarget = paramRef ? paramRef.midpoint : action.target_value;

                /** Insert cwf_commands row for the correction */
                const { data: cmdData, error: cmdError } = await supabase
                    .from('cwf_commands')
                    .insert({
                        session_id: simulationId,
                        station: action.station,
                        parameter: action.parameter,
                        old_value: action.current_value,
                        new_value: safeTarget,
                        reason: `[Copilot] ${action.reason}`,
                        authorized_by: COPILOT_AUTH_SENTINEL,
                        status: 'pending',
                    })
                    .select('id')
                    .single();

                if (cmdError) {
                    console.error(`[Copilot/Vercel] ❌ Failed to insert cwf_command for ${cooldownKey}:`, cmdError.message);
                    continue;
                }

                if (cmdData && !cwfCommandId) {
                    cwfCommandId = cmdData.id;
                }

                correctedParams.push({
                    station: action.station,
                    parameter: action.parameter,
                    old_value: action.current_value,
                    new_value: safeTarget,
                });
                console.log(`[Copilot/Vercel] 🔧 Corrected ${cooldownKey}: ${action.current_value} → ${safeTarget}`);
            }
        }

        // -----------------------------------------------------------------
        // STEP 9: Inject verbose chat message into CWF
        // -----------------------------------------------------------------

        let chatMessage = parsed.chat_message;

        if (correctedParams.length > 1) {
            const correctionList = correctedParams
                .map(c => `🔧 ${c.station}.${c.parameter}: ${c.old_value} → ${c.new_value}`)
                .join('\n');
            chatMessage = `[Tick ${simTick}] 🔧 Bulk correction — ${correctedParams.length} parameters restored to safe range:\n${correctionList}\nFOEE: ${foee.toFixed(1)}%`;
        } else if (correctedParams.length === 1 && chatMessage) {
            chatMessage = `[Tick ${simTick}] ${chatMessage}`;
        } else if (parsed.decision === 'skip' || correctedParams.length === 0) {
            const machineSummary = Object.entries(machineOees)
                .map(([m, v]) => `${m}: ${v.toFixed(0)}%${v < 80 ? '⚠️' : ''}`)
                .join(' | ');
            const watchingMachines = Object.entries(machineOees)
                .filter(([, oee]) => oee >= 80 && oee < 90)
                .map(([m, v]) => `${m} (${v.toFixed(0)}%)`);
            const watchNote = watchingMachines.length > 0
                ? ` | ⚠️ Watching: ${watchingMachines.join(', ')}`
                : '';
            const foeeBadge = foee >= oeeAlarm ? '✅' : '⚠️';
            chatMessage = `🤖 [Tick ${simTick}] Monitoring — FOEE: ${foee.toFixed(1)}% ${foeeBadge} | ${machineSummary}${watchNote} | No intervention needed.`;
        } else if (chatMessage) {
            chatMessage = `[Tick ${simTick}] ${chatMessage}`;
        }

        if (chatMessage) {
            await injectChatMessage(supabase, simulationId, chatMessage, simTick);
        }

        // -----------------------------------------------------------------
        // STEP 10: Log to audit trail
        // -----------------------------------------------------------------

        await logAction(supabase, simulationId, {
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
            chatMessage,
            modelUsed: COPILOT_MODEL,
            latencyMs: Date.now() - cycleStart,
        });

        return res.status(200).json({
            decision: parsed.decision,
            correctedParams: correctedParams.length,
            foee: foee.toFixed(1),
            simTick,
            latencyMs: Date.now() - cycleStart,
        });

    } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.error('[Copilot/Vercel] ❌ Evaluation cycle error:', error);

        return res.status(500).json({
            error: 'Copilot evaluation failed',
            details: errMsg.substring(0, 200),
            simTick,
            latencyMs: Date.now() - cycleStart,
        });
    }
}
