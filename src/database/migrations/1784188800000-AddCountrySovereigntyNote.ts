import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds `countries.sovereignty_note_tr` — the egemenlik / uluslararası tanınma çerçevesi prose
 * note, holding the owner's binding framing language for the handful of countries whose
 * international recognition / sovereignty status is contested or non-standard (owner-ruled as
 * ONE broad prose field, not several single-use columns → DEC 2026-07-13). This closes the
 * schema gap that blocked seeding the 6 sovereignty entities.
 *
 * Hand-authored (not generated) and hand-reviewed, consistent with the sibling migrations and
 * the repo's migration discipline (CLAUDE §5). Kept in raw SQL so the exact DDL is reviewable
 * at a glance and maps 1:1 to the entity's new `sovereigntyNoteTr` column (`synchronize` is
 * never used).
 *
 * `nullable` (no NOT NULL, no default): the note exists ONLY for entities whose status
 * genuinely needs the framing — the overwhelming majority of countries leave it absent (an
 * unset note, never a placeholder). This is SCHEMA/MECHANISM only; no per-country values are
 * populated by this change (the fact-checked framing prose lands in a separate, isolated data
 * PR, given the content's sensitivity).
 */
export class AddCountrySovereigntyNote1784188800000 implements MigrationInterface {
  name = 'AddCountrySovereigntyNote1784188800000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "countries" ADD COLUMN "sovereignty_note_tr" text`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "countries" DROP COLUMN "sovereignty_note_tr"`);
  }
}
