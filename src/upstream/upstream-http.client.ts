import type { CircuitBreaker } from './circuit-breaker';
import type { OperationDeadline } from './operation-deadline';
import type { ProviderBudget, ProviderBudgetLimits } from './provider-budget';
import {
  classifyHttpStatus,
  hasExpectedContentType,
  parseRetryAfterSeconds,
  readBodyCappedBytes,
  redactSecrets,
  redactUrl,
  UPSTREAM_MAX_RESPONSE_BYTES,
  UpstreamOversizedResponseError,
} from './upstream-http.helpers';
import type { UpstreamMetrics } from './upstream-metrics';
import {
  UpstreamSchemaError,
  type UpstreamOutcome,
  type UpstreamParseResult,
} from './upstream.types';

/**
 * Minimum budget an attempt is worth starting with (SPEC-ADDENDUM §6.4).
 *
 * Below this there is not enough time for a TLS handshake plus a response, so a retry would
 * consume the provider's capacity and ours to produce a guaranteed timeout.
 */
const MIN_REMAINING_MS_FOR_RETRY = 1_500;

/** Pause before the single retry. Short enough to fit the budget, long enough not to be a hammer. */
const RETRY_BACKOFF_MS = 250;

/** Attempts per operation: the first try plus at most one retry, and only for transient failures. */
const MAX_ATTEMPTS = 2;

interface UpstreamRequestOptionsBase {
  /** OUR label for the provider (`cmems`, `ecmwf`) — the metrics and breaker key. */
  providerId: string;
  /**
   * HTTP verb. Defaults to `'GET'`, so every existing caller's behaviour is byte-identical.
   *
   * The three verbs are the ADS job protocol's whole surface: `POST` for `costing` and
   * `execution`, `DELETE` for the politeness cleanup, `GET` for everything else. They live on
   * the SHARED client rather than in a second one for the same reason the binary branch does:
   * the guard order (budget → breaker → deadline → byte cap → content type → parse) is never
   * duplicated (DEC 2026-07-31b).
   */
  method?: 'GET' | 'POST' | 'DELETE';
  /**
   * Request body, for `POST`. Carries its own content type, which is also what the
   * `Content-Type` header is set from — a body whose declared type and header could disagree
   * is a shape this client will not offer.
   */
  requestBody?: { readonly contentType: string; readonly content: string };
  /**
   * OPT OUT of the single transient retry. Absent (the default) = today's behaviour.
   *
   * `false` is for calls that are NOT idempotent. The one real case is the ADS `execution`
   * submit: a timeout after the provider already accepted the job means a retry creates a
   * SECOND job — double cost, and an orphan the account keeps. There is no safe automatic
   * recovery from that, so the retry is refused at the source and the caller reconciles
   * against `GET /jobs` instead of ever re-submitting.
   */
  retryable?: false;
  /**
   * Per-request redaction of the `client_error` body excerpt.
   *
   * The excerpt is already capped at 200 bytes and already passes the shared, PATTERN-based
   * `redactSecrets` (which masks `key=…`-shaped pairs). What it cannot mask is a BARE secret
   * — an ADS key is a naked UUID, and a provider that echoes it into an error body would put
   * it in a line that is both logged at ERROR and persisted into the negative cache entry.
   *
   * So a keyed leg passes a VALUE-based redactor here: it knows the secret it holds and
   * removes exactly that string (and its percent-encoded form). Value-based, never
   * shape-based — masking "every UUID" would also erase the job ids that make the message
   * diagnostic. The ERA5 `redactCdsSecret` is the merged precedent, negative test included.
   */
  redactBody?: (excerpt: string) => string;
  /** Fine-grained label for logs (`cmems.thetao`, `ecmwf.oper-range`). */
  label: string;
  url: string;
  /** The operation's total budget. Shared across every call the operation makes. */
  deadline: OperationDeadline;
  limits: ProviderBudgetLimits;
  /**
   * How many QUOTA units this request costs (default 1).
   *
   * Set this where the provider's billing unit is not our HTTP request but CAN be expressed as a
   * per-request cost. Where a provider bills a multi-location batch per LOCATION, counting
   * requests instead would have made the configured ceiling ~186% of its free tier while
   * `budget.rejected` never fired — the guard silently guaranteeing nothing (Atlas ruling,
   * review #73 I5). A quota counted in something other than requests cannot be modelled by a
   * weight at all and is enforced elsewhere.
   *
   * **No caller sets this today**: no wired provider needs a weight other than 1, so every live
   * call takes the default. That is a fact about the current provider set, not a reason to delete
   * the parameter — the rule it encodes belongs to the provider, and this is the single seam a
   * batch-billing provider would need. See `ProviderBudget.tryConsume` for the per-provider
   * argument, including why ADS's quota is enforced at the costing step rather than by a weight.
   */
  quotaWeight?: number;
  /**
   * Content type(s) the body must declare before it is parsed. Defaults to `application/json`.
   *
   * A LIST is accepted because mirrors of the same provider demonstrably disagree: ECMWF's
   * primary host serves `.index` as `application/json` and its GRIB bodies as
   * `application/grib`, while the S3 failover serves both as `application/octet-stream`
   * (measured, olcumler.md §M5). Pinning one string would break the failover on the header
   * alone while the bytes are identical.
   */
  expectedContentType?: string | readonly string[];
  /**
   * Treat HTTP 404 and 410 as `no_data` instead of `client_error`.
   *
   * OPT-IN, for callers probing a resource whose absence is an expected, legitimate state —
   * the first real case being an ECMWF cycle that is simply not published yet (the ingest
   * walks candidate cycles newest-first and falls back on 404). `no_data` logs at debug and
   * records a breaker SUCCESS, because the provider answered exactly as designed. Every OTHER
   * non-200 — and 404/410 on callers that did NOT opt in — keeps its loud path: a missing
   * resource we did not expect to be missing is still our bug or the provider's drift.
   */
  missingMeansNoData?: boolean;
  headers?: Readonly<Record<string, string>>;
  maxResponseBytes?: number;
  /**
   * Override the client-level single-call cap for THIS request.
   *
   * One client instance serves calls with genuinely different time shapes — the ADS job
   * protocol's JSON steps finish in well under a second while its archive download runs for
   * ~13 s — and a single instance-wide cap silently hands the long call's budget to every
   * short one: a stalled poll would then hold its 180 s cap and eat the whole tour slice
   * (review #80 I8, the same "declared env read by nothing" class review #73 pinned for
   * `MARINE_*_TTL_SECONDS`). Absent means the instance-level cap, so every existing caller's
   * behaviour is byte-identical.
   */
  singleCallTimeoutMs?: number;
}

