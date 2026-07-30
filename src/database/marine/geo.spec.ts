import { describe, expect, it } from '@jest/globals';
import { TILE_SIZE_PX, haversineKm, isInsideBoundingBox, toTilePixel } from './geo';

/**
 * STRUCTURAL unit tests for the tile/pixel arithmetic and distance helpers.
 *
 * Everything here is a mathematical invariant of the Web Mercator projection or of the
 * haversine formula — no provider fact, no measured temperature, no per-point claim
 * (CONVENTIONS §2). The one place a real coordinate appears, it is used to assert a
 * RELATIONSHIP (monotonicity, round-trip, bounds), never a value we read off a provider.
 *
 * This matters more than it looks: the grid-distance acceptance threshold in the probe exists
 * specifically to catch THIS code being wrong, so if this code were only exercised through the
 * probe, a mirrored `j` axis would produce plausible-looking distances at every point and
 * nothing would notice.
 */
describe('toTilePixel', () => {
  it('places 0°/0° at the exact corner of the four zoom-1 tiles', () => {
    // Zoom 1 splits the world into 2×2. The null island is the centre of that split, so it
    // lands at tile (1, 1) pixel (0, 0) — the classic sanity anchor for Mercator tile maths.
    expect(toTilePixel(0, 0, 1)).toEqual({ tileCol: 1, tileRow: 1, i: 0, j: 0 });
  });

  it('has exactly one tile at zoom 0 and puts everything in it', () => {
    for (const [latitude, longitude] of [
      [41.0, 29.0],
      [-33.9, 151.2],
      [0, -180],
    ] as const) {
      const pixel = toTilePixel(latitude, longitude, 0);
      expect(pixel.tileCol).toBe(0);
      expect(pixel.tileRow).toBe(0);
    }
  });

  it('increases the column eastwards and the row SOUTHWARDS', () => {
    // The row/latitude inversion is the single easiest thing to get backwards here: `j` counts
    // pixels DOWN from the tile's top edge, which is the opposite direction to latitude.
    const west = toTilePixel(41, 26, 10);
    const east = toTilePixel(41, 32, 10);
    expect(east.tileCol).toBeGreaterThan(west.tileCol);

    const north = toTilePixel(43, 29, 10);
    const south = toTilePixel(37, 29, 10);
    expect(south.tileRow).toBeGreaterThan(north.tileRow);
  });

  it('never emits a pixel index outside the tile', () => {
    for (const longitude of [-180, -0.0001, 0, 179.9999, 180]) {
      for (const latitude of [-85, -0.0001, 0, 41.0000001, 85]) {
        const pixel = toTilePixel(latitude, longitude, 12);
        expect(pixel.i).toBeGreaterThanOrEqual(0);
        expect(pixel.i).toBeLessThan(TILE_SIZE_PX);
        expect(pixel.j).toBeGreaterThanOrEqual(0);
        expect(pixel.j).toBeLessThan(TILE_SIZE_PX);
        expect(Number.isInteger(pixel.tileCol)).toBe(true);
        expect(Number.isInteger(pixel.tileRow)).toBe(true);
      }
    }
  });

  it('clamps beyond the Mercator latitude limit instead of producing Infinity', () => {
    // tan(90°) diverges, so an unclamped implementation returns Infinity/NaN here and every
    // downstream tile index becomes garbage.
    const pole = toTilePixel(89.9, 30, 10);
    expect(Number.isFinite(pole.tileRow)).toBe(true);
    expect(pole.tileRow).toBe(toTilePixel(85.0511287798066, 30, 10).tileRow);
  });

  it('resolves finer as zoom increases — the reason the probe uses zoom 12, not 6', () => {
    // Two coordinates ~8 km apart share ONE tile at zoom 6 (a tile spans 5.625° there) and
    // land in different tiles at zoom 12 (0.088°). That is exactly why a low-zoom query can
    // read a land cell for an offshore point: at zoom 6 the whole neighbourhood collapses into
    // the same handful of pixels.
    const a = { lat: 40.75, lon: 28.4 };
    const b = { lat: 40.75, lon: 28.5 };

    const coarse = toTilePixel(a.lat, a.lon, 6);
    const coarseB = toTilePixel(b.lat, b.lon, 6);
    expect(coarse.tileCol).toBe(coarseB.tileCol);
    expect(coarse.tileRow).toBe(coarseB.tileRow);

    const fine = toTilePixel(a.lat, a.lon, 12);
    const fineB = toTilePixel(b.lat, b.lon, 12);
    expect(fine.tileCol).not.toBe(fineB.tileCol);
  });

  it('rejects a non-integer or negative zoom rather than silently producing fractions', () => {
    expect(() => toTilePixel(41, 29, 10.5)).toThrow(/zoom/);
    expect(() => toTilePixel(41, 29, -1)).toThrow(/zoom/);
  });
});

describe('haversineKm', () => {
  it('is zero for identical points and symmetric between them', () => {
    expect(haversineKm(41, 29, 41, 29)).toBe(0);
    expect(haversineKm(41, 29, 40, 28)).toBeCloseTo(haversineKm(40, 28, 41, 29), 12);
  });

  it('gives ~111 km per degree of latitude', () => {
    // A meridian degree is 111.19 km on the sphere this uses. Asserted as a RANGE, not a
    // literal, because it is a property of the formula, not a fact being published.
    const km = haversineKm(40, 29, 41, 29);
    expect(km).toBeGreaterThan(110);
    expect(km).toBeLessThan(112);
  });

  it('shrinks a degree of longitude towards the poles', () => {
    const atEquator = haversineKm(0, 29, 0, 30);
    const atForty = haversineKm(40, 29, 40, 30);
    expect(atForty).toBeLessThan(atEquator);
    // cos(40°) ≈ 0.766
    expect(atForty / atEquator).toBeCloseTo(Math.cos((40 * Math.PI) / 180), 2);
  });

  it('never returns NaN for antipodal points', () => {
    // The `Math.min(1, …)` guard: floating point can push the argument of `asin` just above 1.
    const km = haversineKm(0, 0, 0, 180);
    expect(Number.isFinite(km)).toBe(true);
    expect(km).toBeGreaterThan(20_000);
  });
});

describe('isInsideBoundingBox', () => {
  const box = { minLatitude: 40, maxLatitude: 41, minLongitude: 28, maxLongitude: 29 };

  it('is inclusive on every edge', () => {
    expect(isInsideBoundingBox(40, 28, box)).toBe(true);
    expect(isInsideBoundingBox(41, 29, box)).toBe(true);
  });

  it('rejects a point outside on either axis', () => {
    expect(isInsideBoundingBox(39.999, 28.5, box)).toBe(false);
    expect(isInsideBoundingBox(40.5, 29.001, box)).toBe(false);
  });
});
