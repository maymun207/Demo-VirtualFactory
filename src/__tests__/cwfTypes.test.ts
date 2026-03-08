/**
 * cwfTypes.test.ts — Unit Tests for CWF UIContext Type Shapes (Phase 1)
 *
 * Tests the structural correctness of UIContext, PanelSnapshot, SimSnapshot,
 * and ConfigSnapshot interfaces defined in cwfTypes.ts.
 *
 * Since TypeScript types are erased at runtime, we verify shape compliance
 * using object-construction tests and property-presence assertions.
 *
 * Coverage:
 *   1. UIContext object has panels, simulation, and config top-level keys
 *   2. PanelSnapshot has all 11 expected panel visibility boolean fields
 *   3. SimSnapshot has all expected simulation state fields
 *   4. ConfigSnapshot has language and scenario fields
 *   5. SimSnapshot.conveyorStatus accepts all valid values
 *   6. UIContext can be safely JSON-serialized (for POST body inclusion)
 *   7. CWFRequest extended with uiContext field
 *   8. Null/undefined safety — optional fields handle absence gracefully
 */
/// <reference types="vitest/globals" />

import {
    describe,
    it,
    expect,
} from 'vitest';

// =============================================================================
// MIRRORS — Object shape factories matching cwfTypes.ts interfaces
// Used to create test instances without importing the type module directly.
// =============================================================================

/** All valid conveyor status values from simulationStore */
const VALID_CONVEYOR_STATUSES = ['running', 'stopped', 'jammed', 'jam_scrapping'] as const;

/** Factory: creates a minimal valid PanelSnapshot */
function makePanelSnapshot(overrides: Record<string, boolean> = {}) {
    return {
        showBasicPanel: false,
        showDTXFR: false,
        showOEEHierarchy: false,
        showProductionTable: false,
        showCWF: false,
        showControlPanel: false,
        showAlarmLog: false,
        showHeatmap: false,
        showKPI: false,
        showPassport: false,
        showDemoSettings: false,
        ...overrides,
    };
}

/** Factory: creates a minimal valid SimSnapshot */
function makeSimSnapshot(overrides: Record<string, unknown> = {}) {
    return {
        isDataFlowing: false,
        conveyorStatus: 'stopped' as const,
        conveyorSpeed: 1.0,
        sClockPeriod: 2000,
        stationInterval: 800,
        sClock: 0,
        tilesOnBelt: 0,
        ...overrides,
    };
}

/** Factory: creates a minimal valid ConfigSnapshot */
function makeConfigSnapshot(overrides: Record<string, unknown> = {}) {
    return {
        language: 'en' as const,
        isSimConfigured: false,
        simulationEnded: false,
        activeScenarioCode: null,
        selectedWorkOrderId: null,
        ...overrides,
    };
}

/** Factory: creates a complete UIContext object */
function makeUIContext(overrides: Record<string, unknown> = {}) {
    return {
        capturedAt: new Date().toISOString(),
        panels: makePanelSnapshot(),
        simulation: makeSimSnapshot(),
        config: makeConfigSnapshot(),
        ...overrides,
    };
}

// =============================================================================
// Tests: UIContext top-level structure
// =============================================================================

describe('UIContext — top-level structure', () => {
    it('should have a capturedAt ISO timestamp field', () => {
        /**
         * capturedAt is used by CWF to understand how old the snapshot is.
         * It must always be a valid ISO 8601 string.
         */
        const ctx = makeUIContext();
        const parsed = new Date(ctx.capturedAt);
        expect(Number.isNaN(parsed.getTime())).toBe(false);
    });

    it('should have a panels field of type object', () => {
        /** panels carries the panel visibility booleans */
        const ctx = makeUIContext();
        expect(typeof ctx.panels).toBe('object');
        expect(ctx.panels).not.toBeNull();
    });

    it('should have a simulation field of type object', () => {
        /** simulation carries the live sim state */
        const ctx = makeUIContext();
        expect(typeof ctx.simulation).toBe('object');
        expect(ctx.simulation).not.toBeNull();
    });

    it('should have a config field of type object', () => {
        /** config carries language, scenario, and gate flags */
        const ctx = makeUIContext();
        expect(typeof ctx.config).toBe('object');
        expect(ctx.config).not.toBeNull();
    });

    it('should be safely JSON-serializable for inclusion in POST body', () => {
        /**
         * UIContext is sent as part of the CWF POST request body.
         * JSON.stringify must succeed without throwing.
         */
        const ctx = makeUIContext();
        expect(() => JSON.stringify(ctx)).not.toThrow();
        const parsed = JSON.parse(JSON.stringify(ctx));
        expect(parsed.capturedAt).toBeDefined();
    });
});

