import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NextFunction, Request, Response } from 'express';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { applyGlobalPrefix } from '../src/common/bootstrap';
import { INTERNAL_REQUEST_HEADER } from '../src/common/throttler/trusted-client';
import { buildDataSourceOptions } from '../src/database/data-source-options';
import { loadMarinePoints } from '../src/database/marine/load-marine-points';
import { seedGeography } from '../src/database/seeds/seed-geography';
import type { EcmwfIngestStorePort } from '../src/marine/ecmwf/ecmwf-ingest.store';
import { ECMWF_INGEST_STORE } from '../src/marine/ecmwf/ecmwf-ingest.store';
import { EcmwfSeriesReader } from '../src/marine/ecmwf/ecmwf-series.reader';
import { MarineEcmwfCycle } from '../src/marine/entities/marine-ecmwf-cycle.entity';
import { MarineEcmwfPointSeries } from '../src/marine/entities/marine-ecmwf-point-series.entity';
import { MarinePoint } from '../src/marine/entities/marine-point.entity';
import { MarineSource } from '../src/marine/marine.types';

/**
 * Marine M3b e2e: the ECMWF persistent store on a REAL Postgres, the read path over it, the
 * layers fill — and the one invariant that outranks all of them: **the request path makes ZERO
 * upstream calls** (the locked COLD-BEHAVIOR table). `globalThis.fetch` is replaced before the
 * app boots with a guard that records and REFUSES every call, so if any request handler, module
 * factory or read path ever reaches for the network, this suite does not merely count it — it
 * fails the call and the test together.
 *
 * Everything is structural (CONVENTIONS §2): shapes, invariants, cascade behaviour, ceiling
 * verdicts. No weather number is asserted; the store rows are synthetic samples.
 */

const COMMITTED_ARTIFACT_DIR = join(__dirname, '..', 'data', 'marine');
const TEST_INTERNAL_TOKEN = 'e2e-trusted-client-token-0123456789-abcdefgh';

/** Every call the fetch guard swallowed — must stay empty for the lifetime of the suite. */
const upstreamCalls: string[] = [];
const realFetch = globalThis.fetch;

