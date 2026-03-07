/**
 * machineTooltipConfig.ts — Parameter Definitions for Machine Hover Tooltips
 *
 * Static configuration mapping every station's measurable parameters to their:
 *  - Human-readable label (bilingual TR/EN)
 *  - Unit of measurement
 *  - Optimal operating range (min/max)
 *  - Whether the parameter is derived (computed, not directly measured)
 *
 * Used by: MachineTooltipContent.tsx
 */
import type { StationName } from "../../store/types";

// =============================================================================
// TYPES
// =============================================================================

/** Single parameter definition for the tooltip table. */
export interface ParamDefinition {
  /** Property key on the state record (e.g., 'pressure_bar'). */
  key: string;
  /** Bilingual display label. */
  label: { tr: string; en: string };
  /** Unit string (e.g., 'bar', '°C', '%'). */
  unit: string;
  /** Optimal operating range. Null if derived/no range. */
  range: { min: number; max: number } | null;
  /** Whether this is a derived (computed) parameter. */
  derived?: boolean;
}

/** Station display metadata. */
export interface StationMeta {
  /** Bilingual station name. */
  name: { tr: string; en: string };
  /** Station accent color (hex). */
  color: string;
  /** Ordered list of parameters to show. */
  params: ParamDefinition[];
}

// =============================================================================
// STATION PARAMETER DEFINITIONS
// =============================================================================

