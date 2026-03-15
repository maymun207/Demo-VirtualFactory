/**
 * DemoSidePanel.tsx — New Demo Control Sidebar
 *
 * A collapsible fixed-position left sidebar shown whenever the Demo tab is
 * active (showDemoScreen === true). Replaces the old DemoControlBar entirely.
 *
 * Layout (top to bottom):
 *   1. Header: "Demo Status & Control" + hide/show toggle arrow
 *   2. Scenario badge: reads activeScenario.code from simulationDataStore
 *   3. Stage indicator: shows the current act's eraLabel
 *   4. Reset + Start/Next action buttons
 *   5. Stage LED list: acts 1–5 (those with sidebarLabel set) — clickable
 *   6. "Why Digital Transformation?" section + Watch movie button
 *   7. "Ask ARIA a question..." input + Reset + Send (bottom)
 *
 * KEY BEHAVIOURS:
 *   - LED is green for the currently active act, grey for all others.
 *   - Clicking an LED calls demoStore.jumpToAct() for non-linear navigation.
 *   - "Watch movie" button emits an event that DemoMediaView listens to
 *     (via the demoShowMovie flag in this component's local state passed up
 *     via the onMovieRequest callback prop).
 *   - Collapse arrow hides the sidebar; the media view expands to fill the space.
 *
 * Used by: src/components/ui/Dashboard.tsx
 */

import React, { useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Send, RotateCcw, Film } from 'lucide-react';
import { useDemoStore } from '../../store/demoStore';
import type { DemoState } from '../../store/demoStore';
import { DEMO_ACTS } from '../../lib/params/demoSystem/demoScript';
import {
    DEMO_SIDE_PANEL_WIDTH_PX,
    DEMO_ARIA_LOADING_LABEL,
} from '../../lib/params/demoSystem/demoConfig';
import { useSimulationDataStore } from '../../store/simulationDataStore';
import { useUIStore } from '../../store/uiStore';
/** CTA button label derivation — extracted for testability per module-per-feature rule */
import { deriveCtaButtonLabel } from '../../lib/utils/demoCtaLabel';

/** Props passed from DemoLayout */
interface DemoSidePanelProps {
    /** Called when the presenter clicks "Watch movie" to start playback */
    onMovieRequest: () => void;
    /** Called when the presenter clicks the button again to dismiss the movie */
    onMovieDismiss: () => void;
    /** Whether the movie is currently playing — drives toggle button state */
    isMoviePlaying: boolean;
    /** Called whenever the sidebar collapses or expands, with the new visible state */
    onVisibilityChange: (visible: boolean) => void;
    /** Initial visibility — driven by DEMO_SIDE_PANEL_VISIBLE_DEFAULT */
    initialVisible: boolean;
}

/**
 * DemoSidePanel — the collapsible left control bar for the demo narrative.
 * Returns null when the demo tab is closed.
 */
