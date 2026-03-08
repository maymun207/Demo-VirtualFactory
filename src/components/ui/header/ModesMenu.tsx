/**
 * ModesMenu.tsx — Header Mode Selection Component
 *
 * This module provides a responsive selection interface for the three primary
 * operational modes of the Virtual Factory:
 * 1. Basic: KPI & Defect Heatmap panels.
 * 2. DTXFR: Digital Transfer (Passport) panel.
 * 3. CWF: Chat With your Factory (AI Assistant) panel.
 *
 * Design Architecture:
 * - Desktop (>= lg): Displays a horizontal pill-shaped container with side-by-side buttons.
 * - Mobile (< lg): Displays a single "Modes" toggle button that reveals a vertical dropdown.
 * - State Management: Uses local `isOpen` state for the dropdown and `useUIStore` for panel toggles.
 * - Aesthetic: Follows the "Sentient Dark" theme with glassmorphism and animated transitions.
 */

import React, { useState } from "react"; // Import React core and the useState hook for local state management.
import {
  // Import specific icons from the lucide-react library for visual cues.
  BarChart3, // Used for the "Basic" mode (KPIs).
  FileText, // Used for the "DTXFR" mode (Digital Documents).
  Sparkles, // Used for the "CWF" mode (AI Intelligence).
  Layers, // Used for the "OEE" mode (Hierarchical OEE).
  Table2, // Used for the "ProdTbl" mode (Production Table).
  Menu, // Hamburger icon for the mobile collapsed state.
  X, // Close icon for the mobile expanded state.
  ChevronDown, // Indicator for the dropdown menu existence.
} from "lucide-react";
import { useUIStore } from "../../../store/uiStore"; // Access the global UI store to trigger panel visibility toggles.
import {
  // Import standard UI parameters to maintain consistency across the interface.
  HEADER_BUTTON_FONT, // Standard font style for header buttons.
  HEADER_BUTTON_ICON_GAP, // Standard spacing between icons and text labels.
  MODES_DROPDOWN_MIN_WIDTH, // Configuration for the dropdown's minimum breadth.
  MODES_DROPDOWN_Z_INDEX, // Configuration for the dropdown's vertical stacking order.
} from "../../../lib/params";
/** Fire-and-forget UI interaction event recorder */
import { telemetry } from "../../../services/telemetryService";

/**
 * ModesMenu Functional Component
 * Handles the rendering and interaction logic for the mode selection area in the Header.
 */
