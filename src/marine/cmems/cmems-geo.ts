/**
 * EPSG:3857 tile/pixel arithmetic and the great-circle distance — the geometry the CMEMS
 * WMTS adapter stands on.
 *
 * MOVED here from `src/database/marine/geo.ts` in M4a, unchanged: the M1 probe wrote this
 * arithmetic first, and the runtime adapter must use the SAME implementation the committed
 * probe artifact was produced with — a second copy is exactly the drift class review A-1
 * rejected. `src/database/marine/geo.ts` re-exports these for the probe/assertion tooling, so
 * the import direction stays database → marine (the established one; `marine-candidates.ts`
 * imports `marine.types` the same way) and there is ONE implementation.
 *
 * Kept dependency-free and pure so the unit suite can exercise it against synthetic inputs
 * with no network and no database (repo playbook §8) — the one import below is a bare numeric
 * constant, which changes neither property.
 */

import { EARTH_MEAN_RADIUS_KM } from '../../common/geo/earth-radius';

/** WMTS tiles are 256 px square in every EPSG:3857 tile matrix set we use. */
export const TILE_SIZE_PX = 256;

/**
 * Mean Earth radius, km (IUGG R1). Used by {@link haversineKm}.
 *
 * Imported rather than declared: the value and the argument for it live once, in
 * `src/common/geo/earth-radius.ts`. The distances this module produces are PUBLISHED
 * (`MarineValueDto.distanceKm`), which is the half of that file's rule this leg falls under.
 */
const EARTH_RADIUS_KM = EARTH_MEAN_RADIUS_KM;

/** Web Mercator's reachable latitude limit; poles map to `y → ±∞`. */
const MAX_MERCATOR_LATITUDE = 85.0511287798066;

/**
 * A pixel address inside the EPSG:3857 tile pyramid: which tile, and where in it.
 *
 * `i` counts pixels east from the tile's left edge, `j` counts pixels SOUTH from its top edge
 * — that is the WMTS convention and it is the opposite vertical direction from latitude, which
 * is the classic place to introduce a mirrored-north bug.
 */
export interface TilePixel {
  tileCol: number;
  tileRow: number;
  i: number;
  j: number;
}

/**
 * Convert a WGS84 coordinate to its EPSG:3857 tile + in-tile pixel at the given zoom.
 *
 * Standard Web Mercator: longitude is linear, latitude goes through the Gudermannian
 * (`ln(tan φ + sec φ)`). Poles are unreachable in Mercator (`y → ±∞`), so latitude is clamped
 * to the projection's ±85.0511° limit; every Turkish coastal point is ~36–43° N, so the clamp
 * is a guard, never a working code path.
 *
 * `i`/`j` are clamped to `TILE_SIZE_PX - 1` because a coordinate that lands exactly on a tile's
 * right/bottom edge would otherwise index pixel 256, which does not exist in that tile.
 */
export function toTilePixel(latitude: number, longitude: number, zoom: number): TilePixel {
  if (!Number.isInteger(zoom) || zoom < 0) {
    throw new Error(`zoom must be a non-negative integer, got ${zoom}`);
  }

  const clampedLatitude = Math.min(
    MAX_MERCATOR_LATITUDE,
    Math.max(-MAX_MERCATOR_LATITUDE, latitude),
  );
  const scale = 2 ** zoom;

  const x = ((longitude + 180) / 360) * scale;
  const latitudeRad = (clampedLatitude * Math.PI) / 180;
  const y =
    ((1 - Math.log(Math.tan(latitudeRad) + 1 / Math.cos(latitudeRad)) / Math.PI) / 2) * scale;

  const tileCol = Math.floor(x);
  const tileRow = Math.floor(y);

  return {
    tileCol,
    tileRow,
    i: Math.min(TILE_SIZE_PX - 1, Math.floor((x - tileCol) * TILE_SIZE_PX)),
    j: Math.min(TILE_SIZE_PX - 1, Math.floor((y - tileRow) * TILE_SIZE_PX)),
  };
}

/**
 * The WGS84 coordinate of a tile pixel's CENTRE — the exact inverse of {@link toTilePixel}.
 *
 * Exists for the unit suite: the offline form of the snap guard is "every reference point
 * round-trips through the pixel address to a centre no further away than one pixel's
 * diagonal". That is the invariant a wrong-cell bug (mirrored north, swapped i/j, an
 * off-by-one on the tile row) breaks first, and it needs no provider to check.
 */
export function tilePixelCenterLatLon(
  pixel: TilePixel,
  zoom: number,
): { latitude: number; longitude: number } {
  const scale = 2 ** zoom;
  const x = (pixel.tileCol + (pixel.i + 0.5) / TILE_SIZE_PX) / scale;
  const y = (pixel.tileRow + (pixel.j + 0.5) / TILE_SIZE_PX) / scale;
  return {
    longitude: x * 360 - 180,
    latitude: (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI,
  };
}

/**
 * Great-circle distance between two WGS84 coordinates, km.
 *
 * Haversine on a spherical Earth. The error against an ellipsoidal model is ~0.3 %, i.e. a few
 * metres over the ≤ 8 km distances this is used for — far below the thresholds it feeds.
 */
export function haversineKm(
  fromLatitude: number,
  fromLongitude: number,
  toLatitude: number,
  toLongitude: number,
): number {
  const toRad = (degrees: number): number => (degrees * Math.PI) / 180;

  const dLat = toRad(toLatitude - fromLatitude);
  const dLon = toRad(toLongitude - fromLongitude);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(fromLatitude)) * Math.cos(toRad(toLatitude)) * Math.sin(dLon / 2) ** 2;

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}
