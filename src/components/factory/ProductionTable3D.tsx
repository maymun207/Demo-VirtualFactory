/**
 * ProductionTable3D.tsx — 3D Production Status Matrix Table
 *
 * Renders a tilted 3D table showing the rolling status matrix:
 *  - Header row with station names (bilingual, colored per station)
 *  - Clock column showing the S-Clock tick for each row
 *  - STATUS_MATRIX_ROWS × STATUS_MATRIX_COLS data cells
 *  - Grid lines (horizontal + vertical) for visual structure
 *  - Glowing green border with emissive material
 *
 * Sub-components:
 *  - TableRow (memoized) — renders one data row with custom comparator
 *    to avoid re-renders when array references change but content is identical
 *
 * Visibility controlled by uiStore.showProductionTable toggle.
 * All layout constants sourced from params.ts TABLE_* namespace.
 *
 * Used by: Scene.tsx (inside the R3F <Canvas>)
 */
import { memo } from "react";
import { Text } from "@react-three/drei";
import { useSimulationStore } from "../../store/simulationStore";
import { useUIStore } from "../../store/uiStore";
import {
  COLORS,
  MATERIALS,
  TEXT_SIZES,
  TABLE_ROW_COUNT,
  TABLE_HEIGHT,
  TABLE_WIDTH,
  TABLE_CENTER_X,
  TABLE_STATION_X,
  TABLE_CLOCK_X,
  TABLE_V_LINES,
  TABLE_BASE_PADDING,
  TABLE_BORDER_PADDING,
  TABLE_BORDER_Z,
  TABLE_GRID_Z,
  TABLE_CONTENT_Z,
  TABLE_GRID_THICKNESS,
  TABLE_BASE_DEPTH,
  TABLE_BORDER_DEPTH,
  PRODUCTION_TABLE_POSITION,
  PRODUCTION_TABLE_ROTATION,
} from "../../lib/params";
import { translations } from "../../lib/translations";

const TableRow = memo(
  ({
    rIdx,
    row,
    displayTick,
    stationX,
    clockX,
  }: {
    rIdx: number;
    row: (string | null)[];
    displayTick: number | null;
    stationX: number[];
    clockX: number;
  }) => {
    const cellHeight = TABLE_HEIGHT / (TABLE_ROW_COUNT + 1);
    return (
      <group position={[0, -rIdx * cellHeight, 0]}>
        <Text
          position={[clockX, 0, 0]}
          fontSize={TEXT_SIZES.tableClockCell}
          color={rIdx === 0 ? COLORS.tableActiveRow : COLORS.tableInactiveRow}
          anchorX="center"
          anchorY="middle"
        >
          {displayTick !== null ? `S_clk: ${displayTick}` : "-"}
        </Text>

        {row.map((cell, cIdx) => (
          <Text
            key={`cell-${rIdx}-${cIdx}`}
            position={[stationX[cIdx], 0, 0]}
            fontSize={TEXT_SIZES.tableCell}
            color={
              rIdx === 0
                ? COLORS.tableActiveCell
                : cell
                  ? COLORS.tableCellWhite
                  : COLORS.tableEmptyCell
            }
            anchorX="center"
            anchorY="middle"
          >
            {cell || "-"}
          </Text>
        ))}
      </group>
    );
  },
  // Custom comparator: compare row elements instead of array reference
  (prev, next) =>
    prev.rIdx === next.rIdx &&
    prev.displayTick === next.displayTick &&
    prev.clockX === next.clockX &&
    prev.row.length === next.row.length &&
    prev.row.every((cell, i) => cell === next.row[i]),
);

