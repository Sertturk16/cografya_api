import type { ConfigModuleOptions } from '@nestjs/config';
import { validateEnv } from './env.schema';

/**
 * `ConfigModule.forRoot` options for `AppModule`, given the process's `NODE_ENV`.
 *
 * Validation runs at boot (zod): a missing or mistyped variable aborts startup.
 *
 * Under `NODE_ENV=test` the `.env` file is NOT read. Jest sets `test` (and `pnpm test:e2e` pins
 * it), so a test process sees only what the shell and the suite set, exactly like CI, which has
 * no `.env`. A developer's `.env` points `REDIS_URL` at the dev Redis that holds live cache
 * entries and switches upstream flags on, and `forRoot` copies every key the suite left unset
 * into `process.env`; e2e results then depended on whose machine ran them. The dev server
 * (`development`) and production keep reading `.env` as before.
 */
export function buildConfigModuleOptions(nodeEnv: string | undefined): ConfigModuleOptions {
  return {
    isGlobal: true,
    cache: true,
    validate: validateEnv,
    ignoreEnvFile: nodeEnv === 'test',
  };
}
