/**
 * ╔═══════════════════════════════════════════════════════════════════╗
 * ║  GEOMETRY — 3D object dimensions, font sizes, production table  ║
 * ║  layout, and animation parameters for tiles on the conveyor.    ║
 * ║                                                                   ║
 * ║  Exports all size/dimension constants for:                        ║
 * ║    • Station bases, bodies, lights, labels                        ║
 * ║    • Trash bin, second quality box, and shipment box meshes        ║
 * ║    • 3D text/font sizes for all labels                            ║
 * ║    • Production status table grid layout                          ║
 * ║    • Tile sort/collect/second-quality animation arc parameters     ║
 * ║    • 3D hardcoded labels (WASTE BIN, 2ND QUALITY, SHIPMENT)       ║
 * ╚═══════════════════════════════════════════════════════════════════╝
 */

// ═══════════════════════════════════════════════════════════════════
// GEOMETRY DIMENSIONS — All 3D object sizes
// ═══════════════════════════════════════════════════════════════════

/** [width, height, depth] of the station platform/base mesh */
export const STATION_BASE_SIZE: [number, number, number] = [2, 1, 2];
/** Y position of the station base center */
export const STATION_BASE_Y = 0.5;
/** [width, height, depth] of the station body/housing mesh */
export const STATION_BODY_SIZE: [number, number, number] = [1.8, 1, 1.8];
/** Y position of the station body center */
export const STATION_BODY_Y = 1.5;
/** Radius of the station indicator light sphere */
export const STATION_LIGHT_RADIUS = 0.2;
/** Number of segments for the station indicator light sphere */
export const STATION_LIGHT_SEGMENTS = 16;
/** Y position of the station indicator light */
export const STATION_LIGHT_Y = 2.5;
/** Y position of the station name label */
export const STATION_LABEL_Y = 3.2;

/** [width, height, depth] of the trash bin outer box */
export const TRASH_BIN_SIZE: [number, number, number] = [1.7, 1.65, 1.7];
/** [width, height, depth] of the trash bin inside floor plane */
export const TRASH_BIN_INSIDE_SIZE: [number, number, number] = [1.53, 0.01, 1.53];
/** Y position of the trash bin inside floor */
export const TRASH_BIN_INSIDE_Y = 0.835;
/** Y position of the trash bin scrap counter text — matches FORKLIFT_COUNTER_TEXT_Y so it aligns with SHIPMENT */
export const TRASH_BIN_COUNTER_Y = 5.0;
/** Y position of the trash bin rim ring */
export const TRASH_BIN_RIM_Y = 0.825;
/** Thickness of the trash bin rim ring tube */
export const TRASH_BIN_RIM_THICKNESS = 0.08;
/** Offset multiplier for the trash bin rim radius */
export const TRASH_BIN_RIM_OFFSET = 0.82;
/** Vertical offset for the decorative strip on the trash bin */
export const TRASH_BIN_STRIP_OFFSET_Y = -0.15;
/** Z offset for the decorative strip on the trash bin */
export const TRASH_BIN_STRIP_OFFSET_Z = 0.855;
/** Thickness of the decorative strip */
export const TRASH_BIN_STRIP_THICKNESS = 0.045;
/** Depth of the decorative strip geometry */
export const TRASH_BIN_STRIP_DEPTH = 0.01;
/** Length of the decorative strip */
export const TRASH_BIN_STRIP_LENGTH = 1.71;
/** Y position of the trash bin label — matches FORKLIFT_LABEL_Y so it aligns with SHIPMENT */
export const TRASH_BIN_LABEL_Y = 4.0;
/** Z position of the trash bin label text — back side (away from conveyor) so it sits above and behind the bin */
export const TRASH_BIN_LABEL_Z = -1.0;

// ── Second Quality Box (same structure as Trash Bin, amber theme) ─────────

