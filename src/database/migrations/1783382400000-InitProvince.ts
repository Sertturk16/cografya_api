import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Initial schema — the `geographic_region` enum type and the `provinces` table.
 *
 * Hand-authored (not generated) and hand-reviewed per the repo's migration
 * discipline. Kept in raw SQL so the exact DDL is reviewable at a glance and
 * matches `Province` column-for-column (this repo never uses `synchronize`).
 *
 * `gen_random_uuid()` is built into Postgres 13+ (our target is 16), so no
 * `uuid-ossp` extension is required for the primary-key default.
 */
export class InitProvince1783382400000 implements MigrationInterface {
  name = 'InitProvince1783382400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "geographic_region" AS ENUM (
        'MARMARA', 'EGE', 'AKDENIZ', 'IC_ANADOLU', 'KARADENIZ', 'DOGU_ANADOLU', 'GUNEYDOGU_ANADOLU'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "provinces" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "plate_code" character varying(2) NOT NULL,
        "name_tr" character varying(100) NOT NULL,
        "slug_tr" character varying(120) NOT NULL,
        "slug_en" character varying(120) NOT NULL,
        "region" "geographic_region" NOT NULL,
        "population" integer,
        "population_year" smallint,
        "area_km2" integer,
        "district_count" smallint,
        "elevation_m" integer,
        "latitude" numeric(9,6),
        "longitude" numeric(9,6),
        "neighbor_plate_codes" character varying(2)[] NOT NULL DEFAULT '{}',
        "climate_koppen" character varying(8),
        "climate_class_tr" character varying(80),
        "landform_note_tr" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_provinces" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_provinces_plate_code" UNIQUE ("plate_code"),
        CONSTRAINT "UQ_provinces_slug_tr" UNIQUE ("slug_tr"),
        CONSTRAINT "UQ_provinces_slug_en" UNIQUE ("slug_en")
      )
    `);

    await queryRunner.query(`CREATE INDEX "IDX_provinces_region" ON "provinces" ("region")`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // DROP TABLE also removes its indexes and constraints.
    await queryRunner.query(`DROP TABLE "provinces"`);
    await queryRunner.query(`DROP TYPE "geographic_region"`);
  }
}
