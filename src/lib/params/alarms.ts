/**
 * ╔═══════════════════════════════════════════════════════════════════╗
 * ║  ALARMS — Alarm thresholds, cooldown, ring-buffer limit,        ║
 * ║  alarm type metadata, station labels, severity badge styles,    ║
 * ║  and alarm log display formatting.                               ║
 * ╚═══════════════════════════════════════════════════════════════════╝
 */

// ═══════════════════════════════════════════════════════════════════
// ALARM / FAULT — Ring-buffer limits
// ═══════════════════════════════════════════════════════════════════

/**
 * Maximum alarm log entries to retain.
 * Older entries beyond this limit are dropped (ring buffer pattern)
 * to prevent unbounded memory growth during long simulation runs.
 */
export const MAX_ALARM_LOG = 100;

// ═══════════════════════════════════════════════════════════════════
// ALARM THRESHOLDS — KPI/quality limits that trigger alarm entries
// ═══════════════════════════════════════════════════════════════════

/** OEE below this % triggers an oee_alert (critical) */
export const ALARM_OEE_CRITICAL = 60;
/** FTQ below this % triggers a quality_alert (warning) */
export const ALARM_FTQ_WARNING = 85;
/** Scrap above this % triggers a scrap_alert (warning) */
export const ALARM_SCRAP_WARNING = 15;
/** Energy above this kWh per tick triggers an energy_alert (warning).
 *  With ENERGY_TICK_SCALE=0.08, max instantaneous ≈ 16.5 kWh at 2× speed.
 *  Threshold of 18 ensures zero alarms during baseline (SCN-000) production;
 *  only scenario-driven energy surges will trigger alerts. */
export const ALARM_ENERGY_WARNING = 18;
/** Minimum S-Clock ticks between repeated threshold alarms (cooldown) */
export const ALARM_COOLDOWN_TICKS = 20;
/** Supabase table name for alarm log records (per-session) */
export const ALARM_LOG_TABLE_NAME = 'simulation_alarm_logs';

// ═══════════════════════════════════════════════════════════════════
// ALARM DISPLAY — Labels and severity styling for alarm types
// ═══════════════════════════════════════════════════════════════════

/** Metadata for each alarm type: display label, default severity, bilingual source */
export const ALARM_TYPE_CONFIG: Record<string, {
  /** Display label for the alarm badge */
  label: string;
  /** Default severity level */
  severity: 'critical' | 'warning' | 'info';
  /** Bilingual source/origin label for the "Machine" column */
  source: { tr: string; en: string };
}> = {
  jam_start: { label: 'JAM START', severity: 'critical', source: { tr: 'Konveyör', en: 'Conveyor' } },
  jam_cleared: { label: 'JAM CLEARED', severity: 'info', source: { tr: 'Konveyör', en: 'Conveyor' } },
  machine_error: { label: 'MACHINE ERROR', severity: 'critical', source: { tr: 'Makine', en: 'Machine' } },
  machine_warning: { label: 'MACHINE WARNING', severity: 'warning', source: { tr: 'Makine', en: 'Machine' } },
  machine_normal: { label: 'MACHINE NORMAL', severity: 'info', source: { tr: 'Makine', en: 'Machine' } },
  quality_alert: { label: 'QUALITY ALERT', severity: 'warning', source: { tr: 'Kalite', en: 'Quality' } },
  scrap_alert: { label: 'SCRAP ALERT', severity: 'warning', source: { tr: 'Hurda', en: 'Scrap' } },
  oee_alert: { label: 'OEE ALERT', severity: 'critical', source: { tr: 'OEE', en: 'OEE' } },
  energy_alert: { label: 'ENERGY ALERT', severity: 'warning', source: { tr: 'Enerji', en: 'Energy' } },
  system_info: { label: 'SYSTEM INFO', severity: 'info', source: { tr: 'Sistem', en: 'System' } },
} as const;

// ═══════════════════════════════════════════════════════════════════
// ALARM LOG — Display formatting
// ═══════════════════════════════════════════════════════════════════

/** Locale string for formatting alarm timestamps */
export const ALARM_LOG_LOCALE = 'en-GB';

/**
 * Human-readable station labels for the Alarm Log "Machine" column.
 * Maps internal station IDs to bilingual display names.
 * The 'system' key is used for factory-wide KPI alarms that are not
 * associated with a specific machine (OEE, FTQ, scrap, energy).
 */
export const ALARM_STATION_LABELS: Record<string, { tr: string; en: string }> = {
  press: { tr: 'Pres', en: 'Press' },
  dryer: { tr: 'Kurutma', en: 'Dryer' },
  glaze: { tr: 'Sırlama', en: 'Glaze' },
  printer: { tr: 'Baskı', en: 'Printer' },
  kiln: { tr: 'Fırın', en: 'Kiln' },
  sorting: { tr: 'Ayıklama', en: 'Sorting' },
  packaging: { tr: 'Paketleme', en: 'Packaging' },
  system: { tr: 'Sistem', en: 'System' },
};

/**
 * Severity-based badge color classes for the Alarm Log panel.
 * Maps each alarm severity level to its Tailwind CSS classes.
 */
export const SEVERITY_BADGE_STYLES: Record<
  'critical' | 'warning' | 'info',
  { bg: string; text: string; border: string; dot: string }
> = {
  critical: {
    bg: 'bg-red-500/15',
    text: 'text-red-400',
    border: 'border-red-500/20',
    dot: 'bg-red-400',
  },
  warning: {
    bg: 'bg-amber-500/15',
    text: 'text-amber-400',
    border: 'border-amber-500/20',
    dot: 'bg-amber-400',
  },
  info: {
    bg: 'bg-emerald-500/15',
    text: 'text-emerald-400',
    border: 'border-emerald-500/20',
    dot: 'bg-emerald-400',
  },
} as const;
