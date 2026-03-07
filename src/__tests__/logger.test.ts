/**
 * logger.test.ts — Unit Tests for Centralized Logger Module
 *
 * Validates the Logger class behavior including:
 *  - Correct log-level gating (debug, info, warn, error, silent)
 *  - Tag prefix formatting in log output
 *  - Factory function creates properly tagged instances
 *  - No output when log level is above the method's level
 *
 * IMPLEMENTATION NOTES:
 *  - Logger.debug() and Logger.info() both call console.log (not console.debug/info).
 *  - Logger.warn() calls console.warn, Logger.error() calls console.error.
 *  - `currentPriority` is computed at module load, so each log-level test
 *    uses vi.resetModules() to re-evaluate it with a fresh LOG_LEVEL mock.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Hoisted mock variable, available before module evaluation ───────
const { mockLogLevel } = vi.hoisted(() => ({
  mockLogLevel: { value: 'debug' as string },
}));

// ── Mock params so LOG_LEVEL reads from our hoisted variable ────────
vi.mock('../lib/params', () => ({
  get LOG_LEVEL() {
    return mockLogLevel.value;
  },
}));

describe('Logger', () => {
  /** Spy references — debug/info use console.log */
  let logSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetModules();
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Helper: dynamically import logger after setting mockLogLevel.value.
   * This ensures `currentPriority` is re-computed for each test.
   */
  async function getLogger(tag: string, level: string) {
    mockLogLevel.value = level;
    const { createLogger } = await import('../lib/logger');
    return createLogger(tag);
  }

  // ═════════════════════════════════════════════════════════════════════
  // Factory function
  // ═════════════════════════════════════════════════════════════════════

  it('createLogger returns an object with debug, info, warn, error methods', async () => {
    const log = await getLogger('Test', 'debug');
    expect(log).toBeDefined();
    expect(typeof log.debug).toBe('function');
    expect(typeof log.info).toBe('function');
    expect(typeof log.warn).toBe('function');
    expect(typeof log.error).toBe('function');
  });

  // ═════════════════════════════════════════════════════════════════════
  // Tag prefix formatting
  // ═════════════════════════════════════════════════════════════════════

  it('prefixes all log messages with [Tag]', async () => {
    const log = await getLogger('MyModule', 'debug');
    log.info('hello');
    /** info() uses console.log under the hood */
    expect(logSpy).toHaveBeenCalledWith('[MyModule]', 'hello');
  });

  it('passes extra arguments through to console', async () => {
    const log = await getLogger('Svc', 'debug');
    const extra = { key: 'value' };
    log.warn('problem', extra);
    expect(warnSpy).toHaveBeenCalledWith('[Svc]', 'problem', extra);
  });

  // ═════════════════════════════════════════════════════════════════════
  // Log-level gating
  // ═════════════════════════════════════════════════════════════════════

  it('outputs all levels when LOG_LEVEL is "debug"', async () => {
    const log = await getLogger('All', 'debug');
    log.debug('d');
    log.info('i');
    log.warn('w');
    log.error('e');
    /** debug() and info() both use console.log → 2 calls */
    expect(logSpy).toHaveBeenCalledTimes(2);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it('suppresses debug when LOG_LEVEL is "info"', async () => {
    const log = await getLogger('Info', 'info');
    log.debug('should not appear');
    log.info('should appear');
    /** Only info() should fire (1 console.log call) */
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith('[Info]', 'should appear');
  });

  it('suppresses debug + info when LOG_LEVEL is "warn"', async () => {
    const log = await getLogger('Warn', 'warn');
    log.debug('nope');
    log.info('nope');
    log.warn('yes');
    log.error('yes');
    expect(logSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it('only outputs error when LOG_LEVEL is "error"', async () => {
    const log = await getLogger('Err', 'error');
    log.debug('nope');
    log.info('nope');
    log.warn('nope');
    log.error('yes');
    expect(logSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it('suppresses ALL output when LOG_LEVEL is "silent"', async () => {
    const log = await getLogger('Silent', 'silent');
    log.debug('nope');
    log.info('nope');
    log.warn('nope');
    log.error('nope');
    expect(logSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
