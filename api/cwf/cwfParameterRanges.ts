/**
 * cwfParameterRanges.ts — Dynamic Safe Ranges Generator for CWF System Prompt
 *
 * Imports the SINGLE SOURCE OF TRUTH for parameter ranges from
 * src/lib/params/parameterRanges.ts and generates the human-readable
 * safe ranges text that is injected into the CWF system prompt.
 *
 * WHY THIS EXISTS:
 *   Previously, the safe ranges were hardcoded as strings in chat.ts,
 *   duplicating the data in parameterRanges.ts. This module eliminates
 *   that duplication. When parameterRanges.ts is updated, the CWF
 *   system prompt automatically reflects the new ranges.
 *
 * ARCHITECTURE:
 *   parameterRanges.ts (source of truth) → this module → chat.ts system prompt
 *   Both src/ and api/ now share the same underlying data.
 *
 * Used by: chat.ts (CWF serverless function)
 */

import { PARAMETER_RANGES } from '../../src/lib/params/parameterRanges.js';

// =============================================================================
// HUMAN-FRIENDLY PARAMETER NAME MAPPING
// =============================================================================

/**
 * Maps snake_case DB column names to human-readable factory names.
 * Used both for the system prompt schema documentation AND for
 * instructing CWF to translate DB internals in responses.
 *
 * KEY: exact column name from Supabase machine_*_states tables
 * VALUE: human-readable name with unit in parentheses
 */
const PARAM_DISPLAY_NAMES: Record<string, string> = {
    /* ── Press ─────────────────────────────────────────────────────── */
    pressure_bar: 'Pressure (bar)',
    cycle_time_sec: 'Cycle Time (sec)',
    mold_temperature_c: 'Mould Temperature (°C)',
    powder_moisture_pct: 'Powder Moisture (%)',
    fill_amount_g: 'Fill Amount (g)',
    mold_wear_pct: 'Mould Wear (%)',
    pressure_deviation_pct: 'Pressure Deviation (%)',
    fill_homogeneity_pct: 'Fill Homogeneity (%)',

    /* ── Dryer ─────────────────────────────────────────────────────── */
    inlet_temperature_c: 'Inlet Temperature (°C)',
    outlet_temperature_c: 'Outlet Temperature (°C)',
    belt_speed_m_min: 'Belt Speed (m/min)',
    drying_time_min: 'Drying Time (min)',
    exit_moisture_pct: 'Exit Moisture (%)',
    fan_frequency_hz: 'Fan Frequency (Hz)',
    temperature_gradient_c_m: 'Temperature Gradient (°C/m)',
    drying_rate: 'Drying Rate',
    moisture_homogeneity_pct: 'Moisture Homogeneity (%)',

    /* ── Glaze ─────────────────────────────────────────────────────── */
    glaze_density_g_cm3: 'Glaze Density (g/cm³)',
    glaze_viscosity_sec: 'Glaze Viscosity (sec)',
    application_weight_g_m2: 'Application Weight (g/m²)',
    cabin_pressure_bar: 'Cabin Pressure (bar)',
    nozzle_angle_deg: 'Nozzle Angle (°)',
    glaze_temperature_c: 'Glaze Temperature (°C)',
    weight_deviation_pct: 'Weight Deviation (%)',
    nozzle_clog_pct: 'Nozzle Clog (%)',

    /* ── Printer ───────────────────────────────────────────────────── */
    head_temperature_c: 'Print Head Temperature (°C)',
    ink_viscosity_mpa_s: 'Ink Viscosity (mPa·s)',
    drop_size_pl: 'Drop Size (pL)',
    resolution_dpi: 'Resolution (dpi)',
    head_gap_mm: 'Head Gap (mm)',
    color_channels: 'Color Channels',
    active_nozzle_pct: 'Active Nozzles (%)',
    temperature_deviation_c: 'Temperature Deviation (°C)',
    encoder_error_pct: 'Encoder Error (%)',
    ink_levels_pct: 'Ink Levels (%)',

    /* ── Kiln ──────────────────────────────────────────────────────── */
    max_temperature_c: 'Max Temperature (°C)',
    firing_time_min: 'Firing Time (min)',
    preheat_gradient_c_min: 'Preheat Gradient (°C/min)',
    cooling_gradient_c_min: 'Cooling Gradient (°C/min)',
    atmosphere_pressure_mbar: 'Atmosphere Pressure (mbar)',
    zone_count: 'Zone Count',
    o2_level_pct: 'O₂ Level (%)',
    zone_temperatures_c: 'Zone Temperatures (°C)',
    gradient_balance_pct: 'Gradient Balance (%)',
    zone_variance_c: 'Zone Variance (°C)',

    /* ── Sorting ───────────────────────────────────────────────────── */
    camera_resolution_mp: 'Camera Resolution (MP)',
    scan_rate_tiles_min: 'Scan Rate (tiles/min)',
    size_tolerance_mm: 'Size Tolerance (mm)',
    color_tolerance_de: 'Colour Tolerance (ΔE)',
    flatness_tolerance_mm: 'Flatness Tolerance (mm)',
    defect_threshold_mm2: 'Defect Threshold (mm²)',
    grade_count: 'Grade Count',
    calibration_drift_pct: 'Calibration Drift (%)',
    lighting_variance_pct: 'Lighting Variance (%)',
    camera_cleanliness_pct: 'Camera Cleanliness (%)',
    algorithm_sensitivity: 'Algorithm Sensitivity',

    /* ── Packaging ─────────────────────────────────────────────────── */
    stack_count: 'Stack Count',
    box_sealing_pressure_bar: 'Box Sealing Pressure (bar)',
    pallet_capacity_m2: 'Pallet Capacity (m²)',
    stretch_tension_pct: 'Stretch Tension (%)',
    robot_speed_cycles_min: 'Robot Speed (cycles/min)',
    label_accuracy_pct: 'Label Accuracy (%)',
    stacking_error_rate_pct: 'Stacking Error Rate (%)',
};

