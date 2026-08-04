/**
 * What KIND of entity a `countries` row describes.
 *
 * The `countries` table is deliberately ONE table (owner-ruled → DEC 2026-08-01q): Grönland,
 * Antarktika and Türkiye's own profile are all real, routable `/dunya/{slug}` pages, so
 * splitting them into a second table would duplicate every read path for zero product gain.
 * What they are NOT is interchangeable with a sovereign state, and this column is the honest
 * structural signal that says so — the thing every "assumes a country" behaviour (JSON-LD
 * type, the "… bir ülkedir" meta sentence, the continent row's self-reference, the neighbour
 * count row, the card subtitle) branches on instead of inferring from a name or a slug.
 *
 * The three values, with their binding definitions:
 *   - `country`   — egemen devlet (a sovereign state). The overwhelming majority; the DEFAULT.
 *   - `territory` — bağlı/özerk toprak (a dependent or autonomous territory, e.g. Grönland).
 *   - `special`   — ülke kategorisine girmeyen özel statülü coğrafya (a special-status geography
 *                   that does not belong to the country category at all, e.g. Antarktika).
 *
 * The values are ASCII lowercase keys — stable DB enum labels and stable in the generated web
 * types. There is deliberately NO Turkish label map here (unlike `Continent`): the user-facing
 * subtitle is NOT derived from the type, it is the owner-approved per-row `status_label_tr` /
 * `status_label_en` (DEC 2026-08-01m/n/p). Deriving a label from the type would silently
 * replace approved copy with a generic word.
 */
export enum CountryEntityType {
  Country = 'country',
  Territory = 'territory',
  Special = 'special',
}

/** The Postgres enum type name, shared by the entity and its migration. */
export const COUNTRY_ENTITY_TYPE_DB_ENUM = 'country_entity_type';
