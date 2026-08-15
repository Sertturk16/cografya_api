import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { YoutubeThumbnailKey } from '../book.types';

/**
 * The PERISHABLE half — everything `videos.list` returns about one of our videos.
 *
 * ## Why this is a separate table and not five nullable columns on `book_videos`
 * YouTube Developer Policies III.E.4.d caps Non-Authorized API Data at **30 calendar days**, after
 * which it must be deleted or refreshed. Kept as columns on the permanent row, "delete what is
 * expired" would be an `UPDATE … SET … = NULL` naming a column list — and the day somebody adds a
 * sixth API-sourced column without editing that statement, the policy breaks silently and nothing
 * fails. As its own table the same operation is `DELETE FROM youtube_video_snapshots WHERE
 * fetched_at_utc < …`, which **no future column can weaken**. That is the entire architectural
 * argument of SPEC §4.2, and it is why the boundary is a table rather than a comment.
 *
 * ## Nothing published on the page depends on this row
 * If this table is empty the book page is COMPLETE: künye, denemeler, questions and start seconds
 * are all ours. What is lost is the `VideoObject` structured data — which is not emitted at all
 * rather than emitted with invented fields, since `SEO-POLICY.md` §B5 5.8 makes a fabricated field
 * a BLOCKER while omitting the block is merely a lost enrichment — and the thumbnail, in which case
 * the facade becomes typographic.
 *
 * ## Three ages, three behaviours (B4, SPEC §8.3)
 * Younger than the soft threshold (600 h ≈ 25 days) the snapshot is served. Between soft and hard
 * it is **not served** — the contract says so by publishing `youtube: null`. Past the hard
 * threshold (720 h = 30 days, the policy ceiling, enforced as a BOOT check on the env schema) the
 * row is deleted by a purge timer that is gated by `BOOKS_ENABLED` and deliberately NOT by the
 * sync flag: deleting is an obligation, and an obligation may not hang off a feature's switch or
 * off a provider being reachable.
 *
 * ## B1 scope
 * Schema and contract only. No client, no scheduler, no env key: `app.module.ts` and
 * `env.schema.ts` are untouched by this PR by design (SPEC §16).
 */
@Entity('youtube_video_snapshots')
// The purge's access path — `fetched_at_utc` is what the retention clock reads.
@Index('IDX_youtube_video_snapshots_fetched_at', ['fetchedAtUtc'])
export class YoutubeVideoSnapshot {
  /**
   * The video id — primary key AND foreign key to `book_videos.youtube_video_id`, cascading on
   * delete.
   *
   * A perishable row cannot exist without its permanent row, which is the invariant that keeps the
   * two-table split honest in the other direction: removing a deneme from the catalogue cannot
   * leave orphaned API Data behind, ageing quietly with nothing pointing at it.
   */
  @PrimaryColumn({ name: 'youtube_video_id', type: 'varchar', length: 16 })
  youtubeVideoId!: string;

  /**
   * Which rung of the thumbnail ladder this URL came from — stored so the choice is auditable
   * from the row. Not published; see {@link YoutubeThumbnailKey}.
   */
  @Column({ name: 'thumbnail_key', type: 'varchar', length: 16 })
  thumbnailKey!: YoutubeThumbnailKey;

  /**
   * The thumbnail URL **exactly as the API returned it**.
   *
   * Never constructed from the video id. Developer Policies III.E.5 bars replacing API Data with
   * independently computed data, and hand-building an `i.ytimg.com` address is exactly that
   * pattern (SPEC §4.4). `text` because a provider URL has no length we are entitled to assume.
   *
   * The image is HOTLINKED and never copied — no byte of YouTube content is stored (III.E.1),
   * which is also why it must be served without image optimisation on the web side (K-G, ruled in
   * DEC 2026-08-15c §3).
   */
  @Column({ name: 'thumbnail_url', type: 'text' })
  thumbnailUrl!: string;

  /**
   * The thumbnail's own dimensions, as reported.
   *
   * Published, and mandatory rather than nice-to-have: the facade reserves the box from these two
   * numbers, and without them the image lands with a layout shift — `CONVENTIONS.md` §6 budgets
   * CLS at 0.1 and this surface can hold it at 0.
   */
  @Column({ name: 'thumbnail_width', type: 'integer' })
  thumbnailWidth!: number;

  @Column({ name: 'thumbnail_height', type: 'integer' })
  thumbnailHeight!: number;

  /** `snippet.publishedAt`, UTC. Feeds `VideoObject.uploadDate`, which Google requires. */
  @Column({ name: 'published_at_utc', type: 'timestamptz' })
  publishedAtUtc!: Date;

  /**
   * `contentDetails.duration` as the RAW ISO 8601 string, kept beside its parsed form.
   *
   * Two columns for one value, and the reason is the fidelity rule playbook §5 requires: a parser
   * that reads `PT6M8S` as 68 seconds passes every range and ordering invariant and publishes a
   * wrong duration on the page and in the structured data. B4's write path therefore re-derives
   * the ISO string from {@link durationSeconds} and compares it to this column; a row that does
   * not round-trip is **not written** and is counted (SPEC §5.4, §13 item 5). Storing only the
   * parsed value would make that check impossible after the fact.
   */
  @Column({ name: 'duration_iso', type: 'varchar', length: 32 })
  durationIso!: string;

  /** The parsed duration. `> 0` — a zero-length video solution is not a state, it is a defect. */
  @Column({ name: 'duration_seconds', type: 'integer' })
  durationSeconds!: number;

  /**
   * `status.embeddable`. Published, because `false` is not an error state: the page then shows a
   * typographic facade and stays complete (SPEC §12.5).
   */
  @Column({ name: 'embeddable', type: 'boolean' })
  embeddable!: boolean;

  /**
   * `status.privacyStatus`. Stored, never published — the reader has no use for the provider's
   * visibility vocabulary, while the sync leg needs it to tell "gone" from "unlisted".
   */
  @Column({ name: 'privacy_status', type: 'varchar', length: 16 })
  privacyStatus!: string;

  /**
   * When this snapshot was fetched — **the column the retention policy is measured on**.
   *
   * Not `created_at` and not `updated_at`: those are row bookkeeping and would drift from the
   * provider contact the moment an unrelated field was touched. The soft threshold, the hard
   * threshold and the purge all read this one column.
   */
  @Column({ name: 'fetched_at_utc', type: 'timestamptz' })
  fetchedAtUtc!: Date;

  /**
   * When the id first stopped coming back from `videos.list`, or `null` while it still does.
   *
   * The row is NOT deleted on disappearance: a video that vanished is information the page uses —
   * the snapshot stops being served while the deneme and its questions keep being served, so the
   * index survives a dead video intact (SPEC §13 item 11). This is also the mechanism that
   * satisfies "verify at least every 30 days that the video has not been deleted".
   */
  @Column({ name: 'missing_since_utc', type: 'timestamptz', nullable: true })
  missingSinceUtc!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
