/**
 * storeHelpers.ts — Shared Types, Constants, and Helpers for Data Store Slices
 *
 * This module centralizes all types, constants, and utility functions that are
 * shared across multiple slices of the simulationDataStore. By extracting these
 * into a single module, each slice file can import only what it needs without
 * creating circular dependencies.
 *
 * Contents:
 *  - SetState / GetState type aliases (for Zustand slice factories)
 *  - Exported interfaces: MachineStatus, CurrentPeriodMetrics, DefectInfo
 *  - Constants: DEFAULT_CONFIG, EMPTY_UNSYNCED
 *  - Factory functions: createEmptyMachineStateTables, createDefaultDriftLimits,
 *    createEmptyPeriodMetrics, createInitialMachineStatus, generateSessionCode
 *  - Typed accessor helpers: getStationParamValue, setStationParams,
 *    appendUnsyncedItem, filterUnsyncedItems
 *
 * Used by: sessionSlice, tileSlice, scenarioSlice, metricsSlice, syncSlice,
 *          simulationDataStore (main composition file)
 */

import type {
  StationName,
  MachineStateTables,
  CurrentMachineParams,
  AnyMachineStateRecord,
  TileRecord,
  TileSnapshotRecord,
  ParameterChangeRecord,
  ScenarioActivationRecord,
  ProductionMetricsRecord,
  AlarmLogRecord,
  ConveyorPosition,
  ConveyorStateRecord,
  ConveyorEventRecord,
  ConveyorEventType,
  DefectScenario,
  UnsyncedRecords,
  SimulationSession,
  SimulationDataConfig,
  QualityGrade,
  TileStatus,
  DefectType,
  ChangeType,
  ChangeReason,
} from '../types';
import {
  STATION_ORDER,
} from '../types';
import type { ScenarioDefinition } from '../../lib/scenarios';
import {
  createDefaultParams,
  DEFAULT_DRIFT_LIMIT_PCT,
  PARAMETER_CHANGE_CHANCE,
} from '../../lib/params';
import type {
  TickSnapshotState,
  TickSnapshotActions,
} from './tickSnapshotSlice';



// =============================================================================
// ZUSTAND SLICE TYPE ALIASES
// =============================================================================

/**
 * Zustand `set` function scoped to the full SimulationDataState.
 * Accepts a partial state or an updater function.
 */
export type SetState = {
  (
    partial:
      | SimulationDataState
      | Partial<SimulationDataState>
      | ((state: SimulationDataState) => SimulationDataState | Partial<SimulationDataState>),
    replace?: false
  ): void;
  (
    state: SimulationDataState | ((state: SimulationDataState) => SimulationDataState),
    replace: true
  ): void;
};

/**
 * Zustand `get` function returning the full SimulationDataState.
 */
export type GetState = () => SimulationDataState;

// =============================================================================
// SHARED INTERFACES (previously private to simulationDataStore.ts)
// =============================================================================

/** Runtime status of a single machine/station. */
export interface MachineStatus {
  /** Whether the machine is currently processing tiles. */
  isOperating: boolean;
  /** Optional fault code when the machine has an error. */
  faultCode?: string;
  /** Sim tick when the status was last changed. */
  lastUpdatedTick: number;
}

/** Running counters for the current metrics aggregation window. */
export interface CurrentPeriodMetrics {
  /** Sim tick when this aggregation window started. */
  periodStartTick: number;
  /** Total tiles produced in this window. */
  totalProduced: number;
  /** Count of first-quality (A-grade) tiles. */
  firstQuality: number;
  /** Count of second-quality (B-grade) tiles. */
  secondQuality: number;
  /** Count of third-quality (C-grade) tiles. */
  thirdQuality: number;
  /** Count of scrapped tiles. */
  scrap: number;
  /** Scrap counts per station (for root-cause analysis). */
  scrapByStation: Record<StationName, number>;
  /** Cumulative defect type counts in this window. */
  defectCounts: Record<string, number>;
}