/** [width, height, depth] of the second quality box outer body */
export const SQ_BOX_SIZE: [number, number, number] = [1.7, 1.65, 1.7];
/** [width, height, depth] of the second quality box inside floor plane */
export const SQ_BOX_INSIDE_SIZE: [number, number, number] = [1.53, 0.01, 1.53];
/** Y position of the second quality box inside floor */
export const SQ_BOX_INSIDE_Y = 0.835;
/** Y position of the second quality box counter text — matches FORKLIFT_COUNTER_TEXT_Y so it aligns with SHIPMENT */
export const SQ_BOX_COUNTER_Y = 5.0;
/** Y position of the second quality box rim ring */
export const SQ_BOX_RIM_Y = 0.825;
/** Thickness of the second quality box rim ring tube */
export const SQ_BOX_RIM_THICKNESS = 0.08;
/** Offset for the second quality box rim radius */
export const SQ_BOX_RIM_OFFSET = 0.82;
/** Vertical offset for the second quality box decorative strip */
export const SQ_BOX_STRIP_OFFSET_Y = -0.15;
/** Z offset for the second quality box decorative strip */
export const SQ_BOX_STRIP_OFFSET_Z = 0.855;
/** Thickness of the second quality box decorative strip */
export const SQ_BOX_STRIP_THICKNESS = 0.045;
/** Depth of the second quality box decorative strip */
export const SQ_BOX_STRIP_DEPTH = 0.01;
/** Length of the second quality box decorative strip */
export const SQ_BOX_STRIP_LENGTH = 1.71;
/** Y position of the second quality box label — matches FORKLIFT_LABEL_Y so it aligns with SHIPMENT */
export const SQ_BOX_LABEL_Y = 4.0;
/** Z position of the second quality box label text — back side (away from conveyor) so it sits above and behind the box */
export const SQ_BOX_LABEL_Z = -1.0;

/** [width, height, depth] of the shipment box floor plate */
export const SHIPMENT_BOX_BASE: [number, number, number] = [2.5, 0.1, 2.5];
/** Y position of the shipment box floor */
export const SHIPMENT_BOX_BASE_Y = 0.4;
/** [width, height, depth] of the shipment box back wall */
export const SHIPMENT_BOX_BACK_WALL: [number, number, number] = [2.5, 1.2, 0.1];
/** Y position of the back wall center */
export const SHIPMENT_BOX_BACK_Y = 1.0;
/** Z position of the back wall */
export const SHIPMENT_BOX_BACK_Z = -1.2;
/** [width, height, depth] of the shipment box front wall (shorter) */
export const SHIPMENT_BOX_FRONT_WALL: [number, number, number] = [2.5, 0.5, 0.1];
/** Y position of the front wall center */
export const SHIPMENT_BOX_FRONT_Y = 0.65;
/** Z position of the front wall */
export const SHIPMENT_BOX_FRONT_Z = 1.2;
/** [width, height, depth] of the shipment box side walls */
export const SHIPMENT_BOX_SIDE_WALL: [number, number, number] = [0.1, 1.2, 2.5];
/** Y position of the side wall center */
export const SHIPMENT_BOX_SIDE_Y = 1.0;
/** X offset for each side wall (mirrored ±) */
export const SHIPMENT_BOX_SIDE_X = 1.2;
/** Y position of the shipment counter text */
export const SHIPMENT_BOX_COUNTER_Y = 3.0;
/** Y position of the shipment label text */
export const SHIPMENT_BOX_LABEL_Y = 2.2;

// ═══════════════════════════════════════════════════════════════════
// 3D TEXT SIZES — Font sizes for all 3D labels
// ═══════════════════════════════════════════════════════════════════

/** Font sizes for every 3D text element in the scene */
export const TEXT_SIZES = {
  stationLabel: 0.45,
  stationLabelOutline: 0.02,
  tileId: 0.4,
  tileIdYOffset: 0.04,
  counter: 0.8,
  counterOutline: 0.05,
  shipmentLabel: 0.4,
  shipmentLabelOutline: 0.015,
  /** Font size for the trash bin label — matches SHIPMENT label for visual consistency */
  trashBinLabel: 0.4,
  /** Outline width for the trash bin label */
  trashBinLabelOutline: 0.015,
  /** Font size for the second quality box label — matches SHIPMENT label */
  sqBoxLabel: 0.4,
  /** Outline width for the second quality box label */
  sqBoxLabelOutline: 0.015,
  tableHeader: 0.32,
  tableStationHeader: 0.28,
  tableStationHeaderMaxWidth: 3.5,
  tableCell: 0.24,
  tableClockCell: 0.26,
} as const;

