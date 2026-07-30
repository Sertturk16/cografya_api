import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { haversineKm, toTilePixel } from './geo';
import type {
  CmemsProbeResult,
  MarineProbeEntry,
  MarinePointsProbeArtifact,
  OpenMeteoProbeResult,
  OpenMeteoRequestRecord,
} from './marine-artifact.types';
import {
  deriveLayerSupport,
  evaluateProbeAssertions,
  evaluateRunAssertions,
  MarineImportError,
} from './marine-assertions';
import {
  BASIN_CMEMS_ROUTING,
  MARINE_POINT_CANDIDATES,
  MARMARA_CROSS_CHECK_LAYER,
  type CmemsLayerRef,
  type MarinePointCandidate,
} from './marine-candidates';

/**
 * `--phase=probe` — the ONLY phase that touches the network.
 *
 * Run BY HAND (when the candidate list changes, or roughly yearly), never by CI and never by
 * the running app. It writes one reviewable artifact and stops; nothing here can reach the
 * database.
 *
 * ## Politeness, by construction — the `db:import:climate` precedent, deliberately copied
 * Copernicus Marine and Open-Meteo both serve us anonymously and for free. This client is
 * therefore conservative on every axis:
 *   - **Serial**, never parallel — one request in flight, ever.
 *   - **≥ 2.5 s between requests.** ~84 CMEMS calls ≈ 4 minutes; there is no deadline here.
 *   - **20 s timeout** per request via `AbortSignal.timeout` — no unbounded external call.
 *   - **2 retries** with a longer pause, for transient failures only.
 *   - **An identifying User-Agent** with a contact route — we do not pretend to be a browser.
 *   - **A 3-consecutive-failure circuit breaker** that aborts the run. If the provider has
 *     started refusing us, stopping is correct; grinding through 84 calls collecting errors is
 *     not.
 *   - **A response byte cap**, because `AbortSignal.timeout` bounds wall-clock, not payload.
 *   - **Open-Meteo is called exactly TWICE for all 30 points**, not 30 times: its multi-
 *     coordinate form takes the whole set in one request (measured: 31 points, 0.50 s).
 *
 * ## What it does NOT do
 * No API key, no account, no credential — both endpoints are anonymous. Stated explicitly so
 * nobody later "fixes" that by adding one.
 */

const CMEMS_ENDPOINT = 'https://wmts.marine.copernicus.eu/teroWmts';
const CMEMS_TILE_MATRIX_SET = 'EPSG:3857';

/**
 * Zoom 12, comfortably above SPEC v1 §3.1's "≥ 10" rule.
 *
 * The rule exists because the response depends on zoom: the SAME İzmir Gulf coordinate returned
 * `null` at zoom 6 and 24.65 °C at zoom 8, since a low-zoom pixel covers enough ground to land
 * on land. At zoom 12 a pixel is ~27 m at 40° N — finer than even the 500 m Marmara grid, so
 * the pixel is always inside the intended cell.
 */
const CMEMS_ZOOM = 12;

const OPEN_METEO_FORECAST_ENDPOINT = 'https://api.open-meteo.com/v1/forecast';
const OPEN_METEO_MARINE_ENDPOINT = 'https://marine-api.open-meteo.com/v1/marine';

/**
 * Identify ourselves honestly.
 *
 * NO `contact via <url>` claim. It used to read `contact via https://marine.copernicus.eu` —
 * the PROVIDER's own homepage, which gives their ops team no way to reach us and is therefore a
 * contact channel that only looks like one (review #72, security MINOR; the climate line carried
 * the same copy-paste and is fixed alongside).
 *
 * TODO(contact): publish a real Coğrafya-owned contact URL or mailbox here once one exists. It
 * does not today — the domain and hosting are still undecided — and inventing one, or committing
 * a personal address, is an owner decision rather than an engineering one. Surfaced to Atlas.
 */
const USER_AGENT =
  'CografyaPlatformBot/1.0 (non-commercial educational geography platform; ' +
  'marine reference-point probe; run by hand, roughly yearly)';

