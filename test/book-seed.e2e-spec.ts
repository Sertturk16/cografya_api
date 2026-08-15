import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { DataSource } from 'typeorm';
import { BookVideoQuestion } from '../src/book/entities/book-video-question.entity';
import { BookVideo } from '../src/book/entities/book-video.entity';
import { Book } from '../src/book/entities/book.entity';
import { buildDataSourceOptions } from '../src/database/data-source-options';
import type { BookTimestampsArtifact } from '../src/database/seeds/book-timestamps.artifact';
import { BOOK_TIMESTAMPS_OWNER_SLUG_TR, SEED_BOOKS } from '../src/database/seeds/books.seed-data';
import { seedBooks } from '../src/database/seeds/seed-books';

/**
 * B3 write-path e2e — seed idempotency, the REMOVAL path, and the schema's own refusals.
 *
 * ## Why this file exists at all (`SFH109R2-I1`)
 * B2 shipped roughly 110 lines of deletion, cascade-counting and re-keying logic that **no CI job
 * ran**. It was measured correct by hand across sixteen orderings, and nothing kept it correct: the
 * next edit to `seed-books.ts` had no gate under it. Every case below drives the SHIPPED
 * `seedBooks` function, and the removal cases pass `allowRemovals: true` — the flag whose default
 * is the safety property being tested.
 *
 * ## And the constraint matrices (`FU-BOOKS-CONSTRAINT-E2E`)
 * `1786752000000-InitBookCatalogue.ts` documents, in prose, exactly what each CHECK must refuse AND
 * what it deliberately admits, and says in as many words that B3 owns the automated version of
 * every matrix. Written as prose those matrices are a specification nobody re-runs; here they are a
 * gate. **Each matrix carries its own accept case**, which is the positive control: without one, a
 * constraint that rejected everything — or a typo'd table name that made every insert fail — would
 * satisfy the whole reject list and report green.
 *
 * ## Structural only, and no Nest app
 * These cases need Postgres and the seed function, not an HTTP surface, so no application is
 * booted. Nothing here asserts a book fact: the synthetic fixtures carry invented ids and seconds,
 * and the committed-corpus cases assert relationships (row counts before vs after, which rows moved)
 * rather than values.
 */

/** A synthetic artefact — invented ids and seconds, so no measured fact is pinned in a test. */
function artifact(
  videos: { denemeNo: number; youtubeVideoId: string; questions: number[] }[],
): BookTimestampsArtifact {
  return {
    videos: videos.map((video) => ({
      denemeNo: video.denemeNo,
      youtubeVideoId: video.youtubeVideoId,
      questions: video.questions.map((startSecond, index) => ({
        questionNo: index + 1,
        startSecond,
      })),
    })),
    questionCount: videos.reduce((sum, video) => sum + video.questions.length, 0),
  };
}

/**
 * The künye row the artefact belongs to.
 *
 * Resolved through a function so a missing owner throws at import with a message that names the
 * slug, rather than being carried as a `!` assertion that would fail later as a null dereference.
 */
function ownerBook(): (typeof SEED_BOOKS)[number] {
  const found = SEED_BOOKS.find((book) => book.slugTr === BOOK_TIMESTAMPS_OWNER_SLUG_TR);
  if (found === undefined) {
    throw new Error(`no seed book owns the artefact slug ${BOOK_TIMESTAMPS_OWNER_SLUG_TR}`);
  }
  return found;
}

const OWNER = ownerBook();

/** Three denemeler, two questions each — enough to exercise removal, cascade and re-keying. */
const BASE = artifact([
  { denemeNo: 1, youtubeVideoId: 'aaaaaaaaaaa', questions: [0, 30] },
  { denemeNo: 2, youtubeVideoId: 'bbbbbbbbbbb', questions: [5, 40] },
  { denemeNo: 3, youtubeVideoId: 'ccccccccccc', questions: [7, 50] },
]);

