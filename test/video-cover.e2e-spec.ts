import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { type INestApplication } from '@nestjs/common';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import request from 'supertest';
import type { Response as SuperagentResponse } from 'supertest';
import { DataSource } from 'typeorm';
import { YoutubeThumbnailKey } from '../src/book/book.types';
import { BookVideo } from '../src/book/entities/book-video.entity';
import { YoutubeVideoSnapshot } from '../src/book/entities/youtube-video-snapshot.entity';
import {
  YoutubeSnapshotStore,
  type YoutubeSnapshotStorePort,
} from '../src/book/youtube/youtube-snapshot.store';
import { buildDataSourceOptions } from '../src/database/data-source-options';
import { seedBooks } from '../src/database/seeds/seed-books';
import { buildVideoCoverPath } from '../src/video-cover/video-cover-address';
import { VIDEO_COVER_ERROR_KEYS } from '../src/video-cover/video-cover-error-keys';

/**
 * P2 (kapak-adresi) e2e — the SSRF guard, the uniform-404 collapse and the named regression guard
 * (plan §5.8), against a REAL Postgres.
 *
 * ## Structural only, and no fact is pinned (`CONVENTIONS.md` §2)
 * Every snapshot row below is written BY THIS FILE with fabricated values — `https://example.invalid`
 * hosts, an invented fixture image — never transcribed from a real provider response
 * (`test/book-youtube.e2e-spec.ts`'s own docblock states the same rule for the identical reason).
 *
 * ## The mocking mechanism, and why it is NOT `jest.spyOn(globalThis, 'fetch')`
 * `UpstreamHttpClient` caches `options.fetchImpl ?? fetch` in its OWN CONSTRUCTOR — a plain value
 * read, not a live binding. Every provider in this app's DI graph (including the
 * `VIDEO_COVER_UPSTREAM_CLIENT` instance) is constructed eagerly during `TestingModuleBuilder.compile()`,
 * which runs BEFORE a `jest.spyOn(globalThis, 'fetch')` installed afterwards (the shape
 * `test/book-youtube.e2e-spec.ts` uses) could ever be seen by that already-constructed instance —
 * that file's own "ZERO calls" case is provably safe only because NOTHING on its tested path ever
 * calls `fetch` at all within the test's lifetime (its own comment: "the scheduled tour's first run
 * is ten seconds away"), not because the spy intercepts a live per-request call the way THIS route's
 * synchronous request/response cycle needs. This file instead OVERRIDES the
 * `VIDEO_COVER_UPSTREAM_CLIENT` provider itself, constructing its `UpstreamHttpClient` with an
 * explicit `fetchImpl` mock — the literal seam `UpstreamHttpClientOptions.fetchImpl` exists for —
 * so every call this route makes is genuinely intercepted, with no timing question at all.
 */

const HOUR_MS = 3_600_000;

/** An unroutable host for the book sync leg, which stays off in every case here (the FAKE_API_BASE_URL precedent). */
const FAKE_API_BASE_URL = 'https://provider.invalid/youtube/v3';

/** The allowlisted host every "servable" fixture below points at. */
const ALLOWED_HOST = 'example.invalid';
const ALLOWED_THUMBNAIL_URL = `https://${ALLOWED_HOST}/thumb.jpg`;

const UNIFORM_404_BODY = {
  statusCode: 404,
  message: VIDEO_COVER_ERROR_KEYS.notFound,
  error: 'Not Found',
};

/** A well-formed UUID that names no seeded `BookVideo` row. */
const UNKNOWN_BOOK_VIDEO_ID = '99999999-9999-4999-8999-999999999999';

function jpegBytes(fill = 7, length = 16): Uint8Array {
  return new Uint8Array(length).fill(fill);
}

function imageResponse(bytes: Uint8Array): Response {
  // `Uint8Array` alone does not satisfy the installed lib's `BodyInit` union; `.buffer` (an
  // `ArrayBuffer`) does, and carries the exact same bytes.
  return new Response(bytes.buffer as ArrayBuffer, {
    status: 200,
    headers: { 'content-type': 'image/jpeg' },
  });
}

function wrongContentTypeResponse(): Response {
  return new Response(jpegBytes().buffer as ArrayBuffer, {
    status: 200,
    headers: { 'content-type': 'text/html' },
  });
}

function serverErrorResponse(): Response {
  return new Response('boom', { status: 500 });
}

/** Declares a Content-Length above the shared 2 MiB cap without allocating real bytes. */
function oversizedResponse(): Response {
  return new Response(new Uint8Array(8).buffer, {
    status: 200,
    headers: { 'content-type': 'image/jpeg', 'content-length': '3000000' },
  });
}

