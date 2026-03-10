/**
 * ╔═══════════════════════════════════════════════════════════════════╗
 * ║  DATA — Interfaces and initial data factories for stations,     ║
 * ║  KPIs, defects, the status matrix, and utility functions.       ║
 * ║                                                                   ║
 * ║  Exports:                                                         ║
 * ║    • StationData, KPI, Defect interfaces                         ║
 * ║    • Initial data arrays and their factory-clone functions        ║
 * ║    • Defect heatmap thresholds                                    ║
 * ║    • Status matrix dimensions and factory                         ║
 * ║    • Utility: getStationPosition, computeBaseVelocity             ║
 * ╚═══════════════════════════════════════════════════════════════════╝
 */

import { STATION_CENTER_INDEX, STATION_SPACING_3D, PRESS_POSITION_X_OVERRIDE, DRYER_POSITION_X_OVERRIDE, GLAZE_POSITION_X_OVERRIDE, DIGITAL_PRINT_POSITION_X_OVERRIDE, PACKAGING_POSITION_X_OVERRIDE } from './scene';
import { STATION_SPACING } from './simulation';

// ═══════════════════════════════════════════════════════════════════
// INITIAL DATA — Interfaces
// ═══════════════════════════════════════════════════════════════════

/**
 * Static definition of a factory station.
 * Used for 3D rendering, modal content, and telemetry station identification.
 */
export interface StationData {
  /** Unique machine identifier (e.g., 'press', 'dryer', 'kiln') */
  id: string;
  /** Bilingual display name (e.g., { tr: 'PRES', en: 'PRESS' }) */
  name: { tr: string; en: string };
  /** Current operational status, controls indicator light color */
  status: 'normal' | 'warning' | 'error';
  /** Emoji icon displayed in the station detail modal */
  icon: string;
  /** Theme color for the station (hex string) */
  color: string;
  /** Communication protocol label (e.g., 'Modbus TCP', 'OPC-UA') */
  protocol: string;
  /** Key-value statistics shown in the station detail modal */
  stats: {
    /** Bilingual stat label */
    label: { tr: string; en: string };
    /** Display value (string for formatting flexibility) */
    value: string;
    /** Measurement unit (e.g., '°C', 'bar', '%') */
    unit?: string;
    /** Optional status override for this specific stat */
    status?: 'normal' | 'warning' | 'error';
  }[];
}

/**
 * A Key Performance Indicator displayed in the KPI panel.
 * Values are stored as formatted strings for direct display.
 */
export interface KPI {
  /** Unique ID matching KpiId type (e.g., 'oee', 'ftq', 'energy') */
  id: string;
  /** Bilingual label for the KPI card */
  label: { tr: string; en: string };
  /** Formatted numeric value (e.g., '92.5') */
  value: string;
  /** Measurement unit (e.g., '%', 'kWh', 'kg') */
  unit: string;
  /** Bilingual trend text with arrow and delta (e.g., '↑ %2.3' / '↑ 2.3%') */
  trend: { tr: string; en: string };
  /** 'up' = improving (green), 'down' = worsening (red) */
  trendDirection: 'up' | 'down';
  /** Optional status for special highlighting */
  status?: 'normal' | 'warning' | 'error';
}

/**
 * A single defect type for the heatmap visualization.
 * Values are jittered each tick for animated visual effect.
 */
export interface Defect {
  /** Internal defect identifier (e.g., 'pinhole', 'crack') */
  name: string;
  /** Current defect percentage (jittered by randomizeDefects) */
  value: number;
  /** Bilingual human-readable label */
  label: { tr: string; en: string };
}

// ═══════════════════════════════════════════════════════════════════
// INITIAL DATA — Station, KPI, and Defect arrays + factories
// ═══════════════════════════════════════════════════════════════════

/**
 * Factory function: returns a deep-cloned copy of INITIAL_STATIONS.
 * Prevents shared state mutation when multiple stores reference station data.
 */
export const createInitialStations = (): StationData[] => JSON.parse(JSON.stringify(INITIAL_STATIONS));

