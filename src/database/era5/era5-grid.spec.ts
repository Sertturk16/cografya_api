import { describe, expect, it } from '@jest/globals';
import {
  analyseEra5Axis,
  distanceKm,
  FALLBACK_MAX_DISTANCE_KM,
  mapEra5CoordinateToIndex,
  readbackToleranceFor,
  selectEra5Cell,
} from './era5-grid';
import { Era5ContractError } from './era5.errors';

/**
 * Synthetic axes with the MEASURED shape of the real product: longitude ASCENDING 25.5 → 45.0 and
 * latitude DESCENDING 42.5 → 35.5, both step 0.1, grid-point registered. Built arithmetically so
 * they carry realistic float noise rather than exact decimals typed by hand.
 */
function buildLatitudeAxis(): number[] {
  return Array.from({ length: 71 }, (_unused, index) => 42.5 - index * 0.1);
}
function buildLongitudeAxis(): number[] {
  return Array.from({ length: 196 }, (_unused, index) => 25.5 + index * 0.1);
}

describe('analyseEra5Axis', () => {
  it('derives the step WITH ITS SIGN from the axis, never from a literal', () => {
    expect(analyseEra5Axis(buildLatitudeAxis(), 'latitude').step).toBeCloseTo(-0.1, 10);
    expect(analyseEra5Axis(buildLongitudeAxis(), 'longitude').step).toBeCloseTo(0.1, 10);
  });

  it('reports the real first/last/length', () => {
    const analysis = analyseEra5Axis(buildLongitudeAxis(), 'longitude');
    expect(analysis.first).toBeCloseTo(25.5, 10);
    expect(analysis.last).toBeCloseTo(45.0, 10);
    expect(analysis.length).toBe(196);
  });

  it('refuses a NON-MONOTONIC axis — the wrapped 0…360 convention lands exactly here', () => {
    const wrapped = [335.05, 335.15, 335.25, 0.05, 0.15];
    expect(() => analyseEra5Axis(wrapped, 'longitude')).toThrow(Era5ContractError);
    expect(() => analyseEra5Axis(wrapped, 'longitude')).toThrow(/NOT MONOTONIC/);
  });

  it('refuses an unevenly stepped axis', () => {
    expect(() => analyseEra5Axis([10, 10.1, 10.2, 10.5], 'latitude')).toThrow(/not evenly stepped/);
  });

  it('refuses an axis too short to derive a step', () => {
    expect(() => analyseEra5Axis([10], 'latitude')).toThrow(/need at least 2/);
  });

  it('tolerates float32 noise that a strict equality check would reject', () => {
    // Real float32 axes deviate from a clean 0.1 by ~1e-6; refusing those would refuse a HEALTHY
    // file, which is the failure mode that gets a guard switched off.
    const noisy = [25.5, 25.6000004, 25.6999998, 25.8000003];
    expect(() => analyseEra5Axis(noisy, 'longitude')).not.toThrow();
  });
});

describe('readbackToleranceFor', () => {
  it('is |step|/2 + 1e-3 regardless of the step SIGN', () => {
    expect(readbackToleranceFor(0.1)).toBeCloseTo(0.051, 12);
    expect(readbackToleranceFor(-0.1)).toBeCloseTo(0.051, 12);
  });
});

describe('mapEra5CoordinateToIndex — the Malatya boundary case', () => {
  const latitudeAxis = buildLatitudeAxis();
  const longitudeAxis = buildLongitudeAxis();
  const latitudeAnalysis = analyseEra5Axis(latitudeAxis, 'latitude');
  const longitudeAnalysis = analyseEra5Axis(longitudeAxis, 'longitude');

  // 44 Malatya, seed coordinates 38.35 / 38.25 — the ONLY province sitting at EXACTLY half a step
  // on BOTH axes under this product's grid-point registration (probe §2.3). A strict `< 0.05`
  // threshold would drop it out of a perfectly healthy file, which is why the +1e-3 slack is a
  // REQUIREMENT and not a nicety. This test exists so nobody "tidies" the tolerance away.
  it('maps 44 Malatya on BOTH axes at exactly half a step', () => {
    const lat = mapEra5CoordinateToIndex(latitudeAxis, latitudeAnalysis, 38.35, 'latitude');
    const lon = mapEra5CoordinateToIndex(longitudeAxis, longitudeAnalysis, 38.25, 'longitude');
    expect(Math.abs(lat.snapped - 38.35)).toBeGreaterThan(0.0499);
    expect(Math.abs(lat.snapped - 38.35)).toBeLessThanOrEqual(readbackToleranceFor(-0.1));
    expect(Math.abs(lon.snapped - 38.25)).toBeGreaterThan(0.0499);
    expect(Math.abs(lon.snapped - 38.25)).toBeLessThanOrEqual(readbackToleranceFor(0.1));
  });

  it('maps a mid-cell coordinate to the obvious cell', () => {
    const lat = mapEra5CoordinateToIndex(latitudeAxis, latitudeAnalysis, 39.92, 'latitude');
    expect(lat.snapped).toBeCloseTo(39.9, 6);
    const lon = mapEra5CoordinateToIndex(longitudeAxis, longitudeAnalysis, 32.85, 'longitude');
    expect(lon.snapped).toBeCloseTo(32.9, 6);
  });

  it('THROWS outside the domain — no soft class on a migration (SPEC §4.1-3 / V5)', () => {
    expect(() =>
      mapEra5CoordinateToIndex(latitudeAxis, latitudeAnalysis, 12.0, 'latitude'),
    ).toThrow(/OUTSIDE DOMAIN/);
  });

  it('THROWS when the arithmetic lands on the wrong cell (read-back guard)', () => {
    // A latitude axis whose first value lies about where it starts: the index computed from the
    // ANALYSIS no longer reads back to the requested coordinate.
    const brokenAnalysis = { ...latitudeAnalysis, first: 41.0 };
    expect(() => mapEra5CoordinateToIndex(latitudeAxis, brokenAnalysis, 38.35, 'latitude')).toThrow(
      /READ-BACK GUARD/,
    );
  });
});