/** A textual response (the default): the body reaches `parse` as a UTF-8 string. */
export interface UpstreamTextRequestOptions<T> extends UpstreamRequestOptionsBase {
  responseKind?: 'text';
  /**
   * Turn a 200 body into a value.
   *
   * Throw {@link UpstreamSchemaError} when the body is not the promised shape; return
   * `{ kind: 'no_data' }` when the provider legitimately has no value here.
   */
  parse: (body: string) => UpstreamParseResult<T>;
}

/** A binary response: the body reaches `parse` as raw bytes, never decoded. */
export interface UpstreamBytesRequestOptions<T> extends UpstreamRequestOptionsBase {
  responseKind: 'bytes';
  /** Same contract as the text `parse`, over bytes. */
  parse: (body: Uint8Array) => UpstreamParseResult<T>;
}

/**
 * One request, in one of two body shapes.
 *
 * ## Why the binary branch lives HERE and not in a second client
 * Two independent SPECs arrived needing binary bodies — marine M3's ECMWF GRIB2 messages and the
 * air-quality leg — and both faced the same choice: teach this class one narrow branch, or write
 * a second downloader beside it. Atlas ruled for the branch, once, in the PR that lands first
 * (DEC 2026-07-31 A-1, extended by DEC 2026-07-31b).
 *
 * The reason is the guard ORDER — budget, then breaker, then deadline, then the byte cap, then
 * the content type, then parse. That sequence is not a style preference: review #73's CRITICAL
 * finding, three independent reviewers, lived inside it, and so did N1. A second copy would be a
 * second place for the same class of bug to reappear, and it would drift quietly because both
 * copies would keep passing their own tests. **The guard order is never duplicated.**
 *
 * The delta is deliberately the smallest thing that works: one discriminant, one alternative
 * `parse` signature, no new option, no new class, no strategy object.
 */
export type UpstreamRequestOptions<T> =
  UpstreamTextRequestOptions<T> | UpstreamBytesRequestOptions<T>;

