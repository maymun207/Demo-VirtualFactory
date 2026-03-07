/**
 * useSystemTimer.ts — The Heartbeat of the Virtual Factory
 *
 * This hook drives ALL simulation advancement. It runs inside the
 * React Three Fiber <Canvas> tree and uses R3F's useFrame (rAF loop)
 * to accumulate real time and emit S-Clock ticks at the configured interval.
 *
 * Timing Model:
 *   Real elapsed time (delta) is CLAMPED to MAX_FRAME_DELTA_S (0.1s)
 *   to prevent browser tab wake / lag spike burst-spawning.
 *
 *   Clamped delta is scaled by conveyorSpeed:
 *     accumulated += clampedDelta × 1000 × conveyorSpeed
 *
 *   When accumulated ≥ sClockPeriod, an S-Clock tick fires:
 *     store.advanceSClock()
 *
 *   A hard cap of MAX_TICKS_PER_FRAME (3) limits how many ticks
 *   can execute in a single frame. Any remaining accumulator is
 *   discarded to prevent "catch-up" bursts on subsequent frames.
 *
 * Jam Auto-Resume:
 *   If the conveyor has been jammed for longer than JAM_AUTO_RESUME_MS,
 *   it automatically transitions back to 'running'.
 *
 * Important:
 *   - S-Clock ticks whenever isDataFlowing is true, regardless of conveyorStatus
 *   - P-Clock gating (stop production when jammed) happens inside advanceSClock()
 *   - This hook must live inside the <Canvas>/<Suspense> tree
 *
 * Used by: Scene.tsx (as <SystemTimerDriver /> component)
 */
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useSimulationStore } from '../store/simulationStore';
import {
  JAM_AUTO_RESUME_MS,
  MAX_TICKS_PER_FRAME,
  MAX_FRAME_DELTA_S,
} from '../lib/params';

export const useSystemTimer = () => {
  /**
   * Time accumulator in milliseconds.
   * Persists across frames. Reset to 0 when simulation stops.
   */
  const accumulatorRef = useRef(0);

  useFrame((_, delta) => {
    const state = useSimulationStore.getState();

    // ── Guard: only tick when simulation is actively running ──────
    // Note: S-Clock is independent of conveyor jams/stops.
    // P-Clock gating happens inside advanceSClock().
    if (!state.isDataFlowing) {
      accumulatorRef.current = 0;
      return;
    }

    // ── Jam auto-resume: if jammed/jam_scrapping too long, auto-clear ──
    if (
      (state.conveyorStatus === 'jammed' || state.conveyorStatus === 'jam_scrapping') &&
      state.jamStartedAt !== null &&
      Date.now() - state.jamStartedAt >= JAM_AUTO_RESUME_MS
    ) {
      state.setConveyorStatus('running');
    }

    // ── Clamp delta to prevent browser-wake burst ────────────────
    // R3F's delta can spike to seconds when a tab is backgrounded.
    // Clamping to MAX_FRAME_DELTA_S (0.1s) ensures the accumulator
    // gains at most 200ms per frame (at speed=2.0×), preventing
    // massive tick bursts.
    const clampedDelta = Math.min(delta, MAX_FRAME_DELTA_S);

    // ── Accumulate real time (scaled by conveyor speed) ──────────
    // clampedDelta is in seconds from R3F, convert to ms and scale
    accumulatorRef.current += clampedDelta * 1000 * state.conveyorSpeed;

    // ── Emit S-Clock ticks (with per-frame cap) ──────────────────
    // Process pending ticks up to MAX_TICKS_PER_FRAME to handle
    // normal multi-tick frames gracefully while preventing runaway
    // burst-spawning after lag spikes.
    let ticksThisFrame = 0;
    while (
      accumulatorRef.current >= state.sClockPeriod &&
      ticksThisFrame < MAX_TICKS_PER_FRAME
    ) {
      accumulatorRef.current -= state.sClockPeriod;
      state.advanceSClock();
      ticksThisFrame++;
    }

    // ── Discard excess accumulator to prevent catch-up burst ─────
    // If we hit the tick cap, there's still time left in the
    // accumulator from a lag spike. Zeroing it prevents those
    // "owed" ticks from firing in subsequent frames, which would
    // just spread the burst across multiple frames instead of one.
    if (ticksThisFrame >= MAX_TICKS_PER_FRAME) {
      accumulatorRef.current = 0;
    }
  });

  return null;
};
