/**
 * One user request's TOTAL upstream budget.
 *
 * ## The bug this type exists to make impossible
 * SPEC v1 budgeted "6 s per provider + 1 retry after 500 ms", applied independently to every
 * parallel leg — so a slow page could legitimately spend ~12.5 s per leg and much more overall,
 * while every individual timeout looked correct (SPEC-ADDENDUM §6.4). A per-call timeout cannot
 * bound an operation that makes an unknown number of calls. The budget therefore lives on the
 * OPERATION and is threaded through every call and every retry.
 *
 * ## Two signals, deliberately
 * The operation signal (`AbortSignal.timeout(budget)`, created once here) is the ceiling; each
 * call additionally gets its own cap so one hung socket cannot silently eat the whole budget
 * while doing nothing. `AbortSignal.any` combines them, so whichever fires first wins.
 *
 * Node's `AbortSignal.timeout` timers are unref'd, so an abandoned deadline never keeps the
 * process alive.
 *
 * ## Background work does NOT share this budget
 * The warmup tour builds its own `OperationDeadline` from `MARINE_WARMUP_DEADLINE_MS` (300 s
 * since M3b — SPEC §9.2 raised it for the ECMWF ingest slice).
 * Conflating a background refresh with a user request in one budget was SPEC v1's underlying
 * conceptual error (§6.4).
 */
export class OperationDeadline {
  private readonly startedAtMs: number;
  private readonly operationSignal: AbortSignal;

  /**
   * @param budgetMs total wall-clock the whole operation may spend upstream.
   * @param nowMs injected clock — pure arithmetic (`remainingMs`, `canAfford`) is then testable
   *   without timers. The abort signal itself always uses the real clock; that is what actually
   *   has to interrupt a real socket.
   */
  constructor(
    private readonly budgetMs: number,
    private readonly nowMs: () => number = Date.now,
  ) {
    if (!Number.isFinite(budgetMs) || budgetMs <= 0) {
      throw new Error(`OperationDeadline needs a positive budget, got ${String(budgetMs)}`);
    }
    this.startedAtMs = nowMs();
    this.operationSignal = AbortSignal.timeout(budgetMs);
  }

  /** Milliseconds left in the budget; never negative. */
  remainingMs(): number {
    return Math.max(0, this.budgetMs - (this.nowMs() - this.startedAtMs));
  }

  hasExpired(): boolean {
    return this.remainingMs() <= 0;
  }

  /**
   * Is there room for another attempt that needs at least `needMs`?
   *
   * Used to decide whether a retry still fits (SPEC-ADDENDUM §6.4: retry only while more than
   * 1 500 ms of budget remains). Starting an attempt that cannot finish spends the provider's
   * capacity AND our own for a result nobody can wait for.
   */
  canAfford(needMs: number): boolean {
    return this.remainingMs() > needMs;
  }

  /**
   * Would a call starting NOW be ended by the OPERATION ceiling before it ever reached its own
   * per-call cap?
   *
   * ## Why this question needs an answer at all
   * {@link signalFor} clamps the cap to the remaining budget, so a call cut short that way aborts
   * AT the operation ceiling — and from inside the call that is indistinguishable from a provider
   * that hung for its full cap. `UpstreamHttpClient` needs the difference: the first is OUR brake
   * and says nothing about the provider, the second is provider evidence and must reach the
   * circuit breaker (review #124, SFH124R2-I1).
   *
   * ## A cap that is NOT smaller than the budget answers `false`, always
   * There the clamp binds on every call by construction: `remainingMs()` is below the cap from the
   * first millisecond of work that precedes the call, so a "was it clamped?" test would answer
   * `true` for every abort that leg can ever produce and disarm its breaker outright. The
   * `cmems` leg is exactly this shape at stock defaults — `CMEMS_SINGLE_CALL_TIMEOUT_MS` (6 000)
   * equals `MARINE_UPSTREAM_DEADLINE_MS` (6 000), a recorded decision (`MarineValuesService`,
   * review #81 M5).
   *
   * The honest reading of that configuration is the opposite one: an operator who lets ONE call
   * spend the entire budget has declared the budget to be that call's allowance, so a call that
   * spends all of it and answers nothing IS evidence about the provider. Two indistinguishable
   * cases must resolve toward recording, not toward excusing — a breaker that never opens is the
   * failure mode with no upper bound.
   *
   * ## …and that reading holds ONLY where every call really gets the whole window
   * It is an argument about one call per operation, or a handful fired together at t≈0 — the
   * marine shape, where each of the ≤3 CMEMS keys does receive all 6 000 ms. It is FALSE for a leg
   * that drains a QUEUE across one shared budget: there {@link signalFor} hands the late calls
   * `min(cap, remaining)`, a few hundred milliseconds rather than "the entire budget", so `false`
   * here would excuse nothing and the whole in-flight wave would reach the breaker as provider
   * evidence at once — past the failure threshold, against a provider that answered every call it
   * finished (review #124, SFH124-C1 and CODE124R3-I1).
   *
   * The invariant this short-circuit rests on is therefore a property of the CALLER, and it is
   * enforced where a caller's shape is fixed: at boot. The elevation leg is the fan-out shape
   * (`ElevationProfileService` mints one deadline for `ELEVATION_TILE_FETCH_CONCURRENCY` workers),
   * so its env cross-check refuses a cap equal to the budget outright instead of allowing it as
   * the marine pair does — see the elevation block in `env.schema.ts`. **A NEW leg that fans out
   * under one shared deadline must do the same**: give it a strict cross-check, or this line will
   * quietly take that leg's breaker off the wall.
   */
  cutsCallShort(singleCallTimeoutMs: number): boolean {
    if (singleCallTimeoutMs >= this.budgetMs) return false;
    return this.remainingMs() < singleCallTimeoutMs;
  }

  /**
   * The signal for ONE call: aborts at whichever comes first — the per-call cap, the remaining
   * operation budget, or the operation ceiling itself.
   */
  signalFor(singleCallTimeoutMs: number): AbortSignal {
    const callBudget = Math.max(1, Math.min(singleCallTimeoutMs, this.remainingMs()));
    return AbortSignal.any([this.operationSignal, AbortSignal.timeout(callBudget)]);
  }

  /** The operation ceiling on its own — for callers that orchestrate their own parallelism. */
  get signal(): AbortSignal {
    return this.operationSignal;
  }
}
