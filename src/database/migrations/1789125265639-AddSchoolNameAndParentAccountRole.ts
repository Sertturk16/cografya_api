import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * UYE-P1E: the revised registration contract (`Owner's Inbox/uyelik-uyum-denetimi/
 * p1-kayit-sozlesmesi/plan.md` §5.4, `GLOSSARY.md` §7.1, `DEC 2026-09-11g`). Two independent
 * additions, on `users` and `pending_registrations` alike (the two tables' CHECK sets are
 * hand-mirrored, `ENGINEERING.md` §5):
 *
 *  1. A new, nullable, free-text `school_name` column — meaningful only within
 *     `education_level = SECONDARY`, optional even there (no consuming feature yet,
 *     `DEC 2026-09-11g`), and NULL-constrained everywhere else by the widened
 *     `..._profile_shape` CHECK below. It is deliberately NOT a closed set: no reference table,
 *     no FK, just a trimmed-non-empty-or-NULL shape check, the same pattern
 *     `..._university_name`/`..._department_name` already use.
 *  2. `AccountRole` gains `PARENT` ("Veli"), reusing the STUDENT branches of the profile-shape
 *     matrix in full rather than adding a sixth branch — the widened CHECK's role predicate
 *     admits both roles wherever the old one named `STUDENT` alone.
 *
 * ## Hand-authored, not `migration:generate`'s raw output (`ENGINEERING.md` §5: "read and
 * hand-review the generated SQL")
 * `pnpm migration:generate` against this branch's dev database produced two problems, both
 * caught by that hand-review rather than committed blind:
 *  - Its diff carried ~40 unrelated `DROP`/`ADD CONSTRAINT` and index-rename statements against
 *    tables this task never touches (`air_quality_province_series`, `favorites`, `sessions`,
 *    `districts`, `books`, …). These are pre-existing generator/naming-strategy drift between
 *    TypeORM's default constraint-naming and this repo's explicitly-named constraints, unrelated
 *    to this change; none of it is reproduced here, following the same precedent
 *    `AddFavoriteRegionAndContinent`/`InitFavorites` already hand-authored raw SQL against.
 *  - **More importantly, it silently OMITTED the `..._account_role` and `..._profile_shape`
 *    CHECK updates entirely.** TypeORM's schema differ matches an entity's `@Check` list against
 *    the live table's checks BY CONSTRAINT NAME ONLY (`RdbmsSchemaBuilder.js`: a check is
 *    queued for replacement only when its NAME is absent from the other side) — since both
 *    constraints keep their existing names and only their expression TEXT changed, the generator
 *    read them as unchanged and produced no statement for either. Running the generated file
 *    as-is would have left the live CHECKs still rejecting `PARENT` and still ignorant of
 *    `school_name`, silently out of step with the entity files from the moment this migration
 *    ran — exactly the class of bug `ENGINEERING.md` §5's hand-review line exists to catch.
 *
 * ## `up()` is additive only, provably
 * Every existing row is `account_role IN ('STUDENT', 'TEACHER')` before this migration runs (no
 * `PARENT` value exists yet), so widening both `..._account_role` CHECKs to admit a third value
 * validates trivially against every existing row. `school_name` is added NULL for every existing
 * row and the widened `..._profile_shape` CHECK requires exactly that (`school_name IS NULL`) on
 * every branch except `SECONDARY`, which leaves it unconstrained — so no existing row can fail
 * either widened CHECK. No column is dropped, no row is read, written or reinterpreted.
 */
