/**
 * ╔═══════════════════════════════════════════════════════════════════╗
 * ║  SCENE — 3D scene layout, conveyor belt visual parameters,       ║
 * ║  camera settings, orbit controls, lighting, and grid config.     ║
 * ║                                                                   ║
 * ║  Exports all constants needed to set up the Three.js / R3F scene:║
 * ║    • Conveyor slat count, curve spline, tile geometry             ║
 * ║    • Station 3D spacing and key object positions                  ║
 * ║    • Camera, orbit controls, and lighting presets                 ║
 * ║    • Floor grid configuration                                     ║
 * ╚═══════════════════════════════════════════════════════════════════╝
 */

// ═══════════════════════════════════════════════════════════════════
// CONVEYOR VISUAL — Slat count and curve definition
// ═══════════════════════════════════════════════════════════════════

/** Total number of metallic slats rendered on the conveyor belt loop */
export const SLAT_COUNT = 100;

/**
 * Speed multiplier applied ONLY to slat (belt) animation — NOT to tiles.
 *
 * WHY 0.5:
 *   The conveyor curve is a full closed loop (top production run + bottom
 *   return leg). Tiles travel only the TOP half of the loop (t ≈ 0 → 0.5),
 *   while slats cycle 360° using the same visualVelocity.
 *   From the viewer's perspective, slats on the visible top surface appear
 *   to refresh and recycle every 0.5t — making them look ~2× faster than
 *   tiles that physically sit on the belt surface.
 *
 *   Applying a 0.5× multiplier to the slat offset advance rate brings the
 *   visual speed of the belt surface into alignment with the tiles moving
 *   on top of it. Result: slats and tiles now appear to move in sync.
 *
 *   If the belt still looks slightly off after deployment, tweak this value:
 *     • Too fast → lower (e.g. 0.45)
 *     • Too slow → raise (e.g. 0.55)
 */
export const SLAT_SPEED_MULTIPLIER = 0.5;

/** The CatmullRom spline control points for the conveyor belt loop */
export const CONVEYOR_CURVE_POINTS: [number, number, number][] = [
  [-16, 0.1, 0],
  [16, 0.1, 0],
  [16, -1, 0],
  [-16, -1, 0],
];
/** Tension parameter for the CatmullRom curve (0 = sharp, 1 = catenary) */
export const CONVEYOR_CURVE_TENSION = 0.1;

/** [width, height, depth] dimensions for each conveyor slat mesh */
export const SLAT_GEOMETRY: [number, number, number] = [0.3, 0.05, 2];
/** [width, height, depth] dimensions for each tile mesh on the conveyor */
export const TILE_GEOMETRY: [number, number, number] = [1.035, 0.071875, 1.035];
/** Vertical offset so tiles hover slightly above the conveyor surface */
export const TILE_Y_OFFSET = 0.07;

// ═══════════════════════════════════════════════════════════════════
// SCENE LAYOUT — 3D positions, camera, orbit controls
// ═══════════════════════════════════════════════════════════════════

/** World units between station center positions along the X axis */
export const STATION_SPACING_3D = 4;
/** Station index that sits at x=0 (used as the centering reference) */
export const STATION_CENTER_INDEX = 3;

/**
 * ════════════════════════════════════════════════════════════════════
 * STATION X POSITION OVERRIDES — Custom visual layout positions
 * ════════════════════════════════════════════════════════════════════
 *
 * These are the 3D world X positions of each machine model on the conveyor.
 * They are PURELY COSMETIC — they only control WHERE the machine box appears
 * in the 3D scene. They do NOT directly control tile simulation logic.
 *
 * Tile simulation (spawn, dryer queue, sort, collect) is driven by STATION_STAGES
 * in simulation.ts, which are derived from these X positions using the formula:
 *   t = (machineX + 16) / 64
 *
 * IMPORTANT: Whenever you move a machine here, also update the corresponding
 * entry in STATION_STAGES inside simulation.ts to keep 3D visuals and tile
 * simulation in sync.
 *
 * Current layout (custom, intentional non-uniform spacing):
 *   Press     : x = -15  →  t = 0.015625
 *   Dryer     : x = -11  →  t = 0.078125
 *   Glaze     : x =  -7  →  t = 0.140625
 *   Printer   : x =  -3  →  t = 0.203125
 *   Kiln      : x =   4  (standard formula)  →  t = 0.3125
 *   Sorting   : x =   8  (standard formula)  →  t = 0.375
 *   Packaging : x =  14  →  t = 0.46875
 */

