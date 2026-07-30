import { describe, expect, it } from '@jest/globals';
import { deriveWindDirection, deriveWindSpeed } from './ecmwf-wind';

/**
 * Layer 1 and layer 2 of the three-layer wind regression suite (SPEC §8.3) — the table and the
 * invariants. Layer 3, the recorded GRIB fixture, lives in `grib/grib-decoder.adapter.spec.ts`.
 *
 * Together they are the published precondition for drawing a direction arrow anywhere on the
 * platform (`MarineLayerDto.directionConvention`). That is why the table below is written out as
 * eight literal expectations rather than derived from the same `atan2` the implementation uses:
 * a test that re-derives the formula agrees with the code by construction, including about the
 * sign. These numbers were worked out from ECMWF's own definitions of `10u` and `10v` and then
 * cross-checked against the model's own wave direction in the same cell.
 */
describe('deriveWindDirection — the cardinal table', () => {
  // u is positive EASTWARD, v is positive NORTHWARD (ECMWF parameter database, paramIds 165/166).
  // The published bearing names the direction the wind COMES FROM, so each row is the opposite
  // of where the vector points.
  const CARDINALS: readonly { u: number; v: number; expected: number; blowingTowards: string }[] = [
    { u: 1, v: 0, expected: 270, blowingTowards: 'east → comes from the west' },
    { u: 1, v: 1, expected: 225, blowingTowards: 'north-east → comes from the south-west' },
    { u: 0, v: 1, expected: 180, blowingTowards: 'north → comes from the south' },
    { u: -1, v: 1, expected: 135, blowingTowards: 'north-west → comes from the south-east' },
    { u: -1, v: 0, expected: 90, blowingTowards: 'west → comes from the east' },
    { u: -1, v: -1, expected: 45, blowingTowards: 'south-west → comes from the north-east' },
    { u: 0, v: -1, expected: 0, blowingTowards: 'south → comes from the north' },
    { u: 1, v: -1, expected: 315, blowingTowards: 'south-east → comes from the north-west' },
  ];

  it.each(CARDINALS)(
    'u=$u v=$v → $expected° ($blowingTowards)',
    ({ u, v, expected }: { u: number; v: number; expected: number }) => {
      expect(deriveWindDirection(u, v)).toBeCloseTo(expected, 9);
    },
  );

  it('is invariant to the vector s magnitude — only its direction matters', () => {
    for (const scale of [0.1, 1, 7, 1_000]) {
      expect(deriveWindDirection(scale, 0)).toBeCloseTo(270, 9);
      expect(deriveWindDirection(0, -scale)).toBeCloseTo(0, 9);
    }
  });

  it('would break if the convention were ever flipped to "towards"', () => {
    // Stated as its own assertion so the intent survives a refactor: a `towards` implementation
    // returns 90 here, and 90 is a perfectly ordinary bearing — nothing else in the system could
    // tell the difference.
    expect(deriveWindDirection(1, 0)).not.toBeCloseTo(90, 9);
  });
});

describe('deriveWindDirection — invariants', () => {
  it('always lands in [0, 360)', () => {
    for (let angle = 0; angle < 360; angle += 3) {
      const radians = (angle * Math.PI) / 180;
      const direction = deriveWindDirection(Math.cos(radians) * 4.2, Math.sin(radians) * 4.2);
      expect(direction).not.toBeNull();
      expect(direction as number).toBeGreaterThanOrEqual(0);
      expect(direction as number).toBeLessThan(360);
    }
  });

  it('returns null — never 0 — when a component is missing', () => {
    // 0° is a legitimate northerly. A missing component that defaulted to it would be published
    // as a confident arrow pointing at nothing.
    expect(deriveWindDirection(null, 1)).toBeNull();
    expect(deriveWindDirection(1, null)).toBeNull();
    expect(deriveWindDirection(null, null)).toBeNull();
    expect(deriveWindDirection(Number.NaN, 1)).toBeNull();
    expect(deriveWindDirection(1, Number.NaN)).toBeNull();
  });

  it('publishes 0 for a dead-calm vector, which calmThreshold is what suppresses', () => {
    // Documented behaviour, pinned so it cannot drift silently in either direction: the bearing
    // of a zero vector is undefined, and the contract's answer is the `calmThreshold` interlock
    // on wind_speed_10m rather than a fourth null state here.
    expect(deriveWindDirection(0, 0)).toBe(0);
    expect(deriveWindSpeed(0, 0)).toBe(0);
  });

  it('rotates the bearing the same way the vector rotates', () => {
    // Anticlockwise rotation of the wind vector moves the "from" bearing anticlockwise too, i.e.
    // decreasing degrees. Catches a transposed atan2 that the cardinal table's symmetric cases
    // could otherwise satisfy.
    const east = deriveWindDirection(1, 0) as number; // 270
    const northEast = deriveWindDirection(1, 1) as number; // 225
    const north = deriveWindDirection(0, 1) as number; // 180
    expect(east).toBeGreaterThan(northEast);
    expect(northEast).toBeGreaterThan(north);
  });
});

describe('deriveWindSpeed', () => {
  it('is the vector magnitude', () => {
    expect(deriveWindSpeed(3, 4)).toBeCloseTo(5, 12);
    expect(deriveWindSpeed(-3, -4)).toBeCloseTo(5, 12);
  });

  it('is never negative and never smaller than either component', () => {
    for (const [u, v] of [
      [0, 0],
      [5, 0],
      [-5, 0],
      [0, -7.5],
      [3.3, -8.1],
    ] as const) {
      const speed = deriveWindSpeed(u, v);
      expect(speed).not.toBeNull();
      expect(speed as number).toBeGreaterThanOrEqual(0);
      expect(speed as number).toBeGreaterThanOrEqual(Math.max(Math.abs(u), Math.abs(v)));
    }
  });

  it('returns null when a component is missing', () => {
    expect(deriveWindSpeed(null, 1)).toBeNull();
    expect(deriveWindSpeed(1, null)).toBeNull();
    expect(deriveWindSpeed(Number.NaN, Number.NaN)).toBeNull();
  });
});