/** Static initial station data for the 7 factory stations */
export const INITIAL_STATIONS: StationData[] = [
  {
    id: 'press',
    name: { tr: 'PRES', en: 'PRESS' },
    status: 'normal',
    icon: '🔨',
    color: '#00ff88',
    protocol: 'Modbus TCP',
    stats: [
      { label: { tr: 'Pres Kuvveti', en: 'Press Force' }, value: '2500', unit: 'bar' },
      { label: { tr: 'Titreşim', en: 'Vibration' }, value: '0.8', unit: 'mm/s' },
    ],
  },
  {
    id: 'dryer',
    name: { tr: 'KURUTUCU', en: 'DRYER' },
    status: 'normal',
    icon: '💨',
    color: '#0077ff',
    protocol: 'OPC-UA',
    stats: [
      { label: { tr: 'Nem', en: 'Humidity' }, value: '5', unit: '%' },
      { label: { tr: 'Sıcaklık', en: 'Temp' }, value: '110-125', unit: '°C' },
    ],
  },
  {
    id: 'glaze',
    name: { tr: 'SIR/RENK', en: 'GLAZE/COLOR' },
    status: 'warning',
    icon: '🎨',
    color: '#00d4ff',
    protocol: 'Modbus RTU',
    stats: [
      { label: { tr: 'Viskozite', en: 'Viscosity' }, value: '45', unit: 's', status: 'warning' },
      { label: { tr: 'Gramaj', en: 'Weight' }, value: '680', unit: 'g/m²' },
    ],
  },
  {
    id: 'print',
    name: { tr: 'DİJİTAL BASKI', en: 'DIGITAL PRINT' },
    status: 'normal',
    icon: '🖨️',
    color: '#ff00ff',
    protocol: 'OPC-UA',
    stats: [
      { label: { tr: 'Kafa Isısı', en: 'Head Temp' }, value: '42', unit: '°C' },
      { label: { tr: 'Basınç', en: 'Pressure' }, value: '2.1', unit: 'bar' },
    ],
  },
  {
    id: 'kiln',
    name: { tr: 'FIRIN', en: 'KILN' },
    status: 'error',
    icon: '🔥',
    color: '#ff4444',
    protocol: 'Modbus TCP',
    stats: [
      { label: { tr: 'Sıcaklık', en: 'Temp' }, value: '1203', unit: '°C' },
      { label: { tr: 'E. Tüketimi', en: 'Energy' }, value: '18.2', unit: 'kWh', status: 'error' },
    ],
  },
  {
    id: 'sorting',
    name: { tr: 'AYIKLAMA', en: 'SORTING' },
    status: 'normal',
    icon: '🔍',
    color: '#aa00ff',
    protocol: 'AI Vision',
    stats: [
      { label: { tr: 'Kalite', en: 'Quality' }, value: '92.7', unit: '%' },
      { label: { tr: 'Sınıf A', en: 'Grade A' }, value: '85', unit: '%' },
    ],
  },
  {
    id: 'packaging',
    name: { tr: 'PAKETLEME', en: 'PACKAGING' },
    status: 'normal',
    icon: '📦',
    color: '#ffffff',
    protocol: 'Modbus RTU',
    stats: [
      { label: { tr: 'Adet', en: 'Count' }, value: '6', unit: 'pcs' },
      { label: { tr: 'Ağırlık', en: 'Weight' }, value: '28.5', unit: 'kg' },
    ],
  },
];

/** Factory function: returns fresh KPI array */
export const createInitialKPIs = (): KPI[] => JSON.parse(JSON.stringify(INITIAL_KPIS));

/** Initial KPI values (all start at zero/default) */
export const INITIAL_KPIS: KPI[] = [
  { id: 'oee', label: { tr: 'OEE', en: 'OEE' }, value: '0.0', unit: '%', trend: { tr: '↑ %0.0', en: '↑ 0.0%' }, trendDirection: 'up' },
  { id: 'ftq', label: { tr: 'FTQ', en: 'FTQ' }, value: '100.0', unit: '%', trend: { tr: '↑ %0.0', en: '↑ 0.0%' }, trendDirection: 'up' },
  { id: 'total_kpi', label: { tr: 'Toplam KPI', en: 'Total KPI' }, value: '100.0', unit: '%', trend: { tr: '↑ %0.0', en: '↑ 0.0%' }, trendDirection: 'up' },
  { id: 'scrap', label: { tr: 'Hurda', en: 'Scrap' }, value: '0.0', unit: '%', trend: { tr: '↓ %0.0', en: '↓ 0.0%' }, trendDirection: 'down' },
  { id: 'energy', label: { tr: 'Enerji', en: 'Energy' }, value: '0.0', unit: 'kWh', trend: { tr: '↑ %0.0', en: '↑ 0.0%' }, trendDirection: 'up' },
  { id: 'gas', label: { tr: 'Doğal Gaz', en: 'Natural Gas' }, value: '0.0', unit: 'm³', trend: { tr: '↑ %0.0', en: '↑ 0.0%' }, trendDirection: 'up' },
  { id: 'co2', label: { tr: 'CO₂', en: 'CO₂' }, value: '0.0', unit: 'kg', trend: { tr: '↑ %0.0', en: '↑ 0.0%' }, trendDirection: 'up' },
];

/** Factory function: returns fresh defect array */
export const createInitialDefects = (): Defect[] => JSON.parse(JSON.stringify(INITIAL_DEFECTS));