// ═══════════════════════════════════════════════════════════════════
// PRODUCTION TABLE — Layout parameters
// ═══════════════════════════════════════════════════════════════════

/** Number of rows in the production status table (reduced from 9 to 5 to shorten the table display) */
export const TABLE_ROW_COUNT = 5;
/** Total height of the table mesh (halved from 6.67 to 3.34 to reduce each row height by half) */
export const TABLE_HEIGHT = 3.34;
/** Total width of the table mesh (from -17 to +15 to cover all stations) */
export const TABLE_WIDTH = 32;
/** X centering offset for the table group (midpoint of -17 to +15) */
export const TABLE_CENTER_X = -1;
/**
 * X positions for each station column in the table.
 * These match the real-world station X positions exactly so each column
 * sits directly above its corresponding station machine.
 * Press=-15, Dryer=-11, Glaze=-7, DigitalPrint=-3, Kiln=4, Sorting=8, Packaging=14
 */
export const TABLE_STATION_X: number[] = [-15, -11, -7, -3, 4, 8, 14];
/** X position for the clock/tick number column (left of Press column) */
export const TABLE_CLOCK_X = -16.5;
/**
 * X positions for vertical grid line separators.
 * Placed between adjacent columns (midpoints) plus outer borders.
 */
export const TABLE_V_LINES: number[] = [-17, -16, -13, -9, -5, 1, 6, 11, 15];
/** Extra padding around the table base */
export const TABLE_BASE_PADDING = 0.6;
/** Extra padding around the table border glow */
export const TABLE_BORDER_PADDING = 0.8;
/** Z offset for the border plane (behind content) */
export const TABLE_BORDER_Z = -0.06;
/** Z offset for the grid lines (between border and content) */
export const TABLE_GRID_Z = 0.06;
/** Z offset for the content layer (in front) */
export const TABLE_CONTENT_Z = 0.1;
/** Thickness of the table grid lines */
export const TABLE_GRID_THICKNESS = 0.025;
/** Depth of the table base mesh */
export const TABLE_BASE_DEPTH = 0.1;
/** Depth of the table border mesh */
export const TABLE_BORDER_DEPTH = 0.05;

// ═══════════════════════════════════════════════════════════════════
// ANIMATION — Tile sort/collect motion parameters
// ═══════════════════════════════════════════════════════════════════

/** Multiplier for sort throw speed */
export const SORT_ANIMATION_SPEED = 10;
/**
 * COLLECT_ANIMATION_SPEED — Controls how fast the animation progress (0→1)
 * increments per second. Lower = longer, more visible arc flight.
 * Reduced from 12 to 8 so the parabolic trajectory to the forklift is
 * clearly visible rather than snapping instantly to the pallet.
 */
export const COLLECT_ANIMATION_SPEED = 8;
/** Peak height of sort throw arc (world units) */
export const SORT_ARC_HEIGHT = 1.5;
/**
 * COLLECT_ARC_HEIGHT — Peak height added to the Lerp midpoint during the
 * collect animation parabola.
 * Raised from 0.8 to 3.0 so tiles visibly arc OVER the conveyor belt and
 * land on the forklift forks in a satisfying parabolic trajectory.
 * Formula in ConveyorBelt.tsx: y += Math.pow(sin(pπ), 0.65) × ARC_HEIGHT
 * (asymmetric exponent front-loads the peak, preventing a ground-dip effect).
 */
export const COLLECT_ARC_HEIGHT = 3.0;
/** How fast tiles scale up on spawn (units per second) */
export const TILE_SCALE_SPEED = 2;
/** Progress at which sorted tile starts fading out (0–1) */
export const SORT_FADE_THRESHOLD = 0.8;
/** Derived fade rate: 1 / (1 - SORT_FADE_THRESHOLD) */
export const SORT_FADE_RATE = 5;
/**
 * COLLECT_FADE_THRESHOLD — Progress at which collected tile starts fading out.
 * Raised from 0.7 to 0.80 so tiles stay solid for 80% of the arc
 * and only fade on the final descent onto the pallet.
 */
