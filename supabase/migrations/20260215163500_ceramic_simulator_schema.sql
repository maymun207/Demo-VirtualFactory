-- ============================================================================
-- CERAMIC TILE PRODUCTION LINE SIMULATOR - SUPABASE DATABASE SCHEMA
-- ============================================================================
-- Version: 1.0
-- Description: Complete database schema for simulating a ceramic tile 
--              production line with 7 stations, tracking each tile's journey
--              and enabling AI-powered root cause analysis for defects.
-- ============================================================================

-- Enable UUID extension
-- uuid-ossp not needed; using gen_random_uuid() from pgcrypto (enabled by default in Supabase)

-- ============================================================================
-- SECTION 1: SIMULATION MANAGEMENT
-- ============================================================================

-- Function to generate unique 6-digit session code
CREATE OR REPLACE FUNCTION generate_session_code()
RETURNS VARCHAR(6) AS $$
DECLARE
    new_code VARCHAR(6);
    code_exists BOOLEAN;
BEGIN
    LOOP
        -- Generate random 6-digit alphanumeric code (uppercase)
        new_code := upper(substring(md5(random()::text) from 1 for 6));
        
        -- Check if code already exists
        SELECT EXISTS(
            SELECT 1 FROM simulation_sessions WHERE session_code = new_code
        ) INTO code_exists;
        
        -- Exit loop if unique
        EXIT WHEN NOT code_exists;
    END LOOP;
    
    RETURN new_code;
END;
$$ LANGUAGE plpgsql;

-- Simulation sessions table
CREATE TABLE simulation_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_code VARCHAR(6) NOT NULL UNIQUE DEFAULT generate_session_code(),  -- 6-digit unique code (e.g., 'A3F2B1')
    name VARCHAR(255) NOT NULL,
    description TEXT,
    
    -- Timing configuration
    tick_duration_ms INTEGER NOT NULL DEFAULT 500,  -- Milliseconds per simulation tick
    production_tick_ratio INTEGER NOT NULL DEFAULT 2,  -- sim ticks per production tick
    station_gap_production_ticks INTEGER NOT NULL DEFAULT 2,  -- production ticks between stations
    
    -- Session state
    status VARCHAR(20) NOT NULL DEFAULT 'created',  -- created, running, paused, completed, aborted
    current_sim_tick BIGINT NOT NULL DEFAULT 0,
    current_production_tick BIGINT NOT NULL DEFAULT 0,
    
    -- Targets & metrics
    target_tiles_per_hour INTEGER,
    target_first_quality_pct DECIMAL(5,2),
    
    -- Timestamps
    started_at TIMESTAMPTZ,
    paused_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for active sessions
CREATE INDEX idx_simulation_sessions_status ON simulation_sessions(status);
CREATE INDEX idx_simulation_sessions_code ON simulation_sessions(session_code);

-- ============================================================================
-- SECTION 2: MACHINE STATE TABLES (One per station)
-- ============================================================================

-- -----------------------------------------------------------------------------
-- 2.1 PRESS MACHINE STATE
-- -----------------------------------------------------------------------------
CREATE TABLE machine_press_states (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    simulation_id UUID NOT NULL REFERENCES simulation_sessions(id) ON DELETE CASCADE,
    sim_tick BIGINT NOT NULL,
    production_tick BIGINT NOT NULL,
    
    -- Operating parameters
    pressure_bar DECIMAL(6,2) NOT NULL,           -- 280-450 bar
    cycle_time_sec DECIMAL(5,2) NOT NULL,         -- 4-8 seconds
    mold_temperature_c DECIMAL(5,2) NOT NULL,     -- 40-60°C
    powder_moisture_pct DECIMAL(4,2) NOT NULL,    -- 5-7%
    fill_amount_g DECIMAL(7,2) NOT NULL,          -- 800-2500 grams
    mold_wear_pct DECIMAL(5,2) NOT NULL,          -- 0-100%
    
    -- Derived/calculated
    pressure_deviation_pct DECIMAL(5,2),          -- Deviation from optimal
    fill_homogeneity_pct DECIMAL(5,2),            -- Uniformity of fill
    
    -- Machine status
    is_operating BOOLEAN NOT NULL DEFAULT true,
    fault_code VARCHAR(20),
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(simulation_id, sim_tick)
);

CREATE INDEX idx_press_sim_tick ON machine_press_states(simulation_id, sim_tick);

