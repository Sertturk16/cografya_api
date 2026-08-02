import type { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.schema';
import { parseAreaOrNull, parseHostList } from '../config/env.schema';
import type { OutcomeTtlTable } from '../upstream/cache/upstream-cache.service';
import type { ProviderBudgetLimits } from '../upstream/provider-budget';
import type { StalenessCeilings } from '../upstream/staleness';

/**
 * Provider id — OUR label, not a hostname. It keys the budget, the breaker and every metric,
 * so a provider DNS migration must never rename them.
 */
export const CAMS_ADS_PROVIDER = 'cams-ads';

/**
 * The ADS budget, in the unit the PROVIDER counts.
 *
 * ADS bills the QUEUE, not HTTP requests: what it limits is jobs and the "fields" a job asks
 * for (`costing` returns `{cost, limit}` per request shape, limit 5 000). Our steady state is
 * fixed and tiny, because this leg downloads whole model subsets rather than per-visitor
 * queries — 81 provinces cost exactly what 810 would:
 *
 * | quantity | value |
 * |---|---|
 * | per job | costing + execution + ~6 polls + results + download + DELETE ≈ **11 requests** |
 * | per day | 2 jobs ≈ **22 requests**, 605 costing fields, ~31.5 MiB (measured) |
 * | budget below | 30/min · 120/h · **400/day** |
 *
 * 400/day is ~18× the steady state — room for a retry storm, a redeploy and a run that has to
 * start over — while 30/min is the brake that actually bites: the ingest advances ONE job by
 * ONE step per tour, so it cannot spend a minute's budget even if every tour failed.
 *
 * Per-instance unless Redis is present, in which case shared — one more reason production
 * requires Redis for this leg (the E1 cross-check).
 */
export const CAMS_ADS_BUDGET: ProviderBudgetLimits = { perMinute: 30, perHour: 120, perDay: 400 };

/**
 * Everything the air-quality legs need to know about how to talk upstream, resolved from env
 * ONCE (the `MarineUpstreamConfig` precedent).
 *
 * One object rather than a dozen `getOrThrow` calls scattered across the adapters: the TTL
 * table, the ceilings and the budget chain are a coherent set that the env schema cross-checks
 * AT BOOT, and reading half of them here and half there is how a deadline ends up disagreeing
 * with the timeout inside it.
 *
 * A2a (the ingest half) consumes `enabled`, `ingest*`, `ads*` and the run caps. The read half
 * (`ttls`, `ceilings`, `runMaxAgeSeconds`) is resolved here too because it is validated with
 * the rest at boot; its first consumer lands in A2b.
 */
export interface AirQualityUpstreamConfig {
  /** `AIR_QUALITY_ENABLED` — the leg's master switch for everything upstream. */
  readonly enabled: boolean;
  /** `AIR_QUALITY_ENABLED && AIR_QUALITY_INGEST_ENABLED` — both must be on for the tour. */
  readonly ingestEnabled: boolean;
  /** The SECOND daily job's own switch; `false` makes the leg a pure one-job forecast leg. */
  readonly analysisEnabled: boolean;
  readonly ingestIntervalSeconds: number;
  readonly ingestDeadlineMs: number;
  readonly budgets: Readonly<Record<string, ProviderBudgetLimits>>;
  readonly ttls: OutcomeTtlTable;
  readonly ceilings: StalenessCeilings;
  /** The THIRD ceiling: max age of the model RUN a published value may come from (A2b). */
  readonly runMaxAgeSeconds: number;
  readonly ads: AdsIngestConfig;
}

/** The ADS queue half — request shape, guards and budget chain. */
export interface AdsIngestConfig {
  /** API ROOT; the job protocol path (`/retrieve/v1`) is appended by the URL builder. */
  readonly baseUrl: string;
  readonly datasetId: string;
  /** Download host allowlist, already split. Empty is impossible while the leg is enabled. */
  readonly objectStoreHosts: readonly string[];
  /**
   * The credential, or `null` while the leg is off. The env schema makes the enabled+missing
   * combination unbootable, so a `null` here can only mean "this leg is not running".
   */
  readonly apiKey: string | null;
  /** `[north, west, south, east]`, order-validated at boot. */
  readonly area: readonly [number, number, number, number];
  /** Leadtime hours 0…N inclusive, so the forecast series is `forecastHours + 1` steps long. */
  readonly forecastHours: number;
  readonly submitAfterUtcHour: number;
  /** Attempts per JOB (never per run — a failing analysis must not starve the forecast). */
  readonly maxAttemptsPerJob: number;
  readonly pollTimeoutMs: number;
  readonly downloadTimeoutMs: number;
  readonly tourBudgetMs: number;
  /** Per-download byte ceiling — a HEAP ceiling, because decoding is in-process. */
  readonly runMaxBytes: number;
}

/** Injection token for {@link AirQualityUpstreamConfig}. */
export const AIR_QUALITY_UPSTREAM_CONFIG = Symbol('AIR_QUALITY_UPSTREAM_CONFIG');

export function buildAirQualityUpstreamConfig(
  config: ConfigService<Env, true>,
): AirQualityUpstreamConfig {
  const enabled = config.getOrThrow('AIR_QUALITY_ENABLED', { infer: true });
  const rawArea = config.getOrThrow('AIR_QUALITY_AREA', { infer: true });
  const area = parseAreaOrNull(rawArea);
  if (area === null) {
    // Unreachable through `validateEnv` (the schema refuses this string at boot). Asserted
    // rather than defaulted, because a fabricated rectangle would silently move all 81
    // provinces onto plausible-looking wrong cells.
    throw new Error(`AIR_QUALITY_AREA "${rawArea}" is not a valid north,west,south,east box.`);
  }

  return {
    enabled,
    ingestEnabled: enabled && config.getOrThrow('AIR_QUALITY_INGEST_ENABLED', { infer: true }),
    analysisEnabled: config.getOrThrow('AIR_QUALITY_ANALYSIS_ENABLED', { infer: true }),
    ingestIntervalSeconds: config.getOrThrow('AIR_QUALITY_INGEST_INTERVAL_SECONDS', {
      infer: true,
    }),
    ingestDeadlineMs: config.getOrThrow('AIR_QUALITY_INGEST_DEADLINE_MS', { infer: true }),
    budgets: { [CAMS_ADS_PROVIDER]: CAMS_ADS_BUDGET },
    ttls: {
      ok: config.getOrThrow('AIR_QUALITY_VALUE_TTL_SECONDS', { infer: true }),
      no_data: config.getOrThrow('AIR_QUALITY_NO_DATA_TTL_SECONDS', { infer: true }),
      transient: config.getOrThrow('AIR_QUALITY_ERROR_TTL_SECONDS', { infer: true }),
      rate_limited: config.getOrThrow('AIR_QUALITY_RATELIMIT_TTL_SECONDS', { infer: true }),
      client_error: config.getOrThrow('AIR_QUALITY_CLIENT_ERROR_TTL_SECONDS', { infer: true }),
      schema_error: config.getOrThrow('AIR_QUALITY_SCHEMA_ERROR_TTL_SECONDS', { infer: true }),
    },
    ceilings: {
      staleMaxSeconds: config.getOrThrow('AIR_QUALITY_STALE_MAX_SECONDS', { infer: true }),
      validAtMaxAgeSeconds: config.getOrThrow('AIR_QUALITY_VALID_AT_MAX_AGE_SECONDS', {
        infer: true,
      }),
    },
    runMaxAgeSeconds: config.getOrThrow('AIR_QUALITY_RUN_MAX_AGE_SECONDS', { infer: true }),
    ads: {
      baseUrl: config.getOrThrow('ADS_API_BASE_URL', { infer: true }),
      datasetId: config.getOrThrow('AIR_QUALITY_DATASET_ID', { infer: true }),
      objectStoreHosts: parseHostList(config.getOrThrow('ADS_OBJECT_STORE_HOSTS', { infer: true })),
      apiKey: config.get('ADS_API_KEY', { infer: true }) ?? null,
      area,
      forecastHours: config.getOrThrow('AIR_QUALITY_FORECAST_HOURS', { infer: true }),
      submitAfterUtcHour: config.getOrThrow('AIR_QUALITY_SUBMIT_AFTER_UTC_HOUR', { infer: true }),
      maxAttemptsPerJob: config.getOrThrow('AIR_QUALITY_MAX_ATTEMPTS_PER_JOB', { infer: true }),
      pollTimeoutMs: config.getOrThrow('AIR_QUALITY_POLL_TIMEOUT_MS', { infer: true }),
      downloadTimeoutMs: config.getOrThrow('AIR_QUALITY_DOWNLOAD_TIMEOUT_MS', { infer: true }),
      tourBudgetMs: config.getOrThrow('AIR_QUALITY_TOUR_BUDGET_MS', { infer: true }),
      runMaxBytes: config.getOrThrow('AIR_QUALITY_RUN_MAX_BYTES', { infer: true }),
    },
  };
}
