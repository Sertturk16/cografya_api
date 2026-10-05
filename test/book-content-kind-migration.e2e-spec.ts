import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { DataSource } from 'typeorm';
import { BookContentKind } from '../src/book/book.types';
import { buildDataSourceOptions } from '../src/database/data-source-options';
import { AddBookContentKindAndVideoGroup1790467200000 } from '../src/database/migrations/1790467200000-AddBookContentKindAndVideoGroup';

/**
 * `AddBookContentKindAndVideoGroup` on a real Postgres: the CHECK it adds rejects a kind outside
 * the closed set and accepts every `BookContentKind` member, its `down()` removes exactly what
 * `up()` added, and a second `up()` restores it over an existing row.
 *
 * The migration is not the tip of the registered array, so the revert walks back BY NAME (as the
 * favorites suite does) instead of a hand-counted number of `undoLastMigration()` pops; a
 * migration registered later costs this suite nothing.
 */
describe('AddBookContentKindAndVideoGroup migration (e2e, real Postgres)', () => {
  let container: StartedPostgreSqlContainer;
  let dataSource: DataSource;

  const SUBJECT = AddBookContentKindAndVideoGroup1790467200000.name;
  const CONSTRAINT = 'CHK_books_content_kind';

  interface ColumnShape {
    readonly data_type: string;
    readonly max_length: number | null;
    readonly is_nullable: 'YES' | 'NO';
    readonly column_default: string | null;
  }

  async function columnShape(table: string, column: string): Promise<ColumnShape | undefined> {
    const rows = await dataSource.query<ColumnShape[]>(
      `
        SELECT data_type, character_maximum_length::int AS max_length, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2
      `,
      [table, column],
    );
    return rows[0];
  }

  /** Scoped to its table via `::regclass`, so a same-named constraint elsewhere cannot match. */
  async function hasCheckConstraint(table: string, name: string): Promise<boolean> {
    const rows = await dataSource.query<{ count: number }[]>(
      `
        SELECT count(*)::int AS count FROM pg_constraint
        WHERE conname = $1 AND conrelid = $2::regclass AND contype = 'c'
      `,
      [name, table],
    );
    return rows[0]?.count === 1;
  }

  async function lastAppliedMigration(): Promise<string | undefined> {
    const rows = await dataSource.query<{ name: string }[]>(
      `SELECT name FROM migrations ORDER BY timestamp DESC LIMIT 1`,
    );
    return rows[0]?.name;
  }

  async function setKind(bookId: string, kind: string): Promise<void> {
    await dataSource.query(`UPDATE "books" SET "content_kind" = $1 WHERE "id" = $2`, [
      kind,
      bookId,
    ]);
  }

  async function expectSchemaApplied(): Promise<void> {
    expect(await columnShape('books', 'content_kind')).toEqual({
      data_type: 'character varying',
      max_length: 16,
      is_nullable: 'NO',
      // The temporary DEFAULT only backfills existing rows; a new book must state its kind.
      column_default: null,
    });
    expect(await hasCheckConstraint('books', CONSTRAINT)).toBe(true);
    for (const column of ['group_title_tr', 'group_title_en']) {
      expect(await columnShape('book_videos', column)).toEqual({
        data_type: 'character varying',
        max_length: 120,
        is_nullable: 'YES',
        column_default: null,
      });
    }
  }

  async function expectSchemaReverted(): Promise<void> {
    expect(await columnShape('books', 'content_kind')).toBeUndefined();
    expect(await hasCheckConstraint('books', CONSTRAINT)).toBe(false);
    expect(await columnShape('book_videos', 'group_title_tr')).toBeUndefined();
    expect(await columnShape('book_videos', 'group_title_en')).toBeUndefined();
  }

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
    dataSource = new DataSource(buildDataSourceOptions(container.getConnectionUri()));
    await dataSource.initialize();
    await dataSource.runMigrations();
  }, 300_000);

  afterAll(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy();
    await container?.stop();
  });

  it('enforces the content_kind CHECK, reverts cleanly and re-applies over an existing row', async () => {
    const all = (dataSource.options.migrations ?? []) as (NewableFunction | string)[];
    const index = all.findIndex(
      (migration) => typeof migration === 'function' && migration.name === SUBJECT,
    );
    const previous = all[index - 1];
    if (index < 1 || typeof previous !== 'function') {
      throw new Error(`${SUBJECT} is not registered after another migration class`);
    }

    // Step 1 — fully migrated: the columns, their shapes and the CHECK exist.
    await expectSchemaApplied();

    const [book] = await dataSource.query<{ id: string }[]>(`
      INSERT INTO "books" (
        "slug_tr", "slug_en", "title_tr", "publisher_name", "author_names", "isbn13",
        "page_count", "exam_track", "intro_tr", "meta_title_tr", "meta_description_tr",
        "youtube_channel_id", "display_order", "content_kind"
      ) VALUES (
        'content-kind-fixture-tr', 'content-kind-fixture-en', 'Fixture', 'Fixture Publisher',
        ARRAY['Fixture Author'], '9780000000002', 100, 'AYT', 'fixture', 'fixture', 'fixture',
        'UCfixturefixture1', 0, 'kamp'
      ) RETURNING "id"
    `);
    if (!book) throw new Error('fixture book was not inserted');
    await dataSource.query(
      `
        INSERT INTO "book_videos" (
          "book_id", "order_no", "youtube_video_id", "group_title_tr", "group_title_en"
        ) VALUES ($1, 1, 'fx000000001', '1. GÜN', 'DAY 1')
      `,
      [book.id],
    );

    // Step 2 — the CHECK: every enum member is accepted, anything else is rejected by name.
    for (const kind of Object.values(BookContentKind)) {
      await setKind(book.id, kind);
      const [row] = await dataSource.query<{ content_kind: string }[]>(
        `SELECT content_kind FROM "books" WHERE "id" = $1`,
        [book.id],
      );
      expect(row?.content_kind).toBe(kind);
    }
    for (const invalid of ['ders_notu', 'Deneme', '']) {
      await expect(setKind(book.id, invalid)).rejects.toThrow(new RegExp(CONSTRAINT));
    }
    // NOT NULL with no default: a book that omits its kind is refused.
    await expect(
      dataSource.query(`
        INSERT INTO "books" (
          "slug_tr", "slug_en", "title_tr", "publisher_name", "author_names", "isbn13",
          "page_count", "exam_track", "intro_tr", "meta_title_tr", "meta_description_tr",
          "youtube_channel_id", "display_order"
        ) VALUES (
          'no-kind-fixture-tr', 'no-kind-fixture-en', 'Fixture', 'Fixture Publisher',
          ARRAY['Fixture Author'], '9780000000003', 100, 'AYT', 'fixture', 'fixture', 'fixture',
          'UCfixturefixture2', 1
        )
      `),
    ).rejects.toThrow(/content_kind/);

    // Step 3 — revert to the previous migration: rewind every later one by name, then pop the
    // subject itself so its own `down()` runs.
    for (let guard = 0; guard < 20; guard += 1) {
      const last = await lastAppliedMigration();
      if (!last) throw new Error('rewound past every migration without reaching the subject');
      if (last === SUBJECT) break;
      await dataSource.undoLastMigration();
    }
    expect(await lastAppliedMigration()).toBe(SUBJECT);
    await dataSource.undoLastMigration();
    expect(await lastAppliedMigration()).toBe(previous.name);

    await expectSchemaReverted();
    // `down()` drops columns only; the rows themselves survive.
    const [counts] = await dataSource.query<{ books: number; videos: number }[]>(
      `
        SELECT
          (SELECT count(*)::int FROM "books" WHERE "id" = $1) AS books,
          (SELECT count(*)::int FROM "book_videos" WHERE "book_id" = $1) AS videos
      `,
      [book.id],
    );
    expect(counts).toEqual({ books: 1, videos: 1 });

    // Step 4 — up again (with every later migration): the schema is back, the surviving row is
    // backfilled as a deneme book, and the group titles `down()` destroyed stay NULL.
    await dataSource.runMigrations();
    expect(await lastAppliedMigration()).toBe((all[all.length - 1] as NewableFunction).name);
    await expectSchemaApplied();

    const [restored] = await dataSource.query<{ content_kind: string }[]>(
      `SELECT content_kind FROM "books" WHERE "id" = $1`,
      [book.id],
    );
    expect(restored?.content_kind).toBe(BookContentKind.Deneme);
    const videos = await dataSource.query<
      { group_title_tr: string | null; group_title_en: string | null }[]
    >(`SELECT group_title_tr, group_title_en FROM "book_videos" WHERE "book_id" = $1`, [book.id]);
    expect(videos).toEqual([{ group_title_tr: null, group_title_en: null }]);
    await expect(setKind(book.id, 'ders_notu')).rejects.toThrow(new RegExp(CONSTRAINT));

    await dataSource.query('DELETE FROM "books" WHERE "id" = $1', [book.id]);
  }, 300_000);
});
