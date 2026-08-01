import { isAbsolute, join } from 'node:path';
import { runEra5FetchPhase } from './era5-fetch';

/**
 * CLI for `pnpm db:import:era5` (run against the COMPILED build, like every other import CLI).
 *
 * ```
 * pnpm db:import:era5 --phase=fetch --raw-dir=/absolute/path [--from-file=/absolute/path.nc]
 * ```
 *
 * ## `--phase` is MANDATORY, with no default
 * The climate/marine/air-quality precedent, for the same reason: a default of `fetch` puts a
 * network call in whatever script forgets the argument, and any other default makes a typo
 * silently skip the work.
 *
 * ## `--phase=load` is REFUSED in PR-1, on purpose
 * The load phase (writing `climate_normals`, the contract delta, the MGM teardown) is PR-2's. A
 * CLI that accepts the flag and does nothing is worse than one that says so.
 *
 * ## `--raw-dir` is MANDATORY and must be ABSOLUTE
 * The raw production file is 19 801 767 B and must never be committed. Requiring an explicit
 * absolute path means nobody gets it inside the repo by forgetting a flag — and `.gitignore`
 * carries a belt for the case where somebody points it here deliberately.
 */

const ARTIFACT_DIR = join(process.cwd(), 'data', 'era5-land');
const FIXTURE_DIR = join(process.cwd(), 'test', 'fixtures', 'era5');

export type Era5Phase = 'fetch';

export interface Era5CliArgs {
  phase: Era5Phase;
  rawDir: string;
  fromFile: string | null;
}

const USAGE =
  'Usage: pnpm db:import:era5 --phase=fetch --raw-dir=<absolute path> [--from-file=<absolute path>]';

function readFlag(argv: readonly string[], name: string): string | undefined {
  const prefix = `--${name}=`;
  return argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

export function parseEra5CliArgs(argv: readonly string[]): Era5CliArgs {
  const phase = readFlag(argv, 'phase');
  if (phase === 'load') {
    throw new Error(
      '--phase=load is not implemented in PR-1. The load phase (climate_normals, the contract ' +
        `delta and the MGM teardown) lands in PR-2. ${USAGE}`,
    );
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

async function main(): Promise<void> {
  const args = parseEra5CliArgs(process.argv.slice(2));
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
