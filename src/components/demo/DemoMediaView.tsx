/**
 * DemoMediaView.tsx — Cinema-Mode Demo Overlay
 *
 * Two-zone overlay system. The 3D factory fills the entire viewport
 * BEHIND both zones. Nothing ever fully covers the factory.
 *
 * ZONE 1 — MEDIA FLOAT (slide images + charts)
 *   Centered above the narrative strip. Fades in/out.
 *
 * ZONE 2 — NARRATIVE STRIP (screenText + ARIA responses)
 *   Fixed to viewport bottom. No scrolling. Gradient background.
 *   Shows ONE piece of content at a time with smooth fade transitions.
 *
 * NO SCROLLING ANYWHERE. overflow: hidden everywhere.
 * <cls> causes a 300ms fade-out (no flash/strobe).
 *
 * Used by: src/components/demo/DemoLayout.tsx
 */

import React, { useEffect, useRef, useState, useMemo } from 'react';
import { useDemoStore } from '../../store/demoStore';
import type { DemoState, DemoMessage } from '../../store/demoStore';
import {
    DEMO_MOVIE_PATH,
    DEMO_SIDE_PANEL_WIDTH_PX,
} from '../../lib/params/demoSystem/demoConfig';
import { resolveAssetPath } from '../../lib/assetPath';
import { useUIStore } from '../../store/uiStore';
import { DemoMediaInstructionRenderer } from './media/DemoMediaInstructionRenderer';

/** Props from the parent that coordinates with DemoSidePanel */
interface DemoMediaViewProps {
    /** Whether the presenter has requested the movie to play */
    showMovie: boolean;
    /**
     * sidebarVisible — kept in props for API compatibility with DemoLayout.
     * @deprecated for positioning; retained for API compatibility
     */
    sidebarVisible: boolean;
}

/**
 * DemoMediaView — cinematic two-zone overlay.
 * Returns null when the demo tab is not active.
 */
