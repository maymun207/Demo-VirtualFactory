/**
 * useKPISync.ts — KPI Orchestration Hook
 *
 * Bridges the gap between simulationStore (raw simulation data) and
 * kpiStore (derived KPI metrics). Subscribes to S-Clock changes and
 * computes all KPIs in a single synchronous pass on each tick.
 *
 * Data Flow:
 *   useSystemTimer → advanceSClock() → sClockCount changes →
 *   useKPISync detects change → calculates KPIs → writes to kpiStore
 *
 * Computed KPIs:
 *   - OEE (Overall Equipment Effectiveness) = Availability × Performance × Quality
 *   - FTQ (First Time Quality) = shipped / (shipped + secondQuality + wasted)
 *   - Total KPI = (shipped + secondQuality) / total
 *   - Scrap Rate = wasted / total
 *   - Energy (kWh), Gas (m³), CO₂ (kg) = speed-dependent per-station consumption
 *   - Trends = rolling window comparison (last N ticks vs current)
 *   - Defects = randomized jitter on base values for heatmap visualization
 *
 * Used by: App.tsx (mounted once at root level)
 */
import { useEffect, useRef } from 'react';
import { useSimulationStore } from '../store/simulationStore';
import { useSimulationDataStore } from '../store/simulationDataStore';
import { useKPIStore } from '../store/kpiStore';
import {
  calculateEnergy,
  calculateFTQ,
  calculateScrap,
  calculateTotalKPI,
  updateKPIs,
  calculateTrends,
  calculateDefectRatesFromSnapshots,
} from '../lib/kpiCalculations';
import {
  countStationExits,
  calculateAllMOEEs,
  calculateAllLOEEs,
  calculateFOEE,
} from '../lib/oeeCalculations';

/**
 * Subscribes to simulationStore.sClockCount and recalculates all KPIs
 * on each S-Clock tick. Results are pushed to kpiStore.
 *
 * Must be called exactly once in the component tree (typically in App.tsx).
 * Uses Zustand's `subscribeWithSelector` for fine-grained subscription.
 */
