/**
 * Structured payload shapes for the `Province` jsonb columns + the shared contract.
 *
 * These are the ONE definition of each jsonb shape: the entity types its jsonb
 * columns with the interfaces here, and the response DTOs `implements` the same
 * interfaces (so the stored shape and the published contract cannot drift — a
 * change to an interface breaks compilation until both the column and the DTO
 * follow). The DTO classes exist separately only because `@nestjs/swagger` needs
 * a decorated class to emit the nested OpenAPI schema; the interfaces here are the
 * source of truth for the field set.
 */

/**
 * Hidrografya feature kind. ASCII values (like `GeographicRegion`) so the
 * discriminator is safe in generated web types and free of diacritic edge cases;
 * the Turkish display label ("Baraj" / "Nehir" / "Göl") is a presentation concern
 * the web repo maps, exactly as it maps the region enum → Turkish label.
 */
export enum HydrographyFeatureType {
  Baraj = 'baraj',
  Nehir = 'nehir',
  Gol = 'gol',
}

/**
 * One named hydrographic feature of a province (a dam, river or lake). Authored
 * content — sourced per the DSİ/İSKİ authorities in NOVA's briefs, never invented.
 */
export interface HydrographyFeature {
  /** Öz ad (e.g. "Ömerli Barajı", "Sakarya Nehri"). */
  name: string;
  /** Feature kind (dam / river / lake). */
  type: HydrographyFeatureType;
}

/**
 * A single, TÜİK-anchored economic indicator for a province. Deliberately a lone
 * structured stat — NOT free prose — so the "Ekonomik Coğrafya" section cannot
 * drift into unsourced marketing language (CONVENTIONS §4; NOVA content-research
 * §1.4). The whole object is null until a verified statistic fills it.
 */
export interface EconomyIndicator {
  /** What the stat measures (e.g. "GSYH'de Türkiye payı"). */
  label: string;
  /** The value, as a string — a share, a rank or a product name (heterogeneous). */
  value: string;
  /** Reference year of the statistic. */
  year: number;
  /** Authoritative source (e.g. "TÜİK Bölgesel GSYH"). */
  source: string;
}