/**
 * Press station (index 0) X position.
 * Placed close to the left end of the conveyor (x=-16) to represent the raw-material
 * feed point. Tiles spawn visually ON this machine (SPAWN_T = 0.015625).
 */
export const PRESS_POSITION_X_OVERRIDE: number = -15;

/**
 * Dryer station (index 1) X position.
 * 4 units to the right of Press, keeping a tight feed-to-drying gap.
 * Tiles enter the FIFO queue visually HERE (DRYER_ENTRY_T = 0.078125).
 */
export const DRYER_POSITION_X_OVERRIDE: number = -11;

/**
 * Glaze/Color station (index 2) X position.
 * 4 units to the right of Dryer, clustering the left-side wet-process stations.
 */
export const GLAZE_POSITION_X_OVERRIDE: number = -7;

/**
 * Digital Print station (index 3) X position.
 * 4 units to the right of Glaze, keeping uniform spacing across the first four stations.
 */
export const DIGITAL_PRINT_POSITION_X_OVERRIDE: number = -3;

/**
 * Packaging station (index 6) X position.
 * Placed closer to the conveyor right end (x=16) to give visual space
 * for the Forklift and shipment area beyond.
 */
export const PACKAGING_POSITION_X_OVERRIDE: number = 14;

/**
 * World position [x, y, z] of the trash/waste bin.
 * Placed between the Sorting (x=8) and Packaging (x=14) stations in the -z direction.
 * Sort animation arcs toward this position for defective (scrap) tiles.
 */
export const TRASH_BIN_POSITION: [number, number, number] = [11, 0, -2.5];

/**
 * World position [x, y, z] of the second quality collection box.
 * Placed to the right of the conveyor end so it is clearly in the shipment zone.
 * SQ animation arcs toward this position for station-defect tiles.
 */
export const SECOND_QUALITY_BOX_POSITION: [number, number, number] = [17.5, 0, -2.5];

/**
 * World position [x, y, z] of the forklift body centre.
 * x=20 is 4 units past the conveyor right end (x=16), placing it in the
 * shipment staging area. z=-2.35 offsets the body so that after the 180° Y
 * rotation the fork tines land at world z=0 (conveyor centreline).
 */
export const FORKLIFT_POSITION: [number, number, number] = [20, 0, -2.35];
/** Euler rotation [x, y, z] of the forklift — 180° around Y so it faces the conveyor */
export const FORKLIFT_ROTATION: [number, number, number] = [0, Math.PI, 0];

/**
 * World-space target position for tile collect animations.
 * After the 180° rotation the fork tines are at world z =
 * FORKLIFT_POSITION[2] + 2.35 = 0, centred on the conveyor X-axis.
 * x=20 matches FORKLIFT_POSITION[0] so tiles arc directly onto the forks.
 */
export const FORKLIFT_COLLECT_TARGET: [number, number, number] = [20, 0, 0];


/** World position [x, y, z] of the 3D production status table (Z reduced from 8.5 to 2.55 — 70% closer to conveyor) */
export const PRODUCTION_TABLE_POSITION: [number, number, number] = [0, -1.15, 2.55];
/** Euler rotation [x, y, z] of the production table (tilted toward camera) */
export const PRODUCTION_TABLE_ROTATION: [number, number, number] = [-1.26, 0, 0];

/** Initial camera position [x, y, z] — elevated overview of the factory line.
 *  Both position and target are panned together so the OEE table and factory
 *  are both visible in the initial viewport. */
export const CAMERA_POSITION: [number, number, number] = [-1.99, 21.70, 15.84];
/** Camera field of view in degrees */
export const CAMERA_FOV = 65;
/** Camera clipping planes [near, far] */
export const CAMERA_NEAR = 0.1;
export const CAMERA_FAR = 2000;
/** OrbitControls look-at target [x, y, z] — panned up and back so the
 *  OEE Hierarchy table is visible above the factory in the initial view.
 *  Y=7.28 lifts the look-at point; Z=-7.29 shifts it behind the conveyor. */
export const ORBIT_TARGET: [number, number, number] = [-2.04, 7.28, -7.29];

