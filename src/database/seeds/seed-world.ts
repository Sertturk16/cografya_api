import type { DataSource } from 'typeorm';
import { Country } from '../../country/entities/country.entity';
import { SEED_COUNTRIES, type CountrySeed } from './country.seed-data';

/** Outcome of a world seed run (for logging + idempotency assertions). */
export interface SeedWorldResult {
  inserted: number;
  updated: number;
  /** Rows already matching the seed exactly — left untouched (no `updated_at` bump). */
  unchanged: number;
  total: number;
}

/** Element-wise string-array equality (order-sensitive — seed authoring order is stable). */
function stringArraysEqual(a: readonly string[] | null, b: readonly string[] | null): boolean {
  if (a === null || b === null) return a === b;
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

/**
 * True when the persisted row already equals the seed across every seeded column, so a
 * re-seed can skip the write. Kept exhaustive (not a hash) so it is obvious which fields
 * participate — add a column to `CountrySeed`, add it here. Optional fields are
 * NULL-NORMALISED (`?? null`) before comparing so an absent-in-seed value reads as EQUAL
 * to the null the DB stores (a routine base-data re-seed is then a genuine no-op and
 * never bumps `updated_at`). The seed passed here is ALREADY normalised by
 * `withExplicitNulls`, so the `?? null` is belt-and-braces. Mirrors the province
 * `rowMatchesSeed` discipline (seed-geography.ts).
 */
function rowMatchesSeed(row: Country, seed: CountrySeed): boolean {
  return (
    row.nameTr === seed.nameTr &&
    row.nameEn === seed.nameEn &&
    row.slugTr === seed.slugTr &&
    row.slugEn === seed.slugEn &&
    row.continent === seed.continent &&
    stringArraysEqual(row.neighborIsoCodes, seed.neighborIsoCodes) &&
    (row.isoCodeAlpha3 ?? null) === (seed.isoCodeAlpha3 ?? null) &&
    (row.unSubregionTr ?? null) === (seed.unSubregionTr ?? null) &&
    (row.population ?? null) === (seed.population ?? null) &&
    (row.populationYear ?? null) === (seed.populationYear ?? null) &&
    (row.areaKm2 ?? null) === (seed.areaKm2 ?? null) &&
    (row.capitalNameTr ?? null) === (seed.capitalNameTr ?? null) &&
    (row.capitalNameEn ?? null) === (seed.capitalNameEn ?? null) &&
    (row.capitalLatitude ?? null) === (seed.capitalLatitude ?? null) &&
    (row.capitalLongitude ?? null) === (seed.capitalLongitude ?? null) &&
    stringArraysEqual(row.officialLanguagesTr, seed.officialLanguagesTr ?? null) &&
    (row.currencyNameTr ?? null) === (seed.currencyNameTr ?? null) &&
    (row.currencyCode ?? null) === (seed.currencyCode ?? null) &&
    (row.governmentFormTr ?? null) === (seed.governmentFormTr ?? null) &&
    (row.independenceNoteTr ?? null) === (seed.independenceNoteTr ?? null) &&
    (row.introTr ?? null) === (seed.introTr ?? null) &&
    (row.landformNoteTr ?? null) === (seed.landformNoteTr ?? null) &&
    (row.climateNoteTr ?? null) === (seed.climateNoteTr ?? null) &&
    (row.hydrographyNoteTr ?? null) === (seed.hydrographyNoteTr ?? null) &&
    (row.sovereigntyNoteTr ?? null) === (seed.sovereigntyNoteTr ?? null)
  );
}

/**
 * Returns the seed with every OPTIONAL field made EXPLICIT (`undefined → null`), so the
 * whole pipeline — drift detection, INSERT and UPDATE — agrees on one meaning of "the
 * seed does not set this field": null. This closes the same latent RETRACTION bug the
 * province seed documents: TypeORM's `repo.merge` treats an `undefined` value as "leave
 * this column alone" (does NOT write null), so a future correction that DROPS a
 * previously-published key would flag the row as drifted forever without ever clearing
 * the stale DB value. Normalising to explicit null makes the retraction actually clear
 * the column and the row settle to `unchanged`. The seed is authoritative: after a run
 * the DB matches the seed exactly, omitted-optional included.
 */
function withExplicitNulls(seed: CountrySeed): CountrySeed {
  return {
    ...seed,
    isoCodeAlpha3: seed.isoCodeAlpha3 ?? null,
    unSubregionTr: seed.unSubregionTr ?? null,
    population: seed.population ?? null,
    populationYear: seed.populationYear ?? null,
    areaKm2: seed.areaKm2 ?? null,
    capitalNameTr: seed.capitalNameTr ?? null,
    capitalNameEn: seed.capitalNameEn ?? null,
    capitalLatitude: seed.capitalLatitude ?? null,
    capitalLongitude: seed.capitalLongitude ?? null,
    officialLanguagesTr: seed.officialLanguagesTr ?? null,
    currencyNameTr: seed.currencyNameTr ?? null,
    currencyCode: seed.currencyCode ?? null,
    governmentFormTr: seed.governmentFormTr ?? null,
    independenceNoteTr: seed.independenceNoteTr ?? null,
    introTr: seed.introTr ?? null,
    landformNoteTr: seed.landformNoteTr ?? null,
    climateNoteTr: seed.climateNoteTr ?? null,
    hydrographyNoteTr: seed.hydrographyNoteTr ?? null,
    sovereigntyNoteTr: seed.sovereigntyNoteTr ?? null,
  };
}

/**
 * Seeds the world country base data (`db:seed:world`). Mirrors the province
 * `seedGeography` mechanism exactly:
 *
 * IDEMPOTENT by design, PER ROW: keyed on the unique `iso_code`, each country is
 * INDEPENDENTLY inserted if absent, refreshed if its data drifted, or LEFT UNTOUCHED if
 * it already matches — so a routine re-seed never duplicates a row AND never bumps
 * `updated_at` on a no-op (keeping the SEO `lastmod` signal honest, CONVENTIONS §6). The
 * whole run is one transaction — a mid-run failure leaves the table untouched rather
 * than half-seeded. Each seed is normalised (`withExplicitNulls`) before
 * compare/insert/update, so after a run the DB matches the seed exactly (an omitted
 * optional means null; a retracted field is actually cleared).
 *
 * `countries` defaults to the full `SEED_COUNTRIES` set (what the CLI runs — currently
 * empty until NOVA's fact-checked data lands); accepting the list as a parameter lets
 * the e2e suite drive the exact insert/update/no-op paths through this real code path
 * with synthetic fixtures, with zero real country facts hardcoded.
 */
export async function seedWorld(
  dataSource: DataSource,
  countries: readonly CountrySeed[] = SEED_COUNTRIES,
): Promise<SeedWorldResult> {
  let inserted = 0;
  let updated = 0;
  let unchanged = 0;

  await dataSource.transaction(async (manager) => {
    const repo = manager.getRepository(Country);

    for (const seed of countries) {
      try {
        // Normalise omitted optional fields to explicit null BEFORE both the comparison
        // and the write, so drift detection, INSERT and UPDATE share one meaning of
        // "unset" and a future field retraction actually clears the column.
        const normalized = withExplicitNulls(seed);
        const existing = await repo.findOne({ where: { isoCode: normalized.isoCode } });

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
        // Name the offending row so a failure mid-batch (e.g. a constraint violation) is
        // diagnosable. The transaction still rolls the WHOLE run back and the error
        // propagates to a non-zero exit — this only adds row-level context, mirroring
        // the province seed.
        throw new Error(`Seeding country [${seed.isoCode}] ${seed.nameTr} failed — see cause.`, {
          cause,
        });
      }
    }
  });

  return { inserted, updated, unchanged, total: countries.length };
}
