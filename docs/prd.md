# Product Requirements Document: Virtual Factory Demo (Sentient Factory)

## 1. Project Vision

The **Virtual Factory Demo**, also known as the **Sentient Factory**, is a next-generation manufacturing intelligence platform. It transforms traditional industrial monitoring from static, reactive dashboards into a dynamic, "living" 3D ecosystem. The platform provides real-time visibility into an 8-machine ceramic tile production line, complete with AI-powered analytics, digital passports, and natural-language factory querying.

## 2. Target Audience

- **Factory Managers**: Monitor production KPIs, OEE hierarchy, and overall factory health in real-time.
- **Operations Engineers**: Identify bottlenecks, track individual tile passports, manage quality control, and analyse energy consumption.
- **Digital Transformation Leaders**: Demonstrate the potential of AI-driven, sentient manufacturing environments with CWF (Chat With your Factory).
- **Investors & Stakeholders**: Visualise the factory's digital twin and understand the value proposition through interactive demos.

## 3. Core Features

### 3.1. Real-Time 3D Factory Simulation

- **Dynamic Scene**: High-fidelity 3D environment built with React Three Fiber, featuring animated conveyor belts, station models, and a camera-facing factory layout.
- **8-Station Production Line**: Press → Dryer → Glaze → Digital Printer → Conveyor Belt → Kiln → Sorting → Packaging.
- **Conveyor Belt Physics**: Delta-based tile movement along a CatmullRom curve with configurable speed, spawn interval, and visual velocity.
- **Station Interactions**: FIFO queue stations (Dryer, Kiln) with configurable dwell times; pass-through stations (Glaze, Printer, Sorting, Packaging) at conveyor speed.
- **Real-Time Visual Feedback**: Tile colour changes per recipe, station occupancy indicators, and production flow animation.

### 3.2. Work Order System

