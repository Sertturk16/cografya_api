import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { DataSource, type DataSourceOptions } from 'typeorm';
import { buildDataSourceOptions } from '../src/database/data-source-options';
import { RenameBookCatalogueGeneric1788300000000 } from '../src/database/migrations/1788300000000-RenameBookCatalogueGeneric';

/**
 * The empirical, round-trip half of AC 2's proof (P0 plan §5.6b) — PR-1's own steps 1–6.
 *
 * ## Why a fresh, truncated `DataSource` rather than the shared fixture
 * `test/book-seed.e2e-spec.ts` always starts from a FULLY-migrated, empty schema — it can never
 * observe a rename, because by the time it connects the columns already carry their final names
 * (§2.6 of the plan: no e2e can observe the live 180 rows this way). This spec instead builds the
 * schema up to (but NOT including) the migration under test, inserts a synthetic corpus under the
 * OLD names, fingerprints it, runs the one remaining migration, and re-reads the SAME rows under
 * the NEW names. A migration that silently lost, altered or reordered a row changes the
 * fingerprint; a migration that rewrote the table changes `relfilenode`.
 *
 * ## Synthetic, on purpose (`CONVENTIONS.md` §2's province rule)
 * 30 videos × 6 marks mirrors the real corpus's SHAPE, never its values — no measured fact is
 * pinned in this file. The real 180 seconds are reconciled separately, once, by hand, per the
 * plan's §11 (a disclosed local run, `DEC 2026-08-26u`).
 *
 * ## Grown across all three PRs of the series (plan §7.2)
 * Steps 1–6 are PR-1's own contribution. Step 5's `name_tr`/`title_tr` half and its own
 * `AddGenericBookCatalogueFields1788300060000` migration landed in PR-2. Step 7 — the
 * `books.deneme_count` / `CHK_books_deneme_count` drop — is P0 PR-3's own contribution, below.
 */