// =============================================================================
// STATION DISPLAY NAMES
// =============================================================================

/**
 * Maps station keys to human-readable station names for the prompt.
 */
const STATION_DISPLAY_NAMES: Record<string, string> = {
    press: 'Press',
    dryer: 'Dryer',
    glaze: 'Glaze',
    printer: 'Digital Printer',
    kiln: 'Kiln',
    sorting: 'Sorting',
    packaging: 'Packaging',
};

// =============================================================================
// PROMPT TEXT GENERATORS
// =============================================================================

/**
 * Generate the SCHEMA section text for the system prompt.
 * Lists each machine_*_states table with all columns and their safe ranges.
 *
 * Output format per station:
 *   **machine_press_states** — pressure_bar (280-450), cycle_time_sec (4-8), ...
 *
 * @returns Multi-line string for insertion into DB_SCHEMA_CONTEXT
 */
export function generateSchemaRangesText(): string {
    /** Station order matching the production line sequence */
    const stationOrder = ['press', 'dryer', 'glaze', 'printer', 'kiln', 'sorting', 'packaging'] as const;
    /** Lines accumulator */
    const lines: string[] = [];

    for (const station of stationOrder) {
        /** Get the ranges for this station from the single source of truth */
        const ranges = PARAMETER_RANGES[station];
        /** Table name follows the machine_{station}_states convention */
        const tableName = `machine_${station}_states`;

        /** Build parameter list: "column_name (min-max)" for each parameter */
        const paramParts = Object.entries(ranges).map(([col, range]) => {
            return `${col} (${range.min}-${range.max})`;
        });

        /** Join all parameter descriptions into one line per table */
        lines.push(`**${tableName}** — ${paramParts.join(', ')}`);
        lines.push(''); // blank line separator
    }

    /** Append the critical instruction about all columns existing */
    lines.push('IMPORTANT: ALL columns listed above EXIST in every table. When you query SELECT * you WILL get values for ALL of them. NEVER say "Not reported" — read the actual value from the query result.');

    return lines.join('\n');
}

