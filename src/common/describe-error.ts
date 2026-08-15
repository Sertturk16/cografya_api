/**
 * One description for a caught value, so the same fault reads the same way wherever it is caught.
 *
 * ## The problem this closes
 * A `catch` binding is `unknown`, not `Error`, so every catch block has to answer "is this an
 * Error, and what do I write if it is not?". That question is answered by hand in 24 places, and
 * the ELSE half of the answer is written SIX different ways:
 *
 * | Fallback | Where |
 * |---|---|
 * | `'unknown'` | the majority — `upstream/cache/*`, `provider-budget.ts`, `cmems-*`, `ecmwf-*`, … |
 * | `'unknown error'` | `src/upstream/scheduled-warmup.service.ts:260,277,308` |
 * | `String(error)` | `src/upstream/upstream-http.client.ts:489` |
 * | `typeof error` | `src/air-quality/cams/cams-decode.ts:159` |
 * | `'result href refused'` | `src/air-quality/cams/air-quality-ingest.target.ts:578` |
 * | `'Error'` | `src/marine/ecmwf/grib/grib-decode-child.ts:49` |
 *
 * One fault therefore reaches the log differently depending on which file it passed through, and
 * a log field that varies by accident cannot be grepped on purpose.
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
 * ## The TEST is inherited exactly; the FALLBACK is deliberately not
 * Both forms are precisely `error instanceof Error`, with no special cases layered on top, so a
 * conversion takes the same BRANCH the hand-written check took, on every value, in every realm.
 * That is a statement about the test and nothing more. It is **not** a promise that the output is
 * unchanged: on the non-`Error` branch these forms return `'unknown'`, and five of the six
 * spellings above are something else. Converging those fallbacks is the change this module exists
 * to make — so the conversion round must read the else-branch at each site rather than treating
 * the swap as mechanical.
 *
 * Worth knowing about the sharpest edge: an `AbortError` from `AbortSignal.timeout()` is a
 * `DOMException`, which in Node IS an `Error` and therefore reads as `AbortError: …` — but the
 * relationship, not that string, is what the unit spec pins, because a test sandbox can answer
 * differently for the same value. Where the ABORT REASON itself must drive behaviour rather than
 * text, the answer is not this module: see `describeTransport` in
 * `src/upstream/upstream-http.client.ts`, which matches `DOMException` by name FIRST and maps it
 * to `'timed out'` / `'aborted'` before ever reaching the generic form.
 *
 * ## Sites whose fallback carries MEANING — not conversion targets
 * At these the else-branch is information, not filler, and `'unknown'` would delete it:
 *
 * - **`src/air-quality/cams/air-quality-ingest.target.ts:578`** — the strongest case, because the
 *   value is not a log line at all. It is the `reason` argument to `terminate(...)`, which writes
 *   it as `lastError` onto the job record (`:1019`) and onto the run through `store.updateRun`
 *   (`:1042`). That is STORED RUN STATE, on the off-allowlist SSRF-class refusal path. A
 *   non-`Error` throw would persist `'unknown'` where the row said `'result href refused'`, and
 *   nobody reading that run could tell a host refusal from any other failure.
 * - **`src/air-quality/cams/cams-decode.ts:159`** — `typeof error` names the KIND of the thrown
 *   value, which is the diagnosis when the decoder throws something that is not an `Error`.
 * - **`src/marine/ecmwf/grib/grib-decode-child.ts:49-50`** — the fork/IPC reply sends `name` and
 *   `message` as two separate payload properties. Flattening them into one string would change a
 *   data contract, not a log line.
 *
 * One site is safe for the opposite reason: **`src/upstream/upstream-http.client.ts:489`** falls
 * back to `String(error)`, but its non-`Error` branch is unreachable in effect — `:496` rethrows
 * anything that is not `UpstreamSchemaError`/`SyntaxError`. Converting it changes no observable
 * output. That reachability argument rescues this one site and no other.
 *
 * ## What this is NOT for
 * A caught value that carries structured fields a caller needs SEPARATELY is not served by either
 * form and stays hand-written — the `grib-decode-child.ts` reply named above is the live example.
 *
 * A caught value whose PAYLOAD IS the diagnosis keeps `String(error)`. `src/database/era5/hdf5/
 * jsfive.adapter.ts:212,256` exist because jsfive is measured to throw a bare string — the repo's
 * own comment at `:245-249` records it — so the stringified value is the one sentence naming which
 * contract broke. These carry no `instanceof Error` test today and must not acquire one.
 *
 * **Neither form redacts.** Both return `error.message` / `error.name` verbatim, so a secret that
 * reached an error message reaches the output. Redaction stays the CALLER's job:
 * `src/air-quality/cams/air-quality-ingest.target.ts:99-103` wraps the identical expression in
 * `this.redact(...)` (the `adsRedactor`, bound to `ADS_API_KEY`). At that site — and at `:578`,
 * whose `reason` is redacted inside `terminate` — the wrapper sits OUTSIDE the expression being
 * swapped, so a conversion that replaces only the ternary keeps it. Keep it deliberately, not by
 * luck: a conversion that widens its selection to the surrounding expression drops the redactor.
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
