import { describe, expect, it } from '@jest/globals';
import {
  AirQualityCategory,
  AirQualityPollutant,
  ALL_AIR_QUALITY_POLLUTANTS,
} from '../air-quality.types';
import { EAQI_BANDS_EEA_2024, EAQI_CATEGORY_BY_BAND, type EaqiBand } from './eaqi.constants';
import { categoryForBand, computeEaqi, subIndexBand } from './eaqi';

/**
 * EAQI-2024 boundary tests — SPEC §14-A1 acceptance criterion 3.
 *
 * STRUCTURAL discipline note (CONVENTIONS §2): the band-table NUMBERS are facts transcribed
 * from the EEA primary source and are pinned in `eaqi.constants.ts` with provenance; these
 * tests assert the ARITHMETIC over that constant — `(lo, hi]` at every upper bound, worst-band,
 * tie-break, partial index — not the facts themselves. The one fact-shaped assertion (PM2.5
 * 15.0 → band 2) is the SPEC's own mandated negative test for the boundary-direction
 * regression, pinned against the constant, not against an external source.
 */
describe('subIndexBand — (lo, hi] at every upper bound', () => {
  it.each(ALL_AIR_QUALITY_POLLUTANTS)(
    '%s: upper bound is INCLUSIVE, next value is not',
    (pollutant) => {
      const bounds = EAQI_BANDS_EEA_2024.upperBoundsUgM3[pollutant];
      bounds.forEach((upperBound, index) => {
        const band = (index + 1) as EaqiBand;
        // Exactly the bound → this band (upper inclusive).
        expect(subIndexBand(pollutant, upperBound)).toBe(band);
        // Just above the bound → the next band (lower exclusive).
        expect(subIndexBand(pollutant, upperBound + 1e-6)).toBe(band + 1);
      });
      // Beyond the last bound → band 6, unbounded.
      const lastBound = bounds[bounds.length - 1];
      expect(lastBound).toBeDefined();
      expect(subIndexBand(pollutant, (lastBound ?? 0) * 10)).toBe(6);
      // Zero is inside band 1.
      expect(subIndexBand(pollutant, 0)).toBe(1);
    },
  );

  it('PM2.5 = 15.0 µg/m³ is band 2 (fair), NOT band 3 — the [lo, hi) reflex is wrong', () => {
    expect(subIndexBand(AirQualityPollutant.Pm2_5, 15.0)).toBe(2);
    expect(categoryForBand(2)).toBe(AirQualityCategory.Fair);
  });

  it('throws on a negative value instead of banding it as good (the −999 class, R4)', () => {
    expect(() => subIndexBand(AirQualityPollutant.Pm2_5, -999)).toThrow(RangeError);
    expect(() => subIndexBand(AirQualityPollutant.So2, -0.0001)).toThrow(RangeError);
  });

  it('throws on NaN/Infinity instead of returning a band', () => {
    expect(() => subIndexBand(AirQualityPollutant.O3, Number.NaN)).toThrow(RangeError);
    expect(() => subIndexBand(AirQualityPollutant.O3, Number.POSITIVE_INFINITY)).toThrow(
      RangeError,
    );
  });
});

describe('categoryForBand', () => {
  it('maps bands 1..6 onto the six category tokens in order', () => {
    ([1, 2, 3, 4, 5, 6] as const).forEach((band) => {
      expect(categoryForBand(band)).toBe(EAQI_CATEGORY_BY_BAND[band - 1]);
    });
    expect(EAQI_CATEGORY_BY_BAND).toHaveLength(6);
  });
});

describe('computeEaqi', () => {
  const allPresent: Record<AirQualityPollutant, number | null> = {
    [AirQualityPollutant.Pm2_5]: 4, // band 1
    [AirQualityPollutant.Pm10]: 40, // band 2
    [AirQualityPollutant.No2]: 30, // band 3
    [AirQualityPollutant.O3]: 50, // band 1
    [AirQualityPollutant.So2]: 10, // band 1
  };

  it('overall index is the WORST sub-band; dominant is the pollutant that set it', () => {
    const result = computeEaqi(allPresent);
    expect(result.band).toBe(3);
    expect(result.category).toBe(AirQualityCategory.Moderate);
    expect(result.dominantPollutant).toBe(AirQualityPollutant.No2);
    expect(result.missingPollutants).toEqual([]);
    expect(result.subIndexes[AirQualityPollutant.Pm10]).toEqual({
      band: 2,
      category: AirQualityCategory.Fair,
    });
  });

  it('tie-break: two pollutants in the same worst band → the earlier one in the binding order wins', () => {
    const result = computeEaqi({
      ...allPresent,
      [AirQualityPollutant.Pm10]: 100, // band 3, ties with NO₂'s band 3
      [AirQualityPollutant.No2]: 30, // band 3
    });
    expect(result.band).toBe(3);
    // PM10 precedes NO₂ in the tie-break order.
    expect(result.dominantPollutant).toBe(AirQualityPollutant.Pm10);
  });

  it('tie-break order itself equals the canonical pollutant order (PM2.5 first)', () => {
    expect(EAQI_BANDS_EEA_2024.dominantTieBreakOrder).toEqual(ALL_AIR_QUALITY_POLLUTANTS);
  });

  it('partial index: missing pollutants are EXCLUDED from the worst-band scan and PUBLISHED', () => {
    const result = computeEaqi({
      ...allPresent,
      [AirQualityPollutant.No2]: null, // was the worst — must not dominate as a ghost
      [AirQualityPollutant.So2]: null,
    });
    expect(result.band).toBe(2);
    expect(result.dominantPollutant).toBe(AirQualityPollutant.Pm10);
    expect(result.missingPollutants).toEqual([AirQualityPollutant.No2, AirQualityPollutant.So2]);
    expect(result.subIndexes[AirQualityPollutant.No2]).toBeNull();
  });

  it('all pollutants missing → null band/category/dominant, every pollutant listed missing', () => {
    const result = computeEaqi({
      [AirQualityPollutant.Pm2_5]: null,
      [AirQualityPollutant.Pm10]: null,
      [AirQualityPollutant.No2]: null,
      [AirQualityPollutant.O3]: null,
      [AirQualityPollutant.So2]: null,
    });
    expect(result.band).toBeNull();
    expect(result.category).toBeNull();
    expect(result.dominantPollutant).toBeNull();
    expect(result.missingPollutants).toEqual([...ALL_AIR_QUALITY_POLLUTANTS]);
  });

  it('band 6 (beyond every bound) still resolves category and dominant', () => {
    const result = computeEaqi({ ...allPresent, [AirQualityPollutant.Pm2_5]: 500 });
    expect(result.band).toBe(6);
    expect(result.category).toBe(AirQualityCategory.ExtremelyPoor);
    expect(result.dominantPollutant).toBe(AirQualityPollutant.Pm2_5);
  });
});
