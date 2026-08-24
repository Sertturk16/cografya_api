import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the endpoint-free UYELIK-01 identity/profile core.
 *
 * Generated from `User` against a disposable Postgres 16 database after all 21
 * prior migrations, then hand-reviewed. TypeORM also proposed unrelated renames
 * for hand-authored legacy indexes/constraints and one legacy default change;
 * all of that drift was discarded. The forward path is deliberately one new
 * table plus its district lookup index: no existing row is updated, deleted or
 * backfilled.
 *
 * `district_id` is the only stored location key. `ON DELETE RESTRICT` makes a
 * district removal/rename fail while an account points at it; the safe path is
 * a separately reviewed mapping migration, never an orphan or cascade delete.
 *
 * DATA-LOSS WARNING: `down()` drops `users`. It is safe only on an empty or
 * synthetic database. Once a real account exists, reverting this migration
 * permanently deletes PII and account access; production correction must use a
 * forward migration unless the owner has explicitly approved a verified backup/
 * restore plan and the destructive rollback.
 */
export class InitUsers1787562000000 implements MigrationInterface {
  name = 'InitUsers1787562000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "first_name" character varying(100) NOT NULL,
        "last_name" character varying(100) NOT NULL,
        "phone" character varying(13) NOT NULL,
        "email" character varying(254) NOT NULL,
        "password_hash" text NOT NULL,
        "account_role" character varying(16) NOT NULL,
        "education_level" character varying(20),
        "grade_level" character varying(16),
        "study_stream" character varying(20),
        "university_name" character varying(200),
        "department_name" character varying(200),
        "district_id" uuid NOT NULL,
        "status" character varying(24) NOT NULL DEFAULT 'UNVERIFIED',
        "email_verified_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_users" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_users_email" UNIQUE ("email"),
        CONSTRAINT "FK_users_district"
          FOREIGN KEY ("district_id") REFERENCES "districts" ("id") ON DELETE RESTRICT,
        CONSTRAINT "CHK_users_first_name"
          CHECK ("first_name" <> '' AND "first_name" = btrim("first_name")),
        CONSTRAINT "CHK_users_last_name"
          CHECK ("last_name" <> '' AND "last_name" = btrim("last_name")),
        CONSTRAINT "CHK_users_phone" CHECK ("phone" ~ '^\\+905[0-9]{9}$'),
        CONSTRAINT "CHK_users_email_canonical"
          CHECK ("email" <> '' AND "email" = btrim("email") AND "email" = lower("email")),
        CONSTRAINT "CHK_users_password_hash" CHECK ("password_hash" ~ '^\\$argon2id\\$'),
        CONSTRAINT "CHK_users_account_role"
          CHECK ("account_role" IN ('STUDENT', 'TEACHER')),
        CONSTRAINT "CHK_users_education_level"
          CHECK (
            "education_level" IS NULL OR
            "education_level" IN ('SECONDARY', 'UNDERGRADUATE', 'GRADUATE')
          ),
        CONSTRAINT "CHK_users_grade_level"
          CHECK (
            "grade_level" IS NULL OR "grade_level" IN (
              'GRADE_5', 'GRADE_6', 'GRADE_7', 'GRADE_8', 'GRADE_9', 'GRADE_10',
              'GRADE_11', 'GRADE_12', 'MEZUN', 'KPSS', 'DIGER'
            )
          ),
        CONSTRAINT "CHK_users_study_stream"
          CHECK (
            "study_stream" IS NULL OR "study_stream" IN (
              'SAYISAL', 'SOZEL', 'ESIT_AGIRLIK', 'TYT', 'DIL', 'LGS', 'MSU',
              'ARA_SINIF', 'KPSS', 'DIGER'
            )
          ),
        CONSTRAINT "CHK_users_university_name"
          CHECK (
            "university_name" IS NULL OR (
              "university_name" <> '' AND "university_name" = btrim("university_name")
            )
          ),
        CONSTRAINT "CHK_users_department_name"
          CHECK (
            "department_name" IS NULL OR (
              "department_name" <> '' AND "department_name" = btrim("department_name")
            )
          ),
        CONSTRAINT "CHK_users_status"
          CHECK ("status" IN ('UNVERIFIED', 'ACTIVE', 'DISABLED', 'PENDING_DELETION')),
        CONSTRAINT "CHK_users_profile_shape"
          CHECK (
            (
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
            )
          ),
        CONSTRAINT "CHK_users_verification_state"
          CHECK (
            ("status" = 'UNVERIFIED' AND "email_verified_at" IS NULL) OR
            ("status" = 'ACTIVE' AND "email_verified_at" IS NOT NULL) OR
            "status" IN ('DISABLED', 'PENDING_DELETION')
          )
      )
    `);

    await queryRunner.query(`CREATE INDEX "IDX_users_district_id" ON "users" ("district_id")`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "users"`);
  }
}
