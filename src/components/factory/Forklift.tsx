/**
 * Forklift.tsx — Industrial Forklift 3D Component
 *
 * Renders a stylised industrial forklift at the shipment end of the conveyor.
 * Replaces the simple ShipmentBox with a more immersive factory asset.
 *
 * Visual elements (all built from Three.js primitives):
 *  - Bright yellow chassis/body (industry standard colour)
 *  - Rear counterweight block (dark grey, heavy appearance)
 *  - Operator cab with four corner pillars and a flat roof
 *  - Two vertical mast rails (black) extending above the cab
 *  - Carriage backplate connecting forks to mast
 *  - Two flat fork tines reaching forward (low, loading position)
 *  - Four rubber tires (dark cylinders) with silver hub caps
 *  - Floating shipment count counter and "SHIPMENT" label above the unit
 *
 * All dimensions, colours, and Y-positions are defined in params/geometry.ts
 * so they can be tuned without touching component logic.
 *
 * Used by: Scene.tsx
 */

import { Text } from "@react-three/drei";
import { useSimulationStore } from "../../store/simulationStore";
import {
  COLORS,
  MATERIALS,
  TEXT_SIZES,
  LABEL_SHIPMENT,
  FORKLIFT_BODY_SIZE,
  FORKLIFT_BODY_Y,
  FORKLIFT_COUNTER_SIZE,
  FORKLIFT_COUNTER_Y,
  FORKLIFT_COUNTER_Z,
  FORKLIFT_CAB_SIZE,
  FORKLIFT_CAB_Y,
  FORKLIFT_PILLAR_SIZE,
  FORKLIFT_PILLAR_Y,
  FORKLIFT_PILLAR_X,
  FORKLIFT_PILLAR_Z_FRONT,
  FORKLIFT_PILLAR_Z_REAR,
  FORKLIFT_MAST_SIZE,
  FORKLIFT_MAST_Y,
  FORKLIFT_MAST_X,
  FORKLIFT_MAST_Z,
  FORKLIFT_CARRIAGE_SIZE,
  FORKLIFT_CARRIAGE_Y,
  FORKLIFT_CARRIAGE_Z,
  FORKLIFT_FORK_SIZE,
  FORKLIFT_FORK_Y,
  FORKLIFT_FORK_Z,
  FORKLIFT_FORK_LEFT_X,
  FORKLIFT_FORK_RIGHT_X,
  FORKLIFT_WHEEL_RADIUS,
  FORKLIFT_WHEEL_HEIGHT,
  FORKLIFT_WHEEL_SEGMENTS,
  FORKLIFT_WHEEL_Y,
  FORKLIFT_WHEEL_X,
  FORKLIFT_WHEEL_Z_FRONT,
  FORKLIFT_WHEEL_Z_REAR,
  FORKLIFT_HUB_RADIUS,
  FORKLIFT_HUB_HEIGHT,
  FORKLIFT_HUB_SEGMENTS,
  FORKLIFT_COUNTER_TEXT_Y,
  FORKLIFT_LABEL_Y,
  FORKLIFT_PALLET_SIZE,
  FORKLIFT_PALLET_Y,
  FORKLIFT_PALLET_Z,
  FORKLIFT_PALLET_STACK_MAX,
  FORKLIFT_PALLET_TILE_H,
  TILE_GEOMETRY,
} from "../../lib/params";

/** Props for the Forklift component */
interface ForkliftProps {
  /** World position [x, y, z] where the forklift group is placed */
  position: [number, number, number];
  /** Optional Euler rotation [x, y, z] for the forklift group (radians) */
  rotation?: [number, number, number];
}

/**
 * Wheel sub-component — renders one rubber tyre (dark cylinder) with a
 * silver hub-cap disc overlaid in the centre.
 *
 * The wheel cylinder is rotated 90° around Z so its flat faces point
 * outward along the X axis, matching a real axle orientation.
 */