export const STATION_TOOLTIP_CONFIG: Record<StationName, StationMeta> = {
  // ─────────────────────────────────────────────────────────────────────────
  // 1. PRESS
  // ─────────────────────────────────────────────────────────────────────────
  press: {
    name: { tr: "Pres", en: "Press" },
    color: "#ef4444",
    params: [
      { key: "pressure_bar", label: { tr: "Basınç", en: "Pressure" }, unit: "bar", range: { min: 280, max: 450 } },
      { key: "cycle_time_sec", label: { tr: "Çevrim Süresi", en: "Cycle Time" }, unit: "s", range: { min: 4, max: 8 } },
      { key: "mold_temperature_c", label: { tr: "Kalıp Sıcaklığı", en: "Mold Temp" }, unit: "°C", range: { min: 40, max: 60 } },
      { key: "powder_moisture_pct", label: { tr: "Nem Oranı", en: "Moisture" }, unit: "%", range: { min: 5, max: 7 } },
      { key: "fill_amount_g", label: { tr: "Dolum Miktarı", en: "Fill Amount" }, unit: "g", range: { min: 800, max: 2500 } },
      { key: "mold_wear_pct", label: { tr: "Kalıp Aşınması", en: "Mold Wear" }, unit: "%", range: { min: 0, max: 30 } },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 2. DRYER
  // ─────────────────────────────────────────────────────────────────────────
  dryer: {
    name: { tr: "Kurutma", en: "Dryer" },
    color: "#f97316",
    params: [
      { key: "inlet_temperature_c", label: { tr: "Giriş Sıcaklığı", en: "Inlet Temp" }, unit: "°C", range: { min: 150, max: 250 } },
      { key: "outlet_temperature_c", label: { tr: "Çıkış Sıcaklığı", en: "Outlet Temp" }, unit: "°C", range: { min: 80, max: 120 } },
      { key: "belt_speed_m_min", label: { tr: "Bant Hızı", en: "Belt Speed" }, unit: "m/min", range: { min: 1, max: 5 } },
      { key: "drying_time_min", label: { tr: "Kurutma Süresi", en: "Drying Time" }, unit: "min", range: { min: 30, max: 60 } },
      { key: "exit_moisture_pct", label: { tr: "Çıkış Nemi", en: "Exit Moisture" }, unit: "%", range: { min: 0.5, max: 1.5 } },
      { key: "fan_frequency_hz", label: { tr: "Fan Frekansı", en: "Fan Freq" }, unit: "Hz", range: { min: 30, max: 50 } },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 3. GLAZE
  // ─────────────────────────────────────────────────────────────────────────
  glaze: {
    name: { tr: "Sırlama", en: "Glaze" },
    color: "#06b6d4",
    params: [
      { key: "glaze_density_g_cm3", label: { tr: "Sır Yoğunluğu", en: "Glaze Density" }, unit: "g/cm³", range: { min: 1.35, max: 1.55 } },
      { key: "glaze_viscosity_sec", label: { tr: "Viskozite", en: "Viscosity" }, unit: "s", range: { min: 18, max: 35 } },
      { key: "application_weight_g_m2", label: { tr: "Uygulama Ağırlığı", en: "App. Weight" }, unit: "g/m²", range: { min: 300, max: 600 } },
      { key: "cabin_pressure_bar", label: { tr: "Kabin Basıncı", en: "Cabin Pressure" }, unit: "bar", range: { min: 0.3, max: 1.2 } },
      { key: "nozzle_angle_deg", label: { tr: "Nozül Açısı", en: "Nozzle Angle" }, unit: "°", range: { min: 15, max: 45 } },
      { key: "belt_speed_m_min", label: { tr: "Bant Hızı", en: "Belt Speed" }, unit: "m/min", range: { min: 15, max: 35 } },
      { key: "glaze_temperature_c", label: { tr: "Sır Sıcaklığı", en: "Glaze Temp" }, unit: "°C", range: { min: 20, max: 30 } },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 4. DIGITAL PRINTER
  // ─────────────────────────────────────────────────────────────────────────
  printer: {
    name: { tr: "Dijital Baskı", en: "Digital Print" },
    color: "#a855f7",
    params: [
      { key: "head_temperature_c", label: { tr: "Kafa Sıcaklığı", en: "Head Temp" }, unit: "°C", range: { min: 35, max: 45 } },
      { key: "ink_viscosity_mpa_s", label: { tr: "Mürekkep Viskozite", en: "Ink Viscosity" }, unit: "mPa·s", range: { min: 8, max: 15 } },
      { key: "drop_size_pl", label: { tr: "Damla Boyutu", en: "Drop Size" }, unit: "pl", range: { min: 6, max: 80 } },
      { key: "resolution_dpi", label: { tr: "Çözünürlük", en: "Resolution" }, unit: "dpi", range: { min: 360, max: 720 } },
      { key: "belt_speed_m_min", label: { tr: "Bant Hızı", en: "Belt Speed" }, unit: "m/min", range: { min: 20, max: 45 } },
      { key: "head_gap_mm", label: { tr: "Kafa Boşluğu", en: "Head Gap" }, unit: "mm", range: { min: 1.5, max: 4 } },
      { key: "active_nozzle_pct", label: { tr: "Aktif Nozül", en: "Active Nozzles" }, unit: "%", range: { min: 95, max: 100 } },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 5. KILN
  // ─────────────────────────────────────────────────────────────────────────
  kiln: {
    name: { tr: "Fırın", en: "Kiln" },
    color: "#f43f5e",
    params: [
      { key: "max_temperature_c", label: { tr: "Maks Sıcaklık", en: "Max Temp" }, unit: "°C", range: { min: 1100, max: 1220 } },
      { key: "firing_time_min", label: { tr: "Pişirme Süresi", en: "Firing Time" }, unit: "min", range: { min: 35, max: 60 } },
      { key: "preheat_gradient_c_min", label: { tr: "Ön Isıtma Hızı", en: "Preheat Rate" }, unit: "°C/min", range: { min: 15, max: 40 } },
      { key: "cooling_gradient_c_min", label: { tr: "Soğutma Hızı", en: "Cooling Rate" }, unit: "°C/min", range: { min: 20, max: 50 } },
      { key: "belt_speed_m_min", label: { tr: "Bant Hızı", en: "Belt Speed" }, unit: "m/min", range: { min: 1, max: 3 } },
      { key: "atmosphere_pressure_mbar", label: { tr: "Atmosfer Basıncı", en: "Atm. Pressure" }, unit: "mbar", range: { min: -0.5, max: 0.5 } },
      { key: "o2_level_pct", label: { tr: "O₂ Seviyesi", en: "O₂ Level" }, unit: "%", range: { min: 2, max: 8 } },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 6. SORTING
  // ─────────────────────────────────────────────────────────────────────────
  sorting: {
    name: { tr: "Seçme", en: "Sorting" },
    color: "#22c55e",
    params: [
      { key: "camera_resolution_mp", label: { tr: "Kamera Çözünürlük", en: "Camera Res." }, unit: "MP", range: { min: 5, max: 20 } },
      { key: "scan_rate_tiles_min", label: { tr: "Tarama Hızı", en: "Scan Rate" }, unit: "tiles/min", range: { min: 20, max: 60 } },
      { key: "size_tolerance_mm", label: { tr: "Boyut Toleransı", en: "Size Tolerance" }, unit: "mm", range: { min: 0.3, max: 1.0 } },
      { key: "color_tolerance_de", label: { tr: "Renk Toleransı", en: "Color ΔE" }, unit: "ΔE", range: { min: 0.5, max: 2.0 } },
      { key: "flatness_tolerance_mm", label: { tr: "Düzlük Toleransı", en: "Flatness Tol." }, unit: "mm", range: { min: 0.1, max: 0.5 } },
      { key: "defect_threshold_mm2", label: { tr: "Hata Eşiği", en: "Defect Threshold" }, unit: "mm²", range: { min: 0.5, max: 3.0 } },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 7. PACKAGING
  // ─────────────────────────────────────────────────────────────────────────
  packaging: {
    name: { tr: "Paketleme", en: "Packaging" },
    color: "#eab308",
    params: [
      { key: "stack_count", label: { tr: "Karo / Kutu", en: "Tiles/Box" }, unit: "adet", range: { min: 4, max: 12 } },
      { key: "box_sealing_pressure_bar", label: { tr: "Mühürleme Basıncı", en: "Seal Pressure" }, unit: "bar", range: { min: 2, max: 5 } },
      { key: "pallet_capacity_m2", label: { tr: "Palet Kapasitesi", en: "Pallet Cap." }, unit: "m²", range: { min: 40, max: 80 } },
      { key: "stretch_tension_pct", label: { tr: "Streç Gerginliği", en: "Wrap Tension" }, unit: "%", range: { min: 150, max: 300 } },
      { key: "robot_speed_cycles_min", label: { tr: "Robot Hızı", en: "Robot Speed" }, unit: "cyc/min", range: { min: 6, max: 15 } },
      { key: "label_accuracy_pct", label: { tr: "Etiket Doğruluğu", en: "Label Accuracy" }, unit: "%", range: { min: 99, max: 100 } },
    ],
  },
};

/** Map station index (0–6) to StationName. */
export const STATION_INDEX_TO_NAME: StationName[] = [
  "press", "dryer", "glaze", "printer", "kiln", "sorting", "packaging",
];
