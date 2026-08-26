import { z } from 'zod';
import { checkEnvBound } from './env-bounds';
// A dependency-free constants module (no imports of its own), pulled in so the boot check below
// compares against the REAL sample count rather than a second copy of the number. The alternative
// — a literal here plus a test asserting the two agree — is the drift class this repo names in
// three other files, and it would be a strange thing to introduce in the file whose whole job is
// to refuse configurations that cannot mean what they say.
import { ELEVATION_PROFILE_SAMPLE_COUNT } from '../elevation/elevation.types';

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

    // ── SEC84-P1: the peer-axis proxy trust bound ───────────────────────────────
    // How many hops of `X-Forwarded-For` Express's `trust proxy` trusts, applied by the shared
    // `applyProxyTrust(app, hops)` (`src/common/bootstrap.ts`). ONLY 0 or 1 — never `true`, never
    // an unbounded count: `max(1)` is the whole point, because a bounded single hop is sound
    // ONLY under the precondition `DEC 2026-08-26o` states and this schema cannot verify — the
    // api must not be reachable except through the single trusted L7 terminator. If that ingress
    // restriction is ever lifted, this must go back to `0` in the SAME change; a directly
    // reachable api with one trusted hop hands every caller a self-declared identity. `0` (the
    // default) reproduces today's behaviour EXACTLY: `req.ip` is the raw socket peer and no
    // request header can influence it — so a deployment that forgets the terminator degrades to
    // one shared bucket rather than to a forgeable one. This is a BOUNDED NUMERIC KNOB, not a
    // credential: it carries no entropy and belongs in `.env.example` with a real value.
    TRUSTED_PROXY_HOPS: z.coerce
      .number()
      .int()
      .min(0)
      .max(
        1,
        'TRUSTED_PROXY_HOPS above 1 is not a configuration choice — the count is trusted only ' +
          'because exactly one known terminator fronts the api (DEC 2026-08-26o), so a larger ' +
          'number is a claim about a network topology nobody has measured, not a tuning knob',
      )
      .default(0),

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

    // ── SEC84-P1: the forwarded-axis identity secret ────────────────────────────
    // Authenticates a caller (the web BFF) as a trusted forwarder of `x-visitor-address`
    // (`src/common/throttler/visitor-tracker.ts`). OPTIONAL and fail-closed, exactly like
    // `INTERNAL_REQUEST_TOKEN` above: unset means the forwarding mechanism does not exist and
    // every caller is tracked on the peer axis, which is today's behaviour.
    //
    // Deliberately a SEPARATE variable from `INTERNAL_REQUEST_TOKEN`, not a reuse — the SEC84-P1
    // plan's §B records the full reasoning; the one sentence worth repeating at the field itself:
    // `INTERNAL_REQUEST_TOKEN`'s leak buys a throttle-bypass on public GET/HEAD reads, while this
    // one's leak buys the ability to NAME THE VISITOR on every route including auth POSTs — a
    // strictly wider blast radius, so merging the two would let the narrower secret's leak buy the
    // wider grant. Same shape as `INTERNAL_REQUEST_TOKEN` for the same wire-contract reason (this
    // value also rides an HTTP header, `x-visitor-forward-token`, and the web repo's
    // `lib/env.server.ts` must mirror this rule byte for byte). It is a SECRET like the others —
    // never logged, never in the OpenAPI spec, held only by the web build's SERVER-SIDE runtime
    // (never the browser) — but it is READ, unlike `TRUSTED_PROXY_HOPS` above, which is why it
    // lives in this block and not that one.
    VISITOR_FORWARD_TOKEN: z
      .string()
      .min(32, 'VISITOR_FORWARD_TOKEN must be at least 32 characters when set')
      .regex(
        /^[\x21-\x7E]+$/,
        'VISITOR_FORWARD_TOKEN must contain only visible ASCII characters (no whitespace, no ' +
          'control or non-ASCII characters) when set',
      )
      .optional(),

    // ── SEC84-P1: the `/docs` gate (production only) ────────────────────────────
    // Gates `/docs`, `/docs-json` and `/docs-yaml` behind HTTP Basic auth in production
    // (`src/openapi/docs-gate.ts`), closing the `TODO(first-deploy)` `src/main.ts` used to carry.
    // OPTIONAL: unset in production means the surface is NOT MOUNTED AT ALL (fail-closed), not
    // silently open. Outside production this variable is not consulted — `/docs` stays open there
    // exactly as it is today, so the web repo keeps codegenning against a dev instance. Same
    // shape as the other secrets in this file, though its blast radius is narrower: it gates a
    // READ-ONLY surface (the published API spec), nothing else.
    DOCS_ACCESS_TOKEN: z
      .string()
      .min(32, 'DOCS_ACCESS_TOKEN must be at least 32 characters when set')
      .regex(
        /^[\x21-\x7E]+$/,
        'DOCS_ACCESS_TOKEN must contain only visible ASCII characters (no whitespace, no ' +
          'control or non-ASCII characters) when set',
      )
      .optional(),

    // ── Auth signing secrets (üyelik UYELIK-02, plan §11, D6) ───────────────────
    // The access JWT's HS256 signing/verification key. OPTIONAL in development/test — see the
    // superRefine below, and `AuthSecretsProvider`, which mints a process-lifetime ephemeral
    // key when this is unset and says so loudly at boot (never logging the value). REQUIRED in
    // production: the `REDIS_URL` E1 shape, applied to a new domain. Character class MIRRORS
    // `INTERNAL_REQUEST_TOKEN` above for the same reason — this value is a signing secret, not
    // a wire header, but the same failure classes (an edge whitespace character silently
    // trimmed somewhere downstream, a control/non-ASCII byte) are worth refusing the same way.
    JWT_SECRET: z
      .string()
      .min(32, 'JWT_SECRET must be at least 32 characters when set')
      .regex(
        /^[\x21-\x7E]+$/,
        'JWT_SECRET must contain only visible ASCII characters (no whitespace, no control or ' +
          'non-ASCII characters) when set',
      )
      .optional(),
    // Pepper for the email-verification-code and rate-limit-subject HMAC digests (§5.3, §9.2).
    // ONE secret shared across both purposes — a domain tag prefix at the call site (`"verify:"`,
    // `"rate:"`) keeps the two digests from ever colliding on the same plaintext (S8). Same shape
    // and same OPTIONAL/production-required rule as `JWT_SECRET` above.
    AUTH_HMAC_PEPPER: z
      .string()
      .min(32, 'AUTH_HMAC_PEPPER must be at least 32 characters when set')
      .regex(
        /^[\x21-\x7E]+$/,
        'AUTH_HMAC_PEPPER must contain only visible ASCII characters (no whitespace, no control ' +
          'or non-ASCII characters) when set',
      )
      .optional(),
    // The mail transport selector (§8, §11). `'noop'` is the only valid value this turn —
    // `NoopMailerAdapter` sends nothing anywhere. A real provider adds a new enum member here
    // plus its own `optional()` + feature-gated cross-check (the `ADS_API_KEY` precedent), never
    // a silent default swap.
    MAIL_TRANSPORT: z.enum(['noop']).default('noop'),

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

    // ── CMEMS / Copernicus Marine adapter (marine M4; plan §7) ──────────────────
    // NONE of these is a secret: both endpoints are anonymous (no key, no account, no token —
    // verified live 2026-08-02), so base URLs and budget numbers are safe in the OpenAPI-visible
    // config surface (SPEC v1 §5.6 precedent). The base URLs exist so e2e can point the adapter
    // at a fake server (the ECMWF_BASE_URL precedent).
    CMEMS_WMTS_BASE_URL: z.url().default('https://wmts.marine.copernicus.eu/teroWmts'),
    CMEMS_STAC_BASE_URL: z.url().default('https://stac.marine.copernicus.eu/metadata'),
    // A session's FIRST call measured 2.54 s (cold TLS); the shared 3 s marine single-call
    // default would manufacture false timeouts there. Warm calls are 0.19–0.43 s.
    // This is the VALUE path's cap (GetFeatureInfo) and it is what the request path spends;
    // the catalogue call has its own, longer one below.
    CMEMS_SINGLE_CALL_TIMEOUT_MS: z.coerce.number().int().positive().default(6_000),
    // The STAC CATALOGUE call's own cap — deliberately NOT the value cap above.
    //
    // ## Why the two are different numbers (measured 2026-08-17, `Owner's Inbox/sst-teshis/`)
    // The resolution phase is at most FOUR cheap calls per tour and a single failure darkens
    // every point the product serves (measured: one BLKSEA document timing out published
    // `unavailable` on 21 of 30 points for 14 min 45 s, because Marmara SST rides the same
    // product). A value call is one of 78 and its failure costs ONE point. Sharing one 6 s cap
    // was a default, not a decision: the catalogue's queue latency exceeded 6 s in 7 of 20
    // samples (BLKSEA max 19.45 s, MEDSEA max 27.20 s).
    //
    // ## Why 25 s, and why not more
    // 25 s covers the BLKSEA measured maximum with 5.5 s to spare and — stated only as far as
    // the samples support — **at least 19 of the 20 measured draws**; the single 27.20 s draw is
    // the one known to exceed it, and the published table (min/median/max plus a ">6 s" count)
    // cannot resolve the individual draws between 6 s and 19.45 s, so a stronger claim than
    // "≥19/20" is not derivable from it. Covering 20/20 would need ≥27.3 s, and what rules that
    // out is arithmetic rather than taste: the shared client already makes two attempts (250 ms
    // apart), so a 27.3 s cap wants 54.85 s while the resolution phase's own sub-budget is two
    // thirds of `CMEMS_TOUR_BUDGET_MS` — 40 000 ms at the defaults (`cmems-warmup.target.ts`,
    // `cmemsResolutionBudgetMs`). At 25 s the first attempt gets its full cap and the retry still
    // gets ~14.75 s, comfortably above both measured medians (3.52 s / 4.65 s); past ~27 s the
    // retry is squeezed under 13 s for no measured gain.
    //
    // What this cap can NO LONGER do, since review #117 (SFH117-I1): consume the whole tour slice
    // and starve the 78-key value sweep. The phase runs on the sub-budget above, so an
    // over-generous cap costs the LATER PRODUCTS of the resolution phase, never the sweep. That is
    // why the boot bound below still measures ONE attempt rather than the pair.
    //
    // NOT cross-checked against `MARINE_UPSTREAM_DEADLINE_MS` on purpose: no request path ever
    // fetches STAC (`cmems-value.reader.ts` answers `transient` instead of fetching the
    // catalogue inline), so the request budget is not this call's ceiling — and writing that
    // check would forbid exactly the configuration this knob exists to allow.
    CMEMS_STAC_CALL_TIMEOUT_MS: z.coerce.number().int().positive().default(25_000),
    // The slice of ONE warmup tour CMEMS may consume (the M4b target's budget; the ECMWF slice
    // has its own above): a full 78-call sweep at concurrency 4 is ~8 s warm, 20–40 s cold —
    // 60 s leaves ~2× headroom while keeping the ECMWF targets fed (cross-check below).
    CMEMS_TOUR_BUDGET_MS: z.coerce.number().int().positive().default(60_000),
    // How long a STAC dataset-id resolution is trusted. The catalogue's own change stamp
    // (`admp_updated`) moves on a daily cadence; a retirement INSIDE the TTL heals through the
    // 400-triggered forced re-resolution (once per tour), so 6 h costs nothing in staleness.
    CMEMS_STAC_TTL_SECONDS: z.coerce.number().int().positive().default(21_600),

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

    // ── Earthquakes: AFAD TDVMS ingest (deprem SPEC §14) ───────────────────────
    // Master kill switch for the leg's UPSTREAM half. `false` by default so a fresh deployment
    // never polls AFAD before somebody decided it should. E2 ships the ingest only; when E3's
    // public endpoints land they stay registered either way and degrade honestly from Postgres.
    EARTHQUAKE_ENABLED: envBoolean('false'),
    // The tours' second switch, so ingest can be stopped without taking the feature down.
    EARTHQUAKE_INGEST_ENABLED: envBoolean('true'),
    // API ROOT. It points at `servisnet` DIRECTLY and that is the whole handling of the measured
    // 302: `deprem.afad.gov.tr/apiv2/...` redirects here, and the shared client refuses redirects
    // outright (`redirect: 'error'`), so aiming at the redirecting host would turn every tour into
    // a transient failure. If AFAD ever moves again, the fix is this value — never the policy.
    AFAD_EVENT_API_BASE_URL: z
      .url()
      .default('https://servisnet.afad.gov.tr/apigateway/deprem/apiv2'),
    // D-G: 300 s. AFAD documents no rate limit, so the cadence is a courtesy decision rather than
    // a technical one — 2.5× the alternative's frequency buys ≤3 min freshness.
    EARTHQUAKE_INGEST_INTERVAL_SECONDS: z.coerce.number().int().positive().default(300),
    // ONE deadline for both tours; the cross-checks below compare it against BOTH intervals.
    EARTHQUAKE_INGEST_DEADLINE_MS: z.coerce.number().int().positive().default(120_000),
    // The frequent tour's window. Wider than the interval on purpose (cross-check 3): overlapping
    // windows are what make a missed tour self-healing rather than a permanent hole.
    EARTHQUAKE_RECENT_WINDOW_HOURS: z.coerce.number().int().positive().default(6),
    // The reconcile cadence and its window. 7 days covers Elbistan M7.6's three-day revision
    // (measured); a revision later than that is an accepted residual risk, stated in the SPEC.
    EARTHQUAKE_RECONCILE_INTERVAL_SECONDS: z.coerce.number().int().positive().default(21_600),
    EARTHQUAKE_RECONCILE_WINDOW_DAYS: z.coerce.number().int().positive().default(7),
    // `end` is asked for slightly in the future: if our clock trails AFAD's, `end = now` misses the
    // newest event for a whole cycle. A future `end` is accepted (measured).
    EARTHQUAKE_CLOCK_SKEW_SECONDS: z.coerce.number().int().nonnegative().default(300),
    // The slowest measured call was 0.43 s; 15 s is ~35× that.
    EARTHQUAKE_SINGLE_CALL_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),
    EARTHQUAKE_TOUR_BUDGET_MS: z.coerce.number().int().positive().default(60_000),
    // Byte ceiling for ONE response, applied to the DECOMPRESSED body (Node's fetch requests gzip
    // itself and inflates before we count). The measured 7-day window is 203 KB inflated, so 4 MiB
    // is ~20× reality. Deliberately tighter than the SPEC's proposed 16 MiB: the body is parsed as
    // JSON in this process, so this is a HEAP ceiling, and the air-quality precedent decides the
    // direction — a tight ceiling fails loudly and early, a generous one fails as an OOM of the
    // whole API.
    EARTHQUAKE_RESPONSE_MAX_BYTES: z.coerce.number().int().positive().default(4_194_304),
    // The overflow ALARM, never a "give me the last N" selector: AFAD applies `limit` BEFORE
    // `orderby` (measured), so a small limit returns the OLDEST rows of the window. A response that
    // reaches this number is treated as a possibly truncated window and refused.
    EARTHQUAKE_SAFETY_LIMIT: z.coerce.number().int().positive().default(20_000),
    // D-B, revised from 150 km to 200 km by DEC 2026-08-17k md.4 on this leg's own measurement: a
    // recorded North Aegean open-water event sits 178.7 km from the national outline, i.e. exactly
    // the case QUESTIONS.md D-1 warned would be dropped.
    EARTHQUAKE_SCOPE_BUFFER_KM: z.coerce.number().int().positive().default(200),
    // Retention for the ingest-run ledger (`FU-EQ-RUNS-PRUNE`). At the 300 s cadence the table
    // takes ~107 000 rows a year; 14 days keeps ~4 000 while leaving a fortnight of history to
    // diagnose from. The newest SUCCESSFUL run is never pruned, whatever its age — it is the
    // freshness anchor, and deleting it would turn "the data is stale" into "there is no data".
    EARTHQUAKE_RUN_RETENTION_DAYS: z.coerce.number().int().positive().default(14),
    // READ-PATH freshness budget (E3): how old the newest SUCCESSFUL tour may be before the public
    // endpoints publish `dataStatus: 'stale'`. The data keeps being served either way — hiding
    // stale data is the twin of the early-warning implication this leg is forbidden to make, since
    // a reader takes an old quiet list for a quiet present. 3 hours is 36× the 300 s cadence, so a
    // handful of consecutive failed tours is absorbed before the reader is told anything.
    EARTHQUAKE_STALE_MAX_SECONDS: z.coerce.number().int().positive().default(10_800),

    // ── Book video solutions: the YouTube Data API v3 sync leg (SPEC §8, §14) ───
    // Master switch for the book leg's INGEST half — and ONLY that half. The two public endpoints
    // stay registered and answer from Postgres either way: an empty catalogue is a SEED state, not
    // an ingest health state (`DEC 2026-08-15h` item 1, the air-quality Q5 / `QUESTIONS.md` H-7
    // precedent). `false` by default so a fresh deployment reaches no provider until somebody
    // decides it should.
    BOOKS_ENABLED: envBoolean('false'),
    // The refresh tour's own switch, on top of the master one. Turning it off stops the provider
    // calls and deliberately does NOT stop the purge, which runs on `BOOKS_ENABLED` alone: deleting
    // expired API Data is an obligation (Developer Policies III.E.4.d), and an obligation may not
    // hang off a feature's switch.
    BOOKS_YOUTUBE_SYNC_ENABLED: envBoolean('false'),
    // The YouTube Data API credential. OPTIONAL here and REQUIRED by the cross-check below once the
    // sync is on: a keyless deployment with the sync off must still boot (dev, CI, the web build).
    // SECRET — never logged, never in an artifact, never in the OpenAPI spec. It travels in the
    // `X-goog-api-key` REQUEST HEADER, so it never enters a URL, a query string or an `Error.cause`
    // chain (the header form was verified live against Data API v3, SPEC §8.4).
    YOUTUBE_API_KEY: z.string().min(1).optional(),
    // API root; `/videos` is appended by the URL builder. Declared so an e2e can point the leg at a
    // fake server (the `ECMWF_BASE_URL` precedent).
    YOUTUBE_DATA_API_BASE_URL: z.url().default('https://www.googleapis.com/youtube/v3'),
    // Once a day. The whole catalogue fits one 50-id call, so a tour costs ONE quota unit against a
    // daily allocation of 10 000 — and a daily cadence is also what discharges "verify at least
    // every 30 days that the video has not been deleted".
    YOUTUBE_SYNC_INTERVAL_SECONDS: z.coerce.number().int().positive().default(86_400),
    // The tour's own budget (background work, so the request path's deadline does not apply), the
    // slice of it the provider calls may consume, and the cap on any single call. The chain is
    // checked at boot below.
    YOUTUBE_SYNC_DEADLINE_MS: z.coerce.number().int().positive().default(60_000),
    YOUTUBE_SYNC_TOUR_BUDGET_MS: z.coerce.number().int().positive().default(30_000),
    YOUTUBE_SINGLE_CALL_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
    // Byte ceiling for ONE response — the numeric form of "no unbounded external call" (§3.5). A
    // 50-video `snippet,contentDetails,status` body is tens of kilobytes; 2 MiB is orders of
    // magnitude of headroom and still a bound.
    YOUTUBE_RESPONSE_MAX_BYTES: z.coerce.number().int().positive().default(2_097_152),
    // The SOFT ageing threshold (SPEC §8.3): past this age a snapshot stops being SERVED and the
    // contract publishes `youtube: null`, so the page falls back to a typographic facade and emits
    // no `VideoObject`. 600 h ≈ 25 days, deliberately below the deletion ceiling: a few failed tours
    // must not put us straight against the policy wall.
    YOUTUBE_API_DATA_SOFT_MAX_AGE_HOURS: z.coerce.number().int().positive().default(600),
    // The HARD threshold: past this age the row is DELETED. 720 h = 30 calendar days, which is the
    // ceiling Developer Policies III.E.4.d sets for Non-Authorized API Data — so `.max(720)` is not
    // a taste, it is the policy enforced as a boot check rather than as a comment. The knob exists
    // so the ceiling can be LOWERED; it cannot be raised past the policy.
    YOUTUBE_API_DATA_HARD_MAX_AGE_HOURS: z.coerce
      .number()
      .int()
      .positive()
      .max(
        720,
        'YOUTUBE_API_DATA_HARD_MAX_AGE_HOURS above 720 h would breach the 30-calendar-day ceiling ' +
          'YouTube Developer Policies III.E.4.d places on Non-Authorized API Data — the ceiling is ' +
          'a boot check, not an env flip',
      )
      .default(720),
    // How often the purge tour runs. Its own variable rather than a share of the sync interval,
    // because the two timers are independent by design (SPEC §8.1) and this one must stay far below
    // the hard ceiling — otherwise "at most 30 days" is really 30 days plus one purge interval.
    BOOKS_PURGE_INTERVAL_SECONDS: z.coerce.number().int().positive().default(3_600),

    // ── Elevation profile: the AWS terrain-tile leg (CBS-P2, plan-api.md §7) ────
    // Master switch. `false` by default so a fresh deployment reaches no provider until somebody
    // decides it should — and here the switch also removes the ROUTE (404), because unlike the
    // earthquake leg there is no local store to degrade to.
    ELEVATION_ENABLED: envBoolean('false'),
    // The us-east-1 Open Data bucket. Verified live (SPEC §20.7); the EU bucket answered 403 and
    // its correct address form is unknown, so it is deliberately not the default. Declared as a
    // variable so an e2e can point the leg at a fake server (the `ECMWF_BASE_URL` precedent).
    ELEVATION_BASE_URL: z.url().default('https://s3.amazonaws.com/elevation-tiles-prod'),
    // Total upstream budget for ONE user request — every tile, every retry, together. Not a
    // per-call timeout, which cannot bound an operation that makes an unknown number of calls.
    //
    // ARGUED FROM MEASUREMENT (`data/elevation/terrain-tiles-probe.json`, 2026-08-19): at the
    // sampling zoom the probe measured a median 254 ms and p95 730 ms per tile, and the widest
    // realistic line it counted (Samsun→Erzurum) needs 73 distinct tiles. At the concurrency
    // below that closes in ~8.9 s at p95 and ~3.1 s at the median, so 12 s is the smallest round
    // value that finishes a measured long line at measured p95 latency with ~35 % headroom. The
    // longest line measured (İzmir→Van, 186 tiles) does NOT fit at p95 — it resolves ~98 tiles
    // and returns a partial profile, which is the designed warming path rather than a failure.
    //
    // **[VARSAYIM] on transfer:** the latency was measured from a development machine to
    // us-east-1. Hosting is undecided (`ENGINEERING.md` §8), so the production network path is
    // not the one behind these numbers.
    ELEVATION_UPSTREAM_DEADLINE_MS: z.coerce.number().int().positive().default(12_000),
    // Ceiling on ONE tile fetch. The slowest single tile the probe measured was 1 449 ms, so this
    // is ~3.4× the worst observed — enough that a congested moment is not a manufactured timeout,
    // tight enough that one hung socket cannot eat the request budget above.
    ELEVATION_SINGLE_CALL_TIMEOUT_MS: z.coerce.number().int().positive().default(5_000),
    // LOUD-stop ceiling on the tiles ONE request may touch. The structural maximum is the sample
    // count (a request cannot touch more distinct tiles than it samples points), and the widest
    // line measured touched 186. 220 sits just above the structural 200: reaching it means the
    // arithmetic that guarantee rests on has changed, which is worth stopping for.
    ELEVATION_MAX_TILES_PER_REQUEST: z.coerce.number().int().positive().default(220),
    // How many tile fetches one request may have in flight. Six keeps a single request to a
    // handful of sockets against one host while still closing a 73-tile line inside the budget;
    // 200 parallel sockets would be a burst the provider has every reason to refuse.
    ELEVATION_TILE_FETCH_CONCURRENCY: z.coerce.number().int().positive().default(6),
    // Byte ceiling for ONE tile response — the numeric form of "no unbounded external call". The
    // probe measured 757 B (sea) to 133 kB (mountain) at the sampling zoom, so 512 KiB is ~4×
    // the largest real tile. A body past it is a contract surprise, not a retry.
    ELEVATION_TILE_MAX_RESPONSE_BYTES: z.coerce.number().int().positive().default(524_288),
    // The in-process decoded-tile LRU, in tiles. One decoded grid is 256 × 256 × 2 B = 128 KiB
    // exactly, so 256 tiles ≈ 33.5 MB. That holds the widest measured line (186 tiles) plus two
    // typical ones (~26 tiles each) without either evicting the other.
    // **[VARSAYIM]** the "typical load" this is sized for is not measured; no traffic figure
    // exists for an undeployed site.
    ELEVATION_TILE_CACHE_MAX_TILES: z.coerce.number().int().positive().default(256),
    // Freshness horizon of a cached PROFILE. Long because the tiles behind it are immutable — the
    // bucket's own `Last-Modified` is 2017-11-17 — so the only thing that can change the answer is
    // our own sampling formula, and that carries a version segment in the cache key.
    ELEVATION_PROFILE_TTL_SECONDS: z.coerce.number().int().positive().default(86_400),
    // Negative TTLs, in the marine table's shape. `schema_error` is the SHORTEST because on this
    // leg it is where the imagery-source tripwire lands: a licence-relevant surprise must be
    // re-checked soon rather than parked for a quarter of an hour.
    ELEVATION_ERROR_TTL_SECONDS: z.coerce.number().int().positive().default(60),
    ELEVATION_CLIENT_ERROR_TTL_SECONDS: z.coerce.number().int().positive().default(900),
    ELEVATION_SCHEMA_ERROR_TTL_SECONDS: z.coerce.number().int().positive().default(300),
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

    // ── D6 (üyelik UYELIK-02, plan §11): production requires BOTH auth signing secrets ──
    // The `REDIS_URL` E1 shape, applied to a new domain: `AuthSecretsProvider`'s ephemeral
    // per-process fallback is acceptable in development/test (tokens simply do not survive a
    // restart) and unacceptable in production, where it would invalidate every live session on
    // every deploy and let the actual signing key never be evidenced anywhere durable. Checked
    // independently so a deployment missing exactly one of the two still gets a message naming
    // which one.
    if (env.NODE_ENV === 'production' && env.JWT_SECRET === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['JWT_SECRET'],
        message:
          'JWT_SECRET is REQUIRED when NODE_ENV=production (üyelik UYELIK-02 plan §11, D6). ' +
          'The ephemeral per-process fallback is a development/test-only mode — it does not ' +
          'survive a restart and leaves the real signing key unrecorded anywhere durable.',
      });
    }
    if (env.NODE_ENV === 'production' && env.AUTH_HMAC_PEPPER === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['AUTH_HMAC_PEPPER'],
        message:
          'AUTH_HMAC_PEPPER is REQUIRED when NODE_ENV=production (üyelik UYELIK-02 plan §11, ' +
          'D6). The ephemeral per-process fallback is a development/test-only mode.',
      });
    }

    // ── SEC84-P1: VISITOR_FORWARD_TOKEN must not collide with any existing secret ───────────
    // A shared value cannot mean what it says: against INTERNAL_REQUEST_TOKEN it silently
    // re-merges the two blast radii §B deliberately separated (a bypass secret vs. an
    // identity-forwarding secret); against JWT_SECRET or AUTH_HMAC_PEPPER it would put a secret
    // that is supposed to NEVER leave this process onto the wire, in a header, on every
    // authenticated forwarding call. Checked independently, and only when BOTH sides are set, so
    // the message names exactly which variable collided.
    if (
      env.VISITOR_FORWARD_TOKEN !== undefined &&
      env.INTERNAL_REQUEST_TOKEN !== undefined &&
      env.VISITOR_FORWARD_TOKEN === env.INTERNAL_REQUEST_TOKEN
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['VISITOR_FORWARD_TOKEN'],
        message:
          'VISITOR_FORWARD_TOKEN must not equal INTERNAL_REQUEST_TOKEN — the two guard different ' +
          'blast radii (a throttle-bypass secret vs. an identity-forwarding secret) and a shared ' +
          'value re-merges what SEC84-P1 §B deliberately separated.',
      });
    }
    if (
      env.VISITOR_FORWARD_TOKEN !== undefined &&
      env.JWT_SECRET !== undefined &&
      env.VISITOR_FORWARD_TOKEN === env.JWT_SECRET
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['VISITOR_FORWARD_TOKEN'],
        message:
          'VISITOR_FORWARD_TOKEN must not equal JWT_SECRET — a signing secret that never leaves ' +
          'this process must not also travel on the wire in an HTTP header on every ' +
          'authenticated-forwarder call.',
      });
    }
    if (
      env.VISITOR_FORWARD_TOKEN !== undefined &&
      env.AUTH_HMAC_PEPPER !== undefined &&
      env.VISITOR_FORWARD_TOKEN === env.AUTH_HMAC_PEPPER
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['VISITOR_FORWARD_TOKEN'],
        message:
          'VISITOR_FORWARD_TOKEN must not equal AUTH_HMAC_PEPPER — a pepper that never leaves ' +
          'this process must not also travel on the wire in an HTTP header on every ' +
          'authenticated-forwarder call.',
      });
    }

    // ── SEC84-P1 fix round (SEC139-M1/CODE139-M1): DOCS_ACCESS_TOKEN gets the SAME collision
    // refusal VISITOR_FORWARD_TOKEN got above ────────────────────────────────────────────────
    // The wire-contract argument above applies word-for-word to this PR's OTHER new secret:
    // `DOCS_ACCESS_TOKEN` also travels on the wire, in the `Authorization: Basic` header of
    // every `/docs` request (`docs-gate.ts`'s `buildDocsAuthMiddleware`), so a value shared with
    // a process-only signing secret puts that secret on the wire too. Three independent checks,
    // each `!== undefined`-guarded on BOTH sides — deliberately NOT a generic all-pairs
    // distinctness loop over every optional secret: two UNSET optional secrets both read
    // `undefined`, and a loop comparing them for equality would refuse boot on a fresh clone
    // that configures neither.
    if (
      env.DOCS_ACCESS_TOKEN !== undefined &&
      env.INTERNAL_REQUEST_TOKEN !== undefined &&
      env.DOCS_ACCESS_TOKEN === env.INTERNAL_REQUEST_TOKEN
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['DOCS_ACCESS_TOKEN'],
        message:
          'DOCS_ACCESS_TOKEN must not equal INTERNAL_REQUEST_TOKEN — the two guard different ' +
          'blast radii (a throttle-bypass secret vs. a /docs Basic-auth credential) and a ' +
          'shared value re-merges what they are meant to keep separate.',
      });
    }
    if (
      env.DOCS_ACCESS_TOKEN !== undefined &&
      env.JWT_SECRET !== undefined &&
      env.DOCS_ACCESS_TOKEN === env.JWT_SECRET
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['DOCS_ACCESS_TOKEN'],
        message:
          'DOCS_ACCESS_TOKEN must not equal JWT_SECRET — a signing secret that never leaves ' +
          'this process must not also travel on the wire in an HTTP Basic-auth header on every ' +
          '/docs request.',
      });
    }
    if (
      env.DOCS_ACCESS_TOKEN !== undefined &&
      env.AUTH_HMAC_PEPPER !== undefined &&
      env.DOCS_ACCESS_TOKEN === env.AUTH_HMAC_PEPPER
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['DOCS_ACCESS_TOKEN'],
        message:
          'DOCS_ACCESS_TOKEN must not equal AUTH_HMAC_PEPPER — a pepper that never leaves this ' +
          'process must not also travel on the wire in an HTTP Basic-auth header on every ' +
          '/docs request.',
      });
    }

    // ── SEC84-P1: a public api must not allowlist a developer's own machine as a browser origin ──
    // WEB_ORIGIN defaults to http://localhost:3000 for local dev; on a public, deployed api that
    // default is precisely "inheriting an accident" (DEC 2026-08-26m/o). Checked only in
    // production, and only against the URL's HOST — a real production origin that merely
    // contains the word "localhost" elsewhere is not what this refuses.
    if (env.NODE_ENV === 'production' && isLoopbackOrigin(env.WEB_ORIGIN)) {
      ctx.addIssue({
        code: 'custom',
        path: ['WEB_ORIGIN'],
        message:
          'WEB_ORIGIN must not be a loopback host (localhost / 127.0.0.1 / ::1) when ' +
          'NODE_ENV=production — the default silently allowlists a developer machine as a ' +
          'browser origin on a public api (SEC84-P1).',
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
    // Strengthened in M4a from the single-slice form ("ECMWF slice < tour deadline") to the SUM:
    // now that the tour hosts two provider slices, each fitting individually while their sum
    // overruns the tour would starve whichever target runs second — with every individual
    // number still looking correct (defaults: 180 000 + 60 000 < 300 000 ✓).
    if (env.ECMWF_TOUR_BUDGET_MS + env.CMEMS_TOUR_BUDGET_MS >= env.MARINE_WARMUP_DEADLINE_MS) {
      ctx.addIssue({
        code: 'custom',
        path: ['ECMWF_TOUR_BUDGET_MS'],
        message:
          'ECMWF_TOUR_BUDGET_MS + CMEMS_TOUR_BUDGET_MS must be smaller than ' +
          'MARINE_WARMUP_DEADLINE_MS — the two provider slices share one tour, and their sum ' +
          'overrunning it would starve whichever target runs second.',
      });
    }
    if (env.CMEMS_SINGLE_CALL_TIMEOUT_MS > env.MARINE_UPSTREAM_DEADLINE_MS) {
      ctx.addIssue({
        code: 'custom',
        path: ['CMEMS_SINGLE_CALL_TIMEOUT_MS'],
        message:
          'CMEMS_SINGLE_CALL_TIMEOUT_MS must not exceed MARINE_UPSTREAM_DEADLINE_MS — a single ' +
          'CMEMS call cannot be allowed more time than the whole request operation it runs in.',
      });
    }
    if (env.CMEMS_SINGLE_CALL_TIMEOUT_MS > env.CMEMS_TOUR_BUDGET_MS) {
      ctx.addIssue({
        code: 'custom',
        path: ['CMEMS_SINGLE_CALL_TIMEOUT_MS'],
        message:
          'CMEMS_SINGLE_CALL_TIMEOUT_MS must not exceed CMEMS_TOUR_BUDGET_MS — a single call ' +
          'cannot be allowed more time than the whole tour slice it runs in.',
      });
    }
    // The catalogue cap has the tour-slice bound and ONLY that one, for the reason written at
    // the field: the request path never fetches STAC, so `MARINE_UPSTREAM_DEADLINE_MS` is not
    // its ceiling. Composed through `checkEnvBound` rather than as a fourteenth hand-written
    // block — that helper is the funnel every new cross-check goes through.
    //
    // ONE attempt is the right operand here even though the client makes two (review #117,
    // SFH117-M3). Bounding the PAIR would forbid configurations that are provably harmless: the
    // resolution phase runs on its own sub-budget inside the slice, so an over-generous cap can
    // only cost the later products of that phase, never the value sweep it used to be able to
    // starve. A bound that only outlaws harmless settings is scaffolding.
    checkEnvBound(ctx, {
      kind: 'must-not-exceed',
      subject: 'CMEMS_STAC_CALL_TIMEOUT_MS',
      subjectValue: env.CMEMS_STAC_CALL_TIMEOUT_MS,
      limit: 'CMEMS_TOUR_BUDGET_MS',
      limitValue: env.CMEMS_TOUR_BUDGET_MS,
      reason:
        'a single catalogue call cannot be allowed more time than the whole tour slice it runs in',
    });
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

    // ── Book / YouTube sync cross-checks (SPEC §14) ──────────────────────────────
    // These five compose their messages through `checkEnvBound` (`src/config/env-bounds.ts`), the
    // shared helper that landed for exactly this shape: the same nine lines of ceremony around two
    // operands, a comparison and a REASON. The thirteen older blocks above are left alone on
    // purpose — converting them is a separate change with its own review, and this leg has no
    // business rewriting the marine and air-quality boot rules while adding its own.
    //
    // 1. The leg cannot reach a keyed provider without its key. Without this the failure surfaces as
    //    a 403 on every tour, hours after the deploy that caused it (the `ADS_API_KEY` precedent).
    if (env.BOOKS_YOUTUBE_SYNC_ENABLED && env.YOUTUBE_API_KEY === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['YOUTUBE_API_KEY'],
        message:
          'YOUTUBE_API_KEY is REQUIRED when BOOKS_YOUTUBE_SYNC_ENABLED=true — every YouTube Data ' +
          'API v3 call is authenticated. Provide it, or start with BOOKS_YOUTUBE_SYNC_ENABLED=false.',
      });
    }

    // 2. The budget chain: one call ≤ the tour slice ≤ the tour deadline < the interval between
    //    tours. Any inversion is a timer that cannot finish the work it schedules.
    checkEnvBound(ctx, {
      kind: 'must-not-exceed',
      subject: 'YOUTUBE_SINGLE_CALL_TIMEOUT_MS',
      subjectValue: env.YOUTUBE_SINGLE_CALL_TIMEOUT_MS,
      limit: 'YOUTUBE_SYNC_TOUR_BUDGET_MS',
      limitValue: env.YOUTUBE_SYNC_TOUR_BUDGET_MS,
      reason: 'a single call cannot be allowed more time than the whole tour slice it runs in',
    });
    checkEnvBound(ctx, {
      kind: 'must-not-exceed',
      subject: 'YOUTUBE_SYNC_TOUR_BUDGET_MS',
      subjectValue: env.YOUTUBE_SYNC_TOUR_BUDGET_MS,
      limit: 'YOUTUBE_SYNC_DEADLINE_MS',
      limitValue: env.YOUTUBE_SYNC_DEADLINE_MS,
      reason: 'the provider slice cannot be allowed more time than the tour that hosts it',
    });
    checkEnvBound(ctx, {
      kind: 'must-be-shorter-than',
      subject: 'YOUTUBE_SYNC_DEADLINE_MS',
      subjectValue: env.YOUTUBE_SYNC_DEADLINE_MS,
      limit: 'YOUTUBE_SYNC_INTERVAL_SECONDS',
      limitValue: env.YOUTUBE_SYNC_INTERVAL_SECONDS * 1000,
      reason: 'a tour that can outlive its own interval overlaps the next one',
    });

    // 3. The two ageing thresholds, in the order the rule reads them. The ceiling half (≤ 720 h)
    //    lives on the field itself, so it refuses even when nothing else is configured.
    checkEnvBound(ctx, {
      kind: 'must-be-smaller-than',
      subject: 'YOUTUBE_API_DATA_SOFT_MAX_AGE_HOURS',
      subjectValue: env.YOUTUBE_API_DATA_SOFT_MAX_AGE_HOURS,
      limit: 'YOUTUBE_API_DATA_HARD_MAX_AGE_HOURS',
      limitValue: env.YOUTUBE_API_DATA_HARD_MAX_AGE_HOURS,
      reason:
        'the age at which a snapshot stops being served must come before the age at which it is ' +
        'deleted, or the middle state the contract publishes as `youtube: null` does not exist',
    });

    // 4. The purge must run OBVIOUSLY often relative to the ceiling it enforces.
    //    Stated precisely, because the loose version overclaimed: this check does NOT remove the
    //    "30 days plus one purge interval" overrun — a timer cannot — it BOUNDS it. A row is deleted
    //    on the first tour after it crosses the ceiling, so the worst case is
    //    `hard + BOOKS_PURGE_INTERVAL_SECONDS`, and this bound caps that interval at a twenty-fourth
    //    of the ceiling: up to 30 h at the default 720 h. At the DEFAULT interval (1 h) the real
    //    worst case is 721 h; an operator who raises the interval to a legal-but-lax 29 h buys
    //    himself 749 h. Removing the overrun entirely would take a much tighter bound (the soft/hard
    //    gap), which is a mechanism change and not this check's job.
    checkEnvBound(ctx, {
      kind: 'must-be-smaller-than',
      subject: 'BOOKS_PURGE_INTERVAL_SECONDS',
      subjectValue: env.BOOKS_PURGE_INTERVAL_SECONDS,
      limit: 'a twenty-fourth of YOUTUBE_API_DATA_HARD_MAX_AGE_HOURS',
      limitValue: (env.YOUTUBE_API_DATA_HARD_MAX_AGE_HOURS * 3600) / 24,
      reason:
        'a purge that runs rarely relative to the retention ceiling turns "at most 30 days" into ' +
        '30 days plus one purge interval',
    });

    // 5. E1 stated for the third leg: production + a scheduled upstream leg ⇒ Redis. Without it the
    //    cross-instance tour lock does not exist and every instance runs its own tour.
    if (
      env.NODE_ENV === 'production' &&
      env.BOOKS_YOUTUBE_SYNC_ENABLED &&
      env.REDIS_URL === undefined
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['REDIS_URL'],
        message:
          'REDIS_URL is REQUIRED when NODE_ENV=production and BOOKS_YOUTUBE_SYNC_ENABLED=true (the ' +
          'same owner ruling E1 / DEC 2026-07-29b that binds the marine and air-quality legs): ' +
          'without Redis the cross-instance tour lock does not exist, so every instance would run ' +
          'its own YouTube tour. Provision Redis, or start with BOOKS_YOUTUBE_SYNC_ENABLED=false.',
      });
    }

    // ── Earthquakes: the AFAD TDVMS ingest (SPEC §14) ──────────────────────────
    //
    // 1. The same production+Redis rule as the three legs above, for the same reason — and here it
    //    covers TWO tours, since this leg schedules `recent` and `reconcile` separately.
    if (env.NODE_ENV === 'production' && env.EARTHQUAKE_ENABLED && env.REDIS_URL === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['REDIS_URL'],
        message:
          'REDIS_URL is REQUIRED when NODE_ENV=production and EARTHQUAKE_ENABLED=true (the same ' +
          'owner ruling E1 / DEC 2026-07-29b that binds the marine, air-quality and book legs): ' +
          'without Redis neither the `recent` nor the `reconcile` tour has a cross-instance lock, ' +
          'so every instance would poll AFAD on its own. Provision Redis, or start with ' +
          'EARTHQUAKE_ENABLED=false.',
      });
    }

    // 2. The time chain: one call ≤ the provider slice ≤ the tour, and the tour shorter than BOTH
    //    intervals it is scheduled on.
    checkEnvBound(ctx, {
      kind: 'must-not-exceed',
      subject: 'EARTHQUAKE_SINGLE_CALL_TIMEOUT_MS',
      subjectValue: env.EARTHQUAKE_SINGLE_CALL_TIMEOUT_MS,
      limit: 'EARTHQUAKE_TOUR_BUDGET_MS',
      limitValue: env.EARTHQUAKE_TOUR_BUDGET_MS,
      reason: 'a single call cannot be allowed more time than the whole tour slice it runs in',
    });
    checkEnvBound(ctx, {
      kind: 'must-not-exceed',
      subject: 'EARTHQUAKE_TOUR_BUDGET_MS',
      subjectValue: env.EARTHQUAKE_TOUR_BUDGET_MS,
      limit: 'EARTHQUAKE_INGEST_DEADLINE_MS',
      limitValue: env.EARTHQUAKE_INGEST_DEADLINE_MS,
      reason: 'the provider slice cannot be allowed more time than the tour that hosts it',
    });
    checkEnvBound(ctx, {
      kind: 'must-be-shorter-than',
      subject: 'EARTHQUAKE_INGEST_DEADLINE_MS',
      subjectValue: env.EARTHQUAKE_INGEST_DEADLINE_MS,
      limit: 'EARTHQUAKE_INGEST_INTERVAL_SECONDS',
      limitValue: env.EARTHQUAKE_INGEST_INTERVAL_SECONDS * 1000,
      reason: 'a tour that can outlive its own interval overlaps the next one',
    });
    checkEnvBound(ctx, {
      kind: 'must-be-shorter-than',
      subject: 'EARTHQUAKE_INGEST_DEADLINE_MS',
      subjectValue: env.EARTHQUAKE_INGEST_DEADLINE_MS,
      limit: 'EARTHQUAKE_RECONCILE_INTERVAL_SECONDS',
      limitValue: env.EARTHQUAKE_RECONCILE_INTERVAL_SECONDS * 1000,
      reason:
        'the same deadline governs the reconcile tour, so it must also fit inside the reconcile ' +
        'interval',
    });

    // 3. Each window must be WIDER than the cadence that repeats it. This is the check that keeps
    //    events from vanishing: with a window narrower than its interval, the stretch of time
    //    between the end of one window and the start of the next is never queried by anybody, and
    //    an event that happened in it is simply never seen again — no error, no gap, no trace.
    checkEnvBound(ctx, {
      kind: 'must-be-smaller-than',
      subject: 'EARTHQUAKE_INGEST_INTERVAL_SECONDS',
      subjectValue: env.EARTHQUAKE_INGEST_INTERVAL_SECONDS,
      limit: 'EARTHQUAKE_RECENT_WINDOW_HOURS',
      limitValue: env.EARTHQUAKE_RECENT_WINDOW_HOURS * 3600,
      reason:
        'a window narrower than the interval that repeats it leaves an unqueried gap between tours ' +
        'and events inside that gap are lost silently',
    });
    checkEnvBound(ctx, {
      kind: 'must-be-smaller-than',
      subject: 'EARTHQUAKE_RECONCILE_INTERVAL_SECONDS',
      subjectValue: env.EARTHQUAKE_RECONCILE_INTERVAL_SECONDS,
      limit: 'EARTHQUAKE_RECONCILE_WINDOW_DAYS',
      limitValue: env.EARTHQUAKE_RECONCILE_WINDOW_DAYS * 86_400,
      reason: 'the reconcile window must cover more ground than the interval that repeats it',
    });

    // 4. The staleness budget must outlast the cadence that refreshes it. Set the other way round,
    //    a perfectly healthy leg stamps its own data `stale` between two consecutive tours — and a
    //    freshness warning that fires while nothing is wrong is one readers learn to ignore before
    //    the outage it exists for.
    checkEnvBound(ctx, {
      kind: 'must-be-smaller-than',
      subject: 'EARTHQUAKE_INGEST_INTERVAL_SECONDS',
      subjectValue: env.EARTHQUAKE_INGEST_INTERVAL_SECONDS,
      limit: 'EARTHQUAKE_STALE_MAX_SECONDS',
      limitValue: env.EARTHQUAKE_STALE_MAX_SECONDS,
      reason:
        'a staleness budget shorter than the polling interval marks healthy data stale between ' +
        'two ordinary tours',
    });

    // ── Elevation profile: the AWS terrain-tile leg (CBS-P2) ───────────────────
    //
    // 1. The same production+Redis rule as the four legs above (Atlas ruling AK-25 md.7). It is
    //    STRONGER here than anywhere else, and the reason is worth stating rather than inheriting:
    //    this is the first endpoint that is both wall-less and capable of real upstream work, and
    //    the provider budget — the guard that bounds every request in the process together — is
    //    only shared across instances through Redis. Without it, N instances mean N separate
    //    budgets and the ceiling an operator configured is not the ceiling that applies.
    if (env.NODE_ENV === 'production' && env.ELEVATION_ENABLED && env.REDIS_URL === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['REDIS_URL'],
        message:
          'REDIS_URL is REQUIRED when NODE_ENV=production and ELEVATION_ENABLED=true (the same ' +
          'owner ruling E1 / DEC 2026-07-29b that binds the marine, air-quality, book and ' +
          'earthquake legs): without Redis the provider budget is per-instance, so N instances ' +
          'multiply the ceiling this endpoint is protected by, and no profile is shared between ' +
          'them. Provision Redis, or start with ELEVATION_ENABLED=false.',
      });
    }

    // 2. One tile fetch is bounded by the request it runs inside — and STRICTLY here, unlike the
    //    marine and CMEMS call/deadline pairs above, which deliberately allow the two to be equal.
    //
    //    The asymmetry is the shape of the leg, not a preference. Equality says "one call may
    //    spend the whole budget", and that sentence is honest only where every call of the
    //    operation really is handed the whole window: `MarineValuesService` fires its ≤3 CMEMS
    //    keys together at t≈0 and each one genuinely gets all 6 000 ms (review #81 M5). This leg
    //    is the other shape — `ElevationProfileService` mints ONE `OperationDeadline` and drains a
    //    tile queue across it with `ELEVATION_TILE_FETCH_CONCURRENCY` workers, so the LATE tiles
    //    are handed `min(cap, remaining)`, a few hundred milliseconds, and are ended by OUR
    //    ceiling rather than by the provider.
    //
    //    `OperationDeadline.cutsCallShort` is what tells those two apart, and it answers `false`
    //    unconditionally once the cap reaches the budget — the clause that keeps the CMEMS breaker
    //    armed. On a fan-out leg that same clause turns the client's "our brake, not provider
    //    evidence" branch into dead code: the whole in-flight wave aborts at the ceiling, is
    //    recorded as provider failure, and the circuit opens against a bucket that answered every
    //    call it finished. Refusing equality is what keeps that predicate honest on this leg
    //    (review #124, SFH124-C1 and CODE124R3-I1).
    checkEnvBound(ctx, {
      kind: 'must-be-shorter-than',
      subject: 'ELEVATION_SINGLE_CALL_TIMEOUT_MS',
      subjectValue: env.ELEVATION_SINGLE_CALL_TIMEOUT_MS,
      limit: 'ELEVATION_UPSTREAM_DEADLINE_MS',
      limitValue: env.ELEVATION_UPSTREAM_DEADLINE_MS,
      reason:
        'the tile fetches drain one shared budget, so a cap equal to it can never be honoured by ' +
        'the late tiles and turns our own ceiling aborts into circuit-breaker evidence against a ' +
        'healthy provider',
    });

    // 3. The per-request tile ceiling may not sit below the number of tiles a request can
    //    legitimately need. The subject is a COMPILE-TIME constant, not a variable — which is
    //    exactly why the check exists: an operator can lower the ceiling but cannot lower the
    //    sample count, so a ceiling under it makes every long line fail loudly for a reason that
    //    is not the operator's fault. The issue attaches to the key they can actually edit.
    checkEnvBound(ctx, {
      kind: 'must-not-exceed',
      subject: 'ELEVATION_PROFILE_SAMPLE_COUNT',
      subjectValue: ELEVATION_PROFILE_SAMPLE_COUNT,
      limit: 'ELEVATION_MAX_TILES_PER_REQUEST',
      limitValue: env.ELEVATION_MAX_TILES_PER_REQUEST,
      reason:
        'the fixed sample count is the structural maximum of distinct tiles one request can ' +
        'touch, so a ceiling below it refuses work the endpoint is designed to do',
    });

    // 4. The tile cache must be able to hold one whole request's worth of tiles. Below that, a
    //    single long line evicts its OWN earlier tiles while it is still running, so the warming
    //    that makes a partial profile complete on the next attempt never happens — the cache would
    //    be configured, busy and useless.
    checkEnvBound(ctx, {
      kind: 'must-not-exceed',
      subject: 'ELEVATION_MAX_TILES_PER_REQUEST',
      subjectValue: env.ELEVATION_MAX_TILES_PER_REQUEST,
      limit: 'ELEVATION_TILE_CACHE_MAX_TILES',
      limitValue: env.ELEVATION_TILE_CACHE_MAX_TILES,
      reason:
        'a tile cache smaller than one request evicts that request’s own tiles while it is still ' +
        'running, so a partial profile can never warm into a complete one',
    });
  });

