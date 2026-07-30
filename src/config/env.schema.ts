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
    // Keep this rule and the web's in lockstep; `env.schema.spec.ts` pins it so a future
    // loosening fails CI instead of re-opening both failure modes.
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
    // not apply to it (§6.4).
    MARINE_WARMUP_DEADLINE_MS: z.coerce.number().int().positive().default(120_000),

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
  });

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