export interface UpstreamHttpClientOptions {
  /** Cap on ONE call, so a hung socket cannot eat the operation budget. */
  singleCallTimeoutMs: number;
  /** Identifies us honestly to every provider. */
  userAgent: string;
  /** Injected in tests; defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
  /** Injected in tests; defaults to a real timer. */
  sleepImpl?: (ms: number) => Promise<void>;
  now?: () => number;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * The shared client for every third-party call this API makes.
 *
 * ## What it guarantees, in order of enforcement
 * 1. **The provider budget** (§2.7) — checked before anything else, because it is the only guard
 *    between a cache failure and losing the data source entirely.
 * 2. **The circuit breaker** — a provider that is already refusing us is not asked again.
 * 3. **The operation deadline** (§6.4) — one budget for the whole operation, threaded through
 *    every attempt; a retry happens only if the remaining budget can actually pay for it.
 * 4. **A response byte cap** — `AbortSignal.timeout` bounds time, not payload.
 * 5. **Status and content type BEFORE the body is parsed** — CMEMS answers a bad request with
 *    HTTP 400 and `text/xml`; a blind `JSON.parse` there throws a `SyntaxError` that reads like
 *    our bug rather than "we sent a bad request" (§6.3, measured).
 *
 * ## It does not throw for provider faults
 * Every provider outcome comes back as a value. A failing provider is an expected state on this
 * path — the widget degrades, the page never does (playbook §3.5) — and modelling that as an
 * exception is how a `catch` ends up swallowing genuine bugs too.
 *
 * ## It knows nothing about marine data
 * No sea, no layer, no unit. Marine semantics live in `src/marine/`; the AFAD/MGM/air-quality
 * feeds the playbook anticipates reuse this class unchanged.
 */
export class UpstreamHttpClient {
  private readonly fetchImpl: typeof fetch;
  private readonly sleepImpl: (ms: number) => Promise<void>;
  private readonly now: () => number;

  constructor(
    private readonly metrics: UpstreamMetrics,
    private readonly budget: ProviderBudget,
    private readonly breaker: CircuitBreaker,
    private readonly options: UpstreamHttpClientOptions,
  ) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.sleepImpl = options.sleepImpl ?? defaultSleep;
    this.now = options.now ?? Date.now;
  }

  /**
   * Make one upstream call (plus at most one retry) and describe the outcome.
   *
   * ## The `try/finally` is load-bearing, not decoration
   * `canAttempt` may hand this call the circuit's single half-open TRIAL. Every ordinary path
   * below reports back to the breaker — but `attempt()` deliberately RETHROWS an exception that
   * escapes the caller's `parse` callback, and that throw leaves the method without telling the
   * breaker anything. Without the `finally`, the trial flag stays set for the lifetime of the
   * process: `canAttempt` then refuses every future call to that provider, the logs are
   * byte-identical to a healthy cooling-down breaker, and only a restart clears it — a permanent
   * self-inflicted outage started by a bug in an unrelated callback (review #73 CRITICAL,
   * independently found by three legs and confirmed by adversarial validation).
   *
   * The release is `abandonTrial`, NOT `recordFailure`: our own bug is not evidence about the
   * provider's health.
   */
  async request<T>(options: UpstreamRequestOptions<T>): Promise<UpstreamOutcome<T>> {
    const { providerId, label, deadline } = options;

    // ── The deadline is checked BEFORE the breaker gate, and that order is load-bearing ──
    //
    // `canAttempt` is not a question, it is a WITHDRAWAL: in half-open it consumes the circuit's
    // single trial. Asking it first meant a call that was never going to leave the process took
    // that trial and then recorded a failure for it.
    //
    // Before the shared-deadline fix an already-spent deadline was nearly unreachable here, since
    // every read minted its own. It is now the NORMAL state for keys 2..N of one multi-key request
    // (the very thing the shared budget exists for — a cold `/deniz/<point>` reads three CMEMS
    // keys on one 6 s budget). One slow first key would otherwise produce N−1 phantom failures
    // against a provider those calls never reached, burn the half-open trial, and re-arm the
    // cooldown on entirely self-inflicted evidence (review #73 confirm pass, N1).
    if (deadline.hasExpired()) {
      // The breaker is NOT told — the same principle as `budget_exhausted`: a refusal WE generated
      // is not evidence about the provider's health. Where the provider really did cause the delay,
      // the calls that actually timed out have already recorded their own failures, so telling it
      // again would double-count. The dedicated counter keeps the case visible without inventing
      // an outcome kind that every downstream status mapping would have to carry.
      this.metrics.increment('upstream.deadline_exceeded', providerId);
      return this.record(providerId, label, {
        kind: 'transient',
        reason: 'operation deadline elapsed before the call was made',
      });
    }

    if (!this.breaker.canAttempt(providerId)) {
      return this.record(providerId, label, {
        kind: 'transient',
        reason: 'circuit breaker is open for this provider',
      });
    }

    try {
      return await this.attemptLoop(options);
    } finally {
      // No-op on every path that already reported an outcome (`abandonTrial` returns immediately
      // when the flag is clear), so the normal flow cannot double-release.
      this.breaker.abandonTrial(
        providerId,
        `an exception escaped ${label} without a provider outcome`,
      );
    }
  }

