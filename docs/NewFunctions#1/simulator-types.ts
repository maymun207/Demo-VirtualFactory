// ============================================================================
// CERAMIC TILE PRODUCTION LINE SIMULATOR - TypeScript Type Definitions
// ============================================================================
// Auto-generated types matching Supabase database schema
// ============================================================================

// =============================================================================
// ENUMS
// =============================================================================

export type DefectType =
  // Press defects
  | 'crack_press'
  | 'delamination'
  | 'dimension_variance'
  | 'density_variance'
  | 'edge_defect'
  | 'press_explosion'
  // Dryer defects
  | 'surface_crack_dry'
  | 'warp_dry'
  | 'explosion_dry'
  // Glaze defects
  | 'color_tone_variance'
  | 'glaze_thickness_variance'
  | 'pinhole_glaze'
  | 'glaze_drip'
  | 'line_defect_glaze'
  | 'edge_buildup'
  // Printer defects
  | 'line_defect_print'
  | 'white_spot'
  | 'color_shift'
  | 'saturation_variance'
  | 'blur'
  | 'pattern_stretch'
  | 'pattern_compress'
  // Kiln defects
  | 'crack_kiln'
  | 'warp_kiln'
  | 'corner_lift'
  | 'pinhole_kiln'
  | 'color_fade'
  | 'size_variance_kiln'
  | 'thermal_shock_crack'
  // Packaging defects
  | 'chip'
  | 'edge_crack_pack'
  | 'crush_damage'
  // Other
  | 'unknown';

export type QualityGrade =
  | 'first_quality'
  | 'second_quality'
  | 'third_quality'
  | 'scrap'
  | 'pending';

export type TileStatus =
  | 'in_production'
  | 'scrapped_at_press'
  | 'scrapped_at_dryer'
  | 'scrapped_at_glaze'
  | 'scrapped_at_printer'
  | 'scrapped_at_kiln'
  | 'sorted'
  | 'packaged'
  | 'completed';

export type SimulationStatus =
  | 'created'
  | 'running'
  | 'paused'
  | 'completed'
  | 'aborted';

export type StationName =
  | 'press'
  | 'dryer'
  | 'glaze'
  | 'printer'
  | 'kiln'
  | 'sorting'
  | 'packaging';

export type ChangeType =
  | 'drift'
  | 'spike'
  | 'step'
  | 'random'
  | 'scheduled';

export type ChangeReason =
  | 'wear'
  | 'environment'
  | 'operator'
  | 'random'
  | 'scenario';

export type Severity =
  | 'low'
  | 'medium'
  | 'high'
  | 'critical';

export type DryingRate =
  | 'slow'
  | 'normal'
  | 'fast'
  | 'excessive';

// =============================================================================
// SIMULATION SESSION
// =============================================================================

export interface SimulationSession {
  id: string;
  session_code: string;  // 6-digit unique code (e.g., 'A3F2B1')
  name: string;
  description?: string;
  
  // Timing configuration
  tick_duration_ms: number;
  production_tick_ratio: number;
  station_gap_production_ticks: number;
  
  // Session state
  status: SimulationStatus;
  current_sim_tick: number;
  current_production_tick: number;
  
  // Targets
  target_tiles_per_hour?: number;
  target_first_quality_pct?: number;
  
  // Timestamps
  started_at?: string;
  paused_at?: string;
  completed_at?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateSimulationSession {
  name: string;
  description?: string;
  tick_duration_ms?: number;
  production_tick_ratio?: number;
  station_gap_production_ticks?: number;
  target_tiles_per_hour?: number;
  target_first_quality_pct?: number;
}

// =============================================================================
// MACHINE STATES
// =============================================================================

// Base interface for all machine states
interface BaseMachineState {
  id: string;
  simulation_id: string;
  sim_tick: number;
  production_tick: number;
  is_operating: boolean;
  fault_code?: string;
  created_at: string;
}

// -----------------------------------------------------------------------------
// Press Machine State
// -----------------------------------------------------------------------------
export interface MachinePressState extends BaseMachineState {
  // Operating parameters
  pressure_bar: number;           // 280-450 bar
  cycle_time_sec: number;         // 4-8 seconds
  mold_temperature_c: number;     // 40-60°C
  powder_moisture_pct: number;    // 5-7%
  fill_amount_g: number;          // 800-2500 grams
  mold_wear_pct: number;          // 0-100%
  
