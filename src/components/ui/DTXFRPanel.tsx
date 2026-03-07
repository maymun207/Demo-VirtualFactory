/**
 * DTXFRPanel.tsx — Digital Transfer Tile Passport (Left-Docked Side Panel)
 *
 * Left-docked side panel that shows the Tile Passport content.
 * Mirrors the CWFChatPanel's right-docked layout but on the left side:
 *  - Resize handle on the RIGHT edge (vs CWF's left edge)
 *  - Glassmorphic "Sentient Dark" theme with emerald gradient accents
 *  - Full Tile Passport detail view (tile number, quality, station history)
 *  - Close button, drag-to-resize, touch support
 *
 * The panel pushes the main content area to the right when open,
 * symmetric to how CWF pushes content to the left.
 *
 * Used by: App.tsx (directly, not via Dashboard)
 */
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { X, FileText } from "lucide-react";
import { useUIStore } from "../../store/uiStore";
import { useSimulationDataStore } from "../../store/simulationDataStore";
import { useSimulationStore } from "../../store/simulationStore";
import { useWorkOrderStore } from "../../store/workOrderStore";
import { useTranslation } from "../../hooks/useTranslation";
import { WORK_ORDERS, RECIPES } from "../../lib/params/demo";
import { DTXFR_SIDE_PANEL_HANDLE_WIDTH } from "../../lib/params";

// ─── Grade Colors & Labels ───────────────────────────────────────────────────

/** Color mapping for quality grades. */
const GRADE_COLORS: Record<string, string> = {
  first_quality: "text-green-400",
  second_quality: "text-yellow-400",
  third_quality: "text-orange-400",
  scrap: "text-red-400",
  in_progress: "text-emerald-400",
};

/** Human-readable labels for quality grades. */
const GRADE_LABELS: Record<string, Record<string, string>> = {
  first_quality: { tr: "1. Kalite", en: "First Quality" },
  second_quality: { tr: "2. Kalite", en: "Second Quality" },
  third_quality: { tr: "3. Kalite", en: "Third Quality" },
  scrap: { tr: "Hurda", en: "Scrap" },
  in_progress: { tr: "Üretimde", en: "In Progress" },
};

/** Station display names (bilingual). */
const STATION_LABELS: Record<string, Record<string, string>> = {
  press: { tr: "Pres", en: "Press" },
  dryer: { tr: "Kurutma", en: "Dryer" },
  glaze: { tr: "Sırlama", en: "Glaze" },
  printer: { tr: "Baskı", en: "Printer" },
  kiln: { tr: "Fırın", en: "Kiln" },
  sorting: { tr: "Seçme", en: "Sorting" },
  packaging: { tr: "Paketleme", en: "Packaging" },
};

/**
 * Human-readable bilingual labels for every DefectType value.
 * Shown as small pills inside the Station History row when a defect is detected.
 */
