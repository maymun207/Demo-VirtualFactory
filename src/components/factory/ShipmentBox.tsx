/**
 * ShipmentBox.tsx — Shipment Collection Box 3D Component
 *
 * Renders the shipment/collection box at the end of the packaging station.
 * Qualified (non-defective) tiles are collected here via the PartSpawner
 * collect animation.
 *
 * Visual elements:
 *  - Wooden-toned base plate with 3 walls (back, left, right) and a short front
 *  - Live shipment count counter floating above the box (green)
 *  - "SHIPMENT" label in gold below the counter
 *
 * Counter source: DERIVED from the tiles Map — counts tiles where
 * `final_grade === 'first_quality'`. This is guaranteed to match CWF/Supabase
 * because the sync service writes `final_grade` from the same Map.
 *
 * All dimensions, colors, and material properties are sourced from params.ts.
 * Used by: Scene.tsx
 */
import { Text } from "@react-three/drei";
import { useSimulationDataStore } from "../../store/simulationDataStore";
import {
  COLORS,
  MATERIALS,
  TEXT_SIZES,
  SHIPMENT_BOX_BASE,
  SHIPMENT_BOX_BASE_Y,
  SHIPMENT_BOX_BACK_WALL,
  SHIPMENT_BOX_BACK_Y,
  SHIPMENT_BOX_BACK_Z,
  SHIPMENT_BOX_FRONT_WALL,
  SHIPMENT_BOX_FRONT_Y,
  SHIPMENT_BOX_FRONT_Z,
  SHIPMENT_BOX_SIDE_WALL,
  SHIPMENT_BOX_SIDE_Y,
  SHIPMENT_BOX_SIDE_X,
  SHIPMENT_BOX_COUNTER_Y,
  SHIPMENT_BOX_LABEL_Y,
  LABEL_SHIPMENT,
} from "../../lib/params";

export const ShipmentBox = ({
  position,
}: {
  position: [number, number, number];
}) => {
  /**
   * CUMULATIVE COUNTER: Read the totalFirstQuality counter directly.
   * This counter is atomically maintained by setTileGrade() — when a tile
   * is re-graded from first_quality to scrap/second_quality, the counter
   * is decremented in the SAME set() call. Proven accurate by the
   * DRAIN-SUMMARY diagnostic (counters === tiles Map counts exactly).
   *
   * Using the counter (O(1)) instead of iterating the tiles Map (O(n))
   * eliminates stale-state timing issues across independent selectors.
   */
  const shipmentCount = useSimulationDataStore((s) => s.totalFirstQuality);

  return (
    <group position={position}>
      {/* Box base */}
      <mesh position={[0, SHIPMENT_BOX_BASE_Y, 0]} castShadow receiveShadow>
        <boxGeometry args={SHIPMENT_BOX_BASE} />
        <meshStandardMaterial
          color={COLORS.shipmentBoxBase}
          roughness={MATERIALS.shipmentBox.roughness}
          metalness={MATERIALS.shipmentBox.metalness}
        />
      </mesh>
      {/* Back wall */}
      <mesh
        position={[0, SHIPMENT_BOX_BACK_Y, SHIPMENT_BOX_BACK_Z]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={SHIPMENT_BOX_BACK_WALL} />
        <meshStandardMaterial
          color={COLORS.shipmentBoxBack}
          roughness={MATERIALS.shipmentBox.roughness}
          metalness={MATERIALS.shipmentBox.metalness}
        />
      </mesh>
      {/* Front wall */}
      <mesh
        position={[0, SHIPMENT_BOX_FRONT_Y, SHIPMENT_BOX_FRONT_Z]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={SHIPMENT_BOX_FRONT_WALL} />
        <meshStandardMaterial
          color={COLORS.shipmentBoxFront}
          roughness={MATERIALS.shipmentBox.roughness}
          metalness={MATERIALS.shipmentBox.metalness}
        />
      </mesh>
      {/* Left wall */}
      <mesh
        position={[-SHIPMENT_BOX_SIDE_X, SHIPMENT_BOX_SIDE_Y, 0]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={SHIPMENT_BOX_SIDE_WALL} />
        <meshStandardMaterial
          color={COLORS.shipmentBoxSide}
          roughness={MATERIALS.shipmentBox.roughness}
          metalness={MATERIALS.shipmentBox.metalness}
        />
      </mesh>
      {/* Right wall */}
      <mesh
        position={[SHIPMENT_BOX_SIDE_X, SHIPMENT_BOX_SIDE_Y, 0]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={SHIPMENT_BOX_SIDE_WALL} />
        <meshStandardMaterial
          color={COLORS.shipmentBoxSide}
          roughness={MATERIALS.shipmentBox.roughness}
          metalness={MATERIALS.shipmentBox.metalness}
        />
      </mesh>

      {/* Counter */}
      <Text
        position={[0, SHIPMENT_BOX_COUNTER_Y, 0]}
        fontSize={TEXT_SIZES.counter}
        color={COLORS.shipmentBoxCounter}
        anchorX="center"
        anchorY="middle"
        outlineWidth={TEXT_SIZES.counterOutline}
        outlineColor={COLORS.textOutline}
      >
        {shipmentCount}
      </Text>

      {/* Label */}
      <Text
        position={[0, SHIPMENT_BOX_LABEL_Y, 0]}
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
