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
import { Continent } from '../src/common/continent.enum';
import { Country } from '../src/country/entities/country.entity';
import { buildDataSourceOptions } from '../src/database/data-source-options';
import { seedGeography } from '../src/database/seeds/seed-geography';
import { seedReference } from '../src/database/seeds/seed-reference';
import { seedRegions } from '../src/database/seeds/seed-regions';
import { seedWorld } from '../src/database/seeds/seed-world';
import { Province } from '../src/province/entities/province.entity';
import { District } from '../src/reference/entities/district.entity';
import { Region } from '../src/region/entities/region.entity';

/**
 * P1 PR-A e2e — the three protected `favorites` endpoints, widened to four entity types, against
 * a REAL Postgres (plan §11's PR-A list). One container, one migration run (including
 * `AddFavoriteRegionAndContinent`); geography + reference + world + regions are all seeded, since
 * every one of the four favoritable types needs real rows/labels to target.
 *
 * A DEDICATED target per case (never reused across two `it()` blocks whose outcome would
 * interfere via the per-`(user, target)` unique constraint) — the same discipline this file
 * already used for province/country fixtures, now extended to `region`. `continent` needs no
 * database seed at all — it draws directly from the seven live `Continent` enum labels, in the
 * same "next dedicated slot" style so two cases never collide on the same label for the same
 * user.
 */