  // Derived
  pressure_deviation_pct?: number;
  fill_homogeneity_pct?: number;
}

export interface PressParameters {
  pressure_bar: number;
  cycle_time_sec: number;
  mold_temperature_c: number;
  powder_moisture_pct: number;
  fill_amount_g: number;
  mold_wear_pct: number;
}

// Optimal ranges for AI analysis
export const PRESS_OPTIMAL_RANGES = {
  pressure_bar: { min: 320, max: 400, unit: 'bar' },
  cycle_time_sec: { min: 5, max: 7, unit: 'sec' },
  mold_temperature_c: { min: 45, max: 55, unit: '°C' },
  powder_moisture_pct: { min: 5.5, max: 6.5, unit: '%' },
  fill_amount_g: { min: 1000, max: 2000, unit: 'g' },
  mold_wear_pct: { min: 0, max: 70, unit: '%' },
} as const;

// -----------------------------------------------------------------------------
// Dryer Machine State
// -----------------------------------------------------------------------------
export interface MachineDryerState extends BaseMachineState {
  // Operating parameters
  inlet_temperature_c: number;    // 150-250°C
  outlet_temperature_c: number;   // 80-120°C
  belt_speed_m_min: number;       // 1-5 m/min
  drying_time_min: number;        // 30-60 minutes
  exit_moisture_pct: number;      // 0.5-1.5%
  fan_frequency_hz: number;       // 30-50 Hz
  
  // Derived
  temperature_gradient_c_m?: number;
  drying_rate?: DryingRate;
  moisture_homogeneity_pct?: number;
}

export interface DryerParameters {
  inlet_temperature_c: number;
  outlet_temperature_c: number;
  belt_speed_m_min: number;
  drying_time_min: number;
  exit_moisture_pct: number;
  fan_frequency_hz: number;
}

export const DRYER_OPTIMAL_RANGES = {
  inlet_temperature_c: { min: 180, max: 220, unit: '°C' },
  outlet_temperature_c: { min: 90, max: 110, unit: '°C' },
  belt_speed_m_min: { min: 2, max: 4, unit: 'm/min' },
  drying_time_min: { min: 40, max: 50, unit: 'min' },
  exit_moisture_pct: { min: 0.5, max: 1.0, unit: '%' },
  fan_frequency_hz: { min: 35, max: 45, unit: 'Hz' },
} as const;

// -----------------------------------------------------------------------------
// Glaze Machine State
// -----------------------------------------------------------------------------
export interface MachineGlazeState extends BaseMachineState {
  // Operating parameters
  glaze_density_g_cm3: number;    // 1.35-1.55 g/cm³
  glaze_viscosity_sec: number;    // 18-35 seconds
  application_weight_g_m2: number; // 300-600 g/m²
  cabin_pressure_bar: number;     // 0.3-1.2 bar
  nozzle_angle_deg: number;       // 15-45 degrees
  belt_speed_m_min: number;       // 15-35 m/min
  glaze_temperature_c: number;    // 20-30°C
  
  // Derived
  weight_deviation_pct?: number;
  nozzle_clog_pct?: number;
}

export interface GlazeParameters {
  glaze_density_g_cm3: number;
  glaze_viscosity_sec: number;
  application_weight_g_m2: number;
  cabin_pressure_bar: number;
  nozzle_angle_deg: number;
  belt_speed_m_min: number;
  glaze_temperature_c: number;
}

export const GLAZE_OPTIMAL_RANGES = {
  glaze_density_g_cm3: { min: 1.40, max: 1.50, unit: 'g/cm³' },
  glaze_viscosity_sec: { min: 22, max: 30, unit: 'sec' },
  application_weight_g_m2: { min: 380, max: 500, unit: 'g/m²' },
  cabin_pressure_bar: { min: 0.5, max: 0.9, unit: 'bar' },
  nozzle_angle_deg: { min: 25, max: 35, unit: '°' },
  belt_speed_m_min: { min: 20, max: 30, unit: 'm/min' },
  glaze_temperature_c: { min: 22, max: 28, unit: '°C' },
} as const;

// -----------------------------------------------------------------------------
// Digital Printer Machine State
// -----------------------------------------------------------------------------
export interface MachinePrinterState extends BaseMachineState {
  // Operating parameters
  head_temperature_c: number;     // 35-45°C
  ink_viscosity_mpa_s: number;    // 8-15 mPa·s
  drop_size_pl: number;           // 6-80 picoliters
  resolution_dpi: number;         // 360-720 dpi
  belt_speed_m_min: number;       // 20-45 m/min
  head_gap_mm: number;            // 1.5-4 mm
  color_channels: number;         // 4-8 channels
  active_nozzle_pct: number;      // 95-100%
  
