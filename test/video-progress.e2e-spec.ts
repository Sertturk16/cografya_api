import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import request from 'supertest';
import { DataSource, QueryFailedError } from 'typeorm';
import { AccountRole, AccountStatus } from '../src/auth/account.types';
import { AccessTokenService } from '../src/auth/access-token.service';
import { User } from '../src/auth/entities/user.entity';
import { YoutubeThumbnailKey } from '../src/book/book.types';
import { BookVideo } from '../src/book/entities/book-video.entity';
import { applyGlobalPrefix } from '../src/common/bootstrap';
import { buildDataSourceOptions } from '../src/database/data-source-options';
import { seedBooks } from '../src/database/seeds/seed-books';
import { seedGeography } from '../src/database/seeds/seed-geography';
import { seedReference } from '../src/database/seeds/seed-reference';
import { Province } from '../src/province/entities/province.entity';
import { District } from '../src/reference/entities/district.entity';
import { VideoProgress } from '../src/video-progress/entities/video-progress.entity';
import { VIDEO_PROGRESS_MAX_POSITION_SECONDS } from '../src/video-progress/video-progress-duration';
import { YoutubeSnapshotStore } from '../src/book/youtube/youtube-snapshot.store';

/**
 * UYELIK-05 e2e — the two protected `video-progress` endpoints against a REAL Postgres
 * (`UYELIK-05-plan.md` §11). One container, one migration run; geography + reference are seeded
 * only because `users.district_id` needs a real row to point at, and the book corpus is seeded so
 * real `BookVideo` fixtures exist to progress against.
 *
 * A DEDICATED book video per case (never reused across two `it()` blocks) so the unique
 * `(user_id, book_video_id)` constraint never makes one case's write interfere with another's —
 * the same reason `book-youtube.e2e-spec.ts` isolates its snapshot writes.
 */
