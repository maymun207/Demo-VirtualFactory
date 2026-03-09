/**
 * useCWFCommandListener.ts — CWF Parameter Command Realtime Listener + UI Action Dispatcher
 *
 * React hook that subscribes to Supabase Realtime Postgres Changes on the
 * `cwf_commands` table. When the CWF AI agent inserts a new command (after
 * the human-in-the-loop approval flow), this hook:
 *
 *   Phase 2 (Parameter Commands):
 *   1. Receives the INSERT event via WebSocket (near-instant)
 *   2. Validates the parameter value against CWF_PARAM_RANGES
 *   3. Applies the change to the Zustand simulation data store
 *   4. Updates the command status ('applied' or 'rejected') in Supabase
 *   5. Posts a system message to the CWF chat panel as visual confirmation
 *
 *   Phase 3 (UI Action Commands — station=CWF_UI_ACTION_STATION_SENTINEL):
 *   1. Detects rows with station='ui_action' via CWF_UI_ACTION_STATION_SENTINEL
 *   2. Routes to processUIActionCommand() module-level function
 *   3. Dispatches the action to the correct Zustand store (uiStore, simulationStore)
 *   4. Acknowledges to the server by updating cwf_commands.status
 *
 * FALLBACK POLLING:
 *   Supabase Realtime WebSocket connections can be unreliable on some
 *   deployments (Vercel, mobile browsers, corporate proxies). To guarantee
 *   CWF commands are always processed, a fallback polling mechanism runs
 *   every CWF_POLL_INTERVAL_MS, querying for any commands stuck in 'pending'
 *   status and processing them the same way as the Realtime handler.
 *
 * Architecture:
 *   CWF serverless fn → INSERT cwf_commands → Supabase Realtime → this hook
 *                                                                    ↓
 *                                  updateParameter() or processUIActionCommand()
 *                                             (+ fallback polling every 5s)
 *
 * Mount point: App.tsx (alongside useKPISync, useConveyorBehaviour)
 *
 * Configuration:
 *   - src/lib/params/cwfCommands.ts  (CWF_PARAM_RANGES, validateCWFParamValue)
 *   - src/lib/params/uiTelemetry.ts  (CWF_UI_ACTION_STATION_SENTINEL, CWF_UI_ACTION_VALUE_SEPARATOR)
 */

import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { validateCWFParamValue } from '../lib/params/cwfCommands';
import { useSimulationDataStore } from '../store/simulationDataStore';
import { useCWFStore } from '../store/cwfStore';
import type { StationName } from '../store/types';
/** uiStore — panel toggles and language control for CWF UI actions */
import { useUIStore } from '../store/uiStore';
/** simulationStore — start/stop/reset actions for CWF UI actions */
import { useSimulationStore } from '../store/simulationStore';
/** kpiStore — needed for full factory reset orchestration */
import { useKPIStore } from '../store/kpiStore';
/** workOrderStore — needed for full factory reset orchestration */
import { useWorkOrderStore } from '../store/workOrderStore';
/** syncService — needed for full factory reset orchestration */
import { syncService } from '../services/syncService';
/**
 * Sentinel and separator constants for UI action command routing.
 * Imported from Params — never hardcode 'ui_action' or '| value:' inline.
 */
import {
    CWF_UI_ACTION_STATION_SENTINEL,
    CWF_UI_ACTION_VALUE_SEPARATOR,
} from '../lib/params/uiTelemetry';
import {
    CWF_UI_ACTION_CLOSE,
} from '../lib/params/cwfAgent';

/**
 * Conveyor boolean parameter names that are stored as 0/1 numbers in the
 * cwf_commands table but must be converted to boolean before applying.
 * All other conveyor params are applied as numeric values directly.
 */
const CONVEYOR_BOOL_PARAMS = new Set(['speed_change', 'jammed_events']);

// =============================================================================
// UI ACTION DISPATCHER  (module-level — does NOT need React context)
// =============================================================================

/**
 * processUIActionCommand — Dispatch a CWF UI action to the correct Zustand stores.
 *
 * Called when the cwf_commands listener receives a row with station='ui_action'.
 * The command.parameter field contains the action_type string, and the
 * command.reason field encodes the optional action_value (format: "reason | value: X").
 *
 * This function directly calls Zustand store actions via getState() since it runs
 * outside of React component context (not a hook, not inside a useEffect).
 *
 * After executing, it updates the cwf_commands row to 'applied' or 'rejected'
 * and posts a system message to the CWF chat panel as visual confirmation.
 *
 * @param command - The CWF command row with station='ui_action'
 */
