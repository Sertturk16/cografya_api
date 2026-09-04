import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from '../data-source-options';
import { seedRegions } from './seed-regions';

/**
 * CLI entry for `pnpm db:seed:regions` (run against the COMPILED build, like
 * the migration CLI: `pnpm build && node dist/database/seeds/regions.cli.js`).
 *
 * Assumes the schema already exists — run `pnpm migration:run` first.
 */
async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL must be set to run db:seed:regions.');
  }

  const dataSource = new DataSource(buildDataSourceOptions(databaseUrl));
  await dataSource.initialize();

  try {
    const result = await seedRegions(dataSource);
    console.log(
      `[db:seed:regions] done — inserted=${result.inserted} updated=${result.updated} ` +
        `unchanged=${result.unchanged} total=${result.total}`,
    );
  } finally {
    try {
      await dataSource.destroy();
    } catch (destroyError) {
      console.error('[db:seed:regions] failed to close the data source:', destroyError);
    }
  }
}

main().catch((error: unknown) => {
  console.error('[db:seed:regions] failed:', error);
  process.exitCode = 1;
});
