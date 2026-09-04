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
import type { RegionFaqItem } from '../../database/seeds/region.seed-data';

const decimalTransformer: ValueTransformer = {
  to: (value: number | null | undefined): number | null => value ?? null,
  from: (value: string | null | undefined): number | null =>
    value === null || value === undefined ? null : Number(value),
};

/**
 * Coğrafi Bölge (Geographic Region) entity representing the 7 regions of Türkiye.
 * Column names are explicitly snake_case to match the migration 1:1.
 */
@Entity('regions')
export class Region {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({
    type: 'enum',
    enum: GeographicRegion,
    enumName: GEOGRAPHIC_REGION_DB_ENUM,
    unique: true,
  })
  region!: GeographicRegion;

  @Index('IDX_regions_slug')
  @Column({ type: 'varchar', length: 50, unique: true })
  slug!: string;

  @Column({ name: 'name_tr', type: 'varchar', length: 100 })
  nameTr!: string;

  @Column({ name: 'heading_name', type: 'varchar', length: 100 })
  headingName!: string;

  @Column({ name: 'meta_title', type: 'varchar', length: 255 })
  metaTitle!: string;

  @Column({ name: 'meta_description', type: 'text' })
  metaDescription!: string;

  @Column({ type: 'varchar', length: 100 })
  h1!: string;

  @Column({ name: 'intro_tr', type: 'text' })
  introTr!: string;

  @Column({ name: 'highest_point_name', type: 'varchar', length: 100, nullable: true })
  highestPointName!: string | null;

  @Column({ name: 'highest_point_elevation_m', type: 'integer', nullable: true })
  highestPointElevationM!: number | null;

  @Column({ name: 'highest_point_province', type: 'varchar', length: 100, nullable: true })
  highestPointProvince!: string | null;

  @Column({ name: 'coastal_seas', type: 'text', array: true, default: '{}' })
  coastalSeas!: string[];

  @Column({ name: 'neighbor_regions', type: 'text', array: true, default: '{}' })
  neighborRegions!: string[];

  @Column({ name: 'neighbor_countries', type: 'text', array: true, default: '{}' })
  neighborCountries!: string[];

  @Column({ type: 'text', array: true, default: '{}' })
  subregions!: string[];

  @Column({
    name: 'gdp_share_approx_percent',
    type: 'numeric',
    precision: 5,
    scale: 2,
    nullable: true,
    transformer: decimalTransformer,
  })
  gdpShareApproxPercent!: number | null;

  @Column({ name: 'location_and_borders_tr', type: 'text' })
  locationAndBordersTr!: string;

  @Column({ name: 'landforms_tr', type: 'text' })
  landformsTr!: string;

  @Column({ name: 'climate_and_vegetation_tr', type: 'text' })
  climateAndVegetationTr!: string;

  @Column({ name: 'hydrography_tr', type: 'text' })
  hydrographyTr!: string;

  @Column({ name: 'settlement_and_population_tr', type: 'text' })
  settlementAndPopulationTr!: string;

  @Column({ name: 'economy_tr', type: 'text' })
  economyTr!: string;

  @Column({ name: 'subregions_tr', type: 'text' })
  subregionsTr!: string;

  @Column({ name: 'disaster_and_earthquake_tr', type: 'text' })
  disasterAndEarthquakeTr!: string;

  @Column({ name: 'comparison_tr', type: 'text' })
  comparisonTr!: string;

  @Column({ type: 'jsonb', default: '[]' })
  faqs!: RegionFaqItem[];

  @Column({ name: 'sources_note_tr', type: 'text' })
  sourcesNoteTr!: string;

  @Column({ type: 'text', array: true, default: '{}' })
  footnotes!: string[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
