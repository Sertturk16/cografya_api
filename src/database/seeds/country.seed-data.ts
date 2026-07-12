import { Continent } from '../../common/continent.enum';

/**
 * Shape of one seeded country. The IDENTITY fields (isoCode, TR+EN name, both slugs,
 * continent) are required — they are known for every country up front from the
 * authoritative source. Every RESEARCH-DERIVED field is optional (`?: T | null`): the
 * base-data wave provides the numeric/identity core, and later fact-checked content
 * waves fill the narrative/detail fields per country (an unverified fact stays absent,
 * never invented — CLAUDE §5). An absent (undefined) optional field reads as "not
 * authored yet" and is normalised to null against the DB in `seed-world.ts`, so an
 * absent-in-seed vs null-in-DB pair is a no-op that keeps `updated_at` frozen on
 * re-seed (SEO lastmod honesty).
 *
 * `neighborIsoCodes` is required (not optional): an empty array is the correct,
 * explicit state for an island nation ("no land neighbour"), mirroring the entity's
 * NOT-NULL `'{}'` default — it is never "unknown".
 */
export interface CountrySeed {
  /** ISO 3166-1 alpha-2 — UPPERCASE, exactly 2 letters (see entity seed discipline). */
  isoCode: string;
  nameTr: string;
  nameEn: string;
  slugTr: string;
  slugEn: string;
  continent: Continent;
  neighborIsoCodes: string[];
  isoCodeAlpha3?: string | null;
  unSubregionTr?: string | null;
  population?: number | null;
  populationYear?: number | null;
  areaKm2?: number | null;
  capitalNameTr?: string | null;
  capitalNameEn?: string | null;
  capitalLatitude?: number | null;
  capitalLongitude?: number | null;
  officialLanguagesTr?: string[] | null;
  currencyNameTr?: string | null;
  currencyCode?: string | null;
  governmentFormTr?: string | null;
  independenceNoteTr?: string | null;
  introTr?: string | null;
  landformNoteTr?: string | null;
  climateNoteTr?: string | null;
}

/**
 * World country seed data — INTENTIONALLY EMPTY at this stage.
 *
 * This dispatch builds the Country module's data/API + seed MECHANISM only; the real
 * country data (a pilot batch first, per NOVA's phasing) is sourced + independently
 * fact-checked SEPARATELY and lands in a follow-up. Fabricating placeholder country
 * facts here would violate the "no sourceless facts" discipline (CONVENTIONS §4), so
 * the list stays empty until fact-checked data arrives. The idempotent `seedWorld`
 * mechanism is fully wired and exercised (via synthetic fixtures) by the e2e suite, so
 * dropping the real data in later is a data-only change with no code churn.
 */
export const SEED_COUNTRIES: readonly CountrySeed[] = [];
