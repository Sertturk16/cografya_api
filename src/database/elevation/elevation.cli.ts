import { join } from 'node:path';
import {
  runTerrainProbePhase,
  TERRAIN_DEFAULT_BASE_URL,
  TerrainProbeGateError,
  type TerrainProbeArtifact,
} from './probe-terrain-tiles';

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
 * ## The gates, and the two failures an operator must not misread
 * Every gate is evaluated by `evaluateProbeAssertions` and printed PASS/FAIL below; a failure
 * sets a non-zero exit code. Read the exit code, not the counts — the same rule `ENGINEERING.md`
 * §8 sets for the content-fidelity lanes, and for the same reason.
 *
 * - **`attribution pin: DIFFERS`** — the upstream licence document has changed since
 *   `provenance/datasets.md` pinned it. The notices we publish may no longer be the ones we
 *   owe. STOP and escalate to Atlas; this is not a number to re-tune. Note that a document
 *   which could not be FETCHED reports separately and is not this signal.
 * - **an imagery source outside `EXPECTED_SAMPLING_ZOOM_FAMILIES`** — the tile mix has moved
 *   and the attribution set may be incomplete. Same escalation, same reason. This check is now
 *   implemented rather than merely promised: until the #122 review it was described here and
 *   performed nowhere, so the operator was told a check runs that did not run.
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

  // The RUNNER decides whether the run may be trusted, and refuses by throwing — so this
  // entry point cannot forget the check and neither can any programmatic caller (PR-E2 is the
  // obvious one). What is left here is presentation: on a failed run the error carries the
  // artifact, so the operator sees the same per-gate summary either way. The exit code is set
  // from the same fact, not re-derived.
  let artifact: TerrainProbeArtifact;
  try {
    artifact = await runTerrainProbePhase({
      outputPath: ARTIFACT_PATH,
      baseUrl: TERRAIN_DEFAULT_BASE_URL,
    });
  } catch (error: unknown) {
    if (!(error instanceof TerrainProbeGateError)) throw error;
    printSummary(error.artifact);
    console.error(`[db:import:terrain] ${error.message}`);
    process.exitCode = 1;
    return;
  }

  printSummary(artifact);
}

function printSummary(artifact: TerrainProbeArtifact): void {
  const okTiles = artifact.tiles.filter((tile) => tile.httpStatus === 200).length;
  const controls = artifact.points.filter((point) => point.specMeasuredM !== null);

  console.log(
    [
      `[db:import:terrain] requests: ${String(artifact.requestCount)}, tiles 200: ${String(okTiles)}`,
      // The ALLOW-LIST line comes first and is the only one labelled as configuration. The
      // flat list used to be printed here under the bare label "imagery sources" — and it
      // contains `etopo1` on every run by design, because the probe walks z8…z13 for the
      // bathymetry check. An operator seeding the tripwire from what the tool printed would
      // have whitelisted the one family whose absence at z12 IS the licence argument
      // (review #122, CODE122-I3 / SFH122-I3).
      `[db:import:terrain] imagery sources @z${String(artifact.zoom)} (ALLOW-LIST CANDIDATE): ${
        artifact.samplingZoomSourceTokens.join(', ') || '(none reported)'
      }`,
      `[db:import:terrain] imagery sources, all probed zooms (CONTEXT ONLY — contains etopo1 ` +
        `by design): ${artifact.imagerySourceTokens.join(', ') || '(none reported)'}`,
      `[db:import:terrain] decoder control vs the independent measurement: ${
        controls
          .map(
            (point) =>
              `${point.label} ${point.differenceM === null ? 'n/a' : `${String(point.differenceM)} m`}`,
          )
          .join(' · ') || '(no control point resolved)'
      }`,
      `[db:import:terrain] attribution pin: ${
        artifact.attribution === null
          ? `NOT FETCHED (${artifact.attributionError ?? 'no reason recorded'}) — this is NOT a licence change`
          : artifact.attribution.matchesPin
            ? 'matches'
            : 'DIFFERS — STOP and escalate'
      }`,
      `[db:import:terrain] artifact: ${ARTIFACT_PATH}`,
      '',
      '[db:import:terrain] gates:',
      ...artifact.assertions.map(
        (assertion) =>
          `  ${assertion.passed ? 'PASS' : 'FAIL'}  ${assertion.name} — ${assertion.detail}`,
      ),
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