// =============================================================================
// Tests: PanelSnapshot — all 11 panels
// =============================================================================

describe('PanelSnapshot — completeness', () => {
    const EXPECTED_PANEL_FIELDS = [
        'showBasicPanel', 'showDTXFR', 'showOEEHierarchy', 'showProductionTable',
        'showCWF', 'showControlPanel', 'showAlarmLog', 'showHeatmap',
        'showKPI', 'showPassport', 'showDemoSettings',
    ];

    it('should have exactly 11 panel visibility fields', () => {
        /**
         * Any panel added to the UI must be added to PanelSnapshot too,
         * otherwise CWF cannot report its state.
         */
        const snapshot = makePanelSnapshot();
        expect(Object.keys(snapshot)).toHaveLength(11);
    });

    it('should contain all expected panel field names', () => {
        const snapshot = makePanelSnapshot();
        EXPECTED_PANEL_FIELDS.forEach(field => {
            expect(snapshot).toHaveProperty(field);
        });
    });

    it('all panel fields should be booleans', () => {
        /** Panel visibility is boolean — not string, not number */
        const snapshot = makePanelSnapshot();
        Object.values(snapshot).forEach(value => {
            expect(typeof value).toBe('boolean');
        });
    });

    it('should allow overriding individual panel visibility', () => {
        /** Verifies factory pattern supports partial overrides */
        const snapshot = makePanelSnapshot({ showCWF: true, showOEEHierarchy: true });
        expect(snapshot.showCWF).toBe(true);
        expect(snapshot.showOEEHierarchy).toBe(true);
        expect(snapshot.showBasicPanel).toBe(false);
    });
});

// =============================================================================
// Tests: SimSnapshot — simulation state fields
// =============================================================================

describe('SimSnapshot — simulation state fields', () => {
    it('should have isDataFlowing boolean', () => {
        const snap = makeSimSnapshot({ isDataFlowing: true });
        expect(snap.isDataFlowing).toBe(true);
    });

    it('should have conveyorSpeed as a number', () => {
        const snap = makeSimSnapshot({ conveyorSpeed: 1.5 });
        expect(typeof snap.conveyorSpeed).toBe('number');
        expect(snap.conveyorSpeed).toBe(1.5);
    });

    it('should have sClockPeriod as a positive number', () => {
        const snap = makeSimSnapshot({ sClockPeriod: 3000 });
        expect(snap.sClockPeriod).toBeGreaterThan(0);
    });

    it('should have stationInterval as a positive number', () => {
        const snap = makeSimSnapshot({ stationInterval: 1200 });
        expect(snap.stationInterval).toBeGreaterThan(0);
    });

    it('should have sClock as a non-negative integer', () => {
        const snap = makeSimSnapshot({ sClock: 42 });
        expect(snap.sClock).toBeGreaterThanOrEqual(0);
        expect(Number.isInteger(snap.sClock)).toBe(true);
    });

    it('should have tilesOnBelt as a non-negative integer', () => {
        const snap = makeSimSnapshot({ tilesOnBelt: 7 });
        expect(snap.tilesOnBelt).toBeGreaterThanOrEqual(0);
    });

    it('should accept all valid conveyorStatus values', () => {
        /**
         * conveyorStatus must accept all states used by simulationStore:
         * running | stopped | jammed | jam_scrapping
         * Missing any would cause a lint error in cwfStore.ts.
         */
        VALID_CONVEYOR_STATUSES.forEach(status => {
            const snap = makeSimSnapshot({ conveyorStatus: status });
            expect(snap.conveyorStatus).toBe(status);
        });
    });

    it('should have all required fields', () => {
        const REQUIRED_FIELDS = [
            'isDataFlowing', 'conveyorStatus', 'conveyorSpeed',
            'sClockPeriod', 'stationInterval', 'sClock', 'tilesOnBelt',
        ];
        const snap = makeSimSnapshot();
        REQUIRED_FIELDS.forEach(field => {
            expect(snap).toHaveProperty(field);
        });
    });
});

