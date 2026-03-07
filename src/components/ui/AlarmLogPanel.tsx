/**
 * AlarmLogPanel.tsx — Alarm Log Popup with Severity & Machine Filters
 *
 * Full-screen overlay popup triggered by the "Alarm Log" header button.
 * Displays a scrollable, filterable table of alarm entries from the simulation store.
 *
 * Filters:
 *  - Severity toggle buttons: All / Critical / Warning / Info
 *  - Machine dropdown: All sources + specific stations (Press, Kiln, etc.)
 *
 * Design:
 *  - Matches DemoSettingsPanel glassmorphism style
 *  - Escape key and backdrop click to close
 *  - Auto-scrolls to latest entry
 *  - Severity badges (critical=red, warning=amber, info=emerald)
 *  - Empty state with friendly message
 *  - Filter bar sits between header and table
 *
 * Used by: Dashboard.tsx
 */
import { useEffect, useCallback, useRef, useState, useMemo } from "react";
import { X, AlertTriangle, ChevronDown, Filter } from "lucide-react";
import {
  useSimulationStore,
  type AlarmEntry,
  type AlarmSeverity,
} from "../../store/simulationStore";
import {
  ALARM_TYPE_CONFIG,
  SEVERITY_BADGE_STYLES,
  ALARM_LOG_LOCALE,
  ALARM_STATION_LABELS,
} from "../../lib/params";
import { useUIStore } from "../../store/uiStore";
import { translations } from "../../lib/translations";

// ─── Filter Types ───────────────────────────────────────────────────────────

/** Severity filter value — 'all' means no filtering */
type SeverityFilter = "all" | AlarmSeverity;

/** Machine/source filter value — 'all' means no filtering */
type MachineFilter = string;

// ─── Helper: Resolve source key for an alarm entry ──────────────────────────

/**
 * Returns the source key for filtering and display.
 * Machine alarms use the stationId (e.g., 'press', 'kiln').
 * Other alarms use a key derived from their alarm type (e.g., 'oee', 'quality').
 */
const resolveSourceKey = (entry: AlarmEntry): string => {
  /** Machine-specific alarms: use the actual stationId */
  if (entry.stationId) return entry.stationId;
  /** Map alarm types to source filter keys */
  const typeToKey: Record<string, string> = {
    oee_alert: "oee",
    quality_alert: "quality",
    scrap_alert: "scrap",
    energy_alert: "energy",
    jam_start: "conveyor",
    jam_cleared: "conveyor",
    system_info: "system",
  };
  return typeToKey[entry.type] ?? "system";
};

/**
 * Returns the bilingual display label for a source key.
 */
const getSourceLabel = (key: string, lang: "tr" | "en"): string => {
  /** Check station labels first (press, kiln, etc.) */
  if (ALARM_STATION_LABELS[key]) return ALARM_STATION_LABELS[key][lang];
  /** Then check alarm type config for type-based sources */
  const typeMap: Record<string, string> = {
    oee: "oee_alert",
    quality: "quality_alert",
    scrap: "scrap_alert",
    energy: "energy_alert",
    conveyor: "jam_start",
    system: "system_info",
  };
  const alarmType = typeMap[key];
  if (alarmType && ALARM_TYPE_CONFIG[alarmType]) {
    return ALARM_TYPE_CONFIG[alarmType].source[lang];
  }
  return key;
};

// ─── Severity Button Definitions ────────────────────────────────────────────

/** Configuration for each severity toggle button */
const SEVERITY_BUTTONS: {
  value: SeverityFilter;
  label: { tr: string; en: string };
  activeClass: string;
  inactiveClass: string;
}[] = [
  {
    value: "all",
    label: { tr: "Tümü", en: "All" },
    activeClass: "bg-white/15 text-white border-white/30",
    inactiveClass:
      "bg-white/[0.03] text-white/40 border-white/10 hover:bg-white/[0.06] hover:text-white/60",
  },
  {
    value: "critical",
    label: { tr: "Kritik", en: "Critical" },
    activeClass: "bg-red-500/20 text-red-400 border-red-500/40",
    inactiveClass:
      "bg-white/[0.03] text-white/40 border-white/10 hover:bg-red-500/10 hover:text-red-400/80",
  },
  {
    value: "warning",
    label: { tr: "Uyarı", en: "Warning" },
    activeClass: "bg-amber-500/20 text-amber-400 border-amber-500/40",
    inactiveClass:
      "bg-white/[0.03] text-white/40 border-white/10 hover:bg-amber-500/10 hover:text-amber-400/80",
  },
  {
    value: "info",
    label: { tr: "Bilgi", en: "Info" },
    activeClass: "bg-emerald-500/20 text-emerald-400 border-emerald-500/40",
    inactiveClass:
      "bg-white/[0.03] text-white/40 border-white/10 hover:bg-emerald-500/10 hover:text-emerald-400/80",
  },
];

