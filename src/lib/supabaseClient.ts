/**
 * supabaseClient.ts — Supabase Client Initialization
 *
 * Creates and exports a Supabase client instance for telemetry sync.
 * The client is null-safe: if environment variables are not configured,
 * it exports `null` instead of throwing, allowing the app to function
 * without Supabase connectivity (telemetry will simply be skipped).
 *
 * Required Environment Variables (in .env):
 *   VITE_SUPABASE_URL      — Supabase project URL (e.g., https://xxx.supabase.co)
 *   VITE_SUPABASE_ANON_KEY — Supabase anonymous/public API key
 *
 * Used by: telemetryStore.ts (for upsert operations)
 */
import { createClient } from '@supabase/supabase-js';
import { createLogger } from './logger';

/** Module-level logger for Supabase client initialization. */
const log = createLogger('Supabase');

/** Supabase project URL from environment */
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
/** Supabase anonymous API key from environment */
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Warn in console if Supabase is not configured (non-blocking)
if (!supabaseUrl || !supabaseAnonKey) {
    log.warn('Environment variables are missing. Telemetry sync will be disabled.');
}

/**
 * Supabase client instance, or null if environment variables are not set.
 * Always check for null before using: `if (supabase) { ... }`
 */
export const supabase = (supabaseUrl && supabaseAnonKey) 
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;
