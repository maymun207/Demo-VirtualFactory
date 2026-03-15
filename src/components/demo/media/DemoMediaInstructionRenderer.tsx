/**
 * DemoMediaInstructionRenderer.tsx — Media Instruction Dispatcher
 *
 * Receives a MediaInstruction value from DemoMediaView and renders the
 * appropriate dynamic visualisation component. Acts as a routing layer so
 * DemoMediaView stays decoupled from the individual chart implementations.
 *
 * Adding a new visualisation:
 *   1. Create a new component in src/components/demo/media/
 *   2. Add the new MediaInstruction literal to the union in demoScript.ts
 *   3. Add a case to the switch statement in this file
 *
 * Used by: DemoMediaView.tsx
 *
 * Renders:
 *   'chart:conveyor_speed' → <DemoConveyorSpeedChart />
 */

import React from 'react';
import type { MediaInstruction } from '../../../lib/params/demoSystem/demoScript';
import { DemoConveyorSpeedChart } from './DemoConveyorSpeedChart';

// ─── Props ────────────────────────────────────────────────────────────────────

interface DemoMediaInstructionRendererProps {
    /**
     * The instruction key from CtaStep.mediaInstruction.
     * Each key maps to a specific chart or visualisation component.
     */
    instruction: MediaInstruction;
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * DemoMediaInstructionRenderer — routes a MediaInstruction to the correct
 * visualisation component.
 *
 * Wrapped in a consistent glass-panel container so all charts share the same
 * visual framing within DemoMediaView regardless of which specific component
 * is rendered.
 */
export const DemoMediaInstructionRenderer: React.FC<DemoMediaInstructionRendererProps> = ({
    instruction,
}) => {
    /**
     * Resolve the instruction key to a chart component.
     * Returning null for unknown keys is intentional — the demo continues
     * without a chart rather than crashing, maintaining presenter flow.
     */
    const chartNode = (() => {
        switch (instruction) {
            /** S-Clock vs conveyor belt speed line chart. */
            case 'chart:conveyor_speed':
                return <DemoConveyorSpeedChart />;

            default:
                /**
                 * Unknown instruction key — log a warning in development so
                 * engineers catch missing cases early. In production this is
                 * a graceful no-op.
                 */
                if (import.meta.env.DEV) {
                    console.warn(
                        '[DemoMediaInstructionRenderer] Unknown instruction:',
                        instruction,
                    );
                }
                return null;
        }
    })();

    /** Render nothing if the instruction resolved to null/undefined. */
    if (!chartNode) return null;

    return (
        <div
            className="w-full px-4 py-4"
            style={{
                /** Animate the chart in with a fade+slide so it feels intentional */
                animation: 'fadeIn 0.4s ease-out',
            }}
        >
            {chartNode}
        </div>
    );
};
