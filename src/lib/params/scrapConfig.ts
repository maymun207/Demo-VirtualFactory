/**
 * ╔═══════════════════════════════════════════════════════════════════╗
 * ║  SCRAP CONFIGURATION — Per-station scrap defect classification  ║
 * ║                                                                   ║
 * ║  Defines which defect types are classified as SCRAP (tile is      ║
 * ║  structurally unusable and must be discarded) vs. SECOND QUALITY  ║
 * ║  (tile has cosmetic/functional imperfections but is still usable).║
 * ║                                                                   ║
 * ║  Also defines which defect types are detected and auto-scrapped   ║
 * ║  at the Sorting station (oversized/warped tiles).                 ║
 * ║                                                                   ║
 * ║  All sets are configurable — add or remove defect types here to   ║
 * ║  change the classification without modifying engine logic.        ║
 * ╚═══════════════════════════════════════════════════════════════════╝
 */

import type { DefectType } from '../../store/types';

// =============================================================================
// SCRAP-WORTHY DEFECT TYPES — Structural / Irreversible Damage
// =============================================================================

/**
 * SCRAP_DEFECT_TYPES — Set of defect types that render a tile completely
 * unusable. Tiles with ANY of these defects are classified as 'scrap'.
 *
 * These represent structural failures where the tile's physical integrity
 * is compromised beyond recovery:
 *   - crack_press      — Fracture during pressing due to insufficient pressure
 *   - lamination       — Layer separation within the tile body
 *   - explosion_dry    — Tile shatters during rapid drying (steam pressure)
 *   - crack_kiln       — Fracture during firing from thermal stress
 *   - thermal_shock_crack — Crack from excessively rapid cooling gradient
 *   - crush_damage     — Tile crushed during packaging due to low wrap tension
 *   - conveyor_jam_damage — Physical damage from conveyor belt jam event
 *
 * To add a new scrap-worthy defect type, add it to this set.
 * To reclassify a defect as second quality, remove it from this set.
 */
export const SCRAP_DEFECT_TYPES: ReadonlySet<DefectType> = new Set<DefectType>([
    'crack_press',
    'lamination',
    'explosion_dry',
    'crack_kiln',
    'thermal_shock_crack',
    'crush_damage',
    'conveyor_jam_damage',
]);

// =============================================================================
// SORTING STATION WARP DETECTION — Auto-Scrapped at Sorting
// =============================================================================

/**
 * SORTING_WARP_DEFECT_TYPES — Set of defect types that the Sorting station's
 * dimensional scanner can detect. Tiles with these defects are automatically
 * scrapped at the Sorting station regardless of other defect classifications.
 *
 * These represent warping/dimensional issues that make the tile physically
 * out-of-spec and detectable by the Sorting station's flatness & size sensors:
 *   - warp_kiln          — Warped tile from uneven kiln cooling
 *   - warp_dry           — Warped tile from uneven dryer airflow
 *   - size_variance_kiln — Tile dimensions outside tolerance from kiln issues
 *   - dimension_variance — Tile dimensions outside tolerance from press issues
 *
 * To add new warp/size defects detectable at sorting, add them to this set.
 */
export const SORTING_WARP_DEFECT_TYPES: ReadonlySet<DefectType> = new Set<DefectType>([
    'warp_kiln',
    'warp_dry',
    'size_variance_kiln',
    'dimension_variance',
]);

// =============================================================================
// SCRAP PROBABILITY DEFAULT
// =============================================================================

/**
 * DEFAULT_SCRAP_PROBABILITY — Global probability (0–1) that a tile classified
 * as scrap is physically discarded (animated to the recycle bin) at the
 * station where the scrap defect was detected.
 *
 * When the random roll succeeds (< this probability):
 *   → The tile animates from its current station to the waste bin via arc.
 *   → The tile is counted as scrap in OEE calculations.
 *
 * When the random roll fails (>= this probability):
 *   → The tile is still marked as scrap in the tile passport.
 *   → The tile continues to the Sorting station where it is discarded normally.
 *   → The tile is still counted as scrap in OEE calculations.
 *
 * This value is adjustable via the Conveyor Settings panel in Demo Settings.
 * Stored as whole percentage (e.g. 2 = 2%). Valid range: 1–3%. Default: 2%.
 * Converted to 0–1 fraction only at the random-check consumption point.
 */
export const DEFAULT_SCRAP_PROBABILITY = 2;
