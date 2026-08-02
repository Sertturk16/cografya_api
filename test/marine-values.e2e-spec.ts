import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { join } from 'node:path';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
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
import { toTilePixel } from '../src/marine/cmems/cmems-geo';
import { CMEMS_SELECTOR_ENTRIES } from '../src/marine/cmems/cmems-routing';
import { CmemsWarmupTarget } from '../src/marine/cmems/cmems-warmup.target';
import { CMEMS_ZOOM } from '../src/marine/cmems/cmems.constants';
import { ECMWF_INGEST_STORE } from '../src/marine/ecmwf/ecmwf-ingest.store';
import type { EcmwfIngestStorePort } from '../src/marine/ecmwf/ecmwf-ingest.store';
import { MarinePoint } from '../src/marine/entities/marine-point.entity';
import { SeaBasin } from '../src/marine/marine.types';
import { OperationDeadline } from '../src/upstream/operation-deadline';

/**
 * Marine M4b e2e — the COLD-BEHAVIOR machine checks (plan §8), against a REAL Postgres
 * (Testcontainers) and a FAKE CMEMS upstream (a local HTTP server serving synthetic STAC
 * documents and GetFeatureInfo replies). Zero real network by construction: a counting fetch
 * wrapper forwards ONLY to the fake server and rejects/records anything else.
 *
 * The checks, in suite order:
 *  0. empty `marine_points` → 500 on every value endpoint (broken deploy, not outage);
 *  A. counted-fetch COLD overview → 0 upstream calls, dataAvailable:false, `no-store`;
 *  B. warmup resolution phase → ≤4 STAC calls; `/layers` CMEMS fields fill (d1–d3);
 *  C. COLD single-point conditions → exactly its own 3 CMEMS calls, 0 ECMWF — corroborating
 *     end-to-end that A's 78 cold peeks wrote no suppressing negatives (the BINDING proof of
 *     that property is the injected-clock peek unit suite; see the phase-C note);
 *  D. İstanbul provinces → ≤6 CMEMS calls, two points with INDEPENDENT per-field statuses;
 *  E. ECMWF store seeded → Marmara wave pair falls back AS A PAIR, warm reads cost 0 calls;
 *  F. retired-dataset rotation → one forced STAC re-resolution, recovery, then the WARM
 *     overview integrity sweep (30 × 5) + weak-ETag 304;
 *  G. the 404/400 table;
 *  H. MARINE_ENABLED=false → value endpoints 404, points/layers stay 200.
 *
 * Structural throughout (CONVENTIONS §2): statuses, sources, counts, invariants — the fake
 * values are arbitrary plausible constants, never asserted as weather facts.
 */

const COMMITTED_ARTIFACT_DIR = join(__dirname, '..', 'data', 'marine');
const TEST_INTERNAL_TOKEN = 'e2e-trusted-client-token-0123456789-abcdefgh';
const VALUE_CACHE_CONTROL = 'public, max-age=300, s-maxage=900, stale-while-revalidate=3600';

const XML_400 =
  '<ExceptionReport xmlns="http://www.opengis.net/ows/1.1"><Exception exceptionCode=' +
  '"InvalidParameterValue" locator="TIME"><ExceptionText>TIME is out of range' +
  '</ExceptionText></Exception></ExceptionReport>';

/** Mutable fake-provider state the phases flip. */
interface FakeState {
  /** Version stamp per product id — bumping one simulates the provider's dataset rotation. */
  stamps: Map<string, number>;
  /** Dataset ids that answer 400-XML (the retired-id signature). */
  retired: Set<string>;
  /** `${slugTr}:${variableId}` → the provider's land-mask null (a legitimate no_data). */
  nullValues: Set<string>;
}

interface FieldDto {
  value: number | null;
  status: string;
  source: string | null;
  datasetId: string | null;
  freshness: string | null;
}

interface ConditionsDto {
  point: { slugTr: string; seaBasin: string };
  seaSurfaceTemperature: FieldDto;
  waveHeight: FieldDto;
  waveDirection: FieldDto;
  windSpeed10m: FieldDto;
  windDirection10m: FieldDto;
  series: { timesUtc: string[]; seaSurfaceTemperature: (number | null)[] } | null;
  seriesSourceDiffersFromInstant: boolean;
}

const FIELD_NAMES = [
  'seaSurfaceTemperature',
  'waveHeight',
  'waveDirection',
  'windSpeed10m',
  'windDirection10m',
] as const;

interface AttributionDto {
  providerId: string;
  providerName: string;
  licenceName: string;
  licenceUrl: string;
  requiredNoticeEn: string;
  disclaimerEn: string | null;
  explanationTr: string;
  doi: string | null;
  productTitle: string | null;
}

