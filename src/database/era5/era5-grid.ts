import { Era5ContractError } from './era5.errors';

/**
 * Direction-aware grid arithmetic + the A-1 land-cell fallback search (SPEC §4, all measured).
 *
 * ## Why this is a PER-LEG COPY of `cams-grid.ts`, not a shared module (plan §7, ruling S4)
 * *Steel-man for sharing:* duplicated arithmetic is the single most drift-prone thing in this
 * codebase, and a bug fixed in one copy is a bug alive in the other.
 * *Counter-argument:* wiring a hand-run migration CLI into the air-quality FEATURE module
 * punches through a module boundary, would throw `CamsContractError` out of an ERA5 run (so A2's
 * ingest could not tell whose contract broke), and doing the sharing PROPERLY means refactoring
 * merged, tested runtime code inside this PR. The repo already has the precedent: the marine leg
 * carries its own `geo.ts` rather than importing anyone's.
 * **Winner: the per-leg copy — Because** ERA5's rules are genuinely DIFFERENT, not a
 * parameterisation of CAMS's: grid-point registration instead of cell-centred, a declared
 * land-mask fallback CAMS has no concept of, a hard 25 km ceiling applied only to that fallback,
 * and no `outside_domain` soft class at all. What transfers is the PATTERN (derive the step from
 * the axis with its sign, guard monotonicity/even spacing, read back what you indexed); the
 * CONSTANTS and the policy do not.
 *
 * ## The three silent-failure classes this file exists for
 * 1. **Axis direction.** Latitude is DESCENDING (42.5 → 35.5, step −0.1) and longitude is
 *    ASCENDING (25.5 → 45.0, step +0.1) — MEASURED, not assumed. CAMS's 0…360 longitude
 *    convention did NOT transfer (probe §2.1). The step is derived from the axis WITH ITS SIGN;
 *    `0.1` is hardcoded nowhere.
 * 2. **Registration.** This product is GRID-POINT registered (values sit at exact 0.1 multiples),
 *    where CAMS was cell-centred. That MOVES the half-step trap to a different set of provinces:
 *    coordinates ending in `x.x5` now sit exactly on the boundary, and **44 Malatya lands on it
 *    in BOTH axes at exactly 0.050000** (probe §2.3). A strict `< 0.05` threshold would therefore
 *    drop Malatya out of a PERFECTLY HEALTHY file. The `|step|/2 + 1e-3` tolerance is a
 *    REQUIREMENT here, not an improvement, and `era5-grid.spec.ts` pins the Malatya case on a
 *    synthetic axis so it can never be tightened by accident.
 * 3. **Sea mask.** ERA5-Land is defined on land only; 24.4 % of the TR box is NaN and five
 *    provinces' administrative points land in it. The fallback below is the A-1 ruling's
 *    "declared, bounded, recorded" nearest-land-cell rule — never a silent neighbour drift.
 */

/** Max deviation from the median step before an axis is refused. */
export const AXIS_EQUAL_STEP_TOLERANCE = 1e-3;

/**
 * Additive slack on the read-back guard beyond half a step. Load-bearing: Malatya's margin is
 * exactly half a step in both axes, so ZERO slack fails a healthy file (probe §2.3).
 */
export const READBACK_EXTRA_TOLERANCE = 1e-3;

/**
 * Hard ceiling on a declared land-cell fallback (SPEC §4.1-3). Measured maximum is 13.20 km
 * (57 Sinop); the cap is ~2× that — loose enough never to block the five legitimate provinces,
 * tight enough that a grid or coordinate change cannot creep past it silently.
 */
export const FALLBACK_MAX_DISTANCE_KM = 25;

/**
 * How far the nearest-land search may look, in CELLS, per axis. ±3 cells ≈ 33 km of latitude,
 * which strictly covers the 25 km ceiling above at every Turkish latitude — the window bounds
 * the search, the ceiling decides admissibility. They are deliberately two separate guards.
 */
export const FALLBACK_SEARCH_RADIUS_CELLS = 3;

/** Great-circle Earth radius, km (the value `marine/geo.ts` and `cams-grid.ts` both use). */
const EARTH_RADIUS_KM = 6371;

export interface Era5AxisAnalysis {
  /** Signed step, derived from the axis itself — never a literal. */
  step: number;
  first: number;
  last: number;
  length: number;
}

/**
 * The axis guard: derives the signed step and refuses a non-monotonic or unevenly-stepped axis.
 * A wrapped 0…360 longitude axis (what CAMS returns) trips here rather than producing plausible
 * numbers from the wrong hemisphere.
 */
