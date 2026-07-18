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

/**
 * The ONE source identifier a climate series may carry.
 *
 * Deliberately a single-member string-literal type, NOT a TS enum and NOT a Postgres
 * enum: MGM's "Genel İstatistik" table (`k=A`) is the single series for all 81 provinces
 * (PLAN.md ruling 5), and the ERA5/Copernicus source-swap layer was cancelled outright
 * (→ DEC 2026-07-18h). A DB enum type would only add the drop/alter friction that
 * cancellation removed. Re-sourcing later costs one parser + one import run, which is
 * exactly the trade the owner accepted.
 */
export const CLIMATE_SOURCE_MGM_GENERAL = 'mgm_general';
export type ClimateSource = typeof CLIMATE_SOURCE_MGM_GENERAL;

/** Number of months in a climate series. The series length is derived from THIS, never
 * from the length of whatever the parser happened to find (PLAN.md risk #2). */
export const CLIMATE_MONTH_COUNT = 12;

/**
 * One month of a province's climate normals.
 *
 * `month` is 1-12. Every measure is nullable *per month* because MGM omits whole rows for
 * some stations — but the CORE PAIR (`tempMeanC` + `precipitationMm`) is all-or-nothing at
 * the series level: if either is incomplete across the 12 months the whole
 * `climate_normals` object is left NULL and the page section does not render
 * (PLAN.md "Eksik veri" rule, enforced by `findUnpublishableReason` and, on the write path,
 * by `assertClimateNormalsShape`). The extras
 * (sunshine, rainy days, records) degrade gracefully — the web drops a table column that is
 * null in all 12 months.
 *
 * Values are RAW numbers, never pre-formatted strings: formatting is the web repo's
 * `next-intl` `getFormatter()` concern, and a number cannot carry a locale bug across the
 * contract.
 */
export interface ClimateMonthlyNormal {
  /** 1 = Ocak … 12 = Aralık. */
  month: number;
  /** Ortalama sıcaklık (°C). Core pair — see the interface note. */
  tempMeanC: number | null;
  /** Ortalama en yüksek sıcaklık (°C). */
  tempMaxMeanC: number | null;
  /** Ortalama en düşük sıcaklık (°C). */
  tempMinMeanC: number | null;
  /** Aylık toplam yağış miktarı ortalaması (mm). Core pair — see the interface note. */
  precipitationMm: number | null;
  /** Ortalama günlük güneşlenme süresi (saat). */
  sunshineHours: number | null;
  /** Ortalama yağışlı gün sayısı. */
  rainyDays: number | null;
  /** O ay için ölçülmüş EN YÜKSEK sıcaklık (°C) — bir uç değer, ortalama değil. */
  tempRecordMaxC: number | null;
  /**
   * `tempRecordMaxC`'nin gerçekleşme tarihi — ISO `YYYY-MM-DD`.
   *
   * MGM bu tarihi hücrenin `title` attribute'ünde yayımlıyor. "41,5 °C" bir sayı,
   * "41,5 °C (Eylül 2020)" bir olaydır: rakip uç değerleri tarihsiz gösteriyor, yani bu
   * doğrudan bir information-gain farkı, ve NOVA'nın il-il yorumları için ilin kendi
   * tablosundan türetilemeyecek gerçek malzeme (→ owner ruling, 2026-07-18).
   *
   * **Değerden BAĞIMSIZ olarak nullable:** MGM bazı hücrelerde tarihi yazmamış olabilir ve
   * eksik bir tarih yüzünden ölçüm değerini düşürmek veri kaybı olur. Tersi geçerli değil —
   * değeri olmayan bir tarih anlamsızdır ve import'ta hata verir.
   */
  tempRecordMaxDate: string | null;
  /** O ay için ölçülmüş EN DÜŞÜK sıcaklık (°C) — bir uç değer, ortalama değil. */
  tempRecordMinC: number | null;
  /** `tempRecordMinC`'nin gerçekleşme tarihi — ISO `YYYY-MM-DD`. Bkz. `tempRecordMaxDate`. */
  tempRecordMinDate: string | null;
}

/**
 * A single dated all-time record (MGM's second `k=A` table).
 *
 * `date` is an ISO `YYYY-MM-DD` string, normalized from MGM's `DD.MM.YYYY`. Stored as a
 * string rather than a `Date` because this object lives inside a `jsonb` column: a `Date`
 * would round-trip through JSON as an ISO *timestamp* and invent a time-of-day and a
 * timezone that the source never stated.
 *
 * `date` is **nullable independently of `value`**: a record whose date MGM did not print is
 * still a real record, and dropping the value over a missing date would be data loss. The
 * reverse is rejected at import — a date with no value is meaningless.
 */
export interface ClimateExtremeRecord {
  value: number;
  date: string | null;
}

/**
 * All-time records for a province. Each member is independently nullable — MGM leaves the
 * cell blank where a station has no such record (e.g. no measurable snow).
 */
export interface ClimateRecords {
  /** Günlük toplam en yüksek yağış miktarı (mm). */
  dailyMaxPrecipitationMm: ClimateExtremeRecord | null;
  /** Günlük en hızlı rüzgâr (m/sn). */
  fastestWindMs: ClimateExtremeRecord | null;
  /** En yüksek kar yüksekliği (cm). */
  maxSnowDepthCm: ClimateExtremeRecord | null;
}

/**
 * A province's full climate normals — the shape stored in `provinces.climate_normals`
 * (`jsonb`) and, from PR A2, mirrored by `ClimateDto` on the public contract.
 *
 * `periodStartYear`/`periodEndYear` are MANDATORY and are parsed FROM THE PAGE, never
 * assumed: MGM's measurement period differs per province (Mersin 1929, İstanbul 1950,
 * Ardahan 1958, Hakkâri 1961 — PLAN.md trap T2). A page that printed a single fixed
 * "1929-2025" would be stating something false for 80 of the 81 provinces.
 *
 * `sourceUrl` is per-province and REQUIRED: MGM's key is not the Turkish name
 * (Mersin → `ICEL`), so the link cannot be reconstructed from the province name at render
 * time without re-implementing that mapping in the web repo.
 *
 * NOT stored here: the annual mean/total. MGM's own "Yıllık" column is EMPTY in the HTML
 * (trap T1) — every annual figure we show is OUR derivation and may not be attributed to
 * MGM. Derivations are computed in `climate-derivations.ts` at serialization time (PR A2),
 * never persisted, so they cannot go stale against the months they are derived from.
 */
export interface ClimateNormals {
  source: ClimateSource;
  /** The exact MGM page this series was read from. */
  sourceUrl: string;
  /** Ölçüm periyodu — parsed per province from the page, never a constant. */
  periodStartYear: number;
  periodEndYear: number;
  /** Exactly `CLIMATE_MONTH_COUNT` entries, months 1-12 in ascending order. */
  months: ClimateMonthlyNormal[];
  records: ClimateRecords;
}
