/**
 * index.ts — Barrel Re-export for demoSystem params
 *
 * Provides a single import point for all Demo System configuration.
 * Intentionally NOT re-exported from the main src/lib/params/index.ts
 * to maintain complete isolation from the existing CWF params.
 *
 * Usage (from demo components only):
 *   import { DEMO_SCRIPT, DEMO_SYSTEM_PROMPT } from '../../lib/params/demoSystem';
 */
export * from './demoSystemPrompt';
export * from './demoScript';
export * from './demoConfig';
