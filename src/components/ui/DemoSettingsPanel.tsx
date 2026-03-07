/**
 * DemoSettingsPanel.tsx — Demo Settings Modal/Popup with Scenario Management
 *
 * Full-screen overlay popup triggered by the "Demo Settings" header button.
 * Left sidebar lists all 7 factory machines + General as selectable tabs.
 * Right content area shows per-machine parameter table with editable
 * Value and Variation % columns.
 *
 * STEP-2 additions:
 *  - Scenario Selector Cards: 4 clickable cards (SCN-001 through SCN-004)
 *  - Impact Summary Bar: Shows expected OEE, Scrap, Energy, Severity
 *  - Cause-Effect Reference Table: Collapsible table explaining deviations
 *  - Out-of-range highlighting: Red border/text for params outside normal range
 *
 * STEP-3 additions (Senaryo Etkisi Bar Extension):
 *  - Auto-pause: simulation is paused automatically when panel opens
 *  - ACTIVE scenario label (turns orange when user has customized any param)
 *  - Get DefaultParams button: restores scenario baseline for all machines
 *  - Update button: commits local table edits to the simulator (turns orange
 *    while there are uncommitted changes, returns to white after commit)
 *  - Reset button: full factory reset + reloads active scenario's defaults;
 *    simulation is NOT restarted — only the Header Start button can do that
 *
 * State flags:
 *  hasPendingUpdate — true when the user has edited a value but not yet
 *                     pressed Update. Cleared by Update / GetDefaultParams / Reset.
 *  hasCustomParams  — true when table values differ from the active scenario's
 *                     original defaults. Cleared only by GetDefaultParams or Reset.
 *                     Stays true after Update (values are applied but still custom).
 *
 * Columns:
 *  1. Parameter — name of the parameter
 *  2. Range    — min–max from config
 *  3. Unit     — measurement unit
 *  4. Value    — editable numeric input
 *  5. Δ %      — editable variation percentage
 *
 * Design:
 *  - Covers ~75% of the viewport, centered
 *  - Glassmorphism dark theme with backdrop blur
 *  - Fully responsive (clamp-based sizing)
 *  - Escape key and backdrop click to close
 *
 * Used by: Dashboard.tsx
 */
import { useEffect, useCallback, useState, useRef } from "react";

import { Settings2 } from "lucide-react";
import { useUIStore } from "../../store/uiStore";
import { useSimulationDataStore } from "../../store/simulationDataStore";
/** Needed to read isDataFlowing for auto-pause when panel opens. */
import { useSimulationStore } from "../../store/simulationStore";
/** Full factory reset hook (session end + all store resets). */
import { useFactoryReset } from "../../hooks/useFactoryReset";
import {
  STATION_TOOLTIP_CONFIG,
  type ParamDefinition,
} from "./machineTooltipConfig";
import type { StationName } from "../../store/types";
/** Work Order bar — displayed above scenario selector cards */
import { WorkOrderBar } from "./WorkOrderBar";
/** Work Order store — used to detect mid-simulation Work Order changes */
import { useWorkOrderStore } from "../../store/workOrderStore";

import {
  DEMO_SETTINGS_MACHINES,
  DEFAULT_DRIFT_LIMIT,
  SCENARIO_SEVERITY_COLORS,
  /** Normal operating ranges for the conveyor Range column */
  CB_JAMMED_TIME_NORMAL_RANGE,
  CB_IMPACTED_TILES_NORMAL_RANGE,
  /** Factory-default machine params — used by buildReferenceValues(). */
  createDefaultParams,
} from "../../lib/params";
/** Factory-default drift limits — used by buildReferenceValues(). */
import { createDefaultDriftLimits } from "../../store/slices/storeHelpers";
import { translations } from "../../lib/translations";
import { CauseEffectTable } from "./CauseEffectTable";

import {
  SCENARIOS,
  REFERENCE_SCENARIO,
  type ScenarioDefinition,
  type ConveyorSettingsEntry,
} from "../../lib/scenarios";

// ─── Types for Editable State ───────────────────────────────────────────────

/** Per-parameter user values: { [machineKey]: { [paramKey]: { value, variation } } } */
type ParamValues = Record<
  string,
  Record<string, { value: string; variation: string }>
>;

// ─── Bilingual Translations ─────────────────────────────────────────────────

/** All UI strings used by the scenario-related features. */
const scenarioTranslations = {
  /** Label for the active badge on a selected scenario card */
  active: { tr: "AKTİF", en: "ACTIVE" },
  /** Column header for the "Parameter" column in parameter table */
  parameter: { tr: "Parametre", en: "Parameter" },
  /** Label for "Severity" in the impact summary bar */
  severity: { tr: "Seviye", en: "Severity" },
  /** Label for the impact summary bar title */
  scenarioImpact: { tr: "Senaryo Etkisi", en: "Scenario Impact" },
} as const;

// ─── Helper: Build Initial Values ───────────────────────────────────────────

/** Build initial values from live currentParams */
/**
 * formatNum — Converts a numeric value to a display string without trailing '.0'.
 *
 * Rules:
 *   - If the number is an integer (or rounds to one), return it without decimals.
 *   - Otherwise keep up to 2 significant decimal places (no trailing zeros).
 * Examples: 365.0 → '365', 1.5 → '1.5', 0.80 → '0.8', 12.34 → '12.34'
 */
function formatNum(n: number): string {
  /** If the number is a whole number, return without decimal point. */
  if (Number.isInteger(n)) return String(n);
  /** Otherwise parse to float string — removes trailing zeros automatically. */
  return parseFloat(n.toFixed(2)).toString();
}

function buildInitialValues(): ParamValues {
  /** Read the latest simulation data store state. */
  const state = useSimulationDataStore.getState();
  /** Accumulator for per-machine parameter values. */
  const result: ParamValues = {};

  for (const [stationKey, stationMeta] of Object.entries(
    STATION_TOOLTIP_CONFIG,
  )) {
    result[stationKey] = {};
    /** Live parameter values for this station from simulation. */
    const liveParams = state.currentParams[stationKey as StationName] as Record<
      string,
      unknown
    >;
    /** Drift limit values for this station. */
    const driftLimits = state.parameterDriftLimits[stationKey as StationName];

    for (const param of stationMeta.params) {
      /** Current live value for this parameter. */
      const liveValue = liveParams?.[param.key];
      /** Formatted value string for display — no trailing '.0' (e.g. 365 not 365.0). */
      const valueStr =
        typeof liveValue === "number" ? formatNum(liveValue) : "";
      /** Current drift limit (defaults to 5%). */
      const driftLimit = driftLimits?.[param.key] ?? 5;
      result[stationKey][param.key] = {
        value: valueStr,
        variation: driftLimit.toString(),
      };
    }
  }
  return result;
}

/**
 * buildReferenceValues — Compute factory-default reference values WITHOUT
 * touching the store. Used for color-coding (green/red/yellow) comparison
 * in the parameter table.
 *
 * Unlike the old approach that called resetToFactoryDefaults() and then
 * buildInitialValues(), this reads directly from createDefaultParams()
 * and createDefaultDriftLimits(), leaving the store's currentParams intact.
 * This prevents user-committed parameter updates from being erased when
 * the panel is reopened.
 */
function buildReferenceValues(): ParamValues {
  /** Factory-default machine parameter values (never touches the store). */
  const defaultParams = createDefaultParams();
  /** Factory-default drift limit percentages (never touches the store). */
  const defaultDriftLimits = createDefaultDriftLimits();
  /** Accumulator for per-machine reference values. */
  const result: ParamValues = {};

  for (const [stationKey, stationMeta] of Object.entries(
    STATION_TOOLTIP_CONFIG,
  )) {
    result[stationKey] = {};
    /** Default parameter values for this station. */
    const stationParams = defaultParams[stationKey as StationName] as Record<
      string,
      unknown
    >;
    /** Default drift limits for this station. */
    const stationDrifts = defaultDriftLimits[stationKey as StationName];

    for (const param of stationMeta.params) {
      /** Factory-default value for this parameter. */
      const value = stationParams?.[param.key];
      /** Formatted value string for display — no trailing '.0'. */
      const valueStr = typeof value === "number" ? formatNum(value) : "";
      /** Default drift limit (defaults to 5% if somehow missing). */
      const driftLimit = stationDrifts?.[param.key] ?? 5;
      result[stationKey][param.key] = {
        value: valueStr,
        variation: driftLimit.toString(),
      };
    }
  }
  return result;
}

// ─── Sub-components (kept in same file per design rules) ────────────────────

/**
 * ScenarioCard — A clickable card representing one defect scenario.
 * Shows scenario code, name, description, severity badge, and active indicator.
 */
function ScenarioCard({
  scenario,
  isActive,
  currentLang,
  onClick,
}: {
  /** The scenario definition to render. */
  scenario: ScenarioDefinition;
  /** Whether this scenario is currently active/selected. */
  isActive: boolean;
  /** Current UI language ('tr' or 'en'). */
  currentLang: "tr" | "en";
  /** Callback when the card is clicked. */
  onClick: () => void;
}) {
  /** Severity accent color for this scenario's level. */
  const severityColor =
    SCENARIO_SEVERITY_COLORS[scenario.severity] ?? "#94a3b8";

  return (
    <button
      onClick={onClick}
      className={`
        relative flex flex-col gap-1.5 min-w-[160px] max-w-[200px] p-3 rounded-xl
        border transition-all duration-300 cursor-pointer shrink-0
        hover:scale-[1.02]
        ${
          isActive
            ? "bg-white/8 border-white/20"
            : "bg-white/4 border-white/6 hover:bg-white/6"
        }
      `}
      style={{
        /* Left accent border colored by severity level */
        borderLeftWidth: "3px",
        borderLeftColor: severityColor,
        /* Active glow shadow using severity color with 25% opacity */
        boxShadow: isActive ? `0 0 15px ${severityColor}40` : "none",
      }}
    >
      {/* ── Top row: code + severity badge ── */}
      <div className="flex items-center justify-between w-full">
        {/* Scenario code (e.g., SCN-001) */}
        <span className="text-[10px] font-mono text-white/50">
          {scenario.code}
        </span>
        {/* Severity pill badge */}
        <span
          className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded-full"
          style={{
            backgroundColor: `${severityColor}20`,
            color: severityColor,
          }}
        >
          {scenario.severity}
        </span>
      </div>

      {/* ── Scenario name ── */}
      <span className="text-xs font-semibold text-white/90 text-left leading-tight">
        {scenario.name[currentLang]}
      </span>

      {/* ── Truncated description (max 2 lines) ── */}
      <span className="text-[10px] text-white/40 text-left leading-tight line-clamp-2">
        {scenario.description[currentLang]}
      </span>

      {/* ── Active badge — only when selected ── */}
      {isActive && (
        <span
          className="absolute bottom-2 right-2 text-[9px] font-bold px-1.5 py-0.5 rounded-full animate-pulse"
          style={{
            backgroundColor: `${severityColor}30`,
            color: severityColor,
          }}
        >
          {scenarioTranslations.active[currentLang]} ✓
        </span>
      )}
    </button>
  );
}

/**
 * ImpactPill — A small colored pill showing one metric in the impact summary bar.
 * Displays a label and value with color-coded background.
 */
