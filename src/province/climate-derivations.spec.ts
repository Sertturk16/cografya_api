import { describe, expect, it } from '@jest/globals';
import {
  computeClimateDerived,
  computeSeasonalPrecipitationPercentages,
} from './climate-derivations';
import {
  CLIMATE_SOURCE_ERA5_LAND_MONTHLY,
  type ClimateMonthlyNormal,
  type ClimateNormals,
} from './province.types';

/**
 * Pure, DB-free coverage of the climate derivations — the value-add the provider does not publish
 * (C3S ships a gridded reanalysis, not a per-province annual mean), so these figures are ours and
 * must be exactly right and single-sourced (PLAN.md risk 7). The e2e suite proves the numbers
 * survive the HTTP round-trip on REAL data; this proves the math, the tie-breaks, the residue
 * distribution and the defensive null paths directly, where they are cheap to pin. Mirrors the
 * `computePopulationDensity` block.
 *
 * Per CONVENTIONS §2 these are STRUCTURAL/invariant assertions on synthetic fixtures — no
 * per-province fact is hardcoded here.
 */

/** Build a 12-month series from parallel temp/precip arrays. */
function makeMonths(temps: readonly number[], precip: readonly number[]): ClimateMonthlyNormal[] {
  return Array.from({ length: 12 }, (_unused, i) => ({
    month: i + 1,
    tempMeanC: temps[i] ?? 0,
    precipitationMm: precip[i] ?? 0,
  }));
}

function makeNormals(months: ClimateMonthlyNormal[]): ClimateNormals {
  return {
    source: CLIMATE_SOURCE_ERA5_LAND_MONTHLY,
    sourceUrl: 'https://cds.climate.copernicus.eu/datasets/reanalysis-era5-land-monthly-means',
    periodStartYear: 1991,
    periodEndYear: 2020,
    months,
  };
}

/** Write a value the narrowed type forbids — the jsonb-boundary cases the guard must survive. */
function corrupt(
  month: ClimateMonthlyNormal,
  field: keyof ClimateMonthlyNormal,
  value: unknown,
): void {
  (month as unknown as Record<string, unknown>)[field] = value;
}

