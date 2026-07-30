import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { CircuitBreaker } from './circuit-breaker';
import { UpstreamMetrics } from './upstream-metrics';

describe('CircuitBreaker', () => {
  let metrics: UpstreamMetrics;
  let nowMs: number;

  function build(threshold = 3, openMs = 10_000): CircuitBreaker {
    return new CircuitBreaker(metrics, {
      failureThreshold: threshold,
      openMs,
      now: () => nowMs,
    });
  }

  beforeEach(() => {
    metrics = new UpstreamMetrics();
    jest.spyOn(metrics, 'event').mockImplementation(() => undefined);
    nowMs = 1_000_000;
  });

  it('stays closed while failures are interrupted by a success', () => {
    const breaker = build(3);
    breaker.recordFailure('cmems', 'transient');
    breaker.recordFailure('cmems', 'transient');
    breaker.recordSuccess('cmems');
    breaker.recordFailure('cmems', 'transient');

    expect(breaker.state('cmems')).toBe('closed');
    expect(breaker.canAttempt('cmems')).toBe(true);
  });

  it('counts a CLEAN provider refusal, not only a transport failure — the M1 lesson (I2)', () => {
    // The scenario the import tool's breaker missed: a retired dataset id makes every call return
    // a well-formed HTTP 400. Nothing throws, so a transport-only counter never moves and the run
    // hammers a provider that is telegraphing "stop asking me this".
    const breaker = build(3);
    breaker.recordFailure('cmems', 'client_error');
    breaker.recordFailure('cmems', 'client_error');
    breaker.recordFailure('cmems', 'client_error');

    expect(breaker.state('cmems')).toBe('open');
    expect(breaker.canAttempt('cmems')).toBe(false);
    expect(metrics.get('breaker.opened', 'cmems')).toBe(1);
  });

  it('counts a schema mismatch too — a provider whose payload moved is still refusing us', () => {
    const breaker = build(2);
    breaker.recordFailure('open-meteo', 'schema_error');
    breaker.recordFailure('open-meteo', 'schema_error');
    expect(breaker.state('open-meteo')).toBe('open');
  });

  it('does NOT count `no_data`, which is the provider working correctly', () => {
    // A land-mask null at every Marmara point would otherwise open the circuit on a healthy
    // provider and take the whole basin off the page.
    const breaker = build(2);
    breaker.recordFailure('cmems', 'no_data');
    breaker.recordFailure('cmems', 'no_data');
    breaker.recordFailure('cmems', 'no_data');
    expect(breaker.state('cmems')).toBe('closed');
  });

  it('opens IMMEDIATELY on a 429 and honours the provider’s own Retry-After', () => {
    const breaker = build(5, 10_000);
    breaker.recordFailure('open-meteo', 'rate_limited', 120);

    expect(breaker.state('open-meteo')).toBe('open');
    nowMs += 60_000;
    expect(breaker.state('open-meteo')).toBe('open'); // still inside the 120 s the provider asked for
    nowMs += 61_000;
    expect(breaker.state('open-meteo')).toBe('half_open');
  });

  it('lets exactly ONE trial call through when the cooldown elapses', () => {
    const breaker = build(1, 5_000);
    breaker.recordFailure('cmems', 'transient');
    expect(breaker.canAttempt('cmems')).toBe(false);

    nowMs += 5_001;
    expect(breaker.canAttempt('cmems')).toBe(true);
    // Releasing the whole backlog at once would re-hammer the provider the instant it recovers.
    expect(breaker.canAttempt('cmems')).toBe(false);
  });

  it('closes on a success after a trial call, and says so', () => {
    const breaker = build(1, 5_000);
    breaker.recordFailure('cmems', 'transient');
    nowMs += 5_001;
    expect(breaker.canAttempt('cmems')).toBe(true);

    breaker.recordSuccess('cmems');
    expect(breaker.state('cmems')).toBe('closed');
    expect(metrics.get('breaker.closed', 'cmems')).toBe(1);
  });

  it('re-opens when the trial call also fails', () => {
    const breaker = build(1, 5_000);
    breaker.recordFailure('cmems', 'transient');
    nowMs += 5_001;
    expect(breaker.canAttempt('cmems')).toBe(true);

    breaker.recordFailure('cmems', 'transient');
    expect(breaker.state('cmems')).toBe('open');
  });

  it('does NOT count a budget refusal — the call never reached the provider', () => {
    // Guarded in the breaker as well as at the call site: a self-inflicted refusal opening a
    // circuit would report a healthy provider as down, and then mask the deliberately loud budget
    // log behind a generic "circuit breaker is open" for the rest of the cooldown.
    const breaker = build(2);
    breaker.recordFailure('open-meteo', 'budget_exhausted');
    breaker.recordFailure('open-meteo', 'budget_exhausted');
    breaker.recordFailure('open-meteo', 'budget_exhausted');
    expect(breaker.state('open-meteo')).toBe('closed');
  });

  it('FLOORS a Retry-After of 0 at the default cooldown instead of disarming itself', () => {
    // `Retry-After: 0` is legal, and an already-elapsed HTTP-date parses to 0 as well (clock skew
    // is enough). Honoured verbatim it set openUntilMs = now, so the very next call went straight
    // back to a provider that had just said stop — a missing header was handled BETTER than a
    // present one (review #73 I3).
    const breaker = build(5, 60_000);
    breaker.recordFailure('open-meteo', 'rate_limited', 0);

    expect(breaker.state('open-meteo')).toBe('open');
    nowMs += 59_000;
    expect(breaker.state('open-meteo')).toBe('open');
    nowMs += 2_000;
    expect(breaker.state('open-meteo')).toBe('half_open');
  });

  it('still honours a Retry-After LONGER than the default', () => {
    const breaker = build(5, 10_000);
    breaker.recordFailure('open-meteo', 'rate_limited', 120);
    nowMs += 60_000;
    expect(breaker.state('open-meteo')).toBe('open');
  });

  describe('abandonTrial', () => {
    it('releases a leaked half-open trial WITHOUT recording a failure', () => {
      // The CRITICAL from review #73: an exception escaping the caller's parse leaves the trial
      // flag set, and the breaker then refuses that provider for the process lifetime while the
      // logs look exactly like a healthy cooldown. The release must not go through recordFailure —
      // that would re-dress our own bug as evidence about the provider.
      const breaker = build(1, 5_000);
      breaker.recordFailure('cmems', 'transient');
      nowMs += 5_001;
      expect(breaker.canAttempt('cmems')).toBe(true); // takes the trial
      expect(breaker.canAttempt('cmems')).toBe(false); // trial in flight

      breaker.abandonTrial('cmems', 'parse threw');

      expect(breaker.canAttempt('cmems')).toBe(true); // the next caller gets the trial back
      expect(metrics.get('breaker.trial_abandoned', 'cmems')).toBe(1);
      expect(metrics.get('breaker.opened', 'cmems')).toBe(1); // unchanged — no failure recorded
    });

    it('is a no-op when no trial is in flight, so the normal path cannot double-release', () => {
      const breaker = build(3);
      breaker.abandonTrial('cmems', 'nothing to release');
      breaker.recordFailure('cmems', 'transient');
      breaker.abandonTrial('cmems', 'still nothing');

      expect(metrics.get('breaker.trial_abandoned', 'cmems')).toBe(0);
      expect(breaker.state('cmems')).toBe('closed');
    });
  });

  it('keeps providers independent — one being down must not take the other off the page', () => {
    const breaker = build(1);
    breaker.recordFailure('cmems', 'transient');
    expect(breaker.canAttempt('cmems')).toBe(false);
    expect(breaker.canAttempt('open-meteo')).toBe(true);
  });
});
