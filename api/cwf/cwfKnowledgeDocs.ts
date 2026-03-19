/**
 * cwfKnowledgeDocs.ts — Google Drive Folder-Based Knowledge Base Fetcher
 *
 * Fetches ALL Google Docs from a designated Google Drive folder and
 * returns their combined plain-text content. This gives CWF a dynamic
 * knowledge base: drop a new doc into the folder → CWF picks it up
 * automatically on the next cache refresh (5-minute TTL).
 *
 * Architecture:
 *   1. Lists all Google Docs in the folder via `drive.files.list`
 *   2. Exports each doc as `text/plain` via `drive.files.export`
 *   3. Concatenates all docs with `--- <title> ---` separators
 *   4. Caches the combined result for 5 minutes (avoids API calls per CWF message)
 *   5. Graceful fallback: returns empty string on any error (CWF still works)
 *
 * Required Environment Variables:
 *   GOOGLE_SERVICE_ACCOUNT_EMAIL      — GCP service account email
 *   GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY — Private key from JSON key file
 *   CWF_KNOWLEDGE_FOLDER_ID          — Google Drive folder ID containing knowledge docs
 *
 * Used by: chat.ts (buildSystemPrompt — injects docs into Gemini system prompt)
 */

import { google } from 'googleapis';

// =============================================================================
// CACHE CONFIGURATION
// =============================================================================

/**
 * Cached knowledge base content (all docs concatenated).
 * null means cache is empty / never fetched.
 */
let cachedContent: string | null = null;

/** Timestamp (Date.now()) of the last successful cache refresh */
let cachedAt = 0;

/** Cache time-to-live in milliseconds (5 minutes) */
const CACHE_TTL_MS = 5 * 60 * 1000;

/** Google Docs MIME type for filtering folder contents */
const GOOGLE_DOC_MIME_TYPE = 'application/vnd.google-apps.document';

// =============================================================================
// GOOGLE DRIVE API AUTHENTICATION
// =============================================================================

/**
 * Create a Google Auth client using service account credentials from env vars.
 * Scoped to read-only Drive access — the service account can only read,
 * never modify or delete any files.
 *
 * @returns GoogleAuth instance configured with service account credentials
 */
function createAuthClient() {
    /** Replace escaped newlines in the private key (env vars often encode \n as \\n) */
    const privateKey = (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY ?? '')
        .replace(/\\n/g, '\n');

    return new google.auth.GoogleAuth({
        credentials: {
            client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
            private_key: privateKey,
        },
        scopes: ['https://www.googleapis.com/auth/drive.readonly'],
    });
}

// =============================================================================
// FOLDER-BASED KNOWLEDGE BASE FETCHER
// =============================================================================

/**
 * fetchKnowledgeBase — Fetch all Google Docs from the CWF knowledge folder.
 *
 * Workflow:
 *   1. Check cache — if valid, return immediately
 *   2. List all Google Docs in the folder (via folder ID from env var)
 *   3. Export each doc as plain text in parallel
 *   4. Concatenate with `--- <Doc Title> ---` separators
 *   5. Cache the result and return
 *
 * On any error (missing env var, auth failure, network error), logs a
 * warning and returns empty string. CWF continues working without the
 * knowledge base — it just won't have the extra context.
 *
 * @returns Combined plain-text content of all docs, or empty string on error
 */
export async function fetchKnowledgeBase(): Promise<string> {
    /** Return cached content if still within TTL */
    if (cachedContent !== null && (Date.now() - cachedAt) < CACHE_TTL_MS) {
        console.info(`[CWF KnowledgeDocs] Cache hit (age: ${Math.round((Date.now() - cachedAt) / 1000)}s)`);
        return cachedContent;
    }

    /** Read folder ID from environment */
    const folderId = process.env.CWF_KNOWLEDGE_FOLDER_ID;
    if (!folderId) {
        /** No folder configured — silently skip (CWF still works without it) */
        return '';
    }

    console.info('[CWF KnowledgeDocs] Cache miss — fetching from Google Drive...');

    try {
        /** Create authenticated Drive client */
        const auth = createAuthClient();
        const drive = google.drive({ version: 'v3', auth });

        /**
         * Step 1: List all Google Docs in the folder.
         * Filter by MIME type to skip non-Doc files (images, PDFs, etc.).
         * Order by name for deterministic system prompt ordering.
         */
        const listRes = await drive.files.list({
            q: `'${folderId}' in parents and mimeType = '${GOOGLE_DOC_MIME_TYPE}' and trashed = false`,
            fields: 'files(id, name)',
            orderBy: 'name',
            pageSize: 50, /** Safety cap — 50 docs should be more than enough */
        });

        const files = listRes.data.files ?? [];

        if (files.length === 0) {
            /** Folder is empty or contains no Google Docs */
            console.info('[CWF KnowledgeDocs] No Google Docs found in knowledge folder.');
            cachedContent = '';
            cachedAt = Date.now();
            return '';
        }

        /**
         * Step 2: Export each doc as plain text in parallel.
         * Each doc is wrapped with a separator header showing its title.
         */
        const docPromises = files.map(async (file) => {
            try {
                /** Export the Google Doc as plain text (no formatting markup) */
                const exportRes = await drive.files.export({
                    fileId: file.id!,
                    mimeType: 'text/plain',
                });

                /** Extract content string from API response */
                const content = (exportRes.data as string) ?? '';

                /** Wrap with title separator so Gemini knows which doc is which */
                return `--- ${file.name} ---\n${content.trim()}`;
            } catch (err) {
                /** Log per-doc errors but don't fail the entire batch */
                console.warn(
                    `[CWF KnowledgeDocs] Failed to export '${file.name}':`,
                    (err as Error).message,
                );
                return null; /** Skip this doc */
            }
        });

        /** Wait for all doc exports to complete */
        const results = await Promise.all(docPromises);

        /** Filter out failed docs and join with double newlines */
        const combined = results
            .filter((r): r is string => r !== null)
            .join('\n\n');

        /** Update cache with fresh combined content */
        cachedContent = combined;
        cachedAt = Date.now();

        console.info(
            `[CWF KnowledgeDocs] Loaded ${results.filter(Boolean).length}/${files.length} docs from knowledge folder.`,
        );

        return combined;
    } catch (error) {
        /**
         * Log warning but do NOT throw — CWF should still work even if
         * the knowledge folder is unavailable. The system prompt will
         * simply be missing the knowledge base section.
         */
        console.warn(
            `[CWF KnowledgeDocs] Failed to list knowledge folder:`,
            (error as Error).message,
        );
        return '';
    }
}
