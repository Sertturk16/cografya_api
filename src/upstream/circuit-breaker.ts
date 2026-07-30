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
 * reacting is how a temporary throttle becomes a ban (SPEC-ADDENDUM §6.3).
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
   * @param retryAfterSeconds honoured verbatim for a `rate_limited` failure — the provider knows
   *   better than our default when it wants us back.
   */
  recordFailure(
    providerId: string,
    kind: UpstreamFailureKind,
    retryAfterSeconds: number | null = null,
  ): void {
    if (kind === 'no_data') return;

    const circuit = this.circuits.get(providerId) ?? {
      consecutiveFailures: 0,
      openUntilMs: null,
      trialInFlight: false,
    };
    circuit.consecutiveFailures += 1;
    circuit.trialInFlight = false;

    const rateLimited = kind === 'rate_limited';
    if (rateLimited || circuit.consecutiveFailures >= this.failureThreshold) {
      const openForMs =
        rateLimited && retryAfterSeconds !== null ? retryAfterSeconds * 1000 : this.openMs;
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
