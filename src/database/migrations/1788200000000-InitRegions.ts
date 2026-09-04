import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the `regions` table for the 7 geographic regions of Türkiye.
 * Hand-authored and hand-reviewed per repo discipline (ENGINEERING.md §5).
 * Reuses the existing `geographic_region` enum type created in `InitProvince`.
 */
export class InitRegions1788200000000 implements MigrationInterface {
  name = 'InitRegions1788200000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "regions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "region" "geographic_region" NOT NULL,
        "slug" character varying(50) NOT NULL,
        "name_tr" character varying(100) NOT NULL,
        "heading_name" character varying(100) NOT NULL,
        "meta_title" character varying(255) NOT NULL,
        "meta_description" text NOT NULL,
        "h1" character varying(100) NOT NULL,
        "intro_tr" text NOT NULL,
        "highest_point_name" character varying(100),
        "highest_point_elevation_m" integer,
        "highest_point_province" character varying(100),
        "coastal_seas" text[] NOT NULL DEFAULT '{}',
        "neighbor_regions" text[] NOT NULL DEFAULT '{}',
        "neighbor_countries" text[] NOT NULL DEFAULT '{}',
        "subregions" text[] NOT NULL DEFAULT '{}',
        "gdp_share_approx_percent" numeric(5,2),
        "location_and_borders_tr" text NOT NULL,
        "landforms_tr" text NOT NULL,
        "climate_and_vegetation_tr" text NOT NULL,
        "hydrography_tr" text NOT NULL,
        "settlement_and_population_tr" text NOT NULL,
        "economy_tr" text NOT NULL,
        "subregions_tr" text NOT NULL,
        "disaster_and_earthquake_tr" text NOT NULL,
        "comparison_tr" text NOT NULL,
        "faqs" jsonb NOT NULL DEFAULT '[]',
        "sources_note_tr" text NOT NULL,
        "footnotes" text[] NOT NULL DEFAULT '{}',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_regions" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_regions_region" UNIQUE ("region"),
        CONSTRAINT "UQ_regions_slug" UNIQUE ("slug")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_regions_slug" ON "regions" ("slug")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_regions_slug"`);
    await queryRunner.query(`DROP TABLE "regions"`);
  }
}
