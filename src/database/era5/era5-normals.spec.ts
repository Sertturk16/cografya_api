import { describe, expect, it } from '@jest/globals';
import {
  CLIMATE_MONTH_COUNT,
  CLIMATE_SOURCE_ERA5_LAND_MONTHLY,
} from '../../province/province.types';
import type { Era5ProvinceSeries, Era5SeriesArtifact } from './era5-artifact.types';
import {
  computeEra5Normals,
  computeEra5ProvinceNormals,
  groupSeriesIndexesByCalendarMonth,
} from './era5-normals';
import { ERA5_DATASET_URL, ERA5_FIRST_YEAR, ERA5_LAST_YEAR } from './era5-request';
import { Era5ContractError } from './era5.errors';

/**
 * Unit coverage for the PURE 360 → 12 derivation. No database, no filesystem, no artifact.
 *
 * The fixtures are synthetic and deliberately arithmetic — a value built from its own month index
 * — so a test that passes proves the GROUPING and the AVERAGING, not that some province happens
 * to be warm. Nothing here asserts a fact about Türkiye (CONVENTIONS §2).
 */

const YEARS = 3;

function labels(years = YEARS, firstYear = ERA5_FIRST_YEAR): string[] {
  const out: string[] = [];
  for (let year = firstYear; year < firstYear + years; year += 1) {
    for (let month = 1; month <= CLIMATE_MONTH_COUNT; month += 1) {
      out.push(`${String(year)}-${String(month).padStart(2, '0')}`);
    }
  }
  return out;
}

/**
 * A series whose value at every index is `base + calendarMonth`, identically in every year. The
 * 30-year (here 3-year) mean of each calendar month is therefore EXACTLY `base + month`, so a
 * grouping bug shows up as an off-by-one month rather than as noise.
 */
function flatSeries(plateCode: string, tempBase: number, precipBase: number): Era5ProvinceSeries {
  const tempMeanC: number[] = [];
  const precipitationMm: number[] = [];
  for (let year = 0; year < YEARS; year += 1) {
    for (let month = 1; month <= CLIMATE_MONTH_COUNT; month += 1) {
      tempMeanC.push(tempBase + month);
      precipitationMm.push(precipBase + month);
    }
  }
  return { plateCode, tempMeanC, precipitationMm };
}

function artifact(provinces: Era5ProvinceSeries[]): Era5SeriesArtifact {
  return {
    schemaVersion: 1,
    generatedAtUtc: '2026-08-04T00:00:00.000Z',
    rawFileSha256: 'a'.repeat(64),
    firstYear: ERA5_FIRST_YEAR,
    lastYear: ERA5_FIRST_YEAR + YEARS - 1,
    monthCount: YEARS * CLIMATE_MONTH_COUNT,
    monthLabels: labels(),
    provinces,
  };
}

describe('groupSeriesIndexesByCalendarMonth', () => {
  it('derives the calendar from the LABELS, not from index arithmetic', () => {
    const groups = groupSeriesIndexesByCalendarMonth(labels());
    expect(groups).toHaveLength(CLIMATE_MONTH_COUNT);
    // January is indexes 0, 12, 24 — read out of "1991-01", "1992-01", "1993-01".
    expect(groups[0]).toEqual([0, 12, 24]);
    expect(groups[11]).toEqual([11, 23, 35]);
  });

  it('groups correctly even when the labels are NOT in chronological order', () => {
    // The whole reason the labels are read rather than assumed: `index % 12` would silently
    // mis-assign every value here, and every value would still look perfectly plausible.
    const reversed = [...labels()].reverse();
    const groups = groupSeriesIndexesByCalendarMonth(reversed);
    // Reversed, December is now first: indexes 0, 12, 24 belong to month 12, not month 1.
    expect(groups[11]).toEqual([0, 12, 24]);
    expect(groups[0]).toEqual([11, 23, 35]);
  });

  it('THROWS on a label that is not YYYY-MM', () => {
    const broken = labels();
    broken[5] = '1991/06';
    expect(() => groupSeriesIndexesByCalendarMonth(broken)).toThrow(Era5ContractError);
    expect(() => groupSeriesIndexesByCalendarMonth(broken)).toThrow(/not "YYYY-MM"/);
  });

  it('THROWS on a month part outside 1-12', () => {
    const broken = labels();
    broken[5] = '1991-13';
    expect(() => groupSeriesIndexesByCalendarMonth(broken)).toThrow(/out of range 1-12/);
  });

  it('THROWS when the calendar months are unevenly represented', () => {
    // A truncated artifact. Left unchecked, each month's normal would be a mean over a different
    // number of years — and the annual identity the load's fidelity gate rests on would break.
    const short = labels().slice(0, -1);
    expect(() => groupSeriesIndexesByCalendarMonth(short)).toThrow(/do not distribute evenly/);
  });

  it('THROWS when a calendar month is missing entirely', () => {
    const missingJune = labels().filter((label) => !label.endsWith('-06'));
    expect(() => groupSeriesIndexesByCalendarMonth(missingJune)).toThrow(
      /do not distribute evenly/,
    );
  });
});

