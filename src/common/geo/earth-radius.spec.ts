import { describe, expect, it } from '@jest/globals';
import { EARTH_MEAN_RADIUS_KM, GRID_MAPPING_EARTH_RADIUS_KM } from './earth-radius';

/**
 * Pins BOTH constants and the RELATIONSHIP between them.
 *
 * Every distance assertion elsewhere in this repo is scale-invariant — symmetry, the triangle
 * inequality, "closer than the threshold", "the recompute agrees with the record" — so none of
 * them can see a change to either number. This file is where a change has to be argued.
 */
describe('earth radius constants', () => {
  it('pins the published geodesic radius (IUGG R1)', () => {
    // `cografya_web/lib/map/measure.ts` must hold this same value: the two repos run the same
    // formula in different processes and neither can import the other.
    expect(EARTH_MEAN_RADIUS_KM).toBe(6371.0088);
  });

  it('pins the grid-mapping radius the three ingest lines were committed against', () => {
    expect(GRID_MAPPING_EARTH_RADIUS_KM).toBe(6371);
  });

  it('keeps the two within the band that makes nearest-cell mapping indifferent', () => {
    // The whole argument for the second constant is that the RATIO is tiny enough for cell
    // selection and large enough to break a 1 mm recompute tolerance on a sub-kilometre
    // distance. Both halves are asserted so neither can be edited without the other's reason.
    const ratio = EARTH_MEAN_RADIUS_KM / GRID_MAPPING_EARTH_RADIUS_KM - 1;
    expect(ratio).toBeGreaterThan(0);
    expect(ratio).toBeLessThan(1e-5);

    // The measured worst distance in the committed ACAG artifact, and the tolerance that
    // re-derivation is graded against. Harmonising the ingest lines onto the published radius
    // leaves 2.4 % of that tolerance — the number this file's docblock refuses to build on.
    const worstAcagDistanceKm = 0.7065127166625923;
    const acagRecomputeToleranceKm = 1e-6;
    expect(worstAcagDistanceKm * ratio).toBeLessThan(acagRecomputeToleranceKm);
    expect(worstAcagDistanceKm * ratio).toBeGreaterThan(acagRecomputeToleranceKm * 0.9);
  });
});
