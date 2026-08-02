import { isAbsolute, join } from 'node:path';
import { runAirQualityProbePhase } from './probe-air-quality';

/**
 * CLI for `pnpm db:import:air-quality` (run against the COMPILED build, like every other import
 * CLI here).
 *
 * ```
 * pnpm db:import:air-quality --phase=probe --raw-dir=/absolute/path [--from-file=/absolute/path.zip]
 * ```
 *
 * ## `--phase` is MANDATORY, with no default
 * The climate/marine/era5 precedent, for the same reason: a default of `probe` puts a network
 * call in whatever script forgets the argument, and any other default makes a typo silently
 * skip the probe. The scheduled ingest and its state machine are runtime code, not a CLI phase.
 *
 * ## `--raw-dir` is MANDATORY and must be ABSOLUTE
 * One pass downloads ~32 MiB of archives (forecast + analysis + mini). None of it may ever land
 * in the repo, so there is no default that could put it there by accident — the ERA5 PR-1 rule,
 * adopted here with the A2a probe extension.
 *
 * ## `--from-file` re-derives the artifact OFFLINE
 * `--from-file=<absolute path to the forecast archive>` decodes an archive already on disk and
 * rewrites the evidence artifact with ZERO network calls and ZERO ADS jobs. The analysis
 * archive is picked up as a sibling under its fixed name when present. This is what makes the
 * committed evidence reproducible after a decoder change without asking the provider for a
 * DIFFERENT day's data (which would no longer be the same measurement).
 */

const ARTIFACT_DIR = join(process.cwd(), 'data', 'air-quality');

export type AirQualityPhase = 'probe';

export interface AirQualityCliArgs {
  phase: AirQualityPhase;
  rawDir: string;
  fromFile: string | null;
}

const USAGE =
  'Usage: pnpm db:import:air-quality --phase=probe --raw-dir=<absolute path> ' +
  '[--from-file=<absolute path>]';

function readFlag(argv: readonly string[], name: string): string | undefined {
  const prefix = `--${name}=`;
  return argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

export function parseAirQualityPhase(argv: readonly string[]): AirQualityPhase {
  const value = readFlag(argv, 'phase');
  if (value === 'probe') return value;
  throw new Error(`${USAGE} (got --phase=${JSON.stringify(value ?? '')})`);
}

export function parseAirQualityCliArgs(argv: readonly string[]): AirQualityCliArgs {
  const phase = parseAirQualityPhase(argv);

  const rawDir = readFlag(argv, 'raw-dir');
  if (rawDir === undefined || rawDir.length === 0) {
    throw new Error(
      `--raw-dir is mandatory: one pass downloads ~32 MiB of archives that must never land in ` +
        `the repo. ${USAGE}`,
    );
  }
  if (!isAbsolute(rawDir)) {
    throw new Error(`--raw-dir must be an ABSOLUTE path (got ${JSON.stringify(rawDir)}). ${USAGE}`);
  }

  const fromFile = readFlag(argv, 'from-file') ?? null;
  if (fromFile !== null && (fromFile.length === 0 || !isAbsolute(fromFile))) {
    throw new Error(
      `--from-file must be an ABSOLUTE path to an existing raw archive (got ` +
        `${JSON.stringify(fromFile)}). ${USAGE}`,
    );
  }

  return { phase, rawDir, fromFile };
}

async function main(): Promise<void> {
  const args = parseAirQualityCliArgs(process.argv.slice(2));
  console.log(
    args.fromFile === null
      ? '[db:import:air-quality] probe phase — 3 ADS jobs (forecast D, analysis D−1, mini ' +
          'fixture) plus one GET /jobs measurement, serial and polite, DELETE after download. ' +
          'Touches no database; CI never runs this.'
      : '[db:import:air-quality] probe phase, --from-file — re-deriving the evidence artifact ' +
          'OFFLINE from an existing raw archive. Zero network calls, zero database writes.',
  );
  await runAirQualityProbePhase({
    outputDir: ARTIFACT_DIR,
    rawDir: args.rawDir,
    fromFile: args.fromFile,
  });
}

// Only run when this file IS the entry point: importing it (the unit spec reaches
// `parseAirQualityCliArgs` this way) must not execute `main()` against Jest's own argv.
if (require.main === module) {
  main().catch((error: unknown) => {
    console.error('[db:import:air-quality] failed:', error);
    // exitCode (not process.exit) so buffered stdio flushes before exit.
    process.exitCode = 1;
  });
}
