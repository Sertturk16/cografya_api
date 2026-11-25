import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Data-only migration: removes the former partner's book from databases that were seeded with it.
 * The seed corpus no longer carries it, and the seed never deletes a `books` row it does not
 * declare, so without this the book would stay published on every existing database.
 *
 * The book is found by its permanent TR slug. Its `video_progress` rows go first, because
 * `FK_video_progress_book_video` is `ON DELETE RESTRICT`; deleting the `books` row then cascades
 * to `book_videos`, their `book_video_tags` and their `youtube_video_snapshots`. On a database
 * that never held the book both statements match nothing, so the migration is a no-op there.
 */
export const REMOVED_BOOK_SLUG_TR = 'ayt-cografya-konu-ozetli-brans-denemeleri';

export class RemovePartnerBook1790640000000 implements MigrationInterface {
  name = 'RemovePartnerBook1790640000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "video_progress" WHERE "book_video_id" IN (
         SELECT bv."id" FROM "book_videos" bv
         JOIN "books" b ON b."id" = bv."book_id"
         WHERE b."slug_tr" = $1
       )`,
      [REMOVED_BOOK_SLUG_TR],
    );
    await queryRunner.query(`DELETE FROM "books" WHERE "slug_tr" = $1`, [REMOVED_BOOK_SLUG_TR]);
  }

  /** No-op: the deleted rows (including users' progress) cannot be restored from anything here. */
  down(): Promise<void> {
    return Promise.resolve();
  }
}
