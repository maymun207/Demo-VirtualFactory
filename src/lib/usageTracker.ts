/**
 * usageTracker.ts — Simulator Usage Analytics Module
 *
 * Collects browser, device, and geolocation data for every simulator
 * instance that connects. Records are stored in the `usage_log` table
 * in Supabase and are NEVER deleted — they serve as a permanent
 * historical audit log of simulator usage.
 *
 * Exported functions:
 *  - getBrowserInfo()   — Parses navigator.userAgent for browser + OS names
 *  - getScreenInfo()    — Returns screen resolution as "WxH" string
 *  - fetchGeoIP()       — Best-effort IP geolocation via free API
 *  - logConnect()       — Inserts a usage_log row on session start
 *  - logDisconnect()    — Updates the row with disconnection time + duration
 *
 * Dependencies:
 *  - Supabase client (optional — skips logging if null)
 *  - GEOIP_API_URL, GEOIP_TIMEOUT_MS from params/sync
 *
 * Used by: sessionSlice.ts (wired into session lifecycle)
 */

import { supabase } from './supabaseClient';
import { createLogger } from './logger';
import { GEOIP_API_URL, GEOIP_TIMEOUT_MS } from './params/sync';

/** Module-level logger for usage tracking operations. */
const log = createLogger('UsageTracker');

// =============================================================================
// BROWSER & DEVICE INFO
// =============================================================================

/**
 * Information extracted from the browser's user agent string.
 * Used to populate browser_name and os_name columns in usage_log.
 */
export interface BrowserInfo {
  /** Full raw user agent string. */
  userAgent: string;
  /** Parsed browser name and version (e.g. "Chrome 120"). */
  browserName: string;
  /** Parsed operating system name (e.g. "macOS", "Windows 11"). */
  osName: string;
}

/**
 * Parse the browser's navigator.userAgent string to extract
 * a human-readable browser name and operating system.
 *
 * @returns BrowserInfo with userAgent, browserName, and osName fields
 */
export function getBrowserInfo(): BrowserInfo {
  const ua = navigator.userAgent;

  // ── Browser name detection ───────────────────────────────────────
  let browserName = 'Unknown';
  if (ua.includes('Firefox/')) {
    /** Firefox identifies itself with "Firefox/VERSION". */
    const match = ua.match(/Firefox\/([\d.]+)/);
    browserName = match ? `Firefox ${match[1]}` : 'Firefox';
  } else if (ua.includes('Edg/')) {
    /** Edge (Chromium) uses "Edg/VERSION" (not "Edge"). */
    const match = ua.match(/Edg\/([\d.]+)/);
    browserName = match ? `Edge ${match[1]}` : 'Edge';
  } else if (ua.includes('Chrome/') && !ua.includes('Edg/')) {
    /** Chrome uses "Chrome/VERSION", exclude Edge which also has Chrome. */
    const match = ua.match(/Chrome\/([\d.]+)/);
    browserName = match ? `Chrome ${match[1]}` : 'Chrome';
  } else if (ua.includes('Safari/') && !ua.includes('Chrome/')) {
    /** Safari uses "Version/VERSION Safari/...", exclude Chrome-based. */
    const match = ua.match(/Version\/([\d.]+)/);
    browserName = match ? `Safari ${match[1]}` : 'Safari';
  }

  // ── OS name detection ────────────────────────────────────────────
  let osName = 'Unknown';
  if (ua.includes('Windows NT 10.0')) {
    osName = 'Windows 10/11';
  } else if (ua.includes('Windows NT')) {
    osName = 'Windows';
  } else if (ua.includes('Mac OS X')) {
    /** macOS uses "Mac OS X 10_15_7" format with underscores. */
    const match = ua.match(/Mac OS X ([\d_]+)/);
    osName = match ? `macOS ${match[1].replace(/_/g, '.')}` : 'macOS';
  } else if (ua.includes('Linux')) {
    osName = 'Linux';
  } else if (ua.includes('Android')) {
    osName = 'Android';
  } else if (ua.includes('iPhone') || ua.includes('iPad')) {
    osName = 'iOS';
  }

  return { userAgent: ua, browserName, osName };
}

/**
 * Return the screen resolution as a "WIDTHxHEIGHT" string.
 * Uses window.screen which reflects the physical display dimensions.
 *
 * @returns Screen resolution string, e.g. "1920x1080"
 */
export function getScreenInfo(): string {
  return `${window.screen.width}x${window.screen.height}`;
}

