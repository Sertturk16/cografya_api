import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { JwtService } from '@nestjs/jwt';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AccountRole, AccountStatus } from '../src/auth/account.types';
import { AccessTokenService } from '../src/auth/access-token.service';
import { AuthSecretsProvider } from '../src/auth/auth-secrets.provider';
import { AUTH_TOKEN_AUDIENCE, AUTH_TOKEN_ISSUER } from '../src/auth/auth.constants';
import { User } from '../src/auth/entities/user.entity';
import { BookVideo } from '../src/book/entities/book-video.entity';
import { applyGlobalPrefix } from '../src/common/bootstrap';
import { buildDataSourceOptions } from '../src/database/data-source-options';
import { seedBooks } from '../src/database/seeds/seed-books';
import { seedGeography } from '../src/database/seeds/seed-geography';
import { seedReference } from '../src/database/seeds/seed-reference';
import { Province } from '../src/province/entities/province.entity';
import { District } from '../src/reference/entities/district.entity';

/**
 * P2 (`UYE-VIDEO-KIMLIK-UCU`) e2e — the one guarded `video-identity` endpoint against a REAL
 * Postgres (plan §11.2), plus the cross-endpoint tie that proves the anonymous book payload and
 * this guarded route disagree on purpose: the first withholds `youtubeVideoId`, the second serves
 * it, only to a signed-in caller.
 *
 * Only ONE user is needed — this read is not scoped per caller (plan §5.3): every member sees the
 * same value for the same video.
 */
describe('Video identity (e2e, real Postgres)', () => {
  let container: StartedPostgreSqlContainer;
  let dataSource: DataSource;
  let app: INestApplication;

  let videos: BookVideo[];
  let nextVideoIndex = 0;

  let userId: string;
  let userToken: string;

  /** The next UNUSED seeded video — one dedicated slot per case, mirroring video-progress's own precedent. */
  function nextVideo(): BookVideo {
    const video = videos[nextVideoIndex];
    if (video === undefined) throw new Error('ran out of seeded videos — seed more books');
    nextVideoIndex += 1;
    return video;
  }

  function bearer(token: string): { Authorization: string } {
    return { Authorization: `Bearer ${token}` };
  }

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
    const url = container.getConnectionUri();
    process.env.DATABASE_URL = url;
    process.env.WEB_ORIGIN = 'http://localhost:3000';

    dataSource = new DataSource(buildDataSourceOptions(url));
    await dataSource.initialize();
    await dataSource.runMigrations();

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
    // One dedicated slot per case below (6 today).
    expect(videos.length).toBeGreaterThanOrEqual(6);

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
    const user = await dataSource.getRepository(User).save(
      dataSource.getRepository(User).create({
        firstName: 'Video',
        lastName: 'Identity',
        phone: '+905000000008',
        email: 'video-identity@example.test',
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
        districtId: district.id,
        status: AccountStatus.Active,
        emailVerifiedAt: new Date(),
      }),
    );
    userId = user.id;
    userToken = await accessTokens.mint(user.id, user.tokenVersion);
  }, 300_000);

  afterAll(async () => {
    await app?.close();
    if (dataSource?.isInitialized) await dataSource.destroy();
    await container?.stop();
  });

  it('200 for an authenticated member — returns the entity column value, carries Cache-Control: no-store', async () => {
    const video = nextVideo();
    const response = await request(app.getHttpServer())
      .get(`/api/video-identity/${video.id}`)
      .set(bearer(userToken))
      .expect(200);

    expect(response.headers['cache-control']).toBe('no-store');
    expect(Object.keys(response.body as object).sort()).toEqual(['youtubeVideoId']);
    expect((response.body as { youtubeVideoId: string }).youtubeVideoId).toBe(video.youtubeVideoId);
  });

  it('401 with no Authorization header — no-store STILL applies, and no youtubeVideoId key leaks into the body', async () => {
    const video = nextVideo();
    const response = await request(app.getHttpServer())
      .get(`/api/video-identity/${video.id}`)
      .expect(401);

    expect(response.headers['cache-control']).toBe('no-store');
    expect(Object.prototype.hasOwnProperty.call(response.body as object, 'youtubeVideoId')).toBe(
      false,
    );
  });

  it('401 for an expired access token — identical errors.auth.unauthenticated, indistinguishable from no token at all', async () => {
    const video = nextVideo();
    const secrets = app.get(AuthSecretsProvider);
    const expiredToken = await new JwtService({}).signAsync(
      { sv: 0, typ: 'access' as const },
      {
        secret: secrets.getJwtSecret(),
        algorithm: 'HS256',
        issuer: AUTH_TOKEN_ISSUER,
        audience: AUTH_TOKEN_AUDIENCE,
        subject: userId,
        jwtid: randomUUID(),
        expiresIn: -10,
      },
    );

    const response = await request(app.getHttpServer())
      .get(`/api/video-identity/${video.id}`)
      .set(bearer(expiredToken))
      .expect(401);

    expect((response.body as { message: string }).message).toBe('errors.auth.unauthenticated');
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('404 for a well-formed but unknown bookVideoId', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/video-identity/00000000-0000-4000-8000-000000000000')
      .set(bearer(userToken))
      .expect(404);
    expect((response.body as { message: string }).message).toBe('errors.videoIdentity.notFound');
  });

  it('400 for a malformed (non-UUID) bookVideoId — authenticated, so the pipe is reached (guards run first)', async () => {
    await request(app.getHttpServer())
      .get('/api/video-identity/not-a-uuid')
      .set(bearer(userToken))
      .expect(400);
  });

  it('the cross-endpoint tie: the anonymous book payload withholds youtubeVideoId for the SAME video this route serves it for', async () => {
    const video = nextVideo();
    const bookRow = await dataSource.query<{ slug_tr: string }[]>(
      'SELECT slug_tr FROM books WHERE id = $1',
      [video.bookId],
    );
    const slugTr = bookRow[0]?.slug_tr;
    if (slugTr === undefined) throw new Error('owning book not found');

    const anonymous = await request(app.getHttpServer()).get(`/api/books/${slugTr}`).expect(200);
    const anonymousVideos = (anonymous.body as { videos: { bookVideoId: string }[] }).videos;
    const anonymousEntry = anonymousVideos.find((entry) => entry.bookVideoId === video.id);
    if (anonymousEntry === undefined) throw new Error('video missing from anonymous payload');
    expect(Object.prototype.hasOwnProperty.call(anonymousEntry, 'youtubeVideoId')).toBe(false);

    const guarded = await request(app.getHttpServer())
      .get(`/api/video-identity/${video.id}`)
      .set(bearer(userToken))
      .expect(200);
    expect((guarded.body as { youtubeVideoId: string }).youtubeVideoId).toBe(video.youtubeVideoId);
  });
});
