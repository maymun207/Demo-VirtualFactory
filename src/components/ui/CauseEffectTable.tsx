/**
 * CauseEffectTable.tsx — Standalone Cause-Effect Reference Table Component
 *
 * Renders a collapsible table showing the physical cause-effect relationships
 * for any station parameters that are currently outside their normal operating
 * range. This component is **scenario-independent** — it uses causeEffectConfig
 * for static definitions and machineTooltipConfig for range boundaries.
 *
 * Key features:
 *  - Dynamically filters to show only out-of-range parameters
 *  - Computes deviation text at render time (distance from min/max)
 *  - Computes severity color dynamically (orange vs red based on magnitude)
 *  - Bilingual support (TR/EN)
 *  - Collapsible with smooth toggle animation
 *
 * Used by: DemoSettingsPanel.tsx
 */
import { useMemo, useState } from "react";
import { STATION_TOOLTIP_CONFIG } from "./machineTooltipConfig";
import type { StationName } from "../../store/types";
import {
  CAUSE_EFFECT_MAP,
  type CauseEffectEntry,
} from "../../lib/causeEffectConfig";
import {
  CAUSE_EFFECT_SEVERITY_COLORS,
  KPI_BADGE_COLORS,
} from "../../lib/params";

// =============================================================================
// TYPES
// =============================================================================

/** Per-parameter user values: { [machineKey]: { [paramKey]: { value, variation } } } */
type ParamValues = Record<
  string,
  Record<string, { value: string; variation: string }>
>;

// =============================================================================
// BILINGUAL TRANSLATIONS
// =============================================================================

/** All UI strings used by the cause-effect table. */
const CAUSE_EFFECT_TRANSLATIONS = {
  /** Title for the collapsible cause-effect reference table */
  title: {
    tr: "📋 Neden-Sonuç Referans Tablosu",
    en: "📋 Cause-Effect Reference Table",
  },
  /** Column header for the "Parameter" column */
  parameter: { tr: "Parametre", en: "Parameter" },
  /** Column header for the "Deviation" column */
  deviation: { tr: "Sapma", en: "Deviation" },
  /** Column header for the "Expected Defects" column */
  expectedDefects: { tr: "Beklenen Defektler", en: "Expected Defects" },
  /** Column header for the "Consequence" column */
  consequence: { tr: "Sonuç", en: "Consequence" },
  /** Column header for the "Affected KPIs" column */
  affectedKPIs: { tr: "Etkilenen KPI'lar", en: "Affected KPIs" },
} as const;

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

/**
 * KPIBadge — A small inline badge for a KPI name (e.g., "OEE", "FTQ").
 * Displays with a color derived from the KPI_BADGE_COLORS map.
 */