export const DemoSidePanel: React.FC<DemoSidePanelProps> = ({
    onMovieRequest,
    onMovieDismiss,
    isMoviePlaying,
    onVisibilityChange,
    initialVisible,
}) => {
    /** Only visible while demo tab is open */
    const showDemoScreen = useUIStore((s) => s.showDemoScreen);

    /** Current act index — drives LED highlights and stage label */
    const currentActIndex = useDemoStore((s: DemoState) => s.currentActIndex);
    /** Whether ARIA is generating a response */
    const isLoading = useDemoStore((s: DemoState) => s.isLoading);
    /**
     * isCtaExecuting — true while handleCtaClick is running (including delayMs sleep).
     * Guards against rapid clicks executing the same step multiple times.
     */
    const isCtaExecuting = useDemoStore((s: DemoState) => s.isCtaExecuting);
    /** Store actions */
    const handleCtaClick = useDemoStore((s: DemoState) => s.handleCtaClick);
    const restartDemo = useDemoStore((s: DemoState) => s.restartDemo);
    const sendMessage = useDemoStore((s: DemoState) => s.sendMessage);
    const jumpToAct = useDemoStore((s: DemoState) => s.jumpToAct);
    /** CTA slide sequencer position within the current act */
    const ctaStepIndex = useDemoStore((s: DemoState) => s.ctaStepIndex);

    /** Whether a simulation session is currently running */
    const simHasSession = useSimulationDataStore((s) => !!s.session?.id);
    /** Currently active scenario code for the badge */
    const activeScenarioCode = useSimulationDataStore(
        (s) => s.activeScenario?.code ?? null,
    );

    /** Sidebar collapsed state — starts visible per initialVisible prop */
    const [collapsed, setCollapsed] = useState<boolean>(!initialVisible);

    /** Notify parent whenever collapsed state changes */
    const handleToggle = () => {
        setCollapsed((v) => {
            const next = !v;
            onVisibilityChange(!next); /* visible = not collapsed */
            return next;
        });
    };

    /** Free-form chat input text */
    const [inputText, setInputText] = useState<string>('');
    /** Ref for programmatic input focus */
    const inputRef = useRef<HTMLInputElement | null>(null);

    /** True when on the final act */
    const isLastAct = currentActIndex >= DEMO_ACTS.length - 1;

    /** Active eraLabel for the "Stage:" display */
    const currentAct = DEMO_ACTS[currentActIndex];
    /**
     * ctaButtonLabel — delegated to the deriveCtaButtonLabel utility.
     * Tested independently in src/tests/demoCtaLabel.test.ts.
     */
    const currentStep = currentAct?.ctaSteps?.[ctaStepIndex];
    const ctaButtonLabel = deriveCtaButtonLabel({ isLastAct, ctaStepIndex, currentStep });

    /** The 5 narrative acts that have a sidebarLabel defined */
    const sidebarActs = DEMO_ACTS.map((act, idx) => ({ act, idx }))
        .filter(({ act }) => !!act.sidebarLabel);

    /** Sends the typed message to ARIA via demoStore */
    const handleSend = () => {
        const trimmed = inputText.trim();
        if (!trimmed || isLoading || !simHasSession) return;
        setInputText('');
        void sendMessage(trimmed);
    };

    /** Enter to send */
    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    /** Do not mount when the demo tab is not open */
    if (!showDemoScreen) return null;

    return (
        <div
            id="demo-side-panel"
            className="fixed top-0 left-0 bottom-0 z-9998 pointer-events-none"
            style={{ paddingTop: 40 /* header height approx */ }}
        >
            {/*
              * Collapse toggle arrow — always visible regardless of collapsed state.
              * Positioned at the right edge of the sidebar area.
              */}
            <button
                id="demo-sidebar-toggle"
                onClick={handleToggle}
                title={collapsed ? 'Show demo controls' : 'Hide demo controls'}
                className="
                    absolute top-14 pointer-events-auto
                    w-5 h-10 flex items-center justify-center
                    bg-black/70 border border-white/15
                    rounded-r-lg text-white/50 hover:text-white/90
                    transition-all duration-200
                    shadow-[2px_0_12px_rgba(0,0,0,0.5)]
                "
                style={{ left: collapsed ? 0 : DEMO_SIDE_PANEL_WIDTH_PX - 1 }}
            >
                {collapsed
                    ? <ChevronRight size={13} />
                    : <ChevronLeft size={13} />
                }
            </button>

            {/* Main sidebar body — hidden when collapsed */}
            {!collapsed && (
                <div
                    id="demo-side-panel-body"
                    className="
                        h-full flex flex-col gap-0
                        bg-black/80 backdrop-blur-xl
                        border-r border-white/10
                        pointer-events-auto
                        overflow-hidden
                    "
                    style={{ width: DEMO_SIDE_PANEL_WIDTH_PX }}
                >
                    {/* ── 1. HEADER ─────────────────────────────────────────── */}
                    <div className="px-3 pt-3 pb-2 border-b border-white/8">
                        <div className="flex items-center justify-between">
                            <span className="text-white text-[11px] font-bold uppercase tracking-widest leading-tight">
                                Demo Status &amp; Control
                            </span>
                        </div>

                        {/* Scenario badge */}
                        <div className="mt-2 flex items-center gap-1.5">
                            <span className="text-white/40 text-[10px] font-medium">Scenario:</span>
                            <span className="text-white/80 text-[10px] font-mono font-bold tracking-wider">
                                {activeScenarioCode ?? '—'}
                            </span>
                        </div>

                        {/* Stage label */}
                        <div className="mt-0.5 flex items-center gap-1.5">
                            <span className="text-white/40 text-[10px] font-medium">Stage:</span>
                            <span className="text-white/80 text-[10px] font-semibold">
                                {currentAct?.eraLabel ?? '—'}
                            </span>
                        </div>
                    </div>

                    {/* ── 2. RESET + START/NEXT BUTTONS ─────────────────────── */}
                    <div className="px-3 py-2 flex gap-2 border-b border-white/8">
                        {/* Reset button */}
                        <button
                            id="demo-sidebar-reset"
                            onClick={() => void restartDemo()}
                            disabled={isLoading}
                            title="Restart demo from beginning"
                            className="
                                flex-1 py-1.5 rounded-md text-[11px] font-semibold
                                bg-white/5 hover:bg-white/12
                                border border-white/10 hover:border-white/25
                                text-white/50 hover:text-white/80
                                transition-all duration-150
                                disabled:opacity-30 disabled:cursor-not-allowed
                            "
                        >
                            Reset
                        </button>

                        {/* Start / Next / Next Stage button */}
                        <button
                            id="demo-sidebar-advance"
                            onClick={() => {
                                if (isLastAct) {
                                    void restartDemo();
                                } else {
                                    void handleCtaClick();
                                }
                            }}
                            disabled={isLoading || isCtaExecuting}
                            title={
                                isLastAct
                                    ? 'Restart demo'
                                    : ctaStepIndex === 0
                                        ? 'Show first slide'
                                        : `Step ${ctaStepIndex + 1}`
                            }
                            className="
                                flex-2 py-1.5 rounded-md text-[11px] font-bold
                                bg-blue-500/25 hover:bg-blue-500/45
                                border border-blue-400/35 hover:border-blue-400/65
                                text-blue-200 hover:text-white
                                transition-all duration-150
                                disabled:opacity-30 disabled:cursor-not-allowed
                                flex items-center justify-center gap-1
                            "
                        >
                        {/*
                              Button content has two states:
                              - ARIA loading: pulse animation + "ARIA responding…" label
                                (button is already disabled={isLoading}, this is the visual)
                              - Normal: the derived CTA label from the current ctaStep
                        */}
                        {isLoading ? (
                            <span className="flex items-center gap-1.5 animate-pulse">
                                <span
                                    className="inline-block w-1.5 h-1.5 rounded-full bg-blue-300 animate-ping"
                                    aria-hidden="true"
                                />
                                {DEMO_ARIA_LOADING_LABEL}
                            </span>
                        ) : (
                            ctaButtonLabel
                        )}
                        </button>
                    </div>

                    {/* ── 3. STAGE LED LIST ──────────────────────────────────── */}
                    <div className="px-3 py-2 flex flex-col gap-1 overflow-y-auto border-b border-white/8">
                        {sidebarActs.map(({ act, idx }) => {
                            /** LED is green for the currently active act, grey otherwise */
                            const isActive = idx === currentActIndex;
                            return (
                                <button
                                    key={act.id}
                                    id={`demo-led-act-${idx}`}
                                    onClick={() => void jumpToAct(idx)}
                                    disabled={isLoading}
                                    title={`Jump to: ${act.eraLabel}`}
                                    className="
                                        flex items-start gap-2 text-left w-full
                                        px-2 py-1.5 rounded-md
                                        hover:bg-white/5 transition-all duration-150
                                        disabled:cursor-not-allowed
                                        group
                                    "
                                >
                                    {/* LED indicator */}
                                    <div className={`
                                        mt-1 w-2 h-2 rounded-full shrink-0 transition-all duration-200
                                        ${isActive
                                            ? 'bg-emerald-400 shadow-[0_0_6px_2px_rgba(52,211,153,0.6)]'
                                            : 'bg-white/20 group-hover:bg-white/35'
                                        }
                                    `} />
                                    {/* Label + sub-label */}
                                    <div className="min-w-0 leading-tight">
                                        <div className={`text-[11px] font-semibold ${isActive ? 'text-white' : 'text-white/55 group-hover:text-white/75'}`}>
                                            {act.sidebarLabel}
                                        </div>
                                        {act.sidebarSubLabel && (
                                            <div className={`text-[10px] italic ${isActive ? 'text-white/60' : 'text-white/30 group-hover:text-white/45'}`}>
                                                {act.sidebarSubLabel}
                                            </div>
                                        )}
                                    </div>
                                </button>
                            );
                        })}
                    </div>

                    {/* ── 4. CHAT INPUT ─────────────────────────────────────── */}
                    <div className="mt-[30px]">
                        {/* Divider label */}
                        <div className="px-3 pt-3 pb-1 border-t border-white/8">
                            <span className="text-white/30 text-[9px] font-medium uppercase tracking-widest">
                                Ask ARIA
                            </span>
                        </div>
                        <div className="px-3 pb-3 flex flex-col gap-2">
                        {/* Ask ARIA text input */}
                        <input
                            ref={inputRef}
                            id="demo-sidebar-input"
                            type="text"
                            value={inputText}
                            onChange={(e) => setInputText(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder={simHasSession ? 'Ask ARIA a question...' : 'Start simulation to chat...'}
                            disabled={isLoading || !simHasSession}
                            className="
                                w-full bg-white/5 border border-white/12
                                rounded-md px-3 py-2 text-[11px]
                                text-white placeholder-white/25
                                focus:outline-none focus:border-white/30 focus:bg-white/8
                                transition-all duration-150
                                disabled:opacity-40 disabled:cursor-not-allowed
                            "
                        />

                        {/* Reset + Send row */}
                        <div className="flex gap-1.5">
                            <button
                                id="demo-sidebar-reset-bottom"
                                onClick={() => void restartDemo()}
                                disabled={isLoading}
                                className="
                                    flex items-center justify-center gap-1
                                    px-2 py-1.5 rounded-md text-[10px] font-medium
                                    bg-white/5 hover:bg-white/10
                                    border border-white/10 hover:border-white/20
                                    text-white/40 hover:text-white/65
                                    transition-all duration-150
                                    disabled:opacity-30 disabled:cursor-not-allowed
                                "
                            >
                                <RotateCcw size={10} />
                                Reset
                            </button>
                            <button
                                id="demo-sidebar-send"
                                onClick={handleSend}
                                disabled={isLoading || !inputText.trim() || !simHasSession}
                                className="
                                    flex-2 flex items-center justify-center gap-1
                                    py-1.5 rounded-md text-[10px] font-bold
                                    bg-blue-500/20 hover:bg-blue-500/35
                                    border border-blue-400/25 hover:border-blue-400/55
                                    text-blue-200 hover:text-white
                                    transition-all duration-150
                                    disabled:opacity-30 disabled:cursor-not-allowed
                                "
                            >
                                <Send size={10} />
                                Send
                            </button>
                        </div>
                        </div>
                    </div>

                    {/* ── 5. WATCH MOVIE (below ARIA, pushed to bottom) ──────── */}
                    <div className="px-3 py-2 border-t border-white/8 mt-auto mb-[110px]">
                        <div className="text-white/75 text-[12px] font-medium mb-[20px] leading-tight truncate">
                            Why Digital Transformation?
                        </div>
                        <button
                            id="demo-sidebar-movie"
                            onClick={isMoviePlaying ? onMovieDismiss : onMovieRequest}
                            className={
                                isMoviePlaying
                                    ? `
                                        w-full flex items-center justify-center gap-1.5
                                        py-1.5 rounded-md
                                        bg-red-500/20 hover:bg-red-500/35
                                        border border-red-400/40 hover:border-red-400/60
                                        text-red-300 hover:text-white
                                        text-[11px] font-semibold
                                        transition-all duration-150
                                    `
                                    : `
                                        w-full flex items-center justify-center gap-1.5
                                        py-1.5 rounded-md
                                        bg-violet-500/20 hover:bg-violet-500/35
                                        border border-violet-400/30 hover:border-violet-400/60
                                        text-violet-200 hover:text-white
                                        text-[11px] font-semibold
                                        transition-all duration-150
                                    `
                            }
                        >
                            {isMoviePlaying ? (
                                /** Stop / dismiss icon — shown while movie is playing */
                                <>
                                    <span className="text-[10px]">✕</span>
                                    Dismiss movie
                                </>
                            ) : (
                                /** Play icon — shown when no movie is playing */
                                <>
                                    <Film size={12} />
                                    Watch movie
                                </>
                            )}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
