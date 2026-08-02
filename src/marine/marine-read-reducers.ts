import type { CachedRead } from '../upstream/cache/upstream-cache.service';

/**
 * The two response-level reducers over a request's contributing cache reads: the
 * `X-Marine-Cache-Age` header source (plan §5) and the data-derived `generatedAtUtc`
 * (contract delta d5).
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
