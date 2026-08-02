import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import {
  AirQualityPollutant,
  AirQualityStatus,
  ALL_AIR_QUALITY_POLLUTANTS,
} from '../../air-quality/air-quality.types';
import { CAMS_DECODER_VERSION, decodeCamsFile } from '../../air-quality/cams/cams-decode';
import type { CamsDecodedFile, CamsProduct } from '../../air-quality/cams/cams-decode';
import { redactAdsSecret } from '../../air-quality/cams/ads-redaction';
import { CAMS_VARIABLES } from '../../air-quality/cams/cams-variables';
import {
  readBodyCappedBytes,
  UpstreamOversizedResponseError,
} from '../../upstream/upstream-http.helpers';
import { SEED_PROVINCES } from '../seeds/province.seed-data';
import type {
  AirQualityJobsListProbe,
  AirQualityProbeAnalysisRecord,
  AirQualityProbeArtifact,
  AirQualityProbeJobLabel,
  AirQualityProbeJobRecord,
  AirQualityProbeProvinceRecord,
  AirQualityProbeRequestRecord,
} from './air-quality-artifact.types';

/**
 * `pnpm db:import:air-quality --phase=probe` — the ONLY thing in PR A1 that touches the
 * network, and it is run BY HAND, once, to produce the committed evidence artifact and the
 * committed mini golden fixture. It is NOT scheduled, NOT part of any request path, and CI
 * never runs it (the climate/marine two-phase precedent).
 *
 * ## What one run does
 * THREE ADS jobs, serial-polite, plus one `GET /jobs` measurement:
 *  1. **production** — the forecast shape (5 pollutants × 97 steps, TR `area`, `costing` 485
 *     of 5000) for run day D;
 *  2. **analysis** — `type: analysis` for **D−1** (5 pollutants × 24 hours, `costing` 120).
 *     D−1, never D: at submit time every hour of D−1 is in the past, so the word "analysis"
 *     can never cover a future hour (measured counter-example: an analysis job for D returned
 *     complete values for hours that had not happened yet — plan §8.4.2);
 *  3. **fixture** — a MINI shape (1 pollutant × 1 step, ~56 KB).
 *
 * For each: costing → execution → poll → results → guarded download → decode with the REAL 81
 * province reference points → `DELETE` (politeness; results live ~1.5–2 days on the provider's
 * cache disks). Evidence goes to `data/air-quality/air-quality-probe.json`.
 *
 * ## Where the bytes go — `--raw-dir` (MANDATORY, absolute) and `--from-file`
 * Every downloaded archive is written to `--raw-dir`, which must be an ABSOLUTE path outside
 * the repo, and `--from-file=<absolute path to the forecast archive>` re-runs the ENTIRE
 * offline half (decode → province extraction → assertions → artifact) with ZERO network calls
 * (the ERA5 PR-1 pattern, ruling Q9). That matters because the decoder is versioned: when its
 * version stamp or a guard changes, the committed evidence has to be re-derived, and doing
 * that by asking the provider for another ~32 MiB would produce a DIFFERENT day's file — an
 * artifact that is no longer the same measurement.
 *
 * This tool deliberately does NOT write `test/fixtures/cams/`. That directory holds the
 * committed golden archive plus a `reference.json` produced by two INDEPENDENT readers, and
 * silently overwriting the archive while the reference stayed behind would break the golden
 * spec with a diff nobody asked for. Promoting a fresh mini archive is a deliberate operator
 * step, documented in that directory's README.
 *
 * ## Why a script-local HTTP client, not `UpstreamHttpClient` (the plan's own fallback,
 * §5.6 — justified here and in the PR body)
 * The approved plan preferred a standalone `UpstreamHttpClient` so the guard order is never
 * copied. That client, by design, issues GET-only requests (no `method`/`body` option), and
 * the ADS queue protocol REQUIRES POST (`costing`, `execution`) and DELETE (job cleanup).
 * Teaching the shared client verbs would be an `src/upstream` change — banned in A1 by
 * acceptance criterion 7/9. So this tool follows the recorded probe precedent
 * (`probe-marine-ecmwf.ts`, review #75): a minimal serial client with no budget/breaker/
 * deadline to mis-copy — there ARE no guards here to duplicate, because nobody waits on a
 * hand-run tool — while the one primitive that must not be re-implemented, response byte
 * metering, is reused verbatim (`readBodyCappedBytes`).
 *
 * ## Security bindings (SPEC §13.3, all unit-tested)
 * - The ADS key is read from process env HERE, script-locally — it never enters
 *   `env.schema.ts` (A1 adds ZERO env vars; the climate `fetch` precedent).
 * - JSON API calls send `PRIVATE-TOKEN`; the DOWNLOAD call NEVER does (measured: the object
 *   store needs no auth, and a defaulted header would leak the ADS key to a third host).
 * - The download `href` must be https on an allowlisted host (`assertAllowedDownloadHost`) —
 *   following an arbitrary provider-supplied URL is SSRF class. `redirect: 'error'` always.
 * - `file:local_path` (an `s3://` URI) is neither used nor logged.
 * - Everything printed or persisted passes {@link redactAdsSecret}; the artifact is scanned
 *   for the key before it is written.
 */

export const ADS_BASE_URL = 'https://ads.atmosphere.copernicus.eu/api/retrieve/v1';
export const ADS_DATASET_ID = 'cams-europe-air-quality-forecasts';

/** Download host allowlist (env-backed in A2; a script-local constant in A1 — zero env). */
export const ADS_OBJECT_STORE_HOST_ALLOWLIST: readonly string[] = [
  'object-store.os-api.cci2.ecmwf.int',
];

/** [N, W, S, E] — measured: the 45.0 domain edge is accepted; cells come back cell-centred. */
export const AIR_QUALITY_AREA: readonly number[] = [42.5, 25.5, 35.5, 45.0];

/** Hard byte ceiling for one downloaded run file (measured production size: 25.26 MiB). */
export const PROBE_MAX_DOWNLOAD_BYTES = 268_435_456;

/**
 * Raw archive filenames inside `--raw-dir`. The mini one keeps the name the committed golden
 * fixture uses, so promoting it is a plain `cp` (see `test/fixtures/cams/README.md`).
 */
export const FORECAST_ARCHIVE_NAME = 'production-forecast.zip';
export const ANALYSIS_ARCHIVE_NAME = 'production-analysis.zip';
export const FIXTURE_ARCHIVE_NAME = 'mini-tr-pm25-1step.zip';

