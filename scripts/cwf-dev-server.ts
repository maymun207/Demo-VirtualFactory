/**
 * scripts/cwf-dev-server.ts — Local CWF API Development Server
 *
 * A lightweight Node.js HTTP server that wraps the Vercel serverless function
 * at `api/cwf/chat.ts`, allowing CWF to work during local development with
 * `npm run dev` (Vite).
 *
 * When running locally, Vite serves the frontend but cannot serve Vercel
 * serverless functions. This server fills that gap by:
 *   1. Listening on a configurable port (default 3001)
 *   2. Accepting POST requests to /api/cwf/chat
 *   3. Delegating to the same handler used by Vercel in production
 *   4. Returning the same JSON response format
 *
 * Environment Variables (loaded from .env.local automatically):
 *   GEMINI_API_KEY           — Google AI Studio API key
 *   SUPABASE_URL             — Supabase project URL (non-VITE_ prefixed)
 *   SUPABASE_SERVICE_ROLE_KEY — Supabase service role key (NOT anon)
 *   CWF_DEV_PORT             — Port for this server (default 3001)
 *
 * Usage:
 *   npx tsx scripts/cwf-dev-server.ts
 *   (or via `npm run dev:full` which starts both Vite and this server)
 *
 * The Vite dev server proxies /api/cwf/* requests to this server
 * (configured in vite.config.ts → server.proxy).
 */

import http from 'node:http';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// ─────────────────────────────────────────────────────────────────────────────
// 1. Load .env.local manually (since this runs outside of Vite)
// ─────────────────────────────────────────────────────────────────────────────

/** Resolve the project root directory from this script's location */
const __dirname_local = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname_local, '..');

/**
 * Parse a .env file and inject its values into process.env.
 * Supports KEY=VALUE and KEY="VALUE" formats.
 * Skips blank lines and lines starting with #.
 *
 * @param filePath - Absolute path to the .env file
 */
function loadEnvFile(filePath: string): void {
    try {
        const content = readFileSync(filePath, 'utf-8');
        for (const line of content.split('\n')) {
            /** Skip blank lines and comments */
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;

            /** Split on first '=' only — value may contain '=' characters */
            const eqIndex = trimmed.indexOf('=');
            if (eqIndex === -1) continue;

            const key = trimmed.slice(0, eqIndex).trim();
            let value = trimmed.slice(eqIndex + 1).trim();

            /** Strip surrounding quotes (single or double) */
            if (
                (value.startsWith('"') && value.endsWith('"')) ||
                (value.startsWith("'") && value.endsWith("'"))
            ) {
                value = value.slice(1, -1);
            }

            /** Only set if not already defined (existing env vars take precedence) */
            if (!process.env[key]) {
                process.env[key] = value;
            }
        }
    } catch {
        /** Silently ignore if .env.local doesn't exist */
    }
}

/** Load environment variables from .env.local */
loadEnvFile(resolve(projectRoot, '.env.local'));

// ─────────────────────────────────────────────────────────────────────────────
// 2. Validate required environment variables
// ─────────────────────────────────────────────────────────────────────────────

/** List of required env vars for the CWF agent */
const REQUIRED_ENV_VARS = ['GEMINI_API_KEY', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];

