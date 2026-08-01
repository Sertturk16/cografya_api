import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  AirQualityPollutant,
  AirQualityStatus,
  ALL_AIR_QUALITY_POLLUTANTS,
} from '../../air-quality/air-quality.types';
import { CAMS_DECODER_VERSION, decodeCamsFile } from '../../air-quality/cams/cams-decode';
import type { CamsDecodedFile } from '../../air-quality/cams/cams-decode';
import { CAMS_VARIABLES } from '../../air-quality/cams/cams-variables';
import {
  readBodyCappedBytes,
  UpstreamOversizedResponseError,
} from '../../upstream/upstream-http.helpers';
import { SEED_PROVINCES } from '../seeds/province.seed-data';
import type {
  AirQualityProbeArtifact,
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
 * Two ADS jobs, serial-polite: the PRODUCTION SHAPE (5 pollutants × 97 steps, TR `area`,
 * `costing` 485 of 5000) and a MINI shape (1 pollutant × 1 step — the committed golden
 * fixture, ~56 KB). For each: costing → execution → poll → results → guarded download →
 * decode with the REAL 81 province reference points → `DELETE` (politeness; results live
 * ~1.5–2 days on the provider's cache disks). Evidence goes to
 * `data/air-quality/air-quality-probe.json`; the mini archive goes to
 * `test/fixtures/cams/`.
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

/** Committed fixture filename — referenced by `cams-golden.spec.ts` and the fixtures README. */
export const FIXTURE_ARCHIVE_NAME = 'mini-tr-pm25-1step.zip';

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
 * Redact the ADS key wherever it might be echoed (error bodies, URLs, provider prose). Also
 * covers the URL-encoded form — a key inside a query string arrives percent-encoded.
 */
export function redactAdsSecret(text: string, secret: string | null): string {
  if (secret === null || secret.length === 0) return text;
  return text.split(secret).join('[REDACTED]').split(encodeURIComponent(secret)).join('[REDACTED]');
}

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
    leadtime_hour: Array.from({ length: 97 }, (_unused, hour) => String(hour)),
    area: [...AIR_QUALITY_AREA],
    data_format: 'netcdf_zip',
  };
}

/** The mini fixture body: 1 pollutant × 1 step (the committed ~56 KB golden file). */
export function buildFixtureRequestBody(runDate: string): Record<string, unknown> {
  return {
    ...buildProductionRequestBody(runDate),
    variable: [CAMS_VARIABLES[0]?.requestName ?? 'particulate_matter_2.5um'],
    leadtime_hour: ['0'],
  };
}

// ─── the run ─────────────────────────────────────────────────────────────────

export interface AirQualityProbeOptions {
  /** Where the artifact JSON is written (`data/air-quality`). */
  outputDir: string;
  /** Where the mini fixture archive is written (`test/fixtures/cams`). */
  fixtureDir: string;
  /** Injected for tests; defaults to process env / global fetch / real timers. */
  apiKey?: string;
  fetchImpl?: typeof fetch;
  sleepImpl?: (ms: number) => Promise<void>;
  nowImpl?: () => Date;
}

interface RawResponse {
  status: number;
  contentType: string;
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
  const apiKey = options.apiKey ?? process.env.ADS_API_KEY ?? null;
  if (apiKey === null || apiKey.length === 0) {
    throw new AirQualityProbeError(
      'ADS_API_KEY is not set. The probe reads it from the environment SCRIPT-LOCALLY (it is ' +
        'deliberately not part of the app boot schema in A1).',
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
    const record: AirQualityProbeRequestRecord = {
      label,
      method,
      url,
      httpStatus: response.status,
      bytes: bytes.byteLength,
      durationMs: Date.now() - startedAt,
    };
    requests.push(record);
    return {
      status: response.status,
      contentType: response.headers.get('content-type') ?? '',
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

  const runDate = runDateFor(nowImpl());
  const expectedRunDay = runDate.replaceAll('-', '');
  const points = SEED_PROVINCES.map((province) => ({
    plateCode: province.plateCode,
    latitude: province.latitude,
    longitude: province.longitude,
  }));
  log(
    `probe phase — 2 ADS jobs against ${ADS_DATASET_ID}, run day ${runDate}, serial and ` +
      'polite (1 s spacing, 30 s polls, DELETE after download).',
  );

  const runJob = async (
    label: 'production' | 'fixture',
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
      throw new AirQualityProbeError(
        `${label}: jobID "${jobId}" has an unexpected shape — refusing to build URLs from it.`,
      );
    }
    log(`${label}: queued as job ${jobId}.`);

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

    // 6 — decode with the real 81 province points.
    const decodeStartedAt = Date.now();
    const decoded = decodeCamsFile(download.bytes, {
      expectedRunDate: expectedRunDay,
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

  // ── the two jobs, serial ───────────────────────────────────────────────────
  const production = await runJob(
    'production',
    buildProductionRequestBody(runDate),
    ALL_AIR_QUALITY_POLLUTANTS,
  );
  const fixture = await runJob('fixture', buildFixtureRequestBody(runDate), [
    AirQualityPollutant.Pm2_5,
  ]);
  jobs.push(production.job, fixture.job);

  // ── province evidence from the PRODUCTION decode ──────────────────────────
  const provinces: AirQualityProbeProvinceRecord[] = production.decoded.provinces.map(
    (province) => {
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
    },
  );

  const artifact: AirQualityProbeArtifact = {
    generatedAtUtc: nowImpl().toISOString(),
    userAgent: USER_AGENT,
    baseUrl: ADS_BASE_URL,
    datasetId: ADS_DATASET_ID,
    runDate,
    areaSent: AIR_QUALITY_AREA,
    decoderVersion: CAMS_DECODER_VERSION,
    longitudeAxis: production.decoded.longitudeAxis,
    latitudeAxis: production.decoded.latitudeAxis,
    timeStepCount: production.decoded.timeHours.length,
    fileVariableNames: production.decoded.fileVariableNames,
    units: production.decoded.units,
    unitFirstCodePoint: production.decoded.units[AirQualityPollutant.Pm2_5]?.codePointAt(0) ?? null,
    fillValues: production.decoded.fillValues,
    provinces,
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

  // ── write fixture + artifact ──────────────────────────────────────────────
  await mkdir(options.fixtureDir, { recursive: true });
  await writeFile(join(options.fixtureDir, FIXTURE_ARCHIVE_NAME), fixture.archive);
  await mkdir(options.outputDir, { recursive: true });
  const serialised = `${JSON.stringify(artifact, null, 2)}\n`;
  if (serialised.includes(apiKey) || serialised.includes(encodeURIComponent(apiKey))) {
    // Belt and braces over the by-construction guarantee; also asserted below.
    throw new AirQualityProbeError(
      'the serialised artifact contains key material — NOT writing it.',
    );
  }
  await writeFile(join(options.outputDir, 'air-quality-probe.json'), serialised, 'utf8');

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
      `${String(artifact.totals.downloadedBytes)} B downloaded, fixture written to ` +
      `${join(options.fixtureDir, FIXTURE_ARCHIVE_NAME)}.`,
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
    artifact.timeStepCount === 97,
    `${String(artifact.timeStepCount)} time step(s) (the production request asks for exactly 97).`,
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
  push(
    'checksums-verified',
    artifact.jobs.every((job) => job.checksumVerified),
    'every download matched its declared MD5.',
  );
  push(
    'jobs-deleted',
    artifact.jobs.every((job) => job.deleted),
    'every ADS job was DELETEd after download (politeness).',
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
