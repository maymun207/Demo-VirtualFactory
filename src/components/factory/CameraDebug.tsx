/**
 * CameraDebug.tsx — Real-Time Camera & Scene Parameter Overlay
 *
 * This component renders a small, semi-transparent debug overlay in the
 * top-left corner of the 3D scene. It displays:
 *  1. Live camera position (x, y, z)
 *  2. OrbitControls target (look-at point)
 *  3. Current Camera FOV
 *  4. Static scene constants (Elevation, X-Offset)
 *
 * It uses R3F's `useFrame` to update the values every frame as the user
 * orbits or the camera lerps.
 *
 * Renders via drei's <Html calculatePosition={() => [0,0,0]} />, which
 * places the 2D content in a fixed screen-space div.
 */
import { useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import {
  SCENE_ELEVATION,
  FACTORY_X_OFFSET,
  FACTORY_ROTATION,
} from "../../lib/params";

export const CameraDebug = () => {
  const { camera, controls } = useThree();

  // Local state for the live string to avoid heavy React state updates every frame
  // We'll use a ref for the values and update a single state string or use a direct DOM ref.
  const [debugText, setDebugText] = useState("");

  useFrame(() => {
    /** Live camera world-space position — updates as user orbits */
    const pos = camera.position;
    /** OrbitControls look-at target — updates as user pans */
    const target = (controls as any)?.target || new THREE.Vector3(0, 0, 0);
    /** Current camera field of view in degrees — updates with CWF panel */
    const fov = (camera as THREE.PerspectiveCamera).fov;

    /** True when the user has panned away from the default origin target */
    const hasPanned =
      Math.abs(target.x) > 0.01 ||
      Math.abs(target.y) > 0.01 ||
      Math.abs(target.z) > 0.01;

    const text = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━
  INITIAL LOOK PARAMETERS
  Orbit → Share → Set ✨
━━━━━━━━━━━━━━━━━━━━━━━━━━━
CAMERA_POSITION : [${pos.x.toFixed(2)}, ${pos.y.toFixed(2)}, ${pos.z.toFixed(2)}]
ORBIT_TARGET    : [${target.x.toFixed(4)}, ${target.y.toFixed(4)}, ${target.z.toFixed(4)}]${hasPanned ? " ⚠️ PANNED" : ""}
CAMERA_FOV      : ${fov.toFixed(1)}
SCENE_ELEVATION : ${SCENE_ELEVATION}
FACTORY_X_OFFSET: ${FACTORY_X_OFFSET}
FACTORY_ROTATION: [${FACTORY_ROTATION.map((r) => r.toFixed(3)).join(", ")}]
━━━━━━━━━━━━━━━━━━━━━━━━━━━
    `.trim();

    if (text !== debugText) {
      setDebugText(text);
    }
  });

  return (
    <Html
      fullscreen
      style={{
        pointerEvents: "none",
        display: "flex",
        justifyContent: "flex-start",
        alignItems: "flex-start",
        padding: "20px",
      }}
    >
      <div
        style={{
          backgroundColor: "rgba(0, 0, 0, 0.7)",
          color: "#00ff88",
          fontFamily: "monospace",
          fontSize: "12px",
          padding: "10px",
          borderRadius: "4px",
          border: "1px solid #00ff88",
          whiteSpace: "pre-wrap",
          pointerEvents: "auto",
          boxShadow: "0 0 10px rgba(0, 255, 136, 0.3)",
          backdropFilter: "blur(4px)",
        }}
      >
        {debugText}
      </div>
    </Html>
  );
};
