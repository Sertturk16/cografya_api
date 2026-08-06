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
import {
  COUNTRY_ENTITY_TYPE_DB_ENUM,
  CountryEntityType,
} from '../../common/country-entity-type.enum';

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

  /**
   * Varlık türü — `country` (egemen devlet) · `territory` (bağlı/özerk toprak) · `special`
   * (ülke kategorisine girmeyen özel statülü coğrafya). See `CountryEntityType` for the
   * binding definitions and for why the table is not split in two.
   *
   * NOT NULL with `DEFAULT 'country'`: the default backfills every pre-existing row with the
   * correct value (no data migration needed) AND stays in place afterwards, so authoring an
   * ordinary country row never has to state its type — only the exceptions are marked. That
   * asymmetry is the point: 197 of 199 rows are countries.
   *
   * NO INDEX, deliberately. The table holds ~199 rows; a sequential scan is already optimal
   * at that size and an index would be pure maintenance cost with no measurable read gain
   * (YAGNI). Revisit only if this table ever grows by an order of magnitude.
   */
  @Column({
    name: 'entity_type',
    type: 'enum',
    enum: CountryEntityType,
    enumName: COUNTRY_ENTITY_TYPE_DB_ENUM,
    default: CountryEntityType.Country,
  })
  entityType!: CountryEntityType;

  /**
   * Kart alt başlığı (TR/EN) — the owner-approved status label a non-country row shows on the
   * /dunya map card, e.g. "Danimarka Özerk Bölgesi" / "Danish Autonomous Territory" for
   * Grönland and "Tarafsız Kıta" / "Neutral Continent" for Antarktika (DEC 2026-08-01m/n/p).
   *
   * WHY A STORED COLUMN rather than deriving the subtitle from `entityType` or falling back to
   * the continent name: DEC 2026-08-01m explicitly REJECTED the continent fallback ("kıta adı
   * Grönland'ı ülke kartından ayırt edilemez kılardı"), and a type-derived generic word would
   * replace approved copy. The label is approved CONTENT, so it lives with the row.
   *
   * NULL on every `country` row and non-empty on every non-country row — enforced structurally
   * by the seed guard (`assertCountryEntityInvariants`, invariant 2), not by convention.
   */
  @Column({ name: 'status_label_tr', type: 'varchar', length: 80, nullable: true })
  statusLabelTr!: string | null;

  @Column({ name: 'status_label_en', type: 'varchar', length: 80, nullable: true })
  statusLabelEn!: string | null;

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

  /**
   * Is `areaKm2` an APPROXIMATION rather than a measured figure?
   *
   * `area_km2` is a plain integer, which reads as an exact claim. For a few real entities that
   * is false and the owner has ruled the "≈" must survive: Antarktika's 14.200.000 km² is an
   * approximate figure and the ruling that removed the range explicitly KEPT the ≈ mark
   * (DEC 2026-08-01l + DEC 2026-08-01g m.3). Without this flag the card would publish
   * "14.200.000" as a fixed measurement, i.e. the api would silently break a fresh ruling.
   *
   * ONE FLAG, ONE SOURCE. The alternative — the web repo hardcoding "AQ is approximate" —
   * splits one card between two sources of truth, which is exactly the discipline DEC
   * 2026-08-01l established. This is not speculative generality either: dalga-2 already has
   * two more rows of the same class (Somaliland ≈176.000, Chagos ≈60).
   *
   * NOT NULL with `DEFAULT false`: "we do not know whether it is approximate" is not a state
   * we ever want; an unflagged figure is an exact one. A symmetric flag for POPULATION is
   * deliberately NOT opened here — dalga-1 has no approximate population, and it can arrive
   * additively the day one does.
   */
  @Column({ name: 'area_is_approximate', type: 'boolean', default: false })
  areaIsApproximate!: boolean;

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

  /**
   * Hidrografya — kısa düzyazı not (nehir/göl/deniz anlatısı, TR). Mirrors the province
   * `hydrographyNoteTr` field exactly (nullable prose, no structured feature list at
   * country scale — the country model deliberately omits the province `hydrographyFeatures`
   * jsonb). Kept as the LAST natural-geography prose field (after landform + climate),
   * matching the province ordering where hydrography is the final natural-geography note.
   * NULL until fact-checked content fills it — an unverified fact stays absent, never
   * invented (CLAUDE §5).
   */
  @Column({ name: 'hydrography_note_tr', type: 'text', nullable: true })
  hydrographyNoteTr!: string | null;

  /**
   * Egemenlik / uluslararası tanınma çerçevesi — FREE NARRATIVE PROSE (TR). Holds the
   * owner's binding, twice-fact-checked framing language for the handful of countries whose
   * international recognition / sovereignty status is contested or non-standard (Kıbrıs
   * Cumhuriyeti, KKTC, İsrail, Filistin, Tayvan, Kosova). Deliberately ONE broad prose field
   * (owner-ruled → DEC 2026-07-13), mirroring the existing pattern of a modest number of broad
   * notes (intro/landform/climate/hydrography), NOT several hyper-specific single-use columns:
   * İsrail's capital-note nuance and Filistin's governance-note nuance fold into this same
   * field as continuous prose per entity, rather than separate capital_note/governance_note
   * columns.
   *
   * NULL for the overwhelming majority of countries — the field exists ONLY for entities whose
   * status genuinely needs the framing; an ordinary, uncontested country leaves it absent (an
   * unset note, never a placeholder). The prose is transcribed VERBATIM from the fact-checked
   * source; it is the platform's single most editorially-sensitive surface (CONVENTIONS §4).
   */
  @Column({ name: 'sovereignty_note_tr', type: 'text', nullable: true })
  sovereigntyNoteTr!: string | null;

  /**
   * Yerleşme / nüfus dağılışı — kısa düzyazı not (TR). The province model already carries a
   * settlement note, so this is platform-internal parity, not a new idea. Its dalga-1 consumer
   * is Grönland (Nuuk's share, the ice-free coastal settlement pattern) and Antarktika
   * (research stations, a seasonal population).
   */
  @Column({ name: 'settlement_note_tr', type: 'text', nullable: true })
  settlementNoteTr!: string | null;

  /**
   * Ekonomi — kısa düzyazı not (TR). Mirrors the province economy note. Dalga-1 consumer:
   * Grönland (fisheries' share of goods exports).
   */
  @Column({ name: 'economy_note_tr', type: 'text', nullable: true })
  economyNoteTr!: string | null;

  /**
   * Yönetim / statü çerçevesi — kısa düzyazı not (TR).
   *
   * DISTINCT FROM `sovereigntyNoteTr` ON PURPOSE, and the distinction is load-bearing:
   * `sovereigntyNoteTr` holds the owner's binding framing for CONTESTED international
   * recognition and is not rendered on the page today; this field is an ORDINARY, RENDERED
   * page section ("Grönland'ın Yönetimi") describing how an entity is governed — the 2009
   * Self-Government Act for GL, the Antarctic Treaty System and its article IV framework for
   * AQ (DEC 2026-08-01q makes the latter mandatory, and it needs a visible home).
   *
   * The seed guard's invariant 5 is the structural companion: a non-country row may not carry
   * `independenceNoteTr`, so the "independence" heading can never reach a page it does not
   * apply to — the framing lands here instead.
   */
  @Column({ name: 'governance_note_tr', type: 'text', nullable: true })
  governanceNoteTr!: string | null;

  /**
   * Nüfus kaynağı — the institution that PUBLISHED `population`, TR + EN, in the exact
   * SENTENCE-READY form the web credit line renders (no trailing period, no "Kaynak:"
   * prefix, the English article baked into the value itself, e.g. `the World Bank`,
   * `the TRNC Statistical Institute's projection`). Institution names are, AS A RULE, never
   * translated — each locale carries the institution's own name in that language
   * (`Grønlands Statistik` / `Statistics Greenland`), not a machine translation. ONE NAMED
   * EXCEPTION (PR #98 review, CR98-M10): TR's EN value is `TÜİK (ADNKS)`, the same untranslated
   * abbreviation as the TR value — deliberately NOT rendered into an English institution name,
   * because the 81 province EN pages already publish "population from TÜİK (ADNKS)" as their
   * own credit form (`ProvinceDetail`/`Climate.sourceLine` precedent); translating it here would
   * make the one country-level TÜİK credit inconsistent with every province-level one.
   *
   * NULLABLE, and populated on exactly FIVE rows today (GL, CY, QN, TW, TR) — every other
   * row leaves both columns absent and the service resolves the corpus default ("Dünya
   * Bankası" / "the World Bank", `DEFAULT_POPULATION_SOURCE_NAME`) at read time. This
   * mirrors the `statusLabelTr/En` precedent exactly (DEC 2026-08-01m): approved credit
   * copy lives WITH the row it credits, never derived from `entityType` or any other
   * column, because the institution that published a figure is a fact about that row, not
   * a function of its shape.
   *
   * WHY NOT NOT-NULL + a stored default (the `entityType` pattern): that would force this
   * table's one `population === null` row (Antarktika) to carry a source name for a figure
   * it does not publish — the same "not applicable is not zero" class guard rule 3 already
   * protects for `population` itself. `population === null` is the ONLY reason this pair is
   * nullable; the service's `resolvePopulationSourceName` enforces "no population → no
   * source name" as the single structural promise this field makes to `cografya_web`.
   *
   * Do not cache or hardcode a resolved value client-side — this pair (or its resolved
   * service-layer form) is the single source of truth.
   */
  @Column({ name: 'population_source_name_tr', type: 'varchar', length: 120, nullable: true })
  populationSourceNameTr!: string | null;

  /** Nüfus kaynağı (EN) — same row, same rule as {@link populationSourceNameTr}. */
  @Column({ name: 'population_source_name_en', type: 'varchar', length: 120, nullable: true })
  populationSourceNameEn!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
