import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerStorage } from '@nestjs/throttler';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { join } from 'node:path';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { applyGlobalPrefix } from '../src/common/bootstrap';
import { buildDataSourceOptions } from '../src/database/data-source-options';
import { loadClimateNormals } from '../src/database/climate/load-climate';
import { seedGeography } from '../src/database/seeds/seed-geography';
import { Province } from '../src/province/entities/province.entity';
import { CLIMATE_MONTH_COUNT, CLIMATE_SOURCE_MGM_GENERAL } from '../src/province/province.types';

/**
 * Real-Postgres e2e for the A2 CLIMATE CONTRACT — the shape the web repo codegens against.
 *
 * It seeds all 81 provinces, LOADS the committed MGM artifact (so `climate_normals` is real,
 * exactly what a deploy runs — `db:import:climate --phase=load`), boots the app, and asserts the
 * SERVED payload's invariants:
 *   - the list DTO carries `climateKoppen` (the "benzer iklimli iller" contract);
 *   - every province WITH a series serves a non-null `climate` whose seasonal percentages sum to
 *     EXACTLY 100 and whose derived block is well-formed;
 *   - a province WITHOUT a series serves `climate: null` and does NOT crash (graceful
 *     degradation — PLAN.md risk 9, which ruling 5 makes impossible to reach with real data, so
 *     it is manufactured here by nulling one row).
 *
 * Per CONVENTIONS §2 everything here is STRUCTURAL — it asserts shape and the sum-to-100 rule
 * across all provinces, never that any province has a particular temperature.
 */

interface ServedSeasonal {
  winterPct: number;
  springPct: number;
  summerPct: number;
  autumnPct: number;
}
interface ServedClimate {
  source: string;
  sourceUrl: string;
  periodStartYear: number;
  periodEndYear: number;
  months: unknown[];
  records: unknown;
  derived: {
    annualMeanTempC: number;
    annualPrecipitationMm: number;
    hottestMonth: number;
    coldestMonth: number;
    wettestMonth: number;
    driestMonth: number;
    annualTempRangeC: number;
    seasonalPrecipitation: ServedSeasonal;
  };
}
interface ServedDetail {
  climate: ServedClimate | null;
  climateNarrativeTr: string | null;
}

