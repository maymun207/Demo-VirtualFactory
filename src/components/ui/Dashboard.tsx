/**
 * Dashboard.tsx — Top-Level UI Overlay Composition
 *
 * Assembles all HTML/CSS UI panels that overlay the 3D scene.
 * This component renders as a sibling to the <Scene> Canvas,
 * using absolute/fixed positioning to float above the WebGL content.
 *
 * Components rendered:
 *  - Header — top bar with title, controls, language toggle, session info
 *  - ControlPanel — drop-down panel with simulation sliders (toggled from Header)
 *  - Playbook — modal overlay with factory process guide
 *  - MachineTooltip — hover tooltip with live station parameters
 *  - DemoSettingsPanel — simulation configuration popup
 *
 * Note: Floating TilePassport, KPIContainer, and DefectHeatmap were removed.
 *       Their content is now embedded in the DTXFR and Basic side panels
 *       (rendered in App.tsx).
 *
 * Used by: App.tsx
 */
import { ControlPanel } from "./ControlPanel";
import { Playbook } from "./Playbook";
import { MachineTooltip } from "./MachineTooltip";
import { DemoSettingsPanel } from "./DemoSettingsPanel";
/** DemoScreen — transparent glass chat panel toggled by the Demo button in the header */
import { DemoScreen } from "../demo/DemoScreen";
/** DemoControlBar — fixed bottom-of-viewport control strip (act progress + navigation) */
import { DemoControlBar } from "../demo/DemoControlBar";
import { useAlarmMonitor } from "../../hooks/useAlarmMonitor";
/** Auto-detects sim state transitions (jams, starts, speed changes) and emits telemetry events */
import { useTelemetry } from "../../hooks/useTelemetry";

export const Dashboard = () => {
  // Run KPI/station threshold monitoring for alarm generation
  useAlarmMonitor();
  // Mount telemetry hook once — subscribes to simulationStore to auto-detect
  // state transitions (jams, starts, stops, speed changes) and emit events
  // to the ui_telemetry_events Supabase table. Zero UI overhead.
  useTelemetry();

  return (
    <>
      {/* DemoScreen — chat window anchored below header */}
      <DemoScreen />
      {/* DemoControlBar — act progress + navigation, fixed at viewport bottom */}
      <DemoControlBar />
      <ControlPanel />
      <Playbook />
      <MachineTooltip />
      <DemoSettingsPanel />
    </>
  );
};