export class AddSchoolNameAndParentAccountRole1789125265639 implements MigrationInterface {
  name = 'AddSchoolNameAndParentAccountRole1789125265639';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN "school_name" character varying(200)`);
    await queryRunner.query(
      `ALTER TABLE "pending_registrations" ADD COLUMN "school_name" character varying(200)`,
    );

    await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "CHK_users_account_role"`);
    await queryRunner.query(`
      ALTER TABLE "users"
        ADD CONSTRAINT "CHK_users_account_role" CHECK ("account_role" IN ('STUDENT', 'TEACHER', 'PARENT'))
    `);
    await queryRunner.query(
      `ALTER TABLE "pending_registrations" DROP CONSTRAINT "CHK_pending_registrations_account_role"`,
    );
    await queryRunner.query(`
      ALTER TABLE "pending_registrations"
        ADD CONSTRAINT "CHK_pending_registrations_account_role"
        CHECK ("account_role" IN ('STUDENT', 'TEACHER', 'PARENT'))
    `);

    await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "CHK_users_profile_shape"`);
    await queryRunner.query(`
      ALTER TABLE "users" ADD CONSTRAINT "CHK_users_profile_shape" CHECK (
        ((
          "account_role" = 'TEACHER' AND
          "education_level" IS NULL AND
          "grade_level" IS NULL AND
          "study_stream" IS NULL AND
          "university_name" IS NULL AND
          "department_name" IS NULL AND
          "school_name" IS NULL
        ) OR (
          "account_role" IN ('STUDENT', 'PARENT') AND (
            (
              "education_level" IS NULL AND
              "grade_level" IS NULL AND
              "study_stream" IS NULL AND
              "university_name" IS NULL AND
              "department_name" IS NULL AND
              "school_name" IS NULL
            ) OR (
              "education_level" = 'SECONDARY' AND
              "grade_level" IS NOT NULL AND
              "study_stream" IS NOT NULL AND
              "university_name" IS NULL AND
              "department_name" IS NULL
            ) OR (
              "education_level" = 'UNDERGRADUATE' AND
              "grade_level" IS NULL AND
              "study_stream" IS NULL AND
              "university_name" IS NOT NULL AND
              "department_name" IS NOT NULL AND
              "school_name" IS NULL
            ) OR (
              "education_level" = 'GRADUATE' AND
              "grade_level" IS NULL AND
              "study_stream" IS NULL AND
              "university_name" IS NOT NULL AND
              "school_name" IS NULL
            )
          )
        )) IS TRUE
      )
    `);

    await queryRunner.query(
      `ALTER TABLE "pending_registrations" DROP CONSTRAINT "CHK_pending_registrations_profile_shape"`,
    );
    await queryRunner.query(`
      ALTER TABLE "pending_registrations" ADD CONSTRAINT "CHK_pending_registrations_profile_shape" CHECK (
        ((
          "account_role" = 'TEACHER' AND
          "education_level" IS NULL AND
          "grade_level" IS NULL AND
          "study_stream" IS NULL AND
          "university_name" IS NULL AND
          "department_name" IS NULL AND
          "school_name" IS NULL
        ) OR (
          "account_role" IN ('STUDENT', 'PARENT') AND (
            (
              "education_level" IS NULL AND
              "grade_level" IS NULL AND
              "study_stream" IS NULL AND
              "university_name" IS NULL AND
              "department_name" IS NULL AND
              "school_name" IS NULL
            ) OR (
              "education_level" = 'SECONDARY' AND
              "grade_level" IS NOT NULL AND
              "study_stream" IS NOT NULL AND
              "university_name" IS NULL AND
              "department_name" IS NULL
            ) OR (
              "education_level" = 'UNDERGRADUATE' AND
              "grade_level" IS NULL AND
              "study_stream" IS NULL AND
              "university_name" IS NOT NULL AND
              "department_name" IS NOT NULL AND
              "school_name" IS NULL
            ) OR (
              "education_level" = 'GRADUATE' AND
              "grade_level" IS NULL AND
              "study_stream" IS NULL AND
              "university_name" IS NOT NULL AND
              "school_name" IS NULL
            )
          )
        )) IS TRUE
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "users" ADD CONSTRAINT "CHK_users_school_name"
        CHECK ("school_name" IS NULL OR ("school_name" <> '' AND "school_name" = btrim("school_name")))
    `);
    await queryRunner.query(`
      ALTER TABLE "pending_registrations" ADD CONSTRAINT "CHK_pending_registrations_school_name"
        CHECK ("school_name" IS NULL OR ("school_name" <> '' AND "school_name" = btrim("school_name")))
    `);
  }

  /**
   * Two independent revert hazards, handled differently because Postgres itself only
   * fail-closes on one of them:
   *  - **`school_name` present anywhere:** `DROP COLUMN` is unconditionally destructive and
   *    Postgres does NOT refuse it on account of live data, so this method opens with an
   *    explicit guard (the `AddFavoriteRegionAndContinent` precedent) that `RAISE EXCEPTION`s
   *    before touching anything if any row on either table carries a non-null `school_name`.
   *  - **A live `PARENT` row:** re-narrowing `..._profile_shape` (no `PARENT` branch) and then
   *    `..._account_role` (`IN ('STUDENT', 'TEACHER')`) both `ADD CONSTRAINT ... CHECK`, which
   *    Postgres DOES validate against every existing row — a `PARENT` row fails the narrowed
   *    `..._profile_shape` CHECK first (SQLSTATE 23514) with no custom guard needed, the same
   *    natural-failure posture `AllowStudentMinimalRegistrationProfileShape.down()` documents for
   *    its own CHECK-narrowing revert.
   * On a database where no `PARENT` account exists and no `school_name` has ever been collected
   * — every database at the moment this migration lands — `down()` is fully reversible.
   */
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      DECLARE stray integer;
      BEGIN
        SELECT
          (SELECT count(*) FROM "users" WHERE "school_name" IS NOT NULL) +
          (SELECT count(*) FROM "pending_registrations" WHERE "school_name" IS NOT NULL)
        INTO stray;
        IF stray > 0 THEN
          RAISE EXCEPTION
            'AddSchoolNameAndParentAccountRole.down() refuses: % school_name row(s) would be destroyed by DROP COLUMN. Remove them deliberately, or roll forward instead.', stray;
        END IF;
      END $$;
    `);

    await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "CHK_users_school_name"`);
    await queryRunner.query(
      `ALTER TABLE "pending_registrations" DROP CONSTRAINT "CHK_pending_registrations_school_name"`,
    );

    await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "CHK_users_profile_shape"`);
    await queryRunner.query(`
      ALTER TABLE "users" ADD CONSTRAINT "CHK_users_profile_shape" CHECK (
        ((
          "account_role" = 'TEACHER' AND
          "education_level" IS NULL AND
          "grade_level" IS NULL AND
          "study_stream" IS NULL AND
          "university_name" IS NULL AND
          "department_name" IS NULL
        ) OR (
          "account_role" = 'STUDENT' AND (
            (
              "education_level" IS NULL AND
              "grade_level" IS NULL AND
              "study_stream" IS NULL AND
              "university_name" IS NULL AND
              "department_name" IS NULL
            ) OR (
              "education_level" = 'SECONDARY' AND
              "grade_level" IS NOT NULL AND
              "study_stream" IS NOT NULL AND
              "university_name" IS NULL AND
              "department_name" IS NULL
            ) OR (
              "education_level" = 'UNDERGRADUATE' AND
              "grade_level" IS NULL AND
              "study_stream" IS NULL AND
              "university_name" IS NOT NULL AND
              "department_name" IS NOT NULL
            ) OR (
              "education_level" = 'GRADUATE' AND
              "grade_level" IS NULL AND
              "study_stream" IS NULL AND
              "university_name" IS NOT NULL
            )
          )
        )) IS TRUE
      )
    `);

    await queryRunner.query(
      `ALTER TABLE "pending_registrations" DROP CONSTRAINT "CHK_pending_registrations_profile_shape"`,
    );
    await queryRunner.query(`
      ALTER TABLE "pending_registrations" ADD CONSTRAINT "CHK_pending_registrations_profile_shape" CHECK (
        ((
          "account_role" = 'TEACHER' AND
          "education_level" IS NULL AND
          "grade_level" IS NULL AND
          "study_stream" IS NULL AND
          "university_name" IS NULL AND
          "department_name" IS NULL
        ) OR (
          "account_role" = 'STUDENT' AND (
            (
              "education_level" IS NULL AND
              "grade_level" IS NULL AND
              "study_stream" IS NULL AND
              "university_name" IS NULL AND
              "department_name" IS NULL
            ) OR (
              "education_level" = 'SECONDARY' AND
              "grade_level" IS NOT NULL AND
              "study_stream" IS NOT NULL AND
              "university_name" IS NULL AND
              "department_name" IS NULL
            ) OR (
              "education_level" = 'UNDERGRADUATE' AND
              "grade_level" IS NULL AND
              "study_stream" IS NULL AND
              "university_name" IS NOT NULL AND
              "department_name" IS NOT NULL
            ) OR (
              "education_level" = 'GRADUATE' AND
              "grade_level" IS NULL AND
              "study_stream" IS NULL AND
              "university_name" IS NOT NULL
            )
          )
        )) IS TRUE
      )
    `);

    await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "CHK_users_account_role"`);
    await queryRunner.query(`
      ALTER TABLE "users" ADD CONSTRAINT "CHK_users_account_role" CHECK ("account_role" IN ('STUDENT', 'TEACHER'))
    `);
    await queryRunner.query(
      `ALTER TABLE "pending_registrations" DROP CONSTRAINT "CHK_pending_registrations_account_role"`,
    );
    await queryRunner.query(`
      ALTER TABLE "pending_registrations"
        ADD CONSTRAINT "CHK_pending_registrations_account_role" CHECK ("account_role" IN ('STUDENT', 'TEACHER'))
    `);

    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "school_name"`);
    await queryRunner.query(`ALTER TABLE "pending_registrations" DROP COLUMN "school_name"`);
  }
}
