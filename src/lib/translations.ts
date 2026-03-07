/**
 * translations.ts — Bilingual Translation Dictionary (TR/EN)
 *
 * Central repository for all translatable strings in the application.
 * Organized by component/section (header, controlPanel, kpiPane, etc.).
 *
 * Each entry follows the pattern:
 *   key: { tr: "Turkish text", en: "English text" }
 *
 * Sections:
 *  - header — top navigation bar labels
 *  - controlPanel — control panel sliders, buttons, status labels
 *  - kpiPane — KPI panel title and card descriptions
 *  - tilePassport — tile detail panel labels
 *  - defects — defect heatmap title
 *  - playbook — factory process guide (nested arrays of objects)
 *
 * Accessed via: useTranslation(section) hook or directly for nested data.
 * Used by: all UI components that display text
 */
export const translations = {
  header: {
    title: {
      tr: "Seramik Karo Üretim - Dijital İkiz",
      en: "Ceramic Tile Production - Digital Twin",
    },
    subtitle: {
      tr: "IoT-Ignite + ArMES/MOM + ArAI Entegrasyonu",
      en: "IoT-Ignite + ArMES/MOM + ArAI Integration",
    },
    start: { tr: "Başlat", en: "Start" },
    stop: { tr: "Durdur", en: "Stop" },
    /** Shown on the Start/Stop button while drain mode is active (belt finishing) */
    draining: { tr: "Boşaltılıyor…", en: "Draining…" },
    reset: { tr: "Sıfırla", en: "Reset" },
    alarmLog: { tr: "Alarm Kaydı", en: "Alarm Log" },
    demoSettings: { tr: "Demo Ayarları", en: "Demo Settings" },
    controlActions: { tr: "Konveyör Kontrol", en: "Conveyor Control" },
  },

  /**
   * simGate — Demo Settings Gate flow translations.
   * Used by the Start button toast and the info boxes below it.
   */
  simGate: {
    /** Toast title shown when user clicks Start without configuring */
    toastTitle: {
      tr: "⚠️ Demo Ayarları Gerekli",
      en: "⚠️ Demo Settings Required",
    },
    /** Toast body message */
    toastBody: {
      tr: "Simülasyonu başlatmak için önce Demo Ayarları'nı tamamlayın.",
      en: "Please complete Demo Settings before starting the simulation.",
    },
    /** Toast confirm button */
    toastOpen: {
      tr: "Demo Ayarları'nı Aç",
      en: "Open Demo Settings",
    },
    /** Toast cancel button */
    toastCancel: {
      tr: "İptal",
      en: "Cancel",
    },
    /** Info box 1 label */
    labelWorkId: {
      tr: "İş Emri",
      en: "Work ID",
    },
    /** Info box 2 label */
    labelScenario: {
      tr: "Senaryo",
      en: "Scenario",
    },
    /** Placeholder value when not yet configured */
    notSet: {
      tr: "—",
      en: "—",
    },
  },
  controlPanel: {
    title: { tr: "🎮 Kontrol & Aksiyonlar", en: "🎮 Control & Actions" },
    start: { tr: "🔄 Veri Akışını Başlat", en: "🔄 Start Data Flow" },
    stop: { tr: "⏸️ Veri Akışını Durdur", en: "⏸️ Stop Data Flow" },
    startData: { tr: "▶ Veri Akışını Başlat", en: "▶ Start Data Flow" },
    stopData: { tr: "⏹ Veri Akışını Durdur", en: "⏹ Stop Data Flow" },
    passport: { tr: "📔 Tile Passport Detayı", en: "📔 Tile Passport Details" },
    playbook: {
      tr: "🤖 ArAI Playbook Önerisi",
      en: "🤖 ArAI Playbook Suggestion",
    },
    critical: {
      tr: "⚠️ Kritik Olay Simülasyonu",
      en: "⚠️ Critical Event Simulation",
    },
    heatmap: {
      tr: "🔥 Defekt Haritası Güncelle",
      en: "🔥 Update Defect Heatmap",
    },
    conveyorSpeed: { tr: "Konveyör Hızı", en: "Conveyor Speed" },
    speed: { tr: "Konveyör Hızı", en: "Conveyor Speed" },
    s_clk: { tr: "S_clk (Simülatör Periyodu)", en: "S_clk (Simulator Period)" },
    sClockPeriod: { tr: "S_clk Periyodu", en: "S_clk Period" },
    stationInterval: { tr: "İstasyon Aralığı", en: "Station Interval" },
    showTable: {
      tr: "📊 Üretim Tablosunu Göster",
      en: "📊 Show Production Table",
    },
    simParams: {
      tr: "⚙️ Simülasyon Parametreleri",
      en: "⚙️ Simulation Parameters",
    },
    conveyorStatus: { tr: "Konveyör Durumu", en: "Conveyor Status" },
    /** Label for the 2×2 panel-toggle matrix section */
    reports: { tr: "Raporlar", en: "Reports" },
    running: { tr: "Çalışıyor", en: "Running" },
    stopped: { tr: "Durdu", en: "Stopped" },
    jammed: { tr: "Sıkıştı", en: "Jammed" },
    tilePassport: { tr: "Tile Passport", en: "Tile Passport" },
    defectHeatmap: { tr: "🔥 Defekt Haritası", en: "🔥 Defect Heatmap" },
    productionTable: { tr: "📊 Üretim Tablosu", en: "📊 Production Table" },
    kpiPanel: { tr: "📊 KPI Paneli", en: "📊 KPI Panel" },
    /** Tooltip descriptions shown on hover for each control panel item */
    tooltip_tilePassport: {
      tr: "Her karonun istasyon geçmişini ve hata kaydını gösterir",
      en: "Shows each tile's station history and defect log",
    },
    tooltip_productionTable: {
      tr: "Hat boyunca karo konumlarını gerçek zamanlı matris olarak gösterir",
      en: "Shows tile positions along the line as a real-time matrix",
    },
    tooltip_defectHeatmap: {
      tr: "İstasyonlara göre hata oranlarını ısı haritasıyla görselleştirir",
      en: "Visualises defect rates per station as a heat map",
    },
    tooltip_kpiPanel: {
      tr: "OEE, FTQ, Iskarta ve Enerji gibi KPI'ları canlı gösterir",
      en: "Displays live KPIs such as OEE, FTQ, Scrap and Energy",
    },
    tooltip_running: {
      tr: "Konveyörü çalıştırır — karolar ilerler ve üretim devam eder",
      en: "Starts the conveyor — tiles move and production continues",
    },
    tooltip_stopped: {
      tr: "Konveyörü durdurur — karolar olduğu yerde bekler",
      en: "Stops the conveyor — tiles freeze in place",
    },
    tooltip_jammed: {
      tr: "Konveyör sıkışmasını simüle eder — alarm kaydı oluşturur",
      en: "Simulates a conveyor jam — logs a fault alarm",
    },
    tooltip_speed: {
      tr: "Konveyör bandının görsel hızını ayarlar (0.5× yavaş → 2× hızlı)",
      en: "Adjusts conveyor belt visual speed (0.5× slow → 2× fast)",
    },
    tooltip_sClockPeriod: {
      tr: "Sistem saatinin kaç milisaniyede bir tik attığını ayarlar. Düşük = hızlı simülasyon",
      en: "Sets how often the system clock ticks in ms. Lower = faster simulation",
    },
    tooltip_stationInterval: {
      tr: "Kaç saat tiki başına bir karo üretileceğini belirler. Düşük = yüksek üretim hızı",
      en: "Sets how many clock ticks between each tile production. Lower = higher output rate",
    },
  },
  tilePassport: {
    title: {
      tr: "Tile Passport - Canlı İzleme",
      en: "Tile Passport - Live Tracking",
    },
    tileId: { tr: "Karo ID", en: "Tile ID" },
    lot: { tr: "Parti", en: "Lot" },
    order: { tr: "Sipariş", en: "Order" },
    recipe: { tr: "Reçete", en: "Recipe" },
    location: { tr: "Mevcut Konum", en: "Current Location" },
    quality: { tr: "Kalite: A", en: "Quality: A" },
    tracking: { tr: "Canlı İzleme Aktif", en: "Live Tracking Active" },
    qualityScore: { tr: "Kalite Skoru", en: "Quality Score" },
    realtime: { tr: "Gerçek Zamanlı", en: "Realtime" },
  },
  playbook: {
    title: {
      tr: "🤖 ArAI Chat With Your Factory - Aksiyon Önerisi",
      en: "🤖 ArAI Chat With Your Factory - Action Suggestion",
    },
    question: {
      tr: 'Soru: "Neden FTQ düştü?"',
      en: 'Question: "Why did FTQ drop?"',
    },
    rootCause: {
      tr: "Fırın Zon-5'te +18°C sapma tespit edildi (14:32). Bu durum siyah çekirdek ve pişme kusuru oranlarını artırıyor.",
      en: "+18°C deviation detected in Kiln Zone-5 (14:32). This increases black core and firing defect rates.",
    },
    actions: [
      {
        title: { tr: "1. Acil Müdahale", en: "1. Immediate Intervention" },
        desc: {
          tr: "🔧 Fırın Zon-5 gaz valfi kalibrasyonu",
          en: "🔧 Kiln Zone-5 gas valve calibration",
        },
        impact: {
          tr: "📊 Etki: FTQ +%2.1 beklenen iyileşme",
          en: "📊 Impact: FTQ +2.1% expected improvement",
        },
      },
      {
        title: { tr: "2. Hız Optimizasyonu", en: "2. Speed Optimization" },
        desc: {
          tr: "⚡ Konveyör hızını %3 azalt (1.8 → 1.75 m/dk)",
          en: "⚡ Reduce conveyor speed by 3% (1.8 → 1.75 m/min)",
        },
        impact: {
          tr: "📊 Etki: Pişme homojenliği +%1.5",
          en: "📊 Impact: Firing homogeneity +1.5%",
        },
      },
      {
        title: {
          tr: "3. Preskriptif Bakım",
          en: "3. Prescriptive Maintenance",
        },
        desc: {
          tr: "🔄 Sır viskozite ayarı (45sn → 42sn)",
          en: "🔄 Glaze viscosity adjustment (45s → 42s)",
        },
        impact: {
          tr: "📊 Etki: Glaze akması -%0.4",
          en: "📊 Impact: Glaze flow -0.4%",
        },
      },
    ],
    applyAndClose: { tr: "Uygula ve Kapat", en: "Apply and Close" },
  },
  defects: {
    heatmapTitle: {
      tr: "FTQ & Defekt Isı Haritası",
      en: "FTQ & Defect Heatmap",
    },
    title: { tr: "FTQ & Defekt Isı Haritası", en: "FTQ & Defect Heatmap" },
  },
  kpiPane: {
    title: {
      tr: "📊 Anahtar Performans Göstergeleri",
      en: "📊 Key Performance Indicators",
    },
  },

  // ─── Additional sections for inline-i18n consolidation (T3-1) ─────────

  /** Extra keys for TilePassport.tsx — strings previously hard-coded inline */
  tilePassportExtra: {
    startSimulation: {
      tr: "Simülasyonu başlatın...",
      en: "Start simulation...",
    },
    /** Shown when simulation is running but data store hasn't populated tiles yet */
    loading: {
      tr: "Yükleniyor...",
      en: "Loading...",
    },
    completed: { tr: "Tamamlandı", en: "Completed" },
    onConveyor: { tr: "Konveyörde", en: "On Conveyor" },
    defect: { tr: "Hata", en: "Defect" },
    stationHistory: { tr: "İstasyon Geçmişi", en: "Station History" },
    onBelt: { tr: "Konveyörde", en: "On Belt" },
    total: { tr: "Toplam", en: "Total" },
  },

  /** Keys for AlarmLogPanel.tsx — filter labels, empty states, table headers */
  alarmLog: {
    allSources: { tr: "Tüm Kaynaklar", en: "All Sources" },
    noSourcesYet: { tr: "Henüz kaynak yok", en: "No sources yet" },
    clearFilters: { tr: "Filtreleri Temizle", en: "Clear Filters" },
    noAlarmsMatch: {
      tr: "Filtreye uygun alarm bulunamadı",
      en: "No alarms match the current filters",
    },
  },

  /** Keys for MachineTooltipContent.tsx — parameter table column headers */
  machineTooltip: {
    parameter: { tr: "Parametre", en: "Parameter" },
    value: { tr: "Değer", en: "Value" },
    unit: { tr: "Birim", en: "Unit" },
    range: { tr: "Aralık", en: "Range" },
  },

  /** Keys for ProductionTable3D.tsx — clock column header */
  productionTable: {
    clock: { tr: "SAAT", en: "CLOCK" },
  },

  /** Keys for DemoSettingsPanel.tsx — out-of-range tooltip */
  demoSettingsExtra: {
    outOfRange: { tr: "Aralık Dışı", en: "Out of Range" },
  },

  // ─── CWF (Chat With your Factory) panel strings ──────────────────────────

  /** Keys for CWFChatPanel.tsx — panel chrome, welcome screen, and status */
  cwf: {
    panelTitle: {
      tr: "💬 CWF — Fabrikanla Konuş",
      en: "💬 CWF — Chat With your Factory",
    },
    placeholder: {
      tr: "Fabrikanız hakkında bir soru sorun...",
      en: "Ask a question about your factory...",
    },
    send: { tr: "Gönder", en: "Send" },
    thinking: {
      tr: "Analiz ediliyor...",
      en: "Analyzing...",
    },
    noSimulation: {
      tr: "Simülasyon başlatılmadı",
      en: "No simulation running",
    },
    toolCalls: {
      tr: "sorgu yapıldı",
      en: "queries executed",
    },
    clearChat: { tr: "Sohbeti Temizle", en: "Clear Chat" },
    quickActions: { tr: "Hızlı Sorular", en: "Quick Questions" },
    welcomeTitle: {
      tr: "Merhaba! Ben CWF 🏭",
      en: "Hello! I'm CWF 🏭",
    },
    welcomeMessage: {
      tr: "Seramik üretim hattınız hakkında her şeyi sorabilirsiniz. OEE analizi, kusur tespiti, kök neden analizi ve iyileştirme önerileri sunabilirim.",
      en: "You can ask me anything about your ceramic production line. I can provide OEE analysis, defect detection, root cause analysis, and improvement recommendations.",
    },
    poweredBy: {
      tr: "Powered by Gemini AI",
      en: "Powered by Gemini AI",
    },
    simulationHistory: {
      tr: "Simülasyon Geçmişi",
      en: "Simulation History",
    },
    noHistory: {
      tr: "Simülasyon geçmişi bulunamadı",
      en: "No simulation history found",
    },
  },
};
