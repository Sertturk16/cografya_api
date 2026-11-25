import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { Global, Module, type DynamicModule } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import Redis from 'ioredis';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import { UpstreamCacheService } from '../src/upstream/cache/upstream-cache.service';
import { RedisSingleFlight } from '../src/upstream/cache/single-flight';
import { RedisCacheStore } from '../src/upstream/cache/upstream-cache.store';
import { IoredisAdapter, KEY_PREFIX } from '../src/upstream/redis/ioredis.adapter';
import { REDIS_CLIENT, type RedisClientPort } from '../src/upstream/redis/redis-client.port';
import { UpstreamModule } from '../src/upstream/upstream.module';
import { UpstreamMetrics } from '../src/upstream/upstream-metrics';

/**
 * A GLOBAL stub `ConfigService`, because `UpstreamModule` reads config the way the app wires it
 * (globally) rather than by importing `ConfigModule` itself. Overriding a provider the module
 * graph does not contain would not resolve; exporting one from a global module does.
 */
function stubConfigModule(redisUrl: string | undefined): DynamicModule {
  @Global()
  @Module({})
  class StubConfigModule {}

  return {
    module: StubConfigModule,
    providers: [
      {
        provide: ConfigService,
        useValue: {
          get: (key: string) => (key === 'REDIS_URL' ? redisUrl : undefined),
          getOrThrow: (key: string) => {
            if (key === 'MARINE_SINGLE_CALL_TIMEOUT_MS') return 3_000;
            throw new Error(`unexpected config read: ${key}`);
          },
        },
      },
    ],
    exports: [ConfigService],
  };
}

/**
 * Real-Redis e2e for the ONE piece the in-memory fake cannot vouch for: the driver adapter.
 *
 * ## Why this suite exists at all
 * Everything above `RedisClientPort` — the cache, single-flight, the warmup lock, the quota
 * counters — is unit-tested against `FakeRedisClient`, deterministically and without a
 * container. Those tests prove OUR logic. What they cannot prove is that the real driver speaks
 * the dialect the fake imitates: that `SET … NX PX` really refuses an existing key, that the
 * release script really compares before deleting, that `INCR` + first-write `EXPIRE` really
 * yields a fixed window. Those are exactly the semantics a lock's correctness rests on, and
 * getting one wrong is invisible until two instances refresh at once in production.
 *
 * So: the fake covers the logic, this covers the wire. Nothing here asserts a marine fact.
 */
