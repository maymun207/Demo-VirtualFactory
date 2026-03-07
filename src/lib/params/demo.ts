/**
 * ╔═══════════════════════════════════════════════════════════════════╗
 * ║  DEMO — Demo Settings panel entries, scenario severity colors   ║
 * ║  and Tailwind class fragments, cause-effect table colors,       ║
 * ║  and KPI badge colors.                                           ║
 * ╚═══════════════════════════════════════════════════════════════════╝
 */

// ═══════════════════════════════════════════════════════════════════
// DEMO SETTINGS — Machine sidebar definitions
// ═══════════════════════════════════════════════════════════════════

/** Entry definition for the Demo Settings sidebar machine list */
export interface DemoMachineEntry {
  /** Internal key (matches StationName or 'general') */
  key: string;
  /** Display label shown in the sidebar */
  label: string;
  /** Accent color for the sidebar indicator dot and highlight (hex) */
  color: string;
}

/** Machine sidebar list for the Demo Settings panel */
export const DEMO_SETTINGS_MACHINES: DemoMachineEntry[] = [
  { key: "press", label: "Press", color: "#00ff88" },
  { key: "dryer", label: "Dryer", color: "#22d3ee" },
  { key: "glaze", label: "Glaze", color: "#f59e0b" },
  { key: "printer", label: "Digital Print", color: "#a78bfa" },
  { key: "kiln", label: "Kiln", color: "#ef4444" },
  { key: "sorting", label: "Sorting", color: "#f472b6" },
  { key: "packaging", label: "Packaging", color: "#60a5fa" },
  /** Conveyor tab replaces the old General tab — shows per-scenario conveyor settings */
  { key: "conveyor", label: "Conveyor", color: "#38bdf8" },
];

/** Default parameter drift percentage for Demo Settings inputs */
export const DEFAULT_DRIFT_LIMIT = 5;

// ═══════════════════════════════════════════════════════════════════
// DEFECT ENGINE — Per-station parameter-driven defect injection
// ═══════════════════════════════════════════════════════════════════

/**
 * Probability (0–1) that an out-of-range parameter actually causes a defect
 * on the tile passing through that station. Per user specification, set to 20%.
 * This introduces realistic randomness: exceeding a threshold does NOT always
 * guarantee a defect — it only increases the risk.
 */
export const DEFECT_RANDOM_CHANCE = 0.20;

/**
 * Severity threshold (0–1) above which a tile is automatically marked for
 * scrapping at the sorting station. Tiles with accumulated severity below
 * this threshold may still pass as second or third quality.
 */
export const DEFECT_SCRAP_SEVERITY_THRESHOLD = 0.8;

/**
 * Severity-level color map for defect scenario cards.
 * Used by DemoSettingsPanel to color-code scenario severity indicators.
 */
export const SCENARIO_SEVERITY_COLORS: Record<string, string> = {
  /** Low severity — all parameters within optimal ranges */
  low: "#22c55e",
  /** Medium severity — minor parameter deviations */
  medium: "#3b82f6",
  /** High severity — significant parameter deviations */
  high: "#f59e0b",
  /** Critical severity — severe/cascading parameter failures */
  critical: "#ef4444",
} as const;

/**
 * Tailwind-compatible class fragments for scenario severity level styling.
 * Provides bg, text, border, and glow classes for each severity level.
 * Used in DemoSettingsPanel scenario cards and severity indicators.
 */
export const SCENARIO_SEVERITY_CLASSES: Record<
  string,
  {
    /** Background class (e.g., 'bg-emerald-500/15') */
    bg: string;
    /** Text color class (e.g., 'text-emerald-400') */
    text: string;
    /** Border class (e.g., 'border-emerald-500/30') */
    border: string;
    /** Glow/shadow class (e.g., 'shadow-emerald-500/20') */
    glow: string;
  }
> = {
  /** Low severity — all parameters within optimal ranges */
  low: {
    bg: "bg-emerald-500/15",
    text: "text-emerald-400",
    border: "border-emerald-500/30",
    glow: "shadow-emerald-500/20",
  },
  /** Medium severity — minor parameter deviations */
  medium: {
    bg: "bg-blue-500/15",
    text: "text-blue-400",
    border: "border-blue-500/30",
    glow: "shadow-blue-500/20",
  },
  /** High severity — significant parameter deviations */
  high: {
    bg: "bg-amber-500/15",
    text: "text-amber-400",
    border: "border-amber-500/30",
    glow: "shadow-amber-500/20",
  },
  /** Critical severity — severe/cascading parameter failures */
  critical: {
    bg: "bg-red-500/15",
    text: "text-red-400",
    border: "border-red-500/30",
    glow: "shadow-red-500/20",
  },
} as const;

