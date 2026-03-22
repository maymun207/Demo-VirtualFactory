/**
 * api/cwf/copilot/enable.ts — Vercel Serverless Copilot Enable Endpoint
 *
 * Enables Copilot autonomous monitoring mode for a simulation.
 * Upserts the copilot_config row in Supabase with
 * cwf_state='copilot_active'. The actual polling is then driven by the
 * browser calling /api/cwf/copilot/evaluate every 6 seconds.
 *
 * Endpoint: POST /api/cwf/copilot/enable
 * Body: { simulationId: string, activatedBy?: string }
 * Returns: { success: boolean, message: string }
 *
 * Dependencies:
 *   - @supabase/supabase-js
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

/**
 * POST /api/cwf/copilot/enable
 *
 * Creates or updates the copilot_config row for the given simulation,
 * setting cwf_state='copilot_active'.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
    /** Only accept POST requests */
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        /** Extract parameters from request body */
        const { simulationId, activatedBy } = req.body as {
            simulationId?: string;
            activatedBy?: string;
        };

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

        /** Upsert copilot_config row — create if not exists, update if exists */
        const { error } = await supabase.from('copilot_config').upsert({
            simulation_id: simulationId,
            cwf_state: 'copilot_active',
            auth_attempts: 0,
            activated_by: activatedBy || 'ardic',
            /** Set generous initial poll/cooldown values */
            poll_interval_sec: 6,
            cooldown_sec: 30,
            max_actions_per_minute: 20,
            last_heartbeat_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        }, { onConflict: 'simulation_id' });

        if (error) {
            console.error('[Copilot/Enable] ❌ Supabase upsert error:', error.message);
            return res.status(500).json({ error: error.message });
        }

        return res.status(200).json({
            success: true,
            message: 'Copilot enabled — browser will drive evaluation cycles',
        });
    } catch (error) {
        console.error('[Copilot/Enable] ❌ Error:', error);
        return res.status(500).json({
            error: (error as Error).message,
        });
    }
}
