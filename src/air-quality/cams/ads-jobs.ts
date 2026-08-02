import { UpstreamSchemaError } from '../../upstream/upstream.types';
import type { AdsIngestConfig } from '../air-quality-upstream.config';
import type { AdsJobKind } from '../entities/air-quality-run.entity';
import { CAMS_VARIABLES } from './cams-variables';

/**
 * The ADS job protocol, as PURE functions: URL building, request bodies, response parsing and
 * the terminal-state vocabulary. No HTTP, no clock, no state — every one of these is unit
 * tested without a network, and the ingest target is the only thing that sequences them.
 *
 * Everything here is measured behaviour (`probe-olcumleri.md` + the A2a probe pass), never
 * documentation: the `costing` endpoint answers HTTP 200 even ABOVE the limit, `date` is
 * mandatory though undeclared in the process schema, `level` is a string list, and the job
 * detail endpoint does NOT echo the inputs we submitted.
 */

/**
 * The JSON body of an ADS job request.
 *
 * Concrete rather than `Record<string, unknown>` on purpose: this value is persisted in a jsonb
 * column, and TypeORM's write types map a column's shape recursively — an `unknown` leaf there
 * is unwritable. The measured protocol only ever uses these three value shapes anyway (note
 * `level` is a STRING list and `date` is a `from/to` string, both measured), so naming them
 * costs nothing and keeps the store free of assertions.
 */
export type AdsRequestBody = Record<string, string | string[] | number[]>;

/** Where the job protocol lives under the API root (measured). */
const RETRIEVE_PATH = 'retrieve/v1';

/** Analysis steps per job: one calendar day of hourly times. See the plan's §9.1 — not an env. */
export const ANALYSIS_HOURS_PER_JOB = 24;

/**
 * The shape a job id must have before it is ever interpolated into a URL.
 *
 * Real ADS ids are UUIDs. Anything with `../`, `?`, whitespace or unbounded length would let a
 * provider (or anyone answering as one) steer our poll/results/DELETE paths, so the id is
 * gated on SHAPE before any URL is built from it — never sanitised, never trusted.
 */
export function isPlausibleJobId(jobId: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(jobId);
}

function assertJobId(jobId: string): string {
  if (!isPlausibleJobId(jobId)) {
    // Length-capped: a refused id is arbitrary provider text and could be huge.
    throw new UpstreamSchemaError(
      `jobID "${jobId.slice(0, 128)}" has an unexpected shape — refusing to build URLs from it.`,
    );
  }
  return jobId;
}

export function costingUrl(config: AdsIngestConfig): string {
  return `${trimSlash(config.baseUrl)}/${RETRIEVE_PATH}/processes/${config.datasetId}/costing`;
}

export function executionUrl(config: AdsIngestConfig): string {
  return `${trimSlash(config.baseUrl)}/${RETRIEVE_PATH}/processes/${config.datasetId}/execution`;
}

export function jobsListUrl(config: AdsIngestConfig): string {
  return `${trimSlash(config.baseUrl)}/${RETRIEVE_PATH}/jobs`;
}

export function jobUrl(config: AdsIngestConfig, jobId: string): string {
  return `${trimSlash(config.baseUrl)}/${RETRIEVE_PATH}/jobs/${assertJobId(jobId)}`;
}

export function jobResultsUrl(config: AdsIngestConfig, jobId: string): string {
  return `${jobUrl(config, jobId)}/results`;
}

function trimSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

/** `YYYY-MM-DD` for a Date, in UTC. */
export function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** `YYYYMMDD` — what the decoder cross-validates against the file's own `time:long_name`. */
export function compactDay(isoDate: string): string {
  return isoDate.replaceAll('-', '');
}

/**
 * The run day the ingest is currently responsible for.
 *
 * Before `submitAfterUtcHour` there is no new run to start: all CAMS products close by 12:00
 * UTC, and asking earlier is asking for a file that does not exist yet. So the run day advances
 * only once that hour has passed — which is also why the variable is named "submit AFTER".
 */
export function currentRunDate(now: Date, submitAfterUtcHour: number): Date {
  const runUtc = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0),
  );
  if (now.getUTCHours() < submitAfterUtcHour) runUtc.setUTCDate(runUtc.getUTCDate() - 1);
  return runUtc;
}

/**
 * The day the ANALYSIS job asks for: exactly one day before the run day.
 *
 * A constant offset in code, not an env knob (ruling Q11). It is a property of the product, not
 * an operator preference, and it is the only choice that satisfies both requirements at once:
 * every hour labelled "analysis" is already in the past at submit time (an analysis job for D
 * was measured returning complete values for hours that had not happened yet), and the analysis
 * day cannot overlap the forecast day, so the merged series is contiguous with no hour served
 * from two products.
 */