-- -----------------------------------------------------------------------------
-- 2.2 DRYER MACHINE STATE
-- -----------------------------------------------------------------------------
CREATE TABLE machine_dryer_states (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    simulation_id UUID NOT NULL REFERENCES simulation_sessions(id) ON DELETE CASCADE,
    sim_tick BIGINT NOT NULL,
    production_tick BIGINT NOT NULL,
    
    -- Operating parameters
    inlet_temperature_c DECIMAL(5,2) NOT NULL,    -- 150-250°C
    outlet_temperature_c DECIMAL(5,2) NOT NULL,   -- 80-120°C
    belt_speed_m_min DECIMAL(5,2) NOT NULL,       -- 1-5 m/min
    drying_time_min DECIMAL(5,2) NOT NULL,        -- 30-60 minutes
    exit_moisture_pct DECIMAL(4,2) NOT NULL,      -- 0.5-1.5%
    fan_frequency_hz DECIMAL(5,2) NOT NULL,       -- 30-50 Hz
    
    -- Derived/calculated
    temperature_gradient_c_m DECIMAL(6,2),        -- °C per meter
    drying_rate VARCHAR(20),                      -- slow, normal, fast, excessive
    moisture_homogeneity_pct DECIMAL(5,2),
    
    -- Machine status
    is_operating BOOLEAN NOT NULL DEFAULT true,
    fault_code VARCHAR(20),
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(simulation_id, sim_tick)
);

CREATE INDEX idx_dryer_sim_tick ON machine_dryer_states(simulation_id, sim_tick);

-- -----------------------------------------------------------------------------
-- 2.3 GLAZE MACHINE STATE
-- -----------------------------------------------------------------------------
CREATE TABLE machine_glaze_states (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    simulation_id UUID NOT NULL REFERENCES simulation_sessions(id) ON DELETE CASCADE,
    sim_tick BIGINT NOT NULL,
    production_tick BIGINT NOT NULL,
    
    -- Operating parameters
    glaze_density_g_cm3 DECIMAL(4,2) NOT NULL,    -- 1.35-1.55 g/cm³
    glaze_viscosity_sec DECIMAL(5,2) NOT NULL,    -- 18-35 seconds (Ford cup)
    application_weight_g_m2 DECIMAL(6,2) NOT NULL, -- 300-600 g/m²
    cabin_pressure_bar DECIMAL(4,2) NOT NULL,     -- 0.3-1.2 bar
    nozzle_angle_deg DECIMAL(4,1) NOT NULL,       -- 15-45 degrees
    belt_speed_m_min DECIMAL(5,2) NOT NULL,       -- 15-35 m/min
    glaze_temperature_c DECIMAL(4,1) NOT NULL,    -- 20-30°C
    
    -- Derived/calculated
    weight_deviation_pct DECIMAL(5,2),
    nozzle_clog_pct DECIMAL(5,2),                 -- Nozzle blockage percentage
    
    -- Machine status
    is_operating BOOLEAN NOT NULL DEFAULT true,
    fault_code VARCHAR(20),
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(simulation_id, sim_tick)
);

CREATE INDEX idx_glaze_sim_tick ON machine_glaze_states(simulation_id, sim_tick);

-- -----------------------------------------------------------------------------
-- 2.4 DIGITAL PRINTER MACHINE STATE
-- -----------------------------------------------------------------------------
CREATE TABLE machine_printer_states (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    simulation_id UUID NOT NULL REFERENCES simulation_sessions(id) ON DELETE CASCADE,
    sim_tick BIGINT NOT NULL,
    production_tick BIGINT NOT NULL,
    
    -- Operating parameters
    head_temperature_c DECIMAL(4,1) NOT NULL,     -- 35-45°C
    ink_viscosity_mpa_s DECIMAL(5,2) NOT NULL,    -- 8-15 mPa·s
    drop_size_pl DECIMAL(5,1) NOT NULL,           -- 6-80 picoliters
    resolution_dpi INTEGER NOT NULL,              -- 360-720 dpi
    belt_speed_m_min DECIMAL(5,2) NOT NULL,       -- 20-45 m/min
    head_gap_mm DECIMAL(4,2) NOT NULL,            -- 1.5-4 mm
    color_channels INTEGER NOT NULL,              -- 4-8 channels
    active_nozzle_pct DECIMAL(5,2) NOT NULL,      -- 95-100%
    
    -- Derived/calculated
    nozzle_clog_pct DECIMAL(5,2),                 -- 100 - active_nozzle_pct
    temperature_deviation_c DECIMAL(4,2),
    encoder_error_pct DECIMAL(5,2),
    
    -- Ink levels per channel (JSON for flexibility)
    ink_levels_pct JSONB,                         -- {"C": 85, "M": 72, "Y": 90, "K": 45, ...}
    
    -- Machine status
    is_operating BOOLEAN NOT NULL DEFAULT true,
    fault_code VARCHAR(20),
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(simulation_id, sim_tick)
);

CREATE INDEX idx_printer_sim_tick ON machine_printer_states(simulation_id, sim_tick);

