import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the `country_entity_type` enum and four `countries` columns: `entity_type`,
 * `status_label_tr`, `status_label_en` and `area_is_approximate` (dalga-1 territory wave →
 * DEC 2026-08-01q; the ≈ flag → Atlas ruling S1, 2026-08-02, preserving DEC 2026-08-01l/g).
 * Schema only — no row values are written here (the seed rows land in a separate PR).
 *
 * Hand-authored (not generated) and hand-reviewed per the repo's migration discipline
 * (ENGINEERING §5); raw SQL so the exact DDL is reviewable at a glance and maps 1:1 to the
 * entity's new columns.
 *
 * ## Backfill: the DEFAULT does it, and the DEFAULT stays
 *
 * `entity_type … NOT NULL DEFAULT 'country'` fills every pre-existing row with the correct
 * value as part of the `ADD COLUMN`, so there is **no separate UPDATE statement** — and the
 * default is deliberately KEPT afterwards rather than dropped: an ordinary country row should
 * never have to state its type, only the exceptions are marked. On PostgreSQL 11+ adding a
 * NOT NULL column with a constant default does not rewrite the table (the default is stored in
 * the catalog), so this is cheap regardless of table size.
 *
 * ## No index on `entity_type`
 *
 * ~199 rows: a sequential scan is already optimal and an index would be maintenance cost for
 * no measurable read gain (YAGNI). Recorded on the entity too, with the same reasoning.
 *
 * ## The two label columns are nullable, and a GUARD — not a CHECK — pairs them with the type
 *
 * The rule is "`country` ⇒ both labels NULL; non-`country` ⇒ both labels non-empty". It is
 * enforced on the SEED WRITE PATH (`assertCountryEntityInvariants`), not as a table CHECK
 * constraint, because the same guard has to express five more invariants that are not
 * expressible in one column-pair check (e.g. "the `turkiye` slug belongs only to the TR row"),
 * and splitting one product rule across two enforcement mechanisms is how the halves drift.
 * `varchar(80)` matches the longest approved label with room to spare.
 */
export class AddCountryEntityType1785949200000 implements MigrationInterface {
  name = 'AddCountryEntityType1785949200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "country_entity_type" AS ENUM ('country', 'territory', 'special')
    `);
    await queryRunner.query(`
      ALTER TABLE "countries"
        ADD COLUMN "entity_type" "country_entity_type" NOT NULL DEFAULT 'country'
    `);
    await queryRunner.query(
      `ALTER TABLE "countries" ADD COLUMN "status_label_tr" character varying(80)`,
    );
    await queryRunner.query(
      `ALTER TABLE "countries" ADD COLUMN "status_label_en" character varying(80)`,
    );
    await queryRunner.query(`
      ALTER TABLE "countries"
        ADD COLUMN "area_is_approximate" boolean NOT NULL DEFAULT false
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "countries" DROP COLUMN "area_is_approximate"`);
    await queryRunner.query(`ALTER TABLE "countries" DROP COLUMN "status_label_en"`);
    await queryRunner.query(`ALTER TABLE "countries" DROP COLUMN "status_label_tr"`);
    await queryRunner.query(`ALTER TABLE "countries" DROP COLUMN "entity_type"`);
    // Dropped last: the column that depends on it is gone by now.
    await queryRunner.query(`DROP TYPE "country_entity_type"`);
  }
}
