import { OperationDeadline } from '../operation-deadline';
import { evaluateStaleness, type StalenessCeilings } from '../staleness';
import type { UpstreamMetrics } from '../upstream-metrics';
import type { UpstreamOutcome, UpstreamOutcomeKind } from '../upstream.types';
import type { SingleFlight } from './single-flight';
import type { UpstreamCacheEntry, UpstreamCacheStore } from './upstream-cache.store';

/**
 * Freshness horizon per outcome kind, in seconds (SPEC-ADDENDUM §6.3).
 *
 * They cannot share one number, and each difference is a decision:
 * `no_data` is a land mask — a permanent fact, so asking hourly is pure waste; a `client_error`
 * is OUR bad request and will still be wrong in fifteen minutes; a `schema_error` gets the
 * shortest negative TTL because it is an alarm, not a steady state.
 */
export interface OutcomeTtlTable {
  readonly ok: number;
  readonly no_data: number;
  readonly transient: number;
  readonly rate_limited: number;
  readonly client_error: number;
  readonly schema_error: number;
}

/** Where the answer came from — the observability seam, and what the tests assert on. */
export type CachedReadOrigin =
  | 'fresh_hit'
  | 'refreshed'
  | 'joined'
  /** A cached negative outcome answered without touching the provider. */
  | 'negative_hit'
  /** Stale but usable; a background revalidation was started and NOT waited for. */
  | 'stale_revalidating'
  /** The refresh failed (or is suppressed by a negative entry), so the old value was served. */
  | 'stale_after_failure'
  /** Another instance is refreshing and this caller had nothing — it waited briefly and won. */
  | 'polled'
  /** Answered by {@link UpstreamCacheService.peek}: read-only, no refresh was (or will be) started. */
  | 'peeked'
  | 'unavailable';

export interface CachedRead<T> {
  readonly value: T | null;
  readonly kind: UpstreamOutcomeKind;
  /** `null` whenever `kind !== 'ok'` — SPEC-ADDENDUM §7.7 makes that invariant explicit. */
  readonly freshness: 'fresh' | 'stale' | null;
  /** Feeds the `X-Marine-Cache-Age` header; `null` when nothing was served from cache. */
  readonly cacheAgeSeconds: number | null;
  readonly staleSinceUtc: string | null;
  readonly validAtUtc: string | null;
  readonly fetchedAtUtc: string | null;
  readonly reason: string | null;
  readonly origin: CachedReadOrigin;
}

/**
 * What a {@link UpstreamCacheService.peek} needs — the read-side subset of
 * {@link ReadThroughOptions}, with deliberately NO `refresh` closure and NO deadline. A peek
 * cannot be handed the machinery it must never use.
 */
export interface PeekOptions {
  /** Cache key. Derived from our own routing, never from a user-supplied string verbatim. */
  key: string;
  /** Provider label for metrics — the same one the HTTP client and breaker use. */
  providerId: string;
  /** Read for the fresh/stale label and negative-entry TTLs; nothing is ever written under them. */
  ttls: OutcomeTtlTable;
  ceilings: StalenessCeilings;
}

export interface ReadThroughOptions<T> extends PeekOptions {
  /** Budget for a refresh this read performs while a request waits (`MARINE_UPSTREAM_DEADLINE_MS`). */
  deadlineMs: number;
  /**
   * The CALLER's already-started deadline, when one user request reads several keys.
   *
   * Without this, every key mints its own budget and one request that reads N keys gets N × 6 s —
   * structurally the bug SPEC-ADDENDUM §6.4 exists to prevent ("the ceiling on ALL the upstream
   * work of ONE user request"), with every individual timeout still looking correct. It matters
   * immediately in M4: a cold `/deniz/<point>` reads three CMEMS keys (§2.5 budgets that whole
   * path at "6 s worst case", once), and the per-(point, layer) key split is forced by the
   * negative-TTL table and `not_supported`.
   *
   * A BACKGROUND revalidation never uses it — see `revalidateDeadlineMs`.
   */
  deadline?: OperationDeadline;
  /**
   * Budget for a BACKGROUND revalidation. Defaults to `deadlineMs`.
   *
   * A separate number because nobody is waiting for it: tying background work to a user-request
   * budget was SPEC v1's conceptual error (§6.4), and this is the one place the two paths meet.
   */
  revalidateDeadlineMs?: number;
  /**
   * Perform the upstream work.
   *
   * The deadline is HANDED TO the closure rather than built by it, so no call site can forget to
   * bound itself and every path gets the budget that matches how it was invoked.
   */
  refresh: (deadline: OperationDeadline) => Promise<UpstreamOutcome<T>>;
}

