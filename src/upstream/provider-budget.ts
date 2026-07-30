import type { RedisClientPort } from './redis/redis-client.port';
import type { UpstreamMetrics } from './upstream-metrics';

/**
 * A provider's own published quota, expressed as the three windows the providers themselves use.
 *
 * ## Fixed windows, not a leaky token bucket — a deliberate deviation from the addendum's wording
 * SPEC-ADDENDUM §6.5 says "token bucket". The published quotas are literally *N per minute, M
 * per hour, K per day* (§2.7), and a token bucket cannot express three nested caps: a refill
 * rate that satisfies the daily cap permits a burst that breaches the minute cap, and vice
 * versa. Fixed windows model the quota exactly as the provider counts it, which is the only
 * accounting that can actually keep us under the limit. The cost — up to 2× the limit across a
 * window boundary — is irrelevant at our numbers (steady state is 48 calls/day against a 600/day
 * budget, itself 6% of the free tier).
 */
export interface ProviderBudgetLimits {
  perMinute: number;
  perHour: number;
  perDay: number;
}

export type BudgetWindow = 'minute' | 'hour' | 'day';

export type BudgetDecision =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly window: BudgetWindow; readonly limit: number };

const WINDOW_SECONDS: Readonly<Record<BudgetWindow, number>> = {
  minute: 60,
  hour: 3_600,
  day: 86_400,
};

/**
 * The last line of defence between a cache failure and a provider ban.
 *
 * ## Why this is not optional
 * If the cache stops working entirely, the app's own rate limit (120 req/min/client) lets ONE
 * client drive 172 800 requests a day — Open-Meteo's free tier is 10 000 (SPEC-ADDENDUM §2.7).
 * The quota would be gone in minutes and the provider would block us. The budget is the only
 * thing standing between "our cache broke" and "our data source is gone", so it is enforced
 * before the breaker, before the retry logic, before anything.
 *
 * ## Shared through Redis when Redis is there
 * With N instances and per-process counters, the real ceiling is N × the budget. When a Redis
 * client is present the counters are shared, so the budget means what it says regardless of
 * instance count. If Redis is unreachable the call falls back to the in-process counter and says
 * so loudly: per-instance accounting is strictly more conservative than none.
 *
 * ## The counter is incremented before the verdict, on purpose
 * A rejected call still consumes its slot. That over-counts slightly during a rejection storm —
 * and that is the safe direction: the alternative (check, then increment) is not atomic and would
 * let a burst slip past the cap.
 *
 * Constructed by `UpstreamModule`'s factory rather than by DI: the clock is injected for tests,
 * and a bare `() => number` constructor parameter is not something Nest can resolve.
 */
export class ProviderBudget {
  private readonly localCounters = new Map<
    string,
    { count: number; windowStartMs: number; windowSeconds: number }
  >();

  constructor(
    private readonly metrics: UpstreamMetrics,
    private readonly redis: RedisClientPort | null = null,
    private readonly now: () => number = Date.now,
  ) {}

  /**
   * Consume one call slot for `providerId`.
   *
   * All three windows are incremented on every call, and the call is allowed only if all three
   * are within their limit.
   */
  async tryConsume(providerId: string, limits: ProviderBudgetLimits): Promise<BudgetDecision> {
    const checks: ReadonlyArray<{ window: BudgetWindow; limit: number }> = [
      { window: 'minute', limit: limits.perMinute },
      { window: 'hour', limit: limits.perHour },
      { window: 'day', limit: limits.perDay },
    ];

    let rejection: BudgetDecision | null = null;

    for (const check of checks) {
      const count = await this.increment(providerId, check.window);
      if (count > check.limit && rejection === null) {
        rejection = { allowed: false, window: check.window, limit: check.limit };
      }
    }

    if (rejection !== null) {
      this.metrics.increment('budget.rejected', providerId);
      // LOUD, per SPEC-ADDENDUM §2.7: a budget exhaustion means either a cache failure or a
      // runaway loop, and both need a human. Silently degrading here would hide the very event
      // the budget exists to make visible.
      this.metrics.event('error', 'provider budget exhausted — no upstream call will be made', {
        provider: providerId,
        window: rejection.window,
        limit: rejection.limit,
      });
      return rejection;
    }

    return { allowed: true };
  }

  private async increment(providerId: string, window: BudgetWindow): Promise<number> {
    const seconds = WINDOW_SECONDS[window];
    const bucket = Math.floor(this.now() / (seconds * 1000));
    const key = `upstream:budget:${providerId}:${window}:${String(bucket)}`;

    if (this.redis !== null) {
      try {
        return await this.redis.incrementWithTtl(key, seconds);
      } catch (error: unknown) {
        this.metrics.increment('redis.degraded', providerId);
        this.metrics.event('warn', 'budget counter fell back to this instance only', {
          provider: providerId,
          window,
          reason: error instanceof Error ? error.message : 'unknown',
        });
      }
    }

    return this.incrementLocal(key, seconds);
  }

  private incrementLocal(key: string, seconds: number): number {
    const nowMs = this.now();
    const entry = this.localCounters.get(key);
    if (entry === undefined || nowMs - entry.windowStartMs >= seconds * 1000) {
      this.localCounters.set(key, { count: 1, windowStartMs: nowMs, windowSeconds: seconds });
      this.pruneLocal(nowMs);
      return 1;
    }
    entry.count += 1;
    return entry.count;
  }

  /**
   * Drop counters whose own window has elapsed.
   *
   * The key embeds the window index, so a NEW key is minted every minute/hour/day — without this
   * the map would grow without bound in a long-lived process (1 440 dead minute-keys per provider
   * per day). Each entry carries its own window length, so a minute counter is not kept for a day.
   */
  private pruneLocal(nowMs: number): void {
    for (const [key, entry] of this.localCounters) {
      if (nowMs - entry.windowStartMs >= entry.windowSeconds * 1000) {
        this.localCounters.delete(key);
      }
    }
  }
}
