/**
 * ╔═══════════════════════════════════════════════════════════════════╗
 * ║  BARREL RE-EXPORT — Centralizes all domain sub-module exports   ║
 * ║  into a single import path: `from '../lib/params'`.             ║
 * ║                                                                   ║
 * ║  Sub-modules (alphabetical):                                      ║
 * ║    alarms · bufferLimits · conveyorBehaviour · data · demo        ║
 * ║    energy · geometry · logging · machineParams · scene            ║
 * ║    simulation · sync · ui · visuals                               ║
 * ╚═══════════════════════════════════════════════════════════════════╝
 */

export * from './alarms';
export * from './bufferLimits';
/** Tuning constants for the Conveyor Behaviour Engine (useConveyorBehaviour) */
export * from './conveyorBehaviour';
export * from './data';
export * from './demo';
export * from './energy';
export * from './geometry';
export * from './logging';
export * from './machineParams';
export * from './scene';
export * from './simulation';
export * from './sync';
export * from './ui';
export * from './oee';
export * from './scrapConfig';
export * from './visuals';
/** Station-specific jam location types, weights, and helpers */
export * from './jamConfig';
/** OEE Hierarchy Table configuration: labels, thresholds, perspective, animation */
export * from './oeeHierarchyTable';
/** CWF command queue: auth code, parameter ranges, validation helpers */
export * from './cwfCommands';
/** UI Telemetry queue config + CWF UI action types, ACK timing, and sentinel values */
export * from './uiTelemetry';
/** SubHeaderPanel layout constants: height, resize debounce, z-index */
export * from './subHeaderPanel';
