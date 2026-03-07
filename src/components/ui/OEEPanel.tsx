/**
 * OEEPanel.tsx — Hierarchical OEE Dashboard Component
 *
 * Displays Machine, Line, and Factory OEE metrics in a tabbed panel.
 * Reads live data from kpiStore (factoryOEE). Supports bilingual (TR/EN).
 * Color-coded thresholds: green (≥85), yellow (65-84), red (<65).
 *
 * Used by: Can be placed anywhere in the UI — standalone component.
 */

import React, { useState } from "react";
import { useKPIStore } from "../../store/kpiStore";
import {
  OEE_THRESHOLD_GOOD,
  OEE_THRESHOLD_WARNING,
  PRESS_THEORETICAL_RATE,
  KILN_THEORETICAL_RATE,
} from "../../lib/params";
import type { MachineOEE, LineOEE } from "../../store/types";

// ═══════════════════════════════════════════════════════════════
// VIEW MODE TYPE
// ═══════════════════════════════════════════════════════════════

/** The three tab modes for the OEE dashboard */
type ViewMode = "machine" | "line" | "factory";

// ═══════════════════════════════════════════════════════════════
// COLOR HELPERS — Threshold-based OEE color coding
// ═══════════════════════════════════════════════════════════════

/** Returns text color class based on OEE threshold (green/yellow/red) */
function getOeeColor(oee: number): string {
  if (oee >= OEE_THRESHOLD_GOOD) return "text-emerald-400";
  if (oee >= OEE_THRESHOLD_WARNING) return "text-yellow-400";
  return "text-red-400";
}

/** Returns background color class based on OEE threshold */
function getOeeBgColor(oee: number): string {
  if (oee >= OEE_THRESHOLD_GOOD) return "bg-emerald-500/20";
  if (oee >= OEE_THRESHOLD_WARNING) return "bg-yellow-500/20";
  return "bg-red-500/20";
}

// ═══════════════════════════════════════════════════════════════
// LINE GROUPING — Machine display order with line headers
// ═══════════════════════════════════════════════════════════════

/** Section header labels for machine grouping in Machine view */
const LINE_HEADERS: Record<string, { tr: string; en: string }> = {
  line1: {
    tr: "Hat 1 — Şekillendirme & Baskı",
    en: "Line 1 — Forming & Finishing",
  },
  line3: { tr: "Hat 3 — Konveyör", en: "Line 3 — Conveyor" },
  line2: { tr: "Hat 2 — Pişirme & Sevkiyat", en: "Line 2 — Firing & Dispatch" },
};

/** Machine IDs grouped by line in production order */
const MACHINE_GROUPS = [
  { lineKey: "line1", machineIds: ["press", "dryer", "glaze", "printer"] },
  { lineKey: "line3", machineIds: ["conveyor"] },
  { lineKey: "line2", machineIds: ["kiln", "sorting", "packaging"] },
] as const;

// ═══════════════════════════════════════════════════════════════
// MACHINE VIEW — Individual OEE per machine (8 rows)
// ═══════════════════════════════════════════════════════════════

/** Table header row for the machine view */
function MachineTableHeader({ lang }: { lang: "tr" | "en" }) {
  return (
    <tr className="text-white/50 text-xs uppercase tracking-wide border-b border-white/5">
      <th className="py-2 px-2 text-left font-medium">
        {lang === "tr" ? "Makine" : "Machine"}
      </th>
      <th className="py-2 px-2 text-right font-medium">P %</th>
      <th className="py-2 px-2 text-right font-medium">Q %</th>
      <th className="py-2 px-2 text-right font-medium">OEE %</th>
      <th className="py-2 px-2 text-right font-medium">kWh/tile</th>
      <th className="py-2 px-2 text-right font-medium">
        {lang === "tr" ? "Giriş→Çıkış" : "In→Out"}
      </th>
    </tr>
  );
}

/** Single machine row in the machine view table */
function MachineRow({
  machine,
  lang,
  kWhPerTile,
}: {
  machine: MachineOEE;
  lang: "tr" | "en";
  kWhPerTile: number;
}) {
  /** Conveyor has P = "—" since performance is always 1.0 (yield-only) */
  const isConveyor = machine.machineId === "conveyor";
  return (
    <tr className="border-b border-white/5 hover:bg-white/5 transition-colors">
      <td className="py-1.5 px-2 text-sm text-white/80">
        {machine.name[lang]}
      </td>
      <td className="py-1.5 px-2 text-right text-sm font-mono text-white/70">
        {isConveyor ? "—" : `${(machine.performance * 100).toFixed(1)}`}
      </td>
      <td className="py-1.5 px-2 text-right text-sm font-mono text-white/70">
        {(machine.quality * 100).toFixed(1)}
      </td>
      <td
        className={`py-1.5 px-2 text-right text-sm font-mono font-semibold ${getOeeColor(machine.oee)}`}
      >
        {machine.oee.toFixed(1)}
      </td>
      <td className="py-1.5 px-2 text-right text-sm font-mono text-white/60">
        {kWhPerTile.toFixed(2)}
      </td>
      <td className="py-1.5 px-2 text-right text-sm font-mono text-white/60">
        {machine.actualInput}→{machine.actualOutput}
      </td>
    </tr>
  );
}