const DEFECT_TYPE_LABELS: Record<string, Record<string, string>> = {
  crack_press: { tr: "Çatlak (Pres)", en: "Crack (Press)" },
  delamination: { tr: "Delaminasyon", en: "Delamination" },
  dimension_variance: { tr: "Boyut Sapması", en: "Dimension Variance" },
  density_variance: { tr: "Yoğunluk Sapması", en: "Density Variance" },
  edge_defect: { tr: "Kenar Hatası", en: "Edge Defect" },
  press_explosion: { tr: "Pres Patlaması", en: "Press Explosion" },
  surface_crack_dry: { tr: "Yüzey Çatlağı", en: "Surface Crack" },
  warp_dry: { tr: "Eğilme (Kurutma)", en: "Warp (Dry)" },
  explosion_dry: { tr: "Patlama (Kurutma)", en: "Explosion (Dry)" },
  color_tone_variance: { tr: "Ton Sapması", en: "Color Tone Variance" },
  glaze_thickness_variance: {
    tr: "Sır Kalınlık Sapması",
    en: "Glaze Thickness Variance",
  },
  pinhole_glaze: { tr: "Sır İğne Deliği", en: "Pinhole (Glaze)" },
  glaze_drip: { tr: "Sır Damlaması", en: "Glaze Drip" },
  line_defect_glaze: { tr: "Çizgi Hatası (Sır)", en: "Line Defect (Glaze)" },
  edge_buildup: { tr: "Kenar Birikmesi", en: "Edge Buildup" },
  line_defect_print: { tr: "Çizgi Hatası (Baskı)", en: "Line Defect (Print)" },
  white_spot: { tr: "Beyaz Nokta", en: "White Spot" },
  color_shift: { tr: "Renk Kayması", en: "Color Shift" },
  saturation_variance: { tr: "Doygunluk Sapması", en: "Saturation Variance" },
  blur: { tr: "Bulanıklık", en: "Blur" },
  pattern_stretch: { tr: "Desen Uzaması", en: "Pattern Stretch" },
  pattern_compress: { tr: "Desen Sıkışması", en: "Pattern Compress" },
  crack_kiln: { tr: "Çatlak (Fırın)", en: "Crack (Kiln)" },
  warp_kiln: { tr: "Eğilme (Fırın)", en: "Warp (Kiln)" },
  corner_lift: { tr: "Köşe Kalkması", en: "Corner Lift" },
  pinhole_kiln: { tr: "İğne Deliği (Fırın)", en: "Pinhole (Kiln)" },
  color_fade: { tr: "Renk Solması", en: "Color Fade" },
  size_variance_kiln: {
    tr: "Boyut Sapması (Fırın)",
    en: "Size Variance (Kiln)",
  },
  thermal_shock_crack: { tr: "Termal Şok Çatlağı", en: "Thermal Shock Crack" },
  chip: { tr: "Kıymık", en: "Chip" },
  edge_crack_pack: { tr: "Kenar Çatlağı", en: "Edge Crack" },
  crush_damage: { tr: "Ezilme Hasarı", en: "Crush Damage" },
  conveyor_jam_damage: { tr: "Konveyör Hasarı", en: "Conveyor Damage" },
  surface_defect: { tr: "Yüzey Hatası", en: "Surface Defect" },
  mold_sticking: { tr: "Kalıp Yapışması", en: "Mold Sticking" },
  lamination: { tr: "Laminasyon", en: "Lamination" },
  moisture_variance: { tr: "Nem Sapması", en: "Moisture Variance" },
  glaze_peel: { tr: "Sır Soyulması", en: "Glaze Peel" },
  banding: { tr: "Bant Hatası", en: "Banding" },
  pattern_distortion: { tr: "Desen Bozulması", en: "Pattern Distortion" },
  missed_defect: { tr: "Kaçan Hata", en: "Missed Defect" },
  false_pass: { tr: "Yanlış Geçiş", en: "False Pass" },
  warp_pass: { tr: "Eğilik Geçişi", en: "Warp Pass" },
  mislabel: { tr: "Yanlış Etiket", en: "Mislabel" },
  customer_complaint: { tr: "Müşteri Şikayeti", en: "Customer Complaint" },
};

// ─── Main Panel ──────────────────────────────────────────────────────────────

/**
 * DTXFRPanel — Left-docked side panel with drag-to-resize.
 *
 * Occupies the full viewport height on the left side.
 * The right edge has a draggable resize handle that updates
 * dtxfrPanelWidth in uiStore.
 *
 * Rendered directly by App.tsx (not inside Dashboard).
 */
