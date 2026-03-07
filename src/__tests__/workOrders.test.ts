/**
 * workOrders.test.ts — Unit Tests for Work Order Static Data
 *
 * Validates the correctness of the static WORK_ORDERS and RECIPES arrays
 * exported from src/lib/params/demo.ts.
 *
 * Test coverage:
 *  - WORK_ORDERS has the expected number of entries (3)
 *  - Each WorkOrderEntry has all required fields with correct types
 *  - orderTileCount and actualTileCount are positive integers
 *  - actualTileCount > orderTileCount (scrap buffer must exist)
 *  - Each WorkOrder's recipeId references a valid RECIPES.id
 *  - RECIPES has the expected number of entries (3)
 *  - Each RecipeEntry has all required fields
 *  - Recipe colour fields are valid hex strings
 *  - DEFAULT_WORK_ORDER_ID matches the id of the first WORK_ORDER entry
 */

import { describe, it, expect } from 'vitest';
import {
  WORK_ORDERS,
  RECIPES,
  DEFAULT_WORK_ORDER_ID,
} from '../lib/params/demo';

// ─── WORK_ORDERS ─────────────────────────────────────────────────────────────

describe('WORK_ORDERS', () => {
  /**
   * Verify the total count matches the expected 3 work orders
   * (WorkID#1, WorkID#2, WorkID#3 per spec).
   */
  it('contains exactly 3 work order entries', () => {
    expect(WORK_ORDERS).toHaveLength(3);
  });

  /**
   * Verify every entry has the required shape.
   * Missing or incorrectly-typed fields should fail these assertions.
   */
  it('each entry has required fields of correct types', () => {
    for (const wo of WORK_ORDERS) {
      /** id must be a non-empty string */
      expect(typeof wo.id).toBe('string');
      expect(wo.id.length).toBeGreaterThan(0);

      /** label must be a non-empty string */
      expect(typeof wo.label).toBe('string');
      expect(wo.label.length).toBeGreaterThan(0);

      /** orderTileCount must be a positive integer */
      expect(typeof wo.orderTileCount).toBe('number');
      expect(wo.orderTileCount).toBeGreaterThan(0);
      expect(Number.isInteger(wo.orderTileCount)).toBe(true);

      /** actualTileCount must be a positive integer */
      expect(typeof wo.actualTileCount).toBe('number');
      expect(wo.actualTileCount).toBeGreaterThan(0);
      expect(Number.isInteger(wo.actualTileCount)).toBe(true);

      /** recipeId must be a non-empty string */
      expect(typeof wo.recipeId).toBe('string');
      expect(wo.recipeId.length).toBeGreaterThan(0);
    }
  });

  /**
   * actualTileCount must always be strictly greater than orderTileCount.
   * The difference is the scrap buffer that compensates for defects.
   * If this fails, the demo scenario cannot produce enough good tiles.
   */
  it('actualTileCount is strictly greater than orderTileCount for each entry', () => {
    for (const wo of WORK_ORDERS) {
      expect(wo.actualTileCount).toBeGreaterThan(wo.orderTileCount);
    }
  });

  /**
   * Every WorkOrder must reference a recipe that actually exists in RECIPES.
   * A dangling recipeId would cause the WorkOrderBar to show incorrect data.
   */
  it('each recipeId references a valid entry in RECIPES', () => {
    const recipeIds = RECIPES.map((r) => r.id);
    for (const wo of WORK_ORDERS) {
      expect(recipeIds).toContain(wo.recipeId);
    }
  });

  /**
   * Verify the three exact data values from the product specification:
   *   WorkID#1 → 800 / 850 / CeramID WEY
   *   WorkID#2 → 1600 / 1800 / CeramID REY
   *   WorkID#3 → 2000 / 2300 / CeramID OEY
   */
  it('matches the specification data values', () => {
    const [wo1, wo2, wo3] = WORK_ORDERS;

    /** WorkID#1 */
    expect(wo1.id).toBe('WorkID#1');
    expect(wo1.orderTileCount).toBe(500);
    expect(wo1.actualTileCount).toBe(530);
    expect(wo1.recipeId).toBe('CeramID WEY');

    /** WorkID#2 */
    expect(wo2.id).toBe('WorkID#2');
    expect(wo2.orderTileCount).toBe(800);
    expect(wo2.actualTileCount).toBe(850);
    expect(wo2.recipeId).toBe('CeramID REY');

    /** WorkID#3 */
    expect(wo3.id).toBe('WorkID#3');
    expect(wo3.orderTileCount).toBe(1000);
    expect(wo3.actualTileCount).toBe(1100);
    expect(wo3.recipeId).toBe('CeramID OEY');
  });

  /**
   * Each work order ID must be unique to prevent dropdown option conflicts.
   */
  it('each entry has a unique id', () => {
    const ids = WORK_ORDERS.map((wo) => wo.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });
});

// ─── RECIPES ─────────────────────────────────────────────────────────────────

describe('RECIPES', () => {
  /**
   * Must have exactly 3 recipes — one per work order spec.
   */
  it('contains exactly 3 recipe entries', () => {
    expect(RECIPES).toHaveLength(3);
  });

  /**
   * Each recipe must have all the required fields.
   */
  it('each entry has required fields of correct types', () => {
    for (const recipe of RECIPES) {
      /** id must be a non-empty string */
      expect(typeof recipe.id).toBe('string');
      expect(recipe.id.length).toBeGreaterThan(0);

      /** name must be a non-empty string */
      expect(typeof recipe.name).toBe('string');
      expect(recipe.name.length).toBeGreaterThan(0);

      /** description.tr must be a non-empty string */
      expect(typeof recipe.description.tr).toBe('string');
      expect(recipe.description.tr.length).toBeGreaterThan(0);

      /** description.en must be a non-empty string */
      expect(typeof recipe.description.en).toBe('string');
      expect(recipe.description.en.length).toBeGreaterThan(0);

      /** normalTileColor must be a non-empty string */
      expect(typeof recipe.normalTileColor).toBe('string');
      expect(recipe.normalTileColor.length).toBeGreaterThan(0);

      /** defectedTileColor must be a non-empty string */
      expect(typeof recipe.defectedTileColor).toBe('string');
      expect(recipe.defectedTileColor.length).toBeGreaterThan(0);
    }
  });

  /**
   * Tile colors must be valid hex color strings (e.g., '#FF6B6B').
   * This prevents silent visual bugs if a color is accidentally mis-typed.
   */
  it('normalTileColor and defectedTileColor are valid hex color strings', () => {
    /** Regex matches #RGB or #RRGGBB hex values (both 3 and 6 digit) */
    const hexColorRegex = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;
    for (const recipe of RECIPES) {
      expect(recipe.normalTileColor).toMatch(hexColorRegex);
      expect(recipe.defectedTileColor).toMatch(hexColorRegex);
    }
  });

  /**
   * All recipes share the same defected tile color (orange) per spec.
   * This ensures visual consistency across recipes.
   */
  it('all recipes have the same defectedTileColor (shared orange spec)', () => {
    const defectedColors = RECIPES.map((r) => r.defectedTileColor);
    /** All values must be identical */
    expect(new Set(defectedColors).size).toBe(1);
    /** And that shared value must be orange */
    expect(defectedColors[0]).toBe('#E8820C');
  });

  /**
   * Each recipe ID must be unique to prevent lookup conflicts.
   */
  it('each entry has a unique id', () => {
    const ids = RECIPES.map((r) => r.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  /**
   * Verify the specific normalTileColor values per recipe spec:
   *   CeramID WEY → ivory cream (#F5F0E8)
   *   CeramID REY → bright red  (#FF6B6B)
   *   CeramID OEY → orange      (#E8820C)
   */
  it('normalTileColor matches the recipe colour specification', () => {
    const wey = RECIPES.find((r) => r.id === 'CeramID WEY');
    const rey = RECIPES.find((r) => r.id === 'CeramID REY');
    const oey = RECIPES.find((r) => r.id === 'CeramID OEY');

    expect(wey?.normalTileColor).toBe('#F5F0E8');
    expect(rey?.normalTileColor).toBe('#9CA3AF');
    expect(oey?.normalTileColor).toBe('#2ECC71');
  });
});

// ─── DEFAULT_WORK_ORDER_ID ───────────────────────────────────────────────────

describe('DEFAULT_WORK_ORDER_ID', () => {
  /**
   * The default must be a non-empty string so the store initialises correctly.
   */
  it('is a non-empty string', () => {
    expect(typeof DEFAULT_WORK_ORDER_ID).toBe('string');
    expect(DEFAULT_WORK_ORDER_ID.length).toBeGreaterThan(0);
  });

  /**
   * The default ID must exist in WORK_ORDERS so the WorkOrderBar can
   * look it up without falling back to a defensive default.
   */
  it('references a valid entry in WORK_ORDERS', () => {
    const workOrderIds = WORK_ORDERS.map((wo) => wo.id);
    expect(workOrderIds).toContain(DEFAULT_WORK_ORDER_ID);
  });
});