/**
 * Forces supertest to hand back the raw bytes rather than guessing a parser off Content-Type —
 * this is the FIRST binary-response route in this repo (plan §2.6), so no existing e2e precedent
 * covers it.
 */
function bufferParser(
  res: SuperagentResponse,
  callback: (err: Error | null, body: Buffer) => void,
): void {
  const chunks: Buffer[] = [];
  res.on('data', (chunk: Buffer) => chunks.push(chunk));
  res.on('end', () => callback(null, Buffer.concat(chunks)));
}

describe('Video cover proxy (e2e, real Postgres) — closes VAL137-NEW-C1/VAL137-C1', () => {
  let container: StartedPostgreSqlContainer;
  let dataSource: DataSource;
  let app: INestApplication | null = null;
  let store: YoutubeSnapshotStorePort;
  let fetchMock: jest.Mock<typeof fetch>;
  let bookSlug: string;
  let videoIds: string[];
  let bookVideoIds: string[];

  async function bootApp(env: Record<string, string> = {}): Promise<INestApplication> {
    Object.assign(process.env, {
      BOOKS_ENABLED: 'false',
      BOOKS_YOUTUBE_SYNC_ENABLED: 'false',
      YOUTUBE_DATA_API_BASE_URL: FAKE_API_BASE_URL,
      YOUTUBE_API_DATA_SOFT_MAX_AGE_HOURS: '600',
      YOUTUBE_API_DATA_HARD_MAX_AGE_HOURS: '720',
      BOOKS_PURGE_INTERVAL_SECONDS: '3600',
      VIDEO_COVER_UPSTREAM_HOSTS: ALLOWED_HOST,
      VIDEO_COVER_SINGLE_CALL_TIMEOUT_MS: '4000',
      VIDEO_COVER_REQUEST_DEADLINE_MS: '4000',
      ...env,
    });
    delete process.env.YOUTUBE_API_KEY;

    jest.resetModules();
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { AppModule } = require('../src/app.module') as typeof import('../src/app.module');
    const { Test: FreshTest } = require('@nestjs/testing') as typeof import('@nestjs/testing');
    const { ValidationPipe: FreshValidationPipe } =
      require('@nestjs/common') as typeof import('@nestjs/common');
    const { applyGlobalPrefix: freshApplyGlobalPrefix } =
      require('../src/common/bootstrap') as typeof import('../src/common/bootstrap');
    const { VIDEO_COVER_UPSTREAM_CLIENT: FreshToken } =
      require('../src/video-cover/video-cover.service') as typeof import('../src/video-cover/video-cover.service');
    const { UpstreamHttpClient: FreshUpstreamHttpClient } =
      require('../src/upstream/upstream-http.client') as typeof import('../src/upstream/upstream-http.client');
    const { UpstreamMetrics: FreshUpstreamMetrics } =
      require('../src/upstream/upstream-metrics') as typeof import('../src/upstream/upstream-metrics');
    const { ProviderBudget: FreshProviderBudget } =
      require('../src/upstream/provider-budget') as typeof import('../src/upstream/provider-budget');
    const { CircuitBreaker: FreshCircuitBreaker } =
      require('../src/upstream/circuit-breaker') as typeof import('../src/upstream/circuit-breaker');
    /* eslint-enable @typescript-eslint/no-require-imports */

    const moduleRef = await FreshTest.createTestingModule({ imports: [AppModule] })
      .overrideProvider(FreshToken)
      .useFactory({
        inject: [FreshUpstreamMetrics, FreshProviderBudget, FreshCircuitBreaker],
        factory: (
          metrics: InstanceType<typeof FreshUpstreamMetrics>,
          budget: InstanceType<typeof FreshProviderBudget>,
          breaker: InstanceType<typeof FreshCircuitBreaker>,
        ) =>
          new FreshUpstreamHttpClient(metrics, budget, breaker, {
            singleCallTimeoutMs: 4_000,
            userAgent: 'video-cover-e2e-test',
            fetchImpl: fetchMock,
            // Instant, so a retried transient failure does not cost the test 250 real ms.
            sleepImpl: () => Promise.resolve(),
          }),
      })
      .compile();

    const created = moduleRef.createNestApplication();
    freshApplyGlobalPrefix(created);
    created.useGlobalPipes(
      new FreshValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await created.init();
    return created;
  }

  /** Writes one snapshot through the PRODUCTION store — the `book-youtube.e2e-spec.ts` precedent. */
  async function writeSnapshot(
    youtubeVideoId: string,
    options: {
      hoursAgo?: number;
      missingHoursAgo?: number | null;
      thumbnailUrl?: string;
    } = {},
  ): Promise<void> {
    const now = Date.now();
    await store.upsertSnapshot(
      {
        youtubeVideoId,
        thumbnailKey: YoutubeThumbnailKey.Maxres,
        thumbnailUrl: options.thumbnailUrl ?? ALLOWED_THUMBNAIL_URL,
        thumbnailWidth: 1280,
        thumbnailHeight: 720,
        publishedAtUtc: new Date(now - 30 * 24 * HOUR_MS),
        durationIso: 'PT7M56S',
        durationSeconds: 476,
        embeddable: true,
        privacyStatus: 'public',
      },
      new Date(now - (options.hoursAgo ?? 1) * HOUR_MS),
    );
    if (options.missingHoursAgo !== undefined && options.missingHoursAgo !== null) {
      await store.markMissing([youtubeVideoId], new Date(now - options.missingHoursAgo * HOUR_MS));
    }
  }

  async function clearSnapshots(): Promise<void> {
    await dataSource.getRepository(YoutubeVideoSnapshot).clear();
  }

  /** NOT `async` — must return the chainable `Test` builder itself, not a `Promise` of one, so a
   * caller can still chain `.expect(...)` before awaiting the whole request. */
  function getVideoCover(bookVideoId: string) {
    if (app === null) throw new Error('the application is not booted');
    return request(app.getHttpServer())
      .get(buildVideoCoverPath(bookVideoId))
      .buffer(true)
      .parse(bufferParser);
  }

  function jsonBody(response: SuperagentResponse): unknown {
    return JSON.parse((response.body as Buffer).toString('utf8'));
  }

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
    const url = container.getConnectionUri();
    process.env.DATABASE_URL = url;
    process.env.WEB_ORIGIN = 'http://localhost:3000';

    dataSource = new DataSource(buildDataSourceOptions(url));
    await dataSource.initialize();
    await dataSource.runMigrations();
    await seedBooks(dataSource);
    store = new YoutubeSnapshotStore(dataSource);

    const videos = await dataSource.getRepository(BookVideo).find({ order: { orderNo: 'ASC' } });
    videoIds = videos.map((video) => video.youtubeVideoId);
    bookVideoIds = videos.map((video) => video.id);
    expect(videoIds.length).toBeGreaterThan(1);

    const book = await dataSource.query<{ slug_tr: string }[]>(
      'SELECT slug_tr FROM books ORDER BY display_order ASC LIMIT 1',
    );
    bookSlug = book[0]?.slug_tr ?? '';
    expect(bookSlug.length).toBeGreaterThan(0);
  }, 300_000);

  beforeEach(() => {
    fetchMock = jest.fn<typeof fetch>();
  });

  afterEach(async () => {
    await app?.close();
    app = null;
    await clearSnapshots();
  });

  afterAll(async () => {
    if (dataSource.isInitialized) await dataSource.destroy();
    await container.stop();
  });

  describe('the success path', () => {
    it('returns 200 with the exact bytes, image/jpeg, and the configured Cache-Control', async () => {
      const [first] = videoIds;
      const [firstBookVideoId] = bookVideoIds;
      if (first === undefined || firstBookVideoId === undefined) throw new Error('no seeded video');
      await writeSnapshot(first);

      const bytes = jpegBytes();
      fetchMock.mockResolvedValueOnce(imageResponse(bytes));

      app = await bootApp();
      const response = await getVideoCover(firstBookVideoId).expect(200);

      expect(response.headers['content-type']).toBe('image/jpeg');
      expect(response.headers['cache-control']).toBe(
        'public, max-age=3600, stale-while-revalidate=604800',
      );
      expect(Buffer.compare(response.body as Buffer, Buffer.from(bytes))).toBe(0);

      // The spied fetch is asserted CALLED with the stored thumbnailUrl and never with any other
      // address (plan §5.8).
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0]?.[0]).toBe(ALLOWED_THUMBNAIL_URL);
    });
  });

  describe('every failure state converges on the identical uniform 404 (plan §5.6)', () => {
    it('an unknown bookVideoId — fetch is never attempted', async () => {
      app = await bootApp();
      const response = await getVideoCover(UNKNOWN_BOOK_VIDEO_ID).expect(404);

      expect(jsonBody(response)).toEqual(UNIFORM_404_BODY);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('a bookVideoId with no snapshot row at all (never synced) — fetch is never attempted', async () => {
      const [, second] = bookVideoIds;
      if (second === undefined) throw new Error('need two seeded videos');

      app = await bootApp();
      const response = await getVideoCover(second).expect(404);

      expect(jsonBody(response)).toEqual(UNIFORM_404_BODY);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('a snapshot past the soft threshold — fetch is never attempted', async () => {
      const [first] = videoIds;
      const [firstBookVideoId] = bookVideoIds;
      if (first === undefined || firstBookVideoId === undefined) throw new Error('no seeded video');
      await writeSnapshot(first, { hoursAgo: 700 }); // past soft (600), inside hard (720)

      app = await bootApp();
      const response = await getVideoCover(firstBookVideoId).expect(404);

      expect(jsonBody(response)).toEqual(UNIFORM_404_BODY);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('a snapshot with missing_since_utc set — fetch is never attempted', async () => {
      const [first] = videoIds;
      const [firstBookVideoId] = bookVideoIds;
      if (first === undefined || firstBookVideoId === undefined) throw new Error('no seeded video');
      await writeSnapshot(first, { hoursAgo: 1, missingHoursAgo: 1 });

      app = await bootApp();
      const response = await getVideoCover(firstBookVideoId).expect(404);

      expect(jsonBody(response)).toEqual(UNIFORM_404_BODY);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('a stored host outside the allowlist — the concrete, executable SSRF proof, fetch never attempted', async () => {
      const [first] = videoIds;
      const [firstBookVideoId] = bookVideoIds;
      if (first === undefined || firstBookVideoId === undefined) throw new Error('no seeded video');
      // Written directly, bypassing the write-time validator — exactly as a compromised or
      // malformed provider answer would (plan §5.8).
      await writeSnapshot(first, { thumbnailUrl: 'https://blocked.invalid/thumb.jpg' });

      app = await bootApp();
      const response = await getVideoCover(firstBookVideoId).expect(404);

      expect(jsonBody(response)).toEqual(UNIFORM_404_BODY);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it.each([
      ['a network failure', () => fetchMock.mockRejectedValue(new TypeError('fetch failed'))],
      ['an HTTP 500', () => fetchMock.mockResolvedValue(serverErrorResponse())],
      ['a wrong content-type', () => fetchMock.mockResolvedValue(wrongContentTypeResponse())],
      ['an oversized body', () => fetchMock.mockResolvedValue(oversizedResponse())],
    ])('an upstream failure — %s', async (_label, arrangeFetch) => {
      const [first] = videoIds;
      const [firstBookVideoId] = bookVideoIds;
      if (first === undefined || firstBookVideoId === undefined) throw new Error('no seeded video');
      await writeSnapshot(first);
      arrangeFetch();

      app = await bootApp();
      const response = await getVideoCover(firstBookVideoId).expect(404);

      expect(jsonBody(response)).toEqual(UNIFORM_404_BODY);
    });
  });

  describe('the named regression guard (PR #137 validator VAL137-C1 / VAL137-NEW-C1)', () => {
    it("never republishes the provider's own thumbnail address", async () => {
      const [first] = videoIds;
      if (first === undefined) throw new Error('no seeded video');
      // A distinctive, recognisable fixture, reusing `test/book-youtube.e2e-spec.ts`'s own
      // `https://example.invalid/thumb.jpg` convention.
      await writeSnapshot(first, { thumbnailUrl: 'https://example.invalid/thumb.jpg' });

      app = await bootApp();
      const response = await request(app.getHttpServer()).get(`/api/books/${bookSlug}`).expect(200);

      // Raw response TEXT — not the parsed JSON, not a specific field — scanned for the ADDRESS
      // SHAPE, never for a field name. This is the check that goes red the instant
      // `BookService.toYoutubeDto` is reverted to republish `snapshot.thumbnailUrl` — the exact
      // PR #171-era mutation this whole incident was.
      //
      // MEASURED rather than assumed from the plan's own literal wording: a blanket "contains no
      // 'youtube' substring" is not actually testable against this payload — `youtubeChannelId`
      // and the `providerId: "youtube"` attribution row are legitimate, already-ruled publications
      // on the SAME response (`DEC 2026-08-15c`), unrelated to VAL137's leak vector. `ytimg` (the
      // CDN hostname the thumbnail's own address shape uses) carries no such legitimate use
      // anywhere on this contract, so it stays a hard ban; the literal stored fixture value is the
      // second, more direct guard — it is exactly the value the guarded mutation would republish.
      const raw = response.text;
      expect(raw).not.toMatch(/ytimg/i);
      expect(raw).not.toContain('https://example.invalid/thumb.jpg');
      expect(raw).toContain('/video-cover/');
    });
  });
});
