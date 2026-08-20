import { isAbsolute, join } from 'node:path';
import { DataSource } from 'typeorm';
import { describeError, describeErrorWithName } from '../../common/describe-error';
import { parseAfadEventsBody } from '../../earthquake/afad/afad-event.parse';
import { quoteProviderText } from '../../earthquake/afad/afad-log-safe';
import { toAfadQueryStamp } from '../../earthquake/afad/afad-time';
import {
  EarthquakeIngestStore,
  type RecordRunInput,
} from '../../earthquake/earthquake-ingest.store';
import { buildEarthquakeRow } from '../../earthquake/earthquake-row';
import { EarthquakeIngestJobKind } from '../../earthquake/earthquake.types';
import { readBodyCapped, UPSTREAM_USER_AGENT } from '../../upstream/upstream-http.helpers';
import type { UpstreamOutcomeKind } from '../../upstream/upstream.types';
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
const DEFAULT_CHUNK_DAYS = 7;

/**
 * Byte ceiling for one backfill window's response.
 *
 * `AbortSignal.timeout` bounds TIME, not payload, so without this a provider malfunction answering
 * fast and forever buffers into the CLI's heap until the process dies mid-load. Every sibling
 * hand-run tool caps, and the recorded precedent (review #75, restated in `probe-air-quality.ts`)
 * is that response byte metering is the one runtime primitive a hand-run tool may NOT re-implement
 * or drop — so this reuses `readBodyCapped` rather than owning a copy (review #118 SEC118-M2).
 *
 * 16 MiB is derived from the ceiling the safety limit already imposes: a window carries at most
 * `EARTHQUAKE_SAFETY_LIMIT` rows, and the measured 7-day / 630-row window was ~203 KB, i.e. ~330 B
 * a row — so 20 000 rows is ~6.6 MB and 16 MiB sits comfortably above anything the parser would
 * accept anyway.
 */
const BACKFILL_MAX_RESPONSE_BYTES = 16 * 1024 * 1024;

/**
 * Fallbacks that MUST equal `src/config/env.schema.ts`'s — asserted in `earthquake.cli.spec.ts`.
 *
 * They are fallbacks, not the value: the effective numbers are read from the environment below.
 */
export const DEFAULT_SCOPE_BUFFER_KM = 200;
export const DEFAULT_SAFETY_LIMIT = 20_000;
export const DEFAULT_STALE_MAX_SECONDS = 10_800;

export type EarthquakePhase = 'probe' | 'boundary' | 'backfill';

/** What one backfill did, accumulated across its windows. */
export interface BackfillTally {
  readonly windows: number;
  readonly fetched: number;
  readonly inserted: number;
  readonly updated: number;
  readonly unchanged: number;
  readonly rejected: number;
  /** Rows written with `in_scope = false` — stored, and servable on no public path. */
  readonly skippedOutOfScope: number;
}

/** The loop's own view of {@link BackfillTally}. Only `runBackfill` holds one. */
type MutableBackfillTally = { -readonly [K in keyof BackfillTally]: BackfillTally[K] };

