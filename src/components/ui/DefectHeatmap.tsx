/**
 * DefectHeatmap.tsx — Defect Visualization Heatmap Panel
 *
 * A draggable floating panel that displays tile defect types as a
 * color-coded heatmap. Defect values are jittered each tick by
 * randomizeDefects() for animated visual effect.
 *
 * Color thresholds (from params.ts):
 *  - ≥ DEFECT_THRESHOLD_HIGH → red (critical)
 *  - ≥ DEFECT_THRESHOLD_MEDIUM → orange (warning)
 *  - < DEFECT_THRESHOLD_MEDIUM → green (normal)
 *
 * Data sourced from kpiStore.defects.
 * Wrapped in DraggablePanel for consistent drag/resize behavior.
 * Used by: Dashboard.tsx
 */
import { useKPIStore } from "../../store/kpiStore";
import { useUIStore } from "../../store/uiStore";
import { useTranslation } from "../../hooks/useTranslation";
import { DraggablePanel } from "./DraggablePanel";
import {
  DEFECT_THRESHOLD_HIGH,
  DEFECT_THRESHOLD_MEDIUM,
} from "../../lib/params";

export const DefectHeatmap = () => {
  const defects = useKPIStore((s) => s.defects);
  const showHeatmap = useUIStore((s) => s.showHeatmap);
  const toggleHeatmap = useUIStore((s) => s.toggleHeatmap);
  const currentLang = useUIStore((s) => s.currentLang);

  const t = useTranslation("defects");

  const getDefectColor = (value: number) => {
    if (value >= DEFECT_THRESHOLD_HIGH)
      return "text-red-400 bg-red-500/10 border-red-500/30";
    if (value >= DEFECT_THRESHOLD_MEDIUM)
      return "text-orange-400 bg-orange-500/10 border-orange-500/30";
    return "text-green-400 bg-green-500/10 border-green-500/30";
  };

  return (
    <DraggablePanel
      panelIndex={2}
      title={t("title")}
      visible={showHeatmap}
      onClose={toggleHeatmap}
    >
      {/* Defect Grid */}
      <div className="grid grid-cols-2 gap-2">
        {defects.map((defect) => (
          <div
            key={defect.name}
            className={`p-2.5 rounded-lg border ${getDefectColor(defect.value)} transition-all duration-300`}
          >
            <div className="text-[0.625rem] opacity-70 mb-1">
              {defect.label[currentLang] || defect.name}
            </div>
            <div className="text-base font-mono font-bold">
              {defect.value.toFixed(1)}%
            </div>
          </div>
        ))}
      </div>
    </DraggablePanel>
  );
};
