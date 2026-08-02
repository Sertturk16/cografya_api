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
    // 300 s since M3b (SPEC §9.2): the tour now hosts the ECMWF ingest slice.
    expect(env.MARINE_WARMUP_DEADLINE_MS).toBe(300_000);
  });

  it('carries the ECMWF ingest block with its measured defaults (M3b, SPEC §12)', () => {
    const env = validateEnv({ ...BASE });

    expect(env.ECMWF_ENABLED).toBe(true);
    expect(env.ECMWF_BASE_URL).toBe('https://data.ecmwf.int/forecasts');
    expect(env.ECMWF_FAILOVER_BASE_URL).toBeUndefined();
    expect(env.ECMWF_FORECAST_HOURS).toBe(120);
    expect(env.ECMWF_SINGLE_CALL_TIMEOUT_MS).toBe(20_000);
    expect(env.ECMWF_TOUR_BUDGET_MS).toBe(180_000);
    expect(env.ECMWF_MAX_STEPS_PER_TOUR).toBe(12);
    expect(env.ECMWF_TOUR_MAX_BYTES).toBe(67_108_864);
    expect(env.ECMWF_CYCLE_MAX_BYTES).toBe(335_544_320);
    expect(env.ECMWF_CYCLE_MAX_AGE_SECONDS).toBe(86_400);
    expect(env.ECMWF_STALE_MAX_SECONDS).toBe(43_200);
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

describe('validateEnv — INTERNAL_REQUEST_TOKEN is a wire contract, not just a length', () => {
  // A 44-char visible-ASCII stand-in, the shape `openssl rand -hex 32` produces. Not a secret.
  const VALID = 'e2e-trusted-client-token-0123456789-abcdefgh';

  it('stays OPTIONAL — the exemption is fail-closed and dev/test/CI boot without it', () => {
    expect(validateEnv({ ...BASE }).INTERNAL_REQUEST_TOKEN).toBeUndefined();
  });

  it('accepts a visible-ASCII value of at least 32 characters', () => {
    expect(validateEnv({ ...BASE, INTERNAL_REQUEST_TOKEN: VALID }).INTERNAL_REQUEST_TOKEN).toBe(
      VALID,
    );
  });

  it('still refuses a value shorter than 32 characters', () => {
    // A weak bypass secret is worse than none: the exemption exists only when deliberately set.
    expect(() => validateEnv({ ...BASE, INTERNAL_REQUEST_TOKEN: 'short' })).toThrow(
      /at least 32 characters/,
    );
    // An EMPTY assignment is a value, not an absence — it must not read as "unset".
    expect(() => validateEnv({ ...BASE, INTERNAL_REQUEST_TOKEN: '' })).toThrow(
      /at least 32 characters/,
    );
  });

  it('draws the length line at EXACTLY 32 — one character either side of it', () => {
    // The boundary itself, not a value comfortably past it: `min(32)` and `min(33)` both pass
    // every other test in this block, and the two repos must cut at the same character or a
    // secret one repo accepts is a secret the other refuses to boot with. Mirrors the same
    // pair in the web's `env.server` spec.
    expect(() => validateEnv({ ...BASE, INTERNAL_REQUEST_TOKEN: 'a'.repeat(31) })).toThrow(
      /at least 32 characters/,
    );
    expect(
      validateEnv({ ...BASE, INTERNAL_REQUEST_TOKEN: 'a'.repeat(32) }).INTERNAL_REQUEST_TOKEN,
    ).toHaveLength(32);
  });

  it('REFUSES whitespace — the api and the web would then hold different bytes', () => {
    // Node's HTTP parser trims a header value's edges, so a leading/trailing space here can
    // never be presented back to us: the exemption would be permanently dead while the boot log
    // reports it active. An internal newline is the wrapped `openssl rand -base64 64` shape.
    for (const value of [` ${VALID}`, `${VALID} `, `${VALID.slice(0, 20)}\n${VALID.slice(20)}`]) {
      expect(() => validateEnv({ ...BASE, INTERNAL_REQUEST_TOKEN: value })).toThrow(
        /visible ASCII/,
      );
    }
  });

  it('REFUSES control and non-ASCII characters that a `\\S` check would admit', () => {
    // Every one of these is non-whitespace, so a length+`\S` rule accepts them — and the web
    // side's `Headers` rejects them, which configures an exemption no valid client can satisfy.
    for (const suffix of ['\u0000', '\u007F', 'ş', '🌍']) {
      expect(() => validateEnv({ ...BASE, INTERNAL_REQUEST_TOKEN: VALID + suffix })).toThrow(
        /visible ASCII/,
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

  it('refuses an ECMWF single-download timeout above the whole tour slice', () => {
    expect(() =>
      validateEnv({
        ...BASE,
        ECMWF_SINGLE_CALL_TIMEOUT_MS: '200000',
        ECMWF_TOUR_BUDGET_MS: '180000',
      }),
    ).toThrow(/must not exceed ECMWF_TOUR_BUDGET_MS/);
  });

  it('refuses an ECMWF tour slice that swallows the whole warmup deadline — CMEMS would starve', () => {
    expect(() =>
      validateEnv({
        ...BASE,
        ECMWF_TOUR_BUDGET_MS: '300000',
        MARINE_WARMUP_DEADLINE_MS: '300000',
      }),
    ).toThrow(/smaller than MARINE_WARMUP_DEADLINE_MS/);
  });

  it('refuses a per-tour byte cap above the per-cycle one', () => {
    expect(() =>
      validateEnv({
        ...BASE,
        ECMWF_TOUR_MAX_BYTES: '400000000',
        ECMWF_CYCLE_MAX_BYTES: '335544320',
      }),
    ).toThrow(/must not exceed ECMWF_CYCLE_MAX_BYTES/);
  });

  it('refuses a single-range cap above the per-tour one — the SEC-76-1 guard must stay inside the ceilings', () => {
    expect(() =>
      validateEnv({
        ...BASE,
        ECMWF_MAX_RANGE_BYTES: '100000000',
        ECMWF_TOUR_MAX_BYTES: '67108864',
      }),
    ).toThrow(/must not exceed ECMWF_TOUR_MAX_BYTES/);
  });

  it('refuses a horizon past 120 h — that is a frozen-contract change, not an env flip', () => {
    // Past +144 h the provider's step widens to 6 h and `MarineSeriesDto.stepHours = 3` becomes a
    // lie; 120 is the owner-ruled horizon (O1) and the schema is what keeps an operator from
    // breaking the contract with an export line.
    expect(() => validateEnv({ ...BASE, ECMWF_FORECAST_HOURS: '168' })).toThrow(
      /frozen-contract change/,
    );
    expect(() => validateEnv({ ...BASE, ECMWF_FORECAST_HOURS: '100' })).toThrow(/multiple of/);
    expect(validateEnv({ ...BASE, ECMWF_FORECAST_HOURS: '48' }).ECMWF_FORECAST_HOURS).toBe(48);
  });
});

describe('validateEnv — the air-quality (CAMS/ADS) block', () => {
  it('boots with the leg OFF and carries the measured defaults (plan §9)', () => {
    const env = validateEnv({ ...BASE });

    // OFF by default, and no key required to boot: dev, CI and the web build must all start
    // on a machine that has never heard of ADS.
    expect(env.AIR_QUALITY_ENABLED).toBe(false);
    expect(env.ADS_API_KEY).toBeUndefined();
    expect(env.AIR_QUALITY_INGEST_ENABLED).toBe(true);
    expect(env.AIR_QUALITY_ANALYSIS_ENABLED).toBe(true);
    expect(env.AIR_QUALITY_INGEST_INTERVAL_SECONDS).toBe(600);
    expect(env.AIR_QUALITY_INGEST_DEADLINE_MS).toBe(300_000);
    expect(env.ADS_API_BASE_URL).toBe('https://ads.atmosphere.copernicus.eu/api');
    expect(env.ADS_OBJECT_STORE_HOSTS).toBe('object-store.os-api.cci2.ecmwf.int');
    expect(env.AIR_QUALITY_DATASET_ID).toBe('cams-europe-air-quality-forecasts');
    expect(env.AIR_QUALITY_AREA).toBe('42.5,25.5,35.5,45.0');
    expect(env.AIR_QUALITY_FORECAST_HOURS).toBe(96);
    expect(env.AIR_QUALITY_SUBMIT_AFTER_UTC_HOUR).toBe(12);
    expect(env.AIR_QUALITY_MAX_ATTEMPTS_PER_JOB).toBe(6);
    expect(env.AIR_QUALITY_POLL_TIMEOUT_MS).toBe(10_000);
    expect(env.AIR_QUALITY_DOWNLOAD_TIMEOUT_MS).toBe(180_000);
    expect(env.AIR_QUALITY_TOUR_BUDGET_MS).toBe(200_000);
    // 64 MiB, not the SPEC's 256 MB: in-process decoding makes this a HEAP ceiling (plan D1).
    expect(env.AIR_QUALITY_RUN_MAX_BYTES).toBe(67_108_864);
    expect(env.AIR_QUALITY_RUN_MAX_AGE_SECONDS).toBe(172_800);
  });

  it('REQUIRES the key once the leg is enabled — a keyed provider without its key', () => {
    expect(() => validateEnv({ ...BASE, AIR_QUALITY_ENABLED: 'true' })).toThrow(/ADS_API_KEY/);
    expect(() =>
      validateEnv({ ...BASE, AIR_QUALITY_ENABLED: 'true', ADS_API_KEY: 'a-key' }),
    ).not.toThrow();
  });

  it('REQUIRES Redis in production once the leg is enabled (E1, stated for the second leg)', () => {
    expect(() =>
      validateEnv({
        ...BASE,
        NODE_ENV: 'production',
        AIR_QUALITY_ENABLED: 'true',
        ADS_API_KEY: 'a-key',
      }),
    ).toThrow(/REDIS_URL/);
    expect(() =>
      validateEnv({
        ...BASE,
        NODE_ENV: 'production',
        AIR_QUALITY_ENABLED: 'true',
        ADS_API_KEY: 'a-key',
        REDIS_URL: 'redis://cache:6379',
      }),
    ).not.toThrow();
  });

  it('refuses an empty download allowlist while the leg is on', () => {
    expect(() =>
      validateEnv({
        ...BASE,
        AIR_QUALITY_ENABLED: 'true',
        ADS_API_KEY: 'a-key',
        ADS_OBJECT_STORE_HOSTS: ' , ',
      }),
    ).toThrow(/at least one host/);
  });

  it('refuses an AIR_QUALITY_AREA whose corners are transposed or out of range', () => {
    // A transposed pair parses as four perfectly ordinary numbers and requests a DIFFERENT
    // rectangle; every province would then read a plausible-looking wrong cell.
    for (const area of [
      '35.5,25.5,42.5,45.0', // north/south swapped
      '42.5,45.0,35.5,25.5', // west/east swapped
      '42.5,25.5,35.5', // three values
      '42.5,25.5,35.5,abc', // not a number
      '95.0,25.5,35.5,45.0', // latitude out of range
    ]) {
      expect(() => validateEnv({ ...BASE, AIR_QUALITY_AREA: area })).toThrow(/AIR_QUALITY_AREA/);
    }
    expect(() => validateEnv({ ...BASE, AIR_QUALITY_AREA: '42.5,25.5,35.5,45.0' })).not.toThrow();
  });

  it('refuses a budget chain that contradicts itself', () => {
    // download <= tour slice < tour deadline < interval. Every inversion is a timer that
    // cannot finish the work it schedules.
    expect(() => validateEnv({ ...BASE, AIR_QUALITY_DOWNLOAD_TIMEOUT_MS: '300000' })).toThrow(
      /AIR_QUALITY_DOWNLOAD_TIMEOUT_MS/,
    );
    expect(() => validateEnv({ ...BASE, AIR_QUALITY_TOUR_BUDGET_MS: '300000' })).toThrow(
      /AIR_QUALITY_TOUR_BUDGET_MS/,
    );
    expect(() => validateEnv({ ...BASE, AIR_QUALITY_INGEST_DEADLINE_MS: '600000' })).toThrow(
      /AIR_QUALITY_INGEST_DEADLINE_MS/,
    );
    expect(() => validateEnv({ ...BASE, AIR_QUALITY_VALUE_TTL_SECONDS: '86400' })).toThrow(
      /AIR_QUALITY_VALUE_TTL_SECONDS/,
    );
  });
});
