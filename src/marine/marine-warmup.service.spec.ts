import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { SchedulerRegistry } from '@nestjs/schedule';
import { FakeRedisClient } from '../../test/support/fake-redis-client';
import { OperationDeadline } from '../upstream/operation-deadline';
import { UpstreamMetrics } from '../upstream/upstream-metrics';
import {
  MarineWarmupService,
  WARMUP_BOOT_TIMEOUT_NAME,
  WARMUP_INTERVAL_NAME,
  WARMUP_LOCK_KEY,
  type MarineWarmupTarget,
} from './marine-warmup.service';

/**
 * M2 registers NO targets — the tour is a no-op by design. What is tested here is the machinery
 * that has to be right before any target exists: the lock, the deadline, the overlap guard and
 * the timer lifecycle. A fake target stands in for the M3/M4 legs.
 */
describe('MarineWarmupService', () => {
  let registry: SchedulerRegistry;
  let metrics: UpstreamMetrics;
  let nowMs: number;

  function build(
    overrides: Partial<{ enabled: boolean; deadlineMs: number; intervalSeconds: number }> = {},
    redis: FakeRedisClient | null = null,
    token = 'token-a',
  ): MarineWarmupService {
    return new MarineWarmupService(registry, metrics, redis, {
      enabled: overrides.enabled ?? true,
      intervalSeconds: overrides.intervalSeconds ?? 900,
      deadlineMs: overrides.deadlineMs ?? 120_000,
      now: () => nowMs,
      tokenFactory: () => token,
    });
  }

  function target(
    label: string,
    refresh?: (deadline: OperationDeadline) => Promise<void>,
  ): MarineWarmupTarget {
    return { label, refresh: refresh ?? ((): Promise<void> => Promise.resolve()) };
  }

  beforeEach(() => {
    registry = new SchedulerRegistry();
    metrics = new UpstreamMetrics();
    jest.spyOn(metrics, 'event').mockImplementation(() => undefined);
    nowMs = Date.parse('2026-07-30T12:00:00.000Z');
  });

  describe('scheduling', () => {
    it('registers the interval and the delayed boot tour when enabled', () => {
      const service = build();
      service.onApplicationBootstrap();

      expect(registry.doesExist('interval', WARMUP_INTERVAL_NAME)).toBe(true);
      expect(registry.doesExist('timeout', WARMUP_BOOT_TIMEOUT_NAME)).toBe(true);

      service.onModuleDestroy();
      expect(registry.doesExist('interval', WARMUP_INTERVAL_NAME)).toBe(false);
      expect(registry.doesExist('timeout', WARMUP_BOOT_TIMEOUT_NAME)).toBe(false);
    });

    it('registers NOTHING when disabled — the kill switch must actually stop the timer', () => {
      // A flag that only makes the tour return early still holds a timer and still wakes the
      // process every 15 minutes; that is not what "disabled" means.
      const service = build({ enabled: false });
      service.onApplicationBootstrap();

      expect(registry.doesExist('interval', WARMUP_INTERVAL_NAME)).toBe(false);
      expect(registry.doesExist('timeout', WARMUP_BOOT_TIMEOUT_NAME)).toBe(false);
    });

    it('tears down cleanly even if bootstrap never ran', () => {
      expect(() => build({ enabled: false }).onModuleDestroy()).not.toThrow();
    });
  });

  describe('a tour', () => {
    it('does nothing when disabled', async () => {
      await expect(build({ enabled: false }).runTour('manual')).resolves.toEqual({
        ran: false,
        reason: 'disabled',
      });
    });

    it('runs with no registered targets — the whole of M2', async () => {
      const service = build();
      await expect(service.runTour('manual')).resolves.toMatchObject({
        ran: true,
        refreshed: 0,
        failed: 0,
        skipped: 0,
      });
      expect(service.targetCount).toBe(0);
    });

    it('visits every registered target and hands each one the tour’s OWN deadline', async () => {
      const service = build({ deadlineMs: 120_000 });
      const budgets: number[] = [];
      service.register(
        target('a', (deadline) => {
          budgets.push(deadline.remainingMs());
          return Promise.resolve();
        }),
      );
      service.register(target('b'));

      await expect(service.runTour('manual')).resolves.toMatchObject({ ran: true, refreshed: 2 });
      // 120 s, not the request path's 6 s: nobody is waiting for this tour (SPEC-ADDENDUM §6.4).
      expect(budgets[0]).toBe(120_000);
    });

    it('keeps going when one target throws, and never goes quiet about it', async () => {
      const service = build();
      service.register(target('broken', () => Promise.reject(new Error('bug in the adapter'))));
      service.register(target('healthy'));

      await expect(service.runTour('manual')).resolves.toMatchObject({
        ran: true,
        refreshed: 1,
        failed: 1,
      });
    });

    it('stops visiting targets once its own deadline elapses', async () => {
      const service = build({ deadlineMs: 1_000 });
      const visited: string[] = [];
      service.register(
        target('first', () => {
          visited.push('first');
          nowMs += 5_000; // the tour's budget is spent inside the first target
          return Promise.resolve();
        }),
      );
      service.register(
        target('second', () => {
          visited.push('second');
          return Promise.resolve();
        }),
      );

      await expect(service.runTour('manual')).resolves.toMatchObject({
        ran: true,
        refreshed: 1,
        skipped: 1,
      });
      expect(visited).toEqual(['first']);
    });

    it('refuses to overlap itself on one instance', async () => {
      const service = build();
      let release: (() => void) | undefined;
      service.register(target('slow', () => new Promise<void>((resolve) => (release = resolve))));

      const first = service.runTour('scheduled');
      await expect(service.runTour('scheduled')).resolves.toEqual({
        ran: false,
        reason: 'overlap',
      });

      release?.();
      await first;
    });
  });

  describe('the cross-instance lock', () => {
    it('takes the lock, runs, and releases it', async () => {
      const redis = new FakeRedisClient(nowMs);
      const service = build({}, redis);

      await expect(service.runTour('manual')).resolves.toMatchObject({ ran: true });
      expect(redis.keys()).not.toContain(WARMUP_LOCK_KEY);
    });

    it('skips the tour entirely when another instance holds the lock', async () => {
      const redis = new FakeRedisClient(nowMs);
      await redis.setIfAbsent(WARMUP_LOCK_KEY, 'someone-else', 120_000);

      await expect(build({}, redis).runTour('scheduled')).resolves.toEqual({
        ran: false,
        reason: 'lock_held',
      });
      // …and the other instance's lock is still theirs.
      await expect(redis.get(WARMUP_LOCK_KEY)).resolves.toBe('someone-else');
    });

    it('never releases a lock it no longer owns', async () => {
      // The winner overruns its lock TTL, the lock expires, another instance takes it. A bare DEL
      // would erase the NEW owner's lock and let two tours hit the provider at once.
      const redis = new FakeRedisClient(nowMs);
      const service = build({ deadlineMs: 1_000 }, redis, 'token-slow');
      let release: (() => void) | undefined;
      service.register(target('slow', () => new Promise<void>((resolve) => (release = resolve))));

      const running = service.runTour('manual');
      await new Promise((resolve) => setImmediate(resolve)); // let the tour take its lock
      redis.advance(2_000);
      await redis.setIfAbsent(WARMUP_LOCK_KEY, 'token-other', 120_000);

      release?.();
      await running;

      await expect(redis.get(WARMUP_LOCK_KEY)).resolves.toBe('token-other');
    });

    it('SKIPS the tour when Redis cannot answer, instead of running unlocked everywhere', async () => {
      // Unlike a cache read (where degrading keeps the site up), an unlocked tour multiplies
      // upstream load by the instance count — the exact thing the lock exists to prevent.
      const redis = new FakeRedisClient(nowMs);
      redis.failing = true;
      const service = build({}, redis);
      const visited: string[] = [];
      service.register(
        target('a', () => {
          visited.push('a');
          return Promise.resolve();
        }),
      );

      // Its own reason, not `lock_held`: the decision is the same but the situation is not, and a
      // result claiming a peer holds a lock nobody holds sends the reader hunting for that peer.
      await expect(service.runTour('scheduled')).resolves.toEqual({
        ran: false,
        reason: 'redis_unavailable',
      });
      expect(visited).toEqual([]);
      expect(metrics.get('redis.degraded', 'warmup')).toBe(1);
    });

    it('needs no lock in single-instance mode', async () => {
      await expect(build({}, null).runTour('manual')).resolves.toMatchObject({ ran: true });
    });
  });
});
