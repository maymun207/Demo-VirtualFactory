/**
 * SceneLogic.tsx — Per-Frame Station Light & Color Updates
 *
 * An invisible R3F component that runs inside useFrame to update
 * station indicator lights and body glow in real-time based on
 * whether a tile is physically present at each station.
 *
 * Algorithm:
 *  For each station, check if any tile's t-parameter is within
 *  LIGHT_TOLERANCE of the station's stage position. If changed:
 *   - Active + params in range: body color/emissive to station color, light green
 *   - Active + params out of range: body color/emissive to station color, light orange
 *   - Inactive: reset body to dark, light to red (off)
 *
 * Performance:
 *  Only updates Three.js materials when state actually changes
 *  (tracked via activeStatesRef). No React re-renders occur.
 *
 * Must be rendered inside the R3F <Canvas> tree.
 * Used by: Scene.tsx
 */
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useSimulationStore } from "../../store/simulationStore";
import { useSimulationDataStore } from "../../store/simulationDataStore";
import { COLORS, MATERIALS, LIGHT_TOLERANCE } from "../../lib/params";
import { STATION_TOOLTIP_CONFIG } from "../ui/machineTooltipConfig";
import type { StationName } from "../../store/types";

/** Props for SceneLogic component */
interface SceneLogicProps {
  /** Refs to each station's Three.js group (for material manipulation) */
  stationRefs: React.MutableRefObject<(THREE.Group | null)[]>;
  /** Tracking array for each station's current active/inactive state */
  activeStatesRef: React.MutableRefObject<boolean[]>;
  /** Normalized t-positions of each station on the conveyor (from STATION_STAGES) */
  stationStages: number[];
}

/**
 * Check if any parameter for a station is out of its optimal range
 */
function hasOutOfRangeParams(stationKey: string): boolean {
  const state = useSimulationDataStore.getState();
  const config = STATION_TOOLTIP_CONFIG[stationKey as StationName];
  if (!config) return false;

  const params = state.currentParams[stationKey as StationName] as Record<
    string,
    unknown
  >;
  if (!params) return false;

  for (const param of config.params) {
    const value = params[param.key];
    if (typeof value !== "number" || !param.range) continue;

    // Check if value is outside optimal range
    if (value < param.range.min || value > param.range.max) {
      return true;
    }
  }

  return false;
}

export const SceneLogic = ({
  stationRefs,
  activeStatesRef,
  stationStages,
}: SceneLogicProps) => {
  const stations = useSimulationStore((s) => s.stations);
  const partPositionsRef = useSimulationStore((s) => s.partPositionsRef);

  useFrame(() => {
    if (!partPositionsRef.current || !stationRefs.current) return;

    stationStages.forEach((stage, idx) => {
      const group = stationRefs.current[idx];
      if (!group || !stations[idx]) return;

      const isPhysicalActive = partPositionsRef.current.some(
        (t) => Math.abs(t - stage) < LIGHT_TOLERANCE,
      );

      if (isPhysicalActive !== activeStatesRef.current[idx]) {
        activeStatesRef.current[idx] = isPhysicalActive;

        const body = group.getObjectByName("body") as THREE.Mesh;
        const light = group.getObjectByName("light") as THREE.Mesh;

        if (body && light) {
          const bodyMat = body.material as THREE.MeshStandardMaterial;
          const lightMat = light.material as THREE.MeshBasicMaterial;
          const color = stations[idx].color;

          if (isPhysicalActive) {
            bodyMat.color.set(color);
            bodyMat.emissive.set(color);
            bodyMat.emissiveIntensity =
              MATERIALS.stationBodyActive.emissiveIntensity;

            // Check if parameters are out of range
            const stationKey = stations[idx].id;
            const isOutOfRange = hasOutOfRangeParams(stationKey);

            // Orange if out of range, green if all params OK
            lightMat.color.set(
              isOutOfRange ? COLORS.lightWarning : COLORS.lightOn,
            );
          } else {
            bodyMat.color.set(COLORS.stationBodyInactive);
            bodyMat.emissive.set(COLORS.stationBodyEmissiveOff);
            bodyMat.emissiveIntensity = MATERIALS.stationBody.emissiveIntensity;
            lightMat.color.set(COLORS.lightOff);
          }
        }
      }
    });
  });

  return null;
};