/** Artifact filename — also what `--from-file` reads the previous run day back from. */
export const ARTIFACT_FILE_NAME = 'air-quality-probe.json';

/**
 * Production forecast step count: leadtime hours 0…96 inclusive. Single-sourced here so the
 * request builder and the `time-steps-97` evidence gate cannot drift apart (a spec literal
 * still pins the value independently).
 */
export const PRODUCTION_FORECAST_STEP_COUNT = 97;

/**
 * Analysis step count: one calendar day of hourly steps (00:00…23:00), measured 24 (J3).
 *
 * A CONSTANT, not an env knob (plan §9.1): the number is a direct consequence of the request
 * shape "one day of hourly analysis", not an operator preference — 48 hours of history would
 * be TWO jobs, not a bigger number here.
 */
export const ANALYSIS_STEP_COUNT = 24;

const USER_AGENT =
  'CografyaPlatformBot/1.0 (educational geography platform; CAMS air-quality probe; run by hand)';

const JSON_TIMEOUT_MS = 30_000;
const DOWNLOAD_TIMEOUT_MS = 180_000;
const JSON_MAX_BYTES = 2 * 1024 * 1024;
const DELAY_BETWEEN_REQUESTS_MS = 1_000;
const POLL_INTERVAL_MS = 30_000;
const MAX_POLLS_PER_JOB = 40; // 20 minutes — far beyond the measured 14–47 s queue

/** Probe failure: loud, typed, and always AFTER politeness cleanup where possible. */
export class AirQualityProbeError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(`[air-quality probe] ${message}`, options);
    this.name = 'AirQualityProbeError';
  }
}

// ─── pure, unit-tested security/shape helpers ────────────────────────────────

/** Headers for ADS JSON endpoints — the ONLY place the key enters a request. */
export function buildAdsJsonHeaders(apiKey: string): Record<string, string> {
  return {
    'PRIVATE-TOKEN': apiKey,
    'Content-Type': 'application/json',
    'User-Agent': USER_AGENT,
  };
}

/**
 * Headers for the object-store download. NO `PRIVATE-TOKEN`, by contract (SPEC §13.3): the
 * result host authenticates nothing, and sending the key there would leak it across a trust
 * boundary. A unit test asserts the absence, and the fake-run spec asserts it end-to-end.
 */
export function buildDownloadHeaders(): Record<string, string> {
  return { 'User-Agent': USER_AGENT };
}

/** Refuse any download target that is not https on an allowlisted host (SSRF class). */
export function assertAllowedDownloadHost(
  href: string,
  allowlist: readonly string[] = ADS_OBJECT_STORE_HOST_ALLOWLIST,
): URL {
  let url: URL;
  try {
    url = new URL(href);
  } catch (error: unknown) {
    throw new AirQualityProbeError(`result href is not a valid URL: ${href}`, { cause: error });
  }
  if (url.protocol !== 'https:') {
    throw new AirQualityProbeError(`result href protocol "${url.protocol}" is not https.`);
  }
  if (!allowlist.includes(url.hostname)) {
    throw new AirQualityProbeError(
      `result href host "${url.hostname}" is not in the download allowlist ` +
        `[${allowlist.join(', ')}] — refusing to follow a provider-supplied URL off-list.`,
    );
  }
  return url;
}

/**
 * Redaction moved to `src/air-quality/cams/ads-redaction.ts` in A2a (plan §10-D4): the runtime
 * ingest is its SECOND real consumer, and the rule in this repo is that the second consumer
 * shares the function rather than copying it. Re-exported here so the probe's own call sites
 * and its spec keep reading it from the tool they belong to.
 */
export { redactAdsSecret } from '../../air-quality/cams/ads-redaction';

/**
 * Which run day to request: today's run once the provider SLA has comfortably closed
 * (all products ≤ 12:00 UTC; measured accessible at 14:07 UTC), otherwise yesterday's.
 */
export function runDateFor(now: Date): string {
  const base = new Date(now.getTime());
  if (base.getUTCHours() < 13) base.setUTCDate(base.getUTCDate() - 1);
  return base.toISOString().slice(0, 10);
}

/** The production-shape request body: 5 pollutants × 97 steps, TR area (costing = 485). */
export function buildProductionRequestBody(runDate: string): Record<string, unknown> {
  return {
    model: ['ensemble'],
    variable: CAMS_VARIABLES.map((mapping) => mapping.requestName),
    level: ['0'], // string, not number — provider enum is a string list (measured)
    type: ['forecast'],
    date: [`${runDate}/${runDate}`], // mandatory, undeclared in the process schema (measured)
    time: ['00:00'],
    leadtime_hour: Array.from({ length: PRODUCTION_FORECAST_STEP_COUNT }, (_unused, hour) =>
      String(hour),
    ),
    area: [...AIR_QUALITY_AREA],
    data_format: 'netcdf_zip',
  };
}

/** The mini fixture body: 1 pollutant × 1 step (the ~56 KB golden-fixture shape). */
export function buildFixtureRequestBody(runDate: string): Record<string, unknown> {
  return {
    ...buildProductionRequestBody(runDate),
    variable: [CAMS_VARIABLES[0]?.requestName ?? 'particulate_matter_2.5um'],
    leadtime_hour: ['0'],
  };
}

/**
 * The day the ANALYSIS job asks for: exactly one day before the forecast run day.
 *
 * The offset is a CONSTANT in code, not an env var (plan §8.4.2 / ruling Q11). It is a
 * property of the provider's product, not an operator preference: only D−1 guarantees that
 * every hour labelled "analysis" is already in the past at submit time, and only D−1 leaves no
 * overlap with the forecast product's own 00:00 start (so the merged series is contiguous with
 * no hour served twice).
 */
