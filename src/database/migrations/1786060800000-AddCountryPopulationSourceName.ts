import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds `countries.population_source_name_tr` + `countries.population_source_name_en` —
 * the nüfus kaynağı (population source) credit line, so `/dunya/{slug}` stops crediting
 * the World Bank for the five rows it never published (GL, CY, QN, TW, TR — kaynak-satırı
 * micro, 2026-08-06, AK-8/AK-9). Nullable, no default: absent means "corpus default"
 * (resolved in the service, `src/country/population-source.ts`), never a stored
 * placeholder — mirrors the `status_label_tr/en` precedent (`AddCountryEntityType`).
 *
 * SCHEMA ONLY — no rows are written here. The five values land through
 * `db:seed:world` (`GL`/`CY`/`QN`/`TW`/`TR` seed files), which is where their invariants
 * (guard rule 10) and their provenance citations live.
 *
 * **Hand-authored SQL after a generator run, and the difference is the reason the rule
 * exists** (same discipline as `AddProvinceClimateCurriculum`). `pnpm migration:generate`
 * against an up-to-date dev schema also proposed dropping/recreating
 * `IDX_provinces_region` and `IDX_countries_continent` under hash names, dropping/
 * recreating four foreign keys under hash names, and dropping
 * `marine_ecmwf_cycles.bytes_downloaded`'s default — all pre-existing generator drift
 * from the sibling migrations' EXPLICIT constraint names, none of it anything this change
 * asked for. Only the two `ADD COLUMN` statements below are kept.
 *
 * Timestamp is deliberately LARGER than `AddProvinceClimateCurriculum1785974400000` (#97's
 * migration): #97 lands first in the merge order, so its migration must apply first in
 * both production and CI.
 *
 * `down()` drops both columns — SCHEMA-reversible only (PR #98 review, CR98-M8). Any values
 * `db:seed:world` has since written into them are discarded, not preserved; a `down` + `up`
 * round-trip restores the empty columns, not the five seeded credit-line values. Re-running
 * `db:seed:world` after `up()` restores the data.
 */
export class AddCountryPopulationSourceName1786060800000 implements MigrationInterface {
  name = 'AddCountryPopulationSourceName1786060800000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "countries" ADD COLUMN "population_source_name_tr" character varying(120)`,
    );
    await queryRunner.query(
      `ALTER TABLE "countries" ADD COLUMN "population_source_name_en" character varying(120)`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "countries" DROP COLUMN "population_source_name_en"`);
    await queryRunner.query(`ALTER TABLE "countries" DROP COLUMN "population_source_name_tr"`);
  }
}
