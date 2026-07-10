import type { DataSource } from 'typeorm';
import { Province } from '../../province/entities/province.entity';
import { SEED_PROVINCES, type ProvinceSeed } from './province.seed-data';

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

/** Element-wise string-array equality (order-sensitive — plaka code order is stable). */
function plateArraysEqual(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

/**
 * True when the persisted row already equals the seed across every seeded
 * column, so a re-seed can skip the write. Kept exhaustive (not a hash) so it is
 * obvious which fields participate — add a column to `ProvinceSeed`, add it here.
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
    row.landformNoteTr === seed.landformNoteTr
  );
}

/**
 * Seeds the geography base data (the platform's most critical seed — CLAUDE.md
 * §5). Currently the 24 fact-checked provinces (pilot-5 + Batch 2 wave-1 Güneydoğu
 * Anadolu + Batch 2 wave-2 Marmara); scales to 81 as the remaining batches clear
 * an independent fact-check.
 *
 * IDEMPOTENT by design, PER ROW: keyed on the unique `plate_code`, each province
 * is INDEPENDENTLY inserted if absent, refreshed if its data drifted, or LEFT
 * UNTOUCHED if it already matches — so a routine re-seed never duplicates a row
 * AND never bumps `updated_at` on a no-op. That keeps the SEO `lastmod`/
 * dateModified signal honest (CONVENTIONS §6): a province's timestamp changes only
 * when its data genuinely changes. The whole run is one transaction — a mid-run
 * failure leaves the table untouched rather than half-seeded.
 *
 * The per-row independence is what makes an INCREMENTAL rollout correct: adding a
 * batch means re-seeding the SAME DB with a longer list, so a real run is a MIXED
 * batch — the already-present rows are no-ops while only the new rows insert (e.g.
 * the 14 pilot+wave-1 rows present + the full 24-list → `{inserted:10, unchanged:14}`).
 * That mixed path is regression-tested in `province.e2e-spec`.
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

  let inserted = 0;
  let updated = 0;
  let unchanged = 0;

  await dataSource.transaction(async (manager) => {
    const repo = manager.getRepository(Province);

    for (const seed of provinces) {
      try {
        const existing = await repo.findOne({ where: { plateCode: seed.plateCode } });

        if (!existing) {
          await repo.save(repo.create(seed));
          inserted += 1;
        } else if (rowMatchesSeed(existing, seed)) {
          unchanged += 1;
        } else {
          repo.merge(existing, seed);
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
