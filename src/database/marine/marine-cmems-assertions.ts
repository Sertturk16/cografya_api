import { CMEMS_BASIN_ROUTING, CMEMS_SELECTOR_ENTRIES } from '../../marine/cmems/cmems-routing';
import { parseCmemsDatasetToken } from '../../marine/cmems/cmems-stac';
import { isPlausibleCmemsValue, type CmemsLayerField } from '../../marine/cmems/cmems.constants';
import { MARINE_POINT_CANDIDATES } from './marine-candidates';
import type {
  CmemsProbeAssertionResult,
  CmemsProbeCallRecord,
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
 */

function result(id: string, passed: boolean, detail: string): CmemsProbeAssertionResult {
  return { id, passed, detail };
}

function callChecks(
  results: CmemsProbeAssertionResult[],
  slug: string,
  field: CmemsLayerField,
  call: CmemsProbeCallRecord,
): void {
  const label = `${slug}/${field}`;

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
        call.distanceKm !== null && call.distanceKm <= call.maxGridDistanceKm,
        `snap ${String(call.distanceKm)} km vs ceiling ${String(call.maxGridDistanceKm)} km — a ` +
          `breach means OUR tile arithmetic picked the wrong cell`,
      ),
    );
    results.push(
      result(
        `c4-unit-${label}`,
        call.normalizedUnit !== null && call.rawUnits !== null,
        `raw "${String(call.rawUnits)}" → canonical "${String(call.normalizedUnit)}"`,
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
    const waveSupported = CMEMS_BASIN_ROUTING[entry.seaBasin].wave !== null;
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

  // ── c*: per-call transport/value/snap/unit/echo/timing gates ────────────────
  for (const entry of artifact.entries) {
    callChecks(results, entry.slugTr, 'seaSurfaceTemperature', entry.seaSurfaceTemperature);
    if (entry.waveHeight !== null)
      callChecks(results, entry.slugTr, 'waveHeight', entry.waveHeight);
    if (entry.waveDirection !== null) {
      callChecks(results, entry.slugTr, 'waveDirection', entry.waveDirection);
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