describe('Book-catalogue rename migration — round-trip fidelity (e2e, real Postgres)', () => {
  let container: StartedPostgreSqlContainer;

  const NEW_MIGRATION_NAME = RenameBookCatalogueGeneric1788300000000.name;

  /**
   * Every registered migration strictly BEFORE the one under test — the schema as it is today.
   *
   * `NewableFunction`, not `Function`: every element of `DataSourceOptions.migrations` that is
   * not a string is a migration CLASS, always used with `new`, and the narrower built-in type is
   * what `@typescript-eslint/no-unsafe-function-type` asks for in place of the library's own
   * `Function` (TypeORM's own `MixedList<Function | string>` is the wider type this narrows).
   */
  function migrationsBefore(
    options: DataSourceOptions,
    name: string,
  ): (NewableFunction | string)[] {
    const all = (options.migrations ?? []) as (NewableFunction | string)[];
    const index = all.findIndex(
      (migration) => typeof migration === 'function' && migration.name === name,
    );
    if (index === -1) {
      throw new Error(`migration ${name} is not registered in data-source-options.ts`);
    }
    return all.slice(0, index);
  }

  interface Fingerprint {
    readonly videoCount: number;
    readonly markCount: number;
    readonly md5: string | null;
    readonly videoRelfilenode: string;
    readonly markRelfilenode: string;
  }

  /**
   * `noUncheckedIndexedAccess` makes every array index possibly-`undefined` — this is the one
   * place that fact is resolved, with a message naming the query rather than a bare crash.
   */
  function firstRowOrThrow<T>(rows: T[], description: string): T {
    const [row] = rows;
    if (row === undefined) {
      throw new Error(`expected at least one row from: ${description}`);
    }
    return row;
  }

  /** Reads `pg_class.relfilenode` for one table, scoped to `public` so no catalog object collides. */
  async function relfilenode(dataSource: DataSource, table: string): Promise<string> {
    const rows = await dataSource.query<{ relfilenode: string }[]>(
      `
      SELECT c.relfilenode::text AS relfilenode
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relname = $1 AND n.nspname = 'public' AND c.relkind = 'r'
    `,
      [table],
    );
    return firstRowOrThrow(rows, `relfilenode(${table})`).relfilenode;
  }

  async function fingerprint(
    dataSource: DataSource,
    bookId: string,
    videoTable: string,
    markTable: string,
    videoOrderColumn: string,
    markOrderColumn: string,
  ): Promise<Fingerprint> {
    const { count: videoCount } = firstRowOrThrow(
      await dataSource.query<{ count: number }[]>(
        `SELECT count(*)::int AS count FROM "${videoTable}" WHERE "book_id" = $1`,
        [bookId],
      ),
      `count(${videoTable})`,
    );
    const { count: markCount } = firstRowOrThrow(
      await dataSource.query<{ count: number }[]>(
        `
        SELECT count(*)::int AS count FROM "${markTable}" m
        JOIN "${videoTable}" v ON v."id" = m."book_video_id"
        WHERE v."book_id" = $1
      `,
        [bookId],
      ),
      `count(${markTable} join ${videoTable})`,
    );
    const { md5 } = firstRowOrThrow(
      await dataSource.query<{ md5: string | null }[]>(
        `
        SELECT md5(string_agg(x, '|' ORDER BY x)) AS md5 FROM (
          SELECT v."${videoOrderColumn}" || ':' || m."${markOrderColumn}" || ':'
                 || m."start_second" || ':' || m."id" AS x
          FROM "${videoTable}" v JOIN "${markTable}" m ON m."book_video_id" = v."id"
          WHERE v."book_id" = $1
        ) s
      `,
        [bookId],
      ),
      `fingerprint(${videoTable}, ${markTable})`,
    );
    return {
      videoCount,
      markCount,
      md5,
      videoRelfilenode: await relfilenode(dataSource, videoTable),
      markRelfilenode: await relfilenode(dataSource, markTable),
    };
  }

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
  }, 300_000);

  afterAll(async () => {
    await container.stop();
  });

  it('renames the table, both columns and all seven constraints with no row lost, altered or rewritten', async () => {
    const url = container.getConnectionUri();
    const fullOptions = buildDataSourceOptions(url);

    // Step 1 — the OLD schema, exactly as it stands on `origin/dev` today.
    const oldOptions: DataSourceOptions = {
      ...fullOptions,
      migrations: migrationsBefore(fullOptions, NEW_MIGRATION_NAME),
    };
    const oldDataSource = new DataSource(oldOptions);
    await oldDataSource.initialize();
    await oldDataSource.runMigrations();

    // Step 2 — a synthetic book, 30 videos × 6 marks, inserted through the OLD column names.
    const { id: bookId } = firstRowOrThrow(
      await oldDataSource.query<{ id: string }[]>(`
        INSERT INTO "books" (
          "slug_tr", "slug_en", "title_tr", "publisher_name", "author_names", "isbn13",
          "page_count", "exam_track", "deneme_count", "intro_tr", "meta_title_tr",
          "meta_description_tr", "youtube_channel_id", "display_order"
        ) VALUES (
          'migration-fidelity-fixture-tr', 'migration-fidelity-fixture-en', 'Fixture',
          'Fixture Publisher', ARRAY['Fixture Author'], '9780000000001', 100, 'AYT', 1,
          'fixture', 'fixture', 'fixture', 'UCfixturefixture0', 0
        ) RETURNING "id"
      `),
      'insert synthetic book fixture',
    );

    await oldDataSource.query(
      `
        INSERT INTO "book_videos" ("book_id", "deneme_no", "youtube_video_id")
        SELECT $1, v, 'fx' || lpad(v::text, 9, '0')
        FROM generate_series(1, 30) AS v
      `,
      [bookId],
    );

    await oldDataSource.query(
      `
        INSERT INTO "book_video_questions" ("book_video_id", "question_no", "start_second")
        SELECT bv."id", q, (q - 1) * 100 + bv."deneme_no"
        FROM "book_videos" bv
        CROSS JOIN generate_series(1, 6) AS q
        WHERE bv."book_id" = $1
      `,
      [bookId],
    );

    // Step 3 — fingerprint the OLD state.
    const before = await fingerprint(
      oldDataSource,
      bookId,
      'book_videos',
      'book_video_questions',
      'deneme_no',
      'question_no',
    );
    expect(before.videoCount).toBe(30);
    expect(before.markCount).toBe(180);
    expect(before.md5).not.toBeNull();

    await oldDataSource.destroy();

    // Step 4 — run the remaining migration(s) (in PR-1 this was the ONE rename migration; from
    // PR-2 on it also includes `AddGenericBookCatalogueFields`, since `fullOptions.migrations` is
    // the COMPLETE array and `runMigrations()` applies everything not yet in the bookkeeping
    // table). The `migrations` table already records everything before `NEW_MIGRATION_NAME` as
    // applied.
    const fullDataSource = new DataSource(fullOptions);
    await fullDataSource.initialize();
    await fullDataSource.runMigrations();

    // Step 5 — re-read through the NEW names: identical fingerprint, identical counts, identical
    // `relfilenode` (the "no rewrite" proof).
    const after = await fingerprint(
      fullDataSource,
      bookId,
      'book_videos',
      'book_video_tags',
      'order_no',
      'order_no',
    );
    expect(after.videoCount).toBe(before.videoCount);
    expect(after.markCount).toBe(before.markCount);
    expect(after.md5).toBe(before.md5);
    expect(after.videoRelfilenode).toBe(before.videoRelfilenode);
    expect(after.markRelfilenode).toBe(before.markRelfilenode);

    // Step 6 — the automatic CHECK-expression rewrite (measured in plan §2.7), pinned as a gate
    // rather than trusted. `pg_get_constraintdef` is looked up scoped to its own table via
    // `::regclass`, so a same-named constraint on an unrelated table cannot be matched instead.
    const constraintDef = async (table: string, name: string): Promise<string> => {
      const rows = await fullDataSource.query<{ def: string }[]>(
        `
          SELECT pg_get_constraintdef(oid) AS def
          FROM pg_constraint
          WHERE conname = $1 AND conrelid = $2::regclass
        `,
        [name, table],
      );
      return firstRowOrThrow(rows, `constraintdef(${table}.${name})`).def;
    };

    expect(await constraintDef('book_video_tags', 'UQ_book_video_tags_video_order')).toBe(
      'UNIQUE (book_video_id, order_no)',
    );
    expect(await constraintDef('book_videos', 'UQ_book_videos_book_order')).toBe(
      'UNIQUE (book_id, order_no)',
    );
    expect(await constraintDef('book_video_tags', 'CHK_book_video_tags_order_no')).toBe(
      'CHECK (((order_no >= 1) AND (order_no <= 99)))',
    );
    expect(await constraintDef('book_videos', 'CHK_book_videos_order_no')).toBe(
      'CHECK (((order_no >= 1) AND (order_no <= 999)))',
    );

    // Step 5's name_tr/title_tr half (P0 PR-2, this migration's own contribution to this file):
    // `AddGenericBookCatalogueFields` has now run as part of "the remaining migrations" in step 4,
    // so `book_videos.title_tr`/`title_en` and `book_video_tags.name_tr`/`name_en` all exist and
    // are NULL for this fixture's rows — nothing in the seed/migration path writes them, which
    // `GLOSSARY.md` §4.2's "a deneme book's etiketler carry no name" ruling requires.
    const nullGenericFields = await fullDataSource.query<
      { title_tr: string | null; title_en: string | null }[]
    >(`SELECT title_tr, title_en FROM "book_videos" WHERE "book_id" = $1`, [bookId]);
    expect(nullGenericFields.length).toBe(30);
    expect(nullGenericFields.every((row) => row.title_tr === null && row.title_en === null)).toBe(
      true,
    );

    const nullTagFields = await fullDataSource.query<
      { name_tr: string | null; name_en: string | null }[]
    >(
      `
        SELECT t.name_tr, t.name_en FROM "book_video_tags" t
        JOIN "book_videos" v ON v."id" = t."book_video_id"
        WHERE v."book_id" = $1
      `,
      [bookId],
    );
    expect(nullTagFields.length).toBe(180);
    expect(nullTagFields.every((row) => row.name_tr === null && row.name_en === null)).toBe(true);

    // Step 7 (P0 PR-3, this migration's own contribution to this file): `DropBookDenemeCount` has
    // now run as part of "the remaining migrations" in step 4, so `books.deneme_count` and its
    // `CHK_books_deneme_count` are gone. The other nine `books` constraints are the POSITIVE
    // CONTROL — §2.8 measured this exact asymmetry on a throwaway database (targeted drop, not
    // indiscriminate); this pins it as a gate on the real migration path rather than trusting the
    // throwaway measurement alone.
    const bookConstraints = await fullDataSource.query<{ conname: string }[]>(
      `SELECT conname FROM pg_constraint WHERE conrelid = 'books'::regclass ORDER BY conname`,
    );
    const bookConstraintNames = bookConstraints.map((row) => row.conname);
    expect(bookConstraintNames).not.toContain('CHK_books_deneme_count');
    expect(bookConstraintNames).toEqual(
      expect.arrayContaining([
        'CHK_books_author_names',
        'CHK_books_cover_image_path',
        'CHK_books_isbn13',
        'CHK_books_page_count',
        'CHK_books_purchase_url',
        'PK_books',
        'UQ_books_isbn13',
        'UQ_books_slug_en',
        'UQ_books_slug_tr',
      ]),
    );

    await fullDataSource.query('DELETE FROM "books" WHERE "id" = $1', [bookId]);
    await fullDataSource.destroy();
  }, 300_000);
});
