import { describe, expect, it } from '@jest/globals';
import { bilinearSample } from './bilinear';
import {
  TERRAIN_SAMPLE_ZOOM,
  TILE_SIZE,
  lonLatToTilePixel,
  tileKey,
  tilePixelToLonLat,
  tileWidthKmAtLatitude,
  tilesPerAxis,
} from './tile-math';

/**
 * Structural only, per the house rule: nothing here asserts where a place on Earth is. The
 * round trip is the real test — a swapped axis or a sign error survives hand-computed
 * expectations (they get derived with the same wrong reasoning) and cannot survive a
 * transform that has to close on itself.
 */
describe('tile math', () => {
  it('round-trips a coordinate through the tile pyramid', () => {
    // A spread of points inside the Türkiye frame plus two extremes, so a failure that only
    // shows up away from the reference latitude cannot hide.
    const points = [
      { lon: 32.8541, lat: 39.9208 },
      { lon: 25.7, lat: 40.1 },
      { lon: 44.9, lat: 37.4 },
      { lon: 28.9784, lat: 41.0082 },
      { lon: 0, lat: 0 },
      { lon: -179.9, lat: -60 },
    ];

    for (const point of points) {
      const position = lonLatToTilePixel(point.lon, point.lat, TERRAIN_SAMPLE_ZOOM);
      const back = tilePixelToLonLat(
        position.tileX,
        position.tileY,
        position.pixelX,
        position.pixelY,
        TERRAIN_SAMPLE_ZOOM,
      );

      // ~1e-9 degrees is roughly 0.1 mm; anything looser would let a real defect through.
      expect(back.lon).toBeCloseTo(point.lon, 9);
      expect(back.lat).toBeCloseTo(point.lat, 9);
    }
  });

  it('places a point inside a valid tile with an in-range pixel offset', () => {
    const position = lonLatToTilePixel(32.8541, 39.9208, TERRAIN_SAMPLE_ZOOM);
    const axis = tilesPerAxis(TERRAIN_SAMPLE_ZOOM);

    expect(Number.isInteger(position.tileX)).toBe(true);
    expect(Number.isInteger(position.tileY)).toBe(true);
    expect(position.tileX).toBeGreaterThanOrEqual(0);
    expect(position.tileX).toBeLessThan(axis);
    expect(position.tileY).toBeGreaterThanOrEqual(0);
    expect(position.tileY).toBeLessThan(axis);
    expect(position.pixelX).toBeGreaterThanOrEqual(0);
    expect(position.pixelX).toBeLessThan(TILE_SIZE);
    expect(position.pixelY).toBeGreaterThanOrEqual(0);
    expect(position.pixelY).toBeLessThan(TILE_SIZE);
  });

  it('keeps the pyramid edges in range instead of producing a tile index one past the end', () => {
    const axis = tilesPerAxis(TERRAIN_SAMPLE_ZOOM);

    // lon +180 and the Mercator latitude limit are the two inputs that land exactly ON the
    // boundary; both used to floor to `axis`, which is a 404 for a legal coordinate.
    const east = lonLatToTilePixel(180, 0, TERRAIN_SAMPLE_ZOOM);
    expect(east.tileX).toBe(axis - 1);

    const south = lonLatToTilePixel(0, -89, TERRAIN_SAMPLE_ZOOM);
    expect(south.tileY).toBe(axis - 1);

    const north = lonLatToTilePixel(0, 89, TERRAIN_SAMPLE_ZOOM);
    expect(north.tileY).toBe(0);

    // The second half of the documented contract: the pixel offset stays INSIDE the tile it
    // was clamped into. Only the tile index was pinned before, so a differently written clamp
    // could have left `pixelX` outside [0, TILE_SIZE] with every assertion above still green
    // (review #122, TA122-M4).
    expect(east.pixelX).toBeGreaterThanOrEqual(0);
    expect(east.pixelX).toBeLessThanOrEqual(TILE_SIZE);
    expect(south.pixelY).toBeGreaterThanOrEqual(0);
    expect(south.pixelY).toBeLessThanOrEqual(TILE_SIZE);
  });

  it('hands the pyramid edge to the sampler without stepping outside the grid', () => {
    // The COMPOSED path the two docblocks promise between them: lon +180 lands at pixelX
    // exactly TILE_SIZE, and `bilinearSample` clamps there rather than reading a cell that
    // does not exist.
    //
    // The assertion is on the VALUE, and that is the whole point. The first version of this
    // case seeded the marker in the far corner and asserted `Number.isFinite(sampled)` — but
    // the composed path reads row 0, column 255, so the marker was never touched and the
    // assertion reduced to "did not throw and is not NaN". A regression that dropped
    // `clampIndex` would read `grid[256]`, hit the `?? 0` fallback, return 0, and pass
    // (review #122, CR122R2-M6 / TA122R2-M2). Reading the marker is what makes the clamp
    // load-bearing here.
    const edge = lonLatToTilePixel(180, 0, TERRAIN_SAMPLE_ZOOM);
    expect(edge.pixelX).toBe(TILE_SIZE);
    expect(edge.pixelY).toBe(0);

    const grid = new Int16Array(TILE_SIZE * TILE_SIZE);
    grid[TILE_SIZE - 1] = 1234;

    // x clamps to column 255 (both sides of the interpolation) and y clamps to row 0, so a
    // correct sampler returns the marker exactly.
    expect(bilinearSample(grid, edge.pixelX, edge.pixelY)).toBeCloseTo(1234, 10);
  });

  it('refuses a non-finite coordinate rather than returning a NaN tile index', () => {
    // `tileX: NaN` becomes the literal string "NaN" in a tile URL, and the resulting 404 reads
    // downstream as "the provider has no data here" (review #122, TA122-M2 / SFH122-M6).
    expect(() => lonLatToTilePixel(Number.NaN, 39, TERRAIN_SAMPLE_ZOOM)).toThrow(RangeError);
    expect(() => lonLatToTilePixel(32, Number.NaN, TERRAIN_SAMPLE_ZOOM)).toThrow(RangeError);
    expect(() => lonLatToTilePixel(32, 39, Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });

  it('moves east and south monotonically across tiles', () => {
    const west = lonLatToTilePixel(26, 39, TERRAIN_SAMPLE_ZOOM);
    const east = lonLatToTilePixel(44, 39, TERRAIN_SAMPLE_ZOOM);
    expect(east.tileX).toBeGreaterThan(west.tileX);

    // Screen convention: y grows SOUTHWARD, so a lower latitude must produce a HIGHER tileY.
    // Getting this backwards mirrors every profile vertically and is invisible in a round trip.
    const northern = lonLatToTilePixel(35, 42, TERRAIN_SAMPLE_ZOOM);
    const southern = lonLatToTilePixel(35, 36, TERRAIN_SAMPLE_ZOOM);
    expect(southern.tileY).toBeGreaterThan(northern.tileY);
  });

  it('has exactly one tile at zoom 0 and quadruples each level', () => {
    expect(tilesPerAxis(0)).toBe(1);
    expect(tilesPerAxis(1)).toBe(2);
    expect(tilesPerAxis(TERRAIN_SAMPLE_ZOOM)).toBe(4096);

    const only = lonLatToTilePixel(32.8541, 39.9208, 0);
    expect(only.tileX).toBe(0);
    expect(only.tileY).toBe(0);
  });

  it('formats a tile key in the provider’s own z/x/y order', () => {
    expect(tileKey(12, 2483, 1575)).toBe('12/2483/1575');
  });

  it('reports a tile edge that shrinks with latitude and with zoom', () => {
    const atEquator = tileWidthKmAtLatitude(0, TERRAIN_SAMPLE_ZOOM);
    const atReference = tileWidthKmAtLatitude(39, TERRAIN_SAMPLE_ZOOM);
    const atNorth = tileWidthKmAtLatitude(42, TERRAIN_SAMPLE_ZOOM);

    expect(atReference).toBeLessThan(atEquator);
    expect(atNorth).toBeLessThan(atReference);
    // One level deeper halves the edge — the invariant the cost arithmetic rests on.
    expect(tileWidthKmAtLatitude(39, TERRAIN_SAMPLE_ZOOM + 1)).toBeCloseTo(atReference / 2, 9);
  });

  it('pins the sampling zoom, because the value is a licence constant', () => {
    // Not a tautology: SPEC §8.2 measured ETOPO1 present at z <= 10 and absent at z >= 11, so
    // this number decides which attribution lines we owe and whether NOAA's navigation limit
    // applies at all. A change here must fail a test and be argued in the diff, not slip
    // through as a performance tweak.
    expect(TERRAIN_SAMPLE_ZOOM).toBe(12);
  });
});