export function analysisDateFor(runDate: string): string {
  const parsed = new Date(`${runDate}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new UpstreamSchemaError(`run date "${runDate}" is not a YYYY-MM-DD date.`);
  }
  parsed.setUTCDate(parsed.getUTCDate() - 1);
  return isoDay(parsed);
}

/** The forecast job body: 5 pollutants × (forecastHours + 1) lead times from run day D. */
export function buildForecastRequestBody(config: AdsIngestConfig, runDate: string): AdsRequestBody {
  return {
    model: ['ensemble'],
    variable: CAMS_VARIABLES.map((mapping) => mapping.requestName),
    // A STRING list, not numbers — the provider's enum is a string list (measured).
    level: ['0'],
    type: ['forecast'],
    // Mandatory though undeclared in the published process schema (measured).
    date: [`${runDate}/${runDate}`],
    time: ['00:00'],
    leadtime_hour: Array.from({ length: config.forecastHours + 1 }, (_unused, hour) =>
      String(hour),
    ),
    area: [...config.area],
    data_format: 'netcdf_zip',
  };
}

/** The analysis job body: 5 pollutants × 24 hourly analysis times of day D−1, lead time 0. */
export function buildAnalysisRequestBody(
  config: AdsIngestConfig,
  analysisDate: string,
): AdsRequestBody {
  return {
    ...buildForecastRequestBody(config, analysisDate),
    type: ['analysis'],
    time: Array.from(
      { length: ANALYSIS_HOURS_PER_JOB },
      (_unused, hour) => `${String(hour).padStart(2, '0')}:00`,
    ),
    leadtime_hour: ['0'],
  };
}

/** How many steps a job's decoded file must carry, by product. */
export function expectedStepCount(config: AdsIngestConfig, kind: AdsJobKind): number {
  return kind === 'forecast' ? config.forecastHours + 1 : ANALYSIS_HOURS_PER_JOB;
}

/** The decoder's `expectedProduct` for a job kind — never a constant at the call site. */
export function expectedProductFor(kind: AdsJobKind): 'FORECAST' | 'ANALYSIS' {
  return kind === 'forecast' ? 'FORECAST' : 'ANALYSIS';
}

// ─── response parsing ────────────────────────────────────────────────────────

export interface AdsCosting {
  readonly cost: number;
  readonly limit: number;
}

/**
 * `POST /costing` → the shape's cost and the account's limit.
 *
 * The endpoint answers **HTTP 200 even when the cost exceeds the limit** and never refuses by
 * itself (measured: `{"cost":23280,"limit":5000}` → 200). So "we called it and got no error"
 * is silently wrong: the comparison is OURS, and it lives at the call site, not here.
 */
export function parseCosting(body: string): AdsCosting {
  const record = asRecord(body, 'costing');
  return {
    cost: asNumber(record.cost, 'costing.cost'),
    limit: asNumber(record.limit, 'costing.limit'),
  };
}

export interface AdsJobStatus {
  readonly jobId: string;
  /** The provider's own vocabulary, verbatim. */
  readonly status: string;
  readonly created: string | null;
  readonly started: string | null;
  readonly finished: string | null;
}

/** `POST /execution` and `GET /jobs/{id}` share one body shape (measured). */
export function parseJobStatus(body: string, what: string): AdsJobStatus {
  const record = asRecord(body, what);
  return {
    jobId: assertJobId(asString(record.jobID, `${what}.jobID`)),
    status: asString(record.status, `${what}.status`),
    created: optionalString(record.created),
    started: optionalString(record.started),
    finished: optionalString(record.finished),
  };
}

/**
 * `DELETE /jobs/{id}` → the dismissal confirmation.
 *
 * Only `status` is required. The measured body carried more (319 B, HTTP 200 +
 * `application/json`), but the probe never recorded the DELETE body's full field list, so
 * requiring `jobID` here would stake the daily cleanup confirmation on an unmeasured
 * assumption — a body without it would then report `schema_error` (an alarm-level "contract
 * drift" event) every single day for a call whose only job is politeness (review #80 I2).
 */
export function parseJobDismissal(body: string): { readonly status: string } {
  const record = asRecord(body, 'delete');
  return { status: asString(record.status, 'delete.status') };
}

/** One entry of `GET /jobs` — measured keys, values we actually use. */
export interface AdsJobListEntry {
  readonly jobId: string;
  readonly status: string;
  readonly processId: string | null;
  readonly created: string | null;
}

/**
 * `GET /jobs` → the account's job list.
 *
 * The measured body is `{ jobs: [...], links, metadata }` and the entries do NOT echo the
 * inputs we submitted, so a reconciliation cannot verify "this job is ours" by comparing
 * request bodies. `processID` and `created` are what remain, and they are exactly what the
 * caller's narrow adoption rule uses.
 */
export function parseJobList(body: string): AdsJobListEntry[] {
  const record = asRecord(body, 'jobs');
  const jobs = record.jobs;
  if (!Array.isArray(jobs)) {
    throw new UpstreamSchemaError('jobs list: expected a "jobs" array.');
  }
  return jobs.map((entry, index) => {
    const job = asRecordValue(entry, `jobs[${String(index)}]`);
    return {
      jobId: asString(job.jobID, `jobs[${String(index)}].jobID`),
      status: asString(job.status, `jobs[${String(index)}].status`),
      processId: optionalString(job.processID),
      created: optionalString(job.created),
    };
  });
}

export interface AdsResultAsset {
  readonly href: string;
  readonly sizeBytes: number;
  readonly checksum: string;
}

/**
 * `GET /jobs/{id}/results` → the single asset.
 *
 * `file:local_path` (an `s3://` URI) is deliberately NOT read: it is not a URL we may fetch and
 * it has no diagnostic value worth persisting.
 */
export function parseResultAsset(body: string): AdsResultAsset {
  const root = asRecord(body, 'results');
  const asset = asRecordValue(root.asset, 'results.asset');
  const value = asRecordValue(asset.value, 'results.asset.value');
  const checksum = asString(value['file:checksum'], 'results file:checksum');
  if (!/^[0-9a-f]{32}$/i.test(checksum)) {
    // The algorithm is never declared in the body (only raw hex); MD5 was verified by
    // computing it. If the provider changes it, refusing beats pretending we checked.
    throw new UpstreamSchemaError(
      `file:checksum "${checksum.slice(0, 64)}" is not 32 hex characters — the provider's ` +
        'checksum algorithm changed; refusing to pretend we verified integrity.',
    );
  }
  return {
    href: asString(value.href, 'results href'),
    sizeBytes: asNumber(value['file:size'], 'results file:size'),
    checksum,
  };
}

/**
 * Refuse any download target that is not https on an allowlisted HOST.
 *
 * Host level, never path level: the bucket path changes from job to job. Following an arbitrary
 * provider-supplied URL is SSRF class, which is why this runs before the request is built and
 * why it throws rather than returning a fallback.
 */
export function assertAllowedDownloadHost(href: string, allowlist: readonly string[]): URL {
  let url: URL;
  try {
    url = new URL(href);
  } catch (error: unknown) {
    throw new UpstreamSchemaError(`result href is not a valid URL: ${href.slice(0, 128)}`, {
      cause: error,
    });
  }
  if (url.protocol !== 'https:') {
    throw new UpstreamSchemaError(`result href protocol "${url.protocol}" is not https.`);
  }
  if (!allowlist.includes(url.hostname)) {
    throw new UpstreamSchemaError(
      `result href host "${url.hostname}" is not in the download allowlist ` +
        `[${allowlist.join(', ')}] — refusing to follow a provider-supplied URL off-list.`,
    );
  }
  return url;
}

/**
 * The provider's terminal refusals — states that must NEVER be retried.
 *
 * `rejected` is the provider saying no about THIS request; retrying spends the account's quota
 * to be told the same thing. `dismissed` is a job we (or an operator) deleted.
 */
export function isTerminalProviderStatus(status: string): boolean {
  return status === 'rejected' || status === 'dismissed';
}

/**
 * A licence 403, recognised from the refusal TEXT the caller actually has.
 *
 * This one is terminal and needs a human: until the licence is accepted in the ADS profile,
 * every request from this account fails the same way, so retrying is pure noise against a
 * provider that already answered clearly.
 *
 * The match is deliberately a tolerant substring test, NOT a `JSON.parse`: what reaches the
 * call site is the shared client's composed `client_error` reason — redacted prose whose body
 * excerpt is capped at 200 bytes — so the measured `{"title":"required licences not
 * accepted"}` may arrive truncated (even mid-word) and would never survive a strict parse
 * (review #80, found by the I5 coverage test: the parse-based predicate was structurally
 * unreachable in production). The stem `licen` covers licence/license and their truncations;
 * on a 403 there is no other word it could be. Scoped to HTTP 403 via the outcome's
 * STRUCTURAL `httpStatus`, so a licence mention in any other status can never ride along.
 */
export function isLicenceRefusal(status: number | undefined, body: string): boolean {
  if (status !== 403) return false;
  return /licen/i.test(body);
}

// ─── small parsing helpers (fail loudly, never guess) ───────────────────────

function asRecord(body: string, what: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(body);
  return asRecordValue(parsed, what);
}

function asRecordValue(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new UpstreamSchemaError(`${what}: expected a JSON object.`);
  }
  return value as Record<string, unknown>;
}

function asNumber(value: unknown, what: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new UpstreamSchemaError(`${what}: expected a finite number.`);
  }
  return value;
}

function asString(value: unknown, what: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new UpstreamSchemaError(`${what}: expected a non-empty string.`);
  }
  return value;
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}
