/**
 * ╔═══════════════════════════════════════════════════════════════════╗
 * ║  idGenerator.test.ts — Unit tests for the UUID generator         ║
 * ║                                                                   ║
 * ║  Covers:                                                          ║
 * ║    • UUID v4 format compliance (regex validation)                 ║
 * ║    • Uniqueness (no collisions in batch generation)               ║
 * ║    • Version & variant nibble correctness                         ║
 * ║    • RFC 4122 string length & structure                           ║
 * ╚═══════════════════════════════════════════════════════════════════╝
 */

import { describe, it, expect } from 'vitest';
import { generateUUID, UUID_REGEX } from '../lib/idGenerator';

describe('idGenerator', () => {
  describe('generateUUID', () => {
    it('returns a string matching UUID v4 format', () => {
      /** Act: generate a UUID. */
      const id = generateUUID();

      /** Assert: matches the RFC 4122 v4 pattern. */
      expect(id).toMatch(UUID_REGEX);
    });

    it('returns a 36-character string (8-4-4-4-12 with hyphens)', () => {
      /** Act: generate a UUID. */
      const id = generateUUID();

      /** Assert: correct length. */
      expect(id).toHaveLength(36);

      /** Assert: correct structure (4 hyphens at positions 8, 13, 18, 23). */
      const parts = id.split('-');
      expect(parts).toHaveLength(5);
      expect(parts[0]).toHaveLength(8);
      expect(parts[1]).toHaveLength(4);
      expect(parts[2]).toHaveLength(4);
      expect(parts[3]).toHaveLength(4);
      expect(parts[4]).toHaveLength(12);
    });

    it('has version nibble = 4 (UUID v4)', () => {
      /** Act: generate a UUID. */
      const id = generateUUID();

      /** Assert: the 13th character (version nibble) is '4'. */
      const versionChar = id.charAt(14); // position 14 = first char of 3rd group
      expect(versionChar).toBe('4');
    });

    it('has variant nibble ∈ {8, 9, a, b} (RFC 4122)', () => {
      /** Act: generate a UUID. */
      const id = generateUUID();

      /** Assert: the 19th character (variant nibble) is 8, 9, a, or b. */
      const variantChar = id.charAt(19); // first char of 4th group
      expect(['8', '9', 'a', 'b']).toContain(variantChar.toLowerCase());
    });

    it('returns unique values on sequential calls (1000 IDs)', () => {
      /** Act: generate 1000 UUIDs. */
      const ids = new Set<string>();
      for (let i = 0; i < 1000; i++) {
        ids.add(generateUUID());
      }

      /** Assert: all 1000 are unique (no collisions). */
      expect(ids.size).toBe(1000);
    });

    it('every generated ID passes UUID_REGEX validation (batch of 100)', () => {
      /** Act: generate 100 UUIDs and validate each. */
      for (let i = 0; i < 100; i++) {
        const id = generateUUID();
        expect(id).toMatch(UUID_REGEX);
      }
    });
  });

  describe('UUID_REGEX', () => {
    it('accepts valid UUID v4 strings', () => {
      /** Arrange: known valid UUIDs. */
      const validUUIDs = [
        '550e8400-e29b-41d4-a716-446655440000',
        '6ba7b810-9dad-41d2-80b4-00c04fd430c8',
        'f47ac10b-58cc-4372-a567-0e02b2c3d479',
        '00000000-0000-4000-8000-000000000001', // test mock format
      ];

      /** Assert: all pass. */
      validUUIDs.forEach((uuid) => {
        expect(uuid).toMatch(UUID_REGEX);
      });
    });

    it('rejects nanoid-style strings', () => {
      /** Arrange: nanoid-format strings that previously caused DB errors. */
      const invalidIDs = [
        'xZYCylCA-U-fbIhx7kcBc',  // actual nanoid from error log
        'test-id-0',               // old test mock format
        'V1StGXR8_Z5jdHi6B-myT',
        '7zzzzzzzzzzzzzzzzzzzzz',
      ];

      /** Assert: none pass UUID validation. */
      invalidIDs.forEach((id) => {
        expect(id).not.toMatch(UUID_REGEX);
      });
    });

    it('rejects empty strings and null-like values', () => {
      /** Assert: edge cases fail. */
      expect('').not.toMatch(UUID_REGEX);
      expect('null').not.toMatch(UUID_REGEX);
      expect('undefined').not.toMatch(UUID_REGEX);
    });
  });
});
