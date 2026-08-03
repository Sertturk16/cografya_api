import { CLIMATE_MONTH_COUNT, type ClimateNormals } from '../../province/province.types';
import { assertClimateNormalsShape } from '../climate/climate-normals.assertions';
import type { Era5Manifest, Era5SeriesArtifact } from './era5-artifact.types';
import { EXPECTED_FALLBACK_PLATE_CODES } from './era5-extract';
import type { Era5ProvinceAnnualCheck } from './era5-normals';
import {
  ERA5_DATASET_URL,
  ERA5_EXPECTED_MONTH_COUNT,
  ERA5_FIRST_YEAR,
  ERA5_LAST_YEAR,
} from './era5-request';

/**
 * The gate the `--phase=load` run must pass before a single row is written.
 *
 * Every check here ABORTS. There is no soft class on this line: this is a one-off migration over a
 * uniform global grid, so a missing or unbelievable value is a defect to fix, never a degradation
 * to publish (SPEC §5.3, `era5.errors.ts`). Completeness is absolute — 81 provinces, 12 months,
 * both measures, or nothing is written at all.
 *
 * ## The fidelity chain, and why it is a proof rather than a plausibility check
 * The retired MGM line proved fidelity by re-printing every parsed number in the source's own
 * notation and comparing it to the raw HTML cell — the only thing that catches
 * `parseFloat('10,4') === 10`, which every range invariant passes. A binary source has no cell
 * string to re-print, so the equivalent had to be built from what the fetch phase recorded:
 *
 *   > The annual figures RE-DERIVED here from the 12 published normals must equal the annual
 *   > figures the FETCH phase computed independently, straight off the decoded 360-month arrays,
 *   > and wrote into the manifest.
 *
 * That identity is exact mathematics (equal-sized calendar groups, n = 30 each), which is what
 * makes it a real re-derivation proof: any error in the load's grouping, averaging or province
 * ordering breaks it. It is NOT a "does this look reasonable" band. Measured on the committed
 * artifact, the worst disagreement across all 81 provinces is 8.3e-14 °C and 4.5e-13 mm — pure
 * floating-point summation order. {@link ANNUAL_CROSS_CHECK_TOLERANCE} sits ~4 orders above that
 * noise and many orders below any real defect.
 *
 * ## What is deliberately NOT asserted
 * No province's temperature or rainfall is pinned to a value. The physical bands and the regime
 * distribution below are magnitude-class guards against a unit or packing error (a wrong `tp`
 * multiplier lands three orders of magnitude out), and the regime guard runs over the DISTRIBUTION
 * of annual totals with no province named — structure, never facts (CONVENTIONS §2).
 */

export class Era5LoadError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(`[era5 load] ${message}`, options);
    this.name = 'Era5LoadError';
  }
}

/**
 * Absolute tolerance for the manifest cross-check, in the unit of the compared figure.
 *
 * Chosen against a MEASUREMENT, not a feeling: max observed |Δ| is 8.3e-14 °C / 4.5e-13 mm across
 * the 81 committed provinces (both pure summation-order residue). 1e-9 is comfortably above that
 * and comfortably below the smallest disagreement a genuine grouping, ordering or conversion bug
 * could produce, which would be at least 1e-2. A tolerance that has to be loosened later is a
 * tolerance that stopped proving anything — if this one ever needs raising, the correct response
 * is to find out why, not to raise it.
 */
export const ANNUAL_CROSS_CHECK_TOLERANCE = 1e-9;

/** Monthly-normal sanity bands. Deliberately far wider than Türkiye — this catches units, not weather. */
const MONTHLY_TEMP_MIN_C = -60;
const MONTHLY_TEMP_MAX_C = 60;
const MONTHLY_PRECIP_MIN_MM = 0;
const MONTHLY_PRECIP_MAX_MM = 2_000;

