/**
 * ╔═══════════════════════════════════════════════════════════════════╗
 * ║  eventBus.test.ts — Unit tests for the typed event bus           ║
 * ║                                                                   ║
 * ║  Covers:                                                          ║
 * ║    • Basic emit & on (subscribe/receive)                          ║
 * ║    • Unsubscribe via returned function                            ║
 * ║    • Multiple listeners on the same event                         ║
 * ║    • No-op emit when no listeners registered                      ║
 * ║    • clear() for a single event and for all events                ║
 * ║    • Payload type integrity                                       ║
 * ╚═══════════════════════════════════════════════════════════════════╝
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { eventBus } from '../lib/eventBus';

describe('eventBus', () => {
  /** Clear all listeners before each test to ensure isolation. */
  beforeEach(() => {
    eventBus.clear();
  });

  it('delivers payload to a subscribed listener', () => {
    /** Arrange: subscribe a spy to the "alarm" event. */
    const handler = vi.fn();
    eventBus.on('alarm', handler);

    /** Act: emit an alarm event with a payload. */
    const payload = { type: 'jam_start', severity: 'critical' as const, message: 'test' };
    eventBus.emit('alarm', payload);

    /** Assert: handler was called once with the correct payload. */
    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith(payload);
  });

  it('supports multiple listeners on the same event', () => {
    /** Arrange: subscribe two independent spies. */
    const handler1 = vi.fn();
    const handler2 = vi.fn();
    eventBus.on('alarm', handler1);
    eventBus.on('alarm', handler2);

    /** Act: emit a single event. */
    eventBus.emit('alarm', { type: 'jam_cleared', severity: 'info', message: 'ok' });

    /** Assert: both handlers received the event. */
    expect(handler1).toHaveBeenCalledOnce();
    expect(handler2).toHaveBeenCalledOnce();
  });

  it('unsubscribes correctly via the returned function', () => {
    /** Arrange: subscribe and immediately unsubscribe. */
    const handler = vi.fn();
    const unsub = eventBus.on('alarm', handler);
    unsub();

    /** Act: emit after unsubscribing. */
    eventBus.emit('alarm', { type: 'jam_start', severity: 'critical', message: 'x' });

    /** Assert: handler was NOT called. */
    expect(handler).not.toHaveBeenCalled();
  });

  it('does not throw when emitting with no listeners', () => {
    /** Act & Assert: emitting to an empty channel should be a safe no-op. */
    expect(() => {
      eventBus.emit('alarm', { type: 'test', severity: 'info', message: 'no one listening' });
    }).not.toThrow();
  });

  it('clear(event) removes listeners for a specific event only', () => {
    /** Arrange: subscribe to the "alarm" channel. */
    const handler = vi.fn();
    eventBus.on('alarm', handler);

    /** Act: clear only the "alarm" channel, then emit. */
    eventBus.clear('alarm');
    eventBus.emit('alarm', { type: 'test', severity: 'info', message: 'cleared' });

    /** Assert: handler was not called after clear. */
    expect(handler).not.toHaveBeenCalled();
  });

  it('clear() with no args removes ALL listeners', () => {
    /** Arrange: subscribe to the "alarm" channel. */
    const handler = vi.fn();
    eventBus.on('alarm', handler);

    /** Act: clear everything, then emit. */
    eventBus.clear();
    eventBus.emit('alarm', { type: 'test', severity: 'info', message: 'all cleared' });

    /** Assert: handler was not called. */
    expect(handler).not.toHaveBeenCalled();
  });

  it('only invokes listeners for the matching event name', () => {
    /** Arrange: subscribe to "alarm". */
    const alarmHandler = vi.fn();
    eventBus.on('alarm', alarmHandler);

    /** Act: emit a different event name (typed as unknown via index signature). */
    (eventBus as { emit: (e: string, p: unknown) => void }).emit('other_event', { data: 123 });

    /** Assert: alarm handler was NOT called for a different event. */
    expect(alarmHandler).not.toHaveBeenCalled();
  });
});
