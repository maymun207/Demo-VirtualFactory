/**
 * OEEHierarchyTable3D.tsx — 3D In-Scene Hierarchical OEE Dashboard
 *
 * A Three.js/R3F component that renders the OEE hierarchy as a 3D
 * floating holographic table above the factory floor.
 *
 * Architecture: Follows the same pattern as ProductionTable3D.tsx.
 *   - Semi-transparent dark base plate (boxGeometry)
 *   - Emissive indigo border glow
 *   - @react-three/drei <Text> for all labels and values
 *   - Color-coded metric values via threshold checks
 *
 * Hierarchy:  Factory → Lines (3) → Machines per line
 *   6 metrics per level: OEE, Scrap, Defect Rate, kWh, Gas, CO₂
 *
 * Visibility controlled by uiStore.showOEEHierarchy.
 * Data source: kpiStore.factoryOEE.
 * All constants from params/oeeHierarchyTable.ts — no hardcoded values.
 *
 * Used by: Scene.tsx (inside the R3F <Canvas> factory group)
 */

import { memo } from "react";
import { Text } from "@react-three/drei";
import { useKPIStore } from "../../store/kpiStore";
import { useUIStore } from "../../store/uiStore";
import type { FactoryOEE, LineOEE, MachineOEE } from "../../store/types";
import {
  OEE_HIERARCHY_TITLE,
  OEE_HIERARCHY_COLUMNS,
  OEE_HIERARCHY_THRESHOLDS,
  OEE_HIERARCHY_FACTORY_LABEL,
  OEE_HIERARCHY_NO_DATA,
  OEE_TABLE_3D_POSITION,
  OEE_TABLE_3D_ROTATION,
  OEE_TABLE_3D_WIDTH,
  OEE_TABLE_3D_HEIGHT,
  OEE_TABLE_3D_BASE_DEPTH,
  OEE_TABLE_3D_BASE_PADDING,
  OEE_TABLE_3D_BORDER_DEPTH,
  OEE_TABLE_3D_BORDER_PADDING,
  OEE_TABLE_3D_BORDER_Z,
  OEE_TABLE_3D_GRID_Z,
  OEE_TABLE_3D_CONTENT_Z,
  OEE_TABLE_3D_FACTORY_ROW_Z,
  OEE_TABLE_3D_HEADER_HEIGHT,
  OEE_TABLE_3D_FACTORY_ROW_HEIGHT,
  OEE_TABLE_3D_LINE_ROW_HEIGHT,
  OEE_TABLE_3D_MACHINE_ROW_HEIGHT,
  OEE_TABLE_3D_NAME_COL_WIDTH,
  OEE_TABLE_3D_DATA_COL_WIDTH,
  OEE_TABLE_3D_TITLE_SIZE,
  OEE_TABLE_3D_HEADER_SIZE,
  OEE_TABLE_3D_FACTORY_TEXT_SIZE,
  OEE_TABLE_3D_LINE_TEXT_SIZE,
  OEE_TABLE_3D_MACHINE_TEXT_SIZE,
  OEE_TABLE_3D_BG_COLOR,
  OEE_TABLE_3D_BG_OPACITY,
  OEE_TABLE_3D_BG_ROUGHNESS,
  OEE_TABLE_3D_BG_METALNESS,
  OEE_TABLE_3D_BORDER_COLOR,
  OEE_TABLE_3D_BORDER_EMISSIVE_INTENSITY,
  OEE_TABLE_3D_GRID_COLOR,
  OEE_TABLE_3D_GRID_OPACITY,
  OEE_TABLE_3D_GRID_THICKNESS,
  OEE_TABLE_3D_COLOR_GOOD,
  OEE_TABLE_3D_COLOR_WARN,
  OEE_TABLE_3D_COLOR_BAD,
  OEE_TABLE_3D_COLOR_NEUTRAL,
  OEE_TABLE_3D_COLOR_LABEL,
  OEE_TABLE_3D_COLOR_MACHINE_LABEL,
  OEE_TABLE_3D_COLOR_HEADER,
  OEE_TABLE_3D_FACTORY_ROW_BG,
  OEE_TABLE_3D_FACTORY_ROW_BG_OPACITY,
  OEE_TABLE_3D_LINE_ROW_BG,
  OEE_TABLE_3D_LINE_ROW_BG_OPACITY,
  OEE_TABLE_3D_NAME_LEFT_PADDING,
} from "../../lib/params";
import type { OEEHierarchyMetricId } from "../../lib/params/oeeHierarchyTable";

