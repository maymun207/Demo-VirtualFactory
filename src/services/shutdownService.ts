/**
 * shutdownService.ts — Phase 2 Shutdown Orchestrator
 *
 * Encapsulates the entire Phase 2 drain-sync-pause sequence as a single
 * async function. This is the SINGLE implementation — both ConveyorBelt.tsx
 * (work order completion) and SimulationRunner.tsx (manual stop) call
 * executeShutdown() instead of duplicating the 5-step async sequence.
 *
 * The module-level `isFiring` guard prevents concurrent execution, which
 * eliminates the double-drain / double-sync race condition that could occur
 * if both trigger sites fire in the same frame.
 *
 * Sequence (order matters — see inline comments for WHY):
 *   1. await syncService.stop()          — stop periodic sync + final pre-drain flush
 *   2. drainConveyor()                   — flush data-layer tiles (safe: no concurrent sync)
 *   3. await setTimeout(0)              — microtask flush (snapshots)
 *   4. await syncService.sync()         — post-drain sync (drain-completed tiles)
 *   5. await oeeSnapshotService.insertFinalSnapshot() — capture true final OEE
 *   6. await pauseSession()             — mark session paused in Supabase
 *
 * Used by: ConveyorBelt.tsx (Phase 2), SimulationRunner.tsx (manual stop)
 * Reset by: useFactoryReset.ts (clears the isFiring guard for next run)
 */

import { useSimulationDataStore } from '../store/simulationDataStore';
import { syncService } from './syncService';
import { oeeSnapshotService } from './oeeSnapshotService';
import { createLogger } from '../lib/logger';

const log = createLogger('ShutdownService');

// =============================================================================
// MODULE-LEVEL GUARD — prevents concurrent execution
// =============================================================================

let isFiring = false;

/**
 * Execute the Phase 2 shutdown sequence.
 *
 * This function is idempotent: if called while already running, it logs a
 * warning and returns immediately. The guard is cleared when the sequence
 * completes (success or failure) or when resetShutdownGuard() is called.
 *
 * @param reason - Why the shutdown was triggered:
 *   - 'work_order_complete': Phase 2 in ConveyorBelt.tsx (all tiles processed)
 *   - 'manual_stop':        User clicked Stop (SimulationRunner.tsx)
 *   - 'drain_complete':     Drain mode finished (all tiles exited belt)
 */
export async function executeShutdown(
  reason: 'work_order_complete' | 'manual_stop' | 'drain_complete',
): Promise<void> {
  if (isFiring) {
    log.warn('Shutdown already in progress — ignoring duplicate call (reason: %s)', reason);
    return;
  }

  isFiring = true;
  log.info('Shutdown started (reason: %s)', reason);

  try {
    /**
     * Step 1: Stop periodic sync — waits for any in-progress sync to COMPLETE
     * (including its markAsSynced callbacks), then does one final sync of
     * whatever was queued pre-drain.
     *
     * MUST run BEFORE drain: the periodic sync's markAsSynced callback runs
     * during stop() and sets tiles to synced=true. If drain ran first, the
     * callback would overwrite drain-completed tiles back to synced=true,
     * and the post-drain sync would skip them → pending tiles in DB.
     */
    await syncService.stop();
    log.info('Periodic sync stopped + pre-drain flush done');

    /**
     * Step 2: Drain conveyor — NOW safe (no concurrent sync).
     * All tiles on the data-layer belt complete their journey.
     * Post-drain sweep catches any remaining in_production tiles.
     */
    const dataStore = useSimulationDataStore.getState();
    dataStore.drainConveyor();
    log.info('Drain complete — all tiles marked completed');

    /**
     * Step 2b: Flush pending microtasks before syncing.
     *
     * CRITICAL: drainConveyor() → moveTilesOnConveyor() defers
     * tile_station_snapshot creation via queueMicrotask(). During
     * the synchronous drain loop, microtasks DON'T fire. Without
     * this flush, the post-drain sync finds zero snapshots and writes
     * nothing to tile_station_snapshots — CWF loses passport data.
     */
    await new Promise((r) => setTimeout(r, 0));
    log.info('Microtask flush done — snapshots ready for sync');

    /**
     * Step 3: Second final sync — flush drain-completed tiles to Supabase.
     * syncService is stopped but we can still call sync() directly.
     * This is the ONLY sync that sends drain-completed tile data.
     */
    await syncService.sync();
    log.info('Post-drain sync complete — all tiles flushed to DB');

    /**
     * Step 3.5: Final OEE snapshot — captures post-drain production totals.
     *
     * The periodic insertSnapshot() has a conveyorStatus='running' guard
     * that silently skips inserts after stopDataFlow(). This call uses
     * insertFinalSnapshot() which bypasses that guard, ensuring the
     * last OEE snapshot reflects the TRUE final counts.
     */
    await oeeSnapshotService.insertFinalSnapshot();
    log.info('Post-drain final OEE snapshot inserted');

    /**
     * Step 4: Pause session in DB — only after ALL tiles confirmed written.
     */
    await dataStore.pauseSession();
    log.info('Session paused in Supabase');

    log.info('Shutdown complete (reason: %s)', reason);
  } catch (err) {
    log.error('Shutdown failed (reason: %s):', reason, err);
    throw err;
  } finally {
    isFiring = false;
  }
}

/**
 * Reset the shutdown guard.
 *
 * Must be called during factory reset to ensure the next simulation run
 * can trigger shutdown. Without this, a stuck `isFiring=true` (from a
 * failed shutdown) would permanently block all future shutdowns.
 */
export function resetShutdownGuard(): void {
  if (isFiring) {
    log.warn('Shutdown guard was still active — resetting');
  }
  isFiring = false;
}
