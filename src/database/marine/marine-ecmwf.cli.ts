import { join } from 'node:path';
import { runEcmwfProbePhase } from './probe-marine-ecmwf';

/**
 * CLI for `pnpm db:import:marine-ecmwf --phase=probe` (run against the COMPILED build, like every
 * other import CLI here).
 *
 * ## Only ONE phase exists today, and the flag is still mandatory
 * The M1 tool has `probe` and `load`; this one has `probe` alone, because there is nothing to
 * load: M3a stores nothing. The scheduled ingest and the tables it writes to land in M3b, and
 * when they do the second phase joins this CLI rather than replacing the flag.
 *
 * The flag stays required in the meantime. Defaulting it would be the same footgun the M1 tool
 * documented from the other side: a default of `probe` puts a network call in whatever script
 * forgets the argument, and a default of anything else makes a typo silently skip the probe.
 */

const ARTIFACT_DIR = join(process.cwd(), 'data', 'marine');

export type EcmwfPhase = 'probe';

export function parseEcmwfPhase(argv: readonly string[]): EcmwfPhase {
  const flag = argv.find((arg) => arg.startsWith('--phase='));
  const value = flag?.slice('--phase='.length);
  if (value === 'probe') return value;
  if (value === 'load') {
    throw new Error(
      'The load phase does not exist yet: M3a decodes and records evidence, it stores nothing. ' +
        'Persistence and the scheduled ingest land in M3b.',
    );
  }
  throw new Error(
    `Usage: pnpm db:import:marine-ecmwf --phase=probe (got ${JSON.stringify(value ?? '')})`,
  );
}

async function main(): Promise<void> {
  parseEcmwfPhase(process.argv.slice(2));

  console.log(
    '[db:import:marine-ecmwf] probe phase — 5 serial requests to data.ecmwf.int (2 sidecar ' +
      'indexes + 3 byte ranges), 2 s apart, 60 s timeout, identifying User-Agent. Downloads ' +
      '~3.3 MB and touches no database.',
  );
  await runEcmwfProbePhase({ outputDir: ARTIFACT_DIR });
}

// Only run when this file IS the entry point: importing it (the unit spec reaches `parseEcmwfPhase`
// this way) must not execute `main()` against Jest's own argv.
if (require.main === module) {
  main().catch((error: unknown) => {
    console.error('[db:import:marine-ecmwf] failed:', error);
    // exitCode (not process.exit) so buffered stdio flushes before exit.
    process.exitCode = 1;
  });
}
