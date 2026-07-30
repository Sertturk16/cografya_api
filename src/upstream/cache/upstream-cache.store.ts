import type { RedisClientPort } from '../redis/redis-client.port';
import type { UpstreamMetrics } from '../upstream-metrics';
import type { UpstreamOutcomeKind } from '../upstream.types';

/**
 * One cached upstream outcome.
 *
 * ## `ttlSeconds` is the FRESHNESS horizon, not the eviction horizon
 * The single most important thing in this file. If an entry were physically evicted at
 * `ttlSeconds`, "serve stale while we refresh" would be impossible — the stale value would
 * already be gone, and `stale-while-revalidate` on an empty cache is exactly the trap
 * SPEC-ADDENDUM §2.5 documents. So the store keeps an entry for its RETENTION (up to the
 * staleness ceiling, 6 h) while `ttlSeconds` (1 h for a value) only decides whether it is
 * labelled `fresh` or `stale`.
 *
 * Negative entries are the opposite: their TTL *is* their retention. There is no value in
 * serving a stale error.
 */
export interface UpstreamCacheEntry<T> {
  kind: UpstreamOutcomeKind;
  /** `null` for every negative kind. */
  payload: T | null;
  /** Human-readable reason for a negative entry; `null` for `ok`. */
  reason: string | null;
  storedAtMs: number;
  /** The model time the payload belongs to; `null` when it carries none. */
  validAtMs: number | null;
  /** Freshness horizon in seconds. */
  ttlSeconds: number;
}

/**
 * Two operations, and deliberately no `delete`.
 *
 * Nothing in this design needs to remove a key: an unreadable or unwanted entry is treated as a
 * MISS, a miss triggers a refresh, and the refresh overwrites it. Self-healing without a delete
 * primitive — which also keeps the Redis port free of a bare `DEL`, the operation that must never
 * exist next to a lock key (see `RedisClientPort`).
 */
export interface UpstreamCacheStore {
  /** `redis` or `memory` — surfaced so the boot log can state the mode out loud. */
  readonly mode: 'redis' | 'memory';
  get<T>(key: string): Promise<UpstreamCacheEntry<T> | null>;
  /** @param retentionSeconds how long the entry physically survives (>= `entry.ttlSeconds`). */
  set<T>(key: string, entry: UpstreamCacheEntry<T>, retentionSeconds: number): Promise<void>;
}

/**
 * Entries kept in the in-process store before the least-recently-used one is dropped.
 *
 * 2 000 is far above Faz-1's working set (31 points × 5 layers + a handful of batch keys) and
 * small enough that a runaway key pattern cannot exhaust the heap. A cap is not optional: an
 * unbounded `Map` keyed by anything derived from a request is a memory leak with a scheduler.
 */
const DEFAULT_MAX_ENTRIES = 2_000;

/**
 * In-process LRU store — the development / single-instance mode.
 *
 * **Correct only on one instance.** With N instances there are N caches, N× the upstream load,
 * and single-flight cannot coordinate across them; every deploy also starts cold
 * (SPEC-ADDENDUM §2.6). Production with the feature enabled cannot select this mode: the env
 * schema refuses to boot without `REDIS_URL` (owner ruling E1 → DEC 2026-07-29b), and choosing
 * it in development is logged loudly at boot.
 */
export class InProcessCacheStore implements UpstreamCacheStore {
  readonly mode = 'memory';

  private readonly entries = new Map<
    string,
    { entry: UpstreamCacheEntry<unknown>; expiresAtMs: number }
  >();

  constructor(
    private readonly now: () => number = Date.now,
    private readonly maxEntries: number = DEFAULT_MAX_ENTRIES,
  ) {}

  get<T>(key: string): Promise<UpstreamCacheEntry<T> | null> {
    const held = this.entries.get(key);
    if (held === undefined) return Promise.resolve(null);
    if (held.expiresAtMs <= this.now()) {
      this.entries.delete(key);
      return Promise.resolve(null);
    }
    // Re-insert to mark it most-recently-used: `Map` preserves insertion order, which is what
    // makes the first key in iteration order the least recently used.
    this.entries.delete(key);
    this.entries.set(key, held);
    return Promise.resolve(held.entry as UpstreamCacheEntry<T>);
  }

  set<T>(key: string, entry: UpstreamCacheEntry<T>, retentionSeconds: number): Promise<void> {
    this.entries.delete(key);
    this.entries.set(key, { entry, expiresAtMs: this.now() + retentionSeconds * 1000 });

    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next();
      if (oldest.done === true) break;
      this.entries.delete(oldest.value);
    }
    return Promise.resolve();
  }
}

/**
 * Redis-backed store — the production mode.
 *
 * ## A Redis outage degrades, it never throws into a request
 * Every operation is wrapped: a failed read counts as a MISS and a failed write is dropped, both
 * with a loud counter and log line. The alternative — letting the rejection propagate — would
 * turn a cache outage into a 500 on a public content page, which is the one thing the fail-soft
 * rule (playbook §3.5) forbids. It is degraded, but it is never silent.
 */
export class RedisCacheStore implements UpstreamCacheStore {
  readonly mode = 'redis';

  constructor(
    private readonly redis: RedisClientPort,
    private readonly metrics: UpstreamMetrics,
    private readonly keyPrefix = 'upstream:cache:',
  ) {}

  async get<T>(key: string): Promise<UpstreamCacheEntry<T> | null> {
    let raw: string | null;
    try {
      raw = await this.redis.get(this.keyPrefix + key);
    } catch (error: unknown) {
      this.degraded('read', key, error);
      return null;
    }
    if (raw === null) return null;

    try {
      return JSON.parse(raw) as UpstreamCacheEntry<T>;
    } catch (error: unknown) {
      // A corrupt entry is a MISS. The miss drives a refresh, and the refresh overwrites the key —
      // so it heals itself on the next read without this layer needing a delete primitive.
      this.degraded('parse', key, error);
      return null;
    }
  }

  async set<T>(key: string, entry: UpstreamCacheEntry<T>, retentionSeconds: number): Promise<void> {
    try {
      await this.redis.setWithTtl(
        this.keyPrefix + key,
        JSON.stringify(entry),
        Math.max(1, retentionSeconds) * 1000,
      );
    } catch (error: unknown) {
      this.degraded('write', key, error);
    }
  }

  private degraded(operation: string, key: string, error: unknown): void {
    this.metrics.increment('redis.degraded', 'cache');
    this.metrics.event('warn', 'redis cache degraded', {
      operation,
      key,
      reason: error instanceof Error ? error.message : 'unknown',
    });
  }
}
