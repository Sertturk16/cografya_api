import { describe, expect, it } from '@jest/globals';
import {
  buildEcmwfUrl,
  candidateCycles,
  cycleAgeSeconds,
  cycleSteps,
  indexExpectation,
  isCycleWithinMaxAge,
  orderStepsForIngest,
} from './ecmwf-cycle';
import { EcmwfContractError } from './ecmwf.errors';

/**
 * All structural (CONVENTIONS §2): the arithmetic of cycle selection, never any weather fact.
 * The URL layout itself was verified live by the probe run (committed artifact); these tests pin
 * the FORMATTER so it cannot drift from what that evidence recorded.
 */

describe('candidateCycles', () => {
  it('floors now − 9 h to the previous 6-hour slot and walks back three more, newest first', () => {
    // 2026-07-30 22:00 UTC − 9 h = 13:00 → floors to 12z; then 06z, 00z, 18z(-1d).
    const candidates = candidateCycles(new Date('2026-07-30T22:00:00.000Z'));
    expect(candidates.map((cycle) => cycle.toISOString())).toEqual([
      '2026-07-30T12:00:00.000Z',
      '2026-07-30T06:00:00.000Z',
      '2026-07-30T00:00:00.000Z',
      '2026-07-29T18:00:00.000Z',
    ]);
  });

  it('crosses a UTC midnight boundary without inventing a 24z', () => {
    // 03:00 − 9 h = yesterday 18:00 → 18z of the previous day.
    const candidates = candidateCycles(new Date('2026-08-01T03:00:00.000Z'));
    expect(candidates[0]?.toISOString()).toBe('2026-07-31T18:00:00.000Z');
  });
});

describe('buildEcmwfUrl / indexExpectation', () => {
  const cycle = new Date('2026-07-30T12:00:00.000Z');

  it('produces the layout the probe artifact verified live', () => {
    expect(buildEcmwfUrl('https://data.ecmwf.int/forecasts', cycle, 'wave', 72, 'index')).toBe(
      'https://data.ecmwf.int/forecasts/20260730/12z/ifs/0p25/wave/20260730120000-72h-wave-fc.index',
    );
    expect(buildEcmwfUrl('https://mirror.example', cycle, 'oper', 0, 'grib2')).toBe(
      'https://mirror.example/20260730/12z/ifs/0p25/oper/20260730120000-0h-oper-fc.grib2',
    );
  });

  it('derives the .index expectation from the SAME cycle date the URL is built from', () => {
    // The ask and the check must not have two formatters — that is the drift the request
    // assertion exists to catch, and it cannot catch it inside itself.
    expect(indexExpectation(cycle, 'oper', 3)).toEqual({
      date: '20260730',
      time: '1200',
      step: '3',
      stream: 'oper',
    });
  });

  it('formats a midnight cycle as 00z / 0000', () => {
    const midnight = new Date('2026-07-31T00:00:00.000Z');
    expect(buildEcmwfUrl('https://x', midnight, 'oper', 0, 'index')).toContain('/00z/');
    expect(indexExpectation(midnight, 'oper', 0).time).toBe('0000');
  });
});

describe('cycleSteps', () => {
  it('yields 41 steps for the owner-ruled 120 h horizon', () => {
    const steps = cycleSteps(120);
    expect(steps.length).toBe(41);
    expect(steps[0]).toBe(0);
    expect(steps[steps.length - 1]).toBe(120);
  });

  it('refuses a horizon that is not a positive multiple of the step', () => {
    expect(() => cycleSteps(100)).toThrow(EcmwfContractError);
    expect(() => cycleSteps(0)).toThrow(EcmwfContractError);
  });
});

describe('orderStepsForIngest', () => {
  const cycle = new Date('2026-07-30T12:00:00.000Z');

  it('puts the step nearest to now FIRST, then the rest ascending', () => {
    // now = cycle + 13 h → nearest 3-hourly step is +12 h.
    const now = new Date('2026-07-31T01:00:00.000Z');
    const ordered = orderStepsForIngest([0, 3, 6, 9, 12, 15, 18], cycle, now);
    expect(ordered).toEqual([12, 0, 3, 6, 9, 15, 18]);
  });

  it('keeps plain ascending order when the nearest step is the first missing one', () => {
    const now = new Date('2026-07-30T12:30:00.000Z');
    expect(orderStepsForIngest([0, 3, 6], cycle, now)).toEqual([0, 3, 6]);
  });

  it('handles an empty missing set', () => {
    expect(orderStepsForIngest([], cycle, new Date())).toEqual([]);
  });
});

describe('the THIRD staleness ceiling (SPEC §9.4)', () => {
  const cycle = new Date('2026-07-30T12:00:00.000Z');

  it('measures cycle age in seconds and never negative', () => {
    expect(cycleAgeSeconds(cycle, new Date('2026-07-30T13:00:00.000Z'))).toBe(3_600);
    expect(cycleAgeSeconds(cycle, new Date('2026-07-30T11:00:00.000Z'))).toBe(0);
  });

  it('passes a normally-aged cycle and refuses one older than the ceiling', () => {
    const maxAge = 86_400;
    // Normal in-use age is 7–15 h (cadence + publication lag).
    expect(isCycleWithinMaxAge(cycle, new Date('2026-07-31T02:00:00.000Z'), maxAge)).toBe(true);
    // Exactly at the ceiling is still publishable; one second past is not.
    expect(isCycleWithinMaxAge(cycle, new Date('2026-07-31T12:00:00.000Z'), maxAge)).toBe(true);
    expect(isCycleWithinMaxAge(cycle, new Date('2026-07-31T12:00:01.000Z'), maxAge)).toBe(false);
  });
});
