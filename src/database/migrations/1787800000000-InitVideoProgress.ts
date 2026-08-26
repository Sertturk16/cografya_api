import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates `video_progress` — one row per `(user, book_video)` (UYELIK-05, `UYELIK-05-plan.md` §5.2).
 *
 * Hand-authored raw SQL and hand-reviewed (`ENGINEERING.md` §5). Schema plus its two protected
 * endpoints land in the same PR — no client of `cografya_web` reads it yet (deferred to UYELIK-06).
 *
 * ## `UQ_video_progress_user_book_video` is the only non-PK index
 * It is simultaneously the access-path index for both endpoints
 * (`WHERE user_id = ? AND book_video_id = ?`) and the mechanism that makes the upsert idempotent
 * AND concurrency-safe: `INSERT … ON CONFLICT` is atomic at the row-lock level, so two concurrent
 * upserts for the same pair serialize inside Postgres rather than racing to create two rows.
 * No standalone `book_video_id` index is added, and the `book_videos`/`book_video_questions`
 * precedent is NOT what justifies that: there the FK column LEADS its composite unique constraint,
 * here it TRAILS one, so this index gives no seek on `book_video_id` alone. The real reason is
 * narrower — the only reader of such an index would be the referential-integrity check Postgres
 * runs when `pnpm db:seed:books --allow-removals` deletes a `book_videos` row
 * (`seed-books.ts:315`): a hand-run, offline, operator-authorised maintenance command, never a
 * request-path query. A second index would be paid for on every hot-path upsert to speed up that
 * one rare command. A future "list my progress" endpoint would want `IDX_video_progress_user_id`;
 * not built now.
 *
 * ## The two FKs are deliberately ASYMMETRIC
 * `user_id` is `ON DELETE CASCADE`: a progress row has no meaning without its user, and an account
 * deletion is the data owner's own act — the reasoning already recorded on `sessions.user_id`.
 * `book_video_id` is `ON DELETE RESTRICT`, and the governing precedent is `users.district_id`
 * (`1787562000000-InitUsers.ts:13-15`), NOT `book_video_questions.book_video_id`. The difference is
 * who produced the data: question rows are seed-derived and re-derivable from the artefact,
 * progress rows are user-produced and derivable from nothing. `book_videos` has no REQUEST-PATH
 * delete, but it does have a real one — `pnpm db:seed:books --allow-removals` removes a
 * `book_videos` row whose deneme left the artefact. Under CASCADE that operator command would
 * silently delete other users' saved positions, while the CLI's own "THIS RUN DELETED PUBLISHED
 * ROWS" warning (`books.cli.ts:118-125`) counts only video and question rows and would say nothing.
 * Under RESTRICT Postgres refuses the delete, the seed's all-or-nothing transaction rolls the whole
 * run back, and the operator gets a named constraint violation instead of silent loss. Retiring a
 * video that already has progress is therefore a deliberate, separately reviewed forward migration
 * — never a cascade delete, exactly as `users.district_id` states.
 *
 * ## `CHK_video_progress_watched_at`
 * Ties `watched`'s boolean state to `watched_at`'s nullability, mirroring `users`'s own
 * `CHK_users_verification_state` idiom.
 *
 * DATA-LOSS WARNING: `down()` drops `video_progress` with its constraints. It is safe only on an
 * empty or synthetic database. This migration's `up()` is NOT the table's only writer —
 * `VideoProgressService.upsert` writes it behind `PUT /api/video-progress/{bookVideoId}`, shipped in
 * this same PR. Once a real progress row exists, reverting permanently deletes user data no source
 * can re-derive; production correction must use a forward migration unless the owner has explicitly
 * approved a verified backup/restore plan and the destructive rollback.
 */
export class InitVideoProgress1787800000000 implements MigrationInterface {
  name = 'InitVideoProgress1787800000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "video_progress" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "book_video_id" uuid NOT NULL,
        "last_position_seconds" integer NOT NULL,
        "watched" boolean NOT NULL DEFAULT false,
        "watched_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_video_progress" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_video_progress_user_book_video" UNIQUE ("user_id", "book_video_id"),
        CONSTRAINT "FK_video_progress_user"
          FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_video_progress_book_video"
          FOREIGN KEY ("book_video_id") REFERENCES "book_videos" ("id") ON DELETE RESTRICT,
        CONSTRAINT "CHK_video_progress_position" CHECK ("last_position_seconds" >= 0),
        CONSTRAINT "CHK_video_progress_watched_at"
          CHECK (
            ("watched" = false AND "watched_at" IS NULL) OR
            ("watched" = true AND "watched_at" IS NOT NULL)
          )
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "video_progress"`);
  }
}