  // Derived
  nozzle_clog_pct?: number;
  temperature_deviation_c?: number;
  encoder_error_pct?: number;
  
  // Ink levels
  ink_levels_pct?: Record<string, number>;
}

export interface PrinterParameters {
  head_temperature_c: number;
  ink_viscosity_mpa_s: number;
  drop_size_pl: number;
  resolution_dpi: number;
  belt_speed_m_min: number;
  head_gap_mm: number;
  color_channels: number;
  active_nozzle_pct: number;
  ink_levels_pct?: Record<string, number>;
}

export const PRINTER_OPTIMAL_RANGES = {
  head_temperature_c: { min: 38, max: 42, unit: '°C' },
  ink_viscosity_mpa_s: { min: 10, max: 13, unit: 'mPa·s' },
  drop_size_pl: { min: 20, max: 50, unit: 'pl' },
  resolution_dpi: { min: 400, max: 600, unit: 'dpi' },
  belt_speed_m_min: { min: 25, max: 35, unit: 'm/min' },
  head_gap_mm: { min: 2.0, max: 3.0, unit: 'mm' },
  active_nozzle_pct: { min: 97, max: 100, unit: '%' },
} as const;

// -----------------------------------------------------------------------------
// Kiln Machine State
// -----------------------------------------------------------------------------
export interface MachineKilnState extends BaseMachineState {
  // Operating parameters
  max_temperature_c: number;      // 1100-1220°C
  firing_time_min: number;        // 35-60 minutes
  preheat_gradient_c_min: number; // 15-40°C/min
  cooling_gradient_c_min: number; // 20-50°C/min
  belt_speed_m_min: number;       // 1-3 m/min
  atmosphere_pressure_mbar: number; // -0.5 to +0.5 mbar
  zone_count: number;             // 5-15 zones
  o2_level_pct: number;           // 2-8%
  
  // Zone temperatures
  zone_temperatures_c?: number[];
  
  // Derived
  temperature_deviation_c?: number;
  gradient_balance_pct?: number;
  zone_variance_c?: number;
}

export interface KilnParameters {
  max_temperature_c: number;
  firing_time_min: number;
  preheat_gradient_c_min: number;
  cooling_gradient_c_min: number;
  belt_speed_m_min: number;
  atmosphere_pressure_mbar: number;
  zone_count: number;
  o2_level_pct: number;
  zone_temperatures_c?: number[];
}

export const KILN_OPTIMAL_RANGES = {
  max_temperature_c: { min: 1140, max: 1180, unit: '°C' },
  firing_time_min: { min: 42, max: 52, unit: 'min' },
  preheat_gradient_c_min: { min: 20, max: 30, unit: '°C/min' },
  cooling_gradient_c_min: { min: 25, max: 38, unit: '°C/min' },
  belt_speed_m_min: { min: 1.5, max: 2.5, unit: 'm/min' },
  atmosphere_pressure_mbar: { min: -0.2, max: 0.2, unit: 'mbar' },
  o2_level_pct: { min: 3, max: 6, unit: '%' },
  zone_variance_c: { min: 0, max: 15, unit: '°C' },
} as const;

// -----------------------------------------------------------------------------
// Sorting Machine State
// -----------------------------------------------------------------------------
export interface MachineSortingState extends BaseMachineState {
  // Operating parameters
  camera_resolution_mp: number;   // 5-20 megapixels
  scan_rate_tiles_min: number;    // 20-60 tiles/min
  size_tolerance_mm: number;      // ±0.3 to ±1.0 mm
  color_tolerance_de: number;     // ΔE 0.5-2.0
  flatness_tolerance_mm: number;  // 0.1-0.5 mm
  defect_threshold_mm2: number;   // 0.5-3.0 mm²
  grade_count: number;            // 3-5 grades
  
