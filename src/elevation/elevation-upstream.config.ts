import type { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.schema';
import type { OutcomeTtlTable } from '../upstream/cache/upstream-cache.service';
import type { ProviderBudgetLimits } from '../upstream/provider-budget';
import type { StalenessCeilings } from '../upstream/staleness';
import { ELEVATION_PROVIDER_TERRAIN_TILES } from './elevation.types';

/**
 * The provider budget for the terrain-tile bucket — us braking OURSELVES.
 *
 * ## The unit is one tile request, and it does not need a weight
 * AWS Open Data serves this bucket anonymously and publishes no quota at all
 * (`provenance/integrations.md`, Terrain Tiles row: no account, no key, no written continuity
 * commitment). So there is no provider limit to model; these numbers are the numeric form of
 * `ENGINEERING.md` §3.5's "no unbounded external call" on an endpoint that is deliberately
 * wall-less (DEC 2026-08-19a md.13).
 *
 * ## Where the numbers come from — measured, then argued
 * The PR-E1 probe artifact (`data/elevation/terrain-tiles-probe.json`, 2026-08-19) measured a
 * cold worst case for one request: **186 distinct tiles** for İzmir→Van at 200 samples, and
 * **73** for Samsun→Erzurum. A typical ~200 km student line is ~26 tiles (plan §4.3).
 *
 * | window | limit | what it buys, in measured units |
 * |---|---|---|
 * | minute | 300 | one worst-case cold line (186) plus four typical ones, in the same minute |
 * | hour | 6 000 | ~32 worst-case cold lines, or ~230 typical ones |
 * | day | 50 000 | ~269 worst-case cold lines |
 *
 * **[VARSAYIM] The traffic these are sized against is not measured** — the site is not deployed
 * and no request-rate expectation exists (`ENGINEERING.md` §8: hosting undecided). The measured
 * half is the per-request cost; the per-day half is a self-imposed brake, and the honest reason
 * for the shape is that the hour limit is the one that bites: the day cap cannot be reached in
 * under eight hours of continuous cold traffic, which is enough time for a human to see it.
 *
 * Per-instance unless Redis is present, in which case they are shared — one more reason the boot
 * schema requires Redis in production while this feature is on.
 */
export const ELEVATION_PROVIDER_BUDGET: ProviderBudgetLimits = {
  perMinute: 300,
  perHour: 6_000,
  perDay: 50_000,
};

/** Everything the elevation leg needs to know about talking upstream, resolved from env ONCE. */
export interface ElevationUpstreamConfig {
  /** `ELEVATION_ENABLED` — the leg's kill switch. The guard turns it into a 404. */
  readonly enabled: boolean;
  /** Bucket root; `/terrarium/{z}/{x}/{y}.png` is appended by the tile client. */
  readonly baseUrl: string;
  /** Total upstream budget for ONE user request — every tile, every retry, together. */
  readonly requestDeadlineMs: number;
  /** Ceiling on ONE tile fetch, so a hung socket cannot eat the request budget. */
  readonly singleCallTimeoutMs: number;
  /** LOUD-stop ceiling on the tiles one request may touch. */
  readonly maxTilesPerRequest: number;
  /** How many tile fetches may be in flight at once for one request. */
  readonly tileFetchConcurrency: number;
  /** Byte ceiling for ONE tile response. */
  readonly tileMaxResponseBytes: number;
  /** Size of the in-process decoded-tile LRU, in tiles. */
  readonly tileCacheMaxTiles: number;
  readonly budget: ProviderBudgetLimits;
  readonly ttls: OutcomeTtlTable;
  readonly ceilings: StalenessCeilings;
}

/** Injection token for {@link ElevationUpstreamConfig}. */
export const ELEVATION_UPSTREAM_CONFIG = Symbol('ELEVATION_UPSTREAM_CONFIG');

export function buildElevationUpstreamConfig(
  config: ConfigService<Env, true>,
): ElevationUpstreamConfig {
  const profileTtlSeconds = config.getOrThrow('ELEVATION_PROFILE_TTL_SECONDS', { infer: true });
  return {
    enabled: config.getOrThrow('ELEVATION_ENABLED', { infer: true }),
    baseUrl: config.getOrThrow('ELEVATION_BASE_URL', { infer: true }),
    requestDeadlineMs: config.getOrThrow('ELEVATION_UPSTREAM_DEADLINE_MS', { infer: true }),
    singleCallTimeoutMs: config.getOrThrow('ELEVATION_SINGLE_CALL_TIMEOUT_MS', { infer: true }),
    maxTilesPerRequest: config.getOrThrow('ELEVATION_MAX_TILES_PER_REQUEST', { infer: true }),
    tileFetchConcurrency: config.getOrThrow('ELEVATION_TILE_FETCH_CONCURRENCY', { infer: true }),
    tileMaxResponseBytes: config.getOrThrow('ELEVATION_TILE_MAX_RESPONSE_BYTES', { infer: true }),
    tileCacheMaxTiles: config.getOrThrow('ELEVATION_TILE_CACHE_MAX_TILES', { infer: true }),
    budget: ELEVATION_PROVIDER_BUDGET,
    ttls: buildElevationTtlTable(config),
    // The tiles are immutable — the bucket's own `Last-Modified` is 2017-11-17 (SPEC §7.4) — so a
    // profile derived from them cannot go stale in the sense the marine ceilings police. What the
    // ceiling still does is bound how long a cached entry may be served after the FORMULA behind
    // it changed, which is why it tracks the profile TTL rather than being disabled: the key
    // carries a `v1` segment for a deliberate formula change, and this is the belt for the case
    // where somebody forgets to bump it. `validAtMaxAgeSeconds` never binds because this payload
    // carries no model time; it is set to the same number rather than to Infinity so the object
    // has no value whose meaning is "unbounded".
    ceilings: {
      staleMaxSeconds: profileTtlSeconds,
      validAtMaxAgeSeconds: profileTtlSeconds,
    },
  };
}

/**
 * Negative-cache TTLs per outcome kind.
 *
 * The shape is marine's, and each difference from it is a decision about THIS provider:
 * `ok` is long because the tiles are immutable; `no_data` shares it, because a tile the bucket
 * genuinely does not have is a permanent fact about the pyramid, not a transient gap;
 * `schema_error` is the shortest because on this leg it is an ALARM — the imagery-source tripwire
 * fires there, and a licence-relevant surprise must be re-checked soon rather than parked.
 */
export function buildElevationTtlTable(config: ConfigService<Env, true>): OutcomeTtlTable {
  const profileTtlSeconds = config.getOrThrow('ELEVATION_PROFILE_TTL_SECONDS', { infer: true });
  return {
    ok: profileTtlSeconds,
    no_data: profileTtlSeconds,
    transient: config.getOrThrow('ELEVATION_ERROR_TTL_SECONDS', { infer: true }),
    rate_limited: config.getOrThrow('ELEVATION_ERROR_TTL_SECONDS', { infer: true }),
    client_error: config.getOrThrow('ELEVATION_CLIENT_ERROR_TTL_SECONDS', { infer: true }),
    schema_error: config.getOrThrow('ELEVATION_SCHEMA_ERROR_TTL_SECONDS', { infer: true }),
  };
}

/** Re-exported so a caller needs one import for "who is this provider". */
export { ELEVATION_PROVIDER_TERRAIN_TILES };
