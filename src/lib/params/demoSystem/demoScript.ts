/**
 * demoScript.ts — "The Invisible Factory" — Web Visitor Self-Guided Demo
 *
 * REDESIGNED: March 2026
 *
 * "Sheet music" for the Virtual Factory Demo Engine.
 * Audience: solo web visitors arriving via "Demo Our Digital Twin"
 * button on ardic.ai — no human presenter, no conference room.
 *
 * ═══════════════════════════════════════════════════════════════
 * TWO-TIER ARCHITECTURE
 * ═══════════════════════════════════════════════════════════════
 *
 *   TIER 1 — "The Mirror" (Act 0):
 *     90–120 seconds, heavily auto-driven via <clck>.
 *     3 steps, 3 clicks. Catches the busy CEO, the sceptical
 *     engineer, the factory owner who "just clicked to see."
 *     Goal: make them feel the weight of money they didn't know
 *     they were losing.
 *
 *   TIER 2 — "The Journey" (Acts 1–6):
 *     5–7 minutes, guided click-by-click.
 *     For the engaged visitor who chose "Show me more."
 *     Deep narrative, live AI queries, full scenario progression.
 *
 * ═══════════════════════════════════════════════════════════════
 * NARRATIVE ARC (7 acts)
 * ═══════════════════════════════════════════════════════════════
 *
 *   Act 0  The Mirror        — Factory starts. Pain revealed. CWF wow. Fork.
 *   Act 1  No System         — Conveyor drift. Energy waste. Silent loss.
 *   Act 2  Basic System      — Dashboard exists. Can't explain itself.
 *   Act 3  Digital Twin      — Kiln crisis. Tile passport. CO₂ opens.
 *   Act 4  Chat with Factory — Four roles. One language. Parameter change.
 *   Act 5  Autonomous AI     — Cascade failure. Copilot acts. 03:47 log.
 *   Act 6  Close             — Financial mirror. The question they can't answer.
 *
 * ═══════════════════════════════════════════════════════════════
 * QUALITY MODEL (immutable across all acts)
 * ═══════════════════════════════════════════════════════════════
 *
 *   Sorting catches 100% of defects. Customer ALWAYS receives first quality.
 *   Second quality = 40–60% of production cost paid again at rework.
 *   Scrap = 100% total loss. NEVER imply defective tiles reach the customer.
 *
 * CONVEYOR LOSS MODEL (Acts 0–2 only, SCN-001):
 *   All machine params within spec. Only variable = conveyor speed drift.
 *   Loss = throughput gap + Kiln gas + Dryer electricity burned during idle.
 *   NEVER mention defects, quality grades, or sorting in Acts 0–2.
 *
 * CO₂ THREAD:
 *   Seeded in Act 0 (03:47 teaser: "~1,900 kg prevented"),
 *   quantified in Act 3 (kiln overconsumption),
 *   queryable in Act 4 (Sustainability role),
 *   autonomously prevented in Act 5 (same ~1,900 kg),
 *   monetised in Act 6 (same intervention).
 *
 * Used by: demoStore.ts, DemoMediaView.tsx, DemoSidePanel.tsx
 */

import type { DemoHeightKey } from './demoConfig';
import type { Language } from '../../../store/uiStore';

// ─── Bilingual Text Types ───────────────────────────────────────────────────

/**
 * I18nText — bilingual text field.
 * All visitor-facing strings in the demo use this type.
 * A plain string is treated as English-only (backward compatible).
 */
export type I18nText = { en: string; tr: string };

/**
 * resolveText — resolves an I18nText or plain string to the correct language.
 * Plain strings return as-is (English fallback).
 * undefined/null returns undefined.
 */
export function resolveText(
    text: I18nText | string | undefined | null,
    lang: Language
): string | undefined {
    if (text == null) return undefined;
    if (typeof text === 'string') return text;
    return text[lang] || text.en;
}

// ─── Panel Action Types ─────────────────────────────────────────────────────

export type UIPanel =
    | 'basicPanel'
    | 'dtxfr'
    | 'cwf'
    | 'controlPanel'
    | 'kpi'
    | 'heatmap'
    | 'passport'
    | 'oeeHierarchy';

export interface PanelAction {
    panel: UIPanel;
    state: 'open' | 'close';
}

// ─── Media Instruction Type ────────────────────────────────────────────────

export type MediaInstruction = 'chart:conveyor_speed';

// ─── Screen Text Formatting Types ──────────────────────────────────────────

export type ScreenTextAlign = 'left' | 'center' | 'right';
export type ScreenTextWeight = 'normal' | 'bold';
export type ScreenTextSize = 'sm' | 'md' | 'lg' | 'xl';

// ─── CTA Step ────────────────────────────────────────────────────────────────

export interface CtaStep {
    ctaLabel?: I18nText | string;
    slideImageUrl?: string;
    mediaInstruction?: MediaInstruction;
    scenarioCode?: string | null;
    workOrderId?: string | null;
    delayMs?: number;
    screenText?: I18nText | string;
    screenTextAlign?: ScreenTextAlign;
    screenTextWeight?: ScreenTextWeight;
    screenTextSize?: ScreenTextSize;
    ariaLocal?: I18nText | string;
    ariaLocalAlign?: ScreenTextAlign;
    ariaLocalWeight?: ScreenTextWeight;
    ariaLocalSize?: ScreenTextSize;
    ariaApi?: string;                // stays plain string — English only
    ariaInputEnabled?: boolean;
    panelActions?: PanelAction[];
    simulationAction?: 'start' | 'stop' | 'reset' | 'reset-start';
    transitionTo?: 'next' | string | null;
    /** Editor-only: persisted textarea pixel heights for the DemoScript Editor */
    editorHeights?: { screenText?: number; ariaLocal?: number; ariaApi?: number };
}

// ─── Act Definition ─────────────────────────────────────────────────────────

