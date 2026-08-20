import { describe, expect, it } from '@jest/globals';
import { resolveEarthquakeFreshness } from './earthquake-data-status';
import { EarthquakeDataStatus } from './earthquake.types';

const NOW = new Date('2026-08-19T12:00:00.000Z');
const STALE_MAX_SECONDS = 10_800;

/** The store holds something servable. Store-wide, never scoped to one province. */
const HOLDS_ROWS = true;

describe('resolveEarthquakeFreshness', () => {
  it('is ok while the newest successful tour is inside the budget', () => {
    const finished = new Date(NOW.getTime() - 60_000);
    expect(
      resolveEarthquakeFreshness({
        runFinishedAt: finished,
        holdsServableRow: HOLDS_ROWS,
        now: NOW,
        staleMaxSeconds: STALE_MAX_SECONDS,
      }),
    ).toEqual({
      dataUpdatedAtUtc: finished.toISOString(),
      dataStatus: EarthquakeDataStatus.Ok,
    });
  });

  it('is still ok exactly ON the budget, and stale one second past it', () => {
    const onBudget = new Date(NOW.getTime() - STALE_MAX_SECONDS * 1000);
    const pastBudget = new Date(NOW.getTime() - (STALE_MAX_SECONDS + 1) * 1000);

    expect(
      resolveEarthquakeFreshness({
        runFinishedAt: onBudget,
        holdsServableRow: HOLDS_ROWS,
        now: NOW,
        staleMaxSeconds: STALE_MAX_SECONDS,
      }).dataStatus,
    ).toBe(EarthquakeDataStatus.Ok);

    expect(
      resolveEarthquakeFreshness({
        runFinishedAt: pastBudget,
        holdsServableRow: HOLDS_ROWS,
        now: NOW,
        staleMaxSeconds: STALE_MAX_SECONDS,
      }).dataStatus,
    ).toBe(EarthquakeDataStatus.Stale);
  });

  it('keeps publishing dataUpdatedAtUtc while stale — stale data is shown, not hidden', () => {
    const longAgo = new Date(NOW.getTime() - 30 * 86_400_000);
    expect(
      resolveEarthquakeFreshness({
        runFinishedAt: longAgo,
        holdsServableRow: HOLDS_ROWS,
        now: NOW,
        staleMaxSeconds: STALE_MAX_SECONDS,
      }),
    ).toEqual({
      dataUpdatedAtUtc: longAgo.toISOString(),
      dataStatus: EarthquakeDataStatus.Stale,
    });
  });

  /**
   * The branch SPEC §8.3's table does not contain: a store whose rows outlive its ledger.
   *
   * The hand-run backfill used to produce it on every go-live by writing no run row; E4 closed
   * that (`FU-E2-BACKFILL-RUNROW`). The state itself remains reachable — run retention and a
   * restore from a data-only dump both reach it — and deriving from the ledger alone would stamp
   * a full list `unavailable`, so the branch and this case stay.
   */
  it('is stale — not unavailable — when rows exist but no tour has ever succeeded', () => {
    expect(
      resolveEarthquakeFreshness({
        runFinishedAt: null,
        holdsServableRow: HOLDS_ROWS,
        now: NOW,
        staleMaxSeconds: STALE_MAX_SECONDS,
      }),
    ).toEqual({
      dataUpdatedAtUtc: null,
      dataStatus: EarthquakeDataStatus.Stale,
    });
  });

  it('is unavailable only when there is neither a successful tour nor a servable row', () => {
    expect(
      resolveEarthquakeFreshness({
        runFinishedAt: null,
        holdsServableRow: false,
        now: NOW,
        staleMaxSeconds: STALE_MAX_SECONDS,
      }),
    ).toEqual({
      dataUpdatedAtUtc: null,
      dataStatus: EarthquakeDataStatus.Unavailable,
    });
  });

  /**
   * A tour whose finish time is slightly ahead of our clock is a clock-skew artifact, not a
   * reason to declare the data unusable.
   */
  it('treats a future finish time as fresh rather than as an error', () => {
    const ahead = new Date(NOW.getTime() + 5_000);
    expect(
      resolveEarthquakeFreshness({
        runFinishedAt: ahead,
        holdsServableRow: HOLDS_ROWS,
        now: NOW,
        staleMaxSeconds: STALE_MAX_SECONDS,
      }).dataStatus,
    ).toBe(EarthquakeDataStatus.Ok);
  });
});
