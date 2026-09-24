import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * T-101: separate, optional consent for commercial electronic messages (KVKK md. 5/1 açık rıza,
 * 6563 sayılı Kanun ön onay).
 *
 * One nullable `timestamptz` on BOTH tables that carry a registration: `pending_registrations`
 * holds the choice made on the form until the e-mail code is confirmed, then
 * `EmailVerificationService.verify` copies it onto the new `users` row. The value is the instant
 * consent was given (evidence of WHEN), `NULL` means no consent or consent withdrawn. A boolean
 * would lose the instant, and the instant is what an İYS audit asks for.
 *
 * ## `up()` is additive only
 * Two nullable columns, no default, no CHECK: every existing row reads as "no consent", which is
 * the correct reading for accounts created before the checkbox existed.
 *
 * ## `down()` drops both columns
 * It discards recorded consents. That is acceptable for a local rollback and the only inverse
 * there is; production never reverts (`../CLAUDE.md`).
 */
export class AddMarketingConsent1790294400000 implements MigrationInterface {
  name = 'AddMarketingConsent1790294400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD "marketing_consent_at" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "pending_registrations" ADD "marketing_consent_at" TIMESTAMP WITH TIME ZONE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "pending_registrations" DROP COLUMN "marketing_consent_at"`,
    );
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "marketing_consent_at"`);
  }
}
