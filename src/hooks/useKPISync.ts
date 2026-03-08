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

  /**
   * Cumulative count of all S-Clock ticks since simulation start.
   * Used as the denominator for conveyor availability calculation.
   * Resets on factory reset (sClockCount goes to 0).
   */
  const totalConveyorTicksRef = useRef(0);

  /**
   * Cumulative count of S-Clock ticks when conveyorStatus was 'jammed'.
   * Availability = 1 - (jamTicks / totalTicks).
   * Resets on factory reset (sClockCount goes to 0).
   */
  const jamConveyorTicksRef = useRef(0);

  useEffect(() => {
    // Subscribe to sClockCount changes in simulationStore
    const unsub = useSimulationStore.subscribe(
      (state) => state.sClockCount,
      (sClockCount) => {
        // Guard: skip if clock hasn't advanced (or was reset)
        if (sClockCount <= prevSClockRef.current) {
          prevSClockRef.current = sClockCount;
          // Full reset detected — clear conveyor availability counters
          if (sClockCount === 0) {
            totalConveyorTicksRef.current = 0;
            jamConveyorTicksRef.current = 0;
          }
          return;
        }
        prevSClockRef.current = sClockCount;

        // ── Read current state from both stores ──────────────────
        const simState = useSimulationStore.getState();

        // ── Conveyor Availability Tracking ───────────────────────
        // Count every tick that elapses. Count jammed ticks separately.
        // Availability = fraction of ticks the belt was NOT jammed.
        totalConveyorTicksRef.current += 1;
        if (simState.conveyorStatus === 'jammed') {
          jamConveyorTicksRef.current += 1;
        }
        const conveyorAvailability = totalConveyorTicksRef.current > 0
          ? 1 - (jamConveyorTicksRef.current / totalConveyorTicksRef.current)
          : 1.0;
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
         * KPI SINGLE SOURCE OF TRUTH: Read quality counters from the data store,
         * NOT the visual layer. Both layers are now lockstep from a single
         * counter (workOrderStore.tilesSpawned), so the data store's cumulative
         * quality counters are the authoritative source for KPI calculations.
         *
         * totalScrapGraded = tiles graded as scrap at line exit
         * totalTilesScrapped = tiles scrapped mid-line (conveyor jam damage)
         * Total waste = both combined for KPI purposes
         */
        const ds = useSimulationDataStore.getState();
        const dsShipment = ds.totalFirstQuality;
        const dsSecondQuality = ds.totalSecondQuality;
        const dsWaste = ds.totalScrapGraded + ds.totalTilesScrapped;
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
        // Pass the live conveyorSpeed so the belt's Performance (P) component
        // reflects the actual belt speed relative to the nominal design speed.
        // Pass conveyorAvailability (A) so jam events reduce conveyor OEE
        // exactly as they reduce other machines (whose theoretical output
        // keeps growing while actual output freezes during a jam).
        const moees = calculateAllMOEEs(stationCounts, simState.conveyorSpeed, conveyorAvailability);
        const loees = calculateAllLOEEs(stationCounts, moees, newCumEnergy, simState.conveyorSpeed, conveyorAvailability);

        /** Extract conveyor OEE from the machines array for the weighted FOEE calculation.
         *  If not found (impossible in practice), default to 100% (no impact). */
        const conveyorMoee = moees.find(m => m.machineId === 'conveyor');
        const conveyorOeeValue = conveyorMoee ? conveyorMoee.oee : 100;

        const foee = calculateFOEE(stationCounts, loees, newCumEnergy, conveyorOeeValue);

        // Step 5: Use FOEE as the OEE value for the KPI card (replaces legacy formula)
        const oee = foee.oee;

        // ── Update KPI display values (format numbers, set units) ─
        let newKpis = updateKPIs(kpiState.kpis, { energy, ftq, totalKpi, scrap, oee });

        // ── Calculate trends (compare current vs. historical) ────
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
        });
      },
    );

    return unsub;
  }, []);
}
