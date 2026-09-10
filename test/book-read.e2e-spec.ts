import { afterAll, afterEach, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { YOUTUBE_CHANNEL_URL } from '../src/book/book-attribution.catalogue';
import { ExamTrack } from '../src/book/book.types';
import {
  BOOK_LIST_DEFAULT_PAGE,
  BOOK_LIST_DEFAULT_PAGE_SIZE,
  BOOK_LIST_MAX_PAGE,
  BOOK_LIST_MAX_PAGE_SIZE,
} from '../src/book/dto/book-list-query.dto';
import { BookVideoTag } from '../src/book/entities/book-video-tag.entity';
import { BookVideo } from '../src/book/entities/book-video.entity';
import { Book } from '../src/book/entities/book.entity';
import { applyGlobalPrefix } from '../src/common/bootstrap';
import { buildDataSourceOptions } from '../src/database/data-source-options';
import { BOOK_TIMESTAMPS_OWNER_SLUG_TR } from '../src/database/seeds/books.seed-data';
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
  introTr: string;
  introEn: string | null;
  metaTitleTr: string;
  metaDescriptionTr: string;
  youtubeChannelId: string;
  youtubePlaylistId: string | null;
  purchaseUrl: string | null;
  videos: {
    bookVideoId: string;
    orderNo: number;
    titleTr: string | null;
    titleEn: string | null;
    youtubeVideoId: string;
    tags: { orderNo: number; startSecond: number; nameTr: string | null; nameEn: string | null }[];
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

    it('serves a detail payload whose video array agrees with the list item it summarises', async () => {
      // P0 PR-3 removed every count from this contract (`DEC 2026-09-10c` md.1) — `videoCount`,
      // `questionCount` and the whole `coverage` object are gone, so the count-agreement case this
      // replaces has no field left to assert. What remains worth asserting here is that the two
      // published views of one book (the list item and the detail) still describe the SAME row.
      app = await bootApp();
      const list = await request(app.getHttpServer()).get('/api/books').expect(200);
      const first = (list.body as ListEnvelope).items[0];
      if (first === undefined) throw new Error('no book seeded');

      const response = await request(app.getHttpServer())
        .get(`/api/books/${first.slugTr}`)
        .expect(200);
      const body = response.body as Detail;

      expect(body.videos.length).toBeGreaterThan(0);
      expect(body.slugTr).toBe(first.slugTr);
      expect(body.updatedAt).toBe(first.updatedAt);
      // Structural, not a count: the DTO does not publish `videoCount`/`questionCount`/`coverage`
      // any more.
      expect(Object.prototype.hasOwnProperty.call(body, 'coverage')).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(body, 'videoCount')).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(body, 'questionCount')).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(body, 'denemeCount')).toBe(false);
      expect(response.headers['cache-control']).toBe(BOOK_CACHE_CONTROL);
    });

    it('orders videos ascending and every etiket index gaplessly ascending', async () => {
      app = await bootApp();
      const list = await request(app.getHttpServer()).get('/api/books').expect(200);
      const first = (list.body as ListEnvelope).items[0];
      if (first === undefined) throw new Error('no book seeded');
      const body = (
        await request(app.getHttpServer()).get(`/api/books/${first.slugTr}`).expect(200)
      ).body as Detail;

      // SPEC §13 invariant 3, asserted on the SERVED payload. The service orders in SQL and does
      // not re-sort in the mapper, precisely so this case can fail when the ordering breaks.
      const orderNumbers = body.videos.map((video) => video.orderNo);
      expect(orderNumbers.length).toBeGreaterThan(0);
      expect([...orderNumbers].sort((a, b) => a - b)).toEqual(orderNumbers);

      for (const video of body.videos) {
        expect(video.tags.length).toBeGreaterThan(0);

        // Gapless FROM 1 — a missing etiket number is a silent hole in the index. The whole
        // sequence is compared at once so a failure prints the actual series, not just "false".
        expect(
          `video ${String(video.orderNo)}: ${video.tags.map((tag) => tag.orderNo).join(',')}`,
        ).toBe(
          `video ${String(video.orderNo)}: ${video.tags.map((_tag, index) => index + 1).join(',')}`,
        );

        // STRICTLY ascending start seconds. Not `>=`: two etiketler sharing a second means one of
        // them jumps the reader to the wrong solution, and every range check still passes.
        const seconds = video.tags.map((tag) => tag.startSecond);
        const ascending = seconds.every(
          (second, index) => index === 0 || second > (seconds[index - 1] ?? -1),
        );
        expect(
          `video ${String(video.orderNo)} ascending=${String(ascending)} [${seconds.join(',')}]`,
        ).toBe(`video ${String(video.orderNo)} ascending=true [${seconds.join(',')}]`);

        // DO NOT assume the first etiket starts at 0 — the measured set is {0, 2, 6, 11, 94}, so
        // 0 is an ordinary value rather than a sentinel. Only non-negativity is an invariant.
        expect(seconds.every((second) => Number.isInteger(second) && second >= 0)).toBe(true);
        // SPEC §13 invariant 4, on the served id rather than on the column.
        expect(video.youtubeVideoId).toMatch(/^[A-Za-z0-9_-]{11}$/);
      }
    });

    it('publishes bookVideoId on every video, matching book_videos.id exactly', async () => {
      app = await bootApp();
      const list = await request(app.getHttpServer()).get('/api/books').expect(200);
      const first = (list.body as ListEnvelope).items[0];
      if (first === undefined) throw new Error('no book seeded');
      const bookRow = await dataSource
        .getRepository(Book)
        .findOneByOrFail({ slugTr: first.slugTr });
      const body = (
        await request(app.getHttpServer()).get(`/api/books/${first.slugTr}`).expect(200)
      ).body as Detail;

      expect(body.videos.length).toBeGreaterThan(0);
      for (const video of body.videos) {
        expect(video.bookVideoId).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
        );
        const entityRow = await dataSource
          .getRepository(BookVideo)
          .findOneOrFail({ where: { bookId: bookRow.id, orderNo: video.orderNo } });
        expect(video.bookVideoId).toBe(entityRow.id);
      }
      // Distinct per video within one book — a mapping bug that served the same id twice would
      // still pass the per-row equality checks above.
      expect(new Set(body.videos.map((v) => v.bookVideoId)).size).toBe(body.videos.length);
    });

    it('serves youtube: null on every video while the snapshot table is EMPTY', async () => {
      app = await bootApp();
      const list = await request(app.getHttpServer()).get('/api/books').expect(200);
      const first = (list.body as ListEnvelope).items[0];
      if (first === undefined) throw new Error('no book seeded');
      const body = (
        await request(app.getHttpServer()).get(`/api/books/${first.slugTr}`).expect(200)
      ).body as Detail;

      // The PRECONDITION is what keeps this case a test. B4 landed the serving path, so `null` is
      // no longer unconditional: it is what an empty store yields, which this suite never fills.
      // Stating the premise here is the difference between an assertion and a case that quietly
      // became vacuous (the same reason the attribution case below asserts the count first).
      // `test/book-youtube.e2e-spec.ts` owns the populated states.
      const snapshotCount = await dataSource.query<{ count: string }[]>(
        'SELECT COUNT(*)::text AS count FROM youtube_video_snapshots',
      );
      expect(snapshotCount[0]?.count).toBe('0');
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
        // The ONE ruled channel address (`DEC 2026-08-17b`), imported rather than retyped for the
        // reason the four pagination numbers are: a copy here would keep passing the day the
        // served constant changed. It is no longer composed from `youtubeChannelId`, so asserting
        // containment of that id would now be asserting the retired form.
        expect(row.channelUrl).toBe(YOUTUBE_CHANNEL_URL);
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
      // A künye seeded before its etiket index is a real, ordinary state, not a defect.
      app = await bootApp();
      const body = (await request(app.getHttpServer()).get('/api/books/zz-iki-slug-tr').expect(200))
        .body as Detail;

      expect(body.videos).toEqual([]);
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
      // GREATEST across three tables: a re-measurement updates tags and deliberately leaves
      // `books.updated_at` alone, so a service reading only the book row would report "unchanged"
      // on the day the entire etiket index changed. Asserting the before-state too is what makes
      // this a real control rather than a coincidence.
      const tagRepo = dataSource.getRepository(BookVideoTag);
      const videoRow = await dataSource
        .getRepository(BookVideo)
        .findOneOrFail({ where: { bookId: bookRow.id }, order: { orderNo: 'ASC' } });
      // The LAST etiket of that video: incrementing its second cannot collide with a following
      // one, so the strictly-ascending invariant this suite also asserts stays true throughout.
      const tag = await tagRepo.findOneOrFail({
        where: { bookVideoId: videoRow.id },
        order: { orderNo: 'DESC' },
      });
      tag.startSecond += 1;
      await tagRepo.save(tag);

      const after = (await request(app.getHttpServer()).get('/api/books').expect(200))
        .body as ListEnvelope;
      const sameBook = after.items.find((item) => item.slugTr === first.slugTr);
      if (sameBook === undefined) throw new Error('book vanished between reads');
      expect(new Date(sameBook.updatedAt).getTime()).toBeGreaterThan(
        new Date(first.updatedAt).getTime(),
      );

      // Restore the value, so later phases see the corpus they expect. `updated_at` stays moved —
      // that is honest: the row really was written twice.
      tag.startSecond -= 1;
      await tagRepo.save(tag);
    });

    it("the seeded owner book's etiket rows all carry name_tr IS NULL AND name_en IS NULL (AC 5, P0 PR-3)", async () => {
      // `DEC 2026-09-10b` md.2's per-type boundary: a deneme book's etiketler carry no name at all,
      // and the artefact's own `tag` field ("Soru 3") must never be written into `name_tr` (plan
      // §5.4 PROHIBITION). Checked directly against the database rather than through the DTO, so a
      // future mapper bug that HID a populated name would not make this case a false green.
      const rows = await dataSource.query<{ name_tr: string | null; name_en: string | null }[]>(
        `SELECT bvt.name_tr, bvt.name_en
         FROM book_video_tags bvt
         JOIN book_videos bv ON bv.id = bvt.book_video_id
         JOIN books b ON b.id = bv.book_id
         WHERE b.slug_tr = $1`,
        [BOOK_TIMESTAMPS_OWNER_SLUG_TR],
      );
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((row) => row.name_tr === null && row.name_en === null)).toBe(true);
    });

    it("publishes a generic book's orderNo/titleTr/tags/nameTr, with no count anywhere (AC 1, P0 PR-3)", async () => {
      // Direct repository writes rather than `seedBooks`: the shipped seed loader's artefact type
      // (`BookVideoSeed`/`BookTagSeed`) carries no `titleTr`/`nameTr` channel at all — those columns
      // are deliberately un-seeded by production data until a real book needs them (plan §3,
      // "Deliberately deferred"). This case proves the columns publish correctly once populated,
      // which is a repo-level fixture choice rather than a change to the shipped seed loader.
      const bookRepo = dataSource.getRepository(Book);
      const videoRepo = dataSource.getRepository(BookVideo);
      const tagRepo = dataSource.getRepository(BookVideoTag);

      const genericBook = await bookRepo.save(
        bookRepo.create({
          slugTr: 'zz-jenerik-detay',
          slugEn: 'zz-generic-detail',
          titleTr: 'Jenerik Detay Kitabı',
          titleEn: null,
          publisherName: 'Fixture',
          authorNames: ['Fixture Author'],
          isbn13: '9999999999995',
          pageCount: 1,
          examTrack: ExamTrack.Ayt,
          coverImagePath: null,
          purchaseUrl: null,
          introTr: 'Fixture.',
          introEn: null,
          metaTitleTr: 'Fixture',
          metaDescriptionTr: 'Fixture',
          youtubePlaylistId: null,
          youtubeChannelId: 'UC_fixture_channel',
          displayOrder: 9996,
        }),
      );

      const genericVideo = await videoRepo.save(
        videoRepo.create({
          bookId: genericBook.id,
          orderNo: 1,
          titleTr: 'İklim',
          titleEn: null,
          youtubeVideoId: 'gdt00000001',
        }),
      );

      await tagRepo.save(
        tagRepo.create({
          bookVideoId: genericVideo.id,
          orderNo: 1,
          startSecond: 5,
          nameTr: 'Sıcaklık',
          nameEn: null,
        }),
      );

      app = await bootApp();
      const body = (
        await request(app.getHttpServer()).get('/api/books/zz-jenerik-detay').expect(200)
      ).body as Detail;

      expect(body.videos.length).toBe(1);
      const [servedVideo] = body.videos;
      if (servedVideo === undefined) throw new Error('generic video vanished');
      expect(servedVideo.orderNo).toBe(1);
      expect(servedVideo.titleTr).toBe('İklim');
      expect(servedVideo.titleEn).toBeNull();
      expect(servedVideo.tags).toEqual([
        { orderNo: 1, startSecond: 5, nameTr: 'Sıcaklık', nameEn: null },
      ]);
      // No book-level count anywhere, on this book or any other (`DEC 2026-09-10c` md.1).
      expect(Object.prototype.hasOwnProperty.call(body, 'coverage')).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(body, 'videoCount')).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(body, 'questionCount')).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(body, 'denemeCount')).toBe(false);
    });

    afterAll(async () => {
      // FK CASCADE (book_videos, book_video_tags → books ON DELETE CASCADE) means one DELETE
      // clears all three rows this case inserted — the same pattern test/book-seed.e2e-spec.ts
      // uses for its own generic-book fixture.
      await dataSource.query("DELETE FROM books WHERE slug_tr = 'zz-jenerik-detay'");
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
