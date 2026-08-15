import { Logger } from '@nestjs/common';
import { describeErrorWithName } from '../../common/describe-error';
import type { ScheduledWarmupTarget } from '../../upstream/scheduled-warmup.service';
import type { UpstreamMetrics } from '../../upstream/upstream-metrics';
import type { YoutubeSnapshotStorePort } from './youtube-snapshot.store';
import { YOUTUBE_DATA_PROVIDER, type BookYoutubeSyncConfig } from './youtube-sync.config';

const MS_PER_HOUR = 3_600_000;

export interface YoutubePurgeTargetDeps {
  readonly store: YoutubeSnapshotStorePort;
  readonly config: BookYoutubeSyncConfig;
  readonly metrics: UpstreamMetrics;
  /** Injected in tests. */
  readonly now?: () => number;
}

/**
 * The purge: `DELETE FROM youtube_video_snapshots WHERE fetched_at_utc < now() − hard` (SPEC §8.1).
 *
 * ## It has no HTTP client, and that is the design rather than an omission
 * There is no `client` in {@link YoutubePurgeTargetDeps} at all, so "the purge makes no external
 * call" is not a promise this class keeps — it is a shape it cannot break. The one thing it needs is
 * the database.
 *
 * ## Why it is a SEPARATE tour from the refresh, and gated on NOTHING
 * This is the most important structural decision in the leg. As a step of the refresh tour, the
 * delete would stop silently in exactly the two states where the 30-day ceiling matters: a provider
 * outage (the tour fails before reaching it) and the kill switch being thrown
 * (`BOOKS_YOUTUBE_SYNC_ENABLED=false` — the tour never runs). Deleting expired API Data is an
 * OBLIGATION under Developer Policies III.E.4.d, and an obligation may not hang off a feature's
 * switch or off a provider being reachable. So it runs on its own timer, at its own interval, on
 * **no switch at all** — not even `BOOKS_ENABLED`, which would have reintroduced the same defect
 * one level up (Atlas ruling 2026-08-15, PR #111 SEC111-I1) — and it takes **no Redis lock**, since
 * a lock that protects nothing here would still suspend the delete when Redis is unreachable
 * (SEC111-I2). The e2e boots with every book switch OFF and asserts the row is still deleted.
 *
 * The honest limit, recorded rather than solved: an application that does not run for 30 days
 * deletes nothing. It also publishes nothing in that period, so no expired snapshot is served — the
 * age rule in `youtube-serving.ts` stops that at 25 days without needing any timer at all.
 */
export class YoutubePurgeTarget implements ScheduledWarmupTarget {
  readonly label = 'youtube.purge';

  private readonly logger = new Logger('BookYoutubePurge');
  private readonly now: () => number;

  constructor(private readonly deps: YoutubePurgeTargetDeps) {
    this.now = deps.now ?? Date.now;
  }

  /**
   * Never throws — the warmup contract.
   *
   * The tour's `OperationDeadline` is deliberately NOT taken: this is ONE statement over an indexed
   * column, and what actually bounds it is the pool-wide `statement_timeout`
   * (`DATABASE_STATEMENT_TIMEOUT_MS`, 30 s), which cancels a runaway statement server-side and
   * hands the connection back. There is no second call for a budget to be shared between, so a
   * parameter would be ceremony that reads as if something threaded it.
   */
  async refresh(): Promise<void> {
    const cutoffUtc = new Date(this.now() - this.deps.config.hardMaxAgeHours * MS_PER_HOUR);

    try {
      const deleted = await this.deps.store.purgeOlderThan(cutoffUtc);
      // Incremented BEFORE the zero branch returns, and that ordering is the whole point: "the
      // purge ran and found nothing" and "the purge has not run since the deploy" were otherwise
      // indistinguishable from outside the process, because the healthy no-op below logs at DEBUG
      // and DEBUG is off in production. This counter is the leg's positive compliance evidence.
      this.deps.metrics.increment('books.purge_ran', YOUTUBE_DATA_PROVIDER);
      if (deleted === 0) {
        // The steady state on a healthy leg: a daily refresh keeps every row far below the ceiling,
        // so nothing to delete is the NORMAL outcome and must not fill the log.
        this.logger.debug(`purge tour: nothing older than ${cutoffUtc.toISOString()}`);
        return;
      }

      this.deps.metrics.increment('books.snapshot_purged', YOUTUBE_DATA_PROVIDER, deleted);
      // At LOG rather than debug: a non-zero purge means the refresh has not been reaching those
      // videos for 30 days, which is a fact about the leg's health and not only about the rows.
      this.logger.log(
        `purge tour: deleted ${String(deleted)} snapshot(s) fetched before ` +
          `${cutoffUtc.toISOString()} (hard ceiling ${String(this.deps.config.hardMaxAgeHours)} h)`,
      );
    } catch (error: unknown) {
      // A failed purge is the one failure in this leg that must never be quiet: it is the mechanism
      // that keeps us inside a policy ceiling, so it is ERROR even though the next tour will retry.
      this.deps.metrics.increment('books.purge_failed', YOUTUBE_DATA_PROVIDER);
      this.logger.error(`purge tour failed — ${describeErrorWithName(error)}`);
    }
  }
}
