import type { UpstreamMetrics } from './upstream-metrics';
import type { UpstreamFailureKind } from './upstream.types';

/**
 * Consecutive provider-level failures before the circuit opens.
 *
 * Five, not three: unlike the hand-run probe (which is serial and can afford to be twitchy),
 * the request path runs many calls concurrently, so a single unlucky moment produces several
 * failures at once. Three would open the circuit on one bad second.
 */
const DEFAULT_FAILURE_THRESHOLD = 5;

/** How long the circuit stays open before one trial call is allowed through. */
const DEFAULT_OPEN_MS = 60_000;

export type CircuitState = 'closed' | 'open' | 'half_open';

interface ProviderCircuit {
  consecutiveFailures: number;
  /** Epoch ms the circuit may next be probed; `null` while closed. */
  openUntilMs: number | null;
  /** True once a trial call has been let through and has not yet reported back. */
  trialInFlight: boolean;
}

export interface CircuitBreakerOptions {
  failureThreshold?: number;
  openMs?: number;
  now?: () => number;
}

/**
 * Per-provider circuit breaker for the request path.
 *
 * ## It counts PROVIDER-LEVEL refusals, not only transport failures — the M1 lesson
 * The import tool's breaker originally counted only thrown transport errors, so the scenario its
 * own docblock named (a retired dataset id → a clean HTTP 400 + XML on every call) reset the
 * counter on every "successful" iteration and the run hammered the provider through all 30
 * candidates (review #72, silent-failure I2). A clean 400 IS a refusal. Every non-`ok` outcome
 * counts here: transient, rate-limited, our own bad request, and a schema mismatch.
 *
 * `no_data` does NOT count. HTTP 200 with a null value is the provider working correctly and
 * telling us there is nothing at that coordinate (a land mask); counting it would open the
 * circuit for a perfectly healthy provider the moment the Marmara points are refreshed.
 *
 * ## 429 opens the circuit immediately, for as long as the provider asked
 * A rate-limit answer is the provider telling us to stop. Waiting for four more of them before
 * reacting is how a temporary throttle becomes a ban (SPEC-ADDENDUM §6.3). The honoured window is
 * floored at `openMs` (a `Retry-After: 0` must not disarm the cooldown) and, since §6.3 says a
 * present `Retry-After` is obeyed, its upper bound is the helper's 24 h clamp — worst case, one
 * hostile or broken header suppresses a provider for a day and its layers read `unavailable` on
 * the page once the 6 h staleness ceiling bites. That is the deliberate trade: obeying a provider
 * that asked for a long pause beats risking a permanent block.
 *
 * ## In-process, per instance — stated, not hidden
 * Each instance keeps its own view. With N instances a struggling provider sees up to N trial
 * calls per cooldown instead of one. That is conservative enough at our scale (the budget is the
 * hard ceiling, §2.7) and a Redis-shared breaker is an escalation to raise with Atlas if
 * horizontal scale ever makes it matter — not something to build on reflex (playbook §12).
 *
 * Constructed by `UpstreamModule`'s factory (the clock and thresholds are injected for tests).
 */
export class CircuitBreaker {
  private readonly circuits = new Map<string, ProviderCircuit>();
  private readonly failureThreshold: number;
  private readonly openMs: number;
  private readonly now: () => number;

  constructor(
    private readonly metrics: UpstreamMetrics,
    options: CircuitBreakerOptions = {},
  ) {
    this.failureThreshold = options.failureThreshold ?? DEFAULT_FAILURE_THRESHOLD;
    this.openMs = options.openMs ?? DEFAULT_OPEN_MS;
    this.now = options.now ?? Date.now;
  }

  state(providerId: string): CircuitState {
    const circuit = this.circuits.get(providerId);
    if (circuit === undefined || circuit.openUntilMs === null) return 'closed';
    return this.now() >= circuit.openUntilMs ? 'half_open' : 'open';
  }

  /**
   * May a call be made right now?
   *
   * Half-open lets exactly ONE trial call through: the point of the cooldown is to stop hammering,
   * and releasing the whole backlog the instant it elapses re-hammers the provider.
   */
  canAttempt(providerId: string): boolean {
    const circuit = this.circuits.get(providerId);
    if (circuit === undefined || circuit.openUntilMs === null) return true;

    if (this.now() < circuit.openUntilMs) {
      this.metrics.increment('breaker.rejected', providerId);
      return false;
    }

    if (circuit.trialInFlight) {
      this.metrics.increment('breaker.rejected', providerId);
      return false;
    }

    circuit.trialInFlight = true;
    return true;
  }