/**
 * Color map for cause-effect table row severity indicators.
 * Maps semantic severity names to hex color values.
 */
export const CAUSE_EFFECT_SEVERITY_COLORS: Record<string, string> = {
  /** Red — critical deviation with high defect probability */
  red: "#ef4444",
  /** Orange — warning-level deviation */
  orange: "#f59e0b",
  /** Green — within normal operating range */
  green: "#22c55e",
} as const;

/**
 * Color map for KPI impact badges in the cause-effect table.
 * Each KPI gets a distinct accent color for visual differentiation.
 */
export const KPI_BADGE_COLORS: Record<string, string> = {
  /** OEE — Overall Equipment Effectiveness badge color */
  oee: "#22c55e",
  /** FTQ — First Time Quality badge color */
  ftq: "#06b6d4",
  /** Scrap — Scrap rate badge color */
  scrap: "#f59e0b",
  /** Energy — Energy consumption badge color */
  energy: "#ef4444",
} as const;

// ═══════════════════════════════════════════════════════════════════
// WORK ORDER DEFINITIONS
// ═══════════════════════════════════════════════════════════════════
//
// This section defines the static Work Order data used by the
// WorkOrderBar component and the WorkOrder simulation enforcer.
//
// A "Work Order" represents a production batch:
//   - orderTileCount:  the number of good (non-defected) tiles requested
//   - actualTileCount: the total tiles to press (accounts for expected scrap)
//   - recipeId:        links to a RecipeEntry below
//
// These values are intentionally static (demo data). In a production
// system they would be loaded from an ERP or production planning system.
// ═══════════════════════════════════════════════════════════════════

/**
 * A single Work Order entry defining a production batch.
 * The WorkOrderBar component reads these to populate its dropdown and
 * info windows. The WorkOrder enforcer reads actualTileCount to know
 * when to stop the Press machine.
 */
export interface WorkOrderEntry {
  /** Unique identifier for this work order (e.g., 'WorkID#1') */
  id: string;
  /** Human-readable label shown in the dropdown menu */
  label: string;
  /** The number of GOOD tiles the customer ordered (Order Tile Count) */
  orderTileCount: number;
  /**
   * The total number of tiles to press before stopping the simulation.
   * Higher than orderTileCount to compensate for expected defect/scrap rate.
   */
  actualTileCount: number;
  /**
   * Production lot identifier displayed in the Tile Passport.
   * Unique per work order — used to trace tiles back to their production batch.
   */
  lotId: string;
  /**
   * Customer order reference number displayed in the Tile Passport.
   * Mirrors the sales/ERP order that triggered this production batch.
   */
  orderId: string;
  /** References a RecipeEntry.id — defines tile colour and defect colour */
  recipeId: string;
}

/**
 * A recipe (reçete) defines the visual and quality properties of
 * the tiles produced for a work order.
 * Tile colors are used by the visual layer (ConveyorBelt) to render
 * normal and defected tiles in the correct colour for each recipe.
 */
export interface RecipeEntry {
  /** Unique identifier matching WorkOrderEntry.recipeId */
  id: string;
  /** Display name shown in the WorkOrderBar recipe window */
  name: string;
  /**
   * Human-readable description of this recipe's visual characteristics.
   * Available in both Turkish and English for bilingual UI support.
   */
  description: {
    /** Turkish description */
    tr: string;
    /** English description */
    en: string;
  };
  /**
   * Hex colour code for NORMAL (non-defected) tiles produced by this recipe.
   * Used by the 3D conveyor tile renderer to visually distinguish recipes.
   */
  normalTileColor: string;
  /**
   * Hex colour code for DEFECTED tiles produced by this recipe.
   * All recipes share the same defected colour (grey) per spec.
   */
  defectedTileColor: string;
}

/**
 * The default Work Order ID selected when the WorkOrderBar first renders.
 * Exported as a param so it can be changed from a single location.
 */
export const DEFAULT_WORK_ORDER_ID = "WorkID#1";

