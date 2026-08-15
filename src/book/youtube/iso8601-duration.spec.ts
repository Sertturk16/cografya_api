import { describe, expect, it } from '@jest/globals';
import {
  formatIso8601Duration,
  parseDurationWithRoundTrip,
  parseIso8601Duration,
} from './iso8601-duration';

/**
 * SPEC §13 item 5 — the round-trip fidelity rule, unit half.
 *
 * Nothing here pins a FACT about a real video: the durations below are shapes (`PT6M8S`, `P1D`),
 * chosen for what they exercise in the two functions, not transcribed from the provider.
 */
describe('parseIso8601Duration', () => {
  it('reads the components the provider actually emits', () => {
    // The named failure: `PT6M8S` read as 68 seconds passes every range invariant and is wrong.
    expect(parseIso8601Duration('PT6M8S')).toBe(368);
    expect(parseIso8601Duration('PT7M56S')).toBe(476);
    expect(parseIso8601Duration('PT1H2M3S')).toBe(3_723);
    expect(parseIso8601Duration('PT45S')).toBe(45);
    expect(parseIso8601Duration('PT2H')).toBe(7_200);
    expect(parseIso8601Duration('P1D')).toBe(86_400);
    expect(parseIso8601Duration('P1DT1H')).toBe(90_000);
  });

  it('refuses what it cannot reproduce, instead of guessing', () => {
    for (const raw of [
      'P2W', // weeks — never emitted for a video, and unreproducible from seconds
      'PT1.5S', // fractional seconds
      'P1M', // months are ambiguous by definition
      'P1Y',
      'PT', // no component at all
      'P',
      '', // empty
      '6M8S', // no designator
      'xxPT6M8Sxx', // the unanchored-regex trap: a duration inside noise is not a duration
      'PT-5S',
    ]) {
      expect(`${raw}=${String(parseIso8601Duration(raw))}`).toBe(`${raw}=null`);
    }
  });
});

describe('formatIso8601Duration', () => {
  it('prints the canonical form, omitting every zero component', () => {
    expect(formatIso8601Duration(368)).toBe('PT6M8S');
    expect(formatIso8601Duration(476)).toBe('PT7M56S');
    expect(formatIso8601Duration(3_723)).toBe('PT1H2M3S');
    expect(formatIso8601Duration(7_200)).toBe('PT2H');
    expect(formatIso8601Duration(45)).toBe('PT45S');
  });

  it('never emits `P1DT` — a date part with an empty time part is not a duration', () => {
    expect(formatIso8601Duration(86_400)).toBe('P1D');
    expect(formatIso8601Duration(90_000)).toBe('P1DT1H');
    expect(formatIso8601Duration(86_460)).toBe('P1DT1M');
  });

  it('prints `PT0S` for zero, because a bare `P` is not a duration', () => {
    expect(formatIso8601Duration(0)).toBe('PT0S');
  });

  it('refuses a non-integer or negative input rather than printing nonsense', () => {
    expect(() => formatIso8601Duration(1.5)).toThrow();
    expect(() => formatIso8601Duration(-1)).toThrow();
  });
});

describe('parseDurationWithRoundTrip', () => {
  it('returns the seconds only when the string survives parse → format unchanged', () => {
    expect(parseDurationWithRoundTrip('PT6M8S')).toBe(368);
    expect(parseDurationWithRoundTrip('P1D')).toBe(86_400);
  });

  it('refuses an equivalent-but-differently-written duration', () => {
    // `PT25H` means exactly what `P1DT1H` means; the strings differ, so the row is not written.
    // Refusing is the designed behaviour: a provider that changed its rendering must be noticed,
    // not silently normalised into a column that claims to hold the raw value.
    expect(parseDurationWithRoundTrip('PT25H')).toBeNull();
    expect(parseDurationWithRoundTrip('PT0H7M56S')).toBeNull();
    expect(parseDurationWithRoundTrip('PT60S')).toBeNull();
  });

  it('is the ONLY way to obtain the seconds, so the guard cannot be skipped at a call site', () => {
    // A structural statement about the module's surface rather than about one value: the checked
    // form returns null exactly where the unchecked one returns a number.
    expect(parseIso8601Duration('PT60S')).toBe(60);
    expect(parseDurationWithRoundTrip('PT60S')).toBeNull();
  });
});
