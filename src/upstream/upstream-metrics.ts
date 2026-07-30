import { Injectable, Logger } from '@nestjs/common';

/**
 * Every countable thing the upstream layer does.
 *
 * A closed union rather than free-form strings: a typo in a metric name produces a counter
 * nobody reads, which is the monitoring equivalent of a swallowed error.
 */
export type UpstreamMetricName =
  /** Served from cache, still inside its freshness TTL. */
  | 'cache.hit'
  /** Served from cache past its TTL but inside the staleness ceiling (SPEC-ADDENDUM §6.1). */
  | 'cache.stale'
  /** Nothing usable cached — an upstream refresh was attempted. */
  | 'cache.miss'
  /** A cached NEGATIVE outcome answered the read without touching the provider (§6.3). */
  | 'cache.negative_hit'
  /** A cached entry was discarded for breaching a staleness ceiling. */
  | 'cache.ceiling_dropped'
  /** This caller joined an in-flight refresh instead of starting a second one (LRU mode). */
  | 'singleflight.joined'
  /** Another instance holds the refresh lock; this caller did not wait (Redis mode). */
  | 'singleflight.lost'
  /** One real HTTP request left the process. */
  | 'upstream.request'
  /** One retry of a transient failure. */
  | 'upstream.retry'
  | 'upstream.outcome.ok'
  | 'upstream.outcome.no_data'
  | 'upstream.outcome.transient'
  | 'upstream.outcome.rate_limited'
  | 'upstream.outcome.client_error'
  | 'upstream.outcome.schema_error'
  | 'upstream.outcome.budget_exhausted'
  /** The provider budget refused the call before it was made (§2.7). */
  | 'budget.rejected'
  /** The circuit breaker refused the call before it was made. */
  | 'breaker.rejected'
  | 'breaker.opened'
  | 'breaker.closed'
  /** A half-open trial was released without an outcome — an exception crossed a boundary. */
  | 'breaker.trial_abandoned'
  /** Redis was unreachable and the call degraded to the in-process path. */
  | 'redis.degraded';

/**
 * Counters + structured logs for the upstream layer.
 *
 * ## Why counters at all, when there is no metrics backend yet
 * Hosting is undecided (`CONVENTIONS.md` §7), so there is nothing to scrape. But the failure
 * modes this layer exists to survive — a provider quietly rate-limiting us, a breaker stuck
 * open, a cache that never hits — are all INVISIBLE without a count. Keeping the counters in
 * process costs nothing, makes every one of those assertable in a test, and means wiring a real
 * exporter later is a read of `snapshot()` rather than a retrofit of instrumentation.
 *
 * ## What never goes in here
 * No client IP, no user agent, no request id, no personal data of any kind — the marine feature
 * processes none (SPEC-ADDENDUM §7.10) and this layer must not become the place where that
 * stops being true. Labels are the provider id and the operation label, both of which we choose
 * ourselves. URLs reaching a log line go through `redactUrl` first.
 */
@Injectable()
export class UpstreamMetrics {
  private readonly logger = new Logger('Upstream');
  private readonly counters = new Map<string, number>();
  private readonly lastLoggedAtMs = new Map<string, number>();

  /**
   * Count one event.
   *
   * @param providerId our own provider label (`open-meteo`, `cmems`), never a hostname —
   *   hostnames change and a metric that changes name on a provider's DNS migration is worse
   *   than no metric.
   */
  increment(name: UpstreamMetricName, providerId: string, by = 1): void {
    const key = `${name}|${providerId}`;
    this.counters.set(key, (this.counters.get(key) ?? 0) + by);
  }

  /** Current value of one counter — the seam every test asserts through. */
  get(name: UpstreamMetricName, providerId: string): number {
    return this.counters.get(`${name}|${providerId}`) ?? 0;
  }

  /** All non-zero counters, `name|provider` → count. Sorted for a stable log/diff. */
  snapshot(): Record<string, number> {
    return Object.fromEntries([...this.counters.entries()].sort(([a], [b]) => a.localeCompare(b)));
  }

  /**
   * A structured event line.
   *
   * `level` is part of the contract, not a stylistic choice (SPEC-ADDENDUM §6.3): our own bad
   * request (`client_error`) and a provider contract change (`schema_error`) are ERROR because
   * they need a human; a provider blip is WARN; routine cache work is DEBUG. A silent drop is
   * never an option — "loudly logged" is the written mitigation for every degraded path here.
   */
  event(
    level: 'debug' | 'log' | 'warn' | 'error',
    message: string,
    context: Readonly<Record<string, string | number | boolean | null>>,
  ): void {
    const rendered = `${message} ${JSON.stringify(context)}`;
    switch (level) {
      case 'debug':
        this.logger.debug(rendered);
        break;
      case 'log':
        this.logger.log(rendered);
        break;
      case 'warn':
        this.logger.warn(rendered);
        break;
      case 'error':
        this.logger.error(rendered);
        break;
    }
  }

  /**
   * A structured event that repeats at most once per `everyMs` for the same `throttleKey`.
   *
   * ## Why a throttle exists at all, when "loud" is the rule everywhere else
   * Two paths in this layer fire once per REQUEST while the thing they report is a single
   * standing condition: a Redis outage (a degrade line per cache read, and there are two reads
   * per call) and an exhausted daily budget (a line per attempt, for the rest of the window).
   * With the global limit at 120 req/min per client, that is an unbounded, fan-out-inflatable
   * ERROR stream layered on top of the outage itself — an availability problem caused by the
   * reporting of an availability problem.
   *
   * Loudness is preserved where it matters: the COUNTER is never throttled, and the first
   * occurrence is always logged, so the transition into the bad state is always visible. What is
   * suppressed is only the repetition of a message that says nothing new.
   */
  throttledEvent(
    level: 'debug' | 'log' | 'warn' | 'error',
    throttleKey: string,
    everyMs: number,
    message: string,
    context: Readonly<Record<string, string | number | boolean | null>>,
  ): void {
    const now = Date.now();
    const last = this.lastLoggedAtMs.get(throttleKey);
    if (last !== undefined && now - last < everyMs) return;

    this.lastLoggedAtMs.set(throttleKey, now);
    this.pruneThrottleKeys(now, everyMs);
    this.event(level, message, context);
  }

  /**
   * Keep the throttle map bounded.
   *
   * The keys are ours (provider + operation), so the map is small by construction; this only
   * guards against a long-lived process accumulating keys for providers it no longer talks to.
   */
  private pruneThrottleKeys(nowMs: number, everyMs: number): void {
    if (this.lastLoggedAtMs.size <= 64) return;
    for (const [key, at] of this.lastLoggedAtMs) {
      if (nowMs - at >= everyMs) this.lastLoggedAtMs.delete(key);
    }
  }

  /** Test-only reset; production code never calls it. */
  resetForTest(): void {
    this.counters.clear();
    this.lastLoggedAtMs.clear();
  }
}
