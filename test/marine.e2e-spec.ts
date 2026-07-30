import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
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
import { seedGeography } from '../src/database/seeds/seed-geography';
import type { MarinePointsProbeArtifact } from '../src/database/marine/marine-artifact.types';
import { loadMarinePoints } from '../src/database/marine/load-marine-points';
import { MarinePoint } from '../src/marine/entities/marine-point.entity';
import { Province } from '../src/province/entities/province.entity';
import {
  MarineDirectionConvention,
  MarineLayerId,
  MarineUnit,
  SeaBasin,
} from '../src/marine/marine.types';

/**
 * Real-Postgres e2e for the marine M1 slice: the migration, the offline load phase, and the two
 * public endpoints.
 *
 * ## Everything here is STRUCTURAL (CONVENTIONS §2)
 * No test asserts that a particular point has a particular temperature, coordinate or name.
 * What is asserted is shape, non-nullability, uniqueness, ordering, count agreement between the
 * artifact and the served payload, and the failure paths. The FACTS — that these 30 coordinates
 * are at sea, in the right basin, and reachable in both providers' models — were established by
 * the live probe run and are recorded in `data/marine/marine-points-probe.json`; re-asserting
 * them here would be re-checking a fact in a structural test, which this repo separates on
 * purpose.
 *
 * ## Why a real database
 * Two of the properties under test only exist in Postgres: the composite
 * `UNIQUE (province_plate_code, sea_basin)` constraint — the one that has to permit a two-sea
 * province and refuse a duplicate — and the `numeric(9,6)` round-trip through the driver's
 * string representation.
 */

const COMMITTED_ARTIFACT_DIR = join(__dirname, '..', 'data', 'marine');
const TEST_INTERNAL_TOKEN = 'e2e-trusted-client-token-0123456789-abcdefgh';
/** Test-only opt-out from the trusted-client middleware below — see its comment. */
const ANONYMOUS_MARKER_HEADER = 'x-e2e-anonymous';

/** The exact Cache-Control strings SPEC-ADDENDUM §7.8 locks for these two endpoints. */
const EXPECTED_CACHE_CONTROL = {
  points: 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
  layers: 'public, max-age=1800, s-maxage=21600, stale-while-revalidate=86400',
} as const;

// NOTE: AppModule is required inside beforeAll — NOT imported at the top — because
// ConfigModule.forRoot validates the env eagerly at module-load time, so it must not load
// until DATABASE_URL points at the container.

interface ServedPoint {
  slugTr: string;
  slugEn: string;
  nameTr: string;
  nameEn: string;
  coastLabelTr: string;
  coastLabelEn: string;
  plateCode: string;
  latitude: number;
  longitude: number;
  seaBasin: SeaBasin;
  displayOrder: number;
}

interface ServedLayer {
  id: MarineLayerId;
  labelTr: string;
  labelEn: string;
  unit: MarineUnit;
  directionConvention: MarineDirectionConvention | null;
  calmThreshold: number | null;
  primarySource: string;
  fallbackSource: string | null;
  stepHours: number;
  horizonEndUtc: string | null;
  updateFrequency: string | null;
  catalogueUpdatedAtUtc: string | null;
  colorStops: { value: number; hex: string }[];
  attributionId: string;
}