async function processUIActionCommand(command: {
    id: string;
    parameter: string;  // Contains the action_type
    reason: string | null; // May encode action_value after "| value: "
    status: string;
}): Promise<void> {
    if (!supabase) return;

    /** Extract action_type from the parameter field — always present on ui_action rows */
    const actionType = command.parameter;

    /**
     * Extract optional action_value from the reason field.
     * The separator is defined in uiTelemetry.ts as CWF_UI_ACTION_VALUE_SEPARATOR.
     * Format: "<human reason> | value: <action_value>"
     * If no separator is found, action_value is undefined (used by non-set_language actions).
     */
    const reasonStr = command.reason ?? '';
    /** Escape the separator for RegExp and build the extraction pattern */
    const sepEscaped = CWF_UI_ACTION_VALUE_SEPARATOR.replace(/[|]/g, '\\|');
    const valueMatch = reasonStr.match(new RegExp(`${sepEscaped}\\s*(.+)$`));
    /** Trim whitespace from the extracted value */
    const actionValue = valueMatch ? valueMatch[1].trim() : undefined;

    /** Convenient store accessors via getState() — safe outside React */
    const ui = useUIStore.getState();
    const sim = useSimulationStore.getState();

    try {
        /**
         * Dispatch to the correct Zustand action based on action_type.
         * All 15 supported action_types are handled explicitly.
         */
        switch (actionType) {
            // ── Panel Toggles ────────────────────────────────────────────────
            case 'toggle_basic_panel': {
                /**
                 * Idempotent open/close for the Basic KPI + Heatmap side panel.
                 * actionValue 'close' → ensure panel is closed.
                 * Anything else (including 'open' or undefined) → ensure panel is open.
                 * Guard prevents a double-fire from accidentally reversing state.
                 */
                const shouldOpenBasic = actionValue !== CWF_UI_ACTION_CLOSE;
                if (ui.showBasicPanel !== shouldOpenBasic) {
                    ui.toggleBasicPanel();
                }
                break;
            }
            case 'toggle_dtxfr': {
                /**
                 * Idempotent open/close for the Digital Transfer (DTXFR) side panel.
                 */
                const shouldOpenDTXFR = actionValue !== CWF_UI_ACTION_CLOSE;
                if (ui.showDTXFR !== shouldOpenDTXFR) {
                    ui.toggleDTXFR();
                }
                break;
            }
            case 'toggle_oee_hierarchy': {
                /**
                 * Idempotent open/close for the 3D OEE Hierarchy table.
                 */
                const shouldOpenOEE = actionValue !== CWF_UI_ACTION_CLOSE;
                if (ui.showOEEHierarchy !== shouldOpenOEE) {
                    ui.toggleOEEHierarchy();
                }
                break;
            }
            case 'toggle_prod_table': {
                /**
                 * Idempotent open/close for the 3D Production Status table.
                 * Uses setShowProductionTable(bool) directly — already idempotent.
                 */
                const shouldOpenProd = actionValue !== CWF_UI_ACTION_CLOSE;
                if (ui.showProductionTable !== shouldOpenProd) {
                    ui.setShowProductionTable(shouldOpenProd);
                }
                break;
            }
            case 'toggle_cwf_panel': {
                /**
                 * Idempotent open/close for the CWF chat sidebar.
                 */
                const shouldOpenCWF = actionValue !== CWF_UI_ACTION_CLOSE;
                if (ui.showCWF !== shouldOpenCWF) {
                    ui.toggleCWF();
                }
                break;
            }
            case 'toggle_control_panel': {
                /**
                 * Idempotent open/close for the Control & Actions floating panel.
                 */
                const shouldOpenControl = actionValue !== CWF_UI_ACTION_CLOSE;
                if (ui.showControlPanel !== shouldOpenControl) {
                    ui.toggleControlPanel();
                }
                break;
            }
            case 'toggle_alarm_log': {
                /**
                 * Idempotent open/close for the Alarm Log popup.
                 */
                const shouldOpenAlarm = actionValue !== CWF_UI_ACTION_CLOSE;
                if (ui.showAlarmLog !== shouldOpenAlarm) {
                    ui.toggleAlarmLog();
                }
                break;
            }
            case 'toggle_heatmap': {
                /**
                 * Idempotent open/close for the FTQ Defect Heatmap floating panel.
                 */
                const shouldOpenHeatmap = actionValue !== CWF_UI_ACTION_CLOSE;
                if (ui.showHeatmap !== shouldOpenHeatmap) {
                    ui.toggleHeatmap();
                }
                break;
            }
            case 'toggle_kpi': {
                /**
                 * Idempotent open/close for the KPI floating panel.
                 */
                const shouldOpenKPI = actionValue !== CWF_UI_ACTION_CLOSE;
                if (ui.showKPI !== shouldOpenKPI) {
                    ui.toggleKPI();
                }
                break;
            }
            case 'toggle_tile_passport': {
                /**
                 * Idempotent open/close for the Tile Passport floating panel.
                 */
                const shouldOpenPassport = actionValue !== CWF_UI_ACTION_CLOSE;
                if (ui.showPassport !== shouldOpenPassport) {
                    ui.togglePassport();
                }
                break;
            }
            case 'toggle_demo_settings': {
                /**
                 * Idempotent open/close for the Demo Settings modal.
                 */
                const shouldOpenDemo = actionValue !== CWF_UI_ACTION_CLOSE;
                if (ui.showDemoSettings !== shouldOpenDemo) {
                    ui.toggleDemoSettings();
                }
                break;
            }

            // ── Simulation Lifecycle ─────────────────────────────────────────
            case 'start_simulation':
                /**
                 * Start the simulation.
                 * Guard: only start if isSimConfigured is true (Demo Settings gate).
                 * If not configured, reject with a descriptive message.
                 */
                if (!ui.isSimConfigured) {
                    await supabase
                        .from('cwf_commands')
                        .update({
                            status: 'rejected',
                            rejected_reason: 'Demo Settings must be configured before starting the simulation. Please open Demo Settings (toggle_demo_settings) first.',
                        })
                        .eq('id', command.id);
                    useCWFStore.getState().addSystemMessage(
                        '⚠️ Cannot start: Demo Settings must be configured first. Please open Demo Settings.',
                    );
                    return;
                }
                if (!sim.isDataFlowing) {
                    /** Only start if not already running */
                    sim.toggleDataFlow();
                }
                break;
            case 'stop_simulation':
                /** Stop the simulation if it is currently running */
                if (sim.isDataFlowing) {
                    sim.toggleDataFlow();
                }
                break;
            case 'reset_simulation':
                /**
                 * Full factory reset — same logic as useFactoryReset hook.
                 * Replicates the orchestration here since hooks cannot be called
                 * outside of React component context.
                 */
                /** 0. Immediately stop the simulation */
                sim.stopDataFlow();
                {
                    const dataStore = useSimulationDataStore.getState();
                    /** 1. Drain the logical conveyor */
                    dataStore.drainConveyor();
                    /** 2. End session in Supabase (fire-and-forget) */
                    if (dataStore.session) {
                        dataStore.endSession().catch(console.warn);
                    }
                    /** 3. Stop sync service (fire-and-forget) */
                    syncService.stop().catch(console.warn);
                    /** 4. Clear data store */
                    dataStore.resetDataStore();
                }
                /** 5. Reset KPI store */
                useKPIStore.getState().resetKPIs();
                /** 6. Close all panels and clear UI flags */
                useUIStore.setState({
                    showPassport: false, showHeatmap: false,
                    showControlPanel: false, showKPI: false,
                    showProductionTable: false, showAlarmLog: false,
                    showOEEHierarchy: false, showDemoSettings: false,
                    isSimConfigured: false, simulationEnded: false,
                });
                /** 7. Reset simulation clocks and counters */
                sim.resetSimulation();
                /** 8. Reset work order runtime flags */
                useWorkOrderStore.getState().resetWorkOrderState();
                break;

            // ── Configuration ─────────────────────────────────────────────────
            case 'set_language':
                /**
                 * Change the interface language.
                 * action_value must be 'en' or 'tr'.
                 */
                if (actionValue === 'en' || actionValue === 'tr') {
                    ui.setLanguage(actionValue);
                } else {
                    /** Reject if action_value is missing or invalid */
                    await supabase
                        .from('cwf_commands')
                        .update({
                            status: 'rejected',
                            rejected_reason: `set_language requires action_value 'en' or 'tr'; got '${actionValue ?? 'undefined'}'.`,
                        })
                        .eq('id', command.id);
                    useCWFStore.getState().addSystemMessage(
                        `⚠️ set_language failed: invalid value '${actionValue}'. Use 'en' or 'tr'.`,
                    );
                    return;
                }
                break;

            // ── Conveyor Status Control ──────────────────────────────────────────
            case 'set_conveyor_running': {
                /**
                 * Set the conveyor belt to RUNNING state.
                 *
                 * Guard: the simulation must be actively flowing (isDataFlowing=true).
                 * If the simulation is stopped, the belt cannot be set to running —
                 * the user must start the simulation first.
                 *
                 * Unlike stop_simulation, this only changes the belt's operational
                 * mode — the S-Clock continues ticking at its usual rate.
                 */
                if (!sim.isDataFlowing) {
                    await supabase
                        .from('cwf_commands')
                        .update({
                            status: 'rejected',
                            rejected_reason: 'Cannot set conveyor to Running while the simulation is stopped. Start the simulation first.',
                        })
                        .eq('id', command.id);
                    useCWFStore.getState().addSystemMessage(
                        '⚠️ Cannot set conveyor to Running while simulation is stopped. Start the simulation first.',
                    );
                    return;
                }
                /** Set belt status to running */
                sim.setConveyorStatus('running');
                break;
            }

            case 'set_conveyor_stopped': {
                /**
                 * Set the conveyor belt to STOPPED state.
                 *
                 * Freezes tiles in place on the belt. The simulation S-Clock keeps
                 * ticking. Always valid — can be applied whether the simulation is
                 * running or stopped.
                 */
                sim.setConveyorStatus('stopped');
                break;
            }

            case 'set_conveyor_jammed': {
                /**
                 * Set the conveyor belt to JAMMED state.
                 *
                 * Simulates a jam event: logs a fault alarm, tiles freeze at the
                 * jam location, and the jam auto-resume timer starts.
                 *
                 * Guard: the simulation must be actively flowing (isDataFlowing=true).
                 * Jamming a stopped simulation has no meaningful effect and would
                 * create a confusing state.
                 */
                if (!sim.isDataFlowing) {
                    await supabase
                        .from('cwf_commands')
                        .update({
                            status: 'rejected',
                            rejected_reason: 'Cannot simulate a jam while the simulation is stopped. Start the simulation first.',
                        })
                        .eq('id', command.id);
                    useCWFStore.getState().addSystemMessage(
                        '⚠️ Cannot simulate a jam while simulation is stopped. Start the simulation first.',
                    );
                    return;
                }
                /** Trigger jam state — setConveyorStatus handles fault counting and alarm logging */
                sim.setConveyorStatus('jammed');
                break;
            }

            // ── Simulation Parameter Sliders ─────────────────────────────────────
            case 'set_conveyor_speed': {
                /**
                 * Set the conveyor belt visual speed multiplier.
                 *
                 * action_value must be a valid float string (e.g. "1.5").
                 * Range: CONVEYOR_SPEED_RANGE.min (0.3) to CONVEYOR_SPEED_RANGE.max (2.0).
                 * setConveyorSpeed() clamps out-of-range values automatically.
                 */
                const parsedSpeed = parseFloat(actionValue ?? '');
                if (isNaN(parsedSpeed)) {
                    await supabase
                        .from('cwf_commands')
                        .update({
                            status: 'rejected',
                            rejected_reason: `set_conveyor_speed requires a numeric action_value (e.g. "1.5"); got '${actionValue ?? 'undefined'}'.`,
                        })
                        .eq('id', command.id);
                    useCWFStore.getState().addSystemMessage(
                        `⚠️ set_conveyor_speed failed: invalid value '${actionValue}'. Provide a number between 0.3 and 2.0.`,
                    );
                    return;
                }
                /** Clamp to valid range — setConveyorSpeed clamps internally, but log the clamped value */
                const clampedSpeed = Math.max(0.3, Math.min(2.0, parsedSpeed));
                sim.setConveyorSpeed(clampedSpeed);
                break;
            }

            case 'set_sclk_period': {
                /**
                 * Set the S-Clock period in milliseconds.
                 *
                 * action_value must be a valid integer string (e.g. "300").
                 * Range: S_CLOCK_RANGE.min (200 ms) to S_CLOCK_RANGE.max (700 ms), step 100 ms.
                 * Non-multiples of 100 are rounded to the nearest 100 ms before clamping.
                 * Lower value = faster simulation clock (ticks fire more often).
                 */
                const parsedPeriod = parseInt(actionValue ?? '', 10);
                if (isNaN(parsedPeriod)) {
                    await supabase
                        .from('cwf_commands')
                        .update({
                            status: 'rejected',
                            rejected_reason: `set_sclk_period requires an integer action_value in ms (e.g. "300"); got '${actionValue ?? 'undefined'}'.`,
                        })
                        .eq('id', command.id);
                    useCWFStore.getState().addSystemMessage(
                        `⚠️ set_sclk_period failed: invalid value '${actionValue}'. Provide an integer between 200 and 700 (ms).`,
                    );
                    return;
                }
                /** Round to nearest 100 ms, then clamp to [200, 700] */
                const roundedPeriod = Math.round(parsedPeriod / 100) * 100;
                const clampedPeriod = Math.max(200, Math.min(700, roundedPeriod));
                sim.setSClockPeriod(clampedPeriod);
                break;
            }

            case 'set_station_interval': {
                /**
                 * Set the station production interval (S-Clock ticks per tile).
                 *
                 * action_value must be a valid integer string (e.g. "3").
                 * Range: STATION_INTERVAL_RANGE.min (2) to STATION_INTERVAL_RANGE.max (7), step 1.
                 * Lower value = higher production throughput rate.
                 * setStationInterval() clamps out-of-range values automatically.
                 */
                const parsedInterval = parseInt(actionValue ?? '', 10);
                if (isNaN(parsedInterval)) {
                    await supabase
                        .from('cwf_commands')
                        .update({
                            status: 'rejected',
                            rejected_reason: `set_station_interval requires an integer action_value (e.g. "3"); got '${actionValue ?? 'undefined'}'.`,
                        })
                        .eq('id', command.id);
                    useCWFStore.getState().addSystemMessage(
                        `⚠️ set_station_interval failed: invalid value '${actionValue}'. Provide an integer between 2 and 7.`,
                    );
                    return;
                }
                /** Clamp to valid range — setStationInterval clamps internally */
                const clampedInterval = Math.max(2, Math.min(7, parsedInterval));
                sim.setStationInterval(clampedInterval);
                break;
            }

            default:
                /** Unknown action_type — reject with descriptive reason */
                await supabase
                    .from('cwf_commands')
                    .update({
                        status: 'rejected',
                        rejected_reason: `Unknown UI action type: '${actionType}'.`,
                    })
                    .eq('id', command.id);
                useCWFStore.getState().addSystemMessage(
                    `⚠️ Unknown CWF UI action: '${actionType}'.`,
                );
                return;
        }

        /** Action dispatched successfully — mark as 'applied' in Supabase */
        await supabase
            .from('cwf_commands')
            .update({ status: 'applied' })
            .eq('id', command.id);

        /** Post confirmation message to the CWF chat panel */
        useCWFStore.getState().addSystemMessage(
            `✅ CWF UI action '${actionType}' executed.`,
        );

        console.log(`[CWF UI Listener] ✅ Applied UI action: ${actionType}`);

    } catch (err) {
        /** Catch unexpected errors and mark the command as rejected */
        const errMsg = (err as Error).message || 'Unknown error';
        console.error(`[CWF UI Listener] ❌ Error executing '${actionType}':`, errMsg);
        await supabase
            .from('cwf_commands')
            .update({ status: 'rejected', rejected_reason: errMsg })
            .eq('id', command.id);
        useCWFStore.getState().addSystemMessage(
            `⚠️ CWF UI action '${actionType}' failed: ${errMsg}`,
        );
    }
}

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * CWF_POLL_INTERVAL_MS — Fallback polling interval in milliseconds.
 * Every N ms, the hook queries Supabase for any 'pending' commands
 * that Realtime may have missed. Set to 3 seconds so that the client
 * acknowledges commands well within the server's CWF_ACK_WAIT_MS (5s)
 * window, ensuring CWF gets honest ACK feedback.
 */
