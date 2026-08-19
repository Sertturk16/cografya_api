import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds `provinces.pm25_annual` — the long-term annual-mean PM2.5 series (ACAG SatPM2.5 V6.GL.03),
 * read from the ~1 km cell containing each province centre (→ DEC 2026-08-19d md.1,
 * DEC 2026-08-19f).
 *
 * ## Hand-authored after review, and the review discarded most of the generator's output
 * `pnpm migration:generate` produced 33 statements. Exactly ONE of them belongs to this change;
 * the rest were TypeORM proposing to DROP and recreate every hand-named foreign key and CHECK
 * constraint in the schema (`FK_air_quality_province_series_run`,
 * `CHK_earthquake_events_magnitude`, `CHK_books_isbn13`, …) under its own hash-based names, plus
 * renaming `IDX_provinces_region` and `IDX_countries_continent` and dropping a default on
 * `marine_ecmwf_cycles.bytes_downloaded`.
 *
 * That churn is not this PR's business and is actively dangerous: it would rewrite constraints
 * whose explicit names other migrations and their `down()` paths refer to by name, for no schema
 * benefit. This is precisely the case the "never commit an unread generated migration" rule
 * (ENGINEERING §5) exists to catch, so the file was reduced by hand to the single column.
 *
 * ## Why a nullable column with no default and no index
 * - **Nullable**: the entity's standing rule — every research-derived field is nullable even when
 *   the importer fills all 81 rows. NULL is also the kill switch (`UPDATE provinces SET
 *   pm25_annual = NULL` removes the section from every page in one statement).
 * - **No default**: `NULL` and `'{}'::jsonb` would be two ways of saying "nothing to publish", and
 *   the read path would have to distinguish them forever.
 * - **No index**: nothing queries into this document. It is read only as part of a province row
 *   that is already being fetched by slug or listed in full.
 * - **`jsonb`, not a child table**: writing here trips `provinces.updated_at`
 *   (`@UpdateDateColumn`), which is what the page's `dateModified` and the sitemap's `lastmod`
 *   are built from. A child table would leave both silently stale after every annual refresh —
 *   the same reasoning that put `climate_normals` on this row.
 *
 * `ADD COLUMN … jsonb` with no default and no NOT NULL is a catalogue-only change on Postgres 16:
 * no table rewrite, no lock beyond the brief ACCESS EXCLUSIVE needed to update the catalogue.
 */
export class AddProvincePm25Annual1787149250651 implements MigrationInterface {
  name = 'AddProvincePm25Annual1787149250651';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "provinces" ADD "pm25_annual" jsonb`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "provinces" DROP COLUMN "pm25_annual"`);
  }
}
