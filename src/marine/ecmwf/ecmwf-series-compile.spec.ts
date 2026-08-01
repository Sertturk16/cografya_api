import { describe, expect, it } from '@jest/globals';
import type {
  EcmwfStoredSeries,
  EcmwfStoredSupport,
} from '../entities/marine-ecmwf-point-series.entity';
import {
  compileEcmwfSeries,
  selectPublishableCycle,
  selectPublishedRun,
} from './ecmwf-series-compile';
import { EcmwfContractError } from './ecmwf.errors';

const CYCLE = new Date('2026-07-30T12:00:00.000Z');
const SUPPORT: EcmwfStoredSupport = { u10: 'ok', v10: 'ok', swh: 'ok', mwd: 'ok' };

function stored(steps: number[], overrides: Partial<EcmwfStoredSeries> = {}): EcmwfStoredSeries {
  return {
    steps,
    u10: steps.map(() => 10), // wind towards the east
    v10: steps.map(() => 0),
    swh: steps.map((_step, index) => index * 0.1),
    mwd: steps.map(() => 45),
    ...overrides,
  };
}

describe('compileEcmwfSeries', () => {
  it('keeps the parallel-array guarantee: every array is exactly timesUtc.length', () => {
    const { series } = compileEcmwfSeries({
      stored: stored([0, 3, 6]),
      support: SUPPORT,
      cycleUtc: CYCLE,
      now: new Date('2026-07-30T13:00:00.000Z'),
    });

    expect(series.timesUtc.length).toBe(3);
    for (const array of [
      series.seaSurfaceTemperature,
      series.waveHeight,
      series.waveDirection,
      series.windSpeed10m,
      series.windDirection10m,
    ]) {
      expect(array.length).toBe(series.timesUtc.length);
    }
  });

  it('publishes honest time metadata: cycle as modelRunAtUtc, last held step as horizonEndUtc', () => {
    const { series } = compileEcmwfSeries({
      stored: stored([0, 3, 6]),
      support: SUPPORT,
      cycleUtc: CYCLE,
      now: new Date('2026-07-30T13:00:00.000Z'),
    });

    expect(series.stepHours).toBe(3);
    expect(series.modelRunAtUtc).toBe('2026-07-30T12:00:00.000Z');
    expect(series.timesUtc[0]).toBe('2026-07-30T12:00:00.000Z');
    // A PARTIAL cycle: the horizon is what is actually held, and it grows tour by tour.
    expect(series.horizonEndUtc).toBe('2026-07-30T18:00:00.000Z');
  });

  it('derives wind at read time from the stored raw components (u=+10, v=0 → 270°, 10 m/s)', () => {
    const { series } = compileEcmwfSeries({
      stored: stored([0]),
      support: SUPPORT,
      cycleUtc: CYCLE,
      now: CYCLE,
    });
    expect(series.windSpeed10m[0]).toBe(10);
    expect(series.windDirection10m[0]).toBe(270);
    // mwd is already "coming from" degrees true — published verbatim.
    expect(series.waveDirection[0]).toBe(45);
  });

  it('keeps seaSurfaceTemperature null for its whole length — ECMWF publishes no SST (measured)', () => {
    const { series } = compileEcmwfSeries({
      stored: stored([0, 3]),
      support: SUPPORT,
      cycleUtc: CYCLE,
      now: CYCLE,
    });
    expect(series.seaSurfaceTemperature).toEqual([null, null]);
  });

  it('propagates a stored null as a null sample, never as 0', () => {
    const { series } = compileEcmwfSeries({
      stored: stored([0, 3], { u10: [null, 10], v10: [null, 0] }),
      support: SUPPORT,
      cycleUtc: CYCLE,
      now: CYCLE,
    });
    expect(series.windSpeed10m).toEqual([null, 10]);
    expect(series.windDirection10m).toEqual([null, 270]);
  });

  it('serves only ONE contiguous run when the stored steps have a hole, and says how much it withheld', () => {
    // 0,3 then a hole, then 12 (the nearest-to-now step landed first, ascending fill was
    // interrupted). Publishing across the hole would make stepHours: 3 a lie at one index.
    // now is 13:00 → nearest step is 0h → the run containing it, [0, 3], is published.
    const { series, withheldSteps } = compileEcmwfSeries({
      stored: stored([0, 3, 12]),
      support: SUPPORT,
      cycleUtc: CYCLE,
      now: new Date('2026-07-30T13:00:00.000Z'),
    });

    expect(series.timesUtc.length).toBe(2);
    expect(series.horizonEndUtc).toBe('2026-07-30T15:00:00.000Z');
    expect(withheldSteps).toBe(1);
  });

  it('anchors the published run on the step nearest to NOW, not on the first stored step (CR-2)', () => {
    // Stored [0, 9]: the nearest-to-now step (+9 h) landed first and a budget stop interrupted
    // the ascending fill. Anchoring at steps[0] would publish only [0], whose valid time is
    // 10 h old — M2's 3 h validAt ceiling would then suppress the point while a valid-now
    // sample sits in Postgres. The run containing the nearest step must win.
    const { series, withheldSteps } = compileEcmwfSeries({
      stored: stored([0, 9]),
      support: SUPPORT,
      cycleUtc: CYCLE,
      now: new Date('2026-07-30T22:00:00.000Z'), // ≈ cycle + 10 h → nearest step is +9 h
    });

    expect(series.timesUtc).toEqual(['2026-07-30T21:00:00.000Z']);
    expect(series.horizonEndUtc).toBe('2026-07-30T21:00:00.000Z');
    expect(new Date(series.validAtMs).toISOString()).toBe('2026-07-30T21:00:00.000Z');
    expect(withheldSteps).toBe(1);
  });

  it('anchors validAtMs on the held step nearest to now', () => {
    const { series } = compileEcmwfSeries({
      stored: stored([0, 3, 6, 9]),
      support: SUPPORT,
      cycleUtc: CYCLE,
      // 19:20 UTC → nearest held step is +6 h (18:00) vs +9 h (21:00): 18:00 wins by 80 min.
      now: new Date('2026-07-30T19:20:00.000Z'),
    });
    expect(new Date(series.validAtMs).toISOString()).toBe('2026-07-30T18:00:00.000Z');
  });

  it('refuses zero ingested steps — missing evidence, not an empty chart', () => {
    expect(() =>
      compileEcmwfSeries({
        stored: stored([]),
        support: SUPPORT,
        cycleUtc: CYCLE,
        now: CYCLE,
      }),
    ).toThrow(EcmwfContractError);
  });
});

