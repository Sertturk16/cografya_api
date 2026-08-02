import {
  CMEMS_BASIN_ROUTING,
  CMEMS_SELECTOR_ENTRIES,
  cmemsWaveSupport,
} from '../../marine/cmems/cmems-routing';
import { parseCmemsDatasetToken } from '../../marine/cmems/cmems-stac';
import {
  CMEMS_TILE_MATRIX_SET,
  CMEMS_UNIT_NORMALISATION,
  CMEMS_VARIABLE_IDS,
  CMEMS_ZOOM,
  isPlausibleCmemsValue,
  type CmemsLayerField,
} from '../../marine/cmems/cmems.constants';
import { toTilePixel } from './geo';
import { MARINE_POINT_CANDIDATES } from './marine-candidates';
import type {
  CmemsProbeAssertionResult,
  CmemsProbeCallRecord,
  CmemsProbeEntry,
  MarineCmemsProbeArtifact,
} from './marine-cmems-artifact.types';

/**
 * Offline acceptance gates over the M4a probe artifact — the machine half of plan §9 M4a:
 * 30/30 snap distances under the basin ceilings, resolver output echoed by the provider, the
 * 6-row licence record with VERIFIED verbatim quotes, the 400-XML fixture, timings.
 *
 * Runs twice: at the end of the probe (failures fail the run loudly, but the artifact is
 * still written so the evidence is reviewable — the M1 precedent) and in
 * `marine-cmems-assertions.spec.ts` on every CI run against the COMMITTED artifact (staleness
 * gate: the committed evidence must keep describing current code).
 *
 * Staleness means CODE comparison: every threshold, unit and request parameter a gate judges
 * is read from CURRENT code (`CMEMS_BASIN_ROUTING`, `CMEMS_UNIT_NORMALISATION`, `CMEMS_ZOOM`,
 * `toTilePixel`), never from the artifact's own copy — an artifact-vs-artifact compare is a
 * gate that structurally cannot fire (review #81 I1; the M1 `marine-assertions.ts` precedent).
 */

function result(id: string, passed: boolean, detail: string): CmemsProbeAssertionResult {
  return { id, passed, detail };
}

/**
 * Recompute the WMTS request from CURRENT code — tile arithmetic, zoom, matrix set, variable
 * id — and require the RECORDED URL to still match. One gate pins `toTilePixel`, `CMEMS_ZOOM`,
 * the parameter names and the layer's variable id against the committed evidence at once: a
 * zoom bump or an arithmetic change must turn the artifact stale here (review #81 I1).
 */
function requestUrlMatchesCurrentCode(
  entry: CmemsProbeEntry,
  field: CmemsLayerField,
  requestUrl: string,
): { matches: boolean; detail: string } {
  let url: URL;
  try {
    url = new URL(requestUrl);
  } catch {
    return { matches: false, detail: `recorded request URL is not parseable: "${requestUrl}"` };
  }
  const params = url.searchParams;
  const pixel = toTilePixel(entry.latitude, entry.longitude, CMEMS_ZOOM);
  const expected: readonly (readonly [string, string])[] = [
    ['TileMatrix', String(CMEMS_ZOOM)],
    ['tilematrixset', CMEMS_TILE_MATRIX_SET],
    ['TileRow', String(pixel.tileRow)],
    ['TileCol', String(pixel.tileCol)],
    ['I', String(pixel.i)],
    ['J', String(pixel.j)],
  ];
  const mismatches = expected
    .filter(([key, value]) => params.get(key) !== value)
    .map(([key, value]) => `${key} recorded "${String(params.get(key))}" ≠ code "${value}"`);
  const layer = params.get('layer') ?? '';
  if (!layer.endsWith(`/${CMEMS_VARIABLE_IDS[field]}`)) {
    mismatches.push(`layer "${layer}" does not end with "/${CMEMS_VARIABLE_IDS[field]}"`);
  }
  return {
    matches: mismatches.length === 0,
    detail:
      mismatches.length === 0
        ? 'recorded URL matches a recompute from current code'
        : mismatches.join('; '),
  };
}