export const ProductionTable3D = () => {
  const statusMatrix = useSimulationStore((s) => s.statusMatrix);
  const statusMatrixClocks = useSimulationStore((s) => s.statusMatrixClocks);
  const stations = useSimulationStore((s) => s.stations);
  const currentLang = useUIStore((s) => s.currentLang);
  const showProductionTable = useUIStore((s) => s.showProductionTable);

  if (!showProductionTable) return null;

  const cellHeight = TABLE_HEIGHT / (TABLE_ROW_COUNT + 1);

  return (
    <group
      position={PRODUCTION_TABLE_POSITION}
      rotation={PRODUCTION_TABLE_ROTATION}
    >
      {/* Table Base */}
      <mesh position={[TABLE_CENTER_X, 0, 0]} receiveShadow>
        <boxGeometry
          args={[
            TABLE_WIDTH + TABLE_BASE_PADDING,
            TABLE_HEIGHT + TABLE_BASE_PADDING,
            TABLE_BASE_DEPTH,
          ]}
        />
        <meshStandardMaterial
          color={COLORS.tableBackground}
          roughness={MATERIALS.tableBase.roughness}
          metalness={MATERIALS.tableBase.metalness}
          transparent
          opacity={MATERIALS.tableBase.opacity}
        />
      </mesh>

      {/* Outer Glow Border */}
      <mesh position={[TABLE_CENTER_X, 0, TABLE_BORDER_Z]}>
        <boxGeometry
          args={[
            TABLE_WIDTH + TABLE_BORDER_PADDING,
            TABLE_HEIGHT + TABLE_BORDER_PADDING,
            TABLE_BORDER_DEPTH,
          ]}
        />
        <meshStandardMaterial
          color={COLORS.tableBorder}
          emissive={COLORS.tableBorder}
          emissiveIntensity={MATERIALS.tableBorderGlow.emissiveIntensity}
        />
      </mesh>

      {/* Header Row */}
      <group position={[0, TABLE_HEIGHT / 2 - cellHeight / 2, TABLE_CONTENT_Z]}>
        <Text
          position={[TABLE_CLOCK_X, 0, 0]}
          fontSize={TEXT_SIZES.tableHeader}
          color={COLORS.tableHeaderColor}
          anchorX="center"
          anchorY="middle"
        >
          {translations.productionTable.clock[currentLang]}
        </Text>

        {stations.map((station, i) => (
          <Text
            key={station.id}
            position={[TABLE_STATION_X[i], 0, 0]}
            fontSize={TEXT_SIZES.tableStationHeader}
            color={station.color}
            anchorX="center"
            anchorY="middle"
            maxWidth={TEXT_SIZES.tableStationHeaderMaxWidth}
            textAlign="center"
          >
            {station.name[currentLang]}
          </Text>
        ))}
      </group>

      {/* Grid Lines - Horizontal */}
      {Array.from({ length: TABLE_ROW_COUNT + 2 }).map((_, i) => (
        <mesh
          key={`h-line-${i}`}
          position={[
            TABLE_CENTER_X,
            TABLE_HEIGHT / 2 - i * cellHeight,
            TABLE_GRID_Z,
          ]}
        >
          <planeGeometry args={[TABLE_WIDTH, TABLE_GRID_THICKNESS]} />
          <meshBasicMaterial
            color={COLORS.tableGridLine}
            transparent
            opacity={MATERIALS.tableGridLine.opacity}
          />
        </mesh>
      ))}

      {/* Grid Lines - Vertical */}
      {TABLE_V_LINES.map((x, i) => (
        <mesh key={`v-line-${i}`} position={[x, 0, TABLE_GRID_Z]}>
          <planeGeometry args={[TABLE_GRID_THICKNESS, TABLE_HEIGHT]} />
          <meshBasicMaterial
            color={COLORS.tableGridLine}
            transparent
            opacity={MATERIALS.tableGridLine.opacity}
          />
        </mesh>
      ))}

      {/* Matrix Data Rows */}
      <group
        position={[0, TABLE_HEIGHT / 2 - cellHeight * 1.5, TABLE_CONTENT_Z]}
      >
        {statusMatrix.map((row, rIdx) => {
          const displayTick = statusMatrixClocks[rIdx] ?? null;
          return (
            <TableRow
              key={`row-${rIdx}`}
              rIdx={rIdx}
              row={row}
              displayTick={displayTick}
              stationX={TABLE_STATION_X}
              clockX={TABLE_CLOCK_X}
            />
          );
        })}
      </group>
    </group>
  );
};
