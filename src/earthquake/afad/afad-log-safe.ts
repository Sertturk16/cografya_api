/**
 * Rendering provider-controlled text so it cannot forge a log line (CWE-117).
 *
 * Every string in an AFAD row is chosen by the provider, and several reach a log message verbatim:
 * the refusal reasons name the value they refused, and the tour names the event id it could not
 * write. JSON permits `\n` and `\r` inside a string, NestJS's `Logger` writes the message to stdout
 * unescaped, and an aggregator reading that stream cannot tell a forged line from a real one.
 *
 * `JSON.stringify` is the whole mechanism: it escapes the control characters and adds the quotes
 * these messages already carried by hand, so the rendered shape is unchanged and only the escaping
 * is new. The ingest target already wrote provider event ids through `JSON.stringify` when it
 * reported disappearances — this makes that the rule rather than the exception, fourteen lines from
 * where the raw form used to sit (review #118 SEC118-M4).
 *
 * ## The length bound is part of the escaping, not a separate nicety
 * `location` is length-checked before it is quoted, but `date`, `latitude`, `longitude`, `depth`
 * and `magnitude` are not: they are bounded only by `EARTHQUAKE_RESPONSE_MAX_BYTES` (4 MiB), so a
 * single malformed row could otherwise put a megabyte on one log line. A refusal reason is a
 * diagnosis, so the value is shown at diagnostic length and the truncation says so.
 */

/** Longest provider value a single log line shows before it is cut. */
const MAX_QUOTED_LENGTH = 160;

/** Appended to a value that was cut, so a truncated value never reads as a complete one. */
const TRUNCATION_MARKER = '…';

/**
 * Quote a provider-controlled value for a log line or a stored refusal reason.
 *
 * Returns the value JSON-escaped and surrounded by double quotes — `"Ege Denizi"` — with anything
 * beyond {@link MAX_QUOTED_LENGTH} characters replaced by a single ellipsis INSIDE the quotes.
 */
export function quoteProviderText(value: unknown): string {
  const asText = typeof value === 'string' ? value : String(value);
  const shown =
    asText.length > MAX_QUOTED_LENGTH
      ? `${asText.slice(0, MAX_QUOTED_LENGTH)}${TRUNCATION_MARKER}`
      : asText;
  return JSON.stringify(shown);
}
