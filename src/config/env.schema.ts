import { z } from 'zod';

/**
 * Boot-time environment schema (single source of truth for `process.env`).
 *
 * Every environment variable the app reads MUST be declared here. Unknown keys
 * are stripped (only the OS env we explicitly validate is exposed via
 * ConfigService), so a var the app relies on but forgets to declare surfaces
 * immediately rather than silently reading `undefined`.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
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
  INTERNAL_REQUEST_TOKEN: z
    .string()
    .min(32, 'INTERNAL_REQUEST_TOKEN must be at least 32 characters when set')
    .optional(),
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
