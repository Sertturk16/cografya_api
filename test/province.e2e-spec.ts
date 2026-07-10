import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { applyGlobalPrefix } from '../src/common/bootstrap';
import { buildDataSourceOptions } from '../src/database/data-source-options';
import {
  assertKoppenCaveatInvariant,
  seedGeography,
  type SeedGeographyResult,
} from '../src/database/seeds/seed-geography';
import type { ProvinceSeed } from '../src/database/seeds/province.seed-data';
import { GeographicRegion } from '../src/common/geographic-region.enum';
import { Province } from '../src/province/entities/province.entity';
import { computePopulationDensity } from '../src/province/province.service';
import { HydrographyFeatureType } from '../src/province/province.types';
// NOTE: AppModule is imported dynamically inside beforeAll — NOT at the top —
// because ConfigModule.forRoot validates the env eagerly at module-load time, so
// AppModule must not load until DATABASE_URL has been set to the container URL.

/**
 * Expected, fact-checked values for the 5 pilot provinces, restated INDEPENDENTLY
 * of the seed source (NOT imported from PILOT_PROVINCES) so a transcription
 * regression in the seed is caught rather than tautologically passed. Values
 * trace to il-data-dictionary §2.1 (SEED-READY, fact-checked 2026-07-08).
 */
const EXPECTED_PROVINCES = [
  {
    slug: 'istanbul',
    plateCode: '34',
    nameTr: 'İstanbul',
    region: 'MARMARA',
    population: 15_754_053,
    populationYear: 2025,
    areaKm2: 5461,
    districtCount: 39,
    // populationDensity = round(15_754_053 / 5461) — server-computed, not stored.
    populationDensity: 2885,
    elevationM: 33,
    latitude: 40.9819,
    longitude: 28.8208,
    neighborPlateCodes: ['59', '41'],
    climateKoppen: 'Csa',
    climateClassTr: 'Akdeniz iklimi',
    caveatContains: 'MGM',
  },
  {
    slug: 'ankara',
    plateCode: '06',
    nameTr: 'Ankara',
    region: 'IC_ANADOLU',
    population: 5_910_320,
    populationYear: 2025,
    areaKm2: 25_632,
    districtCount: 25,
    populationDensity: 231, // round(5_910_320 / 25_632)
    elevationM: 891,
    latitude: 39.9727,
    longitude: 32.8637,
    neighborPlateCodes: ['18', '71', '40', '68', '42', '26', '14'],
    climateKoppen: 'Csa',
    climateClassTr: 'Akdeniz iklimi',
    caveatContains: 'yarı-kurak step',
  },
  {
    slug: 'izmir',
    plateCode: '35',
    nameTr: 'İzmir',
    region: 'EGE',
    population: 4_504_185,
    populationYear: 2025,
    areaKm2: 11_891,
    districtCount: 30,
    populationDensity: 379, // round(4_504_185 / 11_891)
    elevationM: 29,
    latitude: 38.4049,
    longitude: 27.1895,
    neighborPlateCodes: ['10', '45', '09'],
    climateKoppen: 'Csa',
    climateClassTr: 'Akdeniz iklimi',
    caveatContains: 'MGM',
  },
  {
    slug: 'van',
    plateCode: '65',
    nameTr: 'Van',
    region: 'DOGU_ANADOLU',
    population: 1_112_013,
    populationYear: 2025,
    areaKm2: 20_921,
    districtCount: 13,
    populationDensity: 53, // round(1_112_013 / 20_921)
    elevationM: 1675,
    latitude: 38.4693,
    longitude: 43.346,
    neighborPlateCodes: ['04', '13', '56', '30', '73'],
    climateKoppen: 'Csa',
    climateClassTr: 'Akdeniz iklimi',
    caveatContains: 'karasal/göl-etkili',
  },
  {
    slug: 'antalya',
    plateCode: '07',
    nameTr: 'Antalya',
    region: 'AKDENIZ',
    population: 2_777_677,
    populationYear: 2025,
    areaKm2: 20_177,
    districtCount: 19,
    populationDensity: 138, // round(2_777_677 / 20_177)
    elevationM: 47,
    latitude: 36.8851,
    longitude: 30.6828,
    neighborPlateCodes: ['48', '15', '32', '42', '70', '33'],
    climateKoppen: 'Csa',
    climateClassTr: 'Akdeniz iklimi',
    caveatContains: 'MGM',
  },
] as const;

