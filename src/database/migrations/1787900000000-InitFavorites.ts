import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates `favorites` — one row per user-declared province-or-country favorite (UYELIK-07,
 * `UYELIK-07-plan.md` §5.2).
 *
 * Hand-authored raw SQL and hand-reviewed (`ENGINEERING.md` §5), following `InitVideoProgress`'s
 * own precedent exactly for the write-up shape.
 *
 * ## `CHK_favorites_exactly_one_target` — the one new schema idiom in this repo
 * Nothing else here uses a two-nullable-FK-column-with-XOR-check shape. It enforces that exactly
 * one of `province_id`/`country_id` is set per row, which is what makes both columns real,
 * independently-enforced FK constraints rather than a polymorphic `(type, id)` pair — see the
 * entity's own docblock for the full "one table, not two" reasoning.
 *
 * ## The two UNIQUE constraints are also the ON CONFLICT targets and the access-path indexes
 * `UQ_favorites_user_province` / `UQ_favorites_user_country` each lead with `user_id`, so either
 * one already serves `WHERE user_id = ?` (`GET /api/favorites`) — no third, standalone
 * `IDX_favorites_user_id` is added. `FavoritesService`'s add path targets each constraint by name
 * in its own `INSERT … ON CONFLICT (…) DO NOTHING`.
 *
 * ## The three FKs, and why `province_id`/`country_id` are RESTRICT rather than CASCADE
 * `FK_favorites_user` is `ON DELETE CASCADE` — a favorite has no meaning without its user, the
 * same reasoning already recorded on `sessions.user_id` / `video_progress.user_id`.
 * `FK_favorites_province` / `FK_favorites_country` are `ON DELETE RESTRICT`, chosen DEFENSIVELY:
 * measured directly against `seedGeography`/`seedWorld` (strictly insert-or-update, no
 * `--allow-removals`, no delete branch at all), no operator-triggered delete path for either
 * `provinces` or `countries` exists in this repo today — unlike `video_progress.book_video_id`,
 * this choice defends nothing that can currently happen. It is made anyway because a favorite row
 * is user-produced and derivable from nothing (nobody can reconstruct "this user favorited Sinop"
 * from any other source), the same class of data `users.district_id` and
 * `video_progress.book_video_id` already protect with RESTRICT: if any future operator-facing
 * removal path is ever added for a province or a country (an admin panel, a corpus correction
 * script), it fails loudly on a referenced row instead of silently erasing a stated user
 * preference with no signal.
 *
 * DATA-LOSS WARNING: `down()` drops `favorites` with its constraints. It is safe only on an empty
 * or synthetic database. This migration's `up()` is NOT the table's only writer —
 * `FavoritesService` writes and deletes rows behind the five `/api/favorites…` routes, shipped in
 * this same PR. Once a real favorite row exists, reverting permanently deletes user data no
 * source can re-derive; production correction must use a forward migration unless the owner has
 * explicitly approved a verified backup/restore plan and the destructive rollback.
 */
export class InitFavorites1787900000000 implements MigrationInterface {
  name = 'InitFavorites1787900000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "favorites" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "province_id" uuid,
        "country_id" uuid,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_favorites" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_favorites_user_province" UNIQUE ("user_id", "province_id"),
        CONSTRAINT "UQ_favorites_user_country" UNIQUE ("user_id", "country_id"),
        CONSTRAINT "FK_favorites_user"
          FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_favorites_province"
          FOREIGN KEY ("province_id") REFERENCES "provinces" ("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_favorites_country"
          FOREIGN KEY ("country_id") REFERENCES "countries" ("id") ON DELETE RESTRICT,
        CONSTRAINT "CHK_favorites_exactly_one_target" CHECK (
          ("province_id" IS NOT NULL AND "country_id" IS NULL) OR
          ("province_id" IS NULL AND "country_id" IS NOT NULL)
        )
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "favorites"`);
  }
}
