import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NextFunction, Request, Response } from 'express';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { join } from 'node:path';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { applyGlobalPrefix } from '../src/common/bootstrap';
import { buildDataSourceOptions } from '../src/database/data-source-options';
import { loadEra5ClimateNormals } from '../src/database/era5/era5-load';
import {
  ERA5_DATASET_URL,
  ERA5_FIRST_YEAR,
  ERA5_LAST_YEAR,
} from '../src/database/era5/era5-request';
import { seedGeography } from '../src/database/seeds/seed-geography';
import { Province } from '../src/province/entities/province.entity';
import {
  CLIMATE_MONTH_COUNT,
  CLIMATE_SOURCE_ERA5_LAND_MONTHLY,
} from '../src/province/province.types';
import { INTERNAL_REQUEST_HEADER } from '../src/common/throttler/trusted-client';

// 44-char dummy secret used ONLY to exercise the REAL trusted-client throttle exemption
// (replaces the former test-only ThrottlerStorage stub). Not a production secret.
const TEST_INTERNAL_TOKEN = 'e2e-trusted-client-token-0123456789-abcdefgh';

/**
 * Real-Postgres e2e for the CLIMATE CONTRACT — the shape the web repo codegens against.
 *
 * It seeds all 81 provinces, LOADS the committed ERA5-Land artifacts (so `climate_normals` is
 * real, exactly what a deploy runs — `db:import:era5 --phase=load`), boots the app, and asserts
 * the SERVED payload's invariants:
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
  months: Record<string, unknown>[];
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
    // Configure the trusted-client secret so the exemption exists for this run; the
    // header-injecting middleware below presents the matching token on every request.
    process.env.INTERNAL_REQUEST_TOKEN = TEST_INTERNAL_TOKEN;

    dataSource = new DataSource(buildDataSourceOptions(url));
    await dataSource.initialize();
    await dataSource.runMigrations();
    await seedGeography(dataSource);

    // Load the COMMITTED ERA5-Land artifacts — the same offline path a deploy runs. Without this
    // every `climate_normals` is null and the sum-to-100 invariant below would be vacuous.
    await loadEra5ClimateNormals(dataSource, {
      inputDir: join(__dirname, '..', 'data', 'era5-land'),
    });

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { AppModule } = require('../src/app.module') as typeof import('../src/app.module');
    // Exercise the REAL trusted-client throttle exemption (identical rationale to province.e2e):
    // the suite fires a per-province loop of HTTP calls from one client; every request presents
    // the internal token exactly as the web SSG build will, so the PRODUCTION guard path is what
    // CI covers rather than a fake ThrottlerStorage. Even this suite's per-province volume stays
    // under the 120/min window, so the exemption is NOT what keeps it 429-free today (it would
    // pass on volume alone) — the value is fidelity to the real allow path. Production posture
    // untouched (global 120/min stands for anonymous clients).
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

  it('list DTO carries climateAnnualMeanTempC equal to the detail DTO derived value, for every province', async () => {
    // The W2.1 contract addition: the list item exposes the SAME annual-mean the detail DTO
    // derives, so the "benzer iklim / en yakın 5" selection (→ DEC 2026-07-20b) and the anchor
    // "il adı + °C" can be built from the list alone. Rule-level invariant across all 81 rows,
    // cross-checked against the DETAIL payload (the derivation's own output) — NOT a per-province
    // literal (CONVENTIONS §2). Because both DTOs read the same `buildClimate(...)?.derived
    // .annualMeanTempC`, equality here is the single-source-of-truth guarantee, and it would FAIL
    // the moment a persisted-derived column drifted from the live series.
    const listRes = await request(app.getHttpServer()).get('/api/provinces').expect(200);
    const listBody = listRes.body as Array<Record<string, unknown>>;
    expect(listBody).toHaveLength(81);

    const listByPlate = new Map(listBody.map((item) => [item.plateCode as string, item]));
    const provinces = await dataSource
      .getRepository(Province)
      .find({ order: { plateCode: 'ASC' } });

    for (const province of provinces) {
      const listItem = listByPlate.get(province.plateCode);
      expect(listItem).toBeDefined();
      if (!listItem) continue; // narrowing; the toBeDefined above is the real guard

      // Present on every list item, and typed number-or-null (never a string, NaN or missing).
      expect(listItem).toHaveProperty('climateAnnualMeanTempC');
      const listValue = listItem.climateAnnualMeanTempC;
      expect(listValue === null || typeof listValue === 'number').toBe(true);

      const detailRes = await request(app.getHttpServer())
        .get(`/api/provinces/${province.slugTr}`)
        .expect(200);
      const detail = detailRes.body as ServedDetail;
      const detailValue = detail.climate === null ? null : detail.climate.derived.annualMeanTempC;

      // The whole point: list value IS the detail's derived value, byte-for-byte.
      expect(listValue).toBe(detailValue);
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
      expect(climate.source).toBe(CLIMATE_SOURCE_ERA5_LAND_MONTHLY);
      expect(climate.sourceUrl).toBe(ERA5_DATASET_URL);
      expect(climate.periodStartYear).toBe(ERA5_FIRST_YEAR);
      expect(climate.periodEndYear).toBe(ERA5_LAST_YEAR);
      expect(climate.months).toHaveLength(CLIMATE_MONTH_COUNT);

      // THE contract-narrowing assertion, and it is a REMOVAL check: the eight monthly MGM-era
      // fields and the whole `records` block are gone from the payload the web codegens against.
      // Asserted as ABSENCE rather than by a happy-path shape check, because a leftover null field
      // would keep every other test green while shipping a contract the OpenAPI spec no longer
      // declares (→ the B2/B3 breaking items handed to the web repo).
      expect(climate).not.toHaveProperty('records');
      for (const [index, month] of climate.months.entries()) {
        expect(Object.keys(month).sort()).toEqual(['month', 'precipitationMm', 'tempMeanC']);
        expect(month.month).toBe(index + 1);
        expect(typeof month.tempMeanC).toBe('number');
        expect(typeof month.precipitationMm).toBe('number');
      }

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

    // The load phase fills ALL 81 or writes nothing, so the sum-to-100 loop must have run on every
    // province, not just one. `toBe(provinces.length)` is the real invariant: `> 0` would let
    // coverage silently collapse 81→1 with the suite still green — exactly CONVENTIONS §2's "a
    // check switched off by a condition, and the condition becomes the new unverified surface."
    // Still count-level and structural, no per-province literal.
    expect(withClimate).toBe(provinces.length);
  });

  it('a province whose series is null degrades gracefully (climate: null, still 200)', async () => {
    // The load phase fills all 81, so the null path cannot occur with real data (PLAN.md risk 9). It is
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

      // The list field degrades in lockstep: because it is derived LIVE from `climate_normals`
      // (not persisted), clearing the series makes the list serve null too — the same one
      // statement is the kill-switch for BOTH DTOs. A persisted-derived column would still show
      // the stale °C here, which is exactly why this PR does not persist the value.
      const listRes = await request(app.getHttpServer()).get('/api/provinces').expect(200);
      const listBody = listRes.body as Array<Record<string, unknown>>;
      const item = listBody.find((p) => p.plateCode === '01');
      expect(item).toBeDefined();
      expect(item?.climateAnnualMeanTempC).toBeNull();
    } finally {
      await repo.update({ plateCode: '01' }, { climateNormals: original });
    }
  });
});
