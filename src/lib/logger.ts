/**
 * logger.ts — Centralized Logging Module
 *
 * Provides structured, tagged, log-level-gated console output.
 * Replaces all raw `console.log/warn/error` calls across the codebase.
 *
 * Features:
 *  - Log-level gating: messages below the configured level are suppressed.
 *  - Tagged output: each message is prefixed with `[Tag]` for easy filtering.
 *  - Zero external dependencies — wraps native console methods.
 *  - Factory function: `createLogger('SyncService')` returns a namespaced logger.
 *
 * Log levels (from most to least verbose):
 *   debug → info → warn → error → silent
 *
 * Configuration:
 *   Set via `LOG_LEVEL` in params.ts (reads VITE_LOG_LEVEL env var).
 *   Default: 'debug' in dev, 'info' in production.
 */

import { LOG_LEVEL } from './params';
import type { LogLevel } from './params';

// =============================================================================
// LOG LEVEL PRIORITY MAP
// =============================================================================

/**
 * Numeric priority for each log level.
 * Higher number = more severe / less verbose.
 * Only messages at or above the configured level are emitted.
 */
const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 4, // silent suppresses ALL output
};

/** The numeric threshold for the currently configured log level. */
const currentPriority = LEVEL_PRIORITY[LOG_LEVEL];

// =============================================================================
// LOGGER CLASS
// =============================================================================

/**
 * A tagged logger instance. Created via `createLogger('Tag')`.
 * All output is prefixed with `[Tag]` and filtered by log level.
 */
class Logger {
  /** The prefix string, e.g. '[SyncService]' */
  private readonly prefix: string;

  /**
   * @param tag - Short identifier for the module (e.g., 'SyncService', 'DataStore')
   */
  constructor(tag: string) {
    this.prefix = `[${tag}]`;
  }

  /**
   * Log a debug message. Suppressed at 'info' level and above.
   * Use for verbose internal state, development-only diagnostics.
   *
   * @param message - The message string (supports %s, %d format specifiers)
   * @param args - Additional values to log
   */
  debug(message: string, ...args: unknown[]): void {
    if (currentPriority <= LEVEL_PRIORITY.debug) {
      console.log(this.prefix, message, ...args);
    }
  }

  /**
   * Log an informational message. Suppressed at 'warn' level and above.
   * Use for significant lifecycle events (start, stop, session created).
   *
   * @param message - The message string
   * @param args - Additional values to log
   */
  info(message: string, ...args: unknown[]): void {
    if (currentPriority <= LEVEL_PRIORITY.info) {
      console.log(this.prefix, message, ...args);
    }
  }

  /**
   * Log a warning. Suppressed at 'error' level and above.
   * Use for recoverable failures (retries, fallbacks, missing config).
   *
   * @param message - The message string
   * @param args - Additional values to log
   */
  warn(message: string, ...args: unknown[]): void {
    if (currentPriority <= LEVEL_PRIORITY.warn) {
      console.warn(this.prefix, message, ...args);
    }
  }

  /**
   * Log an error. Only suppressed at 'silent' level.
   * Use for unrecoverable failures, exhausted retries, caught exceptions.
   *
   * @param message - The message string
   * @param args - Additional values to log
   */
  error(message: string, ...args: unknown[]): void {
    if (currentPriority <= LEVEL_PRIORITY.error) {
      console.error(this.prefix, message, ...args);
    }
  }
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Create a namespaced logger for a specific module.
 *
 * @param tag - Short identifier, e.g. 'SyncService', 'DataStore', 'Telemetry'
 * @returns A Logger instance with `debug`, `info`, `warn`, `error` methods
 *
 * @example
 * ```ts
 * const log = createLogger('SyncService');
 * log.info('Started (interval: %dms)', 5000);
 * // Output: [SyncService] Started (interval: 5000ms)
 * ```
 */
export function createLogger(tag: string): Logger {
  return new Logger(tag);
}
