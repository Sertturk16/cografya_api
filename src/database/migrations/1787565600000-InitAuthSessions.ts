import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the four UYELIK-02 PR-1 auth-primitives tables and adds `users.token_version`.
 *
 * Generated from `Session`, `EmailVerificationCode`, `PasswordResetToken`, `AuthRateLimit` and
 * `User.tokenVersion` against a disposable Postgres 16 database (after all 22 prior
 * migrations), then hand-reviewed. TypeORM's raw diff proposed a large amount of UNRELATED
 * drift — it wanted to drop and re-add every existing hand-named FK/CHECK/index on
 * `air_quality_province_series`, `book_videos`, `book_video_questions`, `books`,
 * `districts`, `earthquake_events`, `marine_ecmwf_point_series`, `provinces`, `countries` and
 * `youtube_video_snapshots` under TypeORM's own auto-generated names, plus one unrelated
 * `marine_ecmwf_cycles.bytes_downloaded` default change — the `InitUsers` migration's own
 * precedent for exactly this phenomenon. All of that was discarded; only the auth-primitives
 * DDL below is new.
 *
 * **`gen_random_uuid()`, not TypeORM's raw `uuid_generate_v4()` output** — hand-corrected on
 * every new PK default, the `InitCountry`/`InitProvince`/`InitMarinePoints` precedent
 * (`gen_random_uuid()` is built into Postgres 13+; `uuid_generate_v4()` needs the `uuid-ossp`
 * extension, which nothing in this repo enables).
 *
 * **Every FK below is HAND-AUTHORED, not TypeORM-generated.** None of the four entities
 * declares a `@ManyToOne` relation — house pattern (`District.provinceId`,
 * `BookVideoQuestion.bookVideoId`): the FK lives in the migration, decorators are declared on
 * the entity only so the access path reads beside the column. Because there is no relation
 * decorator, TypeORM's raw diff proposed NONE of these four foreign keys; they are added here
 * by hand to close that gap, in the same shape as `FK_users_district`/`FK_districts_province`.
 *
 * **`UQ_email_verification_codes_active` is a hand-authored PARTIAL unique index, not
 * TypeORM-generated.** `@Unique`/`@Index` on the entity cannot express a `WHERE` clause in a
 * form the raw diff picks up (`email-verification-code.entity.ts`'s own docblock records
 * this), so it does not appear in either direction of a future `migration:generate` diff —
 * this migration is its only home. It enforces "at most one ACTIVE code per user" as a
 * database invariant, not a service-layer courtesy.
 *
 * ## What this migration does NOT do
 * No existing row is read, updated, deleted or backfilled. `users` gains exactly one column
 * (`token_version`, `NOT NULL DEFAULT 0`) and one CHECK; the four new tables start empty.
 *
 * DATA-LOSS WARNING — `down()`:
 * - `DROP TABLE "sessions"` forces every current user out and permanently deletes the
 *   revocation/rotation forensic trail — reuse-detection history cannot be recovered.
 * - `DROP COLUMN "token_version"` is a SECURITY REGRESSION, not just a data loss: after
 *   revert, an access token minted before the revert becomes re-acceptable again (no `sv`
 *   comparison exists to reject it), because the JWT itself outlives the column that was
 *   meant to invalidate it.
 * - `DROP TABLE "password_reset_tokens"` permanently invalidates every reset link in flight.
 * - Once real rows exist, this migration is reverted only with an owner-approved, verified
 *   backup/restore plan; a FORWARD corrective migration is preferred on a live database.
 */
