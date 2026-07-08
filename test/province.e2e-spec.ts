import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { applyGlobalPrefix } from '../src/common/bootstrap';
import { buildDataSourceOptions } from '../src/database/data-source-options';
import { seedGeography } from '../src/database/seeds/seed-geography';
import { Province } from '../src/province/entities/province.entity';
// NOTE: AppModule is imported dynamically inside beforeAll — NOT at the top —
// because ConfigModule.forRoot validates the env eagerly at module-load time, so
// AppModule must not load until DATABASE_URL has been set to the container URL.

/**
 * Real-Postgres e2e (Testcontainers): proves the migrations run clean, the
 * `db:seed:geography` pilot seed lands the 5 fact-checked provinces
 * IDEMPOTENTLY, and the public read endpoints serve that data under the `/api`
 * prefix. Runs on CI only (needs Docker); locally we run tsc + eslint per
 * CONVENTIONS §2.
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

    // 1) Migrations must run clean against a real Postgres, creating the schema.
    dataSource = new DataSource(buildDataSourceOptions(url));
    await dataSource.initialize();
    const applied = await dataSource.runMigrations();
    expect(applied).toHaveLength(2);
    expect(applied.map((m) => m.name)).toEqual([
      'InitProvince1783382400000',
      'AddProvinceClimateNote1783513986800',
    ]);

    // 2) Run the geography seed TWICE — the second run proves idempotency (no
    //    duplicate rows, converges to the same fact-checked values).
    const first = await seedGeography(dataSource);
    expect(first).toEqual({ inserted: 5, updated: 0, total: 5 });
    const second = await seedGeography(dataSource);
    expect(second).toEqual({ inserted: 0, updated: 5, total: 5 });

    // 3) Boot the real app against the same DB (no synchronize; schema exists).
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

  it('seeds exactly 5 pilot provinces (idempotent — no duplicates on re-run)', async () => {
    const count = await dataSource.getRepository(Province).count();
    expect(count).toBe(5);
  });

  it('round-trips a seeded Province (transformer + array + deliberate nulls)', async () => {
    const repo = dataSource.getRepository(Province);
    const istanbul = await repo.findOneByOrFail({ plateCode: '34' });
    expect(istanbul.nameTr).toBe('İstanbul');
    // numeric(9,6) comes back through the transformer as a real number
    expect(istanbul.latitude).toBe(40.9819);
    expect(istanbul.longitude).toBe(28.8208);
    // varchar[] round-trips as an array
    expect(istanbul.neighborPlateCodes).toEqual(['59', '41']);
    // the MGM caveat travels with the Köppen value (never a bare code)
    expect(istanbul.climateKoppen).toBe('Csa');
    expect(istanbul.climateNoteTr).toContain('MGM');
    // unseeded research field stays null (never invented for the pilot)
    expect(istanbul.landformNoteTr).toBeNull();
  });

  it('GET /api/provinces returns all 5, plate-ordered, lean (no detail leak)', async () => {
    const res = await request(app.getHttpServer()).get('/api/provinces').expect(200);
    const body = res.body as Array<Record<string, unknown>>;
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(5);
    // lexical plate order: 06, 07, 34, 35, 65
    expect(body.map((p) => p.plateCode)).toEqual(['06', '07', '34', '35', '65']);
    expect(body[0]).toMatchObject({
      plateCode: '06',
      nameTr: 'Ankara',
      region: 'IC_ANADOLU',
      slugTr: 'ankara',
      slugEn: 'ankara',
    });
    // lean payload must NOT carry detail-only fields
    expect(body[0]).not.toHaveProperty('population');
    expect(body[0]).not.toHaveProperty('latitude');
    expect(body[0]).not.toHaveProperty('climateNoteTr');
  });

  it('GET /api/provinces/:slug returns the full, fact-checked detail payload', async () => {
    const res = await request(app.getHttpServer()).get('/api/provinces/istanbul').expect(200);
    const body = res.body as Record<string, unknown>;
    expect(body).toMatchObject({
      plateCode: '34',
      nameTr: 'İstanbul',
      region: 'MARMARA',
      population: 15_754_053,
      populationYear: 2025,
      areaKm2: 5461,
      districtCount: 39,
      elevationM: 33,
      neighborPlateCodes: ['59', '41'],
      climateKoppen: 'Csa',
      climateClassTr: 'Akdeniz iklimi',
      landformNoteTr: null,
    });
    expect(body.latitude).toBe(40.9819);
    expect(body.longitude).toBe(28.8208);
    expect(typeof body.climateNoteTr).toBe('string');
    expect(typeof body.updatedAt).toBe('string');
  });

  it('carries the province-specific MGM caveat (Van diverges in other schemes)', async () => {
    const res = await request(app.getHttpServer()).get('/api/provinces/van').expect(200);
    const body = res.body as Record<string, unknown>;
    expect(body.climateKoppen).toBe('Csa');
    expect(body.climateNoteTr).toContain('karasal/göl-etkili');
  });

  it('GET /api/provinces/:slug returns 404 for an unseeded slug', async () => {
    // A real, valid province NOT in the pilot 5 → 404 (web renders notFound()).
    await request(app.getHttpServer()).get('/api/provinces/bursa').expect(404);
    await request(app.getHttpServer()).get('/api/provinces/atlantis').expect(404);
  });

  it('GET /health stays bare (excluded from the /api prefix)', async () => {
    await request(app.getHttpServer()).get('/health').expect(200, { status: 'ok' });
  });
});
