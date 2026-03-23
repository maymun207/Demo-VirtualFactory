/**
 * Scene.tsx — 3D Factory Scene Composition
 *
 * The root 3D component that assembles the entire factory scene.
 * Wraps everything in a SceneErrorBoundary for graceful WebGL error handling.
 *
 * Renders (inside a R3F <Canvas>):
 *  - SystemTimerDriver — drives the simulation clock via useFrame
 *  - SceneLogic — per-frame station light updates
 *  - Camera + OrbitControls — user-controlled 3D camera
 *  - Lighting — ambient + spot + point + HDR environment map
 *  - Grid — infinite floor grid with section markings
 *  - 7× Station — factory machine models with indicator lights
 *  - ConveyorBelt — belt loop with rolling slats and tiles
 *  - TrashBin — waste bin for defective (scrap) tiles
 *  - SecondQualityBox — amber box for station-detected defects
 *  - ShipmentBox — collection box for first quality tiles
 *  - ProductionTable3D — 3D status matrix table
 *
 * Used by: Dashboard.tsx
 */
import { Suspense, useRef } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsType } from "three-stdlib";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Grid, Environment } from "@react-three/drei";
import { useSimulationStore } from "../../store/simulationStore";
import { useUIStore } from "../../store/uiStore";
import { Station } from "./Station";
import { TrashBin } from "./TrashBin";
import { SecondQualityBox } from "./SecondQualityBox";
import { Forklift } from "./Forklift";

import { SceneLogic } from "./SceneLogic";
import { ConveyorBelt } from "./ConveyorBelt";
import { ProductionTable3D } from "./ProductionTable3D";
import { OEEHierarchyTable3D } from "./OEEHierarchyTable3D";
import { CameraDebug } from "./CameraDebug";
import { SceneErrorBoundary } from "./SceneErrorBoundary";
import { useSystemTimer } from "../../system-timer/useSystemTimer";
import { useCameraReset } from "../../hooks/useCameraReset";
import {
  STATION_STAGES,
  STATION_COUNT,
  CAMERA_POSITION,
  CAMERA_FOV,
  CAMERA_NEAR,
  CAMERA_FAR,
  CAMERA_DEBUG,
  ORBIT_TARGET,
  ORBIT_CONTROLS,
  AMBIENT_INTENSITY,
  SPOT_LIGHT,
  POINT_LIGHT,
  ENVIRONMENT_PRESET,
  GRID_CONFIG,
  TRASH_BIN_POSITION,
  SECOND_QUALITY_BOX_POSITION,
  FORKLIFT_POSITION,
  FORKLIFT_ROTATION,
  SCENE_ELEVATION,
  FACTORY_X_OFFSET,
  FACTORY_ROTATION,
  getStationPosition,
  CWF_CAMERA_FOV_OFFSET,
  CWF_CAMERA_FOV_LERP_FACTOR,
} from "../../lib/params";

/**
 * SystemTimerDriver — Invisible component that runs useSystemTimer.
 * Must live inside the <Canvas> / <Suspense> tree because useFrame
 * (used internally by useSystemTimer) only works within R3F's render loop.
 */
const SystemTimerDriver = () => {
  useSystemTimer();
  return null;
};

/**
 * CameraFOVController — Smoothly zooms the camera out when side panels open.
 *
 * Subscribes to uiStore.showCWF and uiStore.showDTXFR and uses `useFrame`
 * to lerp the camera FOV between the normal value (CAMERA_FOV) and a wider
 * value (CAMERA_FOV + CWF_CAMERA_FOV_OFFSET × openPanelCount) each frame.
 * When both panels are open, the FOV offset is applied twice for greater
 * zoom-out so all 3D objects remain visible.
 *
 * Must live inside the <Canvas> tree to access R3F's useFrame + useThree.
 */
const CameraFOVController = () => {
  /** Access the Three.js camera instance from the R3F context */
  const camera = useThree((state) => state.camera) as THREE.PerspectiveCamera;
  /** Whether the CWF side panel is currently visible */
  const showCWF = useUIStore((s) => s.showCWF);
  /** Whether the DTXFR side panel is currently visible */
  const showDTXFR = useUIStore((s) => s.showDTXFR);
  /** Count how many side panels are open (0, 1, or 2) */
  const openPanelCount = (showCWF ? 1 : 0) + (showDTXFR ? 1 : 0);
  /** Target FOV: wider by one offset per open side panel */
  const targetFov = CAMERA_FOV + CWF_CAMERA_FOV_OFFSET * openPanelCount;

  useFrame(() => {
    /** Skip lerp if the camera FOV is already at the target (within 0.01° tolerance) */
    if (Math.abs(camera.fov - targetFov) < 0.01) return;
    /** Smoothly interpolate toward the target FOV each frame */
    camera.fov = THREE.MathUtils.lerp(
      camera.fov,
      targetFov,
      CWF_CAMERA_FOV_LERP_FACTOR,
    );
    /** Must call updateProjectionMatrix after changing FOV for Three.js to apply */
    camera.updateProjectionMatrix();
  });

  return null;
};

