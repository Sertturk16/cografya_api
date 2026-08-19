import { AcagContractError } from './acag.errors';

/**
 * Direction-aware grid arithmetic + the two binding guards, for the ACAG 0.01° grid.
 *
 * ## Why this is a THIRD copy and not a shared module
 * `cams-grid.ts` (0.1°, DESCENDING latitude, 0…360 longitude) and `era5-grid.ts` already carry
 * the same three ideas against different provider conventions. Extracting a shared module was
 * explicitly ruled out of this task's scope (plan §1.2): a refactor the goal did not ask for is
 * a deviation, and the three axes genuinely differ. What IS shared is the discipline below.
 *
 * ## The silent-failure classes this file exists for
 * 1. **Axis direction.** ACAG's latitude axis ASCENDS (measured: −59.995 → 69.995, step +0.01) —
 *    the opposite of CAMS. So the step is derived FROM the axis, with its sign, and `0.01` is
 *    never hardcoded. The provider's own `LAT_DELTA`/`LON_DELTA` attributes are deliberately NOT
 *    trusted for this: an attribute is a claim about the data, the axis IS the data.
 * 2. **Registration.** Cell centres sit at x.xx5 (measured: 35.005, 35.015, …). Nothing here
 *    assumes that; origin and step come from the file, so a provider shift to x.xx0 centres maps
 *    correctly by construction and stays bounded by the read-back guard.
 * 3. **Window offset.** We read a HYPERSLAB, not the whole array (the global file is 468M cells).
 *    The axes handed to this module are the WINDOW's axes, so every index it returns is
 *    window-relative. Mixing a window-relative index with a full-array axis is exactly the
 *    "plausible number from the wrong place" failure, which is why the window's own axis slices
 *    travel together with the window's values and nothing here ever sees the full axis.
 *
 * ## Tolerances are DERIVED, never fixed
 * - Equal-step check: max deviation from the median step ≤ 1e-4. The axes are float32, so
 *   consecutive differences are never exactly 0.01 (measured deviation on the real file is
 *   ~1e-6); strict equality would reject a HEALTHY file. 1e-4 is 1/100 of a cell.
 * - Read-back: |axis[i] − requested| ≤ |step|/2 + 1e-4. The additive slack is ~100× the float32
 *   noise and 1/100 of a whole-cell error, so it cannot mask an off-by-one.
 */

/** Max deviation from the median step before an axis is refused. */
export const AXIS_EQUAL_STEP_TOLERANCE = 1e-4;

/** Additive slack on the read-back guard beyond half a step. */
export const READBACK_EXTRA_TOLERANCE = 1e-4;

/**
 * How far either side of the linear estimate the true nearest cell centre is looked for.
 *
 * **This is a correctness requirement, not defensive padding, and it was measured.** The axes are
 * float32 and ~700 cells long inside our window, so `round((requested − first) / step)` is a
 * LINEAR MODEL of an axis that is only approximately linear: the per-step float32 error
 * accumulates, and by the far end of the window the model can name the neighbouring cell. The
 * first real run caught it — Sinop (57), latitude 42.0299, sits 0.0049° from the cell centre
 * 42.025 and 0.0051° from 42.035, and the linear estimate chose 42.035. The read-back guard
 * refused to publish it, which is what that guard is for.
 *
 * A wider tolerance would have "fixed" the symptom by accepting the wrong cell. The honest fix is
 * to make the arithmetic find the actual nearest centre — a bounded scan on a monotonic axis —
 * and to leave the guard exactly as strict as it was. Radius 2 is ~40× the largest drift the
 * accumulated float32 error can produce over this window, and the guard still has the final say.
 */
export const LOCAL_SEARCH_RADIUS = 2;

/** Kilometres per degree of latitude (and of longitude at the equator). */
const KM_PER_DEGREE = 111.32;

export interface AxisAnalysis {
  /** Signed step, derived from the axis itself. */
  step: number;
  first: number;
  last: number;
  length: number;
}

/**
 * Guard 1 — the axis guard. Derives the signed step and refuses a non-monotonic or
 * unevenly-stepped axis.
 */
export function analyseAxis(values: readonly number[], axisName: string): AxisAnalysis {
  if (values.length < 2) {
    throw new AcagContractError(
      `axis "${axisName}" has ${String(values.length)} value(s) — need at least 2 to derive a step.`,
    );
  }
  const first = values[0];
  const second = values[1];
  const last = values[values.length - 1];
  if (first === undefined || second === undefined || last === undefined) {
    throw new AcagContractError(`axis "${axisName}" contains undefined entries.`);
  }

  const steps: number[] = [];
  for (let index = 1; index < values.length; index += 1) {
    const previous = values[index - 1];
    const current = values[index];
    if (previous === undefined || current === undefined) {
      throw new AcagContractError(`axis "${axisName}" contains undefined entries.`);
    }
    if (!Number.isFinite(previous) || !Number.isFinite(current)) {
      throw new AcagContractError(`axis "${axisName}" contains a non-finite value.`);
    }
    steps.push(current - previous);
  }

  const sorted = [...steps].sort((a, b) => a - b);
  const medianStep = sorted[Math.floor(sorted.length / 2)];
  if (medianStep === undefined || medianStep === 0) {
    throw new AcagContractError(`axis "${axisName}" has a zero/undefined median step.`);
  }

  for (const step of steps) {
    if (Math.sign(step) !== Math.sign(medianStep)) {
      throw new AcagContractError(
        `axis "${axisName}" is NOT MONOTONIC (a step of ${String(step)} against a median of ` +
          `${String(medianStep)}).`,
      );
    }
    if (Math.abs(step - medianStep) > AXIS_EQUAL_STEP_TOLERANCE) {
      throw new AcagContractError(
        `axis "${axisName}" is not evenly stepped: step ${String(step)} deviates from the ` +
          `median ${String(medianStep)} by more than ${String(AXIS_EQUAL_STEP_TOLERANCE)}.`,
      );
    }
  }

  return { step: medianStep, first, last, length: values.length };
}