describe('computeEra5ProvinceNormals', () => {
  const groups = groupSeriesIndexesByCalendarMonth(labels());

  it('averages each calendar month and emits 12 ordered months', () => {
    const normals = computeEra5ProvinceNormals(flatSeries('34', 0, 100), groups);
    expect(normals.months).toHaveLength(CLIMATE_MONTH_COUNT);
    expect(normals.months.map((month) => month.month)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ]);
    // Every year carries the same per-month value, so the mean IS that value.
    expect(normals.months.map((month) => month.tempMeanC)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ]);
    expect(normals.months.map((month) => month.precipitationMm)).toEqual([
      101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112,
    ]);
  });

  it('carries the source, the dataset URL and the WMO window, all constant', () => {
    const normals = computeEra5ProvinceNormals(flatSeries('06', 0, 0), groups);
    expect(normals.source).toBe(CLIMATE_SOURCE_ERA5_LAND_MONTHLY);
    expect(normals.sourceUrl).toBe(ERA5_DATASET_URL);
    expect(normals.periodStartYear).toBe(ERA5_FIRST_YEAR);
    expect(normals.periodEndYear).toBe(ERA5_LAST_YEAR);
  });

  it('publishes at ONE decimal — the values it emits carry no more precision than that', () => {
    // `x` has at most one decimal iff `x * 10` is an integer (checked against the float, not a
    // formatted string, so this cannot be satisfied by presentation).
    const province: Era5ProvinceSeries = {
      plateCode: '01',
      tempMeanC: Array.from({ length: YEARS * CLIMATE_MONTH_COUNT }, (_unused, index) => index / 7),
      precipitationMm: Array.from(
        { length: YEARS * CLIMATE_MONTH_COUNT },
        (_unused, index) => index / 3,
      ),
    };
    for (const month of computeEra5ProvinceNormals(province, groups).months) {
      expect(Number.isInteger(Math.round(month.tempMeanC * 10))).toBe(true);
      expect(month.tempMeanC * 10).toBeCloseTo(Math.round(month.tempMeanC * 10), 9);
      expect(month.precipitationMm * 10).toBeCloseTo(Math.round(month.precipitationMm * 10), 9);
    }
  });

  it('THROWS on a non-finite value — completeness is absolute', () => {
    const base = flatSeries('34', 0, 0);
    const temps = [...base.tempMeanC];
    temps[13] = Number.NaN;
    const province: Era5ProvinceSeries = { ...base, tempMeanC: temps };
    expect(() => computeEra5ProvinceNormals(province, groups)).toThrow(Era5ContractError);
    expect(() => computeEra5ProvinceNormals(province, groups)).toThrow(/completeness is absolute/);
  });

  it('THROWS on a short series (an index the calendar expects is missing)', () => {
    const province = flatSeries('34', 0, 0);
    province.precipitationMm = province.precipitationMm.slice(0, 30);
    expect(() => computeEra5ProvinceNormals(province, groups)).toThrow(/completeness is absolute/);
  });

  it('THROWS when handed the wrong number of calendar groups', () => {
    expect(() => computeEra5ProvinceNormals(flatSeries('34', 0, 0), groups.slice(0, 11))).toThrow(
      /expected 12 calendar-month groups/,
    );
  });
});

describe('computeEra5Normals', () => {
  it('produces one document per province, keyed by plate code', () => {
    const result = computeEra5Normals(artifact([flatSeries('34', 0, 0), flatSeries('06', 5, 5)]));
    expect([...result.normalsByPlateCode.keys()].sort()).toEqual(['06', '34']);
    expect(result.annualChecks.map((check) => check.plateCode).sort()).toEqual(['06', '34']);
  });

  it('reports the UNROUNDED annual figures the fidelity gate compares', () => {
    // Mean of 1…12 is 6.5; the annual total is their sum, 78.
    const result = computeEra5Normals(artifact([flatSeries('34', 0, 0)]));
    expect(result.annualChecks[0]?.annualMeanTempC).toBeCloseTo(6.5, 12);
    expect(result.annualChecks[0]?.annualTotalPrecipitationMm).toBeCloseTo(78, 12);
  });

  it('does NOT derive the annual figures from the rounded months', () => {
    // The property the 1e-9 cross-check tolerance depends on, proved by a case where the two
    // paths visibly diverge: every published month rounds to 0.0, while the annual figures keep
    // the full 0.04. Summing the rounded months would give 0 here — and would force the load's
    // fidelity gate to loosen its tolerance by five orders of magnitude, at which point it could
    // no longer detect a real grouping bug.
    const province: Era5ProvinceSeries = {
      plateCode: '02',
      tempMeanC: Array.from({ length: YEARS * CLIMATE_MONTH_COUNT }, () => 0.04),
      precipitationMm: Array.from({ length: YEARS * CLIMATE_MONTH_COUNT }, () => 0.04),
    };
    const { normalsByPlateCode, annualChecks } = computeEra5Normals(artifact([province]));
    expect(normalsByPlateCode.get('02')?.months.every((month) => month.tempMeanC === 0)).toBe(true);
    expect(annualChecks[0]?.annualMeanTempC).toBeCloseTo(0.04, 12);
    expect(annualChecks[0]?.annualTotalPrecipitationMm).toBeCloseTo(0.48, 12);
  });

  it('THROWS on a duplicated province — one province would overwrite another silently', () => {
    expect(() =>
      computeEra5Normals(artifact([flatSeries('34', 0, 0), flatSeries('34', 9, 9)])),
    ).toThrow(/appears twice/);
  });

  it('THROWS when the artifact is not the shape it claims', () => {
    const broken = artifact([flatSeries('34', 0, 0)]) as unknown as Record<string, unknown>;
    broken.monthLabels = null;
    expect(() => computeEra5Normals(broken as unknown as Era5SeriesArtifact)).toThrow(
      /missing `monthLabels` or `provinces`/,
    );
  });
});
