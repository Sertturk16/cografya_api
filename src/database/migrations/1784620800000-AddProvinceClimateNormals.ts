import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the two climate columns to `provinces`:
 *
 *   - `climate_normals` (`jsonb`)      — the MGM `k=A` monthly series + source + measurement
 *                                        period + all-time records (`ClimateNormals`).
 *   - `climate_narrative_tr` (`text`)  — NOVA's per-province climate interpretation.
 *
 * Hand-authored raw SQL (not generated), consistent with the sibling migrations and the
 * repo's migration discipline (CLAUDE §5): the exact DDL is reviewable at a glance and maps
 * 1:1 to the entity's two new columns.
 *
 * **Why one migration for two columns.** `climate_narrative_tr` will stay NULL for months —
 * the ten content waves that fill it land much later. It ships now anyway because the schema
 * is free and the alternative is a second migration for a single nullable text column
 * (PLAN.md §1).
 *
 * **Why `jsonb` and not a child table** — the full argument lives on the entity column; the
 * short form is that a child table would leave `provinces.updated_at` (and therefore the
 * page's `dateModified` and the sitemap `lastmod`) silently stale on every climate refresh.
 *
 * **No enum type.** The `source` discriminator is a string literal inside the JSON document,
 * not a Postgres enum, so this migration introduces no type to later ALTER or DROP
 * (ERA5/Copernicus source-swapping was cancelled — → DEC 2026-07-18h).
 *
 * SCHEMA/MECHANISM ONLY: no province rows are populated here. The data lands in a separate
 * import PR (A1b) from a committed, reviewable JSON artifact.
 *
 * `down()` drops BOTH columns — the migration is exactly reversible.
 */
export class AddProvinceClimateNormals1784620800000 implements MigrationInterface {
  name = 'AddProvinceClimateNormals1784620800000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "provinces" ADD COLUMN "climate_normals" jsonb`);
    await queryRunner.query(`ALTER TABLE "provinces" ADD COLUMN "climate_narrative_tr" text`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "provinces" DROP COLUMN "climate_narrative_tr"`);
    await queryRunner.query(`ALTER TABLE "provinces" DROP COLUMN "climate_normals"`);
  }
}
