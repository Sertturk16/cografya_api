import { isAbsolute, join } from 'node:path';
import { DataSource } from 'typeorm';
import { parseAfadEventsBody } from '../../earthquake/afad/afad-event.parse';
import { toAfadQueryStamp } from '../../earthquake/afad/afad-time';
import { EarthquakeIngestStore } from '../../earthquake/earthquake-ingest.store';
import { buildEarthquakeRow } from '../../earthquake/earthquake-row';
import { UPSTREAM_USER_AGENT } from '../../upstream/upstream-http.helpers';
import { buildDataSourceOptions } from '../data-source-options';
import { generateTrScopeBoundary } from './generate-tr-scope-boundary';
import { runEarthquakeProbePhase } from './probe-earthquake-afad';

/**
 * CLI for `pnpm db:import:earthquakes` — run against the COMPILED build, like every other import
 * CLI in this repo.
 *
 * ```
 * pnpm db:import:earthquakes --phase=probe
 * pnpm db:import:earthquakes --phase=boundary --source=<absolute path to world-countries.geojson>
 * pnpm db:import:earthquakes --phase=backfill --from=2025-08-17 --to=2026-08-17 [--chunk-days=7]
 * ```
 *
 * ## `--phase` is MANDATORY, with no default
 * The marine/air-quality/era5 precedent, for the same reason: a default of `probe` puts a network
 * call in whatever script forgets the argument, and any other default makes a typo silently skip
 * the phase somebody meant to run.
 *
 * ## None of these three is the scheduled ingest
 * The tours are runtime code inside the API process (`EarthquakeModule`). This CLI is the hand-run
 * half of the two-phase rule: `probe` produces committed evidence, `boundary` regenerates a
 * committed constant, `backfill` is the one-off historical load.
 */

const ARTIFACT_PATH = join(process.cwd(), 'data', 'earthquake', 'afad-probe.json');
const BOUNDARY_OUTPUT = join(
  process.cwd(),
  'src',
  'earthquake',
  'scope',
  'tr-boundary.generated.ts',
);

/** Default API root, matching `AFAD_EVENT_API_BASE_URL`'s default. Overridable per run. */
const DEFAULT_BASE_URL = 'https://servisnet.afad.gov.tr/apigateway/deprem/apiv2';

/** Politeness for the backfill: serial windows, at least this long between calls. */
const BACKFILL_SPACING_MS = 3_000;
const BACKFILL_TIMEOUT_MS = 30_000;
const BACKFILL_SAFETY_LIMIT = 20_000;
const DEFAULT_CHUNK_DAYS = 7;

/** The buffer the backfill classifies with — the same default the boot schema carries. */
const DEFAULT_SCOPE_BUFFER_KM = 200;

export type EarthquakePhase = 'probe' | 'boundary' | 'backfill';

const USAGE =
  'Usage: pnpm db:import:earthquakes --phase=probe | ' +
  '--phase=boundary --source=<absolute path> | ' +
  '--phase=backfill --from=<YYYY-MM-DD> --to=<YYYY-MM-DD> [--chunk-days=7]';

