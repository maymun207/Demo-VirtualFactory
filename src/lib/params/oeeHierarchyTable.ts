/**
 * oeeHierarchyTable.ts — OEE Hierarchy 3D Table Configuration Constants
 *
 * SINGLE SOURCE OF TRUTH for all configurable parameters used by the
 * OEEHierarchyTable3D component. Covers column labels, color thresholds,
 * 3D world-space layout, text sizes, and material properties.
 *
 * The table is a 3D object rendered inside the R3F <Canvas> scene,
 * positioned above the factory and tilted toward the camera.
 *
 * Used by: OEEHierarchyTable3D.tsx, oeeHierarchyTable.test.ts
 */

// ═══════════════════════════════════════════════════════════════════
// PANEL TITLE — Bilingual title rendered as 3D text above the table
// ═══════════════════════════════════════════════════════════════════

/** Header title rendered in 3D text above the table mesh */
export const OEE_HIERARCHY_TITLE = {
    /** Turkish label for the 3D table header */
    tr: 'Fabrika OEE Hiyerarşisi',
    /** English label for the 3D table header */
    en: 'Factory OEE Hierarchy',
} as const;

// ═══════════════════════════════════════════════════════════════════
// COLUMN HEADERS — Bilingual labels for the 6 metric columns
// ═══════════════════════════════════════════════════════════════════

/**
 * Each entry defines a metric column with its unique ID, bilingual labels,
 * unit suffix, and number of decimal places for display formatting.
 */
export const OEE_HIERARCHY_COLUMNS = [
    {
        /** Unique metric identifier used for data lookups */
        id: 'oee' as const,
        /** Turkish column header label */
        labelTr: 'OEE',
        /** English column header label */
        labelEn: 'OEE',
        /** Unit suffix appended after the numeric value */
        unit: '%',
        /** Number of decimal places for display formatting */
        decimals: 1,
    },
    {
        /** Unique metric identifier used for data lookups */
        id: 'scrap' as const,
        /** Turkish column header label */
        labelTr: 'Hurda',
        /** English column header label */
        labelEn: 'Scrap',
        /** Unit suffix (empty = raw count) */
        unit: '',
        /** Number of decimal places for display formatting */
        decimals: 0,
    },
    {
        /** Unique metric identifier used for data lookups */
        id: 'defect' as const,
        /** Turkish column header label */
        labelTr: 'Hata',
        /** English column header label */
        labelEn: 'Defect',
        /** Unit suffix appended after the numeric value */
        unit: '%',
        /** Number of decimal places for display formatting */
        decimals: 1,
    },
    {
        /** Unique metric identifier used for data lookups */
        id: 'kwh' as const,
        /** Turkish column header label */
        labelTr: 'kWh',
        /** English column header label */
        labelEn: 'kWh',
        /** Unit suffix (empty — the label itself is the unit) */
        unit: '',
        /** Number of decimal places for display formatting */
        decimals: 1,
    },
    {
        /** Unique metric identifier used for data lookups */
        id: 'gas' as const,
        /** Turkish column header label */
        labelTr: 'Gaz',
        /** English column header label */
        labelEn: 'Gas',
        /** Unit suffix appended after the numeric value */
        unit: 'm³',
        /** Number of decimal places for display formatting */
        decimals: 1,
    },
    {
        /** Unique metric identifier used for data lookups */
        id: 'co2' as const,
        /** Turkish column header label */
        labelTr: 'CO₂',
        /** English column header label */
        labelEn: 'CO₂',
        /** Unit suffix appended after the numeric value */
        unit: 'kg',
        /** Number of decimal places for display formatting */
        decimals: 1,
    },
] as const;

/** Union type of all valid metric column IDs */
export type OEEHierarchyMetricId = (typeof OEE_HIERARCHY_COLUMNS)[number]['id'];

// ═══════════════════════════════════════════════════════════════════
// COLOR THRESHOLDS — Determines cell color based on metric value
// ═══════════════════════════════════════════════════════════════════

/**
 * For each metric, defines thresholds that determine the cell's color:
 *   - `good`:   value >= good → green
 *   - `warn`:   value >= warn → amber
 *   - below warn → red
 *   - `invert`: if true, LOWER is better (scrap, defect, co2, etc.)
 *
 * When `invert` is true, the logic is reversed:
 *   - value <= good → green
 *   - value <= warn → amber
 *   - above warn → red
 */
export const OEE_HIERARCHY_THRESHOLDS: Record<
    OEEHierarchyMetricId,
    { good: number; warn: number; invert: boolean }
