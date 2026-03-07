/**
 * uiStore.ts — User Interface State (Zustand)
 *
 * Manages all UI-related state that is independent of the simulation:
 *  - Active language (Turkish / English)
 *  - Modal visibility (station detail modals)
 *  - Panel visibility toggles (Passport, Heatmap, KPI, ControlPanel, ProductionTable)
 *  - Hovered station (for machine hover tooltip)
 *  - Demo Settings gate flags:
 *      isSimConfigured  — whether the user has visited Demo Settings this cycle
 *      simulationEnded  — whether the simulation ended naturally (Phase 2 stop)
 *                         Prevents Demo Settings close from re-enabling Start
 *                         without an explicit Reset.
 *
 * Architecture:
 *  This is a pure UI store — no business logic, no side effects.
 *  Components subscribe to individual selectors for minimal re-renders.
 *
 * Used by: Header, ControlPanel, BottomToolbar, TilePassport,
 *          KPIContainer, DefectHeatmap, useTranslation, MachineTooltip,
 *          DemoSettingsPanel, ConveyorBelt (Phase 2 stop), useFactoryReset
 */
import { create } from 'zustand';
import type { StationName } from './types';
import {
  UI_DEFAULTS,
  CWF_SIDE_PANEL_DEFAULT_WIDTH,
  CWF_SIDE_PANEL_MIN_WIDTH,
  CWF_SIDE_PANEL_MAX_WIDTH,
  DTXFR_SIDE_PANEL_DEFAULT_WIDTH,
  DTXFR_SIDE_PANEL_MIN_WIDTH,
  DTXFR_SIDE_PANEL_MAX_WIDTH,
  BASIC_SIDE_PANEL_DEFAULT_WIDTH,
  BASIC_SIDE_PANEL_MIN_WIDTH,
  BASIC_SIDE_PANEL_MAX_WIDTH,
} from '../lib/params';

/**
 * Supported interface languages.
 * 'tr' = Turkish (default), 'en' = English
 */
export type Language = 'tr' | 'en';

/**
 * UIState — Shape of the UI store.
 */
interface UIState {
  /** Currently active language for all translated strings */
  currentLang: Language;
  /**
   * ID of the currently open station modal, or null if none.
   * Matches a station.id from INITIAL_STATIONS (e.g., 'press', 'kiln').
   */
  activeModal: string | null;
  /** Whether the Tile Passport floating panel is visible */
  showPassport: boolean;
  /** Whether the FTQ & Defect Heatmap floating panel is visible */
  showHeatmap: boolean;
  /** Whether the Control Panel (sliders) is visible */
  showControlPanel: boolean;
  /** Whether the 3D Production Status Table is rendered in the scene */
  showProductionTable: boolean;
  /** Whether the KPI floating panel is visible */
  showKPI: boolean;
  /** Whether the Demo Settings popup is visible */
  showDemoSettings: boolean;
  /** Whether the CWF chat panel is visible */
  showCWF: boolean;
  /** Whether the DTXFR (Digital Transfer) passport panel is visible */
  showDTXFR: boolean;
  /** Current width of the CWF side panel in px (user-resizable) */
  cwfPanelWidth: number;
  /** Current width of the DTXFR side panel in px (user-resizable) */
  dtxfrPanelWidth: number;
  /** Whether the Basic (KPI + Heatmap) side panel is visible */
  showBasicPanel: boolean;
  /** Current width of the Basic side panel in px (user-resizable) */
  basicPanelWidth: number;
  /** Whether the Alarm Log popup is visible */
  showAlarmLog: boolean;
  /** Whether the OEE Hierarchy 3D table is visible in the scene */
  showOEEHierarchy: boolean;
  /**
   * isSimConfigured — Demo Settings Gate flag.
   *
   * When false (default on page load and after every factory reset),
   * the Start button shows a toast asking the user to open Demo Settings.
   *
   * Set to true when the user closes the Demo Settings panel (via X button,
   * Escape, or backdrop click) — ONLY when simulationEnded is false.
   * While simulationEnded is true (natural run end), closing Demo Settings
   * will NOT unlock the gate; the user must click Reset first.
   *
   * Reset to false by useFactoryReset so the next run requires a new visit.
   */
  isSimConfigured: boolean;

