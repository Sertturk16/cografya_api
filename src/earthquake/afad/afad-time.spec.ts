// The zone this file needs is pinned where Node actually reads it: `pnpm test:unit` runs jest as
// `TZ=Europe/Istanbul jest …`, so the variable is set before the process starts and before any
// `Date` can cache the zone. Setting `process.env.TZ` HERE does not work and the attempt is not
// repeated — `import` statements are hoisted above any statement in the module body, so the
// assignment ran too late and CI (a UTC runner) silently ignored it (review #118 TA118-I2).
//
// It matters because the regression this file exists to catch — reading AFAD's suffix-less UTC
// stamp as LOCAL time — produces the CORRECT instant when the process zone IS UTC. A broken parser
// therefore passes on a UTC runner and fails here.

import { describe, expect, it } from '@jest/globals';
import { formatAfadUtc, parseAfadUtc, toAfadQueryStamp } from './afad-time';

describe('the timezone this suite runs in', () => {
  it('is not UTC, which is the precondition the regression detector below depends on', () => {
    // This is the pin's own control. If the `TZ=` prefix is ever dropped from `test:unit`, this
    // case fails FIRST and says why, rather than leaving the naive-constructor comparison to fail
    // with an arithmetic message that reads like a parser bug.
    expect(new Date('2026-08-10T10:07:59').getTimezoneOffset()).toBe(-180);
  });
});

describe('parseAfadUtc', () => {
  it('reads a suffix-less provider stamp as UTC, not as local time', () => {
    const parsed = parseAfadUtc('2026-08-10T10:07:59');
    expect(parsed?.instant.getTime()).toBe(Date.UTC(2026, 7, 10, 10, 7, 59));
    expect(parsed?.fractionDigits).toBe(0);
  });

  it('is three hours away from the Turkish-local reading of the same string', () => {
    // The control for the assertion above, and the whole reason this parser exists. AFAD's own
    // page shows this event under a `Tarih(TS)` heading — Turkish local time — while the API sends
    // the same instant with no suffix at all. Reading the API's string as Turkish local time
    // yields an instant three hours EARLIER than the truth, and no range, ordering or count
    // invariant anywhere can see the difference.
    //
    // TWO comparisons, deliberately, because each catches what the other cannot:
    // - the `+03:00` one is ZONE-INDEPENDENT and stays meaningful wherever this runs;
    // - the naive-constructor one is the actual REGRESSION DETECTOR. `new Date(raw)` is the exact
    //   refactor that would reintroduce the bug, and asserting we disagree with it is only a real
    //   assertion in a non-UTC zone — hence the pin above.
    const raw = '2026-08-10T10:07:59';
    const asTurkishLocal = new Date('2026-08-10T10:07:59+03:00').getTime();
    const parsed = parseAfadUtc(raw);

    expect(parsed?.instant.getTime()).not.toBe(asTurkishLocal);
    expect((parsed?.instant.getTime() ?? 0) - asTurkishLocal).toBe(3 * 3_600_000);
    expect(parsed?.instant.getTime()).not.toBe(new Date(raw).getTime());
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
