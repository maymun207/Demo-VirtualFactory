/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  conveyorBehaviour.ts — Tuning Constants for the Conveyor Behaviour    ║
 * ║  Engine                                                                 ║
 * ║                                                                          ║
 * ║  All numeric parameters that govern the automatic speed-change and      ║
 * ║  jam-injection logic in `useConveyorBehaviour` are defined here.        ║
 * ║  Nothing is hard-coded inside the hook — every magic number lives here. ║
 * ║                                                                          ║
 * ║  Constants are grouped by concern:                                       ║
 * ║    • CB_SPEED_*   — speed-fluctuation parameters                         ║
 * ║    • CB_JAM_*     — jam-injection & auto-clear parameters                ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */

// ═══════════════════════════════════════════════════════════════════
// SPEED CHANGE — Parameters for the conveyor speed fluctuation logic
// ═══════════════════════════════════════════════════════════════════

/**
 * How many P-clock ticks must elapse between each speed re-evaluation.
 * e.g. 3 means the speed is reconsidered every 3rd produced tile.
 * Lower → more frequent fluctuations.
 */
export const CB_SPEED_CHECK_INTERVAL_P = 3;

/**
 * Minimum absolute speed delta applied on a speed-change tick.
 * The actual delta is chosen uniformly in [CB_SPEED_DELTA_MIN, CB_SPEED_DELTA_MAX].
 * Unit: same as conveyorSpeed (0–2 scale in simulationStore).
 */
export const CB_SPEED_DELTA_MIN = 0.1;

/**
 * Maximum absolute speed delta applied on a speed-change tick.
 * Larger values create more dramatic speed swings.
 */
export const CB_SPEED_DELTA_MAX = 0.4;

/**
 * Probability (0–1) that the speed actually changes on a speed-check tick.
 * 1.0 = changes every check; 0.5 = changes half the time.
 * Keeps the fluctuation intermittent and realistic.
 */
export const CB_SPEED_CHANGE_PROBABILITY = 0.6;

// ═══════════════════════════════════════════════════════════════════
// JAM INJECTION — Parameters for automatic jam-event triggering
// ═══════════════════════════════════════════════════════════════════

/**
 * How many P-clock ticks must elapse between each jam-eligibility check.
 * e.g. 5 means the engine checks for a new jam every 5th tile produced.
 */
export const CB_JAM_CHECK_INTERVAL_P = 5;

/**
 * Probability (0–1) that a jam fires on each jam-check tick,
 * provided the cooldown has expired and jammedEvents is active.
 * Drives the realistic, stochastic nature of jam events.
 */
export const CB_JAM_PROBABILITY_PER_CHECK = 0.25;

/**
 * How many P-clock ticks a jam lasts before the engine auto-clears it.
 * Equivalent to `jammedTime / stationInterval` in scenario terms.
 * The hook scales this value by `conveyorSettings.jammedTime` at runtime
 * so that SCN-003 (jammedTime=100) jams last longer than SCN-001 (jammedTime=20).
 */
export const CB_JAM_BASE_DURATION_P = 2;

/**
 * Scale factor: effective jam duration (in P-ticks) =
 *   CB_JAM_BASE_DURATION_P + floor(jammedTime * CB_JAM_DURATION_SCALE).
 * Mapping: SCN-001 jammedTime=20 → +1, SCN-003 jammedTime=100 → +5.
 */
export const CB_JAM_DURATION_SCALE = 0.05;

/**
 * Minimum number of P-clock ticks that MUST pass after a jam clears
 * before another jam can be triggered.
 * Prevents back-to-back jams that would make the simulation feel broken.
 */
export const CB_POST_JAM_COOLDOWN_P = 8;

// ═══════════════════════════════════════════════════════════════════
// NORMAL OPERATING RANGES — shown in the Range column of the Conveyor table
// ═══════════════════════════════════════════════════════════════════

/**
 * Normal (healthy) operating range for jam duration in Cycle Time units.
 * Values inside this range are routine; values above trigger range alerts.
 * Min=6 represents the shortest plausible jam; Max=10 is the baseline target.
 */
export const CB_JAMMED_TIME_NORMAL_RANGE = { min: 6, max: 10 } as const;

/**
 * Normal (healthy) operating range for the number of scrap tiles per jam event.
 * Values inside this range are acceptable; values above are anomalies.
 * Min=1 reflects single-tile scrap at baseline; Max=5 is the tolerance ceiling.
 */
export const CB_IMPACTED_TILES_NORMAL_RANGE = { min: 1, max: 5 } as const;
