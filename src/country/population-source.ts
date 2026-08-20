/**
 * Nüfus kaynağı çözümlemesi — the single place that turns a `Country` row's raw
 * `population_source_name_*` columns (mostly absent) into the SENTENCE-READY credit the
 * `/dunya/{slug}` detail page renders (`CountryDetail.sources`, TR + EN). This exists so
 * `cografya_web` never carries a hardcoded "Dünya Bankası" fallback — DEC 2026-08-05j
 * ruled the credit line data-driven, and AK-8 extended it to a fifth exception (Türkiye).
 *
 * `SP.POP.TOTL` (World Bank Open Data, `api.worldbank.org/v2`) is the corpus-wide default:
 * every seeded row that leaves `populationSourceNameTr/En` absent is a World Bank figure.
 * Corpus shape as of the kaynak-satırı micro: 199 seeded rows, 198 publish a population
 * (all but the one `special` Antarctica row, guard rule 3), and 193 of those 198 default to
 * this constant — the five named exceptions below are the only rows publishing a different
 * institution's number. The plan's own §1.2 per-row source scan measured 185/190 over the
 * 191-row count in §1.1 (four base-data continents + sovereignty + territories + Türkiye);
 * that denominator omitted the 8 pilot rows — GR/BG/GE/AM/AZ/IR/IQ/SY — which at the time
 * were declared directly in `country.seed-data.ts`, outside `countries/*.countries.ts` and
 * therefore invisible to `pnpm seed:transcribe`'s world. They now live in the Asia and
 * Europe/Oceania wave files (FU-PILOT-RETIRE), so a sweep of `countries/` reaches them
 * today; 185/190 is left standing as the historical measurement and is deliberately NOT
 * restated against the new shape. Those 8 are independently corroborated World-Bank-sourced
 * by `Owner's Inbox/dunya-haritasi-pilot/country-data-dictionary.md`, not by that scan
 * (CR98-M7 / SG98-I2, PR #98 review).
 */
export const DEFAULT_POPULATION_SOURCE_NAME = {
  tr: 'Dünya Bankası',
  en: 'the World Bank',
} as const;

/** The resolved, locale-paired population source name — always both locales or neither. */
export interface PopulationSourceName {
  tr: string | null;
  en: string | null;
}

/** The subset of a `Country` row this resolver actually reads. */
export interface PopulationSourceRow {
  population: number | null;
  populationSourceNameTr: string | null;
  populationSourceNameEn: string | null;
}

/**
 * "No usable value" — `null` or a string with nothing but whitespace in it. Mirrors the
 * seed guard's own `isBlank` (`country-entity-invariants.ts`, rule 10a/10b) on purpose: this
 * resolver and that guard reason about the SAME columns, and a resolver that used a
 * different predicate (`!== null`, the pre-fix defect — PR #98 review, I1) would trust a row
 * the guard never actually certified as "has an override".
 */
function isBlank(value: string | null): boolean {
  return value === null || value.trim() === '';
}

/**
 * Resolves the credit-line source name a `Country` row publishes for its `population`
 * figure.
 *
 * Three branches, in priority order:
 *   1. `population === null` → `{ tr: null, en: null }`. This is the ONLY reason the DTO
 *      pair is nullable: a page that draws no "Nüfus" card credits no institution for one
 *      (today's sole example is Antarktika). The structural promise to `cografya_web` is
 *      exactly this: a source name is present IF AND ONLY IF `population` is present.
 *   2. A row-level override — BOTH `populationSourceNameTr` AND `populationSourceNameEn`
 *      non-blank — → the row's own values (five rows today: GL, CY, QN, TW, TR; see
 *      `country.seed-data.ts` and `sovereignty.countries.ts` for the per-row provenance
 *      citations). The seed guard (rule 10a) enforces both-or-neither on the WRITE path, but
 *      this resolver does NOT trust that as its only defence: it re-checks the pair itself,
 *      because a row reaching this function did not necessarily pass through the guard (a
 *      direct query, a future write path, or a `population_source_name_*` column edited by
 *      hand all skip it). A row where only one locale is set, or both are whitespace-only,
 *      falls through to branch 3 rather than publishing a half-formed or blank credit, or
 *      discarding a real institution's name for one locale while keeping it null for the
 *      other (PR #98 review, I1 — the exact "TR set / EN null" and "both whitespace" defects
 *      this branch used to admit).
 *   3. Otherwise → {@link DEFAULT_POPULATION_SOURCE_NAME}, the corpus-wide World Bank
 *      credit every ordinary row implicitly carries. This is also the FAIL-SAFE branch for
 *      a malformed override pair — publishing the generic credit is always safer than
 *      publishing a broken one.
 */
export function resolvePopulationSourceName(row: PopulationSourceRow): PopulationSourceName {
  if (row.population === null) {
    return { tr: null, en: null };
  }

  const hasOverride = !isBlank(row.populationSourceNameTr) && !isBlank(row.populationSourceNameEn);

  if (hasOverride) {
    return { tr: row.populationSourceNameTr, en: row.populationSourceNameEn };
  }

  return { tr: DEFAULT_POPULATION_SOURCE_NAME.tr, en: DEFAULT_POPULATION_SOURCE_NAME.en };
}