const CWF_POLL_INTERVAL_MS = 3_000;

// =============================================================================
// TYPES
// =============================================================================

/**
 * Shape of a row in the cwf_commands table.
 * Matches the Supabase migration schema.
 */
interface CWFCommand {
    /** Unique command identifier */
    id: string;
    /** Target simulation session */
    session_id: string;
    /** Target station: press | dryer | glaze | printer | kiln | sorting | packaging | conveyor */
    station: string;
    /** Parameter column name (e.g. 'pressure_bar') */
    parameter: string;
    /** Value before change (read from DB by CWF) */
    old_value: number;
    /** Proposed new value */
    new_value: number;
    /** AI-generated reason for the change */
    reason: string | null;
    /** Authorization ID provided by the user */
    authorized_by: string;
    /** Command lifecycle status */
    status: string;
    /** Why the command was rejected (if applicable) */
    rejected_reason: string | null;
    /** When the command was created */
    created_at: string;
}

// =============================================================================
// HOOK
// =============================================================================

/**
 * Subscribe to CWF parameter commands via Supabase Realtime + fallback polling.
 *
 * This hook activates when a simulation session is active and Supabase
 * is configured. It listens for INSERT events on the `cwf_commands` table
 * via Realtime, AND polls for pending commands every CWF_POLL_INTERVAL_MS
 * as a reliability fallback.
 *
 * The hook is idempotent — it cleans up subscriptions and polling on unmount
 * or when the session ID changes.
 */