  // Derived
  calibration_drift_pct?: number;
  lighting_variance_pct?: number;
  camera_cleanliness_pct?: number;
  algorithm_sensitivity?: number;
}

export interface SortingParameters {
  camera_resolution_mp: number;
  scan_rate_tiles_min: number;
  size_tolerance_mm: number;
  color_tolerance_de: number;
  flatness_tolerance_mm: number;
  defect_threshold_mm2: number;
  grade_count: number;
}

// -----------------------------------------------------------------------------
// Packaging Machine State
// -----------------------------------------------------------------------------
export interface MachinePackagingState extends BaseMachineState {
  // Operating parameters
  stack_count: number;            // 4-12 tiles per box
  box_sealing_pressure_bar: number; // 2-5 bar
  pallet_capacity_m2: number;     // 40-80 m²/pallet
  stretch_tension_pct: number;    // 150-300%
  robot_speed_cycles_min: number; // 6-15 cycles/min
  label_accuracy_pct: number;     // 99-100%
  
  // Derived
  stacking_error_rate_pct?: number;
  pressure_deviation_pct?: number;
}

export interface PackagingParameters {
  stack_count: number;
  box_sealing_pressure_bar: number;
  pallet_capacity_m2: number;
  stretch_tension_pct: number;
  robot_speed_cycles_min: number;
  label_accuracy_pct: number;
}

// Union type for all machine states
export type MachineState =
  | MachinePressState
  | MachineDryerState
  | MachineGlazeState
  | MachinePrinterState
  | MachineKilnState
  | MachineSortingState
  | MachinePackagingState;

// =============================================================================
// TILES
// =============================================================================

export interface Tile {
  id: string;
  simulation_id: string;
  tile_number: number;
  
  // Production timing
  created_at_sim_tick: number;
  created_at_production_tick: number;
  completed_at_sim_tick?: number;
  
  // Current state
  status: TileStatus;
  current_station?: StationName;
  
  // Final quality
  final_grade: QualityGrade;
  
  // Tile specifications
  width_mm?: number;
  height_mm?: number;
  thickness_mm?: number;
  weight_g?: number;
  
  created_at: string;
  updated_at: string;
}

// =============================================================================
// TILE STATION SNAPSHOTS (Künye)
// =============================================================================

export interface TileStationSnapshot {
  id: string;
  tile_id: string;
  simulation_id: string;
  
  // Station identification
  station: StationName;
  station_order: number;
  
  // Timing
  entry_sim_tick: number;
  entry_production_tick: number;
  exit_sim_tick?: number;
  processing_duration_ticks?: number;
  
  // Machine state reference
  machine_state_id: string;
  
  // Snapshot data
  parameters_snapshot: Record<string, unknown>;
  tile_measurements?: Record<string, unknown>;
  
  // Defect detection
  defect_detected: boolean;
  defect_types?: DefectType[];
  defect_severity?: number;
  scrapped_here: boolean;
  
  created_at: string;
}

// Complete tile journey (künye view)
export interface TileJourney {
  tile_id: string;
  tile_number: number;
  simulation_id: string;
  status: TileStatus;
  final_grade: QualityGrade;
  created_at_sim_tick: number;
  completed_at_sim_tick?: number;
  
  // Station snapshots
  press_params?: PressParameters;
  press_defects?: DefectType[];
  
  dryer_params?: DryerParameters;
  dryer_defects?: DefectType[];
  
  glaze_params?: GlazeParameters;
  glaze_defects?: DefectType[];
  
  printer_params?: PrinterParameters;
  printer_defects?: DefectType[];
  
  kiln_params?: KilnParameters;
  kiln_defects?: DefectType[];
  
  sorting_params?: SortingParameters;
  sorting_defects?: DefectType[];
  
  packaging_params?: PackagingParameters;
  packaging_defects?: DefectType[];
}

// =============================================================================
// PARAMETER CHANGES
// =============================================================================

export interface ParameterChangeEvent {
  id: string;
  simulation_id: string;
  
  // Timing
  sim_tick: number;
  production_tick: number;
  
  // What changed
  station: StationName;
  parameter_name: string;
  old_value?: number;
  new_value: number;
  change_magnitude?: number;
  change_pct?: number;
  
