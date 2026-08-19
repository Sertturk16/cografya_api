import { describe, expect, it } from '@jest/globals';
import { bilinearSample } from './bilinear';

describe('bilinear sampling', () => {
  /** A tiny grid so every expectation can be reasoned about by hand. */
  function gridFrom(values: number[], size: number): Int16Array {
    expect(values).toHaveLength(size * size);
    return Int16Array.from(values);
  }

  it('returns a cell’s own value at its centre', () => {
    // The half-pixel convention: the centre of cell (1, 1) is at (1.5, 1.5). Getting this
    // wrong biases EVERY sample by half a cell (~15 m at z12) — a systematic shift, not noise,
    // and invisible on a chart.
    const grid = gridFrom([10, 20, 30, 40], 2);
    expect(bilinearSample(grid, 0.5, 0.5, 2)).toBeCloseTo(10, 10);
    expect(bilinearSample(grid, 1.5, 0.5, 2)).toBeCloseTo(20, 10);
    expect(bilinearSample(grid, 0.5, 1.5, 2)).toBeCloseTo(30, 10);
    expect(bilinearSample(grid, 1.5, 1.5, 2)).toBeCloseTo(40, 10);
  });

  it('averages the four neighbours at the exact centre of a cell quad', () => {
    const grid = gridFrom([10, 20, 30, 40], 2);
    expect(bilinearSample(grid, 1, 1, 2)).toBeCloseTo(25, 10);
  });

  it('interpolates linearly along each axis', () => {
    const grid = gridFrom([0, 100, 0, 100], 2);
    expect(bilinearSample(grid, 1, 0.5, 2)).toBeCloseTo(50, 10);
    expect(bilinearSample(grid, 0.75, 0.5, 2)).toBeCloseTo(25, 10);
  });

  it('never leaves the range of the four surrounding cells', () => {
    // The property that matters for a chart: interpolation can only ever produce a value
    // between its inputs, so no sample can invent a peak or a trench that is not in the data.
    const grid = gridFrom([-50, 1200, 300, 800], 2);
    for (let step = 0; step <= 20; step += 1) {
      const position = (step / 20) * 2;
      const value = bilinearSample(grid, position, position, 2);
      expect(value).toBeGreaterThanOrEqual(-50);
      expect(value).toBeLessThanOrEqual(1200);
    }
  });

  it('clamps at the tile edge rather than reading outside the grid', () => {
    // Deliberate design (see the module docblock): a sample within half a cell of the border
    // is computed from this tile alone, so the answer never depends on which neighbouring
    // tiles happen to be cached.
    const grid = gridFrom([10, 20, 30, 40], 2);
    expect(bilinearSample(grid, 0, 0, 2)).toBeCloseTo(10, 10);
    expect(bilinearSample(grid, 2, 2, 2)).toBeCloseTo(40, 10);
    expect(bilinearSample(grid, 0, 2, 2)).toBeCloseTo(30, 10);
  });

  it('is continuous — a tiny move in position makes a tiny move in value', () => {
    const grid = gridFrom([0, 1000, 0, 1000], 2);
    const before = bilinearSample(grid, 0.999, 1, 2);
    const after = bilinearSample(grid, 1.001, 1, 2);
    expect(Math.abs(after - before)).toBeLessThan(5);
  });

  it('refuses a grid whose length does not match the declared size', () => {
    // A mismatch means the caller handed us a tile decoded at another geometry; sampling it
    // would read the wrong row and return plausible nonsense.
    const grid = gridFrom([1, 2, 3, 4], 2);
    expect(() => bilinearSample(grid, 0.5, 0.5, 3)).toThrow(RangeError);
  });
});
