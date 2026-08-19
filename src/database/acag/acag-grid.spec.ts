import { describe, expect, it } from '@jest/globals';
import {
  analyseAxis,
  distanceKm,
  distanceThresholdKm,
  mapCoordinateToIndex,
  readbackToleranceFor,
  LOCAL_SEARCH_RADIUS,
} from './acag-grid';
import { AcagContractError } from './acag.errors';

/**
 * These tests assert STRUCTURE and INVARIANTS, never facts about the world: no PM2.5 value and no
 * province's real number appears here. The one province coordinate that does appear (Sinop's
 * 42.0299) is present as a REGRESSION INPUT — it is the input that made the shipped arithmetic
 * fail, not a claim about Sinop's air.
 */

/** A float32-rounded ascending axis, the way the provider's file actually stores one. */
function float32Axis(first: number, step: number, length: number): number[] {
  const buffer = new Float32Array(length);
  for (let index = 0; index < length; index += 1) {
    buffer[index] = first + step * index;
  }
  return Array.from(buffer);
}

describe('analyseAxis', () => {
  it('derives the signed step from the axis rather than assuming 0.01', () => {
    const analysis = analyseAxis(float32Axis(35.005, 0.01, 50), 'lat');
    expect(analysis.step).toBeCloseTo(0.01, 5);
    expect(analysis.length).toBe(50);
  });

  it('derives a NEGATIVE step for a descending axis', () => {
    const analysis = analyseAxis(float32Axis(42.5, -0.01, 20), 'lat');
    expect(analysis.step).toBeLessThan(0);
  });

  it('refuses a non-monotonic axis', () => {
    const axis = float32Axis(35.005, 0.01, 10);
    axis[5] = 30;
    expect(() => analyseAxis(axis, 'lat')).toThrow(/NOT MONOTONIC/);
  });

  it('refuses an unevenly stepped axis', () => {
    const axis = float32Axis(35.005, 0.01, 10);
    axis[7] = (axis[7] as number) + 0.05;
    expect(() => analyseAxis(axis, 'lat')).toThrow(/not evenly stepped/);
  });

  it('accepts a HEALTHY float32 axis whose steps are not exactly equal', () => {
    // The point of the tolerance: real float32 axes never step by exactly 0.01.
    const axis = float32Axis(-59.995, 0.01, 500);
    const deltas = axis.slice(1).map((value, index) => value - (axis[index] as number));
    expect(new Set(deltas).size).toBeGreaterThan(1);
    expect(() => analyseAxis(axis, 'lat')).not.toThrow();
  });

  it('refuses an axis too short to derive a step from', () => {
    expect(() => analyseAxis([35.005], 'lat')).toThrow(AcagContractError);
  });
});

describe('mapCoordinateToIndex', () => {
  const axis = float32Axis(35.005, 0.01, 800);
  const analysis = analyseAxis(axis, 'lat');

  it('maps a coordinate to the cell whose centre is nearest', () => {
    const mapping = mapCoordinateToIndex(axis, analysis, 35.017, 'lat');
    expect(mapping.kind).toBe('mapped');
    if (mapping.kind !== 'mapped') throw new Error('unreachable');
    expect(mapping.snapped).toBeCloseTo(35.015, 5);
    expect(Math.abs(mapping.snapped - 35.017)).toBeLessThanOrEqual(
      readbackToleranceFor(analysis.step),
    );
  });

  /**
   * REGRESSION — the defect the first real fetch run surfaced.
   *
   * Sinop's centre latitude (42.0299) is 0.0049° from one cell centre and 0.0051° from the next.
   * The linear estimate `round((requested − first) / step)`, run against a float32 axis ~700 cells
   * long, named the FARTHER cell; the read-back guard refused to publish it. The fix was to make
   * the arithmetic find the true nearest centre, NOT to widen the guard — so this test asserts
   * both halves: the right cell is chosen, and it is inside the ORIGINAL tolerance.
   */
  it('chooses the truly nearest cell when the linear estimate drifts (Sinop regression)', () => {
    const longAxis = float32Axis(35.005, 0.01, 1200);
    const longAnalysis = analyseAxis(longAxis, 'lat');
    const requested = 42.0299;

    const naiveIndex = Math.round((requested - longAnalysis.first) / longAnalysis.step);
    const mapping = mapCoordinateToIndex(longAxis, longAnalysis, requested, 'lat');
    expect(mapping.kind).toBe('mapped');
    if (mapping.kind !== 'mapped') throw new Error('unreachable');

    // Whatever the linear estimate said, the chosen cell is the nearest one available.
    const distances = longAxis.map((value) => Math.abs(value - requested));
    const bestDistance = Math.min(...distances);
    expect(Math.abs(mapping.snapped - requested)).toBeCloseTo(bestDistance, 12);
    expect(Math.abs(mapping.snapped - requested)).toBeLessThanOrEqual(
      readbackToleranceFor(longAnalysis.step),
    );
    // The refinement is load-bearing: the naive estimate is not always the answer.
    expect(Math.abs(mapping.index - naiveIndex)).toBeLessThanOrEqual(LOCAL_SEARCH_RADIUS);
  });

  it('returns outside_domain (never throws) for a coordinate beyond the axis', () => {
    expect(mapCoordinateToIndex(axis, analysis, 10, 'lat').kind).toBe('outside_domain');
    expect(mapCoordinateToIndex(axis, analysis, 80, 'lat').kind).toBe('outside_domain');
  });

  it('accepts a coordinate within half a cell of the first/last centre', () => {
    expect(mapCoordinateToIndex(axis, analysis, 35.001, 'lat').kind).toBe('mapped');
  });

  it('THROWS when the axis disagrees with its own analysis (broken arithmetic)', () => {
    // A WRONG STEP keeps the requested value inside the axis domain — so the domain check cannot
    // save us — while placing the computed index far from where the value actually lives. The
    // local refinement (radius 2) cannot bridge that either, which is the point: the read-back
    // guard is what stands between a broken derivation and a plausible number from the wrong
    // place.
    const lying = { ...analysis, step: analysis.step * 2 };
    expect(() => mapCoordinateToIndex(axis, lying, 42.5, 'lat')).toThrow(/READ-BACK GUARD/);
  });

  it('refuses a non-finite requested coordinate', () => {
    expect(() => mapCoordinateToIndex(axis, analysis, Number.NaN, 'lat')).toThrow(
      AcagContractError,
    );
  });
});

describe('distance helpers', () => {
  it('measures zero distance for identical points', () => {
    expect(distanceKm(39.9, 32.8, 39.9, 32.8)).toBeCloseTo(0, 9);
  });

  it('grows the threshold with cell size and shrinks it toward the pole', () => {
    const atEquator = distanceThresholdKm(0, 0.01, 0.01);
    const atNorth = distanceThresholdKm(60, 0.01, 0.01);
    const bigger = distanceThresholdKm(39, 0.1, 0.1);
    expect(atNorth).toBeLessThan(atEquator);
    expect(bigger).toBeGreaterThan(distanceThresholdKm(39, 0.01, 0.01));
  });

  it('keeps any in-cell point inside the threshold at Türkiye latitudes', () => {
    // Half a cell diagonal at 0.01° is the worst case a correct mapping can produce.
    for (const latitude of [36, 39, 42]) {
      const halfDiagonal = distanceKm(latitude, 0, latitude + 0.005, 0.005);
      expect(halfDiagonal).toBeLessThanOrEqual(distanceThresholdKm(latitude, 0.01, 0.01));
    }
  });
});
