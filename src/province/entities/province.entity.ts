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

  /** Öne çıkan yer şekilleri / jeoloji notu — short free text (TR). */
  @Column({ name: 'landform_note_tr', type: 'text', nullable: true })
  landformNoteTr!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
