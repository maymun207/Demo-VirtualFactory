/**
 * WorkOrderBar.tsx — Work Order Selection Bar Component
 *
 * Renders a horizontal bar above the Scenario Selector Cards in the
 * Demo Settings panel. The bar contains:
 *
 *   [WorkID Dropdown] | [Order Qty Window] | [Production Qty Window] | [Recipe Window]
 *
 * Behaviour:
 *  - User selects a Work Order ID from the dropdown
 *  - The three info windows update reactively to show the selected
 *    Work Order's orderTileCount, actualTileCount, and recipe name
 *  - Selection is persisted to workOrderStore (Zustand) so it survives
 *    panel close/open cycles and scenario switches
 *  - Bilingual: all labels respect the currentLang prop (tr/en)
 *
 * Architecture:
 *  - Reads and writes to workOrderStore for selected ID
 *  - Reads WORK_ORDERS and RECIPES from lib/params/demo.ts (no hard-coded values)
 *  - Contains an inline InfoWindow sub-component for the three display panes
 *
 * Used by: DemoSettingsPanel (inserted above the Scenario Selector Cards)
 */

import { useWorkOrderStore } from "../../store/workOrderStore";
import { WORK_ORDERS, RECIPES } from "../../lib/params/demo";
import type { Language } from "../../store/uiStore";

// ═══════════════════════════════════════════════════════════════════
// TRANSLATIONS
// ═══════════════════════════════════════════════════════════════════

/**
 * Bilingual label strings for the WorkOrderBar component.
 * All user-facing text is sourced from here — no inline string literals.
 */
const LABELS = {
  /** Section heading label */
  workOrder: { tr: "İş Emri", en: "Work Order" },
  /** Dropdown label */
  workId: { tr: "İş Emri ID", en: "Work ID" },
  /** Order quantity info window label */
  orderQty: { tr: "Sipariş Miktarı", en: "Order Quantity" },
  /** Production quantity info window label (tiles to press) */
  prodQty: { tr: "Üretim Miktarı", en: "Qty to Produce" },
  /** Recipe name info window label */
  recipe: { tr: "Reçete Adı", en: "Recipe Name" },
  /** Unit label shown next to tile counts */
  unit: { tr: "karo", en: "tiles" },
} as const;

// ═══════════════════════════════════════════════════════════════════
// InfoWindow Sub-Component
// ═══════════════════════════════════════════════════════════════════

/**
 * Props for the InfoWindow sub-component.
 */
interface InfoWindowProps {
  /** Short label shown above the value (e.g., "Order Quantity") */
  label: string;
  /** The main value to display (e.g., "800", "CeramID WEY") */
  value: string | number;
  /** Optional unit suffix displayed after the value */
  unit?: string;
  /** Optional accent colour for the left border of the window */
  accentColor?: string;
}

/**
 * InfoWindow — A single read-only display pane showing a label + value.
 *
 * Used by WorkOrderBar to display Order Qty, Production Qty, and Recipe Name.
 * Styled as a glassmorphism card matching the Demo Settings panel aesthetic.
 */
