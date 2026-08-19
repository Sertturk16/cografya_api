import type { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.schema';
import type { ProviderBudgetLimits } from '../upstream/provider-budget';

/**
 * Provider id — OUR label for the budget, the breaker and every metric, not a hostname.
 *
 * Deliberately different from the row-level discriminator `EARTHQUAKE_PROVIDER_AFAD` (`'afad'`,
 * `earthquake.types.ts`): that one is stored in `earthquake_events.provider` and is part of a
 * UNIQUE key, so it must never move; this one keys runtime counters. A provider DNS migration or
 * a second AFAD endpoint family must be able to change one without touching the other.
 */
export const AFAD_TDVMS_PROVIDER = 'afad-tdvms';

/**
 * OUR self-imposed ceiling on calls to AFAD.
 *
 * **AFAD documents no rate limit** and the SPEC deliberately did not probe for one — hammering a
 * public institution's endpoint until it refuses is not a measurement we are entitled to take
 * (SPEC §20.5). So this is a courtesy brake set from our own arithmetic, not a limit read off the
 * provider:
 *
 * | quantity | value |
 * |---|---|
 * | `recent` tour | 1 call / 300 s ⇒ **288 / day** |
 * | `reconcile` tour | 1 call / 21 600 s ⇒ **4 / day** |
 * | steady state | ~292 calls/day, ~700 KB (measured payload sizes, SPEC §3.7) |
 *
 * 600/day is ~2× the steady state — room for a redeploy, a retry and a hand-run backfill window —
 * while 10/min is the brake that actually bites, since a tour makes exactly one call and only a
 * restart storm could approach it. Per-instance unless Redis is present, in which case shared;
 * that is the second reason production requires Redis while this leg is on (§14 cross-check 1).
 */
export const AFAD_TDVMS_BUDGET: ProviderBudgetLimits = { perMinute: 10, perHour: 60, perDay: 600 };

/**
 * Everything the earthquake LEG needs from env, resolved ONCE (the marine/air-quality shape).
 *
 * Ingest-only until E3, which added `staleMaxSeconds`. The read path shares this object rather than
 * getting a second one deliberately: it must publish the SAME `scopeBufferKm` the stored rows were
 * classified with, and two config objects reading two env variables is exactly how those two
 * numbers would drift apart.
 */
export interface EarthquakeUpstreamConfig {
  /** `EARTHQUAKE_ENABLED` — the leg's master switch for everything upstream. */
  readonly enabled: boolean;
  /** `EARTHQUAKE_ENABLED && EARTHQUAKE_INGEST_ENABLED` — both must be on for either tour. */
  readonly ingestEnabled: boolean;
  /** API ROOT; `/event/filter` is appended by the URL builder. */
  readonly baseUrl: string;
  readonly recentIntervalSeconds: number;
  readonly reconcileIntervalSeconds: number;
  /** One deadline serves both tours; the boot checks compare it against BOTH intervals. */
  readonly tourDeadlineMs: number;
  readonly recentWindowHours: number;
  readonly reconcileWindowDays: number;
  readonly clockSkewSeconds: number;
  readonly singleCallTimeoutMs: number;
  readonly tourBudgetMs: number;
  readonly responseMaxBytes: number;
  /**
   * The overflow alarm, never a "last N" selector.
   *
   * The provider applies `limit` BEFORE `orderby` (measured: `limit=3&orderby=timedesc` returned
   * the three OLDEST events of the window, SPEC §3.4), so asking for "the latest N" silently
   * returns the earliest N. Ingest therefore narrows by WINDOW and sends this only as a ceiling —
   * and a response that reaches it is a `schema_error` alarm, not a page of results.
   */
  readonly safetyLimit: number;
  /** D-B, revised to 200 km by `DEC 2026-08-17k` md.4 (was 150 in `DEC 2026-08-12k`). */
  readonly scopeBufferKm: number;
  readonly runRetentionDays: number;
  /**
   * READ PATH: how old the newest successful tour may be before responses publish
   * `dataStatus: 'stale'`. The data keeps being served — a stale list is shown with its age, never
   * hidden, because an old quiet list read as the present is the misreading this leg exists to
   * avoid. Boot refuses a value at or below `EARTHQUAKE_INGEST_INTERVAL_SECONDS`.
   */
  readonly staleMaxSeconds: number;
  readonly budget: ProviderBudgetLimits;
}

/** Injection token for {@link EarthquakeUpstreamConfig}. */
export const EARTHQUAKE_UPSTREAM_CONFIG = Symbol('EARTHQUAKE_UPSTREAM_CONFIG');

export function buildEarthquakeUpstreamConfig(
  config: ConfigService<Env, true>,
): EarthquakeUpstreamConfig {
  const enabled = config.getOrThrow('EARTHQUAKE_ENABLED', { infer: true });
  return {
    enabled,
    ingestEnabled: enabled && config.getOrThrow('EARTHQUAKE_INGEST_ENABLED', { infer: true }),
    baseUrl: config.getOrThrow('AFAD_EVENT_API_BASE_URL', { infer: true }),
    recentIntervalSeconds: config.getOrThrow('EARTHQUAKE_INGEST_INTERVAL_SECONDS', { infer: true }),
    reconcileIntervalSeconds: config.getOrThrow('EARTHQUAKE_RECONCILE_INTERVAL_SECONDS', {
      infer: true,
    }),
    tourDeadlineMs: config.getOrThrow('EARTHQUAKE_INGEST_DEADLINE_MS', { infer: true }),
    recentWindowHours: config.getOrThrow('EARTHQUAKE_RECENT_WINDOW_HOURS', { infer: true }),
    reconcileWindowDays: config.getOrThrow('EARTHQUAKE_RECONCILE_WINDOW_DAYS', { infer: true }),
    clockSkewSeconds: config.getOrThrow('EARTHQUAKE_CLOCK_SKEW_SECONDS', { infer: true }),
    singleCallTimeoutMs: config.getOrThrow('EARTHQUAKE_SINGLE_CALL_TIMEOUT_MS', { infer: true }),
    tourBudgetMs: config.getOrThrow('EARTHQUAKE_TOUR_BUDGET_MS', { infer: true }),
    responseMaxBytes: config.getOrThrow('EARTHQUAKE_RESPONSE_MAX_BYTES', { infer: true }),
    safetyLimit: config.getOrThrow('EARTHQUAKE_SAFETY_LIMIT', { infer: true }),
    scopeBufferKm: config.getOrThrow('EARTHQUAKE_SCOPE_BUFFER_KM', { infer: true }),
    runRetentionDays: config.getOrThrow('EARTHQUAKE_RUN_RETENTION_DAYS', { infer: true }),
    staleMaxSeconds: config.getOrThrow('EARTHQUAKE_STALE_MAX_SECONDS', { infer: true }),
    budget: AFAD_TDVMS_BUDGET,
  };
}