describe('Book seed write path (e2e, real Postgres)', () => {
  let container: StartedPostgreSqlContainer;
  let dataSource: DataSource;

  const counts = async (): Promise<{ videos: number; questions: number }> => ({
    videos: await dataSource.getRepository(BookVideo).count(),
    questions: await dataSource.getRepository(BookVideoQuestion).count(),
  });

  /**
   * Runs a seed that MUST refuse, and returns the refusal's own error — the `cause`.
   *
   * **The two layers are asserted separately because they carry different things, and a test that
   * checked only the outer one would have missed the half that matters.** `seedBooks` wraps any
   * per-book failure in `Seeding book [slug] failed — see cause.`, which names the offending row;
   * the refusal's own message, the one telling an operator to re-run with `--allow-removals`, is on
   * `cause`. That instruction does reach a human: `books.cli.ts` hands the whole Error object to
   * `console.error`, and Node prints the `[cause]` chain with it.
   */
  async function seedRefusal(
    options: Parameters<typeof seedBooks>[1],
  ): Promise<{ outer: Error; cause: Error }> {
    let thrown: unknown;
    try {
      await seedBooks(dataSource, options);
    } catch (error: unknown) {
      thrown = error;
    }
    if (!(thrown instanceof Error)) {
      throw new Error('expected the seed to refuse, but it resolved');
    }
    // The wrapper names the row it failed on — without this the operator reads the SQL to find out.
    expect(thrown.message).toMatch(/Seeding book \[.+\] failed/);
    const { cause } = thrown;
    if (!(cause instanceof Error)) {
      throw new Error(`refusal carried no Error cause: ${JSON.stringify(thrown.message)}`);
    }
    return { outer: thrown, cause };
  }

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
    const url = container.getConnectionUri();
    process.env.DATABASE_URL = url;

    dataSource = new DataSource(buildDataSourceOptions(url));
    await dataSource.initialize();
    await dataSource.runMigrations();
  }, 300_000);

  afterAll(async () => {
    if (dataSource.isInitialized) await dataSource.destroy();
    await container.stop();
  });

  describe('idempotency and the removal path', () => {
    /** Reset to a known state before every case, so no case depends on another's leftovers. */
    beforeEach(async () => {
      // Raw DELETE rather than `repository.delete({})`: TypeORM refuses empty criteria, and the FK
      // cascade is what clears the two child tables.
      await dataSource.query('DELETE FROM books');
      await seedBooks(dataSource, {
        books: [OWNER],
        artifact: BASE,
        ownerSlugTr: BOOK_TIMESTAMPS_OWNER_SLUG_TR,
      });
    });

    it('writes nothing on a second identical run (SPEC §13 invariant 2)', async () => {
      const before = await counts();
      const stamps = await dataSource
        .getRepository(BookVideoQuestion)
        .find({ order: { questionNo: 'ASC' } });
      // The BOOK row's own stamp, which is the one that actually feeds sitemap `lastmod`. Read
      // before the run so the comparison below is against a value this test observed, not inferred.
      const bookBefore = await dataSource
        .getRepository(Book)
        .findOneByOrFail({ slugTr: BOOK_TIMESTAMPS_OWNER_SLUG_TR });

      const result = await seedBooks(dataSource, {
        books: [OWNER],
        artifact: BASE,
        ownerSlugTr: BOOK_TIMESTAMPS_OWNER_SLUG_TR,
      });

      // **The `books` counters, not only the children.** This case is NAMED for invariant 2 and
      // asserted nothing about the book row until PR #110's review (`TEST110-I1`). The gap was not
      // theoretical: a later `BookSeed` field whose comparator does not round-trip through Postgres
      // makes `rowMatchesSeed` false on every run, so the seed rewrites the book row for ever,
      // `books.updated_at` advances each time, and the sitemap tells search engines the page
      // changed when it did not — exactly what `SEO-POLICY.md` §B6 6.9 refuses. The whole suite
      // stayed green through that.
      expect(result.books.updated).toBe(0);
      expect(result.books.inserted).toBe(0);
      expect(result.books.unchanged).toBe(1);
      expect(result.videos.updated).toBe(0);
      expect(result.questions.updated).toBe(0);
      expect(result.videos.unchanged).toBeGreaterThan(0);
      expect(await counts()).toEqual(before);

      // `updated_at` must not move on a no-op run: `Book.updatedAt` feeds sitemap `lastmod`, so a
      // seed that rewrote identical values would tell search engines the page changed every time
      // anybody ran it.
      const bookAfter = await dataSource
        .getRepository(Book)
        .findOneByOrFail({ slugTr: BOOK_TIMESTAMPS_OWNER_SLUG_TR });
      expect(bookAfter.updatedAt.toISOString()).toBe(bookBefore.updatedAt.toISOString());

      const after = await dataSource
        .getRepository(BookVideoQuestion)
        .find({ order: { questionNo: 'ASC' } });
      expect(after.map((row) => row.updatedAt.toISOString()).sort()).toEqual(
        stamps.map((row) => row.updatedAt.toISOString()).sort(),
      );
    });

    it('POSITIVE CONTROL: a genuine change moves exactly one row', async () => {
      // Without this, the case above passes just as well against a seed that writes NOTHING at all.
      const changed = artifact([
        { denemeNo: 1, youtubeVideoId: 'aaaaaaaaaaa', questions: [0, 31] },
        { denemeNo: 2, youtubeVideoId: 'bbbbbbbbbbb', questions: [5, 40] },
        { denemeNo: 3, youtubeVideoId: 'ccccccccccc', questions: [7, 50] },
      ]);
      const result = await seedBooks(dataSource, {
        books: [OWNER],
        artifact: changed,
        ownerSlugTr: BOOK_TIMESTAMPS_OWNER_SLUG_TR,
      });
      expect(result.questions.updated).toBe(1);
      expect(result.questions.removed).toBe(0);
      // A child-only change must leave the BOOK row alone — which is also what makes the derived
      // `updatedAt` a GREATEST over three tables rather than a read of one.
      expect(result.books.updated).toBe(0);
    });

    it('POSITIVE CONTROL: a changed BOOK field moves the book row and its stamp', async () => {
      // The counterpart control for the `result.books` assertions above. Without it,
      // `books.updated === 0` and `books.unchanged === 1` would also hold for a seed that had
      // stopped comparing the book row at all — the exact failure `TEST110-I1` describes.
      const bookBefore = await dataSource
        .getRepository(Book)
        .findOneByOrFail({ slugTr: BOOK_TIMESTAMPS_OWNER_SLUG_TR });

      const result = await seedBooks(dataSource, {
        books: [{ ...OWNER, pageCount: OWNER.pageCount + 1 }],
        artifact: BASE,
        ownerSlugTr: BOOK_TIMESTAMPS_OWNER_SLUG_TR,
      });

      expect(result.books.updated).toBe(1);
      expect(result.books.unchanged).toBe(0);
      const bookAfter = await dataSource
        .getRepository(Book)
        .findOneByOrFail({ slugTr: BOOK_TIMESTAMPS_OWNER_SLUG_TR });
      expect(bookAfter.pageCount).toBe(OWNER.pageCount + 1);
      expect(bookAfter.updatedAt.getTime()).toBeGreaterThan(bookBefore.updatedAt.getTime());
    });

    it('REFUSES to drop a deneme without the flag, and rolls the whole run back', async () => {
      const before = await counts();
      // The precondition IS the control: if these rows were not there, "nothing was deleted" would
      // be true for the wrong reason.
      expect(before.videos).toBe(3);
      expect(before.questions).toBe(6);

      const shorter = artifact([
        { denemeNo: 1, youtubeVideoId: 'aaaaaaaaaaa', questions: [0, 30] },
        { denemeNo: 2, youtubeVideoId: 'bbbbbbbbbbb', questions: [5, 40] },
      ]);

      const { cause } = await seedRefusal({
        books: [OWNER],
        artifact: shorter,
        ownerSlugTr: BOOK_TIMESTAMPS_OWNER_SLUG_TR,
      });

      // The refusal has to name the deneme AND the cascade, or an operator cannot tell how much a
      // re-run with the flag would delete.
      // Anchored, not a bare digit: `toContain('3')` matched the '3' in any number, any uuid or any
      // other line of a multi-line refusal, so it asserted almost nothing (`SFH110-M4`).
      expect(cause.message).toMatch(/allow-removals/);
      expect(cause.message).toMatch(/deneme\(s\) 3\b/);
      expect(cause.message).toMatch(/\b1 video row\(s\)/);
      expect(cause.message).toMatch(/\b2 question row\(s\)/);

      // Nothing written: the refusal happens inside the transaction, so the rollback covers the
      // whole run rather than only the deletion.
      expect(await counts()).toEqual(before);
    });

    it('removes the deneme WITH the flag, and the cascade takes its questions', async () => {
      const before = await counts();
      const shorter = artifact([
        { denemeNo: 1, youtubeVideoId: 'aaaaaaaaaaa', questions: [0, 30] },
        { denemeNo: 2, youtubeVideoId: 'bbbbbbbbbbb', questions: [5, 40] },
      ]);

      const result = await seedBooks(dataSource, {
        books: [OWNER],
        artifact: shorter,
        ownerSlugTr: BOOK_TIMESTAMPS_OWNER_SLUG_TR,
        allowRemovals: true,
      });

      expect(result.videos.removed).toBe(1);
      // Counted through the cascade rather than deleted row by row — the reported number has to
      // include rows Postgres removed on our behalf, or the log understates what the run did.
      expect(result.questions.removed).toBe(2);
      const after = await counts();
      expect(after.videos).toBe(before.videos - 1);
      expect(after.questions).toBe(before.questions - 2);
      expect(await dataSource.getRepository(BookVideo).countBy({ denemeNo: 3 })).toBe(0);
    });

    it('refuses a dropped QUESTION without the flag, and removes it with one', async () => {
      const trimmed = artifact([
        { denemeNo: 1, youtubeVideoId: 'aaaaaaaaaaa', questions: [0] },
        { denemeNo: 2, youtubeVideoId: 'bbbbbbbbbbb', questions: [5, 40] },
        { denemeNo: 3, youtubeVideoId: 'ccccccccccc', questions: [7, 50] },
      ]);
      const before = await counts();

      const { cause } = await seedRefusal({
        books: [OWNER],
        artifact: trimmed,
        ownerSlugTr: BOOK_TIMESTAMPS_OWNER_SLUG_TR,
      });
      expect(cause.message).toMatch(/allow-removals/);
      expect(cause.message).toMatch(/question\(s\)/);
      expect(await counts()).toEqual(before);

      const result = await seedBooks(dataSource, {
        books: [OWNER],
        artifact: trimmed,
        ownerSlugTr: BOOK_TIMESTAMPS_OWNER_SLUG_TR,
        allowRemovals: true,
      });
      expect(result.questions.removed).toBe(1);
      expect(result.videos.removed).toBe(0);
      expect((await counts()).questions).toBe(before.questions - 1);
    });

    it('re-keys two videos that SWAP denemeler, without tripping the unique constraint', async () => {
      // The `SFH109-I2` case: both denemeler stay in the artefact, so nothing is removed, and the
      // naive update order assigns an id another surviving row still holds. The parking pass is
      // what makes this survive — and it must leave no parked row behind.
      const swapped = artifact([
        { denemeNo: 1, youtubeVideoId: 'bbbbbbbbbbb', questions: [0, 30] },
        { denemeNo: 2, youtubeVideoId: 'aaaaaaaaaaa', questions: [5, 40] },
        { denemeNo: 3, youtubeVideoId: 'ccccccccccc', questions: [7, 50] },
      ]);

      const result = await seedBooks(dataSource, {
        books: [OWNER],
        artifact: swapped,
        ownerSlugTr: BOOK_TIMESTAMPS_OWNER_SLUG_TR,
      });

      expect(result.videos.updated).toBe(2);
      expect(result.videos.removed).toBe(0);
      // No parking id survives the transaction. A leftover would be invisible to every other
      // assertion and would poison the next run.
      const parked = (await dataSource.getRepository(BookVideo).find()).filter((row) =>
        row.youtubeVideoId.startsWith('__park'),
      );
      expect(parked).toEqual([]);
      const rows = await dataSource.getRepository(BookVideo).find({ order: { denemeNo: 'ASC' } });
      expect(rows.map((row) => `${String(row.denemeNo)}:${row.youtubeVideoId}`)).toEqual([
        '1:bbbbbbbbbbb',
        '2:aaaaaaaaaaa',
        '3:ccccccccccc',
      ]);
    });

    it('refuses to re-key when a leftover row already holds a parking id', async () => {
      const repo = dataSource.getRepository(BookVideo);
      const book = await dataSource
        .getRepository(Book)
        .findOneByOrFail({ slugTr: BOOK_TIMESTAMPS_OWNER_SLUG_TR });
      // A row left over from an interrupted run. Parking ids are reserved and never seeded, so a
      // row holding one must be inspected rather than silently overwritten.
      //
      // **The fixture has to keep this row OUT of the removal pass, and getting that wrong is what
      // makes the test vacuous.** Removals run BEFORE the parking check, so a leftover row whose
      // deneme is absent from the artefact is simply deleted (with `--allow-removals`) or turns
      // this into a removal refusal (without it) — either way the parking guard never runs. So the
      // artefact carries deneme 4 holding that very id: the row is then neither stale nor a mover,
      // and it survives to collide with the parking id the two SWAPPED rows need.
      await repo.save(repo.create({ bookId: book.id, denemeNo: 4, youtubeVideoId: '__park00001' }));

      const swapped = artifact([
        { denemeNo: 1, youtubeVideoId: 'bbbbbbbbbbb', questions: [0, 30] },
        { denemeNo: 2, youtubeVideoId: 'aaaaaaaaaaa', questions: [5, 40] },
        { denemeNo: 3, youtubeVideoId: 'ccccccccccc', questions: [7, 50] },
        { denemeNo: 4, youtubeVideoId: '__park00001', questions: [9] },
      ]);

      const before = await counts();
      const idsBefore = (await repo.find({ order: { denemeNo: 'ASC' } })).map(
        (row) => `${String(row.denemeNo)}:${row.youtubeVideoId}`,
      );

      const { cause } = await seedRefusal({
        books: [OWNER],
        artifact: swapped,
        ownerSlugTr: BOOK_TIMESTAMPS_OWNER_SLUG_TR,
      });
      expect(cause.message).toMatch(/parking id/);
      // It must name the ids it refused to use, or "inspect the leftover row" is an instruction
      // with nothing to act on.
      expect(cause.message).toContain('__park00001');

      // **The ROLLBACK, which this case did not assert** (`TEST110-M5`). The refusal fires midway
      // through `seedVideoRows`, after the book row has been touched and possibly after some rows
      // were parked — so "it threw" is not the same as "it left nothing behind". A half-parked
      // table is precisely the state the refusal message tells an operator to go inspect.
      expect(await counts()).toEqual(before);
      expect(
        (await repo.find({ order: { denemeNo: 'ASC' } })).map(
          (row) => `${String(row.denemeNo)}:${row.youtubeVideoId}`,
        ),
      ).toEqual(idsBefore);
    });
  });

  /**
   * The schema's own refusals — the matrices `InitBookCatalogue`'s docblock specifies in prose.
   *
   * Driven with raw parameterised SQL rather than the repository, because what is under test is the
   * DATABASE constraint: an ORM-level guard passing would prove nothing about what a migration, a
   * future admin path or a hand-run `UPDATE` can write.
   */
  describe('constraint matrices', () => {
    let bookId: string;

    beforeAll(async () => {
      // Raw DELETE rather than `repository.delete({})`: TypeORM refuses empty criteria, and the FK
      // cascade is what clears the two child tables.
      await dataSource.query('DELETE FROM books');
      await seedBooks(dataSource, {
        books: [OWNER],
        artifact: BASE,
        ownerSlugTr: BOOK_TIMESTAMPS_OWNER_SLUG_TR,
      });
      const book = await dataSource
        .getRepository(Book)
        .findOneByOrFail({ slugTr: BOOK_TIMESTAMPS_OWNER_SLUG_TR });
      bookId = book.id;
    }, 120_000);

    /**
     * Restore the row every case mutates, BEFORE each case rather than after.
     *
     * These cases probe constraints by writing values and reading the refusal, so each one leaves
     * the row dirty and used to clean up on its own last line — which only runs when the case
     * PASSES. One failure mid-case therefore leaked its value into every later case and turned one
     * red into a cascade whose first failure was the only real one (`TEST110-M5`). Resetting up
     * front makes each case independent of its predecessors' outcomes, not just of their intentions.
     */
    beforeEach(async () => {
      await dataSource.query(
        `UPDATE books SET cover_image_path = NULL, purchase_url = NULL, isbn13 = $2,
           page_count = $3, deneme_count = $4, author_names = $5 WHERE id = $1`,
        [bookId, OWNER.isbn13, OWNER.pageCount, OWNER.denemeCount, [...OWNER.authorNames]],
      );
      await dataSource.query('DELETE FROM book_videos WHERE deneme_no >= 700');
      await dataSource.query('DELETE FROM book_video_questions WHERE question_no >= 50');
    });

    /** Sets one column on the seeded book row; resolves true when Postgres accepted the value. */
    async function accepts(column: string, value: unknown): Promise<boolean> {
      try {
        await dataSource.query(`UPDATE books SET ${column} = $1 WHERE id = $2`, [value, bookId]);
        return true;
      } catch {
        return false;
      }
    }

    it('cover_image_path refuses every value that can reach a foreign origin', async () => {
      // Verbatim from the migration's recorded matrix. The first two are the reason the obvious
      // formulation (`LIKE '/%' AND NOT LIKE '%://%'`) was refuted: a browser resolves both
      // remotely, and both pass that pair.
      const mustReject = [
        '//cdn.example.com/kapak.jpg',
        '/\\cdn.example.com/kapak.jpg',
        'https://cdn.example.com/x.jpg',
        'kapak.jpg',
        '/',
      ];
      for (const value of mustReject) {
        expect(`${value} accepted=${String(await accepts('cover_image_path', value))}`).toBe(
          `${value} accepted=false`,
        );
      }

      // POSITIVE CONTROL — the expression is not vacuously false.
      expect(await accepts('cover_image_path', '/kitaplar/x.jpg')).toBe(true);

      // What the alphabet deliberately ADMITS, recorded so a later reader can tell "allowed on
      // purpose" from "not considered". None reaches a foreign origin: a reference whose second
      // character is not `/` is path-absolute and inherits our own authority.
      for (const value of [
        '/../../../etc/passwd',
        '/./../evil',
        '/.//cdn.example.com/x.jpg',
        // The fourth cell the migration records and this suite had omitted (`TEST110-M1`): a
        // non-empty first segment makes the reference path-absolute, so it inherits our own
        // authority rather than reaching `cdn.example.com`.
        '/a//cdn.example.com/x.jpg',
      ]) {
        expect(`${value} accepted=${String(await accepts('cover_image_path', value))}`).toBe(
          `${value} accepted=true`,
        );
      }
      await dataSource.query('UPDATE books SET cover_image_path = NULL WHERE id = $1', [bookId]);
    });

    it('purchase_url requires https, refusing script, data and mixed-content destinations', async () => {
      for (const value of [
        'http://example.com/x',
        'javascript:alert(1)',
        'data:text/html,x',
        '//example.com/x',
      ]) {
        expect(`${value} accepted=${String(await accepts('purchase_url', value))}`).toBe(
          `${value} accepted=false`,
        );
      }
      expect(await accepts('purchase_url', 'https://example.com/x')).toBe(true);
      await dataSource.query('UPDATE books SET purchase_url = NULL WHERE id = $1', [bookId]);
    });

    it('author_names refuses an empty array — and admits a blank entry, on purpose', async () => {
      // `cardinality()` rather than `array_length(…, 1)`: the latter returns NULL for `'{}'`, and a
      // CHECK whose expression is NULL is not a violation, so the obvious form would accept exactly
      // the value it was written to reject.
      expect(await accepts('author_names', [])).toBe(false);
      // Admitted by design: a blank entry is a SEEDING defect the database deliberately does not
      // chase, and the acceptance is recorded rather than discovered. All three documented accept
      // cells now run — `{''}`, `{'   '}` and `{NULL}` — because "what it deliberately admits" is
      // half the matrix and the half a later reader cannot reconstruct (`TEST110-M1`).
      expect(await accepts('author_names', [''])).toBe(true);
      expect(await accepts('author_names', ['   '])).toBe(true);
      expect(await accepts('author_names', [null])).toBe(true);
      expect(await accepts('author_names', ['Fixture'])).toBe(true);
    });

    it('isbn13, page_count and deneme_count hold their shape', async () => {
      expect(await accepts('isbn13', '978625949006')).toBe(false); // 12 digits, blank-padded
      expect(await accepts('isbn13', '97862594900AB')).toBe(false);
      expect(await accepts('isbn13', '9780000000001')).toBe(true);
      expect(await accepts('page_count', 0)).toBe(false);
      expect(await accepts('page_count', 144)).toBe(true);
      expect(await accepts('deneme_count', 0)).toBe(false);
      expect(await accepts('deneme_count', 40)).toBe(true);
    });

    it('book_videos pins the 11-character id alphabet and one video per book', async () => {
      const insert = async (denemeNo: number, videoId: string): Promise<boolean> => {
        try {
          await dataSource.query(
            'INSERT INTO book_videos (book_id, deneme_no, youtube_video_id) VALUES ($1, $2, $3)',
            [bookId, denemeNo, videoId],
          );
          return true;
        } catch {
          return false;
        }
      };

      expect(await insert(701, 'tooshort')).toBe(false);
      expect(await insert(702, 'has space!!')).toBe(false);
      expect(await insert(703, 'okvideoid01')).toBe(true); // POSITIVE CONTROL
      // The same video under a second deneme: one set of start seconds would be published twice and
      // only one could be right.
      expect(await insert(704, 'okvideoid01')).toBe(false);
      // Range bound on the deneme number itself — BOTH ends. Only the upper one ran before
      // (`TEST110-M1`), and a `CHECK (deneme_no <= 999)` typo would have passed that half.
      expect(await insert(1000, 'okvideoid02')).toBe(false);
      expect(await insert(0, 'okvideoid03')).toBe(false);

      await dataSource.query('DELETE FROM book_videos WHERE deneme_no >= 700');
    });

    it('book_video_questions refuses a negative second and a zero question number', async () => {
      const video = await dataSource
        .getRepository(BookVideo)
        .findOneOrFail({ where: { bookId }, order: { denemeNo: 'ASC' } });
      const insert = async (questionNo: number, startSecond: number): Promise<boolean> => {
        try {
          await dataSource.query(
            'INSERT INTO book_video_questions (book_video_id, question_no, start_second) VALUES ($1, $2, $3)',
            [video.id, questionNo, startSecond],
          );
          return true;
        } catch {
          return false;
        }
      };

      expect(await insert(0, 10)).toBe(false);
      expect(await insert(50, -1)).toBe(false);
      // POSITIVE CONTROL — and 0 is a legal second, not a sentinel.
      expect(await insert(50, 0)).toBe(true);
      // The same question number twice on one video.
      expect(await insert(50, 99)).toBe(false);

      await dataSource.query('DELETE FROM book_video_questions WHERE question_no >= 50');
    });
  });
});
