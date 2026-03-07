/**
 * ControlPanel.tsx — Floating Simulation Control Panel
 *
 * A draggable floating panel (using DraggablePanel wrapper) that provides
 * simulation parameter controls and panel visibility toggles.
 *
 * Content layout (2-column horizontal):
 *  1. CONVEYOR STATUS — Running / Stopped / Jammed status buttons
 *  2. SIMULATION PARAMETERS — Conveyor Speed, S-Clock Period, Station
 *     Interval sliders
 *
 * Each interactive element shows a short bilingual hover tooltip
 * explaining its purpose, powered by the `Tip` inline component below.
 *
 * Panel index: 3 (after TilePassport=0, KPI=1, DefectHeatmap=2)
 * Cascade position is handled by useDraggablePanel hook via DraggablePanel.
 *
 * Used by: Dashboard.tsx
 */
import { useSimulationStore } from "../../store/simulationStore";
import { useUIStore } from "../../store/uiStore";
import { useTranslation } from "../../hooks/useTranslation";
import { DraggablePanel } from "./DraggablePanel";
import {
  CONVEYOR_SPEED_RANGE,
  S_CLOCK_RANGE,
  STATION_INTERVAL_RANGE,
} from "../../lib/params";

/** Panel index for Control & Actions in the cascade system */
const CONTROL_PANEL_INDEX = 3;

// =============================================================================
// TOOLTIP HELPER COMPONENT
// =============================================================================

/**
 * Tip — Inline CSS-only hover tooltip wrapper.
 *
 * Wraps `children` in a `relative` container. On hover, a small dark bubble
 * appears above the element. Uses Tailwind's `group` + `group-hover` pattern
 * so no JS state is needed — pure CSS transition.
 *
 * @param children  - The element that triggers the tooltip on hover
 * @param text      - The short description string to display
 */
