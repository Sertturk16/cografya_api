import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Logger } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { FakeRedisClient } from '../../test/support/fake-redis-client';
import { OperationDeadline } from './operation-deadline';
import { UpstreamMetrics } from './upstream-metrics';
import {
  ScheduledWarmupService,
  warmupBootTimeoutName,
  warmupIntervalName,
  warmupLockKey,
  type ScheduledWarmupTarget,
} from './scheduled-warmup.service';

/** The names the marine leg has used since M2 — frozen, because production already runs them. */
const WARMUP_LOCK_KEY = warmupLockKey('marine');
const WARMUP_INTERVAL_NAME = warmupIntervalName('marine');
const WARMUP_BOOT_TIMEOUT_NAME = warmupBootTimeoutName('marine');

/**
 * A tour with NO targets registered is a no-op by design. What is tested here is the machinery
 * that has to be right before any target exists: the lock, the deadline, the overlap guard and
 * the timer lifecycle. A fake target stands in for a real provider leg.
 */
describe('ScheduledWarmupService', () => {
  let registry: SchedulerRegistry;
  let metrics: UpstreamMetrics;
  let nowMs: number;

  function build(
    overrides: Partial<{
      name: string;
      enabled: boolean;
      deadlineMs: number;
      intervalSeconds: number;
      disabledBy: string;
    }> = {},
    redis: FakeRedisClient | null = null,
    token = 'token-a',
  ): ScheduledWarmupService {
    return new ScheduledWarmupService(registry, metrics, redis, {
      name: overrides.name ?? 'marine',
      enabled: overrides.enabled ?? true,
      disabledBy: overrides.disabledBy ?? 'MARINE_ENABLED / MARINE_WARMUP_ENABLED',
      intervalSeconds: overrides.intervalSeconds ?? 900,
      deadlineMs: overrides.deadlineMs ?? 120_000,
      now: () => nowMs,
      tokenFactory: () => token,
    });
  }

  function target(
    label: string,
    refresh?: (deadline: OperationDeadline) => Promise<void>,
  ): ScheduledWarmupTarget {
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

    it("the disabled line names the OWNING leg's env vars, not a hardcoded pair (CR-1)", () => {
      // Marine's line is pinned byte-for-byte: parameterising it must not change what the
      // instance that has printed it since M2 prints.
      const logged: string[] = [];
      const marine = build({ enabled: false });
      jest.spyOn(Logger.prototype, 'log').mockImplementation((message: unknown) => {
        logged.push(String(message));
      });
      marine.onApplicationBootstrap();
      expect(logged).toContain(
        'warmup is disabled (MARINE_ENABLED / MARINE_WARMUP_ENABLED) — no timers',
      );

      // A second leg says its OWN names — the failure this field exists to prevent is an
      // operator sent to the wrong kill switch.
      logged.length = 0;
      build({
        enabled: false,
        name: 'air-quality',
        disabledBy: 'AIR_QUALITY_ENABLED / AIR_QUALITY_INGEST_ENABLED',
      }).onApplicationBootstrap();
      expect(logged).toContain(
        'warmup is disabled (AIR_QUALITY_ENABLED / AIR_QUALITY_INGEST_ENABLED) — no timers',
      );
      jest.restoreAllMocks();
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
      // Labelled with the leg's name, not a shared 'warmup' — with two legs in one process a
      // single label cannot answer WHICH leg lost Redis (the A0 move's one declared assertion
      // change).
      expect(metrics.get('redis.degraded', 'marine')).toBe(1);
    });

    it('needs no lock in single-instance mode', async () => {
      await expect(build({}, null).runTour('manual')).resolves.toMatchObject({ ran: true });
    });
  });

  describe('the names derived from `name`', () => {
    it('reproduces the marine leg’s pre-move names byte for byte', () => {
      // Not a tautology: these three strings are a LIVE contract with a running deployment. A
      // one-character drift in the lock key lets two tours run at once against the provider with
      // nothing in the log to show for it, and a drifted timer name orphans the shutdown teardown.
      expect(warmupLockKey('marine')).toBe('marine:warmup:lock');
      expect(warmupIntervalName('marine')).toBe('marine-warmup-interval');
      expect(warmupBootTimeoutName('marine')).toBe('marine-warmup-boot');
    });

    it('registers the marine timers under exactly those names', () => {
      const service = build();
      service.onApplicationBootstrap();

      expect(registry.doesExist('interval', 'marine-warmup-interval')).toBe(true);
      expect(registry.doesExist('timeout', 'marine-warmup-boot')).toBe(true);

      service.onModuleDestroy();
    });

    it('takes its lock under exactly that key', async () => {
      // Asserted from the OUTSIDE: a foreign holder of the literal key must make the tour skip.
      const redis = new FakeRedisClient(nowMs);
      await redis.setIfAbsent('marine:warmup:lock', 'someone-else', 120_000);

      await expect(build({}, redis).runTour('scheduled')).resolves.toEqual({
        ran: false,
        reason: 'lock_held',
      });
    });
  });

  describe('two legs in one process', () => {
    it('keeps separate timers, and one leg’s shutdown leaves the other’s alone', () => {
      const marine = build({ name: 'marine' });
      const airQuality = build({ name: 'air-quality' });

      marine.onApplicationBootstrap();
      airQuality.onApplicationBootstrap();

      expect(registry.doesExist('interval', 'marine-warmup-interval')).toBe(true);
      expect(registry.doesExist('interval', 'air-quality-warmup-interval')).toBe(true);

      marine.onModuleDestroy();

      expect(registry.doesExist('interval', 'marine-warmup-interval')).toBe(false);
      expect(registry.doesExist('timeout', 'marine-warmup-boot')).toBe(false);
      expect(registry.doesExist('interval', 'air-quality-warmup-interval')).toBe(true);
      expect(registry.doesExist('timeout', 'air-quality-warmup-boot')).toBe(true);

      airQuality.onModuleDestroy();
    });

    it('takes separate locks — one leg’s held lock never skips the other’s tour', async () => {
      // The reason the lock key is derived rather than shared: a shared key would make each leg
      // silently swallow the other's tours, at exactly the cadence nobody is watching.
      const redis = new FakeRedisClient(nowMs);
      await redis.setIfAbsent('marine:warmup:lock', 'the-marine-instance', 120_000);

      await expect(
        build({ name: 'air-quality' }, redis, 'token-air').runTour('scheduled'),
      ).resolves.toMatchObject({ ran: true });

      // …and the air-quality tour released only its OWN lock.
      await expect(redis.get('marine:warmup:lock')).resolves.toBe('the-marine-instance');
      expect(redis.keys()).not.toContain('air-quality:warmup:lock');
    });

    it('counts a Redis outage against the leg that suffered it', async () => {
      const redis = new FakeRedisClient(nowMs);
      redis.failing = true;

      await expect(
        build({ name: 'air-quality' }, redis).runTour('scheduled'),
      ).resolves.toMatchObject({ reason: 'redis_unavailable' });

      expect(metrics.get('redis.degraded', 'air-quality')).toBe(1);
      expect(metrics.get('redis.degraded', 'marine')).toBe(0);
    });
  });
});
