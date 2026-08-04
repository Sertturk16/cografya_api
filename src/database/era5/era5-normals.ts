import {
  CLIMATE_MONTH_COUNT,
  CLIMATE_SOURCE_ERA5_LAND_MONTHLY,
  type ClimateNormals,
} from '../../province/province.types';
import type { Era5ProvinceSeries, Era5SeriesArtifact } from './era5-artifact.types';
import { ERA5_DATASET_URL, ERA5_FIRST_YEAR, ERA5_LAST_YEAR } from './era5-request';
import { Era5ContractError } from './era5.errors';

/**
 * PURE derivation: the committed 360-month series → the published 12-month 30-year normal.
 *
 * No database, no filesystem, no clock, no network. That is what makes it unit-testable at full
 * resolution and what lets `era5-load.ts` be a thin transaction around a value that was already
 * proven correct.
 *
 * ## The calendar is READ, never inferred from an index
 * A 360-element array beginning in January 1991 makes `index % 12` look like the month. It is not:
 * that identity holds only while the artifact is complete, contiguous and correctly ordered, which
 * is precisely what could be wrong. So the grouping is derived from `monthLabels` (`"1991-01" …
 * "2020-12"`), the artifact's own statement of which month each index IS, and an artifact whose
 * labels are short, malformed or unevenly distributed across the 12 calendar months stops the run.
 * A silently mis-grouped normal is the failure mode with no visible symptom — every value stays
 * plausible, only assigned to the wrong month.
 *
 * ## Rounding happens ONCE, at the very end
 * Intermediate means are carried at full double precision and rounded only when the published
 * value is produced. Rounding early would make the load phase's own numbers disagree with the
 * manifest cross-check (`era5-load-assertions.ts`) by more than the tolerance that check exists to
 * enforce, and would compound across the annual aggregate the service derives on top.
 *
 * One decimal is the published precision (matching `climate-derivations.ts`'s `roundTo1`): a
 * ~0.1° reanalysis cell spanning tens of kilometres cannot honestly claim more than that for a
 * whole province.
 */

/** Published precision of a stored monthly normal — see the module docblock. */
function roundTo1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** `"1991-01"` → `1`. Refuses anything that is not exactly `YYYY-MM` with a real month. */
function parseCalendarMonth(label: string, index: number): number {
  if (!/^\d{4}-\d{2}$/.test(label)) {
    throw new Era5ContractError(
      `monthLabels[${String(index)}] is ${JSON.stringify(label)}, not "YYYY-MM". The calendar is ` +
        `read from these labels, never inferred from the index, so an unparseable label must stop ` +
        `the run rather than be guessed at.`,
    );
  }
  const month = Number(label.slice(5, 7));
  if (!Number.isInteger(month) || month < 1 || month > CLIMATE_MONTH_COUNT) {
    throw new Era5ContractError(
      `monthLabels[${String(index)}] is ${JSON.stringify(label)} — month part out of range 1-12.`,
    );
  }
  return month;
}

/**
 * Group the 360 series indexes by calendar month, from the labels alone.
 *
 * Exported so the load assertions can state the grouping they verified rather than recompute a
 * second, possibly different one.
 */
export function groupSeriesIndexesByCalendarMonth(monthLabels: readonly string[]): number[][] {
  const groups: number[][] = Array.from({ length: CLIMATE_MONTH_COUNT }, () => []);
  monthLabels.forEach((label, index) => {
    const month = parseCalendarMonth(label, index);
    // `groups` was built with exactly CLIMATE_MONTH_COUNT slots and `month` is validated 1-12
    // above, so this cannot be undefined; the check exists because `noUncheckedIndexedAccess`
    // makes that reasoning explicit rather than implicit.
    const bucket = groups[month - 1];
    if (bucket === undefined) {
      throw new Era5ContractError(`month ${String(month)} has no bucket — unreachable.`);
    }
    bucket.push(index);
  });

  // Every calendar month must be represented by the SAME number of years. Unequal buckets mean a
  // truncated or padded artifact, and they would also silently break the load's fidelity gate:
  // the annual mean of 12 monthly means equals the mean of all 360 values ONLY when the groups
  // are equal-sized.
  const sizes = groups.map((bucket) => bucket.length);
  const first = sizes[0] ?? 0;
  if (first === 0 || sizes.some((size) => size !== first)) {
    throw new Era5ContractError(
      `the 360 month labels do not distribute evenly over the 12 calendar months ` +
        `(sizes: ${sizes.join(', ')}). An uneven calendar makes the 30-year normal a mean over a ` +
        `different number of years per month, which no downstream check would notice.`,
    );
  }
  return groups;
}

function mean(values: readonly number[], indexes: readonly number[], what: string): number {
  let total = 0;
  for (const index of indexes) {
    const value = values[index];
    if (value === undefined || !Number.isFinite(value)) {
      throw new Era5ContractError(
        `${what}[${String(index)}] is ${String(value)} — completeness is absolute on this line ` +
          `(SPEC §5.3); a gap is a defect, never a value to skip.`,
      );
    }
    total += value;
  }
  return total / indexes.length;
}

