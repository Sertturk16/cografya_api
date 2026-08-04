import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds three narrative prose columns to `countries`: `settlement_note_tr`, `economy_note_tr`
 * and `governance_note_tr` (dalga-1 territory wave, SPEC §2.3). Schema/mechanism only — the
 * fact-checked prose lands in a separate content PR, transcribed by tool.
 *
 * Hand-authored (not generated) and hand-reviewed per the repo's migration discipline
 * (ENGINEERING §5); raw SQL, `synchronize` is never used.
 *
 * All three are `text NULL`, matching the existing narrative columns exactly: an unauthored
 * note is ABSENT, never an empty-string placeholder. Each has a real dalga-1 consumer —
 * settlement (GL, AQ), economy (GL), governance (GL, AQ) — so none is speculative; the
 * province model already carries settlement and economy notes, which makes two of the three
 * platform-internal parity rather than a new idea.
 *
 * Kept as its own migration, separate from the entity-type/label change, so each is
 * single-purpose and independently reviewable (the PR #25 schema/data precedent).
 */
export class AddCountryDetailSections1785952800000 implements MigrationInterface {
  name = 'AddCountryDetailSections1785952800000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "countries" ADD COLUMN "settlement_note_tr" text`);
    await queryRunner.query(`ALTER TABLE "countries" ADD COLUMN "economy_note_tr" text`);
    await queryRunner.query(`ALTER TABLE "countries" ADD COLUMN "governance_note_tr" text`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "countries" DROP COLUMN "governance_note_tr"`);
    await queryRunner.query(`ALTER TABLE "countries" DROP COLUMN "economy_note_tr"`);
    await queryRunner.query(`ALTER TABLE "countries" DROP COLUMN "settlement_note_tr"`);
  }
}
