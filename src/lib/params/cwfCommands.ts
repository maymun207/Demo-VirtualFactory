/**
 * cwfCommands.ts — CWF Parameter Command Configuration
 *
 * Centralised configuration for the CWF (Chat With your Factory) parameter
 * control system. Contains the human-in-the-loop authorisation code,
 * valid station names, per-parameter safe ranges, and the auth timeout
 * duration. All CWF command-related constants live here.
 *
 * These values are used by:
 *   - api/cwf/chat.ts      (server-side Gemini agent — mirrored copy)
 *   - useCWFCommandListener (frontend Realtime listener — imported directly)
 *   - cwfCommands.test.ts   (unit tests)
 */

// =============================================================================
// AUTHORISATION
// =============================================================================

/**
 * Human-in-the-loop authorisation code.
 * CWF must prompt the user for this code before executing any parameter change.
 * If the user provides an incorrect code, the action is immediately terminated.
 */
export const CWF_AUTH_CODE = 'airtk';

/**
 * Timeout in milliseconds for the user to provide the authorisation code.
 * If the user doesn't respond within this window after CWF requests the code,
 * the action is automatically terminated.
 */
export const CWF_AUTH_TIMEOUT_MS = 20_000;

// =============================================================================
// ACK VERIFICATION — Server-Side Wait for Client Acknowledgment
// =============================================================================

/**
 * Maximum time (ms) CWF waits for the client to acknowledge a parameter change.
 * After INSERT into cwf_commands, the server polls status every CWF_ACK_POLL_MS.
 * If status is still 'pending' after this duration, CWF reports failure.
 *
 * 5 seconds × 7 parameters = 35 seconds worst case, fits Vercel 60s timeout.
 */
export const CWF_ACK_WAIT_MS = 5_000;

/**
 * How often (ms) CWF checks the cwf_commands.status field for acknowledgment.
 * Lower values = faster confirmation but more DB queries.
 * 500ms means CWF makes at most 10 queries per parameter (5000 / 500).
 */
export const CWF_ACK_POLL_MS = 500;

// =============================================================================
// VALID STATIONS
// =============================================================================

/**
 * List of station names that CWF is allowed to modify.
 * Must match the station keys in DEFAULT_MACHINE_PARAMS from machineParams.ts.
 */
export const CWF_VALID_STATIONS = [
    'press',
    'dryer',
    'glaze',
    'printer',
    'kiln',
    'sorting',
    'packaging',
] as const;

/** Type alias for a valid CWF station name. */
export type CWFStation = (typeof CWF_VALID_STATIONS)[number];

// =============================================================================
// PARAMETER RANGES
// =============================================================================

/**
 * Per-parameter minimum and maximum values for each station.
 * These ranges are the HARD LIMITS — CWF cannot set values outside them.
 * Derived from the optimal/operational ranges documented in machineParams.ts.
 *
 * The ranges here are intentionally wider than "optimal" to allow CWF to
 * demonstrate out-of-spec scenarios, but still prevent completely unrealistic
 * values (e.g. 5000 °C kiln temperature).
 */
