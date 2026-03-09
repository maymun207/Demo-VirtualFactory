/**
 * Header.tsx — Top Navigation Bar (Two-Row Layout)
 *
 * Fixed header bar at the top of the viewport containing two rows:
 *
 * ── ROW 1 (Primary) ──────────────────────────────────────────────────
 *  - Application title + subtitle (left)
 *  - Action buttons: Alarm Log, Demo Settings, Control & Actions,
 *    Start/Stop, Reset, Language toggle (right, flex-wrap for zoom)
 *
 * ── ROW 2 (Info Strip) ──────────────────────────────────────────────
 *  - S-Clock counter
 *  - Session CODE + ID (SimulationSessionInfo — always visible)
 *  - Work ID + Scenario badges
 *
 * The two-row layout ensures that zoom / narrow viewports never cause
 * button overlap. Row 1 buttons wrap naturally via `flex-wrap`.
 * Row 2 info badges sit in normal flex flow (no absolute positioning)
 * so they never collide with the ControlPanel below.
 *
 * ── Demo Settings Gate ────────────────────────────────────────────────────
 *
 * The Start button is gated by `isSimConfigured` (uiStore).
 *
 * Behaviour:
 *  isDataFlowing = true  →  STOP button (no gate — always allow manual stop)
 *
 *  isDataFlowing = false:
 *    isSimConfigured = true  →  START: calls toggleDataFlow()
 *    isSimConfigured = false →  START:
 *        1. Calls resetFactory() to clear any stale state from previous run
 *        2. Shows inline gate toast
 *
 * ── Gate Rearm on Every Stop ──────────────────────────────────────────────
 *
 * A useEffect watches isDataFlowing. Any time it transitions true→false
 * (manual Stop, WO natural completion, any other stop), isSimConfigured is
 * reset to false so the next Start must go through the gate again.
 *
 * Used by: Dashboard.tsx
 */
import { useState } from "react";
import {
  Play,
  Square,
  RotateCcw,
  Settings2,
  Settings,
  Presentation,
} from "lucide-react";
import { useUIStore } from "../../store/uiStore";
import { useSimulationStore } from "../../store/simulationStore";
import { useSimulationDataStore } from "../../store/simulationDataStore";
import { useWorkOrderStore } from "../../store/workOrderStore";
import { useTranslation } from "../../hooks/useTranslation";
import { useFactoryReset } from "../../hooks/useFactoryReset";
import {
  HEADER_GRADIENT,
  COLORS,
  HEADER_BUTTON_FONT,
  HEADER_BUTTON_ICON_GAP,
} from "../../lib/params";
import { SimulationSessionInfo } from "./SimulationSessionInfo";
import { ModesMenu } from "./header/ModesMenu";
import { translations } from "../../lib/translations";
/** Fire-and-forget UI interaction event recorder */
import { telemetry } from "../../services/telemetryService";

