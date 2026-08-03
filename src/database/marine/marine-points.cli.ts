import { join } from 'node:path';
import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from '../data-source-options';
import { loadMarinePoints } from './load-marine-points';
import { runProbePhase } from './probe-marine-points';

/**
 * CLI for `pnpm db:import:marine-points --phase=probe|load` (run against the COMPILED build,
 * like the seed, migration and ERA5 CLIs).
 *
 * Two phases, deliberately separate — the `db:import:era5` discipline applied to a second
 * data source:
 *   - `probe` — the only phase that touches the network. ~86 polite requests to Copernicus
 *     Marine + Open-Meteo, validated against the hardened acceptance criteria, written to a
 *     committed, reviewable artifact. Run BY HAND. Never in CI.
 *   - `load`  — reads the committed artifact, re-derives every verdict offline, and upserts.
 *     Deterministic and idempotent, and the only phase CI or a deployment may run.
 *
 * The phase is mandatory and has NO default: defaulting either way is a footgun (a default of
 * `probe` would put a network call in a deploy script; a default of `load` would make a
 * mistyped flag silently skip the probe).
 */

const ARTIFACT_DIR = join(process.cwd(), 'data', 'marine');

export type Phase = 'probe' | 'load';

export function parsePhase(argv: readonly string[]): Phase {
  const flag = argv.find((arg) => arg.startsWith('--phase='));
  const value = flag?.slice('--phase='.length);
  if (value === 'probe' || value === 'load') return value;
  throw new Error(
    `Usage: pnpm db:import:marine-points --phase=probe|load (got ${JSON.stringify(value ?? '')})`,
  );
}

async function runLoad(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL must be set to run db:import:marine-points --phase=load.');
  }

  const dataSource = new DataSource(buildDataSourceOptions(databaseUrl));
  await dataSource.initialize();

  try {
    const result = await loadMarinePoints(dataSource, { inputDir: ARTIFACT_DIR });
    console.log(
      `[db:import:marine-points] load done — inserted=${String(result.inserted)} ` +
        `updated=${String(result.updated)} unchanged=${String(result.unchanged)} ` +
        `removed=${String(result.removed)}`,
    );
  } finally {
    // Nested try so a teardown failure is logged but never MASKS the original error
    // (mirrors `geography.cli.ts` and `era5.cli.ts`).
    try {
      await dataSource.destroy();
    } catch (destroyError) {
      console.error('[db:import:marine-points] failed to close the data source:', destroyError);
    }
  }
}

async function main(): Promise<void> {
  const phase = parsePhase(process.argv.slice(2));

  if (phase === 'probe') {
    console.log(
      '[db:import:marine-points] probe phase — serial requests to Copernicus Marine and ' +
        'Open-Meteo, ≥2.5 s apart, 20 s timeout, identifying User-Agent. Budget ~5 minutes. ' +
        'This phase never touches the database.',
    );
    await runProbePhase({ outputDir: ARTIFACT_DIR });
    return;
  }

  await runLoad();
}

// Only run when this file IS the entry point. Without the guard, merely importing the module —
// which the unit spec does to reach `parsePhase` — would execute `main()` against Jest's own
// argv, fail to parse a phase, and set a non-zero exit code on an otherwise green run. A CLI
// module that fires on import is a footgun regardless of who imports it.
if (require.main === module) {
  main().catch((error: unknown) => {
    console.error('[db:import:marine-points] failed:', error);
    // exitCode (not process.exit) so buffered stdio flushes before exit.
    process.exitCode = 1;
  });
}
