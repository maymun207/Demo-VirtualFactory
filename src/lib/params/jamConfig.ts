/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  jamConfig.ts — Station-Specific Jam Configuration                      ║
 * ║                                                                          ║
 * ║  Defines the jam location types, probability weights, t-positions,      ║
 * ║  and helper functions for the station-specific jam system.               ║
 * ║                                                                          ║
 * ║  When a jam event fires, a random station (or the conveyor belt         ║
 * ║  itself) is selected as the jam location. The probability distribution  ║
 * ║  heavily weights Kiln (40%) and Dryer (40%) as they are the most        ║
 * ║  jam-prone stations in a real ceramic tile factory, with the remaining  ║
 * ║  20% split across the other 6 locations.                                ║
 * ║                                                                          ║
 * ║  Exports:                                                                ║
 * ║    - JamLocation type — union of 8 possible jam locations               ║
 * ║    - JAM_LOCATIONS — ordered array of all locations                      ║
 * ║    - JAM_LOCATION_WEIGHTS — probability weight per location             ║
 * ║    - JAM_LOCATION_T_POSITIONS — spline t for each location              ║
 * ║    - JAM_LOCATION_DISPLAY_NAMES — human-readable station names          ║
 * ║    - selectJamLocation() — weighted random location picker              ║
 * ║    - isQueueStation() — true for dryer/kiln (FIFO queue stations)       ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */

import { STATION_STAGES } from './simulation';

// ═══════════════════════════════════════════════════════════════════
// TYPES — All possible jam locations in the factory
// ═══════════════════════════════════════════════════════════════════

/**
 * JamLocation — Union of all 8 possible locations where a conveyor jam
 * can be assigned. 7 stations + 1 conveyor belt position.
 */
export type JamLocation =
    | 'press'
    | 'dryer'
    | 'glaze'
    | 'digital_print'
    | 'kiln'
    | 'sorting'
    | 'packaging'
    | 'conveyor';

/**
 * Ordered array of all jam locations, used for iteration and weighted
 * selection. The order matches STATION_STAGES indices where applicable.
 */
export const JAM_LOCATIONS: readonly JamLocation[] = [
    'press',
    'dryer',
    'glaze',
    'digital_print',
    'kiln',
    'sorting',
    'packaging',
    'conveyor',
] as const;

// ═══════════════════════════════════════════════════════════════════
// PROBABILITY WEIGHTS — How likely each location is to be selected
// ═══════════════════════════════════════════════════════════════════

/**
 * Kiln and Dryer are the most jam-prone stations in a real factory
 * due to thermal stress and mechanical complexity. They each receive
 * 40% of jam events. The remaining 20% is distributed equally across
 * the other 6 locations (~3.33% each).
 *
 * Total: 0.40 + 0.40 + 6 × 0.0333... = 1.0
 */
const REMAINING_WEIGHT = 0.20 / 6; // ≈ 0.03333

/**
 * JAM_LOCATION_WEIGHTS — Probability weight for each jam location.
 * Weights MUST sum to 1.0 (validated by unit tests).
 */
export const JAM_LOCATION_WEIGHTS: Readonly<Record<JamLocation, number>> = {
    press: REMAINING_WEIGHT,  // ~3.3%
    dryer: 0.40,              // 40% — high thermal jam risk
    glaze: REMAINING_WEIGHT,  // ~3.3%
    digital_print: REMAINING_WEIGHT,  // ~3.3%
    kiln: 0.40,              // 40% — high thermal jam risk
    sorting: REMAINING_WEIGHT,  // ~3.3%
    packaging: REMAINING_WEIGHT,  // ~3.3%
    conveyor: REMAINING_WEIGHT,  // ~3.3%
} as const;

// ═══════════════════════════════════════════════════════════════════
// T-POSITIONS — Where on the conveyor spline each location sits
// ═══════════════════════════════════════════════════════════════════

/**
 * Midpoint t-position between Digital Print (t=0.19040) and Kiln (t=0.29288).
 * Used as the "conveyor" jam location — a belt-only jam not at any station.
 */