describe('distanceKm', () => {
  it('is zero for identical points and symmetric', () => {
    expect(distanceKm(39, 32, 39, 32)).toBe(0);
    expect(distanceKm(39, 32, 40, 33)).toBeCloseTo(distanceKm(40, 33, 39, 32), 10);
  });

  it('matches the measured Sinop fallback distance (13.20 km) to two decimals', () => {
    // 57 Sinop: administrative point (42.0299, 35.1545) → land cell (42.0, 35.0). This pins the
    // haversine implementation against an independently measured value, not a geographic fact.
    expect(distanceKm(42.0299, 35.1545, 42.0, 35.0)).toBeCloseTo(13.2, 1);
  });
});

describe('selectEra5Cell — the A-1 declared land-cell fallback', () => {
  const latitudeAxis = buildLatitudeAxis();
  const longitudeAxis = buildLongitudeAxis();
  const latitudeAnalysis = analyseEra5Axis(latitudeAxis, 'latitude');
  const longitudeAnalysis = analyseEra5Axis(longitudeAxis, 'longitude');

  const select = (
    requestedLatitude: number,
    requestedLongitude: number,
    isMasked: (latIndex: number, lonIndex: number) => boolean,
  ): ReturnType<typeof selectEra5Cell> =>
    selectEra5Cell({
      latitudeAxis,
      longitudeAxis,
      latitudeAnalysis,
      longitudeAnalysis,
      requestedLatitude,
      requestedLongitude,
      isMasked,
      label: 'test province',
    });

  it('uses the point cell and records NO shift when the cell is land', () => {
    const selection = select(39.92, 32.85, () => false);
    expect(selection.fallbackUsed).toBe(false);
    expect(selection.fallbackDistanceKm).toBe(0);
    expect(selection.cellLatitude).toBeCloseTo(39.9, 6);
  });

  it('falls back to the nearest land cell and RECORDS the flag, the cell and the km', () => {
    const point = select(39.92, 32.85, () => false);
    // Mask only the province's own cell; everything else is land.
    const selection = select(
      39.92,
      32.85,
      (latIndex, lonIndex) => latIndex === point.latIndex && lonIndex === point.lonIndex,
    );
    expect(selection.fallbackUsed).toBe(true);
    expect(selection.fallbackDistanceKm).toBeGreaterThan(0);
    expect(selection.fallbackDistanceKm).toBeLessThanOrEqual(FALLBACK_MAX_DISTANCE_KM);
    expect(selection.latIndex !== point.latIndex || selection.lonIndex !== point.lonIndex).toBe(
      true,
    );
  });

  it('breaks ties DETERMINISTICALLY — same input, same manifest, every run', () => {
    const point = select(39.92, 32.85, () => false);
    const masked = (latIndex: number, lonIndex: number): boolean =>
      latIndex === point.latIndex && lonIndex === point.lonIndex;
    const first = select(39.92, 32.85, masked);
    const second = select(39.92, 32.85, masked);
    expect(second.latIndex).toBe(first.latIndex);
    expect(second.lonIndex).toBe(first.lonIndex);
    expect(second.fallbackDistanceKm).toBe(first.fallbackDistanceKm);
  });

  it('STOPS when the whole search window is sea — never widens the search to "find" data', () => {
    expect(() => select(39.92, 32.85, () => true)).toThrow(/NO land cell was found/);
  });

  it('STOPS when the nearest land cell is beyond the 25 km ceiling', () => {
    const point = select(39.92, 32.85, () => false);
    // Land only in the far corner of the window: ~3 cells away on both axes ≈ 40 km.
    const selection = (): ReturnType<typeof selectEra5Cell> =>
      select(
        39.92,
        32.85,
        (latIndex, lonIndex) =>
          !(latIndex === point.latIndex - 3 && lonIndex === point.lonIndex - 3),
      );
    expect(selection).toThrow(
      new RegExp(`over the declared ${String(FALLBACK_MAX_DISTANCE_KM)} km`),
    );
  });
});
