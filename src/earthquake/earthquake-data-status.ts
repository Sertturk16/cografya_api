import { EarthquakeDataStatus } from './earthquake.types';

/** The freshness half of every list/meta response, derived from two facts and the clock. */
export interface EarthquakeFreshness {
  /**
   * Finish time of the newest ingest tour that succeeded AND stored something, or null when there
   * has never been one. A tour that reached the provider and stored nothing does not move it.
   */
  readonly dataUpdatedAtUtc: string | null;
  readonly dataStatus: EarthquakeDataStatus;
}

/** What {@link resolveEarthquakeFreshness} needs to decide. */
export interface EarthquakeFreshnessInput {
  /** `MAX(finished_at_utc)` over successful runs that stored something, or null. */
  readonly runFinishedAt: Date | null;
  /**
   * Whether the STORE holds any servable row at all — store-wide, never scoped to one province.
   *
   * A boolean rather than the newest event's timestamp, and store-wide rather than path-scoped,
   * because both narrowings were live defects rather than hypotheses. Reusing the published
   * `latestEventAtUtc` here made a province with no bound events answer `unavailable` — "no usable
   * ingest at all", plus `no-store` — while the hub served a full list from the same store
   * (review #121 SFH121-I2). A dedicated input cannot be re-narrowed by a later refactor without
   * changing its name and its type.
   */
  readonly holdsServableRow: boolean;
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
 * a store with nothing to serve. **"Nothing to serve" is a fact about the STORE, not about the
 * province being asked for**: a quiet province is not a cold deployment, and answering one as the
 * other tells a CDN not to keep a page whose content is perfectly stable.
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
  const { runFinishedAt, holdsServableRow, now, staleMaxSeconds } = input;

  if (runFinishedAt === null) {
    return {
      dataUpdatedAtUtc: null,
      dataStatus: holdsServableRow ? EarthquakeDataStatus.Stale : EarthquakeDataStatus.Unavailable,
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
