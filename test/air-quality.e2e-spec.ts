import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { applyGlobalPrefix } from '../src/common/bootstrap';
import { buildDataSourceOptions } from '../src/database/data-source-options';
import {
  AirQualityCategory,
  AirQualityIndexSystem,
  AirQualityPollutant,
} from '../src/air-quality/air-quality.types';

/**
 * e2e for the A1 slice: ONE public endpoint served from an in-code constant.
 *
 * ## Everything here is STRUCTURAL (CONVENTIONS §2)
 * No test re-asserts a band-table number against an external source — the facts live in
 * `eaqi.constants.ts` with provenance, and the payload↔constant derivation is pinned in
 * `air-quality-index-system.catalogue.spec.ts`. What THIS suite pins is HTTP behaviour: 200
 * on the cold path (empty database, nothing ingested — COLD-BEHAVIOR §10), the cache header,
 * anonymous public access, absent-not-stubbed province paths, and the ZERO-external-fetch
 * invariant.
 *
 * The expected Cache-Control string is pinned VERBATIM (SPEC §11.1): a drive-by change to the
 * caching contract must fail a test, not slip through as a "style" edit.
 */
const EXPECTED_CACHE_CONTROL =
  'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800';

describe('Air quality (e2e) — A1 contract slice', () => {
  let container: StartedPostgreSqlContainer;
  let dataSource: DataSource;
  let app: INestApplication;
  /** Spy over global fetch: NOTHING in this module may call out on a request path. */
  let fetchSpy: jest.SpiedFunction<typeof fetch>;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
    const url = container.getConnectionUri();

    process.env.DATABASE_URL = url;
    process.env.WEB_ORIGIN = 'http://localhost:3000';

    dataSource = new DataSource(buildDataSourceOptions(url));
    await dataSource.initialize();
    await dataSource.runMigrations();

    // AppModule is required only now (ConfigModule validates env eagerly at load time).
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const appModule = require('../src/app.module') as typeof import('../src/app.module');
    const moduleRef = await Test.createTestingModule({ imports: [appModule.AppModule] }).compile();
    app = moduleRef.createNestApplication();
    applyGlobalPrefix(app);
    await app.init();

    fetchSpy = jest.spyOn(globalThis, 'fetch');
  }, 180_000);

  afterAll(async () => {
    fetchSpy?.mockRestore();
    await app?.close();
    await dataSource?.destroy();
    await container?.stop();
  });

  it('GET /api/air-quality/index-system → 200 on the COLD path, anonymous, full structure', async () => {
    // No seed, no ingest, empty database: the catalogue is code, so cold serves 200.
    const response = await request(app.getHttpServer())
      .get('/api/air-quality/index-system')
      .expect(200);

    const body = response.body as {
      indexSystem: string;
      boundaryRule: string;
      categories: { band: number; category: string }[];
      pollutants: { pollutant: string; averagingPeriod: string; upperBoundsUgM3: number[] }[];
      tieBreakOrder: string[];
    };

    expect(body.indexSystem).toBe(AirQualityIndexSystem.EaqiEea2024);
    expect(body.boundaryRule).toBe('lower_exclusive_upper_inclusive');

    // Six bands, in order, each with a category token from the closed set.
    expect(body.categories.map((row) => row.band)).toEqual([1, 2, 3, 4, 5, 6]);
    const categoryTokens = Object.values(AirQualityCategory) as string[];
    for (const row of body.categories) {
      expect(categoryTokens).toContain(row.category);
    }

    // Five pollutants, all hourly, five strictly increasing upper bounds each.
    const pollutantTokens = Object.values(AirQualityPollutant) as string[];
    expect(body.pollutants).toHaveLength(5);
    for (const row of body.pollutants) {
      expect(pollutantTokens).toContain(row.pollutant);
      expect(row.averagingPeriod).toBe('hourly');
      expect(row.upperBoundsUgM3).toHaveLength(5);
      expect([...row.upperBoundsUgM3].sort((a, b) => a - b)).toEqual(row.upperBoundsUgM3);
    }

    // The tie-break order is a permutation of the five pollutant tokens.
    expect([...body.tieBreakOrder].sort()).toEqual([...pollutantTokens].sort());
  });

  it('sets the pinned Cache-Control on success (SPEC §11.1)', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/air-quality/index-system')
      .expect(200);
    expect(response.headers['cache-control']).toBe(EXPECTED_CACHE_CONTROL);
  });

  it('makes ZERO external calls on the request path (COLD-BEHAVIOR §10 machine check)', async () => {
    fetchSpy.mockClear();
    await request(app.getHttpServer()).get('/api/air-quality/index-system').expect(200);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('the A2 province endpoints are ABSENT (404), not stubbed with 501', async () => {
    fetchSpy.mockClear();
    await request(app.getHttpServer()).get('/api/air-quality/provinces').expect(404);
    await request(app.getHttpServer()).get('/api/air-quality/provinces/06').expect(404);
    // …and an unknown sub-path behaves like any other unknown route.
    await request(app.getHttpServer()).get('/api/air-quality/unknown').expect(404);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
