import { describe, expect, it } from '@jest/globals';
import { validateEnv } from './env.schema';

/**
 * Boot-time configuration is a security surface, not plumbing: this is the file that decides
 * whether a production process may run without the cache that stands between us and a provider
 * ban. Every rule below is asserted from OUTSIDE, through `validateEnv`, exactly as
 * `ConfigModule` calls it.
 */
const BASE = {
  NODE_ENV: 'development',
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
};

describe('validateEnv — defaults', () => {
  it('boots on NODE_ENV + DATABASE_URL alone, with the marine feature OFF', () => {
    const env = validateEnv({ ...BASE });

    // `false` by default so a fresh deployment can never reach a provider before someone decided
    // it should (SPEC-ADDENDUM §3.4 makes the flip an M5 acceptance criterion).
    expect(env.MARINE_ENABLED).toBe(false);
    expect(env.REDIS_URL).toBeUndefined();
    expect(env.MARINE_UPSTREAM_DEADLINE_MS).toBe(6_000);
    expect(env.MARINE_SINGLE_CALL_TIMEOUT_MS).toBe(3_000);
    expect(env.MARINE_WARMUP_INTERVAL_SECONDS).toBe(900);
    expect(env.MARINE_WARMUP_DEADLINE_MS).toBe(120_000);
  });

  it('carries the decomposed TTLs, not one shared number', () => {
    const env = validateEnv({ ...BASE });

    expect(env.MARINE_VALUE_TTL_SECONDS).toBe(3_600);
    expect(env.MARINE_NO_DATA_TTL_SECONDS).toBe(86_400);
    expect(env.MARINE_ERROR_TTL_SECONDS).toBe(60);
    expect(env.MARINE_RATELIMIT_TTL_SECONDS).toBe(300);
    expect(env.MARINE_CLIENT_ERROR_TTL_SECONDS).toBe(900);
    expect(env.MARINE_SCHEMA_ERROR_TTL_SECONDS).toBe(300);
    expect(env.MARINE_STALE_MAX_SECONDS).toBe(21_600);
    expect(env.MARINE_VALID_AT_MAX_AGE_SECONDS).toBe(10_800);
  });

  it('declares only variables something actually reads', () => {
    // MARINE_POINTS_TTL_SECONDS / MARINE_LAYERS_TTL_SECONDS were declared and documented but read
    // by nothing — the values they named live in a controller decorator an env var cannot reach.
    // An operator lowering one saw no change and no warning (review #73 MINOR).
    const env: Record<string, unknown> = validateEnv({ ...BASE });
    expect(env.MARINE_POINTS_TTL_SECONDS).toBeUndefined();
    expect(env.MARINE_LAYERS_TTL_SECONDS).toBeUndefined();
  });
});

describe('validateEnv — NODE_ENV is required', () => {
  it('REFUSES to boot when the environment does not say which one it is', () => {
    // The E1 gate keys on NODE_ENV, so a default made the rule opt-OUT-able by omission: a
    // deployment that forgot to export it booted production traffic on the single-instance LRU
    // (review #73, security i1).
    expect(() => validateEnv({ DATABASE_URL: 'postgresql://u:p@localhost:5432/db' })).toThrow(
      /NODE_ENV/,
    );
  });

  it('REFUSES the E1-relevant combination when NODE_ENV is absent', () => {
    expect(() =>
      validateEnv({ DATABASE_URL: 'postgresql://u:p@localhost:5432/db', MARINE_ENABLED: 'true' }),
    ).toThrow(/NODE_ENV/);
  });
});

describe('validateEnv — booleans', () => {
  it('reads exactly "true" and "false"', () => {
    expect(validateEnv({ ...BASE, MARINE_ENABLED: 'true' }).MARINE_ENABLED).toBe(true);
    expect(validateEnv({ ...BASE, MARINE_ENABLED: 'false' }).MARINE_ENABLED).toBe(false);
  });

  it('REFUSES a truthy-looking string rather than guessing', () => {
    // `z.coerce.boolean()` would read every one of these as `true` — including the literal
    // string "false", which would turn a deliberate kill switch into a no-op.
    for (const value of ['1', '0', 'yes', 'TRUE', 'on', '']) {
      expect(() => validateEnv({ ...BASE, MARINE_ENABLED: value })).toThrow(
        /Invalid environment configuration/,
      );
    }
  });
});