/** Initial defect types for the heatmap visualization — all start at 0.0 (clean slate). */
export const INITIAL_DEFECTS: Defect[] = [
  { name: 'pinhole', value: 0.0, label: { tr: 'Pinhole',        en: 'Pinhole'       } },
  { name: 'glaze',   value: 0.0, label: { tr: 'Glaze Akması',   en: 'Glaze Flow'    } },
  { name: 'banding', value: 0.0, label: { tr: 'Banding',        en: 'Banding'       } },
  { name: 'black',   value: 0.0, label: { tr: 'Siyah Çekirdek', en: 'Black Core'    } },
  { name: 'ghosting',value: 0.0, label: { tr: 'Ghosting',       en: 'Ghosting'      } },
  { name: 'edge',    value: 0.0, label: { tr: 'Kenar Kırığı',   en: 'Edge Break'    } },
  { name: 'crack',   value: 0.0, label: { tr: 'Çatlak',         en: 'Crack'         } },
  { name: 'pattern', value: 0.0, label: { tr: 'Desen Kayması',  en: 'Pattern Shift' } },
];

// ═══════════════════════════════════════════════════════════════════
// DEFECT HEATMAP — Thresholds for color coding
// ═══════════════════════════════════════════════════════════════════

/** Defect value >= this threshold → red (high severity) */
export const DEFECT_THRESHOLD_HIGH = 2;
/** Defect value >= this threshold → orange (medium), else green */
export const DEFECT_THRESHOLD_MEDIUM = 1;

// ═══════════════════════════════════════════════════════════════════
// STATUS MATRIX — Dimensions
// ═══════════════════════════════════════════════════════════════════

/** Number of rows in the production status matrix (reduced from 9 to 5 to match the shortened table display) */
export const STATUS_MATRIX_ROWS = 5;
/** Number of columns in the production status matrix */
export const STATUS_MATRIX_COLS = 7;

/**
 * Create the initial empty status matrix.
 * Returns a 2D array of [STATUS_MATRIX_ROWS × STATUS_MATRIX_COLS] filled with null.
 * Used by simulationStore on init and reset.
 */
export const createInitialStatusMatrix = (): (string | null)[][] =>
  Array(STATUS_MATRIX_ROWS).fill(null).map(() => Array(STATUS_MATRIX_COLS).fill(null));

// ═══════════════════════════════════════════════════════════════════
// UTILITY — Derive station 3D position from index
// ═══════════════════════════════════════════════════════════════════

/**
 * Convert a station index (0–6) to its 3D world position.
 * Station at STATION_CENTER_INDEX is placed at x=0.
 *
 * Special case: index 0 (Press) uses PRESS_POSITION_X_OVERRIDE so that
 * it sits very close to the left end of the conveyor belt (x = -16),
 * visually representing the raw-material feed point of the line.
 *
 * @param index - Zero-based station index (0=Press, 6=Packaging)
 * @returns [x, y, z] world coordinates for the station group
 */
export const getStationPosition = (index: number): [number, number, number] => [
  // Press (index 0): manual override near conveyor start (x = -16)
  // Dryer (index 1): manual override to close the gap with Press
  // Glaze (index 2): shifted left 3 units from default (-4 → -7)
  // Digital Print (index 3): shifted left 3 units from default (0 → -3)
  // All other stations: standard equidistant spacing formula
  index === 0
    ? PRESS_POSITION_X_OVERRIDE
    : index === 1
      ? DRYER_POSITION_X_OVERRIDE
      : index === 2
        ? GLAZE_POSITION_X_OVERRIDE
        : index === 3
          ? DIGITAL_PRINT_POSITION_X_OVERRIDE
          : index === 6
            ? PACKAGING_POSITION_X_OVERRIDE
            : (index - STATION_CENTER_INDEX) * STATION_SPACING_3D,
  0,
  0,
];



// ═══════════════════════════════════════════════════════════════════
// VELOCITY — Pure function for base velocity computation
// ═══════════════════════════════════════════════════════════════════

/**
 * Compute the base velocity for tile and slat movement on the conveyor.
 *
 * Formula: velocity = STATION_SPACING / T_station
 *   where T_station = (sClockPeriod × stationInterval) / 1000
 *
 * This ensures tiles arrive at each station exactly on P-Clock ticks.
 *
 * @param sClockPeriod    - Interval between S-Clock ticks (ms)
 * @param stationInterval - Number of S-Clock ticks between stations
 * @returns Progress units per second (before conveyorSpeed scaling)
 *
 * @example
 * ```ts
 * computeBaseVelocity(500, 4); // 0.03125 progress units/sec
 * ```
 */
export const computeBaseVelocity = (
  sClockPeriod: number,
  stationInterval: number
): number => {
  /** Seconds required for a tile to travel between two adjacent stations */
  const T_station = (sClockPeriod * stationInterval) / 1000;
  /** Progress units per second (distance ÷ time) */
  return STATION_SPACING / T_station;
};
