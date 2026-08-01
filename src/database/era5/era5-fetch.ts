import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  readBodyCappedBytes,
  UpstreamOversizedResponseError,
} from '../../upstream/upstream-http.helpers';
import { SEED_PROVINCES } from '../seeds/province.seed-data';
import { canonicalJson } from '../climate/canonical-json';
import { evaluateEra5Assertions } from './era5-assertions';
import type {
  Era5JobRecord,
  Era5Manifest,
  Era5RequestRecord,
  Era5SeriesArtifact,
} from './era5-artifact.types';
import { decodeEra5File, type Era5DecodedFile } from './era5-decode';
import { extractEra5Provinces } from './era5-extract';
import {
  buildFixtureRequestBody,
  buildProductionRequestBody,
  CDS_BASE_URL,
  ERA5_AREA,
  ERA5_DATASET_DOI,
  ERA5_DATASET_ID,
  ERA5_DATASET_URL,
  ERA5_EXPECTED_MONTH_COUNT,
  ERA5_FIRST_YEAR,
  ERA5_LAST_YEAR,
  ERA5_VARIABLES,
} from './era5-request';
import { Era5ContractError } from './era5.errors';
import { readDecoderIdentity } from './hdf5/jsfive.adapter';

/**
 * `pnpm db:import:era5 --phase=fetch` — the ONLY thing in PR-1 that touches the network, run BY
 * HAND, once, to produce the committed artifacts and the committed mini golden fixture. It is not
 * scheduled, not on any request path, and CI never runs it (the MGM/CAMS two-phase precedent,
 * ENGINEERING §5).
 *
 * ## What one run does
 * Two CDS jobs, SERIAL: the production shape (2 variables × 1991–2020 × 12 months, measured
 * `costing` 1 440 of 120 000) and a mini shape (one variable × one month — the committed golden
 * fixture). For each: costing → execution → poll → results → guarded download → **verify** →
 * `DELETE`. Then one decode, the 81-province extraction, and the artifacts.
 *
 * ## Serial by construction, and `Promise.all` is BANNED in this file
 * Account-level concurrency measured **1**: a second job sits in `accepted` until the first
 * finishes, so parallel submission buys nothing and only makes us a worse citizen. The two jobs
 * are awaited one after the other. Do not "optimise" this.
 *
 * ## Why a script-local HTTP client, not `UpstreamHttpClient`
 * The recorded A1 precedent, verbatim: that client is GET-only by design (its options carry no
 * `method`) and demands budget/breaker/deadline objects, while the CDS queue needs POST and
 * DELETE. Teaching it verbs would be an `src/upstream` change, which PR-1 does not make. So this
 * is a minimal serial client with no guards to mis-copy — nobody waits on a hand-run tool — while
 * the ONE primitive that must never be re-implemented, response byte metering, is reused verbatim
 * (`readBodyCappedBytes`).
 *
 * ## Security bindings (SPEC §5.4, all unit-tested)
 * - The CDS key is read from process env HERE, script-locally. It never enters `env.schema.ts`:
 *   a hand-run migration must not become a deploy precondition (the A1 + climate precedent).
 * - JSON API calls send `PRIVATE-TOKEN`; the DOWNLOAD call NEVER does (measured: the object store
 *   authenticates nothing, and a defaulted header would hand our key to a third host).
 * - The base URL and the download host allowlist are **script-local constants, not env** — a
 *   deviation from SPEC §5.4's table, taken on purpose (ruling S2). An env-supplied base URL is
 *   the single lever that would send the `PRIVATE-TOKEN` header to an attacker's host, and a
 *   hand-run CLI gains nothing from that flexibility. A1 set the zero-env precedent.
 * - `redirect: 'error'` always; the `jobID` passes a shape gate BEFORE it is interpolated.
 * - Everything printed or persisted passes {@link redactCdsSecret}, and the serialised artifacts
 *   are scanned for the key before they are written.
 *
 * ## The DELETE ordering is a HARD rule, not politeness sequencing
 * Measured: after `DELETE /jobs/{id}` both the job and its results answer 404 IMMEDIATELY. The
 * result file's natural lifetime could not be measured in one session (V1), so no re-download
 * window is assumed. `DELETE` is therefore called only after the bytes are on disk AND verified.
 * `era5-fetch.spec.ts` pins the call ORDER, not just the presence of the call.
 */

