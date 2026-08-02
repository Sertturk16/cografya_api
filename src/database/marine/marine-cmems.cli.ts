import { join } from 'node:path';
import { runCmemsProbePhase } from './probe-marine-cmems';

/**
 * CLI for `pnpm db:import:marine-cmems --phase=probe` (run against the COMPILED build, like
 * every import CLI here).
 *
 * ## Only `probe` exists — and no `load` EVER will, by design
 * The M1 tool has `probe` + `load` because its output seeds Postgres rows. This leg stores
 * NOTHING in Postgres: the M4 architecture is Redis-only (plan §4.2 — regenerating the full
 * value set costs 78 cheap calls ≈ tens of seconds, so a persistent store would protect data
 * cheaper to re-earn than to migrate). The runtime half is the M4b warmup target; this tool
 * exists solely to produce the committed evidence artifact and the 400-XML fixture.
 *
 * The flag stays required anyway (the M1/M3 footgun note): a default of `probe` puts a
 * network call in whatever script forgets the argument.
 */

const ARTIFACT_DIR = join(process.cwd(), 'data', 'marine');
const FIXTURE_DIR = join(process.cwd(), 'test', 'fixtures', 'cmems');

export type CmemsPhase = 'probe';

export function parseCmemsPhase(argv: readonly string[]): CmemsPhase {
  const flag = argv.find((arg) => arg.startsWith('--phase='));
  const value = flag?.slice('--phase='.length);
  if (value === 'probe') return value;
  if (value === 'load') {
    throw new Error(
      'There is no load phase, and none is planned: M4 stores CMEMS values in Redis only ' +
        '(plan §4.2 — re-warming costs 78 cheap calls). The runtime is the M4b warmup target.',
    );
  }
  throw new Error(
    `Usage: pnpm db:import:marine-cmems --phase=probe (got ${JSON.stringify(value ?? '')})`,
  );
}

async function main(): Promise<void> {
  parseCmemsPhase(process.argv.slice(2));
  console.log(
    '[db:import:marine-cmems] probe phase — 4 STAC documents, 1 licence page, 78 GetFeatureInfo ' +
      'calls and 1 deliberate out-of-extent call, serial, ≥2.5 s apart, identifying User-Agent. ' +
      'Anonymous endpoints; touches no database. Budget ~4 minutes.',
  );
  await runCmemsProbePhase({ outputDir: ARTIFACT_DIR, fixtureDir: FIXTURE_DIR });
}

// Only run when this file IS the entry point: importing it (the unit spec reaches
// `parseCmemsPhase` this way) must not execute `main()` against Jest's own argv.
if (require.main === module) {
  main().catch((error: unknown) => {
    console.error('[db:import:marine-cmems] failed:', error);
    // exitCode (not process.exit) so buffered stdio flushes before exit.
    process.exitCode = 1;
  });
}