/**
 * ConveyorNumericParams — live values for all conveyor parameters tracked in
 * Demo Settings. Includes both the two measurable numeric params AND the two
 * boolean toggle params that are now persisted in the data store.
 *
 * These are intentionally SEPARATE from CurrentMachineParams / StationName
 * because the conveyor has no Supabase machine-state table.
 */
export interface ConveyorNumericParams {
  /** Expected jam duration (Cycle Time units). Normal range: 6–10. */
  jammed_time: number;
  /** Number of scrap tiles produced per jam event. Normal range: 1–5. */
  impacted_tiles: number;
  /**
   * Whether speed-change events are enabled on the conveyor.
   * Persisted so that Demo Settings changes survive panel close → reopen.
   */
  speed_change: boolean;
  /**
   * Whether jam events are enabled on the conveyor.
   * Persisted so that Demo Settings changes survive panel close → reopen.
   */
  jammed_events: boolean;
  /**
   * Global probability (0–1) that a scrap-classified tile is physically
   * discarded to the recycle bin at the station where the defect was detected.
   * Adjustable via the Conveyor Settings tab in Demo Settings.
   */
  scrap_probability: number;
}

/** Information about a defect detected at a station. */
export interface DefectInfo {
  /** Whether a defect was detected. */
  detected: boolean;
  /** Types of defects detected (if any). */
  types?: DefectType[];
  /** Severity rating (0–1 scale). */
  severity?: number;
  /** Whether the tile was scrapped as a result. */
  scrapped?: boolean;
}

// =============================================================================
// UNSYNCED ITEM TYPE (for type-safe sync tracking)
// =============================================================================

/**
 * Type-safe accessor for UnsyncedRecords array items.
 * All queue types now use simple string IDs for consistency.
 */
export type UnsyncedItem = string;

// =============================================================================
// FULL STATE INTERFACE
// =============================================================================

/**
 * Full state shape for the simulation data store.
 * All slices contribute fields and actions to this unified type.
 */
export interface SimulationDataState {
  // ── Session ─────────────────────────────────────────────────────
  /** Current simulation session metadata, or null if no session is active. */
  session: SimulationSession | null;
  /** Human-readable session code (e.g., "ABC123"). */
  sessionCode: string;
  /** Configuration for data collection intervals and batch sizes. */
  config: SimulationDataConfig;

  // ── Timing (reads from master, local tracking) ──────────────────
  /** Current simulation tick (incremented each tick). */
  currentSimTick: number;
  /** Current production tick (incremented every N sim ticks). */
  currentProductionTick: number;
  /** Whether the simulation is actively running. */
  isRunning: boolean;

  // ── Machine States (Map per station, keyed by sim_tick) ─────────
  /** Per-station maps of sim_tick → machine state snapshot (used for getMachineStateAtTick queries). */
  machineStates: MachineStateTables;
  /**
   * Flat ordered array of all machine state records across all 7 stations.
   * Used for Supabase sync (same pattern as alarmLogs/metricsHistory).
   * The Map (machineStates) is kept only for tick-indexed lookup queries.
   * Ring-buffered to MAX_MACHINE_STATE_RECORDS to prevent unbounded memory growth.
   */
  machineStateRecords: AnyMachineStateRecord[];
  /** Current parameter values for each station. */
  currentParams: CurrentMachineParams;
  /** Runtime status (operating/fault) for each station. */
  machineStatus: Record<StationName, MachineStatus>;

  // ── Tiles ───────────────────────────────────────────────────────
  /** All tiles by their unique ID. */
  tiles: Map<string, TileRecord>;
  /** Reverse lookup: tile_number → tile ID. */
  tilesByNumber: Map<number, string>;
  /** Auto-increment counter for tile numbers. */
  tileCounter: number;
  /** Cumulative count of tiles that passed sorting. */
  totalTilesProduced: number;
  /** Cumulative count of scrapped tiles. */
  totalTilesScrapped: number;
  /** Cumulative count of first-quality (shipped) tiles. */
  totalFirstQuality: number;
  /** Cumulative count of second-quality tiles. */
  totalSecondQuality: number;
  /**
   * Cumulative count of tiles graded as scrap at line exit.
   * Distinct from totalTilesScrapped which tracks mid-line scraps.
   */
  totalScrapGraded: number;