const REQUEST_TIMEOUT_MS = 20_000;
const DELAY_BETWEEN_REQUESTS_MS = 2_500;
const RETRY_DELAY_MS = 8_000;
const MAX_ATTEMPTS_PER_REQUEST = 3;
const MAX_CONSECUTIVE_FAILURES = 3;
/** A GetFeatureInfo reply is ~300 B and an Open-Meteo batch ~250 KB; 8 MB is ample headroom. */
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;

export interface ProbePhaseOptions {
  /** Directory the artifact is written to. */
  outputDir: string;
  /** Injected for tests; defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
  /** Injected for tests; defaults to a real timer. */
  sleepImpl?: (ms: number) => Promise<void>;
  /**
   * The clock every provenance stamp is read from. Injected for tests — and so a REPLAY over
   * cached responses stays reproducible by committed code, which is the only way an artifact's
   * provenance story survives (the climate line's `nowImpl` seam, same reasoning).
   */
  nowImpl?: () => Date;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * A response that breached the byte cap.
 *
 * Its own type purely so `fetchRaw` can tell a deterministic refusal (do not retry) from a
 * transport blip (do retry). Everything else about it behaves like any other import error.
 */
class OversizedResponseError extends MarineImportError {}

interface RawResponse {
  status: number;
  contentType: string;
  body: string;
}

/**
 * Read a response body with a hard byte cap.
 *
 * `Content-Length` is checked first — a cheap early exit — but it is only a hint (absent on a
 * chunked response, and a server may lie), so the stream is metered as well. The second half is
 * what actually enforces the cap.
 */
async function readBodyCapped(response: Response, url: string): Promise<string> {
  const declared = Number(response.headers.get('content-length') ?? Number.NaN);
  if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) {
    throw new OversizedResponseError(
      `${url} declares Content-Length ${String(declared)} B, above the ${String(MAX_RESPONSE_BYTES)} B cap.`,
    );
  }

  const body = response.body;
  if (body === null) {
    // A body-less response still has to obey the cap. `text()` buffers whatever arrives, so the
    // check has to happen after the read — which is fine, because this branch only exists for
    // runtimes/stubs that expose no stream, never for a hostile peer. Leaving it uncapped meant
    // the documented 8 MB ceiling had a hole exactly where the streaming meter could not run
    // (review #72, silent-failure M).
    const text = await response.text();
    if (Buffer.byteLength(text, 'utf8') > MAX_RESPONSE_BYTES) {
      throw new OversizedResponseError(
        `${url} returned a body-less response over the ${String(MAX_RESPONSE_BYTES)} B cap.`,
      );
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
        throw new OversizedResponseError(
          `${url} exceeded the ${String(MAX_RESPONSE_BYTES)} B response cap — aborting the read.`,
        );
      }
      chunks.push(decoder.decode(value, { stream: true }));
    }
  } finally {
    // Releases the connection on the throw path too, so a capped read cannot leak a socket.
    await reader.cancel().catch(() => undefined);
  }

  chunks.push(decoder.decode());
  return chunks.join('');
}

/**
 * One HTTP GET with retries.
 *
 * A non-200 is NOT thrown here: CMEMS answers a malformed request with HTTP 400 and an XML
 * body, and that response is EVIDENCE the artifact must record rather than an exception to
 * swallow. Only transport failures (timeout, DNS, socket) retry.
 */