function callChecks(
  results: CmemsProbeAssertionResult[],
  entry: CmemsProbeEntry,
  field: CmemsLayerField,
  call: CmemsProbeCallRecord,
): void {
  const label = `${entry.slugTr}/${field}`;
  // Ceilings and units come FROM CURRENT CODE, never from the artifact's recorded copy — a
  // follow-up that tightens a basin ceiling or changes a canonical unit must fail HERE.
  const codeCeilingKm = CMEMS_BASIN_ROUTING[entry.seaBasin].maxGridDistanceKm;
  const codeUnit = CMEMS_UNIT_NORMALISATION[field];

  results.push(
    result(
      `c1-transport-${label}`,
      call.httpStatus === 200 && call.contentType.toLowerCase().includes('application/json'),
      `HTTP ${String(call.httpStatus)} ${call.contentType}`,
    ),
  );

  if (call.verdict === 'ok') {
    results.push(
      result(
        `c2-value-plausible-${label}`,
        call.value !== null && isPlausibleCmemsValue(field, call.value),
        `value ${String(call.value)}`,
      ),
    );
    results.push(
      result(
        `c3-snap-${label}`,
        call.maxGridDistanceKm === codeCeilingKm &&
          call.distanceKm !== null &&
          call.distanceKm <= codeCeilingKm,
        `snap ${String(call.distanceKm)} km vs CODE ceiling ${String(codeCeilingKm)} km ` +
          `(recorded ${String(call.maxGridDistanceKm)}) — a distance breach means OUR tile ` +
          `arithmetic picked the wrong cell; recorded ≠ code means the evidence proves an ` +
          `outdated threshold and the probe must be re-run`,
      ),
    );
    results.push(
      result(
        `c4-unit-${label}`,
        call.rawUnits === codeUnit.raw && call.normalizedUnit === codeUnit.canonical,
        `raw "${String(call.rawUnits)}" → canonical "${String(call.normalizedUnit)}" must equal ` +
          `current code's "${codeUnit.raw}" → "${codeUnit.canonical}"`,
      ),
    );
  } else {
    // A refusal or a land-mask null on a hand-picked open-water reference point is a failed
    // probe: the coordinate (or the resolution) must be fixed and the probe re-run.
    results.push(
      result(`c5-verdict-${label}`, false, `verdict ${call.verdict}: ${String(call.errorDetail)}`),
    );
  }

  results.push(
    result(
      `c6-dataset-echo-${label}`,
      call.datasetId !== null &&
        parseCmemsDatasetToken(call.datasetId.split('/')[1] ?? '') !== null,
      `provider echoed "${String(call.datasetId)}" — must be a PRODUCT/dataset path whose ` +
        `dataset half parses as an hourly set`,
    ),
  );

  results.push(
    result(
      `c7-timing-${label}`,
      Number.isFinite(call.elapsedMs) && call.elapsedMs > 0,
      `elapsed ${String(call.elapsedMs)} ms`,
    ),
  );

  const urlCheck = requestUrlMatchesCurrentCode(entry, field, call.requestUrl);
  results.push(result(`c8-request-url-${label}`, urlCheck.matches, urlCheck.detail));
}

