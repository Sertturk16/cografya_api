import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NextFunction, Request, Response } from 'express';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { applyGlobalPrefix } from '../src/common/bootstrap';
import { INTERNAL_REQUEST_HEADER } from '../src/common/throttler/trusted-client';
import { buildDataSourceOptions } from '../src/database/data-source-options';
import { CircuitBreaker } from '../src/upstream/circuit-breaker';
import {
  ELEVATION_BBOX_MAX_LAT,
  ELEVATION_BBOX_MIN_LON,
  ELEVATION_PROFILE_SAMPLE_COUNT,
} from '../src/elevation/elevation.types';
import {
  TERRAIN_TILES_EXPLANATION_TR,
  TERRAIN_TILES_METHOD_NOTE_EN,
  TERRAIN_TILES_METHOD_NOTE_TR,
  TERRAIN_TILES_NAVIGATION_LIMIT_EN,
  TERRAIN_TILES_REQUIRED_NOTICES_EN,
} from '../src/elevation/elevation-attribution.constant';
import { IMAGERY_SOURCES_HEADER } from '../src/elevation/terrain/tile.client';
import { buildTerrariumTilePng } from '../src/elevation/terrain/terrarium-fixture.builder';
import { TERRAIN_SAMPLE_ZOOM } from '../src/elevation/terrain/tile-math';

/**
 * Elevation profile e2e — against a REAL Postgres (Testcontainers) and a FAKE tile bucket (a
 * local HTTP server serving generated terrarium PNGs).
 *
 * **Zero real network by construction**: a counting fetch wrapper forwards ONLY to the fake
 * server and rejects — and records — anything else, so "no test traffic reached AWS" is a
 * property of the harness rather than a promise.
 *
 * The checks, in suite order:
 *  A. a valid line → 200, a COMPLETE profile, the long `Cache-Control`, the full licence block;
 *  B. the SAME line again → ZERO further upstream calls (the cache proof), and an unquantised
 *     repeat of it lands on the same entry;
 *  C. the 400 table: outside the frame, blank, missing, unknown parameter, collapsing endpoints;
 *  D. provider down → 200 with `dataAvailable:false` and `no-store`, never a 5xx;
 *  E. the imagery-source TRIPWIRE: a tile carrying a sea-depth source does not get drawn;
 *  F. the route's own rate limit, exercised anonymously;
 *  G. `ELEVATION_ENABLED=false` → 404, and not one upstream call on that path.
 *
 * Structural throughout (`CONVENTIONS.md` §2): statuses, counts, shapes and invariants. The
 * fixture elevations are arbitrary constants and are never asserted as facts about Türkiye.
 */

const TEST_INTERNAL_TOKEN = 'e2e-trusted-client-token-0123456789-abcdefgh';

/**
 * A request marked with this header does NOT get the trusted-client token injected.
 *
 * The suite otherwise presents the token on every call so the global throttle cannot make an
 * unrelated case flaky. But then the route's OWN limit is unobservable, because the exemption
 * skips it too — so phase F opts out per request instead of the suite giving up on the check.
 */
const ANONYMOUS_MARKER = 'x-e2e-anonymous';

const LONG_CACHE_CONTROL = 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800';

/** Built once: deflating a 256×256 fixture per request would dominate the suite's runtime. */
const FLAT_TILE_PNG = buildTerrariumTilePng(() => 640);

/** What the fake bucket does next. Phases flip these. */
interface FakeState {
  mode: 'ok' | 'down';
  imagerySources: string;
}