/** Camera debug overlay toggle. When `true`, a semi-transparent panel
 *  displays live CAMERA_POSITION, ORBIT_TARGET, FOV, and scene transforms
 *  in the top-left corner of the 3D canvas. Useful for fine-tuning the
 *  initial scene framing. Default: `false` (off). */
export const CAMERA_DEBUG = false;

/** Vertical offset applied to the factory scene group to vertically center
 *  the production line in the viewport. All factory objects sit at y=0 by
 *  default; elevating the group by this amount pulls them up in world space
 *  so a natural camera angle shows them centered instead of at screen bottom. */
export const SCENE_ELEVATION = 5.4;

/** 
 * Horizontal offset applied to the factory scene group to shift it
 * left/right in the viewport. 
 * A negative value shifts the factory to the left.
 */
export const FACTORY_X_OFFSET = -1.6;

/** 
 * Euler rotation [x, y, z] for the entire factory group.
 * Set to [0, 0, 0] to align the factory perfectly with the grid axes.
 */
export const FACTORY_ROTATION: [number, number, number] = [0, 0, 0];

/** OrbitControls configuration for camera interaction */
export const ORBIT_CONTROLS = {
  /** Minimum elevation angle (prevents looking from below the floor) */
  minPolarAngle: Math.PI / 6,
  /** Maximum elevation angle — slightly more permissive to allow frontal views */
  maxPolarAngle: Math.PI / 1.9,
  /** Minimum camera distance from target */
  minDistance: 15,
  /** Maximum camera distance from target */
  maxDistance: 55,
  /** Damping smoothing factor for orbit inertia */
  dampingFactor: 0.05,
  /** Scroll-wheel zoom sensitivity (default 1.0; lowered 50 %) */
  zoomSpeed: 0.2,
} as const;

// ═══════════════════════════════════════════════════════════════════
// CWF CAMERA ZOOM — FOV adjustment when CWF side panel opens
// ═══════════════════════════════════════════════════════════════════

/**
 * Extra degrees added to the camera FOV when the CWF side panel is open.
 * The base FOV (CAMERA_FOV = 55°) + this offset gives the zoomed-out FOV.
 * A higher value means more zoom-out (objects appear smaller).
 */
export const CWF_CAMERA_FOV_OFFSET = 5;

/**
 * Duration (ms) for the camera FOV transition when the CWF panel opens/closes.
 * Slightly longer than the panel slide animation (300ms) for a smooth,
 * lagging feel that avoids hard snapping.
 */
export const CWF_CAMERA_FOV_TRANSITION_MS = 400;

/**
 * Per-frame lerp interpolation factor for the FOV animation.
 * Used inside useFrame: `camera.fov = THREE.MathUtils.lerp(current, target, FACTOR)`.
 * Lower = smoother/slower, higher = snappier. 0.05 gives ~60 frames to converge.
 */
export const CWF_CAMERA_FOV_LERP_FACTOR = 0.05;

// ═══════════════════════════════════════════════════════════════════
// LIGHTING — Ambient, spot, point light configurations
// ═══════════════════════════════════════════════════════════════════

/** Ambient light intensity (fills shadows globally) */
export const AMBIENT_INTENSITY = 0.6;

/** Spot light configuration (main directional shadow caster) */
export const SPOT_LIGHT = {
  position: [10, 20, 10] as [number, number, number],
  angle: 0.15,
  penumbra: 1,
  intensity: 1.5,
  shadowMapSize: 1024,
} as const;

/** Point light configuration (secondary fill light) */
export const POINT_LIGHT = {
  position: [-10, -10, -10] as [number, number, number],
  intensity: 0.5,
} as const;

/** drei Environment preset name for scene reflections */
export const ENVIRONMENT_PRESET = 'city' as const;

// ═══════════════════════════════════════════════════════════════════
// FLOOR GRID — Grid visual configuration
// ═══════════════════════════════════════════════════════════════════

/** Configuration for the <Grid> ground plane */
export const GRID_CONFIG = {
  position: [0, -0.01, 0] as [number, number, number],
  cellSize: 1,
  cellThickness: 0.5,
  cellColor: '#202020',
  sectionSize: 5,
  sectionThickness: 1,
  sectionColor: '#00ff88',
  fadeDistance: 30,
  fadeStrength: 1,
} as const;