export const Header = () => {
  /** Current UI language (tr | en) */
  const currentLang = useUIStore((s) => s.currentLang);
  /** Setter to switch the display language */
  const setLanguage = useUIStore((s) => s.setLanguage);
  /** Whether the simulation data flow is active */
  const isDataFlowing = useSimulationStore((s) => s.isDataFlowing);
  /** Whether the simulation is draining (belt finishing, no new tiles) */
  const isDraining = useSimulationStore((s) => s.isDraining);
  /** Toggle function for starting/stopping the data flow */
  const toggleDataFlow = useSimulationStore((s) => s.toggleDataFlow);
  /** Current simulation clock tick count */
  const sClockCount = useSimulationStore((s) => s.sClockCount);
  /** Factory reset handler (resets all stores and state) */
  const resetFactory = useFactoryReset();
  /** Whether the ControlPanel slide-out is currently visible */
  const showControlPanel = useUIStore((s) => s.showControlPanel);
  /** Toggle function for showing/hiding the ControlPanel */
  const toggleControlPanel = useUIStore((s) => s.toggleControlPanel);
  /** Translation accessor for the "header" section */
  const t = useTranslation("header");
  /** Whether DemoScreen panel is visible (for active-state highlight on Demo button) */
  const showDemoScreen = useUIStore((s) => s.showDemoScreen);

  /**
   * isSimConfigured — Demo Settings Gate.
   * When false, Start button shows toast + factory reset first.
   * Set to true when the user closes Demo Settings panel (any mechanism).
   * Reset to false by the isDataFlowing watcher below on every stop.
   */
  const isSimConfigured = useUIStore((s) => s.isSimConfigured);

  /**
   * Info box data: Work Order ID and active Scenario code.
   * Read reactively from their stores.
   */
  const selectedWorkOrderId = useWorkOrderStore((s) => s.selectedWorkOrderId);
  const activeScenarioCode = useSimulationDataStore(
    (s) => s.activeScenario?.code ?? null,
  );

  /** shorthand for simGate translation strings */
  const sg = translations.simGate;

  /**
   * showGateToast — controls visibility of the inline gate toast.
   * Shown when user clicks Start while isSimConfigured=false.
   */
  const [showGateToast, setShowGateToast] = useState(false);

  /**
   * handleStartClick — unified Start button click handler.
   *
   * Decision tree:
   *  isDataFlowing=true         → Stop (always allowed)
   *  isDataFlowing=false AND isSimConfigured=true  → Start immediately
   *  isDataFlowing=false AND isSimConfigured=false →
   *      1. resetFactory() — clears stale counters/belt from previous run
   *      2. show gate toast — user must visit Demo Settings
   */
  const handleStartClick = async () => {
    if (isDataFlowing) {
      /** Stop: always allowed — emit before toggle so sim state is still 'running' */
      telemetry.emit({
        event_type: "simulation_stopped",
        event_category: "ui_action",
        properties: { reason: "manual" },
      });
      toggleDataFlow();
      return;
    }
    if (isSimConfigured) {
      /** Gate is clear — start simulation; emit after confirming config is set */
      telemetry.emit({
        event_type: "simulation_started",
        event_category: "ui_action",
        properties: {
          scenario: activeScenarioCode,
          workOrderId: selectedWorkOrderId,
        },
      });
      toggleDataFlow();
    } else {
      /**
       * Gate is locked.
       * 1. Reset factory to clear any stale state from the previous run.
       * 2. Show the toast so the user configures Demo Settings.
       */
      await resetFactory();
      setShowGateToast(true);
    }
  };

  /**
   * handleOpenDemoSettings — called when user confirms via gate toast.
   * Hides the toast and opens the Demo Settings panel.
   */
  const handleOpenDemoSettings = () => {
    setShowGateToast(false);
    useUIStore.getState().toggleDemoSettings();
  };

  return (
    <div
      id="header-container"
      className="relative z-50 bg-black/40 backdrop-blur-xl border-b border-white/10 select-none shadow-2xl"
    >
      <div className="px-3 h-14 sm:h-16 flex items-center justify-between gap-2 sm:gap-4">
        {/* ── Pillar 1: Branding ────────────────────────────────────────── */}
        <div className="flex items-center gap-5 min-w-0 group cursor-default">
          <div className="relative flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 group-hover:scale-110 transition-all duration-500">
            {/* New Stylized 'A' Logo Asset */}
            <img
              src="/logo.png"
              alt="Logo"
              className="w-full h-full object-contain filter drop-shadow-[0_0_15px_rgba(168,85,247,0.5)]"
            />
          </div>
          <div className="flex flex-col min-w-0">
            <h1
              className="text-sm sm:text-lg md:text-xl font-bold text-transparent bg-clip-text truncate leading-tight tracking-tight"
              style={{
                backgroundImage: `linear-gradient(to right, ${HEADER_GRADIENT.from}, ${HEADER_GRADIENT.to})`,
              }}
            >
              {t("title")}
            </h1>
            <p className="text-white/50 text-[0.55rem] sm:text-[0.7rem] truncate font-medium uppercase tracking-widest">
              {t("subtitle")}
            </p>
          </div>
        </div>

        {/* ── Pillar 2: Modes (Responsive Menu) ────────────────────── */}
        {/* Demo standalone button — placed left of the ModesMenu pill for clear visual separation */}
        <button
          id="btn-demo"
          onClick={() => {
            /** Capture current open state before toggling for accurate telemetry */
            const wasOpen = useUIStore.getState().showDemoScreen;
            useUIStore.getState().toggleDemoScreen();
            /** Record the DemoScreen toggle in the telemetry service */
            telemetry.emit({
              event_type: "panel_toggled",
              event_category: "ui_action",
              properties: {
                panel: "demo_screen",
                state: wasOpen ? "closed" : "opened",
              },
            });
          }}
          className={`hidden lg:flex relative items-center ${HEADER_BUTTON_ICON_GAP} px-3 py-1.5 rounded-xl border transition-all duration-200 active:scale-95 group ${
            showDemoScreen
              ? "bg-violet-500/20 border-violet-400/60 shadow-[0_0_12px_rgba(167,139,250,0.25)]"
              : "bg-violet-500/10 border-violet-500/30 hover:bg-violet-500/20 hover:border-violet-400/50"
          }`}
          title="Demo — Toggle DemoScreen"
        >
          {/* Presentation icon — visually represents DemoScreen */}
          <Presentation
            size={14}
            className={`group-hover:scale-110 transition-transform ${
              showDemoScreen ? "text-violet-300" : "text-violet-400"
            }`}
          />
          {/* Demo label text */}
          <span
            className={`${HEADER_BUTTON_FONT} ${
              showDemoScreen ? "text-violet-200" : "text-violet-300"
            } mx-0.5`}
          >
            Demo
          </span>
        </button>
        <ModesMenu />

        {/* ── Pillar 3: Intelligence (Status Grid) ────────────────────── */}
        <div
          id="header-pillar3"
          className="hidden md:flex items-center p-1.5 gap-2 border border-white/10 rounded-2xl backdrop-blur-md hover:border-white/20 transition-all duration-300"
        >
          {/* S-Clock */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-white/5 group transition-colors">
            <span className="text-[0.7rem] sm:text-xs text-white font-bold uppercase tracking-wider hidden xl:inline">
              S-CLK
            </span>
            <span className="text-emerald-400/80 group-hover:animate-pulse">
              🕐
            </span>
            <span
              className={`font-mono font-bold tabular-nums text-sm ${isDataFlowing ? "text-white" : "text-yellow-400"}`}
            >
              {sClockCount}
            </span>
          </div>

          <div className="w-px h-6 bg-white/10" />

          {/* Session Data */}
          <SimulationSessionInfo />

          <div className="w-px h-6 bg-white/10 hidden xl:block" />

          {/* Work ID & Scenario */}
          <div className="hidden xl:flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-white/5">
              <span className="text-white/30 font-bold text-[0.6rem] uppercase tracking-tighter">
                {sg.labelWorkId[currentLang]}
              </span>
              <span
                className={`font-mono font-bold text-xs ${isSimConfigured ? "text-violet-300" : "text-white/20"}`}
              >
                {isSimConfigured ? selectedWorkOrderId : "—"}
              </span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-white/5">
              <span className="text-white/30 font-bold text-[0.6rem] uppercase tracking-tighter">
                {sg.labelScenario[currentLang]}
              </span>
              <span
                className={`font-mono font-bold text-xs ${isSimConfigured && activeScenarioCode ? "text-emerald-300" : "text-white/20"}`}
              >
                {isSimConfigured && activeScenarioCode
                  ? activeScenarioCode
                  : "—"}
              </span>
            </div>
          </div>
        </div>

        {/* ── Pillar 4: Systems (Management Hub) ────────────────────────── */}
        <div className="flex items-center p-1.5 gap-1.5 border border-white/10 rounded-2xl backdrop-blur-md">
          {/* Settings Group */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => useUIStore.getState().toggleDemoSettings()}
              className={`p-2 transition-all duration-300 border border-violet-400/20 text-violet-400 hover:border-violet-400/60 hover:bg-violet-500/10 rounded-xl active:scale-90`}
              title={t("demoSettings")}
            >
              <Settings2 className="w-4 h-4" />
            </button>
            <button
              onClick={toggleControlPanel}
              className={`p-2 transition-all duration-300 border rounded-xl active:scale-90 ${
                showControlPanel
                  ? "border-amber-400 text-amber-400 bg-amber-400/20 shadow-[0_0_15px_rgba(255,199,44,0.3)]"
                  : "border-amber-400/20 text-amber-400 hover:border-amber-400/60 hover:bg-amber-400/10"
              }`}
              title={t("controlActions")}
            >
              <Settings
                className={`w-4 h-4 transition-transform duration-500 ${showControlPanel ? "rotate-90" : ""}`}
              />
            </button>
          </div>

          <div className="w-px h-6 bg-white/10" />

          {/* Execution Group */}
          <div className="flex items-center gap-1 relative">
            {showGateToast && !isDataFlowing && !isSimConfigured && (
              <div className="absolute top-12 right-0 z-50 p-3 rounded-2xl bg-black/90 border border-amber-400/40 backdrop-blur-xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] w-64 animate-slideDown">
                <p className="text-amber-300 text-xs font-bold mb-1">
                  {sg.toastTitle[currentLang]}
                </p>
                <p className="text-white/60 text-[0.65rem] mb-3 leading-relaxed">
                  {sg.toastBody[currentLang]}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={handleOpenDemoSettings}
                    className="flex-1 px-2 py-1.5 rounded-lg text-[0.65rem] font-bold bg-violet-500/30 border border-violet-400/50 text-violet-200 hover:bg-violet-500/50 transition-colors"
                  >
                    {sg.toastOpen[currentLang]}
                  </button>
                  <button
                    onClick={() => setShowGateToast(false)}
                    className="px-2 py-1.5 rounded-lg text-[0.65rem] font-bold bg-white/5 border border-white/10 text-white/50 hover:bg-white/10"
                  >
                    {sg.toastCancel[currentLang]}
                  </button>
                </div>
              </div>
            )}
            <button
              id="btn-start-stop"
              onClick={handleStartClick}
              className={`flex items-center gap-1.5 px-4 py-1.5 border rounded-xl font-bold text-xs transition-all duration-300 active:scale-95 ${
                !isDataFlowing && !isSimConfigured ? "opacity-50 grayscale" : ""
              }`}
              style={{
                backgroundColor: isDraining
                  ? `${COLORS.warning}22`
                  : isDataFlowing
                    ? `${COLORS.error}22`
                    : `${COLORS.primary}22`,
                color: isDraining
                  ? COLORS.warning
                  : isDataFlowing
                    ? COLORS.error
                    : COLORS.primary,
                borderColor: isDraining
                  ? `${COLORS.warning}66`
                  : isDataFlowing
                    ? `${COLORS.error}66`
                    : `${COLORS.primary}66`,
              }}
            >
              {isDraining ? (
                /** Pulsing dot during drain to show activity */
                <span className="w-3.5 h-3.5 rounded-full bg-amber-400 animate-pulse" />
              ) : isDataFlowing ? (
                <Square size={14} />
              ) : (
                <Play size={14} fill="currentColor" />
              )}
              <span className="hidden sm:inline">
                {isDraining
                  ? t("draining")
                  : isDataFlowing
                    ? t("stop")
                    : t("start")}
              </span>
            </button>
            <button
              onClick={resetFactory}
              className="p-2 transition-all duration-300 border border-white/20 text-white hover:border-white/50 hover:text-white hover:bg-white/10 rounded-xl active:scale-90"
              title={t("reset")}
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>

          <div className="w-px h-6 bg-white/10 hidden sm:block" />

          {/* Language Switcher */}
          <div className="hidden sm:flex gap-0.5 bg-black/40 rounded-xl p-1 border border-white/5 group">
            <button
              onClick={() => setLanguage("tr")}
              className={`px-2 py-1 rounded-lg text-[0.6rem] font-black transition-all duration-300 ${
                currentLang === "tr"
                  ? "bg-white/10 text-white shadow-inner"
                  : "text-white/20 hover:text-white/60"
              }`}
            >
              TR
            </button>
            <button
              onClick={() => setLanguage("en")}
              className={`px-2 py-1 rounded-lg text-[0.6rem] font-black transition-all duration-300 ${
                currentLang === "en"
                  ? "bg-white/10 text-white shadow-inner"
                  : "text-white/20 hover:text-white/60"
              }`}
            >
              EN
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
