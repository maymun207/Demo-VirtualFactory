/**
 * sessionAccessor.ts — Circular-Dependency-Safe Session ID Bridge
 *
 * PURPOSE:
 *   Both simulationStore and simulationDataStore need to reference each other:
 *   - simulationDataStore imports simulationStore to read master clocks.
 *   - simulationStore needs to read the active session ID from simulationDataStore.
 *
 *   A direct static import in simulationStore would create a true circular
 *   dependency at module-initialisation time, causing both stores to receive
 *   `undefined` references and silently failing to render.
 *
 *   This file is a NEUTRAL bridge with NO top-level store imports. Instead,
 *   simulationDataStore registers a getter into this module after it has been
 *   fully initialised. simulationStore calls `getActiveSessionId()` from here —
 *   which is guaranteed to be populated by the time any queueMicrotask callback
 *   runs, because module side-effects (the registration call) complete during
 *   the synchronous import phase before any microtasks execute.
 *
 * IMPORT GRAPH (acyclic):
 *   simulationStore     → sessionAccessor   (reads the getter)
 *   simulationDataStore → sessionAccessor   (registers the getter)
 *   sessionAccessor     → (nothing)
 *
 * USAGE:
 *   // In simulationDataStore.ts (after store creation):
 *   import { registerSessionAccessor } from './sessionAccessor';
 *   registerSessionAccessor(() => useSimulationDataStore.getState().session?.id);
 *
 *   // In simulationStore.ts (inside queueMicrotask callbacks only):
 *   import { getActiveSessionId } from './sessionAccessor';
 *   const simId = getActiveSessionId(); // synchronous, no await
 */

/**
 * The registered getter function, injected by simulationDataStore at module load.
 * Starts as null; populated before any queueMicrotask callback can fire.
 */
let _sessionGetter: (() => string | undefined) | null = null;

/**
 * Register the session ID accessor function.
 *
 * Called by simulationDataStore immediately after the store is created,
 * passing a closure over the already-initialised Zustand store instance.
 *
 * @param getter - A zero-argument function that returns the current session UUID
 *                 or undefined if no session is active.
 */
export function registerSessionAccessor(getter: () => string | undefined): void {
    // Store the getter so simulationStore can retrieve it synchronously.
    _sessionGetter = getter;
}

/**
 * Retrieve the active simulation session UUID synchronously.
 *
 * SAFE TO CALL ONLY inside `queueMicrotask()` callbacks — never at module
 * top-level or during React render. By the time a microtask runs, both stores
 * are fully initialised and `registerSessionAccessor` has already been called.
 *
 * @returns The active session UUID, or undefined if no session is active or
 *          if the accessor has not yet been registered (should not happen in
 *          normal operation, but guarded against to avoid hard crashes).
 */
export function getActiveSessionId(): string | undefined {
    // Guard: if registration hasn't happened yet, return undefined gracefully.
    if (!_sessionGetter) return undefined;
    // Delegate to the registered getter — reads Zustand state at call-time.
    return _sessionGetter();
}