  recordSuccess(providerId: string): void {
    const circuit = this.circuits.get(providerId);
    if (circuit === undefined) return;
    if (circuit.openUntilMs !== null) {
      this.metrics.increment('breaker.closed', providerId);
      this.metrics.event('log', 'circuit breaker closed', { provider: providerId });
    }
    circuit.consecutiveFailures = 0;
    circuit.openUntilMs = null;
    circuit.trialInFlight = false;
  }

  /**
   * Release a half-open trial WITHOUT recording an outcome.
   *
   * ## Why this exists instead of a `recordFailure` in a `finally`
   * The one path that can leave the trial flag set is an exception escaping the caller's `parse`
   * callback — which `UpstreamHttpClient` rethrows on purpose, because it is OUR bug, not the
   * provider's. Releasing it via `recordFailure` would count our bug as evidence about the
   * provider's health and could open the circuit on a provider that answered perfectly. So this
   * clears the flag and nothing else: no counter moves, `openUntilMs` does not move, and the next
   * call gets the trial the leaked one wasted.
   *
   * It is LOUD because a leaked trial means an unexpected exception crossed a boundary that is
   * supposed to convert every provider fault into a value. If this line appears, something above
   * threw where the design says it cannot.
   */
  abandonTrial(providerId: string, reason: string): void {
    const circuit = this.circuits.get(providerId);
    if (circuit === undefined || !circuit.trialInFlight) return;

    circuit.trialInFlight = false;
    this.metrics.increment('breaker.trial_abandoned', providerId);
    this.metrics.event('error', 'half-open trial abandoned without an outcome', {
      provider: providerId,
      reason,
    });
  }

  /**
   * @param retryAfterSeconds honoured for a `rate_limited` failure — the provider knows better
   *   than our default when it wants us back — but FLOORED at `openMs`; see below.
   */
  recordFailure(
    providerId: string,
    kind: UpstreamFailureKind,
    retryAfterSeconds: number | null = null,
  ): void {
    if (kind === 'no_data') return;
    // A refusal by our own budget is not evidence about the provider: the call was never made.
    // Guarded here as well as at the call site, so no future caller can reintroduce it.
    if (kind === 'budget_exhausted') return;

    const circuit = this.circuits.get(providerId) ?? {
      consecutiveFailures: 0,
      openUntilMs: null,
      trialInFlight: false,
    };
    circuit.consecutiveFailures += 1;
    circuit.trialInFlight = false;

    const rateLimited = kind === 'rate_limited';
    if (rateLimited || circuit.consecutiveFailures >= this.failureThreshold) {
      // FLOORED at `openMs`, not honoured verbatim. `Retry-After: 0` is a legal header, and
      // `parseRetryAfterSeconds` also produces 0 for any HTTP-date that has already elapsed (clock
      // skew is enough). Taking that 0 literally sets `openUntilMs = now`, so the circuit is
      // half-open on the very next call and the "429 stops us immediately" guarantee becomes a
      // no-op under a value the provider controls — the exact throttle-becomes-ban escalation this
      // class exists to prevent. A provider asking for MORE time than our default still gets it.
      //
      // The upper bound stays the helper's 24 h clamp: SPEC-ADDENDUM §6.3 says a present
      // `Retry-After` is obeyed, and second-guessing a provider that asked for a long pause is how
      // a temporary block becomes a permanent one. The worst case is stated in the class docs.
      const openForMs =
        rateLimited && retryAfterSeconds !== null
          ? Math.max(retryAfterSeconds * 1000, this.openMs)
          : this.openMs;
      const wasOpen = circuit.openUntilMs !== null && this.now() < circuit.openUntilMs;
      circuit.openUntilMs = this.now() + openForMs;
      if (!wasOpen) {
        this.metrics.increment('breaker.opened', providerId);
        this.metrics.event('warn', 'circuit breaker opened', {
          provider: providerId,
          kind,
          consecutiveFailures: circuit.consecutiveFailures,
          openForMs,
        });
      }
    }

    this.circuits.set(providerId, circuit);
  }

  /** Test-only. */
  resetForTest(): void {
    this.circuits.clear();
  }
}
