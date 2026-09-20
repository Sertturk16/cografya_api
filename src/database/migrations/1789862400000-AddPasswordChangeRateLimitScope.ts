import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * T-061: `POST /api/auth/password/change` needs an IDENTITY-axis budget, so
 * `CHK_auth_rate_limits_scope` — a closed, DB-enforced set — gains a sixth member,
 * `PASSWORD_CHANGE_USER`.
 *
 * ## Why the identity axis and not the route throttle alone
 * The route already carries `@Throttle` (`AUTH_ROUTE_THROTTLES.passwordChange`), which is the
 * IP axis. That axis bounds one caller, not one account: a change request accepts a password
 * GUESS, and an attacker holding a stolen access token but not the password can spread guesses
 * across addresses until the IP ceiling stops being a ceiling at all. The account-keyed budget
 * is what actually bounds "how many wrong current-password guesses may this ACCOUNT absorb".
 *
 * ## Why a new scope rather than reusing `LOGIN_EMAIL`
 * `LOGIN_EMAIL` is keyed by e-mail and spent by the login route. Spending it here would let a
 * failed password-change attempt eat the member's own ability to log in — the self-DoS shape
 * `VAL136-I1` already had to be fixed once on the register/resend pair. The two axes stay
 * structurally separate: nothing on this path touches a login counter.
 *
 * The subject is the USER ID, not an address. `AuthRateLimitService` HMACs whatever subject it
 * is handed before storing it, so the column still holds no identifier in the clear; the id is
 * the right key because the route is authenticated and the account, not the mailbox, is what
 * is being protected.
 *
 * ## `up()` is additive only, provably
 * Widening an `IN (…)` CHECK admits a strict superset of the values it admitted before, so it
 * validates trivially against every existing row: no row can carry `PASSWORD_CHANGE_USER`
 * today, because nothing writes it until the code in this same change ships. No column is
 * added, dropped, read or reinterpreted.
 *
 * ## `down()` is the exact inverse, and can fail on purpose
 * It restores the five-member CHECK. If rows carrying the new scope exist when it runs,
 * Postgres refuses to validate the narrowed constraint and the migration fails loudly. That is
 * the correct outcome: silently deleting a live rate-limit bucket to make a rollback succeed
 * would hand an attacker a fresh budget by reverting a migration.
 */
export class AddPasswordChangeRateLimitScope1789862400000 implements MigrationInterface {
  name = 'AddPasswordChangeRateLimitScope1789862400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "auth_rate_limits" DROP CONSTRAINT "CHK_auth_rate_limits_scope"
    `);
    await queryRunner.query(`
      ALTER TABLE "auth_rate_limits" ADD CONSTRAINT "CHK_auth_rate_limits_scope"
        CHECK (
          "scope" IN (
            'REGISTER_EMAIL', 'VERIFY_RESEND_COOLDOWN', 'VERIFY_RESEND_DAILY', 'LOGIN_EMAIL',
            'PASSWORD_RESET_EMAIL', 'PASSWORD_CHANGE_USER'
          )
        )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "auth_rate_limits" DROP CONSTRAINT "CHK_auth_rate_limits_scope"
    `);
    await queryRunner.query(`
      ALTER TABLE "auth_rate_limits" ADD CONSTRAINT "CHK_auth_rate_limits_scope"
        CHECK (
          "scope" IN (
            'REGISTER_EMAIL', 'VERIFY_RESEND_COOLDOWN', 'VERIFY_RESEND_DAILY', 'LOGIN_EMAIL',
            'PASSWORD_RESET_EMAIL'
          )
        )
    `);
  }
}
