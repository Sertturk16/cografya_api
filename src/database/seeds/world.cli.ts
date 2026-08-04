import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from '../data-source-options';
import { SEED_COUNTRIES } from './country.seed-data';
import { assertCountryCorpusInvariants } from './country-entity-invariants';
import { seedWorld } from './seed-world';

/**
 * CLI entry for `pnpm db:seed:world` (run against the COMPILED build, like the migration
 * CLI: `pnpm build && node dist/database/seeds/world.cli.js`).
 *
 * Assumes the schema already exists — run `pnpm migration:run` first. Reads
 * `DATABASE_URL` straight from the environment (this runs outside Nest's DI, so there is
 * no ConfigService); a missing value fails loudly rather than silently connecting to a
 * default — same fail-fast posture as the geography seed + migration CLI.
 *
 * ## Why the CORPUS invariants are asserted here and nowhere else in production
 * `seedWorld` guards every batch it is handed (row-level rules), but it deliberately cannot
 * assert corpus-level ones — "exactly one Türkiye row", "at least one territory and one
 * special", "no repeated isoCode/slug" are claims about the WHOLE published set, and the
 * function legitimately receives partial batches from the e2e suite. This CLI is the one
 * production path that always seeds the full `SEED_COUNTRIES`, so it is the only place those
 * rules can run outside a test. The unit spec asserts the same function against the same
 * corpus and fails faster; this call is what protects a human running the seed by hand from a
 * branch, where CI has not necessarily spoken yet.
 */
async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL must be set to run db:seed:world.');
  }

  // BEFORE opening a connection: a corpus-shaped defect should not cost a database round trip,
  // and the failure should name the rule rather than surface as a constraint violation later.
  assertCountryCorpusInvariants(SEED_COUNTRIES);

  const dataSource = new DataSource(buildDataSourceOptions(databaseUrl));
  await dataSource.initialize();

  try {
    const result = await seedWorld(dataSource);
    console.log(
      `[db:seed:world] done — inserted=${result.inserted} updated=${result.updated} ` +
        `unchanged=${result.unchanged} total=${result.total}`,
    );
  } finally {
    // Nested try so a teardown failure is logged but never MASKS the original seed error
    // (which keeps propagating out of `main`). The process still exits non-zero on either
    // failure.
    try {
      await dataSource.destroy();
    } catch (destroyError) {
      console.error('[db:seed:world] failed to close the data source:', destroyError);
    }
  }
}

main().catch((error: unknown) => {
  console.error('[db:seed:world] failed:', error);
  // exitCode (not process.exit) so buffered stdio flushes before exit.
  process.exitCode = 1;
});
