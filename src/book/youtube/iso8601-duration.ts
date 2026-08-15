/**
 * ISO 8601 durations, in the one direction each — and back again.
 *
 * ## Why both directions exist, and why neither is "the" parser
 * SPEC §5.4 stores `contentDetails.duration` TWICE: the provider's raw string and the parsed
 * seconds. The write path re-derives the string from the integer and refuses to write a row whose
 * derivation does not equal the original (SPEC §13 item 5, playbook §5's fidelity rule). That check
 * is only worth anything if the two functions are independent of each other in the way that matters
 * — {@link formatIso8601Duration} never reads the source string, so it cannot agree with a parser
 * that misread it.
 *
 * The failure this closes is the one range and ordering invariants cannot see: a parser that reads
 * `PT6M8S` as 68 seconds produces a plausible number, passes every `> 0` and `< 24 h` assertion, and
 * publishes a wrong duration on the page and inside `VideoObject`.
 *
 * ## What is deliberately NOT accepted
 * Weeks (`P2W`), fractional seconds (`PT1.5S`), months and years. None is emitted for a video
 * duration, and each would be a value {@link formatIso8601Duration} could not reproduce — so
 * accepting them would manufacture round-trip failures instead of preventing them. They are refused
 * at the parse step, where the reason is legible, rather than at the comparison, where it is not.
 */

/**
 * `P[nD][T[nH][nM][nS]]` — the subset YouTube emits for `contentDetails.duration`.
 *
 * Anchored at both ends: an unanchored pattern would match the tail of an arbitrary string and turn
 * a corrupt value into a confident number. At least one component is required, so bare `P` and `PT`
 * are refused by the emptiness guard below rather than parsed as zero.
 */
const ISO_DURATION = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/;

const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3_600;
const SECONDS_PER_DAY = 86_400;

/**
 * Seconds in an ISO 8601 duration string, or `null` when the string is not one this leg accepts.
 *
 * `null` rather than a throw: a single unreadable duration is one row the tour skips and counts, not
 * a reason to abort a tour that is refreshing 29 other videos (the fail-soft rule the whole leg
 * runs under).
 */
export function parseIso8601Duration(raw: string): number | null {
  const match = ISO_DURATION.exec(raw);
  if (match === null) return null;

  const [, days, hours, minutes, seconds] = match;
  // Every component absent means the string was `P`, `PT` or something equally empty: the regex
  // accepts those shapes, and reading them as 0 s would hand the round-trip a value it can never
  // reproduce while looking like a successful parse.
  if (days === undefined && hours === undefined && minutes === undefined && seconds === undefined) {
    return null;
  }

  return (
    Number(days ?? 0) * SECONDS_PER_DAY +
    Number(hours ?? 0) * SECONDS_PER_HOUR +
    Number(minutes ?? 0) * SECONDS_PER_MINUTE +
    Number(seconds ?? 0)
  );
}

/**
 * The canonical ISO 8601 rendering of a whole number of seconds.
 *
 * Canonical means: no zero-valued component is printed (`PT7M56S`, never `PT0H7M56S`), the date
 * part carries days only, and the `T` separator appears only when a time component follows it —
 * `P1D` for exactly one day, because `P1DT` is not a valid duration.
 *
 * A duration this function renders as `P1DT1H` may well have arrived as `PT25H`. That is not a bug
 * to paper over: the two strings are equal in meaning and different in text, and the write path
 * treats the difference as a refusal to write, so a provider that changed its rendering is noticed
 * instead of being silently normalised.
 */
export function formatIso8601Duration(totalSeconds: number): string {
  if (!Number.isInteger(totalSeconds) || totalSeconds < 0) {
    throw new Error(
      `formatIso8601Duration needs a non-negative integer, got ${String(totalSeconds)}`,
    );
  }

  const days = Math.floor(totalSeconds / SECONDS_PER_DAY);
  const hours = Math.floor((totalSeconds % SECONDS_PER_DAY) / SECONDS_PER_HOUR);
  const minutes = Math.floor((totalSeconds % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);
  const seconds = totalSeconds % SECONDS_PER_MINUTE;

  const time =
    (hours > 0 ? `${String(hours)}H` : '') +
    (minutes > 0 ? `${String(minutes)}M` : '') +
    // Zero is printed only when nothing else would be: `PT0S` is the one legal way to say "no
    // duration", and a bare `P` is not a duration at all.
    (seconds > 0 || (days === 0 && hours === 0 && minutes === 0) ? `${String(seconds)}S` : '');

  return `P${days > 0 ? `${String(days)}D` : ''}${time === '' ? '' : `T${time}`}`;
}

/**
 * The fidelity check itself: does `raw` survive parse → format unchanged?
 *
 * Returns the parsed seconds when it does, `null` when it does not — so a caller cannot obtain the
 * number without having passed the check, which is the property that keeps the guard from being
 * forgotten at one call site.
 */
export function parseDurationWithRoundTrip(raw: string): number | null {
  const seconds = parseIso8601Duration(raw);
  if (seconds === null) return null;
  return formatIso8601Duration(seconds) === raw ? seconds : null;
}
