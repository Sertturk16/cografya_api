import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { OperationDeadline } from '../operation-deadline';
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

    it('reports the winner’s NEGATIVE outcome instead of waiting out the full poll', async () => {
      // The winner's refresh fails DURING our poll: the correct reason (`rate_limited`) is written
      // to `<key>#neg` while we are sleeping. Polling only the value key meant sleeping out the
      // remaining 750 ms and then answering with a generic `transient` — a wrong kind, paid for
      // with latency, when the right answer was already there.
      const winner = build();
      const cache = new UpstreamCacheService(store, ALWAYS_LOSES, metrics, {
        now: () => nowMs,
        lockLostPollDelayMs: 0,
        sleepImpl: async () => {
          await winner.read(
            options(() =>
              Promise.resolve<UpstreamOutcome<string>>({
                kind: 'rate_limited',
                reason: 'HTTP 429',
                retryAfterSeconds: 600,
              }),
            ),
          );
        },
      });

      const read = await cache.read(
        options(() => Promise.reject(new Error('must not run — we lost the lock'))),
      );

      expect(read).toMatchObject({ kind: 'rate_limited', origin: 'polled' });
      expect(read.reason).toContain('429');
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

  it('treats `Retry-After: 0` as no hint at all instead of a zero-length suppression', async () => {
    // `??` does not catch 0, so the negative entry was written with ttlSeconds: 0 and expired
    // before the next read — we called the provider that had just said stop, immediately, in a
    // tight loop. A MISSING header was handled better than a present one (review #73 I3).
    const cache = build();
    const refresh = jest.fn(() =>
      Promise.resolve<UpstreamOutcome<string>>({
        kind: 'rate_limited',
        reason: 'HTTP 429',
        retryAfterSeconds: 0,
      }),
    );

    await cache.read(options(refresh));
    nowMs += 30_000; // inside the 300 s default the header failed to override
    await cache.read(options(refresh));

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('suppresses a budget refusal for the transient TTL, as its own kind', async () => {
    const cache = build();
    const refresh = jest.fn(() =>
      Promise.resolve<UpstreamOutcome<string>>({
        kind: 'budget_exhausted',
        reason: 'provider budget exhausted (day limit 4000)',
      }),
    );

    const first = await cache.read(options(refresh));
    expect(first.kind).toBe('budget_exhausted');

    nowMs += 30_000;
    await cache.read(options(refresh));
    expect(refresh).toHaveBeenCalledTimes(1);

    nowMs += 61_000; // past the 60 s transient TTL — our own window may have rolled over
    await cache.read(options(refresh));
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('uses the CALLER’s deadline when one request reads several keys', async () => {
    // Otherwise N keys get N × 6 s and one request can spend 18 s while every individual timeout
    // looks correct — structurally the bug §6.4 exists to prevent (review #73 I2).
    const cache = build();
    const shared = new OperationDeadline(6_000);
    const seen: OperationDeadline[] = [];

    for (const key of ['a', 'b', 'c']) {
      await cache.read({
        ...options((deadline) => {
          seen.push(deadline);
          return Promise.resolve(ok('v'));
        }),
        key,
        deadline: shared,
      });
    }

    expect(seen).toHaveLength(3);
    expect(seen.every((deadline) => deadline === shared)).toBe(true);
  });

  it('mints a FRESH deadline for a background revalidation, never the caller’s spent one', async () => {
    const cache = build();
    const shared = new OperationDeadline(6_000);
    const seen: OperationDeadline[] = [];

    const read = (): Promise<unknown> =>
      cache.read({
        ...options((deadline) => {
          seen.push(deadline);
          return Promise.resolve(ok('v'));
        }),
        deadline: shared,
        revalidateDeadlineMs: 120_000,
      });

    await read();
    nowMs += 3_700_000;
    await read();
    await flush();

    expect(seen).toHaveLength(2);
    expect(seen[0]).toBe(shared);
    // The response is already sent; borrowing a nearly-spent request budget would abort the
    // refresh the next reader depends on.
    expect(seen[1]).not.toBe(shared);
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

  describe('peek — read-only, no refresh, no negative writes (marine M4 U-1)', () => {
    function peekOptions() {
      return { key: 'marine:overview', providerId: 'open-meteo', ttls: TTLS, ceilings: CEILINGS };
    }

    it('serves a fresh value with origin peeked', async () => {
      const cache = build();
      await cache.read(options(() => Promise.resolve(ok('v1'))));
      nowMs += 600_000;

      const peeked = await cache.peek<string>(peekOptions());
      expect(peeked).toMatchObject({
        value: 'v1',
        kind: 'ok',
        freshness: 'fresh',
        origin: 'peeked',
      });
      expect(peeked.cacheAgeSeconds).toBe(600);
    });

    it('serves a stale value WITHOUT starting a revalidation', async () => {
      const cache = build();
      let served = 0;
      const refresh = jest.fn(() => Promise.resolve(ok(`v${String(++served)}`)));
      await cache.read(options(refresh));
      nowMs += 3_700_000; // past the 1 h freshness TTL

      const peeked = await cache.peek<string>(peekOptions());
      await flush();

      expect(peeked).toMatchObject({ value: 'v1', freshness: 'stale', origin: 'peeked' });
      // read() at this age would have revalidated behind the response; peek must not.
      expect(refresh).toHaveBeenCalledTimes(1);
    });

    it('a cold peek answers unavailable and WRITES NO NEGATIVE ENTRY — the next read still refreshes', async () => {
      const cache = build();
      const peeked = await cache.peek<string>(peekOptions());
      expect(peeked).toMatchObject({ value: null, kind: 'transient', origin: 'unavailable' });
      // `cache.miss` means "a refresh was attempted" — a peek attempts none.
      expect(metrics.get('cache.miss', 'open-meteo')).toBe(0);

      // THE warmup-starvation proof (plan §4.4): had the peek written a 60 s transient negative,
      // this read would answer negative_hit and never run the closure.
      const refresh = jest.fn(() => Promise.resolve(ok('v1')));
      const read = await cache.read(options(refresh));
      expect(refresh).toHaveBeenCalledTimes(1);
      expect(read).toMatchObject({ value: 'v1', origin: 'refreshed' });
    });

    it('reports a binding negative honestly, with its own kind', async () => {
      const cache = build();
      await cache.read(
        options(() => Promise.resolve({ kind: 'no_data', reason: 'land mask here' })),
      );

      const peeked = await cache.peek<string>(peekOptions());
      expect(peeked).toMatchObject({ value: null, kind: 'no_data', origin: 'peeked' });
    });

    it('labels a stale value shadowed by a binding negative stale_after_failure — a sweep must not race the negative TTL', async () => {
      const cache = build();
      await cache.read(options(() => Promise.resolve(ok('v1'))));
      nowMs += 3_700_000;
      // The revalidation fails and records a 60 s transient negative next to the stale value.
      await cache.read(options(() => Promise.resolve({ kind: 'transient', reason: 'down' })));
      await flush();

      const peeked = await cache.peek<string>(peekOptions());
      expect(peeked).toMatchObject({ value: 'v1', kind: 'ok', origin: 'stale_after_failure' });

      // Once the negative expires, the same peek reads as plainly stale (due for refresh).
      nowMs += 61_000;
      const later = await cache.peek<string>(peekOptions());
      expect(later).toMatchObject({ value: 'v1', freshness: 'stale', origin: 'peeked' });
    });

    it('applies the staleness ceilings on the way out, like read()', async () => {
      const cache = build();
      await cache.read(options(() => Promise.resolve(ok('v1'))));
      nowMs += (CEILINGS.staleMaxSeconds + 60) * 1000;

      const peeked = await cache.peek<string>(peekOptions());
      expect(peeked).toMatchObject({ value: null, origin: 'unavailable' });
      expect(metrics.get('cache.ceiling_dropped', 'open-meteo')).toBe(1);
    });
  });
});
