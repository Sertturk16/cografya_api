import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import request from 'supertest';
import { DataSource, QueryFailedError } from 'typeorm';
import { AccountRole, AccountStatus } from '../src/auth/account.types';
import { AccessTokenService } from '../src/auth/access-token.service';
import { User } from '../src/auth/entities/user.entity';
import { applyGlobalPrefix } from '../src/common/bootstrap';
import { buildDataSourceOptions } from '../src/database/data-source-options';
import { seedGeography } from '../src/database/seeds/seed-geography';
import { seedReference } from '../src/database/seeds/seed-reference';
import {
  GAME_ROUND_COMPLETION_TIME_SECONDS_MAX,
  GAME_ROUND_COUNTER_MAX,
  GAME_ROUND_TOTAL_WRONGS_MAX,
} from '../src/game-rounds/dto/submit-game-round-request.dto';
import { GameRound } from '../src/game-rounds/entities/game-round.entity';
import { GAME_ROUND_SUBMIT_RATE_LIMIT } from '../src/game-rounds/game-round-submit-rate-limit.service';
import { GAME_ROUNDS_ERROR_KEYS } from '../src/game-rounds/game-rounds-error-keys';
import { Province } from '../src/province/entities/province.entity';
import { District } from '../src/reference/entities/district.entity';

/**
 * UYELIK-09 e2e — the two protected `game-rounds` endpoints against a REAL Postgres
 * (`UYELIK-09-plan.md` §11). One container, one migration run; geography + reference are seeded
 * because `users.district_id` needs a real row to point at — no `seedWorld` (this module has no
 * Province/Country relation at all, plan §11).
 */