/**
 * Static list of all available Work Orders for the demo.
 *
 * WorkID#1 → 500 order / 530 actual / CeramID WEY
 * WorkID#2 → 800 order / 850 actual / CeramID REY
 * WorkID#3 → 1000 order / 1100 actual / CeramID OEY
 */
export const WORK_ORDERS: WorkOrderEntry[] = [
  {
    /** First work order — small batch, ivory/cream tile recipe */
    id: "WorkID#1",
    label: "WorkID #1",
    /** Customer ordered 800 good tiles */
    orderTileCount: 500,
    /** Press 530 tiles total to absorb expected defect/scrap losses */
    actualTileCount: 530,
    /** Production lot identifier for this batch */
    lotId: "LOT-2026-001",
    /** Customer order reference number */
    orderId: "ORD-7845",
    /** Links to CeramID WEY recipe (fildişi/krem rengi) */
    recipeId: "CeramID WEY",
  },
  {
    /** Second work order — medium batch, red tile recipe */
    id: "WorkID#2",
    label: "WorkID #2",
    /** Customer ordered 800 good tiles */
    orderTileCount: 800,
    /** Press 850 tiles total to absorb expected defect/scrap losses */
    actualTileCount: 850,
    /** Production lot identifier for this batch */
    lotId: "LOT-2026-002",
    /** Customer order reference number */
    orderId: "ORD-8210",
    /** Links to CeramID REY recipe (açık parlak kırmızı) */
    recipeId: "CeramID REY",
  },
  {
    /** Third work order — large batch, orange tile recipe */
    id: "WorkID#3",
    label: "WorkID #3",
    /** Customer ordered 1000 good tiles */
    orderTileCount: 1000,
    /** Press 1100 tiles total to absorb expected defect/scrap losses */
    actualTileCount: 1100,
    /** Production lot identifier for this batch */
    lotId: "LOT-2026-003",
    /** Customer order reference number */
    orderId: "ORD-9033",
    /** Links to CeramID OEY recipe (turuncu renk) */
    recipeId: "CeramID OEY",
  },
] as const;

/**
 * Static list of all ceramic tile recipes used in the demo.
 *
 * Each recipe describes:
 *  - The colour of normal (non-defected) tiles
 *  - The colour of defected tiles (always grey per spec)
 *  - A bilingual description of the visual spec
 */
export const RECIPES: RecipeEntry[] = [
  {
    /** Fildişi/Krem — ivory cream coloured tiles */
    id: "CeramID WEY",
    name: "CeramID WEY",
    description: {
      /** Turkish: normal tiles are ivory-cream, defected tiles are orange */
      tr: "Üretilen karoların rengi fildişi krem rengi olacak — defected olarak işaretlenen karoların rengi turuncu olacak",
      /** English: normal tiles are ivory-cream, defected tiles are orange */
      en: "Produced tiles will be ivory cream colour — defected tiles will be orange",
    },
    /** Ivory/cream hex — warm off-white */
    normalTileColor: "#F5F0E8",
    /** Defected tiles are always orange regardless of recipe */
    defectedTileColor: "#E8820C",
  },
  {
    /** Açık Parlak Kırmızı — grey tiles */
    id: "CeramID REY",
    name: "CeramID REY",
    description: {
      /** Turkish: normal tiles are grey, defected tiles are orange */
      tr: "Üretilen karoların rengi gri olacak — defected olarak işaretlenen karoların rengi turuncu olacak",
      /** English: normal tiles are grey, defected tiles are orange */
      en: "Produced tiles will be grey — defected tiles will be orange",
    },
    /** Grey hex — neutral mid-grey */
    normalTileColor: "#9CA3AF",
    /** Defected tiles are always orange regardless of recipe */
    defectedTileColor: "#E8820C",
  },
  {
    /** Yeşil — green tiles */
    id: "CeramID OEY",
    name: "CeramID OEY",
    description: {
      /** Turkish: normal tiles are green, defected tiles are orange */
      tr: "Üretilen karoların rengi yeşil olacak — defected olarak işaretlenen karoların rengi turuncu olacak",
      /** English: normal tiles are green, defected tiles are orange */
      en: "Produced tiles will be green — defected tiles will be orange",
    },
    /** Green hex — vivid emerald green */
    normalTileColor: "#2ECC71",
    /** Defected tiles are always orange regardless of recipe */
    defectedTileColor: "#E8820C",
  },
] as const;
