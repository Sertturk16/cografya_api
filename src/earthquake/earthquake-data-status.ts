import { EarthquakeDataStatus } from './earthquake.types';

/** The freshness half of every list/meta response, derived from two facts and the clock. */
export interface EarthquakeFreshness {
  /** Finish time of the newest SUCCESSFUL ingest tour, or null when there has never been one. */
  readonly dataUpdatedAtUtc: string | null;
  readonly dataStatus: EarthquakeDataStatus;
}

/** What {@link resolveEarthquakeFreshness} needs to decide. */
export interface EarthquakeFreshnessInput {
  /** `MAX(finished_at_utc)` over successful runs, or null. */
  readonly runFinishedAt: Date | null;
  /** Origin time of the newest in-scope row this path can serve, or null when it holds none. */
  readonly latestEventAt: Date | null;
  readonly now: Date;
  readonly staleMaxSeconds: number;
}

/**
 * Turns "when did we last succeed" plus "do we hold anything" into the published status token.
 *
 * Pure, so it is unit-tested without Postgres — and it is worth isolating because the branch that
 * matters is not the obvious one.
 *
 * ## The third branch: rows with no run ledger behind them
 * SPEC §8.3 treats "no successful ingest" and "empty store" as the same state. They are not, and
 * the gap is real rather than hypothetical: the hand-run backfill (`--phase=backfill`) writes
 * events WITHOUT writing an `earthquake_ingest_runs` row, so after the one-off historical load the
 * store can hold tens of thousands of genuine rows while the ledger is empty. Deriving the status
 * from the ledger alone would then stamp a full list `unavailable` and answer `no-store`,
 * publishing real data while telling the reader we have none.
 *
 * `stale` is the honest token there, and it is what the vocabulary already says: `Stale` is
 * "populated, but the last successful contact is older than the budget", and no contact at all is
 * a contact infinitely old. `Unavailable` keeps its own meaning — "no usable ingest at all", i.e.
 * a store with nothing to serve.
 *
 * The ledger gap itself is an INGEST defect and is tracked as `FU-E2-BACKFILL-RUNROW`; this
 * function is the read side answering honestly in the meantime, not the fix.
 *
 * ## `dataUpdatedAtUtc` stays null in that branch, deliberately
 * It means "our last successful contact with the provider", and inventing one from the newest
 * event's origin time would answer a different question — the reader would see a freshness claim
 * built out of when an earthquake happened.
 */
export function resolveEarthquakeFreshness(input: EarthquakeFreshnessInput): EarthquakeFreshness {
  const { runFinishedAt, latestEventAt, now, staleMaxSeconds } = input;

  if (runFinishedAt === null) {
    return {
      dataUpdatedAtUtc: null,
      dataStatus:
        latestEventAt === null ? EarthquakeDataStatus.Unavailable : EarthquakeDataStatus.Stale,
    };
  }

  const ageSeconds = (now.getTime() - runFinishedAt.getTime()) / 1000;
  return {
    dataUpdatedAtUtc: runFinishedAt.toISOString(),
    // `<=`, so a tour landing exactly on the budget is still fresh: the boundary belongs to the
    // side that does not raise an alarm.
    dataStatus:
      ageSeconds <= staleMaxSeconds ? EarthquakeDataStatus.Ok : EarthquakeDataStatus.Stale,
  };
}
