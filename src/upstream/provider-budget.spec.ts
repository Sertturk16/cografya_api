import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { FakeRedisClient } from '../../test/support/fake-redis-client';
import { ProviderBudget, type ProviderBudgetLimits } from './provider-budget';
import { UpstreamMetrics } from './upstream-metrics';

/** Captures structured events so an assertion can read them without touching an unbound method. */
interface RecordedEvent {
  level: string;
  message: string;
  context: Record<string, unknown>;
}

// perHour deliberately sits just one above perMinute so the rollover test can prove the
// HOUR window keeps counting after the minute window resets.
const LIMITS: ProviderBudgetLimits = { perMinute: 3, perHour: 4, perDay: 6 };

describe('ProviderBudget', () => {
  let metrics: UpstreamMetrics;
  let events: RecordedEvent[];
  let nowMs: number;

  beforeEach(() => {
    metrics = new UpstreamMetrics();
    events = [];
    jest.spyOn(metrics, 'event').mockImplementation((level, message, context) => {
      events.push({ level, message, context: { ...context } });
    });
    nowMs = 1_800_000_000_000;
  });

  describe('in-process counters', () => {
    it('allows calls up to the minute limit and refuses the one after', async () => {
      const budget = new ProviderBudget(metrics, null, () => nowMs);

      for (let i = 0; i < LIMITS.perMinute; i += 1) {
        await expect(budget.tryConsume('open-meteo', LIMITS)).resolves.toEqual({ allowed: true });
      }
      await expect(budget.tryConsume('open-meteo', LIMITS)).resolves.toEqual({
        allowed: false,
        window: 'minute',
        limit: LIMITS.perMinute,
      });
      expect(metrics.get('budget.rejected', 'open-meteo')).toBe(1);
    });

    it('resets when the minute window rolls over, but the hour window keeps counting', async () => {
      const budget = new ProviderBudget(metrics, null, () => nowMs);

      for (let i = 0; i < 3; i += 1) await budget.tryConsume('open-meteo', LIMITS);
      nowMs += 61_000;
      await expect(budget.tryConsume('open-meteo', LIMITS)).resolves.toEqual({ allowed: true });
      await expect(budget.tryConsume('open-meteo', LIMITS)).resolves.toEqual({
        allowed: false,
        window: 'hour',
        limit: LIMITS.perHour,
      });
    });

    it('keeps providers independent — CMEMS volume must not throttle Open-Meteo', async () => {
      const budget = new ProviderBudget(metrics, null, () => nowMs);
      for (let i = 0; i < 10; i += 1) await budget.tryConsume('cmems', LIMITS);
      await expect(budget.tryConsume('open-meteo', LIMITS)).resolves.toEqual({ allowed: true });
    });

    it('LOGS the exhaustion — a silent budget stop is indistinguishable from a broken provider', async () => {
      const budget = new ProviderBudget(metrics, null, () => nowMs);
      for (let i = 0; i < 4; i += 1) await budget.tryConsume('open-meteo', LIMITS);
      expect(events).toContainEqual(
        expect.objectContaining({
          level: 'error',
          message: expect.stringContaining('budget exhausted'),
          context: expect.objectContaining({ provider: 'open-meteo' }),
        }),
      );
    });
  });

  describe('Redis-shared counters', () => {
    it('shares one count across instances, so N instances do not get N× the quota', async () => {
      const redis = new FakeRedisClient(nowMs);
      const instanceA = new ProviderBudget(metrics, redis, () => nowMs);
      const instanceB = new ProviderBudget(metrics, redis, () => nowMs);

      await instanceA.tryConsume('open-meteo', LIMITS);
      await instanceB.tryConsume('open-meteo', LIMITS);
      await instanceA.tryConsume('open-meteo', LIMITS);

      // Four calls have been made between the two instances; the fourth breaches perMinute = 3.
      await expect(instanceB.tryConsume('open-meteo', LIMITS)).resolves.toEqual({
        allowed: false,
        window: 'minute',
        limit: LIMITS.perMinute,
      });
    });

    it('falls back to this instance only when Redis is unreachable, loudly', async () => {
      const redis = new FakeRedisClient(nowMs);
      const budget = new ProviderBudget(metrics, redis, () => nowMs);
      redis.failing = true;

      // Fail-OPEN to the local counter, not fail-closed: refusing every call because the cache is
      // down would take the feature off the page for a reason that has nothing to do with quota.
      await expect(budget.tryConsume('open-meteo', LIMITS)).resolves.toEqual({ allowed: true });
      expect(metrics.get('redis.degraded', 'open-meteo')).toBeGreaterThan(0);
      expect(events).toContainEqual(
        expect.objectContaining({
          level: 'warn',
          message: expect.stringContaining('this instance only'),
          context: expect.objectContaining({ provider: 'open-meteo' }),
        }),
      );
    });

    it('still enforces the limit while degraded — per-instance accounting beats none', async () => {
      const redis = new FakeRedisClient(nowMs);
      const budget = new ProviderBudget(metrics, redis, () => nowMs);
      redis.failing = true;

      for (let i = 0; i < 3; i += 1) await budget.tryConsume('cmems', LIMITS);
      await expect(budget.tryConsume('cmems', LIMITS)).resolves.toEqual({
        allowed: false,
        window: 'minute',
        limit: LIMITS.perMinute,
      });
    });
  });
});
