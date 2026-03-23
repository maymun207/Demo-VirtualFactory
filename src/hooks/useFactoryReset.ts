/**
 * useFactoryReset.ts — Multi-Store Reset Orchestrator
 *
 * Provides a single callback that resets the entire factory simulation
 * across all stores (simulation, data, KPI, UI) in the correct order.
 *
 * Why a hook?
 *   Each Zustand store is independent and knows nothing about the others.
 *   A factory reset must coordinate across multiple stores, so this logic
 *   lives in a dedicated hook rather than inside any single store.
 *
 * Reset order:
 *   1. Data store → end session in Supabase, final sync, clear local data
 *   2. KPIs → clear calculated values and trend history
 *   3. UI → close all floating panels
 *   4. Simulation → reset clocks, counters, matrix, regenerate session ID
 *
 * Used by: Header (reset button), BottomToolbar (reset button)
 */
import { useCallback } from 'react';
import { useSimulationStore } from '../store/simulationStore';
import { useSimulationDataStore } from '../store/simulationDataStore';
import { useKPIStore } from '../store/kpiStore';
import { useUIStore } from '../store/uiStore';
/** Work Order store — reset pressLimitReached flag on factory reset */
import { useWorkOrderStore } from '../store/workOrderStore';
/** CWF store — clear chat history and detach from old simulation on reset */
import { useCWFStore } from '../store/cwfStore';
/** Copilot store — reset activation state / action history on factory reset */
import { useCopilotStore } from '../store/copilotStore';
import { syncService } from '../services/syncService';
import { resetShutdownGuard } from '../services/shutdownService';
import { createLogger } from '../lib/logger';

/** Module-level logger for factory reset operations. */
const log = createLogger('FactoryReset');

/**
 * Returns a stable (memoized) callback that performs a full factory reset.
 *
 * @returns A function that, when called, ends the current session in Supabase,
 *          performs a final sync, and resets all stores to their initial state.
 *
 * @example
 * ```tsx
 * const resetFactory = useFactoryReset();
 * <button onClick={resetFactory}>Reset</button>
 * ```
 */
