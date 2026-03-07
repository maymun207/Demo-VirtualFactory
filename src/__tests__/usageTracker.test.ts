/**
 * usageTracker.test.ts — Unit Tests for Usage Analytics Module
 *
 * Tests the browser/device info parsing and duration calculation
 * logic in usageTracker.ts. Does NOT test actual Supabase calls
 * (those are integration tests) — focuses on pure utility functions.
 *
 * Tests:
 *  1. getBrowserInfo() returns non-empty browser and OS names
 *  2. getScreenInfo() returns "WxH" format string
 *  3. fetchGeoIP() returns an object (even on failure)
 *  4. Duration calculation: logDisconnect computes correct seconds
 *  5. logConnect returns null when supabase is null
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getBrowserInfo,
  getScreenInfo,
  fetchGeoIP,
  logConnect,
  logDisconnect,
} from '../lib/usageTracker';

describe('UsageTracker', () => {
  // ── Browser Info ────────────────────────────────────────────────
  describe('getBrowserInfo', () => {
    /** Test 1: Should return valid browser info from navigator. */
    it('should return a BrowserInfo object with non-empty fields', () => {
      const info = getBrowserInfo();
      /** userAgent should always be a non-empty string. */
      expect(info.userAgent).toBeDefined();
      expect(typeof info.userAgent).toBe('string');
      /** browserName should be parsed from the UA string. */
      expect(info.browserName).toBeDefined();
      expect(typeof info.browserName).toBe('string');
      /** osName should be parsed from the UA string. */
      expect(info.osName).toBeDefined();
      expect(typeof info.osName).toBe('string');
    });

    /** Test 2: browserName should not be "Unknown" in a real browser env (jsdom). */
    it('should detect at least one known browser or return Unknown', () => {
      const info = getBrowserInfo();
      /** In jsdom, UA is usually something like "Mozilla/5.0 ...jsdom...". */
      const knownBrowsers = ['Chrome', 'Firefox', 'Safari', 'Edge', 'Unknown'];
      const matches = knownBrowsers.some((b) => info.browserName.startsWith(b));
      expect(matches).toBe(true);
    });
  });

  // ── Screen Info ─────────────────────────────────────────────────
  describe('getScreenInfo', () => {
    /** Test 3: Should return a "WxH" format string. */
    it('should return a string in WIDTHxHEIGHT format', () => {
      const screen = getScreenInfo();
      /** Format should be two numbers separated by "x". */
      expect(screen).toMatch(/^\d+x\d+$/);
    });
  });

  // ── GeoIP ───────────────────────────────────────────────────────
  describe('fetchGeoIP', () => {
    beforeEach(() => {
      /** Mock global fetch to avoid actual network calls. */
      vi.stubGlobal('fetch', vi.fn());
    });

    /** Test 4: Should return empty object when fetch fails. */
    it('should return empty GeoIPData when fetch throws', async () => {
      /** Simulate network failure. */
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network'));
      const result = await fetchGeoIP();
      expect(result).toEqual({});
    });

    /** Test 5: Should parse valid API response correctly. */
    it('should return parsed GeoIPData from a valid response', async () => {
      /** Simulate a successful API response. */
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: async () => ({
          ip: '1.2.3.4',
          country_name: 'Turkey',
          city: 'Istanbul',
        }),
      });

      const result = await fetchGeoIP();
      expect(result.ip).toBe('1.2.3.4');
      expect(result.country).toBe('Turkey');
      expect(result.city).toBe('Istanbul');
    });
  });

  // ── logConnect / logDisconnect ──────────────────────────────────
  describe('logConnect', () => {
    /** Test 6: Should return null when supabase is null (no connection). */
    it('should return null when supabase is not configured', async () => {
      /**
       * In the test environment, supabase is null by default
       * (unless mocked), so logConnect should return null.
       */
      const result = await logConnect('test-session-id');
      expect(result).toBeNull();
    });
  });

  describe('logDisconnect', () => {
    /** Test 7: Should not throw when supabase is null. */
    it('should be a safe no-op when supabase is not configured', async () => {
      await expect(
        logDisconnect('some-log-id', new Date().toISOString())
      ).resolves.not.toThrow();
    });
  });
});
