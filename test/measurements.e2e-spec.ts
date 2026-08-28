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
  MEASUREMENT_POINTS_MAX,
  MEASUREMENT_TITLE_MAX_LENGTH,
} from '../src/measurements/dto/create-measurement-request.dto';
import { Measurement, MeasurementType } from '../src/measurements/entities/measurement.entity';
import { MEASUREMENTS_ERROR_KEYS } from '../src/measurements/measurements-error-keys';
import { MEASUREMENTS_PER_USER_MAX } from '../src/measurements/measurements.service';
import { Province } from '../src/province/entities/province.entity';
import { District } from '../src/reference/entities/district.entity';

interface Point {
  lon: number;
  lat: number;
}

/** Ankara. */
function coordinatePoints(): [Point] {
  return [{ lon: 32.85, lat: 39.92 }];
}

/** Ankara -> İstanbul. */
function distancePoints(): [Point, Point] {
  return [
    { lon: 32.85, lat: 39.92 },
    { lon: 28.9784, lat: 41.0082 },
  ];
}

/** Ankara -> İstanbul -> Kayseri. */
function areaPoints(): [Point, Point, Point] {
  return [
    { lon: 32.85, lat: 39.92 },
    { lon: 28.9784, lat: 41.0082 },
    { lon: 35.4787, lat: 38.7205 },
  ];
}

/** `count` synthetic, always-in-range points — used only to exceed `MEASUREMENT_POINTS_MAX`. */
function manyPoints(count: number): Point[] {
  return Array.from({ length: count }, (_, index) => ({
    lon: (index % 10) + 1,
    lat: (index % 10) + 1,
  }));
}

/**
 * UYELIK-11 e2e — the five protected `measurements` endpoints against a REAL Postgres
 * (`UYELIK-11-plan.md` §11). One container, one migration run; geography + reference are seeded
 * because `users.district_id` needs a real row to point at — no `seedWorld` (this module has no
 * Province/Country relation at all, mirroring `game-rounds.e2e-spec.ts`'s own setup exactly).
 */
