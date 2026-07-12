import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  type ValueTransformer,
} from 'typeorm';
import { CONTINENT_DB_ENUM, Continent } from '../../common/continent.enum';

/**
 * Postgres `numeric`/`decimal` values come back from the driver as strings (to
 * preserve arbitrary precision). Coordinates are small, fixed-scale values, so we
 * transform them to `number` on read and pass through on write. `null` is preserved
 * both ways. (Same transformer as `Province`; kept local to avoid coupling the two
 * public entities through a shared util — the duplication is one small object.)
 */
const decimalTransformer: ValueTransformer = {
  to: (value: number | null | undefined): number | null => value ?? null,
  from: (value: string | null | undefined): number | null =>
    value === null || value === undefined ? null : Number(value),
};

/**
 * Ülke (country) — the Faz-2 dünya haritası content unit (`/dunya/{slug}` detay
 * sayfası). Mirrors `Province` field-for-field where the model maps cleanly (per
 * NOVA's dünya-haritası SPEC §3.1 field-mapping table, owner-ruled → DEC 2026-07-13).
 * Column names are explicit snake_case so the hand-written migration maps 1:1 (this
 * repo runs migrations, never `synchronize`).
 *
 * TWO DELIBERATE DEPARTURES FROM THE PROVINCE MODEL (both owner-ruled):
 *   1. NO "ilçe sayısı" equivalent. Instead a neighbouring-countries relationship
 *      (`neighborIsoCodes`, mirroring the province `neighborPlateCodes` array) from
 *      which "komşu ülke sayısı" is DERIVED at read time in the service — the same
 *      derived-field pattern as the province `populationDensity` (never a stored
 *      column).
 *   2. NO structured/Köppen climate field at country scale (a single Köppen code for
 *      a whole country is geographically misleading — large countries span many
 *      zones). Climate appears ONLY as free narrative prose in `climateNoteTr`, a text
 *      field like `landformNoteTr` — never a structured climate-class column.
 *
 * Nullability mirrors the province discipline: only the *structural identity/routing*
 * fields (ISO alpha-2 code, TR+EN name, both slugs, continent) are NOT NULL — they are
 * known for every country up front from the authoritative source. Every
 * *research-derived* field (population, area, capital, coordinates, languages, …) is
 * NULLABLE, because the content pipeline fills them progressively AFTER an independent
 * fact-check. We never force a placeholder to satisfy a NOT NULL constraint — an
 * unverified fact stays absent, not invented. A country row can exist (a routable page)
 * before every data point is verified.
 *
 * TR+EN names are BOTH NOT NULL (unlike the province model, where EN was deferred):
 * the T.C. Dışişleri Bakanlığı source supplies both locales from day one (SPEC §7), and
 * `slug_en` (NOT NULL) cannot exist without `name_en`.
 *
 * NOTE: centroid / bounding-box are intentionally NOT stored (same as `Province`) — per
 * SPEC §3.1 field #9 they are derived from the boundary GeoJSON at build time, not
 * hand-researched values. Only the capital point (a real researched datum) lives on the
 * entity as capitalLatitude/capitalLongitude.
 */
@Entity('countries')
export class Country {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /**
   * ISO 3166-1 alpha-2 code — the stable, unique business key (e.g. "TR", "DE"), the
   * country-scale analog of the province plaka kodu. It is also the value stored in
   * every other country's `neighborIsoCodes` array (the hub-and-spoke join key).
   *
   * SEED DISCIPLINE: always UPPERCASE, exactly 2 letters. This is a string column, so
   * `ORDER BY iso_code` sorts lexically — a lowercase value would sort AFTER all
   * uppercase ones and scramble list order. The `db:seed:world` seed MUST emit
   * uppercase alpha-2 codes for every country.
   */
  @Column({ name: 'iso_code', type: 'varchar', length: 2, unique: true })
  isoCode!: string;

  /**
   * ISO 3166-1 alpha-3 code (e.g. "TUR", "DEU") — a secondary stable identifier
   * (SPEC §3.1 field #2, "ikincil alan olarak da tutulabilir"). Nullable: it is not a
   * routing key and not required to create a routable country row; useful for JSON-LD
   * `identifier` and for joining World Bank / UN datasets that key on alpha-3.
   */
  @Column({ name: 'iso_code_alpha3', type: 'varchar', length: 3, unique: true, nullable: true })
  isoCodeAlpha3!: string | null;

  /** Ülke adı (TR) — T.C. Dışişleri Bakanlığı resmi TR dış-adı (exonym). */
  @Column({ name: 'name_tr', type: 'varchar', length: 100 })
  nameTr!: string;

  /** Ülke adı (EN) — same MFA TR/EN list; available day-1 (SPEC §7). */
  @Column({ name: 'name_en', type: 'varchar', length: 100 })
  nameEn!: string;

  /** Localized slugs (CONVENTIONS §3) — the web repo's TR/EN routing keys. */
  @Column({ name: 'slug_tr', type: 'varchar', length: 120, unique: true })
  slugTr!: string;

  @Column({ name: 'slug_en', type: 'varchar', length: 120, unique: true })
  slugEn!: string;

  /** Kıta — the primary grouping (the province `region` mirror). */
  @Index()
  @Column({
    name: 'continent',
    type: 'enum',
    enum: Continent,
    enumName: CONTINENT_DB_ENUM,
  })
  continent!: Continent;