-- -----------------------------------------------------------------------------
-- 2.5 KILN MACHINE STATE
-- -----------------------------------------------------------------------------
CREATE TABLE machine_kiln_states (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    simulation_id UUID NOT NULL REFERENCES simulation_sessions(id) ON DELETE CASCADE,
    sim_tick BIGINT NOT NULL,
    production_tick BIGINT NOT NULL,
    
    -- Operating parameters
    max_temperature_c DECIMAL(6,1) NOT NULL,      -- 1100-1220°C
    firing_time_min DECIMAL(5,1) NOT NULL,        -- 35-60 minutes
    preheat_gradient_c_min DECIMAL(5,2) NOT NULL, -- 15-40°C/min
    cooling_gradient_c_min DECIMAL(5,2) NOT NULL, -- 20-50°C/min
    belt_speed_m_min DECIMAL(5,3) NOT NULL,       -- 1-3 m/min
    atmosphere_pressure_mbar DECIMAL(5,2) NOT NULL, -- -0.5 to +0.5 mbar
    zone_count INTEGER NOT NULL,                  -- 5-15 zones
    o2_level_pct DECIMAL(4,2) NOT NULL,           -- 2-8%
    
    -- Zone temperatures (JSON array)
    zone_temperatures_c JSONB,                    -- [850, 950, 1100, 1200, 1150, ...]
    
    -- Derived/calculated
    temperature_deviation_c DECIMAL(5,2),
    gradient_balance_pct DECIMAL(5,2),            -- How balanced heating/cooling is
    zone_variance_c DECIMAL(5,2),                 -- Cross-tile temperature variance
    
    -- Machine status
    is_operating BOOLEAN NOT NULL DEFAULT true,
    fault_code VARCHAR(20),
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(simulation_id, sim_tick)
);

CREATE INDEX idx_kiln_sim_tick ON machine_kiln_states(simulation_id, sim_tick);

-- -----------------------------------------------------------------------------
-- 2.6 SORTING MACHINE STATE
-- -----------------------------------------------------------------------------
CREATE TABLE machine_sorting_states (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    simulation_id UUID NOT NULL REFERENCES simulation_sessions(id) ON DELETE CASCADE,
    sim_tick BIGINT NOT NULL,
    production_tick BIGINT NOT NULL,
    
    -- Operating parameters
    camera_resolution_mp DECIMAL(4,1) NOT NULL,   -- 5-20 megapixels
    scan_rate_tiles_min DECIMAL(5,1) NOT NULL,    -- 20-60 tiles/min
    size_tolerance_mm DECIMAL(4,2) NOT NULL,      -- ±0.3 to ±1.0 mm
    color_tolerance_de DECIMAL(4,2) NOT NULL,     -- ΔE 0.5-2.0
    flatness_tolerance_mm DECIMAL(4,2) NOT NULL,  -- 0.1-0.5 mm
    defect_threshold_mm2 DECIMAL(5,2) NOT NULL,   -- 0.5-3.0 mm²
    grade_count INTEGER NOT NULL,                  -- 3-5 grades
    
    -- Derived/calculated
    calibration_drift_pct DECIMAL(5,2),
    lighting_variance_pct DECIMAL(5,2),
    camera_cleanliness_pct DECIMAL(5,2),
    algorithm_sensitivity DECIMAL(4,2),           -- 0-1 scale
    
    -- Machine status
    is_operating BOOLEAN NOT NULL DEFAULT true,
    fault_code VARCHAR(20),
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(simulation_id, sim_tick)
);

CREATE INDEX idx_sorting_sim_tick ON machine_sorting_states(simulation_id, sim_tick);

-- -----------------------------------------------------------------------------
-- 2.7 PACKAGING MACHINE STATE
-- -----------------------------------------------------------------------------
CREATE TABLE machine_packaging_states (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    simulation_id UUID NOT NULL REFERENCES simulation_sessions(id) ON DELETE CASCADE,
    sim_tick BIGINT NOT NULL,
    production_tick BIGINT NOT NULL,
    
    -- Operating parameters
    stack_count INTEGER NOT NULL,                 -- 4-12 tiles per box
    box_sealing_pressure_bar DECIMAL(4,2) NOT NULL, -- 2-5 bar
    pallet_capacity_m2 DECIMAL(5,1) NOT NULL,     -- 40-80 m²/pallet
    stretch_tension_pct DECIMAL(5,1) NOT NULL,    -- 150-300%
    robot_speed_cycles_min DECIMAL(4,1) NOT NULL, -- 6-15 cycles/min
    label_accuracy_pct DECIMAL(5,2) NOT NULL,     -- 99-100%
    
    -- Derived/calculated
    stacking_error_rate_pct DECIMAL(5,3),
    pressure_deviation_pct DECIMAL(5,2),
    
    -- Machine status
    is_operating BOOLEAN NOT NULL DEFAULT true,
    fault_code VARCHAR(20),
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(simulation_id, sim_tick)
);

CREATE INDEX idx_packaging_sim_tick ON machine_packaging_states(simulation_id, sim_tick);