export interface UpstreamCacheServiceOptions {
  now?: () => number;
  /** Bounded wait when this caller lost the lock AND holds nothing (SPEC-ADDENDUM §6.2). */
  lockLostPollAttempts?: number;
  lockLostPollDelayMs?: number;
  sleepImpl?: (ms: number) => Promise<void>;
}

const DEFAULT_POLL_ATTEMPTS = 3;
const DEFAULT_POLL_DELAY_MS = 250;

/** Negative outcomes live under their own key so they cannot evict a still-usable stale value. */
function negativeKey(key: string): string {
  return `${key}#neg`;
}

/**
 * Epoch ms → ISO string, and `null` for anything that is not a finite number.
 *
 * The finite guard is not defensive decoration: `new Date(NaN).toISOString()` THROWS
 * `RangeError`, and this function is called on values that came back from Redis. A single entry
 * with a missing or non-numeric timestamp — a shape change across a deploy while entries written
 * by the previous version are still inside their 6 h retention, a shared instance, a hand-run
 * `redis-cli SET` — would otherwise turn every read of that key into a 500 on a public page until
 * the key expired. The store now validates entries on the way in (`RedisCacheStore.get`); this is
 * the second line, because a cache fault must degrade and never 500 (playbook §3.5, review #73
 * I9 — mechanism reproduced by the validator on four malformed shapes).
 */
