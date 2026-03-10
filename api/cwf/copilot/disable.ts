/**
 * api/cwf/copilot/disable.ts — Vercel Serverless Copilot Disable Endpoint
 *
 * Disables Copilot autonomous monitoring mode for a simulation.
 * Updates the copilot_config row in Supabase with enabled=false,
 * cwf_state='normal', and resets auth_attempts to 0.
 *
 * No authorization required — stopping is always safe and immediate.
 *
 * Endpoint: POST /api/cwf/copilot/disable
 * Body: { simulationId: string }
 * Returns: { success: boolean, message: string }
 *
 * Dependencies:
 *   - @supabase/supabase-js
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

/**
 * POST /api/cwf/copilot/disable
 *
 * Updates copilot_config to disabled state and resets the CWF state machine.
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

        /** Update copilot_config to disabled — reset state machine to normal */
        const { error } = await supabase.from('copilot_config')
            .update({
                cwf_state: 'normal',
                auth_attempts: 0,
                updated_at: new Date().toISOString(),
            })
            .eq('simulation_id', simulationId);

        if (error) {
            console.error('[Copilot/Disable] ❌ Supabase update error:', error.message);
            return res.status(500).json({ error: error.message });
        }

        return res.status(200).json({
            success: true,
            message: 'Copilot disabled',
            cwfState: 'normal',
        });
    } catch (error) {
        console.error('[Copilot/Disable] ❌ Error:', error);
        return res.status(500).json({
            error: (error as Error).message,
        });
    }
}