export function analysisDateFor(runDate: string): string {
  const parsed = new Date(`${runDate}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new AirQualityProbeError(`runDate "${runDate}" is not a YYYY-MM-DD date.`);
  }
  parsed.setUTCDate(parsed.getUTCDate() - 1);
  return parsed.toISOString().slice(0, 10);
}

/**
 * The analysis request body: 5 pollutants × 24 hourly analysis times, `leadtime_hour: 0`
 * (measured J3 shape, `costing` = 120 of 5000).
 *
 * `time` carries the 24 hours and `leadtime_hour` stays `['0']` — the inverse of the forecast
 * shape, where one `time` is combined with 97 lead times.
 */
export function buildAnalysisRequestBody(analysisDate: string): Record<string, unknown> {
  return {
    ...buildProductionRequestBody(analysisDate),
    type: ['analysis'],
    time: Array.from(
      { length: ANALYSIS_STEP_COUNT },
      (_unused, hour) => `${String(hour).padStart(2, '0')}:00`,
    ),
    leadtime_hour: ['0'],
  };
}

// ─── the run ─────────────────────────────────────────────────────────────────

export interface AirQualityProbeOptions {
  /** Where the artifact JSON is written (`data/air-quality`). */
  outputDir: string;
  /**
   * Where every downloaded archive is written. MANDATORY and absolute — the raw bytes are
   * ~32 MiB per run and must never default to somewhere inside the repo (the ERA5 rule).
   */
  rawDir: string;
  /**
   * Re-derive the whole offline half from a raw FORECAST archive already on disk: ZERO network
   * calls, zero ADS jobs. The analysis archive is looked up as a sibling under its fixed name
   * ({@link ANALYSIS_ARCHIVE_NAME}); when it is absent the analysis evidence is honestly `null`
   * rather than fabricated. The run day comes from the artifact ALREADY in `outputDir`, so an
   * offline re-run cannot silently re-date a file it did not download.
   */
  fromFile?: string | null;
  /** Injected for tests; defaults to process env / global fetch / real timers. */
  apiKey?: string;
  fetchImpl?: typeof fetch;
  sleepImpl?: (ms: number) => Promise<void>;
  nowImpl?: () => Date;
}

interface RawResponse {
  status: number;
  /** `null` when the response carried NO content-type header at all (e.g. a bare 204). */
  contentType: string | null;
  bytes: Uint8Array;
  durationMs: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function md5Hex(bytes: Uint8Array): string {
  return createHash('md5').update(bytes).digest('hex');
}

export async function runAirQualityProbePhase(options: AirQualityProbeOptions): Promise<void> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleepImpl = options.sleepImpl ?? sleep;
  const nowImpl = options.nowImpl ?? ((): Date => new Date());
  const fromFile = options.fromFile ?? null;
  // An offline re-run needs no credential at all, and must not read one: the key is only ever
  // held while a network call can happen (the ERA5 `--from-file` posture).
  const apiKey = fromFile === null ? (options.apiKey ?? process.env.ADS_API_KEY ?? null) : null;
  if (fromFile === null && (apiKey === null || apiKey.length === 0)) {
    throw new AirQualityProbeError(
      'ADS_API_KEY is not set. The probe reads it from the environment SCRIPT-LOCALLY (it is ' +
        'deliberately not part of the app boot schema). Export it for this one command, or ' +
        're-derive the artifact offline with --from-file=<absolute path>.',
    );
  }

  const startedAtMs = Date.now();
  const requests: AirQualityProbeRequestRecord[] = [];
  const jobs: AirQualityProbeJobRecord[] = [];
  const redact = (text: string): string => redactAdsSecret(text, apiKey);
  const log = (message: string): void => {
    console.log(redact(`[db:import:air-quality] ${message}`));
  };

  /** One serial call. Non-2xx statuses are returned (evidence), transport failures throw. */
  const call = async (
    label: string,
    method: 'GET' | 'POST' | 'DELETE',
    url: string,
    body: Record<string, unknown> | null,
    headers: Record<string, string>,
    timeoutMs: number,
    maxBytes: number,
  ): Promise<RawResponse> => {
    await sleepImpl(DELAY_BETWEEN_REQUESTS_MS);
    const startedAt = Date.now();
    let response: Response;
    let bytes: Uint8Array;
    try {
      response = await fetchImpl(url, {
        method,
        headers,
        body: body === null ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
        // A redirect is the one way a peer chooses the host this process talks to — refused
        // outright, and measured unnecessary (0 redirects across every probe download).
        redirect: 'error',
      });
      bytes = await readBodyCappedBytes(response, url, maxBytes);
    } catch (error: unknown) {
      if (error instanceof UpstreamOversizedResponseError) {
        throw new AirQualityProbeError(redact(error.message), { cause: error });
      }
      throw new AirQualityProbeError(
        redact(`${label}: transport failure for ${method} ${url}: ${String(error)}`),
        { cause: error },
      );
    }
    // `get` returns null for an ABSENT header — kept as null rather than coerced to '', because
    // "the provider sent no content-type" and "the provider sent an empty one" are different
    // answers to Ö-A2-1, and the shared client's guard behaves differently for each.
    const contentType = response.headers.get('content-type');
    const record: AirQualityProbeRequestRecord = {
      label,
      method,
      url,
      httpStatus: response.status,
      bytes: bytes.byteLength,
      durationMs: Date.now() - startedAt,
      contentType,
    };
    requests.push(record);
    return {
      status: response.status,
      contentType,
      bytes,
      durationMs: record.durationMs,
    };
  };

  const jsonCall = async (
    label: string,
    method: 'GET' | 'POST' | 'DELETE',
    url: string,
    body: Record<string, unknown> | null,
  ): Promise<{ status: number; json: unknown }> => {
    if (apiKey === null) {
      // Unreachable by construction (the offline half never calls this), and asserted rather
      // than assumed: a future edit that reached the network from `--from-file` would be a
      // silent breach of the "zero network calls" promise, not a type error.
      throw new AirQualityProbeError(
        `${label}: an offline (--from-file) re-run must make NO network calls.`,
      );
    }
    const raw = await call(
      label,
      method,
      url,
      body,
      buildAdsJsonHeaders(apiKey),
      JSON_TIMEOUT_MS,
      JSON_MAX_BYTES,
    );
    const text = new TextDecoder('utf-8').decode(raw.bytes);
    let json: unknown = null;
    if (text.length > 0) {
      try {
        json = JSON.parse(text);
      } catch (error: unknown) {
        throw new AirQualityProbeError(
          redact(`${label}: non-JSON body (HTTP ${String(raw.status)}): ${text.slice(0, 200)}`),
          { cause: error },
        );
      }
    }
    return { status: raw.status, json };
  };

  const artifactPath = join(options.outputDir, ARTIFACT_FILE_NAME);
  // The run day: derived from the clock on a live pass, READ BACK from the committed artifact
  // on an offline one. The decoder cross-validates the day against the file's own `long_name`,
  // so guessing here would turn a stale `--from-file` path into a WRONG DAY'S FILE refusal with
  // no way to correct it — and inventing a `--run-date` flag would let an operator silently
  // re-label an archive instead.
  const runDate =
    fromFile === null ? runDateFor(nowImpl()) : await readRunDateFromArtifact(artifactPath);
  const analysisDate = analysisDateFor(runDate);
  const expectedRunDay = runDate.replaceAll('-', '');
  const points = SEED_PROVINCES.map((province) => ({
    plateCode: province.plateCode,
    latitude: province.latitude,
    longitude: province.longitude,
  }));
  log(
    fromFile === null
      ? `probe phase — 3 ADS jobs against ${ADS_DATASET_ID} (forecast ${runDate}, analysis ` +
          `${analysisDate}, mini fixture), serial and polite (1 s spacing, 30 s polls, DELETE ` +
          'after download).'
      : `--from-file=${fromFile} — re-deriving the artifact OFFLINE for run day ${runDate}; ` +
          'ZERO network calls, ZERO ADS jobs.',
  );

  // Ö-A2-3 is assembled from two halves taken at different moments: the LIST while a job of
  // ours is alive, and the DETAIL from a poll we were making anyway.
  // Held on an object rather than in two `let`s so the narrowing at the assembly site below
  // survives the intervening `await runJob(...)` calls that populate them.
  const measurements: {
    list: Omit<AirQualityJobsListProbe, 'detailKeys' | 'detailEchoesRequestInputs'> | null;
    detail: Pick<AirQualityJobsListProbe, 'detailKeys' | 'detailEchoesRequestInputs'> | null;
  } = { list: null, detail: null };

  /**
   * `GET /jobs` — the reconciliation surface, measured STRUCTURALLY.
   *
   * A failure here is recorded, never fatal: this is a measurement of a convenience endpoint,
   * and losing three already-successful downloads because a list call 500'd would be the wrong
   * trade. What the artifact must never contain is the body itself — only its shape.
   */
  const measureJobsList = async (
    submittedJobId: string,
  ): Promise<Omit<AirQualityJobsListProbe, 'detailKeys' | 'detailEchoesRequestInputs'> | null> => {
    let response: { status: number; json: unknown };
    try {
      response = await jsonCall('jobs.list', 'GET', `${ADS_BASE_URL}/jobs`, null);
    } catch (error: unknown) {
      log(`jobs.list measurement failed (recorded as absent): ${redact(String(error))}`);
      return null;
    }
    const listRequest = requests[requests.length - 1];
    const body =
      typeof response.json === 'object' && response.json !== null && !Array.isArray(response.json)
        ? (response.json as Record<string, unknown>)
        : null;
    const bodyKeys = body === null ? [] : Object.keys(body).sort();
    // The array may sit under any key (`jobs` is the documented one); find it rather than
    // assuming, because the assumption is exactly what this measurement exists to remove.
    const jobsArrayKey =
      body === null ? null : (bodyKeys.find((key) => Array.isArray(body[key])) ?? null);
    const entries =
      jobsArrayKey === null || body === null ? null : (body[jobsArrayKey] as unknown[]);
    const firstEntry =
      entries?.find(
        (entry) => typeof entry === 'object' && entry !== null && !Array.isArray(entry),
      ) ?? null;
    const entryRecord = (firstEntry ?? null) as Record<string, unknown> | null;
    return {
      httpStatus: response.status,
      contentType: listRequest?.contentType ?? null,
      bodyKeys,
      jobsArrayKey,
      jobCount: entries?.length ?? null,
      entryKeys: entryRecord === null ? [] : Object.keys(entryRecord).sort(),
      entryEchoesRequestInputs: entryRecord !== null && echoesRequestInputs(entryRecord),
      containsSubmittedJob:
        entries?.some(
          (entry) =>
            typeof entry === 'object' &&
            entry !== null &&
            (entry as Record<string, unknown>).jobID === submittedJobId,
        ) ?? false,
    };
  };

  const runJob = async (
    label: AirQualityProbeJobLabel,
    product: CamsProduct,
    requestDate: string,
    requestBody: Record<string, unknown>,
    pollutants: readonly AirQualityPollutant[],
  ): Promise<{ job: AirQualityProbeJobRecord; decoded: CamsDecodedFile; archive: Uint8Array }> => {
    // 1 — costing. The endpoint answers HTTP 200 even ABOVE the limit and never rejects by
    // itself (measured: {"cost":23280,"limit":5000} → 200): the comparison is OURS.
    const costing = await jsonCall(
      `${label}.costing`,
      'POST',
      `${ADS_BASE_URL}/processes/${ADS_DATASET_ID}/costing`,
      { inputs: requestBody },
    );
    const costingBody = asRecord(costing.json, `${label}.costing`);
    const cost = asNumber(costingBody.cost, `${label}.costing cost`);
    const limit = asNumber(costingBody.limit, `${label}.costing limit`);
    if (costing.status !== 200 || cost > limit) {
      throw new AirQualityProbeError(
        `${label}: costing refused or over limit (HTTP ${String(costing.status)}, cost ` +
          `${String(cost)} / limit ${String(limit)}) — NOT submitting.`,
      );
    }
    log(`${label}: costing ${String(cost)} field(s) (limit ${String(limit)}).`);

    // 2 — submit (single attempt: a blind POST retry could double-queue a job).
    const execution = await jsonCall(
      `${label}.execution`,
      'POST',
      `${ADS_BASE_URL}/processes/${ADS_DATASET_ID}/execution`,
      { inputs: requestBody },
    );
    if (execution.status !== 201 && execution.status !== 200) {
      throw new AirQualityProbeError(
        redact(
          `${label}: execution answered HTTP ${String(execution.status)}: ` +
            `${JSON.stringify(execution.json).slice(0, 300)}`,
        ),
      );
    }
    const executionBody = asRecord(execution.json, `${label}.execution`);
    const jobId = asString(executionBody.jobID, `${label}.execution jobID`);
    // Shape gate BEFORE the id is interpolated into URLs: a hostile/odd jobID (`../`, `?`,
    // whitespace) must never steer the poll/results/DELETE paths. Real ADS ids are UUIDs.
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(jobId)) {
      // Through redact() and length-capped: a refused jobID is hostile/arbitrary provider text
      // and could be huge or echo key material — the one refusal message that skipped both.
      throw new AirQualityProbeError(
        redact(
          `${label}: jobID "${jobId.slice(0, 128)}" has an unexpected shape — refusing to ` +
            'build URLs from it.',
        ),
      );
    }
    log(`${label}: queued as job ${jobId}.`);

    // Ö-A2-3, measured ONCE and only while one of our jobs demonstrably exists on the account:
    // what `GET /jobs` returns and whether a job record can be tied back to OUR request body.
    // The A2 ingest reconciles a `submitting` job against this list rather than re-submitting.
    measurements.list ??= await measureJobsList(jobId);

    // 3 — poll until terminal.
    let statusBody: Record<string, unknown> = executionBody;
    let status = asString(executionBody.status, `${label}.status`);
    let polls = 0;
    while (status === 'accepted' || status === 'running') {
      if (polls >= MAX_POLLS_PER_JOB) {
        throw new AirQualityProbeError(
          `${label}: job ${jobId} still "${status}" after ${String(polls)} polls.`,
        );
      }
      polls += 1;
      await sleepImpl(POLL_INTERVAL_MS);
      const poll = await jsonCall(`${label}.poll`, 'GET', `${ADS_BASE_URL}/jobs/${jobId}`, null);
      statusBody = asRecord(poll.json, `${label}.poll`);
      status = asString(statusBody.status, `${label}.poll status`);
      // The single-job half of Ö-A2-3, taken from a poll we were making anyway (no extra call
      // on the provider). KEYS ONLY — never the values.
      measurements.detail ??= {
        detailKeys: Object.keys(statusBody).sort(),
        detailEchoesRequestInputs: echoesRequestInputs(statusBody),
      };
    }
    if (status !== 'successful') {
      // `rejected` and licence-403s are terminal classes — a hand-run probe surfaces them
      // verbatim (redacted) instead of retrying against a provider that said no.
      throw new AirQualityProbeError(
        redact(
          `${label}: job ${jobId} ended "${status}": ${JSON.stringify(statusBody).slice(0, 300)}`,
        ),
      );
    }
    const created = optionalString(statusBody.created);
    const started = optionalString(statusBody.started);
    const finished = optionalString(statusBody.finished);
    const queueSeconds = secondsBetween(created, started);
    const runSeconds = secondsBetween(started, finished);
    log(
      `${label}: successful — queue ${String(queueSeconds ?? '?')} s, run ` +
        `${String(runSeconds ?? '?')} s (ADS stamps).`,
    );

    // 4 — results: href + the two free guards (file:size before, file:checksum after).
    const results = await jsonCall(
      `${label}.results`,
      'GET',
      `${ADS_BASE_URL}/jobs/${jobId}/results`,
      null,
    );
    const asset = extractResultAsset(results.json, `${label}.results`);
    const url = assertAllowedDownloadHost(asset.href);
    if (asset.size > PROBE_MAX_DOWNLOAD_BYTES) {
      throw new AirQualityProbeError(
        `${label}: declared file:size ${String(asset.size)} exceeds the ` +
          `${String(PROBE_MAX_DOWNLOAD_BYTES)} B cap — not downloading.`,
      );
    }
    if (!/^[0-9a-f]{32}$/i.test(asset.checksum)) {
      throw new AirQualityProbeError(
        `${label}: file:checksum "${asset.checksum}" is not 32 hex chars — the provider's ` +
          'checksum algorithm changed; refusing to pretend we verified integrity.',
      );
    }

    // 5 — download. NO PRIVATE-TOKEN on this call (see the module docblock).
    const download = await call(
      `${label}.download`,
      'GET',
      url.toString(),
      null,
      buildDownloadHeaders(),
      DOWNLOAD_TIMEOUT_MS,
      PROBE_MAX_DOWNLOAD_BYTES,
    );
    if (download.status !== 200) {
      throw new AirQualityProbeError(
        `${label}: download answered HTTP ${String(download.status)}.`,
      );
    }
    if (download.bytes.byteLength !== asset.size) {
      throw new AirQualityProbeError(
        `${label}: downloaded ${String(download.bytes.byteLength)} B ≠ declared ` +
          `${String(asset.size)} B.`,
      );
    }
    const checksum = md5Hex(download.bytes);
    const checksumVerified = checksum.toLowerCase() === asset.checksum.toLowerCase();
    if (!checksumVerified) {
      throw new AirQualityProbeError(
        `${label}: MD5 ${checksum} does not match the declared file:checksum ${asset.checksum}.`,
      );
    }

    // 6 — decode with the real 81 province points. BOTH cross-validations come from the JOB
    // itself, never from a constant: the day we asked for and the product we asked for.
    const decodeStartedAt = Date.now();
    const decoded = decodeCamsFile(download.bytes, {
      expectedRunDate: requestDate.replaceAll('-', ''),
      expectedProduct: product,
      points,
      pollutants,
    });
    const decodeMs = Date.now() - decodeStartedAt;
    log(
      `${label}: decoded ${String(download.bytes.byteLength)} B in ${String(decodeMs)} ms ` +
        `(entry "${decoded.entryName}", zip method ${String(decoded.zipMethod)}).`,
    );

    // 7 — politeness: DELETE the job (results live ~1.5–2 days on shared cache disks).
    const deletion = await jsonCall(
      `${label}.delete`,
      'DELETE',
      `${ADS_BASE_URL}/jobs/${jobId}`,
      null,
    );
    const deleted = deletion.status >= 200 && deletion.status < 300;
    if (!deleted)
      log(`${label}: DELETE answered HTTP ${String(deletion.status)} (job left to expire).`);

    return {
      job: {
        label,
        product,
        requestDate,
        requestBody,
        costing: { cost, limit },
        jobId,
        adsStamps: { created, started, finished },
        queueSeconds,
        runSeconds,
        resultHost: url.hostname,
        declaredSizeBytes: asset.size,
        downloadedBytes: download.bytes.byteLength,
        checksumMd5: checksum,
        checksumVerified,
        downloadMs: download.durationMs,
        decodeMs,
        zipMethod: decoded.zipMethod,
        entryName: decoded.entryName,
        innerFormat: decoded.innerFormat,
        deleted,
      },
      decoded,
      archive: download.bytes,
    };
  };

  // ── acquire + decode: three serial jobs, or an offline re-derivation ───────
  await mkdir(options.rawDir, { recursive: true });
  let forecastDecoded: CamsDecodedFile;
  let analysisDecoded: CamsDecodedFile | null = null;

  if (fromFile === null) {
    const production = await runJob(
      'production',
      'FORECAST',
      runDate,
      buildProductionRequestBody(runDate),
      ALL_AIR_QUALITY_POLLUTANTS,
    );
    await writeFile(join(options.rawDir, FORECAST_ARCHIVE_NAME), production.archive);

    // The analysis job is SECOND and its failure is not fatal to the forecast evidence in the
    // runtime ingest — but here it IS fatal on purpose: this run exists to measure Ö-A2-5, and
    // an artifact that quietly omits the measurement it was run for is worse than no run.
    const analysis = await runJob(
      'analysis',
      'ANALYSIS',
      analysisDate,
      buildAnalysisRequestBody(analysisDate),
      ALL_AIR_QUALITY_POLLUTANTS,
    );
    await writeFile(join(options.rawDir, ANALYSIS_ARCHIVE_NAME), analysis.archive);

    const fixture = await runJob('fixture', 'FORECAST', runDate, buildFixtureRequestBody(runDate), [
      AirQualityPollutant.Pm2_5,
    ]);
    await writeFile(join(options.rawDir, FIXTURE_ARCHIVE_NAME), fixture.archive);

    jobs.push(production.job, analysis.job, fixture.job);
    forecastDecoded = production.decoded;
    analysisDecoded = analysis.decoded;
  } else {
    forecastDecoded = decodeCamsFile(new Uint8Array(await readFile(fromFile)), {
      expectedRunDate: expectedRunDay,
      expectedProduct: 'FORECAST',
      points,
      pollutants: ALL_AIR_QUALITY_POLLUTANTS,
    });
    const analysisPath = join(dirname(fromFile), ANALYSIS_ARCHIVE_NAME);
    const analysisBytes = await readOptionalFile(analysisPath);
    if (analysisBytes === null) {
      // Honest gap, not a silent one: the analysis evidence becomes `null` and its assertion
      // reports the absence, instead of the artifact looking like a complete measurement.
      log(`no ${ANALYSIS_ARCHIVE_NAME} beside the raw file — analysis evidence will be null.`);
    } else {
      analysisDecoded = decodeCamsFile(analysisBytes, {
        expectedRunDate: analysisDate.replaceAll('-', ''),
        expectedProduct: 'ANALYSIS',
        points,
        pollutants: ALL_AIR_QUALITY_POLLUTANTS,
      });
    }
    log(
      `offline re-derivation: forecast SHA-256 ${sha256Hex(await readFile(fromFile))} — compare ` +
        'it against the raw archive the committed artifact was measured from before trusting it.',
    );
  }

  // ── analysis evidence (Ö-A2-5 + the grid-identity measurement behind risk R11) ──
  const analysisRecord: AirQualityProbeAnalysisRecord | null =
    analysisDecoded === null
      ? null
      : buildAnalysisRecord(analysisDate, analysisDecoded, forecastDecoded);
  if (analysisRecord !== null) {
    log(
      `analysis (${analysisDate}): ${String(analysisRecord.timeStepCount)} step(s), grid ` +
        `${analysisRecord.gridIdenticalToForecast ? 'IDENTICAL to' : 'DIFFERENT from'} the ` +
        'forecast grid.',
    );
  }

  // ── province evidence from the PRODUCTION decode ──────────────────────────
  const provinces: AirQualityProbeProvinceRecord[] = forecastDecoded.provinces.map((province) => {
    const firstStepValues = {} as Record<AirQualityPollutant, number | null>;
    const nullStepCounts = {} as Record<AirQualityPollutant, number>;
    for (const pollutant of ALL_AIR_QUALITY_POLLUTANTS) {
      const series = province.series[pollutant];
      firstStepValues[pollutant] = series[0] ?? null;
      nullStepCounts[pollutant] = series.filter((value) => value === null).length;
    }
    return {
      plateCode: province.plateCode,
      requestedLatitude: province.requestedLatitude,
      requestedLongitude: province.requestedLongitude,
      gridLatitude: province.gridLatitude,
      gridLongitude: province.gridLongitude,
      distanceKm: province.distanceKm,
      thresholdKm: province.thresholdKm,
      withinThreshold:
        province.distanceKm !== null &&
        province.thresholdKm !== null &&
        province.distanceKm <= province.thresholdKm,
      outsideDomain: province.outsideDomain,
      support: province.support,
      firstStepValues,
      nullStepCounts,
    };
  });

  const artifact: AirQualityProbeArtifact = {
    generatedAtUtc: nowImpl().toISOString(),
    sourceMode: fromFile === null ? 'ads-probe' : 'from-file',
    userAgent: USER_AGENT,
    baseUrl: ADS_BASE_URL,
    datasetId: ADS_DATASET_ID,
    runDate,
    areaSent: AIR_QUALITY_AREA,
    decoderVersion: CAMS_DECODER_VERSION,
    longitudeAxis: forecastDecoded.longitudeAxis,
    latitudeAxis: forecastDecoded.latitudeAxis,
    timeStepCount: forecastDecoded.timeHours.length,
    fileVariableNames: forecastDecoded.fileVariableNames,
    units: forecastDecoded.units,
    unitFirstCodePoint: forecastDecoded.units[AirQualityPollutant.Pm2_5]?.codePointAt(0) ?? null,
    fillValues: forecastDecoded.fillValues,
    provinces,
    analysis: analysisRecord,
    jobsListProbe:
      measurements.list === null
        ? null
        : {
            ...measurements.list,
            detailKeys: measurements.detail?.detailKeys ?? [],
            detailEchoesRequestInputs: measurements.detail?.detailEchoesRequestInputs ?? false,
          },
    jobs,
    requests,
    totals: {
      requestCount: requests.length,
      downloadedBytes: jobs.reduce((sum, job) => sum + job.downloadedBytes, 0),
      wallClockMs: Date.now() - startedAtMs,
    },
    assertions: [],
  };
  artifact.assertions = evaluateProbeAssertions(artifact, apiKey);

  // ── write the artifact ────────────────────────────────────────────────────
  await mkdir(options.outputDir, { recursive: true });
  const serialised = `${JSON.stringify(artifact, null, 2)}\n`;
  if (
    apiKey !== null &&
    (serialised.includes(apiKey) || serialised.includes(encodeURIComponent(apiKey)))
  ) {
    // Belt and braces over the by-construction guarantee; also asserted below.
    throw new AirQualityProbeError(
      'the serialised artifact contains key material — NOT writing it.',
    );
  }
  await writeFile(artifactPath, serialised, 'utf8');

  for (const result of artifact.assertions) {
    log(`${result.passed ? 'PASS' : 'FAIL'} ${result.id}: ${result.detail}`);
  }
  const failures = artifact.assertions.filter((result) => !result.passed);
  if (failures.length > 0) {
    // The artifact WAS written — a failed run's evidence is what fixes it. Exit non-zero.
    throw new AirQualityProbeError(
      `${String(failures.length)} assertion(s) FAILED:\n  ` +
        failures.map((result) => `${result.id}: ${result.detail}`).join('\n  '),
    );
  }
  log(
    `probe done — ${String(requests.length)} request(s), ` +
      `${String(artifact.totals.downloadedBytes)} B downloaded, raw archives in ` +
      `${options.rawDir}, artifact at ${artifactPath}.`,
  );
}

