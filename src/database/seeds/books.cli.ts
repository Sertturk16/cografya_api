import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from '../data-source-options';
import { assertBookSeedInvariants, collectBookSeedNotes } from './book-seed-invariants';
import { readBookTimestampsArtifact } from './book-timestamps.artifact';
import { SEED_BOOKS } from './books.seed-data';
import { seedBooks } from './seed-books';

/**
 * CLI entry for `pnpm db:seed:books` (run against the COMPILED build, like every other seed and
 * import CLI: `pnpm build && node dist/database/seeds/books.cli.js`).
 *
 * ```
 * pnpm db:seed:books            # validate, then write (idempotent)
 * pnpm db:seed:books --check    # validate only; writes nothing, opens no connection
 * ```
 *
 * Assumes the schema exists — run `pnpm migration:run` first. `DATABASE_URL` is read straight from
 * the environment (this runs outside Nest's DI, so there is no ConfigService) and a missing value
 * fails by name rather than silently connecting to a default: the same fail-fast posture as the
 * app's zod env check and the migration CLI.
 *
 * ## `--check` deliberately needs no database
 * Every refusal on this line is about the ARTEFACT and the künye row — the schema, the seven
 * cross-row rules, the prose ceilings and the artefact↔künye join. None of them needs a
 * connection, so requiring one would make the cheapest verification the hardest to run: a reviewer
 * on any machine, and any CI job, can run `--check` with no Postgres at all. **The closing
 * criterion is the EXIT CODE, not the printed counts** (playbook §8) — the counts are there to be
 * read by a human afterwards, never to be judged by eye instead of it.
 *
 * ## Why an unrecognised argument is refused rather than ignored
 * `--chek` would otherwise mean "write to the database" to somebody who typed "validate only".
 * That is the same hazard `era5.cli.ts` refuses a stray `--raw-dir` for, pointing the other way:
 * silently accepting an argument that does nothing teaches the operator that it worked.
 */

const USAGE = 'Usage: pnpm db:seed:books [--check]';

export interface BooksSeedCliArgs {
  /** `true` = validate and write nothing. */
  checkOnly: boolean;
}

export function parseBooksSeedCliArgs(argv: readonly string[]): BooksSeedCliArgs {
  const unknown = argv.filter((arg) => arg !== '--check');
  if (unknown.length > 0) {
    throw new Error(
      `unrecognised argument(s): ${unknown.map((arg) => JSON.stringify(arg)).join(', ')}. ${USAGE}`,
    );
  }

  return { checkOnly: argv.includes('--check') };
}

function printNotes(): void {
  // Editorial length bands (SEO-POLICY A1/A2) are NOTES by rule, never failures — printed on every
  // run so they are seen by whoever edits a string, not by an auditor months later.
  for (const note of collectBookSeedNotes(SEED_BOOKS)) {
    console.log(`[db:seed:books] note — ${note}`);
  }
}

async function runCheck(): Promise<void> {
  assertBookSeedInvariants(SEED_BOOKS);
  const artifact = await readBookTimestampsArtifact();
  printNotes();
  console.log(
    `[db:seed:books] check passed — books=${String(SEED_BOOKS.length)} ` +
      `videos=${String(artifact.videos.length)} questions=${String(artifact.questionCount)}. ` +
      `Nothing was written and no connection was opened.`,
  );
}

async function runSeed(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL must be set to run db:seed:books.');
  }

  printNotes();

  const dataSource = new DataSource(buildDataSourceOptions(databaseUrl));
  await dataSource.initialize();

  try {
    const result = await seedBooks(dataSource);
    console.log(
      `[db:seed:books] done — books: inserted=${String(result.books.inserted)} ` +
        `updated=${String(result.books.updated)} unchanged=${String(result.books.unchanged)}; ` +
        `videos: inserted=${String(result.videos.inserted)} updated=${String(result.videos.updated)} ` +
        `unchanged=${String(result.videos.unchanged)} removed=${String(result.videos.removed)}; ` +
        `questions: inserted=${String(result.questions.inserted)} ` +
        `updated=${String(result.questions.updated)} ` +
        `unchanged=${String(result.questions.unchanged)} removed=${String(result.questions.removed)}`,
    );
  } finally {
    // Nested try so a teardown failure is logged but never MASKS the original seed error (which
    // keeps propagating out of `main`). The process still exits non-zero on either failure.
    try {
      await dataSource.destroy();
    } catch (destroyError) {
      console.error('[db:seed:books] failed to close the data source:', destroyError);
    }
  }
}

async function main(): Promise<void> {
  const args = parseBooksSeedCliArgs(process.argv.slice(2));

  if (args.checkOnly) {
    await runCheck();
    return;
  }

  await runSeed();
}

// Only run when this file IS the entry point: importing it (the unit spec reaches
// `parseBooksSeedCliArgs` this way) must not execute `main()` against Jest's own argv — the
// `era5.cli.ts` precedent.
if (require.main === module) {
  main().catch((error: unknown) => {
    console.error('[db:seed:books] failed:', error);
    // exitCode (not process.exit) so buffered stdio flushes before exit.
    process.exitCode = 1;
  });
}