// =============================================================================
// IP GEOLOCATION
// =============================================================================

/**
 * Geolocation data returned from the free IP API.
 * All fields are optional — may be partially available.
 */
export interface GeoIPData {
  /** Public IP address of the client. */
  ip?: string;
  /** Country name (e.g. "Turkey"). */
  country?: string;
  /** City name (e.g. "Istanbul"). */
  city?: string;
}

/**
 * Fetch IP geolocation data from the configured free API.
 * Best-effort: returns empty object on failure or timeout.
 * Uses AbortController for timeout enforcement.
 *
 * @returns GeoIPData with ip, country, city (all optional)
 */
export async function fetchGeoIP(): Promise<GeoIPData> {
  try {
    /** AbortController for enforcing the GEOIP_TIMEOUT_MS limit. */
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), GEOIP_TIMEOUT_MS);

    const response = await fetch(GEOIP_API_URL, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      log.warn('GeoIP API returned status %d', response.status);
      return {};
    }

    const data = await response.json();
    return {
      ip: data.ip || undefined,
      country: data.country_name || undefined,
      city: data.city || undefined,
    };
  } catch (err) {
    /** Silently fail — geo data is optional enrichment. */
    log.warn('GeoIP fetch failed (non-critical):', err);
    return {};
  }
}

// =============================================================================
// USAGE LOG — Supabase INSERT / UPDATE
// =============================================================================

/**
 * Result of a successful logConnect call.
 * Contains the usage log record ID and connection timestamp
 * needed for the later logDisconnect call.
 */
export interface UsageLogHandle {
  /** UUID of the inserted usage_log row. */
  logId: string;
  /** ISO timestamp when the connection was logged. */
  connectedAt: string;
}

/**
 * Insert a usage_log row when a simulator session starts.
 * Gathers browser info, screen resolution, language, and IP geolocation.
 * Returns a handle for later disconnect tracking.
 *
 * @param sessionId - UUID of the simulation_sessions row (nullable)
 * @returns UsageLogHandle on success, null on failure or no Supabase
 */
export async function logConnect(sessionId: string | null): Promise<UsageLogHandle | null> {
  /** Skip entirely if Supabase is not configured. */
  if (!supabase) return null;

  try {
    /** Gather browser and device info synchronously. */
    const browser = getBrowserInfo();
    const screen = getScreenInfo();
    const language = navigator.language || 'unknown';

    /** Fetch IP geolocation asynchronously (best-effort). */
    const geo = await fetchGeoIP();

    const connectedAt = new Date().toISOString();

    /** Insert the usage log row. */
    const { data, error } = await supabase
      .from('usage_log')
      .insert({
        session_id: sessionId,
        connected_at: connectedAt,
        user_agent: browser.userAgent,
        browser_name: browser.browserName,
        os_name: browser.osName,
        screen_resolution: screen,
        language,
        ip_address: geo.ip || null,
        country: geo.country || null,
        city: geo.city || null,
      })
      .select('id')
      .single();

    if (error) {
      log.warn('Usage log INSERT failed:', error.message);
      return null;
    }

    log.info('Usage log created — id: %s, browser: %s, ip: %s', data.id, browser.browserName, geo.ip || 'n/a');
    return { logId: data.id, connectedAt };
  } catch (err) {
    log.warn('Usage log connect error:', err);
    return null;
  }
}

/**
 * Update the usage_log row when the simulator session disconnects.
 * Sets disconnected_at and computes duration_seconds from the connection time.
 *
 * @param logId       - UUID of the usage_log row to update
 * @param connectedAt - ISO timestamp of when the connection started
 */
export async function logDisconnect(logId: string, connectedAt: string): Promise<void> {
  /** Skip entirely if Supabase is not configured. */
  if (!supabase) return;

  try {
    const now = new Date();
    /** Calculate duration in whole seconds. */
    const durationSeconds = Math.round((now.getTime() - new Date(connectedAt).getTime()) / 1000);

    const { error } = await supabase
      .from('usage_log')
      .update({
        disconnected_at: now.toISOString(),
        duration_seconds: durationSeconds,
      })
      .eq('id', logId);

    if (error) {
      log.warn('Usage log UPDATE failed:', error.message);
    } else {
      log.info('Usage log disconnected — id: %s, duration: %ds', logId, durationSeconds);
    }
  } catch (err) {
    log.warn('Usage log disconnect error:', err);
  }
}