/** The read-back tolerance for a derived step: `|step|/2 + 1e-4`. */
export function readbackToleranceFor(step: number): number {
  return Math.abs(step) / 2 + READBACK_EXTRA_TOLERANCE;
}

export type CoordinateMapping =
  | {
      kind: 'mapped';
      /** Index INTO THE AXIS THAT WAS PASSED IN — window-relative when the axis is a window. */
      index: number;
      /** The axis value actually at that index — the cell-centre coordinate we publish. */
      snapped: number;
    }
  | {
      /** The requested coordinate lies outside the axis coverage. */
      kind: 'outside_domain';
    };

/**
 * Map one requested coordinate onto the axis: direction-aware arithmetic, then Guard 2 — the
 * read-back guard.
 *
 * `outside_domain` is RETURNED (not thrown) when the requested value falls beyond the axis
 * coverage by more than half a cell — on this line that means the window was cut too small, which
 * the caller reports per province rather than as a decode failure. An index that lands IN range
 * but reads back farther than the tolerance is OUR arithmetic being wrong and THROWS.
 */
export function mapCoordinateToIndex(
  axis: readonly number[],
  analysis: AxisAnalysis,
  requested: number,
  axisName: string,
): CoordinateMapping {
  if (!Number.isFinite(requested)) {
    throw new AcagContractError(`"${axisName}": requested coordinate is not a finite number.`);
  }
  const halfCell = Math.abs(analysis.step) / 2;
  const low = Math.min(analysis.first, analysis.last) - halfCell;
  const high = Math.max(analysis.first, analysis.last) + halfCell;
  if (requested < low - READBACK_EXTRA_TOLERANCE || requested > high + READBACK_EXTRA_TOLERANCE) {
    return { kind: 'outside_domain' };
  }

  const estimate = Math.round((requested - analysis.first) / analysis.step);
  if (estimate < -LOCAL_SEARCH_RADIUS || estimate >= axis.length + LOCAL_SEARCH_RADIUS) {
    throw new AcagContractError(
      `"${axisName}": index ${String(estimate)} out of [0, ${String(axis.length)}) for requested ` +
        `${String(requested)} although the value is inside the axis coverage — the arithmetic ` +
        'is broken.',
    );
  }

  // The linear estimate is a SEED, not the answer. Refine it to the truly nearest cell centre by
  // scanning its immediate neighbours — see LOCAL_SEARCH_RADIUS for why this is required rather
  // than defensive.
  let index = -1;
  let snapped = Number.NaN;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (
    let candidate = estimate - LOCAL_SEARCH_RADIUS;
    candidate <= estimate + LOCAL_SEARCH_RADIUS;
    candidate += 1
  ) {
    if (candidate < 0 || candidate >= axis.length) continue;
    const value = axis[candidate];
    if (value === undefined) continue;
    const distance = Math.abs(value - requested);
    if (distance < bestDistance) {
      bestDistance = distance;
      index = candidate;
      snapped = value;
    }
  }
  if (index === -1 || !Number.isFinite(snapped)) {
    throw new AcagContractError(
      `"${axisName}": no axis value near index ${String(estimate)} for requested ` +
        `${String(requested)}.`,
    );
  }
  const tolerance = readbackToleranceFor(analysis.step);
  if (Math.abs(snapped - requested) > tolerance) {
    throw new AcagContractError(
      `"${axisName}" READ-BACK GUARD: axis[${String(index)}] = ${String(snapped)} is ` +
        `${String(Math.abs(snapped - requested))}° from the requested ${String(requested)} ` +
        `(tolerance ${String(tolerance)}) — wrong cell; refusing to publish a plausible number ` +
        'from the wrong place.',
    );
  }
  return { kind: 'mapped', index, snapped };
}

/** Great-circle distance (haversine), km. */
export function distanceKm(
  latitudeA: number,
  longitudeA: number,
  latitudeB: number,
  longitudeB: number,
): number {
  const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRadians(latitudeB - latitudeA);
  const dLon = toRadians(longitudeB - longitudeA);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(latitudeA)) * Math.cos(toRadians(latitudeB)) * Math.sin(dLon / 2) ** 2;
  return 2 * earthRadiusKm * Math.asin(Math.sqrt(a));
}

/**
 * Latitude-dependent distance threshold: half the cell diagonal × 1.2. At 39°N on a 0.01° grid
 * that is ≈ 0.85 km; the measured worst province distance on the real 2024 file is 0.52 km.
 * Exceeding it proves OUR mapping is broken — the caller treats that as a hard failure, never a
 * skip.
 */
export function distanceThresholdKm(
  latitudeDeg: number,
  latitudeStepDeg: number,
  longitudeStepDeg: number,
): number {
  const latKm = Math.abs(latitudeStepDeg) * KM_PER_DEGREE;
  const lonKm =
    Math.abs(longitudeStepDeg) * KM_PER_DEGREE * Math.cos((latitudeDeg * Math.PI) / 180);
  return 0.6 * Math.hypot(latKm, lonKm);
}
