import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
  type ValueTransformer,
} from 'typeorm';
import { MARINE_SEA_BASIN_DB_ENUM, SeaBasin } from '../marine.types';

/**
 * Postgres `numeric` comes back from the driver as a string (arbitrary precision). Coordinates
 * are small, fixed-scale values, so they are converted to `number` on read and passed through
 * on write — identical to `Province.latitude` (one transformer shape per repo, not two).
 */
const decimalTransformer: ValueTransformer = {
  to: (value: number | null | undefined): number | null => value ?? null,
  from: (value: string | null | undefined): number | null =>
    value === null || value === undefined ? null : Number(value),
};

/**
 * A marine reference point — an OFFSHORE coordinate we publish sea conditions for.
 *
 * ## This table is the ONLY thing the marine feature persists
 * Forecast VALUES are never written to Postgres (SPEC v1 §5.1). They change hourly and are
 * retro-corrected, so storing them would mean a permanently-writing scheduled job, a fake
 * `dateModified`/sitemap `lastmod` bump on every refresh, and a huge series nobody reads.
 * Climate normals are permanent data; a forecast is not — copying that pattern would be wrong.
 *
 * ## Why a point, and not "the province's sea temperature"
 * The rows are hand-chosen coordinates in OPEN water, deliberately outside straits and narrow
 * gulfs. Measured on 2026-07-26 (SPEC v1 §3.4): in the Bosphorus the two providers disagreed
 * by 3.2 °C, because no regional model resolves a narrow two-layer-flow channel — while
 * offshore they agree within ~1.5 °C. A "İstanbul sea temperature" number would therefore be
 * a number we cannot stand behind. What we publish is "the İstanbul – Marmara offshore
 * reference point", and the user-facing wording is bound to that (SPEC-ADDENDUM §4.3).
 *
 * ## The two-sea rule, which is the whole reason for the composite unique key
 * `province_plate_code` is INDEXED BUT NOT UNIQUE: İstanbul (Black Sea + Marmara), Çanakkale
 * (Aegean + Marmara) and Balıkesir (Aegean + Marmara) each carry two rows, and those two rows
 * legitimately disagree — the Black Sea and the Marmara can differ by 3–4 °C on the same day.
 * `UNIQUE (province_plate_code, sea_basin)` keeps the door open for exactly that while still
 * refusing an accidental duplicate: without ANY unique key, a point seeded twice would become
 * invisible rather than loud.
 *
 * Public entity → carries `slug_tr` + `slug_en` (repo playbook §5); the web repo's localized
 * routing depends on both, and both are populated even while the EN surface may ship
 * `noindex` (SPEC-ADDENDUM §7.11) — otherwise flipping that flag would need a migration.
 */
@Entity('marine_points')
@Unique('UQ_marine_points_province_basin', ['provincePlateCode', 'seaBasin'])
export class MarinePoint {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Localized slugs — the web repo's TR/EN routing keys (e.g. `istanbul-marmara-aciklari`). */
  @Column({ name: 'slug_tr', type: 'varchar', length: 120, unique: true })
  slugTr!: string;

  @Column({ name: 'slug_en', type: 'varchar', length: 120, unique: true })
  slugEn!: string;

  /**
   * STANDALONE full name — "İstanbul – Marmara Açıkları".
   *
   * Used on the `/deniz` hub, where the point stands on its own with no province context
   * around it. Distinct from {@link coastLabelTr}; see that field for why both exist.
   */
  @Column({ name: 'name_tr', type: 'varchar', length: 120 })
  nameTr!: string;

  @Column({ name: 'name_en', type: 'varchar', length: 120 })
  nameEn!: string;

  /**
   * PROVINCE-RELATIVE short label — "Marmara açıkları".
   *
   * Used inside `/turkiye/{il}`, where the province name is already in the heading and
   * repeating it is noise. A second `coast_segment` enum was deliberately NOT added: for 31
   * points it would have overlapped `sea_basin` almost exactly, and the real consumer of "which
   * stretch of coast is this" is DISPLAY, which this string already serves.
   */
  @Column({ name: 'coast_label_tr', type: 'varchar', length: 80 })
  coastLabelTr!: string;

  @Column({ name: 'coast_label_en', type: 'varchar', length: 80 })
  coastLabelEn!: string;

  /**
   * Plaka kodu of the province this point is published under — the same join-by-plate pattern
   * `Province.neighborPlateCodes` uses, not an FK. Zero-padded to 2 chars, like
   * `provinces.plate_code`.
   *
   * NOT unique on its own: see the class docblock.
   */
  @Index('IDX_marine_points_province_plate_code')
  @Column({ name: 'province_plate_code', type: 'varchar', length: 2 })
  provincePlateCode!: string;

  /**
   * The basin THIS POINT sits in — a machine field, not a label.
   *
   * It selects the CMEMS dataset (verified 2026-07-29/30: Marmara temperature comes from
   * `cmems_mod_blk_phy-tem_anfc_mrm-500m_PT1H-i_202311`, Black Sea temperature from
   * `cmems_mod_blk_phy-temp_anfc_2.5km_PT1H-m_202511` — different datasets inside the same
   * product), and it is the key the probe's basin assertions check against.
   */
  // Not indexed: a 4-value enum on a 30-row table with no query filtering on it (see the
  // migration for the full reasoning).
  @Column({
    name: 'sea_basin',
    type: 'enum',
    enum: SeaBasin,
    enumName: MARINE_SEA_BASIN_DB_ENUM,
  })
  seaBasin!: SeaBasin;

  /**
   * The requested coordinate, in decimal degrees — hand-chosen and probe-verified.
   *
   * NOT the model's grid centre: that is resolved live per provider and served as
   * `gridLatitude`/`gridLongitude` on the value payload, because it differs per dataset and
   * per resolution (500 m vs 2.5 km vs 4.2 km) and would go stale the moment a provider
   * re-grids. `numeric(9,6)` matches `provinces.latitude`.
   */
  @Column({
    name: 'latitude',
    type: 'numeric',
    precision: 9,
    scale: 6,
    transformer: decimalTransformer,
  })
  latitude!: number;

  @Column({
    name: 'longitude',
    type: 'numeric',
    precision: 9,
    scale: 6,
    transformer: decimalTransformer,
  })
  longitude!: number;

  /**
   * Presentation order on the `/deniz` hub. Assigned in the candidate list as a coastal
   * traverse (Black Sea west→east, then Marmara, Aegean, Mediterranean) so the hub reads like
   * a trip around the coast rather than an alphabetical shuffle.
   */
  @Column({ name: 'display_order', type: 'integer' })
  displayOrder!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
