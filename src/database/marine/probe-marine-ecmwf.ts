import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import {
  ECMWF_FORECAST_HOURS,
  ECMWF_PARAMS,
  ECMWF_STEPS,
  ECMWF_STEP_HOURS,
  type EcmwfParam,
  type EcmwfStream,
} from '../../marine/ecmwf/ecmwf.constants';
import { EcmwfContractError } from '../../marine/ecmwf/ecmwf.errors';
import { mapPointToGrid } from '../../marine/ecmwf/ecmwf-grid';
import {
  mergeByteRanges,
  parseEcmwfIndex,
  selectIndexRecords,
  toRangeHeader,
  type EcmwfByteRange,
} from '../../marine/ecmwf/ecmwf-index';
import { deriveWindDirection, deriveWindSpeed } from '../../marine/ecmwf/ecmwf-wind';
import {
  decodeGribRange,
  readCell,
  type DecodedGribField,
} from '../../marine/ecmwf/grib/grib-decoder.adapter';
import { MarineImportError } from './marine-assertions';
import { MARINE_POINT_CANDIDATES } from './marine-candidates';
import type {
  EcmwfProbeMessageRecord,
  EcmwfProbePointRecord,
  EcmwfProbeRequestRecord,
  MarineEcmwfProbeArtifact,
} from './marine-ecmwf-artifact.types';
import { evaluateEcmwfProbeAssertions } from './marine-ecmwf-assertions';

/**
 * `pnpm db:import:marine-ecmwf --phase=probe` — the ONLY thing in this PR that touches the
 * network, and it is run BY HAND.
 *
 * ## What it proves, in five HTTP requests
 * It takes ONE step of the newest published cycle, downloads exactly the four parameters we
 * publish by byte range, decodes them, and writes down where each of the 30 reference points
 * landed and what was there. That is enough to exercise every piece of arithmetic this PR adds —
 * the JSON-lines index, the range merging, the GRIB envelope checks, the grid mapping, the
 * threshold, the decode, and the wind derivation — against real bytes rather than against a
 * fixture we chose.
 *
 * Five requests, because the layout was measured rather than assumed: two `.index` files, one
 * range for `10u`, one for `10v` (never adjacent, at any step) and one for the adjacent `swh` +
 * `mwd` pair.
 *
 * ## Politeness, by construction — the M1/climate precedent, deliberately copied
 * Serial, spaced, timed out, size-capped, redirect-refusing, and identifying itself honestly.
 * ECMWF serves us anonymously and for free.
 *
 * ## Why this tool has its own HTTP client instead of `UpstreamHttpClient`
 * The same reason `probe-marine-points.ts` and `mgm-fetch.ts` do, and it is NOT the guard-order
 * duplication the upstream rules forbid: there are no guards here to duplicate. This is a
 * hand-run import tool with no provider budget, no circuit breaker and no operation deadline —
 * nobody is waiting for it, and it may take minutes on purpose. `UpstreamHttpClient` guards the
 * REQUEST PATH of a live server, has a different byte cap and a different lifecycle, and wiring a
 * CLI through its metrics/budget/breaker collaborators would couple a yearly hand-run script to
 * the runtime's configuration surface. The binary body branch this PR adds to that client is for
 * M3b's scheduled ingest, which does run inside the server and does need every guard.
 */

const ECMWF_BASE_URL = 'https://data.ecmwf.int/forecasts';

/** The 0.25° deterministic product: IFS HRES for `oper`, ECWAM for `wave`. */
const ECMWF_RESOLUTION_PATH = 'ifs/0p25';

/** Which stream each parameter lives in. */
const PARAM_STREAM: Readonly<Record<EcmwfParam, EcmwfStream>> = {
  '10u': 'oper',
  '10v': 'oper',
  swh: 'wave',
  mwd: 'wave',
};

/**
 * The step the probe samples.
 *
 * Step 0 is the analysis and is the least representative thing in the file; a mid-range step
 * exercises the same code on a genuine forecast. 72 h is inside every horizon the provider
 * publishes, so the probe never fails because it asked past the end.
 */
const PROBE_STEP_HOURS = 72;

/**
 * How the probe identifies itself. No contact URL is claimed, because there is none to give —
 * the same open TODO the other two import tools carry.
 */
const USER_AGENT =
  'CografyaPlatformBot/1.0 (non-commercial educational geography platform; ' +
  'ECMWF Open Data reference-point probe; run by hand)';