  /** BM alt-bölgesi (UNSD M49) TR etiketi (e.g. "Güney Avrupa"). Research-derived. */
  @Column({ name: 'un_subregion_tr', type: 'varchar', length: 80, nullable: true })
  unSubregionTr!: string | null;

  /** Nüfus (World Bank / UN) + referans yılı. */
  @Column({ name: 'population', type: 'integer', nullable: true })
  population!: number | null;

  @Column({ name: 'population_year', type: 'smallint', nullable: true })
  populationYear!: number | null;

  /** Yüzölçümü (km², World Bank / UN) — whole km². */
  @Column({ name: 'area_km2', type: 'integer', nullable: true })
  areaKm2!: number | null;

  /** Başkent adı (TR) — MFA başkentler listesi. */
  @Column({ name: 'capital_name_tr', type: 'varchar', length: 120, nullable: true })
  capitalNameTr!: string | null;

  /** Başkent adı (EN) — same MFA list. */
  @Column({ name: 'capital_name_en', type: 'varchar', length: 120, nullable: true })
  capitalNameEn!: string | null;

  /** Başkent koordinatı (nokta) — decimal degrees. */
  @Column({
    name: 'capital_latitude',
    type: 'numeric',
    precision: 9,
    scale: 6,
    nullable: true,
    transformer: decimalTransformer,
  })
  capitalLatitude!: number | null;

  @Column({
    name: 'capital_longitude',
    type: 'numeric',
    precision: 9,
    scale: 6,
    nullable: true,
    transformer: decimalTransformer,
  })
  capitalLongitude!: number | null;

  /**
   * Komşu ülkeler — stored as neighbour ISO 3166-1 alpha-2 codes (stable, unambiguous
   * keys), mirroring the province `neighborPlateCodes`. The web hub-and-spoke resolves
   * these to slugs from the full country list. An EMPTY array is a deliberate, correct
   * state for island nations (Japan, Iceland) — "no land neighbour", not missing data;
   * that is why this is NOT NULL with a `'{}'` default rather than nullable.
   *
   * "Komşu ülke sayısı" is DERIVED from this array's length in the service (the
   * "ilçe sayısı" replacement, owner-ruled) — never a stored column, exactly like
   * `populationDensity`.
   */
  @Column({
    name: 'neighbor_iso_codes',
    type: 'varchar',
    length: 2,
    array: true,
    default: () => "'{}'",
  })
  neighborIsoCodes!: string[];

  /**
   * Resmi dil(ler) — TR dil adları (e.g. ["Almanca", "Fransızca"]). A country can have
   * several (Switzerland, Belgium), so an array; a "Temel Bilgiler" table field, not a
   * hover-card stat (SPEC §3.1). NULL = not yet researched (distinct from an empty list),
   * so nullable with no default — same discipline as the province `hydrographyFeatures`.
   */
  @Column({ name: 'official_languages_tr', type: 'text', array: true, nullable: true })
  officialLanguagesTr!: string[] | null;

  /** Para birimi adı (TR, e.g. "Euro"). */
  @Column({ name: 'currency_name_tr', type: 'varchar', length: 80, nullable: true })
  currencyNameTr!: string | null;

  /** Para birimi kodu (ISO 4217, e.g. "EUR") — SPEC §3.1 new row. */
  @Column({ name: 'currency_code', type: 'varchar', length: 3, nullable: true })
  currencyCode!: string | null;

  /** Yönetim biçimi (TR, e.g. "Federal parlamenter cumhuriyet"). */
  @Column({ name: 'government_form_tr', type: 'varchar', length: 120, nullable: true })
  governmentFormTr!: string | null;

  /**
   * Bağımsızlık tarihi / notu (TR) — a free-text NOTE, not a structured DATE column
   * (SPEC §3.1 field #13). Deliberately text: real-world independence is often a year,
   * a complex phrase, or "no single date" (ancient states like San Marino / Japan / the
   * UK), which a `date`/`smallint` column cannot honestly hold. Mirrors the province
   * "kuruluş/idari tarih notu" being a note.
   */
  @Column({ name: 'independence_note_tr', type: 'text', nullable: true })
  independenceNoteTr!: string | null;

  /**
   * Yazılı açılış cümlesi (ülke detay sayfası girişi) — mirrors the province `introTr`.
   * Null until authored; the web composes a data-driven fallback sentence in that case.
   */
  @Column({ name: 'intro_tr', type: 'text', nullable: true })
  introTr!: string | null;

  /** Öne çıkan yer şekilleri / jeoloji notu — short free text (TR). */
  @Column({ name: 'landform_note_tr', type: 'text', nullable: true })
  landformNoteTr!: string | null;

  /**
   * İklim — FREE NARRATIVE PROSE describing the regional climate variation within the
   * country (e.g. "kuzeyde ... iklimi, güneyde ... iklimi görülür"), NOT a structured
   * Köppen/climate-class code (owner-ruled → DEC 2026-07-13). A single country-scale
   * climate code would be geographically misleading, so climate is treated exactly like
   * `landformNoteTr`: a nullable prose field, filled per country after fact-check.
   */
  @Column({ name: 'climate_note_tr', type: 'text', nullable: true })
  climateNoteTr!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