/** Download host allowlist — script-local constant (ruling S2). Measured; same host as ADS. */
export const CDS_OBJECT_STORE_HOST_ALLOWLIST: readonly string[] = [
  'object-store.os-api.cci2.ecmwf.int',
];

/** Hard byte ceiling for one downloaded file: 64 MiB, ~3.4× the measured 19 801 767 B. */
export const ERA5_MAX_DOWNLOAD_BYTES = 67_108_864;

/** Committed fixture filename — referenced by `era5-golden.spec.ts` and the fixtures README. */
export const FIXTURE_FILE_NAME = 'mini-tr-t2m-1991-01.nc';

/** Raw production filename inside `--raw-dir`. Never committed. */
export const RAW_FILE_NAME = 'era5-land-1991-2020.nc';

export const MANIFEST_FILE_NAME = 'era5-manifest.json';
export const SERIES_FILE_NAME = 'era5-province-series.json';

const USER_AGENT =
  'CografyaPlatformBot/1.0 (educational geography platform; ERA5-Land climate migration; run by hand)';

const LICENCE = 'CC-BY-4.0';

/** Verbatim, because the licence requires this exact sentence to travel with the data. */
const REQUIRED_ATTRIBUTION =
  'Generated using Copernicus Climate Change Service information 2026. Neither the European ' +
  'Commission nor ECMWF is responsible for any use that may be made of the Copernicus ' +
  'information or data it contains.';

const JSON_TIMEOUT_MS = 30_000;
const DOWNLOAD_TIMEOUT_MS = 600_000;
const JSON_MAX_BYTES = 2 * 1024 * 1024;
const DELAY_BETWEEN_REQUESTS_MS = 1_000;
const POLL_INTERVAL_MS = 30_000;

/**
 * 360 polls × 30 s = **3 hours per job**. Deliberately NOT sized against the measured ~102 s
 * end-to-end: that was a single 8-minute Saturday window (V2), and ECMWF states its own queue is
 * load-sensitive. A budget built on a lucky measurement is how a hand-run tool learns to give up
 * on a healthy queue.
 */
const MAX_POLLS_PER_JOB = 360;

export class Era5FetchError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(`[era5 fetch] ${message}`, options);
    this.name = 'Era5FetchError';
  }
}

// ─── pure, unit-tested security/shape helpers ────────────────────────────────

/** Headers for CDS JSON endpoints — the ONLY place the key enters a request. */
export function buildCdsJsonHeaders(apiKey: string): Record<string, string> {
  return {
    'PRIVATE-TOKEN': apiKey,
    'Content-Type': 'application/json',
    'User-Agent': USER_AGENT,
  };
}

/**
 * Headers for the object-store download. NO `PRIVATE-TOKEN`, by contract (SPEC §5.4): the result
 * host authenticates nothing (measured: HTTP 200 with the header never sent), and sending the key
 * there would leak it across a trust boundary. Its ABSENCE is asserted by a unit test.
 */
export function buildDownloadHeaders(): Record<string, string> {
  return { 'User-Agent': USER_AGENT };
}

/** Refuse any download target that is not https on an allowlisted HOST (SSRF class). */
export function assertAllowedDownloadHost(
  href: string,
  allowlist: readonly string[] = CDS_OBJECT_STORE_HOST_ALLOWLIST,
): URL {
  let url: URL;
  try {
    url = new URL(href);
  } catch (error: unknown) {
    throw new Era5FetchError(`result href is not a valid URL: ${href}`, { cause: error });
  }
  if (url.protocol !== 'https:') {
    throw new Era5FetchError(`result href protocol "${url.protocol}" is not https.`);
  }
  // HOST level, never path level: the bucket path changes from job to job (measured
  // `cci2-prod-cache-1/2/3`), so a path-bound check would reject a perfectly good file.
  if (!allowlist.includes(url.hostname)) {
    throw new Era5FetchError(
      `result href host "${url.hostname}" is not in the download allowlist ` +
        `[${allowlist.join(', ')}] — refusing to follow a provider-supplied URL off-list.`,
    );
  }
  return url;
}

