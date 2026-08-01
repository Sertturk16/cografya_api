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