function toIso(ms: number | null): string | null {
  return ms !== null && Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/**
 * How long a NEGATIVE entry suppresses the upstream call.
 *
 * Three rules in one place so the foreground and background paths cannot disagree:
 *
 * - **429 honours `Retry-After`** (SPEC-ADDENDUM §6.3) — but only a POSITIVE one. `??` does not
 *   catch `0`, and `0` is a legal header value that `parseRetryAfterSeconds` also produces for an
 *   already-elapsed HTTP-date (clock skew is enough). Written verbatim it made the negative entry
 *   expire before the next read, so the very provider that just said "stop" got called again
 *   immediately — a missing header was handled BETTER than a present one (review #73 I3).
 * - **A budget refusal reuses the transient TTL.** Our own window rolls over on its own schedule,
 *   so a short suppression is right; it needs no env of its own.
 * - Everything else takes the TTL named for its kind.
 */
function negativeTtlSecondsFor(
  ttls: OutcomeTtlTable,
  outcome: Exclude<UpstreamOutcome<unknown>, { kind: 'ok' }>,
): number {
  if (outcome.kind === 'rate_limited') {
    const asked = outcome.retryAfterSeconds;
    return asked !== null && asked > 0 ? asked : ttls.rate_limited;
  }
  if (outcome.kind === 'budget_exhausted') return ttls.transient;
  return ttls[outcome.kind];
}

/**
 * How long an `ok` entry physically survives.
 *
 * Never shorter than the freshness TTL (or a value could not even be served fresh) and never
 * shorter than the staleness ceiling, because the whole point of `ttlSeconds` NOT being an
 * eviction time is that the value is still there to be served stale after it ages out.
 *
 * Retention and the ceiling are still two different jobs, and the ceiling is the one that
 * decides: it is the RULE ("this number is too old to show a student"), while retention is only
 * a memory bound. They coincide at steady state, but they part company the moment
 * `MARINE_STALE_MAX_SECONDS` is LOWERED — entries written under the old, larger retention are
 * already in Redis, and it is the ceiling that refuses them (loudly) rather than the store
 * quietly not having them.
 */
function retentionSecondsFor(options: {
  ttls: OutcomeTtlTable;
  ceilings: StalenessCeilings;
}): number {
  return Math.max(options.ttls.ok, options.ceilings.staleMaxSeconds);
}

/**
 * The read-through cache: the only path from a request to a provider.
 *
 * ## The rule everything else follows from
 * **A user request never waits for an upstream fetch it can avoid** (SPEC-ADDENDUM §3.4). If a
 * usable value exists it is served immediately and labelled honestly; the refresh happens behind
 * the response, or in the warmup tour. Only a genuinely empty cache makes a request wait.
 *
 * ## Two keys per logical entry, and why
 * A failed refresh must not destroy the value we can still serve, so a negative outcome is stored
 * under `<key>#neg` while the last good value stays under `<key>`. That is what makes "429
 * recorded, still serving a 40-minute-old number, still not calling the provider" expressible —
 * all three at once, which is the actual desired behaviour and is unrepresentable with one key.
 *
 * ## Ceilings are applied on the way OUT
 * A value breaching either staleness ceiling is dropped rather than published, even though it is
 * right there in the cache (§6.1). Publishing a number of unknown vintage on a page that teaches
 * geography is worse than publishing none.
 */
export class UpstreamCacheService {
  private readonly now: () => number;
  private readonly pollAttempts: number;
  private readonly pollDelayMs: number;
  private readonly sleepImpl: (ms: number) => Promise<void>;

  constructor(
    private readonly store: UpstreamCacheStore,
    private readonly singleFlight: SingleFlight,
    private readonly metrics: UpstreamMetrics,
    options: UpstreamCacheServiceOptions = {},
  ) {
    this.now = options.now ?? Date.now;
    this.pollAttempts = options.lockLostPollAttempts ?? DEFAULT_POLL_ATTEMPTS;
    this.pollDelayMs = options.lockLostPollDelayMs ?? DEFAULT_POLL_DELAY_MS;
    this.sleepImpl =
      options.sleepImpl ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  /** `redis` or `memory` — the mode the boot log announces. */
  get mode(): 'redis' | 'memory' {
    return this.store.mode;
  }

  async read<T>(options: ReadThroughOptions<T>): Promise<CachedRead<T>> {
    const usable = this.evaluate(await this.store.get<T>(options.key), options);

    if (usable !== null && usable.freshness === 'fresh') {
      this.metrics.increment('cache.hit', options.providerId);
      return usable.read;
    }

    const negative = await this.store.get<never>(negativeKey(options.key));
    if (negative !== null && this.isNegativeStillBinding(negative)) {
      this.metrics.increment('cache.negative_hit', options.providerId);
      if (usable !== null) {
        this.metrics.increment('cache.stale', options.providerId);
        return { ...usable.read, origin: 'stale_after_failure' };
      }
      return this.fromNegative<T>(negative, 'negative_hit');
    }

    if (usable !== null) {
      // Stale-while-revalidate: answer now, refresh behind the response. `void` is deliberate and
      // safe — `revalidate` cannot reject (it swallows and logs), so no floating rejection exists.
      this.metrics.increment('cache.stale', options.providerId);
      void this.revalidate(options);
      return { ...usable.read, origin: 'stale_revalidating' };
    }

    this.metrics.increment('cache.miss', options.providerId);
    return await this.refreshAndServe(options);
  }

  /**
   * Read-only look at a key: apply the ceilings and the freshness label, and NOTHING else
   * (marine M4 plan §4.4, Atlas ruling U-1).
   *
   * ## What a peek must never do — and structurally cannot
   * - **No refresh is triggered**, foreground or background: {@link PeekOptions} carries no
   *   `refresh` closure, so there is nothing to run.
   * - **No negative entry is written.** This is the whole reason `peek` exists: calling
   *   `read()` with a no-op refresh writes a 60 s `transient` negative on every cold key, and a
   *   binding negative is exactly what keeps `read()` from ever refreshing — so a hot batch
   *   endpoint polling 78 cold keys faster than the negative TTL would starve the warmup's real
   *   refresh forever. The batch `overview` endpoint peeks; only the warmup and the single-point
   *   endpoints refresh.
   * - **No single-flight, no lock, no poll**: nothing to coordinate, nothing to wait for.
   *
   * ## What it reports, honestly
   * The same decisions `read()` makes on its serve path, minus every side effect: a fresh or
   * stale usable value (`origin: 'peeked'`); a stale value shadowed by a binding negative
   * (`origin: 'stale_after_failure'`, so a sweep can tell "due for refresh" from "refresh is
   * suppressed" — the negative TTLs bind a peeking sweep exactly as they bind `read()`); a bare
   * binding negative (`negative_hit`); or an honest `unavailable` miss.
   */
  async peek<T>(options: PeekOptions): Promise<CachedRead<T>> {
    const usable = this.evaluate(await this.store.get<T>(options.key), options);

    if (usable !== null && usable.freshness === 'fresh') {
      this.metrics.increment('cache.hit', options.providerId);
      return { ...usable.read, origin: 'peeked' };
    }

    const negative = await this.store.get<never>(negativeKey(options.key));
    const negativeBinding = negative !== null && this.isNegativeStillBinding(negative);

    if (usable !== null) {
      this.metrics.increment('cache.stale', options.providerId);
      if (negativeBinding) {
        this.metrics.increment('cache.negative_hit', options.providerId);
        // The same label read() gives this state: the stale value is served AND a negative is
        // suppressing its refresh — which a warmup sweep must respect, not race.
        return { ...usable.read, origin: 'stale_after_failure' };
      }
      return { ...usable.read, origin: 'peeked' };
    }

    if (negativeBinding) {
      this.metrics.increment('cache.negative_hit', options.providerId);
      return this.fromNegative<T>(negative, 'peeked');
    }

    // NOT counted as `cache.miss`: that counter's documented meaning is "an upstream refresh
    // was attempted", and a peek attempts none.
    return this.unavailable<T>('nothing usable is cached and a peek never refreshes');
  }

  /**
   * Background refresh for a stale-but-served key.
   *
   * Never throws: it runs after the response has been decided, so a rejection here has no caller
   * and would surface as an unhandled promise rejection. It still goes through single-flight, so
   * N stale reads produce one upstream refresh, not N.
   */
  private async revalidate<T>(options: ReadThroughOptions<T>): Promise<void> {
    try {
      // Always a FRESH deadline, never the caller's: the response has already been sent, so
      // borrowing a request budget that may be nearly spent would abort the refresh the next
      // reader depends on — the same background-vs-request conflation §6.4 names.
      const deadline = new OperationDeadline(options.revalidateDeadlineMs ?? options.deadlineMs);
      const result = await this.singleFlight.run(options.key, () => options.refresh(deadline));
      if (result.outcome === 'lost') return;
      await this.persistOutcome(options, result.value);
    } catch (error: unknown) {
      this.metrics.event('warn', 'background revalidation failed', {
        key: options.key,
        provider: options.providerId,
        reason: error instanceof Error ? error.message : 'unknown',
      });
    }
  }

  /** The cold path: nothing usable is cached, so this request does have to wait. */
  private async refreshAndServe<T>(options: ReadThroughOptions<T>): Promise<CachedRead<T>> {
    // The caller's budget when it owns one, so N keys in one request share ONE ceiling.
    const deadline = options.deadline ?? new OperationDeadline(options.deadlineMs);
    const result = await this.singleFlight.run(options.key, () => options.refresh(deadline));

    if (result.outcome === 'lost') {
      return await this.pollForWinner(options);
    }

    const stored = await this.persistOutcome(options, result.value);
    const origin: CachedReadOrigin = result.outcome === 'joined' ? 'joined' : 'refreshed';
    return { ...stored, origin };
  }

  /**
   * Persist an outcome and describe it as a read.
   *
   * One function for both the foreground and the background path, so the two can never disagree
   * about TTLs, retention or what a negative entry looks like.
   */
  private async persistOutcome<T>(
    options: ReadThroughOptions<T>,
    outcome: UpstreamOutcome<T>,
  ): Promise<CachedRead<T>> {
    const storedAtMs = this.now();

    if (outcome.kind === 'ok') {
      const entry: UpstreamCacheEntry<T> = {
        kind: 'ok',
        payload: outcome.value,
        reason: null,
        storedAtMs,
        validAtMs: outcome.validAtMs,
        ttlSeconds: options.ttls.ok,
      };
      await this.store.set(options.key, entry, retentionSecondsFor(options));
      return {
        value: outcome.value,
        kind: 'ok',
        freshness: 'fresh',
        cacheAgeSeconds: 0,
        staleSinceUtc: null,
        validAtUtc: toIso(outcome.validAtMs),
        fetchedAtUtc: toIso(storedAtMs),
        reason: null,
        origin: 'refreshed',
      };
    }

    // A provider that answered "no value here" and a provider that failed are both stored, with
    // very different TTLs; 429 uses the provider's own `Retry-After` when it sent one (§6.3).
    const ttlSeconds = negativeTtlSecondsFor(options.ttls, outcome);

    const negative: UpstreamCacheEntry<never> = {
      kind: outcome.kind,
      payload: null,
      reason: outcome.reason,
      storedAtMs,
      validAtMs: null,
      ttlSeconds,
    };
    await this.store.set(negativeKey(options.key), negative, Math.max(1, ttlSeconds));
    return this.fromNegative<T>(negative, 'refreshed');
  }

  /**
   * Lost the lock with nothing to serve: poll the value key a bounded number of times.
   *
   * Bounded because this is the ONLY path where a request waits on another instance, and it exists
   * purely so a genuinely cold start does not answer `unavailable` while a refresh is landing
   * milliseconds later. Three quarters of a second, maximum, then we answer honestly.
   */
  private async pollForWinner<T>(options: ReadThroughOptions<T>): Promise<CachedRead<T>> {
    for (let attempt = 0; attempt < this.pollAttempts; attempt += 1) {
      await this.sleepImpl(this.pollDelayMs);
      const usable = this.evaluate(await this.store.get<T>(options.key), options);
      if (usable !== null) {
        this.metrics.increment(
          usable.freshness === 'fresh' ? 'cache.hit' : 'cache.stale',
          options.providerId,
        );
        return { ...usable.read, origin: 'polled' };
      }

      // The winner may have landed a NEGATIVE outcome — that is an answer too, and a more honest
      // one than a generic `transient`: reporting `rate_limited` matters to whoever reads the
      // reason. Checking it also ends the wait early instead of sleeping out the full budget for
      // a result that is already there.
      const negative = await this.store.get<never>(negativeKey(options.key));
      if (negative !== null && this.isNegativeStillBinding(negative)) {
        this.metrics.increment('cache.negative_hit', options.providerId);
        return this.fromNegative<T>(negative, 'polled');
      }
    }
    return this.unavailable<T>('another instance is refreshing and no cached value is available');
  }

  /**
   * Turn a stored entry into a publishable read, or `null` when it may not be published.
   *
   * A ceiling breach is counted and logged rather than quietly returning `null`: "the value is
   * there but too old to publish" is a real operational event (the provider has been failing for
   * six hours, or is serving a stale model run) and it must be visible before a visitor notices.
   */
  private evaluate<T>(
    cached: UpstreamCacheEntry<T> | null,
    // The read-side subset is enough — `peek` calls this too, and must not need a refresh.
    options: PeekOptions,
  ): { read: CachedRead<T>; freshness: 'fresh' | 'stale' } | null {
    if (cached === null || cached.kind !== 'ok' || cached.payload === null) return null;

    const verdict = evaluateStaleness({
      storedAtMs: cached.storedAtMs,
      validAtMs: cached.validAtMs,
      ttlSeconds: cached.ttlSeconds,
      nowMs: this.now(),
      ceilings: options.ceilings,
    });

    if (!verdict.usable) {
      this.metrics.increment('cache.ceiling_dropped', options.providerId);
      this.metrics.event('warn', 'cached value dropped for breaching a staleness ceiling', {
        key: options.key,
        provider: options.providerId,
        reason: verdict.reason,
        ageSeconds: Math.round(verdict.ageSeconds),
      });
      return null;
    }

    return {
      freshness: verdict.freshness,
      read: {
        value: cached.payload,
        kind: 'ok',
        freshness: verdict.freshness,
        cacheAgeSeconds: Math.round(verdict.ageSeconds),
        staleSinceUtc: toIso(verdict.staleSinceMs),
        validAtUtc: toIso(cached.validAtMs),
        fetchedAtUtc: toIso(cached.storedAtMs),
        reason: null,
        origin: 'fresh_hit',
      },
    };
  }

  /** A negative entry inside its TTL suppresses the upstream call — that IS the negative cache. */
  private isNegativeStillBinding(entry: UpstreamCacheEntry<unknown>): boolean {
    return (this.now() - entry.storedAtMs) / 1000 <= entry.ttlSeconds;
  }

  private fromNegative<T>(
    entry: UpstreamCacheEntry<unknown>,
    origin: CachedReadOrigin,
  ): CachedRead<T> {
    return {
      value: null,
      kind: entry.kind,
      freshness: null,
      cacheAgeSeconds: Math.round((this.now() - entry.storedAtMs) / 1000),
      staleSinceUtc: null,
      validAtUtc: null,
      fetchedAtUtc: toIso(entry.storedAtMs),
      reason: entry.reason,
      origin,
    };
  }

  private unavailable<T>(reason: string): CachedRead<T> {
    return {
      value: null,
      kind: 'transient',
      freshness: null,
      cacheAgeSeconds: null,
      staleSinceUtc: null,
      validAtUtc: null,
      fetchedAtUtc: null,
      reason,
      origin: 'unavailable',
    };
  }
}