-- ============================================================================
-- SECTION 3: TILE TRACKING
-- ============================================================================

-- Defect types enumeration
CREATE TYPE defect_type AS ENUM (
    -- Press defects
    'crack_press',
    'delamination',
    'dimension_variance',
    'density_variance',
    'edge_defect',
    'press_explosion',
    
    -- Dryer defects
    'surface_crack_dry',
    'warp_dry',
    'explosion_dry',
    
    -- Glaze defects
    'color_tone_variance',
    'glaze_thickness_variance',
    'pinhole_glaze',
    'glaze_drip',
    'line_defect_glaze',
    'edge_buildup',
    
    -- Printer defects
    'line_defect_print',
    'white_spot',
    'color_shift',
    'saturation_variance',
    'blur',
    'pattern_stretch',
    'pattern_compress',
    
    -- Kiln defects
    'crack_kiln',
    'warp_kiln',
    'corner_lift',
    'pinhole_kiln',
    'color_fade',
    'size_variance_kiln',
    'thermal_shock_crack',
    
    -- Packaging defects
    'chip',
    'edge_crack_pack',
    'crush_damage',
    
    -- Other
    'unknown'
);

-- Quality grades
CREATE TYPE quality_grade AS ENUM (
    'first_quality',
    'second_quality', 
    'third_quality',
    'scrap',
    'pending'
);

-- Tile lifecycle status
CREATE TYPE tile_status AS ENUM (
    'in_production',
    'scrapped_at_press',
    'scrapped_at_dryer',
    'scrapped_at_glaze',
    'scrapped_at_printer',
    'scrapped_at_kiln',
    'sorted',
    'packaged',
    'completed'
);

-- Main tiles table
CREATE TABLE tiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    simulation_id UUID NOT NULL REFERENCES simulation_sessions(id) ON DELETE CASCADE,
    tile_number SERIAL,                           -- Sequential tile number in simulation
    
    -- Production timing
    created_at_sim_tick BIGINT NOT NULL,
    created_at_production_tick BIGINT NOT NULL,
    completed_at_sim_tick BIGINT,
    
    -- Current state
    status tile_status NOT NULL DEFAULT 'in_production',
    current_station VARCHAR(20),                  -- press, dryer, glaze, printer, kiln, sorting, packaging
    
    -- Final quality (set by sorting)
    final_grade quality_grade NOT NULL DEFAULT 'pending',
    
    -- Tile specifications
    width_mm DECIMAL(6,2),
    height_mm DECIMAL(6,2),
    thickness_mm DECIMAL(5,2),
    weight_g DECIMAL(7,2),
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tiles_simulation ON tiles(simulation_id);
CREATE INDEX idx_tiles_status ON tiles(simulation_id, status);
CREATE INDEX idx_tiles_grade ON tiles(simulation_id, final_grade);
CREATE INDEX idx_tiles_created_tick ON tiles(simulation_id, created_at_sim_tick);

-- ============================================================================
-- SECTION 4: TILE-MACHINE SNAPSHOTS (Künye)
-- ============================================================================

-- Snapshot when tile passes through each station
CREATE TABLE tile_station_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tile_id UUID NOT NULL REFERENCES tiles(id) ON DELETE CASCADE,
    simulation_id UUID NOT NULL REFERENCES simulation_sessions(id) ON DELETE CASCADE,
    
    -- Station identification
    station VARCHAR(20) NOT NULL,                 -- press, dryer, glaze, printer, kiln, sorting, packaging
    station_order INTEGER NOT NULL,               -- 1-7
    
    -- Timing
    entry_sim_tick BIGINT NOT NULL,
    entry_production_tick BIGINT NOT NULL,
    exit_sim_tick BIGINT,
    processing_duration_ticks INTEGER,
    
    -- Reference to the machine state at this tick
    machine_state_id UUID NOT NULL,               -- FK to respective machine_*_states table
    
    -- Snapshot of key parameters (denormalized for quick AI access)
    parameters_snapshot JSONB NOT NULL,           -- Key parameters from machine state
    
    -- Station-specific measurements on this tile
    tile_measurements JSONB,                      -- Measurements taken at this station
    
    -- Defect detection at this station
    defect_detected BOOLEAN NOT NULL DEFAULT false,
    defect_types defect_type[],                   -- Array of detected defects
    defect_severity DECIMAL(3,2),                 -- 0-1 scale
    scrapped_here BOOLEAN NOT NULL DEFAULT false,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_snapshots_tile ON tile_station_snapshots(tile_id);
CREATE INDEX idx_snapshots_station ON tile_station_snapshots(simulation_id, station, entry_sim_tick);
CREATE INDEX idx_snapshots_defect ON tile_station_snapshots(simulation_id, defect_detected) WHERE defect_detected = true;