export const DemoMediaView: React.FC<DemoMediaViewProps> = ({
    showMovie,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    sidebarVisible: _sidebarVisible,
}) => {
    /* ── Store selectors ───────────────────────────────────────── */
    const showDemoScreen = useUIStore((s) => s.showDemoScreen);
    const showCWF = useUIStore((s) => s.showCWF);
    const cwfPanelWidth = useUIStore((s) => s.cwfPanelWidth);

    const messages = useDemoStore((s: DemoState) => s.messages);
    const currentSlide = useDemoStore((s: DemoState) => s.currentSlide);
    const currentMediaInstruction = useDemoStore((s: DemoState) => s.currentMediaInstruction);
    const currentScreenText = useDemoStore((s: DemoState) => s.currentScreenText);

    const screenTextAlign = useDemoStore((s: DemoState) => s.currentScreenTextAlign);
    const screenTextWeight = useDemoStore((s: DemoState) => s.currentScreenTextWeight);
    const screenTextSize = useDemoStore((s: DemoState) => s.currentScreenTextSize);

    const ariaLocalAlign = useDemoStore((s: DemoState) => s.currentAriaLocalAlign);
    const ariaLocalWeight = useDemoStore((s: DemoState) => s.currentAriaLocalWeight);
    const ariaLocalSize = useDemoStore((s: DemoState) => s.currentAriaLocalSize);

    /* ── Narrative strip fade state ─────────────────────────────
     * displayText holds the visible content DURING fade-out.
     * When the store clears content (→ null), we don't instantly
     * remove the DOM. Instead we fade out, THEN clear.           */
    const [narrativeContent, setNarrativeContent] = useState<string | null>(null);
    const [narrativeVisible, setNarrativeVisible] = useState(false);
    const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const hadContentRef = useRef(false);

    /* ── Media float fade state ────────────────────────────────── */
    const [mediaVisible, setMediaVisible] = useState(false);

    /* ── Derived content ───────────────────────────────────────── */
    const latestAssistant = useMemo(() => {
        const assistantMsgs = messages.filter(
            (m: DemoMessage) => m.role === 'assistant' && m.content.trim() && !m.isStreaming
        );
        return assistantMsgs.length > 0 ? assistantMsgs[assistantMsgs.length - 1] : null;
    }, [messages]);

    const streamingMsg = useMemo(() => {
        return messages.find((m: DemoMessage) => m.role === 'assistant' && m.isStreaming);
    }, [messages]);

    /** screenText takes priority → then streaming → then latest assistant */
    const desiredContent = currentScreenText
        ?? streamingMsg?.content
        ?? latestAssistant?.content
        ?? null;

    /* ── Narrative fade transitions ─────────────────────────────
     * null→content: fade IN   |   content→null: fade OUT then clear
     * content→content: update text in place (no re-fade)            */
    useEffect(() => {
        if (fadeTimerRef.current) {
            clearTimeout(fadeTimerRef.current);
            fadeTimerRef.current = null;
        }

        const hasContent = desiredContent !== null && desiredContent.trim() !== '';

        if (hasContent && !hadContentRef.current) {
            // Transition: empty → content (fade IN)
            setNarrativeContent(desiredContent);
            requestAnimationFrame(() => setNarrativeVisible(true));
        } else if (hasContent) {
            // Content updating progressively — just update text
            setNarrativeContent(desiredContent);
        } else if (!hasContent && hadContentRef.current) {
            // Transition: content → empty (fade OUT then clear)
            setNarrativeVisible(false);
            fadeTimerRef.current = setTimeout(() => setNarrativeContent(null), 300);
        }

        hadContentRef.current = hasContent;
    }, [desiredContent]);

    /* ── Media float fade transitions ──────────────────────────── */
    const hasMedia = !!(currentSlide || currentMediaInstruction);

    useEffect(() => {
        if (hasMedia) {
            requestAnimationFrame(() => setMediaVisible(true));
        } else {
            setMediaVisible(false);
        }
    }, [hasMedia]);

    /* ── Cleanup ───────────────────────────────────────────────── */
    useEffect(() => {
        return () => {
            if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
        };
    }, []);

    /* ── Gate rendering ────────────────────────────────────────── */
    if (!showDemoScreen) return null;

    /* ── Panel-aware positioning ────────────────────────────────── */
    const leftEdge = DEMO_SIDE_PANEL_WIDTH_PX;
    const rightEdge = showCWF ? cwfPanelWidth : 0;

    return (
        <div id="demo-cinema-root">

            {/* ════════════════════════════════════════════════════════
                ZONE 1 — MEDIA FLOAT (slide image or chart)
                Centered above the narrative strip. Fades in/out.
                The 3D factory is fully visible around it.
                ════════════════════════════════════════════════════════ */}
            {(currentSlide || currentMediaInstruction) && (
                <div
                    className="fixed z-[9996] pointer-events-none
                               flex items-center justify-center"
                    style={{
                        top: '10vh',
                        left: leftEdge,
                        right: rightEdge,
                        height: '45vh',
                    }}
                >
                    <div
                        className="pointer-events-auto rounded-xl overflow-hidden
                                   border border-white/10 shadow-2xl"
                        style={{
                            maxWidth: '50%',
                            maxHeight: '28vh',
                            opacity: mediaVisible ? 1 : 0,
                            transition: 'opacity 400ms ease-in-out',
                            background: 'rgba(0, 0, 0, 0.6)',
                            backdropFilter: 'blur(12px)',
                        }}
                    >
                        {currentMediaInstruction ? (
                            <DemoMediaInstructionRenderer instruction={currentMediaInstruction} />
                        ) : currentSlide ? (
                            <img
                                src={resolveAssetPath(currentSlide)}
                                alt=""
                                className="w-full h-full object-contain"
                                style={{ maxHeight: '28vh' }}
                            />
                        ) : null}
                    </div>
                </div>
            )}

            {/* ════════════════════════════════════════════════════════
                ZONE 2 — NARRATIVE STRIP (screenText + ARIA voice)
                Fixed to viewport bottom. No scrolling.
                Gradient: transparent top → dark bottom.
                ════════════════════════════════════════════════════════ */}
            {narrativeContent && (
                <div
                    className="fixed z-[9997] pointer-events-auto"
                    style={{
                        bottom: 0,
                        left: leftEdge,
                        right: rightEdge,
                        maxHeight: '28vh',
                        overflow: 'hidden',
                        background: 'linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,0.75) 25%, rgba(0,0,0,0.85) 100%)',
                        opacity: narrativeVisible ? 1 : 0,
                        transition: 'opacity 300ms ease-in-out',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'flex-end',
                    }}
                >
                    {/* Top gradient mask — fades old text at the top */}
                    <div
                        className="pointer-events-none absolute top-0 left-0 right-0"
                        style={{
                            height: '40px',
                            background: 'linear-gradient(to bottom, rgba(0,0,0,0.85), transparent)',
                            zIndex: 1,
                        }}
                    />

                    {/* The actual text content */}
                    <div className="px-8 py-5 relative z-0">
                        {currentScreenText ? (
                            /* ── screenText: cinematic subtitle style ── */
                            <p
                                className={`
                                    ${screenTextWeight === 'normal' ? 'font-normal' : 'font-semibold'}
                                    text-white/95 tracking-wide leading-relaxed
                                    whitespace-pre-wrap
                                    ${screenTextAlign === 'left' ? 'text-left' :
                                      screenTextAlign === 'right' ? 'text-right' : 'text-center'}
                                `}
                                style={{
                                    fontSize: screenTextSize === 'sm' ? '16px' :
                                             screenTextSize === 'md' ? '20px' :
                                             screenTextSize === 'xl' ? '32px' : '24px',
                                    textShadow: '0 2px 8px rgba(0,0,0,0.8)',
                                }}
                            >
                                {narrativeContent}
                            </p>
                        ) : (
                            /* ── ARIA response: clean prose style ── */
                            <pre
                                className={`
                                    whitespace-pre-wrap break-words font-sans
                                    leading-relaxed text-white/85
                                    ${ariaLocalWeight === 'bold' ? 'font-semibold' : 'font-normal'}
                                    ${ariaLocalAlign === 'center' ? 'text-center' :
                                      ariaLocalAlign === 'right' ? 'text-right' : 'text-left'}
                                `}
                                style={{
                                    fontSize: ariaLocalSize === 'sm' ? '14px' :
                                             ariaLocalSize === 'md' ? '15px' :
                                             ariaLocalSize === 'lg' ? '18px' :
                                             ariaLocalSize === 'xl' ? '22px' : '15px',
                                    textShadow: '0 1px 4px rgba(0,0,0,0.6)',
                                }}
                            >
                                {narrativeContent}
                            </pre>
                        )}
                    </div>
                </div>
            )}

            {/* ════════════════════════════════════════════════════════
                LOADING INDICATOR — shown while ariaApi is in-flight
                ════════════════════════════════════════════════════════ */}
            {messages.some((m: DemoMessage) => m.isStreaming) && !narrativeContent && (
                <div
                    className="fixed z-[9997] flex items-center justify-center gap-1.5"
                    style={{
                        bottom: '2vh',
                        left: leftEdge,
                        right: rightEdge,
                    }}
                >
                    <span className="w-2 h-2 bg-white/40 rounded-full animate-bounce [animation-delay:-0.3s]" />
                    <span className="w-2 h-2 bg-white/40 rounded-full animate-bounce [animation-delay:-0.15s]" />
                    <span className="w-2 h-2 bg-white/40 rounded-full animate-bounce" />
                </div>
            )}

            {/* ════════════════════════════════════════════════════════
                SYSTEM ERROR MESSAGES — small pill at top center
                ════════════════════════════════════════════════════════ */}
            {messages
                .filter((m: DemoMessage) => m.role === 'system' && m.error)
                .map((msg: DemoMessage) => (
                    <div
                        key={msg.id}
                        className="fixed z-[9998] top-16 left-1/2 -translate-x-1/2
                                   text-sm text-red-400 bg-red-500/10 border border-red-500/20
                                   rounded-full px-4 py-1.5 pointer-events-auto"
                        style={{ animation: 'demoFadeIn 0.3s ease-out' }}
                    >
                        {msg.content}
                    </div>
                ))}

            {/* ════════════════════════════════════════════════════════
                VIDEO PLAYER — centered overlay when movie is requested
                ════════════════════════════════════════════════════════ */}
            {showMovie && (
                <div
                    className="fixed z-[9999] inset-0 flex items-center justify-center
                               bg-black/70 pointer-events-auto"
                    style={{ left: leftEdge }}
                >
                    <div className="w-full max-w-3xl rounded-xl overflow-hidden
                                   border border-white/10 shadow-2xl mx-8">
                        <video
                            src={resolveAssetPath(DEMO_MOVIE_PATH)}
                            controls
                            autoPlay
                            className="w-full max-h-[70vh] object-contain bg-black"
                            aria-label="Digital transformation overview video"
                        />
                    </div>
                </div>
            )}
        </div>
    );
};
