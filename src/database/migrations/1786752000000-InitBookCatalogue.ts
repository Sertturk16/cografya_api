import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the PERMANENT half of the book / video-solution catalogue — `books`, `book_videos` and
 * `book_video_questions` (SPEC §5.1–§5.3, §5.5, PR B1).
 *
 * Hand-authored raw SQL and hand-reviewed, like every sibling migration (playbook §5). It is
 * SCHEMA ONLY: every row is written by the B2 seed, never by a migration, and no backfill is
 * needed because the three tables start empty.
 *
 * ## Why the perishable table is NOT in this migration
 * `youtube_video_snapshots` gets its own migration (`InitYoutubeVideoSnapshots`) and the split is
 * the architectural boundary itself rather than a file-size preference (SPEC §4.2, §5.5): what we
 * author is permanent, what the YouTube Data API returns may be held at most 30 calendar days.
 * Two migrations make that line visible in the schema history, and the perishable table can be
 * dropped and rebuilt without touching a single permanent row.
 *
 * ## Differences from SPEC §5.1–§5.3, each argued at its site
 * - **`deneme_count` is NOT NULL.** The SPEC left it nullable only while K-E was open; the owner
 *   checked the book and ruled the answer is 40 (→ DEC 2026-08-15c §1). Denemeler 14 and 22 DO
 *   exist in the book — only their solution videos are missing — so the count is a künye fact like
 *   the page count, and every row here is hand-seeded from a künye somebody read. The cost is
 *   stated in the entity: relaxing it later is a breaking contract change.
 * - **`purchase_url` did not exist in the SPEC.** Added by owner ruling after approval (→ DEC
 *   2026-08-15c §1): the book page carries an outbound "Satın Al" link and **no price anywhere**.
 *   `CONVENTIONS.md` §4 still bars pricing and this migration creates no price, currency,
 *   availability or offer column — so `Product`/`offers` structured data cannot be assembled from
 *   this schema at all.
 * - **No separate `INDEX (book_id, deneme_no)` / `INDEX (book_video_id, question_no)`.** Each
 *   UNIQUE constraint below already creates a unique B-tree index on exactly those columns in
 *   exactly that order, so SPEC §5.2's and §5.3's index lines are satisfied — a second identical
 *   index would pay twice for one access path.
 * - **No index on `books` beyond its unique constraints.** The tier is a fixed four-row set by
 *   dated ruling (`DEC 2026-08-15c` §3, "4 satırlık sabit küme"), so a `display_order` index would
 *   be pure write cost. The citation matters: `CONVENTIONS.md` §5 carries the book tier's IA row
 *   and no row ceiling, so it cannot be what bounds this table.
 *
 * ## What is deliberately NOT here
 * - **No `slug_tr` / `slug_en` on `book_videos` or `book_video_questions`.** Playbook §5 requires
 *   them on public entities because the web repo routes on them; SPEC §4.3 rules there is no
 *   per-deneme and no per-question page — 30 near-identical thin pages per book, 120 across four,
 *   is the shape `SEO-POLICY.md` §12.1 targets — and deep links are fragments instead. No page, no
 *   route, no slug to resolve. This PR widens playbook §5's recorded exception from
 *   `earthquake_events` to the class all three tables share.
 * - **No video title column.** `timestamps.json` carries YouTube's title; the loader does not read
 *   it. Storing it would make a permanent row hold API Data, and `hl` can return that title
 *   machine-translated, which `SEO-POLICY.md` §B14 bars from publication (SPEC §5.2).
 * - **No question label, topic or semantic title.** `QUESTIONS.md` V-4 closed it; the reader sees
 *   `Soru {n}`, built from the web repo's i18n key and the number (playbook §6).
 * - **No price, stock, currency, availability or offer column** — see above.
 *
 * ## Constraints
 * - `CHK_books_isbn13` pins exactly 13 digits. `char(13)` blank-pads a short value, and the padded
 *   value fails this pattern, so the padding cannot produce a silently accepted row.
 * - `CHK_books_author_names` requires at least one author. `cardinality()` rather than
 *   `array_length(…, 1)`, which returns NULL for `'{}'` — and a CHECK whose expression is NULL is
 *   NOT a violation, so the obvious form would accept exactly the value it was written to reject.
 *   The credit line is an attribution obligation, so an authorless row is a seeding defect rather
 *   than a state.
 * - `CHK_books_cover_image_path` is an ALLOWLIST — `~ '^/[A-Za-z0-9._~/-]+$'` together with
 *   `NOT LIKE '//%'` — and it is written that way because the obvious form is not enough. The pair
 *   `LIKE '/%' AND NOT LIKE '%://%'` reads as "absolute path, no scheme" and still ACCEPTS
 *   `//cdn.example.com/kapak.jpg`, which every browser resolves as a remote URL; `/\host/x.jpg`
 *   too, since the WHATWG URL parser treats `/\` as `//` for special schemes. This alphabet has no
 *   `:`, no `\`, no `%` and no `@`, so it cannot express an authority at all, and the second
 *   conjunct closes the empty-first-segment form the alphabet alone would still allow. That is what
 *   stops the column from ever becoming a remote image proxy; the api serves no image bytes.
 *   **The matrix this constraint must keep rejecting**, verified by hand against Postgres 16:
 *   `//cdn.example.com/kapak.jpg`, `/\cdn.example.com/kapak.jpg`, `https://cdn.example.com/x.jpg`,
 *   `kapak.jpg` (no leading slash) and `/` alone — with
 *   `/kitaplar/ayt-cografya-konu-ozetli-brans-denemeleri.jpg` as the positive control proving the
 *   expression is not vacuously false. B3 owns the automated version: SPEC §16 stages the e2e
 *   invariants there, so until it lands this matrix is re-run by hand.
 * - `CHK_books_purchase_url` requires `https://`. The value becomes an `href` on a public page, so
 *   `javascript:`, `data:` and protocol-relative destinations are refused by the database rather
 *   than by whichever renderer happens to read it — and plain `http://` is refused because
 *   mixed-content links are a defect worth catching at seed time.
 * - `CHK_book_videos_youtube_video_id` pins the 11-character id alphabet: an id one character
 *   short is a dead embed that every structural test still passes.
 * - `UQ_book_videos_youtube_video_id` makes a video belong to exactly one book — the same video
 *   under two denemeler would publish one set of start seconds twice, and only one could be right.
 * - Both foreign keys are `ON DELETE CASCADE`: a deneme has no meaning without its book, and a
 *   start second none without its video.
 * - **`book_videos.deneme_no <= books.deneme_count` is NOT enforced here, and cannot be.** A CHECK
 *   sees one row of one table; the cross-table form needs a trigger, and a trigger is machinery
 *   this catalogue has not earned (playbook §12: YAGNI is the default). `CHK_book_videos_deneme_no`
 *   bounds the number at 1..999 and the rest is a **B2 seed obligation**: refuse a `denemeNo`
 *   greater than its book's `denemeCount`, where both values are hand-read from the same künye and
 *   a mismatch means one of the two readings is wrong.
 *
 * `down()` drops the three tables in dependency order, which takes their indexes and constraints
 * with them.
 */
