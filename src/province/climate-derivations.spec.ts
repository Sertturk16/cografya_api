import { describe, expect, it } from '@jest/globals';
import {
  computeClimateDerived,
  computeSeasonalPrecipitationPercentages,
} from './climate-derivations';
import {
  CLIMATE_SOURCE_MGM_GENERAL,
  type ClimateMonthlyNormal,
  type ClimateNormals,
} from './province.types';

/**
 * Pure, DB-free coverage of the climate derivations — the value-add MGM's page does not carry
 * (its "Yıllık" column is empty), so these figures are ours and must be exactly right and
 * single-sourced (PLAN.md risk 7). The e2e suite proves the numbers survive the HTTP round-trip
 * on REAL data; this proves the math, the tie-breaks, the residue distribution and the defensive
 * null paths directly, where they are cheap to pin. Mirrors the `computePopulationDensity` block.
 *
 * Per CONVENTIONS §2 these are STRUCTURAL/invariant assertions on synthetic fixtures — no
 * per-province fact is hardcoded here.
 */

/** Build a 12-month series from parallel temp/precip arrays; the extras stay null. */
function makeMonths(temps: readonly number[], precip: readonly number[]): ClimateMonthlyNormal[] {
  return Array.from({ length: 12 }, (_unused, i) => ({
    month: i + 1,
    tempMeanC: temps[i] ?? null,
    tempMaxMeanC: null,
    tempMinMeanC: null,
    precipitationMm: precip[i] ?? null,
    sunshineHours: null,
    rainyDays: null,
    tempRecordMaxC: null,
    tempRecordMaxDate: null,
    tempRecordMinC: null,
    tempRecordMinDate: null,
  }));
}

function makeNormals(months: ClimateMonthlyNormal[]): ClimateNormals {
  return {
    source: CLIMATE_SOURCE_MGM_GENERAL,
    sourceUrl: 'https://www.mgm.gov.tr/veridegerlendirme/il-ve-ilceler-istatistik.aspx?k=A&m=TEST',
    periodStartYear: 1929,
    periodEndYear: 2025,
    months,
  } as ClimateNormals;
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

  it('breaks an extreme tie toward the EARLIEST month, deterministically', () => {
    // Two months share the max temp AND two share the max precip; the earlier of each must win.
    const temps = [5, 5, 5, 5, 5, 30, 5, 30, 5, 5, 5, 5]; // Jun & Aug tie hottest → Jun (6)
    const precip = [90, 0, 0, 0, 0, 0, 90, 0, 0, 0, 0, 0]; // Jan & Jul tie wettest → Jan (1)
    const derived = computeClimateDerived(makeNormals(makeMonths(temps, precip)));
    expect(derived?.hottestMonth).toBe(6);
    expect(derived?.wettestMonth).toBe(1);
  });

  it('rounds the annual mean to one decimal (single-sourced precision)', () => {
    // Sum 6 → mean 0.5; a non-terminating case: sum 100 over 12 → 8.333… → 8.3.
    const derived = computeClimateDerived(
      makeNormals(makeMonths([100, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], PRECIP)),
    );
    expect(derived?.annualMeanTempC).toBe(8.3);
  });

  it('returns null when a month is missing its core temperature (graceful degradation)', () => {
    const months = makeMonths(TEMPS, PRECIP);
    const july = months[6];
    if (july === undefined) throw new Error('fixture malformed');
    july.tempMeanC = null;
    expect(computeClimateDerived(makeNormals(months))).toBeNull();
  });

  it('returns null when a month is missing its core precipitation', () => {
    const months = makeMonths(TEMPS, PRECIP);
    const march = months[2];
    if (march === undefined) throw new Error('fixture malformed');
    march.precipitationMm = null;
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
});

/** Sum the four seasonal shares, or NaN if the object is null (so a null slips the `=== 100` check). */
function sumSeasons(
  seasonal: { winterPct: number; springPct: number; summerPct: number; autumnPct: number } | null,
): number {
  if (seasonal === null) return Number.NaN;
  return seasonal.winterPct + seasonal.springPct + seasonal.summerPct + seasonal.autumnPct;
}