/**
 * Real-Postgres e2e (Testcontainers): proves the migrations run clean, the
 * `db:seed:geography` pilot seed lands ALL 5 fact-checked provinces IDEMPOTENTLY
 * (no duplicate rows, no `updated_at` bump on a no-op re-seed), and the public
 * read endpoints serve that data under the `/api` prefix. Runs on CI only (needs
 * Docker); locally we run tsc + eslint per CONVENTIONS §2.
 */
describe('Province (e2e)', () => {
  let container: StartedPostgreSqlContainer;
  let dataSource: DataSource;
  let app: INestApplication;

  // Captured in beforeAll (setup MUST run there), asserted in named it() blocks
  // so a red run points at the exact failed check.
  let appliedMigrationNames: string[];
  let firstSeed: SeedGeographyResult;
  let secondSeed: SeedGeographyResult;
  let istanbulUpdatedAtAfterFirst: string;
  let istanbulUpdatedAtAfterSecond: string;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
    const url = container.getConnectionUri();

    // The app reads these from the env at boot (zod-validated).
    process.env.DATABASE_URL = url;
    process.env.WEB_ORIGIN = 'http://localhost:3000';

    // 1) Migrations must run clean against a real Postgres, creating the schema.
    dataSource = new DataSource(buildDataSourceOptions(url));
    await dataSource.initialize();
    const applied = await dataSource.runMigrations();
    appliedMigrationNames = applied.map((m) => m.name);

    // 2) Seed once, snapshot İstanbul's updated_at, then seed AGAIN. The second
    //    run must be a pure no-op (data identical) — proving idempotency AND that
    //    it does not churn updated_at (SEO lastmod honesty, CONVENTIONS §6).
    const repo = dataSource.getRepository(Province);
    firstSeed = await seedGeography(dataSource);
    istanbulUpdatedAtAfterFirst = (
      await repo.findOneByOrFail({ plateCode: '34' })
    ).updatedAt.toISOString();
    secondSeed = await seedGeography(dataSource);
    istanbulUpdatedAtAfterSecond = (
      await repo.findOneByOrFail({ plateCode: '34' })
    ).updatedAt.toISOString();

    // 3) Boot the real app against the same DB (no synchronize; schema exists).
    //    Load AppModule now — after DATABASE_URL is set — so its eager env
    //    validation sees the real container URL. A typed require (not a static
    //    import) defers module load to here.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { AppModule } = require('../src/app.module') as typeof import('../src/app.module');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    applyGlobalPrefix(app);
    await app.init();
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    await dataSource?.destroy();
    await container?.stop();
  });

  it('runs all migrations clean, in order', () => {
    expect(appliedMigrationNames).toEqual([
      'InitProvince1783382400000',
      'AddProvinceClimateNote1783513986800',
      'AddProvinceDetailSections1783701664849',
    ]);
  });

  it('first seed inserts all 5 pilot provinces', () => {
    expect(firstSeed).toEqual({ inserted: 5, updated: 0, unchanged: 0, total: 5 });
  });

  it('re-seed is a no-op: no duplicates, no writes, no updated_at churn', async () => {
    // Every row already matches → all 5 unchanged, none updated/inserted.
    expect(secondSeed).toEqual({ inserted: 0, updated: 0, unchanged: 5, total: 5 });
    // Still exactly 5 rows.
    const count = await dataSource.getRepository(Province).count();
    expect(count).toBe(5);
    // updated_at was NOT bumped by the no-op re-seed.
    expect(istanbulUpdatedAtAfterSecond).toBe(istanbulUpdatedAtAfterFirst);
  });

  it('round-trips a seeded Province (transformer + array + deliberate nulls)', async () => {
    const istanbul = await dataSource.getRepository(Province).findOneByOrFail({ plateCode: '34' });
    // numeric(9,6) comes back through the transformer as a real number
    expect(istanbul.latitude).toBe(40.9819);
    expect(istanbul.longitude).toBe(28.8208);
    // varchar[] round-trips as an array
    expect(istanbul.neighborPlateCodes).toEqual(['59', '41']);
    // the MGM caveat travels with the Köppen value (never a bare code)
    expect(istanbul.climateKoppen).toBe('Csa');
    expect(istanbul.climateNoteTr).toContain('MGM');
    // unseeded research field stays null (never invented for the pilot)
    expect(istanbul.landformNoteTr).toBeNull();
    // NEW detail-section fields ship as SCHEMA ONLY — no content this PR, so every
    // one stays null for the pilot (deliberately unpopulated, never invented).
    expect(istanbul.introTr).toBeNull();
    expect(istanbul.hydrographyNoteTr).toBeNull();
    expect(istanbul.hydrographyFeatures).toBeNull();
    expect(istanbul.urbanizationRate).toBeNull();
    expect(istanbul.netMigrationRate).toBeNull();
    expect(istanbul.settlementNoteTr).toBeNull();
    expect(istanbul.economyIndicator).toBeNull();
  });

  it('GET /api/provinces returns all 5, plate-ordered, lean (no detail leak)', async () => {
    const res = await request(app.getHttpServer()).get('/api/provinces').expect(200);
    const body = res.body as Array<Record<string, unknown>>;
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(5);
    // lexical plate order: 06, 07, 34, 35, 65
    expect(body.map((p) => p.plateCode)).toEqual(['06', '07', '34', '35', '65']);
    expect(body[0]).toMatchObject({
      plateCode: '06',
      nameTr: 'Ankara',
      region: 'IC_ANADOLU',
      slugTr: 'ankara',
      slugEn: 'ankara',
    });
    // lean payload must NOT carry detail-only fields
    expect(body[0]).not.toHaveProperty('population');
    expect(body[0]).not.toHaveProperty('latitude');
    expect(body[0]).not.toHaveProperty('climateNoteTr');
  });

  it('GET /api/provinces/map-summary returns hover-card data for all provinces', async () => {
    // The static `map-summary` path must resolve to this endpoint, NOT be captured
    // by the `:slug` route (which would 404) — a 200 array proves the route order.
    const res = await request(app.getHttpServer()).get('/api/provinces/map-summary').expect(200);
    const body = res.body as Array<Record<string, unknown>>;
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(5);
    // same plate order as the list endpoint: 06, 07, 34, 35, 65
    expect(body.map((p) => p.plateCode)).toEqual(['06', '07', '34', '35', '65']);

    // every province's summary numbers must round-trip (not just İstanbul) — guards
    // the pass-through `toMapSummary` mapper against a silent per-row field swap.
    for (const expected of EXPECTED_PROVINCES) {
      const row = body.find((p) => p.plateCode === expected.plateCode);
      expect(row).toMatchObject({
        nameTr: expected.nameTr,
        region: expected.region,
        slugTr: expected.slug,
        slugEn: expected.slug,
        population: expected.population,
        populationYear: expected.populationYear,
        areaKm2: expected.areaKm2,
        districtCount: expected.districtCount,
      });
    }

    // purpose-sized payload: identity + the 4 summary numbers ONLY — no detail leak,
    // and NO derived density (density is a detail-page concern, not the hover-card).
    const istanbul = body.find((p) => p.plateCode === '34');
    expect(istanbul).not.toHaveProperty('latitude');
    expect(istanbul).not.toHaveProperty('climateNoteTr');
    expect(istanbul).not.toHaveProperty('neighborPlateCodes');
    expect(istanbul).not.toHaveProperty('populationDensity');
  });

  // Mechanism proof for the jsonb columns + the numeric-rate transformer: this PR
  // ships those columns but every pilot row leaves them null, so nothing else
  // exercises a NON-null jsonb round-trip through Postgres. A throwaway fixture row
  // (plate '00', not a real province) is inserted, read back through the API, then
  // deleted in `finally` so the other tests still see exactly the 5 pilot rows.
  it('round-trips non-null jsonb + numeric-rate fields through the DB and API', async () => {
    const repo = dataSource.getRepository(Province);
    const fixture = repo.create({
      plateCode: '00',
      nameTr: 'Test İli',
      slugTr: 'jsonb-roundtrip-fixture',
      slugEn: 'jsonb-roundtrip-fixture-en',
      region: GeographicRegion.Marmara,
      population: 1000,
      areaKm2: 4,
      hydrographyFeatures: [
        { name: 'Test Barajı', type: HydrographyFeatureType.Baraj },
        { name: 'Test Nehri', type: HydrographyFeatureType.Nehir },
      ],
      economyIndicator: { label: 'Test payı', value: '%1,5', year: 2024, source: 'TÜİK Test' },
      urbanizationRate: 93.5,
      netMigrationRate: -12.34,
    });
    await repo.save(fixture);

    try {
      const res = await request(app.getHttpServer())
        .get('/api/provinces/jsonb-roundtrip-fixture')
        .expect(200);
      const body = res.body as Record<string, unknown>;

      // jsonb array + nested objects survive the Postgres round-trip intact (order,
      // nested keys, ASCII enum value) — the exact shape the web codegen relies on.
      expect(body.hydrographyFeatures).toEqual([
        { name: 'Test Barajı', type: 'baraj' },
        { name: 'Test Nehri', type: 'nehir' },
      ]);
      expect(body.economyIndicator).toEqual({
        label: 'Test payı',
        value: '%1,5',
        year: 2024,
        source: 'TÜİK Test',
      });
      // numeric(5,2) comes back through decimalTransformer as a real, signed number
      expect(body.urbanizationRate).toBe(93.5);
      expect(body.netMigrationRate).toBe(-12.34);
      // computed density on real inputs: round(1000 / 4) = 250
      expect(body.populationDensity).toBe(250);
    } finally {
      // Clean up unconditionally so the 5-row count assumed by the other tests holds
      // even if an assertion above throws.
      await repo.delete({ plateCode: '00' });
    }
  });

  // I1/M4: assert EVERY pilot province's key fact-checked fields (not just
  // İstanbul) so a transcription regression in any row fails CI. The
  // province-specific MGM caveat (Ankara/Van divergence) is asserted here too.
  it.each(EXPECTED_PROVINCES)(
    'GET /api/provinces/$slug returns the full, fact-checked detail',
    async (expected) => {
      const res = await request(app.getHttpServer())
        .get(`/api/provinces/${expected.slug}`)
        .expect(200);
      const body = res.body as Record<string, unknown>;

      expect(body).toMatchObject({
        plateCode: expected.plateCode,
        nameTr: expected.nameTr,
        region: expected.region,
        population: expected.population,
        populationYear: expected.populationYear,
        areaKm2: expected.areaKm2,
        districtCount: expected.districtCount,
        // server-computed derived field: round(population / areaKm2), single-sourced
        populationDensity: expected.populationDensity,
        elevationM: expected.elevationM,
        neighborPlateCodes: expected.neighborPlateCodes,
        climateKoppen: expected.climateKoppen,
        climateClassTr: expected.climateClassTr,
        // deferred/unpopulated fields — schema ships this PR, content later; every
        // one must be null for the pilot (never invented).
        landformNoteTr: null,
        introTr: null,
        hydrographyNoteTr: null,
        hydrographyFeatures: null,
        urbanizationRate: null,
        netMigrationRate: null,
        settlementNoteTr: null,
        economyIndicator: null,
      });
      expect(body.latitude).toBe(expected.latitude);
      expect(body.longitude).toBe(expected.longitude);

      // Köppen⇒caveat invariant at the API boundary: a present Köppen code must
      // carry a non-empty MGM note, and it must contain the expected divergence.
      expect(typeof body.climateNoteTr).toBe('string');
      expect((body.climateNoteTr as string).length).toBeGreaterThan(0);
      expect(body.climateNoteTr).toContain(expected.caveatContains);
    },
  );

  it('GET /api/provinces/:slug returns 404 for an unseeded slug', async () => {
    // A real, valid province NOT in the pilot 5 → 404 (web renders notFound()).
    await request(app.getHttpServer()).get('/api/provinces/bursa').expect(404);
    await request(app.getHttpServer()).get('/api/provinces/atlantis').expect(404);
  });

  it('GET /health stays bare (excluded from the /api prefix)', async () => {
    await request(app.getHttpServer()).get('/health').expect(200, { status: 'ok' });
  });
});