export function analyseEra5Axis(values: readonly number[], axisName: string): Era5AxisAnalysis {
  if (values.length < 2) {
    throw new Era5ContractError(
      `axis "${axisName}" has ${String(values.length)} value(s) — need at least 2 to derive a step.`,
    );
  }
  const first = values[0];
  const last = values[values.length - 1];
  if (first === undefined || last === undefined) {
    throw new Era5ContractError(`axis "${axisName}" contains undefined entries.`);
  }

  const steps: number[] = [];
  for (let index = 1; index < values.length; index += 1) {
    const previous = values[index - 1];
    const current = values[index];
    if (previous === undefined || current === undefined) {
      throw new Era5ContractError(`axis "${axisName}" contains undefined entries.`);
    }
    if (!Number.isFinite(current)) {
      throw new Era5ContractError(
        `axis "${axisName}" value at index ${String(index)} is not finite.`,
      );
    }
    steps.push(current - previous);
  }

  const sorted = [...steps].sort((a, b) => a - b);
  const medianStep = sorted[Math.floor(sorted.length / 2)];
  if (medianStep === undefined || medianStep === 0) {
    throw new Era5ContractError(`axis "${axisName}" has a zero/undefined median step.`);
  }

  for (const step of steps) {
    if (Math.sign(step) !== Math.sign(medianStep)) {
      throw new Era5ContractError(
        `axis "${axisName}" is NOT MONOTONIC (a step of ${String(step)} against a median of ` +
          `${String(medianStep)}) — a wrapped 0…360 axis lands here and must stop the run.`,
      );
    }
    if (Math.abs(step - medianStep) > AXIS_EQUAL_STEP_TOLERANCE) {
      throw new Era5ContractError(
        `axis "${axisName}" is not evenly stepped: step ${String(step)} deviates from the ` +
          `median ${String(medianStep)} by more than ${String(AXIS_EQUAL_STEP_TOLERANCE)}.`,
      );
    }
  }

  return { step: medianStep, first, last, length: values.length };
}

/** The read-back tolerance for a derived step: `|step|/2 + 1e-3` (the Malatya requirement). */
export function readbackToleranceFor(step: number): number {
  return Math.abs(step) / 2 + READBACK_EXTRA_TOLERANCE;
}

/**
 * Map one requested coordinate onto the axis, then read back what we indexed.
 *
 * Unlike CAMS, this THROWS on out-of-domain instead of returning a soft class: SPEC §4.1-3 and
 * the V5 assertion require all 81 provinces to be inside the requested box, and a migration that
 * quietly drops a province is exactly the failure this leg is designed against.
 */
export function mapEra5CoordinateToIndex(
  axis: readonly number[],
  analysis: Era5AxisAnalysis,
  requested: number,
  axisName: string,
): { index: number; snapped: number } {
  const halfCell = Math.abs(analysis.step) / 2;
  const low = Math.min(analysis.first, analysis.last) - halfCell;
  const high = Math.max(analysis.first, analysis.last) + halfCell;
  if (requested < low - READBACK_EXTRA_TOLERANCE || requested > high + READBACK_EXTRA_TOLERANCE) {
    throw new Era5ContractError(
      `"${axisName}" OUTSIDE DOMAIN: requested ${String(requested)} is beyond the axis coverage ` +
        `[${String(low)}, ${String(high)}]. The requested area must contain all 81 provinces ` +
        '(SPEC §2.3 V5) — this is a stop, not a skip.',
    );
  }

  const index = Math.round((requested - analysis.first) / analysis.step);
  if (index < 0 || index >= axis.length) {
    throw new Era5ContractError(
      `"${axisName}": index ${String(index)} out of [0, ${String(axis.length)}) for requested ` +
        `${String(requested)} although the value is inside the axis coverage — the arithmetic ` +
        'is broken.',
    );
  }
  const snapped = axis[index];
  if (snapped === undefined) {
    throw new Era5ContractError(`"${axisName}": axis[${String(index)}] is undefined.`);
  }
  const tolerance = readbackToleranceFor(analysis.step);
  if (Math.abs(snapped - requested) > tolerance) {
    throw new Era5ContractError(
      `"${axisName}" READ-BACK GUARD: axis[${String(index)}] = ${String(snapped)} is ` +
        `${String(Math.abs(snapped - requested))}° from the requested ${String(requested)} ` +
        `(tolerance ${String(tolerance)}) — wrong cell; refusing to publish a plausible number ` +
        'from the wrong place.',
    );
  }
  return { index, snapped };
}