/**
 * The licence rows every value response must carry (M5).
 *
 * STRUCTURAL on purpose: the verbatim bytes are pinned once, in the unit suite
 * (`src/marine/marine-attribution-catalogue.spec.ts`), where the assertion is readable and does
 * not need Postgres. What this suite must prove is different and only provable end to end — that
 * the rows actually reach the wire, on the cold branch as well as the warm one.
 */
function expectBothAttributionRows(attributions: AttributionDto[]): void {
  expect(attributions.map((row) => row.providerId)).toEqual(['ecmwf', 'cmems']);
  for (const row of attributions) {
    expect(row.requiredNoticeEn.length).toBeGreaterThan(0);
    // The Turkish text travels alongside, never instead of, the English notice.
    expect(row.explanationTr.length).toBeGreaterThan(0);
    expect(row.explanationTr).not.toBe(row.requiredNoticeEn);
    // DOIs live in data-provenance.md, not in the payload (DEC 2026-08-02g §2).
    expect(row.doi).toBeNull();
    expect(row.productTitle).toBeNull();
  }
  // ECMWF's licence mandates a disclaimer; the Copernicus Marine licence imposes none.
  expect(attributions[0]?.disclaimerEn).not.toBeNull();
  expect(attributions[1]?.disclaimerEn).toBeNull();
}