  /**
   * simulationEnded — true when the simulation has finished naturally
   * (Work Order tile count reached, all tiles drained via Phase 2 stop).
   *
   * Distinguishes between:
   *   false = simulation is either running OR paused mid-run (user can resume)
   *   true  = simulation completed its batch; Reset is required before restarting
   *
   * Set to true by ConveyorBelt Phase 2 stop (alongside setSimConfigured(false)).
   * Cleared to false by useFactoryReset so the next run's Demo Settings close
   * will correctly set isSimConfigured=true and enable Start.
   */
  simulationEnded: boolean;
  /** Currently hovered station name (null if none) */
  hoveredStation: StationName | null;
  /** Screen-space position of the hovered station for tooltip placement */
  hoveredStationScreenPos: { x: number; y: number } | null;

  // ── Actions ────────────────────────────────────────────────────

  /** Switch the interface language */
  setLanguage: (lang: Language) => void;
  /** Open a station detail modal by ID, or close if null */
  setModal: (modalId: string | null) => void;
  /** Toggle the Tile Passport panel on/off */
  togglePassport: () => void;
  /** Toggle the Defect Heatmap panel on/off */
  toggleHeatmap: () => void;
  /** Toggle the Control Panel on/off */
  toggleControlPanel: () => void;
  /** Show or hide the 3D Production Status Table */
  setShowProductionTable: (show: boolean) => void;
  /** Toggle the KPI panel on/off */
  toggleKPI: () => void;
  /** Toggle the Demo Settings popup on/off */
  toggleDemoSettings: () => void;
  /** Toggle the CWF chat panel */
  toggleCWF: () => void;
  /** Toggle the DTXFR passport panel */
  toggleDTXFR: () => void;
  /** Set the CWF side panel width (clamped to min/max bounds) */
  setCwfPanelWidth: (width: number) => void;
  /** Set the DTXFR side panel width (clamped to min/max bounds) */
  setDtxfrPanelWidth: (width: number) => void;
  /** Toggle the Alarm Log popup on/off */
  toggleAlarmLog: () => void;
  /** Toggle the Basic (KPI + Heatmap) panel on/off */
  toggleBasicPanel: () => void;
  /** Set the Basic side panel width (clamped to min/max bounds) */
  setBasicPanelWidth: (width: number) => void;
  /** Toggle the OEE Hierarchy 3D table visibility in the scene */
  toggleOEEHierarchy: () => void;
  /**
   * Set the simulation configured gate.
   * @param configured - true = user has visited Demo Settings; false = reset
   */
  setSimConfigured: (configured: boolean) => void;

  /**
   * Set the simulationEnded flag.
   * @param ended - true = simulation finished naturally; false = reset by factory reset
   */
  setSimulationEnded: (ended: boolean) => void;
  /**
   * Set or clear the hovered station and screen position */
  setHoveredStation: (station: StationName | null, screenPos?: { x: number; y: number }) => void;
}

// ─── Store Implementation ────────────────────────────────────────────────────

