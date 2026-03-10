/**
 * api/cwf/copilot/heartbeat.ts — Vercel Serverless Copilot Heartbeat Endpoint
 *
 * Updates the last_heartbeat_at timestamp in copilot_config for a simulation.
 * Called by the browser's copilotHeartbeat hook every 5 seconds to prove the
 * browser tab is still open and connected.
 *
 * NOTE: On Vercel, the /api/cwf/copilot/evaluate endpoint also updates the
 * heartbeat timestamp on each call (combined heartbeat + evaluate). This
 * standalone heartbeat endpoint serves as a fallback for edge cases where
 * the evaluate call takes too long or is rate-limited.
 *
 * Endpoint: POST /api/cwf/copilot/heartbeat
 * Body: { simulationId: string }
 * Returns: { ok: boolean }
 *
 * Dependencies:
 *   - @supabase/supabase-js
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

/**
 * POST /api/cwf/copilot/heartbeat
 *
 * Updates last_heartbeat_at in copilot_config for heartbeat safety.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
    /** Only accept POST requests */
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        /** Extract simulationId from request body */
        const { simulationId } = req.body as { simulationId?: string };

        if (!simulationId) {
            return res.status(400).json({ error: 'simulationId is required' });
        }

        /** Validate environment variables */
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!supabaseUrl || !supabaseKey) {
            return res.status(500).json({ error: 'Missing Supabase environment variables' });
        }

        /** Create Supabase client with service role key (server-side only) */
        const supabase = createClient(supabaseUrl, supabaseKey);

        /** Update heartbeat timestamp so the evaluate endpoint knows browser is alive */
        const { error } = await supabase.from('copilot_config')
            .update({ last_heartbeat_at: new Date().toISOString() })
            .eq('simulation_id', simulationId);

        if (error) {
            console.error('[Copilot/Heartbeat] ❌ Supabase update error:', error.message);
            return res.status(500).json({ error: error.message });
        }

        return res.status(200).json({ ok: true });
    } catch (error) {
        console.error('[Copilot/Heartbeat] ❌ Error:', error);
        return res.status(500).json({
            error: (error as Error).message,
        });
    }
}