export const COLLECT_FADE_THRESHOLD = 0.80;
/** Derived fade rate: 1 / (1 - COLLECT_FADE_THRESHOLD) = 1 / 0.20 = 5 */
export const COLLECT_FADE_RATE = 5;
/**
 * COLLECT_TARGET_Y — World Y position of the forklift pallet landing zone.
 * Raised from 0.5 to 1.2 so the animation target sits visually ON the
 * forklift forks, matching the rendered pallet height.
 */
export const COLLECT_TARGET_Y = 1.2;
/** Y position of the trash bin sort target */
export const SORT_TARGET_Y = -0.2;
/** Clamp value for tile t-parameter when starting collect animation (prevents overshoot) */
export const COLLECT_CLAMP_T = 0.49;

/**
 * SQ_ANIMATION_SPEED — Controls how fast the 2nd-quality animation progress
 * (0→1) increments per second. Reduced from 10 to 7 so the parabolic arc
 * to the amber box is clearly visible rather than snapping instantly.
 */
export const SQ_ANIMATION_SPEED = 7;
/**
 * SQ_ARC_HEIGHT — Peak height added to the Lerp midpoint during the
 * second-quality parabola. Raised from 1.5 to 3.5 so tiles arc high ABOVE
 * the box rim (Y≈0.825) and then fall cleanly down into the interior.
 * Formula in ConveyorBelt.tsx: y += Math.pow(sin(pπ), 0.6) × ARC_HEIGHT
 * (asymmetric exponent front-loads the peak, preventing a ground-dip effect).
 */
export const SQ_ARC_HEIGHT = 3.5;
/**
 * SQ_TARGET_Y — World Y position the tile lerps toward at the end of its
 * second-quality arc. Set to 0.5 so tiles land inside the amber box
 * (box top rim is at Y≈0.825, box floor is at Y≈-0.825, centre is 0).
 * Previously -0.2 caused tiles to hit the lower side-wall.
 */
export const SQ_TARGET_Y = 0.5;
/**
 * SQ_FADE_THRESHOLD — Progress at which the second-quality tile starts
 * fading out. Raised to 0.88 so tiles remain fully visible for 88% of the
 * arc and only fade on the final drop into the box interior.
 */
export const SQ_FADE_THRESHOLD = 0.88;
/**
 * SQ_FADE_RATE — Derived fade rate: 1 / (1 - SQ_FADE_THRESHOLD).
 * = 1 / 0.12 ≈ 8.33. Faster fade so the tile disappears cleanly
 * once fully inside the box rather than hovering at low opacity.
 */
export const SQ_FADE_RATE = 8.33;
/** Clamp value for tile t when starting second quality animation */
export const SQ_CLAMP_T = 0.49;

// ── SCRAP ANIMATION — Per-station scrap arc to recycle/waste bin ──────────

/**
 * SCRAP_ANIMATION_SPEED — Controls how fast scrap animation progress (0→1)
 * increments per second. Slower than sort (10) for a dramatic, visible
 * "thrown to recycle bin" trajectory that the user can appreciate.
 */
export const SCRAP_ANIMATION_SPEED = 6;

/**
 * SCRAP_ARC_HEIGHT — Peak height of the scrap arc parabola (world units).
 * Set to 4.0 to ensure tiles visibly arc HIGH above the bin rim (Y≈0.825)
 * before descending cleanly into the interior. Same approach as SQ (3.5)
 * but slightly higher for a more dramatic "throw away" visual.
 */
export const SCRAP_ARC_HEIGHT = 3.5;

/**
 * SCRAP_ARC_EXPONENT — Exponent applied to sin(p·π) to create an
 * asymmetric arc: exponent > 1 sharpens the peak so the tile climbs to
 * a dramatic height then drops STEEPLY into the bin opening — a true
 * basketball-swish trajectory. Higher = steeper descent into the basket.
 * 1.8 produces a Michael Jordan three-pointer arc: peak at ~50% of
 * flight, dropping through the bin rim at ~90% of flight.
 */
export const SCRAP_ARC_EXPONENT = 1.8;

