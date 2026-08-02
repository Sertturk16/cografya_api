import type { UpstreamOutcomeKind } from '../../upstream/upstream.types';

/**
 * The self-heal decision (plan §3.2): a retired dataset id answers HTTP 400 + XML on EVERY
 * call, and the fix is a fresh STAC resolution — not a retry, not a wait.
 *
 * This module is the PURE half; M4b's warmup target wires it: on a retired-dataset signal the
 * product's STAC resolution is force-refreshed AT MOST ONCE PER TOUR (storm protection — a
 * provider that keeps 400-ing after a fresh resolution has a problem re-resolving cannot fix,
 * and hammering the catalogue about it would be our second bug). After the single forced
 * refresh the normal negative-TTL flow applies, so the provider's version rotation heals
 * within one tour interval (≤ 15 min) instead of ADDENDUM §6.6's "page quietly empties".
 */

/**
 * `true` when an outcome kind is the retired-dataset signature.
 *
 * Exactly `client_error`: the 400-XML reply classifies there (status checked before any body
 * parse). `schema_error` is deliberately NOT included — it means the payload shape moved,
 * which a re-resolution cannot fix — and `transient`/`rate_limited` heal through their own
 * TTLs.
 */
export function isRetiredDatasetSignal(kind: UpstreamOutcomeKind): boolean {
  return kind === 'client_error';
}

/**
 * The once-per-tour gate, one instance per warmup leg.
 *
 * Deliberately timer-free and Redis-free: the warmup tour already has exactly one runner per
 * interval (the cross-instance lock in `ScheduledWarmupService`), so a per-tour in-memory set
 * is the whole requirement. `beginTour()` is called at the top of each tour; `tryAcquire`
 * grants one forced re-resolution per product until the next tour.
 */
export class ForcedReresolveGate {
  private acquired = new Set<string>();

  beginTour(): void {
    this.acquired = new Set<string>();
  }

  /** `true` exactly once per product per tour. */
  tryAcquire(productId: string): boolean {
    if (this.acquired.has(productId)) return false;
    this.acquired.add(productId);
    return true;
  }
}
