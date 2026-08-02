import type { UpstreamFailureKind } from './upstream.types';

/**
 * Response byte cap for the request path.
 *
 * `AbortSignal.timeout` bounds wall-clock, not payload: a provider that answers fast and never
 * stops sending would otherwise fill the heap. 2 MB is generous for the shapes we ask for (the
 * biggest measured Faz-1 body is Open-Meteo's 31-point marine batch at ~135 KB) and far below
 * anything that could hurt.
 *
 * Deliberately SEPARATE from the import tools' own caps in `src/database/` (8 MB for the M1
 * marine probe and the climate fetch, 16 MB for the ECMWF probe, whose byte ranges are megabytes
 * of GRIB by nature). Those guard hand-run, offline imports whose evidence is committed to the
 * repo; this one guards the request path of a live server. They have different lifecycles,
 * different limits and different failure modes, and collapsing them would tie the frozen import
 * evidence to a runtime config surface. If you change one, decide about the other on purpose —
 * the LIMIT is what differs, never the metering, which every caller gets from
 * {@link readBodyCappedBytes}.
 */
export const UPSTREAM_MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

/**
 * How the running server identifies itself to every third-party provider.
 *
 * Honest, and NOT pretending to be a browser. It claims NO contact URL, because we have none to
 * give: an earlier string pointed at the PROVIDER's own homepage, which is a contact channel
 * that only looks like one (review #72).
 *
 * It also no longer claims to be "non-commercial". That word was inherited from an early draft
 * and became FALSE when the platform was ruled commercial from day one (DEC 2026-07-30k — it
 * will carry ads). A user agent is a statement to the provider, and some providers gate access
 * on exactly this distinction, so a stale non-commercial claim is a misrepresentation rather
 * than a cosmetic string. Removed repo-wide in M5 (ruling DEC 2026-08-02h S6). The truthful
 * form simply drops the claim — it does NOT assert "commercial" instead, which no provider
 * asked us to declare. Every licence behind the wired sources permits commercial use, so
 * nothing about our access depends on the claim.
 *
 * TODO(contact): publish a real Coğrafya-owned contact URL or mailbox here — and at the two
 * import-tool user agents (`src/database/marine/probe-marine-points.ts`,
 * `src/database/climate/mgm-fetch.ts`), which carry the same pending decision — once the domain
 * exists. Inventing one, or committing a personal address, is an owner call.
 */
export const UPSTREAM_USER_AGENT = 'CografyaPlatformBot/1.0 (educational geography platform)';

/** Thrown internally when a body breaches {@link UPSTREAM_MAX_RESPONSE_BYTES}. */
export class UpstreamOversizedResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UpstreamOversizedResponseError';
  }
}

/**
 * Map an HTTP status onto our outcome vocabulary.
 *
 * 429 is split out from the other 4xx because it is the only one where the provider tells us
 * WHEN to come back, and because it is the one that must also open the circuit breaker
 * (SPEC-ADDENDUM §6.3). 5xx is transient — the provider is broken, not our request.
 */
export function classifyHttpStatus(status: number): 'ok' | UpstreamFailureKind {
  if (status >= 200 && status < 300) return 'ok';
  if (status === 429) return 'rate_limited';
  if (status >= 500) return 'transient';
  if (status >= 400) return 'client_error';
  // 1xx/3xx here means `redirect: 'follow'` gave up or the peer is misbehaving; neither is a
  // body we can parse, and treating it as `ok` would hand an empty string to `parse`.
  return 'transient';
}

/**
 * `Retry-After`, in seconds, or `null` when absent/unparseable.
 *
 * Both RFC 9110 forms are accepted: delta-seconds and an HTTP-date. A provider that sends a date
 * and gets ignored would be retried immediately, which is precisely the behaviour that earns a
 * longer ban.
 *
 * Clamped to [0, 86400]: a hostile or broken header must not be able to park a key in the
 * negative cache for a week.
 */
export function parseRetryAfterSeconds(header: string | null, nowMs: number): number | null {
  if (header === null) return null;
  const trimmed = header.trim();
  if (trimmed === '') return null;

  const asSeconds = Number(trimmed);
  if (Number.isFinite(asSeconds)) return clampRetryAfter(asSeconds);

  const asDate = Date.parse(trimmed);
  if (Number.isNaN(asDate)) return null;
  return clampRetryAfter(Math.ceil((asDate - nowMs) / 1000));
}

const MAX_RETRY_AFTER_SECONDS = 86_400;

function clampRetryAfter(seconds: number): number {
  if (seconds < 0) return 0;
  return Math.min(Math.round(seconds), MAX_RETRY_AFTER_SECONDS);
}

/**
 * Query parameters whose VALUE never reaches a log line.
 *
 * Faz-1's two providers are anonymous — there is no key to leak today. This exists so that
 * stays true by construction when a future feed (playbook §3.5 names AFAD/MGM/air quality) does
 * carry one: a credential in an error message is a credential in the log aggregator, and the
 * secrets rule (§3.7) does not have a "but it was only in an error string" exemption.
 */
const REDACTED_QUERY_KEYS = new Set([
  'key',
  'apikey',
  'api_key',
  'token',
  'access_token',
  'secret',
  'password',
  'signature',
  'sig',
]);

