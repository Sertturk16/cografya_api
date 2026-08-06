import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the two MÜFREDAT (school-curriculum) climate columns to `provinces`:
 *
 *   - `climate_curriculum_name_tr` (`varchar(80)`) — the MEB Coğrafya 9 / Harita 1.39
 *     regional climate name, one of eight canonical values (→ DEC 2026-08-05c,
 *     DEC 2026-08-05f, DEC 2026-08-06a).
 *   - `climate_curriculum_note_tr` (`text`)        — the explanation sentence, only where the
 *     name is a boundary reading or its geographic label differs from the province's region.
 *
 * **Neither column touches the MGM Köppen triple** (`climate_koppen` / `climate_class_tr` /
 * `climate_note_tr`). That triple is an attributed quotation of an official publication
 * (→ DEC 2026-08-04a, K1) and the whole point of adding columns rather than reusing them is
 * that our editorial mapping must not be published under MGM's attribution.
 *
 * **Length: 80, matching `climate_class_tr`.** The longest of the eight names is "Güneydoğu
 * Anadolu karasal iklimi" (32 chars), so the ceiling is deliberate headroom, not a fit.
 *
 * **No index, on purpose.** Neither column is ever a query predicate — they are read only as
 * part of the province detail payload, on a table of exactly 81 rows. A cross-link surface
 * ("every province sharing this curriculum name") is a separate, unmade product decision; the
 * index arrives with the query that needs it, not before (YAGNI, ENGINEERING §12).
 *
 * **Hand-authored SQL after a generator run, and the difference is the reason the rule
 * exists.** `pnpm migration:generate` was run against the up-to-date dev schema; alongside
 * the two `ADD COLUMN`s it also proposed dropping and recreating `IDX_provinces_region` and
 * `IDX_countries_continent` under hash names, dropping/recreating four foreign keys under
 * hash names, and dropping `marine_ecmwf_cycles.bytes_downloaded`'s default — all artefacts
 * of the generator not recognising the sibling migrations' EXPLICIT constraint names, none of
 * them anything this change asked for. Committing that unread would have renamed live
 * constraints and silently dropped a column default. Only the two `ADD COLUMN` statements are
 * kept, matching the hand-authored sibling migrations (ENGINEERING §5).
 *
 * SCHEMA ONLY — no rows are written here. The 81 names and 15 notes land through
 * `db:seed:geography` (`province.seed-data.ts`), which is where their invariants live.
 *
 * `down()` drops both columns — exactly reversible.
 */
export class AddProvinceClimateCurriculum1785974400000 implements MigrationInterface {
  name = 'AddProvinceClimateCurriculum1785974400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "provinces" ADD COLUMN "climate_curriculum_name_tr" character varying(80)`,
    );
    await queryRunner.query(`ALTER TABLE "provinces" ADD COLUMN "climate_curriculum_note_tr" text`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "provinces" DROP COLUMN "climate_curriculum_note_tr"`);
    await queryRunner.query(`ALTER TABLE "provinces" DROP COLUMN "climate_curriculum_name_tr"`);
  }
}