/** Great-circle distance (haversine), km. */
export function distanceKm(
  latitudeA: number,
  longitudeA: number,
  latitudeB: number,
  longitudeB: number,
): number {
  const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;
  const dLat = toRadians(latitudeB - latitudeA);
  const dLon = toRadians(longitudeB - longitudeA);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(latitudeA)) * Math.cos(toRadians(latitudeB)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

export interface Era5CellSelection {
  latIndex: number;
  lonIndex: number;
  /** The axis values actually at those indices — the cell we will publish from. */
  cellLatitude: number;
  cellLongitude: number;
  /** `true` only when the administrative point's own cell was masked (A-1 fallback fired). */
  fallbackUsed: boolean;
  /** Great-circle km from the administrative point to the cell used. `0` when no fallback. */
  fallbackDistanceKm: number;
}

/**
 * Resolve ONE province to ONE grid cell under the A-1 ruling: the administrative point's cell,
 * or — if and only if that cell is masked — the nearest LAND cell, with the shift recorded.
 *
 * The fallback is deliberately ONE STEP with THREE hard stops (SPEC §4.1-3/4/6): no land cell in
 * the window, a distance over {@link FALLBACK_MAX_DISTANCE_KM}, or (checked by the caller across
 * all provinces) a fallback SET that differs from the expected five. Ties break deterministically
 * — smaller latitude index first, then smaller longitude index — so two runs of the same file
 * can never produce two different manifests.
 *
 * `isMasked(latIndex, lonIndex)` is injected rather than reading a grid directly, which is what
 * lets the unit tests pin every branch (including "the whole window is sea") without a real file.
 */
export function selectEra5Cell(options: {
  latitudeAxis: readonly number[];
  longitudeAxis: readonly number[];
  latitudeAnalysis: Era5AxisAnalysis;
  longitudeAnalysis: Era5AxisAnalysis;
  requestedLatitude: number;
  requestedLongitude: number;
  isMasked: (latIndex: number, lonIndex: number) => boolean;
  label: string;
}): Era5CellSelection {
  const lat = mapEra5CoordinateToIndex(
    options.latitudeAxis,
    options.latitudeAnalysis,
    options.requestedLatitude,
    `${options.label} latitude`,
  );
  const lon = mapEra5CoordinateToIndex(
    options.longitudeAxis,
    options.longitudeAnalysis,
    options.requestedLongitude,
    `${options.label} longitude`,
  );

  if (!options.isMasked(lat.index, lon.index)) {
    return {
      latIndex: lat.index,
      lonIndex: lon.index,
      cellLatitude: lat.snapped,
      cellLongitude: lon.snapped,
      fallbackUsed: false,
      fallbackDistanceKm: 0,
    };
  }

  let best: Era5CellSelection | null = null;
  for (
    let latOffset = -FALLBACK_SEARCH_RADIUS_CELLS;
    latOffset <= FALLBACK_SEARCH_RADIUS_CELLS;
    latOffset += 1
  ) {
    for (
      let lonOffset = -FALLBACK_SEARCH_RADIUS_CELLS;
      lonOffset <= FALLBACK_SEARCH_RADIUS_CELLS;
      lonOffset += 1
    ) {
      const latIndex = lat.index + latOffset;
      const lonIndex = lon.index + lonOffset;
      if (latIndex < 0 || latIndex >= options.latitudeAxis.length) continue;
      if (lonIndex < 0 || lonIndex >= options.longitudeAxis.length) continue;
      if (options.isMasked(latIndex, lonIndex)) continue;
      const cellLatitude = options.latitudeAxis[latIndex];
      const cellLongitude = options.longitudeAxis[lonIndex];
      if (cellLatitude === undefined || cellLongitude === undefined) continue;
      const candidate: Era5CellSelection = {
        latIndex,
        lonIndex,
        cellLatitude,
        cellLongitude,
        fallbackUsed: true,
        fallbackDistanceKm: distanceKm(
          options.requestedLatitude,
          options.requestedLongitude,
          cellLatitude,
          cellLongitude,
        ),
      };
      // Deterministic tie-break: strictly-closer wins; on an exact tie the LOWER lat index, then
      // the LOWER lon index, wins. Without this a float tie would make the manifest depend on
      // iteration order, which is a silent non-determinism in a committed artifact.
      if (
        best === null ||
        candidate.fallbackDistanceKm < best.fallbackDistanceKm ||
        (candidate.fallbackDistanceKm === best.fallbackDistanceKm &&
          (candidate.latIndex < best.latIndex ||
            (candidate.latIndex === best.latIndex && candidate.lonIndex < best.lonIndex)))
      ) {
        best = candidate;
      }
    }
  }

  if (best === null) {
    throw new Era5ContractError(
      `${options.label}: the administrative point's cell is masked (sea) and NO land cell was ` +
        `found within ±${String(FALLBACK_SEARCH_RADIUS_CELLS)} cells — refusing to guess ` +
        '(SPEC §4.1-6).',
    );
  }
  if (best.fallbackDistanceKm > FALLBACK_MAX_DISTANCE_KM) {
    throw new Era5ContractError(
      `${options.label}: nearest land cell is ${best.fallbackDistanceKm.toFixed(2)} km away, ` +
        `over the declared ${String(FALLBACK_MAX_DISTANCE_KM)} km ceiling — the grid or the ` +
        'coordinate changed; stopping rather than drifting silently (SPEC §4.1-3).',
    );
  }
  return best;
}
