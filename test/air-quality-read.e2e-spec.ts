import { afterAll, afterEach, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AirQualityPollutant, AirQualityStatus } from '../src/air-quality/air-quality.types';
import {
  AirQualityIngestStore,
  type AirQualityIngestStorePort,
  type RecordProvinceInput,
} from '../src/air-quality/cams/air-quality-ingest.store';
import type {
  AdsJobRecord,
  AirQualityStoredConcentrations,
  AirQualityStoredSupport,
} from '../src/air-quality/entities/air-quality-run.entity';
import { applyGlobalPrefix } from '../src/common/bootstrap';
import { buildDataSourceOptions } from '../src/database/data-source-options';
import { seedGeography } from '../src/database/seeds/seed-geography';
import { Province } from '../src/province/entities/province.entity';

/**
 * A2b WARM-path e2e — the two public read endpoints against a REAL Postgres, with a run written
 * through the shipped ingest store.
 *
 * ## Why each phase boots its own Nest app
 * The upstream cache is in-process in tests (no Redis), and an `ok` entry stays fresh for the
 * whole value TTL. A phase that changes the STORE must therefore read through a cold cache, or it
 * would be asserting against the previous phase's compile. One container, one migration run, one
 * seed; a fresh application per phase.
 *
 * ## Structural only (CONVENTIONS §2)
 * Every concentration below is synthetic. Nothing here asserts an air-quality fact — the
 * assertions are about status vocabulary, array lengths, step contiguity, the product boundary,
 * cache headers and the zero-external-call invariant.
 */

const PROVINCE_COUNT = 81;
/** A SPAN: the forecast half holds `FORECAST_HOURS + 1` steps. */
const FORECAST_HOURS = 96;
/** A STEP COUNT: the analysis half holds exactly this many steps. */
const ANALYSIS_HOURS = 24;
const MS_PER_HOUR = 3_600_000;

/**
 * The status TOKENS as they arrive over the wire — JSON, so plain strings. Widened from the enum
 * here rather than casting the parsed body: the enum is the server's vocabulary and the response
 * is untyped data, and comparing the two directly is the mismatch the lint rule catches.
 */
const STATUS_OK: string = AirQualityStatus.Ok;
const STATUS_UNAVAILABLE: string = AirQualityStatus.Unavailable;

/** SPEC §11.1, pinned verbatim — a caching-contract change must fail a test, not slip through. */
const VALUE_CACHE_CONTROL = 'public, max-age=600, s-maxage=1800, stale-while-revalidate=3600';

/** Today's model run base time: recent enough to clear the 48 h run-age ceiling. */
const RUN_UTC = (() => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
})();
/** A newer run that must NOT win: `abandoned` means the forecast failed terminally. */
const NEWER_RUN_UTC = new Date(RUN_UTC.getTime() + 24 * MS_PER_HOUR);

interface ListItem {
  plateCode: string;
  slugTr: string;
  slugEn: string;
  band: number | null;
  category: string | null;
  dominantPollutant: string | null;
  status: string;
  validAtUtc: string | null;
}

interface ProvinceDetail {
  plateCode: string;
  nameTr: string;
  latitude: number;
  longitude: number;
  current: {
    status: string;
    band: number | null;
    freshness: string | null;
    modelRunAtUtc: string | null;
    validAtUtc: string | null;
    gridResolutionDegrees: number;
    pollutants: { pollutant: string; value: number | null; status: string }[];
    missingPollutants: string[];
  };
  series: {
    timesUtc: string[];
    stepHours: number;
    horizonEndUtc: string;
    analysisEndUtc: string | null;
    bands: (number | null)[];
    categories: (string | null)[];
    dominantPollutants: (string | null)[];
    concentrations: Record<string, (number | null)[]>;
  } | null;
  attribution: { attributionText: string; disclaimerText: string; noticeKeys: string[] };
  dataAvailable: boolean;
}