function InfoWindow({
  label,
  value,
  unit,
  accentColor = "#6366f1",
}: InfoWindowProps) {
  return (
    <div
      style={{
        /** Flex item: grows to fill available horizontal space */
        flex: 1,
        /** Minimum width prevents extremely narrow windows on small screens */
        minWidth: 0,
        /** Dark glass surface matching the panel's general aesthetic */
        background: "rgba(255,255,255,0.04)",
        /** Subtle border matching glass cards in the rest of the panel */
        border: "1px solid rgba(255,255,255,0.08)",
        /** Consistent border radius with other panel elements */
        borderRadius: 8,
        /** Left colour accent bar for visual identity */
        borderLeft: `3px solid ${accentColor}`,
        /** Compact vertical padding */
        padding: "6px 12px",
        /** Stack label above value */
        display: "flex",
        flexDirection: "column",
        gap: 2,
      }}
    >
      {/* ── Label (small, muted) ────────────────────────────────── */}
      <span
        style={{
          /** Small muted label text */
          fontSize: 10,
          fontWeight: 500,
          /** Muted white — secondary text style */
          color: "rgba(255,255,255,0.45)",
          /** Truncate if label is too long for the window */
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {label}
      </span>

      {/* ── Value (large, bright) ───────────────────────────────── */}
      <span
        style={{
          /** Prominent value text */
          fontSize: 13,
          fontWeight: 700,
          /** Bright white for high readability */
          color: "rgba(255,255,255,0.92)",
          /** Prevent long recipe names from overflowing */
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          lineHeight: 1.2,
        }}
      >
        {value}
        {unit && (
          <span
            style={{
              /** Smaller, muted unit suffix */
              fontSize: 10,
              fontWeight: 400,
              color: "rgba(255,255,255,0.45)",
              marginLeft: 4,
            }}
          >
            {unit}
          </span>
        )}
      </span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// WorkOrderBar Main Component
// ═══════════════════════════════════════════════════════════════════

/**
 * Props for the WorkOrderBar component.
 */
interface WorkOrderBarProps {
  /**
   * The current interface language — controls which translation
   * from LABELS and RECIPES.description is used.
   */
  currentLang: Language;
}

/**
 * WorkOrderBar — Horizontal Work Order selection and info bar.
 *
 * Renders above the Scenario Selector Cards in DemoSettingsPanel.
 * Allows the user to select a Work Order and displays:
 *  - Order Quantity (tiles ordered by customer)
 *  - Qty to Produce (total tiles to press, including scrap buffer)
 *  - Recipe Name (ceramic recipe linked to this Work Order)
 *
 * @param currentLang - Active UI language ('tr' | 'en')
 *
 * @example
 * ```tsx
 * <WorkOrderBar currentLang={currentLang} />
 * ```
 */
export function WorkOrderBar({ currentLang }: WorkOrderBarProps) {
  // ── Store wiring ──────────────────────────────────────────────────

  /** Currently selected Work Order ID (from workOrderStore) */
  const selectedWorkOrderId = useWorkOrderStore((s) => s.selectedWorkOrderId);

  /** Action to update the selected Work Order */
  const setSelectedWorkOrderId = useWorkOrderStore(
    (s) => s.setSelectedWorkOrderId,
  );

  // ── Derived data ─────────────────────────────────────────────────

  /**
   * Look up the full Work Order object for the selected ID.
   * Falls back to the first entry defensively (should not occur in normal use).
   */
  const selectedWorkOrder =
    WORK_ORDERS.find((wo) => wo.id === selectedWorkOrderId) ?? WORK_ORDERS[0];

  /**
   * Look up the Recipe object referenced by the selected Work Order.
   * Falls back to the first recipe defensively.
   */
  const selectedRecipe =
    RECIPES.find((r) => r.id === selectedWorkOrder.recipeId) ?? RECIPES[0];

  // ── Render ────────────────────────────────────────────────────────

  return (
    <div
      style={{
        /** Full-width bar inside the Demo Settings panel */
        display: "flex",
        alignItems: "center",
        gap: 10,
        /** Horizontal padding matching the scenario card row */
        padding: "10px 14px",
        /** Slightly darker top section to visually separate from cards below */
        background: "rgba(255,255,255,0.025)",
        /** Bottom border separates bar from scenario cards */
        borderBottom: "1px solid rgba(255,255,255,0.08)",
        /** Prevent content from wrapping on narrow screens */
        flexWrap: "nowrap",
        /** Shrink-resistant — never collapses */
        flexShrink: 0,
      }}
    >
      {/* ── Section Label ─────────────────────────────────────────── */}
      <span
        style={{
          /** Small uppercase section heading */
          fontSize: 10,
          fontWeight: 600,
          /** Accent colour matching the panel's purple/indigo theme */
          color: "#818cf8",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          /** Fixed width so info windows always start at the same x-position */
          flexShrink: 0,
          whiteSpace: "nowrap",
        }}
      >
        {LABELS.workOrder[currentLang]}
      </span>

      {/* ── WorkID Dropdown ───────────────────────────────────────── */}
      <div
        style={{
          /** Fixed width dropdown area */
          flexShrink: 0,
          position: "relative",
        }}
      >
        <select
          /** Unique ID for automated browser testing */
          id="work-order-dropdown"
          value={selectedWorkOrderId}
          onChange={(e) => setSelectedWorkOrderId(e.target.value)}
          aria-label={LABELS.workId[currentLang]}
          style={{
            /** Dark glass select input */
            background: "rgba(99,102,241,0.15)",
            border: "1px solid rgba(99,102,241,0.40)",
            borderRadius: 6,
            color: "rgba(255,255,255,0.92)",
            fontSize: 12,
            fontWeight: 600,
            padding: "5px 28px 5px 10px",
            /** Remove native arrow — we rely on browser default for accessibility */
            cursor: "pointer",
            outline: "none",
            /** Minimum width to prevent truncation of longest label 'WorkID #3' */
            minWidth: 110,
            /** Indigo glow on focus matching the panel's accent colour */
            transition: "border-color 0.15s ease, box-shadow 0.15s ease",
            appearance: "none",
            WebkitAppearance: "none",
            /** Background arrow icon using CSS (no external assets) */
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath fill='%23818cf8' d='M4 6l4 4 4-4'/%3E%3C/svg%3E")`,
            backgroundRepeat: "no-repeat",
            backgroundPosition: "right 6px center",
            backgroundSize: "16px",
          }}
          onFocus={(e) => {
            /** Add indigo ring on focus for keyboard accessibility */
            e.currentTarget.style.borderColor = "rgba(99,102,241,0.8)";
            e.currentTarget.style.boxShadow = "0 0 0 2px rgba(99,102,241,0.25)";
          }}
          onBlur={(e) => {
            /** Remove focus ring when blurred */
            e.currentTarget.style.borderColor = "rgba(99,102,241,0.40)";
            e.currentTarget.style.boxShadow = "none";
          }}
        >
          {/* Render one option per Work Order entry from params */}
          {WORK_ORDERS.map((wo) => (
            <option
              key={wo.id}
              value={wo.id}
              style={{
                /** Make dropdown options readable on dark backgrounds */
                background: "#1e1b4b",
                color: "rgba(255,255,255,0.92)",
              }}
            >
              {wo.label}
            </option>
          ))}
        </select>
      </div>

      {/* ── Info Windows (flex row, auto-distributing width) ─────── */}

      {/* Order Quantity — tiles ordered by customer */}
      <InfoWindow
        label={LABELS.orderQty[currentLang]}
        value={selectedWorkOrder.orderTileCount.toLocaleString()}
        unit={LABELS.unit[currentLang]}
        accentColor="#22d3ee"
      />

      {/* Production Quantity — tiles to press (inc. scrap buffer) */}
      <InfoWindow
        label={LABELS.prodQty[currentLang]}
        value={selectedWorkOrder.actualTileCount.toLocaleString()}
        unit={LABELS.unit[currentLang]}
        accentColor="#f59e0b"
      />

      {/* Recipe Name — ceramic specification for this batch */}
      <InfoWindow
        label={LABELS.recipe[currentLang]}
        value={selectedRecipe.name}
        accentColor="#a78bfa"
      />
    </div>
  );
}