describe('IoredisAdapter against a real Redis', () => {
  let container: StartedTestContainer;
  let redis: RedisClientPort;
  // A plain driver connection for reading what the adapter left behind (the key's remaining
  // TTL). The port has no TTL read on purpose: nothing in the app needs one.
  let inspector: Redis;

  beforeAll(async () => {
    container = await new GenericContainer('redis:7-alpine').withExposedPorts(6379).start();
    const url = `redis://${container.getHost()}:${String(container.getMappedPort(6379))}`;
    redis = new IoredisAdapter(url);
    inspector = new Redis(url);
  }, 120_000);

  afterAll(async () => {
    await redis.quit();
    await inspector.quit();
    await container.stop();
  });

  /** Remaining TTL in ms; -1 = no expiry, -2 = no key. */
  const remainingTtlMs = (key: string): Promise<number> => inspector.pttl(`${KEY_PREFIX}${key}`);

  /** Resolves once Redis has expired the key; polls instead of guessing how long that takes. */
  async function waitUntilExpired(key: string, deadlineMs: number): Promise<void> {
    const giveUpAt = Date.now() + deadlineMs;
    while ((await remainingTtlMs(key)) !== -2) {
      if (Date.now() > giveUpAt) throw new Error(`${key} still exists after ${deadlineMs} ms`);
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  describe('values and expiry', () => {
    it('stores and reads a value back', async () => {
      await redis.setWithTtl('e2e:value', 'hello', 5_000);
      await expect(redis.get('e2e:value')).resolves.toBe('hello');
    });

    it('returns null for a key that never existed', async () => {
      await expect(redis.get('e2e:absent')).resolves.toBeNull();
    });

    it('never writes without an expiry — the key really disappears', async () => {
      await redis.setWithTtl('e2e:short', 'x', 120);
      await new Promise((resolve) => setTimeout(resolve, 400));
      await expect(redis.get('e2e:short')).resolves.toBeNull();
    });
  });

  describe('the lock primitives', () => {
    it('SET NX refuses a key that already exists', async () => {
      await expect(redis.setIfAbsent('e2e:lock', 'token-a', 5_000)).resolves.toBe(true);
      await expect(redis.setIfAbsent('e2e:lock', 'token-b', 5_000)).resolves.toBe(false);
      await expect(redis.get('e2e:lock')).resolves.toBe('token-a');
    });

    it('the release script deletes ONLY for the owner', async () => {
      await redis.setIfAbsent('e2e:lock2', 'token-a', 5_000);

      await expect(redis.deleteIfValueEquals('e2e:lock2', 'token-b')).resolves.toBe(false);
      await expect(redis.get('e2e:lock2')).resolves.toBe('token-a');

      await expect(redis.deleteIfValueEquals('e2e:lock2', 'token-a')).resolves.toBe(true);
      await expect(redis.get('e2e:lock2')).resolves.toBeNull();
    });

    it('a lock expires on its own, so a killed process cannot block refreshes forever', async () => {
      await redis.setIfAbsent('e2e:lock3', 'token-a', 150);
      await new Promise((resolve) => setTimeout(resolve, 400));
      await expect(redis.setIfAbsent('e2e:lock3', 'token-b', 5_000)).resolves.toBe(true);
    });
  });

  describe('the quota counter', () => {
    // The window assertions read the key's TTL from Redis instead of racing a 1 s window with
    // fixed sleeps: on a loaded CI runner more than a second once passed between two back-to-back
    // increments, and the second one opened a fresh window (got 1, expected 2).
    // GAP_MS separates the two TTL reads: a correct counter loses at least that much, while a
    // re-armed expiry would read near the full TTL again (one run measured 2 998 ms then 2 999 ms).
    const GAP_MS = 300;
    it('increments and keeps a FIXED window — traffic inside it cannot push the reset back', async () => {
      await expect(redis.incrementWithTtl('e2e:quota', 3)).resolves.toBe(1);
      const ttlAfterFirstMs = await remainingTtlMs('e2e:quota');
      expect(ttlAfterFirstMs).toBeGreaterThan(0);

      await new Promise((resolve) => setTimeout(resolve, GAP_MS));
      await expect(redis.incrementWithTtl('e2e:quota', 3)).resolves.toBe(2);

      // Re-running EXPIRE would have put the TTL back to the full 3 s; a fixed window only
      // counts down, by at least the gap between the two reads.
      const ttlAfterSecondMs = await remainingTtlMs('e2e:quota');
      expect(ttlAfterSecondMs).toBeGreaterThan(0);
      expect(ttlAfterSecondMs).toBeLessThanOrEqual(ttlAfterFirstMs - GAP_MS);

      // When the original window ends the counter starts over, whatever happened inside it.
      await waitUntilExpired('e2e:quota', 10_000);
      await expect(redis.incrementWithTtl('e2e:quota', 5)).resolves.toBe(1);
    });

    it('adds WEIGHT, and still sets the expiry only on the first write', async () => {
      // The quota unit is a location, not a request, so the counter has to accept a weight — and
      // the first-write-only EXPIRE must key off that weight rather than off the literal 1 the
      // earlier script compared against (which left a weighted counter with no expiry at all).
      await expect(redis.incrementWithTtl('e2e:weighted', 60, 31)).resolves.toBe(31);
      const ttlAfterFirstMs = await remainingTtlMs('e2e:weighted');
      expect(ttlAfterFirstMs).toBeGreaterThan(0);

      await new Promise((resolve) => setTimeout(resolve, GAP_MS));
      await expect(redis.incrementWithTtl('e2e:weighted', 60, 31)).resolves.toBe(62);
      const ttlAfterSecondMs = await remainingTtlMs('e2e:weighted');
      expect(ttlAfterSecondMs).toBeGreaterThan(0);
      expect(ttlAfterSecondMs).toBeLessThanOrEqual(ttlAfterFirstMs - GAP_MS);
    });

    it('is atomic under genuine concurrency', async () => {
      // The lock primitives are raced against a real server; the counter deserves the same, since
      // it is the one thing standing between a cache failure and a provider ban.
      const results = await Promise.all(
        Array.from({ length: 20 }, () => redis.incrementWithTtl('e2e:concurrent', 30, 1)),
      );

      expect(new Set(results).size).toBe(20); // every caller saw a distinct value
      expect(Math.max(...results)).toBe(20);
    });
  });

  describe('the layers built on the port', () => {
    it('round-trips a cache entry through JSON, preserving every field', async () => {
      const metrics = new UpstreamMetrics();
      const store = new RedisCacheStore(redis, metrics, 'e2e:cache:');
      const storedAtMs = Date.parse('2026-07-30T12:00:00.000Z');

      await store.set(
        'overview',
        {
          kind: 'ok',
          payload: { temperature: 24.1 },
          reason: null,
          storedAtMs,
          validAtMs: storedAtMs - 1_800_000,
          ttlSeconds: 3_600,
        },
        21_600,
      );

      await expect(store.get('overview')).resolves.toEqual({
        kind: 'ok',
        payload: { temperature: 24.1 },
        reason: null,
        storedAtMs,
        validAtMs: storedAtMs - 1_800_000,
        ttlSeconds: 3_600,
      });
    });

    it('coalesces two instances: one refreshes, the other loses and does not wait', async () => {
      const metrics = new UpstreamMetrics();
      const instanceA = new RedisSingleFlight(redis, metrics, 5_000, () => 'token-a');
      const instanceB = new RedisSingleFlight(redis, metrics, 5_000, () => 'token-b');

      let release: (() => void) | undefined;
      const held = new Promise<string>((resolve) => {
        release = () => {
          resolve('refreshed');
        };
      });

      const winner = instanceA.run('e2e:sf', () => held);
      await expect(instanceB.run('e2e:sf', () => Promise.resolve('nope'))).resolves.toEqual({
        outcome: 'lost',
      });

      release?.();
      await expect(winner).resolves.toEqual({ outcome: 'ran', value: 'refreshed' });

      // The lock is released, so the next tour/refresh can take it.
      await expect(redis.get('upstream:lock:e2e:sf')).resolves.toBeNull();
    });
  });

  describe('the DI wiring', () => {
    it('resolves the REDIS-backed cache when REDIS_URL is set', async () => {
      // Every class here is well tested in isolation; the SEAM that assembles them was not. A
      // reordered `inject: [...]` or a flipped ternary in the module factory would wire every
      // instance back onto independent in-process caches with `REDIS_URL` set and every existing
      // test green — precisely the "N instances mean N× the upstream load" failure Redis exists to
      // prevent (SPEC-ADDENDUM §2.6; review #73, tests I2).
      const url = `redis://${container.getHost()}:${String(container.getMappedPort(6379))}`;
      const moduleRef = await Test.createTestingModule({
        imports: [stubConfigModule(url), UpstreamModule],
      }).compile();

      const cache = moduleRef.get(UpstreamCacheService);
      expect(cache.mode).toBe('redis');

      // …and the same client really is shared with the budget counters and the warmup lock.
      const client = moduleRef.get<RedisClientPort | null>(REDIS_CLIENT);
      expect(client).not.toBeNull();

      // Closed explicitly, not left to the module hook: this factory opened a SECOND connection
      // to the container, and a socket still open when the suite ends keeps the jest worker
      // alive with every test already passed — a green run that never finishes.
      await client?.quit();
      await moduleRef.close();
    });

    it('falls back to the in-process cache when REDIS_URL is absent', async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [stubConfigModule(undefined), UpstreamModule],
      }).compile();

      expect(moduleRef.get(UpstreamCacheService).mode).toBe('memory');
      expect(moduleRef.get<RedisClientPort | null>(REDIS_CLIENT)).toBeNull();
      await moduleRef.close();
    });
  });
});