function readFlag(argv: readonly string[], name: string): string | undefined {
  const prefix = `--${name}=`;
  return argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

export function parseEarthquakePhase(argv: readonly string[]): EarthquakePhase {
  const value = readFlag(argv, 'phase');
  if (value === 'probe' || value === 'boundary' || value === 'backfill') return value;
  throw new Error(`${USAGE} (got --phase=${JSON.stringify(value ?? '')})`);
}

/** `YYYY-MM-DD` → the day's UTC midnight, or `null`. Deliberately strict: no locale parsing. */
export function parseIsoDay(value: string | undefined): Date | null {
  if (value === undefined || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const phase = parseEarthquakePhase(argv);

  if (phase === 'probe') {
    const artifact = await runEarthquakeProbePhase({
      baseUrl: readFlag(argv, 'base-url') ?? DEFAULT_BASE_URL,
      artifactPath: ARTIFACT_PATH,
    });
    console.log(
      `probe done — ${String(artifact.requests.length)} request(s), artifact written to ${ARTIFACT_PATH}`,
    );
    return;
  }

  if (phase === 'boundary') {
    const source = readFlag(argv, 'source');
    if (source === undefined || !isAbsolute(source)) {
      throw new Error(
        `${USAGE}\n--source must be an ABSOLUTE path to the Natural Earth world-countries snapshot ` +
          '(it lives in the sibling web repo, which this repo only ever READS).',
      );
    }
    const result = generateTrScopeBoundary({
      sourcePath: source,
      outputPath: BOUNDARY_OUTPUT,
      sourceLabel: 'cografya_web/data/world-countries.geojson',
    });
    console.log(
      `boundary regenerated — ${String(result.ringCount)} ring(s), ` +
        `${String(result.vertexCount)} vertices, source sha256 ${result.sourceSha256}`,
    );
    return;
  }

  await runBackfill(argv);
}

/**
 * The one-off historical load (D-A: a permanent archive, first load one year).
 *
 * ## Why it is a hand-run CLI and not a tour
 * A year is ~33 000 events — well above `EARTHQUAKE_SAFETY_LIMIT`, so it cannot be one request,
 * and it is not something a scheduled loop should ever decide to do on its own. It is a decision
 * somebody makes once, at go-live, watching it run.
 *
 * ## It writes NO run rows
 * The `earthquake_ingest_runs` ledger answers "when did we last make successful contact", and the
 * freshness the API publishes is derived from it. A hand-run load of 2019's earthquakes is not
 * evidence that the feed is alive today, and writing it there would make the ledger lie in the
 * one direction it exists to prevent.
 *
 * Idempotent by construction: the upsert writes nothing when nothing changed, so a re-run over the
 * same range costs requests and changes no row.
 */
async function runBackfill(argv: readonly string[]): Promise<void> {
  const from = parseIsoDay(readFlag(argv, 'from'));
  const to = parseIsoDay(readFlag(argv, 'to'));
  if (from === null || to === null || from.getTime() >= to.getTime()) {
    throw new Error(`${USAGE}\n--from and --to are mandatory YYYY-MM-DD days, and --from < --to.`);
  }
  const chunkDays = Number(readFlag(argv, 'chunk-days') ?? DEFAULT_CHUNK_DAYS);
  if (!Number.isInteger(chunkDays) || chunkDays < 1 || chunkDays > 30) {
    throw new Error(`${USAGE}\n--chunk-days must be an integer between 1 and 30.`);
  }
  const baseUrl = (readFlag(argv, 'base-url') ?? DEFAULT_BASE_URL).replace(/\/+$/, '');

  // These CLIs run outside Nest's DI, so there is no ConfigService and no `.env` is loaded —
  // `DATABASE_URL` is read straight from the environment (`ENGINEERING.md` §5, the seed rule).
  const databaseUrl = process.env['DATABASE_URL'];
  if (databaseUrl === undefined || databaseUrl === '') {
    throw new Error('DATABASE_URL is not set; the backfill writes to Postgres and cannot proceed.');
  }

  const dataSource = new DataSource(buildDataSourceOptions(databaseUrl));
  await dataSource.initialize();
  try {
    const store = new EarthquakeIngestStore(dataSource);
    const plateCodes = await store.loadProvincePlateCodes();
    if (plateCodes.size === 0) {
      // Refuse rather than write 33 000 rows with no cross-links at all: an empty province table
      // means the geography seed has not run, and the whole load would have to be redone.
      throw new Error('the provinces table is empty — run `pnpm db:seed:geography` first.');
    }

    let inserted = 0;
    let updated = 0;
    let unchanged = 0;
    let rejected = 0;
    let windows = 0;

    for (let cursor = from.getTime(); cursor < to.getTime(); cursor += chunkDays * 86_400_000) {
      if (windows > 0) await new Promise((resolve) => setTimeout(resolve, BACKFILL_SPACING_MS));
      windows += 1;
      const windowStart = new Date(cursor);
      const windowEnd = new Date(Math.min(cursor + chunkDays * 86_400_000, to.getTime()));

      const url =
        `${baseUrl}/event/filter?start=${toAfadQueryStamp(windowStart)}` +
        `&end=${toAfadQueryStamp(windowEnd)}&limit=${String(BACKFILL_SAFETY_LIMIT)}`;
      const response = await fetch(url, {
        headers: { 'User-Agent': UPSTREAM_USER_AGENT, Accept: 'application/json' },
        signal: AbortSignal.timeout(BACKFILL_TIMEOUT_MS),
        redirect: 'error',
      });
      if (!response.ok) {
        throw new Error(
          `backfill stopped at ${toAfadQueryStamp(windowStart)}: HTTP ${String(response.status)}. ` +
            'Nothing already written is lost — re-run from this day.',
        );
      }

      const payload = parseAfadEventsBody(await response.text(), {
        safetyLimit: BACKFILL_SAFETY_LIMIT,
      });
      const writtenAt = new Date();
      for (const event of payload.accepted) {
        const row = buildEarthquakeRow(event, plateCodes, DEFAULT_SCOPE_BUFFER_KM);
        const result = await store.upsertEvent(row, writtenAt);
        if (result.kind === 'inserted') inserted += 1;
        else if (result.kind === 'updated') updated += 1;
        else unchanged += 1;
      }
      rejected += payload.rejected.length;
      console.log(
        `${toAfadQueryStamp(windowStart)} → ${toAfadQueryStamp(windowEnd)}: ` +
          `${String(payload.fetchedCount)} fetched, ${String(payload.rejected.length)} rejected`,
      );
    }

    console.log(
      `backfill done — ${String(windows)} window(s), ${String(inserted)} inserted, ` +
        `${String(updated)} updated, ${String(unchanged)} unchanged, ${String(rejected)} rejected`,
    );
  } finally {
    await dataSource.destroy();
  }
}

// The entry point runs only when this file is the process's main module, so a spec may import the
// parsers above without starting anything.
if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
