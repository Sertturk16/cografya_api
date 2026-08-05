import { isDeepStrictEqual } from 'node:util';
import type { DataSource } from 'typeorm';
import { GeographicRegion } from '../../common/geographic-region.enum';
import { Province } from '../../province/entities/province.entity';
import {
  CURRICULUM_AKDENIZ,
  CURRICULUM_CLIMATE_NAMES_TR,
  CURRICULUM_DOGU_ANADOLU,
  CURRICULUM_GOLLER_YORESI,
  CURRICULUM_GUNEYDOGU_ANADOLU,
  CURRICULUM_IC_ANADOLU,
  CURRICULUM_KARADENIZ,
  CURRICULUM_MARMARA_GECIS,
  CURRICULUM_TRAKYA,
  SEED_PROVINCES,
  type ProvinceSeed,
} from './province.seed-data';

/** Outcome of a geography seed run (for logging + idempotency assertions). */
export interface SeedGeographyResult {
  inserted: number;
  updated: number;
  /** Rows already matching the seed exactly — left untouched (no `updated_at` bump). */
  unchanged: number;
  total: number;
}

/**
 * Köppen⇒caveat invariant (il-data-dictionary §2.1): a province with a Köppen code
 * MUST carry the mandatory MGM methodological note, AND that note must CORRESPOND to
 * the province's own code — a bare "Csa" must never ship (esp. Ankara/Van), and a
 * Csa-flavoured caveat must never sit on a Cfa row (or vice versa).
 *
 * The correspondence check (note must contain its own code substring) matters from
 * Batch 2 wave-2 on: that wave introduced the platform's SECOND climate class (Cfa,
 * via sibling caveat constants), so a copy-paste that pairs the wrong caveat with a
 * code became structurally possible for the first time. Wave-3 (Ege) adds still more
 * classes (Csb…), so this guard is enforced at seed time to keep the 81-province
 * scale-up honest: a missing OR mismatched note aborts the seed loudly instead of
 * publishing a context-free / wrong-context climate code. Each caveat constant names
 * its own code in its opening clause ("…bu ili Csa …" / "…bu ili Cfa …"), so the
 * substring test is self-maintaining — a new class passes as soon as its caveat names
 * its code, and a mismatch fails. (Full 3-letter codes don't cross-match: "Csa" is
 * absent from the Cfa caveat and vice versa.)
 *
 * PRECONDITION when adding the NEXT class: this correspondence check is only sound
 * while no full Köppen code is a substring of another (holds for the eight codes shipped
 * across the full 81 — Csa/Cfa/Csb/Cfb/BSk/Dfb/Dsb/Dsa, all 3 chars and pairwise
 * non-substring; wave-6d added Cfb, wave-6b added BSk/Dfb/Dsb/Dsa, wave-6c reuses Dsb + Cfb
 * and introduces NO new code). If a future class's code IS a substring of an existing one
 * (or vice versa), `note.includes(code)` could false-positive — switch to a word-boundary /
 * equality match at that point. Verify this the moment a new code is introduced.
 */
export function assertKoppenCaveatInvariant(seeds: readonly ProvinceSeed[]): void {
  const offenders = seeds.filter((seed) => {
    const code = seed.climateKoppen.trim();
    if (code === '') return false; // no code → no caveat required
    const note = seed.climateNoteTr.trim();
    // Violation if the caveat is absent (bare code) OR does not name its own code
    // (a mismatched / copy-pasted caveat from a different climate class).
    return note === '' || !note.includes(code);
  });

  if (offenders.length > 0) {
    const codes = offenders.map((seed) => `${seed.plateCode} (${seed.climateKoppen})`).join(', ');
    throw new Error(
      `Köppen⇒caveat invariant violated: province(s) [${codes}] have a Köppen code with a ` +
        'missing OR mismatched climate note. Per il-data-dictionary §2.1 the MGM methodological ' +
        'caveat is mandatory AND must correspond to the province’s own Köppen code — a bare ' +
        'or wrong-class caveat must not ship.',
    );
  }
}

/** The `(region, curriculum name)` pair key both the table and the check are built on. */
function regionNameKey(region: GeographicRegion, curriculumName: string): string {
  return `${region}|${curriculumName}`;
}

