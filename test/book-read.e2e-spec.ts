import { afterAll, afterEach, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { ExamTrack } from '../src/book/book.types';
import {
  BOOK_LIST_DEFAULT_PAGE,
  BOOK_LIST_DEFAULT_PAGE_SIZE,
  BOOK_LIST_MAX_PAGE,
  BOOK_LIST_MAX_PAGE_SIZE,
} from '../src/book/dto/book-list-query.dto';
import { BookVideoQuestion } from '../src/book/entities/book-video-question.entity';
import { BookVideo } from '../src/book/entities/book-video.entity';
import { Book } from '../src/book/entities/book.entity';
import { applyGlobalPrefix } from '../src/common/bootstrap';
import { buildDataSourceOptions } from '../src/database/data-source-options';
import { seedBooks } from '../src/database/seeds/seed-books';

/**
 * B3 read-path e2e — the two public book endpoints against a REAL Postgres.
 *
 * ## Structural only (`CONVENTIONS.md` §2)
 * Nothing here asserts a book fact. Not a deneme count, not a start second, not a title. Every
 * case is about SHAPE and INVARIANTS: envelope keys, ordering, gaplessness, count agreement, cache
 * headers, status codes and the zero-external-call rule. The counts are asserted against the arrays
 * the same response served, never against a number typed into this file — a test that hardcoded 30
 * would have to be edited by the PR that re-measures the index, which is precisely how a fidelity
 * test turns into a rubber stamp.
 *
 * The four pagination numbers ARE imported rather than retyped, for the same reason
 * `throttle.e2e-spec.ts` imports `THROTTLE_LIMIT`: a copy here would silently stop testing the real
 * ceiling the day somebody tuned it.
 *
 * ## Phase order is state, and it only moves forward
 * One container, one migration run. Phase 0 needs the EMPTY store and is the only phase that can
 * ever see it; phase 1 seeds the committed corpus; phase 2 adds synthetic rows for pagination and
 * never removes them, so it runs last.
 */

/** SPEC §6.1, pinned verbatim — a caching-contract change must fail a test, not slip through. */
const BOOK_CACHE_CONTROL = 'public, max-age=300, stale-while-revalidate=86400';

interface ListItem {
  slugTr: string;
  slugEn: string;
  titleTr: string;
  publisherName: string;
  examTrack: string;
  coverImagePath: string | null;
  videoCount: number;
  questionCount: number;
  displayOrder: number;
  updatedAt: string;
}

interface ListEnvelope {
  items: ListItem[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}

interface Detail extends ListItem {
  titleEn: string | null;
  authorNames: string[];
  isbn13: string;
  pageCount: number;
  denemeCount: number;
  introTr: string;
  introEn: string | null;
  metaTitleTr: string;
  metaDescriptionTr: string;
  youtubeChannelId: string;
  youtubePlaylistId: string | null;
  purchaseUrl: string | null;
  coverage: {
    videoCount: number;
    questionCount: number;
    denemeNumbers: number[];
    denemeCount: number;
  };
  videos: {
    denemeNo: number;
    youtubeVideoId: string;
    questions: { questionNo: number; startSecond: number }[];
    youtube: unknown;
  }[];
  attribution: {
    providerId: string;
    providerName: string;
    requiredNoticeTr: string;
    licenceUrl: string | null;
    channelUrl: string | null;
  }[];
}

describe('Book read path (e2e, real Postgres)', () => {
  let container: StartedPostgreSqlContainer;
  let dataSource: DataSource;
  let app: INestApplication | null = null;
  let fetchSpy: jest.SpiedFunction<typeof fetch> | null = null;

  /** A fresh application per phase, with the SAME global pipe `main.ts` installs. */
  async function bootApp(): Promise<INestApplication> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const appModule = require('../src/app.module') as typeof import('../src/app.module');
    const moduleRef = await Test.createTestingModule({ imports: [appModule.AppModule] }).compile();
    const created = moduleRef.createNestApplication();
    applyGlobalPrefix(created);
    created.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await created.init();
    fetchSpy = jest.spyOn(globalThis, 'fetch');
    fetchSpy.mockClear();
    return created;
  }

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
    const url = container.getConnectionUri();
    process.env.DATABASE_URL = url;
    process.env.WEB_ORIGIN = 'http://localhost:3000';

    dataSource = new DataSource(buildDataSourceOptions(url));
    await dataSource.initialize();
    await dataSource.runMigrations();
    // NOT seeded here: phase 0 owns the empty store.
  }, 300_000);

  afterEach(async () => {
    fetchSpy?.mockRestore();
    fetchSpy = null;
    await app?.close();
    app = null;
  });

  afterAll(async () => {
    if (dataSource.isInitialized) await dataSource.destroy();
    await container.stop();
  });

  /**
   * The observable half of SPEC §13 invariant 12.
   *
   * `BOOKS_ENABLED` itself is B4's (`DEC 2026-08-15h` item 1): the flag closes the INGEST half, not
   * the endpoints, so what the invariant actually describes — an unseeded store answering an empty
   * list and a 404 — is reachable today and is asserted here rather than deferred.
   */
  describe('phase 0 — migrated, NOTHING seeded', () => {
    it('answers an empty envelope, not an error and not a 404', async () => {
      app = await bootApp();
      const response = await request(app.getHttpServer()).get('/api/books').expect(200);

      const body = response.body as ListEnvelope;
      expect(body.items).toEqual([]);
      expect(body.total).toBe(0);
      expect(body.hasMore).toBe(false);
      // The defaults are the CONTRACT's, echoed back even on an empty store.
      expect(body.page).toBe(BOOK_LIST_DEFAULT_PAGE);
      expect(body.pageSize).toBe(BOOK_LIST_DEFAULT_PAGE_SIZE);
      // An empty catalogue is a SEED state, not an outage, so it is cacheable like any other read.
      expect(response.headers['cache-control']).toBe(BOOK_CACHE_CONTROL);
    });

    it('answers 404 for any slug, and does NOT let that 404 be cached', async () => {
      app = await bootApp();
      const response = await request(app.getHttpServer())
        .get('/api/books/ayt-cografya-konu-ozetli-brans-denemeleri')
        .expect(404);

      // The whole reason `@CacheControl` exists instead of `@Header`: a 404 for a book that has not
      // been seeded YET must not be pinned in a CDN for five minutes, or the page stays missing for
      // a cache window after the seed lands. The interceptor sets the header inside `tap` on the
      // success stream, so an error notification skips it — asserted, not assumed.
      expect(response.headers['cache-control']).toBeUndefined();
    });
  });

  describe('phase 1 — the committed corpus seeded', () => {
    beforeAll(async () => {
      await seedBooks(dataSource);
    }, 120_000);

    it('serves the hub envelope with exactly the core five and no meta', async () => {
      app = await bootApp();
      const response = await request(app.getHttpServer()).get('/api/books').expect(200);

      // `ENGINEERING.md` §2: a list response carries EXACTLY these five at the top level, and a
      // list with no endpoint-specific fields carries no `meta` at all. Asserted as a whole key set
      // rather than key-by-key, so an added top-level field fails here instead of shipping.
      expect(Object.keys(response.body as object).sort()).toEqual([
        'hasMore',
        'items',
        'page',
        'pageSize',
        'total',
      ]);
      const body = response.body as ListEnvelope;
      expect(body.items.length).toBeGreaterThan(0);
      expect(body.total).toBe(body.items.length);
      expect(body.hasMore).toBe(false);
      expect(response.headers['cache-control']).toBe(BOOK_CACHE_CONTROL);
    });

    it('serves a detail payload whose counts agree with the arrays it just served', async () => {
      app = await bootApp();
      const list = await request(app.getHttpServer()).get('/api/books').expect(200);
      const first = (list.body as ListEnvelope).items[0];
      if (first === undefined) throw new Error('no book seeded');

      const response = await request(app.getHttpServer())
        .get(`/api/books/${first.slugTr}`)
        .expect(200);
      const body = response.body as Detail;

      // The count agreement is the real assertion: `videoCount` and `questionCount` are published
      // TWICE (inherited at the top level and inside `coverage`) and the DTO requires both to come
      // from ONE computation. Comparing them against the served arrays catches the drift AND the
      // pg `bigint`-as-string trap in one case — `"30" === 30` is false.
      expect(body.videos.length).toBeGreaterThan(0);
      expect(body.videoCount).toBe(body.videos.length);
      expect(body.coverage.videoCount).toBe(body.videos.length);
      const questionTotal = body.videos.reduce((sum, video) => sum + video.questions.length, 0);
      expect(questionTotal).toBeGreaterThan(0);
      expect(body.questionCount).toBe(questionTotal);
      expect(body.coverage.questionCount).toBe(questionTotal);
      // Types, not just values: a string that happens to compare equal would still break the web
      // repo's generated `number` type.
      expect(typeof body.videoCount).toBe('number');
      expect(typeof body.questionCount).toBe('number');

      // The list item for the same book must agree with the detail it summarises.
      expect(first.videoCount).toBe(body.videoCount);
      expect(first.questionCount).toBe(body.questionCount);
      expect(response.headers['cache-control']).toBe(BOOK_CACHE_CONTROL);
    });

    it('orders denemeler ascending and every question index gaplessly ascending', async () => {
      app = await bootApp();
      const list = await request(app.getHttpServer()).get('/api/books').expect(200);
      const first = (list.body as ListEnvelope).items[0];
      if (first === undefined) throw new Error('no book seeded');
      const body = (
        await request(app.getHttpServer()).get(`/api/books/${first.slugTr}`).expect(200)
      ).body as Detail;

      // SPEC §13 invariant 3, asserted on the SERVED payload. The service orders in SQL and does
      // not re-sort in the mapper, precisely so this case can fail when the ordering breaks.
      const denemeNumbers = body.videos.map((video) => video.denemeNo);
      expect(denemeNumbers.length).toBeGreaterThan(0);
      expect([...denemeNumbers].sort((a, b) => a - b)).toEqual(denemeNumbers);
      // `coverage.denemeNumbers` publishes the same set, in the same order.
      expect(body.coverage.denemeNumbers).toEqual(denemeNumbers);

      for (const video of body.videos) {
        expect(video.questions.length).toBeGreaterThan(0);

        // Gapless FROM 1 — a missing question number is a silent hole in the index. The whole
        // sequence is compared at once so a failure prints the actual series, not just "false".
        expect(
          `deneme ${String(video.denemeNo)}: ${video.questions.map((q) => q.questionNo).join(',')}`,
        ).toBe(
          `deneme ${String(video.denemeNo)}: ${video.questions.map((_q, index) => index + 1).join(',')}`,
        );

        // STRICTLY ascending start seconds. Not `>=`: two questions sharing a second means one of
        // them jumps the reader to the wrong solution, and every range check still passes.
        const seconds = video.questions.map((question) => question.startSecond);
        const ascending = seconds.every(
          (second, index) => index === 0 || second > (seconds[index - 1] ?? -1),
        );
        expect(
          `deneme ${String(video.denemeNo)} ascending=${String(ascending)} [${seconds.join(',')}]`,
        ).toBe(`deneme ${String(video.denemeNo)} ascending=true [${seconds.join(',')}]`);

        // DO NOT assume the first question starts at 0 — the measured set is {0, 2, 6, 11, 94}, so
        // 0 is an ordinary value rather than a sentinel. Only non-negativity is an invariant.
        expect(seconds.every((second) => Number.isInteger(second) && second >= 0)).toBe(true);
        // SPEC §13 invariant 4, on the served id rather than on the column.
        expect(video.youtubeVideoId).toMatch(/^[A-Za-z0-9_-]{11}$/);
      }
    });

    it('serves youtube: null on every video — the designed B3 state, not a gap', async () => {
      app = await bootApp();
      const list = await request(app.getHttpServer()).get('/api/books').expect(200);
      const first = (list.body as ListEnvelope).items[0];
      if (first === undefined) throw new Error('no book seeded');
      const body = (
        await request(app.getHttpServer()).get(`/api/books/${first.slugTr}`).expect(200)
      ).body as Detail;

      // `DEC 2026-08-15h` item 2: the snapshot serving path is B4's. Asserted rather than left
      // implicit so that the day B4 starts populating it, this case fails and forces a decision
      // instead of letting the change land unnoticed.
      expect(body.videos.length).toBeGreaterThan(0);
      expect(body.videos.every((video) => video.youtube === null)).toBe(true);
    });

    it('populates attribution on every response while the snapshot table is EMPTY', async () => {
      app = await bootApp();
      const list = await request(app.getHttpServer()).get('/api/books').expect(200);
      const first = (list.body as ListEnvelope).items[0];
      if (first === undefined) throw new Error('no book seeded');

      // The precondition is the point of the case (SPEC §18 acceptance 6): the credit must not
      // depend on provider data existing. Asserted rather than assumed, so the case cannot quietly
      // become vacuous if B4 later seeds snapshots into this suite.
      const snapshotCount = await dataSource.query<{ count: string }[]>(
        'SELECT COUNT(*)::text AS count FROM youtube_video_snapshots',
      );
      expect(snapshotCount[0]?.count).toBe('0');

      const body = (
        await request(app.getHttpServer()).get(`/api/books/${first.slugTr}`).expect(200)
      ).body as Detail;

      expect(body.attribution.length).toBeGreaterThan(0);
      // Both duties, always both: the YouTube source credit and the content-partner credit. Neither
      // substitutes for the other, so a response carrying one is a breach and not a degradation.
      expect(body.attribution.map((row) => row.providerId).sort()).toEqual(['partner', 'youtube']);
      for (const row of body.attribution) {
        expect(`${row.providerId}.notice=${String(row.requiredNoticeTr.length > 0)}`).toBe(
          `${row.providerId}.notice=true`,
        );
        expect(`${row.providerId}.name=${String(row.providerName.length > 0)}`).toBe(
          `${row.providerId}.name=true`,
        );
        // Composed from the stored channel id (`DEC 2026-08-15h` item 4).
        expect(row.channelUrl).toContain(body.youtubeChannelId);
      }
    });

    it('resolves the TR slug and the EN slug to the same book', async () => {
      // **This case needs a book whose two slugs DIFFER, and the seeded one does not have that.**
      // The committed book carries `slugTr === slugEn` deliberately (a product name is not
      // translated), so asking twice with `first.slugTr` and `first.slugEn` sent the identical
      // string twice: the EN branch of the `where: [{slugTr}, {slugEn}]` lookup was never
      // exercised and the case could not fail (PR #110 review, `SFH110-M3`). A dedicated fixture
      // is what makes it a test.
      const repo = dataSource.getRepository(Book);
      await repo.save(
        repo.create({
          slugTr: 'zz-iki-slug-tr',
          slugEn: 'zz-two-slugs-en',
          titleTr: 'Slug fixture',
          titleEn: null,
          publisherName: 'Fixture',
          authorNames: ['Ada Lovelace'],
          isbn13: '9999999999993',
          pageCount: 1,
          examTrack: ExamTrack.Ayt,
          denemeCount: 1,
          coverImagePath: null,
          purchaseUrl: null,
          introTr: 'Fixture.',
          introEn: null,
          metaTitleTr: 'Fixture',
          metaDescriptionTr: 'Fixture',
          youtubePlaylistId: null,
          youtubeChannelId: 'UC_fixture_channel',
          displayOrder: 9998,
        }),
      );

      app = await bootApp();
      const viaTr = (
        await request(app.getHttpServer()).get('/api/books/zz-iki-slug-tr').expect(200)
      ).body as Detail;
      const viaEn = (
        await request(app.getHttpServer()).get('/api/books/zz-two-slugs-en').expect(200)
      ).body as Detail;

      // The two requests sent DIFFERENT strings, so this equality is evidence rather than tautology.
      expect(viaTr.isbn13).toBe(viaEn.isbn13);
      expect(viaEn.slugTr).toBe('zz-iki-slug-tr');
      expect(viaTr.slugEn).toBe('zz-two-slugs-en');
    });

    it('serves a book with NO videos as a complete payload, not an error', async () => {
      // The service has an explicit `videos.length === 0` branch (it skips the `IN ()` query, which
      // is invalid SQL) and an `EMPTY_STATS` fallback for a book absent from the aggregate — and no
      // test reached either, though fixtures without videos already existed (`TEST110-M3`).
      // A künye seeded before its question index is a real, ordinary state, not a defect.
      app = await bootApp();
      const body = (await request(app.getHttpServer()).get('/api/books/zz-iki-slug-tr').expect(200))
        .body as Detail;

      expect(body.videos).toEqual([]);
      expect(body.videoCount).toBe(0);
      expect(body.questionCount).toBe(0);
      expect(body.coverage.videoCount).toBe(0);
      expect(body.coverage.questionCount).toBe(0);
      expect(body.coverage.denemeNumbers).toEqual([]);
      // `denemeCount` is a künye fact and must NOT collapse with coverage: the book still has its
      // denemeler, we simply index none of their solutions.
      expect(body.coverage.denemeCount).toBeGreaterThan(0);
      // The credit does not depend on there being videos to credit.
      expect(body.attribution.map((row) => row.providerId).sort()).toEqual(['partner', 'youtube']);
      // With no child rows, `updatedAt` collapses to the book row's own stamp — still a real
      // instant, never null or a build time.
      expect(Number.isNaN(new Date(body.updatedAt).getTime())).toBe(false);
    });

    it('makes ZERO external calls on either request path', async () => {
      // SPEC §13 invariant 6. Both endpoints read Postgres and nothing else; the counting spy is
      // what turns that from a claim in a docblock into a test.
      app = await bootApp();
      const list = await request(app.getHttpServer()).get('/api/books').expect(200);
      const first = (list.body as ListEnvelope).items[0];
      if (first === undefined) throw new Error('no book seeded');
      await request(app.getHttpServer()).get(`/api/books/${first.slugTr}`).expect(200);

      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('publishes updatedAt as the newest of the book and its children', async () => {
      app = await bootApp();
      const before = (await request(app.getHttpServer()).get('/api/books').expect(200))
        .body as ListEnvelope;
      const first = before.items[0];
      if (first === undefined) throw new Error('no book seeded');

      const bookRow = await dataSource
        .getRepository(Book)
        .findOneByOrFail({ slugTr: first.slugTr });
      // The published value must be at least the book row's own timestamp...
      expect(new Date(first.updatedAt).getTime()).toBeGreaterThanOrEqual(
        bookRow.updatedAt.getTime(),
      );

      // ...and must MOVE when only a child row changes. This is the whole reason the value is a
      // GREATEST across three tables: a re-measurement updates questions and deliberately leaves
      // `books.updated_at` alone, so a service reading only the book row would report "unchanged"
      // on the day the entire question index changed. Asserting the before-state too is what makes
      // this a real control rather than a coincidence.
      const questionRepo = dataSource.getRepository(BookVideoQuestion);
      const videoRow = await dataSource
        .getRepository(BookVideo)
        .findOneOrFail({ where: { bookId: bookRow.id }, order: { denemeNo: 'ASC' } });
      // The LAST question of that video: incrementing its second cannot collide with a following
      // one, so the strictly-ascending invariant this suite also asserts stays true throughout.
      const question = await questionRepo.findOneOrFail({
        where: { bookVideoId: videoRow.id },
        order: { questionNo: 'DESC' },
      });
      question.startSecond += 1;
      await questionRepo.save(question);

      const after = (await request(app.getHttpServer()).get('/api/books').expect(200))
        .body as ListEnvelope;
      const sameBook = after.items.find((item) => item.slugTr === first.slugTr);
      if (sameBook === undefined) throw new Error('book vanished between reads');
      expect(new Date(sameBook.updatedAt).getTime()).toBeGreaterThan(
        new Date(first.updatedAt).getTime(),
      );

      // Restore the value, so later phases see the corpus they expect. `updated_at` stays moved —
      // that is honest: the row really was written twice.
      question.startSecond -= 1;
      await questionRepo.save(question);
    });
  });

  describe('phase 2 — query contract and pagination', () => {
    /**
     * Two synthetic books sharing ONE `displayOrder`.
     *
     * The tie is the point: `display_order` is hand-assigned and may repeat, and offset pagination
     * over a partial order can serve the same row on two pages while skipping another. Inserted
     * through the repository rather than the seed because the READ path is what is under test —
     * the seed's editorial invariants guard a different thing and fighting them here would only
     * make the fixture harder to read.
     */
    beforeAll(async () => {
      const repo = dataSource.getRepository(Book);
      for (const suffix of ['alpha', 'beta']) {
        await repo.save(
          repo.create({
            slugTr: `zz-pagination-${suffix}`,
            slugEn: `zz-pagination-${suffix}-en`,
            titleTr: `Pagination fixture ${suffix}`,
            titleEn: null,
            publisherName: 'Fixture',
            authorNames: ['Fixture Author'],
            isbn13: suffix === 'alpha' ? '9999999999991' : '9999999999992',
            pageCount: 1,
            examTrack: ExamTrack.Ayt,
            denemeCount: 1,
            coverImagePath: null,
            purchaseUrl: null,
            introTr: 'Fixture.',
            introEn: null,
            metaTitleTr: 'Fixture',
            metaDescriptionTr: 'Fixture',
            youtubePlaylistId: null,
            youtubeChannelId: 'UC_fixture_channel',
            displayOrder: 9999,
          }),
        );
      }
    }, 60_000);

    it('never serves the same book on two pages when displayOrder ties', async () => {
      app = await bootApp();
      const seen: string[] = [];
      let page = 1;
      let hasMore = true;
      while (hasMore && page <= 20) {
        const body = (
          await request(app.getHttpServer()).get(`/api/books?page=${String(page)}&pageSize=1`)
        ).body as ListEnvelope;
        seen.push(...body.items.map((item) => item.slugTr));
        hasMore = body.hasMore;
        page += 1;
      }
      // Paging with pageSize=1 must visit every book EXACTLY once. A partial order would either
      // repeat a slug here or drop one, and both show up as a length mismatch against the set.
      expect(seen.length).toBeGreaterThan(1);
      expect(new Set(seen).size).toBe(seen.length);

      const all = (await request(app.getHttpServer()).get('/api/books').expect(200))
        .body as ListEnvelope;
      expect(seen.length).toBe(all.total);
      expect([...seen].sort()).toEqual(all.items.map((item) => item.slugTr).sort());
    });

    it('answers a page past the end with an empty list and 200, never 404', async () => {
      app = await bootApp();
      const body = (
        await request(app.getHttpServer())
          .get(`/api/books?page=${String(BOOK_LIST_MAX_PAGE)}`)
          .expect(200)
      ).body as ListEnvelope;
      expect(body.items).toEqual([]);
      expect(body.hasMore).toBe(false);
      expect(body.total).toBeGreaterThan(0);
    });

    it('rejects every out-of-contract query, and unknown parameters too', async () => {
      app = await bootApp();
      const rejected: [string, string][] = [
        [`?pageSize=${String(BOOK_LIST_MAX_PAGE_SIZE + 1)}`, 'pageSize above the ceiling'],
        [`?page=${String(BOOK_LIST_MAX_PAGE + 1)}`, 'page above the ceiling'],
        ['?page=0', 'page below 1'],
        ['?pageSize=0', 'pageSize below 1'],
        ['?page=1.5', 'non-integer page'],
        ['?page=abc', 'non-numeric page'],
        ['?page=', 'empty page'],
        ['?utm_source=newsletter', 'unknown parameter'],
      ];
      expect(rejected.length).toBeGreaterThan(0);
      for (const [query, label] of rejected) {
        const response = await request(app.getHttpServer()).get(`/api/books${query}`);
        expect(`${label} → ${String(response.status)}`).toBe(`${label} → 400`);
      }

      // The positive control for the whole table: the SAME request shape, but in contract, must
      // pass. Without it, a route that 400s unconditionally would satisfy every case above and this
      // test would report a green on a completely broken endpoint.
      const inContract = `/api/books?page=${String(BOOK_LIST_DEFAULT_PAGE)}&pageSize=${String(BOOK_LIST_MAX_PAGE_SIZE)}`;
      const ok = await request(app.getHttpServer()).get(inContract);
      expect(`control ${inContract} → ${String(ok.status)}`).toBe(`control ${inContract} → 200`);
    });

    it('separates a malformed slug (400) from a well-formed unknown one (404)', async () => {
      app = await bootApp();
      // Malformed: uppercase and an underscore are outside `GLOSSARY.md` §5's alphabet.
      await request(app.getHttpServer()).get('/api/books/NOT_A_SLUG').expect(400);
      await request(app.getHttpServer())
        .get(`/api/books/${'x'.repeat(141)}`)
        .expect(400);
      // Well-formed, matches nothing.
      await request(app.getHttpServer()).get('/api/books/no-such-book').expect(404);
    });
  });
});