  // Change characteristics
  change_type: ChangeType;
  change_reason?: ChangeReason;
  
  // Link to scenario
  scenario_id?: string;
  
  // Impact prediction
  expected_impact?: string;
  expected_scrap_increase_pct?: number;
  
  created_at: string;
}

// =============================================================================
// DEFECT SCENARIOS
// =============================================================================

export interface TriggerCondition {
  station: StationName;
  parameter: string;
  condition: '<' | '>' | '<=' | '>=' | '=' | '!=' | 'not_between';
  threshold?: number;
  threshold_low?: number;
  threshold_high?: number;
}

export interface DefectScenario {
  id: string;
  code: string;
  name: string;
  description?: string;
  
  // Trigger
  trigger_conditions: TriggerCondition;
  
  // Cascade
  affected_stations: StationName[];
  cascade_delay_ticks?: number;
  
  // Expected outcomes
  likely_defects: DefectType[];
  scrap_probability_pct: number;
  quality_downgrade_probability_pct: number;
  
  severity: Severity;
  is_active: boolean;
  created_at: string;
}

export interface ScenarioActivation {
  id: string;
  simulation_id: string;
  scenario_id: string;
  
  // Timing
  activated_at_sim_tick: number;
  deactivated_at_sim_tick?: number;
  duration_ticks?: number;
  
  // Affected tiles
  first_affected_tile_id?: string;
  last_affected_tile_id?: string;
  affected_tile_count?: number;
  
  // Actual outcomes
  actual_scrap_count: number;
  actual_downgrade_count: number;
  
  created_at: string;
}

// =============================================================================
// PRODUCTION METRICS
// =============================================================================

export interface ProductionMetrics {
  id: string;
  simulation_id: string;
  
  // Time window
  period_start_sim_tick: number;
  period_end_sim_tick: number;
  period_start_production_tick: number;
  period_end_production_tick: number;
  
  // Production counts
  total_tiles_produced: number;
  first_quality_count: number;
  second_quality_count: number;
  third_quality_count: number;
  scrap_count: number;
  
  // OEE components
  availability_pct?: number;
  performance_pct?: number;
  quality_pct?: number;
  oee_pct?: number;
  
  // Breakdowns
  scrap_by_station?: Record<StationName, number>;
  defect_counts?: Record<DefectType, number>;
  machine_uptime?: Record<StationName, number>;
  
  created_at: string;
}

// =============================================================================
// AI ANALYSIS
// =============================================================================

export interface RootCause {
  station: StationName;
  parameter: string;
  contribution: number;  // 0-1 contribution factor
  actual_value: number;
  optimal_range: { min: number; max: number };
  deviation_pct: number;
}

export interface Recommendation {
  action: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  expected_improvement: string;
  affected_parameters: string[];
}

export interface AIAnalysisResult {
  id: string;
  simulation_id: string;
  
  // Analysis scope
  analysis_type: 'root_cause' | 'trend' | 'prediction' | 'anomaly';
  analyzed_at_sim_tick?: number;
  
  // What was analyzed
  target_tile_ids?: string[];
  target_defect_types?: DefectType[];
  time_range_start_tick?: number;
  time_range_end_tick?: number;
  
  // Findings
  root_causes?: RootCause[];
  confidence_score?: number;
  summary?: string;
  recommendations?: Recommendation[];
  
  // Metadata
  model_version?: string;
  processing_time_ms?: number;
  
  created_at: string;
}

// =============================================================================
// SIMULATOR CONFIG
// =============================================================================

export interface SimulatorConfig {
  // Timing
  tickDurationMs: number;
  productionTickRatio: number;
  stationGapProductionTicks: number;
  
  // Random parameter changes
  parameterChangeFrequency: 'low' | 'medium' | 'high';
  scenarioActivationProbability: number;  // 0-1
  