describe('Climate contract (e2e)', () => {
  let container: StartedPostgreSqlContainer;
  let dataSource: DataSource;
  let app: INestApplication;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
    const url = container.getConnectionUri();
    process.env.DATABASE_URL = url;
    process.env.WEB_ORIGIN = 'http://localhost:3000';

    dataSource = new DataSource(buildDataSourceOptions(url));
    await dataSource.initialize();
    await dataSource.runMigrations();
    await seedGeography(dataSource);

    // Load the COMMITTED climate artifact — the same offline path a deploy runs. Without this
    // every `climate_normals` is null and the sum-to-100 invariant below would be vacuous.
    await loadClimateNormals(dataSource, { inputDir: join(__dirname, '..', 'data', 'climate') });

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { AppModule } = require('../src/app.module') as typeof import('../src/app.module');
    // TEST-ONLY throttle neutralisation (identical rationale to province.e2e): the suite fires
    // many HTTP calls from one client in a short window; stub ThrottlerStorage to report zero
    // hits so a per-province loop never trips the 120/min limiter. Production posture untouched.
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ThrottlerStorage)
      .useValue({
        increment: (): Promise<{
          totalHits: number;
          timeToExpire: number;
          isBlocked: boolean;
          timeToBlockExpire: number;
        }> =>
          Promise.resolve({
            totalHits: 0,
            timeToExpire: 0,
            isBlocked: false,
            timeToBlockExpire: 0,
          }),
      })
      .compile();
    app = moduleRef.createNestApplication();
    applyGlobalPrefix(app);
    await app.init();
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    await dataSource?.destroy();
    await container?.stop();
  });

  it('list DTO carries climateKoppen for every province, matching the stored value', async () => {
    const res = await request(app.getHttpServer()).get('/api/provinces').expect(200);
    const body = res.body as Array<Record<string, unknown>>;
    expect(body).toHaveLength(81);

    const storedByPlate = new Map(
      (await dataSource.getRepository(Province).find()).map((p) => [p.plateCode, p]),
    );
    for (const item of body) {
      // The field is PRESENT on every list item (a pure, non-breaking addition) …
      expect(item).toHaveProperty('climateKoppen');
      const stored = storedByPlate.get(item.plateCode as string);
      expect(stored).toBeDefined();
      // … and it projects faithfully from the row (string or null), cross-checked against the DB
      // rather than a hardcoded table, so this scales to any content revision with zero edits.
      expect(item.climateKoppen).toBe(stored?.climateKoppen ?? null);
    }
  });

  it('every province WITH a series serves a well-formed climate whose seasons sum to exactly 100', async () => {
    const provinces = await dataSource
      .getRepository(Province)
      .find({ order: { plateCode: 'ASC' } });
    let withClimate = 0;

    for (const province of provinces) {
      const res = await request(app.getHttpServer())
        .get(`/api/provinces/${province.slugTr}`)
        .expect(200);
      const body = res.body as ServedDetail;

      // climateNarrativeTr is exposed on the contract (null until the content waves fill it).
      expect(body).toHaveProperty('climateNarrativeTr');
      expect(body.climateNarrativeTr).toBe(province.climateNarrativeTr);

      if (province.climateNormals === null) {
        // A province with no stored series serves climate: null (graceful degradation).
        expect(body.climate).toBeNull();
        continue;
      }

      withClimate += 1;
      const climate = body.climate;
      expect(climate).not.toBeNull();
      if (climate === null) continue; // narrowing; the assertion above is the real guard

      // Series shape mirrors the stored ClimateNormals (raw numbers, full 12 months).
      expect(climate.source).toBe(CLIMATE_SOURCE_MGM_GENERAL);
      expect(climate.sourceUrl.startsWith('https://www.mgm.gov.tr/')).toBe(true);
      expect(climate.periodStartYear).toBeLessThan(climate.periodEndYear);
      expect(climate.months).toHaveLength(CLIMATE_MONTH_COUNT);

      // THE invariant this PR exposes: seasonal percentages are whole integers summing to 100.
      const s = climate.derived.seasonalPrecipitation;
      for (const pct of [s.winterPct, s.springPct, s.summerPct, s.autumnPct]) {
        expect(Number.isInteger(pct)).toBe(true);
      }
      expect(s.winterPct + s.springPct + s.summerPct + s.autumnPct).toBe(100);

      // Derived extremes are month indices in range; annual figures are finite raw numbers.
      const d = climate.derived;
      for (const month of [d.hottestMonth, d.coldestMonth, d.wettestMonth, d.driestMonth]) {
        expect(Number.isInteger(month)).toBe(true);
        expect(month).toBeGreaterThanOrEqual(1);
        expect(month).toBeLessThanOrEqual(CLIMATE_MONTH_COUNT);
      }
      expect(Number.isFinite(d.annualMeanTempC)).toBe(true);
      expect(Number.isFinite(d.annualPrecipitationMm)).toBe(true);
      expect(Number.isFinite(d.annualTempRangeC)).toBe(true);
    }

    // Guard against a vacuous pass: ruling 5 fills all 81, so the sum-to-100 loop MUST have run
    // on real series. Zero here would mean the artifact never loaded, not that the rule holds.
    expect(withClimate).toBeGreaterThan(0);
  });

  it('a province whose series is null degrades gracefully (climate: null, still 200)', async () => {
    // Ruling 5 fills all 81, so the null path cannot occur with real data (PLAN.md risk 9). It is
    // manufactured by clearing one row's series, exactly the kill-switch the schema documents
    // (`UPDATE provinces SET climate_normals = NULL`), then restored so later suites are unaffected.
    const repo = dataSource.getRepository(Province);
    const target = await repo.findOneByOrFail({ plateCode: '01' });
    const original = target.climateNormals;
    expect(original).not.toBeNull(); // the manufactured-null test is only meaningful from a real series

    await repo.update({ plateCode: '01' }, { climateNormals: null });
    try {
      const res = await request(app.getHttpServer())
        .get(`/api/provinces/${target.slugTr}`)
        .expect(200);
      const body = res.body as ServedDetail;
      expect(body.climate).toBeNull();
    } finally {
      await repo.update({ plateCode: '01' }, { climateNormals: original });
    }
  });
});