const Tip = ({
  children,
  text,
}: {
  children: React.ReactNode;
  /** Short tooltip description shown on hover */
  text: string;
}) => (
  /** Outer wrapper: sets relative positioning context and 'group' for CSS hover */
  <div className="relative group w-full">
    {/* The child element (button or slider wrapper) */}
    {children}
    {/* Tooltip bubble — hidden by default, fades in on group hover */}
    <div
      className={[
        "pointer-events-none absolute z-999 bottom-full left-1/2 -translate-x-1/2 mb-1.5",
        "px-2 py-1 rounded-md text-[0.5625rem] leading-tight whitespace-nowrap",
        "bg-black/95 text-emerald-200/90 border border-emerald-500/30 shadow-lg",
        "opacity-0 group-hover:opacity-100 transition-opacity duration-150",
      ].join(" ")}
    >
      {text}
      {/* Small downward arrow on the tooltip bubble */}
      <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-black/95" />
    </div>
  </div>
);

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export const ControlPanel = () => {
  /** --- Current conveyor belt speed multiplier --- */
  const conveyorSpeed = useSimulationStore((s) => s.conveyorSpeed);
  /** --- Setter for conveyor speed --- */
  const setConveyorSpeed = useSimulationStore((s) => s.setConveyorSpeed);
  /** --- Current simulation clock period in ms --- */
  const sClockPeriod = useSimulationStore((s) => s.sClockPeriod);
  /** --- Setter for simulation clock period --- */
  const setSClockPeriod = useSimulationStore((s) => s.setSClockPeriod);
  /** --- Current station processing interval --- */
  const stationInterval = useSimulationStore((s) => s.stationInterval);
  /** --- Setter for station interval --- */
  const setStationInterval = useSimulationStore((s) => s.setStationInterval);
  /** --- Current conveyor operational status (running | stopped | jammed) --- */
  const conveyorStatus = useSimulationStore((s) => s.conveyorStatus);
  /** --- Setter for conveyor status --- */
  const setConveyorStatus = useSimulationStore((s) => s.setConveyorStatus);
  /** --- Whether the simulator is actively running (controls S-Clock) --- */
  const isDataFlowing = useSimulationStore((s) => s.isDataFlowing);
  /** --- Whether this ControlPanel is currently visible --- */
  const showControlPanel = useUIStore((s) => s.showControlPanel);
  /** --- Toggle function for ControlPanel visibility (used for close) --- */
  const toggleControlPanel = useUIStore((s) => s.toggleControlPanel);

  /** --- Translation accessor for the "controlPanel" section --- */
  const t = useTranslation("controlPanel");

  // --- Group 1: Conveyor Status (running / stopped / jammed) ---
  const conveyorStatusGroup = (
    <div className="bg-black/90 backdrop-blur-xl p-2.5 sm:p-3 flex flex-col justify-start flex-1 min-w-0">
      {/* Section label — enlarged and top-aligned to match Simulation Params label */}
      <span className="text-[0.625rem] sm:text-[0.6875rem] text-emerald-400/60 font-semibold uppercase tracking-widest mb-1.5 sm:mb-2">
        {t("conveyorStatus")}
      </span>
      {/* Status buttons — color-coded per status, each wrapped in Tip */}
      <div className="flex flex-col gap-1 sm:gap-1.5 text-[0.5625rem] sm:text-[0.625rem]">
        {(["running", "stopped", "jammed"] as const).map((status) => {
          // Per spec: when simulator is stopped (isDataFlowing=false),
          // only "stopped" is a valid conveyor state.
          // "running" and "jammed" are "Not selectable" in that state.
          const isDisabled = !isDataFlowing && status !== "stopped";
          /** Type-safe tooltip key map — avoids dynamic string cast TS errors */
          const tooltipTextMap = {
            running: t("tooltip_running"),
            stopped: t("tooltip_stopped"),
            jammed: t("tooltip_jammed"),
          };
          return (
            <Tip key={status} text={tooltipTextMap[status]}>
              <button
                onClick={() => !isDisabled && setConveyorStatus(status)}
                disabled={isDisabled}
                className={`w-full py-1 sm:py-1.5 px-2 sm:px-3 rounded-lg border transition-all duration-200 ${
                  isDisabled
                    ? "border-white/5 text-white/20 cursor-not-allowed opacity-40"
                    : conveyorStatus === status ||
                        (status === "jammed" &&
                          conveyorStatus === "jam_scrapping")
                      ? status === "running"
                        ? "bg-green-500/20 border-green-500 text-green-400"
                        : status === "jammed"
                          ? "bg-red-500/20 border-red-500 text-red-400"
                          : "bg-yellow-500/20 border-yellow-500 text-yellow-400"
                      : "border-white/10 text-white/50 hover:border-white/30"
                }`}
              >
                {status === "running"
                  ? `▶ ${t("running")}`
                  : status === "stopped"
                    ? `⏸ ${t("stopped")}`
                    : `⚠ ${t("jammed")}`}
              </button>
            </Tip>
          );
        })}
      </div>
    </div>
  );

  // --- Group 3: Simulation Parameter Sliders ---
  const slidersGroup = (
    <div className="bg-black/90 backdrop-blur-xl p-2.5 sm:p-3 flex flex-col justify-start flex-1 min-w-0">
      {/* Section label — enlarged and top-aligned to match Conveyor Status label */}
      <span className="text-[0.625rem] sm:text-[0.6875rem] text-emerald-400/60 font-semibold uppercase tracking-widest mb-1.5 sm:mb-2">
        {t("simParams")}
      </span>

      {/* Conveyor Speed slider — wrapped in Tip for hover description */}
      <Tip text={t("tooltip_speed")}>
        <div className="mb-1.5 sm:mb-2">
          <div className="flex justify-between text-[0.5625rem] sm:text-[0.625rem] mb-0.5">
            <span className="text-emerald-300">{t("speed")}</span>
            <span className="text-emerald-400 font-mono">
              {conveyorSpeed.toFixed(1)}x
            </span>
          </div>
          <input
            type="range"
            min={CONVEYOR_SPEED_RANGE.min}
            max={CONVEYOR_SPEED_RANGE.max}
            step={CONVEYOR_SPEED_RANGE.step}
            value={conveyorSpeed}
            onChange={(e) => setConveyorSpeed(parseFloat(e.target.value))}
            className="w-full accent-emerald-500 h-1"
            aria-label={t("speed")}
          />
        </div>
      </Tip>

      {/* S-Clock Period slider — wrapped in Tip for hover description
          (inverted: right = faster / lower period) */}
      <Tip text={t("tooltip_sClockPeriod")}>
        <div className="mb-1.5 sm:mb-2">
          <div className="flex justify-between text-[0.5625rem] sm:text-[0.625rem] mb-0.5">
            <span className="text-emerald-300">{t("sClockPeriod")}</span>
            <span className="text-emerald-400 font-mono">{sClockPeriod}ms</span>
          </div>
          <input
            type="range"
            min={S_CLOCK_RANGE.min}
            max={S_CLOCK_RANGE.max}
            step={S_CLOCK_RANGE.step}
            value={S_CLOCK_RANGE.min + S_CLOCK_RANGE.max - sClockPeriod}
            onChange={(e) =>
              setSClockPeriod(
                S_CLOCK_RANGE.min +
                  S_CLOCK_RANGE.max -
                  parseInt(e.target.value),
              )
            }
            className="w-full accent-emerald-500 h-1"
            aria-label={`${t("sClockPeriod")} (inverted: right = faster)`}
          />
        </div>
      </Tip>

      {/* Station Interval slider — wrapped in Tip for hover description
          (inverted: right = faster / lower interval) */}
      <Tip text={t("tooltip_stationInterval")}>
        <div>
          <div className="flex justify-between text-[0.5625rem] sm:text-[0.625rem] mb-0.5">
            <span className="text-emerald-300">{t("stationInterval")}</span>
            <span className="text-emerald-400 font-mono">
              {stationInterval}
            </span>
          </div>
          <input
            type="range"
            min={STATION_INTERVAL_RANGE.min}
            max={STATION_INTERVAL_RANGE.max}
            step={STATION_INTERVAL_RANGE.step}
            value={
              STATION_INTERVAL_RANGE.min +
              STATION_INTERVAL_RANGE.max -
              stationInterval
            }
            onChange={(e) =>
              setStationInterval(
                STATION_INTERVAL_RANGE.min +
                  STATION_INTERVAL_RANGE.max -
                  parseInt(e.target.value),
              )
            }
            className="w-full accent-emerald-500 h-1"
            aria-label={`${t("stationInterval")} (inverted: right = faster)`}
          />
        </div>
      </Tip>
    </div>
  );

  // DraggablePanel wrapper provides: drag handle, close button, cascade
  // positioning, resize handle, clamped-to-viewport boundaries
  return (
    <DraggablePanel
      panelIndex={CONTROL_PANEL_INDEX}
      title={t("title")}
      visible={showControlPanel}
      onClose={toggleControlPanel}
      resizable={true}
    >
      {/* 2-column horizontal layout — Conveyor Status | Sliders */}
      <div className="flex flex-wrap items-stretch gap-px">
        {conveyorStatusGroup}
        {slidersGroup}
      </div>
    </DraggablePanel>
  );
};