-- ============================================================================
-- SECTION 5: PARAMETER CHANGE EVENTS
-- ============================================================================

-- Track when and how machine parameters change during simulation
CREATE TABLE parameter_change_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    simulation_id UUID NOT NULL REFERENCES simulation_sessions(id) ON DELETE CASCADE,
    
    -- Timing
    sim_tick BIGINT NOT NULL,
    production_tick BIGINT NOT NULL,
    
    -- What changed
    station VARCHAR(20) NOT NULL,
    parameter_name VARCHAR(100) NOT NULL,
    old_value DECIMAL(12,4),
    new_value DECIMAL(12,4) NOT NULL,
    change_magnitude DECIMAL(8,4),                -- Absolute change
    change_pct DECIMAL(8,4),                      -- Percentage change
    
    -- Change characteristics
    change_type VARCHAR(20) NOT NULL,             -- drift, spike, step, random, scheduled
    change_reason VARCHAR(100),                   -- wear, environment, operator, random, scenario
    
    -- Link to scenario if applicable
    scenario_id UUID,
    
    -- Impact prediction (set by simulator)
    expected_impact VARCHAR(100),                 -- e.g., "may cause cracks", "affects color"
    expected_scrap_increase_pct DECIMAL(5,2),
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_param_changes_sim_tick ON parameter_change_events(simulation_id, sim_tick);
CREATE INDEX idx_param_changes_station ON parameter_change_events(simulation_id, station);

-- ============================================================================
-- SECTION 6: SCRAP/DEFECT SCENARIOS
-- ============================================================================

-- Predefined scenarios that can trigger defects
CREATE TABLE defect_scenarios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Scenario identification
    code VARCHAR(20) NOT NULL UNIQUE,             -- e.g., SCN-001
    name VARCHAR(100) NOT NULL,
    description TEXT,
    
    -- Trigger conditions (JSON for flexibility)
    trigger_conditions JSONB NOT NULL,            -- e.g., {"station": "press", "parameter": "pressure_bar", "condition": "<", "threshold": 300}
    
    -- Cascade effects
    affected_stations VARCHAR(20)[],              -- Which downstream stations are affected
    cascade_delay_ticks INTEGER,                  -- How many ticks until effect manifests
    
    -- Expected outcomes
    likely_defects defect_type[],
    scrap_probability_pct DECIMAL(5,2),
    quality_downgrade_probability_pct DECIMAL(5,2),
    
    -- Severity
    severity VARCHAR(10) NOT NULL,                -- low, medium, high, critical
    
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Scenario instances during simulation
CREATE TABLE scenario_activations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    simulation_id UUID NOT NULL REFERENCES simulation_sessions(id) ON DELETE CASCADE,
    scenario_id UUID NOT NULL REFERENCES defect_scenarios(id),
    
    -- Timing
    activated_at_sim_tick BIGINT NOT NULL,
    deactivated_at_sim_tick BIGINT,
    duration_ticks INTEGER,
    
    -- Affected tiles
    first_affected_tile_id UUID REFERENCES tiles(id),
    last_affected_tile_id UUID REFERENCES tiles(id),
    affected_tile_count INTEGER,
    
    -- Actual outcomes
    actual_scrap_count INTEGER DEFAULT 0,
    actual_downgrade_count INTEGER DEFAULT 0,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_scenario_activations_sim ON scenario_activations(simulation_id, activated_at_sim_tick);

-- ============================================================================
-- SECTION 7: AGGREGATED METRICS (For OEE, KPIs)
-- ============================================================================

-- Periodic aggregation of production metrics
CREATE TABLE production_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    simulation_id UUID NOT NULL REFERENCES simulation_sessions(id) ON DELETE CASCADE,
    
    -- Time window
    period_start_sim_tick BIGINT NOT NULL,
    period_end_sim_tick BIGINT NOT NULL,
    period_start_production_tick BIGINT NOT NULL,
    period_end_production_tick BIGINT NOT NULL,
    
    -- Production counts
    total_tiles_produced INTEGER NOT NULL DEFAULT 0,
    first_quality_count INTEGER NOT NULL DEFAULT 0,
    second_quality_count INTEGER NOT NULL DEFAULT 0,
    third_quality_count INTEGER NOT NULL DEFAULT 0,
    scrap_count INTEGER NOT NULL DEFAULT 0,
    
    -- OEE components
    availability_pct DECIMAL(5,2),                -- Uptime / Planned time
    performance_pct DECIMAL(5,2),                 -- Actual / Theoretical output
    quality_pct DECIMAL(5,2),                     -- Good / Total output
    oee_pct DECIMAL(5,2),                         -- Availability × Performance × Quality
    
    -- Scrap breakdown by station
    scrap_by_station JSONB,                       -- {"press": 5, "dryer": 2, "kiln": 8, ...}
    
    -- Defect breakdown
    defect_counts JSONB,                          -- {"crack_press": 3, "warp_kiln": 5, ...}
    
    -- Machine utilization
    machine_uptime JSONB,                         -- {"press": 98.5, "dryer": 100, ...}
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_metrics_sim_period ON production_metrics(simulation_id, period_start_sim_tick);

