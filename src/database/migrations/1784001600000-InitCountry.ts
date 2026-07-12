import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the `continent` enum type and the `countries` table (Faz-2 dünya haritası).
 *
 * Hand-authored (not generated) and hand-reviewed per the repo's migration discipline
 * (CLAUDE §5). Kept in raw SQL so the exact DDL is reviewable at a glance and matches
 * `Country` column-for-column (this repo never uses `synchronize`).
 *
 * `gen_random_uuid()` is built into Postgres 13+ (our target is 16), so no `uuid-ossp`
 * extension is required for the primary-key default — same as the provinces table.
 *
 * NOTE — nullable UNIQUE columns: Postgres treats NULLs as distinct in a UNIQUE
 * constraint, so `iso_code_alpha3` may be NULL on many rows without collision while a
 * present value stays unique. That matches the entity's "nullable secondary identifier"
 * intent.
 */
export class InitCountry1784001600000 implements MigrationInterface {
  name = 'InitCountry1784001600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "continent" AS ENUM (
        'ASYA', 'AVRUPA', 'AFRIKA', 'KUZEY_AMERIKA', 'GUNEY_AMERIKA', 'OKYANUSYA'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "countries" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "iso_code" character varying(2) NOT NULL,
        "iso_code_alpha3" character varying(3),
        "name_tr" character varying(100) NOT NULL,
        "name_en" character varying(100) NOT NULL,
        "slug_tr" character varying(120) NOT NULL,
        "slug_en" character varying(120) NOT NULL,
        "continent" "continent" NOT NULL,
        "un_subregion_tr" character varying(80),
        "population" integer,
        "population_year" smallint,
        "area_km2" integer,
        "capital_name_tr" character varying(120),
        "capital_name_en" character varying(120),
        "capital_latitude" numeric(9,6),
        "capital_longitude" numeric(9,6),
        "neighbor_iso_codes" character varying(2)[] NOT NULL DEFAULT '{}',
        "official_languages_tr" text[],
        "currency_name_tr" character varying(80),
        "currency_code" character varying(3),
        "government_form_tr" character varying(120),
        "independence_note_tr" text,
        "intro_tr" text,
        "landform_note_tr" text,
        "climate_note_tr" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_countries" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_countries_iso_code" UNIQUE ("iso_code"),
        CONSTRAINT "UQ_countries_iso_code_alpha3" UNIQUE ("iso_code_alpha3"),
        CONSTRAINT "UQ_countries_slug_tr" UNIQUE ("slug_tr"),
        CONSTRAINT "UQ_countries_slug_en" UNIQUE ("slug_en")
      )
    `);

    await queryRunner.query(`CREATE INDEX "IDX_countries_continent" ON "countries" ("continent")`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // DROP TABLE also removes its indexes and constraints.
    await queryRunner.query(`DROP TABLE "countries"`);
    await queryRunner.query(`DROP TYPE "continent"`);
  }
}