/** Every gate over one artifact. Pure; throws nothing — the caller decides what a failure means. */
export function evaluateMarineCmemsArtifact(
  artifact: MarineCmemsProbeArtifact,
): CmemsProbeAssertionResult[] {
  const results: CmemsProbeAssertionResult[] = [];

  // ── a1: completeness — every candidate probed, none invented ────────────────
  const expectedSlugs = MARINE_POINT_CANDIDATES.map((candidate) => candidate.slugTr);
  const actualSlugs = artifact.entries.map((entry) => entry.slugTr);
  results.push(
    result(
      'a1-completeness',
      expectedSlugs.length === actualSlugs.length &&
        expectedSlugs.every((slug, index) => actualSlugs[index] === slug),
      `${String(actualSlugs.length)}/${String(expectedSlugs.length)} candidates, in order`,
    ),
  );

  // ── a2: the support rule — wave queried exactly where CMEMS supports it ─────
  for (const entry of artifact.entries) {
    const waveSupported = cmemsWaveSupport(entry.seaBasin) === 'supported';
    results.push(
      result(
        `a2-wave-support-${entry.slugTr}`,
        waveSupported
          ? entry.waveHeight !== null && entry.waveDirection !== null
          : entry.waveHeight === null && entry.waveDirection === null,
        waveSupported
          ? 'basin has a CMEMS wave product — both wave calls must exist'
          : 'Marmara: no CMEMS wave product — the probe must make NO wave call (the runtime ' +
              'skips it the same way)',
      ),
    );
  }

  // ── c*: per-call transport/value/snap/unit/echo/timing/url gates ────────────
  for (const entry of artifact.entries) {
    callChecks(results, entry, 'seaSurfaceTemperature', entry.seaSurfaceTemperature);
    if (entry.waveHeight !== null) callChecks(results, entry, 'waveHeight', entry.waveHeight);
    if (entry.waveDirection !== null) {
      callChecks(results, entry, 'waveDirection', entry.waveDirection);
    }
  }

  // ── a3: STAC resolution — every selector resolved, every id parseable ───────
  const resolvedByKey = new Map<string, string | null>();
  for (const product of artifact.stacProducts) {
    for (const selection of product.selections) {
      resolvedByKey.set(selection.selectorKey, selection.datasetId);
    }
  }
  for (const entry of CMEMS_SELECTOR_ENTRIES) {
    const datasetId = resolvedByKey.get(entry.key);
    results.push(
      result(
        `a3-resolved-${entry.key}`,
        typeof datasetId === 'string' && parseCmemsDatasetToken(datasetId) !== null,
        `resolved "${String(datasetId)}"`,
      ),
    );
  }

  // ── a4: the licence record (DEC 2026-07-30k) — 6 rows, quotes VERIFIED ──────
  results.push(
    result(
      'a4-licence-rows',
      artifact.licence.records.length === 6,
      `${String(artifact.licence.records.length)} rows (5 datasets + the Marmara negative)`,
    ),
  );
  for (const record of artifact.licence.records) {
    const isNegative = record.negativeEvidence !== null;
    results.push(
      result(
        `a4-licence-row-${String(record.row)}`,
        isNegative
          ? record.resolvedDatasetId === null && record.negativeEvidence !== ''
          : record.resolvedDatasetId !== null &&
              record.doi !== null &&
              record.verbatimCommercialUseQuote.length > 0 &&
              record.quoteVerified &&
              record.attributionRequirement.length > 0,
        isNegative
          ? `negative row: ${String(record.negativeEvidence)}`
          : `dataset ${String(record.resolvedDatasetId)} · DOI ${String(record.doi)} · quote ` +
              `verified=${String(record.quoteVerified)} — an unverified commercial-use quote ` +
              `HALTS the build (risk R5, owner escalation)`,
      ),
    );
  }

  // ── a5: the 400-XML fixture — the retired-dataset contract, recorded ────────
  const fixture = artifact.xmlErrorFixture;
  results.push(
    result(
      'a5-xml-fixture',
      fixture.httpStatus === 400 &&
        fixture.contentType.toLowerCase().includes('text/xml') &&
        fixture.firstBytes.includes('ExceptionReport') &&
        fixture.fixturePath.startsWith('test/fixtures/cmems/'),
      `HTTP ${String(fixture.httpStatus)} ${fixture.contentType} → ${fixture.fixturePath}`,
    ),
  );

  // ── a6: timings present and coherent ────────────────────────────────────────
  const timings = artifact.timings;
  results.push(
    result(
      'a6-timings',
      timings.callCount > 0 &&
        timings.p50Ms > 0 &&
        timings.p50Ms <= timings.p95Ms &&
        timings.p95Ms <= timings.maxMs,
      `${String(timings.callCount)} calls · p50 ${String(timings.p50Ms)} ms · p95 ` +
        `${String(timings.p95Ms)} ms · max ${String(timings.maxMs)} ms`,
    ),
  );

  return results;
}