  private async attemptLoop<T>(options: UpstreamRequestOptions<T>): Promise<UpstreamOutcome<T>> {
    const { providerId, label, deadline } = options;

    // Typed as the FAILURE subset so the breaker call below cannot be handed an `ok` kind.
    let lastFailure: Exclude<UpstreamOutcome<T>, { kind: 'ok' }> = {
      kind: 'transient',
      reason: 'no attempt was made',
    };

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      const decision = await this.budget.tryConsume(
        providerId,
        options.limits,
        options.quotaWeight ?? 1,
      );
      if (!decision.allowed) {
        // The breaker is NOT told. It tracks provider health, and a call we refused ourselves
        // never reached the provider — recording it would open a circuit on a provider that may
        // be perfectly well, and then mask the deliberately LOUD budget log behind a generic
        // "circuit breaker is open" line for the rest of the cooldown. Same reasoning as the
        // deadline case above, opposite conclusion, because there the operation really did use
        // its budget. `budget_exhausted` is its own outcome kind so nothing downstream — metric,
        // log, negative-cache entry or on-call human — can read it as a provider fault.
        return this.record(providerId, label, {
          kind: 'budget_exhausted',
          reason: `provider budget exhausted (${decision.window} limit ${String(decision.limit)})`,
        });
      }

      const outcome = await this.attempt(options, attempt);

      if (outcome.kind === 'ok' || outcome.kind === 'no_data') {
        this.breaker.recordSuccess(providerId);
        return this.record(providerId, label, outcome);
      }

      lastFailure = outcome;

      // A transient failure is retryable UNLESS the caller opted out. One line, and it sits
      // where the retry decision already lives — the guard order above is untouched.
      const retryable = outcome.kind === 'transient' && options.retryable !== false;
      const affordable = deadline.canAfford(MIN_REMAINING_MS_FOR_RETRY + RETRY_BACKOFF_MS);
      if (!retryable || attempt >= MAX_ATTEMPTS || !affordable) {
        break;
      }

      this.metrics.increment('upstream.retry', providerId);
      await this.sleepImpl(RETRY_BACKOFF_MS);
    }