  // ── Tile Snapshots (künye) ──────────────────────────────────────
  /** Per-tile arrays of station visit snapshots (tile passport data). */
  tileSnapshots: Map<string, TileSnapshotRecord[]>;

  // ── Conveyor ────────────────────────────────────────────────────
  /** Current position of each tile on the conveyor belt. */
  conveyorPositions: Map<string, ConveyorPosition>;

  /**
   * Flat ordered array of per-tick conveyor state snapshots.
   * Ring-buffered to MAX_CONVEYOR_STATE_RECORDS. Synced to conveyor_states table.
   */
  conveyorStateRecords: ConveyorStateRecord[];

  /**
   * Flat ordered array of discrete conveyor events (jams, speed changes).
   * Ring-buffered to MAX_CONVEYOR_EVENT_RECORDS. Synced to conveyor_events table.
   */
  conveyorEventRecords: ConveyorEventRecord[];

  // ── Parameter Changes ───────────────────────────────────────────
  /** Log of all parameter change events (drift, spike, scenario). */
  parameterChanges: ParameterChangeRecord[];
  /** Per-parameter drift limits (max % change per drift event). */
  parameterDriftLimits: Record<StationName, Record<string, number>>;

  // ── Conveyor Numeric Parameters ─────────────────────────────────
  /**
   * Live numeric parameters for the conveyor (separate from CurrentMachineParams
   * because conveyor has no Supabase machine-state table).
   * Tracks jammed_time and impacted_tiles, driven by Demo Settings.
   */
  conveyorNumericParams: ConveyorNumericParams;
  /**
   * Per-parameter drift limits for conveyor numeric params.
   * Same structure as parameterDriftLimits but keyed by param name directly.
   */
  conveyorDriftLimits: Record<string, number>;

  // ── Scenarios ───────────────────────────────────────────────────
  /** Scenarios loaded from configuration. */
  loadedScenarios: DefectScenario[];
  /** Currently active auto-triggered scenarios. */
  activeScenarios: Map<string, ScenarioActivationRecord>;
  /** History of all scenario activations/deactivations. */
  scenarioHistory: ScenarioActivationRecord[];

  // ── Scenario State (user-loaded scenarios from DemoSettingsPanel) ──
  /** Currently active scenario loaded via DemoSettingsPanel, or null. */
  activeScenario: ScenarioDefinition | null;
  /** ID of the active ScenarioActivationRecord for the loaded scenario. */
  activeScenarioActivationId: string | null;

  // ── Metrics ─────────────────────────────────────────────────────
  /** Running counters for the current metrics period. */
  currentPeriodMetrics: CurrentPeriodMetrics;
  /** Completed metrics records (one per aggregation window). */
  metricsHistory: ProductionMetricsRecord[];

  // ── Alarm Logs (synced to Supabase per-session) ─────────────────
  /** Alarm events queued for Supabase sync. */
  alarmLogs: AlarmLogRecord[];

  // ── TickSnapshot Ring Buffer (Phase 2 — Simulate-Ahead) ─────────
  /**
   * Fixed-size ring buffer holding TickSnapshot records.
   * Produced by moveTilesOnConveyor, consumed by the visual engine (Phase 3).
   */
  tickSnapshotBuffer: TickSnapshotState['tickSnapshotBuffer'];
  /** Write cursor — next index to write to in the buffer. */
  tickSnapshotWriteIndex: number;
  /** Read cursor — next index to consume from the buffer. */
  tickSnapshotReadIndex: number;
  /** Total snapshots written (monotonically increasing). */
  tickSnapshotWriteCount: number;
  /** Total snapshots consumed (monotonically increasing). */
  tickSnapshotReadCount: number;

