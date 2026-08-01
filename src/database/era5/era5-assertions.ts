import type { Era5AssertionResult, Era5Manifest, Era5SeriesArtifact } from './era5-artifact.types';
import { ERA5_EXPECTED_MONTH_COUNT, ERA5_FIRST_YEAR, ERA5_LAST_YEAR } from './era5-request';
import { EXPECTED_FALLBACK_PLATE_CODES } from './era5-extract';
import { FALLBACK_MAX_DISTANCE_KM } from './era5-grid';

/**
 * The STRUCTURAL gate over the committed artifacts — `evaluateProbeAssertions`'s pattern (A1).
 *
 * ## Structure, never facts
 * Everything below asserts a shape or an invariant: 81 provinces, 360 months, no gaps in the
 * calendar, the fallback SET equals the expected five, every fallback distance under the ceiling,
 * axis directions, `expver` uniform, the `stream=moda` evidence the `tp` factor rests on, no key
 * material. Nothing asserts that a province HAD a particular temperature. The measured values are
 * recorded as evidence in the manifest and asserted nowhere.
 *
 * The one apparent exception is {@link PRECIPITATION_REGIME_PROBES}, and it is not an exception:
 * the `tp` multiplier has three candidate readings whose annual totals differ by THREE ORDERS OF
 * MAGNITUDE (2 223 mm vs 73 mm vs 53 352 mm — probe §2.5), so an order-of-magnitude band is the
 * only offline way to catch a silently wrong factor. SPEC §5.2 mandates it and states explicitly
 * that it is a structural invariant, not a fact pin: the bounds are deliberately hundreds of
 * millimetres wide, and no published figure is compared for equality.
 *
 * ## Why the gate runs in CI too, over the COMMITTED artifact
 * A file generated once and never looked at again is not evidence. `era5-artifact.spec.ts` reads
 * the committed manifest and series and re-runs this function offline, so a hand-edited artifact,
 * a truncated series or a regenerated file that lost a province fails the build.
 */

/** Order-of-magnitude regime probes — bounds are wide ON PURPOSE (see the docblock). */
export const PRECIPITATION_REGIME_PROBES: readonly {
  plateCode: string;
  label: string;
  minAnnualMm: number;
  maxAnnualMm: number;
}[] = [
  // Eastern Black Sea: wet by any reading. `× 1000` alone would land at ~73 mm.
  { plateCode: '53', label: 'Rize (Eastern Black Sea)', minAnnualMm: 1000, maxAnnualMm: 4000 },
  // Continental interior: dry. `× 24 × days × 1000` would land in the tens of thousands.
  { plateCode: '42', label: 'Konya (continental interior)', minAnnualMm: 150, maxAnnualMm: 800 },
];

export interface Era5AssertionInput {
  manifest: Era5Manifest;
  series: Era5SeriesArtifact;
  /** The key, so the no-leak scan can run. `null` when it is genuinely unavailable. */
  apiKey: string | null;
}