describe('selectPublishedRun', () => {
  it('expands the run BOTH ways around the nearest-to-now anchor', () => {
    // now ≈ +7 h → anchor +6; the contiguous neighbourhood [6..12] is published — the isolated
    // step 0 before the hole and the [18, 21] run after the second hole are both withheld.
    const run = selectPublishedRun(
      [0, 6, 9, 12, 18, 21],
      CYCLE,
      new Date('2026-07-30T19:00:00.000Z'),
    );
    expect(run).toEqual({ startIndex: 1, endIndexExclusive: 4 });
  });

  it('returns the whole array when there is no hole', () => {
    expect(selectPublishedRun([0, 3, 6], CYCLE, new Date('2026-07-30T13:00:00.000Z'))).toEqual({
      startIndex: 0,
      endIndexExclusive: 3,
    });
  });

  it('returns the empty run for an empty step list', () => {
    expect(selectPublishedRun([], CYCLE, CYCLE)).toEqual({ startIndex: 0, endIndexExclusive: 0 });
  });
});

describe('selectPublishableCycle', () => {
  const NOW = new Date('2026-07-30T22:00:00.000Z');
  const NEWER = new Date('2026-07-30T18:00:00.000Z');

  it('keeps a COMPLETE incumbent over a 1-step newer cycle (CR-1: the horizon must not collapse)', () => {
    const winner = selectPublishableCycle(
      [
        { cycleUtc: NEWER, steps: [3] }, // newest first, one step landed
        { cycleUtc: CYCLE, steps: [0, 3, 6, 9, 12] }, // complete incumbent
      ],
      NOW,
    );
    expect(winner).toBe(1);
  });

  it('hands the win to the newer cycle as soon as its published run is at least as long', () => {
    const winner = selectPublishableCycle(
      [
        { cycleUtc: NEWER, steps: [0, 3, 6, 9, 12] },
        { cycleUtc: CYCLE, steps: [0, 3, 6, 9, 12] },
      ],
      NOW,
    );
    expect(winner).toBe(0);
  });

  it('publishes a lone partial cycle — a cold start has no competition to lose to', () => {
    expect(selectPublishableCycle([{ cycleUtc: NEWER, steps: [3] }], NOW)).toBe(0);
  });

  it('returns null when nothing holds a publishable step', () => {
    expect(selectPublishableCycle([], NOW)).toBeNull();
    expect(selectPublishableCycle([{ cycleUtc: NEWER, steps: [] }], NOW)).toBeNull();
  });
});