/**
 * CameraResetHandler — Invisible canvas component that mounts useCameraReset.
 *
 * Accepts the OrbitControls ref from Scene so useCameraReset can access
 * the controls instance. Must live inside <Canvas> for useThree access.
 *
 * @param controlsRef - Ref to the OrbitControls instance
 */
const CameraResetHandler = ({ controlsRef }: { controlsRef: React.RefObject<OrbitControlsType | null> }) => {
  /** Mount the reset listener — zero render output */
  useCameraReset(controlsRef);
  return null;
};

/**
 * Scene — Main scene component.
 *
 * Manages station group refs (stationRefs) and active state tracking
 * (activeStatesRef) for the SceneLogic per-frame update loop.
 * Uses resetVersion as key on ConveyorBelt to force full remount on reset.
 */
export const Scene = () => {
  const stations = useSimulationStore((s) => s.stations);
  const resetVersion = useSimulationStore((s) => s.resetVersion);

  /** Ref to the OrbitControls instance — used by CameraResetHandler to restore the view */
  const orbitControlsRef = useRef<OrbitControlsType | null>(null);

  // Central Station Ref Management
  const stationRefs = useRef<(THREE.Group | null)[]>(
    new Array(STATION_COUNT).fill(null),
  );
  const activeStatesRef = useRef<boolean[]>(
    new Array(STATION_COUNT).fill(false),
  );

  return (
    <SceneErrorBoundary>
      <Canvas
        shadows
        className="w-full h-full bg-black"
        camera={{
          position: CAMERA_POSITION,
          fov: CAMERA_FOV,
          near: CAMERA_NEAR,
          far: CAMERA_FAR,
        }}
      >
        <Suspense fallback={null}>
          <SystemTimerDriver />
          <CameraFOVController />
          {/* Camera reset listener — handles 'camera-reset' DOM events from the Header button */}
          <CameraResetHandler controlsRef={orbitControlsRef} />
          <SceneLogic
            stationRefs={stationRefs}
            activeStatesRef={activeStatesRef}
            stationStages={STATION_STAGES}
          />
          <OrbitControls
            ref={orbitControlsRef}
            makeDefault
            target={ORBIT_TARGET}
            minPolarAngle={ORBIT_CONTROLS.minPolarAngle}
            maxPolarAngle={ORBIT_CONTROLS.maxPolarAngle}
            minDistance={ORBIT_CONTROLS.minDistance}
            maxDistance={ORBIT_CONTROLS.maxDistance}
            enableDamping
            dampingFactor={ORBIT_CONTROLS.dampingFactor}
            zoomSpeed={ORBIT_CONTROLS.zoomSpeed}
          />

          {/* Lighting */}
          <ambientLight intensity={AMBIENT_INTENSITY} />
          <spotLight
            position={SPOT_LIGHT.position}
            angle={SPOT_LIGHT.angle}
            penumbra={SPOT_LIGHT.penumbra}
            intensity={SPOT_LIGHT.intensity}
            castShadow
            shadow-mapSize={[
              SPOT_LIGHT.shadowMapSize,
              SPOT_LIGHT.shadowMapSize,
            ]}
          />
          <pointLight
            position={POINT_LIGHT.position}
            intensity={POINT_LIGHT.intensity}
          />
          <Environment preset={ENVIRONMENT_PRESET} />

          {/* Floor */}
          <Grid
            infiniteGrid
            followCamera
            position={GRID_CONFIG.position}
            cellSize={GRID_CONFIG.cellSize}
            cellThickness={GRID_CONFIG.cellThickness}
            cellColor={GRID_CONFIG.cellColor}
            sectionSize={GRID_CONFIG.sectionSize}
            sectionThickness={GRID_CONFIG.sectionThickness}
            sectionColor={GRID_CONFIG.sectionColor}
            fadeDistance={GRID_CONFIG.fadeDistance}
            fadeStrength={GRID_CONFIG.fadeStrength}
          />

          {/* Factory group — elevated by SCENE_ELEVATION so machines sit in
              the vertical center of the viewport rather than at screen bottom */}
          <group
            position={[FACTORY_X_OFFSET, SCENE_ELEVATION, 0]}
            rotation={FACTORY_ROTATION}
          >
            {/* Stations */}
            {stations.map((station, index) => (
              <group key={station.id}>
                <Station
                  index={index}
                  position={getStationPosition(index)}
                  label={station.name.en}
                  stationRefs={stationRefs}
                />
              </group>
            ))}

            <TrashBin position={TRASH_BIN_POSITION} />
            <SecondQualityBox position={SECOND_QUALITY_BOX_POSITION} />
            <ConveyorBelt key={resetVersion} />
            {/* Forklift at shipment end — replaces the static ShipmentBox */}
            <Forklift
              position={FORKLIFT_POSITION}
              rotation={FORKLIFT_ROTATION}
            />
            <ProductionTable3D />
            {/* OEE Hierarchy — 3D floating table above the factory */}
            <OEEHierarchyTable3D />
            {/* Camera parameter debug overlay (2D screen space) — toggled by CAMERA_DEBUG */}
            {CAMERA_DEBUG && <CameraDebug />}
          </group>
        </Suspense>
      </Canvas>
    </SceneErrorBoundary>
  );
};
