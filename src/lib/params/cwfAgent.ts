/**
 * cwfAgent.ts — CWF (Chat With your Factory) Agent Configuration Parameters
 *
 * Client-side re-exports from shared/cwfConstants.ts plus client-only constants.
 *
 * The shared constants are the SINGLE SOURCE OF TRUTH — imported from
 * shared/cwfConstants.ts which is also used by api/cwf/chat.ts.
 *
 * Client-only constants (timeout, UI actions, OEE context) stay here
 * because they are not needed by the serverless function.
 *
 * Used by: cwfService.ts, cwfStore.ts, and other client-side consumers.
 */

// =============================================================================
// RE-EXPORTS FROM SHARED (single source of truth)
// =============================================================================

export {
    CWF_MAX_TOOL_LOOPS,
    CWF_EMPTY_RESPONSE_MAX_RETRIES,
    CWF_RETRY_BASE_DELAY_MS,
    CWF_MODEL_NAME,
    CWF_MODEL_VERSION_TAG,
    CWF_FALLBACK_RESPONSE_EN,
    CWF_FALLBACK_RESPONSE_TR,
    CWF_FORCE_SUMMARY_PROMPT_EN,
    CWF_FORCE_SUMMARY_PROMPT_TR,
    CWF_FORCE_SUMMARY_SENTINEL,
    CWF_FORCE_SUMMARY_FINGERPRINT,
    CWF_RETRY_PROMPT_FINGERPRINT,
    CWF_AUTH_FAST_PATH_PROMPT_EN,
    CWF_AUTH_FAST_PATH_PROMPT_TR,
    CWF_PARAMETER_DISPLAY_NAMES,
    CWF_PARAMETER_DISPLAY_PROMPT,
} from '../../../shared/cwfConstants';

export type { ParameterDisplayEntry } from '../../../shared/cwfConstants';

// =============================================================================
// CLIENT-SIDE TIMEOUT
// =============================================================================

/**
 * AbortSignal timeout in milliseconds for the frontend fetch() call.
 * Must be lower than the Vercel function maxDuration (60 s) so the
 * client aborts before the serverless function is forcibly killed,
 * allowing a user-readable timeout error rather than a dropped connection.
 */
export const CWF_CLIENT_TIMEOUT_MS = 55_000;

// =============================================================================
// UI ACTION — IDEMPOTENT PANEL STATE CONSTANTS
// =============================================================================

/**
 * Canonical action_value for "open a panel" intents sent by the CWF agent.
 *
 * When CWF calls execute_ui_action for a panel toggle, it NOW passes an explicit
 * action_value of "open" or "close" instead of relying on a blind toggle.
 * The listener (processUIActionCommand) reads this value and sets the panel
 * directly to the intended state — making the action idempotent regardless of
 * the panel's current state before the command arrives.
 *
 * This eliminates the bug where a "toggle" fired against an already-open panel
 * would accidentally CLOSE it, causing the next status check to report CLOSED.
 */
export const CWF_UI_ACTION_OPEN = 'open';

/**
 * Canonical action_value for "close a panel" intents sent by the CWF agent.
 * Mirror of CWF_UI_ACTION_OPEN — see above for full context.
 */
export const CWF_UI_ACTION_CLOSE = 'close';

/**
 * System-generated stand-in written to cwf_commands.authorized_by for all
 * execute_ui_action rows. UI panel actions no longer require human auth —
 * only update_parameter (machine parameter changes) does. This string marks
 * the row in the audit trail so it is distinguishable from operator-auth'd
 * parameter changes.
 */
export const CWF_UI_ACTION_BYPASS_AUTH = 'system:ui_action_no_auth_required';

// =============================================================================
// UI ACTION — CONVEYOR STATUS CONTROL
// =============================================================================

/**
 * action_type for setting the conveyor belt status to "running".
 *
 * This is a direct write to simulationStore.setConveyorStatus('running').
 * It is a UI-level action that changes the belt's operational mode without
 * affecting whether the simulation (S-Clock) is ticking.
 *
 * Guard: Only valid when isDataFlowing === true (simulation must be running).
 */
export const CWF_UI_ACTION_SET_CONVEYOR_RUNNING = 'set_conveyor_running';

