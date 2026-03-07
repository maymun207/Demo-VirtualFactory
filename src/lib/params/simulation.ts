/**
 * ╔═══════════════════════════════════════════════════════════════════╗
 * ║  SIMULATION — Core timing, station layout, jam behaviour,       ║
 * ║  tolerance thresholds, and tile lifecycle positions.             ║
 * ║                                                                   ║
 * ║  Exports constants that drive the simulation engine:              ║
 * ║    • Station count, spacing, and stage positions                  ║
 * ║    • Default clock/speed values and defect probability            ║
 * ║    • Jam fault parameters (auto-resume, scrap multiplier, etc.)   ║
 * ║    • Position tolerance values (light activation, snapshot)       ║
 * ║    • Tile spawn / dryer / sort / collect / end-of-line positions  ║
 * ╚═══════════════════════════════════════════════════════════════════╝
 */

// ═══════════════════════════════════════════════════════════════════
// SIMULATION — Core timing and layout
// ═══════════════════════════════════════════════════════════════════

/** Number of factory stations on the production line (Press → Packaging) */
export const STATION_COUNT = 7;
/**
 * STATION_SPACING — Normalized t-distance a tile travels in one P-Clock interval.
 *
 * Used by computeBaseVelocity() to calibrate tile speed:
 *   velocity = STATION_SPACING / T_station
 * so that tiles arrive at each station exactly on a P-Clock tick.
 *
 * Derived by sampling the CatmullRom spline at the first four stations
 * (Press→Dryer→Glaze→Printer, all 4 world-units apart) and averaging
 * their t-gaps.  The spline is non-linear, so the old linear formula
 * (4/64=0.0625) was wrong; the correct value is ≈0.05855.
 *
 * NOTE: Kiln and beyond have larger world-space gaps, so tiles take more
 * than one P-Clock tick to travel those segments — this is intentional and
 * does not affect simulation correctness.
 */
export const STATION_SPACING = 0.05855;

/**
 * STATION_STAGES — Normalized t-positions of each station on the conveyor spline.
 *
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║  CURVE-SAMPLED — NOT the old linear formula (machineX + 16) / 64 !      ║
 * ║                                                                          ║
 * ║  The CatmullRom spline distributes arc-length non-linearly across t.     ║
 * ║  Using the linear formula placed stations 1–2 world-units PAST their     ║
 * ║  actual 3D positions, causing tiles to visually overshoot machines        ║
 * ║  before being detected (the "kiln exit ghost" bug).                      ║
 * ║                                                                          ║
 * ║  These values were computed by binary-searching the actual spline:        ║
 * ║    for each station X, find t where curve.getPointAt(t).x === X          ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * IMPORTANT: When a machine is moved in scene.ts, resample the curve to
 * get the new t-value — DO NOT use the linear formula.
 *
 * Machine X positions and curve-sampled t-values:
 *   Press     (x=-15)  →  t = 0.01474
 *   Dryer     (x=-11)  →  t = 0.07324
 *   Glaze     (x= -7)  →  t = 0.13183
 *   Printer   (x= -3)  →  t = 0.19040
 *   Kiln      (x=  4)  →  t = 0.29288
 *   Sorting   (x=  8)  →  t = 0.35147
 *   Packaging (x= 14)  →  t = 0.43933
 */
export const STATION_STAGES: number[] = [
  0.01474,   // Press     (x = -15)
  0.07324,   // Dryer     (x = -11)
  0.13183,   // Glaze     (x =  -7)
  0.19040,   // Printer   (x =  -3)
  0.29288,   // Kiln      (x =   4)
  0.35147,   // Sorting   (x =   8)
  0.43933,   // Packaging (x =  14)
];

/** Default S-Clock period in milliseconds (how fast the system clock ticks) */
export const DEFAULT_S_CLOCK_PERIOD = 400;
/** Default P-Clock divisor: one production tick every N S-Clock ticks */
export const DEFAULT_STATION_INTERVAL = 2;
/** Default conveyor speed multiplier (1.5 = faster than real-time, per demo settings image) */
export const DEFAULT_CONVEYOR_SPEED = 1.5;

/**
 * MAX_TICKS_PER_FRAME — Hard cap on the number of S-Clock ticks that can
 * fire in a single requestAnimationFrame callback.
 *
 * Without this cap, the `while (accumulated >= sClockPeriod)` loop in
 * useSystemTimer can fire dozens of ticks in one frame after a browser tab
 * wake or lag spike. At sClockPeriod=100ms + conveyorSpeed=2.0×, a 500ms
 * stutter accumulates 1000ms → 10 ticks → 10 tiles spawned instantly.
 *
 * With cap=3, at most 3 tiles spawn per frame. Any excess accumulator
 * is discarded to prevent "catch-up" burst on the next frame.
 */
