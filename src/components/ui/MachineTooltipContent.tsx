/**
 * MachineTooltipContent.tsx — Parameter Table for Machine Hover Tooltip
 *
 * Renders a modern, professional parameter table for a given station:
 *  - Parameter name (bilingual)
 *  - Current value (color-coded by deviation from optimal range)
 *  - Range (min–max with unit)
 *
 * Color coding:
 *  - Green: value is within optimal range
 *  - Yellow: value is near the edge of the range (>80% of half-range from center)
 *  - Red: value is outside optimal range
 *
 * Data sourced from simulationDataStore.currentParams via useMemo + getState()
 * to avoid getSnapshot caching issues.
 *
 * Used by: MachineTooltip.tsx
 */
import { useSimulationDataStore } from "../../store/simulationDataStore";
import { useUIStore } from "../../store/uiStore";
import type { StationName } from "../../store/types";
import {
  STATION_TOOLTIP_CONFIG,
  type ParamDefinition,
} from "./machineTooltipConfig";
import { translations } from "../../lib/translations";

// =============================================================================
// VALUE COLOR LOGIC
// =============================================================================

/**
 * Determine the color class for a parameter value based on its range.
 * Returns a Tailwind text color class.
 */
function getValueColor(value: number, range: ParamDefinition["range"]): string {
  if (!range) return "text-white/70";

  const { min, max } = range;
  const mid = (min + max) / 2;
  const halfRange = (max - min) / 2;

  if (halfRange === 0) return "text-white/70";

  // Normalized deviation: 0 = center, 1 = edge
  const deviation = Math.abs(value - mid) / halfRange;

  if (deviation > 1) return "text-red-400"; // Outside range
  if (deviation > 0.8) return "text-yellow-400"; // Near edge (warning)
  return "text-emerald-400"; // In range (healthy)
}

/**
 * Get the background indicator dot color for the status column.
 */
function getStatusDot(value: number, range: ParamDefinition["range"]): string {
  if (!range) return "bg-white/20";

  const { min, max } = range;
  const mid = (min + max) / 2;
  const halfRange = (max - min) / 2;
  if (halfRange === 0) return "bg-white/20";

  const deviation = Math.abs(value - mid) / halfRange;

  if (deviation > 1) return "bg-red-400";
  if (deviation > 0.8) return "bg-yellow-400";
  return "bg-emerald-400";
}

/**
 * Format a number for display (smart precision).
 */
function formatValue(value: number): string {
  if (Number.isInteger(value)) return value.toString();
  if (Math.abs(value) >= 100) return value.toFixed(1);
  if (Math.abs(value) >= 10) return value.toFixed(2);
  return value.toFixed(3);
}

// =============================================================================
// COMPONENT
// =============================================================================

interface Props {
  /** Which station's parameters to display. */
  station: StationName;
}

export const MachineTooltipContent = ({ station }: Props) => {
  const currentLang = useUIStore((s) => s.currentLang);

  // Subscribe directly to currentParams for this station to ensure live updates
  const params = useSimulationDataStore(
    (s) => s.currentParams[station] as Record<string, unknown>,
  );

  const config = STATION_TOOLTIP_CONFIG[station];
  if (!config) return null;

  return (
    <div className="w-full">
      {/* Station Header */}
      <div className="flex items-center gap-2 mb-2 pb-2 border-b border-white/10">
        <div
          className="w-2.5 h-2.5 rounded-full shrink-0"
          style={{ backgroundColor: config.color }}
        />
        <span className="font-semibold text-white text-[clamp(0.65rem,1.2vw,0.85rem)] tracking-wide uppercase">
          {config.name[currentLang]}
        </span>
      </div>

      {/* Parameter Table — 4 columns: Name | Value (right) | Unit (left) | Range */}
      <table className="w-full border-collapse">
        <thead>
          <tr className="text-white/40 text-[clamp(0.5rem,0.9vw,0.65rem)] uppercase tracking-wider">
            <th className="text-left pb-1.5 pr-2 font-medium">
              {translations.machineTooltip.parameter[currentLang]}
            </th>
            <th className="text-right pb-1.5 pr-0.5 font-medium">
              {translations.machineTooltip.value[currentLang]}
            </th>
            <th className="text-left pb-1.5 pl-1 font-medium">
              {translations.machineTooltip.unit[currentLang]}
            </th>
            <th className="text-right pb-1.5 pl-2 font-medium">
              {translations.machineTooltip.range[currentLang]}
            </th>
          </tr>
        </thead>
        <tbody>
          {config.params.map((param) => {
            const rawValue = params?.[param.key];
            const numValue =
              typeof rawValue === "number" ? rawValue : undefined;

            return (
              <tr
                key={param.key}
                className="group border-t border-white/[0.04] hover:bg-white/[0.03] transition-colors"
              >
                {/* Parameter Name */}
                <td className="py-1 pr-2 text-[clamp(0.5rem,1vw,0.7rem)] text-white/60 group-hover:text-white/80 transition-colors">
                  <div className="flex items-center gap-1.5">
                    {numValue !== undefined && (
                      <div
                        className={`w-1.5 h-1.5 rounded-full shrink-0 ${getStatusDot(numValue, param.range)}`}
                      />
                    )}
                    <span>{param.label[currentLang]}</span>
                  </div>
                </td>

                {/* Current Value — right-aligned number only */}
                <td
                  className={`py-1 pr-0.5 text-right font-mono font-bold tabular-nums text-[clamp(0.55rem,1vw,0.75rem)] ${
                    numValue !== undefined
                      ? getValueColor(numValue, param.range)
                      : "text-white/30"
                  }`}
                >
                  {numValue !== undefined ? formatValue(numValue) : "—"}
                </td>

                {/* Unit — left-aligned, separate column */}
                <td className="py-1 pl-1 text-left text-white/30 font-normal text-[clamp(0.4rem,0.8vw,0.55rem)] whitespace-nowrap">
                  {numValue !== undefined ? param.unit : ""}
                </td>

                {/* Range */}
                <td className="py-1 pl-2 text-right font-mono text-[clamp(0.45rem,0.85vw,0.6rem)] text-white/30 whitespace-nowrap">
                  {param.range ? `${param.range.min}–${param.range.max}` : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
