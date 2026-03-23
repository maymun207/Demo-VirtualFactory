/**
 * assetPath.ts — Runtime Asset Path Resolver
 *
 * When the app is hosted under a subpath (e.g., ardic.ai/virtual-factory-demo),
 * asset paths like '/demo/ACT-2.jpg' resolve to the root domain instead of
 * the subpath. This utility detects the subpath at runtime and prefixes it.
 *
 * Detection logic:
 *   1. First checks VITE_ASSET_BASE_PATH env var (explicit override)
 *   2. Falls back to import.meta.env.BASE_URL (set by Vite `base` config)
 *   3. If both are '/', auto-detects from the current URL pathname
 *      by looking for a known app path pattern (/virtual-factory-demo)
 *
 * This ensures the same build works at both:
 *   - https://virtual-factory-demo.vercel.app/  (no subpath → '/')
 *   - https://www.ardic.ai/virtual-factory-demo  (subpath → '/virtual-factory-demo/')
 */

/**
 * Detect the runtime base path by checking the current URL.
 * Looks for '/virtual-factory-demo' in the pathname.
 */
function detectBasePath(): string {
  // Explicit env var override
  const envBase = import.meta.env.VITE_ASSET_BASE_PATH;
  if (envBase && envBase !== '/') return envBase.endsWith('/') ? envBase : envBase + '/';

  // Vite's built-in BASE_URL (from `base` in vite.config.ts)
  const viteBase = import.meta.env.BASE_URL ?? '/';
  if (viteBase !== '/') return viteBase;

  // Runtime auto-detection: check if we're under a subpath
  if (typeof window !== 'undefined') {
    const path = window.location.pathname;
    // Match the known subpath pattern
    const match = path.match(/^(\/virtual-factory-demo)\b/);
    if (match) return match[1] + '/';
  }

  return '/';
}

/** Cached base path — computed once on module load. */
const BASE = detectBasePath();

/**
 * Resolve a public-folder asset path relative to the app's base URL.
 *
 * @param path - Absolute path starting with '/' (e.g., '/demo/ACT-2.jpg')
 * @returns    - Path prefixed with detected base, avoiding double slashes
 *
 * @example
 *   // At virtual-factory-demo.vercel.app:
 *   resolveAssetPath('/demo/ACT-2.jpg') → '/demo/ACT-2.jpg'
 *
 *   // At ardic.ai/virtual-factory-demo:
 *   resolveAssetPath('/demo/ACT-2.jpg') → '/virtual-factory-demo/demo/ACT-2.jpg'
 */
export function resolveAssetPath(path: string): string {
  // If path doesn't start with '/', return as-is (external URL or already-resolved)
  if (!path.startsWith('/')) return path;

  // BASE always ends with '/'; path starts with '/' → trim leading slash from path
  return BASE + path.slice(1);
}
