import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { OperationDeadline } from '../operation-deadline';
import type { StalenessCeilings } from '../staleness';
import { UpstreamMetrics } from '../upstream-metrics';
import type { UpstreamOutcome } from '../upstream.types';
import { InProcessSingleFlight, type SingleFlight, type SingleFlightResult } from './single-flight';
import { UpstreamCacheService, type OutcomeTtlTable } from './upstream-cache.service';
import { InProcessCacheStore } from './upstream-cache.store';

/** Captures structured events so an assertion can read them without touching an unbound method. */
interface RecordedEvent {
  level: string;
  message: string;
  context: Record<string, unknown>;
}

const TTLS: OutcomeTtlTable = {
  ok: 3_600,
  no_data: 86_400,
  transient: 60,
  rate_limited: 300,
  client_error: 900,
  schema_error: 300,
};

const CEILINGS: StalenessCeilings = { staleMaxSeconds: 21_600, validAtMaxAgeSeconds: 10_800 };

/** Lets the fire-and-forget background revalidation settle before an assertion looks at it. */
function flush(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

/** A single-flight that always loses — the "another instance is refreshing" case. */
const ALWAYS_LOSES: SingleFlight = {
  mode: 'redis',
  run: <T>(): Promise<SingleFlightResult<T>> => Promise.resolve({ outcome: 'lost' }),
};

describe('UpstreamCacheService', () => {
  let metrics: UpstreamMetrics;
  let events: RecordedEvent[];
  let nowMs: number;
  let store: InProcessCacheStore;

  function build(singleFlight?: SingleFlight): UpstreamCacheService {
    return new UpstreamCacheService(
      store,
      singleFlight ?? new InProcessSingleFlight(metrics),
      metrics,
      { now: () => nowMs, lockLostPollDelayMs: 0, sleepImpl: () => Promise.resolve() },
    );
  }

  function options(refresh: (deadline: OperationDeadline) => Promise<UpstreamOutcome<string>>) {
    return {
      key: 'marine:overview',
      providerId: 'open-meteo',
      ttls: TTLS,
      ceilings: CEILINGS,
      deadlineMs: 6_000,
      refresh,
    };
  }

  const ok = (value: string, validAtMs: number | null = null): UpstreamOutcome<string> => ({
    kind: 'ok',
    value,
    validAtMs,
  });

  beforeEach(() => {
    metrics = new UpstreamMetrics();
    events = [];
    jest.spyOn(metrics, 'event').mockImplementation((level, message, context) => {
      events.push({ level, message, context: { ...context } });
    });
    nowMs = Date.parse('2026-07-30T12:00:00.000Z');
    store = new InProcessCacheStore(() => nowMs);
  });

  it('a cold read refreshes, stores and returns a fresh value', async () => {
    const cache = build();
    const read = await cache.read(options(() => Promise.resolve(ok('v1'))));

    expect(read).toMatchObject({
      value: 'v1',
      kind: 'ok',
      freshness: 'fresh',
      cacheAgeSeconds: 0,
      origin: 'refreshed',
    });
    expect(metrics.get('cache.miss', 'open-meteo')).toBe(1);
  });

  it('a second read inside the TTL is served from cache without touching the provider', async () => {
    const cache = build();
    const refresh = jest.fn(() => Promise.resolve(ok('v1')));

    await cache.read(options(refresh));
    nowMs += 600_000;
    const read = await cache.read(options(refresh));

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(read).toMatchObject({ value: 'v1', freshness: 'fresh', origin: 'fresh_hit' });
    expect(read.cacheAgeSeconds).toBe(600);
  });

  it('past the TTL it serves the STALE value immediately and revalidates behind the response', async () => {
    // The rule the whole design hangs on (SPEC-ADDENDUM §3.4): a user request never waits for an
    // upstream fetch it can avoid.
    const cache = build();
    let served = 0;
    const refresh = jest.fn(() => Promise.resolve(ok(`v${String(++served)}`)));

    await cache.read(options(refresh));
    nowMs += 3_700_000; // just over the 1 h freshness TTL

    const read = await cache.read(options(refresh));
    expect(read).toMatchObject({ value: 'v1', freshness: 'stale', origin: 'stale_revalidating' });

    await flush();
    expect(refresh).toHaveBeenCalledTimes(2);

    // …and the refreshed value is what the next read gets.
    const next = await cache.read(options(refresh));
    expect(next).toMatchObject({ value: 'v2', freshness: 'fresh' });
  });

  it('keeps an `ok` entry readable past its TTL — the TTL is a freshness horizon, not an eviction', async () => {
    // If the store evicted at `ttlSeconds`, "serve stale while revalidating" would be impossible:
    // the stale value would already be gone.
    const cache = build();
    await cache.read(options(() => Promise.resolve(ok('v1'))));

    nowMs += 5 * 3_600_000; // five hours: four past the TTL, still inside the 6 h ceiling
    const read = await cache.read(options(() => Promise.resolve(ok('v2'))));
    expect(read.value).toBe('v1');
    expect(read.freshness).toBe('stale');
  });

  it('stores a failure as a NEGATIVE entry and stops calling the provider for its TTL', async () => {
    const cache = build();
    const refresh = jest.fn(() =>
      Promise.resolve<UpstreamOutcome<string>>({ kind: 'transient', reason: 'socket died' }),
    );

    const first = await cache.read(options(refresh));
    expect(first).toMatchObject({ value: null, kind: 'transient', freshness: null });

    nowMs += 30_000; // still inside the 60 s transient TTL
    const second = await cache.read(options(refresh));

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(second).toMatchObject({ kind: 'transient', origin: 'negative_hit' });
    expect(metrics.get('cache.negative_hit', 'open-meteo')).toBe(1);
  });

  it('retries once the negative TTL has elapsed', async () => {
    const cache = build();
    const refresh = jest
      .fn<() => Promise<UpstreamOutcome<string>>>()
      .mockResolvedValueOnce({ kind: 'transient', reason: 'socket died' })
      .mockResolvedValueOnce(ok('recovered'));

    await cache.read(options(refresh));
    nowMs += 61_000;
    const read = await cache.read(options(refresh));

    expect(read).toMatchObject({ value: 'recovered', kind: 'ok' });
  });

  it('gives each outcome kind its OWN TTL — a land mask is not retried hourly', async () => {
    const cache = build();
    const refresh = jest.fn(() =>
      Promise.resolve<UpstreamOutcome<string>>({ kind: 'no_data', reason: 'land mask' }),
    );

    await cache.read(options(refresh));
    nowMs += 12 * 3_600_000; // twelve hours — long past the transient TTL, inside no_data's 24 h
    const read = await cache.read(options(refresh));

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(read.kind).toBe('no_data');
  });

  it('honours the provider’s Retry-After as the 429 negative TTL', async () => {
    const cache = build();
    const refresh = jest.fn(() =>
      Promise.resolve<UpstreamOutcome<string>>({
        kind: 'rate_limited',
        reason: 'HTTP 429',
        retryAfterSeconds: 1_200,
      }),
    );

    await cache.read(options(refresh));
    nowMs += 400_000; // past the 300 s default, inside the 1 200 s the provider asked for
    await cache.read(options(refresh));

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('serves the stale value ALONGSIDE a binding negative entry, and still makes no call', async () => {
    // All three at once — "429 recorded, still serving a 40-minute-old number, still not calling
    // the provider" — which is the actual desired behaviour and needs the two-key layout.
    const cache = build();
    const refresh = jest
      .fn<() => Promise<UpstreamOutcome<string>>>()
      .mockResolvedValueOnce(ok('v1'))
      .mockResolvedValue({ kind: 'transient', reason: 'provider down' });

    await cache.read(options(refresh));
    nowMs += 3_700_000;
    await cache.read(options(refresh)); // serves stale, revalidation records the failure
    await flush();

    const read = await cache.read(options(refresh));
    expect(read).toMatchObject({ value: 'v1', kind: 'ok', freshness: 'stale' });
    expect(read.origin).toBe('stale_after_failure');
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('DROPS a value that breached the CACHE-AGE ceiling rather than publishing it', async () => {
    // Reachable because retention and the ceiling are different jobs: this entry is WRITTEN under
    // a six-hour ceiling and then READ under a one-hour one — exactly what happens the first time
    // MARINE_STALE_MAX_SECONDS is lowered. The rule refuses it, loudly, rather than the store
    // quietly not having it.
    const cache = build();
    await cache.read(options(() => Promise.resolve(ok('v1'))));

    nowMs += 2 * 3_600_000;
    const read = await cache.read({
      ...options(() =>
        Promise.resolve<UpstreamOutcome<string>>({ kind: 'transient', reason: 'down' }),
      ),
      ceilings: { staleMaxSeconds: 3_600, validAtMaxAgeSeconds: 10_800 },
    });

    expect(read.value).toBeNull();
    expect(metrics.get('cache.ceiling_dropped', 'open-meteo')).toBeGreaterThan(0);
    expect(events).toContainEqual(
      expect.objectContaining({
        level: 'warn',
        message: expect.stringContaining('staleness ceiling'),
        context: expect.objectContaining({ reason: 'cache_age_ceiling' }),
      }),
    );
  });

  it('drops a freshly cached value whose MODEL MOMENT is too old', async () => {
    const cache = build();
    const eightHoursAgo = nowMs - 8 * 3_600_000;
    await cache.read(options(() => Promise.resolve(ok('v1', eightHoursAgo))));

    nowMs += 60_000; // the cache entry is one minute old — impeccably fresh by cache age
    const read = await cache.read(
      options(() =>
        Promise.resolve<UpstreamOutcome<string>>({ kind: 'transient', reason: 'down' }),
      ),
    );

    expect(read.value).toBeNull();
    expect(events).toContainEqual(
      expect.objectContaining({
        level: 'warn',
        context: expect.objectContaining({ reason: 'valid_at_ceiling' }),
      }),
    );
  });

  it('coalesces concurrent cold reads into ONE upstream refresh', async () => {
    const cache = build();
    let calls = 0;
    const refresh = (): Promise<UpstreamOutcome<string>> => {
      calls += 1;
      return Promise.resolve(ok('v1'));
    };

    const reads = await Promise.all([
      cache.read(options(refresh)),
      cache.read(options(refresh)),
      cache.read(options(refresh)),
    ]);

    expect(calls).toBe(1);
    expect(reads.every((read) => read.value === 'v1')).toBe(true);
  });

  describe('when another instance holds the refresh lock', () => {
    it('serves this instance’s own stale value immediately instead of waiting', async () => {
      // With a usable value in hand the read never even reaches the lock: it answers from cache
      // and revalidates behind the response, and the revalidation is the thing that loses. Either
      // way the caller waits for nobody — which is the property under test.
      const seeded = build();
      await seeded.read(options(() => Promise.resolve(ok('v1'))));
      nowMs += 3_700_000;

      const cache = build(ALWAYS_LOSES);
      const read = await cache.read(
        options(() => Promise.reject(new Error('must not run — we lost the lock'))),
      );

      expect(read).toMatchObject({ value: 'v1', freshness: 'stale', origin: 'stale_revalidating' });
      await flush();
    });

    it('polls briefly when it holds nothing, then answers honestly', async () => {
      const cache = build(ALWAYS_LOSES);
      const read = await cache.read(
        options(() => Promise.reject(new Error('must not run — we lost the lock'))),
      );

      expect(read).toMatchObject({ value: null, origin: 'unavailable' });
      expect(read.reason).toContain('another instance');
    });

    it('serves the winner’s value if it lands during the poll', async () => {
      const winner = build();
      const cache = new UpstreamCacheService(store, ALWAYS_LOSES, metrics, {
        now: () => nowMs,
        lockLostPollDelayMs: 0,
        // The winner's write lands between the first and second poll.
        sleepImpl: async () => {
          await winner.read(options(() => Promise.resolve(ok('from-the-winner'))));
        },
      });

      const read = await cache.read(
        options(() => Promise.reject(new Error('must not run — we lost the lock'))),
      );
      expect(read).toMatchObject({ value: 'from-the-winner', origin: 'polled' });
    });
  });

  it('a background revalidation failure never escapes as an unhandled rejection', async () => {
    const cache = build();
    await cache.read(options(() => Promise.resolve(ok('v1'))));
    nowMs += 3_700_000;

    const read = await cache.read(options(() => Promise.reject(new Error('exploded'))));
    expect(read.value).toBe('v1');

    await flush();
    expect(events).toContainEqual(
      expect.objectContaining({
        level: 'warn',
        message: expect.stringContaining('background revalidation failed'),
        context: expect.objectContaining({ key: 'marine:overview' }),
      }),
    );
  });
});
