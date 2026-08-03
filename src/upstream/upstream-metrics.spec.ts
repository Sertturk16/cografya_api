import { describe, expect, it, jest } from '@jest/globals';
import { UpstreamMetrics } from './upstream-metrics';

/**
 * The throttle's CROSS-DOMAIN property, pinned after review #85 I1.
 *
 * The counters and the log levels are exercised all over the suite by the callers that use them;
 * what had no test — and what broke — is the interaction between two call sites with DIFFERENT
 * windows sharing one map. That is invisible from any single caller's spec, which is exactly why
 * it survived until a per-province key made the map large enough to trigger the cleanup path.
 *
 * Structural throughout: no assertion below names a real provider condition.
 */

/** Silence the logger; the events themselves are asserted through the return value. */
function quietMetrics(): UpstreamMetrics {
  const metrics = new UpstreamMetrics();
  jest.spyOn(metrics, 'event').mockImplementation(() => undefined);
  return metrics;
}

/** Push the map past the 64-key cleanup floor with keys that are all still inside their window. */
function fillWithOpenWindows(metrics: UpstreamMetrics, count: number, everyMs: number): void {
  for (let index = 0; index < count; index += 1) {
    metrics.throttledEvent('warn', `filler:${String(index)}`, everyMs, 'filler', {});
  }
}

describe('UpstreamMetrics.throttledEvent', () => {
  it('suppresses a repeat inside the window and emits again after it', () => {
    const metrics = quietMetrics();
    expect(metrics.throttledEvent('warn', 'k', 60_000, 'm', {})).toBe(true);
    expect(metrics.throttledEvent('warn', 'k', 60_000, 'm', {})).toBe(false);

    // Time is advanced by re-registering the same key through a window that has elapsed; the
    // clock itself is `Date.now`, so the elapsed case is simulated with a zero-length window
    // rather than by sleeping.
    expect(metrics.throttledEvent('warn', 'k', 0, 'm', {})).toBe(true);
  });

  it('never lets a SHORT-window caller cut a LONG-window key short (review #85 I1)', () => {
    const metrics = quietMetrics();
    const hour = 3_600_000;

    // A long-window condition reports once. It must stay silent for its own hour…
    expect(metrics.throttledEvent('error', 'slow-domain', hour, 'hourly', {})).toBe(true);

    // …while a different domain, with a 60 s window, drives the map past the cleanup floor and
    // prunes on every call. Under the old implementation the prune judged EVERY key by this
    // caller's 60 s, so `slow-domain` was evicted and its next report emitted immediately.
    fillWithOpenWindows(metrics, 70, 60_000);

    expect(metrics.throttledEvent('error', 'slow-domain', hour, 'hourly', {})).toBe(false);
  });

  it('keeps a key whose window is open and drops one whose window has ended', () => {
    const metrics = quietMetrics();
    // A zero-length window is already expired the instant it is set — the prunable case.
    metrics.throttledEvent('warn', 'expired', 0, 'm', {});
    metrics.throttledEvent('warn', 'open', 3_600_000, 'm', {});
    fillWithOpenWindows(metrics, 70, 3_600_000);

    // The open key is still throttled; the expired one is free to report again. Asserted through
    // behaviour rather than by reading the map, because the map is private on purpose.
    expect(metrics.throttledEvent('warn', 'open', 3_600_000, 'm', {})).toBe(false);
    expect(metrics.throttledEvent('warn', 'expired', 3_600_000, 'm', {})).toBe(true);
  });
});
