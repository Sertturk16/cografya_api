import { z } from 'zod';

/**
 * Boot-time environment schema (single source of truth for `process.env`).
 *
 * Every environment variable the app reads MUST be declared here. Unknown keys
 * are stripped (only the OS env we explicitly validate is exposed via
 * ConfigService), so a var the app relies on but forgets to declare surfaces
 * immediately rather than silently reading `undefined`.
 */
/**
 * A boolean read from the environment — where everything is a string.
 *
 * Accepts EXACTLY `'true'` or `'false'`. `z.coerce.boolean()` is unusable here: it applies
 * JavaScript truthiness, so `MARINE_ENABLED=false` would parse as `true` and turn a deliberate
 * kill switch into a no-op. `'0'`, `'no'`, `'TRUE'` and a typo are all rejected at boot rather
 * than quietly interpreted, which is the same fail-fast posture as the rest of this schema.
 */
function envBoolean(
  defaultValue: 'true' | 'false',
): z.ZodPipe<
  z.ZodDefault<z.ZodEnum<{ true: 'true'; false: 'false' }>>,
  z.ZodTransform<boolean, 'true' | 'false'>
> {
  return z
    .enum(['true', 'false'])
    .default(defaultValue)
    .transform((value) => value === 'true');
}

export const envSchema = z
  .object({
    // REQUIRED — no default, deliberately. This is the variable the owner-ruled E1 gate keys on
    // (production + MARINE_ENABLED ⇒ Redis), and a gate is only as strong as its discriminator: with
    // `.default('development')`, a deployment that simply forgot to export NODE_ENV silently opted
    // ITSELF out of the rule and booted production traffic on the single-instance LRU. Nothing in
    // the repo pinned it either — `start:prod` is a bare `node dist/main.js`, there is no Dockerfile
    // and no deploy job (review #73, security i1: found by following the discriminator outward).
    // Every environment must now say which one it is; `.env.example` and jest both already do.
    NODE_ENV: z.enum(['development', 'test', 'production']),
    // Defaults to 3001, not the NestJS-conventional 3000, to avoid colliding with
    // the sibling web app's Next.js dev server (see WEB_ORIGIN below), which
    // conventionally owns 3000 — so both can run locally with defaults untouched.
    PORT: z.coerce.number().int().positive().max(65535).default(3001),
    // REQUIRED — no default. A missing (or malformed) DATABASE_URL aborts boot;
    // this is the first no-default var, so the "missing var kills boot" guarantee
    // is now literally true, not just forward-looking.
    DATABASE_URL: z.url(),
    // Browser origin of the web app, allowed by CORS. Defaults to the typical
    // local Next.js dev origin; production sets the real domain once it's decided.
    WEB_ORIGIN: z.url().default('http://localhost:3000'),
    // Shared secret that exempts a trusted first-party caller (the web SSG build) from
    // the global rate limit — presented in the `x-internal-request-token` header and
    // matched constant-time by TrustedClientThrottlerGuard. OPTIONAL and fail-closed: when
    // unset the exemption does not exist and every request is throttled, so dev/test/CI boot
    // with no secret. When set it MUST be >= 32 chars (a weak bypass secret is worse than
    // none). It is a SECRET — never log it, never echo it in the OpenAPI spec; only the
    // web build's SERVER-SIDE fetches may hold it (it must never reach the browser).
    //
    // The character class MIRRORS `cografya_web`'s `lib/env.server.ts` byte for byte, and it is a
    // WIRE-CONTRACT constraint rather than cosmetics. The two stores must hold the SAME string,
    // and this value travels as an HTTP header value: visible ASCII (0x21-0x7E) is exactly the
    // set that survives that trip unchanged. Both excluded classes fail in a way no log explains:
    //   · whitespace — Node's HTTP parser TRIMS a leading/trailing space or newline off an
    //     incoming header value, so a byte-identical secret in both stores still hashes to
    //     something different here and the caller gets permanent 429s while our boot log says
    //     "exemption: active" (the one diagnostic that would exonerate the token). An INTERNAL
    //     newline never even reaches this schema: dotenv truncates an unquoted multiline value to
    //     its first line, and that truncated half is what we would then compare against — which
    //     is why the `.env.example` minting line forbids a wrapped `openssl rand -base64 64`.
    //   · control/non-ASCII — NUL, 0x7F, `ş`, an emoji: all NON-whitespace, so a `\S`-only check
    //     admits them, yet the web side's `Headers` rejects every one of them. Accepting such a
    //     value here configures an exemption that NO valid client can ever satisfy, and the
    //     failure looks identical to a wrong token.
    // Keep this rule and the web's in lockstep — but know what enforces that. `env.schema.spec.ts`
    // pins THIS side, so a loosening here fails our CI; nothing in either repo can observe the
    // other's rule, so the PAIRING itself is convention-enforced only. Changing either side is a
    // cross-repo change: land the matching one, or the two stores can hold a value one repo boots
    // with and the other refuses.
    INTERNAL_REQUEST_TOKEN: z
      .string()
      .min(32, 'INTERNAL_REQUEST_TOKEN must be at least 32 characters when set')
      .regex(
        /^[\x21-\x7E]+$/,
        'INTERNAL_REQUEST_TOKEN must contain only visible ASCII characters (no whitespace, no ' +
          'control or non-ASCII characters) when set',
      )
      .optional(),

    // ── Cache infrastructure ────────────────────────────────────────────────────
    // Redis connection string for the upstream cache, the single-flight lock and the shared
    // provider-budget counters. OPTIONAL in development and test, where the app falls back to an
    // in-process LRU and says so loudly at boot. It is NOT optional in production with the marine
    // feature enabled — see the superRefine below (owner ruling E1 → DEC 2026-07-29b).
    // The HOST check is not pedantry: `redis://` and `rediss://` with no host pass `z.url()`, and
    // ioredis silently resolves such a URL to localhost:6379. A deployment templating
    // `REDIS_URL=redis://$REDIS_HOST:6379` with the inner variable unset therefore satisfied E1
    // on paper and pointed the cache at nothing, while the boot log printed the reassuring
    // "REDIS — shared across instances" line (review #73, security i2 — both halves executed
    // against this repo's own zod and ioredis versions).
    REDIS_URL: z
      .url()
      .refine((value) => {
        try {
          const parsed = new URL(value);
          return (
            (parsed.protocol === 'redis:' || parsed.protocol === 'rediss:') &&
            parsed.hostname !== ''
          );
        } catch {
          return false;
        }
      }, 'REDIS_URL must be a redis:// or rediss:// URL with a host')
      .optional(),

    // ── Marine feature (SPEC-ADDENDUM §6, §7.8) ─────────────────────────────────
    // Master switch for the marine UPSTREAM legs (warmup today; every provider call from M3).
    // `false` by default so a fresh deployment never reaches a provider before someone decided it
    // should — §3.4 makes "enabled only after the first warmup tour completed" an M5 acceptance
    // criterion. It does NOT gate `/api/marine/points` and `/api/marine/layers`, which are a
    // Postgres read and a constant with no upstream dependency at all.
    MARINE_ENABLED: envBoolean('false'),

    // Total upstream budget for ONE user request — retries, parallel legs, everything included
    // (§6.4). Not a per-call timeout: a per-call timeout cannot bound an operation that makes an
    // unknown number of calls, which was SPEC v1's error.
    MARINE_UPSTREAM_DEADLINE_MS: z.coerce.number().int().positive().default(6_000),
    // Ceiling on a SINGLE call, so one hung socket cannot silently consume the whole budget.
    MARINE_SINGLE_CALL_TIMEOUT_MS: z.coerce.number().int().positive().default(3_000),

    // The warmup tour (§3.4). Separate from MARINE_ENABLED so warming can be stopped without
    // taking the feature down — e.g. if a provider writes to us.
    MARINE_WARMUP_ENABLED: envBoolean('true'),
    MARINE_WARMUP_INTERVAL_SECONDS: z.coerce.number().int().positive().default(900),
    // The tour's OWN budget. It is background work, not a request; the 6 s request deadline does
    // not apply to it (§6.4). Raised 120 s → 300 s in M3b (SPEC §9.2): one ECMWF ingest step is
    // ~2.5 s measured, a 12-step tour ~30 s, and the tour must still leave room for the M4 CMEMS
    // targets behind it. Still well under the 900 s interval (cross-check below).
    MARINE_WARMUP_DEADLINE_MS: z.coerce.number().int().positive().default(300_000),

    // ── ECMWF Open Data ingest (yeni-M3 SPEC §12; measured overlay olcumler.md) ──
    // Kill switch for the ECMWF leg alone. Both MARINE_ENABLED and this must be true for the
    // ingest target to register; the read path degrades honestly either way.
    ECMWF_ENABLED: envBoolean('true'),
    ECMWF_BASE_URL: z.url().default('https://data.ecmwf.int/forecasts'),
    // AWS S3 mirror (F2's failover suggestion). OPTIONAL and absent by default: no value means
    // no failover. NOTE for the operator: the mirror serves application/octet-stream where the
    // primary serves application/json|grib — the client accepts both by design.
    ECMWF_FAILOVER_BASE_URL: z.url().optional(),
    // Forecast horizon, hours. 120 (5 days) is an OWNER ruling (O1 → DEC 2026-07-31), and the
    // ceiling here is a CONTRACT guard, not a taste: past +144 h ECMWF switches to 6-hourly
    // steps, which would make the frozen `MarineSeriesDto.stepHours = 3` a lie. The knob exists
    // so the horizon can be LOWERED (a cost lever); it cannot silently break the contract.
    ECMWF_FORECAST_HOURS: z.coerce
      .number()
      .int()
      .positive()
      .multipleOf(3, 'ECMWF_FORECAST_HOURS must be a multiple of the 3-hour step')
      .max(
        120,
        'ECMWF_FORECAST_HOURS above 120 is a frozen-contract change (stepHours stops being ' +
          'uniform past +144 h) — an owner decision, not an env flip',
      )
      .default(120),
    // A 1.8 MB Range download does not fit the 3 s marine default; measured full-range time is
    // ~0.4–2.3 s on a good day, and 20 s leaves room for a congested one.
    ECMWF_SINGLE_CALL_TIMEOUT_MS: z.coerce.number().int().positive().default(20_000),
    // The slice of ONE warmup tour ECMWF may consume, so the M4 CMEMS targets never starve.
    ECMWF_TOUR_BUDGET_MS: z.coerce.number().int().positive().default(180_000),
    // Work ceiling per tour: 12 steps ≈ 30 s measured, one 41-step cycle ≈ 4 tours ≈ 1 h.
    ECMWF_MAX_STEPS_PER_TOUR: z.coerce.number().int().positive().default(12),
    // Byte ceilings — the numeric form of "no unbounded external call" (§3.5). Breaching one
    // stops the tour LOUDLY. Measured steady state: ~38 MB / 12-step tour, ~130 MB / cycle.
    ECMWF_TOUR_MAX_BYTES: z.coerce.number().int().positive().default(67_108_864),
    ECMWF_CYCLE_MAX_BYTES: z.coerce.number().int().positive().default(335_544_320),
    // Ceiling on ONE planned byte range, enforced BEFORE the HTTP request leaves. The range
    // length comes from the provider's own `.index` (`_offset`/`_length`), and it becomes the
    // parent process's buffering cap for that download — so it must never be provider-chosen
    // without a bound (review #76 SEC-76-1). 8 MiB ≈ 4.5× the largest measured merged range
    // (~1.83 MB, olcumler §M6.1): a plan above it is contract drift and is refused loudly.
    ECMWF_MAX_RANGE_BYTES: z.coerce.number().int().positive().default(8_388_608),
    // The THIRD staleness ceiling (SPEC §9.4): maximum age of the model CYCLE a published value
    // may come from. The other two ceilings cannot see this failure — an old cycle still yields
    // a step valid "now", so validAtUtc and fetchedAtUtc both look fresh. 24 h tolerates one
    // fully missed cycle (normal in-use age is 7–15 h), never two.
    ECMWF_CYCLE_MAX_AGE_SECONDS: z.coerce.number().int().positive().default(86_400),
    // Cache-age ceiling of the ECMWF read path. Larger than the shared MARINE_STALE_MAX_SECONDS
    // because the underlying store refreshes 6-hourly by nature, not hourly.
    ECMWF_STALE_MAX_SECONDS: z.coerce.number().int().positive().default(43_200),

    // ── Cache TTLs, one per outcome kind (§6.3, §7.8) ───────────────────────────
    // The single `MARINE_CACHE_TTL_SECONDS` the v1 SPEC proposed is deliberately absent: one
    // number cannot serve a land mask (permanent), a rate-limit answer (the provider tells us
    // when) and a schema mismatch (an alarm) at the same time.
    // NOTE: there is deliberately no MARINE_POINTS_TTL_SECONDS / MARINE_LAYERS_TTL_SECONDS here.
    // Those two endpoints' cache lifetimes are HTTP `Cache-Control` values on a controller
    // DECORATOR — metadata evaluated at class definition, which an env var cannot reach. Declaring
    // them anyway gave an operator two knobs that turn with no effect and no warning; they come
    // back the day something actually reads them (review #73 MINOR).
    MARINE_VALUE_TTL_SECONDS: z.coerce.number().int().positive().default(3_600),
    MARINE_NO_DATA_TTL_SECONDS: z.coerce.number().int().positive().default(86_400),
    MARINE_ERROR_TTL_SECONDS: z.coerce.number().int().positive().default(60),
    MARINE_RATELIMIT_TTL_SECONDS: z.coerce.number().int().positive().default(300),
    MARINE_CLIENT_ERROR_TTL_SECONDS: z.coerce.number().int().positive().default(900),
    MARINE_SCHEMA_ERROR_TTL_SECONDS: z.coerce.number().int().positive().default(300),

    // ── The two independent staleness ceilings (§6.1) ───────────────────────────
    // How long we may keep serving a value we cannot refresh…
    MARINE_STALE_MAX_SECONDS: z.coerce.number().int().positive().default(21_600),
    // …and how old the MODEL MOMENT the value describes may be. A value fetched ten minutes ago
    // can still belong to an eight-hour-old model run; only the second ceiling sees that.
    MARINE_VALID_AT_MAX_AGE_SECONDS: z.coerce.number().int().positive().default(10_800),

    // ── Air quality: CAMS via the Copernicus ADS queue (SPEC §12 + plan §9) ─────
    // Master kill switch for the whole leg's UPSTREAM half. `false` by default so a fresh
    // deployment never reaches ADS before somebody decided it should — production is switched on
    // only AFTER the ingest has completed at least one run (a go-live checklist item, marine M5
    // precedent). It does NOT gate the public endpoints, which read Postgres and degrade
    // honestly to `unavailable` when the store is cold.
    AIR_QUALITY_ENABLED: envBoolean('false'),
    // The tour's second switch, so ingest can be stopped without taking the feature down.
    AIR_QUALITY_INGEST_ENABLED: envBoolean('true'),
    // The leg's OWN warmup instance: its own interval and its own per-tour deadline. Not shared
    // with marine's — a shared cadence would let one leg's bad day eat the other's budget.
    AIR_QUALITY_INGEST_INTERVAL_SECONDS: z.coerce.number().int().positive().default(600),
    AIR_QUALITY_INGEST_DEADLINE_MS: z.coerce.number().int().positive().default(300_000),
    // The SECOND daily job (the D−1 analysis archive) has its own switch. If the provider's
    // analysis product breaks, the second job must be stoppable without a deploy: fresh forecast
    // data keeps flowing, runs go straight to `complete`, and the published series simply starts
    // at the run hour instead of 24 hours earlier.
    AIR_QUALITY_ANALYSIS_ENABLED: envBoolean('true'),

    // ADS API root. The job protocol lives under `/retrieve/v1` (measured), which the URL
    // builder appends — this value is the API ROOT so a future second ADS API family does not
    // need a second variable.
    ADS_API_BASE_URL: z.url().default('https://ads.atmosphere.copernicus.eu/api'),
    // Download allowlist, comma-separated HOSTS (never paths: the bucket path changes per job).
    // Following a provider-supplied `href` off this list is SSRF class, so the list is the guard.
    ADS_OBJECT_STORE_HOSTS: z
      .string()
      .default('object-store.os-api.cci2.ecmwf.int')
      .refine(
        (value) =>
          value
            .split(',')
            .map((host) => host.trim())
            .filter((host) => host.length > 0).length > 0,
        'ADS_OBJECT_STORE_HOSTS must list at least one host',
      ),
    // The ADS credential. OPTIONAL here and REQUIRED by the cross-check below when the leg is
    // on: a keyless deployment with the leg off must still boot (dev, CI, the web build).
    // SECRET — never logged, never in an artifact, never in the OpenAPI spec.
    ADS_API_KEY: z.string().min(1).optional(),
    AIR_QUALITY_DATASET_ID: z.string().min(1).default('cams-europe-air-quality-forecasts'),
    // The requested subset, "N,W,S,E" — the exact `area` the probe measured. Parsed and
    // ORDER-CHECKED at boot: a silently transposed pair would request a different rectangle and
    // every province would map to a plausible-looking wrong cell.
    AIR_QUALITY_AREA: z
      .string()
      .default('42.5,25.5,35.5,45.0')
      .refine((value) => parseAreaOrNull(value) !== null, {
        message:
          'AIR_QUALITY_AREA must be "north,west,south,east" with four finite numbers, ' +
          'north > south, east > west, latitudes within ±90 and longitudes within ±180',
      }),
    // Forecast horizon in leadtime hours; the request asks for 0…N inclusive (97 steps at 96).
    AIR_QUALITY_FORECAST_HOURS: z.coerce.number().int().positive().max(120).default(96),
    // Earliest UTC hour a run may be submitted. All CAMS products close by 12:00 UTC (measured
    // accessible at 14:07), so 12 keeps every submit on the safe side of the provider's SLA.
    AIR_QUALITY_SUBMIT_AFTER_UTC_HOUR: z.coerce.number().int().min(0).max(23).default(12),
    // Attempts per JOB, not per run (plan SAPMA 6): with two jobs a shared counter would let a
    // failing analysis eat the forecast's budget and keep the page on yesterday's data.
    AIR_QUALITY_MAX_ATTEMPTS_PER_JOB: z.coerce.number().int().positive().default(6),
    AIR_QUALITY_POLL_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
    // A 25 MiB download took 12.6 s measured; 180 s covers a congested provider.
    AIR_QUALITY_DOWNLOAD_TIMEOUT_MS: z.coerce.number().int().positive().default(180_000),
    // The slice of one tour this leg may consume.
    AIR_QUALITY_TOUR_BUDGET_MS: z.coerce.number().int().positive().default(200_000),
    // Byte ceiling for ONE downloaded archive. 64 MiB, not the SPEC's 256 MB, because decoding
    // happens IN PROCESS: this is a HEAP ceiling, not a cost ceiling (plan §10-D1, RULED). The
    // measured production archive is 25.26 MiB, so 64 MiB is 2.5× reality and still inside a
    // small VPS even at the ~2× transient peak the byte reader needs. The asymmetry decides it:
    // a tight ceiling fails LOUDLY before any HTTP leaves (the declared `file:size` is checked
    // first), a generous one fails as a silent OOM of the whole API process.
    AIR_QUALITY_RUN_MAX_BYTES: z.coerce.number().int().positive().default(67_108_864),
    // The THIRD staleness ceiling (read path, A2b): maximum age of the model RUN a published
    // value may come from. The other two ceilings cannot see it — an old run still yields a step
    // valid "now". 48 h tolerates one fully missed run, never two.
    AIR_QUALITY_RUN_MAX_AGE_SECONDS: z.coerce.number().int().positive().default(172_800),
    AIR_QUALITY_STALE_MAX_SECONDS: z.coerce.number().int().positive().default(43_200),
    AIR_QUALITY_VALID_AT_MAX_AGE_SECONDS: z.coerce.number().int().positive().default(5_400),
    // Cache TTLs, one per outcome kind — the same table shape as marine's.
    AIR_QUALITY_VALUE_TTL_SECONDS: z.coerce.number().int().positive().default(3_600),
    AIR_QUALITY_NO_DATA_TTL_SECONDS: z.coerce.number().int().positive().default(86_400),
    AIR_QUALITY_ERROR_TTL_SECONDS: z.coerce.number().int().positive().default(60),
    AIR_QUALITY_RATELIMIT_TTL_SECONDS: z.coerce.number().int().positive().default(300),
    AIR_QUALITY_CLIENT_ERROR_TTL_SECONDS: z.coerce.number().int().positive().default(900),
    AIR_QUALITY_SCHEMA_ERROR_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  })
  .superRefine((env, ctx) => {
    // ── E1 (owner ruling, DEC 2026-07-29b): production + marine enabled ⇒ Redis is REQUIRED ──
    // Without Redis every deploy starts from an empty cache (the first request would trigger the
    // full cold call graph), N instances mean N× the upstream load, and single-flight cannot
    // coordinate across them (§2.6). Silently degrading to the in-process LRU in production is
    // forbidden, so this is a BOOT failure rather than a warning: a warning in a container log is
    // exactly the kind of notice nobody reads until the provider has already blocked us.
    if (env.NODE_ENV === 'production' && env.MARINE_ENABLED && env.REDIS_URL === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['REDIS_URL'],
        message:
          'REDIS_URL is REQUIRED when NODE_ENV=production and MARINE_ENABLED=true (owner ruling ' +
          'E1 / DEC 2026-07-29b). The in-process LRU fallback is a development-only mode: it is ' +
          'single-instance, it is emptied by every deploy, and single-flight does not work across ' +
          'instances. Provision Redis, or start with MARINE_ENABLED=false.',
      });
    }

    // A single-call cap above the total operation budget is a configuration that cannot mean what
    // it says — the operation would end before the call it is waiting for could time out.
    if (env.MARINE_SINGLE_CALL_TIMEOUT_MS > env.MARINE_UPSTREAM_DEADLINE_MS) {
      ctx.addIssue({
        code: 'custom',
        path: ['MARINE_SINGLE_CALL_TIMEOUT_MS'],
        message:
          'MARINE_SINGLE_CALL_TIMEOUT_MS must not exceed MARINE_UPSTREAM_DEADLINE_MS — a single ' +
          'call cannot be allowed more time than the whole operation.',
      });
    }

    // A value TTL above the staleness ceiling would make a value droppable while still labelled
    // `fresh`: the two rules would contradict each other on the same number.
    if (env.MARINE_VALUE_TTL_SECONDS > env.MARINE_STALE_MAX_SECONDS) {
      ctx.addIssue({
        code: 'custom',
        path: ['MARINE_VALUE_TTL_SECONDS'],
        message:
          'MARINE_VALUE_TTL_SECONDS must not exceed MARINE_STALE_MAX_SECONDS — otherwise a value ' +
          'can breach the staleness ceiling while still being labelled fresh.',
      });
    }

    // A tour that may run longer than the interval between tours would overlap itself. The lock
    // prevents the damage, but the schedule would then be a lie; refuse the configuration instead.
    if (env.MARINE_WARMUP_DEADLINE_MS >= env.MARINE_WARMUP_INTERVAL_SECONDS * 1000) {
      ctx.addIssue({
        code: 'custom',
        path: ['MARINE_WARMUP_DEADLINE_MS'],
        message:
          'MARINE_WARMUP_DEADLINE_MS must be shorter than MARINE_WARMUP_INTERVAL_SECONDS — a tour ' +
          'that can outlive its own interval overlaps the next one.',
      });
    }

    // ── ECMWF cross-checks (SPEC §12) — a config that contradicts itself does not boot ──
    if (env.ECMWF_SINGLE_CALL_TIMEOUT_MS > env.ECMWF_TOUR_BUDGET_MS) {
      ctx.addIssue({
        code: 'custom',
        path: ['ECMWF_SINGLE_CALL_TIMEOUT_MS'],
        message:
          'ECMWF_SINGLE_CALL_TIMEOUT_MS must not exceed ECMWF_TOUR_BUDGET_MS — a single download ' +
          'cannot be allowed more time than the whole tour slice it runs in.',
      });
    }
    if (env.ECMWF_TOUR_BUDGET_MS >= env.MARINE_WARMUP_DEADLINE_MS) {
      ctx.addIssue({
        code: 'custom',
        path: ['ECMWF_TOUR_BUDGET_MS'],
        message:
          'ECMWF_TOUR_BUDGET_MS must be smaller than MARINE_WARMUP_DEADLINE_MS — the ECMWF slice ' +
          'must leave room in the tour for the other marine targets (M4 CMEMS).',
      });
    }
    if (env.ECMWF_TOUR_MAX_BYTES > env.ECMWF_CYCLE_MAX_BYTES) {
      ctx.addIssue({
        code: 'custom',
        path: ['ECMWF_TOUR_MAX_BYTES'],
        message:
          'ECMWF_TOUR_MAX_BYTES must not exceed ECMWF_CYCLE_MAX_BYTES — one tour cannot be ' +
          'allowed more bytes than the whole cycle it contributes to.',
      });
    }
    if (env.ECMWF_MAX_RANGE_BYTES > env.ECMWF_TOUR_MAX_BYTES) {
      ctx.addIssue({
        code: 'custom',
        path: ['ECMWF_MAX_RANGE_BYTES'],
        message:
          'ECMWF_MAX_RANGE_BYTES must not exceed ECMWF_TOUR_MAX_BYTES — a single planned range ' +
          'cannot be allowed more bytes than the whole tour it downloads in.',
      });
    }

    // ── Air-quality cross-checks (plan §9) — a config that contradicts itself does not boot ──
    // 1. The leg cannot reach a keyed provider without its key. A missing key would otherwise
    //    surface as a 401 on every tour, hours after the deploy that caused it.
    if (env.AIR_QUALITY_ENABLED && env.ADS_API_KEY === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['ADS_API_KEY'],
        message:
          'ADS_API_KEY is REQUIRED when AIR_QUALITY_ENABLED=true — the ADS job protocol is ' +
          'authenticated on every call. Provide it, or start with AIR_QUALITY_ENABLED=false.',
      });
    }
    // 2. An empty allowlist would not mean "allow everything" here (the guard fails closed), but
    //    it WOULD mean the leg can never download anything, silently, forever.
    if (env.AIR_QUALITY_ENABLED && parseHostList(env.ADS_OBJECT_STORE_HOSTS).length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['ADS_OBJECT_STORE_HOSTS'],
        message:
          'ADS_OBJECT_STORE_HOSTS must list at least one host when AIR_QUALITY_ENABLED=true — ' +
          'with an empty allowlist every result download is refused as off-list.',
      });
    }
    // 3. E1 stated for the second leg: production + a scheduled upstream leg ⇒ Redis. Without it
    //    the cross-instance warmup lock does not exist and N instances each run their own tour
    //    against the provider.
    if (env.NODE_ENV === 'production' && env.AIR_QUALITY_ENABLED && env.REDIS_URL === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['REDIS_URL'],
        message:
          'REDIS_URL is REQUIRED when NODE_ENV=production and AIR_QUALITY_ENABLED=true (the same ' +
          'owner ruling E1 / DEC 2026-07-29b that binds the marine leg): without Redis the ' +
          'cross-instance warmup lock does not exist, so every instance would run its own ADS ' +
          'tour. Provision Redis, or start with AIR_QUALITY_ENABLED=false.',
      });
    }
    // 4–6. The budget chain: one download ≤ the leg's tour slice < the tour deadline < the
    //      interval between tours. Any inversion makes a timer that cannot finish its own work.
    if (env.AIR_QUALITY_DOWNLOAD_TIMEOUT_MS > env.AIR_QUALITY_TOUR_BUDGET_MS) {
      ctx.addIssue({
        code: 'custom',
        path: ['AIR_QUALITY_DOWNLOAD_TIMEOUT_MS'],
        message:
          'AIR_QUALITY_DOWNLOAD_TIMEOUT_MS must not exceed AIR_QUALITY_TOUR_BUDGET_MS — a single ' +
          'download cannot be allowed more time than the whole tour slice it runs in.',
      });
    }
    if (env.AIR_QUALITY_TOUR_BUDGET_MS >= env.AIR_QUALITY_INGEST_DEADLINE_MS) {
      ctx.addIssue({
        code: 'custom',
        path: ['AIR_QUALITY_TOUR_BUDGET_MS'],
        message:
          'AIR_QUALITY_TOUR_BUDGET_MS must be smaller than AIR_QUALITY_INGEST_DEADLINE_MS — the ' +
          'leg must leave room in its own tour for the tour bookkeeping around it.',
      });
    }
    if (env.AIR_QUALITY_INGEST_DEADLINE_MS >= env.AIR_QUALITY_INGEST_INTERVAL_SECONDS * 1000) {
      ctx.addIssue({
        code: 'custom',
        path: ['AIR_QUALITY_INGEST_DEADLINE_MS'],
        message:
          'AIR_QUALITY_INGEST_DEADLINE_MS must be shorter than ' +
          'AIR_QUALITY_INGEST_INTERVAL_SECONDS — a tour that can outlive its own interval ' +
          'overlaps the next one.',
      });
    }
    // 7. A value TTL above the staleness ceiling would let a value be droppable while still
    //    labelled fresh — the two rules would contradict each other on the same number.
    if (env.AIR_QUALITY_VALUE_TTL_SECONDS > env.AIR_QUALITY_STALE_MAX_SECONDS) {
      ctx.addIssue({
        code: 'custom',
        path: ['AIR_QUALITY_VALUE_TTL_SECONDS'],
        message:
          'AIR_QUALITY_VALUE_TTL_SECONDS must not exceed AIR_QUALITY_STALE_MAX_SECONDS — ' +
          'otherwise a value can breach the staleness ceiling while still being labelled fresh.',
      });
    }
  });

