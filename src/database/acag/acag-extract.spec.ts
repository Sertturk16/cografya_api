import { describe, expect, it } from '@jest/globals';
import {
  analyseWindowGeometry,
  assertSameGrid,
  readYearValues,
  selectAcagCells,
  PM25_ABSURD_CEILING_UG_M3,
  PM25_ABSURD_FLOOR_UG_M3,
} from './acag-extract';
import type { AcagWindow } from './acag-hdf5.adapter';
import { AcagContractError } from './acag.errors';

/**
 * Structural tests only. Every value below is synthetic — no province's real PM2.5 figure appears
 * in this file, and none should: facts are verified by the fetch phase's assertions and the
 * provenance ledger, never pinned into a test.
 */

function buildWindow(overrides: Partial<AcagWindow> = {}): AcagWindow {
  const latitudeAxis = Array.from({ length: 20 }, (_, index) =>
    Number((36.005 + index * 0.01).toFixed(6)),
  );
  const longitudeAxis = Array.from({ length: 30 }, (_, index) =>
    Number((32.005 + index * 0.01).toFixed(6)),
  );
  const values = new Float32Array(latitudeAxis.length * longitudeAxis.length);
  values.fill(20);
  return {
    latitudeAxis,
    longitudeAxis,
    values,
    rowOffset: 1000,
    columnOffset: 2000,
    fullShape: { latitudeLength: 13000, longitudeLength: 36000 },
    timeCoverageAttribute: '2024',
    ...overrides,
  };
}

describe('analyseWindowGeometry', () => {
  it('derives a square cell size from the axes', () => {
    const geometry = analyseWindowGeometry(buildWindow());
    expect(geometry.cellSizeDeg).toBeCloseTo(0.01, 6);
  });

  it('refuses a non-square grid rather than publish one "cell size"', () => {
    const window = buildWindow({
      longitudeAxis: Array.from({ length: 30 }, (_, index) => 32.005 + index * 0.05),
    });
    expect(() => analyseWindowGeometry(window)).toThrow(/not square/);
  });

  it('refuses a value count that disagrees with the axes', () => {
    const window = buildWindow({ values: new Float32Array(5) });
    expect(() => analyseWindowGeometry(window)).toThrow(/does not equal/);
  });
});

describe('selectAcagCells', () => {
  const window = buildWindow();
  const geometry = analyseWindowGeometry(window);

  it('reports FULL-ARRAY indices by adding the window offset', () => {
    const [selection] = selectAcagCells(window, geometry, [
      { plateCode: '01', latitude: 36.055, longitude: 32.055 },
    ]);
    if (selection === undefined) throw new Error('unreachable');
    expect(selection.windowRowIndex).toBe(5);
    expect(selection.latitudeIndex).toBe(1000 + 5);
    expect(selection.longitudeIndex).toBe(2000 + 5);
  });

  it('records the cell centre and its distance from the province centre', () => {
    const [selection] = selectAcagCells(window, geometry, [
      { plateCode: '01', latitude: 36.0551, longitude: 32.0552 },
    ]);
    if (selection === undefined) throw new Error('unreachable');
    expect(selection.cellLatitude).toBeCloseTo(36.055, 6);
    expect(selection.cellDistanceKm).toBeGreaterThan(0);
    expect(selection.cellDistanceKm).toBeLessThan(1);
  });

  it('THROWS for a province outside the window, naming the regional-tile trap', () => {
    expect(() =>
      selectAcagCells(window, geometry, [{ plateCode: '65', latitude: 38.46, longitude: 43.34 }]),
    ).toThrow(/does not cover Türkiye|outside the window/);
  });
});

describe('readYearValues', () => {
  const window = buildWindow();
  const geometry = analyseWindowGeometry(window);
  const selections = selectAcagCells(window, geometry, [
    { plateCode: '01', latitude: 36.055, longitude: 32.055 },
  ]);

  it('reads the value at the selected cell', () => {
    const values = readYearValues(window, selections, 2024);
    expect(values.get('01')).toBe(20);
  });

  /**
   * The NaN branch is the owner's ruling made structural: the value IS the centre cell
   * (DEC 2026-08-19d md.1), so "no data there" must stop the run rather than quietly become a
   * neighbour's value. Measured on the real 2024 file: 0 of 81 centre cells are NaN — this test
   * guards the rule, not a known case.
   */
  it('THROWS on a NaN centre cell instead of reading a neighbour', () => {
    const nanWindow = buildWindow();
    const target = selections[0];
    if (target === undefined) throw new Error('unreachable');
    nanWindow.values[
      target.windowRowIndex * nanWindow.longitudeAxis.length + target.windowColumnIndex
    ] = Number.NaN;
    expect(() => readYearValues(nanWindow, selections, 2024)).toThrow(/NO DATA \(NaN\)/);
    expect(() => readYearValues(nanWindow, selections, 2024)).toThrow(/DEC 2026-08-19d/);
  });

  it.each([
    ['zero', 0],
    ['negative', -3],
    ['absurd', PM25_ABSURD_CEILING_UG_M3 + 1],
    // The FLOOR's own case (review CODE123R2-M3): every value above threw under the previous
    // `raw <= 0` condition too, so none of them could tell the floor apart from its predecessor.
    // 0.02 µg/m³ is what an annual mean looks like if the provider switches to mg/m³ — positive,
    // finite, under the ceiling, and caught only by the floor.
    ['sub-floor (a ÷1000 unit change)', PM25_ABSURD_FLOOR_UG_M3 / 50],
  ])('THROWS on a %s value', (_label, value) => {
    const badWindow = buildWindow();
    const target = selections[0];
    if (target === undefined) throw new Error('unreachable');
    badWindow.values[
      target.windowRowIndex * badWindow.longitudeAxis.length + target.windowColumnIndex
    ] = value;
    expect(() => readYearValues(badWindow, selections, 2024)).toThrow(/not a physically sane/);
  });
});

describe('assertSameGrid', () => {
  const window = buildWindow();
  const geometry = analyseWindowGeometry(window);

  it('accepts an identical grid', () => {
    const other = buildWindow();
    expect(() =>
      assertSameGrid(geometry, window, analyseWindowGeometry(other), other, 2023),
    ).not.toThrow();
  });

  /**
   * A whole-cell shift keeps every axis LENGTH identical, so a length-only check passes while
   * every published value moves to a different place. That is the failure this exists for.
   */
  it('THROWS when a later year is shifted by a whole cell', () => {
    const shifted = buildWindow({
      latitudeAxis: Array.from({ length: 20 }, (_, index) =>
        Number((36.015 + index * 0.01).toFixed(6)),
      ),
    });
    expect(() =>
      assertSameGrid(geometry, window, analyseWindowGeometry(shifted), shifted, 2023),
    ).toThrow(/re-gridded/);
  });

  it('THROWS when the window offset moved', () => {
    const moved = buildWindow({ rowOffset: 1001 });
    expect(() =>
      assertSameGrid(geometry, window, analyseWindowGeometry(moved), moved, 2023),
    ).toThrow(AcagContractError);
  });
});
