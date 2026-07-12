import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerStorage } from '@nestjs/throttler';
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
// PILOT_PROVINCES / SEED_PROVINCES are imported ONLY to drive the seed-rollout
// phases below (a code-path input): empty→pilot then the full set, one representative
// mixed transition rather than one phase per historical wave.
import {
  PILOT_PROVINCES,
  SEED_PROVINCES,
  type ProvinceSeed,
} from '../src/database/seeds/province.seed-data';
import { GeographicRegion } from '../src/common/geographic-region.enum';
import { Province } from '../src/province/entities/province.entity';
import { computePopulationDensity } from '../src/province/province.service';
import { HydrographyFeatureType } from '../src/province/province.types';
// NOTE: AppModule is imported dynamically inside beforeAll — NOT at the top —
// because ConfigModule.forRoot validates the env eagerly at module-load time, so
// AppModule must not load until DATABASE_URL has been set to the container URL.

/**
 * Real-Postgres e2e (Testcontainers): proves the migrations run clean, the
 * `db:seed:geography` seed lands ALL 81 fact-checked provinces (5 pilot + 9 Batch 2
 * wave-1 + 10 Batch 2 wave-2 + 7 Batch 2 wave-3 + 7 Batch 2 wave-4 + 9 wave-6d
 * Karadeniz-B + 13 wave-6b Doğu Anadolu + 12 wave-6a İç Anadolu) IDEMPOTENTLY (no
 * duplicate rows, no `updated_at` bump on a no-op re-seed), and the public read
 * endpoints serve that data under the `/api` prefix. Runs on CI only (needs Docker);
 * locally we run tsc + eslint per CONVENTIONS §2.
 */
