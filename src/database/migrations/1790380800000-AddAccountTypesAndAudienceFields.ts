import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * T-103: account types for audience data. On `users` and `pending_registrations` alike:
 *
 *  1. Three nullable closed-set columns: `teacher_subject`, `institution_type`,
 *     `referral_source`, each with its own CHECK.
 *  2. `account_role` admits `ENTHUSIAST`.
 *  3. `..._profile_shape` is rewritten to spec §5.2: TEACHER carries both teacher fields or
 *     neither; ENTHUSIAST carries nothing; PARENT is minimal or SECONDARY without a school
 *     (the columns describe the child); STUDENT keeps its four branches; teacher fields only on
 *     a TEACHER.
 *
 * Hand-written: `migration:generate` does not replace a CHECK whose name is unchanged
 * (recorded in `1789125265639-AddSchoolNameAndParentAccountRole`).
 *
 * ## `up()` can fail, on purpose
 * The rewritten CHECK is narrower for PARENT: a PARENT row with UNDERGRADUATE/GRADUATE or a
 * `school_name` violates it and Postgres refuses the `ADD CONSTRAINT` (SQLSTATE 23514), which
 * rolls the whole migration back. The web never offered PARENT, so no such row is expected;
 * the PR description carries the preflight count. Every other existing row satisfies the new
 * CHECK because the three new columns are NULL.
 *
 * ## `down()` refuses to destroy data
 * It raises if any row carries a new column value or the `ENTHUSIAST` role, then restores the
 * `1789125265639` CHECKs and drops the columns.
 */
const NO_EDUCATION =
  `"education_level" IS NULL AND "grade_level" IS NULL AND "study_stream" IS NULL AND ` +
  `"university_name" IS NULL AND "department_name" IS NULL AND "school_name" IS NULL`;
const NO_TEACHER = `"teacher_subject" IS NULL AND "institution_type" IS NULL`;

const PROFILE_SHAPE_T103 = `((
  ("account_role" = 'TEACHER' AND ${NO_EDUCATION} AND (
    (${NO_TEACHER}) OR ("teacher_subject" IS NOT NULL AND "institution_type" IS NOT NULL)
  )) OR
  ("account_role" = 'ENTHUSIAST' AND ${NO_EDUCATION} AND ${NO_TEACHER}) OR
  ("account_role" = 'PARENT' AND ${NO_TEACHER} AND (
    (${NO_EDUCATION}) OR (
      "education_level" = 'SECONDARY' AND "grade_level" IS NOT NULL AND
      "study_stream" IS NOT NULL AND "university_name" IS NULL AND
      "department_name" IS NULL AND "school_name" IS NULL
    )
  )) OR
  ("account_role" = 'STUDENT' AND ${NO_TEACHER} AND (
    (${NO_EDUCATION}) OR (
      "education_level" = 'SECONDARY' AND "grade_level" IS NOT NULL AND
      "study_stream" IS NOT NULL AND "university_name" IS NULL AND "department_name" IS NULL
    ) OR (
      "education_level" = 'UNDERGRADUATE' AND "grade_level" IS NULL AND
      "study_stream" IS NULL AND "university_name" IS NOT NULL AND
      "department_name" IS NOT NULL AND "school_name" IS NULL
    ) OR (
      "education_level" = 'GRADUATE' AND "grade_level" IS NULL AND
      "study_stream" IS NULL AND "university_name" IS NOT NULL AND "school_name" IS NULL
    )
  ))
)) IS TRUE`;

/** `1789125265639-AddSchoolNameAndParentAccountRole`'s CHECK, restored by `down()`. */
const PROFILE_SHAPE_P1E = `((
  "account_role" = 'TEACHER' AND ${NO_EDUCATION}
) OR (
  "account_role" IN ('STUDENT', 'PARENT') AND (
    (${NO_EDUCATION}) OR (
      "education_level" = 'SECONDARY' AND "grade_level" IS NOT NULL AND
      "study_stream" IS NOT NULL AND "university_name" IS NULL AND "department_name" IS NULL
    ) OR (
      "education_level" = 'UNDERGRADUATE' AND "grade_level" IS NULL AND
      "study_stream" IS NULL AND "university_name" IS NOT NULL AND
      "department_name" IS NOT NULL AND "school_name" IS NULL
    ) OR (
      "education_level" = 'GRADUATE' AND "grade_level" IS NULL AND
      "study_stream" IS NULL AND "university_name" IS NOT NULL AND "school_name" IS NULL
    )
  )
)) IS TRUE`;

