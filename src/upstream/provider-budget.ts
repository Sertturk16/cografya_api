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
 * accounting that can actually keep us under the limit.
 *
 * The cost — up to 2× the limit across a window boundary — is affordable at our numbers, in the
 * WEIGHTED units the quota is actually counted in (see `MARINE_PROVIDER_BUDGETS`, which holds the
 * authoritative table): Open-Meteo's steady state is 1 488 units/day against a 4 000/day budget,
 * itself 40% of the 10 000/day free tier — so even the doubled worst case, 8 000, stays inside
 * the tier. (These figures were request-counted before the unit was corrected; a comment claiming
 * the budget consumes 6% of a quota it may consume 40% of is the same defect the correction
 * fixed, so it is restated here rather than left to drift a second time.)
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

/**
 * How often the same standing condition may repeat in the log.
 *
 * Exhaustion lasts a whole window and degradation lasts a whole outage; both would otherwise emit
 * one line per attempt. One minute keeps the condition visible on any dashboard without turning
 * an outage into a log flood.
 */
const EXHAUSTION_LOG_EVERY_MS = 60_000;
const DEGRADED_LOG_EVERY_MS = 60_000;

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
   * Consume `weight` quota units for `providerId`.
   *
   * ## Weight, not calls — the unit is the PROVIDER's, not ours
   * Open-Meteo counts a multi-location batch per LOCATION (SPEC-ADDENDUM §2.7's conservative
   * reading), so one HTTP request covering 31 points spends 31 units. Counting requests made the
   * configured ceiling ~186% of the free tier while `budget.rejected` never fired — a guard that
   * silently guaranteed nothing (review #73 I5, Atlas ruling). Providers whose quota really is
   * per-request (CMEMS: one call = one point = one variable) simply pass weight 1.
   *
   * ## The windows are checked in ORDER and stop at the first refusal
   * A call the minute window already refused must not burn an hour slot and a day slot as well.
   * With all three always incremented, a cache outage under the app's own 120 req/min limit
   * exhausted a 600/day budget in ~2.5 minutes of calls that were never sent — and the day key
   * carries a 24 h TTL shared across instances, so the feature stayed dark for the rest of the
   * UTC day while the provider had seen almost nothing (review #73 I1). The window that DID
   * refuse still keeps its increment: that one is the binding constraint and over-counting there
   * is the safe direction.
   */
  async tryConsume(
    providerId: string,
    limits: ProviderBudgetLimits,
    weight = 1,
  ): Promise<BudgetDecision> {
    const checks: ReadonlyArray<{ window: BudgetWindow; limit: number }> = [
      { window: 'minute', limit: limits.perMinute },
      { window: 'hour', limit: limits.perHour },
      { window: 'day', limit: limits.perDay },
    ];

    const units = Math.max(1, Math.round(weight));

    for (const check of checks) {
      const count = await this.increment(providerId, check.window, units);
      if (count > check.limit) {
        this.metrics.increment('budget.rejected', providerId);
        // LOUD per SPEC-ADDENDUM §2.7 — a budget exhaustion means either a cache failure or a
        // runaway loop, and both need a human — but at most once per window key. Exhaustion is a
        // standing condition that would otherwise emit one ERROR per attempt for the rest of the
        // window, an unbounded log stream layered on top of the outage. The counter stays
        // unsampled and the FIRST occurrence always logs, so the transition is never hidden.
        this.metrics.throttledEvent(
          'error',
          `budget:${providerId}:${check.window}`,
          EXHAUSTION_LOG_EVERY_MS,
          'provider budget exhausted — no upstream call will be made',
          { provider: providerId, window: check.window, limit: check.limit, weight: units },
        );
        return { allowed: false, window: check.window, limit: check.limit };
      }
    }

    return { allowed: true };
  }

  private async increment(
    providerId: string,
    window: BudgetWindow,
    units: number,
  ): Promise<number> {
    const seconds = WINDOW_SECONDS[window];
    const bucket = Math.floor(this.now() / (seconds * 1000));
    const key = `upstream:budget:${providerId}:${window}:${String(bucket)}`;

    if (this.redis !== null) {
      try {
        return await this.redis.incrementWithTtl(key, seconds, units);
      } catch (error: unknown) {
        this.metrics.increment('redis.degraded', providerId);
        // Throttled for the same reason as the exhaustion line: a Redis outage produces this on
        // every counter increment, i.e. three times per attempt, for as long as it lasts.
        this.metrics.throttledEvent(
          'warn',
          `budget-degraded:${providerId}`,
          DEGRADED_LOG_EVERY_MS,
          'budget counter fell back to this instance only',
          {
            provider: providerId,
            window,
            reason: error instanceof Error ? error.message : 'unknown',
          },
        );
      }
    }

    return this.incrementLocal(key, seconds, units);
  }

  private incrementLocal(key: string, seconds: number, units: number): number {
    const nowMs = this.now();
    const entry = this.localCounters.get(key);
    if (entry === undefined || nowMs - entry.windowStartMs >= seconds * 1000) {
      this.localCounters.set(key, { count: units, windowStartMs: nowMs, windowSeconds: seconds });
      this.pruneLocal(nowMs);
      return units;
    }
    entry.count += units;
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