describe('validateEnv — E1: Redis is mandatory in production (DEC 2026-07-29b)', () => {
  it('REFUSES TO BOOT in production with the marine feature on and no REDIS_URL', () => {
    expect(() => validateEnv({ ...BASE, NODE_ENV: 'production', MARINE_ENABLED: 'true' })).toThrow(
      /REDIS_URL is REQUIRED/,
    );
  });

  it('boots in production with the feature on once REDIS_URL is present', () => {
    const env = validateEnv({
      ...BASE,
      NODE_ENV: 'production',
      MARINE_ENABLED: 'true',
      REDIS_URL: 'redis://cache:6379',
    });
    expect(env.REDIS_URL).toBe('redis://cache:6379');
  });

  it('boots in production WITHOUT Redis while the feature is off — nothing calls a provider', () => {
    expect(() => validateEnv({ ...BASE, NODE_ENV: 'production' })).not.toThrow();
  });

  it('leaves Redis optional in development and test', () => {
    expect(() =>
      validateEnv({ ...BASE, NODE_ENV: 'development', MARINE_ENABLED: 'true' }),
    ).not.toThrow();
    expect(() => validateEnv({ ...BASE, NODE_ENV: 'test', MARINE_ENABLED: 'true' })).not.toThrow();
  });

  it('rejects a REDIS_URL that is not a redis scheme', () => {
    expect(() => validateEnv({ ...BASE, REDIS_URL: 'http://cache:6379' })).toThrow(
      /redis:\/\/ or rediss:\/\//,
    );
  });

  it('rejects a HOSTLESS redis URL — it parses, and ioredis would silently use localhost', () => {
    // The shape that satisfied E1 on paper while pointing the cache at nothing: a deployment
    // templating `redis://$REDIS_HOST:6379` with the inner variable unset (review #73, security
    // i2 — reproduced against this repo's own zod and ioredis).
    for (const value of ['redis://', 'rediss://']) {
      expect(() => validateEnv({ ...BASE, REDIS_URL: value })).toThrow(/with a host/);
    }
    expect(() => validateEnv({ ...BASE, REDIS_URL: 'redis://cache:6379' })).not.toThrow();
  });

  it('still refuses production + enabled when REDIS_URL is present but malformed', () => {
    // Both rules have to compose: a field-level refine failing must not let the root-level E1
    // check be skipped in a way that reads as "configured".
    expect(() =>
      validateEnv({
        ...BASE,
        NODE_ENV: 'production',
        MARINE_ENABLED: 'true',
        REDIS_URL: 'redis://',
      }),
    ).toThrow(/Invalid environment configuration/);
  });
});

describe('validateEnv — configurations that cannot mean what they say', () => {
  it('refuses a single-call timeout larger than the whole operation budget', () => {
    expect(() =>
      validateEnv({
        ...BASE,
        MARINE_UPSTREAM_DEADLINE_MS: '3000',
        MARINE_SINGLE_CALL_TIMEOUT_MS: '9000',
      }),
    ).toThrow(/must not exceed MARINE_UPSTREAM_DEADLINE_MS/);
  });

  it('refuses a value TTL above the staleness ceiling', () => {
    // Otherwise a value could be dropped for breaching the ceiling while still labelled `fresh` —
    // the two rules would contradict each other on the same number.
    expect(() =>
      validateEnv({
        ...BASE,
        MARINE_VALUE_TTL_SECONDS: '30000',
        MARINE_STALE_MAX_SECONDS: '21600',
      }),
    ).toThrow(/must not exceed MARINE_STALE_MAX_SECONDS/);
  });

  it('refuses a warmup deadline that can outlive its own interval', () => {
    expect(() =>
      validateEnv({
        ...BASE,
        MARINE_WARMUP_INTERVAL_SECONDS: '60',
        MARINE_WARMUP_DEADLINE_MS: '120000',
      }),
    ).toThrow(/shorter than MARINE_WARMUP_INTERVAL_SECONDS/);
  });

  it('still refuses a missing DATABASE_URL — the original fail-fast guarantee', () => {
    expect(() => validateEnv({})).toThrow(/Invalid environment configuration/);
  });
});