for (const envVar of REQUIRED_ENV_VARS) {
    if (!process.env[envVar]) {
        console.error(`❌ Missing required env var: ${envVar}`);
        console.error('   → Add it to .env.local in the project root');
        process.exit(1);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Import the Vercel handler dynamically
// ─────────────────────────────────────────────────────────────────────────────

/** Import the handler from the api/cwf/chat.ts module */
const { default: handler } = await import('../api/cwf/chat.js');

// ─────────────────────────────────────────────────────────────────────────────
// 4. Create HTTP server that adapts Node.js IncomingMessage to VercelRequest
// ─────────────────────────────────────────────────────────────────────────────

/** Port for the CWF dev server (configurable via env) */
const PORT = parseInt(process.env.CWF_DEV_PORT || '3001', 10);

/**
 * Collect the full request body from a Node.js IncomingMessage stream.
 * Returns the parsed JSON body or null for empty requests.
 *
 * @param req - Node.js IncomingMessage
 * @returns Parsed JSON body
 */
function collectBody(req: http.IncomingMessage): Promise<unknown> {
    return new Promise((resolve, reject) => {
        const chunks: Uint8Array[] = [];
        req.on('data', (chunk: Uint8Array) => chunks.push(chunk));
        req.on('end', () => {
            const raw = Buffer.concat(chunks).toString('utf-8');
            if (!raw) return resolve(null);
            try {
                resolve(JSON.parse(raw));
            } catch {
                reject(new Error('Invalid JSON in request body'));
            }
        });
        req.on('error', reject);
    });
}

/**
 * Create a Vercel-compatible response shim around a Node.js ServerResponse.
 *
 * The Vercel handler uses Express-like chainable methods:
 *   res.status(200).json({ data })
 *   res.setHeader('X-Foo', 'bar')
 *
 * Node.js http.ServerResponse does NOT have .status() or .json().
 * This shim adds those methods so the same handler code works locally.
 *
 * @param res - The raw Node.js ServerResponse
 * @returns A proxy object with Vercel-compatible methods added
 */
function createVercelResponseShim(res: http.ServerResponse) {
    /** Track whether the response has already been sent (prevents double-write) */
    let headersSent = false;

    const shim = {
        /**
         * Set the HTTP status code (chainable).
         * Equivalent to Express/Vercel's res.status(code).
         *
         * @param code - HTTP status code (e.g. 200, 400, 500)
         * @returns The shim for chaining (.status(200).json({...}))
         */
        status(code: number) {
            res.statusCode = code;
            return shim;
        },

        /**
         * Send a JSON response body and end the response.
         * Equivalent to Express/Vercel's res.json(data).
         * Sets Content-Type to application/json automatically.
         *
         * @param data - The data to serialize as JSON
         * @returns The shim (for type compatibility)
         */
        json(data: unknown) {
            if (!headersSent) {
                headersSent = true;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify(data));
            }
            return shim;
        },

        /**
         * Send a raw string response body and end the response.
         * Equivalent to Express/Vercel's res.send(body).
         *
         * @param body - The string body to send
         * @returns The shim (for type compatibility)
         */
        send(body: string) {
            if (!headersSent) {
                headersSent = true;
                res.end(body);
            }
            return shim;
        },

        /**
         * Set a response header.
         * Delegates directly to Node.js ServerResponse.setHeader().
         *
         * @param name  - Header name (e.g. 'Content-Type')
         * @param value - Header value
         * @returns The shim for chaining
         */
        setHeader(name: string, value: string | number | readonly string[]) {
            res.setHeader(name, value);
            return shim;
        },

        /**
         * Write raw data to the response stream.
         * Delegates to Node.js ServerResponse.write().
         */
        write: res.write.bind(res),

        /**
         * End the response.
         * Delegates to Node.js ServerResponse.end().
         */
        end: res.end.bind(res),

        /**
         * Expose statusCode for direct assignment (some handlers may use this).
         */
        get statusCode() {
            return res.statusCode;
        },
        set statusCode(code: number) {
            res.statusCode = code;
        },
    };

    return shim;
}

/**
 * Create the HTTP server.
 * Handles CORS preflight (OPTIONS) and POST requests to /api/cwf/chat.
 * Adapts the Node.js IncomingMessage/ServerResponse into Vercel-compatible
 * req/res objects by adding the `body` property and response shim methods.
 */
const server = http.createServer(async (req, res) => {
    /** CORS headers — allow the Vite dev server to call this endpoint */
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    /** Handle CORS preflight requests */
    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    /** Only handle POST /api/cwf/chat */
    if (req.method !== 'POST' || !req.url?.startsWith('/api/cwf/chat')) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found. Use POST /api/cwf/chat' }));
        return;
    }

    try {
        /** Parse the request body and attach to req.body (Vercel convention) */
        const body = await collectBody(req);
        (req as unknown as { body: unknown }).body = body;

        /** Create a Vercel-compatible response shim */
        const resShim = createVercelResponseShim(res);

        /** Delegate to the Vercel handler with the shimmed response */
        await handler(req as never, resShim as never);
    } catch (error) {
        console.error('CWF dev server error:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: (error as Error).message }));
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Start the server
// ─────────────────────────────────────────────────────────────────────────────

server.listen(PORT, () => {
    console.log('');
    console.log('  🏭 CWF Dev Server running');
    console.log(`  ➜  Local: http://localhost:${PORT}/api/cwf/chat`);
    console.log(`  ➜  Supabase: ${process.env.SUPABASE_URL}`);
    console.log(`  ➜  Gemini Model: gemini-2.5-flash`);
    console.log('');
});
