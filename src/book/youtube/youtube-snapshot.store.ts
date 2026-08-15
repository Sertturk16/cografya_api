import type { DataSource } from 'typeorm';
import { BookVideo } from '../entities/book-video.entity';
import { YoutubeVideoSnapshot } from '../entities/youtube-video-snapshot.entity';
import type { YoutubeSnapshotInput } from './youtube-videos.parse';

/**
 * Everything the sync leg is allowed to do to the database, and nothing else.
 *
 * Four methods, each one step of SPEC §8.2/§8.3. The port exists so the refresh tour can be unit
 * tested without Postgres AND so the leg's authority is legible in one place: it reads ids, writes
 * snapshots, marks absences and deletes expired rows. It cannot touch `books`,
 * `book_video_questions` or any column of `book_videos`.
 */
export interface YoutubeSnapshotStorePort {
  /** Every video id the catalogue holds — the set the tour asks the provider about. */
  listVideoIds(): Promise<string[]>;
  /** Write (or refresh) ONE snapshot. Per row on purpose — see the implementation's note. */
  upsertSnapshot(input: YoutubeSnapshotInput, fetchedAtUtc: Date): Promise<void>;
  /** Stamp `missing_since_utc` on ids that stopped coming back. Returns rows touched. */
  markMissing(youtubeVideoIds: readonly string[], nowUtc: Date): Promise<number>;
  /** Delete every snapshot fetched before `cutoffUtc`. Returns rows deleted. */
  purgeOlderThan(cutoffUtc: Date): Promise<number>;
}

/** Injection token for {@link YoutubeSnapshotStorePort}. */
export const YOUTUBE_SNAPSHOT_STORE = Symbol('YOUTUBE_SNAPSHOT_STORE');

/** Columns an existing row hands over to the incoming one. `created_at` deliberately survives. */
const UPSERT_OVERWRITE_COLUMNS = [
  'thumbnail_key',
  'thumbnail_url',
  'thumbnail_width',
  'thumbnail_height',
  'published_at_utc',
  'duration_iso',
  'duration_seconds',
  'embeddable',
  'privacy_status',
  'fetched_at_utc',
  'missing_since_utc',
  'updated_at',
];

export class YoutubeSnapshotStore implements YoutubeSnapshotStorePort {
  constructor(private readonly dataSource: DataSource) {}

  async listVideoIds(): Promise<string[]> {
    const rows = await this.dataSource
      .getRepository(BookVideo)
      .createQueryBuilder('v')
      .select('v.youtubeVideoId', 'youtubeVideoId')
      // `UQ_book_videos_youtube_video_id` already guarantees uniqueness; stating it here keeps the
      // read honest about what the tour needs rather than about what a constraint happens to give.
      .distinct(true)
      .orderBy('v.youtubeVideoId', 'ASC')
      .getRawMany<{ youtubeVideoId: string }>();

    return rows.map((row) => row.youtubeVideoId);
  }

  /**
   * One row, one statement — NOT a batch.
   *
   * The B1 migration wrote this obligation down for B4 by name: an FK violation on one id (a video
   * whose `book_videos` row was corrected between the read and the write) is THAT ROW's failure and
   * the tour continues. A single multi-row `INSERT … ON CONFLICT` would take the whole chunk down
   * with it, which trades a one-row loss for a total one — the E1 lesson, restated. At 30 rows a day
   * the round trips cost nothing worth optimising.
   *
   * `fetched_at_utc` is written from the tour's clock rather than `now()`: it is the instant the
   * PROVIDER answered, it is what the soft threshold, the hard threshold and the purge all measure,
   * and a value produced by the database would drift from it by the write latency.
   */
  async upsertSnapshot(input: YoutubeSnapshotInput, fetchedAtUtc: Date): Promise<void> {
    await this.dataSource
      .getRepository(YoutubeVideoSnapshot)
      .createQueryBuilder()
      .insert()
      .values({
        youtubeVideoId: input.youtubeVideoId,
        thumbnailKey: input.thumbnailKey,
        thumbnailUrl: input.thumbnailUrl,
        thumbnailWidth: input.thumbnailWidth,
        thumbnailHeight: input.thumbnailHeight,
        publishedAtUtc: input.publishedAtUtc,
        durationIso: input.durationIso,
        durationSeconds: input.durationSeconds,
        embeddable: input.embeddable,
        privacyStatus: input.privacyStatus,
        fetchedAtUtc,
        // The id came back, so whatever absence was recorded before is over (SPEC §8.2 step 4).
        missingSinceUtc: null,
      })
      .orUpdate(UPSERT_OVERWRITE_COLUMNS, ['youtube_video_id'])
      .execute();
  }

  /**
   * The FIRST absence is what is recorded, and nothing later overwrites it.
   *
   * SPEC §8.2 step 5 writes this as `missing_since_utc = COALESCE(missing_since_utc, now())`; the
   * `WHERE … IS NULL` form below produces the identical column state — an already-stamped row is
   * simply not touched — while keeping the statement free of raw SQL, and it makes the returned
   * `affected` count mean "newly missing", which is the number worth logging. Overwriting the stamp
   * on every tour would reset the clock daily and make "how long has this video been gone"
   * unanswerable, which is the one question the column exists to answer.
   *
   * The row itself is never deleted here: the deneme and its questions keep being served, and only
   * the snapshot stops (SPEC §13 item 11).
   */
  async markMissing(youtubeVideoIds: readonly string[], nowUtc: Date): Promise<number> {
    if (youtubeVideoIds.length === 0) return 0;

    const result = await this.dataSource
      .getRepository(YoutubeVideoSnapshot)
      .createQueryBuilder()
      .update(YoutubeVideoSnapshot)
      .set({ missingSinceUtc: nowUtc })
      .where('youtube_video_id IN (:...youtubeVideoIds) AND missing_since_utc IS NULL', {
        youtubeVideoIds,
      })
      .execute();

    return result.affected ?? 0;
  }

  /**
   * The purge, and it is one statement over one column BY DESIGN (SPEC §4.2).
   *
   * `DELETE FROM youtube_video_snapshots WHERE fetched_at_utc < …` cannot be weakened by a future
   * column, which an `UPDATE … SET … = NULL` naming a column list silently would. `IDX_youtube_
   * video_snapshots_fetched_at` is this statement's access path.
   */
  async purgeOlderThan(cutoffUtc: Date): Promise<number> {
    const result = await this.dataSource
      .getRepository(YoutubeVideoSnapshot)
      .createQueryBuilder()
      .delete()
      .from(YoutubeVideoSnapshot)
      .where('fetched_at_utc < :cutoffUtc', { cutoffUtc })
      .execute();

    return result.affected ?? 0;
  }
}
