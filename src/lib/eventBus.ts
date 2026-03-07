/**
 * ╔═══════════════════════════════════════════════════════════════════╗
 * ║  EVENT BUS — Lightweight typed pub/sub for cross-store comms     ║
 * ║                                                                   ║
 * ║  Purpose:                                                         ║
 * ║    Decouple simulationStore from simulationDataStore by           ║
 * ║    replacing dynamic import() calls with event-based messaging.   ║
 * ║                                                                   ║
 * ║  Events:                                                          ║
 * ║    • alarm — fired when jam starts/clears, carries alarm payload  ║
 * ║                                                                   ║
 * ║  Usage:                                                           ║
 * ║    Producer: eventBus.emit('alarm', { type, severity, message })  ║
 * ║    Consumer: eventBus.on('alarm', handler) → returns unsubscribe  ║
 * ╚═══════════════════════════════════════════════════════════════════╝
 */

// =============================================================================
// EVENT TYPE MAP — Maps event names to their payload types
// =============================================================================

/**
 * Registry of all event names and their corresponding payload types.
 * Adding a new event here automatically types both emit() and on().
 */
export interface EventMap {
  /** Fired by simulationStore when a conveyor jam starts or clears. */
  alarm: {
    /** Alarm classification (e.g., 'jam_start', 'jam_cleared') */
    type: string;
    /** Severity level for display and filtering */
    severity: 'critical' | 'warning' | 'info';
    /** Human-readable alarm description */
    message: string;
  };
  /** Index signature allows future event additions without type errors. */
  [key: string]: unknown;
}

// =============================================================================
// EVENT BUS CLASS — Generic typed pub/sub implementation
// =============================================================================

/** Callback signature for event subscribers. */
type Listener<T> = (payload: T) => void;

/**
 * Typed event bus supporting multiple named channels.
 * Each channel can have multiple listeners, all invoked synchronously on emit.
 *
 * @template TMap - Interface mapping event names to payload types
 */
class EventBus<TMap extends Record<string, unknown>> {
  /**
   * Internal listener registry.
   * Each key is an event name; each value is a Set of listener callbacks.
   */
  private listeners = new Map<keyof TMap, Set<Listener<unknown>>>();

  /**
   * Subscribe to an event channel.
   *
   * @param event   - Event name to listen for
   * @param handler - Callback invoked with the event payload
   * @returns An unsubscribe function that removes this specific listener
   */
  on<K extends keyof TMap>(event: K, handler: Listener<TMap[K]>): () => void {
    /** Retrieve or create the listener set for this event. */
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    /** Cast is safe: handler is typed by the EventMap constraint. */
    const set = this.listeners.get(event)!;
    set.add(handler as Listener<unknown>);

    /** Return an unsubscribe function for cleanup. */
    return () => {
      set.delete(handler as Listener<unknown>);
    };
  }

  /**
   * Emit an event, invoking all registered listeners synchronously.
   *
   * @param event   - Event name to fire
   * @param payload - Data to pass to each listener
   */
  emit<K extends keyof TMap>(event: K, payload: TMap[K]): void {
    /** Look up listeners; no-op if none registered. */
    const set = this.listeners.get(event);
    if (!set) return;
    /** Invoke each listener with the payload. */
    set.forEach((fn) => fn(payload));
  }

  /**
   * Remove ALL listeners for a specific event, or all events if none specified.
   * Useful for teardown in tests.
   *
   * @param event - Optional event name; omit to clear everything
   */
  clear<K extends keyof TMap>(event?: K): void {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }
}

// =============================================================================
// SINGLETON INSTANCE — The global event bus used across the application
// =============================================================================

/**
 * Global event bus instance.
 * Import this in any module to emit or subscribe to cross-store events.
 *
 * @example
 * ```ts
 * // Producer (simulationStore):
 * eventBus.emit('alarm', { type: 'jam_start', severity: 'critical', message: '...' });
 *
 * // Consumer (simulationDataStore):
 * const unsub = eventBus.on('alarm', (payload) => { ... });
 * ```
 */
export const eventBus = new EventBus<EventMap>();