describe('Game rounds (e2e, real Postgres)', () => {
  let container: StartedPostgreSqlContainer;
  let dataSource: DataSource;
  let app: INestApplication;

  let districtId: string;
  let userAId: string;
  let userBId: string;
  let userAToken: string;
  let userBToken: string;

  function bearer(token: string): { Authorization: string } {
    return { Authorization: `Bearer ${token}` };
  }

  async function createUser(email: string): Promise<User> {
    return dataSource.getRepository(User).save(
      dataSource.getRepository(User).create({
        firstName: 'GameRounds',
        lastName: 'Test',
        phone: '+905000000010',
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

  async function mintFor(user: User): Promise<string> {
    const accessTokens = app.get(AccessTokenService);
    return accessTokens.mint(user.id, user.tokenVersion);
  }

  /** A minimal, internally-consistent valid submit body — overridable per case. */
  function validBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      mode: 'provinces',
      clientRoundId: `round-${Math.random().toString(36).slice(2)}-${Date.now()}`,
      score: 87,
      found: 70,
      firstTry: 60,
      total: 81,
      poolTotal: 81,
      totalWrongs: 12,
      endedEarly: false,
      ...overrides,
    };
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

    const istanbul = await dataSource
      .getRepository(Province)
      .findOneOrFail({ where: { plateCode: '34' } });
    const district = await dataSource
      .getRepository(District)
      .findOneOrFail({ where: { provinceId: istanbul.id } });
    districtId = district.id;

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const appModule = require('../src/app.module') as typeof import('../src/app.module');
    const moduleRef = await Test.createTestingModule({ imports: [appModule.AppModule] }).compile();
    app = moduleRef.createNestApplication();
    applyGlobalPrefix(app);
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();

    const userA = await createUser('game-rounds-a@example.test');
    const userB = await createUser('game-rounds-b@example.test');
    userAId = userA.id;
    userBId = userB.id;
    userAToken = await mintFor(userA);
    userBToken = await mintFor(userB);
  }, 300_000);

  afterAll(async () => {
    await app?.close();
    if (dataSource?.isInitialized) await dataSource.destroy();
    await container?.stop();
  });

  describe('the auth boundary', () => {
    it('POST /api/game-rounds with no Authorization header -> 401, Cache-Control: no-store', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/game-rounds')
        .send(validBody())
        .expect(401);
      expect(response.headers['cache-control']).toBe('no-store');
    });

    it('GET /api/game-rounds with no Authorization header -> 401, Cache-Control: no-store', async () => {
      const response = await request(app.getHttpServer()).get('/api/game-rounds').expect(401);
      expect(response.headers['cache-control']).toBe('no-store');
    });
  });

  describe('submit — happy path, idempotency, concurrency', () => {
    it('POST a valid round -> 200, echoes the submitted values; a follow-up GET lists it', async () => {
      const body = validBody();
      const postResponse = await request(app.getHttpServer())
        .post('/api/game-rounds')
        .set(bearer(userAToken))
        .send(body)
        .expect(200);
      expect(postResponse.headers['cache-control']).toBe('no-store');

      const responseBody = postResponse.body as Record<string, unknown>;
      expect(Object.keys(responseBody).sort()).toEqual(
        [
          'clientRoundId',
          'completionTimeSeconds',
          'createdAt',
          'endedEarly',
          'firstTry',
          'found',
          'mode',
          'poolTotal',
          'score',
          'total',
          'totalWrongs',
        ].sort(),
      );
      expect(responseBody).toMatchObject({
        mode: body.mode,
        clientRoundId: body.clientRoundId,
        score: body.score,
        found: body.found,
        firstTry: body.firstTry,
        total: body.total,
        poolTotal: body.poolTotal,
        totalWrongs: body.totalWrongs,
        endedEarly: body.endedEarly,
        completionTimeSeconds: null,
      });
      expect(typeof responseBody.createdAt).toBe('string');

      const getResponse = await request(app.getHttpServer())
        .get('/api/game-rounds')
        .set(bearer(userAToken))
        .expect(200);
      expect(getResponse.headers['cache-control']).toBe('no-store');
      const items = (getResponse.body as { items: Record<string, unknown>[] }).items;
      expect(items).toContainEqual(responseBody);
    });

    it('POST the same clientRoundId twice with the SAME body -> 200 both times, exactly one row', async () => {
      const body = validBody();
      await request(app.getHttpServer())
        .post('/api/game-rounds')
        .set(bearer(userAToken))
        .send(body)
        .expect(200);
      await request(app.getHttpServer())
        .post('/api/game-rounds')
        .set(bearer(userAToken))
        .send(body)
        .expect(200);

      const count = await dataSource
        .getRepository(GameRound)
        .count({ where: { userId: userAId, clientRoundId: body.clientRoundId as string } });
      expect(count).toBe(1);
    });

    it('POST the same clientRoundId twice with a DIFFERENT body -> 200, echoes the ORIGINAL values', async () => {
      const clientRoundId = `round-diff-${Date.now()}`;
      const firstBody = validBody({ clientRoundId, score: 50, found: 40, firstTry: 30 });
      const firstResponse = await request(app.getHttpServer())
        .post('/api/game-rounds')
        .set(bearer(userAToken))
        .send(firstBody)
        .expect(200);

      const secondBody = validBody({ clientRoundId, score: 99, found: 81, firstTry: 81 });
      const secondResponse = await request(app.getHttpServer())
        .post('/api/game-rounds')
        .set(bearer(userAToken))
        .send(secondBody)
        .expect(200);

      expect(secondResponse.body).toEqual(firstResponse.body);

      const count = await dataSource
        .getRepository(GameRound)
        .count({ where: { userId: userAId, clientRoundId } });
      expect(count).toBe(1);
    });

    it('Promise.all of two concurrent identical submissions -> exactly one row', async () => {
      const body = validBody();
      const fire = (): request.Test =>
        request(app.getHttpServer()).post('/api/game-rounds').set(bearer(userAToken)).send(body);

      const [first, second] = await Promise.all([fire(), fire()]);
      expect([first.status, second.status]).toEqual([200, 200]);

      const count = await dataSource
        .getRepository(GameRound)
        .count({ where: { userId: userAId, clientRoundId: body.clientRoundId as string } });
      expect(count).toBe(1);
    });

    it('two DIFFERENT users submitting the identical clientRoundId string -> both succeed as two independent rows', async () => {
      const clientRoundId = `round-shared-${Date.now()}`;
      const aResponse = await request(app.getHttpServer())
        .post('/api/game-rounds')
        .set(bearer(userAToken))
        .send(validBody({ clientRoundId }))
        .expect(200);
      const bResponse = await request(app.getHttpServer())
        .post('/api/game-rounds')
        .set(bearer(userBToken))
        .send(validBody({ clientRoundId }))
        .expect(200);

      expect(aResponse.body).toMatchObject({ clientRoundId });
      expect(bResponse.body).toMatchObject({ clientRoundId });

      const countA = await dataSource
        .getRepository(GameRound)
        .count({ where: { userId: userAId, clientRoundId } });
      const countB = await dataSource
        .getRepository(GameRound)
        .count({ where: { userId: userBId, clientRoundId } });
      expect(countA).toBe(1);
      expect(countB).toBe(1);
    });
  });

  describe('submit — cross-field structural validation (400)', () => {
    it('found > total -> 400 invalidSummary', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/game-rounds')
        .set(bearer(userAToken))
        .send(validBody({ found: 82, total: 81, poolTotal: 81 }))
        .expect(400);
      expect((response.body as { message: string }).message).toBe(
        'errors.gameRounds.invalidSummary',
      );
    });

    it('firstTry > found -> 400 invalidSummary', async () => {
      await request(app.getHttpServer())
        .post('/api/game-rounds')
        .set(bearer(userAToken))
        .send(validBody({ found: 40, firstTry: 41 }))
        .expect(400);
    });

    it('total > poolTotal -> 400 invalidSummary', async () => {
      await request(app.getHttpServer())
        .post('/api/game-rounds')
        .set(bearer(userAToken))
        .send(validBody({ total: 82, poolTotal: 81 }))
        .expect(400);
    });

    it('endedEarly: false with total !== poolTotal -> 400 invalidSummary', async () => {
      await request(app.getHttpServer())
        .post('/api/game-rounds')
        .set(bearer(userAToken))
        .send(validBody({ endedEarly: false, total: 40, poolTotal: 81, found: 40, firstTry: 30 }))
        .expect(400);
    });

    it('endedEarly: true with total !== poolTotal -> 200 (not a violation when ended early)', async () => {
      await request(app.getHttpServer())
        .post('/api/game-rounds')
        .set(bearer(userAToken))
        .send(validBody({ endedEarly: true, total: 40, poolTotal: 81, found: 40, firstTry: 30 }))
        .expect(200);
    });
  });

  describe('submit — out-of-range values (400)', () => {
    // `%s = %d -> 400` — lower AND upper bounds for every field that has both (CODE145-M1,
    // PR #145 fix-round-2: this table used to test only the lower bound for every field except
    // `score`). The three MAX constants are the SAME exported constants the DTO's own decorators
    // use (`GAME_ROUND_COUNTER_MAX`/`GAME_ROUND_TOTAL_WRONGS_MAX`/
    // `GAME_ROUND_COMPLETION_TIME_SECONDS_MAX`), declared once and reused here — the
    // `BOOK_LIST_*` precedent the DTO's own docblock names.
    it.each([
      ['score', 101],
      ['score', -1],
      ['found', -1],
      ['found', GAME_ROUND_COUNTER_MAX + 1],
      ['firstTry', -1],
      ['firstTry', GAME_ROUND_COUNTER_MAX + 1],
      ['total', -1],
      ['total', GAME_ROUND_COUNTER_MAX + 1],
      ['poolTotal', -1],
      ['poolTotal', GAME_ROUND_COUNTER_MAX + 1],
      ['totalWrongs', -1],
      ['totalWrongs', GAME_ROUND_TOTAL_WRONGS_MAX + 1],
      ['completionTimeSeconds', -1],
      ['completionTimeSeconds', GAME_ROUND_COMPLETION_TIME_SECONDS_MAX + 1],
    ])('%s = %d -> 400', async (field, value) => {
      await request(app.getHttpServer())
        .post('/api/game-rounds')
        .set(bearer(userAToken))
        .send(validBody({ [field]: value }))
        .expect(400);
    });
  });

  describe('submit — completionTimeSeconds optionality', () => {
    it('omitted -> 200, stored/echoed as null', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/game-rounds')
        .set(bearer(userAToken))
        .send(validBody())
        .expect(200);
      expect(response.body).toMatchObject({ completionTimeSeconds: null });
    });

    it('explicit null -> 200, stored/echoed as null', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/game-rounds')
        .set(bearer(userAToken))
        .send(validBody({ completionTimeSeconds: null }))
        .expect(200);
      expect(response.body).toMatchObject({ completionTimeSeconds: null });
    });

    it('a valid non-negative value -> 200, stored and echoed unchanged', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/game-rounds')
        .set(bearer(userAToken))
        .send(validBody({ completionTimeSeconds: 340 }))
        .expect(200);
      expect(response.body).toMatchObject({ completionTimeSeconds: 340 });
    });
  });

  describe('the per-user submission rate limit (PR #145 fix-round-2, SEC145-I1/VAL145-I1)', () => {
    /**
     * The SAME fixed-window formula `GameRoundSubmitRateLimitService.consume` uses
     * (`Math.floor(now / windowMs) * windowMs`) — used here only to pre-seed
     * `game_round_submit_rate_limits` directly via SQL, so a boundary case does not need
     * `GAME_ROUND_SUBMIT_RATE_LIMIT.limit` (300) real HTTP round-trips to set up. The window is
     * an HOUR wide, so the gap between computing this value and firing the immediate next
     * request below (milliseconds) never crosses a window boundary in practice.
     */
    function currentWindowStart(): Date {
      return new Date(
        Math.floor(Date.now() / GAME_ROUND_SUBMIT_RATE_LIMIT.windowMs) *
          GAME_ROUND_SUBMIT_RATE_LIMIT.windowMs,
      );
    }

    async function seedAtCeiling(userId: string): Promise<void> {
      await dataSource.query(
        `INSERT INTO "game_round_submit_rate_limits"
           ("user_id", "window_start", "attempt_count", "updated_at")
         VALUES ($1, $2, $3, now())`,
        [userId, currentWindowStart(), GAME_ROUND_SUBMIT_RATE_LIMIT.limit],
      );
    }

    it('a fresh user well under the ceiling submits normally (200)', async () => {
      const user = await createUser('game-rounds-ratelimit-fresh@example.test');
      const token = await mintFor(user);

      await request(app.getHttpServer())
        .post('/api/game-rounds')
        .set(bearer(token))
        .send(validBody())
        .expect(200);
    });

    it('at the ceiling, the next submission in the same window -> 429 tooManySubmissions, Cache-Control: no-store, Retry-After', async () => {
      const user = await createUser('game-rounds-ratelimit-at-ceiling@example.test');
      const token = await mintFor(user);
      await seedAtCeiling(user.id);

      const beforeMs = Date.now();
      const response = await request(app.getHttpServer())
        .post('/api/game-rounds')
        .set(bearer(token))
        .send(validBody())
        .expect(429);
      expect((response.body as { message: string }).message).toBe(
        GAME_ROUNDS_ERROR_KEYS.tooManySubmissions,
      );
      expect(response.headers['cache-control']).toBe('no-store');

      // SEC145R2-M1: `retryAfterSeconds`, already computed correctly by
      // `GameRoundSubmitRateLimitService.consume`, must actually reach the client — as the
      // standard `Retry-After` header (seconds), the same signal this app's own global throttler
      // already sets on its 429s. Numerically correct means: a whole, positive number of seconds
      // (never 0 — this response IS the blocked one) that does not exceed the window width (an
      // hour), and — independently, without trusting the guard's own arithmetic — that it lands
      // within the exact second range the fixed window's own end time allows for a request fired
      // between `beforeMs` and now.
      const retryAfterHeader = response.headers['retry-after'];
      expect(retryAfterHeader).toBeDefined();
      expect(retryAfterHeader).toMatch(/^\d+$/);
      const retryAfterSeconds = Number(retryAfterHeader);
      expect(retryAfterSeconds).toBeGreaterThan(0);
      expect(retryAfterSeconds).toBeLessThanOrEqual(GAME_ROUND_SUBMIT_RATE_LIMIT.windowMs / 1000);

      const windowEndMs = currentWindowStart().getTime() + GAME_ROUND_SUBMIT_RATE_LIMIT.windowMs;
      const afterMs = Date.now();
      const expectedMin = Math.ceil((windowEndMs - afterMs) / 1000);
      const expectedMax = Math.ceil((windowEndMs - beforeMs) / 1000);
      expect(retryAfterSeconds).toBeGreaterThanOrEqual(expectedMin);
      expect(retryAfterSeconds).toBeLessThanOrEqual(expectedMax);
    });

    it("a different user's counter is independent: one user at the ceiling (429) does not affect a second user's own submit (200) in the SAME window", async () => {
      const throttledUser = await createUser('game-rounds-ratelimit-cross-a@example.test');
      const throttledToken = await mintFor(throttledUser);
      await seedAtCeiling(throttledUser.id);
      await request(app.getHttpServer())
        .post('/api/game-rounds')
        .set(bearer(throttledToken))
        .send(validBody())
        .expect(429);

      const freeUser = await createUser('game-rounds-ratelimit-cross-b@example.test');
      const freeToken = await mintFor(freeUser);
      await request(app.getHttpServer())
        .post('/api/game-rounds')
        .set(bearer(freeToken))
        .send(validBody())
        .expect(200);
    });
  });

  describe('GET — pagination and cross-user isolation', () => {
    it('GET with no history (fresh user) -> 200, empty envelope', async () => {
      const freshUser = await createUser('game-rounds-fresh@example.test');
      const freshToken = await mintFor(freshUser);

      const response = await request(app.getHttpServer())
        .get('/api/game-rounds')
        .set(bearer(freshToken))
        .expect(200);
      expect(response.body).toEqual({ items: [], page: 1, pageSize: 20, total: 0, hasMore: false });
    });

    it('pages correctly: page 1 is exactly pageSize items DESC with hasMore true; the last page holds the remainder with hasMore false', async () => {
      const pagingUser = await createUser('game-rounds-paging@example.test');
      const pagingToken = await mintFor(pagingUser);

      const ROW_COUNT = 5;
      const PAGE_SIZE = 2;
      for (let i = 0; i < ROW_COUNT; i += 1) {
        await request(app.getHttpServer())
          .post('/api/game-rounds')
          .set(bearer(pagingToken))
          .send(validBody({ clientRoundId: `paging-round-${i}` }))
          .expect(200);
      }

      const page1 = await request(app.getHttpServer())
        .get(`/api/game-rounds?page=1&pageSize=${PAGE_SIZE}`)
        .set(bearer(pagingToken))
        .expect(200);
      const page1Body = page1.body as {
        items: { clientRoundId: string; createdAt: string }[];
        total: number;
        hasMore: boolean;
      };
      expect(page1Body.items).toHaveLength(PAGE_SIZE);
      expect(page1Body.total).toBe(ROW_COUNT);
      expect(page1Body.hasMore).toBe(true);
      // DESC order: most recently created first.
      const timestamps = page1Body.items.map((item) => Date.parse(item.createdAt));
      expect(timestamps[0]).toBeGreaterThanOrEqual(timestamps[1] ?? 0);

      const lastPage = Math.ceil(ROW_COUNT / PAGE_SIZE);
      const finalPage = await request(app.getHttpServer())
        .get(`/api/game-rounds?page=${lastPage}&pageSize=${PAGE_SIZE}`)
        .set(bearer(pagingToken))
        .expect(200);
      const finalBody = finalPage.body as { items: unknown[]; hasMore: boolean };
      expect(finalBody.items).toHaveLength(ROW_COUNT % PAGE_SIZE || PAGE_SIZE);
      expect(finalBody.hasMore).toBe(false);
    });

    it("cross-user isolation: user A submits a round; user B's GET never sees it", async () => {
      const clientRoundId = `isolation-round-${Date.now()}`;
      await request(app.getHttpServer())
        .post('/api/game-rounds')
        .set(bearer(userAToken))
        .send(validBody({ clientRoundId }))
        .expect(200);

      const bResponse = await request(app.getHttpServer())
        .get('/api/game-rounds')
        .set(bearer(userBToken))
        .expect(200);
      const bItems = (bResponse.body as { items: { clientRoundId: string }[] }).items;
      expect(bItems.some((item) => item.clientRoundId === clientRoundId)).toBe(false);
    });
  });

  describe('schema — FK delete rule (information_schema, not a live delete)', () => {
    it('FK_game_rounds_user is CASCADE', async () => {
      const rows = await dataSource.query<{ constraint_name: string; delete_rule: string }[]>(`
        SELECT constraint_name, delete_rule
        FROM information_schema.referential_constraints
        WHERE constraint_name = 'FK_game_rounds_user'
      `);
      const rules = Object.fromEntries(rows.map((row) => [row.constraint_name, row.delete_rule]));
      expect(rules).toEqual({ FK_game_rounds_user: 'CASCADE' });
    });
  });

  describe('schema — CHECK constraints (raw insert, bypassing the service)', () => {
    const baseColumns = {
      found: 1,
      first_try: 1,
      total: 1,
      pool_total: 1,
      total_wrongs: 0,
      ended_early: false,
    };

    it('score = 150 is rejected by CHK_game_rounds_score', async () => {
      await expect(
        dataSource.query(
          `INSERT INTO "game_rounds"
             ("user_id", "client_round_id", "mode", "score", "found", "first_try", "total",
              "pool_total", "total_wrongs", "ended_early")
           VALUES ($1, $2, 'provinces', 150, $3, $4, $5, $6, $7, $8)`,
          [
            userBId,
            `check-score-${Date.now()}`,
            baseColumns.found,
            baseColumns.first_try,
            baseColumns.total,
            baseColumns.pool_total,
            baseColumns.total_wrongs,
            baseColumns.ended_early,
          ],
        ),
      ).rejects.toBeInstanceOf(QueryFailedError);
    });

    it('a negative found is rejected by CHK_game_rounds_counts', async () => {
      await expect(
        dataSource.query(
          `INSERT INTO "game_rounds"
             ("user_id", "client_round_id", "mode", "score", "found", "first_try", "total",
              "pool_total", "total_wrongs", "ended_early")
           VALUES ($1, $2, 'provinces', 50, -1, 0, 1, 1, 0, false)`,
          [userBId, `check-counts-${Date.now()}`],
        ),
      ).rejects.toBeInstanceOf(QueryFailedError);
    });

    it('a negative completion_time_seconds is rejected by CHK_game_rounds_completion_time', async () => {
      await expect(
        dataSource.query(
          `INSERT INTO "game_rounds"
             ("user_id", "client_round_id", "mode", "score", "found", "first_try", "total",
              "pool_total", "total_wrongs", "ended_early", "completion_time_seconds")
           VALUES ($1, $2, 'provinces', 50, 1, 1, 1, 1, 0, false, -1)`,
          [userBId, `check-completion-${Date.now()}`],
        ),
      ).rejects.toBeInstanceOf(QueryFailedError);
    });

    it('a valid row with completion_time_seconds = NULL succeeds', async () => {
      await expect(
        dataSource.query(
          `INSERT INTO "game_rounds"
             ("user_id", "client_round_id", "mode", "score", "found", "first_try", "total",
              "pool_total", "total_wrongs", "ended_early", "completion_time_seconds")
           VALUES ($1, $2, 'provinces', 50, 1, 1, 1, 1, 0, false, NULL)`,
          [userBId, `check-null-${Date.now()}`],
        ),
      ).resolves.not.toThrow();
    });
  });
});
