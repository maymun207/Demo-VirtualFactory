/**
 * TilePassport.tsx — Tile Detail Information Panel (Wired to Data Store)
 *
 * A draggable floating panel showing the production "künye" (passport) for
 * the most recently produced tile. Data comes from the Supabase-synced
 * `simulationDataStore`.
 *
 * Displays:
 *  - Tile number and ID
 *  - Final quality grade with color coding
 *  - Current station position (if on conveyor)
 *  - Production lot, order, and recipe — read dynamically from the active
 *    Work Order and Recipe (via useWorkOrderStore + WORK_ORDERS/RECIPES)
 *  - Station snapshot chain (künye) with defect indicators
 *    Each station row now shows the S-Clock tick (entry_sim_tick) when
 *    this tile entered that station.
 *
 * Used by: Dashboard.tsx
 */
import { useMemo, useState, useRef, useEffect } from "react";
import { useSimulationDataStore } from "../../store/simulationDataStore";
import { useSimulationStore } from "../../store/simulationStore";
import { useUIStore } from "../../store/uiStore";
import { useWorkOrderStore } from "../../store/workOrderStore";
import { useTranslation } from "../../hooks/useTranslation";
import { DraggablePanel } from "./DraggablePanel";
import { WORK_ORDERS, RECIPES } from "../../lib/params/demo";

// ─── IMPORTANT ──────────────────────────────────────────────────────────────
// All user-visible strings must flow through the centralized translations.ts
// via `useTranslation()`. Never add inline `currentLang === "tr" ? …` here.

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
 * conveyor_jam_damage is highlighted specially to explain waste-bin scrap origin.
 */