/**
 * The `(coğrafi bölge × müfredat iklim adı)` pairs a reader does NOT need explained.
 *
 * WHAT DECIDES MEMBERSHIP — a two-part test, taken from the sources' own wording rather than
 * from editorial taste (NOVA re-read MGM's *Türkiye İklimi*, "İklim Tipleri", pp. 4-5 directly
 * from the PDF on 2026-08-06 for exactly this question; brief §4.2-4.3). A province needs an
 * explanation when the geographic label inside its curriculum climate name differs from its own
 * region, UNLESS one of these holds:
 *
 *   1. **The source assigns the province's WHOLE REGION to that climate type.** MGM defines the
 *      Akdeniz type for "Ege Bölgesi'nin büyük bir bölümü"; MEB's TYT summary names Manisa and
 *      Denizli outright and the textbook uses İzmir as the type's worked example. Six of the
 *      Ege region's eight provinces carry the name, so it is the region's RULE, not its
 *      exception → İzmir, Manisa, Aydın, Muğla, Denizli, Uşak are exempt.
 *   2. **The province is itself on the coast the type is named after, and the source names that
 *      coastal strip.** MGM's Karadeniz definition explicitly includes "Marmara Bölgesi'nin
 *      Karadeniz kıyı kuşağı"; Kocaeli and Sakarya have Black Sea coastline → both exempt.
 *
 * The same test explains the two pairs that look like exceptions but are not: Trakya is a
 * sub-area of the Marmara region (Edirne, Kırklareli) and Göller Yöresi is a sub-area of the
 * Akdeniz region (Isparta, Burdur) — neither name points at a DIFFERENT region.
 *
 * Applied to today's data this table yields exactly the seven provinces brief §6 lists:
 * Gaziantep, Kilis (Güneydoğu Anadolu / Akdeniz iklimi), Afyonkarahisar, Kütahya (Ege / İç
 * Anadolu karasal), Çorum (Karadeniz / İç Anadolu karasal), Gümüşhane, Bayburt (Karadeniz /
 * Doğu Anadolu karasal). Each of those DOES fail both exemptions: no source assigns Güneydoğu
 * Anadolu to the Akdeniz type — the textbook says the type's edge *starts at* Gaziantep and
 * Kilis, i.e. the source itself frames them as the exception — the Ege region is nowhere
 * assigned to İç Anadolu karasal, and MGM limits the Karadeniz type to the mountains'
 * NORTH-facing slopes while Gümüşhane and Bayburt sit on the southern face.
 *
 * WHEN A NAME CHANGES, apply the two-part test above rather than adding a line to keep the
 * seed green: an unlisted pair firing is the table doing its job.
 */
const EXPECTED_REGION_PAIRS: ReadonlySet<string> = new Set([
  regionNameKey(GeographicRegion.Ege, CURRICULUM_AKDENIZ),
  regionNameKey(GeographicRegion.Akdeniz, CURRICULUM_AKDENIZ),
  regionNameKey(GeographicRegion.Akdeniz, CURRICULUM_GOLLER_YORESI),
  regionNameKey(GeographicRegion.Marmara, CURRICULUM_MARMARA_GECIS),
  regionNameKey(GeographicRegion.Marmara, CURRICULUM_TRAKYA),
  regionNameKey(GeographicRegion.Marmara, CURRICULUM_KARADENIZ),
  regionNameKey(GeographicRegion.Karadeniz, CURRICULUM_KARADENIZ),
  regionNameKey(GeographicRegion.IcAnadolu, CURRICULUM_IC_ANADOLU),
  regionNameKey(GeographicRegion.DoguAnadolu, CURRICULUM_DOGU_ANADOLU),
  regionNameKey(GeographicRegion.GuneydoguAnadolu, CURRICULUM_GUNEYDOGU_ANADOLU),
]);

/** True when the province's region/curriculum-name pair would surprise a reader. */
export function isUnexpectedRegionPair(seed: ProvinceSeed): boolean {
  return !EXPECTED_REGION_PAIRS.has(regionNameKey(seed.region, seed.climateCurriculumNameTr));
}

