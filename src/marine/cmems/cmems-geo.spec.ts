import { describe, expect, it } from '@jest/globals';
import { MARINE_POINT_CANDIDATES } from '../../database/marine/marine-candidates';
import { CMEMS_BASIN_ROUTING } from './cmems-routing';
import { CMEMS_ZOOM } from './cmems.constants';
import { haversineKm, tilePixelCenterLatLon, toTilePixel, TILE_SIZE_PX } from './cmems-geo';

/**
 * The OFFLINE half of the snap guard (plan §8): every reference point must round-trip through
 * its tile/pixel address to a pixel CENTRE no further away than one pixel's half-diagonal.
 *
 * That is the invariant a wrong-cell bug breaks first — a mirrored north, swapped i/j, or an
 * off-by-one tile row moves the centre by whole cells, not metres. The bound is DERIVED from
 * the projection (ground resolution at the point's own latitude), never a magic number, so the
 * test stays structural (MEMORY rule: structure, not facts).
 */

/** EPSG:3857 ground resolution at a latitude and zoom, metres per pixel. */
function groundResolutionMetres(latitudeDeg: number, zoom: number): number {
  const EQUATORIAL_CIRCUMFERENCE_M = 40_075_016.686;
  return (
    (EQUATORIAL_CIRCUMFERENCE_M * Math.cos((latitudeDeg * Math.PI) / 180)) /
    (TILE_SIZE_PX * 2 ** zoom)
  );
}

describe('toTilePixel ↔ tilePixelCenterLatLon (zoom 12, all 30 reference points)', () => {
  it.each(MARINE_POINT_CANDIDATES.map((candidate) => [candidate.slugTr, candidate] as const))(
    '%s lands inside its own pixel',
    (_slug, candidate) => {
      const pixel = toTilePixel(candidate.latitude, candidate.longitude, CMEMS_ZOOM);
      const centre = tilePixelCenterLatLon(pixel, CMEMS_ZOOM);
      const distanceM =
        haversineKm(candidate.latitude, candidate.longitude, centre.latitude, centre.longitude) *
        1000;

      // Half the pixel diagonal, with 5% slack for the spherical-vs-Mercator distance mismatch.
      const resolution = groundResolutionMetres(candidate.latitude, CMEMS_ZOOM);
      expect(distanceM).toBeLessThanOrEqual((resolution * Math.SQRT2 * 1.05) / 2);
    },
  );

  it('keeps every pixel address inside its tile', () => {
    for (const candidate of MARINE_POINT_CANDIDATES) {
      const pixel = toTilePixel(candidate.latitude, candidate.longitude, CMEMS_ZOOM);
      expect(pixel.i).toBeGreaterThanOrEqual(0);
      expect(pixel.i).toBeLessThan(TILE_SIZE_PX);
      expect(pixel.j).toBeGreaterThanOrEqual(0);
      expect(pixel.j).toBeLessThan(TILE_SIZE_PX);
      expect(pixel.tileCol).toBeGreaterThanOrEqual(0);
      expect(pixel.tileRow).toBeGreaterThanOrEqual(0);
    }
  });

  it('keeps the pixel error far below every basin snap ceiling', () => {
    // The runtime snap guard fires on a WRONG CELL, not on projection noise: our own pixel
    // error at zoom 12 must sit an order of magnitude under the tightest basin ceiling, or the
    // guard could not distinguish arithmetic bugs from its own noise floor.
    for (const candidate of MARINE_POINT_CANDIDATES) {
      const route = CMEMS_BASIN_ROUTING[candidate.seaBasin];
      const pixelHalfDiagonalKm =
        (groundResolutionMetres(candidate.latitude, CMEMS_ZOOM) * Math.SQRT2) / 2 / 1000;
      expect(pixelHalfDiagonalKm * 10).toBeLessThan(route.maxGridDistanceKm);
    }
  });
});

describe('toTilePixel guards', () => {
  it('refuses a non-integer or negative zoom', () => {
    expect(() => toTilePixel(41, 29, 2.5)).toThrow(/zoom/);
    expect(() => toTilePixel(41, 29, -1)).toThrow(/zoom/);
  });

  it('clamps polar latitudes to the projection limit instead of an unreachable Mercator y', () => {
    // The DOCUMENTED behaviour is the clamp itself: a pole computes exactly what the ±85.0511°
    // limit computes. The exact tile index AT the limit is float-edge territory (y lands within
    // one ulp of the pyramid boundary), which no working code path reaches — every marine point
    // is ~36–43° N — so the invariant pinned here is clamp-equivalence, not a boundary index.
    const maxLatitude = 85.0511287798066;
    expect(toTilePixel(90, 0, 3)).toEqual(toTilePixel(maxLatitude, 0, 3));
    expect(toTilePixel(-90, 0, 3)).toEqual(toTilePixel(-maxLatitude, 0, 3));
  });
});

describe('haversineKm', () => {
  it('is zero for identical coordinates and symmetric otherwise', () => {
    expect(haversineKm(41.1, 39.72, 41.1, 39.72)).toBe(0);
    const forward = haversineKm(41.1, 39.72, 41.1000000670716, 39.725);
    const backward = haversineKm(41.1000000670716, 39.725, 41.1, 39.72);
    expect(forward).toBeCloseTo(backward, 12);
    expect(forward).toBeGreaterThan(0);
  });
});