/**
 * Turn a finished (or abandoned) load into its `earthquake_ingest_runs` row.
 *
 * Pure and exported so the ledger's SEMANTICS are unit-testable without a database or a provider
 * — the write itself goes through `EarthquakeIngestStore.recordRun`, which the ingest e2e already
 * exercises against real Postgres.
 *
 * ## Three outcomes, and only one of them anchors published freshness
 * The read path treats a row as the freshness anchor when `outcome = 'ok'` AND
 * `error_reason IS NULL` (`EarthquakeReadStore.newestSuccessfulRunFinishedAt`), so this function
 * has to agree with `EarthquakeIngestTarget.diagnoseTour` about what those two columns mean:
 *
 * - **The load finished and rows reached the store** → `ok`, no reason. This is the row that makes
 *   the store's freshness honest right after the historical load (`FU-E2-BACKFILL-RUNROW`).
 * - **The load finished, the provider returned rows, and NOT ONE reached the store** → `ok` with a
 *   reason. The CALL succeeded, which is what the outcome word describes; what is missing is any
 *   durable trace of why nothing landed, and a clean `ok` there would let a broken parser refresh
 *   the anchor forever (review #121 SFH121-I1, the same shape).
 * - **The load stopped part-way** → `transient` plus the message. `transient` rather than a finer
 *   kind because the load aborts on HTTP failures, byte-cap refusals, schema errors and database
 *   errors alike, and this function cannot tell them apart from the message; guessing a kind would
 *   put a false statement about AFAD's health into the ledger. It is not `ok`, so it anchors
 *   nothing either way — which is the property that actually matters.
 *
 * A load whose provider returned NOTHING at all (`fetched === 0`) is left as a clean `ok`: an
 * empty historical range is a fact about the range, not a fault, and the scheduled tours' own
 * `fetchedCount === 0` question is a separate open follow-up rather than something to answer
 * differently in two places.
 *
 * ## A load can succeed and still be the wrong thing to anchor freshness on
 * The ledger's unit is CONTACT, and by that unit a historical repair run at 09:00 today really did
 * reach AFAD at 09:00 today. But the value the read path derives from that row is published as
 * DATA freshness — `EarthquakeMetaDto.dataUpdatedAtUtc`, and `dataStatus` on top of it — and the
 * two coincide only because a TOUR always asks for a window ending now. A backfill's window is
 * whatever the operator typed. `--from=2025-11-01 --to=2025-12-01`, run to repair an archive gap
 * while the scheduled ingest has been failing for two days, would otherwise flip the public pages
 * from an honest `stale` to `ok` with `dataUpdatedAtUtc` = now — over a list frozen two days ago,
 * for the whole freshness budget plus a CDN hour (review #125 SFH125-I1; the shape SFH121-I1 and
 * the `pruneRuns` anchor divergence already fixed twice on the read side).
 *
 * So a completed load whose window ENDS more than `staleMaxSeconds` before it FINISHED keeps
 * `outcome: 'ok'` — the call did succeed, which is what the outcome word describes — and carries a
 * reason. That is the same discriminator the anchor query already excludes on, so it needs no
 * migration and no read-side change: the row records contact, and says in the one column a reader
 * and the query both see that it does not claim current coverage.
 */
export function buildBackfillRunInput(input: {
  readonly startedAtUtc: Date;
  readonly finishedAtUtc: Date;
  readonly windowStartUtc: Date;
  readonly windowEndUtc: Date;
  readonly tally: BackfillTally;
  /** The message that stopped the load, or `null` when it ran to the end. */
  readonly failure: string | null;
  readonly rejectionReasons: ReadonlySet<string>;
  /**
   * The READ side's own freshness budget (`EARTHQUAKE_STALE_MAX_SECONDS`), in seconds.
   *
   * Deliberately the same number `resolveEarthquakeFreshness` uses, because the question this
   * function has to answer is exactly the read side's: if this row anchored, would the coverage
   * behind it already be older than the budget the published `ok` promises?
   */
  readonly staleMaxSeconds: number;
}): RecordRunInput {
  const { tally } = input;
  const nothingReachedTheStore =
    tally.inserted === 0 && tally.updated === 0 && tally.unchanged === 0;

  let outcome: UpstreamOutcomeKind = 'ok';
  // Collected rather than assigned, so a load that hit BOTH degradations records both instead of
  // whichever branch happens to be tested first. `recordRun` truncates at 500 chars keeping the
  // LEADING text, so the order here is the order of importance.
  const reasons: string[] = [];
  if (input.failure !== null) {
    outcome = 'transient';
    reasons.push(input.failure);
  } else {
    if (tally.fetched > 0 && nothingReachedTheStore) {
      reasons.push(
        `the provider returned ${String(tally.fetched)} row(s) over ${String(tally.windows)} ` +
          'window(s) and not one reached the store; refusal reasons: ' +
          ([...input.rejectionReasons].sort().join(' | ') || '(none recorded)'),
      );
    }
    const coverageLagSeconds =
      (input.finishedAtUtc.getTime() - input.windowEndUtc.getTime()) / 1000;
    if (coverageLagSeconds > input.staleMaxSeconds) {
      reasons.push(
        `this load covered ${input.windowStartUtc.toISOString()}..${input.windowEndUtc.toISOString()}, ` +
          `which ends ${String(Math.round(coverageLagSeconds / 3600))} h before the load finished; ` +
          'it records contact with the provider, not current coverage',
      );
    }
  }

  return {
    jobKind: EarthquakeIngestJobKind.Backfill,
    startedAtUtc: input.startedAtUtc,
    finishedAtUtc: input.finishedAtUtc,
    outcome,
    // The range the OPERATOR asked for, not the last chunk: the ledger's window column exists so a
    // gap in coverage is auditable afterwards, and one load covers one range. On a load that
    // stopped part-way these two columns still record what was ASKED for — where it actually got
    // to rides in `errorReason`, which `runBackfill` prefixes with `backfill stopped at <stamp>`
    // for every abort class (review #125 CODE125-I1).
    windowStartUtc: input.windowStartUtc,
    windowEndUtc: input.windowEndUtc,
    fetchedCount: tally.fetched,
    insertedCount: tally.inserted,
    updatedCount: tally.updated,
    skippedOutOfScopeCount: tally.skippedOutOfScope,
    errorReason: reasons.length === 0 ? null : reasons.join('; '),
  };
}

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