describe('Marine M4b value endpoints (e2e)', () => {
  let container: StartedPostgreSqlContainer;
  let dataSource: DataSource;
  let app: INestApplication;
  let fake: Server;
  let fakeBase: string;
  let points: MarinePoint[] = [];
  let pointByPixel = new Map<string, MarinePoint>();
  /** The ECMWF cycle phase E records — the source of the copyright year phase F checks. */
  let ingestedCycleUtc: Date | null = null;

  const state: FakeState = { stamps: new Map(), retired: new Set(), nullValues: new Set() };

  /** Every fetch the wrapper saw, by destination class. */
  let wmtsCalls: string[] = [];
  let stacCalls: string[] = [];
  const foreignCalls: string[] = [];
  const realFetch = globalThis.fetch;

  function resetCounters(): void {
    wmtsCalls = [];
    stacCalls = [];
  }

  function datasetIdFor(productId: string, variableToken: string, gridToken: string): string {
    const stamp = state.stamps.get(productId) ?? 202511;
    return `cmems_mod_tst_${variableToken}_anfc_${gridToken}_PT1H-m_${String(stamp)}`;
  }

  // Frozen ONCE: per-call Date.now() would give the two MEDSEA products ends milliseconds
  // apart and break the deterministic d1 (min) assertion in phase B.
  const EXTENT_BASE_MS = Date.now();

  function stacBody(productId: string): string {
    // MEDSEA products end earlier than BLKSEA ones so the layer-level `min` rule (d1) is
    // observable; every extent contains "now" so the time clamp stays inactive.
    const endMs = EXTENT_BASE_MS + (productId.startsWith('MEDSEA') ? 4 : 5) * 86_400_000;
    const items = CMEMS_SELECTOR_ENTRIES.filter(
      (entry) => entry.selector.productId === productId,
    ).map((entry) => ({
      rel: 'item',
      href:
        `${datasetIdFor(productId, entry.selector.acceptedVariableTokens[0] ?? 'wav', entry.selector.gridToken)}` +
        '/dataset.stac.json',
    }));
    return JSON.stringify({
      id: productId,
      license: 'proprietary',
      extent: {
        temporal: {
          interval: [['2021-01-01T00:00:00Z', new Date(endMs).toISOString().replace('.000Z', 'Z')]],
        },
      },
      properties: {
        updateFrequencies: { daily: '16:00' },
        admp_updated: '2026-08-01T11:06:46Z',
      },
      links: items,
    });
  }

  function handleWmts(url: URL): { status: number; contentType: string; body: string } {
    const layer = url.searchParams.get('layer') ?? '';
    const [, datasetId, variableId] = layer.split('/');
    if (datasetId === undefined || variableId === undefined) {
      return { status: 400, contentType: 'text/xml; charset=utf-8', body: XML_400 };
    }
    if (state.retired.has(datasetId)) {
      return { status: 400, contentType: 'text/xml; charset=utf-8', body: XML_400 };
    }
    const pixelKey = `${url.searchParams.get('TileRow') ?? ''}/${url.searchParams.get('TileCol') ?? ''}/${url.searchParams.get('I') ?? ''}/${url.searchParams.get('J') ?? ''}`;
    const point = pointByPixel.get(pixelKey);
    if (point === undefined) {
      // A request for a pixel no seeded point maps to is OUR arithmetic drifting — fail loud.
      return { status: 500, contentType: 'text/plain', body: `unknown pixel ${pixelKey}` };
    }
    const nullValue = state.nullValues.has(`${point.slugTr}:${variableId}`);
    const units = variableId === 'thetao' ? 'degrees_C' : variableId === 'VHM0' ? 'm' : 'degree';
    const value = variableId === 'thetao' ? 21.4 : variableId === 'VHM0' ? 0.8 : 120;
    return {
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        features: [
          {
            properties: {
              lat: point.latitude,
              lon: point.longitude,
              variableId,
              datasetId: layer.slice(0, layer.length - variableId.length - 1),
              value: nullValue ? null : value,
              units,
            },
          },
        ],
      }),
    };
  }

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
    const url = container.getConnectionUri();

    // The fake CMEMS upstream: `/metadata/...` = STAC, `/teroWmts` = GetFeatureInfo.
    fake = createServer((req, res) => {
      const requestUrl = new URL(req.url ?? '/', fakeBase);
      if (requestUrl.pathname.endsWith('/product.stac.json')) {
        const productId = requestUrl.pathname.split('/').at(-2) ?? '';
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(stacBody(productId));
        return;
      }
      const reply = handleWmts(requestUrl);
      res.writeHead(reply.status, { 'content-type': reply.contentType });
      res.end(reply.body);
    });
    await new Promise<void>((resolve) => fake.listen(0, '127.0.0.1', resolve));
    const address = fake.address();
    if (address === null || typeof address === 'string') throw new Error('fake server address');
    fakeBase = `http://127.0.0.1:${String(address.port)}`;

    process.env.DATABASE_URL = url;
    process.env.WEB_ORIGIN = 'http://localhost:3000';
    process.env.INTERNAL_REQUEST_TOKEN = TEST_INTERNAL_TOKEN;
    process.env.MARINE_ENABLED = 'true';
    // No timers: every tour in this suite is driven BY HAND through the target, so the only
    // possible source of an upstream call is the code path under test.
    process.env.MARINE_WARMUP_ENABLED = 'false';
    // The ECMWF leg is OFF (no ingest target, no ECMWF network surface at all); its read path
    // still serves from rows this suite writes into the store directly.
    process.env.ECMWF_ENABLED = 'false';
    process.env.CMEMS_WMTS_BASE_URL = `${fakeBase}/teroWmts`;
    process.env.CMEMS_STAC_BASE_URL = `${fakeBase}/metadata`;
    // 1 s error TTLs so the retired-dataset heal and the ECMWF-cold→seeded transition are
    // testable with a real sleep instead of a fake clock (the app owns its own Date.now).
    process.env.MARINE_ERROR_TTL_SECONDS = '1';
    process.env.MARINE_CLIENT_ERROR_TTL_SECONDS = '1';

    // Counting wrapper, installed BEFORE the app exists: fake-server calls pass through and
    // are tallied; anything else is refused and recorded — zero real network, provably.
    globalThis.fetch = (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      const target =
        typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (target.startsWith(fakeBase)) {
        if (target.includes('/product.stac.json')) stacCalls.push(target);
        else wmtsCalls.push(target);
        return realFetch(input, init);
      }
      foreignCalls.push(target);
      return Promise.reject(
        new Error(`non-fake upstream call attempted: ${target} — COLD-BEHAVIOR violation`),
      );
    };

    dataSource = new DataSource(buildDataSourceOptions(url));
    await dataSource.initialize();
    await dataSource.runMigrations();
    await seedGeography(dataSource);
    // marine_points is deliberately NOT loaded yet — phase 0 asserts the empty-table 500s.

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { AppModule } = require('../src/app.module') as typeof import('../src/app.module');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    applyGlobalPrefix(app);
    // Mirror main.ts: the 400 half of the §7.9 error table comes from this pipe.
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.use((req: Request, _res: Response, next: NextFunction) => {
      req.headers[INTERNAL_REQUEST_HEADER] = TEST_INTERNAL_TOKEN;
      next();
    });
    await app.init();
  }, 240_000);

  afterAll(async () => {
    globalThis.fetch = realFetch;
    await app?.close();
    await dataSource?.destroy();
    await new Promise<void>((resolve) => {
      fake?.close(() => resolve());
    });
    await container?.stop();
  });

  const http = () => request(app.getHttpServer());
  const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

  /** A Black Sea point OUTSIDE İstanbul, so phase C and phase D count disjoint key sets. */
  function coldBlackSeaPoint(): MarinePoint {
    const point = points.find(
      (candidate) =>
        candidate.seaBasin === SeaBasin.BlackSea && candidate.provincePlateCode !== '34',
    );
    if (point === undefined) throw new Error('no non-İstanbul Black Sea point');
    return point;
  }

  function istanbulPoints(): { blackSea: MarinePoint; marmara: MarinePoint } {
    const rows = points.filter((point) => point.provincePlateCode === '34');
    const blackSea = rows.find((point) => point.seaBasin === SeaBasin.BlackSea);
    const marmara = rows.find((point) => point.seaBasin === SeaBasin.Marmara);
    if (blackSea === undefined || marmara === undefined) throw new Error('İstanbul rows missing');
    return { blackSea, marmara };
  }

  describe('phase 0 — an empty marine_points table is a broken deploy: 500 everywhere', () => {
    it('overview refuses with 500 and NO Cache-Control header', async () => {
      const response = await http().get('/api/marine/overview').expect(500);
      expect(response.headers['cache-control']).toBeUndefined();
    });

    it('conditions and provinces refuse with 500 too — every slug/plate would otherwise 404 silently', async () => {
      await http().get('/api/marine/points/istanbul-marmara-aciklari/conditions').expect(500);
      await http().get('/api/marine/provinces/34/conditions').expect(500);
      expect([...wmtsCalls, ...stacCalls]).toEqual([]);
    });
  });

  describe('phase A — totally cold overview', () => {
    beforeAll(async () => {
      await loadMarinePoints(dataSource, { inputDir: COMMITTED_ARTIFACT_DIR });
      points = await dataSource.getRepository(MarinePoint).find({ order: { displayOrder: 'ASC' } });
      pointByPixel = new Map(
        points.map((point) => {
          const pixel = toTilePixel(point.latitude, point.longitude, CMEMS_ZOOM);
          return [
            `${String(pixel.tileRow)}/${String(pixel.tileCol)}/${String(pixel.i)}/${String(pixel.j)}`,
            point,
          ];
        }),
      );
      // İstanbul's Marmara point answers the provider's land-mask null for temperature — the
      // per-point independence fixture phase D asserts.
      state.nullValues.add(`${istanbulPoints().marmara.slugTr}:thetao`);
      resetCounters();
    });

    it('answers 200 with dataAvailable:false, all fields unavailable, no-store — and ZERO upstream calls', async () => {
      const response = await http().get('/api/marine/overview').expect(200);
      const body = response.body as {
        points: Record<string, FieldDto | object>[];
        dataAvailable: boolean;
        attributions: AttributionDto[];
      };

      expect(body.dataAvailable).toBe(false);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(body.points).toHaveLength(points.length);
      for (const entry of body.points) {
        for (const field of FIELD_NAMES) {
          expect((entry[field] as FieldDto).status).toBe('unavailable');
          expect((entry[field] as FieldDto).value).toBeNull();
        }
      }
      // M5: the licence notice is attached to the SECTION, not to whichever provider answered,
      // so a cold response carries both rows in full. This is the branch where getting it wrong
      // is invisible — the page still renders, just unattributed.
      expectBothAttributionRows(body.attributions);
      // No ECMWF cycle has been ingested, so there is no data year: the copyright line is
      // OMITTED rather than filled from the wall clock.
      expect(body.attributions[0]?.requiredNoticeEn).not.toContain('Copyright');
      expect(body.attributions[0]?.requiredNoticeEn).toContain(
        'This service is based on data and products of',
      );

      // THE cold row of the locked table: the batch endpoint reached for nothing.
      expect(wmtsCalls).toEqual([]);
      expect(stacCalls).toEqual([]);
    });
  });

  describe('phase B — the warmup resolution phase fills /layers (d1–d3)', () => {
    it('resolves the four product documents in ≤4 STAC calls and no value calls', async () => {
      const target = app.get(CmemsWarmupTarget);
      await target.refreshResolutions(new OperationDeadline(60_000));
      expect(stacCalls.length).toBeLessThanOrEqual(4);
      expect(stacCalls.length).toBe(4);
      expect(wmtsCalls).toEqual([]);
    });

    it('CMEMS layers carry the resolved catalogue fields; ECMWF layers keep honest nulls (no cycle yet)', async () => {
      const response = await http().get('/api/marine/layers').expect(200);
      const layers = response.body as {
        id: string;
        primarySource: string;
        horizonEndUtc: string | null;
        updateFrequency: string | null;
        catalogueUpdatedAtUtc: string | null;
      }[];
      for (const layer of layers) {
        if (layer.primarySource === 'cmems') {
          expect(layer.horizonEndUtc).not.toBeNull();
          expect(layer.updateFrequency).toContain('daily');
          expect(layer.catalogueUpdatedAtUtc).toBe('2026-08-01T11:06:46Z');
        } else {
          expect(layer.horizonEndUtc).toBeNull();
          expect(layer.updateFrequency).toBeNull();
          expect(layer.catalogueUpdatedAtUtc).toBeNull();
        }
      }
      // d1: the layer horizon is the MINIMUM across serving products — the (earlier) MEDSEA
      // end, even though the BLKSEA product advertises a day more.
      const sst = layers.find((layer) => layer.id === 'sea_surface_temperature');
      const wave = layers.find((layer) => layer.id === 'wave_height');
      expect(sst?.horizonEndUtc).toBe(wave?.horizonEndUtc);
    });
  });

  describe('phase C — cold single-point conditions (≤3 CMEMS, 0 ECMWF) + the peek proof', () => {
    it('refreshes exactly its own three keys inline and publishes them', async () => {
      resetCounters();
      const blackSeaPoint = coldBlackSeaPoint();

      const response = await http()
        .get(`/api/marine/points/${blackSeaPoint.slugTr}/conditions`)
        .expect(200);
      const body = response.body as ConditionsDto;

      // ≤3 CMEMS (exactly 3 for a Black Sea point), 0 STAC, and — by the foreign-call guard —
      // 0 ECMWF anywhere. This also CORROBORATES "peek writes no negative entries": phase A
      // cold-peeked these very keys, and a still-binding negative written there would have
      // suppressed these refreshes into negative_hits with zero calls. Corroborates, not
      // proves (review #82 M3): this suite pins `MARINE_ERROR_TTL_SECONDS=1`, so a phantom
      // phase-A negative could also have lapsed on its own between phases under CI load. The
      // BINDING proof is deterministic and clock-injected: the peek unit suite in
      // `upstream-cache.service.spec.ts` (U-1 — no refresh, no negative write, structurally).
      expect(wmtsCalls).toHaveLength(3);
      expect(stacCalls).toEqual([]);

      expect(body.seaSurfaceTemperature.status).toBe('ok');
      expect(body.seaSurfaceTemperature.source).toBe('cmems');
      expect(body.seaSurfaceTemperature.datasetId).toContain('/');
      expect(body.waveHeight.status).toBe('ok');
      expect(body.waveHeight.source).toBe('cmems');
      expect(body.waveDirection.source).toBe('cmems');
      // The ECMWF store is empty: wind honestly unavailable, series honestly null.
      expect(body.windSpeed10m.status).toBe('unavailable');
      expect(body.windSpeed10m.source).toBeNull();
      expect(body.series).toBeNull();
      expect(body.seriesSourceDiffersFromInstant).toBe(false);
      expect(response.headers['cache-control']).toBe(VALUE_CACHE_CONTROL);
      expect(response.headers['x-marine-cache-age']).toBeDefined();
    });

    it('the EN slug reaches the same point, WARM — zero further provider calls', async () => {
      resetCounters();
      const blackSeaPoint = coldBlackSeaPoint();
      const response = await http()
        .get(`/api/marine/points/${blackSeaPoint.slugEn}/conditions`)
        .expect(200);
      expect((response.body as ConditionsDto).point.slugTr).toBe(blackSeaPoint.slugTr);
      expect(wmtsCalls).toEqual([]);
    });
  });

  describe('phase D — a two-sea province: ≤6 keys, one shared deadline, independent statuses', () => {
    it('İstanbul costs ≤6 CMEMS calls and its two points answer independently', async () => {
      resetCounters();
      const response = await http().get('/api/marine/provinces/34/conditions').expect(200);
      const body = response.body as {
        plateCode: string;
        marinePoints: ConditionsDto[];
        attributions: AttributionDto[];
      };

      // 3 Black Sea keys + 1 Marmara key (waves are not_supported there → NO call, the
      // routing-level skip that cmemsWaveSupport encodes — its real M4b call site).
      expect(wmtsCalls.length).toBeLessThanOrEqual(6);
      expect(wmtsCalls).toHaveLength(4);

      expect(body.plateCode).toBe('34');
      expect(body.marinePoints).toHaveLength(2);
      const { blackSea, marmara } = istanbulPoints();
      const blackSeaDto = body.marinePoints.find((dto) => dto.point.slugTr === blackSea.slugTr);
      const marmaraDto = body.marinePoints.find((dto) => dto.point.slugTr === marmara.slugTr);
      expect(blackSeaDto).toBeDefined();
      expect(marmaraDto).toBeDefined();
      if (blackSeaDto === undefined || marmaraDto === undefined) return;

      // INDEPENDENT per-field statuses: same request, same instant — one point publishes a
      // number, the other publishes the provider's land-mask answer. Never filled across.
      expect(blackSeaDto.seaSurfaceTemperature.status).toBe('ok');
      expect(marmaraDto.seaSurfaceTemperature.status).toBe('no_data');
      expect(marmaraDto.seaSurfaceTemperature.value).toBeNull();

      // Marmara wave pair: CMEMS not_supported → ECMWF fallback — whose store is still empty,
      // so BOTH halves are unavailable together (pair consistency even in absence).
      expect(marmaraDto.waveHeight.status).toBe('unavailable');
      expect(marmaraDto.waveDirection.status).toBe('unavailable');
      expect(blackSeaDto.waveHeight.source).toBe('cmems');

      // Review #82 I5 — header class: `X-Marine-Cache-Age` reduces over `kind === 'ok'` reads
      // ONLY, so the Marmara land-mask `no_data` written by this very request (24 h negative
      // TTL — the sweep deliberately never re-fetches it) must not drive the header. Here the
      // ok values were just refreshed, so the header must sit in the seconds class; the
      // deterministic 24 h-pin proof lives in `marine-read-reducers.spec.ts`.
      expect(response.headers['x-marine-cache-age']).toMatch(/^\d+$/);
      expect(Number(response.headers['x-marine-cache-age'])).toBeLessThanOrEqual(5);

      // M5, the combination only this phase reaches: the PROVINCE endpoint with CMEMS warm and
      // the ECMWF store still empty. Both licence rows must ship, and with no ingested cycle the
      // copyright line must be omitted rather than filled from the wall clock. Phase F proves
      // the same endpoint on the year-bearing branch; without this the null-year branch was
      // e2e-covered on /overview only (review #83 SFH-M1).
      expectBothAttributionRows(body.attributions);
      expect(body.attributions[0]?.requiredNoticeEn).not.toContain('Copyright');
    });
  });

  describe('phase E — the ECMWF store fills: pair fallback, warm reads cost nothing', () => {
    beforeAll(async () => {
      const store = app.get<EcmwfIngestStorePort>(ECMWF_INGEST_STORE);
      const cycleUtc = new Date(Date.now() - 2 * 3_600_000);
      // Hoisted: phase F asserts the served copyright year is THIS cycle's year, not the
      // wall clock's — a distinction only a recorded cycle can prove.
      ingestedCycleUtc = cycleUtc;
      for (const stepHour of [0, 3]) {
        await store.recordStep({
          cycleUtc,
          stepHour,
          stepHours: 3,
          forecastHours: 6,
          bytesDownloaded: 10,
          packingType: 'grib2 template 5.42',
          decoderVersion: 'e2e-m4b',
          now: new Date(),
          // EVERY point, not just İstanbul: phase F's warm-overview / weak-ETag check needs a
          // byte-stable body, and a point whose ECMWF read keeps re-writing a 1 s transient
          // negative would carry a moving fetchedAtUtc.
          points: points.map((point) => ({
            marinePointId: point.id,
            gridLatitude: 41.25,
            gridLongitude: 29.5,
            distanceKm: 10.74,
            sample: { u10: 2, v10: -3, swh: 0.8, mwd: 120 },
          })),
        });
      }
      // Let the pre-seed ECMWF `transient` negatives (1 s TTL here) lapse.
      await sleep(1_200);
    });

    it('the Marmara wave pair falls back to ECMWF AS A PAIR; warm CMEMS keys cost zero calls', async () => {
      resetCounters();
      const response = await http().get('/api/marine/provinces/34/conditions').expect(200);
      const body = response.body as { marinePoints: ConditionsDto[] };
      const { blackSea, marmara } = istanbulPoints();
      const marmaraDto = body.marinePoints.find((dto) => dto.point.slugTr === marmara.slugTr);
      const blackSeaDto = body.marinePoints.find((dto) => dto.point.slugTr === blackSea.slugTr);
      if (marmaraDto === undefined || blackSeaDto === undefined) {
        throw new Error('İstanbul DTOs missing');
      }

      // CMEMS keys are warm (1 h TTL) → the whole province read reaches for nothing.
      expect(wmtsCalls).toEqual([]);

      // Pair consistency, live: BOTH halves from ECMWF, never a mixed arrow.
      expect(marmaraDto.waveHeight.status).toBe('ok');
      expect(marmaraDto.waveHeight.source).toBe('ecmwf');
      expect(marmaraDto.waveDirection.source).toBe('ecmwf');
      expect(marmaraDto.windSpeed10m.status).toBe('ok');
      expect(marmaraDto.series).not.toBeNull();
      // ECMWF publishes no SST: the series array stays null for its whole length.
      expect(marmaraDto.series?.seaSurfaceTemperature.every((sample) => sample === null)).toBe(
        true,
      );

      // B12: the Black Sea point mixes CMEMS instants over an ECMWF series → flag true; the
      // Marmara point's only ok instants ARE ECMWF → flag false. Computed, not configured.
      expect(blackSeaDto.seriesSourceDiffersFromInstant).toBe(true);
      expect(marmaraDto.seriesSourceDiffersFromInstant).toBe(false);
    });
  });

  describe('phase F — dataset retirement heals through ONE forced re-resolution; warm overview integrity', () => {
    it('a 400-XML wave dataset triggers exactly one STAC re-resolution for its product', async () => {
      // The provider retires the Black Sea wave dataset and publishes a successor.
      const waveProduct = 'BLKSEA_ANALYSISFORECAST_WAV_007_003';
      state.retired.add(datasetIdFor(waveProduct, 'wav', '2.5km'));
      state.stamps.set(waveProduct, 202512);

      resetCounters();
      const target = app.get(CmemsWarmupTarget);
      await target.refresh(new OperationDeadline(240_000));

      // Resolutions were fresh (6 h TTL), so the ONLY STAC call is the 400-triggered forced
      // re-resolution — once for the product, not once per failing key.
      expect(stacCalls).toHaveLength(1);
      expect(stacCalls[0]).toContain(waveProduct);

      // The heal tour: the 1 s client_error negatives lapse, the remaining keys refresh
      // against the successor dataset.
      await sleep(1_200);
      resetCounters();
      await target.refresh(new OperationDeadline(240_000));
      expect(stacCalls).toEqual([]);
    }, 120_000);

    it('the WARM overview serves 30 × 5 fields, zero upstream calls, rotated ids included — and a 304 on If-None-Match', async () => {
      resetCounters();
      const response = await http().get('/api/marine/overview').expect(200);
      const body = response.body as {
        points: ({ point: { slugTr: string; seaBasin: string } } & Record<string, unknown>)[];
        dataAvailable: boolean;
      };

      expect(wmtsCalls).toEqual([]);
      expect(stacCalls).toEqual([]);
      expect(body.dataAvailable).toBe(true);
      expect(response.headers['cache-control']).toBe(VALUE_CACHE_CONTROL);
      expect(response.headers['x-marine-cache-age']).toMatch(/^\d+$/);

      expect(body.points).toHaveLength(points.length);
      const validStatuses = new Set(['ok', 'no_data', 'not_supported', 'unavailable']);
      for (const entry of body.points) {
        for (const field of FIELD_NAMES) {
          const dto = entry[field] as FieldDto;
          expect(validStatuses.has(dto.status)).toBe(true);
          if (dto.status === 'ok') expect(dto.value).not.toBeNull();
          else expect(dto.value).toBeNull();
        }
      }

      // Every Black Sea wave value now carries a dataset id — and at least one of them the
      // ROTATED stamp (points warmed before the rotation legitimately keep the old id until
      // their TTL; nothing may pin a version).
      const blackSeaWaves = body.points
        .filter((entry) => entry.point.seaBasin === 'black_sea')
        .map((entry) => entry['waveHeight'] as FieldDto)
        .filter((dto) => dto.status === 'ok');
      expect(blackSeaWaves.length).toBeGreaterThan(0);
      expect(blackSeaWaves.some((dto) => dto.datasetId?.includes('202512') === true)).toBe(true);

      // Weak ETag + If-None-Match → 304: the body is byte-stable while the data is unchanged
      // (generatedAtUtc is data-derived — delta d5), so Express's default ETag revalidates.
      const etag = response.headers['etag'];
      expect(etag).toBeDefined();
      if (etag === undefined) return;
      await http().get('/api/marine/overview').set('If-None-Match', etag).expect(304);
    });

    it('both value surfaces carry the SAME two licence rows, dated from the ingested cycle', async () => {
      const overview = await http().get('/api/marine/overview').expect(200);

      // Adding attributions must not destabilise the body: the weak-ETag / ISR revalidation
      // contract requires two identical requests over unchanged data to be byte-identical.
      // Done back to back, and BEFORE the province call, because `/overview` is peek-only and
      // so writes nothing — while a province read-through legitimately may.
      const repeat = await http().get('/api/marine/overview').expect(200);
      expect(repeat.text).toBe(overview.text);

      const province = await http().get('/api/marine/provinces/34/conditions').expect(200);
      const overviewRows = (overview.body as { attributions: AttributionDto[] }).attributions;
      const provinceRows = (province.body as { attributions: AttributionDto[] }).attributions;

      expectBothAttributionRows(overviewRows);
      // ONE source, two endpoints: the hub and the province page must not be able to publish
      // different licence text, which is exactly what two hand-maintained copies would allow.
      //
      // Read the scope of this assertion precisely (review #83 CR-M4): identity holds HERE
      // because the phase-E fixture records one cycle for every point, so both responses derive
      // the same copyright year. It is NOT a contract guarantee — the year is computed per
      // response over that response's own points, so a province whose cached cycle is older than
      // the hub's freshest, or a request straddling a New Year boundary, may legitimately state
      // a different year. What IS contractual is that the licence-fixed parts of the rows come
      // from one module; do not turn this into a cross-endpoint equality requirement.
      expect(provinceRows).toEqual(overviewRows);

      // The year is the DATA's, taken from the cycle phase E recorded — not `new Date()`.
      // Asserting it against the recorded cycle is what makes the difference observable; a
      // wall-clock implementation would pass any check written against the wall clock.
      expect(ingestedCycleUtc).not.toBeNull();
      if (ingestedCycleUtc === null) return;
      expect(overviewRows[0]?.requiredNoticeEn).toContain(
        `© ${String(ingestedCycleUtc.getUTCFullYear())} European Centre`,
      );
    });
  });

  describe('phase G — the §7.9 error table', () => {
    it('unknown slug → 404; malformed slug → 400', async () => {
      await http().get('/api/marine/points/no-such-point/conditions').expect(404);
      await http().get('/api/marine/points/Not_A_Slug/conditions').expect(400);
    });

    it('malformed plate → 400; inland province → 404', async () => {
      await http().get('/api/marine/provinces/999/conditions').expect(400);
      await http().get('/api/marine/provinces/6/conditions').expect(400);
      // Ankara: a perfectly valid province with no sea — the resource does not exist.
      await http().get('/api/marine/provinces/06/conditions').expect(404);
    });
  });

  describe('phase H — MARINE_ENABLED=false: value endpoints vanish, points/layers stay', () => {
    let disabledApp: INestApplication;

    beforeAll(async () => {
      process.env.MARINE_ENABLED = 'false';
      // `ConfigModule.forRoot` validates `process.env` EAGERLY when `app.module` is imported,
      // so flipping the switch needs a FRESH module registry — which is exactly how a
      // differently-configured deployment boots. Everything the disabled app touches is
      // re-required from that fresh registry (Nest testing/common included), so no object
      // crosses the two registries.
      jest.resetModules();
      /* eslint-disable @typescript-eslint/no-require-imports */
      const { AppModule } = require('../src/app.module') as typeof import('../src/app.module');
      const { Test: FreshTest } = require('@nestjs/testing') as typeof import('@nestjs/testing');
      const { ValidationPipe: FreshValidationPipe } =
        require('@nestjs/common') as typeof import('@nestjs/common');
      const { applyGlobalPrefix: freshApplyGlobalPrefix } =
        require('../src/common/bootstrap') as typeof import('../src/common/bootstrap');
      /* eslint-enable @typescript-eslint/no-require-imports */
      const moduleRef = await FreshTest.createTestingModule({ imports: [AppModule] }).compile();
      disabledApp = moduleRef.createNestApplication();
      freshApplyGlobalPrefix(disabledApp);
      disabledApp.useGlobalPipes(
        new FreshValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
      );
      disabledApp.use((req: Request, _res: Response, next: NextFunction) => {
        req.headers[INTERNAL_REQUEST_HEADER] = TEST_INTERNAL_TOKEN;
        next();
      });
      await disabledApp.init();
    }, 120_000);

    afterAll(async () => {
      await disabledApp?.close();
      process.env.MARINE_ENABLED = 'true';
    });

    it('the three value endpoints answer 404 — the feature "does not exist" (§7.9), never 503', async () => {
      const server = disabledApp.getHttpServer();
      await request(server).get('/api/marine/overview').expect(404);
      await request(server)
        .get('/api/marine/points/istanbul-marmara-aciklari/conditions')
        .expect(404);
      await request(server).get('/api/marine/provinces/34/conditions').expect(404);
    });

    it('points and layers keep their documented always-on posture', async () => {
      const server = disabledApp.getHttpServer();
      await request(server).get('/api/marine/points').expect(200);
      await request(server).get('/api/marine/layers').expect(200);
    });
  });

  // LAST on purpose — the verdict over the whole suite.
  describe('the zero-real-network invariant', () => {
    it('no call ever left for anything but the fake provider', () => {
      expect(foreignCalls).toEqual([]);
    });
  });
});
