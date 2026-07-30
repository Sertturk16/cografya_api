import { haversineKm } from '../../database/marine/geo';
import {
  ECMWF_GRID_COLUMNS,
  ECMWF_GRID_FIRST_LATITUDE,
  ECMWF_GRID_FIRST_LONGITUDE,
  ECMWF_GRID_ROWS,
  ECMWF_GRID_STEP_DEGREES,
} from './ecmwf.constants';
import { EcmwfContractError } from './ecmwf.errors';

/**
 * Point → grid cell, by ARITHMETIC. There is no search here, and that is the whole design.
 *
 * ## Why arithmetic, and what it costs
 * The point falls in the cell it falls in. We never look for a nearer WET cell, never
 * interpolate, never average neighbours — the owner rule is "never approximate", and a
 * nearest-wet-cell search is an approximation that hides itself: it returns a real number from a
 * real model, just not from the place the user asked about. CMEMS behaves the same way (the
 * provider returns the containing cell); Open-Meteo did the opposite, and M1 measured it
 * wandering up to two cells away.
 *
 * ## The trap this file exists to avoid
 * The longitude axis of ECMWF's 0.25° product starts at **180°**, not 0° — measured, not assumed
 * (`olcumler.md` §M2.1). A column index derived from a `0 → 359.75` axis is off by exactly 720
 * columns, i.e. 180°: İzmir's cell becomes a cell in the middle of the Pacific. That cell holds
 * a perfectly ordinary wind value, so nothing throws, nothing is null, and no test goes red. The
 * axis therefore appears in three places on purpose — the constant here, the assertion
 * `grib2-envelope.ts` performs on every real message, and the committed probe artifact — because
 * one place is one edit away from being wrong everywhere.
 *
 * ## Distance means IN-CELL OFFSET
 * `distanceKm` is the distance from the requested coordinate to the centre of the cell that
 * contains it. It is bounded by half a cell diagonal by construction, so it can never say "the
 * nearest data is far away" — it can only say "our arithmetic is broken", which is exactly what
 * the threshold below is for.
 */

/** One point's placement on the ECMWF grid. */
export interface EcmwfGridMapping {
  /** Requested coordinate, echoed so the mapping is self-describing in an artifact. */
  readonly latitude: number;
  readonly longitude: number;
  /** Centre of the containing cell. */
  readonly gridLatitude: number;
  readonly gridLongitude: number;
  /** Row (0 = 90° N) and column (0 = 180° E) of that cell. */
  readonly row: number;
  readonly column: number;
  /** Flat index into a scanning-mode-0 value array: `row * 1440 + column`. */
  readonly index: number;
  /** Requested coordinate → cell centre, km. An in-cell offset; see the docblock. */
  readonly distanceKm: number;
  /** The latitude-dependent ceiling this offset is judged against. */
  readonly thresholdKm: number;
  /** `distanceKm <= thresholdKm`. False means OUR arithmetic is wrong, not that data is far. */
  readonly withinThreshold: boolean;
}

/**
 * Ceiling for a cell's in-cell offset, km, at the given cell-centre latitude.
 *
 * Half the cell diagonal (the largest possible offset inside the cell) times 1.2 for the
 * spherical-vs-planar slack. At 40.75° N a 0.25° cell is ≈ 27.8 km × 21.1 km, so the ceiling is
 * ≈ 20.9 km. The largest offset over all 30 reference points is 15.45 km (Adana), i.e. 72% of
 * its own ceiling — comfortable, but tighter than the 13.3 km the F2 spike saw over its
 * 12-point subset, so the margin is stated as measured rather than as remembered.
 *
 * Exceeding it is not a provider problem. Every point is inside SOME cell, so an offset larger
 * than half a diagonal can only mean the row/column arithmetic put us in the wrong cell.
 */
export function gridThresholdKm(cellLatitude: number): number {
  const kmPerDegreeLatitude = 111.195;
  const height = ECMWF_GRID_STEP_DEGREES * kmPerDegreeLatitude;
  const width =
    ECMWF_GRID_STEP_DEGREES * kmPerDegreeLatitude * Math.cos((cellLatitude * Math.PI) / 180);
  const halfDiagonal = Math.sqrt(height * height + width * width) / 2;
  return halfDiagonal * 1.2;
}

/**
 * Map a coordinate onto the grid.
 *
 * Longitude is normalised into `[0, 360)` first, so a point given as `-5` and the same point
 * given as `355` land in the same cell. Our own 30 points are all positive, but an artifact that
 * silently placed a negative longitude 360° away would be the same class of failure as the axis
 * bug above.
 */
export function mapPointToGrid(latitude: number, longitude: number): EcmwfGridMapping {
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    throw new EcmwfContractError(`latitude ${String(latitude)} is not a coordinate in [-90, 90].`);
  }
  if (!Number.isFinite(longitude)) {
    throw new EcmwfContractError(`longitude ${String(longitude)} is not a finite number.`);
  }

  const normalisedLongitude = ((longitude % 360) + 360) % 360;
  const gridLatitude = roundToStep(latitude);
  const gridLongitude = roundToStep(normalisedLongitude) % 360;

  const row = Math.round((ECMWF_GRID_FIRST_LATITUDE - gridLatitude) / ECMWF_GRID_STEP_DEGREES);
  const column = Math.round(
    ((((gridLongitude - ECMWF_GRID_FIRST_LONGITUDE) % 360) + 360) % 360) / ECMWF_GRID_STEP_DEGREES,
  );

  if (row < 0 || row >= ECMWF_GRID_ROWS || column < 0 || column >= ECMWF_GRID_COLUMNS) {
    throw new EcmwfContractError(
      `computed grid cell (row ${String(row)}, column ${String(column)}) is outside the ` +
        `${String(ECMWF_GRID_ROWS)} × ${String(ECMWF_GRID_COLUMNS)} grid.`,
    );
  }

  const distanceKm = haversineKm(latitude, longitude, gridLatitude, gridLongitude);
  const thresholdKm = gridThresholdKm(gridLatitude);

  return {
    latitude,
    longitude,
    gridLatitude,
    gridLongitude,
    row,
    column,
    index: row * ECMWF_GRID_COLUMNS + column,
    distanceKm: roundKm(distanceKm),
    thresholdKm: roundKm(thresholdKm),
    withinThreshold: distanceKm <= thresholdKm,
  };
}

/**
 * Round to the nearest multiple of the grid step.
 *
 * Via integer arithmetic on the step count rather than `Math.round(x / step) * step`: the naive
 * form produces 26.500000000000004 for İzmir, which is not a grid coordinate and shows up as
 * floating-point noise in a committed artifact.
 */
function roundToStep(degrees: number): number {
  const steps = Math.round(degrees / ECMWF_GRID_STEP_DEGREES);
  return steps / (1 / ECMWF_GRID_STEP_DEGREES);
}

/** Round a derived distance to 0.1 m, so an exactly-centred point records 0 and not 5e-11. */
function roundKm(km: number): number {
  return Math.round(km * 10_000) / 10_000;
}
