import { join } from 'node:path';
import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from '../data-source-options';
import { loadClimateNormals } from './load-climate';
import { runFetchPhase } from './mgm-fetch';

/**
 * CLI entry for `pnpm db:import:climate --phase=fetch|load` (run against the COMPILED
 * build, like the seed and migration CLIs).
 *
 * Two phases, deliberately separate (PLAN.md §1):
 *   - `fetch` — 81 polite HTTP requests to MGM, parse + validate, write the artifacts.
 *     Run BY HAND, roughly yearly. Never in CI.
 *   - `load`  — read the committed artifacts, validate again, upsert. Offline and
 *     idempotent. The only phase CI or a deployment ever runs.
 *
 * The phase is mandatory and has NO default: defaulting either way is a footgun (a default
 * of `fetch` would put a network call in a deploy script; a default of `load` would make a
 * mistyped flag silently skip the fetch).
 */

const ARTIFACT_DIR = join(process.cwd(), 'data', 'climate');

type Phase = 'fetch' | 'load';

function parsePhase(argv: readonly string[]): Phase {
  const flag = argv.find((arg) => arg.startsWith('--phase='));
  const value = flag?.slice('--phase='.length);
  if (value === 'fetch' || value === 'load') return value;
  throw new Error(
    `Usage: pnpm db:import:climate --phase=fetch|load (got ${JSON.stringify(value ?? '')})`,
  );
}

async function runLoad(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL must be set to run db:import:climate --phase=load.');
  }

  const dataSource = new DataSource(buildDataSourceOptions(databaseUrl));
  await dataSource.initialize();

  try {
    const result = await loadClimateNormals(dataSource, { inputDir: ARTIFACT_DIR });
    console.log(
      `[db:import:climate] load done — updated=${result.updated} unchanged=${result.unchanged}`,
    );
  } finally {
    // Nested try so a teardown failure is logged but never MASKS the original error
    // (mirrors `geography.cli.ts`).
    try {
      await dataSource.destroy();
    } catch (destroyError) {
      console.error('[db:import:climate] failed to close the data source:', destroyError);
    }
  }
}

async function main(): Promise<void> {
  const phase = parsePhase(process.argv.slice(2));

  if (phase === 'fetch') {
    console.log(
      '[db:import:climate] fetch phase — 81 serial requests, ≥3s apart. This takes ~5 minutes.',
    );
    await runFetchPhase({ outputDir: ARTIFACT_DIR });
    return;
  }

  await runLoad();
}

main().catch((error: unknown) => {
  console.error('[db:import:climate] failed:', error);
  // exitCode (not process.exit) so buffered stdio flushes before exit.
  process.exitCode = 1;
});
