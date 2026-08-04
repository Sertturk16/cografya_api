import { isAbsolute, join } from 'node:path';
import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from '../data-source-options';
import { runEra5FetchPhase } from './era5-fetch';
import { loadEra5ClimateNormals } from './era5-load';

/**
 * CLI for `pnpm db:import:era5` (run against the COMPILED build, like every other import CLI).
 *
 * ```
 * pnpm db:import:era5 --phase=fetch --raw-dir=/absolute/path [--from-file=/absolute/path.nc]
 * pnpm db:import:era5 --phase=load
 * ```
 *
 * ## `--phase` is MANDATORY, with no default
 * The same reason every import CLI in this repo says so: a default of `fetch` puts a network call
 * in whatever script forgets the argument, and any other default makes a typo silently skip the
 * work.
 *
 * ## The two phases are never collapsed (ENGINEERING §5)
 * `fetch` is the only one that touches the network. It is hand-run (roughly once a decade — the
 * WMO window moves in 2031), needs `CDS_API_KEY` from the operator's own shell, and writes the
 * committed, reviewable artifacts. `load` is offline, deterministic and idempotent, reads ONLY
 * those artifacts, and is the only phase CI or a deployment may run. A build that can fail because
 * a provider is down is not a build.
 *
 * ## Which flags belong to which phase, and why that is enforced
 * `--raw-dir` is MANDATORY and must be ABSOLUTE **for `fetch`**: the raw production file is
 * 19 801 767 B and must never be committed, so requiring an explicit absolute path means nobody
 * gets it inside the repo by forgetting a flag (`.gitignore` carries a belt for the case where
 * somebody points it here deliberately). `load` never sees the raw file at all, so it does NOT
 * take `--raw-dir`; it takes `DATABASE_URL` from the environment, and says so by name when it is
 * absent rather than failing somewhere inside TypeORM.
 */

const ARTIFACT_DIR = join(process.cwd(), 'data', 'era5-land');
const FIXTURE_DIR = join(process.cwd(), 'test', 'fixtures', 'era5');

export type Era5Phase = 'fetch' | 'load';

export interface Era5FetchCliArgs {
  phase: 'fetch';
  rawDir: string;
  fromFile: string | null;
}

export interface Era5LoadCliArgs {
  phase: 'load';
}

export type Era5CliArgs = Era5FetchCliArgs | Era5LoadCliArgs;

const USAGE =
  'Usage: pnpm db:import:era5 --phase=fetch --raw-dir=<absolute path> [--from-file=<absolute path>] ' +
  '| pnpm db:import:era5 --phase=load';

function readFlag(argv: readonly string[], name: string): string | undefined {
  const prefix = `--${name}=`;
  return argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

export function parseEra5CliArgs(argv: readonly string[]): Era5CliArgs {
  const phase = readFlag(argv, 'phase');

  if (phase === 'load') {
    // `--raw-dir` is refused rather than ignored: silently accepting a flag that does nothing
    // teaches an operator that it works, and the next person copies the wrong command.
    const strayRawDir = readFlag(argv, 'raw-dir');
    if (strayRawDir !== undefined) {
      throw new Error(
        `--raw-dir belongs to --phase=fetch only; the load phase never reads the raw .nc. ${USAGE}`,
      );
    }
    const strayFromFile = readFlag(argv, 'from-file');
    if (strayFromFile !== undefined) {
      throw new Error(
        `--from-file belongs to --phase=fetch only; the load phase reads the COMMITTED artifacts ` +
          `under data/era5-land/. ${USAGE}`,
      );
    }
    return { phase };
  }

  if (phase !== 'fetch') {
    throw new Error(`${USAGE} (got --phase=${JSON.stringify(phase ?? '')})`);
  }

  const rawDir = readFlag(argv, 'raw-dir');
  if (rawDir === undefined || rawDir.length === 0) {
    throw new Error(
      `--raw-dir is mandatory: the raw file is ~19 MB and must never land in the repo. ${USAGE}`,
    );
  }
  if (!isAbsolute(rawDir)) {
    throw new Error(`--raw-dir must be an ABSOLUTE path (got ${JSON.stringify(rawDir)}). ${USAGE}`);
  }

  const fromFile = readFlag(argv, 'from-file') ?? null;
  if (fromFile !== null && (fromFile.length === 0 || !isAbsolute(fromFile))) {
    throw new Error(
      `--from-file must be an ABSOLUTE path to an existing raw .nc (got ` +
        `${JSON.stringify(fromFile)}). ${USAGE}`,
    );
  }

  return { phase, rawDir, fromFile };
}

async function runLoad(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL must be set to run db:import:era5 --phase=load.');
  }

  const dataSource = new DataSource(buildDataSourceOptions(databaseUrl));
  await dataSource.initialize();

  try {
    const result = await loadEra5ClimateNormals(dataSource, { inputDir: ARTIFACT_DIR });
    console.log(
      `[db:import:era5] load done — updated=${String(result.updated)} ` +
        `unchanged=${String(result.unchanged)}`,
    );
  } finally {
    // Nested try so a teardown failure is logged but never MASKS the original error (the
    // `geography.cli.ts` pattern).
    try {
      await dataSource.destroy();
    } catch (destroyError) {
      console.error('[db:import:era5] failed to close the data source:', destroyError);
    }
  }
}

async function main(): Promise<void> {
  const args = parseEra5CliArgs(process.argv.slice(2));

  if (args.phase === 'load') {
    console.log(
      '[db:import:era5] load phase — deriving the 1991-2020 normals from the COMMITTED artifacts ' +
        'in data/era5-land/ and upserting them. Zero network calls; idempotent (an unchanged ' +
        'province is not written, so its updated_at and the sitemap lastmod stay honest).',
    );
    await runLoad();
    return;
  }

  console.log(
    args.fromFile === null
      ? '[db:import:era5] fetch phase — 2 CDS jobs (production + mini golden fixture), serial and ' +
          'polite, DELETE only after the download verifies. Touches no database; CI never runs this.'
      : '[db:import:era5] fetch phase, --from-file — decoding an existing raw file OFFLINE. Zero ' +
          'network calls, zero database writes.',
  );
  await runEra5FetchPhase({
    rawDir: args.rawDir,
    outputDir: ARTIFACT_DIR,
    fixtureDir: FIXTURE_DIR,
    fromFile: args.fromFile,
  });
}

// Only run when this file IS the entry point: importing it (the unit spec reaches
// `parseEra5CliArgs` this way) must not execute `main()` against Jest's own argv.
if (require.main === module) {
  main().catch((error: unknown) => {
    console.error('[db:import:era5] failed:', error);
    // exitCode (not process.exit) so buffered stdio flushes before exit.
    process.exitCode = 1;
  });
}