export function useCWFCommandListener(): void {
    /** Ref to track the current Realtime channel for cleanup */
    const channelRef = useRef<ReturnType<NonNullable<typeof supabase>['channel']> | null>(null);
    /** Ref to track the polling interval for cleanup */
    const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    /** Ref to track processed command IDs to prevent duplicate processing */
    const processedIdsRef = useRef<Set<string>>(new Set());

    /**
     * Process a single CWF command: validate, apply to store, update status.
     * Shared by both Realtime handler and fallback polling.
     *
     * @param command - The CWF command row from Supabase
     */
    const processCommand = useCallback((command: CWFCommand): void => {
        /** Skip already-processed commands (deduplication across Realtime + polling) */
        if (processedIdsRef.current.has(command.id)) return;

        /** Skip non-pending commands (defensive check) */
        if (command.status !== 'pending') return;

        /** Mark as processed immediately to prevent duplicate execution */
        processedIdsRef.current.add(command.id);

        // ── Route to the correct processor based on station type ──────────
        /**
         * COPILOT MESSAGES — Handle autonomous copilot action notifications.
         * The CopilotEngine inserts commands with station='copilot_message'
         * to inject status updates into the CWF chat panel.
         *
         * The command's `reason` field contains the human-readable message
         * that should be displayed with a 🤖 COPILOT badge.
         */
        if (command.station === 'copilot_message') {
            /** Inject copilot message into CWF chat as a system message with 🤖 badge */
            const chatMsg = command.reason || '🤖 Copilot took an action.';
            useCWFStore.getState().addSystemMessage(`🤖 ${chatMsg}`);

            /** Mark command as applied (fire-and-forget) */
            supabase!
                .from('cwf_commands')
                .update({ status: 'applied' })
                .eq('id', command.id)
                .then(({ error }) => {
                    if (error) console.error('[CWF Listener] Failed to mark copilot message as applied:', error.message);
                });

            console.log(`[CWF Listener] 🤖 Copilot message injected: ${chatMsg.substring(0, 80)}`);
            return;
        }

        /**
         * Route to UI action dispatcher if station matches the sentinel value.
         * CWF_UI_ACTION_STATION_SENTINEL is 'ui_action' (from uiTelemetry.ts).
         * Never compare against the raw string to avoid silent staleness bugs.
         */
        if (command.station === CWF_UI_ACTION_STATION_SENTINEL) {
            /** Route to the UI action dispatcher — does NOT use parameter validation */
            processUIActionCommand(command);
            return;
        }

        /** Validate the parameter value against CWF_PARAM_RANGES */
        const validation = validateCWFParamValue(
            command.station,
            command.parameter,
            command.new_value,
        );

        if (!validation.valid) {
            /** Reject: value is out of range or parameter/station is unknown */
            console.warn(
                `[CWF Listener] ❌ Rejected command ${command.id}: ${validation.reason}`,
            );
            /** Update command status to 'rejected' in Supabase */
            supabase!
                .from('cwf_commands')
                .update({
                    status: 'rejected',
                    rejected_reason: validation.reason,
                })
                .eq('id', command.id)
                .then(({ error }) => {
                    /** Log any errors from the status update (non-blocking) */
                    if (error) console.error('[CWF Listener] Failed to update rejected status:', error.message);
                    /** Post a warning message to the CWF chat panel */
                    useCWFStore.getState().addSystemMessage(
                        `⚠️ Parameter change rejected: ${validation.reason}`,
                    );
                });
            return;
        }

        /**
         * Apply the parameter change to the correct store action.
         *
         * Conveyor params are stored separately from machine station params:
         *   - Boolean params (speed_change, jammed_events): updateConveyorBoolParam()
         *   - Numeric params (jammed_time, impacted_tiles, scrap_probability_pct):
         *     updateConveyorParam()
         * All other stations use the standard updateParameter() path.
         */
        if (command.station === 'conveyor') {
            if (CONVEYOR_BOOL_PARAMS.has(command.parameter)) {
                /** Convert 0/1 number back to boolean (0 = false, any other = true) */
                useSimulationDataStore.getState().updateConveyorBoolParam(
                    command.parameter as 'speed_change' | 'jammed_events',
                    command.new_value !== 0,
                );
            } else if (command.parameter === 'conveyor_speed_x') {
                /**
                 * Conveyor speed multiplier — corrected by the copilot engine when
                 * low belt speed causes OEE to drop. Routed to setConveyorSpeed()
                 * in simulationStore (same action used by the UI slider and by
                 * execute_ui_action 'set_conveyor_speed'). Cannot use updateConveyorParam
                 * because speed_x is stored in simulationStore, NOT in conveyor_states.
                 */
                useSimulationStore.getState().setConveyorSpeed(command.new_value);
            } else {
                /**
                 * Apply numeric conveyor param (jammed_time, impacted_tiles, scrap_probability).
                 * Cast to the ConveyorNumericParams key union — validated upstream by
                 * CWF_PARAM_RANGES, so only valid keys reach this branch.
                 */
                useSimulationDataStore.getState().updateConveyorParam(
                    command.parameter as 'jammed_time' | 'impacted_tiles' | 'scrap_probability',
                    command.new_value,
                );
            }
        } else {
            /** Standard 7-station path: apply to simulationDataStore currentParams */
            useSimulationDataStore.getState().updateParameter(
                command.station as StationName,
                command.parameter,
                command.new_value,
                'step',         // changeType: discrete step change from CWF
                'cwf_agent',    // changeReason: originated from AI agent
            );
        }

        /** Update command status to 'applied' in Supabase */
        supabase!
            .from('cwf_commands')
            .update({ status: 'applied' })
            .eq('id', command.id)
            .then(({ error }) => {
                /** Log any errors from the status update (non-blocking) */
                if (error) console.error('[CWF Listener] Failed to update applied status:', error.message);
                /** Post a confirmation message to the CWF chat panel */
                const changeDirection = command.new_value > command.old_value ? '↑' : '↓';
                const changePct = command.old_value !== 0
                    ? (((command.new_value - command.old_value) / command.old_value) * 100).toFixed(1)
                    : '∞';
                useCWFStore.getState().addSystemMessage(
                    `✅ ${command.station}.${command.parameter}: ${command.old_value} → ${command.new_value} (${changeDirection}${changePct}%)`,
                );
            });

        console.log(
            `[CWF Listener] ✅ Applied: ${command.station}.${command.parameter} = ${command.new_value}`,
        );
    }, []);

    /**
     * Poll Supabase for any 'pending' commands that Realtime may have missed.
     * Called on an interval as a reliability fallback.
     *
     * @param sessionId - The current simulation session UUID
     */
    const pollPendingCommands = useCallback(async (sessionId: string): Promise<void> => {
        if (!supabase) return;

        /** Query for any pending commands for this session */
        const { data, error } = await supabase
            .from('cwf_commands')
            .select('*')
            .eq('session_id', sessionId)
            .eq('status', 'pending')
            .order('created_at', { ascending: true });

        if (error) {
            console.error('[CWF Poll] Failed to query pending commands:', error.message);
            return;
        }

        /** Process each pending command (processCommand handles deduplication) */
        if (data && data.length > 0) {
            console.log(`[CWF Poll] Found ${data.length} pending command(s), processing...`);
            for (const command of data as CWFCommand[]) {
                processCommand(command);
            }
        }
    }, [processCommand]);

    /**
     * Set up Realtime subscription and polling for a given session.
     * Extracted as a function to be called by both initial mount and session changes.
     *
     * @param sessionId - The simulation session UUID to subscribe to
     */
    const setupListeners = useCallback((sessionId: string): void => {
        if (!supabase) return;

        /** Clean up any existing channel before creating a new one */
        if (channelRef.current) {
            supabase.removeChannel(channelRef.current);
            channelRef.current = null;
        }

        /** Clean up any existing polling interval */
        if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
        }

        /** Clear processed IDs tracking for the new session */
        processedIdsRef.current.clear();

        // ── Realtime Subscription ───────────────────────────────────────
        /** Create a Realtime channel for cwf_commands INSERT events */
        const channel = supabase
            .channel(`cwf-commands-${sessionId}`)
            .on<CWFCommand>(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'cwf_commands',
                    filter: `session_id=eq.${sessionId}`,
                },
                (payload) => {
                    /** Process the newly inserted command */
                    console.log('[CWF Listener] Realtime INSERT received:', payload.new.id);
                    processCommand(payload.new);
                },
            )
            .subscribe((status) => {
                /** Log subscription state for debugging */
                console.log(`[CWF Listener] Realtime subscription status: ${status}`);

                /**
                 * Run an immediate poll once the subscription is established.
                 * This catches any commands inserted between session start
                 * and the Realtime subscription becoming active.
                 */
                if (status === 'SUBSCRIBED') {
                    pollPendingCommands(sessionId);
                }
            });

        /** Store channel reference for cleanup */
        channelRef.current = channel;

        // ── Fallback Polling ────────────────────────────────────────────
        /**
         * Start periodic polling as a reliability fallback.
         * Even if Realtime is working, polling is harmless — processCommand
         * deduplicates via processedIdsRef, so no command is applied twice.
         */
        pollIntervalRef.current = setInterval(() => {
            pollPendingCommands(sessionId);
        }, CWF_POLL_INTERVAL_MS);

        console.log(`[CWF Listener] Listeners active for session ${sessionId}`);
    }, [processCommand, pollPendingCommands]);

    /**
     * Tear down all listeners (Realtime + polling).
     * Called on unmount or session change.
     */
    const teardownListeners = useCallback((): void => {
        if (channelRef.current && supabase) {
            supabase.removeChannel(channelRef.current);
            channelRef.current = null;
            console.log('[CWF Listener] Realtime subscription removed');
        }
        if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
            console.log('[CWF Listener] Polling stopped');
        }
    }, []);

    // ── Effect 1: Setup on initial mount ──────────────────────────────────
    useEffect(() => {
        /** Guard: Supabase must be configured */
        if (!supabase) return;

        /** Read the current session ID from the simulation data store */
        const sessionId = useSimulationDataStore.getState().session?.id;

        /** If a session already exists at mount time, set up listeners immediately */
        if (sessionId) {
            setupListeners(sessionId);
        }

        /** Cleanup on unmount */
        return teardownListeners;
    }, [setupListeners, teardownListeners]);

    // ── Effect 2: React to session changes ────────────────────────────────
    useEffect(() => {
        /** Guard: Supabase must be configured */
        if (!supabase) return;

        /** Subscribe to Zustand store changes to detect session ID transitions */
        const unsubscribe = useSimulationDataStore.subscribe((state, prevState) => {
            /** Detect session ID changes */
            const currentId = state.session?.id;
            const previousId = prevState.session?.id;

            if (currentId !== previousId) {
                /** Tear down old listeners */
                teardownListeners();

                /** Set up new listeners if there's a new session */
                if (currentId) {
                    setupListeners(currentId);
                }
            }
        });

        return unsubscribe;
    }, [setupListeners, teardownListeners]);
}
