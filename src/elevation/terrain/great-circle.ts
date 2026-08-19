/**
 * Great-circle geometry for the elevation profile: how long is this line, and where are the
 * N points along it?
 *
 * Pure and dependency-free. The web repo has its own copy of the distance formula for the
 * measurement tools (`lib/map/measure.ts`, Vera's leg) — that is duplication by DESIGN, not
 * by accident: the two run in different processes and one cannot import the other, and the
 * shared alternative is a published package nobody wants to own. What must not diverge is
 * the RESULT, so both sides use the same mean-radius constant, stated below.
 */

/**
 * Mean Earth radius, kilometres (IUGG R1). Not the equatorial radius.
 *
 * The choice matters more than it looks: over Türkiye's ~1500 km diagonal, using the
 * equatorial radius instead would stretch every distance by ~0.1 % (~1.6 km on that
 * diagonal). That is invisible on a chart and very visible when a student compares our
 * number against another site's.
 */
export const EARTH_MEAN_RADIUS_KM = 6371.0088;

export interface GeoPoint {
  readonly lat: number;
  readonly lon: number;
}

/** One sampled point on the line, with how far along it sits. */
export interface LineSample extends GeoPoint {
  readonly distanceKm: number;
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function toDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}

/**
 * Great-circle distance between two points, in kilometres.
 *
 * Haversine rather than the spherical law of cosines: the latter loses precision for small
 * separations (its `acos` argument approaches 1 and float cancellation eats the answer),
 * and small separations are the NORMAL case here — 200 samples on a 200 km line sit 1 km
 * apart.
 */
export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const deltaLat = toRadians(b.lat - a.lat);
  const deltaLon = toRadians(b.lon - a.lon);

  const h =
    Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;

  // `min(1, …)` guards the domain of `asin`: for antipodal-ish inputs `h` can exceed 1 by a
  // float epsilon and produce NaN — a silent poison value that would flow into every
  // downstream sample rather than failing anywhere visible.
  return 2 * EARTH_MEAN_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Interpolate along the great circle between `a` and `b`.
 *
 * Spherical linear interpolation, NOT linear interpolation of the degree values. Over
 * Türkiye's widest line the two disagree by a few kilometres in the middle of the path,
 * which would place mid-line samples in the wrong valley — the profile would be of a line
 * the student never drew, and every individual number would still look plausible.
 *
 * `fraction` 0 returns `a`, 1 returns `b`.
 */
export function interpolateGreatCircle(a: GeoPoint, b: GeoPoint, fraction: number): GeoPoint {
  const lat1 = toRadians(a.lat);
  const lon1 = toRadians(a.lon);
  const lat2 = toRadians(b.lat);
  const lon2 = toRadians(b.lon);

  const angularDistance =
    2 *
    Math.asin(
      Math.min(
        1,
        Math.sqrt(
          Math.sin((lat2 - lat1) / 2) ** 2 +
            Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon2 - lon1) / 2) ** 2,
        ),
      ),
    );

  // Coincident (or numerically coincident) endpoints: the slerp weights below divide by
  // `sin(angularDistance)`, so this is not a micro-optimisation but the guard that keeps the
  // function from returning NaN for a degenerate line. The endpoint is returned as-is.
  if (angularDistance === 0) {
    return { lat: a.lat, lon: a.lon };
  }

  const weightA = Math.sin((1 - fraction) * angularDistance) / Math.sin(angularDistance);
  const weightB = Math.sin(fraction * angularDistance) / Math.sin(angularDistance);

  const x = weightA * Math.cos(lat1) * Math.cos(lon1) + weightB * Math.cos(lat2) * Math.cos(lon2);
  const y = weightA * Math.cos(lat1) * Math.sin(lon1) + weightB * Math.cos(lat2) * Math.sin(lon2);
  const z = weightA * Math.sin(lat1) + weightB * Math.sin(lat2);

  return {
    lat: toDegrees(Math.atan2(z, Math.sqrt(x * x + y * y))),
    lon: toDegrees(Math.atan2(y, x)),
  };
}

/**
 * The `count` sample points of one line, endpoints included, evenly spaced by ANGLE.
 *
 * Even angular spacing is even ground spacing on a sphere, so `distanceKm` comes out as a
 * uniform ramp from 0 to the line's length. That uniformity is what lets the chart plot the
 * elevations against an axis without carrying a second array of positions.
 *
 * `count` must be at least 2 — a profile with fewer points is not a cross-section, and
 * accepting 1 here would push a nonsense case downstream into the tile fetcher.
 */
export function sampleGreatCircleLine(a: GeoPoint, b: GeoPoint, count: number): LineSample[] {
  if (!Number.isInteger(count) || count < 2) {
    throw new RangeError(`sample count must be an integer >= 2, received ${String(count)}`);
  }

  const totalKm = haversineKm(a, b);
  const samples: LineSample[] = [];

  for (let index = 0; index < count; index += 1) {
    const fraction = index / (count - 1);
    const point = interpolateGreatCircle(a, b, fraction);
    samples.push({ lat: point.lat, lon: point.lon, distanceKm: totalKm * fraction });
  }

  return samples;
}
