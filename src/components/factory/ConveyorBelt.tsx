/**
 * ConveyorBelt.tsx — Main Conveyor Belt System
 *
 * The most complex component in the project. Manages:
 *  - A CatmullRom spline loop with SLAT_COUNT rolling slats
 *  - Tile spawning on P-Clock ticks (at the Press station)
 *  - Tile movement along the spline (t-parameter 0→1)
 *  - Dryer FIFO queue (threshold=10, capacity=15): entry-driven one-in→one-out release
 *  - Kiln FIFO queue (threshold=40, capacity=45): entry-driven one-in→one-out release
 *  - Second quality routing (station-defect tiles to amber box)
 *  - Shipment collection (first quality tiles to shipment box)
 *  - Sort/collect arc animations with parabolic interpolation
 *  - Jam recovery: elevated defect rate for JAM_RECOVERY_TILES after jam clears
 *
 * Performance optimizations:
 *  - Pre-allocated scratch Vector3s (avoid GC pressure in useFrame)
 *  - Vector3 object pool for PartData.originalPos
 *  - MAX_VISIBLE_PARTS cap to prevent memory exhaustion
 *  - Granular Zustand selectors (no full-store re-renders)
 *  - useRef for per-frame values to avoid stale closures
 *
 * Architecture:
 *  - This file contains 3 sub-components:
 *    • Part — Renders a single tile mesh at its current position
 *    • PartSpawner — Drives tile lifecycle (spawn, move, sort, collect)
 *    • ConveyorBelt — Top-level composition (curve, slats, spawner)
 *  - Must be rendered inside the R3F <Canvas> tree
 *  - Uses `key={resetVersion}` to fully remount on factory reset
 *
 * Used by: Scene.tsx
 */