/**
 * Generate the SAFE RANGES section text for the system prompt.
 * Used in the defect-tracing fallback section to provide machine-by-machine ranges.
 *
 * Output format per station:
 *   **Press** (N params): pressure_bar [280-450], cycle_time_sec [4-8], ...
 *
 * Includes Conveyor as 8th machine (no DB table — uses alarm/passport data).
 *
 * @returns Multi-line string for insertion into the fallback ranges section
 */
export function generateSafeRangesText(): string {
    /** Station order matching the production line sequence */
    const stationOrder = ['press', 'dryer', 'glaze', 'printer', 'kiln', 'sorting', 'packaging'] as const;
    /** Lines accumulator */
    const lines: string[] = [];

    for (const station of stationOrder) {
        /** Get the ranges for this station from the single source of truth */
        const ranges = PARAMETER_RANGES[station];
        /** Human-readable station name */
        const displayName = STATION_DISPLAY_NAMES[station] ?? station;
        /** Count of parameters with defined ranges */
        const paramCount = Object.keys(ranges).length;

        /** Build parameter list: "column_name [min-max]" for each parameter */
        const paramParts = Object.entries(ranges).map(([col, range]) => {
            return `${col} [${range.min}-${range.max}]`;
        });

        lines.push(`**${displayName}** (${paramCount} params): ${paramParts.join(', ')}`);

        /** Insert Conveyor after Printer (between Line 1 and Line 2) */
        if (station === 'printer') {
            lines.push(
                '**Conveyor** (no separate table — use OEE data): The conveyor transfers tiles between Line 1 and Line 2. ' +
                'Conveyor health is measured by: jam frequency (from alarms), tile damage rate (from tile passport defect_types ' +
                "containing 'conveyor_jam_damage'), and speed setting. Always include conveyor in machine health analysis by " +
                'checking alarm counts for conveyor-related events and tile passport data for conveyor_jam_damage defects.'
            );
        }
    }

    /** Append interpretation guidance */
    lines.push('');
    lines.push('Any value OUTSIDE these ranges at any station is a likely defect contributor.');
    lines.push('Report: "The [Station] has [Parameter] at [value], which is outside the safe range of [min]-[max]. This is likely contributing to [defect_type] defects."');
    lines.push('');
    lines.push('CRITICAL: ALL of these parameters EXIST in the database. When you SELECT * from any machine table, you WILL get a value for every column listed above. NEVER skip a parameter. NEVER say "Not reported" — just read the value from your query result and compare it against the range.');

    return lines.join('\n');
}

/**
 * Generate the PARAMETER GLOSSARY section for the system prompt.
 * Maps every DB column name to its human-friendly display name.
 *
 * Output format:
 *   | DB Column (NEVER show) | Human-Friendly Name (ALWAYS use) |
 *   | pressure_bar | Press Pressure |
 *
 * @returns Markdown table string for the NO DATABASE INTERNALS section
 */
export function generateParameterGlossary(): string {
    /** Table header */
    const lines: string[] = [
        '| DB Column (NEVER show) | Human-Friendly Name (ALWAYS use) |',
        '|---|---|',
    ];

    /** Add a row for each parameter with a display name */
    for (const [col, displayName] of Object.entries(PARAM_DISPLAY_NAMES)) {
        lines.push(`| ${col} | ${displayName} |`);
    }

    /** Add common non-parameter DB terms */
    const dbTerms: Record<string, string> = {
        scrap_by_station: 'scrap per station',
        production_metrics: 'production data',
        current_station: 'last known station',
        sim_tick: 'simulation time',
        tile_number: 'Tile #',
        defect_types: 'defect categories',
        defect_detected: 'defect flag',
        parameters_snapshot: 'machine parameters at that moment',
        simulation_id: 'session reference',
        parameter_change_events: 'parameter change history',
        simulation_alarm_logs: 'alarm history',
        ai_analysis_results: 'analysis records',
        change_reason: 'reason for change',
    };

    for (const [col, displayName] of Object.entries(dbTerms)) {
        lines.push(`| ${col} | ${displayName} |`);
    }

    return lines.join('\n');
}
