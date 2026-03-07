/**
 * BasicPanel.tsx — Basic KPI + Defect Heatmap Side Panel
 *
 * A left-docked side panel that combines the Key Performance Indicators
 * and FTQ & Defect Heatmap into a single unified view. When DTXFR is open,
 * this panel docks immediately to its right; when DTXFR is closed, it
 * takes the far-left position.
 *
 * Content sections:
 *  1. Header — "Basic" title with close button
 *  2. KPI Cards — OEE, FTQ, Total KPI, Scrap, Energy, Gas, CO₂
 *  3. Defect Heatmap — 2-column grid of defect type percentages
 *  4. Alarm Log — compact scrollable list of alarm events
 *
 * Data sourced from kpiStore (KPIs and defects).
 * Layout follows the same resize-handle pattern as DTXFRPanel.
 *
 * Used by: App.tsx (left-docked column, right of DTXFR)
 */
import { useCallback, useMemo, useRef, useState } from "react";
import { X, BarChart3, Shield, AlertTriangle, ChevronDown } from "lucide-react";
import { useUIStore } from "../../store/uiStore";
import { useKPIStore } from "../../store/kpiStore";
import { useSimulationStore } from "../../store/simulationStore";
import { useTranslation } from "../../hooks/useTranslation";
import {
  BASIC_SIDE_PANEL_HANDLE_WIDTH,
  DEFECT_THRESHOLD_HIGH,
  DEFECT_THRESHOLD_MEDIUM,
  ALARM_TYPE_CONFIG,
  SEVERITY_BADGE_STYLES,
  ALARM_LOG_LOCALE,
  ALARM_STATION_LABELS,
} from "../../lib/params";
import { translations } from "../../lib/translations";
import type { AlarmSeverity } from "../../store/simulationStore";

// ── Alarm Filter Types ──────────────────────────────────────────────────────

/** Severity filter value — 'all' means no filtering */
type SeverityFilter = "all" | AlarmSeverity;

/** Compact severity button definitions for the filter bar */
const SEVERITY_BTNS: {
  v: SeverityFilter;
  l: string;
  ac: string;
  ic: string;
}[] = [
  {
    v: "all",
    l: "All",
    ac: "bg-white/15 text-white border-white/30",
    ic: "bg-white/[0.03] text-white/40 border-white/10 hover:bg-white/[0.06]",
  },
  {
    v: "critical",
    l: "Crit",
    ac: "bg-red-500/20 text-red-400 border-red-500/40",
    ic: "bg-white/[0.03] text-white/40 border-white/10 hover:bg-red-500/10",
  },
  {
    v: "warning",
    l: "Warn",
    ac: "bg-amber-500/20 text-amber-400 border-amber-500/40",
    ic: "bg-white/[0.03] text-white/40 border-white/10 hover:bg-amber-500/10",
  },
  {
    v: "info",
    l: "Info",
    ac: "bg-emerald-500/20 text-emerald-400 border-emerald-500/40",
    ic: "bg-white/[0.03] text-white/40 border-white/10 hover:bg-emerald-500/10",
  },
];

/**
 * resolveSourceKey — returns a machine/source key for filtering.
 * Machine alarms use stationId; others map to a category key.
 */
const resolveSourceKey = (entry: {
  stationId?: string;
  type: string;
}): string => {
  if (entry.stationId) return entry.stationId;
  const map: Record<string, string> = {
    oee_alert: "oee",
    quality_alert: "quality",
    scrap_alert: "scrap",
    energy_alert: "energy",
    jam_start: "conveyor",
    jam_cleared: "conveyor",
    system_info: "system",
  };
  return map[entry.type] ?? "system";
};

/** Returns bilingual label for a source key */
const getSourceLabel = (key: string, lang: "tr" | "en"): string => {
  if (ALARM_STATION_LABELS[key]) return ALARM_STATION_LABELS[key][lang];
  const typeMap: Record<string, string> = {
    oee: "oee_alert",
    quality: "quality_alert",
    scrap: "scrap_alert",
    energy: "energy_alert",
    conveyor: "jam_start",
    system: "system_info",
  };
  const t = typeMap[key];
  if (t && ALARM_TYPE_CONFIG[t]) return ALARM_TYPE_CONFIG[t].source[lang];
  return key;
};