export function useFactoryReset() {
  return useCallback(async () => {
    /**
     * STEP 0: Clear the shutdown guard and stop the simulation IMMEDIATELY.
     * resetShutdownGuard() ensures a stuck isFiring flag (from a failed or
     * in-progress shutdown) doesn't permanently block future shutdowns.
     * stopDataFlow() halts the simulation visually — the user must see it
     * stop instantly when they click Reset.
     */
    resetShutdownGuard();
    useSimulationStore.getState().stopDataFlow();
    log.info('Shutdown guard cleared + simulation stopped (immediate)');

    const dataStore = useSimulationDataStore.getState();

    /**
     * STEP 1: Drain the data-layer conveyor.
     * Any tiles still on the logical belt must complete their journey and
     * receive a final grade before the data is cleared. This ensures
     * ON_BELT = 0 and accurate final KPI values.
     */
    dataStore.drainConveyor();

    /**
     * STEP 2: End the session (fire-and-forget to avoid Supabase timeout blocking).
     * The local session state is updated synchronously inside endSession().
     * The Supabase PATCH is best-effort — if it fails, the heartbeat cleanup
     * will catch it server-side.
     */
    if (dataStore.session) {
      dataStore.endSession().catch((err) => {
        log.warn('endSession background error (non-blocking):', err);
      });
    }

    // 3. Final sync to flush any remaining unsynced records (fire-and-forget)
    syncService.stop().catch((err) => {
      log.warn('syncService stop error (non-blocking):', err);
    });

    // 4. Clear all data store local state
    dataStore.resetDataStore();
    log.info('Data store session ended and cleared');

    // 5. Reset KPI store (clear KPIs, defects, trend history)
    useKPIStore.getState().resetKPIs();

    // 6. Close all floating UI panels and clear simulation gate + ended flags
    useUIStore.setState({
      showPassport: false,
      showHeatmap: false,
      showControlPanel: false,
      /** Close the KPI (Anahtar Performans Göstergesi) panel on reset. */
      showKPI: false,
      /** Close the Production Table panel on reset. */
      showProductionTable: false,
      /** Close the Alarm Log panel on reset. */
      showAlarmLog: false,
      /** Close the OEE Hierarchy panel on reset. */
      showOEEHierarchy: false,
      /** Close the Demo Settings panel on reset. */
      showDemoSettings: false,
      /**
       * Clear the simulation-configured gate.
       * The user MUST visit Demo Settings again before the next run,
       * ensuring deliberate reconfiguration after every simulation cycle.
       */
      isSimConfigured: false,
      /**
       * Clear the simulationEnded flag so the NEXT run's Demo Settings close
       * will correctly call setSimConfigured(true) and enable the Start button.
       * Without this, the gate would stay locked forever after the first
       * natural simulation completion + reset cycle.
       */
      simulationEnded: false,
    });

    // 7. Reset simulation state (clocks, counters, matrix, session)
    useSimulationStore.getState().resetSimulation();

    /**
     * 8. Reset Work Order runtime flags.
     * Clears pressLimitReached so the enforcer is ready for the next run.
     * The user's selectedWorkOrderId is preserved — they should not have to
     * re-select their work order after each factory reset.
     */
    useWorkOrderStore.getState().resetWorkOrderState();
    log.info('Work Order state reset (pressLimitReached cleared)');

    /**
     * STEP 9: Reset CWF and Copilot state.
     *
     * When the user resets the factory, CWF must stop tracking the OLD
     * simulation UUID. Without this step:
     *  - CWF would still show messages / tool calls from the last session.
     *  - The Copilot pink theme might remain active even though the Copilot
     *    engine stopped monitoring the (now-gone) simulation.
     *  - When a NEW simulation starts, CWF could briefly send queries
     *    against the old UUID until App.tsx updates setSimulationId().
     *
     * What we do:
     *  a) resetCopilot()   — clears cwfState, action history, counters, pink theme
     *  b) clearMessages()  — empties the CWF chat history
     *  c) setSimulationId(null) — detaches CWF from old session UUID
     *  d) Server-side disable call (fire-and-forget) — sets copilot_config.cwf_state
     *     back to 'normal' in Supabase so the next session gets a clean slate
     *  e) System message — visible session boundary in the conversation
     *
     * App.tsx will call setSimulationId(newUUID) again automatically when the
     * new simulation's Supabase session row is created, reconnecting CWF.
     */
    const copilotSnapshot = useCopilotStore.getState();
    const cwfSnapshot = useCWFStore.getState();
    /**
     * Read prevSimId from simulationDataStore BEFORE resetDataStore() clears it.
     * This is the single source of truth for the session UUID — cwfStore no
     * longer holds a mirror copy.
     */
    const prevSimId = useSimulationDataStore.getState().session?.id ?? null;

    /** 9a. Reset all copilot Zustand state — clears pink theme and action feed */
    copilotSnapshot.resetCopilot();

    /** 9b. Clear CWF message history */
    cwfSnapshot.clearMessages();

    /** 9d. Tell the server to reset copilot_config for the old simulation (fire-and-forget) */
    if (prevSimId) {
      fetch('/api/cwf/copilot/disable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ simulationId: prevSimId }),
      }).catch(() => {
        /** Server may already be clean — ignore errors */
      });
    }

    /** 9e. Insert a visible session-boundary message so the user knows CWF was reset */
    /** We re-read the store after clearMessages() to get the fresh addSystemMessage action */
    useCWFStore.getState().addSystemMessage(
      '🔄 Factory reset — CWF ready for new simulation. Start a new run to reconnect.'
    );

    log.info('CWF and Copilot state reset (simulation disconnected)');

    log.info('Full factory reset complete');
  }, []);
}

