import { existsSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from '../data-source-options';
import { runAcagFetch } from './acag-fetch';
import { loadAcagPm25 } from './acag-load';

/**
 * CLI for `pnpm db:import:acag` (run against the COMPILED build, like every other import CLI).
 *
 * ```
 * pnpm db:import:acag --phase=fetch --raw-dir=/absolute/path [--from-dir] [--keep-raw]
 * pnpm db:import:acag --phase=load
 * ```
 *
 * ## `--phase` is MANDATORY, with no default
 * The same reason every import CLI here says so: a default of `fetch` puts ~12 GB of network
 * traffic in whatever script forgets the argument, and any other default makes a typo silently
 * skip the work.
 *
 * ## The two phases are never collapsed (ENGINEERING §5)
 * `fetch` is the only one that touches the network. It is hand-run (once a year, when ACAG
 * publishes a new year — there is no scheduler, no cron and no polling on this line), and it
 * writes the committed, reviewable artifacts in `data/acag-pm25/`. `load` is offline,
 * deterministic and idempotent, reads ONLY those artifacts, and is the only phase CI or a
 * deployment may run.
 *
 * ## Which flags belong to which phase, and why that is enforced
 * `--raw-dir` is MANDATORY and must be ABSOLUTE for `fetch`: the raw annual files are ~450 MB
 * each and must never come near the repo, so requiring an explicit absolute path means nobody
 * gets them inside it by forgetting a flag (`.gitignore` carries a `*.nc` belt for the operator
 * who points `--raw-dir` here deliberately). `load` never sees a raw file, so it does NOT take
 * `--raw-dir` — it takes `DATABASE_URL` from the environment and says so by name when absent,
 * rather than failing somewhere inside TypeORM. A flag belonging to the other phase is REFUSED
 * rather than ignored: silently accepting a flag that does nothing is how an operator concludes
 * the run did something it did not.
 *
 * ## `--from-dir` is the offline re-run
 * With the raw files already in `--raw-dir`, the whole decode/extract/gate half runs with zero
 * network calls — the `--from-file` idea from the ERA5 line, widened to a corpus of 27.
 */

const ARTIFACT_DIR = join(process.cwd(), 'data', 'acag-pm25');

const USAGE =
  'Usage: pnpm db:import:acag --phase=fetch --raw-dir=<absolute path> [--from-dir] [--keep-raw] ' +
  '| pnpm db:import:acag --phase=load';

export interface AcagFetchCliArgs {
  phase: 'fetch';
  rawDir: string;
  fromDir: boolean;
  keepRaw: boolean;
}

export interface AcagLoadCliArgs {
  phase: 'load';
}

export type AcagCliArgs = AcagFetchCliArgs | AcagLoadCliArgs;

function readFlag(argv: readonly string[], name: string): string | null {
  const prefix = `--${name}=`;
  const match = argv.find((entry) => entry.startsWith(prefix));
  return match === undefined ? null : match.slice(prefix.length);
}

function hasFlag(argv: readonly string[], name: string): boolean {
  return argv.includes(`--${name}`);
}

/** Flags each phase understands: `--name=value` and bare `--name` respectively. */
const VALUE_FLAGS: Record<'fetch' | 'load', readonly string[]> = {
  fetch: ['phase', 'raw-dir'],
  load: ['phase'],
};
const BARE_FLAGS: Record<'fetch' | 'load', readonly string[]> = {
  fetch: ['from-dir', 'keep-raw'],
  load: [],
};

/**
 * Refuse anything the resolved phase does not understand (review CODE123-M4 / SFH123-M2).
 *
 * This file's stated principle is that a flag belonging to the other phase is REFUSED rather than
 * ignored, "because silently accepting a flag that does nothing is how an operator concludes the
 * run did something it did not" — and unknown or mis-shaped flags were nonetheless ignored
 * silently. The shapes matter here because the two forms are mixed on one command line:
 * `--phase=` and `--raw-dir=` train the operator on `key=value`, so `--keep-raw=true` is the
 * natural thing to type — and it used to parse as `keepRaw: false`, running the full ~70 minute /
 * 12 GB download and then deleting all 27 raw files the operator had explicitly asked to keep.
 */
function assertNoUnknownFlags(argv: readonly string[], phase: 'fetch' | 'load'): void {
  const valueFlags = VALUE_FLAGS[phase];
  const bareFlags = BARE_FLAGS[phase];
  for (const entry of argv) {
    if (!entry.startsWith('--')) {
      throw new Error(`unexpected argument ${JSON.stringify(entry)}. ${USAGE}`);
    }
    const [rawName] = entry.slice(2).split('=');
    const name = rawName ?? '';
    const hasValue = entry.includes('=');
    if (hasValue && valueFlags.includes(name)) continue;
    if (!hasValue && bareFlags.includes(name)) continue;
    if (hasValue && bareFlags.includes(name)) {
      throw new Error(
        `--${name} is a bare flag and takes no value (got ${JSON.stringify(entry)}). ` +
          `Pass --${name} on its own. ${USAGE}`,
      );
    }
    if (!hasValue && valueFlags.includes(name)) {
      throw new Error(`--${name} requires a value in the form --${name}=<value>. ${USAGE}`);
    }
    throw new Error(`unknown flag ${JSON.stringify(entry)} for --phase=${phase}. ${USAGE}`);
  }
}

export function parseAcagCliArgs(argv: readonly string[]): AcagCliArgs {
  const phase = readFlag(argv, 'phase');

  if (phase === 'load') {
    if (readFlag(argv, 'raw-dir') !== null) {
      throw new Error(
        `--raw-dir belongs to --phase=fetch only; the load phase never reads a raw .nc. ${USAGE}`,
      );
    }
    if (hasFlag(argv, 'from-dir') || hasFlag(argv, 'keep-raw')) {
      throw new Error(
        `--from-dir/--keep-raw belong to --phase=fetch only; the load phase reads the COMMITTED ` +
          `artifacts in data/acag-pm25/. ${USAGE}`,
      );
    }
    assertNoUnknownFlags(argv, 'load');
    return { phase };
  }

  if (phase !== 'fetch') {
    throw new Error(`${USAGE} (got --phase=${JSON.stringify(phase ?? '')})`);
  }
  assertNoUnknownFlags(argv, 'fetch');

  const rawDir = readFlag(argv, 'raw-dir');
  if (rawDir === null || rawDir === '') {
    throw new Error(
      `--raw-dir is mandatory: each annual file is ~450 MB and must never land in the repo. ` +
        USAGE,
    );
  }
  if (!isAbsolute(rawDir)) {
    throw new Error(`--raw-dir must be an ABSOLUTE path (got ${JSON.stringify(rawDir)}). ${USAGE}`);
  }

  const fromDir = hasFlag(argv, 'from-dir');
  if (fromDir && !existsSync(rawDir)) {
    throw new Error(
      `--from-dir was given but ${rawDir} does not exist; the offline re-run needs the raw files ` +
        'already on disk.',
    );
  }

  return { phase, rawDir, fromDir, keepRaw: hasFlag(argv, 'keep-raw') };
}

async function runLoad(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL must be set to run db:import:acag --phase=load.');
  }

  const dataSource = new DataSource(buildDataSourceOptions(databaseUrl));
  await dataSource.initialize();

  try {
    const result = await loadAcagPm25(dataSource, { inputDir: ARTIFACT_DIR });
    console.log(
      `[db:import:acag] load done — updated=${String(result.updated)} ` +
        `unchanged=${String(result.unchanged)}`,
    );
  } finally {
    // Nested try so a teardown failure is logged but never MASKS the original error.
    try {
      await dataSource.destroy();
    } catch (destroyError) {
      console.error('[db:import:acag] failed to close the data source:', destroyError);
    }
  }
}

