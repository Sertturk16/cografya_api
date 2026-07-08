import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from '../data-source-options';
import { seedGeography } from './seed-geography';

/**
 * CLI entry for `pnpm db:seed:geography` (run against the COMPILED build, like
 * the migration CLI: `pnpm build && node dist/database/seeds/geography.cli.js`).
 *
 * Assumes the schema already exists — run `pnpm migration:run` first. Reads
 * `DATABASE_URL` straight from the environment (this runs outside Nest's DI, so
 * there is no ConfigService); a missing value fails loudly rather than silently
 * connecting to a default — same fail-fast posture as the app's zod env check
 * and the migration CLI.
 */
async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL must be set to run db:seed:geography.');
  }

  const dataSource = new DataSource(buildDataSourceOptions(databaseUrl));
  await dataSource.initialize();

  try {
    const result = await seedGeography(dataSource);
    console.log(
      `[db:seed:geography] done — inserted=${result.inserted} updated=${result.updated} total=${result.total}`,
    );
  } finally {
    await dataSource.destroy();
  }
}

main().catch((error: unknown) => {
  console.error('[db:seed:geography] failed:', error);
  // exitCode (not process.exit) so buffered stdio flushes before exit.
  process.exitCode = 1;
});
