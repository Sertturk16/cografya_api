import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from '../data-source-options';
import { assertArtifactMatchesProvinces, readDistrictsArtifact } from './district.artifact';
import { SEED_PROVINCES } from './province.seed-data';
import { seedReference } from './seed-reference';

/**
 * CLI entry for `pnpm db:seed:reference` (run against the COMPILED build, like every other seed and
 * import CLI: `pnpm build && node dist/database/seeds/reference.cli.js`).
 *
 * ```
 * pnpm db:seed:reference                    # validate, then write (idempotent)
 * pnpm db:seed:reference --check            # validate only; writes nothing, opens no connection
 * pnpm db:seed:reference --allow-removals   # additionally authorises DELETING rows the artefact dropped
 * ```
 *
 * Assumes the schema exists — run `pnpm migration:run` first, and `pnpm db:seed:geography` before
 * that, since every ilçe hangs off a province row. `DATABASE_URL` is read straight from the
 * environment (this runs outside Nest's DI, so there is no ConfigService) and a missing value fails
 * by name rather than silently connecting to a default: the same fail-fast posture as the app's zod
 * env check and the migration CLI.
 *
 * ## `--check` needs no database, and it is not a weaker gate — it is a DIFFERENT one
 * It runs every artefact refusal, and then joins the artefact against the COMMITTED province corpus
 * (`SEED_PROVINCES`) instead of against the rows in a database. Both callers hand the same list to
 * one `assertArtifactMatchesProvinces`, so the two cannot drift apart (the `db:seed:books --check`
 * precedent, which exists because two hand-written lists had already diverged).
 *
 * The difference is worth knowing rather than glossing: `--check` proves the artefact agrees with
 * the province data this repo SHIPS, which is what a reviewer and CI can verify on any machine with
 * no Postgres at all. The write path proves it agrees with the province data a given database
 * ACTUALLY HOLDS, which may have been seeded from an older corpus — and it additionally re-counts
 * the rows after writing them, which nothing offline can do.
 *
 * **The closing criterion is the EXIT CODE, not the printed counts** (playbook §8).
 *
 * ## Why an unrecognised argument is refused rather than ignored
 * `--chek` would otherwise mean "write to the database" to somebody who typed "validate only" —
 * the `books.cli.ts` reasoning, and the parser is an exported pure function with its own spec for
 * the same reason: a refusal that decides whether a run writes must be pinned somewhere a change to
 * it goes red.
 */

const USAGE = 'Usage: pnpm db:seed:reference [--check] [--allow-removals]';

const KNOWN_FLAGS = ['--check', '--allow-removals'] as const;

export interface ReferenceSeedCliArgs {
  /** `true` = validate and write nothing. */
  checkOnly: boolean;
  /** `true` = this run may DELETE rows the artefact no longer carries. */
  allowRemovals: boolean;
}

export function parseReferenceSeedCliArgs(argv: readonly string[]): ReferenceSeedCliArgs {
  const known: readonly string[] = KNOWN_FLAGS;
  const unknown = argv.filter((arg) => !known.includes(arg));
  if (unknown.length > 0) {
    throw new Error(
      `unrecognised argument(s): ${unknown.map((arg) => JSON.stringify(arg)).join(', ')}. ${USAGE}`,
    );
  }

  return {
    checkOnly: argv.includes('--check'),
    allowRemovals: argv.includes('--allow-removals'),
  };
}

async function runCheck(): Promise<void> {
  const artifact = await readDistrictsArtifact();
  assertArtifactMatchesProvinces(artifact, SEED_PROVINCES);

  console.log(
    `[db:seed:reference] check passed — provinces=${String(artifact.provinces.length)} ` +
      `districts=${String(artifact.districtCount)}, joined against the committed province corpus. ` +
      'Nothing was written and no connection was opened.',
  );
}

async function runSeed(allowRemovals: boolean): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL must be set to run db:seed:reference.');
  }

  const dataSource = new DataSource(buildDataSourceOptions(databaseUrl));
  await dataSource.initialize();

  try {
    const result = await seedReference(dataSource, { allowRemovals });
    console.log(
      `[db:seed:reference] done — districts: inserted=${String(result.inserted)} ` +
        `unchanged=${String(result.unchanged)} removed=${String(result.removed)} ` +
        `provinces=${String(result.provinces)} total=${String(result.total)}`,
    );

    // A destructive run must not be readable as an ordinary one. The counts above are a line an
    // operator scans; this is a sentence they cannot scan past, and it is printed only when rows
    // actually left the table.
    if (result.removed > 0) {
      console.log(
        '[db:seed:reference] THIS RUN DELETED PUBLISHED ROWS — ' +
          `${String(result.removed)} ilçe are gone, authorised by --allow-removals. If that was ` +
          'not intended, restore the artefact and re-seed.',
      );
    }
  } finally {
    // Nested try so a teardown failure is logged but never MASKS the original seed error (which
    // keeps propagating out of `main`). The process still exits non-zero on either failure.
    try {
      await dataSource.destroy();
    } catch (destroyError) {
      console.error('[db:seed:reference] failed to close the data source:', destroyError);
    }
  }
}

async function main(): Promise<void> {
  const args = parseReferenceSeedCliArgs(process.argv.slice(2));

  if (args.checkOnly) {
    await runCheck();
    return;
  }

  await runSeed(args.allowRemovals);
}

// Only run when this file IS the entry point: importing it (the spec reaches
// `parseReferenceSeedCliArgs` this way) must not execute `main()` against Jest's own argv — the
// `books.cli.ts` / `era5.cli.ts` precedent.
if (require.main === module) {
  main().catch((error: unknown) => {
    console.error('[db:seed:reference] failed:', error);
    // exitCode (not process.exit) so buffered stdio flushes before exit.
    process.exitCode = 1;
  });
}
