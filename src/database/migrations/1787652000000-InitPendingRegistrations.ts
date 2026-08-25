import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Replaces `email_verification_codes` with `pending_registrations` — the schema half of the
 * UYELIK-02 PR-2 review's CRITICAL finding (`SEC136-C1`).
 *
 * ## Why the old table is DROPPED rather than kept
 * `email_verification_codes` hung off `users(id)`, which only made sense while an unverified
 * registration WAS a `users` row. It no longer is: the row is materialized in the verify
 * transaction from the candidate whose code was presented, so a code can no longer belong to a
 * user that does not exist yet. Keeping the table would leave dead schema with a live FK and an
 * `UQ_..._active` index enforcing a one-slot rule the product deliberately abandoned. Measured
 * before dropping: `grep -rn "EmailVerificationCode\|email_verification_codes" src test` finds no
 * consumer outside the registration/verification flow — no e-mail-change flow, no admin surface,
 * no seed, no CLI reads it. If one ever appears it wants its own table anyway, for the same
 * reason `password_reset_tokens` is its own table rather than a reuse of this shape.
 *
 * ## `pending_registrations` — the shape and why each piece is there
 * - **The PK is supplied by the APPLICATION**, even though `gen_random_uuid()` is declared as a
 *   belt. The code digest is `HMAC-SHA256(pepper, "pending:" + id + ":" + code)`, so the key must
 *   exist before the INSERT. Binding the row's own id is what makes a code non-transferable
 *   between two candidates for the same address — the property that replaces the old table's
 *   `user_id` binding.
 * - **`email` is deliberately NOT unique, and there is no partial unique index.** That is the
 *   one-slot rule this migration exists to remove: several candidates for one address must be
 *   able to coexist, each carrying its own credentials. The ceiling on how many is enforced by
 *   the identity-axis limiter and a service-side count (`auth.constants.ts`), not by a unique
 *   index, because "at most N" is not something a unique index can express.
 * - **`UQ_pending_registrations_code_hash`** is the one uniqueness left: two rows may never share
 *   a digest. It is redundant with the id binding by construction and kept as a structural belt,
 *   in the same shape `sessions.token_hash` and `password_reset_tokens.token_hash` already use.
 * - **The FK is to `districts`, not to `users`** — a candidate has no user yet. `ON DELETE
 *   CASCADE`, because a candidate pointing at a removed ilçe could never materialize; this is a
 *   different relation from `users.district_id`'s `ON DELETE RESTRICT`, which protects a real
 *   account's location and is untouched.
 * - **The CHECK set mirrors `users`' own constraints** (`1787562000000-InitUsers.ts`,
 *   `user.entity.ts`) token for token for every shared column, including `CHK_..._profile_shape`
 *   with its load-bearing outer `IS TRUE`. Nothing machine-compares the two — the same caveat
 *   `InitUsers` carries. They are not redundant with DTO validation: a candidate that could not
 *   satisfy `users`' constraints would fail at MATERIALIZATION, i.e. after the user typed a
 *   correct code, as a 400 they could never clear.
 * - **No `expires_at > created_at` CHECK**, unlike `sessions`: `created_at` is the DATABASE's
 *   `now()` and `expires_at` is computed in the application, so the constraint would compare two
 *   clocks.
 *
 * ## What this migration does NOT do
 * No existing row is read, updated or backfilled, and no `users` row is touched. The `DROP TABLE`
 * below is the only destructive statement and it is discussed under DATA-LOSS.
 *
 * DATA-LOSS WARNING — `up()`:
 * - `DROP TABLE "email_verification_codes"` discards every verification code in flight. A user
 *   holding a code when this deploys must ask for a new one. It does NOT touch their account.
 * - **The stranded-row case, stated because it is the one that cannot be fixed afterwards:** a
 *   `users` row already sitting at `status = 'UNVERIFIED'` has no candidate and no code table
 *   after this migration, so the registration flow can no longer verify it. Nothing here deletes
 *   or rewrites such a row — writing DML against real accounts is exactly what §5's discipline
 *   forbids — so a deploy preflight must count them first:
 *   `SELECT count(*) FROM users WHERE status = 'UNVERIFIED';`. A non-zero count is an owner
 *   decision (a forward corrective migration or a support path), not something this migration may
 *   assume. It is zero on every environment that exists today: the api has no deploy target yet
 *   (`ENGINEERING.md` §8, hosting undecided) and the endpoints that could create such a row
 *   landed on this same unmerged branch.
 *
 * DATA-LOSS WARNING — `down()`:
 * - `DROP TABLE "pending_registrations"` discards every registration in flight, including the
 *   submitted password hash and profile. Those users must register again from scratch.
 * - The re-created `email_verification_codes` comes back EMPTY, which is correct but means the
 *   revert leaves no verifiable account in either shape.
 * - Once real rows exist, this migration is reverted only with an owner-approved, verified
 *   backup/restore plan; a FORWARD corrective migration is preferred on a live database.
 */
