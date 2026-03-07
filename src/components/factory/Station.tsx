/**
 * Station.tsx — Individual Factory Station 3D Component
 *
 * Renders a single production station with:
 *  - A grey base pedestal
 *  - A reactive body that glows with the station's color when active
 *  - An indicator light sphere (red=off, green=active) — driven by SceneLogic
 *  - A floating text label above the station
 *  - A transparent hitbox for hover detection (MachineTooltip)
 *
 * The body and light meshes are named ('body', 'light') so that
 * SceneLogic can locate them via group.getObjectByName() for
 * imperative material updates without triggering React re-renders.
 *
 * Hover events on the hitbox mesh update uiStore.hoveredStation to
 * trigger the MachineTooltip overlay with live parameter data.
 *
 * Wrapped in React.memo to prevent re-renders when sibling stations change.
 * Used by: Scene.tsx
 */
import { useRef, useEffect, useCallback, memo } from "react";
import { Text } from "@react-three/drei";
import * as THREE from "three";
import type { ThreeEvent } from "@react-three/fiber";
import { useUIStore } from "../../store/uiStore";
import { STATION_INDEX_TO_NAME } from "../ui/machineTooltipConfig";
import {
  COLORS,
  MATERIALS,
  STATION_BASE_SIZE,
  STATION_BASE_Y,
  STATION_BODY_SIZE,
  STATION_BODY_Y,
  STATION_LIGHT_RADIUS,
  STATION_LIGHT_SEGMENTS,
  STATION_LIGHT_Y,
  STATION_LABEL_Y,
  TEXT_SIZES,
} from "../../lib/params";

/** Props for the Station component */
interface StationProps {
  /** 3D world position [x, y, z] for this station group */
  position: [number, number, number];
  /** Display label text (station name in current language) */
  label: string;
  /** Zero-based station index (0=Press, 6=Packaging) */
  index: number;
  /** Shared ref array — this station registers itself at stationRefs[index] */
  stationRefs: React.MutableRefObject<(THREE.Group | null)[]>;
}

const StationInner = ({
  position,
  label,
  index,
  stationRefs,
}: StationProps) => {
  const groupRef = useRef<THREE.Group>(null);

  useEffect(() => {
    stationRefs.current[index] = groupRef.current;
  }, [index, stationRefs]);

  // ─── Hover Handlers ──────────────────────────────────────────────────────
  const stationName = STATION_INDEX_TO_NAME[index];

  const handlePointerOver = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      const { clientX, clientY } = e;
      useUIStore.getState().setHoveredStation(stationName, {
        x: clientX,
        y: clientY,
      });
      // Change cursor to indicate interactivity
      document.body.style.cursor = "pointer";
    },
    [stationName],
  );

  const handlePointerMove = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      const { clientX, clientY } = e;
      useUIStore.getState().setHoveredStation(stationName, {
        x: clientX,
        y: clientY,
      });
    },
    [stationName],
  );

  const handlePointerOut = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    useUIStore.getState().setHoveredStation(null);
    document.body.style.cursor = "auto";
  }, []);

  return (
    <group
      position={position}
      ref={groupRef}
      onPointerOver={handlePointerOver}
      onPointerMove={handlePointerMove}
      onPointerOut={handlePointerOut}
    >
      {/* Base */}
      <mesh position={[0, STATION_BASE_Y, 0]} castShadow receiveShadow>
        <boxGeometry args={STATION_BASE_SIZE} />
        <meshStandardMaterial
          color={COLORS.stationBase}
          roughness={MATERIALS.stationBase.roughness}
          metalness={MATERIALS.stationBase.metalness}
        />
      </mesh>

      {/* Reactive Body */}
      <mesh
        position={[0, STATION_BODY_Y, 0]}
        name="body"
        castShadow
        receiveShadow
      >
        <boxGeometry args={STATION_BODY_SIZE} />
        <meshStandardMaterial
          color={COLORS.stationBodyInactive}
          emissive={COLORS.stationBodyEmissiveOff}
          emissiveIntensity={MATERIALS.stationBody.emissiveIntensity}
          roughness={MATERIALS.stationBody.roughness}
          metalness={MATERIALS.stationBody.metalness}
          transparent
          opacity={MATERIALS.stationBody.opacity}
        />
      </mesh>

      {/* Status Light */}
      <mesh position={[0, STATION_LIGHT_Y, 0]} name="light">
        <sphereGeometry
          args={[
            STATION_LIGHT_RADIUS,
            STATION_LIGHT_SEGMENTS,
            STATION_LIGHT_SEGMENTS,
          ]}
        />
        <meshBasicMaterial color={COLORS.lightOff} />
      </mesh>

      {/* Station Label */}
      <Text
        position={[0, STATION_LABEL_Y, 0]}
        fontSize={TEXT_SIZES.stationLabel}
        color={COLORS.textWhite}
        anchorX="center"
        anchorY="middle"
        outlineWidth={TEXT_SIZES.stationLabelOutline}
        outlineColor={COLORS.textOutline}
      >
        {label}
      </Text>
    </group>
  );
};

/**
 * Memoized Station export.
 * Prevents re-renders when other stations' props change.
 */
export const Station = memo(StationInner);
