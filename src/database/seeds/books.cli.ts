import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from '../data-source-options';
import { collectBookSeedNotes, validateBookSeedCorpus } from './book-seed-invariants';
import { SEED_BOOKS, type BookSeed } from './books.seed-data';
import { seedBooks } from './seed-books';

/**
 * CLI entry for `pnpm db:seed:books` (run against the COMPILED build, like every other seed and
 * import CLI: `pnpm build && node dist/database/seeds/books.cli.js`).
 *
 * ```
 * pnpm db:seed:books                    # validate, then write (idempotent)
 * pnpm db:seed:books --check            # validate only; writes nothing, opens no connection
 * pnpm db:seed:books --allow-removals   # additionally authorises DELETING rows the artefact dropped
 * ```
 *
 * Assumes the schema exists — run `pnpm migration:run` first. `DATABASE_URL` is read straight from
 * the environment (this runs outside Nest's DI, so there is no ConfigService) and a missing value
 * fails by name rather than silently connecting to a default: the same fail-fast posture as the
 * app's zod env check and the migration CLI.
 *
 * ## `--check` deliberately needs no database, and runs EXACTLY the write path's refusals
 * Both paths call one `validateBookSeedCorpus`, so "what `--check` validates" and "what the write
 * refuses" are the same list by construction rather than by two lists agreeing. That is not a
 * stylistic preference: they were two hand-written lists, and they had already diverged — the owner
 * lookup and the artefact↔künye join ran only on the write path, so a künye whose `denemeCount`
 * disagreed with the artefact exited 0 here and was refused there (PR #109 review, `CODE109-I1`).
 *
 * None of those refusals needs a connection, so requiring one would make the cheapest verification
 * the hardest to run: a reviewer on any machine, and any CI job, can run `--check` with no Postgres
 * at all. **The closing criterion is the EXIT CODE, not the printed counts** (playbook §8) — the
 * counts are there to be read by a human afterwards, never to be judged by eye instead of it.
 *
 * What `--check` still cannot see is anything that depends on DATABASE STATE: whether this run
 * would delete rows is not knowable without the rows, which is why `--allow-removals` exists on the
 * write path only.
 *
 * ## Why an unrecognised argument is refused rather than ignored
 * `--chek` would otherwise mean "write to the database" to somebody who typed "validate only".
 * That is the same hazard `era5.cli.ts` refuses a stray `--raw-dir` for, pointing the other way:
 * silently accepting an argument that does nothing teaches the operator that it worked. The parser
 * is an exported pure function with its own spec, because a refusal that decides whether a run
 * writes must be pinned somewhere a change to it goes red.
 */

const USAGE = 'Usage: pnpm db:seed:books [--check] [--allow-removals]';

const KNOWN_FLAGS = ['--check', '--allow-removals'] as const;

export interface BooksSeedCliArgs {
  /** `true` = validate and write nothing. */
  checkOnly: boolean;
  /** `true` = this run may DELETE rows the artefact no longer carries. */
  allowRemovals: boolean;
}

export function parseBooksSeedCliArgs(argv: readonly string[]): BooksSeedCliArgs {
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

function printNotes(books: readonly BookSeed[]): void {
  // Editorial length bands (SEO-POLICY A1/A2) are NOTES by rule, never failures — printed on every
  // run so they are seen by whoever edits a string, not by an auditor months later.
  for (const note of collectBookSeedNotes(books)) {
    console.log(`[db:seed:books] note — ${note}`);
  }
}

async function runCheck(): Promise<void> {
  const { books, artifact } = await validateBookSeedCorpus();
  printNotes(books);
  console.log(
    `[db:seed:books] check passed — books=${String(books.length)} ` +
      `videos=${String(artifact.videos.length)} questions=${String(artifact.questionCount)}. ` +
      `Nothing was written and no connection was opened.`,
  );
}

async function runSeed(allowRemovals: boolean): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL must be set to run db:seed:books.');
  }

  printNotes(SEED_BOOKS);

  const dataSource = new DataSource(buildDataSourceOptions(databaseUrl));
  await dataSource.initialize();

  try {
    const result = await seedBooks(dataSource, { allowRemovals });
    console.log(
      `[db:seed:books] done — books: inserted=${String(result.books.inserted)} ` +
        `updated=${String(result.books.updated)} unchanged=${String(result.books.unchanged)}; ` +
        `videos: inserted=${String(result.videos.inserted)} updated=${String(result.videos.updated)} ` +
        `unchanged=${String(result.videos.unchanged)} removed=${String(result.videos.removed)}; ` +
        `questions: inserted=${String(result.questions.inserted)} ` +
        `updated=${String(result.questions.updated)} ` +
        `unchanged=${String(result.questions.unchanged)} removed=${String(result.questions.removed)}`,
    );

    // A destructive run must not be readable as an ordinary one. The counts above are a line an
    // operator scans; this is a sentence they cannot scan past, and it is printed only when rows
    // actually left the published index.
    const removedRows = result.videos.removed + result.questions.removed;
    if (removedRows > 0) {
      console.log(
        `[db:seed:books] THIS RUN DELETED PUBLISHED ROWS — ` +
          `${String(result.videos.removed)} deneme video(s) and ` +
          `${String(result.questions.removed)} question(s) are gone from the index, authorised by ` +
          `--allow-removals. If that was not intended, restore the artefact and re-seed.`,
      );
    }
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

  await runSeed(args.allowRemovals);
}

// Only run when this file IS the entry point: importing it (`books.cli.spec.ts` reaches
// `parseBooksSeedCliArgs` this way) must not execute `main()` against Jest's own argv — the
// `era5.cli.ts` precedent.
if (require.main === module) {
  main().catch((error: unknown) => {
    console.error('[db:seed:books] failed:', error);
    // exitCode (not process.exit) so buffered stdio flushes before exit.
    process.exitCode = 1;
  });
}