const REQUEST_TIMEOUT_MS = 60_000;
const DELAY_BETWEEN_REQUESTS_MS = 2_000;
const RETRY_DELAY_MS = 5_000;
const MAX_ATTEMPTS_PER_REQUEST = 3;
/** A merged wave range measured 1.82 MB; 16 MB is ample headroom and still a hard ceiling. */
const MAX_RESPONSE_BYTES = 16 * 1024 * 1024;

/**
 * Content types seen in the wild, across BOTH access paths.
 *
 * Measured: `data.ecmwf.int` answers `application/json` for `.index` and `application/grib` for
 * `.grib2`, while the AWS S3 mirror answers `application/octet-stream` for both. A strict
 * expectation would pass on the primary path and break the moment anyone pointed this at the
 * mirror — a failover that only fails when you need it.
 */
const ACCEPTED_CONTENT_TYPES = [
  'application/json',
  'application/grib',
  'application/octet-stream',
  'binary/octet-stream',
  'text/plain',
];

/** The provider's own words on the wave-direction convention, quoted into the artifact. */
const DIRECTION_CONVENTION_QUOTE = {
  source:
    'ECMWF Parameter Database, paramId 140230 (mwd) — https://codes.ecmwf.int/grib/param-db/140230',
  quote:
    'The units are degree true which means the direction relative to the geographic location of ' +
    "the north pole. Zero means 'coming from the north' and 90 'coming from the east'.",
};

export interface EcmwfProbeOptions {
  outputDir: string;
  /** Injected for tests; defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
  sleepImpl?: (ms: number) => Promise<void>;
  nowImpl?: () => Date;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface RawResponse {
  status: number;
  contentType: string;
  bytes: Uint8Array;
  durationMs: number;
}

/**
 * One HTTP GET (optionally ranged) with retries on TRANSPORT failures only.
 *
 * A non-200 is returned rather than thrown: the status is evidence the artifact records. Redirects
 * are refused outright — measured, both access paths answer directly, and a redirect is the one
 * way a peer could choose the host this process talks to.
 */
async function fetchRaw(
  url: string,
  options: {
    rangeHeader?: string;
    fetchImpl: typeof fetch;
    sleepImpl: (ms: number) => Promise<void>;
  },
): Promise<RawResponse> {
  let lastError: unknown;
  let attemptsMade = 0;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS_PER_REQUEST; attempt += 1) {
    attemptsMade = attempt;
    const startedAt = Date.now();
    try {
      const headers: Record<string, string> = { 'User-Agent': USER_AGENT };
      if (options.rangeHeader !== undefined) headers.Range = options.rangeHeader;

      const response = await options.fetchImpl(url, {
        headers,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        redirect: 'error',
      });

      const declared = Number(response.headers.get('content-length') ?? Number.NaN);
      if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) {
        throw new MarineImportError(
          `${url} declares Content-Length ${String(declared)} B, above the ` +
            `${String(MAX_RESPONSE_BYTES)} B cap.`,
        );
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength > MAX_RESPONSE_BYTES) {
        throw new MarineImportError(
          `${url} returned ${String(bytes.byteLength)} B, above the ` +
            `${String(MAX_RESPONSE_BYTES)} B cap.`,
        );
      }

      return {
        status: response.status,
        contentType: response.headers.get('content-type') ?? '',
        bytes,
        durationMs: Date.now() - startedAt,
      };
    } catch (error: unknown) {
      lastError = error;
      if (attempt < MAX_ATTEMPTS_PER_REQUEST) {
        console.warn(
          `[db:import:marine-ecmwf] attempt ${String(attempt)} failed for ${url}:`,
          error,
        );
        await options.sleepImpl(RETRY_DELAY_MS);
      }
    }
  }

  throw new MarineImportError(
    `failed to fetch ${url} after ${String(attemptsMade)} attempt(s): ${String(lastError)}`,
  );
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function hasAcceptedContentType(contentType: string): boolean {
  const lower = contentType.toLowerCase();
  return ACCEPTED_CONTENT_TYPES.some((accepted) => lower.includes(accepted));
}