/**
 * Müfredat-mapping invariant — the seed-time guard for `climateCurriculumNameTr` /
 * `climateCurriculumNoteTr` (→ DEC 2026-08-05c, DEC 2026-08-05f, DEC 2026-08-06a).
 *
 * DELIBERATELY A SECOND FUNCTION, not an extension of `assertKoppenCaveatInvariant`. That one
 * guards an ATTRIBUTED QUOTATION of MGM's publication (K1, → DEC 2026-08-04a) and is not
 * touched by this change; this one guards OUR editorial layer. Folding them together would
 * make one failure message answer for two different authorities.
 *
 * Four rules, none of which names a province:
 *   1. **A Köppen code implies a curriculum name.** The header the web renders puts the two
 *      side by side, so a row with a code and no name renders half a header.
 *   2. **The name is one of the eight canonical values.** A runtime membership test on top of
 *      the compile-time union, because the type cannot see a value written by a future admin
 *      endpoint or a hand-run SQL statement.
 *   3. **An UNEXPECTED (region, name) pair implies an explanation note** — the structural form
 *      of DEC 2026-08-05f #4, expressed entirely through `EXPECTED_REGION_PAIRS` so no plate
 *      code is hard-coded. Rename a province's climate and this fires by itself.
 *   4. **A note implies a name**, and neither field may be whitespace-only.
 *
 * WHAT THIS DELIBERATELY CANNOT ENFORCE, recorded rather than papered over: DEC 2026-08-05f #3
 * ("each of the ten BELİRSİZ provinces carries a transition note") is not derivable from the
 * data — "the textbook map is ambiguous here" is a fact about the SOURCE, not a column. Encoding
 * it would mean a third column (`climateCurriculumCertainty`) that nothing renders and that
 * exists only to feed a test, which is the abstraction-for-nobody the repo's rules reject. Two
 * real guards cover it instead: the P5 wave's target list (`check` exits 1 if any of the
 * fourteen pairs is missing from the seed) and the floor-count guards in the e2e suite.
 */
export function assertCurriculumMappingInvariant(seeds: readonly ProvinceSeed[]): void {
  const canonical = new Set<string>(CURRICULUM_CLIMATE_NAMES_TR);
  const problems: string[] = [];

  for (const seed of seeds) {
    const name = seed.climateCurriculumNameTr.trim();
    const note = (seed.climateCurriculumNoteTr ?? '').trim();
    const label = `${seed.plateCode} ${seed.nameTr}`;

    if (name === '') {
      problems.push(
        seed.climateKoppen.trim() === ''
          ? `${label} — curriculum name is empty/whitespace`
          : `${label} — has Köppen code ${seed.climateKoppen} but no curriculum climate name`,
      );
    } else if (!canonical.has(name)) {
      problems.push(`${label} — curriculum name ${JSON.stringify(name)} is not one of the eight`);
    }

    if (name !== '' && isUnexpectedRegionPair(seed) && note === '') {
      problems.push(
        `${label} — region ${seed.region} with curriculum name ${JSON.stringify(name)} is an ` +
          `out-of-region pair and MUST carry climateCurriculumNoteTr (DEC 2026-08-05f #4)`,
      );
    }

    if (note === '' && seed.climateCurriculumNoteTr !== undefined) {
      if (seed.climateCurriculumNoteTr !== null) {
        problems.push(`${label} — climateCurriculumNoteTr is present but whitespace-only`);
      }
    }
  }

  if (problems.length > 0) {
    throw new Error(
      `Müfredat mapping invariant violated:\n  ${problems.join('\n  ')}\n` +
        'The curriculum climate name is our own editorial layer over MEB Coğrafya 9 (Harita ' +
        '1.39) — it is NOT MGM’s Köppen class name and must never be published half-formed.',
    );
  }
}