describe('Elevation profile (e2e)', () => {
  let container: StartedPostgreSqlContainer;
  let dataSource: DataSource;
  let app: INestApplication;
  let fake: Server;
  let fakeBase: string;

  const state: FakeState = { mode: 'ok', imagerySources: 'eudem/eudem_dem_5deg_n35e030.tif' };

  /** Every tile URL the wrapper saw, and every destination it refused. */
  let tileCalls: string[] = [];
  const foreignCalls: string[] = [];
  const realFetch = globalThis.fetch;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
    const url = container.getConnectionUri();

    fake = createServer((req, res) => {
      if (state.mode === 'down') {
        res.writeHead(503, { 'content-type': 'text/plain' });
        res.end('the bucket is unavailable');
        return;
      }
      res.writeHead(200, {
        'content-type': 'image/png',
        [IMAGERY_SOURCES_HEADER]: state.imagerySources,
      });
      res.end(Buffer.from(FLAT_TILE_PNG));
    });
    await new Promise<void>((resolve) => fake.listen(0, '127.0.0.1', resolve));
    const address = fake.address();
    if (address === null || typeof address === 'string') throw new Error('fake server address');
    fakeBase = `http://127.0.0.1:${String(address.port)}`;

    process.env.DATABASE_URL = url;
    process.env.WEB_ORIGIN = 'http://localhost:3000';
    process.env.INTERNAL_REQUEST_TOKEN = TEST_INTERNAL_TOKEN;
    process.env.ELEVATION_ENABLED = 'true';
    process.env.ELEVATION_BASE_URL = fakeBase;
    // A short error TTL so phase E's refusal cannot shadow anything later in the suite.
    process.env.ELEVATION_ERROR_TTL_SECONDS = '1';
    process.env.ELEVATION_SCHEMA_ERROR_TTL_SECONDS = '1';

    // Installed BEFORE the app exists: fake-server calls pass through and are tallied, anything
    // else is refused and recorded.
    globalThis.fetch = (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      const target =
        typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (target.startsWith(fakeBase)) {
        tileCalls.push(target);
        return realFetch(input, init);
      }
      foreignCalls.push(target);
      return Promise.reject(new Error(`non-fake upstream call attempted: ${target}`));
    };

    dataSource = new DataSource(buildDataSourceOptions(url));
    await dataSource.initialize();
    await dataSource.runMigrations();

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { AppModule } = require('../src/app.module') as typeof import('../src/app.module');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    applyGlobalPrefix(app);
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.use((req: Request, _res: Response, next: NextFunction) => {
      if (req.headers[ANONYMOUS_MARKER] === undefined) {
        req.headers[INTERNAL_REQUEST_HEADER] = TEST_INTERNAL_TOKEN;
      }
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

  /**
   * A healthy circuit before every case.
   *
   * The degraded phases below deliberately produce more consecutive failures than the breaker's
   * threshold, which then refuses calls for a minute — so without this reset the FIRST healthy
   * assertion after a degraded one would fail for a reason that has nothing to do with what it
   * asserts, and would keep failing for as long as the suite is fast. Resetting is honest here
   * precisely because each case is an independent structural check, not a simulation of one long
   * production hour.
   */
  beforeEach(() => {
    app.get(CircuitBreaker).resetForTest();
  });

  const http = () => request(app.getHttpServer());
  const profile = (query: string) => http().get(`/api/elevation/profile?${query}`);

  /** A short line well inside the frame — few tiles, so the suite stays fast. */
  const SHORT_LINE = 'fromLat=39.920&fromLon=32.854&toLat=39.960&toLon=32.930';

  describe('phase A — a valid line', () => {
    it('answers 200 with a COMPLETE profile and the long Cache-Control', async () => {
      tileCalls = [];
      const res = await profile(SHORT_LINE).expect(200);
      const body = res.body as Record<string, unknown>;

      expect(body.sampleCount).toBe(ELEVATION_PROFILE_SAMPLE_COUNT);
      expect(body.sampleZoom).toBe(TERRAIN_SAMPLE_ZOOM);
      expect(body.resolvedSampleCount).toBe(ELEVATION_PROFILE_SAMPLE_COUNT);
      expect(body.dataAvailable).toBe(true);
      expect(res.headers['cache-control']).toBe(LONG_CACHE_CONTROL);

      // It really did go to the provider, and only to the sampling zoom.
      expect(tileCalls.length).toBeGreaterThan(0);
      for (const call of tileCalls) {
        expect(call).toContain(`/terrarium/${String(TERRAIN_SAMPLE_ZOOM)}/`);
      }
      expect(foreignCalls).toEqual([]);
    });

    it('publishes two parallel arrays of whole metres, and echoes the rounded line', async () => {
      const res = await profile(SHORT_LINE).expect(200);
      const body = res.body as {
        distancesKm: number[];
        elevationsM: (number | null)[];
        from: { latitude: number; longitude: number };
        to: { latitude: number; longitude: number };
        minElevationM: number | null;
        maxElevationM: number | null;
      };

      expect(body.distancesKm).toHaveLength(ELEVATION_PROFILE_SAMPLE_COUNT);
      expect(body.elevationsM).toHaveLength(ELEVATION_PROFILE_SAMPLE_COUNT);
      for (const value of body.elevationsM) {
        expect(value === null || Number.isInteger(value)).toBe(true);
      }
      expect(body.from).toEqual({ latitude: 39.92, longitude: 32.854 });
      expect(body.to).toEqual({ latitude: 39.96, longitude: 32.93 });
      expect(body.minElevationM).not.toBeNull();
      expect(body.maxElevationM).not.toBeNull();
    });

    it('carries the licence block: three verbatim notices plus the method and accuracy notes', async () => {
      const res = await profile(SHORT_LINE).expect(200);
      const attribution = (res.body as { attribution: Record<string, unknown> }).attribution;

      // The licence-bearing fields are compared to the constants they must carry, not merely to
      // `typeof === 'string'`: a swapped `methodNoteTr`/`methodNoteEn`, a `datasetUrl` in the
      // `licenceUrl` slot or a `requiredNoticesEn` built from the wrong array all satisfy a length
      // check and all breach the ledger's go-live obligation (review #124, TA124-I2). This is a
      // correspondence between the response and a constant in this repo, not a hardcoded fact.
      expect(attribution.requiredNoticesEn).toEqual([...TERRAIN_TILES_REQUIRED_NOTICES_EN]);
      expect(attribution.navigationLimitEn).toBe(TERRAIN_TILES_NAVIGATION_LIMIT_EN);
      expect(attribution.methodNoteTr).toBe(TERRAIN_TILES_METHOD_NOTE_TR);
      expect(attribution.methodNoteEn).toBe(TERRAIN_TILES_METHOD_NOTE_EN);
      expect(attribution.explanationTr).toBe(TERRAIN_TILES_EXPLANATION_TR);
      expect(attribution.seaDepthIncluded).toBe(false);

      for (const field of [
        'providerName',
        'datasetUrl',
        'licenceUrl',
        'accuracyNoteTr',
        'accuracyNoteEn',
      ]) {
        expect(typeof attribution[field]).toBe('string');
        expect(String(attribution[field]).length).toBeGreaterThan(0);
      }
    });
  });

  describe('phase B — the cache', () => {
    it('answers the SAME line with ZERO upstream calls', async () => {
      await profile(SHORT_LINE).expect(200);
      tileCalls = [];
      const res = await profile(SHORT_LINE).expect(200);
      expect(tileCalls).toEqual([]);
      expect((res.body as { resolvedSampleCount: number }).resolvedSampleCount).toBe(
        ELEVATION_PROFILE_SAMPLE_COUNT,
      );
    });

    it('lands an unquantised repeat of the same line on the same entry', async () => {
      // The quantisation is what makes the cache work at all: without it these two coordinates
      // are two keys and the hit rate collapses to zero.
      tileCalls = [];
      await profile('fromLat=39.9201&fromLon=32.8539&toLat=39.9604&toLon=32.9298').expect(200);
      expect(tileCalls).toEqual([]);
    });
  });

  describe('phase C — the 400 table', () => {
    it('refuses a coordinate outside the Türkiye frame', async () => {
      tileCalls = [];
      await profile(
        `fromLat=${String(ELEVATION_BBOX_MAX_LAT + 1)}&fromLon=32.854&toLat=39.96&toLon=32.93`,
      ).expect(400);
      await profile(
        `fromLat=39.92&fromLon=${String(ELEVATION_BBOX_MIN_LON - 1)}&toLat=39.96&toLon=32.93`,
      ).expect(400);
      // Refused BEFORE the provider — validation is the cheapest guard and it runs first.
      expect(tileCalls).toEqual([]);
    });

    it('refuses a missing, blank or non-numeric coordinate', async () => {
      await profile('fromLon=32.854&toLat=39.96&toLon=32.93').expect(400);
      // The blank case is the one a template emits for an unset field. It must not be read as 0,
      // which is a legal latitude and would silently profile a line nobody drew.
      await profile('fromLat=&fromLon=32.854&toLat=39.96&toLon=32.93').expect(400);
      await profile('fromLat=%20&fromLon=32.854&toLat=39.96&toLon=32.93').expect(400);
      await profile('fromLat=north&fromLon=32.854&toLat=39.96&toLon=32.93').expect(400);
    });

    it('rejects an unknown query parameter rather than ignoring it', async () => {
      await profile(`${SHORT_LINE}&utm_source=x`).expect(400);
      await profile(`${SHORT_LINE}&sampleCount=500`).expect(400);
    });

    it('refuses a line whose endpoints collapse under quantisation', async () => {
      tileCalls = [];
      await profile('fromLat=39.9201&fromLon=32.8541&toLat=39.9199&toLon=32.8539').expect(400);
      expect(tileCalls).toEqual([]);
    });
  });

  describe('phase D — the provider is down', () => {
    it('answers 200 with dataAvailable:false and no-store, never a 5xx', async () => {
      state.mode = 'down';
      try {
        const res = await profile('fromLat=38.400&fromLon=27.100&toLat=38.450&toLon=27.200').expect(
          200,
        );
        const body = res.body as { dataAvailable: boolean; resolvedSampleCount: number };
        expect(body.dataAvailable).toBe(false);
        expect(body.resolvedSampleCount).toBe(0);
        expect(res.headers['cache-control']).toBe('no-store');
      } finally {
        state.mode = 'ok';
      }
    });

    it('still carries the full licence block on the cold path', async () => {
      state.mode = 'down';
      try {
        const res = await profile('fromLat=38.500&fromLon=27.300&toLat=38.550&toLon=27.400').expect(
          200,
        );
        const attribution = (res.body as { attribution: { requiredNoticesEn: string[] } })
          .attribution;
        expect(attribution.requiredNoticesEn).toHaveLength(3);
      } finally {
        state.mode = 'ok';
      }
    });
  });

  describe('phase E — the imagery-source tripwire', () => {
    it('does not draw a profile from tiles carrying a sea-depth source', async () => {
      state.imagerySources = 'gmted/30N030E.tif, etopo1/ETOPO1_Bed_g.tif';
      try {
        const res = await profile('fromLat=37.100&fromLon=30.500&toLat=37.150&toLon=30.600').expect(
          200,
        );
        const body = res.body as { dataAvailable: boolean; resolvedSampleCount: number };
        // Refused rather than sampled: publishing this would mean drawing sea depth on a surface
        // that promises it never does, under a credit that assumes the same.
        expect(body.dataAvailable).toBe(false);
        expect(body.resolvedSampleCount).toBe(0);
        expect(res.headers['cache-control']).toBe('no-store');
      } finally {
        state.imagerySources = 'eudem/eudem_dem_5deg_n35e030.tif';
      }
    });

    it('and the same line DOES draw once the sources are the credited ones again', async () => {
      // The positive control for the case above: without it, "no profile" would also be the
      // result of the line being unreachable for some unrelated reason, and the two would be
      // indistinguishable from the assertion alone.
      const res = await profile('fromLat=37.200&fromLon=30.700&toLat=37.250&toLon=30.800').expect(
        200,
      );
      expect((res.body as { dataAvailable: boolean }).dataAvailable).toBe(true);
    });
  });

  describe('phase F — the route’s own rate limit', () => {
    it('answers 429 to an anonymous caller past the per-route ceiling', async () => {
      // Anonymous on purpose: the trusted-client exemption skips throttling entirely, so a
      // suite that always presents the token cannot see this ceiling at all.
      const anonymous = () =>
        http().get(`/api/elevation/profile?${SHORT_LINE}`).set(ANONYMOUS_MARKER, '1');

      const statuses: number[] = [];
      for (let attempt = 0; attempt < 12; attempt += 1) {
        const res = await anonymous();
        statuses.push(res.status);
      }

      expect(statuses).toContain(429);
      // And the ceiling is the ROUTE's, not the global one: the global limit is far higher, so a
      // 429 inside twelve requests can only have come from the tighter per-route ceiling.
      expect(statuses.filter((status) => status === 200).length).toBeLessThan(12);
    });
  });

  describe('phase G — ELEVATION_ENABLED=false', () => {
    let disabledApp: INestApplication;

    beforeAll(async () => {
      process.env.ELEVATION_ENABLED = 'false';
      // `ConfigModule.forRoot` validates `process.env` EAGERLY at import time, so flipping the
      // switch needs a FRESH module registry — which is exactly how a differently-configured
      // deployment boots. The marine phase-H precedent, for the same reason.
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
      process.env.ELEVATION_ENABLED = 'true';
    });

    it('answers 404 — the feature "does not exist" — and reaches no provider', async () => {
      tileCalls = [];
      await request(disabledApp.getHttpServer())
        .get(`/api/elevation/profile?fromLat=40.100&fromLon=33.100&toLat=40.200&toLon=33.200`)
        .expect(404);
      expect(tileCalls).toEqual([]);
    });

    it('and the guard runs before validation, so a bad request is also a 404', async () => {
      // Deliberate: while the feature is off there is no contract to violate, and answering 400
      // would tell a caller the path exists.
      await request(disabledApp.getHttpServer())
        .get('/api/elevation/profile?fromLat=999')
        .expect(404);
    });
  });

  it('made no request to any host but the fake bucket, for the whole suite', () => {
    expect(foreignCalls).toEqual([]);
  });
});
