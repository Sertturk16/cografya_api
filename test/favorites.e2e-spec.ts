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
import { Country } from '../src/country/entities/country.entity';
import { buildDataSourceOptions } from '../src/database/data-source-options';
import { seedGeography } from '../src/database/seeds/seed-geography';
import { seedReference } from '../src/database/seeds/seed-reference';
import { seedWorld } from '../src/database/seeds/seed-world';
import { Favorite } from '../src/favorites/entities/favorite.entity';
import { Province } from '../src/province/entities/province.entity';
import { District } from '../src/reference/entities/district.entity';

/**
 * UYELIK-07 e2e — the five protected `favorites` endpoints against a REAL Postgres
 * (`UYELIK-07-plan.md` §11). One container, one migration run; geography + reference are seeded
 * because `users.district_id` needs a real row to point at, and the world seed provides real
 * `Country` fixtures to favorite.
 *
 * A DEDICATED province/country per case (never reused across two `it()` blocks whose outcome
 * would interfere via the per-(user, target) unique constraint) — the same discipline
 * `video-progress.e2e-spec.ts` uses for its book-video fixtures.
 */
describe('Favorites (e2e, real Postgres)', () => {
  let container: StartedPostgreSqlContainer;
  let dataSource: DataSource;
  let app: INestApplication;

  let provinces: Province[];
  let nextProvinceIndex = 0;
  let countries: Country[];
  let nextCountryIndex = 0;

  let userAId: string;
  let userBId: string;
  let userAToken: string;
  let userBToken: string;

  /** The next UNUSED seeded province — guarantees every case gets its own row. */
  function nextProvince(): Province {
    const province = provinces[nextProvinceIndex];
    if (province === undefined) {
      throw new Error('ran out of seeded provinces — seed more geography');
    }
    nextProvinceIndex += 1;
    return province;
  }

  /** The next UNUSED seeded country — guarantees every case gets its own row. */
  function nextCountry(): Country {
    const country = countries[nextCountryIndex];
    if (country === undefined) throw new Error('ran out of seeded countries — seed more world');
    nextCountryIndex += 1;
    return country;
  }

  function bearer(token: string): { Authorization: string } {
    return { Authorization: `Bearer ${token}` };
  }

  async function createUser(email: string, districtId: string): Promise<User> {
    return dataSource.getRepository(User).save(
      dataSource.getRepository(User).create({
        firstName: 'Favorites',
        lastName: 'Test',
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

  async function mintFor(user: User): Promise<string> {
    const accessTokens = app.get(AccessTokenService);
    return accessTokens.mint(user.id, user.tokenVersion);
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
    await seedWorld(dataSource);

    provinces = await dataSource.getRepository(Province).find({ order: { plateCode: 'ASC' } });
    // One dedicated slot per province-consuming case below — comfortably under the 81-province
    // corpus.
    expect(provinces.length).toBeGreaterThanOrEqual(15);

    countries = await dataSource.getRepository(Country).find({ order: { isoCode: 'ASC' } });
    // One dedicated slot per country-consuming case below — comfortably under the ~199-country
    // corpus.
    expect(countries.length).toBeGreaterThanOrEqual(15);

    const istanbul = await dataSource
      .getRepository(Province)
      .findOneOrFail({ where: { plateCode: '34' } });
    const district = await dataSource
      .getRepository(District)
      .findOneOrFail({ where: { provinceId: istanbul.id } });

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const appModule = require('../src/app.module') as typeof import('../src/app.module');
    const moduleRef = await Test.createTestingModule({ imports: [appModule.AppModule] }).compile();
    app = moduleRef.createNestApplication();
    applyGlobalPrefix(app);
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();

    const userA = await createUser('favorites-a@example.test', district.id);
    const userB = await createUser('favorites-b@example.test', district.id);
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
    it('GET /api/favorites with no Authorization header -> 401, Cache-Control: no-store', async () => {
      // The guard-rejected half of `FavoritesNoStoreMiddleware`'s own claim — middleware runs
      // BEFORE guards, so this must not depend on the handler ever running.
      const response = await request(app.getHttpServer()).get('/api/favorites').expect(401);
      expect(response.headers['cache-control']).toBe('no-store');
    });

    it('PUT/DELETE a province with no Authorization header -> 401, Cache-Control: no-store', async () => {
      const plateCode = nextProvince().plateCode;
      const putResponse = await request(app.getHttpServer())
        .put(`/api/favorites/provinces/${plateCode}`)
        .expect(401);
      expect(putResponse.headers['cache-control']).toBe('no-store');

      const deleteResponse = await request(app.getHttpServer())
        .delete(`/api/favorites/provinces/${plateCode}`)
        .expect(401);
      expect(deleteResponse.headers['cache-control']).toBe('no-store');
    });

    it('PUT/DELETE a country with no Authorization header -> 401, Cache-Control: no-store', async () => {
      const isoCode = nextCountry().isoCode;
      const putResponse = await request(app.getHttpServer())
        .put(`/api/favorites/countries/${isoCode}`)
        .expect(401);
      expect(putResponse.headers['cache-control']).toBe('no-store');

      const deleteResponse = await request(app.getHttpServer())
        .delete(`/api/favorites/countries/${isoCode}`)
        .expect(401);
      expect(deleteResponse.headers['cache-control']).toBe('no-store');
    });
  });

  describe('province — add / idempotency / concurrency / not-found', () => {
    it('PUT a province -> 200, echoes { type: province, plateCode, isoCode: null, createdAt }; a follow-up GET lists it', async () => {
      const province = nextProvince();
      const putResponse = await request(app.getHttpServer())
        .put(`/api/favorites/provinces/${province.plateCode}`)
        .set(bearer(userAToken))
        .expect(200);
      expect(putResponse.headers['cache-control']).toBe('no-store');

      const body = putResponse.body as Record<string, unknown>;
      expect(Object.keys(body).sort()).toEqual(['createdAt', 'isoCode', 'plateCode', 'type']);
      expect(body).toMatchObject({
        type: 'province',
        plateCode: province.plateCode,
        isoCode: null,
      });
      expect(typeof body.createdAt).toBe('string');

      const getResponse = await request(app.getHttpServer())
        .get('/api/favorites')
        .set(bearer(userAToken))
        .expect(200);
      expect(getResponse.headers['cache-control']).toBe('no-store');
      const items = getResponse.body as Record<string, unknown>[];
      expect(items).toContainEqual(body);
    });

    it('PUT the same province twice -> 200 both times, exactly one row (idempotency)', async () => {
      const province = nextProvince();
      await request(app.getHttpServer())
        .put(`/api/favorites/provinces/${province.plateCode}`)
        .set(bearer(userAToken))
        .expect(200);
      await request(app.getHttpServer())
        .put(`/api/favorites/provinces/${province.plateCode}`)
        .set(bearer(userAToken))
        .expect(200);

      const count = await dataSource
        .getRepository(Favorite)
        .count({ where: { userId: userAId, provinceId: province.id } });
      expect(count).toBe(1);
    });

    it('two concurrent identical province PUTs -> exactly one row (concurrency race)', async () => {
      const province = nextProvince();
      const fire = (): request.Test =>
        request(app.getHttpServer())
          .put(`/api/favorites/provinces/${province.plateCode}`)
          .set(bearer(userAToken));

      const [first, second] = await Promise.all([fire(), fire()]);
      expect([first.status, second.status]).toEqual([200, 200]);

      const count = await dataSource
        .getRepository(Favorite)
        .count({ where: { userId: userAId, provinceId: province.id } });
      expect(count).toBe(1);
    });

    it('a concurrent PUT + DELETE on the same never-before-favorited province -> the PUT never surfaces a raw 500 (SFH144-I1 race)', async () => {
      // Pre-fix, `addProvince` committed a plain INSERT then re-read the row with a separate
      // `findOneOrFail` — a concurrent DELETE on the exact same (user, target) pair could land in
      // the window between those two statements and remove the row, so the re-read found nothing
      // and an uncaught `EntityNotFoundError` surfaced as a bogus 500. The fix collapses both
      // statements into one atomic `INSERT ... ON CONFLICT DO UPDATE ... RETURNING`, so no such
      // window exists any more regardless of which side of the race wins.
      const province = nextProvince();
      const [putResponse, deleteResponse] = await Promise.all([
        request(app.getHttpServer())
          .put(`/api/favorites/provinces/${province.plateCode}`)
          .set(bearer(userAToken)),
        request(app.getHttpServer())
          .delete(`/api/favorites/provinces/${province.plateCode}`)
          .set(bearer(userAToken)),
      ]);

      expect(putResponse.status).toBe(200);
      expect(deleteResponse.status).toBe(204);
    });

    it('PUT a well-formed but nonexistent plateCode -> 404 errors.favorites.provinceNotFound', async () => {
      const response = await request(app.getHttpServer())
        .put('/api/favorites/provinces/99')
        .set(bearer(userAToken))
        .expect(404);
      expect((response.body as { message: string }).message).toBe(
        'errors.favorites.provinceNotFound',
      );
    });

    it.each(['9', '999', 'ab'])('PUT a malformed plateCode (%s) -> 400', async (plateCode) => {
      await request(app.getHttpServer())
        .put(`/api/favorites/provinces/${plateCode}`)
        .set(bearer(userAToken))
        .expect(400);
    });
  });

  describe('country — add / idempotency / concurrency / not-found', () => {
    it('PUT a country -> 200, echoes { type: country, plateCode: null, isoCode, createdAt }; a follow-up GET lists it', async () => {
      const country = nextCountry();
      const putResponse = await request(app.getHttpServer())
        .put(`/api/favorites/countries/${country.isoCode}`)
        .set(bearer(userAToken))
        .expect(200);
      expect(putResponse.headers['cache-control']).toBe('no-store');

      const body = putResponse.body as Record<string, unknown>;
      expect(Object.keys(body).sort()).toEqual(['createdAt', 'isoCode', 'plateCode', 'type']);
      expect(body).toMatchObject({
        type: 'country',
        plateCode: null,
        isoCode: country.isoCode,
      });
      expect(typeof body.createdAt).toBe('string');

      const getResponse = await request(app.getHttpServer())
        .get('/api/favorites')
        .set(bearer(userAToken))
        .expect(200);
      const items = getResponse.body as Record<string, unknown>[];
      expect(items).toContainEqual(body);
    });

    it('PUT the same country twice -> 200 both times, exactly one row (idempotency)', async () => {
      const country = nextCountry();
      await request(app.getHttpServer())
        .put(`/api/favorites/countries/${country.isoCode}`)
        .set(bearer(userAToken))
        .expect(200);
      await request(app.getHttpServer())
        .put(`/api/favorites/countries/${country.isoCode}`)
        .set(bearer(userAToken))
        .expect(200);

      const count = await dataSource
        .getRepository(Favorite)
        .count({ where: { userId: userAId, countryId: country.id } });
      expect(count).toBe(1);
    });

    it('two concurrent identical country PUTs -> exactly one row (concurrency race)', async () => {
      const country = nextCountry();
      const fire = (): request.Test =>
        request(app.getHttpServer())
          .put(`/api/favorites/countries/${country.isoCode}`)
          .set(bearer(userAToken));

      const [first, second] = await Promise.all([fire(), fire()]);
      expect([first.status, second.status]).toEqual([200, 200]);

      const count = await dataSource
        .getRepository(Favorite)
        .count({ where: { userId: userAId, countryId: country.id } });
      expect(count).toBe(1);
    });

    it('a concurrent PUT + DELETE on the same never-before-favorited country -> the PUT never surfaces a raw 500 (SFH144-I1 race, country mirror)', async () => {
      const country = nextCountry();
      const [putResponse, deleteResponse] = await Promise.all([
        request(app.getHttpServer())
          .put(`/api/favorites/countries/${country.isoCode}`)
          .set(bearer(userAToken)),
        request(app.getHttpServer())
          .delete(`/api/favorites/countries/${country.isoCode}`)
          .set(bearer(userAToken)),
      ]);

      expect(putResponse.status).toBe(200);
      expect(deleteResponse.status).toBe(204);
    });

    it('PUT a well-formed but nonexistent isoCode -> 404 errors.favorites.countryNotFound', async () => {
      const response = await request(app.getHttpServer())
        .put('/api/favorites/countries/ZZ')
        .set(bearer(userAToken))
        .expect(404);
      expect((response.body as { message: string }).message).toBe(
        'errors.favorites.countryNotFound',
      );
    });

    it.each(['t', 'TRX', 'tr', '12'])('PUT a malformed isoCode (%s) -> 400', async (isoCode) => {
      await request(app.getHttpServer())
        .put(`/api/favorites/countries/${isoCode}`)
        .set(bearer(userAToken))
        .expect(400);
    });
  });

  describe('remove — province', () => {
    it('DELETE a favorited province -> 204; a follow-up GET no longer lists it', async () => {
      const province = nextProvince();
      await request(app.getHttpServer())
        .put(`/api/favorites/provinces/${province.plateCode}`)
        .set(bearer(userAToken))
        .expect(200);

      const deleteResponse = await request(app.getHttpServer())
        .delete(`/api/favorites/provinces/${province.plateCode}`)
        .set(bearer(userAToken))
        .expect(204);
      expect(deleteResponse.headers['cache-control']).toBe('no-store');

      const getResponse = await request(app.getHttpServer())
        .get('/api/favorites')
        .set(bearer(userAToken))
        .expect(200);
      const items = getResponse.body as Record<string, unknown>[];
      expect(items.some((item) => item.plateCode === province.plateCode)).toBe(false);
    });

    it('DELETE a real, never-favorited province -> 204, no row created, no error', async () => {
      const province = nextProvince();
      await request(app.getHttpServer())
        .delete(`/api/favorites/provinces/${province.plateCode}`)
        .set(bearer(userAToken))
        .expect(204);

      const count = await dataSource
        .getRepository(Favorite)
        .count({ where: { userId: userAId, provinceId: province.id } });
      expect(count).toBe(0);
    });

    it('DELETE a well-formed but nonexistent plateCode -> 204 (idempotent-remove design)', async () => {
      await request(app.getHttpServer())
        .delete('/api/favorites/provinces/99')
        .set(bearer(userAToken))
        .expect(204);
    });

    it('DELETE a malformed plateCode -> 400', async () => {
      await request(app.getHttpServer())
        .delete('/api/favorites/provinces/ab')
        .set(bearer(userAToken))
        .expect(400);
    });
  });

  describe('remove — country (added coverage beyond plan §11’s literal list, mirroring the province route for parity)', () => {
    it('DELETE a favorited country -> 204; a follow-up GET no longer lists it', async () => {
      const country = nextCountry();
      await request(app.getHttpServer())
        .put(`/api/favorites/countries/${country.isoCode}`)
        .set(bearer(userAToken))
        .expect(200);

      await request(app.getHttpServer())
        .delete(`/api/favorites/countries/${country.isoCode}`)
        .set(bearer(userAToken))
        .expect(204);

      const getResponse = await request(app.getHttpServer())
        .get('/api/favorites')
        .set(bearer(userAToken))
        .expect(200);
      const items = getResponse.body as Record<string, unknown>[];
      expect(items.some((item) => item.isoCode === country.isoCode)).toBe(false);
    });

    it('DELETE a well-formed but nonexistent isoCode -> 204', async () => {
      await request(app.getHttpServer())
        .delete('/api/favorites/countries/ZZ')
        .set(bearer(userAToken))
        .expect(204);
    });

    it('DELETE a malformed isoCode -> 400', async () => {
      await request(app.getHttpServer())
        .delete('/api/favorites/countries/trx')
        .set(bearer(userAToken))
        .expect(400);
    });
  });

  describe('GET — empty and mixed lists', () => {
    it('GET with no favorites -> 200, []', async () => {
      const istanbul = await dataSource
        .getRepository(Province)
        .findOneOrFail({ where: { plateCode: '34' } });
      const district = await dataSource
        .getRepository(District)
        .findOneOrFail({ where: { provinceId: istanbul.id } });
      const freshUser = await createUser('favorites-empty@example.test', district.id);
      const freshToken = await mintFor(freshUser);

      const response = await request(app.getHttpServer())
        .get('/api/favorites')
        .set(bearer(freshToken))
        .expect(200);
      expect(response.body).toEqual([]);
    });

    it('GET after favoriting one province and one country -> 200, both present, correct fields populated/null', async () => {
      const istanbul = await dataSource
        .getRepository(Province)
        .findOneOrFail({ where: { plateCode: '34' } });
      const district = await dataSource
        .getRepository(District)
        .findOneOrFail({ where: { provinceId: istanbul.id } });
      const freshUser = await createUser('favorites-both@example.test', district.id);
      const freshToken = await mintFor(freshUser);

      const province = nextProvince();
      const country = nextCountry();
      await request(app.getHttpServer())
        .put(`/api/favorites/provinces/${province.plateCode}`)
        .set(bearer(freshToken))
        .expect(200);
      await request(app.getHttpServer())
        .put(`/api/favorites/countries/${country.isoCode}`)
        .set(bearer(freshToken))
        .expect(200);

      const response = await request(app.getHttpServer())
        .get('/api/favorites')
        .set(bearer(freshToken))
        .expect(200);
      const items = response.body as {
        type: string;
        plateCode: string | null;
        isoCode: string | null;
      }[];
      expect(items).toHaveLength(2);

      const provinceItem = items.find((item) => item.type === 'province');
      expect(provinceItem).toMatchObject({ plateCode: province.plateCode, isoCode: null });

      const countryItem = items.find((item) => item.type === 'country');
      expect(countryItem).toMatchObject({ plateCode: null, isoCode: country.isoCode });
    });
  });

  describe('cross-user isolation, including the delete surface', () => {
    it("B never sees A's favorite; B's DELETE on the same plateCode returns 204 but leaves A's row in place", async () => {
      const province = nextProvince();
      await request(app.getHttpServer())
        .put(`/api/favorites/provinces/${province.plateCode}`)
        .set(bearer(userAToken))
        .expect(200);

      const getB = await request(app.getHttpServer())
        .get('/api/favorites')
        .set(bearer(userBToken))
        .expect(200);
      const bItems = getB.body as Record<string, unknown>[];
      expect(bItems.some((item) => item.plateCode === province.plateCode)).toBe(false);

      // B's delete of the SAME plateCode A favorited — must not touch A's row.
      await request(app.getHttpServer())
        .delete(`/api/favorites/provinces/${province.plateCode}`)
        .set(bearer(userBToken))
        .expect(204);

      const stillThere = await dataSource
        .getRepository(Favorite)
        .findOne({ where: { userId: userAId, provinceId: province.id } });
      expect(stillThere).not.toBeNull();

      const getA = await request(app.getHttpServer())
        .get('/api/favorites')
        .set(bearer(userAToken))
        .expect(200);
      const aItems = getA.body as Record<string, unknown>[];
      expect(aItems.some((item) => item.plateCode === province.plateCode)).toBe(true);
    });

    // TA144-M1: the block above only ever exercised the province DELETE surface; this is the
    // dedicated country mirror the finding asked for.
    it("B never sees A's favorited country; B's DELETE on the same isoCode returns 204 but leaves A's row in place", async () => {
      const country = nextCountry();
      await request(app.getHttpServer())
        .put(`/api/favorites/countries/${country.isoCode}`)
        .set(bearer(userAToken))
        .expect(200);

      const getB = await request(app.getHttpServer())
        .get('/api/favorites')
        .set(bearer(userBToken))
        .expect(200);
      const bItems = getB.body as Record<string, unknown>[];
      expect(bItems.some((item) => item.isoCode === country.isoCode)).toBe(false);

      // B's delete of the SAME isoCode A favorited — must not touch A's row.
      await request(app.getHttpServer())
        .delete(`/api/favorites/countries/${country.isoCode}`)
        .set(bearer(userBToken))
        .expect(204);

      const stillThere = await dataSource
        .getRepository(Favorite)
        .findOne({ where: { userId: userAId, countryId: country.id } });
      expect(stillThere).not.toBeNull();

      const getA = await request(app.getHttpServer())
        .get('/api/favorites')
        .set(bearer(userAToken))
        .expect(200);
      const aItems = getA.body as Record<string, unknown>[];
      expect(aItems.some((item) => item.isoCode === country.isoCode)).toBe(true);
    });
  });

  describe('schema — FK delete rules (information_schema, not a live delete attempt)', () => {
    it('FK_favorites_user is CASCADE; FK_favorites_province and FK_favorites_country are RESTRICT', async () => {
      // Read straight from `information_schema.referential_constraints` rather than trusting the
      // entity/migration docblocks — a query that can't see the table (or a renamed constraint) at
      // all must fail RED here, not silently pass (the `video-progress.e2e-spec.ts` pattern).
      const rows = await dataSource.query<{ constraint_name: string; delete_rule: string }[]>(`
        SELECT constraint_name, delete_rule
        FROM information_schema.referential_constraints
        WHERE constraint_name IN ('FK_favorites_user', 'FK_favorites_province', 'FK_favorites_country')
      `);
      const rules = Object.fromEntries(rows.map((row) => [row.constraint_name, row.delete_rule]));
      expect(rules).toEqual({
        FK_favorites_user: 'CASCADE',
        FK_favorites_province: 'RESTRICT',
        FK_favorites_country: 'RESTRICT',
      });
    });
  });

  describe('schema — the exclusive-arc CHECK constraint (raw insert, bypassing the service)', () => {
    it('a row with only province_id set succeeds', async () => {
      const province = nextProvince();
      await expect(
        dataSource.query(`INSERT INTO "favorites" ("user_id", "province_id") VALUES ($1, $2)`, [
          userBId,
          province.id,
        ]),
      ).resolves.not.toThrow();
    });

    it('a row with only country_id set succeeds', async () => {
      const country = nextCountry();
      await expect(
        dataSource.query(`INSERT INTO "favorites" ("user_id", "country_id") VALUES ($1, $2)`, [
          userBId,
          country.id,
        ]),
      ).resolves.not.toThrow();
    });

    it('a row with BOTH province_id and country_id set is rejected by CHK_favorites_exactly_one_target', async () => {
      const province = nextProvince();
      const country = nextCountry();
      await expect(
        dataSource.query(
          `INSERT INTO "favorites" ("user_id", "province_id", "country_id") VALUES ($1, $2, $3)`,
          [userBId, province.id, country.id],
        ),
      ).rejects.toBeInstanceOf(QueryFailedError);
    });

    it('a row with NEITHER province_id nor country_id set is rejected by the same constraint', async () => {
      await expect(
        dataSource.query(`INSERT INTO "favorites" ("user_id") VALUES ($1)`, [userBId]),
      ).rejects.toBeInstanceOf(QueryFailedError);
    });
  });
});
