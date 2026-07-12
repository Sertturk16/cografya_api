import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds `countries.hydrography_note_tr` — the hidrografya (nehir/göl/deniz) prose note,
 * mirroring the province `hydrography_note_tr` column (the country model's mirror carries
 * one; this closes the schema gap flagged as a fast-follow → DEC 2026-07-13). The country
 * model deliberately has NO `hydrography_features` jsonb equivalent — only the note.
 *
 * Hand-authored (not generated) and hand-reviewed, consistent with the sibling migrations
 * and the repo's migration discipline (CLAUDE §5). Kept in raw SQL so the exact DDL is
 * reviewable at a glance and maps 1:1 to the entity's new `hydrographyNoteTr` column
 * (`synchronize` is never used).
 *
 * `nullable` (no NOT NULL, no default): like every research-derived field, the note is
 * absent until fact-checked content fills it — the schema never forces a placeholder (an
 * unverified fact stays absent, never invented). This is SCHEMA/MECHANISM only; no
 * per-country values are populated by this change (the pilot prose lands in a follow-up
 * data PR).
 */
export class AddCountryHydrographyNote1784102400000 implements MigrationInterface {
  name = 'AddCountryHydrographyNote1784102400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "countries" ADD COLUMN "hydrography_note_tr" text`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "countries" DROP COLUMN "hydrography_note_tr"`);
  }
}