/** Redact the CDS key wherever it might be echoed, including its percent-encoded form. */
export function redactCdsSecret(text: string, secret: string | null): string {
  if (secret === null || secret.length === 0) return text;
  return text.split(secret).join('[REDACTED]').split(encodeURIComponent(secret)).join('[REDACTED]');
}

// ─── the run ─────────────────────────────────────────────────────────────────

export interface Era5FetchOptions {
  /** Where the raw `.nc` is written. MANDATORY — it must never default inside the repo. */
  rawDir: string;
  /** Where the manifest + series artifacts go (`data/era5-land`). */
  outputDir: string;
  /** Where the mini golden fixture goes (`test/fixtures/era5`). */
  fixtureDir: string;
  /**
   * Re-run offline from a raw file already on disk: decode + extract + artifacts, ZERO network
   * calls (ruling S3). The cheap answer to V1's "no re-download window is assumed" — an
   * interrupted run does not have to make the provider produce the same 18.88 MiB twice.
   */
  fromFile?: string | null;
  apiKey?: string;
  fetchImpl?: typeof fetch;
  sleepImpl?: (ms: number) => Promise<void>;
  nowImpl?: () => Date;
  /**
   * Injected for tests only, alongside `fetchImpl`/`sleepImpl`/`nowImpl`. It lets the HTTP and
   * file-handling choreography — the DELETE-after-verify ORDER, the `.part` → rename, the
   * token-free download — be pinned without shipping an HDF5 writer to fabricate a 19 MB payload.
   */
  decodeImpl?: typeof decodeEra5File;
}

interface RawResponse {
  status: number;
  bytes: Uint8Array;
  durationMs: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runEra5FetchPhase(options: Era5FetchOptions): Promise<void> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleepImpl = options.sleepImpl ?? sleep;
  const nowImpl = options.nowImpl ?? ((): Date => new Date());
  const decodeImpl = options.decodeImpl ?? decodeEra5File;
  const fromFile = options.fromFile ?? null;
  const startedAtMs = Date.now();

  const apiKey = fromFile === null ? (options.apiKey ?? process.env.CDS_API_KEY ?? null) : null;
  if (fromFile === null && (apiKey === null || apiKey.length === 0)) {
    throw new Era5FetchError(
      'CDS_API_KEY is not set. The fetch phase reads it from the environment SCRIPT-LOCALLY — it ' +
        'is deliberately NOT part of the app boot schema (a hand-run migration cannot be a deploy ' +
        'precondition). Export it for this one command, or re-run offline with --from-file=<path>.',
    );
  }

  const requests: Era5RequestRecord[] = [];
  const jobs: Era5JobRecord[] = [];
  const redact = (text: string): string => redactCdsSecret(text, apiKey);
  const log = (message: string): void => {
    console.log(redact(`[db:import:era5] ${message}`));
  };