  // Initial machine parameters
  initialParameters: {
    press: Partial<PressParameters>;
    dryer: Partial<DryerParameters>;
    glaze: Partial<GlazeParameters>;
    printer: Partial<PrinterParameters>;
    kiln: Partial<KilnParameters>;
    sorting: Partial<SortingParameters>;
    packaging: Partial<PackagingParameters>;
  };
}

// =============================================================================
// CONVEYOR STATE (Runtime)
// =============================================================================

export interface ConveyorPosition {
  tile_id: string;
  current_station: StationName | 'between_stations';
  position_in_station: number;  // 0-1 progress through station
  entered_at_sim_tick: number;
  next_station?: StationName;
  ticks_until_next_station: number;
}

export interface ConveyorState {
  simulation_id: string;
  current_sim_tick: number;
  current_production_tick: number;
  tiles_on_conveyor: ConveyorPosition[];
  tiles_in_press_queue: number;
  tiles_completed: number;
  tiles_scrapped: number;
}

// =============================================================================
// SUPABASE DATABASE TYPES (for direct DB access)
// =============================================================================

export interface Database {
  public: {
    Tables: {
      simulation_sessions: {
        Row: SimulationSession;
        Insert: CreateSimulationSession;
        Update: Partial<SimulationSession>;
      };
      machine_press_states: {
        Row: MachinePressState;
        Insert: Omit<MachinePressState, 'id' | 'created_at'>;
        Update: Partial<MachinePressState>;
      };
      machine_dryer_states: {
        Row: MachineDryerState;
        Insert: Omit<MachineDryerState, 'id' | 'created_at'>;
        Update: Partial<MachineDryerState>;
      };
      machine_glaze_states: {
        Row: MachineGlazeState;
        Insert: Omit<MachineGlazeState, 'id' | 'created_at'>;
        Update: Partial<MachineGlazeState>;
      };
      machine_printer_states: {
        Row: MachinePrinterState;
        Insert: Omit<MachinePrinterState, 'id' | 'created_at'>;
        Update: Partial<MachinePrinterState>;
      };
      machine_kiln_states: {
        Row: MachineKilnState;
        Insert: Omit<MachineKilnState, 'id' | 'created_at'>;
        Update: Partial<MachineKilnState>;
      };
      machine_sorting_states: {
        Row: MachineSortingState;
        Insert: Omit<MachineSortingState, 'id' | 'created_at'>;
        Update: Partial<MachineSortingState>;
      };
      machine_packaging_states: {
        Row: MachinePackagingState;
        Insert: Omit<MachinePackagingState, 'id' | 'created_at'>;
        Update: Partial<MachinePackagingState>;
      };
      tiles: {
        Row: Tile;
        Insert: Omit<Tile, 'id' | 'tile_number' | 'created_at' | 'updated_at'>;
        Update: Partial<Tile>;
      };
      tile_station_snapshots: {
        Row: TileStationSnapshot;
        Insert: Omit<TileStationSnapshot, 'id' | 'created_at'>;
        Update: Partial<TileStationSnapshot>;
      };
      parameter_change_events: {
        Row: ParameterChangeEvent;
        Insert: Omit<ParameterChangeEvent, 'id' | 'created_at'>;
        Update: Partial<ParameterChangeEvent>;
      };
      defect_scenarios: {
        Row: DefectScenario;
        Insert: Omit<DefectScenario, 'id' | 'created_at'>;
        Update: Partial<DefectScenario>;
      };
      scenario_activations: {
        Row: ScenarioActivation;
        Insert: Omit<ScenarioActivation, 'id' | 'created_at'>;
        Update: Partial<ScenarioActivation>;
      };
      production_metrics: {
        Row: ProductionMetrics;
        Insert: Omit<ProductionMetrics, 'id' | 'created_at'>;
        Update: Partial<ProductionMetrics>;
      };
      ai_analysis_results: {
        Row: AIAnalysisResult;
        Insert: Omit<AIAnalysisResult, 'id' | 'created_at'>;
        Update: Partial<AIAnalysisResult>;
      };
    };
    Views: {
      tile_journey: {
        Row: TileJourney;
      };
      defective_tiles_analysis: {
        Row: {
          tile_id: string;
          tile_number: number;
          simulation_id: string;
          final_grade: QualityGrade;
          all_defects: DefectType[];
          scrapped_at_station?: StationName;
          all_parameters: Record<StationName, Record<string, unknown>>;
          parameter_changes_during_production?: ParameterChangeEvent[];
        };
      };
    };
    Functions: {
      get_machine_state: {
        Args: {
          p_simulation_id: string;
          p_station: StationName;
          p_sim_tick: number;
        };
        Returns: Record<string, unknown>;
      };
    };
  };
}