/**
 * SCRAP_TARGET_Y — World Y position the tile lerps toward at end of arc.
 * Set to 0.5 so tiles land INSIDE the bin (bin rim ≈ Y=0.825, bin floor
 * ≈ Y=0). Previously used SORT_TARGET_Y (-0.2) which caused tiles to
 * slam into the side or go below the bin.
 */
export const SCRAP_TARGET_Y = 0.5;

/**
 * SCRAP_FADE_THRESHOLD — Progress (0–1) at which the tile starts fading.
 * Set to 0.92 so tiles remain fully visible until they physically enter
 * the bin opening (rim ≈ Y=0.825). With exponent 1.8, the tile crosses
 * the rim at ~90% progress and is INSIDE the bin when the fade kicks in.
 */
export const SCRAP_FADE_THRESHOLD = 0.92;

/**
 * SCRAP_FADE_RATE — Derived: 1 / (1 - SCRAP_FADE_THRESHOLD) = 12.5.
 * Fast fade over the final 8% of the animation, so tiles vanish
 * cleanly once fully inside the bin rather than hovering at low opacity.
 */
export const SCRAP_FADE_RATE = 12.5;

/**
 * SCRAP_TUMBLE_SPEED — Rotation speed (radians/frame) for the single-axis
 * tumble during the scrap arc. A controlled spin around X creates a
 * "flicked away" effect without chaotic multi-axis wobble.
 * This value is multiplied by (1 - progress) so the spin decelerates
 * as the tile approaches the bin — like a basketball settling into the hoop.
 */
export const SCRAP_TUMBLE_SPEED = 0.12;

/**
 * SCRAP_EASE_EXPONENT — Ease-out exponent for position interpolation.
 * Formula: easedProgress = 1 - pow(1 - progress, EXPONENT).
 * With exponent 3.0, the tile reaches the bin's X position by ~80% of
 * the animation, leaving 20% for the steep vertical drop into the basket.
 * Without easing, a tile from press (x=-15) to bin (x=11) wouldn't reach
 * the bin's edge until 97% progress — far past the fade threshold.
 */
export const SCRAP_EASE_EXPONENT = 3.0;

// ═══════════════════════════════════════════════════════════════════
// 3D LABELS — Hardcoded (non-translatable) labels for Scene objects
// ═══════════════════════════════════════════════════════════════════

/** Label text displayed on the trash/waste bin */
export const LABEL_WASTE_BIN = 'WASTE BIN';
/** Label text displayed on the second quality box */
export const LABEL_SECOND_QUALITY = '2ND QUALITY';
/** Label text displayed on the shipment box */
export const LABEL_SHIPMENT = 'SHIPMENT';

// ═══════════════════════════════════════════════════════════════════
// FORKLIFT — 3D dimensions for the industrial forklift model
// ═══════════════════════════════════════════════════════════════════

/** [width, height, depth] of the forklift main body/chassis */
export const FORKLIFT_BODY_SIZE: [number, number, number] = [1.8, 1.0, 2.8];
/** Y position of the forklift body center */
export const FORKLIFT_BODY_Y = 0.5;

/** [width, height, depth] of the forklift counterweight (rear block) */
export const FORKLIFT_COUNTER_SIZE: [number, number, number] = [1.8, 0.7, 0.5];
/** Y position of the counterweight center */
export const FORKLIFT_COUNTER_Y = 0.35;
/** Z offset (rear) of the counterweight */
export const FORKLIFT_COUNTER_Z = 1.65;

/** [width, height, depth] of the operator cab roof */
export const FORKLIFT_CAB_SIZE: [number, number, number] = [1.7, 0.12, 2.2];
/** Y position of the cab roof */
export const FORKLIFT_CAB_Y = 1.56;

/** [width, height, depth] of the cab roof support pillars (×4 corners) */
export const FORKLIFT_PILLAR_SIZE: [number, number, number] = [0.1, 1.1, 0.1];
/** Y position of cab pillars */
export const FORKLIFT_PILLAR_Y = 1.0;
/** X offset for the left/right cab pillars */
export const FORKLIFT_PILLAR_X = 0.78;
/** Z offset for front/rear cab pillars */
export const FORKLIFT_PILLAR_Z_FRONT = -0.95;
/** Z offset for rear cab pillars */
export const FORKLIFT_PILLAR_Z_REAR = 0.95;

