import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds `provinces.climate_note_tr` — the MGM methodological warning note that,
 * per the il-level data dictionary (§2.1), MUST travel with the Köppen value.
 *
 * Hand-authored (not generated) and hand-reviewed, consistent with
 * `InitProvince` and the repo's migration discipline (ENGINEERING.md §5). Kept in raw
 * SQL so the exact DDL is reviewable at a glance and maps 1:1 to the entity's new
 * `climateNoteTr` column (`synchronize` is never used).
 *
 * `nullable` (no NOT NULL): like every research-derived field, the note is absent
 * until fact-checked content fills it — the schema never forces a placeholder.
 */
export class AddProvinceClimateNote1783513986800 implements MigrationInterface {
  name = 'AddProvinceClimateNote1783513986800';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "provinces" ADD COLUMN "climate_note_tr" text`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "provinces" DROP COLUMN "climate_note_tr"`);
  }
}
