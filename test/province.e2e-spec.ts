import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NextFunction, Request, Response } from 'express';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { applyGlobalPrefix } from '../src/common/bootstrap';
import { buildDataSourceOptions } from '../src/database/data-source-options';
import {
  assertCurriculumMappingInvariant,
  assertKoppenCaveatInvariant,
  isUnexpectedRegionPair,
  seedGeography,
  type SeedGeographyResult,
} from '../src/database/seeds/seed-geography';
// PILOT_PROVINCES / SEED_PROVINCES are imported ONLY to drive the seed-rollout
// phases below (a code-path input): empty→pilot then the full set, one representative
// mixed transition rather than one phase per historical wave.
import {
  CURRICULUM_CLIMATE_NAMES_TR,
  PILOT_PROVINCES,
  SEED_PROVINCES,
  type ProvinceSeed,
} from '../src/database/seeds/province.seed-data';
import { GeographicRegion } from '../src/common/geographic-region.enum';
import { Province } from '../src/province/entities/province.entity';
import { computePopulationDensity } from '../src/province/province.service';
import { INTERNAL_REQUEST_HEADER } from '../src/common/throttler/trusted-client';
import { HydrographyFeatureType } from '../src/province/province.types';

// 44-char dummy secret used ONLY to exercise the REAL trusted-client throttle exemption
// (replaces the former test-only ThrottlerStorage stub). Not a production secret — no
// deployed value derives from it.
const TEST_INTERNAL_TOKEN = 'e2e-trusted-client-token-0123456789-abcdefgh';
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
    // Configure the trusted-client secret so the exemption exists for this run; the
    // header-injecting middleware below presents the matching token on every request.
    process.env.INTERNAL_REQUEST_TOKEN = TEST_INTERNAL_TOKEN;

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
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    applyGlobalPrefix(app);
    // Exercise the REAL trusted-client throttle exemption instead of stubbing the limiter:
    // every request here presents the internal token exactly as the web SSG build will, so the
    // PRODUCTION guard path (config read + safe-method scope + constant-time compare + skip) is
    // what the suite covers — not a fake ThrottlerStorage. This suite's own request volume is
    // well under the 120/min window, so the exemption is NOT what keeps the suite 429-free today
    // (it would pass on volume alone); the value is fidelity to the real allow path. Production
    // posture is untouched (global 120/min stands for anonymous clients); no test asserts 429.
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

  it('runs all migrations clean, in order', () => {
    // The country migrations are registered in the shared migrations array, so they run
    // here too (this suite migrates the whole schema) — they just touch a table this suite
    // does not exercise. The dedicated country coverage lives in country.e2e-spec.ts.
    //
    // THIS IS THE SECOND COPY of the list, and that is deliberate rather than an oversight:
    // both suites migrate the WHOLE schema, so both are entitled to state what a clean
    // migration run produces. The cost is that adding a migration means editing two lists —
    // and forgetting the second one fails loudly right here, which is the point. (It caught
    // exactly that on this PR's first CI run.)
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
      'AddProvinceClimateCurriculum1785974400000',
    ]);
  });

  // The climate-narrative waves, identified by PLATE CODE as wave MEMBERSHIP — never by prose
  // content (CONVENTIONS §2 bars literal-text assertions in tests; byte-for-byte fidelity of the
  // prose is gated separately by the seed-transcription roundtrip,
  // `oneoff-n<wave>-province-climate.ts check`).
  //
  // ## The list is currently EMPTY, and that is a declared state, not a disabled test
  // The N1 (9) and N2 (10) waves were written against the MGM series and quoted its numbers. The
  // published series is now ERA5-Land 1991-2020, so those 19 blocks were removed from the seed in
  // the same PR that swapped it (→ DEC 2026-08-04c, Q3). The invariant this test protects is
  // unchanged and is NOT weakened: "the set of provinces carrying a narrative equals the set this
  // file declares". It simply now asserts 0 of 81, positively, rather than 19 of 81.
  //
  // The mechanism this preserves is the one that matters: a rewrite wave that seeds prose without
  // adding its plate codes here FAILS, exactly as a wave that dropped one always did. Emptying the
  // list without emptying the seed would fail too. Add the new wave's codes when it lands.
  const N1_CLIMATE_NARRATIVE_PLATES: string[] = [];
  const N2_CLIMATE_NARRATIVE_PLATES: string[] = [];
  const CLIMATE_NARRATIVE_PLATES = new Set([
    ...N1_CLIMATE_NARRATIVE_PLATES,
    ...N2_CLIMATE_NARRATIVE_PLATES,
  ]);

  it('the declared waves are disjoint (a later wave never silently re-seeds an earlier one)', () => {
    // Guards the wave bookkeeping itself: with an overlap the Set would collapse and the count
    // guard below would still pass while one province was authored twice.
    expect(CLIMATE_NARRATIVE_PLATES.size).toBe(
      N1_CLIMATE_NARRATIVE_PLATES.length + N2_CLIMATE_NARRATIVE_PLATES.length,
    );
  });

  it('serves climateNarrativeTr for exactly the declared wave provinces, null elsewhere; climateNormals still empty', async () => {
    // Structural, not textual:
    //   1. the migration + entity mapping work end-to-end against real Postgres (a jsonb
    //      column the entity mis-maps would fail to select here), and
    //   2. climate NARRATIVE prose is populated for EXACTLY the declared wave provinces and null
    //      for the rest — asserted by plate-code membership + a count guard, so a miswired seed
    //      that drops or adds a province fails loudly. climateNormals stays null: the offline
    //      climate IMPORT (load phase) is not run in this seed-only e2e.
    const repo = dataSource.getRepository(Province);
    const provinces = await repo.find();

    expect(provinces).toHaveLength(81);
    for (const province of provinces) {
      expect(province.climateNormals).toBeNull();
      if (CLIMATE_NARRATIVE_PLATES.has(province.plateCode)) {
        expect(typeof province.climateNarrativeTr).toBe('string');
        expect((province.climateNarrativeTr ?? '').trim().length).toBeGreaterThan(0);
      } else {
        expect(province.climateNarrativeTr).toBeNull();
      }
    }
    const withNarrative = provinces.filter((province) => province.climateNarrativeTr !== null);
    expect(withNarrative).toHaveLength(CLIMATE_NARRATIVE_PLATES.size);
  });

  it('serves a curriculum climate name for every province, from the closed vocabulary', async () => {
    // STRUCTURAL, not per-il (→ CONVENTIONS §2): no `it()` here says "Ankara is İç Anadolu
    // karasal". The mapping's own correctness is checked against its source by the M1 lane
    // (`oneoff-m1-province-curriculum.ts check`), which is where a wrong NAME belongs; this
    // proves the column survives the migration + entity mapping + the seed round-trip, and
    // that no row can reach Postgres carrying a name outside the eight.
    const rows = await dataSource.getRepository(Province).find();
    const vocabulary = new Set<string>(CURRICULUM_CLIMATE_NAMES_TR);

    expect(rows).toHaveLength(81);
    for (const row of rows) {
      // The header the web renders pairs the two; a Köppen code without a name renders half.
      if (row.climateKoppen !== null && row.climateKoppen !== '') {
        expect(typeof row.climateCurriculumNameTr).toBe('string');
        expect(vocabulary.has(row.climateCurriculumNameTr ?? '')).toBe(true);
      }
    }
    // Every one of the eight names is actually IN USE. A vocabulary entry no row carries is
    // either a dead constant or, far worse, a rename that silently emptied a class — and the
    // membership loop above cannot see either, because "no row uses it" passes it trivially.
    const used = new Set(rows.map((row) => row.climateCurriculumNameTr));
    for (const name of CURRICULUM_CLIMATE_NAMES_TR) expect(used.has(name)).toBe(true);
  });

  it('serves an explanation note for every out-of-region name, and for at least 15 rows', async () => {
    // The structural form of DEC 2026-08-05f #4, expressed through the same
    // `isUnexpectedRegionPair` table the seed invariant uses — so this asserts the RULE holds
    // end to end (seed -> Postgres -> entity), not a list of province names.
    const rows = await dataSource.getRepository(Province).find();
    const seedByPlate = new Map(SEED_PROVINCES.map((seed) => [seed.plateCode, seed]));

    const unexpected = rows.filter((row) => {
      const seed = seedByPlate.get(row.plateCode);
      return seed !== undefined && isUnexpectedRegionPair(seed);
    });
    // FLOOR, not equality (the PR #96 precedent): growth is free, SHRINKAGE is the danger. If a
    // future rename moved a province into an "expected" pair the loop below would quietly check
    // fewer rows, with no failure anywhere. The floor therefore TRACKS the set: today's set is
    // EIGHT (brief §6, Denizli added by DEC 2026-08-06b), so the floor is eight. Leaving it at
    // the seven this guard shipped with would have left room for exactly one province to drop
    // out unnoticed — which is the failure the floor exists to catch (→ PR #97 review, Atlas
    // approved raising it). Raise it with the set whenever §6 grows.
    expect(unexpected.length).toBeGreaterThanOrEqual(8);
    for (const row of unexpected) {
      expect(typeof row.climateCurriculumNoteTr).toBe('string');
      expect((row.climateCurriculumNoteTr ?? '').trim().length).toBeGreaterThan(0);
    }

    // The eleven boundary-reading notes (DEC 2026-08-05f #3 + DEC 2026-08-06b) cannot be derived
    // from the data — see `assertCurriculumMappingInvariant`'s docblock — so the only guard
    // against them being dropped WHOLESALE is a floor count. Eleven boundary rows + eight
    // out-of-region rows, four provinces in both = 15.
    const withNote = rows.filter((row) => row.climateCurriculumNoteTr !== null);
    expect(withNote.length).toBeGreaterThanOrEqual(15);
    for (const row of withNote) {
      // A note without a name is an orphan paragraph on the page — and an EMPTY name renders the
      // same orphan, so the assertion is on content, not on the JS type (→ PR #97, TA97-M1).
      expect((row.climateCurriculumNameTr ?? '').trim().length).toBeGreaterThan(0);
      expect((row.climateCurriculumNoteTr ?? '').trim().length).toBeGreaterThan(0);
    }
  });

  it('carries the shared A-2 sentence on every Köppen caveat, and only there', async () => {
    // A-2 (→ AT-10 / Atlas AK-4) states the Köppen-vs-curriculum tension ONCE, class-level, for
    // all 81 provinces — which is why Trabzon, Sinop and Çankırı need no per-province note. Two
    // properties make that true, and both are asserted rather than assumed:
    //   1. EVERY caveat carries it (otherwise the provinces relying on it are uncovered), and
    //   2. it is CODE-AGNOSTIC — no Köppen code, no province name, no number. That is what lets
    //      all eight caveat constants share one body, and it is precisely what keeps
    //      `assertKoppenCaveatInvariant`'s "each note names its own code" check meaningful: if
    //      this sentence named a code, every note would contain a code it does not belong to.
    const rows = await dataSource.getRepository(Province).find();
    const A2_OPENING = 'Köppen sınıflandırması ile ders kitaplarındaki bölgesel iklim adları';
    // THE WHOLE SENTENCE, not just its opening (→ PR #97 review, CR97-M6 / SFH97-M1). The
    // derivation below can only prove the eight constants AGREE with each other, and the real
    // append was one mechanical edit across all eight — the failure it cannot see is that same
    // edit pasting a wrong-but-uniform text. No transcription lane covers shared constants by
    // construction (they are not per-row prose), so this literal is the only place the A-2 text
    // itself is pinned. It is class-level editorial copy, not a per-province fact, so pinning it
    // does not collide with the "tests check structure, not facts" rule. Source of truth:
    // `Owner's Inbox/koppen-sablon-gecisi/cumle-taslaklari.md` §3.
    const A2_SENTENCE =
      'Köppen sınıflandırması ile ders kitaplarındaki bölgesel iklim adları iki ayrı sistemdir ' +
      've her zaman örtüşmez: bir ilin Köppen kodu Akdeniz tipini gösterirken müfredat aynı ili ' +
      'karasal ya da Karadeniz iklimi alanında sayabilir, tersi de görülür.';

    expect(rows).toHaveLength(81);
    const tails: string[] = [];
    for (const row of rows) {
      const note = row.climateNoteTr ?? '';
      const at = note.indexOf(A2_OPENING);
      expect(at).toBeGreaterThan(-1);
      tails.push(note.slice(at));
    }

    // THE TAILS ARE NOT ALL EQUAL, and asserting that they were is what this case got wrong on
    // its first CI run. Two provinces (Ankara, Van) append their OWN divergence sentence to the
    // shared caveat, so their note continues past A-2. The property that actually matters is
    // narrower and is the one asserted: the shared sentence is a common PREFIX of every tail,
    // and anything after it is an APPENDED sentence — never an edit of the shared body.
    const sentence = tails.reduce((shortest, tail) =>
      tail.length <= shortest.length ? tail : shortest,
    );
    expect(sentence).toBe(A2_SENTENCE);
    expect(sentence.endsWith('.')).toBe(true);
    for (const tail of tails) {
      expect(tail.startsWith(sentence)).toBe(true);
      // A per-province appendix begins with the space that separates two sentences. Without
      // this, a tail that merely started with the shared text but then RAN ON inside the same
      // sentence would pass — which is the drift a per-class copy-paste actually produces.
      if (tail.length > sentence.length) expect(tail[sentence.length]).toBe(' ');
    }

    // Code-agnostic, mechanically: no Köppen code and no digit anywhere in the shared sentence.
    for (const code of ['Csa', 'Cfa', 'Csb', 'Cfb', 'Dfb', 'Dsb', 'Dsa', 'BSk']) {
      expect(sentence).not.toContain(code);
    }
    expect(sentence).not.toMatch(/\d/u);
    // …and it names no province (checked against the seed's own name list, so a future province
    // rename cannot make this stale).
    for (const seed of SEED_PROVINCES) expect(sentence).not.toContain(seed.nameTr);
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

  it('re-seed detects a climateNarrativeTr drift and CLEARS it (comparator + omit⇒null together)', async () => {
    // Proves the `rowMatchesSeed` comparison line for climateNarrativeTr actually fires: mutate
    // ONLY that column and re-seed. Were the field absent from the comparator, the row would be
    // mis-counted `unchanged` and corrupted prose would never be refreshed — the exact idempotency
    // gap PR #63 closed for landformNoteTr.
    //
    // Now that no province declares the field, this ALSO exercises `withExplicitDetailNulls`: the
    // seed omits the key, so the refresh must write an explicit NULL rather than TypeORM's "leave
    // this column alone". A regression there would leave 'DRIFTED' in place and re-flag the row as
    // updated on every future re-seed, churning `updated_at` forever with no error signal. The
    // gate is therefore STRICTER than before, not weaker. Restores at end.
    const repo = dataSource.getRepository(Province);
    const seeded = (await repo.findOneByOrFail({ plateCode: '34' })).climateNarrativeTr;
    expect(seeded).toBeNull();
    await repo.update({ plateCode: '34' }, { climateNarrativeTr: 'DRIFTED' });

    const result = await seedGeography(dataSource);
    // Only İstanbul drifted (via the climateNarrativeTr comparison) → 1 updated, 80 untouched.
    expect(result).toEqual({ inserted: 0, updated: 1, unchanged: 80, total: 81 });

    // The field was actually re-written from the seed — here, cleared back to null.
    expect((await repo.findOneByOrFail({ plateCode: '34' })).climateNarrativeTr).toBe(seeded);
    // A genuine no-op on re-run (the restored value does not churn `updated` forever).
    expect(await seedGeography(dataSource)).toEqual({
      inserted: 0,
      updated: 0,
      unchanged: 81,
      total: 81,
    });
    expect(await repo.count()).toBe(81);
  });

  it('re-seed detects a climateCurriculumNameTr drift and RESTORES it (isolates the new line)', async () => {
    // Same isolation argument as the climateNarrativeTr case above, for the FIRST of the two
    // comparator lines PR #97 added to `rowMatchesSeed`. Mutate ONLY the curriculum name and
    // re-seed: without its comparison line every other field still matches, so the row would be
    // counted `unchanged` and a corrected name would never reach the database — silently. The
    // expected value is read from the seed, never written as a literal here, so this asserts the
    // MECHANISM and states no per-province fact (→ CONVENTIONS §2).
    const repo = dataSource.getRepository(Province);
    const seed = SEED_PROVINCES.find((p) => p.plateCode === '34');
    if (!seed) throw new Error('İstanbul seed (plate 34) not found');
    // A different member of the same closed vocabulary — the realistic drift is a WRONG name,
    // not a malformed one, and a wrong name is exactly what no structural invariant can see.
    const wrong = CURRICULUM_CLIMATE_NAMES_TR.find((n) => n !== seed.climateCurriculumNameTr);
    if (wrong === undefined) throw new Error('the closed vocabulary has fewer than two names');
    await repo.update({ plateCode: '34' }, { climateCurriculumNameTr: wrong });

    const result = await seedGeography(dataSource);
    expect(result).toEqual({ inserted: 0, updated: 1, unchanged: 80, total: 81 });
    expect((await repo.findOneByOrFail({ plateCode: '34' })).climateCurriculumNameTr).toBe(
      seed.climateCurriculumNameTr,
    );
    // A genuine no-op on re-run — the restore must not churn `updated_at` forever.
    expect(await seedGeography(dataSource)).toEqual({
      inserted: 0,
      updated: 0,
      unchanged: 81,
      total: 81,
    });
    expect(await repo.count()).toBe(81);
  });

  it('re-seed detects a climateCurriculumNoteTr drift in BOTH directions (comparator + omit⇒null)', async () => {
    // The SECOND comparator line PR #97 added, and it needs both directions because the field is
    // null on most rows by design: a province that HAS a note must have a corrupted note
    // refreshed, and a province whose note is null by design must have a spurious note CLEARED
    // (the `withExplicitDetailNulls` half — without it TypeORM's merge would leave the stale
    // value and re-flag the row `updated` on every future re-seed). One test, two rows, so the
    // counts themselves prove both lines fired. Plates are taken from the seed by PROPERTY (has
    // a note / has none), not hard-coded, so a later wave that moves notes around cannot make
    // this case silently test the same direction twice.
    const repo = dataSource.getRepository(Province);
    const withNote = SEED_PROVINCES.find(
      (p) => typeof p.climateCurriculumNoteTr === 'string' && p.climateCurriculumNoteTr !== '',
    );
    const withoutNote = SEED_PROVINCES.find(
      (p) => p.climateCurriculumNoteTr === undefined || p.climateCurriculumNoteTr === null,
    );
    if (!withNote || !withoutNote) throw new Error('need one province with a note and one without');

    await repo.update({ plateCode: withNote.plateCode }, { climateCurriculumNoteTr: 'DRIFTED' });
    await repo.update({ plateCode: withoutNote.plateCode }, { climateCurriculumNoteTr: 'DRIFTED' });

    const result = await seedGeography(dataSource);
    expect(result).toEqual({ inserted: 0, updated: 2, unchanged: 79, total: 81 });

    expect(
      (await repo.findOneByOrFail({ plateCode: withNote.plateCode })).climateCurriculumNoteTr,
    ).toBe(withNote.climateCurriculumNoteTr);
    expect(
      (await repo.findOneByOrFail({ plateCode: withoutNote.plateCode })).climateCurriculumNoteTr,
    ).toBeNull();
    expect(await seedGeography(dataSource)).toEqual({
      inserted: 0,
      updated: 0,
      unchanged: 81,
      total: 81,
    });
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
    // The müfredat fields are DETAIL-ONLY (Atlas ruling AK-2): the il hub renders no climate
    // header, so adding them here would widen a projection PR #67 deliberately kept lean. If a
    // later product decision puts the name on the hub, this line is where the decision is made
    // visible — not a place to delete quietly.
    expect(body[0]).not.toHaveProperty('climateCurriculumNameTr');
    expect(body[0]).not.toHaveProperty('climateCurriculumNoteTr');
    // The W2.1 derived field is PRESENT on every row and, since this suite seeds geography
    // WITHOUT loading any climate series, is null for all 81 — the genuine "seeded, no
    // publishable series" state (distinct from the climate-contract suite's manufactured null).
    // The non-null branch + equality-to-detail invariant lives in climate-contract.e2e-spec.ts,
    // where the real MGM artifact is loaded.
    for (const row of body) {
      expect(row).toHaveProperty('climateAnnualMeanTempC');
      expect(row.climateAnnualMeanTempC).toBeNull();
    }
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
    // The two müfredat fields are on the DETAIL payload (Atlas ruling AK-2 keeps them off the
    // list and map-summary DTOs). Asserted as the CONTRACT — both keys present, values equal to
    // the row, note allowed to be null — so no per-il fact is hardcoded and the "web reads the
    // parts and composes the header itself" agreement cannot silently lose a part.
    const detail = res.body as Record<string, unknown>;
    expect(detail).toHaveProperty('climateCurriculumNameTr');
    expect(detail).toHaveProperty('climateCurriculumNoteTr');
    expect(detail['climateCurriculumNameTr']).toBe(sample.climateCurriculumNameTr);
    expect(detail['climateCurriculumNoteTr']).toBe(sample.climateCurriculumNoteTr);
    // The API never publishes a pre-joined "<ad> · Köppen: <kod>" string — the separator and the
    // typography are the web's decisions and differ in EN (plan-api §1.5).
    expect(sample.climateCurriculumNameTr ?? '').not.toContain('Köppen');
  });

  /**
   * The büyükşehir caveat's negated clause, as ONE fragment both assertions below are built
   * from — writing the alternation twice is how a "present" check and an "ends on" check drift
   * into disagreeing about what the caveat even is.
   *
   * Every listed ending is a NEGATIVE Turkish form of "gelmek": `gelmez` (aorist, what the
   * repaired rows use), `gelmiyor` (present continuous, the pre-B17 wording still live in the
   * corpus elsewhere) and `gelmemekte` (formal continuous). The POSITIVE `gelmektedir` — the
   * same sentence asserting the opposite, "it DOES mean the il is fully urbanised" — is
   * deliberately NOT matched: it shares the `gelm` stem but continues `ektedir`, so it fails
   * every alternative. A guard on a negated claim that a negation flip can satisfy is not a
   * guard, and that is exactly the hole the earlier `gelme` prefix left open (it matched the
   * inverted form and, despite its comment, never matched `gelmiyor` at all).
   */
  const CAVEAT_NEGATION_FORMS = 'gelm(ez|iyor|emekte)';
  /** The clause must APPEAR — anywhere in the note. Applied to the tr-lowercased copy. */
  const CAVEAT_NEGATED_CLAUSE = new RegExp(`kentleştiği anlamına ${CAVEAT_NEGATION_FORMS}`, 'u');
  /**
   * …and the note must END on the caveat: either on that clause, or on the law attribution
   * ("…kaldırılmasının bir sonucudur.") for the ils that order the two halves the other way.
   * Both endings exist in the corpus today; anything after either one is an appended fact.
   */
  const CAVEAT_ENDING = new RegExp(
    `(kentleştiği anlamına ${CAVEAT_NEGATION_FORMS}|bir sonucudur)\\.$`,
    'u',
  );

  it('every büyükşehir-caveat-exception province serves the caveat and NOTHING else (rule, not per-il)', async () => {
    // The Tier-B-but-büyükşehir settlementNoteTr EXCEPTION (→ DEC 2026-07-12) as a RULE-level
    // invariant, replacing the per-il Mardin/Erzurum/Malatya/Eskişehir/Trabzon/Ordu tests —
    // the same pattern as `assertKoppenCaveatInvariant`. A province is a büyükşehir-caveat
    // exception exactly when settlementNoteTr is populated while hydrographyFeatures is null
    // (Tier-B depth + the 6360 legal %100 artifact — a Tier-A il carries BOTH, a plain Tier-B
    // il NEITHER). Discovered from the data, so the rule scales to any new exception il with
    // zero new tests. Every such row must carry ONLY the shared caveat — no extra fact.
    //
    // WHY THIS NO LONGER COUNTS SENTENCES (2026-08-05, content-fix micro / AT-8). The old
    // assertion was `note.split('. ')` has length 1. That was never the invariant — it was a
    // PROXY for it, and the proxy happened to hold only because three of these rows stated the
    // caveat as a COMMA SPLICE ("…bir sonucu, ilin fiilen tamamen kentleştiği anlamına
    // gelmiyor."). Repairing that splice into two grammatical sentences — the whole point of
    // the B17 fix, which is the same caveat carrying the same two clauses — turned the proxy
    // red while the actual invariant held perfectly. A punctuation accident must not be what a
    // rule-level guard is pinned on.
    //
    // So the shape check is replaced by a STRICTLY STRONGER content bound: the note may say
    // the caveat's two things and nothing more, enforced by (a) the numbers it is allowed to
    // contain, and (b) WHERE it is allowed to stop. Every appended fact this test exists to
    // catch — a migration rate, a population, a GSYH share, a year — carries a digit, so the
    // numeric allow-list catches that whole class rather than only the 'göç' wording the old
    // test named; and the end-anchor catches the numberless variant the digit list cannot see
    // ("…gelmez. Bu il ayrıca çok güzeldir."), including the ';'-appended shape the original
    // `=1` sentence count also let through. The sentence cap stays only as a loose upper bound.
    const rows = await dataSource.getRepository(Province).find();
    const exceptions = rows.filter(
      (p) => p.settlementNoteTr !== null && p.hydrographyFeatures === null,
    );
    // Guard against a vacuous pass: the variant exists in the seed (6 il as of DEC 2026-07-12),
    // so an empty set means the identifying predicate silently stopped matching — not that the
    // rule holds — and must fail here rather than pass green.
    //
    // AT LEAST 6, not exactly 6, and not merely > 0 (PR #96 review). The danger is the set
    // SHRINKING: the predicate is derived from the data (`settlementNoteTr` set while
    // `hydrographyFeatures` is null), so a later wave that gives one of these six a
    // `hydrographyFeatures` array drops it out of the set and this loop quietly checks fewer
    // rows — no failure anywhere. `> 0` only catches total collapse, and three of the six are
    // now maintained by a different prose wave than the other three. GROWTH is deliberately
    // still free: a new exemption il needs no test edit, which is this rule's whole design.
    expect(exceptions.length).toBeGreaterThanOrEqual(6);
    for (const p of exceptions) {
      // Case-folded ONCE, in the Turkish locale, and every text assertion below runs on the
      // folded copy: a sentence-initial "Büyükşehir" is a rewording, not a defect, and this
      // guard must not force a capitalisation. `tr` matters — the dotted/dotless i pair does
      // not fold correctly under the default locale.
      const note = (p.settlementNoteTr as string).trim();
      const lower = note.toLocaleLowerCase('tr');
      // The caveat is two clauses; anything longer is narrative that belongs in another field.
      expect(note.split('. ').length).toBeLessThanOrEqual(2);
      // It IS the shared 6360 %100 büyükşehir caveat (same framing across every such il)…
      expect(lower).toContain('6360');
      expect(lower).toContain('%100');
      expect(lower).toContain('büyükşehir statüsündeki illerde');
      // …including its SECOND half, the "this does not mean fully urbanised" clause. THE
      // NEGATION IS THE POINT: `gelmektedir` ("it DOES mean") is the same sentence with the
      // claim inverted, so the pattern must accept only the negative forms and reject that one.
      expect(lower).toMatch(CAVEAT_NEGATED_CLAUSE);
      // …and ONLY that caveat: no migration narrative restated in prose (it lives in the field)…
      expect(lower).not.toContain('göç');
      // …and no appended numeric fact at all. 100 is the rate the caveat frames, 6360 the law
      // it cites; a third number means something else was pasted in. Compared as a SORTED SET —
      // sorted so an il phrasing the caveat law-first stays green, de-duplicated because the
      // rule is about WHICH numbers may appear, not how often a sentence repeats one.
      expect([...new Set(lower.match(/\d+/gu) ?? [])].sort()).toEqual(['100', '6360']);
      // …and it STOPS on the caveat. Without this the loosened `≤2` cap admits a second
      // sentence carrying no digits at all, which both the allow-list above and the old
      // sentence count would wave through.
      expect(lower).toMatch(CAVEAT_ENDING);
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
    // Required on the seed since the müfredat wave. Marmara + "Marmara geçiş iklimi" is an
    // EXPECTED pair, so this fixture needs no explanation note — chosen so the Köppen block
    // below keeps testing only what it is about.
    climateCurriculumNameTr: 'Marmara geçiş iklimi',
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

  /**
   * A SECOND invariant, deliberately not an extension of the one above — the Köppen caveat
   * guards MGM's attributed quotation (K1, → DEC 2026-08-04a), the müfredat mapping guards OUR
   * editorial layer, and one failure message must not answer for two authorities.
   *
   * NESTED INSIDE the Köppen suite rather than beside it, so it can reuse that suite's
   * `VALID_SEED` fixture and the two blocks cannot drift apart. Jest therefore reports these
   * cases as `assertKoppenCaveatInvariant > assertCurriculumMappingInvariant > …` — noted
   * because the report path reads like one invariant owns the other, which it does not
   * (→ PR #97 review, CR97-M7; un-nesting would mean hoisting the fixture and re-indenting
   * ~130 lines for a naming-only gain).
   */
  describe('assertCurriculumMappingInvariant', () => {
    // Ege + "İç Anadolu karasal iklimi": an OUT-OF-REGION pair, i.e. the shape that requires a
    // note. Built from the same fixture so the two blocks cannot drift apart.
    const OUT_OF_REGION: ProvinceSeed = {
      ...VALID_SEED,
      region: GeographicRegion.Ege,
      climateCurriculumNameTr: 'İç Anadolu karasal iklimi',
      climateCurriculumNoteTr: 'Bölge dışı adın gerekçesi.',
    };

    it('passes the clean case (expected pair, no note needed)', () => {
      expect(() => assertCurriculumMappingInvariant([VALID_SEED])).not.toThrow();
    });

    it('passes an out-of-region pair that carries its explanation note', () => {
      expect(() => assertCurriculumMappingInvariant([OUT_OF_REGION])).not.toThrow();
    });

    /** An empty name is only reachable past the union type by an explicit cast — as here. */
    const NAMELESS: ProvinceSeed = {
      ...VALID_SEED,
      climateCurriculumNameTr: '' as ProvinceSeed['climateCurriculumNameTr'],
    };

    it('throws when a Köppen code carries no curriculum name (a half-rendered header)', () => {
      expect(() => assertCurriculumMappingInvariant([NAMELESS])).toThrow(
        /has Köppen code Csa but no curriculum climate name/u,
      );
    });

    it('throws on a PADDED canonical name (the raw value is compared, not a trimmed copy)', () => {
      // Reachable only past the union by a cast — which is exactly the caller rule 2 guards.
      // Before PR #97's review fix the membership test trimmed while `isUnexpectedRegionPair`
      // did not, so a padded name passed the vocabulary check, was written to the column WITH
      // its padding, and separately false-flagged the row as out-of-region (CR97-M3).
      expect(() =>
        assertCurriculumMappingInvariant([
          {
            ...VALID_SEED,
            climateCurriculumNameTr:
              'Marmara geçiş iklimi ' as ProvinceSeed['climateCurriculumNameTr'],
          },
        ]),
      ).toThrow(/is not one of the eight/u);
    });

    it('throws on a name outside the closed vocabulary (the runtime half of the union)', () => {
      // The union type cannot see a value produced by a cast or a plain-JS caller; this can.
      // A near-miss spelling is the realistic case, so the fixture uses one.
      expect(() =>
        assertCurriculumMappingInvariant([
          {
            ...VALID_SEED,
            climateCurriculumNameTr:
              'İç Anadolu Karasal İklimi' as ProvinceSeed['climateCurriculumNameTr'],
          },
        ]),
      ).toThrow(/is not one of the eight/u);
    });

    it('throws when an out-of-region pair has NO explanation note (DEC 2026-08-05f #4)', () => {
      expect(() =>
        assertCurriculumMappingInvariant([{ ...OUT_OF_REGION, climateCurriculumNoteTr: null }]),
      ).toThrow(/out-of-region pair and MUST carry climateCurriculumNoteTr/u);
    });

    it('throws when the note is present but whitespace-only (an empty paragraph on the page)', () => {
      expect(() =>
        assertCurriculumMappingInvariant([{ ...VALID_SEED, climateCurriculumNoteTr: '   ' }]),
      ).toThrow(/present but whitespace-only/u);
    });

    it('does NOT demand a note for an expected pair (the rule is out-of-region, not "always")', () => {
      // Guards the guard: if `EXPECTED_REGION_PAIRS` were ever emptied "to be safe", every one
      // of the 81 rows would demand a note and the seed would abort — a failure that looks like
      // a data problem while being a table problem.
      expect(() =>
        assertCurriculumMappingInvariant([{ ...VALID_SEED, climateCurriculumNoteTr: null }]),
      ).not.toThrow();
    });

    it('reports EVERY offending row in one message, not just the first', () => {
      // A seed run should be fixable in one pass; naming one row per run is how a batch defect
      // becomes N review cycles. Same posture as the Köppen invariant's joined list.
      expect(() =>
        assertCurriculumMappingInvariant([
          { ...NAMELESS, plateCode: '97', nameTr: 'Bir' },
          { ...NAMELESS, plateCode: '98', nameTr: 'İki' },
        ]),
      ).toThrow(/97 Bir[\s\S]*98 İki/u);
    });
  });

  describe('isUnexpectedRegionPair', () => {
    it('treats a sub-area name as belonging to its parent region (Trakya, Göller Yöresi)', () => {
      // Both look "out of region" to a naive label comparison and are NOT: Trakya is part of the
      // Marmara region and Göller Yöresi part of the Akdeniz region. This is the case the
      // two-part exemption test in `EXPECTED_REGION_PAIRS` exists to settle.
      expect(
        isUnexpectedRegionPair({
          ...VALID_SEED,
          region: GeographicRegion.Marmara,
          climateCurriculumNameTr: 'Trakya karasal iklimi',
        }),
      ).toBe(false);
      expect(
        isUnexpectedRegionPair({
          ...VALID_SEED,
          region: GeographicRegion.Akdeniz,
          climateCurriculumNameTr: 'Göller Yöresi geçiş iklimi',
        }),
      ).toBe(false);
    });

    it('exempts the two source-backed cases (Ege→Akdeniz, Marmara→Karadeniz)', () => {
      // Exemption 1: MGM assigns "Ege Bölgesi'nin büyük bir bölümü" to the Akdeniz type.
      // Exemption 2: MGM's Karadeniz definition names "Marmara Bölgesi'nin Karadeniz kıyı
      // kuşağı" outright. Neither is editorial taste; both are the source's own wording.
      expect(
        isUnexpectedRegionPair({
          ...VALID_SEED,
          region: GeographicRegion.Ege,
          climateCurriculumNameTr: 'Akdeniz iklimi',
        }),
      ).toBe(false);
      expect(
        isUnexpectedRegionPair({
          ...VALID_SEED,
          region: GeographicRegion.Marmara,
          climateCurriculumNameTr: 'Karadeniz iklimi',
        }),
      ).toBe(false);
    });

    it('flags a pair neither exemption covers', () => {
      expect(
        isUnexpectedRegionPair({
          ...VALID_SEED,
          region: GeographicRegion.GuneydoguAnadolu,
          climateCurriculumNameTr: 'Akdeniz iklimi',
        }),
      ).toBe(true);
    });
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
