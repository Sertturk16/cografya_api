import { describe, expect, it } from '@jest/globals';
import { SEED_PROVINCES } from '../seeds/province.seed-data';
import { buildSyntheticDecodedFile, cellKeyFor } from './era5-fixture.builder';
import { EXPECTED_FALLBACK_PLATE_CODES, extractEra5Provinces } from './era5-extract';
import { Era5ContractError } from './era5.errors';

/**
 * The A-1 ruling's implementation, exercised over the REAL 81 seed coordinates on a synthetic
 * grid with the real axes. Structure only: no test here asserts what a province's temperature is.
 */

const POINTS = SEED_PROVINCES.map((province) => ({
  plateCode: province.plateCode,
  latitude: province.latitude,
  longitude: province.longitude,
}));

/** The grid cell a given seed province resolves to — never an invented coordinate. */
function cellKeyForProvince(plateCode: string): string {
  const province = SEED_PROVINCES.find((entry) => entry.plateCode === plateCode);
  if (province === undefined) throw new Error(`seed is missing province ${plateCode}`);
  return cellKeyFor(province.latitude, province.longitude);
}

/** The five measured coastal provinces whose administrative point lands on sea. */
function measuredMaskedCells(): Set<string> {
  const masked = new Set<string>();
  for (const plateCode of EXPECTED_FALLBACK_PLATE_CODES) {
    const province = SEED_PROVINCES.find((entry) => entry.plateCode === plateCode);
    if (province === undefined) throw new Error(`seed is missing province ${plateCode}`);
    masked.add(cellKeyFor(province.latitude, province.longitude));
  }
  return masked;
}

describe('extractEra5Provinces', () => {
  it('resolves all 81 provinces inside the requested area (V5)', () => {
    const extraction = extractEra5Provinces(buildSyntheticDecodedFile(), POINTS);
    expect(extraction.provinces).toHaveLength(81);
    expect(extraction.series).toHaveLength(81);
  });

  it('reads a full series per province and converts both variables', () => {
    const extraction = extractEra5Provinces(buildSyntheticDecodedFile({ monthCount: 12 }), POINTS);
    for (const series of extraction.series) {
      expect(series.tempMeanC).toHaveLength(12);
      expect(series.precipitationMm).toHaveLength(12);
      expect(series.tempMeanC.every((value) => Number.isFinite(value))).toBe(true);
      expect(series.precipitationMm.every((value) => value >= 0)).toBe(true);
    }
  });

  it('fires the fallback for EXACTLY the five measured provinces, with flag + cell + km', () => {
    const extraction = extractEra5Provinces(
      buildSyntheticDecodedFile({ maskedCells: measuredMaskedCells() }),
      POINTS,
    );
    expect(extraction.fallbackPlateCodes).toEqual([...EXPECTED_FALLBACK_PLATE_CODES].sort());

    // A-1's legitimacy condition: all THREE records present for every fallback province.
    for (const plateCode of extraction.fallbackPlateCodes) {
      const record = extraction.provinces.find((province) => province.plateCode === plateCode);
      expect(record?.fallbackUsed).toBe(true);
      expect(record?.fallbackDistanceKm ?? 0).toBeGreaterThan(0);
      expect(record?.fallbackDistanceKm ?? Infinity).toBeLessThanOrEqual(25);
      expect(Number.isFinite(record?.cellLatitude ?? Number.NaN)).toBe(true);
      expect(Number.isFinite(record?.cellLongitude ?? Number.NaN)).toBe(true);
    }
  });

  it('records ZERO shift and no flag for the other 76 provinces', () => {
    const extraction = extractEra5Provinces(
      buildSyntheticDecodedFile({ maskedCells: measuredMaskedCells() }),
      POINTS,
    );
    const direct = extraction.provinces.filter((province) => !province.fallbackUsed);
    expect(direct).toHaveLength(76);
    expect(direct.every((province) => province.fallbackDistanceKm === 0)).toBe(true);
  });

  it('reports the mask as NOT time-invariant when a window cell flickers', () => {
    const flickering = new Set([cellKeyForProvince('06')]);
    const extraction = extractEra5Provinces(
      buildSyntheticDecodedFile({ monthCount: 4, flickeringCells: flickering }),
      POINTS,
    );
    expect(extraction.maskTimeInvariant).toBe(false);
  });

  it('reports the mask as time-invariant on a stable grid', () => {
    const extraction = extractEra5Provinces(
      buildSyntheticDecodedFile({ monthCount: 4, maskedCells: measuredMaskedCells() }),
      POINTS,
    );
    expect(extraction.maskTimeInvariant).toBe(true);
  });

  it('STOPS on an incomplete series — completeness is absolute (SPEC §5.3)', () => {
    // A cell that is land in month 0 (so it IS selected) and masked afterwards: the migration must
    // stop, NOT publish 3 months and a null. The key is derived from the province's OWN seed
    // coordinate, so it is guaranteed to be the cell that province actually resolves to.
    expect(() =>
      extractEra5Provinces(
        buildSyntheticDecodedFile({
          monthCount: 4,
          flickeringCells: new Set([cellKeyForProvince('06')]),
        }),
        POINTS.filter((point) => point.plateCode === '06'),
      ),
    ).toThrow(Era5ContractError);
  });

  it('STOPS when a province sits outside the decoded domain', () => {
    expect(() =>
      extractEra5Provinces(buildSyntheticDecodedFile(), [
        { plateCode: 'ZZ', latitude: 12.5, longitude: 30 },
      ]),
    ).toThrow(/OUTSIDE DOMAIN/);
  });
});
