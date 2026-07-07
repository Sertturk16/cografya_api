import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from './data-source-options';

/**
 * Standalone DataSource for the TypeORM migration CLI (`migration:run`,
 * `migration:generate`, …). The CLI is run against the COMPILED build:
 *
 *   pnpm build && pnpm typeorm migration:run -d dist/database/data-source.js
 *
 * (the `db:*` package scripts wrap this). Running compiled JS keeps the CLI on
 * plain Node — no ts-node — which is the robust path on bleeding-edge TS.
 *
 * `DATABASE_URL` is read straight from the environment here (the CLI runs
 * outside Nest's DI, so there is no ConfigService). A missing value fails loudly
 * rather than silently connecting to a default — same fail-fast posture as the
 * app's zod env validation.
 */
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    'DATABASE_URL must be set to run TypeORM CLI commands (migration:run/generate/revert/show).',
  );
}

export default new DataSource(buildDataSourceOptions(databaseUrl));
