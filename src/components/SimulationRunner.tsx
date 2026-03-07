/**
 * SimulationRunner.tsx — Tick Subscription & Sync Orchestrator (Logic-Only Component)
 *
 * Renders nothing visible — this is a pure logic component that:
 *  1. Subscribes to the MASTER simulation store's `isDataFlowing` state
 *  2. When data flows: starts the sync service
 *  3. When data stops: stops sync + performs final sync
 *  4. Subscribes to master S-Clock (`sClockCount`) and calls `dataStore.tick()`
 *     exactly once per clock advance — no independent timers.
 *
 * MASTER CLOCK ARCHITECTURE:
 *   The S-Clock (driven by useSystemTimer via R3F's useFrame) is the single
 *   source of truth for all simulation timing. This component subscribes to
 *   sClockCount changes and reacts synchronously. No setInterval, no
 *   setTimeout, no parallel clock sources may drive simulation logic.
 *
 * This component must be mounted once at the app root level
 * (e.g., inside <Canvas> or <App>).
 *
 * It does NOT modify the MASTER store — only reads from it.
 */

import { useEffect } from "react";
import { useSimulationStore } from "../store/simulationStore";
import { useSimulationDataStore } from "../store/simulationDataStore";
import { syncService } from "../services/syncService";
import { oeeSnapshotService } from "../services/oeeSnapshotService";
import { createLogger } from "../lib/logger";
/** Work Order 2-phase production lifecycle enforcer */
import { useWorkOrderEnforcer } from "../hooks/useWorkOrderEnforcer";

/** Module-level logger for simulation runner operations. */
const log = createLogger("SimRunner");

/**
 * SimulationRunner — Logic-only component (renders null).
 *
 * Mount this once in the component tree to enable:
 *  - Data store ticking (synchronized to master S-Clock)
 *  - Background Supabase sync
 *
 * @example
 * ```tsx
 * function App() {
 *   return (
 *     <>
 *       <SimulationRunner />
 *       <Canvas>...</Canvas>
 *     </>
 *   );
 * }
 * ```
 */