export const MAX_TICKS_PER_FRAME = 3;

/**
 * MAX_FRAME_DELTA_S — Maximum frame delta (in seconds) accepted by the
 * system timer. R3F's useFrame provides `delta` in seconds since the last
 * frame. Normally this is ~0.016s (60fps), but browser tab sleep/wake can
 * produce deltas of 1–10s, causing massive accumulator spikes.
 *
 * Clamping delta to 0.1s (100ms) ensures that even at conveyorSpeed=2.0×,
 * the accumulator gains at most 200ms per frame — at most 2 ticks at
 * sClockPeriod=100ms, well within MAX_TICKS_PER_FRAME.
 */
export const MAX_FRAME_DELTA_S = 0.1;

/** Probability (0–1) that a tile will be defective at the sorting station */
export const DEFECT_PROBABILITY = 0.05;

/**
 * PARAMETER_CHANGE_CHANCE — Probability (0–1) that a random parameter drift
 * event fires on a given simulation tick.
 *
 * Raised from 0.02 (2%) to 0.20 (20%) so that drift is visible within seconds
 * of the simulation running, rather than requiring minutes of observation.
 * Each event still touches only ONE randomly selected station + parameter.
 */
export const PARAMETER_CHANGE_CHANCE = 0.20;

/**
 * DRIFT_STEP_SCALE — Multiplier (0–1) applied to the per-parameter drift limit
 * before each drift event.  Keeps individual steps small even when
 * PARAMETER_CHANGE_CHANCE is high, preventing unrealistic jumps:
 *
 *   effectiveDrift = driftLimit% × DRIFT_STEP_SCALE
 *
 * e.g. driftLimit=80% + scale=0.15 → each step changes the value by ±12% max.
 * This results in a smooth "walk" that is clearly visible but not erratic.
 */
export const DRIFT_STEP_SCALE = 0.15;

// ═══════════════════════════════════════════════════════════════════
// SIMULATE-AHEAD — Data engine leads the visual engine
// ═══════════════════════════════════════════════════════════════════

/**
 * SIMULATE_AHEAD_TICKS — How many production ticks the data engine runs
 * ahead of the visual engine. The visual engine only begins consuming
 * TickSnapshots once the buffer has MIN_BUFFERED_BEFORE_PLAY entries.
 *
 * Setting this to 10 means the data engine is 10 P-Clock ticks ahead,
 * giving the visual engine a stable replay buffer even during brief
 * timing jitter or lag spikes.
 */
export const SIMULATE_AHEAD_TICKS = 10;

/**
 * SNAPSHOT_BUFFER_SIZE — Capacity of the TickSnapshot ring buffer.
 * Sized at 2× SIMULATE_AHEAD_TICKS so there's always room for newly
 * produced snapshots while old ones are being consumed.
 */
export const SNAPSHOT_BUFFER_SIZE = SIMULATE_AHEAD_TICKS * 2;

/**
 * MIN_BUFFERED_BEFORE_PLAY — The visual engine won't start replaying
 * TickSnapshots until the buffer contains at least this many entries.
 * Set equal to SIMULATE_AHEAD_TICKS to ensure the full lead time is
 * established before visuals begin.
 */
export const MIN_BUFFERED_BEFORE_PLAY = SIMULATE_AHEAD_TICKS;



/** Duration (ms) before a jammed conveyor automatically resumes */
export const JAM_AUTO_RESUME_MS = 7000;
/** OEE availability reduction per fault event (0.15 = 15%) */
export const JAM_AVAILABILITY_PENALTY = 0.15;
/** Maximum cumulative availability penalty from all faults (0.50 = 50%) */
export const JAM_MAX_AVAILABILITY_PENALTY = 0.50;

// ═══════════════════════════════════════════════════════════════════
// TOLERANCES — How close a tile must be to a station for detection
// ═══════════════════════════════════════════════════════════════════

/** Tolerance for activating station indicator lights (Scene) */
export const LIGHT_TOLERANCE = 0.018;
/**
 * Wider tolerance for recording matrix snapshots (catches between-frame
 * positions). Must satisfy 2 × SNAPSHOT_TOLERANCE < STATION_SPACING to
 * prevent one tile matching two adjacent station windows.
 */
export const SNAPSHOT_TOLERANCE = 0.031;

// ═══════════════════════════════════════════════════════════════════
// TILE LIFECYCLE — Where tiles spawn, get sorted, collected, removed
// ═══════════════════════════════════════════════════════════════════

