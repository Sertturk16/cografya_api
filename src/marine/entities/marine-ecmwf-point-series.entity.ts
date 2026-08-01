import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  type ValueTransformer,
} from 'typeorm';
import type { EcmwfFieldSupport } from '../ecmwf/ecmwf-support';
import { MarineEcmwfCycle } from './marine-ecmwf-cycle.entity';
import { MarinePoint } from './marine-point.entity';

/** Same shape as `MarinePoint`'s transformer: `numeric` arrives as a string, is served as number. */
const decimalTransformer: ValueTransformer = {
  to: (value: number | null | undefined): number | null => value ?? null,
  from: (value: string | null | undefined): number | null =>
    value === null || value === undefined ? null : Number(value),
};

/**
 * The RAW per-step samples of one (cycle, point) pair — the store the ECMWF read path compiles
 * `MarineSeriesDto` from (yeni-M3 SPEC §9.1).
 *
 * ## Parallel arrays keyed by `steps`, merged as steps arrive
 * The ingest processes steps in priority order (nearest-to-now first, then ascending), so a row
 * grows out of order. `values.steps` records WHICH forecast hours are present; every field array
 * is exactly `steps.length` long and index-aligned to it. That distinction — "step not ingested
 * yet" (absent from `steps`) versus "step ingested and the model has nothing there" (`null` at
 * its index) — is the partial-cycle honesty rule: an absent step must never be published as a
 * gap, and a gap must never be silently skipped.
 *
 * ## RAW `u10`/`v10` are stored; derived speed/direction are NOT (SPEC §9.1)
 * The record is what the provider produced. Speed and bearing are derived at READ time by the
 * one regression-tested function pair in `ecmwf-wind.ts`, so a derivation bug can be fixed
 * without re-ingesting — and can never contaminate the stored evidence.
 *
 * ## `support` is recomputed from THIS cycle's own samples
 * Field-level classification (`ok` / `not_supported`) follows §7.3: all-steps-missing means the
 * model does not carry the field in this cell (land mask), some-missing means per-step nulls.
 * It is stored per row because it is cycle-scoped evidence — the mask can move between cycles —
 * and M4's per-field status mapping reads it directly.
 */
@Entity('marine_ecmwf_point_series')
export class MarineEcmwfPointSeries {
  @PrimaryColumn({ name: 'cycle_utc', type: 'timestamptz' })
  cycleUtc!: Date;

  @PrimaryColumn({ name: 'marine_point_id', type: 'uuid' })
  marinePointId!: string;

  /**
   * FK to the cycle ledger, CASCADE on delete: retention pruning deletes the cycle row and the
   * ~30 series rows follow — the two can never disagree about which cycles exist.
   */
  @ManyToOne(() => MarineEcmwfCycle, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'cycle_utc' })
  cycle!: MarineEcmwfCycle;

  /** FK to the reference point, CASCADE: a point retired by the M1 load takes its series along. */
  @ManyToOne(() => MarinePoint, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'marine_point_id' })
  point!: MarinePoint;

  /** Centre of the 0.25° cell the point maps into (grid axis starts at 180° — measured S1). */
  @Column({
    name: 'grid_latitude',
    type: 'numeric',
    precision: 9,
    scale: 6,
    transformer: decimalTransformer,
  })
  gridLatitude!: number;

  @Column({
    name: 'grid_longitude',
    type: 'numeric',
    precision: 9,
    scale: 6,
    transformer: decimalTransformer,
  })
  gridLongitude!: number;

  /** In-cell offset, km — bounded by half a cell diagonal, or our arithmetic is wrong. */
  @Column({
    name: 'distance_km',
    type: 'numeric',
    precision: 8,
    scale: 4,
    transformer: decimalTransformer,
  })
  distanceKm!: number;

  /** Raw samples, parallel to `steps`. See the class docblock. */
  @Column({ name: 'values', type: 'jsonb' })
  values!: EcmwfStoredSeries;

  /** Per-field §7.3 verdict derived from `values` — stored so M4 reads it, recomputed per write. */
  @Column({ name: 'support', type: 'jsonb' })
  support!: EcmwfStoredSupport;

  /** Last time a step was merged into this row. */
  @Column({ name: 'ingested_at', type: 'timestamptz' })
  ingestedAt!: Date;
}

/** The jsonb payload of `values`: forecast hours present, plus index-aligned raw sample arrays. */
export interface EcmwfStoredSeries {
  /** Forecast hours ingested so far, ascending, unique. Length of every array below. */
  readonly steps: number[];
  readonly u10: (number | null)[];
  readonly v10: (number | null)[];
  readonly swh: (number | null)[];
  readonly mwd: (number | null)[];
}

/** The jsonb payload of `support`. */
export interface EcmwfStoredSupport {
  readonly u10: EcmwfFieldSupport;
  readonly v10: EcmwfFieldSupport;
  readonly swh: EcmwfFieldSupport;
  readonly mwd: EcmwfFieldSupport;
}
