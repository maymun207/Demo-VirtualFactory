/**
 * SecondQualityBox.tsx — Second Quality Collection Box 3D Component
 *
 * Renders the amber-themed collection box for tiles that passed the
 * defect engine evaluation but were flagged with non-scrap defects
 * (parameter drift, station anomalies). These tiles are usable but
 * not first quality.
 *
 * Visual elements:
 *  - Amber metallic box body with dark interior (open-top effect)
 *  - Amber fluorescent rim (4 edges) with emissive glow
 *  - Secondary amber fluorescent strip below the rim
 *  - Live second quality count counter floating above (amber)
 *  - "2ND QUALITY" label on the front face
 *
 * Counter source: DERIVED from the tiles Map — counts tiles where
 * `final_grade === 'second_quality'`. This is guaranteed to match
 * CWF/Supabase because the sync service writes `final_grade` from
 * the same Map.
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
  SQ_BOX_SIZE,
  SQ_BOX_INSIDE_SIZE,
  SQ_BOX_INSIDE_Y,
  SQ_BOX_COUNTER_Y,
  SQ_BOX_RIM_Y,
  SQ_BOX_RIM_THICKNESS,
  SQ_BOX_RIM_OFFSET,
  SQ_BOX_STRIP_OFFSET_Y,
  SQ_BOX_STRIP_OFFSET_Z,
  SQ_BOX_STRIP_THICKNESS,
  SQ_BOX_STRIP_DEPTH,
  SQ_BOX_STRIP_LENGTH,
  SQ_BOX_LABEL_Y,
  LABEL_SECOND_QUALITY,
} from "../../lib/params";

export const SecondQualityBox = ({
  position,
}: {
  position: [number, number, number];
}) => {
  /**
   * CUMULATIVE COUNTER: Read the totalSecondQuality counter directly.
   * This counter is atomically maintained by setTileGrade() and the
   * completion code in moveTilesOnConveyor(). Proven accurate by the
   * DRAIN-SUMMARY diagnostic (counters === tiles Map counts exactly).
   *
   * Using the counter (O(1)) instead of iterating the tiles Map (O(n))
   * eliminates stale-state timing issues across independent selectors.
   */
  const secondQualityCount = useSimulationDataStore(
    (s) => s.totalSecondQuality,
  );

  return (
    <group position={position}>
      {/* Box body — amber metallic housing */}
      <mesh castShadow receiveShadow>
        <boxGeometry args={SQ_BOX_SIZE} />
        <meshStandardMaterial
          color={COLORS.secondQualityBox}
          metalness={MATERIALS.secondQualityBox.metalness}
          roughness={MATERIALS.secondQualityBox.roughness}
        />
      </mesh>
      {/* Open top effect — dark interior visible from above */}
      <mesh position={[0, SQ_BOX_INSIDE_Y, 0]}>
        <boxGeometry args={SQ_BOX_INSIDE_SIZE} />
        <meshStandardMaterial color={COLORS.secondQualityBoxInside} />
      </mesh>

      {/* Counter above box — amber text showing second quality tile count */}
      <Text
        position={[0, SQ_BOX_COUNTER_Y, 0]}
        fontSize={TEXT_SIZES.counter}
        color={COLORS.secondQualityBoxCounter}
        anchorX="center"
        anchorY="middle"
        outlineWidth={TEXT_SIZES.counterOutline}
        outlineColor={COLORS.textOutline}
      >
        {secondQualityCount}
      </Text>

      {/* Fluorescent Rim — amber glow on 4 edges */}
      <group position={[0, SQ_BOX_RIM_Y, 0]}>
        {/* Top rim — 4 sides */}
        {[
          {
            pos: [0, 0.01, SQ_BOX_RIM_OFFSET] as [number, number, number],
            args: [
              SQ_BOX_SIZE[0],
              SQ_BOX_RIM_THICKNESS,
              SQ_BOX_RIM_THICKNESS,
            ] as [number, number, number],
          },
          {
            pos: [0, 0.01, -SQ_BOX_RIM_OFFSET] as [number, number, number],
            args: [
              SQ_BOX_SIZE[0],
              SQ_BOX_RIM_THICKNESS,
              SQ_BOX_RIM_THICKNESS,
            ] as [number, number, number],
          },
          {
            pos: [SQ_BOX_RIM_OFFSET, 0.01, 0] as [number, number, number],
            args: [
              SQ_BOX_RIM_THICKNESS,
              SQ_BOX_RIM_THICKNESS,
              SQ_BOX_SIZE[0],
            ] as [number, number, number],
          },
          {
            pos: [-SQ_BOX_RIM_OFFSET, 0.01, 0] as [number, number, number],
            args: [
              SQ_BOX_RIM_THICKNESS,
              SQ_BOX_RIM_THICKNESS,
              SQ_BOX_SIZE[0],
            ] as [number, number, number],
          },
        ].map((rim, i) => (
          <mesh key={`rim-${i}`} position={rim.pos}>
            <boxGeometry args={rim.args} />
            <meshStandardMaterial
              color={COLORS.secondQualityBoxGlow}
              emissive={COLORS.secondQualityBoxGlow}
              emissiveIntensity={
                MATERIALS.secondQualityBoxGlow.emissiveIntensity
              }
            />
          </mesh>
        ))}

        {/* Secondary wrapping strip — amber decorative band */}
        <group position={[0, SQ_BOX_STRIP_OFFSET_Y, 0]}>
          {[
            {
              pos: [0, 0, SQ_BOX_STRIP_OFFSET_Z] as [number, number, number],
              args: [
                SQ_BOX_STRIP_LENGTH,
                SQ_BOX_STRIP_THICKNESS,
                SQ_BOX_STRIP_DEPTH,
              ] as [number, number, number],
            },
            {
              pos: [0, 0, -SQ_BOX_STRIP_OFFSET_Z] as [number, number, number],
              args: [
                SQ_BOX_STRIP_LENGTH,
                SQ_BOX_STRIP_THICKNESS,
                SQ_BOX_STRIP_DEPTH,
              ] as [number, number, number],
            },
            {
              pos: [SQ_BOX_STRIP_OFFSET_Z, 0, 0] as [number, number, number],
              args: [
                SQ_BOX_STRIP_DEPTH,
                SQ_BOX_STRIP_THICKNESS,
                SQ_BOX_STRIP_LENGTH,
              ] as [number, number, number],
            },
            {
              pos: [-SQ_BOX_STRIP_OFFSET_Z, 0, 0] as [number, number, number],
              args: [
                SQ_BOX_STRIP_DEPTH,
                SQ_BOX_STRIP_THICKNESS,
                SQ_BOX_STRIP_LENGTH,
              ] as [number, number, number],
            },
          ].map((strip, i) => (
            <mesh key={`strip-${i}`} position={strip.pos}>
              <boxGeometry args={strip.args} />
              <meshStandardMaterial
                color={COLORS.secondQualityBoxGlow}
                emissive={COLORS.secondQualityBoxGlow}
                emissiveIntensity={
                  MATERIALS.secondQualityBoxStrip.emissiveIntensity
                }
              />
            </mesh>
          ))}
        </group>
      </group>

      {/* Label floats below the counter (same pattern as SHIPMENT display) */}
      <Text
        position={[0, SQ_BOX_LABEL_Y, 0]}
        fontSize={TEXT_SIZES.sqBoxLabel}
        color={COLORS.secondQualityBoxLabel}
        anchorX="center"
        anchorY="middle"
        outlineWidth={TEXT_SIZES.sqBoxLabelOutline}
        outlineColor={COLORS.textOutline}
      >
        {LABEL_SECOND_QUALITY}
      </Text>
    </group>
  );
};
