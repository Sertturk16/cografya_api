import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CMEMS_BASIN_ROUTING, CMEMS_SELECTOR_ENTRIES } from '../../marine/cmems/cmems-routing';
import type { CmemsDatasetSelector } from '../../marine/cmems/cmems-routing';
import {
  parseCmemsProductStac,
  resolveCmemsProduct,
  type CmemsProductResolution,
} from '../../marine/cmems/cmems-stac';
import { selectCmemsTime } from '../../marine/cmems/cmems-time';
import { buildCmemsGetFeatureInfoUrl } from '../../marine/cmems/cmems-url';
import { parseCmemsGetFeatureInfo } from '../../marine/cmems/cmems-response';
import {
  CMEMS_TILE_MATRIX_SET,
  CMEMS_ZOOM,
  type CmemsLayerField,
} from '../../marine/cmems/cmems.constants';
import { UpstreamSchemaError } from '../../upstream/upstream.types';
import { MARINE_POINT_CANDIDATES, type MarinePointCandidate } from './marine-candidates';
import { evaluateMarineCmemsArtifact } from './marine-cmems-assertions';
import type {
  CmemsLicenceEvidence,
  CmemsLicenceRecord,
  CmemsProbeCallRecord,
  CmemsProbeEntry,
  CmemsProbeStacProductRecord,
  CmemsProbeTimings,
  CmemsXmlErrorFixtureRecord,
  MarineCmemsProbeArtifact,
} from './marine-cmems-artifact.types';
import { MarineImportError } from './marine-assertions';

/**
 * `pnpm db:import:marine-cmems --phase=probe` — the M4a evidence run. Hand-run, serial-polite,
 * never CI, never the app (the climate/M1/A1 two-phase precedent). One run makes:
 *
 *  - 4 STAC document fetches → the resolver's REAL output (dataset ids are never pinned);
 *  - 1 licence-page fetch → the DEC 2026-07-30k dataset-level licence record, with every
 *    verbatim quote machine-verified as a substring of the fetched document (risk R5: an
 *    unverifiable commercial-use quote FAILS the run and the build halts for owner
 *    escalation);
 *  - 78 GetFeatureInfo calls (30 SST + 24 wave pairs; the Marmara pair is structurally
 *    skipped) through the SAME URL builder, tile arithmetic, zod schema, unit normalisation
 *    and snap guard the runtime uses — the artifact therefore proves production's own code;
 *  - 1 deliberately out-of-extent call → the recorded 400-XML fixture (the retired-dataset
 *    contract the M4b self-heal keys on).
 *
 * ## Politeness, by construction (M1 verbatim)
 * Serial, ≥ 2.5 s apart, 20 s timeout, 2 retries for transport blips only, identifying UA, a
 * 3-consecutive-refusal circuit breaker, and a response byte cap.
 *
 * ## No credentials — and therefore no key scan
 * Both endpoints are anonymous (verified 2026-08-02): no key is read, held, or printable, so
 * the A1-class `no-key-material` scan has nothing to scan FOR. Stated explicitly so its
 * absence reads as a decision, not an omission; the moment any credentialed feed touches this
 * file, the A1 scan pattern becomes mandatory (playbook §5).
 */

const WMTS_ENDPOINT = 'https://wmts.marine.copernicus.eu/teroWmts';
const STAC_ENDPOINT = 'https://stac.marine.copernicus.eu/metadata';
const LICENCE_PAGE_URL = 'https://marine.copernicus.eu/user-corner/service-commitments-and-licence';
const LICENCE_PAGE_TITLE = 'Copernicus Marine Service Commitments and Licence';

const USER_AGENT =
  'CografyaPlatformBot/1.0 (educational geography platform; CMEMS marine probe; run by hand)';

const REQUEST_TIMEOUT_MS = 20_000;
/** The licence page is a heavy CMS page — measured 17 s on a cold fetch. Its own ceiling. */
const LICENCE_TIMEOUT_MS = 90_000;
const DELAY_BETWEEN_REQUESTS_MS = 2_500;
const RETRY_DELAY_MS = 8_000;
const MAX_ATTEMPTS_PER_REQUEST = 3;
const MAX_CONSECUTIVE_FAILURES = 3;
/** A GetFeatureInfo reply is ~300 B, a STAC doc ~15 KB, the licence page ~300 KB. */
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;