function ImpactPill({
  label,
  value,
  color,
}: {
  /** Display label (e.g., "OEE", "Scrap"). */
  label: string;
  /** Formatted value string (e.g., "85–92%"). */
  value: string;
  /** Accent color for the pill background and text. */
  color: string;
}) {
  return (
    <div
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
      style={{
        /* Pill background with 10% opacity of the accent color */
        backgroundColor: `${color}18`,
        /* Pill border with 20% opacity of the accent color */
        border: `1px solid ${color}30`,
        /* Text colored with the accent color */
        color: color,
      }}
    >
      <span className="text-white/50">{label}</span>
      <span className="font-mono tabular-nums">{value}</span>
    </div>
  );
}

// ─── ConveyorSettingsTable ──────────────────────────────────────────────────

/**
 * ConveyorSettingsTable — Shows editable conveyor-specific settings
 * for the currently selected scenario.
 *
 * Renders 4 rows matching the "Conveyor Settings" spreadsheet spec:
 *   1. SpeedChange  — Yes/No toggle button
 *   2. JammedEvents — Yes/No toggle button
 *   3. JammedTime   — numeric input (unit: Cycle Time)
 *   4. ImpactedTiles— numeric input (unit: Scrap tiles)
 *
 * Each row has a Drift % input editable by the operator.
 * Disabled boolean rows show a styled Yes/No pill button.
 * When the active scenario changes, local state is re-initialised.
 */
