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
import { loadAcagPm25 } from '../src/database/acag/acag-load';
import {
  ACAG_EXPECTED_FIRST_YEAR,
  ACAG_EXPECTED_LAST_YEAR,
  ACAG_PINNED_DATASET_VERSION,
} from '../src/database/acag/acag-assertions';
import { seedGeography } from '../src/database/seeds/seed-geography';
import { Province } from '../src/province/entities/province.entity';
import {
  PM25_READING_POINT_PROVINCE_CENTRE,
  PM25_SOURCE_ACAG_SATPM25,
} from '../src/province/province.types';
import {
  ACAG_LICENCE_URL,
  ACAG_METHOD_NOTICE_TEXT,
  ACAG_NOTICE_KEYS,
  ACAG_WORK_TITLE,
} from '../src/province/acag-attribution.constant';
import { INTERNAL_REQUEST_HEADER } from '../src/common/throttler/trusted-client';

// 44-char dummy secret used ONLY to exercise the REAL trusted-client throttle exemption.
const TEST_INTERNAL_TOKEN = 'e2e-trusted-client-token-0123456789-abcdefgh';

/**
 * Real-Postgres e2e for the LONG-TERM PM2.5 CONTRACT — the shape the web repo codegens against.
 *
 * It seeds all 81 provinces, runs the REAL offline load path against the COMMITTED artifacts
 * (exactly what a deploy runs: `db:import:acag --phase=load`), boots the app, and asserts the
 * SERVED payload's invariants.
 *
 * Per CONVENTIONS §2 everything here is STRUCTURAL: it asserts shape, completeness, ordering and
 * the derived-field identities across all 81 provinces, and never that a given province has a
 * particular PM2.5 value. The only literal strings asserted are LICENCE text, which is the
 * recorded exception (a licence string is the artifact under test, not a fact about the world).
 */

interface ServedAttribution {
  providerName: string;
  workTitle: string;
  datasetVersion: string;
  datasetUrl: string;
  licenceName: string;
  licenceUrl: string;
  referenceCitation: string;
  referenceUrl: string;
  methodNoticeText: string;
  noticeKeys: string[];
}

interface ServedPm25 {
  source: string;
  datasetVersion: string;
  sourceUrl: string;
  gridCellSizeDeg: number;
  unit: string;
  readingPoint: string;
  cellLatitude: number;
  cellLongitude: number;
  cellDistanceKm: number;
  years: { year: number; valueUgM3: number }[];
  latestYear: number;
  latestValueUgM3: number;
  attribution: ServedAttribution;
}

interface ServedDetail {
  plateCode: string;
  slugTr: string;
  pm25Annual: ServedPm25 | null;
}

