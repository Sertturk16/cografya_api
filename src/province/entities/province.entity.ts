import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  type ValueTransformer,
} from 'typeorm';
import { GEOGRAPHIC_REGION_DB_ENUM, GeographicRegion } from '../../common/geographic-region.enum';
import type { ClimateNormals, EconomyIndicator, HydrographyFeature } from '../province.types';

/**
 * Postgres `numeric`/`decimal` values come back from the driver as strings (to
 * preserve arbitrary precision). Coordinates are small, fixed-scale values, so
 * we transform them to `number` on read and pass through on write. `null` is
 * preserved both ways.
 */
const decimalTransformer: ValueTransformer = {
  to: (value: number | null | undefined): number | null => value ?? null,
  from: (value: string | null | undefined): number | null =>
    value === null || value === undefined ? null : Number(value),
};

/**
 * İl (province) — the single Faz-1 content unit (81 il detay sayfası, K1).
 *
 * Field set follows NOVA's il-level data dictionary (Bölüm 1). Column names are
 * explicit snake_case so the hand-written migration maps 1:1 to the entity
 * (this repo runs migrations, never `synchronize`).
 *
 * Nullability is deliberate: only the *structural identity/routing* fields
 * (plate code, name, both slugs, region) are NOT NULL — they are known for all
 * 81 provinces up front. Every *research-derived* field (population, area,
 * climate, coordinates, landform, …) is NULLABLE, because the content pipeline
 * (SPEC.md Bölüm D) fills them progressively AFTER an independent fact-check.
 * We never force a placeholder to satisfy a NOT NULL constraint — an
 * unverified fact must stay absent, not be invented. A province row can exist
 * (a routable page) before every data point is verified.
 *
 * NOTE: centroid / bounding-box are intentionally NOT stored here. Per the data
 * dictionary (field #9) they are derived from the boundary GeoJSON at build/seed
 * time, not hand-researched values. Only the il-merkezi point coordinate (a real
 * researched datum, field #8) lives on the entity as latitude/longitude.
 */
@Entity('provinces')
export class Province {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /**
   * Plaka kodu — stable, unique, never changes (e.g. "34").
   *
   * SEED DISCIPLINE: always ZERO-PAD to 2 chars ("01"…"09", never "1"…"9").
   * This is a string column, so `ORDER BY plate_code` sorts lexically — an
   * unpadded "1" would sort after "09" and scramble plate order. The
   * `db:seed:geography` seed MUST emit padded codes for all 81 provinces.
   */
  @Column({ name: 'plate_code', type: 'varchar', length: 2, unique: true })
  plateCode!: string;

  /** İl adı (TR). */
  @Column({ name: 'name_tr', type: 'varchar', length: 100 })
  nameTr!: string;

  /** Localized slugs (CONVENTIONS §3) — the web repo's TR/EN routing keys. */
  @Column({ name: 'slug_tr', type: 'varchar', length: 120, unique: true })
  slugTr!: string;

  @Column({ name: 'slug_en', type: 'varchar', length: 120, unique: true })
  slugEn!: string;

  /** Coğrafi bölge (7 bölge). */
  @Index()
  @Column({
    name: 'region',
    type: 'enum',
    enum: GeographicRegion,
    enumName: GEOGRAPHIC_REGION_DB_ENUM,
  })
  region!: GeographicRegion;

  /** Nüfus (TÜİK ADNKS) + referans yılı. */
  @Column({ name: 'population', type: 'integer', nullable: true })
  population!: number | null;

  @Column({ name: 'population_year', type: 'smallint', nullable: true })
  populationYear!: number | null;

  /** Yüzölçümü (km², HGM) — whole km². */
  @Column({ name: 'area_km2', type: 'integer', nullable: true })
  areaKm2!: number | null;

  /** İlçe sayısı. */
  @Column({ name: 'district_count', type: 'smallint', nullable: true })
  districtCount!: number | null;