const Wheel = ({ position }: { position: [number, number, number] }) => (
  <group position={position}>
    {/* Tyre */}
    <mesh rotation={[0, 0, Math.PI / 2]} castShadow receiveShadow>
      <cylinderGeometry
        args={[
          FORKLIFT_WHEEL_RADIUS,
          FORKLIFT_WHEEL_RADIUS,
          FORKLIFT_WHEEL_HEIGHT,
          FORKLIFT_WHEEL_SEGMENTS,
        ]}
      />
      {/* Dark rubber tyre colour */}
      <meshStandardMaterial
        color={COLORS.forkliftWheel}
        roughness={MATERIALS.forkliftWheel.roughness}
        metalness={MATERIALS.forkliftWheel.metalness}
      />
    </mesh>
    {/* Hub-cap disc — positioned in the centre of the tyre face */}
    <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
      <cylinderGeometry
        args={[
          FORKLIFT_HUB_RADIUS,
          FORKLIFT_HUB_RADIUS,
          FORKLIFT_HUB_HEIGHT,
          FORKLIFT_HUB_SEGMENTS,
        ]}
      />
      {/* Metallic silver hub */}
      <meshStandardMaterial
        color={COLORS.forkliftHub}
        roughness={MATERIALS.forkliftHub.roughness}
        metalness={MATERIALS.forkliftHub.metalness}
      />
    </mesh>
  </group>
);

/**
 * Forklift — Main forklift scene object.
 *
 * Reads `shipmentCount` from the simulation store to display the live
 * counter above the forklift (same data that ShipmentBox displayed).
 */