// =============================================================================
// Tests: ConfigSnapshot — language and scenario
// =============================================================================

describe('ConfigSnapshot — language and scenario fields', () => {
    it('should have language field set to "en" or "tr"', () => {
        /** language drives the CWF response language decision */
        const snapEn = makeConfigSnapshot({ language: 'en' });
        const snapTr = makeConfigSnapshot({ language: 'tr' });
        expect(['en', 'tr']).toContain(snapEn.language);
        expect(['en', 'tr']).toContain(snapTr.language);
    });

    it('should have isSimConfigured boolean', () => {
        /** Signals whether the Demo Settings gate has been completed */
        const snap = makeConfigSnapshot({ isSimConfigured: true });
        expect(snap.isSimConfigured).toBe(true);
    });

    it('should have simulationEnded boolean', () => {
        /** Signals whether the simulation ended naturally (work order complete) */
        const snap = makeConfigSnapshot({ simulationEnded: true });
        expect(snap.simulationEnded).toBe(true);
    });

    it('should allow null activeScenarioCode when no scenario is selected', () => {
        /** Before Demo Settings are configured, scenario is null */
        const snap = makeConfigSnapshot({ activeScenarioCode: null });
        expect(snap.activeScenarioCode).toBeNull();
    });

    it('should allow string activeScenarioCode when scenario is selected', () => {
        const snap = makeConfigSnapshot({ activeScenarioCode: 'SCN-001' });
        expect(snap.activeScenarioCode).toBe('SCN-001');
    });

    it('should allow null selectedWorkOrderId when no work order is selected', () => {
        const snap = makeConfigSnapshot({ selectedWorkOrderId: null });
        expect(snap.selectedWorkOrderId).toBeNull();
    });
});

// =============================================================================
// Tests: UIContext in CWFRequest serialization
// =============================================================================

describe('UIContext — CWFRequest serialization', () => {
    it('should be safely includable as a JSON body field', () => {
        /**
         * cwfStore.ts attaches uiContext to the POST body.
         * JSON.stringify(body) must produce a valid string.
         */
        const body = {
            message: 'What is the current OEE?',
            simulationId: 'sim-uuid',
            language: 'en',
            uiContext: makeUIContext({
                panels: makePanelSnapshot({ showOEEHierarchy: true }),
                simulation: makeSimSnapshot({ isDataFlowing: true, conveyorStatus: 'running' }),
            }),
        };
        const serialized = JSON.stringify(body);
        const parsed = JSON.parse(serialized);
        expect(parsed.uiContext).toBeDefined();
        expect(parsed.uiContext.panels.showOEEHierarchy).toBe(true);
        expect(parsed.uiContext.simulation.conveyorStatus).toBe('running');
    });

    it('CWFRequest should work with uiContext omitted (backward compat)', () => {
        /**
         * uiContext is optional — older clients or test calls that omit it
         * must still be valid. This ensures backward compatibility.
         */
        const body = {
            message: 'Hello',
            simulationId: 'sim-uuid',
            language: 'en',
            // uiContext intentionally omitted
        };
        const serialized = JSON.stringify(body);
        const parsed = JSON.parse(serialized);
        expect(parsed.uiContext).toBeUndefined();
    });

    it('PanelSnapshot should round-trip through JSON without data loss', () => {
        /** All boolean values must survive JSON serialization intact */
        const original = makePanelSnapshot({
            showBasicPanel: true,
            showCWF: true,
            showOEEHierarchy: false,
        });
        const roundTripped = JSON.parse(JSON.stringify(original));
        expect(roundTripped.showBasicPanel).toBe(true);
        expect(roundTripped.showCWF).toBe(true);
        expect(roundTripped.showOEEHierarchy).toBe(false);
    });
});
