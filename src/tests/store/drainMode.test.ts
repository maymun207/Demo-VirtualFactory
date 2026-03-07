/**
 * drainMode.test.ts — Unit Tests for Simulation Drain Mode
 *
 * Validates the drain mode state machine in simulationStore:
 *   - toggleDataFlow() enters drain when tiles are on belt
 *   - toggleDataFlow() during drain triggers force-stop (escape hatch)
 *   - toggleDataFlow() when stopped starts normally
 *   - toggleDataFlow() when belt is empty stops immediately (no drain)
 *   - completeDrain() sets final stopped state
 *   - stopDataFlow() clears isDraining
 *   - resetSimulation() clears isDraining
 *   - P-Clock is suppressed during drain mode
 *
 * Run: npx vitest run src/tests/store/drainMode.test.ts
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useSimulationStore } from '../../store/simulationStore';
import { useWorkOrderStore } from '../../store/workOrderStore';

/** Reset store to pristine state before each test */
beforeEach(() => {
    useSimulationStore.getState().resetSimulation();
});

// =============================================================================
// Initial State
// =============================================================================

describe('Drain Mode — Initial State', () => {
    it('should start with isDraining=false', () => {
        /** Drain mode is inactive on a fresh store */
        expect(useSimulationStore.getState().isDraining).toBe(false);
    });

    it('should start with isDataFlowing=false', () => {
        /** Simulation starts stopped */
        expect(useSimulationStore.getState().isDataFlowing).toBe(false);
    });
});

// =============================================================================
// toggleDataFlow — Start
// =============================================================================

describe('Drain Mode — toggleDataFlow (Start)', () => {
    it('should start simulation normally from stopped state', () => {
        /** Toggle from stopped → running */
        useSimulationStore.getState().toggleDataFlow();
        const state = useSimulationStore.getState();

        expect(state.isDataFlowing).toBe(true);
        expect(state.isDraining).toBe(false);
        expect(state.conveyorStatus).toBe('running');
    });

    it('should clear isDraining when starting from stopped state', () => {
        /** Ensure isDraining is always false on fresh start */
        useSimulationStore.setState({ isDraining: true, isDataFlowing: false });
        useSimulationStore.getState().toggleDataFlow();

        expect(useSimulationStore.getState().isDraining).toBe(false);
        expect(useSimulationStore.getState().isDataFlowing).toBe(true);
    });
});

// =============================================================================
// toggleDataFlow — Drain Mode Entry
// =============================================================================

describe('Drain Mode — toggleDataFlow (Enter Drain)', () => {
    it('should enter drain mode when belt has tiles (totalPartsRef > 0)', () => {
        /** Simulate running with tiles on belt */
        useSimulationStore.setState({
            isDataFlowing: true,
            isDraining: false,
            conveyorStatus: 'running',
        });
        /** Set totalPartsRef to indicate tiles are on belt */
        useSimulationStore.getState().totalPartsRef.current = 5;

        /** Toggle → should enter drain, NOT stop immediately */
        useSimulationStore.getState().toggleDataFlow();
        const state = useSimulationStore.getState();

        expect(state.isDraining).toBe(true);
        /** isDataFlowing stays true so S-Clock keeps ticking */
        expect(state.isDataFlowing).toBe(true);
        expect(state.conveyorStatus).toBe('running');
    });

    it('should stop immediately when belt is empty (totalPartsRef === 0)', () => {
        /** Simulate running with NO tiles on belt */
        useSimulationStore.setState({
            isDataFlowing: true,
            isDraining: false,
            conveyorStatus: 'running',
        });
        useSimulationStore.getState().totalPartsRef.current = 0;

        /** Toggle → should stop immediately (no drain needed) */
        useSimulationStore.getState().toggleDataFlow();
        const state = useSimulationStore.getState();

        expect(state.isDraining).toBe(false);
        expect(state.isDataFlowing).toBe(false);
        expect(state.conveyorStatus).toBe('stopped');
    });
});

// =============================================================================
// toggleDataFlow — Force-Stop (Escape Hatch)
// =============================================================================

describe('Drain Mode — toggleDataFlow (Force-Stop)', () => {
    it('should force-stop when toggled during drain mode', () => {
        /** Set up: already draining */
        useSimulationStore.setState({
            isDataFlowing: true,
            isDraining: true,
            conveyorStatus: 'running',
        });

        /** Toggle again → force-stop escape hatch */
        useSimulationStore.getState().toggleDataFlow();
        const state = useSimulationStore.getState();

        expect(state.isDraining).toBe(false);
        expect(state.isDataFlowing).toBe(false);
        expect(state.conveyorStatus).toBe('stopped');
    });
});

// =============================================================================
// completeDrain
// =============================================================================

