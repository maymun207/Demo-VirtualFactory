/**
 * App.tsx — Application Root Component
 *
 * The top-level component that initializes the application:
 *  1. Activates useKPISync to bridge simulationStore → kpiStore
 *  2. Activates useConveyorBehaviour to drive scenario-based conveyor effects
 *  3. Starts telemetry sync to Supabase on mount (stops on unmount)
 *  4. Runs SimulationRunner for data-layer ticking + Supabase batch sync
 *  5. Renders the 3D <Scene> and 2D <Dashboard> overlay side-by-side
 *  6. Hosts the DTXFR side panel as a left-docked column that pushes
 *     the main content area to the right when open.
 *  7. Hosts the CWF side panel as a right-docked column that pushes
 *     the main content area to the left when open.
 *
 * Layout: Flex-row container — DTXFR panel occupies a fixed-width left
 * column, main content (Scene + Dashboard) takes flex-1, CWF panel
 * occupies a fixed-width right column. Widths are controlled by
 * dtxfrPanelWidth and cwfPanelWidth in uiStore and animated on open/close.
 *
 * Used by: main.tsx
 */
import { useEffect } from "react";
import { Scene } from "./components/factory/Scene";
import { Dashboard } from "./components/ui/Dashboard";
import { CWFChatPanel } from "./components/ui/CWFChatPanel";
import { DTXFRPanel } from "./components/ui/DTXFRPanel";
import { BasicPanel } from "./components/ui/BasicPanel";
import { SimulationRunner } from "./components/SimulationRunner";
import { useTelemetryStore } from "./store/telemetryStore";
import { useKPISync } from "./hooks/useKPISync";
/** Conveyor Behaviour Engine: drives auto speed-change and jam injection from scenario settings */
import { useConveyorBehaviour } from "./hooks/useConveyorBehaviour";
/** CWF Command Listener: subscribes to Supabase Realtime for AI-driven parameter changes */
import { useCWFCommandListener } from "./hooks/useCWFCommandListener";
/** CWF store: chat state management for the AI agent panel */
import { useCWFStore } from "./store/cwfStore";
/** Simulation data store: tile lifecycle, machine states, and Supabase sync */
import { useSimulationDataStore } from "./store/simulationDataStore";
import { useUIStore } from "./store/uiStore";
import { CWF_SIDE_PANEL_ANIMATION_MS } from "./lib/params";
import { Header } from "./components/ui/Header";

function App() {
  /** Activate KPI synchronization (reacts to simulation clock changes) */
  useKPISync();

  /**
   * Activate the Conveyor Behaviour Engine.
   * Subscribes to P-clock and applies speed fluctuations and jam events
   * according to the active scenario's conveyorSettings. Mounts once here
   * so all sub-components see side-effects via simulationStore.
   */
  useConveyorBehaviour();

  /**
   * Activate the CWF Command Listener.
   * Subscribes to Supabase Realtime INSERT events on the cwf_commands table
   * and applies AI-driven parameter changes to the live simulation.
   */
  useCWFCommandListener();

  useEffect(() => {
    /** Start Supabase telemetry sync when the app mounts */
    useTelemetryStore.getState().startTelemetrySync();
    return () => {
      /** Stop Supabase telemetry sync when the app unmounts */
      useTelemetryStore.getState().stopTelemetrySync();
    };
  }, []);

  /**
   * Sync simulation ID to CWF store.
   * Subscribes to simulationDataStore and updates cwfStore.simulationId
   * whenever the session changes. Also posts a system message when connected.
   */
  useEffect(() => {
    const unsubscribe = useSimulationDataStore.subscribe((state) => {
      /** Read the session ID from the simulation data store */
      const sessionId = state.session?.id ?? null;
      /** Read the current CWF simulation ID to avoid redundant updates */
      const currentCWFId = useCWFStore.getState().simulationId;

      if (sessionId !== currentCWFId) {
        /** Update the CWF store with the new simulation ID and session code */
        const sessionCode = state.session?.session_code ?? null;
        useCWFStore.getState().setSimulationId(sessionId, sessionCode);
        if (sessionId) {
          /** Update UI state or trigger history refresh if needed */
        }
      }
    });
    return unsubscribe;
  }, []);

  /** Whether the DTXFR side panel is currently visible */
  const showDTXFR = useUIStore((s) => s.showDTXFR);
  /** Current width of the DTXFR side panel (user-resizable) */
  const dtxfrPanelWidth = useUIStore((s) => s.dtxfrPanelWidth);
  /** Whether the CWF side panel is currently visible */
  const showCWF = useUIStore((s) => s.showCWF);
  /** Current width of the CWF side panel (user-resizable) */
  const cwfPanelWidth = useUIStore((s) => s.cwfPanelWidth);
  /** Whether the Basic side panel is currently visible */
  const showBasicPanel = useUIStore((s) => s.showBasicPanel);
  /** Current width of the Basic side panel (user-resizable) */
  const basicPanelWidth = useUIStore((s) => s.basicPanelWidth);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-black flex flex-col">
      <Header />
      <div className="flex-1 flex flex-row overflow-hidden">
        {/* ── Basic side panel: left-docked ─────────────────────────────── */}
        <div
          className="h-full overflow-hidden shrink-0"
          style={{
            /** Width driven by uiStore; collapses to 0 when hidden */
            width: showBasicPanel ? basicPanelWidth : 0,
            /** Smooth slide-in / slide-out animation */
            transition: `width ${CWF_SIDE_PANEL_ANIMATION_MS}ms ease-in-out`,
          }}
        >
          {showBasicPanel && <BasicPanel />}
        </div>

        {/* ── DTXFR side panel: left-docked, right of Basic ──────────── */}
        <div
          className="h-full overflow-hidden shrink-0"
          style={{
            /** Width driven by uiStore; collapses to 0 when hidden */
            width: showDTXFR ? dtxfrPanelWidth : 0,
            /** Smooth slide-in / slide-out animation */
            transition: `width ${CWF_SIDE_PANEL_ANIMATION_MS}ms ease-in-out`,
          }}
        >
          {showDTXFR && <DTXFRPanel />}
        </div>

        {/* ── Main content area: 3D scene + all overlay panels ────────── */}
        <div
          className="relative flex-1 h-full overflow-hidden"
          style={{
            /** Animate width change when side panels open/close */
            transition: `width ${CWF_SIDE_PANEL_ANIMATION_MS}ms ease-in-out`,
          }}
        >
          {/* Logic-only: data-layer tick loop + Supabase sync (renders null) */}
          <SimulationRunner />
          <Scene />
          <Dashboard />
        </div>

        {/* ── CWF side panel: right-docked, full-height ──────────────── */}
        <div
          className="h-full overflow-hidden shrink-0"
          style={{
            /** Width driven by uiStore; collapses to 0 when hidden */
            width: showCWF ? cwfPanelWidth : 0,
            /** Smooth slide-in / slide-out animation */
            transition: `width ${CWF_SIDE_PANEL_ANIMATION_MS}ms ease-in-out`,
          }}
        >
          {showCWF && <CWFChatPanel />}
        </div>
      </div>
    </div>
  );
}

export default App;
