import { join } from 'node:path';
import { runAirQualityProbePhase } from './probe-air-quality';

/**
 * CLI for `pnpm db:import:air-quality --phase=probe` (run against the COMPILED build, like
 * every other import CLI here).
 *
 * Only the `probe` phase exists in A1, and the flag is still MANDATORY — the same reasoning
 * as `marine-ecmwf.cli.ts`: a default of `probe` puts a network call in whatever script
 * forgets the argument, and any other default makes a typo silently skip the probe. The
 * scheduled ingest and its state machine land in A2 as runtime code, not as a CLI phase.
 */

const ARTIFACT_DIR = join(process.cwd(), 'data', 'air-quality');
const FIXTURE_DIR = join(process.cwd(), 'test', 'fixtures', 'cams');

export type AirQualityPhase = 'probe';

export function parseAirQualityPhase(argv: readonly string[]): AirQualityPhase {
  const flag = argv.find((arg) => arg.startsWith('--phase='));
  const value = flag?.slice('--phase='.length);
  if (value === 'probe') return value;
  throw new Error(
    `Usage: pnpm db:import:air-quality --phase=probe (got ${JSON.stringify(value ?? '')})`,
  );
}

async function main(): Promise<void> {
  parseAirQualityPhase(process.argv.slice(2));
  console.log(
    '[db:import:air-quality] probe phase — 2 ADS jobs (production shape + mini fixture), ' +
      'serial and polite, DELETE after download. Touches no database; CI never runs this.',
  );
  await runAirQualityProbePhase({ outputDir: ARTIFACT_DIR, fixtureDir: FIXTURE_DIR });
}

// Only run when this file IS the entry point: importing it (the unit spec reaches
// `parseAirQualityPhase` this way) must not execute `main()` against Jest's own argv.
if (require.main === module) {
  main().catch((error: unknown) => {
    console.error('[db:import:air-quality] failed:', error);
    // exitCode (not process.exit) so buffered stdio flushes before exit.
    process.exitCode = 1;
  });
}