-- ============================================================================
-- SECTION 8: AI ANALYSIS SUPPORT
-- ============================================================================

-- Store AI analysis results and root cause findings
CREATE TABLE ai_analysis_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    simulation_id UUID NOT NULL REFERENCES simulation_sessions(id) ON DELETE CASCADE,
    
    -- Analysis scope
    analysis_type VARCHAR(50) NOT NULL,           -- root_cause, trend, prediction, anomaly
    analyzed_at_sim_tick BIGINT,
    
    -- What was analyzed
    target_tile_ids UUID[],
    target_defect_types defect_type[],
    time_range_start_tick BIGINT,
    time_range_end_tick BIGINT,
    
    -- Findings
    root_causes JSONB,                            -- [{"station": "press", "parameter": "pressure_bar", "contribution": 0.65}, ...]
    confidence_score DECIMAL(4,3),                -- 0-1
    summary TEXT,
    recommendations JSONB,                        -- [{"action": "increase pressure", "expected_improvement": "30% fewer cracks"}, ...]
    
    -- Metadata
    model_version VARCHAR(50),
    processing_time_ms INTEGER,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ai_analysis_sim ON ai_analysis_results(simulation_id, analysis_type);

-- ============================================================================
-- SECTION 9: HELPER VIEWS
-- ============================================================================

-- Complete tile journey view (künye)
CREATE VIEW tile_journey AS
SELECT 
    t.id AS tile_id,
    t.tile_number,
    t.simulation_id,
    ss.session_code,  -- Include session code for easy filtering
    t.status,
    t.final_grade,
    t.created_at_sim_tick,
    t.completed_at_sim_tick,
    
    -- Press snapshot
    (SELECT parameters_snapshot FROM tile_station_snapshots WHERE tile_id = t.id AND station = 'press') AS press_params,
    (SELECT defect_types FROM tile_station_snapshots WHERE tile_id = t.id AND station = 'press') AS press_defects,
    
    -- Dryer snapshot
    (SELECT parameters_snapshot FROM tile_station_snapshots WHERE tile_id = t.id AND station = 'dryer') AS dryer_params,
    (SELECT defect_types FROM tile_station_snapshots WHERE tile_id = t.id AND station = 'dryer') AS dryer_defects,
    
    -- Glaze snapshot
    (SELECT parameters_snapshot FROM tile_station_snapshots WHERE tile_id = t.id AND station = 'glaze') AS glaze_params,
    (SELECT defect_types FROM tile_station_snapshots WHERE tile_id = t.id AND station = 'glaze') AS glaze_defects,
    
    -- Printer snapshot
    (SELECT parameters_snapshot FROM tile_station_snapshots WHERE tile_id = t.id AND station = 'printer') AS printer_params,
    (SELECT defect_types FROM tile_station_snapshots WHERE tile_id = t.id AND station = 'printer') AS printer_defects,
    
    -- Kiln snapshot
    (SELECT parameters_snapshot FROM tile_station_snapshots WHERE tile_id = t.id AND station = 'kiln') AS kiln_params,
    (SELECT defect_types FROM tile_station_snapshots WHERE tile_id = t.id AND station = 'kiln') AS kiln_defects,
    
    -- Sorting snapshot
    (SELECT parameters_snapshot FROM tile_station_snapshots WHERE tile_id = t.id AND station = 'sorting') AS sorting_params,
    (SELECT defect_types FROM tile_station_snapshots WHERE tile_id = t.id AND station = 'sorting') AS sorting_defects,
    
    -- Packaging snapshot
    (SELECT parameters_snapshot FROM tile_station_snapshots WHERE tile_id = t.id AND station = 'packaging') AS packaging_params,
    (SELECT defect_types FROM tile_station_snapshots WHERE tile_id = t.id AND station = 'packaging') AS packaging_defects

FROM tiles t
JOIN simulation_sessions ss ON t.simulation_id = ss.id;

