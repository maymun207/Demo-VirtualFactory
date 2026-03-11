/**
 * useCameraReset.ts — Camera View Reset Hook (Canvas-side listener)
 *
 * This hook must be mounted inside the R3F <Canvas> tree so it has access
 * to the Three.js camera (via useThree) and OrbitControls (via the ref
 * passed from Scene.tsx).
 *
 * It listens for a custom DOM event 'camera-reset' dispatched by the
 * Header button (outside the canvas). When received, it snaps:
 *  - camera.position back to CAMERA_POSITION
 *  - the OrbitControls target back to ORBIT_TARGET
 *  - calls controls.update() so damping state is cleared immediately
 *
 * All parameters (position, target) are read from params — never hardcoded.
 *
 * Usage:
 *   // Inside a component mounted within <Canvas>:
 *   const controlsRef = useRef<OrbitControlsType>(null);
 *   useCameraReset(controlsRef);
 *
 * To trigger the reset from outside the canvas:
 *   window.dispatchEvent(new CustomEvent('camera-reset'));
 */

import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { CAMERA_POSITION, ORBIT_TARGET } from '../lib/params';

/** Type alias for the OrbitControls imperative handle exposed by @react-three/drei */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type OrbitControlsRef = React.RefObject<any>;

/**
 * useCameraReset — Listens for 'camera-reset' DOM events and restores
 * the 3D camera to its initial position and orbit target.
 *
 * @param controlsRef - Ref to the OrbitControls instance from Scene.tsx
 */
export function useCameraReset(controlsRef: OrbitControlsRef): void {
  /** Access the Three.js camera from the R3F context */
  const camera = useThree((state) => state.camera);

  useEffect(() => {
    /**
     * handleReset — Immediately snaps camera back to initial position.
     * Uses .set() for an instant snap (no lerp/animation) so the view
     * is restored predictably without waiting for a transition.
     */
    const handleReset = () => {
      /** Reset camera world-space position to the initial overview position */
      camera.position.set(...CAMERA_POSITION);

      /** Reset OrbitControls look-at target to the initial orbit target */
      if (controlsRef.current) {
        /** OrbitControls.target is a THREE.Vector3 */
        controlsRef.current.target.set(...ORBIT_TARGET);
        /**
         * Must call update() after changing target or camera position so
         * OrbitControls recalculates its internal spherical coordinates.
         * Without this, the next user drag jumps from the old position.
         */
        controlsRef.current.update();
      }
    };

    /** Attach the reset handler to the window-level custom event */
    window.addEventListener('camera-reset', handleReset);

    /** Clean up the listener on unmount to avoid memory leaks */
    return () => {
      window.removeEventListener('camera-reset', handleReset);
    };
    // camera is stable (same ref throughout R3F session), controlsRef won't change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera, controlsRef]);
}