export function evaluateEra5Assertions(input: Era5AssertionInput): Era5AssertionResult[] {
  const { manifest, series } = input;
  const results: Era5AssertionResult[] = [];
  const push = (id: string, passed: boolean, detail: string): void => {
    results.push({ id, passed, detail });
  };

  // ── coverage ───────────────────────────────────────────────────────────────
  push(
    'provinces-81',
    manifest.provinces.length === 81,
    `${String(manifest.provinces.length)} province cell record(s) (expected 81).`,
  );
  push(
    'series-81',
    series.provinces.length === 81,
    `${String(series.provinces.length)} province series (expected 81).`,
  );
  push(
    'months-360',
    manifest.months.count === ERA5_EXPECTED_MONTH_COUNT,
    `${String(manifest.months.count)} month(s) (expected ${String(ERA5_EXPECTED_MONTH_COUNT)} = ` +
      `${String(ERA5_FIRST_YEAR)}–${String(ERA5_LAST_YEAR)} × 12).`,
  );
  push(
    'month-labels-complete',
    series.monthLabels.length === ERA5_EXPECTED_MONTH_COUNT &&
      series.monthLabels[0] === `${String(ERA5_FIRST_YEAR)}-01` &&
      series.monthLabels[series.monthLabels.length - 1] === `${String(ERA5_LAST_YEAR)}-12`,
    `month labels run ${String(series.monthLabels[0])} … ` +
      `${String(series.monthLabels[series.monthLabels.length - 1])} ` +
      `(${String(series.monthLabels.length)} entries).`,
  );

  // Completeness is ABSOLUTE: a single missing value fails (SPEC §5.3 — no 5 % null budget here,
  // deliberately unlike the CAMS probe, because this is a migration and not a live feed).
  const shortSeries = series.provinces.filter(
    (province) =>
      province.tempMeanC.length !== ERA5_EXPECTED_MONTH_COUNT ||
      province.precipitationMm.length !== ERA5_EXPECTED_MONTH_COUNT,
  );
  const nonFinite = series.provinces.filter(
    (province) =>
      province.tempMeanC.some((value) => !Number.isFinite(value)) ||
      province.precipitationMm.some((value) => !Number.isFinite(value)),
  );
  push(
    'series-complete',
    shortSeries.length === 0 && nonFinite.length === 0,
    shortSeries.length === 0 && nonFinite.length === 0
      ? `every province carries ${String(ERA5_EXPECTED_MONTH_COUNT)} finite values per variable.`
      : `${String(shortSeries.length)} short series, ${String(nonFinite.length)} with non-finite ` +
          'values — completeness is absolute on this line.',
  );

  // ── A-1 fallback discipline (the ruling's legitimacy condition) ─────────────
  const observedFallback = [...manifest.fallbackPlateCodes].sort();
  const expectedFallback = [...EXPECTED_FALLBACK_PLATE_CODES].sort();
  push(
    'fallback-set-expected',
    observedFallback.length === expectedFallback.length &&
      observedFallback.every((code, index) => code === expectedFallback[index]),
    `fallback fired for [${observedFallback.join(', ')}]; expected exactly ` +
      `[${expectedFallback.join(', ')}].`,
  );
  const recordedFallback = manifest.provinces.filter((province) => province.fallbackUsed);
  push(
    'fallback-flags-consistent',
    recordedFallback.length === observedFallback.length &&
      recordedFallback.every((province) => observedFallback.includes(province.plateCode)),
    `${String(recordedFallback.length)} province row(s) carry the fallback flag; the summary lists ` +
      `${String(observedFallback.length)}.`,
  );
  const overCeiling = manifest.provinces.filter(
    (province) => province.fallbackDistanceKm > FALLBACK_MAX_DISTANCE_KM,
  );
  push(
    'fallback-distance-ceiling',
    overCeiling.length === 0,
    overCeiling.length === 0
      ? `every fallback within the ${String(FALLBACK_MAX_DISTANCE_KM)} km ceiling (max ` +
          `${maxDistance(manifest).toFixed(2)} km).`
      : `over ceiling: ${overCeiling.map((province) => province.plateCode).join(', ')}`,
  );
  // A-1's legitimacy rests on the shift being DECLARED. A fallback row without a positive distance
  // is an undeclared shift wearing a flag.
  const undeclared = recordedFallback.filter((province) => !(province.fallbackDistanceKm > 0));
  push(
    'fallback-distance-recorded',
    undeclared.length === 0,
    undeclared.length === 0
      ? 'every fallback row records a positive distance in km.'
      : `no distance recorded for: ${undeclared.map((province) => province.plateCode).join(', ')}`,
  );
  const nonFallbackDrift = manifest.provinces.filter(
    (province) => !province.fallbackUsed && province.fallbackDistanceKm !== 0,
  );
  push(
    'no-undeclared-drift',
    nonFallbackDrift.length === 0,
    `${String(nonFallbackDrift.length)} province(s) record a shift without the fallback flag.`,
  );

  // ── the file contract, as recorded ─────────────────────────────────────────
  push(
    'axis-directions',
    manifest.axes.longitude.step > 0 && manifest.axes.latitude.step < 0,
    `lon step ${String(manifest.axes.longitude.step)}, lat step ` +
      `${String(manifest.axes.latitude.step)} (measured: +, −).`,
  );
  push(
    'expver-uniform',
    manifest.expver.distinctValues.length === 1 &&
      manifest.expver.distinctValues[0] === '0001' &&
      manifest.expver.count === manifest.months.count,
    `expver values [${manifest.expver.distinctValues.join(', ')}] over ` +
      `${String(manifest.expver.count)} month(s) (expected "0001" throughout).`,
  );
  push(
    'mask-time-invariant',
    manifest.mask.timeInvariant,
    manifest.mask.timeInvariant
      ? 'every inspected cell kept its NaN state across all months.'
      : 'the land/sea mask CHANGED across months — cell selection would depend on the month.',
  );
  push(
    'mask-present',
    manifest.mask.maskedCells > 0 && manifest.mask.maskedCells < manifest.mask.totalCells,
    `${String(manifest.mask.maskedCells)}/${String(manifest.mask.totalCells)} cells masked ` +
      `(${(manifest.mask.maskedRatio * 100).toFixed(1)} %). A grid with NO mask would mean ` +
      'ERA5-Land started returning sea values.',
  );

  // ── the `tp` multiplier's evidence, GATED and not merely recorded ──────────
  // `× days_in_month × 1000` rests on ONE readable piece of evidence: the root-group `history`
  // attribute carrying `stream=moda` (monthly means of daily means). The `tp:units` attribute says
  // "m" and is actively misleading, and this decoder cannot read it anyway.
  //
  // Recording that evidence in the manifest is not enough. A product that switched to a different
  // accumulation convention would change the factor by 2–3×, and the regime bands above are sized
  // for THREE-order errors on purpose — they would wave a 2–3× error straight through. So the
  // evidence is asserted on the GENERATION path (a hand-run that loses it stops), and re-asserted
  // in CI over the committed artifact by `era5-artifact.spec.ts`.
  const history = manifest.globalAttributes.history ?? '';
  const hasModaEvidence = history.includes('moda');
  push(
    'tp-evidence-present',
    hasModaEvidence,
    hasModaEvidence
      ? 'the root-group `history` attribute still records stream=moda — the per-day accumulation ' +
          'semantics the tp multiplier rests on.'
      : 'the root-group `history` attribute NO LONGER records stream=moda, so the tp multiplier ' +
          '(× days_in_month × 1000) has lost the only evidence it ever had. A changed accumulation ' +
          'convention shifts the factor by 2–3×, which the order-of-magnitude regime bands cannot ' +
          'see — refusing to publish.',
  );

  // ── provider-contact hygiene ───────────────────────────────────────────────
  // Mode-aware on purpose. A `--from-file` re-run has no jobs BY CONSTRUCTION, so demanding some
  // would fail a perfectly valid offline regeneration; but it must not be able to claim any
  // either, which is the actual thing worth asserting. A live run keeps the full obligation.
  const offline = manifest.sourceMode === 'from-file';
  push(
    'jobs-verified-then-deleted',
    offline
      ? manifest.jobs.length === 0
      : manifest.jobs.length > 0 &&
          manifest.jobs.every(
            (job) => job.checksumVerified && job.downloadedBytes === job.declaredSizeBytes,
          ),
    offline
      ? `offline regeneration (--from-file): ${String(manifest.jobs.length)} job(s) claimed ` +
          '(must be 0); integrity is carried by the recorded raw-file SHA-256/MD5.'
      : `${String(manifest.jobs.length)} job(s); every download matched its declared size and MD5.`,
  );
  push(
    'jobs-deleted',
    offline ? manifest.jobs.length === 0 : manifest.jobs.every((job) => job.deleted),
    offline
      ? 'offline regeneration: no CDS job was created, so none is outstanding.'
      : 'every CDS job was DELETEd after its download verified.',
  );

  // ── the `tp` multiplier, by magnitude class only ───────────────────────────
  for (const probe of PRECIPITATION_REGIME_PROBES) {
    const province = manifest.provinces.find((entry) => entry.plateCode === probe.plateCode);
    const annual = province?.annualTotalPrecipitationMm ?? null;
    push(
      `precipitation-regime-${probe.plateCode}`,
      annual !== null && annual >= probe.minAnnualMm && annual <= probe.maxAnnualMm,
      `${probe.label}: ${annual === null ? 'absent' : `${annual.toFixed(0)} mm/yr`} against the ` +
        `magnitude band [${String(probe.minAnnualMm)}, ${String(probe.maxAnnualMm)}] mm/yr ` +
        '(a wrong tp factor lands 3 orders of magnitude outside).',
    );
  }

  // ── secrets ────────────────────────────────────────────────────────────────
  const serialised = JSON.stringify({ manifest, series });
  const key = input.apiKey;
  push(
    'no-key-material',
    key === null || key.length === 0
      ? true
      : !serialised.includes(key) && !serialised.includes(encodeURIComponent(key)),
    'the artifacts contain no CDS key material.',
  );

  return results;
}

function maxDistance(manifest: Era5Manifest): number {
  return manifest.provinces.reduce(
    (highest, province) => Math.max(highest, province.fallbackDistanceKm),
    0,
  );
}