  // ── Heartbeat ───────────────────────────────────────────────────
  /** Handle for the periodic heartbeat interval, or null when inactive. */
  heartbeatInterval: ReturnType<typeof setInterval> | null;

  // ── Usage Analytics ─────────────────────────────────────────────
  /** Handle for the current usage_log row (logId + connectedAt), or null. */
  usageLogHandle: { logId: string; connectedAt: string } | null;

  // ── Sync Tracking ───────────────────────────────────────────────
  /** Records waiting to be batch-synced to Supabase. */
  unsyncedRecords: UnsyncedRecords;

  // ── Actions ─────────────────────────────────────────────────────

  // Session lifecycle
  /** Create a new simulation session (persists to Supabase if available). */
  startSession: (name: string, description?: string) => Promise<void>;
  /** Pause the current session. */
  pauseSession: () => Promise<void>;
  /** Resume a paused session. */
  resumeSession: () => Promise<void>;
  /** End and finalize the current session. */
  endSession: () => Promise<void>;
  /** Start periodic heartbeat that refreshes session updated_at in Supabase. */
  startHeartbeat: () => void;
  /** Stop the periodic heartbeat and clear the interval. */
  stopHeartbeat: () => void;
  /** Reset all store state to initial values. */
  resetDataStore: () => void;

  // Core tick (called by external orchestrator or interval)
  /** Execute one simulation step: record states, move tiles, check scenarios. */
  tick: () => void;

  // Machine state recording
  /** Snapshot a station's parameters at a given tick. Returns the record ID. */
  recordMachineState: (
    station: StationName,
    simTick: number,
    productionTick: number
  ) => string;

  // Tile management
  /** Create a new tile and place it at press. Returns null if session inactive. */
  createTile: (simTick: number, productionTick: number) => TileRecord | null;
  /** Update the lifecycle status of a tile. */
  updateTileStatus: (tileId: string, status: TileStatus) => void;
  /** Assign a quality grade to a tile at sorting. */
  setTileGrade: (tileId: string, grade: QualityGrade) => void;
  /** Mark a tile as scrapped at a specific station with defect types. */
  scrapTile: (tileId: string, station: StationName, defects: DefectType[]) => void;

  // Snapshot (künye) recording
  /** Record a tile's visit to a station. Returns the snapshot ID. */
  recordTileSnapshot: (
    tileId: string,
    station: StationName,
    simTick: number,
    productionTick: number,
    machineStateId: string | null,
    defectInfo?: DefectInfo
  ) => string;

  // Conveyor movement
  /** Advance all tiles on the conveyor by one step. */
  moveTilesOnConveyor: (simTick: number, productionTick: number) => void;

  // Parameter changes
  /** Record a parameter change event. Returns the record ID. */
  recordParameterChange: (
    station: StationName,
    parameterName: string,
    oldValue: number,
    newValue: number,
    simTick: number,
    productionTick: number,
    changeType: ChangeType,
    changeReason?: ChangeReason,
    scenarioId?: string
  ) => string;

  /** Apply a new parameter value and record the change event. */
  updateParameter: (
    station: StationName,
    parameterName: string,
    newValue: number,
    changeType: ChangeType,
    changeReason?: ChangeReason
  ) => void;

  /** Update the drift limit for a specific parameter. */
  updateDriftLimit: (
    station: StationName,
    parameterName: string,
    driftLimitPct: number
  ) => void;

  /** Reset all parameters and drift limits to factory defaults. */
  resetToFactoryDefaults: () => void;

  /**
   * Update a single conveyor numeric or boolean param value.
   * @param paramName - 'jammed_time' or 'impacted_tiles'
   * @param newValue  - The new numeric value
   */
  updateConveyorParam: (paramName: keyof ConveyorNumericParams, newValue: number) => void;

  /**
   * Update a boolean conveyor param (speed_change or jammed_events).
   * Persists the toggle state in the store so it survives panel close → reopen.
   * @param paramName - 'speed_change' or 'jammed_events'
   * @param newValue  - The new boolean value
   */
  updateConveyorBoolParam: (paramName: 'speed_change' | 'jammed_events', newValue: boolean) => void;

