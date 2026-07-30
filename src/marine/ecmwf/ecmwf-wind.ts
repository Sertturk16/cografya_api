/**
 * Wind speed and direction from the model's vector components.
 *
 * ## This is the first degree Faz-1 converts, and the first one it can get backwards
 * SPEC-ADDENDUM §5.3 could say "Faz-1 converts zero degrees" because both original providers
 * published a bearing directly. ECMWF does not: it publishes `10u` and `10v`, the eastward and
 * northward components in m/s, and the bearing is arithmetic WE perform. A sign error here
 * produces a number in [0, 360) that is exactly 180° wrong — the textbook "silently wrong while
 * every test is green" defect, and the reason the arrow-unlock condition published in
 * `MarineLayerDto.directionConvention` names a three-layer regression suite rather than a code
 * review.
 *
 * ## The convention, and the primary sources for it
 * We publish the METEOROLOGICAL convention: degrees true, clockwise from north, naming the
 * direction the wind COMES FROM. ECMWF's own parameter database was quoted for both halves of
 * the derivation (olcumler.md §M3):
 * - `10u` (paramId 165) is "the horizontal speed of air moving TOWARDS THE EAST";
 * - `10v` (paramId 166) is the speed of air moving "TOWARDS THE NORTH";
 * - `mwd` (paramId 140230) is already "degree true … zero means COMING FROM THE NORTH", which is
 *   why wave direction is published untouched and does not pass through this file at all.
 *
 * Hence the negations: a wind blowing towards the east (u = +10, v = 0) comes FROM the west, and
 * must publish 270°.
 *
 * > **Warning for a future scope change:** the same ECMWF page records that wave SPECTRUM fields
 * > (`h1012`…`h2530`) use the OPPOSITE, oceanographic convention — zero means propagating
 * > TOWARDS the north. Faz-1 fetches none of them. Anyone adding one must revisit the convention
 * > rather than assume the wave family agrees with itself.
 */

/**
 * Wind speed, m/s: the magnitude of the vector. `null` when either component is missing.
 *
 * Never negative and never smaller than either component in absolute value — two invariants the
 * regression suite asserts, because they are the cheapest way to catch a component being dropped
 * or a square root taken of the wrong thing.
 */
export function deriveWindSpeed(u: number | null, v: number | null): number | null {
  if (!isUsable(u) || !isUsable(v)) return null;
  return Math.sqrt(u * u + v * v);
}

/**
 * Wind direction in degrees true, clockwise, in [0, 360) — the direction the wind COMES FROM.
 * `null` when either component is missing.
 *
 * ## `null` in, `null` out — never 0
 * A missing component must not become "north". 0° is a legitimate published bearing, so a
 * default of 0 for absent data is indistinguishable from a real northerly and would be rendered
 * as a confident arrow pointing at nothing.
 *
 * ## The dead-calm case returns 0, deliberately
 * `u = v = 0` has no defined bearing, and `atan2(0, 0)` is 0. We publish that 0 rather than a
 * `null`, because the contract already has a purpose-built interlock for it: `calmThreshold`
 * (0.5 m/s) sits on `wind_speed_10m` and governs whether the paired direction is drawn at all,
 * so a zero-speed sample never reaches the screen as an arrow. Returning `null` here would
 * instead invent a fourth state — "value present, direction absent, status ok" — that every
 * downstream status mapping would have to carry for a case the display already handles.
 */
export function deriveWindDirection(u: number | null, v: number | null): number | null {
  if (!isUsable(u) || !isUsable(v)) return null;
  const degrees = (Math.atan2(-u, -v) * 180) / Math.PI;
  const normalised = (degrees + 360) % 360;
  // `(-0 + 360) % 360` is 0, but `359.9999999999999 % 360` can round UP to 360 on the way through
  // a float, and 360 is outside the published [0, 360) range. Fold it explicitly.
  return normalised >= 360 ? 0 : normalised;
}

/** A component we can compute with: present, and a real number (the decoder marks gaps as NaN). */
function isUsable(component: number | null): component is number {
  return component !== null && Number.isFinite(component);
}