// ─── Component ──────────────────────────────────────────────────────────────

export const AlarmLogPanel = () => {
  const isOpen = useUIStore((s) => s.showAlarmLog);
  const toggle = useUIStore((s) => s.toggleAlarmLog);
  const currentLang = useUIStore((s) => s.currentLang) as "tr" | "en";
  const alarmLog = useSimulationStore((s) => s.alarmLog);
  const bottomRef = useRef<HTMLDivElement>(null);

  /** Active severity filter — 'all' shows every severity */
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("all");
  /** Active machine/source filter — 'all' shows every source */
  const [machineFilter, setMachineFilter] = useState<MachineFilter>("all");
  /** Whether the machine dropdown is open */
  const [dropdownOpen, setDropdownOpen] = useState(false);
  /** Ref for the dropdown to handle outside clicks */
  const dropdownRef = useRef<HTMLDivElement>(null);

  // ── Escape key handler ──────────────────────────────────────────────────
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (dropdownOpen) {
          setDropdownOpen(false);
        } else {
          toggle();
        }
      }
    },
    [toggle, dropdownOpen],
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    }
  }, [isOpen, handleKeyDown]);

  // ── Close dropdown on outside click ─────────────────────────────────────
  useEffect(() => {
    if (!dropdownOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [dropdownOpen]);

  // Auto-scroll to bottom when new entries arrive
  useEffect(() => {
    if (isOpen && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [isOpen, alarmLog.length]);

  // ── Build unique machine/source options from current alarm log ──────────
  const machineOptions = useMemo(() => {
    /** Collect unique source keys from all alarms */
    const keySet = new Set<string>();
    for (const entry of alarmLog) {
      keySet.add(resolveSourceKey(entry));
    }
    /** Convert to sorted array of { key, label } */
    const options = Array.from(keySet)
      .map((key) => ({
        key,
        label: getSourceLabel(key, currentLang),
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
    return options;
  }, [alarmLog, currentLang]);

  // ── Apply filters ──────────────────────────────────────────────────────
  const filteredLog = useMemo(() => {
    return alarmLog.filter((entry) => {
      /** Severity filter */
      if (severityFilter !== "all" && entry.severity !== severityFilter)
        return false;
      /** Machine/source filter */
      if (machineFilter !== "all" && resolveSourceKey(entry) !== machineFilter)
        return false;
      return true;
    });
  }, [alarmLog, severityFilter, machineFilter]);

  if (!isOpen) return null;

  /** Format timestamps for the Time column */
  const formatTime = (timestamp: number) => {
    const d = new Date(timestamp);
    return d.toLocaleTimeString(ALARM_LOG_LOCALE, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  // Summary counts (from full unfiltered log)
  const criticalCount = alarmLog.filter(
    (e) => e.severity === "critical",
  ).length;
  const warningCount = alarmLog.filter((e) => e.severity === "warning").length;

  /** Whether any filter is actively applied */
  const isFiltering = severityFilter !== "all" || machineFilter !== "all";

  /** Label for the currently selected machine filter */
  const selectedMachineLabel =
    machineFilter === "all"
      ? translations.alarmLog.allSources[currentLang]
      : getSourceLabel(machineFilter, currentLang);

  return (
    <>
      {/* Backdrop overlay */}
      <div
        className="fixed inset-0 z-[300] bg-black/50 backdrop-blur-sm"
        onClick={toggle}
      />

      {/* Panel */}
      <div
        className="fixed z-[301] flex flex-col overflow-hidden rounded-2xl border border-white/10 shadow-2xl"
        style={{
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: "clamp(360px, 65vw, 960px)",
          height: "clamp(300px, 75vh, 800px)",
          background:
            "linear-gradient(135deg, rgba(12,14,18,0.97) 0%, rgba(8,10,14,0.99) 100%)",
          backdropFilter: "blur(24px) saturate(1.4)",
          WebkitBackdropFilter: "blur(24px) saturate(1.4)",
        }}
      >
        {/* ─── Header Bar ──────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-4 py-3 sm:px-6 sm:py-4 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-2 sm:gap-3">
            <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 text-amber-400" />
            <h2 className="text-sm sm:text-lg font-bold text-white tracking-wide">
              Alarm Log
            </h2>
            <div className="flex items-center gap-2 ml-2">
              <span className="text-[0.6rem] sm:text-xs px-2 py-0.5 rounded-full bg-white/10 text-white/50 font-mono tabular-nums">
                {alarmLog.length} total
              </span>
              {criticalCount > 0 && (
                <span className="text-[0.6rem] sm:text-xs px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 font-mono tabular-nums border border-red-500/20">
                  {criticalCount} critical
                </span>
              )}
              {warningCount > 0 && (
                <span className="text-[0.6rem] sm:text-xs px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 font-mono tabular-nums border border-amber-500/20">
                  {warningCount} warning
                </span>
              )}
            </div>
          </div>
          <button
            onClick={toggle}
            className="p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        </div>

        {/* ─── Filter Bar ────────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 sm:gap-4 px-4 py-2.5 sm:px-6 sm:py-3 border-b border-white/[0.06] shrink-0 bg-white/[0.02]">
          {/* Filter icon */}
          <Filter className="w-3.5 h-3.5 text-white/30 shrink-0" />

          {/* Severity toggle buttons */}
          <div className="flex items-center gap-1.5">
            {SEVERITY_BUTTONS.map((btn) => (
              <button
                key={btn.value}
                onClick={() => setSeverityFilter(btn.value)}
                className={`
                  px-2.5 py-1 rounded-lg text-[0.6rem] sm:text-xs font-medium
                  border transition-all duration-200
                  ${severityFilter === btn.value ? btn.activeClass : btn.inactiveClass}
                `}
              >
                {btn.label[currentLang]}
              </button>
            ))}
          </div>

          {/* Separator */}
          <div className="w-px h-5 bg-white/10 shrink-0" />

          {/* Machine dropdown */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setDropdownOpen((prev) => !prev)}
              className={`
                flex items-center gap-1.5 px-3 py-1 rounded-lg text-[0.6rem] sm:text-xs font-medium
                border transition-all duration-200
                ${
                  machineFilter !== "all"
                    ? "bg-violet-500/20 text-violet-300 border-violet-500/40"
                    : "bg-white/[0.03] text-white/40 border-white/10 hover:bg-white/[0.06] hover:text-white/60"
                }
              `}
            >
              {selectedMachineLabel}
              <ChevronDown
                className={`w-3 h-3 transition-transform duration-200 ${dropdownOpen ? "rotate-180" : ""}`}
              />
            </button>

            {/* Dropdown menu */}
            {dropdownOpen && (
              <div
                className="absolute top-full left-0 mt-1 z-10 min-w-[160px] rounded-xl border border-white/10 shadow-xl overflow-hidden"
                style={{
                  background:
                    "linear-gradient(135deg, rgba(20,22,28,0.98) 0%, rgba(14,16,20,0.99) 100%)",
                  backdropFilter: "blur(20px)",
                }}
              >
                {/* "All Sources" option */}
                <button
                  onClick={() => {
                    setMachineFilter("all");
                    setDropdownOpen(false);
                  }}
                  className={`
                    w-full text-left px-3 py-2 text-[0.6rem] sm:text-xs transition-colors
                    ${
                      machineFilter === "all"
                        ? "bg-violet-500/15 text-violet-300 font-medium"
                        : "text-white/50 hover:bg-white/[0.06] hover:text-white/70"
                    }
                  `}
                >
                  {translations.alarmLog.allSources[currentLang]}
                </button>

                {/* Separator */}
                <div className="border-t border-white/[0.06]" />

                {/* Dynamic source options from alarm log */}
                {machineOptions.map((opt) => (
                  <button
                    key={opt.key}
                    onClick={() => {
                      setMachineFilter(opt.key);
                      setDropdownOpen(false);
                    }}
                    className={`
                      w-full text-left px-3 py-2 text-[0.6rem] sm:text-xs transition-colors
                      ${
                        machineFilter === opt.key
                          ? "bg-violet-500/15 text-violet-300 font-medium"
                          : "text-white/50 hover:bg-white/[0.06] hover:text-white/70"
                      }
                    `}
                  >
                    {opt.label}
                  </button>
                ))}

                {/* Empty state when no alarms yet */}
                {machineOptions.length === 0 && (
                  <div className="px-3 py-2 text-[0.6rem] sm:text-xs text-white/20 italic">
                    {translations.alarmLog.noSourcesYet[currentLang]}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Active filter indicator + clear button */}
          {isFiltering && (
            <button
              onClick={() => {
                setSeverityFilter("all");
                setMachineFilter("all");
              }}
              className="ml-auto text-[0.55rem] sm:text-[0.65rem] text-white/30 hover:text-white/60 transition-colors underline underline-offset-2"
            >
              {translations.alarmLog.clearFilters[currentLang]}
            </button>
          )}
        </div>

        {/* ─── Body ────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {alarmLog.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-white/20">
              <AlertTriangle className="w-10 h-10" />
              <p className="text-sm">No alarm events recorded yet</p>
              <p className="text-xs text-white/10">
                Alarms are logged for conveyor jams, machine status changes,
                quality drops, and KPI threshold violations
              </p>
            </div>
          ) : filteredLog.length === 0 ? (
            /* Filtered empty state */
            <div className="flex flex-col items-center justify-center h-full gap-3 text-white/20">
              <Filter className="w-10 h-10" />
              <p className="text-sm">
                {translations.alarmLog.noAlarmsMatch[currentLang]}
              </p>
              <button
                onClick={() => {
                  setSeverityFilter("all");
                  setMachineFilter("all");
                }}
                className="text-xs text-violet-400/60 hover:text-violet-300 transition-colors underline underline-offset-2"
              >
                {translations.alarmLog.clearFilters[currentLang]}
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-white/[0.06]">
              {/* Filtered count indicator */}
              {isFiltering && (
                <div className="px-3 py-1.5 sm:px-4 bg-white/[0.02] border-b border-white/[0.04] text-[0.55rem] sm:text-[0.65rem] text-white/30">
                  {currentLang === "tr"
                    ? `${filteredLog.length} / ${alarmLog.length} alarm gösteriliyor`
                    : `Showing ${filteredLog.length} of ${alarmLog.length} alarms`}
                </div>
              )}
              <table className="w-full border-collapse text-[clamp(0.6rem,1vw,0.8rem)]">
                <thead>
                  <tr className="bg-white/[0.04] text-white/40 uppercase tracking-wider text-[clamp(0.5rem,0.85vw,0.7rem)]">
                    <th className="text-left py-2.5 px-3 sm:px-4 font-medium w-10">
                      #
                    </th>
                    <th className="text-left py-2.5 px-3 sm:px-4 font-medium w-20">
                      S-Clock
                    </th>
                    <th className="text-left py-2.5 px-3 sm:px-4 font-medium">
                      Type
                    </th>
                    <th className="text-left py-2.5 px-3 sm:px-4 font-medium w-24">
                      Machine
                    </th>
                    <th className="text-left py-2.5 px-3 sm:px-4 font-medium">
                      Details
                    </th>
                    <th className="text-left py-2.5 px-3 sm:px-4 font-medium w-20">
                      Time
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLog.map((entry: AlarmEntry, idx: number) => {
                    const config = ALARM_TYPE_CONFIG[entry.type] ?? {
                      label: entry.type.toUpperCase(),
                      severity: "info",
                      source: { tr: "Sistem", en: "System" },
                    };
                    const style = SEVERITY_BADGE_STYLES[entry.severity];

                    return (
                      <tr
                        key={`${entry.timestamp}-${idx}`}
                        className={`
                          border-t border-white/[0.04] transition-colors
                          hover:bg-white/[0.03]
                          ${idx % 2 === 0 ? "bg-transparent" : "bg-white/[0.015]"}
                        `}
                      >
                        {/* Row Number */}
                        <td className="py-2 px-3 sm:px-4 text-white/30 font-mono tabular-nums">
                          {idx + 1}
                        </td>

                        {/* S-Clock */}
                        <td className="py-2 px-3 sm:px-4 text-white/70 font-mono tabular-nums font-medium">
                          {entry.sClockTick}
                        </td>

                        {/* Type Badge */}
                        <td className="py-2 px-3 sm:px-4">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[0.6rem] sm:text-xs font-medium whitespace-nowrap ${style.bg} ${style.text} border ${style.border}`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${style.dot}`}
                            />
                            {config.label}
                          </span>
                        </td>

                        {/* Machine / Station */}
                        <td className="py-2 px-3 sm:px-4 text-white/60 text-[0.6rem] sm:text-xs font-medium whitespace-nowrap">
                          {(() => {
                            /** If alarm has a stationId, show the specific station name */
                            if (
                              entry.stationId &&
                              ALARM_STATION_LABELS[entry.stationId]
                            ) {
                              return ALARM_STATION_LABELS[entry.stationId][
                                currentLang
                              ];
                            }
                            /** Otherwise, use the alarm type's default source label */
                            return config.source?.[currentLang] ?? "System";
                          })()}
                        </td>

                        {/* Details */}
                        <td className="py-2 px-3 sm:px-4 text-white/50 text-[0.6rem] sm:text-xs max-w-[240px] truncate">
                          {entry.message ??
                            (entry.stationId
                              ? `Station: ${entry.stationId}`
                              : "—")}
                        </td>

                        {/* Time */}
                        <td className="py-2 px-3 sm:px-4 text-white/40 font-mono tabular-nums">
                          {formatTime(entry.timestamp)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div ref={bottomRef} />
            </div>
          )}
        </div>
      </div>
    </>
  );
};