describe('Drain Mode — completeDrain()', () => {
    it('should set isDataFlowing=false, isDraining=false, conveyorStatus=stopped', () => {
        /** Set up: draining with belt running */
        useSimulationStore.setState({
            isDataFlowing: true,
            isDraining: true,
            conveyorStatus: 'running',
        });

        /** Complete drain → final stop */
        useSimulationStore.getState().completeDrain();
        const state = useSimulationStore.getState();

        expect(state.isDraining).toBe(false);
        expect(state.isDataFlowing).toBe(false);
        expect(state.conveyorStatus).toBe('stopped');
    });
});

// =============================================================================
// stopDataFlow
// =============================================================================

describe('Drain Mode — stopDataFlow()', () => {
    it('should clear isDraining when stop is called', () => {
        /** Set up: draining */
        useSimulationStore.setState({
            isDataFlowing: true,
            isDraining: true,
            conveyorStatus: 'running',
        });

        /** stopDataFlow → immediate halt, clears drain */
        useSimulationStore.getState().stopDataFlow();
        const state = useSimulationStore.getState();

        expect(state.isDraining).toBe(false);
        expect(state.isDataFlowing).toBe(false);
        expect(state.conveyorStatus).toBe('stopped');
    });

    it('should be a no-op when already stopped', () => {
        /** Already stopped → calling stopDataFlow should do nothing */
        const before = useSimulationStore.getState();
        useSimulationStore.getState().stopDataFlow();
        const after = useSimulationStore.getState();

        expect(after.isDraining).toBe(before.isDraining);
        expect(after.isDataFlowing).toBe(before.isDataFlowing);
    });
});

// =============================================================================
// resetSimulation
// =============================================================================

describe('Drain Mode — resetSimulation()', () => {
    it('should clear isDraining on factory reset', () => {
        /** Set up: draining */
        useSimulationStore.setState({ isDraining: true });

        /** Full reset → everything resets */
        useSimulationStore.getState().resetSimulation();
        expect(useSimulationStore.getState().isDraining).toBe(false);
    });
});

// =============================================================================
// P-Clock Suppression During Drain
// =============================================================================

describe('Drain Mode — P-Clock Suppression', () => {
    it('should NOT advance pClockCount during drain', () => {
        /** Set up: draining, belt running */
        useSimulationStore.setState({
            isDataFlowing: true,
            isDraining: true,
            conveyorStatus: 'running',
            sClockCount: 0,
            pClockCount: 10,
            stationInterval: 1, // P-Clock every S-Clock tick
        });

        /** Advance S-Clock — pClockCount should NOT change */
        useSimulationStore.getState().advanceSClock();
        expect(useSimulationStore.getState().pClockCount).toBe(10);
        /** S-Clock should still advance */
        expect(useSimulationStore.getState().sClockCount).toBe(1);
    });

    it('should advance pClockCount when NOT draining', () => {
        /** Set up: running normally (no drain) */
        useSimulationStore.setState({
            isDataFlowing: true,
            isDraining: false,
            conveyorStatus: 'running',
            sClockCount: 0,
            pClockCount: 10,
            stationInterval: 1,
        });

        /** Advance S-Clock — pClockCount SHOULD increment */
        useSimulationStore.getState().advanceSClock();
        expect(useSimulationStore.getState().pClockCount).toBe(11);
    });
});

// =============================================================================
// P-Clock Suppression When Press Limit Reached
// =============================================================================

describe('P-Clock — Press Limit Behavior', () => {
    it('should still advance pClockCount when pressLimitReached (spawn guard handles it)', () => {
        /**
         * pressLimitReached no longer suppresses P-Clock in advanceSClock.
         * The ConveyorBelt spawn guard handles it instead.
         * pClockCount must increment so the spawn useEffect fires
         * (and then early-returns due to the pressLimitReached guard).
         */
        useSimulationStore.setState({
            isDataFlowing: true,
            isDraining: false,
            conveyorStatus: 'running',
            sClockCount: 0,
            pClockCount: 530,
            stationInterval: 1,
        });
        /** Simulate work order press limit */
        useWorkOrderStore.getState().setPressLimitReached(true);

        /** Advance S-Clock — pClockCount SHOULD still increment */
        useSimulationStore.getState().advanceSClock();
        expect(useSimulationStore.getState().pClockCount).toBe(531);
        /** S-Clock should advance */
        expect(useSimulationStore.getState().sClockCount).toBe(1);

        /** Cleanup: reset workOrderStore */
        useWorkOrderStore.getState().setPressLimitReached(false);
    });

    it('should advance pClockCount when pressLimitReached=false', () => {
        /** Set up: running normally, press limit NOT reached */
        useSimulationStore.setState({
            isDataFlowing: true,
            isDraining: false,
            conveyorStatus: 'running',
            sClockCount: 0,
            pClockCount: 100,
            stationInterval: 1,
        });

        /** Advance S-Clock — pClockCount SHOULD increment */
        useSimulationStore.getState().advanceSClock();
        expect(useSimulationStore.getState().pClockCount).toBe(101);
    });
});