describe('Video progress (e2e, real Postgres)', () => {
  let container: StartedPostgreSqlContainer;
  let dataSource: DataSource;
  let app: INestApplication;
  let store: YoutubeSnapshotStore;

  let videos: BookVideo[];
  let nextVideoIndex = 0;

  let userAId: string;
  let userBId: string;
  let userAToken: string;
  let userBToken: string;

  /** The next UNUSED seeded video — guarantees every case gets its own row. */
  function nextVideo(): BookVideo {
    const video = videos[nextVideoIndex];
    if (video === undefined) throw new Error('ran out of seeded videos — seed more books');
    nextVideoIndex += 1;
    return video;
  }

  function bearer(token: string): { Authorization: string } {
    return { Authorization: `Bearer ${token}` };
  }

  async function createUser(email: string, districtId: string): Promise<User> {
    return dataSource.getRepository(User).save(
      dataSource.getRepository(User).create({
        firstName: 'Video',
        lastName: 'Progress',
        phone: '+905000000009',
        email,
        // A properly-shaped, unreachable Argon2id hash — no live password behind it
        // (`session.service.ts`'s own `SYNTHETIC_TIMING_HASH` precedent). Login is never
        // exercised in this file; only `CHK_users_password_hash` needs to accept the shape.
        passwordHash:
          '$argon2id$v=19$m=19456,p=1,t=2$APrKX34k6VE7WGm0QyxNUA$fUFGautIsXjwaF9PfALc5EeetF5UHJq43ElafSQOVPM',
        accountRole: AccountRole.Teacher,
        educationLevel: null,
        gradeLevel: null,
        studyStream: null,
        universityName: null,
        departmentName: null,
        districtId,
        status: AccountStatus.Active,
        emailVerifiedAt: new Date(),
      }),
    );
  }

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
    const url = container.getConnectionUri();
    process.env.DATABASE_URL = url;
    process.env.WEB_ORIGIN = 'http://localhost:3000';

    dataSource = new DataSource(buildDataSourceOptions(url));
    await dataSource.initialize();
    await dataSource.runMigrations();

    // Districts hang off provinces (the reference seed's own precondition).
    await seedGeography(dataSource);
    await seedReference(dataSource);
    await seedBooks(dataSource);

    const istanbul = await dataSource
      .getRepository(Province)
      .findOneOrFail({ where: { plateCode: '34' } });
    const district = await dataSource
      .getRepository(District)
      .findOneOrFail({ where: { provinceId: istanbul.id } });

    videos = await dataSource.getRepository(BookVideo).find({ order: { id: 'ASC' } });
    // One dedicated slot per case below (15 today) — a book seed with 40 denemeler across even
    // one book already exceeds this by a wide margin.
    expect(videos.length).toBeGreaterThanOrEqual(15);

    store = new YoutubeSnapshotStore(dataSource);

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const appModule = require('../src/app.module') as typeof import('../src/app.module');
    const moduleRef = await Test.createTestingModule({ imports: [appModule.AppModule] }).compile();
    app = moduleRef.createNestApplication();
    applyGlobalPrefix(app);
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();

    const accessTokens = app.get(AccessTokenService);
    const userA = await createUser('video-progress-a@example.test', district.id);
    const userB = await createUser('video-progress-b@example.test', district.id);
    userAId = userA.id;
    userBId = userB.id;
    userAToken = await accessTokens.mint(userA.id, userA.tokenVersion);
    userBToken = await accessTokens.mint(userB.id, userB.tokenVersion);
  }, 300_000);

  afterAll(async () => {
    await app?.close();
    if (dataSource?.isInitialized) await dataSource.destroy();
    await container?.stop();
  });

  describe('the auth boundary', () => {
    it('GET with no Authorization header -> 401', async () => {
      const video = nextVideo();
      await request(app.getHttpServer()).get(`/api/video-progress/${video.id}`).expect(401);
    });

    it('PUT with no Authorization header -> 401', async () => {
      const video = nextVideo();
      await request(app.getHttpServer())
        .put(`/api/video-progress/${video.id}`)
        .send({ lastPositionSeconds: 10, watched: false })
        .expect(401);
    });
  });

  describe('schema — FK delete rules (PR #141 round-1 CRITICAL fix, CASCADE -> RESTRICT)', () => {
    it('FK_video_progress_user is ON DELETE CASCADE, FK_video_progress_book_video is ON DELETE RESTRICT', async () => {
      // Read straight from `information_schema.referential_constraints` rather than trusting the
      // entity/migration docblocks — a query that can't see the table (or a renamed constraint) at
      // all must fail RED here, not silently pass (the `auth-schema.e2e-spec.ts` `E2E-SC5` pattern).
      const rows = await dataSource.query<{ constraint_name: string; delete_rule: string }[]>(`
        SELECT constraint_name, delete_rule
        FROM information_schema.referential_constraints
        WHERE constraint_name IN ('FK_video_progress_user', 'FK_video_progress_book_video')
      `);
      const rules = Object.fromEntries(rows.map((row) => [row.constraint_name, row.delete_rule]));
      expect(rules).toEqual({
        FK_video_progress_user: 'CASCADE',
        FK_video_progress_book_video: 'RESTRICT',
      });
    });

    it('deleting a book_video that still has progress is rejected (23503), never cascaded away', async () => {
      const video = nextVideo();
      await request(app.getHttpServer())
        .put(`/api/video-progress/${video.id}`)
        .set(bearer(userAToken))
        .send({ lastPositionSeconds: 5, watched: false })
        .expect(200);

      await expect(
        dataSource.query(`DELETE FROM book_videos WHERE id = $1`, [video.id]),
      ).rejects.toBeInstanceOf(QueryFailedError);

      const stillThere = await dataSource
        .getRepository(VideoProgress)
        .count({ where: { bookVideoId: video.id } });
      expect(stillThere).toBe(1);
    });
  });

  it('GET with no saved progress -> 404 errors.videoProgress.notFound', async () => {
    const video = nextVideo();
    const response = await request(app.getHttpServer())
      .get(`/api/video-progress/${video.id}`)
      .set(bearer(userAToken))
      .expect(404);
    expect((response.body as { message: string }).message).toBe('errors.videoProgress.notFound');
  });

  it('PUT valid payload -> 200, echoes the persisted row; a follow-up GET returns the same values', async () => {
    const video = nextVideo();
    const putResponse = await request(app.getHttpServer())
      .put(`/api/video-progress/${video.id}`)
      .set(bearer(userAToken))
      .send({ lastPositionSeconds: 120, watched: false })
      .expect(200);

    const body = putResponse.body as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual([
      'bookVideoId',
      'lastPositionSeconds',
      'updatedAt',
      'watched',
      'watchedAt',
    ]);
    expect(body).toMatchObject({
      bookVideoId: video.id,
      lastPositionSeconds: 120,
      watched: false,
      watchedAt: null,
    });
    expect(typeof body.updatedAt).toBe('string');

    const getResponse = await request(app.getHttpServer())
      .get(`/api/video-progress/${video.id}`)
      .set(bearer(userAToken))
      .expect(200);
    expect(getResponse.body).toEqual(body);
  });

  it('PUT the identical payload twice -> 200 both times, exactly one row (idempotency)', async () => {
    const video = nextVideo();
    await request(app.getHttpServer())
      .put(`/api/video-progress/${video.id}`)
      .set(bearer(userAToken))
      .send({ lastPositionSeconds: 55, watched: false })
      .expect(200);
    await request(app.getHttpServer())
      .put(`/api/video-progress/${video.id}`)
      .set(bearer(userAToken))
      .send({ lastPositionSeconds: 55, watched: false })
      .expect(200);

    const count = await dataSource
      .getRepository(VideoProgress)
      .count({ where: { userId: userAId, bookVideoId: video.id } });
    expect(count).toBe(1);
  });

  it('two concurrent identical PUTs -> exactly one row (concurrency race)', async () => {
    const video = nextVideo();
    const fire = (): request.Test =>
      request(app.getHttpServer())
        .put(`/api/video-progress/${video.id}`)
        .set(bearer(userAToken))
        .send({ lastPositionSeconds: 30, watched: false });

    const [first, second] = await Promise.all([fire(), fire()]);
    expect([first.status, second.status]).toEqual([200, 200]);

    const count = await dataSource
      .getRepository(VideoProgress)
      .count({ where: { userId: userAId, bookVideoId: video.id } });
    expect(count).toBe(1);
  });

  describe('duration validation', () => {
    it('PUT beyond a KNOWN snapshot duration -> 400; exactly at it -> 200', async () => {
      const video = nextVideo();
      await store.upsertSnapshot(
        {
          youtubeVideoId: video.youtubeVideoId,
          thumbnailKey: YoutubeThumbnailKey.Maxres,
          thumbnailUrl: 'https://example.invalid/thumb.jpg',
          thumbnailWidth: 1280,
          thumbnailHeight: 720,
          publishedAtUtc: new Date(),
          durationIso: 'PT5M0S',
          durationSeconds: 300,
          embeddable: true,
          privacyStatus: 'public',
        },
        new Date(),
      );

      const rejected = await request(app.getHttpServer())
        .put(`/api/video-progress/${video.id}`)
        .set(bearer(userAToken))
        .send({ lastPositionSeconds: 301, watched: false })
        .expect(400);
      expect((rejected.body as { message: string }).message).toBe(
        'errors.videoProgress.positionExceedsDuration',
      );

      // `<=`, not `<` — landing exactly at the end is valid (plan §5.4 step 3).
      await request(app.getHttpServer())
        .put(`/api/video-progress/${video.id}`)
        .set(bearer(userAToken))
        .send({ lastPositionSeconds: 300, watched: false })
        .expect(200);
    });

    it('PUT AT the fallback ceiling with no snapshot present -> 200 (boundary)', async () => {
      // This sends EXACTLY `VIDEO_PROGRESS_MAX_POSITION_SECONDS`, not beyond it — the previous
      // title claimed 400, which this case has never actually asserted. The service-level
      // `positionExceedsDuration` rejection on the UNKNOWN-duration branch (i.e. a value strictly
      // GREATER than the fallback ceiling, with no snapshot present) is architecturally
      // untestable via e2e beyond this boundary: the DTO's `@Max(VIDEO_PROGRESS_MAX_POSITION_SECONDS)`
      // ceiling and the service's fallback ceiling read the same exported constant, so any request
      // body that exceeds it is already rejected by the global `ValidationPipe` before the handler
      // (and this branch) ever runs — see the case above this one, which pins exactly that framework
      // gate. Only the unit test (`resolveMaxAllowedPosition(null)` in
      // `video-progress-duration.spec.ts`) actually pins this branch's return value.
      const video = nextVideo();
      const response = await request(app.getHttpServer())
        .put(`/api/video-progress/${video.id}`)
        .set(bearer(userAToken))
        .send({ lastPositionSeconds: VIDEO_PROGRESS_MAX_POSITION_SECONDS, watched: false })
        .expect(200);
      expect((response.body as { lastPositionSeconds: number }).lastPositionSeconds).toBe(
        VIDEO_PROGRESS_MAX_POSITION_SECONDS,
      );
    });

    it('PUT above the DTO-level ceiling with no snapshot present -> 400 (framework validation)', async () => {
      // `@Max(VIDEO_PROGRESS_MAX_POSITION_SECONDS)` on the DTO fires before the handler runs, so
      // this never reaches the service's own duration check — asserted as its own case because
      // it is a DIFFERENT gate from the one above.
      const video = nextVideo();
      await request(app.getHttpServer())
        .put(`/api/video-progress/${video.id}`)
        .set(bearer(userAToken))
        .send({ lastPositionSeconds: VIDEO_PROGRESS_MAX_POSITION_SECONDS + 1, watched: false })
        .expect(400);
    });
  });

  it("cross-user isolation — B never sees A's row, B's write never touches A's row", async () => {
    const video = nextVideo();
    await request(app.getHttpServer())
      .put(`/api/video-progress/${video.id}`)
      .set(bearer(userAToken))
      .send({ lastPositionSeconds: 42, watched: false })
      .expect(200);

    // B has no row of its own yet for this exact video — the SAME bookVideoId A just wrote.
    await request(app.getHttpServer())
      .get(`/api/video-progress/${video.id}`)
      .set(bearer(userBToken))
      .expect(404);

    const putB = await request(app.getHttpServer())
      .put(`/api/video-progress/${video.id}`)
      .set(bearer(userBToken))
      .send({ lastPositionSeconds: 7, watched: false })
      .expect(200);
    expect((putB.body as { lastPositionSeconds: number }).lastPositionSeconds).toBe(7);

    // A's row is untouched by B's write.
    const getA = await request(app.getHttpServer())
      .get(`/api/video-progress/${video.id}`)
      .set(bearer(userAToken))
      .expect(200);
    expect((getA.body as { lastPositionSeconds: number }).lastPositionSeconds).toBe(42);

    const rows = await dataSource
      .getRepository(VideoProgress)
      .find({ where: { bookVideoId: video.id } });
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.userId).sort()).toEqual([userAId, userBId].sort());
  });

  describe('malformed / not-found input', () => {
    it('PUT a malformed (non-UUID) bookVideoId -> 400', async () => {
      await request(app.getHttpServer())
        .put('/api/video-progress/not-a-uuid')
        .set(bearer(userAToken))
        .send({ lastPositionSeconds: 10, watched: false })
        .expect(400);
    });

    it('GET a malformed (non-UUID) bookVideoId -> 400', async () => {
      await request(app.getHttpServer())
        .get('/api/video-progress/not-a-uuid')
        .set(bearer(userAToken))
        .expect(400);
    });

    it('PUT a well-formed but nonexistent bookVideoId -> 404 errors.videoProgress.videoNotFound', async () => {
      const response = await request(app.getHttpServer())
        .put('/api/video-progress/00000000-0000-4000-8000-000000000000')
        .set(bearer(userAToken))
        .send({ lastPositionSeconds: 10, watched: false })
        .expect(404);
      expect((response.body as { message: string }).message).toBe(
        'errors.videoProgress.videoNotFound',
      );
    });

    it('PUT a negative lastPositionSeconds -> 400 (DTO validation)', async () => {
      const video = nextVideo();
      await request(app.getHttpServer())
        .put(`/api/video-progress/${video.id}`)
        .set(bearer(userAToken))
        .send({ lastPositionSeconds: -1, watched: false })
        .expect(400);
    });

    it('PUT a missing watched field -> 400 (DTO validation)', async () => {
      const video = nextVideo();
      await request(app.getHttpServer())
        .put(`/api/video-progress/${video.id}`)
        .set(bearer(userAToken))
        .send({ lastPositionSeconds: 10 })
        .expect(400);
    });

    it('PUT an unknown extra field -> 400 (forbidNonWhitelisted)', async () => {
      const video = nextVideo();
      await request(app.getHttpServer())
        .put(`/api/video-progress/${video.id}`)
        .set(bearer(userAToken))
        .send({ lastPositionSeconds: 10, watched: false, userId: userBId })
        .expect(400);
    });
  });

  it('watched:true -> watchedAt populated; a later watched:false -> watchedAt null again', async () => {
    const video = nextVideo();
    const first = await request(app.getHttpServer())
      .put(`/api/video-progress/${video.id}`)
      .set(bearer(userAToken))
      .send({ lastPositionSeconds: 10, watched: true })
      .expect(200);
    const firstBody = first.body as { watched: boolean; watchedAt: string | null };
    expect(firstBody.watched).toBe(true);
    expect(firstBody.watchedAt).not.toBeNull();
    expect(typeof firstBody.watchedAt).toBe('string');

    const second = await request(app.getHttpServer())
      .put(`/api/video-progress/${video.id}`)
      .set(bearer(userAToken))
      .send({ lastPositionSeconds: 10, watched: false })
      .expect(200);
    const secondBody = second.body as { watched: boolean; watchedAt: string | null };
    expect(secondBody.watched).toBe(false);
    expect(secondBody.watchedAt).toBeNull();
  });
});
