/**
 * simulator.ts — Core Simulator Type Definitions
 *
 * Public re-export barrel for all simulation-related types.
 * Matches the ANTIGRAVITY_OPUS_PROMPT.md specification (line 40):
 *   "1. src/types/simulator.ts ← İlk bu (type definitions)"
 *
 * The canonical type definitions live in `src/store/types.ts` (Zustand record
 * types with `synced: boolean` flags). This file re-exports them so that
 * consumers outside the store layer can import from a clean path:
 *
 *   import type { StationName, TileRecord } from '@/types/simulator';
 *
 * @module types/simulator
 */

// =============================================================================
// ENUMS & LITERAL TYPES
// =============================================================================

export type {
  StationName,
  DefectType,
  QualityGrade,
  TileStatus,
  SimulationStatus,
  ChangeType,
  ChangeReason,
  DryingRate,
  Severity,
} from '../store/types';

export {
  STATION_ORDER,
  STATION_ORDER_MAP,
} from '../store/types';

// =============================================================================
// SIMULATION SESSION
// =============================================================================

export type { SimulationSession } from '../store/types';

// =============================================================================
// MACHINE STATE RECORDS
// =============================================================================

export type {
  MachineStateRecord,
  PressStateRecord,
  DryerStateRecord,
  GlazeStateRecord,
  PrinterStateRecord,
  KilnStateRecord,
  SortingStateRecord,
  PackagingStateRecord,
  AnyMachineStateRecord,
  MachineStateTables,
} from '../store/types';

// =============================================================================
// MACHINE PARAMETERS (Live values)
// =============================================================================

export type {
  PressParams,
  DryerParams,
  GlazeParams,
  PrinterParams,
  KilnParams,
  SortingParams,
  PackagingParams,
  CurrentMachineParams,
} from '../store/types';

// =============================================================================
// TILES & KÜNYE (Tile Journey)
// =============================================================================

export type {
  TileRecord,
  TileSnapshotRecord,
  ConveyorPosition,
} from '../store/types';

// =============================================================================
// EVENTS & METRICS
// =============================================================================

export type {
  ParameterChangeRecord,
  ScenarioActivationRecord,
  ProductionMetricsRecord,
} from '../store/types';

// =============================================================================
// SYNC TRACKING
// =============================================================================

export type { UnsyncedRecords } from '../store/types';