export function useKPISync() {
  /**
   * Track the previous S-Clock value to detect resets.
   * If sClockCount goes backwards (factory reset), we skip the update
   * and let the next tick start fresh.
   */
  const prevSClockRef = useRef(0);

  useEffect(() => {
    // Subscribe to sClockCount changes in simulationStore
    const unsub = useSimulationStore.subscribe(
      (state) => state.sClockCount,
      (sClockCount) => {
        // Guard: skip if clock hasn't advanced (or was reset)
        if (sClockCount <= prevSClockRef.current) {
          prevSClockRef.current = sClockCount;
          return;
        }
        prevSClockRef.current = sClockCount;

        // ── Read current state from both stores ──────────────────
        const simState = useSimulationStore.getState();
        const kpiState = useKPIStore.getState();

        // Production is "active" only when data flows AND conveyor runs
        const isRunning =
          simState.isDataFlowing && simState.conveyorStatus === 'running';

        // ── STEP-3: Calculate scenario energy multiplier ─────────
        // When a scenario is active, energy consumption increases by
        // the average of the expectedEnergyImpact range (as a percentage).
        const { activeScenario } = useSimulationDataStore.getState();
        const scenarioEnergyMultiplier = activeScenario
          ? 1 + (activeScenario.expectedEnergyImpact.min + activeScenario.expectedEnergyImpact.max) / 200
          : 1.0;

        // ── Calculate raw KPI values ─────────────────────────────
        const energy = calculateEnergy(
          simState.conveyorSpeed,
          simState.partPositionsRef.current,
          isRunning,
          scenarioEnergyMultiplier,
        );
        /**
         * KPI SINGLE SOURCE OF TRUTH: DERIVE quality counts by iterating
         * the tiles Map. This guarantees the KPI calculations match the
         * tiles table in Supabase (which CWF queries). The old cumulative
         * counters (totalFirstQuality, etc.) diverge from the Map due to
         * microtask timing issues in moveTilesOnConveyor.
         */
        const ds = useSimulationDataStore.getState();
        let dsShipment = 0;
        let dsSecondQuality = 0;
        let dsScrap = 0;
        for (const tile of ds.tiles.values()) {
          /**
           * Only count COMPLETED or SCRAPPED tiles in KPI calculations.
           * Tiles still in_production may be temporarily tagged as first_quality
           * before the microtask defect evaluation re-grades them, inflating
           * the shipment counter and skewing FTQ / scrap / totalKPI.
           */
          const done = tile.status === 'completed' || tile.status.startsWith('scrapped_at_');
          if (!done) continue;
          if (tile.final_grade === 'first_quality') dsShipment++;
          else if (tile.final_grade === 'second_quality') dsSecondQuality++;
          else if (tile.final_grade === 'scrap') dsScrap++;
        }
        /**
         * dsWaste = dsScrap only (Map-derived).
         * Previously this was `dsScrap + ds.totalTilesScrapped` which
         * double-counted every scrapped tile because both values track
         * the same set of tiles from different sources.
         */
        const dsWaste = dsScrap;
        const ftq = calculateFTQ(dsShipment, dsSecondQuality, dsWaste);
        const scrap = calculateScrap(dsShipment, dsSecondQuality, dsWaste);
        const totalKpi = calculateTotalKPI(dsShipment, dsSecondQuality, dsWaste);

        // ── OEE PIPELINE ──────────────────────────────────────────

        // Step 1: Accumulate per-station energy (add this tick's energy to cumulative)
        const prevCumEnergy = kpiState.cumulativeStationEnergy;
        const newCumEnergy: Record<string, { kWh: number; gas: number; co2: number }> = { ...prevCumEnergy };
        for (const [id, e] of Object.entries(energy.perStation)) {
          const prev = newCumEnergy[id] || { kWh: 0, gas: 0, co2: 0 };
          newCumEnergy[id] = {
            kWh: prev.kWh + e.kWh,
            gas: prev.gas + e.gas,
            co2: prev.co2 + e.co2,
          };
        }

        // Step 2: Read runtime timing constant for tick-based theoretical
        const stationInterval = simState.stationInterval;

        // Step 3: Count tiles at each station measurement point
        const stationCounts = countStationExits(
          ds.tileSnapshots,
          dsShipment,
          dsSecondQuality,
          sClockCount,
          stationInterval,
        );

        // Step 4: Calculate hierarchical OEE (Machine → Line → Factory)
        const moees = calculateAllMOEEs(stationCounts);
        const loees = calculateAllLOEEs(stationCounts, moees, newCumEnergy);
        const foee = calculateFOEE(stationCounts, loees, newCumEnergy);

        // Step 5: Use FOEE as the OEE value for the KPI card (replaces legacy formula)
        const oee = foee.oee;

        // ── Compute cumulative totals from per-station sums ────────
        // These are the "meter readings" — monotonically increasing
        // throughout the simulation run, just like real factory meters.
        let cumulativeKwh = 0;
        let cumulativeGas = 0;
        let cumulativeCo2 = 0;
        for (const e of Object.values(newCumEnergy)) {
          cumulativeKwh += e.kWh;
          cumulativeGas += e.gas;
          cumulativeCo2 += e.co2;
        }

        // ── Build a cumulative EnergyResult for the KPI card display ─
        // The KPI cards now show cumulative totals (meter readings)
        // instead of instantaneous per-tick consumption.
        const cumulativeEnergy = {
          ...energy,
          totalKwh: cumulativeKwh,
          totalGas: cumulativeGas,
          totalCO2: cumulativeCo2,
        };

        // ── Update KPI display values (format numbers, set units) ─
        let newKpis = updateKPIs(kpiState.kpis, { energy: cumulativeEnergy, ftq, totalKpi, scrap, oee });

        // ── Calculate trends (compare current vs. historical) ────
        // Trends use INSTANTANEOUS values for energy/gas/co2 so arrows
        // show whether consumption RATE is changing (speeding up / slowing
        // down), not the cumulative growth which is always "up".
        const currentVals = {
          oee,
          ftq,
          total_kpi: totalKpi,
          scrap,
          energy: energy.totalKwh,
          gas: energy.totalGas,
          co2: energy.totalCO2,
        };
        const trendResult = calculateTrends(
          newKpis,
          currentVals,
          kpiState.kpiHistory,
          sClockCount,
        );
        newKpis = trendResult.kpis;

        // ── Calculate real defect rates from tile snapshots ──────
        const newDefects = calculateDefectRatesFromSnapshots(
          ds.tileSnapshots,
          kpiState.defects,
        );

        // ── Push all updates to kpiStore in one batch ─────────────
        useKPIStore.setState({
          kpis: newKpis,
          defects: newDefects,
          kpiHistory: trendResult.history,
          factoryOEE: foee,
          stationCounts,
          cumulativeStationEnergy: newCumEnergy,
          /** Store instantaneous (per-tick) energy for alarm threshold checks */
          instantaneousEnergyKwh: energy.totalKwh,
        });
      },
    );

    return unsub;
  }, []);
}