function KPIBadge({
  kpi,
}: {
  /** KPI identifier (e.g., 'oee', 'ftq'). */ kpi: string;
}) {
  /** Color from the KPI badge color map, defaulting to gray. */
  const color = KPI_BADGE_COLORS[kpi] ?? "#94a3b8";
  return (
    <span
      className="inline-block text-[9px] uppercase font-bold px-1.5 py-0.5 rounded mr-1 mb-0.5"
      style={{
        backgroundColor: `${color}20`,
        color: color,
      }}
    >
      {kpi}
    </span>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

/**
 * CauseEffectTable — Displays a dynamic, collapsible table of cause-effect
 * relationships for the currently selected station.
 *
 * Shows a row for each parameter that is currently outside its defined
 * operating range, with dynamically computed deviation text and severity color.
 *
 * @param props.selectedMachine - Station key of the active machine tab.
 * @param props.paramValues - Current editable parameter values for all machines.
 * @param props.currentLang - Active language for bilingual display ('tr' | 'en').
 */
export function CauseEffectTable({
  selectedMachine,
  paramValues,
  currentLang,
}: {
  selectedMachine: string;
  paramValues: ParamValues;
  currentLang: "tr" | "en";
}) {
  /** Whether the cause-effect table body is expanded (default: open). */
  const [isOpen, setIsOpen] = useState<boolean>(true);

  /**
   * Dynamically filter cause-effect entries for the selected machine.
   *
   * A row is shown ONLY when the current user-entered value for that
   * parameter is **outside** its defined min–max operating range from
   * machineTooltipConfig. This is completely scenario-independent —
   * all 45 parameters are always available regardless of active scenario.
   */
  const relevantEntries = useMemo(() => {
    /** Filter to entries for the selected station. */
    const stationEntries = CAUSE_EFFECT_MAP.filter(
      (entry) => entry.station === selectedMachine,
    );

    /** Further filter to only entries where the current value is out of range. */
    return stationEntries.filter((entry) => {
      /** Current value string from the editable UI state. */
      const currentVal = paramValues[entry.station]?.[entry.parameter]?.value;
      /** Parsed numeric value for range comparison. */
      const currentNum = parseFloat(currentVal ?? "");
      /** Skip non-numeric values (cannot compare range). */
      if (isNaN(currentNum)) return false;

      /** Look up the normal operating range from station tooltip config. */
      const stationCfg = STATION_TOOLTIP_CONFIG[entry.station as StationName];
      const paramDef = stationCfg?.params.find(
        (p) => p.key === entry.parameter,
      );
      /** Skip parameters without defined ranges. */
      if (!paramDef?.range) return false;

      /** Show row only when value is outside the normal range. */
      return currentNum < paramDef.range.min || currentNum > paramDef.range.max;
    });
  }, [selectedMachine, paramValues]);

  // ── Don't render anything if no parameters are out of range ──────────────
  if (relevantEntries.length === 0) return null;

  return (
    <div className="mt-6">
      {/* Toggle button for expanding/collapsing the table */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 text-sm font-bold text-white/80 mb-3 hover:text-white transition-colors"
      >
        {/* Rotation arrow indicator — rotates 90° when expanded */}
        <span
          className={`transition-transform duration-200 ${isOpen ? "rotate-90" : ""}`}
        >
          ▶
        </span>
        {CAUSE_EFFECT_TRANSLATIONS.title[currentLang]}
      </button>

      {/* Cause-effect table body — only rendered when expanded */}
      {isOpen && (
        <div className="overflow-x-auto rounded-xl border border-white/[0.06]">
          <table className="w-full border-collapse text-[clamp(0.55rem,0.9vw,0.75rem)]">
            <thead>
              <tr className="bg-white/[0.04] text-white/40 uppercase tracking-wider text-[clamp(0.45rem,0.8vw,0.65rem)]">
                <th className="text-left py-2.5 px-3 font-medium">
                  {CAUSE_EFFECT_TRANSLATIONS.parameter[currentLang]}
                </th>
                <th className="text-left py-2.5 px-3 font-medium">
                  {CAUSE_EFFECT_TRANSLATIONS.deviation[currentLang]}
                </th>
                <th className="text-left py-2.5 px-3 font-medium">
                  {CAUSE_EFFECT_TRANSLATIONS.expectedDefects[currentLang]}
                </th>
                <th className="text-left py-2.5 px-3 font-medium">
                  {CAUSE_EFFECT_TRANSLATIONS.consequence[currentLang]}
                </th>
                <th className="text-left py-2.5 px-3 font-medium">
                  {CAUSE_EFFECT_TRANSLATIONS.affectedKPIs[currentLang]}
                </th>
              </tr>
            </thead>
            <tbody>
              {relevantEntries.map((entry, idx) => (
                <CauseEffectRow
                  key={`${entry.station}::${entry.parameter}`}
                  entry={entry}
                  paramValues={paramValues}
                  currentLang={currentLang}
                  rowIndex={idx}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// ROW COMPONENT
// =============================================================================

/**
 * CauseEffectRow — Renders a single row in the cause-effect table.
 *
 * Dynamically computes:
 *  - Deviation text (distance from nearest range boundary)
 *  - Severity color (red if >50% of range span, orange otherwise)
 */
function CauseEffectRow({
  entry,
  paramValues,
  currentLang,
  rowIndex,
}: {
  /** The cause-effect definition for this row. */
  entry: CauseEffectEntry;
  /** Current editable parameter values for range comparison. */
  paramValues: ParamValues;
  /** Active language for bilingual display. */
  currentLang: "tr" | "en";
  /** Row index for alternating background. */
  rowIndex: number;
}) {
  /** Current value from the editable parameter input. */
  const curVal = paramValues[entry.station]?.[entry.parameter]?.value;
  /** Parsed current numeric value. */
  const curNum = parseFloat(curVal ?? "");

  /** Look up operating range from station config. */
  const sCfg = STATION_TOOLTIP_CONFIG[entry.station as StationName];
  const pDef = sCfg?.params.find((p) => p.key === entry.parameter);
  /** Range boundaries for this parameter. */
  const rMin = pDef?.range?.min ?? 0;
  const rMax = pDef?.range?.max ?? 0;
  /** Unit string for display (e.g., 'bar', '°C'). */
  const unit = pDef?.unit ?? "";

  /**
   * Build a dynamic deviation description from the current value
   * and its distance from the nearest range boundary.
   * Format: "Minimumun X altında (currentValue unit)" or
   *         "Maksimumun X üzerinde (currentValue unit)"
   */
  let dynDeviation: string;
  /** Absolute distance from the nearest boundary. */
  let distance = 0;

  if (!isNaN(curNum) && curNum < rMin) {
    /** Below minimum — compute shortfall. */
    distance = rMin - curNum;
    /** Format the distance to a clean readable number. */
    const d = Number(distance.toFixed(2));
    dynDeviation =
      currentLang === "tr"
        ? `Minimumun ${d} ${unit} altında (${curNum} ${unit})`
        : `-${d} ${unit} below min (${curNum} ${unit})`;
  } else if (!isNaN(curNum) && curNum > rMax) {
    /** Above maximum — compute overshoot. */
    distance = curNum - rMax;
    const d = Number(distance.toFixed(2));
    dynDeviation =
      currentLang === "tr"
        ? `Maksimumun ${d} ${unit} üzerinde (${curNum} ${unit})`
        : `+${d} ${unit} above max (${curNum} ${unit})`;
  } else {
    /** Fallback — value is within range, use static consequence text. */
    dynDeviation = entry.consequence[currentLang];
  }

  /**
   * Dynamic severity color based on deviation magnitude.
   * If the distance exceeds 50% of the parameter's range span
   * the severity is 'red' (critical), otherwise 'orange' (warning).
   */
  const rangeSpan = rMax - rMin;
  const dynSeverity: string =
    rangeSpan > 0 && distance > rangeSpan * 0.5
      ? "red"
      : distance > 0
        ? "orange"
        : "orange";
  /** Resolved hex color for the row's left border. */
  const rowColor = CAUSE_EFFECT_SEVERITY_COLORS[dynSeverity] ?? "#94a3b8";

  return (
    <tr
      className={`
        border-t border-white/[0.04] transition-colors
        hover:bg-white/[0.03]
        ${rowIndex % 2 === 0 ? "bg-transparent" : "bg-white/[0.015]"}
      `}
      style={{
        /* Left border colored by dynamic severity */
        borderLeft: `3px solid ${rowColor}`,
      }}
    >
      {/* Parameter label */}
      <td className="py-2 px-3 text-white/80 font-medium whitespace-nowrap">
        {entry.parameterLabel[currentLang]}
      </td>
      {/* Dynamic deviation description */}
      <td className="py-2 px-3 text-white/60 text-[clamp(0.5rem,0.85vw,0.7rem)]">
        {dynDeviation}
      </td>
      {/* Expected defects as small pills */}
      <td className="py-2 px-3">
        <div className="flex flex-wrap gap-1">
          {entry.expectedDefects.map((defect) => (
            <span
              key={defect}
              className="text-[9px] px-1.5 py-0.5 rounded bg-white/[0.06] text-white/50 border border-white/[0.08]"
            >
              {defect.replace(/_/g, " ")}
            </span>
          ))}
        </div>
      </td>
      {/* Consequence description */}
      <td className="py-2 px-3 text-white/60 text-[clamp(0.5rem,0.85vw,0.7rem)]">
        {entry.consequence[currentLang]}
      </td>
      {/* Affected KPIs as colored badges */}
      <td className="py-2 px-3">
        <div className="flex flex-wrap gap-0.5">
          {entry.affectedKPIs.map((kpi) => (
            <KPIBadge key={kpi} kpi={kpi} />
          ))}
        </div>
      </td>
    </tr>
  );
}
