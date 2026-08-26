import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates `video_progress` — one row per `(user, book_video)` (UYELIK-05, `UYELIK-05-plan.md` §5.2).
 *
 * Hand-authored raw SQL and hand-reviewed (`ENGINEERING.md` §5). Schema plus its two protected
 * endpoints land in the same PR — no client of `cografya_web` reads it yet (deferred to UYELIK-06).
 *
 * ## `UQ_video_progress_user_book_video` is the only index
 * It is simultaneously the access-path index for both endpoints
 * (`WHERE user_id = ? AND book_video_id = ?`) and the mechanism that makes the upsert idempotent
 * AND concurrency-safe: `INSERT … ON CONFLICT` is atomic at the row-lock level, so two concurrent
 * upserts for the same pair serialize inside Postgres rather than racing to create two rows. No
 * second index duplicates it (the `book_videos`/`book_video_questions` precedent).
 *
 * ## Both FKs `ON DELETE CASCADE`
 * A progress row has no meaning without its user or its video — the same reasoning already
 * recorded on `sessions.user_id` and `book_video_questions.book_video_id`.
 *
 * ## `CHK_video_progress_watched_at`
 * Ties `watched`'s boolean state to `watched_at`'s nullability, mirroring `users`'s own
 * `CHK_users_verification_state` idiom.
 *
 * `down()` drops the table with its constraints. Safe unconditionally: this migration's own `up()`
 * is the only writer of this table in this PR.
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
          FOREIGN KEY ("book_video_id") REFERENCES "book_videos" ("id") ON DELETE CASCADE,
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