/** [width, height, depth] of the mast (vertical lift column) */
export const FORKLIFT_MAST_SIZE: [number, number, number] = [0.12, 3.5, 0.12];
/** Y position of the mast center */
export const FORKLIFT_MAST_Y = 1.75;
/** X offset for left/right mast rails */
export const FORKLIFT_MAST_X = 0.5;
/** Z position of the mast (front of vehicle) */
export const FORKLIFT_MAST_Z = -1.5;

/** [width, height, depth] of the carriage backplate (connects forks to mast) */
export const FORKLIFT_CARRIAGE_SIZE: [number, number, number] = [1.4, 0.5, 0.1];
/** Y position of the carriage */
export const FORKLIFT_CARRIAGE_Y = 0.8;
/** Z position of the carriage */
export const FORKLIFT_CARRIAGE_Z = -1.55;

/** [width, height, depth] of each fork tine */
export const FORKLIFT_FORK_SIZE: [number, number, number] = [0.15, 0.08, 1.6];
/** Y position of the fork tines (low to ground for loading) */
export const FORKLIFT_FORK_Y = 0.3;
/** Z offset of fork tines from mast (reaching forward) */
export const FORKLIFT_FORK_Z = -2.35;
/** X offset for left fork tine */
export const FORKLIFT_FORK_LEFT_X = -0.38;
/** X offset for right fork tine */
export const FORKLIFT_FORK_RIGHT_X = 0.38;

/** Radius of each forklift wheel cylinder */
export const FORKLIFT_WHEEL_RADIUS = 0.38;
/** Height (depth) of each wheel cylinder */
export const FORKLIFT_WHEEL_HEIGHT = 0.22;
/** Number of radial segments for wheel cylinder geometry */
export const FORKLIFT_WHEEL_SEGMENTS = 20;
/** Y position of the wheel axle centers */
export const FORKLIFT_WHEEL_Y = 0.01;
/** X offset for left/right wheels */
export const FORKLIFT_WHEEL_X = 1.05;
/** Z offset for front wheels */
export const FORKLIFT_WHEEL_Z_FRONT = -0.9;
/** Z offset for rear wheels */
export const FORKLIFT_WHEEL_Z_REAR = 0.9;

/** Radius of wheel hub caps (decorative inner disc) */
export const FORKLIFT_HUB_RADIUS = 0.18;
/** Height of hub caps */
export const FORKLIFT_HUB_HEIGHT = 0.24;
/** Number of hub cap segments */
export const FORKLIFT_HUB_SEGMENTS = 16;

/** Y position of the floating shipment counter above the forklift */
export const FORKLIFT_COUNTER_TEXT_Y = 5.0;
/** Y position of the "SHIPMENT" label below the counter */
export const FORKLIFT_LABEL_Y = 4.0;

// ─── Forklift pallet ────────────────────────────────────────────────────────

/**
 * [width, height, depth] of the wooden pallet box sitting on the fork tines.
 * Width spans both forks (1.0), height gives a visible stack target (0.14),
 * depth matches fork length (1.6) so tiles cannot slide off either end.
 */
export const FORKLIFT_PALLET_SIZE: [number, number, number] = [1.0, 0.14, 1.6];
/**
 * Y position of the pallet.
 * = fork Y (0.3) + half fork height (0.04) + half pallet height (0.07) = 0.41
 * This seats the pallet flush on top of the fork tines.
 */
export const FORKLIFT_PALLET_Y = 0.41;
/** Z position of the pallet — same Z as the fork tines */
export const FORKLIFT_PALLET_Z = -2.35;

/**
 * Maximum number of stacked tile meshes rendered on the pallet.
 * Tiles are collected and removed from the belt, but this many
 * visual copies are shown on the pallet to give a "growing stack"
 * impression (shipmentCount % MAX + 1 visible layers).
 */
export const FORKLIFT_PALLET_STACK_MAX = 4;
/** Height of each stacked tile layer on the pallet (world units) */
export const FORKLIFT_PALLET_TILE_H = 0.08;



