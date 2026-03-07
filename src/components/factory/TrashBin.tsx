/**
 * TrashBin.tsx — Waste Bin 3D Component
 *
 * Renders the waste/scrap bin at the end of the sorting station.
 * Defective tiles are thrown here via the PartSpawner sort animation.
 *
 * Visual elements:
 *  - Grey metallic bin body with dark interior (open-top effect)
 *  - Fluorescent green rim (4 edges) with emissive glow
 *  - Secondary fluorescent strip below the rim
 *  - Live waste count counter floating above the bin
 *  - "WASTE BIN" label on the front face
 *
 * Counter source: DERIVED from the tiles Map — counts tiles where
 * `final_grade === 'scrap'`. This is guaranteed to match CWF/Supabase
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
  TRASH_BIN_SIZE,
  TRASH_BIN_INSIDE_SIZE,
  TRASH_BIN_INSIDE_Y,
  TRASH_BIN_COUNTER_Y,
  TRASH_BIN_RIM_Y,
  TRASH_BIN_RIM_THICKNESS,
  TRASH_BIN_RIM_OFFSET,
  TRASH_BIN_STRIP_OFFSET_Y,
  TRASH_BIN_STRIP_OFFSET_Z,
  TRASH_BIN_STRIP_THICKNESS,
  TRASH_BIN_STRIP_DEPTH,
  TRASH_BIN_STRIP_LENGTH,
  TRASH_BIN_LABEL_Y,
  LABEL_WASTE_BIN,
} from "../../lib/params";

export const TrashBin = ({
  position,
}: {
  position: [number, number, number];
}) => {
  /**
   * CUMULATIVE COUNTER: Read the totalScrapGraded counter directly.
   * This counter is atomically maintained by setTileGrade() and the
   * completion code in moveTilesOnConveyor(). Proven accurate by the
   * DRAIN-SUMMARY diagnostic (counters === tiles Map counts exactly).
   *
   * Using the counter (O(1)) instead of iterating the tiles Map (O(n))
   * eliminates stale-state timing issues across independent selectors.
   */
  const wasteCount = useSimulationDataStore((s) => s.totalScrapGraded);

  return (
    <group position={position}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={TRASH_BIN_SIZE} />
        <meshStandardMaterial
          color={COLORS.trashBin}
          metalness={MATERIALS.trashBin.metalness}
          roughness={MATERIALS.trashBin.roughness}
        />
      </mesh>
      {/* Open top effect — sibling mesh, not nested inside the body mesh */}
      <mesh position={[0, TRASH_BIN_INSIDE_Y, 0]}>
        <boxGeometry args={TRASH_BIN_INSIDE_SIZE} />
        <meshStandardMaterial color={COLORS.trashBinInside} />
      </mesh>

      {/* Counter above bin */}
      <Text
        position={[0, TRASH_BIN_COUNTER_Y, 0]}
        fontSize={TEXT_SIZES.counter}
        color={COLORS.trashBinCounter}
        anchorX="center"
        anchorY="middle"
        outlineWidth={TEXT_SIZES.counterOutline}
        outlineColor={COLORS.textOutline}
      >
        {wasteCount}
      </Text>

      {/* Fluorescent Rim */}
      <group position={[0, TRASH_BIN_RIM_Y, 0]}>
        {/* Top rim - 4 sides */}
        {[
          {
            pos: [0, 0.01, TRASH_BIN_RIM_OFFSET] as [number, number, number],
            args: [
              TRASH_BIN_SIZE[0],
              TRASH_BIN_RIM_THICKNESS,
              TRASH_BIN_RIM_THICKNESS,
            ] as [number, number, number],
          },
          {
            pos: [0, 0.01, -TRASH_BIN_RIM_OFFSET] as [number, number, number],
            args: [
              TRASH_BIN_SIZE[0],
              TRASH_BIN_RIM_THICKNESS,
              TRASH_BIN_RIM_THICKNESS,
            ] as [number, number, number],
          },
          {
            pos: [TRASH_BIN_RIM_OFFSET, 0.01, 0] as [number, number, number],
            args: [
              TRASH_BIN_RIM_THICKNESS,
              TRASH_BIN_RIM_THICKNESS,
              TRASH_BIN_SIZE[0],
            ] as [number, number, number],
          },
          {
            pos: [-TRASH_BIN_RIM_OFFSET, 0.01, 0] as [number, number, number],
            args: [
              TRASH_BIN_RIM_THICKNESS,
              TRASH_BIN_RIM_THICKNESS,
              TRASH_BIN_SIZE[0],
            ] as [number, number, number],
          },
        ].map((rim, i) => (
          <mesh key={`rim-${i}`} position={rim.pos}>
            <boxGeometry args={rim.args} />
            <meshStandardMaterial
              color={COLORS.trashBinGlow}
              emissive={COLORS.trashBinGlow}
              emissiveIntensity={MATERIALS.trashBinGlow.emissiveIntensity}
            />
          </mesh>
        ))}

        {/* Secondary wrapping strip */}
        <group position={[0, TRASH_BIN_STRIP_OFFSET_Y, 0]}>
          {[
            {
              pos: [0, 0, TRASH_BIN_STRIP_OFFSET_Z] as [number, number, number],
              args: [
                TRASH_BIN_STRIP_LENGTH,
                TRASH_BIN_STRIP_THICKNESS,
                TRASH_BIN_STRIP_DEPTH,
              ] as [number, number, number],
            },
            {
              pos: [0, 0, -TRASH_BIN_STRIP_OFFSET_Z] as [
                number,
                number,
                number,
              ],
              args: [
                TRASH_BIN_STRIP_LENGTH,
                TRASH_BIN_STRIP_THICKNESS,
                TRASH_BIN_STRIP_DEPTH,
              ] as [number, number, number],
            },
            {
              pos: [TRASH_BIN_STRIP_OFFSET_Z, 0, 0] as [number, number, number],
              args: [
                TRASH_BIN_STRIP_DEPTH,
                TRASH_BIN_STRIP_THICKNESS,
                TRASH_BIN_STRIP_LENGTH,
              ] as [number, number, number],
            },
            {
              pos: [-TRASH_BIN_STRIP_OFFSET_Z, 0, 0] as [
                number,
                number,
                number,
              ],
              args: [
                TRASH_BIN_STRIP_DEPTH,
                TRASH_BIN_STRIP_THICKNESS,
                TRASH_BIN_STRIP_LENGTH,
              ] as [number, number, number],
            },
          ].map((strip, i) => (
            <mesh key={`strip-${i}`} position={strip.pos}>
              <boxGeometry args={strip.args} />
              <meshStandardMaterial
                color={COLORS.trashBinGlow}
                emissive={COLORS.trashBinGlow}
                emissiveIntensity={MATERIALS.trashBinStrip.emissiveIntensity}
              />
            </mesh>
          ))}
        </group>
      </group>

      {/* Label floats below the counter (same pattern as SHIPMENT display) */}
      <Text
        position={[0, TRASH_BIN_LABEL_Y, 0]}
        fontSize={TEXT_SIZES.trashBinLabel}
        color={COLORS.textWhite}
        anchorX="center"
        anchorY="middle"
        outlineWidth={TEXT_SIZES.trashBinLabelOutline}
        outlineColor={COLORS.textOutline}
      >
        {LABEL_WASTE_BIN}
      </Text>
    </group>
  );
};
