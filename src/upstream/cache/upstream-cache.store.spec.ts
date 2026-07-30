import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { FakeRedisClient } from '../../../test/support/fake-redis-client';
import { UpstreamMetrics } from '../upstream-metrics';
import {
  InProcessCacheStore,
  RedisCacheStore,
  type UpstreamCacheEntry,
} from './upstream-cache.store';

/** Captures structured events so an assertion can read them without touching an unbound method. */
interface RecordedEvent {
  level: string;
  message: string;
  context: Record<string, unknown>;
}

const STORED_AT = Date.parse('2026-07-30T12:00:00.000Z');

function entry(overrides: Partial<UpstreamCacheEntry<string>> = {}): UpstreamCacheEntry<string> {
  return {
    kind: 'ok',
    payload: 'value',
    reason: null,
    storedAtMs: STORED_AT,
    validAtMs: STORED_AT - 600_000,
    ttlSeconds: 3_600,
    ...overrides,
  };
}

/**
 * The store is the layer that decides whether a cache problem degrades or reaches a visitor.
 *
 * Every other Redis-touching class in this PR got a `failing = true` test; this one had none, so a
 * future edit turning either `catch` into a rethrow would have shipped with CI green and turned
 * the next Redis blip into a 500 on a public page (review #73, tests I1).
 */
describe('RedisCacheStore', () => {
  let redis: FakeRedisClient;
  let metrics: UpstreamMetrics;
  let events: RecordedEvent[];
  let store: RedisCacheStore;

  beforeEach(() => {
    redis = new FakeRedisClient(STORED_AT);
    metrics = new UpstreamMetrics();
    events = [];
    jest.spyOn(metrics, 'event').mockImplementation((level, message, context) => {
      events.push({ level, message, context: { ...context } });
    });
    store = new RedisCacheStore(redis, metrics, 'test:cache:');
  });

  it('round-trips an entry through JSON with every field intact', async () => {
    await store.set('k', entry(), 21_600);
    await expect(store.get<string>('k')).resolves.toEqual(entry());
  });

  it('namespaces its keys, so two consumers of one Redis cannot collide', async () => {
    await store.set('k', entry(), 21_600);
    expect(redis.keys()).toContain('test:cache:k');
  });

  it('returns a MISS — never a rejection — when Redis refuses a READ', async () => {
    redis.failing = true;
    await expect(store.get<string>('k')).resolves.toBeNull();
    expect(metrics.get('redis.degraded', 'cache')).toBe(1);
    expect(events).toContainEqual(
      expect.objectContaining({ level: 'warn', message: expect.stringContaining('degraded') }),
    );
  });

  it('swallows a failing WRITE loudly instead of failing the request', async () => {
    redis.failing = true;
    await expect(store.set('k', entry(), 21_600)).resolves.toBeUndefined();
    expect(metrics.get('redis.degraded', 'cache')).toBe(1);
  });

  it('treats an unparseable stored value as a MISS that heals on the next write', async () => {
    await redis.setWithTtl('test:cache:k', 'not json at all', 60_000);
    await expect(store.get<string>('k')).resolves.toBeNull();

    await store.set('k', entry(), 21_600);
    await expect(store.get<string>('k')).resolves.toEqual(entry());
  });

  describe('a parseable but structurally invalid entry', () => {
    // The review #73 I9 mechanism: these all used to sail through the unchecked cast, produce NaN
    // in the staleness arithmetic, and reach `new Date(NaN).toISOString()` — a RangeError, i.e. a
    // 500 on a public page for every request until the key expired (up to six hours). The
    // realistic origin is an entry-shape change across a deploy, with the previous version's
    // entries still inside their retention — which this module's boot log advertises as
    // "survives deploys".
    const malformed: ReadonlyArray<[string, string]> = [
      ['a missing storedAtMs', JSON.stringify({ kind: 'ok', payload: 'v', ttlSeconds: 60 })],
      [
        'a non-numeric storedAtMs',
        JSON.stringify({ kind: 'ok', payload: 'v', storedAtMs: 'yesterday', ttlSeconds: 60 }),
      ],
      [
        'a missing validAtMs',
        JSON.stringify({ kind: 'ok', payload: 'v', storedAtMs: STORED_AT, ttlSeconds: 60 }),
      ],
      [
        'a missing ttlSeconds',
        JSON.stringify({ kind: 'ok', payload: 'v', storedAtMs: STORED_AT, validAtMs: null }),
      ],
      [
        'an unknown kind',
        JSON.stringify({
          kind: 'teapot',
          payload: 'v',
          storedAtMs: STORED_AT,
          validAtMs: null,
          ttlSeconds: 60,
        }),
      ],
      ['a bare JSON scalar', '42'],
      ['an empty object', '{}'],
    ];

    it.each(malformed)('is a MISS: %s', async (_label, raw) => {
      await redis.setWithTtl('test:cache:k', raw, 60_000);
      await expect(store.get<string>('k')).resolves.toBeNull();
      expect(metrics.get('redis.degraded', 'cache')).toBeGreaterThan(0);
    });

    it('accepts a valid entry whose validAtMs is legitimately null', async () => {
      await store.set('k', entry({ validAtMs: null }), 21_600);
      await expect(store.get<string>('k')).resolves.toMatchObject({ validAtMs: null });
    });

    it('accepts a negative entry, which carries a reason and no payload', async () => {
      const negative: UpstreamCacheEntry<string> = {
        kind: 'rate_limited',
        payload: null,
        reason: 'HTTP 429',
        storedAtMs: STORED_AT,
        validAtMs: null,
        ttlSeconds: 300,
      };
      await store.set('k#neg', negative, 300);
      await expect(store.get<string>('k#neg')).resolves.toEqual(negative);
    });
  });

  it('repeats the degrade line at most once per window while counting every occurrence', async () => {
    // A Redis outage produces at least two of these per request; unthrottled, an outage becomes a
    // log flood on top of the outage. The counter is never sampled.
    redis.failing = true;
    for (let i = 0; i < 10; i += 1) await store.get<string>('k');

    expect(events.filter((event) => event.message.includes('degraded'))).toHaveLength(1);
    expect(metrics.get('redis.degraded', 'cache')).toBe(10);
  });
});

describe('InProcessCacheStore', () => {
  let nowMs: number;

  beforeEach(() => {
    nowMs = STORED_AT;
  });

  it('expires an entry at its retention, not at its freshness TTL', async () => {
    const store = new InProcessCacheStore(() => nowMs);
    await store.set('k', entry(), 100);

    nowMs += 99_000;
    await expect(store.get<string>('k')).resolves.not.toBeNull();
    nowMs += 2_000;
    await expect(store.get<string>('k')).resolves.toBeNull();
  });

  it('evicts the LEAST RECENTLY USED entry once the cap is reached', async () => {
    // Unbounded, this map is a memory leak with a scheduler; evicting the wrong end would throw
    // away fresh values and cause needless upstream calls. Neither was covered before.
    const store = new InProcessCacheStore(() => nowMs, 3);
    for (const key of ['a', 'b', 'c']) await store.set(key, entry(), 3_600);

    // Touch 'a' so 'b' becomes the least recently used.
    await store.get<string>('a');
    await store.set('d', entry(), 3_600);

    await expect(store.get<string>('b')).resolves.toBeNull();
    await expect(store.get<string>('a')).resolves.not.toBeNull();
    await expect(store.get<string>('c')).resolves.not.toBeNull();
    await expect(store.get<string>('d')).resolves.not.toBeNull();
  });
});
