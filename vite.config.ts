import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  /** Suppress chunk size warnings — Three.js and 3D libs produce large bundles. */
  build: {
    chunkSizeWarningLimit: 1800,
  },
  /**
   * Development server configuration.
   * Proxies /api/cwf/* requests to the local CWF dev server (scripts/cwf-dev-server.ts)
   * so the frontend can call the CWF API endpoint during local development
   * exactly as it does when deployed on Vercel.
   *
   * The CWF dev server runs on port 3001 (configurable via CWF_DEV_PORT env var).
   * Start it with: npx tsx scripts/cwf-dev-server.ts
   * Or use: npm run dev:full (starts both Vite and CWF server concurrently)
   */
  server: {
    proxy: {
      '/api/cwf': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