describe('Favorites (e2e, real Postgres)', () => {
  let container: StartedPostgreSqlContainer;
  let dataSource: DataSource;
  let app: INestApplication;

  let provinces: Province[];
  let nextProvinceIndex = 0;
  let countries: Country[];
  let nextCountryIndex = 0;
  let regions: Region[];
  let nextRegionIndex = 0;
  const continentLabels = Object.values(Continent);
  let nextContinentIndex = 0;

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

  /** The next UNUSED seeded region — guarantees every case gets its own row (7 total, ever). */
  function nextRegion(): Region {
    const region = regions[nextRegionIndex];
    if (region === undefined) throw new Error('ran out of seeded regions (only 7 exist)');
    nextRegionIndex += 1;
    return region;
  }

  /** The next UNUSED continent label — guarantees every case gets its own value (7 total, ever). */
  function nextContinent(): Continent {
    const continent = continentLabels[nextContinentIndex];
    if (continent === undefined) throw new Error('ran out of continent labels (only 7 exist)');
    nextContinentIndex += 1;
    return continent;
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

  async function countFavoriteRows(
    userId: string,
    sqlColumn: string,
    value: string,
  ): Promise<number> {
    const rows = await dataSource.query<{ count: string }[]>(
      `SELECT count(*)::int AS count FROM "favorites" WHERE "user_id" = $1 AND "${sqlColumn}" = $2`,
      [userId, value],
    );
    return Number(rows[0]?.count ?? 0);
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
    await seedRegions(dataSource);

    provinces = await dataSource.getRepository(Province).find({ order: { plateCode: 'ASC' } });
    // One dedicated slot per province-consuming case below — comfortably under the 81-province
    // corpus.
    expect(provinces.length).toBeGreaterThanOrEqual(15);

    countries = await dataSource.getRepository(Country).find({ order: { isoCode: 'ASC' } });
    // One dedicated slot per country-consuming case below — comfortably under the ~199-country
    // corpus.
    expect(countries.length).toBeGreaterThanOrEqual(15);

    regions = await dataSource.getRepository(Region).find({ order: { slug: 'ASC' } });
    // Exactly 7 regions exist, ever (GLOSSARY.md §2) — every region-consuming case below draws
    // from this fixed pool, so the case count below is deliberately kept at or under 7.
    expect(regions).toHaveLength(7);
    expect(continentLabels).toHaveLength(7);

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
        .put(`/api/favorites/province/${plateCode}`)
        .expect(401);
      expect(putResponse.headers['cache-control']).toBe('no-store');

      const deleteResponse = await request(app.getHttpServer())
        .delete(`/api/favorites/province/${plateCode}`)
        .expect(401);
      expect(deleteResponse.headers['cache-control']).toBe('no-store');
    });

    it('PUT/DELETE a country with no Authorization header -> 401, Cache-Control: no-store', async () => {
      const isoCode = nextCountry().isoCode;
      const putResponse = await request(app.getHttpServer())
        .put(`/api/favorites/country/${isoCode}`)
        .expect(401);
      expect(putResponse.headers['cache-control']).toBe('no-store');

      const deleteResponse = await request(app.getHttpServer())
        .delete(`/api/favorites/country/${isoCode}`)
        .expect(401);
      expect(deleteResponse.headers['cache-control']).toBe('no-store');
    });
  });

  describe('province — add / idempotency / concurrency / not-found', () => {
    it('PUT a province -> 200, echoes { entityType: province, entityId: plateCode, createdAt }; a repeat PUT echoes the original createdAt; a follow-up GET lists it', async () => {
      const province = nextProvince();
      const firstPut = await request(app.getHttpServer())
        .put(`/api/favorites/province/${province.plateCode}`)
        .set(bearer(userAToken))
        .expect(200);
      expect(firstPut.headers['cache-control']).toBe('no-store');

      const body = firstPut.body as Record<string, unknown>;
      expect(Object.keys(body).sort()).toEqual(['createdAt', 'entityId', 'entityType']);
      expect(body).toMatchObject({ entityType: 'province', entityId: province.plateCode });
      expect(typeof body.createdAt).toBe('string');

      const secondPut = await request(app.getHttpServer())
        .put(`/api/favorites/province/${province.plateCode}`)
        .set(bearer(userAToken))
        .expect(200);
      expect((secondPut.body as { createdAt: string }).createdAt).toBe(body.createdAt);

      const count = await countFavoriteRows(userAId, 'province_id', province.id);
      expect(count).toBe(1);

      const getResponse = await request(app.getHttpServer())
        .get('/api/favorites')
        .set(bearer(userAToken))
        .expect(200);
      expect(getResponse.headers['cache-control']).toBe('no-store');
      const items = getResponse.body as Record<string, unknown>[];
      expect(items).toContainEqual(body);
    });

    it('two concurrent identical province PUTs -> exactly one row (concurrency race)', async () => {
      const province = nextProvince();
      const fire = (): request.Test =>
        request(app.getHttpServer())
          .put(`/api/favorites/province/${province.plateCode}`)
          .set(bearer(userAToken));

      const [first, second] = await Promise.all([fire(), fire()]);
      expect([first.status, second.status]).toEqual([200, 200]);
      expect(await countFavoriteRows(userAId, 'province_id', province.id)).toBe(1);
    });

    it('a concurrent PUT + DELETE on the same never-before-favorited province -> the PUT never surfaces a raw 500 (SFH144-I1 race)', async () => {
      // Pre-fix, `addProvince` committed a plain INSERT then re-read the row with a separate
      // `findOneOrFail` — a concurrent DELETE on the exact same (user, target) pair could land in
      // the window between those two statements and remove the row, so the re-read found nothing
      // and an uncaught `EntityNotFoundError` surfaced as a bogus 500. The fix collapses both
      // statements into one atomic `INSERT ... ON CONFLICT DO UPDATE ... RETURNING`, so no such
      // window exists any more regardless of which side of the race wins — and this is now the
      // SAME generic code path every one of the four types shares (`FavoritesService.addTarget`),
      // so this race is proven once here rather than re-proven per type.
      const province = nextProvince();
      const [putResponse, deleteResponse] = await Promise.all([
        request(app.getHttpServer())
          .put(`/api/favorites/province/${province.plateCode}`)
          .set(bearer(userAToken)),
        request(app.getHttpServer())
          .delete(`/api/favorites/province/${province.plateCode}`)
          .set(bearer(userAToken)),
      ]);

      expect(putResponse.status).toBe(200);
      expect(deleteResponse.status).toBe(204);
    });

    it('PUT a well-formed but nonexistent plateCode -> 404 errors.favorites.provinceNotFound', async () => {
      const response = await request(app.getHttpServer())
        .put('/api/favorites/province/99')
        .set(bearer(userAToken))
        .expect(404);
      expect((response.body as { message: string }).message).toBe(
        'errors.favorites.provinceNotFound',
      );
    });

    it.each(['9', '999', 'ab'])('PUT a malformed plateCode (%s) -> 400', async (plateCode) => {
      await request(app.getHttpServer())
        .put(`/api/favorites/province/${plateCode}`)
        .set(bearer(userAToken))
        .expect(400);
    });
  });

  describe('country — add / idempotency / concurrency / not-found', () => {
    it('PUT a country -> 200, echoes { entityType: country, entityId: isoCode, createdAt }; a repeat PUT echoes the original createdAt; a follow-up GET lists it', async () => {
      const country = nextCountry();
      const firstPut = await request(app.getHttpServer())
        .put(`/api/favorites/country/${country.isoCode}`)
        .set(bearer(userAToken))
        .expect(200);
      expect(firstPut.headers['cache-control']).toBe('no-store');

      const body = firstPut.body as Record<string, unknown>;
      expect(Object.keys(body).sort()).toEqual(['createdAt', 'entityId', 'entityType']);
      expect(body).toMatchObject({ entityType: 'country', entityId: country.isoCode });
      expect(typeof body.createdAt).toBe('string');

      const secondPut = await request(app.getHttpServer())
        .put(`/api/favorites/country/${country.isoCode}`)
        .set(bearer(userAToken))
        .expect(200);
      expect((secondPut.body as { createdAt: string }).createdAt).toBe(body.createdAt);

      expect(await countFavoriteRows(userAId, 'country_id', country.id)).toBe(1);

      const getResponse = await request(app.getHttpServer())
        .get('/api/favorites')
        .set(bearer(userAToken))
        .expect(200);
      const items = getResponse.body as Record<string, unknown>[];
      expect(items).toContainEqual(body);
    });

    it('two concurrent identical country PUTs -> exactly one row (concurrency race)', async () => {
      const country = nextCountry();
      const fire = (): request.Test =>
        request(app.getHttpServer())
          .put(`/api/favorites/country/${country.isoCode}`)
          .set(bearer(userAToken));

      const [first, second] = await Promise.all([fire(), fire()]);
      expect([first.status, second.status]).toEqual([200, 200]);
      expect(await countFavoriteRows(userAId, 'country_id', country.id)).toBe(1);
    });

    it('a concurrent PUT + DELETE on the same never-before-favorited country -> the PUT never surfaces a raw 500 (SFH144-I1 race, country mirror)', async () => {
      const country = nextCountry();
      const [putResponse, deleteResponse] = await Promise.all([
        request(app.getHttpServer())
          .put(`/api/favorites/country/${country.isoCode}`)
          .set(bearer(userAToken)),
        request(app.getHttpServer())
          .delete(`/api/favorites/country/${country.isoCode}`)
          .set(bearer(userAToken)),
      ]);

      expect(putResponse.status).toBe(200);
      expect(deleteResponse.status).toBe(204);
    });

    it('PUT a well-formed but nonexistent isoCode -> 404 errors.favorites.countryNotFound', async () => {
      const response = await request(app.getHttpServer())
        .put('/api/favorites/country/ZZ')
        .set(bearer(userAToken))
        .expect(404);
      expect((response.body as { message: string }).message).toBe(
        'errors.favorites.countryNotFound',
      );
    });

    it.each(['t', 'TRX', 'tr', '12'])('PUT a malformed isoCode (%s) -> 400', async (isoCode) => {
      await request(app.getHttpServer())
        .put(`/api/favorites/country/${isoCode}`)
        .set(bearer(userAToken))
        .expect(400);
    });
  });

  describe('region — add / idempotency / not-found (P1 PR-A, new type)', () => {
    it('PUT a region -> 200, echoes { entityType: region, entityId: slug, createdAt }; a repeat PUT echoes the original createdAt; a follow-up GET lists it', async () => {
      const region = nextRegion();
      const firstPut = await request(app.getHttpServer())
        .put(`/api/favorites/region/${region.slug}`)
        .set(bearer(userAToken))
        .expect(200);
      expect(firstPut.headers['cache-control']).toBe('no-store');

      const body = firstPut.body as Record<string, unknown>;
      expect(Object.keys(body).sort()).toEqual(['createdAt', 'entityId', 'entityType']);
      expect(body).toMatchObject({ entityType: 'region', entityId: region.slug });

      const secondPut = await request(app.getHttpServer())
        .put(`/api/favorites/region/${region.slug}`)
        .set(bearer(userAToken))
        .expect(200);
      expect((secondPut.body as { createdAt: string }).createdAt).toBe(body.createdAt);

      expect(await countFavoriteRows(userAId, 'region_id', region.id)).toBe(1);

      const getResponse = await request(app.getHttpServer())
        .get('/api/favorites')
        .set(bearer(userAToken))
        .expect(200);
      expect(getResponse.body as Record<string, unknown>[]).toContainEqual(body);
    });

    it('two concurrent identical region PUTs -> exactly one row (concurrency race, same generic code path as province/country)', async () => {
      const region = nextRegion();
      const fire = (): request.Test =>
        request(app.getHttpServer())
          .put(`/api/favorites/region/${region.slug}`)
          .set(bearer(userAToken));

      const [first, second] = await Promise.all([fire(), fire()]);
      expect([first.status, second.status]).toEqual([200, 200]);
      expect(await countFavoriteRows(userAId, 'region_id', region.id)).toBe(1);
    });

    it('PUT a well-formed but nonexistent slug -> 404 errors.favorites.regionNotFound', async () => {
      const response = await request(app.getHttpServer())
        .put('/api/favorites/region/nonexistent-region')
        .set(bearer(userAToken))
        .expect(404);
      expect((response.body as { message: string }).message).toBe(
        'errors.favorites.regionNotFound',
      );
    });

    it.each(['Ic-Anadolu', 'ic_anadolu', 'a'.repeat(51)])(
      'PUT a malformed region slug (%s) -> 400',
      async (slug) => {
        await request(app.getHttpServer())
          .put(`/api/favorites/region/${slug}`)
          .set(bearer(userAToken))
          .expect(400);
      },
    );
  });

  describe('continent — add / idempotency / not-found (P1 PR-A, new type)', () => {
    it('PUT a continent -> 200, echoes { entityType: continent, entityId: label, createdAt }; a repeat PUT echoes the original createdAt; a follow-up GET lists it', async () => {
      const continent = nextContinent();
      const firstPut = await request(app.getHttpServer())
        .put(`/api/favorites/continent/${continent}`)
        .set(bearer(userAToken))
        .expect(200);
      expect(firstPut.headers['cache-control']).toBe('no-store');

      const body = firstPut.body as Record<string, unknown>;
      expect(Object.keys(body).sort()).toEqual(['createdAt', 'entityId', 'entityType']);
      expect(body).toMatchObject({ entityType: 'continent', entityId: continent });

      const secondPut = await request(app.getHttpServer())
        .put(`/api/favorites/continent/${continent}`)
        .set(bearer(userAToken))
        .expect(200);
      expect((secondPut.body as { createdAt: string }).createdAt).toBe(body.createdAt);

      expect(await countFavoriteRows(userAId, 'continent', continent)).toBe(1);

      const getResponse = await request(app.getHttpServer())
        .get('/api/favorites')
        .set(bearer(userAToken))
        .expect(200);
      expect(getResponse.body as Record<string, unknown>[]).toContainEqual(body);
    });

    it('two concurrent identical continent PUTs -> exactly one row (concurrency race, same generic code path)', async () => {
      const continent = nextContinent();
      const fire = (): request.Test =>
        request(app.getHttpServer())
          .put(`/api/favorites/continent/${continent}`)
          .set(bearer(userAToken));

      const [first, second] = await Promise.all([fire(), fire()]);
      expect([first.status, second.status]).toEqual([200, 200]);
      expect(await countFavoriteRows(userAId, 'continent', continent)).toBe(1);
    });

    it('PUT a well-formed but nonexistent continent label -> 404 errors.favorites.continentNotFound', async () => {
      // "PANGEA" satisfies the shape rule (upper-snake, 3-16 chars) but is not one of the seven
      // live `Continent` labels — the 400-vs-404 split this route shares with `plateCode`'s
      // `6`-vs-`99` pair (plan §5.1.2).
      const response = await request(app.getHttpServer())
        .put('/api/favorites/continent/PANGEA')
        .set(bearer(userAToken))
        .expect(404);
      expect((response.body as { message: string }).message).toBe(
        'errors.favorites.continentNotFound',
      );
    });

    it.each(['asya', 'Asya', 'AS'])(
      'PUT a malformed continent label (%s) -> 400',
      async (label) => {
        await request(app.getHttpServer())
          .put(`/api/favorites/continent/${label}`)
          .set(bearer(userAToken))
          .expect(400);
      },
    );
  });

  describe('remove — province', () => {
    it('DELETE a favorited province -> 204; a follow-up GET no longer lists it', async () => {
      const province = nextProvince();
      await request(app.getHttpServer())
        .put(`/api/favorites/province/${province.plateCode}`)
        .set(bearer(userAToken))
        .expect(200);

      const deleteResponse = await request(app.getHttpServer())
        .delete(`/api/favorites/province/${province.plateCode}`)
        .set(bearer(userAToken))
        .expect(204);
      expect(deleteResponse.headers['cache-control']).toBe('no-store');

      const getResponse = await request(app.getHttpServer())
        .get('/api/favorites')
        .set(bearer(userAToken))
        .expect(200);
      const items = getResponse.body as Record<string, unknown>[];
      expect(items.some((item) => item.entityId === province.plateCode)).toBe(false);
    });

    it('DELETE a real, never-favorited province -> 204, no row created, no error', async () => {
      const province = nextProvince();
      await request(app.getHttpServer())
        .delete(`/api/favorites/province/${province.plateCode}`)
        .set(bearer(userAToken))
        .expect(204);
      expect(await countFavoriteRows(userAId, 'province_id', province.id)).toBe(0);
    });

    it('DELETE a well-formed but nonexistent plateCode -> 204 (idempotent-remove design)', async () => {
      await request(app.getHttpServer())
        .delete('/api/favorites/province/99')
        .set(bearer(userAToken))
        .expect(204);
    });

    it('DELETE a malformed plateCode -> 400', async () => {
      await request(app.getHttpServer())
        .delete('/api/favorites/province/ab')
        .set(bearer(userAToken))
        .expect(400);
    });
  });

  describe('remove — country', () => {
    it('DELETE a favorited country -> 204; a follow-up GET no longer lists it', async () => {
      const country = nextCountry();
      await request(app.getHttpServer())
        .put(`/api/favorites/country/${country.isoCode}`)
        .set(bearer(userAToken))
        .expect(200);

      await request(app.getHttpServer())
        .delete(`/api/favorites/country/${country.isoCode}`)
        .set(bearer(userAToken))
        .expect(204);

      const getResponse = await request(app.getHttpServer())
        .get('/api/favorites')
        .set(bearer(userAToken))
        .expect(200);
      const items = getResponse.body as Record<string, unknown>[];
      expect(items.some((item) => item.entityId === country.isoCode)).toBe(false);
    });

    it('DELETE a well-formed but nonexistent isoCode -> 204', async () => {
      await request(app.getHttpServer())
        .delete('/api/favorites/country/ZZ')
        .set(bearer(userAToken))
        .expect(204);
    });

    it('DELETE a malformed isoCode -> 400', async () => {
      await request(app.getHttpServer())
        .delete('/api/favorites/country/trx')
        .set(bearer(userAToken))
        .expect(400);
    });
  });

  describe('remove — region and continent (idempotent-remove mirrors)', () => {
    it('DELETE a favorited region -> 204; a follow-up GET no longer lists it', async () => {
      const region = nextRegion();
      await request(app.getHttpServer())
        .put(`/api/favorites/region/${region.slug}`)
        .set(bearer(userAToken))
        .expect(200);

      await request(app.getHttpServer())
        .delete(`/api/favorites/region/${region.slug}`)
        .set(bearer(userAToken))
        .expect(204);

      const getResponse = await request(app.getHttpServer())
        .get('/api/favorites')
        .set(bearer(userAToken))
        .expect(200);
      const items = getResponse.body as Record<string, unknown>[];
      expect(items.some((item) => item.entityId === region.slug)).toBe(false);
    });

    it('DELETE a well-formed but nonexistent region slug -> 204', async () => {
      await request(app.getHttpServer())
        .delete('/api/favorites/region/another-nonexistent-region')
        .set(bearer(userAToken))
        .expect(204);
    });

    it('DELETE a favorited continent -> 204; a follow-up GET no longer lists it', async () => {
      const continent = nextContinent();
      await request(app.getHttpServer())
        .put(`/api/favorites/continent/${continent}`)
        .set(bearer(userAToken))
        .expect(200);

      await request(app.getHttpServer())
        .delete(`/api/favorites/continent/${continent}`)
        .set(bearer(userAToken))
        .expect(204);

      const getResponse = await request(app.getHttpServer())
        .get('/api/favorites')
        .set(bearer(userAToken))
        .expect(200);
      const items = getResponse.body as Record<string, unknown>[];
      expect(items.some((item) => item.entityId === continent)).toBe(false);
    });

    it('DELETE a well-formed but nonexistent continent label -> 204', async () => {
      // "LEMURIA" satisfies the shape rule (upper-snake, 3-16 chars) but is not one of the seven
      // live `Continent` labels — mirrors the PUT 404 case's "PANGEA" above.
      await request(app.getHttpServer())
        .delete('/api/favorites/continent/LEMURIA')
        .set(bearer(userAToken))
        .expect(204);
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

    it('GET after favoriting one of each of the four types -> 200, all four present with the right entityType/entityId', async () => {
      const istanbul = await dataSource
        .getRepository(Province)
        .findOneOrFail({ where: { plateCode: '34' } });
      const district = await dataSource
        .getRepository(District)
        .findOneOrFail({ where: { provinceId: istanbul.id } });
      const freshUser = await createUser('favorites-mixed@example.test', district.id);
      const freshToken = await mintFor(freshUser);

      const province = nextProvince();
      const country = nextCountry();
      const region = nextRegion();
      const continent = nextContinent();

      for (const [entityType, entityId] of [
        ['province', province.plateCode],
        ['country', country.isoCode],
        ['region', region.slug],
        ['continent', continent],
      ] as const) {
        await request(app.getHttpServer())
          .put(`/api/favorites/${entityType}/${entityId}`)
          .set(bearer(freshToken))
          .expect(200);
      }

      const response = await request(app.getHttpServer())
        .get('/api/favorites')
        .set(bearer(freshToken))
        .expect(200);
      const items = response.body as { entityType: string; entityId: string }[];
      expect(items).toHaveLength(4);
      expect(items.map((item) => item.entityType).sort()).toEqual([
        'continent',
        'country',
        'province',
        'region',
      ]);
      expect(items.find((item) => item.entityType === 'province')).toMatchObject({
        entityId: province.plateCode,
      });
      expect(items.find((item) => item.entityType === 'country')).toMatchObject({
        entityId: country.isoCode,
      });
      expect(items.find((item) => item.entityType === 'region')).toMatchObject({
        entityId: region.slug,
      });
      expect(items.find((item) => item.entityType === 'continent')).toMatchObject({
        entityId: continent,
      });
    });
  });

  describe('cross-user isolation, including the delete surface', () => {
    it("B never sees A's favorite; B's DELETE on the same plateCode returns 204 but leaves A's row in place", async () => {
      const province = nextProvince();
      await request(app.getHttpServer())
        .put(`/api/favorites/province/${province.plateCode}`)
        .set(bearer(userAToken))
        .expect(200);

      const getB = await request(app.getHttpServer())
        .get('/api/favorites')
        .set(bearer(userBToken))
        .expect(200);
      const bItems = getB.body as Record<string, unknown>[];
      expect(bItems.some((item) => item.entityId === province.plateCode)).toBe(false);

      // B's delete of the SAME plateCode A favorited — must not touch A's row.
      await request(app.getHttpServer())
        .delete(`/api/favorites/province/${province.plateCode}`)
        .set(bearer(userBToken))
        .expect(204);

      expect(await countFavoriteRows(userAId, 'province_id', province.id)).toBe(1);

      const getA = await request(app.getHttpServer())
        .get('/api/favorites')
        .set(bearer(userAToken))
        .expect(200);
      const aItems = getA.body as Record<string, unknown>[];
      expect(aItems.some((item) => item.entityId === province.plateCode)).toBe(true);
    });

    it("B never sees A's favorited country; B's DELETE on the same isoCode returns 204 but leaves A's row in place", async () => {
      const country = nextCountry();
      await request(app.getHttpServer())
        .put(`/api/favorites/country/${country.isoCode}`)
        .set(bearer(userAToken))
        .expect(200);

      const getB = await request(app.getHttpServer())
        .get('/api/favorites')
        .set(bearer(userBToken))
        .expect(200);
      const bItems = getB.body as Record<string, unknown>[];
      expect(bItems.some((item) => item.entityId === country.isoCode)).toBe(false);

      await request(app.getHttpServer())
        .delete(`/api/favorites/country/${country.isoCode}`)
        .set(bearer(userBToken))
        .expect(204);

      expect(await countFavoriteRows(userAId, 'country_id', country.id)).toBe(1);
    });

    it("B never sees A's favorited region; B's DELETE on the same slug returns 204 but leaves A's row in place", async () => {
      const region = nextRegion();
      await request(app.getHttpServer())
        .put(`/api/favorites/region/${region.slug}`)
        .set(bearer(userAToken))
        .expect(200);

      const getB = await request(app.getHttpServer())
        .get('/api/favorites')
        .set(bearer(userBToken))
        .expect(200);
      expect(
        (getB.body as Record<string, unknown>[]).some((item) => item.entityId === region.slug),
      ).toBe(false);

      await request(app.getHttpServer())
        .delete(`/api/favorites/region/${region.slug}`)
        .set(bearer(userBToken))
        .expect(204);

      expect(await countFavoriteRows(userAId, 'region_id', region.id)).toBe(1);
    });

    it("B never sees A's favorited continent; B's DELETE on the same label returns 204 but leaves A's row in place", async () => {
      const continent = nextContinent();
      await request(app.getHttpServer())
        .put(`/api/favorites/continent/${continent}`)
        .set(bearer(userAToken))
        .expect(200);

      const getB = await request(app.getHttpServer())
        .get('/api/favorites')
        .set(bearer(userBToken))
        .expect(200);
      expect(
        (getB.body as Record<string, unknown>[]).some((item) => item.entityId === continent),
      ).toBe(false);

      await request(app.getHttpServer())
        .delete(`/api/favorites/continent/${continent}`)
        .set(bearer(userBToken))
        .expect(204);

      expect(await countFavoriteRows(userAId, 'continent', continent)).toBe(1);
    });
  });

  describe('a pre-PR-A-shaped favourites row renders correctly under the new contract', () => {
    /**
     * `AddFavoriteRegionAndContinent.up()` executes no DML whatsoever (its own docblock proves
     * this analytically): it only adds two nullable columns and widens the CHECK. A row that
     * existed before this migration is therefore byte-identical, column for column, to a row
     * that is inserted directly today with only `province_id` (or `country_id`) set and
     * `region_id`/`continent` left NULL — which is exactly what this case constructs, against
     * the FULLY migrated schema, to prove acceptance criterion #1 (no existing favourite loses
     * its meaning) at the application layer rather than only at the SQL layer.
     */
    it('a raw-inserted province-only row (the exact shape every pre-migration row has) is served with the right entityType/entityId', async () => {
      const province = nextProvince();
      await dataSource.query(`INSERT INTO "favorites" ("user_id", "province_id") VALUES ($1, $2)`, [
        userBId,
        province.id,
      ]);

      const response = await request(app.getHttpServer())
        .get('/api/favorites')
        .set(bearer(userBToken))
        .expect(200);
      const items = response.body as { entityType: string; entityId: string }[];
      expect(items).toContainEqual(
        expect.objectContaining({ entityType: 'province', entityId: province.plateCode }),
      );
    });

    it('a raw-inserted country-only row (the exact shape every pre-migration row has) is served with the right entityType/entityId', async () => {
      const country = nextCountry();
      await dataSource.query(`INSERT INTO "favorites" ("user_id", "country_id") VALUES ($1, $2)`, [
        userBId,
        country.id,
      ]);

      const response = await request(app.getHttpServer())
        .get('/api/favorites')
        .set(bearer(userBToken))
        .expect(200);
      const items = response.body as { entityType: string; entityId: string }[];
      expect(items).toContainEqual(
        expect.objectContaining({ entityType: 'country', entityId: country.isoCode }),
      );
    });
  });

  describe('schema — FK delete rules (information_schema, not a live delete attempt)', () => {
    it('FK_favorites_user is CASCADE; FK_favorites_province, FK_favorites_country and FK_favorites_region are RESTRICT', async () => {
      // Read straight from `information_schema.referential_constraints` rather than trusting the
      // entity/migration docblocks — a query that can't see the table (or a renamed constraint) at
      // all must fail RED here, not silently pass (the `video-progress.e2e-spec.ts` pattern).
      const rows = await dataSource.query<{ constraint_name: string; delete_rule: string }[]>(`
        SELECT constraint_name, delete_rule
        FROM information_schema.referential_constraints
        WHERE constraint_name IN (
          'FK_favorites_user', 'FK_favorites_province', 'FK_favorites_country', 'FK_favorites_region'
        )
      `);
      const rules = Object.fromEntries(rows.map((row) => [row.constraint_name, row.delete_rule]));
      expect(rules).toEqual({
        FK_favorites_user: 'CASCADE',
        FK_favorites_province: 'RESTRICT',
        FK_favorites_country: 'RESTRICT',
        FK_favorites_region: 'RESTRICT',
      });
    });

    it('continent has no FK at all — it cannot, because Continent is an enum type, not a table', async () => {
      const rows = await dataSource.query<{ constraint_name: string }[]>(`
        SELECT constraint_name FROM information_schema.referential_constraints
        WHERE constraint_name = 'FK_favorites_continent'
      `);
      expect(rows).toEqual([]);
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

    it('a row with only region_id set succeeds', async () => {
      const region = nextRegion();
      await expect(
        dataSource.query(`INSERT INTO "favorites" ("user_id", "region_id") VALUES ($1, $2)`, [
          userBId,
          region.id,
        ]),
      ).resolves.not.toThrow();
    });

    it('a row with only continent set succeeds', async () => {
      const continent = nextContinent();
      await expect(
        dataSource.query(`INSERT INTO "favorites" ("user_id", "continent") VALUES ($1, $2)`, [
          userBId,
          continent,
        ]),
      ).resolves.not.toThrow();
    });

    /**
     * Acceptance criterion #3: proved by a case that would SUCCEED if `num_nonnulls(...) = 1`
     * were dropped, not merely by one that already passes today. A province_id + a continent set
     * together on one row violates no OTHER constraint here (no FK, no UNIQUE fires — this is
     * the first row for this user against both that province and that continent), so the CHECK
     * is provably the only thing standing in the way.
     */
    it('a row with BOTH province_id and continent set is rejected — and nothing else would have caught it', async () => {
      const province = nextProvince();
      const continent = nextContinent();
      await expect(
        dataSource.query(
          `INSERT INTO "favorites" ("user_id", "province_id", "continent") VALUES ($1, $2, $3)`,
          [userBId, province.id, continent],
        ),
      ).rejects.toBeInstanceOf(QueryFailedError);
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

    it('a row with NEITHER of the four target columns set is rejected by the same constraint', async () => {
      await expect(
        dataSource.query(`INSERT INTO "favorites" ("user_id") VALUES ($1)`, [userBId]),
      ).rejects.toBeInstanceOf(QueryFailedError);
    });
  });

  describe('migration down() — fail-closed once a region/continent favourite exists (acceptance criterion #2)', () => {
    it('refuses to revert once a region or continent favourite exists, and drops nothing (run LAST — reverting would break every test above)', async () => {
      // By this point in the suite the region/continent sections above have unquestionably left
      // at least one region and one continent favourite row behind. down() must refuse rather
      // than silently DROP COLUMN and destroy them.
      const strayRows = await dataSource.query<{ count: string }[]>(
        `SELECT count(*)::int AS count FROM "favorites" WHERE "region_id" IS NOT NULL OR "continent" IS NOT NULL`,
      );
      expect(Number(strayRows[0]?.count ?? 0)).toBeGreaterThan(0);

      // `AddFavoriteRegionAndContinent` is no longer the literal tip of the registered
      // `migrations` array — TWO migrations landed after it since this suite last checked:
      // UYE-P1E's `AddSchoolNameAndParentAccountRole` (the current tail) and, before it, P1 PR-C's
      // `AddGameRoundsLeaderboardIndex`. `undoLastMigration()` only ever pops the SINGLE most
      // recent entry, so reaching the migration under test now takes THREE pops. The first
      // reverts `AddSchoolNameAndParentAccountRole` — awaited but not independently asserted (an
      // unhandled rejection here would still fail the test, but nothing below checks its outcome
      // directly); it is expected to succeed cleanly since this suite never sets `schoolName` and
      // never registers a `PARENT` account, so neither of that migration's own down() guards (the
      // explicit stray-`school_name` guard, the natural CHECK-violation guard on a live `PARENT`
      // row) finds anything to refuse. The second reverts `AddGameRoundsLeaderboardIndex` (a
      // plain, unconditional `DROP INDEX` on `game_rounds` — nothing about favourites, and nothing
      // to refuse); also awaited but not independently asserted. The THIRD call is the one that
      // actually reaches `AddFavoriteRegionAndContinent.down()` and is the one this test is about.
      await dataSource.undoLastMigration();
      await dataSource.undoLastMigration();

      await expect(dataSource.undoLastMigration()).rejects.toThrow(
        /AddFavoriteRegionAndContinent\.down\(\) refuses/,
      );

      // The RAISE EXCEPTION aborts inside the migration's own transaction before any DROP runs —
      // both columns must still be present and reachable.
      const columns = await dataSource.query<{ column_name: string }[]>(`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'favorites' AND column_name IN ('region_id', 'continent')
      `);
      expect(columns.map((row) => row.column_name).sort()).toEqual(['continent', 'region_id']);
    });
  });
});