/** Committed fixture path, repo-relative — also asserted by `a5-xml-fixture`. */
const FIXTURE_RELATIVE_PATH = 'test/fixtures/cmems/getfeatureinfo-400-time-out-of-range.xml';

/**
 * The licence fragments this platform's commercial use stands on, verbatim from the annex
 * "LICENCE TO USE THE COPERNICUS MARINE SERVICE PRODUCTS" (§2.1, §2.2(b), §2.2(c), §2.4(a)).
 * Fragments are verified INDIVIDUALLY as substrings of the normalised page text; the record
 * joins them with ` […] ` for readability.
 */
const LICENCE_QUOTE_FRAGMENTS: readonly string[] = [
  'This Licence is granted free of charge.',
  'The Licensee is hereby granted a worldwide, non exclusive, royalty free, perpetual licence',
  'modify, adapt, develop, create and distribute Value Added Products or Derivative Work from ' +
    'Copernicus Marine Service Products for any purpose',
  'redistribute, disseminate any Copernicus Marine Service Product in their original form via any media',
];

const ATTRIBUTION_REQUIREMENT =
  'shall credit the Copernicus Marine Service by explicitly making mention of the originator ' +
  '(Copernicus Marine Environment Monitoring Service) and by citing the DOIs in the following ' +
  'manner: “Generated using E.U. Copernicus Marine Service Information; insert DOIs links here”';

export interface CmemsProbePhaseOptions {
  outputDir: string;
  /** Where the 400-XML fixture body is written (the repo's `test/fixtures/cmems`). */
  fixtureDir: string;
  fetchImpl?: typeof fetch;
  sleepImpl?: (ms: number) => Promise<void>;
  nowImpl?: () => Date;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sha256(body: string): string {
  return createHash('sha256').update(body, 'utf8').digest('hex');
}

class OversizedResponseError extends MarineImportError {}

interface RawResponse {
  status: number;
  contentType: string;
  body: string;
  elapsedMs: number;
}

/** Byte-capped body read — the M1 meter, kept identical in behaviour. */
async function readBodyCapped(response: Response, url: string): Promise<string> {
  const declared = Number(response.headers.get('content-length') ?? Number.NaN);
  if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) {
    throw new OversizedResponseError(
      `${url} declares Content-Length ${String(declared)} B, above the cap.`,
    );
  }
  const body = response.body;
  if (body === null) {
    const text = await response.text();
    if (Buffer.byteLength(text, 'utf8') > MAX_RESPONSE_BYTES) {
      throw new OversizedResponseError(`${url} returned a body-less response over the cap.`);
    }
    return text;
  }
  const reader = body.getReader();
  const decoder = new TextDecoder('utf-8');
  const chunks: string[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_RESPONSE_BYTES) {
        throw new OversizedResponseError(`${url} exceeded the response byte cap.`);
      }
      chunks.push(decoder.decode(value, { stream: true }));
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  chunks.push(decoder.decode());
  return chunks.join('');
}

/** One GET with retries for TRANSPORT failures only; a non-200 is evidence, not an exception. */
async function fetchRaw(
  url: string,
  fetchImpl: typeof fetch,
  sleepImpl: (ms: number) => Promise<void>,
  timeoutMs: number = REQUEST_TIMEOUT_MS,
): Promise<RawResponse> {
  let lastError: unknown;
  let attemptsMade = 0;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS_PER_REQUEST; attempt += 1) {
    attemptsMade = attempt;
    const startedAt = Date.now();
    try {
      const response = await fetchImpl(url, {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(timeoutMs),
        redirect: 'follow',
      });
      return {
        status: response.status,
        contentType: response.headers.get('content-type') ?? '',
        body: await readBodyCapped(response, url),
        elapsedMs: Math.max(1, Date.now() - startedAt),
      };
    } catch (error: unknown) {
      lastError = error;
      if (error instanceof OversizedResponseError) break;
      if (attempt < MAX_ATTEMPTS_PER_REQUEST) {
        console.warn(
          `[db:import:marine-cmems] attempt ${String(attempt)} failed for ${url}:`,
          error,
        );
        await sleepImpl(RETRY_DELAY_MS);
      }
    }
  }
  throw new MarineImportError(
    `failed to fetch ${url} after ${String(attemptsMade)} attempt(s): ${String(lastError)}`,
  );
}

