import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { applyGlobalPrefix } from '../src/common/bootstrap';
import { buildDataSourceOptions } from '../src/database/data-source-options';
import { seedGeography } from '../src/database/seeds/seed-geography';
import {
  EARTHQUAKE_DEFAULT_MIN_MAGNITUDE,
  EARTHQUAKE_DEFAULT_WINDOW_DAYS,
  EARTHQUAKE_LIST_MAX_PAGE,
  EARTHQUAKE_LIST_MAX_PAGE_SIZE,
  EARTHQUAKE_MAX_WINDOW_DAYS,
} from '../src/earthquake/dto/earthquake-list-query.dto';
import { EarthquakeEvent } from '../src/earthquake/entities/earthquake-event.entity';
import { EarthquakeIngestRun } from '../src/earthquake/entities/earthquake-ingest-run.entity';
import {
  EarthquakeBindingKind,
  EarthquakeDataStatus,
  EarthquakeIngestJobKind,
  MagnitudeType,
} from '../src/earthquake/earthquake.types';
import {
  EarthquakeIngestStore,
  type EarthquakeEventUpsert,
} from '../src/earthquake/earthquake-ingest.store';

/**
 * E3 e2e: the three public endpoints against a REAL Postgres, through E1's migrations.
 *
 * What only this can prove:
 *  - the request path makes **zero** external calls, in every state (counting `fetch` spy);
 *  - the cold store answers 200 with an empty list, `unavailable` and `no-store` — with the
 *    attribution still populated, which is a regulatory obligation rather than a nicety;
 *  - the `Cache-Control` strings are the SPEC's, byte for byte;
 *  - ordering and pagination hold against real SQL, including the tie-break that stops one row
 *    appearing on two pages (the endpoint-level twin of the provider's `limit`-before-`orderby`
 *    trap);
 *  - out-of-scope rows are invisible on every path, in the list, in `total` and in the freshness;
 *  - a store filled with NO successful run behind it reads `stale`, not `unavailable`;
 *  - the endpoints serve while `EARTHQUAKE_ENABLED` is false — the kill switch is the ingest's.
 *
 * ## The flag is OFF for this whole suite, and that is the point
 * `EARTHQUAKE_ENABLED` defaults to false and nothing here turns it on. The app therefore boots
 * with no ingest target and no timer, and every assertion below is also an assertion about
 * flag-off behaviour. Turning it ON in a test is deliberately NOT done: the tours would reach
 * AFAD, and CI makes no external calls.
 *
 * ## Structural only (`CONVENTIONS.md` §2)
 * Every row below is synthetic. Nothing asserts that any earthquake ever had any property; the
 * assertions are about envelope shape, ordering, status vocabulary, headers, filtering and the
 * error matrix. The attribution strings are pinned in their own unit spec, where the recorded
 * licence-text exception applies.
 */

const MS_PER_DAY = 86_400_000;
const MS_PER_HOUR = 3_600_000;

/** SPEC §6.1, pinned verbatim — a caching-contract change must fail a test, not slip through. */
const LIST_CACHE_CONTROL = 'public, max-age=60, s-maxage=120, stale-while-revalidate=600';
const META_CACHE_CONTROL = 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400';

/** Plate codes: one real province, and one that is well-formed but names none. */
const PLATE_KAHRAMANMARAS = '46';
const PLATE_ANKARA = '06';
const PLATE_UNASSIGNED = '99';

const NOW = Date.now();

interface Attribution {
  providerId: string;
  providerName: string;
  requiredNoticeTr: string;
  regulationReference: string;
  licenceUrl: string | null;
}

interface ListItem {
  id: string;
  providerEventId: string;
  occurredAtUtc: string;
  magnitude: number;
  magnitudeType: string;
  bindingKind: string;
  bindingPlateCode: string | null;
}

