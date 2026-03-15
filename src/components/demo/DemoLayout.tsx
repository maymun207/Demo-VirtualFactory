/**
 * DemoLayout.tsx — Demo UI Orchestrator
 *
 * Owns the shared state that coordinates DemoSidePanel and DemoMediaView:
 *   - showMovie: whether the short video player is open
 *   - sidebarVisible: whether the left sidebar is currently expanded
 *
 * Rendered by Dashboard.tsx as a single entry point for the entire
 * new Demo UI. Passes callbacks and props down to each sub-component.
 *
 * This wrapper contains ZERO business logic — it only lifts state that
 * both sibling components (DemoSidePanel, DemoMediaView) need to share.
 *
 * Used by: src/components/ui/Dashboard.tsx
 */

import React, { useState } from 'react';
import { DemoSidePanel } from './DemoSidePanel';
import { DemoMediaView } from './DemoMediaView';
import {
    DEMO_SIDE_PANEL_VISIBLE_DEFAULT,
} from '../../lib/params/demoSystem/demoConfig';
import { useUIStore } from '../../store/uiStore';

/**
 * DemoLayout — mounts the sidebar + media view with shared state.
 * Always rendered (both children read showDemoScreen from uiStore
 * and return null when the demo tab is closed).
 */
export const DemoLayout: React.FC = () => {
    /**
     * showMovie — true after the presenter clicks "Watch movie".
     * Resets to false when the demo restarts (the DemoMediaView
     * handles video controls; no explicit reset needed here as
     * restartDemo clears messages and re-renders welcome card).
     */
    const [showMovie, setShowMovie] = useState<boolean>(false);

    /**
     * sidebarVisible — mirrors the collapsed state in DemoSidePanel.
     * DemoMediaView uses this to shift its left edge accordingly.
     * Starts at DEMO_SIDE_PANEL_VISIBLE_DEFAULT (true) so the sidebar
     * is open by default when the presenter enters the Demo tab.
     */
    const [sidebarVisible, setSidebarVisible] = useState<boolean>(
        DEMO_SIDE_PANEL_VISIBLE_DEFAULT,
    );

    /**
     * handleVisibilityChange — called by DemoSidePanel when presenter
     * collapses or expands the sidebar via the toggle arrow.
     *
     * Updates both local state (for DemoMediaView positioning) and
     * uiStore.demoPanelVisible so App.tsx can resize its flex-column
     * spacer to match — keeping BasicPanel / DTXFR correctly anchored
     * to the right edge of the Demo Status bar at all times.
     */
    const handleVisibilityChange = (visible: boolean) => {
        setSidebarVisible(visible);
        useUIStore.getState().setDemoPanelVisible(visible);
    };

    return (
        <>
            {/* Left sidebar — demo status, LED stage list, chat input */}
            <DemoSidePanel
                onMovieRequest={() => setShowMovie(true)}
                onMovieDismiss={() => setShowMovie(false)}
                isMoviePlaying={showMovie}
                onVisibilityChange={handleVisibilityChange}
                initialVisible={DEMO_SIDE_PANEL_VISIBLE_DEFAULT}
            />

            {/* Central media + ARIA communication area */}
            <DemoMediaView
                showMovie={showMovie}
                sidebarVisible={sidebarVisible}
            />
        </>
    );
};
