import { describe, expect, it } from '@jest/globals';
import {
  EARTH_MEAN_RADIUS_KM,
  haversineKm,
  interpolateGreatCircle,
  sampleGreatCircleLine,
  type GeoPoint,
} from './great-circle';

/**
 * Invariants, never facts. There is deliberately no `expect(distance(ankara, izmir)).toBe(…)`
 * here: that is a claim about the world, and the house rule keeps fact-checking out of test
 * assertions. What IS asserted is that the function behaves like a metric — symmetric, zero on
 * itself, obeying the triangle inequality — which is what a distance being wrong would break.
 */
describe('great-circle geometry', () => {
  const ankara: GeoPoint = { lat: 39.9208, lon: 32.8541 };
  const izmir: GeoPoint = { lat: 38.4192, lon: 27.1287 };
  const van: GeoPoint = { lat: 38.4891, lon: 43.4089 };

  it('is symmetric and zero on identical points', () => {
    expect(haversineKm(ankara, izmir)).toBeCloseTo(haversineKm(izmir, ankara), 10);
    expect(haversineKm(ankara, ankara)).toBe(0);
  });

  it('obeys the triangle inequality', () => {
    const direct = haversineKm(izmir, van);
    const viaAnkara = haversineKm(izmir, ankara) + haversineKm(ankara, van);
    expect(direct).toBeLessThanOrEqual(viaAnkara);
  });

  it('never returns NaN for antipodal points', () => {
    // The `min(1, …)` clamp inside the formula exists for exactly this input: float error can
    // push the argument of `asin` past 1, and a NaN here would flow silently into every sample.
    const north: GeoPoint = { lat: 45, lon: 0 };
    const antipode: GeoPoint = { lat: -45, lon: 180 };
    const distance = haversineKm(north, antipode);
    expect(Number.isNaN(distance)).toBe(false);
    expect(distance).toBeGreaterThan(0);
  });

  it('pins the Earth radius, because every other assertion here is scale-invariant', () => {
    // NOT a tautology, and the same argument as the sampling-zoom pin in tile-math.spec.ts.
    // Symmetry, the triangle inequality, the midpoint, the uniform ramp — all of them stay
    // green under ANY radius, because each compares two distances computed with the same
    // constant. So nothing else in this file can see a change to it. Meanwhile the module's
    // own docblock says the web repo holds a second copy of this formula whose RESULT must not
    // diverge, and this repo carried the constant as four scattered literals at two different
    // values — so a well-meant "harmonise the constants" commit is a live edit, not a
    // hypothesis. At 6378.137 the İzmir–Van line moves +1.58 km with every assertion below
    // still passing (review #122, TA122-I2).
    //
    // The literals are now one module (`src/common/geo/earth-radius.ts`), which names both
    // values and measures why the grid-mapping lines keep the other one. This pin stays here
    // as well as there: it is the assertion that fails if a future edit re-points THIS module
    // at the grid constant.
    //
    // `cografya_web/lib/map/measure.ts` must hold this same value.
    expect(EARTH_MEAN_RADIUS_KM).toBe(6371.0088);
  });

  it('treats the ±180 seam like any other span', () => {
    // No wrapping anywhere in this module, and this is what says so. A future
    // "simplification" to linear longitude arithmetic (or a `Math.abs(lon2 - lon1)` shortcut)
    // breaks exactly here and nowhere else (review #122, TA122-M3).
    const acrossSeam = haversineKm({ lat: 0, lon: 179 }, { lat: 0, lon: -179 });
    const nearZero = haversineKm({ lat: 0, lon: -1 }, { lat: 0, lon: 1 });
    expect(acrossSeam).toBeCloseTo(nearZero, 9);

    const atLatitude = haversineKm({ lat: 41, lon: 179.5 }, { lat: 41, lon: -179.5 });
    const atLatitudeNearZero = haversineKm({ lat: 41, lon: -0.5 }, { lat: 41, lon: 0.5 });
    expect(atLatitude).toBeCloseTo(atLatitudeNearZero, 9);
  });

  it('REFUSES a (near-)antipodal interpolation instead of inventing a path', () => {
    // `sin(pi)` is 1.22e-16, not 0, so the unguarded slerp returns a finite but arbitrary
    // point — (45,0) → (−45,180) at 0.5 used to yield (0, 90), a plausible-looking coordinate
    // on a path nobody asked for. Refusing is the only honest answer: infinitely many great
    // circles join an antipodal pair (review #122, CODE122-M9 / SFH122-M7).
    expect(() => interpolateGreatCircle({ lat: 45, lon: 0 }, { lat: -45, lon: 180 }, 0.5)).toThrow(
      RangeError,
    );
    expect(() => sampleGreatCircleLine({ lat: 39, lon: 35 }, { lat: -39, lon: -145 }, 5)).toThrow(
      RangeError,
    );
  });

  it('returns the endpoints exactly at fractions 0 and 1', () => {
    const start = interpolateGreatCircle(ankara, van, 0);
    const end = interpolateGreatCircle(ankara, van, 1);
    expect(start.lat).toBeCloseTo(ankara.lat, 9);
    expect(start.lon).toBeCloseTo(ankara.lon, 9);
    expect(end.lat).toBeCloseTo(van.lat, 9);
    expect(end.lon).toBeCloseTo(van.lon, 9);
  });

  it('places the midpoint equidistant from both endpoints', () => {
    const middle = interpolateGreatCircle(izmir, van, 0.5);
    expect(haversineKm(izmir, middle)).toBeCloseTo(haversineKm(middle, van), 6);
  });

  it('interpolates ON the great circle, not on the linear degree path', () => {
    // The distinguishing property: for an east-west line at mid latitude, the great circle
    // bows POLEWARD, so the true midpoint sits north of the latitude average. A linear
    // interpolation of the degrees would land exactly on that average — this is the assertion
    // that fails if someone "simplifies" the slerp away.
    const west: GeoPoint = { lat: 39, lon: 26 };
    const east: GeoPoint = { lat: 39, lon: 44 };
    const middle = interpolateGreatCircle(west, east, 0.5);
    expect(middle.lat).toBeGreaterThan(39);
    expect(middle.lon).toBeCloseTo(35, 6);
  });

  it('does not divide by zero on a degenerate line', () => {
    const point = interpolateGreatCircle(ankara, { ...ankara }, 0.37);
    expect(point.lat).toBe(ankara.lat);
    expect(point.lon).toBe(ankara.lon);
  });

  it('samples a line as a uniform ramp with both endpoints included', () => {
    const count = 200;
    const samples = sampleGreatCircleLine(izmir, van, count);
    const total = haversineKm(izmir, van);

    expect(samples).toHaveLength(count);

    const first = samples[0];
    const last = samples[count - 1];
    expect(first).toBeDefined();
    expect(last).toBeDefined();
    if (!first || !last) return; // strict narrowing; the assertions above are the real guard

    expect(first.distanceKm).toBe(0);
    expect(last.distanceKm).toBeCloseTo(total, 9);
    expect(first.lat).toBeCloseTo(izmir.lat, 9);
    expect(last.lat).toBeCloseTo(van.lat, 9);

    // Strictly increasing, evenly spaced, and every step consistent with the total.
    const expectedStep = total / (count - 1);
    for (let index = 1; index < count; index += 1) {
      const previous = samples[index - 1];
      const current = samples[index];
      if (!previous || !current) throw new Error('sample array is sparse');
      expect(current.distanceKm).toBeGreaterThan(previous.distanceKm);
      expect(current.distanceKm - previous.distanceKm).toBeCloseTo(expectedStep, 6);
    }
  });

  it('spaces samples evenly on the GROUND, not just in the index', () => {
    // The ramp above is arithmetic on `totalKm`; this checks the actual points it returned.
    const samples = sampleGreatCircleLine(izmir, van, 20);
    // Without this the whole body is inside a loop that runs zero times if the function
    // regressed to returning an empty array, and the case would pass vacuously (TA122-M9).
    expect(samples).toHaveLength(20);
    for (let index = 1; index < samples.length; index += 1) {
      const previous = samples[index - 1];
      const current = samples[index];
      if (!previous || !current) throw new Error('sample array is sparse');
      const measured = haversineKm(previous, current);
      expect(measured).toBeCloseTo(current.distanceKm - previous.distanceKm, 6);
    }
  });

  it('refuses a non-finite coordinate rather than returning NaN samples', () => {
    // The module's "## Domain" docblock claims finite inputs; this is what makes the claim
    // true. Without it a NaN latitude produced 200 samples of NaN, and the failure surfaced
    // two modules later (review #122, CR122R2-M7).
    expect(() => haversineKm({ lat: Number.NaN, lon: 32 }, ankara)).toThrow(RangeError);
    expect(() => interpolateGreatCircle(ankara, { lat: 39, lon: Number.NaN }, 0.5)).toThrow(
      RangeError,
    );
    expect(() =>
      sampleGreatCircleLine({ lat: Number.POSITIVE_INFINITY, lon: 32 }, ankara, 10),
    ).toThrow(RangeError);
  });

  it('refuses a sample count below two instead of returning a non-profile', () => {
    expect(() => sampleGreatCircleLine(izmir, van, 1)).toThrow(RangeError);
    expect(() => sampleGreatCircleLine(izmir, van, 0)).toThrow(RangeError);
    expect(() => sampleGreatCircleLine(izmir, van, 2.5)).toThrow(RangeError);
  });

  it('handles a degenerate line without producing NaN distances', () => {
    const samples = sampleGreatCircleLine(ankara, { ...ankara }, 5);
    expect(samples).toHaveLength(5);
    for (const sample of samples) {
      expect(sample.distanceKm).toBe(0);
      expect(Number.isNaN(sample.lat)).toBe(false);
    }
  });
});