/**
 * M1: the Köppen⇒caveat invariant must actually FIRE on a violation, not just be
 * satisfied by the (currently-clean) pilot data — this is what stops batch 2 (81
 * provinces) from silently shipping a bare Köppen code. Pure function, no DB.
 */
describe('assertKoppenCaveatInvariant', () => {
  const VALID_SEED: ProvinceSeed = {
    plateCode: '99',
    nameTr: 'Test',
    slugTr: 'test',
    slugEn: 'test',
    region: GeographicRegion.Marmara,
    population: 1,
    populationYear: 2025,
    areaKm2: 1,
    districtCount: 1,
    elevationM: 1,
    latitude: 40,
    longitude: 30,
    neighborPlateCodes: [],
    climateKoppen: 'Csa',
    climateClassTr: 'Akdeniz iklimi',
    climateNoteTr: 'MGM metodolojik uyarı notu.',
    landformNoteTr: null,
  };

  it('passes when a Köppen code carries a caveat', () => {
    expect(() => assertKoppenCaveatInvariant([VALID_SEED])).not.toThrow();
  });

  it('throws when a Köppen code has an empty caveat (bare code)', () => {
    expect(() => assertKoppenCaveatInvariant([{ ...VALID_SEED, climateNoteTr: '' }])).toThrow(
      /Köppen⇒caveat invariant violated/,
    );
  });

  it('throws when the caveat is whitespace-only', () => {
    expect(() => assertKoppenCaveatInvariant([{ ...VALID_SEED, climateNoteTr: '   ' }])).toThrow();
  });

  it('does not require a caveat when there is no Köppen code', () => {
    expect(() =>
      assertKoppenCaveatInvariant([{ ...VALID_SEED, climateKoppen: '', climateNoteTr: '' }]),
    ).not.toThrow();
  });
});