/**
 * Order-of-magnitude band for the DISTRIBUTION of annual precipitation totals.
 *
 * The three candidate readings of the provider's `tp` field differ by three orders of magnitude
 * (~2 223 mm vs ~73 mm vs ~53 352 mm — probe §2.5), so the wettest and driest provinces landing
 * inside this window is decisive evidence that the multiplier is the right one, while telling us
 * nothing about any individual province. No plate code appears in this check by design: naming one
 * would turn a structural guard into a fact pin.
 */
const ANNUAL_TOTAL_MIN_MM = 150;
const ANNUAL_TOTAL_MAX_MM = 5_000;

export interface Era5LoadAssertionInput {
  manifest: Era5Manifest;
  series: Era5SeriesArtifact;
  /** Plate code → the document about to be written. */
  normalsByPlateCode: ReadonlyMap<string, ClimateNormals>;
  /** The unrounded annual figures re-derived from those documents. */
  annualChecks: readonly Era5ProvinceAnnualCheck[];
}

function sortedPlateCodes(codes: Iterable<string>): string[] {
  return [...codes].sort();
}

/**
 * Boolean, NOT a type predicate — deliberately.
 *
 * `Array.isArray` is declared `(arg: any) => arg is any[]`, so applying it to a `readonly T[]`
 * field widens that field to `any[]` for the rest of the scope and silently discards the element
 * type. Here the declared type is already correct and only the RUNTIME shape is in doubt (both
 * artifacts were `JSON.parse`d off disk), so the check must confirm without narrowing.
 */
function isArrayAtRuntime(value: unknown): boolean {
  return Array.isArray(value);
}

/**
 * Run the whole gate. Throws {@link Era5LoadError} on the first violation, with a message that
 * names the artifact and the province rather than leaving an operator to guess.
 */