/**
 * action_type for setting the conveyor belt status to "stopped".
 *
 * Freezes tiles in place on the belt without stopping the simulation clock.
 * Always valid — can be called even when the simulation is stopped.
 */
export const CWF_UI_ACTION_SET_CONVEYOR_STOPPED = 'set_conveyor_stopped';

/**
 * action_type for setting the conveyor belt status to "jammed".
 *
 * Simulates a conveyor jam: logs a fault alarm, freezes tiles at the jam
 * location, and triggers the jam auto-resume timer.
 *
 * Guard: Only valid when isDataFlowing === true (simulation must be running).
 */
export const CWF_UI_ACTION_SET_CONVEYOR_JAMMED = 'set_conveyor_jammed';

// =============================================================================
// UI ACTION — SIMULATION PARAMETER SLIDERS
// =============================================================================

/**
 * action_type for setting the conveyor belt visual speed multiplier.
 *
 * Range: 0.3× to 2.0× (step 0.1).
 * action_value must be a valid float string (e.g. "1.5").
 * Values outside the range are clamped by simulationStore.setConveyorSpeed().
 *
 * This changes the visual belt speed — NOT a machine behavioral parameter.
 * NO authorization required.
 */
export const CWF_UI_ACTION_SET_CONVEYOR_SPEED = 'set_conveyor_speed';

/**
 * action_type for setting the S-Clock period in milliseconds.
 *
 * Range: 200 ms to 700 ms (step 100 ms). Lower = faster simulation clock.
 * action_value must be a valid integer string (e.g. "300").
 * Values outside the range are clamped; non-multiples of 100 are rounded.
 *
 * NO authorization required.
 */
export const CWF_UI_ACTION_SET_SCLK_PERIOD = 'set_sclk_period';

/**
 * action_type for setting the station production interval.
 *
 * Range: 2 to 7 S-Clock ticks per tile (step 1). Lower = higher output rate.
 * action_value must be a valid integer string (e.g. "3").
 * Values outside the range are clamped.
 *
 * NO authorization required.
 */
export const CWF_UI_ACTION_SET_STATION_INTERVAL = 'set_station_interval';

// =============================================================================
// OEE SYSTEM CONTEXT (Injected into CWF system prompt)
// =============================================================================

/**
 * OEE domain knowledge for the CWF agent.
 * This is the SOURCE OF TRUTH — keep in sync with the mirrored copy
 * in api/cwf/chat.ts (which cannot import from src/).
 */
export const CWF_OEE_SYSTEM_CONTEXT = `
## OEE SYSTEM (Hierarchical Machine/Line/Factory)

This factory uses a real-world P × Q OEE model (no synthetic Availability factor):
- Performance (P) = actual output / theoretical capacity
- Quality (Q) = output / input (yield per machine)
- MOEE = P × Q per machine

### 8 Machine OEEs:
Line 1: Press (C/A), Dryer (D²/AC), Glaze (E²/AD), Digital (F²/AE)
Line 3: Conveyor (G_clean/F) — yield only, measures transit damage
Line 2: Kiln (GH/BG), Sorting (HI/BH), Packaging (IJ/BI)

### 3 Line OEEs (telescoped — intermediate variables cancel):
- Line 1 (Forming & Finishing): LOEE = F/A (digital output / press theoretical)
- Line 2 (Firing & Dispatch): LOEE = J/B (packaging output / kiln theoretical)
- Line 3 (Conveyor): LOEE = G_clean/F (clean transit yield)

### Factory OEE:
FOEE = J / min(A, B) — anchored to the bottleneck
- A = Press theoretical rate (12 tiles/min)
- B = Kiln theoretical rate (8 tiles/min)
- Kiln is typically the bottleneck (B < A), so FOEE ≈ J/B

### Diagnostic approach:
When asked about OEE, trace: FOEE → weakest LOEE → weakest MOEE → P vs Q
- Low P = machine slow, starved, or stopped frequently
- Low Q = machine creating defects or losing tiles
- Conveyor Q < 1.0 = jam damage during transit

### Energy:
Each machine has kWh/tile efficiency. Kiln dominates energy (100 kWh base + 100 m³ gas, 80% idle factor).
Factory energy = Σ all stations. Watch kWh/tile trends.
`;