// ═══════════════════════════════════════════════════════════════════
// HELPER — Determine cell color based on metric value + thresholds
// ═══════════════════════════════════════════════════════════════════

/**
 * Returns a hex color string for a metric value based on configured thresholds.
 *
 * @param metricId — Which metric column this value belongs to
 * @param value — The numeric value to evaluate
 * @returns Hex color string
 */
function getMetricColor(metricId: OEEHierarchyMetricId, value: number): string {
  /** Look up the threshold config for this metric */
  const threshold = OEE_HIERARCHY_THRESHOLDS[metricId];
  /** If no thresholds defined (good=0, warn=0), use neutral color */
  if (threshold.good === 0 && threshold.warn === 0)
    return OEE_TABLE_3D_COLOR_NEUTRAL;

  if (threshold.invert) {
    /** Inverted: lower is better (scrap, defect) */
    if (value <= threshold.good) return OEE_TABLE_3D_COLOR_GOOD;
    if (value <= threshold.warn) return OEE_TABLE_3D_COLOR_WARN;
    return OEE_TABLE_3D_COLOR_BAD;
  }
  /** Normal: higher is better (OEE) */
  if (value >= threshold.good) return OEE_TABLE_3D_COLOR_GOOD;
  if (value >= threshold.warn) return OEE_TABLE_3D_COLOR_WARN;
  return OEE_TABLE_3D_COLOR_BAD;
}

// ═══════════════════════════════════════════════════════════════════
// HELPER — Extract 6 metric values from any hierarchy level
// ═══════════════════════════════════════════════════════════════════

/** Array of 6 metric values in column order */
type MetricValues = [number, number, number, number, number, number];

/**
 * Extracts the 6 metric values from a MachineOEE record.
 * @param machine — The machine OEE data
 * @param factoryOEE — Parent factory OEE for energy lookup
 * @returns Tuple of 6 values in column order
 */
function getMachineMetrics(
  machine: MachineOEE,
  factoryOEE: FactoryOEE,
): MetricValues {
  /** Look up per-station energy from the factory energy map */
  const energy = factoryOEE.energy.perStation[machine.machineId];
  /**
   * Defect rate from passport: scrappedHere / actualInput × 100.
   * Uses the tile passport (single source of truth) instead of arithmetic
   * gap (input−output) which falsely counts in-transit tiles as defects.
   */
  const defectRate =
    machine.actualInput > 0
      ? (machine.scrappedHere / machine.actualInput) * 100
      : 0;
  return [
    machine.oee,
    machine.scrappedHere,
    defectRate,
    energy?.kWh ?? 0,
    energy?.gas ?? 0,
    energy?.co2 ?? 0,
  ];
}

/**
 * Extracts the 6 metric values from a LineOEE record.
 * @param line — The line OEE data
 * @returns Tuple of 6 values in column order
 */
function getLineMetrics(line: LineOEE): MetricValues {
  /** Aggregate scrap from all machines in this line */
  const totalScrap = line.machines.reduce((sum, m) => sum + m.scrappedHere, 0);
  /** Aggregate input for defect rate (passport-based) */
  const totalInput = line.machines.reduce((sum, m) => sum + m.actualInput, 0);
  /**
   * Defect rate = total scrapped / total input × 100.
   * Passport is the single source of truth — no arithmetic gaps.
   */
  const defectRate = totalInput > 0 ? (totalScrap / totalInput) * 100 : 0;
  return [
    line.oee,
    totalScrap,
    defectRate,
    line.energy.totalKwh,
    line.energy.totalGas,
    line.energy.totalCo2,
  ];
}

/**
 * Extracts the 6 metric values from the FactoryOEE record.
 * @param factory — The factory OEE data
 * @returns Tuple of 6 values in column order
 */
