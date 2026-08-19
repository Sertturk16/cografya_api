/**
 * Web Mercator tile arithmetic for the terrain (terrarium) tile pyramid.
 *
 * Pure, dependency-free, and deliberately NOT parameterised beyond what the profile leg
 * needs: one tile size, one projection, one zoom constant. Nothing here reaches the network
 * or knows what a profile is.
 *
 * ## The zoom is a LICENCE constant, not a performance knob
 * `TERRAIN_SAMPLE_ZOOM = 12` is fixed in code and deliberately NOT an environment variable.
 * The measurement behind that (`Owner's Inbox/cbs-p2/SPEC.md` §8.2) found ETOPO1 in the tile
 * mix at z <= 10 and absent at z >= 11, with the sea reading a flat 0.00 m from z11 up. Pinning
 * z12 therefore does three things at once: it keeps NOAA's "Not to be used for navigation"
 * limit from ever arising, it removes the ETOPO1 attribution line from what we owe, and it
 * still matches EU-DEM's ~25 m native resolution over Türkiye (z12 ≈ 30 m/px at 39° N).
 *
 * An operator who could set `ELEVATION_ZOOM=10` would silently pull a fourth data source into
 * the mix and put the published page in breach while every test stayed green. That is why the
 * number lives here, beside the reason.
 */

/** Pixels per tile edge. The terrain tiles are 256×256 (measured, SPEC §7.3). */
export const TILE_SIZE = 256;

/** The one zoom this service samples at. See the licence note above before changing it. */
export const TERRAIN_SAMPLE_ZOOM = 12;

/**
 * Web Mercator's latitude cut-off — the projection is undefined at the poles.
 *
 * `atan(sinh(pi))` in degrees. Türkiye sits nowhere near it, so this guard never fires in
 * production; it exists so the function is total rather than returning `Infinity` for an
 * input nobody validated yet.
 */
export const WEB_MERCATOR_MAX_LATITUDE = 85.0511287798066;

/** A point's home tile plus its position INSIDE that tile, in fractional pixels. */
export interface TilePixelPosition {
  readonly tileX: number;
  readonly tileY: number;
  /**
   * 0 … TILE_SIZE, fractional. The pixel CENTRE of column `i` is at `i + 0.5`.
   *
   * The upper bound is INCLUSIVE for the one coordinate that sits exactly on the pyramid's
   * far edge (lon +180, or the Mercator latitude limit): its tile index is clamped to the
   * last tile, which puts it at that tile's outer boundary. `bilinearSample` clamps there,
   * so the value comes from the last cell rather than from a tile that does not exist.
   */
  readonly pixelX: number;
  readonly pixelY: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Tiles per axis at `zoom`. */
export function tilesPerAxis(zoom: number): number {
  return 2 ** zoom;
}

/**
 * Cache/identity key for one tile. `z/x/y`, the same order the provider's URL uses, so a key
 * in a log line can be pasted into a URL without re-ordering it.
 */
export function tileKey(zoom: number, tileX: number, tileY: number): string {
  return `${String(zoom)}/${String(tileX)}/${String(tileY)}`;
}

/**
 * Where does this coordinate live in the tile pyramid?
 *
 * Longitude is NOT wrapped and latitude is clamped rather than rejected: this module is
 * arithmetic, and the decision about which coordinates are acceptable belongs to the request
 * DTO that validates them. Clamping keeps the return type total; a caller that wants a
 * refusal validates first.
 */
export function lonLatToTilePixel(lon: number, lat: number, zoom: number): TilePixelPosition {
  const axis = tilesPerAxis(zoom);
  const maxPixel = axis * TILE_SIZE;

  const safeLat = clamp(lat, -WEB_MERCATOR_MAX_LATITUDE, WEB_MERCATOR_MAX_LATITUDE);
  const latRad = (safeLat * Math.PI) / 180;

  const globalX = ((lon + 180) / 360) * maxPixel;
  const globalY =
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * maxPixel;

  const clampedX = clamp(globalX, 0, maxPixel);
  const clampedY = clamp(globalY, 0, maxPixel);

  // Clamp the TILE INDEX, not the pixel position. lon exactly +180 lands on `maxPixel`, which
  // floors to index `axis` — one past the last tile, i.e. a 404 for a perfectly legal
  // coordinate. The obvious fix, nudging the pixel down by `Number.EPSILON`, is a NO-OP here
  // and was caught by this module's own edge test: `EPSILON` is an epsilon at magnitude 1,
  // while these values run to ~1e6 where one ULP is ~1e-10, so the subtraction changes
  // nothing at all. Clamping the integer index is magnitude-independent.
  const tileX = Math.min(Math.floor(clampedX / TILE_SIZE), axis - 1);
  const tileY = Math.min(Math.floor(clampedY / TILE_SIZE), axis - 1);

  return {
    tileX,
    tileY,
    pixelX: clampedX - tileX * TILE_SIZE,
    pixelY: clampedY - tileY * TILE_SIZE,
  };
}

/**
 * The inverse of {@link lonLatToTilePixel}, from a tile plus an in-tile pixel offset.
 *
 * Production does not need this — the sampling path only ever goes coordinate → pixel. It
 * exists because it is what makes the forward transform TESTABLE as a round trip: a sign
 * error or a swapped axis in the forward function is invisible against hand-computed
 * expectations that were derived with the same wrong reasoning, and obvious the moment the
 * pair has to close on itself.
 */
export function tilePixelToLonLat(
  tileX: number,
  tileY: number,
  pixelX: number,
  pixelY: number,
  zoom: number,
): { lon: number; lat: number } {
  const axis = tilesPerAxis(zoom);
  const maxPixel = axis * TILE_SIZE;

  const globalX = tileX * TILE_SIZE + pixelX;
  const globalY = tileY * TILE_SIZE + pixelY;

  const lon = (globalX / maxPixel) * 360 - 180;
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * globalY) / maxPixel))) * 180) / Math.PI;

  return { lon, lat };
}

/**
 * Ground size of one tile edge, in kilometres, at a given latitude.
 *
 * Reporting/planning arithmetic — the sampling path never calls it. It is exported because
 * the probe uses it to state a measured tile count against a predicted one, and because the
 * plan's cost table (`plan-api.md` §4.3) is built from exactly this formula: an unchecked
 * number in a plan is worth less than one a reader can re-derive.
 */
export function tileWidthKmAtLatitude(lat: number, zoom: number): number {
  const EQUATORIAL_CIRCUMFERENCE_KM = 40075.016686;
  return (EQUATORIAL_CIRCUMFERENCE_KM * Math.cos((lat * Math.PI) / 180)) / tilesPerAxis(zoom);
}