async function main(): Promise<void> {
  const args = parseAcagCliArgs(process.argv.slice(2));

  if (args.phase === 'load') {
    console.log(
      '[db:import:acag] load phase — writing the COMMITTED artifacts in data/acag-pm25/ into ' +
        'provinces.pm25_annual. Zero network calls; idempotent (an unchanged province is not ' +
        'written, so its updated_at and the sitemap lastmod stay honest).',
    );
    await runLoad();
    return;
  }

  console.log(
    args.fromDir
      ? '[db:import:acag] fetch phase, --from-dir — decoding raw files already on disk. Zero ' +
          'network calls, zero database writes.'
      : '[db:import:acag] fetch phase — 27 annual GLOBAL files, serial and spaced. Each is ' +
          'downloaded, hashed, windowed, extracted and then DELETED, so peak disk is one file. ' +
          'Touches no database; CI never runs this.',
  );
  const result = await runAcagFetch({
    rawDir: args.rawDir,
    outputDir: ARTIFACT_DIR,
    fromDir: args.fromDir,
    keepRaw: args.keepRaw,
    log: (message: string) => {
      console.log(message);
    },
  });
  console.log(
    `[db:import:acag] fetch done — ${String(result.series.provinces.length)} province(s) × ` +
      `${String(result.series.years.length)} year(s); artifacts written to ${result.manifestPath} ` +
      `and ${result.seriesPath}`,
  );
}

// Only run when this file IS the entry point: importing it (the unit spec reaches
// `parseAcagCliArgs` this way) must not execute `main()` against Jest's own argv.
if (require.main === module) {
  main().catch((error: unknown) => {
    console.error('[db:import:acag] failed:', error);
    // exitCode (not process.exit) so buffered stdio flushes before exit.
    process.exitCode = 1;
  });
}
