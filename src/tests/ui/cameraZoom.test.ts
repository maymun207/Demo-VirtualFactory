/**
 * cameraZoom.test.ts — Camera FOV Zoom-Out Parameter Tests
 *
 * Validates the configurable constants that control the 3D camera zoom-out
 * behaviour when the CWF (Chat With your Factory) side panel opens.
 *
 * When the CWF panel slides in from the right, the 3D viewport becomes
 * narrower. To compensate, the camera FOV is increased so all factory
 * objects remain visible. These tests verify:
 *   - CWF_CAMERA_FOV_OFFSET is a positive number
 *   - Combined FOV (base + offset) stays within a reasonable range
 *   - CWF_CAMERA_FOV_TRANSITION_MS is a positive number
 *   - CWF_CAMERA_FOV_LERP_FACTOR is within valid bounds (0, 1)
 *   - Lerp formula produces correct intermediate values (pure math)
 */

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
    CAMERA_FOV,
    CWF_CAMERA_FOV_OFFSET,
    CWF_CAMERA_FOV_TRANSITION_MS,
    CWF_CAMERA_FOV_LERP_FACTOR,
    CWF_SIDE_PANEL_ANIMATION_MS,
} from '../../lib/params';

// =============================================================================
// CWF CAMERA FOV OFFSET — Zoom-out amount
// =============================================================================

describe('CWF Camera FOV Offset', () => {
    it('is a positive number', () => {
        /** The offset must be positive to widen the field of view. */
        expect(CWF_CAMERA_FOV_OFFSET).toBeGreaterThan(0);
    });

    it('combined FOV stays within a reasonable range (40°–90°)', () => {
        /** FOV below 40° is too narrow (tunnel vision); above 90° is too distorted. */
        const combinedFov = CAMERA_FOV + CWF_CAMERA_FOV_OFFSET;
        expect(combinedFov).toBeGreaterThanOrEqual(40);
        expect(combinedFov).toBeLessThanOrEqual(90);
    });

    it('does not exceed half the base FOV to avoid excessive distortion', () => {
        /** A zoom offset larger than half the base FOV would look jarring. */
        expect(CWF_CAMERA_FOV_OFFSET).toBeLessThanOrEqual(CAMERA_FOV / 2);
    });
});

// =============================================================================
// CWF CAMERA FOV TRANSITION — Animation timing
// =============================================================================

describe('CWF Camera FOV Transition', () => {
    it('transition duration is a positive number', () => {
        /** Duration must be positive for meaningful animation. */
        expect(CWF_CAMERA_FOV_TRANSITION_MS).toBeGreaterThan(0);
    });

    it('transition duration is greater than or equal to panel animation', () => {
        /** The FOV transition should lag slightly behind the panel slide. */
        expect(CWF_CAMERA_FOV_TRANSITION_MS).toBeGreaterThanOrEqual(
            CWF_SIDE_PANEL_ANIMATION_MS,
        );
    });
});

// =============================================================================
// CWF CAMERA FOV LERP FACTOR — Per-frame interpolation rate
// =============================================================================

describe('CWF Camera FOV Lerp Factor', () => {
    it('is in the exclusive range (0, 1)', () => {
        /** 0 means no movement, 1 means instant snap — both are invalid. */
        expect(CWF_CAMERA_FOV_LERP_FACTOR).toBeGreaterThan(0);
        expect(CWF_CAMERA_FOV_LERP_FACTOR).toBeLessThan(1);
    });

    it('is small enough for smooth animation (≤ 0.2)', () => {
        /** Values above ~0.2 cause visibly jerky transitions. */
        expect(CWF_CAMERA_FOV_LERP_FACTOR).toBeLessThanOrEqual(0.2);
    });
});

// =============================================================================
// LERP FORMULA — Pure math validation
// =============================================================================

describe('Camera FOV Lerp Formula (Pure Math)', () => {
    it('produces the starting value at lerp factor 0', () => {
        /** lerp(a, b, 0) should return a. */
        const result = THREE.MathUtils.lerp(CAMERA_FOV, CAMERA_FOV + CWF_CAMERA_FOV_OFFSET, 0);
        expect(result).toBeCloseTo(CAMERA_FOV, 5);
    });

    it('produces the target value at lerp factor 1', () => {
        /** lerp(a, b, 1) should return b. */
        const targetFov = CAMERA_FOV + CWF_CAMERA_FOV_OFFSET;
        const result = THREE.MathUtils.lerp(CAMERA_FOV, targetFov, 1);
        expect(result).toBeCloseTo(targetFov, 5);
    });

    it('produces an intermediate value at lerp factor 0.5', () => {
        /** lerp(a, b, 0.5) should return (a + b) / 2. */
        const targetFov = CAMERA_FOV + CWF_CAMERA_FOV_OFFSET;
        const result = THREE.MathUtils.lerp(CAMERA_FOV, targetFov, 0.5);
        expect(result).toBeCloseTo((CAMERA_FOV + targetFov) / 2, 5);
    });

    it('converges toward target after multiple iterations with CWF_CAMERA_FOV_LERP_FACTOR', () => {
        /** Simulate 120 frames of lerp to verify convergence behaviour. */
        let current = CAMERA_FOV;
        const target = CAMERA_FOV + CWF_CAMERA_FOV_OFFSET;
        for (let i = 0; i < 120; i++) {
            current = THREE.MathUtils.lerp(current, target, CWF_CAMERA_FOV_LERP_FACTOR);
        }
        /** After 120 frames at 0.05 lerp, should be within 0.1° of target. */
        expect(Math.abs(current - target)).toBeLessThan(0.1);
    });

    it('converges back to base FOV when panel closes', () => {
        /** Simulate opening (60 frames) then closing (120 frames). */
        let current = CAMERA_FOV;
        const openTarget = CAMERA_FOV + CWF_CAMERA_FOV_OFFSET;

        /** Open: lerp toward wider FOV */
        for (let i = 0; i < 60; i++) {
            current = THREE.MathUtils.lerp(current, openTarget, CWF_CAMERA_FOV_LERP_FACTOR);
        }
        /** Verify we moved toward the open target */
        expect(current).toBeGreaterThan(CAMERA_FOV + CWF_CAMERA_FOV_OFFSET * 0.5);

        /** Close: lerp back toward base FOV */
        for (let i = 0; i < 120; i++) {
            current = THREE.MathUtils.lerp(current, CAMERA_FOV, CWF_CAMERA_FOV_LERP_FACTOR);
        }
        /** After 120 frames back, should be within 0.1° of base FOV. */
        expect(Math.abs(current - CAMERA_FOV)).toBeLessThan(0.1);
    });
});