/** Tile spawn position on the conveyor (Press station, x=-15 in 3D space) */
export const SPAWN_T = STATION_STAGES[0];                    // 0.015625 (Press)
/** Conveyor position where tiles enter the dryer queue (Dryer station, x=-11 in 3D space) */
export const DRYER_ENTRY_T = STATION_STAGES[1];              // 0.078125 (Dryer)
/**
 * DRYER_RELEASE_THRESHOLD — Number of tiles that must accumulate before
 * the dryer starts releasing. This is the normal operating point.
 * Under steady-state, the queue oscillates around this value.
 */
export const DRYER_RELEASE_THRESHOLD = 10;

/**
 * DRYER_QUEUE_CAPACITY — Maximum buffer size for the dryer FIFO queue.
 * The extra slots above DRYER_RELEASE_THRESHOLD act as a "shock absorber":
 * they absorb transient stress (speed fluctuations, timer skips, gap-check
 * delays) without disrupting normal release timing.
 * When the queue hits this hard cap, a force-release bypasses the dynamic
 * gap check to prevent unbounded queue growth.
 */
export const DRYER_QUEUE_CAPACITY = 15;

/**
 * DRYER_RELEASE_SPACING — Forward t-offset applied to tiles when they exit
 * the dryer FIFO queue and re-enter the conveyor belt.
 *
 * Tile is placed at DRYER_ENTRY_T + DRYER_RELEASE_SPACING, which should
 * correspond to the dryer's right edge (~x = -10.5).
 *
 * MUST be > 0 (prevent overlap with last queued tile) and
 * MUST be < STATION_SPACING to avoid skipping the Glaze station window.
 */
export const DRYER_RELEASE_SPACING = STATION_SPACING / 4; // ≈0.01464 → exit near dryer right edge

// ── Kiln Queue ─────────────────────────────────────────────────────────────

/**
 * KILN_ENTRY_T — Normalised spline t at which tiles enter the Kiln FIFO queue.
 * Derived from STATION_STAGES[4] (Kiln machine at x = 4):
 *   t = (4 + 16) / 64 = 0.3125
 */
export const KILN_ENTRY_T = STATION_STAGES[4];             // 0.3125 (Kiln, x = 4)

/**
 * KILN_RELEASE_THRESHOLD — Minimum queue depth before the Kiln starts
 * releasing tiles (normal steady-state operation).
 * Set to 40 (vs Dryer's 10) to represent the longer thermal dwell time
 * of the firing process.
 */
export const KILN_RELEASE_THRESHOLD = 40;

/**
 * KILN_QUEUE_CAPACITY — Hard upper bound on the Kiln FIFO queue.
 * 40 (threshold) + 5 (headroom) = 45.
 * The 5-slot headroom absorbs transient back-pressure from conveyor speed
 * drops — same pattern as Dryer (10 + 5 = 15).
 * When the queue hits this cap, the gap-check is bypassed (force-release)
 * to prevent unbounded growth.
 */
export const KILN_QUEUE_CAPACITY = 45;

/**
 * KILN_RELEASE_SPACING — Forward t-offset applied when a tile exits the
 * Kiln queue and re-enters the conveyor belt.
 *
 * Tile is placed at KILN_ENTRY_T + KILN_RELEASE_SPACING, which should
 * correspond to the kiln's right edge (~x = 4.5).
 *
 * MUST be > 0 (prevent overlap with last queued tile) and
 * MUST be < STATION_SPACING to avoid skipping the Sorting station window.
 */
export const KILN_RELEASE_SPACING = STATION_SPACING / 8;  // ≈0.00732 → exit near kiln right edge

/**
 * Minimum time (ms) a tile must stay hidden inside the Kiln before it
 * can be released, regardless of queue length or drain mode.
 * Prevents the "instant jump" visual glitch in small work orders.
 */
export const KILN_MIN_DWELL_MS = 2000;

/**
 * Minimum time (ms) a tile must stay hidden inside the Dryer before release.
 */
export const DRYER_MIN_DWELL_MS = 1000;
/** Conveyor position just past the Sorting station where defect check triggers.
 *  Sorting is at t=0.375 (x=8); +0.01 gives a small clearance past the station. */
export const SORT_THRESHOLD = STATION_STAGES[5] + 0.01;      // 0.385
/**
 * Conveyor position just past Packaging where collection triggers.
 * Packaging is at t=0.46875 (x=14); +0.02 gives clearance while
 * staying safely below END_OF_LINE_T=0.5.
 */
export const COLLECT_THRESHOLD = STATION_STAGES[6] + 0.02;   // 0.48875
/** Conveyor position where tiles are removed from the simulation */
/** Conveyor position where tiles are removed — right turnaround of the spline */
export const END_OF_LINE_T = 0.47;

/** Maximum simultaneous visible tiles (prevents memory exhaustion) */
export const MAX_VISIBLE_PARTS = 150;