function ConveyorSettingsTable({
  /** Conveyor reference (baseline) settings from REFERENCE_SCENARIO */
  referenceSettings,
  /** Conveyor settings for the currently active scenario (null = reference active) */
  activeSettings,
  /** Current UI language */
  currentLang,
  /**
   * Callback fired whenever the user edits a numeric conveyor field.
   * The outer DemoSettingsPanel uses this to set hasPendingUpdate = true,
   * turning the Update button orange — same behaviour as other machine tabs.
   */
  onDirty,
  /**
   * Callback fired whenever the user edits any conveyor field — turns ACTIVE badge orange.
   * Mirrors setHasCustomParams(true) in updateParamField for machine params.
   */
  onCustomize,
  /**
   * Callback fired by handleUpdate to collect the latest conveyor values
   * so they can be written to the store.  Returns { paramName, value, drift }[].
   * Stored in a ref inside the table so it always reflects latest local state.
   */
  onRegisterGetValues,
  /**
   * Registers a reset function that handleGetDefaultParams calls when the
   * conveyor tab is selected. The reset function re-syncs all local fields
   * from the current effective (scenario default) settings.
   */
  onRegisterReset,
}: {
  referenceSettings: ConveyorSettingsEntry;
  activeSettings: ConveyorSettingsEntry | null;
  currentLang: "tr" | "en";
  /** Called whenever the user edits any conveyor field — turns Update button orange. */
  onDirty: () => void;
  /**
   * Called whenever the user edits any conveyor field — turns ACTIVE badge orange.
   * Mirrors setHasCustomParams(true) in updateParamField for machine params.
   */
  onCustomize: () => void;
  /**
   * Receives a getter function the outer panel calls during handleUpdate
   * to collect the current jammed_time / impacted_tiles values + drifts.
   */
  onRegisterGetValues: (
    fn: () => Array<{ paramName: string; value: number; drift: number }>,
  ) => void;
  /**
   * Registers a reset function that handleGetDefaultParams calls when the
   * conveyor tab is selected. The reset function re-syncs all local fields
   * from the current effective (scenario default) settings.
   */
  onRegisterReset: (fn: () => void) => void;
}) {
  /** Effective settings: use active scenario or fall back to reference */
  const effective = activeSettings ?? referenceSettings;

  /**
   * Read confirmed conveyor values from the data store.
   * These reflect what was committed via the last "Update" click.
   * On first mount (before any Update), they hold the scenario defaults.
   * This is the SINGLE SOURCE OF TRUTH for "what did the user last commit?"
   */
  const storeConveyorParams = useSimulationDataStore(
    (s) => s.conveyorNumericParams,
  );
  const storeConveyorDrifts = useSimulationDataStore(
    (s) => s.conveyorDriftLimits,
  );

  // ── Local editable state for conveyor fields ──────────────────────────────

  /** Local copy of SpeedChange boolean — user can toggle this */
  const [speedChange, setSpeedChange] = useState<boolean>(
    effective.speedChange,
  );
  /** Local copy of SpeedChange drift % */
  const [speedChangeDrift, setSpeedChangeDrift] = useState<string>(
    String(effective.speedChangeDrift),
  );
  /** Local copy of JammedEvents boolean — user can toggle this */
  const [jammedEvents, setJammedEvents] = useState<boolean>(
    effective.jammedEvents,
  );
  /** Local copy of JammedEvents drift % */
  const [jammedEventsDrift, setJammedEventsDrift] = useState<string>(
    String(effective.jammedEventsDrift),
  );
  /** Local copy of JammedTime numeric value */
  const [jammedTime, setJammedTime] = useState<string>(
    String(effective.jammedTime),
  );
  /** Local copy of JammedTime drift % */
  const [jammedTimeDrift, setJammedTimeDrift] = useState<string>(
    String(effective.jammedTimeDrift),
  );
  /** Local copy of ImpactedTiles numeric value */
  const [impactedTiles, setImpactedTiles] = useState<string>(
    String(effective.impactedTiles),
  );
  /** Local copy of ImpactedTiles drift % */
  const [impactedTilesDrift, setImpactedTilesDrift] = useState<string>(
    String(effective.impactedTilesDrift),
  );
  /** Local copy of ScrapProbability as whole percentage (e.g. 2 = 2%) */
  const [scrapProbability, setScrapProbability] = useState<string>(
    String(effective.scrapProbability),
  );
  /** Local copy of ScrapProbability drift % */
  const [scrapProbabilityDrift, setScrapProbabilityDrift] = useState<string>(
    String(effective.scrapProbabilityDrift),
  );

  // Register a getter so the outer panel can collect values during handleUpdate
  useEffect(() => {
    /**
     * Returns ALL 8 conveyor fields as { paramName, value, drift } entries.
     *
     * 4 values:  jammed_time, impacted_tiles, speed_change (0/1), jammed_events (0/1)
     * 4 drifts:  one drift % for each of the above, all saved to the store.
     *
     * Boolean values are encoded as 0/1. Boolean drifts are real % values
     * (the user can set a drift % even for toggles — e.g. how often the
     * conveyor randomly flips the toggle during simulation).
     */
    onRegisterGetValues(() => [
      // ── Numeric params ──────────────────────────────────────────────────────
      {
        paramName: "jammed_time",
        value: parseFloat(jammedTime) || 0,
        drift: parseFloat(jammedTimeDrift) || 0,
      },
      {
        paramName: "impacted_tiles",
        value: parseFloat(impactedTiles) || 0,
        drift: parseFloat(impactedTilesDrift) || 0,
      },
      // ── Boolean params — value encoded as 0/1; drift is the real % field ───
      {
        paramName: "speed_change",
        value: speedChange ? 1 : 0,
        /** The actual speedChangeDrift value from local state — NOT 0. */
        drift: parseFloat(speedChangeDrift) || 0,
      },
      {
        paramName: "jammed_events",
        value: jammedEvents ? 1 : 0,
        /** The actual jammedEventsDrift value from local state — NOT 0. */
        drift: parseFloat(jammedEventsDrift) || 0,
      },
      // ── Scrap probability: stored as whole % (e.g. 2 = 2%) ─────────────
      {
        paramName: "scrap_probability",
        value: parseFloat(scrapProbability) || 0,
        drift: parseFloat(scrapProbabilityDrift) || 0,
      },
    ]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    jammedTime,
    jammedTimeDrift,
    impactedTiles,
    impactedTilesDrift,
    speedChange,
    speedChangeDrift,
    jammedEvents,
    jammedEventsDrift,
    scrapProbability,
    scrapProbabilityDrift,
    onRegisterGetValues,
  ]);

  // Re-sync local state whenever effective settings change (scenario switch)
  useEffect(() => {
    /** Re-initialise all fields from the new effective settings */
    setSpeedChange(effective.speedChange);
    setSpeedChangeDrift(String(effective.speedChangeDrift));
    setJammedEvents(effective.jammedEvents);
    setJammedEventsDrift(String(effective.jammedEventsDrift));
    setJammedTime(String(effective.jammedTime));
    setJammedTimeDrift(String(effective.jammedTimeDrift));
    setImpactedTiles(String(effective.impactedTiles));
    setImpactedTilesDrift(String(effective.impactedTilesDrift));
    setScrapProbability(String(effective.scrapProbability));
    setScrapProbabilityDrift(String(effective.scrapProbabilityDrift));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSettings]);

  /**
   * Sync ALL 8 conveyor fields from the store on mount.
   *
   * Reads 4 values + 4 drift limits back from the store so that
   * Update → Done → Reopen shows exactly what the user last committed —
   * no field is silently lost.
   */
  useEffect(() => {
    /** 4 value fields from conveyorNumericParams */
    const storeJT = storeConveyorParams.jammed_time;
    const storeIT = storeConveyorParams.impacted_tiles;
    const storeSC = storeConveyorParams.speed_change;
    const storeJE = storeConveyorParams.jammed_events;
    const storeSP = storeConveyorParams.scrap_probability;
    /** 5 drift fields from conveyorDriftLimits */
    const storeJTDrift = storeConveyorDrifts.jammed_time ?? 5;
    const storeITDrift = storeConveyorDrifts.impacted_tiles ?? 5;
    const storeSCDrift = storeConveyorDrifts.speed_change ?? 5;
    const storeJEDrift = storeConveyorDrifts.jammed_events ?? 5;
    const storeSPDrift = storeConveyorDrifts.scrap_probability ?? 1;

    /**
     * Overwrite local state if ANY stored value differs from the scenario reference.
     * This handles the common case: user edits → Update → Done → Reopen.
     */
    if (
      storeJT !== effective.jammedTime ||
      storeIT !== effective.impactedTiles ||
      storeSC !== effective.speedChange ||
      storeJE !== effective.jammedEvents ||
      storeSP !== effective.scrapProbability ||
      storeJTDrift !== effective.jammedTimeDrift ||
      storeITDrift !== effective.impactedTilesDrift ||
      storeSCDrift !== effective.speedChangeDrift ||
      storeJEDrift !== effective.jammedEventsDrift ||
      storeSPDrift !== effective.scrapProbabilityDrift
    ) {
      /** Restore all 10 fields at once. */
      setJammedTime(String(storeJT));
      setJammedTimeDrift(String(storeJTDrift));
      setImpactedTiles(String(storeIT));
      setImpactedTilesDrift(String(storeITDrift));
      setSpeedChange(storeSC);
      setSpeedChangeDrift(String(storeSCDrift));
      setJammedEvents(storeJE);
      setJammedEventsDrift(String(storeJEDrift));
      setScrapProbability(String(storeSP));
      setScrapProbabilityDrift(String(storeSPDrift));
    }
    // Run once on mount to pick up committed store values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Register a reset function with the outer panel so it can imperatively
   * restore all conveyor fields to the active scenario's defaults when
   * the user clicks "Get Default Params" on the Conveyor tab.
   * The function reads effective (the current activeSettings ?? referenceSettings)
   * at the time it is called, so it always reflects the latest scenario.
   */
  useEffect(() => {
    onRegisterReset(() => {
      /** currentEffective: re-read inside closure to get latest value */
      const currentEffective = activeSettings ?? referenceSettings;
      setSpeedChange(currentEffective.speedChange);
      setSpeedChangeDrift(String(currentEffective.speedChangeDrift));
      setJammedEvents(currentEffective.jammedEvents);
      setJammedEventsDrift(String(currentEffective.jammedEventsDrift));
      setJammedTime(String(currentEffective.jammedTime));
      setJammedTimeDrift(String(currentEffective.jammedTimeDrift));
      setImpactedTiles(String(currentEffective.impactedTiles));
      setImpactedTilesDrift(String(currentEffective.impactedTilesDrift));
      setScrapProbability(String(currentEffective.scrapProbability));
      setScrapProbabilityDrift(String(currentEffective.scrapProbabilityDrift));
    });
    // Refresh whenever active scenario changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSettings, referenceSettings, onRegisterReset]);

  // ── Derived comparison values for colour coding ───────────────────────────

  /** Shared colour classes used across Value and Drift columns */
  const COLOR_GREEN =
    "border-green-500/50  text-green-300  focus:border-green-400/70  focus:ring-green-400/20";
  const COLOR_RED =
    "border-red-500/50    text-red-400    focus:border-red-400/70    focus:ring-red-400/20";
  const COLOR_YELLOW =
    "border-yellow-500/50 text-yellow-300 focus:border-yellow-400/70 focus:ring-yellow-400/20";

  /**
   * SpeedChange colour — green when value matches reference (both NO or both YES),
   * red when it differs (any deviation from the reference state is an alert).
   */
  const speedChangeColor =
    speedChange === referenceSettings.speedChange ? COLOR_GREEN : COLOR_RED;

  /**
   * JammedEvents colour — same logic as speedChange.
   */
  const jammedEventsColor =
    jammedEvents === referenceSettings.jammedEvents ? COLOR_GREEN : COLOR_RED;

  /** Parsed numeric jam time — used for reference comparison colouring */
  const jammedTimeNum = parseFloat(jammedTime);
  /** Reference jam time for colour comparison */
  const refJammedTime = referenceSettings.jammedTime;
  /** Colour class for JammedTime: green=at ref, red=above ref, yellow=below ref */
  const jammedTimeColor =
    isNaN(jammedTimeNum) || jammedTimeNum === refJammedTime
      ? COLOR_GREEN
      : jammedTimeNum > refJammedTime
        ? COLOR_RED
        : COLOR_YELLOW;

  /** Parsed numeric impacted tiles — used for reference comparison colouring */
  const impactedTilesNum = parseFloat(impactedTiles);
  /** Reference impacted tiles for colour comparison */
  const refImpactedTiles = referenceSettings.impactedTiles;
  /** Colour class for ImpactedTiles: green=at ref, red=above ref, yellow=below ref */
  const impactedTilesColor =
    isNaN(impactedTilesNum) || impactedTilesNum === refImpactedTiles
      ? COLOR_GREEN
      : impactedTilesNum > refImpactedTiles
        ? COLOR_RED
        : COLOR_YELLOW;

  /** Parsed numeric scrap probability (whole %) for comparison */
  const scrapProbabilityNum = parseFloat(scrapProbability);
  /** Reference scrap probability for colour comparison */
  const refScrapProbability = referenceSettings.scrapProbability;
  /** Colour class for ScrapProbability: green=at ref, red=above ref, yellow=below ref */
  const scrapProbabilityColor =
    isNaN(scrapProbabilityNum) || scrapProbabilityNum === refScrapProbability
      ? COLOR_GREEN
      : scrapProbabilityNum > refScrapProbability
        ? COLOR_RED
        : COLOR_YELLOW;

  // ── Shared CSS helpers ────────────────────────────────────────────────────

  /** Shared CSS for editable numeric inputs — mirrors machine param table inputs */
  const numInputCss = (colorClass: string) =>
    `w-full max-w-[100px] mx-auto bg-white/6 border rounded-lg px-2 py-1.5
     text-center font-mono tabular-nums text-[clamp(0.55rem,0.95vw,0.75rem)]
     focus:outline-none focus:ring-1 hover:border-white/20 transition-colors
     [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none
     [&::-webkit-inner-spin-button]:appearance-none ${colorClass}`;

  /**
   * Drift input CSS — accepts the same colorClass as the corresponding Value cell
   * so that Drift % visually matches its row's value state (green/red/yellow).
   * This means Drift colour updates dynamically whenever Value changes.
   */
  const driftInputCssFor = (colorClass: string) =>
    `w-full bg-white/6 border rounded-lg px-2 py-1.5
     text-center font-mono tabular-nums text-[clamp(0.55rem,0.95vw,0.75rem)]
     focus:outline-none focus:ring-1 hover:border-white/20 transition-colors
     [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none
     [&::-webkit-inner-spin-button]:appearance-none ${colorClass}`;

  /**
   * YesNoToggle — a pill-style toggle button for boolean conveyor settings.
   * Active state shows a coloured pill (green=Yes, red/muted=No).
   */
  function YesNoToggle({
    /** Current boolean value */
    value,
    /** Setter callback to update the value */
    onChange,
  }: {
    value: boolean;
    onChange: (v: boolean) => void;
  }) {
    return (
      <div className="flex items-center justify-center gap-1">
        {/* YES button — RED when active: means conveyor will fluctuate or jam (bad) */}
        <button
          onClick={() => onChange(true)}
          className={`px-2.5 py-1 rounded-md text-[clamp(0.5rem,0.85vw,0.7rem)] font-semibold transition-all duration-200 ${
            value
              ? "bg-red-500/20 border border-red-500/50 text-red-400"
              : "bg-white/4 border border-white/8"
          }`}
        >
          {currentLang === "tr" ? "Evet" : "Yes"}
        </button>
        {/* NO button — GREEN when active: means conveyor is stable (good) */}
        <button
          onClick={() => onChange(false)}
          className={`px-2.5 py-1 rounded-md text-[clamp(0.5rem,0.85vw,0.7rem)] font-semibold transition-all duration-200 ${
            !value
              ? "bg-green-500/20 border border-green-500/50 text-green-400"
              : "bg-white/4 border border-white/8"
          }`}
        >
          {currentLang === "tr" ? "Hayır" : "No"}
        </button>
      </div>
    );
  }

  // ── Row definitions — drives the table render loop ────────────────────────

  /** Static row metadata for the 5 conveyor setting rows */
  const rows = [
    {
      /** Internal key for React list rendering */
      key: "speedChange",
      /** Display label bilingual */
      label: { tr: "Hız Değişimi", en: "Speed Change" },
      /** Whether this row is a boolean toggle (vs numeric input) */
      isBoolean: true,
      /** No unit for boolean params — shown as — in Unit column */
      unit: "",
      /** Normal range null for boolean params (no numeric range) */
      range: null as { min: number; max: number } | null,
    },
    {
      key: "jammedEvents",
      label: { tr: "Sıkışma Olayları", en: "Jammed Events" },
      isBoolean: true,
      unit: "",
      range: null as { min: number; max: number } | null,
    },
    {
      key: "jammedTime",
      label: { tr: "Sıkışma Süresi", en: "Jammed Time" },
      isBoolean: false,
      /** Cycle Time label for jam duration */
      unit: currentLang === "tr" ? "Çevrim Süresi" : "Cycle Time",
      /**
       * Fixed normal operating range from conveyorBehaviour params:
       * CB_JAMMED_TIME_NORMAL_RANGE = { min: 6, max: 10 }
       */
      range: CB_JAMMED_TIME_NORMAL_RANGE as { min: number; max: number } | null,
    },
    {
      key: "impactedTiles",
      label: {
        tr: "Etkilenen Karolar (Hurda)",
        en: "Impacted Tiles (Scrap)",
      },
      isBoolean: false,
      /** Unit: Count — matches spreadsheet spec */
      unit: currentLang === "tr" ? "Adet" : "Count",
      /**
       * Fixed normal operating range from conveyorBehaviour params:
       * CB_IMPACTED_TILES_NORMAL_RANGE = { min: 1, max: 5 }
       */
      range: CB_IMPACTED_TILES_NORMAL_RANGE as {
        min: number;
        max: number;
      } | null,
    },
    {
      key: "scrapProbability",
      label: {
        tr: "Hurda Olasılığı",
        en: "Scrap Probability",
      },
      isBoolean: false,
      /** Unit: Percentage (0–100%) */
      unit: "%",
      /**
       * Scrap probability range: 1–3 (%)
       * Represents the likelihood of immediate station-level discarding.
       */
      range: { min: 1, max: 3 } as {
        min: number;
        max: number;
      } | null,
    },
  ];

  return (
    <div className="overflow-x-auto rounded-xl border border-white/6">
      <table className="w-full border-collapse text-[clamp(0.6rem,1vw,0.8rem)]">
        {/* ── Column headers — mirrors machine param table style ── */}
        <thead>
          <tr className="bg-white/4 text-white/40 uppercase tracking-wider text-[clamp(0.5rem,0.85vw,0.7rem)]">
            {/* Parameter name column */}
            <th className="text-left py-2.5 px-3 sm:px-4 font-medium">
              {currentLang === "tr" ? "Parametre" : "Parameter"}
            </th>
            {/* Range column — shows min–max for numeric params */}
            <th className="text-center py-2.5 px-2 sm:px-3 font-medium">
              Range
            </th>
            {/* Unit column */}
            <th className="text-center py-2.5 px-2 sm:px-3 font-medium">
              Unit
            </th>
            {/* Value column — boolean=Yes/No toggle, numeric=editable input */}
            <th className="text-center py-2.5 px-2 sm:px-3 font-medium">
              Value
            </th>
            {/* Drift % column */}
            <th className="text-center py-2.5 px-2 sm:px-3 font-medium">
              Drift %
            </th>
          </tr>
        </thead>
        <tbody>
          {/* ── Scenario label header row — mirrors spreadsheet group label ── */}
          <tr className="bg-violet-500/7 border-b border-violet-500/20">
            <td
              colSpan={5}
              className="py-1.5 px-3 sm:px-4 text-violet-300/70 font-semibold
                         text-[clamp(0.5rem,0.85vw,0.7rem)] tracking-wider uppercase"
            >
              {/**
               * Show current scenario label (e.g., "Reference Value — SCN-000").
               * activeSettings null means reference scenario is active.
               */}
              {currentLang === "tr" ? "Referans Değer" : "Reference Value"} —{" "}
              {activeSettings === null
                ? "SCN-000"
                : `SCN-${String(
                    SCENARIOS.findIndex(
                      (s) =>
                        s.conveyorSettings.jammedTime ===
                          activeSettings.jammedTime &&
                        s.conveyorSettings.speedChange ===
                          activeSettings.speedChange,
                    ) + 1,
                  ).padStart(3, "0")}`}
            </td>
          </tr>
          {/* ── SpeedChange row — Yes/No toggle ── */}
          <tr className="border-t border-white/4 hover:bg-white/3 transition-colors">
            {/* Row label */}
            <td className="py-2 px-3 sm:px-4 text-white/80 font-medium whitespace-nowrap">
              {rows[0].label[currentLang]}
            </td>
            {/* Range cell — boolean rows show reference value (NO or YES) */}
            <td
              className="py-2 px-2 sm:px-3 text-center text-white/40
                           text-[clamp(0.5rem,0.85vw,0.65rem)] whitespace-nowrap font-medium"
            >
              {referenceSettings.speedChange
                ? currentLang === "tr"
                  ? "EVET"
                  : "YES"
                : currentLang === "tr"
                  ? "HAYIR"
                  : "NO"}
            </td>
            {/* No unit for boolean row */}
            <td className="py-2 px-2 sm:px-3 text-center text-white/30">—</td>
            {/* Yes/No toggle button */}
            <td className="py-1.5 px-2 sm:px-3 text-center">
              <YesNoToggle
                value={speedChange}
                onChange={(v) => {
                  setSpeedChange(v);
                  /** hasPendingUpdate: Update button turns orange */
                  onDirty();
                  /** hasCustomParams: ACTIVE badge turns orange */
                  onCustomize();
                }}
              />
            </td>
            {/* Drift % editable input */}
            <td className="py-1.5 px-2 sm:px-3 text-center">
              <div className="flex items-center justify-center gap-1 max-w-[90px] mx-auto">
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.5"
                  value={speedChangeDrift}
                  onChange={(e) => {
                    setSpeedChangeDrift(e.target.value);
                    /** Drift change counts as a pending edit — Update turns orange. */
                    onDirty();
                  }}
                  className={driftInputCssFor(speedChangeColor)}
                />
                <span
                  className={`text-[clamp(0.5rem,0.85vw,0.7rem)] shrink-0 ${
                    speedChange === referenceSettings.speedChange
                      ? "text-green-300/60"
                      : "text-red-400/60"
                  }`}
                >
                  %
                </span>
              </div>
            </td>
          </tr>

          {/* ── JammedEvents row — Yes/No toggle ── */}
          <tr className="border-t border-white/4 bg-white/1.5 hover:bg-white/3 transition-colors">
            <td className="py-2 px-3 sm:px-4 text-white/80 font-medium whitespace-nowrap">
              {rows[1].label[currentLang]}
            </td>
            {/* Range cell — boolean rows show reference value (NO or YES) */}
            <td
              className="py-2 px-2 sm:px-3 text-center text-white/40
                           text-[clamp(0.5rem,0.85vw,0.65rem)] whitespace-nowrap font-medium"
            >
              {referenceSettings.jammedEvents
                ? currentLang === "tr"
                  ? "EVET"
                  : "YES"
                : currentLang === "tr"
                  ? "HAYIR"
                  : "NO"}
            </td>
            <td className="py-2 px-2 sm:px-3 text-center text-white/30">—</td>
            <td className="py-1.5 px-2 sm:px-3 text-center">
              <YesNoToggle
                value={jammedEvents}
                onChange={(v) => {
                  setJammedEvents(v);
                  /** hasPendingUpdate: Update button turns orange */
                  onDirty();
                  /** hasCustomParams: ACTIVE badge turns orange */
                  onCustomize();
                }}
              />
            </td>
            <td className="py-1.5 px-2 sm:px-3 text-center">
              <div className="flex items-center justify-center gap-1 max-w-[90px] mx-auto">
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.5"
                  value={jammedEventsDrift}
                  onChange={(e) => {
                    setJammedEventsDrift(e.target.value);
                    /** Drift change counts as a pending edit — Update turns orange. */
                    onDirty();
                  }}
                  className={driftInputCssFor(jammedEventsColor)}
                />
                <span
                  className={`text-[clamp(0.5rem,0.85vw,0.7rem)] shrink-0 ${
                    jammedEvents === referenceSettings.jammedEvents
                      ? "text-green-300/60"
                      : "text-red-400/60"
                  }`}
                >
                  %
                </span>
              </div>
            </td>
          </tr>

          {/* ── JammedTime row — numeric input, unit: Cycle Time ── */}
          <tr className="border-t border-white/4 hover:bg-white/3 transition-colors">
            <td className="py-2 px-3 sm:px-4 text-white/80 font-medium whitespace-nowrap">
              {rows[2].label[currentLang]}
            </td>
            {/* Range cell — shows min–max from row definition */}
            <td className="py-2 px-2 sm:px-3 text-center text-white/40 text-[clamp(0.5rem,0.85vw,0.65rem)] whitespace-nowrap font-mono">
              {rows[2].range
                ? `${rows[2].range.min} – ${rows[2].range.max}`
                : "—"}
            </td>
            {/* Cycle Time unit label */}
            <td className="py-2 px-2 sm:px-3 text-center text-white/30 whitespace-nowrap text-[clamp(0.5rem,0.85vw,0.65rem)]">
              {rows[2].unit}
            </td>
            {/* Numeric editable input with reference colour coding */}
            <td className="py-1.5 px-2 sm:px-3 text-center">
              <input
                type="number"
                min="0"
                step="1"
                value={jammedTime}
                onChange={(e) => {
                  setJammedTime(e.target.value);
                  onDirty();
                }}
                className={numInputCss(jammedTimeColor)}
              />
            </td>
            <td className="py-1.5 px-2 sm:px-3 text-center">
              <div className="flex items-center justify-center gap-1 max-w-[90px] mx-auto">
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.5"
                  value={jammedTimeDrift}
                  onChange={(e) => {
                    setJammedTimeDrift(e.target.value);
                    onDirty();
                  }}
                  className={driftInputCssFor(jammedTimeColor)}
                />
                <span
                  className={`text-[clamp(0.5rem,0.85vw,0.7rem)] shrink-0 ${
                    jammedTimeColor === COLOR_GREEN
                      ? "text-green-300/60"
                      : jammedTimeColor === COLOR_RED
                        ? "text-red-400/60"
                        : "text-yellow-300/60"
                  }`}
                >
                  %
                </span>
              </div>
            </td>
          </tr>

          {/* ── ImpactedTiles row — numeric input, unit: Scrap Tiles ── */}
          <tr className="border-t border-white/4 bg-white/1.5 hover:bg-white/3 transition-colors">
            <td className="py-2 px-3 sm:px-4 text-white/80 font-medium whitespace-nowrap">
              {rows[3].label[currentLang]}
            </td>
            {/* Range cell — shows min–max from row definition */}
            <td className="py-2 px-2 sm:px-3 text-center text-white/40 text-[clamp(0.5rem,0.85vw,0.65rem)] whitespace-nowrap font-mono">
              {rows[3].range
                ? `${rows[3].range.min} – ${rows[3].range.max}`
                : "—"}
            </td>
            {/* Scrap Tiles unit label */}
            <td className="py-2 px-2 sm:px-3 text-center text-white/30 whitespace-nowrap text-[clamp(0.5rem,0.85vw,0.65rem)]">
              {rows[3].unit}
            </td>
            {/* Numeric editable input with reference colour coding */}
            <td className="py-1.5 px-2 sm:px-3 text-center">
              <input
                type="number"
                min="0"
                step="1"
                value={impactedTiles}
                onChange={(e) => {
                  setImpactedTiles(e.target.value);
                  onDirty();
                }}
                className={numInputCss(impactedTilesColor)}
              />
            </td>
            <td className="py-1.5 px-2 sm:px-3 text-center">
              <div className="flex items-center justify-center gap-1 max-w-[90px] mx-auto">
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.5"
                  value={impactedTilesDrift}
                  onChange={(e) => {
                    setImpactedTilesDrift(e.target.value);
                    onDirty();
                  }}
                  className={driftInputCssFor(impactedTilesColor)}
                />
                <span
                  className={`text-[clamp(0.5rem,0.85vw,0.7rem)] shrink-0 ${
                    impactedTilesColor === COLOR_GREEN
                      ? "text-green-300/60"
                      : impactedTilesColor === COLOR_RED
                        ? "text-red-400/60"
                        : "text-yellow-300/60"
                  }`}
                >
                  %
                </span>
              </div>
            </td>
          </tr>

          {/* ── ScrapProbability row — numeric input, unit: Probability (0–1) ── */}
          <tr className="border-t border-white/4 hover:bg-white/3 transition-colors">
            <td className="py-2 px-3 sm:px-4 text-white/80 font-medium whitespace-nowrap">
              {rows[4].label[currentLang]}
            </td>
            {/* Range cell — shows 0 – 1 */}
            <td className="py-2 px-2 sm:px-3 text-center text-white/40 text-[clamp(0.5rem,0.85vw,0.65rem)] whitespace-nowrap font-mono">
              {rows[4].range
                ? `${rows[4].range.min} \u2013 ${rows[4].range.max}`
                : "\u2014"}
            </td>
            {/* Probability unit label */}
            <td className="py-2 px-2 sm:px-3 text-center text-white/30 whitespace-nowrap text-[clamp(0.5rem,0.85vw,0.65rem)]">
              {rows[4].unit}
            </td>
            {/* Scrap Probability value input — user enters 0–100 integer */}
            <td className="py-1.5 px-2 sm:px-3 text-center">
              <input
                type="number"
                min="1"
                max="3"
                step="1"
                value={scrapProbability}
                onChange={(e) => {
                  setScrapProbability(e.target.value);
                  onDirty();
                }}
                className={numInputCss(scrapProbabilityColor)}
              />
            </td>
            <td className="py-1.5 px-2 sm:px-3 text-center">
              <div className="flex items-center justify-center gap-1 max-w-[90px] mx-auto">
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.5"
                  value={scrapProbabilityDrift}
                  onChange={(e) => {
                    setScrapProbabilityDrift(e.target.value);
                    onDirty();
                  }}
                  className={driftInputCssFor(scrapProbabilityColor)}
                />
                <span
                  className={`text-[clamp(0.5rem,0.85vw,0.7rem)] shrink-0 ${
                    scrapProbabilityColor === COLOR_GREEN
                      ? "text-green-300/60"
                      : scrapProbabilityColor === COLOR_RED
                        ? "text-red-400/60"
                        : "text-yellow-300/60"
                  }`}
                >
                  %
                </span>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export const DemoSettingsPanel = () => {
  /** Whether the panel overlay is currently visible. */
  const isOpen = useUIStore((s) => s.showDemoSettings);
  /** Toggle function to show/hide the panel. */
  const toggle = useUIStore((s) => s.toggleDemoSettings);
  /** Current UI language for bilingual support. */
  const currentLang = useUIStore((s) => s.currentLang);

  /**
   * handleClose — the unified close handler for the Demo Settings panel.
   *
   * Every close path (X button, Escape key, backdrop click) calls this.
   * It first marks the simulation as configured in uiStore
   * (isSimConfigured = true), then closes the panel via toggle().
   *
   * Why set isSimConfigured BEFORE toggling?
   * The order ensures the Header reads the updated flag immediately
   * after the panel disappears, so the Start button becomes active
   * on the same render cycle.
   *
   * Also handles Work Order change detection: if the user changed the
   * Work Order dropdown and clicks Done (without pressing Update), we
   * still need to reset + restart the simulation with the new WO.
   */
  /**
   * Ref holding the latest resetFactory function.
   * Needed because handleClose is declared before the useFactoryReset hook
   * result is available; saves us from a circular declaration dependency.
   */
  const resetFactoryRef = useRef<() => Promise<void>>(async () => {});

  const handleClose = useCallback(() => {
    /**
     * Work Order change detection on close:
     * If the user changed the Work Order and is closing via Done (without
     * pressing Update), we still need to reset + restart the simulation.
     */
    const currentWoId = useWorkOrderStore.getState().selectedWorkOrderId;
    if (currentWoId !== originalWorkOrderIdRef.current) {
      /**
       * Read activeScenario from the store imperatively (avoids depending
       * on a component-level variable that is declared after this callback).
       */
      const scenario = useSimulationDataStore.getState().activeScenario;
      void resetFactoryRef.current().then(() => {
        if (scenario) {
          const { resetToFactoryDefaults: rfd, loadScenario } =
            useSimulationDataStore.getState();
          rfd();
          if (scenario.id !== REFERENCE_SCENARIO.id) {
            loadScenario(scenario);
          }
        }
        useWorkOrderStore.getState().setSelectedWorkOrderId(currentWoId);
        if (wasRunningBeforeOpenRef.current) {
          useSimulationStore.getState().toggleDataFlow();
        }
        originalWorkOrderIdRef.current = currentWoId;
      });
    }
    /**
     * Unlock the Start gate — but ONLY when the simulation has NOT ended
     * naturally. If simulationEnded=true (Phase 2 auto-stop already ran),
     * closing Demo Settings should NOT re-enable Start; the user must click
     * Reset first to clear the stale simulation state.
     *
     * We read simulationEnded imperatively via getState() to always get the
     * live value, avoiding any stale React closure snapshot.
     */
    if (!useUIStore.getState().simulationEnded) {
      useUIStore.getState().setSimConfigured(true);
    }
    toggle();
  }, [toggle]);

  // ── Store subscriptions ─────────────────────────────────────────────

  /** Action to update a single parameter value in the simulation store. */
  const updateParameter = useSimulationDataStore((s) => s.updateParameter);
  /** Action to update a parameter's drift limit in the simulation store. */
  const updateDriftLimit = useSimulationDataStore((s) => s.updateDriftLimit);
  /** Action to update a single conveyor numeric param value in the store. */
  const updateConveyorParam = useSimulationDataStore(
    (s) => s.updateConveyorParam,
  );
  /** Action to update a conveyor param drift limit in the store. */
  const updateConveyorDriftLimit = useSimulationDataStore(
    (s) => s.updateConveyorDriftLimit,
  );
  /**
   * Action to persist a boolean conveyor toggle (speed_change / jammed_events)
   * to the store. Without this, toggles were lost on panel close because they
   * only lived in ConveyorSettingsTable's local React state.
   */
  const updateConveyorBoolParam = useSimulationDataStore(
    (s) => s.updateConveyorBoolParam,
  );

  /**
   * Ref holding the latest conveyor getter function registered by ConveyorSettingsTable.
   * handleUpdate calls conveyorGetValuesRef.current() to obtain the current
   * jammed_time / impacted_tiles values and drift limits from the table's local
   * state — same pattern as collecting paramValues for machine stations.
   */
  const conveyorGetValuesRef = useRef<
    (() => Array<{ paramName: string; value: number; drift: number }>) | null
  >(null);
  /**
   * Ref holding the latest conveyor reset function registered by ConveyorSettingsTable.
   * handleGetDefaultParams calls conveyorResetRef.current() when the conveyor tab is
   * selected, to re-sync the table's local state from the new effective settings
   * (i.e. the scenario's conveyorSettings defaults).
   */
  const conveyorResetRef = useRef<(() => void) | null>(null);

  /**
   * Ref capturing the Work Order ID at the moment the panel opened.
   * Compared on Update/Done to detect if the user switched Work Orders.
   */
  const originalWorkOrderIdRef = useRef<string>("");

  /**
   * Ref capturing whether the simulation was actively running (isDataFlowing)
   * when the panel opened. If true AND the Work Order was changed, we
   * auto-restart the simulation after resetting.
   */
  const wasRunningBeforeOpenRef = useRef(false);

  /**
   * Whether the simulation data is currently flowing (simulation is running).
   * Used by the auto-pause effect to detect if we need to stop the simulation
   * when the Demo Settings panel opens.
   */
  const isDataFlowing = useSimulationStore((s) => s.isDataFlowing);
  /**
   * Full factory reset function from the useFactoryReset hook.
   * Ends the Supabase session, flushes sync, clears all store slices.
   */
  const resetFactory = useFactoryReset();
  /**
   * Keep resetFactoryRef in sync with the latest resetFactory identity.
   * handleClose uses the ref because it is declared before this hook result.
   */
  resetFactoryRef.current = resetFactory;

  // ── Local state: machine tab selection ─────────────────────────────────

  /** Currently selected machine tab key (e.g., 'press', 'kiln'). */
  const [selectedMachine, setSelectedMachine] = useState<string>("press");

  // ── Local state: editable parameter values ────────────────────────────

  /** Local state holding the editable parameter values for all machines. */
  const [paramValues, setParamValues] =
    useState<ParamValues>(buildInitialValues);

  // ── Local state: baseline reference values for color coding ────────────

  /** Reference/baseline values used to detect modifications (green vs orange). */
  const [referenceValues, setReferenceValues] = useState<ParamValues | null>(
    null,
  );

  // ── Local state: dirty-tracking flags ──────────────────────────────────

  /**
   * hasPendingUpdate: true when the user has edited any parameter value but
   * has NOT yet pressed the "Update" button to commit the changes to the store.
   * Cleared by Update, Get DefaultParams, or Reset.
   * While true, the Update button renders in orange.
   */
  const [hasPendingUpdate, setHasPendingUpdate] = useState<boolean>(false);

  /**
   * hasCustomParams: true when the active scenario's parameters have been
   * customised from their original defaults and Update has been pressed.
   * Unlike hasPendingUpdate, this is NOT cleared by pressing Update —
   * it signals "simulator is running with non-default params".
   * Cleared only by "Get DefaultParams" or "Reset".
   * While true, the ACTIVE: SCN-xxx label renders in orange.
   */
  const [hasCustomParams, setHasCustomParams] = useState<boolean>(false);

  // ── Scenario state (driven by store) ─────────────────────────────────

  /** Read active scenario from the simulation data store (null if none loaded). */
  const activeScenario = useSimulationDataStore((s) => s.activeScenario);
  /** ID of the currently active scenario, derived from store. */
  const activeScenarioId = activeScenario?.id ?? null;

  // Load fresh values only when panel opens (not on every tick)
  useEffect(() => {
    if (isOpen) {
      /**
       * Snapshot the current Work Order ID and running state BEFORE any
       * auto-pause or state changes occur. Used later by handleUpdate /
       * handleClose to detect mid-session Work Order switches.
       */
      originalWorkOrderIdRef.current =
        useWorkOrderStore.getState().selectedWorkOrderId;
      wasRunningBeforeOpenRef.current =
        useSimulationStore.getState().isDataFlowing;

      /**
       * Reference values: compute ONCE from factory defaults.
       *
       * IMPORTANT: We must NOT call resetToFactoryDefaults() here — that
       * would destroy any user-committed params in the store. Instead, we
       * compute reference values directly from createDefaultParams() +
       * createDefaultDriftLimits() via buildReferenceValues(), which never
       * touches the store.
       */
      if (referenceValues === null) {
        const refValues = buildReferenceValues();
        setReferenceValues(refValues);
      }

      /**
       * Local param values: always read from live store on open.
       * buildInitialValues() reads currentParams from the store, which
       * retains user-committed values across panel close/reopen cycles.
       */
      const initialValues = buildInitialValues();
      setParamValues(initialValues);
    }
  }, [isOpen, referenceValues]);

  /**
   * Auto-pause: when the Demo Settings panel opens, pause the simulation
   * so the user sees stable parameter values. Simulation is NEVER restarted
   * automatically — only the Header's Start button can do that.
   */
  useEffect(() => {
    if (isOpen && isDataFlowing) {
      /** Pause the simulation by toggling data flow off. */
      useSimulationStore.getState().toggleDataFlow();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]); // Intentionally runs ONLY on open, not on every isDataFlowing change

  /**
   * Gate unlock: whenever the Demo Settings panel closes (by ANY mechanism —
   * X button, clicking the violet header button again, Escape, backdrop click,
   * or programmatic close), mark the simulation as configured.
   *
   * Why a separate useEffect instead of only the handleClose callback?
   * handleClose is only wired to the X button. Every other close path calls
   * toggleDemoSettings() directly, bypassing handleClose. By watching the
   * isOpen reactive value here, ALL close paths are covered with a single hook.
   *
   * The `isOpen && !isOpen` comparison is handled by React's comparison:
   * this effect runs on every isOpen change. When isOpen becomes false (panel
   * just closed), we set isSimConfigured = true.
   * We skip the initial mount (isOpen starts as false) by guarding that the
   * previous value was true — tracked by a ref.
   */
  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (isOpen) {
      /** Panel just opened — record that it was open */
      wasOpenRef.current = true;
    } else if (wasOpenRef.current) {
      /**
       * Panel just closed (was open, now closed).
       * Mark simulation as configured regardless of HOW the panel was closed.
       * This allows the Start button to work immediately after any close path.
       */
      wasOpenRef.current = false;
      /**
       * Unlock the Start gate when the panel closes — ONLY when the
       * simulation has NOT ended naturally. If simulationEnded=true,
       * the user must press Reset before Start becomes available again.
       *
       * Imperative getState() read prevents stale-closure mis-reads
       * (this callback is recreated only when isOpen changes, but
       * simulationEnded may have changed independently in between).
       */
      if (!useUIStore.getState().simulationEnded) {
        useUIStore.getState().setSimConfigured(true);
      }
    }
  }, [isOpen]);

  /**
   * updateParamField — Updates local UI state only.
   *
   * IMPORTANT: This function NO LONGER writes to the simulation store directly.
   * Values are only committed to the store when the user presses the "Update"
   * button (handleUpdate). This prevents partial/uncommitted edits from
   * affecting the running simulation unexpectedly.
   *
   * Side effects:
   *  - Sets hasPendingUpdate = true (Update button turns orange)
   *  - Sets hasCustomParams = true (ACTIVE label turns orange, persists after Update)
   */
  const updateParamField = (
    machine: string,
    paramKey: string,
    field: "value" | "variation",
    newVal: string,
  ) => {
    /** Update the local parameter values state. */
    setParamValues((prev) => ({
      ...prev,
      [machine]: {
        ...prev[machine],
        [paramKey]: {
          ...prev[machine]?.[paramKey],
          [field]: newVal,
        },
      },
    }));

    /** Mark that there are uncommitted changes pending a store write. */
    setHasPendingUpdate(true);
    /** Mark that the user has deviated from the active scenario's defaults. */
    setHasCustomParams(true);
  };

  // ── Scenario Handlers ──────────────────────────────────────────────────

  /**
   * Load a scenario: the SINGLE entry point for ALL scenario card clicks,
   * including SCN-000 (REFERENCE_SCENARIO).
   *
   * For REFERENCE_SCENARIO (empty parameterOverrides):
   *   - Calls resetToFactoryDefaults() first to restore baseline param values.
   *   - Then calls loadScenario(REFERENCE_SCENARIO) which sets activeScenario.
   *
   * For SCN-001..SCN-004:
   *   - Calls loadScenario(scenario) which applies overrides + sets activeScenario.
   *
   * Both paths end with activeScenario set to the chosen scenario object,
   * making the behaviour 100% identical for all scenario cards.
   */
  const handleLoadScenario = useCallback((scenario: ScenarioDefinition) => {
    const { loadScenario, resetToFactoryDefaults } =
      useSimulationDataStore.getState();

    /**
     * Step 1: Always reset store to factory defaults first.
     * This ensures that when switching FROM a scenario with overrides TO one
     * without (e.g., SCN-004 → SCN-002), all previously overridden params
     * return to their baseline values. Without this, SCN-002 Press parameters
     * would retain SCN-004's overrides since SCN-002 has no Press overrides.
     */
    resetToFactoryDefaults();

    /**
     * Step 2: Apply the new scenario to the store.
     * For REFERENCE_SCENARIO: parameterOverrides is empty → store stays at
     * factory defaults. loadScenario just sets activeScenario.
     * For SCN-001..004: loadScenario applies parameterOverrides to the store.
     */
    loadScenario(scenario);

    /**
     * Step 3: Rebuild LOCAL UI paramValues from scratch.
     * buildInitialValues() reads the store (now at factory defaults + new
     * scenario overrides), so paramValues will exactly match what is stored.
     * This completely replaces the old paramValues — no stale values survive.
     */
    const freshValues = buildInitialValues();

    /**
     * Step 4: Mirror parameterOverrides into localValues.
     * buildInitialValues reads from the store, which already has the overrides
     * applied. But we also mirror here explicitly for any edge-case timing issues
     * where the store may not have settled yet.
     */
    const scenarioValues = { ...freshValues };
    for (const override of scenario.parameterOverrides) {
      if (!scenarioValues[override.station])
        scenarioValues[override.station] = {};
      scenarioValues[override.station][override.parameter] = {
        /** Use formatNum to avoid trailing ".0" (e.g. 1238 not 1238.0). */
        value: formatNum(override.value),
        variation: override.driftLimit.toString(),
      };
    }

    /** Apply the fully rebuilt parameter values to local UI state. */
    setParamValues(scenarioValues);

    /**
     * NOTE: referenceValues is intentionally NOT updated here.
     * referenceValues always holds the factory-default values (set once when the
     * panel first opens). The color coding for each parameter input compares the
     * current value against the factory reference:
     *   green  = at reference (factory default)
     *   red    = above reference
     *   yellow = below reference
     * Updating referenceValues to scenarioValues would erase this distinction and
     * make all out-of-range scenario values appear green (= they match "reference").
     */

    /**
     * Clear dirty flags: switching scenarios is a clean state, not a custom edit.
     * ACTIVE badge returns to white (not orange), Update button is inactive.
     */
    setHasPendingUpdate(false);
    setHasCustomParams(false);
  }, []);

  // ── New Action Handlers ──────────────────────────────────────────────

  /**
   * handleGetDefaultParams — Restores the SELECTED MACHINE's parameters to the
   * active scenario's baseline values.
   *
   * Scope: only the machine currently visible in the right panel (selectedMachine).
   * Other machines are NOT touched — their edits are preserved.
   *
   * For SCN-000 (reference): resets selected machine to factory defaults.
   * For SCN-001..004: resets selected machine to its scenario parameterOverrides.
   * For 'conveyor' tab: resets conveyor fields to the scenario's conveyorSettings.
   *
   * Also writes the reset values to the store immediately (no Update needed).
   * Only clears hasPendingUpdate if no other machines have pending edits.
   */
  const handleGetDefaultParams = useCallback(() => {
    // ── Conveyor tab reset ──────────────────────────────────────────
    if (selectedMachine === "conveyor") {
      /**
       * Determine the default conveyor settings for the active scenario.
       * Falls back to REFERENCE_SCENARIO.conveyorSettings when no scenario is active.
       */
      const defaultConveyor =
        activeScenario?.conveyorSettings ?? REFERENCE_SCENARIO.conveyorSettings;

      /** Write all conveyor params (numeric AND boolean) to the store. */
      const {
        updateConveyorParam: ucParam,
        updateConveyorDriftLimit: ucDrift,
        updateConveyorBoolParam: ucBool,
      } = useSimulationDataStore.getState();
      ucParam("jammed_time", defaultConveyor.jammedTime);
      ucParam("impacted_tiles", defaultConveyor.impactedTiles);
      ucDrift("jammed_time", defaultConveyor.jammedTimeDrift);
      ucDrift("impacted_tiles", defaultConveyor.impactedTilesDrift);
      /**
       * Reset boolean toggles to the scenario's defaults.
       * Without this, Get Default Params would reset numeric params but leave
       * stale boolean toggle values in the store from a previous Update.
       */
      ucBool("speed_change", defaultConveyor.speedChange);
      ucBool("jammed_events", defaultConveyor.jammedEvents);

      /** Signal the ConveyorSettingsTable to re-sync its local state from effective settings. */
      conveyorResetRef.current?.();

      /** Clear dirty flags. */
      setHasPendingUpdate(false);
      setHasCustomParams(false);
      return;
    }

    // ── Machine tab reset ───────────────────────────────────────────
    /**
     * Determine the default parameter values for the selected machine.
     * Strategy:
     *   1. Start from factory defaults for this machine.
     *   2. Overlay any parameterOverrides from the active scenario for this machine.
     */
    const {
      resetToFactoryDefaults: rtfd,
      updateParameter: uParam,
      updateDriftLimit: uDrift,
    } = useSimulationDataStore.getState();

    /** Temporarily reset ALL to factory defaults so we can read fresh values. */
    rtfd();

    /**
     * Re-apply the active scenario's overrides to the store (all machines),
     * because resetToFactoryDefaults clears them.
     */
    if (activeScenario && activeScenario.id !== REFERENCE_SCENARIO.id) {
      useSimulationDataStore.getState().loadScenario(activeScenario);
    }

    /** Read the fresh full defaults that now include scenario-specific values. */
    const allFreshValues = buildInitialValues();

    /**
     * Extract only the selected machine's default values from the full snapshot.
     * If the machine has no override in the scenario, it uses factory defaults.
     */
    const machineFreshValues = allFreshValues[selectedMachine] ?? {};

    /** Write the reset values for ONLY the selected machine back to the store. */
    for (const [paramKey, pv] of Object.entries(machineFreshValues)) {
      const numValue = parseFloat(pv.value);
      const driftValue = parseFloat(pv.variation);
      if (!isNaN(numValue))
        uParam(
          selectedMachine as StationName,
          paramKey,
          numValue,
          "step",
          "operator",
        );
      if (!isNaN(driftValue))
        uDrift(selectedMachine as StationName, paramKey, driftValue);
    }

    /**
     * Update LOCAL UI state: replace ONLY the selected machine's slice with
     * the fresh defaults. All other machines' edits are preserved.
     */
    setParamValues((prev) => ({
      ...prev,
      [selectedMachine]: machineFreshValues,
    }));

    /** Clear dirty flags for this machine. */
    setHasPendingUpdate(false);
    setHasCustomParams(false);
  }, [activeScenario, selectedMachine]);

  /**
   * handleUpdate — Commits all pending local edits to the simulation store.
   *
   * Iterates every machine/parameter in paramValues and writes them via
   * updateParameter (value) and updateDriftLimit (variation %).
   * After commit: hasPendingUpdate = false (Update button returns to white).
   * hasCustomParams STAYS true — the simulation is using customised params.
   */
  const handleUpdate = useCallback(() => {
    /** Snapshot of current local param values to push to the store. */
    for (const [machineKey, machineParams] of Object.entries(paramValues)) {
      for (const [paramKey, pv] of Object.entries(machineParams)) {
        /** Numeric value parsed from the string input. */
        const numValue = parseFloat(pv.value);
        if (!isNaN(numValue)) {
          /** Commit the value to the simulation data store. */
          updateParameter(
            machineKey as StationName,
            paramKey,
            numValue,
            "step",
            "operator",
          );
        }
        /** Drift limit percentage parsed from the variation string. */
        const driftLimit = parseFloat(pv.variation);
        if (!isNaN(driftLimit) && driftLimit >= 0) {
          /** Commit the drift limit to the simulation data store. */
          updateDriftLimit(machineKey as StationName, paramKey, driftLimit);
        }
      }
    }

    /**
     * Write conveyor numeric params to the store.
     * conveyorGetValuesRef.current is set by ConveyorSettingsTable via
     * onRegisterGetValues — it returns the latest local state of the
     * two numeric params (jammed_time, impacted_tiles) plus their drift %.
     */
    if (conveyorGetValuesRef.current) {
      for (const {
        paramName,
        value,
        drift,
      } of conveyorGetValuesRef.current()) {
        /**
         * Route boolean conveyor params to updateConveyorBoolParam.
        /**
         * Boolean conveyor params (speed_change, jammed_events):
         *  - value: decoded from 0/1 back into boolean via updateConveyorBoolParam
         *  - drift: written to the store just like numeric params \u2014 NO skip
         * All 8 conveyor fields (4 values + 4 drifts) are committed here.
         */
        if (paramName === "speed_change" || paramName === "jammed_events") {
          /** Persist the boolean value. */
          updateConveyorBoolParam(paramName, value === 1);
          /** Persist the drift % \u2014 do NOT skip this. */
          if (!isNaN(drift) && drift >= 0) {
            updateConveyorDriftLimit(
              paramName as "speed_change" | "jammed_events",
              drift,
            );
          }
          continue;
        }

        /** Numeric params: write value and drift limit. */
        if (!isNaN(value)) {
          /** Write the conveyor param value to the store. */
          updateConveyorParam(
            paramName as "jammed_time" | "impacted_tiles",
            value,
          );
        }
        if (!isNaN(drift) && drift >= 0) {
          /** Write the conveyor drift limit to the store. */
          updateConveyorDriftLimit(
            paramName as "jammed_time" | "impacted_tiles",
            drift,
          );
        }
      }
    }
    /** Clear pending flag — all changes are now in the store. */
    setHasPendingUpdate(false);
    /** hasCustomParams intentionally NOT cleared: params are still customised. */

    /**
     * Work Order change detection:
     * If the user changed the Work Order while the panel was open, a full
     * factory reset is required because the production batch (tile count,
     * recipe, spawn counters) is tied to the Work Order.
     * After reset we reload the currently selected scenario and, if the
     * simulation was running before the panel opened, restart it.
     */
    const currentWoId = useWorkOrderStore.getState().selectedWorkOrderId;
    if (currentWoId !== originalWorkOrderIdRef.current) {
      /** Step 1: full factory reset (session end, store flush, counters clear) */
      void resetFactory().then(() => {
        /** Step 2: re-apply active scenario if one was selected */
        if (activeScenario) {
          const { resetToFactoryDefaults: rfd, loadScenario } =
            useSimulationDataStore.getState();
          rfd();
          if (activeScenario.id !== REFERENCE_SCENARIO.id) {
            loadScenario(activeScenario);
          }
        }
        /**
         * Step 3: restore the user's Work Order selection (resetFactory
         * preserves selectedWorkOrderId but clears runtime counters).
         */
        useWorkOrderStore.getState().setSelectedWorkOrderId(currentWoId);

        /** Step 4: restart simulation if it was running before panel opened */
        if (wasRunningBeforeOpenRef.current) {
          useSimulationStore.getState().toggleDataFlow();
        }

        /** Update snapshot so subsequent Update clicks are idempotent */
        originalWorkOrderIdRef.current = currentWoId;
      });
    }
  }, [
    paramValues,
    updateParameter,
    updateDriftLimit,
    activeScenario,
    resetFactory,
  ]);

  /**
   * handleReset — Restore ALL parameters to their factory defaults.
   *
   * This is an IN-PANEL reset: the panel stays open, the user can review
   * the restored defaults and press Update to commit them, or continue editing.
   *
   * What it does:
   *  1. Call resetToFactoryDefaults() to wipe machine params + conveyor params
   *     back to baseline values in the store.
   *  2. If a scenario was active (SCN-001..004), re-apply its overrides so the
   *     "active scenario defaults" are restored (not just raw factory defaults).
   *  3. Rebuild local UI state from the freshly reset store.
   *  4. Reset both dirty flags.
   *
   * What it does NOT do:
   *  - Does NOT call resetFactory() — that ends the Supabase session and
   *    closes the panel. Reset is NOT a full simulation reset.
   *  - Does NOT close the panel.
   *  - Does NOT restart the simulation.
   */
  const handleReset = useCallback(() => {
    const {
      resetToFactoryDefaults,
      loadScenario,
      activeScenario: storeScenario,
      updateConveyorParam: ucParam,
      updateConveyorDriftLimit: ucDrift,
      updateConveyorBoolParam: ucBool,
    } = useSimulationDataStore.getState();

    /** Step 1: wipe machine params + conveyor params to factory defaults. */
    resetToFactoryDefaults();

    /**
     * Step 2: re-apply active scenario overrides so parameter values reflect
     * the scenario's baseline (not raw factory defaults).
     * For SCN-000, parameterOverrides is empty → store stays at factory defaults.
     */
    if (storeScenario && storeScenario.id !== REFERENCE_SCENARIO.id) {
      loadScenario(storeScenario);
    }

    /**
     * Step 3: restore conveyor settings to the active scenario's defaults
     * (or REFERENCE_SCENARIO defaults if no scenario is active).
     * We write all 8 conveyor fields explicitly so the store is fully in sync.
     */
    const defaultConveyor = (storeScenario ?? REFERENCE_SCENARIO)
      .conveyorSettings;
    ucParam("jammed_time", defaultConveyor.jammedTime);
    ucParam("impacted_tiles", defaultConveyor.impactedTiles);
    ucDrift("jammed_time", defaultConveyor.jammedTimeDrift);
    ucDrift("impacted_tiles", defaultConveyor.impactedTilesDrift);
    ucBool("speed_change", defaultConveyor.speedChange);
    ucBool("jammed_events", defaultConveyor.jammedEvents);
    ucDrift("speed_change", defaultConveyor.speedChangeDrift);
    ucDrift("jammed_events", defaultConveyor.jammedEventsDrift);

    /** Step 4: rebuild local UI state from the now-reset store. */
    const freshValues = buildInitialValues();
    setParamValues(freshValues);
    setReferenceValues(freshValues);

    /** Step 5: signal ConveyorSettingsTable to re-sync its local fields. */
    conveyorResetRef.current?.();

    /** Step 6: clear both dirty flags. Panel stays open. */
    setHasPendingUpdate(false);
    setHasCustomParams(false);
  }, []);

  /**
   * NOTE: Escape key closing is intentionally disabled.
   * The panel can ONLY be closed via the "Done" button (handleClose).
   * This prevents accidental dismissal during parameter configuration.
   */

  // ── Don’t render when closed ────────────────────────────────────────────
  if (!isOpen) return null;

  /** The machine entry object for the currently selected sidebar tab. */
  const activeMachine =
    DEMO_SETTINGS_MACHINES.find((m) => m.key === selectedMachine) ??
    DEMO_SETTINGS_MACHINES[0];

  // Get params for current machine from config (if it's a real station)
  /** Station tooltip config for the selected machine (null for 'conveyor' tab). */
  const stationConfig =
    selectedMachine !== "conveyor"
      ? STATION_TOOLTIP_CONFIG[selectedMachine as StationName]
      : null;

  /** Parameter definitions for the selected machine. */
  const params: ParamDefinition[] = stationConfig?.params ?? [];
  /** Current local values for the selected machine's parameters. */
  const machineValues = paramValues[selectedMachine] ?? {};

  return (
    <>
      {/* Backdrop overlay — click-to-close intentionally disabled;
          only the Done button (handleClose) can dismiss the panel. */}
      <div className="fixed inset-0 z-300 bg-black/50 backdrop-blur-sm" />

      {/* Panel */}
      <div
        className="fixed z-301 flex flex-col overflow-hidden rounded-2xl border border-white/10 shadow-2xl"
        style={{
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: "clamp(360px, 78vw, 1400px)",
          height: "clamp(340px, 78vh, 920px)",
          background:
            "linear-gradient(135deg, rgba(12,14,18,0.97) 0%, rgba(8,10,14,0.99) 100%)",
          backdropFilter: "blur(24px) saturate(1.4)",
          WebkitBackdropFilter: "blur(24px) saturate(1.4)",
        }}
      >
        {/* ─── Header Bar ──────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-4 py-3 sm:px-6 sm:py-4 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-2 sm:gap-3">
            <Settings2 className="w-4 h-4 sm:w-5 sm:h-5 text-violet-400" />
            <h2 className="text-sm sm:text-lg font-bold text-white tracking-wide">
              Demo Settings
            </h2>
          </div>
          <button
            onClick={handleClose}
            className="px-3 py-1 rounded-lg text-xs sm:text-sm font-semibold text-emerald-400 hover:text-white hover:bg-emerald-500/20 border border-emerald-500/30 transition-colors"
          >
            Done
          </button>
        </div>

        {/* ─── Work Order Bar ──────────────────────────────────────────── */}
        {/* Displays Work Order selection (WorkID dropdown) and shows    */}
        {/* Order Quantity, Production Quantity, and Recipe Name windows  */}
        {/* above the scenario cards. WorkOrderBar manages its own state */}
        {/* via workOrderStore and reads data from lib/params/demo.ts.    */}
        <WorkOrderBar currentLang={currentLang} />

        {/* ─── Scenario Selector Cards ────────────────────────────────── */}
        <div className="flex gap-3 px-4 py-3 border-b border-white/10 overflow-x-auto shrink-0">
          {/* SCN-000: Reference Production card — now uses the same handleLoadScenario path */}
          <ScenarioCard
            key={REFERENCE_SCENARIO.id}
            scenario={REFERENCE_SCENARIO}
            isActive={activeScenarioId === REFERENCE_SCENARIO.id}
            currentLang={currentLang}
            onClick={() => handleLoadScenario(REFERENCE_SCENARIO)}
          />
          {/* SCN-001 through SCN-004: Defect scenario cards */}
          {SCENARIOS.map((scenario) => (
            <ScenarioCard
              key={scenario.id}
              scenario={scenario}
              isActive={activeScenarioId === scenario.id}
              currentLang={currentLang}
              onClick={() => handleLoadScenario(scenario)}
            />
          ))}
        </div>

        {/* ─── Impact Summary Bar (always visible — activeScenario set for all cards) ── */}
        {/*
         * All scenario cards (including SCN-000) now route through handleLoadScenario
         * → loadScenario, which always sets activeScenario. The bar is shown as soon
         * as a card is clicked. Values reflect the currently selected scenario.
         */}
        {activeScenario && (
          <div className="flex items-center border-b border-white/10 bg-white/2 overflow-x-auto shrink-0">
            {/*
             * Senaryo Etkisi label block:
             * Width matches the left machine-list sidebar: clamp(140px, 20vw, 240px).
             * border-right visually separates the title from the KPI pills.
             * self-stretch ensures full row height fill.
             */}
            <div
              className="flex items-center justify-center shrink-0 self-stretch
                         border-r border-white/10 bg-white/1.5"
              style={{ width: "clamp(140px, 20vw, 240px)" }}
            >
              <span
                className="text-[clamp(0.55rem,0.9vw,0.75rem)] font-semibold
                           text-white/50 uppercase tracking-widest"
              >
                {/* Bilingual label — responds to language selection */}
                {scenarioTranslations.scenarioImpact[currentLang]}
              </span>
            </div>
            {/* ─ KPI pills — driven by activeScenario (covers SCN-000 and SCN-001..004) ─ */}
            <div className="flex items-center gap-3 px-4 py-2">
              <ImpactPill
                label="OEE"
                value={`${activeScenario.expectedOEERange.min}–${activeScenario.expectedOEERange.max}%`}
                color={
                  SCENARIO_SEVERITY_COLORS[
                    activeScenario.expectedOEERange.min >= 80
                      ? "low"
                      : activeScenario.expectedOEERange.min >= 60
                        ? "high"
                        : "critical"
                  ]
                }
              />
              <ImpactPill
                label="Scrap"
                value={`${activeScenario.expectedScrapRange.min}–${activeScenario.expectedScrapRange.max}%`}
                color={
                  SCENARIO_SEVERITY_COLORS[
                    activeScenario.expectedScrapRange.max <= 10
                      ? "low"
                      : activeScenario.expectedScrapRange.max <= 30
                        ? "high"
                        : "critical"
                  ]
                }
              />
              <ImpactPill
                label="Energy"
                value={`+${activeScenario.expectedEnergyImpact.min}–${activeScenario.expectedEnergyImpact.max}%`}
                color={
                  SCENARIO_SEVERITY_COLORS[
                    activeScenario.expectedEnergyImpact.max <= 5
                      ? "low"
                      : activeScenario.expectedEnergyImpact.max <= 15
                        ? "high"
                        : "critical"
                  ]
                }
              />
              <ImpactPill
                label={scenarioTranslations.severity[currentLang]}
                value={activeScenario.severity.toUpperCase()}
                color={SCENARIO_SEVERITY_COLORS[activeScenario.severity]}
              />
            </div>
            {/*
             * Right section of the Senaryo Etkisi bar.
             * Contains: ACTIVE label (orange=customized), Get DefaultParams,
             * Update (orange=pending), and Reset buttons.
             * ml-auto pushes it to the far right of the flex container.
             */}
            <div className="flex items-center gap-2 px-4 py-2 ml-auto shrink-0 border-l border-white/10">
              {/*
               * ACTIVE scenario label: shows the currently active scenario code.
               * Color: orange (#F97316) when hasCustomParams=true (user has deviated
               * from the scenario's original defaults, even after pressing Update).
               * Color: white/50 when no customisation exists.
               */}
              <span
                className="text-[clamp(0.55rem,0.9vw,0.72rem)] font-bold uppercase tracking-wider px-2 py-1 rounded"
                style={{
                  color: hasCustomParams ? "#F97316" : "rgba(255,255,255,0.6)",
                  backgroundColor: hasCustomParams
                    ? "rgba(249,115,22,0.1)"
                    : "rgba(255,255,255,0.04)",
                  border: `1px solid ${hasCustomParams ? "rgba(249,115,22,0.3)" : "rgba(255,255,255,0.08)"}`,
                  transition:
                    "color 0.2s, background-color 0.2s, border-color 0.2s",
                }}
              >
                {/* Active scenario code — e.g., "ACTIVE: SCN-000" */}
                ACTIVE: {activeScenario.code}
              </span>

              {/*
               * Get DefaultParams button: restores the active scenario's
               * factory-default parameter values for all machines and auto-commits
               * to the store. Clears both hasPendingUpdate and hasCustomParams.
               */}
              <button
                onClick={handleGetDefaultParams}
                title="Restore active scenario factory defaults for all machines"
                className="px-2.5 py-1 rounded text-[clamp(0.5rem,0.82vw,0.68rem)] font-semibold uppercase tracking-wide
                           bg-white/6 border border-white/10 text-white/60
                           hover:bg-white/10 hover:text-white hover:border-white/20
                           transition-all duration-200 whitespace-nowrap"
              >
                Get DefaultParams
              </button>

              {/*
               * Update button: commits all pending local table edits to the simulator.
               * Turns orange (hasPendingUpdate=true) when the user has changed a value
               * but hasn't pressed Update yet. Returns to white after Update.
               */}
              <button
                onClick={handleUpdate}
                disabled={!hasPendingUpdate}
                title={
                  hasPendingUpdate
                    ? "Commit pending parameter changes to the simulator"
                    : "No changes to commit"
                }
                className={`px-2.5 py-1 rounded text-[clamp(0.5rem,0.82vw,0.68rem)] font-semibold uppercase tracking-wide
                           border transition-all duration-200 whitespace-nowrap
                           ${!hasPendingUpdate ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`}
                style={{
                  backgroundColor: hasPendingUpdate
                    ? "rgba(249,115,22,0.15)"
                    : "rgba(255,255,255,0.06)",
                  borderColor: hasPendingUpdate
                    ? "rgba(249,115,22,0.4)"
                    : "rgba(255,255,255,0.10)",
                  color: hasPendingUpdate ? "#F97316" : "rgba(255,255,255,0.6)",
                }}
              >
                Update{hasPendingUpdate ? " ●" : ""}
              </button>

              {/*
               * Reset button: performs full factory reset + reloads active scenario
               * defaults. CRITICAL: simulation is NEVER restarted here. Only the
               * Header's Start Simulation button can start the simulation.
               */}
              <button
                onClick={handleReset}
                title="Full factory reset — simulation stays stopped"
                className="px-2.5 py-1 rounded text-[clamp(0.5rem,0.82vw,0.68rem)] font-semibold uppercase tracking-wide
                           bg-red-500/10 border border-red-500/20 text-red-400
                           hover:bg-red-500/20 hover:border-red-500/40 hover:text-red-300
                           transition-all duration-200 whitespace-nowrap"
              >
                Reset SCN
              </button>
            </div>
          </div>
        )}

        {/* ─── Body: Sidebar + Content ─────────────────────────────────── */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left Sidebar — Machine List */}
          <nav
            className="flex flex-col gap-1 p-2 sm:p-3 border-r border-white/10 overflow-y-auto shrink-0"
            style={{ width: "clamp(140px, 20vw, 240px)" }}
          >
            {DEMO_SETTINGS_MACHINES.map((machine) => {
              /** Whether this machine tab is currently selected. */
              const isActive = machine.key === selectedMachine;
              return (
                <button
                  key={machine.key}
                  onClick={() => setSelectedMachine(machine.key)}
                  className={`
                    flex items-center gap-2 sm:gap-3 px-3 py-2 sm:px-4 sm:py-2.5
                    rounded-xl text-left text-xs sm:text-sm font-medium
                    transition-all duration-200 group
                    ${
                      isActive
                        ? "bg-white/10 text-white shadow-inner"
                        : "text-white/50 hover:text-white/80 hover:bg-white/4"
                    }
                  `}
                  style={
                    isActive
                      ? {
                          borderLeft: `3px solid ${machine.color}`,
                          boxShadow: `inset 4px 0 12px -4px ${machine.color}30`,
                        }
                      : { borderLeft: "3px solid transparent" }
                  }
                >
                  <span
                    className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full shrink-0 transition-transform duration-200 group-hover:scale-110"
                    style={{
                      backgroundColor: machine.color,
                      opacity: isActive ? 1 : 0.5,
                    }}
                  />
                  <span className="truncate">{machine.label}</span>
                </button>
              );
            })}
          </nav>

          {/* ─── Right Content Area ─────────────────────────────────────── */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6">
            {/* Machine Title */}
            <div className="flex items-center gap-3 mb-4">
              <span
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: activeMachine.color }}
              />
              <h3 className="text-base sm:text-xl font-bold text-white">
                {activeMachine.label}
              </h3>
            </div>

            {/* ── Parameter Table (for machine stations) ─────────────── */}
            {params.length > 0 ? (
              <div className="overflow-x-auto rounded-xl border border-white/6">
                <table className="w-full border-collapse text-[clamp(0.6rem,1vw,0.8rem)]">
                  <thead>
                    <tr className="bg-white/4 text-white/40 uppercase tracking-wider text-[clamp(0.5rem,0.85vw,0.7rem)]">
                      <th className="text-left py-2.5 px-3 sm:px-4 font-medium">
                        {scenarioTranslations.parameter[currentLang]}
                      </th>
                      <th className="text-center py-2.5 px-2 sm:px-3 font-medium">
                        Range
                      </th>
                      <th className="text-center py-2.5 px-2 sm:px-3 font-medium">
                        Unit
                      </th>
                      <th className="text-center py-2.5 px-2 sm:px-3 font-medium">
                        Value
                      </th>
                      <th className="text-center py-2.5 px-2 sm:px-3 font-medium">
                        <span className="flex items-center justify-center gap-1">
                          <span>Δ %</span>
                          {/*
                           * "→ Update!" badge — appears with a pulse animation
                           * whenever hasPendingUpdate is true (i.e. the user has
                           * edited a Value or Drift cell but hasn't pressed Update
                           * yet). This is the #3 improvement: visible reminder that
                           * local changes must be committed via the Update button.
                           */}
                          {hasPendingUpdate && (
                            <span
                              className="animate-pulse text-orange-400 font-bold normal-case tracking-normal"
                              style={{
                                fontSize: "clamp(0.4rem, 0.7vw, 0.55rem)",
                              }}
                            >
                              → Update!
                            </span>
                          )}
                        </span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {params.map((param, idx) => {
                      /** Current values for this parameter from local state. */
                      const pv = machineValues[param.key] ?? {
                        value: "",
                        variation: String(DEFAULT_DRIFT_LIMIT),
                      };
                      /** Formatted range string (e.g., "280 – 450"). */
                      const rangeStr = param.range
                        ? `${param.range.min} – ${param.range.max}`
                        : "—";

                      /**
                       * Parse the current numeric value for range + reference comparison.
                       * Used by both the ⚠️ out-of-range indicator and the color-coded styling.
                       */
                      const currentNum = parseFloat(pv.value);

                      /**
                       * Dynamic out-of-range check: compare the current user-entered value
                       * against this parameter's defined min–max range.
                       * Unlike the previous static `isOutOfRange` scenario flag, this updates
                       * live as the user edits the value input.
                       */
                      const outOfRange =
                        param.range != null &&
                        !isNaN(currentNum) &&
                        (currentNum < param.range.min ||
                          currentNum > param.range.max);

                      /**
                       * Determine the color class for the Value input:
                       *  - Green: value matches reference (factory default)
                       *  - Red: value is above reference
                       *  - Yellow: value is below reference
                       * Compares the current numeric value against the stored reference value.
                       */
                      const refVal =
                        referenceValues?.[selectedMachine]?.[param.key]?.value;
                      const refNum =
                        refVal !== undefined ? parseFloat(refVal) : NaN;

                      let valueColorClass: string;
                      if (
                        isNaN(currentNum) ||
                        isNaN(refNum) ||
                        currentNum === refNum
                      ) {
                        /** Green — value is at factory reference */
                        valueColorClass =
                          "border-green-500/50 text-green-300 focus:border-green-400/70 focus:ring-green-400/20";
                      } else if (currentNum > refNum) {
                        /** Red — value is above reference */
                        valueColorClass =
                          "border-red-500/50 text-red-400 focus:border-red-400/70 focus:ring-red-400/20";
                      } else {
                        /** Yellow — value is below reference */
                        valueColorClass =
                          "border-yellow-500/50 text-yellow-300 focus:border-yellow-400/70 focus:ring-yellow-400/20";
                      }

                      return (
                        <tr
                          key={param.key}
                          className={`
                            border-t border-white/4 transition-colors
                            hover:bg-white/3
                            ${idx % 2 === 0 ? "bg-transparent" : "bg-white/1.5"}
                          `}
                        >
                          {/* Parameter Name — with ⚠️ indicator if out of range */}
                          <td className="py-2 px-3 sm:px-4 text-white/80 font-medium whitespace-nowrap">
                            {param.label[currentLang]}
                            {outOfRange && (
                              <span
                                className="ml-1.5 text-red-400 text-[10px]"
                                title={
                                  translations.demoSettingsExtra.outOfRange[
                                    currentLang
                                  ]
                                }
                              >
                                ⚠️
                              </span>
                            )}
                          </td>

                          {/* Range */}
                          <td className="py-2 px-2 sm:px-3 text-center text-white/40 font-mono tabular-nums whitespace-nowrap">
                            {rangeStr}
                          </td>

                          {/* Unit */}
                          <td className="py-2 px-2 sm:px-3 text-center text-white/30 whitespace-nowrap">
                            {param.unit}
                          </td>

                          {/* Editable Value — color changes based on out-of-range / modified state */}
                          <td className="py-1.5 px-2 sm:px-3 text-center">
                            <input
                              type="number"
                              value={pv.value}
                              onChange={(e) =>
                                updateParamField(
                                  selectedMachine,
                                  param.key,
                                  "value",
                                  e.target.value,
                                )
                              }
                              className={`w-full max-w-[100px] mx-auto bg-white/6 border rounded-lg px-2 py-1.5
                                         text-center font-mono tabular-nums
                                         text-[clamp(0.55rem,0.95vw,0.75rem)]
                                         focus:outline-none focus:ring-1
                                         hover:border-white/20 transition-colors
                                         [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none
                                         ${valueColorClass}`}
                              step="any"
                            />
                          </td>

                          {/* Editable Variation % */}
                          <td className="py-1.5 px-2 sm:px-3 text-center">
                            <div className="flex items-center justify-center gap-1 max-w-[90px] mx-auto">
                              <input
                                type="number"
                                value={pv.variation}
                                onChange={(e) =>
                                  updateParamField(
                                    selectedMachine,
                                    param.key,
                                    "variation",
                                    e.target.value,
                                  )
                                }
                                className={`w-full bg-white/6 border rounded-lg px-2 py-1.5
                                         text-center font-mono tabular-nums
                                         text-[clamp(0.55rem,0.95vw,0.75rem)]
                                         focus:outline-none focus:ring-1
                                         hover:border-white/20 transition-colors
                                         [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none
                                         ${valueColorClass}`}
                                step="0.5"
                                min="0"
                                max="100"
                              />
                              {/* % span inherits same color as Value cell */}
                              <span
                                className={`text-[clamp(0.5rem,0.85vw,0.7rem)] shrink-0 ${
                                  valueColorClass.includes("green")
                                    ? "text-green-300/60"
                                    : valueColorClass.includes("red")
                                      ? "text-red-400/60"
                                      : "text-yellow-300/60"
                                }`}
                              >
                                %
                              </span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : selectedMachine === "conveyor" ? (
              <ConveyorSettingsTable
                referenceSettings={REFERENCE_SCENARIO.conveyorSettings}
                activeSettings={activeScenario?.conveyorSettings ?? null}
                currentLang={currentLang}
                onDirty={() => setHasPendingUpdate(true)}
                onCustomize={() => setHasCustomParams(true)}
                onRegisterReset={(fn) => {
                  conveyorResetRef.current = fn;
                }}
                onRegisterGetValues={(fn) => {
                  conveyorGetValuesRef.current = fn;
                }}
              />
            ) : null}

            {/* ─── Cause-Effect Reference Table (standalone component) ── */}
            <CauseEffectTable
              selectedMachine={selectedMachine}
              paramValues={paramValues}
              currentLang={currentLang}
            />
          </div>
        </div>
      </div>
    </>
  );
};
