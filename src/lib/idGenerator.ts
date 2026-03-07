/**
 * ╔═══════════════════════════════════════════════════════════════════╗
 * ║  idGenerator.ts — Centralized UUID Generator                     ║
 * ║                                                                   ║
 * ║  Provides a single source of truth for generating unique IDs     ║
 * ║  that are compatible with Supabase's `uuid` column type.         ║
 * ║                                                                   ║
 * ║  Uses the Web Crypto API (`crypto.randomUUID()`) which produces  ║
 * ║  standard RFC 4122 v4 UUIDs in the format:                       ║
 * ║    xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx                          ║
 * ║                                                                   ║
 * ║  This replaces the previous `nanoid()` usage that generated      ║
 * ║  short non-UUID strings, causing Supabase upsert failures with:  ║
 * ║    "invalid input syntax for type uuid"                          ║
 * ║                                                                   ║
 * ║  Exports:                                                         ║
 * ║    • generateUUID — Returns a new v4 UUID string                 ║
 * ║    • UUID_REGEX   — Regex for validating UUID v4 format          ║
 * ╚═══════════════════════════════════════════════════════════════════╝
 */

// =============================================================================
// UUID V4 VALIDATION REGEX
// =============================================================================

/**
 * Regular expression that matches a valid UUID v4 string.
 * Format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
 * where x is [0-9a-f] and y is [89ab].
 *
 * Exported for use in test assertions and runtime validation.
 */
export const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// =============================================================================
// UUID GENERATOR
// =============================================================================

/**
 * Generate a new RFC 4122 v4 UUID.
 *
 * Uses the browser/Node.js Web Crypto API which is available in:
 *  - All modern browsers (Chrome 92+, Firefox 95+, Safari 15.4+)
 *  - Node.js 19+ (global), Node.js 16+ via `require('crypto')`
 *
 * @returns A UUID v4 string, e.g. "550e8400-e29b-41d4-a716-446655440000"
 */
export function generateUUID(): string {
  return crypto.randomUUID();
}
