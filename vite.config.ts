
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
    /**
     * Bind Vite explicitly to port 5173.
     * strictPort: true makes Vite exit with an error instead of silently
     * moving to 5174+ when the port is already in use.
     * Without this, zombie processes from crashed restarts block 5173
     * and Vite starts on a different port — completely invisible to the user.
     */
    host: '0.0.0.0',   /** Listen on all interfaces so both localhost and 127.0.0.1 work in any browser */
    port: 5173,
    strictPort: true,
    proxy: {
      '/api/cwf': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
        /**
         * Extend the proxy timeout to 120 seconds.
         * Vite's http-proxy has a short default socket timeout that drops
         * connections after ~10-15s — far too short for Gemini AI requests
         * which can take 20-50s for complex multi-tool-call queries.
         * This must be higher than CWF_CLIENT_TIMEOUT_MS (55s) so the proxy
         * never races the browser's AbortSignal and always lets the AI respond.
         */
        proxyTimeout: 120_000,
        timeout: 120_000,
        /**
         * configure() runs once when Vite creates the http-proxy instance.
         * We set the socket timeout on every proxied request to prevent Node.js
         * from destroying the socket mid-flight on slow Gemini responses.
         */
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            /** Allow up to 120s for the upstream CWF server to respond */
            proxyReq.socket?.setTimeout(120_000);
          });
        },
      },
      /**
       * GET /api/demo-slides — proxied to the CWF dev server.
       * Returns the list of files in public/demo/ so the Demo Script Editor
       * can dynamically populate its slide dropdown without hard-coding filenames.
       */
      '/api/demo-slides': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
    },
  },
})