/**
 * SEC84-P1 — true when `url`'s HOST (not its full string) is `localhost`, `127.0.0.1` or `::1`.
 *
 * **Two claims this docblock used to make were wrong, and both are corrected here rather than
 * silently dropped (SFH139-M3/VAL139-SD7, measured against this repo's own zod 4.4.3).**
 *
 * First: `url` is NOT already validated by the time this runs. `WEB_ORIGIN`'s own `z.url()`
 * check and this object-level `superRefine` both read the SAME raw field, and a sub-field
 * failing its own check does not stop `superRefine` from running — measured directly:
 * `z.object({ WEB_ORIGIN: z.url().default(...) }).superRefine(fn).safeParse({ WEB_ORIGIN: 'not
 * a url' })` still calls `fn`, and the value it receives is the literal unparsed string `'not a
 * url'`. This function CAN and DOES sometimes run against a value `new URL()` throws on; the
 * `try`/`catch` is load-bearing, not defensive boilerplate for a case that "cannot happen".
 *
 * Second: the `catch` below does NOT "mirror" `REDIS_URL`'s refinement above — it is the
 * OPPOSITE polarity. There, `catch { return false }` means "invalid", and the caller (a
 * `.refine`) turns `false` into a parse failure — closed direction: an unparseable value stops
 * boot. Here, `catch { return false }` means "not a loopback host", and the caller only adds an
 * issue when the result is `true` — open direction: an unparseable value passes this specific
 * check SILENTLY and lets boot continue (on the strength of the sentence above: the overall
 * parse still fails downstream, from `WEB_ORIGIN`'s own `z.url()` issue, so nothing ships today —
 * but that is a fact about the OUTER result, not about this function's own polarity, and must
 * not be copied by a future caller on the strength of a "mirrors REDIS_URL" claim that was never
 * true).
 *
 * **Measured, load-bearing:** `new URL('http://[::1]:3000').hostname` is the literal string
 * `'[::1]'` — WITH the brackets — not `'::1'`. A bracket-naive comparison would silently never
 * match the IPv6 loopback form, so the brackets are stripped before comparing.
 */
function isLoopbackOrigin(url: string): boolean {
  try {
    let hostname = new URL(url).hostname.toLowerCase();
    if (hostname.startsWith('[') && hostname.endsWith(']')) {
      hostname = hostname.slice(1, -1);
    }
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  } catch {
    return false;
  }
}

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
