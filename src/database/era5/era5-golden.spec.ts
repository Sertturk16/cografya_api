import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SEED_PROVINCES } from '../seeds/province.seed-data';
import { flatIndex, decodeEra5File } from './era5-decode';
import { extractEra5Provinces } from './era5-extract';
import { ERA5_VARIABLES } from './era5-request';

/**
 * GOLDEN test over REAL provider bytes — the anchor against "the fixture builder and the reader
 * share the same wrong model" (SPEC §5.1's second condition, the `gribberish` precedent).
 *
 * `mini-tr-t2m-1991-01.nc` is one real CDS job (`2m_temperature`, January 1991, the same TR box as
 * production) committed verbatim. `reference.json` was produced by TWO readers that are entirely
 * independent of `jsfive` — **`ncdump`** (the netCDF C reference implementation) and **`h5dump`**
 * (the HDF5 C reference implementation) — and cross-validated BIT-FOR-BIT against each other
 * before it was written; the province cell selection in it was re-implemented in Python from the
 * axes, so it does not inherit our TypeScript arithmetic either. See `test/fixtures/era5/README.md`
 * and the `producedBy` block inside the reference.
 *
 * ## Why EXACT float equality is correct here (and is not a fact-test violation)
 * These assertions pin DECODER CORRECTNESS — that our byte arithmetic lands on the same float
 * three independent implementations produced — not any geographic fact. Loosening to a tolerance
 * is precisely what would let a real decoding offset (one row, one cell, one byte) slip through.
 * What the temperature WAS in January 1991 is recorded evidence in the artifacts, asserted nowhere.
 */

const FIXTURE_DIR = join(__dirname, '..', '..', '..', 'test', 'fixtures', 'era5');

interface GoldenReference {
  fixture: string;
  fileKind: string;
  chunk: string | null;
  filters: string[];
  attributes: Record<string, string | null>;
  latitudeAxis: { first: number; last: number; length: number; step: number };
  longitudeAxis: { first: number; last: number; length: number; step: number };
  validTimeEpochSeconds: number[];
  expver: string[];
  maskedCellCount: number;
  totalCellCount: number;
  fallbackPlateCodes: string[];
  provinces: {
    plateCode: string;
    latIndex: number;
    lonIndex: number;
    cellLatitude: number;
    cellLongitude: number;
    fallbackUsed: boolean;
    fallbackDistanceKm: number;
    t2mKelvin: number;
    tempMeanC: number;
  }[];
}

describe('decodeEra5File — golden run over the committed REAL fixture', () => {
  const reference = JSON.parse(
    readFileSync(join(FIXTURE_DIR, 'reference.json'), 'utf8'),
  ) as GoldenReference;
  const bytes = new Uint8Array(readFileSync(join(FIXTURE_DIR, reference.fixture)));
  const decoded = decodeEra5File(bytes, reference.fixture, {
    variables: ERA5_VARIABLES.slice(0, 1),
    expectedMonthCount: 1,
  });

  it('reads the axes EXACTLY as the netCDF/HDF5 C libraries do', () => {
    expect(decoded.latitudeAxis).toHaveLength(reference.latitudeAxis.length);
    expect(decoded.longitudeAxis).toHaveLength(reference.longitudeAxis.length);
    expect(decoded.latitudeAxis[0]).toBe(reference.latitudeAxis.first);
    expect(decoded.latitudeAxis[decoded.latitudeAxis.length - 1]).toBe(reference.latitudeAxis.last);
    expect(decoded.longitudeAxis[0]).toBe(reference.longitudeAxis.first);
    expect(decoded.longitudeAxis[decoded.longitudeAxis.length - 1]).toBe(
      reference.longitudeAxis.last,
    );
    // The measured directions: longitude ASCENDING, latitude DESCENDING.
    expect(decoded.longitudeSummary.step).toBeGreaterThan(0);
    expect(decoded.latitudeSummary.step).toBeLessThan(0);
  });

  it('reads valid_time and expver exactly', () => {
    expect(decoded.months.map((month) => month.epochSeconds)).toEqual(
      reference.validTimeEpochSeconds,
    );
    expect([...decoded.expverValues]).toEqual(reference.expver);
  });

  it('agrees on WHICH cells are masked — the sea mask is data, not corruption', () => {
    expect(decoded.maskedCellCount).toBe(reference.maskedCellCount);
    expect(decoded.totalCellCount).toBe(reference.totalCellCount);
  });

  it('reads BIT-IDENTICAL float values at all 81 province cells', () => {
    const variable = decoded.variables[0];
    expect(variable).toBeDefined();
    if (variable === undefined) return;
    // The reference itself is pinned to 81 rows: a truncated reference.json must fail HERE, not
    // silently weaken the loop below.
    expect(reference.provinces).toHaveLength(81);
    for (const expected of reference.provinces) {
      const offset = flatIndex(
        0,
        expected.latIndex,
        expected.lonIndex,
        decoded.latitudeAxis.length,
        decoded.longitudeAxis.length,
      );
      // EXACT equality, deliberately — see the docblock.
      expect(variable.values[offset]).toBe(expected.t2mKelvin);
      expect(decoded.latitudeAxis[expected.latIndex]).toBe(expected.cellLatitude);
      expect(decoded.longitudeAxis[expected.lonIndex]).toBe(expected.cellLongitude);
    }
  });

  it('resolves the SAME cells the independent reader chose, fallback included', () => {
    const extraction = extractEra5Provinces(
      decoded,
      SEED_PROVINCES.map((province) => ({
        plateCode: province.plateCode,
        latitude: province.latitude,
        longitude: province.longitude,
      })),
    );
    expect(extraction.provinces).toHaveLength(81);
    expect([...extraction.fallbackPlateCodes]).toEqual(reference.fallbackPlateCodes);

    const byPlate = new Map(reference.provinces.map((province) => [province.plateCode, province]));
    for (const actual of extraction.provinces) {
      const expected = byPlate.get(actual.plateCode);
      expect(expected).toBeDefined();
      if (expected === undefined) continue;
      expect(actual.latIndex).toBe(expected.latIndex);
      expect(actual.lonIndex).toBe(expected.lonIndex);
      expect(actual.cellLatitude).toBe(expected.cellLatitude);
      expect(actual.cellLongitude).toBe(expected.cellLongitude);
      expect(actual.fallbackUsed).toBe(expected.fallbackUsed);
      expect(actual.fallbackDistanceKm).toBeCloseTo(expected.fallbackDistanceKm, 9);
    }
  });

  it('converts to °C exactly as the independent reference does', () => {
    const extraction = extractEra5Provinces(
      decoded,
      SEED_PROVINCES.map((province) => ({
        plateCode: province.plateCode,
        latitude: province.latitude,
        longitude: province.longitude,
      })),
    );
    const byPlate = new Map(reference.provinces.map((province) => [province.plateCode, province]));
    for (const series of extraction.series) {
      const expected = byPlate.get(series.plateCode);
      expect(expected).toBeDefined();
      if (expected === undefined) continue;
      expect(series.tempMeanC).toHaveLength(1);
      expect(series.tempMeanC[0]).toBe(expected.tempMeanC);
    }
  });

  it('records the container identity the HDF5 C library reports', () => {
    // Structure, not facts: this pins that we are still reading a chunked+filtered NetCDF4 file,
    // so a provider switch to another container fails here rather than deeper.
    expect(reference.fileKind).toContain('netCDF-4');
    expect(reference.filters).toContain('DEFLATE');
    expect(reference.filters).toContain('SHUFFLE');
  });
});
