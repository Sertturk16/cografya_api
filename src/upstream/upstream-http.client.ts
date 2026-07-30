import type { CircuitBreaker } from './circuit-breaker';
import type { OperationDeadline } from './operation-deadline';
import type { ProviderBudget, ProviderBudgetLimits } from './provider-budget';
import {
  classifyHttpStatus,
  hasExpectedContentType,
  parseRetryAfterSeconds,
  readBodyCapped,
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

export interface UpstreamRequestOptions<T> {
  /** OUR label for the provider (`open-meteo`, `cmems`) — the metrics and breaker key. */
  providerId: string;
  /** Fine-grained label for logs (`cmems.thetao`, `open-meteo.marine-batch`). */
  label: string;
  url: string;
  /** The operation's total budget. Shared across every call the operation makes. */
  deadline: OperationDeadline;
  limits: ProviderBudgetLimits;
  /**
   * Turn a 200 body into a value.
   *
   * Throw {@link UpstreamSchemaError} when the body is not the promised shape; return
   * `{ kind: 'no_data' }` when the provider legitimately has no value here.
   */
  parse: (body: string) => UpstreamParseResult<T>;
  /** Content type the body must declare before it is parsed. Defaults to `application/json`. */
  expectedContentType?: string;
  headers?: Readonly<Record<string, string>>;
  maxResponseBytes?: number;
}

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

  async request<T>(options: UpstreamRequestOptions<T>): Promise<UpstreamOutcome<T>> {
    const { providerId, label, deadline } = options;

    if (!this.breaker.canAttempt(providerId)) {
      return this.record(providerId, label, {
        kind: 'transient',
        reason: 'circuit breaker is open for this provider',
      });
    }

    if (deadline.hasExpired()) {
      // Counts as a failure for the breaker: from the provider's point of view nothing happened,
      // but from ours the operation is already over and pretending otherwise would let a caller
      // treat the empty result as "the provider has no data".
      this.breaker.recordFailure(providerId, 'transient');
      return this.record(providerId, label, {
        kind: 'transient',
        reason: 'operation deadline elapsed before the call was made',
      });
    }

    // Typed as the FAILURE subset so the breaker call below cannot be handed an `ok` kind.
    let lastFailure: Exclude<UpstreamOutcome<T>, { kind: 'ok' }> = {
      kind: 'transient',
      reason: 'no attempt was made',
    };

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      const decision = await this.budget.tryConsume(providerId, options.limits);
      if (!decision.allowed) {
        const failure: UpstreamOutcome<T> = {
          kind: 'transient',
          reason: `provider budget exhausted (${decision.window} limit ${String(decision.limit)})`,
        };
        this.breaker.recordFailure(providerId, 'transient');
        return this.record(providerId, label, failure);
      }

      const outcome = await this.attempt(options, attempt);

      if (outcome.kind === 'ok' || outcome.kind === 'no_data') {
        this.breaker.recordSuccess(providerId);
        return this.record(providerId, label, outcome);
      }

      lastFailure = outcome;

      const retryable = outcome.kind === 'transient';
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
    const safeUrl = redactUrl(url);

    this.metrics.increment('upstream.request', providerId);

    let response: Response;
    let body: string;
    try {
      response = await this.fetchImpl(url, {
        headers: {
          'User-Agent': this.options.userAgent,
          Accept: expectedContentType,
          ...options.headers,
        },
        signal: deadline.signalFor(this.options.singleCallTimeoutMs),
        redirect: 'follow',
      });
      body = await readBodyCapped(
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
      return {
        kind: 'client_error',
        reason:
          `${label}: HTTP ${String(response.status)} — OUR request was rejected by ${safeUrl}. ` +
          `Body starts: ${body.slice(0, 200)}`,
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
          `"${expectedContentType}" (${safeUrl})`,
      };
    }

    try {
      const parsed = options.parse(body);
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
    }

    return outcome;
  }
}

/** A transport failure in one line, without leaking a stack into a log aggregator. */
function describeTransport(error: unknown): string {
  if (error instanceof DOMException && error.name === 'TimeoutError') return 'timed out';
  if (error instanceof DOMException && error.name === 'AbortError') return 'aborted';
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return 'unknown transport failure';
}