/** Structural gate over the artifact (facts are recorded, structure is asserted). */
export function evaluateProbeAssertions(
  artifact: AirQualityProbeArtifact,
  apiKey: string | null,
): AirQualityProbeArtifact['assertions'] {
  const results: AirQualityProbeArtifact['assertions'] = [];
  const push = (id: string, passed: boolean, detail: string): void => {
    results.push({ id, passed, detail });
  };

  push(
    'provinces-81',
    artifact.provinces.length === 81,
    `${String(artifact.provinces.length)} province rows (expected 81).`,
  );
  const outside = artifact.provinces.filter((province) => province.outsideDomain);
  push(
    'domain-coverage',
    outside.length === 0,
    `${String(outside.length)} province(s) outside the domain.`,
  );
  const offThreshold = artifact.provinces.filter((province) => !province.withinThreshold);
  push(
    'distance-threshold',
    offThreshold.length === 0,
    offThreshold.length === 0
      ? 'every province within its latitude-based threshold.'
      : `over threshold: ${offThreshold.map((province) => province.plateCode).join(', ')}`,
  );
  push(
    'unit-codepoint',
    artifact.unitFirstCodePoint === 0xb5,
    `first unit code point 0x${(artifact.unitFirstCodePoint ?? 0).toString(16)} (expected 0xb5).`,
  );
  const fillCount = Object.keys(artifact.fillValues).length;
  push(
    'fill-values-read',
    fillCount === 5,
    `${String(fillCount)}/5 _FillValue attributes read from the file.`,
  );
  push(
    'axis-directions',
    artifact.longitudeAxis.step > 0 && artifact.latitudeAxis.step < 0,
    `lon step ${String(artifact.longitudeAxis.step)}, lat step ${String(artifact.latitudeAxis.step)} ` +
      '(expected +, −).',
  );
  // The three assertions below BIND the production shape instead of merely recording it: a
  // 2-step file, or an all-fill run, must fail the probe loudly, not pass as "9/9".
  push(
    'time-steps-97',
    artifact.timeStepCount === PRODUCTION_FORECAST_STEP_COUNT,
    `${String(artifact.timeStepCount)} time step(s) (the production request asks for exactly ` +
      `${String(PRODUCTION_FORECAST_STEP_COUNT)}).`,
  );
  const supportEntries = artifact.provinces.flatMap((province) => Object.values(province.support));
  const notOk = supportEntries.filter((status) => status !== AirQualityStatus.Ok).length;
  push(
    'support-all-ok',
    supportEntries.length > 0 && notOk === 0,
    `${String(notOk)}/${String(supportEntries.length)} province×pollutant support entries not "ok".`,
  );
  const totalSteps = artifact.provinces.reduce(
    (sum, province) => sum + Object.keys(province.nullStepCounts).length * artifact.timeStepCount,
    0,
  );
  const nullSteps = artifact.provinces.reduce(
    (sum, province) =>
      sum + Object.values(province.nullStepCounts).reduce((inner, count) => inner + count, 0),
    0,
  );
  push(
    'null-step-budget',
    totalSteps > 0 && nullSteps <= totalSteps * 0.05,
    `${String(nullSteps)}/${String(totalSteps)} null steps (budget 5%; measured baseline 0).`,
  );
  // The two network gates below must not pass VACUOUSLY on an artifact with no jobs, which is
  // exactly the shape an offline `--from-file` re-derivation produces. So each branch asserts a
  // different, falsifiable fact: live runs must have jobs and all of them verified/deleted;
  // offline runs must have NO jobs at all (a from-file artifact carrying job records would mean
  // the "zero network calls" promise was broken).
  const offline = artifact.sourceMode === 'from-file';
  push(
    'checksums-verified',
    offline
      ? artifact.jobs.length === 0
      : artifact.jobs.length > 0 && artifact.jobs.every((job) => job.checksumVerified),
    offline
      ? `offline re-derivation: ${String(artifact.jobs.length)} job record(s) (expected 0).`
      : `${String(artifact.jobs.length)} job(s), every download matched its declared MD5.`,
  );
  push(
    'jobs-deleted',
    offline
      ? artifact.jobs.length === 0
      : artifact.jobs.length > 0 && artifact.jobs.every((job) => job.deleted),
    offline
      ? 'offline re-derivation: no ADS job to clean up.'
      : 'every ADS job was DELETEd after download (politeness).',
  );

  // ── A2a measurement gates (plan §3) ────────────────────────────────────────
  // Ö-A2-1/Ö-A2-2: the content-type of EVERY response is recorded. Without this the DELETE and
  // download header answers could go missing from the artifact and nobody would notice — the
  // ingest would then be coded against a guess, which is the one thing the plan forbids.
  const withoutContentTypeField = artifact.requests.filter(
    (request) => !('contentType' in request),
  ).length;
  push(
    'content-type-recorded',
    offline
      ? artifact.requests.length === 0
      : artifact.requests.length > 0 && withoutContentTypeField === 0,
    offline
      ? `offline re-derivation: ${String(artifact.requests.length)} HTTP request(s) (expected 0).`
      : `${String(artifact.requests.length)} request(s) recorded, all carrying a content-type ` +
          'observation (Ö-A2-1/Ö-A2-2).',
  );
  // Ö-A2-5: the analysis product was requested for EXACTLY D−1 and decoded to the 24-step
  // ladder. The date arithmetic is asserted from the artifact's own two dates, so a future
  // offset change cannot pass unnoticed.
  const analysis = artifact.analysis;
  push(
    'analysis-d-minus-1',
    offline
      ? analysis === null || analysis.requestDate === analysisDateFor(artifact.runDate)
      : analysis !== null && analysis.requestDate === analysisDateFor(artifact.runDate),
    analysis === null
      ? `no analysis evidence in this artifact (source mode ${artifact.sourceMode}).`
      : `analysis requested for ${analysis.requestDate}, exactly one day before the forecast run ` +
          `day ${artifact.runDate}.`,
  );
  push(
    'analysis-24-steps',
    analysis === null ? offline : analysis.timeStepCount === ANALYSIS_STEP_COUNT,
    analysis === null
      ? 'no analysis file was decoded.'
      : `${String(analysis.timeStepCount)} analysis step(s) (the request asks for exactly ` +
          `${String(ANALYSIS_STEP_COUNT)} hourly times).`,
  );
  // R11: the two products must be read from the SAME grid cells. A drift here produces a merged
  // series that errors nowhere and simply lies about where the past came from.
  push(
    'analysis-grid-identical',
    analysis === null ? offline : analysis.gridIdenticalToForecast,
    analysis === null
      ? 'no analysis file was decoded.'
      : analysis.gridIdenticalToForecast
        ? 'the analysis grid is bit-identical to the forecast grid for all 81 provinces.'
        : `grid MISMATCH for plate code(s): ${analysis.gridMismatchPlateCodes.join(', ')}`,
  );
  // Ö-A2-3: the reconciliation surface was actually measured on a live run.
  push(
    'jobs-list-measured',
    offline ? artifact.jobsListProbe === null : artifact.jobsListProbe !== null,
    artifact.jobsListProbe === null
      ? `no GET /jobs measurement in this artifact (source mode ${artifact.sourceMode}).`
      : `GET /jobs answered HTTP ${String(artifact.jobsListProbe.httpStatus)}; entry keys ` +
          `[${artifact.jobsListProbe.entryKeys.join(', ')}]; echoes request inputs: ` +
          `${String(artifact.jobsListProbe.entryEchoesRequestInputs)}.`,
  );

  const serialised = JSON.stringify(artifact);
  push(
    'no-key-material',
    apiKey === null || apiKey.length === 0
      ? true
      : !serialised.includes(apiKey) && !serialised.includes(encodeURIComponent(apiKey)),
    'the artifact contains no ADS key material.',
  );
  return results;
}

