import {
  analyseAxis,
  distanceKm,
  distanceThresholdKm,
  mapCoordinateToIndex,
  type AxisAnalysis,
} from './acag-grid';
import type { AcagWindow } from './acag-hdf5.adapter';
import { AcagContractError } from './acag.errors';

/**
 * Province extraction under DEC 2026-08-19d md.1: **the value is the cell containing the province
 * centre**, and nothing else.
 *
 * ## There is no fallback on this line, deliberately
 * The ERA5 line has one (A-1, nearest LAND cell) because ERA5-Land is a land-only product and
 * five provincial centres genuinely fall on its sea mask. This product is not land-masked the same
 * way and the measurement says so: **0 of 81 province centre cells are NaN** on the 2024 file. So
 * a NaN here is not a known class to be absorbed — it is a new fact, and the run stops and
 * reports it rather than quietly reading a neighbour. Adding a fallback would need an owner
 * ruling, exactly as A-1 did; until one exists, "the centre cell, or nothing" is the rule.
 *
 * ## What the caller gets, and why the geometry is returned separately
 * The cell selection is identical for every year (same grid), so it is computed ONCE against the
 * first year's window and then re-verified against every subsequent year. Re-verifying rather
 * than trusting is the point: a provider that re-gridded a later year would otherwise have its
 * new values written into the old cells' records.
 */

export interface AcagExtractionPoint {
  plateCode: string;
  latitude: number;
  longitude: number;
}

export interface AcagCellSelection {
  plateCode: string;
  requestedLatitude: number;
  requestedLongitude: number;
  /** Window-relative indices — used to read `window.values`. */
  windowRowIndex: number;
  windowColumnIndex: number;
  /** Full-array indices — what the artifact publishes. */
  latitudeIndex: number;
  longitudeIndex: number;
  cellLatitude: number;
  cellLongitude: number;
  cellDistanceKm: number;
}

export interface AcagGridGeometry {
  latitude: AxisAnalysis;
  longitude: AxisAnalysis;
  /** Cell size in degrees, derived from the axes (both are equal on this product; checked). */
  cellSizeDeg: number;
}

/** Derive the window's axis facts, refusing anything non-monotonic or unevenly stepped. */
export function analyseWindowGeometry(window: AcagWindow): AcagGridGeometry {
  const latitude = analyseAxis(window.latitudeAxis, 'lat');
  const longitude = analyseAxis(window.longitudeAxis, 'lon');
  const latitudeSize = Math.abs(latitude.step);
  const longitudeSize = Math.abs(longitude.step);
  if (Math.abs(latitudeSize - longitudeSize) > 1e-4) {
    throw new AcagContractError(
      `the grid is not square: lat step ${String(latitude.step)} vs lon step ` +
        `${String(longitude.step)}. This line publishes ONE "cell size" figure in the payload, ` +
        'and publishing it from a non-square grid would misdescribe the data.',
    );
  }
  if (window.values.length !== latitude.length * longitude.length) {
    throw new AcagContractError(
      `window value count ${String(window.values.length)} does not equal ` +
        `${String(latitude.length)} × ${String(longitude.length)}.`,
    );
  }
  return { latitude, longitude, cellSizeDeg: latitudeSize };
}

/**
 * Select the province-centre cell for every point, with the read-back and distance guards.
 *
 * Throws on the first province that cannot be mapped: an unmappable province is a broken run, not
 * a province to skip (the 81/81-or-nothing rule).
 */
export function selectAcagCells(
  window: AcagWindow,
  geometry: AcagGridGeometry,
  points: readonly AcagExtractionPoint[],
): AcagCellSelection[] {
  const selections: AcagCellSelection[] = [];
  for (const point of points) {
    const latitudeMapping = mapCoordinateToIndex(
      window.latitudeAxis,
      geometry.latitude,
      point.latitude,
      `lat (province ${point.plateCode})`,
    );
    const longitudeMapping = mapCoordinateToIndex(
      window.longitudeAxis,
      geometry.longitude,
      point.longitude,
      `lon (province ${point.plateCode})`,
    );
    if (latitudeMapping.kind === 'outside_domain' || longitudeMapping.kind === 'outside_domain') {
      throw new AcagContractError(
        `province ${point.plateCode} (${String(point.latitude)}, ${String(point.longitude)}) ` +
          'falls outside the window that was read. The window is cut from the province set ' +
          'itself, so this means the file does not cover Türkiye — check that the GLOBAL file ' +
          'was used and not a regional tile (no ACAG tile covers all 81 provinces).',
      );
    }

    const distance = distanceKm(
      point.latitude,
      point.longitude,
      latitudeMapping.snapped,
      longitudeMapping.snapped,
    );
    const threshold = distanceThresholdKm(
      point.latitude,
      geometry.latitude.step,
      geometry.longitude.step,
    );
    if (distance > threshold) {
      throw new AcagContractError(
        `province ${point.plateCode}: the selected cell is ${distance.toFixed(3)} km from the ` +
          `province centre, beyond the ${threshold.toFixed(3)} km half-diagonal threshold — OUR ` +
          'mapping is broken. Refusing to publish.',
      );
    }

    selections.push({
      plateCode: point.plateCode,
      requestedLatitude: point.latitude,
      requestedLongitude: point.longitude,
      windowRowIndex: latitudeMapping.index,
      windowColumnIndex: longitudeMapping.index,
      latitudeIndex: window.rowOffset + latitudeMapping.index,
      longitudeIndex: window.columnOffset + longitudeMapping.index,
      cellLatitude: latitudeMapping.snapped,
      cellLongitude: longitudeMapping.snapped,
      cellDistanceKm: distance,
    });
  }
  return selections;
}

