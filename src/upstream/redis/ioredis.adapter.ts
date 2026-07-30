import { Logger } from '@nestjs/common';
import Redis from 'ioredis';
import type { RedisClientPort } from './redis-client.port';

/**
 * Compare-and-delete. Returns 1 when this caller owned the key and deleted it.
 *
 * Written as Lua because GET-then-DEL from the client is a race: between the two round trips the
 * lock can expire and be re-taken, and the DEL then removes the NEW owner's lock
 * (SPEC-ADDENDUM §6.2 / §3.4 make this an explicit prohibition).
 */
const RELEASE_IF_OWNED = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("DEL", KEYS[1])
end
return 0
`;

/**
 * Fixed-window counter: increment, and set the expiry only on the first write.
 *
 * `INCR` then `EXPIRE` from the client would leave an eternal key whenever the process died
 * between the two calls — a quota window that never resets is a permanent outage.
 */
const INCREMENT_WITH_TTL = `
local value = redis.call("INCR", KEYS[1])
if value == 1 then
  redis.call("EXPIRE", KEYS[1], ARGV[1])
end
return value
`;

/**
 * Connection timings.
 *
 * `commandTimeout` is the important one: without it a Redis that accepts connections but stops
 * answering would hold every request until the operation deadline, converting a cache outage
 * into a site-wide latency event. One second is far above a healthy round trip (sub-millisecond
 * on a local network) and far below any budget we care about.
 */
const CONNECT_TIMEOUT_MS = 3_000;
const COMMAND_TIMEOUT_MS = 1_000;
const MAX_RETRIES_PER_REQUEST = 1;

/**
 * The one place in the app that talks to a Redis driver.
 *
 * Intentionally thin: it holds no policy, no fallback logic and no key names. Everything that
 * could be wrong in an interesting way — TTL arithmetic, lock ownership, staleness, degradation —
 * lives above the port and is unit-tested against an in-memory fake. What is left here is driver
 * wiring, and that is verified against a real Redis container in `test/upstream-redis.e2e-spec.ts`.
 */
export class IoredisAdapter implements RedisClientPort {
  private readonly logger = new Logger('Redis');
  private readonly client: Redis;

  constructor(url: string) {
    this.client = new Redis(url, {
      connectTimeout: CONNECT_TIMEOUT_MS,
      commandTimeout: COMMAND_TIMEOUT_MS,
      maxRetriesPerRequest: MAX_RETRIES_PER_REQUEST,
      // Keep the driver quiet about its own reconnection attempts; we log the outcomes that
      // matter (a degraded read/write) at the call site, with our own context.
      showFriendlyErrorStack: false,
    });

    // A connection error must never become an unhandled 'error' event (which crashes the
    // process). The cache degrades; the site stays up. This is the fail-soft rule (playbook
    // §3.5) applied to our own infrastructure rather than to a provider.
    this.client.on('error', (error: Error) => {
      this.logger.error(`Redis connection error: ${error.message}`);
    });
  }

  async get(key: string): Promise<string | null> {
    return await this.client.get(key);
  }

  async setWithTtl(key: string, value: string, ttlMs: number): Promise<void> {
    await this.client.set(key, value, 'PX', Math.max(1, Math.round(ttlMs)));
  }

  async setIfAbsent(key: string, value: string, ttlMs: number): Promise<boolean> {
    const result = await this.client.set(key, value, 'PX', Math.max(1, Math.round(ttlMs)), 'NX');
    return result === 'OK';
  }

  async deleteIfValueEquals(key: string, expected: string): Promise<boolean> {
    const deleted = await this.client.eval(RELEASE_IF_OWNED, 1, key, expected);
    return deleted === 1;
  }

  async incrementWithTtl(key: string, ttlSeconds: number): Promise<number> {
    const value = await this.client.eval(
      INCREMENT_WITH_TTL,
      1,
      key,
      String(Math.max(1, Math.round(ttlSeconds))),
    );
    // `eval` is typed `unknown` by the driver; a counter that is not a number means the script
    // or the key type is wrong, and guessing a value would corrupt the quota accounting.
    if (typeof value !== 'number') {
      throw new TypeError(`INCREMENT_WITH_TTL returned ${typeof value}, expected number`);
    }
    return value;
  }

  async quit(): Promise<void> {
    await this.client.quit();
  }
}
