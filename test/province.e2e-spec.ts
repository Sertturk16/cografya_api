import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { applyGlobalPrefix } from '../src/common/bootstrap';
import { GeographicRegion } from '../src/common/geographic-region.enum';
import { buildDataSourceOptions } from '../src/database/data-source-options';
import { Province } from '../src/province/entities/province.entity';
// NOTE: AppModule is imported dynamically inside beforeAll — NOT at the top —
// because ConfigModule.forRoot validates the env eagerly at module-load time, so
// AppModule must not load until DATABASE_URL has been set to the container URL.

/**
 * Real-Postgres e2e (Testcontainers): proves the migration runs clean, the
 * Province entity round-trips (incl. the numeric transformer + array column),
 * and the public read endpoints behave under the `/api` prefix. Runs on CI only
 * (needs Docker); locally we run tsc + eslint per CONVENTIONS §2.
 */
describe('Province (e2e)', () => {
  let container: StartedPostgreSqlContainer;
  let dataSource: DataSource;
  let app: INestApplication;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
    const url = container.getConnectionUri();

    // The app reads these from the env at boot (zod-validated).
    process.env.DATABASE_URL = url;
    process.env.WEB_ORIGIN = 'http://localhost:3000';

    // 1) Migration must run clean against a real Postgres, creating the schema.
    dataSource = new DataSource(buildDataSourceOptions(url));
    await dataSource.initialize();
    const applied = await dataSource.runMigrations();
    expect(applied).toHaveLength(1);
    expect(applied[0]?.name).toBe('InitProvince1783382400000');

    // 2) Boot the real app against the same DB (no synchronize; schema exists).
    //    Load AppModule now — after DATABASE_URL is set — so its eager env
    //    validation sees the real container URL. A typed require (not a static
    //    import) defers module load to here.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { AppModule } = require('../src/app.module') as typeof import('../src/app.module');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    applyGlobalPrefix(app);
    await app.init();
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    await dataSource?.destroy();
    await container?.stop();
  });

  it('round-trips a Province row (transformer + array + nullable fields)', async () => {
    const repo = dataSource.getRepository(Province);
    const saved = await repo.save(
      repo.create({
        plateCode: '34',
        nameTr: 'İstanbul',
        slugTr: 'istanbul',
        slugEn: 'istanbul',
        region: GeographicRegion.Marmara,
        population: 15_754_053,
        populationYear: 2025,
        areaKm2: 5461,
        districtCount: 39,
        latitude: 41.0136,
        longitude: 28.955,
        neighborPlateCodes: ['59', '41'],
      }),
    );
    expect(saved.id).toEqual(expect.any(String));

    const found = await repo.findOneByOrFail({ plateCode: '34' });
    expect(found.nameTr).toBe('İstanbul');
    // numeric(9,6) comes back through the transformer as a real number
    expect(found.latitude).toBe(41.0136);
    expect(found.longitude).toBe(28.955);
    // varchar[] round-trips as an array
    expect(found.neighborPlateCodes).toEqual(['59', '41']);
    // unset research fields stay null (never invented)
    expect(found.climateKoppen).toBeNull();
    expect(found.landformNoteTr).toBeNull();
  });

  it('GET /api/provinces returns the lean list (no detail-only fields leak)', async () => {
    const res = await request(app.getHttpServer()).get('/api/provinces').expect(200);
    const body = res.body as Array<Record<string, unknown>>;
    expect(Array.isArray(body)).toBe(true);
    expect(body[0]).toMatchObject({
      plateCode: '34',
      nameTr: 'İstanbul',
      region: 'MARMARA',
      slugTr: 'istanbul',
      slugEn: 'istanbul',
    });
    // lean payload must NOT carry detail-only fields
    expect(body[0]).not.toHaveProperty('population');
    expect(body[0]).not.toHaveProperty('latitude');
  });

  it('GET /api/provinces/:slug returns the full detail payload', async () => {
    const res = await request(app.getHttpServer()).get('/api/provinces/istanbul').expect(200);
    const body = res.body as Record<string, unknown>;
    expect(body).toMatchObject({
      plateCode: '34',
      population: 15_754_053,
      areaKm2: 5461,
      neighborPlateCodes: ['59', '41'],
    });
    expect(body.latitude).toBe(41.0136);
    expect(typeof body.updatedAt).toBe('string');
  });

  it('GET /api/provinces/:slug returns 404 for an unknown slug', async () => {
    await request(app.getHttpServer()).get('/api/provinces/atlantis').expect(404);
  });

  it('GET /health stays bare (excluded from the /api prefix)', async () => {
    await request(app.getHttpServer()).get('/health').expect(200, { status: 'ok' });
  });
});
