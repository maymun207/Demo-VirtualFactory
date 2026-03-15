/**
 * DemoMediaView.tsx — Demo Central Media + ARIA Communication Screen
 *
 * The primary content area of the new Demo UI. Positioned to the right of
 * DemoSidePanel, anchored below the header. Fills the upper portion of the
 * viewport, leaving the 3D factory simulation visible below.
 *
 * WHAT IT RENDERS (top to bottom, in a single scrollable container):
 *   1. Welcome card  — shown when act 0 is active and messages is empty
 *   2. Slide image   — if the current act defines slideImageUrl, shown first
 *   3. ARIA messages — all messages from demoStore rendered as clean prose
 *   4. Video player  — shown below ARIA content when showMovie is true
 *
 * The component supports two modes driven by the `showMovie` prop:
 *   - false (default): hides the video player
 *   - true:            auto-plays the ShortVideo.mp4 inline
 *
 * POSITIONING:
 *   Fixed, with left edge = sidebar width (0 when collapsed), pinned to the
 *   header bottom and sized to ~55% of viewport height.
 *
 * ARIA text messages:
 *   User messages render as soft right-aligned labels.
 *   Assistant messages render as clean left-aligned prose (no bubble frame).
 *   System messages render as centred muted pills.
 *   Image-only messages render as full-width <img> elements.
 *
 * Used by: src/components/ui/Dashboard.tsx
 */

import React, { useEffect, useRef, useState } from 'react';
import { useDemoStore } from '../../store/demoStore';
import type { DemoState, DemoMessage } from '../../store/demoStore';
import {
    DEMO_SIDE_PANEL_WIDTH_PX,
    DEMO_MOVIE_PATH,
    DEMO_MEDIA_LEFT_OFFSET_PCT,
    DEMO_SCREEN_TEXT_FONT_SIZE_PX,
    DEMO_SCREEN_MAX_HEIGHT_VH,
} from '../../lib/params/demoSystem/demoConfig';
import { useUIStore } from '../../store/uiStore';
import { DemoMediaInstructionRenderer } from './media/DemoMediaInstructionRenderer';

/** Props from the parent that coordinates with DemoSidePanel */
interface DemoMediaViewProps {
    /** Whether the presenter has requested the movie to play */
    showMovie: boolean;
    /**
     * sidebarVisible — kept in props for future use (e.g. width transitions)
     * but no longer drives the left offset. Left is always DEMO_SIDE_PANEL_WIDTH_PX.
     * @deprecated for left-positioning; retained for API compatibility with DemoLayout
     */
    sidebarVisible: boolean;
}

/**
 * DemoMediaView — the unified media + ARIA response surface.
 * Returns null when the demo tab is not active.
 */
