/**
 * AFAD's timestamps: UTC instants published WITHOUT a timezone suffix.
 *
 * ## The most expensive silent error on this line
 * `date` is UTC — proven three independent ways (Pazarcık M7.7's international origin time, İzmit
 * M7.4's, and AFAD's own page showing the same event under a `Tarih(TS)` heading exactly +3 hours
 * later; SPEC §3.3). But the string carries no `Z`, so `new Date("2026-08-10T10:07:59")` reads it
 * as LOCAL time and publishes every earthquake three hours wrong wherever the process happens to
 * run. No range, ordering or count invariant can see that: every value stays perfectly plausible.
 *
 * So parsing here is arithmetic on the digits, never a `Date` constructor over the raw string, and
 * the API publishes UTC only — converting to Turkish time is the web repo's single layer
 * (`DEC 2026-08-12k` §3). Two layers converting is the same bug applied twice.
 */

/** `YYYY-MM-DDTHH:mm:ss` with an OPTIONAL fraction of 1–6 digits (measured: 0 digits today, 2 on the 1999 row). */
const AFAD_TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?$/;

export interface AfadInstant {
  /** The instant itself, at millisecond resolution. */
  readonly instant: Date;
  /** How many fraction digits the provider actually wrote (0 when it wrote none). */
  readonly fractionDigits: number;
  /**
   * The value of the digits BEYOND millisecond resolution.
   *
   * Non-zero means the stored instant is not the provider's instant. `occurred_at_utc` refuses
   * such a row (the fidelity rule); `lastUpdateDate`, whose measured form carries microseconds,
   * accepts it and records the truncation as a stated precision loss.
   */
  readonly subMillisecondRemainder: number;
}

/**
 * Parse one AFAD timestamp, or `null` when it is not the shape the contract promises.
 *
 * `null` rather than a throw: a single malformed row is that ROW's failure and the tour continues
 * (the E1 FK rider generalised — one bad row must never be able to stop an ingest cycle).
 */
export function parseAfadUtc(raw: string): AfadInstant | null {
  const match = AFAD_TIMESTAMP.exec(raw);
  if (match === null) return null;

  const [, yearText, monthText, dayText, hourText, minuteText, secondText, fractionText] = match;
  if (
    yearText === undefined ||
    monthText === undefined ||
    dayText === undefined ||
    hourText === undefined ||
    minuteText === undefined ||
    secondText === undefined
  ) {
    return null;
  }

  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);

  // Range-check BEFORE `Date.UTC`, which silently rolls over: month 13 becomes next January and
  // 31 February becomes 3 March, both of which would then round-trip as a different, plausible day.
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (hour > 23 || minute > 59 || second > 59) return null;

  const fractionDigits = fractionText?.length ?? 0;
  const milliseconds =
    fractionDigits === 0 ? 0 : Number((fractionText ?? '').slice(0, 3).padEnd(3, '0'));
  const remainderText = fractionDigits > 3 ? (fractionText ?? '').slice(3) : '';
  const subMillisecondRemainder = remainderText === '' ? 0 : Number(remainderText);

  const epochMs = Date.UTC(year, month - 1, day, hour, minute, second, milliseconds);
  const instant = new Date(epochMs);
  // The roll-over catch: 2026-02-30 passes every range check above and lands on 2 March.
  if (instant.getUTCFullYear() !== year || instant.getUTCMonth() !== month - 1) return null;
  if (instant.getUTCDate() !== day) return null;

  return { instant, fractionDigits, subMillisecondRemainder };
}

/**
 * Re-serialise an instant in the provider's own form, with the fraction width it used.
 *
 * The fidelity rule's other half (SPEC §13.1): the round trip must reproduce the provider's string
 * byte for byte, so the width matters — the 1999 row wrote `.07`, and a fixed 3-digit `.070` would
 * disagree with it while describing the same instant.
 */
export function formatAfadUtc(instant: Date, fractionDigits: number): string {
  const base = instant.toISOString().slice(0, 19);
  if (fractionDigits <= 0) return base;
  const milliseconds = instant.getUTCMilliseconds().toString().padStart(3, '0');
  return `${base}.${milliseconds.padEnd(Math.max(fractionDigits, 3), '0').slice(0, fractionDigits)}`;
}

/**
 * The stamp AFAD's `start`/`end` query parameters take: `YYYY-MM-DDTHH:mm:ss`, no zone, no
 * fraction — the exact form the SPEC's ten measurements used.
 */
export function toAfadQueryStamp(instant: Date): string {
  return instant.toISOString().slice(0, 19);
}