describe('Marine ECMWF store + read path (e2e)', () => {
  let container: StartedPostgreSqlContainer;
  let dataSource: DataSource;
  let app: INestApplication;
  let store: EcmwfIngestStorePort;
  let reader: EcmwfSeriesReader;
  let points: MarinePoint[];

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
    const url = container.getConnectionUri();

    process.env.DATABASE_URL = url;
    process.env.WEB_ORIGIN = 'http://localhost:3000';
    process.env.INTERNAL_REQUEST_TOKEN = TEST_INTERNAL_TOKEN;
    // The marine feature ON, the warmup tour OFF: no timer may fire mid-suite, so the only
    // thing that could produce an upstream call is the request path — which is the assertion.
    process.env.MARINE_ENABLED = 'true';
    process.env.MARINE_WARMUP_ENABLED = 'false';
    process.env.ECMWF_ENABLED = 'true';

    // Installed BEFORE the app exists, so every client constructed anywhere in the module tree
    // captures the guard rather than the real fetch.
    const guard = (input: unknown): Promise<never> => {
      upstreamCalls.push(JSON.stringify(input));
      return Promise.reject(
        new Error('the request path attempted an upstream call — COLD-BEHAVIOR violation'),
      );
    };
    globalThis.fetch = guard;

    dataSource = new DataSource(buildDataSourceOptions(url));
    await dataSource.initialize();
    await dataSource.runMigrations();
    await seedGeography(dataSource);
    await loadMarinePoints(dataSource, { inputDir: COMMITTED_ARTIFACT_DIR });

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

    store = app.get<EcmwfIngestStorePort>(ECMWF_INGEST_STORE);
    reader = app.get(EcmwfSeriesReader);
    points = await dataSource.getRepository(MarinePoint).find({ order: { displayOrder: 'ASC' } });
  }, 240_000);

  afterAll(async () => {
    globalThis.fetch = realFetch;
    await app?.close();
    await dataSource?.destroy();
    await container?.stop();
  });

  function samplePoint(
    point: MarinePoint,
    sample: { u10: number | null; v10: number | null; swh: number | null; mwd: number | null },
  ) {
    return {
      marinePointId: point.id,
      gridLatitude: 41.25,
      gridLongitude: 29.5,
      distanceKm: 10.74,
      sample,
    };
  }

  const REAL = { u10: 2, v10: -3, swh: 0.8, mwd: 120 };

  describe('cold behaviour — before any cycle exists', () => {
    it('serves /layers 200 with all three provider-catalogue fields null', async () => {
      const response = await request(app.getHttpServer()).get('/api/marine/layers').expect(200);
      for (const layer of response.body as {
        horizonEndUtc: string | null;
        updateFrequency: string | null;
        catalogueUpdatedAtUtc: string | null;
      }[]) {
        expect(layer.horizonEndUtc).toBeNull();
        expect(layer.updateFrequency).toBeNull();
        expect(layer.catalogueUpdatedAtUtc).toBeNull();
      }
    });

    it('answers a cold series read honestly: no value, transient — never a fabricated series', async () => {
      const point = points[0];
      expect(point).toBeDefined();
      if (point === undefined) return;

      const read = await reader.readSeries(point);
      expect(read.value).toBeNull();
      expect(read.kind).toBe('transient');
    });
  });

  describe('the store on a real Postgres', () => {
    it('merges out-of-order steps atomically and completes the cycle on the last one', async () => {
      const point = points[1];
      expect(point).toBeDefined();
      if (point === undefined) return;
      const cycleUtc = new Date('2026-01-01T00:00:00.000Z');
      const base = {
        cycleUtc,
        stepHours: 3,
        forecastHours: 6,
        packingType: 'grib2 template 5.42',
        decoderVersion: 'e2e-1',
        now: new Date(),
      };

      // Priority order: nearest-to-now first (+6), then the ascending fill.
      await store.recordStep({
        ...base,
        stepHour: 6,
        bytesDownloaded: 100,
        points: [samplePoint(point, REAL)],
      });
      await store.recordStep({
        ...base,
        stepHour: 0,
        bytesDownloaded: 50,
        points: [samplePoint(point, { ...REAL, swh: null })],
      });

      let cycle = await store.getCycle(cycleUtc);
      expect(cycle?.stepsDone).toEqual([0, 6]);
      expect(cycle?.completedAt).toBeNull();
      expect(cycle?.bytesDownloaded).toBe(150);

      await store.recordStep({
        ...base,
        stepHour: 3,
        bytesDownloaded: 25,
        points: [samplePoint(point, REAL)],
      });
      cycle = await store.getCycle(cycleUtc);
      expect(cycle?.stepsDone).toEqual([0, 3, 6]);
      expect(cycle?.completedAt).not.toBeNull();
      expect(cycle?.bytesDownloaded).toBe(175);

      // The stored series is sorted by step regardless of arrival order, arrays parallel,
      // and the raw jsonb survives the Postgres round trip.
      const newest = await store.newestSeriesForPoint(point.id);
      expect(newest?.series.values.steps).toEqual([0, 3, 6]);
      expect(newest?.series.values.u10).toEqual([2, 2, 2]);
      expect(newest?.series.values.swh).toEqual([null, 0.8, 0.8]);
      expect(newest?.series.support.swh).toBe('ok');
    });

    it('CASCADE-deletes the series rows with their cycle — retention can never orphan', async () => {
      const cycleRepository = dataSource.getRepository(MarineEcmwfCycle);
      const seriesRepository = dataSource.getRepository(MarineEcmwfPointSeries);
      const cycleUtc = new Date('2026-01-01T00:00:00.000Z');

      expect(await seriesRepository.countBy({ cycleUtc })).toBeGreaterThan(0);
      await cycleRepository.delete({ cycleUtc });
      expect(await seriesRepository.countBy({ cycleUtc })).toBe(0);
    });

    it('prunes to the newest N cycles, oldest first', async () => {
      const point = points[2];
      expect(point).toBeDefined();
      if (point === undefined) return;

      const days = ['2026-02-01', '2026-02-02', '2026-02-03', '2026-02-04'];
      for (const day of days) {
        await store.recordStep({
          cycleUtc: new Date(`${day}T00:00:00.000Z`),
          stepHour: 0,
          stepHours: 3,
          forecastHours: 6,
          bytesDownloaded: 1,
          packingType: 'grib2 template 5.42',
          decoderVersion: 'e2e-1',
          now: new Date(),
          points: [samplePoint(point, REAL)],
        });
      }

      const removed = await store.pruneCycles(3);
      expect(removed).toBeGreaterThanOrEqual(1);
      expect(await store.getCycle(new Date('2026-02-01T00:00:00.000Z'))).toBeNull();
      expect(await store.getCycle(new Date('2026-02-04T00:00:00.000Z'))).not.toBeNull();
    });
  });

  describe('the read path over the store', () => {
    it('compiles a PARTIAL cycle honestly: parallel arrays, real horizonEndUtc, cycle as modelRunAtUtc', async () => {
      const point = points[3];
      expect(point).toBeDefined();
      if (point === undefined) return;

      // A recent cycle (inside the 24 h ceiling), two of three steps ingested.
      const cycleUtc = new Date(Date.now() - 2 * 3_600_000);
      for (const stepHour of [0, 3]) {
        await store.recordStep({
          cycleUtc,
          stepHour,
          stepHours: 3,
          forecastHours: 6,
          bytesDownloaded: 10,
          packingType: 'grib2 template 5.42',
          decoderVersion: 'e2e-1',
          now: new Date(),
          points: [samplePoint(point, REAL)],
        });
      }

      const read = await reader.readSeries(point);
      expect(read.kind).toBe('ok');
      const value = read.value;
      expect(value).not.toBeNull();
      if (value === null) return;

      // The frozen parallel-array guarantee, on a PARTIAL cycle (acceptance criterion 6).
      expect(value.series.timesUtc.length).toBe(2);
      for (const array of [
        value.series.seaSurfaceTemperature,
        value.series.waveHeight,
        value.series.waveDirection,
        value.series.windSpeed10m,
        value.series.windDirection10m,
      ]) {
        expect(array.length).toBe(value.series.timesUtc.length);
      }
      expect(value.series.stepHours).toBe(3);
      expect(value.series.source).toBe(MarineSource.Ecmwf);
      expect(value.series.modelRunAtUtc).toBe(cycleUtc.toISOString());
      // horizonEndUtc is the last step actually HELD — cycle + 3 h, not cycle + 6 h.
      expect(value.series.horizonEndUtc).toBe(
        new Date(cycleUtc.getTime() + 3 * 3_600_000).toISOString(),
      );
      // ECMWF publishes no SST in any stream (measured): the whole array is null.
      expect(value.series.seaSurfaceTemperature).toEqual([null, null]);
      // Wind is DERIVED at read time from the stored raw components.
      expect(value.series.windSpeed10m[0]).toBeCloseTo(Math.sqrt(2 * 2 + 3 * 3), 10);
      expect(value.gridLatitude).toBe(41.25);
      expect(value.distanceKm).toBe(10.74);
    });

    it('feeds a two-point province from ONE cycle read, with per-point support (acceptance 5)', async () => {
      // İstanbul carries two rows (Black Sea + Marmara) — the reason province_plate_code is
      // not unique. One point gets real waves, the other a fully-masked wave field, in the
      // SAME cycle: the two must publish independent verdicts, never fill from each other.
      const twoPointProvince = points.filter((candidate) => candidate.provincePlateCode === '34');
      expect(twoPointProvince.length).toBe(2);
      const [first, second] = twoPointProvince;
      if (first === undefined || second === undefined) return;

      const cycleUtc = new Date(Date.now() - 3 * 3_600_000);
      await store.recordStep({
        cycleUtc,
        stepHour: 0,
        stepHours: 3,
        forecastHours: 6,
        bytesDownloaded: 10,
        packingType: 'grib2 template 5.42',
        decoderVersion: 'e2e-1',
        now: new Date(),
        points: [samplePoint(first, REAL), samplePoint(second, { ...REAL, swh: null, mwd: null })],
      });

      const firstRead = await reader.readSeries(first);
      const secondRead = await reader.readSeries(second);

      expect(firstRead.kind).toBe('ok');
      expect(secondRead.kind).toBe('ok');
      expect(firstRead.value?.series.modelRunAtUtc).toBe(cycleUtc.toISOString());
      expect(secondRead.value?.series.modelRunAtUtc).toBe(cycleUtc.toISOString());

      // One basin reports waves, the other a masked wave field — per point, per field.
      expect(firstRead.value?.series.support.swh).toBe('ok');
      expect(secondRead.value?.series.support.swh).toBe('not_supported');
      expect(secondRead.value?.series.support.u10).toBe('ok');
      // The masked point still publishes its gap as null, never a borrowed neighbour value.
      expect(secondRead.value?.series.waveHeight).toEqual([null]);
      expect(firstRead.value?.series.waveHeight).toEqual([0.8]);
    });

    it('suppresses publication when the newest cycle breaches the 24 h age ceiling (SPEC §9.4)', async () => {
      const point = points[4];
      expect(point).toBeDefined();
      if (point === undefined) return;

      // 30 h old: validAtUtc of the nearest step would still look current — only the cycle age
      // exposes the stalled ingest, which is why this ceiling exists at all.
      const staleCycle = new Date(Date.now() - 30 * 3_600_000);
      await store.recordStep({
        cycleUtc: staleCycle,
        stepHour: 30, // the step whose valid time is ≈ now
        stepHours: 3,
        forecastHours: 120,
        bytesDownloaded: 10,
        packingType: 'grib2 template 5.42',
        decoderVersion: 'e2e-1',
        now: new Date(),
        points: [samplePoint(point, REAL)],
      });

      const read = await reader.readSeries(point);
      expect(read.value).toBeNull();
      expect(read.kind).toBe('transient');
      expect(read.reason).toContain('cycle-age ceiling');
    });
  });

  describe('GET /api/marine/layers — the ECMWF fill', () => {
    it('resolves the three catalogue fields for the ECMWF-PRIMARY layers only', async () => {
      const response = await request(app.getHttpServer()).get('/api/marine/layers').expect(200);
      const layers = response.body as {
        id: string;
        primarySource: string;
        horizonEndUtc: string | null;
        updateFrequency: string | null;
        catalogueUpdatedAtUtc: string | null;
      }[];

      for (const layer of layers) {
        if (layer.primarySource === 'ecmwf') {
          expect(layer.horizonEndUtc).not.toBeNull();
          expect(layer.updateFrequency).toContain('UTC');
          expect(layer.catalogueUpdatedAtUtc).not.toBeNull();
        } else {
          // CMEMS-primary layers wait for M4 — a fallback provider's horizon must not be
          // attributed to the primary product.
          expect(layer.horizonEndUtc).toBeNull();
          expect(layer.updateFrequency).toBeNull();
          expect(layer.catalogueUpdatedAtUtc).toBeNull();
        }
      }
    });
  });

  // LAST on purpose: the verdict over everything this suite did.
  describe('the COLD-BEHAVIOR invariant', () => {
    it('made ZERO upstream calls across every request and read above', () => {
      // Endpoints were hit, series were compiled, ceilings fired — and nothing ever reached
      // for the network. The guard REJECTS calls, so a violation would have failed its test
      // too; this closes the loop by proving not even a swallowed attempt happened.
      expect(upstreamCalls).toEqual([]);
    });
  });
});
