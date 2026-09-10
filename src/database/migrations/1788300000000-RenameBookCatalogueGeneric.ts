import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Renames the book-catalogue schema from its deneme-specific vocabulary to the generic
 * book → video → etiket shape ruled in `DEC 2026-09-10b` (as amended by `DEC 2026-09-10c`).
 *
 * ## PR-1 of 3, reviewed alone (P0 plan §7.2)
 * This migration is the whole risk of the P0 package: everything it does is expressible as
 * `RENAME TO` / `RENAME COLUMN` / `RENAME CONSTRAINT`, and nothing else lands in the same PR.
 * Entity TypeScript PROPERTY names are deliberately left untouched here — only the
 * `@Entity(…)` / `@Column({ name })` / `@Unique(…)` arguments move — so the intermediate state
 * (a `denemeNo` property mapped onto an `order_no` column) is odd on purpose and lives for
 * exactly one PR. The generic columns (`title_tr`/`title_en`/`name_tr`/`name_en`) and the
 * TypeScript rename land in PR-2; `books.deneme_count` is DROPPED — not renamed — in PR-3.
 *
 * ## Rename, never recreate — measured, not assumed (P0 plan §2.7)
 * Every statement below is catalogue-only on Postgres 16: no row is ever read or written, so no
 * row can be lost or altered. Measured on a throwaway `postgres:16-alpine` (16.15) against a
 * synthetic 30-video / 180-mark copy of the real shape: row counts and a joined-row md5
 * fingerprint were identical before and after, `pg_class.relfilenode` of the renamed child table
 * did not change (no heap rewrite), and every CHECK expression was rewritten to the new column
 * name automatically by `RENAME COLUMN` — no CHECK is dropped and re-added here. The same
 * property is asserted as a gate by `test/book-catalogue-migration.e2e-spec.ts` and, on the real
 * corpus, reconciled once by hand per the plan's §11.
 *
 * ## What changes and what does not
 * - Table: `book_video_questions` → `book_video_tags`.
 * - Columns: `book_videos.deneme_no` → `order_no`; the question table's `question_no` → `order_no`
 *   (renamed by its NEW table name below, i.e. after the table rename has already run).
 * - Seven constraints move with their tables (plan §5.2); Postgres renames each UNIQUE
 *   constraint's backing index along with it — measured in plan §2.7, not assumed here.
 * - `books.deneme_count` and its `CHK_books_deneme_count` are UNTOUCHED here — `DEC 2026-09-10c`
 *   drops the column outright in PR-3, so renaming it now would be pointless work undone one PR
 *   later (plan §5.9).
 * - No `title_tr`/`title_en`/`name_tr`/`name_en` column here — those are additive, nullable, no
 *   default, and land in PR-2's own migration; they carry no fidelity risk of their own.
 *
 * ## The guard this migration is built to satisfy (plan §5.6a, `C1-VAL-I1`)
 * A denylist scanning this file's own TEXT for `/\b(INSERT|UPDATE|DELETE|…)\b/i` was measured to
 * defeat itself twice against the sibling `InitBookCatalogue` migration: once on that file's own
 * docblock prose (which uses the word "DELETE" in an unrelated sentence) and once on
 * `ON DELETE CASCADE`, a constraint CLAUSE rather than a statement. A character scan cannot tell a
 * verb from a clause from a sentence. So the statements this migration actually executes are
 * exported as their own `readonly string[]` below and `up()` runs exactly that array, in order.
 * `book-catalogue-statements.spec.ts` asserts every element against a POSITIVE allowlist over the
 * SAME array — one list, two readers, so the migration and its guard cannot drift apart.
 *
 * `down()` is the exact inverse, in exact reverse order: each rename is individually reversible,
 * and the table itself is renamed back LAST, because every constraint/column rename that precedes
 * it in `down()` still needs to address the table by the name `up()` gave it.
 */
export const RENAME_BOOK_CATALOGUE_STATEMENTS = [
  `ALTER TABLE "book_video_questions" RENAME TO "book_video_tags"`,
  `ALTER TABLE "book_videos" RENAME COLUMN "deneme_no" TO "order_no"`,
  `ALTER TABLE "book_video_tags" RENAME COLUMN "question_no" TO "order_no"`,
  `ALTER TABLE "book_videos" RENAME CONSTRAINT "UQ_book_videos_book_deneme" TO "UQ_book_videos_book_order"`,
  `ALTER TABLE "book_videos" RENAME CONSTRAINT "CHK_book_videos_deneme_no" TO "CHK_book_videos_order_no"`,
  `ALTER TABLE "book_video_tags" RENAME CONSTRAINT "PK_book_video_questions" TO "PK_book_video_tags"`,
  `ALTER TABLE "book_video_tags" RENAME CONSTRAINT "UQ_book_video_questions_video_question" TO "UQ_book_video_tags_video_order"`,
  `ALTER TABLE "book_video_tags" RENAME CONSTRAINT "FK_book_video_questions_video" TO "FK_book_video_tags_video"`,
  `ALTER TABLE "book_video_tags" RENAME CONSTRAINT "CHK_book_video_questions_question_no" TO "CHK_book_video_tags_order_no"`,
  `ALTER TABLE "book_video_tags" RENAME CONSTRAINT "CHK_book_video_questions_start_second" TO "CHK_book_video_tags_start_second"`,
] as const;

export class RenameBookCatalogueGeneric1788300000000 implements MigrationInterface {
  name = 'RenameBookCatalogueGeneric1788300000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    for (const statement of RENAME_BOOK_CATALOGUE_STATEMENTS) {
      await queryRunner.query(statement);
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // The exact inverse of `RENAME_BOOK_CATALOGUE_STATEMENTS`, in exact reverse order — see the
    // class docblock for why the table rename is last here even though it is first in `up()`.
    await queryRunner.query(
      `ALTER TABLE "book_video_tags" RENAME CONSTRAINT "CHK_book_video_tags_start_second" TO "CHK_book_video_questions_start_second"`,
    );
    await queryRunner.query(
      `ALTER TABLE "book_video_tags" RENAME CONSTRAINT "CHK_book_video_tags_order_no" TO "CHK_book_video_questions_question_no"`,
    );
    await queryRunner.query(
      `ALTER TABLE "book_video_tags" RENAME CONSTRAINT "FK_book_video_tags_video" TO "FK_book_video_questions_video"`,
    );
    await queryRunner.query(
      `ALTER TABLE "book_video_tags" RENAME CONSTRAINT "UQ_book_video_tags_video_order" TO "UQ_book_video_questions_video_question"`,
    );
    await queryRunner.query(
      `ALTER TABLE "book_video_tags" RENAME CONSTRAINT "PK_book_video_tags" TO "PK_book_video_questions"`,
    );
    await queryRunner.query(
      `ALTER TABLE "book_videos" RENAME CONSTRAINT "CHK_book_videos_order_no" TO "CHK_book_videos_deneme_no"`,
    );
    await queryRunner.query(
      `ALTER TABLE "book_videos" RENAME CONSTRAINT "UQ_book_videos_book_order" TO "UQ_book_videos_book_deneme"`,
    );
    await queryRunner.query(
      `ALTER TABLE "book_video_tags" RENAME COLUMN "order_no" TO "question_no"`,
    );
    await queryRunner.query(`ALTER TABLE "book_videos" RENAME COLUMN "order_no" TO "deneme_no"`);
    await queryRunner.query(`ALTER TABLE "book_video_tags" RENAME TO "book_video_questions"`);
  }
}
