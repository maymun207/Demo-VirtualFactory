/**
 * useTranslation.ts — Type-Safe Translation Hook
 *
 * Provides a stable `t(key)` function for looking up bilingual strings
 * from translations.ts. Generic over the section name, so TypeScript
 * ensures only valid keys are used at compile time.
 *
 * @example
 * ```tsx
 * const t = useTranslation("header");
 * // t("title") → "🏭 Ceramic Production Line - Digital Twin" (en)
 * // t("title") → "🏭 Seramik Üretim Hattı - Dijital İkiz" (tr)
 * ```
 *
 * Limitations:
 *  - Only works for flat `{ tr: string, en: string }` entries.
 *  - For nested structures (arrays of objects), access translations.ts directly
 *    (see Playbook.tsx for an example).
 *
 * Used by: most UI components (Header, ControlPanel, KPIContainer, etc.)
 */
import { useCallback } from 'react';
import { translations } from '../lib/translations';
import { useUIStore } from '../store/uiStore';

export function useTranslation<T extends keyof typeof translations>(
  section: T
): (key: keyof typeof translations[T]) => string {
  const currentLang = useUIStore((s) => s.currentLang);

  return useCallback(
    (key: keyof typeof translations[T]) => {
      const entry = translations[section][key];
      if (entry && typeof entry === 'object' && currentLang in entry) {
        return (entry as Record<string, string>)[currentLang];
      }
      return String(key);
    },
    [section, currentLang],
  );
}
