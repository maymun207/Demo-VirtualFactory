/**
 * DemoConveyorSpeedChart.tsx — Live Conveyor Speed Line Chart
 *
 * Renders a premium dark-themed SVG line chart of S-Clock (sim_tick) vs
 * conveyor belt speed. Data is sourced synchronously from the local
 * conveyorStateRecords ring-buffer in simulationDataStore — no API call or
 * Supabase query is needed, so the chart is instant and always up to date.
 *
 * Visual features:
 *   - Dark glass background with primary violet gradient fill under the line
 *   - Dashed reference line at DEMO_CHART_REF_SPEED (1.0 m/s nominal speed)
 *   - Animated pulse dot on the most recent data point
 *   - Fully responsive: width is derived from the parent container
 *   - Graceful empty state (shows a message when no data is present yet)
 *
 * All visual constants (height, padding, speed range) come from demoConfig.ts
 * — nothing is hard-coded in this file.
 *
 * Used by: DemoMediaInstructionRenderer.tsx (dispatched for 'chart:conveyor_speed')
 */

import React, { useMemo, useRef, useState, useEffect } from 'react';
import { useSimulationDataStore } from '../../../store/simulationDataStore';
import {
    DEMO_CHART_HEIGHT_PX,
    DEMO_CHART_PADDING,
    DEMO_CHART_REF_SPEED,
    DEMO_CHART_MAX_SPEED,
    DEMO_CHART_MIN_SPEED,
} from '../../../lib/params/demoSystem/demoConfig';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Clamp n to [lo, hi]. Avoids invalid SVG path values at extremes. */
const clamp = (n: number, lo: number, hi: number): number =>
    Math.max(lo, Math.min(hi, n));

/** Format a speed value to two decimal places for axis labels. */
const fmtSpeed = (v: number): string => v.toFixed(2);

// ─── Y-axis tick values (static for the conveyor speed range) ────────────────
const Y_TICKS = [0, 0.5, 1.0, 1.5, 2.0];

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * DemoConveyorSpeedChart — SVG line chart of S-Clock vs conveyor belt speed.
 *
 * Reads conveyorStateRecords from simulationDataStore on each render.
 * Re-renders automatically when the store emits new data (Zustand subscription).
 */
