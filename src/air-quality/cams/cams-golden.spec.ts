import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SEED_PROVINCES } from '../../database/seeds/province.seed-data';
import { AirQualityPollutant, AirQualityStatus } from '../air-quality.types';
import { decodeCamsFile } from './cams-decode';

/**
 * GOLDEN test over REAL provider bytes — the anchor against "the fixture builder and the
 * reader share the same wrong model" (plan §5.5).
 *
 * `mini-tr-pm25-1step.zip` is one real ADS job (1 pollutant × 1 step, TR subset, run
 * 2026-08-01) committed verbatim. `reference.json` was produced by an INDEPENDENT Python
 * struct reader and cross-checked against `ncdump` (13 650/13 650 grid values bit-exact) —
 * see the README and the `crossValidation` block inside the reference.
 *
 * ## Why EXACT float equality is correct here (and not a fact-test violation)
 * These assertions pin DECODER correctness — that our byte arithmetic lands on the same
 * float32 three independent implementations produced — not any geographic fact. Loosening to
 * a tolerance is exactly what would let a real decoding offset (one row, one cell, one byte)
 * slip through. The FACTS (what the concentration was that day) are recorded evidence in the
 * probe artifact, asserted nowhere.
 */

const FIXTURE_DIR = join(__dirname, '..', '..', '..', 'test', 'fixtures', 'cams');

interface GoldenReference {
  archive: string;
  runDate: string;
  unit: string;
  unitFirstCodePoint: number;
  fillValue: number;
  timeHours: number[];
  longitudeAxis: { first: number; last: number; length: number };
  latitudeAxis: { first: number; last: number; length: number };
  provinces: {
    plateCode: string;
    latIndex: number;
    lonIndex: number;
    gridLatitude: number;
    gridLongitude: number;
    pm2_5: number;
  }[];
}

describe('decodeCamsFile — golden run over the committed REAL fixture', () => {
  const reference = JSON.parse(
    readFileSync(join(FIXTURE_DIR, 'reference.json'), 'utf8'),
  ) as GoldenReference;
  const archive = readFileSync(join(FIXTURE_DIR, reference.archive));
  const points = SEED_PROVINCES.map((province) => ({
    plateCode: province.plateCode,
    latitude: province.latitude,
    longitude: province.longitude,
  }));

  const decoded = decodeCamsFile(new Uint8Array(archive), {
    expectedRunDate: reference.runDate.replaceAll('-', ''),
    points,
    pollutants: [AirQualityPollutant.Pm2_5],
  });

  it('reads the measured container + axes exactly (STORED zip, +lon / −lat axes)', () => {
    expect(decoded.zipMethod).toBe(0);
    expect(decoded.entryName).toBe('ENS_FORECAST.nc');
    expect(decoded.timeHours).toEqual(reference.timeHours);
    expect(decoded.longitudeAxis.first).toBe(reference.longitudeAxis.first);
    expect(decoded.longitudeAxis.last).toBe(reference.longitudeAxis.last);
    expect(decoded.longitudeAxis.length).toBe(reference.longitudeAxis.length);
    expect(decoded.latitudeAxis.first).toBe(reference.latitudeAxis.first);
    expect(decoded.latitudeAxis.last).toBe(reference.latitudeAxis.last);
    expect(decoded.latitudeAxis.length).toBe(reference.latitudeAxis.length);
    expect(decoded.latitudeAxis.step).toBeLessThan(0);
    expect(decoded.longitudeAxis.step).toBeGreaterThan(0);
  });

  it('reads the measured unit (U+00B5) and _FillValue from the file', () => {
    expect(decoded.units[AirQualityPollutant.Pm2_5]).toBe(reference.unit);
    expect(reference.unit.codePointAt(0)).toBe(reference.unitFirstCodePoint);
    expect(reference.unitFirstCodePoint).toBe(0xb5);
    expect(decoded.fillValues[AirQualityPollutant.Pm2_5]).toBe(reference.fillValue);
  });

  it('maps all 81 provinces onto the SAME cells and reads BIT-IDENTICAL float32 values', () => {
    expect(decoded.provinces).toHaveLength(81);
    // The REFERENCE itself is pinned to 81 rows: a truncated reference.json must fail here,
    // not silently weaken the loop below.
    expect(reference.provinces).toHaveLength(81);
    const byPlate = new Map(decoded.provinces.map((province) => [province.plateCode, province]));
    for (const expected of reference.provinces) {
      const actual = byPlate.get(expected.plateCode);
      expect(actual).toBeDefined();
      if (actual === undefined) continue;
      expect(actual.outsideDomain).toBe(false);
      // EXACT equality, deliberately — see the docblock.
      expect(actual.gridLatitude).toBe(expected.gridLatitude);
      expect(actual.gridLongitude).toBe(expected.gridLongitude);
      expect(actual.series[AirQualityPollutant.Pm2_5]).toEqual([expected.pm2_5]);
      expect(actual.support[AirQualityPollutant.Pm2_5]).toBe(AirQualityStatus.Ok);
      expect(actual.distanceKm).not.toBeNull();
      expect(actual.thresholdKm).not.toBeNull();
      expect(actual.distanceKm ?? Infinity).toBeLessThanOrEqual(actual.thresholdKm ?? 0);
    }
  });
});