export const useUIStore = create<UIState>((set) => ({
  // ── Initial State ──────────────────────────────────────────────
  currentLang: UI_DEFAULTS.language,
  activeModal: null,              // No modal open
  showPassport: UI_DEFAULTS.showPassport,
  showHeatmap: UI_DEFAULTS.showHeatmap,
  showControlPanel: UI_DEFAULTS.showControlPanel,
  showProductionTable: UI_DEFAULTS.showProductionTable,
  showKPI: UI_DEFAULTS.showKPI,
  showDemoSettings: UI_DEFAULTS.showDemoSettings,
  showCWF: UI_DEFAULTS.showCWF,
  /** DTXFR passport panel hidden by default */
  showDTXFR: UI_DEFAULTS.showDTXFR,
  /** Default CWF panel width from params — reset on closeAllPanels */
  cwfPanelWidth: CWF_SIDE_PANEL_DEFAULT_WIDTH,
  /** Default DTXFR panel width from params — reset on closeAllPanels */
  dtxfrPanelWidth: DTXFR_SIDE_PANEL_DEFAULT_WIDTH,
  /** Basic panel hidden by default */
  showBasicPanel: UI_DEFAULTS.showBasicPanel,
  /** Default Basic panel width from params — reset on closeAllPanels */
  basicPanelWidth: BASIC_SIDE_PANEL_DEFAULT_WIDTH,
  showAlarmLog: UI_DEFAULTS.showAlarmLog,
  /** OEE Hierarchy 3D table hidden by default */
  showOEEHierarchy: UI_DEFAULTS.showOEEHierarchy,
  /** Start unconfigured — user must visit Demo Settings before first run */
  isSimConfigured: UI_DEFAULTS.isSimConfigured,
  /** Start with no ended simulation — simulation has not run yet */
  simulationEnded: UI_DEFAULTS.simulationEnded,
  hoveredStation: null,           // No station hovered
  hoveredStationScreenPos: null,  // No screen position

  // ── Action Implementations ─────────────────────────────────────
  setLanguage: (lang) => set({ currentLang: lang }),
  setModal: (modalId) => set({ activeModal: modalId }),
  togglePassport: () => set((s) => ({ showPassport: !s.showPassport })),
  toggleHeatmap: () => set((s) => ({ showHeatmap: !s.showHeatmap })),
  toggleControlPanel: () => set((s) => ({ showControlPanel: !s.showControlPanel })),
  setShowProductionTable: (show) => set({ showProductionTable: show }),
  toggleKPI: () => set((s) => ({ showKPI: !s.showKPI })),
  toggleDemoSettings: () => set((s) => ({ showDemoSettings: !s.showDemoSettings })),
  toggleCWF: () => set((s) => ({ showCWF: !s.showCWF })),
  toggleDTXFR: () => set((s) => ({ showDTXFR: !s.showDTXFR })),
  /** Clamp the CWF panel width between configured min and max bounds */
  setCwfPanelWidth: (width) =>
    set({ cwfPanelWidth: Math.max(CWF_SIDE_PANEL_MIN_WIDTH, Math.min(CWF_SIDE_PANEL_MAX_WIDTH, width)) }),
  /** Clamp the DTXFR panel width between configured min and max bounds */
  setDtxfrPanelWidth: (width) =>
    set({ dtxfrPanelWidth: Math.max(DTXFR_SIDE_PANEL_MIN_WIDTH, Math.min(DTXFR_SIDE_PANEL_MAX_WIDTH, width)) }),
  toggleAlarmLog: () => set((s) => ({ showAlarmLog: !s.showAlarmLog })),
  /** Toggle the Basic panel on/off */
  toggleBasicPanel: () => set((s) => ({ showBasicPanel: !s.showBasicPanel })),
  /** Clamp the Basic panel width between configured min and max bounds */
  setBasicPanelWidth: (width) =>
    set({ basicPanelWidth: Math.max(BASIC_SIDE_PANEL_MIN_WIDTH, Math.min(BASIC_SIDE_PANEL_MAX_WIDTH, width)) }),
  /** Toggle the OEE Hierarchy 3D table on/off */
  toggleOEEHierarchy: () => set((s) => ({ showOEEHierarchy: !s.showOEEHierarchy })),
  /** Mark simulation as configured (true) or clear the flag (false) */
  setSimConfigured: (configured) => set({ isSimConfigured: configured }),
  /**
   * Mark the simulation as ended (true = naturally finished, requires Reset).
   * false = cleared by factory reset so the next run proceeds normally.
   */
  setSimulationEnded: (ended) => set({ simulationEnded: ended }),
  setHoveredStation: (station, screenPos) => set({
    hoveredStation: station,
    hoveredStationScreenPos: screenPos ?? null,
  }),
}));
