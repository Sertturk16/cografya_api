import type { DataSource } from 'typeorm';
import { Province } from '../../province/entities/province.entity';
import { PILOT_PROVINCES, type ProvinceSeed } from './province.seed-data';

/** Outcome of a geography seed run (for logging + idempotency assertions). */
export interface SeedGeographyResult {
  inserted: number;
  updated: number;
  /** Rows already matching the seed exactly — left untouched (no `updated_at` bump). */
  unchanged: number;
  total: number;
}

/**
 * Köppen⇒caveat invariant (il-data-dictionary §2.1): a province with a Köppen
 * code MUST carry the mandatory MGM methodological note — a bare "Csa" must
 * never ship (esp. Ankara/Van). Enforced at seed time so the 81-province scale-up
 * (batch 2+) cannot silently violate it: a missing note aborts the seed loudly
 * instead of publishing a context-free climate code.
 */
export function assertKoppenCaveatInvariant(seeds: readonly ProvinceSeed[]): void {
  const offenders = seeds.filter(
    (seed) => seed.climateKoppen.trim() !== '' && seed.climateNoteTr.trim() === '',
  );

  if (offenders.length > 0) {
    const codes = offenders.map((seed) => seed.plateCode).join(', ');
    throw new Error(
      `Köppen⇒caveat invariant violated: province(s) [${codes}] have a Köppen code but no ` +
        'climate note. Per il-data-dictionary §2.1 the MGM methodological caveat is mandatory ' +
        '— a bare Köppen code must not ship.',
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
 * §5). Currently the PILOT-5 provinces; scales to 81 once the remaining batches
 * clear fact-check.
 *
 * IDEMPOTENT by design: keyed on the unique `plate_code`, each province is
 * inserted if absent, refreshed if its data drifted, or LEFT UNTOUCHED if it
 * already matches — so a routine re-seed never duplicates a row AND never bumps
 * `updated_at` on a no-op. That keeps the SEO `lastmod`/dateModified signal
 * honest (CONVENTIONS §6): a province's timestamp changes only when its data
 * genuinely changes. The whole run is one transaction — a mid-run failure leaves
 * the table untouched rather than half-seeded.
 */
export async function seedGeography(dataSource: DataSource): Promise<SeedGeographyResult> {
  assertKoppenCaveatInvariant(PILOT_PROVINCES);

  let inserted = 0;
  let updated = 0;
  let unchanged = 0;

  await dataSource.transaction(async (manager) => {
    const repo = manager.getRepository(Province);

    for (const seed of PILOT_PROVINCES) {
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
    }
  });

  return { inserted, updated, unchanged, total: PILOT_PROVINCES.length };
}
