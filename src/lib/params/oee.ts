/**
 * oee.ts — OEE Configuration Constants
 *
 * SINGLE SOURCE OF TRUTH for all OEE-related constants.
 * Isolated module for clean fine-tuning without touching calculation logic.
 *
 * TICK-BASED MODEL (not time-based):
 *   The simulator spawns 1 tile per P-Clock tick.
 *   P-Clock fires every `stationInterval` S-Clock ticks.
 *   Theoretical output = sClockCount / stationInterval × HEADROOM.
 *
 *   This approach is ALWAYS correct regardless of sClockPeriod or
 *   stationInterval slider settings, because it measures in the same
 *   unit (ticks) that the simulator actually uses to produce tiles.
 *
 * WHY NOT TIME-BASED:
 *   The old approach used DEFAULT_S_CLOCK_PERIOD (400ms) and
 *   DEFAULT_STATION_INTERVAL (2) to compute tiles-per-minute rates.
 *   But both values are runtime sliders the user can change.
 *   If stationInterval=1 instead of 2, actual output is 2× theoretical
 *   → LOEE exceeds 100% (the exact bug seen: 169% and 167%).
 */

// ═══════════════════════════════════════════════════════════════
// THEORETICAL RATE TUNING — Tick-based (no timer dependency)
// ═══════════════════════════════════════════════════════════════

/**
 * Headroom factor for theoretical capacity.
 *
 * In real factories, "theoretical" capacity is always slightly above
 * actual achievable rate (micro-stops, settling, startup delay).
 * Without headroom: P = tiles/tiles = 100% always.
 * With 5% headroom: P = tiles/(tiles×1.05) = 95.2% max → realistic.
 *
 * Tune: 1.00 = no headroom, 1.05 = recommended, 1.10 = aggressive.
 */
export const THEORETICAL_RATE_HEADROOM = 1.05;

/**
 * Kiln bottleneck factor: kiln theoretical as fraction of press theoretical.
 *
 * In the simulator, all stations process at P-Clock rate — no real
 * throughput bottleneck. Set to 1.0 so A = B and every lost tile
 * reduces FOEE immediately.
 *
 * Tune: 1.00 = no bottleneck, 0.85 = kiln is 15% slower than press.
 */
export const KILN_BOTTLENECK_FACTOR = 1.0;

/**
 * @deprecated — kept for backward compatibility (OEE panel display, etc.)
 * The OEE calculation engine (oeeCalculations.ts) uses tick-based
 * THEORETICAL_RATE_HEADROOM and KILN_BOTTLENECK_FACTOR directly.
 * These values assume default settings and may be inaccurate at runtime.
 */
export const PRESS_THEORETICAL_RATE = 75 * THEORETICAL_RATE_HEADROOM;
export const KILN_THEORETICAL_RATE = PRESS_THEORETICAL_RATE * KILN_BOTTLENECK_FACTOR;

// ═══════════════════════════════════════════════════════════════
// LINE DEFINITIONS
// ═══════════════════════════════════════════════════════════════

export const LINE_DEFINITIONS = {
    line1: {
        id: 'line1' as const,
        name: { tr: 'Hat 1 — Şekillendirme & Baskı', en: 'Line 1 — Forming & Finishing' },
        stations: ['press', 'dryer', 'glaze', 'printer'] as const,
        theoreticalRateSymbol: 'A' as const,
        theoreticalRate: PRESS_THEORETICAL_RATE,
    },
    line2: {
        id: 'line2' as const,
        name: { tr: 'Hat 2 — Pişirme & Sevkiyat', en: 'Line 2 — Firing & Dispatch' },
        stations: ['kiln', 'sorting', 'packaging'] as const,
        theoreticalRateSymbol: 'B' as const,
        theoreticalRate: KILN_THEORETICAL_RATE,
    },
    line3: {
        id: 'line3' as const,
        name: { tr: 'Hat 3 — Konveyör', en: 'Line 3 — Conveyor' },
        stations: ['conveyor'] as const,
        theoreticalRateSymbol: null,
        theoreticalRate: null,
    },
} as const;

/** Identifies one of the three production lines. */
export type LineId = keyof typeof LINE_DEFINITIONS;

// ═══════════════════════════════════════════════════════════════
// OEE MACHINE ORDER — All 8 machines for OEE tracking
// ═══════════════════════════════════════════════════════════════

/** OEE tracks 8 machines (7 stations + conveyor).
 *  NOTE: StationName stays as 7 stations. OEEMachineId is a SEPARATE type. */
export const OEE_MACHINE_ORDER = [
    'press', 'dryer', 'glaze', 'printer',
    'conveyor',
    'kiln', 'sorting', 'packaging',
] as const;

/** Identifies one of the 8 OEE-tracked machines (7 stations + conveyor). */
export type OEEMachineId = (typeof OEE_MACHINE_ORDER)[number];

// ═══════════════════════════════════════════════════════════════
// DISPLAY THRESHOLDS — Color coding for the UI
// ═══════════════════════════════════════════════════════════════

/** OEE >= this → green (world-class) */
export const OEE_THRESHOLD_GOOD = 85;
/** OEE >= this → yellow (acceptable), below → red (needs attention) */
export const OEE_THRESHOLD_WARNING = 65;

// ═══════════════════════════════════════════════════════════════
// CONVEYOR ENERGY — Belt motor energy consumption
// ═══════════════════════════════════════════════════════════════

/** Conveyor belt motor energy parameters.
 *  Strongly speed-dependent (motor works harder at higher speeds).
 *  Nearly zero when stopped. */
export const CONVEYOR_ENERGY_KWH = {
    base: 5,
    minEffect: -0.3,
    maxEffect: 0.5,
    idleFactor: 0.1,
} as const;

// ═══════════════════════════════════════════════════════════════
// MACHINE DISPLAY NAMES (bilingual)
// ═══════════════════════════════════════════════════════════════

/** Bilingual display names for all 8 OEE machines. */
export const OEE_MACHINE_NAMES: Record<OEEMachineId, { tr: string; en: string }> = {
    press: { tr: 'Pres', en: 'Press' },
    dryer: { tr: 'Kurutucu', en: 'Dryer' },
    glaze: { tr: 'Sırlama', en: 'Glaze' },
    printer: { tr: 'Dijital Baskı', en: 'Digital' },
    conveyor: { tr: 'Konveyör', en: 'Conveyor' },
    kiln: { tr: 'Fırın', en: 'Kiln' },
    sorting: { tr: 'Seçme', en: 'Sorting' },
    packaging: { tr: 'Paketleme', en: 'Packaging' },
};
