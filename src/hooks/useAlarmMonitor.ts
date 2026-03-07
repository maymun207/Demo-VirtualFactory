/**
 * useAlarmMonitor.ts — Threshold-based Alarm Generator
 *
 * Subscribes to simulationStore and kpiStore, checking KPI values
 * and station statuses against configured thresholds. When a threshold
 * is crossed, an alarm entry is pushed via addAlarm() (local UI) AND
 * recordAlarm() (Supabase sync queue).
 *
 * Alarms monitored:
 *  - OEE drop below ALARM_OEE_CRITICAL → oee_alert (critical)
 *  - FTQ drop below ALARM_FTQ_WARNING → quality_alert (warning)
 *  - Scrap rise above ALARM_SCRAP_WARNING → scrap_alert (warning)
 *  - Energy rise above ALARM_ENERGY_WARNING → energy_alert (warning)
 *  - Station status change → machine_error / machine_warning / machine_normal
 *
 * Uses cooldown (ALARM_COOLDOWN_TICKS) to avoid alarm flooding.
 *
 * Dual write:
 *  - addAlarm() → simulationStore.alarmLog (local UI ring-buffer)
 *  - recordAlarm() → simulationDataStore.alarmLogs (Supabase sync queue)
 *
 * Used by: Dashboard.tsx
 */
import { useEffect, useRef } from 'react';
import { useSimulationStore, type AlarmType, type AlarmSeverity } from '../store/simulationStore';
import { useSimulationDataStore } from '../store/simulationDataStore';
import { useKPIStore } from '../store/kpiStore';
import type { KPI, StationData } from '../lib/params';
import {
  ALARM_OEE_CRITICAL,
  ALARM_FTQ_WARNING,
  ALARM_SCRAP_WARNING,
  ALARM_ENERGY_WARNING,
  ALARM_COOLDOWN_TICKS,
  INITIAL_STATIONS,
} from '../lib/params';

/** Tracks the last S-Clock tick at which each alarm type fired */
type CooldownMap = Record<string, number>;

export const useAlarmMonitor = () => {
  const cooldownRef = useRef<CooldownMap>({});
  const prevStationStatusRef = useRef<Record<string, string>>({});
  const prevKPIsRef = useRef<KPI[]>([]);

  // Initialize previous station statuses
  useEffect(() => {
    const statuses: Record<string, string> = {};
    for (const s of INITIAL_STATIONS) {
      statuses[s.id] = s.status;
    }
    prevStationStatusRef.current = statuses;
  }, []);

  // ── KPI Threshold Monitoring ──────────────────────────────────────────────
  useEffect(() => {
    const unsubKPI = useKPIStore.subscribe((state) => {
      const kpis = state.kpis;
      // Skip if KPIs haven't changed (reference equality)
      if (kpis === prevKPIsRef.current) return;
      prevKPIsRef.current = kpis;

      const simState = useSimulationStore.getState();
      if (!simState.isDataFlowing) return;

      const sClock = simState.sClockCount;
      const cooldowns = cooldownRef.current;
      const addAlarm = simState.addAlarm;
      /** recordAlarm queues the alarm for Supabase batch sync */
      const recordAlarm = useSimulationDataStore.getState().recordAlarm;

      // Parse KPI values
      const oee = parseFloat(kpis.find((k: KPI) => k.id === 'oee')?.value ?? '100');
      const ftq = parseFloat(kpis.find((k: KPI) => k.id === 'ftq')?.value ?? '100');
      const scrap = parseFloat(kpis.find((k: KPI) => k.id === 'scrap')?.value ?? '0');
      /**
       * Energy alarm uses the INSTANTANEOUS per-tick rate (not the cumulative
       * total displayed on the KPI card). This prevents continuous alarms
       * once cumulative total exceeds the per-tick threshold.
       */
      const energy = useKPIStore.getState().instantaneousEnergyKwh;

      /**
       * Helper: fire alarm if cooldown has elapsed.
       * Dual-writes to both simulationStore (UI) and simulationDataStore (Supabase).
       */
      const maybeAlarm = (
        type: AlarmType,
        condition: boolean,
        severity: AlarmSeverity,
        message: string,
      ) => {
        if (!condition) return;
        const lastFired = cooldowns[type] ?? -Infinity;
        if (sClock - lastFired < ALARM_COOLDOWN_TICKS) return;
        cooldowns[type] = sClock;
        /** Push to local UI ring-buffer */
        addAlarm({ type, severity, message });
        /** Queue for Supabase batch sync (scoped to active session) */
        recordAlarm({ type, severity, message });
      };

      // Skip checking until simulation has run for at least a few ticks
      if (sClock < 5) return;

      maybeAlarm('oee_alert', oee < ALARM_OEE_CRITICAL, 'critical',
        `OEE dropped to ${oee.toFixed(1)}% (threshold: ${ALARM_OEE_CRITICAL}%)`);

      maybeAlarm('quality_alert', ftq < ALARM_FTQ_WARNING, 'warning',
        `FTQ dropped to ${ftq.toFixed(1)}% (threshold: ${ALARM_FTQ_WARNING}%)`);

      maybeAlarm('scrap_alert', scrap > ALARM_SCRAP_WARNING, 'warning',
        `Scrap rate at ${scrap.toFixed(1)}% (threshold: ${ALARM_SCRAP_WARNING}%)`);

      maybeAlarm('energy_alert', energy > ALARM_ENERGY_WARNING, 'warning',
        `Energy consumption at ${energy.toFixed(1)} kWh (threshold: ${ALARM_ENERGY_WARNING} kWh)`);
    });

    return () => unsubKPI();
  }, []);

  // ── Station Status Monitoring ─────────────────────────────────────────────
  useEffect(() => {
    // simulationStore uses subscribeWithSelector, so 2-arg form is valid
    const unsub = useSimulationStore.subscribe(
      (state) => state.stations,
      (stations: StationData[]) => {
        const simState = useSimulationStore.getState();
        if (!simState.isDataFlowing) return;

        const prevStatuses = prevStationStatusRef.current;
        const addAlarm = simState.addAlarm;
        /** recordAlarm queues the alarm for Supabase batch sync */
        const recordAlarm = useSimulationDataStore.getState().recordAlarm;

        for (const station of stations) {
          const prev = prevStatuses[station.id];
          const curr = station.status;
          if (prev === curr) continue;

          /** Alarm payload shared between UI and Supabase */
          let alarmPayload: {
            type: AlarmType;
            severity: AlarmSeverity;
            stationId: string;
            message: string;
          } | null = null;

          if (curr === 'error') {
            alarmPayload = {
              type: 'machine_error',
              severity: 'critical',
              stationId: station.id,
              message: `${station.name.en} entered ERROR state`,
            };
          } else if (curr === 'warning') {
            alarmPayload = {
              type: 'machine_warning',
              severity: 'warning',
              stationId: station.id,
              message: `${station.name.en} entered WARNING state`,
            };
          } else if (curr === 'normal' && (prev === 'error' || prev === 'warning')) {
            alarmPayload = {
              type: 'machine_normal',
              severity: 'info',
              stationId: station.id,
              message: `${station.name.en} returned to NORMAL`,
            };
          }

          if (alarmPayload) {
            /** Push to local UI ring-buffer */
            addAlarm(alarmPayload);
            /** Queue for Supabase batch sync (scoped to active session) */
            recordAlarm(alarmPayload);
          }

          prevStatuses[station.id] = curr;
        }
      },
    );

    return () => unsub();
  }, []);

  return null;
};
