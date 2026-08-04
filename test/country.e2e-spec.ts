import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NextFunction, Request, Response } from 'express';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { applyGlobalPrefix } from '../src/common/bootstrap';
import { buildDataSourceOptions } from '../src/database/data-source-options';
import { seedWorld, type SeedWorldResult } from '../src/database/seeds/seed-world';
import { SEED_COUNTRIES, type CountrySeed } from '../src/database/seeds/country.seed-data';
import { Continent } from '../src/common/continent.enum';
import { CountryEntityType } from '../src/common/country-entity-type.enum';
import { Country } from '../src/country/entities/country.entity';
import { computeNeighborCount } from '../src/country/country.service';
import { INTERNAL_REQUEST_HEADER } from '../src/common/throttler/trusted-client';

// 44-char dummy secret used ONLY to exercise the REAL trusted-client throttle exemption
// (replaces the former test-only ThrottlerStorage stub). Not a production secret.
const TEST_INTERNAL_TOKEN = 'e2e-trusted-client-token-0123456789-abcdefgh';
// NOTE: AppModule is imported dynamically inside beforeAll — NOT at the top — because
// ConfigModule.forRoot validates the env eagerly at module-load time, so AppModule must
// not load until DATABASE_URL has been set to the container URL.

/**
 * Real-Postgres e2e (Testcontainers) for the Country module. Per CONVENTIONS §2
 * (structural/invariant tests only, never hardcoded literal facts) this suite proves the
 * MECHANISM, not the data: phase 1 seeds the REAL `SEED_COUNTRIES` and asserts only that
 * every row inserts cleanly and the COUNT matches `SEED_COUNTRIES.length` (a structural
 * invariant that scales with the batch and pins no specific country's facts); the table is
 * then cleared and every remaining phase runs on SYNTHETIC fixtures — the `db:seed:world`
 * seed is idempotent (insert / no-op / drift-update / retraction-clear), the derived
 * `neighborCount` is correct, and the public read endpoints serve the right shape under the
 * `/api` prefix (lean list, hover summary, detail, 404). Every fixture uses ISO-reserved
 * private-use codes (ZX/ZY/ZZ, XA/XB) and invented values — zero real country facts, so a
 * legitimate future content revision never breaks the fixture phases. Runs on CI only (needs
 * Docker); locally we run tsc + eslint per CONVENTIONS §2.
 */

// Synthetic fixtures — clearly non-real placeholder ISO alpha-2 codes (ZZ is a formally
// user-assigned/reserved ISO 3166-1 code; ZX/ZY are unassigned — none is a real country):
//   ZX — 1 neighbour, minimal optionals (base-data shape).
//   ZY — island: EMPTY neighbour array (count 0), all optionals absent → null.
//   ZZ — full: 2 neighbours + every optional set (round-trip / detail shape).
// ISO-ASC order is ZX, ZY, ZZ — the deterministic order the endpoints must return.
// CONVENTION (keep this as real batches grow): this suite's synthetic fixtures use exactly
// FIVE ISO 3166-1 private-use codes — ZX, ZY, ZZ (Z-block) and XA, XB (X-block) — none of
// which the standard assigns to a real country, so a fixture never collides with a seeded
// row as coverage scales. Do NOT widen a new fixture to "any private-use code": the broader
// private-use range is NOT free real estate. Two real production iso_code values in
// SEED_COUNTRIES fall inside it — QN (KKTC, self-assigned from the QM–QZ block) and XK
// (Kosova, real-world quasi-standard, World Bank/EU/SWIFT), both seeded in PR #32. XK in
// particular sits in the same XA–XZ block these fixtures draw XA/XB from. A new fixture MUST
// extend the ZX/ZY/ZZ/XA/XB set and MUST NEVER reuse QN or XK, which name real seeded rows.
const ZX: CountrySeed = {
  isoCode: 'ZX',
  nameTr: 'Test Ülkesi ZX',
  nameEn: 'Test Country ZX',
  slugTr: 'test-ulkesi-zx',
  slugEn: 'test-country-zx',
  continent: Continent.Asia,
  neighborIsoCodes: ['ZZ'],
};
const ZY: CountrySeed = {
  isoCode: 'ZY',
  nameTr: 'Test Adası ZY',
  nameEn: 'Test Island ZY',
  slugTr: 'test-adasi-zy',
  slugEn: 'test-island-zy',
  continent: Continent.Oceania,
  neighborIsoCodes: [],
};
const ZZ: CountrySeed = {
  isoCode: 'ZZ',
  nameTr: 'Test Ülkesi ZZ',
  nameEn: 'Test Country ZZ',
  slugTr: 'test-ulkesi-zz',
  slugEn: 'test-country-zz',
  continent: Continent.Europe,
  neighborIsoCodes: ['ZX', 'ZY'],
  isoCodeAlpha3: 'ZZZ',
  unSubregionTr: 'Test Alt-Bölgesi',
  population: 1_000_000,
  populationYear: 2024,
  areaKm2: 500,
  areaIsApproximate: true,
  capitalNameTr: 'Test Başkenti',
  capitalNameEn: 'Test Capital',
  capitalLatitude: 12.345678,
  capitalLongitude: -98.765432,
  officialLanguagesTr: ['Testçe', 'İkinci Dil'],
  currencyNameTr: 'Test Lirası',
  currencyCode: 'ZZL',
  governmentFormTr: 'Test cumhuriyeti',
  independenceNoteTr: '1 Ocak 2000',
  introTr: 'Test Ülkesi ZZ, bu testin sentetik bir ülkesidir.',
  landformNoteTr: 'Düz test arazisi.',
  climateNoteTr: 'Kuzeyde test iklimi, güneyde ikinci test iklimi görülür.',
  hydrographyNoteTr: 'Test Ülkesi ZZ, iki sentetik test nehri ile bir test gölüne sahiptir.',
  sovereigntyNoteTr: 'Test Ülkesi ZZ, sentetik bir egemenlik çerçevesi notuna sahiptir.',
  settlementNoteTr: 'Nüfusun çoğu sentetik test başkentinde toplanır.',
  economyNoteTr: 'Ekonomi tamamen sentetik test kalemlerine dayanır.',
  governanceNoteTr: 'Test Ülkesi ZZ, sentetik bir yönetim çerçevesiyle idare edilir.',
};
const FIXTURES: readonly CountrySeed[] = [ZX, ZY, ZZ];