describe('Long-term PM2.5 contract (e2e)', () => {
  let container: StartedPostgreSqlContainer;
  let dataSource: DataSource;
  let app: INestApplication;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
    const url = container.getConnectionUri();
    process.env.DATABASE_URL = url;
    process.env.WEB_ORIGIN = 'http://localhost:3000';
    process.env.INTERNAL_REQUEST_TOKEN = TEST_INTERNAL_TOKEN;

    dataSource = new DataSource(buildDataSourceOptions(url));
    await dataSource.initialize();
    await dataSource.runMigrations();
    await seedGeography(dataSource);

    // The COMMITTED artifacts, through the REAL loader — including its whole gate. If the
    // artifact and the seed ever disagree on a province centre, this call throws and the suite
    // fails here rather than asserting a payload built from a stale extraction.
    await loadAcagPm25(dataSource, { inputDir: join(__dirname, '..', 'data', 'acag-pm25') });

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

  async function fetchDetail(slug: string): Promise<ServedDetail> {
    const res = await request(app.getHttpServer()).get(`/api/provinces/${slug}`).expect(200);
    return res.body as ServedDetail;
  }

  it('loads a series for ALL 81 provinces — the completeness rule, not "most of them"', async () => {
    const rows = await dataSource.getRepository(Province).find();
    expect(rows).toHaveLength(81);
    expect(rows.filter((row) => row.pm25Annual !== null)).toHaveLength(81);
  });

  it('is idempotent: a second load writes nothing and does not move updated_at', async () => {
    // `updated_at` feeds the page's dateModified and the sitemap lastmod. A re-run that bumped 81
    // rows would announce 81 changed pages to Google while nothing changed.
    const before = await dataSource.getRepository(Province).find({
      select: { plateCode: true, updatedAt: true },
      order: { plateCode: 'ASC' },
    });
    const result = await loadAcagPm25(dataSource, {
      inputDir: join(__dirname, '..', 'data', 'acag-pm25'),
    });
    expect(result.updated).toBe(0);
    expect(result.unchanged).toBe(81);

    const after = await dataSource.getRepository(Province).find({
      select: { plateCode: true, updatedAt: true },
      order: { plateCode: 'ASC' },
    });
    expect(after.map((row) => row.updatedAt.toISOString())).toEqual(
      before.map((row) => row.updatedAt.toISOString()),
    );
  });

  it('serves a structurally complete payload for every province', async () => {
    const list = (await request(app.getHttpServer()).get('/api/provinces').expect(200))
      .body as Array<{ slugTr: string }>;
    expect(list).toHaveLength(81);

    for (const item of list) {
      const detail = await fetchDetail(item.slugTr);
      const pm25 = detail.pm25Annual;
      expect(pm25).not.toBeNull();
      if (pm25 === null) throw new Error('unreachable');

      expect(pm25.source).toBe(PM25_SOURCE_ACAG_SATPM25);
      expect(pm25.readingPoint).toBe(PM25_READING_POINT_PROVINCE_CENTRE);
      expect(pm25.datasetVersion).toBe(ACAG_PINNED_DATASET_VERSION);
      expect(typeof pm25.sourceUrl).toBe('string');
      expect(pm25.gridCellSizeDeg).toBeGreaterThan(0);
      expect(pm25.gridCellSizeDeg).toBeLessThan(0.02);
      expect(pm25.cellDistanceKm).toBeGreaterThanOrEqual(0);

      // The series is complete and ASCENDING — the ordering the DTO promises.
      expect(pm25.years).toHaveLength(ACAG_EXPECTED_LAST_YEAR - ACAG_EXPECTED_FIRST_YEAR + 1);
      const years = pm25.years.map((entry) => entry.year);
      expect(years[0]).toBe(ACAG_EXPECTED_FIRST_YEAR);
      expect(years[years.length - 1]).toBe(ACAG_EXPECTED_LAST_YEAR);
      expect([...years].sort((a, b) => a - b)).toEqual(years);

      // Values are raw finite numbers, never pre-formatted strings.
      for (const entry of pm25.years) {
        expect(typeof entry.valueUgM3).toBe('number');
        expect(Number.isFinite(entry.valueUgM3)).toBe(true);
        expect(entry.valueUgM3).toBeGreaterThan(0);
      }

      // EVERY required property of the generated contract is present and typed — presence and
      // type only, never a literal value (review TEST123-M3). `unit` in particular is declared
      // required and non-nullable in `openapi.json`, is rendered beside every number the web
      // shows, and was asserted nowhere in the diff's entire test surface.
      expect(typeof pm25.unit).toBe('string');
      expect(pm25.unit.length).toBeGreaterThan(0);
      expect(typeof pm25.cellLatitude).toBe('number');
      expect(typeof pm25.cellLongitude).toBe('number');
      expect(typeof pm25.latestValueUgM3).toBe('number');
      expect(Number.isFinite(pm25.latestValueUgM3)).toBe(true);
      expect(typeof pm25.attribution).toBe('object');

      // And NOTHING beyond the declared shape: the served object is built field by field, so a
      // stray key in the stored jsonb document cannot reach a public contract (CODE123-I2).
      expect(Object.keys(pm25).sort()).toEqual(
        [
          'attribution',
          'cellDistanceKm',
          'cellLatitude',
          'cellLongitude',
          'datasetVersion',
          'gridCellSizeDeg',
          'latestValueUgM3',
          'latestYear',
          'readingPoint',
          'source',
          'sourceUrl',
          'unit',
          'years',
        ].sort(),
      );
    }
  }, 120_000);

  /**
   * The staleness-visibility condition attached to DEC 2026-08-19f: the refresh is annual and
   * hand-run, so the payload must show how old it is without a second lookup. These two fields are
   * DERIVED at serialization, so this also proves they cannot drift from the series they describe.
   */
  it('derives latestYear/latestValueUgM3 from the series itself, never from a stored copy', async () => {
    const detail = await fetchDetail('ankara');
    const pm25 = detail.pm25Annual;
    if (pm25 === null) throw new Error('unreachable');

    const last = pm25.years[pm25.years.length - 1];
    expect(last).toBeDefined();
    expect(pm25.latestYear).toBe(last?.year);
    expect(pm25.latestValueUgM3).toBe(last?.valueUgM3);
    expect(pm25.latestYear).toBe(ACAG_EXPECTED_LAST_YEAR);

    // And the stored document deliberately does NOT carry them (a persisted copy could go stale).
    const stored = await dataSource
      .getRepository(Province)
      .findOneOrFail({ where: { slugTr: 'ankara' } });
    expect(stored.pm25Annual).not.toBeNull();
    expect(Object.keys(stored.pm25Annual ?? {})).not.toContain('latestYear');
  });

  it('publishes the licence block on every province, with the provider-verbatim strings', async () => {
    const detail = await fetchDetail('istanbul');
    const attribution = detail.pm25Annual?.attribution;
    expect(attribution).toBeDefined();
    if (attribution === undefined) throw new Error('unreachable');

    // Licence text is the recorded "pin the bytes" exception — one changed letter breaks a
    // licence condition, and the subscripts are part of the quotation.
    expect(attribution.workTitle).toBe(ACAG_WORK_TITLE);
    expect(attribution.workTitle).toContain('₂');
    expect(attribution.licenceUrl).toBe(ACAG_LICENCE_URL);
    expect(attribution.methodNoticeText).toBe(ACAG_METHOD_NOTICE_TEXT);
    expect(attribution.noticeKeys).toEqual([...ACAG_NOTICE_KEYS]);
    // The API ships i18n KEYS, never authored prose.
    for (const key of attribution.noticeKeys) {
      expect(key).toMatch(/^airPollution\.notice\./);
    }
  });

  it('serves the cell coordinates the value was actually read from', async () => {
    // The reader is shown one ~1 km cell, so the künye must be able to name which cell. The cell
    // must also be near its province — a structural check against a whole-grid mix-up.
    const rows = await dataSource.getRepository(Province).find();
    for (const row of rows) {
      const stored = row.pm25Annual;
      expect(stored).not.toBeNull();
      if (stored === null) continue;
      expect(Math.abs(stored.cellLatitude - (row.latitude ?? 0))).toBeLessThan(0.02);
      expect(Math.abs(stored.cellLongitude - (row.longitude ?? 0))).toBeLessThan(0.02);
      expect(stored.cellDistanceKm).toBeLessThan(1.5);
    }

    // The title says SERVES, so the projection is exercised too (review TEST123-M7): the body
    // used to read only the stored document, and the served coordinates were asserted nowhere.
    const sample = await dataSource
      .getRepository(Province)
      .findOneOrFail({ where: { slugTr: 'istanbul' } });
    const served = (await fetchDetail('istanbul')).pm25Annual;
    expect(served?.cellLatitude).toBe(sample.pm25Annual?.cellLatitude);
    expect(served?.cellLongitude).toBe(sample.pm25Annual?.cellLongitude);
    expect(served?.cellDistanceKm).toBe(sample.pm25Annual?.cellDistanceKm);
  });

  /**
   * The mutating cases live in their own block and RESTORE what they touch (review TEST123-M8).
   * They previously mutated three rows permanently, and the suite was correct only because Jest
   * happens to run `it` blocks in declaration order and all three sat last — a dependency nothing
   * in the file recorded.
   */
  describe('degradation and derivation on hand-edited rows', () => {
    const touched = ['yalova', 'bolu', 'duzce', 'edirne'];
    let saved: Map<string, unknown>;

    beforeAll(async () => {
      const rows = await dataSource
        .getRepository(Province)
        .find({ where: touched.map((slugTr) => ({ slugTr })) });
      saved = new Map(rows.map((row) => [row.slugTr, row.pm25Annual]));
      expect(saved.size).toBe(touched.length);
    });

    afterAll(async () => {
      for (const [slugTr, document] of saved) {
        await dataSource
          .getRepository(Province)
          .update({ slugTr }, { pm25Annual: document as Province['pm25Annual'] });
      }
    });

    /**
     * Graceful degradation: NULL is the documented kill switch
     * (`UPDATE provinces SET pm25_annual = NULL`), and it must remove the section rather than
     * break the page — this is a public SEO route.
     */
    it('serves pm25Annual: null (200, no crash) when a province has no series', async () => {
      await dataSource.getRepository(Province).update({ slugTr: 'yalova' }, { pm25Annual: null });
      const detail = await fetchDetail('yalova');
      expect(detail.pm25Annual).toBeNull();

      // The rest of the payload is untouched.
      expect(detail.plateCode).toBe('77');
    });

    it('serves pm25Annual: null when the stored document names a source this build does not serve', async () => {
      // A jsonb column's TypeScript type is an assertion about what we wrote, never a guarantee
      // about what is there. Absent beats wrong on a public contract.
      await dataSource.query(
        `UPDATE provinces SET pm25_annual = jsonb_set(pm25_annual, '{source}', '"some_other_source"') WHERE slug_tr = 'bolu'`,
      );
      const detail = await fetchDetail('bolu');
      expect(detail.pm25Annual).toBeNull();
    });

    it('serves pm25Annual: null when the stored series is empty', async () => {
      await dataSource.query(
        `UPDATE provinces SET pm25_annual = jsonb_set(pm25_annual, '{years}', '[]') WHERE slug_tr = 'duzce'`,
      );
      const detail = await fetchDetail('duzce');
      expect(detail.pm25Annual).toBeNull();
    });

    /**
     * The PARTIALLY malformed arm (review TEST123-M6). `buildServedPm25Annual` has two series
     * arms — "no usable entries" and "some entries unusable" — and only the first was exercised.
     */
    it('serves pm25Annual: null when ONE year entry is malformed', async () => {
      await dataSource.query(
        `UPDATE provinces SET pm25_annual = jsonb_set(pm25_annual, '{years,0,valueUgM3}', 'null') WHERE slug_tr = 'duzce'`,
      );
      const detail = await fetchDetail('duzce');
      expect(detail.pm25Annual).toBeNull();
    });

    /**
     * A required field removed by hand (review CODE123-I2). `unit` is declared required and
     * non-nullable in `openapi.json`, so serving the object without it hands the web repo's
     * generated client a `unit: string` that is `undefined` at runtime. Absent beats wrong.
     */
    it('serves pm25Annual: null when a REQUIRED field is missing from the stored document', async () => {
      await dataSource.query(
        `UPDATE provinces SET pm25_annual = pm25_annual - 'unit' WHERE slug_tr = 'bolu'`,
      );
      const detail = await fetchDetail('bolu');
      expect(detail.pm25Annual).toBeNull();
    });

    /**
     * THE SORT IS LOAD-BEARING AND UNTIL NOW UNTESTED (review TEST123-I1).
     *
     * `buildServedPm25Annual` deliberately does not trust the stored ordering — it sorts, then
     * derives `latestYear`/`latestValueUgM3` from the last element. Every other test feeds it an
     * already-ascending series, so the sort was a provable no-op in every assertion and deleting
     * it would have kept the suite green. `latestYear` is the field DEC 2026-08-19f requires to
     * be trustworthy, so it is the one field that must not rest on input that happened to be
     * ordered.
     */
    it('serves an ASCENDING series and a true latest year even when the stored order is reversed', async () => {
      const before = await dataSource
        .getRepository(Province)
        .findOneOrFail({ where: { slugTr: 'edirne' } });
      const stored = before.pm25Annual;
      expect(stored).not.toBeNull();
      if (stored === null) throw new Error('unreachable');

      const reversed = [...stored.years].reverse();
      expect(reversed[0]?.year).toBeGreaterThan(reversed[reversed.length - 1]?.year ?? 0);
      await dataSource.query(
        `UPDATE provinces SET pm25_annual = jsonb_set(pm25_annual, '{years}', $1::jsonb) WHERE slug_tr = 'edirne'`,
        [JSON.stringify(reversed)],
      );

      const served = (await fetchDetail('edirne')).pm25Annual;
      expect(served).not.toBeNull();
      if (served === null) throw new Error('unreachable');

      const years = served.years.map((entry) => entry.year);
      expect(years).toEqual([...years].sort((a, b) => a - b));
      expect(served.latestYear).toBe(Math.max(...years));
      expect(served.latestYear).toBe(ACAG_EXPECTED_LAST_YEAR);
      const latestEntry = stored.years.find((entry) => entry.year === served.latestYear);
      expect(served.latestValueUgM3).toBe(latestEntry?.valueUgM3);
    });
  });
});
