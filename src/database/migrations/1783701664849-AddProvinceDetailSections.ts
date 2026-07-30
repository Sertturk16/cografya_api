import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the nullable columns for the four new il-detay-sayfası sections + the
 * written intro (SPEC "interactive-map-hover" §5.1):
 *   • intro_tr            — written opening sentence (replaces the templated copula)
 *   • hydrography_note_tr — hidrografya prose
 *   • hydrography_features — jsonb `{ name, type }[]` (baraj/nehir/göl list)
 *   • urbanization_rate   — TÜİK şehirleşme oranı (%)
 *   • net_migration_rate  — TÜİK net göç hızı (‰, signed)
 *   • settlement_note_tr  — nüfus/yerleşme prose
 *   • economy_indicator   — jsonb single `{ label, value, year, source }` stat
 *
 * Hand-authored (not generated) and hand-reviewed, consistent with the sibling
 * migrations and the repo's migration discipline (ENGINEERING.md §5): raw SQL so the
 * exact DDL is reviewable at a glance and maps 1:1 to the entity's new columns
 * (`synchronize` is never used).
 *
 * Every column is `nullable` (no NOT NULL, no default): like every research-derived
 * field, each is absent until fact-checked content fills it — the schema never
 * forces a placeholder (an unverified fact stays absent, never invented). This is
 * SCHEMA/MECHANISM only; no per-province values are populated by this change.
 *
 * `hydrography_features` and `economy_indicator` are `jsonb` (not new tables):
 * small, always-fetched-with-the-province, never-queried authored payloads.
 */
export class AddProvinceDetailSections1783701664849 implements MigrationInterface {
  name = 'AddProvinceDetailSections1783701664849';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "provinces"
        ADD COLUMN "intro_tr" text,
        ADD COLUMN "hydrography_note_tr" text,
        ADD COLUMN "hydrography_features" jsonb,
        ADD COLUMN "urbanization_rate" numeric(5,2),
        ADD COLUMN "net_migration_rate" numeric(5,2),
        ADD COLUMN "settlement_note_tr" text,
        ADD COLUMN "economy_indicator" jsonb
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "provinces"
        DROP COLUMN "economy_indicator",
        DROP COLUMN "settlement_note_tr",
        DROP COLUMN "net_migration_rate",
        DROP COLUMN "urbanization_rate",
        DROP COLUMN "hydrography_features",
        DROP COLUMN "hydrography_note_tr",
        DROP COLUMN "intro_tr"
    `);
  }
}