export const ModesMenu: React.FC = () => {
  /**
   * isOpen — Local Boolean State
   * Controls the visibility of the vertical dropdown menu on mobile viewports.
   */
  const [isOpen, setIsOpen] = useState(false);

  /**
   * currentLang — Global State Access
   * Retrieves the current language setting (Turkish 'tr' or English 'en') from the UI store.
   */
  const currentLang = useUIStore((s) => s.currentLang);

  /**
   * toggleMode — Helper Function
   * Executes a store toggle action and ensures the mobile dropdown closes immediately after.
   * @param toggleFn — The specific store action to invoke (e.g., toggleCWF).
   */
  /**
   * toggleMode — Helper Function
   * Executes a store toggle action and ensures the mobile dropdown closes immediately after.
   * Also emits a telemetry event recording which panel was toggled and its new state.
   * @param toggleFn  — The specific store action to invoke (e.g., toggleCWF).
   * @param panelName — Unique identifier for the panel being toggled (for telemetry).
   * @param getCurrentState — Function returning the current open/closed state BEFORE toggle.
   */
  const toggleMode = (
    toggleFn: () => void,
    panelName: string,
    getCurrentState: () => boolean,
  ) => {
    /** Capture state before toggle to determine the new state that results */
    const wasClosed = !getCurrentState();
    toggleFn(); // Invoke the panel visibility toggle in the global store.
    /** Emit telemetry: panel name and its new state (opened if it was closed, closed if it was open) */
    telemetry.emit({
      event_type: "panel_toggled",
      event_category: "ui_action",
      properties: { panel: panelName, state: wasClosed ? "opened" : "closed" },
    });
    setIsOpen(false); // Force close the mobile menu to keep the interface clean after selection.
  };

  /**
   * getLocalizedLabel — Language Detection
   * Returns "Modes" in English or "Modlar" in Turkish based on the current system state.
   */
  const getLocalizedLabel = () => (currentLang === "tr" ? "Modlar" : "Modes");

  return (
    // Main component container with gap between items.
    <div className="flex items-center gap-2">
      {/* 
        Horizontal Pill View (Desktop)
        Visible only on large screens (lg breakpoint) and above.
        Implements a shared background with glassmorphic blur and subtle borders.
      */}
      <div className="hidden lg:flex items-center p-1.5 gap-1.5 border border-white/10 rounded-2xl backdrop-blur-md hover:border-white/20 transition-all duration-300">
        {/* Basic Mode Button */}
        <button
          onClick={() =>
            toggleMode(
              () => useUIStore.getState().toggleBasicPanel(),
              "basic_panel",
              () => useUIStore.getState().showBasicPanel,
            )
          }
          className={`relative flex items-center ${HEADER_BUTTON_ICON_GAP} px-2.5 py-1.5 bg-linear-to-r from-amber-500/10 to-orange-500/10 hover:from-amber-500/20 hover:to-orange-500/20 border border-amber-500/30 rounded-xl transition-all duration-200 active:scale-95 group`}
          title="Basic — KPI & Defect Heatmap" // Tooltip for detailed functionality description.
        >
          <BarChart3
            size={14}
            className="text-amber-400 group-hover:scale-110 transition-transform"
          />{" "}
          {/* Animated icon */}
          <span className={HEADER_BUTTON_FONT + " text-amber-300 mx-0.5"}>
            Basic
          </span>{" "}
          {/* Styled label */}
        </button>

        {/* DTXFR Mode Button */}
        <button
          onClick={() =>
            toggleMode(
              () => useUIStore.getState().toggleDTXFR(),
              "dtxfr",
              () => useUIStore.getState().showDTXFR,
            )
          }
          className={`relative flex items-center ${HEADER_BUTTON_ICON_GAP} px-2.5 py-1.5 bg-linear-to-r from-emerald-500/10 to-green-500/10 hover:from-emerald-500/20 hover:to-green-500/20 border border-emerald-500/30 rounded-xl transition-all duration-200 active:scale-95 group`}
          title="DTXFR — Digital Transfer" // Descriptive title for accessibility.
        >
          <FileText
            size={14}
            className="text-emerald-400 group-hover:scale-110 transition-transform"
          />{" "}
          {/* emerald themed icon */}
          <span className={HEADER_BUTTON_FONT + " text-emerald-300 mx-0.5"}>
            DTXFR
          </span>{" "}
          {/* emerald themed label */}
        </button>

        {/* OEE Hierarchy Mode Button */}
        <button
          onClick={() =>
            toggleMode(
              () => useUIStore.getState().toggleOEEHierarchy(),
              "oee_hierarchy",
              () => useUIStore.getState().showOEEHierarchy,
            )
          }
          className={`relative flex items-center ${HEADER_BUTTON_ICON_GAP} px-2.5 py-1.5 bg-linear-to-r from-indigo-500/10 to-blue-500/10 hover:from-indigo-500/20 hover:to-blue-500/20 border border-indigo-500/30 rounded-xl transition-all duration-200 active:scale-95 group`}
          title="OEE — Factory OEE Hierarchy" // Descriptive title for tooltip.
        >
          <Layers
            size={14}
            className="text-indigo-400 group-hover:scale-110 transition-transform"
          />{" "}
          {/* Indigo layers icon */}
          <span className={HEADER_BUTTON_FONT + " text-indigo-300 mx-0.5"}>
            OEE
          </span>{" "}
          {/* Indigo label */}
        </button>

        {/* ProdTbl (Production Table) Mode Button */}
        <button
          onClick={() => {
            const s = useUIStore.getState();
            /** Record whether production table was open before toggling */
            const wasOpen = s.showProductionTable;
            s.setShowProductionTable(!wasOpen);
            telemetry.emit({
              event_type: "panel_toggled",
              event_category: "ui_action",
              properties: {
                panel: "prod_table",
                state: wasOpen ? "closed" : "opened",
              },
            });
            setIsOpen(false);
          }}
          className={`relative flex items-center ${HEADER_BUTTON_ICON_GAP} px-2.5 py-1.5 bg-linear-to-r from-cyan-500/10 to-sky-500/10 hover:from-cyan-500/20 hover:to-sky-500/20 border border-cyan-500/30 rounded-xl transition-all duration-200 active:scale-95 group`}
          title="ProdTbl — Production Table" // Descriptive title for tooltip.
        >
          <Table2
            size={14}
            className="text-cyan-400 group-hover:scale-110 transition-transform"
          />{" "}
          {/* Cyan table icon */}
          <span className={HEADER_BUTTON_FONT + " text-cyan-300 mx-0.5"}>
            ProdTbl
          </span>{" "}
          {/* Cyan label */}
        </button>

        {/* CWF Mode Button */}
        <button
          onClick={() =>
            toggleMode(
              () => useUIStore.getState().toggleCWF(),
              "cwf",
              () => useUIStore.getState().showCWF,
            )
          }
          className={`relative flex items-center ${HEADER_BUTTON_ICON_GAP} px-2.5 py-1.5 bg-linear-to-r from-cyan-500/10 to-teal-500/10 hover:from-cyan-500/20 hover:to-teal-500/20 border border-cyan-500/30 rounded-xl transition-all duration-200 active:scale-95 group`}
          title="CWF — Chat With your Factory" // User-facing description.
        >
          <Sparkles
            size={14}
            className="text-cyan-400 group-hover:scale-110 transition-transform"
          />{" "}
          {/* Cyan spark icon */}
          <span className={HEADER_BUTTON_FONT + " text-cyan-300 mx-0.5"}>
            CWF
          </span>{" "}
          {/* Cyan text label */}
        </button>
      </div>

      {/* 
        Collapsed Menu View (Mobile)
        Visible on all screens smaller than the 'lg' breakpoint.
        Renders a single interactive toggle that controls the visibility of the stackable menu.
      */}
      <div className="lg:hidden relative">
        {/* The Toggle Button */}
        <button
          onClick={() => setIsOpen(!isOpen)} // Flips the boolean state to open or close the menu.
          className="flex items-center gap-2 px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-white/70 hover:bg-white/10 transition-all active:scale-95"
        >
          {isOpen ? <X size={16} /> : <Menu size={16} />}{" "}
          {/* Swaps between Menu and X icons based on state. */}
          <span className="text-[0.7rem] font-bold uppercase tracking-wider">
            {getLocalizedLabel()}
          </span>{" "}
          {/* Display "Modes" label. */}
          <ChevronDown
            size={14}
            className={`transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`}
          />{" "}
          {/* Animated chevron arrow. */}
        </button>

        {/* 
          The Dropdown Menu Container (Stackable Stack)
          Rendered conditionally based on the 'isOpen' state.
          Uses absolute positioning and a high z-index to clear other header pillars.
        */}
        {isOpen && (
          <div
            className={`absolute top-12 left-0 ${MODES_DROPDOWN_Z_INDEX} ${MODES_DROPDOWN_MIN_WIDTH} p-2 bg-black/80 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-2xl flex flex-col gap-1.5 animate-slideDown`}
          >
            {/* Stacked Basic Option */}
            <button
              onClick={() =>
                toggleMode(
                  () => useUIStore.getState().toggleBasicPanel(),
                  "basic_panel",
                  () => useUIStore.getState().showBasicPanel,
                )
              } // Selection closes menu automatically.
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-amber-500/20 bg-amber-500/5 hover:bg-amber-500/10 transition-all group"
            >
              <BarChart3 size={16} className="text-amber-400" />{" "}
              {/* Larger icon for mobile targets. */}
              <span className={HEADER_BUTTON_FONT + " text-amber-300 text-sm"}>
                Basic
              </span>{" "}
              {/* Accessible label. */}
            </button>

            {/* Stacked DTXFR Option */}
            <button
              onClick={() =>
                toggleMode(
                  () => useUIStore.getState().toggleDTXFR(),
                  "dtxfr",
                  () => useUIStore.getState().showDTXFR,
                )
              } // Selection item in the stack.
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-emerald-500/20 bg-emerald-500/5 hover:bg-emerald-500/10 transition-all group"
            >
              <FileText size={16} className="text-emerald-400" />{" "}
              {/* Emerald icon for DTXFR. */}
              <span
                className={HEADER_BUTTON_FONT + " text-emerald-300 text-sm"}
              >
                DTXFR
              </span>{" "}
              {/* Label text. */}
            </button>

            {/* Stacked CWF Option */}
            <button
              onClick={() =>
                toggleMode(
                  () => useUIStore.getState().toggleCWF(),
                  "cwf",
                  () => useUIStore.getState().showCWF,
                )
              } // Selection item for AI interface.
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-cyan-500/20 bg-cyan-500/5 hover:bg-cyan-500/10 transition-all group"
            >
              <Sparkles size={16} className="text-cyan-400" />{" "}
              {/* Cyan spark icon. */}
              <span className={HEADER_BUTTON_FONT + " text-cyan-300 text-sm"}>
                CWF
              </span>{" "}
              {/* Label text. */}
            </button>

            {/* Stacked OEE Hierarchy Option */}
            <button
              onClick={() =>
                toggleMode(
                  () => useUIStore.getState().toggleOEEHierarchy(),
                  "oee_hierarchy",
                  () => useUIStore.getState().showOEEHierarchy,
                )
              } // OEE Hierarchy selection item.
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-indigo-500/20 bg-indigo-500/5 hover:bg-indigo-500/10 transition-all group"
            >
              <Layers size={16} className="text-indigo-400" />{" "}
              {/* Indigo layers icon for OEE. */}
              <span className={HEADER_BUTTON_FONT + " text-indigo-300 text-sm"}>
                OEE
              </span>{" "}
              {/* Label text. */}
            </button>

            {/* Stacked ProdTbl Option */}
            <button
              onClick={() => {
                const s = useUIStore.getState();
                s.setShowProductionTable(!s.showProductionTable);
                setIsOpen(false);
              }}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-cyan-500/20 bg-cyan-500/5 hover:bg-cyan-500/10 transition-all group"
            >
              <Table2 size={16} className="text-cyan-400" />{" "}
              {/* Cyan table icon for ProdTbl. */}
              <span className={HEADER_BUTTON_FONT + " text-cyan-300 text-sm"}>
                ProdTbl
              </span>{" "}
              {/* Label text. */}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
