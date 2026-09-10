import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Widens `favorites` from a two-branch (province XOR country) exclusive arc to a four-branch
 * one — adding `region_id` and `continent` — so the favourites contract covers all four public
 * entity types the widened API surface publishes (P1 PR-A plan §5.1/§5.1.1).
 *
 * Hand-authored raw SQL and hand-reviewed (`ENGINEERING.md` §5), following
 * `InitFavorites`/`AddContinentAntarctica`'s own write-up shape.
 *
 * ## Why `num_nonnulls(...) = 1` replaces the two-branch boolean XOR
 * A four-branch hand-written XOR would be eight predicates nobody can read; `num_nonnulls`
 * (Postgres 9.6+, this repo is on Postgres 16) is one expression and scales to a fifth type by
 * adding one argument, with no change to the shape of the constraint.
 *
 * ## `region_id` has a real FK; `continent` deliberately does NOT
 * `regions` is a real table with its own uuid PK, so `region_id` gets the same `ON DELETE
 * RESTRICT` FK treatment `province_id`/`country_id` already carry — a favourite row is
 * user-produced and derivable from nothing, the same reasoning the entity's own docblock states
 * in full. `Continent`, by contrast, is a Postgres **enum type** (`"continent"`, already created
 * by `AddContinentAntarctica`), not a table — there is no `continents` row to reference, so no FK
 * is possible for that branch. `continent` is typed directly as the existing `"continent"` enum
 * column type instead, which is itself the membership check: an invalid label cannot be written
 * to the column at all.
 *
 * ## Uniqueness — two more plain two-column unique constraints, no partial index needed
 * Postgres treats NULL as distinct from NULL in a plain UNIQUE constraint, so
 * `UQ_favorites_user_region` only ever fires between two rows that BOTH carry a real,
 * matching `region_id` — and symmetrically for `UQ_favorites_user_continent`. Each new
 * constraint doubles as its own `INSERT … ON CONFLICT` target and as the access-path index for
 * `WHERE user_id = ?`, mirroring the two existing constraints exactly.
 *
 * ## `up()` executes no DML — provably, not by inspection alone
 * There is no `UPDATE`, no `INSERT` and no `DELETE` anywhere below. Every existing row's `id`,
 * `user_id`, `province_id`, `country_id` and `created_at` are byte-identical before and after;
 * it gains two `NULL` columns. Can any existing row be lost or orphaned? No: step 7's
 * `ADD CONSTRAINT … CHECK` validates every existing row at add time and would abort the
 * migration on a failure — every existing row satisfied the OLD two-branch CHECK (exactly one of
 * `province_id`/`country_id` non-null) and both new columns are NULL for every such row, so
 * `num_nonnulls(...)` is exactly 1 for all of them, deterministically. The new FK (step 3) is
 * added on a column that is NULL in every existing row, so it validates trivially, and steps 4/5
 * add unique constraints over `(user_id, NULL)` pairs, which Postgres never considers duplicates.
 * Orphaning is impossible because the two existing FKs are untouched and still `RESTRICT`.
 *
 * ## `down()` is fail-closed rather than destructive
 * `DROP COLUMN` is unconditionally destructive once a row uses either new column, so `down()`
 * first counts region/continent favourite rows and `RAISE EXCEPTION`s rather than dropping them
 * silently — extending the precedent `AllowStudentMinimalRegistrationProfileShape` set (it
 * documents a pre-check query; this one enforces it). On a database where no region or
 * continent favourite has yet been created — every database at the moment this lands — `down()`
 * is fully reversible and loses nothing. Once one exists, `down()` refuses; reverting in that
 * state requires an explicit owner decision and forward remediation, exactly as `InitFavorites`'
 * own DATA-LOSS WARNING already states for this table. **`down()` is therefore NOT a full
 * reverse of `up()` in every reachable state — this is stated here in those words, not implied.**
 */
export class AddFavoriteRegionAndContinent1788310000000 implements MigrationInterface {
  name = 'AddFavoriteRegionAndContinent1788310000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "favorites" ADD COLUMN "region_id" uuid`);
    await queryRunner.query(`ALTER TABLE "favorites" ADD COLUMN "continent" "continent"`);

    await queryRunner.query(`
      ALTER TABLE "favorites"
        ADD CONSTRAINT "FK_favorites_region"
        FOREIGN KEY ("region_id") REFERENCES "regions" ("id") ON DELETE RESTRICT
    `);

    await queryRunner.query(`
      ALTER TABLE "favorites"
        ADD CONSTRAINT "UQ_favorites_user_region" UNIQUE ("user_id", "region_id")
    `);
    await queryRunner.query(`
      ALTER TABLE "favorites"
        ADD CONSTRAINT "UQ_favorites_user_continent" UNIQUE ("user_id", "continent")
    `);

    await queryRunner.query(`
      ALTER TABLE "favorites" DROP CONSTRAINT "CHK_favorites_exactly_one_target"
    `);
    await queryRunner.query(`
      ALTER TABLE "favorites"
        ADD CONSTRAINT "CHK_favorites_exactly_one_target" CHECK (
          num_nonnulls("province_id", "country_id", "region_id", "continent") = 1
        )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      DECLARE stray integer;
      BEGIN
        SELECT count(*) INTO stray FROM "favorites"
         WHERE "region_id" IS NOT NULL OR "continent" IS NOT NULL;
        IF stray > 0 THEN
          RAISE EXCEPTION
            'AddFavoriteRegionAndContinent.down() refuses: % region/continent favourite row(s) would be destroyed by DROP COLUMN. Remove them deliberately, or roll forward instead.', stray;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      ALTER TABLE "favorites" DROP CONSTRAINT "UQ_favorites_user_region"
    `);
    await queryRunner.query(`
      ALTER TABLE "favorites" DROP CONSTRAINT "UQ_favorites_user_continent"
    `);
    await queryRunner.query(`
      ALTER TABLE "favorites" DROP CONSTRAINT "FK_favorites_region"
    `);
    await queryRunner.query(`
      ALTER TABLE "favorites" DROP CONSTRAINT "CHK_favorites_exactly_one_target"
    `);

    await queryRunner.query(`ALTER TABLE "favorites" DROP COLUMN "region_id"`);
    await queryRunner.query(`ALTER TABLE "favorites" DROP COLUMN "continent"`);

    await queryRunner.query(`
      ALTER TABLE "favorites"
        ADD CONSTRAINT "CHK_favorites_exactly_one_target" CHECK (
          ("province_id" IS NOT NULL AND "country_id" IS NULL) OR
          ("province_id" IS NULL AND "country_id" IS NOT NULL)
        )
    `);
  }
}
