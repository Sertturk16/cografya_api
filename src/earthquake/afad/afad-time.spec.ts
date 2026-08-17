// Asking for a non-UTC process timezone: the bug this file guards against — reading AFAD's
// suffix-less UTC stamp as LOCAL time — is invisible in UTC, which is exactly what a CI container
// runs in. This is BEST-EFFORT and nothing below depends on it: `import` statements are hoisted
// above this line and Node caches the zone at first use, so the assignment may simply not take —
// it did not, on CI, which is how the first version of the control below turned red.
//
// So the control is written to be ZONE-INDEPENDENT instead: it compares our answer with the
// Turkish-local reading spelled out explicitly (`+03:00`), which is the same comparison in every
// timezone on earth and stays meaningful whatever the runner does.
process.env.TZ = 'Europe/Istanbul';

import { describe, expect, it } from '@jest/globals';
import { formatAfadUtc, parseAfadUtc, toAfadQueryStamp } from './afad-time';

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
    const asTurkishLocal = new Date('2026-08-10T10:07:59+03:00').getTime();
    const parsed = parseAfadUtc('2026-08-10T10:07:59');

    expect(parsed?.instant.getTime()).not.toBe(asTurkishLocal);
    expect((parsed?.instant.getTime() ?? 0) - asTurkishLocal).toBe(3 * 3_600_000);
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