export class InitBookCatalogue1786752000000 implements MigrationInterface {
  name = 'InitBookCatalogue1786752000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "books" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "slug_tr" character varying(140) NOT NULL,
        "slug_en" character varying(140) NOT NULL,
        "title_tr" character varying(200) NOT NULL,
        "title_en" character varying(200),
        "publisher_name" character varying(120) NOT NULL,
        "author_names" text array NOT NULL,
        "isbn13" character(13) NOT NULL,
        "page_count" integer NOT NULL,
        "exam_track" character varying(8) NOT NULL,
        "deneme_count" integer NOT NULL,
        "cover_image_path" character varying(200),
        "purchase_url" character varying(300),
        "intro_tr" text NOT NULL,
        "intro_en" text,
        "meta_title_tr" character varying(200) NOT NULL,
        "meta_description_tr" character varying(400) NOT NULL,
        "youtube_playlist_id" character varying(64),
        "youtube_channel_id" character varying(32) NOT NULL,
        "display_order" integer NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_books" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_books_slug_tr" UNIQUE ("slug_tr"),
        CONSTRAINT "UQ_books_slug_en" UNIQUE ("slug_en"),
        CONSTRAINT "UQ_books_isbn13" UNIQUE ("isbn13"),
        CONSTRAINT "CHK_books_author_names" CHECK (cardinality("author_names") > 0),
        CONSTRAINT "CHK_books_isbn13" CHECK ("isbn13" ~ '^[0-9]{13}$'),
        CONSTRAINT "CHK_books_page_count" CHECK ("page_count" > 0),
        CONSTRAINT "CHK_books_deneme_count" CHECK ("deneme_count" > 0),
        CONSTRAINT "CHK_books_cover_image_path"
          CHECK (
            "cover_image_path" IS NULL
            OR (
              "cover_image_path" ~ '^/[A-Za-z0-9._~/-]+$'
              AND "cover_image_path" NOT LIKE '//%'
            )
          ),
        CONSTRAINT "CHK_books_purchase_url"
          CHECK ("purchase_url" IS NULL OR "purchase_url" LIKE 'https://%')
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "book_videos" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "book_id" uuid NOT NULL,
        "deneme_no" integer NOT NULL,
        "youtube_video_id" character varying(16) NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_book_videos" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_book_videos_book_deneme" UNIQUE ("book_id", "deneme_no"),
        CONSTRAINT "UQ_book_videos_youtube_video_id" UNIQUE ("youtube_video_id"),
        CONSTRAINT "FK_book_videos_book"
          FOREIGN KEY ("book_id") REFERENCES "books" ("id") ON DELETE CASCADE,
        CONSTRAINT "CHK_book_videos_deneme_no" CHECK ("deneme_no" BETWEEN 1 AND 999),
        CONSTRAINT "CHK_book_videos_youtube_video_id"
          CHECK ("youtube_video_id" ~ '^[A-Za-z0-9_-]{11}$')
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "book_video_questions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "book_video_id" uuid NOT NULL,
        "question_no" integer NOT NULL,
        "start_second" integer NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_book_video_questions" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_book_video_questions_video_question"
          UNIQUE ("book_video_id", "question_no"),
        CONSTRAINT "FK_book_video_questions_video"
          FOREIGN KEY ("book_video_id") REFERENCES "book_videos" ("id") ON DELETE CASCADE,
        CONSTRAINT "CHK_book_video_questions_question_no"
          CHECK ("question_no" BETWEEN 1 AND 99),
        CONSTRAINT "CHK_book_video_questions_start_second" CHECK ("start_second" >= 0)
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Dependency order: questions reference videos, videos reference books.
    await queryRunner.query(`DROP TABLE "book_video_questions"`);
    await queryRunner.query(`DROP TABLE "book_videos"`);
    await queryRunner.query(`DROP TABLE "books"`);
  }
}
