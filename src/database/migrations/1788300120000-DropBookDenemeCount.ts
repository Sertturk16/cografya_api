import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Drops `books.deneme_count` — the reader-visible-count ruling landing on the schema
 * (`DEC 2026-09-10c` md.1/md.2, P0 plan §5.9).
 *
 * ## PR-3 of 3, the breaking one (P0 plan §7.2)
 * The owner ruled that no count — not the declared künye figure, not a computed coverage number
 * — is rendered to the reader on the book surface: what a book offers is said by its own
 * editorial text (`intro_tr`, `meta_description_tr`), not by a number. `books.deneme_count` has no
 * remaining consumer once that ruling lands, so it is DROPPED outright rather than renamed —
 * `DEC 2026-09-10c` md.2 is explicit that the naming question revision 0 could not settle
 * (`video_unit_count` vs. Atlas's `declared_unit_count`) is void, because the column does not
 * survive to be named.
 *
 * ## Catalogue-only, measured on a throwaway database — not assumed (P0 plan §2.8)
 * `ALTER TABLE … DROP COLUMN` is catalogue-only on Postgres 16: the row is marked
 * `pg_attribute.attisdropped = true` rather than rewritten, so no row is read or written. Measured
 * on a throwaway `postgres:16-alpine` (16.15) with a `books` row plus a `book_videos` child holding
 * 60 rows: the surviving-column fingerprint of `books` was identical before and after,
 * `pg_class.relfilenode` did not move for either table, the child table's 60 rows were untouched,
 * and `CHK_books_deneme_count` was gone from `pg_constraint` afterwards with **no `CASCADE`
 * keyword written** — Postgres drops a column's own CHECK constraint with it automatically. The
 * sibling `CHK_books_page_count` survived in the same measurement, which is the positive control
 * proving the drop is targeted rather than indiscriminate. `test/book-catalogue-migration.e2e-spec.ts`
 * pins the same asymmetry as a gate (step 7) rather than trusting the throwaway measurement alone.
 *
 * ## `down()` is practically forward-only, and that is written here rather than discovered later
 * Re-adding the column as `integer NOT NULL` with no `DEFAULT` succeeds only while `books` is
 * empty or every existing row can take a value with nothing to backfill it — plan §10 risk 7. On
 * an empty table (every e2e that exercises this migration's revert path) it succeeds cleanly; on a
 * `books` table already carrying a row seeded without a declared count it fails LOUDLY inside its
 * own transaction, which is the correct failure rather than a silent corruption. `down()` exists
 * for the revert-to-red discipline in dev, not as a production rollback path.
 *
 * ## The guard this migration is built to satisfy (plan §5.6a)
 * The single statement below is exported as its own `readonly string[]`, exactly as PR-1's rename
 * and PR-2's four `ADD COLUMN` statements are, and `up()` runs exactly that array.
 * `book-catalogue-statements.spec.ts` asserts it against the SAME positive allowlist that already
 * names `DROP COLUMN` as a permitted shape — the allowlist did not need to widen for this PR.
 */
export const DROP_BOOK_DENEME_COUNT_STATEMENTS = [
  `ALTER TABLE "books" DROP COLUMN "deneme_count"`,
] as const;

export class DropBookDenemeCount1788300120000 implements MigrationInterface {
  name = 'DropBookDenemeCount1788300120000';

  async up(queryRunner: QueryRunner): Promise<void> {
    for (const statement of DROP_BOOK_DENEME_COUNT_STATEMENTS) {
      await queryRunner.query(statement);
    }
  }

  /**
   * The exact inverse in the ordinary case (an empty or fully-backfillable `books` table) — see
   * the class docblock for the one way this can fail instead of corrupt.
   */
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "books" ADD COLUMN "deneme_count" integer NOT NULL`);
    await queryRunner.query(
      `ALTER TABLE "books" ADD CONSTRAINT "CHK_books_deneme_count" CHECK ("deneme_count" > 0)`,
    );
  }
}