function job(kind: 'forecast' | 'analysis'): AdsJobRecord {
  return {
    kind,
    requestDate: RUN_UTC.toISOString().slice(0, 10),
    requestBody: { type: [kind], date: ['2026-08-02/2026-08-02'], level: ['0'] },
    state: 'stored',
    jobId: `job-${kind}`,
    attempts: 1,
    submittedAt: RUN_UTC.toISOString(),
    adsCreated: null,
    adsStarted: null,
    adsFinished: null,
    cleanupAt: null,
    result: null,
    lastError: null,
  };
}

function concentrations(steps: number, base: number): AirQualityStoredConcentrations {
  const values = {} as AirQualityStoredConcentrations;
  for (const pollutant of Object.values(AirQualityPollutant)) {
    values[pollutant] = Array.from({ length: steps }, (_unused, index) => base + (index % 7));
  }
  return values;
}

function support(): AirQualityStoredSupport {
  const verdicts = {} as AirQualityStoredSupport;
  for (const pollutant of Object.values(AirQualityPollutant)) verdicts[pollutant] = 'ok';
  return verdicts;
}

describe('Air quality read path (e2e, real Postgres)', () => {
  let container: StartedPostgreSqlContainer;
  let dataSource: DataSource;
  let store: AirQualityIngestStorePort;
  let provinces: Province[];
  let app: INestApplication | null = null;
  let fetchSpy: jest.SpiedFunction<typeof fetch> | null = null;

  const rowsFor = (steps: number, base: number): RecordProvinceInput[] =>
    provinces.map((province, index) => ({
      provinceId: province.id,
      gridLatitude: 39.95 + index * 0.001,
      gridLongitude: 32.85 + index * 0.001,
      distanceKm: 4.5,
      concentrations: concentrations(steps, base),
      support: support(),
    }));

  /** A fresh application on a cold cache — see the suite docblock. */
  async function bootApp(): Promise<INestApplication> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const appModule = require('../src/app.module') as typeof import('../src/app.module');
    const moduleRef = await Test.createTestingModule({ imports: [appModule.AppModule] }).compile();
    const created = moduleRef.createNestApplication();
    applyGlobalPrefix(created);
    created.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await created.init();
    fetchSpy = jest.spyOn(globalThis, 'fetch');
    fetchSpy.mockClear();
    return created;
  }

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
    const url = container.getConnectionUri();
    process.env.DATABASE_URL = url;
    process.env.WEB_ORIGIN = 'http://localhost:3000';

    dataSource = new DataSource(buildDataSourceOptions(url));
    await dataSource.initialize();
    await dataSource.runMigrations();
    await seedGeography(dataSource);
    provinces = await dataSource.getRepository(Province).find({ order: { plateCode: 'ASC' } });
    store = new AirQualityIngestStore(dataSource);
    // NO run is created here on purpose — phase 0 below needs the seeded-but-unserved state, and
    // it is the only phase that can ever see it. Phase 1 creates the run in its own `beforeAll`.
  }, 300_000);

  afterEach(async () => {
    fetchSpy?.mockRestore();
    fetchSpy = null;
    await app?.close();
    app = null;
  });

  afterAll(async () => {
    if (dataSource.isInitialized) await dataSource.destroy();
    await container.stop();
  });

  it('seeds the 81 provinces this leg is built for', () => {
    expect(provinces).toHaveLength(PROVINCE_COUNT);
  });

  /**
   * The state acceptance criterion 2 names and no test had ever reached over HTTP: every province
   * seeded, NO serviceable run (review #84 CR-8 + Atlas ruling on the author's open question #4,
   * DEC 2026-08-03a §3).
   *
   * The cold hub was previously proved only against a database with no provinces at all
   * (`air-quality.e2e-spec.ts`), where `[]` satisfies "an array" and the 81-row contract is
   * vacuous. The regression this closes is concrete: a change that suppressed uncovered provinces
   * from the hub — making the row count depend on ingest health, which the service docblock
   * explicitly forbids — passed BOTH e2e suites.
   *
   * Runs before phase 1 by construction: phase 1 creates the run in its own `beforeAll`, and the
   * later phases build forward on that state.
   */
  describe('phase 0 — provinces seeded, NO serviceable run', () => {
    it('serves all 81 provinces as unavailable, no-store, and claims no data age', async () => {
      app = await bootApp();
      const response = await request(app.getHttpServer())
        .get('/api/air-quality/provinces')
        .expect(200);

      const items = response.body as ListItem[];
      // The row count is a navigation contract, not a function of ingest health.
      expect(items).toHaveLength(PROVINCE_COUNT);
      expect(items.every((item) => item.status === STATUS_UNAVAILABLE)).toBe(true);
      expect(items.every((item) => item.band === null)).toBe(true);
      expect(items.every((item) => item.validAtUtc === null)).toBe(true);
      expect([...items].map((item) => item.plateCode).sort()).toEqual(
        items.map((item) => item.plateCode),
      );
      // Nothing here is data, so a CDN or ISR must never commit it (Atlas ruling Q7).
      expect(response.headers['cache-control']).toBe('no-store');
      // …and a body carrying no data may not state a data age (review #84 I1). Asserted over HTTP
      // for the first time here: the unit spec pins the service half, and the warm branch is the
      // only place the header was ever asserted end-to-end.
      expect(response.headers['x-air-quality-cache-age']).toBeUndefined();
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('serves a province detail page that renders honestly with no run', async () => {
      const target = provinces[0];
      if (target === undefined) throw new Error('no province seeded');
      app = await bootApp();
      const response = await request(app.getHttpServer())
        .get(`/api/air-quality/provinces/${target.plateCode}`)
        .expect(200);

      const body = response.body as ProvinceDetail;
      expect(body.dataAvailable).toBe(false);
      expect(body.current.status).toBe(STATUS_UNAVAILABLE);
      expect(body.series).toBeNull();
      // Identity is complete even with nothing to show — the page renders, the widget degrades.
      expect(body.nameTr.length).toBeGreaterThan(0);
      // The licence notice attaches to the published SECTION, not to whether a value resolved,
      // so the cold branch carries the same template as the warm one (M5 / DEC 2026-08-02g §3).
      expect(body.attribution.attributionText).toContain(
        'Contains modified Copernicus Atmosphere Monitoring Service information',
      );
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.headers['x-air-quality-cache-age']).toBeUndefined();
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe('phase 1 — a forecast-only run (state: serviceable)', () => {
    beforeAll(async () => {
      await store.createRun({
        runUtc: RUN_UTC,
        datasetId: 'cams-europe-air-quality-forecasts',
        forecastHours: FORECAST_HOURS,
        adsRequests: [job('forecast'), job('analysis')],
        now: new Date(),
      });
      await store.recordProduct({
        runUtc: RUN_UTC,
        kind: 'forecast',
        hours: FORECAST_HOURS,
        provinces: rowsFor(FORECAST_HOURS + 1, 10),
        bytesDownloaded: 1_000,
        fileFormat: 'zip(stored)+netcdf3-classic',
        decoderVersion: 'netcdf3-ts@4',
        adsRequests: [job('forecast'), job('analysis')],
        state: 'serviceable',
        now: new Date(),
      });
      // 60 s, not the outer hook's 300 s (review #85 M7): the outer budget covers pulling and
      // starting a Postgres CONTAINER, while this hook is two writes against a container that is
      // already up. 81 jsonb rows land in well under a second locally, so 60 s is already two
      // orders of magnitude of headroom; inheriting 300 s would mean a genuinely hung write
      // stalls the whole job five times longer before it says so.
    }, 60_000);

    it('serves all 81 hub items with the pinned warm Cache-Control and a cache-age header', async () => {
      app = await bootApp();
      const response = await request(app.getHttpServer())
        .get('/api/air-quality/provinces')
        .expect(200);

      const items = response.body as ListItem[];
      expect(items).toHaveLength(PROVINCE_COUNT);
      expect(items.every((item) => item.status === STATUS_OK)).toBe(true);
      expect(items.every((item) => item.band !== null)).toBe(true);
      // Plate order is the hub's contract with the map.
      expect([...items].map((item) => item.plateCode).sort()).toEqual(
        items.map((item) => item.plateCode),
      );
      expect(response.headers['cache-control']).toBe(VALUE_CACHE_CONTROL);
      expect(response.headers['x-air-quality-cache-age']).toBeDefined();
      // ZERO external calls on a request path — the COLD-BEHAVIOR §10 machine check.
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('serves the detail payload with a series that starts AT the run and has no analysis half', async () => {
      app = await bootApp();
      const response = await request(app.getHttpServer())
        .get('/api/air-quality/provinces/06')
        .expect(200);

      const body = response.body as ProvinceDetail;
      expect(body.dataAvailable).toBe(true);
      expect(body.current.status).toBe(STATUS_OK);
      expect(body.current.modelRunAtUtc).toBe(RUN_UTC.toISOString());
      expect(body.series).not.toBeNull();
      const series = body.series;
      if (series === null) throw new Error('expected a series');

      // No analysis product ⇒ the boundary is honestly absent and the series starts at the run.
      expect(series.analysisEndUtc).toBeNull();
      expect(series.timesUtc[0]).toBe(RUN_UTC.toISOString());
      // The M9 invariant, end to end: `forecast_hours` is a SPAN, so the arrays hold span + 1.
      expect(series.timesUtc).toHaveLength(FORECAST_HOURS + 1);
      expect(series.stepHours).toBe(1);
      expect(series.horizonEndUtc).toBe(series.timesUtc[series.timesUtc.length - 1]);

      // THE series invariant: every array is exactly timesUtc.length long.
      const expected = series.timesUtc.length;
      expect(series.bands).toHaveLength(expected);
      expect(series.categories).toHaveLength(expected);
      expect(series.dominantPollutants).toHaveLength(expected);
      for (const values of Object.values(series.concentrations)) {
        expect(values).toHaveLength(expected);
      }
      // …and consecutive steps are exactly one hour apart.
      for (let index = 1; index < series.timesUtc.length; index += 1) {
        const previous = Date.parse(String(series.timesUtc[index - 1]));
        const current = Date.parse(String(series.timesUtc[index]));
        expect(current - previous).toBe(MS_PER_HOUR);
      }

      expect(response.headers['cache-control']).toBe(VALUE_CACHE_CONTROL);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('publishes the licence notice on the warm path with the lowercase template', async () => {
      app = await bootApp();
      const response = await request(app.getHttpServer())
        .get('/api/air-quality/provinces/34')
        .expect(200);
      const body = response.body as ProvinceDetail;
      expect(body.attribution.attributionText).toContain(
        'Contains modified Copernicus Atmosphere Monitoring Service information',
      );
      expect(body.attribution.attributionText).toContain(String(RUN_UTC.getUTCFullYear()));
      expect(body.attribution.disclaimerText).toContain('Neither the European Commission');
      expect(body.attribution.noticeKeys.length).toBeGreaterThan(0);
    });
  });

  describe('phase 2 — the analysis product lands (state: complete)', () => {
    it('extends the series backwards by exactly analysisHours and publishes the boundary', async () => {
      await store.recordProduct({
        runUtc: RUN_UTC,
        kind: 'analysis',
        hours: ANALYSIS_HOURS,
        provinces: rowsFor(ANALYSIS_HOURS, 20),
        bytesDownloaded: 2_000,
        fileFormat: 'zip(stored)+netcdf3-classic',
        decoderVersion: 'netcdf3-ts@4',
        adsRequests: [job('forecast'), job('analysis')],
        state: 'complete',
        now: new Date(),
      });

      app = await bootApp();
      const response = await request(app.getHttpServer())
        .get('/api/air-quality/provinces/06')
        .expect(200);
      const series = (response.body as ProvinceDetail).series;
      if (series === null) throw new Error('expected a series');

      expect(series.analysisEndUtc).toBe(RUN_UTC.toISOString());
      expect(series.timesUtc[0]).toBe(
        new Date(RUN_UTC.getTime() - ANALYSIS_HOURS * MS_PER_HOUR).toISOString(),
      );
      expect(series.timesUtc).toHaveLength(ANALYSIS_HOURS + FORECAST_HOURS + 1);
      expect(series.timesUtc[ANALYSIS_HOURS]).toBe(series.analysisEndUtc);
      for (const values of Object.values(series.concentrations)) {
        expect(values).toHaveLength(series.timesUtc.length);
      }
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe('phase 3 — a newer ABANDONED run must never win', () => {
    it('keeps serving the older servable run', async () => {
      // `abandoned` means the FORECAST failed terminally: the run has no rows of its own, and the
      // previous run keeps serving. A newest-run-wins read that ignored state would go dark here.
      await store.createRun({
        runUtc: NEWER_RUN_UTC,
        datasetId: 'cams-europe-air-quality-forecasts',
        forecastHours: FORECAST_HOURS,
        adsRequests: [job('forecast')],
        now: new Date(),
      });
      await store.updateRun({
        runUtc: NEWER_RUN_UTC,
        adsRequests: [job('forecast')],
        state: 'abandoned',
      });

      app = await bootApp();
      const response = await request(app.getHttpServer())
        .get('/api/air-quality/provinces/06')
        .expect(200);
      const body = response.body as ProvinceDetail;
      expect(body.dataAvailable).toBe(true);
      expect(body.current.modelRunAtUtc).toBe(RUN_UTC.toISOString());
    });
  });

  describe('phase 4 — one corrupt row must not darken the other eighty', () => {
    it('skips the unreadable province and keeps serving the rest', async () => {
      const target = provinces[0];
      if (target === undefined) throw new Error('no province to corrupt');
      // jsonb is schemaless: this is the shape the entity type CLAIMS is impossible.
      await dataSource.query(
        'UPDATE air_quality_province_series SET concentrations = $1 WHERE province_id = $2',
        [JSON.stringify({ pm2_5: 'not-an-array' }), target.id],
      );

      app = await bootApp();
      const hub = await request(app.getHttpServer()).get('/api/air-quality/provinces').expect(200);
      const items = hub.body as ListItem[];
      expect(items).toHaveLength(PROVINCE_COUNT);
      const corrupted = items.find((item) => item.plateCode === target.plateCode);
      expect(corrupted?.status).toBe(STATUS_UNAVAILABLE);
      expect(items.filter((item) => item.status === STATUS_OK)).toHaveLength(PROVINCE_COUNT - 1);
      // One bad province must not stop the hub being cacheable (Atlas ruling Q7).
      expect(hub.headers['cache-control']).toBe(VALUE_CACHE_CONTROL);

      // …and its own detail page still renders, honestly, with no value.
      const detail = await request(app.getHttpServer())
        .get(`/api/air-quality/provinces/${target.plateCode}`)
        .expect(200);
      const body = detail.body as ProvinceDetail;
      expect(body.dataAvailable).toBe(false);
      expect(body.current.status).toBe(STATUS_UNAVAILABLE);
      expect(body.series).toBeNull();
      expect(detail.headers['cache-control']).toBe('no-store');
      // Identity is still complete — the page renders, only the widget degrades.
      expect(body.nameTr.length).toBeGreaterThan(0);
      // The SAME licence template as the warm path, not merely a non-empty string (review #84
      // cf-5): a regression publishing a placeholder attribution on the degraded branch used to
      // pass a `length > 0` check, which reads as coverage while asserting almost nothing. The
      // notice attaches to the published SECTION, so it must be byte-identical in both states.
      expect(body.attribution.attributionText).toContain(
        'Contains modified Copernicus Atmosphere Monitoring Service information',
      );
      expect(body.attribution.disclaimerText).toContain('Neither the European Commission');
      expect(body.attribution.noticeKeys.length).toBeGreaterThan(0);
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });
});