  /** İl merkezi rakımı (m). */
  @Column({ name: 'elevation_m', type: 'integer', nullable: true })
  elevationM!: number | null;

  /** İl merkezi koordinatı (nokta) — decimal degrees. */
  @Column({
    name: 'latitude',
    type: 'numeric',
    precision: 9,
    scale: 6,
    nullable: true,
    transformer: decimalTransformer,
  })
  latitude!: number | null;

  @Column({
    name: 'longitude',
    type: 'numeric',
    precision: 9,
    scale: 6,
    nullable: true,
    transformer: decimalTransformer,
  })
  longitude!: number | null;

  /**
   * Komşu iller — stored as neighbour plaka codes (stable, unambiguous keys).
   * The web hub-and-spoke resolves these to slugs from the full province list.
   */
  @Column({
    name: 'neighbor_plate_codes',
    type: 'varchar',
    length: 2,
    array: true,
    default: () => "'{}'",
  })
  neighborPlateCodes!: string[];

  /** İklim sınıflandırması — Köppen short code (e.g. "Csa"). */
  @Column({ name: 'climate_koppen', type: 'varchar', length: 8, nullable: true })
  climateKoppen!: string | null;

  /** MGM'nin Türkçe iklim sınıf adı (e.g. "Akdeniz iklimi"). */
  @Column({ name: 'climate_class_tr', type: 'varchar', length: 80, nullable: true })
  climateClassTr!: string | null;

  /**
   * MGM'nin Köppen değeriyle ZORUNLU olarak birlikte sunulan metodolojik uyarı
   * notu (il-data-dictionary §2.1). MGM'nin kendi 2023 raporu, basitleştirilmiş
   * üçüncü-harf kuralının Türkiye istasyonlarının ~%65'ini "Cs" (Akdeniz-tipi)
   * çıkardığını ve İç/Doğu Anadolu gibi bölgelerde ayırt ediciliğinin sınırlı
   * kaldığını itiraf eder. Bu yüzden "Csa" hiçbir il sayfasında bu not olmadan
   * TEK BAŞINA yayınlanmamalı — not, değere eşlik eden bir veri alanıdır (bare
   * bir Köppen kodu, özellikle Ankara/Van için, yaygın müfredat bilgisiyle
   * çelişen bağlamsız bir cümle üretir).
   */
  @Column({ name: 'climate_note_tr', type: 'text', nullable: true })
  climateNoteTr!: string | null;

  /**
   * İklim normalleri — 12 aylık seri + kaynak + normal penceresi (ERA5-Land 1991-2020).
   *
   * `jsonb` on the province row, NOT a child table (PLAN.md §1, a deliberate reversal of
   * `SPEC-veri.md` §3.1). Two reasons carry it:
   *   1. **`dateModified` / sitemap `lastmod` stay correct for free.** Writing the climate
   *      series onto the province row trips the existing `@UpdateDateColumn`. A child table
   *      would NOT trip it, so every climate refresh would leave the page's advertised
   *      modification date silently stale — a defect the child table would have *introduced*.
   *   2. A single source series per province removed the multiplicity that justified a
   *      child table at all: what remains is one fixed-shape object per province, exactly
   *      the shape `hydrographyFeatures` already occupies.
   *
   * **The column type never changed across the source swap**, which is the whole payoff of
   * choosing `jsonb`: moving from MGM's `k=A` table to ERA5-Land narrowed the DOCUMENT inside
   * this column (11 monthly fields → 3, the records block dropped) with zero DDL and therefore
   * zero migration (→ DEC 2026-08-04c). Postgres does not see a jsonb document's internal shape;
   * the assertion layer below is what does.
   *
   * The honest cost is the loss of DB-level `CHECK (month BETWEEN 1 AND 12)` and a unique
   * key. Three auditable layers pay it back: the shared `ClimateNormals` interface (the
   * entity column and the DTO cannot drift), the loud import-time assertions in
   * `climate-normals.assertions.ts` + `era5-load-assertions.ts` (a malformed series aborts the
   * import instead of publishing), and the served-payload invariants in the e2e suite.
   *
   * NULL means "no publishable series" — the web renders no climate section at all. The
   * kill-switch is one statement: `UPDATE provinces SET climate_normals = NULL`.
   */
  @Column({ name: 'climate_normals', type: 'jsonb', nullable: true })
  climateNormals!: ClimateNormals | null;

