/**
 * Geometry primitives shared by the probe and the offline assertions.
 *
 * The tile/pixel arithmetic and the haversine MOVED to `src/marine/cmems/cmems-geo.ts` in M4a
 * — the runtime CMEMS adapter needs them, and the runtime and the probe must share ONE
 * implementation (a probe that proves a different formula than the one serving requests proves
 * nothing). They are re-exported here so the M1 probe/assertion tooling keeps its import
 * paths; the import direction (database → marine) is the established one.
 *
 * The bounding-box check stays here: it is probe-assertion vocabulary only.
 */

export {
  TILE_SIZE_PX,
  haversineKm,
  tilePixelCenterLatLon,
  toTilePixel,
  type TilePixel,
} from '../../marine/cmems/cmems-geo';

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