export class InitPendingRegistrations1787652000000 implements MigrationInterface {
  name = 'InitPendingRegistrations1787652000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "pending_registrations" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "email" character varying(254) NOT NULL,
        "password_hash" text NOT NULL,
        "first_name" character varying(100) NOT NULL,
        "last_name" character varying(100) NOT NULL,
        "phone" character varying(13) NOT NULL,
        "account_role" character varying(16) NOT NULL,
        "education_level" character varying(20),
        "grade_level" character varying(16),
        "study_stream" character varying(20),
        "university_name" character varying(200),
        "department_name" character varying(200),
        "district_id" uuid NOT NULL,
        "locale" character varying(2) NOT NULL DEFAULT 'tr',
        "code_hash" bytea NOT NULL,
        "expires_at" timestamptz NOT NULL,
        "attempt_count" smallint NOT NULL DEFAULT 0,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_pending_registrations" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_pending_registrations_code_hash" UNIQUE ("code_hash"),
        CONSTRAINT "FK_pending_registrations_district"
          FOREIGN KEY ("district_id") REFERENCES "districts" ("id") ON DELETE CASCADE,
        CONSTRAINT "CHK_pending_registrations_code_hash_length"
          CHECK (octet_length("code_hash") = 32),
        CONSTRAINT "CHK_pending_registrations_attempts"
          CHECK ("attempt_count" >= 0 AND "attempt_count" <= 5),
        CONSTRAINT "CHK_pending_registrations_locale" CHECK ("locale" IN ('tr', 'en')),
        CONSTRAINT "CHK_pending_registrations_first_name"
          CHECK ("first_name" <> '' AND "first_name" = btrim("first_name")),
        CONSTRAINT "CHK_pending_registrations_last_name"
          CHECK ("last_name" <> '' AND "last_name" = btrim("last_name")),
        CONSTRAINT "CHK_pending_registrations_phone" CHECK ("phone" ~ '^\\+905[0-9]{9}$'),
        CONSTRAINT "CHK_pending_registrations_email_canonical"
          CHECK (
            "email" <> '' AND "email" = btrim("email") AND "email" = lower("email")
          ),
        CONSTRAINT "CHK_pending_registrations_password_hash"
          CHECK ("password_hash" ~ '^\\$argon2id\\$'),
        CONSTRAINT "CHK_pending_registrations_account_role"
          CHECK ("account_role" IN ('STUDENT', 'TEACHER')),
        CONSTRAINT "CHK_pending_registrations_education_level"
          CHECK (
            "education_level" IS NULL OR
            "education_level" IN ('SECONDARY', 'UNDERGRADUATE', 'GRADUATE')
          ),
        CONSTRAINT "CHK_pending_registrations_grade_level"
          CHECK (
            "grade_level" IS NULL OR "grade_level" IN (
              'GRADE_5', 'GRADE_6', 'GRADE_7', 'GRADE_8', 'GRADE_9', 'GRADE_10',
              'GRADE_11', 'GRADE_12', 'MEZUN', 'KPSS', 'DIGER'
            )
          ),
        CONSTRAINT "CHK_pending_registrations_study_stream"
          CHECK (
            "study_stream" IS NULL OR "study_stream" IN (
              'SAYISAL', 'SOZEL', 'ESIT_AGIRLIK', 'TYT', 'DIL', 'LGS', 'MSU',
              'ARA_SINIF', 'KPSS', 'DIGER'
            )
          ),
        CONSTRAINT "CHK_pending_registrations_university_name"
          CHECK (
            "university_name" IS NULL OR (
              "university_name" <> '' AND "university_name" = btrim("university_name")
            )
          ),
        CONSTRAINT "CHK_pending_registrations_department_name"
          CHECK (
            "department_name" IS NULL OR (
              "department_name" <> '' AND "department_name" = btrim("department_name")
            )
          ),
        CONSTRAINT "CHK_pending_registrations_profile_shape"
          CHECK (
            ((
              "account_role" = 'TEACHER' AND
              "education_level" IS NULL AND "grade_level" IS NULL AND "study_stream" IS NULL AND
              "university_name" IS NULL AND "department_name" IS NULL
            ) OR (
              "account_role" = 'STUDENT' AND (
                (
                  "education_level" = 'SECONDARY' AND "grade_level" IS NOT NULL AND
                  "study_stream" IS NOT NULL AND "university_name" IS NULL AND
                  "department_name" IS NULL
                ) OR (
                  "education_level" = 'UNDERGRADUATE' AND "grade_level" IS NULL AND
                  "study_stream" IS NULL AND "university_name" IS NOT NULL AND
                  "department_name" IS NOT NULL
                ) OR (
                  "education_level" = 'GRADUATE' AND "grade_level" IS NULL AND
                  "study_stream" IS NULL AND "university_name" IS NOT NULL
                )
              )
            )) IS TRUE
          )
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_pending_registrations_email" ON "pending_registrations" ("email")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_pending_registrations_expires_at"
        ON "pending_registrations" ("expires_at")
    `);

    // Dropping the table takes its own indexes, constraints and the partial unique index with it
    // (the `InitUsers`/`InitDistricts` precedent). Nothing references it: its only FK pointed AT
    // `users`, never the other way round.
    await queryRunner.query(`DROP TABLE "email_verification_codes"`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Re-created byte for byte from `1787565600000-InitAuthSessions.ts`, including the
    // hand-authored partial unique index that migration's own docblock explains.
    await queryRunner.query(`
      CREATE TABLE "email_verification_codes" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "code_hash" bytea NOT NULL,
        "expires_at" timestamptz NOT NULL,
        "attempt_count" smallint NOT NULL DEFAULT 0,
        "consumed_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_email_verification_codes" PRIMARY KEY ("id"),
        CONSTRAINT "FK_email_verification_codes_user"
          FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE,
        CONSTRAINT "CHK_email_verification_codes_hash_length"
          CHECK (octet_length("code_hash") = 32),
        CONSTRAINT "CHK_email_verification_codes_attempts"
          CHECK ("attempt_count" >= 0 AND "attempt_count" <= 5)
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_email_verification_codes_active"
        ON "email_verification_codes" ("user_id")
        WHERE "consumed_at" IS NULL
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_email_verification_codes_expires_at"
        ON "email_verification_codes" ("expires_at")
    `);

    await queryRunner.query(`DROP TABLE "pending_registrations"`);
  }
}