-- Defective tiles with full context for AI analysis
CREATE VIEW defective_tiles_analysis AS
SELECT 
    t.id AS tile_id,
    t.tile_number,
    t.simulation_id,
    ss.session_code,  -- Include session code for easy filtering
    t.final_grade,
    
    -- All defects across all stations
    ARRAY(
        SELECT DISTINCT unnest(tss.defect_types) 
        FROM tile_station_snapshots tss 
        WHERE tss.tile_id = t.id AND tss.defect_detected = true
    ) AS all_defects,
    
    -- Station where tile was scrapped (if applicable)
    (SELECT station FROM tile_station_snapshots WHERE tile_id = t.id AND scrapped_here = true LIMIT 1) AS scrapped_at_station,
    
    -- Parameter snapshots as JSON object
    jsonb_build_object(
        'press', (SELECT parameters_snapshot FROM tile_station_snapshots WHERE tile_id = t.id AND station = 'press'),
        'dryer', (SELECT parameters_snapshot FROM tile_station_snapshots WHERE tile_id = t.id AND station = 'dryer'),
        'glaze', (SELECT parameters_snapshot FROM tile_station_snapshots WHERE tile_id = t.id AND station = 'glaze'),
        'printer', (SELECT parameters_snapshot FROM tile_station_snapshots WHERE tile_id = t.id AND station = 'printer'),
        'kiln', (SELECT parameters_snapshot FROM tile_station_snapshots WHERE tile_id = t.id AND station = 'kiln'),
        'sorting', (SELECT parameters_snapshot FROM tile_station_snapshots WHERE tile_id = t.id AND station = 'sorting'),
        'packaging', (SELECT parameters_snapshot FROM tile_station_snapshots WHERE tile_id = t.id AND station = 'packaging')
    ) AS all_parameters,
    
    -- Related parameter changes around tile's production time
    (
        SELECT jsonb_agg(jsonb_build_object(
            'tick', pce.sim_tick,
            'station', pce.station,
            'parameter', pce.parameter_name,
            'old_value', pce.old_value,
            'new_value', pce.new_value,
            'change_type', pce.change_type
        ))
        FROM parameter_change_events pce
        WHERE pce.simulation_id = t.simulation_id
        AND pce.sim_tick BETWEEN t.created_at_sim_tick - 20 AND t.completed_at_sim_tick
    ) AS parameter_changes_during_production

FROM tiles t
JOIN simulation_sessions ss ON t.simulation_id = ss.id
WHERE t.final_grade IN ('scrap', 'second_quality', 'third_quality')
   OR EXISTS (
       SELECT 1 FROM tile_station_snapshots tss 
       WHERE tss.tile_id = t.id AND tss.defect_detected = true
   );

-- ============================================================================
-- SECTION 10: FUNCTIONS & TRIGGERS
-- ============================================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_simulation_sessions_updated_at
    BEFORE UPDATE ON simulation_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tiles_updated_at
    BEFORE UPDATE ON tiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Function to get simulation ID by session code
CREATE OR REPLACE FUNCTION get_simulation_by_code(p_session_code VARCHAR(6))
RETURNS UUID AS $$
DECLARE
    sim_id UUID;
BEGIN
    SELECT id INTO sim_id 
    FROM simulation_sessions 
    WHERE session_code = upper(p_session_code);
    
    RETURN sim_id;
END;
$$ LANGUAGE plpgsql;

-- Function to get machine state for a specific station and tick
CREATE OR REPLACE FUNCTION get_machine_state(
    p_simulation_id UUID,
    p_station VARCHAR(20),
    p_sim_tick BIGINT
) RETURNS JSONB AS $$
DECLARE
    result JSONB;
BEGIN
    CASE p_station
        WHEN 'press' THEN
            SELECT to_jsonb(m.*) INTO result 
            FROM machine_press_states m 
            WHERE m.simulation_id = p_simulation_id AND m.sim_tick = p_sim_tick;
        WHEN 'dryer' THEN
            SELECT to_jsonb(m.*) INTO result 
            FROM machine_dryer_states m 
            WHERE m.simulation_id = p_simulation_id AND m.sim_tick = p_sim_tick;
        WHEN 'glaze' THEN
            SELECT to_jsonb(m.*) INTO result 
            FROM machine_glaze_states m 
            WHERE m.simulation_id = p_simulation_id AND m.sim_tick = p_sim_tick;
        WHEN 'printer' THEN
            SELECT to_jsonb(m.*) INTO result 
            FROM machine_printer_states m 
            WHERE m.simulation_id = p_simulation_id AND m.sim_tick = p_sim_tick;
        WHEN 'kiln' THEN
            SELECT to_jsonb(m.*) INTO result 
            FROM machine_kiln_states m 
            WHERE m.simulation_id = p_simulation_id AND m.sim_tick = p_sim_tick;
        WHEN 'sorting' THEN
            SELECT to_jsonb(m.*) INTO result 
            FROM machine_sorting_states m 
            WHERE m.simulation_id = p_simulation_id AND m.sim_tick = p_sim_tick;
        WHEN 'packaging' THEN
            SELECT to_jsonb(m.*) INTO result 
            FROM machine_packaging_states m 
            WHERE m.simulation_id = p_simulation_id AND m.sim_tick = p_sim_tick;
    END CASE;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- SECTION 11: SAMPLE DATA / SEED SCENARIOS
-- ============================================================================