import { useRef, useMemo, useState, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import { Text } from "@react-three/drei";
import * as THREE from "three";
import { useSimulationStore } from "../../store/simulationStore";
import { useSimulationDataStore } from "../../store/simulationDataStore";
/** Work Order store — provides the pressLimitReached flag for spawn guard */
import { useWorkOrderStore } from "../../store/workOrderStore";
/** UI store — used by Phase 2 to re-arm the Demo Settings gate after WO completion */
import { useUIStore } from "../../store/uiStore";
/** Recipe + Work Order param data — used to look up tile colours for the active recipe */
import { WORK_ORDERS, RECIPES } from "../../lib/params/demo";
/** Sync service — used by Phase 2 to flush final data to Supabase before opening panels */
import { syncService } from "../../services/syncService";
/** OEE snapshot service — used by Phase 2 to capture post-drain OEE totals */
import { oeeSnapshotService } from "../../services/oeeSnapshotService";
/** Logger — scoped logger for Phase 2 shutdown messages */
import { createLogger } from "../../lib/logger";

import {
  computeBaseVelocity,
  SLAT_COUNT,
  SLAT_SPEED_MULTIPLIER,
  SPAWN_T,
  SORT_THRESHOLD,
  COLLECT_THRESHOLD,
  END_OF_LINE_T,
  CONVEYOR_CURVE_POINTS,
  CONVEYOR_CURVE_TENSION,
  SLAT_GEOMETRY,
  TILE_GEOMETRY,
  TILE_Y_OFFSET,
  COLORS,
  MATERIALS,
  TEXT_SIZES,
  SORT_ANIMATION_SPEED,
  COLLECT_ANIMATION_SPEED,
  SORT_ARC_HEIGHT,
  COLLECT_ARC_HEIGHT,
  SORT_FADE_THRESHOLD,
  SORT_FADE_RATE,
  COLLECT_FADE_THRESHOLD,
  COLLECT_FADE_RATE,
  COLLECT_TARGET_Y,
  SORT_TARGET_Y,
  COLLECT_CLAMP_T,
  TRASH_BIN_POSITION,
  SECOND_QUALITY_BOX_POSITION,
  FORKLIFT_COLLECT_TARGET,
  FORKLIFT_PALLET_Y,
  FORKLIFT_PALLET_STACK_MAX,
  FORKLIFT_PALLET_TILE_H,
  DRYER_ENTRY_T,
  DRYER_RELEASE_THRESHOLD,
  DRYER_QUEUE_CAPACITY,
  DRYER_RELEASE_SPACING,
  KILN_ENTRY_T,
  KILN_QUEUE_CAPACITY,
  KILN_RELEASE_THRESHOLD,
  KILN_RELEASE_SPACING,
  DRYER_MIN_DWELL_MS,
  KILN_MIN_DWELL_MS,
  STATION_SPACING,
  STATION_STAGES,
  SNAPSHOT_TOLERANCE,
  JAM_LOCATION_T_POSITIONS,
  JAM_INTERCEPT_TOLERANCE,
  MAX_VISIBLE_PARTS,
  SQ_ANIMATION_SPEED,
  SQ_ARC_HEIGHT,
  SQ_TARGET_Y,
  SQ_FADE_THRESHOLD,
  SQ_FADE_RATE,
  SCRAP_ANIMATION_SPEED,
  SCRAP_ARC_HEIGHT,
  SCRAP_ARC_EXPONENT,
  SCRAP_TARGET_Y,
  SCRAP_FADE_THRESHOLD,
  SCRAP_FADE_RATE,
  SCRAP_TUMBLE_SPEED,
  SCRAP_EASE_EXPONENT,
} from "../../lib/params";
/** Phase 4: buffering threshold before visual engine starts consuming snapshots */
import { MIN_BUFFERED_BEFORE_PLAY } from "../../lib/params/simulation";

// ── Pre-allocated scratch vectors (avoid GC in useFrame) ───────────
// These are module-level singletons, reused every frame.
// NEVER use these in parallel — they are single-instance per variable.

/** Scratch vector for a tile's target position on the curve */
const _targetPos = new THREE.Vector3();
/** Scratch vector for a tile's current interpolated position */
const _currentPos = new THREE.Vector3();
/** Scratch vector for orienting tiles to face forward on the curve */
const _lookAtPos = new THREE.Vector3();
/** Pre-computed 3D world position of the waste bin (sort animation target) */
const _sortTarget = new THREE.Vector3(
  TRASH_BIN_POSITION[0],
  SORT_TARGET_Y,
  TRASH_BIN_POSITION[2],
);
/**
 * Pre-computed 3D world position for the collect animation target.
 * Uses FORKLIFT_COLLECT_TARGET (fork world position) rather than
 * FORKLIFT_POSITION (body centre) so tiles visually land ON the forks.
 */
const _collectTarget = new THREE.Vector3(
  FORKLIFT_COLLECT_TARGET[0],
  COLLECT_TARGET_Y,
  FORKLIFT_COLLECT_TARGET[2],
);
/** Pre-computed 3D world position of the second quality box (SQ animation target) */
const _secondQualityTarget = new THREE.Vector3(
  SECOND_QUALITY_BOX_POSITION[0],
  SQ_TARGET_Y,
  SECOND_QUALITY_BOX_POSITION[2],
);

/**
 * Shared Vector3 pool for PartData.originalPos to avoid per-tile allocation.
 * When a tile is removed, its Vector3 is returned to the pool for reuse.
 */
const _vec3Pool: THREE.Vector3[] = [];
/** Acquire a Vector3 from the pool (or create a new one if pool is empty) */
const acquireVec3 = (): THREE.Vector3 => _vec3Pool.pop() ?? new THREE.Vector3();
/** Return a Vector3 to the pool after resetting it to (0,0,0) */
const releaseVec3 = (v: THREE.Vector3) => {
  v.set(0, 0, 0);
  _vec3Pool.push(v);
};

/**
 * Internal data for a single tile on the conveyor belt.
 * This is NOT a React component — it's a plain data object
 * managed imperatively inside PartSpawner's useFrame loop.
 */
interface PartData {
  /** Unique tile ID (matches P-Clock count at spawn time) */
  id: number;
  /** Normalized position on the spline curve (0→1). 0=start, 1=end of line */
  t: number;
  /** Whether this tile was flagged as defective at the sorting station */
  isDefected: boolean;
  /** Whether this tile has started its sort-to-waste-bin animation */
  isSorted: boolean;
  /** Sort animation progress (0→1). At 1.0, tile is removed */
  sortProgress: number;
  /** Whether this tile has started its collect-to-shipment animation */
  isCollected: boolean;
  /** Collect animation progress (0→1). At 1.0, tile is removed */
  collectProgress: number;
  /** Whether this tile has been flagged as second quality by the data layer */
  isSecondQuality: boolean;
  /** Whether this tile has started its sort-to-2nd-quality-box animation */
  isSecondQualitySorted: boolean;
  /** Second quality animation progress (0→1). At 1.0, tile is removed */
  secondQualityProgress: number;
  /** Snapshot of tile's world position when sort/collect begins (pooled) */
  originalPos: THREE.Vector3;
  /** Current visual scale (0→1). Animated on spawn for a grow-in effect */
  scale: number;
  /** How the tile's collect animation should position relative to Y axis.
   * Computed at collect-start time from the current shipmentCount so each
   * tile lands exactly on top of the previous one in the visible stack. */
  collectTargetY: number;
  /** Whether this tile is currently waiting in the dryer FIFO queue */
  isQueued: boolean;
  /** Whether this tile has already passed through the Dryer station */
  hasVisitedDryer: boolean;
  /** Whether this tile is currently waiting in the Kiln FIFO queue */
  isKilnQueued: boolean;
  /** Whether this tile has already passed through the Kiln station */
  hasVisitedKiln: boolean;
  /**
   * High-resolution timestamp (performance.now()) when the tile entered
   * either the Dryer or Kiln queue. Used to enforce minimum dwell time.
   */
  enteredQueueAt: number | null;
  /**
   * Whether this tile has started its per-station scrap arc animation
   * (thrown from the station where the defect was detected to the waste bin).
   * Set to true when the scrappedPartIds bridge flags the tile AND
   * the scrap probability dice roll succeeds.
   */
  isScrapped: boolean;
  /**
   * Animation progress for the scrap arc (0→1).
   * At 1.0, tile has reached the waste bin and is removed from partsRef.
   */
  scrapProgress: number;
}

/**
 * Part — Renders a single tile mesh on the conveyor belt.
 *
 * Responsibilities:
 *  - Compute the tile's 3D position from its t-parameter on the curve
 *  - Animate sort (parabolic arc to waste bin) and collect (arc to shipment)
 *  - Apply visual states: normal (light grey), defected (pink), jammed (red)
 *  - Show the tile ID label on top of the tile
 *  - Handle spawn scale-in animation
 *
 * This component runs its positioning logic inside useFrame for 60fps updates.
 */
function Part({
  data,
  curve,
  normalColor,
  defectedColor,
}: {
  data: PartData;
  curve: THREE.CatmullRomCurve3;
  /** Hex colour for normal (non-defected) tiles — from the active recipe */
  normalColor: string;
  /** Hex colour for defected tiles — from the active recipe (always grey per spec) */
  defectedColor: string;
}) {
  const meshRef = useRef<THREE.Group>(null);

  useFrame(() => {
    if (!meshRef.current || !data) return;

    /**
     * ── UNIFIED VISIBILITY GATE ──────────────────────────────────────────
     *
     * Determines whether this tile should be visible in the scene AT ALL.
     * Uses THREE.js `visible` property (not scale) because:
     *   1. `visible=false` completely excludes the object from the GPU
     *      render pipeline — zero rendering cost, zero visual artifacts.
     *   2. `scale(0,0,0)` still submits draw calls to the GPU and can
     *      flash at the default position (0,0,0) before useFrame runs.
     *   3. The JSX `<group visible={false}>` ensures the mesh is NEVER
     *      rendered before the first useFrame positions it correctly.
     *
     * A tile is hidden when ANY of these conditions is true:
     *   a) Tile is inside the Dryer FIFO queue (isQueued=true)
     *   b) Tile is inside the Kiln FIFO queue (isKilnQueued=true)
     *   c) Tile has advanced past KILN_ENTRY_T but hasn't been processed
     *      by PartSpawner's kiln-entry check yet (frame-order race guard)
     *   d) Tile has advanced past DRYER_ENTRY_T but hasn't been processed
     *      by PartSpawner's dryer-entry check yet (frame-order race guard)
     */
    /**
     * Scrapped tiles are controlled by the scrap arc animation, not belt
     * position. Their `t` still advances from the main loop, which would
     * trigger the Dryer/Kiln visibility gate and hide them mid-flight.
     * Bypass the gate entirely so the arc animation stays visible.
     */
    const shouldHide =
      !data.isScrapped &&
      (data.isQueued ||
        data.isKilnQueued ||
        (!data.hasVisitedKiln &&
          !data.isKilnQueued &&
          data.t >= KILN_ENTRY_T) ||
        (!data.hasVisitedDryer && !data.isQueued && data.t >= DRYER_ENTRY_T));

    if (shouldHide) {
      meshRef.current.visible = false;
      return;
    }

    /** Tile is eligible to be drawn — make it visible. */
    meshRef.current.visible = true;

    if (data.isScrapped) {
      /**
       * PER-STATION SCRAP ARC — Michael Jordan three-pointer swish.
       *
       * Two key principles:
       *   1. POSITION uses ease-out interpolation so the tile reaches the
       *      bin's X/Z position by ~80% of the animation, giving 20% for
       *      the vertical descent into the basket. Without easing, a tile
       *      from press (x=-15) wouldn't reach the bin edge until 97%.
       *   2. ARC HEIGHT uses the original linear progress with exponent 1.8
       *      for a steep peak that drops sharply — the tile crosses the rim
       *      at ~90% and is INSIDE the bin when the fade kicks in.
       *
       * The result: tile arcs high, travels fast to above the bin, then
       * drops cleanly through the opening — nothing but net.
       */
      _targetPos.set(
        TRASH_BIN_POSITION[0],
        SCRAP_TARGET_Y,
        TRASH_BIN_POSITION[2],
      );
      /**
       * Ease-out: 1 - pow(1-p, 3) makes position reach ~99% of target by
       * 80% of animation. Tile arrives ABOVE the bin early.
       */
      const eased = 1 - Math.pow(1 - data.scrapProgress, SCRAP_EASE_EXPONENT);
      _currentPos.lerpVectors(data.originalPos, _targetPos, eased);

      /**
       * Arc uses ORIGINAL progress (not eased) — the steep exponent 1.8
       * creates a peak at ~50% then drops through the rim at ~90%.
       */
      const arc =
        Math.pow(Math.sin(data.scrapProgress * Math.PI), SCRAP_ARC_EXPONENT) *
        SCRAP_ARC_HEIGHT;
      meshRef.current.position.copy(_currentPos);
      meshRef.current.position.y += arc;

      /**
       * Controlled tumble: single-axis spin that decelerates as the tile
       * approaches the bin. (1 - progress) ensures rotation slows to zero
       * at landing, giving a satisfying "settling" visual.
       */
      meshRef.current.rotateX(SCRAP_TUMBLE_SPEED * (1 - data.scrapProgress));

      /** Late fade: tile stays fully visible until 90% of the arc. */
      if (data.scrapProgress > SCRAP_FADE_THRESHOLD) {
        const s =
          1 - (data.scrapProgress - SCRAP_FADE_THRESHOLD) * SCRAP_FADE_RATE;
        meshRef.current.scale.set(s, s, s);
      } else {
        meshRef.current.scale.set(1, 1, 1);
      }
    } else if (data.isSorted) {
      _targetPos.copy(_sortTarget);
      _currentPos.lerpVectors(data.originalPos, _targetPos, data.sortProgress);
      const arc = Math.sin(data.sortProgress * Math.PI) * SORT_ARC_HEIGHT;
      meshRef.current.position.copy(_currentPos);
      meshRef.current.position.y += arc;
      meshRef.current.rotateX(0.1);

      if (data.sortProgress > SORT_FADE_THRESHOLD) {
        const s =
          1 - (data.sortProgress - SORT_FADE_THRESHOLD) * SORT_FADE_RATE;
        meshRef.current.scale.set(s, s, s);
      } else {
        meshRef.current.scale.set(1, 1, 1);
      }
    } else if (data.isSecondQualitySorted) {
      /**
       * Second quality arc animation — toward amber 2nd quality box.
       *
       * Uses an asymmetric parabolic arc: Math.pow(sin(p*π), 0.6) shifts the
       * peak earlier than the midpoint (exponent < 1 compresses the curve
       * leftward). Effect: tile launches HIGH quickly, peaks before crossing
       * above the box rim, then descends smoothly into the box interior —
       * preventing the "tile hits the side wall on the way down" problem
       * that occurred with the symmetric sin arc + low SQ_TARGET_Y.
       */
      _targetPos.copy(_secondQualityTarget);
      _currentPos.lerpVectors(
        data.originalPos,
        _targetPos,
        data.secondQualityProgress,
      );
      const arc =
        Math.pow(Math.sin(data.secondQualityProgress * Math.PI), 0.6) *
        SQ_ARC_HEIGHT;
      meshRef.current.position.copy(_currentPos);
      meshRef.current.position.y += arc;
      /** Small tumble rotation for a natural "tossed into box" feel */
      meshRef.current.rotateX(0.08);

      if (data.secondQualityProgress > SQ_FADE_THRESHOLD) {
        /** Fade tile out quickly once inside the box interior */
        const s =
          1 - (data.secondQualityProgress - SQ_FADE_THRESHOLD) * SQ_FADE_RATE;
        meshRef.current.scale.set(
          Math.max(0, s),
          Math.max(0, s),
          Math.max(0, s),
        );
      } else {
        meshRef.current.scale.set(1, 1, 1);
      }
    } else if (data.isCollected) {
      // Per-tile Y from PartData so each tile lands on top of the stack
      _targetPos.set(_collectTarget.x, data.collectTargetY, _collectTarget.z);
      _currentPos.lerpVectors(
        data.originalPos,
        _targetPos,
        data.collectProgress,
      );
      /**
       * Asymmetric parabolic arc: Math.pow(sin(p*π), 0.65) shifts the peak
       * earlier than the midpoint (exponent < 1 compresses the curve leftward).
       * Effect: tile launches HIGH quickly then descends smoothly onto the forks,
       * avoiding the "dipping to ground" illusion of a symmetric sin arc.
       */
      const arc =
        Math.pow(Math.sin(data.collectProgress * Math.PI), 0.65) *
        COLLECT_ARC_HEIGHT;
      meshRef.current.position.copy(_currentPos);
      meshRef.current.position.y += arc;

      if (data.collectProgress > COLLECT_FADE_THRESHOLD) {
        const s =
          1 -
          (data.collectProgress - COLLECT_FADE_THRESHOLD) * COLLECT_FADE_RATE;
        meshRef.current.scale.set(
          Math.max(0, s),
          Math.max(0, s),
          Math.max(0, s),
        );
      } else {
        meshRef.current.scale.set(1, 1, 1);
      }
    } else {
      const point = curve.getPointAt(data.t);
      const tangent = curve.getTangentAt(data.t);
      meshRef.current.position.copy(point);
      meshRef.current.position.y += TILE_Y_OFFSET;
      // Yaw-only rotation: keeps tile FLAT on the belt (no X/Z tilt)
      // while still aligning it with the conveyor travel direction.
      // atan2(tangent.x, tangent.z) gives the horizontal bearing angle.
      meshRef.current.rotation.set(0, Math.atan2(tangent.x, tangent.z), 0);
      meshRef.current.scale.set(data.scale, data.scale, data.scale);
    }
  });

  return (
    /**
     * visible={false} — Critical: the group starts INVISIBLE in the scene.
     * This prevents THREE.js from rendering the mesh at its default position
     * (0,0,0) on the frame when the component mounts but useFrame hasn't run
     * yet. The useFrame callback above explicitly sets visible=true only when
     * the tile should actually be drawn. This eliminates the "flash at kiln
     * exit" artifact that occurred with scale-based hiding.
     */
    <group ref={meshRef} visible={false}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={TILE_GEOMETRY} />
        <meshStandardMaterial
          color={data.isDefected ? defectedColor : normalColor}
          roughness={MATERIALS.tile.roughness}
          metalness={MATERIALS.tile.metalness}
        />
      </mesh>
      <Text
        position={[0, TEXT_SIZES.tileIdYOffset, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={TEXT_SIZES.tileId}
        color={COLORS.tileLabel}
        anchorX="center"
        anchorY="middle"
      >
        {data.id}
      </Text>
    </group>
  );
}

/**
 * PartSpawner — Tile Lifecycle Manager
 *
 * Drives the entire tile lifecycle inside a single useFrame loop:
 *  1. Spawn tiles at SPAWN_T on each P-Clock tick
 *  2. Move tiles along the curve at visualVelocity
 *  3. Queue tiles at the dryer station (FIFO, capacity=10)
 *  4. Detect defects at the sorting station (DEFECT_PROBABILITY)
 *  5. Animate sort (defected → waste bin) and collect (good → shipment box)
 *  6. Remove completed tiles and return pooled Vector3s
 *  7. Sync partPositionsRef and partIdsRef to simulationStore
 *
 * Also handles jam recovery: for JAM_RECOVERY_TILES after a jam clears,
 * the defect probability is multiplied by JAM_SCRAP_RATE_MULTIPLIER.
 */
function PartSpawner({
  curve,
  status,
  visualVelocity,
}: {
  curve: THREE.CatmullRomCurve3;
  status: string;
  visualVelocity: number;
}) {
  const pClockCount = useSimulationStore((s) => s.pClockCount);
  /** Records the shipped tile ID into the pallet circular buffer (for Forklift.tsx label render) */
  const addShippedTileId = useSimulationStore((s) => s.addShippedTileId);
  /** Drain mode flag: belt keeps running but no new tiles spawn */
  const isDraining = useSimulationStore((s) => s.isDraining);
  /** Called when all tiles have exited during drain — triggers final stop */
  const completeDrain = useSimulationStore((s) => s.completeDrain);

  /**
   * routeMapRef — Phase 3 TickSnapshot-driven routing decisions.
   *
   * Populated by consuming TickSnapshot completions in useFrame.
   * When a tile's completion event arrives, we write its routing decision
   * here. When the tile reaches SORT/COLLECT threshold, we read this map
   * instead of bridge sets (scrappedPartIds, secondQualityPartIds).
   *
   * This eliminates dual-engine divergence: ALL routing decisions come
   * from the data engine via TickSnapshots.
   */
  const routeMapRef = useRef<
    Map<
      number,
      {
        destination: "shipment" | "secondQuality" | "wasteBin";
        isDefected: boolean;
      }
    >
  >(new Map());

  const [partIds, setPartIds] = useState<number[]>([]);
  const partsRef = useRef<Map<number, PartData>>(new Map());

  /**
   * Phase 2 one-shot guard: ensures the shutdown sequence
   * (drain → sync → pause → open panels) runs exactly once.
   * Set to true the instant Phase 2 detects partsRef.size===0.
   * Reset to false when pClockCount resets to 0 (new simulation run).
   */
  const phase2FiredRef = useRef(false);
  /** Scoped logger for Phase 2 shutdown messages */
  const phase2Log = useRef(createLogger("Phase2"));
  const dryerQueueRef = useRef<number[]>([]);
  /** Tracks the ID of the last tile released from the dryer queue,
   *  used for dynamic gap checking to prevent tile overlap. */
  const lastReleasedIdRef = useRef<number | null>(null);
  /** FIFO queue for the Kiln station — holds tile IDs awaiting firing. */
  const kilnQueueRef = useRef<number[]>([]);
  /** Tracks the ID of the last tile released from the Kiln queue,
   *  used for dynamic gap checking to prevent tile overlap after the Kiln. */
  const lastKilnReleasedIdRef = useRef<number | null>(null);

  /**
   * 1-slot virtual occupant for each pass-through station.
   * Tracks the LAST tile detected within SNAPSHOT_TOLERANCE of each station's
   * STATION_STAGES position. Updated every frame. Persists until a new tile
   * replaces it or the tracked tile is removed (sorted/scrapped/collected).
   *
   * Indices: 0=Press, 1=Dryer, 2=Glaze, 3=Printer, 4=Kiln, 5=Sorting, 6=Packaging
   * Only indices 2, 3, 5, 6 are used (Press=hardcoded, Dryer/Kiln=queue heads).
   */
  const stationOccupantRef = useRef<(number | null)[]>(
    new Array(STATION_STAGES.length).fill(null),
  );

  // Reset queues on session start (id=0) to prevent stale IDs from being released.
  useEffect(() => {
    if (pClockCount === 0) {
      /** Clear Dryer queue internal array */
      dryerQueueRef.current = [];
      /** Clear Kiln queue internal array */
      kilnQueueRef.current = [];
      /** Reset gap-check tracking for a clean start */
      lastReleasedIdRef.current = null;
      lastKilnReleasedIdRef.current = null;
      /** Clear all 1-slot station occupants for a fresh simulation run */
      stationOccupantRef.current.fill(null);
      /** Reset Phase 2 one-shot guard for the new run */
      phase2FiredRef.current = false;
      /** Phase 4: Clear routeMapRef to prevent stale routing from previous runs */
      routeMapRef.current.clear();
    }
  }, [pClockCount]);

  /**
   * Station-specific jam state — read from simulationStore for Phase 1
   * scrapping logic. During jam_scrapping, tiles at the jammed station
   * are intercepted and MJ-swished to the recycle bin.
   */
  const jamLocation = useSimulationStore((s) => s.jamLocation);
  const jamScrapsRemaining = useSimulationStore((s) => s.jamScrapsRemaining);
  const decrementJamScraps = useSimulationStore((s) => s.decrementJamScraps);
  const setConveyorStatusAction = useSimulationStore(
    (s) => s.setConveyorStatus,
  );

  const prevStatusRef = useRef(status);

  // Reset dryer/kiln release tracking when belt stops or enters jammed
  useEffect(() => {
    if (status === "stopped" || status === "jammed") {
      lastReleasedIdRef.current = null;
      /** Also reset Kiln release tracking so a fresh gap-check starts on resume. */
      lastKilnReleasedIdRef.current = null;
      /**
       * Reset Phase 2 one-shot guard whenever the belt enters 'stopped'.
       *
       * CRITICAL FIX: The old code only reset phase2FiredRef when
       * pClockCount===0 (full factory reset). This meant that after
       * Phase 2 completed (auto-stop), a Stop → Start cycle without
       * Reset would leave phase2FiredRef=true. The next batch would
       * drain all tiles but Phase 2 would never fire, so the simulation
       * would run indefinitely — contributing to the runaway bug.
       *
       * By resetting here on ANY 'stopped' transition, we ensure Phase 2
       * is re-armed for the next simulation run, regardless of whether
       * the user did a full Reset or a manual Stop → Start.
       */
      if (status === "stopped") {
        phase2FiredRef.current = false;
      }
    }

    /**
     * Phase 1 → Phase 2 queue scrapping for Dryer/Kiln.
     * When entering jam_scrapping, if the jammed station has a queue,
     * immediately pop and scrap tiles from that queue.
     */
    if (
      status === "jam_scrapping" &&
      prevStatusRef.current !== "jam_scrapping"
    ) {
      const loc = useSimulationStore.getState().jamLocation;
      const remaining = useSimulationStore.getState().jamScrapsRemaining;

      if (loc === "dryer" && dryerQueueRef.current.length > 0) {
        /** Scrap tiles from the Dryer queue (pop from queue, mark as scrapped) */
        const toScrap = Math.min(remaining, dryerQueueRef.current.length);
        for (let i = 0; i < toScrap; i++) {
          const tileId = dryerQueueRef.current.shift()!;
          const tile = partsRef.current.get(tileId);
          if (tile) {
            /** Make tile visible at station position, then arc to bin */
            tile.isQueued = false;
            tile.isScrapped = true;
            tile.scrapProgress = 0;
            tile.originalPos.copy(
              curve.getPointAt(JAM_LOCATION_T_POSITIONS.dryer),
            );
            tile.t = JAM_LOCATION_T_POSITIONS.dryer;
            /** Jam scrap counters — these remain as direct store calls for jam visuals */
            useSimulationStore.getState().incrementScrapCount();
            useSimulationStore.getState().incrementWasteCount();
            decrementJamScraps();
          }
        }
      } else if (loc === "kiln" && kilnQueueRef.current.length > 0) {
        /** Scrap tiles from the Kiln queue (pop from queue, mark as scrapped) */
        const toScrap = Math.min(remaining, kilnQueueRef.current.length);
        for (let i = 0; i < toScrap; i++) {
          const tileId = kilnQueueRef.current.shift()!;
          const tile = partsRef.current.get(tileId);
          if (tile) {
            /** Make tile visible at station position, then arc to bin */
            tile.isKilnQueued = false;
            tile.isScrapped = true;
            tile.scrapProgress = 0;
            tile.originalPos.copy(
              curve.getPointAt(JAM_LOCATION_T_POSITIONS.kiln),
            );
            tile.t = JAM_LOCATION_T_POSITIONS.kiln;
            /** Jam scrap counters — these remain as direct store calls for jam visuals */
            useSimulationStore.getState().incrementScrapCount();
            useSimulationStore.getState().incrementWasteCount();
            decrementJamScraps();
          }
        }
      }

      /**
       * If all scraps have been satisfied by queue tiles alone,
       * immediately transition to Phase 2 (jammed / belt stopped).
       */
      const scrapsNow = useSimulationStore.getState().jamScrapsRemaining;
      if (scrapsNow <= 0) {
        setConveyorStatusAction("jammed");
      }
    }

    prevStatusRef.current = status;
  }, [status]);

  // ═══════════════════════════════════════════════════════════════════
  // QUEUE RELEASE HELPERS (called from useFrame — no useEffect race)
  // ═══════════════════════════════════════════════════════════════════
  //
  // Three release modes:
  //   1. NORMAL: triggered when a new tile enters the queue AND
  //      queue.length > threshold. Gap-check applies.
  //   2. FORCE: triggered when queue.length >= capacity (headroom full).
  //      Gap-check bypassed to prevent unbounded growth.
  //   3. DRAIN: triggered when pressLimitReached=true (post-production).
  //      Releases tiles even without new entries. Gap-check applies.
  //
  // By running release inside useFrame (same frame as entry), we guarantee
  // atomic one-in → one-out semantics with zero timing race.

  /**
   * releaseFromDryer — Attempt to shift the oldest tile out of the
   * Dryer FIFO queue and place it back on the belt.
   *
   * @param bypassGap - When true (force-release), skip the dynamic
   *   gap check. When false, verify sufficient clearance from the
   *   last released tile before proceeding.
   * @returns true if a tile was released, false if gap-blocked or queue empty.
   */
  const releaseFromDryerRef = useRef((bypassGap: boolean): boolean => {
    /**
     * Gap check: only release if there's enough space on the belt after
     * the Dryer station (STATION_STAGES[1]) to accommodate the new tile.
     */
    const parts = Array.from(partsRef.current.values());
    const isGapClear =
      bypassGap ||
      !parts.some(
        (p) =>
          !p.isQueued &&
          !p.isKilnQueued &&
          p.t > DRYER_ENTRY_T &&
          p.t < DRYER_ENTRY_T + STATION_SPACING,
      );

    if (isGapClear) {
      /** Dwell time check: enforce minimum duration inside the machine to prevent instant jumps. */
      const headId = dryerQueueRef.current[0]; // Retrieve the ID of the oldest tile in the FIFO queue.
      if (headId !== undefined) {
        const headPart = partsRef.current.get(headId); // Look up the actual part data using the ID.
        if (headPart?.enteredQueueAt) {
          /** Calculate how long the tile has been inside the Dryer station. */
          const elapsed = performance.now() - headPart.enteredQueueAt;
          /** If the minimum dwell time hasn't been reached, skip release to avoid visual artifacts. */
          if (elapsed < DRYER_MIN_DWELL_MS) return false;
        }
      }

      const releasedId = dryerQueueRef.current.shift();
      if (releasedId === undefined) return false;
      const part = partsRef.current.get(releasedId);
      if (!part) return false;
      /** Un-queue: tile resumes normal belt movement. */
      part.isQueued = false;
      /** Position tile at the Dryer's right edge (x ≈ -10). */
      part.t = DRYER_ENTRY_T + DRYER_RELEASE_SPACING;
      /** Full size immediately — the Part visibility gate handles the hide/show. */
      part.scale = 1;
      /** Track for next gap check. */
      lastReleasedIdRef.current = releasedId;
      return true;
    }
    return false;
  });

  /**
   * releaseFromKiln — Attempt to shift the oldest tile out of the
   * Kiln FIFO queue and place it back on the belt.
   *
   * @param bypassGap - When true (force-release), skip the dynamic
   *   gap check. When false, verify sufficient clearance.
   * @returns true if a tile was released, false if gap-blocked or queue empty.
   */
  const releaseFromKilnRef = useRef((bypassGap: boolean): boolean => {
    /**
     * Gap check: only release if there's enough space on the belt after
     * the Kiln station (STATION_STAGES[4]) to accommodate the new tile.
     * Positions around t=0.3125 (KILN_ENTRY_T).
     */
    const parts = Array.from(partsRef.current.values());
    const isGapClear =
      bypassGap ||
      !parts.some(
        (p) =>
          !p.isQueued &&
          !p.isKilnQueued &&
          p.t > KILN_ENTRY_T &&
          p.t < KILN_ENTRY_T + STATION_SPACING,
      );

    if (isGapClear) {
      /** Dwell time check: prevent the 'instant teleport' glitch by enforcing a minimum kiln time. */
      const headId = kilnQueueRef.current[0]; // Access the first tile in the Kiln's internal FIFO queue.
      if (headId !== undefined) {
        const headPart = partsRef.current.get(headId); // Fetch metadata for the oldest tile in the kiln.
        if (headPart?.enteredQueueAt) {
          /** Determine total duration residency by comparing current time to entry timestamp. */
          const elapsed = performance.now() - headPart.enteredQueueAt;
          /** Abort release if minimum dwell time isn't met (ensures cinematic processing flow). */
          if (elapsed < KILN_MIN_DWELL_MS) return false;
        }
      }

      const releasedId = kilnQueueRef.current.shift();
      if (releasedId === undefined) return false;
      const part = partsRef.current.get(releasedId);
      if (!part) return false;
      /** Un-queue: tile resumes normal belt movement. */
      part.isKilnQueued = false;
      /** Position tile at the Kiln's right edge (x ≈ 4.5). */
      part.t = KILN_ENTRY_T + KILN_RELEASE_SPACING;
      /** Full size immediately — the Part visibility gate handles the hide/show. */
      part.scale = 1;
      /** Track for next gap check. */
      lastKilnReleasedIdRef.current = releasedId;
      return true;
    }
    return false;
  });

  useEffect(() => {
    /**
     * Press spawning gate: allow spawning when belt is 'running' OR
     * during 'jam_scrapping' (Phase 1 — press doesn't know about the
     * jam until the belt fully stops in Phase 2).
     */
    if (
      (status !== "running" && status !== "jam_scrapping") ||
      pClockCount === 0
    )
      return;
    // Enforce hard cap on visible parts
    if (partsRef.current.size >= MAX_VISIBLE_PARTS) {
      // DEBUG: uncomment to trace
      // console.log(`[SPAWN-SKIP] pClock=${pClockCount} partsRef=${partsRef.current.size} >= MAX=${MAX_VISIBLE_PARTS}`);
      return;
    }

    /**
     * Work Order press limit guard.
     * When the WorkOrder enforcer (useWorkOrderEnforcer) sets pressLimitReached=true,
     * it means pClockCount has reached the selected Work Order's actualTileCount.
     * No new tiles should be spawned — the press has finished its batch.
     * We read the store imperatively (getState) to avoid adding a new reactive
     * dependency to this effect, which would cause it to re-run unnecessarily.
     */
    const woState = useWorkOrderStore.getState();
    // ── DEBUG: trace spawn decisions (REMOVE AFTER DEBUGGING) ──
    if (pClockCount % 50 === 0 || pClockCount >= 525) {
      console.log(
        `[SPAWN] pClock=${pClockCount} tilesSpawned=${woState.tilesSpawned}` +
          ` pressLimit=${woState.pressLimitReached} partsRef=${partsRef.current.size}` +
          ` woId=${woState.selectedWorkOrderId}`,
      );
    }
    if (woState.pressLimitReached) return;

    const id = pClockCount;

    /**
     * DUPLICATE SPAWN GUARD — critical for rapid start/stop cycles.
     *
     * The useEffect depends on [pClockCount, status]. When the user toggles
     * Stop → Start, status changes ('stopped' → 'running') which re-fires
     * this effect for the SAME pClockCount. Without this guard, the existing
     * tile (which is mid-belt at some t > 0) gets OVERWRITTEN by a fresh tile
     * at SPAWN_T. The old tile is destroyed without incrementing any counter
     * (shipment/waste/2ndQuality), causing tile loss (e.g. 515/530).
     *
     * Additionally, incrementTilesSpawned() would fire again, inflating the
     * spawn count and triggering pressLimitReached prematurely.
     */
    if (partsRef.current.has(id)) return;

    /**
     * Phase 3: defect status is now read from the data layer's tile record.
     * The data store's createTile + moveTilesOnConveyor evaluate defects
     * synchronously — we just need the tile's defect info for visual rendering.
     * The tile_number matches pClockCount (both are sequential). We look up
     * the tile by number and read its snapshots' defect_detected flags.
     *
     * FALLBACK: If the data layer hasn't processed this tile yet (timing lag),
     * default to isDefected=false. The actual routing will be corrected later
     * by TickSnapshot completions via routeMapRef.
     */
    const dataState = useSimulationDataStore.getState();
    const tileByNum = dataState.getTileByNumber(id);
    let isDefectedFromData = false;
    if (tileByNum) {
      /** Check if any snapshot for this tile has defect_detected=true */
      const snaps = dataState.getTileSnapshots(tileByNum.id);
      isDefectedFromData = snaps.some((s) => s.defect_detected === true);
    }

    const newPart: PartData = {
      id,
      t: SPAWN_T,
      /**
       * Phase 3: defect status from data layer (not independent random roll).
       * This is used ONLY for visual rendering (tile color). The actual
       * routing decision comes from routeMapRef (TickSnapshot completions).
       */
      isDefected: isDefectedFromData,
      isSorted: false,
      sortProgress: 0,
      isCollected: false,
      collectProgress: 0,
      collectTargetY: COLLECT_TARGET_Y,
      /** Second quality fields — populated by routeMapRef from TickSnapshot */
      isSecondQuality: false,
      isSecondQualitySorted: false,
      secondQualityProgress: 0,
      originalPos: acquireVec3(),
      scale: 1,
      isQueued: false,
      hasVisitedDryer: false,
      /** Kiln FIFO queue flags — mirrors Dryer queue flags above */
      isKilnQueued: false,
      hasVisitedKiln: false,
      enteredQueueAt: null,
      /** Per-station scrap fields — set by routeMapRef from TickSnapshot */
      isScrapped: false,
      scrapProgress: 0,
    };
    partsRef.current.set(id, newPart);
    /**
     * Increment the Work Order's actual tile spawn counter.
     * This must be called AFTER all spawn guards have passed and the tile
     * is physically placed on the belt.
     */
    useWorkOrderStore.getState().incrementTilesSpawned();
    setPartIds((prev) => [...prev, id]);
  }, [pClockCount, status]);

  useFrame((_, delta) => {
    /**
     * ── DRAIN ANIMATION — ALWAYS runs (even when paused/stopped) ────────────
     *
     * Tiles that are already flagged isSorted (→ waste bin arc) or isCollected
     * (→ shipment box arc) must be able to finish their animation and be removed
     * from partsRef regardless of whether the simulation is still "running".
     *
     * WHY: When pressLimitReached fires, the last batch of tiles may already be
     * mid-animation (isSorted/isCollected already set to true). If we gate the
     * animation on status==="running", those tiles freeze in place, partsRef
     * never reaches size 0, and Phase 2 (the auto-stop) never triggers.
     *
     * DRAIN-ONLY: This block does NOT advance tile positions (p.t) or trigger
     * new sort/collect transitions — it ONLY continues already-started animations
     * and flushes fully-animated tiles from partsRef.
     */
    const drainIds: number[] = [];
    partsRef.current.forEach((p, id) => {
      if (p.isScrapped) {
        /** Continue per-station scrap arc animation toward waste bin. */
        p.scrapProgress = Math.min(
          1,
          p.scrapProgress + delta * visualVelocity * SCRAP_ANIMATION_SPEED,
        );
        if (p.scrapProgress >= 1) drainIds.push(id);
      } else if (p.isSorted) {
        /** Continue sort arc animation toward waste bin. */
        p.sortProgress = Math.min(
          1,
          p.sortProgress + delta * visualVelocity * SORT_ANIMATION_SPEED,
        );
        if (p.sortProgress >= 1) drainIds.push(id);
      } else if (p.isSecondQualitySorted) {
        /** Continue second quality arc animation toward amber box. */
        p.secondQualityProgress = Math.min(
          1,
          p.secondQualityProgress + delta * visualVelocity * SQ_ANIMATION_SPEED,
        );
        if (p.secondQualityProgress >= 1) drainIds.push(id);
      } else if (p.isCollected) {
        /** Continue collect arc animation toward shipment box. */
        p.collectProgress = Math.min(
          1,
          p.collectProgress + delta * visualVelocity * COLLECT_ANIMATION_SPEED,
        );
        if (p.collectProgress >= 1) drainIds.push(id);
      }
    });

    if (drainIds.length > 0) {
      drainIds.forEach((id) => {
        const part = partsRef.current.get(id);
        if (part) releaseVec3(part.originalPos);
        partsRef.current.delete(id);
      });
      setPartIds((prev) => prev.filter((id) => partsRef.current.has(id)));
    }

    // ═══════════════════════════════════════════════════════════════
    // DRAIN MODE — Empty Dryer & Kiln queues after press finishes
    // ═══════════════════════════════════════════════════════════════
    //
    // When pressLimitReached=true, no new tiles will enter the queues.
    // Any remaining tiles must be released onto the belt so the
    // simulation can drain completely (Phase 2 watches partsRef.size=0).
    // One tile per queue per frame (with gap-check) to maintain spacing.
    // Reordered to the top of useFrame to prevent same-frame pop-in issues.
    if (useWorkOrderStore.getState().pressLimitReached || isDraining) {
      /** Drain Dryer queue — one tile per frame with gap-check. */
      if (dryerQueueRef.current.length > 0) {
        releaseFromDryerRef.current(false);
      }
      /** Drain Kiln queue — one tile per frame with gap-check. */
      if (kilnQueueRef.current.length > 0) {
        releaseFromKilnRef.current(false);
      }
    }

    /**
     * ── TILE MOVEMENT — only runs when simulation is RUNNING ─────────────────
     *
     * Advances tile t-position, triggers dryer entry, sort/collect transitions,
     * and removes tiles that reached the end of the line without being flagged.
     *
     * This block must NOT run when paused/stopped to prevent tiles from
     * advancing on a frozen belt (which would cause visual glitches and
     * incorrect counter increments).
     */
    /**
     * Belt movement: run when 'running' OR 'jam_scrapping' (Phase 1).
     * During jam_scrapping the belt is red but tiles still advance.
     * Only 'jammed' and 'stopped' freeze the belt.
     */
    if (status === "running" || status === "jam_scrapping") {
      /**
       * ── PHASE 3+4: CONSUME TICK SNAPSHOTS ─────────────────────────────
       *
       * Phase 4 buffering guard: only start consuming TickSnapshots once
       * the ring buffer has accumulated MIN_BUFFERED_BEFORE_PLAY entries.
       * This gives the data engine a head start (SIMULATE_AHEAD_TICKS ticks)
       * so that routing decisions are available BEFORE tiles reach their
       * sort/collect thresholds on the visual belt.
       *
       * Once the initial buffer is filled, we drain ALL available snapshots
       * each frame (the data engine keeps producing ahead while we consume).
       *
       * During drain mode (pressLimitReached), we skip the buffering guard
       * and consume immediately — no point waiting when no more tiles
       * will be produced.
       */
      const snapshotDataStore = useSimulationDataStore.getState();
      const isDrainPhase = useWorkOrderStore.getState().pressLimitReached;
      const bufferedCount = snapshotDataStore.getBufferedCount();

      if (isDrainPhase || bufferedCount >= MIN_BUFFERED_BEFORE_PLAY) {
        let consumed = snapshotDataStore.consumeTickSnapshot();
        while (consumed) {
          /** Process completions — write routing decisions to routeMapRef */
          for (const completion of consumed.completions) {
            /** Map tile UUID → pClockCount-based ID for visual lookup.
             *  The visual engine uses tile_number (== pClockCount) as the part ID. */
            routeMapRef.current.set(completion.tileNumber, {
              destination: completion.destination,
              isDefected: completion.finalGrade !== "first_quality",
            });
          }

          /** Process movements — update defect visual status on existing tiles */
          for (const movement of consumed.movements) {
            const part = partsRef.current.get(movement.tileNumber);
            if (part && movement.defectDetected && !part.isDefected) {
              /** Late defect detection — update tile color for visual accuracy */
              part.isDefected = true;
            }
          }

          /** Try to consume next snapshot */
          consumed = useSimulationDataStore.getState().consumeTickSnapshot();
        }
      }

      /**
       * ── PERIODIC QUEUE RELEASE ──────────────────────────────────────
       *
       * Attempt to release tiles from Dryer/Kiln queues on every frame,
       * but ONLY when queue depth exceeds the configured threshold.
       *
       * Without threshold gating, tiles leak out after their dwell time
       * expires (~2-3 tiles) instead of accumulating to the intended
       * DRYER_RELEASE_THRESHOLD (10) / KILN_RELEASE_THRESHOLD (40).
       *
       * The release function already enforces gap-check and dwell-time
       * internally — calling it every frame is safe (returns false if
       * not ready). The drain-mode block above handles post-production
       * flushing without threshold checks.
       */
      if (dryerQueueRef.current.length > DRYER_RELEASE_THRESHOLD) {
        releaseFromDryerRef.current(false);
      }
      if (kilnQueueRef.current.length > KILN_RELEASE_THRESHOLD) {
        releaseFromKilnRef.current(false);
      }

      const idsToRemove: number[] = [];
      partsRef.current.forEach((p, id) => {
        /** Skip tiles already handled by the drain block above. */
        if (p.isSorted || p.isSecondQualitySorted || p.isCollected) return;

        if (p.isQueued || p.isKilnQueued) {
          /** Tile is inside a FIFO queue — hold position, do nothing. */
          return;
        }

        /** Advance tile along the conveyor curve. */
        p.t += delta * visualVelocity;
        /** Scale is always 1 — tiles are full-size throughout their lifecycle. */

        /**
         * ── PHASE 1 BELT-STATION INTERCEPT ──────────────────────────────
         * During jam_scrapping, intercept tiles that reach the jammed
         * station's t-position. These tiles are immediately scrapped and
         * MJ-swished to the recycle bin.
         *
         * This block runs for non-queue stations (press, glaze, digital_print,
         * sorting, packaging, conveyor). Queue stations (dryer/kiln) are
         * handled in the useEffect above.
         */
        if (
          status === "jam_scrapping" &&
          jamLocation &&
          jamScrapsRemaining > 0 &&
          !p.isScrapped
        ) {
          const jamT = JAM_LOCATION_T_POSITIONS[jamLocation];
          /** Check if tile has crossed the jam intercept zone */
          if (Math.abs(p.t - jamT) <= JAM_INTERCEPT_TOLERANCE || p.t >= jamT) {
            /** Scrap this tile — 100% certainty during Phase 1 */
            p.isScrapped = true;
            p.scrapProgress = 0;
            p.originalPos.copy(curve.getPointAt(Math.min(p.t, 0.5)));
            /** Jam scrap counters — direct store calls for visual jam animation */
            useSimulationStore.getState().incrementScrapCount();
            useSimulationStore.getState().incrementWasteCount();
            decrementJamScraps();

            /**
             * Check if all impacted tiles have been scrapped.
             * If so, transition Phase 1 → Phase 2 (belt stops for clearing).
             */
            const scrapsLeft = useSimulationStore.getState().jamScrapsRemaining;
            if (scrapsLeft <= 0) {
              setConveyorStatusAction("jammed");
            }
            return; // tile is now scrapped, skip further processing
          }
        }

        /**
         * Dryer Entry — queue the tile, then attempt FIFO release.
         * Entry and release are atomic (same frame) to guarantee
         * one-in → one-out semantics when queue > threshold.
         */
        if (p.t >= DRYER_ENTRY_T && !p.hasVisitedDryer && !p.isQueued) {
          p.isQueued = true;
          p.hasVisitedDryer = true;
          p.enteredQueueAt = performance.now();
          p.t = DRYER_ENTRY_T; // Snap to entry point
          /** Visibility gate in Part component handles hiding. */
          dryerQueueRef.current.push(id);

          if (dryerQueueRef.current.length > DRYER_RELEASE_THRESHOLD) {
            const isForce =
              dryerQueueRef.current.length >= DRYER_QUEUE_CAPACITY;
            releaseFromDryerRef.current(isForce);
          }
          /** Stop frame processing for this tile once queued. */
          return;
        }

        /**
         * Kiln Entry — independent check to ensure tiles can reach the kiln
         * even if they bypass the Dryer or move fast enough to cross both
         * station thresholds in a single frame.
         */
        if (p.t >= KILN_ENTRY_T && !p.hasVisitedKiln && !p.isKilnQueued) {
          p.isKilnQueued = true;
          p.hasVisitedKiln = true;
          p.enteredQueueAt = performance.now();
          p.t = KILN_ENTRY_T; // Snap to Kiln entry point
          /** Visibility gate in Part component handles hiding. */
          kilnQueueRef.current.push(id);

          if (kilnQueueRef.current.length > KILN_RELEASE_THRESHOLD) {
            /** Force-release when queue grows beyond capacity (safety valve) */
            const isForce = kilnQueueRef.current.length >= KILN_QUEUE_CAPACITY;
            releaseFromKilnRef.current(isForce);
          }
          /** Stop frame processing for this tile once queued. */
          return;
        }

        /** Post-Kiln Logic (Sorting, Collection, etc.) */
        if (!p.isSorted && !p.isScrapped) {
          /**
           * PHASE 3: TickSnapshot-driven routing via routeMapRef.
           *
           * The routeMapRef is populated by consuming TickSnapshot completions
           * (see the consume loop below). When a tile reaches sorting, we check
           * the map for its pre-computed destination.
           *
           * This replaces ALL bridge reads (scrappedPartIds, secondQualityPartIds)
           * and independent defect rolls. The data engine is the SOLE decision-maker.
           */
          const route = routeMapRef.current.get(p.id);

          /**
           * Second quality transition: tiles routed to 'secondQuality'
           * by the data engine are sent to the 2nd quality box.
           */
          if (
            !p.isSorted &&
            !p.isScrapped &&
            p.t >= SORT_THRESHOLD &&
            !p.isSecondQualitySorted
          ) {
            if (route?.destination === "secondQuality") {
              p.isSecondQualitySorted = true;
              p.originalPos.copy(curve.getPointAt(p.t));
              /** Increment visual counter for 3D SecondQualityBox display */
              useSimulationStore.getState().incrementSecondQualityCount();
              /** Clean up routeMap entry */
              routeMapRef.current.delete(p.id);
            } else if (route?.destination === "wasteBin") {
              /**
               * Scrap routing: ONE-TIME scrap probability check.
               * Only runs when the tile reaches SORT_THRESHOLD (not every frame).
               * On HIT: tile gets the tumbling scrap animation to the recycle bin.
               * On MISS: tile gets the arc-sort animation to the waste bin.
               * Both paths increment wasteCount for the 3D TrashBin display.
               */
              const scrapProb =
                useSimulationDataStore.getState().conveyorNumericParams
                  .scrap_probability;
              if (Math.random() < scrapProb / 100) {
                /** Scrap probability HIT — tumble animation to recycle bin */
                p.isScrapped = true;
                p.originalPos.copy(curve.getPointAt(p.t));
              } else {
                /** Scrap probability MISS — arc animation to waste bin */
                p.isSorted = true;
                p.originalPos.copy(curve.getPointAt(p.t));
              }
              /** Increment visual counter for 3D TrashBin display (both paths) */
              useSimulationStore.getState().incrementWasteCount();
              routeMapRef.current.delete(p.id);
            }
          }

          /**
           * Collect transition: first quality tiles are flagged at
           * COLLECT_THRESHOLD. Only fires if routeMap says 'shipment'
           * or no route entry exists (default = first quality).
           */
          if (
            !p.isSecondQualitySorted &&
            !p.isScrapped &&
            !p.isSorted &&
            p.t >= COLLECT_THRESHOLD &&
            !p.isCollected
          ) {
            /** Only collect if route is shipment or no route (default FQ) */
            if (!route || route.destination === "shipment") {
              p.isCollected = true;
              p.originalPos.copy(
                curve.getPointAt(Math.min(p.t, COLLECT_CLAMP_T)),
              );
              const stackIndex =
                useSimulationStore.getState().shipmentCount %
                FORKLIFT_PALLET_STACK_MAX;
              p.collectTargetY =
                FORKLIFT_PALLET_Y +
                0.07 +
                stackIndex * FORKLIFT_PALLET_TILE_H +
                FORKLIFT_PALLET_TILE_H * 0.5;
              /** Increment visual counter for 3D ShipmentBox/Forklift display */
              useSimulationStore.getState().incrementShipmentCount();
              addShippedTileId(p.id);
              routeMapRef.current.delete(p.id);
            }
          }
        }

        /**
         * End-of-line guard: safety net for tiles that somehow passed
         * END_OF_LINE_T without being sorted, SQ-routed, or collected.
         * Use routeMapRef to determine the correct action.
         */
        if (
          p.t >= END_OF_LINE_T &&
          !p.isSorted &&
          !p.isScrapped &&
          !p.isSecondQualitySorted &&
          !p.isCollected
        ) {
          const route = routeMapRef.current.get(p.id);
          if (route?.destination === "secondQuality") {
            /** Route to 2Q at end of line */
            p.isSecondQualitySorted = true;
            p.originalPos.copy(curve.getPointAt(p.t));
            /** Increment visual counter for 3D SecondQualityBox display */
            useSimulationStore.getState().incrementSecondQualityCount();
          } else if (route?.destination === "wasteBin") {
            /** Route to waste at end of line */
            p.isSorted = true;
            p.originalPos.copy(curve.getPointAt(p.t));
            /** Increment visual counter for 3D TrashBin display */
            useSimulationStore.getState().incrementWasteCount();
          } else {
            /** Default to collection (first quality) */
            p.isCollected = true;
            p.originalPos.copy(
              curve.getPointAt(Math.min(p.t, COLLECT_CLAMP_T)),
            );
            const stackIndex =
              useSimulationStore.getState().shipmentCount %
              FORKLIFT_PALLET_STACK_MAX;
            p.collectTargetY =
              FORKLIFT_PALLET_Y +
              0.07 +
              stackIndex * FORKLIFT_PALLET_TILE_H +
              FORKLIFT_PALLET_TILE_H * 0.5;
            /** Increment visual counter for 3D ShipmentBox/Forklift display */
            useSimulationStore.getState().incrementShipmentCount();
            addShippedTileId(p.id);
          }
          routeMapRef.current.delete(p.id);
          /** If still not handled (shouldn't happen), remove to prevent partsRef leak */
          if (
            !p.isSorted &&
            !p.isScrapped &&
            !p.isSecondQualitySorted &&
            !p.isCollected
          ) {
            idsToRemove.push(id);
          }
        }
      });

      if (idsToRemove.length > 0) {
        idsToRemove.forEach((id) => {
          const part = partsRef.current.get(id);
          if (part) releaseVec3(part.originalPos);
          partsRef.current.delete(id);
        });
        setPartIds((prev) => prev.filter((id) => partsRef.current.has(id)));
      }
    }

    // ── Physical telemetry update — ALWAYS runs (even when paused/stopped)
    // This ensures SceneLogic sees accurate tile positions and station lights
    // turn off correctly when tiles are no longer present.
    const storeState = useSimulationStore.getState();
    const posArr = storeState.partPositionsRef.current;
    const idArr = storeState.partIdsRef.current;
    posArr.length = 0;
    idArr.length = 0;
    partsRef.current.forEach((p) => {
      // Exclude sorted, scrapped, Dryer-queued, and Kiln-queued tiles from telemetry
      // so station lights correctly reflect physical tile presence on the belt.
      if (!p.isSorted && !p.isScrapped && !p.isQueued && !p.isKilnQueued) {
        posArr.push(p.t);
        idArr.push(p.id);
      }
    });

    // ── Queue-head telemetry ──────────────────────────────────────────
    // Include the OLDEST tile from each FIFO queue so that the production
    // table snapshot (`advanceSClock`) and station lights (`SceneLogic`)
    // "see" the station as occupied while the queue is processing tiles.
    //
    // WHY THIS WORKS:
    //   When a tile enters a queue, its `t` is snapped to the station's
    //   exact position (DRYER_ENTRY_T / KILN_ENTRY_T = STATION_STAGES[idx]).
    //   The snapshot tolerance is 0.031, but the distance here is exactly 0 —
    //   so the snapshot finds the queue head on EVERY P-Clock tick (100% hit).
    //
    // WHY ONLY THE HEAD:
    //   Including all 40+ queued tiles at the same t would pollute the array
    //   with redundant entries. One representative (the oldest, currently being
    //   "processed") is sufficient for both the table and the station light.
    if (dryerQueueRef.current.length > 0) {
      /** Dryer queue head — the tile currently being dried (oldest in FIFO). */
      const dryerHeadId = dryerQueueRef.current[0];
      const dryerHead = partsRef.current.get(dryerHeadId);
      if (dryerHead) {
        posArr.push(dryerHead.t); // snapped to DRYER_ENTRY_T = STATION_STAGES[1]
        idArr.push(dryerHead.id);
      }
    }
    if (kilnQueueRef.current.length > 0) {
      /** Kiln queue head — the tile currently being fired (oldest in FIFO). */
      const kilnHeadId = kilnQueueRef.current[0];
      const kilnHead = partsRef.current.get(kilnHeadId);
      if (kilnHead) {
        posArr.push(kilnHead.t); // snapped to KILN_ENTRY_T = STATION_STAGES[4]
        idArr.push(kilnHead.id);
      }
    }

    // ── 1-slot station occupant telemetry ─────────────────────────────
    // For each pass-through station (no FIFO queue), detect the closest
    // tile within SNAPSHOT_TOLERANCE and remember it as the station's
    // "current occupant". Include the occupant at the station's exact
    // STATION_STAGES position so the snapshot finds it at distance 0.
    //
    // Skipped indices:
    //   0 = Press  (snapshot hardcodes the freshly pressed tile)
    //   1 = Dryer  (FIFO queue head handled above)
    //   4 = Kiln   (FIFO queue head handled above)
    for (let sIdx = 0; sIdx < STATION_STAGES.length; sIdx++) {
      /** Skip stations with dedicated handling. */
      if (sIdx === 0 || sIdx === 1 || sIdx === 4) continue;

      const stageT = STATION_STAGES[sIdx];
      let closestId: number | null = null;
      let closestDist = SNAPSHOT_TOLERANCE;

      /** Scan all live, on-belt tiles for the one nearest this station. */
      partsRef.current.forEach((p) => {
        if (
          p.isSorted ||
          p.isScrapped ||
          p.isQueued ||
          p.isKilnQueued ||
          p.isSecondQualitySorted ||
          p.isCollected
        )
          return;
        const d = Math.abs(p.t - stageT);
        if (d < closestDist) {
          closestDist = d;
          closestId = p.id;
        }
      });

      /** If a tile is within tolerance, update the occupant slot. */
      if (closestId !== null) {
        stationOccupantRef.current[sIdx] = closestId;
      }

      /**
       * Include the occupant in partPositionsRef at the exact station t.
       *
       * CRITICAL: Validate the occupant is still PHYSICALLY near the station.
       * stationOccupantRef persists the last tile seen — if the tile has since
       * moved past the station (beyond SNAPSHOT_TOLERANCE), it must be evicted.
       * Without this check, a single tile can appear in multiple station columns
       * simultaneously (e.g. "Tile #528" stuck at Glaze, Digital Print, AND Sorting).
       */
      const occupantId = stationOccupantRef.current[sIdx];
      if (occupantId !== null && partsRef.current.has(occupantId)) {
        const occ = partsRef.current.get(occupantId)!;
        /** Only include if tile is still alive and on-belt (not in animation). */
        if (
          !occ.isSorted &&
          !occ.isScrapped &&
          !occ.isSecondQualitySorted &&
          !occ.isCollected
        ) {
          /** Distance check: evict if tile has moved beyond tolerance of this station. */
          const distFromStation = Math.abs(occ.t - stageT);
          if (distFromStation < SNAPSHOT_TOLERANCE) {
            posArr.push(stageT); // exact STATION_STAGES[sIdx]
            idArr.push(occupantId);
          } else {
            /** Tile has moved past this station — clear the stale occupant. */
            stationOccupantRef.current[sIdx] = null;
          }
        } else {
          /** Tile was removed/sorted — clear the slot. */
          stationOccupantRef.current[sIdx] = null;
        }
      }
    }

    /**
     * Update totalPartsRef with the FULL tile count — every tile in every state.
     * Read by useWorkOrderEnforcer Phase 2 and by the inline Phase 2 below.
     */
    storeState.totalPartsRef.current = partsRef.current.size;

    /**
     * DRAIN MODE COMPLETION — user-initiated stop.
     *
     * When isDraining=true and all tiles have exited the belt
     * (partsRef.size === 0), the drain is complete. Fire the same
     * shutdown sequence as Phase 2 (stop sync → drain data layer →
     * sync → pause session) to ensure DB consistency.
     *
     * Unlike Phase 2 (work order completion), this is triggered by
     * the user clicking Stop — not by pressLimitReached.
     */
    if (
      isDraining &&
      partsRef.current.size === 0 &&
      storeState.isDataFlowing &&
      !phase2FiredRef.current
    ) {
      /** One-shot guard — prevents re-entry on subsequent frames. */
      phase2FiredRef.current = true;

      /** Clear station occupants (prevents ghost occupants after belt empties) */
      stationOccupantRef.current.fill(null);

      /**
       * Complete the drain: sets isDataFlowing=false, isDraining=false,
       * conveyorStatus='stopped'. This is a SIMPLE PAUSE — NOT a full
       * Phase 2 shutdown. The user can resume the simulation later.
       *
       * We intentionally do NOT:
       *   - Set isRunning=false (data store must stay alive for resume)
       *   - Stop syncService (periodic sync must continue)
       *   - Call drainConveyor() (visual tiles already exited naturally)
       *   - Call pauseSession() (session must stay open for resume)
       *
       * The real Phase 2 shutdown (below) fires ONLY when the work order
       * is fully complete (pressLimitReached && partsRef.size===0).
       */
      completeDrain();

      phase2Log.current.info(
        "Drain mode complete: all tiles exited, simulation paused (not shutdown)",
      );
    }

    /**
     * INLINE PHASE 2 — Event-driven final sync & shutdown.
     *
     * This is the DEFINITIVE "simulation is done" event. It is the single
     * authoritative trigger for flushing all tile data to Supabase.
     *
     * Why here (useFrame) instead of a reactive useEffect:
     *   - useFrame runs at 60fps with DIRECT access to partsRef.
     *   - Only useFrame can observe partsRef.current.size in real time.
     *   - Reactive useEffects fire asynchronously after React renders,
     *     creating timing gaps where periodic syncs race with the drain.
     *
     * Architecture: EVENT-DRIVEN FINAL SYNC
     *   1. Phase 2 detects: all tiles visually done (partsRef.size===0)
     *   2. Synchronously: stopDataFlow + drainConveyor (data-layer flush)
     *   3. Async IIFE: await syncService.stop() → await pauseSession()
     *   4. ONLY AFTER DB confirms → open KPI panels (fresh data guaranteed)
     *
     * The phase2FiredRef guard ensures this runs exactly ONCE per simulation.
     *
     * Conditions for stopping (ALL must be true):
     *   1. pressLimitReached=true  → Press has completed its batch
     *   2. partsRef.current.size=0 → Every tile fully processed
     *   3. isDataFlowing=true      → Simulation is actually running
     *   4. !phase2FiredRef.current → Haven't already fired
     */
    const workOrderState = useWorkOrderStore.getState();
    if (
      workOrderState.pressLimitReached &&
      partsRef.current.size === 0 &&
      storeState.isDataFlowing &&
      !phase2FiredRef.current
    ) {
      /** One-shot guard — prevents re-entry on subsequent frames. */
      phase2FiredRef.current = true;

      /** Clear station occupants (prevents ghost occupants after simulation ends) */
      stationOccupantRef.current.fill(null);

      /**
       * ═══════════════════════════════════════════════════════════
       * SYNCHRONOUS PHASE — runs in THIS useFrame tick
       * ═══════════════════════════════════════════════════════════
       */

      /**
       * Stop the simulation using the idempotent stopDataFlow().
       * Sets isDataFlowing=false and conveyorStatus='stopped'.
       */
      storeState.stopDataFlow();

      /**
       * Gate the data store's tick() to prevent new tile creation.
       * tick() checks `if (!state.isRunning) return;` — this must be
       * set false BEFORE any async work to prevent the sClockCount
       * subscription from creating new tiles.
       */
      useSimulationDataStore.setState({ isRunning: false });

      /**
       * Reset Work Order runtime state for the next run.
       * Clears pressLimitReached=false and tilesSpawned=0.
       * Preserves selectedWorkOrderId (user's selection survives).
       */
      workOrderState.resetWorkOrderState();

      phase2Log.current.info(
        "Phase 2: stopDataFlow + isRunning=false complete",
      );

      /**
       * ═══════════════════════════════════════════════════════════
       * ASYNC PHASE — runs across subsequent frames via IIFE
       * ═══════════════════════════════════════════════════════════
       *
       * CRITICAL SEQUENCE (order matters!):
       *
       *   Step 1: await syncService.stop()
       *     - Clears the periodic interval
       *     - Waits for any in-progress periodic sync to COMPLETE
       *       (including its markAsSynced callbacks)
       *     - Does one final sync of whatever was queued pre-drain
       *
       *   Step 2: drainConveyor()
       *     - NOW safe because no periodic sync can run concurrently
       *     - Marks all conveyor tiles as completed (synchronous)
       *     - Post-drain sweep catches any remaining in_production tiles
       *     - All completed tiles get synced=false + pushed to queue
       *
       *   Step 3: syncService.sync() — SECOND final sync
       *     - Flushes drain-completed tiles to Supabase
       *     - No race: periodic sync is stopped, drain is done, queue
       *       contains ONLY drain-completed tiles
       *
       *   Step 4: await pauseSession()
       *     - Only after DB confirms all tiles written
       *
       * WHY drain is AFTER syncService.stop():
       *   The periodic sync's markAsSynced callback runs during stop()
       *   and sets tiles to synced=true, removing them from the queue.
       *   If drain ran BEFORE stop(), the periodic sync's callback would
       *   overwrite drain-completed tiles back to synced=true, and the
       *   final sync would skip them → pending tiles in DB.
       */
      (async () => {
        try {
          /**
           * Step 1: Stop periodic sync — waits for in-progress sync,
           * then does one final sync of pre-drain data.
           */
          await syncService.stop();
          phase2Log.current.info(
            "Periodic sync stopped + pre-drain flush done",
          );

          /**
           * Step 2: Drain conveyor — NOW safe (no concurrent sync).
           * All tiles on the data-layer belt complete their journey.
           * Post-drain sweep catches any remaining in_production tiles.
           */
          const freshDataStore = useSimulationDataStore.getState();
          freshDataStore.drainConveyor();
          phase2Log.current.info("Drain complete — all tiles marked completed");

          /**
           * Step 2b: Flush pending microtasks before syncing.
           *
           * CRITICAL: drainConveyor() → moveTilesOnConveyor() defers
           * tile_station_snapshot creation via queueMicrotask(). During
           * the synchronous drain loop, microtasks DON'T fire. Without
           * this flush, post-drain sync finds zero snapshots and writes
           * nothing to tile_station_snapshots — CWF loses passport data.
           */
          await new Promise((r) => setTimeout(r, 0));
          phase2Log.current.info(
            "Microtask flush done — snapshots ready for sync",
          );

          /**
           * Step 3: Second final sync — flush drain-completed tiles.
           * syncService is stopped but we can still call sync() directly.
           * This is the ONLY sync that sends drain-completed tile data.
           */
          await syncService.sync();
          phase2Log.current.info(
            "Post-drain sync complete — all tiles flushed to DB",
          );

          /**
           * Step 3.5: Final OEE snapshot — captures post-drain production totals.
           *
           * The periodic insertSnapshot() has a conveyorStatus='running' guard
           * that silently skips inserts after stopDataFlow(). This call uses
           * insertFinalSnapshot() which bypasses that guard, ensuring the
           * last OEE snapshot reflects the TRUE final counts (e.g. 530 shipped,
           * not the stale 518 from the last periodic snapshot).
           */
          await oeeSnapshotService.insertFinalSnapshot();
          phase2Log.current.info("Post-drain final OEE snapshot inserted");

          /**
           * Step 4: Pause session in DB — only after ALL tiles confirmed.
           */
          await freshDataStore.pauseSession();
          phase2Log.current.info("Session paused in Supabase");
        } catch (err) {
          phase2Log.current.error("Phase 2 async shutdown failed:", err);
        }

        /**
         * Step 5: UI actions — runs AFTER DB sync + pause (fresh data).
         */

        /** Re-arm the Demo Settings gate for the next run. */
        useUIStore.getState().setSimConfigured(false);

        /**
         * Mark the simulation as naturally ended.
         * Prevents DemoSettingsPanel close handlers from re-arming the gate.
         * Cleared by useFactoryReset when the user clicks Reset.
         */
        useUIStore.getState().setSimulationEnded(true);

        phase2Log.current.info("Simulation fully complete");
      })();
    }
  });

  /**
   * Look up the selected work order's recipe to determine tile colours.
   * Read imperatively (getState) to avoid re-rendering PartSpawner on
   * every work order selection change — colours only need to be correct
   * during the render of <Part> components.
   */
  const selectedWoId = useWorkOrderStore((s) => s.selectedWorkOrderId);
  const activeRecipe = useMemo(() => {
    const wo = WORK_ORDERS.find((w) => w.id === selectedWoId);
    return RECIPES.find((r) => r.id === wo?.recipeId) ?? RECIPES[0];
  }, [selectedWoId]);

  return (
    <group>
      {partIds.map((id) => {
        const data = partsRef.current.get(id);
        if (!data) return null;
        return (
          <Part
            key={id}
            data={data}
            curve={curve}
            normalColor={activeRecipe.normalTileColor}
            defectedColor={activeRecipe.defectedTileColor}
          />
        );
      })}
    </group>
  );
}

/**
 * ConveyorBelt — Top-Level Composition Component
 *
 * Assembles the full conveyor belt system:
 *  1. Creates the CatmullRom spline curve from CONVEYOR_CURVE_POINTS
 *  2. Renders SLAT_COUNT instanced rolling slats on the curve
 *  3. Computes visualVelocity from clock parameters and conveyorSpeed
 *  4. Delegates tile lifecycle to <PartSpawner>
 *
 * Re-mounted on factory reset via `key={resetVersion}` in Scene.tsx.
 */
export const ConveyorBelt = () => {
  const sClockPeriod = useSimulationStore((s) => s.sClockPeriod);
  const stationInterval = useSimulationStore((s) => s.stationInterval);
  const conveyorSpeed = useSimulationStore((s) => s.conveyorSpeed);
  const conveyorStatus = useSimulationStore((s) => s.conveyorStatus);

  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  const visualVelocity = useMemo(
    () => computeBaseVelocity(sClockPeriod, stationInterval) * conveyorSpeed,
    [sClockPeriod, stationInterval, conveyorSpeed],
  );

  // C3 fix: Store in refs so useFrame always reads the latest values
  const visualVelocityRef = useRef(visualVelocity);
  visualVelocityRef.current = visualVelocity;
  const conveyorStatusRef = useRef(conveyorStatus);
  conveyorStatusRef.current = conveyorStatus;

  const curve = useMemo(() => {
    const points = CONVEYOR_CURVE_POINTS.map(
      (p) => new THREE.Vector3(p[0], p[1], p[2]),
    );
    return new THREE.CatmullRomCurve3(
      points,
      true,
      "catmullrom",
      CONVEYOR_CURVE_TENSION,
    );
  }, []);

  const offsets = useRef(
    Float32Array.from({ length: SLAT_COUNT }, (_, i) => i / SLAT_COUNT),
  );

  useFrame((_, delta) => {
    if (!meshRef.current) return;

    if (conveyorStatusRef.current === "running") {
      for (let i = 0; i < SLAT_COUNT; i++) {
        offsets.current[i] =
          /** SLAT_SPEED_MULTIPLIER corrects the looping-curve vs tile 2× visual mismatch.
           *  Slats cycle the full curve (top + return), tiles only travel the top half.
           *  0.5× slows the belt surface to match tile apparent speed. */
          (offsets.current[i] + delta * visualVelocityRef.current * SLAT_SPEED_MULTIPLIER) % 1;
      }
    }

    for (let i = 0; i < SLAT_COUNT; i++) {
      const t = offsets.current[i];
      const point = curve.getPointAt(t);
      const tangent = curve.getTangentAt(t);
      dummy.position.copy(point);
      _lookAtPos.copy(point).add(tangent);
      dummy.lookAt(_lookAtPos);
      dummy.rotateY(Math.PI / 2);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <group>
      <instancedMesh
        ref={meshRef}
        args={[undefined, undefined, SLAT_COUNT]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={SLAT_GEOMETRY} />
        <meshStandardMaterial
          color={
            conveyorStatus === "jammed" || conveyorStatus === "jam_scrapping"
              ? COLORS.conveyorJammed
              : COLORS.conveyorSlat
          }
          metalness={MATERIALS.conveyorSlat.metalness}
          roughness={MATERIALS.conveyorSlat.roughness}
        />
      </instancedMesh>

      <PartSpawner
        curve={curve}
        status={conveyorStatus}
        visualVelocity={visualVelocity}
      />
    </group>
  );
};
