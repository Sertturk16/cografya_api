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

  private guard(command: string): void {
    this.calls.push(command);
    if (this.failing) throw new Error(`FakeRedisClient: ${command} failed (simulated outage)`);
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
    this.guard('get');
    return Promise.resolve(this.read(key));
  }

  setWithTtl(key: string, value: string, ttlMs: number): Promise<void> {
    this.guard('setWithTtl');
    this.store.set(key, { value, expiresAtMs: this.nowMs + ttlMs });
    return Promise.resolve();
  }

  setIfAbsent(key: string, value: string, ttlMs: number): Promise<boolean> {
    this.guard('setIfAbsent');
    if (this.read(key) !== null) return Promise.resolve(false);
    this.store.set(key, { value, expiresAtMs: this.nowMs + ttlMs });
    return Promise.resolve(true);
  }

  deleteIfValueEquals(key: string, expected: string): Promise<boolean> {
    this.guard('deleteIfValueEquals');
    if (this.read(key) !== expected) return Promise.resolve(false);
    this.store.delete(key);
    return Promise.resolve(true);
  }

  incrementWithTtl(key: string, ttlSeconds: number): Promise<number> {
    this.guard('incrementWithTtl');
    const current = this.read(key);
    if (current === null) {
      this.store.set(key, { value: '1', expiresAtMs: this.nowMs + ttlSeconds * 1000 });
      return Promise.resolve(1);
    }
    const next = Number(current) + 1;
    const entry = this.store.get(key);
    if (entry === undefined) throw new Error('unreachable: read() returned a value for no entry');
    // The expiry is NOT extended — a fixed window, exactly like the Lua script.
    this.store.set(key, { value: String(next), expiresAtMs: entry.expiresAtMs });
    return Promise.resolve(next);
  }

  quit(): Promise<void> {
    this.guard('quit');
    this.store.clear();
    return Promise.resolve();
  }
}