/** `"a, b"` → `['a', 'b']`; blanks dropped. The one place the allowlist string is split. */
export function parseHostList(raw: string): string[] {
  return raw
    .split(',')
    .map((host) => host.trim())
    .filter((host) => host.length > 0);
}

/**
 * `"north,west,south,east"` → the four numbers, or `null` when the string is not a usable
 * rectangle.
 *
 * The ORDER checks are the point. A transposed pair still parses as four numbers and still
 * produces a perfectly ordinary request — for a different rectangle, from which every province
 * would read a plausible-looking wrong cell. That is unrecoverable at read time, so it is
 * refused at boot.
 */
export function parseAreaOrNull(raw: string): [number, number, number, number] | null {
  const parts = raw.split(',').map((part) => Number(part.trim()));
  if (parts.length !== 4 || parts.some((value) => !Number.isFinite(value))) return null;
  const [north, west, south, east] = parts as [number, number, number, number];
  if (Math.abs(north) > 90 || Math.abs(south) > 90) return null;
  if (Math.abs(west) > 180 || Math.abs(east) > 180) return null;
  if (north <= south || east <= west) return null;
  return [north, west, south, east];
}

export type Env = z.infer<typeof envSchema>;

/**
 * Wired into `ConfigModule.forRoot({ validate })`. A missing or mistyped
 * required variable throws here, which aborts NestJS bootstrap — the app never
 * starts with an invalid configuration (fail-fast).
 */
export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => {
        const path = issue.path.join('.') || '(root)';
        return `  - ${path}: ${issue.message}`;
      })
      .join('\n');

    throw new Error(`Invalid environment configuration:\n${details}`);
  }

  return result.data;
}