  /** One serial call. Non-2xx statuses are returned (evidence); transport failures throw. */
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
        // A redirect is the one way a peer picks the host this process talks to — refused
        // outright, and measured unnecessary (0 redirects on every probe download).
        redirect: 'error',
      });
      bytes = await readBodyCappedBytes(response, url, maxBytes);
    } catch (error: unknown) {
      if (error instanceof UpstreamOversizedResponseError) {
        throw new Era5FetchError(redact(error.message), { cause: error });
      }
      throw new Era5FetchError(
        redact(`${label}: transport failure for ${method} ${url}: ${String(error)}`),
        { cause: error },
      );
    }
    const record: Era5RequestRecord = {
      label,
      method,
      url,
      httpStatus: response.status,
      bytes: bytes.byteLength,
      durationMs: Date.now() - startedAt,
    };
    requests.push(record);
    return { status: response.status, bytes, durationMs: record.durationMs };
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
      buildCdsJsonHeaders(apiKey ?? ''),
      JSON_TIMEOUT_MS,
      JSON_MAX_BYTES,
    );
    const text = new TextDecoder('utf-8').decode(raw.bytes);
    let json: unknown = null;
    if (text.length > 0) {
      try {
        json = JSON.parse(text);
      } catch (error: unknown) {
        throw new Era5FetchError(
          redact(`${label}: non-JSON body (HTTP ${String(raw.status)}): ${text.slice(0, 200)}`),
          { cause: error },
        );
      }
    }
    return { status: raw.status, json };
  };

  /** Costing → execution → poll → results → guarded download → VERIFY → persist → DELETE. */
  const runJob = async (
    label: 'production' | 'fixture',
    requestBody: Record<string, unknown>,
    targetPath: string,
  ): Promise<{ job: Era5JobRecord; bytes: Uint8Array }> => {
    // 1 — costing. The endpoint answers HTTP 200 even ABOVE the limit and never refuses by
    // itself (measured on ADS): the comparison is OURS, and we do not submit when it fails.
    const costing = await jsonCall(
      `${label}.costing`,
      'POST',
      `${CDS_BASE_URL}/processes/${ERA5_DATASET_ID}/costing`,
      { inputs: requestBody },
    );
    const costingBody = asRecord(costing.json, `${label}.costing`);
    const cost = asNumber(costingBody.cost, `${label}.costing cost`);
    const limit = asNumber(costingBody.limit, `${label}.costing limit`);
    if (costing.status !== 200 || cost > limit) {
      throw new Era5FetchError(
        `${label}: costing refused or over limit (HTTP ${String(costing.status)}, cost ` +
          `${String(cost)} / limit ${String(limit)}) — NOT submitting.`,
      );
    }
    log(`${label}: costing ${String(cost)} field(s) (limit ${String(limit)}).`);

    // 2 — submit (single attempt: a blind POST retry could double-queue a job).
    const execution = await jsonCall(
      `${label}.execution`,
      'POST',
      `${CDS_BASE_URL}/processes/${ERA5_DATASET_ID}/execution`,
      { inputs: requestBody },
    );
    if (execution.status !== 201 && execution.status !== 200) {
      throw new Era5FetchError(
        redact(
          `${label}: execution answered HTTP ${String(execution.status)}: ` +
            `${JSON.stringify(execution.json).slice(0, 300)}`,
        ),
      );
    }
    const executionBody = asRecord(execution.json, `${label}.execution`);
    const jobId = asString(executionBody.jobID, `${label}.execution jobID`);
    // Shape gate BEFORE the id is interpolated into URLs: an odd/hostile jobID (`../`, `?`,
    // whitespace) must never steer the poll/results/DELETE paths. Real CDS ids are UUIDs.
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(jobId)) {
      throw new Era5FetchError(
        redact(
          `${label}: jobID "${jobId.slice(0, 128)}" has an unexpected shape — refusing to build ` +
            'URLs from it.',
        ),
      );
    }
    log(`${label}: queued as job ${jobId}.`);

    // 3 — poll until terminal.
    let statusBody: Record<string, unknown> = executionBody;
    let status = asString(executionBody.status, `${label}.status`);
    let polls = 0;
    while (status === 'accepted' || status === 'running') {
      if (polls >= MAX_POLLS_PER_JOB) {
        throw new Era5FetchError(
          `${label}: job ${jobId} is still "${status}" after ${String(polls)} polls ` +
            `(${String((MAX_POLLS_PER_JOB * POLL_INTERVAL_MS) / 3_600_000)} h). The job is still ` +
            'on the provider; re-run rather than hammering.',
        );
      }
      polls += 1;
      await sleepImpl(POLL_INTERVAL_MS);
      const poll = await jsonCall(`${label}.poll`, 'GET', `${CDS_BASE_URL}/jobs/${jobId}`, null);
      statusBody = asRecord(poll.json, `${label}.poll`);
      status = asString(statusBody.status, `${label}.poll status`);
    }
    if (status !== 'successful') {
      // `rejected` and licence 403s are TERMINAL classes — surfaced verbatim (redacted), never
      // retried against a provider that already said no.
      throw new Era5FetchError(
        redact(
          `${label}: job ${jobId} ended "${status}": ${JSON.stringify(statusBody).slice(0, 300)}`,
        ),
      );
    }
    const created = optionalString(statusBody.created);
    const started = optionalString(statusBody.started);
    const finished = optionalString(statusBody.finished);
    log(
      `${label}: successful after ${String(polls)} poll(s) — queue ` +
        `${String(secondsBetween(created, started) ?? '?')} s, run ` +
        `${String(secondsBetween(started, finished) ?? '?')} s (CDS stamps).`,
    );

    // 4 — results: the href plus the two free guards (`file:size` BEFORE the network, MD5 after).
    const results = await jsonCall(
      `${label}.results`,
      'GET',
      `${CDS_BASE_URL}/jobs/${jobId}/results`,
      null,
    );
    const asset = extractResultAsset(results.json, `${label}.results`);
    const url = assertAllowedDownloadHost(asset.href);
    if (asset.size > ERA5_MAX_DOWNLOAD_BYTES) {
      throw new Era5FetchError(
        `${label}: declared file:size ${String(asset.size)} exceeds the ` +
          `${String(ERA5_MAX_DOWNLOAD_BYTES)} B cap — not downloading.`,
      );
    }
    if (!/^[0-9a-f]{32}$/i.test(asset.checksum)) {
      throw new Era5FetchError(
        `${label}: file:checksum "${asset.checksum}" is not 32 hex chars — the provider's ` +
          'checksum algorithm changed; refusing to pretend we verified integrity.',
      );
    }

    // 5 — download. NO PRIVATE-TOKEN on this call (see the module docblock). The byte ceiling is
    // enforced twice: by `file:size` above, and by `readBodyCappedBytes` on the wire.
    const download = await call(
      `${label}.download`,
      'GET',
      url.toString(),
      null,
      buildDownloadHeaders(),
      DOWNLOAD_TIMEOUT_MS,
      ERA5_MAX_DOWNLOAD_BYTES,
    );
    if (download.status !== 200) {
      throw new Era5FetchError(`${label}: download answered HTTP ${String(download.status)}.`);
    }

    // 6 — persist to `<name>.part` and verify BEFORE the final rename, so a half file can never
    // masquerade as a complete one. Only then is the job deletable.
    await mkdir(dirNameOf(targetPath), { recursive: true });
    const partPath = `${targetPath}.part`;
    await writeFile(partPath, download.bytes);
    const computedMd5 = createHash('md5').update(download.bytes).digest('hex');
    const sha256 = createHash('sha256').update(download.bytes).digest('hex');
    if (download.bytes.byteLength !== asset.size) {
      throw new Era5FetchError(
        `${label}: downloaded ${String(download.bytes.byteLength)} B ≠ declared ` +
          `${String(asset.size)} B (kept at ${partPath}).`,
      );
    }
    const checksumVerified = computedMd5.toLowerCase() === asset.checksum.toLowerCase();
    if (!checksumVerified) {
      throw new Era5FetchError(
        `${label}: MD5 ${computedMd5} does not match the declared file:checksum ` +
          `${asset.checksum} (kept at ${partPath}).`,
      );
    }
    await rename(partPath, targetPath);
    log(
      `${label}: ${String(download.bytes.byteLength)} B verified (MD5 + SHA-256) and written to ` +
        `${targetPath}.`,
    );

    // 7 — ONLY NOW may the job be deleted. Earlier, and the job 404s permanently (measured).
    const deletion = await jsonCall(
      `${label}.delete`,
      'DELETE',
      `${CDS_BASE_URL}/jobs/${jobId}`,
      null,
    );
    const deleted = deletion.status >= 200 && deletion.status < 300;
    if (!deleted) {
      log(`${label}: DELETE answered HTTP ${String(deletion.status)} (job left to expire).`);
    }

    return {
      job: {
        label,
        requestBody,
        costing: { cost, limit },
        jobId,
        cdsStamps: { created, started, finished },
        queueSeconds: secondsBetween(created, started),
        runSeconds: secondsBetween(started, finished),
        resultHost: url.hostname,
        declaredSizeBytes: asset.size,
        downloadedBytes: download.bytes.byteLength,
        declaredChecksumMd5: asset.checksum.toLowerCase(),
        computedChecksumMd5: computedMd5,
        checksumVerified,
        sha256,
        downloadMs: download.durationMs,
        decodeMs: 0,
        deleted,
      },
      bytes: download.bytes,
    };
  };

  // ── acquire the production bytes: network, or an existing file (S3) ─────────
  const rawPath = join(options.rawDir, RAW_FILE_NAME);
  let productionBytes: Uint8Array;
  if (fromFile !== null) {
    log(`--from-file=${fromFile} — decoding an existing raw file; ZERO network calls.`);
    productionBytes = new Uint8Array(await readFile(fromFile));
  } else {
    log(
      `fetch phase — 2 CDS jobs against ${ERA5_DATASET_ID}, SERIAL (account concurrency measured ` +
        '1), 1 s spacing, 30 s polls, DELETE only after the download verifies.',
    );
    // Serial on purpose. `Promise.all` is banned in this file — see the module docblock.
    const production = await runJob('production', buildProductionRequestBody(), rawPath);
    jobs.push(production.job);
    productionBytes = production.bytes;

    const fixture = await runJob(
      'fixture',
      buildFixtureRequestBody(),
      join(options.fixtureDir, FIXTURE_FILE_NAME),
    );
    jobs.push(fixture.job);
    // The fixture is decoded too — a golden file we never proved readable is not a golden file.
    decodeImpl(fixture.bytes, FIXTURE_FILE_NAME, {
      variables: ERA5_VARIABLES.slice(0, 1),
      expectedMonthCount: 1,
    });
  }

  // ── decode + extract ───────────────────────────────────────────────────────
  const decodeStartedAt = Date.now();
  const decoded: Era5DecodedFile = decodeImpl(productionBytes, RAW_FILE_NAME, {
    expectedMonthCount: ERA5_EXPECTED_MONTH_COUNT,
  });
  const decodeMs = Date.now() - decodeStartedAt;
  const productionJob = jobs.find((job) => job.label === 'production');
  if (productionJob !== undefined) productionJob.decodeMs = decodeMs;
  log(
    `decoded ${String(productionBytes.byteLength)} B in ${String(decodeMs)} ms — ` +
      `${String(decoded.months.length)} months, ${String(decoded.latitudeAxis.length)}×` +
      `${String(decoded.longitudeAxis.length)} grid, ${String(decoded.maskedCellCount)}/` +
      `${String(decoded.totalCellCount)} cells masked.`,
  );

  const extraction = extractEra5Provinces(
    decoded,
    SEED_PROVINCES.map((province) => ({
      plateCode: province.plateCode,
      latitude: province.latitude,
      longitude: province.longitude,
    })),
  );
  for (const province of extraction.provinces.filter((entry) => entry.fallbackUsed)) {
    log(
      `A-1 fallback: ${province.plateCode} → cell (${String(province.cellLatitude)}, ` +
        `${String(province.cellLongitude)}) at ${province.fallbackDistanceKm.toFixed(2)} km.`,
    );
  }

  // ── artifacts ──────────────────────────────────────────────────────────────
  const rawSha256 = createHash('sha256').update(productionBytes).digest('hex');
  const rawMd5 = createHash('md5').update(productionBytes).digest('hex');
  const generatedAtUtc = nowImpl().toISOString();
  const firstMonth = decoded.months[0];
  const lastMonth = decoded.months[decoded.months.length - 1];

  const series: Era5SeriesArtifact = {
    schemaVersion: 1,
    generatedAtUtc,
    rawFileSha256: rawSha256,
    firstYear: ERA5_FIRST_YEAR,
    lastYear: ERA5_LAST_YEAR,
    monthCount: decoded.months.length,
    monthLabels: decoded.months.map(
      (month) => `${String(month.year)}-${String(month.month).padStart(2, '0')}`,
    ),
    provinces: extraction.series,
  };

  const manifest: Era5Manifest = {
    schemaVersion: 1,
    generatedAtUtc,
    userAgent: USER_AGENT,
    baseUrl: CDS_BASE_URL,
    datasetId: ERA5_DATASET_ID,
    datasetUrl: ERA5_DATASET_URL,
    doi: ERA5_DATASET_DOI,
    licence: LICENCE,
    requiredAttribution: REQUIRED_ATTRIBUTION,
    areaSent: ERA5_AREA,
    productionRequestBody: buildProductionRequestBody(),
    decoder: readDecoderIdentity(),
    rawFile: {
      name: RAW_FILE_NAME,
      sizeBytes: productionBytes.byteLength,
      sha256: rawSha256,
      md5: rawMd5,
    },
    axes: { latitude: decoded.latitudeSummary, longitude: decoded.longitudeSummary },
    months: {
      count: decoded.months.length,
      firstIso: firstMonth === undefined ? '' : isoMonth(firstMonth.epochSeconds),
      lastIso: lastMonth === undefined ? '' : isoMonth(lastMonth.epochSeconds),
    },
    expver: {
      distinctValues: [...new Set(decoded.expverValues)].sort(),
      count: decoded.expverValues.length,
    },
    globalAttributes: decoded.globalAttributeSummary,
    variables: decoded.variables.map((variable) => ({
      requestName: variable.mapping.requestName,
      fileName: variable.mapping.fileName,
      unitsAttribute: variable.unitsAttribute,
      conversion:
        variable.mapping.kind === 'temperature'
          ? 'K − 273.15 → °C'
          : 'm/day × days_in_month × 1000 → mm/month (stream=moda; the "m" units attribute is misleading)',
    })),
    mask: {
      maskedCells: decoded.maskedCellCount,
      totalCells: decoded.totalCellCount,
      maskedRatio:
        decoded.totalCellCount === 0 ? 0 : decoded.maskedCellCount / decoded.totalCellCount,
      timeInvariant: extraction.maskTimeInvariant,
    },
    provinces: extraction.provinces,
    fallbackPlateCodes: extraction.fallbackPlateCodes,
    jobs,
    requests,
    totals: {
      requestCount: requests.length,
      downloadedBytes: jobs.reduce((total, job) => total + job.downloadedBytes, 0),
      wallClockMs: Date.now() - startedAtMs,
    },
    assertions: [],
  };
  manifest.assertions = evaluateEra5Assertions({ manifest, series, apiKey });

  await mkdir(options.outputDir, { recursive: true });
  await writeArtifact(join(options.outputDir, MANIFEST_FILE_NAME), manifest, apiKey);
  await writeArtifact(join(options.outputDir, SERIES_FILE_NAME), series, apiKey);

  for (const result of manifest.assertions) {
    log(`${result.passed ? 'PASS' : 'FAIL'} ${result.id}: ${result.detail}`);
  }
  const failures = manifest.assertions.filter((result) => !result.passed);
  if (failures.length > 0) {
    // The artifacts WERE written — a failed run's evidence is what fixes it. Exit non-zero.
    throw new Era5FetchError(
      `${String(failures.length)} assertion(s) FAILED:\n  ` +
        failures.map((result) => `${result.id}: ${result.detail}`).join('\n  '),
    );
  }
  log(
    `done — ${String(requests.length)} request(s), ${String(manifest.totals.downloadedBytes)} B ` +
      `downloaded, artifacts in ${options.outputDir}. The raw ${String(productionBytes.byteLength)} ` +
      'B file stays OUT of git.',
  );
}