/**
 * HTML → comparable text: drop script/style, strip tags, decode the entities the licence page
 * actually uses, collapse whitespace. Mirrors how the quotes were verified at plan time.
 */
export function normaliseHtmlText(html: string): string {
  const withoutBlocks = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ');
  const withoutTags = withoutBlocks.replace(/<[^>]+>/g, ' ');
  const decoded = withoutTags
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&#8217;|&rsquo;/gi, '’')
    .replace(/&#8216;|&lsquo;/gi, '‘')
    .replace(/&#8220;|&ldquo;/gi, '“')
    .replace(/&#8221;|&rdquo;/gi, '”')
    .replace(/&#8211;|&ndash;/gi, '–');
  return decoded.replace(/\s+/g, ' ').trim();
}

/** Tolerant evidence reader for the artifact — the runtime verdict comes from the zod parse. */
function peekProperties(body: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(body);
    const features = (parsed as { features?: unknown }).features;
    const first = Array.isArray(features) ? (features[0] as unknown) : undefined;
    const properties = (first as { properties?: unknown } | undefined)?.properties;
    return properties !== null && typeof properties === 'object'
      ? (properties as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function peekNumber(record: Record<string, unknown>, key: string): number | null {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function peekString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === 'string' ? value : null;
}

function percentile(sortedMs: readonly number[], fraction: number): number {
  if (sortedMs.length === 0) return 0;
  const index = Math.min(sortedMs.length - 1, Math.ceil(fraction * sortedMs.length) - 1);
  return sortedMs[Math.max(0, index)] ?? 0;
}

interface ResolvedSelector {
  readonly datasetPath: string;
  readonly productId: string;
  readonly extent: { readonly startUtc: string | null; readonly endUtc: string | null };
}

/** Probe one (point, field) — the runtime parse decides the verdict, the raw reply is evidence. */
async function probeCall(
  candidate: MarinePointCandidate,
  field: CmemsLayerField,
  resolved: ResolvedSelector,
  maxGridDistanceKm: number,
  nowMs: number,
  fetchImpl: typeof fetch,
  sleepImpl: (ms: number) => Promise<void>,
): Promise<CmemsProbeCallRecord> {
  const timeSelection = selectCmemsTime(nowMs, resolved.extent);
  const requestUrl = buildCmemsGetFeatureInfoUrl({
    wmtsBaseUrl: WMTS_ENDPOINT,
    datasetPath: resolved.datasetPath,
    field,
    latitude: candidate.latitude,
    longitude: candidate.longitude,
    timeIso: timeSelection.timeIso,
  });
  const raw = await fetchRaw(requestUrl, fetchImpl, sleepImpl);
  const properties = peekProperties(raw.body);

  const base = {
    requestUrl,
    httpStatus: raw.status,
    contentType: raw.contentType,
    responseSha256: sha256(raw.body),
    elapsedMs: raw.elapsedMs,
    datasetId: peekString(properties, 'datasetId'),
    variableId: peekString(properties, 'variableId'),
    value: peekNumber(properties, 'value'),
    rawUnits: peekString(properties, 'units'),
    gridLatitude: peekNumber(properties, 'lat'),
    gridLongitude: peekNumber(properties, 'lon'),
    maxGridDistanceKm,
  };

  if (raw.status !== 200 || !raw.contentType.toLowerCase().includes('application/json')) {
    return {
      ...base,
      normalizedUnit: null,
      distanceKm: null,
      verdict: 'error',
      errorDetail: `HTTP ${String(raw.status)} ${raw.contentType} — first 200 chars: ${raw.body.slice(0, 200)}`,
    };
  }

  try {
    const parsed = parseCmemsGetFeatureInfo(raw.body, {
      field,
      requestedLatitude: candidate.latitude,
      requestedLongitude: candidate.longitude,
      maxGridDistanceKm,
      timeIso: timeSelection.timeIso,
      validAtMs: timeSelection.validAtMs,
    });
    if (parsed.kind === 'no_data') {
      return {
        ...base,
        normalizedUnit: null,
        distanceKm: null,
        verdict: 'no_data',
        errorDetail: parsed.reason,
      };
    }
    return {
      ...base,
      normalizedUnit: parsed.value.unit,
      distanceKm: parsed.value.distanceKm,
      verdict: 'ok',
      errorDetail: null,
    };
  } catch (error: unknown) {
    if (error instanceof UpstreamSchemaError) {
      return {
        ...base,
        normalizedUnit: null,
        distanceKm: null,
        verdict: 'error',
        errorDetail: error.message,
      };
    }
    throw error;
  }
}

/** Build the six DEC 2026-07-30k licence rows from the resolved products + verified quotes. */
function buildLicenceRecords(
  resolutions: ReadonlyMap<string, CmemsProductResolution>,
  resolvedByKey: ReadonlyMap<string, ResolvedSelector>,
  pageText: string,
  wavItemCount: number,
): CmemsLicenceRecord[] {
  const quoteVerified = LICENCE_QUOTE_FRAGMENTS.every((fragment) => pageText.includes(fragment));
  const quote = LICENCE_QUOTE_FRAGMENTS.join(' […] ');

  function row(
    rowNumber: number,
    datasetLabel: string,
    selectorKey: string | null,
    negativeEvidence: string | null,
  ): CmemsLicenceRecord {
    const resolved = selectorKey === null ? undefined : resolvedByKey.get(selectorKey);
    const product = resolved === undefined ? undefined : resolutions.get(resolved.productId);
    return {
      row: rowNumber,
      datasetLabel,
      productId: resolved?.productId ?? null,
      resolvedDatasetId:
        resolved === undefined ? null : (resolved.datasetPath.split('/')[1] ?? null),
      doi: product?.doi ?? null,
      stacLicenseField: product?.license ?? null,
      licencePageUrl: LICENCE_PAGE_URL,
      licencePageTitle: LICENCE_PAGE_TITLE,
      verbatimCommercialUseQuote: quote,
      quoteVerified,
      attributionRequirement: ATTRIBUTION_REQUIREMENT,
      negativeEvidence,
    };
  }

  return [
    row(
      1,
      'MEDSEA hourly surface thetao (Aegean + Mediterranean SST)',
      'MEDSEA_ANALYSISFORECAST_PHY_006_013/4.2km-2D',
      null,
    ),
    row(
      2,
      'MEDSEA hourly VHM0/VMDR (Aegean + Mediterranean waves)',
      'MEDSEA_ANALYSISFORECAST_WAV_006_017/4.2km',
      null,
    ),
    row(
      3,
      'BLKSEA 2.5 km hourly thetao (Black Sea SST)',
      'BLKSEA_ANALYSISFORECAST_PHY_007_001/2.5km',
      null,
    ),
    row(
      4,
      'BLKSEA mrm-500m hourly thetao (Marmara SST, same product/DOI as row 3)',
      'BLKSEA_ANALYSISFORECAST_PHY_007_001/mrm-500m',
      null,
    ),
    row(
      5,
      'BLKSEA 2.5 km hourly VHM0/VMDR (Black Sea waves)',
      'BLKSEA_ANALYSISFORECAST_WAV_007_003/2.5km',
      null,
    ),
    {
      ...row(
        6,
        'Marmara waves: NO CMEMS dataset exists — not_supported by product fact',
        null,
        null,
      ),
      negativeEvidence:
        `the BLKSEA wave product's STAC item list (${String(wavItemCount)} items this run) ` +
        `contains no dataset with a Marmara (mrm-*) grid token; the M1 cross-check additionally ` +
        `proved the 2.5 km wave land mask excludes the Marmara. The runtime therefore publishes ` +
        `not_supported and makes NO call; the wave pair falls back to ECMWF as a pair.`,
    },
  ];
}

export async function runCmemsProbePhase(options: CmemsProbePhaseOptions): Promise<void> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleepImpl = options.sleepImpl ?? sleep;
  const nowImpl = options.nowImpl ?? ((): Date => new Date());

  const candidates = MARINE_POINT_CANDIDATES;
  console.log(
    `[db:import:marine-cmems] probe — 4 STAC docs + 1 licence page + 78 GetFeatureInfo calls ` +
      `+ 1 deliberate 400, serial, ≥${String(DELAY_BETWEEN_REQUESTS_MS / 1000)} s apart. Budget ~4 minutes.`,
  );

  // ── 1. STAC resolution — the resolver's REAL output over the live catalogue ──
  const selectorsByProduct = new Map<string, { key: string; selector: CmemsDatasetSelector }[]>();
  for (const entry of CMEMS_SELECTOR_ENTRIES) {
    const list = selectorsByProduct.get(entry.selector.productId) ?? [];
    list.push({ key: entry.key, selector: entry.selector });
    selectorsByProduct.set(entry.selector.productId, list);
  }

  const stacProducts: CmemsProbeStacProductRecord[] = [];
  const resolutions = new Map<string, CmemsProductResolution>();
  const resolvedByKey = new Map<string, ResolvedSelector>();

  for (const [productId, selectors] of selectorsByProduct) {
    const url = `${STAC_ENDPOINT}/${productId}/product.stac.json`;
    const raw = await fetchRaw(url, fetchImpl, sleepImpl);
    if (raw.status !== 200) {
      throw new MarineImportError(
        `STAC document for ${productId} answered HTTP ${String(raw.status)} — aborting before ` +
          `any sweep; nothing can be resolved against a missing catalogue.`,
      );
    }
    const doc = parseCmemsProductStac(raw.body);
    const resolution = resolveCmemsProduct(doc, selectors);
    resolutions.set(productId, resolution);

    for (const selection of resolution.selections) {
      if (selection.selection.datasetId !== null) {
        resolvedByKey.set(selection.selectorKey, {
          datasetPath: `${productId}/${selection.selection.datasetId}`,
          productId,
          extent: resolution.temporalExtent,
        });
      }
      console.log(
        `[db:import:marine-cmems] ${selection.selectorKey}: ` +
          (selection.selection.datasetId ??
            `FAILED (${String('reason' in selection.selection ? selection.selection.reason : '')})`),
      );
    }

    stacProducts.push({
      productId,
      requestUrl: url,
      httpStatus: raw.status,
      contentType: raw.contentType,
      responseSha256: sha256(raw.body),
      elapsedMs: raw.elapsedMs,
      license: resolution.license,
      doi: resolution.doi,
      temporalExtent: resolution.temporalExtent,
      updateFrequency: resolution.updateFrequency,
      admpUpdatedUtc: resolution.admpUpdatedUtc,
      itemCount: doc.links.filter((link) => link.rel === 'item').length,
      selections: resolution.selections.map((selection) => ({
        selectorKey: selection.selectorKey,
        acceptedVariableTokens:
          selectors.find((entry) => entry.key === selection.selectorKey)?.selector
            .acceptedVariableTokens ?? [],
        gridToken:
          selectors.find((entry) => entry.key === selection.selectorKey)?.selector.gridToken ?? '',
        datasetId: selection.selection.datasetId,
        failReason: 'reason' in selection.selection ? selection.selection.reason : null,
      })),
    });
    await sleepImpl(DELAY_BETWEEN_REQUESTS_MS);
  }

  // ── 2. Licence page + machine-verified verbatim quotes (R5 gate) ────────────
  const licenceRaw = await fetchRaw(LICENCE_PAGE_URL, fetchImpl, sleepImpl, LICENCE_TIMEOUT_MS);
  if (licenceRaw.status !== 200) {
    throw new MarineImportError(
      `licence page answered HTTP ${String(licenceRaw.status)} — the DEC 2026-07-30k licence ` +
        `record cannot be produced; re-run, and if it persists this is the R5 halt.`,
    );
  }
  const licenceText = normaliseHtmlText(licenceRaw.body);
  const wavItemCount =
    stacProducts.find((product) => product.productId === 'BLKSEA_ANALYSISFORECAST_WAV_007_003')
      ?.itemCount ?? 0;
  const licence: CmemsLicenceEvidence = {
    pageUrl: LICENCE_PAGE_URL,
    httpStatus: licenceRaw.status,
    pageSha256: sha256(licenceRaw.body),
    retrievedAtUtc: nowImpl().toISOString(),
    records: buildLicenceRecords(resolutions, resolvedByKey, licenceText, wavItemCount),
  };
  if (licence.records.some((record) => record.negativeEvidence === null && !record.quoteVerified)) {
    // R5: recorded in the artifact AND fatal at the end — the artifact is still written below
    // so the evidence of WHAT the page said survives for the owner escalation.
    console.error(
      '[db:import:marine-cmems] R5: a verbatim licence quote could NOT be verified against the ' +
        'fetched licence page. THE BUILD HALTS — owner escalation via Atlas.',
    );
  }

  // ── 3. The sweep — 30 SST + 24 wave pairs through the runtime code path ─────
  const nowMs = nowImpl().getTime();
  const sweepTime = selectCmemsTime(nowMs, { startUtc: null, endUtc: null });
  const entries: CmemsProbeEntry[] = [];
  let consecutiveFailures = 0;

  for (const candidate of candidates) {
    const route = CMEMS_BASIN_ROUTING[candidate.seaBasin];
    const sstKey = `${route.seaSurfaceTemperature.productId}/${route.seaSurfaceTemperature.gridToken}`;
    const sstResolved = resolvedByKey.get(sstKey);
    if (sstResolved === undefined) {
      throw new MarineImportError(
        `no resolved SST dataset for ${candidate.slugTr} (selector ${sstKey}) — the resolver ` +
          `failed above; fix that before sweeping.`,
      );
    }

    await sleepImpl(DELAY_BETWEEN_REQUESTS_MS);
    const seaSurfaceTemperature = await probeCall(
      candidate,
      'seaSurfaceTemperature',
      sstResolved,
      route.maxGridDistanceKm,
      nowMs,
      fetchImpl,
      sleepImpl,
    );

    let waveHeight: CmemsProbeCallRecord | null = null;
    let waveDirection: CmemsProbeCallRecord | null = null;
    if (route.wave !== null) {
      const waveKey = `${route.wave.productId}/${route.wave.gridToken}`;
      const waveResolved = resolvedByKey.get(waveKey);
      if (waveResolved === undefined) {
        throw new MarineImportError(
          `no resolved wave dataset for ${candidate.slugTr} (selector ${waveKey}).`,
        );
      }
      await sleepImpl(DELAY_BETWEEN_REQUESTS_MS);
      waveHeight = await probeCall(
        candidate,
        'waveHeight',
        waveResolved,
        route.maxGridDistanceKm,
        nowMs,
        fetchImpl,
        sleepImpl,
      );
      await sleepImpl(DELAY_BETWEEN_REQUESTS_MS);
      waveDirection = await probeCall(
        candidate,
        'waveDirection',
        waveResolved,
        route.maxGridDistanceKm,
        nowMs,
        fetchImpl,
        sleepImpl,
      );
    }

    const calls = [seaSurfaceTemperature, waveHeight, waveDirection].filter(
      (call): call is CmemsProbeCallRecord => call !== null,
    );
    const refused = calls.filter((call) => call.verdict === 'error');
    if (refused.length > 0) {
      consecutiveFailures += 1;
      console.error(
        `[db:import:marine-cmems] ${candidate.slugTr}: ${String(refused.length)} refusal(s) — ` +
          refused
            .map((call) => `${String(call.variableId)} → ${String(call.errorDetail)}`)
            .join('; '),
      );
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        throw new MarineImportError(
          `aborting: ${String(MAX_CONSECUTIVE_FAILURES)} consecutive candidates were refused. ` +
            `If the reply is 400-XML the resolved id has already retired mid-run — re-run the probe.`,
        );
      }
    } else {
      consecutiveFailures = 0;
      const sst = seaSurfaceTemperature;
      console.log(
        `[db:import:marine-cmems] ${candidate.slugTr}: OK (sst ${String(sst.value)} ` +
          `${String(sst.rawUnits)}, snap ${sst.distanceKm?.toFixed(2) ?? 'n/a'} km, ` +
          `${String(sst.elapsedMs)} ms)`,
      );
    }

    entries.push({
      slugTr: candidate.slugTr,
      seaBasin: candidate.seaBasin,
      latitude: candidate.latitude,
      longitude: candidate.longitude,
      probedAtUtc: nowImpl().toISOString(),
      seaSurfaceTemperature,
      waveHeight,
      waveDirection,
    });
  }

  if (entries.length !== candidates.length) {
    throw new MarineImportError(
      `INCOMPLETE RUN — ${String(entries.length)}/${String(candidates.length)} candidates probed.`,
    );
  }

  // ── 4. The 400-XML fixture: one deliberately out-of-extent call, recorded ───
  const wavResolved = resolvedByKey.get('BLKSEA_ANALYSISFORECAST_WAV_007_003/2.5km');
  if (wavResolved === undefined) {
    throw new MarineImportError('no resolved BLKSEA wave dataset for the fixture call.');
  }
  await sleepImpl(DELAY_BETWEEN_REQUESTS_MS);
  const fixtureTimeIso = '2030-01-01T00:00:00Z';
  const fixtureUrl = buildCmemsGetFeatureInfoUrl({
    wmtsBaseUrl: WMTS_ENDPOINT,
    datasetPath: wavResolved.datasetPath,
    field: 'waveHeight',
    latitude: 41.1,
    longitude: 39.72,
    timeIso: fixtureTimeIso,
  });
  const fixtureRaw = await fetchRaw(fixtureUrl, fetchImpl, sleepImpl);
  await mkdir(options.fixtureDir, { recursive: true });
  await writeFile(
    join(options.fixtureDir, 'getfeatureinfo-400-time-out-of-range.xml'),
    fixtureRaw.body,
    'utf8',
  );
  const xmlErrorFixture: CmemsXmlErrorFixtureRecord = {
    requestUrl: fixtureUrl,
    requestedTimeIso: fixtureTimeIso,
    httpStatus: fixtureRaw.status,
    contentType: fixtureRaw.contentType,
    bodySha256: sha256(fixtureRaw.body),
    fixturePath: FIXTURE_RELATIVE_PATH,
    firstBytes: fixtureRaw.body.slice(0, 200),
  };

  // ── 5. Timings, assertions, artifact ────────────────────────────────────────
  const elapsed = entries
    .flatMap((entry) => [entry.seaSurfaceTemperature, entry.waveHeight, entry.waveDirection])
    .filter((call): call is CmemsProbeCallRecord => call !== null)
    .map((call) => call.elapsedMs)
    .sort((a, b) => a - b);
  const timings: CmemsProbeTimings = {
    callCount: elapsed.length,
    p50Ms: percentile(elapsed, 0.5),
    p95Ms: percentile(elapsed, 0.95),
    maxMs: elapsed[elapsed.length - 1] ?? 0,
    totalMs: elapsed.reduce((sum, ms) => sum + ms, 0),
  };

  const artifact: MarineCmemsProbeArtifact = {
    generatedAtUtc: nowImpl().toISOString(),
    userAgent: USER_AGENT,
    wmts: {
      endpoint: WMTS_ENDPOINT,
      tileMatrixSet: CMEMS_TILE_MATRIX_SET,
      zoom: CMEMS_ZOOM,
      timeIso: sweepTime.timeIso,
    },
    stacEndpoint: STAC_ENDPOINT,
    stacProducts,
    licence,
    entries,
    xmlErrorFixture,
    timings,
    assertions: [],
  };
  const assertions = evaluateMarineCmemsArtifact(artifact);
  const finalArtifact: MarineCmemsProbeArtifact = { ...artifact, assertions };

  await mkdir(options.outputDir, { recursive: true });
  await writeFile(
    join(options.outputDir, 'marine-cmems-probe.json'),
    `${JSON.stringify(finalArtifact, null, 2)}\n`,
    'utf8',
  );

  const failures = assertions.filter((assertion) => !assertion.passed);
  console.log(
    `[db:import:marine-cmems] probe done — ${String(entries.length)} points, ` +
      `${String(timings.callCount)} value calls (p50 ${String(timings.p50Ms)} ms, p95 ` +
      `${String(timings.p95Ms)} ms, max ${String(timings.maxMs)} ms) → ${options.outputDir}`,
  );
  if (failures.length > 0) {
    throw new MarineImportError(
      `${String(failures.length)} assertion(s) FAILED. The artifact WAS written so the ` +
        `evidence is reviewable:\n  ${failures
          .map((failure) => `${failure.id}: ${failure.detail}`)
          .join('\n  ')}`,
    );
  }
  console.log('[db:import:marine-cmems] every assertion passed.');
}
