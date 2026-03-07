/**
 * ╔═══════════════════════════════════════════════════════════════════╗
 * ║  LOGGING — Log level type and application-wide log level        ║
 * ║  constant, configurable via environment variable.               ║
 * ╚═══════════════════════════════════════════════════════════════════╝
 */

/**
 * Valid log levels, ordered from most verbose to least.
 * 'debug' shows everything; 'error' shows only errors; 'silent' suppresses all.
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

/**
 * Application-wide log level. Controls which console messages are emitted.
 * - Development: 'debug' (show everything)
 * - Production: 'info' (suppress debug chatter)
 *
 * Reads from the Vite environment variable `VITE_LOG_LEVEL` if available,
 * otherwise defaults based on the build mode.
 */
export const LOG_LEVEL: LogLevel =
  (import.meta.env?.VITE_LOG_LEVEL as LogLevel) ??
  (import.meta.env?.DEV ? 'debug' : 'info');