    this.breaker.recordFailure(
      providerId,
      lastFailure.kind,
      lastFailure.kind === 'rate_limited' ? lastFailure.retryAfterSeconds : null,
    );
    return this.record(providerId, label, lastFailure);
  }

  private async attempt<T>(
    options: UpstreamRequestOptions<T>,
    attempt: number,
  ): Promise<UpstreamOutcome<T>> {
    const { url, providerId, label, deadline } = options;
    const expectedContentType = options.expectedContentType ?? 'application/json';
    const expectedContentTypeLabel =
      typeof expectedContentType === 'string'
        ? expectedContentType
        : expectedContentType.join(', ');
    const safeUrl = redactUrl(url);

    this.metrics.increment('upstream.request', providerId);

    let response: Response;
    // Read as BYTES on every path and decode only for the text branch. `TextDecoder` replaces an
    // invalid sequence with U+FFFD, so decoding first would corrupt a binary body irreversibly —
    // and silently, since the result is still a perfectly ordinary string.
    let body: Uint8Array;
    try {
      response = await this.fetchImpl(url, {
        method: options.method ?? 'GET',
        ...(options.requestBody === undefined ? {} : { body: options.requestBody.content }),
        headers: {
          'User-Agent': this.options.userAgent,
          Accept: expectedContentTypeLabel,
          ...(options.requestBody === undefined
            ? {}
            : { 'Content-Type': options.requestBody.contentType }),
          ...options.headers,
        },
        signal: deadline.signalFor(options.singleCallTimeoutMs ?? this.options.singleCallTimeoutMs),
        // NOT `follow`. A redirect is the one way a provider (or anyone who can answer as one:
        // a hijacked route, an expired domain, a compromised CDN) can choose the host this
        // server talks to from INSIDE the deployment network — cloud metadata endpoints being
        // the classic target once hosting exists. `fetch` offers no host allowlist, so the
        // boundary layer refuses redirects outright and reports them as a transient failure.
        // Both Faz-1 providers answer 200 directly (the probe tool proves it); if one ever
        // starts redirecting, the fix is the URL M3 sends, not this policy.
        redirect: 'error',
      });
      body = await readBodyCappedBytes(
        response,
        url,
        options.maxResponseBytes ?? UPSTREAM_MAX_RESPONSE_BYTES,
      );
    } catch (error: unknown) {
      if (error instanceof UpstreamOversizedResponseError) {
        // Deterministic: the same request produces the same oversized body, so this is NOT a
        // transient failure to retry. It is also a contract surprise — the provider is sending
        // something we never designed for — hence schema_error's alarm-level log and 300 s TTL.
        return { kind: 'schema_error', reason: error.message };
      }
      return {
        kind: 'transient',
        reason: `${label} attempt ${String(attempt)}: ${describeTransport(error)} (${safeUrl})`,
      };
    }

    const statusClass = classifyHttpStatus(response.status);
    if (statusClass === 'rate_limited') {
      return {
        kind: 'rate_limited',
        reason: `${label}: HTTP 429 from ${safeUrl}`,
        retryAfterSeconds: parseRetryAfterSeconds(response.headers.get('retry-after'), this.now()),
      };
    }
    if (statusClass === 'client_error') {
      // The one caller-declared exception to "4xx is loud": a 404/410 on a resource whose
      // absence is an expected state (an unpublished ECMWF cycle). `no_data` is the honest
      // vocabulary for it — the provider answered correctly, there is simply nothing there —
      // and it inherits no_data's quiet log and breaker-success semantics. Scoped to exactly
      // these two statuses so a 400/403/422 can never ride along.
      if (
        options.missingMeansNoData === true &&
        (response.status === 404 || response.status === 410)
      ) {
        return {
          kind: 'no_data',
          reason:
            `${label}: HTTP ${String(response.status)} from ${safeUrl} — the resource does not ` +
            `exist (an expected state for this caller: missingMeansNoData)`,
        };
      }
      return {
        kind: 'client_error',
        httpStatus: response.status,
        reason:
          `${label}: HTTP ${String(response.status)} — OUR request was rejected by ${safeUrl}. ` +
          // REDACTED, because this excerpt is both logged at ERROR and persisted into the negative
          // cache entry. Providers routinely echo the offending request back in an error body
          // (CMEMS's measured OWS `ExceptionReport` is the in-repo example), so once a keyed feed
          // is wired through this same client the first 200 bytes could carry its key. The URL on
          // this line has always been redacted; the body was the hole in that guarantee (§3.7 has
          // no "but it was only in an error string" exemption).
          //
          // Decoded here rather than earlier: an error body is text on every provider we have
          // met, and the excerpt is bounded to 200 bytes, so a lossy decode of a binary error
          // page costs nothing while decoding the SUCCESS path would destroy it.
          //
          // TWO redactors, in order: the caller's VALUE-based one (which knows its own bare
          // secret) and then the shared PATTERN-based one. Neither subsumes the other — the
          // pattern cannot see a naked UUID, and the value redactor knows nothing about the
          // `key=…` shapes of other providers.
          `Body starts: ${redactSecrets(applyBodyRedaction(options.redactBody, decodeExcerpt(body)))}`,
      };
    }
    if (statusClass === 'transient') {
      return {
        kind: 'transient',
        reason: `${label}: HTTP ${String(response.status)} from ${safeUrl}`,
      };
    }

    if (!hasExpectedContentType(response.headers.get('content-type'), expectedContentType)) {
      return {
        kind: 'schema_error',
        reason:
          `${label}: HTTP 200 but content-type is ` +
          `"${response.headers.get('content-type') ?? '(absent)'}", expected ` +
          `"${expectedContentTypeLabel}" (${safeUrl})`,
      };
    }

    try {
      // The ONE place the two branches diverge — after every guard above has already run.
      const parsed =
        options.responseKind === 'bytes'
          ? options.parse(body)
          : options.parse(new TextDecoder('utf-8').decode(body));
      if (parsed.kind === 'no_data') {
        return { kind: 'no_data', reason: parsed.reason };
      }
      return { kind: 'ok', value: parsed.value, validAtMs: parsed.validAtMs ?? null };
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : String(error);
      if (error instanceof UpstreamSchemaError || error instanceof SyntaxError) {
        return { kind: 'schema_error', reason: `${label}: ${reason} (${safeUrl})` };
      }
      // Anything else out of `parse` is OUR bug, not the provider's. Rethrow: turning a
      // programming error into a "provider unavailable" is exactly the silent failure this
      // codebase keeps designing against.
      throw error;
    }
  }

  /** One place for the per-outcome counter and its log line, so no path can skip either. */
  private record<T>(
    providerId: string,
    label: string,
    outcome: UpstreamOutcome<T>,
  ): UpstreamOutcome<T> {
    this.metrics.increment(`upstream.outcome.${outcome.kind}`, providerId);

    switch (outcome.kind) {
      case 'ok':
        break;
      case 'no_data':
        this.metrics.event('debug', 'upstream reported no data', { provider: providerId, label });
        break;
      case 'transient':
        this.metrics.event('warn', 'upstream call failed', {
          provider: providerId,
          label,
          reason: outcome.reason,
        });
        break;
      case 'rate_limited':
        this.metrics.event('warn', 'upstream rate-limited us', {
          provider: providerId,
          label,
          retryAfterSeconds: outcome.retryAfterSeconds,
          reason: outcome.reason,
        });
        break;
      case 'client_error':
        // ERROR: a 4xx means WE sent something the provider cannot answer — a retired dataset id,
        // an out-of-horizon time. It will not fix itself and it needs a human (§6.3).
        this.metrics.event('error', 'upstream rejected OUR request', {
          provider: providerId,
          label,
          reason: outcome.reason,
        });
        break;
      case 'schema_error':
        // ERROR at alarm level: the provider's contract moved under us (risk R2). Everything
        // downstream still "works" while publishing nothing — the definition of a silent failure.
        this.metrics.event('error', 'upstream response did not match the expected contract', {
          provider: providerId,
          label,
          reason: outcome.reason,
        });
        break;
      case 'budget_exhausted':
        // Deliberately no line here: `ProviderBudget` already emits the LOUD error at the source,
        // once per window, with the window and limit that only it knows. A second line from this
        // switch would double-log the same standing condition on every attempt — the exact
        // amplification the throttle there exists to prevent. The branch is explicit rather than
        // absent so the outcome table in `upstream.types.ts` and this function agree in writing.
        break;
      default: {
        // Compile-time gate: adding a kind to `UpstreamOutcomeKind` without a branch above fails
        // the build here, naming it. Without this, the next kind would silently inherit a no-log
        // path — the same class of "forgotten in one of two places" the staleness gate closed in
        // `marine-assertions.ts`.
        const unhandled: never = outcome;
        this.metrics.event('error', 'unhandled upstream outcome kind', {
          provider: providerId,
          label,
          outcome: JSON.stringify(unhandled),
        });
        break;
      }
    }

    return outcome;
  }
}

/** The first 200 bytes of a body, decoded leniently, for an error message. */
function decodeExcerpt(body: Uint8Array): string {
  return new TextDecoder('utf-8').decode(body.subarray(0, 200));
}

/**
 * Run the caller's redactor, and treat a redactor that THROWS as a redaction failure rather
 * than letting the un-redacted excerpt through.
 *
 * A callback that blows up while masking a secret must not end with that secret in the log —
 * which is exactly what an unguarded call would do, since the exception would escape `attempt`
 * and the excerpt would be gone but so would the whole outcome. Failing closed here costs one
 * diagnostic string and cannot leak.
 */
function applyBodyRedaction(
  redactBody: ((excerpt: string) => string) | undefined,
  excerpt: string,
): string {
  if (redactBody === undefined) return excerpt;
  try {
    return redactBody(excerpt);
  } catch {
    return '<body redaction failed — excerpt withheld>';
  }
}

/** A transport failure in one line, without leaking a stack into a log aggregator. */
function describeTransport(error: unknown): string {
  if (error instanceof DOMException && error.name === 'TimeoutError') return 'timed out';
  if (error instanceof DOMException && error.name === 'AbortError') return 'aborted';
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return 'unknown transport failure';
}