const TABLES = [
  { table: 'users', prefix: 'CHK_users' },
  { table: 'pending_registrations', prefix: 'CHK_pending_registrations' },
] as const;

export class AddAccountTypesAndAudienceFields1790380800000 implements MigrationInterface {
  name = 'AddAccountTypesAndAudienceFields1790380800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const { table, prefix } of TABLES) {
      await queryRunner.query(`ALTER TABLE "${table}" ADD "teacher_subject" character varying(16)`);
      await queryRunner.query(
        `ALTER TABLE "${table}" ADD "institution_type" character varying(16)`,
      );
      await queryRunner.query(`ALTER TABLE "${table}" ADD "referral_source" character varying(16)`);
      await queryRunner.query(`
        ALTER TABLE "${table}" ADD CONSTRAINT "${prefix}_teacher_subject"
          CHECK ("teacher_subject" IS NULL OR "teacher_subject" IN ('COGRAFYA', 'SOSYAL_BILGILER', 'DIGER'))
      `);
      await queryRunner.query(`
        ALTER TABLE "${table}" ADD CONSTRAINT "${prefix}_institution_type"
          CHECK ("institution_type" IS NULL OR "institution_type" IN ('DEVLET_OKULU', 'OZEL_OKUL', 'DERSHANE_KURS', 'DIGER'))
      `);
      await queryRunner.query(`
        ALTER TABLE "${table}" ADD CONSTRAINT "${prefix}_referral_source"
          CHECK ("referral_source" IS NULL OR "referral_source" IN ('OGRETMEN', 'ARKADAS', 'YOUTUBE', 'INSTAGRAM', 'GOOGLE', 'KITAP', 'DIGER'))
      `);

      await queryRunner.query(`ALTER TABLE "${table}" DROP CONSTRAINT "${prefix}_account_role"`);
      await queryRunner.query(`
        ALTER TABLE "${table}" ADD CONSTRAINT "${prefix}_account_role"
          CHECK ("account_role" IN ('STUDENT', 'TEACHER', 'PARENT', 'ENTHUSIAST'))
      `);

      await queryRunner.query(`ALTER TABLE "${table}" DROP CONSTRAINT "${prefix}_profile_shape"`);
      await queryRunner.query(
        `ALTER TABLE "${table}" ADD CONSTRAINT "${prefix}_profile_shape" CHECK (${PROFILE_SHAPE_T103})`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      DECLARE stray integer;
      BEGIN
        SELECT
          (SELECT count(*) FROM "users" WHERE "teacher_subject" IS NOT NULL
             OR "institution_type" IS NOT NULL OR "referral_source" IS NOT NULL
             OR "account_role" = 'ENTHUSIAST') +
          (SELECT count(*) FROM "pending_registrations" WHERE "teacher_subject" IS NOT NULL
             OR "institution_type" IS NOT NULL OR "referral_source" IS NOT NULL
             OR "account_role" = 'ENTHUSIAST')
        INTO stray;
        IF stray > 0 THEN
          RAISE EXCEPTION
            'AddAccountTypesAndAudienceFields.down() refuses: % row(s) carry T-103 data that DROP COLUMN would destroy. Roll forward instead.', stray;
        END IF;
      END $$;
    `);

    for (const { table, prefix } of TABLES) {
      await queryRunner.query(`ALTER TABLE "${table}" DROP CONSTRAINT "${prefix}_profile_shape"`);
      await queryRunner.query(
        `ALTER TABLE "${table}" ADD CONSTRAINT "${prefix}_profile_shape" CHECK (${PROFILE_SHAPE_P1E})`,
      );
      await queryRunner.query(`ALTER TABLE "${table}" DROP CONSTRAINT "${prefix}_account_role"`);
      await queryRunner.query(`
        ALTER TABLE "${table}" ADD CONSTRAINT "${prefix}_account_role"
          CHECK ("account_role" IN ('STUDENT', 'TEACHER', 'PARENT'))
      `);
      await queryRunner.query(`ALTER TABLE "${table}" DROP CONSTRAINT "${prefix}_referral_source"`);
      await queryRunner.query(
        `ALTER TABLE "${table}" DROP CONSTRAINT "${prefix}_institution_type"`,
      );
      await queryRunner.query(`ALTER TABLE "${table}" DROP CONSTRAINT "${prefix}_teacher_subject"`);
      await queryRunner.query(`ALTER TABLE "${table}" DROP COLUMN "referral_source"`);
      await queryRunner.query(`ALTER TABLE "${table}" DROP COLUMN "institution_type"`);
      await queryRunner.query(`ALTER TABLE "${table}" DROP COLUMN "teacher_subject"`);
    }
  }
}
