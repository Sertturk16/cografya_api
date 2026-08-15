import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates `youtube_video_snapshots` — the PERISHABLE half of the book leg (SPEC §5.4, §5.5, PR B1).
 *
 * Hand-authored raw SQL and hand-reviewed (playbook §5). Schema only: rows are written by the B4
 * sync tour, which does not exist yet, and this PR adds no client, no scheduler and no env key.
 *
 * ## Why this is its own migration and its own table
 * YouTube Developer Policies III.E.4.d caps Non-Authorized API Data at **30 calendar days**, after
 * which it is deleted or refreshed. Holding those fields as nullable columns on `book_videos`
 * would make the purge an `UPDATE … SET … = NULL` over a hand-maintained column list, which goes
 * silently wrong the first time somebody adds a sixth API-sourced column. As its own table the
 * purge is `DELETE FROM youtube_video_snapshots WHERE fetched_at_utc < …`, and **no future column
 * can weaken it**. Separating the migrations puts that boundary in the schema history too: this
 * table can be dropped and rebuilt without a permanent row being touched.
 *
 * ## The retention mechanism this table is built for (B4, SPEC §8.3)
 * - younger than the SOFT threshold (600 h ≈ 25 days) → served;
 * - between soft and hard → **not served**; the contract expresses that as `youtube: null`, the
 *   page falls back to a typographic facade and `VideoObject` is not emitted;
 * - past the HARD threshold (720 h = 30 days, the policy ceiling) → the row is DELETED by a purge
 *   timer gated by `BOOKS_ENABLED` and deliberately **not** by the sync flag, so neither a
 *   provider outage nor the kill switch can stop deletion. The env schema must refuse
 *   `YOUTUBE_API_DATA_HARD_MAX_AGE_HOURS > 720` at boot — the ceiling is a boot check, not a
 *   comment.
 * `IDX_youtube_video_snapshots_fetched_at` is that purge's access path, and it is the only index
 * here: every other read reaches this table by primary key from a `book_videos` row.
 *
 * ## Column choices
 * - **`youtube_video_id` is the primary key AND a foreign key** to
 *   `book_videos.youtube_video_id` (which carries its own UNIQUE constraint, so it is a legal
 *   target), `ON DELETE CASCADE`. A perishable row cannot outlive its permanent row: removing a
 *   deneme must not leave orphaned API Data ageing with nothing pointing at it.
 *   **`ON UPDATE` is deliberately absent, which leaves the `NO ACTION` default, and the asymmetry
 *   with `ON DELETE` is the point.** Correcting a mis-seeded `book_videos.youtube_video_id` while
 *   a snapshot exists must FAIL rather than cascade: this row describes the OLD video — its
 *   duration, its thumbnail, its publication instant — so carrying it to a new id would silently
 *   republish one video's provider data under another's. The FK error is the correct outcome; the
 *   operator deletes the snapshot and lets the next tour refetch. **B4 obligation:**
 *   an FK violation on one id is that ROW's failure and the tour continues — a structural
 *   guarantee that can halt a fail-soft loop trades one failure mode for a worse one (the E1
 *   lesson, stated again here because it applies verbatim).
 * - **`duration_iso` beside `duration_seconds`** — two columns for one value, and the reason is
 *   playbook §5's fidelity rule: a parser reading `PT6M8S` as 68 seconds passes every range and
 *   ordering invariant and still publishes a wrong duration. B4 re-derives the ISO string from the
 *   integer and refuses to write a row that does not round-trip; storing only the parsed value
 *   would make that check impossible.
 * - **`thumbnail_url` is `text` and is stored verbatim.** Never constructed from the video id:
 *   III.E.5 bars replacing API Data with independently computed data, and hand-building an
 *   `i.ytimg.com` address is exactly that pattern. The image is hotlinked, never copied (III.E.1).
 * - **`thumbnail_width` / `thumbnail_height` are NOT NULL** because the facade reserves its box
 *   from them; without them the thumbnail lands with a layout shift. They carry no CHECK — the
 *   only CHECK on provider-sourced data here is the SPEC's `duration_seconds > 0`, and a
 *   nonsensical dimension belongs in B4's response validation, where it can be counted and
 *   skipped fail-soft rather than raising inside a tour. **B4 obligation:** reject a
 *   non-positive width or height at parse time.
 * - **`thumbnail_key` and `privacy_status` are plain `varchar` with no CHECK**, following the E1
 *   `magnitude_type` precedent: the closed set lives in `book.types.ts` and in the published
 *   OpenAPI enum. A database constraint here would hand a fail-soft ingest loop something that can
 *   abort a row, and the value can only come from our own selection ladder anyway.
 * - **`missing_since_utc` marks a video that stopped being returned; the row is not deleted.** The
 *   snapshot stops being served while the deneme and its questions keep being served, so a dead
 *   video costs the embed and nothing else. This is also what satisfies "verify at least every 30
 *   days that the video has not been deleted".
 * - **No title, description, channel title, view count, like count or comment count.** None is
 *   published, and every one of them would be API Data carrying a retention obligation for
 *   nothing (SPEC §5.2).
 *
 * `down()` drops the table with its index and constraints, leaving the permanent half intact.
 */
export class InitYoutubeVideoSnapshots1786755600000 implements MigrationInterface {
  name = 'InitYoutubeVideoSnapshots1786755600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "youtube_video_snapshots" (
        "youtube_video_id" character varying(16) NOT NULL,
        "thumbnail_key" character varying(16) NOT NULL,
        "thumbnail_url" text NOT NULL,
        "thumbnail_width" integer NOT NULL,
        "thumbnail_height" integer NOT NULL,
        "published_at_utc" timestamptz NOT NULL,
        "duration_iso" character varying(32) NOT NULL,
        "duration_seconds" integer NOT NULL,
        "embeddable" boolean NOT NULL,
        "privacy_status" character varying(16) NOT NULL,
        "fetched_at_utc" timestamptz NOT NULL,
        "missing_since_utc" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_youtube_video_snapshots" PRIMARY KEY ("youtube_video_id"),
        CONSTRAINT "FK_youtube_video_snapshots_book_video"
          FOREIGN KEY ("youtube_video_id")
          REFERENCES "book_videos" ("youtube_video_id") ON DELETE CASCADE,
        CONSTRAINT "CHK_youtube_video_snapshots_duration_seconds"
          CHECK ("duration_seconds" > 0)
      )
    `);

    // The purge's path — `fetched_at_utc` is the column the retention clock reads.
    await queryRunner.query(`
      CREATE INDEX "IDX_youtube_video_snapshots_fetched_at"
        ON "youtube_video_snapshots" ("fetched_at_utc")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // DROP TABLE also removes its index and constraints.
    await queryRunner.query(`DROP TABLE "youtube_video_snapshots"`);
  }
}