const CONVEYOR_JAM_T = (STATION_STAGES[3] + STATION_STAGES[4]) / 2; // ≈ 0.24164

/**
 * JAM_LOCATION_T_POSITIONS — Normalised spline t-value for each jam location.
 * These are the points where tiles will be intercepted and scrapped during
 * a Phase 1 jam_scrapping event.
 */
export const JAM_LOCATION_T_POSITIONS: Readonly<Record<JamLocation, number>> = {
    press: STATION_STAGES[0],  // 0.01474
    dryer: STATION_STAGES[1],  // 0.07324
    glaze: STATION_STAGES[2],  // 0.13183
    digital_print: STATION_STAGES[3],  // 0.19040
    kiln: STATION_STAGES[4],  // 0.29288
    sorting: STATION_STAGES[5],  // 0.35147
    packaging: STATION_STAGES[6],  // 0.43933
    conveyor: CONVEYOR_JAM_T,     // ≈ 0.21236 (midpoint Glaze↔Kiln)
} as const;

// ═══════════════════════════════════════════════════════════════════
// DISPLAY NAMES — Human-readable names for alarm messages and UI
// ═══════════════════════════════════════════════════════════════════

/**
 * JAM_LOCATION_DISPLAY_NAMES — User-facing station names used in alarm
 * messages like "JAM START at Digital Print".
 */
export const JAM_LOCATION_DISPLAY_NAMES: Readonly<Record<JamLocation, string>> = {
    press: 'Press',
    dryer: 'Dryer',
    glaze: 'Glaze/Color',
    digital_print: 'Digital Print',
    kiln: 'Kiln',
    sorting: 'Sorting',
    packaging: 'Packaging',
    conveyor: 'Conveyor Belt',
} as const;

// ═══════════════════════════════════════════════════════════════════
// TOLERANCE — How close a tile must be to the jam t-position to be
// intercepted during Phase 1 (belt-station scrapping)
// ═══════════════════════════════════════════════════════════════════

/**
 * JAM_INTERCEPT_TOLERANCE — Half-width of the t-window around the jam
 * location. A tile is intercepted when:
 *   |tile.t - jamLocationT| <= JAM_INTERCEPT_TOLERANCE
 *
 * Set to half the station spacing (~0.029) to avoid missing tiles that
 * pass through at high speed, but narrow enough to prevent false matches
 * with adjacent stations.
 */
export const JAM_INTERCEPT_TOLERANCE = 0.029;

// ═══════════════════════════════════════════════════════════════════
// HELPERS — Utility functions for jam location selection
// ═══════════════════════════════════════════════════════════════════

/**
 * selectJamLocation — Weighted random selection of a jam location.
 *
 * Uses the cumulative-weight roulette-wheel algorithm:
 *   1. Roll a uniform random number r ∈ [0, 1)
 *   2. Walk through locations, accumulating weights
 *   3. Return the first location whose cumulative weight exceeds r
 *
 * @returns The selected JamLocation based on configured probabilities
 */
export function selectJamLocation(): JamLocation {
    /** Roll a uniform random value between 0 and 1 */
    const r = Math.random();

    /** Accumulate weights until we exceed the roll */
    let cumulative = 0;
    for (const loc of JAM_LOCATIONS) {
        cumulative += JAM_LOCATION_WEIGHTS[loc];
        if (r < cumulative) return loc;
    }

    /**
     * Fallback: return last location if floating-point rounding
     * causes the loop to complete without returning (extremely rare).
     */
    return JAM_LOCATIONS[JAM_LOCATIONS.length - 1];
}

/**
 * isQueueStation — Returns true if the given jam location is a FIFO
 * queue station (Dryer or Kiln). Queue stations scrap tiles directly
 * from their internal queue rather than intercepting belt arrivals.
 *
 * @param location - The jam location to check
 * @returns true if the location is 'dryer' or 'kiln'
 */
export function isQueueStation(location: JamLocation): boolean {
    return location === 'dryer' || location === 'kiln';
}
