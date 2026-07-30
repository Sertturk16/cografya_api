import type { RedisClientPort } from '../../src/upstream/redis/redis-client.port';

interface StoredValue {
  value: string;
  expiresAtMs: number;
}

/**
 * An in-memory `RedisClientPort` with faithful expiry, NX and compare-and-delete semantics.
 *
 * Everything above the port (cache, single-flight, warmup lock, quota counters) is exercised
 * against this, so those tests are deterministic and need no container. What it CANNOT prove is
 * that the real driver speaks the same dialect — that is the job of the real-Redis e2e, which
 * covers the adapter and nothing else.
 *
 * The clock is injectable so TTL behaviour is asserted by moving time, not by sleeping.
 */
export class FakeRedisClient implements RedisClientPort {
  private readonly store = new Map<string, StoredValue>();
  private nowMs: number;

  /** Set to make every command reject — the Redis-outage path. */
  failing = false;

  /** Every command name this fake has served, in order — for asserting round-trip counts. */
  readonly calls: string[] = [];

  constructor(startMs = 1_000_000) {
    this.nowMs = startMs;
  }

  now(): number {
    return this.nowMs;
  }

  advance(ms: number): void {
    this.nowMs += ms;
  }

  /** Present, unexpired keys — for asserting that a lock was actually released. */
  keys(): string[] {
    return [...this.store.keys()].filter((key) => this.read(key) !== null);
  }

  /**
   * Records the call and, when `failing`, produces a REJECTED PROMISE rather than a synchronous
   * throw.
   *
   * The distinction is the whole point of the fake: `IoredisAdapter`'s methods are `async`, so a
   * driver error always arrives as a rejection. Production code that guards with `.catch(...)` —
   * `RedisSingleFlight`'s lock release and the warmup lock release both do — would be exercised
   * against a synchronous throw that escapes the `.catch` entirely, i.e. the test would pass
   * against behaviour the real client never exhibits (review #73 MINOR).
   *
   * @returns the rejection to hand straight back to the caller, or `null` to carry on.
   */
  private guard<T>(command: string): Promise<T> | null {
    this.calls.push(command);
    if (!this.failing) return null;
    return Promise.reject(new Error(`FakeRedisClient: ${command} failed (simulated outage)`));
  }

  private read(key: string): string | null {
    const entry = this.store.get(key);
    if (entry === undefined) return null;
    if (entry.expiresAtMs <= this.nowMs) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  get(key: string): Promise<string | null> {
    const guarded = this.guard<string | null>('get');
    if (guarded !== null) return guarded;
    return Promise.resolve(this.read(key));
  }

  setWithTtl(key: string, value: string, ttlMs: number): Promise<void> {
    const guarded = this.guard<void>('setWithTtl');
    if (guarded !== null) return guarded;
    this.store.set(key, { value, expiresAtMs: this.nowMs + ttlMs });
    return Promise.resolve();
  }

  setIfAbsent(key: string, value: string, ttlMs: number): Promise<boolean> {
    const guarded = this.guard<boolean>('setIfAbsent');
    if (guarded !== null) return guarded;
    if (this.read(key) !== null) return Promise.resolve(false);
    this.store.set(key, { value, expiresAtMs: this.nowMs + ttlMs });
    return Promise.resolve(true);
  }

  deleteIfValueEquals(key: string, expected: string): Promise<boolean> {
    const guarded = this.guard<boolean>('deleteIfValueEquals');
    if (guarded !== null) return guarded;
    if (this.read(key) !== expected) return Promise.resolve(false);
    this.store.delete(key);
    return Promise.resolve(true);
  }

  incrementWithTtl(key: string, ttlSeconds: number, by = 1): Promise<number> {
    const guarded = this.guard<number>('incrementWithTtl');
    if (guarded !== null) return guarded;
    const current = this.read(key);
    if (current === null) {
      this.store.set(key, { value: String(by), expiresAtMs: this.nowMs + ttlSeconds * 1000 });
      return Promise.resolve(by);
    }
    const next = Number(current) + by;
    const entry = this.store.get(key);
    if (entry === undefined) throw new Error('unreachable: read() returned a value for no entry');
    // The expiry is NOT extended — a fixed window, exactly like the Lua script.
    this.store.set(key, { value: String(next), expiresAtMs: entry.expiresAtMs });
    return Promise.resolve(next);
  }

  quit(): Promise<void> {
    const guarded = this.guard<void>('quit');
    if (guarded !== null) return guarded;
    this.store.clear();
    return Promise.resolve();
  }
}