describe('Marine (e2e)', () => {
  let container: StartedPostgreSqlContainer;
  let dataSource: DataSource;
  let app: INestApplication;
  let artifact: MarinePointsProbeArtifact;
  let firstLoad: Awaited<ReturnType<typeof loadMarinePoints>>;
  let secondLoad: Awaited<ReturnType<typeof loadMarinePoints>>;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
    const url = container.getConnectionUri();

    process.env.DATABASE_URL = url;
    process.env.WEB_ORIGIN = 'http://localhost:3000';
    process.env.INTERNAL_REQUEST_TOKEN = TEST_INTERNAL_TOKEN;

    dataSource = new DataSource(buildDataSourceOptions(url));
    await dataSource.initialize();
    await dataSource.runMigrations();
    // Provinces first: the load phase's MAPPING check resolves every plate code against a
    // seeded province row and fails if one is missing.
    await seedGeography(dataSource);

    // Load the COMMITTED artifact — the file that will really be deployed, not a fixture built
    // in the test. This is the only check that can catch an artifact which is valid in the
    // abstract but wrong on disk (a hand-edit, a bad merge, a partial regeneration).
    firstLoad = await loadMarinePoints(dataSource, { inputDir: COMMITTED_ARTIFACT_DIR });
    secondLoad = await loadMarinePoints(dataSource, { inputDir: COMMITTED_ARTIFACT_DIR });

    artifact = JSON.parse(
      await readFile(join(COMMITTED_ARTIFACT_DIR, 'marine-points-probe.json'), 'utf8'),
    ) as MarinePointsProbeArtifact;

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { AppModule } = require('../src/app.module') as typeof import('../src/app.module');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    applyGlobalPrefix(app);
    // Present the internal token exactly as the web SSG build does, so the REAL throttle
    // exemption path is exercised rather than a stubbed limiter (the province suite's precedent).
    //
    // A request may OPT OUT with `x-e2e-anonymous`, which is what makes the "no authentication
    // needed" test below mean something: stamping the trusted-client token on every request left
    // that test unable to exercise an anonymous caller at all, so it asserted nothing about the
    // path real CDN and browser traffic actually take.
    app.use((req: Request, _res: Response, next: NextFunction) => {
      if (req.headers[ANONYMOUS_MARKER_HEADER] === undefined) {
        req.headers[INTERNAL_REQUEST_HEADER] = TEST_INTERNAL_TOKEN;
      }
      next();
    });
    await app.init();
  }, 240_000);

  afterAll(async () => {
    await app?.close();
    await dataSource?.destroy();
    await container?.stop();
  });

  describe('load phase', () => {
    it('inserts every point of the committed artifact', () => {
      expect(firstLoad.inserted).toBe(artifact.entries.length);
      expect(firstLoad.updated).toBe(0);
      expect(firstLoad.removed).toBe(0);
    });

    it('is idempotent — a re-run writes nothing and moves no updated_at', async () => {
      // `updated_at` is what a future `dateModified`/sitemap `lastmod` would be built from, so
      // "no-op means no write" is a publishing-honesty rule here, not an optimisation.
      expect(secondLoad).toEqual({
        inserted: 0,
        updated: 0,
        unchanged: artifact.entries.length,
        removed: 0,
      });

      const rows = await dataSource.getRepository(MarinePoint).find();
      const before = rows.map((row) => row.updatedAt.toISOString());
      await loadMarinePoints(dataSource, { inputDir: COMMITTED_ARTIFACT_DIR });
      const after = (await dataSource.getRepository(MarinePoint).find()).map((row) =>
        row.updatedAt.toISOString(),
      );
      expect(after).toEqual(before);
    });

    it('stores every structural field non-null, with coordinates surviving the numeric round-trip', async () => {
      const rows = await dataSource.getRepository(MarinePoint).find();
      expect(rows).toHaveLength(artifact.entries.length);

      for (const row of rows) {
        for (const value of [
          row.slugTr,
          row.slugEn,
          row.nameTr,
          row.nameEn,
          row.coastLabelTr,
          row.coastLabelEn,
          row.provincePlateCode,
          row.seaBasin,
        ]) {
          expect(typeof value).toBe('string');
          expect(value.length).toBeGreaterThan(0);
        }
        // `numeric` comes back from the pg driver as a STRING; the entity transformer is what
        // makes these numbers, and a regression there would silently serve "40.850000".
        expect(typeof row.latitude).toBe('number');
        expect(typeof row.longitude).toBe('number');
        expect(Number.isInteger(row.displayOrder)).toBe(true);
        // Every point is off the Turkish coast — a coarse box, asserting placement is sane
        // rather than asserting any specific coordinate.
        expect(row.latitude).toBeGreaterThan(35);
        expect(row.latitude).toBeLessThan(44);
        expect(row.longitude).toBeGreaterThan(24);
        expect(row.longitude).toBeLessThan(43);
      }
    });

    it('keeps slugs and (province, basin) pairs unique, and display order a dense sequence', async () => {
      const rows = await dataSource.getRepository(MarinePoint).find();

      expect(new Set(rows.map((row) => row.slugTr)).size).toBe(rows.length);
      expect(new Set(rows.map((row) => row.slugEn)).size).toBe(rows.length);
      expect(new Set(rows.map((row) => `${row.provincePlateCode}:${row.seaBasin}`)).size).toBe(
        rows.length,
      );

      const orders = rows.map((row) => row.displayOrder).sort((a, b) => a - b);
      expect(orders).toEqual(Array.from({ length: rows.length }, (_, index) => index + 1));
    });

    it('represents at least one province with TWO points in DIFFERENT basins', async () => {
      // The whole reason `province_plate_code` is not unique. If this ever returns zero, the
      // two-sea case has been silently dropped from the candidate list and the composite key
      // is doing nothing.
      const rows = await dataSource.getRepository(MarinePoint).find();
      const byPlate = new Map<string, MarinePoint[]>();
      for (const row of rows) {
        byPlate.set(row.provincePlateCode, [...(byPlate.get(row.provincePlateCode) ?? []), row]);
      }
      const multi = [...byPlate.values()].filter((bucket) => bucket.length > 1);
      expect(multi.length).toBeGreaterThan(0);
      for (const bucket of multi) {
        expect(new Set(bucket.map((row) => row.seaBasin)).size).toBe(bucket.length);
      }
    });

    // ── the UPDATE and REMOVE branches ───────────────────────────────────────
    // `loadMarinePoints` has four per-row outcomes; only insert and unchanged were ever
    // exercised, because every test loaded the same committed artifact onto a table that either
    // was empty or already matched it. `updated` and `removed` were only ever asserted to be 0,
    // so a regression in either branch — say, adding a column to `isUnchanged` but forgetting it
    // in the reassignment block — would ship silently. The coast-label round showed how easily a
    // loaded column can sit outside a gate: `isUnchanged` and the reassignment block did carry
    // `coastLabelTr`/`coastLabelEn` from the start, but the artifact STALENESS gate did not, and
    // nothing failed (review #72, silent-failure I1).
    //
    // Both cases mutate the DATABASE (the technique the MAPPING tests already use) and then load
    // the unchanged committed artifact, so the artifact on disk stays authoritative throughout.

    it('UPDATES a row that has drifted from the artifact, and restores every column', async () => {
      const repo = dataSource.getRepository(MarinePoint);
      const [target] = await repo.find({ order: { displayOrder: 'ASC' }, take: 1 });
      if (target === undefined) throw new Error('the table must hold points at this point');
      const expected = artifact.entries.find((entry) => entry.slugTr === target.slugTr);
      if (expected === undefined) throw new Error('artifact has no entry for the stored row');

      // Drift several columns at once, including the two that were outside the gates.
      await dataSource.query(
        `UPDATE marine_points
         SET name_tr = $1, coast_label_tr = $2, coast_label_en = $3, display_order = $4,
             latitude = $5
         WHERE slug_tr = $6`,
        ['Yanlış Ad', 'yanlış etiket', 'wrong label', 4242, 1.5, target.slugTr],
      );

      const result = await loadMarinePoints(dataSource, { inputDir: COMMITTED_ARTIFACT_DIR });
      expect(result.updated).toBe(1);
      expect(result.inserted).toBe(0);
      expect(result.removed).toBe(0);
      expect(result.unchanged).toBe(artifact.entries.length - 1);

      const restored = await repo.findOneByOrFail({ slugTr: target.slugTr });
      expect(restored.nameTr).toBe(expected.nameTr);
      expect(restored.coastLabelTr).toBe(expected.coastLabelTr);
      expect(restored.coastLabelEn).toBe(expected.coastLabelEn);
      expect(restored.displayOrder).toBe(expected.displayOrder);
      expect(restored.latitude).toBe(expected.latitude);
    });

    it('REMOVES a stored row the artifact no longer contains', async () => {
      const repo = dataSource.getRepository(MarinePoint);
      // A synthetic row in a (province, basin) slot the artifact does not use, so it can be
      // inserted without colliding with the composite unique key.
      const orphan = await repo.save(
        repo.create({
          slugTr: 'e2e-orphan-tr',
          slugEn: 'e2e-orphan-en',
          nameTr: 'Artık Yok',
          nameEn: 'No Longer Present',
          coastLabelTr: 'Test',
          coastLabelEn: 'Test',
          provincePlateCode: '06', // Ankara — landlocked, so never a marine point
          seaBasin: SeaBasin.BlackSea,
          latitude: 41.0,
          longitude: 33.0,
          displayOrder: 9100,
        }),
      );

      const result = await loadMarinePoints(dataSource, { inputDir: COMMITTED_ARTIFACT_DIR });
      expect(result.removed).toBe(1);
      expect(result.unchanged).toBe(artifact.entries.length);
      expect(await repo.findOneBy({ id: orphan.id })).toBeNull();
    });

    it('is back to a clean no-op after the update and remove cases', async () => {
      // Guards the two tests above from leaving state that would silently change later results.
      const result = await loadMarinePoints(dataSource, { inputDir: COMMITTED_ARTIFACT_DIR });
      expect(result).toEqual({
        inserted: 0,
        updated: 0,
        unchanged: artifact.entries.length,
        removed: 0,
      });
    });
  });

  describe('the composite unique constraint', () => {
    it('REFUSES a second point for the same province in the same basin', async () => {
      const repo = dataSource.getRepository(MarinePoint);
      const [existing] = await repo.find({ order: { displayOrder: 'ASC' }, take: 1 });
      if (existing === undefined) throw new Error('the table must hold points at this point');

      await expect(
        repo.save(
          repo.create({
            slugTr: `${existing.slugTr}-duplicate`,
            slugEn: `${existing.slugEn}-duplicate`,
            nameTr: 'Duplicate',
            nameEn: 'Duplicate',
            coastLabelTr: 'Duplicate',
            coastLabelEn: 'Duplicate',
            provincePlateCode: existing.provincePlateCode,
            seaBasin: existing.seaBasin,
            latitude: existing.latitude,
            longitude: existing.longitude,
            displayOrder: 9001,
          }),
        ),
      ).rejects.toThrow();
    });

    it('REFUSES a duplicate slug at the DATABASE level', async () => {
      // The uniqueness test above observes that loaded rows happen to have distinct slugs — which
      // the load phase itself guaranteed. That says nothing about the constraint. If
      // `UQ_marine_points_slug_tr` were dropped or typo'd in a future migration edit, the
      // observed data would still look unique because the artifact never contains a duplicate.
      // So the constraint is exercised directly, like the composite one.
      const repo = dataSource.getRepository(MarinePoint);
      const [existing] = await repo.find({ order: { displayOrder: 'ASC' }, take: 1 });
      if (existing === undefined) throw new Error('the table must hold points at this point');

      await expect(
        repo.save(
          repo.create({
            slugTr: existing.slugTr, // the collision under test
            slugEn: 'e2e-distinct-slug-en',
            nameTr: 'Slug Duplicate',
            nameEn: 'Slug Duplicate',
            coastLabelTr: 'Test',
            coastLabelEn: 'Test',
            // A free (province, basin) slot, so the COMPOSITE key cannot be what rejects this.
            provincePlateCode: '06',
            seaBasin: SeaBasin.Mediterranean,
            latitude: 36.0,
            longitude: 33.0,
            displayOrder: 9200,
          }),
        ),
      ).rejects.toThrow();
    });

    it('ALLOWS a second point for the same province in a different basin', async () => {
      // Asserted explicitly because it is the property a naive `unique: true` on the plate code
      // would have destroyed — and it would have failed only for İstanbul, Çanakkale and
      // Balıkesir, i.e. late and confusingly.
      const repo = dataSource.getRepository(MarinePoint);
      const blackSea = await repo.findOneOrFail({ where: { seaBasin: SeaBasin.BlackSea } });
      const usedBasins = new Set(
        (await repo.find({ where: { provincePlateCode: blackSea.provincePlateCode } })).map(
          (row) => row.seaBasin,
        ),
      );
      const freeBasin = Object.values(SeaBasin).find((basin) => !usedBasins.has(basin));
      expect(freeBasin).toBeDefined();
      if (freeBasin === undefined) return;

      const created = await repo.save(
        repo.create({
          slugTr: 'e2e-second-basin-tr',
          slugEn: 'e2e-second-basin-en',
          nameTr: 'İkinci Havza',
          nameEn: 'Second Basin',
          coastLabelTr: 'İkinci havza',
          coastLabelEn: 'Second basin',
          provincePlateCode: blackSea.provincePlateCode,
          seaBasin: freeBasin,
          latitude: blackSea.latitude,
          longitude: blackSea.longitude,
          displayOrder: 9002,
        }),
      );
      expect(created.id).toBeDefined();
      await repo.remove(created);
    });
  });

  describe('load-phase refusals', () => {
    async function writeArtifact(dir: string, value: MarinePointsProbeArtifact): Promise<void> {
      await writeFile(join(dir, 'marine-points-probe.json'), JSON.stringify(value), 'utf8');
    }

    function clone(): MarinePointsProbeArtifact {
      return JSON.parse(JSON.stringify(artifact)) as MarinePointsProbeArtifact;
    }

    it('refuses an artifact that no longer describes the candidate table — it is STALE', async () => {
      // The gate that closes the two-phase split's own hole: edit a coordinate, forget to
      // re-probe, and without this `load` seeds the OLD artifact with every assertion still
      // passing, publishing a coordinate nobody verified.
      const dir = await mkdtemp(join(tmpdir(), 'marine-load-'));
      const tampered = clone();
      const first = tampered.entries[0];
      if (first === undefined) throw new Error('artifact has no entries');
      first.latitude += 0.5;
      await writeArtifact(dir, tampered);

      await expect(loadMarinePoints(dataSource, { inputDir: dir })).rejects.toThrow(/STALE/);
    });

    it('refuses when a province the artifact needs is MISSING from the database', async () => {
      // Exercised by changing the DATABASE, not the artifact — that is the real scenario (a
      // database seeded from an older province set, or not seeded at all). A marine point whose
      // province does not exist is a silent orphan.
      const provinceRepo = dataSource.getRepository(Province);
      const target = artifact.entries[0];
      if (target === undefined) throw new Error('artifact has no entries');
      const province = await provinceRepo.findOneByOrFail({ plateCode: target.plateCode });

      // The marine rows reference the plate as a plain column, not an FK, so the province row can
      // be removed without cascading — which is exactly why the check has to exist in code.
      await dataSource.query('DELETE FROM provinces WHERE plate_code = $1', [target.plateCode]);
      try {
        await expect(
          loadMarinePoints(dataSource, { inputDir: COMMITTED_ARTIFACT_DIR }),
        ).rejects.toThrow(/not in the database/);
      } finally {
        await dataSource.query(
          'INSERT INTO provinces (plate_code, name_tr, slug_tr, slug_en, region) VALUES ($1,$2,$3,$4,$5)',
          [province.plateCode, province.nameTr, province.slugTr, province.slugEn, province.region],
        );
      }
    });

    it('refuses when the plate code names a DIFFERENT province than the artifact was written for', async () => {
      // The MAPPING leg (DEC 2026-07-19). A one-digit plate slip does not crash anything — it
      // binds a sea to the wrong province and publishes a plausible number with every test
      // green. Only the recorded province NAME catches it.
      const target = artifact.entries[0];
      if (target === undefined) throw new Error('artifact has no entries');

      await dataSource.query('UPDATE provinces SET name_tr = $1 WHERE plate_code = $2', [
        'Bir Başka İl',
        target.plateCode,
      ]);
      try {
        await expect(
          loadMarinePoints(dataSource, { inputDir: COMMITTED_ARTIFACT_DIR }),
        ).rejects.toThrow(/the artifact was written for/);
      } finally {
        await dataSource.query('UPDATE provinces SET name_tr = $1 WHERE plate_code = $2', [
          target.provinceNameTr,
          target.plateCode,
        ]);
      }
    });

    it('refuses an artifact whose recorded verdicts were edited by hand', async () => {
      const dir = await mkdtemp(join(tmpdir(), 'marine-load-'));
      const tampered = clone();
      const first = tampered.entries[0];
      if (first === undefined) throw new Error('artifact has no entries');
      first.cmems.seaSurfaceTemperature.value = null;
      await writeArtifact(dir, tampered);

      await expect(loadMarinePoints(dataSource, { inputDir: dir })).rejects.toThrow(
        /do not match a re-derivation/,
      );
    });

    it('leaves the table untouched when it refuses', async () => {
      // Every refusal happens before the transaction opens, so a failed load must not have
      // written anything — the property the climate line had to fix the hard way.
      const rows = await dataSource.getRepository(MarinePoint).find();
      expect(rows).toHaveLength(artifact.entries.length);
    });
  });

  describe('GET /api/marine/points', () => {
    it('serves every stored point, in display order, with a CDN cache header', async () => {
      const response = await request(app.getHttpServer()).get('/api/marine/points').expect(200);

      const body = response.body as ServedPoint[];
      expect(Array.isArray(body)).toBe(true);
      expect(body).toHaveLength(artifact.entries.length);

      const orders = body.map((point) => point.displayOrder);
      expect(orders).toEqual([...orders].sort((a, b) => a - b));

      // Asserted EXACTLY, not by substring: §7.8 locks these strings, and the whole point of a
      // cache-header test is to catch a typo in the numbers — which a `toContain('s-maxage=')`
      // cannot do.
      expect(response.headers['cache-control']).toBe(EXPECTED_CACHE_CONTROL.points);
    });

    it('serves a complete, correctly-typed payload for every point', async () => {
      const response = await request(app.getHttpServer()).get('/api/marine/points').expect(200);
      const body = response.body as ServedPoint[];
      const basins = new Set<string>(Object.values(SeaBasin));

      for (const point of body) {
        for (const key of [
          'slugTr',
          'slugEn',
          'nameTr',
          'nameEn',
          'coastLabelTr',
          'coastLabelEn',
          'plateCode',
        ] as const) {
          expect(typeof point[key]).toBe('string');
          expect(point[key].length).toBeGreaterThan(0);
        }
        // Both EN fields must be populated even while the EN surface may ship `noindex` —
        // otherwise flipping that flag later would need a migration.
        expect(point.slugEn).not.toBe('');
        expect(point.nameEn).not.toBe('');
        expect(typeof point.latitude).toBe('number');
        expect(typeof point.longitude).toBe('number');
        expect(basins.has(point.seaBasin)).toBe(true);
        expect(point.plateCode).toMatch(/^\d{2}$/);
      }
    });

    it('needs no authentication — served to a genuinely ANONYMOUS caller', async () => {
      // The marker opts this request out of the trusted-client middleware, so it travels the
      // untrusted, throttled path that real CDN and browser traffic takes. Previously every
      // request in this file carried the internal token, so the test named "needs no
      // authentication" proved only that an empty Authorization header is ignored.
      await request(app.getHttpServer())
        .get('/api/marine/points')
        .set(ANONYMOUS_MARKER_HEADER, '1')
        .expect(200);
    });

    it('carries an ETag and answers a matching If-None-Match with 304', async () => {
      // SPEC-ADDENDUM §7.8 requires an ETag on these endpoints so Vera's ISR revalidation costs
      // almost nothing. It is asserted rather than implemented: the platform already emits a weak
      // ETag for JSON responses and handles the conditional request. Pinning it here means a
      // future change that disables it (a custom serializer, a streaming response) fails loudly
      // instead of quietly multiplying the web build's bandwidth.
      const first = await request(app.getHttpServer()).get('/api/marine/points').expect(200);
      const etag: unknown = first.headers.etag;
      expect(etag).toBeDefined();

      const conditional = await request(app.getHttpServer())
        .get('/api/marine/points')
        .set('If-None-Match', typeof etag === 'string' ? etag : '')
        .expect(304);
      expect(conditional.text).toBe('');
    });
  });

  describe('GET /api/marine/layers', () => {
    it('serves the whole catalogue with a CDN cache header', async () => {
      const response = await request(app.getHttpServer()).get('/api/marine/layers').expect(200);
      const body = response.body as ServedLayer[];

      expect(body.map((layer) => layer.id).sort()).toEqual(
        [...Object.values(MarineLayerId)].sort(),
      );
      expect(response.headers['cache-control']).toBe(EXPECTED_CACHE_CONTROL.layers);
    });

    it('publishes a direction convention on EXACTLY the direction layers', async () => {
      // The safety interlock. `directionConvention` is the only machine-readable statement of
      // what a degree means, and the providers use both conventions inside one API — a missing
      // or misplaced value here is how an arrow ends up drawn backwards with every test green.
      const response = await request(app.getHttpServer()).get('/api/marine/layers').expect(200);
      const body = response.body as ServedLayer[];

      const directionLayers = new Set<string>([
        MarineLayerId.WaveDirection,
        MarineLayerId.WindDirection10m,
      ]);

      for (const layer of body) {
        if (directionLayers.has(layer.id)) {
          expect(layer.directionConvention).toBe(MarineDirectionConvention.From);
          expect(layer.unit).toBe(MarineUnit.DegreeTrue);
        } else {
          expect(layer.directionConvention).toBeNull();
        }
      }
    });

    it('puts calmThreshold on the MAGNITUDE layers, which is where it is read from', async () => {
      const response = await request(app.getHttpServer()).get('/api/marine/layers').expect(200);
      const body = response.body as ServedLayer[];
      const byId = new Map(body.map((layer) => [layer.id, layer]));

      expect(byId.get(MarineLayerId.WaveHeight)?.calmThreshold).toBeGreaterThan(0);
      expect(byId.get(MarineLayerId.WindSpeed10m)?.calmThreshold).toBeGreaterThan(0);
      expect(byId.get(MarineLayerId.WaveDirection)?.calmThreshold).toBeNull();
      expect(byId.get(MarineLayerId.WindDirection10m)?.calmThreshold).toBeNull();
      expect(byId.get(MarineLayerId.SeaSurfaceTemperature)?.calmThreshold).toBeNull();
    });

    it('leaves the three provider-catalogue fields null — M1 makes no provider call', async () => {
      // Pinned so that M3 filling them is a visible, deliberate change rather than a surprise,
      // and so nobody wires a STAC fetch into M1 by accident.
      const response = await request(app.getHttpServer()).get('/api/marine/layers').expect(200);
      for (const layer of response.body as ServedLayer[]) {
        expect(layer.horizonEndUtc).toBeNull();
        expect(layer.updateFrequency).toBeNull();
        expect(layer.catalogueUpdatedAtUtc).toBeNull();
      }
    });

    it('gives every layer a unit, a step, a primary source and an attribution', async () => {
      const response = await request(app.getHttpServer()).get('/api/marine/layers').expect(200);
      const units = new Set<string>(Object.values(MarineUnit));

      for (const layer of response.body as ServedLayer[]) {
        expect(units.has(layer.unit)).toBe(true);
        expect(layer.stepHours).toBeGreaterThan(0);
        expect(typeof layer.primarySource).toBe('string');
        expect(layer.attributionId.length).toBeGreaterThan(0);
        expect(layer.labelTr.length).toBeGreaterThan(0);
        expect(layer.labelEn.length).toBeGreaterThan(0);
        // Colour ramps must be ascending where they exist; direction layers legitimately have
        // none, and an empty list is the honest statement of that.
        const values = layer.colorStops.map((stop) => stop.value);
        expect(values).toEqual([...values].sort((a, b) => a - b));
        for (const stop of layer.colorStops) {
          expect(stop.hex).toMatch(/^#[0-9a-f]{6}$/i);
        }
      }
    });

    it('does not let a caller mutate the shared catalogue between requests', async () => {
      // The catalogue is a module-level constant reused for the process lifetime, so the
      // service hands out a copy. Two consecutive responses must be identical.
      const first = await request(app.getHttpServer()).get('/api/marine/layers').expect(200);
      const second = await request(app.getHttpServer()).get('/api/marine/layers').expect(200);
      expect(second.body).toEqual(first.body);
    });
  });

  // LAST, because it empties the table.
  describe('an empty marine_points table', () => {
    it('is a 500, not an empty 200 — an unrun import is a broken deploy, not an outage', async () => {
      // Returning `200 []` would let a broken deployment publish an empty /deniz page and let
      // Google index it. The success-only cache interceptor also means the emptiness is never
      // cached.
      await dataSource.getRepository(MarinePoint).clear();

      await request(app.getHttpServer()).get('/api/marine/points').expect(500);

      // The layer catalogue is independent of the database and must keep working.
      await request(app.getHttpServer()).get('/api/marine/layers').expect(200);
    });

    it('does not set a Cache-Control header on that 500', async () => {
      const response = await request(app.getHttpServer()).get('/api/marine/points').expect(500);
      expect(response.headers['cache-control']).toBeUndefined();
    });
  });
});
