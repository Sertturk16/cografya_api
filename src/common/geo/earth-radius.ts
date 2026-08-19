/**
 * The Earth radius constants this repository computes distances with — ONE file, so the choice
 * is made in one place and its consequences are written beside it.
 *
 * ## Why this file exists
 * Four modules held the constant as a local literal and they did not agree: `cmems-geo.ts` and
 * the elevation `great-circle.ts` used 6371.0088, while `cams-grid.ts`, `era5-grid.ts` and
 * `acag-grid.ts` used 6371. `era5-grid.ts` additionally CLAIMED in a comment that
 * `marine/geo.ts` used its value, which was measurably false — that module re-exports
 * `cmems-geo`'s haversine, i.e. the other value (measured 2026-08-19). A scattered constant plus
 * a wrong comment is how a well-meant "harmonise the numbers" commit lands on the wrong side of
 * a fidelity check, and the elevation spec had already recorded that risk in writing
 * (`great-circle.spec.ts`, review #122 TA122-I2). Both values now live here, named, with the
 * measurement that separates them.
 *
 * ## Why there are two values and not one
 * They answer different questions, and the second is NOT a rounding of the first that anybody is
 * free to tidy away:
 *
 * - {@link EARTH_MEAN_RADIUS_KM} is used wherever a distance is **published** as a geodesic
 *   result or must agree with a second implementation (the web repo's `lib/map/measure.ts` holds
 *   the same formula for the measurement tools). There the exact value is part of the answer: at
 *   the equatorial radius instead, the İzmir–Van line moves +1.58 km, and every scale-invariant
 *   test in the suite stays green.
 * - {@link GRID_MAPPING_EARTH_RADIUS_KM} is used by the three grid-cell-mapping lines, where the
 *   distance decides only WHICH cell a province reads from and is then recorded beside the value.
 *   Nearest-cell RANKING is invariant under a positive scale factor, so the two values choose the
 *   same cell everywhere — the number buys nothing there, and changing it costs something real:
 *
 *   **Measured, 2026-08-19.** `acag-assertions.ts` re-derives every province's `cellDistanceKm`
 *   from the committed artifact's own coordinates and refuses a disagreement above
 *   `RECOMPUTE_TOLERANCE_KM = 1e-6` km (1 mm). Moving that line to 6371.0088 shifts every
 *   recomputed distance by a factor of 1.3812e-6; the committed artifact's widest distance is
 *   0.70651 km (`data/acag-pm25/acag-province-pm25.json`, 81 rows), which drifts by 9.758e-7 km
 *   — inside the tolerance by 2.4 %. A fidelity gate surviving on 24 nanometres of margin is not
 *   a gate. `distance_km` is also a PUBLISHED column (`numeric(8,4)`), so the change would
 *   rewrite published values on the next ingest to buy nothing a reader can see.
 *
 * The rule that follows, and the reason this paragraph is here rather than in a commit message:
 * **a line moves from the second constant to the first only together with a re-run of its own
 * fidelity gate**, never as a tidy-up.
 */

/**
 * Mean Earth radius, kilometres (IUGG R1) — the value for every PUBLISHED geodesic distance and
 * for anything the web repo must agree with. Not the equatorial radius.
 */
export const EARTH_MEAN_RADIUS_KM = 6371.0088;

/**
 * The rounded radius the three grid-cell-mapping lines were measured, committed and asserted
 * against (`cams-grid.ts`, `era5-grid.ts`, `acag-grid.ts`).
 *
 * See the file docblock for why this is a deliberate second value rather than an inconsistency
 * waiting to be tidied, and for the measurement that decides it.
 */
export const GRID_MAPPING_EARTH_RADIUS_KM = 6371;
