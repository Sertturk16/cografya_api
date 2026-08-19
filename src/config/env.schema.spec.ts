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

  it('carries the CMEMS adapter block with its measured defaults (M4a, plan §7)', () => {
    const env = validateEnv({ ...BASE });

    expect(env.CMEMS_WMTS_BASE_URL).toBe('https://wmts.marine.copernicus.eu/teroWmts');
    expect(env.CMEMS_STAC_BASE_URL).toBe('https://stac.marine.copernicus.eu/metadata');
    // 6 s, not the shared 3 s marine default: a session's FIRST call measured 2.54 s (cold TLS).
    expect(env.CMEMS_SINGLE_CALL_TIMEOUT_MS).toBe(6_000);
    // The catalogue call is a DIFFERENT number, and that difference is the SST fix's M1: ≤4 calls
    // a tour whose failure darkens a whole basin, against 78 whose failure costs one point.
    expect(env.CMEMS_STAC_CALL_TIMEOUT_MS).toBe(25_000);
    expect(env.CMEMS_TOUR_BUDGET_MS).toBe(60_000);
    // Two attempts (the shared client's own retry) must still fit the slice at the defaults —
    // this is the arithmetic that ruled out 30 s, kept where it can fail if a default moves.
    expect(env.CMEMS_STAC_CALL_TIMEOUT_MS * 2).toBeLessThan(env.CMEMS_TOUR_BUDGET_MS);
    expect(env.CMEMS_STAC_TTL_SECONDS).toBe(21_600);
    // The two tour slices must fit the tour with room to spare AT THE DEFAULTS — a default set
    // that only just squeezes in would make every operator adjustment a boot failure.
    expect(env.ECMWF_TOUR_BUDGET_MS + env.CMEMS_TOUR_BUDGET_MS).toBeLessThan(
      env.MARINE_WARMUP_DEADLINE_MS,
    );
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

  it('refuses two tour slices that EACH fit but together overrun the tour (M4a sum check)', () => {
    // The individual-slice form of this check could not see it: 200 s and 150 s both look fine
    // against a 300 s tour, and whichever target runs second starves with every number green.
    expect(() =>
      validateEnv({
        ...BASE,
        ECMWF_TOUR_BUDGET_MS: '200000',
        CMEMS_TOUR_BUDGET_MS: '150000',
        MARINE_WARMUP_DEADLINE_MS: '300000',
      }),
    ).toThrow(/ECMWF_TOUR_BUDGET_MS \+ CMEMS_TOUR_BUDGET_MS/);
  });

  it('refuses a CMEMS single-call timeout above the request operation budget', () => {
    expect(() =>
      validateEnv({
        ...BASE,
        CMEMS_SINGLE_CALL_TIMEOUT_MS: '9000',
        MARINE_UPSTREAM_DEADLINE_MS: '6000',
      }),
    ).toThrow(/CMEMS_SINGLE_CALL_TIMEOUT_MS must not exceed MARINE_UPSTREAM_DEADLINE_MS/);
  });

  it('refuses a CMEMS single-call timeout above the CMEMS tour slice', () => {
    expect(() =>
      validateEnv({
        ...BASE,
        MARINE_UPSTREAM_DEADLINE_MS: '90000',
        CMEMS_SINGLE_CALL_TIMEOUT_MS: '70000',
        CMEMS_TOUR_BUDGET_MS: '60000',
      }),
    ).toThrow(/CMEMS_SINGLE_CALL_TIMEOUT_MS must not exceed CMEMS_TOUR_BUDGET_MS/);
  });

  it('refuses a CMEMS STAC call timeout above the CMEMS tour slice', () => {
    expect(() =>
      validateEnv({
        ...BASE,
        CMEMS_STAC_CALL_TIMEOUT_MS: '70000',
        CMEMS_TOUR_BUDGET_MS: '60000',
      }),
    ).toThrow(/CMEMS_STAC_CALL_TIMEOUT_MS must not exceed CMEMS_TOUR_BUDGET_MS/);
  });

  it('ACCEPTS a STAC call timeout above the request deadline — no request path fetches STAC', () => {
    // The negative of the rule above: the catalogue cap is deliberately NOT bound by
    // MARINE_UPSTREAM_DEADLINE_MS, and the default set (25 000 vs 6 000) already relies on it.
    const env = validateEnv({
      ...BASE,
      MARINE_UPSTREAM_DEADLINE_MS: '6000',
      CMEMS_STAC_CALL_TIMEOUT_MS: '25000',
    });
    expect(env.CMEMS_STAC_CALL_TIMEOUT_MS).toBeGreaterThan(env.MARINE_UPSTREAM_DEADLINE_MS);
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

describe('validateEnv — the book video-solution (YouTube Data API) block', () => {
  it('boots with the leg OFF and carries the SPEC §14 defaults', () => {
    const env = validateEnv({ ...BASE });

    // Both switches OFF and no key required to boot: dev, CI and the web build must all start on a
    // machine that has never heard of the YouTube Data API.
    expect(env.BOOKS_ENABLED).toBe(false);
    expect(env.BOOKS_YOUTUBE_SYNC_ENABLED).toBe(false);
    expect(env.YOUTUBE_API_KEY).toBeUndefined();
    expect(env.YOUTUBE_DATA_API_BASE_URL).toBe('https://www.googleapis.com/youtube/v3');
    expect(env.YOUTUBE_SYNC_INTERVAL_SECONDS).toBe(86_400);
    expect(env.YOUTUBE_SYNC_DEADLINE_MS).toBe(60_000);
    expect(env.YOUTUBE_SYNC_TOUR_BUDGET_MS).toBe(30_000);
    expect(env.YOUTUBE_SINGLE_CALL_TIMEOUT_MS).toBe(10_000);
    expect(env.YOUTUBE_RESPONSE_MAX_BYTES).toBe(2_097_152);
    expect(env.YOUTUBE_API_DATA_SOFT_MAX_AGE_HOURS).toBe(600);
    expect(env.YOUTUBE_API_DATA_HARD_MAX_AGE_HOURS).toBe(720);
    expect(env.BOOKS_PURGE_INTERVAL_SECONDS).toBe(3_600);
    // The defaults must satisfy their own cross-checks with room to spare — a default set that only
    // just squeezes in makes every operator adjustment a boot failure.
    expect(env.YOUTUBE_API_DATA_SOFT_MAX_AGE_HOURS).toBeLessThan(
      env.YOUTUBE_API_DATA_HARD_MAX_AGE_HOURS,
    );
  });

  it('REQUIRES the key once the sync is enabled (SPEC §13 item 13)', () => {
    expect(() => validateEnv({ ...BASE, BOOKS_YOUTUBE_SYNC_ENABLED: 'true' })).toThrow(
      /YOUTUBE_API_KEY/,
    );
    expect(() =>
      validateEnv({ ...BASE, BOOKS_YOUTUBE_SYNC_ENABLED: 'true', YOUTUBE_API_KEY: 'a-key' }),
    ).not.toThrow();
  });

  it('REFUSES a hard ceiling above 720 h — the policy is a boot check (SPEC §13 item 14)', () => {
    // Developer Policies III.E.4.d caps Non-Authorized API Data at 30 calendar days. An operator
    // must be able to LOWER the ceiling and must not be able to raise it past the policy with an
    // export line.
    expect(() => validateEnv({ ...BASE, YOUTUBE_API_DATA_HARD_MAX_AGE_HOURS: '721' })).toThrow(
      /YOUTUBE_API_DATA_HARD_MAX_AGE_HOURS/,
    );
    expect(() => validateEnv({ ...BASE, YOUTUBE_API_DATA_HARD_MAX_AGE_HOURS: '8760' })).toThrow(
      /III\.E\.4\.d/,
    );
    // Lowering it is legitimate — and lowering it means lowering BOTH, which is the interaction
    // worth pinning: a hard ceiling dropped to 168 h under the default 600 h soft threshold is
    // refused by the neighbouring rule, because the serve threshold would then sit past the
    // deletion one and no snapshot could ever be both servable and present.
    expect(() => validateEnv({ ...BASE, YOUTUBE_API_DATA_HARD_MAX_AGE_HOURS: '168' })).toThrow(
      /YOUTUBE_API_DATA_SOFT_MAX_AGE_HOURS/,
    );
    const lowered = validateEnv({
      ...BASE,
      YOUTUBE_API_DATA_SOFT_MAX_AGE_HOURS: '120',
      YOUTUBE_API_DATA_HARD_MAX_AGE_HOURS: '168',
    });
    expect(lowered.YOUTUBE_API_DATA_HARD_MAX_AGE_HOURS).toBe(168);
    // …and the default purge interval still fits underneath the lowered ceiling.
    expect(lowered.BOOKS_PURGE_INTERVAL_SECONDS * 24).toBeLessThan(
      lowered.YOUTUBE_API_DATA_HARD_MAX_AGE_HOURS * 3600,
    );
  });

  it('refuses a soft threshold at or above the hard one', () => {
    // Without this the middle state — old enough to stop serving, young enough to keep — does not
    // exist, and `youtube: null` would only ever appear after deletion.
    expect(() =>
      validateEnv({
        ...BASE,
        YOUTUBE_API_DATA_SOFT_MAX_AGE_HOURS: '720',
        YOUTUBE_API_DATA_HARD_MAX_AGE_HOURS: '720',
      }),
    ).toThrow(/YOUTUBE_API_DATA_SOFT_MAX_AGE_HOURS/);
  });

  it('refuses a budget chain that contradicts itself', () => {
    // one call <= tour slice <= tour deadline < interval between tours.
    expect(() => validateEnv({ ...BASE, YOUTUBE_SINGLE_CALL_TIMEOUT_MS: '40000' })).toThrow(
      /YOUTUBE_SINGLE_CALL_TIMEOUT_MS/,
    );
    expect(() => validateEnv({ ...BASE, YOUTUBE_SYNC_TOUR_BUDGET_MS: '90000' })).toThrow(
      /YOUTUBE_SYNC_TOUR_BUDGET_MS/,
    );
    expect(() =>
      validateEnv({
        ...BASE,
        YOUTUBE_SYNC_DEADLINE_MS: '60000',
        YOUTUBE_SYNC_INTERVAL_SECONDS: '30',
      }),
    ).toThrow(/YOUTUBE_SYNC_DEADLINE_MS/);
  });

  it('refuses a purge that runs rarely relative to the ceiling it enforces', () => {
    // Otherwise "at most 30 days" is really 30 days plus one purge interval.
    expect(() => validateEnv({ ...BASE, BOOKS_PURGE_INTERVAL_SECONDS: '200000' })).toThrow(
      /BOOKS_PURGE_INTERVAL_SECONDS/,
    );
  });

  it('REQUIRES Redis in production once the sync is enabled (E1, stated for the third leg)', () => {
    expect(() =>
      validateEnv({
        ...BASE,
        NODE_ENV: 'production',
        BOOKS_YOUTUBE_SYNC_ENABLED: 'true',
        YOUTUBE_API_KEY: 'a-key',
      }),
    ).toThrow(/REDIS_URL/);
    expect(() =>
      validateEnv({
        ...BASE,
        NODE_ENV: 'production',
        BOOKS_YOUTUBE_SYNC_ENABLED: 'true',
        YOUTUBE_API_KEY: 'a-key',
        REDIS_URL: 'redis://cache:6379',
      }),
    ).not.toThrow();
  });

  it('lets the purge half boot with the sync half off — the asymmetry SPEC §8.1 is built on', () => {
    // `BOOKS_ENABLED=true` alone is a legitimate, keyless configuration: the purge timer runs and
    // the refresh timer does not. If this ever required a key, deleting expired data would have
    // become conditional on holding a credential.
    const env = validateEnv({ ...BASE, BOOKS_ENABLED: 'true' });
    expect(env.BOOKS_ENABLED).toBe(true);
    expect(env.BOOKS_YOUTUBE_SYNC_ENABLED).toBe(false);
    expect(env.YOUTUBE_API_KEY).toBeUndefined();
  });
});

describe('validateEnv — the earthquake (AFAD TDVMS) block', () => {
  it('ships every default the ingest reads, with the leg OFF', () => {
    const env = validateEnv({ ...BASE });

    // Off by default: a fresh deployment must never poll a public institution's endpoint before
    // somebody decided it should.
    expect(env.EARTHQUAKE_ENABLED).toBe(false);
    expect(env.EARTHQUAKE_INGEST_ENABLED).toBe(true);
    // Straight at `servisnet`, because the shared client refuses redirects and the older host
    // answers with a 302.
    expect(env.AFAD_EVENT_API_BASE_URL).toBe(
      'https://servisnet.afad.gov.tr/apigateway/deprem/apiv2',
    );
    expect(env.EARTHQUAKE_INGEST_INTERVAL_SECONDS).toBe(300);
    expect(env.EARTHQUAKE_RECONCILE_INTERVAL_SECONDS).toBe(21_600);
    expect(env.EARTHQUAKE_RECENT_WINDOW_HOURS).toBe(6);
    expect(env.EARTHQUAKE_RECONCILE_WINDOW_DAYS).toBe(7);
    expect(env.EARTHQUAKE_SAFETY_LIMIT).toBe(20_000);
    // 200 km, not 150: DEC 2026-08-17k md.4 raised the buffer after a measured North Aegean
    // open-water event landed 178.7 km from the national outline.
    expect(env.EARTHQUAKE_SCOPE_BUFFER_KM).toBe(200);
    expect(env.EARTHQUAKE_RUN_RETENTION_DAYS).toBe(14);
    // The one READ-path number in this block (E3): 3 hours, i.e. 36× the polling cadence, so a
    // handful of failed tours is absorbed before the reader is told the data has aged.
    expect(env.EARTHQUAKE_STALE_MAX_SECONDS).toBe(10_800);
  });

  it('needs no credential at all — the endpoint is anonymous', () => {
    // Recorded as a property of the leg rather than an omission: if AFAD ever introduces a key,
    // ENGINEERING.md §5's server-boot-key rule applies and this expectation is what will fail.
    const env = validateEnv({ ...BASE, EARTHQUAKE_ENABLED: 'true' });
    expect(env.EARTHQUAKE_ENABLED).toBe(true);
  });

  it('refuses production with the leg on and no Redis', () => {
    expect(() =>
      validateEnv({ ...BASE, NODE_ENV: 'production', EARTHQUAKE_ENABLED: 'true' }),
    ).toThrow(/REDIS_URL/);

    expect(() =>
      validateEnv({
        ...BASE,
        NODE_ENV: 'production',
        EARTHQUAKE_ENABLED: 'true',
        REDIS_URL: 'redis://cache:6379',
      }),
    ).not.toThrow();
  });

  it('refuses a single call allowed more time than its own tour slice', () => {
    expect(() => validateEnv({ ...BASE, EARTHQUAKE_SINGLE_CALL_TIMEOUT_MS: '90000' })).toThrow(
      /EARTHQUAKE_SINGLE_CALL_TIMEOUT_MS/,
    );
  });

  it('refuses a tour slice larger than the tour that hosts it', () => {
    expect(() => validateEnv({ ...BASE, EARTHQUAKE_TOUR_BUDGET_MS: '200000' })).toThrow(
      /EARTHQUAKE_TOUR_BUDGET_MS/,
    );
  });

  it('refuses a tour that can outlive either interval it is scheduled on', () => {
    expect(() => validateEnv({ ...BASE, EARTHQUAKE_INGEST_INTERVAL_SECONDS: '60' })).toThrow(
      /EARTHQUAKE_INGEST_DEADLINE_MS/,
    );

    expect(() =>
      validateEnv({
        ...BASE,
        EARTHQUAKE_RECONCILE_INTERVAL_SECONDS: '60',
        EARTHQUAKE_RECONCILE_WINDOW_DAYS: '1',
      }),
    ).toThrow(/EARTHQUAKE_INGEST_DEADLINE_MS/);
  });

  it('refuses a staleness budget shorter than the cadence that refreshes it', () => {
    // A freshness warning that fires while the leg is perfectly healthy is one readers learn to
    // ignore before the outage it exists for, so the configuration is refused at boot instead.
    expect(() => validateEnv({ ...BASE, EARTHQUAKE_STALE_MAX_SECONDS: '60' })).toThrow(
      /EARTHQUAKE_STALE_MAX_SECONDS/,
    );

    // Equality is refused too: a budget exactly one interval long expires on the tick the next
    // tour starts.
    expect(() => validateEnv({ ...BASE, EARTHQUAKE_STALE_MAX_SECONDS: '300' })).toThrow(
      /EARTHQUAKE_STALE_MAX_SECONDS/,
    );

    expect(() => validateEnv({ ...BASE, EARTHQUAKE_STALE_MAX_SECONDS: '301' })).not.toThrow();
  });

  it('refuses a window narrower than the cadence that repeats it', () => {
    // The silent-loss check: with a window shorter than its interval, the stretch between one
    // window's end and the next one's start is queried by nobody, and events inside it are never
    // seen again — no error, no gap, no trace.
    expect(() => validateEnv({ ...BASE, EARTHQUAKE_INGEST_INTERVAL_SECONDS: '30000' })).toThrow(
      /EARTHQUAKE_INGEST_INTERVAL_SECONDS/,
    );

    // The reconcile pair needs BOTH values moved to breach: the window's minimum is one whole
    // day (86 400 s) and the default interval is 21 600 s, so no legal window alone can be
    // narrower than the cadence. Raising the interval past the window is the real shape of the
    // misconfiguration — and finding that out is why this case is written with two values
    // rather than one.
    expect(() =>
      validateEnv({
        ...BASE,
        EARTHQUAKE_RECONCILE_INTERVAL_SECONDS: '172800',
        EARTHQUAKE_RECONCILE_WINDOW_DAYS: '1',
      }),
    ).toThrow(/EARTHQUAKE_RECONCILE_INTERVAL_SECONDS/);
  });
});

/**
 * The elevation leg's four boot rules, which nothing asserted (review #124, TA124-I1).
 *
 * `env-bounds.spec.ts` counts `checkEnvBound(` call sites, so it can see that three bounds EXIST
 * and cannot see what they are wired to — a swapped subject and limit keeps the count at sixteen —
 * and it cannot see the hand-written Redis rule at all, whose message does not match the helper's
 * shape. These are the cases that read the rules from outside, as `ConfigModule` does.
 */
describe('validateEnv — the elevation (AWS terrain tiles) block', () => {
  it('ships every default the leg reads, with the leg OFF', () => {
    const env = validateEnv({ ...BASE });

    // Off by default: this switch also removes the ROUTE, so a fresh deployment answers 404 rather
    // than reaching a third-party bucket before anybody decided it should.
    expect(env.ELEVATION_ENABLED).toBe(false);
    expect(env.ELEVATION_BASE_URL).toBe('https://s3.amazonaws.com/elevation-tiles-prod');
    expect(env.ELEVATION_UPSTREAM_DEADLINE_MS).toBe(12_000);
    expect(env.ELEVATION_SINGLE_CALL_TIMEOUT_MS).toBe(5_000);
    expect(env.ELEVATION_MAX_TILES_PER_REQUEST).toBe(220);
    expect(env.ELEVATION_TILE_FETCH_CONCURRENCY).toBe(6);
    expect(env.ELEVATION_TILE_MAX_RESPONSE_BYTES).toBe(524_288);
    expect(env.ELEVATION_TILE_CACHE_MAX_TILES).toBe(256);
    expect(env.ELEVATION_PROFILE_TTL_SECONDS).toBe(86_400);
  });

  it('refuses production with the leg on and no Redis', () => {
    // Stronger here than on any other leg: this is the first endpoint that is both wall-less and
    // capable of real upstream work, and the provider budget is only shared across instances
    // through Redis — so without it the ceiling an operator configured is not the one that applies.
    expect(() =>
      validateEnv({ ...BASE, NODE_ENV: 'production', ELEVATION_ENABLED: 'true' }),
    ).toThrow(/REDIS_URL/);

    expect(() =>
      validateEnv({
        ...BASE,
        NODE_ENV: 'production',
        ELEVATION_ENABLED: 'true',
        REDIS_URL: 'redis://cache:6379',
      }),
    ).not.toThrow();

    // The other half of the pair — production alone, with every leg off — is asserted by the E1
    // describe above and is not repeated here.
  });

  it('refuses one tile fetch allowed more time than the whole request budget', () => {
    expect(() => validateEnv({ ...BASE, ELEVATION_SINGLE_CALL_TIMEOUT_MS: '20000' })).toThrow(
      /ELEVATION_SINGLE_CALL_TIMEOUT_MS/,
    );

    // Equality is legal here: a single call may consume the whole budget, it simply leaves nothing
    // for a second one.
    expect(() => validateEnv({ ...BASE, ELEVATION_SINGLE_CALL_TIMEOUT_MS: '12000' })).not.toThrow();
  });

  it('refuses a per-request tile ceiling below the fixed sample count', () => {
    // The subject is a compile-time constant an operator cannot lower, so a ceiling under it makes
    // every long line fail loudly for a reason that is not their doing.
    expect(() => validateEnv({ ...BASE, ELEVATION_MAX_TILES_PER_REQUEST: '100' })).toThrow(
      /ELEVATION_MAX_TILES_PER_REQUEST/,
    );
  });

  it('refuses a tile cache that cannot hold one request’s worth of tiles', () => {
    // The misconfiguration that looks like it works: the cache is configured, busy, and evicts the
    // running request's own tiles, so a partial profile can never warm into a complete one.
    expect(() => validateEnv({ ...BASE, ELEVATION_TILE_CACHE_MAX_TILES: '8' })).toThrow(
      /ELEVATION_TILE_CACHE_MAX_TILES/,
    );
  });
});
