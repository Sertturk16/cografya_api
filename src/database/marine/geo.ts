/**
 * Geometry primitives shared by the probe and the offline assertions.
 *
 * Kept dependency-free and pure so the unit suite can exercise them against synthetic inputs
 * with no network and no database (repo playbook §8: a module that needs no database belongs
 * in the unit job, not the Testcontainers one).
 */

/** WMTS tiles are 256 px square in every EPSG:3857 tile matrix set we use. */
export const TILE_SIZE_PX = 256;

/** Mean Earth radius, km (IUGG). Used by {@link haversineKm}. */
const EARTH_RADIUS_KM = 6371.0088;

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

  const maxLatitude = 85.0511287798066;
  const clampedLatitude = Math.min(maxLatitude, Math.max(-maxLatitude, latitude));
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

/** An inclusive lat/lon box. Used for the coarse basin-containment assertion. */
export interface BoundingBox {
  minLatitude: number;
  maxLatitude: number;
  minLongitude: number;
  maxLongitude: number;
}

export function isInsideBoundingBox(
  latitude: number,
  longitude: number,
  box: BoundingBox,
): boolean {
  return (
    latitude >= box.minLatitude &&
    latitude <= box.maxLatitude &&
    longitude >= box.minLongitude &&
    longitude <= box.maxLongitude
  );
}