export function SimulationRunner() {
  // Subscribe to MASTER store state
  const isDataFlowing = useSimulationStore((s) => s.isDataFlowing);
  const sessionId = useSimulationStore((s) => s.sessionId);

  // Data store state
  const isDataStoreRunning = useSimulationDataStore((s) => s.isRunning);

  /**
   * Mount the Work Order production enforcer.
   * This hook subscribes to the S-Clock and implements the 2-phase
   * shutdown: stop spawning tiles when pressLimitReached is hit (Phase 1),
   * then stop the simulation when the conveyor empties (Phase 2).
   */
  useWorkOrderEnforcer();

  // ── Auto-start/pause data store session when master toggles ──────
  useEffect(() => {
    const dataStore = useSimulationDataStore.getState();

    if (isDataFlowing && !isDataStoreRunning) {
      /**
       * RESUME vs START decision:
       *
       * If the data store already has a session (pause→resume), we simply
       * set isRunning=true to resume ticking. This preserves all existing
       * tiles, counters (totalFirstQuality, totalScrapGraded, etc.), and
       * conveyor positions — so the 3D quality boxes don't reset.
       *
       * Only create a brand-new session when NO session exists (first start
       * after page load or after a factory reset which clears the session).
       */
      if (dataStore.session) {
        /** RESUME — session exists from a previous pause. Keep all data. */
        useSimulationDataStore.setState({
          isRunning: true,
          session: { ...dataStore.session, status: "running" as const },
        });
        log.info(
          "Resumed existing data store session %s for master session %s",
          dataStore.session.id,
          sessionId,
        );
      } else {
        /** FIRST START — no session exists, create a brand new one. */
        dataStore
          .startSession(
            `Session ${sessionId}`,
            `Auto-started from master session ${sessionId}`,
          )
          .then(() => {
            log.info(
              "New data store session started for master session %s",
              sessionId,
            );
          })
          .catch((err) => {
            log.error("Failed to start data store session:", err);
          });
      }
    }

    if (!isDataFlowing && isDataStoreRunning) {
      /**
       * DATA STORE STOP — Phase 2 (ConveyorBelt.tsx) owns the full shutdown:
       *   drain → syncService.stop() → pauseSession() → open panels
       *
       * SimulationRunner no longer needs to drain/sync/pause here.
       * Phase 2's event-driven approach is authoritative because it fires
       * at the exact moment partsRef.size===0 (all tiles visually done),
       * eliminating the async race conditions that caused pending tiles.
       *
       * This branch is intentionally empty — kept as documentation of the
       * architectural decision. If a MANUAL stop is needed (user clicks Stop
       * before Phase 2 triggers), Phase 2 won't fire because its conditions
       * (pressLimitReached + partsRef.size===0) won't be met. In that case
       * we still need a fallback drain→sync→pause:
       */
      (async () => {
        try {
          /**
           * Step 1: Stop periodic sync — waits for any in-progress sync
           * to COMPLETE (including its markAsSynced callbacks), then does
           * one final sync of whatever was queued pre-drain.
           *
           * MUST run before drain to prevent the periodic sync's
           * markAsSynced callback from overwriting drain-completed tiles
           * back to synced=true (which would cause the post-drain sync
           * to skip them → pending tiles stuck in DB).
           */
          await syncService.stop();
          log.info("Manual stop: periodic sync stopped + pre-drain flush done");

          /**
           * Step 2: Drain conveyor — NOW safe (no concurrent sync).
           * All tiles on the data-layer belt complete their journey.
           * Post-drain sweep catches any remaining in_production tiles
           * using defectedPartIds/secondQualityPartIds bridges.
           */
          dataStore.drainConveyor();
          log.info("Manual stop: drain complete — all tiles marked completed");

          /**
           * Step 2b: Flush pending microtasks before syncing.
           *
           * CRITICAL: drainConveyor() calls moveTilesOnConveyor() which
           * defers tile_station_snapshot creation via queueMicrotask().
           * During the synchronous drain loop, microtasks DON'T execute.
           * Without this flush, the post-drain sync would find zero
           * snapshots and write nothing to the tile_station_snapshots
           * table — causing CWF to lose all per-station passport data.
           *
           * setTimeout(r, 0) yields to the event loop, allowing ALL
           * queued microtasks (snapshot creation) to execute before
           * the sync picks them up.
           */
          await new Promise((r) => setTimeout(r, 0));
          log.info(
            "Manual stop: microtask flush done — snapshots ready for sync",
          );

          /**
           * Step 3: Post-drain sync — flush drain-completed tiles to DB.
           * syncService is stopped but we can still call sync() directly.
           * This is the ONLY sync that sends drain-completed tile data.
           */
          await syncService.sync();
          log.info("Manual stop: post-drain sync completed");

          /** Step 4: Pause session — only after DB confirms all tiles written. */
          await dataStore.pauseSession();
          log.info("Manual stop: session paused");
        } catch (err) {
          log.error("Manual stop: drain-sync-pause failed:", err);
        }
      })();
    }
  }, [isDataFlowing, isDataStoreRunning, sessionId]);

  // ── Sync service lifecycle ────────────────────────────────────────
  useEffect(() => {
    if (isDataFlowing) {
      syncService.start();
      /** Start OEE snapshot sync alongside batch sync. */
      oeeSnapshotService.start();
    }

    /**
     * Cleanup: stop sync on unmount.
     * Phase 2 handles the primary final-sync for natural simulation end.
     * This cleanup is a safety-net for component unmount scenarios.
     */
    return () => {
      syncService.stop().then(() => {
        log.info("Sync service cleanup on unmount");
      });
      /** Stop OEE snapshot sync and flush final snapshot. */
      oeeSnapshotService.stop().then(() => {
        log.info("OEE snapshot service cleanup on unmount");
      });
    };
  }, [isDataFlowing]);

  // ── Tick via subscription (reacts to master S-Clock advances) ──────
  // ARCHITECTURE: The S-Clock is THE master clock. Every event in the
  // simulator is driven from this single clock source. No independent
  // timers (setInterval, setTimeout) may drive simulation logic.
  // The useSystemTimer hook advances sClockCount via R3F's useFrame,
  // and this subscription fires dataStore.tick() synchronously in response.
  useEffect(() => {
    /**
     * Subscribe directly to sClockCount changes in the master store.
     * When useSystemTimer advances the S-Clock, this fires immediately,
     * guaranteeing dataStore.tick() runs exactly once per S-Clock tick
     * with zero drift risk.
     */
    const unsubscribe = useSimulationStore.subscribe(
      (state) => state.sClockCount,
      (newCount, prevCount) => {
        /** Only tick forward — ignore resets where newCount < prevCount */
        if (newCount > prevCount) {
          useSimulationDataStore.getState().tick();
        }
      },
    );

    return unsubscribe;
  }, []);

  // ── Guard against tab close — best-effort session cleanup ─────────
  useEffect(() => {
    const handleBeforeUnload = () => {
      const dataStore = useSimulationDataStore.getState();
      if (!dataStore.session || dataStore.session.status === "completed")
        return;

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      if (!supabaseUrl || !supabaseKey) return;

      const now = new Date().toISOString();
      const url = `${supabaseUrl}/rest/v1/simulation_sessions?id=eq.${dataStore.session.id}`;

      // Use fetch with keepalive:true — request survives page unload
      // (sendBeacon only supports POST, but Supabase REST API needs PATCH)
      fetch(url, {
        method: "PATCH",
        keepalive: true,
        headers: {
          "Content-Type": "application/json",
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          Prefer: "return=minimal",
        },
        body: JSON.stringify({
          status: "abandoned",
          updated_at: now,
          completed_at: now,
        }),
      }).catch(() => {
        // Fire-and-forget — nothing we can do if it fails during unload
      });
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  // This is a logic-only component — renders nothing
  return null;
}
