import type { RedisClientPort } from '../redis/redis-client.port';
import type { UpstreamMetrics } from '../upstream-metrics';

/**
 * How long a Redis refresh lock lives (SPEC-ADDENDUM §6.2).
 *
 * Comfortably longer than the 6 s request deadline, so the winner cannot lose its lock mid-flight,
 * and short enough that a process killed while holding one blocks refreshes for seconds, not
 * minutes.
 */
export const REFRESH_LOCK_TTL_MS = 15_000;

export type SingleFlightResult<T> =
  /** This caller ran the refresh. */
  | { readonly outcome: 'ran'; readonly value: T }
  /** A refresh was already in flight IN THIS PROCESS and this caller awaited it. */
  | { readonly outcome: 'joined'; readonly value: T }
  /** Another instance holds the lock. This caller did NOT wait — see the class docs. */
  | { readonly outcome: 'lost' };

export interface SingleFlight {
  readonly mode: 'redis' | 'memory';
  run<T>(key: string, refresh: () => Promise<T>): Promise<SingleFlightResult<T>>;
}

/**
 * Single-instance coalescing: the second caller awaits the FIRST caller's promise.
 *
 * ## Two rules that look small and are not
 * 1. **The in-flight record is removed in `finally`.** Not on success — in `finally`. A refresh
 *    that rejects must leave no trace, or that key is poisoned for the process lifetime.
 * 2. **A rejected promise is never cached.** Falls out of (1), and is stated separately because
 *    it is the failure mode SPEC-ADDENDUM §6.2 calls out by name.
 *
 * Joining (rather than the Redis mode's "do not wait") is right here precisely because it is the
 * same process: the joiner is already inside our own event loop, the winner's result will arrive
 * as fast as anything can, and there is no cross-instance latency to fear.
 */
export class InProcessSingleFlight implements SingleFlight {
  readonly mode = 'memory';

  private readonly inFlight = new Map<string, Promise<unknown>>();

  constructor(private readonly metrics: UpstreamMetrics) {}

  async run<T>(key: string, refresh: () => Promise<T>): Promise<SingleFlightResult<T>> {
    const existing = this.inFlight.get(key);
    if (existing !== undefined) {
      this.metrics.increment('singleflight.joined', 'cache');
      return { outcome: 'joined', value: (await existing) as T };
    }

    const promise = refresh();
    this.inFlight.set(key, promise);
    try {
      return { outcome: 'ran', value: await promise };
    } finally {
      this.inFlight.delete(key);
    }
  }
}

/**
 * Cross-instance coalescing through a Redis lock.
 *
 * ## The loser does NOT wait — this is the whole point
 * Waiting for the winner would reintroduce exactly the latency A2 was designed away
 * (SPEC-ADDENDUM §6.2): the loser would sit through an upstream round trip it started no part
 * of. Instead it returns `lost` immediately and the CALLER decides what to serve — its own stale
 * value, or, if it truly has nothing, a short bounded poll (`UpstreamCacheService`).
 *
 * ## The lock is released by compare-and-delete, never by a bare DEL
 * If the winner overruns the lock TTL, the lock expires and another instance may legitimately
 * take it. A bare `DEL` at that moment would delete the NEW owner's lock and let two refreshes
 * run against the provider with nothing in the logs to show for it. The port makes that
 * unwritable (`deleteIfValueEquals`).
 *
 * ## Redis failure degrades to running the refresh
 * If the lock cannot be taken because Redis is unreachable, we run the refresh anyway and say so
 * loudly. The alternative — treating a Redis error as "someone else has the lock" — means NOBODY
 * refreshes and the cache decays to empty while every log line looks normal.
 */
export class RedisSingleFlight implements SingleFlight {
  readonly mode = 'redis';

  constructor(
    private readonly redis: RedisClientPort,
    private readonly metrics: UpstreamMetrics,
    private readonly lockTtlMs: number = REFRESH_LOCK_TTL_MS,
    private readonly tokenFactory: () => string = defaultToken,
  ) {}

  async run<T>(key: string, refresh: () => Promise<T>): Promise<SingleFlightResult<T>> {
    const lockKey = `upstream:lock:${key}`;
    const token = this.tokenFactory();

    let acquired: boolean;
    try {
      acquired = await this.redis.setIfAbsent(lockKey, token, this.lockTtlMs);
    } catch (error: unknown) {
      this.metrics.increment('redis.degraded', 'cache');
      this.metrics.event('warn', 'refresh lock unavailable — refreshing without coalescing', {
        key,
        reason: error instanceof Error ? error.message : 'unknown',
      });
      return { outcome: 'ran', value: await refresh() };
    }

    if (!acquired) {
      this.metrics.increment('singleflight.lost', 'cache');
      return { outcome: 'lost' };
    }

    try {
      return { outcome: 'ran', value: await refresh() };
    } finally {
      // Best effort: a failed release just means the lock expires on its own TTL, which is
      // exactly what the TTL is for. It must never mask the refresh's own outcome.
      await this.redis.deleteIfValueEquals(lockKey, token).catch((error: unknown) => {
        this.metrics.event('warn', 'refresh lock release failed; it will expire on its TTL', {
          key,
          reason: error instanceof Error ? error.message : 'unknown',
        });
        return false;
      });
    }
  }
}

/** Unguessable-enough lock token. Ownership, not secrecy — `randomUUID` is ample. */
function defaultToken(): string {
  return crypto.randomUUID();
}
