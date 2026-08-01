import { describe, expect, it } from '@jest/globals';
import {
  ECMWF_GRID_COLUMNS,
  ECMWF_GRID_FIRST_LONGITUDE,
  ECMWF_GRID_ROWS,
  ECMWF_GRID_STEP_DEGREES,
} from './ecmwf.constants';
import { EcmwfContractError } from './ecmwf.errors';
import { gridThresholdKm, mapPointToGrid } from './ecmwf-grid';

/**
 * STRUCTURAL tests for the point → cell arithmetic.
 *
 * The values compared against ecCodes for all 30 reference points live in the golden-corpus
 * spec next to the decoder; this file asserts the PROPERTIES that make that mapping correct in
 * general — the axis origin, the row/column directions, the absence of any search, and the
 * threshold's meaning.
 */
describe('mapPointToGrid', () => {
  it('places the grid origin at row 0, column 0 — and the origin is 90 N / 180 E', () => {
    const origin = mapPointToGrid(90, 180);

    expect(origin.row).toBe(0);
    expect(origin.column).toBe(0);
    expect(origin.index).toBe(0);
  });

  it('puts 0 E at column 720, NOT column 0 — the axis starts at 180', () => {
    // The single most expensive mistake available in this leg. An axis assumed to start at 0
    // would put the prime meridian at column 0 and every Turkish point 720 columns (180°) away,
    // in the middle of the Pacific — where the model has perfectly ordinary values, so nothing
    // would be null and no test would fail.
    expect(mapPointToGrid(0, 0).column).toBe(720);
    expect(ECMWF_GRID_FIRST_LONGITUDE).toBe(180);

    // The Turkish coast sits east of Greenwich, i.e. just past the wrap point.
    const izmir = mapPointToGrid(38.72, 26.6);
    expect(izmir.column).toBe(826);
    expect(izmir.index).toBe(296_026);
  });

  it('counts rows SOUTHWARDS and columns EASTWARDS', () => {
    const north = mapPointToGrid(41, 29);
    const south = mapPointToGrid(36, 29);
    expect(south.row).toBeGreaterThan(north.row);

    const west = mapPointToGrid(41, 27);
    const east = mapPointToGrid(41, 31);
    expect(east.column).toBeGreaterThan(west.column);
  });

  it('wraps the column axis exactly once around the globe', () => {
    // 179.75 E is the last column; 180 E is the first. The wrap is what makes the axis a circle
    // rather than a line, and off-by-one here is a whole-planet shift.
    expect(mapPointToGrid(0, 179.75).column).toBe(ECMWF_GRID_COLUMNS - 1);
    expect(mapPointToGrid(0, 180).column).toBe(0);
    expect(mapPointToGrid(0, 180.25).column).toBe(1);
  });

  it('treats a negative longitude as the same place as its [0, 360) form', () => {
    const negative = mapPointToGrid(41, -30);
    const positive = mapPointToGrid(41, 330);

    expect(negative.index).toBe(positive.index);
    expect(negative.gridLongitude).toBe(positive.gridLongitude);
  });

  it('snaps to grid coordinates without floating-point residue', () => {
    // `Math.round(26.6 / 0.25) * 0.25` is 26.500000000000004, which is not a grid coordinate and
    // would churn a committed artifact on every regeneration.
    expect(mapPointToGrid(38.72, 26.6).gridLongitude).toBe(26.5);
    expect(mapPointToGrid(41.13, 40.52).gridLatitude).toBe(41.25);
  });

  it('takes the CONTAINING cell and never searches for a better one', () => {
    // The whole no-approximation rule in one assertion: the cell is decided by rounding, and a
    // point 12 km from its centre still maps to that centre — no neighbour, no interpolation, no
    // "nearest wet cell". Whether that cell carries data is a separate question the support
    // classification answers with a null, never with a substitute value.
    const point = mapPointToGrid(41.18, 31.13);

    expect(point.gridLatitude).toBe(41.25);
    expect(point.gridLongitude).toBe(31.25);
    // Deterministic: the same input always produces the same cell, because nothing about the
    // cell's CONTENTS takes part in choosing it.
    expect(mapPointToGrid(41.18, 31.13)).toEqual(point);
  });

  it('reports the in-cell offset and keeps it under half a cell diagonal', () => {
    for (const [latitude, longitude] of [
      [41.95, 28.15],
      [38.72, 26.6],
      [36.4, 35.38],
      [36.05, 35.8],
    ] as const) {
      const point = mapPointToGrid(latitude, longitude);
      // By construction, not by luck: the containing cell's centre can never be further than half
      // a diagonal away, which is exactly why exceeding the threshold means OUR arithmetic is
      // broken rather than "the data is far away".
      expect(point.distanceKm).toBeLessThanOrEqual(point.thresholdKm);
      expect(point.withinThreshold).toBe(true);
    }
  });

  it('rejects coordinates that are not coordinates', () => {
    expect(() => mapPointToGrid(91, 29)).toThrow(EcmwfContractError);
    expect(() => mapPointToGrid(-91, 29)).toThrow(EcmwfContractError);
    expect(() => mapPointToGrid(Number.NaN, 29)).toThrow(EcmwfContractError);
    expect(() => mapPointToGrid(41, Number.POSITIVE_INFINITY)).toThrow(EcmwfContractError);
  });

  it('produces an index inside the grid for a dense sweep of the globe', () => {
    for (let latitude = -90; latitude <= 90; latitude += 7.5) {
      for (let longitude = 0; longitude < 360; longitude += 13) {
        const point = mapPointToGrid(latitude, longitude);
        expect(point.index).toBeGreaterThanOrEqual(0);
        expect(point.index).toBeLessThan(ECMWF_GRID_COLUMNS * ECMWF_GRID_ROWS);
        expect(point.row).toBe(Math.floor(point.index / ECMWF_GRID_COLUMNS));
        expect(point.column).toBe(point.index % ECMWF_GRID_COLUMNS);
      }
    }
  });
});

describe('gridThresholdKm', () => {
  it('shrinks towards the poles, because a 0.25° cell does', () => {
    expect(gridThresholdKm(0)).toBeGreaterThan(gridThresholdKm(41));
    expect(gridThresholdKm(41)).toBeGreaterThan(gridThresholdKm(80));
  });

  it('is about 21 km on the Turkish coast', () => {
    // Sanity anchor for the number quoted in the SPEC, kept as a range rather than a constant so
    // it documents the magnitude without pinning the formula's last decimal.
    const threshold = gridThresholdKm(40.75);
    expect(threshold).toBeGreaterThan(20);
    expect(threshold).toBeLessThan(22);
  });

  it('is larger than half a cell diagonal at the equator, where the cell is squarest', () => {
    const kmPerDegree = 111.195;
    const side = ECMWF_GRID_STEP_DEGREES * kmPerDegree;
    const halfDiagonal = Math.sqrt(2 * side * side) / 2;
    expect(gridThresholdKm(0)).toBeGreaterThan(halfDiagonal);
  });
});
