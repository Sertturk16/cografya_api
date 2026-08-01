import { describe, expect, it } from '@jest/globals';
import { CamsContractError } from './cams.errors';
import {
  analyseAxis,
  AXIS_EQUAL_STEP_TOLERANCE,
  distanceKm,
  distanceThresholdKm,
  mapCoordinateToIndex,
  readbackToleranceFor,
} from './cams-grid';

/** A float32 axis like the provider's: start + i·step, rounded through Math.fround. */
function float32Axis(start: number, step: number, count: number): number[] {
  return Array.from({ length: count }, (_unused, index) => Math.fround(start + index * step));
}

/** The measured production axes: lon 25.55…44.95 (+0.1, 195), lat 42.45…35.55 (−0.1, 70). */
const LON_AXIS = float32Axis(25.55, 0.1, 195);
const LAT_AXIS = float32Axis(42.45, -0.1, 70);

describe('analyseAxis — the axis guard', () => {
  it('derives the SIGNED step from the axis (never a hardcoded +0.1)', () => {
    const lon = analyseAxis(LON_AXIS, 'longitude');
    expect(lon.step).toBeCloseTo(0.1, 4);
    const lat = analyseAxis(LAT_AXIS, 'latitude');
    expect(lat.step).toBeCloseTo(-0.1, 4);
    expect(lat.step).toBeLessThan(0); // the DESCENDING latitude axis is a pinned fact
  });

  it('accepts float32 jitter (a strict equal-step check would reject a HEALTHY file)', () => {
    // Measured jitter ≤ 3.8e-6; the tolerance must sit far above it and far below a cell.
    expect(AXIS_EQUAL_STEP_TOLERANCE).toBeGreaterThan(3.8e-6 * 10);
    expect(AXIS_EQUAL_STEP_TOLERANCE).toBeLessThan(0.1 / 2);
    expect(() => analyseAxis(LON_AXIS, 'longitude')).not.toThrow();
    expect(() => analyseAxis(LAT_AXIS, 'latitude')).not.toThrow();
  });

  it('REFUSES the wrapped full-domain longitude axis (335.05…359.95 then 0.05…44.95)', () => {
    const wrapped = [...float32Axis(335.05, 0.1, 250), ...float32Axis(0.05, 0.1, 450)];
    expect(() => analyseAxis(wrapped, 'longitude')).toThrow(CamsContractError);
    expect(() => analyseAxis(wrapped, 'longitude')).toThrow(/NOT MONOTONIC/);
  });

  it('refuses an unevenly stepped axis', () => {
    expect(() => analyseAxis([0, 0.1, 0.3, 0.4], 'longitude')).toThrow(/not evenly stepped/);
  });
});

describe('mapCoordinateToIndex — direction-aware arithmetic + the read-back guard', () => {
  const lon = analyseAxis(LON_AXIS, 'longitude');
  const lat = analyseAxis(LAT_AXIS, 'latitude');

  it('maps a point correctly on the DESCENDING latitude axis', () => {
    // Ankara ≈ 39.93 N → nearest centre 39.95, index (42.45 − 39.95)/0.1 = 25.
    const mapping = mapCoordinateToIndex(LAT_AXIS, lat, 39.93, 'latitude');
    expect(mapping.kind).toBe('mapped');
    if (mapping.kind === 'mapped') {
      expect(mapping.index).toBe(25);
      expect(mapping.snapped).toBeCloseTo(39.95, 3);
    }
  });

  it('NEGATIVE (acceptance criterion 1): a +0.1 assumption on the descending axis is caught', () => {
    // The naive formula round((value − axis[0]) / +0.1) for latitude 39.93:
    const naiveIndex = Math.round((39.93 - 42.45) / 0.1); // −25 — out of range entirely
    expect(naiveIndex).toBeLessThan(0);
    // And if it were clamped into range, the read-back deviation convicts it:
    const clamped = Math.abs(naiveIndex);
    const wrongCell = LAT_AXIS[clamped];
    expect(wrongCell).toBeDefined();
    expect(Math.abs((wrongCell ?? 0) - 39.93)).toBeGreaterThan(readbackToleranceFor(lat.step));
  });

  it('KAYSERI pinned case: longitude 35.5000 is the exact midpoint of two cells and PASSES', () => {
    // Fixed 0.05 tolerance passed by only 7.6e-7° (measured) — the derived tolerance
    // |step|/2 + 1e-3 keeps a healthy file healthy even if the axis moves by a ULP.
    const mapping = mapCoordinateToIndex(LON_AXIS, lon, 35.5, 'longitude');
    expect(mapping.kind).toBe('mapped');
    if (mapping.kind === 'mapped') {
      expect(Math.abs(mapping.snapped - 35.5)).toBeGreaterThan(0.0499);
      expect(Math.abs(mapping.snapped - 35.5)).toBeLessThanOrEqual(readbackToleranceFor(lon.step));
    }
    // A one-ULP-poisoned axis still passes (the R2b "guard fires on a perfect file" class).
    const poisoned = [...LON_AXIS];
    const midIndex = Math.round((35.5 - lon.first) / lon.step);
    poisoned[midIndex] = Math.fround((poisoned[midIndex] ?? 0) + 2e-5);
    expect(mapCoordinateToIndex(poisoned, lon, 35.5, 'longitude').kind).toBe('mapped');
  });

  it('read-back guard THROWS when the computed index lands on the wrong cell', () => {
    // Corrupt the axis so index arithmetic and the stored coordinate disagree by a full cell.
    const corrupted = [...LON_AXIS];
    const target = Math.round((35.55 - lon.first) / lon.step);
    corrupted[target] = Math.fround(35.55 + 0.1);
    expect(() => mapCoordinateToIndex(corrupted, lon, 35.55, 'longitude')).toThrow(
      /READ-BACK GUARD/,
    );
  });

  it('returns outside_domain (not a throw) beyond the axis coverage — the not_supported class', () => {
    expect(mapCoordinateToIndex(LON_AXIS, lon, 60.0, 'longitude')).toEqual({
      kind: 'outside_domain',
    });
    expect(mapCoordinateToIndex(LAT_AXIS, lat, 20.0, 'latitude')).toEqual({
      kind: 'outside_domain',
    });
  });
});

describe('distance helpers', () => {
  it('haversine distance is 0 for identical points and ~11.1 km per 0.1° latitude', () => {
    expect(distanceKm(39, 35, 39, 35)).toBe(0);
    expect(distanceKm(39, 35, 39.1, 35)).toBeGreaterThan(10.5);
    expect(distanceKm(39, 35, 39.1, 35)).toBeLessThan(11.7);
  });

  it('threshold at 39°N for a 0.1° grid is ≈ 8.5 km (SPEC §7.3), latitude-dependent', () => {
    const at39 = distanceThresholdKm(39, -0.1, 0.1);
    expect(at39).toBeGreaterThan(8.0);
    expect(at39).toBeLessThan(9.0);
    // Higher latitude → narrower cells → smaller threshold.
    expect(distanceThresholdKm(60, -0.1, 0.1)).toBeLessThan(at39);
    // Measured worst real province (6.406 km) sits inside the threshold with margin.
    expect(6.406).toBeLessThan(at39);
  });
});