  /**
   * Update the drift limit for a specific conveyor numeric parameter.
   * @param paramName     - 'jammed_time' or 'impacted_tiles'
   * @param driftLimitPct - New drift limit (0–100%)
   */
  updateConveyorDriftLimit: (paramName: keyof ConveyorNumericParams, driftLimitPct: number) => void;

  // Conveyor analytics recording
  /**
   * Record a per-tick snapshot of the conveyor belt state.
   * Reads conveyorSpeed, conveyorStatus, faultCount, and totalPartsRef from
   * simulationStore. Appends to conveyorStateRecords and queues ID for sync.
   * @param simTick        - Current S-Clock tick
   * @param productionTick - Current P-Clock tick
   */
  recordConveyorState: (simTick: number, productionTick: number) => void;

  /**
   * Record a discrete conveyor event (jam, speed change, status transition).
   * Called when simulationStore transitions conveyorStatus or conveyorSpeed.
   * @param simTick        - S-Clock tick when the event occurred
   * @param productionTick - P-Clock tick at event time
   * @param eventType      - Type of event ('jam_start' | 'jam_cleared' | 'speed_change' | 'status_change')
   * @param oldValue       - Previous value (null if unavailable)
   * @param newValue       - New value after the event
   */
  recordConveyorEvent: (
    simTick: number,
    productionTick: number,
    eventType: ConveyorEventType,
    oldValue: string | null,
    newValue: string
  ) => void;

  // Scenarios (automatic trigger-based)
  /** Check scenario triggers and activate matching ones. */
  checkAndActivateScenarios: (simTick: number) => void;
  /** Deactivate a specific scenario. */
  deactivateScenario: (scenarioId: string, simTick: number) => void;

  // Scenario Actions (user-loaded scenarios)
  /** Load a scenario: apply overrides, set drift limits, create activation record. */
  loadScenario: (scenario: ScenarioDefinition) => void;
  /** Get total defect probability across all stations under active scenario. */
  getScenarioDefectProbability: () => number;
  /** Get defect types for a station under the active scenario. */
  getScenarioDefectTypes: (station: StationName) => { defectType: DefectType; probability_pct: number }[];

  // Metrics
  /** Finalize and archive the current metrics period. */
  finalizePeriodMetrics: (simTick: number, productionTick: number) => void;

  // Alarm log recording (queues for Supabase sync)
  /** Record an alarm event scoped to the active session. */
  recordAlarm: (params: {
    type: string;
    severity: string;
    stationId?: string;
    message?: string;
  }) => void;

  // Sync
  /** Mark a record for Supabase sync by its string ID. */
  markForSync: (type: keyof UnsyncedRecords, id: string) => void;
  /** Get all unsynced records organized by type. */
  getUnsyncedData: () => {
    machineStates: Record<StationName, AnyMachineStateRecord[]>;
    tiles: TileRecord[];
    /** Captured syncVersion per tile at read time — used by markAsSynced for version checks. */
    tileSyncVersions: Map<string, number>;
    snapshots: TileSnapshotRecord[];
    parameterChanges: ParameterChangeRecord[];
    scenarios: ScenarioActivationRecord[];
    metrics: ProductionMetricsRecord[];
    alarmLogs: AlarmLogRecord[];
    /** Per-tick conveyor state snapshots pending Supabase sync. */
    conveyorStates: ConveyorStateRecord[];
    /** Discrete conveyor event records pending Supabase sync. */
    conveyorEvents: ConveyorEventRecord[];
  };
  /** Remove synced records from the tracking queue. */
  markAsSynced: (type: keyof UnsyncedRecords, ids: string[], syncVersions?: Map<string, number>) => void;

