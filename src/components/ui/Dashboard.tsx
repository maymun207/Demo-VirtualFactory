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
import { useAlarmMonitor } from "../../hooks/useAlarmMonitor";

export const Dashboard = () => {
  // Run KPI/station threshold monitoring for alarm generation
  useAlarmMonitor();

  return (
    <>
      <ControlPanel />
      <Playbook />
      <MachineTooltip />
      <DemoSettingsPanel />
    </>
  );
};
