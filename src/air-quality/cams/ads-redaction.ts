/**
 * Value-based redaction of the ADS credential.
 *
 * ## Why VALUE-based and not shape-based
 * The ADS key is a bare UUID. A shape-based rule ("mask every UUID") would also erase the job
 * ids, which are the only thing that makes an ingest log line diagnostic — and it would still
 * miss a credential that stopped looking like a UUID. Redaction is bound to the ONE secret this
 * process actually holds, and to its percent-encoded form, because a key echoed inside a URL
 * arrives escaped.
 *
 * ## Why it lives here and not in the probe
 * It arrived in the hand-run probe (A1) and the ingest is its second real consumer, so it moves
 * to a module both import rather than being copied. It is applied before ANY of these leave the
 * process: a log line, a stored `last_error`, and the shared HTTP client's `client_error` body
 * excerpt (via the `redactBody` hook — that excerpt is both logged at ERROR and persisted into
 * a negative cache entry).
 */
export function redactAdsSecret(text: string, secret: string | null): string {
  if (secret === null || secret.length === 0) return text;
  return text.split(secret).join('[REDACTED]').split(encodeURIComponent(secret)).join('[REDACTED]');
}

/**
 * A redactor bound to one secret, ready to hand to `UpstreamRequestOptions.redactBody` and to
 * every log/`last_error` write in the leg.
 *
 * Returning a closure rather than passing the secret around means the key exists in exactly one
 * place per leg instance, and nothing downstream has to remember to pass it.
 */
export function adsRedactor(secret: string | null): (text: string) => string {
  return (text: string): string => redactAdsSecret(text, secret);
}
