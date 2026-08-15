/**
 * Value-based redaction of the YouTube API key.
 *
 * ## Why a value-based redactor exists even though the key never enters a URL
 * The key travels in the `X-goog-api-key` HEADER — verified live against Data API v3 on 2026-08-15,
 * which is the measurement SPEC §8.4 left open — so `redactUrl`'s query-parameter masking has
 * nothing to mask on this leg, and the `?key=` form with its mandatory URL redaction is not used.
 * That closes the leak path the SPEC worried about; it does not close all of them. A provider may
 * echo a rejected credential inside an error BODY, and the shared client puts the first 200 bytes of
 * a `client_error` body into a line that is logged at ERROR. The pattern-based `redactSecrets` masks
 * `key=…`-shaped pairs and cannot see a bare `AIza…` string, so the leg passes this closure to
 * `UpstreamRequestOptions.redactBody` (the `redactAdsSecret` precedent, playbook §5's corollary:
 * a key is redacted from every log line whichever transport carried it).
 *
 * ## Value-based, never shape-based
 * Masking "anything that looks like a Google key" would be a regex maintained against a format we
 * do not control, and it would still miss a key that stopped looking like one. This is bound to the
 * ONE secret this process holds, and to its percent-encoded form, because a credential echoed inside
 * a URL arrives escaped.
 */
export function redactYoutubeKey(text: string, secret: string | null): string {
  if (secret === null || secret.length === 0) return text;
  return text.split(secret).join('[REDACTED]').split(encodeURIComponent(secret)).join('[REDACTED]');
}

/**
 * A redactor bound to one secret, ready to hand to `redactBody` and to every log line in the leg.
 *
 * A closure rather than passing the secret around: the key then exists in exactly one place per leg
 * instance, and nothing downstream has to remember to pass it.
 */
export function youtubeRedactor(secret: string | null): (text: string) => string {
  return (text: string): string => redactYoutubeKey(text, secret);
}