/**
 * A NON-COUNTRY variant of ZZ, used by the typed-row cases below. It carries the CONSISTENT
 * TRIPLE the seed guard requires — `entityType` plus BOTH approved status labels — and drops
 * `independenceNoteTr`, which invariant 5 forbids on a non-country row. That is deliberate:
 * a fixture that violated the guard would prove nothing except that the guard works.
 */
function asTerritory(seed: CountrySeed): CountrySeed {
  const territory: CountrySeed = {
    ...seed,
    entityType: CountryEntityType.Territory,
    statusLabelTr: 'Test Özerk Bölgesi',
    statusLabelEn: 'Test Autonomous Territory',
  };
  delete territory.independenceNoteTr;
  return territory;
}

describe('Country (e2e)', () => {
  let container: StartedPostgreSqlContainer;
  let dataSource: DataSource;
  let app: INestApplication;

  let appliedMigrationNames: string[];
  let realSeed: SeedWorldResult;
  let insertSeed: SeedWorldResult;
  let reSeed: SeedWorldResult;
  let zzUpdatedAtAfterInsert: string;
  let zzUpdatedAtAfterReseed: string;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
    const url = container.getConnectionUri();

    process.env.DATABASE_URL = url;
    process.env.WEB_ORIGIN = 'http://localhost:3000';
    // Configure the trusted-client secret so the exemption exists for this run; the
    // header-injecting middleware below presents the matching token on every request.
    process.env.INTERNAL_REQUEST_TOKEN = TEST_INTERNAL_TOKEN;

    // 1) Migrations must run clean against a real Postgres, creating the schema.
    dataSource = new DataSource(buildDataSourceOptions(url));
    await dataSource.initialize();
    const applied = await dataSource.runMigrations();
    appliedMigrationNames = applied.map((m) => m.name);

    // 2) Exercise the seed mechanism through its real code path:
    //    Phase 1 — seed the REAL default set (the SEED_COUNTRIES the CLI ships): proves every
    //      row inserts cleanly (no ISO/slug collision, no column overflow) and the count matches.
    //    Phase 2 — reset to a clean table, then seed the 3 synthetic fixtures (all-insert).
    //    Phase 3 — re-seed the SAME 3: pure no-op, proving idempotency + no updated_at churn.
    const repo = dataSource.getRepository(Country);
    realSeed = await seedWorld(dataSource); // default SEED_COUNTRIES — the real pilot batch
    // Clear the real rows so the MECHANISM phases below run on synthetic fixtures in isolation
    //   (their exact-count and ISO-order assertions must not see the real countries).
    await repo.clear();
    insertSeed = await seedWorld(dataSource, FIXTURES);
    zzUpdatedAtAfterInsert = (
      await repo.findOneByOrFail({ isoCode: 'ZZ' })
    ).updatedAt.toISOString();
    reSeed = await seedWorld(dataSource, FIXTURES);
    zzUpdatedAtAfterReseed = (
      await repo.findOneByOrFail({ isoCode: 'ZZ' })
    ).updatedAt.toISOString();

    // 3) Boot the real app against the same DB (no synchronize; schema exists). Load
    //    AppModule now — after DATABASE_URL is set — so its eager env validation sees the
    //    real container URL. A typed require (not a static import) defers module load to here.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { AppModule } = require('../src/app.module') as typeof import('../src/app.module');
    // Exercise the REAL trusted-client throttle exemption (same approach as province.e2e-spec)
    // instead of stubbing the limiter: every suite request presents the internal token exactly
    // as the web SSG build will, so the PRODUCTION guard path is what CI covers. This suite's
    // request volume is under the 120/min window, so the exemption is NOT what keeps it 429-free
    // today (it would pass on volume alone) — the value is fidelity to the real allow path.
    // Production posture untouched (global 120/min stands for anonymous clients); no test
    // asserts 429 behaviour.
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

  it('runs all migrations clean, in order (incl. the country table)', () => {
    expect(appliedMigrationNames).toEqual([
      'InitProvince1783382400000',
      'AddProvinceClimateNote1783513986800',
      'AddProvinceDetailSections1783701664849',
      'InitCountry1784001600000',
      'AddCountryHydrographyNote1784102400000',
      'AddCountrySovereigntyNote1784188800000',
      'AddProvinceClimateNormals1784620800000',
      'InitMarinePoints1785369600000',
      'InitMarineEcmwfStore1785686400000',
      'InitAirQualityStore1785859200000',
      'AddContinentAntarctica1785945600000',
      'AddCountryEntityType1785949200000',
      'AddCountryDetailSections1785952800000',
    ]);
  });

  it('the continent enum type-swap left the ANTARKTIKA value usable and the index intact', async () => {
    // `AddContinentAntarctica` recreates the Postgres enum type and rewrites the column. Two
    // things could go wrong silently and only a real Postgres can tell us: the new value might
    // not be accepted, and `IDX_countries_continent` — which Postgres is supposed to rebuild as
    // part of the column type change — might have vanished with the old type.
    const values = await dataSource.query<Array<{ enumlabel: string }>>(
      `SELECT enumlabel FROM pg_enum e
         JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'continent'
        ORDER BY e.enumsortorder`,
    );
    expect(values.map((row) => row.enumlabel)).toEqual([
      'ASYA',
      'AVRUPA',
      'AFRIKA',
      'KUZEY_AMERIKA',
      'GUNEY_AMERIKA',
      'OKYANUSYA',
      'ANTARKTIKA',
    ]);

    const indexes = await dataSource.query<Array<{ indexname: string }>>(
      `SELECT indexname FROM pg_indexes
        WHERE tablename = 'countries' AND indexname = 'IDX_countries_continent'`,
    );
    expect(indexes).toHaveLength(1);
  });

  it('phase 1 — seeding the real default set inserts every SEED_COUNTRIES row cleanly', () => {
    // The state the CLI produces today: the real pilot batch. Asserted DYNAMICALLY against
    // SEED_COUNTRIES.length (a structural count, never hardcoded facts — CONVENTIONS §2), so
    // it proves the whole seed inserts without a constraint violation and scales as the batch
    // grows, without pinning any specific country's data.
    expect(realSeed).toEqual({
      inserted: SEED_COUNTRIES.length,
      updated: 0,
      unchanged: 0,
      total: SEED_COUNTRIES.length,
    });
  });

  it('phase 2 — seeding the fixtures into an empty table inserts exactly those 3', () => {
    expect(insertSeed).toEqual({ inserted: 3, updated: 0, unchanged: 0, total: 3 });
  });

  it('phase 3 — re-seed is a no-op: no duplicates, no writes, no updated_at churn', async () => {
    expect(reSeed).toEqual({ inserted: 0, updated: 0, unchanged: 3, total: 3 });
    expect(await dataSource.getRepository(Country).count()).toBe(3);
    // A no-op re-seed must NOT bump updated_at (SEO lastmod honesty, §6).
    expect(zzUpdatedAtAfterReseed).toBe(zzUpdatedAtAfterInsert);
  });

  it('re-seed detects a drift and UPDATES only the drifted row', async () => {
    const repo = dataSource.getRepository(Country);
    await repo.update({ isoCode: 'ZZ' }, { population: 42 });

    const result = await seedWorld(dataSource, FIXTURES);
    // Only ZZ drifted → 1 updated, 2 untouched.
    expect(result).toEqual({ inserted: 0, updated: 1, unchanged: 2, total: 3 });
    // The drifted field was re-written from the seed.
    expect((await repo.findOneByOrFail({ isoCode: 'ZZ' })).population).toBe(1_000_000);
    // Still exactly 3 rows — an UPDATE, never an insert/delete.
    expect(await repo.count()).toBe(3);
  });

  it('re-seed CLEARS a retracted optional field (merge/compare stay coherent)', async () => {
    // A future seed that DROPS a previously-published optional key (to clear a stale value,
    // not replace it) must actually null the column — the same coherence fix the province
    // seed carries. Drop ZZ's currencyCode, then restore.
    const repo = dataSource.getRepository(Country);
    const zzRetracted: CountrySeed = { ...ZZ };
    delete zzRetracted.currencyCode; // omit the key entirely (a retraction)
    const retractedList = FIXTURES.map((c) => (c.isoCode === 'ZZ' ? zzRetracted : c));

    const result = await seedWorld(dataSource, retractedList);
    expect(result).toEqual({ inserted: 0, updated: 1, unchanged: 2, total: 3 });
    // The retracted field is actually CLEARED in the DB.
    expect((await repo.findOneByOrFail({ isoCode: 'ZZ' })).currencyCode).toBeNull();
    // The retraction is a genuine no-op on re-run (does not churn `updated` forever).
    const rerun = await seedWorld(dataSource, retractedList);
    expect(rerun).toEqual({ inserted: 0, updated: 0, unchanged: 3, total: 3 });

    // Restore the canonical fixture for the HTTP tests below.
    const restore = await seedWorld(dataSource, FIXTURES);
    expect(restore).toEqual({ inserted: 0, updated: 1, unchanged: 2, total: 3 });
    expect((await repo.findOneByOrFail({ isoCode: 'ZZ' })).currencyCode).toBe('ZZL');
    expect(await repo.count()).toBe(3);
  });

  it('REFUSES a row that steals Türkiye’s slug, and writes NOTHING when it does', async () => {
    // THE RULE INVERTED, AND THE GUARD SURVIVED. It used to be "TR is never a country row"
    // (PR #23 M5); DEC 2026-08-01j made `/dunya/turkiye` a real profile. What is still true — and
    // what this asserts — is that the path belongs to the TR row ALONE: any other row carrying
    // that slug IS a duplicate page. Nothing in the pipeline objects to such a row on its own
    // (it inserts cleanly and serves a valid payload), which is why the rule is a guard.
    //
    // The unit spec pins the guard's own logic without a database. What only a real Postgres can
    // prove is what this asserts: the refusal happens on the WRITE path and the batch is rejected
    // WHOLE — no partial seed, no orphan row, no count change.
    const repo = dataSource.getRepository(Country);
    const before = await repo.count();

    const slugThief: CountrySeed = {
      isoCode: 'XB',
      nameTr: 'Test Ülkesi XB',
      nameEn: 'Test Country XB',
      slugTr: 'turkiye',
      slugEn: 'turkey',
      continent: Continent.Asia,
      neighborIsoCodes: [],
    };
    // A valid NEW row ahead of it (XA — a private-use code absent from the fixtures): had the
    // guard been per-row inside the transaction, this one would have been written before the
    // throw. It must not be.
    const goodRow: CountrySeed = {
      isoCode: 'XA',
      nameTr: 'Test Ülkesi XA',
      nameEn: 'Test Country XA',
      slugTr: 'test-ulkesi-xa',
      slugEn: 'test-country-xa',
      continent: Continent.Africa,
      neighborIsoCodes: [],
    };
    await expect(seedWorld(dataSource, [goodRow, slugThief])).rejects.toThrow(/routing key/);

    expect(await repo.count()).toBe(before);
    expect(await repo.findOneBy({ isoCode: 'XB' })).toBeNull();
    expect(await repo.findOneBy({ isoCode: 'XA' })).toBeNull();
    // …and the slug that would have become a duplicate `/dunya/turkiye` resolves to nothing.
    await request(app.getHttpServer()).get('/api/countries/turkiye').expect(404);
  });

  it('REFUSES an inconsistent typed row on the write path, whole batch, nothing written', async () => {
    // One representative of the OTHER invariants, proved end-to-end rather than only in the unit
    // spec: a `special` row publishing population 0 ("zero people live here" — a claim nobody
    // meant to make). The unit spec covers all seven; this proves they reach the write path.
    const repo = dataSource.getRepository(Country);
    const before = await repo.count();
    const badSpecial: CountrySeed = {
      isoCode: 'XA',
      nameTr: 'Test Bölgesi XA',
      nameEn: 'Test Region XA',
      slugTr: 'test-bolgesi-xa',
      slugEn: 'test-region-xa',
      continent: Continent.Antarctica,
      neighborIsoCodes: [],
      entityType: CountryEntityType.Special,
      statusLabelTr: 'Test Özel Statü',
      statusLabelEn: 'Test Special Status',
      population: 0,
    };
    await expect(seedWorld(dataSource, [...FIXTURES, badSpecial])).rejects.toThrow(
      /population absent/,
    );
    expect(await repo.count()).toBe(before);
    expect(await repo.findOneBy({ isoCode: 'XA' })).toBeNull();
  });

  it('runs a full insert/no-op/drift/retraction cycle on a NEW narrative field', async () => {
    // SPEC §8 PR-A criterion 5, on `governanceNoteTr`. Insert + no-op are already covered by
    // phases 2/3 (ZZ carries the field). What is left is the pair that actually exercises the
    // widened `rowMatchesSeed` and `normalizeSeed`: a drift must be detected and rewritten, and
    // a RETRACTION — dropping the key from the seed — must genuinely clear the column rather
    // than leave the row drifted forever.
    const repo = dataSource.getRepository(Country);
    await repo.update({ isoCode: 'ZZ' }, { governanceNoteTr: 'elle değiştirilmiş metin' });

    const drift = await seedWorld(dataSource, FIXTURES);
    expect(drift).toEqual({ inserted: 0, updated: 1, unchanged: 2, total: 3 });
    expect((await repo.findOneByOrFail({ isoCode: 'ZZ' })).governanceNoteTr).toBe(
      ZZ.governanceNoteTr,
    );

    const zzRetracted: CountrySeed = { ...ZZ };
    delete zzRetracted.governanceNoteTr;
    const retracted = FIXTURES.map((c) => (c.isoCode === 'ZZ' ? zzRetracted : c));
    expect(await seedWorld(dataSource, retracted)).toEqual({
      inserted: 0,
      updated: 1,
      unchanged: 2,
      total: 3,
    });
    expect((await repo.findOneByOrFail({ isoCode: 'ZZ' })).governanceNoteTr).toBeNull();
    // The retraction settles — it does not churn `updated` forever.
    expect(await seedWorld(dataSource, retracted)).toEqual({
      inserted: 0,
      updated: 0,
      unchanged: 3,
      total: 3,
    });

    // Restore the canonical fixture for the HTTP tests below.
    expect(await seedWorld(dataSource, FIXTURES)).toEqual({
      inserted: 0,
      updated: 1,
      unchanged: 2,
      total: 3,
    });
  });

  it('detects a drift in entityType and the status labels, and settles back', async () => {
    // `entity_type` is NOT NULL with a DEFAULT, so it cannot ride the `?? null` idiom the other
    // optional fields use. This proves the pair that replaces it: a row retyped in the seed is
    // detected as drifted and rewritten, and returning it to an UNMARKED (`country`) seed row
    // clears the labels and puts the type back to the default — not "leaves it alone".
    const repo = dataSource.getRepository(Country);
    const territory = asTerritory(ZZ);
    const retyped = FIXTURES.map((c) => (c.isoCode === 'ZZ' ? territory : c));

    expect(await seedWorld(dataSource, retyped)).toEqual({
      inserted: 0,
      updated: 1,
      unchanged: 2,
      total: 3,
    });
    const asTerritoryRow = await repo.findOneByOrFail({ isoCode: 'ZZ' });
    expect(asTerritoryRow.entityType).toBe(CountryEntityType.Territory);
    expect(asTerritoryRow.statusLabelTr).toBe('Test Özerk Bölgesi');
    expect(asTerritoryRow.statusLabelEn).toBe('Test Autonomous Territory');
    expect(asTerritoryRow.independenceNoteTr).toBeNull();
    // Re-running the same list is a genuine no-op (the NOT-NULL default compares correctly).
    expect(await seedWorld(dataSource, retyped)).toEqual({
      inserted: 0,
      updated: 0,
      unchanged: 3,
      total: 3,
    });

    // Back to the canonical (unmarked ⇒ country) fixture: the type resets and the labels clear.
    expect(await seedWorld(dataSource, FIXTURES)).toEqual({
      inserted: 0,
      updated: 1,
      unchanged: 2,
      total: 3,
    });
    const restored = await repo.findOneByOrFail({ isoCode: 'ZZ' });
    expect(restored.entityType).toBe(CountryEntityType.Country);
    expect(restored.statusLabelTr).toBeNull();
    expect(restored.statusLabelEn).toBeNull();
  });

  it('accepts and serves a special row on the new ANTARKTIKA continent', async () => {
    // The `pg_enum` assertion above proves the label was DECLARED. Only an insert proves it is
    // USABLE — the classic failure mode of the enum type-swap form is a value that exists in the
    // catalogue while the column still points at the old type. This also round-trips the whole
    // typed shape (special + labels + approximate area + absent population) through both DTOs.
    const repo = dataSource.getRepository(Country);
    const special: CountrySeed = {
      isoCode: 'XA',
      nameTr: 'Test Kıtası XA',
      nameEn: 'Test Continent XA',
      slugTr: 'test-kitasi-xa',
      slugEn: 'test-continent-xa',
      continent: Continent.Antarctica,
      neighborIsoCodes: [],
      entityType: CountryEntityType.Special,
      statusLabelTr: 'Test Özel Statü',
      statusLabelEn: 'Test Special Status',
      areaKm2: 1_400_000,
      areaIsApproximate: true,
    };
    expect(await seedWorld(dataSource, [...FIXTURES, special])).toEqual({
      inserted: 1,
      updated: 0,
      unchanged: 3,
      total: 4,
    });

    const detail = await request(app.getHttpServer())
      .get('/api/countries/test-kitasi-xa')
      .expect(200);
    const body = detail.body as Record<string, unknown>;
    expect(body.continent).toBe('ANTARKTIKA');
    expect(body.entityType).toBe('special');
    expect(body.statusLabelTr).toBe('Test Özel Statü');
    expect(body.statusLabelEn).toBe('Test Special Status');
    expect(body.areaIsApproximate).toBe(true);
    // "not applicable" is ABSENT, never 0 — the guard's invariant 3, visible on the payload.
    expect(body.population).toBeNull();
    expect(body.independenceNoteTr).toBeNull();

    // Clean up so the fixture-count assertions below still describe exactly 3 rows.
    await repo.delete({ isoCode: 'XA' });
    expect(await repo.count()).toBe(3);
  });

  it('GET /api/countries returns all rows, ISO-ordered, lean (no detail leak)', async () => {
    const res = await request(app.getHttpServer()).get('/api/countries').expect(200);
    const body = res.body as Array<Record<string, unknown>>;
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(3);
    // lexical ISO-code order.
    expect(body.map((c) => c.isoCode)).toEqual(['ZX', 'ZY', 'ZZ']);
    expect(body[0]).toMatchObject({
      isoCode: 'ZX',
      nameTr: 'Test Ülkesi ZX',
      nameEn: 'Test Country ZX',
      continent: 'ASYA',
      slugTr: 'test-ulkesi-zx',
      slugEn: 'test-country-zx',
    });
    // lean payload must NOT carry detail-only fields.
    expect(body[0]).not.toHaveProperty('population');
    expect(body[0]).not.toHaveProperty('neighborIsoCodes');
    expect(body[0]).not.toHaveProperty('neighborCount');
    expect(body[0]).not.toHaveProperty('capitalLatitude');
    // The hub list is UNCHANGED by this wave (SPEC §4.1): the /dunya hub uses name + slug +
    // continent only, so the new fields deliberately did NOT leak into it.
    expect(body[0]).not.toHaveProperty('entityType');
    expect(body[0]).not.toHaveProperty('statusLabelTr');
    expect(body[0]).not.toHaveProperty('statusLabelEn');
    expect(body[0]).not.toHaveProperty('areaIsApproximate');
    expect(Object.keys(body[0] ?? {}).sort()).toEqual([
      'continent',
      'isoCode',
      'nameEn',
      'nameTr',
      'slugEn',
      'slugTr',
    ]);
  });

  it('GET /api/countries/map-summary serves the hover stats incl. derived neighborCount', async () => {
    // The static `map-summary` path must resolve to this endpoint, NOT be captured by the
    // `:slug` route — a 200 array proves the route order.
    const res = await request(app.getHttpServer()).get('/api/countries/map-summary').expect(200);
    const body = res.body as Array<Record<string, unknown>>;
    expect(body).toHaveLength(3);
    expect(body.map((c) => c.isoCode)).toEqual(['ZX', 'ZY', 'ZZ']);

    // neighborCount is DERIVED from each row's stored neighbour array (cross-checked against
    // the DB rows, not a hardcoded table, so it scales to any future data with zero edits).
    const storedByIso = new Map(
      (await dataSource.getRepository(Country).find()).map((c) => [c.isoCode, c]),
    );
    for (const row of body) {
      const stored = storedByIso.get(row.isoCode as string);
      expect(stored).toBeDefined();
      if (!stored) continue;
      expect(row).toMatchObject({
        nameTr: stored.nameTr,
        nameEn: stored.nameEn,
        continent: stored.continent,
        entityType: stored.entityType,
        statusLabelTr: stored.statusLabelTr,
        statusLabelEn: stored.statusLabelEn,
        population: stored.population,
        areaKm2: stored.areaKm2,
        areaIsApproximate: stored.areaIsApproximate,
        neighborCount: stored.neighborIsoCodes.length,
      });
    }

    // Unseeded rows read as the NOT-NULL defaults, not as null: an unmarked row is a country
    // with an exact area, which is what the web branches on.
    const zx = body.find((c) => c.isoCode === 'ZX');
    expect(zx).toMatchObject({
      entityType: 'country',
      statusLabelTr: null,
      statusLabelEn: null,
      areaIsApproximate: false,
    });
    // The island (empty neighbour array) derives to 0, not null.
    expect(body.find((c) => c.isoCode === 'ZY')?.neighborCount).toBe(0);
    expect(body.find((c) => c.isoCode === 'ZZ')?.neighborCount).toBe(2);

    // purpose-sized payload: identity + the 3 hover stats ONLY — no raw neighbour array,
    // no capital coordinates, no narrative prose.
    const zz = body.find((c) => c.isoCode === 'ZZ');
    expect(zz).not.toHaveProperty('neighborIsoCodes');
    expect(zz).not.toHaveProperty('capitalLatitude');
    expect(zz).not.toHaveProperty('climateNoteTr');
    expect(zz).not.toHaveProperty('hydrographyNoteTr');
    expect(zz).not.toHaveProperty('sovereigntyNoteTr');
    // The three NEW narrative fields are detail-only too — the card never carries prose.
    expect(zz).not.toHaveProperty('settlementNoteTr');
    expect(zz).not.toHaveProperty('economyNoteTr');
    expect(zz).not.toHaveProperty('governanceNoteTr');
  });

  it('GET /api/countries/:slug round-trips transformers + derives neighborCount (full row)', async () => {
    // ZZ carries every column set — proves the numeric(9,6) transformer, the varchar[] +
    // text[] arrays, the derived neighborCount, and ISO-slug routing (served by its TR slug).
    const res = await request(app.getHttpServer()).get('/api/countries/test-ulkesi-zz').expect(200);
    const body = res.body as Record<string, unknown>;

    expect(body.isoCode).toBe('ZZ');
    expect(body.isoCodeAlpha3).toBe('ZZZ');
    // numeric(9,6) capital coordinates come back through the transformer as real, signed numbers.
    expect(body.capitalLatitude).toBe(12.345678);
    expect(body.capitalLongitude).toBe(-98.765432);
    // arrays survive the round-trip intact (order preserved).
    expect(body.neighborIsoCodes).toEqual(['ZX', 'ZY']);
    expect(body.officialLanguagesTr).toEqual(['Testçe', 'İkinci Dil']);
    // derived count matches the stored array length.
    expect(body.neighborCount).toBe(2);
    // climate is free prose, and there is NO structured Köppen field at country scale.
    expect(body.climateNoteTr).toBe('Kuzeyde test iklimi, güneyde ikinci test iklimi görülür.');
    expect(body).not.toHaveProperty('climateKoppen');
    expect(body).not.toHaveProperty('climateClassTr');
    // hydrography note round-trips as free prose (mirrors the province field); the country
    // model has only the note, NO structured hydrography feature list.
    expect(body.hydrographyNoteTr).toBe(
      'Test Ülkesi ZZ, iki sentetik test nehri ile bir test gölüne sahiptir.',
    );
    expect(body).not.toHaveProperty('hydrographyFeatures');
    // sovereignty note round-trips as free prose (the single broad recognition-framing field).
    expect(body.sovereigntyNoteTr).toBe(
      'Test Ülkesi ZZ, sentetik bir egemenlik çerçevesi notuna sahiptir.',
    );
    // the three new detail sections round-trip as free prose too.
    expect(body.settlementNoteTr).toBe('Nüfusun çoğu sentetik test başkentinde toplanır.');
    expect(body.economyNoteTr).toBe('Ekonomi tamamen sentetik test kalemlerine dayanır.');
    expect(body.governanceNoteTr).toBe(
      'Test Ülkesi ZZ, sentetik bir yönetim çerçevesiyle idare edilir.',
    );
    // the ≈ flag round-trips as a real boolean, not a stringified one.
    expect(body.areaIsApproximate).toBe(true);
    // an unmarked row is a country, with no card label (the guard's invariant 2).
    expect(body.entityType).toBe('country');
    expect(body.statusLabelTr).toBeNull();
    expect(body.statusLabelEn).toBeNull();
  });

  it('GET /api/countries/:slug resolves the EN slug too, and nulls serialise as null', async () => {
    // ZY is an island with every optional absent — proves EN-slug routing AND that unset
    // nullable columns (scalars + arrays) serialise to JSON `null`, never '' / 0 / [].
    const res = await request(app.getHttpServer()).get('/api/countries/test-island-zy').expect(200);
    const body = res.body as Record<string, unknown>;

    expect(body.isoCode).toBe('ZY');
    // empty neighbour array → count 0 (a correct fact, not missing data).
    expect(body.neighborIsoCodes).toEqual([]);
    expect(body.neighborCount).toBe(0);
    // every unset optional is null.
    expect(body.isoCodeAlpha3).toBeNull();
    expect(body.population).toBeNull();
    expect(body.capitalNameTr).toBeNull();
    expect(body.capitalLatitude).toBeNull();
    expect(body.officialLanguagesTr).toBeNull();
    expect(body.currencyCode).toBeNull();
    expect(body.climateNoteTr).toBeNull();
    expect(body.independenceNoteTr).toBeNull();
    // the new nullable hydrography note serialises to null when unset (round-trips absent).
    expect(body.hydrographyNoteTr).toBeNull();
    // the new nullable sovereignty note serialises to null when unset (absent for ordinary
    // countries — the field exists only for contested-status entities).
    expect(body.sovereigntyNoteTr).toBeNull();
    // the three new detail sections serialise to null when unset.
    expect(body.settlementNoteTr).toBeNull();
    expect(body.economyNoteTr).toBeNull();
    expect(body.governanceNoteTr).toBeNull();
    // the two NOT-NULL-with-default fields are the exception: absent in the seed still reads as
    // a real value, never null. A `null` here would mean the DTO leaked the DB's "unset".
    expect(body.entityType).toBe('country');
    expect(body.areaIsApproximate).toBe(false);
    expect(body.statusLabelTr).toBeNull();
    expect(body.statusLabelEn).toBeNull();
  });

  it('GET /api/countries/:slug returns 404 for an unknown slug', async () => {
    await request(app.getHttpServer()).get('/api/countries/atlantis').expect(404);
    await request(app.getHttpServer()).get('/api/countries/narnia').expect(404);
  });

  it('sets Cache-Control on a 2xx read but NOT on an error response', async () => {
    // The @CacheControl interceptor sets the header only on a successful response, so an
    // error (here a 404) never carries a cacheable directive — a caching intermediary
    // cannot serve/prolong a resolved outage (PR #23 I1).
    const ok = await request(app.getHttpServer()).get('/api/countries').expect(200);
    expect(ok.headers['cache-control']).toBe('public, max-age=300, stale-while-revalidate=86400');
    const missing = await request(app.getHttpServer()).get('/api/countries/atlantis').expect(404);
    expect(missing.headers['cache-control']).toBeUndefined();
  });

  it('rolls the WHOLE seed back on a mid-batch row failure (zero partial inserts)', async () => {
    // The transactional guarantee seedWorld documents — load-bearing the moment NOVA's
    // ~195-row real dataset replaces the empty stub (PR #23 I2). Force a mid-batch failure:
    // two NEW rows sharing one slug_tr — the first inserts inside the transaction, the
    // second trips the UNIQUE(slug_tr) constraint, and that must roll the first back too.
    // Uses user-assigned ISO codes (XA/XB — never real countries) not present in the DB.
    const repo = dataSource.getRepository(Country);
    const before = await repo.count();
    const good: CountrySeed = {
      isoCode: 'XA',
      nameTr: 'Rollback A',
      nameEn: 'Rollback A',
      slugTr: 'rollback-dup-slug',
      slugEn: 'rollback-a-en',
      continent: Continent.Africa,
      neighborIsoCodes: [],
    };
    // slugTr is inherited from `good` (NOT overridden) → collides on the UNIQUE(slug_tr).
    const badDuplicate: CountrySeed = {
      ...good,
      isoCode: 'XB',
      nameEn: 'Rollback B',
      slugEn: 'rollback-b-en',
    };

    // The run rejects, and the row-context wrapper names the offending row (XB).
    await expect(seedWorld(dataSource, [good, badDuplicate])).rejects.toThrow(/XB/);
    // Zero partial inserts: the earlier good row (XA) was rolled back → count unchanged.
    expect(await repo.count()).toBe(before);
    expect(await repo.findOne({ where: { isoCode: 'XA' } })).toBeNull();
  });
});

/**
 * `computeNeighborCount` is the single source of truth for the "komşu ülke sayısı"
 * derived stat (the "ilçe sayısı" replacement). A pure function, no DB — proves the
 * count rule directly, including the island (empty-array → 0) case.
 */
describe('computeNeighborCount', () => {
  it('returns the neighbour-array length, 0 for an island', () => {
    // Synthetic placeholder codes only (no real country facts in tests — CONVENTIONS §2).
    expect(computeNeighborCount(['ZX', 'ZY', 'ZZ'])).toBe(3);
    expect(computeNeighborCount([])).toBe(0);
  });
});
