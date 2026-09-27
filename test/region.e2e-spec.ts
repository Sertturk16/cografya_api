import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NextFunction, Request, Response } from 'express';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { applyGlobalPrefix } from '../src/common/bootstrap';
import { buildDataSourceOptions } from '../src/database/data-source-options';
import { seedGeography } from '../src/database/seeds/seed-geography';
import { seedRegions } from '../src/database/seeds/seed-regions';
import { seedWorld } from '../src/database/seeds/seed-world';
import { SEED_COUNTRIES } from '../src/database/seeds/country.seed-data';
import { SEED_REGIONS } from '../src/database/seeds/region.seed-data';
import { Region } from '../src/region/entities/region.entity';
import {
  SEED_COPY_CHANGES,
  UpdateSeedProseCopy1790208000000,
} from '../src/database/migrations/1790208000000-UpdateSeedProseCopy';
import {
  FixSeedProseFacts1790553600000,
  SEED_FACT_CHANGES,
} from '../src/database/migrations/1790553600000-FixSeedProseFacts';
import { INTERNAL_REQUEST_HEADER } from '../src/common/throttler/trusted-client';

const TEST_INTERNAL_TOKEN = 'e2e-trusted-client-token-0123456789-abcdefgh';

describe('Geographic Region endpoints (e2e)', () => {
  let container: StartedPostgreSqlContainer | null = null;
  let dataSource: DataSource | null = null;
  let app: INestApplication | null = null;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
    const url = container.getConnectionUri();

    process.env.DATABASE_URL = url;
    process.env.WEB_ORIGIN = 'http://localhost:3000';
    process.env.INTERNAL_REQUEST_TOKEN = TEST_INTERNAL_TOKEN;

    dataSource = new DataSource(buildDataSourceOptions(url));
    await dataSource.initialize();
    await dataSource.runMigrations();

    // Seed real provinces and real regions
    await seedGeography(dataSource);
    await seedRegions(dataSource);

    // Boot app
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { AppModule } = require('../src/app.module') as typeof import('../src/app.module');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    applyGlobalPrefix(app);
    app.use((req: Request, _res: Response, next: NextFunction) => {
      req.headers[INTERNAL_REQUEST_HEADER] = TEST_INTERNAL_TOKEN;
      next();
    });
    await app.init();
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    await dataSource?.destroy();
    await container?.stop();
  });

  describe('seedRegions mechanism', () => {
    it('seeds all seven regions cleanly', async () => {
      if (!dataSource) throw new Error('dataSource not initialized');
      const repo = dataSource.getRepository(Region);
      const count = await repo.count();
      expect(count).toBe(SEED_REGIONS.length);
      expect(count).toBe(7);
    });

    it('is idempotent: re-seeding produces 7 unchanged rows', async () => {
      if (!dataSource) throw new Error('dataSource not initialized');
      const result = await seedRegions(dataSource);
      expect(result.inserted).toBe(0);
      expect(result.updated).toBe(0);
      expect(result.unchanged).toBe(7);
      expect(result.total).toBe(7);
    });
  });

  // T-097: the prose migrations must land on rows seeded before them, reverse cleanly, and
  // leave a column alone once it holds anything other than the exact text it expects to replace.
  // A later prose migration may rewrite a column an earlier one rewrote, so they run as a chain.
  describe('seed prose migrations', () => {
    type ProseChange = {
      readonly table: string;
      readonly keyColumn: string;
      readonly key: string | number;
      readonly column: string;
      readonly before: unknown;
      readonly after: unknown;
    };
    const readColumn = async (ds: DataSource, change: ProseChange) => {
      const rows: Record<string, unknown>[] = await ds.query(
        `SELECT "${change.column}" AS value FROM "${change.table}" WHERE "${change.keyColumn}" = $1`,
        [change.key],
      );
      return rows[0]?.value;
    };
    const chain: ReadonlyArray<readonly ProseChange[]> = [SEED_COPY_CHANGES, SEED_FACT_CHANGES];
    const id = (c: ProseChange) => `${c.table}/${String(c.key)}/${c.column}`;
    const oldest = new Map<string, ProseChange>();
    const newest = new Map<string, ProseChange>();
    for (const changes of chain) {
      for (const c of changes) {
        if (!oldest.has(id(c))) oldest.set(id(c), c);
        newest.set(id(c), c);
      }
    }
    const seeded = SEED_COPY_CHANGES.filter((c) => c.table !== 'countries');

    // This suite does not seed countries otherwise; load only the rows the migrations touch,
    // so their text and array columns are exercised against real Postgres too.
    beforeAll(async () => {
      if (!dataSource) throw new Error('dataSource not initialized');
      const touched = new Set(
        [...newest.values()].filter((c) => c.table === 'countries').map((c) => c.key),
      );
      await seedWorld(
        dataSource,
        SEED_COUNTRIES.filter((c) => touched.has(c.isoCode)),
      );
    });

    it('down() restores the old prose and up() brings back the seed prose', async () => {
      if (!dataSource) throw new Error('dataSource not initialized');
      const migrations = [
        new UpdateSeedProseCopy1790208000000(),
        new FixSeedProseFacts1790553600000(),
      ];
      const runner = dataSource.createQueryRunner();
      try {
        for (const migration of [...migrations].reverse()) await migration.down(runner);
        for (const change of oldest.values()) {
          expect(await readColumn(dataSource, change)).toEqual(change.before);
        }
        for (const migration of migrations) await migration.up(runner);
        for (const change of newest.values()) {
          expect(await readColumn(dataSource, change)).toEqual(change.after);
        }
      } finally {
        await runner.release();
      }
      const reseed = await seedRegions(dataSource);
      expect(reseed.unchanged).toBe(7);
    });

    it('leaves a column untouched when it no longer holds the expected text', async () => {
      if (!dataSource) throw new Error('dataSource not initialized');
      const change = seeded.find((c) => c.table === 'regions' && c.kind === 'scalar');
      if (!change) throw new Error('no scalar region change to exercise');
      const edited = 'edited by hand';
      await dataSource.query(
        `UPDATE "${change.table}" SET "${change.column}" = $1 WHERE "${change.keyColumn}" = $2`,
        [edited, change.key],
      );
      const runner = dataSource.createQueryRunner();
      try {
        await new UpdateSeedProseCopy1790208000000().down(runner);
        expect(await readColumn(dataSource, change)).toBe(edited);
        await new UpdateSeedProseCopy1790208000000().up(runner);
        expect(await readColumn(dataSource, change)).toBe(edited);
      } finally {
        await runner.release();
      }
      await seedRegions(dataSource);
    });
  });

  describe('GET /api/regions', () => {
    it('returns all 7 regions with Cache-Control headers', async () => {
      if (!app) throw new Error('app not initialized');
      const server = app.getHttpServer() as Parameters<typeof request>[0];
      const res = await request(server).get('/api/regions');

      expect(res.status).toBe(200);
      expect(res.headers['cache-control']).toBe(
        'public, max-age=300, stale-while-revalidate=86400',
      );
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(7);

      const marmara = res.body.find((r: { slug: string }) => r.slug === 'marmara');
      expect(marmara).toBeDefined();
      expect(marmara.nameTr).toBe('Marmara Bölgesi');
      expect(marmara.provinceCount).toBe(11);
      expect(marmara.population).toBeGreaterThan(20_000_000);
      expect(marmara.areaKm2).toBeGreaterThan(60_000);
      expect(marmara.populationDensity).toBeGreaterThan(300);
    });
  });

  describe('GET /api/regions/:slug', () => {
    it('returns full 15-section detail for valid slug with Cache-Control', async () => {
      if (!app) throw new Error('app not initialized');
      const server = app.getHttpServer() as Parameters<typeof request>[0];
      const res = await request(server).get('/api/regions/marmara');

      expect(res.status).toBe(200);
      expect(res.headers['cache-control']).toBe(
        'public, max-age=300, stale-while-revalidate=86400',
      );
      expect(res.body.slug).toBe('marmara');
      expect(res.body.h1).toBe('Marmara Bölgesi');
      expect(res.body.introTr).toContain('Marmara Denizi');
      expect(res.body.highestPointName).toBe('Uludağ');
      expect(res.body.highestPointElevationM).toBe(2543);
      expect(res.body.highestPointProvince).toBe('Bursa');
      expect(res.body.coastalSeas).toContain('Karadeniz');
      expect(res.body.coastalSeas).toContain('Marmara Denizi');
      expect(res.body.coastalSeas).toContain('Ege Denizi');
      expect(res.body.neighborRegions).toContain('Ege');
      expect(res.body.neighborCountries).toContain('Bulgaristan');
      expect(res.body.neighborCountries).toContain('Yunanistan');
      expect(res.body.subregions).toHaveLength(4);
      expect(res.body.provinces).toHaveLength(11);
      expect(res.body.provinces[0].slugTr).toBe('istanbul');
      expect(res.body.comparisonTable).toHaveLength(7);
      expect(res.body.faqs).toHaveLength(6);
      expect(res.body.footnotes.length).toBeGreaterThan(0);
      expect(res.body.locationAndBordersTr).toBeDefined();
      expect(res.body.landformsTr).toBeDefined();
      expect(res.body.climateAndVegetationTr).toBeDefined();
      expect(res.body.hydrographyTr).toBeDefined();
      expect(res.body.settlementAndPopulationTr).toBeDefined();
      expect(res.body.economyTr).toBeDefined();
      expect(res.body.subregionsTr).toBeDefined();
      expect(res.body.disasterAndEarthquakeTr).toBeDefined();
      expect(res.body.sourcesNoteTr).toBeDefined();
    });

    it('returns 404 for unknown region slug', async () => {
      if (!app) throw new Error('app not initialized');
      const server = app.getHttpServer() as Parameters<typeof request>[0];
      const res = await request(server).get('/api/regions/bilinmeyen-bolge');

      expect(res.status).toBe(404);
      expect(res.body.message).toBe('errors.region.notFound');
    });
  });
});
