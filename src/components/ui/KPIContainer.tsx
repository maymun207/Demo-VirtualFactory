/**
 * KPIContainer.tsx — Key Performance Indicators Display Panel
 *
 * A draggable floating panel that shows 6 KPI cards (OEE, FTQ, Scrap,
 * Energy, Gas, CO₂). Each card displays:
 *  - Bilingual label and unit
 *  - Current value (formatted string)
 *  - Trend arrow with delta percentage
 *  - Color coding: green for up trends, red for down trends
 *
 * Data sourced from kpiStore (updated by useKPISync hook).
 * Wrapped in DraggablePanel for consistent drag/resize behavior.
 * Used by: Dashboard.tsx
 */
import { useKPIStore } from "../../store/kpiStore";
import { useUIStore } from "../../store/uiStore";
import { useTranslation } from "../../hooks/useTranslation";
import { DraggablePanel } from "./DraggablePanel";

export const KPIContainer = () => {
  const kpis = useKPIStore((s) => s.kpis);
  const currentLang = useUIStore((s) => s.currentLang);
  const showKPI = useUIStore((s) => s.showKPI);
  const toggleKPI = useUIStore((s) => s.toggleKPI);
  const t = useTranslation("kpiPane");

  return (
    <DraggablePanel
      panelIndex={1}
      title={t("title")}
      visible={showKPI}
      onClose={toggleKPI}
    >
      {/* KPI Cards */}
      <div className="space-y-1.5">
        {kpis.map((kpi) => (
          <div
            key={kpi.id}
            className="flex items-center justify-between py-1.5 px-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
          >
            <div>
              <span className="text-[0.5625rem] text-white/60 block leading-tight">
                {kpi.label[currentLang]}
              </span>
              <span className="text-sm font-mono font-bold text-white leading-tight">
                {kpi.value}
                <span className="text-[0.5rem] text-white/40 ml-0.5">
                  {kpi.unit}
                </span>
              </span>
            </div>
            <span
              className={`text-[10px] font-mono ${
                kpi.trendDirection === "up" ? "text-green-400" : "text-red-400"
              }`}
            >
              {kpi.trend[currentLang]}
            </span>
          </div>
        ))}
      </div>
    </DraggablePanel>
  );
};