/**
 * Mask credential-shaped `key=value` pairs anywhere in a free-text blob.
 *
 * For provider ERROR BODIES, which are neither a URL nor structured: most REST/OWS services echo
 * the offending request back, so an error excerpt can contain the whole query string. The excerpt
 * is genuinely diagnostic (CMEMS's exception names the valid time range, which is how we learn a
 * pinned horizon expired), so it is redacted rather than dropped.
 *
 * Matches the same key names as {@link redactUrl}, followed by `=` or `:`, in query-string, JSON
 * and XML-attribute shapes.
 */
export function redactSecrets(text: string): string {
  const keys = [...REDACTED_QUERY_KEYS].join('|');
  return text.replace(
    new RegExp(`("?(?:${keys})"?\\s*[=:]\\s*"?)([^&"'\\s<>,}]+)`, 'gi'),
    '$1<redacted>',
  );
}

/**
 * A log-safe rendering of a request URL.
 *
 * Strips userinfo and masks known-credential query values, keeping everything else verbatim —
 * the coordinates and dataset ids ARE the diagnostic value of the message, and none of them is
 * personal data (SPEC-ADDENDUM §7.10: this feature processes none; the coordinates are OUR
 * fixed reference points, never a visitor's location).
 */
export function redactUrl(rawUrl: string): string {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    // Not parseable: return the scheme-ish prefix only rather than echo an arbitrary string.
    return '<unparseable url>';
  }

  url.username = '';
  url.password = '';
  for (const key of [...url.searchParams.keys()]) {
    if (REDACTED_QUERY_KEYS.has(key.toLowerCase())) {
      url.searchParams.set(key, '<redacted>');
    }
  }
  return url.toString();
}

/**
 * Read a body with a hard byte cap, as RAW BYTES.
 *
 * `Content-Length` is checked first as a cheap early exit, but it is only a hint (absent on a
 * chunked response, and a peer may lie), so the stream is metered as well — the second half is
 * what actually enforces the cap.
 *
 * The byte-level function is the primitive and {@link readBodyCapped} decodes it, rather than the
 * other way round, because the first genuinely binary consumer (ECMWF's GRIB2 messages, marine
 * M3) cannot survive a UTF-8 round trip: `TextDecoder` replaces every invalid sequence with
 * U+FFFD, which is a lossy, irreversible corruption of packed numeric data — and a silent one,
 * since the result is still a perfectly ordinary string.
 */
export async function readBodyCappedBytes(
  response: Response,
  url: string,
  maxBytes: number = UPSTREAM_MAX_RESPONSE_BYTES,
): Promise<Uint8Array> {
  const declared = Number(response.headers.get('content-length') ?? Number.NaN);
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new UpstreamOversizedResponseError(
      `${redactUrl(url)} declares Content-Length ${String(declared)} B, above the ${String(maxBytes)} B cap.`,
    );
  }

  const body = response.body;
  if (body === null) {
    // A body-less response still has to obey the cap: `arrayBuffer()` buffers whatever arrives, so
    // the check happens after the read. This branch exists for runtimes/stubs that expose no
    // stream.
    const buffer = new Uint8Array(await response.arrayBuffer());
    if (buffer.byteLength > maxBytes) {
      throw new UpstreamOversizedResponseError(
        `${redactUrl(url)} returned a body-less response over the ${String(maxBytes)} B cap.`,
      );
    }
    return buffer;
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        throw new UpstreamOversizedResponseError(
          `${redactUrl(url)} exceeded the ${String(maxBytes)} B response cap — aborting the read.`,
        );
      }
      chunks.push(value);
    }
  } finally {
    // Releases the connection on the throw path too, so a capped read cannot leak a socket.
    await reader.cancel().catch(() => undefined);
  }

  const joined = new Uint8Array(total);
  let position = 0;
  for (const chunk of chunks) {
    joined.set(chunk, position);
    position += chunk.byteLength;
  }
  return joined;
}

/**
 * Read a body with a hard byte cap, decoded as UTF-8.
 *
 * The cap is measured in BYTES, before decoding — which is the honest place for it, since that is
 * what actually arrived over the socket.
 */
export async function readBodyCapped(
  response: Response,
  url: string,
  maxBytes: number = UPSTREAM_MAX_RESPONSE_BYTES,
): Promise<string> {
  return new TextDecoder('utf-8').decode(await readBodyCappedBytes(response, url, maxBytes));
}

/**
 * Does this response carry ONE OF the content types we are willing to parse?
 *
 * Checked BEFORE the body is parsed, because CMEMS answers a malformed request with HTTP 400 and
 * a `text/xml` OWS `ExceptionReport` (measured, SPEC-ADDENDUM §6.3). A blind `JSON.parse` there
 * throws a `SyntaxError` that reads like a bug in our code instead of "we sent a bad request".
 *
 * ## Why `expected` is a LIST and not one string
 * Measured on ECMWF Open Data (olcumler.md §M5): the SAME `.index` file is served as
 * `application/json` by `data.ecmwf.int` and as `application/octet-stream` by the AWS S3
 * mirror, and the SAME GRIB body as `application/grib` versus `application/octet-stream`. A
 * single-string check would make the failover path fail on content type alone — silently, since
 * both bodies are byte-identical. One accepted type is still the common case; callers pass a
 * plain string for it.
 */
export function hasExpectedContentType(
  header: string | null,
  expected: string | readonly string[],
): boolean {
  const candidates = typeof expected === 'string' ? [expected] : expected;
  const actual = (header ?? '').toLowerCase();
  return candidates.some((candidate) => actual.includes(candidate.toLowerCase()));
}