interface ListBody {
  items: ListItem[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
  meta: {
    filter: { minMagnitude: number; plateCode: string | null; fromUtc: string; toUtc: string };
    dataUpdatedAtUtc: string | null;
    latestEventAtUtc: string | null;
    dataStatus: string;
    attributions: Attribution[];
  };
}

interface MetaBody {
  minMagnitudeDefault: number;
  scopeBufferKm: number;
  defaultWindowDays: number;
  maxWindowDays: number;
  dataUpdatedAtUtc: string | null;
  latestEventAtUtc: string | null;
  dataStatus: string;
  attributions: Attribution[];
}

/** The status TOKENS as they arrive over the wire — JSON, so plain strings. */
const STATUS_OK: string = EarthquakeDataStatus.Ok;
const STATUS_STALE: string = EarthquakeDataStatus.Stale;
const STATUS_UNAVAILABLE: string = EarthquakeDataStatus.Unavailable;

function upsertRow(overrides: Partial<EarthquakeEventUpsert> = {}): EarthquakeEventUpsert {
  return {
    providerEventId: '900001',
    occurredAtUtc: new Date(NOW - MS_PER_HOUR),
    latitude: 38.05222,
    longitude: 36.63111,
    depthKm: 6.95,
    magnitude: 4.2,
    magnitudeType: MagnitudeType.Ml,
    magnitudeTypeRaw: 'ML',
    providerCountry: 'Türkiye',
    providerProvince: 'Kahramanmaraş',
    providerDistrict: 'Göksun',
    providerLocationRaw: 'Göksun (Kahramanmaraş)',
    placeNameTr: 'Göksun (Kahramanmaraş)',
    bindingKind: EarthquakeBindingKind.Inside,
    bindingPlateCode: PLATE_KAHRAMANMARAS,
    bindingDistanceKm: null,
    inScope: true,
    isRevised: false,
    providerUpdatedAtUtc: null,
    ...overrides,
  };
}

describe('Earthquake public endpoints (e2e, real Postgres)', () => {
  let container: StartedPostgreSqlContainer;
  let dataSource: DataSource;
  let store: EarthquakeIngestStore;
  let app: INestApplication;
  let fetchSpy: jest.SpiedFunction<typeof fetch>;

  const events = () => dataSource.getRepository(EarthquakeEvent);
  const runs = () => dataSource.getRepository(EarthquakeIngestRun);

  /** Record a finished tour with the given outcome and finish time. */
  async function recordRun(outcome: 'ok' | 'transient', finishedAtUtc: Date): Promise<void> {
    await store.recordRun({
      jobKind: EarthquakeIngestJobKind.Recent,
      startedAtUtc: new Date(finishedAtUtc.getTime() - 1_000),
      finishedAtUtc,
      outcome,
      windowStartUtc: new Date(finishedAtUtc.getTime() - 6 * MS_PER_HOUR),
      windowEndUtc: finishedAtUtc,
      fetchedCount: 1,
      insertedCount: 1,
      updatedCount: 0,
      skippedOutOfScopeCount: 0,
      errorReason: null,
    });
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
    store = new EarthquakeIngestStore(dataSource);

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const appModule = require('../src/app.module') as typeof import('../src/app.module');
    const moduleRef = await Test.createTestingModule({ imports: [appModule.AppModule] }).compile();
    app = moduleRef.createNestApplication();
    applyGlobalPrefix(app);
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
  }, 300_000);

  beforeEach(() => {
    fetchSpy = jest.spyOn(globalThis, 'fetch');
    fetchSpy.mockClear();
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  afterAll(async () => {
    await app.close();
    if (dataSource.isInitialized) await dataSource.destroy();
    await container.stop();
  });

  describe('phase 0 — cold store (no events, no runs)', () => {
    it('answers 200 with an empty list, unavailable and no-store on the hub', async () => {
      const response = await request(app.getHttpServer()).get('/api/earthquakes').expect(200);
      const body = response.body as ListBody;

      expect(body.items).toEqual([]);
      expect(body.total).toBe(0);
      expect(body.hasMore).toBe(false);
      expect(body.meta.dataStatus).toBe(STATUS_UNAVAILABLE);
      expect(body.meta.dataUpdatedAtUtc).toBeNull();
      expect(body.meta.latestEventAtUtc).toBeNull();
      expect(response.headers['cache-control']).toBe('no-store');
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('still carries the attribution — a cold response publishes it too', async () => {
      const response = await request(app.getHttpServer()).get('/api/earthquakes').expect(200);
      const body = response.body as ListBody;

      expect(body.meta.attributions).toHaveLength(1);
      const [attribution] = body.meta.attributions;
      expect(attribution?.providerId).toBe('afad');
      expect(attribution?.requiredNoticeTr).toContain('AFAD');
      expect(attribution?.regulationReference).toContain('29459');
      expect(attribution?.licenceUrl).toBeNull();
    });

    it('answers the same way on the province path and on meta', async () => {
      const province = await request(app.getHttpServer())
        .get(`/api/earthquakes/provinces/${PLATE_ANKARA}`)
        .expect(200);
      expect((province.body as ListBody).meta.dataStatus).toBe(STATUS_UNAVAILABLE);
      expect(province.headers['cache-control']).toBe('no-store');

      const meta = await request(app.getHttpServer()).get('/api/earthquakes/meta').expect(200);
      const body = meta.body as MetaBody;
      expect(body.dataStatus).toBe(STATUS_UNAVAILABLE);
      expect(body.attributions).toHaveLength(1);
      expect(meta.headers['cache-control']).toBe('no-store');
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe('phase 1 — warm store', () => {
    beforeAll(async () => {
      const writtenAt = new Date();
      // Four servable rows, deliberately spread across magnitude, province and time, plus two that
      // must never be served.
      await store.upsertEvent(
        upsertRow({ providerEventId: '900001', occurredAtUtc: new Date(NOW - 1 * MS_PER_HOUR) }),
        writtenAt,
      );
      await store.upsertEvent(
        upsertRow({
          providerEventId: '900002',
          occurredAtUtc: new Date(NOW - 2 * MS_PER_HOUR),
          magnitude: 1.4,
        }),
        writtenAt,
      );
      await store.upsertEvent(
        upsertRow({
          providerEventId: '900003',
          occurredAtUtc: new Date(NOW - 3 * MS_PER_HOUR),
          bindingPlateCode: PLATE_ANKARA,
          bindingKind: EarthquakeBindingKind.AcrossBorder,
          providerCountry: 'İran',
        }),
        writtenAt,
      );
      // Older than the default 7-day window: inside the store, outside the default list.
      await store.upsertEvent(
        upsertRow({
          providerEventId: '900004',
          occurredAtUtc: new Date(NOW - 30 * MS_PER_DAY),
        }),
        writtenAt,
      );
      // Out of scope: stored (D-C keeps everything) and servable nowhere.
      await store.upsertEvent(
        upsertRow({
          providerEventId: '900005',
          occurredAtUtc: new Date(NOW - 30 * 60_000),
          magnitude: 6.6,
          inScope: false,
        }),
        writtenAt,
      );
      // Out of scope AND bound to a province, so the province path is covered by the same guard.
      await store.upsertEvent(
        upsertRow({
          providerEventId: '900006',
          occurredAtUtc: new Date(NOW - 31 * 60_000),
          magnitude: 6.5,
          bindingPlateCode: PLATE_ANKARA,
          inScope: false,
        }),
        writtenAt,
      );

      await recordRun('ok', new Date(NOW - 60_000));
    });

    it('serves the SPEC cache-control string, byte for byte', async () => {
      const hub = await request(app.getHttpServer()).get('/api/earthquakes').expect(200);
      expect(hub.headers['cache-control']).toBe(LIST_CACHE_CONTROL);

      const province = await request(app.getHttpServer())
        .get(`/api/earthquakes/provinces/${PLATE_KAHRAMANMARAS}`)
        .expect(200);
      expect(province.headers['cache-control']).toBe(LIST_CACHE_CONTROL);

      const meta = await request(app.getHttpServer()).get('/api/earthquakes/meta').expect(200);
      expect(meta.headers['cache-control']).toBe(META_CACHE_CONTROL);
    });

    it('carries exactly the core five plus meta at the top level', async () => {
      const response = await request(app.getHttpServer()).get('/api/earthquakes').expect(200);
      expect(Object.keys(response.body as ListBody).sort()).toEqual([
        'hasMore',
        'items',
        'meta',
        'page',
        'pageSize',
        'total',
      ]);
    });

    it('applies the 2.5 default floor and echoes the filter it actually applied', async () => {
      const response = await request(app.getHttpServer()).get('/api/earthquakes').expect(200);
      const body = response.body as ListBody;

      // 900002 is below the floor, 900004 is outside the default window, 900005/900006 are out of
      // scope: two rows remain.
      expect(body.items.map((item) => item.providerEventId)).toEqual(['900001', '900003']);
      expect(body.total).toBe(2);
      expect(body.meta.filter.minMagnitude).toBe(EARTHQUAKE_DEFAULT_MIN_MAGNITUDE);
      expect(body.meta.filter.plateCode).toBeNull();

      // The defaulted window is echoed as concrete instants, exactly 7 days wide.
      const from = Date.parse(body.meta.filter.fromUtc);
      const to = Date.parse(body.meta.filter.toUtc);
      expect(to - from).toBe(EARTHQUAKE_DEFAULT_WINDOW_DAYS * MS_PER_DAY);
      expect(body.meta.dataStatus).toBe(STATUS_OK);
    });

    it('lowers the floor when asked — the threshold is display-time, not ingest-time', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/earthquakes')
        .query({ minMagnitude: 0 })
        .expect(200);
      const body = response.body as ListBody;

      expect(body.items.map((item) => item.providerEventId)).toEqual([
        '900001',
        '900002',
        '900003',
      ]);
      expect(body.meta.filter.minMagnitude).toBe(0);
    });

    it('reaches the older row only through a wider window', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/earthquakes')
        .query({ fromUtc: new Date(NOW - 60 * MS_PER_DAY).toISOString() })
        .expect(200);

      expect((response.body as ListBody).items.map((item) => item.providerEventId)).toContain(
        '900004',
      );
    });

    it('never serves an out-of-scope row — not in items, not in total, not in freshness', async () => {
      const hub = await request(app.getHttpServer())
        .get('/api/earthquakes')
        .query({ minMagnitude: 0 })
        .expect(200);
      const hubBody = hub.body as ListBody;
      expect(hubBody.items.map((item) => item.providerEventId)).not.toContain('900005');
      expect(hubBody.total).toBe(3);

      // The out-of-scope rows are the NEWEST rows in the table, so a freshness probe that ignored
      // `in_scope` would publish one of their timestamps here.
      const newestServable = new Date(NOW - MS_PER_HOUR).toISOString();
      expect(hubBody.meta.latestEventAtUtc).toBe(newestServable);

      const province = await request(app.getHttpServer())
        .get(`/api/earthquakes/provinces/${PLATE_ANKARA}`)
        .query({ minMagnitude: 0 })
        .expect(200);
      const provinceBody = province.body as ListBody;
      expect(provinceBody.items.map((item) => item.providerEventId)).toEqual(['900003']);
      expect(provinceBody.total).toBe(1);

      // …and the guard is real: both hidden rows ARE in the table.
      expect(await events().count()).toBe(6);
    });

    it('filters the province path by plate code and echoes it', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/earthquakes/provinces/${PLATE_KAHRAMANMARAS}`)
        .query({ minMagnitude: 0 })
        .expect(200);
      const body = response.body as ListBody;

      expect(body.items.every((item) => item.bindingPlateCode === PLATE_KAHRAMANMARAS)).toBe(true);
      expect(body.meta.filter.plateCode).toBe(PLATE_KAHRAMANMARAS);
    });

    it('serves an across-border event on the province page, labelled', async () => {
      // The province section shows it; the LABEL is what stops it reading as "an earthquake in
      // Ankara". Dropping it instead would hide a real event from the page it is nearest to.
      const response = await request(app.getHttpServer())
        .get(`/api/earthquakes/provinces/${PLATE_ANKARA}`)
        .expect(200);
      const [item] = (response.body as ListBody).items;

      expect(item?.providerEventId).toBe('900003');
      expect(item?.bindingKind).toBe(EarthquakeBindingKind.AcrossBorder);
    });

    it('orders newest first and ends every timestamp in Z', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/earthquakes')
        .query({ minMagnitude: 0 })
        .expect(200);
      const body = response.body as ListBody;

      const times = body.items.map((item) => Date.parse(item.occurredAtUtc));
      expect(times).toEqual([...times].sort((a, b) => b - a));
      for (const item of body.items) {
        expect(item.occurredAtUtc).toMatch(/Z$/);
      }
    });

    it('pages without repeating a row, and a page past the end is an empty 200', async () => {
      const first = await request(app.getHttpServer())
        .get('/api/earthquakes')
        .query({ minMagnitude: 0, pageSize: 2, page: 1 })
        .expect(200);
      const second = await request(app.getHttpServer())
        .get('/api/earthquakes')
        .query({ minMagnitude: 0, pageSize: 2, page: 2 })
        .expect(200);

      const firstIds = (first.body as ListBody).items.map((item) => item.providerEventId);
      const secondIds = (second.body as ListBody).items.map((item) => item.providerEventId);

      expect(firstIds).toHaveLength(2);
      expect((first.body as ListBody).hasMore).toBe(true);
      expect(secondIds).toHaveLength(1);
      expect((second.body as ListBody).hasMore).toBe(false);
      expect(firstIds.filter((id) => secondIds.includes(id))).toEqual([]);

      const past = await request(app.getHttpServer())
        .get('/api/earthquakes')
        .query({ minMagnitude: 0, pageSize: 2, page: 50 })
        .expect(200);
      expect((past.body as ListBody).items).toEqual([]);
      expect((past.body as ListBody).hasMore).toBe(false);
      expect((past.body as ListBody).total).toBe(3);
    });

    it('breaks ties on providerEventId, so equal timestamps cannot repeat across pages', async () => {
      // Three rows sharing ONE origin time: without the tie-break, Postgres may order them
      // differently per query and a row lands on both pages.
      const sameInstant = new Date(NOW - 90 * 60_000);
      const writtenAt = new Date();
      for (const id of ['910001', '910002', '910003']) {
        await store.upsertEvent(
          upsertRow({ providerEventId: id, occurredAtUtc: sameInstant, magnitude: 5.1 }),
          writtenAt,
        );
      }

      const seen: string[] = [];
      for (const page of [1, 2, 3]) {
        const response = await request(app.getHttpServer())
          .get('/api/earthquakes')
          .query({ minMagnitude: 5, pageSize: 1, page })
          .expect(200);
        seen.push(...(response.body as ListBody).items.map((item) => item.providerEventId));
      }

      expect(seen).toEqual(['910003', '910002', '910001']);
      expect(new Set(seen).size).toBe(3);
    });

    it('returns 200 with an empty list when the filter matches nothing — not a cold response', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/earthquakes')
        .query({ minMagnitude: 9 })
        .expect(200);
      const body = response.body as ListBody;

      expect(body.items).toEqual([]);
      expect(body.total).toBe(0);
      // The distinction the two empty states turn on: this store HAS data.
      expect(body.meta.dataStatus).toBe(STATUS_OK);
      expect(response.headers['cache-control']).toBe(LIST_CACHE_CONTROL);
    });

    it('serves the meta endpoint from constants plus freshness', async () => {
      const response = await request(app.getHttpServer()).get('/api/earthquakes/meta').expect(200);
      const body = response.body as MetaBody;

      expect(body.minMagnitudeDefault).toBe(EARTHQUAKE_DEFAULT_MIN_MAGNITUDE);
      expect(body.defaultWindowDays).toBe(EARTHQUAKE_DEFAULT_WINDOW_DAYS);
      expect(body.maxWindowDays).toBe(EARTHQUAKE_MAX_WINDOW_DAYS);
      expect(body.scopeBufferKm).toBeGreaterThan(0);
      expect(body.dataStatus).toBe(STATUS_OK);
      expect(body.attributions).toHaveLength(1);
      // E4 adds `disclaimerTr` with its approved text; E3 ships without it deliberately.
      expect(body).not.toHaveProperty('disclaimerTr');
    });

    it('makes no external call on any endpoint, in any state', async () => {
      await request(app.getHttpServer()).get('/api/earthquakes').expect(200);
      await request(app.getHttpServer())
        .get(`/api/earthquakes/provinces/${PLATE_ANKARA}`)
        .expect(200);
      await request(app.getHttpServer()).get('/api/earthquakes/meta').expect(200);
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe('phase 2 — the error matrix (SPEC §12)', () => {
    it('404s a well-formed plate code that names no province', async () => {
      await request(app.getHttpServer())
        .get(`/api/earthquakes/provinces/${PLATE_UNASSIGNED}`)
        .expect(404);
    });

    it('400s a malformed plate code — a different answer from 404 on purpose', async () => {
      await request(app.getHttpServer()).get('/api/earthquakes/provinces/6').expect(400);
      await request(app.getHttpServer()).get('/api/earthquakes/provinces/abc').expect(400);
    });

    it('400s an unknown query parameter rather than ignoring it', async () => {
      await request(app.getHttpServer())
        .get('/api/earthquakes')
        .query({ utm_source: 'x' })
        .expect(400);
    });

    it('400s a page size past the published ceiling, and accepts the ceiling itself', async () => {
      await request(app.getHttpServer())
        .get('/api/earthquakes')
        .query({ pageSize: EARTHQUAKE_LIST_MAX_PAGE_SIZE + 1 })
        .expect(400);
      await request(app.getHttpServer())
        .get('/api/earthquakes')
        .query({ pageSize: EARTHQUAKE_LIST_MAX_PAGE_SIZE })
        .expect(200);
    });

    it('400s a page past the published ceiling, and a page below 1', async () => {
      await request(app.getHttpServer())
        .get('/api/earthquakes')
        .query({ page: EARTHQUAKE_LIST_MAX_PAGE + 1 })
        .expect(400);
      await request(app.getHttpServer()).get('/api/earthquakes').query({ page: 0 }).expect(400);
      await request(app.getHttpServer()).get('/api/earthquakes').query({ page: 1.5 }).expect(400);
    });

    it('400s a magnitude outside the published range and a non-numeric one', async () => {
      await request(app.getHttpServer())
        .get('/api/earthquakes')
        .query({ minMagnitude: 11 })
        .expect(400);
      await request(app.getHttpServer())
        .get('/api/earthquakes')
        .query({ minMagnitude: 'abc' })
        .expect(400);
    });

    it('400s a timezone-less instant — the three-hour trap, refused at the boundary', async () => {
      await request(app.getHttpServer())
        .get('/api/earthquakes')
        .query({ fromUtc: '2026-08-10T10:07:59' })
        .expect(400);
      await request(app.getHttpServer())
        .get('/api/earthquakes')
        .query({ fromUtc: '2026-08-10' })
        .expect(400);

      // The same instant WITH a zone is accepted, so the rule is about the zone and not the shape.
      await request(app.getHttpServer())
        .get('/api/earthquakes')
        .query({ fromUtc: '2026-08-10T10:07:59Z' })
        .expect(200);
      await request(app.getHttpServer())
        .get('/api/earthquakes')
        .query({ fromUtc: '2026-08-10T13:07:59+03:00' })
        .expect(200);
    });

    it('400s an inverted window and one wider than the ceiling', async () => {
      await request(app.getHttpServer())
        .get('/api/earthquakes')
        .query({
          fromUtc: new Date(NOW).toISOString(),
          toUtc: new Date(NOW - MS_PER_DAY).toISOString(),
        })
        .expect(400);

      await request(app.getHttpServer())
        .get('/api/earthquakes')
        .query({
          fromUtc: new Date(NOW - (EARTHQUAKE_MAX_WINDOW_DAYS + 1) * MS_PER_DAY).toISOString(),
          toUtc: new Date(NOW).toISOString(),
        })
        .expect(400);

      // Exactly the ceiling is allowed — the boundary belongs to the accepting side.
      await request(app.getHttpServer())
        .get('/api/earthquakes')
        .query({
          fromUtc: new Date(NOW - EARTHQUAKE_MAX_WINDOW_DAYS * MS_PER_DAY).toISOString(),
          toUtc: new Date(NOW).toISOString(),
        })
        .expect(200);
    });
  });

  describe('phase 3 — freshness states', () => {
    it('publishes stale — and keeps serving — when the newest success is old', async () => {
      await runs().clear();
      await recordRun('ok', new Date(NOW - 5 * MS_PER_HOUR));

      const response = await request(app.getHttpServer()).get('/api/earthquakes').expect(200);
      const body = response.body as ListBody;

      expect(body.meta.dataStatus).toBe(STATUS_STALE);
      expect(body.items.length).toBeGreaterThan(0);
      expect(body.meta.dataUpdatedAtUtc).not.toBeNull();
      // Stale data is SHOWN with its age, never hidden and never uncached.
      expect(response.headers['cache-control']).toBe(LIST_CACHE_CONTROL);
    });

    it('ignores failed tours when deciding freshness', async () => {
      await runs().clear();
      await recordRun('transient', new Date(NOW - 30_000));

      const response = await request(app.getHttpServer()).get('/api/earthquakes').expect(200);
      const body = response.body as ListBody;

      // A recent FAILURE is not a recent success: with rows in the store and no successful tour
      // behind them the honest answer is stale.
      expect(body.meta.dataStatus).toBe(STATUS_STALE);
      expect(body.meta.dataUpdatedAtUtc).toBeNull();
    });

    it('reads a filled store with NO run ledger as stale, never unavailable', async () => {
      // The state the hand-run backfill leaves behind: tens of thousands of real rows and an empty
      // ledger (`FU-E2-BACKFILL-RUNROW`). Deriving from the ledger alone would stamp a full list
      // `unavailable` and answer `no-store`.
      await runs().clear();

      const response = await request(app.getHttpServer()).get('/api/earthquakes').expect(200);
      const body = response.body as ListBody;

      expect(body.meta.dataStatus).toBe(STATUS_STALE);
      expect(body.items.length).toBeGreaterThan(0);
      expect(body.meta.dataUpdatedAtUtc).toBeNull();
      expect(body.meta.latestEventAtUtc).not.toBeNull();
      expect(response.headers['cache-control']).toBe(LIST_CACHE_CONTROL);

      const meta = await request(app.getHttpServer()).get('/api/earthquakes/meta').expect(200);
      expect((meta.body as MetaBody).dataStatus).toBe(STATUS_STALE);
    });

    it('returns to unavailable only when nothing is servable at all', async () => {
      await runs().clear();
      await events().clear();

      const response = await request(app.getHttpServer()).get('/api/earthquakes').expect(200);
      const body = response.body as ListBody;

      expect(body.meta.dataStatus).toBe(STATUS_UNAVAILABLE);
      expect(body.items).toEqual([]);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(body.meta.attributions).toHaveLength(1);
    });
  });
});