function getFactoryMetrics(factory: FactoryOEE): MetricValues {
  /** Sum scrap across all lines → all machines */
  const totalScrap = factory.lines.reduce(
    (sum, line) => sum + line.machines.reduce((s, m) => s + m.scrappedHere, 0),
    0,
  );
  /** Sum input for factory defect rate (passport-based) */
  const totalInput = factory.lines.reduce(
    (sum, line) => sum + line.machines.reduce((s, m) => s + m.actualInput, 0),
    0,
  );
  /**
   * Defect rate = total scrapped / total input × 100.
   * Passport is the single source of truth — no arithmetic gaps.
   */
  const defectRate = totalInput > 0 ? (totalScrap / totalInput) * 100 : 0;
  return [
    factory.oee,
    totalScrap,
    defectRate,
    factory.energy.totalKwh,
    factory.energy.totalGas,
    factory.energy.totalCo2,
  ];
}

// ═══════════════════════════════════════════════════════════════════
// HELPER — Calculate the X position for each column
// ═══════════════════════════════════════════════════════════════════

/** X position of the name column center (used for centered text) */
const nameColX =
  -OEE_TABLE_3D_WIDTH / 2 + OEE_TABLE_3D_NAME_COL_WIDTH / 2 + 0.3;

/** X position of the name column left edge (used for left-aligned text) */
const nameColLeftX = -OEE_TABLE_3D_WIDTH / 2 + OEE_TABLE_3D_NAME_LEFT_PADDING;

/** X positions for each of the 6 metric data columns */
const dataColX: number[] = OEE_HIERARCHY_COLUMNS.map(
  (_, i) =>
    -OEE_TABLE_3D_WIDTH / 2 +
    OEE_TABLE_3D_NAME_COL_WIDTH +
    OEE_TABLE_3D_DATA_COL_WIDTH * (i + 0.5) +
    0.3,
);

// ═══════════════════════════════════════════════════════════════════
// SUB-COMPONENT — MetricRow3D: renders 6 metric values at a Y pos
// ═══════════════════════════════════════════════════════════════════

/**
 * Renders a row of 6 metric Text nodes at the specified Y level.
 * Memoized to avoid re-renders when values haven't changed.
 */
const MetricRow3D = memo(
  ({
    values,
    y,
    fontSize,
  }: {
    /** 6 metric values in column order */
    values: MetricValues;
    /** Y position in local table space */
    y: number;
    /** Font size for the Text elements */
    fontSize: number;
  }) => (
    <group position={[0, y, OEE_TABLE_3D_CONTENT_Z]}>
      {/* Render each of the 6 metric value Text elements */}
      {OEE_HIERARCHY_COLUMNS.map((col, i) => {
        /** Format the value with the configured decimal places */
        const formatted = values[i].toFixed(col.decimals);
        /** Append unit suffix if configured */
        const display = col.unit ? `${formatted}${col.unit}` : formatted;
        /** Determine color based on threshold */
        const color = getMetricColor(col.id, values[i]);
        return (
          <Text
            key={col.id}
            position={[dataColX[i], 0, 0]}
            fontSize={fontSize}
            color={color}
            anchorX="center"
            anchorY="middle"
          >
            {/* Color-coded metric value text */}
            {display}
          </Text>
        );
      })}
    </group>
  ),
);

// ═══════════════════════════════════════════════════════════════════
// MAIN COMPONENT — OEEHierarchyTable3D
// ═══════════════════════════════════════════════════════════════════