export const CWF_PARAM_RANGES: Record<string, Record<string, { min: number; max: number }>> = {
    /** Hydraulic press — forms raw powder into green tiles. */
    press: {
        pressure_bar: { min: 280, max: 450 },
        cycle_time_sec: { min: 4, max: 8 },
        mold_temperature_c: { min: 30, max: 80 },
        powder_moisture_pct: { min: 3, max: 9 },
        fill_amount_g: { min: 800, max: 2500 },
        mold_wear_pct: { min: 0, max: 100 },
    },

    /** Horizontal dryer — removes residual moisture from green tiles. */
    dryer: {
        inlet_temperature_c: { min: 100, max: 300 },
        outlet_temperature_c: { min: 60, max: 150 },
        belt_speed_m_min: { min: 1, max: 5 },
        drying_time_min: { min: 20, max: 90 },
        exit_moisture_pct: { min: 0.1, max: 3 },
        fan_frequency_hz: { min: 20, max: 60 },
    },

    /** Glaze application — sprays ceramic glaze onto dried tiles. */
    glaze: {
        glaze_density_g_cm3: { min: 1.2, max: 1.7 },
        glaze_viscosity_sec: { min: 15, max: 40 },
        application_weight_g_m2: { min: 200, max: 800 },
        cabin_pressure_bar: { min: 0.2, max: 1.5 },
        nozzle_angle_deg: { min: 10, max: 50 },
        belt_speed_m_min: { min: 10, max: 40 },
        glaze_temperature_c: { min: 15, max: 40 },
    },

    /** Digital printer — applies decoration pattern via inkjet. */
    printer: {
        head_temperature_c: { min: 30, max: 55 },
        ink_viscosity_mpa_s: { min: 6, max: 20 },
        drop_size_pl: { min: 6, max: 80 },
        resolution_dpi: { min: 360, max: 720 },
        belt_speed_m_min: { min: 15, max: 50 },
        head_gap_mm: { min: 1.0, max: 5.0 },
        color_channels: { min: 4, max: 8 },
        active_nozzle_pct: { min: 80, max: 100 },
    },

    /** Roller kiln — fires glazed tiles at high temperature. */
    kiln: {
        max_temperature_c: { min: 1000, max: 1300 },
        firing_time_min: { min: 30, max: 70 },
        preheat_gradient_c_min: { min: 10, max: 50 },
        cooling_gradient_c_min: { min: 15, max: 60 },
        belt_speed_m_min: { min: 0.5, max: 4 },
        atmosphere_pressure_mbar: { min: -10, max: 10 },
        zone_count: { min: 5, max: 15 },
        o2_level_pct: { min: 1, max: 10 },
    },

    /** Quality sorting — machine vision inspection and grading. */
    sorting: {
        camera_resolution_mp: { min: 5, max: 20 },
        scan_rate_tiles_min: { min: 15, max: 70 },
        size_tolerance_mm: { min: 0.1, max: 1.5 },
        color_tolerance_de: { min: 0.3, max: 3.0 },
        flatness_tolerance_mm: { min: 0.1, max: 1.0 },
        defect_threshold_mm2: { min: 0.5, max: 5.0 },
        grade_count: { min: 2, max: 5 },
    },

    /** Packaging — palletizing and wrapping finished tiles. */
    packaging: {
        stack_count: { min: 4, max: 12 },
        box_sealing_pressure_bar: { min: 2, max: 6 },
        pallet_capacity_m2: { min: 30, max: 100 },
        stretch_tension_pct: { min: 150, max: 300 },
        robot_speed_cycles_min: { min: 5, max: 15 },
        label_accuracy_pct: { min: 95, max: 100 },
    },
};

// =============================================================================
// VALIDATION HELPERS
// =============================================================================

/**
 * Check if a station name is valid for CWF commands.
 *
 * @param station - The station name to validate
 * @returns true if the station is in the CWF_VALID_STATIONS list
 */
export function isValidCWFStation(station: string): station is CWFStation {
    return (CWF_VALID_STATIONS as readonly string[]).includes(station);
}

/**
 * Check if a parameter value is within the allowed range for a given station.
 *
 * @param station   - Station name (must be valid)
 * @param parameter - Parameter column name
 * @param value     - Proposed value to validate
 * @returns Object with `valid` boolean and optional `reason` string
 */
export function validateCWFParamValue(
    station: string,
    parameter: string,
    value: number,
): { valid: boolean; reason?: string } {
    /** Check station exists in ranges map. */
    const stationRanges = CWF_PARAM_RANGES[station];
    if (!stationRanges) {
        return { valid: false, reason: `Unknown station: ${station}` };
    }

    /** Check parameter exists in the station's range map. */
    const range = stationRanges[parameter];
    if (!range) {
        return { valid: false, reason: `Unknown parameter '${parameter}' for station '${station}'` };
    }

    /** Check value is a finite number. */
    if (!Number.isFinite(value)) {
        return { valid: false, reason: `Value must be a finite number, got: ${value}` };
    }

    /** Check value is within allowed range. */
    if (value < range.min || value > range.max) {
        return {
            valid: false,
            reason: `Value ${value} is out of range [${range.min}, ${range.max}] for ${station}.${parameter}`,
        };
    }

    return { valid: true };
}

// =============================================================================
// SIMULATION EVENT TYPES
// =============================================================================

/**
 * All valid event_type values for the simulation_events Supabase table.
 * Each entry corresponds to a distinct simulation state transition.
 *
 * Used by:
 *   - simulationEventLogger.ts  (type-safe logging to Supabase)
 *   - simulationStore.ts        (fires events from state actions)
 *   - simulationEvents.test.ts  (coverage validation)
 *   - api/cwf/chat.ts           (mirrored in DB_SCHEMA_CONTEXT for CWF queries)
 */
export const SIMULATION_EVENT_TYPES = [
    'started',              /** User clicked Start — data flow enabled */
    'stopped',              /** Simulation stopped — belt was empty or direct stop */
    'drain_started',        /** User clicked Stop while tiles were on belt */
    'drain_completed',      /** All in-flight tiles exited the belt naturally */
    'force_stopped',        /** User double-clicked Stop during drain (abort) */
    'resumed',              /** Reserved for future pause/resume feature */
    'reset',                /** Full factory reset triggered */
    'work_order_completed', /** Target tile count reached, production ended */
] as const;

/** Union type of all valid simulation event type strings. */
export type SimulationEventType = (typeof SIMULATION_EVENT_TYPES)[number];
