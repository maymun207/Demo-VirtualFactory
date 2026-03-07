/**
 * energyConfig.ts — Energy Consumption Calculation Engine
 *
 * Pure function that calculates the instantaneous energy consumption
 * (kWh or m³) for a single station based on:
 *  - Station-specific base consumption and speed sensitivity
 *  - Current conveyor speed relative to the speed range
 *  - Whether the station is occupied by a tile
 *  - Whether the production line is running
 *
 * Speed → Consumption Mapping:
 *   ┌─────────────────────────────────────────────────────────┐
 *   │  Speed ≤ min  →  multiplier = 1 + minEffect            │
 *   │  Speed ≥ max  →  multiplier = 1 + maxEffect            │
 *   │  min < speed < base → linear interpolation (min → base) │
 *   │  base < speed < max → linear interpolation (base → max) │
 *   └─────────────────────────────────────────────────────────┘
 *
 * Idle behavior:
 *   - Factory stopped (isRunning=false): base × idleFactor
 *   - Station unoccupied (no tile): baseWithSpeed × idleFactor
 *   - Station occupied: full baseWithSpeed consumption
 *
 * All configuration data (base, minEffect, maxEffect, idleFactor) lives
 * in params.ts under ENERGY_CONFIG.
 *
 * Used by: kpiCalculations.ts → calculateEnergy()
 */
import type { ConsumptionParams } from './params';
import { SPEED_RANGE } from './params';

/**
 * Calculate instantaneous energy consumption for one station.
 *
 * @param params       - Station-specific consumption parameters
 *                       { base: kWh or m³, minEffect: %, maxEffect: %, idleFactor: % }
 * @param currentSpeed - Current conveyor speed (within CONVEYOR_SPEED_RANGE)
 * @param isOccupied   - Whether a tile is currently at this station's position
 * @param isRunning    - Whether the entire production line is running
 * @returns Instantaneous consumption value (kWh or m³ depending on config)
 *
 * @example
 * ```ts
 * // Kiln with tile present at speed 1.5:
 * calculateConsumption(
 *   { base: 100, minEffect: 0, maxEffect: 0, idleFactor: 0.8 },
 *   1.5,    // currentSpeed
 *   true,   // tile present
 *   true,   // factory running
 * );
 * // → 100 (kiln has no speed effect, so multiplier = 1.0)
 *
 * // Same kiln, factory stopped:
 * calculateConsumption(same_params, 1.5, false, false);
 * // → 100 × 0.8 = 80 (idle consumption)
 * ```
 */
export const calculateConsumption = (
  params: ConsumptionParams,
  currentSpeed: number,
  isOccupied: boolean,
  isRunning: boolean
): number => {
  // Factory not running → flat idle consumption
  if (!isRunning) return params.base * params.idleFactor;

  // ── Calculate speed-dependent multiplier ──────────────────────
  let multiplier = 1;

  if (currentSpeed <= SPEED_RANGE.min) {
    // At or below minimum speed: apply full minEffect
    multiplier = 1 + params.minEffect;
  } else if (currentSpeed >= SPEED_RANGE.max) {
    // At or above maximum speed: apply full maxEffect
    multiplier = 1 + params.maxEffect;
  } else if (currentSpeed < SPEED_RANGE.base) {
    // Below base speed: linearly interpolate between minEffect and 0
    const t = (currentSpeed - SPEED_RANGE.min) / (SPEED_RANGE.base - SPEED_RANGE.min);
    multiplier = 1 + params.minEffect * (1 - t);
  } else {
    // Above base speed: linearly interpolate between 0 and maxEffect
    const t = (currentSpeed - SPEED_RANGE.base) / (SPEED_RANGE.max - SPEED_RANGE.base);
    multiplier = 1 + params.maxEffect * t;
  }

  // ── Apply occupancy factor ─────────────────────────────────────
  const baseWithSpeed = params.base * multiplier;
  return isOccupied ? baseWithSpeed : baseWithSpeed * params.idleFactor;
};
