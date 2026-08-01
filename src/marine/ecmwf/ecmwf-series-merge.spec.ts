import { describe, expect, it } from '@jest/globals';
import type { EcmwfStoredSeries } from '../entities/marine-ecmwf-point-series.entity';
import {
  addStepDone,
  assertParallel,
  classifyStoredSeries,
  isCycleComplete,
  mergeStepIntoSeries,
} from './ecmwf-series-merge';
import { EcmwfContractError } from './ecmwf.errors';

const SAMPLE = { u10: 1, v10: -2, swh: 0.5, mwd: 270 };

describe('mergeStepIntoSeries', () => {
  it('starts a series from nothing', () => {
    const series = mergeStepIntoSeries(null, 12, SAMPLE);
    expect(series).toEqual({ steps: [12], u10: [1], v10: [-2], swh: [0.5], mwd: [270] });
  });

  it('keeps steps sorted when they arrive OUT OF ORDER — the ingest priority order', () => {
    // Nearest-to-now lands first (say +12 h), then the ascending fill starts at 0.
    let series = mergeStepIntoSeries(null, 12, SAMPLE);
    series = mergeStepIntoSeries(series, 0, { u10: 9, v10: 9, swh: 9, mwd: 9 });
    series = mergeStepIntoSeries(series, 3, { u10: 8, v10: 8, swh: 8, mwd: 8 });

    expect(series.steps).toEqual([0, 3, 12]);
    expect(series.u10).toEqual([9, 8, 1]);
    expect(series.mwd).toEqual([9, 8, 270]);
  });

  it('REPLACES an already-present step instead of duplicating or refusing', () => {
    let series = mergeStepIntoSeries(null, 6, SAMPLE);
    series = mergeStepIntoSeries(series, 6, { u10: 5, v10: 5, swh: 5, mwd: 5 });
    expect(series.steps).toEqual([6]);
    expect(series.u10).toEqual([5]);
  });

  it('normalises NaN and undefined-ish inputs to null — a NaN must never be stored as a number', () => {
    const series = mergeStepIntoSeries(null, 0, {
      u10: Number.NaN,
      v10: null,
      swh: Number.POSITIVE_INFINITY,
      mwd: 12.5,
    });
    expect(series.u10).toEqual([null]);
    expect(series.v10).toEqual([null]);
    expect(series.swh).toEqual([null]);
    expect(series.mwd).toEqual([12.5]);
  });

  it('refuses a negative or fractional step hour', () => {
    expect(() => mergeStepIntoSeries(null, -3, SAMPLE)).toThrow(EcmwfContractError);
    expect(() => mergeStepIntoSeries(null, 1.5, SAMPLE)).toThrow(EcmwfContractError);
  });
});

describe("classifyStoredSeries — the §7.3 verdict, per field, from the cycle's own evidence", () => {
  it('marks a field not_supported only when EVERY step is missing', () => {
    const series: EcmwfStoredSeries = {
      steps: [0, 3],
      u10: [1, 2],
      v10: [1, null],
      swh: [null, null],
      mwd: [null, 4],
    };
    expect(classifyStoredSeries(series)).toEqual({
      u10: 'ok',
      v10: 'ok', // partial → still carried here; the gap publishes as null at its own step
      swh: 'not_supported', // the land-mask class
      mwd: 'ok',
    });
  });
});

describe('cycle progress bookkeeping', () => {
  it('addStepDone stays unique and ascending regardless of arrival order', () => {
    expect(addStepDone([3, 0], 12)).toEqual([0, 3, 12]);
    expect(addStepDone([0, 3, 12], 3)).toEqual([0, 3, 12]);
  });

  it('isCycleComplete requires EVERY horizon step, not a count', () => {
    expect(isCycleComplete([0, 3, 6], [0, 3, 6])).toBe(true);
    // Same length, wrong membership — a count-based check would pass this.
    expect(isCycleComplete([0, 3, 9], [0, 3, 6])).toBe(false);
    expect(isCycleComplete([], [0])).toBe(false);
  });
});

describe('assertParallel — the stored-blob gate', () => {
  it('refuses a short field array — a fabricated gap waiting to happen', () => {
    const corrupt: EcmwfStoredSeries = {
      steps: [0, 3],
      u10: [1], // one sample missing
      v10: [1, 2],
      swh: [1, 2],
      mwd: [1, 2],
    };
    expect(() => assertParallel(corrupt)).toThrow(/u10/);
  });

  it('refuses non-ascending or duplicated steps', () => {
    const corrupt: EcmwfStoredSeries = {
      steps: [3, 3],
      u10: [1, 1],
      v10: [1, 1],
      swh: [1, 1],
      mwd: [1, 1],
    };
    expect(() => assertParallel(corrupt)).toThrow(/ascending/);
  });
});
