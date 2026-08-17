import { TR_BOUNDARY_BBOX, TR_BOUNDARY_RINGS } from './tr-boundary.generated';

/**
 * "Is this event near enough to Türkiye to belong on the page?" — in pure TypeScript.
 *
 * ## Why geometry rather than the provider's own field
 * AFAD fills `province` on EVERY event, including ones in other countries: it means "the nearest
 * Turkish province", not "where this happened" (SPEC §3.5). `QUESTIONS.md` D-1 therefore forbids
 * scoping on it, and D-B answers with a distance to the national outline. The buffer is **200 km**
 * (`DEC 2026-08-17k` md.4, superseding `DEC 2026-08-12k` D-B's 150 km), configured as
 * `EARTHQUAKE_SCOPE_BUFFER_KM` rather than hard-coded here.
 *
 * ## No PostGIS, no geo library, and that is a size decision
 * The outline is 3 rings and 562 vertices. Point-in-polygon plus a point-to-segment distance is
 * about sixty lines; a spatial extension or a dependency would be machinery for a problem that
 * fits on a screen (`ENGINEERING.md` §12's YAGNI default).
 *
 * ## The projection, and why it is honest at this scale
 * Distances use a local equirectangular projection centred on the QUERY point: one degree of
 * latitude is 110.574 km, one of longitude is 111.320·cos(lat) km. Its error grows with the span
 * being measured, and we only ever measure short spans — the answer is thrown away as soon as it
 * exceeds the buffer. A great-circle formula would be more precise about distances we do not use.
 */

/** km per degree of latitude, and the equatorial km per degree of longitude. */
const KM_PER_DEGREE_LAT = 110.574;
const KM_PER_DEGREE_LON_AT_EQUATOR = 111.32;

/**
 * Distance from a point to Türkiye's outline, in km — **0 when the point is inside**.
 *
 * Inside means inside, not "0 km from the border": an event in Konya is in Türkiye, and reporting
 * its 300 km to the nearest coast as a scope distance would be arithmetically true and completely
 * useless. Rings are tested with a ray cast and toggled, so an inner ring (a hole) correctly flips
 * the verdict back to outside.
 */
export function distanceToTrBoundaryKm(longitude: number, latitude: number): number {
  let inside = false;
  for (const ring of TR_BOUNDARY_RINGS) {
    if (pointInRing(longitude, latitude, ring)) inside = !inside;
  }
  if (inside) return 0;

  let nearest = Number.POSITIVE_INFINITY;
  for (const ring of TR_BOUNDARY_RINGS) {
    const distance = distanceToRingKm(longitude, latitude, ring);
    if (distance < nearest) nearest = distance;
  }
  return nearest;
}

/**
 * The scope test: inside Türkiye, or within `bufferKm` of it.
 *
 * The bounding-box pre-filter in front is not an optimisation for its own sake — every ingested
 * event runs this, and the backfill runs it tens of thousands of times. It is deliberately
 * GENEROUS: the box is grown by the buffer plus a margin, using the longitude scale at the
 * latitude furthest from the equator, so it can never reject a point the full computation would
 * have accepted. (A pre-filter that is wrong in the other direction is a silent data loss, which
 * is why the unit spec pins exactly that direction.)
 */
export function isWithinTrScope(longitude: number, latitude: number, bufferKm: number): boolean {
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return false;
  if (bufferKm < 0) return false;

  const latitudePad = bufferKm / KM_PER_DEGREE_LAT;
  const widestLatitude = Math.min(
    89,
    Math.max(Math.abs(TR_BOUNDARY_BBOX.minLat), Math.abs(TR_BOUNDARY_BBOX.maxLat)) + latitudePad,
  );
  const longitudePad =
    bufferKm / (KM_PER_DEGREE_LON_AT_EQUATOR * Math.cos(toRadians(widestLatitude)));

  if (
    longitude < TR_BOUNDARY_BBOX.minLon - longitudePad ||
    longitude > TR_BOUNDARY_BBOX.maxLon + longitudePad ||
    latitude < TR_BOUNDARY_BBOX.minLat - latitudePad ||
    latitude > TR_BOUNDARY_BBOX.maxLat + latitudePad
  ) {
    return false;
  }

  return distanceToTrBoundaryKm(longitude, latitude) <= bufferKm;
}

/**
 * Ray-casting point-in-ring over a FLAT `[lon, lat, …]` ring.
 *
 * Exported so the spec can exercise it on synthetic rings: asserting geometry against the real
 * outline would be asserting a geographic FACT, which `CONVENTIONS.md` §2 keeps out of tests.
 */
export function pointInRing(longitude: number, latitude: number, ring: readonly number[]): boolean {
  let inside = false;
  const vertexCount = Math.floor(ring.length / 2);
  for (let index = 0, previous = vertexCount - 1; index < vertexCount; previous = index++) {
    const currentLon = ring[index * 2];
    const currentLat = ring[index * 2 + 1];
    const previousLon = ring[previous * 2];
    const previousLat = ring[previous * 2 + 1];
    if (
      currentLon === undefined ||
      currentLat === undefined ||
      previousLon === undefined ||
      previousLat === undefined
    ) {
      continue;
    }
    const straddles = currentLat > latitude !== previousLat > latitude;
    if (!straddles) continue;
    const crossingLon =
      ((previousLon - currentLon) * (latitude - currentLat)) / (previousLat - currentLat) +
      currentLon;
    if (longitude < crossingLon) inside = !inside;
  }
  return inside;
}

/** Shortest distance from a point to any segment of one flat ring, in km. */
export function distanceToRingKm(
  longitude: number,
  latitude: number,
  ring: readonly number[],
): number {
  let nearest = Number.POSITIVE_INFINITY;
  for (let index = 0; index + 3 < ring.length; index += 2) {
    const aLon = ring[index];
    const aLat = ring[index + 1];
    const bLon = ring[index + 2];
    const bLat = ring[index + 3];
    if (aLon === undefined || aLat === undefined || bLon === undefined || bLat === undefined) {
      continue;
    }
    const distance = distanceToSegmentKm(longitude, latitude, aLon, aLat, bLon, bLat);
    if (distance < nearest) nearest = distance;
  }
  return nearest;
}

/** Point-to-segment distance in km, in the query point's own local projection. */
export function distanceToSegmentKm(
  longitude: number,
  latitude: number,
  aLon: number,
  aLat: number,
  bLon: number,
  bLat: number,
): number {
  const kx = KM_PER_DEGREE_LON_AT_EQUATOR * Math.cos(toRadians(latitude));
  const ky = KM_PER_DEGREE_LAT;

  const ax = (aLon - longitude) * kx;
  const ay = (aLat - latitude) * ky;
  const bx = (bLon - longitude) * kx;
  const by = (bLat - latitude) * ky;

  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(ax, ay);

  // Project the origin (the query point) onto the segment, clamped to its ends.
  const t = Math.min(1, Math.max(0, -(ax * dx + ay * dy) / lengthSquared));
  return Math.hypot(ax + t * dx, ay + t * dy);
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}