export function DTXFRPanel() {
  /** Translation accessor for tile passport strings */
  const t = useTranslation("tilePassport");
  /** Extra translation keys for tile passport */
  const tExtra = useTranslation("tilePassportExtra");
  /** Current UI language for bilingual content */
  const currentLang = useUIStore((s) => s.currentLang);
  /** Toggle function to show/hide the DTXFR panel */
  const toggleDTXFR = useUIStore((s) => s.toggleDTXFR);
  /** Whether the Production Table is currently visible */
  const showProductionTable = useUIStore((s) => s.showProductionTable);
  /** Whether the OEE Hierarchy table is currently visible */
  const showOEEHierarchy = useUIStore((s) => s.showOEEHierarchy);
  /** Setter for the DTXFR panel width (clamped in the store) */
  const setDtxfrPanelWidth = useUIStore((s) => s.setDtxfrPanelWidth);

  /** Whether the user is currently dragging the resize handle */
  const isDragging = useRef(false);

  // ─── Tile Passport Data ──────────────────────────────────────────────

  /** Current simulation clock tick count — drives reactivity */
  const pClockCount = useSimulationStore((s) => s.pClockCount);
  /** Whether the simulation data flow is active */
  const isDataFlowing = useSimulationStore((s) => s.isDataFlowing);

  /** Read tile counters imperatively from the data store on each render */
  const dataSnapshot = useMemo(() => {
    const s = useSimulationDataStore.getState();
    return {
      tileCounter: s.tileCounter,
      conveyorSize: s.conveyorPositions.size,
      totalScrapped: s.totalTilesScrapped,
      sessionCode: s.sessionCode,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pClockCount]);

  /**
   * CUMULATIVE COUNTER: Read totalTilesProduced directly.
   * Reactive selector ensures immediate UI updates when tiles complete.
   * Matches the approach used by the 3D quality boxes.
   */
  const totalProduced = useSimulationDataStore((s) => s.totalTilesProduced);

  const { tileCounter, conveyorSize, sessionCode } = dataSnapshot;

  /** Manual Tile Number handling — empty = Live Tracking mode */
  const [manualInput, setManualInput] = useState("");
  /** Consecutive Backspace counter for clearing manual input */
  const backspaceCountRef = useRef(0);

  /** Reset manual input when store resets (tileCounter drops to 0) */
  useEffect(() => {
    if (tileCounter === 0) setManualInput("");
  }, [tileCounter]);

  /** Determine which tile number we are actually looking at */
  const targetTileNumber = useMemo(() => {
    const parsed = parseInt(manualInput.replace("#", ""));
    if (!isNaN(parsed) && parsed > 0) return parsed;
    return totalProduced > 0 ? totalProduced : tileCounter;
  }, [manualInput, totalProduced, tileCounter]);

  /** Resolve active Work Order and Recipe */
  const selectedWorkOrderId = useWorkOrderStore((s) => s.selectedWorkOrderId);
  const { activeWorkOrder, activeRecipe } = useMemo(() => {
    const wo =
      WORK_ORDERS.find((w) => w.id === selectedWorkOrderId) ?? WORK_ORDERS[0];
    const recipe = RECIPES.find((r) => r.id === wo.recipeId) ?? RECIPES[0];
    return { activeWorkOrder: wo, activeRecipe: recipe };
  }, [selectedWorkOrderId]);

  /** Derive tile data for the passport display */
  const tileData = useMemo(() => {
    if (targetTileNumber === 0) return null;
    const state = useSimulationDataStore.getState();
    const tile = state.getTileByNumber(targetTileNumber);
    if (!tile) return null;
    const snapshots = state.getTileSnapshots(tile.id);
    const conveyorPos = state.conveyorPositions.get(tile.id);
    return {
      tile,
      snapshots,
      hasDefects: snapshots.some((s) => s.defect_detected),
      defectStations: snapshots
        .filter((s) => s.defect_detected)
        .map((s) => s.station),
      currentStation: conveyorPos?.current_station,
      isOnConveyor: conveyorPos !== undefined,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetTileNumber, pClockCount]);

  /** Collect all tiles that have at least one defect or scrap grade */
  const defectedTiles = useMemo(() => {
    const state = useSimulationDataStore.getState();
    const result: {
      tileId: string;
      tileNumber: number;
      defectStations: string[];
      grade: string | null;
      isScrap: boolean;
    }[] = [];
    state.tiles.forEach((tile) => {
      const snaps = state.tileSnapshots.get(tile.id) ?? [];
      const defectSnaps = snaps.filter((s) => s.defect_detected);
      const isScrap = tile.final_grade === "scrap";
      if (defectSnaps.length > 0 || isScrap) {
        result.push({
          tileId: tile.id,
          tileNumber: tile.tile_number,
          defectStations: defectSnaps.map((s) => s.station),
          grade: tile.final_grade ?? null,
          isScrap,
        });
      }
    });
    return result.sort((a, b) => b.tileNumber - a.tileNumber).slice(0, 2000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tileCounter, totalProduced, dataSnapshot.totalScrapped]);

  // ─── Resize Handle Logic ──────────────────────────────────────────────

  /**
   * Handle mouse-move during resize drag.
   * For a LEFT-docked panel, width = cursor X position (distance from left edge).
   */
  const handleResizeMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging.current) return;
      /** Width is simply the cursor X position (left edge of viewport = 0) */
      const newWidth = e.clientX;
      setDtxfrPanelWidth(newWidth);
    },
    [setDtxfrPanelWidth],
  );

  /**
   * Handle touch-move during resize drag (mobile support).
   * Same logic as handleResizeMove but extracts touch position.
   */
  const handleResizeTouchMove = useCallback(
    (e: TouchEvent) => {
      if (!isDragging.current) return;
      /** Use the first touch point's X position */
      const newWidth = e.touches[0].clientX;
      setDtxfrPanelWidth(newWidth);
    },
    [setDtxfrPanelWidth],
  );

  /**
   * Stop the resize drag operation on mouse-up or touch-end.
   * Removes the global event listeners and resets the drag flag.
   */
  const handleResizeEnd = useCallback(() => {
    isDragging.current = false;
    /** Remove the cursor override from the document body */
    document.body.style.cursor = "";
    /** Restore text selection after drag */
    document.body.style.userSelect = "";
    /** Clean up global event listeners */
    document.removeEventListener("mousemove", handleResizeMove);
    document.removeEventListener("mouseup", handleResizeEnd);
    document.removeEventListener("touchmove", handleResizeTouchMove);
    document.removeEventListener("touchend", handleResizeEnd);
  }, [handleResizeMove, handleResizeTouchMove]);

  /**
   * Start the resize drag on the right-edge handle (mouse).
   * Attaches global mousemove/mouseup listeners and sets cursor.
   */
  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      /** Prevent text selection during drag */
      e.preventDefault();
      isDragging.current = true;
      /** Override cursor globally so it stays col-resize even outside the handle */
      document.body.style.cursor = "col-resize";
      /** Prevent text selection during drag */
      document.body.style.userSelect = "none";
      /** Attach global listeners for move and end */
      document.addEventListener("mousemove", handleResizeMove);
      document.addEventListener("mouseup", handleResizeEnd);
    },
    [handleResizeMove, handleResizeEnd],
  );

  /**
   * Start the resize drag on the right-edge handle (touch).
   * Attaches global touchmove/touchend listeners.
   */
  const handleResizeTouchStart = useCallback(
    (e: React.TouchEvent) => {
      /** Prevent default to avoid scroll during resize */
      e.preventDefault();
      isDragging.current = true;
      /** Prevent text selection during drag */
      document.body.style.userSelect = "none";
      /** Attach global listeners for move and end */
      document.addEventListener("touchmove", handleResizeTouchMove);
      document.addEventListener("touchend", handleResizeEnd);
    },
    [handleResizeTouchMove, handleResizeEnd],
  );

  return (
    <div className="w-full h-full flex flex-row">
      {/* ── Panel Content ───────────────────────────────────────────── */}
      <div className="flex-1 h-full flex flex-col bg-black/80 backdrop-blur-2xl border-r border-white/10 shadow-2xl shadow-emerald-500/10 overflow-hidden dtxfr-slide-in">
        {/* ── Header ─────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-4 py-3 bg-linear-to-r from-emerald-500/10 to-green-500/10 border-b border-white/10">
          {/** Left: icon + title */}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-linear-to-br from-emerald-500/30 to-green-500/30 flex items-center justify-center">
              <FileText size={16} className="text-emerald-300" />
            </div>
            <div>
              <h2 className="text-[1.16rem] font-bold text-white leading-tight">
                DTXFR - Digital Transformation
              </h2>
            </div>
          </div>
          {/** Right: close button */}
          <button
            onClick={toggleDTXFR}
            className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
          >
            <X size={16} className="text-white/40 hover:text-white/80" />
          </button>
        </div>

        {/* ── Upper separator bar — Tile Journey + Production Table toggle ── */}
        <div className="h-[28px] w-full bg-linear-to-r from-emerald-600/25 via-green-500/15 to-emerald-600/25 border-y border-emerald-400/20 flex items-center justify-between px-4">
          <span className="text-[0.78rem] uppercase tracking-[0.25em] text-white font-semibold">
            Tile Journey
          </span>
          {/* Toggle buttons for 3D table visibility */}
          <div className="flex items-center gap-1.5">
            {/* Production Table toggle */}
            <button
              onClick={() => {
                const s = useUIStore.getState();
                s.setShowProductionTable(!s.showProductionTable);
              }}
              className={`px-2 py-0.5 rounded text-[0.6rem] font-bold uppercase tracking-wider transition-all duration-150 ${
                showProductionTable
                  ? "bg-cyan-400/60 text-white border border-cyan-300/70 shadow-[inset_0_2px_4px_rgba(0,0,0,0.3),0_0_6px_rgba(0,200,255,0.3)] translate-y-px"
                  : "bg-cyan-500/20 text-cyan-300 border border-cyan-400/30 shadow-[0_2px_0_rgba(0,200,255,0.15),inset_0_1px_0_rgba(255,255,255,0.1)] hover:bg-cyan-500/30"
              }`}
            >
              ProdTbl
            </button>
            {/* OEE Hierarchy Table toggle */}
            <button
              onClick={() => {
                const s = useUIStore.getState();
                s.toggleOEEHierarchy();
              }}
              className={`px-2 py-0.5 rounded text-[0.6rem] font-bold uppercase tracking-wider transition-all duration-150 ${
                showOEEHierarchy
                  ? "bg-cyan-400/60 text-white border border-cyan-300/70 shadow-[inset_0_2px_4px_rgba(0,0,0,0.3),0_0_6px_rgba(0,200,255,0.3)] translate-y-px"
                  : "bg-cyan-500/20 text-cyan-300 border border-cyan-400/30 shadow-[0_2px_0_rgba(0,200,255,0.15),inset_0_1px_0_rgba(255,255,255,0.1)] hover:bg-cyan-500/30"
              }`}
            >
              OEE
            </button>
          </div>
        </div>

        {/* ── 10px separator bar between header and content ──────── */}
        <div className="h-[20px] w-full bg-linear-to-r from-emerald-600/25 via-green-500/15 to-emerald-600/25 border-y border-emerald-400/20 flex items-center justify-center">
          <span className="text-[0.78rem] uppercase tracking-[0.25em] text-white font-semibold">
            Tile Digital Passport
          </span>
        </div>

        {/* ── Passport Content (scrollable) ────────────────────────── */}
        <div className="flex-1 overflow-y-auto">
          {totalProduced === 0 && tileCounter === 0 ? (
            /* Empty state */
            <div className="flex flex-col items-center justify-center py-16 gap-2 text-white/30">
              <div className="text-[2.48rem]">
                {isDataFlowing ? "⏳" : "⏳"}
              </div>
              <div className="text-[0.99rem] uppercase tracking-widest">
                {isDataFlowing
                  ? (tExtra("loading") ?? "Loading...")
                  : tExtra("startSimulation")}
              </div>
            </div>
          ) : !tileData ? (
            /* Tile not found */
            <div className="flex flex-col items-center justify-center py-16 gap-2 text-white/30">
              <div className="text-[1.99rem]">⚠</div>
              <div className="text-[0.99rem] uppercase tracking-widest">
                Tile not found
              </div>
              <button
                onClick={() => setManualInput("")}
                className="mt-1 text-[0.86rem] px-3 py-1 rounded border border-emerald-500/30 text-emerald-400/70 hover:bg-emerald-500/10 transition-colors"
              >
                Switch to Live
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-0">
              {/* ── HERO: Tile ID ──────────────────────────────────── */}
              <div className="px-4 py-1.5 bg-linear-to-r from-emerald-900/30 to-transparent border-b border-white/10">
                <div className="flex items-center justify-between">
                  {/* Left: Label */}
                  <span className="text-[1.08rem] uppercase tracking-[0.15em] text-emerald-400/60 font-semibold">
                    {t("tileId")}
                  </span>
                  {/* Center: Live toggle */}
                  <label className="flex items-center gap-1.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={manualInput === ""}
                      onChange={(e) => {
                        if (e.target.checked) setManualInput("");
                        else
                          setManualInput(
                            tileData
                              ? tileData.tile.tile_number.toString()
                              : "",
                          );
                      }}
                      className="w-5 h-5 accent-emerald-400"
                    />
                    <span className="text-[1.08rem] text-emerald-400/70 font-semibold uppercase tracking-wider">
                      Live
                    </span>
                    {manualInput === "" && (
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    )}
                  </label>
                  {/* Right: tile number (editable) */}
                  <div className="flex items-baseline gap-0.5">
                    <span className="text-emerald-500/60 text-[1.48rem] font-light">
                      #
                    </span>
                    <input
                      type="text"
                      value={
                        manualInput ||
                        (tileData ? tileData.tile.tile_number.toString() : "")
                      }
                      disabled={manualInput === ""}
                      onChange={(e) => {
                        const val = e.target.value.replace("#", "");
                        if (val === "" || /^\d+$/.test(val))
                          setManualInput(val);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Backspace") {
                          backspaceCountRef.current += 1;
                          if (backspaceCountRef.current >= 3) {
                            backspaceCountRef.current = 0;
                            setManualInput("");
                          }
                        } else {
                          backspaceCountRef.current = 0;
                        }
                      }}
                      className={`w-14 bg-transparent text-right text-[1.99rem] font-bold font-mono tracking-tight focus:outline-none transition-colors ${
                        manualInput === ""
                          ? "text-emerald-300 cursor-default"
                          : "text-emerald-300 border-b border-emerald-500/50 focus:border-emerald-400"
                      }`}
                      placeholder="--"
                    />
                  </div>
                </div>
              </div>

              {/* ── METADATA GRID ──────────────────────────────────── */}
              <div className="px-4 py-2 text-[0.99rem] divide-y divide-white/5">
                {[
                  { label: t("lot"), value: activeWorkOrder.lotId },
                  { label: t("order"), value: sessionCode || "—" },
                  { label: t("recipe"), value: activeRecipe.name },
                ].map(({ label, value }) => (
                  <div
                    key={label}
                    className="flex justify-between items-center py-1.5"
                  >
                    <span className="text-white/50 font-medium">{label}</span>
                    <span className="font-mono text-white/90">{value}</span>
                  </div>
                ))}
              </div>

              {/* ── STATUS ROW ─────────────────────────────────────── */}
              <div className="mx-4 mt-1 mb-2 rounded-lg bg-white/5 border border-white/10 grid grid-cols-2 divide-x divide-white/10 text-[0.99rem] overflow-hidden">
                {/* Location */}
                <div className="px-3 py-2 flex flex-col gap-0.5">
                  <span className="text-[0.79rem] uppercase tracking-widest text-white/40 font-semibold">
                    {t("location")}
                  </span>
                  <span className="font-mono text-emerald-400 font-semibold truncate">
                    {tileData.currentStation &&
                    tileData.currentStation !== "between_stations"
                      ? (STATION_LABELS[tileData.currentStation]?.[
                          currentLang
                        ] ?? tileData.currentStation)
                      : tileData.isOnConveyor
                        ? tExtra("onConveyor")
                        : tExtra("completed")}
                  </span>
                </div>
                {/* Quality */}
                <div className="px-3 py-2 flex flex-col gap-0.5">
                  <span className="text-[0.69rem] uppercase tracking-widest text-white/40 font-semibold">
                    {t("qualityScore")}
                  </span>
                  <span
                    className={`font-bold ${GRADE_COLORS[tileData.tile.final_grade ?? "in_progress"] ?? "text-white"}`}
                  >
                    {GRADE_LABELS[tileData.tile.final_grade ?? "in_progress"]?.[
                      currentLang
                    ] ?? tileData.tile.final_grade}
                  </span>
                </div>
              </div>

              {/* Defect warning */}
              {tileData.hasDefects && (
                <div className="mx-4 mb-2 px-3 py-1.5 rounded-md bg-red-500/10 border border-red-500/20 flex items-center justify-between text-[0.99rem]">
                  <span className="text-red-300 font-medium">
                    {tExtra("defect")}
                  </span>
                  <span className="font-mono text-red-400">
                    {tileData.defectStations
                      .map((s) => STATION_LABELS[s]?.[currentLang] ?? s)
                      .join(", ")}
                  </span>
                </div>
              )}

              {/* ── STATION HISTORY TIMELINE ───────────────────────── */}
              {tileData.snapshots.length > 0 && (
                <div className="px-4 pt-1 pb-2">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[0.79rem] uppercase tracking-[0.15em] text-white/35 font-semibold">
                      {tExtra("stationHistory")}
                    </span>
                    <div className="flex-1 h-px bg-white/10" />
                  </div>
                  <div className="flex flex-col gap-px">
                    {tileData.snapshots.map((snap, idx) => (
                      <div
                        key={snap.id}
                        className={`flex flex-col px-2 py-1.5 text-[0.99rem] rounded-sm relative ${
                          snap.defect_detected
                            ? "bg-red-500/8 border-l-2 border-red-400"
                            : idx % 2 === 0
                              ? "bg-white/3 border-l-2 border-emerald-500/40"
                              : "border-l-2 border-emerald-500/20"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={`flex-1 font-medium ${snap.defect_detected ? "text-red-300/90" : "text-white/75"}`}
                          >
                            {STATION_LABELS[snap.station]?.[currentLang] ??
                              snap.station}
                          </span>
                          <span className="font-mono text-white/30 tabular-nums text-[0.79rem]">
                            @{snap.entry_sim_tick}
                          </span>
                          <span
                            className={`w-4 text-center font-bold ${snap.defect_detected ? "text-red-400" : "text-emerald-400"}`}
                          >
                            {snap.defect_detected ? "✕" : "✓"}
                          </span>
                        </div>
                        {snap.defect_detected &&
                          snap.defect_types &&
                          snap.defect_types.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {snap.defect_types.map((dt) => (
                                <span
                                  key={dt}
                                  className={`inline-block px-1.5 py-0.5 rounded text-[0.72rem] font-semibold uppercase tracking-wide ${
                                    dt === "conveyor_jam_damage"
                                      ? "bg-orange-500/20 text-orange-300 border border-orange-500/30"
                                      : "bg-red-500/15 text-red-300/80 border border-red-500/20"
                                  }`}
                                >
                                  {DEFECT_TYPE_LABELS[dt]?.[currentLang] ?? dt}
                                </span>
                              ))}
                            </div>
                          )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── FOOTER ─────────────────────────────────────────── */}
              <div className="px-4 py-2 border-t border-white/10 bg-white/2 flex justify-between items-center text-[0.79rem] text-white/30 uppercase tracking-wider">
                <span>
                  {tExtra("onBelt")}:{" "}
                  <span className="text-white/50 font-mono">
                    {conveyorSize}
                  </span>
                </span>
                <span>
                  {tExtra("total")}:{" "}
                  <span className="text-white/50 font-mono">
                    {totalProduced}
                  </span>
                </span>
              </div>

              {/* ── DEFECTED TILES — Always-expanded list ──────────── */}
              <div className="border-t-2 border-red-500/30">
                {/* Section header (static, no toggle) */}
                <div className="w-full flex items-center px-4 py-2.5 text-[0.99rem] font-semibold uppercase tracking-wider">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-red-500/70" />
                    <span className="text-red-400/80">Defected Tiles</span>
                    {defectedTiles.length > 0 && (
                      <span className="px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-300 text-[0.79rem] font-bold">
                        {defectedTiles.length}
                      </span>
                    )}
                  </div>
                </div>
                {/* Defected tile list — always visible */}
                <div className="max-h-56 overflow-y-auto border-t border-red-500/10">
                  {defectedTiles.length === 0 ? (
                    <div className="px-4 py-4 text-center text-[0.99rem] text-white/25 uppercase tracking-wider">
                      No defected tiles yet
                    </div>
                  ) : (
                    <div className="flex flex-col gap-px py-1">
                      {defectedTiles.map((dt) => (
                        <button
                          key={dt.tileId}
                          onClick={() =>
                            setManualInput(dt.tileNumber.toString())
                          }
                          className={`flex items-center gap-2 px-4 py-1.5 text-[0.99rem] transition-colors cursor-pointer text-left border-l-2 mx-2 rounded-sm ${
                            dt.isScrap
                              ? "hover:bg-red-600/10 border-red-600/60"
                              : "hover:bg-red-500/8 border-red-500/30"
                          }`}
                        >
                          <span className="font-mono font-bold text-red-300 w-8 shrink-0">
                            #{dt.tileNumber}
                          </span>
                          <span className="flex-1 text-red-400/70 truncate">
                            {dt.defectStations.length > 0
                              ? dt.defectStations
                                  .map(
                                    (s) =>
                                      STATION_LABELS[s]?.[currentLang] ?? s,
                                  )
                                  .join(" · ")
                              : dt.isScrap
                                ? "—"
                                : ""}
                          </span>
                          {dt.grade && dt.grade !== "in_progress" && (
                            <span
                              className={`shrink-0 text-[0.72rem] font-bold uppercase ${GRADE_COLORS[dt.grade] ?? "text-white/40"}`}
                            >
                              {GRADE_LABELS[dt.grade]?.[currentLang] ??
                                dt.grade}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Resize Handle (right edge of panel) ──────────────────── */}
      <div
        className="dtxfr-resize-handle h-full shrink-0 flex items-center justify-center group"
        style={{ width: DTXFR_SIDE_PANEL_HANDLE_WIDTH }}
        onMouseDown={handleResizeStart}
        onTouchStart={handleResizeTouchStart}
      >
        {/** Visual indicator line — becomes brighter on hover/drag */}
        <div className="w-[2px] h-12 rounded-full bg-white/10 group-hover:bg-emerald-400/50 transition-colors duration-200" />
      </div>
    </div>
  );
}