-- Insert predefined defect scenarios
INSERT INTO defect_scenarios (code, name, description, trigger_conditions, affected_stations, cascade_delay_ticks, likely_defects, scrap_probability_pct, quality_downgrade_probability_pct, severity) VALUES

('SCN-001', 'Low Press Pressure', 
 'Press pressure drops below optimal range, causing density and structural issues',
 '{"station": "press", "parameter": "pressure_bar", "condition": "<", "threshold": 300}',
 ARRAY['press', 'kiln'], 
 40,
 ARRAY['crack_press', 'density_variance']::defect_type[],
 15.0, 25.0, 'high'),

('SCN-002', 'High Powder Moisture',
 'Powder moisture exceeds safe limits, risk of explosion in dryer or kiln',
 '{"station": "press", "parameter": "powder_moisture_pct", "condition": ">", "threshold": 7.5}',
 ARRAY['press', 'dryer', 'kiln'],
 20,
 ARRAY['explosion_dry', 'crack_kiln', 'delamination']::defect_type[],
 25.0, 30.0, 'critical'),

('SCN-003', 'Kiln Zone Temperature Imbalance',
 'Temperature variance across kiln zones causes uneven firing',
 '{"station": "kiln", "parameter": "zone_variance_c", "condition": ">", "threshold": 20}',
 ARRAY['kiln'],
 0,
 ARRAY['warp_kiln', 'color_fade', 'size_variance_kiln']::defect_type[],
 10.0, 35.0, 'high'),

('SCN-004', 'Printer Nozzle Degradation',
 'Significant nozzle clogging affecting print quality',
 '{"station": "printer", "parameter": "active_nozzle_pct", "condition": "<", "threshold": 92}',
 ARRAY['printer'],
 0,
 ARRAY['line_defect_print', 'white_spot', 'color_shift']::defect_type[],
 5.0, 40.0, 'medium'),

('SCN-005', 'Glaze Viscosity Drift',
 'Glaze viscosity outside optimal range affecting application',
 '{"station": "glaze", "parameter": "glaze_viscosity_sec", "condition": "not_between", "threshold_low": 18, "threshold_high": 35}',
 ARRAY['glaze', 'kiln'],
 30,
 ARRAY['pinhole_glaze', 'glaze_drip', 'pinhole_kiln']::defect_type[],
 8.0, 20.0, 'medium'),

('SCN-006', 'Rapid Drying',
 'Dryer temperature gradient too steep, causing surface cracks',
 '{"station": "dryer", "parameter": "temperature_gradient_c_m", "condition": ">", "threshold": 15}',
 ARRAY['dryer'],
 0,
 ARRAY['surface_crack_dry', 'warp_dry']::defect_type[],
 12.0, 18.0, 'medium'),

('SCN-007', 'Thermal Shock Cooling',
 'Kiln cooling rate too aggressive, causing thermal shock',
 '{"station": "kiln", "parameter": "cooling_gradient_c_min", "condition": ">", "threshold": 45}',
 ARRAY['kiln'],
 0,
 ARRAY['thermal_shock_crack', 'crack_kiln']::defect_type[],
 20.0, 15.0, 'high'),

('SCN-008', 'Mold Wear Critical',
 'Press mold wear exceeds acceptable limits',
 '{"station": "press", "parameter": "mold_wear_pct", "condition": ">", "threshold": 85}',
 ARRAY['press'],
 0,
 ARRAY['edge_defect', 'dimension_variance']::defect_type[],
 8.0, 30.0, 'medium');

-- ============================================================================
-- SECTION 12: ROW LEVEL SECURITY (RLS) FOR SUPABASE
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE simulation_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE machine_press_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE machine_dryer_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE machine_glaze_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE machine_printer_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE machine_kiln_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE machine_sorting_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE machine_packaging_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE tiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE tile_station_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE parameter_change_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE defect_scenarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE scenario_activations ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_analysis_results ENABLE ROW LEVEL SECURITY;

-- Create policies (example: allow all for authenticated users)
-- Adjust these based on your actual auth requirements

CREATE POLICY "Allow all for authenticated users" ON simulation_sessions
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow all for authenticated users" ON machine_press_states
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow all for authenticated users" ON machine_dryer_states
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow all for authenticated users" ON machine_glaze_states
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow all for authenticated users" ON machine_printer_states
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow all for authenticated users" ON machine_kiln_states
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow all for authenticated users" ON machine_sorting_states
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow all for authenticated users" ON machine_packaging_states
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow all for authenticated users" ON tiles
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow all for authenticated users" ON tile_station_snapshots
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow all for authenticated users" ON parameter_change_events
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow read for all on scenarios" ON defect_scenarios
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow all for authenticated users" ON scenario_activations
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow all for authenticated users" ON production_metrics
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow all for authenticated users" ON ai_analysis_results
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================================
-- END OF SCHEMA
-- ============================================================================