> = {
    /** OEE ≥ 85 = green, ≥ 65 = amber, < 65 = red */
    oee: { good: 85, warn: 65, invert: false },
    /** Scrap ≤ 1 = green, ≤ 3 = amber, > 3 = red */
    scrap: { good: 1, warn: 3, invert: true },
    /** Defect ≤ 1% = green, ≤ 3% = amber, > 3% = red */
    defect: { good: 1, warn: 3, invert: true },
    /** kWh — no color coding (always neutral) */
    kwh: { good: 0, warn: 0, invert: false },
    /** Gas — no color coding (always neutral) */
    gas: { good: 0, warn: 0, invert: false },
    /** CO₂ — no color coding (always neutral) */
    co2: { good: 0, warn: 0, invert: false },
};

// ═══════════════════════════════════════════════════════════════════
// 3D WORLD POSITION — Where the table sits in the factory scene
// ═══════════════════════════════════════════════════════════════════

/** World-space position [x, y, z] of the OEE 3D table origin.
 *  Placed above the factory (y=6.5) and behind the conveyor (z=-7)
 *  so it floats like a holographic dashboard above the production line. */
export const OEE_TABLE_3D_POSITION: [number, number, number] = [0, 6.5, -7];

/** Euler rotation [x, y, z] of the OEE 3D table.
 *  Tilted ~30° toward the camera for comfortable reading.
 *  Matches the same viewing angle philosophy as ProductionTable3D. */
export const OEE_TABLE_3D_ROTATION: [number, number, number] = [-Math.PI / 6, 0, 0];

// ═══════════════════════════════════════════════════════════════════
// 3D TABLE DIMENSIONS — Mesh sizes in world units
// ═══════════════════════════════════════════════════════════════════

/** Total width of the 3D table mesh (world units) */
export const OEE_TABLE_3D_WIDTH = 30.8;
/** Total height of the 3D table mesh (world units) */
export const OEE_TABLE_3D_HEIGHT = 13.2;
/** Depth of the base plate mesh (very thin for a flat panel look) */
export const OEE_TABLE_3D_BASE_DEPTH = 0.05;
/** Depth of the outer border glow mesh (slightly behind the base) */
export const OEE_TABLE_3D_BORDER_DEPTH = 0.02;
/** Padding around the base beyond the content area */
export const OEE_TABLE_3D_BASE_PADDING = 0.66;
/** Padding around the outer glow border */
export const OEE_TABLE_3D_BORDER_PADDING = 0.88;

// ═══════════════════════════════════════════════════════════════════
// 3D TABLE LAYOUT — Row/column spacing in world units
// ═══════════════════════════════════════════════════════════════════

/** Height of the header row (column labels) */
export const OEE_TABLE_3D_HEADER_HEIGHT = 0.88;
/** Height of the factory aggregate row */
export const OEE_TABLE_3D_FACTORY_ROW_HEIGHT = 0.99;
/** Height of each line row */
export const OEE_TABLE_3D_LINE_ROW_HEIGHT = 0.77;
/** Height of each machine row */
export const OEE_TABLE_3D_MACHINE_ROW_HEIGHT = 0.605;
/** Width of the first column (row names: Factory, Line, Machine) */
export const OEE_TABLE_3D_NAME_COL_WIDTH = 6.6;
/** Width of each metric data column */
export const OEE_TABLE_3D_DATA_COL_WIDTH = 3.85;

// ═══════════════════════════════════════════════════════════════════
// 3D TEXT — Font sizes in world units (used by @react-three/drei <Text>)
// ═══════════════════════════════════════════════════════════════════

/** Title text size (rendered above the table) */
export const OEE_TABLE_3D_TITLE_SIZE = 0.605;
/** Column header text size */
export const OEE_TABLE_3D_HEADER_SIZE = 0.385;
/** Factory row text size (bold, larger) */
export const OEE_TABLE_3D_FACTORY_TEXT_SIZE = 0.495;
/** Line row text size */
export const OEE_TABLE_3D_LINE_TEXT_SIZE = 0.418;
/** Machine row text size (smaller, more compact) */
export const OEE_TABLE_3D_MACHINE_TEXT_SIZE = 0.33;

// ═══════════════════════════════════════════════════════════════════
// 3D MATERIALS — Colors and glow settings for the table mesh
// ═══════════════════════════════════════════════════════════════════