async function fetchRaw(
  url: string,
  fetchImpl: typeof fetch,
  sleepImpl: (ms: number) => Promise<void>,
): Promise<RawResponse> {
  let lastError: unknown;
  // The number of attempts actually MADE, which is not always the maximum: a size-cap breach
  // breaks out after one. Reporting the constant instead told the operator we had tried three
  // times when we had tried once — a small lie that sends them looking for a flaky network.
  let attemptsMade = 0;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS_PER_REQUEST; attempt += 1) {
    attemptsMade = attempt;
    try {
      const response = await fetchImpl(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        redirect: 'follow',
      });
      return {
        status: response.status,
        contentType: response.headers.get('content-type') ?? '',
        body: await readBodyCapped(response, url),
      };
    } catch (error: unknown) {
      lastError = error;
      // A size-cap breach is DETERMINISTIC: the same request will produce the same oversized
      // body. Retrying it twice more, with 8 s pauses, only re-requests a payload we already
      // refused — from a free, anonymous provider we are deliberately being polite to.
      if (error instanceof OversizedResponseError) break;
      if (attempt < MAX_ATTEMPTS_PER_REQUEST) {
        console.warn(
          `[db:import:marine-points] attempt ${String(attempt)} failed for ${url}:`,
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
 * Did this call come back as data, as opposed to a provider refusal?
 *
 * The same two conditions `assertTransport` applies offline, so the breaker and the acceptance
 * criteria agree on what "the provider answered" means.
 */
function isCleanJsonResponse(result: CmemsProbeResult): boolean {
  return result.httpStatus === 200 && result.contentType.toLowerCase().includes('application/json');
}

function sha256(body: string): string {
  return createHash('sha256').update(body, 'utf8').digest('hex');
}

/**
 * Round OUR computed distance to 0.1 m.
 *
 * Applied only to values this file derives, never to a provider's own numbers (those stay
 * verbatim — they are the evidence). Without it a point that snaps exactly onto a grid centre
 * records `5.1e-11 km` of floating-point noise, which reads like a real measurement and makes
 * the artifact churn between runs for no reason.
 */
function roundKm(km: number): number {
  return Math.round(km * 10_000) / 10_000;
}

export function buildCmemsUrl(latitude: number, longitude: number, layer: CmemsLayerRef): string {
  const pixel = toTilePixel(latitude, longitude, CMEMS_ZOOM);
  const params = new URLSearchParams({
    service: 'WMTS',
    version: '1.0.0',
    request: 'GetFeatureInfo',
    layer: `${layer.datasetId}/${layer.variableId}`,
    style: '',
    format: 'image/png',
    tilematrixset: CMEMS_TILE_MATRIX_SET,
    TileMatrix: String(CMEMS_ZOOM),
    TileRow: String(pixel.tileRow),
    TileCol: String(pixel.tileCol),
    I: String(pixel.i),
    J: String(pixel.j),
    infoformat: 'application/json',
  });
  return `${CMEMS_ENDPOINT}?${params.toString()}`;
}

/**
 * Extract the one feature's properties from a GetFeatureInfo body.
 *
 * **Reads `properties.lat` / `properties.lon` and NEVER `geometry.coordinates`.** The provider
 * emits `geometry.coordinates` as `[latitude, longitude]`, which is the REVERSE of the GeoJSON
 * standard's `[longitude, latitude]`. Anything consuming it as GeoJSON would place every
 * Turkish point somewhere in the Indian Ocean — silently, since both numbers are valid
 * coordinates. Measured 2026-07-30; SPEC v1 §3.1 flagged it first.
 */
export function parseCmemsProperties(body: string): {
  datasetId: string | null;
  variableId: string | null;
  value: number | null;
  units: string | null;
  lat: number | null;
  lon: number | null;
} {
  const parsed: unknown = JSON.parse(body);
  const features = (parsed as { features?: unknown }).features;
  const first = Array.isArray(features) ? (features[0] as unknown) : undefined;
  const properties = (first as { properties?: unknown } | undefined)?.properties;
  if (properties === null || typeof properties !== 'object') {
    throw new MarineImportError('GetFeatureInfo response has no feature properties');
  }

  const record = properties as Record<string, unknown>;
  const num = (key: string): number | null =>
    typeof record[key] === 'number' && Number.isFinite(record[key]) ? record[key] : null;
  const str = (key: string): string | null =>
    typeof record[key] === 'string' ? record[key] : null;

  return {
    datasetId: str('datasetId'),
    variableId: str('variableId'),
    value: num('value'),
    units: str('units'),
    lat: num('lat'),
    lon: num('lon'),
  };
}

async function probeCmemsLayer(
  candidate: MarinePointCandidate,
  layer: CmemsLayerRef,
  fetchImpl: typeof fetch,
  sleepImpl: (ms: number) => Promise<void>,
): Promise<CmemsProbeResult> {
  const requestUrl = buildCmemsUrl(candidate.latitude, candidate.longitude, layer);
  const raw = await fetchRaw(requestUrl, fetchImpl, sleepImpl);

  const base = {
    requestUrl,
    httpStatus: raw.status,
    contentType: raw.contentType,
    responseSha256: sha256(raw.body),
    requestedDatasetId: layer.datasetId,
    requestedVariableId: layer.variableId,
  };

  // Check the transport BEFORE parsing. The provider's error path is HTTP 400 + `text/xml`
  // OWS ExceptionReport; a blind `JSON.parse` would throw there and lose the evidence, and
  // treating it as "no data" would turn our own bad request into a claim about the sea.
  if (raw.status !== 200 || !raw.contentType.toLowerCase().includes('application/json')) {
    console.error(
      `[db:import:marine-points] ${candidate.slugTr} / ${layer.variableId}: HTTP ${String(raw.status)} ` +
        `${raw.contentType} — body recorded, assertions will fail. First 200 chars: ` +
        `${raw.body.slice(0, 200)}`,
    );
    return {
      ...base,
      datasetId: null,
      variableId: null,
      value: null,
      units: null,
      gridLatitude: null,
      gridLongitude: null,
      distanceKm: null,
    };
  }

  const properties = parseCmemsProperties(raw.body);
  const distanceKm =
    properties.lat === null || properties.lon === null
      ? null
      : roundKm(
          haversineKm(candidate.latitude, candidate.longitude, properties.lat, properties.lon),
        );

  return {
    ...base,
    datasetId: properties.datasetId,
    variableId: properties.variableId,
    value: properties.value,
    units: properties.units,
    gridLatitude: properties.lat,
    gridLongitude: properties.lon,
    distanceKm,
  };
}

/** One location's block of an Open-Meteo multi-coordinate response. */
export interface OpenMeteoLocation {
  latitude: number;
  longitude: number;
  hourly: Record<string, unknown>;
  hourly_units: Record<string, string>;
}

/**
 * Normalise Open-Meteo's response into one block per requested coordinate.
 *
 * The API returns a bare object for ONE coordinate and an array for several. Both forms are
 * handled so the code cannot break if the candidate list ever shrinks to one point.
 */
export function parseOpenMeteoLocations(body: string, expected: number): OpenMeteoLocation[] {
  const parsed: unknown = JSON.parse(body);
  const list = Array.isArray(parsed) ? parsed : [parsed];
  if (list.length !== expected) {
    throw new MarineImportError(
      `Open-Meteo returned ${String(list.length)} location block(s) for ${String(expected)} ` +
        `requested coordinates — the batched response cannot be aligned to the candidates.`,
    );
  }
  return list.map((item) => {
    const record = item as Record<string, unknown>;
    const hourly = record.hourly;
    if (hourly === null || typeof hourly !== 'object') {
      throw new MarineImportError('an Open-Meteo location block carries no `hourly` object');
    }
    return {
      latitude: Number(record.latitude),
      longitude: Number(record.longitude),
      hourly: hourly as Record<string, unknown>,
      hourly_units: (record.hourly_units ?? {}) as Record<string, string>,
    };
  });
}

/** First sample of one hourly variable, or null when the provider has no value there. */
function firstSample(hourly: Record<string, unknown>, key: string): number | null {
  const series = hourly[key];
  if (!Array.isArray(series)) return null;
  const value: unknown = series[0];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function firstTime(hourly: Record<string, unknown>): string | null {
  const times = hourly.time;
  if (!Array.isArray(times)) return null;
  const value: unknown = times[0];
  return typeof value === 'string' ? value : null;
}

/**
 * Stamp an explicit UTC designator onto a provider timestamp.
 *
 * We request `timezone=UTC`, and Open-Meteo answers with a zone-LESS local-looking string
 * (`2026-07-30T00:00`). Recording that verbatim in a field the artifact types call "ISO-8601
 * UTC" produces evidence that reads ambiguously — and a zone-less string is exactly the kind a
 * later reader parses in local time without noticing. The instant is unchanged; only the
 * designator is made explicit.
 */
export function toUtcInstant(value: string | null): string | null {
  if (value === null) return null;
  // Already carries a zone (`Z` or `±HH:MM`) — leave the provider's string untouched.
  if (/(?:Z|[+-]\d{2}:?\d{2})$/.test(value)) return value;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return `${value}:00Z`;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(value)) return `${value}Z`;
  // An unrecognised shape is returned verbatim rather than "repaired": inventing a designator
  // for a string we do not understand would be worse evidence than the ambiguous original.
  return value;
}

/**
 * Both Open-Meteo legs, for EVERY candidate, in exactly two HTTP requests.
 *
 * The wind unit is requested explicitly as `ms`. Never the provider default (km/h): a default
 * can change without telling us, and a unit error is more insidious than a value error because
 * the number still looks plausible.
 */
async function probeOpenMeteo(
  candidates: readonly MarinePointCandidate[],
  fetchImpl: typeof fetch,
  sleepImpl: (ms: number) => Promise<void>,
): Promise<{ results: OpenMeteoProbeResult[]; requests: OpenMeteoRequestRecord[] }> {
  const latitudes = candidates.map((candidate) => candidate.latitude.toFixed(4)).join(',');
  const longitudes = candidates.map((candidate) => candidate.longitude.toFixed(4)).join(',');

  const forecastUrl = `${OPEN_METEO_FORECAST_ENDPOINT}?${new URLSearchParams({
    latitude: latitudes,
    longitude: longitudes,
    hourly: 'wind_speed_10m,wind_direction_10m',
    wind_speed_unit: 'ms',
    forecast_days: '1',
    timeformat: 'iso8601',
    timezone: 'UTC',
  }).toString()}`;

  const marineUrl = `${OPEN_METEO_MARINE_ENDPOINT}?${new URLSearchParams({
    latitude: latitudes,
    longitude: longitudes,
    hourly: 'wave_height,wave_direction,sea_surface_temperature',
    forecast_days: '1',
    timeformat: 'iso8601',
    timezone: 'UTC',
  }).toString()}`;

  const forecastRaw = await fetchRaw(forecastUrl, fetchImpl, sleepImpl);
  await sleepImpl(DELAY_BETWEEN_REQUESTS_MS);
  const marineRaw = await fetchRaw(marineUrl, fetchImpl, sleepImpl);

  for (const [label, raw] of [
    ['forecast', forecastRaw],
    ['marine', marineRaw],
  ] as const) {
    if (raw.status !== 200 || !raw.contentType.toLowerCase().includes('application/json')) {
      throw new MarineImportError(
        `Open-Meteo ${label} returned HTTP ${String(raw.status)} ${raw.contentType}. ` +
          `First 200 chars: ${raw.body.slice(0, 200)}`,
      );
    }
  }

  const forecast = parseOpenMeteoLocations(forecastRaw.body, candidates.length);
  const marine = parseOpenMeteoLocations(marineRaw.body, candidates.length);

  const results = candidates.map((candidate, index) => {
    const wind = forecast[index];
    const sea = marine[index];
    if (wind === undefined || sea === undefined) {
      throw new MarineImportError(`Open-Meteo block ${String(index)} is missing`);
    }

    // BOTH grid centres are recorded. The marine grid (~1/12°) is where the wave and SST values
    // come from; the forecast grid is a different endpoint and a different model, and it is the
    // ONLY source of the two wind layers. Recording just one of them would leave a published
    // layer with no evidence of where its value was read (review #72, code-reviewer M).
    const distanceKm = roundKm(
      haversineKm(candidate.latitude, candidate.longitude, sea.latitude, sea.longitude),
    );
    const windDistanceKm = roundKm(
      haversineKm(candidate.latitude, candidate.longitude, wind.latitude, wind.longitude),
    );

    return {
      gridLatitude: sea.latitude,
      gridLongitude: sea.longitude,
      distanceKm,
      windGridLatitude: wind.latitude,
      windGridLongitude: wind.longitude,
      windDistanceKm,
      validAtUtc: toUtcInstant(firstTime(sea.hourly) ?? firstTime(wind.hourly)),
      windSpeed10m: firstSample(wind.hourly, 'wind_speed_10m'),
      windDirection10m: firstSample(wind.hourly, 'wind_direction_10m'),
      waveHeight: firstSample(sea.hourly, 'wave_height'),
      waveDirection: firstSample(sea.hourly, 'wave_direction'),
      seaSurfaceTemperature: firstSample(sea.hourly, 'sea_surface_temperature'),
      units: { ...wind.hourly_units, ...sea.hourly_units },
    } satisfies OpenMeteoProbeResult;
  });

  const requests: OpenMeteoRequestRecord[] = [
    {
      label: 'forecast',
      requestUrl: forecastUrl,
      httpStatus: forecastRaw.status,
      contentType: forecastRaw.contentType,
      responseSha256: sha256(forecastRaw.body),
      pointCount: candidates.length,
    },
    {
      label: 'marine',
      requestUrl: marineUrl,
      httpStatus: marineRaw.status,
      contentType: marineRaw.contentType,
      responseSha256: sha256(marineRaw.body),
      pointCount: candidates.length,
    },
  ];

  return { results, requests };
}

/**
 * Probe every candidate and write the artifact.
 *
 * ## The artifact is written even when assertions FAIL — deliberately
 * A failed run's evidence is exactly what an operator needs in order to move a coordinate.
 * Throwing before writing would leave them with a console scrollback and nothing else. The
 * process still exits non-zero, and `--phase=load` refuses the artifact independently, so a
 * failing artifact can never reach the database by accident.
 *
 * That applies to ASSERTION failures only. An ABORT — the circuit breaker, a transport failure
 * run, or the completeness gate — happens before the write and produces NO file at all, leaving
 * the previous committed artifact untouched. That is the right outcome: a partial artifact is
 * indistinguishable from a complete one at load time, and the console output already carries
 * every rejection the run saw.
 */
export async function runProbePhase(options: ProbePhaseOptions): Promise<void> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleepImpl = options.sleepImpl ?? sleep;
  const nowImpl = options.nowImpl ?? ((): Date => new Date());

  const candidates = MARINE_POINT_CANDIDATES;
  console.log(
    `[db:import:marine-points] probe — ${String(candidates.length)} candidate points, serial, ` +
      `≥${String(DELAY_BETWEEN_REQUESTS_MS / 1000)} s apart. Budget ~5 minutes.`,
  );

  // Open-Meteo FIRST: two requests for the whole set, so a provider-wide outage is discovered
  // in seconds instead of after four minutes of CMEMS calls.
  const openMeteo = await probeOpenMeteo(candidates, fetchImpl, sleepImpl);

  const entries: MarineProbeEntry[] = [];
  let consecutiveFailures = 0;
  /**
   * Set when the provider-refusal breaker trips; thrown after the current candidate has been
   * appended to `entries` IN MEMORY.
   *
   * That appended entry does NOT reach disk: the artifact is written only after the completeness
   * gate below, which the abort precedes. The durable record of an aborted run is the console
   * output — which is why every rejection is logged as it happens rather than summarised at the
   * end.
   */
  let providerRefusalAbort: string | null = null;

  for (const [index, candidate] of candidates.entries()) {
    const routing = BASIN_CMEMS_ROUTING[candidate.seaBasin];
    const openMeteoResult = openMeteo.results[index];
    if (openMeteoResult === undefined) {
      throw new MarineImportError(`no Open-Meteo result for ${candidate.slugTr}`);
    }

    try {
      await sleepImpl(DELAY_BETWEEN_REQUESTS_MS);
      const seaSurfaceTemperature = await probeCmemsLayer(
        candidate,
        routing.seaSurfaceTemperature,
        fetchImpl,
        sleepImpl,
      );

      let waveHeight: CmemsProbeResult | null = null;
      let waveDirection: CmemsProbeResult | null = null;
      if (routing.wave !== null) {
        await sleepImpl(DELAY_BETWEEN_REQUESTS_MS);
        waveHeight = await probeCmemsLayer(candidate, routing.wave.height, fetchImpl, sleepImpl);
        await sleepImpl(DELAY_BETWEEN_REQUESTS_MS);
        waveDirection = await probeCmemsLayer(
          candidate,
          routing.wave.direction,
          fetchImpl,
          sleepImpl,
        );
      }

      // The Marmara cross-check: a point genuinely in the Marmara must get `null` from the
      // BLACK SEA wave product, whose box contains the Marmara but whose land mask excludes it.
      let crossCheck: CmemsProbeResult | null = null;
      if (routing.wave === null) {
        await sleepImpl(DELAY_BETWEEN_REQUESTS_MS);
        crossCheck = await probeCmemsLayer(
          candidate,
          MARMARA_CROSS_CHECK_LAYER,
          fetchImpl,
          sleepImpl,
        );
      }

      // The circuit breaker counts PROVIDER-LEVEL refusals too, not only transport failures.
      //
      // `fetchRaw` deliberately does not throw on a non-200: the body is evidence. But that meant
      // the breaker — whose stated purpose is "if the provider has started refusing us, stopping
      // is correct; grinding through 84 calls is not" — never engaged for the one scenario this
      // repo has already written down as its most likely trigger: a pinned dataset id retires and
      // CMEMS answers every single call with a clean HTTP 400 + XML. The counter only moved on
      // sockets and timeouts, and it was reset by any request that came back at all. So the run
      // walked all 30 candidates hammering a provider that was telegraphing "stop asking me
      // this", and only failed at the very end (review #72, silent-failure I2).
      const rejected = [seaSurfaceTemperature, waveHeight, waveDirection, crossCheck].filter(
        (result): result is CmemsProbeResult => result !== null && !isCleanJsonResponse(result),
      );
      if (rejected.length > 0) {
        consecutiveFailures += 1;
        console.error(
          `[db:import:marine-points] ${candidate.slugTr}: ${String(rejected.length)} provider ` +
            `rejection(s) — ${rejected
              .map((result) => `${result.requestedVariableId} HTTP ${String(result.httpStatus)}`)
              .join(', ')}. Recorded as evidence; counted toward the circuit breaker.`,
        );
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          // Recorded, NOT thrown here. A throw inside this `try` would be caught by the
          // candidate-level handler below, counted a second time, and re-reported as a
          // TRANSPORT failure — the operator would then be told the socket died when in fact
          // the provider answered cleanly and refused. The abort fires after the loop body.
          providerRefusalAbort =
            `aborting: ${String(MAX_CONSECUTIVE_FAILURES)} consecutive candidates were refused by ` +
            `the provider. A pinned dataset id has probably retired — check ` +
            `BASIN_CMEMS_ROUTING against the provider catalogue before re-running.`;
        }
      } else {
        consecutiveFailures = 0;
      }

      const entry: MarineProbeEntry = {
        slugTr: candidate.slugTr,
        slugEn: candidate.slugEn,
        nameTr: candidate.nameTr,
        nameEn: candidate.nameEn,
        coastLabelTr: candidate.coastLabelTr,
        coastLabelEn: candidate.coastLabelEn,
        plateCode: candidate.plateCode,
        provinceNameTr: candidate.provinceNameTr,
        seaBasin: candidate.seaBasin,
        latitude: candidate.latitude,
        longitude: candidate.longitude,
        displayOrder: candidate.displayOrder,
        probedAtUtc: nowImpl().toISOString(),
        cmems: { seaSurfaceTemperature, waveHeight, waveDirection, crossCheck },
        openMeteo: openMeteoResult,
        support: [],
        assertions: [],
      };
      entry.support = deriveLayerSupport(entry);
      entry.assertions = evaluateProbeAssertions(entry);
      entries.push(entry);

      const failed = entry.assertions.filter((assertion) => !assertion.passed);
      if (failed.length === 0) {
        console.log(
          `[db:import:marine-points] ${candidate.slugTr}: OK ` +
            `(sst ${String(seaSurfaceTemperature.value)} ${String(seaSurfaceTemperature.units)}, ` +
            `snap ${seaSurfaceTemperature.distanceKm?.toFixed(2) ?? 'n/a'} km)`,
        );
      } else {
        console.warn(
          `[db:import:marine-points] ${candidate.slugTr}: ${String(failed.length)} FAILED ` +
            `assertion(s):\n  ${failed.map((f) => `${f.id}: ${f.detail}`).join('\n  ')}`,
        );
      }
    } catch (error: unknown) {
      consecutiveFailures += 1;
      console.error(`[db:import:marine-points] ${candidate.slugTr} failed:`, error);
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        throw new MarineImportError(
          `aborting: ${String(MAX_CONSECUTIVE_FAILURES)} consecutive request failures. The ` +
            `provider is refusing us or is down — stop, do not grind through the rest.`,
          { cause: error },
        );
      }
    }

    // Fires OUTSIDE the try/catch, so the provider-refusal abort is reported as what it is
    // rather than being re-caught and relabelled a transport failure.
    if (providerRefusalAbort !== null) {
      throw new MarineImportError(providerRefusalAbort);
    }
  }

  // COMPLETENESS GATE, before anything is written. A candidate absent from the artifact is
  // invisible after this point: `load` would never learn it should exist, and the point would
  // simply never appear on the hub with no error at any layer.
  if (entries.length !== candidates.length) {
    throw new MarineImportError(
      `INCOMPLETE RUN — ${String(entries.length)}/${String(candidates.length)} candidates probed. ` +
        `Refusing to write a partial artifact; re-run the probe phase.`,
    );
  }

  // Stamped HERE, after the gate — not before the loop — so `generatedAtUtc` means what its
  // name says and stays >= every `probedAtUtc`.
  const artifact: MarinePointsProbeArtifact = {
    generatedAtUtc: nowImpl().toISOString(),
    userAgent: USER_AGENT,
    cmems: {
      endpoint: CMEMS_ENDPOINT,
      tileMatrixSet: CMEMS_TILE_MATRIX_SET,
      zoom: CMEMS_ZOOM,
      timeParam: null,
    },
    openMeteo: {
      forecastEndpoint: OPEN_METEO_FORECAST_ENDPOINT,
      marineEndpoint: OPEN_METEO_MARINE_ENDPOINT,
      windSpeedUnit: 'ms',
      requests: openMeteo.requests,
    },
    entries,
  };

  await mkdir(options.outputDir, { recursive: true });
  await writeFile(
    join(options.outputDir, 'marine-points-probe.json'),
    `${JSON.stringify(artifact, null, 2)}\n`,
    'utf8',
  );

  const entryFailures = entries.flatMap((entry) =>
    entry.assertions.filter((a) => !a.passed).map((a) => `${entry.slugTr} / ${a.id}: ${a.detail}`),
  );
  const runResults = evaluateRunAssertions(entries);
  const runFailures = runResults
    .filter((result) => !result.passed)
    .map((result) => `run / ${result.id}: ${result.detail}`);

  console.log(
    `[db:import:marine-points] probe done — ${String(entries.length)} points written to ` +
      `${options.outputDir}`,
  );
  for (const result of runResults) {
    console.log(`[db:import:marine-points] run assertion ${result.id}: ${result.detail}`);
  }

  const failures = [...entryFailures, ...runFailures];
  if (failures.length > 0) {
    // Re-stated at the END, where a human actually looks: a warning logged four minutes and
    // thirty points ago has scrolled out of sight, and an unread failure is a silent one.
    throw new MarineImportError(
      `${String(failures.length)} assertion(s) FAILED. The artifact WAS written so the evidence ` +
        `is reviewable, but it will be refused by --phase=load. Move the offending ` +
        `coordinate(s) and re-probe:\n  ${failures.join('\n  ')}`,
    );
  }

  console.log('[db:import:marine-points] every assertion passed.');
}