/**
 * `YYYY-MM-DD` → the day's UTC midnight, or `null`. Deliberately strict: no locale parsing.
 *
 * The roll-over check is not decoration. `new Date('2026-02-30T00:00:00.000Z')` is NOT an invalid
 * date — it is 2 March — so `--from=2026-02-30` used to load a range starting two days after the
 * one that was typed, silently, on a one-off load nobody repeats. This is the same refusal
 * `parseAfadUtc` makes for the same reason: compare the components back, never trust the
 * constructor to have refused. (Found while writing the parser spec review #118 TA118-M2 asked
 * for, which had assumed the guard already existed.)
 */
export function parseIsoDay(value: string | undefined): Date | null {
  if (value === undefined || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().startsWith(value) ? parsed : null;
}

/**
 * Read a positive-integer knob from the environment, refusing a value it cannot honour.
 *
 * ## Why the backfill reads env at all
 * `buildEarthquakeRow` is shared by the scheduled tours and this CLI precisely so both classify
 * identically — but sharing the FUNCTION while hard-coding its PARAMETER leaves a second answer to
 * "is this event in scope". An operator who sets `EARTHQUAKE_SCOPE_BUFFER_KM=300` and then runs the
 * backfill would have written ~33 000 historical rows at 200 km against live tours at 300 km: a
 * silent hole in the 200-300 km band with a hard edge at the backfill date, which never self-heals
 * because the upsert rewrites only on change (review #118 CODE118-I1).
 *
 * ## Refuse, never fall back silently
 * An unset variable takes the schema default — that is the documented shape of a fresh clone. A
 * value that IS set but unusable is an operator mistake, and quietly classifying 33 000 rows on the
 * default while the operator believes their number took effect is exactly the failure above.
 */
export function readPositiveIntEnv(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer; got ${JSON.stringify(raw)}.`);
  }
  return value;
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
    // The artifact is written FIRST and kept: a run against a provider outage is still evidence,
    // and evidence of failure is what you least want discarded. But it is not a success — "probe
    // done" with exit 0 over four HTTP 500s hands the review an artifact containing no evidence,
    // and `ENGINEERING.md` §5 makes that artifact the reviewable half of the two-phase rule
    // (review #118 SFH118-M3).
    const failed = artifact.requests.filter(
      (request) => request.httpStatus < 200 || request.httpStatus >= 300,
    );
    if (failed.length > 0) {
      throw new Error(
        `${String(failed.length)} of ${String(artifact.requests.length)} probe request(s) did not ` +
          `answer 2xx: ${failed.map((request) => `${String(request.httpStatus)} ${request.label}`).join('; ')}. ` +
          'The artifact was written anyway — do NOT commit it as evidence.',
      );
    }
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
 * ## It writes ONE run row, and the earlier reasoning for writing none was wrong
 * E2 shipped this load writing nothing to `earthquake_ingest_runs` (plan-e2 §6.11), on the
 * argument that "a hand-run load of 2019's earthquakes is not evidence that the feed is alive
 * today". That confuses the events' ORIGIN times with the CONTACT the ledger actually records: a
 * backfill fetches from AFAD live, now, and stores what it gets, so the contact is exactly as
 * recent as the tour's would be. The measured consequence of the omission was the state E3 had to
 * absorb on the read side — tens of thousands of genuine rows in the store, an empty ledger, and
 * a public `dataStatus: 'stale'` with `dataUpdatedAtUtc: null`, whose published meaning is "we
 * have never successfully contacted the provider" (`FU-E2-BACKFILL-RUNROW`, E3 plan S5). E3
 * answered it honestly rather than fixing it, because the fix belongs here; this is the fix.
 *
 * **ONE row for the whole load, not one per window.** The ledger's unit is a decision to contact
 * the provider, and this is one such decision covering `--from`…`--to`. Fifty-two rows would also
 * flood the retention window the tours share.
 *
 * **The failure path writes one too.** A load that stops at HTTP 500 halfway has still stored
 * everything before that point, and a ledger that cannot tell "this load failed" from "no load
 * ever ran" is the defect review #118 CODE118-M4 closed on the tour side. Its outcome is not `ok`,
 * so it anchors nothing.
 *
 * **Writing the row is fail-soft.** Losing the ledger must not fail a load that wrote 33 000 rows.
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

  // The two classification knobs, read from the SAME environment the running server reads them
  // from — see `readPositiveIntEnv`. Both are already declared in the boot schema, so this is a
  // script-local READ of a server variable, not a new one.
  const scopeBufferKm = readPositiveIntEnv(
    process.env,
    'EARTHQUAKE_SCOPE_BUFFER_KM',
    DEFAULT_SCOPE_BUFFER_KM,
  );
  const safetyLimit = readPositiveIntEnv(
    process.env,
    'EARTHQUAKE_SAFETY_LIMIT',
    DEFAULT_SAFETY_LIMIT,
  );
  // Read for the same reason and from the same environment: the ledger row this load writes decides
  // whether the PUBLIC freshness claim moves, and the budget that claim is measured against is the
  // server's, not a second number invented here (see `buildBackfillRunInput`).
  const staleMaxSeconds = readPositiveIntEnv(
    process.env,
    'EARTHQUAKE_STALE_MAX_SECONDS',
    DEFAULT_STALE_MAX_SECONDS,
  );

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

    const tally: MutableBackfillTally = {
      windows: 0,
      fetched: 0,
      inserted: 0,
      updated: 0,
      unchanged: 0,
      rejected: 0,
      skippedOutOfScope: 0,
    };
    // Every distinct refusal the load hit, so a partially loaded archive is diagnosable from the
    // final line rather than only from a scrollback nobody kept.
    const rejectionReasons = new Set<string>();
    const startedAtUtc = new Date();

    // The effective knobs, printed before the first call: a run whose classification is silently
    // different from the running server's is the failure CODE118-I1 names, and the banner is what
    // makes the difference visible while the operator is still watching.
    console.log(
      `backfill starting — scope buffer ${String(scopeBufferKm)} km, safety limit ` +
        `${String(safetyLimit)} rows, ${String(chunkDays)}-day windows, base ${baseUrl}`,
    );

    let failure: string | null = null;
    // The window the loop is inside, so the outer catch can say WHERE the load stopped. Two of the
    // four abort classes composed their own `backfill stopped at …` prefix and two did not — a
    // parser refusal and a database error landed in `error_reason` with no position at all, so the
    // only durable record of a partial load claimed the operator's whole range and the resume point
    // survived nowhere (review #125 CODE125-I1). Composed in ONE place now, for all four.
    let stoppedAtWindowStart: Date | null = null;
    try {
      for (let cursor = from.getTime(); cursor < to.getTime(); cursor += chunkDays * 86_400_000) {
        if (tally.windows > 0) {
          await new Promise((resolve) => setTimeout(resolve, BACKFILL_SPACING_MS));
        }
        tally.windows += 1;
        const windowStart = new Date(cursor);
        stoppedAtWindowStart = windowStart;
        const windowEnd = new Date(Math.min(cursor + chunkDays * 86_400_000, to.getTime()));

        const url =
          `${baseUrl}/event/filter?start=${toAfadQueryStamp(windowStart)}` +
          `&end=${toAfadQueryStamp(windowEnd)}&limit=${String(safetyLimit)}`;
        const response = await fetch(url, {
          headers: { 'User-Agent': UPSTREAM_USER_AGENT, Accept: 'application/json' },
          signal: AbortSignal.timeout(BACKFILL_TIMEOUT_MS),
          redirect: 'error',
        });
        if (!response.ok) {
          // No `backfill stopped at …` prefix here or below: the outer catch composes it for every
          // abort class from `stoppedAtWindowStart`, so this message says only what went wrong.
          throw new Error(
            `HTTP ${String(response.status)}. Nothing already written is lost — re-run from this day.`,
          );
        }

        let body: string;
        try {
          body = await readBodyCapped(response, url, BACKFILL_MAX_RESPONSE_BYTES);
        } catch (error: unknown) {
          throw new Error(
            `${describeError(error)} Nothing already written is lost — re-run from this day, ` +
              'with a smaller --chunk-days.',
            { cause: error },
          );
        }

        const payload = parseAfadEventsBody(body, { safetyLimit });
        tally.fetched += payload.fetchedCount;
        const writtenAt = new Date();
        for (const event of payload.accepted) {
          const row = buildEarthquakeRow(event, plateCodes, scopeBufferKm);
          // Counted for the ledger row, exactly as the scheduled tour counts it: an out-of-scope
          // event IS written (D-C keeps everything) and is servable on no public path, so
          // `skipped_out_of_scope_count` means "stored but unpublishable" here too.
          if (!row.inScope) tally.skippedOutOfScope += 1;
          const result = await store.upsertEvent(row, writtenAt);
          if (result.kind === 'inserted') tally.inserted += 1;
          else if (result.kind === 'updated') tally.updated += 1;
          else tally.unchanged += 1;
        }
        // The permanent archive's ONLY filler used to discard every refusal with no id and no
        // reason, so a class of historical rows could be missing with nothing saying which or why
        // — and the load is run once (review #118 SFH118-I3). The scheduled tour logs each
        // rejection; so does this now.
        for (const rejection of payload.rejected) {
          rejectionReasons.add(rejection.reason);
          const id =
            rejection.providerEventId === null
              ? '(id unreadable)'
              : quoteProviderText(rejection.providerEventId);
          console.warn(`rejected ${id} — ${rejection.reason}`);
        }
        tally.rejected += payload.rejected.length;
        console.log(
          `${toAfadQueryStamp(windowStart)} → ${toAfadQueryStamp(windowEnd)}: ` +
            `${String(payload.fetchedCount)} fetched, ${String(payload.rejected.length)} rejected`,
        );
      }
    } catch (error: unknown) {
      // `describeErrorWithName`, as the scheduled tour does it: this string is the load's only
      // durable diagnosis, and the CLASS is the half that tells an upstream fault from one of ours
      // — `QueryFailedError: …` under `outcome: 'transient'` is the reader's warning not to read
      // that outcome as a statement about AFAD's health.
      const message = describeErrorWithName(error);
      failure =
        stoppedAtWindowStart === null
          ? message
          : `backfill stopped at ${toAfadQueryStamp(stoppedAtWindowStart)}: ${message}`;
    }

    // The ledger row goes in on BOTH paths, before the failure is re-thrown — see the function
    // docblock. It is fail-soft: losing the ledger must not fail a load that stored real rows.
    const runInput = buildBackfillRunInput({
      startedAtUtc,
      finishedAtUtc: new Date(),
      windowStartUtc: from,
      windowEndUtc: to,
      tally,
      failure,
      rejectionReasons,
      staleMaxSeconds,
    });
    let ledgerRecorded = true;
    try {
      await store.recordRun(runInput);
      console.log(
        `ingest run recorded — job_kind ${runInput.jobKind}, outcome ${runInput.outcome}` +
          (runInput.errorReason === null ? '' : `, reason: ${runInput.errorReason}`),
      );
    } catch (error: unknown) {
      ledgerRecorded = false;
      console.error(
        'the ingest run row could not be recorded; the loaded events are unaffected, but the ' +
          `published freshness will not see this load — ${describeErrorWithName(error)}`,
      );
    }

    if (failure !== null) throw new Error(failure);

    console.log(
      `backfill done — ${String(tally.windows)} window(s), ${String(tally.inserted)} inserted, ` +
        `${String(tally.updated)} updated, ${String(tally.unchanged)} unchanged, ` +
        `${String(tally.rejected)} rejected, ${String(tally.skippedOutOfScope)} out of scope` +
        // The one thing the operator must not scroll past. The `console.error` above prints BEFORE
        // this success banner, and the go-live runbook chains the next step off this command, so
        // without the repeat the last line read says the load is done and says nothing about the
        // ledger it failed to write (review #125 SFH125-M1 / CODE125-M3). The exit code stays 0 on
        // purpose: fail-soft is the ruled behaviour for this write.
        (ledgerRecorded ? '' : ' — WITHOUT an ingest run row; see the error above'),
    );
    if (rejectionReasons.size > 0) {
      console.warn(
        `refusal classes seen (${String(rejectionReasons.size)}): ` +
          [...rejectionReasons].sort().join(' | '),
      );
    }
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
