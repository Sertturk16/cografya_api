import { beforeEach, describe, expect, it } from '@jest/globals';
import { UpstreamMetrics } from '../../upstream/upstream-metrics';
import type { YoutubeSnapshotStorePort } from './youtube-snapshot.store';
import { YoutubePurgeTarget, type YoutubePurgeTargetDeps } from './youtube-purge.target';
import { YOUTUBE_DATA_BUDGET, YOUTUBE_DATA_PROVIDER } from './youtube-sync.config';
import type { BookYoutubeSyncConfig } from './youtube-sync.config';

const NOW_MS = Date.parse('2026-08-15T12:00:00.000Z');
const HOUR_MS = 3_600_000;

const CONFIG: BookYoutubeSyncConfig = {
  refreshEnabled: false,
  purgeEnabled: true,
  baseUrl: 'https://provider.invalid/youtube/v3',
  apiKey: null,
  intervalSeconds: 86_400,
  deadlineMs: 60_000,
  tourBudgetMs: 30_000,
  singleCallTimeoutMs: 10_000,
  responseMaxBytes: 2_097_152,
  purgeIntervalSeconds: 3_600,
  hardMaxAgeHours: 720,
  budget: YOUTUBE_DATA_BUDGET,
};

class FakeStore implements YoutubeSnapshotStorePort {
  readonly purged: Date[] = [];
  deleted = 0;
  shouldThrow = false;

  listVideoIds(): Promise<string[]> {
    return Promise.resolve([]);
  }

  upsertSnapshot(): Promise<void> {
    return Promise.resolve();
  }

  markMissing(): Promise<number> {
    return Promise.resolve(0);
  }

  purgeOlderThan(cutoffUtc: Date): Promise<number> {
    if (this.shouldThrow) return Promise.reject(new Error('deadlock detected'));
    this.purged.push(cutoffUtc);
    return Promise.resolve(this.deleted);
  }
}

describe('YoutubePurgeTarget', () => {
  let metrics: UpstreamMetrics;
  let store: FakeStore;

  beforeEach(() => {
    metrics = new UpstreamMetrics();
    store = new FakeStore();
  });

  function build(config: BookYoutubeSyncConfig = CONFIG): YoutubePurgeTarget {
    return new YoutubePurgeTarget({ store, config, metrics, now: () => NOW_MS });
  }

  const tour = async (target: YoutubePurgeTarget): Promise<void> => {
    // No deadline argument: the tour takes none, because one DELETE over an indexed column is
    // bounded by the pool's own `statement_timeout` and there is no second call to budget against.
    await target.refresh();
  };

  it('deletes everything fetched before now minus the HARD ceiling', async () => {
    await tour(build());

    expect(store.purged).toHaveLength(1);
    expect(store.purged[0]?.getTime()).toBe(NOW_MS - 720 * HOUR_MS);
  });

  it('reads the configured ceiling, so lowering it takes effect without a code change', async () => {
    await tour(build({ ...CONFIG, hardMaxAgeHours: 24 }));

    expect(store.purged[0]?.getTime()).toBe(NOW_MS - 24 * HOUR_MS);
  });

  it('runs while the REFRESH is disabled — the reason it is a separate tour at all', async () => {
    // SPEC §8.1's central claim, at the unit level: this config has `refreshEnabled: false`, and
    // the purge still deletes. Deleting is an obligation and may not hang off a feature's switch.
    store.deleted = 3;
    await tour(build({ ...CONFIG, refreshEnabled: false }));

    expect(store.purged).toHaveLength(1);
    expect(metrics.get('books.snapshot_purged', YOUTUBE_DATA_PROVIDER)).toBe(3);
  });

  it('counts nothing when there was nothing to delete — the healthy steady state', async () => {
    await tour(build());
    expect(metrics.get('books.snapshot_purged', YOUTUBE_DATA_PROVIDER)).toBe(0);
  });

  it('never throws when the delete fails, and counts that failure on its own counter', async () => {
    // Its own counter because this is the mechanism that keeps us inside a POLICY ceiling: every
    // other failure in this leg costs a thumbnail, this one costs compliance if it persists.
    store.shouldThrow = true;

    await expect(tour(build())).resolves.toBeUndefined();
    expect(metrics.get('books.purge_failed', YOUTUBE_DATA_PROVIDER)).toBe(1);
  });

  it('counts that it RAN even when it deleted nothing — the liveness half', async () => {
    // `books.snapshot_purged` stays at zero forever on a healthy leg, which reads exactly like a
    // purge that was never scheduled. This counter is the difference, and it is the only positive
    // compliance evidence the leg emits: the healthy no-op logs at DEBUG, off in production.
    await tour(build());
    expect(metrics.get('books.purge_ran', YOUTUBE_DATA_PROVIDER)).toBe(1);
    expect(metrics.get('books.snapshot_purged', YOUTUBE_DATA_PROVIDER)).toBe(0);

    store.shouldThrow = true;
    await tour(build());
    // A FAILED statement is not a run. The two counters diverging is the alarm.
    expect(metrics.get('books.purge_ran', YOUTUBE_DATA_PROVIDER)).toBe(1);
    expect(metrics.get('books.purge_failed', YOUTUBE_DATA_PROVIDER)).toBe(1);
  });

  it('is structurally incapable of an external call — it has no client to make one with', () => {
    // SPEC §8.1 gives the purge tour "network: no". That is not a promise this class keeps, it is
    // a shape it cannot break: the dependency does not exist.
    //
    // The guard is the TYPE ANNOTATION, not an assertion. `Object.keys` over a literal this test
    // wrote could only ever return what this test put in it — a tautology that would keep passing
    // while `YoutubePurgeTargetDeps` grew a client (PR #111 TEST111-M4). Annotated, adding a
    // required dependency stops this file compiling, and `Typecheck & Lint` is where that surfaces.
    // The honest limit: an OPTIONAL new dependency would still compile.
    const deps: YoutubePurgeTargetDeps = { store, config: CONFIG, metrics, now: () => NOW_MS };
    expect(new YoutubePurgeTarget(deps)).toBeInstanceOf(YoutubePurgeTarget);
  });
});