/**
 * One province's 360-month series → the `ClimateNormals` document that will be stored.
 *
 * Temperature: the mean of that calendar month's 30 monthly means, °C.
 * Precipitation: the mean of that calendar month's 30 monthly TOTALS, mm — i.e. "how much rain
 * this province gets in an average July", which is what a monthly normal means. The per-month
 * conversion from the provider's m/day rate (× days-in-month, leap years included) already
 * happened in the fetch phase; this file only groups and averages.
 */
export function computeEra5ProvinceNormals(
  province: Era5ProvinceSeries,
  monthIndexGroups: readonly (readonly number[])[],
): ClimateNormals {
  if (monthIndexGroups.length !== CLIMATE_MONTH_COUNT) {
    throw new Era5ContractError(
      `${province.plateCode}: expected ${String(CLIMATE_MONTH_COUNT)} calendar-month groups, got ` +
        `${String(monthIndexGroups.length)}.`,
    );
  }

  const months = monthIndexGroups.map((indexes, offset) => {
    const month = offset + 1;
    return {
      month,
      tempMeanC: roundTo1(mean(province.tempMeanC, indexes, `${province.plateCode}.tempMeanC`)),
      precipitationMm: roundTo1(
        mean(province.precipitationMm, indexes, `${province.plateCode}.precipitationMm`),
      ),
    };
  });

  return {
    source: CLIMATE_SOURCE_ERA5_LAND_MONTHLY,
    sourceUrl: ERA5_DATASET_URL,
    periodStartYear: ERA5_FIRST_YEAR,
    periodEndYear: ERA5_LAST_YEAR,
    months,
  };
}

/** One province's UNROUNDED annual figures, kept for the manifest cross-check only. */
export interface Era5ProvinceAnnualCheck {
  plateCode: string;
  /** Mean of the 12 unrounded monthly means — comparable to `manifest.provinces[].annualMeanTempC`. */
  annualMeanTempC: number;
  /** Sum of the 12 unrounded monthly means of the monthly totals. */
  annualTotalPrecipitationMm: number;
}

export interface Era5NormalsResult {
  /** Plate code → the document to store. */
  normalsByPlateCode: ReadonlyMap<string, ClimateNormals>;
  /**
   * The same derivation carried at FULL precision, for the manifest cross-check.
   *
   * Deliberately not derived from the rounded `months` above: rounding to one decimal moves an
   * annual mean by up to ~0.05 °C, which is five orders of magnitude above the 1e-9 tolerance the
   * cross-check uses, so a rounded input would force that tolerance to be loosened until it could
   * no longer detect a real grouping bug. Keeping the unrounded figures is what lets the gate stay
   * tight enough to be worth having.
   */
  annualChecks: readonly Era5ProvinceAnnualCheck[];
}

/**
 * Boolean, NOT a type predicate — and that is the point.
 *
 * `Array.isArray` is declared `(arg: any) => arg is any[]`, so using it directly on a
 * `readonly T[]` field WIDENS that field to `any[]` for the rest of the scope, silently deleting
 * the element type from every call built on it. Here the type is already known and only the
 * runtime shape is in doubt (this artifact was `JSON.parse`d off disk), so the check must confirm
 * without narrowing.
 */
function isArrayAtRuntime(value: unknown): boolean {
  return Array.isArray(value);
}

/** The whole artifact → 81 documents plus their unrounded annual figures. */
export function computeEra5Normals(series: Era5SeriesArtifact): Era5NormalsResult {
  if (!isArrayAtRuntime(series.monthLabels) || !isArrayAtRuntime(series.provinces)) {
    throw new Era5ContractError(
      'the series artifact is missing `monthLabels` or `provinces` — refusing to derive normals ' +
        'from a document that is not the shape it claims.',
    );
  }

  const groups = groupSeriesIndexesByCalendarMonth(series.monthLabels);
  const normalsByPlateCode = new Map<string, ClimateNormals>();
  const annualChecks: Era5ProvinceAnnualCheck[] = [];

  for (const province of series.provinces) {
    if (normalsByPlateCode.has(province.plateCode)) {
      throw new Era5ContractError(
        `${province.plateCode}: appears twice in the series artifact — a duplicate would let one ` +
          `province's numbers overwrite another's with no coverage check noticing.`,
      );
    }
    normalsByPlateCode.set(province.plateCode, computeEra5ProvinceNormals(province, groups));

    const unroundedTemps = groups.map((indexes) =>
      mean(province.tempMeanC, indexes, `${province.plateCode}.tempMeanC`),
    );
    const unroundedPrecip = groups.map((indexes) =>
      mean(province.precipitationMm, indexes, `${province.plateCode}.precipitationMm`),
    );
    annualChecks.push({
      plateCode: province.plateCode,
      annualMeanTempC: unroundedTemps.reduce((sum, value) => sum + value, 0) / CLIMATE_MONTH_COUNT,
      annualTotalPrecipitationMm: unroundedPrecip.reduce((sum, value) => sum + value, 0),
    });
  }

  return { normalsByPlateCode, annualChecks };
}