export const OEEHierarchyTable3D = () => {
  // ── Store subscriptions ──────────────────────────────────────────
  /** Whether the OEE 3D table is visible */
  const showOEEHierarchy = useUIStore((s) => s.showOEEHierarchy);
  /** Current UI language for bilingual labels */
  const lang = useUIStore((s) => s.currentLang);
  /** Hierarchical OEE data from the KPI store */
  const factoryOEE = useKPIStore((s) => s.factoryOEE);

  /** Hide when toggle is off */
  if (!showOEEHierarchy) return null;

  // ── Calculate layout positions ───────────────────────────────────

  /** Top edge of the content area */
  const topY = OEE_TABLE_3D_HEIGHT / 2;
  /** Current Y cursor — decrements as rows are placed */
  let cursorY = topY - OEE_TABLE_3D_HEADER_HEIGHT;

  // ── Pre-compute row positions ────────────────────────────────────
  /** Factory row Y position */
  const factoryY = cursorY - OEE_TABLE_3D_FACTORY_ROW_HEIGHT / 2;

  /** Compute all line/machine Y positions */
  type RowLayout = {
    lineY: number;
    lineData: LineOEE;
    machines: { y: number; machine: MachineOEE }[];
  };

  const rowLayouts: RowLayout[] = [];
  if (factoryOEE) {
    cursorY -= OEE_TABLE_3D_FACTORY_ROW_HEIGHT;
    /** Extra gap between factory row and first line row for visual separation */
    cursorY -= 0.2;

    for (const line of factoryOEE.lines) {
      /** Line header row */
      const lineY = cursorY - OEE_TABLE_3D_LINE_ROW_HEIGHT / 2;
      cursorY -= OEE_TABLE_3D_LINE_ROW_HEIGHT;

      /** Machine rows under this line */
      const machines: { y: number; machine: MachineOEE }[] = [];
      for (const machine of line.machines) {
        const machineY = cursorY - OEE_TABLE_3D_MACHINE_ROW_HEIGHT / 2;
        cursorY -= OEE_TABLE_3D_MACHINE_ROW_HEIGHT;
        machines.push({ y: machineY, machine });
      }

      rowLayouts.push({ lineY, lineData: line, machines });
    }
  }

  /** Actual content height used (for dynamic base sizing) */
  const contentBottom = cursorY;
  const actualHeight = topY - contentBottom + OEE_TABLE_3D_BASE_PADDING;
  const centerY = topY - actualHeight / 2;

  // ── Compute horizontal grid line positions ───────────────────────
  const hLines: number[] = [];
  /** Line below header */
  hLines.push(topY - OEE_TABLE_3D_HEADER_HEIGHT);
  if (factoryOEE) {
    /** Line below factory row */
    hLines.push(
      topY - OEE_TABLE_3D_HEADER_HEIGHT - OEE_TABLE_3D_FACTORY_ROW_HEIGHT,
    );
    /** Lines between each line/machine group */
    let y = topY - OEE_TABLE_3D_HEADER_HEIGHT - OEE_TABLE_3D_FACTORY_ROW_HEIGHT;
    for (const layout of rowLayouts) {
      y -= OEE_TABLE_3D_LINE_ROW_HEIGHT;
      hLines.push(y);
      for (let _i = 0; _i < layout.machines.length; _i++) {
        y -= OEE_TABLE_3D_MACHINE_ROW_HEIGHT;
      }
      /** Add a separator after each line group */
      hLines.push(y);
    }
  }

  /** Vertical grid lines (between name and each data column) */
  const vLines: number[] = [];
  vLines.push(-OEE_TABLE_3D_WIDTH / 2 + OEE_TABLE_3D_NAME_COL_WIDTH + 0.3);
  for (let i = 1; i < 6; i++) {
    vLines.push(
      -OEE_TABLE_3D_WIDTH / 2 +
        OEE_TABLE_3D_NAME_COL_WIDTH +
        OEE_TABLE_3D_DATA_COL_WIDTH * i +
        0.3,
    );
  }

  return (
    <group position={OEE_TABLE_3D_POSITION} rotation={OEE_TABLE_3D_ROTATION}>
      {/* ── Base Plate — Semi-transparent dark background ──────────── */}
      <mesh position={[0, centerY, 0]} receiveShadow>
        {/* Box geometry for the table background */}
        <boxGeometry
          args={[
            OEE_TABLE_3D_WIDTH + OEE_TABLE_3D_BASE_PADDING,
            actualHeight,
            OEE_TABLE_3D_BASE_DEPTH,
          ]}
        />
        {/* Dark translucent material for glassmorphism effect */}
        <meshStandardMaterial
          color={OEE_TABLE_3D_BG_COLOR}
          roughness={OEE_TABLE_3D_BG_ROUGHNESS}
          metalness={OEE_TABLE_3D_BG_METALNESS}
          transparent
          opacity={OEE_TABLE_3D_BG_OPACITY}
        />
      </mesh>

      {/* ── Border Glow — Emissive indigo outline ─────────────────── */}
      <mesh position={[0, centerY, OEE_TABLE_3D_BORDER_Z]}>
        {/* Slightly larger box behind the base for glow effect */}
        <boxGeometry
          args={[
            OEE_TABLE_3D_WIDTH + OEE_TABLE_3D_BORDER_PADDING,
            actualHeight + 0.2,
            OEE_TABLE_3D_BORDER_DEPTH,
          ]}
        />
        {/* Emissive indigo material creating the glow */}
        <meshStandardMaterial
          color={OEE_TABLE_3D_BORDER_COLOR}
          emissive={OEE_TABLE_3D_BORDER_COLOR}
          emissiveIntensity={OEE_TABLE_3D_BORDER_EMISSIVE_INTENSITY}
        />
      </mesh>

      {/* ── Title Text — Above the table ──────────────────────────── */}
      <Text
        position={[0, topY + 0.6, OEE_TABLE_3D_CONTENT_Z]}
        fontSize={OEE_TABLE_3D_TITLE_SIZE}
        color={OEE_TABLE_3D_COLOR_LABEL}
        anchorX="center"
        anchorY="middle"
      >
        {/* Table title in current language */}
        {OEE_HIERARCHY_TITLE[lang]}
      </Text>

      {/* ── Column Headers ────────────────────────────────────────── */}
      <group
        position={[
          0,
          topY - OEE_TABLE_3D_HEADER_HEIGHT / 2,
          OEE_TABLE_3D_CONTENT_Z,
        ]}
      >
        {/* Empty name column header */}
        <Text
          position={[nameColX, 0, 0]}
          fontSize={OEE_TABLE_3D_HEADER_SIZE}
          color={OEE_TABLE_3D_COLOR_HEADER}
          anchorX="center"
          anchorY="middle"
        >
          {/* Name column left intentionally blank */}
          {""}
        </Text>
        {/* Render each metric column header */}
        {OEE_HIERARCHY_COLUMNS.map((col, i) => (
          <Text
            key={col.id}
            position={[dataColX[i], 0, 0]}
            fontSize={OEE_TABLE_3D_HEADER_SIZE}
            color={OEE_TABLE_3D_COLOR_HEADER}
            anchorX="center"
            anchorY="middle"
          >
            {/* Bilingual column header */}
            {lang === "tr" ? col.labelTr : col.labelEn}
          </Text>
        ))}
      </group>

      {factoryOEE ? (
        <>
          {/* ── Factory Row — Bold, gradient backdrop ──────────────── */}
          {/* Factory row background highlight */}
          <mesh position={[0, factoryY, OEE_TABLE_3D_FACTORY_ROW_Z]}>
            <planeGeometry
              args={[OEE_TABLE_3D_WIDTH, OEE_TABLE_3D_FACTORY_ROW_HEIGHT]}
            />
            <meshBasicMaterial
              color={OEE_TABLE_3D_FACTORY_ROW_BG}
              transparent
              opacity={OEE_TABLE_3D_FACTORY_ROW_BG_OPACITY}
            />
          </mesh>
          {/* Factory row name label (left-aligned) */}
          <Text
            position={[nameColLeftX, factoryY, OEE_TABLE_3D_CONTENT_Z]}
            fontSize={OEE_TABLE_3D_FACTORY_TEXT_SIZE}
            color={OEE_TABLE_3D_COLOR_LABEL}
            anchorX="left"
            anchorY="middle"
          >
            {/* Factory label: "Factory" or "Fabrika" */}
            {`◆ ${OEE_HIERARCHY_FACTORY_LABEL[lang]}`}
          </Text>
          {/* Factory row metrics */}
          <MetricRow3D
            values={getFactoryMetrics(factoryOEE)}
            y={factoryY}
            fontSize={OEE_TABLE_3D_FACTORY_TEXT_SIZE}
          />

          {/* ── Line + Machine Rows ───────────────────────────────── */}
          {rowLayouts.map((layout) => (
            <group key={layout.lineData.lineId}>
              {/* Line row background highlight */}
              <mesh position={[0, layout.lineY, OEE_TABLE_3D_FACTORY_ROW_Z]}>
                <planeGeometry
                  args={[OEE_TABLE_3D_WIDTH, OEE_TABLE_3D_LINE_ROW_HEIGHT]}
                />
                <meshBasicMaterial
                  color={OEE_TABLE_3D_LINE_ROW_BG}
                  transparent
                  opacity={OEE_TABLE_3D_LINE_ROW_BG_OPACITY}
                />
              </mesh>
              {/* Line row name label (left-aligned) */}
              <Text
                position={[
                  nameColLeftX + 0.3,
                  layout.lineY,
                  OEE_TABLE_3D_CONTENT_Z,
                ]}
                fontSize={OEE_TABLE_3D_LINE_TEXT_SIZE}
                color={OEE_TABLE_3D_COLOR_LABEL}
                anchorX="left"
                anchorY="middle"
              >
                {/* Line name: e.g. "Line 1 — Forming & Finishing" */}
                {`▸ ${layout.lineData.name[lang]}`}
              </Text>
              {/* Line row metrics */}
              <MetricRow3D
                values={getLineMetrics(layout.lineData)}
                y={layout.lineY}
                fontSize={OEE_TABLE_3D_LINE_TEXT_SIZE}
              />

              {/* Machine rows under this line */}
              {layout.machines.map(({ y, machine }, mIdx) => (
                <group key={machine.machineId}>
                  {/* Machine row name label with tree connector (left-aligned, indented) */}
                  <Text
                    position={[nameColLeftX + 0.8, y, OEE_TABLE_3D_CONTENT_Z]}
                    fontSize={OEE_TABLE_3D_MACHINE_TEXT_SIZE}
                    color={OEE_TABLE_3D_COLOR_MACHINE_LABEL}
                    anchorX="left"
                    anchorY="middle"
                  >
                    {/* Tree connector: └ for last, ├ for others */}
                    {`${mIdx === layout.machines.length - 1 ? "└" : "├"} ${machine.name[lang]}`}
                  </Text>
                  {/* Machine row metrics */}
                  <MetricRow3D
                    values={getMachineMetrics(machine, factoryOEE)}
                    y={y}
                    fontSize={OEE_TABLE_3D_MACHINE_TEXT_SIZE}
                  />
                </group>
              ))}
            </group>
          ))}
        </>
      ) : (
        /* ── No Data — Informational message ─────────────────────── */
        <Text
          position={[0, 0, OEE_TABLE_3D_CONTENT_Z]}
          fontSize={0.4}
          color={OEE_TABLE_3D_COLOR_MACHINE_LABEL}
          anchorX="center"
          anchorY="middle"
          maxWidth={OEE_TABLE_3D_WIDTH * 0.6}
          textAlign="center"
        >
          {/* No-data placeholder in current language */}
          {OEE_HIERARCHY_NO_DATA[lang]}
        </Text>
      )}

      {/* ── Horizontal Grid Lines ─────────────────────────────────── */}
      {hLines.map((y, i) => (
        <mesh key={`h-${i}`} position={[0, y, OEE_TABLE_3D_GRID_Z]}>
          {/* Thin horizontal separator line */}
          <planeGeometry
            args={[OEE_TABLE_3D_WIDTH, OEE_TABLE_3D_GRID_THICKNESS]}
          />
          <meshBasicMaterial
            color={OEE_TABLE_3D_GRID_COLOR}
            transparent
            opacity={OEE_TABLE_3D_GRID_OPACITY}
          />
        </mesh>
      ))}

      {/* ── Vertical Grid Lines ───────────────────────────────────── */}
      {vLines.map((x, i) => (
        <mesh key={`v-${i}`} position={[x, centerY, OEE_TABLE_3D_GRID_Z]}>
          {/* Thin vertical separator line */}
          <planeGeometry
            args={[
              OEE_TABLE_3D_GRID_THICKNESS,
              actualHeight - OEE_TABLE_3D_BASE_PADDING,
            ]}
          />
          <meshBasicMaterial
            color={OEE_TABLE_3D_GRID_COLOR}
            transparent
            opacity={OEE_TABLE_3D_GRID_OPACITY}
          />
        </mesh>
      ))}
    </group>
  );
};