/** `.../{YYYYMMDD}/{HH}z/ifs/0p25/{stream}/{YYYYMMDDHHMMSS}-{step}h-{stream}-fc.{ext}` */
export function buildEcmwfUrl(
  cycle: Date,
  stream: EcmwfStream,
  stepHours: number,
  extension: 'index' | 'grib2',
): string {
  const iso = cycle.toISOString();
  const day = iso.slice(0, 10).replace(/-/g, '');
  const hour = iso.slice(11, 13);
  const stamp = `${day}${hour}0000`;
  return (
    `${ECMWF_BASE_URL}/${day}/${hour}z/${ECMWF_RESOLUTION_PATH}/${stream}/` +
    `${stamp}-${String(stepHours)}h-${stream}-fc.${extension}`
  );
}

/**
 * Candidate cycles, newest first: floor `now − 9 h` to the previous 6-hourly slot, then walk back.
 *
 * The 9 h offset is the provider's own measured publication lag (7–9 h after the cycle hour), so
 * the first candidate is normally the newest complete cycle. Walking back at most three keeps a
 * hand-run probe from grinding through a provider outage; the runtime has its own ceiling on
 * cycle age (M3b).
 */
export function candidateCycles(now: Date, count = 3): Date[] {
  const shifted = new Date(now.getTime() - 9 * 3_600_000);
  const flooredHour = Math.floor(shifted.getUTCHours() / 6) * 6;
  const newest = new Date(
    Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate(), flooredHour),
  );
  return Array.from(
    { length: count },
    (_unused, index) => new Date(newest.getTime() - index * 6 * 3_600_000),
  );
}

