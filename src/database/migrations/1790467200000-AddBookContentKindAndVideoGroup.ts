import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * T-128: the book page serves five book kinds from one model.
 *
 *  1. `books.content_kind` — NOT NULL, closed set by CHECK. The existing row is a deneme book;
 *     the temporary DEFAULT fills it and is dropped so a new book must state its kind.
 *  2. `book_videos.group_title_tr/en` — nullable group heading ("1. Ünite", "1. GÜN"). NULL
 *     means an untitled group; a deneme book has none.
 *
 * Hand-written: a CHECK with a chosen name reads better than a generated one.
 * `down()` drops only what `up()` added; it destroys the kind and group titles by design.
 */
export class AddBookContentKindAndVideoGroup1790467200000 implements MigrationInterface {
  name = 'AddBookContentKindAndVideoGroup1790467200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "books" ADD "content_kind" character varying(16) NOT NULL DEFAULT 'deneme'`,
    );
    await queryRunner.query(`ALTER TABLE "books" ALTER COLUMN "content_kind" DROP DEFAULT`);
    await queryRunner.query(
      `ALTER TABLE "books" ADD CONSTRAINT "CHK_books_content_kind" CHECK ("content_kind" IN ('deneme', 'soru_bankasi', 'konu_anlatimi', 'kamp', 'tek_video'))`,
    );
    await queryRunner.query(
      `ALTER TABLE "book_videos" ADD "group_title_tr" character varying(120)`,
    );
    await queryRunner.query(
      `ALTER TABLE "book_videos" ADD "group_title_en" character varying(120)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "book_videos" DROP COLUMN "group_title_en"`);
    await queryRunner.query(`ALTER TABLE "book_videos" DROP COLUMN "group_title_tr"`);
    await queryRunner.query(`ALTER TABLE "books" DROP CONSTRAINT "CHK_books_content_kind"`);
    await queryRunner.query(`ALTER TABLE "books" DROP COLUMN "content_kind"`);
  }
}
