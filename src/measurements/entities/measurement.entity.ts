import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Which geometry a `measurements` row records (UYELIK-11, `UYELIK-11-plan.md` §5.2).
 *
 * A plain `varchar` WITH a `CHECK`, a deliberate divergence from `game_rounds.mode` (plain
 * `varchar`, no `CHECK`, because the server treats `mode` as fully opaque and never branches on
 * it): this module's server genuinely branches on `type` — {@link validateMeasurementShape}
 * needs to know which minimum point count applies — so it is a closed, server-known three-value
 * set, and a `CHECK` is cheap, real defense-in-depth that does not couple this repo's release
 * cadence to anything external the way a `mode`-style `CHECK` would.
 */
export enum MeasurementType {
  Distance = 'distance',
  Area = 'area',
  Coordinate = 'coordinate',
}

/** `{lon, lat}` — see `dto/measurement-point.dto.ts`'s own docblock for the field-name contract. */
export interface MeasurementPoint {
  lon: number;
  lat: number;
}

/**
 * One row per user-saved map measurement — distance, area or coordinate (UYELIK-11,
 * `UYELIK-11-plan.md` §5.2).
 *
 * ## `user_id` is `ON DELETE CASCADE`
 * Identical reasoning to every other user-owned table in this repo: a saved measurement has no
 * meaning without its user.
 *
 * ## Only one FK, like `game_rounds` and unlike `favorites`
 * `type` and `points` are supplied by the client and resolved against no other table.
 *
 * ## `points` is `jsonb`, not a second table
 * A per-point child table would need an `ON DELETE CASCADE` join, an ordering column and a
 * second index for zero product benefit — the array is always read and written as one atomic
 * geometry, never queried into. `CHK_measurements_points_array` is a minimal, cheap structural
 * guard (non-empty JSON array); it deliberately does NOT encode the type-dependent minimum (1 for
 * coordinate, 2 for distance, 3 for area) as a `CHECK` — that cross-field rule lives in
 * {@link validateMeasurementShape} (the service layer), mirroring `game_rounds`' own explicit
 * precedent that cross-field structural validation happens BEFORE the INSERT, in the service,
 * never as a DB `CHECK` — splitting one product rule across two enforcement mechanisms is how the
 * halves drift.
 *
 * ## `title` is `varchar(200)`, nullable
 * Grounded against `book.entity.ts`'s `title_tr`/`title_en`, the repo's one existing "title"
 * column precedent, rather than an invented number.
 *
 * ## `updated_at` exists here, unlike `favorites`/`game_rounds`
 * Both of those tables explicitly state "no `updated_at`" because a row, once created, is never
 * mutated. This entity IS mutated (the title-rename `PATCH`, plan §5.6), so it follows
 * `video_progress`'s own precedent instead: a genuinely mutated row gets `@UpdateDateColumn`.
 *
 * ## No `slug_tr` / `slug_en`
 * Never public, protected, per-user, no page — outside `ENGINEERING.md` §5's slug rule's domain
 * entirely, the same reasoning every sibling table states.
 *
 * ## Index
 * `UQ_measurements_user_client_measurement` leads with `user_id`, so it already serves every
 * `WHERE user_id = ?` this module issues (list, get-one, the quota `COUNT`) — no separate
 * `IDX_measurements_user_id`. No GIN index on `points` — nothing ever queries INTO the geometry, a
 * deliberate, named YAGNI.
 */
@Entity('measurements')
@Unique('UQ_measurements_user_client_measurement', ['userId', 'clientMeasurementId'])
@Check('CHK_measurements_type', `"type" IN ('distance', 'area', 'coordinate')`)
@Check(
  'CHK_measurements_points_array',
  `jsonb_typeof("points") = 'array' AND jsonb_array_length("points") >= 1`,
)
export class Measurement {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'PK_measurements' })
  id!: string;

  /** Owning user. `ON DELETE CASCADE`: a saved measurement has no meaning without its user. */
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  /**
   * Opaque, client-generated per-measurement id (plan §5.8) — the idempotency key together with
   * `userId`. The API never generates or resolves this value; it is whatever the caller sent.
   */
  @Column({ name: 'client_measurement_id', type: 'varchar', length: 128 })
  clientMeasurementId!: string;

  @Column({ name: 'type', type: 'varchar', length: 10 })
  type!: MeasurementType;

  @Column({ name: 'points', type: 'jsonb' })
  points!: MeasurementPoint[];

  @Column({ name: 'title', type: 'varchar', length: 200, nullable: true })
  title!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
