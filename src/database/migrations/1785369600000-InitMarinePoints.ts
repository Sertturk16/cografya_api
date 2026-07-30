import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the `marine_sea_basin` enum type and the `marine_points` table (SPEC-ADDENDUM §4.2).
 *
 * Hand-authored raw SQL and hand-reviewed, like every sibling migration (repo playbook §5):
 * the exact DDL is reviewable at a glance and maps 1:1 to `MarinePoint`. This repo never uses
 * `synchronize`. `gen_random_uuid()` is built into Postgres 13+ (our target is 16), so no
 * extension is needed — same as `provinces` and `countries`.
 *
 * ## The constraint that carries the design
 * `province_plate_code` is INDEXED but deliberately NOT UNIQUE. Three provinces front two
 * different seas — İstanbul (Black Sea + Marmara), Çanakkale (Aegean + Marmara), Balıkesir
 * (Aegean + Marmara) — and their two points legitimately report different numbers on the same
 * day. A unique key on the plate code alone would make those provinces unrepresentable.
 *
 * `UNIQUE (province_plate_code, sea_basin)` replaces it: at most ONE point per province per
 * basin. Dropping uniqueness altogether was rejected — a point accidentally seeded twice
 * would then simply appear twice on the hub and in the overview's upstream call graph, i.e.
 * fail silently, which is exactly what this repo refuses.
 *
 * ## Why the columns are NOT NULL
 * Unlike `provinces` (where research-derived fields stay nullable until fact-checked), every
 * column here is structural: a marine point with no coordinate, no basin or no slug cannot be
 * queried, routed or displayed at all. There is no partially-known marine point — the
 * two-phase `probe` gate is what decides whether a row may exist in the first place.
 *
 * SCHEMA ONLY: no rows are inserted here. Points land via
 * `pnpm db:import:marine-points --phase=load`, from the committed, reviewable probe artifact.
 *
 * `down()` drops the table and then the enum type — exactly reversible.
 */
export class InitMarinePoints1785369600000 implements MigrationInterface {
  name = 'InitMarinePoints1785369600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "marine_sea_basin" AS ENUM (
        'aegean', 'mediterranean', 'marmara', 'black_sea'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "marine_points" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "slug_tr" character varying(120) NOT NULL,
        "slug_en" character varying(120) NOT NULL,
        "name_tr" character varying(120) NOT NULL,
        "name_en" character varying(120) NOT NULL,
        "coast_label_tr" character varying(80) NOT NULL,
        "coast_label_en" character varying(80) NOT NULL,
        "province_plate_code" character varying(2) NOT NULL,
        "sea_basin" "marine_sea_basin" NOT NULL,
        "latitude" numeric(9,6) NOT NULL,
        "longitude" numeric(9,6) NOT NULL,
        "display_order" integer NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_marine_points" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_marine_points_slug_tr" UNIQUE ("slug_tr"),
        CONSTRAINT "UQ_marine_points_slug_en" UNIQUE ("slug_en"),
        CONSTRAINT "UQ_marine_points_province_basin" UNIQUE ("province_plate_code", "sea_basin")
      )
    `);

    // Lookup indexes. The composite UNIQUE above already backs a `province_plate_code` prefix
    // scan, but it is kept as its own index on purpose: the province-conditions endpoint
    // (SPEC-ADDENDUM §4.3) filters on the plate code alone, and relying on a unique
    // constraint's implicit index for a query path makes that path silently dependent on the
    // constraint's column ORDER surviving a future edit.
    await queryRunner.query(
      `CREATE INDEX "IDX_marine_points_province_plate_code" ON "marine_points" ("province_plate_code")`,
    );

    // NO index on `sea_basin`, deliberately. It is a 4-value enum on a 30-row table and no
    // endpoint in the frozen contract filters by it — Postgres would seq-scan regardless. An
    // index with no consumer is the speculative machinery this repo's YAGNI default rejects; the
    // plate-code index above earns its place because the M4 province endpoint filters on it.
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // DROP TABLE also removes its indexes and constraints; the enum type must go separately.
    await queryRunner.query(`DROP TABLE "marine_points"`);
    await queryRunner.query(`DROP TYPE "marine_sea_basin"`);
  }
}
