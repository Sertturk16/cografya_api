import type { CachedRead } from '../upstream/cache/upstream-cache.service';
import type { EcmwfPointSeriesRead } from './ecmwf/ecmwf-series.reader';

/**
 * The response-level reducers over a request's contributing cache reads: the
 * `X-Marine-Cache-Age` header source (plan §5), the data-derived `generatedAtUtc`
 * (contract delta d5), and ECMWF's copyright year (M5).
 *
 * ## Only `kind === 'ok'` reads count (review #82 I5)
 * A NEGATIVE cache read also carries `cacheAgeSeconds` and `fetchedAtUtc` — they describe the
 * negative ENTRY, not any published data. Folding them in breaks both contracts at once:
 *
 * - `X-Marine-Cache-Age` promises "how old the cached data behind this response is". A
 *   permanent land-mask `no_data` (24 h TTL — the sweep deliberately never re-fetches it)
 *   would pin the header at up to 86 400 s while every PUBLISHED value is minutes old,
 *   making the header useless as a staleness signal exactly where the designed-for reality
 *   (İstanbul-Marmara thetao, plan R8) guarantees such an entry exists.
 * - `generatedAtUtc` exists to change ONLY when the data changes (the weak-ETag/304 economy).
 *   A negative entry being REWRITTEN bumps its `fetchedAtUtc` with zero body change — counting
 *   it would churn the ETag once per negative TTL for nothing.
 *
 * When a response publishes no ok value at all, both reducers answer `null` honestly: no
 * header (`withCacheAge` drops null) and the caller's wall-clock fallback for `generatedAtUtc`
 * (that response is `no-store`, so its instability caches nowhere).
 */

/** `X-Marine-Cache-Age` = the OLDEST contributing OK read — the honest worst case. */
export function oldestOkCacheAge(reads: readonly CachedRead<unknown>[]): number | null {
  let oldest: number | null = null;
  for (const read of reads) {
    if (read.kind !== 'ok' || read.cacheAgeSeconds === null) continue;
    if (oldest === null || read.cacheAgeSeconds > oldest) oldest = read.cacheAgeSeconds;
  }
  return oldest;
}

/** The freshest moment any contributing OK value entered the cache — `generatedAtUtc`'s source. */
export function newestOkFetchedAt(reads: readonly CachedRead<unknown>[]): string | null {
  let newest: string | null = null;
  for (const read of reads) {
    if (read.kind !== 'ok' || read.fetchedAtUtc === null) continue;
    if (newest === null || Date.parse(read.fetchedAtUtc) > Date.parse(newest)) {
      newest = read.fetchedAtUtc;
    }
  }
  return newest;
}

/**
 * The `[year]` ECMWF's required copyright line states, taken from THIS response's own data.
 *
 * ## Why the response's own reading and not `/layers`' catalogue cycle (M5 plan §4, ruling S3)
 * NOVA §5 fixes the semantics: the year is the year the DATA belongs to, i.e. the model run's
 * year, not the wall clock's. Every resolved point already holds its ECMWF read, so the answer
 * costs ZERO extra queries — deriving it from the layer catalogue instead would add a Postgres
 * round trip to two hot public endpoints for a value that is identical 364 days out of 365.
 *
 * The accepted cost, documented rather than hidden: for a few hours around a New Year boundary
 * `/overview` and `/layers` can state different years, because they read different cycles. Both
 * are legally sound — each states the year of a run that really was published — so the
 * divergence is cosmetic, and the alternative (one shared query on every request) buys nothing.
 *
 * `null` when NO read behind this response carries a published cycle; `buildEcmwfRequiredNotice`
 * then OMITS the copyright line rather than inventing a year. Note the precise invariant (review
 * #83 CR-M3): the year is stated whenever an ok read holds a cycle, which on `/overview` can
 * include the narrow case where that cycle's values all resolve out of horizon and no
 * ECMWF-sourced number is published. That direction is deliberate — over-attributing a provider
 * whose material we did fetch is harmless, silently dropping its copyright line is not.
 *
 * Only `kind === 'ok'` reads count, matching the reducers above: a negative entry describes a
 * failure, not a published cycle, and its year would attribute data we are not serving. This
 * lives beside them, and not inside the service, so those branches are unit-testable without
 * Postgres (review #83 I1).
 */
export function ecmwfDataYear(reads: readonly CachedRead<EcmwfPointSeriesRead>[]): number | null {
  let newestRunMs: number | null = null;
  for (const read of reads) {
    if (read.kind !== 'ok' || read.value === null) continue;
    const runMs = Date.parse(read.value.series.modelRunAtUtc);
    if (Number.isNaN(runMs)) continue;
    if (newestRunMs === null || runMs > newestRunMs) newestRunMs = runMs;
  }
  return newestRunMs === null ? null : new Date(newestRunMs).getUTCFullYear();
}
