import { CamsContractError } from './cams.errors';

/**
 * Direction-aware grid arithmetic + the two binding guards (SPEC §7.3, all measured).
 *
 * ## The three silent-failure classes this file exists for
 * 1. **Axis direction.** The latitude axis is DESCENDING (42.45 → 35.55, step −0.1). The naive
 *    `round((value − axis[0]) / 0.1)` formula, run against the real production file, produced
 *    an invalid index for 81 of 81 provinces. The step is therefore derived FROM the axis,
 *    with its sign; `0.1` is never hardcoded.
 * 2. **Longitude convention.** Requests are −180…180 but the FILE is 0…360; the full-domain
 *    axis is not even monotonic (335.05…359.95 then 0.05…44.95). Invisible in the TR subset —
 *    by coincidence, not by design — so the AXIS GUARD refuses any non-monotonic or
 *    unevenly-stepped axis outright.
 * 3. **Registration.** Cell centres sit at x.x5 (cell-centred grid); a 0.05° registration
 *    error would move every province one half-cell while every array index stays in range.
 *    The READ-BACK GUARD re-reads the coordinate at the computed index and refuses a snap
 *    farther than half a step.
 *
 * ## Tolerances are DERIVED, never fixed (risk R2b — a miscalibrated guard gets turned off)
 * - Equal-step check: max deviation from the median step ≤ 1e-3. Float32 axes are never
 *   exactly 0.1 apart (measured deviation ≤ 3.8×10⁻⁶); strict equality or 1e-6 would reject a
 *   HEALTHY file.
 * - Read-back: |axis[i] − requested| ≤ |step|/2 + 1e-3. The fixed 0.05 tolerance failed by
 *   design on Kayseri (canonical longitude exactly 35.5000, the precise midpoint of two cell
 *   centres — measured margin 7.6×10⁻⁷ °). The 1e-3 slack is ~260× the float32 noise and 1/50
 *   of a whole-cell error, so discrimination is not weakened. The Kayseri case is pinned in
 *   the spec beside this file.
 */

/** Max deviation from the median step before an axis is refused (SPEC §7.3 guard 1). */
export const AXIS_EQUAL_STEP_TOLERANCE = 1e-3;

/** Additive slack on the read-back guard beyond half a step (SPEC §7.3 guard 2). */
export const READBACK_EXTRA_TOLERANCE = 1e-3;

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
 * unevenly-stepped axis (the wrapped 0…360 full-domain axis trips exactly here).
 */
export function analyseAxis(values: readonly number[], axisName: string): AxisAnalysis {
  if (values.length < 2) {
    throw new CamsContractError(
      `axis "${axisName}" has ${String(values.length)} value(s) — need at least 2 to derive a step.`,
    );
  }
  const first = values[0];
  const second = values[1];
  const last = values[values.length - 1];
  if (first === undefined || second === undefined || last === undefined) {
    throw new CamsContractError(`axis "${axisName}" contains undefined entries.`);
  }

  const steps: number[] = [];
  for (let index = 1; index < values.length; index += 1) {
    const previous = values[index - 1];
    const current = values[index];
    if (previous === undefined || current === undefined) {
      throw new CamsContractError(`axis "${axisName}" contains undefined entries.`);
    }
    steps.push(current - previous);
  }

  const sorted = [...steps].sort((a, b) => a - b);
  const medianStep = sorted[Math.floor(sorted.length / 2)];
  if (medianStep === undefined || medianStep === 0) {
    throw new CamsContractError(`axis "${axisName}" has a zero/undefined median step.`);
  }

  for (const step of steps) {
    if (Math.sign(step) !== Math.sign(medianStep)) {
      throw new CamsContractError(
        `axis "${axisName}" is NOT MONOTONIC (a step of ${String(step)} against a median of ` +
          `${String(medianStep)}) — a wrapped 0…360 axis lands here and must stop the decode.`,
      );
    }
    if (Math.abs(step - medianStep) > AXIS_EQUAL_STEP_TOLERANCE) {
      throw new CamsContractError(
        `axis "${axisName}" is not evenly stepped: step ${String(step)} deviates from the ` +
          `median ${String(medianStep)} by more than ${String(AXIS_EQUAL_STEP_TOLERANCE)}.`,
      );
    }
  }

  return { step: medianStep, first, last, length: values.length };
}

/** The read-back tolerance for a derived step: `|step|/2 + 1e-3`. */
export function readbackToleranceFor(step: number): number {
  return Math.abs(step) / 2 + READBACK_EXTRA_TOLERANCE;
}

export type CoordinateMapping =
  | {
      kind: 'mapped';
      index: number;
      /** The axis value actually at that index — the cell-centre coordinate we publish. */
      snapped: number;
    }
  | {
      /** The requested coordinate lies outside the axis coverage: `not_supported`, not a bug. */
      kind: 'outside_domain';
    };

/**
 * Map one requested coordinate onto the axis: direction-aware arithmetic, then Guard 2 — the
 * read-back guard.
 *
 * `outside_domain` is returned (not thrown) when the requested value falls beyond the axis
 * coverage by more than half a cell: that is the structural `not_supported` class of SPEC
 * §7.4, empty for all 81 provinces today. An index that lands IN range but reads back farther
 * than the tolerance is OUR arithmetic being wrong and THROWS — measured: the read-back guard
 * alone caught 81/81 provinces on both broken-arithmetic scenarios, without depending on the
 * data-dependent luck of an out-of-bounds index.
 */
export function mapCoordinateToIndex(
  axis: readonly number[],
  analysis: AxisAnalysis,
  requested: number,
  axisName: string,
): CoordinateMapping {
  const halfCell = Math.abs(analysis.step) / 2;
  const low = Math.min(analysis.first, analysis.last) - halfCell;
  const high = Math.max(analysis.first, analysis.last) + halfCell;
  if (requested < low - READBACK_EXTRA_TOLERANCE || requested > high + READBACK_EXTRA_TOLERANCE) {
    return { kind: 'outside_domain' };
  }

  const index = Math.round((requested - analysis.first) / analysis.step);
  if (index < 0 || index >= axis.length) {
    throw new CamsContractError(
      `"${axisName}": index ${String(index)} out of [0, ${String(axis.length)}) for requested ` +
        `${String(requested)} although the value is inside the axis coverage — the arithmetic ` +
        'is broken.',
    );
  }
  const snapped = axis[index];
  if (snapped === undefined) {
    throw new CamsContractError(`"${axisName}": axis[${String(index)}] is undefined.`);
  }
  const tolerance = readbackToleranceFor(analysis.step);
  if (Math.abs(snapped - requested) > tolerance) {
    throw new CamsContractError(
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
 * Latitude-dependent distance threshold: half the cell diagonal × 1.2 (SPEC §7.3 — ≈ 8.5 km at
 * 39°N for a 0.1° grid; measured worst province distance 6.406 km, a 25% margin). Exceeding it
 * proves OUR mapping is broken — the caller treats that as a hard failure, never a skip.
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
