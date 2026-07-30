import type { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.schema';
import type { OutcomeTtlTable } from '../upstream/cache/upstream-cache.service';
import type { ProviderBudgetLimits } from '../upstream/provider-budget';
import type { StalenessCeilings } from '../upstream/staleness';

/**
 * Provider ids — OUR labels, not hostnames.
 *
 * They key the budget, the breaker and every metric. A hostname would change on a provider's DNS
 * migration and silently rename the metrics with it.
 */
export const MARINE_PROVIDER = {
  openMeteo: 'open-meteo',
  cmems: 'cmems',
} as const;

export type MarineProviderId = (typeof MARINE_PROVIDER)[keyof typeof MARINE_PROVIDER];

/**
 * The budgets, in the unit the PROVIDER counts (SPEC-ADDENDUM §2.7) — Atlas ruling, review #73 I5.
 *
 * ## The unit is a location, not a request
 * Open-Meteo bills a multi-location batch per LOCATION under the project's own conservative
 * reading of its docs, so our two batched calls for 31 points cost 62 quota units, not 2. The
 * first version of this table counted HTTP requests, which made the ceiling below read as
 * comfortable while actually permitting 600 × 31 = 18 600 weighted calls a day against a
 * 10 000/day free tier — 186% of the quota, with `budget.rejected` never firing. A guard that
 * cannot fire is worse than none, because it is believed.
 *
 * ## Open-Meteo — the arithmetic, in weighted units throughout
 * | quantity | value |
 * |---|---|
 * | free tier | 600/min · 5 000/h · 10 000/day |
 * | one refresh (2 endpoints × 31 points) | 62 |
 * | steady state (hourly refresh) | 62/h · **1 488/day** |
 * | budget below | 200/min · 600/h · **4 000/day** |
 *
 * 4 000/day is ~2.7× the steady state (room for the boot tour, a redeploy and a bad hour) and
 * 40% of the free tier, so even a total cache collapse cannot reach the quota. The hour cap is
 * the real brake: 600/h means the day cap can only be approached over ~7 h of continuous
 * failure, and 200/min keeps a burst to a third of the provider's own minute limit.
 *
 * ## CMEMS — one call is one location, so weight 1 and the numbers are unchanged
 * No published limit (risk R1), so this budget is us braking ourselves. Steady state is 77 calls
 * per refresh × 24 ≈ 1 848/day; 20 000 leaves ~10× headroom.
 *
 * These are per-instance unless Redis is present, in which case they are shared — one more
 * reason production requires Redis (E1).
 */
export const MARINE_PROVIDER_BUDGETS: Readonly<Record<MarineProviderId, ProviderBudgetLimits>> = {
  [MARINE_PROVIDER.openMeteo]: { perMinute: 200, perHour: 600, perDay: 4_000 },
  [MARINE_PROVIDER.cmems]: { perMinute: 300, perHour: 5_000, perDay: 20_000 },
};

/**
 * The runtime user agent lives with the client, not here: `UPSTREAM_USER_AGENT` in
 * `src/upstream/upstream-http.helpers.ts`. One honest identification string for the whole
 * server, so a provider that wants to contact us finds one name rather than three.
 */

/**
 * Everything the marine legs need to know about how to talk upstream, resolved from env ONCE.
 *
 * One object rather than a dozen `config.getOrThrow` calls scattered across the adapters: the
 * TTL table, the ceilings and the two deadlines are a coherent set (the env schema cross-checks
 * them at boot), and reading half of them in one place and half in another is how a deadline
 * ends up disagreeing with the timeout inside it.
 *
 * Consumed today by the warmup tour; the M3/M4 provider adapters inject the same object.
 */
export interface MarineUpstreamConfig {
  readonly budgets: Readonly<Record<MarineProviderId, ProviderBudgetLimits>>;
  readonly ttls: OutcomeTtlTable;
  readonly ceilings: StalenessCeilings;
  /** Total budget for one user request's upstream work. */
  readonly requestDeadlineMs: number;
  /** The warmup tour's own, much larger budget — nobody is waiting for it. */
  readonly warmupDeadlineMs: number;
  readonly warmupIntervalSeconds: number;
  /** `MARINE_ENABLED && MARINE_WARMUP_ENABLED` — both must be on. */
  readonly warmupEnabled: boolean;
}

/** Injection token for {@link MarineUpstreamConfig}. */
export const MARINE_UPSTREAM_CONFIG = Symbol('MARINE_UPSTREAM_CONFIG');

export function buildMarineUpstreamConfig(config: ConfigService<Env, true>): MarineUpstreamConfig {
  return {
    budgets: MARINE_PROVIDER_BUDGETS,
    ttls: buildMarineTtlTable(config),
    ceilings: buildMarineCeilings(config),
    requestDeadlineMs: config.getOrThrow('MARINE_UPSTREAM_DEADLINE_MS', { infer: true }),
    warmupDeadlineMs: config.getOrThrow('MARINE_WARMUP_DEADLINE_MS', { infer: true }),
    warmupIntervalSeconds: config.getOrThrow('MARINE_WARMUP_INTERVAL_SECONDS', { infer: true }),
    // BOTH switches. The second exists so warming can be stopped without taking the feature
    // down — e.g. if a provider asks us to back off (SPEC-ADDENDUM §3.4).
    warmupEnabled:
      config.getOrThrow('MARINE_ENABLED', { infer: true }) &&
      config.getOrThrow('MARINE_WARMUP_ENABLED', { infer: true }),
  };
}

/** Negative-cache TTLs per outcome kind, from env (SPEC-ADDENDUM §6.3 / §7.8). */
export function buildMarineTtlTable(config: ConfigService<Env, true>): OutcomeTtlTable {
  return {
    ok: config.getOrThrow('MARINE_VALUE_TTL_SECONDS', { infer: true }),
    no_data: config.getOrThrow('MARINE_NO_DATA_TTL_SECONDS', { infer: true }),
    transient: config.getOrThrow('MARINE_ERROR_TTL_SECONDS', { infer: true }),
    rate_limited: config.getOrThrow('MARINE_RATELIMIT_TTL_SECONDS', { infer: true }),
    client_error: config.getOrThrow('MARINE_CLIENT_ERROR_TTL_SECONDS', { infer: true }),
    schema_error: config.getOrThrow('MARINE_SCHEMA_ERROR_TTL_SECONDS', { infer: true }),
  };
}

/** The two independent staleness ceilings, from env (SPEC-ADDENDUM §6.1). */
export function buildMarineCeilings(config: ConfigService<Env, true>): StalenessCeilings {
  return {
    staleMaxSeconds: config.getOrThrow('MARINE_STALE_MAX_SECONDS', { infer: true }),
    validAtMaxAgeSeconds: config.getOrThrow('MARINE_VALID_AT_MAX_AGE_SECONDS', { infer: true }),
  };
}