- **Scenario-Based Production**: Three pre-configured work orders (WO#1: 530 tiles, WO#2: 850 tiles, WO#3: 1100 tiles) with recipe and ingredient definitions.
- **Press Limit Enforcement**: Automatic spawn cutoff when work order target is reached.
- **Phase 2 Auto-Drain**: When a work order completes, the belt automatically drains all in-flight tiles through remaining stations before stopping — mirroring real factory behaviour.
- **Recipe System**: Each work order specifies a recipe with tile colour (albedo), format (dimensions), and ingredient definitions.

### 3.3. OEE Hierarchy (Factory → Line → Machine)

- **3-Level OEE Calculation**: Factory OEE (FOEE), 3 Line OEEs (LOEE), and 8 Machine OEEs (MOEE) — following ISA-95 methodology.
- **3D OEE Table**: A floating 3D table rendered above the factory showing the full OEE hierarchy, updated in real-time.
- **Bottleneck Identification**: Automatic detection and display of the factory's bottleneck station.
- **Station Counts**: A–J variables tracking tile counts through each station (press_spawned, press_output, dryer_output, ... packaging_output).
- **Periodic Snapshots**: OEE data synced to Supabase every 10 seconds via `oeeSnapshotService`.

### 3.4. Energy, Gas & CO₂ Tracking

- **Cumulative Energy Meters**: Per-station kWh consumption tracking with realistic factory meter behaviour.
- **Gas Consumption**: Dryer and Kiln gas usage tracked separately.
- **CO₂ Emissions**: Calculated from energy consumption using configurable emission factors.
- **Energy KPIs**: kWh-per-tile efficiency metric computed in real-time.

### 3.5. Tile Passport System (DTXFR)

- **Unit-Level Tracking**: Every tile is tracked throughout its entire production lifecycle with a unique ID.
- **Digital Passport**: Rich telemetry record per tile — timestamps, station entry/exit times, quality grades, and processing history.
- **Quality Grading**: Automatic classification of tiles into First Quality, Second Quality, or Scrap based on configurable thresholds.
- **Scrap Scenarios**: Configurable per-station scrap probabilities to simulate real-world defect patterns.
- **DTXFR Panel**: UI panel displaying detailed passport data for individual tiles.

### 3.6. CWF — Chat With your Factory

- **Natural Language Querying**: Users ask questions about their factory in plain English; CWF translates them to SQL queries and returns formatted answers.
- **AI Agent**: Powered by Google Gemini with tool-use capabilities (up to 8 tool loops per request).
- **SQL Tool Integration**: CWF generates and executes SQL queries against the simulation's Supabase database (tiles, OEE snapshots, sessions, events).
- **Google Drive Knowledge Base**: Dynamic knowledge base loaded from a Google Drive folder — drop a new doc, CWF picks it up within 5 minutes.
- **Retry Logic**: Automatic retry with exponential backoff (1s, 2s) when Gemini returns empty responses.
- **Conversation History**: Multi-turn conversations with context maintained across messages.

### 3.7. Simulation Events & Session Management

- **Session Lifecycle**: Each simulation run creates a session in Supabase with a unique 6-character code (e.g., `EBF844`), start/end timestamps, and final status.
- **Event Logging**: Key lifecycle events recorded: `started`, `stopped`, `drain_started`, `drain_completed`, `work_order_completed`, `reset`.
- **Pause/Resume**: Sessions can be paused and resumed, preserving all state.
- **Simulation History**: Previous sessions accessible for review and CWF queries.

### 3.8. Data Synchronisation & Telemetry

- **SyncService**: Coordinates tile data, telemetry, and OEE snapshot uploads to Supabase.
- **TelemetryStore**: Per-station telemetry with energy, gas, CO₂, and timing data synced periodically.
- **Circuit Breaker Pattern**: All sync services implement circuit breaker protection against Supabase outages — automatic suspension and recovery.
- **Post-Drain Final Snapshot**: After a work order drains, a final OEE snapshot is taken to ensure the database reflects the true post-drain production totals.

### 3.9. Production Table (3D)

- **Live Production Dashboard**: A floating 3D table rendered in the scene showing real-time station-level data.
- **Per-Station Metrics**: Tile counts, queue depths, processing times, and throughput for each station.
- **Camera-Facing**: Table tilts towards the camera for optimal readability from any angle.

### 3.10. Control Panel & UI

- **Conveyor Controls**: Speed, spawn interval, and velocity sliders for real-time conveyor adjustments.
- **Demo Settings**: Scenario (work order) selection, recipe preview, and machine parameter adjustment before starting.
- **Modes Menu**: Quick access to OEE table, Production table, Basic panel, DTXFR panel, and CWF.
- **Header Bar**: Session code, simulation ID, Start/Stop button, Reset, and language toggle (TR/EN).
- **Alarm System**: Configurable alarms for machine downtime, quality drops, and throughput thresholds.
- **Jam Detection**: Automatic detection and visual indication of conveyor jams with configurable thresholds.

## 4. Technical Stack

### 4.1. Frontend

- **Framework**: React 19 (TypeScript)
- **3D Engine**: Three.js, React Three Fiber (`@react-three/fiber`), React Three Drei (`@react-three/drei`)
- **Build Tool**: Vite 7
- **Styling**: CSS with Sentient Dark theme (glassmorphism, micro-animations)
- **Icons**: Lucide React

### 4.2. State Management

- **Global State**: Zustand (8 stores: simulation, simulationData, kpi, workOrder, cwf, telemetry, ui)
- **Store Slices**: Modular slice architecture for session, tile, and conveyor management
- **Reactive Updates**: High-performance per-frame updates via `useFrame` + Zustand selectors

### 4.3. Backend & Data

- **Database**: Supabase (PostgreSQL) — tables: `simulation_sessions`, `tiles`, `oee_snapshots`, `simulation_events`
- **API**: Vercel Serverless Functions (`api/cwf/chat.ts`)
- **AI Model**: Google Gemini 2.5 Flash (via `@google/generative-ai`)
- **Knowledge Base**: Google Drive API (`googleapis`) for dynamic document loading
- **Authentication**: Supabase Row-Level Security (RLS) on all tables

### 4.4. Services

- **syncService**: Orchestrates periodic tile + telemetry sync to Supabase
- **oeeSnapshotService**: Periodic OEE hierarchy snapshots with circuit breaker
- **simulationEventLogger**: Fire-and-forget lifecycle event recording
- **simulationHistoryService**: Session history retrieval and management

### 4.5. Configuration

- **Params Module**: 24 configuration files covering geometry, physics, OEE, energy, alarms, scrap, sync, UI, and demo scenarios
- **Zero Hard-Coded Values**: All configuration externalised to the params system

### 4.6. Deployment

- **Hosting**: Vercel (production + preview)
- **CI/CD**: GitHub → Vercel auto-deploy on push to `main`
- **Environment Variables**: Managed via Vercel CLI (`GEMINI_API_KEY`, `SUPABASE_*`, `GOOGLE_SERVICE_ACCOUNT_*`, `CWF_KNOWLEDGE_FOLDER_ID`)

## 5. Testing

- **Unit Tests**: 750+ tests across 52 test files (Vitest)
- **Coverage**: Stores, services, params, UI components, sync logic, and OEE calculations
- **Automated Test Suite**: Supabase table sync, simulation events, buffer limits, conveyor behaviour, CWF commands, and more

## 6. User Interface & Design

- **Theme**: "Sentient Dark" — premium, cinematic dark aesthetic with `#0a0e17` backgrounds, cyan/teal accents, glassmorphism panels, and subtle micro-animations.
- **Information Density**: High-level 3D overview with drill-down capability to individual tile passports.
- **Responsive Layout**: Camera zoom controls, adjustable panel sizing, and mobile-aware touch handling.
- **Bilingual**: Turkish and English language support via toggle.

## 7. Future Roadmap

- **AI-Driven Predictive Maintenance**: Integration of ML models to predict equipment failures.
- **Extended Reality (XR)**: VR/AR headset support for immersive factory walk-throughs.
- **Multi-Factory Support**: Interconnected supply chain visualisation across multiple facilities.
- **Advanced Scrap Analytics**: ML-driven defect pattern recognition and root cause analysis.
- **Real-Time Alerts**: Push notifications for critical KPI thresholds and machine anomalies.
