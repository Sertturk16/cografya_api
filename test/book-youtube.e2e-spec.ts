import { afterAll, afterEach, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { type INestApplication } from '@nestjs/common';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { YoutubeThumbnailKey } from '../src/book/book.types';
import { BookVideo } from '../src/book/entities/book-video.entity';
import { YoutubeVideoSnapshot } from '../src/book/entities/youtube-video-snapshot.entity';
import type { YoutubePurgeTarget } from '../src/book/youtube/youtube-purge.target';
import {
  YoutubeSnapshotStore,
  type YoutubeSnapshotStorePort,
} from '../src/book/youtube/youtube-snapshot.store';
import { buildDataSourceOptions } from '../src/database/data-source-options';
import { seedBooks } from '../src/database/seeds/seed-books';

/**
 * B4 e2e — the ageing rule, the purge and the request path, against a REAL Postgres.
 *
 * ## Structural only, and no fact is pinned (`CONVENTIONS.md` §2)
 * Every snapshot row below is written BY THIS FILE with fabricated values: a `https://example.invalid`
 * thumbnail, a `PT7M56S` duration, dimensions of 1280×720. Nothing is transcribed from a real
 * `videos.list` answer — a committed fixture holding real API Data would be stored API Data, and the
 * 30-day retention rule this whole leg exists to honour is not something a file in git can honour.
 * What is asserted is the RULE: at which age a row is served, at which age it is deleted, and that
 * neither ever costs the page its question index.
 *
 * ## The clock is not faked; the ROW's age is
 * SPEC §13 item 9 says "with a fake clock". Writing `fetched_at_utc` in the past is the same
 * experiment with one fewer moving part — age is `now − fetched_at_utc`, so an old row and an
 * advanced clock are indistinguishable to the rule, and this way nothing has to be injected into a
 * booted application.
 */

/** A fabricated credential. No real key appears in this repository's tests. */
const FAKE_KEY = 'test-key-not-a-real-credential';

/** An unroutable host: if any code path ever did reach out, it could not reach a real provider. */
const FAKE_API_BASE_URL = 'https://provider.invalid/youtube/v3';

const HOUR_MS = 3_600_000;

interface ServedYoutube {
  thumbnailUrl: string;
  thumbnailWidth: number;
  thumbnailHeight: number;
  publishedAtUtc: string;
  durationIso: string;
  durationSeconds: number;
  embeddable: boolean;
  dataFetchedAtUtc: string;
}

interface Detail {
  slugTr: string;
  videos: {
    denemeNo: number;
    youtubeVideoId: string;
    questions: { questionNo: number; startSecond: number }[];
    youtube: ServedYoutube | null;
  }[];
  attribution: { providerId: string }[];
}

describe('Book YouTube sync leg (e2e, real Postgres)', () => {
  let container: StartedPostgreSqlContainer;
  let dataSource: DataSource;
  let app: INestApplication | null = null;
  let fetchSpy: jest.SpiedFunction<typeof fetch> | null = null;
  let bookSlug: string;
  let videoIds: string[];
  /**
   * The PRODUCTION store, against the container's Postgres.
   *
   * Every snapshot this file writes goes through it. Until the #111 review the helper below
   * hand-copied the production INSERT instead, which meant `upsertSnapshot`'s twelve-column
   * `orUpdate` conflict target, `listVideoIds`'s raw alias and `markMissing`'s WHERE clause ran
   * against no database anywhere in CI — one wrong string in `UPSERT_OVERWRITE_COLUMNS` would have
   * made every upsert throw, every tour complete "healthy", and every video serve `youtube: null`
   * (CODE111-I3 / TEST111-I1; `ENGINEERING.md` §8: e2e uses real Postgres, not mocks).
   *
   * Constructed from the test's own `DataSource` rather than resolved from the container, so it is
   * available before any application boots. The DI-resolved instance is exercised separately below.
   */
  let store: YoutubeSnapshotStorePort;

  /**
   * Boot an application with the env this case needs, from a FRESH module registry.
   *
   * ## Why the registry is reset, and why this is not ceremony
   * `ConfigModule.forRoot` validates `process.env` EAGERLY, while `app.module` is being imported —
   * so with Node's module cache in place the first boot of this file would freeze the configuration
   * for every case after it, and a case that set a different threshold would silently assert
   * against the first case's numbers. The `marine-values` phase-H precedent does exactly this, for
   * exactly this reason, and the failure it prevents is a green test that measured nothing.
   *
   * Everything the app touches is re-required from that fresh registry, INCLUDING the class used as
   * a provider token below: after a reset, the statically imported `YoutubePurgeTarget` is a
   * different object from the one the container registered, and `app.get` would not find it.
   *
   * Every switch is also written EXPLICITLY rather than left to its default. `ConfigModule` merges
   * a `.env` file when one exists, and a developer's local `.env` legitimately holds a real
   * `YOUTUBE_API_KEY` — so a case relying on "the default is false" could boot the sync ON against
   * the real provider on one machine and OFF in CI. An explicit value cannot diverge.
   */
  async function bootApp(env: Record<string, string> = {}): Promise<{
    app: INestApplication;
    purgeTarget: YoutubePurgeTarget;
    injectedStore: YoutubeSnapshotStorePort;
  }> {
    Object.assign(process.env, {
      BOOKS_ENABLED: 'false',
      BOOKS_YOUTUBE_SYNC_ENABLED: 'false',
      YOUTUBE_DATA_API_BASE_URL: FAKE_API_BASE_URL,
      YOUTUBE_API_DATA_SOFT_MAX_AGE_HOURS: '600',
      YOUTUBE_API_DATA_HARD_MAX_AGE_HOURS: '720',
      // Restated on every boot rather than left from the last one: `process.env` is process-wide,
      // so a case that lowers a value would otherwise silently configure every case after it.
      BOOKS_PURGE_INTERVAL_SECONDS: '3600',
      ...env,
    });
    // Cleared unless the case asked for one. Note the honest limit: `ConfigModule` also merges the
    // `.env` FILE, which a developer's machine may legitimately have, so this delete guarantees a
    // keyless boot in CI (no file) and not necessarily on a laptop. Nothing below depends on the
    // key's absence — the cases assert what is observable, and the purge case counts `fetch`.
    if (env.YOUTUBE_API_KEY === undefined) delete process.env.YOUTUBE_API_KEY;

    jest.resetModules();
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { AppModule } = require('../src/app.module') as typeof import('../src/app.module');
    const { Test: FreshTest } = require('@nestjs/testing') as typeof import('@nestjs/testing');
    const { ValidationPipe: FreshValidationPipe } =
      require('@nestjs/common') as typeof import('@nestjs/common');
    const { applyGlobalPrefix: freshApplyGlobalPrefix } =
      require('../src/common/bootstrap') as typeof import('../src/common/bootstrap');
    const { YoutubePurgeTarget: FreshPurgeTarget } =
      require('../src/book/youtube/youtube-purge.target') as typeof import('../src/book/youtube/youtube-purge.target');
    // The token is a `Symbol`, so after a registry reset the statically imported one is a different
    // object from the one the container registered and `app.get` would not find it.
    const { YOUTUBE_SNAPSHOT_STORE: FreshStoreToken } =
      require('../src/book/youtube/youtube-snapshot.store') as typeof import('../src/book/youtube/youtube-snapshot.store');
    /* eslint-enable @typescript-eslint/no-require-imports */

    const moduleRef = await FreshTest.createTestingModule({ imports: [AppModule] }).compile();
    const created = moduleRef.createNestApplication();
    freshApplyGlobalPrefix(created);
    created.useGlobalPipes(
      new FreshValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await created.init();
    fetchSpy = jest.spyOn(globalThis, 'fetch');
    fetchSpy.mockClear();

    // ALWAYS a target: since the #111 ruling the purge is gated on nothing, so the factory builds
    // and registers it in every configuration. A `null` here would be the ruling not holding.
    return {
      app: created,
      purgeTarget: created.get<YoutubePurgeTarget>(FreshPurgeTarget),
      injectedStore: created.get<YoutubeSnapshotStorePort>(FreshStoreToken),
    };
  }

  /**
   * Write one snapshot for `youtubeVideoId`, aged `hoursAgo`, missing since `missingHoursAgo`.
   *
   * Through the PRODUCTION store, not a hand-copied INSERT — so every case in this file exercises
   * `upsertSnapshot`'s real statement, including the `orUpdate` conflict target that a re-write
   * takes. The absence stamp goes through `markMissing` for the same reason; it accepts the instant
   * as a parameter, so a past one is enough and no clock has to be faked.
   */
  async function writeSnapshot(
    youtubeVideoId: string,
    hoursAgo: number,
    missingHoursAgo: number | null = null,
  ): Promise<void> {
    const now = Date.now();
    await store.upsertSnapshot(
      {
        youtubeVideoId,
        thumbnailKey: YoutubeThumbnailKey.Maxres,
        thumbnailUrl: 'https://example.invalid/thumb.jpg',
        thumbnailWidth: 1280,
        thumbnailHeight: 720,
        publishedAtUtc: new Date(now - 30 * 24 * HOUR_MS),
        durationIso: 'PT7M56S',
        durationSeconds: 476,
        embeddable: true,
        privacyStatus: 'public',
      },
      new Date(now - hoursAgo * HOUR_MS),
    );
    if (missingHoursAgo !== null) {
      await store.markMissing([youtubeVideoId], new Date(now - missingHoursAgo * HOUR_MS));
    }
  }

  async function clearSnapshots(): Promise<void> {
    await dataSource.getRepository(YoutubeVideoSnapshot).clear();
  }

  async function fetchDetail(): Promise<Detail> {
    if (app === null) throw new Error('the application is not booted');
    const response = await request(app.getHttpServer()).get(`/api/books/${bookSlug}`).expect(200);
    return response.body as Detail;
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

    const videos = await dataSource.getRepository(BookVideo).find({ order: { denemeNo: 'ASC' } });
    videoIds = videos.map((video) => video.youtubeVideoId);
    expect(videoIds.length).toBeGreaterThan(1);

    const book = await dataSource.query<{ slug_tr: string }[]>(
      'SELECT slug_tr FROM books ORDER BY display_order ASC LIMIT 1',
    );
    bookSlug = book[0]?.slug_tr ?? '';
    expect(bookSlug.length).toBeGreaterThan(0);
  }, 300_000);

  afterEach(async () => {
    fetchSpy?.mockRestore();
    fetchSpy = null;
    await app?.close();
    app = null;
    await clearSnapshots();
  });

  afterAll(async () => {
    if (dataSource.isInitialized) await dataSource.destroy();
    await container.stop();
  });

  describe('the ageing rule at the point of publication (SPEC §8.3)', () => {
    it('serves a FRESH snapshot, with exactly the fields the contract declares', async () => {
      const [first] = videoIds;
      if (first === undefined) throw new Error('no seeded video');
      await writeSnapshot(first, 1);

      ({ app } = await bootApp());
      const body = await fetchDetail();
      const served = body.videos.find((video) => video.youtubeVideoId === first);

      expect(served?.youtube).not.toBeNull();
      // The key set as a WHOLE: a field added to the served object without a contract change would
      // fail here rather than reach the web repo's generated types unannounced.
      expect(Object.keys(served?.youtube ?? {}).sort()).toEqual([
        'dataFetchedAtUtc',
        'durationIso',
        'durationSeconds',
        'embeddable',
        'publishedAtUtc',
        'thumbnailHeight',
        'thumbnailUrl',
        'thumbnailWidth',
      ]);
      // Republished exactly as stored — never rebuilt from the video id (Developer Policies
      // III.E.5), which is also why the URL below is one this file wrote rather than one derived.
      expect(served?.youtube?.thumbnailUrl).toBe('https://example.invalid/thumb.jpg');
      expect(served?.youtube?.durationSeconds).toBe(476);
      expect(typeof served?.youtube?.dataFetchedAtUtc).toBe('string');

      // Every OTHER video still has no snapshot, so `null` is what they carry — the two states
      // living side by side in one payload is the normal steady state of this leg.
      expect(body.videos.filter((video) => video.youtube === null).length).toBe(
        body.videos.length - 1,
      );
    });

    it('does NOT serve a snapshot past the soft threshold (SPEC §13 item 9)', async () => {
      const [first] = videoIds;
      if (first === undefined) throw new Error('no seeded video');
      // 700 h: past the soft threshold (600) and still below the hard one (720), so the row
      // EXISTS and is deliberately not served. That middle state is why there are two numbers.
      await writeSnapshot(first, 700);

      ({ app } = await bootApp());
      const body = await fetchDetail();
      const served = body.videos.find((video) => video.youtubeVideoId === first);

      expect(served?.youtube).toBeNull();
      // The row was not deleted by the READ — serving and deleting are different obligations with
      // different thresholds, and the read path performs neither deletion nor repair.
      const remaining = await dataSource.getRepository(YoutubeVideoSnapshot).count();
      expect(remaining).toBe(1);
    });

    it('reads the CONFIGURED threshold, so the same row flips with the env', async () => {
      const [first] = videoIds;
      if (first === undefined) throw new Error('no seeded video');
      await writeSnapshot(first, 100);

      ({ app } = await bootApp({ YOUTUBE_API_DATA_SOFT_MAX_AGE_HOURS: '24' }));
      const body = await fetchDetail();

      // The identical row was served in the first case of this block at one hour old; at 100 hours
      // under a 24-hour ceiling it is not. Same row, same code, different configured age.
      expect(body.videos.find((video) => video.youtubeVideoId === first)?.youtube).toBeNull();
    });

    it('keeps the deneme and its questions when the video is MISSING (SPEC §13 item 11)', async () => {
      const [first] = videoIds;
      if (first === undefined) throw new Error('no seeded video');
      // Freshly fetched AND missing: age alone would serve it, so this case can only pass if the
      // absence stamp is what stops it.
      await writeSnapshot(first, 1, 1);

      ({ app } = await bootApp());
      const body = await fetchDetail();
      const served = body.videos.find((video) => video.youtubeVideoId === first);

      expect(served?.youtube).toBeNull();
      // The half that matters: a dead video costs the embed and nothing else. The index survives.
      expect(served?.questions.length).toBeGreaterThan(0);
      expect(served?.denemeNo).toBeGreaterThan(0);
      expect(body.videos.length).toBeGreaterThan(1);
      // And the credit is unaffected — it never depended on provider data existing.
      expect(body.attribution.map((row) => row.providerId).sort()).toEqual(['partner', 'youtube']);
    });
  });

  describe('the purge (SPEC §8.1, §13 item 10)', () => {
    it('deletes a row past the HARD threshold with EVERY book switch off', async () => {
      const [first, second] = videoIds;
      if (first === undefined || second === undefined) throw new Error('need two seeded videos');
      await writeSnapshot(first, 800); // past 720 h
      await writeSnapshot(second, 1); // fresh

      // `bootApp()`'s defaults are `BOOKS_ENABLED=false` AND `BOOKS_YOUTUBE_SYNC_ENABLED=false` —
      // the deployment of an operator who retired the book feature through the documented switch.
      // This configuration is the entire claim of SPEC §8.1 as the #111 ruling settled it: deleting
      // is an obligation, so it may not depend on the feature's switch, on a second switch, or on a
      // provider being reachable. The previous version of this case turned `BOOKS_ENABLED` ON, so
      // it could not have failed when the purge was gated on it.
      const booted = await bootApp();
      app = booted.app;
      await booted.purgeTarget.refresh();

      const remaining = await dataSource.getRepository(YoutubeVideoSnapshot).find();
      expect(remaining.map((row) => row.youtubeVideoId)).toEqual([second]);
      // "Network: no" (SPEC §8.1's table) as a counted fact rather than a design claim: the purge
      // has no HTTP client at all, and this is what says so from the outside.
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('deletes nothing when every row is inside the ceiling', async () => {
      const [first] = videoIds;
      if (first === undefined) throw new Error('no seeded video');
      await writeSnapshot(first, 700); // past SOFT, inside HARD

      const booted = await bootApp({ BOOKS_ENABLED: 'true' });
      app = booted.app;
      await booted.purgeTarget.refresh();

      // Not served (the previous block proves that) and NOT deleted: the two thresholds do
      // different jobs, and a purge that used the soft one would destroy a recoverable row.
      expect(await dataSource.getRepository(YoutubeVideoSnapshot).count()).toBe(1);
    });

    it('reads the CONFIGURED ceiling, so lowering it takes effect without a code change', async () => {
      const [first] = videoIds;
      if (first === undefined) throw new Error('no seeded video');
      await writeSnapshot(first, 100);

      const booted = await bootApp({
        BOOKS_ENABLED: 'true',
        YOUTUBE_API_DATA_SOFT_MAX_AGE_HOURS: '12',
        YOUTUBE_API_DATA_HARD_MAX_AGE_HOURS: '24',
        // The boot cross-check bites here and the test has to respect it: a 24-hour ceiling
        // demands a purge interval below (24 × 3600) / 24 = 3600 s, and the default sits exactly
        // ON that limit. Lowering the ceiling really does mean purging more often.
        BOOKS_PURGE_INTERVAL_SECONDS: '600',
      });
      app = booted.app;
      await booted.purgeTarget.refresh();

      expect(await dataSource.getRepository(YoutubeVideoSnapshot).count()).toBe(0);
    });
  });

  describe('the snapshot store against the real schema (ENGINEERING.md §8)', () => {
    it('lists, upserts, marks an absence exactly once, and lets a re-write undo it', async () => {
      const [first] = videoIds;
      if (first === undefined) throw new Error('no seeded video');
      await writeSnapshot(first, 1);

      const booted = await bootApp({ BOOKS_ENABLED: 'true' });
      app = booted.app;
      // The DI-resolved instance, not one this file constructed: the wiring is part of what is
      // unverified otherwise.
      const injected = booted.injectedStore;

      // `listVideoIds` — the raw `getRawMany` alias, the DISTINCT and the ORDER BY, against
      // Postgres. Compared as a SET: the ordering is the database's collation and nothing in the
      // leg depends on it, so asserting it would pin a fact rather than a rule.
      const listed = await injected.listVideoIds();
      expect([...listed].sort()).toEqual([...videoIds].sort());

      // `upsertSnapshot` wrote a row a request can read back — which is what proves the twelve
      // column names in the `orUpdate` conflict target are the ones the table has.
      const beforeMarking = await fetchDetail();
      expect(
        beforeMarking.videos.find((video) => video.youtubeVideoId === first)?.youtube,
      ).not.toBeNull();

      // `markMissing` returns rows AFFECTED, and the WHERE carries `missing_since_utc IS NULL`:
      // the FIRST absence is stamped and no later tour overwrites it. One, then zero — the number
      // the refresh tour reports as "newly missing", and the reason it may not be the only count it
      // reports (CODE111-I1).
      expect(await injected.markMissing([first], new Date())).toBe(1);
      expect(await injected.markMissing([first], new Date())).toBe(0);
      // An id with no row at all affects nothing — the case the unit suite's fake could not produce.
      expect(await injected.markMissing(['zzzzzzzzzzz'], new Date())).toBe(0);

      const afterMarking = await fetchDetail();
      expect(
        afterMarking.videos.find((video) => video.youtubeVideoId === first)?.youtube,
      ).toBeNull();

      // The id came back, so the absence is over (SPEC §8.2 step 4): the conflict path must reset
      // `missing_since_utc`, and one row must remain rather than two.
      await writeSnapshot(first, 1);
      const afterRewrite = await fetchDetail();
      expect(
        afterRewrite.videos.find((video) => video.youtubeVideoId === first)?.youtube,
      ).not.toBeNull();
      expect(await dataSource.getRepository(YoutubeVideoSnapshot).count()).toBe(1);
    });
  });

  describe('the request path (SPEC §8.5, §13 item 6)', () => {
    it('makes ZERO external calls with the sync leg fully wired and snapshots present', async () => {
      const [first] = videoIds;
      if (first === undefined) throw new Error('no seeded video');
      await writeSnapshot(first, 1);

      // The strongest configuration available: both switches ON, a key present, the client and both
      // tours constructed and registered. B3's spy ran with the leg absent; this one runs with it
      // built, which is the state SPEC §8.5 is actually about. The base URL is unroutable, so even
      // a defect could not reach a provider from CI.
      ({ app } = await bootApp({
        BOOKS_ENABLED: 'true',
        BOOKS_YOUTUBE_SYNC_ENABLED: 'true',
        YOUTUBE_API_KEY: FAKE_KEY,
        YOUTUBE_DATA_API_BASE_URL: FAKE_API_BASE_URL,
      }));

      // The spy is installed at boot and cleared there; the scheduled tour's first run is ten
      // seconds away, far beyond the life of these two requests.
      await request(app.getHttpServer()).get('/api/books').expect(200);
      const body = await fetchDetail();

      expect(body.videos.find((video) => video.youtubeVideoId === first)?.youtube).not.toBeNull();
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });
});
