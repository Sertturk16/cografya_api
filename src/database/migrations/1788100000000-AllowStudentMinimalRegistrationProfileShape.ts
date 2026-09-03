import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Supports minimal registration for student profiles (Decision 2-B, DEC 2026-09-03a md.1).
 *
 * Allows a student to register without education fields (all education columns NULL)
 * pending a future post-registration profile onboarding step.
 *
 * ROLLBACK HAZARD WARNING: `down()` restores the strict 4-branch CHECK constraints.
 * Because `ALTER TABLE ... ADD CONSTRAINT` validates all existing rows, `down()` will fail with
 * SQLSTATE 23514 check_violation if any student row with null education fields exists in `users`
 * or `pending_registrations`. Reverting is safe only if:
 * `SELECT count(*) FROM users WHERE account_role = 'STUDENT' AND education_level IS NULL;`
 * returns 0. Any non-zero count requires an owner decision and forward remediation.
 */
export class AllowStudentMinimalRegistrationProfileShape1788100000000 implements MigrationInterface {
  name = 'AllowStudentMinimalRegistrationProfileShape1788100000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users" DROP CONSTRAINT "CHK_users_profile_shape";
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
      );

      ALTER TABLE "pending_registrations" DROP CONSTRAINT "CHK_pending_registrations_profile_shape";
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
      );
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users" DROP CONSTRAINT "CHK_users_profile_shape";
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
      );

      ALTER TABLE "pending_registrations" DROP CONSTRAINT "CHK_pending_registrations_profile_shape";
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
      );
    `);
  }
}