/**
 * Pure, DB-free coverage of the density derivation — critically the NULL/zero
 * branch, which is the NORMAL state of every not-yet-seeded province (76 of 81).
 * The e2e above only exercises the value branch (all 5 pilots have population +
 * area), so without this a regression in the guard (dropped null-check, removed
 * `areaKm2 === 0` guard) could serve a wrong "0" or a non-finite number on a public
 * SEO page with CI staying green. Mirrors the `assertKoppenCaveatInvariant` block.
 */
describe('computePopulationDensity', () => {
  it('rounds population / area to the nearest integer (kişi/km²)', () => {
    expect(computePopulationDensity(15_754_053, 5461)).toBe(2885);
    expect(computePopulationDensity(1000, 3)).toBe(333); // 333.33… → 333
    expect(computePopulationDensity(1000, 8)).toBe(125); // exact
  });

  it('returns null when population is null (an unseeded province — never 0)', () => {
    expect(computePopulationDensity(null, 5461)).toBeNull();
  });

  it('returns null when area is null', () => {
    expect(computePopulationDensity(15_754_053, null)).toBeNull();
  });

  it('returns null when both inputs are null', () => {
    expect(computePopulationDensity(null, null)).toBeNull();
  });

  it('returns null — never Infinity — when area is 0', () => {
    expect(computePopulationDensity(1000, 0)).toBeNull();
  });
});
