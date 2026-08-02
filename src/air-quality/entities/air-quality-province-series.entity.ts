import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  type ValueTransformer,
} from 'typeorm';
import { Province } from '../../province/entities/province.entity';
import {
  AirQualityRun,
  type AirQualityStoredConcentrations,
  type AirQualityStoredSupport,
} from './air-quality-run.entity';

/** `numeric` arrives from the driver as a string and is served as a number. */
const decimalTransformer: ValueTransformer = {
  to: (value: number | null | undefined): number | null => value ?? null,
  from: (value: string | null | undefined): number | null =>
    value === null || value === undefined ? null : Number(value),
};

/**
 * The SINGLE rounding authority for the two `numeric(9,6)` grid-coordinate columns.
 *
 * The decoder yields raw float32 axis values (`Math.fround(40.95)` = `40.95000076293945`),
 * while the column keeps 6 decimals — so a value compared across the write→read round trip
 * MUST pass through one shared rounding, or the analysis grid-identity guard refuses every
 * real run: the probe's 81 committed cells produced 76/81 spurious mismatches against a strict
 * `!==` (review #80 C2, empirically validated). Applying it in the `to:` transformer means
 * Postgres never rounds anything itself; what the guard reads back is exactly what this
 * function returns, and the guard applies the same function to the freshly decoded side.
 *
 * Idempotent by construction, so re-rounding a stored value is a no-op.
 */
export function toStoredDegrees(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

/** `decimalTransformer` + {@link toStoredDegrees} on the way IN — grid coordinates only. */
const degreesTransformer: ValueTransformer = {
  to: (value: number | null | undefined): number | null =>
    value === null || value === undefined ? null : toStoredDegrees(value),
  from: (value: string | null | undefined): number | null =>
    value === null || value === undefined ? null : Number(value),
};

/**
 * One province's RAW concentrations for one run — the store the A2b read path compiles the
 * public DTOs from.
 *
 * ## The two products live in SEPARATE columns, and that is the honesty mechanism
 * `concentrations` / `support` hold the FORECAST product (run hour 0 … +forecastHours).
 * `analysis_concentrations` / `analysis_support` hold the D−1 ANALYSIS product (24 hours), or
 * NULL when there is none. They are never merged in storage (plan SAPMA 8).
 *
 * Merging them into one array would make "a forecast step labelled as analysis" a one-line
 * coding mistake. Kept apart, that mislabelling is not a bug you can write — it needs a schema
 * change. DEC 2026-08-02b's ban ("never call a forecast hour an analysis") is therefore
 * enforced by the table, not by a reviewer's attention. The second benefit is operational: the
 * analysis write never rewrites the forecast arrays, so there is no partial-write window in
 * which a served row could hold half of each.
 *
 * ## Both products are MODEL OUTPUT
 * The analysis half is not observation. It is the provider's re-analysis of past hours, and the
 * published contract says so in as many words. Nothing in this table is a measurement.
 *
 * ## RAW µg/m³ is stored; the EAQI band is NOT
 * The index is derived at READ time (`computeEaqi`), so a band-table revision takes effect
 * without re-ingesting and can never contaminate the stored evidence.
 */
@Entity('air_quality_province_series')
export class AirQualityProvinceSeries {
  @PrimaryColumn({ name: 'run_utc', type: 'timestamptz' })
  runUtc!: Date;

  @PrimaryColumn({ name: 'province_id', type: 'uuid' })
  provinceId!: string;

  /**
   * FK to the run, CASCADE on delete: retention pruning removes the run row and its 81 series
   * rows together — the two can never disagree about which runs exist.
   */
  @ManyToOne(() => AirQualityRun, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'run_utc' })
  run!: AirQualityRun;

  /** FK to the province, CASCADE: a province dropped from the seed takes its series along. */
  @ManyToOne(() => Province, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'province_id' })
  province!: Province;

  /** The grid-cell centre actually read — evidence, and the analysis-identity guard's input. */
  @Column({
    name: 'grid_latitude',
    type: 'numeric',
    precision: 9,
    scale: 6,
    transformer: degreesTransformer,
  })
  gridLatitude!: number;

  @Column({
    name: 'grid_longitude',
    type: 'numeric',
    precision: 9,
    scale: 6,
    transformer: degreesTransformer,
  })
  gridLongitude!: number;

  /** Offset from the province's reference point to that cell centre, km. */
  @Column({
    name: 'distance_km',
    type: 'numeric',
    precision: 8,
    scale: 4,
    transformer: decimalTransformer,
  })
  distanceKm!: number;

  /** FORECAST product: raw µg/m³ per pollutant, `forecastHours + 1` values each. */
  @Column({ name: 'concentrations', type: 'jsonb' })
  concentrations!: AirQualityStoredConcentrations;

  /** FORECAST product: the structural per-pollutant verdict for THIS run. */
  @Column({ name: 'support', type: 'jsonb' })
  support!: AirQualityStoredSupport;

  /** ANALYSIS product (D−1), or null while the run has none. Same shape, 24 values each. */
  @Column({ name: 'analysis_concentrations', type: 'jsonb', nullable: true })
  analysisConcentrations!: AirQualityStoredConcentrations | null;

  /** ANALYSIS product's own verdict. Null exactly when `analysis_concentrations` is null. */
  @Column({ name: 'analysis_support', type: 'jsonb', nullable: true })
  analysisSupport!: AirQualityStoredSupport | null;

  @Column({ name: 'ingested_at', type: 'timestamptz' })
  ingestedAt!: Date;
}