const DEFECT_TYPE_LABELS: Record<string, Record<string, string>> = {
  // Press
  crack_press: { tr: "Çatlak (Pres)", en: "Crack (Press)" },
  delamination: { tr: "Delaminasyon", en: "Delamination" },
  dimension_variance: { tr: "Boyut Sapması", en: "Dimension Variance" },
  density_variance: { tr: "Yoğunluk Sapması", en: "Density Variance" },
  edge_defect: { tr: "Kenar Hatası", en: "Edge Defect" },
  press_explosion: { tr: "Pres Patlaması", en: "Press Explosion" },
  // Dryer
  surface_crack_dry: { tr: "Yüzey Çatlağı", en: "Surface Crack" },
  warp_dry: { tr: "Eğilme (Kurutma)", en: "Warp (Dry)" },
  explosion_dry: { tr: "Patlama (Kurutma)", en: "Explosion (Dry)" },
  // Glaze
  color_tone_variance: { tr: "Ton Sapması", en: "Color Tone Variance" },
  glaze_thickness_variance: {
    tr: "Sır Kalınlık Sapması",
    en: "Glaze Thickness Variance",
  },
  pinhole_glaze: { tr: "Sır İğne Deliği", en: "Pinhole (Glaze)" },
  glaze_drip: { tr: "Sır Damlaması", en: "Glaze Drip" },
  line_defect_glaze: { tr: "Çizgi Hatası (Sır)", en: "Line Defect (Glaze)" },
  edge_buildup: { tr: "Kenar Birikmesi", en: "Edge Buildup" },
  // Printer
  line_defect_print: { tr: "Çizgi Hatası (Baskı)", en: "Line Defect (Print)" },
  white_spot: { tr: "Beyaz Nokta", en: "White Spot" },
  color_shift: { tr: "Renk Kayması", en: "Color Shift" },
  saturation_variance: { tr: "Doygunluk Sapması", en: "Saturation Variance" },
  blur: { tr: "Bulanıklık", en: "Blur" },
  pattern_stretch: { tr: "Desen Uzaması", en: "Pattern Stretch" },
  pattern_compress: { tr: "Desen Sıkışması", en: "Pattern Compress" },
  // Kiln
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
  // Packaging
  chip: { tr: "Kıymık", en: "Chip" },
  edge_crack_pack: { tr: "Kenar Çatlağı", en: "Edge Crack" },
  crush_damage: { tr: "Ezilme Hasarı", en: "Crush Damage" },
  // Conveyor (8th machine — jam-induced)
  conveyor_jam_damage: { tr: "Konveyör Hasarı", en: "Conveyor Damage" },
  // Cause-effect types
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

export const TilePassport = () => {
  const showPassport = useUIStore((s) => s.showPassport);
  const togglePassport = useUIStore((s) => s.togglePassport);
  const currentLang = useUIStore((s) => s.currentLang);
  const t = useTranslation("tilePassport");
  /** Extra keys not in the original tilePassport section */
  const tExtra = useTranslation("tilePassportExtra");

  /**
   * MASTER store reactivity drivers.
   * pClockCount changes on every production tick (= new tile created).
   * isDataFlowing distinguishes "idle" from "running but data store loading".
   *
   * ARCHITECTURE NOTE: The data store's Zustand selectors for tileCounter and
   * totalTilesProduced do not reliably trigger re-renders when the store is
   * experiencing heavy write batching (hundreds of set() calls per second from
   * tick → recordMachineState × 7 → createTile → moveTiles → metrics).
   * Instead, we subscribe to the MASTER store's pClockCount (a single numeric
   * value that changes once per production tick) and read data store values
   * imperatively via getState(). This guarantees the Passport re-renders
   * once per production tick with fresh data store values.
   */
  const pClockCount = useSimulationStore((s) => s.pClockCount);
  const isDataFlowing = useSimulationStore((s) => s.isDataFlowing);

  /** Direct Zustand selectors — reactive, type-safe, no eslint-disable needed */
  const totalProduced = useSimulationDataStore((s) => s.totalTilesProduced);
  const tileCounter = useSimulationDataStore((s) => s.tileCounter);
  const conveyorSize = useSimulationDataStore((s) => s.conveyorPositions.size);
  const totalScrapped = useSimulationDataStore((s) => s.totalTilesScrapped);
  const sessionCode = useSimulationDataStore((s) => s.sessionCode);

  /**
   * Manual Tile Number handling.
   * If empty, the passport follows "Live Tracking" (latest completed).
   * If a number is entered, it locks to that specific tile.
   */
  const [manualInput, setManualInput] = useState("");
  /**
   * Counts consecutive Backspace presses on the tile-number input.
   * Three consecutive Backspaces with no other key between them
   * will clear the manual input, re-enabling Live auto-tracking.
   */
  const backspaceCountRef = useRef(0);

  /**
   * When the store is reset (tileCounter drops back to 0), clear any stale
   * manual tile number so the passport returns cleanly to Live mode instead
   * of showing "Start Simulation" while a fresh run is already in progress.
   */
  useEffect(() => {
    if (tileCounter === 0) setManualInput("");
  }, [tileCounter]);

  /**
   * Determine which tile number we are actually looking at.
   * Fallback to 'Live' logic if input is empty or invalid.
   */
  const targetTileNumber = useMemo(() => {
    const parsed = parseInt(manualInput.replace("#", ""));
    if (!isNaN(parsed) && parsed > 0) return parsed;
    return totalProduced > 0 ? totalProduced : tileCounter;
  }, [manualInput, totalProduced, tileCounter]);

  /**
   * Resolve the active Work Order and Recipe from the selected Work Order ID.
   * Re-derives only when the user changes their Work Order selection.
   * Falls back to WORK_ORDERS[0] / RECIPES[0] defensively if no match.
   */
  const selectedWorkOrderId = useWorkOrderStore((s) => s.selectedWorkOrderId);
  const { activeWorkOrder, activeRecipe } = useMemo(() => {
    /** Find the selected Work Order entry from the static list */
    const wo =
      WORK_ORDERS.find((w) => w.id === selectedWorkOrderId) ?? WORK_ORDERS[0];
    /** Find the Recipe linked to this Work Order */
    const recipe = RECIPES.find((r) => r.id === wo.recipeId) ?? RECIPES[0];
    return { activeWorkOrder: wo, activeRecipe: recipe };
  }, [selectedWorkOrderId]);

  /**
   * Derive tile data for the passport display.
   *
   * Priority:
   *  1. totalTilesProduced > 0 → show the MOST RECENTLY COMPLETED tile
   *     (this tile has visited all 7 stations, giving a full journey history).
   *  2. totalTilesProduced === 0 && tileCounter > 0 → fallback to the LATEST
   *     CREATED tile so the passport isn't empty during the initial ramp-up
   *     period before the first tile exits packaging.
   *  3. Both zero → null (show "Start simulation…").
   *
   * conveyorSize is included as a dependency so the passport refreshes as
   * the tracked tile moves through stations (relevant for the fallback case
   * where we track an in-progress tile).
   */
  /**
   * Derive tile data for the passport display.
   * getState is a stable Zustand function — safe to call inside useMemo.
   * pClockCount acts as the tick-based refresh trigger.
   */
  const getDataState = useSimulationDataStore.getState;
  const tileData = useMemo(() => {
    if (targetTileNumber === 0) return null;

    const state = getDataState();
    /** Look up the target tile by its sequential number. */
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
      /** True while the tile is still physically present on the belt,
       * even after its status flips to "completed" (post-Packaging movement).
       * Only becomes false once pruneCompletedTiles removes it from conveyorPositions. */
      isOnConveyor: conveyorPos !== undefined,
    };
  }, [targetTileNumber, pClockCount, getDataState]);

  /** Controls open/close of the Defected Tiles drawer. */
  const [defectedOpen, setDefectedOpen] = useState(false);

  /**
   * Collect all tiles that have at least one defect snapshot OR a scrap grade.
   *
   * Two separate mechanisms can flag a tile as problematic:
   *  1. `defect_detected = true` in a snapshot  → parameter out-of-range + random roll
   *  2. `final_grade = 'scrap'`                 → quality score too low (no roll needed)
   * Both are surfaced here so operators can see every problematic tile.
   *
   * Re-derives when the tile counter or totalProduced changes.
   * Capped at the 50 most-recent entries to keep the list manageable.
   */
  const defectedTiles = useMemo(() => {
    const state = getDataState();
    const result: {
      tileId: string;
      tileNumber: number;
      defectStations: string[];
      grade: string | null;
      isScrap: boolean;
    }[] = [];

    /* Iterate every tile in the store */
    state.tiles.forEach((tile) => {
      const snaps = state.tileSnapshots.get(tile.id) ?? [];
      const defectSnaps = snaps.filter((s) => s.defect_detected);
      const isScrap = tile.final_grade === "scrap";

      /* Include if it has defect snapshots OR is scrapped */
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

    /* Sort descending by tile number (most recent first) and cap at 50 */
    return result.sort((a, b) => b.tileNumber - a.tileNumber).slice(0, 50);
  }, [tileCounter, totalProduced, totalScrapped, getDataState]);

  /**
   * Auto-expand the Defected Tiles drawer when the simulation ends.
   *
   * When `isDataFlowing` becomes false (simulation stopped naturally or manually)
   * and there is at least one defected tile, the drawer opens automatically so
   * operators can immediately review quality issues without clicking the toggle.
   *
   * Placed after `defectedTiles` useMemo so the dependency is already declared.
   * On the next run, `closeAllPanels()` unmounts this component, resetting
   * `defectedOpen` back to false on remount.
   */
  useEffect(() => {
    if (!isDataFlowing && defectedTiles.length > 0) {
      /** Simulation has stopped and defects exist → open the drawer */
      setDefectedOpen(true);
    }
  }, [isDataFlowing, defectedTiles.length]);

  /**
   * (currentTileAtStation removed — Station History now shows entry_sim_tick,
   * the S-Clock tick when the tracked tile entered each station, instead of
   * the tile number currently parked at that station.)
   */

  return (
    <DraggablePanel
      panelIndex={0}
      title={t("title")}
      visible={showPassport}
      onClose={togglePassport}
    >
      {totalProduced === 0 && tileCounter === 0 ? (
        /* Empty state — either simulation hasn't started, or data store is waiting for session */
        <div className="flex flex-col items-center justify-center py-8 gap-2 text-white/30">
          <div className="text-3xl">{isDataFlowing ? "⏳" : "⏳"}</div>
          <div className="text-xs uppercase tracking-widest">
            {isDataFlowing
              ? (tExtra("loading") ?? "Loading...")
              : tExtra("startSimulation")}
          </div>
        </div>
      ) : !tileData ? (
        /* Tile number was manually entered but that tile no longer exists
         * (e.g. after a reset while the old ID was still in the input). */
        <div className="flex flex-col items-center justify-center py-8 gap-2 text-white/30">
          <div className="text-2xl">⚠</div>
          <div className="text-xs uppercase tracking-widest">
            Tile not found
          </div>
          <button
            onClick={() => setManualInput("")}
            className="mt-1 text-[0.65rem] px-3 py-1 rounded border border-emerald-500/30 text-emerald-400/70 hover:bg-emerald-500/10 transition-colors"
          >
            Switch to Live
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-0">
          {/* ── HERO: Tile ID ──────────────────────────────────────────── */}
          {/* Large, prominent tile number with Live toggle and manual input */}
          <div className="px-4 py-3 bg-gradient-to-r from-emerald-900/30 to-transparent border-b border-white/10">
            <div className="flex items-center justify-between">
              {/* Left: Label */}
              <span className="text-[0.65rem] uppercase tracking-[0.15em] text-emerald-400/60 font-semibold">
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
                        tileData ? tileData.tile.tile_number.toString() : "",
                      );
                  }}
                  className="w-4 h-4 accent-emerald-400"
                />
                <span className="text-[0.65rem] text-emerald-400/70 font-semibold uppercase tracking-wider">
                  Live
                </span>
                {/* Pulsing dot when Live */}
                {manualInput === "" && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                )}
              </label>

              {/* Right: tile number (editable) */}
              <div className="flex items-baseline gap-0.5">
                <span className="text-emerald-500/60 text-lg font-light">
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
                    if (val === "" || /^\d+$/.test(val)) setManualInput(val);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Backspace") {
                      /* Increment consecutive backspace counter */
                      backspaceCountRef.current += 1;
                      if (backspaceCountRef.current >= 3) {
                        /* Three consecutive Backspaces — restore Live mode */
                        backspaceCountRef.current = 0;
                        setManualInput("");
                      }
                    } else {
                      /* Any other key resets the consecutive counter */
                      backspaceCountRef.current = 0;
                    }
                  }}
                  className={`w-14 bg-transparent text-right text-2xl font-bold font-mono tracking-tight focus:outline-none transition-colors ${
                    manualInput === ""
                      ? "text-emerald-300 cursor-default"
                      : "text-emerald-300 border-b border-emerald-500/50 focus:border-emerald-400"
                  }`}
                  placeholder="--"
                />
              </div>
            </div>
          </div>

          {/* ── METADATA GRID ──────────────────────────────────────────── */}
          {/* Lot / Order / Recipe in alternating subtle rows */}
          <div className="px-4 py-2 text-xs divide-y divide-white/5">
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

          {/* ── STATUS ROW ─────────────────────────────────────────────── */}
          {/* Location + Quality Grade side by side */}
          <div className="mx-4 mt-1 mb-2 rounded-lg bg-white/5 border border-white/10 grid grid-cols-2 divide-x divide-white/10 text-xs overflow-hidden">
            {/* Location */}
            <div className="px-3 py-2 flex flex-col gap-0.5">
              <span className="text-[0.6rem] uppercase tracking-widest text-white/40 font-semibold">
                {t("location")}
              </span>
              <span className="font-mono text-emerald-400 font-semibold truncate">
                {tileData.currentStation &&
                tileData.currentStation !== "between_stations"
                  ? /* Tile is at a named station — show it */
                    (STATION_LABELS[tileData.currentStation]?.[currentLang] ??
                    tileData.currentStation)
                  : tileData.isOnConveyor
                    ? /* Still physically on the belt (post-packaging travel) */
                      tExtra("onConveyor")
                    : /* Fully removed from conveyor — truly completed */
                      tExtra("completed")}
              </span>
            </div>
            {/* Quality */}
            <div className="px-3 py-2 flex flex-col gap-0.5">
              <span className="text-[0.6rem] uppercase tracking-widest text-white/40 font-semibold">
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

          {/* Defect warning (only visible when defects exist) */}
          {tileData.hasDefects && (
            <div className="mx-4 mb-2 px-3 py-1.5 rounded-md bg-red-500/10 border border-red-500/20 flex items-center justify-between text-xs">
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

          {/* ── STATION HISTORY TIMELINE ───────────────────────────────── */}
          {tileData.snapshots.length > 0 && (
            <div className="px-4 pt-1 pb-2">
              {/* Header */}
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[0.6rem] uppercase tracking-[0.15em] text-white/35 font-semibold">
                  {tExtra("stationHistory")}
                </span>
                <div className="flex-1 h-px bg-white/10" />
              </div>

              {/* Timeline rows */}
              <div className="flex flex-col gap-px">
                {tileData.snapshots.map((snap, idx) => (
                  <div
                    key={snap.id}
                    className={`flex flex-col px-2 py-1.5 text-xs rounded-sm relative ${
                      snap.defect_detected
                        ? "bg-red-500/8 border-l-2 border-red-400"
                        : idx % 2 === 0
                          ? "bg-white/[0.03] border-l-2 border-emerald-500/40"
                          : "border-l-2 border-emerald-500/20"
                    }`}
                  >
                    {/* Main row: station name + tick + status icon */}
                    <div className="flex items-center gap-2">
                      {/* Station name */}
                      <span
                        className={`flex-1 font-medium ${snap.defect_detected ? "text-red-300/90" : "text-white/75"}`}
                      >
                        {STATION_LABELS[snap.station]?.[currentLang] ??
                          snap.station}
                      </span>
                      {/* Tick */}
                      <span className="font-mono text-white/30 tabular-nums text-[0.6rem]">
                        @{snap.entry_sim_tick}
                      </span>
                      {/* Status icon */}
                      <span
                        className={`w-4 text-center font-bold ${snap.defect_detected ? "text-red-400" : "text-emerald-400"}`}
                      >
                        {snap.defect_detected ? "✕" : "✓"}
                      </span>
                    </div>

                    {/* Defect type pills — only shown when defect_types is populated */}
                    {snap.defect_detected &&
                      snap.defect_types &&
                      snap.defect_types.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {snap.defect_types.map((dt) => (
                            <span
                              key={dt}
                              className={`inline-block px-1.5 py-0.5 rounded text-[0.55rem] font-semibold uppercase tracking-wide ${
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

          {/* ── FOOTER ─────────────────────────────────────────────────── */}
          <div className="px-4 py-2 border-t border-white/10 bg-white/[0.02] flex justify-between items-center text-[0.6rem] text-white/30 uppercase tracking-wider">
            <span>
              {tExtra("onBelt")}:{" "}
              <span className="text-white/50 font-mono">{conveyorSize}</span>
            </span>
            <span>
              {tExtra("total")}:{" "}
              <span className="text-white/50 font-mono">{totalProduced}</span>
            </span>
          </div>

          {/* ── DEFECTED TILES DRAWER ───────────────────────────────────── */}
          <div className="border-t-2 border-red-500/30">
            {/* Toggle button */}
            <button
              onClick={() => setDefectedOpen((o) => !o)}
              className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-semibold uppercase tracking-wider transition-colors hover:bg-red-500/5 group"
            >
              <div className="flex items-center gap-2">
                {/* Red indicator dot */}
                <span className="w-2 h-2 rounded-full bg-red-500/70" />
                <span className="text-red-400/80">Defected Tiles</span>
                {/* Count badge */}
                {defectedTiles.length > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-300 text-[0.6rem] font-bold">
                    {defectedTiles.length}
                  </span>
                )}
              </div>
              {/* Chevron */}
              <span
                className={`text-white/30 transition-transform duration-200 ${defectedOpen ? "rotate-180" : ""}`}
              >
                ▾
              </span>
            </button>

            {/* Collapsible list */}
            {defectedOpen && (
              <div className="max-h-56 overflow-y-auto border-t border-red-500/10">
                {defectedTiles.length === 0 ? (
                  <div className="px-4 py-4 text-center text-xs text-white/25 uppercase tracking-wider">
                    No defected tiles yet
                  </div>
                ) : (
                  <div className="flex flex-col gap-px py-1">
                    {defectedTiles.map((dt) => (
                      <button
                        key={dt.tileId}
                        onClick={() => setManualInput(dt.tileNumber.toString())}
                        className={`flex items-center gap-2 px-4 py-1.5 text-xs transition-colors cursor-pointer text-left border-l-2 mx-2 rounded-sm ${
                          dt.isScrap
                            ? "hover:bg-red-600/10 border-red-600/60"
                            : "hover:bg-red-500/8 border-red-500/30"
                        }`}
                      >
                        {/* Tile number */}
                        <span className="font-mono font-bold text-red-300 w-8 shrink-0">
                          #{dt.tileNumber}
                        </span>
                        {/* Defect stations — or "Scrap" label if no station snapshots */}
                        <span className="flex-1 text-red-400/70 truncate">
                          {dt.defectStations.length > 0
                            ? dt.defectStations
                                .map(
                                  (s) => STATION_LABELS[s]?.[currentLang] ?? s,
                                )
                                .join(" · ")
                            : dt.isScrap
                              ? "—"
                              : ""}
                        </span>
                        {/* Grade badge */}
                        {dt.grade && dt.grade !== "in_progress" && (
                          <span
                            className={`shrink-0 text-[0.55rem] font-bold uppercase ${GRADE_COLORS[dt.grade] ?? "text-white/40"}`}
                          >
                            {GRADE_LABELS[dt.grade]?.[currentLang] ?? dt.grade}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </DraggablePanel>
  );
};
