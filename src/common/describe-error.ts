/**
 * One description for a caught value, so the same fault reads the same way wherever it is caught.
 *
 * ## The problem this closes
 * A `catch` binding is `unknown`, not `Error`, so every catch block has to answer "is this an
 * Error, and what do I write if it is not?". That question was answered by hand in 24 places and
 * in FOUR different spellings (`'unknown'`, `'unknown error'`, `String(error)`, and the
 * name-prefixed form), which means one fault reaches the log differently depending on which file
 * it passed through — and a log field that varies by accident cannot be grepped on purpose.
 *
 * ## Two forms, and deliberately no third
 * - {@link describeError} — the message alone, for a short log field or a `reason` property.
 * - {@link describeErrorWithName} — `Name: message`, for the places that need to tell an
 *   `AbortError` from a `TypeError` at a glance.
 *
 * The two-form split is the nuance the survey's counter-argument defended and it is preserved on
 * purpose; a third form (or an options bag, which is a third form wearing a hat) would re-open
 * exactly the divergence this file exists to close.
 *
 * ## Why the fallback is a constant
 * `String(error)` looks more informative and is not: on a plain object it yields
 * `[object Object]`, and on a null-prototype value it THROWS — inside a catch block, which is the
 * worst possible place to raise a second error. A constant cannot fail. `'unknown'` is the
 * spelling the majority of the call sites already used, and it matches the house prior art
 * (`describeTransport` in `src/upstream/upstream-http.client.ts`, which has answered this same
 * question privately, with a constant fallback, since the marine work).
 *
 * ## What this is NOT for
 * A caught value that carries structured fields a caller needs SEPARATELY — the fork/IPC reply in
 * `src/marine/ecmwf/grib/grib-decode-child.ts`, which sends `name` and `message` as two payload
 * properties — is not served by either form and stays hand-written. Flattening it into one string
 * would change a data contract, not a log line.
 */

/**
 * The single fallback, shared by both forms.
 *
 * Not exported: a caller that needs to compare against it is doing something this module should
 * be doing instead.
 */
const UNKNOWN = 'unknown';

/**
 * The message of a caught value, or `'unknown'` when it is not an `Error`.
 *
 * Use this where the surrounding text already says what failed — a log line that names the
 * operation, or a `reason` field on a metrics event whose name carries the context.
 */
export function describeError(error: unknown): string {
  return error instanceof Error ? error.message : UNKNOWN;
}

/**
 * `Name: message` for a caught value, or `'unknown'` when it is not an `Error`.
 *
 * Use this where the error CLASS is part of the diagnosis — an ingest or warmup target reporting
 * why a leg failed, where `AbortError: The operation was aborted` and
 * `TypeError: fetch failed` demand different responses from whoever reads it.
 */
export function describeErrorWithName(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : UNKNOWN;
}