export interface DemoAct {
    id: string;
    eraLabel: I18nText | string;
    eraEmoji: string;
    targetHeightKey: DemoHeightKey;
    scenarioCode: string | null;
    panelActions: PanelAction[];
    enableCopilot?: boolean;
    ctaSteps?: CtaStep[];
    sidebarLabel?: I18nText | string;
    sidebarSubLabel?: I18nText | string;
    systemContext: string;            // stays plain string — English only
    openingPrompt?: string;           // stays plain string
}

// ═══════════════════════════════════════════════════════════════════════════
// THE DEMO SCRIPT
// ═══════════════════════════════════════════════════════════════════════════

export const DEMO_ACTS: DemoAct[] = [

    // ══════════════════════════════════════════════════════════════════════
    // ACT 0 — THE MIRROR (Tier 1)
    // "The factory looks fine. It is not."
    //
    // 3 steps, 3 clicks. Heavily auto-driven via <clck>.
    // The visitor watches a normal-looking factory and discovers the
    // invisible cost of not knowing. Then ARIA answers a live question.
    // Then the 03:47 incident seeds the full journey.
    //
    // simulationAction: 'reset-start' fires in Step 0 Phase 4 (after
    // screenText + ariaLocal finish). The factory comes alive visually
    // AFTER the "everything looks normal" text has primed the visitor.
    // By Step 1, the sim has run long enough for ariaApi data to exist.
    //
    // TIMING BUDGET:
    //   Step 0: ~35s screenText + ~8s ariaLocal + click = ~45s
    //   Step 1: ~8s screenText + ~5s ariaApi response + click = ~15s
    //   Step 2: ~30s screenText + ~5s ariaLocal + click = ~40s
    //   Total Tier 1: ~100 seconds (target)
    // ══════════════════════════════════════════════════════════════════════
    {
        id: 'mirror',
        eraLabel: { en: 'The Mirror', tr: 'Ayna' },
        eraEmoji: '🪞',
        targetHeightKey: 'tall',
        scenarioCode: 'SCN-001',

        /** All panels closed — pure 3D factory + text overlay */
        panelActions: [
            { panel: 'basicPanel',   state: 'close' },
            { panel: 'dtxfr',        state: 'close' },
            { panel: 'cwf',          state: 'close' },
            { panel: 'oeeHierarchy', state: 'close' },
            { panel: 'controlPanel', state: 'close' },
        ],

        /**
         * No sidebarLabel — Act 0 does not appear in the LED list.
         * The mirror is the entry experience, not a selectable stage.
         */

        systemContext: `
You are opening the demo for a solo web visitor arriving from ardic.ai.
This is the MIRROR act — Tier 1. The visitor has never heard of ARDICTECH,
may not understand OEE or digital twins, and is probably sceptical.

YOUR JOB: Make them feel the weight of money they are losing right now
in their own factory. No jargon. No product pitch. No brand mention.

Tone: quiet authority. An experienced factory consultant who has walked
the floor of hundreds of factories and seen the same silent losses everywhere.

CRITICAL: SCN-001 is running. ALL machine parameters within spec.
The ONLY variable is conveyor speed drift. NEVER mention defects,
quality grades, sorting, or machine parameter drift in this act.
The story is ONLY about invisible throughput loss and wasted energy.

Maximum 3 sentences per response. Every word must earn its place.
        `.trim(),

        /** No openingPrompt — Act 0 is the entry point. */
        openingPrompt: '',

                                                                                                                                                                                                                                                        ctaSteps: [
            { // Click #1
                ctaLabel: { en: 'Start →', tr: 'Başlat →' },
                scenarioCode: 'SCN-001',
                workOrderId: 'WorkID#3',
                delayMs: 800,
                screenText: {
                    en: `4,200 tiles per shift.\nSeven stations. One line.<w:2500><cls><w:500>This factory loses €47 every 20 seconds.\nNo alarm. No report. No one notices.<w:2500><cls><w:500>Every shift. Every day. Silently.<w:2000><clck>`,
                    tr: `Vardiyada 4.200 karo üretiliyor.\nYedi istasyon. Tek hat.<w:2500><cls><w:500>Bu fabrika her 20 saniyede €47 kaybediyor.\nAlarm yok. Rapor yok. Fark eden yok.<w:3000><cls><w:500>Her vardiya. Her gün. Sessizce.<w:2000><clck>`,
                },
                screenTextAlign: 'left',
                screenTextWeight: 'normal',
                screenTextSize: 'md',
                ariaLocal: {
                    en: `<cls><w:300>I am ARIA — this factory's intelligence layer.\n\nWhat you just read is not a worst case.\nIt is the everyday reality of factories running blind.\n\nThe factory behind me is starting now.\n→ Click to ask it a question.`,
                    tr: `<cls><w:300>Ben ARIA — bu fabrikanın zeka katmanı.\n\nAz önce okuduğunuz en kötü senaryo değil.\nGörünürlüğü olmayan fabrikaların günlük gerçeği.\n\nArkamdaki fabrika şimdi başlıyor.\n→ Fabrikaya bir soru sormak için tıklayın.`,
                },
                ariaLocalSize: 'sm',
                ariaInputEnabled: false,
                simulationAction: 'reset-start',
                editorHeights: { screenText: 141, ariaLocal: 112, ariaApi: 42 },
            },
            { // Click #2
                ctaLabel: { en: 'Ask the factory →', tr: 'Fabrikaya sor →' },
                screenText: {
                    en: `<cls><w:400>What if you could just ask?<w:1500><clck>`,
                    tr: `<cls><w:400>Ya sadece sorabilseydiniz?<w:1500><clck>`,
                },
                screenTextAlign: 'left',
                ariaLocal: {
                    en: `<cls><w:300>📊 Throughput: 3,840 tiles/hour — 8.6% below plan.\nConveyor drift averaging 0.91x nominal.\n\nKiln and Dryer burning energy during every speed dip.\nSession loss so far: ~€94.\nAnnual projection: ~€206,000.\n\nThat answer took 3 seconds. No analyst. No report.`,
                    tr: `<cls><w:300>📊 Üretim hızı: 3.840 karo/saat — plandan %8,6 düşük.\nKonveyör sapması ortalama 0,91x nominal.\n\nHer hız düşüşünde Fırın ve Kurutucu enerji yakıyor.\nBu oturumdaki kayıp: ~€94.\nYıllık projeksiyon: ~€206.000.\n\nBu cevap 3 saniye sürdü. Analist yok. Rapor yok.`,
                },
                ariaLocalSize: 'sm',
                ariaInputEnabled: false,
                panelActions: [
                    { panel: 'cwf', state: 'open' },
                ],
                editorHeights: { screenText: 144, ariaLocal: 112, ariaApi: 42 },
            },
            { // Click #3
                ctaLabel: { en: 'Continue →', tr: 'Devam →' },
                screenText: {
                    en: `<cls><w:500>That answer came from live data.<w:2000><cls><w:400>03:47 AM. Night shift.\nKiln drifts above spec. No one notices.<w:2500><cls><w:400>03:48 — Detected.\n03:48 — Root cause found.\n03:49 — Corrected. Automatically.<w:2500><cls><w:400>No one woke up.\n~1,900 kg CO₂ prevented.<w:3000><clck>`,
                    tr: `<cls><w:500>Bu cevap canlı veriden geldi.<w:2000><cls><w:400>03:47. Gece vardiyası.\nFırın spesifikasyonun üstüne çıkıyor. Fark eden yok.<w:3000><cls><w:400>03:48 — Tespit edildi.\n03:48 — Kök neden bulundu.\n03:49 — Otomatik düzeltildi.<w:2500><cls><w:400>Kimse uyanmadı.\n~1.900 kg CO₂ önlendi.<w:2000><clck>`,
                },
                screenTextAlign: 'left',
                screenTextWeight: 'normal',
                screenTextSize: 'md',
                ariaLocal: {
                    en: `<cls><w:300>Three things most factory owners never see:\n\n1. The silent cost of running blind\n2. A factory that answers in plain language\n3. A system that corrects before humans notice\n\n→ Click to walk through the full journey.`,
                    tr: `<cls><w:300>Fabrika sahiplerinin çoğunun hiç görmediği üç şey:\n\n1. Kör çalışmanın sessiz maliyeti\n2. Düz bir dille cevap veren fabrika\n3. İnsan fark etmeden düzelten sistem\n\n→ Tam yolculuk için tıklayın.`,
                },
                ariaLocalSize: 'sm',
                ariaInputEnabled: true,
                panelActions: [
                    { panel: 'cwf', state: 'close' },
                ],
                transitionTo: 'next',
                editorHeights: { screenText: 142, ariaLocal: 113, ariaApi: 42 },
            },
        ],
    },


    // ══════════════════════════════════════════════════════════════════════
    // ACT 1 — NO MANAGEMENT SYSTEM
    // "The factory looks fine. The tragedy is invisible."
    //
    // TIER 2 ENTRY POINT. The visitor chose "Continue."
    // SCN-001 continues — conveyor speed drift ONLY.
    // 2 steps (reduced from 4). All panels closed.
    // The conveyor speed chart is the hero visual.
    //
    // NEVER mention defects, quality grades, or sorting.
    // Loss = throughput gap + energy burned during idle.
    // ══════════════════════════════════════════════════════════════════════
    {
        id: 'no-management',
        eraLabel: { en: 'No System', tr: 'Sistem Yok' },
        eraEmoji: '🏭',
        targetHeightKey: 'medium',
        scenarioCode: null,   // SCN-001 already loaded from Act 0

        /** All panels closed — factory with zero digital tools */
        panelActions: [
            { panel: 'basicPanel',   state: 'close' },
            { panel: 'dtxfr',        state: 'close' },
            { panel: 'cwf',          state: 'close' },
            { panel: 'oeeHierarchy', state: 'close' },
            { panel: 'controlPanel', state: 'close' },
        ],

        sidebarLabel: { en: 'No System', tr: 'Sistem Yok' },

        systemContext: `
TIER 2, Act 1. The visitor chose the full journey. They have already seen the
Tier 1 mirror (invisible loss, CWF wow moment, 03:47 teaser). Now they are
walking through the stages.

We are in the "No Management System" era. SCN-001 is running — ALL machine
parameters are perfectly within specification. The ONLY variable is conveyor
speed drift: the belt occasionally slows without any operator noticing.

During conveyor slowdowns:
- The Kiln runs on natural gas continuously (thermal inertia prevents shutdown)
- The Dryer runs on electricity continuously for the same reason
- Tiles move slower = fewer tiles per hour = throughput gap vs plan
- Energy is burned producing nothing during the drift

CRITICAL: NEVER mention defects, second quality, scrap, sorting, quality grades,
or machine parameter issues. ONLY throughput loss and wasted energy.

Tone: quiet revelation. The visitor now sees what they already suspected.
Maximum 4 sentences per response.
        `.trim(),

        openingPrompt: '',

                                                                                                                                                                                                                                                        ctaSteps: [
            { // Click #1
                ctaLabel: { en: 'Show me →', tr: 'Göster →' },
                mediaInstruction: 'chart:conveyor_speed',
                delayMs: 1000,
                screenText: {
                    en: `<w:300>Conveyor speed. Real time.<MI><w:4000>Every dip: energy in. Zero output. No record.<w:2500><clck>`,
                    tr: `<w:300>Konveyör hızı. Gerçek zamanlı.<MI><w:4000>Her düşüş: enerji giriyor. Sıfır çıktı. Kayıt yok.<w:3000><clck>`,
                },
                screenTextAlign: 'left',
                screenTextWeight: 'normal',
                screenTextSize: 'sm',
                ariaLocal: {
                    en: `<cls><w:300>Speed: 0.87x nominal.\nOutput: 3,650 tiles/hr vs 4,200 theoretical.\nGap: 550 tiles/hr — 13.1% below plan.\n\nLast dip (12s at 0.6x): €0.93 energy, 14 tiles lost.\nNo alarm. No log.\n→ What if we had a dashboard?`,
                    tr: `<cls><w:300>Hız: 0,87x nominal.\nÇıktı: 3.650 karo/saat vs 4.200 teorik.\nFark: 550 karo/saat — plandan %13,1 düşük.\n\nSon düşüş (0,6x'te 12 sn): €0,93 enerji, 14 karo kaybı.\nAlarm yok. Kayıt yok.\n→ Ya bir panomuz olsaydı?`,
                },
                ariaLocalSize: 'sm',
                ariaInputEnabled: true,
                panelActions: [
                    { panel: 'controlPanel', state: 'open' },
                ],
                editorHeights: { screenText: 167, ariaLocal: 134, ariaApi: 127 },
            },
            { // Click #2
                ctaLabel: { en: 'Add a dashboard →', tr: 'Pano ekle →' },
                screenText: {
                    en: `<cls><clmi><w:500>10 million tiles/year.\n3% drift = €180K–€240K lost annually.\nBefore counting wasted energy.<w:2500><clck>`,
                    tr: `<cls><clmi><w:500>Yılda 10 milyon karo.\n%3 sapma = yılda €180K–€240K kayıp.\nBoşa harcanan enerji hariç.<w:3000><clck>`,
                },
                screenTextAlign: 'left',
                screenTextWeight: 'normal',
                screenTextSize: 'md',
                ariaLocal: {
                    en: `<cls><w:300>No report filed. No alarm triggered.\nIt happened. Cost money. Disappeared.\n\nNot a catastrophe. A slow, silent drain.\n→ Add a dashboard.`,
                    tr: `<cls><w:300>Rapor yok. Alarm yok.\nOldu. Para kaybettirdi. Kayboldu.\n\nFelaket değil. Yavaş, sessiz bir erime.\n→ Pano ekleyelim.`,
                },
                ariaLocalSize: 'sm',
                ariaInputEnabled: false,
                panelActions: [
                    { panel: 'controlPanel', state: 'close' },
                ],
                transitionTo: 'next',
                editorHeights: { screenText: 175, ariaLocal: 134, ariaApi: 128 },
            },
        ],
    },


    // ══════════════════════════════════════════════════════════════════════
    // ACT 2 — BASIC MANAGEMENT SYSTEM
    // "We can see the score. We cannot see the game."
    // SCN-001 still. basicPanel opens. Numbers without root cause.
    // 2 steps. STILL no mention of defects/quality/sorting.
    // ══════════════════════════════════════════════════════════════════════
    {
        id: 'basic-system',
        eraLabel: { en: 'Basic System', tr: 'Temel Sistem' },
        eraEmoji: '📊',
        targetHeightKey: 'medium',
        scenarioCode: 'SCN-001',

        panelActions: [
            { panel: 'basicPanel',   state: 'close' },
            { panel: 'dtxfr',        state: 'close' },
            { panel: 'cwf',          state: 'close' },
            { panel: 'oeeHierarchy', state: 'close' },
            { panel: 'controlPanel', state: 'close' },
        ],

        sidebarLabel: { en: 'Basic Management', tr: 'Temel Yönetim' },

        systemContext: `
TIER 2, Act 2. Basic Panel is about to open.

The audience can see OEE (typically 82–92%), throughput count, and energy figures.
They CANNOT see: when exactly the belt slowed, whether it is trending worse,
the energy cost per idle period, or ANY root cause explanation.

Make the distinction between "seeing a number" and "understanding its cause" razor-sharp.

CRITICAL: Still SCN-001. Still ONLY conveyor speed drift. NEVER mention defects,
second quality, scrap, or machine parameter issues.

Tone: frustrated empathy. "You can see the number. You cannot explain it."
Maximum 4 sentences per response.
        `.trim(),

        openingPrompt: '',

                                                                                                                                                                                                                                                        ctaSteps: [
            { // Click #1
                ctaLabel: { en: 'Show dashboard →', tr: 'Panoyu göster →' },
                slideImageUrl: '/demo/ACT-2.png',
                delayMs: 1000,
                screenText: {
                    en: `OEE. Throughput. Energy.\nAll visible now.<w:2000>\nBut can we explain any of them?<w:1500><clck>`,
                    tr: `OEE. Verimlilik. Enerji.\nArtık hepsi görünür.<w:2000>\nAma herhangi birini açıklayabilir miyiz?<w:2000><clck>`,
                },
                screenTextSize: 'md',
                ariaLocal: {
                    en: `<cls><w:300>OEE: 87.3%. Throughput: 3,814/hr.\nEnergy: 142.7 kWh this session.\n\nLooks reasonable. But:\nWhen did the belt slow? Is it trending worse?\nWhich station? What caused it?\nThe dashboard cannot answer.`,
                    tr: `<cls><w:300>OEE: %87,3. Üretim: 3.814/saat.\nEnerji: 142,7 kWh bu oturum.\n\nMakul görünüyor. Ama:\nKayış ne zaman yavaşladı? Kötüleşiyor mu?\nHangi istasyon? Nedeni ne?\nPano cevaplayamaz.`,
                },
                ariaLocalSize: 'sm',
                ariaInputEnabled: true,
                panelActions: [
                    { panel: 'basicPanel', state: 'open' },
                ],
                editorHeights: { screenText: 155, ariaLocal: 118, ariaApi: 52 },
            },
            { // Click #2
                ctaLabel: { en: 'Go deeper →', tr: 'Derine in →' },
                screenText: {
                    en: `<cls><w:500>OEE 87%. Good? Bad? Getting worse?\nWhich machine? Since when?\n\nThe dashboard is silent.<w:2000><clck>`,
                    tr: `<cls><w:500>OEE %87. İyi mi? Kötü mü? Kötüleşiyor mu?\nHangi makine? Ne zamandan beri?\n\nPano sessiz.<w:2500><clck>`,
                },
                screenTextWeight: 'normal',
                screenTextSize: 'md',
                ariaLocal: {
                    en: `<cls><w:300>They see the score. Not the game.\n\nNo root cause. No trend. No breakdown by station.\nThe answer needs something fundamentally different.\nNot more dashboards. Traceability.\n→ Continue`,
                    tr: `<cls><w:300>Skoru görüyorlar. Oyunu değil.\n\nKök neden yok. Trend yok. İstasyon bazlı analiz yok.\nCevap temelden farklı bir şey gerektiriyor.\nDaha fazla pano değil. İzlenebilirlik.\n→ Devam`,
                },
                ariaLocalSize: 'sm',
                ariaInputEnabled: true,
                transitionTo: 'next',
                editorHeights: { screenText: 155, ariaLocal: 119, ariaApi: 52 },
            },
        ],
    },


    // ══════════════════════════════════════════════════════════════════════
    // ACT 3 — DIGITAL TWIN & TILE PASSPORT
    // "Every tile has a complete story. Now we can read it."
    // SCN-002: Kiln Temperature Crisis (+14°C). DTXFR opens.
    // CO₂ thread opens: 18% more gas, embedded carbon in rework.
    // 2 steps. Show passport FIRST, then explain.
    // ══════════════════════════════════════════════════════════════════════
    {
        id: 'digital-twin',
        eraLabel: { en: 'Digital Twin', tr: 'Dijital İkiz' },
        eraEmoji: '🔗',
        targetHeightKey: 'tall',
        scenarioCode: 'SCN-002',

        panelActions: [
            { panel: 'basicPanel', state: 'close' },
            { panel: 'dtxfr',      state: 'open' },
        ],

        sidebarLabel: { en: 'Digital Twin', tr: 'Dijital İkiz' },

        systemContext: `
TIER 2, Act 3. SCN-002 (Kiln Temperature Crisis) just loaded.
Kiln running ~14°C above specification. DTXFR Tile Passport is open.

Sorting is catching ALL affected tiles. The customer sees NOTHING wrong. But:
- Scrap tiles: 100% loss — material + energy + labour, zero revenue
- Second quality tiles: manufacturer pays 40–60% of production cost AGAIN at rework.
  Some recovered, some become scrap. Either way: paid twice.

CO₂ THREAD OPENS HERE:
- Kiln at +14°C consumes ~18% more natural gas
- Gas = 1.9 kg CO₂ per m³ — every affected tile carries excess embedded carbon
- Second-quality tiles carry that carbon to rework, where MORE CO₂ is added
- Quality cost and carbon cost share the same root cause

NEVER say "customer received defective tiles."
Tone: controlled revelation — this is the discovery beat.
Maximum 5 sentences per response.
        `.trim(),

        openingPrompt: '',

                                                                                                                                                                                                                                                        ctaSteps: [
            { // Click #1
                ctaLabel: { en: 'Show the crisis →', tr: 'Krizi göster →' },
                slideImageUrl: '/demo/ACT-3.png',
                screenText: {
                    en: `Kiln: +14°C above spec.<w:2000>\nEvery tile has a digital passport.<w:1500><clck>`,
                    tr: `Fırın: spesifikasyonun +14°C üstünde.<w:2000>\nHer karonun dijital pasaportu var.<w:2000><clck>`,
                },
                screenTextAlign: 'left',
                screenTextSize: 'md',
                ariaLocal: {
                    en: `<cls><w:300>SCN-002 active. Kiln running 14°C above spec.\nThe Tile Passport shows every station record.\n\n+14°C = 18% more gas. 1.9 kg CO₂/m³.\nEvery affected tile carries excess carbon.\nSecond quality = paid twice. Scrap = total loss.`,
                    tr: `<cls><w:300>SCN-002 aktif. Fırın spesifikasyonun 14°C üstünde.\nKaro Pasaportu her istasyonun kaydını gösteriyor.\n\n+14°C = %18 daha fazla gaz. 1,9 kg CO₂/m³.\nEtkilenen her karo fazla karbon taşıyor.\nİkinci kalite = iki kez ödeme. Hurda = tam kayıp.`,
                },
                ariaLocalSize: 'sm',
                ariaApi: `Tiles through kiln so far, how many show quality issues.CO₂ impact: kiln ~100 m³ gas/hour, +18% at 14°C overshoot,1.9 kg CO₂/m³. Give energy waste and excess CO₂ this session.Also note: second-quality tiles cost 40-60% of production cost again at rework,and carry excess embedded carbon to the rework facility.`,
                ariaInputEnabled: true,
                editorHeights: { screenText: 123, ariaLocal: 141, ariaApi: 125 },
            },
            { // Click #2
                ctaLabel: { en: 'Ask the factory →', tr: 'Fabrikaya sor →' },
                screenText: {
                    en: `<cls><w:500>Affected tile → rework → second energy cycle → more CO₂.\nQuality cost and carbon cost: same root cause.<w:2500><clck>`,
                    tr: `<cls><w:500>Etkilenen karo → yeniden işleme → ikinci enerji döngüsü → daha fazla CO₂.\nKalite maliyeti ve karbon maliyeti: aynı kök neden.<w:3000><clck>`,
                },
                screenTextAlign: 'left',
                screenTextWeight: 'normal',
                screenTextSize: 'sm',
                ariaLocal: {
                    en: `<cls><w:300>Second quality: 40–60% of production cost paid again.\nSome recovered. Some scrapped at rework. Either way: paid twice.\n\nSame tile carries excess carbon to rework.\nOne fix solves both.\n→ What if you could ask the factory?`,
                    tr: `<cls><w:300>İkinci kalite: üretim maliyetinin %40–60'ı tekrar ödenir.\nBazıları kurtarılır. Bazıları hurdaya gider. Her iki durumda: iki kez ödeme.\n\nAynı karo fazla karbonu yeniden işlemeye taşır.\nTek düzeltme ikisini de çözer.\n→ Ya fabrikaya sorabilseydiniz?`,
                },
                ariaLocalSize: 'sm',
                ariaInputEnabled: true,
                transitionTo: 'next',
                editorHeights: { screenText: 122, ariaLocal: 142, ariaApi: 122 },
            },
        ],
    },


    // ══════════════════════════════════════════════════════════════════════
    // ACT 4 — CHAT WITH FACTORY (CWF)
    // "Ask the factory anything. In plain language. Right now."
    // SCN-003: Glaze Viscosity Drift. CWF panel opens.
    // 3 steps: CEO query, Sustainability query, parameter change demo.
    // Interactive: visitor can type their own questions.
    // ══════════════════════════════════════════════════════════════════════
    {
        id: 'chat-with-factory',
        eraLabel: { en: 'CWF', tr: 'CWF' },
        eraEmoji: '💬',
        targetHeightKey: 'tall',
        scenarioCode: 'SCN-003',

        panelActions: [
            { panel: 'dtxfr', state: 'close' },
            { panel: 'cwf',   state: 'open' },
        ],

        sidebarLabel: { en: 'CWF', tr: 'CWF' },
        sidebarSubLabel: { en: 'Chat With Factory', tr: 'Fabrikanla Konuş' },

        systemContext: `
TIER 2, Act 4. SCN-003 (Glaze Viscosity Drift) is active. Subtle defect —
glaze viscosity slightly off, second-quality rate rising slowly. Easy to
attribute to "normal variation" until it becomes expensive.

CWF panel is open. The visitor can type questions in plain language.

Role query framework for this act:
🏢 CEO / Factory Owner: "How much money are we losing?"
🌿 Sustainability: "What is our carbon intensity per 1,000 tiles?"

Key insight: the knowledge of 15 years of experienced engineers is now
available to everyone, at any hour, in plain language. This is organisational
resilience. CO₂ is now queryable — as accessible as OEE or quality data.

Maximum 5 sentences per response.
        `.trim(),

        openingPrompt: '',

                                                                                                                                                                                                                                                        ctaSteps: [
            { // Click #1
                ctaLabel: { en: 'Ask as CEO →', tr: 'CEO olarak sor →' },
                slideImageUrl: '/demo/ACT-4a.png',
                screenText: {
                    en: `Glaze Viscosity Drift.\nSubtle. Slow-building.<w:2000>\nThe factory owner asks first.<w:1500><clck>`,
                    tr: `Sır Viskozite Sapması.\nİnce. Yavaş gelişen.<w:2000>\nFabrika sahibi ilk soruyu soruyor.<w:2000><clck>`,
                },
                screenTextAlign: 'left',
                screenTextWeight: 'normal',
                screenTextSize: 'md',
                ariaLocal: {
                    en: `<cls><w:300>SCN-003 active. Glaze viscosity slightly off.\nCWF panel open. Ask anything in plain language.\n\n15 years of engineering knowledge,\naccessible to anyone, any hour, any language.`,
                    tr: `<cls><w:300>SCN-003 aktif. Sır viskozitesi hafif sapmalı.\nCWF paneli açık. Düz bir dille her şeyi sorun.\n\n15 yıllık mühendislik bilgisi,\nherkesin erişimine açık, her saat, her dilde.`,
                },
                ariaLocalSize: 'sm',
                ariaApi: `The CWF panel is now open — the visitor can ask the factory anything in plainlanguage. This is 15 years of engineering knowledge accessible to anyone, at anyhour. First question, from the factory owner: 🏢 What is our quality situation?How much is glaze viscosity drift costing us — double-cost from second-qualitytiles (40-60% of production cost at rework)? Production window before critical?`,
                ariaInputEnabled: true,
                editorHeights: { screenText: 104, ariaLocal: 125, ariaApi: 140 },
            },
            { // Click #2
                ctaLabel: { en: 'Ask about CO₂ →', tr: 'CO₂ sor →' },
                slideImageUrl: '/demo/ACT-4b.png',
                delayMs: 2000,
                screenText: {
                    en: `<cls><w:500>Different role. Same factory. Same data.<w:1500><clck>`,
                    tr: `<cls><w:500>Farklı rol. Aynı fabrika. Aynı veri.<w:1500><clck>`,
                },
                screenTextWeight: 'normal',
                screenTextSize: 'md',
                ariaApi: `🌿 CO₂ intensity per 1,000 tiles this session.Glaze drift contribution: direct energy + CO₂ in second-quality tiles sentto rework. Factors: 0.4 kg/kWh, 1.9 kg/m³. Compare to SCN-001 optimal.`,
                ariaInputEnabled: true,
                editorHeights: { screenText: 107, ariaLocal: 120, ariaApi: 139 },
            },
            { // Click #3
                ctaLabel: { en: 'Change a parameter →', tr: 'Parametre değiştir →' },
                slideImageUrl: '/demo/ACT-4c.png',
                delayMs: 5500,
                screenText: {
                    en: `<cls><w:500>You don't just ask questions.\nYou give instructions.<w:2000><clck>`,
                    tr: `<cls><w:500>Sadece soru sormuyorsunuz.\nTalimat veriyorsunuz.<w:2000><clck>`,
                },
                ariaLocal: {
                    en: `<cls><w:300>💬 In the CWF panel, type:\n"Increase glaze cabin pressure to 0.9 bar"\n\nAuth code: ardic\n\nParameter changes live. No shutdown. No phone call.\nIntent → Auth → Action. Under 30 seconds.\n→ Now watch it do this itself.`,
                    tr: `<cls><w:300>💬 CWF panelinde şunu yazın:\n"Sır kabin basıncını 0.9 bar'a yükselt"\n\nYetki kodu: ardic\n\nParametre canlı değişir. Duruş yok. Telefon yok.\nNiyet → Yetki → Aksiyon. 30 saniyenin altında.\n→ Şimdi bunu kendi kendine yapmasını izleyin.`,
                },
                ariaLocalSize: 'sm',
                ariaInputEnabled: true,
                transitionTo: 'next',
                editorHeights: { screenText: 104, ariaLocal: 120, ariaApi: 138 },
            },
        ],
    },


    // ══════════════════════════════════════════════════════════════════════
    // ACT 5 — AUTONOMOUS AI COPILOT
    // "At 03:47, the Copilot acted. Before anyone woke up."
    // SCN-004: Multi-Station Cascade. Copilot auto-enabled.
    // The incident log is the centrepiece.
    // 2 steps. The log is delivered as openingPrompt to Gemini.
    // ══════════════════════════════════════════════════════════════════════
    {
        id: 'autonomous-ai',
        eraLabel: { en: 'Autonomous AI', tr: 'Otonom Yapay Zeka' },
        eraEmoji: '🤖',
        targetHeightKey: 'large',
        scenarioCode: 'SCN-004',

        panelActions: [
            { panel: 'cwf',          state: 'open' },
            { panel: 'oeeHierarchy', state: 'open' },
        ],

        enableCopilot: true,

        sidebarLabel: { en: 'Autonomous AI', tr: 'Otonom Yapay Zeka' },
        sidebarSubLabel: { en: 'Copilot', tr: 'Copilot' },

        systemContext: `
TIER 2, Act 5. SCN-004 (Multi-Station Cascade Failure) is active.
Press and Kiln failing simultaneously. Copilot is auto-enabled.

NARRATIVE DEVICE: Read the timestamped incident log as if reading from a real
system log. Tone: quiet awe and controlled precision. Precision IS the power.

Incident log (use exact timestamps and values):
03:47:00 — Press pressure: 296 bar (+12% above spec = 285 bar)
03:47:23 — ANOMALY DETECTED. Kiln thermal drift trajectory calculated.
03:48:01 — Root cause confirmed: press pressure → kiln temperature cascade
03:48:45 — CORRECTIONS APPLIED: press 296→284 bar, kiln setpoint −8°C. No human.
03:51:12 — Recovery trajectory confirmed. First-quality rate returning.
03:53:40 — ALL PARAMETERS WITHIN SPEC. Recovery complete.
Tiles in drift window: 61 (48 second quality → rework, 13 scrap → recycled)
CO₂ overrun prevented: ~1,900 kg
Duration: 6 minutes 40 seconds. Filed automatically.

The customer received only first-quality tiles.
The Copilot did not alert someone — it acted.
        `.trim(),

        openingPrompt: '',

                                                                                                                                                                                                                                                        ctaSteps: [
            { // Click #1
                ctaLabel: { en: 'Show the incident →', tr: 'Olayı göster →' },
                slideImageUrl: '/demo/ACT-4d.png',
                screenText: {
                    en: `Cascade Failure. Press + Kiln.<w:2000>\nCopilot active. Watch.<w:1500><clck>`,
                    tr: `Kaskad Arıza. Pres + Fırın.<w:2000>\nCopilot aktif. İzleyin.<w:1500><clck>`,
                },
                screenTextAlign: 'left',
                screenTextSize: 'md',
                ariaLocal: {
                    en: `<cls><w:500>📋 INCIDENT LOG\n\n03:47:00 — Press: 296 bar (+12% above spec)\n03:47:23 — ANOMALY DETECTED\n03:48:01 — Root cause: press → kiln cascade\n03:48:45 — CORRECTED. Press 296→284, kiln −8°C\n03:51:12 — Recovery confirmed\n03:53:40 — ALL WITHIN SPEC\n\n61 tiles affected. ~1,900 kg CO₂ prevented.\nDuration: 6 min 40 sec. Filed automatically.\n\nCustomer received only first-quality tiles.\nThe Copilot did not alert someone — it acted.`,
                    tr: `<cls><w:500>📋 OLAY KAYDI\n\n03:47:00 — Pres: 296 bar (spesifikasyonun %12 üstü)\n03:47:23 — ANOMALİ TESPİT EDİLDİ\n03:48:01 — Kök neden: pres → fırın kaskadı\n03:48:45 — DÜZELTİLDİ. Pres 296→284, fırın −8°C\n03:51:12 — Toparlanma onaylandı\n03:53:40 — TÜM PARAMETRELER SPESDE\n\n61 karo etkilendi. ~1.900 kg CO₂ önlendi.\nSüre: 6 dk 40 sn. Otomatik arşivlendi.\n\nMüşteri yalnızca birinci kalite karo aldı.\nCopilot birini uyarmadı — kendisi müdahale etti.`,
                },
                ariaLocalSize: 'sm',
                ariaInputEnabled: true,
                editorHeights: { screenText: 93, ariaLocal: 205, ariaApi: 42 },
            },
            { // Click #2
                ctaLabel: { en: 'Next', tr: 'İleri' },
                screenText: {
                    en: `OEE Hierarchy: the cascade impact.<w:2000>\nWatch the numbers.<w:1500><clck>`,
                    tr: `OEE Hiyerarşisi: kaskad etkisi.<w:2000>\nRakamlara bakın.<w:1500><clck>`,
                },
                screenTextAlign: 'left',
                screenTextWeight: 'normal',
                screenTextSize: 'sm',
                ariaLocal: {
                    en: `<cls><w:300>Factory OEE during cascade: 38.2%\n\nLine 1 (Press→Printer): 41.3%\nLine 3 (Kiln→Packaging): 33.7%\nLine 2 (Conveyor): 52.1%\n\nAt 10M tiles/year: €1.1M–€2.1M monthly gap.\nRecovered in 6 minutes 40 seconds.`,
                    tr: `<cls><w:300>Kaskad sırasında fabrika OEE: %38,2\n\nHat 1 (Pres→Baskı): %41,3\nHat 3 (Fırın→Paketleme): %33,7\nHat 2 (Konveyör): %52,1\n\nYılda 10M karo üretimde: aylık €1,1M–€2,1M fark.\n6 dakika 40 saniyede toparlama.`,
                },
                ariaLocalSize: 'sm',
                ariaInputEnabled: true,
                editorHeights: { screenText: 94, ariaLocal: 180, ariaApi: 42 },
            },
            { // Click #3
                ctaLabel: { en: 'Closing question →', tr: 'Kapanış sorusu →' },
                screenText: {
                    en: `<cls><w:500>Not because someone was paged.\nBecause the system acted first.<w:2500><cls><w:400>Conventional: detect 2–4 hrs. Fix: next shift.\nHere: detect 23 sec. Fix: 6 min 40 sec.\n\nDifference: 847 tiles. €12,400.<w:3000><clck>`,
                    tr: `<cls><w:500>Biri çağrıldığı için değil.\nSistem ilk harekete geçtiği için.<w:2500><cls><w:400>Geleneksel: tespit 2–4 saat. Düzeltme: sonraki vardiya.\nBurada: tespit 23 sn. Düzeltme: 6 dk 40 sn.\n\nFark: 847 karo. €12.400.<w:3000><clck>`,
                },
                screenTextAlign: 'left',
                screenTextWeight: 'normal',
                screenTextSize: 'md',
                ariaLocal: {
                    en: `<cls><w:300>At 03:47, every operator was elsewhere.\n23 seconds to detect. 38 seconds to trace.\n6 minutes 40 seconds to full recovery.\n\n~1,900 kg CO₂ not emitted. 61 tiles recovered.\nNo special team. The right foundation.\n→ One final question.`,
                    tr: `<cls><w:300>03:47'de her operatör başka bir yerdeydi.\nTespit: 23 saniye. İzleme: 38 saniye.\nTam toparlanma: 6 dakika 40 saniye.\n\n~1.900 kg CO₂ salınmadı. 61 karo kurtarıldı.\nÖzel ekip gerekmedi. Doğru altyapı yetti.\n→ Son bir soru.`,
                },
                ariaLocalSize: 'sm',
                ariaInputEnabled: true,
                transitionTo: 'next',
                editorHeights: { screenText: 95, ariaLocal: 174, ariaApi: 42 },
            },
        ],
    },


    // ══════════════════════════════════════════════════════════════════════
    // ACT 6 — FINANCIAL CLOSE
    // "The question is not whether to transform. It is how much
    //  longer to wait."
    //
    // The closing question IS the mechanism.
    // Soft mirror: reflect their own production gap back as a question.
    // ══════════════════════════════════════════════════════════════════════
    {
        id: 'close',
        eraLabel: { en: 'Close', tr: 'Kapanış' },
        eraEmoji: '💰',
        targetHeightKey: 'tall',
        scenarioCode: null,

        panelActions: [
            { panel: 'oeeHierarchy', state: 'open' },
        ],

        sidebarLabel: { en: 'Close', tr: 'Kapanış' },

        systemContext: `
Financial close. OEE Hierarchy shows post-Copilot recovered OEE.
Translate the entire journey into precise business language.

Financial model:
- €8,000–€15,000 per 1% OEE improvement per line per month
- Typical recovery: 3–5 OEE points in first operational quarter
- Second-quality elimination = double-cost removed AND CO₂ liability removed
- Carbon traceability = compliance advantage 12–18 months ahead of late movers

CLOSE STYLE: soft mirror — reflect the visitor's own production gap back
as a question. NO competitor names. NO manufactured urgency.
The question IS the mechanism. Precise, credible, quiet conviction.
Maximum 5 sentences per response.
        `.trim(),

        openingPrompt: '',

                                                                                                                                                                                                                                                        ctaSteps: [
            { // Click #1
                ctaLabel: { en: 'Show the gain', tr: 'Kazancı göster' },
                slideImageUrl: '/demo/AiPoweredCF-3.png',
                delayMs: 2800,
                screenText: {
                    en: `Factory → Line → Machine → Parameter.<w:2000>\nEvery number has a cause. Every cause has a cost.<w:2000><clck>`,
                    tr: `Fabrika → Hat → Makine → Parametre.<w:2000>\nHer rakamın bir nedeni var. Her nedenin bir maliyeti.<w:2500><clck>`,
                },
                screenTextSize: 'md',
                ariaLocal: {
                    en: `<cls><w:300>€8K–€15K per 1% OEE, per line, per month.\nTypical first-quarter recovery: 3–5 points.\n\nEliminating second quality removes the double cost\nAND the CO₂ liability. Same intervention.\n\nHow much of your production cost goes to losses\nyou cannot currently see?`,
                    tr: `<cls><w:300>Hat başına, ayda, %1 OEE iyileştirme = €8K–€15K.\nİlk çeyrekte tipik toparlanma: 3–5 puan.\n\nİkinci kaliteyi ortadan kaldırmak çifte maliyeti\nVE CO₂ yükümlülüğünü aynı anda siler.\n\nÜretim maliyetinizin ne kadarı\nşu an göremediğiniz kayıplara gidiyor?`,
                },
                ariaLocalSize: 'sm',
                ariaInputEnabled: false,
                panelActions: [
                    { panel: 'cwf', state: 'close' },
                    { panel: 'oeeHierarchy', state: 'close' },
                ],
                editorHeights: { screenText: 179, ariaLocal: 155 },
            },
            { // Click #2
                ctaLabel: { en: 'Thank you!', tr: 'Teşekkürler!' },
                slideImageUrl: '/demo/SentialFactory.png',
                delayMs: 1000,
                screenText: {
                    en: `<cls><w:500>How much waste did your factory produce last year?\n\nIf you don't know — that's exactly where we start.<w:3000><clck>`,
                    tr: `<cls><w:500>Fabrikanız geçen yıl ne kadar fire üretti?\n\nBilmiyorsanız — tam olarak buradan başlıyoruz.<w:3000><clck>`,
                },
                screenTextSize: 'md',
                ariaLocal: {
                    en: `<cls><w:300>Thank you for walking through this journey.\n\nIf something resonated — the invisible loss,\nthe double cost, the CO₂, or the 03:47 incident —\nthat instinct is worth exploring.\n\nARDICTECH. Since 2008. 16 facilities. 1M+ IoT endpoints.\n→ ardic.ai`,
                    tr: `<cls><w:300>Bu yolculuğa zaman ayırdığınız için teşekkürler.\n\nBir şey yankı uyandırdıysa — görünmeyen kayıp,\nçifte maliyet, CO₂ veya 03:47 olayı —\no his keşfetmeye değer.\n\nARDICTECH. 2008'den bu yana. 16 tesis. 1M+ IoT uç noktası.\n→ ardic.ai`,
                },
                ariaLocalSize: 'sm',
                ariaInputEnabled: false,
                panelActions: [
                    { panel: 'cwf', state: 'close' },
                    { panel: 'oeeHierarchy', state: 'close' },
                ],
                editorHeights: { screenText: 180, ariaLocal: 157 },
            },
        ],
    },
];
