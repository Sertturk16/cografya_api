import type { DataSource } from 'typeorm';
import { Province } from '../../province/entities/province.entity';
import { PILOT_PROVINCES } from './province.seed-data';

/** Outcome of a geography seed run (for logging + idempotency assertions). */
export interface SeedGeographyResult {
  inserted: number;
  updated: number;
  total: number;
}

/**
 * Seeds the geography base data (the platform's most critical seed — CLAUDE.md
 * §5). Currently the PILOT-5 provinces; scales to 81 once the remaining batches
 * clear fact-check.
 *
 * IDEMPOTENT by design: keyed on the unique `plate_code`, each province is
 * inserted if absent or refreshed in place if present, so re-running never
 * duplicates a row and always converges the data to the fact-checked values.
 * The whole run is one transaction — a mid-run failure leaves the table
 * untouched rather than half-seeded. Uses the entity lifecycle (save) so
 * `updated_at` tracks refreshes and the numeric/array transformers apply.
 */
export async function seedGeography(dataSource: DataSource): Promise<SeedGeographyResult> {
  let inserted = 0;
  let updated = 0;

  await dataSource.transaction(async (manager) => {
    const repo = manager.getRepository(Province);

    for (const seed of PILOT_PROVINCES) {
      const existing = await repo.findOne({ where: { plateCode: seed.plateCode } });

      if (existing) {
        repo.merge(existing, seed);
        await repo.save(existing);
        updated += 1;
      } else {
        await repo.save(repo.create(seed));
        inserted += 1;
      }
    }
  });

  return { inserted, updated, total: PILOT_PROVINCES.length };
}
