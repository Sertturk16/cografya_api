// The timezone is set BEFORE anything imports a Date-using module, and it is set to a zone with a
// non-zero offset ON PURPOSE. The bug this whole file guards against — reading AFAD's suffix-less
// UTC string as local time — is INVISIBLE when the process runs in UTC, which is exactly what CI
// containers do by default. Under `Europe/Istanbul` a naive `new Date(raw)` is three hours off,
// so every assertion below would fail loudly if the parser ever regressed to one.
process.env.TZ = 'Europe/Istanbul';

import { describe, expect, it } from '@jest/globals';
import { formatAfadUtc, parseAfadUtc, toAfadQueryStamp } from './afad-time';

describe('parseAfadUtc', () => {
  it('reads a suffix-less provider stamp as UTC, not as local time', () => {
    const parsed = parseAfadUtc('2026-08-10T10:07:59');
    expect(parsed?.instant.getTime()).toBe(Date.UTC(2026, 7, 10, 10, 7, 59));
    expect(parsed?.fractionDigits).toBe(0);
  });

  it('is not what a naive Date constructor would produce in this timezone', () => {
    // The control for the assertion above: it proves the local-time reading really is different
    // here, so the first test is testing something rather than passing by coincidence.
    const naive = new Date('2026-08-10T10:07:59').getTime();
    const parsed = parseAfadUtc('2026-08-10T10:07:59');
    expect(parsed?.instant.getTime()).not.toBe(naive);
    expect(naive - (parsed?.instant.getTime() ?? 0)).toBe(-3 * 3_600_000);
  });

  it('keeps a fractional second and reports its width', () => {
    const parsed = parseAfadUtc('1999-08-17T00:01:39.07');
    expect(parsed?.instant.getTime()).toBe(Date.UTC(1999, 7, 17, 0, 1, 39, 70));
    expect(parsed?.fractionDigits).toBe(2);
    expect(parsed?.subMillisecondRemainder).toBe(0);
  });

  it('reports precision finer than a millisecond instead of hiding it', () => {
    const parsed = parseAfadUtc('2026-08-06T12:56:14.719149');
    expect(parsed?.instant.getUTCMilliseconds()).toBe(719);
    expect(parsed?.subMillisecondRemainder).toBe(149);
  });

  it.each([
    ['2026-08-10T10:07:59Z', 'a zone suffix the provider never sends'],
    ['2026-08-10 10:07:59', 'a space instead of the T'],
    ['2026-13-10T10:07:59', 'an impossible month'],
    ['2026-02-30T10:07:59', 'a day that rolls over into the next month'],
    ['2026-08-10T24:07:59', 'an impossible hour'],
    ['', 'an empty string'],
    ['not-a-date', 'prose'],
  ])('refuses %s (%s)', (raw) => {
    expect(parseAfadUtc(raw)).toBeNull();
  });
});

describe('formatAfadUtc', () => {
  it('round-trips a whole-second stamp byte for byte', () => {
    const raw = '2026-08-10T10:07:59';
    const parsed = parseAfadUtc(raw);
    expect(parsed).not.toBeNull();
    expect(formatAfadUtc(parsed?.instant ?? new Date(0), parsed?.fractionDigits ?? 0)).toBe(raw);
  });

  it('round-trips a two-digit fraction at the width the provider used', () => {
    const raw = '1999-08-17T00:01:39.07';
    const parsed = parseAfadUtc(raw);
    expect(formatAfadUtc(parsed?.instant ?? new Date(0), parsed?.fractionDigits ?? 0)).toBe(raw);
  });
});

describe('toAfadQueryStamp', () => {
  it('emits the zone-less second-resolution form the query parameters take', () => {
    expect(toAfadQueryStamp(new Date(Date.UTC(2026, 7, 11, 0, 0, 0, 500)))).toBe(
      '2026-08-11T00:00:00',
    );
  });
});