export const BasicPanel = () => {
  // ── Store Selectors ──────────────────────────────────────────────────
  /** Current UI language */
  const currentLang = useUIStore((s) => s.currentLang);
  /** Toggle function to show/hide the Basic panel */
  const toggleBasicPanel = useUIStore((s) => s.toggleBasicPanel);
  /** Setter for the Basic panel width (clamped in the store) */
  const setBasicPanelWidth = useUIStore((s) => s.setBasicPanelWidth);
  /** Current Basic panel width from store */
  const basicPanelWidth = useUIStore((s) => s.basicPanelWidth);

  // ── KPI Data ──────────────────────────────────────────────────────────
  /** Array of KPI objects from kpiStore */
  const kpis = useKPIStore((s) => s.kpis);
  /** Array of defect objects from kpiStore */
  const defects = useKPIStore((s) => s.defects);

  // ── Alarm Data ────────────────────────────────────────────────────────
  /** Alarm log entries from simulationStore */
  const alarmLog = useSimulationStore((s) => s.alarmLog);

  // ── Alarm Filter State ────────────────────────────────────────────────
  /** Active severity filter */
  const [sevFilter, setSevFilter] = useState<SeverityFilter>("all");
  /** Active machine/source filter */
  const [machFilter, setMachFilter] = useState<string>("all");
  /** Whether the machine dropdown is open */
  const [machDropOpen, setMachDropOpen] = useState(false);
  /** Ref for dropdown outside-click detection */
  const machDropRef = useRef<HTMLDivElement>(null);

  /** Unique machine/source options derived from alarm log */
  const machOptions = useMemo(() => {
    const keySet = new Set<string>();
    for (const e of alarmLog) keySet.add(resolveSourceKey(e));
    return Array.from(keySet)
      .map((k) => ({
        key: k,
        label: getSourceLabel(k, currentLang as "tr" | "en"),
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [alarmLog, currentLang]);

  /** Filtered alarm entries based on active severity + machine filters */
  const filteredAlarms = useMemo(() => {
    return alarmLog.filter((e) => {
      if (sevFilter !== "all" && e.severity !== sevFilter) return false;
      if (machFilter !== "all" && resolveSourceKey(e) !== machFilter)
        return false;
      return true;
    });
  }, [alarmLog, sevFilter, machFilter]);

  // ── Translations ──────────────────────────────────────────────────────
  /** Translation accessor for KPI section */
  const tKPI = useTranslation("kpiPane");
  /** Translation accessor for defect section */
  const tDefect = useTranslation("defects");

  // ── Resize Handle Logic ──────────────────────────────────────────────
  /** Whether a resize drag is in progress */
  const isDraggingRef = useRef(false);
  /** Starting X coordinate of the drag */
  const startXRef = useRef(0);
  /** Starting panel width when drag begins */
  const startWidthRef = useRef(0);

  /**
   * handleMouseDown — initiates the resize drag on the right-edge handle.
   * Captures the initial pointer X and panel width, then attaches
   * document-level mousemove/mouseup listeners for smooth tracking.
   */
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      /** Prevent text selection during drag */
      e.preventDefault();
      isDraggingRef.current = true;
      startXRef.current = e.clientX;
      startWidthRef.current = basicPanelWidth;

      /** Track mouse movement across the entire document */
      const handleMouseMove = (ev: MouseEvent) => {
        if (!isDraggingRef.current) return;
        /** Calculate delta: moving right → wider panel (positive delta) */
        const delta = ev.clientX - startXRef.current;
        setBasicPanelWidth(startWidthRef.current + delta);
      };

      /** End drag on mouse release */
      const handleMouseUp = () => {
        isDraggingRef.current = false;
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [basicPanelWidth, setBasicPanelWidth],
  );

  /**
   * getDefectColor — returns Tailwind classes for defect severity coloring.
   * ≥ HIGH threshold → red, ≥ MEDIUM → orange, else green.
   */
  const getDefectColor = (value: number) => {
    if (value >= DEFECT_THRESHOLD_HIGH)
      return "text-red-400 bg-red-500/10 border-red-500/30";
    if (value >= DEFECT_THRESHOLD_MEDIUM)
      return "text-orange-400 bg-orange-500/10 border-orange-500/30";
    return "text-green-400 bg-green-500/10 border-green-500/30";
  };

  return (
    <div className="h-full flex flex-col bg-black/60 backdrop-blur-xl border-r border-white/10 relative select-none">
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/10 bg-black/40">
        <div className="flex items-center gap-2">
          {/* Icon container */}
          <div className="w-7 h-7 rounded-md bg-amber-500/15 border border-amber-500/30 flex items-center justify-center">
            <BarChart3 size={16} className="text-amber-300" />
          </div>
          <div>
            <h2 className="text-[1.16rem] font-bold text-white leading-tight">
              Basic
            </h2>
          </div>
        </div>
        {/* Close button */}
        <button
          onClick={toggleBasicPanel}
          className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
        >
          <X size={16} className="text-white/40 hover:text-white/80" />
        </button>
      </div>

      {/* ── Scrollable Content ──────────────────────────────────────── */}
      <div
        className="flex-1 overflow-y-auto"
        style={{
          scrollbarWidth: "none",
          msOverflowStyle: "none",
          WebkitOverflowScrolling: "touch",
        }}
      >
        {/* ── KPI Section ────────────────────────────────────────────── */}
        <div className="px-3 pt-3 pb-2">
          {/* Section header */}
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[0.72rem] uppercase tracking-[0.15em] text-amber-400/60 font-semibold">
              {tKPI("title")}
            </span>
            <div className="flex-1 h-px bg-white/10" />
          </div>
          {/* KPI card list */}
          <div className="space-y-1.5">
            {kpis.map((kpi) => (
              <div
                key={kpi.id}
                className="flex items-center justify-between py-1.5 px-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
              >
                <div>
                  {/* KPI label */}
                  <span className="text-[0.625rem] text-white/60 block leading-tight">
                    {kpi.label[currentLang]}
                  </span>
                  {/* KPI value + unit */}
                  <span className="text-sm font-mono font-bold text-white leading-tight">
                    {kpi.value}
                    <span className="text-[0.5rem] text-white/40 ml-0.5">
                      {kpi.unit}
                    </span>
                  </span>
                </div>
                {/* Trend indicator */}
                <span
                  className={`text-[10px] font-mono ${
                    kpi.trendDirection === "up"
                      ? "text-green-400"
                      : "text-red-400"
                  }`}
                >
                  {kpi.trend[currentLang]}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Separator ──────────────────────────────────────────────── */}
        <div className="mx-3 h-px bg-white/10" />

        {/* ── Defect Heatmap Section ─────────────────────────────────── */}
        <div className="px-3 pt-2 pb-3">
          {/* Section header */}
          <div className="flex items-center gap-2 mb-2">
            <Shield size={12} className="text-amber-400/60" />
            <span className="text-[0.72rem] uppercase tracking-[0.15em] text-amber-400/60 font-semibold">
              {tDefect("title")}
            </span>
            <div className="flex-1 h-px bg-white/10" />
          </div>
          {/* Defect grid — 2 columns */}
          <div className="grid grid-cols-2 gap-2">
            {defects.map((defect) => (
              <div
                key={defect.name}
                className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg border ${getDefectColor(defect.value)} transition-all duration-300`}
              >
                {/* Defect label */}
                <span className="text-[0.75rem] opacity-70">
                  {defect.label[currentLang] || defect.name}
                </span>
                {/* Defect percentage value */}
                <span className="text-[1.05rem] font-mono font-bold">
                  {defect.value.toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Separator ──────────────────────────────────────────────── */}
        <div className="mx-3 h-px bg-white/10" />

        {/* ── Alarm Log Section ──────────────────────────────────────── */}
        <div className="px-3 pt-2 pb-3">
          {/* Section header */}
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={12} className="text-amber-400/60" />
            <span className="text-[0.72rem] uppercase tracking-[0.15em] text-amber-400/60 font-semibold">
              Alarm Log
            </span>
            {/* Alarm count badge */}
            <span className="text-[0.55rem] px-1.5 py-0.5 rounded-full bg-white/10 text-white/40 font-mono tabular-nums">
              {alarmLog.length}
            </span>
            <div className="flex-1 h-px bg-white/10" />
          </div>
          {/* ── Compact filter bar: severity + machine dropdown ────── */}
          <div className="flex items-center gap-1.5 mb-2 flex-wrap">
            {/* Severity toggle buttons */}
            {SEVERITY_BTNS.map((btn) => (
              <button
                key={btn.v}
                onClick={() => setSevFilter(btn.v)}
                className={`px-1.5 py-0.5 rounded text-[0.55rem] font-medium border transition-all ${
                  sevFilter === btn.v ? btn.ac : btn.ic
                }`}
              >
                {btn.l}
              </button>
            ))}
            {/* Machine dropdown */}
            <div className="relative ml-auto" ref={machDropRef}>
              <button
                onClick={() => setMachDropOpen((p) => !p)}
                className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[0.55rem] font-medium border transition-all ${
                  machFilter !== "all"
                    ? "bg-violet-500/20 text-violet-300 border-violet-500/40"
                    : "bg-white/3 text-white/40 border-white/10 hover:bg-white/6"
                }`}
              >
                {machFilter === "all"
                  ? translations.alarmLog.allSources[currentLang]
                  : getSourceLabel(machFilter, currentLang as "tr" | "en")}
                <ChevronDown
                  className={`w-3 h-3 transition-transform ${machDropOpen ? "rotate-180" : ""}`}
                />
              </button>
              {machDropOpen && (
                <div className="absolute top-full left-0 mt-1 z-50 min-w-[140px] rounded-lg border border-white/10 shadow-xl overflow-hidden bg-[rgba(14,16,20,0.98)] backdrop-blur-xl">
                  <button
                    onClick={() => {
                      setMachFilter("all");
                      setMachDropOpen(false);
                    }}
                    className={`w-full text-left px-3 py-1.5 text-[0.55rem] transition-colors ${
                      machFilter === "all"
                        ? "bg-violet-500/15 text-violet-300 font-medium"
                        : "text-white/50 hover:bg-white/6"
                    }`}
                  >
                    {translations.alarmLog.allSources[currentLang]}
                  </button>
                  <div className="border-t border-white/6" />
                  {machOptions.map((opt) => (
                    <button
                      key={opt.key}
                      onClick={() => {
                        setMachFilter(opt.key);
                        setMachDropOpen(false);
                      }}
                      className={`w-full text-left px-3 py-1.5 text-[0.55rem] transition-colors ${
                        machFilter === opt.key
                          ? "bg-violet-500/15 text-violet-300 font-medium"
                          : "text-white/50 hover:bg-white/6"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          {/* Alarm list — compact, scrollable, filtered entries */}
          {filteredAlarms.length === 0 ? (
            <div className="text-center py-4 text-white/20 text-[0.625rem]">
              {alarmLog.length === 0
                ? "No alarm events recorded yet"
                : "No alarms match filters"}
            </div>
          ) : (
            <div className="space-y-1 max-h-[300px] overflow-y-auto">
              {filteredAlarms
                .slice(-50)
                .reverse()
                .map((entry, idx) => {
                  /** Look up the alarm type config for label and severity styling */
                  const config = ALARM_TYPE_CONFIG[entry.type] ?? {
                    label: entry.type.toUpperCase(),
                    severity: "info",
                    source: { tr: "Sistem", en: "System" },
                  };
                  /** Get severity badge styles (dot, text, bg colors) */
                  const style = SEVERITY_BADGE_STYLES[entry.severity];
                  /** Format timestamp for compact display */
                  const time = new Date(entry.timestamp).toLocaleTimeString(
                    ALARM_LOG_LOCALE,
                    {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    },
                  );
                  return (
                    <div
                      key={`${entry.timestamp}-${idx}`}
                      className="flex items-start gap-2 py-1 px-2 rounded-lg bg-white/3 hover:bg-white/6 transition-colors"
                    >
                      {/* Severity indicator dot */}
                      <span
                        className={`w-2 h-2 rounded-full mt-1 shrink-0 ${style.dot}`}
                      />
                      {/* Alarm content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          {/* Alarm type label */}
                          <span
                            className={`text-[0.6rem] font-semibold ${style.text}`}
                          >
                            {config.label}
                          </span>
                          {/* S-Clock tick counter */}
                          <span className="text-[0.5rem] text-white/30 font-mono">
                            S:{entry.sClockTick}
                          </span>
                        </div>
                        {/* Alarm message (truncated for compact view) */}
                        {entry.message && (
                          <p className="text-[0.55rem] text-white/40 truncate leading-tight mt-0.5">
                            {entry.message}
                          </p>
                        )}
                      </div>
                      {/* Timestamp */}
                      <span className="text-[0.5rem] text-white/25 font-mono shrink-0 mt-0.5">
                        {time}
                      </span>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      </div>

      {/* ── Resize Handle (right edge) ──────────────────────────────── */}
      <div
        className="absolute top-0 right-0 h-full cursor-col-resize hover:bg-amber-400/10 active:bg-amber-400/20 transition-colors z-50"
        style={{ width: BASIC_SIDE_PANEL_HANDLE_WIDTH }}
        onMouseDown={handleMouseDown}
      />
    </div>
  );
};
