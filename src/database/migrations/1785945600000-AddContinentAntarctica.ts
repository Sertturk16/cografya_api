import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds `ANTARKTIKA` to the `continent` Postgres enum (dalga-1 territory wave → DEC
 * 2026-08-01q). Schema only: no row uses the new value until the seed PR lands.
 *
 * Hand-authored (not generated) and hand-reviewed, consistent with all nine sibling
 * migrations and the repo's migration discipline (ENGINEERING §5). Kept in raw SQL so the exact
 * DDL is reviewable at a glance (`synchronize` is never used).
 *
 * ## Why the TYPE-SWAP form and not `ALTER TYPE … ADD VALUE`
 *
 * `ADD VALUE` is the shorter spelling, and it is REFUSED here for a reason that outlives the
 * usual one. The commonly-cited objection — "a value added inside a transaction cannot be used
 * in that same transaction" — is real but not binding for us: TypeORM wraps migrations in a
 * transaction, yet nothing in this migration or the seed (a separate connection, run after all
 * migrations) uses the value, and PostgreSQL 12+ relaxed the restriction anyway.
 *
 * The BINDING reason is `down()`: **PostgreSQL cannot drop an enum value.** A migration whose
 * `down()` cannot undo its `up()` is a lie in the migrations table. The type-swap form below is
 * genuinely reversible, so both directions are honest.
 *
 * ## What the swap does, and what it costs
 *
 *  - `ALTER COLUMN … TYPE` REWRITES the table and holds an ACCESS EXCLUSIVE lock for the
 *    duration. On ~199 rows that is unmeasurable; it is written down because the cost scales
 *    with the table, not because it matters today.
 *  - `IDX_countries_continent` is REBUILT BY POSTGRES automatically as part of the column type
 *    change — indexes over an altered column are reindexed by the same statement, so there is
 *    nothing to drop and recreate by hand.
 *  - `ANTARKTIKA` is appended LAST. Enum ordinal order is not a contract commitment (country
 *    lists order by `iso_code`, never by continent), so appending is purely the cheapest diff.
 *
 * ## `down()` FAILS LOUDLY when the value is in use — by design
 *
 * The reverse cast `"continent"::text::"continent"` cannot map an `ANTARKTIKA` row onto the
 * six-value type, so `down()` ERRORS instead of destroying the row. That is the wanted
 * behaviour: a revert that silently dropped Antarktika's continent would be data loss wearing
 * the costume of a successful rollback. Retract the rows first, then revert.
 */
export class AddContinentAntarctica1785945600000 implements MigrationInterface {
  name = 'AddContinentAntarctica1785945600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TYPE "continent" RENAME TO "continent_old"`);
    await queryRunner.query(`
      CREATE TYPE "continent" AS ENUM (
        'ASYA', 'AVRUPA', 'AFRIKA', 'KUZEY_AMERIKA', 'GUNEY_AMERIKA', 'OKYANUSYA', 'ANTARKTIKA'
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "countries"
        ALTER COLUMN "continent" TYPE "continent" USING "continent"::text::"continent"
    `);
    await queryRunner.query(`DROP TYPE "continent_old"`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TYPE "continent" RENAME TO "continent_new"`);
    await queryRunner.query(`
      CREATE TYPE "continent" AS ENUM (
        'ASYA', 'AVRUPA', 'AFRIKA', 'KUZEY_AMERIKA', 'GUNEY_AMERIKA', 'OKYANUSYA'
      )
    `);
    // Errors (rather than losing data) if any row still carries 'ANTARKTIKA' — see the header.
    await queryRunner.query(`
      ALTER TABLE "countries"
        ALTER COLUMN "continent" TYPE "continent" USING "continent"::text::"continent"
    `);
    await queryRunner.query(`DROP TYPE "continent_new"`);
  }
}
