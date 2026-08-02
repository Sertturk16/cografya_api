/**
 * The vocabulary every upstream call collapses into.
 *
 * Deliberately PROVIDER-NEUTRAL: nothing in `src/upstream/` knows what a wave or a sea basin
 * is. The marine layer maps these kinds onto `MarineStatus` (SPEC-ADDENDUM §7.7) and onto the
 * per-kind negative TTLs (§6.3); keeping the mechanism free of marine semantics is what lets
 * the same client serve the AFAD/MGM/air-quality feeds the playbook §3.5 already anticipates,
 * without a second implementation of timeouts, budgets and breakers.
 */

/**
 * Why a call ended the way it did.
 *
 * The split is not cosmetic — each kind carries a DIFFERENT negative-cache TTL and a different
 * log level (SPEC-ADDENDUM §6.3), because they mean genuinely different things:
 *
 * | kind           | whose fault      | retry?         | how loud            |
 * |----------------|------------------|----------------|---------------------|
 * | `ok`           | —                | —              | —                   |
 * | `no_data`      | nobody's         | no (24 h)      | quiet               |
 * | `transient`    | the provider's   | yes, once      | warn                |
 * | `rate_limited` | ours (volume)    | no             | warn + open breaker |
 * | `client_error` | OURS (bad query) | no             | error — loud        |
 * | `schema_error` | contract drift   | no             | error — alarm       |
 * | `budget_exhausted` | OURS (volume) | no            | error — loud (¹)    |
 *
 * (¹) Emitted by `ProviderBudget` at the source — once per window, with the window and limit only
 * it knows — not by the HTTP client's outcome switch. That switch therefore carries a deliberate
 * no-log branch for this kind rather than a missing one.
 *
 * `client_error` and `schema_error` are loud on purpose. A 400 means we sent a request the
 * provider cannot answer (a retired dataset id, an out-of-horizon `time=`); a schema error means
 * the provider's payload changed shape under us. Both would otherwise present as a quietly empty
 * widget — the exact silent failure this project keeps designing against.
 */
export type UpstreamOutcomeKind =
  | 'ok'
  | 'no_data'
  | 'transient'
  | 'rate_limited'
  | 'client_error'
  | 'schema_error'
  | 'budget_exhausted';

/** Kinds that mean "we have no value" — everything except `ok`. */
export type UpstreamFailureKind = Exclude<UpstreamOutcomeKind, 'ok'>;

/**
 * The result of one upstream operation.
 *
 * A discriminated union rather than exceptions: a provider being down is an EXPECTED outcome on
 * this path, not an exceptional one, and `try/catch` around an expected outcome is how a
 * `catch (e) { return null }` ends up swallowing a programming error too. Genuine programmer
 * errors (a malformed URL, a bad config) still throw.
 */
export type UpstreamOutcome<T> =
  | { readonly kind: 'ok'; readonly value: T; readonly validAtMs: number | null }
  | { readonly kind: 'no_data'; readonly reason: string }
  | { readonly kind: 'transient'; readonly reason: string }
  /**
   * OUR budget refused the call. The provider was never contacted, which is why this is its own
   * kind rather than a `transient`: a self-inflicted refusal must never be read — by the circuit
   * breaker, by a metric, or by a human on call — as evidence that the provider is unhealthy.
   */
  | { readonly kind: 'budget_exhausted'; readonly reason: string }
  | {
      readonly kind: 'client_error';
      readonly reason: string;
      /**
       * The HTTP status that produced this refusal, when the failure came from an HTTP
       * response at all. Carried STRUCTURALLY so a caller that must branch on a specific
       * status (the ADS licence 403 is the one real case) never has to parse it back out of
       * the composed `reason` string — which is redacted, truncated prose, not a contract.
       */
      readonly httpStatus?: number;
    }
  | { readonly kind: 'schema_error'; readonly reason: string }
  | {
      readonly kind: 'rate_limited';
      readonly reason: string;
      /** From `Retry-After` when the provider sent one; drives the negative TTL (§6.3). */
      readonly retryAfterSeconds: number | null;
    };

/**
 * What a caller's `parse` callback may conclude from a 200 body.
 *
 * `no_data` is a PARSE-level verdict, never a transport one: HTTP 200 with a `null` value is
 * exactly how both Faz-1 providers say "land mask / gap here" (SPEC-ADDENDUM §6.3). Only the
 * caller knows which field carries that null, so the HTTP client cannot decide it.
 */
export type UpstreamParseResult<T> =
  | { readonly kind: 'ok'; readonly value: T; readonly validAtMs?: number | null }
  | { readonly kind: 'no_data'; readonly reason: string };

/**
 * Thrown by a `parse` callback when the body is not the shape the contract promises.
 *
 * Surfaces as `schema_error` (300 s negative TTL + alarm-level log) rather than as a 500: a
 * provider changing its payload must degrade the widget, never the page (playbook §3.5).
 */
export class UpstreamSchemaError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'UpstreamSchemaError';
  }
}

/** `true` when the outcome carries a usable value. */
export function isOk<T>(
  outcome: UpstreamOutcome<T>,
): outcome is { kind: 'ok'; value: T; validAtMs: number | null } {
  return outcome.kind === 'ok';
}
