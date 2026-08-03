import { afterEach, describe, expect, it, jest } from '@jest/globals';
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

/** The class reads `Date.now()` directly, so a test that needs elapsed time stubs the clock. */
function atClock(): { advance: (byMs: number) => void } {
  let nowMs = 1_700_000_000_000;
  jest.spyOn(Date, 'now').mockImplementation(() => nowMs);
  return {
    advance: (byMs: number) => {
      nowMs += byMs;
    },
  };
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('UpstreamMetrics.throttledEvent', () => {
  it('suppresses a repeat inside the window and emits again once it has elapsed', () => {
    const clock = atClock();
    const metrics = quietMetrics();

    expect(metrics.throttledEvent('warn', 'k', 60_000, 'm', {})).toBe(true);
    clock.advance(59_999);
    expect(metrics.throttledEvent('warn', 'k', 60_000, 'm', {})).toBe(false);
    clock.advance(1);
    expect(metrics.throttledEvent('warn', 'k', 60_000, 'm', {})).toBe(true);
  });

  it('honours the window STORED with the key, not the one the current call passes', () => {
    // The property that makes the I1 fix work, and the one an earlier draft of this spec got
    // wrong: the suppression window belongs to the registration, so a later call cannot shorten a
    // key's open window by passing a smaller `everyMs`. Without this, any caller could re-open
    // another caller's throttle at will — the same cross-window hazard as the prune bug, through
    // the front door.
    const clock = atClock();
    const metrics = quietMetrics();

    expect(metrics.throttledEvent('error', 'k', 3_600_000, 'm', {})).toBe(true);
    clock.advance(60_000);
    expect(metrics.throttledEvent('error', 'k', 0, 'm', {})).toBe(false);
  });

  it('never lets a SHORT-window caller cut a LONG-window key short (review #85 I1)', () => {
    const clock = atClock();
    const metrics = quietMetrics();
    const hour = 3_600_000;

    // A long-window condition reports once. It must stay silent for its own hour…
    expect(metrics.throttledEvent('error', 'slow-domain', hour, 'hourly', {})).toBe(true);

    // …and the clock must move PAST the short window for this case to discriminate at all. Under
    // the old implementation the prune asked `now - lastLoggedAt >= callerEveryMs`, so with no
    // elapsed time nothing was evicted and this test would have passed against the bug — an
    // assertion that reads as coverage while pinning nothing.
    clock.advance(61_000);

    // A different domain, on a 60 s window, drives the map past the cleanup floor and prunes on
    // every call. Old behaviour: `slow-domain` is 61 s old, 61 s >= this caller's 60 s, so it is
    // evicted and its next report emits immediately — marine's hourly ERROR degrading to
    // per-minute during an incident. New behaviour: it is judged by its OWN expiry, an hour away.
    fillWithOpenWindows(metrics, 70, 60_000);

    expect(metrics.throttledEvent('error', 'slow-domain', hour, 'hourly', {})).toBe(false);
  });

  it('keeps a key whose window is open and drops one whose window has ended', () => {
    const clock = atClock();
    const metrics = quietMetrics();
    const hour = 3_600_000;

    metrics.throttledEvent('warn', 'short', 30_000, 'm', {});
    metrics.throttledEvent('warn', 'long', hour, 'm', {});
    // Past the short window, inside the long one — the only interval where the two diverge.
    clock.advance(31_000);
    fillWithOpenWindows(metrics, 70, hour);

    // Asserted through behaviour rather than by reading the map, because the map is private on
    // purpose: the expired key is free to report again, the open one is still throttled.
    expect(metrics.throttledEvent('warn', 'short', 30_000, 'm', {})).toBe(true);
    expect(metrics.throttledEvent('warn', 'long', hour, 'm', {})).toBe(false);
  });
});