export const DemoConveyorSpeedChart: React.FC = () => {
    /** Container ref used to measure actual rendered width. */
    const containerRef = useRef<HTMLDivElement>(null);
    /** Measured pixel width of the SVG canvas. Updated on mount and resize. */
    const [svgWidth, setSvgWidth] = useState<number>(700);

    /** Subscribe to conveyorStateRecords — re-renders whenever new tick data arrives. */
    const records = useSimulationDataStore((s) => s.conveyorStateRecords);

    /**
     * Measure container width on mount and on every window resize.
     * Uses ResizeObserver for accuracy; falls back to getBoundingClientRect.
     */
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;

        /** Perform one immediate measurement so the chart is not 0-wide on mount. */
        setSvgWidth(el.getBoundingClientRect().width || 700);

        /** ResizeObserver: update whenever the container changes width. */
        const ro = new ResizeObserver((entries) => {
            const w = entries[0]?.contentRect.width;
            if (w && w > 0) setSvgWidth(w);
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    /**
     * Derived chart geometry — recalculates only when svgWidth or records change.
     * Separating this from the render keeps the JSX concise.
     */
    const chart = useMemo(() => {
        /** Inner drawable area after padding is removed. */
        const innerW = svgWidth - DEMO_CHART_PADDING.left - DEMO_CHART_PADDING.right;
        const innerH = DEMO_CHART_HEIGHT_PX - DEMO_CHART_PADDING.top - DEMO_CHART_PADDING.bottom;

        /** Speed range span used for proportional Y mapping. */
        const speedRange = DEMO_CHART_MAX_SPEED - DEMO_CHART_MIN_SPEED;

        /** No data guard — chart renders empty state instead of a path. */
        if (records.length === 0) {
            return { empty: true, innerW, innerH, speedRange, points: [], latestX: 0, latestY: 0, refY: 0, pathD: '', areaD: '' };
        }

        /** X-axis domain: first to last sim_tick. */
        const minTick = records[0].sim_tick;
        const maxTick = records[records.length - 1].sim_tick;
        const tickSpan = Math.max(maxTick - minTick, 1);

        /**
         * Map a sim_tick to an SVG X coordinate (left-anchored at padding.left).
         * The chart always shows the full history from the earliest to latest tick.
         */
        const toX = (tick: number): number =>
            DEMO_CHART_PADDING.left + ((tick - minTick) / tickSpan) * innerW;

        /**
         * Map a speed value to an SVG Y coordinate.
         * Y axis is inverted: 0 (bottom) = DEMO_CHART_MIN_SPEED,
         *                     innerH (top) = DEMO_CHART_MAX_SPEED.
         */
        const toY = (speed: number): number =>
            DEMO_CHART_PADDING.top +
            innerH -
            ((clamp(speed, DEMO_CHART_MIN_SPEED, DEMO_CHART_MAX_SPEED) - DEMO_CHART_MIN_SPEED) / speedRange) * innerH;

        /** Reference line Y — the nominal 1.0 m/s line. */
        const refY = toY(DEMO_CHART_REF_SPEED);

        /** Pixel coordinates for each data point. */
        const points = records.map((r) => ({ x: toX(r.sim_tick), y: toY(r.conveyor_speed) }));

        /** Polyline path string for the speed line. */
        const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');

        /** Closed area path for the gradient fill below the speed line. */
        const bottomY = DEMO_CHART_PADDING.top + innerH;
        const areaD =
            pathD +
            ` L ${points[points.length - 1].x.toFixed(1)} ${bottomY}` +
            ` L ${points[0].x.toFixed(1)} ${bottomY}` +
            ' Z';

        /** Latest data point coordinates for the pulse dot. */
        const lastPt = points[points.length - 1];

        /** X-axis tick values (uniformly spaced). */
        const xTickCount = Math.min(6, records.length);
        const xTicks: Array<{ x: number; label: string }> = [];
        for (let i = 0; i < xTickCount; i++) {
            const tick = minTick + Math.round((i / (xTickCount - 1)) * tickSpan);
            xTicks.push({ x: toX(tick), label: String(tick) });
        }

        return {
            empty: false,
            innerW,
            innerH,
            speedRange,
            points,
            latestX: lastPt.x,
            latestY: lastPt.y,
            refY,
            pathD,
            areaD,
            xTicks,
            toX,
            toY,
        };
    }, [svgWidth, records]);

    return (
        <div
            ref={containerRef}
            className="w-full flex flex-col gap-1"
            style={{ userSelect: 'none' }}
        >
            {/* ── Chart title ────────────────────────────────────────────── */}
            <div className="flex items-center justify-between px-1 pb-1">
                <span className="text-xs font-semibold text-violet-300/90 tracking-wide uppercase">
                    Conveyor Belt Speed
                </span>
                <span className="text-[10px] text-white/35">
                    {records.length > 0
                        ? `S-Clock 0 – ${records[records.length - 1].sim_tick} · ${records.length} samples`
                        : 'Waiting for simulation data…'}
                </span>
            </div>

            {/* ── SVG canvas ─────────────────────────────────────────────── */}
            <svg
                width="100%"
                height={DEMO_CHART_HEIGHT_PX}
                viewBox={`0 0 ${svgWidth} ${DEMO_CHART_HEIGHT_PX}`}
                preserveAspectRatio="none"
                style={{ display: 'block' }}
                aria-label="Conveyor belt speed chart over simulation time"
            >
                {/* ── Gradient definitions ──────────────────────────────── */}
                <defs>
                    {/* Gradient fill below the speed line */}
                    <linearGradient id="speedAreaGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="rgb(139,92,246)" stopOpacity="0.55" />
                        <stop offset="100%" stopColor="rgb(139,92,246)" stopOpacity="0.03" />
                    </linearGradient>
                    {/* Reference line gradient (green dashed) */}
                    <linearGradient id="refLineGradient" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="rgb(52,211,153)" stopOpacity="0.15" />
                        <stop offset="50%" stopColor="rgb(52,211,153)" stopOpacity="0.7" />
                        <stop offset="100%" stopColor="rgb(52,211,153)" stopOpacity="0.15" />
                    </linearGradient>
                </defs>

                {/* ── Chart background ──────────────────────────────────── */}
                <rect
                    x={DEMO_CHART_PADDING.left}
                    y={DEMO_CHART_PADDING.top}
                    width={chart.innerW}
                    height={chart.innerH}
                    fill="rgba(255,255,255,0.02)"
                    rx="4"
                />

                {/* ── Y-axis grid lines and labels ──────────────────────── */}
                {Y_TICKS.map((speed) => {
                    const y = DEMO_CHART_PADDING.top +
                        chart.innerH -
                        ((speed - DEMO_CHART_MIN_SPEED) / (DEMO_CHART_MAX_SPEED - DEMO_CHART_MIN_SPEED)) * chart.innerH;
                    return (
                        <g key={speed}>
                            {/* Horizontal grid line */}
                            <line
                                x1={DEMO_CHART_PADDING.left}
                                y1={y}
                                x2={DEMO_CHART_PADDING.left + chart.innerW}
                                y2={y}
                                stroke="rgba(255,255,255,0.07)"
                                strokeWidth="1"
                            />
                            {/* Y-axis label */}
                            <text
                                x={DEMO_CHART_PADDING.left - 8}
                                y={y + 4}
                                textAnchor="end"
                                fill="rgba(255,255,255,0.4)"
                                fontSize="10"
                                fontFamily="system-ui, sans-serif"
                            >
                                {fmtSpeed(speed)}
                            </text>
                        </g>
                    );
                })}

                {/* ── Reference speed line (nominal 1.0 m/s) ───────────── */}
                {!chart.empty && (
                    <line
                        x1={DEMO_CHART_PADDING.left}
                        y1={chart.refY}
                        x2={DEMO_CHART_PADDING.left + chart.innerW}
                        y2={chart.refY}
                        stroke="url(#refLineGradient)"
                        strokeWidth="1.5"
                        strokeDasharray="6 4"
                    />
                )}

                {/* ── Gradient area fill ────────────────────────────────── */}
                {!chart.empty && chart.areaD && (
                    <path
                        d={chart.areaD}
                        fill="url(#speedAreaGradient)"
                    />
                )}

                {/* ── Speed line ────────────────────────────────────────── */}
                {!chart.empty && chart.pathD && (
                    <path
                        d={chart.pathD}
                        fill="none"
                        stroke="rgb(167,139,250)"
                        strokeWidth="2"
                        strokeLinejoin="round"
                        strokeLinecap="round"
                    />
                )}

                {/* ── Latest data point pulse dot ───────────────────────── */}
                {!chart.empty && (
                    <g>
                        {/* Outer pulsing ring */}
                        <circle
                            cx={chart.latestX}
                            cy={chart.latestY}
                            r="6"
                            fill="rgba(167,139,250,0.25)"
                        >
                            <animate
                                attributeName="r"
                                values="4;10;4"
                                dur="2s"
                                repeatCount="indefinite"
                            />
                            <animate
                                attributeName="opacity"
                                values="0.6;0;0.6"
                                dur="2s"
                                repeatCount="indefinite"
                            />
                        </circle>
                        {/* Solid centre dot */}
                        <circle
                            cx={chart.latestX}
                            cy={chart.latestY}
                            r="3.5"
                            fill="rgb(216,180,254)"
                            stroke="rgba(255,255,255,0.6)"
                            strokeWidth="1"
                        />
                    </g>
                )}

                {/* ── X-axis ticks and labels ───────────────────────────── */}
                {!chart.empty && chart.xTicks?.map((t) => (
                    <g key={t.label}>
                        <line
                            x1={t.x}
                            y1={DEMO_CHART_PADDING.top + chart.innerH}
                            x2={t.x}
                            y2={DEMO_CHART_PADDING.top + chart.innerH + 4}
                            stroke="rgba(255,255,255,0.3)"
                            strokeWidth="1"
                        />
                        <text
                            x={t.x}
                            y={DEMO_CHART_PADDING.top + chart.innerH + 16}
                            textAnchor="middle"
                            fill="rgba(255,255,255,0.4)"
                            fontSize="10"
                            fontFamily="system-ui, sans-serif"
                        >
                            {t.label}
                        </text>
                    </g>
                ))}

                {/* ── Axis labels ───────────────────────────────────────── */}
                {/* Y-axis label */}
                <text
                    x={12}
                    y={DEMO_CHART_PADDING.top + chart.innerH / 2}
                    textAnchor="middle"
                    fill="rgba(255,255,255,0.35)"
                    fontSize="10"
                    fontFamily="system-ui, sans-serif"
                    transform={`rotate(-90, 12, ${DEMO_CHART_PADDING.top + chart.innerH / 2})`}
                >
                    Speed (m/s)
                </text>
                {/* X-axis label */}
                <text
                    x={DEMO_CHART_PADDING.left + chart.innerW / 2}
                    y={DEMO_CHART_HEIGHT_PX - 4}
                    textAnchor="middle"
                    fill="rgba(255,255,255,0.35)"
                    fontSize="10"
                    fontFamily="system-ui, sans-serif"
                >
                    S-Clock (simulation ticks)
                </text>

                {/* ── Empty state overlay ───────────────────────────────── */}
                {chart.empty && (
                    <text
                        x={svgWidth / 2}
                        y={DEMO_CHART_HEIGHT_PX / 2}
                        textAnchor="middle"
                        fill="rgba(255,255,255,0.3)"
                        fontSize="13"
                        fontFamily="system-ui, sans-serif"
                    >
                        Waiting for simulation data…
                    </text>
                )}
            </svg>

            {/* ── Legend ─────────────────────────────────────────────────── */}
            <div className="flex gap-4 px-1 pt-0.5">
                {/* Actual speed line */}
                <div className="flex items-center gap-1.5">
                    <span
                        className="inline-block w-5 h-0.5 rounded"
                        style={{ background: 'rgb(167,139,250)' }}
                    />
                    <span className="text-[10px] text-white/50">Actual speed</span>
                </div>
                {/* Reference line */}
                <div className="flex items-center gap-1.5">
                    <span
                        className="inline-block w-5 h-0 border-t border-dashed"
                        style={{ borderColor: 'rgb(52,211,153)', opacity: 0.7 }}
                    />
                    <span className="text-[10px] text-white/50">Nominal (1.0 m/s)</span>
                </div>
            </div>
        </div>
    );
};
