/**
 * The ONLY Redis surface the rest of the app is allowed to see.
 *
 * Purpose-built, not a mirror of any driver's API. Two reasons, both load-bearing:
 *
 * 1. **The dangerous operations are not expressible.** There is no `del(key)` that takes an
 *    arbitrary key next to a lock: releasing a lock goes through `deleteIfValueEquals`, so the
 *    "bare DEL can erase another instance's lock" mistake (SPEC-ADDENDUM §6.2, §3.4) cannot be
 *    written, not merely must-not-be-written.
 * 2. **Everything above this line is testable without a server.** The cache, the single-flight
 *    and the warmup lock are exercised against an in-memory fake that implements exactly these
 *    six methods; a real Redis then verifies the ADAPTER in one focused e2e (`test/
 *    upstream-redis.e2e-spec.ts`), which is where a driver-semantics bug would actually live.
 *
 * Every method may reject. Callers must treat a rejection as "the cache is unavailable" and
 * degrade loudly — never as "the key is absent", which would silently turn a Redis outage into a
 * provider stampede.
 */
export interface RedisClientPort {
  /** `GET key` — `null` when absent or expired. */
  get(key: string): Promise<string | null>;

  /** `SET key value PX ttlMs` — unconditional write with an expiry. Never writes without one. */
  setWithTtl(key: string, value: string, ttlMs: number): Promise<void>;

  /**
   * `SET key value NX PX ttlMs` — the lock acquisition.
   *
   * @returns `true` only when THIS caller created the key.
   */
  setIfAbsent(key: string, value: string, ttlMs: number): Promise<boolean>;

  /**
   * Compare-and-delete, atomically (Lua): delete `key` only while it still holds `expected`.
   *
   * The lock release. A bare `DEL` would let an instance whose lock had already EXPIRED delete
   * the fresh lock a different instance has since taken — two writers, no error, no trace.
   *
   * @returns `true` if this call deleted the key.
   */
  deleteIfValueEquals(key: string, expected: string): Promise<boolean>;

  /**
   * Atomic `INCR` + first-write `EXPIRE` (Lua): the fixed-window quota counter.
   *
   * The TTL is applied only when the counter is created, so a window cannot be extended
   * indefinitely by traffic inside it.
   *
   * @returns the counter's new value.
   */
  incrementWithTtl(key: string, ttlSeconds: number): Promise<number>;

  /** Close the connection. Called on application shutdown. */
  quit(): Promise<void>;
}

/**
 * Injection token for the optional Redis client.
 *
 * Resolves to `null` when `REDIS_URL` is unset — a legitimate development configuration
 * (in-process LRU mode). Production with `MARINE_ENABLED=true` cannot reach that state: the env
 * schema refuses to boot (owner ruling E1 → DEC 2026-07-29b).
 */
export const REDIS_CLIENT = Symbol('REDIS_CLIENT');
