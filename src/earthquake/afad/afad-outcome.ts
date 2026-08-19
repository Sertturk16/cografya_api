/**
 * AFAD's self-contradicting error shape, and the one line of judgement it needs.
 *
 * Measured 2026-08-11 (SPEC §3.6): a request missing `start`/`end` comes back as
 *
 * ```
 * HTTP/1.1 500 Internal Server Error
 * {"timestamp":1786451618,"status":400,"error":"Parameter Exception",
 *  "exception":null,"message":"Start-End Time is required","path":null}
 * ```
 *
 * The transport says "my fault", the body says "your fault", and the body is right. A client that
 * believes the transport code retries OUR malformed query forever, backs off against a provider
 * that is perfectly healthy, and logs the whole thing at WARN — so the one signal that would send
 * a human to look at the query never fires.
 *
 * This function is the classifier the shared upstream client's `serverErrorBodyClassifier` hook
 * takes. It may only ever escalate; `null` leaves the outcome as the transient it already was.
 */

/** `"status": 4xx` anywhere in the excerpt — the fallback when the excerpt is a truncated body. */
const STATUS_FIELD = /"status"\s*:\s*(\d{3})/;

export function classifyAfadServerErrorBody(excerpt: string): 'client_error' | null {
  const declared = readDeclaredStatus(excerpt);
  if (declared === null) return null;
  // Only 4xx. A body echoing a 5xx agrees with its own transport code, and a body claiming 2xx on
  // a 500 is too confused to act on — both stay transient.
  return declared >= 400 && declared < 500 ? 'client_error' : null;
}

function readDeclaredStatus(excerpt: string): number | null {
  // Whole-JSON first: it cannot mistake a nested field for the envelope's own status.
  const fromJson = readStatusFromJson(excerpt);
  if (fromJson !== null) return fromJson;

  // The fallback runs whenever the JSON path produced no usable status — not only when `JSON.parse`
  // THREW. Both are the same situation from here: we hold an excerpt whose own top-level `status`
  // we could not read. A truncated body is the common one (the hook is handed at most 200 bytes, so
  // a longer error body arrives mid-JSON), but a body that parses into a shape we did not expect —
  // `[{"status":400,…}]`, `{"error":{"status":400}}`, a truncation landing on a complete smaller
  // value — used to skip the pattern entirely and file our own malformed query as a provider
  // outage, the precise failure this hook exists to prevent (review #118 SFH118-M7).
  const matched = STATUS_FIELD.exec(excerpt);
  return matched?.[1] === undefined ? null : Number(matched[1]);
}

/** The envelope's OWN top-level `status`, or `null` for anything else — including unparseable. */
function readStatusFromJson(excerpt: string): number | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(excerpt);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
  const status = (parsed as Record<string, unknown>)['status'];
  if (typeof status === 'number' && Number.isInteger(status)) return status;
  if (typeof status === 'string' && /^\d{3}$/.test(status)) return Number(status);
  return null;
}