// ─── offline / evidence helpers ─────────────────────────────────────────────

/**
 * The keys under which a provider could plausibly echo the inputs we submitted.
 *
 * Only their PRESENCE is reported. If the answer is yes, the A2 reconciliation can hold an
 * adopted job against our own recorded request body; if no, it must fall back on the weaker
 * "exactly one unknown candidate inside our submit window" rule (plan §5.3).
 */
function echoesRequestInputs(body: Record<string, unknown>): boolean {
  return ['inputs', 'request', 'requestBody', 'parameters'].some((key) => key in body);
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** Read a raw archive, or `null` when it simply is not there (any other error still throws). */
async function readOptionalFile(path: string): Promise<Uint8Array | null> {
  try {
    return new Uint8Array(await readFile(path));
  } catch (error: unknown) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

/**
 * The run day an offline re-run must decode against: the one the COMMITTED artifact records.
 *
 * Deliberately not a flag and not the clock. The decoder cross-validates the day against the
 * file's own `long_name`, so this is the value that makes a `--from-file` re-derivation either
 * reproduce the committed measurement exactly or fail loudly — never quietly re-label it.
 */
async function readRunDateFromArtifact(artifactPath: string): Promise<string> {
  let raw: string;
  try {
    raw = await readFile(artifactPath, 'utf8');
  } catch (error: unknown) {
    throw new AirQualityProbeError(
      `--from-file needs the previous artifact at ${artifactPath} to know which run day the raw ` +
        'archive belongs to; it is not there. Run the live probe first.',
      { cause: error },
    );
  }
  const parsed: unknown = JSON.parse(raw);
  const runDate =
    typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>).runDate
      : undefined;
  if (typeof runDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(runDate)) {
    throw new AirQualityProbeError(
      `${artifactPath} carries no usable "runDate" — refusing to guess which day the raw ` +
        'archive belongs to.',
    );
  }
  return runDate;
}

/**
 * Assemble the analysis evidence, including the grid-identity comparison behind risk R11.
 *
 * "Identical" is checked at the level that matters for the merge: every province must resolve
 * to the SAME cell centre in both products. Comparing only the axis summaries would miss a
 * shifted grid that happens to share its first/last/step.
 */
function buildAnalysisRecord(
  requestDate: string,
  analysis: CamsDecodedFile,
  forecast: CamsDecodedFile,
): AirQualityProbeAnalysisRecord {
  const forecastByPlate = new Map(
    forecast.provinces.map((province) => [province.plateCode, province]),
  );
  const mismatches = analysis.provinces
    .filter((province) => {
      const counterpart = forecastByPlate.get(province.plateCode);
      return (
        counterpart === undefined ||
        counterpart.gridLatitude !== province.gridLatitude ||
        counterpart.gridLongitude !== province.gridLongitude
      );
    })
    .map((province) => province.plateCode);

  return {
    requestDate,
    timeStepCount: analysis.timeHours.length,
    timeHours: analysis.timeHours,
    longitudeAxis: analysis.longitudeAxis,
    latitudeAxis: analysis.latitudeAxis,
    gridIdenticalToForecast:
      mismatches.length === 0 && analysis.provinces.length === forecast.provinces.length,
    gridMismatchPlateCodes: mismatches,
  };
}

// ─── small parsing helpers (fail loudly, never guess) ───────────────────────

function asRecord(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new AirQualityProbeError(`${what}: expected a JSON object.`);
  }
  return value as Record<string, unknown>;
}

function asNumber(value: unknown, what: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new AirQualityProbeError(`${what}: expected a finite number, got ${String(value)}.`);
  }
  return value;
}

function asString(value: unknown, what: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new AirQualityProbeError(`${what}: expected a non-empty string.`);
  }
  return value;
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function secondsBetween(fromIso: string | null, toIso: string | null): number | null {
  if (fromIso === null || toIso === null) return null;
  const from = Date.parse(fromIso);
  const to = Date.parse(toIso);
  if (Number.isNaN(from) || Number.isNaN(to)) return null;
  return Math.round((to - from) / 100) / 10;
}

/** `GET /jobs/{id}/results` → the single asset's href/size/checksum (`file:local_path` ignored, never logged). */
function extractResultAsset(
  body: unknown,
  what: string,
): { href: string; size: number; checksum: string } {
  const root = asRecord(body, what);
  const asset = asRecord(root.asset, `${what}.asset`);
  const value = asRecord(asset.value, `${what}.asset.value`);
  return {
    href: asString(value.href, `${what} href`),
    size: asNumber(value['file:size'], `${what} file:size`),
    checksum: asString(value['file:checksum'], `${what} file:checksum`),
  };
}