  // Queries
  /** Look up a tile by its unique ID. */
  getTileById: (id: string) => TileRecord | undefined;
  /** Look up a tile by its sequential number. */
  getTileByNumber: (number: number) => TileRecord | undefined;
  /** Get all station visit snapshots for a tile. */
  getTileSnapshots: (tileId: string) => TileSnapshotRecord[];
  /** Remove synced completed/scrapped tiles from Maps to bound memory growth. */
  pruneCompletedTiles: () => void;
  /**
   * Fast-forward all tiles on the logical conveyor to completion.
   * Called when the simulation stops to ensure ON_BELT reaches 0 and all
   * tiles are graded before the simulation is finalized.
   */
  drainConveyor: () => void;
  /** Get a machine state snapshot for a station at a specific tick. */
  getMachineStateAtTick: (station: StationName, simTick: number) => AnyMachineStateRecord | undefined;
  /** Get recent parameter change events, optionally filtered by station. */
  getRecentParameterChanges: (station?: StationName, limit?: number) => ParameterChangeRecord[];

  // ── TickSnapshot Ring Buffer (Phase 2) ──────────────────────────
  /** Write a TickSnapshot into the ring buffer. */
  pushTickSnapshot: TickSnapshotActions['pushTickSnapshot'];
  /** Read and advance the consumer pointer. Returns null if empty. */
  consumeTickSnapshot: TickSnapshotActions['consumeTickSnapshot'];
  /** Read without advancing. Returns null if empty. */
  peekTickSnapshot: TickSnapshotActions['peekTickSnapshot'];
  /** Count of unconsumed snapshots in the buffer. */
  getBufferedCount: TickSnapshotActions['getBufferedCount'];
  /** Reset the ring buffer (on session start/reset). */
  clearTickSnapshots: TickSnapshotActions['clearTickSnapshots'];
}

// =============================================================================
// CONSTANTS
// =============================================================================

/** Default configuration for the data store. */
export const DEFAULT_CONFIG: SimulationDataConfig = {
  /** Milliseconds between simulation ticks. */
  tickDurationMs: 500,
  /** How many sim ticks per production tick. */
  productionTickRatio: 2,
  /** Gap between station positions in production ticks. */
  stationGapProductionTicks: 2,
  /** Number of ticks per metrics aggregation window. */
  metricsPeriodTicks: 100,
  /** Maximum records per Supabase batch write. */
  syncBatchSize: 50,
  /** Probability of a random parameter drift per tick. */
  parameterChangeChance: PARAMETER_CHANGE_CHANCE,
};

/** Empty unsynced records structure — used for initialization and resets. */
export const EMPTY_UNSYNCED: UnsyncedRecords = {
  machineStates: [],
  tiles: [],
  snapshots: [],
  parameterChanges: [],
  scenarios: [],
  metrics: [],
  alarmLogs: [],
  /** Conveyor state snapshot IDs queued for Supabase sync. */
  conveyorStates: [],
  /** Conveyor event IDs queued for Supabase sync. */
  conveyorEvents: [],
};

// =============================================================================
// FACTORY / HELPER FUNCTIONS
// =============================================================================

/**
 * Create empty machine state tables (one empty Map per station).
 * Used during session start and store reset.
 */
export function createEmptyMachineStateTables(): MachineStateTables {
  return {
    press: new Map(),
    dryer: new Map(),
    glaze: new Map(),
    printer: new Map(),
    kiln: new Map(),
    sorting: new Map(),
    packaging: new Map(),
  };
}

/**
 * Create default per-parameter drift limits (max % change per drift event).
 * All parameters start at DEFAULT_DRIFT_LIMIT_PCT (0% for SCN-000).
 */
export function createDefaultDriftLimits(): Record<StationName, Record<string, number>> {
  const result = {} as Record<StationName, Record<string, number>>;
  const defaultParams = createDefaultParams();

  for (const station of STATION_ORDER) {
    result[station] = {};
    const params = defaultParams[station] as Record<string, unknown>;
    for (const key of Object.keys(params)) {
      result[station][key] = DEFAULT_DRIFT_LIMIT_PCT;
    }
  }

  return result;
}

/**
 * Create an empty period metrics accumulator.
 * @param startTick - Sim tick marking the start of this aggregation window (default: 0).
 */