describe('Province (e2e)', () => {
  let container: StartedPostgreSqlContainer;
  let dataSource: DataSource;
  let app: INestApplication;

  // Captured in beforeAll (setup MUST run there), asserted in named it() blocks so a
  // red run points at the exact failed check. THREE seed phases — the wave-4 collapse
  // of the old per-wave chain (empty → pilot → +wave-1 → +wave-2 → +wave-3 → re-run),
  // per the concrete trigger the earlier waves recorded: at wave-4, stop adding one
  // phase per wave and keep a REPRESENTATIVE set — empty→first all-insert + ONE
  // multi-batch mixed transition + full no-op — since per-row independence does not
  // care how many prior batches the no-op set spans. The three phases still exercise
  // all three homogeneous+mixed seed paths (all-insert, mixed insert/no-op, full
  // no-op); the `updated` path is covered separately by the drift + retraction tests
  // below.
  let appliedMigrationNames: string[];
  let pilotOnlySeed: SeedGeographyResult;
  let fullMixedSeed: SeedGeographyResult;
  let reSeed: SeedGeographyResult;
  let istanbulUpdatedAtAfterPilotInsert: string;
  let istanbulUpdatedAtAfterFullInsert: string;
  let istanbulUpdatedAtAfterReseed: string;

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

    // 2) Seed in a REPRESENTATIVE set of rollout phases (the wave-4 collapse) so every
    //    homogeneous+mixed insert/no-op path the platform can hit is exercised, without
    //    growing one phase per historical wave:
    //      Phase 1 — empty DB seeded with the pilot-5 ONLY: the state PR-4a left
    //        (all-insert). Snapshot İstanbul's updated_at.
    //      Phase 2 — re-seed the SAME DB with the FULL 81-list (SEED_PROVINCES). The 5
    //        pilot rows already match (no-op) and the other 76 are new (insert) → a
    //        MIXED batch, the largest this repo ships. İstanbul's updated_at must be
    //        UNCHANGED (a mixed batch never touches the rows it leaves alone — and, per
    //        the earlier waves' agreed trigger, the number of prior batches the no-op
    //        set spans does not change what this proves, so one mixed transition stands
    //        in for the old +wave-1/+wave-2/+wave-3 chain).
    //      Phase 3 — a routine re-run over the complete 81: pure no-op, proving
    //        idempotency AND no updated_at churn (SEO lastmod honesty, §6).
    //    PILOT_PROVINCES + SEED_PROVINCES drive the phases here; these structural tests
    //    assert seed-counts, idempotency and shape — not per-il fact-checked values
    //    (those live in data-provenance.md, the fact-check record, → DEC 2026-07-12).
    const repo = dataSource.getRepository(Province);
    pilotOnlySeed = await seedGeography(dataSource, PILOT_PROVINCES);
    istanbulUpdatedAtAfterPilotInsert = (
      await repo.findOneByOrFail({ plateCode: '34' })
    ).updatedAt.toISOString();
    fullMixedSeed = await seedGeography(dataSource, SEED_PROVINCES);
    istanbulUpdatedAtAfterFullInsert = (
      await repo.findOneByOrFail({ plateCode: '34' })
    ).updatedAt.toISOString();
    reSeed = await seedGeography(dataSource);
    istanbulUpdatedAtAfterReseed = (
      await repo.findOneByOrFail({ plateCode: '34' })
    ).updatedAt.toISOString();

    // 3) Boot the real app against the same DB (no synchronize; schema exists).
    //    Load AppModule now — after DATABASE_URL is set — so its eager env
    //    validation sees the real container URL. A typed require (not a static
    //    import) defers module load to here.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { AppModule } = require('../src/app.module') as typeof import('../src/app.module');
    // Neutralise the global 120 req/min rate limit FOR THIS TEST RUN ONLY. The suite fires
    // its HTTP assertions from a single in-memory client inside one short window; the override
    // keeps that free of 429s independently of the exact request count (so adding a structural
    // test never trips the limiter), without weakening the production posture. The guard is registered as an
    // APP_GUARD via `useClass` (app.module.ts), so `overrideGuard(ThrottlerGuard)` does NOT reach
    // it (the DI token is APP_GUARD, not the guard class). Instead we override the `ThrottlerStorage`
    // provider the guard injects with a stub that always reports zero hits — so `canActivate`
    // never exceeds the limit. This is TEST-ONLY: the production posture (app.module.ts
    // THROTTLE_LIMIT=120) is untouched, no security control is weakened, and no assertion is
    // dropped. No test asserts 429 behaviour, so nothing depends on the limiter being live here.
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

  it('runs all migrations clean, in order', () => {
    expect(appliedMigrationNames).toEqual([
      'InitProvince1783382400000',
      'AddProvinceClimateNote1783513986800',
      'AddProvinceDetailSections1783701664849',
    ]);
  });

  it('phase 1 — seeding the pilot-5 into an empty DB inserts exactly those 5', () => {
    expect(pilotOnlySeed).toEqual({ inserted: 5, updated: 0, unchanged: 0, total: 5 });
  });

  it('phase 2 — re-seeding the full 81 over the pilot-5 is a MIXED batch', () => {
    // The representative mixed transition (the wave-4 collapse of the old per-wave
    // chain): the 5 pilot rows are already present (no-ops) and the other 76 are new
    // (inserts) — a genuine mixed batch that guards per-row independence. A shared-state
    // regression would mis-count HERE while the homogeneous all-insert (phase 1) and
    // all-no-op (phase 3) cases stayed green. The no-op set spanning one prior batch
    // rather than three does not change what this proves.
    expect(fullMixedSeed).toEqual({ inserted: 76, updated: 0, unchanged: 5, total: 81 });
    // A mixed batch must NOT touch the updated_at of the rows it leaves alone.
    expect(istanbulUpdatedAtAfterFullInsert).toBe(istanbulUpdatedAtAfterPilotInsert);
  });

  it('phase 3 — re-seed is a no-op: no duplicates, no writes, no updated_at churn', async () => {
    // Every row already matches → all 81 unchanged, none updated/inserted.
    expect(reSeed).toEqual({ inserted: 0, updated: 0, unchanged: 81, total: 81 });
    // Still exactly 81 rows.
    const count = await dataSource.getRepository(Province).count();
    expect(count).toBe(81);
    // updated_at was NOT bumped by the no-op re-seed.
    expect(istanbulUpdatedAtAfterReseed).toBe(istanbulUpdatedAtAfterFullInsert);
  });

  it('re-seed detects a DETAIL-ONLY drift and UPDATES (isolates the new comparison lines)', async () => {
    // ISOLATION (review PR#9 IMPORTANT-2): drift EXACTLY ONE new detail field —
    // `economyIndicator` — and leave `landformNoteTr` (which was ALREADY in the comparator
    // before this PR) untouched. So the ONLY thing that can flag drift here is one of the 7
    // comparison lines this PR added: with the old comparator (base + landform only) landform
    // still matches → the row would be mis-counted `unchanged` and the stale null never
    // refreshed. This is the forward-looking case the fix actually guards (a detail-only
    // correction to a province whose landform is already populated), not İstanbul's own
    // null→content landform flip (which drifts under the old code too). Restores at the end.
    const repo = dataSource.getRepository(Province);
    await repo.update({ plateCode: '34' }, { economyIndicator: null });

    const result = await seedGeography(dataSource);
    // Only İstanbul drifted (via the economyIndicator comparison) → 1 updated, 80 untouched.
    expect(result).toEqual({ inserted: 0, updated: 1, unchanged: 80, total: 81 });

    // The drifted field was actually re-written from the seed.
    const istanbul = await repo.findOneByOrFail({ plateCode: '34' });
    expect(istanbul.economyIndicator).toEqual({
      label: 'Türkiye gayrisafi yurt içi hasılasından (GSYH) aldığı pay',
      value: '%29,2',
      year: 2024,
      source:
        'TÜİK, İl Bazında Gayrisafi Yurt İçi Hasıla, 2024 (Bülten no. 53930, yayım tarihi 11.12.2025)',
    });
    // Still exactly 81 rows — an UPDATE, never an insert/delete.
    expect(await repo.count()).toBe(81);
  });

  it('re-seed CLEARS a retracted optional field (merge/compare stay coherent)', async () => {
    // RETRACTION (review PR#9 IMPORTANT-1): a future seed that DROPS a previously-published
    // optional key (to clear a stale value, not replace it) must actually null the column —
    // not just re-flag the row as drifted forever. `withExplicitDetailNulls` makes the omit
    // write an explicit null so `merge` clears it; without that fix `merge` would leave the
    // stale value and the row would churn `updated` on every re-seed. Uses a real seed list
    // with İstanbul's `economyIndicator` key removed, then restores.
    const repo = dataSource.getRepository(Province);
    const istanbulSeed = SEED_PROVINCES.find((p) => p.plateCode === '34');
    if (!istanbulSeed) throw new Error('İstanbul seed (plate 34) not found');
    const istanbulRetracted: ProvinceSeed = { ...istanbulSeed };
    delete istanbulRetracted.economyIndicator; // omit the key entirely (a retraction)
    const retractedList = SEED_PROVINCES.map((p) => (p.plateCode === '34' ? istanbulRetracted : p));

    const result = await seedGeography(dataSource, retractedList);
    // İstanbul drifts (economyIndicator retracted → null) → 1 updated, 80 unchanged.
    expect(result).toEqual({ inserted: 0, updated: 1, unchanged: 80, total: 81 });

    // The retracted field is actually CLEARED in the DB (the coherence fix works).
    const istanbul = await repo.findOneByOrFail({ plateCode: '34' });
    expect(istanbul.economyIndicator).toBeNull();
    // The retraction is a genuine no-op on re-run (does not churn `updated` forever).
    const rerun = await seedGeography(dataSource, retractedList);
    expect(rerun).toEqual({ inserted: 0, updated: 0, unchanged: 81, total: 81 });

    // Restore the canonical, fully-populated İstanbul for the later tests.
    const restore = await seedGeography(dataSource);
    expect(restore).toEqual({ inserted: 0, updated: 1, unchanged: 80, total: 81 });
    expect((await repo.findOneByOrFail({ plateCode: '34' })).economyIndicator).not.toBeNull();
    expect(await repo.count()).toBe(81);
  });

  it('GET /api/provinces returns all 81, plate-ordered, lean (no detail leak)', async () => {
    const res = await request(app.getHttpServer()).get('/api/provinces').expect(200);
    const body = res.body as Array<Record<string, unknown>>;
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(81);
    // lexical plate order across all nine batches (pilot + wave-1..4 + wave-6d + wave-6b + wave-6a
    // + wave-6c) — the complete 81.
    expect(body.map((p) => p.plateCode)).toEqual([
      '01',
      '02',
      '03',
      '04',
      '05',
      '06',
      '07',
      '08',
      '09',
      '10',
      '11',
      '12',
      '13',
      '14',
      '15',
      '16',
      '17',
      '18',
      '19',
      '20',
      '21',
      '22',
      '23',
      '24',
      '25',
      '26',
      '27',
      '28',
      '29',
      '30',
      '31',
      '32',
      '33',
      '34',
      '35',
      '36',
      '37',
      '38',
      '39',
      '40',
      '41',
      '42',
      '43',
      '44',
      '45',
      '46',
      '47',
      '48',
      '49',
      '50',
      '51',
      '52',
      '53',
      '54',
      '55',
      '56',
      '57',
      '58',
      '59',
      '60',
      '61',
      '62',
      '63',
      '64',
      '65',
      '66',
      '67',
      '68',
      '69',
      '70',
      '71',
      '72',
      '73',
      '74',
      '75',
      '76',
      '77',
      '78',
      '79',
      '80',
      '81',
    ]);
    // first row is now Adana (01) — a wave-4 province sorts ahead of everything else.
    expect(body[0]).toMatchObject({
      plateCode: '01',
      nameTr: 'Adana',
      region: 'AKDENIZ',
      slugTr: 'adana',
      slugEn: 'adana',
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
    expect(body).toHaveLength(81);
    // same plate order as the list endpoint (all 81, nine batches)
    expect(body.map((p) => p.plateCode)).toEqual([
      '01',
      '02',
      '03',
      '04',
      '05',
      '06',
      '07',
      '08',
      '09',
      '10',
      '11',
      '12',
      '13',
      '14',
      '15',
      '16',
      '17',
      '18',
      '19',
      '20',
      '21',
      '22',
      '23',
      '24',
      '25',
      '26',
      '27',
      '28',
      '29',
      '30',
      '31',
      '32',
      '33',
      '34',
      '35',
      '36',
      '37',
      '38',
      '39',
      '40',
      '41',
      '42',
      '43',
      '44',
      '45',
      '46',
      '47',
      '48',
      '49',
      '50',
      '51',
      '52',
      '53',
      '54',
      '55',
      '56',
      '57',
      '58',
      '59',
      '60',
      '61',
      '62',
      '63',
      '64',
      '65',
      '66',
      '67',
      '68',
      '69',
      '70',
      '71',
      '72',
      '73',
      '74',
      '75',
      '76',
      '77',
      '78',
      '79',
      '80',
      '81',
    ]);

    // every province's summary numbers must project faithfully from its stored row (not
    // just İstanbul) — guards the pass-through `toMapSummary` mapper against a silent
    // per-row field swap. Cross-checked against the DB rows themselves (the source of
    // truth), NOT a hardcoded value table, so this scales to any future content revision
    // or new il with zero test edits.
    const storedByPlate = new Map(
      (await dataSource.getRepository(Province).find()).map((p) => [p.plateCode, p]),
    );
    for (const row of body) {
      const stored = storedByPlate.get(row.plateCode as string);
      expect(stored).toBeDefined();
      if (!stored) continue; // strict narrowing; the toBeDefined above is the real guard
      expect(row).toMatchObject({
        nameTr: stored.nameTr,
        region: stored.region,
        slugTr: stored.slugTr,
        slugEn: stored.slugEn,
        population: stored.population,
        populationYear: stored.populationYear,
        areaKm2: stored.areaKm2,
        districtCount: stored.districtCount,
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

  // THE round-trip transformer test — a content-free mechanism proof for every custom
  // column transformer (jsonb array + object, numeric(5,2)/(9,6), varchar[]) plus the
  // derived density and null-serialisation. Uses a throwaway fixture row (plate '00', not
  // a real province) with KNOWN synthetic values rather than a seeded il's fact-checked
  // prose, so a legitimate content revision never breaks it. Inserted, read back through
  // the API, then deleted in `finally` so the other tests still see exactly the 81 seeded rows.
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
      latitude: 41.012345,
      longitude: 28.987654,
      neighborPlateCodes: ['34', '41'],
      hydrographyFeatures: [
        { name: 'Test Barajı', type: HydrographyFeatureType.Baraj },
        { name: 'Test Nehri', type: HydrographyFeatureType.Nehir },
      ],
      economyIndicator: { label: 'Test payı', value: '%1,5', year: 2024, source: 'TÜİK Test' },
      urbanizationRate: 93.5,
      netMigrationRate: -12.34,
    });
    // A second throwaway row (plate '99', not a real province) with the two jsonb columns
    // left NULL — proves a null jsonb column serialises to JSON `null` OVER THE WIRE (never
    // [] or {}), the HTTP-layer mechanism the cut per-il Tier-B / base-data tests used to
    // guard. The büyükşehir invariant below only reaches the DB entity, never HTTP, so this
    // fixture is what actually covers null-jsonb serialisation through the controller.
    const nullFixture = repo.create({
      plateCode: '99',
      nameTr: 'Test Null İli',
      slugTr: 'jsonb-roundtrip-null-fixture',
      slugEn: 'jsonb-roundtrip-null-fixture-en',
      region: GeographicRegion.Marmara,
      population: 1000,
      areaKm2: 4,
      hydrographyFeatures: null,
      economyIndicator: null,
    });
    await repo.save([fixture, nullFixture]);

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
      // numeric(9,6) lat/long round-trip through the transformer as real numbers, and the
      // varchar[] neighbour list as an array — the two column transformers otherwise only
      // exercised via a seeded il's hardcoded values (the cut İstanbul round-trip test).
      expect(body.latitude).toBe(41.012345);
      expect(body.longitude).toBe(28.987654);
      expect(body.neighborPlateCodes).toEqual(['34', '41']);
      // Nullable text/scalar columns the fixture leaves unset must serialise as null
      // (never '' or 0) — the null-serialisation mechanism the cut per-il Tier-B /
      // base-data tests proved per row.
      expect(body.introTr).toBeNull();
      expect(body.landformNoteTr).toBeNull();
      expect(body.hydrographyNoteTr).toBeNull();
      expect(body.settlementNoteTr).toBeNull();
      expect(body.climateKoppen).toBeNull();
      expect(body.climateNoteTr).toBeNull();

      // Null JSONB columns must serialise to JSON `null` over HTTP — never [] or {} — so a
      // base-data / Tier-B row that omits them reads back as null through the controller.
      const nullRes = await request(app.getHttpServer())
        .get('/api/provinces/jsonb-roundtrip-null-fixture')
        .expect(200);
      const nullBody = nullRes.body as Record<string, unknown>;
      expect(nullBody.hydrographyFeatures).toBeNull();
      expect(nullBody.economyIndicator).toBeNull();
    } finally {
      // Clean up unconditionally so the exact 81-row count the other tests assume holds
      // even if an assertion above throws.
      await repo.delete({ plateCode: '00' });
      await repo.delete({ plateCode: '99' });
    }
  });

  it('serves a seeded province by its real slug (route + self-consistent identity)', async () => {
    // The synthetic-fixture round-trip above proves the `:slug` route + serializer on a
    // throwaway row; this proves a REAL seeded province is reachable by its stored slug and
    // echoes its own identity. Asserted against the DB row itself (first plate, arbitrary
    // sample) — so it hardcodes NO per-il fact and needs no per-wave edit.
    const sample = await dataSource.getRepository(Province).findOneByOrFail({ plateCode: '01' });
    const res = await request(app.getHttpServer())
      .get(`/api/provinces/${sample.slugTr}`)
      .expect(200);
    expect(res.body as Record<string, unknown>).toMatchObject({
      plateCode: sample.plateCode,
      slugTr: sample.slugTr,
      slugEn: sample.slugEn,
      nameTr: sample.nameTr,
    });
  });

  it('every büyükşehir-caveat-exception province serves a single-sentence settlementNoteTr (rule, not per-il)', async () => {
    // The Tier-B-but-büyükşehir settlementNoteTr EXCEPTION (→ DEC 2026-07-12) as a RULE-level
    // invariant, replacing the per-il Mardin/Erzurum/Malatya/Eskişehir/Trabzon/Ordu tests —
    // the same pattern as `assertKoppenCaveatInvariant`. A province is a büyükşehir-caveat
    // exception exactly when settlementNoteTr is populated while hydrographyFeatures is null
    // (Tier-B depth + the 6360 legal %100 artifact — a Tier-A il carries BOTH, a plain Tier-B
    // il NEITHER). Discovered from the data, so the rule scales to any new exception il with
    // zero new tests. Every such row must carry ONLY the single caveat sentence.
    const rows = await dataSource.getRepository(Province).find();
    const exceptions = rows.filter(
      (p) => p.settlementNoteTr !== null && p.hydrographyFeatures === null,
    );
    // Guard against a vacuous pass: the variant exists in the seed (6 il as of DEC 2026-07-12),
    // so an empty set means the identifying predicate silently stopped matching — not that the
    // rule holds — and must fail here rather than pass green.
    expect(exceptions.length).toBeGreaterThan(0);
    for (const p of exceptions) {
      const note = (p.settlementNoteTr as string).trim();
      // Exactly one sentence: a single terminal period, no interior '. ' sentence break.
      expect(note.endsWith('.')).toBe(true);
      expect(note.split('. ')).toHaveLength(1);
      // It IS the shared 6360 %100 büyükşehir caveat (identical framing across every such il)…
      expect(note).toContain('6360');
      expect(note).toContain('%100');
      expect(note).toContain('büyükşehir statüsündeki illerde');
      // …and ONLY that caveat: no migration narrative restated in prose (it lives in the field).
      expect(note).not.toContain('göç');
      // The %100 urbanizationRate is the legal artifact the caveat frames.
      expect(p.urbanizationRate).toBe(100);
    }
  });

  it('GET /api/provinces/:slug returns 404 for an unknown slug', async () => {
    // All 81 real provinces are now seeded (wave-6c closed the rollout), so there is no longer a
    // "real, valid, but unseeded" province to use here — earlier examples ('bursa', then 'trabzon',
    // then 'hakkari'/'konya') have all been seeded by later waves. The endpoint must still 404 for a
    // slug that matches no province (a plain-ASCII fake that passes any slug shape validation).
    await request(app.getHttpServer()).get('/api/provinces/atlantis').expect(404);
    await request(app.getHttpServer()).get('/api/provinces/narnia').expect(404);
  });

  it('GET /health stays bare (excluded from the /api prefix)', async () => {
    await request(app.getHttpServer()).get('/health').expect(200, { status: 'ok' });
  });
});

/**
 * M1: the Köppen⇒caveat invariant must actually FIRE on a violation, not just be
 * satisfied by the (currently-clean) pilot data — this is what stops the 81-province
 * scale-up from silently shipping a bare OR mismatched Köppen caveat. Pure function,
 * no DB. Since wave-2 the invariant also asserts CORRESPONDENCE (the caveat must name
 * its own code), so a Csa-flavoured caveat on a Cfa row fails — the copy-paste class
 * of bug the mixed-climate waves make possible. Wave-3 adds a THIRD code (Csb): the
 * self-maintaining substring check handles it with zero changes (Csb is absent from
 * the Csa/Cfa caveats and vice versa — no 3-letter code cross-matches), proven below.
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
    // The caveat must NAME its own code (correspondence check) — a real caveat always
    // does ("…bu ili Csa …"), so the fixture mirrors that, not a code-free stub.
    climateNoteTr: "MGM'nin 2023 Köppen sınıflandırması bu ili Csa olarak verir (uyarı).",
    landformNoteTr: null,
  };

  it('passes when a Köppen code carries a corresponding caveat', () => {
    expect(() => assertKoppenCaveatInvariant([VALID_SEED])).not.toThrow();
  });

  it('passes for a Cfa row whose caveat names Cfa (the wave-2 second class)', () => {
    expect(() =>
      assertKoppenCaveatInvariant([
        {
          ...VALID_SEED,
          climateKoppen: 'Cfa',
          climateClassTr: 'Karadeniz iklimi',
          climateNoteTr: "MGM'nin 2023 Köppen sınıflandırması bu ili Cfa olarak verir (uyarı).",
        },
      ]),
    ).not.toThrow();
  });

  it('passes for a Csb row whose caveat names Csb (the wave-3 third class)', () => {
    // Proves the self-maintaining substring check accepts a 3rd code with zero extra
    // work — its caveat names "Csb" and that alone satisfies correspondence.
    expect(() =>
      assertKoppenCaveatInvariant([
        {
          ...VALID_SEED,
          climateKoppen: 'Csb',
          climateClassTr: 'Akdeniz iklimi',
          climateNoteTr: "MGM'nin 2023 Köppen sınıflandırması bu ili Csb olarak verir (uyarı).",
        },
      ]),
    ).not.toThrow();
  });

  it('passes for a Cfb row whose caveat names Cfb (the wave-6d fourth class)', () => {
    // The platform's FOURTH climate class (Cfb, wave-6d Karadeniz-B) — the self-maintaining
    // substring check accepts it with zero extra work: its caveat names "Cfb", and Cfb is
    // pairwise non-substring with Csa/Cfa/Csb so no 4-code set member cross-matches.
    expect(() =>
      assertKoppenCaveatInvariant([
        {
          ...VALID_SEED,
          climateKoppen: 'Cfb',
          climateClassTr: 'Karadeniz iklimi',
          climateNoteTr: "MGM'nin 2023 Köppen sınıflandırması bu ili Cfb olarak verir (uyarı).",
        },
      ]),
    ).not.toThrow();
  });

  it('throws when the caveat does NOT name its code (Cfa caveat on a Cfb row)', () => {
    // Copy-paste guard for the 4th class: a Cfb province that kept a Cfa-flavoured caveat.
    // "Cfa" does NOT substring-satisfy a "Cfb" row (they differ only in the third letter),
    // so correspondence must fail even though a caveat is present.
    expect(() =>
      assertKoppenCaveatInvariant([
        {
          ...VALID_SEED,
          climateKoppen: 'Cfb',
          climateNoteTr: "MGM'nin 2023 Köppen sınıflandırması bu ili Cfa olarak verir (uyarı).",
        },
      ]),
    ).toThrow(/Köppen⇒caveat invariant violated/);
  });

  it.each([
    { code: 'Dfb', className: 'Karasal iklim' },
    { code: 'Dsb', className: 'Karasal iklim' },
    { code: 'Dsa', className: 'Karasal iklim' },
    { code: 'BSk', className: 'Yarı Kurak Step İklimi' },
  ])(
    'passes for a $code row whose caveat names $code (a wave-6b new class)',
    ({ code, className }) => {
      // The FOUR wave-6b codes are the platform's first non-"C" group. The self-maintaining
      // substring check accepts each with zero extra work — its caveat names the code and that
      // alone satisfies correspondence (the three D-codes share ONE class name but each caveat
      // still names its own 3-letter code).
      expect(() =>
        assertKoppenCaveatInvariant([
          {
            ...VALID_SEED,
            climateKoppen: code,
            climateClassTr: className,
            climateNoteTr: `MGM'nin 2023 Köppen sınıflandırması bu ili ${code} olarak verir (uyarı).`,
          },
        ]),
      ).not.toThrow();
    },
  );

  it('throws when the caveat does NOT name its code (Dsb caveat on a Dsa row)', () => {
    // The three D-codes share the SINGLE class name "Karasal iklim", so a copy-paste between
    // them is the wave-6b-specific hazard. Correspondence must still discriminate: a Dsa row
    // that kept a Dsb-flavoured caveat fails, because "Dsa" is absent from the Dsb caveat.
    expect(() =>
      assertKoppenCaveatInvariant([
        {
          ...VALID_SEED,
          climateKoppen: 'Dsa',
          climateClassTr: 'Karasal iklim',
          climateNoteTr: "MGM'nin 2023 Köppen sınıflandırması bu ili Dsb olarak verir (uyarı).",
        },
      ]),
    ).toThrow(/Köppen⇒caveat invariant violated/);
  });

  it('passes for a Dsb row whose caveat names Dsb (the platform first D-group class)', () => {
    // Dsb (Bayburt) → "Karasal iklim" (whole D-group label, DEC 2026-07-12). First non-"C" main
    // group; "Dsb" is pairwise non-substring with Csa/Cfa/Csb/Cfb, so correspondence holds.
    expect(() =>
      assertKoppenCaveatInvariant([
        {
          ...VALID_SEED,
          climateKoppen: 'Dsb',
          climateClassTr: 'Karasal iklim',
          climateNoteTr: "MGM'nin 2023 Köppen sınıflandırması bu ili Dsb olarak verir (uyarı).",
        },
      ]),
    ).not.toThrow();
  });

  it('throws when a Cfa caveat sits on a Cfb row (the wave-6c copy-paste guard)', () => {
    // Cfb and Cfa share the "Karadeniz iklimi" LABEL but are DISTINCT codes — a Cfb row that kept a
    // Cfa-flavoured caveat must fail correspondence (label-equality must NOT mask a code mismatch).
    expect(() =>
      assertKoppenCaveatInvariant([
        {
          ...VALID_SEED,
          climateKoppen: 'Cfb',
          climateClassTr: 'Karadeniz iklimi',
          climateNoteTr: "MGM'nin 2023 Köppen sınıflandırması bu ili Cfa olarak verir (uyarı).",
        },
      ]),
    ).toThrow(/Köppen⇒caveat invariant violated/);
  });

  it('throws when a Köppen code has an empty caveat (bare code)', () => {
    expect(() => assertKoppenCaveatInvariant([{ ...VALID_SEED, climateNoteTr: '' }])).toThrow(
      /Köppen⇒caveat invariant violated/,
    );
  });

  it('throws when the caveat is whitespace-only', () => {
    expect(() => assertKoppenCaveatInvariant([{ ...VALID_SEED, climateNoteTr: '   ' }])).toThrow();
  });

  it('throws when the caveat does NOT name its code (Csa caveat on a Cfa row)', () => {
    // The copy-paste bug the mixed-climate waves make possible: a Cfa province that
    // kept a Csa-flavoured caveat. Presence alone would pass; correspondence must fail.
    expect(() =>
      assertKoppenCaveatInvariant([
        {
          ...VALID_SEED,
          climateKoppen: 'Cfa',
          climateNoteTr: "MGM'nin 2023 Köppen sınıflandırması bu ili Csa olarak verir (uyarı).",
        },
      ]),
    ).toThrow(/Köppen⇒caveat invariant violated/);
  });

  it('throws when the caveat does NOT name its code (Csa caveat on a Csb row)', () => {
    // Same copy-paste bug for the wave-3 third class: a Csb province that kept a
    // Csa-flavoured caveat. Proves "Csa" does NOT substring-satisfy a "Csb" row —
    // the 3rd code is discriminated correctly, not accidentally waved through.
    expect(() =>
      assertKoppenCaveatInvariant([
        {
          ...VALID_SEED,
          climateKoppen: 'Csb',
          climateNoteTr: "MGM'nin 2023 Köppen sınıflandırması bu ili Csa olarak verir (uyarı).",
        },
      ]),
    ).toThrow(/Köppen⇒caveat invariant violated/);
  });

  it('does not require a caveat when there is no Köppen code', () => {
    expect(() =>
      assertKoppenCaveatInvariant([{ ...VALID_SEED, climateKoppen: '', climateNoteTr: '' }]),
    ).not.toThrow();
  });
});

/**
 * Pure, DB-free coverage of the density derivation — critically the NULL/zero
 * branch, which is the NORMAL state of an unseeded province — 0 of 81 now that the seed is
 * COMPLETE, but the unit test still guards the null/zero branch for correctness.
 * The e2e above only exercises the value branch (all 81 seeded provinces have
 * population + area), so without this a regression in the guard (dropped
 * null-check, removed `areaKm2 === 0` guard) could serve a wrong "0" or a
 * non-finite number on a public SEO page with CI staying green. Mirrors the
 * `assertKoppenCaveatInvariant` block.
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
