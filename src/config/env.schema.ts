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
  PORT: z.coerce.number().int().positive().max(65535).default(3000),
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
