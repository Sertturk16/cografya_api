/**
 * A bounded, in-process LRU of decoded tile grids.
 *
 * ## Why this is NOT `UpstreamCacheService`
 * That service is the right home for the PROFILE result (small JSON, shared across instances,
 * single-flight, negative TTLs) and the wrong home for a tile. It serialises entries with
 * `JSON.stringify` (`upstream-cache.store.ts`), and a decoded tile is 65 536 samples: roughly
 * 400 KB as a JSON array, ~175 KB base64-encoded. Thousands of those in Redis is hundreds of
 * megabytes, which is a hosting-cost decision — and hosting is still undecided
 * (`ENGINEERING.md` §8). Choosing it silently inside a feature PR would be taking that
 * decision on the owner's behalf.
 *
 * So tiles live here, per process, bounded by COUNT, and the shared profile cache absorbs the
 * repeats that matter. The known limit is stated rather than hidden: with N instances there
 * are N tile caches and each warms separately. That is a warm-up cost and never a correctness
 * one, because the tiles are immutable — the provider's own `Last-Modified` is 2017-11-17
 * (SPEC §7.4), so two caches can never hold two different answers for one key.
 *
 * If measurement later shows the hit rate does not justify the per-instance warm-up, a Redis
 * tile tier is proposed to Atlas rather than added on reflex (`ENGINEERING.md` §12).
 *
 * ## Bounded by count, and the count is not a guess
 * One grid is 65 536 × 2 bytes = 128 KiB exactly. The default ceiling is therefore stated in
 * tiles and converted in the comment where it is set, so nobody has to re-derive the memory
 * cost from the tile count at 3 a.m.
 */

/** Bytes one decoded grid occupies: 256 × 256 cells × 2 bytes (`Int16Array`). */
export const BYTES_PER_DECODED_TILE = 256 * 256 * 2;

export interface TileCacheStats {
  readonly size: number;
  readonly hits: number;
  readonly misses: number;
  readonly evictions: number;
}

/**
 * Least-recently-used map from tile key to decoded grid.
 *
 * `Map` preserves insertion order, so "delete then set" on every touch makes the first key in
 * iteration order the least recently used. That is the same mechanism `InProcessCacheStore`
 * uses; it is repeated rather than shared because the two hold different value types and the
 * shared abstraction would be an interface with one implementation each.
 */
export class TerrainTileCache {
  private readonly entries = new Map<string, Int16Array>();

  private hits = 0;
  private misses = 0;
  private evictions = 0;

  constructor(private readonly maxTiles: number) {
    if (!Number.isInteger(maxTiles) || maxTiles < 1) {
      // A zero or negative ceiling would make every `set` evict what it just wrote, turning
      // the cache into a slow no-op that still looks configured.
      throw new RangeError(`maxTiles must be an integer >= 1, received ${String(maxTiles)}`);
    }
  }

  get(key: string): Int16Array | null {
    const held = this.entries.get(key);
    if (held === undefined) {
      this.misses += 1;
      return null;
    }
    this.entries.delete(key);
    this.entries.set(key, held);
    this.hits += 1;
    return held;
  }

  set(key: string, grid: Int16Array): void {
    this.entries.delete(key);
    this.entries.set(key, grid);

    while (this.entries.size > this.maxTiles) {
      const oldest = this.entries.keys().next();
      if (oldest.done === true) break;
      this.entries.delete(oldest.value);
      this.evictions += 1;
    }
  }

  /** Observability seam — what the endpoint reports and what the tests assert on. */
  stats(): TileCacheStats {
    return {
      size: this.entries.size,
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions,
    };
  }
}