/** Machine view: all 8 machines grouped by line with section headers */
function MachineView({
  machines,
  lang,
  perStationEnergy,
}: {
  machines: MachineOEE[];
  lang: "tr" | "en";
  perStationEnergy: Record<string, { kWhPerTile: number }>;
}) {
  /** Look up a machine by its ID from the flat machines array */
  const findMachine = (id: string) => machines.find((m) => m.machineId === id);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left">
        <thead>
          <MachineTableHeader lang={lang} />
        </thead>
        <tbody>
          {MACHINE_GROUPS.map((group) => (
            <React.Fragment key={group.lineKey}>
              {/* Line section header */}
              <tr>
                <td
                  colSpan={6}
                  className="pt-3 pb-1 px-2 text-white/30 text-xs uppercase tracking-wider border-b border-white/5"
                >
                  {LINE_HEADERS[group.lineKey]?.[lang] ?? group.lineKey}
                </td>
              </tr>
              {/* Machine rows within this line */}
              {group.machineIds.map((id) => {
                const m = findMachine(id);
                if (!m) return null;
                const energy = perStationEnergy[id];
                return (
                  <MachineRow
                    key={id}
                    machine={m}
                    lang={lang}
                    kWhPerTile={energy?.kWhPerTile ?? 0}
                  />
                );
              })}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// LINE VIEW — OEE per line (3 rows)
// ═══════════════════════════════════════════════════════════════

/** Line view: 3 lines with P, Q, OEE, energy metrics */
function LineView({ lines, lang }: { lines: LineOEE[]; lang: "tr" | "en" }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left">
        <thead>
          <tr className="text-white/50 text-xs uppercase tracking-wide border-b border-white/5">
            <th className="py-2 px-2 text-left font-medium">
              {lang === "tr" ? "Hat" : "Line"}
            </th>
            <th className="py-2 px-2 text-right font-medium">P %</th>
            <th className="py-2 px-2 text-right font-medium">Q %</th>
            <th className="py-2 px-2 text-right font-medium">OEE %</th>
            <th className="py-2 px-2 text-right font-medium">
              {lang === "tr" ? "Toplam kWh" : "Total kWh"}
            </th>
            <th className="py-2 px-2 text-right font-medium">kWh/tile</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => {
            /** Line 3 (conveyor) has P = "—" since performance is always 1.0 */
            const isConveyor = line.lineId === "line3";
            return (
              <tr
                key={line.lineId}
                className="border-b border-white/5 hover:bg-white/5 transition-colors"
              >
                <td className="py-2 px-2 text-sm text-white/80">
                  {line.name[lang]}
                </td>
                <td className="py-2 px-2 text-right text-sm font-mono text-white/70">
                  {isConveyor ? "—" : `${(line.performance * 100).toFixed(1)}`}
                </td>
                <td className="py-2 px-2 text-right text-sm font-mono text-white/70">
                  {(line.quality * 100).toFixed(1)}
                </td>
                <td
                  className={`py-2 px-2 text-right text-sm font-mono font-semibold ${getOeeColor(line.oee)}`}
                >
                  {line.oee.toFixed(1)}
                </td>
                <td className="py-2 px-2 text-right text-sm font-mono text-white/60">
                  {line.energy.totalKwh.toFixed(1)}
                </td>
                <td className="py-2 px-2 text-right text-sm font-mono text-white/60">
                  {line.energy.kWhPerTile.toFixed(2)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// FACTORY VIEW — Single FOEE with bottleneck and energy summary
// ═══════════════════════════════════════════════════════════════

/** Factory view: big FOEE number + bottleneck info + energy summary */
function FactoryView({
  oee,
  bottleneck,
  finalOutput,
  energy,
  lang,
}: {
  oee: number;
  bottleneck: "A" | "B";
  finalOutput: number;
  energy: {
    totalKwh: number;
    totalGas: number;
    totalCo2: number;
    kWhPerTile: number;
  };
  lang: "tr" | "en";
}) {
  /** Bottleneck display: which machine rate constrains factory output */
  const bottleneckInfo =
    bottleneck === "B"
      ? `${lang === "tr" ? "Fırın" : "Kiln"} (B = ${KILN_THEORETICAL_RATE} tiles/min)`
      : `${lang === "tr" ? "Pres" : "Press"} (A = ${PRESS_THEORETICAL_RATE} tiles/min)`;

  return (
    <div className="space-y-4">
      {/* Big FOEE display */}
      <div className={`rounded-lg p-6 text-center ${getOeeBgColor(oee)}`}>
        <div className="text-white/50 text-xs uppercase tracking-wide mb-1">
          {lang === "tr" ? "Fabrika OEE" : "Factory OEE"}
        </div>
        <div className={`text-5xl font-bold font-mono ${getOeeColor(oee)}`}>
          {oee.toFixed(1)}%
        </div>
      </div>

      {/* Bottleneck + output info */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white/5 rounded-lg p-3">
          <div className="text-white/40 text-xs uppercase mb-1">
            {lang === "tr" ? "Darboğaz" : "Bottleneck"}
          </div>
          <div className="text-white/80 text-sm font-mono">
            {bottleneckInfo}
          </div>
        </div>
        <div className="bg-white/5 rounded-lg p-3">
          <div className="text-white/40 text-xs uppercase mb-1">
            {lang === "tr" ? "Toplam Üretim" : "Final Output"}
          </div>
          <div className="text-white/80 text-sm font-mono">
            {finalOutput} {lang === "tr" ? "karo" : "tiles"}
          </div>
        </div>
      </div>

      {/* Energy summary grid */}
      <div className="bg-white/5 rounded-lg p-3">
        <div className="text-white/40 text-xs uppercase mb-2">
          {lang === "tr" ? "Enerji Özeti" : "Energy Summary"}
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm font-mono">
          <div className="text-white/50">kWh</div>
          <div className="text-right text-white/80">
            {energy.totalKwh.toFixed(1)}
          </div>
          <div className="text-white/50">
            {lang === "tr" ? "Gaz (m³)" : "Gas (m³)"}
          </div>
          <div className="text-right text-white/80">
            {energy.totalGas.toFixed(1)}
          </div>
          <div className="text-white/50">CO₂ (kg)</div>
          <div className="text-right text-white/80">
            {energy.totalCo2.toFixed(1)}
          </div>
          <div className="text-white/50">kWh/tile</div>
          <div className="text-right text-white/80">
            {energy.kWhPerTile.toFixed(2)}
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MAIN COMPONENT — OEEPanel with tab navigation
// ═══════════════════════════════════════════════════════════════

/**
 * OEEPanel — Hierarchical OEE dashboard with 3 views.
 *
 * Reads from kpiStore.factoryOEE (populated by useKPISync).
 * Standalone component — can be placed anywhere in the layout.
 */
export default function OEEPanel() {
  /** Live hierarchical OEE data from the KPI store */
  const factoryOEE = useKPIStore((s) => s.factoryOEE);
  /** Currently active view tab: machine, line, or factory */
  const [view, setView] = useState<ViewMode>("machine");
  /** Language toggle for bilingual display (Turkish / English) */
  const [lang, setLang] = useState<"tr" | "en">("en");

  // Loading state: no OEE data yet (simulation hasn't started)
  if (!factoryOEE) {
    return (
      <div className="bg-black/60 backdrop-blur-md border border-white/10 rounded-xl p-4">
        <div className="text-center text-white/40 text-sm py-8">
          {lang === "tr"
            ? "OEE verisi bekleniyor..."
            : "Waiting for OEE data..."}
        </div>
      </div>
    );
  }

  /** Build a flat array of all 8 machine OEEs from the 3 lines */
  const allMachines = factoryOEE.lines.flatMap((l) => l.machines);

  /** Tab configuration for the view switcher */
  const tabs: { key: ViewMode; label: { tr: string; en: string } }[] = [
    { key: "machine", label: { tr: "Makine", en: "Machine" } },
    { key: "line", label: { tr: "Hat", en: "Line" } },
    { key: "factory", label: { tr: "Fabrika", en: "Factory" } },
  ];

  return (
    <div className="bg-black/60 backdrop-blur-md border border-white/10 rounded-xl overflow-hidden">
      {/* Header: title + language toggle */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
        <h3 className="text-white/80 text-sm font-semibold tracking-wide uppercase">
          OEE Dashboard
        </h3>
        <button
          onClick={() => setLang((l) => (l === "en" ? "tr" : "en"))}
          className="text-xs text-white/40 hover:text-white/70 border border-white/10 rounded px-2 py-0.5 transition-colors"
          title={lang === "en" ? "Türkçeye geç" : "Switch to English"}
        >
          {lang === "en" ? "TR" : "EN"}
        </button>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 px-3 py-2 border-b border-white/5">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setView(tab.key)}
            className={`px-3 py-1 text-xs rounded transition-colors ${
              view === tab.key
                ? "bg-white/10 text-white font-medium"
                : "text-white/40 hover:text-white/60"
            }`}
          >
            {tab.label[lang]}
          </button>
        ))}
      </div>

      {/* Content area */}
      <div className="p-3">
        {view === "machine" && (
          <MachineView
            machines={allMachines}
            lang={lang}
            perStationEnergy={factoryOEE.energy.perStation}
          />
        )}
        {view === "line" && <LineView lines={factoryOEE.lines} lang={lang} />}
        {view === "factory" && (
          <FactoryView
            oee={factoryOEE.oee}
            bottleneck={factoryOEE.bottleneck}
            finalOutput={factoryOEE.finalOutput}
            energy={factoryOEE.energy}
            lang={lang}
          />
        )}
      </div>
    </div>
  );
}
