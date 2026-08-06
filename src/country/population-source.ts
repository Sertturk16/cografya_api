/**
 * Nüfus kaynağı çözümlemesi — the single place that turns a `Country` row's raw
 * `population_source_name_*` columns (mostly absent) into the SENTENCE-READY credit the
 * `/dunya/{slug}` detail page renders (`CountryDetail.sources`, TR + EN). This exists so
 * `cografya_web` never carries a hardcoded "Dünya Bankası" fallback — DEC 2026-08-05j
 * ruled the credit line data-driven, and AK-8 extended it to a fifth exception (Türkiye).
 *
 * `SP.POP.TOTL` (World Bank Open Data, `api.worldbank.org/v2`) is the corpus-wide default:
 * every seeded row that leaves `populationSourceNameTr/En` absent is a World Bank figure
 * (§1.2 of the approved plan measured 185/190 populated rows this way; the five named
 * exceptions below are the only rows publishing a different institution's number).
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
 * Resolves the credit-line source name a `Country` row publishes for its `population`
 * figure.
 *
 * Three branches, in priority order:
 *   1. `population === null` → `{ tr: null, en: null }`. This is the ONLY reason the DTO
 *      pair is nullable: a page that draws no "Nüfus" card credits no institution for one
 *      (today's sole example is Antarktika). The structural promise to `cografya_web` is
 *      exactly this: a source name is present IF AND ONLY IF `population` is present.
 *   2. A row-level override (`populationSourceNameTr` is non-null) → the row's own values,
 *      transcribed verbatim from `provenance/territories.md` (five rows today: GL, CY, QN,
 *      TW, TR). TR/EN always travel together — the seed guard (rule 10, leg 1) enforces
 *      that structurally so this branch can trust the pair is complete.
 *   3. Otherwise → {@link DEFAULT_POPULATION_SOURCE_NAME}, the corpus-wide World Bank
 *      credit every ordinary row implicitly carries.
 */
export function resolvePopulationSourceName(row: PopulationSourceRow): PopulationSourceName {
  if (row.population === null) {
    return { tr: null, en: null };
  }

  if (row.populationSourceNameTr !== null) {
    return { tr: row.populationSourceNameTr, en: row.populationSourceNameEn };
  }

  return { tr: DEFAULT_POPULATION_SOURCE_NAME.tr, en: DEFAULT_POPULATION_SOURCE_NAME.en };
}