/**
 * Read one year's value for every selected cell.
 *
 * Every value is checked for being a finite, positive, physically sane number. The ceiling is a
 * NONSENSE filter, not a publishing claim: it exists to catch a unit change or a fill value
 * leaking through, not to assert what a city's air is like.
 */
export const PM25_ABSURD_CEILING_UG_M3 = 1000;

/**
 * The matching FLOOR (review CODE123-M10).
 *
 * The ceiling alone is asymmetric: it catches a provider switching to a ×1000 unit, and misses a
 * switch the other way. Annual means expressed in mg/m³ would arrive as ~0.02 and pass a bare
 * `> 0` check, republishing every figure under a unit the file no longer states — and `unit` is
 * a hardcoded literal on this line rather than a measured attribute, so nothing else would notice.
 *
 * 1 µg/m³ is a NONSENSE bound, not a claim about anyone's air: the cleanest inhabited places on
 * this dataset's own global scale sit above it, and the lowest value in the committed Türkiye
 * corpus is an order of magnitude higher.
 */
export const PM25_ABSURD_FLOOR_UG_M3 = 1;

export function readYearValues(
  window: AcagWindow,
  selections: readonly AcagCellSelection[],
  year: number,
): Map<string, number> {
  const width = window.longitudeAxis.length;
  const values = new Map<string, number>();
  for (const selection of selections) {
    const offset = selection.windowRowIndex * width + selection.windowColumnIndex;
    const raw = window.values[offset];
    if (raw === undefined) {
      throw new AcagContractError(
        `province ${selection.plateCode}, year ${String(year)}: offset ${String(offset)} is ` +
          'outside the decoded window.',
      );
    }
    if (Number.isNaN(raw)) {
      throw new AcagContractError(
        `province ${selection.plateCode}, year ${String(year)}: the province-centre cell ` +
          `(${selection.cellLatitude.toFixed(3)}, ${selection.cellLongitude.toFixed(3)}) has NO ` +
          'DATA (NaN). Reading a neighbouring cell instead is forbidden — the owner ruled the ' +
          'value IS the centre cell (DEC 2026-08-19d md.1). Stop and surface this to Atlas.',
      );
    }
    if (!Number.isFinite(raw) || raw < PM25_ABSURD_FLOOR_UG_M3 || raw > PM25_ABSURD_CEILING_UG_M3) {
      throw new AcagContractError(
        `province ${selection.plateCode}, year ${String(year)}: value ${String(raw)} µg/m³ is ` +
          'not a physically sane annual mean — refusing to publish.',
      );
    }
    values.set(selection.plateCode, raw);
  }
  return values;
}

/**
 * Verify a later year's window sits on exactly the same grid as the first.
 *
 * The cheap version of this check would compare only the axis lengths. That passes on a file that
 * has been shifted by a whole number of cells, which is precisely the change that would move
 * every published value to a different place while every other invariant still held.
 */
export function assertSameGrid(
  reference: AcagGridGeometry,
  referenceWindow: AcagWindow,
  candidate: AcagGridGeometry,
  candidateWindow: AcagWindow,
  year: number,
): void {
  const checks: [string, number, number][] = [
    ['latitude step', reference.latitude.step, candidate.latitude.step],
    ['longitude step', reference.longitude.step, candidate.longitude.step],
    ['latitude first', reference.latitude.first, candidate.latitude.first],
    ['longitude first', reference.longitude.first, candidate.longitude.first],
    ['latitude last', reference.latitude.last, candidate.latitude.last],
    ['longitude last', reference.longitude.last, candidate.longitude.last],
  ];
  for (const [label, expected, actual] of checks) {
    if (Math.abs(expected - actual) > 1e-6) {
      throw new AcagContractError(
        `year ${String(year)}: ${label} is ${String(actual)}, but the reference year has ` +
          `${String(expected)} — the provider re-gridded. Every published cell would move.`,
      );
    }
  }
  if (
    referenceWindow.rowOffset !== candidateWindow.rowOffset ||
    referenceWindow.columnOffset !== candidateWindow.columnOffset ||
    referenceWindow.fullShape.latitudeLength !== candidateWindow.fullShape.latitudeLength ||
    referenceWindow.fullShape.longitudeLength !== candidateWindow.fullShape.longitudeLength
  ) {
    throw new AcagContractError(
      `year ${String(year)}: the window/full-array geometry differs from the reference year.`,
    );
  }
}