describe('Measurements (e2e, real Postgres)', () => {
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
        firstName: 'Measurements',
        lastName: 'Test',
        phone: '+905000000011',
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

  /** A minimal, valid distance-type create body — overridable per case. */
  function validBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      type: MeasurementType.Distance,
      points: distancePoints(),
      clientMeasurementId: `measurement-${Math.random().toString(36).slice(2)}-${Date.now()}`,
      ...overrides,
    };
  }

  /**
   * Directly inserts `count` valid, CHECK-satisfying rows for `userId` in ONE round trip — the
   * same `seedAtCeiling`-style precedent `game-rounds.e2e-spec.ts` uses to reach a ceiling
   * economically. This deliberately bypasses `POST /api/measurements`: the global
   * `TrustedClientThrottlerGuard` tracks by PEER identity, not by authenticated user
   * (`visitor-tracker.ts`), so every request this supertest client fires shares ONE tracked
   * identity — firing `MEASUREMENTS_PER_USER_MAX` (300) real HTTP creates per quota test would
   * exhaust that identity's 120/min bucket for the `create` handler and 429 every later test in
   * this file that also needs a real create. The boundary itself is still crossed with REAL HTTP
   * calls in every test below — only the bulk-below-the-boundary rows are seeded this way.
   */
  async function seedMeasurements(userId: string, count: number, idPrefix: string): Promise<void> {
    if (count === 0) return;
    await dataSource.query(
      `INSERT INTO "measurements" ("user_id", "client_measurement_id", "type", "points")
       SELECT $1, $2 || '-' || generate_series, 'coordinate', '[{"lon":32.85,"lat":39.92}]'::jsonb
       FROM generate_series(1, $3)`,
      [userId, idPrefix, count],
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

    const userA = await createUser('measurements-a@example.test');
    const userB = await createUser('measurements-b@example.test');
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
    const anyId = '00000000-0000-0000-0000-000000000000';

    it('POST /api/measurements with no Authorization header -> 401, Cache-Control: no-store', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/measurements')
        .send(validBody())
        .expect(401);
      expect(response.headers['cache-control']).toBe('no-store');
    });

    it('GET /api/measurements with no Authorization header -> 401, Cache-Control: no-store', async () => {
      const response = await request(app.getHttpServer()).get('/api/measurements').expect(401);
      expect(response.headers['cache-control']).toBe('no-store');
    });

    it('GET /api/measurements/:id with no Authorization header -> 401, Cache-Control: no-store', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/measurements/${anyId}`)
        .expect(401);
      expect(response.headers['cache-control']).toBe('no-store');
    });

    it('PATCH /api/measurements/:id with no Authorization header -> 401, Cache-Control: no-store', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/api/measurements/${anyId}`)
        .send({ title: 'x' })
        .expect(401);
      expect(response.headers['cache-control']).toBe('no-store');
    });

    it('DELETE /api/measurements/:id with no Authorization header -> 401, Cache-Control: no-store', async () => {
      const response = await request(app.getHttpServer())
        .delete(`/api/measurements/${anyId}`)
        .expect(401);
      expect(response.headers['cache-control']).toBe('no-store');
    });
  });

  describe('create — happy path, idempotency, concurrency', () => {
    it.each([
      [MeasurementType.Distance, distancePoints()],
      [MeasurementType.Area, areaPoints()],
      [MeasurementType.Coordinate, coordinatePoints()],
    ])('POST a valid %s measurement -> 200, echoes the submitted values', async (type, points) => {
      const body = validBody({ type, points });
      const response = await request(app.getHttpServer())
        .post('/api/measurements')
        .set(bearer(userAToken))
        .send(body)
        .expect(200);
      expect(response.headers['cache-control']).toBe('no-store');

      const responseBody = response.body as Record<string, unknown>;
      expect(Object.keys(responseBody).sort()).toEqual(
        ['id', 'type', 'points', 'title', 'clientMeasurementId', 'createdAt', 'updatedAt'].sort(),
      );
      expect(responseBody).toMatchObject({
        type,
        points,
        clientMeasurementId: body.clientMeasurementId,
        title: null,
      });
      expect(typeof responseBody.id).toBe('string');
      expect(typeof responseBody.createdAt).toBe('string');
      expect(typeof responseBody.updatedAt).toBe('string');

      const listResponse = await request(app.getHttpServer())
        .get('/api/measurements')
        .set(bearer(userAToken))
        .expect(200);
      const items = listResponse.body as Record<string, unknown>[];
      expect(items).toContainEqual(responseBody);
    });

    it('POST the same clientMeasurementId twice -> 200 both times, exactly one row', async () => {
      const body = validBody();
      const first = await request(app.getHttpServer())
        .post('/api/measurements')
        .set(bearer(userAToken))
        .send(body)
        .expect(200);
      const second = await request(app.getHttpServer())
        .post('/api/measurements')
        .set(bearer(userAToken))
        .send(body)
        .expect(200);
      expect(second.body).toEqual(first.body);

      const count = await dataSource.getRepository(Measurement).count({
        where: { userId: userAId, clientMeasurementId: body.clientMeasurementId as string },
      });
      expect(count).toBe(1);
    });

    it('Promise.all of two concurrent identical creates -> exactly one row, same id/createdAt', async () => {
      const body = validBody();
      const fire = (): request.Test =>
        request(app.getHttpServer()).post('/api/measurements').set(bearer(userAToken)).send(body);
      const [first, second] = await Promise.all([fire(), fire()]);
      expect([first.status, second.status]).toEqual([200, 200]);
      expect(first.body).toEqual(second.body);

      const count = await dataSource.getRepository(Measurement).count({
        where: { userId: userAId, clientMeasurementId: body.clientMeasurementId as string },
      });
      expect(count).toBe(1);
    });

    it('two DIFFERENT users creating with the identical clientMeasurementId string -> both succeed as two independent rows', async () => {
      const clientMeasurementId = `shared-${Date.now()}`;
      const aResponse = await request(app.getHttpServer())
        .post('/api/measurements')
        .set(bearer(userAToken))
        .send(validBody({ clientMeasurementId }))
        .expect(200);
      const bResponse = await request(app.getHttpServer())
        .post('/api/measurements')
        .set(bearer(userBToken))
        .send(validBody({ clientMeasurementId }))
        .expect(200);

      expect(aResponse.body).toMatchObject({ clientMeasurementId });
      expect(bResponse.body).toMatchObject({ clientMeasurementId });
      expect((aResponse.body as { id: string }).id).not.toBe((bResponse.body as { id: string }).id);
    });
  });

  describe('create — payload shape validation (400)', () => {
    it('coordinate with 2 points -> 400 invalidShape', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/measurements')
        .set(bearer(userAToken))
        .send(validBody({ type: MeasurementType.Coordinate, points: distancePoints() }))
        .expect(400);
      expect((response.body as { message: string }).message).toBe(
        MEASUREMENTS_ERROR_KEYS.invalidShape,
      );
    });

    it('distance with 1 point -> 400 invalidShape', async () => {
      await request(app.getHttpServer())
        .post('/api/measurements')
        .set(bearer(userAToken))
        .send(validBody({ type: MeasurementType.Distance, points: coordinatePoints() }))
        .expect(400);
    });

    it('area with 2 points -> 400 invalidShape', async () => {
      await request(app.getHttpServer())
        .post('/api/measurements')
        .set(bearer(userAToken))
        .send(validBody({ type: MeasurementType.Area, points: distancePoints() }))
        .expect(400);
    });

    it(`a points array of MEASUREMENT_POINTS_MAX + 1 (${MEASUREMENT_POINTS_MAX + 1}) -> 400`, async () => {
      await request(app.getHttpServer())
        .post('/api/measurements')
        .set(bearer(userAToken))
        .send(
          validBody({ type: MeasurementType.Area, points: manyPoints(MEASUREMENT_POINTS_MAX + 1) }),
        )
        .expect(400);
    });

    const outOfRangeCases: [keyof Point, number][] = [
      ['lon', 181],
      ['lon', -181],
      ['lat', 91],
      ['lat', -91],
    ];
    it.each(outOfRangeCases)(
      'an out-of-range %s = %d -> 400, and the response never echoes the raw value',
      async (axis, value) => {
        const [first, second] = distancePoints();
        const badPoint = { ...first, [axis]: value };
        const response = await request(app.getHttpServer())
          .post('/api/measurements')
          .set(bearer(userAToken))
          .send(validBody({ points: [badPoint, second] }))
          .expect(400);
        // §5.11's PII posture, executable: the 400 body never echoes the submitted value.
        expect(JSON.stringify(response.body)).not.toContain(String(value));
      },
    );

    it('a malformed clientMeasurementId charset -> 400', async () => {
      await request(app.getHttpServer())
        .post('/api/measurements')
        .set(bearer(userAToken))
        .send(validBody({ clientMeasurementId: 'has a space' }))
        .expect(400);
    });

    it(`a title over MEASUREMENT_TITLE_MAX_LENGTH chars (${MEASUREMENT_TITLE_MAX_LENGTH + 1}) -> 400`, async () => {
      await request(app.getHttpServer())
        .post('/api/measurements')
        .set(bearer(userAToken))
        .send(validBody({ title: 'x'.repeat(MEASUREMENT_TITLE_MAX_LENGTH + 1) }))
        .expect(400);
    });
  });

  describe('create — quota (403)', () => {
    it(
      `${MEASUREMENTS_PER_USER_MAX - 1} rows seeded + one real create reaches the boundary ` +
        '(200); the next 403s with quotaExceeded; deleting one frees room for the next create',
      async () => {
        const user = await createUser('measurements-quota@example.test');
        const token = await mintFor(user);

        // MEASUREMENTS_PER_USER_MAX - 1 rows seeded directly (see seedMeasurements' own
        // docblock for why real HTTP round trips do not scale here); the boundary-crossing
        // request itself is still real HTTP.
        await seedMeasurements(user.id, MEASUREMENTS_PER_USER_MAX - 1, 'quota-seed');

        const boundaryResponse = await request(app.getHttpServer())
          .post('/api/measurements')
          .set(bearer(token))
          .send(validBody({ clientMeasurementId: 'quota-boundary' }))
          .expect(200);
        const lastId = (boundaryResponse.body as { id: string }).id;

        const overResponse = await request(app.getHttpServer())
          .post('/api/measurements')
          .set(bearer(token))
          .send(validBody({ clientMeasurementId: 'quota-over' }))
          .expect(403);
        expect((overResponse.body as { message: string }).message).toBe(
          MEASUREMENTS_ERROR_KEYS.quotaExceeded,
        );

        await request(app.getHttpServer())
          .delete(`/api/measurements/${lastId}`)
          .set(bearer(token))
          .expect(204);

        await request(app.getHttpServer())
          .post('/api/measurements')
          .set(bearer(token))
          .send(validBody({ clientMeasurementId: 'quota-after-delete' }))
          .expect(200);
      },
      30_000,
    );
  });

  describe('create — quota race (concurrency, plan §10)', () => {
    it(
      'Promise.all of concurrent creates AT the boundary -> exactly the remaining room ' +
        'succeeds (200), the rest 403 quotaExceeded',
      async () => {
        const user = await createUser('measurements-quota-race@example.test');
        const token = await mintFor(user);

        // 5 + 5 = 10, matching `DATABASE_POOL_SIZE` (`data-source-options.ts`) exactly: each
        // concurrent create opens its own transaction for the advisory-lock hold, so this stays
        // within the pool's real concurrent-connection capacity rather than forcing extra
        // requests to queue for a checkout — measured directly against this suite (a higher
        // count, e.g. 15, reliably produces spurious local `ECONNRESET`s once requests start
        // queueing for a pooled connection, which is an environment/pool-sizing artifact, not a
        // product defect the advisory lock is responsible for).
        const remainingRoom = 5;
        const extraAttempts = 5;
        // Seeded up to (MAX - remainingRoom); the race itself is fired as real, concurrent HTTP
        // requests exactly at the boundary — this is what actually exercises the advisory-lock
        // mechanism (plan §5.3/§10), not the bulk seed below it.
        await seedMeasurements(user.id, MEASUREMENTS_PER_USER_MAX - remainingRoom, 'race-seed');

        const totalAttempts = remainingRoom + extraAttempts;
        // `allSettled`, not `all`: a network-level rejection on one request must not mask the
        // others' real outcomes with an opaque, all-or-nothing failure.
        const settled = await Promise.allSettled(
          Array.from({ length: totalAttempts }, (_unused, index) =>
            request(app.getHttpServer())
              .post('/api/measurements')
              .set(bearer(token))
              .send(validBody({ clientMeasurementId: `race-${index}` })),
          ),
        );
        const responses = settled
          .filter((s): s is PromiseFulfilledResult<request.Response> => s.status === 'fulfilled')
          .map((s) => s.value);

        const succeeded = responses.filter((response) => response.status === 200);
        const rejected = responses.filter((response) => response.status === 403);
        expect(succeeded).toHaveLength(remainingRoom);
        expect(rejected).toHaveLength(extraAttempts);
        expect(
          rejected.every(
            (response) =>
              (response.body as { message: string }).message ===
              MEASUREMENTS_ERROR_KEYS.quotaExceeded,
          ),
        ).toBe(true);

        const count = await dataSource
          .getRepository(Measurement)
          .count({ where: { userId: user.id } });
        expect(count).toBe(MEASUREMENTS_PER_USER_MAX);
      },
      30_000,
    );
  });

  describe('list — cross-user isolation', () => {
    it('GET is a plain array, not the pagination envelope', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/measurements')
        .set(bearer(userAToken))
        .expect(200);
      expect(Array.isArray(response.body)).toBe(true);
    });

    it("user A creates a measurement; user B's GET never sees it", async () => {
      const clientMeasurementId = `isolation-${Date.now()}`;
      await request(app.getHttpServer())
        .post('/api/measurements')
        .set(bearer(userAToken))
        .send(validBody({ clientMeasurementId }))
        .expect(200);

      const bResponse = await request(app.getHttpServer())
        .get('/api/measurements')
        .set(bearer(userBToken))
        .expect(200);
      const items = bResponse.body as { clientMeasurementId: string }[];
      expect(items.some((item) => item.clientMeasurementId === clientMeasurementId)).toBe(false);
    });

    it('is ordered createdAt DESC (most recently saved first)', async () => {
      const user = await createUser('measurements-order@example.test');
      const token = await mintFor(user);

      await request(app.getHttpServer())
        .post('/api/measurements')
        .set(bearer(token))
        .send(validBody({ clientMeasurementId: 'order-1' }))
        .expect(200);
      await request(app.getHttpServer())
        .post('/api/measurements')
        .set(bearer(token))
        .send(validBody({ clientMeasurementId: 'order-2' }))
        .expect(200);

      const response = await request(app.getHttpServer())
        .get('/api/measurements')
        .set(bearer(token))
        .expect(200);
      const items = response.body as { clientMeasurementId: string; createdAt: string }[];
      expect(items.map((item) => item.clientMeasurementId)).toEqual(['order-2', 'order-1']);
    });
  });

  describe('get one — ownership', () => {
    it("200 for own id, 404 for another user's id (via the OTHER user's own token)", async () => {
      const created = await request(app.getHttpServer())
        .post('/api/measurements')
        .set(bearer(userAToken))
        .send(validBody())
        .expect(200);
      const id = (created.body as { id: string }).id;

      const ownResponse = await request(app.getHttpServer())
        .get(`/api/measurements/${id}`)
        .set(bearer(userAToken))
        .expect(200);
      expect(ownResponse.headers['cache-control']).toBe('no-store');
      expect(ownResponse.body).toEqual(created.body);

      const otherResponse = await request(app.getHttpServer())
        .get(`/api/measurements/${id}`)
        .set(bearer(userBToken))
        .expect(404);
      expect((otherResponse.body as { message: string }).message).toBe(
        MEASUREMENTS_ERROR_KEYS.notFound,
      );
    });
  });

  describe('update title — ownership + clearing to null', () => {
    it('rename succeeds and updatedAt advances; geometry/type/clientMeasurementId stay byte-identical', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/measurements')
        .set(bearer(userAToken))
        .send(validBody({ title: 'Original' }))
        .expect(200);
      const createdBody = created.body as Record<string, unknown>;
      const id = createdBody.id as string;

      // Ensure `updatedAt` (millisecond timestamptz) strictly advances past `createdAt`.
      await new Promise((resolve) => setTimeout(resolve, 10));

      const renamed = await request(app.getHttpServer())
        .patch(`/api/measurements/${id}`)
        .set(bearer(userAToken))
        .send({ title: 'Renamed' })
        .expect(200);
      const renamedBody = renamed.body as Record<string, unknown>;
      expect(renamedBody.title).toBe('Renamed');
      expect(renamedBody.type).toBe(createdBody.type);
      expect(renamedBody.points).toEqual(createdBody.points);
      expect(renamedBody.clientMeasurementId).toBe(createdBody.clientMeasurementId);
      expect(Date.parse(renamedBody.updatedAt as string)).toBeGreaterThan(
        Date.parse(createdBody.updatedAt as string),
      );
    });

    it('title: null clears it', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/measurements')
        .set(bearer(userAToken))
        .send(validBody({ title: 'Has a title' }))
        .expect(200);
      const id = (created.body as { id: string }).id;

      const cleared = await request(app.getHttpServer())
        .patch(`/api/measurements/${id}`)
        .set(bearer(userAToken))
        .send({ title: null })
        .expect(200);
      expect((cleared.body as { title: unknown }).title).toBeNull();
    });

    it("another user's id -> 404", async () => {
      const created = await request(app.getHttpServer())
        .post('/api/measurements')
        .set(bearer(userAToken))
        .send(validBody())
        .expect(200);
      const id = (created.body as { id: string }).id;

      const response = await request(app.getHttpServer())
        .patch(`/api/measurements/${id}`)
        .set(bearer(userBToken))
        .send({ title: 'stolen rename' })
        .expect(404);
      expect((response.body as { message: string }).message).toBe(MEASUREMENTS_ERROR_KEYS.notFound);
    });

    it('omitting title entirely -> 400', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/measurements')
        .set(bearer(userAToken))
        .send(validBody())
        .expect(200);
      const id = (created.body as { id: string }).id;

      await request(app.getHttpServer())
        .patch(`/api/measurements/${id}`)
        .set(bearer(userAToken))
        .send({})
        .expect(400);
    });
  });

  describe('delete — unconditional idempotent 204', () => {
    it('deleting an already-deleted id -> 204 both times', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/measurements')
        .set(bearer(userAToken))
        .send(validBody())
        .expect(200);
      const id = (created.body as { id: string }).id;

      const first = await request(app.getHttpServer())
        .delete(`/api/measurements/${id}`)
        .set(bearer(userAToken))
        .expect(204);
      expect(first.headers['cache-control']).toBe('no-store');

      await request(app.getHttpServer())
        .delete(`/api/measurements/${id}`)
        .set(bearer(userAToken))
        .expect(204);
    });

    it("another user's id -> 204 with no effect on the owner's row", async () => {
      const created = await request(app.getHttpServer())
        .post('/api/measurements')
        .set(bearer(userAToken))
        .send(validBody())
        .expect(200);
      const id = (created.body as { id: string }).id;

      await request(app.getHttpServer())
        .delete(`/api/measurements/${id}`)
        .set(bearer(userBToken))
        .expect(204);

      await request(app.getHttpServer())
        .get(`/api/measurements/${id}`)
        .set(bearer(userAToken))
        .expect(200);
    });

    it('delete-then-retry the same clientMeasurementId -> a NEW row, not the old one resurrected, not a conflict error', async () => {
      const clientMeasurementId = `retry-after-delete-${Date.now()}`;
      const first = await request(app.getHttpServer())
        .post('/api/measurements')
        .set(bearer(userAToken))
        .send(validBody({ clientMeasurementId, title: 'first' }))
        .expect(200);
      const firstId = (first.body as { id: string }).id;

      await request(app.getHttpServer())
        .delete(`/api/measurements/${firstId}`)
        .set(bearer(userAToken))
        .expect(204);

      const second = await request(app.getHttpServer())
        .post('/api/measurements')
        .set(bearer(userAToken))
        .send(validBody({ clientMeasurementId, title: 'second' }))
        .expect(200);
      const secondBody = second.body as { id: string; title: string };
      expect(secondBody.id).not.toBe(firstId);
      expect(secondBody.title).toBe('second');
    });
  });

  describe('schema — FK delete rule (information_schema, not a live delete)', () => {
    it('FK_measurements_user is CASCADE', async () => {
      const rows = await dataSource.query<{ constraint_name: string; delete_rule: string }[]>(`
        SELECT constraint_name, delete_rule
        FROM information_schema.referential_constraints
        WHERE constraint_name = 'FK_measurements_user'
      `);
      const rules = Object.fromEntries(rows.map((row) => [row.constraint_name, row.delete_rule]));
      expect(rules).toEqual({ FK_measurements_user: 'CASCADE' });
    });
  });

  describe('schema — CHECK constraints (raw insert, bypassing the service)', () => {
    it('a fourth type string is rejected by CHK_measurements_type', async () => {
      await expect(
        dataSource.query(
          `INSERT INTO "measurements" ("user_id", "client_measurement_id", "type", "points")
           VALUES ($1, $2, 'route', '[{"lon":1,"lat":1}]'::jsonb)`,
          [userBId, `check-type-${Date.now()}`],
        ),
      ).rejects.toBeInstanceOf(QueryFailedError);
    });

    it('an empty points array is rejected by CHK_measurements_points_array', async () => {
      await expect(
        dataSource.query(
          `INSERT INTO "measurements" ("user_id", "client_measurement_id", "type", "points")
           VALUES ($1, $2, 'coordinate', '[]'::jsonb)`,
          [userBId, `check-empty-${Date.now()}`],
        ),
      ).rejects.toBeInstanceOf(QueryFailedError);
    });

    it('a non-array JSON value is rejected by CHK_measurements_points_array', async () => {
      await expect(
        dataSource.query(
          `INSERT INTO "measurements" ("user_id", "client_measurement_id", "type", "points")
           VALUES ($1, $2, 'coordinate', '{"lon":1,"lat":1}'::jsonb)`,
          [userBId, `check-object-${Date.now()}`],
        ),
      ).rejects.toBeInstanceOf(QueryFailedError);
    });

    it('a valid row succeeds', async () => {
      await expect(
        dataSource.query(
          `INSERT INTO "measurements" ("user_id", "client_measurement_id", "type", "points")
           VALUES ($1, $2, 'coordinate', '[{"lon":1,"lat":1}]'::jsonb)`,
          [userBId, `check-valid-${Date.now()}`],
        ),
      ).resolves.not.toThrow();
    });
  });
});