/** Run the probe and write the artifact. */
export async function runEcmwfProbePhase(options: EcmwfProbeOptions): Promise<void> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleepImpl = options.sleepImpl ?? sleep;
  const nowImpl = options.nowImpl ?? ((): Date => new Date());

  const requests: EcmwfProbeRequestRecord[] = [];
  let downloadedBytes = 0;
  let downloadMs = 0;
  let decodeMs = 0;

  const record = (
    label: string,
    url: string,
    method: 'GET' | 'HEAD',
    rangeHeader: string | null,
    raw: RawResponse,
  ): void => {
    requests.push({
      label,
      url,
      method,
      rangeHeader,
      httpStatus: raw.status,
      contentType: raw.contentType,
      bytes: raw.bytes.byteLength,
      durationMs: raw.durationMs,
      sha256: sha256(raw.bytes),
    });
    downloadedBytes += raw.bytes.byteLength;
    downloadMs += raw.durationMs;
  };

  // ── 1. pick a cycle whose index files actually exist ────────────────────────
  let cycle: Date | null = null;
  let indexBodies: Record<EcmwfStream, string> | null = null;

  for (const candidate of candidateCycles(nowImpl())) {
    const bodies: Partial<Record<EcmwfStream, string>> = {};
    let usable = true;

    for (const stream of ['oper', 'wave'] as const) {
      const url = buildEcmwfUrl(candidate, stream, PROBE_STEP_HOURS, 'index');
      await sleepImpl(DELAY_BETWEEN_REQUESTS_MS);
      const raw = await fetchRaw(url, { fetchImpl, sleepImpl });
      record(`${stream}.index`, url, 'GET', null, raw);

      if (raw.status !== 200) {
        console.warn(
          `[db:import:marine-ecmwf] ${candidate.toISOString()} ${stream}: HTTP ` +
            `${String(raw.status)} — falling back to the previous cycle.`,
        );
        usable = false;
        break;
      }
      if (!hasAcceptedContentType(raw.contentType)) {
        throw new MarineImportError(
          `${url} answered 200 with content-type "${raw.contentType}", which is none of the ` +
            `expected ${ACCEPTED_CONTENT_TYPES.join(' / ')}.`,
        );
      }
      bodies[stream] = new TextDecoder('utf-8').decode(raw.bytes);
    }

    if (usable && bodies.oper !== undefined && bodies.wave !== undefined) {
      cycle = candidate;
      indexBodies = { oper: bodies.oper, wave: bodies.wave };
      break;
    }
  }

  if (cycle === null || indexBodies === null) {
    throw new MarineImportError(
      'no published cycle found in the last three 6-hourly slots. ECMWF keeps ~12 cycles, so ' +
        'this means the provider is down or the URL layout has changed.',
    );
  }

  console.log(
    `[db:import:marine-ecmwf] cycle ${cycle.toISOString()}, step ${String(PROBE_STEP_HOURS)} h`,
  );

  // ── 2. plan the byte ranges from the real indexes ───────────────────────────
  const plans: { stream: EcmwfStream; range: EcmwfByteRange }[] = [];
  for (const stream of ['oper', 'wave'] as const) {
    const params = ECMWF_PARAMS.filter((param) => PARAM_STREAM[param] === stream);
    const records = parseEcmwfIndex(indexBodies[stream]);
    for (const range of mergeByteRanges(selectIndexRecords(records, params))) {
      plans.push({ stream, range });
    }
  }
  console.log(
    `[db:import:marine-ecmwf] ${String(plans.length)} byte range(s) planned: ` +
      plans
        .map((plan) => `${plan.stream} [${plan.range.members.map((m) => m.param).join('+')}]`)
        .join(', '),
  );

  // ── 3. download and decode ─────────────────────────────────────────────────
  const fields: DecodedGribField[] = [];
  const messages: EcmwfProbeMessageRecord[] = [];

  for (const plan of plans) {
    const url = buildEcmwfUrl(cycle, plan.stream, PROBE_STEP_HOURS, 'grib2');
    const rangeHeader = toRangeHeader(plan.range);
    await sleepImpl(DELAY_BETWEEN_REQUESTS_MS);
    const raw = await fetchRaw(url, { rangeHeader, fetchImpl, sleepImpl });
    record(`${plan.stream}.range`, url, 'GET', rangeHeader, raw);

    if (raw.status !== 206) {
      throw new MarineImportError(
        `${url} answered HTTP ${String(raw.status)} to ${rangeHeader}; a partial download must ` +
          `be answered with 206, and a 200 would be the WHOLE multi-GB file.`,
      );
    }
    if (!hasAcceptedContentType(raw.contentType)) {
      throw new MarineImportError(
        `${url} answered with content-type "${raw.contentType}", which is none of the expected ` +
          `${ACCEPTED_CONTENT_TYPES.join(' / ')}.`,
      );
    }

    const decodeStartedAt = Date.now();
    const decoded = decodeGribRange(raw.bytes, plan.range.members);
    const elapsed = Date.now() - decodeStartedAt;
    decodeMs += elapsed;

    for (const field of decoded) {
      const member = plan.range.members.find((candidate) => candidate.param === field.param);
      let finiteValues = 0;
      for (const value of field.values) {
        if (Number.isFinite(value)) finiteValues += 1;
      }
      messages.push({
        param: field.param,
        stream: plan.stream,
        offsetInFile: plan.range.start + (member?.relativeOffset ?? 0),
        lengthBytes: field.profile.length,
        dataRepresentationTemplate: field.profile.dataRepresentationTemplate,
        packingLabel: packingLabelFor(field.profile.dataRepresentationTemplate),
        bitsPerValue: field.profile.bitsPerValue,
        columns: field.profile.columns,
        rows: field.profile.rows,
        numberOfDataPoints: field.profile.numberOfDataPoints,
        numberOfEncodedValues: field.profile.numberOfEncodedValues,
        bitmapPresent: field.profile.bitmapPresent,
        firstLatitude: field.profile.firstLatitude,
        firstLongitude: field.profile.firstLongitude,
        lastLatitude: field.profile.lastLatitude,
        lastLongitude: field.profile.lastLongitude,
        scanningMode: field.profile.scanningMode,
        referenceTimeUtc: field.profile.referenceTimeUtc.toISOString(),
        forecastHours: field.profile.forecastHours,
        validTimeUtc: field.profile.validTimeUtc.toISOString(),
        finiteValues,
        // Per-field share of the range's decode time; the range is decoded in one call.
        decodeMs: Math.round(elapsed / decoded.length),
      });
      fields.push(field);
    }
  }

  const byParam = new Map(fields.map((field) => [field.param, field]));
  for (const param of ECMWF_PARAMS) {
    if (!byParam.has(param)) {
      throw new EcmwfContractError(`"${param}" was planned but never decoded.`);
    }
  }

  // ── 4. place every reference point and read its cell ────────────────────────
  const points: EcmwfProbePointRecord[] = MARINE_POINT_CANDIDATES.map((candidate) => {
    const mapping = mapPointToGrid(candidate.latitude, candidate.longitude);
    const values = {} as Record<EcmwfParam, number | null>;
    const observed = {} as Record<EcmwfParam, 'value' | 'missing'>;

    for (const param of ECMWF_PARAMS) {
      const field = byParam.get(param);
      const value = field === undefined ? null : readCell(field, mapping.index);
      values[param] = value;
      observed[param] = value === null ? 'missing' : 'value';
    }

    return {
      slugTr: candidate.slugTr,
      slugEn: candidate.slugEn,
      plateCode: candidate.plateCode,
      provinceNameTr: candidate.provinceNameTr,
      seaBasin: candidate.seaBasin,
      latitude: candidate.latitude,
      longitude: candidate.longitude,
      displayOrder: candidate.displayOrder,
      gridLatitude: mapping.gridLatitude,
      gridLongitude: mapping.gridLongitude,
      gridRow: mapping.row,
      gridColumn: mapping.column,
      gridIndex: mapping.index,
      distanceKm: mapping.distanceKm,
      thresholdKm: mapping.thresholdKm,
      withinThreshold: mapping.withinThreshold,
      values,
      derived: {
        windSpeed10m: deriveWindSpeed(values['10u'], values['10v']),
        windDirection10m: deriveWindDirection(values['10u'], values['10v']),
      },
      observed,
    };
  });

  // ── 5. write the artifact, then fail loudly if anything did not pass ────────
  const artifact: MarineEcmwfProbeArtifact = {
    generatedAtUtc: nowImpl().toISOString(),
    userAgent: USER_AGENT,
    baseUrl: ECMWF_BASE_URL,
    cycleUtc: cycle.toISOString(),
    stepHours: PROBE_STEP_HOURS,
    plannedStepCount: ECMWF_STEPS.length,
    plannedHorizonHours: ECMWF_FORECAST_HOURS,
    decoder: readDecoderIdentity(),
    directionConvention: DIRECTION_CONVENTION_QUOTE,
    requests,
    totals: {
      requestCount: requests.length,
      downloadedBytes,
      downloadMs,
      decodeMs,
    },
    messages,
    points,
    assertions: [],
  };
  artifact.assertions = evaluateEcmwfProbeAssertions(artifact);

  await mkdir(options.outputDir, { recursive: true });
  await writeFile(
    join(options.outputDir, 'marine-ecmwf-probe.json'),
    `${JSON.stringify(artifact, null, 2)}\n`,
    'utf8',
  );

  for (const result of artifact.assertions) {
    console.log(
      `[db:import:marine-ecmwf] ${result.passed ? 'PASS' : 'FAIL'} ${result.id}: ${result.detail}`,
    );
  }
  console.log(
    `[db:import:marine-ecmwf] probe done — ${String(requests.length)} request(s), ` +
      `${String(downloadedBytes)} B in ${String(downloadMs)} ms, decode ${String(decodeMs)} ms. ` +
      `Per-cycle projection: ${String(ECMWF_STEPS.length)} steps × ${String(ECMWF_STEP_HOURS)} h ` +
      `to +${String(ECMWF_FORECAST_HOURS)} h.`,
  );

  const failures = artifact.assertions.filter((result) => !result.passed);
  if (failures.length > 0) {
    // The artifact WAS written — a failed run's evidence is exactly what someone needs in order
    // to fix it. The process still exits non-zero.
    throw new MarineImportError(
      `${String(failures.length)} assertion(s) FAILED. The artifact was written so the evidence ` +
        `is reviewable:\n  ` +
        failures.map((result) => `${result.id}: ${result.detail}`).join('\n  '),
    );
  }

  console.log('[db:import:marine-ecmwf] every assertion passed.');
}

/**
 * WMO code table 5.0 names for the templates this leg accepts.
 *
 * A translation of a number we DID read, never a claim about a string we did not: the decoder
 * exposes no `packingType`, and ecCodes' independent reading of the same template is committed
 * with the golden corpus.
 */
function packingLabelFor(template: number): string {
  const labels: Readonly<Record<number, string>> = { 42: 'grid_ccsds' };
  return labels[template] ?? `template ${String(template)}`;
}

/** Which decoder actually ran, read from the installed package rather than from our manifest. */
function readDecoderIdentity(): MarineEcmwfProbeArtifact['decoder'] {
  const require = createRequire(__filename);
  const manifest = require('@mattnucc/gribberish/package.json') as {
    name: string;
    version: string;
  };
  return {
    package: manifest.name,
    version: manifest.version,
    platform: process.platform,
    arch: process.arch,
  };
}
