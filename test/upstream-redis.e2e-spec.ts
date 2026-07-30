import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import { RedisSingleFlight } from '../src/upstream/cache/single-flight';
import { RedisCacheStore } from '../src/upstream/cache/upstream-cache.store';
import { IoredisAdapter } from '../src/upstream/redis/ioredis.adapter';
import type { RedisClientPort } from '../src/upstream/redis/redis-client.port';
import { UpstreamMetrics } from '../src/upstream/upstream-metrics';

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

  beforeAll(async () => {
    container = await new GenericContainer('redis:7-alpine').withExposedPorts(6379).start();
    redis = new IoredisAdapter(
      `redis://${container.getHost()}:${String(container.getMappedPort(6379))}`,
    );
  }, 120_000);

  afterAll(async () => {
    await redis.quit();
    await container.stop();
  });

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
    it('increments and keeps a FIXED window — traffic inside it cannot push the reset back', async () => {
      await expect(redis.incrementWithTtl('e2e:quota', 1)).resolves.toBe(1);
      await new Promise((resolve) => setTimeout(resolve, 400));
      await expect(redis.incrementWithTtl('e2e:quota', 1)).resolves.toBe(2);

      // The second increment must NOT have extended the window: after the original second the
      // counter is gone, whatever happened inside it.
      await new Promise((resolve) => setTimeout(resolve, 900));
      await expect(redis.incrementWithTtl('e2e:quota', 5)).resolves.toBe(1);
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
});