/**
 * Write one artifact deterministically, after scanning it for key material.
 *
 * Keys are sorted (`canonicalJson`, the climate precedent) and then re-indented, so two runs over
 * the same raw file produce BYTE-IDENTICAL files and a `--from-file=` re-run is verifiable by
 * `git diff` alone.
 */
async function writeArtifact(path: string, value: unknown, apiKey: string | null): Promise<void> {
  const serialised = `${JSON.stringify(JSON.parse(canonicalJson(value)), null, 2)}\n`;
  if (apiKey !== null && apiKey.length > 0) {
    if (serialised.includes(apiKey) || serialised.includes(encodeURIComponent(apiKey))) {
      // Belt and braces over the by-construction guarantee, which the assertions also check.
      throw new Era5FetchError(`${path} contains key material — NOT writing it.`);
    }
  }
  await writeFile(path, serialised, 'utf8');
}

// ─── small parsing helpers (fail loudly, never guess) ───────────────────────

function dirNameOf(path: string): string {
  const index = path.lastIndexOf('/');
  return index <= 0 ? '.' : path.slice(0, index);
}

function isoMonth(epochSeconds: number): string {
  return new Date(epochSeconds * 1000).toISOString().slice(0, 10);
}

function asRecord(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Era5FetchError(`${what}: expected a JSON object.`);
  }
  return value as Record<string, unknown>;
}

function asNumber(value: unknown, what: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Era5FetchError(`${what}: expected a finite number, got ${String(value)}.`);
  }
  return value;
}

function asString(value: unknown, what: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Era5FetchError(`${what}: expected a non-empty string.`);
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

/** `GET /jobs/{id}/results` → the single asset. `file:local_path` (an `s3://` URI) is never used. */
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

/** Era5ContractError is re-exported so callers catch one type from this module family. */
export { Era5ContractError };