export function assertEra5LoadIsSafe(input: Era5LoadAssertionInput): void {
  const { manifest, series, normalsByPlateCode, annualChecks } = input;

  // ── 1. the two artifacts are the same run over the same bytes ──────────────
  // Without this the cross-check below would compare numbers derived from one download against
  // evidence recorded for another — the check would still pass most of the time, and would be
  // theatre when it mattered.
  if (
    typeof series.rawFileSha256 !== 'string' ||
    series.rawFileSha256.length === 0 ||
    series.rawFileSha256 !== manifest.rawFile.sha256
  ) {
    throw new Era5LoadError(
      `the series artifact declares rawFileSha256 ${JSON.stringify(series.rawFileSha256)} but the ` +
        `manifest describes ${JSON.stringify(manifest.rawFile.sha256)}. The two files are from ` +
        `different runs; the manifest cross-check would be meaningless.`,
    );
  }

  // ── 2. the artifact's OWN gate passed when it was produced ─────────────────
  // The fetch phase refuses to rename a failing run's files into place, so a committed artifact
  // carrying a failed assertion means somebody hand-edited or hand-copied one. Re-reading the
  // recorded results costs nothing and closes that path.
  if (!isArrayAtRuntime(manifest.assertions) || manifest.assertions.length === 0) {
    throw new Era5LoadError(
      'the manifest records no structural assertions — an artifact whose own gate is missing ' +
        'cannot be loaded.',
    );
  }
  const failed = manifest.assertions.filter((result) => !result.passed);
  if (failed.length > 0) {
    throw new Era5LoadError(
      `the manifest records ${String(failed.length)} FAILED assertion(s): ` +
        `${failed.map((result) => result.id).join(', ')}. Re-run the fetch phase; a failing run's ` +
        `artifact must never reach the database.`,
    );
  }

  // ── 3. coverage: manifest, series and derived normals describe the same 81 ─
  const manifestCodes = sortedPlateCodes(manifest.provinces.map((province) => province.plateCode));
  const seriesCodes = sortedPlateCodes(series.provinces.map((province) => province.plateCode));
  const derivedCodes = sortedPlateCodes(normalsByPlateCode.keys());
  if (
    manifestCodes.length !== 81 ||
    seriesCodes.length !== 81 ||
    derivedCodes.length !== 81 ||
    manifestCodes.some((code, index) => code !== seriesCodes[index]) ||
    manifestCodes.some((code, index) => code !== derivedCodes[index])
  ) {
    throw new Era5LoadError(
      `province coverage disagrees: manifest ${String(manifestCodes.length)}, series ` +
        `${String(seriesCodes.length)}, derived ${String(derivedCodes.length)} (each must be 81 and ` +
        `they must be the SAME 81). ERA5-Land is a uniform grid, so a partial artifact is a defect, ` +
        `never a coverage decision.`,
    );
  }

  // ── 4. the declared A-1 fallback set is still the closed expected five ─────
  // Carried onto the WRITE path deliberately: the fetch phase checks it too, but the artifact is
  // hand-editable between the phases and this is the phase that publishes. A sixth province
  // reading from a neighbouring cell is exactly the silent drift the ruling exists to forbid.
  const observedFallback = sortedPlateCodes(manifest.fallbackPlateCodes);
  const expectedFallback = sortedPlateCodes(EXPECTED_FALLBACK_PLATE_CODES);
  if (
    observedFallback.length !== expectedFallback.length ||
    observedFallback.some((code, index) => code !== expectedFallback[index])
  ) {
    throw new Era5LoadError(
      `the declared nearest-land-cell fallback fired for [${observedFallback.join(', ')}]; the ` +
        `closed expected set is [${expectedFallback.join(', ')}]. A change here is a coordinate or ` +
        `grid shift and must be reviewed, not absorbed.`,
    );
  }

  // ── 5. calendar ────────────────────────────────────────────────────────────
  if (
    series.monthCount !== ERA5_EXPECTED_MONTH_COUNT ||
    series.monthLabels.length !== ERA5_EXPECTED_MONTH_COUNT ||
    series.firstYear !== ERA5_FIRST_YEAR ||
    series.lastYear !== ERA5_LAST_YEAR
  ) {
    throw new Era5LoadError(
      `the series covers ${String(series.firstYear)}-${String(series.lastYear)} in ` +
        `${String(series.monthLabels.length)} labelled month(s); the published normal window is ` +
        `${String(ERA5_FIRST_YEAR)}-${String(ERA5_LAST_YEAR)} = ` +
        `${String(ERA5_EXPECTED_MONTH_COUNT)} months.`,
    );
  }

  // ── 6. every document is contract-shaped, and is THIS source's ─────────────
  const annualTotals: number[] = [];
  for (const [plateCode, normals] of normalsByPlateCode) {
    // Source-independent structure first (exact key set, 12 ordered months, finite core pair).
    assertClimateNormalsShape(plateCode, normals);

    // …then the source-specific pins this line owns. `climate-normals.assertions.ts` stays
    // reusable precisely because it does NOT know what `era5_land_monthly` is.
    if (normals.sourceUrl !== ERA5_DATASET_URL) {
      throw new Era5LoadError(
        `${plateCode}: sourceUrl is ${JSON.stringify(normals.sourceUrl)}, expected the ERA5-Land ` +
          `dataset page ${JSON.stringify(ERA5_DATASET_URL)} (identical for all 81 provinces).`,
      );
    }
    if (normals.periodStartYear !== ERA5_FIRST_YEAR || normals.periodEndYear !== ERA5_LAST_YEAR) {
      throw new Era5LoadError(
        `${plateCode}: period ${String(normals.periodStartYear)}-${String(normals.periodEndYear)} ` +
          `is not the requested WMO window ${String(ERA5_FIRST_YEAR)}-${String(ERA5_LAST_YEAR)}.`,
      );
    }

    for (const month of normals.months) {
      if (month.tempMeanC < MONTHLY_TEMP_MIN_C || month.tempMeanC > MONTHLY_TEMP_MAX_C) {
        throw new Era5LoadError(
          `${plateCode}: month ${String(month.month)} mean temperature ` +
            `${String(month.tempMeanC)} °C is outside the physical band ` +
            `[${String(MONTHLY_TEMP_MIN_C)}, ${String(MONTHLY_TEMP_MAX_C)}] — a unit or packing ` +
            `error, not weather.`,
        );
      }
      if (
        month.precipitationMm < MONTHLY_PRECIP_MIN_MM ||
        month.precipitationMm > MONTHLY_PRECIP_MAX_MM
      ) {
        throw new Era5LoadError(
          `${plateCode}: month ${String(month.month)} precipitation ` +
            `${String(month.precipitationMm)} mm is outside the physical band ` +
            `[${String(MONTHLY_PRECIP_MIN_MM)}, ${String(MONTHLY_PRECIP_MAX_MM)}] — a unit or ` +
            `multiplier error, not weather.`,
        );
      }
    }
    annualTotals.push(normals.months.reduce((sum, month) => sum + month.precipitationMm, 0));
  }

  // ── 7. THE fidelity gate: re-derived annuals vs the fetch phase's own record ─
  const manifestByCode = new Map(
    manifest.provinces.map((province) => [province.plateCode, province]),
  );
  if (annualChecks.length !== normalsByPlateCode.size) {
    throw new Era5LoadError(
      `${String(annualChecks.length)} annual cross-check row(s) for ` +
        `${String(normalsByPlateCode.size)} province document(s) — the derivation did not report ` +
        `on everything it produced.`,
    );
  }
  for (const check of annualChecks) {
    const recorded = manifestByCode.get(check.plateCode);
    if (recorded === undefined) {
      throw new Era5LoadError(
        `${check.plateCode}: no manifest cell record, so its numbers cannot be corroborated.`,
      );
    }
    const tempDelta = Math.abs(check.annualMeanTempC - recorded.annualMeanTempC);
    const precipDelta = Math.abs(
      check.annualTotalPrecipitationMm - recorded.annualTotalPrecipitationMm,
    );
    if (tempDelta > ANNUAL_CROSS_CHECK_TOLERANCE || precipDelta > ANNUAL_CROSS_CHECK_TOLERANCE) {
      throw new Era5LoadError(
        `${check.plateCode}: the annual figures re-derived from the 12 published normals disagree ` +
          `with the ones the fetch phase recorded independently — ΔT ${tempDelta.toExponential(3)} °C, ` +
          `ΔP ${precipDelta.toExponential(3)} mm against a tolerance of ` +
          `${ANNUAL_CROSS_CHECK_TOLERANCE.toExponential(0)}. These two paths must agree exactly; a ` +
          `disagreement means the grouping, the averaging or the province ordering is wrong.`,
      );
    }
  }

  // ── 8. regime magnitude, over the DISTRIBUTION (no province named) ─────────
  const sortedTotals = [...annualTotals].sort((left, right) => left - right);
  const driest = sortedTotals[0];
  const wettest = sortedTotals[sortedTotals.length - 1];
  if (driest === undefined || wettest === undefined) {
    throw new Era5LoadError('no annual totals to check — unreachable given the coverage gate.');
  }
  if (driest < ANNUAL_TOTAL_MIN_MM || wettest > ANNUAL_TOTAL_MAX_MM) {
    throw new Era5LoadError(
      `annual precipitation totals span ${driest.toFixed(0)}…${wettest.toFixed(0)} mm/yr, outside ` +
        `the magnitude band [${String(ANNUAL_TOTAL_MIN_MM)}, ${String(ANNUAL_TOTAL_MAX_MM)}]. A ` +
        `wrong tp multiplier lands three orders of magnitude out; this band cannot judge any ` +
        `individual province and does not try to.`,
    );
  }

  // ── 9. the derived documents really are 12 months each ────────────────────-
  // Cheap, and it states the invariant the whole publication rests on in one place rather than
  // leaving it implied by check 6's per-month loop.
  for (const [plateCode, normals] of normalsByPlateCode) {
    if (normals.months.length !== CLIMATE_MONTH_COUNT) {
      throw new Era5LoadError(
        `${plateCode}: ${String(normals.months.length)} month(s) derived, expected ` +
          `${String(CLIMATE_MONTH_COUNT)}.`,
      );
    }
  }
}