  /**
   * NOVA'nın il-il yazdığı iklim yorumu (TR) — mekanizma anlatan gerçek düzyazı
   * (karasallık, orografi, yağış gölgesi, denizel yumuşatma), tabloyu tekrar eden bir
   * özet DEĞİL (PLAN.md §3, doorway-content kapısı 1).
   *
   * This is NOT a reuse of `climateNoteTr`: that column holds the locked MGM Köppen
   * methodology caveat and must stay exactly as it is. Null for months while the content
   * waves run — the column ships now so that ten content waves need zero further
   * migrations. Null renders no prose block; the chart still renders.
   */
  @Column({ name: 'climate_narrative_tr', type: 'text', nullable: true })
  climateNarrativeTr!: string | null;

  /** Öne çıkan yer şekilleri / jeoloji notu — short free text (TR). */
  @Column({ name: 'landform_note_tr', type: 'text', nullable: true })
  landformNoteTr!: string | null;

  /**
   * Yazılı açılış cümlesi (il detay sayfası girişi) — replaces the old templated
   * "{name}, {region} Bölgesi'nde yer alan bir ildir" i18n copula (SPEC §3.3). A
   * real per-il opening; null until authored, and the web composes a data-driven
   * fallback sentence in that case (a frontend concern).
   */
  @Column({ name: 'intro_tr', type: 'text', nullable: true })
  introTr!: string | null;

  /** Hidrografya — kısa düzyazı not (nehir/göl/baraj anlatısı, TR). */
  @Column({ name: 'hydrography_note_tr', type: 'text', nullable: true })
  hydrographyNoteTr!: string | null;

  /**
   * Hidrografya — yapısal özellik listesi (baraj/nehir/göl). Stored as `jsonb`:
   * a small, always-fetched-with-the-province, never-queried authored list — a
   * separate table would be over-normalization (CLAUDE §2 "keep it as simple as
   * the data allows"). NULL = not yet researched; `[]` would be a deliberate
   * "no notable feature" statement — the two are kept distinguishable, so this is
   * nullable with no default (unlike `neighborPlateCodes`).
   */
  @Column({ name: 'hydrography_features', type: 'jsonb', nullable: true })
  hydrographyFeatures!: HydrographyFeature[] | null;

  /** Şehirleşme oranı (%) — TÜİK ADNKS (il/ilçe merkezi nüfusu / toplam). */
  @Column({
    name: 'urbanization_rate',
    type: 'numeric',
    precision: 5,
    scale: 2,
    nullable: true,
    transformer: decimalTransformer,
  })
  urbanizationRate!: number | null;

  /** Net göç hızı (‰) — TÜİK Göç İstatistikleri; signed (net göç ± olabilir). */
  @Column({
    name: 'net_migration_rate',
    type: 'numeric',
    precision: 5,
    scale: 2,
    nullable: true,
    transformer: decimalTransformer,
  })
  netMigrationRate!: number | null;

  /** Nüfus ve yerleşme — kısa düzyazı not (TR). */
  @Column({ name: 'settlement_note_tr', type: 'text', nullable: true })
  settlementNoteTr!: string | null;

  /**
   * Ekonomik coğrafya — TEK, TÜİK-çıpalı yapısal istatistik (serbest metin DEĞİL;
   * CONVENTIONS §4 / NOVA content-research §1.4). `jsonb`, whole object null until
   * a verified stat fills it.
   */
  @Column({ name: 'economy_indicator', type: 'jsonb', nullable: true })
  economyIndicator!: EconomyIndicator | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