/** Background color of the table base plate */
export const OEE_TABLE_3D_BG_COLOR = '#0a0a1a';
/** Opacity of the base plate (translucent for glassmorphism) */
export const OEE_TABLE_3D_BG_OPACITY = 0.85;
/** Roughness of the base plate material */
export const OEE_TABLE_3D_BG_ROUGHNESS = 0.3;
/** Metalness of the base plate material */
export const OEE_TABLE_3D_BG_METALNESS = 0.1;
/** Outer border glow color (indigo) */
export const OEE_TABLE_3D_BORDER_COLOR = '#6366f1';
/** Emissive intensity of the border glow */
export const OEE_TABLE_3D_BORDER_EMISSIVE_INTENSITY = 0.6;
/** Grid line color (thin separators between rows) */
export const OEE_TABLE_3D_GRID_COLOR = '#4f46e5';
/** Grid line opacity */
export const OEE_TABLE_3D_GRID_OPACITY = 0.2;
/** Grid line thickness (height of the plane geometry) */
export const OEE_TABLE_3D_GRID_THICKNESS = 0.02;
/** Z-offset for the factory row highlight (between base face and grid) */
export const OEE_TABLE_3D_FACTORY_ROW_Z = 0.028;
/** Z-offset for grid lines (slightly in front of the base) */
export const OEE_TABLE_3D_GRID_Z = 0.03;
/** Z-offset for text content (in front of grid) */
export const OEE_TABLE_3D_CONTENT_Z = 0.04;
/** Z-offset for the border glow mesh (behind the base) */
export const OEE_TABLE_3D_BORDER_Z = -0.01;

// ═══════════════════════════════════════════════════════════════════
// 3D METRIC COLORS — Named hex colors for the threshold-based coloring
// ═══════════════════════════════════════════════════════════════════

/** Color for values at "good" threshold */
export const OEE_TABLE_3D_COLOR_GOOD = '#34d399';
/** Color for values at "warn" threshold */
export const OEE_TABLE_3D_COLOR_WARN = '#fbbf24';
/** Color for values below "warn" threshold (bad) */
export const OEE_TABLE_3D_COLOR_BAD = '#f87171';
/** Color for neutral/informational metrics (kWh, Gas, CO₂) */
export const OEE_TABLE_3D_COLOR_NEUTRAL = '#93c5fd';
/** Color for row header labels and factory icon text */
export const OEE_TABLE_3D_COLOR_LABEL = '#e0e7ff';
/** Color for machine-level row labels (dimmer) */
export const OEE_TABLE_3D_COLOR_MACHINE_LABEL = '#94a3b8';
/** Color for column header text */
export const OEE_TABLE_3D_COLOR_HEADER = '#a5b4fc';
/** Color for the factory row background mesh */
export const OEE_TABLE_3D_FACTORY_ROW_BG = '#312e81';
/** Opacity of the factory row background mesh */
export const OEE_TABLE_3D_FACTORY_ROW_BG_OPACITY = 0.3;
/** Color for the line row background mesh (slightly lighter indigo for hierarchy) */
export const OEE_TABLE_3D_LINE_ROW_BG = '#312e81';
/** Opacity of the line row background mesh */
export const OEE_TABLE_3D_LINE_ROW_BG_OPACITY = 0.35;
/** Left-edge X padding for left-aligned row name labels (world units from left) */
export const OEE_TABLE_3D_NAME_LEFT_PADDING = 0.5;

// ═══════════════════════════════════════════════════════════════════
// ROW LABELS — Bilingual labels for hierarchy level rows
// ═══════════════════════════════════════════════════════════════════

/** Label for the top-level factory aggregate row */
export const OEE_HIERARCHY_FACTORY_LABEL = {
    /** Turkish label for the factory row */
    tr: 'Fabrika',
    /** English label for the factory row */
    en: 'Factory',
} as const;

/** Labels for each hierarchy level indicator (shown in row headers) */
export const OEE_HIERARCHY_LEVEL_LABELS = {
    /** Turkish label for production line rows */
    lineTr: 'Hat',
    /** English label for production line rows */
    lineEn: 'Line',
    /** Turkish label for machine rows */
    machineTr: 'Makine',
    /** English label for machine rows */
    machineEn: 'Machine',
} as const;

// ═══════════════════════════════════════════════════════════════════
// NO-DATA PLACEHOLDER — Shown when simulation hasn't started yet
// ═══════════════════════════════════════════════════════════════════

/** Placeholder text displayed when no OEE data is available */
export const OEE_HIERARCHY_NO_DATA = {
    /** Turkish "no data" text */
    tr: 'Simülasyon başlatıldığında veriler burada görüntülenecek.',
    /** English "no data" text */
    en: 'Data will appear here when the simulation starts.',
} as const;