export class InitAuthSessions1787565600000 implements MigrationInterface {
  name = 'InitAuthSessions1787565600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "sessions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "family_id" uuid NOT NULL,
        "token_hash" bytea NOT NULL,
        "issued_at" timestamptz NOT NULL DEFAULT now(),
        "expires_at" timestamptz NOT NULL,
        "revoked_at" timestamptz,
        "revoked_reason" character varying(24),
        "rotated_from_id" uuid,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_sessions" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_sessions_token_hash" UNIQUE ("token_hash"),
        CONSTRAINT "FK_sessions_user"
          FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_sessions_rotated_from"
          FOREIGN KEY ("rotated_from_id") REFERENCES "sessions" ("id") ON DELETE SET NULL,
        CONSTRAINT "CHK_sessions_token_hash_length" CHECK (octet_length("token_hash") = 32),
        CONSTRAINT "CHK_sessions_revocation"
          CHECK (
            ("revoked_at" IS NULL AND "revoked_reason" IS NULL) OR
            ("revoked_at" IS NOT NULL AND "revoked_reason" IS NOT NULL)
          ),
        CONSTRAINT "CHK_sessions_revoked_reason"
          CHECK (
            "revoked_reason" IS NULL OR "revoked_reason" IN (
              'ROTATED', 'LOGOUT', 'REUSE_DETECTED', 'PASSWORD_RESET', 'EXPIRED',
              'ACCOUNT_INACTIVE'
            )
          ),
        CONSTRAINT "CHK_sessions_expiry" CHECK ("expires_at" > "issued_at"),
        CONSTRAINT "CHK_sessions_not_self_rotated"
          CHECK ("rotated_from_id" IS NULL OR "rotated_from_id" <> "id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_sessions_family_id" ON "sessions" ("family_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_sessions_user_id" ON "sessions" ("user_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_sessions_expires_at" ON "sessions" ("expires_at")`);

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
    // Partial unique index — hand-authored, see docblock. Enforces "at most one ACTIVE code
    // per user" as a schema invariant: resend replacing the previous code is a schema
    // guarantee, not a service-layer courtesy.
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_email_verification_codes_active"
        ON "email_verification_codes" ("user_id")
        WHERE "consumed_at" IS NULL
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_email_verification_codes_expires_at"
        ON "email_verification_codes" ("expires_at")
    `);

    await queryRunner.query(`
      CREATE TABLE "password_reset_tokens" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "token_hash" bytea NOT NULL,
        "expires_at" timestamptz NOT NULL,
        "consumed_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_password_reset_tokens" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_password_reset_tokens_token_hash" UNIQUE ("token_hash"),
        CONSTRAINT "FK_password_reset_tokens_user"
          FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE,
        CONSTRAINT "CHK_password_reset_tokens_hash_length"
          CHECK (octet_length("token_hash") = 32)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_password_reset_tokens_user_id" ON "password_reset_tokens" ("user_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_password_reset_tokens_expires_at"
        ON "password_reset_tokens" ("expires_at")
    `);

    await queryRunner.query(`
      CREATE TABLE "auth_rate_limits" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "scope" character varying(32) NOT NULL,
        "subject_hash" bytea NOT NULL,
        "window_start" timestamptz NOT NULL,
        "attempt_count" integer NOT NULL DEFAULT 0,
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_auth_rate_limits" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_auth_rate_limits_bucket"
          UNIQUE ("scope", "subject_hash", "window_start"),
        CONSTRAINT "CHK_auth_rate_limits_subject_length"
          CHECK (octet_length("subject_hash") = 32),
        CONSTRAINT "CHK_auth_rate_limits_count" CHECK ("attempt_count" >= 0),
        CONSTRAINT "CHK_auth_rate_limits_scope"
          CHECK (
            "scope" IN (
              'REGISTER_EMAIL', 'VERIFY_RESEND_COOLDOWN', 'VERIFY_RESEND_DAILY', 'LOGIN_EMAIL',
              'PASSWORD_RESET_EMAIL'
            )
          )
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_auth_rate_limits_window_start" ON "auth_rate_limits" ("window_start")
    `);

    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN "token_version" integer NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD CONSTRAINT "CHK_users_token_version" CHECK ("token_version" >= 0)`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "CHK_users_token_version"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "token_version"`);
    // Dropping each table takes its own indexes/constraints with it (the `InitUsers`/
    // `InitDistricts` precedent). None of the four is referenced by anything outside this
    // group except `sessions.rotated_from_id`, which self-references — drop order among the
    // four is therefore unconstrained.
    await queryRunner.query(`DROP TABLE "auth_rate_limits"`);
    await queryRunner.query(`DROP TABLE "password_reset_tokens"`);
    await queryRunner.query(`DROP TABLE "email_verification_codes"`);
    await queryRunner.query(`DROP TABLE "sessions"`);
  }
}
