/**
 * The elevation leg's own vocabulary. Nothing here knows about HTTP, Nest or the cache.
 */

/**
 * OUR label for the provider — the budget, breaker and metric key.
 *
 * A label rather than a hostname, for the reason `MARINE_PROVIDER` records: a hostname changes
 * on a provider's DNS migration and silently renames every metric with it.
 */
export const ELEVATION_PROVIDER_TERRAIN_TILES = 'terrain-tiles';

/**
 * How many points a profile carries. A SERVER constant, never a request parameter
 * (Atlas ruling AK-25 md.4; plan-api.md §2.4).
 *
 * Three things follow from fixing it here, and the first is the one that matters:
 *
 * 1. **The cost ceiling becomes arithmetic rather than configuration.** The number of DISTINCT
 *    tiles a request can touch cannot exceed the number of points it samples, so "one request
 *    reads at most 200 tiles" is a fact about the code, not a value somebody could raise.
 * 2. The profile cache key does not fork per caller, so two students drawing the same line share
 *    one entry instead of missing each other.
 * 3. The response size is constant, which is what SPEC §7.4's ~3 kB budget rests on.
 *
 * It is published in the response so a consumer reads it instead of assuming it.
 */
export const ELEVATION_PROFILE_SAMPLE_COUNT = 200;

/**
 * Decimal places every request coordinate is rounded to before anything else happens.
 *
 * This is what makes the profile cache work at all: free-precision coordinates are an unbounded
 * key space and a hit rate of approximately zero. Three decimals is ~111 m north-south and ~87 m
 * east-west at 39° N — BELOW the input's own uncertainty, since SPEC §6.6 measures a map click at
 * ~130 m at zoom 12 and ~1.5 km at zoom 1. A fourth decimal (~11 m) would go finer than the DEM's
 * own 30 m cell, buying no accuracy and multiplying the key space by a hundred.
 *
 * The rounded endpoints are echoed back as `from`/`to`, so the caller always knows which line was
 * actually measured.
 */
export const ELEVATION_COORDINATE_DECIMALS = 3;

/**
 * The request frame — the padded Türkiye bounding box, declared ONCE.
 *
 * Each number appears in a `class-validator` decorator (what the server accepts) and in an
 * `@ApiProperty` (what the contract promises), and no tool cross-checks the two — this repo's
 * named drift class (`BookListQueryDto`, `EarthquakeListQueryDto`). A constant collapses them.
 *
 * The frame is SPEC §6.5(a)'s `25.6–45.1 E / 35.8–42.2 N` with padding. The padding exists so a
 * student clicking the edge of the map does not get a 400; outside it IS a 400, because the Faz-1
 * tools are fixed to the Türkiye map and an unbounded coordinate is an unbounded tile fetch.
 */
export const ELEVATION_BBOX_MIN_LAT = 35.5;
export const ELEVATION_BBOX_MAX_LAT = 42.5;
export const ELEVATION_BBOX_MIN_LON = 25.0;
export const ELEVATION_BBOX_MAX_LON = 45.5;

/** One sampled point of a computed profile: how far along, and how high — `null` if unresolved. */
export interface ElevationSample {
  readonly distanceKm: number;
  readonly elevationM: number | null;
}

/** What the service computes and what the profile cache stores. */
export interface ElevationProfilePayload {
  readonly fromLat: number;
  readonly fromLon: number;
  readonly toLat: number;
  readonly toLon: number;
  readonly lengthKm: number;
  readonly sampleCount: number;
  readonly sampleZoom: number;
  readonly resolvedSampleCount: number;
  readonly distancesKm: readonly number[];
  readonly elevationsM: readonly (number | null)[];
  readonly minElevationM: number | null;
  readonly maxElevationM: number | null;
}