describe('computeSeasonalPrecipitationPercentages', () => {
  it('returns whole integers that sum to exactly 100 (naturally, residue 0)', () => {
    // Winter 290 / Spring 130 / Summer 20 / Autumn 180, annual 620.
    const precip = [100, 80, 60, 40, 30, 10, 5, 5, 30, 60, 90, 110];
    const result = computeSeasonalPrecipitationPercentages(precip);
    expect(result).toEqual({ winterPct: 47, springPct: 21, summerPct: 3, autumnPct: 29 });
    expect(sumSeasons(result)).toBe(100);
  });

  it('adds a POSITIVE residue to the largest share (naive rounding undershoots 100)', () => {
    // Season totals winter/spring/summer = 1, autumn = 0 → 33/33/33/0 = 99; +1 to the largest,
    // which on a three-way tie is the earliest (winter) → 34.
    const precip = [1, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0];
    const result = computeSeasonalPrecipitationPercentages(precip);
    expect(result).toEqual({ winterPct: 34, springPct: 33, summerPct: 33, autumnPct: 0 });
    expect(sumSeasons(result)).toBe(100);
  });

  it('subtracts a NEGATIVE residue from the largest share (naive rounding overshoots 100)', () => {
    // Season totals winter/spring/summer = 2, autumn = 1 → 29/29/29/14 = 101; -1 off the largest
    // (winter, earliest of the tie) → 28.
    const precip = [2, 0, 2, 0, 0, 2, 0, 0, 1, 0, 0, 0];
    const result = computeSeasonalPrecipitationPercentages(precip);
    expect(result).toEqual({ winterPct: 28, springPct: 29, summerPct: 29, autumnPct: 14 });
    expect(sumSeasons(result)).toBe(100);
  });

  it('places the residue on the LARGEST season even when it is NOT winter (guards the target rule)', () => {
    // The residue-target rule is the one genuinely branchy line; every fixture above happens to
    // have its largest season at winter, so a `largestIndex = 0` hardcode would pass them all.
    // Here summer is the largest total (4 vs 1/1/1) and the residue is +1: a hardcode would put
    // +1 on winter → {15,14,57,14} (also sums 100), so only the exact object catches the bug.
    const precip = [1, 0, 1, 0, 0, 4, 0, 0, 1, 0, 0, 0];
    const result = computeSeasonalPrecipitationPercentages(precip);
    expect(result).toEqual({ winterPct: 14, springPct: 14, summerPct: 58, autumnPct: 14 });
    expect(sumSeasons(result)).toBe(100);
  });

  it('always totals 100 across a spread of shapes (the invariant the contract exposes)', () => {
    const shapes = [
      [10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10],
      [200, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
      [3, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43],
      [0, 0, 0, 0, 0, 100, 0, 0, 0, 0, 0, 0],
    ];
    for (const precip of shapes) {
      const result = computeSeasonalPrecipitationPercentages(precip);
      expect(result).not.toBeNull();
      expect(sumSeasons(result)).toBe(100);
    }
  });

  it('returns null for a non-12 array (not a derivable series)', () => {
    expect(computeSeasonalPrecipitationPercentages([1, 2, 3])).toBeNull();
  });

  it('returns null when the annual total is 0 (guards divide-by-zero)', () => {
    expect(computeSeasonalPrecipitationPercentages(new Array<number>(12).fill(0))).toBeNull();
  });

  it('returns null when any monthly value is negative (a physically impossible input)', () => {
    // A negative could otherwise yield e.g. `winterPct: -8` while the four shares still sum to
    // 100, silently passing the sum invariant. The pure function refuses it rather than trusting
    // the caller, so the contract's percentages are always non-negative shares of a real total.
    const precip = [10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, -5];
    expect(computeSeasonalPrecipitationPercentages(precip)).toBeNull();
  });
});

describe('computeClimateDerived', () => {
  // Temps sum 222 → mean 18.5; Jul & Aug tie at 28 (hottest → earliest = Jul); Jan coldest at 10.
  const TEMPS = [10, 11, 13, 16, 20, 25, 28, 28, 25, 20, 15, 11];
  // Precip sum 620; Dec wettest at 110; Jul & Aug tie at 5 (driest → earliest = Jul).
  const PRECIP = [100, 80, 60, 40, 30, 10, 5, 5, 30, 60, 90, 110];

  it('computes the annual, extreme and seasonal figures', () => {
    const derived = computeClimateDerived(makeNormals(makeMonths(TEMPS, PRECIP)));
    expect(derived).toEqual({
      annualMeanTempC: 18.5,
      annualPrecipitationMm: 620,
      hottestMonth: 7,
      coldestMonth: 1,
      wettestMonth: 12,
      driestMonth: 7,
      annualTempRangeC: 18,
      seasonalPrecipitation: { winterPct: 47, springPct: 21, summerPct: 3, autumnPct: 29 },
    });
    expect(sumSeasons(derived?.seasonalPrecipitation ?? null)).toBe(100);
  });

  it('breaks EVERY extreme tie toward the EARLIEST month, deterministically', () => {
    // All four extremes are tied here; each must resolve to the earliest month sharing the value.
    const temps = [5, 5, 5, 5, 5, 30, 5, 30, 5, 5, 5, 5]; // hottest tie Jun/Aug → Jun (6); coldest tie all 5 → Jan (1)
    const precip = [90, 0, 0, 0, 0, 0, 90, 0, 0, 0, 0, 0]; // wettest tie Jan/Jul → Jan (1); driest tie (0s) → Feb (2)
    const derived = computeClimateDerived(makeNormals(makeMonths(temps, precip)));
    expect(derived?.hottestMonth).toBe(6);
    expect(derived?.coldestMonth).toBe(1);
    expect(derived?.wettestMonth).toBe(1);
    expect(derived?.driestMonth).toBe(2);
  });

  it('rounds the annual mean to one decimal (single-sourced precision)', () => {
    // Sum 6 → mean 0.5; a non-terminating case: sum 100 over 12 → 8.333… → 8.3.
    const derived = computeClimateDerived(
      makeNormals(makeMonths([100, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], PRECIP)),
    );
    expect(derived?.annualMeanTempC).toBe(8.3);
  });

  it('rounds annual precipitation AND temp range to one decimal (float residue, not just mean)', () => {
    // One-decimal stored inputs whose sum/difference carries binary float error — exactly what
    // real data hits. Deleting roundTo1 from either aggregate would surface e.g. 124.79999999999998.
    const temps = [9.4, 10, 11, 12, 13, 14, 20.1, 15, 14, 13, 11, 10]; // hottest 20.1 − coldest 9.4
    const precip = new Array<number>(12).fill(10.4); // 12 × 10.4 = 124.79999… → 124.8
    const derived = computeClimateDerived(makeNormals(makeMonths(temps, precip)));
    expect(derived?.annualPrecipitationMm).toBe(124.8);
    expect(derived?.annualTempRangeC).toBe(10.7); // 20.1 − 9.4 = 10.700000000000001 → 10.7
  });

  it('returns null when a monthly precipitation is negative (impossible input rejected)', () => {
    const months = makeMonths(TEMPS, PRECIP);
    const june = months[5];
    if (june === undefined) throw new Error('fixture malformed');
    june.precipitationMm = -3;
    expect(computeClimateDerived(makeNormals(months))).toBeNull();
  });

  it('returns null when a month carries a NULL core temperature the type forbids', () => {
    // The core pair is non-nullable since the ERA5-Land swap, so this can no longer arrive from
    // our own load path — but the value is deserialized from `jsonb`, where the TypeScript type
    // is an assertion and not a guarantee. The `typeof` guard is what keeps this graceful.
    const months = makeMonths(TEMPS, PRECIP);
    const july = months[6];
    if (july === undefined) throw new Error('fixture malformed');
    corrupt(july, 'tempMeanC', null);
    expect(computeClimateDerived(makeNormals(months))).toBeNull();
  });

  it('returns null when a month carries a NULL core precipitation', () => {
    const months = makeMonths(TEMPS, PRECIP);
    const march = months[2];
    if (march === undefined) throw new Error('fixture malformed');
    corrupt(march, 'precipitationMm', null);
    expect(computeClimateDerived(makeNormals(months))).toBeNull();
  });

  it('returns null when a corrupt row stores a STRING where a number belongs', () => {
    // The case a `!== null` check would have waved through: `"12,4"` is not null, and every
    // arithmetic step downstream would silently produce a string concatenation or NaN.
    const months = makeMonths(TEMPS, PRECIP);
    const may = months[4];
    if (may === undefined) throw new Error('fixture malformed');
    corrupt(may, 'tempMeanC', '12,4');
    expect(computeClimateDerived(makeNormals(months))).toBeNull();
  });

  it('returns null when a core value is missing entirely', () => {
    const months = makeMonths(TEMPS, PRECIP);
    const october = months[9];
    if (october === undefined) throw new Error('fixture malformed');
    corrupt(october, 'precipitationMm', undefined);
    expect(computeClimateDerived(makeNormals(months))).toBeNull();
  });

  it('returns null when the series is not exactly 12 months', () => {
    const months = makeMonths(TEMPS, PRECIP).slice(0, 11);
    expect(computeClimateDerived(makeNormals(months))).toBeNull();
  });

  it('returns null when the months are out of order', () => {
    const months = makeMonths(TEMPS, PRECIP);
    const first = months[0];
    if (first === undefined) throw new Error('fixture malformed');
    first.month = 2; // slot 0 no longer holds month 1
    expect(computeClimateDerived(makeNormals(months))).toBeNull();
  });

  it('returns null (never throws) for a malformed jsonb shape the type forbids', () => {
    // `normals` types as `ClimateNormals` but is deserialized from a jsonb column, whose runtime
    // shape the compiler cannot enforce; a legacy/hand-written/admin-CRUD row could present a
    // shape the type believes impossible. Each must degrade to null via the shape guard, not
    // throw a TypeError that would 500 the whole province list + sitemap build.
    expect(computeClimateDerived({} as unknown as ClimateNormals)).toBeNull();
    expect(computeClimateDerived({ months: null } as unknown as ClimateNormals)).toBeNull();
    expect(computeClimateDerived({ months: 'x' } as unknown as ClimateNormals)).toBeNull();
  });
});

/** Sum the four seasonal shares, or NaN if the object is null (so a null slips the `=== 100` check). */
function sumSeasons(
  seasonal: { winterPct: number; springPct: number; summerPct: number; autumnPct: number } | null,
): number {
  if (seasonal === null) return Number.NaN;
  return seasonal.winterPct + seasonal.springPct + seasonal.summerPct + seasonal.autumnPct;
}