export function createEmptyPeriodMetrics(startTick: number = 0): CurrentPeriodMetrics {
  return {
    periodStartTick: startTick,
    totalProduced: 0,
    firstQuality: 0,
    secondQuality: 0,
    thirdQuality: 0,
    scrap: 0,
    scrapByStation: {
      press: 0, dryer: 0, glaze: 0, printer: 0, kiln: 0, sorting: 0, packaging: 0,
    },
    defectCounts: {},
  };
}

/**
 * Create initial machine status for all stations.
 * All stations start as operating with no fault codes.
 */
export function createInitialMachineStatus(): Record<StationName, MachineStatus> {
  const status: Partial<Record<StationName, MachineStatus>> = {};
  for (const station of STATION_ORDER) {
    status[station] = {
      isOperating: true,
      lastUpdatedTick: 0,
    };
  }
  return status as Record<StationName, MachineStatus>;
}

/**
 * Generate a 6-character alphanumeric session code locally.
 * Used ONLY as a fallback when Supabase is unavailable.
 * The primary source of session codes is the DB's `generate_session_code()` function.
 * Characters I, O, 0, 1 are excluded to avoid visual confusion.
 */
export function generateSessionCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// =============================================================================
// TYPED ACCESSOR HELPERS
// =============================================================================

/**
 * Read a numeric parameter value from a station's parameter object by dynamic key.
 * Uses `Record<string, unknown>` instead of `any` for narrower type safety.
 *
 * @param params - The parameter object for a specific station (e.g., press, kiln)
 * @param key    - The parameter name to read (e.g., 'pressure_bar')
 * @returns The numeric value, or undefined if the key does not exist
 */
export function getStationParamValue(
  params: Record<string, unknown>,
  key: string,
): number | undefined {
  const value = params[key];
  return typeof value === 'number' ? value : undefined;
}

/**
 * Spread-merge a station's parameter object with an update patch.
 * Returns a new object with the station key replaced.
 *
 * @param currentParams - Full CurrentMachineParams object (all stations)
 * @param station       - The station name to update
 * @param patch         - Key-value overrides to apply
 * @returns A new CurrentMachineParams-shaped object with the updated station
 */
export function setStationParams(
  currentParams: CurrentMachineParams,
  station: StationName,
  patch: Record<string, unknown>,
): CurrentMachineParams {
  return {
    ...currentParams,
    [station]: {
      ...currentParams[station],
      ...patch,
    },
  };
}

/**
 * Append a string ID to an UnsyncedRecords array by key.
 *
 * All queue types use simple string IDs. Previously machineStates used
 * compound objects ({ station, simTick, id }) but this caused Map lookup
 * failures in getUnsyncedData(). Now all queues use the same string-ID pattern.
 *
 * @param records - The current UnsyncedRecords object
 * @param type    - The record type key (e.g. 'tiles', 'machineStates')
 * @param item    - The string ID to append
 * @returns A new UnsyncedRecords with the item appended
 */
export function appendUnsyncedItem(
  records: UnsyncedRecords,
  type: keyof UnsyncedRecords,
  item: UnsyncedItem,
): UnsyncedRecords {
  return {
    ...records,
    // All queue arrays contain string IDs; cast is safe since UnsyncedItem = string.
    [type]: [...(records[type] as string[]), item],
  };
}

/**
 * Filter items from an UnsyncedRecords array by IDs to remove.
 *
 * @param records     - The current UnsyncedRecords object
 * @param type        - The record type key (e.g. 'tiles', 'machineStates')
 * @param idsToRemove - Array of string IDs to exclude
 * @returns A new UnsyncedRecords with matching items removed
 */
export function filterUnsyncedItems(
  records: UnsyncedRecords,
  type: keyof UnsyncedRecords,
  idsToRemove: string[],
): UnsyncedRecords {
  return {
    ...records,
    // All queue arrays are string[] — filter out the synced IDs directly.
    [type]: (records[type] as string[]).filter((id) => !idsToRemove.includes(id)),
  };
}
