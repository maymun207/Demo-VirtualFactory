/**
 * vitest.config.ts — Test Runner Configuration
 *
 * Configures Vitest for the Virtual Factory project.
 * Uses jsdom environment for React component testing and
 * shares the same Vite transform pipeline (ESM, TypeScript, JSX).
 *
 * Run tests:
 *   npm run test       — single run (CI-friendly)
 *   npm run test:watch — watch mode (development)
 */
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    /** Use jsdom to simulate browser APIs for React testing */
    environment: 'jsdom',

    /** Global test setup file — mocks, polyfills, and shared config */
    setupFiles: ['./src/tests/setup.ts'],

    /** Include all .test.ts and .test.tsx files under src/ */
    include: ['src/**/*.test.{ts,tsx}'],

    /** Enable global test APIs (describe, it, expect) without imports */
    globals: true,
  },
});
