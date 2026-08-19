import { join } from 'node:path';
import { runTerrainProbePhase, TERRAIN_DEFAULT_BASE_URL } from './probe-terrain-tiles';

/**
 * CLI for `pnpm db:import:terrain --phase=probe` (run against the COMPILED build, like every
 * import CLI here).
 *
 * ## Only `probe` exists — and no `load` EVER will, by design
 * Nothing this tool touches enters Postgres. The elevation profile is computed on demand from
 * immutable provider tiles and cached; there is no row to seed, no entity, no migration. The
 * artifact exists to make the numbers the endpoint is configured against REVIEWABLE — the
 * deadline, the byte cap, the provider budget and the tripwire's allow-list all point at it.
 *
 * The `--phase` flag stays required even with one legal value (the M1/M3/M4 footgun note): a
 * default of `probe` puts a network call in whatever script forgets the argument.
 *
 * ## The two failure modes an operator must not misread
 * - **`attribution pin: DIFFERS`** — the upstream licence document has changed since
 *   `provenance/datasets.md` pinned it. The notices we publish may no longer be the ones we
 *   owe. STOP and escalate to Atlas; this is not a number to re-tune.
 * - **an imagery source outside the expected families** — the tile mix has moved and the
 *   attribution set may be incomplete. Same escalation, same reason.
 */

const ARTIFACT_PATH = join(process.cwd(), 'data', 'elevation', 'terrain-tiles-probe.json');

export type TerrainPhase = 'probe';

export function parseTerrainPhase(argv: readonly string[]): TerrainPhase {
  const flag = argv.find((argument) => argument.startsWith('--phase='));
  const value = flag?.slice('--phase='.length);
  if (value === 'probe') return value;
  if (value === 'load') {
    throw new Error(
      'There is no load phase, and none is planned: the elevation leg stores nothing in ' +
        'Postgres — profiles are computed on demand from immutable tiles and cached. The ' +
        'runtime half is the endpoint, not an import.',
    );
  }
  throw new Error(
    `Usage: pnpm db:import:terrain --phase=probe (got ${JSON.stringify(value ?? '')})`,
  );
}

async function main(): Promise<void> {
  parseTerrainPhase(process.argv.slice(2));
  console.log(
    '[db:import:terrain] probe phase — a few dozen terrain tiles plus one licence document, ' +
      'serial, 400 ms apart, 30 s timeout each, identifying User-Agent. Anonymous endpoints; ' +
      'touches no database and reads no secret.',
  );

  const artifact = await runTerrainProbePhase({
    outputPath: ARTIFACT_PATH,
    baseUrl: TERRAIN_DEFAULT_BASE_URL,
  });

  const okTiles = artifact.tiles.filter((tile) => tile.httpStatus === 200).length;
  console.log(
    [
      `[db:import:terrain] requests: ${String(artifact.requestCount)}, tiles 200: ${String(okTiles)}`,
      `[db:import:terrain] imagery sources: ${
        artifact.imagerySourceTokens.join(', ') || '(none reported)'
      }`,
      `[db:import:terrain] attribution pin: ${
        artifact.attribution === null
          ? 'NOT FETCHED'
          : artifact.attribution.matchesPin
            ? 'matches'
            : 'DIFFERS — STOP and escalate'
      }`,
      `[db:import:terrain] artifact: ${ARTIFACT_PATH}`,
    ].join('\n'),
  );
}

// Only run when this file IS the entry point: importing it (the unit spec reaches
// `parseTerrainPhase` this way) must not execute `main()` against Jest's own argv.
if (require.main === module) {
  main().catch((error: unknown) => {
    console.error('[db:import:terrain] failed:', error);
    // exitCode (not process.exit) so buffered stdio flushes before exit.
    process.exitCode = 1;
  });
}