export const Forklift = ({ position, rotation }: ForkliftProps) => {
  /** Live count of tiles successfully shipped (first quality) */
  const shipmentCount = useSimulationStore((s) => s.shipmentCount);
  /**
   * Last STACK_MAX shipped tile IDs — drives the per-layer number label.
   * shippedTileIds[0] = first tile in current cycle, [...n-1] = most recent.
   */
  const shippedTileIds = useSimulationStore((s) => s.shippedTileIds);

  return (
    <group position={position} rotation={rotation}>
      {/* ── Chassis / body ─────────────────────────────────────────── */}
      {/* Main rectangular hull — industrial yellow */}
      <mesh position={[0, FORKLIFT_BODY_Y, 0]} castShadow receiveShadow>
        <boxGeometry args={FORKLIFT_BODY_SIZE} />
        <meshStandardMaterial
          color={COLORS.forkliftBody}
          roughness={MATERIALS.forkliftBody.roughness}
          metalness={MATERIALS.forkliftBody.metalness}
        />
      </mesh>

      {/* Rear counterweight — heavy dark block for balance */}
      <mesh
        position={[0, FORKLIFT_COUNTER_Y, FORKLIFT_COUNTER_Z]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={FORKLIFT_COUNTER_SIZE} />
        <meshStandardMaterial
          color={COLORS.forkliftCounterweight}
          roughness={MATERIALS.forkliftCounterweight.roughness}
          metalness={MATERIALS.forkliftCounterweight.metalness}
        />
      </mesh>

      {/* ── Operator cab ───────────────────────────────────────────── */}
      {/* Flat roof panel */}
      <mesh position={[0, FORKLIFT_CAB_Y, 0]} castShadow receiveShadow>
        <boxGeometry args={FORKLIFT_CAB_SIZE} />
        <meshStandardMaterial
          color={COLORS.forkliftCab}
          roughness={MATERIALS.forkliftCab.roughness}
          metalness={MATERIALS.forkliftCab.metalness}
        />
      </mesh>

      {/* Four corner pillars supporting the cab roof */}
      {[
        { x: -FORKLIFT_PILLAR_X, z: FORKLIFT_PILLAR_Z_FRONT },
        { x: FORKLIFT_PILLAR_X, z: FORKLIFT_PILLAR_Z_FRONT },
        { x: -FORKLIFT_PILLAR_X, z: FORKLIFT_PILLAR_Z_REAR },
        { x: FORKLIFT_PILLAR_X, z: FORKLIFT_PILLAR_Z_REAR },
      ].map((p, i) => (
        <mesh
          key={`pillar-${i}`}
          position={[p.x, FORKLIFT_PILLAR_Y, p.z]}
          castShadow
        >
          <boxGeometry args={FORKLIFT_PILLAR_SIZE} />
          <meshStandardMaterial
            color={COLORS.forkliftCab}
            roughness={MATERIALS.forkliftCab.roughness}
            metalness={MATERIALS.forkliftCab.metalness}
          />
        </mesh>
      ))}

      {/* ── Mast ───────────────────────────────────────────────────── */}
      {/* Left mast rail — vertical lift column */}
      <mesh
        position={[-FORKLIFT_MAST_X, FORKLIFT_MAST_Y, FORKLIFT_MAST_Z]}
        castShadow
      >
        <boxGeometry args={FORKLIFT_MAST_SIZE} />
        <meshStandardMaterial
          color={COLORS.forkliftMast}
          roughness={MATERIALS.forkliftMast.roughness}
          metalness={MATERIALS.forkliftMast.metalness}
        />
      </mesh>

      {/* Right mast rail */}
      <mesh
        position={[FORKLIFT_MAST_X, FORKLIFT_MAST_Y, FORKLIFT_MAST_Z]}
        castShadow
      >
        <boxGeometry args={FORKLIFT_MAST_SIZE} />
        <meshStandardMaterial
          color={COLORS.forkliftMast}
          roughness={MATERIALS.forkliftMast.roughness}
          metalness={MATERIALS.forkliftMast.metalness}
        />
      </mesh>

      {/* Carriage backplate — horizontal plate joining both mast rails */}
      <mesh position={[0, FORKLIFT_CARRIAGE_Y, FORKLIFT_CARRIAGE_Z]} castShadow>
        <boxGeometry args={FORKLIFT_CARRIAGE_SIZE} />
        <meshStandardMaterial
          color={COLORS.forkliftMast}
          roughness={MATERIALS.forkliftMast.roughness}
          metalness={MATERIALS.forkliftMast.metalness}
        />
      </mesh>

      {/* ── Fork tines ─────────────────────────────────────────────── */}
      {/* Left fork tine — flat rectangular arm extended forward */}
      <mesh
        position={[FORKLIFT_FORK_LEFT_X, FORKLIFT_FORK_Y, FORKLIFT_FORK_Z]}
        castShadow
      >
        <boxGeometry args={FORKLIFT_FORK_SIZE} />
        <meshStandardMaterial
          color={COLORS.forkliftFork}
          roughness={MATERIALS.forkliftFork.roughness}
          metalness={MATERIALS.forkliftFork.metalness}
        />
      </mesh>

      {/* Right fork tine */}
      <mesh
        position={[FORKLIFT_FORK_RIGHT_X, FORKLIFT_FORK_Y, FORKLIFT_FORK_Z]}
        castShadow
      >
        <boxGeometry args={FORKLIFT_FORK_SIZE} />
        <meshStandardMaterial
          color={COLORS.forkliftFork}
          roughness={MATERIALS.forkliftFork.roughness}
          metalness={MATERIALS.forkliftFork.metalness}
        />
      </mesh>

      {/* ── Pallet ─────────────────────────────────────────────────── */}
      {/*
       * Wooden pallet box sitting on top of both fork tines.
       * Acts as a solid landing surface for collected tiles so they
       * don't fall through the gap between the two fork arms.
       * Size: 1.0 × 0.14 × 1.6 (spans both forks, matches fork depth).
       */}
      <mesh
        position={[0, FORKLIFT_PALLET_Y, FORKLIFT_PALLET_Z]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={FORKLIFT_PALLET_SIZE} />
        <meshStandardMaterial
          color={COLORS.forkliftPallet}
          roughness={MATERIALS.forkliftPallet.roughness}
          metalness={MATERIALS.forkliftPallet.metalness}
        />
      </mesh>

      {/* ── Stacked tile layers on pallet ─────────────────────────── */}
      {/*
       * Renders up to FORKLIFT_PALLET_STACK_MAX visible tile-shaped layers
       * on the pallet surface. The layer count is:
       *   shipmentCount === 0  → 0 layers (empty pallet)
       *   shipmentCount % MAX  → grows 1→2→3→4, then resets to 0→1→...
       *   shipmentCount % MAX === 0 → show full stack (MAX layers)
       * This gives a "growing pile" effect that cycles as pallets are cleared.
       */}
      {Array.from({
        length:
          shipmentCount === 0
            ? 0
            : shipmentCount % FORKLIFT_PALLET_STACK_MAX ||
              FORKLIFT_PALLET_STACK_MAX,
      }).map((_, i) => (
        <mesh
          key={`stack-${i}`}
          position={[
            0,
            // Sit each layer on top of the one below it
            FORKLIFT_PALLET_Y +
              0.07 +
              i * FORKLIFT_PALLET_TILE_H +
              FORKLIFT_PALLET_TILE_H * 0.5,
            FORKLIFT_PALLET_Z,
          ]}
          castShadow
          receiveShadow
        >
          {/* Slightly narrower than pallet so each tile edge is visible */}
          <boxGeometry
            args={[
              TILE_GEOMETRY[0] * 0.88,
              FORKLIFT_PALLET_TILE_H,
              TILE_GEOMETRY[2] * 0.88,
            ]}
          />
          <meshStandardMaterial
            color={COLORS.tileNormal}
            roughness={MATERIALS.tile.roughness}
            metalness={MATERIALS.tile.metalness}
          />
          {/* Tile ID label — flat on top surface, same as on-belt label */}
          <Text
            position={[
              0,
              // Sit slightly above the tile top face
              FORKLIFT_PALLET_TILE_H * 0.51,
              0,
            ]}
            rotation={[-Math.PI / 2, 0, Math.PI]}
            fontSize={TEXT_SIZES.tileId}
            color={COLORS.tileLabel}
            anchorX="center"
            anchorY="middle"
          >
            {shippedTileIds[i] ?? ""}
          </Text>
        </mesh>
      ))}

      {/* ── Wheels ─────────────────────────────────────────────────── */}
      {/* Four wheels: front-left, front-right, rear-left, rear-right */}
      {[
        { x: -FORKLIFT_WHEEL_X, z: FORKLIFT_WHEEL_Z_FRONT },
        { x: FORKLIFT_WHEEL_X, z: FORKLIFT_WHEEL_Z_FRONT },
        { x: -FORKLIFT_WHEEL_X, z: FORKLIFT_WHEEL_Z_REAR },
        { x: FORKLIFT_WHEEL_X, z: FORKLIFT_WHEEL_Z_REAR },
      ].map((w, i) => (
        <Wheel key={`wheel-${i}`} position={[w.x, FORKLIFT_WHEEL_Y, w.z]} />
      ))}

      {/* ── HUD — floating counter & label ─────────────────────────── */}
      {/* Live shipment count floating above the forklift */}
      <Text
        position={[0, FORKLIFT_COUNTER_TEXT_Y, 0]}
        // Counter-rotate 180° around Y to cancel the parent group's π rotation
        rotation={[0, Math.PI, 0]}
        fontSize={TEXT_SIZES.counter}
        color={COLORS.shipmentBoxCounter}
        anchorX="center"
        anchorY="middle"
        outlineWidth={TEXT_SIZES.counterOutline}
        outlineColor={COLORS.textOutline}
      >
        {shipmentCount}
      </Text>

      {/* Static "SHIPMENT" label below the count */}
      <Text
        position={[0, FORKLIFT_LABEL_Y, 0]}
        // Counter-rotate 180° around Y to cancel the parent group's π rotation
        rotation={[0, Math.PI, 0]}
        fontSize={TEXT_SIZES.shipmentLabel}
        color={COLORS.shipmentBoxLabel}
        anchorX="center"
        anchorY="middle"
        outlineWidth={TEXT_SIZES.shipmentLabelOutline}
        outlineColor={COLORS.textOutline}
      >
        {LABEL_SHIPMENT}
      </Text>
    </group>
  );
};
