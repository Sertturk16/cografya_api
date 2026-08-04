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
 * WEIGHTED units the quota is actually counted in. **The authoritative tables are the ones each
 * feature owns**, and each carries its own steady-state arithmetic and headroom argument against
 * live numbers:
 *
 *  - `MARINE_PROVIDER_BUDGETS` — `src/marine/marine-upstream.config.ts` (ECMWF, CMEMS)
 *  - `CAMS_ADS_BUDGET` — `src/air-quality/air-quality-upstream.config.ts` (ADS)
 *
 * No provider's figures live in THIS file, deliberately. It used to restate one provider's steady
 * state as the worked example; that provider was retired (DEC 2026-07-30k / DEC 2026-07-31, the
 * published-contract half closed by #89) and the numbers stayed behind, still pointing at a table
 * that no longer held the row they described. A second copy of an argument is a second thing to
 * go stale — the same failure mode the unit correction behind review #73 I5 already fixed once.
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
 * client drive 172 800 requests a day. That figure is OURS — it is arithmetic on our own throttle,
 * not a claim about any provider — and no wired provider publishes a per-day request tier we
 * could sit under: ECMWF Open Data publishes no request quota at all (only a 500-concurrent
 * limit), CMEMS publishes none either (risk R1), and ADS bills the QUEUE in fields rather than
 * counting our HTTP calls. So there is no ceiling that fails politely and no margin to compute
 * against; the first thing we would learn is that we had been blocked. The budget is the only
 * thing standing between "our cache broke" and "our data source is gone", so it is enforced
 * before the breaker, before the retry logic, before anything.
 *
 * An unpublished quota makes this MORE necessary, not less: the numbers in the two budget tables
 * are us braking ourselves, which is exactly why they cannot be inferred from a provider doc and
 * must be argued where they are defined.
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
   * The budget counts what the PROVIDER counts. Where the two disagree, counting our own HTTP
   * requests reads as comfortable while permitting multiples of the real quota, and
   * `budget.rejected` never fires: a guard that cannot fire is worse than none, because it is
   * believed (review #73 I5, Atlas ruling — a provider billing a multi-location batch per
   * LOCATION put the configured ceiling at ~186% of its free tier).
   *
   * **No provider wired today needs a weight other than 1**, so no live caller sets one:
   *
   *  - ECMWF — one request is one unit, and the unit does not scale with points.
   *  - CMEMS — one call = one point = one variable.
   *  - ADS — bills the QUEUE in fields, not our HTTP calls, so a request weight cannot express
   *    its quota at all. That limit is enforced where it belongs instead: the costing step reads
   *    the provider's own `{cost, limit}` and refuses before executing. What our budget counts
   *    for ADS is our own call rate, deliberately.
   *
   * The parameter stays because the rule it encodes is the provider's, not ours, and the day a
   * batch-billing provider lands this is the one place that has to change.
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