/** Element-wise string-array equality (order-sensitive — plaka code order is stable). */
function plateArraysEqual(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

/**
 * True when the persisted row already equals the seed across every seeded
 * column, so a re-seed can skip the write. Kept exhaustive (not a hash) so it is
 * obvious which fields participate — add a column to `ProvinceSeed`, add it here.
 *
 * The PR-5a detail-section fields (introTr … economyIndicator) are OPTIONAL on the seed:
 * base-data provinces omit them (undefined), while the İstanbul deep-content pilot sets
 * them. Two rules keep the comparison honest:
 *   1. NULL-NORMALISE each optional field (`?? null`) before comparing — an absent-in-seed
 *      value vs the null the DB stores must read as EQUAL, so a routine base-data re-seed is
 *      a genuine no-op and never bumps `updated_at` (SEO lastmod honesty, §6). Without this,
 *      `undefined !== null` would mark all 30 base-data rows as drifted on every re-seed.
 *      (This function receives the seed ALREADY normalised by `withExplicitDetailNulls`, so
 *      the `?? null` here is belt-and-braces — it keeps the comparator correct even if a
 *      caller ever passes a raw seed.)
 *   2. The two jsonb fields (`hydrographyFeatures`, `economyIndicator`) use a DEEP,
 *      key-order-insensitive compare (`isDeepStrictEqual`) because Postgres jsonb re-orders
 *      object keys on round-trip — a stringify/`===` compare would report a false difference
 *      and mis-count a steady row as `updated` on every re-seed.
 *
 * WHY the fields must participate (they don't currently change İstanbul's OWN outcome —
 * `landformNoteTr` was already compared here, and İstanbul flips it null→content, so the
 * row already drifts regardless): the guard is FORWARD-LOOKING. Once a province has
 * `landformNoteTr` populated, a later detail-ONLY correction (e.g. a new economyIndicator,
 * landform unchanged) would NOT be seen by the base-field comparison alone → silently
 * skipped as `unchanged`. Comparing all eight closes that gap: any detail field drifting is
 * detected → UPDATED; nothing drifting → unchanged, no churn.
 */
function rowMatchesSeed(row: Province, seed: ProvinceSeed): boolean {
  return (
    row.nameTr === seed.nameTr &&
    row.slugTr === seed.slugTr &&
    row.slugEn === seed.slugEn &&
    row.region === seed.region &&
    row.population === seed.population &&
    row.populationYear === seed.populationYear &&
    row.areaKm2 === seed.areaKm2 &&
    row.districtCount === seed.districtCount &&
    row.elevationM === seed.elevationM &&
    row.latitude === seed.latitude &&
    row.longitude === seed.longitude &&
    plateArraysEqual(row.neighborPlateCodes, seed.neighborPlateCodes) &&
    row.climateKoppen === seed.climateKoppen &&
    row.climateClassTr === seed.climateClassTr &&
    row.climateNoteTr === seed.climateNoteTr &&
    row.climateCurriculumNameTr === seed.climateCurriculumNameTr &&
    (row.climateCurriculumNoteTr ?? null) === (seed.climateCurriculumNoteTr ?? null) &&
    row.landformNoteTr === seed.landformNoteTr &&
    (row.climateNarrativeTr ?? null) === (seed.climateNarrativeTr ?? null) &&
    (row.introTr ?? null) === (seed.introTr ?? null) &&
    (row.hydrographyNoteTr ?? null) === (seed.hydrographyNoteTr ?? null) &&
    isDeepStrictEqual(row.hydrographyFeatures ?? null, seed.hydrographyFeatures ?? null) &&
    (row.urbanizationRate ?? null) === (seed.urbanizationRate ?? null) &&
    (row.netMigrationRate ?? null) === (seed.netMigrationRate ?? null) &&
    (row.settlementNoteTr ?? null) === (seed.settlementNoteTr ?? null) &&
    isDeepStrictEqual(row.economyIndicator ?? null, seed.economyIndicator ?? null)
  );
}

/**
 * Returns the seed with every OPTIONAL detail field made EXPLICIT (`undefined → null`), so
 * the whole pipeline — drift detection, INSERT and UPDATE — agrees on one meaning of "the
 * seed does not set this field": null.
 *
 * This closes a latent RETRACTION bug. `rowMatchesSeed` already treats an omitted key as
 * null for drift detection, but TypeORM's `repo.merge(existing, seed)` treats an `undefined`
 * value as "leave this column alone" — it does NOT write null. So if a future correction
 * ever RETRACTS a previously-published field (drops the key to clear a stale value, rather
 * than replacing it), the row is correctly flagged as drifted → routed to `updated`, but the
 * merge would silently fail to clear the DB value: the row would then re-flag as `updated`
 * on EVERY future re-seed forever, churning `updated_at` with no error signal and breaking
 * the SEO lastmod-honesty invariant. Normalising here makes the retraction write an explicit
 * null, so the stale value is actually cleared and the row settles to `unchanged`. The seed
 * is authoritative: after a run, the DB matches the seed exactly, omitted-optional included.
 *
 * No behaviour change for the shipped data (each province sets whichever of the eight
 * optional detail fields it carries and omits the rest, whose columns are already null) —
 * this only makes the omit⇒null contract enforced rather than incidental.
 */
function withExplicitDetailNulls(seed: ProvinceSeed): ProvinceSeed {
  return {
    ...seed,
    climateCurriculumNoteTr: seed.climateCurriculumNoteTr ?? null,
    climateNarrativeTr: seed.climateNarrativeTr ?? null,
    introTr: seed.introTr ?? null,
    hydrographyNoteTr: seed.hydrographyNoteTr ?? null,
    hydrographyFeatures: seed.hydrographyFeatures ?? null,
    urbanizationRate: seed.urbanizationRate ?? null,
    netMigrationRate: seed.netMigrationRate ?? null,
    settlementNoteTr: seed.settlementNoteTr ?? null,
    economyIndicator: seed.economyIndicator ?? null,
  };
}

/**
 * Seeds the geography base data (the platform's most critical seed — ENGINEERING.md
 * §5). Now the COMPLETE 81 fact-checked provinces (pilot-5 + Batch 2 wave-1..4 + wave-6d
 * Karadeniz-B + wave-6b Doğu Anadolu + wave-6a İç Anadolu + wave-6c Karadeniz-A) — the
 * 81-province rollout is finished; wave-6c is the batch that closes it.
 *
 * IDEMPOTENT by design, PER ROW: keyed on the unique `plate_code`, each province
 * is INDEPENDENTLY inserted if absent, refreshed if its data drifted, or LEFT
 * UNTOUCHED if it already matches — so a routine re-seed never duplicates a row
 * AND never bumps `updated_at` on a no-op. That keeps the SEO `lastmod`/
 * dateModified signal honest (CONVENTIONS §6): a province's timestamp changes only
 * when its data genuinely changes. The whole run is one transaction — a mid-run
 * failure leaves the table untouched rather than half-seeded.
 *
 * The SEED IS AUTHORITATIVE: each seed is normalised (`withExplicitDetailNulls`) before
 * compare/insert/update, so after a run the DB matches the seed exactly — an omitted
 * optional field means null, and a retracted field is actually cleared (not left stale).
 *
 * The per-row independence is what makes an INCREMENTAL rollout correct: adding a
 * batch means re-seeding the SAME DB with a longer list, so a real run is a MIXED
 * batch — the already-present rows are no-ops while only the new rows insert (e.g.
 * the 31 prior rows present + the full 38-list → `{inserted:7, unchanged:31}`).
 * That mixed path is regression-tested in `province.e2e-spec` (which, from wave-4 on,
 * proves it with a single representative mixed transition rather than one phase per
 * historical wave — per-row independence does not depend on how many prior batches
 * the no-op set spans).
 *
 * `provinces` defaults to the full `SEED_PROVINCES` set (what the CLI runs);
 * accepting the list as a parameter lets tests drive the exact rollout phases
 * (seed pilot-only, then the full set) through this real code path.
 */
export async function seedGeography(
  dataSource: DataSource,
  provinces: readonly ProvinceSeed[] = SEED_PROVINCES,
): Promise<SeedGeographyResult> {
  assertKoppenCaveatInvariant(provinces);
  // The MGM quotation and our own curriculum layer are checked SEPARATELY and in that order:
  // a failure message must point at exactly one authority (see each function's docblock).
  assertCurriculumMappingInvariant(provinces);

  let inserted = 0;
  let updated = 0;
  let unchanged = 0;

  await dataSource.transaction(async (manager) => {
    const repo = manager.getRepository(Province);

    for (const seed of provinces) {
      try {
        // Normalise omitted optional detail fields to explicit null BEFORE both the
        // comparison and the write, so drift detection, INSERT and UPDATE share one
        // meaning of "unset" and a future field retraction actually clears the column
        // (see `withExplicitDetailNulls`).
        const normalized = withExplicitDetailNulls(seed);
        const existing = await repo.findOne({ where: { plateCode: normalized.plateCode } });

        if (!existing) {
          await repo.save(repo.create(normalized));
          inserted += 1;
        } else if (rowMatchesSeed(existing, normalized)) {
          unchanged += 1;
        } else {
          repo.merge(existing, normalized);
          await repo.save(existing);
          updated += 1;
        }
      } catch (cause) {
        // Name the offending row so a failure mid-batch (e.g. a constraint
        // violation once the seed scales to 81) is diagnosable. The transaction
        // still rolls the WHOLE run back and the error propagates to a non-zero
        // exit — this only adds row-level context, mirroring the plate-code
        // context `assertKoppenCaveatInvariant` already gives.
        throw new Error(`Seeding province [${seed.plateCode}] ${seed.nameTr} failed — see cause.`, {
          cause,
        });
      }
    }
  });

  return { inserted, updated, unchanged, total: provinces.length };
}