export const DemoMediaView: React.FC<DemoMediaViewProps> = ({
    showMovie,
    // sidebarVisible kept in props for API compatibility but not used for positioning
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    sidebarVisible: _sidebarVisible,
}) => {
    /** Only visible while the demo tab is open */
    const showDemoScreen = useUIStore((s) => s.showDemoScreen);

    /** Full message list from the demo store */
    const messages = useDemoStore((s: DemoState) => s.messages);
    /**
     * currentSlide — set by handleCtaClick as the presenter steps through ctaSteps[].
     * Shown as the primary visual content when non-null; cleared on every act transition.
     * Ignored when currentMediaInstruction is set.
     */
    const currentSlide = useDemoStore((s: DemoState) => s.currentSlide);
    /**
     * currentMediaInstruction — when set, a dynamic chart/viz replaces the slide image.
     * Written by handleCtaClick (step 4b); cleared on every act transition.
     */
    const currentMediaInstruction = useDemoStore((s: DemoState) => s.currentMediaInstruction);
    /**
     * currentScreenText — plain text written to the demo screen surface after delayMs.
     * Shown below the slide as a styled caption. Cleared on every act transition.
     */
    const currentScreenText = useDemoStore((s: DemoState) => s.currentScreenText);

    /** Scroll anchor ref — auto-scrolls to newest message */
    const bottomRef = useRef<HTMLDivElement | null>(null);
    /** Ref for the screenText element — scrolled into view when text appears */
    const screenTextRef = useRef<HTMLDivElement | null>(null);

    /**
     * Auto-scroll to the screenText element whenever it changes.
     * Fires after the delayMs timer resolves (e.g. 3 seconds in Welcome stage)
     * so the presenter never misses "Let's start" appearing on screen.
     */
    useEffect(() => {
        if (currentScreenText && screenTextRef.current) {
            screenTextRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, [currentScreenText]);

    /**
     * scrollContainerRef — ref for the scrollable glass panel body.
     * Used to scroll to top when the video player is opened, because the
     * video is rendered at the top of the content (before the welcome card).
     */
    const scrollContainerRef = useRef<HTMLDivElement | null>(null);

    /** Observed header height for dynamic top positioning */
    const [headerHeight, setHeaderHeight] = useState<number>(40);

    /**
     * mediaLeft — the left edge of the DemoMediaView, measured in pixels.
     * Always equals the right edge of the #btn-demo element in the header
     * so the panel"drop-aligns" under the Demo button exactly.
     * Falls back to DEMO_SIDE_PANEL_WIDTH_PX on small screens where btn-demo
     * is hidden (lg:flex).
     */
    const [mediaLeft, setMediaLeft] = useState<number>(DEMO_SIDE_PANEL_WIDTH_PX);

    /** Observes header height AND measures the Demo button right edge on mount and resize */
    useEffect(() => {
        const measure = () => {
            /** Header bottom → used as the top anchor for the media panel */
            const h = document.getElementById('header-container');
            if (h) setHeaderHeight(h.getBoundingClientRect().bottom);

            /**
             * Demo button right edge → used as the left anchor for the media panel.
             * Uses the element ID set in Header.tsx (id="btn-demo") and the
             * modes menu pill (id="header-modes-pill" which starts at "Basic").
             * The left edge of the panel sits at the midpoint between those two
             * elements so it aligns "between the Demo and Basic buttons."
             * Falls back to DEMO_SIDE_PANEL_WIDTH_PX when either element is
             * not found (small screens where btn-demo is hidden).
             */
            const btn = document.getElementById('btn-demo');
            const modesPill = document.getElementById('header-modes-pill');
            if (btn && modesPill) {
                const demoRight = btn.getBoundingClientRect().right;
                const basicLeft = modesPill.getBoundingClientRect().left;
                /**
                 * Midpoint of the gap, then shifted left by DEMO_MEDIA_LEFT_OFFSET_PCT
                 * (default 10% of viewport width) so the panel doesn't start too far right.
                 */
                const midpoint = (demoRight + basicLeft) / 2;
                const shift = window.innerWidth * DEMO_MEDIA_LEFT_OFFSET_PCT;
                setMediaLeft(Math.max(0, Math.round(midpoint - shift)));
            } else if (btn) {
                const shift = window.innerWidth * DEMO_MEDIA_LEFT_OFFSET_PCT;
                setMediaLeft(Math.max(0, Math.round(btn.getBoundingClientRect().right - shift)));
            } else {
                setMediaLeft(DEMO_SIDE_PANEL_WIDTH_PX);
            }
        };
        measure();
        window.addEventListener('resize', measure);
        return () => window.removeEventListener('resize', measure);
    }, []);

    /** Auto-scroll to bottom on new messages */
    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    /**
     * Scroll to top whenever the movie is opened so the video player
     * (which is rendered first in the container) is immediately visible
     * without the presenter having to manually scroll up.
     */
    useEffect(() => {
        if (showMovie && scrollContainerRef.current) {
            scrollContainerRef.current.scrollTop = 0;
        }
    }, [showMovie]);

    /** Do not mount when demo tab is closed */
    if (!showDemoScreen) return null;


    return (
        <div
            id="demo-media-view"
            className="fixed pointer-events-none z-9997"
            style={{
                top: headerHeight,
                /** Aligns with the right edge of the #btn-demo header button */
                left: mediaLeft,
                /**
                 * Width: capped at 390px (halved from 780px for 50% size reduction).
                 * Leaves more of the factory 3D visible on the right side of the screen.
                 * No explicit height — the inner glass panel grows with its content.
                 */
                width: `min(390px, calc(100vw - ${mediaLeft}px - 12px))`,
                transition: 'left 250ms cubic-bezier(0.4, 0, 0.2, 1), width 250ms cubic-bezier(0.4, 0, 0.2, 1)',
            }}
        >
            {/* Glass panel body — grows with content, scrolls if taller than max-height */}
            <div
                ref={scrollContainerRef}
                className="
                w-full
                bg-black/45 backdrop-blur-md
                border-b border-white/10
                overflow-y-auto
                pointer-events-auto
                flex flex-col
                scroll-smooth
            "
                style={{
                    /**
                     * Dynamic height: the panel grows freely with its content.
                     * Caps at DEMO_SCREEN_MAX_HEIGHT_VH so it never fully
                     * obscures the 3D factory scene below.
                     * Smooth height transitions are handled naturally by the
                     * browser as DOM children are added / removed.
                     */
                    maxHeight: `min(${DEMO_SCREEN_MAX_HEIGHT_VH}vh, calc(100vh - ${headerHeight}px - 24px))`,
                }}
            >
                <div className="flex flex-col">

                    {/* ── SCREEN TEXT (headline — TOP of media surface) ───────────────
                      * Rendered FIRST so it always appears at the top of the
                      * visible panel, above any slide or chart below it.
                      * Font size = DEMO_SCREEN_TEXT_FONT_SIZE_PX (34px) — large
                      * enough to read at a glance during a live presentation.
                      * Fades in smoothly after CtaStep.delayMs resolves.
                      * ──────────────────────────────────────────────────────── */}
                    {currentScreenText && (
                        <div
                            ref={screenTextRef}
                            className="w-full px-8 pt-6 pb-3 text-center"
                            style={{ animation: 'fadeIn 0.6s ease-in' }}
                        >
                            <p
                                className="font-semibold text-white/95 tracking-wide leading-tight"
                                style={{ fontSize: DEMO_SCREEN_TEXT_FONT_SIZE_PX }}
                            >
                                {currentScreenText}
                            </p>
                        </div>
                    )}

                    {/* ── VIDEO PLAYER ───────────────────────────────────────────
                      * Rendered second (below any screen text) so it does not
                      * displace text that should appear above the video.
                      * ─────────────────────────────────────────────────── */}
                    {showMovie && (
                        <div className="px-5 py-4 mb-4">
                            <div className="mx-auto w-full max-w-3xl rounded-xl overflow-hidden border border-white/10 shadow-[0_4px_32px_rgba(0,0,0,0.5)]">
                                <video
                                    src={DEMO_MOVIE_PATH}
                                    controls
                                    autoPlay
                                    className="w-full max-h-[45vh] object-contain bg-black"
                                    aria-label="Digital transformation overview video"
                                />
                            </div>
                        </div>
                    )}

                    {/* ── MEDIA INSTRUCTION (dynamic chart/viz) ─────────────────────
                      * When a CtaStep.mediaInstruction is active, render the dynamic
                      * chart/viz renderer INSTEAD of the static slide image.
                      * currentMediaInstruction is cleared on every act transition so
                      * only one chart is ever shown at a time.
                      * ─────────────────────────────────────────────────────────── */}
                    {currentMediaInstruction && (
                        <DemoMediaInstructionRenderer instruction={currentMediaInstruction} />
                    )}

                    {/* ── CURRENT SLIDE ───────────────────────────────────────
                      * Shown when the presenter clicks the CTA button.
                      * currentSlide is written by handleCtaClick stepping through
                      * the current act's ctaSlides[]. Cleared on act transition.
                      * Not shown when a mediaInstruction is active (the chart takes
                      * visual priority over the static image for that step).
                      * ─────────────────────────────────────────────────────── */}
                    {currentSlide && !currentMediaInstruction && (
                        <div className="w-full">
                            <img
                                src={currentSlide}
                                alt="Presentation slide"
                                className="w-full block"
                            />
                        </div>
                    )}

                    {/* ── SCREEN TEXT block was moved to the top of this container.
                      * Do NOT duplicate it here. This comment marks where it used to be.
                      * ──────────────────────────────────────────────────────── */}

                    {/* ── MESSAGES ───────────────────────────────────────────── */}
                    {messages.map((msg: DemoMessage) => {
                        const isUser = msg.role === 'user';
                        const isSystem = msg.role === 'system';

                        /** System notification — centred pill */
                        if (isSystem) {
                            return (
                                <div key={msg.id} className="flex justify-center px-5 py-2">
                                    <span className={`text-sm px-3 py-1 rounded-full ${
                                        msg.error
                                            ? 'text-red-400 bg-red-500/10 border border-red-500/20'
                                            : 'text-white/35 bg-white/5 border border-white/10'
                                    }`}>
                                        {msg.content}
                                    </span>
                                </div>
                            );
                        }

                        /** Image-only slide bubble — truly edge-to-edge.
                          * No padding, no margin, no border-radius, no object-contain.
                          * The image spans the full panel width with natural proportions. */
                        if (msg.imageUrl) {
                            return (
                                <div key={msg.id} className="w-full">
                                    <img
                                        src={msg.imageUrl}
                                        alt="Presentation slide"
                                        className="w-full block"
                                    />
                                </div>
                            );
                        }

                        /** User message — right-aligned compact label */
                        if (isUser) {
                            return (
                                <div key={msg.id} className="flex justify-end px-5 pt-2">
                                    <span className="
                                        max-w-[80%] text-sm text-violet-200/80
                                        bg-violet-500/10 border border-violet-400/15
                                        rounded-lg px-3 py-1.5
                                    ">
                                        {msg.content}
                                    </span>
                                </div>
                            );
                        }

                        /** Assistant message — left-aligned clean prose */
                        return (
                            <div key={msg.id} className="flex justify-start px-5 py-2">
                                {msg.isStreaming ? (
                                    /* Streaming dots placeholder */
                                    <span className="flex items-center gap-1 py-2 px-1">
                                        <span className="w-1.5 h-1.5 bg-white/35 rounded-full animate-bounce [animation-delay:-0.3s]" />
                                        <span className="w-1.5 h-1.5 bg-white/35 rounded-full animate-bounce [animation-delay:-0.15s]" />
                                        <span className="w-1.5 h-1.5 bg-white/35 rounded-full animate-bounce" />
                                    </span>
                                ) : (
                                    <pre className={`
                                        whitespace-pre-wrap wrap-break-word font-sans
                                        text-base leading-relaxed max-w-[90%]
                                        ${msg.error ? 'text-red-300' : 'text-white/85'}
                                    `}>
                                        {msg.content}
                                    </pre>
                                )}
                            </div>
                        );
                    })}

                    {/* Scroll anchor */}
                    <div ref={bottomRef} />
                </div>
            </div>
        </div>
    );
};
