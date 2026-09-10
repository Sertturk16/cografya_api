import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the four generic display fields the book → video → etiket shape needs
 * (`DEC 2026-09-10b` md.1–md.4, as amended by `DEC 2026-09-10c`) — all nullable, no default.
 *
 * ## PR-2 of 3 (P0 plan §7.2)
 * PR-1 renamed the table/columns/constraints; the entity TypeScript properties stayed on the OLD
 * names on purpose, for exactly one PR. This migration lands ALONGSIDE that property rename
 * (`book_videos.denemeNo` → `orderNo`, `BookVideoQuestion` → `BookVideoTag` with `questionNo` →
 * `orderNo`) and is the reason the rename compiles: TypeORM's generated `SELECT` names every
 * property on the entity, and a property with no backing column fails at runtime the moment this
 * PR's entities load. `books.deneme_count` is untouched here — `DEC 2026-09-10c` DROPS it in PR-3,
 * it is never renamed.
 *
 * ## What is added, and why each one is nullable with no default
 * - `book_videos.title_tr` / `title_en` (`varchar(200)`) — the video's OWN display title, never the
 *   YouTube API's `title` (which stays declared-and-discarded, plan §5.1). NULL for a deneme book's
 *   videos: "Deneme 12" is composed in the web repo from i18n + `orderNo`, never from this column
 *   (`GLOSSARY.md` §4.2, `video başlığı (titleTr/titleEn)`).
 * - `book_video_tags.name_tr` / `name_en` (`varchar(200)`) — the etiket's own name. A deneme book's
 *   etiketler carry NONE (`GLOSSARY.md` §4.2, `etiket`); a topic-summary/soru-bankası book's do.
 *   Nothing seeds these columns yet (no source in the committed artefact), so every row stays NULL
 *   until a book that needs them lands.
 *
 * No `DEFAULT` on any of the four: a default would assert a value for 30 videos and 180 etiketler
 * whose actual answer is "we do not have one", which is exactly what NULL means here.
 *
 * ## Rename, never recreate, continued (P0 plan §5.3) — this is the ADD-COLUMN half
 * `ALTER TABLE … ADD COLUMN … varchar(200)` (nullable, no default) rewrites no existing row and
 * reads none: Postgres stores the new attribute as absent-until-written metadata rather than
 * touching every heap tuple, so this is catalogue-only exactly as PR-1's renames were, by a
 * different mechanism (no row read vs. no row rewritten). No `INSERT`, `UPDATE`, `DELETE`,
 * `CREATE TABLE` or `DROP TABLE` — the same five-shape vocabulary PR-1 used, now exercising the
 * `ADD COLUMN` member for the first time.
 *
 * ## The guard this migration is built to satisfy (plan §5.6a, `C1-VAL-I1`)
 * The same positive-allowlist discipline as PR-1's `RenameBookCatalogueGeneric`: the statements
 * this migration executes are exported as their own `readonly string[]` below, `up()` runs exactly
 * that array, and `book-catalogue-statements.spec.ts` asserts every element against the same
 * allowlist that already names `ADD COLUMN` as a permitted shape. One list, two readers.
 *
 * `down()` drops the four columns in exact reverse order.
 */
export const ADD_GENERIC_BOOK_CATALOGUE_FIELDS_STATEMENTS = [
  `ALTER TABLE "book_videos" ADD COLUMN "title_tr" character varying(200)`,
  `ALTER TABLE "book_videos" ADD COLUMN "title_en" character varying(200)`,
  `ALTER TABLE "book_video_tags" ADD COLUMN "name_tr" character varying(200)`,
  `ALTER TABLE "book_video_tags" ADD COLUMN "name_en" character varying(200)`,
] as const;

export class AddGenericBookCatalogueFields1788300060000 implements MigrationInterface {
  name = 'AddGenericBookCatalogueFields1788300060000';

  async up(queryRunner: QueryRunner): Promise<void> {
    for (const statement of ADD_GENERIC_BOOK_CATALOGUE_FIELDS_STATEMENTS) {
      await queryRunner.query(statement);
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Exact reverse order of `ADD_GENERIC_BOOK_CATALOGUE_FIELDS_STATEMENTS`.
    await queryRunner.query(`ALTER TABLE "book_video_tags" DROP COLUMN "name_en"`);
    await queryRunner.query(`ALTER TABLE "book_video_tags" DROP COLUMN "name_tr"`);
    await queryRunner.query(`ALTER TABLE "book_videos" DROP COLUMN "title_en"`);
    await queryRunner.query(`ALTER TABLE "book_videos" DROP COLUMN "title_tr"`);
  }
}
